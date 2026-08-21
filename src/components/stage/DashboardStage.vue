<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { UNIT_MIN, UNIT_MAX, STAGE_GRID } from '../../geometry/constants.js';
import UnitGraphic from './UnitGraphic.vue';
import SelectionOverlay from './SelectionOverlay.vue';
import ZoomBadge from './ZoomBadge.vue';
import Toolbar from './Toolbar.vue';
import GroupOverlay from './GroupOverlay.vue';
import AlignBar from './AlignBar.vue';
import { readTokenMs } from '../../utils/cssToken.js';

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
// 선택에 관여한 최외곽 그룹들의 점선 아웃라인 (오프셋 6px 화면)
const groupOutlines = computed(() => {
  const gids = new Set();
  for (const u of props.doc.units) {
    if (props.doc.selectedIds.includes(u.id)) {
      const g = props.actions.outermost(u);
      if (g) gids.add(g);
    }
  }
  const off = 6 / vp.scale;
  return [...gids].map((gid) => {
    const members = props.doc.units.filter((u) => u.groups.includes(gid));
    const minX = Math.min(...members.map((u) => u.x));
    const minY = Math.min(...members.map((u) => u.y));
    return {
      x: minX - off, y: minY - off,
      w: Math.max(...members.map((u) => u.x + u.params.W)) - minX + off * 2,
      h: Math.max(...members.map((u) => u.y + u.params.H)) - minY + off * 2,
    };
  });
});
const dash = computed(() => `${5 / vp.scale} ${4 / vp.scale}`);
// 링크 그룹 표시 번호 (linkId → 1..n 순번)
const linkIndex = computed(() => {
  const ids = [...new Set(props.doc.units.filter((u) => u.linkId).map((u) => u.linkId))].sort((a, b) => a - b);
  return Object.fromEntries(ids.map((id, i) => [id, i + 1]));
});
// 현재 선택에 관련된 링크 그룹만 배지 표시
const visibleLinkIds = computed(() => {
  const set = new Set();
  for (const u of props.doc.units) {
    if (u.linkId && props.doc.selectedIds.includes(u.id)) set.add(u.linkId);
  }
  return set;
});

const keyUnit = computed(() =>
  props.doc.keyId != null && props.doc.selectedIds.includes(props.doc.keyId)
    ? props.doc.units.find((u) => u.id === props.doc.keyId)
    : null
);
const selBounds = computed(() => {
  const sel = props.doc.units.filter((u) => props.doc.selectedIds.includes(u.id));
  if (sel.length < 2) return null;
  const minX = Math.min(...sel.map((u) => u.x));
  const minY = Math.min(...sel.map((u) => u.y));
  return {
    x: minX, y: minY,
    w: Math.max(...sel.map((u) => u.x + u.params.W)) - minX,
    h: Math.max(...sel.map((u) => u.y + u.params.H)) - minY,
  };
});
const mode = ref('select'); // 'select' | 'eyedrop'
const showGuides = ref(true);    // 유닛 그리드 가이드 (선택된 유닛에만 표시)
const showStageGrid = ref(true); // 대시보드 배경 라인 그리드
const pxs = (n) => n / vp.scale;

// 토스트 (대시보드 상단)
const toastMsg = ref(null);
let toastTimer = null;
function toast(msg) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = null), readTokenMs('--toast-time', 2600));
}

// 스포이드 범주 스코프 (우클릭 메뉴)
const eyedropScope = reactive({ size: true, grid: true, shape: true, color: true });
const smartGuides = ref([]); // [{ axis: 'v'|'h', pos, from, to }] — 월드 좌표
const gapGuides = ref([]);   // [{ axis: 'x'|'y', at, segs: [[a,b],[c,d]] }] — 등간격 표시

