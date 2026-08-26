<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

// 리소스 모니터 (§86) — 보기 툴바(우하단 코너 바) 상단, OBJ / MEM / FPS 순 (§87).
// 상당한 성능 저하 시 해당 항목을 danger 색으로 강조:
// OBJ > 2000 (스트레스 테스트 기준 체감 저하 구간) · MEM 힙 사용률 > 70% · FPS < 30
const props = defineProps({ count: Number });

const fps = ref(null); // 첫 측정 창(0.5s) 전에는 미표시
const mem = ref(null);
const memHot = ref(false);
let rafId = 0;
let frames = 0;
let last = performance.now();

function loop(now) {
  frames += 1;
  if (now - last >= 500) {
    fps.value = Math.round((frames * 1000) / (now - last));
    frames = 0;
    last = now;
    const m = performance.memory;
    if (m) {
      mem.value = Math.round(m.usedJSHeapSize / 1048576);
      memHot.value = m.usedJSHeapSize / m.jsHeapSizeLimit > 0.7;
    }
  }
  rafId = requestAnimationFrame(loop);
}
onMounted(() => { rafId = requestAnimationFrame(loop); });
onBeforeUnmount(() => cancelAnimationFrame(rafId));

const objHot = computed(() => props.count > 2000);
const fpsHot = computed(() => fps.value != null && fps.value < 30);
</script>

<template>
  <div class="resmon">
    <span class="cell" :class="{ hot: objHot }"><span class="k">obj</span>{{ count }}</span>
    <span v-if="mem != null" class="cell" :class="{ hot: memHot }"><span class="k">mem</span>{{ mem }}<span class="k">mb</span></span>
    <span v-if="fps != null" class="cell" :class="{ hot: fpsHot }"><span class="k">fps</span>{{ fps }}</span>
  </div>
</template>

<style scoped lang="scss">
.resmon {
  position: absolute; right: var(--sp-6); bottom: calc(var(--sp-6) + var(--bar-h, 42px) + 10px);
  display: flex; gap: 12px; pointer-events: none;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base);
  /* §111: 흰색+오파시티 — 커스텀 캔버스 색 등 대부분의 배경에서 가독 */
  color: color-mix(in srgb, #ffffff 55%, transparent); font-variant-numeric: tabular-nums;
}
.cell { display: inline-flex; align-items: baseline; gap: 3px; }
.cell.hot { color: var(--danger); }
.k { text-transform: uppercase; opacity: 0.7; }
</style>
