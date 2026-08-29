<script setup>
import { ref, computed } from 'vue';
import { useDocument } from './composables/useDocument.js';
import { useViewport } from './composables/useViewport.js';
import { usePresets } from './composables/usePresets.js';
import { deriveUnit } from './geometry/derive.js';
import { downloadSvg, downloadCompositeSvg, buildSelectionSvg } from './export/exportSvg.js';
import { copyTextToClipboard, copySvgAsPng } from './utils/clipboard.js';
import { saveFileAs } from './utils/saveFile.js';
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

// 선택이 공유하는 단일 링크그룹 (전체/서브셋 무관) — 패널 칩은 이 그룹의 스코프를 표시 (§129)
const sharedLinkId = computed(() => {
  if (selectedUnits.value.length < 2) return null;
  const lids = [...new Set(selectedUnits.value.map((u) => u.linkId))];
  return lids.length === 1 && lids[0] != null ? lids[0] : null;
});
const isLinkSubset = computed(
  () => sharedLinkId.value != null
    && docApi.linkMemberIds(sharedLinkId.value).length !== selectedUnits.value.length
);
const linkScope = computed(() => (sharedLinkId.value ? doc.linkScopes[sharedLinkId.value] ?? null : null));
function onLinkScopeToggle(cat) {
  const lid = sharedLinkId.value;
  if (!lid) return;
  // §129: 서브셋 선택에서 칩 조작 = 선택분을 새 링크그룹으로 분리 (원본 스코프 + 해당 칩 토글)
  if (isLinkSubset.value) {
    const r = docApi.splitLinkSelected(cat);
    if (r) stageRef.value?.toast(`Split ${r.count} units into a new link group`);
    return;
  }
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
// 프리셋 라이브러리 가져오기 (병합)
async function importPresets(file) {
  const n = await presetsApi.importJson(file);
  stageRef.value?.toast(n ? `Imported ${n} preset${n > 1 ? 's' : ''}` : 'No valid presets in file');
}
// 프리셋 추출: 단독 유닛 SVG 다운로드
function exportPreset(preset) {
  const p = preset.params;
  downloadSvg({ W: p.W, H: p.H, unit: deriveUnit(p).unit, orientation: p.orientation, fill: p.fill });
}

// 타입별 export 아이템 구성 (rect는 도형 정보만, 그리드 가이드 미포함)
function exportItem(u) {
  const p = u.params;
  if (u.type === 'frame') {
    return {
      type: 'frame', x: u.x, y: u.y, W: p.W, H: p.H, fill: p.fill, fillOn: p.fillOn,
      strokeOn: p.strokeOn, stroke: p.stroke, strokeW: p.strokeW,
    };
  }
  return {
    type: 'unit', x: u.x, y: u.y, W: p.W, H: p.H,
    unit: deriveUnit(p).unit, orientation: p.orientation, fill: p.fill,
  };
}
// 현재 선택 → export 아이템 목록 (다중 = 컴포지트, 아니면 활성 유닛)
// 프레임은 소유 유닛(§92 중심점 판정)까지 동반 — 이동·복제와 동일한 내용물 문법 (§118).
// 포함 순서는 doc.units 순서 그대로 = 스테이지 z-오더와 일치.
function selectionItems() {
  const ids = new Set(doc.selectedIds);
  const frameIds = doc.units.filter((u) => ids.has(u.id) && u.type === 'frame').map((u) => u.id);
  if (frameIds.length) for (const o of docApi.frameOwnedUnits(frameIds)) ids.add(o.id);
  const sel = doc.units.filter((u) => ids.has(u.id));
  if (sel.length > 1) return sel.map(exportItem);
  return active.value ? [exportItem(active.value)] : [];
}
function exportSvg() {
  const items = selectionItems();
  if (!items.length) return;
  if (items.length > 1) downloadCompositeSvg(items);
  else downloadSvg(items[0]);
}
// 시스템 클립보드 복사 — SVG 텍스트(⌘C 겸용) / PNG 2x(⌘⇧C)
async function copySelectionSvg() {
  const items = selectionItems();
  if (!items.length) return false;
  await copyTextToClipboard(buildSelectionSvg(items).svg);
  return true;
}
async function copySelectionPng() {
  const items = selectionItems();
  if (!items.length) return false;
  const { svg, w, h } = buildSelectionSvg(items);
  await copySvgAsPng(svg, w, h, 2);
  return true;
}
const presetList = presetsApi.presets; // top-level ref — 템플릿 자동 언랩

// JSON 프로젝트 저장/열기 — 저장·열기 버튼 우클릭 메뉴의 3분류 토글 (§88)
// work = units·groups·links·배치 / tools = 도구 커스터마이즈 / viewport = 그리드·렌더 옵션
// 카메라(줌·팬)는 토글 없이 항상 저장, 로드 시 마지막 위치로 자동 복원
const TOOLS_KEYS = ['eyedropScope', 'blend', 'arrange', 'frameQuick', 'rectQuick', 'currentColor', 'customColor', 'recentColors'];
const VIEWSET_KEYS = ['grid', 'view', 'limits'];
const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
function saveProject(scope = {}) {
  const data = { version: 3, camera: { ...viewport.vp } };
  if (scope.work !== false) {
    data.units = doc.units;
    data.groupNames = doc.groupNames;
    data.linkScopes = doc.linkScopes;
  }
  const prefsData = readJson('eo.prefs', {});
  if (scope.tools) {
    data.tools = { ...pick(prefsData, TOOLS_KEYS), customRatios: readJson('eo.customRatios', []) };
  }
  if (scope.viewport) data.viewSettings = pick(prefsData, VIEWSET_KEYS);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  // §182·§183: 파일명 = 날짜+시분(같은 날 다중 저장 구분, 초 생략) + 저장 위치 다이얼로그
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
  saveFileAs(blob, `eo-workspace-data_${stamp}.json`, 'workspace'); // §199: 폴더 기억 버킷 분리
}
async function openProject(file, scope = {}) {
  try {
    const data = JSON.parse(await file.text());
    if (scope.work !== false && Array.isArray(data.units)) {
      docApi.loadProject(data.units, { groupNames: data.groupNames, linkScopes: data.linkScopes });
    }
    // 카메라: 항상 마지막 저장 위치로 (v3 camera, v1·2 viewport 하위 호환)
    const cam = data.camera ?? data.viewport;
    if (cam) Object.assign(viewport.vp, cam);
    // 설정 병합: v3 tools/viewSettings, v2 workspace.prefs 하위 호환
    const legacy = data.workspace?.prefs;
    const toolsSrc = data.tools ?? (legacy ? pick(legacy, TOOLS_KEYS) : null);
    const viewSrc = data.viewSettings ?? (legacy ? pick(legacy, VIEWSET_KEYS) : null);
    let touched = false;
    const merged = readJson('eo.prefs', {});
    if (scope.tools !== false && toolsSrc) {
      Object.assign(merged, pick(toolsSrc, TOOLS_KEYS));
      touched = true;
      const ratios = toolsSrc.customRatios ?? data.workspace?.customRatios ?? data.customRatios;
      if (ratios) {
        localStorage.setItem('eo.customRatios', JSON.stringify(ratios));
        window.dispatchEvent(new Event('eo:ratios'));
      }
    }
    if (scope.viewport !== false && viewSrc) {
      Object.assign(merged, pick(viewSrc, VIEWSET_KEYS));
      touched = true;
    }
    if (touched) {
      localStorage.setItem('eo.prefs', JSON.stringify(merged));
      window.dispatchEvent(new Event('eo:prefs')); // DashboardStage가 라이브 반영
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

// 링크 멤버 1개만 선택 시 "이 유닛만 해제"
function onUnlinkOne() {
  if (!active.value) return;
  const r = docApi.unlinkUnit(active.value.id);
  if (r) stageRef.value?.toast(`Unlinked "${r.name}" from its link group`);
}

docApi.setNotifier((msg) => stageRef.value?.toast(msg));

// 프리셋 등록/삭제/이름변경도 ⌘Z 히스토리에 편입 (§103)
docApi.registerHistoryExtra(
  () => presetsApi.serialize(),
  (v) => presetsApi.restore(v)
);

const stageActions = {
  ...docApi, exportSvg, saveProject, openProject, copySelectionSvg, copySelectionPng,
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
        @export-presets="presetsApi.exportJson"
        @import-presets="importPresets"
        @link="onLink"
        @unlink-one="onUnlinkOne"
        @fill="docApi.setFill"
      />
    </aside>
    <DashboardStage ref="stageRef" :doc="doc" :viewport="viewport" :actions="stageActions" />
  </div>
</template>

<style scoped lang="scss">
.layout { display: flex; height: 100vh; background: var(--bg); position: relative; }
// 플로팅 카드 패널 — 스테이지 위 오버레이: 주변 여백으로 캔버스가 그대로 비침 (§85)
.side {
  position: absolute; left: var(--sp-6); top: var(--sp-6); z-index: 10;
  width: var(--panel-w); overflow-y: auto;
  height: calc(100vh - 2 * var(--sp-6)); box-sizing: border-box;
  padding: 13px var(--panel-pad) 18px; // §123 상단 22→16 → §124 추가 축소 (13/18)

  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  // 슬림 스크롤바 — 패널 톤에 맞춤
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--line); border-radius: 2px; }
  &::-webkit-scrollbar-thumb:hover { background: var(--faint); }
}
</style>
