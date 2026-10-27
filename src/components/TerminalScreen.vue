<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import OutputLine from './OutputLine.vue'
import OverlayScrollbar from './OverlayScrollbar.vue'
import TerminalPager from './TerminalPager.vue'
import ContextMenu from './ContextMenu.vue'
import { columns } from '../terminal/complete'

// Copy/paste follow the platform: Cmd on macOS (where Ctrl+C always interrupts,
// as in Terminal.app); Ctrl elsewhere, where Ctrl+C copies when there is a selection
const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '')
// Key equivalents shown in the context menu (only the ones that work here)
const SHORTCUTS = IS_MAC
  ? { copy: '⌘C', paste: '⌘V', pasteSelection: '⇧⌘V', selectAll: '⌘A', clearScrollback: '⌘K' }
  : { copy: 'Ctrl+C', paste: 'Ctrl+V' }
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'OS'])
// Right-click selects the word under the pointer: anything but blanks and delimiters
const WORD_CHAR = /[^\s"'`()[\]{}<>|;,]/

const props = defineProps({
  // Session from useTerminal()
  session: { type: Object, required: true },
  focused: { type: Boolean, default: true },
})

const emit = defineEmits(['resize'])

const rootEl = ref()
const screenEl = ref()
const inputEl = ref()
const measureEl = ref()
const pagerEl = ref()

const { lines, input, prompt, busy, pager, screenStart, completions } = props.session

// Scrollback vs. the current screen (everything since the last `clear`)
const scrollback = computed(() => lines.value.slice(0, screenStart.value))
const screenLines = computed(() => lines.value.slice(screenStart.value))

// Grid size, also used by the pager
const cols = ref(80)
// Tab completion list, laid out below the prompt line
const completionRows = computed(() => (completions.value ? columns(completions.value, cols.value) : []))
const rows = ref(24)
const viewport = ref({ height: 0, padTop: 0 })

// After a clear the screen fills the whole viewport (top padding included), so
// scrolling to the bottom puts the prompt at the top and the scrollback fully above it.
const screenStyle = computed(() =>
  screenStart.value
    ? { minHeight: `${viewport.value.height}px`, paddingTop: `${viewport.value.padTop}px` }
    : null,
)

// Caret/selection inside the hidden textarea, mirrored into the rendered line.
const selStart = ref(0)
const selEnd = ref(0)

const syncSelection = () => {
  const el = inputEl.value
  if (!el) return
  selStart.value = el.selectionStart
  selEnd.value = el.selectionEnd
}

const segments = computed(() => {
  const value = input.value
  const start = Math.min(selStart.value, value.length)
  const end = Math.min(selEnd.value, value.length)

  if (start !== end) {
    return {
      before: value.slice(0, start),
      selected: value.slice(start, end),
      cursor: '',
      after: value.slice(end),
    }
  }

  const char = value[start]
  return {
    before: value.slice(0, start),
    selected: '',
    // A newline or tab under the caret would break the block, render a space instead
    cursor: !char || char === '\n' || char === '\t' ? ' ' : char,
    after: char === '\n' || char === '\t' ? value.slice(start) : value.slice(start + 1),
  }
})

const setCaret = (pos) => {
  const el = inputEl.value
  el.setSelectionRange(pos, pos)
  syncSelection()
}

const replaceRange = (from, to, text = '') => {
  input.value = input.value.slice(0, from) + text + input.value.slice(to)
  nextTick(() => setCaret(from + text.length))
}

// Text selected in the terminal: output (a DOM selection), or part of the input line
function selectedText() {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed && rootEl.value.contains(sel.anchorNode)) return sel.toString()
  const el = inputEl.value
  if (document.activeElement === el && el.selectionStart !== el.selectionEnd) {
    return el.value.slice(el.selectionStart, el.selectionEnd)
  }
  return ''
}

const copy = (text) => text && navigator.clipboard?.writeText(text).catch(() => {})

// Insert text at the caret (replacing the input's own selection), as typed
function paste(text) {
  if (!text || busy.value || pager.value) return
  const from = Math.min(selStart.value, selEnd.value)
  const to = Math.max(selStart.value, selEnd.value)
  focus()
  replaceRange(from, to, text)
}

const pasteClipboard = () => navigator.clipboard?.readText().then(paste).catch(() => {})

// Move keyboard focus off the input so a DOM selection in the output shows (and stays)
const releaseInput = () => screenEl.value?.focus({ preventScroll: true })

