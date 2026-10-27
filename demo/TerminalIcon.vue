<script setup>
import { useId } from 'vue'

// unique per instance: the icon is shown in the Dock and as a tile badge
const bg = useId()
</script>

<template>
  <svg viewBox="0 0 64 64">
    <defs>
      <linearGradient :id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b3b3e" />
        <stop offset="1" stop-color="#151517" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="58" height="58" rx="13" :fill="`url(#${bg})`" />
    <rect x="3.5" y="3.5" width="57" height="57" rx="12.5" fill="none" stroke="rgba(255,255,255,.18)" />
    <path d="M15 22l9 7-9 7" fill="none" stroke="#f2f2f2" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M28 39h14" stroke="#f2f2f2" stroke-width="3.5" stroke-linecap="round" />
  </svg>
</template>
