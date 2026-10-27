# macos-terminal

A macOS Terminal.app look-alike for Vue 3: window chrome (traffic lights,
drag/resize snapped to the character grid, full screen, genie minimize), a zsh-like
prompt with history and Ctrl+C, a less-like pager — and **your own commands**.
The package ships no commands: you write them.

## 🔧 Installation

```sh
npm i @aw3r1se/macos-terminal
```

The package ships Vue SFC sources, so it needs a bundler with Vue support
(Vite + `@vitejs/plugin-vue`, Vue CLI, Nuxt, …).

## ✏️ Usage

```js
// main.js
import '@aw3r1se/macos-terminal/style.css';
```

```vue
<script setup>
  import { TerminalWindow } from '@aw3r1se/macos-terminal';
  import hello from './commands/hello';
  import { api } from './api';
</script>

<template>
  <!-- the window is positioned inside its container; inset it by `margin` -->
  <div style="position: fixed; inset: 10px">
    <TerminalWindow :commands="[hello]" :context="{ api }" user="guest" />
  </div>
</template>
```

## ⌨️ Writing commands

```js
// commands/hello.js
import { defineCommand, parseOptions } from '@aw3r1se/macos-terminal';

export default defineCommand({
  name: 'hello',
  // optional manual page, for a `man` command of your own (see renderManual)
  man: {
    summary: 'greet someone',
    synopsis: '[**-l**] [__name__]',
    description: 'The **hello** utility greets __name__, or the current user.',
  },
  async run({ args, user, print, api, signal }) {
    const { options, operands, invalid } = parseOptions(args, 'l');
    if (invalid) {
      print(`hello: illegal option -- ${invalid}\nusage: hello [-l] [name]`);
      return 1;
    }
    const name = operands[0] ?? user;
    // `api` comes from the window's `context`; pass `signal` so Ctrl+C aborts the request
    const profile = await api.profile(name, { signal });
    print(options.has('l') ? `Hello, ${profile.fullName}!` : `Hello, ${name}!`);
    return 0; // exit status (0 when omitted)
  },
});
```

`defineCommand` checks the shape when the command is defined (a missing `run`, or a
`man` without `summary`/`synopsis`/`description`, throws on import).

### Tab completion

Tab completes command names on its own. For arguments, give the command a
`complete(ctx)` returning candidates — strings, or `{ value, display?, suffix? }`.
The shell filters them by the typed prefix, sorts them and behaves like zsh: a
unique match is inserted (followed by a space, or nothing after `/`); several
extend the word to their common prefix, or are listed below the prompt; Tab again
cycles through them. Escaping and quotes are handled for you. With nothing but
blanks before the caret, Tab inserts a tab, as zsh's `insert-tab` does.

```js
import { defineCommand, completePath } from '@aw3r1se/macos-terminal';

export default defineCommand({
  name: 'cd',
  // any directory lister will do: (absolute dir) => [{ name, type: 'dir' | 'file' }]
  complete: (ctx) => completePath(ctx, (dir) => ctx.api.list(dir, { signal: ctx.signal }), { dirs: true }),
  run(ctx) { /* … */ },
});

export const deploy = defineCommand({
  name: 'deploy',
  // async is fine; `signal` aborts when the user types on
  async complete({ args, word, api, signal }) {
    if (args.length === 0) return ['staging', 'production'];
    return (await api.releases({ signal })).map((r) => ({ value: r.tag, display: `${r.tag} (${r.date})` }));
  },
  run(ctx) { /* … */ },
});
```

The completion context has `name`, `args` (complete words before the one being
completed), `word` (up to the caret, unquoted), `cwd`, `home`, `user`, `env`,
`commands`, `resolve`, `signal` and the window's `context`.

`completePath` hides dotfiles unless the typed name starts with `.`.

### Command context

| Field | |
|---|---|
| `name`, `args` | argv[0] and the rest, after shell-like tokenizing (quotes, escapes) |
| `cwd`, `home`, `user`, `env` | working directory, `$HOME`, user name, environment (`OLDPWD`, …) |
| `cols` | terminal width in columns |
| `commands` | registry of all commands, by name |
| `resolve(path)` | absolute path for a user-supplied one (`~`, `..`, relative) |
| `chdir(path)` | change the working directory |
| `print(text)` | append plain output (may contain `\n`; `\a` rings the bell) |
| `bell()` | ring the terminal bell |
| `printStyled(lines)` | append styled lines: `[[{ text, bold?, underline?, inverse? }, …], …]` |
| `page(lines, { title })` | show lines in the pager; resolves when the user quits (`q`) |
| `clear()`, `clearScrollback()` | clear the screen (scrollback kept) / everything (Cmd+K) |
| `signal` | `AbortSignal`, aborted on Ctrl+C |
| …`context` | every field of the window's `context` prop, e.g. `api` |

