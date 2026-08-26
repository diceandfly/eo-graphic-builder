<script setup>
import { computed, ref, watch } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import StepField from '../controls/StepField.vue';
import ColorField from '../controls/ColorField.vue';
import { ICONS } from '../../ui/icons.js';
import { STAGE_GRID, STAGE_GRID_MIN, STAGE_GRID_MAX, UNIT_MIN, THREAD_MIN_PX } from '../../geometry/constants.js';
import { blurActive } from '../../utils/dom.js';
import { registerPopup, unregisterPopup, POPUP_IDLE_MS } from '../../utils/popupBus.js';

// 우하단 코너 바 — 캔버스 그리드 / 바운딩박스 / 유닛 그리드 토글 + 줌%
// 각 토글 버튼 우클릭 = 옵션 메뉴 (그리드: 격자 크기·스냅 / 바운딩박스: 방향키 px·링크 배지 / 유닛 그리드: 가이드 색)
const props = defineProps({
  scale: Number, guides: Boolean, unitGrid: Boolean, frameGrid: Boolean, stageGrid: Boolean, bbox: Boolean,
  gridCfg: Object, // { size, snap } — reactive 스토어 (깊은 변경으로 직접 편집)
  view: Object,    // { nudge, showLinks, guideColor } — 뷰 옵션 reactive 스토어
  limits: Object,  // { unitMin, threadMinPx } — 지오메트리 하한 (문서 px 절대값, §108)
});
defineEmits(['reset', 'toggleGuides', 'toggleUnitGrid', 'toggleFrameGrid', 'toggleStageGrid', 'toggleBbox']);
const pct = computed(() => Math.round(props.scale * 100));

// 옵션 메뉴 — 한 번에 하나만, 5초 무조작 시 자동 닫힘
const openMenu = ref(null); // 'grid' | 'bbox' | 'unit' | null
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeMenu, POPUP_IDLE_MS);
}
function onContext(key, e) {
  e.preventDefault();
  openMenu.value = openMenu.value === key ? null : key;
  if (openMenu.value) resetIdle();
}
function closeMenu() {
  blurActive(); // 닫히기 전에 pending 입력 커밋 (§93)
  clearTimeout(idleTimer);
  openMenu.value = null;
}
watch(openMenu, (open) => {
  if (open) {
    registerPopup(closeMenu); // 다른 열린 팝업 자동 닫기 (§97)
    setTimeout(() => window.addEventListener('pointerdown', closeMenu, { once: true }), 0);
  } else unregisterPopup(closeMenu);
});

// 정수 필드 콜백 (StepField — §89에서 스테퍼 통일)
const setGridSize = (v) => { props.gridCfg.size = Math.round(v); };
const setNudge = (v) => { props.view.nudge = Math.round(v); };
const setSeamCutoff = (v) => { props.view.seamCutoff = Math.round(v); };
// 지오메트리 하한 (§108) — 둘 다 문서 px 절대값, 소수점 허용. 환산 없음(입력 = 저장 = 표시).
// 유닛 설정 일괄 초기화 — 하한 20px/1px + 가이드 색 기본 (§88·§109)
function resetUnitDefaults() {
  if (props.limits) {
    props.limits.unitMin = UNIT_MIN;
    props.limits.threadMinPx = THREAD_MIN_PX;
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
          <div class="menuTitle">Canvas grid setting</div>
          <!-- §134: 워크스페이스 색은 무채색 한정 픽커 -->
          <div class="menuRow">
            <span class="rowGrow">Canvas color</span>
            <ColorField v-model="view.stageBgColor" fallback="var(--stage-bg)" grayscale />
          </div>
          <div class="menuRow">
            <span class="rowGrow">Grid color</span>
            <ColorField v-model="view.stageGridColor" fallback="var(--stage-grid)" grayscale />
          </div>
          <label class="menuRow">
            <span class="rowGrow">Grid size</span>
            <StepField
              :model-value="gridCfg.size" :min="STAGE_GRID_MIN" :max="STAGE_GRID_MAX" :step="10"
              @update:model-value="setGridSize"
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
          <div class="menuTitle">Bounding box setting</div>
          <label class="menuRow">
            <span class="rowGrow">Arrow nudge</span>
            <StepField :model-value="view.nudge" :min="1" :max="500" :step="1" @update:model-value="setNudge" />
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
          :tip="openMenu === 'unit' ? '' : guides ? 'Hide unit/frame grid' : 'Show unit/frame grid'"
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
            <span class="rowGrow">Unit min</span>
            <StepField v-model="limits.unitMin" :min="1" :max="200" :step="5" />
          </label>
          <label v-if="limits" class="menuRow">
            <span class="rowGrow">Thread min</span>
            <StepField v-model="limits.threadMinPx" :min="0" :max="50" :step="0.5" />
          </label>
          <div class="menuRow">
            <span class="rowGrow">Unit/frame grid color</span>
            <ColorField v-model="view.guideColor" fallback="var(--guide)" />
          </div>
          <!-- §132: 개별 표시 토글 — 코너 아이콘 좌클릭은 둘 다 켜고 끄는 마스터 -->
          <label class="menuRow">
            <input type="checkbox" :checked="unitGrid" @change="$emit('toggleUnitGrid')" />
            <span>Unit grid</span>
          </label>
          <label class="menuRow">
            <input type="checkbox" :checked="frameGrid" @change="$emit('toggleFrameGrid')" />
            <span>Frame grid</span>
          </label>
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
            <span>Auto seam stroke</span>
          </label>
          <label class="menuRow">
            <span class="rowGrow">Off above zoom</span>
            <StepField
              :model-value="view.seamCutoff" :min="10" :max="400" :step="5"
              @update:model-value="setSeamCutoff"
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
.rowGrow { flex: 1; }
.sect { margin-top: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
.miniBtn {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base); padding: 3px 8px;
  align-self: flex-start;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
