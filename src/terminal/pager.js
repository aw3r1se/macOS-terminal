// Pure helpers for the less-like pager (src/components/TerminalPager.vue).

/** @typedef {import('./command').Segment} Segment */

export const lineText = (segments) => segments.map((s) => s.text).join('')

/** Hard-wrap styled lines to `cols` columns, as less folds long lines. */
export function fold(lines, cols) {
  const out = []
  for (const line of lines) {
    let row = []
    let length = 0
    for (const segment of line) {
      let text = segment.text
      while (text.length) {
        if (length === cols) {
          out.push(row)
          row = []
          length = 0
        }
        const take = Math.min(cols - length, text.length)
        row.push({ ...segment, text: text.slice(0, take) })
        length += take
        text = text.slice(take)
      }
    }
    out.push(row)
  }
  return out
}

/**
 * Build a search regex with less -i semantics: case-insensitive unless the
 * pattern has an uppercase letter. Returns null for an invalid pattern.
 */
export function searchRegex(pattern) {
  try {
    return new RegExp(pattern, /[A-Z]/.test(pattern) ? 'g' : 'gi')
  } catch {
    return null
  }
}

/** Mark every match of `regex` in a styled line as inverse (standout). */
export function highlight(segments, regex) {
  if (!regex) return segments
  const text = lineText(segments)
  const ranges = []
  for (const match of text.matchAll(regex)) {
    if (match[0].length) ranges.push([match.index, match.index + match[0].length])
  }
  if (!ranges.length) return segments

  const out = []
  let offset = 0
  for (const segment of segments) {
    const start = offset
    const end = offset + segment.text.length
    // Cut points of this segment: its bounds plus any range edges inside it
    const cuts = [start, end, ...ranges.flat().filter((p) => p > start && p < end)].sort((a, b) => a - b)
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i] === cuts[i + 1]) continue
      const inside = ranges.some(([a, b]) => cuts[i] >= a && cuts[i + 1] <= b)
      out.push({ ...segment, text: text.slice(cuts[i], cuts[i + 1]), ...(inside && { inverse: true }) })
    }
    offset = end
  }
  return out
}

const HELP = `
                   SUMMARY OF LESS COMMANDS

      Commands marked with * may be preceded by a number, N.
      Notes in parentheses indicate the behavior if N is given.

  h  H                 Display this help.
  q  :q  Q  :Q  ZZ     Exit.
 ---------------------------------------------------------------------------

                           MOVING

  e  ^E  j  ^N  CR  *  Forward  one line   (or N lines).
  y  ^Y  k  ^K  ^P  *  Backward one line   (or N lines).
  f  ^F  ^V  SPACE  *  Forward  one window (or N lines).
  b  ^B  ESC-v      *  Backward one window (or N lines).
  z                 *  Forward  one window (and set window to N).
  w                 *  Backward one window (and set window to N).
  d  ^D             *  Forward  one half-window (and set half-window to N).
  u  ^U             *  Backward one half-window (and set half-window to N).
        ---------------------------------------------------
        Default "window" is the screen height.
        Default "half-window" is half of the screen height.
 ---------------------------------------------------------------------------

                          SEARCHING

  /pattern          *  Search forward for (N-th) matching line.
  ?pattern          *  Search backward for (N-th) matching line.
  n                 *  Repeat previous search (for N-th occurrence).
  N                 *  Repeat previous search in reverse direction.
        ---------------------------------------------------
        Search patterns are regular expressions, case-insensitive
        unless they contain uppercase letters.
 ---------------------------------------------------------------------------

                           JUMPING

  g  <  ESC-<       *  Go to first line in file (or line N).
  G  >  ESC->       *  Go to last line in file (or line N).
`

export const HELP_LINES = HELP.slice(1).split('\n').map((text) => (text ? [{ text }] : []))
