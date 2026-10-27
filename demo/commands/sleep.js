import { defineCommand } from '../../src'

// Long-running and abortable: Ctrl+C aborts `signal`, which ends the wait
export default defineCommand({
  name: 'sleep',
  man: {
    summary: 'wait a number of seconds',
    synopsis: '__seconds__',
    description: 'Waits __seconds__, then exits. Press **Ctrl+C** to interrupt it.',
  },
  async run({ args, print, signal }) {
    const seconds = Number(args[0])
    if (!(seconds >= 0)) return print('usage: sleep seconds'), 1
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, seconds * 1000)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  },
})
