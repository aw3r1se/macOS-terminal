import { defineCommand } from '../../src'

export default defineCommand({
  name: 'pwd',
  man: { summary: 'print the working directory', synopsis: '', description: 'Prints the absolute path of the working directory.' },
  run: ({ cwd, print }) => print(cwd),
})
