import { defineCommand, completePath } from '../../src'

export default defineCommand({
  name: 'cat',
  man: {
    summary: 'print files',
    synopsis: '__file__ ...',
    description: 'Reads each __file__ in turn and writes it to the terminal.',
  },

  complete: (ctx) => completePath(ctx, (dir) => ctx.fs.list(dir, { signal: ctx.signal })),

  async run({ args, resolve, print, fs, signal }) {
    let status = 0
    for (const path of args) {
      try {
        print((await fs.read(resolve(path), { signal })).replace(/\n$/, ''))
      } catch (error) {
        if (!error.code) throw error
        print(`cat: ${path}: ${error.message}`)
        status = 1
      }
    }
    return status
  },
})
