<script setup>
// 좌하단 정렬 패널 — 키 오브젝트(선택 중 재클릭) 기준 정렬
defineEmits(['align']);
const BTNS = [
  { key: 'left', tip: 'Align left edges', paths: ['M5 3v18', 'M9 8h10', 'M9 14h6'] },
  { key: 'hcenter', tip: 'Align horizontal centers', paths: ['M12 3v18', 'M5 8h14', 'M8 14h8'] },
  { key: 'right', tip: 'Align right edges', paths: ['M19 3v18', 'M5 8h10', 'M9 14h6'] },
  { key: 'top', tip: 'Align top edges', paths: ['M3 5h18', 'M8 9v10', 'M14 9v6'] },
  { key: 'vcenter', tip: 'Align vertical centers', paths: ['M3 12h18', 'M8 5v14', 'M14 8v8'] },
  { key: 'bottom', tip: 'Align bottom edges', paths: ['M3 19h18', 'M8 5v10', 'M14 9v6'] },
];
</script>

<template>
  <div class="alignbar" @pointerdown.stop>
    <button v-for="b in BTNS" :key="b.key" class="tbtn" @click="$emit('align', b.key)">
      <svg viewBox="0 0 24 24"><path v-for="(d, i) in b.paths" :key="i" :d="d" /></svg>
      <span class="tip">{{ b.tip }}</span>
    </button>
  </div>
</template>

<style scoped>
.alignbar {
  position: absolute; left: 14px; bottom: 14px;
  display: flex; align-items: center; gap: 2px;
  background: var(--panel); border: 1px solid var(--line); padding: 4px;
}
.tbtn {
  position: relative;
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; padding: 0;
}
.tbtn svg {
  width: 16px; height: 16px;
  fill: none; stroke: var(--text); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.tbtn:hover svg { stroke: var(--accent); }
.tip {
  position: absolute; bottom: calc(100% + 10px); left: 0;
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: 11px; padding: 4px 8px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 0.1s;
}
.tbtn:hover .tip { opacity: 1; transition-delay: 0.35s; }
</style>
