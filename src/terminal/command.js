/**
 * A run of styled text; an output line is an array of segments.
 * @typedef {{ text: string, bold?: boolean, underline?: boolean, inverse?: boolean }} Segment
 */

/**
 * @typedef {object} CommandContext
 * @property {string}   name      Command name as typed (argv[0])
 * @property {string[]} args      Arguments after the name
 * @property {string}   cwd       Current working directory (absolute)
 * @property {string}   home      $HOME
 * @property {string}   user      Current user name
 * @property {Record<string, string>} env  Environment ($OLDPWD etc.)
 * @property {number}   cols      Terminal width in columns
 * @property {Record<string, Command>} commands  Registry of all commands
 * @property {(path: string) => string} resolve  Absolute path for a user-supplied one
 * @property {(path: string) => void}   chdir    Change the working directory
 * @property {(text?: string) => void}  print    Append plain output (may contain \n; \a rings the bell)
 * @property {() => void}               bell     Ring the terminal bell
 * @property {(lines: Segment[][]) => void} printStyled  Append styled lines
 * @property {(lines: Segment[][], opts?: { title?: string }) => Promise<void>} page
 *           Show lines in the less-like pager; resolves when the user quits (q)
 * @property {() => void}               clear    Clear the screen (scrollback is kept)
 * @property {() => void}               clearScrollback  Erase the screen and scrollback (Cmd+K)
 * @property {AbortSignal} signal   Aborted on Ctrl+C — pass it to fetch and other async work
 *
 * Fields of the session's `context` option (e.g. `api`) are merged in as well.
 */

/**
 * Manual page, for a `man` command (see renderManual). Text fields accept inline markup:
 * **bold** for literal text (command names, flags), __underline__ for arguments.
 *
 * @typedef {object} Manual
 * @property {string}   summary         One-line description (NAME section)
 * @property {string | string[]} synopsis  Usage line(s), without the command name
 * @property {string | string[]} description  Paragraphs
 * @property {number}   [section=1]
 * @property {{ flag: string, text: string | string[] }[]} [options]  Listed after the description
 * @property {{ name: string, text: string | string[] }[]} [environment]
 * @property {string}   [exitStatus]
 * @property {{ title: string, text: string | string[] }[]} [sections]  Extra sections
 * @property {string[]} [seeAlso]       e.g. ['cat(1)', 'pwd(1)']
 */

/**
 * @typedef {object} CompletionContext
 * @property {string}   name      The command's name
 * @property {string[]} args      Complete arguments before the word being completed
 * @property {string}   word      The word up to the caret, unquoted/unescaped ('' for a new word)
 * @property {string}   cwd
 * @property {string}   home
 * @property {string}   user
 * @property {Record<string, string>} env
 * @property {Record<string, Command>} commands
 * @property {(path: string) => string} resolve
 * @property {AbortSignal} signal   Aborted when the user types on or presses Tab again
 *
 * Fields of the session's `context` option are merged in as well.
 */

/** @typedef {(string | import('./complete').Candidate)[]} CompletionResult */

/**
 * @typedef {object} Command
 * @property {string} name
 * @property {Manual} [man]
 * @property {(ctx: CompletionContext) => CompletionResult | Promise<CompletionResult>} [complete]
 *           Candidates for the word being completed (Tab); the shell filters them
 *           by prefix, so returning e.g. every entry of a directory is fine.
 * @property {(ctx: CommandContext) => number | void | Promise<number | void>} run
 *           Returns the exit status (0 when omitted).
 */

const REQUIRED = [
  ['name', (c) => typeof c.name === 'string' && c.name],
  ['run', (c) => typeof c.run === 'function'],
  ['complete', (c) => c.complete == null || typeof c.complete === 'function'],
  // a manual page is optional, but a partial one fails here, not when someone reads it
  ['man', (c) => c.man == null || typeof c.man === 'object'],
  ['man.summary', (c) => c.man == null || typeof c.man.summary === 'string'],
  ['man.synopsis', (c) => c.man == null || c.man.synopsis != null],
  ['man.description', (c) => c.man == null || c.man.description != null],
]

/**
 * Declare a command. Checks the interface at definition time, so a broken
 * command fails on import, not when someone types it.
 */
export function defineCommand(/** @type {Command} */ command) {
  const missing = REQUIRED.filter(([, ok]) => !ok(command)).map(([field]) => field)
  if (missing.length) {
    throw new TypeError(`Command "${command?.name ?? '?'}" must implement: ${missing.join(', ')}`)
  }
  return command
}
