<script setup>
import { computed } from 'vue';
import { deriveUnit, orientationTransform } from '../../geometry/derive.js';

const props = defineProps({
  params: Object,
  showGuides: Boolean,
  seamWidth: { type: Number, default: 0 }, // 접합 봉합 스트로크 (화면 px, 0이면 없음)
});
const fill = computed(() => props.params.fill || '#FAF04B');

const f = (n) => n.toFixed(3);
const pts = (poly) => poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

const d = computed(() => deriveUnit(props.params));
const otf = computed(() =>
  orientationTransform(props.params.orientation, d.value.localW, d.value.localH) || undefined
);
</script>

<template>
  <g :transform="otf">
    <!-- self-contained 유닛: 외부 translate/scale/flip만으로 재배치 가능 -->
    <g class="unit">
      <!-- 동색 1px(화면) 스트로크: 접합부 안티앨리어싱 헤어라인을 모든 줌에서 봉합 -->
      <rect
        v-if="d.unit.shaft"
        :x="f(d.unit.shaft.x)" :y="f(d.unit.shaft.y)"
        :width="f(d.unit.shaft.width)" :height="f(d.unit.shaft.height)"
        :fill="fill" :stroke="seamWidth > 0 ? fill : 'none'" :stroke-width="seamWidth" class="seam"
      />
      <polygon v-for="(poly, i) in d.unit.threadsTop" :key="'t' + i" :points="pts(poly)" :fill="fill" :stroke="seamWidth > 0 ? fill : 'none'" :stroke-width="seamWidth" class="seam" />
      <polygon v-for="(poly, i) in d.unit.threadsBottom" :key="'b' + i" :points="pts(poly)" :fill="fill" :stroke="seamWidth > 0 ? fill : 'none'" :stroke-width="seamWidth" class="seam" />
    </g>
    <!-- 그리드 가이드: 유닛 밖, export 미포함 -->
    <g v-if="showGuides" class="guides">
      <rect x="0" y="0" :width="d.localW" :height="d.localH" fill="none" />
      <template v-for="(c, i) in d.columns" :key="i">
        <line :x1="f(c.L)" y1="0" :x2="f(c.L)" :y2="d.localH" />
        <line :x1="f(c.R)" y1="0" :x2="f(c.R)" :y2="d.localH" />
      </template>
      <line x1="0" :y1="d.localH / 2" :x2="d.localW" :y2="d.localH / 2" />
      <line x1="0" :y1="d.unit.shaftTop" :x2="d.localW" :y2="d.unit.shaftTop" />
      <line x1="0" :y1="d.unit.shaftBot" :x2="d.localW" :y2="d.unit.shaftBot" />
    </g>
  </g>
</template>

<style scoped>
.seam { vector-effect: non-scaling-stroke; stroke-linejoin: miter; }
.guides line, .guides rect { stroke: #ff5ca8; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.6; }
</style>
