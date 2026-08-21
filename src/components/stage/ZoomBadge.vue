<script setup>
import { computed } from 'vue';

// 우하단 코너 바 — 그리드 가이드 토글 + 줌% (툴바와 동일 스타일)
const props = defineProps({ scale: Number, guides: Boolean });
defineEmits(['reset', 'toggleGuides']);
const pct = computed(() => Math.round(props.scale * 100));
const GRID_PATHS = ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'];
</script>

<template>
  <div class="corner" @pointerdown.stop>
    <button class="tbtn" :class="{ on: guides }" @click="$emit('toggleGuides')">
      <svg viewBox="0 0 24 24"><path v-for="(d, i) in GRID_PATHS" :key="i" :d="d" /></svg>
      <span class="tip">Grid guides (selected units)</span>
    </button>
    <button class="tbtn zoom" @click="$emit('reset')">
      {{ pct }}%
      <span class="tip">Reset zoom (100%)</span>
    </button>
  </div>
</template>

<style scoped>
.corner {
  position: absolute; right: 14px; bottom: 14px;
  display: flex; align-items: center; gap: 2px;
  background: var(--panel); border: 1px solid var(--line); padding: 4px;
}
.tbtn {
  position: relative;
  height: 32px; min-width: 32px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; padding: 0 6px;
  color: var(--faint); font: inherit; font-size: 11px; letter-spacing: 0.04em;
}
.tbtn svg {
  width: 16px; height: 16px;
  fill: none; stroke: var(--text); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.tbtn:hover { color: var(--accent); }
.tbtn:hover svg { stroke: var(--accent); }
.tbtn.on { background: #222; }
.tbtn.on svg { stroke: var(--accent); }
.tip {
  position: absolute; bottom: calc(100% + 10px); right: 0;
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: 11px; padding: 4px 8px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 0.1s;
}
.tbtn:hover .tip { opacity: 1; transition-delay: 0.35s; }
</style>
