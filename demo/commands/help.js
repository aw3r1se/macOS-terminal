import { defineCommand } from '../../src'

export default defineCommand({
  name: 'help',
  man: { summary: 'list the commands', synopsis: '', description: 'Lists the available commands with a line about each.' },
  run({ commands, print }) {
    const list = Object.values(commands).sort((a, b) => (a.name < b.name ? -1 : 1))
    const width = Math.max(...list.map((c) => c.name.length)) + 2
    print(list.map((c) => c.name.padEnd(width) + (c.man?.summary ?? '')).join('\n'))
    print('\nman <command> for details · Tab completes · right-click for the menu')
  },
})