// ---- 드래그 상태 머신 (pan | move | resize) ----
let drag = null;
let keyCandidate = null; // 멀티선택 중 재클릭 → 정렬 키 오브젝트 후보

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
  if (!t) return false;
  if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
  return t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type);
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
  if (mod && e.code === 'KeyG') {
    e.preventDefault();
    e.shiftKey ? props.actions.ungroupSelected() : props.actions.groupSelected();
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
    return;
  }
  if (!mod && e.code === 'KeyV') mode.value = 'select';
  if (!mod && e.code === 'KeyI') mode.value = 'eyedrop';
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
  if (mode.value === 'eyedrop') {
    // 스포이드: 클릭한 유닛의 파라미터를 선택된 유닛들에 흡수 후 선택툴 복귀
    props.actions.absorbFrom(u, { ...eyedropScope });
    mode.value = 'select';
    return;
  }
  const og = props.actions.outermost(u); // 최외곽 그룹 기준 선택
  const members = og ? props.actions.groupMemberIds(og) : [u.id];
  if (e.shiftKey) {
    // Shift+클릭 = 그룹 블록 단위 멀티선택 토글 (드래그 없음)
    const anySel = members.some((id) => props.doc.selectedIds.includes(id));
    if (anySel) {
      props.doc.selectedIds = props.doc.selectedIds.filter((id) => !members.includes(id));
    } else {
      props.actions.setSelection([...props.doc.selectedIds, ...members]);
      props.doc.activeId = u.id;
    }
    return;
  }
  // Option(Alt)+드래그 = 사본을 만들어 사본을 끌고 감 (원본 유지)
  let targets;
  if (e.altKey) {
    targets = [props.actions.duplicateFrom(u)];
  } else if (e.detail === 2 && og) {
    // 더블클릭 = 그룹 안 개별 유닛 선택 (피그마 방식)
    props.actions.selectOnly(u.id);
    targets = [u];
  } else if (props.doc.selectedIds.includes(u.id) && props.doc.selectedIds.length > 1) {
    // 멀티선택 유지한 채 전체 이동 — 움직임 없는 재클릭이면 키 오브젝트 지정 (onUp)
    props.doc.activeId = u.id;
    targets = props.doc.units.filter((x) => props.doc.selectedIds.includes(x.id));
    keyCandidate = u.id;
  } else {
    props.actions.setSelection(members);
    props.doc.activeId = u.id;
    targets = props.doc.units.filter((x) => members.includes(x.id));
  }
  beginDrag(e, { kind: 'move', targets: targets.map((t) => ({ u: t, x0: t.x, y0: t.y })) });
}

// 통합 바운딩박스 리사이즈 (멀티/그룹)
function onGroupResizeStart(dir, e) {
  const b = selBounds.value;
  if (!b) return;
  beginDrag(e, {
    kind: 'resizeg', dir, b0: { ...b },
    snaps: props.doc.units
      .filter((u) => props.doc.selectedIds.includes(u.id))
      .map((u) => ({ u, x0: u.x, y0: u.y, W0: u.params.W, H0: u.params.H })),
  });
}

