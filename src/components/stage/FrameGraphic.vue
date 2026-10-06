<script setup>
import { computed } from 'vue';
import { frameAttrs, frameGridLines } from '../../geometry/frameGrid.js';

// 프레임 오브젝트 렌더 (§92: rect에서 재정의) — 그리드는 가이드 전용(export 미포함).
const props = defineProps({
  params: Object,
  showGrid: { type: Boolean, default: true }, // §132: 그리드 표시는 뷰 토글 (파라미터 gridOn 폐기)
});
const p = computed(() => props.params);
const attrs = computed(() => frameAttrs(p.value)); // 렌더·export 단일 경로 (§120)
const grid = computed(() => (props.showGrid ? frameGridLines(p.value) : null));
</script>

<template>
  <g>
    <!-- fill/stroke 독립 토글 (§110) — 조합 자유 (둘 다 off면 그리드 가이드만 남음) -->
    <rect
      :width="p.W" :height="p.H"
      :fill="attrs.fill" :stroke="attrs.stroke" :stroke-width="attrs.strokeW"
    />
    <g v-if="grid" class="rgrid">
      <!-- 마진 프레임 -->
      <rect
        :x="grid.bx" :y="grid.by"
        :width="grid.bw" :height="grid.bh"
        fill="none"
      />
      <line v-for="(x, i) in grid.v" :key="'v' + i" :x1="x" :y1="grid.by" :x2="x" :y2="grid.by + grid.bh" />
      <line v-for="(y, i) in grid.h" :key="'h' + i" :x1="grid.bx" :y1="y" :x2="grid.bx + grid.bw" :y2="y" />
    </g>
  </g>
</template>

<style scoped lang="scss">
.rgrid line, .rgrid rect {
  stroke: var(--unit-guide, var(--guide)); stroke-width: 1;
  vector-effect: non-scaling-stroke; opacity: 0.6;
}
</style>
