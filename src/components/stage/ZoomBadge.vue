<script setup>
import { computed, ref, watch } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';
import { STAGE_GRID, STAGE_GRID_MIN, STAGE_GRID_MAX, UNIT_MIN, THREAD_MIN_RATIO } from '../../geometry/constants.js';

// 우하단 코너 바 — 캔버스 그리드 / 바운딩박스 / 유닛 그리드 토글 + 줌%
// 각 토글 버튼 우클릭 = 옵션 메뉴 (그리드: 격자 크기·스냅 / 바운딩박스: 방향키 px·링크 배지 / 유닛 그리드: 가이드 색)
const props = defineProps({
  scale: Number, guides: Boolean, stageGrid: Boolean, bbox: Boolean,
  gridCfg: Object, // { size, snap } — reactive 스토어 (깊은 변경으로 직접 편집)
  view: Object,    // { nudge, showLinks, guideColor } — 뷰 옵션 reactive 스토어
  limits: Object,  // { unitMin, threadMinRatio } — 지오메트리 하한 (§87)
});
defineEmits(['reset', 'toggleGuides', 'toggleStageGrid', 'toggleBbox']);
const pct = computed(() => Math.round(props.scale * 100));

// 옵션 메뉴 — 한 번에 하나만, 5초 무조작 시 자동 닫힘
const openMenu = ref(null); // 'grid' | 'bbox' | 'unit' | null
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeMenu, 5000);
}
function onContext(key, e) {
  e.preventDefault();
  openMenu.value = openMenu.value === key ? null : key;
  if (openMenu.value) resetIdle();
}
function closeMenu() {
  clearTimeout(idleTimer);
  openMenu.value = null;
}
watch(openMenu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeMenu, { once: true }), 0);
});