// 회전 드래그 (코너 존): 90° 스텝 스냅
function onRotateStart(e) {
  const u = activeUnit.value;
  if (!u) return;
  const [wx, wy] = props.viewport.toWorld(...local(e));
  const cx = u.x + u.params.W / 2;
  const cy = u.y + u.params.H / 2;
  beginDrag(e, {
    kind: 'rotate', u,
    cx, cy,
    a0: Math.atan2(wy - cy, wx - cx),
    applied: 0,
  });
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
    props.actions.setSelection(props.actions.expandGroups(ids));
    return;
  }
  let dx = dxs / vp.scale; // 월드 좌표 환산 (줌 배율 보정)
  let dy = dys / vp.scale;
  if (drag.kind === 'rotate') {
    const [wx, wy] = props.viewport.toWorld(...local(e));
    const ang = Math.atan2(wy - drag.cy, wx - drag.cx);
    let deg = ((ang - drag.a0) * 180) / Math.PI;
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    const steps = Math.round(deg / 90);
    while (drag.applied !== steps) {
      const d = steps > drag.applied ? 1 : -1;
      props.actions.rotate(d);
      drag.applied += d;
    }
    return;
  }
  if (drag.kind === 'resizeg') {
    const { dir, b0, snaps } = drag;
    const symG = e.altKey ? 2 : 1; // Alt = 중심 대칭 스케일
    let W = b0.w, H = b0.h;
    if (dir.includes('e')) W = b0.w + dx * symG;
    if (dir.includes('w')) W = b0.w - dx * symG;
    if (dir.includes('s')) H = b0.h + dy * symG;
    if (dir.includes('n')) H = b0.h - dy * symG;
    // 통합 박스의 이동 엣지도 스마트 스냅
    const SNAPG = 6 / vp.scale;
    const exclude = snaps.map((t) => t.u);
    const gGuides = [];
    if (!e.shiftKey && !e.altKey) {
      if (dir.includes('e')) {
        const sn = snapEdge('x', b0.x + W, exclude, SNAPG);
        if (sn) { W += sn.d; gGuides.push(edgeGuide('x', sn, b0.y, b0.y + H)); }
      } else if (dir.includes('w')) {
        const sn = snapEdge('x', b0.x + b0.w - W, exclude, SNAPG);
        if (sn) { W = b0.x + b0.w - sn.pos; gGuides.push(edgeGuide('x', sn, b0.y, b0.y + H)); }
      }
      if (dir.includes('s')) {
        const sn = snapEdge('y', b0.y + H, exclude, SNAPG);
        if (sn) { H += sn.d; gGuides.push(edgeGuide('y', sn, b0.x, b0.x + W)); }
      } else if (dir.includes('n')) {
        const sn = snapEdge('y', b0.y + b0.h - H, exclude, SNAPG);
        if (sn) { H = b0.y + b0.h - sn.pos; gGuides.push(edgeGuide('y', sn, b0.x, b0.x + W)); }
      }
    }
    smartGuides.value = gGuides;
    W = Math.max(W, 20);
    H = Math.max(H, 20);
    let sx = dir.includes('e') || dir.includes('w') ? W / b0.w : 1;
    let sy = dir.includes('n') || dir.includes('s') ? H / b0.h : 1;
    if (e.shiftKey && dir.length === 2) {
      const s = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
      sx = s; sy = s;
    }
    // 앵커: 기본은 반대편 변, Alt면 박스 중심
    const ax = e.altKey ? b0.x + b0.w / 2 : dir.includes('w') ? b0.x + b0.w : b0.x;
    const ay = e.altKey ? b0.y + b0.h / 2 : dir.includes('n') ? b0.y + b0.h : b0.y;
    for (const t of snaps) {
      t.u.x = Math.round(ax + (t.x0 - ax) * sx);
      t.u.y = Math.round(ay + (t.y0 - ay) * sy);
      t.u.params.W = clamp(Math.round(t.W0 * sx), UNIT_MIN, UNIT_MAX);
      t.u.params.H = clamp(Math.round(t.H0 * sy), UNIT_MIN, UNIT_MAX);
    }
    return;
  }
  if (drag.kind === 'move') {
    // Shift = 수직/수평 축 고정
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // 스마트 가이드: 다른 유닛의 엣지/센터(x·y 각 3개)에 6px(화면) 반경 스냅
    const SNAP = 6 / vp.scale;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of drag.targets) {
      minX = Math.min(minX, t.x0 + dx);
      minY = Math.min(minY, t.y0 + dy);
      maxX = Math.max(maxX, t.x0 + dx + t.u.params.W);
      maxY = Math.max(maxY, t.y0 + dy + t.u.params.H);
    }
    const others = props.doc.units.filter((u) => !drag.targets.some((t) => t.u === u));
    const mineX = [minX, (minX + maxX) / 2, maxX];
    const mineY = [minY, (minY + maxY) / 2, maxY];
    let bestX = null, bestY = null;
    for (const o of others) {
      const ox = [o.x, o.x + o.params.W / 2, o.x + o.params.W];
      const oy = [o.y, o.y + o.params.H / 2, o.y + o.params.H];
      for (const c of ox) for (const m of mineX) {
        const d = c - m;
        if (Math.abs(d) < SNAP && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: c, o };
      }
      for (const c of oy) for (const m of mineY) {
        const d = c - m;
        if (Math.abs(d) < SNAP && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: c, o };
      }
    }
    // 등간격(smart gap) 스냅 — 엣지 스냅이 없는 축에서만 시도
    // 패턴 ①: 이웃 R–S의 기존 간격 g를 드래그 유닛–R 간격으로 복제 (좌/우, 상/하)
    // 패턴 ②: 두 유닛 사이 가운데 균등 배치
    const D = { minX, minY, maxX, maxY };
    let gapX = null, gapY = null;
    if (!bestX) gapX = findGapSnap('x', D, others, SNAP);
    if (!bestY) gapY = findGapSnap('y', D, others, SNAP);
    const sdx = dx + (bestX ? bestX.d : gapX ? gapX.d : 0);
    const sdy = dy + (bestY ? bestY.d : gapY ? gapY.d : 0);
    for (const t of drag.targets) {
      t.u.x = t.x0 + sdx;
      t.u.y = t.y0 + sdy;
    }
    const guides = [];
    if (bestX) {
      const o = bestX.o;
      guides.push({
        axis: 'v', pos: bestX.pos,
        from: Math.min(minY + (bestY ? bestY.d : 0), o.y),
        to: Math.max(maxY + (bestY ? bestY.d : 0), o.y + o.params.H),
      });
    }
    if (bestY) {
      const o = bestY.o;
      guides.push({
        axis: 'h', pos: bestY.pos,
        from: Math.min(minX + (bestX ? bestX.d : 0), o.x),
        to: Math.max(maxX + (bestX ? bestX.d : 0), o.x + o.params.W),
      });
    }
    smartGuides.value = guides;
    const gaps = [];
    if (gapX) gaps.push({ axis: 'x', at: (minY + maxY) / 2 + (gapY ? gapY.d : 0) + (bestY ? bestY.d : 0), segs: gapX.segs });
    if (gapY) gaps.push({ axis: 'y', at: (minX + maxX) / 2 + (gapX ? gapX.d : 0) + (bestX ? bestX.d : 0), segs: gapY.segs });
    gapGuides.value = gaps;
    return;
  }
  // resize: 반대편 변 고정(기본) / Alt = 중심 대칭 스케일 / Shift = 비율 고정(코너) / 이동 엣지 스마트 스냅
  const { dir, u, x0, y0, W0, H0, ratio } = drag;
  const p = u.params;
  const sym = e.altKey ? 2 : 1; // 중심 대칭이면 양쪽이 함께 움직여 변화량 2배
  let W = W0, H = H0;
  if (dir.includes('e')) W = W0 + dx * sym;
  if (dir.includes('w')) W = W0 - dx * sym;
  if (dir.includes('s')) H = H0 + dy * sym;
  if (dir.includes('n')) H = H0 - dy * sym;
  if (e.shiftKey && dir.length === 2) {
    // 지배적 축 기준으로 비율 유지
    if (Math.abs(W - W0) * H0 > Math.abs(H - H0) * W0) H = W / ratio;
    else W = H * ratio;
  }
  const SNAP = 6 / vp.scale;
  const rGuides = [];
  if (!e.shiftKey && !e.altKey) {
    if (dir.includes('e')) {
      const sn = snapEdge('x', x0 + W, [u], SNAP);
      if (sn) { W += sn.d; rGuides.push(edgeGuide('x', sn, y0, y0 + H)); }
    } else if (dir.includes('w')) {
      const sn = snapEdge('x', x0 + (W0 - W), [u], SNAP);
      if (sn) { W = x0 + W0 - sn.pos; rGuides.push(edgeGuide('x', sn, y0, y0 + H)); }
    }
    if (dir.includes('s')) {
      const sn = snapEdge('y', y0 + H, [u], SNAP);
      if (sn) { H += sn.d; rGuides.push(edgeGuide('y', sn, x0, x0 + W)); }
    } else if (dir.includes('n')) {
      const sn = snapEdge('y', y0 + (H0 - H), [u], SNAP);
      if (sn) { H = y0 + H0 - sn.pos; rGuides.push(edgeGuide('y', sn, x0, x0 + W)); }
    }
  }
  smartGuides.value = rGuides;
  W = clamp(Math.round(W), UNIT_MIN, UNIT_MAX);
  H = clamp(Math.round(H), UNIT_MIN, UNIT_MAX);
  p.W = W;
  p.H = H;
  if (e.altKey) {
    // 중심 고정: 변화량을 양쪽으로 분배
    u.x = x0 + (W0 - W) / 2;
    u.y = y0 + (H0 - H) / 2;
  } else {
    if (dir.includes('w')) u.x = x0 + (W0 - W);
    if (dir.includes('n')) u.y = y0 + (H0 - H);
  }
}

