<script setup>
// 멀티선택/그룹 선택용 통합 바운딩박스 + 리사이즈 핸들
const props = defineProps({
  bounds: Object, // { x, y, w, h } 월드 좌표
  scale: Number,
});
const emit = defineEmits(['resizeStart']);
const px = (n) => n / props.scale;

const HANDLES = [
  { dir: 'nw', x: 0, y: 0 }, { dir: 'n', x: 0.5, y: 0 }, { dir: 'ne', x: 1, y: 0 },
  { dir: 'w', x: 0, y: 0.5 }, { dir: 'e', x: 1, y: 0.5 },
  { dir: 'sw', x: 0, y: 1 }, { dir: 's', x: 0.5, y: 1 }, { dir: 'se', x: 1, y: 1 },
];
const CURSORS = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
};
</script>

<template>
  <g :transform="`translate(${bounds.x} ${bounds.y})`">
    <rect class="box" :width="bounds.w" :height="bounds.h" />
    <rect
      v-for="h in HANDLES" :key="h.dir"
      class="handle"
      :x="h.x * bounds.w - px(4)" :y="h.y * bounds.h - px(4)"
      :width="px(8)" :height="px(8)"
      :style="{ cursor: CURSORS[h.dir] }"
      @pointerdown.stop.prevent="emit('resizeStart', h.dir, $event)"
    />
  </g>
</template>

<style scoped lang="scss">
.box { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.handle { fill: var(--bg); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
</style>
