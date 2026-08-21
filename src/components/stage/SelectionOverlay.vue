<script setup>
import { computed } from 'vue';

// 선택된 유닛의 바운딩박스 + 리사이즈 핸들 + 액션 버튼(플립/회전) + 이름 라벨.
// 월드 좌표에 그리되, 핸들/글자/버튼은 scale 역보정으로 화면 크기 고정.
const props = defineProps({
  unit: Object,  // { id, name, x, y, params }
  scale: Number, // 뷰포트 줌
});
const emit = defineEmits(['resizeStart', 'rotate', 'flip']);

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

// 우측변 상단 기준 세로 일렬 액션 버튼. size/gap은 화면 px.
const BTN = 28;
const ACTIONS = [
  { key: 'flip', glyph: '⇄', tip: 'flip thread direction' },
  { key: 'ccw', glyph: '⟲', tip: 'rotate 90° counter-clockwise' },
  { key: 'cw', glyph: '⟳', tip: 'rotate 90° clockwise' },
];
function onAction(key) {
  if (key === 'flip') emit('flip');
  else emit('rotate', key === 'cw' ? 1 : -1);
}
</script>

<template>
  <g :transform="`translate(${unit.x} ${unit.y})`" class="sel">
    <rect class="box" :width="W" :height="H" />
    <text class="label" :x="0" :y="-px(10)" :font-size="px(12)">{{ unit.name }}</text>

    <!-- 액션 버튼: 바운딩박스 우측변 상단, 세로 일렬 -->
    <g class="actions" :transform="`translate(${W + px(12)} 0)`">
      <g
        v-for="(a, i) in ACTIONS"
        :key="a.key"
        class="abtn"
        :transform="`translate(0 ${i * px(BTN + 6)})`"
        @pointerdown.stop
        @click.stop="onAction(a.key)"
      >
        <title>{{ a.tip }}</title>
        <rect :width="px(BTN)" :height="px(BTN)" />
        <text
          :x="px(BTN / 2)" :y="px(BTN / 2)"
          :font-size="px(16)"
          text-anchor="middle" dominant-baseline="central"
        >{{ a.glyph }}</text>
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
.abtn { cursor: pointer; }
.abtn rect { fill: var(--panel); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.abtn text { fill: var(--text); user-select: none; }
.abtn:hover rect { stroke: var(--accent); }
.abtn:hover text { fill: var(--accent); }
</style>