// 리사이즈 중 이동하는 엣지를 다른 유닛의 엣지/센터에 스냅
function snapEdge(axis, pos, excludeUnits, SNAP) {
  let best = null;
  for (const o of props.doc.units) {
    if (excludeUnits.includes(o)) continue;
    const cands =
      axis === 'x'
        ? [o.x, o.x + o.params.W / 2, o.x + o.params.W]
        : [o.y, o.y + o.params.H / 2, o.y + o.params.H];
    for (const c of cands) {
      const d = c - pos;
      if (Math.abs(d) < SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, pos: c, o };
    }
  }
  return best;
}
function edgeGuide(axis, snap, boxMin, boxMax) {
  const o = snap.o;
  if (axis === 'x') {
    return {
      axis: 'v', pos: snap.pos,
      from: Math.min(boxMin, o.y),
      to: Math.max(boxMax, o.y + o.params.H),
    };
  }
  return {
    axis: 'h', pos: snap.pos,
    from: Math.min(boxMin, o.x),
    to: Math.max(boxMax, o.x + o.params.W),
  };
}

// 등간격 스냅 탐색. axis='x'면 가로 간격 (y는 좌표 스왑으로 재사용)
function findGapSnap(axis, D, others, SNAP) {
  const lo = (u) => (axis === 'x' ? u.x : u.y);
  const hi = (u) => (axis === 'x' ? u.x + u.params.W : u.y + u.params.H);
  const clo = (u) => (axis === 'x' ? u.y : u.x);
  const chi = (u) => (axis === 'x' ? u.y + u.params.H : u.x + u.params.W);
  const dLo = axis === 'x' ? D.minX : D.minY;
  const dHi = axis === 'x' ? D.maxX : D.maxY;
  const dcLo = axis === 'x' ? D.minY : D.minX;
  const dcHi = axis === 'x' ? D.maxY : D.maxX;
  const size = dHi - dLo;

  // 드래그 유닛과 교차축으로 겹치는 이웃만
  const cands = others.filter((o) => clo(o) < dcHi && chi(o) > dcLo);
  let best = null;
  const consider = (d, segs) => {
    if (Math.abs(d) < SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, segs };
  };
  for (const R of cands) {
    for (const S of cands) {
      if (S === R) continue;
      // 서로도 교차축 겹침이 있는 쌍만 (정렬된 행/열로 인식)
      if (!(clo(R) < chi(S) && chi(R) > clo(S))) continue;
      const g = lo(R) - hi(S); // S 왼(위), R 오른(아래)
      if (g <= 0) continue;
      // ① D를 R의 뒤에 g 간격으로
      consider(hi(R) + g - dLo, [[hi(S), lo(R)], [hi(R), hi(R) + g]]);
      // ① D를 S의 앞에 g 간격으로
      consider(lo(S) - g - dHi, [[lo(S) - g, lo(S)], [hi(S), lo(R)]]);
      // ② S–R 사이 가운데 균등 배치 (사이 공간이 충분할 때)
      const inner = lo(R) - hi(S);
      if (inner > size) {
        const t = hi(S) + (inner - size) / 2;
        consider(t - dLo, [[hi(S), t], [t + size, lo(R)]]);
      }
    }
  }
  return best;
}

