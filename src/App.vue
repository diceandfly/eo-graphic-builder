<script setup>
import { ref, computed } from 'vue';
import { useDocument } from './composables/useDocument.js';
import { useViewport } from './composables/useViewport.js';
import { usePresets } from './composables/usePresets.js';
import { deriveUnit } from './geometry/derive.js';
import { downloadSvg, downloadCompositeSvg } from './export/exportSvg.js';
import DashboardStage from './components/stage/DashboardStage.vue';
import ControlPanel from './components/ControlPanel.vue';

const docApi = useDocument();
const viewport = useViewport();
const presetsApi = usePresets();
const { doc, active, gutterMax } = docApi;

const stageRef = ref(null);
const selectedUnits = computed(() => doc.units.filter((u) => doc.selectedIds.includes(u.id)));
// 패널 표시 대상: 선택이 없으면 null → 패널이 새 유닛/프리셋 브라우저로 전환
const panelUnit = computed(() => (doc.selectedIds.length ? active.value : null));

// 선택이 정확히 하나의 최외곽 그룹 전체일 때 → 패널에 그룹 이름 표시/편집
const selectedGroup = computed(() => {
  const ids = doc.selectedIds;
  if (ids.length < 2) return null;
  const units = doc.units.filter((u) => ids.includes(u.id));
  const gids = [...new Set(units.map((u) => docApi.outermost(u)))];
  if (gids.length !== 1 || gids[0] == null) return null;
  const gid = gids[0];
  if (docApi.groupMemberIds(gid).length !== ids.length) return null;
  return { gid, name: doc.groupNames[gid] ?? `Group-${gid}` };
});

// 선택 전체가 하나의 링크일 때 그 링크의 동기화 스코프 (없으면 null → 패널이 전체 on으로 표시)
const currentLinkId = computed(() => {
  if (selectedUnits.value.length < 2) return null;
  const lids = [...new Set(selectedUnits.value.map((u) => u.linkId))];
  return lids.length === 1 && lids[0] != null &&
    docApi.linkMemberIds(lids[0]).length === selectedUnits.value.length
    ? lids[0] : null;
});
const linkScope = computed(() => (currentLinkId.value ? doc.linkScopes[currentLinkId.value] ?? null : null));
function onLinkScopeToggle(cat) {
  const lid = currentLinkId.value;
  if (!lid) return;
  if (!doc.linkScopes[lid]) {
    doc.linkScopes[lid] = { size: true, orientation: true, grid: true, shape: true, color: true };
  }
  doc.linkScopes[lid][cat] = !doc.linkScopes[lid][cat];
}

// 프리셋 배치: 스테이지 중앙에 생성
function placePreset(preset) {
  const [wx, wy] = stageRef.value.centerWorld();
  docApi.createUnitFrom(preset.params, wx, wy);
}
// 프리셋 삭제 — Default Unit은 영구 보존, 안내만
function deletePreset(id) {
  if (id === 'default') {
    stageRef.value?.toast('Default Unit is permanent — it cannot be deleted');
    return;
  }
  presetsApi.remove(id);
}
// 프리셋 추출: 단독 유닛 SVG 다운로드
function exportPreset(preset) {
  const p = preset.params;
  downloadSvg({ W: p.W, H: p.H, unit: deriveUnit(p).unit, orientation: p.orientation, fill: p.fill });
}

// 타입별 export 아이템 구성 (rect는 도형 정보만, 그리드 가이드 미포함)
function exportItem(u) {
  const p = u.params;
  if (u.type === 'rect') {
    return {
      type: 'rect', x: u.x, y: u.y, W: p.W, H: p.H,
      fill: p.fill, fillOn: p.fillOn, strokeOn: p.strokeOn, strokeColor: p.strokeColor,
    };
  }
  return {
    type: 'unit', x: u.x, y: u.y, W: p.W, H: p.H,
    unit: deriveUnit(p).unit, orientation: p.orientation, fill: p.fill,
  };
}
function exportSvg() {
  const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
  if (sel.length > 1) {
    // 다중 선택: 상대 배치를 보존한 컴포지트
    downloadCompositeSvg(sel.map(exportItem));
    return;
  }
  if (!active.value) return;
  downloadSvg(exportItem(active.value));
}
const presetList = presetsApi.presets; // top-level ref — 템플릿 자동 언랩

// JSON 프로젝트 저장/열기 — 대시보드 작업 전체 (유닛·뷰포트·커스텀 비율)
function saveProject() {
  const data = {
    version: 1,
    units: doc.units,
    groupNames: doc.groupNames,
    linkScopes: doc.linkScopes,
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
    docApi.loadProject(data.units || [], { groupNames: data.groupNames, linkScopes: data.linkScopes });
    if (data.viewport) Object.assign(viewport.vp, data.viewport);
    if (data.customRatios) {
      localStorage.setItem('eo.customRatios', JSON.stringify(data.customRatios));
      window.dispatchEvent(new Event('eo:ratios'));
    }
  } catch (err) {
    console.error('invalid project file', err);
  }
}

function onLink(scope) {
  const r = docApi.toggleLinkSelected(scope);
  if (r && stageRef.value) {
    stageRef.value.toast(
      r.action === 'linked'
        ? `Linked ${r.count} units — synced to "${r.src}"`
        : r.action === 'mixed'
          ? 'Cannot link different object types'
          : `Unlinked ${r.count} units`
    );
  }
}

docApi.setNotifier((msg) => stageRef.value?.toast(msg));

const stageActions = {
  ...docApi, exportSvg, saveProject, openProject,
  registerPreset: (u) => presetsApi.register(u.params, u.name),
};
</script>

<template>
  <div class="layout">
    <aside class="side" @contextmenu.prevent>
      <ControlPanel
        :unit="panelUnit"
        :gutter-max="gutterMax"
        :selected="selectedUnits"
        :group="selectedGroup"
        :link-scope="linkScope"
        :presets="presetList"
        @set-size="docApi.setSize"
        @set-aspect="docApi.setAspect"
        @set-a="docApi.setA"
        @set-b="docApi.setB"
        @rename="docApi.renameActive"
        @rename-group="(gid, name) => docApi.renameGroup(gid, name)"
        @link-scope-toggle="onLinkScopeToggle"
        @place-preset="placePreset"
        @delete-preset="deletePreset"
        @rename-preset="presetsApi.rename"
        @export-preset="exportPreset"
        @link="onLink"
        @fill="docApi.setFill"
      />
    </aside>
    <DashboardStage ref="stageRef" :doc="doc" :viewport="viewport" :actions="stageActions" />
  </div>
</template>

<style scoped lang="scss">
.layout { display: flex; height: 100vh; background: var(--bg); }
// 플로팅 카드 패널 — 툴바(FloatingBar)와 동일 문법: 뷰포트 상·좌·하 동일 간격
.side {
  width: var(--panel-w); flex-shrink: 0; overflow-y: auto;
  margin: var(--sp-6) 0 var(--sp-6) var(--sp-6);
  height: calc(100vh - 2 * var(--sp-6)); box-sizing: border-box;
  padding: 22px var(--panel-pad) 40px;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  // 슬림 스크롤바 — 패널 톤에 맞춤
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--line); border-radius: 2px; }
  &::-webkit-scrollbar-thumb:hover { background: var(--faint); }
}
</style>
