<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useDragResize, Resizers } from '@aw3r1se/vue-dragresize'
import { useFocus } from '@aw3r1se/vue-focus'
import { useTerminal } from '../terminal/session'
import { genie, snapshot } from '../terminal/genie'
import TrafficLights from './TrafficLights.vue'
import TerminalScreen from './TerminalScreen.vue'

const props = defineProps({
  // Commands the shell runs: an array of defineCommand() objects, or a { name: command } map
  commands: { type: [Array, Object], default: () => [] },
  // Extra fields for every command's context, e.g. { api }
  context: { type: Object, default: () => ({}) },
  user: { type: String, default: 'guest' },
  host: { type: String, default: 'MacBook-Pro' },
  home: { type: String, default: undefined },
  tty: { type: String, default: 'ttys000' },
  // Print "Last login: …" on start, as Terminal.app does
  lastLogin: { type: Boolean, default: true },
  // Initial window size in character cells (Terminal.app's default profile: 80×24);
  // the user resizes it from there. Clamped to the viewport.
  cols: { type: Number, default: 80 },
  rows: { type: Number, default: 24 },
  // Space kept between the window and the viewport edges, px. Inset the
  // window's container by the same amount, so "zoom" fills it exactly.
  margin: { type: Number, default: 10 },
})


const emit = defineEmits(['close', 'minimize'])

const MARGIN = props.margin
// Terminal.app entering/leaving full screen: ~0.4s from the window to the screen
const FULLSCREEN_MS = 400

const { geom, flags, style, beginDrag, beginResize, toggleMaximize } = useDragResize({
  minSize: 240,
  marginPx: MARGIN,
  // snapping to the character grid is done below, per axis
  stepPx: 1,
})

const windowEl = ref()
const screen = ref()
const titlebarEl = ref()
const { isFocused } = useFocus(windowEl, { initialValue: true })

const grid = reactive({ cols: props.cols, rows: props.rows })
const session = useTerminal({
  commands: () => props.commands,
  context: () => props.context,
  user: props.user,
  host: props.host,
  home: props.home,
  tty: props.tty,
  lastLogin: props.lastLogin,
  getCols: () => grid.cols,
})
const title = computed(() => `${session.titleDirectory.value} — ${session.foreground.value} — ${grid.cols}×${grid.rows}`)

const onGridResize = ({ cols, rows }) => Object.assign(grid, { cols, rows })

// Drag by the title bar only; preventDefault keeps the textarea focused
// and stops the title text from being selected.
function onTitlebarMousedown(e) {
  if (e.button !== 0) return
  e.preventDefault()
  isFocused.value = true
  if (!fullscreen.value) beginDrag(e)
}

// macOS default for a double-click on the title bar: Zoom (not in full screen)
function onTitlebarDblclick() {
  if (!fullscreen.value) toggleMaximize()
}

const focus = () => {
  isFocused.value = true
  nextTick(() => screen.value?.focus())
}

watch(isFocused, (focused) => (focused ? screen.value?.focus() : screen.value?.blur()))

// Minimized: the window is hidden while the genie copies (and then the Dock
// thumbnail) stand in for it.
const hidden = ref(false)

async function minimizeTo(target) {
  const shot = snapshot(windowEl.value)
  const from = windowEl.value.getBoundingClientRect()
  hidden.value = true
  isFocused.value = false
  await genie(shot, from, target)
  return shot
}

async function restoreFrom(source, shot) {
  await genie(shot, windowEl.value.getBoundingClientRect(), source, { reverse: true })
  hidden.value = false
  focus()
}

// Full screen (the green button): the page goes full screen too, so the browser
// window itself plays macOS's full-screen transition. The title bar hides and
// slides back in when the pointer reaches the top edge, as in Terminal.app.
const fullscreen = ref(false)
const fullscreenAnimating = ref(false)
const titlebarRevealed = ref(false)
let animTimer

function animateFullscreen() {
  fullscreenAnimating.value = true
  clearTimeout(animTimer)
  animTimer = setTimeout(() => (fullscreenAnimating.value = false), FULLSCREEN_MS)
}

function enterFullscreen() {
  if (fullscreen.value) return
  animateFullscreen()
  fullscreen.value = true
  titlebarRevealed.value = false
  document.documentElement.requestFullscreen?.().catch(() => {})
  focus()
}

