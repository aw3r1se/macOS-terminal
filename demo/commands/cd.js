import { defineCommand, completePath } from '../../src'

export default defineCommand({
  name: 'cd',
  man: {
    summary: 'change the working directory',
    synopsis: '[__dir__]',
    description: 'Changes the working directory to __dir__, or to HOME without one. A leading **~** stands for HOME.',
  },

  // Tab: directories only
  complete: (ctx) => completePath(ctx, (dir) => ctx.fs.list(dir, { signal: ctx.signal }), { dirs: true }),

  async run({ args, home, resolve, chdir, print, fs, signal }) {
    const target = resolve(args[0] ?? home)
    try {
      const { type } = await fs.stat(target, { signal })
      if (type !== 'dir') return print(`cd: not a directory: ${args[0]}`), 1
    } catch (error) {
      if (!error.code) throw error
      print(`cd: no such file or directory: ${args[0]}`)
      return 1
    }
    chdir(target)
  },
})
