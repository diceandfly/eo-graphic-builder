<script setup>
import OverlayActions from './OverlayActions.vue';
// 멀티선택/그룹 선택용 통합 바운딩박스 + 리사이즈 핸들 + 액션 버튼(전체 선택 대상에 적용)
const props = defineProps({
  bounds: Object, // { x, y, w, h } 월드 좌표
  scale: Number,
  label: String,  // 선택이 하나의 그룹 전체일 때 그룹 이름 (좌상단 라벨)
});
const emit = defineEmits(['resizeStart', 'rotateStart', 'action']);
const px = (n) => n / props.scale;

// 코너 바깥 회전 존 (단일 선택과 동일 UX — 90° 스텝, 선택 전체를 한 덩어리로 회전)
const ROT = 18;
const HIT = 14; // 핸들 히트 영역 (시각 8px보다 살짝 넓게)
const ROT_ZONES = [
  { x: 0, y: 0, ox: -1, oy: -1 }, { x: 1, y: 0, ox: 1, oy: -1 },
  { x: 0, y: 1, ox: -1, oy: 1 }, { x: 1, y: 1, ox: 1, oy: 1 },
];

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
    <text v-if="label" class="label" :x="0" :y="-px(10)" :font-size="px(12)">{{ label }}</text>
    <OverlayActions :scale="scale" :transform="`translate(${bounds.w + px(12)} 0)`" @action="(k) => emit('action', k)" />
    <rect
      v-for="(z, i) in ROT_ZONES" :key="'rz' + i"
      class="rotZone"
      :x="z.x * bounds.w + (z.ox < 0 ? -px(ROT + HIT / 2) : px(HIT / 2))"
      :y="z.y * bounds.h + (z.oy < 0 ? -px(ROT + HIT / 2) : px(HIT / 2))"
      :width="px(ROT)" :height="px(ROT)"
      @pointerdown.stop.prevent="emit('rotateStart', $event)"
    />
    <g v-for="h in HANDLES" :key="h.dir">
      <rect
        class="handleHit"
        :x="h.x * bounds.w - px(HIT / 2)" :y="h.y * bounds.h - px(HIT / 2)"
        :width="px(HIT)" :height="px(HIT)"
        :style="{ cursor: CURSORS[h.dir] }"
        @pointerdown.stop.prevent="emit('resizeStart', h.dir, $event)"
      />
      <rect
        class="handle"
        :x="h.x * bounds.w - px(4)" :y="h.y * bounds.h - px(4)"
        :width="px(8)" :height="px(8)"
      />
    </g>
  </g>
</template>

<style scoped lang="scss">
.box { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.label { fill: var(--accent); font-family: inherit; user-select: none; }
.handle { fill: var(--bg); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.handleHit { fill: transparent; }
.rotZone {
  fill: transparent;
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'/%3E%3Cpolyline points='23 4 23 10 17 10' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 9 9, alias;
}
</style>
