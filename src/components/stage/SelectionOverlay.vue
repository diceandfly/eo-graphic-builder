<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { readTokenMs } from '../../utils/cssToken.js';
import { ICONS } from '../../ui/icons.js';

// 선택된 유닛의 바운딩박스 + 리사이즈 핸들 + 액션 버튼(플립/회전) + 이름 라벨.
// 월드 좌표에 그리되, 핸들/글자/버튼은 scale 역보정으로 화면 크기 고정.
const props = defineProps({
  unit: Object,  // { id, name, x, y, params }
  scale: Number, // 뷰포트 줌
});
const emit = defineEmits(['resizeStart', 'rotateStart', 'flip', 'flipv', 'dup', 'del']);

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
  { key: 'flip', tip: 'Flip horizontal', paths: ICONS.flipH },
  { key: 'flipv', tip: 'Flip vertical', paths: ICONS.flipV },
  { key: 'dup', tip: 'Duplicate unit', paths: ICONS.duplicate },
  { key: 'del', tip: 'Delete unit', paths: ICONS.trash },
];
function onAction(key) {
  if (key === 'flip') emit('flip');
  else if (key === 'flipv') emit('flipv');
  else if (key === 'dup') emit('dup');
  else if (key === 'del') emit('del');
}

// 코너 바깥 회전 존 (드래그로 90° 스텝 회전)
const ROT = 18; // 존 크기 (화면 px)
const ROT_ZONES = [
  { x: 0, y: 0, ox: -1, oy: -1 }, { x: 1, y: 0, ox: 1, oy: -1 },
  { x: 0, y: 1, ox: -1, oy: 1 }, { x: 1, y: 1, ox: 1, oy: 1 },
];

// 커스텀 툴팁 — HTML IconButton 툴팁과 동일 규격: 타이밍 --tip-delay, 스타일 토큰(panel/line/text/fs-xs)
const tip = ref(null); // { i, text }
const tipTextEl = ref(null);
const tipW = ref(0); // 텍스트 실측 폭 (월드 단위) — 박스가 텍스트를 hug
watch(tip, async (v) => {
  tipW.value = 0;
  if (v) {
    await nextTick();
    if (tipTextEl.value) tipW.value = tipTextEl.value.getBBox().width;
  }
});
let tipTimer = null;
function tipEnter(a, i) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.value = { i, text: a.tip }; }, readTokenMs('--tip-delay', 350));
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
        <rect v-if="tipW" :width="tipW + px(16)" :height="px(22)" :y="px(3)" />
        <text ref="tipTextEl" :x="px(8)" :y="px(14)" :font-size="px(11)" dominant-baseline="central">{{ tip.text }}</text>
      </g>
    </g>

    <rect
      v-for="(z, i) in ROT_ZONES" :key="'rz' + i"
      class="rotZone"
      :x="z.x * W + (z.ox < 0 ? -px(ROT) : 0)"
      :y="z.y * H + (z.oy < 0 ? -px(ROT) : 0)"
      :width="px(ROT)" :height="px(ROT)"
      @pointerdown.stop.prevent="emit('rotateStart', $event)"
    />
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

<style scoped lang="scss">
.box { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.label { fill: var(--accent); font-family: inherit; user-select: none; }
.handle { fill: var(--bg); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.rotZone {
  fill: transparent;
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'/%3E%3Cpolyline points='23 4 23 10 17 10' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 9 9, alias;
}
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
