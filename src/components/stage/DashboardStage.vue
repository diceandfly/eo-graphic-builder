<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { UNIT_MIN, UNIT_MAX, STAGE_GRID } from '../../geometry/constants.js';
import UnitGraphic from './UnitGraphic.vue';
import SelectionOverlay from './SelectionOverlay.vue';
import ZoomBadge from './ZoomBadge.vue';

// 실픽셀 대시보드 스테이지.
// 조작: 좌클릭 = 선택/이동/리사이즈, 휠 = 팬, 핀치·⌘+휠 = 커서 중심 줌,
//       휠버튼 드래그·Space+드래그 = 팬, 빈 곳 클릭 = 선택 해제.
const props = defineProps({
  doc: Object,      // useDocument().doc
  viewport: Object, // useViewport() 반환값
  actions: Object,  // useDocument() 액션 (select/deselect/rotate/flipActive/duplicateFrom/setSize)
});

const { vp, panBy, zoomAt, resetAt } = props.viewport;
const el = ref(null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const activeUnit = computed(() => props.doc.units.find((u) => u.id === props.doc.activeId));

// ---- 드래그 상태 머신 (pan | move | resize) ----
let drag = null;

function local(e) {
  const r = el.value.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function onWheel(e) {
  e.preventDefault();
  const [px, py] = local(e);
  if (e.ctrlKey || e.metaKey) {
    zoomAt(px, py, Math.exp(-e.deltaY * 0.01)); // 핀치는 ctrlKey wheel로 들어옴
  } else {
    panBy(-e.deltaX, -e.deltaY);
  }
}

// Space 팬 모드 (입력칸 포커스 중엔 무시)
const spaceHeld = ref(false);
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
function onKeyDown(e) {
  if (e.code === 'Space' && !isTyping(e) && !e.repeat) {
    spaceHeld.value = true;
    e.preventDefault();
  }
}
function onKeyUp(e) {
  if (e.code === 'Space') spaceHeld.value = false;
}

function beginDrag(e, state) {
  drag = { ...state, sx: e.clientX, sy: e.clientY };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

// 스테이지 배경: 팬(휠버튼/Space) 또는 선택 해제
function onStageDown(e) {
  if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
    e.preventDefault();
    beginDrag(e, { kind: 'pan', x0: vp.x, y0: vp.y });
  } else if (e.button === 0) {
    props.actions.deselect();
  }
}

// 유닛: 선택 + 이동 드래그
function onUnitDown(u, e) {
  if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
    e.preventDefault();
    beginDrag(e, { kind: 'pan', x0: vp.x, y0: vp.y });
    return;
  }
  if (e.button !== 0) return;
  // Option(Alt)+드래그 = 사본을 만들어 사본을 끌고 감 (원본 유지)
  let target = u;
  if (e.altKey) target = props.actions.duplicateFrom(u);
  else props.actions.select(u.id);
  beginDrag(e, { kind: 'move', u: target, x0: target.x, y0: target.y });
}

// 리사이즈 (SelectionOverlay 핸들에서)
function onResizeStart(dir, e) {
  const u = activeUnit.value;
  const p = u.params;
  beginDrag(e, {
    kind: 'resize', dir, u,
    x0: u.x, y0: u.y, W0: p.W, H0: p.H, ratio: p.W / p.H,
  });
}

function onMove(e) {
  if (!drag) return;
  const dxs = e.clientX - drag.sx;
  const dys = e.clientY - drag.sy;
  if (drag.kind === 'pan') {
    vp.x = drag.x0 + dxs;
    vp.y = drag.y0 + dys;
    return;
  }
  const dx = dxs / vp.scale; // 월드 좌표 환산 (줌 배율 보정)
  const dy = dys / vp.scale;
  if (drag.kind === 'move') {
    drag.u.x = drag.x0 + dx;
    drag.u.y = drag.y0 + dy;
    return;
  }
  // resize: 반대편 변 고정, Shift = 비율 고정(코너)
  const { dir, u, x0, y0, W0, H0, ratio } = drag;
  const p = u.params;
  let W = W0, H = H0;
  if (dir.includes('e')) W = W0 + dx;
  if (dir.includes('w')) W = W0 - dx;
  if (dir.includes('s')) H = H0 + dy;
  if (dir.includes('n')) H = H0 - dy;
  if (e.shiftKey && dir.length === 2) {
    // 지배적 축 기준으로 비율 유지
    if (Math.abs(W - W0) * H0 > Math.abs(H - H0) * W0) H = W / ratio;
    else W = H * ratio;
  }
  W = clamp(Math.round(W), UNIT_MIN, UNIT_MAX);
  H = clamp(Math.round(H), UNIT_MIN, UNIT_MAX);
  p.W = W;
  p.H = H;
  if (dir.includes('w')) u.x = x0 + (W0 - W);
  if (dir.includes('n')) u.y = y0 + (H0 - H);
}

function onUp() {
  if (drag && drag.kind === 'resize') {
    props.actions.setSize({}); // W 변경에 따른 파생 제약 정리 (거터 클램프)
  }
  drag = null;
  window.removeEventListener('pointermove', onMove);
}

function resetZoom() {
  const r = el.value.getBoundingClientRect();
  resetAt(r.width / 2, r.height / 2);
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // 초기 뷰: 100% 줌, 첫 유닛 중앙 배치
  const r = el.value.getBoundingClientRect();
  const u = props.doc.units[0];
  vp.x = (r.width - u.params.W) / 2;
  vp.y = (r.height - u.params.H) / 2;
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('pointermove', onMove);
});
</script>

<template>
  <div
    ref="el"
    class="stage"
    :class="{ panning: spaceHeld }"
    @wheel="onWheel"
    @pointerdown="onStageDown"
    @contextmenu.prevent
  >
    <svg class="world">
      <defs>
        <pattern
          id="stage-grid" patternUnits="userSpaceOnUse"
          :width="STAGE_GRID" :height="STAGE_GRID"
          :patternTransform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`"
        >
          <path
            class="cross"
            :d="`M ${STAGE_GRID / 2 - 5} ${STAGE_GRID / 2} h 10 M ${STAGE_GRID / 2} ${STAGE_GRID / 2 - 5} v 10`"
          />
        </pattern>
      </defs>
      <rect class="gridbg" width="100%" height="100%" fill="url(#stage-grid)" />
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <g v-for="u in doc.units" :key="u.id" :transform="`translate(${u.x} ${u.y})`">
          <UnitGraphic
            :params="u.params"
            :show-guides="u.id === doc.activeId && u.params.showGuides"
          />
          <rect
            class="hit"
            :width="u.params.W" :height="u.params.H"
            fill="transparent"
            @pointerdown.stop="onUnitDown(u, $event)"
          />
        </g>
        <SelectionOverlay
          v-if="doc.selected && activeUnit"
          :unit="activeUnit"
          :scale="vp.scale"
          @resize-start="onResizeStart"
          @rotate="(d) => actions.rotate(d)"
          @flip="actions.flipActive()"
        />
      </g>
    </svg>
    <ZoomBadge :scale="vp.scale" @reset="resetZoom" />
  </div>
</template>

<style scoped>
.stage { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--bg); }
.stage.panning { cursor: grab; }
.world { display: block; width: 100%; height: 100%; }
.hit { cursor: default; }
.gridbg { pointer-events: none; }
.cross { stroke: #383838; stroke-width: 1; fill: none; vector-effect: non-scaling-stroke; }
</style>
