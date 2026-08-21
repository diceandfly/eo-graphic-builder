<script setup>
import { ref, computed } from 'vue';

// 선택된 유닛의 바운딩박스 + 리사이즈 핸들 + 액션 버튼(플립/회전) + 이름 라벨.
// 월드 좌표에 그리되, 핸들/글자/버튼은 scale 역보정으로 화면 크기 고정.
const props = defineProps({
  unit: Object,  // { id, name, x, y, params }
  scale: Number, // 뷰포트 줌
});
const emit = defineEmits(['resizeStart', 'rotate', 'flip', 'dup', 'del']);

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
// 아이콘: 24 viewBox 스트로크 패스 (Feather/Lucide) — 글리프 폰트 대신 볼륨감 통일
const BTN = 28;
const ICON = 16; // 버튼 내 아이콘 기본 크기 (화면 px). s = 개별 배율, dx = 화면 px 미세보정.
const ACTIONS = [
  {
    key: 'cw', tip: 'Rotate 90° clockwise', s: 0.95, dx: -1,
    paths: ['M23 4v6h-6', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'],
  },
  {
    key: 'ccw', tip: 'Rotate 90° counter-clockwise', s: 0.95, dx: 1,
    paths: ['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10'],
  },
  {
    key: 'flip', tip: 'Flip thread direction',
    paths: ['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16'],
  },
  {
    key: 'dup', tip: 'Duplicate unit',
    paths: [
      'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
      'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    ],
  },
  {
    key: 'del', tip: 'Delete unit',
    paths: [
      'M3 6h18',
      'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
      'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
      'M10 11v6', 'M14 11v6',
    ],
  },
];
function onAction(key) {
  if (key === 'flip') emit('flip');
  else if (key === 'dup') emit('dup');
  else if (key === 'del') emit('del');
  else emit('rotate', key === 'cw' ? 1 : -1);
}

// 커스텀 툴팁 — 350ms 호버 후 표시 (네이티브 title보다 빠름)
const tip = ref(null); // { i, text }
let tipTimer = null;
function tipEnter(a, i) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.value = { i, text: a.tip }; }, 350);
}
function tipLeave() {
  clearTimeout(tipTimer);
  tip.value = null;
}
const iconSize = (a) => ICON * (a.s ?? 1);
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
        @pointerenter="tipEnter(a, i)"
        @pointerleave="tipLeave"
      >
        <rect :width="px(BTN)" :height="px(BTN)" />
        <g
          class="icon"
          :transform="`translate(${px((BTN - iconSize(a)) / 2 + (a.dx ?? 0))} ${px((BTN - iconSize(a)) / 2)}) scale(${px(iconSize(a)) / 24})`"
        >
          <path v-for="(d, j) in a.paths" :key="j" :d="d" />
        </g>
      </g>
      <g v-if="tip" class="tip" :transform="`translate(${px(BTN + 10)} ${tip.i * px(BTN + 6)})`">
        <rect :width="px(tip.text.length * 6.2 + 16)" :height="px(22)" :y="px(3)" />
        <text :x="px(8)" :y="px(14)" :font-size="px(11)" dominant-baseline="central">{{ tip.text }}</text>
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
.abtn .icon path {
  fill: none; stroke: var(--text); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.abtn:hover rect { stroke: var(--accent); }
.abtn:hover .icon path { stroke: var(--accent); }
.tip { pointer-events: none; }
.tip rect { fill: var(--panel); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.tip text { fill: var(--text); font-family: inherit; user-select: none; }
</style>
