/** Resolve `path` against `cwd` (both POSIX), expanding a leading `~`. */
export function resolvePath(path, cwd, home) {
  if (path === '~' || path.startsWith('~/')) path = home + path.slice(1)
  const absolute = path.startsWith('/') ? path : `${cwd}/${path}`

  const parts = []
  for (const part of absolute.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

export function parentPath(path) {
  return path === '/' ? '/' : path.slice(0, path.lastIndexOf('/')) || '/'
}

/** zsh `%1~`: last path component, with $HOME shown as `~`. */
export function promptDir(cwd, home) {
  if (cwd === home) return '~'
  if (cwd === '/') return '/'
  return cwd.slice(cwd.lastIndexOf('/') + 1)
}

/** Terminal.app window title: the directory's name, or the volume name for `/`. */
export function titleDir(cwd) {
  if (cwd === '/') return 'Macintosh HD'
  return cwd.slice(cwd.lastIndexOf('/') + 1)
}

/** zsh `%~`: full path with the $HOME prefix replaced by `~`. */
export function tildify(path, home) {
  if (path === home) return '~'
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}
