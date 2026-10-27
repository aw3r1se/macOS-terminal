<script setup>
import { ref, reactive, computed, watch } from 'vue'
import TermSegments from './TermSegments.vue'
import { fold, highlight, searchRegex, lineText, HELP_LINES } from '../terminal/pager'

const props = defineProps({
  lines: { type: Array, required: true },
  // Shown in the prompt, e.g. "Manual page ls(1)"; without it less shows ':' / '(END)'
  title: { type: String, default: null },
  cols: { type: Number, required: true },
  rows: { type: Number, required: true },
  focused: { type: Boolean, default: true },
})

const emit = defineEmits(['quit'])

const el = ref()

// Document stack: the page itself, plus the help screen on top while open
const docs = reactive([{ lines: props.lines, title: props.title, help: false, top: 0 }])
const doc = computed(() => docs[docs.length - 1])

const folded = computed(() => fold(doc.value.lines, props.cols))
const pageSize = computed(() => Math.max(1, props.rows - 1))
const maxTop = computed(() => Math.max(0, folded.value.length - pageSize.value))
const bottom = computed(() => Math.min(doc.value.top + pageSize.value, folded.value.length))
const atEnd = computed(() => bottom.value >= folded.value.length)

// less "window" / "half-window", changeable with Nz / Nd
const windowSize = ref(null)
const halfSize = ref(null)

const search = reactive({ regex: null, backward: false })
const mode = ref('normal') // 'normal' | 'search' | 'message'
const searchInput = ref('')
const message = ref('')
let count = ''
let pending = null // multi-key commands: ':q', 'ZZ', 'ESC-v'

watch(maxTop, (max) => {
  if (doc.value.top > max) doc.value.top = max
})

const goTo = (line) => {
  doc.value.top = Math.min(Math.max(0, line), maxTop.value)
}
const scroll = (delta) => goTo(doc.value.top + delta)

function quit() {
  if (docs.length > 1) docs.pop()
  else emit('quit')
}

function showMessage(text) {
  message.value = text
  mode.value = 'message'
}

function find(backward, times = 1) {
  if (!search.regex) return showMessage('No previous regular expression  (press RETURN)')
  const test = new RegExp(search.regex.source, search.regex.flags.replace('g', ''))
  const step = backward ? -1 : 1
  let line = doc.value.top
  for (let found = 0; found < times; ) {
    line += step
    if (line < 0 || line >= folded.value.length) return showMessage('Pattern not found  (press RETURN)')
    if (test.test(lineText(folded.value[line]))) found++
  }
  goTo(line)
}

function runSearch() {
  const pattern = searchInput.value
  mode.value = 'normal'
  // Empty pattern repeats the previous search
  if (pattern) {
    const regex = searchRegex(pattern)
    if (!regex) return showMessage('Invalid pattern  (press RETURN)')
    search.regex = regex
  }
  find(search.backward)
}

function onSearchKey(e) {
  if (e.key === 'Enter') return runSearch()
  if (e.key === 'Escape' || (e.key === 'Backspace' && !searchInput.value)) {
    mode.value = 'normal'
    return
  }
  if (e.key === 'Backspace') searchInput.value = searchInput.value.slice(0, -1)
  else if (e.key.length === 1 && !e.ctrlKey) searchInput.value += e.key
}

const CTRL = {
  e: 'down', n: 'down', y: 'up', p: 'up', k: 'up',
  f: 'pageDown', v: 'pageDown', b: 'pageUp', d: 'halfDown', u: 'halfUp',
}

function act(action, n) {
  const win = n ?? windowSize.value ?? pageSize.value
  const half = halfSize.value ?? Math.floor(pageSize.value / 2)
  switch (action) {
    case 'down': return scroll(n ?? 1)
    case 'up': return scroll(-(n ?? 1))
    case 'pageDown': return scroll(win)
    case 'pageUp': return scroll(-win)
    case 'halfDown':
      if (n) halfSize.value = n
      return scroll(n ?? half)
    case 'halfUp':
      if (n) halfSize.value = n
      return scroll(-(n ?? half))
    case 'top': return goTo(n ? n - 1 : 0)
    case 'bottom': return goTo(n ? n - 1 : maxTop.value)
  }
}