Output printed after Ctrl+C is dropped; an `AbortError` exits with 130. Any other
thrown error prints `<name>: <message>` and exits with 1.

### Helpers

- `completePath(ctx, list, { dirs })` — file/directory candidates for `complete`, see above;
- `columns(items, width)` — lay out strings in columns (ls / completion list style);
- `parseOptions(args, 'al')` → `{ options: Set, operands, invalid }` — getopt-style flags;
- `tokenize(line)` — the shell's word splitting;
- `resolvePath(path, cwd, home)`, `parentPath(path)`, `tildify(path, home)`;
- `renderManual(command, cols)` → styled lines of a man page (markup: `**bold**`, `__underline__`), to build a `man` command: `page(renderManual(commands[name], cols))`.

## 📚 API

### `<TerminalWindow>`

| Prop | Type | Default | |
|---|---|---|---|
| `commands` | `Command[] \| Record<string, Command>` | `[]` | Commands the shell runs |
| `context` | `object` | `{}` | Merged into every command's context |
| `user` | `string` | `'guest'` | |
| `host` | `string` | `'MacBook-Pro'` | |
| `home` | `string` | `/Users/<user>` | |
| `tty` | `string` | `'ttys000'` | |
| `lastLogin` | `boolean` | `true` | Print "Last login: …" on start |
| `cols`, `rows` | `number` | `80`, `24` | Initial size in character cells (clamped to the viewport) |
| `margin` | `number` | `10` | Space kept to the viewport edges, px |
| `visualBell` | `boolean` | `false` | Flash the screen on the bell |

Events: `close`, `minimize` (traffic lights), `bell` (e.g. to bounce a Dock icon while the window is in the background). Exposed via a template ref: `title`,
`session`, `focus()`, `isFocused`, and for minimizing into a Dock tile
`minimizeTo(rect)` → snapshot and `restoreFrom(rect, snapshot)` — they play the genie
animation; see [`@aw3r1se/macos-dock`](https://github.com/aw3r1se/macOS-dock).

### Without the window

```vue
<script setup>
  import { ref } from 'vue';
  import { TerminalScreen, useTerminal } from '@aw3r1se/macos-terminal';
  import hello from './commands/hello';

  const cols = ref(80);
  const session = useTerminal({ commands: [hello], context: {}, getCols: () => cols.value });
</script>

<template>
  <TerminalScreen :session="session" :focused="true" @resize="(grid) => (cols = grid.cols)" />
</template>
```

`useTerminal(options)` takes the props above (`commands` and `context` may also be
getters) plus `getCols`.

### Styling

`style.css` defines the look as CSS variables on `:root` (`--term-bg`, `--term-fg`,
`--term-font-size`, `--window-radius`, `--titlebar-bg`, …) — override them to theme it.
`<html data-font="classic">` switches to the Menlo font stack.

## ⌨️ Keys

`Enter` submit · `Tab` complete · `↑/↓` history · `Ctrl+C` interrupt · `Ctrl+L` clear screen (scrollback kept) · `Cmd+K` clear scrollback ·
`Ctrl+A/E` line start/end · `Ctrl+U/K` kill to start/end

Pager (`man`): `q` quit · `j/k`, `↑/↓`, `Enter` line · `Space/b`, `f`, `PgUp/PgDn` page ·
`d/u` half page · `g/G` top/bottom · `/` `?` search, `n/N` next/prev · `h` help · numeric prefix (`5j`, `20g`)

## 🖱️ Mouse and clipboard

As in Terminal.app: drag selects, double-click selects a word, triple-click a line,
Shift-click extends; a plain click drops the selection; Option(Alt)-click on the
input line moves the caret there. Right-click (or Ctrl-click on macOS) selects the
word under the pointer unless it's inside the selection, and opens the context
menu: Copy, Paste, Paste Selection, Select All, Clear Scrollback.

Copy/paste follow the platform:

| | macOS | Windows / Linux |
|---|---|---|
| Copy | `Cmd+C` | `Ctrl+C` with a selection, `Ctrl+Shift+C` |
| Interrupt | `Ctrl+C` (always) | `Ctrl+C` without a selection |
| Paste | `Cmd+V` | `Ctrl+V` |
| Select All | `Cmd+A` | context menu |

Modifier keys alone never drop the selection; typing does, and goes to the prompt.

## 🔔 Bell

The bell rings, as in zsh, on `\a` in output or `ctx.bell()`, on Tab with no
completion or an ambiguous one, and at either end of the history.

It makes no sound: `visual-bell` flashes the screen (Terminal.app's "Flash
screen"), and the window emits `bell` — play a sound there if you want one.

Without the window, watch `session.bellCount` and pass `:visual-bell` to `<TerminalScreen>`.

## 📄 License

MIT