function selectNodes(first, last) {
  if (!first || !last) return
  releaseInput()
  const range = document.createRange()
  range.setStartBefore(first)
  range.setEndAfter(last)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Select All: scrollback and screen (or the pager's page)
function selectAll() {
  const host = pager.value ? pagerEl.value?.$el : screenEl.value
  const rows = host?.querySelectorAll(pager.value ? '.row' : '.line')
  if (rows?.length) selectNodes(rows[0], rows[rows.length - 1])
}

function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y)
    return pos && { node: pos.offsetNode, offset: pos.offset }
  }
  const range = document.caretRangeFromPoint?.(x, y)
  return range && { node: range.startContainer, offset: range.startOffset }
}

function selectionContains(x, y) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false
  const hit = caretAt(x, y)
  try {
    return !!hit && sel.getRangeAt(0).isPointInRange(hit.node, hit.offset)
  } catch {
    return false
  }
}

function selectWordAt(x, y) {
  const hit = caretAt(x, y)
  if (!hit || hit.node.nodeType !== Node.TEXT_NODE || !rootEl.value.contains(hit.node)) return
  const text = hit.node.data
  let start = hit.offset
  let end = hit.offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  if (start === end) return
  releaseInput()
  const range = document.createRange()
  range.setStart(hit.node, start)
  range.setEnd(hit.node, end)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Context menu (right-click / Ctrl-click): { x, y, text }
const menu = ref(null)

const menuItems = computed(() => {
  const text = menu.value?.text
  const canType = !busy.value && !pager.value
  return [
    { label: 'Copy', shortcut: SHORTCUTS.copy, disabled: !text, action: () => copy(text) },
    { label: 'Paste', shortcut: SHORTCUTS.paste, disabled: !canType || !navigator.clipboard?.readText, action: pasteClipboard },
    { label: 'Paste Selection', shortcut: SHORTCUTS.pasteSelection, disabled: !text || !canType, action: () => paste(text) },
    { separator: true },
    { label: 'Select All', shortcut: SHORTCUTS.selectAll, action: selectAll },
    { separator: true },
    {
      label: 'Clear Scrollback',
      shortcut: SHORTCUTS.clearScrollback,
      disabled: !!pager.value,
      action: () => props.session.clearScrollback(),
    },
  ]
})

function onContextmenu(e) {
  e.preventDefault()
  // like Cocoa text views: right-click outside the selection selects the word there
  const onInputSelection = e.target.closest?.('.selected') && selStart.value !== selEnd.value
  if (!onInputSelection && !selectionContains(e.clientX, e.clientY)) {
    window.getSelection()?.removeAllRanges()
    selectWordAt(e.clientX, e.clientY)
  }
  menu.value = { x: e.clientX, y: e.clientY, text: selectedText() || (onInputSelection ? segments.value.selected : '') }
}

function onScreenMousedown(e) {
  // right button: keep focus and selection for the context menu
  if (e.button === 2 || (e.button === 0 && e.ctrlKey && IS_MAC)) return e.preventDefault()
  // a plain click drops the input's own selection, as any click drops a selection
  if (e.button === 0 && !e.shiftKey && selStart.value !== selEnd.value) setCaret(selEnd.value)
}

function onKeydown(e) {
  const el = inputEl.value
  const { session } = props
  const key = e.key.toLowerCase()

  // The pager (alternate screen) owns the keyboard while open; Cmd stays with the browser
  if (pager.value) {
    if (!e.metaKey) {
      e.preventDefault()
      pagerEl.value?.handleKey(e)
    }
    return
  }

  // Cmd+A selects everything, as in Terminal.app (not just the input line)
  if (IS_MAC && e.metaKey && key === 'a') {
    e.preventDefault()
    return selectAll()
  }

  // Ctrl+Shift+C copies (Linux/Windows terminals)
  if (!IS_MAC && e.ctrlKey && e.shiftKey && key === 'c') {
    e.preventDefault()
    return copy(selectedText())
  }

  // Ctrl-only shortcuts (Cmd stays free for the browser/macOS: copy, paste, etc.)
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    switch (key) {
      case 'c':
        // with a selection, Ctrl+C copies outside macOS (the browser does it)
        if (!IS_MAC && el.selectionStart !== el.selectionEnd) return
        e.preventDefault()
        session.interrupt()
        return nextTick(() => setCaret(0))
      case 'l':
        e.preventDefault()
        return session.clear()
      case 'a':
        e.preventDefault()
        return setCaret(0)
      case 'e':
        e.preventDefault()
        return setCaret(input.value.length)
      case 'u':
        e.preventDefault()
        return replaceRange(0, el.selectionStart)
      case 'k':
        e.preventDefault()
        return replaceRange(el.selectionStart, input.value.length)
    }
  }

  // Cmd+K clears the scrollback like Terminal.app
  if (e.metaKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    return session.clearScrollback()
  }

  // While a command runs only Ctrl+C (handled above) and Cmd shortcuts work
  if (busy.value) {
    if (!e.metaKey) e.preventDefault()
    return
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault()
      session.submit()
      return nextTick(() => setCaret(0))
    case 'ArrowUp':
      e.preventDefault()
      if (session.historyPrev()) nextTick(() => setCaret(input.value.length))
      return
    case 'ArrowDown':
      e.preventDefault()
      if (session.historyNext()) nextTick(() => setCaret(input.value.length))
      return
    case 'Tab':
      // never let focus escape the terminal
      e.preventDefault()
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      session.complete(el.selectionEnd).then((caret) => caret != null && nextTick(() => setCaret(caret)))
      return
  }

  requestAnimationFrame(syncSelection)
}

