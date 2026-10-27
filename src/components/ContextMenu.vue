<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // [{ label, action?, disabled?, shortcut? } | { separator: true }]
  items: { type: Array, required: true },
  // Viewport point the menu opens at (the pointer)
  x: { type: Number, required: true },
  y: { type: Number, required: true },
})

const emit = defineEmits(['close'])

const EDGE = 6 // kept clear of the viewport's edges
const FLASH_MS = 160

const menuEl = ref()
const active = ref(-1)
const flashing = ref(false)
const pos = ref({ left: props.x, top: props.y })

const selectable = (item) => item && !item.separator && !item.disabled
const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px` }))

// macOS opens context menus with their top-left at the pointer, flipping
// left/up where they'd run off the screen
function place() {
  const { offsetWidth: w, offsetHeight: h } = menuEl.value
  let left = props.x
  let top = props.y
  if (left + w > window.innerWidth - EDGE) left = Math.max(EDGE, left - w)
  if (top + h > window.innerHeight - EDGE) top = Math.max(EDGE, top - h)
  pos.value = { left, top }
}

// macOS blinks the chosen item before the menu goes away
function choose(index) {
  const item = props.items[index]
  if (!selectable(item) || flashing.value) return
  active.value = index
  flashing.value = true
  setTimeout(() => {
    emit('close')
    item.action?.()
  }, FLASH_MS)
}

function step(dir) {
  const n = props.items.length
  let i = active.value
  for (let k = 0; k < n; k++) {
    i = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n
    if (selectable(props.items[i])) return (active.value = i)
  }
}

// While open the menu takes the keyboard, so keys don't reach the terminal
function onKeydown(e) {
  e.preventDefault()
  e.stopPropagation()
  if (flashing.value) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowDown') step(1)
  else if (e.key === 'ArrowUp') step(-1)
  else if (e.key === 'Enter' || e.key === ' ') {
    if (active.value >= 0) choose(active.value)
    else emit('close')
  }
}

function onPointerdown(e) {
  if (!menuEl.value.contains(e.target)) emit('close')
}

const onBlur = () => emit('close')

onMounted(() => {
  place()
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('pointerdown', onPointerdown, true)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', onBlur)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('pointerdown', onPointerdown, true)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('resize', onBlur)
})
</script>

<template>
  <Teleport to="body">
    <!-- mousedown: keep the text selection, and don't let the window think it lost focus -->
    <div
      ref="menuEl"
      class="context-menu"
      role="menu"
      :style="style"
      @mousedown.prevent.stop
      @contextmenu.prevent
      @mouseleave="flashing || (active = -1)"
    >
      <template v-for="(item, i) in items" :key="i">
        <div v-if="item.separator" class="separator" role="separator" />
        <div
          v-else
          class="item"
          role="menuitem"
          :aria-disabled="item.disabled || undefined"
          :class="{ active: active === i, disabled: item.disabled, flashing: flashing && active === i }"
          @mouseenter="flashing || (active = selectable(item) ? i : -1)"
          @mouseup="choose(i)"
        >
          <span class="label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 180px;
  padding: 5px;
  border-radius: 12px;
  background: rgba(36, 36, 38, 0.72);
  backdrop-filter: blur(30px) saturate(1.8);
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
  box-shadow:
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.2),
    0 0 0 0.5px rgba(0, 0, 0, 0.5),
    0 10px 30px rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.88);
  font: 13px/1 var(--font-ui);
  letter-spacing: normal;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}

.item {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 24px;
  padding: 0 10px 0 22px;
  border-radius: 6px;
}

.label {
  flex: 1;
}

.shortcut {
  color: rgba(255, 255, 255, 0.45);
}

.item.active {
  background: var(--menu-highlight, #0a68d9);
  color: #fff;
}

.item.active .shortcut {
  color: rgba(255, 255, 255, 0.8);
}

.item.disabled,
.item.disabled .shortcut {
  color: rgba(255, 255, 255, 0.28);
}

.item.flashing {
  animation: flash 160ms steps(1) both;
}

@keyframes flash {
  0% { background: transparent; color: rgba(255, 255, 255, 0.88); }
  50%, 100% { background: var(--menu-highlight, #0a68d9); color: #fff; }
}

.separator {
  height: 1px;
  margin: 5px 10px;
  background: rgba(255, 255, 255, 0.12);
}
</style>
