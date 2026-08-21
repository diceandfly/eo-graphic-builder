<script setup>
import { computed } from 'vue';

// 선택된 유닛의 바운딩박스 + 리사이즈 핸들 + 회전 버튼 + 이름 라벨.
// 월드 좌표에 그리되, 핸들/글자는 scale 역보정으로 화면 크기 고정.
const props = defineProps({
  unit: Object,  // { id, name, x, y, params }
  scale: Number, // 뷰포트 줌
});
const emit = defineEmits(['resizeStart', 'rotate']);

const W = computed(() => props.unit.params.W);
const H = computed(() => props.unit.params.H);
const px = (n) => n / props.scale; // 화면 px → 월드 단위

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
  <g :transform="`translate(${unit.x} ${unit.y})`" class="sel">
    <rect class="box" :width="W" :height="H" />
    <text class="label" :x="0" :y="-px(10)" :font-size="px(12)">{{ unit.name }}</text>

    <!-- 회전 버튼 (우상단 외곽, 90° 스텝) -->
    <g class="rot" :transform="`translate(${W} ${-px(22)})`">
      <g :transform="`translate(${-px(46)} 0)`" @pointerdown.stop @click.stop="emit('rotate', -1)">
        <rect :x="-px(10)" :y="-px(10)" :width="px(20)" :height="px(20)" />
        <text :font-size="px(13)" :y="px(4.5)">⟲</text>
      </g>
      <g :transform="`translate(${-px(20)} 0)`" @pointerdown.stop @click.stop="emit('rotate', 1)">
        <rect :x="-px(10)" :y="-px(10)" :width="px(20)" :height="px(20)" />
        <text :font-size="px(13)" :y="px(4.5)">⟳</text>
      </g>
    </g>

    <rect
      v-for="h in HANDLES" :key="h.dir"
      class="handle"
      :x="h.x * W - px(4)" :y="h.y * H - px(4)"
      :width="px(8)" :height="px(8)"
      :style="{ cursor: CURSORS[h.dir] }"
      @pointerdown.stop.prevent="emit('resizeStart', h.dir, $event)"
    />
  </g>
</template>

<style scoped>
.box { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.label { fill: var(--accent); font-family: inherit; user-select: none; }
.handle { fill: var(--bg); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.rot { cursor: pointer; }
.rot rect { fill: var(--bg); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.rot text { fill: var(--text); text-anchor: middle; user-select: none; }
.rot g:hover rect { stroke: var(--accent); }
.rot g:hover text { fill: var(--accent); }
</style>