// Keys pressed while the input isn't focused (e.g. after selecting output text).
// Modifiers alone and copy keep the selection; anything else goes to the input,
// which drops the selection, like typing in Terminal.app.
function onScreenKeydown(e) {
  if (e.target === inputEl.value || MODIFIERS.has(e.key)) return
  const key = e.key.toLowerCase()
  const copyKey = IS_MAC ? e.metaKey : e.ctrlKey
  if (!IS_MAC && e.ctrlKey && e.shiftKey && key === 'c') {
    e.preventDefault()
    return copy(selectedText())
  }
  // the browser copies the selection
  if (copyKey && !e.shiftKey && key === 'c' && selectedText()) return
  if (IS_MAC && e.metaKey && key === 'a') {
    e.preventDefault()
    return selectAll()
  }
  // other Cmd shortcuts stay with the browser; Cmd+V pastes into the input
  if (e.metaKey && key !== 'v' && key !== 'k') return
  focus()
  onKeydown(e)
}

// Clicking the screen focuses input, unless the user just selected some output.
// Option-click on the input line moves the caret there (Terminal.app's
// "Option-click to position cursor").
function onScreenMouseup(e) {
  if (e.button !== 0) return
  const selection = window.getSelection()
  // keep the keys coming here (not to <body>) while the selection shows
  if (selection && !selection.isCollapsed && rootEl.value.contains(selection.anchorNode)) return releaseInput()
  focus()
  if (e.altKey && !busy.value && !pager.value) placeCaretAt(e.clientX, e.clientY)
}

function placeCaretAt(x, y) {
  const line = rootEl.value.querySelector('.line.current')
  const hit = caretAt(x, y)
  if (!hit || !line?.contains(hit.node)) return
  const range = document.createRange()
  range.setStart(line, 0)
  range.setEnd(hit.node, hit.offset)
  const pos = range.toString().length - prompt.value.length
  setCaret(Math.max(0, Math.min(pos, input.value.length)))
}

function focus() {
  inputEl.value?.focus({ preventScroll: true })
  syncSelection()
}

// Cell size and screen padding, to size the window in cols × rows.
// The cell width comes from --term-cell-width (Terminal.app's grid); the font's
// own advance is measured and padded with letter-spacing to match it exactly.
function metrics() {
  const el = screenEl.value
  const styles = getComputedStyle(el)
  const natural = measureEl.value.getBoundingClientRect().width / 10
  const cellW = parseFloat(styles.getPropertyValue('--term-cell-width')) || natural
  // +0.001: WebKit computes 6.8 + 0.2 as just under 7 and rounds some glyphs a device
  // pixel left; the extra thousandth (0.08px over 80 columns) keeps them on the grid
  rootEl.value.style.setProperty('--term-letter-spacing', `${cellW - natural + 0.001}px`)
  return {
    cellW,
    cellH: parseFloat(styles.lineHeight),
    padX: parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) + (el.offsetWidth - el.clientWidth),
    padY: parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom),
  }
}

function blur() {
  inputEl.value?.blur()
}

