import { ref, computed, watch } from 'vue'
import { tokenize } from './parse'
import { resolvePath, promptDir, titleDir } from './path'
import { wordAt, insertion, normalize, commonPrefix } from './complete'

const LAST_LOGIN_KEY = 'terminal:last-login'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n) => String(n).padStart(2, '0')

// Same format zsh/login uses on macOS: "Mon Oct 26 19:16:02"
function formatLoginDate(date) {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join(':')
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${pad(date.getDate())} ${time}`
}

function readLastLogin() {
  const now = new Date()
  let previous = now
  try {
    const stored = localStorage.getItem(LAST_LOGIN_KEY)
    if (stored) previous = new Date(Number(stored))
    localStorage.setItem(LAST_LOGIN_KEY, String(now.getTime()))
  } catch {
    // storage unavailable (private mode etc.) — fall back to "now"
  }
  return previous
}

// Command registry by name, from an array of commands or a { name: command } map
function registry(commands) {
  const list = Array.isArray(commands) ? commands : Object.values(commands ?? {})
  return Object.fromEntries(list.map((command) => [command.name, command]))
}

const getter = (value, fallback) => (typeof value === 'function' ? value : () => value ?? fallback)

/** @typedef {import('./command').Command} Command */

/**
 * Terminal session state: scrollback, input line, history, working directory,
 * and the command runner (parse → look up in the registry → run with a context).
 *
 * @param {object} [options]
 * @param {Command[] | Record<string, Command> | (() => Command[] | Record<string, Command>)} [options.commands]
 * @param {object | (() => object)} [options.context]  Extra fields for every command's
 *        context (e.g. `{ api }`); the built-in fields take precedence
 * @param {string} [options.user='guest']
 * @param {string} [options.host='MacBook-Pro']
 * @param {string} [options.home='/Users/<user>']
 * @param {string} [options.tty='ttys000']
 * @param {boolean} [options.lastLogin=true]  Print "Last login: …" on start
 * @param {() => number} [options.getCols]  Terminal width in columns
 */
export function useTerminal(options = {}) {
  const user = options.user ?? 'guest'
  const host = options.host ?? 'MacBook-Pro'
  const tty = options.tty ?? 'ttys000'
  const home = options.home ?? `/Users/${user}`
  const getCommands = getter(options.commands, [])
  const getContext = getter(options.context, {})
  // Terminal width for column output; a getter so it follows window resizes
  const getCols = options.getCols ?? (() => 80)

  let nextId = 0
  const lines = ref([])
  const input = ref('')
  const cwd = ref(home)
  const env = { HOME: home, USER: user, OLDPWD: home }
  const busy = ref(false)
  const status = ref(0)
  // Open pager (alternate screen): { id, lines, title, close }
  const pager = ref(null)
  let pagerId = 0
  // Command line of the running command (argv joined, as ps shows it)
  const job = ref(null)

  // Terminal.app's title: "<dir> — <foreground process> — cols×rows". The process is
  // -zsh at the prompt, the command line while it runs, and "less ◂ man ls" while
  // a command shows its output in the pager (less is the child of the command).
  const foreground = computed(() => {
    if (!busy.value || !job.value) return '-zsh'
    return pager.value ? `less ◂ ${job.value}` : job.value
  })
  const titleDirectory = computed(() => titleDir(cwd.value))

  // zsh default on macOS: '%n@%m %1~ %# '
  const prompt = computed(() => `${user}@${host} ${promptDir(cwd.value, home)} % `)

  const history = []
  let historyIndex = 0
  let draft = ''
  let controller = null

  const push = (line) => lines.value.push({ id: nextId++, ...line })

  // Terminal bell: counts rings, so the window can flash the screen or report it
  // (watch it). Rung by BEL (\a) in output, by commands (ctx.bell), and by
  // the line editor where zsh beeps: no completion, an ambiguous one, history ends.
  const bellCount = ref(0)
  const bell = () => {
    bellCount.value++
  }

  const print = (text = '') => {
    text = String(text)
    if (text.includes('\x07')) {
      bell()
      text = text.replaceAll('\x07', '')
      // a bare bell prints nothing
      if (!text) return
    }
    for (const row of String(text).split('\n')) push({ text: row })
  }

  // Styled output: each line is an array of { text, bold?, underline? }
  const printStyled = (rows) => {
    for (const segments of rows) push({ segments })
  }

  // Lines before this index are scrollback; the visible "screen" starts here.
  const screenStart = ref(0)

  // clear(1) / Ctrl+L: blank the screen, prompt to the top. Like Terminal.app,
  // earlier output stays in the scrollback (scroll up to see it).
  const clear = () => {
    completions.value = null
    screenStart.value = lines.value.length
  }

  // Tab completion, zsh-style: a unique match is inserted with its suffix; several
  // extend the word to their common prefix, or else are listed below the prompt;
  // Tab again on the list cycles through them (zsh's auto_menu).
  // Shown list (displays), cleared by any other edit of the line
  const completions = ref(null)
  let cycle = null
  let completing = null
  // the line as completion last left it; any other value means the user edited it
  let ownLine = null

  watch(input, (value) => {
    if (value === ownLine) return
    completions.value = null
    cycle = null
  })

  const setLine = (line) => {
    ownLine = line
    input.value = line
  }

  async function candidatesFor(words, word, signal) {
    const commands = registry(getCommands())
    // the first word is a command name
    if (!words.length) return normalize(Object.keys(commands))
    const command = Object.hasOwn(commands, words[0]) ? commands[words[0]] : null
    if (!command?.complete) return []
    return normalize(
      await command.complete({
        ...getContext(),
        name: words[0],
        args: words.slice(1),
        word,
        cwd: cwd.value,
        home,
        user,
        env: { ...env },
        commands,
        resolve: (path) => resolvePath(path, cwd.value, home),
        signal,
      }),
    )
  }

  /**
   * Complete the word before `caret` in the input line. Resolves to the new
   * caret position, or null when nothing changed.
   */
  async function complete(caret) {
    if (busy.value) return null
    const line = input.value

    // zsh's insert-tab: with nothing but blanks before the caret, Tab is a tab
    if (!line.slice(0, caret).trim()) {
      input.value = `${line.slice(0, caret)}\t${line.slice(caret)}`
      return caret + 1
    }

    if (cycle && line === cycle.line && caret === cycle.caret) {
      cycle.index = (cycle.index + 1) % cycle.matches.length
      const text = insertion(cycle.matches[cycle.index], cycle.quote, false)
      cycle.line = cycle.base.slice(0, cycle.start) + text + cycle.base.slice(cycle.end)
      cycle.caret = cycle.start + text.length
      setLine(cycle.line)
      return cycle.caret
    }

    completing?.abort()
    const own = (completing = new AbortController())
    const { start, word, words, quote } = wordAt(line, caret)
    let candidates
    try {
      candidates = await candidatesFor(words, word, own.signal)
    } catch (error) {
      if (error?.name !== 'AbortError' && !own.signal.aborted) console.error(error)
      return null
    }
    // typed on, or another Tab started meanwhile
    if (own.signal.aborted || input.value !== line) return null
    completing = null

    const seen = new Set()
    const matches = candidates
      .filter((c) => c.value.startsWith(word) && !seen.has(c.value) && seen.add(c.value))
      .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    if (!matches.length) {
      bell()
      return null
    }

    const replace = (text) => {
      setLine(line.slice(0, start) + text + line.slice(caret))
      return start + text.length
    }
    if (matches.length === 1) return replace(insertion(matches[0], quote, true))
    const prefix = commonPrefix(matches.map((m) => m.value))
    if (prefix.length > word.length) return replace(insertion({ value: prefix }, quote, false))

    completions.value = matches.map((m) => m.display)
    // zsh's LIST_BEEP
    bell()
    cycle = { base: line, start, end: caret, quote, matches, index: -1, line, caret }
    return null
  }

  // Cmd+K: drop the scrollback entirely
  const clearScrollback = () => {
    lines.value = []
    screenStart.value = 0
  }

  // Show styled lines in the less-like pager; resolves when the user quits it
  const page = (rows, { title = null } = {}) =>
    new Promise((resolve) => {
      pager.value = {
        id: ++pagerId,
        lines: rows,
        title,
        close: () => {
          pager.value = null
          resolve()
        },
      }
    })

  const chdir = (path) => {
    env.OLDPWD = cwd.value
    cwd.value = path
  }

  async function execute(line) {
    let argv
    try {
      argv = tokenize(line)
    } catch (error) {
      print(`zsh: ${error.message}`)
      return 1
    }
    if (!argv.length) return status.value

    const [name, ...args] = argv
    const commands = registry(getCommands())
    const command = Object.hasOwn(commands, name) ? commands[name] : null
    if (!command) {
      print(`zsh: command not found: ${name}`)
      return 127
    }

    const own = (controller = new AbortController())
    const { signal } = own
    busy.value = true
    job.value = argv.join(' ')

    // Output from a command that was interrupted is dropped.
    const guardedPrint = (text) => signal.aborted || print(text)
    const guardedPrintStyled = (rows) => signal.aborted || printStyled(rows)
    const guardedPage = (rows, opts) => (signal.aborted ? Promise.resolve() : page(rows, opts))

    try {
      const code = await command.run({
        ...getContext(),
        name,
        args,
        cwd: cwd.value,
        home,
        user,
        env: { ...env },
        cols: getCols(),
        commands,
        resolve: (path) => resolvePath(path, cwd.value, home),
        chdir: (path) => signal.aborted || chdir(path),
        print: guardedPrint,
        bell: () => signal.aborted || bell(),
        printStyled: guardedPrintStyled,
        page: guardedPage,
        clear,
        clearScrollback,
        signal,
      })
      return code ?? 0
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) return 130
      console.error(error)
      print(`${name}: ${error.message}`)
      return 1
    } finally {
      // Ctrl+C may have released the prompt already and another command started
      if (controller === own) {
        busy.value = false
        job.value = null
        controller = null
      }
    }
  }

  const submit = async () => {
    if (busy.value) return
    completing?.abort()
    completions.value = null
    const line = input.value
    push({ prompt: prompt.value, text: line })
    input.value = ''
    draft = ''

    if (line.trim() && history[history.length - 1] !== line) history.push(line)
    historyIndex = history.length

    if (line.trim()) {
      const code = await execute(line)
      if (code !== 130) status.value = code
    }
  }

  // Ctrl+C: abort the running command, or abandon the current line
  const interrupt = () => {
    completing?.abort()
    completions.value = null
    if (busy.value) {
      pager.value?.close()
      controller?.abort()
      controller = null
      busy.value = false
      job.value = null
      status.value = 130
      push({ text: '^C' })
      return
    }
    push({ prompt: prompt.value, text: `${input.value}^C` })
    input.value = ''
    draft = ''
    historyIndex = history.length
  }

  const historyPrev = () => {
    if (!history.length || historyIndex === 0) {
      bell()
      return false
    }
    if (historyIndex === history.length) draft = input.value
    input.value = history[--historyIndex]
    return true
  }

  const historyNext = () => {
    if (historyIndex >= history.length) {
      bell()
      return false
    }
    historyIndex++
    input.value = historyIndex === history.length ? draft : history[historyIndex]
    return true
  }

  if (options.lastLogin !== false) print(`Last login: ${formatLoginDate(readLastLogin())} on ${tty}`)

  return {
    user,
    lines,
    input,
    cwd,
    prompt,
    busy,
    status,
    pager,
    foreground,
    titleDirectory,
    print,
    screenStart,
    clear,
    clearScrollback,
    submit,
    interrupt,
    complete,
    completions,
    bell,
    bellCount,
    historyPrev,
    historyNext,
  }
}
