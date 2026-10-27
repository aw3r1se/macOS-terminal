// Renders a command's `man` description the way mandoc does on macOS:
// header/footer lines, bold section titles, text at a 5-column indent,
// tagged lists (options) with the body at column 13.

const OS = 'macOS 26.6'
const INDENT = 5
const TAG_WIDTH = 8
const MAX_WIDTH = 78

const plain = (text) => ({ text })
const bold = (text) => ({ text, bold: true })
const toArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/** Split **bold** / __underline__ markup into segments. */
export function parseMarkup(source) {
  const segments = []
  const re = /\*\*(.+?)\*\*|__(.+?)__/g
  let last = 0
  for (const match of source.matchAll(re)) {
    if (match.index > last) segments.push(plain(source.slice(last, match.index)))
    segments.push(match[1] != null ? bold(match[1]) : { text: match[2], underline: true })
    last = match.index + match[0].length
  }
  if (last < source.length) segments.push(plain(source.slice(last)))
  return segments
}

// Break styled segments into words (a word may mix styles, e.g. "[-a]")
function toWords(segments) {
  const words = []
  let word = []
  for (const { text, ...style } of segments) {
    text.split(/(\s+)/).forEach((part, i) => {
      if (i % 2) {
        if (word.length) words.push(word)
        word = []
      } else if (part) {
        word.push({ text: part, ...style })
      }
    })
  }
  if (word.length) words.push(word)
  return words
}

const wordLength = (word) => word.reduce((n, s) => n + s.text.length, 0)

// mandoc puts two spaces after a sentence (man sources start each one on a new line)
const endsSentence = (word) => /[.!?]["')\]]*$/.test(word[word.length - 1].text)
const startsSentence = (word) => /^[A-Z]/.test(word[0].text)

/** Word-wrap markup to `width`, first line at `firstIndent`, the rest at `indent`. */
function wrap(markup, width, indent, firstIndent = indent) {
  const lines = []
  let line = null
  let length = 0
  let previous = null

  for (const word of toWords(parseMarkup(markup))) {
    const size = wordLength(word)
    const gap = previous && endsSentence(previous) && startsSentence(word) ? 2 : 1
    previous = word
    if (line && length + gap + size > width) {
      lines.push(line)
      line = null
    }
    if (!line) {
      const pad = lines.length ? indent : firstIndent
      line = [plain(' '.repeat(pad)), ...word]
      length = pad + size
    } else {
      line.push(plain(' '.repeat(gap)), ...word)
      length += gap + size
    }
  }
  if (line) lines.push(line)
  return lines
}

function paragraphs(texts, width, indent) {
  return toArray(texts).flatMap((text, i) => [...(i ? [[]] : []), ...wrap(text, width, indent)])
}

// mandoc `.Bl -tag`: body on the tag's line when the tag fits, otherwise below it
function taggedList(items, width) {
  return items.flatMap(({ tag, text }, i) => {
    const bodyIndent = INDENT + TAG_WIDTH
    const tagLine = [plain(' '.repeat(INDENT)), ...parseMarkup(tag)]
    const tagLength = INDENT + wordLength(tagLine.slice(1))
    const body = paragraphs(text, width, bodyIndent)
    const gap = i ? [[]] : []

    if (tagLength < bodyIndent && body.length) {
      const [first, ...rest] = body
      first[0] = plain(' '.repeat(bodyIndent - tagLength))
      return [...gap, [...tagLine, ...first], ...rest]
    }
    return [...gap, tagLine, ...body]
  })
}

// Three fields spread across the width: left, centered (mandoc rounds up), right
function spread(left, center, right, width) {
  const middle = Math.max(1, Math.ceil((width - center.length) / 2) - left.length)
  const line = `${left}${' '.repeat(middle)}${center}`
  return [plain(`${line}${' '.repeat(Math.max(1, width - line.length - right.length))}${right}`)]
}

/** @returns {import('./command').Segment[][]} */
export function renderManual(command, cols) {
  const { name, man } = command
  const width = Math.max(40, Math.min(cols, MAX_WIDTH))
  const section = man.section ?? 1
  const title = `${name.toUpperCase()}(${section})`
  const out = []

  const heading = (text, body) => {
    if (!body.length) return
    out.push([], [bold(text)], ...body)
  }

  out.push(spread(title, 'General Commands Manual', title, width))

  heading('NAME', wrap(`**${name}** – ${man.summary}`, width, INDENT))

  heading(
    'SYNOPSIS',
    toArray(man.synopsis).flatMap((usage) =>
      wrap(`**${name}** ${usage}`, width, INDENT + name.length + 1, INDENT),
    ),
  )

  const description = paragraphs(man.description, width, INDENT)
  if (man.options?.length) {
    description.push([], ...wrap('The following options are available:', width, INDENT), [])
    description.push(...taggedList(man.options.map((o) => ({ tag: o.flag, text: o.text })), width))
  }
  heading('DESCRIPTION', description)

  for (const extra of man.sections ?? []) heading(extra.title.toUpperCase(), paragraphs(extra.text, width, INDENT))

  heading('ENVIRONMENT', taggedList((man.environment ?? []).map((e) => ({ tag: e.name, text: e.text })), width))

  heading('EXIT STATUS', paragraphs(man.exitStatus, width, INDENT))

  const seeAlso = (man.seeAlso ?? []).map((ref) => ref.replace(/^([^(]+)/, '**$1**')).join(', ')
  heading('SEE ALSO', seeAlso ? wrap(seeAlso, width, INDENT) : [])

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  out.push([], spread(OS, man.date ?? date, OS, width))
  return out
}