const scrollToBottom = () => {
  nextTick(() => {
    const el = screenEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch([() => lines.value.length, input, pager, screenStart, completions], scrollToBottom)

// Report the grid size (cols × rows) for the window title.
let observer
const measure = () => {
  const el = screenEl.value
  if (!el || !measureEl.value?.offsetWidth) return
  const { cellW, cellH, padX, padY } = metrics()
  // epsilon: 80 × 6.95 must not floor to 79 because of float error
  cols.value = Math.max(1, Math.floor((el.offsetWidth - padX) / cellW + 1e-3))
  rows.value = Math.max(1, Math.floor((el.clientHeight - padY) / cellH + 1e-3))
  const styles = getComputedStyle(el)
  viewport.value = {
    height: el.clientHeight - parseFloat(styles.paddingBottom),
    padTop: parseFloat(styles.paddingTop),
  }
  emit('resize', { cols: cols.value, rows: rows.value })
}

// Switching the font preset (<html data-font>) or a web font finishing loading
// changes the natural advance, so the letter-spacing must be recomputed.
let fontObserver
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(screenEl.value)
  fontObserver = new MutationObserver(measure)
  fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-font'] })
  document.fonts?.addEventListener('loadingdone', measure)
  document.fonts?.ready.then(measure)
  scrollToBottom()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  fontObserver?.disconnect()
  document.fonts?.removeEventListener('loadingdone', measure)
})

defineExpose({ focus, blur, metrics })
</script>

<template>
  <div
    ref="rootEl"
    class="terminal"
    :class="{ 'is-focused': focused }"
    @mousedown="onScreenMousedown"
    @mouseup="onScreenMouseup"
    @keydown="onScreenKeydown"
    @contextmenu="onContextmenu"
  >
    <div ref="screenEl" class="screen" :class="{ 'is-alternate': pager }" tabindex="-1">
      <span ref="measureEl" class="measure" aria-hidden="true">MMMMMMMMMM</span>

      <OutputLine v-for="line in scrollback" :key="line.id" :line="line" />

      <div class="page" :style="screenStyle">
        <OutputLine v-for="line in screenLines" :key="line.id" :line="line" />

        <div class="line current">
          <template v-if="busy"><span class="cursor">{{ ' ' }}</span></template
          ><template v-else><span>{{ prompt }}</span>{{ segments.before
          }}<span v-if="segments.selected" class="selected">{{ segments.selected }}</span
          ><span v-else class="cursor">{{ segments.cursor }}</span>{{ segments.after }}</template
          ><textarea
            ref="inputEl"
            v-model="input"
            :readonly="busy"
            class="input"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            wrap="off"
            aria-label="Terminal input"
            @keydown="onKeydown"
            @keyup="syncSelection"
            @input="syncSelection"
            @select="syncSelection"
            @click="syncSelection"
          />
        </div>
        <div v-for="(row, i) in completionRows" :key="`completion-${i}`" class="line completion">{{ row }}</div>
      </div>
    </div>

    <OverlayScrollbar v-if="!pager" :target="screenEl" />

    <TerminalPager
      v-if="pager"
      :key="pager.id"
      ref="pagerEl"
      :lines="pager.lines"
      :title="pager.title"
      :cols="cols"
      :rows="rows"
      :focused="focused"
      @quit="pager.close()"
    />

    <ContextMenu v-if="menu" :items="menuItems" :x="menu.x" :y="menu.y" @close="menu = null" />
  </div>
</template>

<style scoped>
.terminal {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  color: var(--term-fg);
  font-family: var(--font-mono);
  font-size: var(--term-font-size);
  line-height: var(--term-line-height);
  letter-spacing: var(--term-letter-spacing, 0);
}

.terminal ::selection {
  background: var(--term-selection);
}

.screen {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: var(--term-padding);
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  background: var(--term-bg);
  white-space: pre-wrap;
  word-break: break-all;
  /* native scrollbar hidden; OverlayScrollbar draws the macOS one */
  scrollbar-width: none;
}

.screen::-webkit-scrollbar {
  display: none;
}

/* Alternate screen: scrollback is kept (and restored on exit) but not shown.
   opacity, not visibility, so the hidden textarea keeps keyboard focus. */
.screen.is-alternate :deep(.line) {
  opacity: 0;
}

.line {
  position: relative;
  min-height: 1lh;
}

.cursor {
  /* A block covering the whole cell, not just the glyph's content area */
  display: inline-block;
  height: 1lh;
  vertical-align: top;
  /* Unfocused window: hollow block, like Terminal.app — its sides measure
     1.5 / 1 / 1.5 / 1pt (left, top, bottom, right) plus 0.5pt past the cell's right edge */
  box-shadow:
    inset 1.5px 0 var(--term-cursor),
    inset 0 1px var(--term-cursor),
    inset 0 -1.5px var(--term-cursor),
    inset -1px 0 var(--term-cursor),
    0.5px 0 var(--term-cursor);
}

.is-focused .cursor {
  background: var(--term-cursor);
  color: #000;
  box-shadow: none;
}

.selected {
  background: var(--term-selection);
}

.terminal:not(.is-focused) ::selection,
.terminal:not(.is-focused) .selected {
  background: var(--term-selection-unfocused);
}

.measure {
  position: absolute;
  letter-spacing: 0;
  visibility: hidden;
  white-space: pre;
  pointer-events: none;
}

.input {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  resize: none;
  overflow: hidden;
  pointer-events: none;
}
</style>
