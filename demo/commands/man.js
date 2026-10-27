import { defineCommand, renderManual } from '../../src'

export default defineCommand({
  name: 'man',
  man: {
    summary: 'show a command’s manual page',
    synopsis: '__command__',
    description: 'Shows the manual page of __command__ in the pager. **q** quits, **/** searches, **h** helps.',
  },

  // Tab: commands that have a page
  complete: ({ commands }) => Object.values(commands).filter((c) => c.man).map((c) => c.name),

  async run({ args, cols, commands, print, page }) {
    if (!args.length) return print("What manual page do you want?\nFor example, try 'man man'."), 1
    for (const name of args) {
      const command = Object.hasOwn(commands, name) ? commands[name] : null
      if (!command?.man) {
        print(`No manual entry for ${name}`)
        continue
      }
      await page(renderManual(command, cols))
    }
  },
})