function onUp(e) {
  if (drag) {
    if (drag.kind === 'move' && keyCandidate != null) {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      if (moved < 4) props.doc.keyId = keyCandidate;
    }
    if (drag.kind === 'resize') {
      props.actions.setSize({}); // W 변경에 따른 파생 제약 정리 (거터 클램프)
    } else if (drag.kind === 'resizeg') {
      props.actions.normalizeSelected();
    } else if (drag.kind === 'marquee') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      if (moved < 4) props.actions.deselect(); // 제자리 클릭 = 선택 해제
      marquee.value = null;
    }
  }
  drag = null;
  keyCandidate = null;
  smartGuides.value = [];
  gapGuides.value = [];
  window.removeEventListener('pointermove', onMove);
}

function resetZoom() {
  const r = el.value.getBoundingClientRect();
  resetAt(r.width / 2, r.height / 2);
}

function centerFirstUnit() {
  const r = el.value.getBoundingClientRect();
  const u = props.doc.units[0];
  vp.scale = 1;
  if (u) {
    vp.x = (r.width - u.params.W) / 2;
    vp.y = (r.height - u.params.H) / 2;
  }
}
function onReset() {
  props.actions.resetDoc();
  centerFirstUnit();
  toast('Dashboard reset');
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // 초기 뷰: 100% 줌, 첫 유닛 중앙 배치
  if (!props.viewport.restored) centerFirstUnit();
});
function centerWorld() {
  const r = el.value.getBoundingClientRect();
  return props.viewport.toWorld(r.width / 2, r.height / 2);
}
defineExpose({ centerWorld, toast });

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
    :class="{ panning: spaceHeld, eyedrop: mode === 'eyedrop' }"
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
      <rect v-if="showStageGrid" class="gridbg" width="100%" height="100%" fill="url(#stage-grid)" />
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <g v-for="u in doc.units" :key="u.id" :transform="`translate(${u.x} ${u.y})`">
          <UnitGraphic
            :params="u.params"
            :show-guides="showGuides && doc.selectedIds.includes(u.id)"
            :seam-width="Math.max(0, 1.2 - vp.scale)"
          />
          <rect
            class="hit"
            :width="u.params.W" :height="u.params.H"
            fill="transparent"
            @pointerdown.stop="onUnitDown(u, $event)"
          />
        </g>
        <!-- 그룹 표시: 점선 아웃라인 (선택 시) -->
        <rect
          v-for="(g, i) in groupOutlines" :key="'go' + i"
          class="groupLine"
          :x="g.x" :y="g.y" :width="g.w" :height="g.h"
          :stroke-dasharray="dash"
        />
        <!-- 링크 배지 (선택 관련 링크만) -->
        <g
          v-for="u in doc.units.filter((x) => x.linkId && visibleLinkIds.has(x.linkId))"
          :key="'lk' + u.id"
          class="linkBadge"
          :transform="`translate(${u.x + u.params.W} ${u.y})`"
        >
          <text :x="-pxs(20)" :y="-pxs(9)" :font-size="pxs(12)" text-anchor="end">{{ linkIndex[u.linkId] }}</text>
          <g :transform="`translate(${-pxs(16)} ${-pxs(19)}) scale(${pxs(13) / 24})`">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </g>
        </g>
        <!-- 정렬 키 오브젝트: 두꺼운 스트로크 하이라이트 -->
        <rect
          v-if="keyUnit"
          class="keySel"
          :x="keyUnit.x" :y="keyUnit.y"
          :width="keyUnit.params.W" :height="keyUnit.params.H"
        />
        <!-- 멀티선택/그룹: 통합 바운딩 박스 + 리사이즈 핸들 -->
        <GroupOverlay
          v-if="selBounds"
          :bounds="selBounds"
          :scale="vp.scale"
          @resize-start="onGroupResizeStart"
        />
        <SelectionOverlay
          v-if="singleSelected && activeUnit"
          :unit="activeUnit"
          :scale="vp.scale"
          @resize-start="onResizeStart"
          @rotate-start="onRotateStart"
          @flip="actions.flipUnit()"
          @flipv="actions.flipUnitV()"
          @dup="actions.duplicateActive()"
          @del="actions.deleteSelected()"
        />
        <template v-for="(g, gi) in gapGuides" :key="'gap' + gi">
          <template v-for="(seg, si) in g.segs" :key="si">
            <text
              v-if="g.axis === 'x'"
              class="gaptext"
              :x="(seg[0] + seg[1]) / 2" :y="g.at - pxs(7)"
              :font-size="pxs(10)" text-anchor="middle"
            >{{ Math.round(seg[1] - seg[0]) }}</text>
            <text
              v-else
              class="gaptext"
              :x="g.at + pxs(9)" :y="(seg[0] + seg[1]) / 2 + pxs(3)"
              :font-size="pxs(10)"
            >{{ Math.round(seg[1] - seg[0]) }}</text>
            <line
              v-if="g.axis === 'x'"
              class="gapline" :x1="seg[0]" :y1="g.at" :x2="seg[1]" :y2="g.at"
            />
            <line
              v-if="g.axis === 'x'"
              class="gapline" :x1="seg[0]" :y1="g.at - pxs(4)" :x2="seg[0]" :y2="g.at + pxs(4)"
            />
            <line
              v-if="g.axis === 'x'"
              class="gapline" :x1="seg[1]" :y1="g.at - pxs(4)" :x2="seg[1]" :y2="g.at + pxs(4)"
            />
            <line
              v-if="g.axis === 'y'"
              class="gapline" :x1="g.at" :y1="seg[0]" :x2="g.at" :y2="seg[1]"
            />
            <line
              v-if="g.axis === 'y'"
              class="gapline" :x1="g.at - pxs(4)" :y1="seg[0]" :x2="g.at + pxs(4)" :y2="seg[0]"
            />
            <line
              v-if="g.axis === 'y'"
              class="gapline" :x1="g.at - pxs(4)" :y1="seg[1]" :x2="g.at + pxs(4)" :y2="seg[1]"
            />
          </template>
        </template>
        <template v-for="(g, i) in smartGuides" :key="'sg' + i">
          <line
            v-if="g.axis === 'v'"
            class="smartguide" :x1="g.pos" :y1="g.from" :x2="g.pos" :y2="g.to"
          />
          <line
            v-else
            class="smartguide" :x1="g.from" :y1="g.pos" :x2="g.to" :y2="g.pos"
          />
        </template>
      </g>
      <rect
        v-if="marquee"
        class="marquee"
        :x="marquee.x" :y="marquee.y" :width="marquee.w" :height="marquee.h"
      />
    </svg>
    <Toolbar
      v-model:mode="mode"
      :fill="activeUnit?.params.fill"
      :scope="eyedropScope"
      @fill="(c) => actions.setFill(c)"
      @export="actions.exportSvg()"
      @save="actions.saveProject()"
      @open="(f) => actions.openProject(f)"
      @reset="onReset"
    />
    <AlignBar :active="doc.selectedIds.length >= 2" @align="(t) => actions.alignSelected(t)" />
    <ZoomBadge
      :scale="vp.scale"
      :guides="showGuides"
      :stage-grid="showStageGrid"
      @reset="resetZoom"
      @toggle-guides="showGuides = !showGuides"
      @toggle-stage-grid="showStageGrid = !showStageGrid"
    />
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<style scoped lang="scss">
.stage { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--bg); user-select: none; -webkit-user-select: none; }
.stage.panning { cursor: grab; }
.world { display: block; width: 100%; height: 100%; }
.hit { cursor: default; }
.gridbg { pointer-events: none; }
.multiSel { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.groupLine { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.7; }
.keySel { fill: none; stroke: var(--accent); stroke-width: 5; vector-effect: non-scaling-stroke; opacity: 0.9; }
.linkBadge path {
  fill: none; stroke: var(--link); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.linkBadge text { fill: var(--link); font-family: inherit; font-weight: 600; }
.toast {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); padding: 7px 14px; pointer-events: none;
  border-radius: var(--radius);
}
.marquee { fill: var(--accent-alpha); stroke: var(--accent); stroke-width: 1; }
.smartguide { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gapline { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gaptext { fill: var(--guide); font-family: inherit; user-select: none; }
.stage.eyedrop, .stage.eyedrop .hit { cursor: crosshair; }
.gridline { stroke: var(--stage-grid); stroke-width: 1; fill: none; vector-effect: non-scaling-stroke; }
</style>