function onSize(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v > 0) {
    props.gridCfg.size = Math.min(STAGE_GRID_MAX, Math.max(STAGE_GRID_MIN, Math.round(v)));
  }
  e.target.value = props.gridCfg.size;
}
function onNudge(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 1) props.view.nudge = Math.min(500, Math.round(v));
  e.target.value = props.view.nudge;
}
// hex 컬러 입력 공통 처리 — 빈 값 = 기본색 복귀(null)
function hexSetter(key) {
  return (e) => {
    let t = e.target.value.trim();
    if (!t) { props.view[key] = null; return; }
    if (t[0] !== '#') t = '#' + t;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) props.view[key] = t;
  };
}
const onGuideColor = hexSetter('guideColor');
const onStageGridColor = hexSetter('stageGridColor');
const onStageBgColor = hexSetter('stageBgColor');
// 지오메트리 하한 입력 (§87) — 유닛 그리드 메뉴
function onUnitMin(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 1) props.limits.unitMin = Math.min(50, Math.round(v));
  e.target.value = props.limits.unitMin;
}
function onThreadMin(e) {
  const v = Number(e.target.value); // 표기 = % (내부 비율 ×100)
  if (Number.isFinite(v) && v >= 0 && v <= 5) props.limits.threadMinRatio = Math.round(v * 1000) / 100000;
  e.target.value = (props.limits.threadMinRatio * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
// seam 보정 컷오프 (%) 입력 (§86)
function onSeamCutoff(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 10) props.view.seamCutoff = Math.min(400, Math.round(v));
  e.target.value = props.view.seamCutoff;
}
// 유닛 설정 일괄 초기화 — 하한 2px/0.1% + 가이드 색 기본 (§88)
function resetUnitDefaults() {
  if (props.limits) {
    props.limits.unitMin = UNIT_MIN;
    props.limits.threadMinRatio = THREAD_MIN_RATIO;
  }
  props.view.guideColor = null;
}
// 캔버스 그리드 옵션 일괄 초기화 (크기·스냅·격자색·배경색 — §85)
function resetGridDefaults() {
  props.gridCfg.size = STAGE_GRID;
  props.gridCfg.snap = false;
  props.view.stageGridColor = null;
  props.view.stageBgColor = null;
}
</script>

<template>
  <div class="corner">
    <FloatingBar>
      <div class="optWrap">
        <IconButton
          :paths="ICONS.canvasGrid" :active="stageGrid" tip-align="right"
          :tip="openMenu === 'grid' ? '' : stageGrid ? 'Hide Canvas Grid' : 'Show Canvas Grid'"
          @click="$emit('toggleStageGrid')"
          @contextmenu="onContext('grid', $event)"
        />
        <div
          v-if="openMenu === 'grid' && gridCfg"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Canvas grid</div>
          <div class="menuRow">
            <span class="rowGrow">Canvas color</span>
            <span class="preview" :style="{ background: view.stageBgColor || 'var(--bg)' }" />
            <input
              class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
              :value="view.stageBgColor || ''"
              @keydown.enter="onStageBgColor" @change="onStageBgColor"
            />
          </div>
          <div class="menuRow">
            <span class="rowGrow">Grid color</span>
            <span class="preview" :style="{ background: view.stageGridColor || 'var(--stage-grid)' }" />
            <input
              class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
              :value="view.stageGridColor || ''"
              @keydown.enter="onStageGridColor" @change="onStageGridColor"
            />
          </div>
          <label class="menuRow">
            <span class="rowGrow">Grid size (px)</span>
            <input
              class="numInput" type="number"
              :min="STAGE_GRID_MIN" :max="STAGE_GRID_MAX"
              :value="gridCfg.size" @change="onSize"
            />
          </label>
          <label class="menuRow">
            <input type="checkbox" v-model="gridCfg.snap" />
            <span>Snap to grid</span>
          </label>
          <button class="miniBtn" @click="resetGridDefaults">reset to defaults</button>
        </div>
      </div>
      <div class="optWrap">
        <IconButton
          :paths="ICONS.boxSelect" :active="bbox" tip-align="right"
          :tip="openMenu === 'bbox' ? '' : bbox ? 'Hide Bounding Box' : 'Show Bounding Box'"
          @click="$emit('toggleBbox')"
          @contextmenu="onContext('bbox', $event)"
        />
        <div
          v-if="openMenu === 'bbox' && view"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Selection</div>
          <label class="menuRow">
            <span>Arrow nudge (px)</span>
            <input class="numInput" type="number" min="1" max="500" :value="view.nudge" @change="onNudge" />
          </label>
          <label class="menuRow">
            <input type="checkbox" v-model="view.showGroups" />
            <span>Show group outlines</span>
          </label>
          <label class="menuRow">
            <input type="checkbox" v-model="view.showLinks" />
            <span>Show link badges</span>
          </label>
        </div>
      </div>
      <div class="optWrap">
        <IconButton
          :paths="ICONS.unitGrid" :active="guides" tip-align="right"
          :tip="openMenu === 'unit' ? '' : guides ? 'Hide Unit Grid' : 'Show Unit Grid'"
          @click="$emit('toggleGuides')"
          @contextmenu="onContext('unit', $event)"
        />
        <div
          v-if="openMenu === 'unit' && view"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Unit setting</div>
          <label v-if="limits" class="menuRow">
            <span class="rowGrow">Unit min (px)</span>
            <input class="numInput" type="number" min="1" max="50" :value="limits.unitMin" @change="onUnitMin" />
          </label>
          <label v-if="limits" class="menuRow">
            <span class="rowGrow">Thread min (%)</span>
            <input
              class="numInput" type="number" min="0" max="5" step="0.01"
              :value="+(limits.threadMinRatio * 100).toFixed(3)" @change="onThreadMin"
            />
          </label>
          <div class="menuRow">
            <span class="rowGrow">Unit grid color</span>
            <span class="preview" :style="{ background: view.guideColor || 'var(--guide)' }" />
            <input
              class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
              :value="view.guideColor || ''"
              @keydown.enter="onGuideColor"
              @change="onGuideColor"
            />
          </div>
          <button class="miniBtn" @click="resetUnitDefaults">reset to default</button>
        </div>
      </div>
      <div class="optWrap">
        <IconButton
          class="zoom" tip-align="right"
          :tip="openMenu === 'zoom' ? '' : 'Reset zoom (100%)'"
          @click="$emit('reset')"
          @contextmenu="onContext('zoom', $event)"
        >
          {{ pct }}%
        </IconButton>
        <!-- 줌 우클릭: 렌더 시각 보정 옵션 (§86) -->
        <div
          v-if="openMenu === 'zoom' && view"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Render compensation</div>
          <label class="menuRow">
            <input type="checkbox" v-model="view.seamOn" />
            <span>Seam stroke (AA fix)</span>
          </label>
          <label class="menuRow">
            <span class="rowGrow">Off above zoom (%)</span>
            <input
              class="numInput" type="number" min="10" max="400"
              :value="view.seamCutoff" @change="onSeamCutoff"
            />
          </label>
        </div>
      </div>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.corner { position: absolute; right: var(--sp-6); bottom: var(--sp-6); }
.zoom { width: var(--zoom-w); font-variant-numeric: tabular-nums; }
.optWrap { position: relative; }
.menu {
  position: absolute; bottom: calc(100% + 14px); right: 0;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.menuTitle {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  color: var(--faint); margin-bottom: 2px; white-space: nowrap;
}
.menuRow {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--text); cursor: pointer; white-space: nowrap;
}
.numInput {
  @include text-field;
  width: 52px; padding: 2px 6px; text-align: right;
}
.hexInput {
  @include text-field;
  width: 76px; padding: 3px 8px; text-transform: uppercase;
}
.rowGrow { flex: 1; }
.sect { margin-top: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
.preview {
  width: var(--swatch-chip); height: var(--swatch-chip); flex-shrink: 0;
  border: 1px solid var(--line); border-radius: var(--radius);
}
.miniBtn {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base); padding: 3px 8px;
  align-self: flex-start;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
