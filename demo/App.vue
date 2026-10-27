<script setup>
import { ref, computed, nextTick } from 'vue'
import { TerminalWindow } from '../src'
import { AppDock } from '@aw3r1se/macos-dock'
import TerminalIcon from './TerminalIcon.vue'
import { commands } from './commands'
import { fs } from './fs'

// Every command gets the (in-memory) file system as ctx.fs
const context = { fs }

const REPO = 'https://github.com/aw3r1se/macOS-terminal'

// 'open' | 'hidden' | 'minimizing' | 'minimized' | 'restoring' | 'closed'
const status = ref('open')
const terminal = ref()
const dock = ref()
// Snapshot of the minimized window (its Dock tile and the genie copies)
const thumb = ref(null)

const isOpen = computed(() => status.value !== 'closed')
const hasTile = computed(() => ['minimizing', 'minimized', 'restoring'].includes(status.value))

// Show/hide the Dock when the pointer reaches the bottom edge
const autohide = ref(true)

const WINDOW_ID = 'terminal-window'
const WINDOW_MARKS = { open: 'check', minimized: 'diamond' }

// Right-click menu of the Dock icon, as macOS builds it: the app's windows,
// then Hide/Show and Quit (Option: Force Quit); just Open when not running
const appMenu = computed(() => {
  if (!isOpen.value) return [{ label: 'Open', action: activate }]
  return [
    { label: terminal.value?.title ?? 'Terminal', mark: WINDOW_MARKS[status.value], action: activate },
    { separator: true },
    status.value === 'hidden' ? { label: 'Show', action: activate } : { label: 'Hide', action: hide },
    { label: 'Quit', action: quit, alt: { label: 'Force Quit' } },
  ]
})

const apps = computed(() => [
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon, running: isOpen.value, menu: appMenu.value },
])
const windows = computed(() =>
  hasTile.value ? [{ id: WINDOW_ID, app: 'terminal', thumb: status.value === 'minimized' ? thumb.value : null }] : [],
)

async function minimize() {
  if (status.value !== 'open') return
  status.value = 'minimizing'
  await nextTick()
  const el = terminal.value.$el
  const target = dock.value.thumbRect(WINDOW_ID, el.offsetWidth, el.offsetHeight)
  const shot = await terminal.value.minimizeTo(target)
  // quit while it flew
  if (status.value !== 'minimizing') return
  thumb.value = shot
  status.value = 'minimized'
}

async function restore() {
  if (status.value !== 'minimized') return
  const el = terminal.value.$el
  const source = dock.value.thumbRect(WINDOW_ID, el.offsetWidth, el.offsetHeight)
  const shot = thumb.value
  thumb.value = null
  status.value = 'restoring'
  await terminal.value.restoreFrom(source, shot)
  if (status.value === 'restoring') status.value = 'open'
}

function hide() {
  if (status.value === 'open') status.value = 'hidden'
}

function quit() {
  thumb.value = null
  status.value = 'closed'
}

// Clicking the app icon brings a minimized or hidden window back, like macOS
function activate() {
  if (status.value === 'minimized') return restore()
  if (status.value === 'hidden') status.value = 'open'
  if (status.value === 'open') return nextTick(() => terminal.value?.focus())
  if (status.value === 'closed') status.value = 'open'
}
</script>

<template>
  <main class="desktop">
    <div class="workspace">
      <Transition name="window">
        <TerminalWindow
          v-if="isOpen"
          v-show="status !== 'hidden'"
          ref="terminal"
          :commands="commands"
          :context="context"
          @close="status = 'closed'"
          @minimize="minimize"
        />
      </Transition>
    </div>

    <aside class="about">
      <a :href="REPO" target="_blank" rel="noopener">@aw3r1se/macos-terminal</a>
      <span>type <b>help</b> · Tab completes · right-click for the menu · Dock at the bottom edge</span>
    </aside>

    <AppDock
      ref="dock"
      :apps="apps"
      :windows="windows"
      v-model:autohide="autohide"
      :pinned="status !== 'open'"
      @activate="activate"
      @restore="restore"
    />
  </main>
</template>

<style scoped>
.desktop {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(120% 90% at 30% 10%, #2b3550 0%, #151a28 45%, #07080c 100%);
}

.about {
  position: absolute;
  top: 14px;
  right: 18px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  text-align: right;
  user-select: none;
}

.about a {
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}

.about a:hover {
  text-decoration: underline;
}

.about b {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

/* Inset matches useDragResize's marginPx so "maximize" fills it exactly */
.workspace {
  position: absolute;
  inset: 10px;
}

.window-enter-from,
.window-leave-to {
  opacity: 0;
  transform: scale(0.94);
}

.window-enter-active,
.window-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease !important;
}
</style>
