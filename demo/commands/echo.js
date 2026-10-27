import { defineCommand } from '../../src'

export default defineCommand({
  name: 'echo',
  man: { summary: 'write arguments', synopsis: '[__string__ ...]', description: 'Writes its arguments, separated by spaces.' },
  run: ({ args, print }) => print(args.join(' ')),
})