function exitFullscreen() {
  if (!fullscreen.value) return
  animateFullscreen()
  fullscreen.value = false
  titlebarRevealed.value = false
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  focus()
}

// Esc / the browser's own controls leave full screen
function onFullscreenChange() {
  if (!document.fullscreenElement) exitFullscreen()
}

// Green button: full screen; Option-click zooms instead, like macOS
function onGreen(e) {
  if (fullscreen.value) exitFullscreen()
  else if (e?.altKey) toggleMaximize()
  else enterFullscreen()
}

function onPointerMove(e) {
  if (!fullscreen.value) return
  if (e.clientY <= 2) titlebarRevealed.value = true
  else if (titlebarRevealed.value && e.clientY > titlebarEl.value.offsetHeight + 8) titlebarRevealed.value = false
}

const windowStyle = computed(() => {
  const base = { ...style.value }
  if (fullscreen.value) {
    // the workspace is inset by MARGIN; full screen covers the whole viewport
    Object.assign(base, { left: `${-MARGIN}px`, top: `${-MARGIN}px`, width: '100vw', height: '100vh' })
  }
  if (fullscreenAnimating.value) {
    const ease = `${FULLSCREEN_MS}ms cubic-bezier(.4,0,.2,1)`
    base.transition = `left ${ease}, top ${ease}, width ${ease}, height ${ease}, border-radius ${ease}`
  }
  if (hidden.value) Object.assign(base, { visibility: 'hidden', pointerEvents: 'none' })
  return base
})

// Like Terminal.app, resizing snaps the window to whole cells: its size is always
// the chrome plus cols × cellW and rows × cellH, rounded to the nearest cell.
// A left/top handle keeps the opposite edge anchored, so x/y move with the snap.
let resizeStart = null
watch(
  () => flags.isResizing,
  (resizing) => (resizeStart = resizing ? { x: geom.x, y: geom.y } : null),
  { flush: 'sync' },
)

watch(
  () => [geom.w, geom.h],
  ([w, h]) => {
    if (!resizeStart || !screen.value) return
    const { cellW, cellH, padX, padY } = screen.value.metrics()
    const chromeH = padY + titlebarEl.value.offsetHeight
    const snappedW = padX + Math.max(1, Math.round((w - padX) / cellW)) * cellW
    const snappedH = chromeH + Math.max(1, Math.round((h - chromeH) / cellH)) * cellH
    if (geom.x !== resizeStart.x) geom.x += w - snappedW
    if (geom.y !== resizeStart.y) geom.y += h - snappedH
    geom.w = snappedW
    geom.h = snappedH
  },
  { flush: 'sync' },
)


onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('mousemove', onPointerMove)
  // useDragResize starts maximized — open as a regular centered cols×rows window instead.
  const maxW = window.innerWidth - MARGIN * 2
  const maxH = window.innerHeight - MARGIN * 2
  const { cellW, cellH, padX, padY } = screen.value.metrics()
  const w = Math.min(Math.ceil(props.cols * cellW + padX), maxW)
  const h = Math.min(Math.ceil(props.rows * cellH + padY + titlebarEl.value.offsetHeight), maxH)
  flags.isMax = false
  Object.assign(geom, {
    w,
    h,
    x: Math.floor((maxW - w) / 2),
    y: Math.floor((maxH - h) / 3),
  })
  focus()
})

