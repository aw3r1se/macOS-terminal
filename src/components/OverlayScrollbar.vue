<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

// macOS overlay scroller: hidden at rest, shown while the user scrolls and
// faded out shortly after. In macOS 26 Terminal.app hovering neither widens
// it nor keeps it on screen; it can still be dragged while it is shown.
const props = defineProps({
  // The scrolling element (its native scrollbar should be hidden)
  target: { type: Object, default: null },
})

// Terminal.app: fully shown for ~0.5s after the last scroll, then a ~0.18s fade
const HIDE_DELAY_MS = 500
const MIN_THUMB = 20
// Terminal.app: a 6pt knob, 3pt from the right edge and from both ends of the track
const INSET = 3

const metrics = ref({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
const active = ref(false) // recently scrolled by the user
const dragging = ref(false)

const scrollable = computed(() => metrics.value.scrollHeight > metrics.value.clientHeight + 1)
const visible = computed(() => scrollable.value && (active.value || dragging.value))

const track = computed(() => Math.max(0, metrics.value.clientHeight - INSET * 2))
const thumbSize = computed(() => {
  const { clientHeight, scrollHeight } = metrics.value
  return Math.min(track.value, Math.max(MIN_THUMB, (track.value * clientHeight) / scrollHeight))
})
const maxScroll = computed(() => metrics.value.scrollHeight - metrics.value.clientHeight)
const thumbOffset = computed(() =>
  maxScroll.value > 0 ? (metrics.value.scrollTop / maxScroll.value) * (track.value - thumbSize.value) : 0,
)

const update = () => {
  const el = props.target
  if (el) metrics.value = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
}

let hideTimer
const flash = () => {
  update()
  active.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (active.value = false), HIDE_DELAY_MS)
}

// Only user scrolling (wheel / trackpad / touch) reveals the scroller;
// output auto-scrolling to the bottom just moves it while hidden.
const userEvents = ['wheel', 'touchmove']

let resizeObserver
let mutationObserver
watch(
  () => props.target,
  (el, old) => {
    if (old) {
      old.removeEventListener('scroll', update)
      userEvents.forEach((type) => old.removeEventListener(type, flash))
    }
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    if (!el) return

    el.addEventListener('scroll', update, { passive: true })
    userEvents.forEach((type) => el.addEventListener(type, flash, { passive: true }))
    resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    // Content height changes with output; scroll events don't cover that
    mutationObserver = new MutationObserver(update)
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })
    update()
  },
  { immediate: true },
)

// Dragging the thumb
let dragStart = { y: 0, scrollTop: 0 }
function onThumbMousedown(e) {
  dragging.value = true
  dragStart = { y: e.clientY, scrollTop: props.target.scrollTop }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag, { once: true })
}

function onDrag(e) {
  const room = track.value - thumbSize.value
  if (room <= 0) return
  props.target.scrollTop = dragStart.scrollTop + ((e.clientY - dragStart.y) / room) * maxScroll.value
}

function endDrag() {
  dragging.value = false
  window.removeEventListener('mousemove', onDrag)
  flash()
}

// The scroller sits above the content, so wheel events over it are forwarded
function onWheel(e) {
  props.target.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  flash()
}

// Clicking the track jumps a page toward the click (macOS default)
function onTrackMousedown(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const y = e.clientY - rect.top - INSET
  const page = metrics.value.clientHeight
  props.target.scrollTop += y < thumbOffset.value ? -page : page
}

onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  window.removeEventListener('mousemove', onDrag)
  const el = props.target
  if (el) {
    el.removeEventListener('scroll', update)
    userEvents.forEach((type) => el.removeEventListener(type, flash))
  }
})
</script>

<template>
  <div
    v-if="scrollable"
    class="scroller"
    :class="{ visible }"
    @mousedown.self.prevent="onTrackMousedown"
    @wheel.prevent="onWheel"
  >
    <div
      class="thumb"
      :style="{ height: `${thumbSize}px`, transform: `translateY(${thumbOffset}px)` }"
      @mousedown.prevent.stop="onThumbMousedown"
    />
  </div>
</template>

<style scoped>
/* The knob's column on the right edge; only takes the mouse while shown */
.scroller {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 15px;
  padding: 3px;
  cursor: default;
  pointer-events: none;
}

.scroller.visible {
  pointer-events: auto;
}

.thumb {
  width: 6px;
  margin-left: auto;
  border-radius: 999px;
  /* #9a9a9a over the Basic background, as measured */
  background: rgba(255, 255, 255, 0.55);
  opacity: 0;
  transition: opacity 180ms linear;
}

/* appears at once, fades out */
.visible .thumb {
  opacity: 1;
  transition: none;
}
</style>
