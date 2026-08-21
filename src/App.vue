<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useUnitParams } from './composables/useUnitParams.js';
import UnitCanvas from './components/UnitCanvas.vue';
import ControlPanel from './components/ControlPanel.vue';
import { downloadSvg } from './export/exportSvg.js';

const { p, D, gutterMax, columns, unit, setA, setB, rotate } = useUnitParams();

// 캔버스를 stage 안에 contain 피팅 (가로/세로 어느 쪽이 길어도 프레임 이탈 없음)
const stageEl = ref(null);
const stage = reactive({ w: 0, h: 0 });
let ro;
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    stage.w = e.contentRect.width;
    stage.h = e.contentRect.height;
  });
  ro.observe(stageEl.value);
});
onBeforeUnmount(() => ro?.disconnect());

function exportSvg() {
  downloadSvg({ W: p.W, H: p.H, unit: unit.value, orientation: p.orientation });
}

const canvasStyle = computed(() => {
  const s = Math.min(stage.w / p.W, stage.h / p.H) || 0;
  return { width: `${p.W * s}px`, height: `${p.H * s}px` };
});
</script>

<template>
  <div class="layout">
    <main ref="stageEl" class="stage">
      <div class="canvasWrap" :style="canvasStyle">
        <UnitCanvas
          :W="p.W" :H="p.H"
          :unit="unit" :columns="columns"
          :show-guides="p.showGuides" :orientation="p.orientation"
        />
      </div>
    </main>
    <aside class="side">
      <ControlPanel :p="p" :D="D" :gutter-max="gutterMax" @set-a="setA" @set-b="setB" @rotate="rotate" @export="exportSvg" />
    </aside>
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100vh; }
.stage {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 40px; min-width: 0; overflow: hidden;
}
.canvasWrap { outline: 1px solid var(--line); background: var(--canvas); }
.canvasWrap :deep(svg) { width: 100%; height: 100%; }
.side {
  width: 300px; flex-shrink: 0; overflow-y: auto;
  padding: 22px 18px 40px; border-left: 1px solid var(--line); background: var(--panel);
}
</style>
