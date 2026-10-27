<script setup>
// One line of styled output: [{ text, bold?, underline?, inverse? }]
defineProps({
  segments: { type: Array, required: true },
})
</script>

<template>
  <span
    v-for="(segment, i) in segments"
    :key="i"
    :class="{ bold: segment.bold, underline: segment.underline, inverse: segment.inverse }"
    >{{ segment.text }}</span
  >
</template>

<style scoped>
.bold {
  font-weight: bold;
}

.underline {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* standout / reverse video, as less draws its prompt and search matches */
.inverse {
  background: var(--term-fg);
  color: var(--term-bg-solid, #1e1e1e);
}
</style>
