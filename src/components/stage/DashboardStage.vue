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
const singleSelected = computed(
  () => props.doc.selectedIds.length === 1 && props.doc.selectedIds[0] === props.doc.activeId
);
const marquee = ref(null); // { x, y, w, h } — 화면 좌표

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
let lastClient = null; // 마지막 커서 위치 (⌘V 배치 기준)
function onStageMove(e) {
  lastClient = [e.clientX, e.clientY];
}
function pasteTarget() {
  const r = el.value.getBoundingClientRect();
  let px, py;
  if (
    lastClient &&
    lastClient[0] >= r.left && lastClient[0] <= r.right &&
    lastClient[1] >= r.top && lastClient[1] <= r.bottom
  ) {
    px = lastClient[0] - r.left;
    py = lastClient[1] - r.top;
  } else {
    px = r.width / 2;
    py = r.height / 2;
  }
  return props.viewport.toWorld(px, py);
}
function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
function onKeyDown(e) {
  if (isTyping(e)) return;
  if (e.code === 'Space' && !e.repeat) {
    spaceHeld.value = true;
    e.preventDefault();
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === 'KeyZ') {
    e.preventDefault();
    e.shiftKey ? props.actions.redo() : props.actions.undo();
    return;
  }
  if (mod && e.code === 'KeyC') {
    props.actions.copyActive();
    return;
  }
  if (mod && e.code === 'KeyV') {
    e.preventDefault();
    const [wx, wy] = pasteTarget();
    props.actions.pasteAt(wx, wy);
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && props.doc.selectedIds.length) {
    e.preventDefault();
    props.actions.deleteSelected();
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

// 스테이지 배경: 팬(휠버튼/Space) / 마퀴 선택 (4px 미만 이동이면 선택 해제 클릭)
function onStageDown(e) {
  if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
    e.preventDefault();
    beginDrag(e, { kind: 'pan', x0: vp.x, y0: vp.y });
  } else if (e.button === 0) {
    const [lx, ly] = local(e);
    beginDrag(e, { kind: 'marquee', lx, ly });
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
  e.preventDefault(); // alt+drag 시 브라우저/OS 기본 동작 차단
  if (e.shiftKey) {
    props.actions.toggleSelect(u.id); // Shift+클릭 = 멀티선택 토글 (드래그 없음)
    return;
  }
  // Option(Alt)+드래그 = 사본을 만들어 사본을 끌고 감 (원본 유지)
  let targets;
  if (e.altKey) {
    targets = [props.actions.duplicateFrom(u)];
  } else if (props.doc.selectedIds.includes(u.id) && props.doc.selectedIds.length > 1) {
    // 멀티선택 유지한 채 전체 이동
    props.doc.activeId = u.id;
    targets = props.doc.units.filter((x) => props.doc.selectedIds.includes(x.id));
  } else {
    props.actions.selectOnly(u.id);
    targets = [u];
  }
  beginDrag(e, { kind: 'move', targets: targets.map((t) => ({ u: t, x0: t.x, y0: t.y })) });
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
  if (drag.kind === 'marquee') {
    const [lx, ly] = [drag.lx + dxs, drag.ly + dys];
    marquee.value = {
      x: Math.min(drag.lx, lx), y: Math.min(drag.ly, ly),
      w: Math.abs(dxs), h: Math.abs(dys),
    };
    // 실시간 교차 판정 (월드 좌표)
    const [wx1, wy1] = props.viewport.toWorld(marquee.value.x, marquee.value.y);
    const [wx2, wy2] = props.viewport.toWorld(marquee.value.x + marquee.value.w, marquee.value.y + marquee.value.h);
    const ids = props.doc.units
      .filter((u) => u.x < wx2 && u.x + u.params.W > wx1 && u.y < wy2 && u.y + u.params.H > wy1)
      .map((u) => u.id);
    props.actions.setSelection(ids);
    return;
  }
  const dx = dxs / vp.scale; // 월드 좌표 환산 (줌 배율 보정)
  const dy = dys / vp.scale;
  if (drag.kind === 'move') {
    for (const t of drag.targets) {
      t.u.x = t.x0 + dx;
      t.u.y = t.y0 + dy;
    }
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

function onUp(e) {
  if (drag) {
    if (drag.kind === 'resize') {
      props.actions.setSize({}); // W 변경에 따른 파생 제약 정리 (거터 클램프)
    } else if (drag.kind === 'marquee') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      if (moved < 4) props.actions.deselect(); // 제자리 클릭 = 선택 해제
      marquee.value = null;
    }
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
  if (u) {
    vp.x = (r.width - u.params.W) / 2;
    vp.y = (r.height - u.params.H) / 2;
  }
});
function centerWorld() {
  const r = el.value.getBoundingClientRect();
  return props.viewport.toWorld(r.width / 2, r.height / 2);
}
defineExpose({ centerWorld });

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
    @pointermove="onStageMove"
    @contextmenu.prevent
    @dragstart.prevent
  >
    <svg class="world">
      <defs>
        <pattern
          id="stage-grid" patternUnits="userSpaceOnUse"
          :width="STAGE_GRID" :height="STAGE_GRID"
          :patternTransform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`"
        >
          <path class="gridline" :d="`M ${STAGE_GRID} 0 H 0 V ${STAGE_GRID}`" />
        </pattern>
      </defs>
      <rect class="gridbg" width="100%" height="100%" fill="url(#stage-grid)" />
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <g v-for="u in doc.units" :key="u.id" :transform="`translate(${u.x} ${u.y})`">
          <UnitGraphic
            :params="u.params"
            :show-guides="doc.selectedIds.includes(u.id) && u.id === doc.activeId && u.params.showGuides"
          />
          <rect
            class="hit"
            :width="u.params.W" :height="u.params.H"
            fill="transparent"
            @pointerdown.stop="onUnitDown(u, $event)"
          />
        </g>
        <!-- 멀티선택: 각 유닛 외곽선만 -->
        <template v-if="!singleSelected">
          <rect
            v-for="u in doc.units.filter((x) => doc.selectedIds.includes(x.id))"
            :key="'sel' + u.id"
            class="multiSel"
            :x="u.x" :y="u.y" :width="u.params.W" :height="u.params.H"
          />
        </template>
        <SelectionOverlay
          v-if="singleSelected && activeUnit"
          :unit="activeUnit"
          :scale="vp.scale"
          @resize-start="onResizeStart"
          @rotate="(d) => actions.rotate(d)"
          @flip="actions.flipActive()"
          @dup="actions.duplicateActive()"
          @del="actions.deleteSelected()"
        />
      </g>
      <rect
        v-if="marquee"
        class="marquee"
        :x="marquee.x" :y="marquee.y" :width="marquee.w" :height="marquee.h"
      />
    </svg>
    <ZoomBadge :scale="vp.scale" @reset="resetZoom" />
  </div>
</template>

<style scoped>
.stage { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--bg); user-select: none; -webkit-user-select: none; }
.stage.panning { cursor: grab; }
.world { display: block; width: 100%; height: 100%; }
.hit { cursor: default; }
.gridbg { pointer-events: none; }
.multiSel { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.marquee { fill: rgba(250, 240, 75, 0.06); stroke: var(--accent); stroke-width: 1; }
.gridline { stroke: #3f3f3f; stroke-width: 1; fill: none; vector-effect: non-scaling-stroke; }
</style>
