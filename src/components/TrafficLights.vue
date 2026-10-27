<script setup>
import { ref } from 'vue'
import trafficLights from 'macos-traffic-lights'

const props = defineProps({
  focused: { type: Boolean, default: true },
  // A command is running: the close button shows a dot, like Terminal.app
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'minimize', 'maximize'])

const buttons = [
  { name: 'close', label: 'Close' },
  { name: 'minimize', label: 'Minimize' },
  { name: 'maximize', label: 'Zoom' },
]

// Like macOS: hovering the group reveals glyphs on all three buttons.
const hovered = ref(false)
const pressed = ref(null)

function iconFor(name) {
  if (pressed.value === name) return trafficLights[name].active
  if (hovered.value) return trafficLights[name].hover
  const busy = props.busy && name === 'close'
  if (!props.focused) return busy ? trafficLights.unfocusedBusy : trafficLights.unfocused
  return busy ? trafficLights.close.busy : trafficLights[name].default
}

function press(name) {
  pressed.value = name
  window.addEventListener('mouseup', () => (pressed.value = null), { once: true })
}

// the event goes along so the window can tell an Option-click (zoom)
function release(name, e) {
  if (pressed.value === name) emit(name, e)
}
</script>

<template>
  <div
    class="traffic-lights"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @mousedown.stop.prevent
    @dblclick.stop
  >
    <button
      v-for="button in buttons"
      :key="button.name"
      type="button"
      class="light"
      :aria-label="button.label"
      tabindex="-1"
      @mousedown.left="press(button.name)"
      @mouseup.left="release(button.name, $event)"
    >
      <img :src="iconFor(button.name)" alt="" draggable="false" />
    </button>
  </div>
</template>

<style scoped>
.traffic-lights {
  display: flex;
  gap: 9px;
  align-items: center;
}

.light {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  background: none;
  cursor: inherit;
  outline: none;
}

.light img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
