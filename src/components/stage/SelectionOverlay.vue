<script setup>
import { computed } from 'vue';
import OverlayActions from './OverlayActions.vue';

// 선택된 유닛의 바운딩박스 + 리사이즈 핸들 + 액션 버튼(플립/회전) + 이름 라벨.
// 월드 좌표에 그리되, 핸들/글자/버튼은 scale 역보정으로 화면 크기 고정.
const props = defineProps({
  unit: Object,  // { id, name, x, y, params }
  scale: Number, // 뷰포트 줌
});
const emit = defineEmits(['resizeStart', 'rotateStart', 'flip', 'flipv', 'dup', 'del']);
function onAction(key) {
  emit(key); // 'flip' | 'flipv' | 'dup' | 'del'
}

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

// 코너 바깥 회전 존 (드래그로 90° 스텝 회전) — GroupOverlay와 동일 규격
const ROT = 18; // 존 크기 (화면 px)
const ROT_ZONES = [
  { x: 0, y: 0, ox: -1, oy: -1 }, { x: 1, y: 0, ox: 1, oy: -1 },
  { x: 0, y: 1, ox: -1, oy: 1 }, { x: 1, y: 1, ox: 1, oy: 1 },
];
</script>

<template>
  <g :transform="`translate(${unit.x} ${unit.y})`" class="sel">
    <rect class="box" :width="W" :height="H" />
    <text class="label" :x="0" :y="-px(10)" :font-size="px(12)">{{ unit.name }}</text>
    <!-- 액션 버튼: 우측변 상단 (공용 OverlayActions) -->
    <OverlayActions :scale="scale" :transform="`translate(${W + px(12)} 0)`" @action="onAction" />

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
</style>
