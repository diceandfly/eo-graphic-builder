<script setup>
import { ref } from 'vue';
import PresetGridBrowser from '../panel/PresetGridBrowser.vue';
import UnitGraphic from './UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';

// §221: 프리셋 플로팅 창 — DashboardStage에서 분리 (애니메이션 선행: 스테이지 비대 해소).
// 스테이지는 열림 상태(panel)·좌표 변환(centerWorld/clientToWorld)·스토어 액션만 공급하고,
// 창 내부 상호작용(배치·IO·높이 조절)은 전부 여기서 끝난다. 토스트만 위로 올림.
const props = defineProps({
  panel: { type: String, required: true }, // 'units' | 'patterns'
  width: { type: Number, default: 580 }, // §224: 왼쪽 끝 = 작업 툴바 왼쪽 라인 (스테이지가 실측 공급)
  presets: { type: Array, default: () => [] },
  presetFolders: { type: Array, default: () => [] },
  patterns: { type: Array, default: () => [] },
  patternFolders: { type: Array, default: () => [] },
  actions: { type: Object, required: true },
  centerWorld: { type: Function, required: true },   // () => [wx, wy] — 캔버스 중앙
  clientToWorld: { type: Function, required: true }, // (cx, cy) => [wx, wy] — 드롭 좌표
});
const emit = defineEmits(['toast']);
const toast = (msg) => emit('toast', msg);

