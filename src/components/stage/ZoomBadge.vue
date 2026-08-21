<script setup>
import { computed } from 'vue';
const props = defineProps({ scale: Number });
defineEmits(['reset']);
const pct = computed(() => Math.round(props.scale * 100));
</script>

<template>
  <button class="badge" title="reset zoom (100%)" @click="$emit('reset')">{{ pct }}%</button>
</template>

<style scoped>
.badge {
  position: absolute; right: 14px; bottom: 14px;
  border: 1px solid var(--line); background: var(--panel); color: var(--faint);
  font: inherit; font-size: 11px; letter-spacing: 0.04em; padding: 4px 10px; cursor: pointer;
}
.badge:hover { color: var(--accent); border-color: var(--accent); }
</style>
