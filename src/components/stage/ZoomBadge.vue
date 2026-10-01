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
  units: { type: Array, default: () => [] },           // §225: 미니맵용 오브젝트
  vpos: Object,                                        // §225: 뷰포트 {x, y, scale}
  stageSize: { type: Object, default: () => ({ w: 0, h: 0 }) },
});
const emit = defineEmits(['reset', 'toggleGuides', 'toggleUnitGrid', 'toggleFrameGrid', 'toggleStageGrid', 'toggleBbox', 'fitAll', 'jumpTo']);
const pct = computed(() => Math.round(props.scale * 100));

// ── §225: 미니맵 — 전체 오브젝트 + 현재 뷰포트 영역(직사각형). 클릭 = 그 지점으로 시점 이동 ──
const MM_W = 168;
const MM_H = 100;
const minimap = computed(() => {
  if (!props.vpos || !props.units.length) return null;
  const vs = props.vpos.scale;
  const view = {
    x: -props.vpos.x / vs, y: -props.vpos.y / vs,
    w: props.stageSize.w / vs, h: props.stageSize.h / vs,
  };
  let minX = view.x; let minY = view.y; let maxX = view.x + view.w; let maxY = view.y + view.h;
  for (const u of props.units) {
    minX = Math.min(minX, u.x); minY = Math.min(minY, u.y);
    maxX = Math.max(maxX, u.x + u.params.W); maxY = Math.max(maxY, u.y + u.params.H);
  }
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.05;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const s = Math.min(MM_W / (maxX - minX), MM_H / (maxY - minY));
  const ox = (MM_W - (maxX - minX) * s) / 2;
  const oy = (MM_H - (maxY - minY) * s) / 2;
  const m = (x, y) => [ox + (x - minX) * s, oy + (y - minY) * s];
  return {
    items: props.units.map((u) => {
      const [x, y] = m(u.x, u.y);
      return { id: u.id, x, y, w: Math.max(1, u.params.W * s), h: Math.max(1, u.params.H * s), frame: u.type === 'frame' };
    }),
    view: (() => { const [x, y] = m(view.x, view.y); return { x, y, w: view.w * s, h: view.h * s }; })(),
    toWorld: (mx, my) => [minX + (mx - ox) / s, minY + (my - oy) / s],
  };
});
function onMinimapDown(e) {
  const mm = minimap.value;
  if (!mm) return;
  const r = e.currentTarget.getBoundingClientRect();
  const [wx, wy] = mm.toWorld(e.clientX - r.left, e.clientY - r.top);
  emit('jumpTo', wx, wy);
  resetIdle();
}

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
          :paths="ICONS.canvasGrid" :active="stageGrid" tip-side="bottom" tip-align="right"
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
            <span class="rowLabel">Canvas color</span>
            <ColorField v-model="view.stageBgColor" fallback="var(--stage-bg)" grayscale />
          </div>
          <div class="menuRow">
            <span class="rowLabel">Grid color</span>
            <ColorField v-model="view.stageGridColor" fallback="var(--stage-grid)" grayscale />
          </div>
          <label class="menuRow">
            <span class="rowLabel">Grid size</span>
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
          :paths="ICONS.boxSelect" :active="bbox" tip-side="bottom" tip-align="right"
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
            <span class="rowLabel">Arrow nudge</span>
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
          :paths="ICONS.unitGrid" :active="guides" tip-side="bottom" tip-align="right"
          :tip="openMenu === 'unit' ? '' : guides ? 'Hide unit/frame grid (G)' : 'Show unit/frame grid (G)'"
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
            <span class="rowLabel">Unit min</span>
            <StepField v-model="limits.unitMin" :min="1" :max="200" :step="5" />
          </label>
          <label v-if="limits" class="menuRow">
            <span class="rowLabel">Thread min</span>
            <StepField v-model="limits.threadMinPx" :min="0" :max="50" :step="0.5" />
          </label>
          <div class="menuRow">
            <span class="rowLabel">Unit/frame grid color</span>
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
          class="zoom" tip-side="bottom" tip-align="right"
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
          <div class="menuTitle">Zoom options</div>
          <!-- §208: seam 스트로크 옵션 UI 삭제 — §200 지오메트리 픽스로 존재 이유가 거의 사라져
               보정은 내부 자동(기존 기본값·줌 곡선)으로만 유지. 완전 제거는 잔여 케이스 관찰 후. -->
          <!-- §203: 선택 도구의 프레임 우선 전환 경계 (줌 % 미만 = 프레임 우선, 0 = 끔) -->
          <label class="menuRow">
            <span class="rowLabel">Frame first below</span>
            <StepField v-model="view.framePickZoom" :min="0" :max="200" :step="5" />
          </label>
          <!-- §225: 미니맵 — 뷰포트(직사각형) 위치 파악 + 클릭 = 그 지점으로 시점 이동 -->
          <div v-if="minimap" class="sect">
            <svg class="minimap" :width="168" :height="100" @pointerdown.stop="onMinimapDown">
              <rect class="mmBg" x="0" y="0" width="168" height="100" />
              <rect
                v-for="it in minimap.items" :key="it.id"
                class="mmObj" :class="{ frame: it.frame }"
                :x="it.x" :y="it.y" :width="it.w" :height="it.h"
              />
              <rect class="mmView" :x="minimap.view.x" :y="minimap.view.y" :width="minimap.view.w" :height="minimap.view.h" />
            </svg>
            <button class="miniBtn fitBtn" @click="emit('fitAll'); resetIdle()">Fit all objects</button>
          </div>
        </div>
      </div>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.corner { position: absolute; right: var(--sp-6); top: var(--sp-6); } /* §203: 보기 그룹 = 우상단 (고급기능과 스왑) */
.zoom { width: var(--zoom-w); font-variant-numeric: tabular-nums; }
.optWrap { position: relative; }
// §202: 팝업 공통 문법은 popup-menu 믹스인 — §203: 상단 바라 메뉴는 아래로 드롭, 우측 정렬
.menu {
  @include popup-menu;
  position: absolute; top: calc(100% + var(--sp-6)); right: 0; /* §217: 갭 토큰 통일 */
}
.miniBtn {
  @include bordered-control; // §216: 버튼 타이포 단일화 — fs-xs
  padding: 0 8px; height: 21px; display: inline-flex; align-items: center; /* §217: 컨트롤 공통 높이 */
  align-self: flex-start;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
// §225: 미니맵 — 전체 오브젝트 분포 + 현재 뷰포트(액센트 직사각형)
.minimap {
  display: block; border: 1px solid var(--line); border-radius: var(--radius);
  cursor: pointer; margin-bottom: 8px;
}
.mmBg { fill: var(--stage-bg); opacity: 0.5; }
.mmObj { fill: var(--dim); opacity: 0.8; }
.mmObj.frame { fill: none; stroke: var(--faint); stroke-width: 1; }
.mmView { fill: none; stroke: var(--accent); stroke-width: 1.5; pointer-events: none; }
.fitBtn { width: 100%; justify-content: center; text-transform: capitalize; }
</style>
