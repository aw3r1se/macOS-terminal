// A tiny in-memory file system the demo commands work on — stands in for a
// backend: async, takes an AbortSignal, throws errno-style errors.

const dir = (children = {}) => ({ type: 'dir', children })
const file = (content) => ({ type: 'file', content })

const ROOT = dir({
  Users: dir({
    guest: dir({
      'README.md': file(
        [
          '# macos-terminal demo',
          '',
          'Everything here is a demo command written with defineCommand():',
          'help, ls, cd, cat, pwd, echo, sleep, man, clear.',
          '',
          'Try Tab after "cd " or "cat Doc", right-click, or the yellow button.',
        ].join('\n'),
      ),
      Desktop: dir({ 'todo.txt': file('- write my own commands\n- hook them up to a backend\n') }),
      Documents: dir({
        'notes.txt': file('Tab completion comes from completePath() over this file system.\n'),
        'Project Ideas': dir({ 'terminal.txt': file('A web terminal for my backend.\n') }),
      }),
      Downloads: dir(),
      Music: dir(),
      Pictures: dir(),
      '.zshrc': file('# hidden: Tab shows it only after a "."\n'),
    }),
  }),
  etc: dir({ hosts: file('127.0.0.1\tlocalhost\n') }),
  tmp: dir(),
})

export class FsError extends Error {
  constructor(code, path) {
    super({ ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EISDIR: 'Is a directory' }[code])
    this.code = code
    this.path = path
  }
}

// a bit of latency, like a real backend
const delay = (signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 40)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

function lookup(path) {
  let node = ROOT
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') throw new FsError('ENOTDIR', path)
    node = node.children[part]
    if (!node) throw new FsError('ENOENT', path)
  }
  return node
}

export const fs = {
  async stat(path, { signal } = {}) {
    await delay(signal)
    return { type: lookup(path).type }
  },
  async list(path, { signal } = {}) {
    await delay(signal)
    const node = lookup(path)
    if (node.type !== 'dir') throw new FsError('ENOTDIR', path)
    return Object.entries(node.children).map(([name, child]) => ({ name, type: child.type }))
  },
  async read(path, { signal } = {}) {
    await delay(signal)
    const node = lookup(path)
    if (node.type === 'dir') throw new FsError('EISDIR', path)
    return node.content
  },
}
