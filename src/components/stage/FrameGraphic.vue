<script setup>
import { computed } from 'vue';
import { frameGridLines } from '../../geometry/frameGrid.js';

// 프레임 오브젝트 렌더 (§92: rect에서 재정의) — 그리드는 가이드 전용(export 미포함).
const props = defineProps({ params: Object });
const p = computed(() => props.params);
const grid = computed(() => (p.value.gridOn ? frameGridLines(p.value) : null));
</script>

<template>
  <g>
    <!-- fill/stroke 독립 토글 (§110) — 조합 자유 (둘 다 off면 그리드 가이드만 남음) -->
    <rect
      :width="p.W" :height="p.H"
      :fill="p.fillOn ? p.fill : 'none'"
      :stroke="p.strokeOn ? p.stroke : 'none'"
      :stroke-width="p.strokeOn ? p.strokeW : 0"
    />
    <g v-if="grid" class="rgrid">
      <!-- 마진 프레임 -->
      <rect
        :x="grid.mx" :y="grid.my"
        :width="Math.max(0, p.W - 2 * grid.mx)" :height="Math.max(0, p.H - 2 * grid.my)"
        fill="none"
      />
      <line v-for="(x, i) in grid.v" :key="'v' + i" :x1="x" :y1="grid.my" :x2="x" :y2="p.H - grid.my" />
      <line v-for="(y, i) in grid.h" :key="'h' + i" :x1="grid.mx" :y1="y" :x2="p.W - grid.mx" :y2="y" />
    </g>
  </g>
</template>

<style scoped lang="scss">
.rgrid line, .rgrid rect {
  stroke: var(--unit-guide, var(--guide)); stroke-width: 1;
  vector-effect: non-scaling-stroke; opacity: 0.6;
}
</style>
