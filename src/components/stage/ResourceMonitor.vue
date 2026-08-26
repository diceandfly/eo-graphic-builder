<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

// 리소스 모니터 (§86) — 보기 툴바(우하단 코너 바) 상단, 숫자만 간결 표시.
// FPS = rAF 카운트(0.5초 창) / MEM = JS 힙 MB(크롬 계열만 노출, 미지원 시 생략) / OBJ = 오브젝트 수
defineProps({ count: Number });

const fps = ref(0);
const mem = ref(null);
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
    mem.value = m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  }
  rafId = requestAnimationFrame(loop);
}
onMounted(() => { rafId = requestAnimationFrame(loop); });
onBeforeUnmount(() => cancelAnimationFrame(rafId));
</script>

<template>
  <div class="resmon">
    <span class="cell"><span class="k">fps</span>{{ fps }}</span>
    <span v-if="mem != null" class="cell"><span class="k">mem</span>{{ mem }}<span class="k">mb</span></span>
    <span class="cell"><span class="k">obj</span>{{ count }}</span>
  </div>
</template>

<style scoped lang="scss">
.resmon {
  position: absolute; right: var(--sp-6); bottom: calc(var(--sp-6) + var(--bar-h, 42px) + 10px);
  display: flex; gap: 12px; pointer-events: none;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base);
  color: var(--faint); font-variant-numeric: tabular-nums;
}
.cell { display: inline-flex; align-items: baseline; gap: 3px; }
.k { text-transform: uppercase; opacity: 0.7; }
</style>