/** Called by the terminal for every keydown while the pager is open. */
function handleKey(e) {
  if (mode.value === 'message') {
    mode.value = 'normal'
    return
  }
  if (mode.value === 'search') return onSearchKey(e)

  const key = e.key
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) return

  if (pending) {
    const prefix = pending
    pending = null
    if (prefix === ':' && (key === 'q' || key === 'Q')) return quit()
    if (prefix === 'Z' && key === 'Z') return quit()
    if (prefix === 'Escape') {
      if (key === 'v') return act('pageUp')
      if (key === '<') return act('top')
      if (key === '>') return act('bottom')
    }
    return
  }

  if (e.ctrlKey) {
    const action = CTRL[key.toLowerCase()]
    if (action) act(action, count ? Number(count) : null)
    count = ''
    return
  }

  if (/^[0-9]$/.test(key)) {
    count += key
    return
  }
  const n = count ? Number(count) : null
  count = ''

  switch (key) {
    case 'q':
    case 'Q':
      return quit()
    case 'h':
    case 'H':
      if (!doc.value.help) docs.push({ lines: HELP_LINES, title: null, help: true, top: 0 })
      return
    case ':':
    case 'Z':
    case 'Escape':
      pending = key
      return
    case 'Enter':
    case 'j':
    case 'e':
    case 'ArrowDown':
      return act('down', n)
    case 'k':
    case 'y':
    case 'ArrowUp':
      return act('up', n)
    case ' ':
    case 'f':
    case 'PageDown':
      return act('pageDown', n)
    case 'b':
    case 'PageUp':
      return act('pageUp', n)
    case 'z':
    case 'w':
      if (n) windowSize.value = n
      return act(key === 'z' ? 'pageDown' : 'pageUp')
    case 'd':
      return act('halfDown', n)
    case 'u':
      return act('halfUp', n)
    case 'g':
    case '<':
    case 'Home':
      return act('top', n)
    case 'G':
    case '>':
    case 'End':
      return act('bottom', n)
    case '/':
    case '?':
      search.backward = key === '?'
      searchInput.value = ''
      mode.value = 'search'
      return
    case 'n':
      return find(search.backward, n ?? 1)
    case 'N':
      return find(!search.backward, n ?? 1)
  }
}

// Terminal.app turns the scroll wheel into arrow keys in the alternate screen
let wheelDelta = 0
function onWheel(e) {
  const lineHeight = parseFloat(getComputedStyle(el.value).lineHeight) || 14
  wheelDelta += e.deltaMode === 1 ? e.deltaY * lineHeight : e.deltaY
  const lines = Math.trunc(wheelDelta / lineHeight)
  if (lines) {
    scroll(lines)
    wheelDelta -= lines * lineHeight
  }
}

const visible = computed(() => {
  const rows = []
  for (let i = 0; i < pageSize.value; i++) {
    const line = folded.value[doc.value.top + i]
    // Lines past the end of a short file are shown as '~'
    rows.push(line ? highlight(line, search.regex) : [{ text: '~' }])
  }
  return rows
})

const status = computed(() => {
  if (mode.value === 'message') return [{ text: message.value, inverse: true }]

  const { title, help, top } = doc.value
  if (help) {
    const text = atEnd.value
      ? 'HELP -- END -- Press g to see it again, or q when done'
      : 'HELP -- Press RETURN for more, or q when done'
    return [{ text, inverse: true }]
  }
  if (title) {
    const total = folded.value.length
    const position = atEnd.value ? '(END)' : `${Math.round((bottom.value / total) * 100)}%`
    return [{ text: ` ${title} line ${top + 1}/${total} ${position} (press h for help or q to quit)`, inverse: true }]
  }
  return atEnd.value ? [{ text: '(END)', inverse: true }] : [{ text: ':' }]
})

defineExpose({ handleKey })
</script>

<template>
  <div ref="el" class="pager" :class="{ 'is-focused': focused }" @wheel.prevent="onWheel">
    <div v-for="(row, i) in visible" :key="i" class="row"><TermSegments :segments="row" /></div>
    <div class="row">
      <template v-if="mode === 'search'"
        >{{ search.backward ? '?' : '/' }}{{ searchInput }}<span class="cursor">{{ ' ' }}</span></template
      ><template v-else><TermSegments :segments="status" /><span class="cursor">{{ ' ' }}</span></template>
    </div>
  </div>
</template>

<style scoped>
.pager {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: var(--term-padding);
  overflow: hidden;
  background: var(--term-bg);
  white-space: pre;
}

.row {
  height: 1lh;
}

/* Same block cursor as the prompt's (TerminalScreen.vue) */
.cursor {
  display: inline-block;
  height: 1lh;
  vertical-align: top;
  box-shadow:
    inset 1.5px 0 var(--term-cursor),
    inset 0 1px var(--term-cursor),
    inset 0 -1.5px var(--term-cursor),
    inset -1px 0 var(--term-cursor),
    0.5px 0 var(--term-cursor);
}

.is-focused .cursor {
  background: var(--term-cursor);
  box-shadow: none;
}
</style>
