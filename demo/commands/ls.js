import { defineCommand, completePath, parseOptions, columns } from '../../src'

export default defineCommand({
  name: 'ls',
  man: {
    summary: 'list directory contents',
    synopsis: '[**-1a**] [__file__]',
    description: 'For a directory, **ls** lists its contents in columns; for a file, its name.',
    options: [
      { flag: '**-1**', text: 'One entry per line.' },
      { flag: '**-a**', text: 'Include entries whose names begin with a dot.' },
    ],
  },

  // Tab: entries of the directory being typed
  complete: (ctx) => completePath(ctx, (dir) => ctx.fs.list(dir, { signal: ctx.signal })),

  async run({ args, cols, resolve, print, fs, signal }) {
    const { options, operands, invalid } = parseOptions(args, '1a')
    if (invalid) {
      print(`ls: invalid option -- ${invalid}\nusage: ls [-1a] [file]`)
      return 1
    }
    const path = operands[0] ?? '.'
    try {
      const { type } = await fs.stat(resolve(path), { signal })
      if (type === 'file') return print(path)
      const names = (await fs.list(resolve(path), { signal }))
        .filter((entry) => options.has('a') || !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
      if (names.length) print((options.has('1') ? names : columns(names, cols)).join('\n'))
    } catch (error) {
      if (!error.code) throw error
      print(`ls: ${path}: ${error.message}`)
      return 1
    }
  },
})
