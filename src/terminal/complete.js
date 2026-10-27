/**
 * A completion candidate. Commands may return plain strings.
 * @typedef {object} Candidate
 * @property {string} value     The whole word to insert (e.g. 'Documents/projects/')
 * @property {string} [display] Shown in the list (e.g. 'projects/'); defaults to `value`
 * @property {string} [suffix]  Added after a unique match; defaults to ' ', or '' after '/'
 */

// Characters the shell would split or expand on, escaped when inserting a word
const SPECIAL = /[\s'"\\$`&;|<>()*?[\]#!{}]/g

/**
 * The word being completed: from its start up to the caret, unescaped and
 * unquoted as the shell would read it, plus the complete words before it.
 */
export function wordAt(line, caret) {
  const head = line.slice(0, caret)
  const words = []
  let word = ''
  let start = caret
  let inWord = false
  let quote = null

  for (let i = 0; i < head.length; i++) {
    const c = head[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && '"\\$`'.includes(head[i + 1] ?? '')) word += head[++i]
      else word += c
      continue
    }
    if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
      continue
    }
    if (!inWord) {
      start = i
      inWord = true
    }
    if (c === "'" || c === '"') quote = c
    else if (c === '\\') {
      if (i + 1 < head.length) word += head[++i]
    } else word += c
  }

  if (!inWord) start = caret
  // a word opened with a quote is completed inside that quote
  const quoted = quote && line[start] === quote ? quote : null
  return { start, word, words, quote: quoted }
}

/** Text that replaces the word: escaped (or quoted) value, closed when final. */
export function insertion(candidate, quote, final) {
  const { value, suffix } = candidate
  if (!quote) return value.replace(SPECIAL, '\\$&') + (final ? suffix : '')
  const body = quote === '"' ? value.replace(/["\\$`]/g, '\\$&') : value.replaceAll("'", `'\\''`)
  // a directory stays open for the next component, like zsh
  const close = final && !value.endsWith('/') ? quote + suffix : ''
  return quote + body + close
}

export function normalize(candidates) {
  return (candidates ?? []).map((c) => {
    const item = typeof c === 'string' ? { value: c } : c
    return {
      value: item.value,
      display: item.display ?? item.value,
      suffix: item.suffix ?? (item.value.endsWith('/') ? '' : ' '),
    }
  })
}

export function commonPrefix(values) {
  let prefix = values[0] ?? ''
  for (const value of values) {
    let i = 0
    while (i < prefix.length && prefix[i] === value[i]) i++
    prefix = prefix.slice(0, i)
  }
  return prefix
}

/**
 * Lay out items in columns, top to bottom then left to right (like ls and
 * zsh's completion list), within `width` characters. Returns the rows.
 */
export function columns(items, width) {
  if (!items.length) return []
  const colW = Math.max(...items.map((s) => s.length)) + 2
  const perRow = Math.max(1, Math.floor((width + 2) / colW))
  const rows = Math.ceil(items.length / perRow)
  const out = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < perRow; c++) {
      const i = c * rows + r
      if (i >= items.length) break
      const last = (c + 1) * rows + r >= items.length
      line += last ? items[i] : items[i].padEnd(colW)
    }
    out.push(line)
  }
  return out
}

/**
 * Path completion for a command's `complete`, on top of any way to list a
 * directory: `list(dir)` resolves to `[{ name, type: 'dir' | 'file' }]` for an
 * absolute `dir`. Hidden entries show only when the word's name starts with '.'.
 *
 * @example
 * complete: (ctx) => completePath(ctx, (dir) => ctx.api.list(dir, { signal: ctx.signal }), { dirs: true })
 */
export async function completePath(ctx, list, { dirs = false } = {}) {
  const { word, resolve } = ctx
  const slash = word.lastIndexOf('/')
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''
  const base = word.slice(slash + 1)
  let entries
  try {
    entries = await list(resolve(dirPart || '.'))
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return []
  }
  return entries
    .filter((entry) => (!dirs || entry.type === 'dir') && (base.startsWith('.') || !entry.name.startsWith('.')))
    .map((entry) => {
      const name = entry.type === 'dir' ? `${entry.name}/` : entry.name
      return { value: dirPart + name, display: name }
    })
}
