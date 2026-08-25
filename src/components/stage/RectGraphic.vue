<script setup>
import { computed } from 'vue';

// 직사각형 오브젝트 렌더 — 레이아웃 프레임. 그리드는 가이드 전용(export 미포함).
const props = defineProps({ params: Object });
const p = computed(() => props.params);

// 그리드 계산: gridUnit 'pct'면 W/H 비례, 'px'면 절대값
const grid = computed(() => {
  const { W, H, gridOn, gridUnit, margin, rows, cols, gutterX, gutterY } = p.value;
  if (!gridOn) return null;
  const pct = gridUnit === 'pct';
  const mx = pct ? (W * margin) / 100 : margin;
  const my = pct ? (H * margin) / 100 : margin;
  const gx = pct ? (W * gutterX) / 100 : gutterX;
  const gy = pct ? (H * gutterY) / 100 : gutterY;
  const cw = W - 2 * mx;
  const ch = H - 2 * my;
  if (cw <= 0 || ch <= 0) return { mx, my, vLines: [], hLines: [] };
  const nc = Math.max(1, Math.round(cols));
  const nr = Math.max(1, Math.round(rows));
  const colW = (cw - gx * (nc - 1)) / nc;
  const rowH = (ch - gy * (nr - 1)) / nr;
  const vLines = [];
  const hLines = [];
  if (colW > 0) {
    for (let i = 1; i < nc; i++) {
      const xL = mx + i * colW + (i - 1) * gx;
      vLines.push(xL);
      if (gx > 0) vLines.push(xL + gx);
    }
  }
  if (rowH > 0) {
    for (let i = 1; i < nr; i++) {
      const yT = my + i * rowH + (i - 1) * gy;
      hLines.push(yT);
      if (gy > 0) hLines.push(yT + gy);
    }
  }
  return { mx, my, vLines, hLines };
});
</script>

<template>
  <g>
    <rect
      :width="p.W" :height="p.H"
      :fill="p.fillOn ? p.fill : 'none'"
      :stroke="p.strokeOn ? p.strokeColor : 'none'"
      stroke-width="1" vector-effect="non-scaling-stroke"
    />
    <g v-if="grid" class="rgrid">
      <!-- 마진 프레임 -->
      <rect
        :x="grid.mx" :y="grid.my"
        :width="Math.max(0, p.W - 2 * grid.mx)" :height="Math.max(0, p.H - 2 * grid.my)"
        fill="none"
      />
      <line v-for="(x, i) in grid.vLines" :key="'v' + i" :x1="x" :y1="grid.my" :x2="x" :y2="p.H - grid.my" />
      <line v-for="(y, i) in grid.hLines" :key="'h' + i" :x1="grid.mx" :y1="y" :x2="p.W - grid.mx" :y2="y" />
    </g>
  </g>
</template>

<style scoped lang="scss">
.rgrid line, .rgrid rect {
  stroke: var(--unit-guide, var(--guide)); stroke-width: 1;
  vector-effect: non-scaling-stroke; opacity: 0.6;
}
</style>
