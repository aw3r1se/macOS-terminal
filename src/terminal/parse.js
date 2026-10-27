/**
 * Split a command line into words, shell-style: whitespace separates words,
 * '…' is literal, "…" allows \" \\ \$ \` escapes, \x escapes outside quotes.
 * Throws SyntaxError on an unterminated quote.
 */
export function tokenize(line) {
  const words = []
  let word = ''
  let inWord = false
  let quote = null

  for (let i = 0; i < line.length; i++) {
    const c = line[i]

    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && '"\\$`'.includes(line[i + 1] ?? '')) word += line[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      inWord = true
    } else if (c === '\\') {
      if (i + 1 < line.length) word += line[++i]
      inWord = true
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }

  if (quote) throw new SyntaxError(`unmatched ${quote}`)
  if (inWord) words.push(word)
  return words
}

/**
 * getopt-style parsing of single-letter flags: `-la`, `-l -a`, stops at `--`
 * or the first operand. Returns the first unknown flag in `invalid`.
 */
export function parseOptions(args, allowed) {
  const options = new Set()
  let i = 0

  for (; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      i++
      break
    }
    if (!arg.startsWith('-') || arg === '-') break

    for (const flag of arg.slice(1)) {
      if (!allowed.includes(flag)) return { options, operands: [], invalid: flag }
      options.add(flag)
    }
  }

  return { options, operands: args.slice(i), invalid: null }
}