// §208·§214: 패널 폭 = 고정(4열 기준), 밀도는 열 토글 — **높이만** 상단 엣지 드래그로 조절 (로컬 영속)
const rootEl = ref(null);
const panelH = ref(Number(localStorage.getItem('eo.presetFloatH')) || 620);
function onHeightGripDown(e) {
  e.preventDefault();
  const sy = e.clientY;
  const h0 = panelH.value;
  const mv = (ev) => {
    // §215·§217: 상한 = 성능 인디케이터 바로 아래 갭까지 — CSS max-height(157)와 동일 식
    const maxH = (rootEl.value?.parentElement?.clientHeight ?? window.innerHeight) - 157;
    panelH.value = Math.min(Math.max(h0 + (sy - ev.clientY), 280), maxH);
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    localStorage.setItem('eo.presetFloatH', String(Math.round(panelH.value)));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
}

function onPlacePattern(p) {
  const [cx, cy] = props.centerWorld();
  props.actions.placePattern(p, cx, cy);
  toast(`Placed "${p.name}"`);
}
async function onImportPatterns(file) {
  const n = await props.actions.patternImportJson(file);
  toast(n ? `Imported ${n} pattern${n > 1 ? 's' : ''}` : 'No patterns found in that file');
}
// §207: 유닛 프리셋 — 메인 패널에서 프리셋 바 플로팅 패널로 이관
function onPlacePreset(p) {
  const [cx, cy] = props.centerWorld();
  props.actions.createUnitFrom(p.params, cx, cy, p.name);
}
async function onImportPresets(file) {
  const n = await props.actions.presetImportJson(file);
  toast(n ? `Imported ${n} preset${n > 1 ? 's' : ''}` : 'No valid presets in file');
}
// §210: 카드 → 캔버스 드랍 배치
function onPlacePresetAt(item, cx, cy) {
  const [wx, wy] = props.clientToWorld(cx, cy);
  props.actions.createUnitFrom(item.params, wx, wy, item.name);
}
function onPlacePatternAt(item, cx, cy) {
  const [wx, wy] = props.clientToWorld(cx, cy);
  props.actions.placePattern(item, wx, wy);
  toast(`Placed "${item.name}"`);
}
</script>

<template>
  <!-- §205·§207: 프리셋 플로팅 패널 — 프리셋 바 위, 우측 정렬. 상단 엣지로 높이 조절 -->
  <div
    ref="rootEl"
    class="presetFloat"
    :style="{ height: panelH + 'px', width: width + 'px' }"
    @pointerdown.stop @wheel.stop @contextmenu.stop.prevent
  >
    <div class="heightGrip" title="Drag to resize height" @pointerdown.stop="onHeightGripDown" />
    <PresetGridBrowser
      v-if="panel === 'patterns'"
      title="Pattern presets"
      :items="patterns"
      :folders="patternFolders"
      empty-text="right-click a frame to register a pattern"
      thumb-aspect="16 / 9"
      :view-box-of="(p) => `0 0 ${p.frame.W} ${p.frame.H}`"
      cols-key="eo.presetCols.patterns"
      @place="onPlacePattern"
      @place-at="onPlacePatternAt"
      @remove="(ids) => ids.forEach((id) => props.actions.patternRemove(id))"
      @rename="(id, name) => props.actions.patternRename(id, name)"
      @duplicate="(ids) => props.actions.patternDuplicate(ids)"
      @reorder="(ids, to) => ids.forEach((id) => props.actions.patternReorder(id, to))"
      @move-to-folder="(ids, fid) => props.actions.patternMoveToFolder(ids, fid)"
      @add-folder="props.actions.patternAddFolder()"
      @rename-folder="(id, name) => props.actions.patternRenameFolder(id, name)"
      @remove-folder="(id) => props.actions.patternRemoveFolder(id)"
      @export-json="props.actions.patternExportJson"
      @import-json="onImportPatterns"
    >
      <template #thumb="{ item }">
        <rect
          :width="item.frame.W" :height="item.frame.H"
          :fill="frameAttrs(item.frame).fill" :stroke="frameAttrs(item.frame).stroke"
          :stroke-width="frameAttrs(item.frame).strokeW"
        />
        <g v-for="(u, i) in item.units" :key="i" :transform="`translate(${u.dx} ${u.dy})`">
          <UnitGraphic :params="u.params" :seam-width="0.75" />
        </g>
      </template>
    </PresetGridBrowser>
    <PresetGridBrowser
      v-else
      title="Unit presets"
      :items="presets"
      :folders="presetFolders"
      empty-text="right-click a unit to register a preset"
      protected-id="default"
      show-export-svg
      :view-box-of="(p) => `0 0 ${p.params.W} ${p.params.H}`"
      cols-key="eo.presetCols.units"
      @place="onPlacePreset"
      @place-at="onPlacePresetAt"
      @remove="(ids) => ids.forEach((id) => props.actions.presetRemove(id))"
      @rename="(id, name) => props.actions.presetRename(id, name)"
      @duplicate="(ids) => props.actions.presetDuplicate(ids)"
      @reorder="(ids, to) => ids.forEach((id) => props.actions.presetReorder(id, to))"
      @move-to-folder="(ids, fid) => props.actions.presetMoveToFolder(ids, fid)"
      @add-folder="props.actions.presetAddFolder()"
      @rename-folder="(id, name) => props.actions.presetRenameFolder(id, name)"
      @remove-folder="(id) => props.actions.presetRemoveFolder(id)"
      @export-json="props.actions.presetExportJson"
      @import-json="onImportPresets"
      @export-svg="(p) => props.actions.presetExportSvg(p)"
    >
      <template #thumb="{ item }">
        <UnitGraphic :params="item.params" :seam-width="0.75" />
      </template>
    </PresetGridBrowser>
  </div>
</template>

<style scoped lang="scss">
// §205~§208: 프리셋 플로팅 패널 — 프리셋 바(우하단) 위, 고정 크기(4열 기준 폭).
// 밀도 조절은 브라우저 헤더의 열 토글 (§208: 그립 리사이즈 폐기 — §214: 높이만 상단 엣지로).
.presetFloat {
  position: absolute; right: var(--sp-6); bottom: calc(var(--sp-6) + 42px + var(--sp-6)); /* §217: 갭 토큰 통일 */
  /* §214: 캔버스 우클릭 메뉴(z10)·이름 편집(z20)이 창 위로 겹치도록 오더 하향 */
  z-index: var(--z-win-preset); /* §272 */
  /* §224: width는 인라인(스테이지 실측 — 좌변 = 작업 툴바 좌변) */
  max-width: calc(100% - 2 * var(--sp-6));
  /* §215·§217: 최대 높이 = 성능 인디케이터 아래 갭까지 — 하단(12+42+12=66) + 상단(66+13+12=91) = 157 */
  max-height: calc(100% - 157px);
  box-sizing: border-box; overflow: hidden;
  @include chamfer(var(--chamfer-0)); // §272: 대형 창
  padding: var(--window-pad-y) var(--panel-pad); // §213·§219
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
}
// §214: 프리셋창 높이 조절 — 상단 엣지 스트립 (bottom 앵커라 위로 늘어남)
.heightGrip {
  position: absolute; top: 0; left: 0; right: 0; height: 7px;
  cursor: ns-resize;
  &:hover { box-shadow: inset 0 2px 0 var(--accent); }
}
</style>
