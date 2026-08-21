<script setup>
import { computed } from 'vue';

const props = defineProps({
  W: Number,
  H: Number,
  unit: Object,      // buildUnit 결과
  columns: Array,    // computeColumns 결과 (가이드용)
  showGuides: Boolean,
  orientation: { type: Number, default: 0 }, // 0 | 90
  fill: { type: String, default: '#FAF04B' },
});

const f = (n) => n.toFixed(3);
const pts = (poly) => poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const viewBox = computed(() => `0 0 ${props.W} ${props.H}`);

// 지오메트리는 로컬(비회전) 좌표 — 90°면 시계방향 회전으로 캔버스에 배치
// (x, y) → (localH - y, x)
const localW = computed(() => (props.orientation ? props.H : props.W));
const localH = computed(() => (props.orientation ? props.W : props.H));
const orient = computed(() =>
  props.orientation ? `rotate(90) translate(0 ${f(-localH.value)})` : undefined
);
</script>

<template>
  <svg :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg">
    <g :transform="orient">
    <!-- self-contained 유닛: 외부 translate/scale/flip만으로 재배치 가능해야 함 -->
    <g id="unit">
      <rect
        v-if="unit.shaft"
        id="shaft"
        :x="f(unit.shaft.x)" :y="f(unit.shaft.y)"
        :width="f(unit.shaft.width)" :height="f(unit.shaft.height)"
        :fill="fill"
      />
      <g id="threads-top">
        <polygon v-for="(poly, i) in unit.threadsTop" :key="i" :points="pts(poly)" :fill="fill" />
      </g>
      <g id="threads-bottom">
        <polygon v-for="(poly, i) in unit.threadsBottom" :key="i" :points="pts(poly)" :fill="fill" />
      </g>
    </g>

    <!-- 그리드 가이드: 유닛 밖 (export 대상 아님), 로컬 좌표 -->
    <g v-if="showGuides" class="guides">
      <template v-for="(c, i) in columns" :key="i">
        <line :x1="f(c.L)" y1="0" :x2="f(c.L)" :y2="localH" />
        <line :x1="f(c.R)" y1="0" :x2="f(c.R)" :y2="localH" />
      </template>
      <line x1="0" :y1="localH / 2" :x2="localW" :y2="localH / 2" />
      <line x1="0" :y1="unit.shaftTop" :x2="localW" :y2="unit.shaftTop" />
      <line x1="0" :y1="unit.shaftBot" :x2="localW" :y2="unit.shaftBot" />
    </g>
    </g>
  </svg>
</template>

<style scoped>
svg { display: block; width: 100%; height: auto; }
.guides line { stroke: #ff5ca8; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.6; }
</style>
