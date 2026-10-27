import { defineCommand } from '../../src'

export default defineCommand({
  name: 'clear',
  man: { summary: 'clear the screen', synopsis: '', description: 'Clears the screen; the scrollback above is kept.' },
  run: ({ clear }) => clear(),
})
