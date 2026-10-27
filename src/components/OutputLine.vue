<script setup>
import TermSegments from './TermSegments.vue'

// One scrollback line: optional prompt, then plain text or styled segments
defineProps({
  line: { type: Object, required: true },
})
</script>

<template>
  <div class="line">
    <span v-if="line.prompt">{{ line.prompt }}</span><TermSegments
      v-if="line.segments"
      :segments="line.segments"
    /><template v-else>{{ line.text }}</template>
  </div>
</template>

<style scoped>
.line {
  min-height: 1lh;
}
</style>
