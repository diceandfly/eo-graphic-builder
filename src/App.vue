<script setup>
import { ref } from 'vue';
import { useDocument } from './composables/useDocument.js';
import { useViewport } from './composables/useViewport.js';
import { deriveUnit } from './geometry/derive.js';
import { downloadSvg } from './export/exportSvg.js';
import DashboardStage from './components/stage/DashboardStage.vue';
import ControlPanel from './components/ControlPanel.vue';

const docApi = useDocument();
const viewport = useViewport();
const { doc, active, gutterMax } = docApi;

const stageRef = ref(null);

function exportSvg() {
  if (!active.value) return;
  const p = active.value.params;
  downloadSvg({ W: p.W, H: p.H, unit: deriveUnit(p).unit, orientation: p.orientation });
}
function createUnit() {
  const [wx, wy] = stageRef.value.centerWorld();
  docApi.createUnit(wx, wy);
}
</script>

<template>
  <div class="layout">
    <aside class="side">
      <ControlPanel
        :unit="active"
        :gutter-max="gutterMax"
        @set-size="docApi.setSize"
        @set-aspect="docApi.setAspect"
        @set-a="docApi.setA"
        @set-b="docApi.setB"
        @rename="docApi.renameActive"
        @create="createUnit"
        @export="exportSvg"
      />
    </aside>
    <DashboardStage ref="stageRef" :doc="doc" :viewport="viewport" :actions="docApi" />
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100vh; }
.side {
  width: 300px; flex-shrink: 0; overflow-y: auto;
  padding: 22px 18px 40px; border-right: 1px solid var(--line); background: var(--panel);
}
</style>
