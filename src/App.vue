<script setup>
import { ref } from 'vue';
import { useDocument } from './composables/useDocument.js';
import { useViewport } from './composables/useViewport.js';
import { deriveUnit } from './geometry/derive.js';
import { downloadSvg, downloadCompositeSvg } from './export/exportSvg.js';
import DashboardStage from './components/stage/DashboardStage.vue';
import ControlPanel from './components/ControlPanel.vue';

const docApi = useDocument();
const viewport = useViewport();
const { doc, active, gutterMax } = docApi;

const stageRef = ref(null);

function exportSvg() {
  const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
  if (sel.length > 1) {
    // 다중 선택: 상대 배치를 보존한 컴포지트
    downloadCompositeSvg(sel.map((u) => ({
      x: u.x, y: u.y, W: u.params.W, H: u.params.H,
      unit: deriveUnit(u.params).unit,
      orientation: u.params.orientation, fill: u.params.fill,
    })));
    return;
  }
  if (!active.value) return;
  const p = active.value.params;
  downloadSvg({ W: p.W, H: p.H, unit: deriveUnit(p).unit, orientation: p.orientation, fill: p.fill });
}
function createUnit() {
  const [wx, wy] = stageRef.value.centerWorld();
  docApi.createUnit(wx, wy);
}

// JSON 프로젝트 저장/열기 — 대시보드 작업 전체 (유닛·뷰포트·커스텀 비율)
function saveProject() {
  const data = {
    version: 1,
    units: doc.units,
    viewport: { ...viewport.vp },
    customRatios: JSON.parse(localStorage.getItem('eo.customRatios') || '[]'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'eo-project.json';
  a.click();
  URL.revokeObjectURL(url);
}
async function openProject(file) {
  try {
    const data = JSON.parse(await file.text());
    docApi.loadProject(data.units || []);
    if (data.viewport) Object.assign(viewport.vp, data.viewport);
    if (data.customRatios) localStorage.setItem('eo.customRatios', JSON.stringify(data.customRatios));
  } catch (err) {
    console.error('invalid project file', err);
  }
}

const stageActions = { ...docApi, exportSvg, saveProject, openProject };
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
      />
    </aside>
    <DashboardStage ref="stageRef" :doc="doc" :viewport="viewport" :actions="stageActions" />
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100vh; }
.side {
  width: 300px; flex-shrink: 0; overflow-y: auto;
  padding: 22px 18px 40px; border-right: 1px solid var(--line); background: var(--panel);
}
</style>