onBeforeUnmount(() => {
  clearTimeout(animTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('mousemove', onPointerMove)
  if (fullscreen.value && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
})

defineExpose({ title, session, focus, isFocused, minimizeTo, restoreFrom })
</script>

<template>
  <div
    ref="windowEl"
    class="terminal-window"
    :class="{
      'is-focused': isFocused,
      'is-max': flags.isMax && !fullscreen,
      'is-fullscreen': fullscreen,
      'is-titlebar-revealed': titlebarRevealed,
      'is-busy': flags.isDragging || flags.isResizing,
      'has-process': session.busy.value,
    }"
    :style="windowStyle"
  >
    <!-- clips content to the rounded corners; resize handles stay outside it -->
    <div class="window-body">
      <header ref="titlebarEl" class="titlebar" @mousedown="onTitlebarMousedown" @dblclick="onTitlebarDblclick">
        <TrafficLights
          class="titlebar-lights"
          :focused="isFocused"
          :busy="session.busy.value"
          @close="emit('close')"
          @minimize="emit('minimize')"
          @maximize="onGreen"
        />
        <div class="titlebar-title">
          <!-- proxy icon: the working directory (home folder) -->
          <!-- traced from Terminal.app at @2x: one viewBox unit = one device pixel -->
          <svg class="titlebar-icon" viewBox="0 0 28 25" aria-hidden="true">
            <defs>
              <linearGradient id="titlebar-icon-back" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#73caef" />
                <stop offset="1" stop-color="#32a2d5" />
              </linearGradient>
              <linearGradient id="titlebar-icon-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#7cd1f7" />
                <stop offset="0.9" stop-color="#48aad8" />
                <stop offset="1" stop-color="#3a95c2" />
              </linearGradient>
            </defs>
            <path d="M0 2.5Q0 0 2.5 0H10.5Q12 0 12.8 1.2L13.5 2H25.5Q28 2 28 4.5V8H0z" fill="url(#titlebar-icon-back)" />
            <rect x="2" y="4" width="24" height="2" fill="#fff" />
            <rect x="3" y="23" width="22" height="2" rx="1" fill="rgba(255, 255, 255, 0.16)" />
            <rect y="6" width="28" height="18" rx="2" fill="url(#titlebar-icon-front)" />
          </svg>
          <span>{{ title }}</span>
        </div>
      </header>

      <TerminalScreen
        ref="screen"
        :session="session"
        :focused="isFocused"
        @resize="onGridResize"
      />
    </div>

    <Resizers v-if="!flags.isMax && !fullscreen" @resize-start="beginResize" />
  </div>
</template>

<style scoped>
.terminal-window {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: var(--window-radius);
  corner-shape: var(--window-corner-shape);
  background: var(--term-bg);
  box-shadow: var(--window-outline-unfocused), var(--window-shadow-unfocused);
  transform-origin: center;
}

.terminal-window.is-focused {
  box-shadow: var(--window-outline), var(--window-shadow);
}

.window-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
  corner-shape: inherit;
}

/* 1px light window border drawn above the content; the top edge is brighter
   and its outer half brighter still */
.terminal-window::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 20;
  border: 1px solid var(--window-border);
  border-top-color: var(--window-border-top);
  border-radius: inherit;
  corner-shape: inherit;
  /* painted under the border, so it brightens the border's outer half only */
  background: linear-gradient(var(--window-highlight-top) 0.5px, transparent 0.5px) border-box;
  pointer-events: none;
}

.terminal-window.is-busy {
  user-select: none;
}

/* No separator line: the title bar meets the screen with a hard edge */
.titlebar {
  position: relative;
  flex: none;
  display: flex;
  align-items: flex-start;
  height: var(--titlebar-height);
  padding: 0 12px 0 9px;
  background: var(--titlebar-bg-unfocused);
  color: var(--titlebar-fg-unfocused);
  user-select: none;
}

.is-focused .titlebar {
  background: var(--titlebar-bg);
  color: var(--titlebar-fg);
}

/* centers the 14pt lights at 15.75pt from the top, as on macOS */
.titlebar-lights,
.titlebar-title {
  height: 31.5px;
}

.titlebar-lights {
  position: relative;
  z-index: 1;
  flex: none;
}

.titlebar-title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-left: 14px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.titlebar-title span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.titlebar-icon {
  flex: none;
  width: 14px;
  height: 12.5px;
  translate: 0 -0.5px;
}

/* a running command dims the proxy icon */
.has-process .titlebar-icon {
  opacity: 0.5;
}

.terminal-window:not(.is-focused) .titlebar-icon {
  opacity: 0.5;
  filter: grayscale(1);
}

/* Full screen: no corners, border or shadow; the title bar leaves the layout
   and slides down over the content when revealed */
.terminal-window.is-fullscreen {
  border-radius: 0;
  box-shadow: none;
}

.is-fullscreen::after {
  display: none;
}

.is-fullscreen .titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  transform: translateY(-100%);
  transition: transform 200ms ease;
}

.is-fullscreen.is-titlebar-revealed .titlebar {
  transform: none;
}

/* both dimmings multiply in an unfocused window with a running command */
.terminal-window:not(.is-focused).has-process .titlebar-icon {
  opacity: 0.25;
}
</style>
