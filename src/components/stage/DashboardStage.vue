<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { LIMITS, UNIT_MAX, STAGE_GRID, BRAND_COLORS } from '../../geometry/constants.js';
import UnitGraphic from './UnitGraphic.vue';
import SelectionOverlay from './SelectionOverlay.vue';
import ZoomBadge from './ZoomBadge.vue';
import Toolbar from './Toolbar.vue';
import FileBar from './FileBar.vue';
import RectGraphic from './RectGraphic.vue';
import GroupOverlay from './GroupOverlay.vue';
import AlignBar from './AlignBar.vue';
import ResourceMonitor from './ResourceMonitor.vue';
import { readTokenMs } from '../../utils/cssToken.js';
import { ICONS } from '../../ui/icons.js';
import { rectGridLines } from '../../geometry/rectGrid.js';
import { layerOf, isPresetable } from '../../objects/registry.js';

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
// 렌더 z-오더: 레지스트리 layer 오름차순 (사각형 0 < 유닛 1), 타입 내에서는 배열 순서
const zOrdered = computed(() =>
  [...props.doc.units].sort((a, b) => layerOf(a) - layerOf(b))
);
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
// 현재 선택에 관련된 링크 그룹만 배지 표시
const visibleLinkIds = computed(() => {
  const set = new Set();
  for (const u of props.doc.units) {
    if (u.linkId && props.doc.selectedIds.includes(u.id)) set.add(u.linkId);
  }
  return set;
});
// 링크 번호는 전역 누적이 아니라 "지금 보이는 링크들" 안에서 1..k로 그때그때 부여.
// 링크가 하나뿐이면 숫자 없이 아이콘만 (§60).
const linkIndex = computed(() => {
  const ids = [...visibleLinkIds.value].sort((a, b) => a - b);
  return Object.fromEntries(ids.map((id, i) => [id, i + 1]));
});
const showLinkNums = computed(() => visibleLinkIds.value.size >= 2);

const keyUnit = computed(() =>
  props.doc.keyId != null && props.doc.selectedIds.includes(props.doc.keyId)
    ? props.doc.units.find((u) => u.id === props.doc.keyId)
    : null
);
// 정렬바 활성: 블록(최외곽 그룹 = 1블록) 2개 이상일 때만 — 그룹 하나만 선택 시 비활성
const alignActive = computed(() => {
  const ids = props.doc.selectedIds;
  if (ids.length < 2) return false;
  const blocks = new Set();
  for (const u of props.doc.units) {
    if (ids.includes(u.id)) {
      const g = props.actions.outermost(u);
      blocks.add(g ? 'g' + g : 'u' + u.id);
    }
  }
  return blocks.size >= 2;
});
// 키 하이라이트 박스 = 키 유닛이 속한 블록(최외곽 그룹) 전체 bbox — 정렬 계산 기준과 동일 (§77)
// 정렬 불가 상태(블록 1개 = 그룹 하나만 선택)에서는 표시하지 않음
const keyRect = computed(() => {
  const u = keyUnit.value;
  if (!u || !alignActive.value) return null;
  const g = props.actions.outermost(u);
  const memberIds = g ? props.actions.groupMemberIds(g) : [u.id];
  const members = props.doc.units.filter((x) => memberIds.includes(x.id));
  const minX = Math.min(...members.map((m) => m.x));
  const minY = Math.min(...members.map((m) => m.y));
  return {
    x: minX, y: minY,
    w: Math.max(...members.map((m) => m.x + m.params.W)) - minX,
    h: Math.max(...members.map((m) => m.y + m.params.H)) - minY,
  };
});
// 선택이 하나의 최외곽 그룹 전체일 때 그 그룹 이름 (통합 bbox 라벨)
const groupLabel = computed(() => {
  const ids = props.doc.selectedIds;
  if (ids.length < 2) return null;
  const units = props.doc.units.filter((u) => ids.includes(u.id));
  const gids = [...new Set(units.map((u) => props.actions.outermost(u)))];
  if (gids.length !== 1 || gids[0] == null) return null;
  const gid = gids[0];
  if (props.actions.groupMemberIds(gid).length !== ids.length) return null;
  return props.doc.groupNames[gid] ?? `Group-${gid}`;
});
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
const mode = ref('select'); // 'select' | 'eyedrop' | 'rect'
const rectPreview = ref(null); // 직사각형 드래그 생성 미리보기 (월드 좌표)
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

// 뷰 설정 영속 (localStorage 'eo.prefs') — 브라우저 팬은 재시작 시 초기화될 수 있음
const PREFS_KEY = 'eo.prefs';
let prefs;
try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { prefs = {}; }
// 스포이드 범주 스코프 (우클릭 메뉴)
const eyedropScope = reactive({ size: true, orientation: true, grid: true, shape: true, color: true, ...(prefs.eyedropScope || {}) });
// 캔버스 그리드 설정 (그리드 버튼 우클릭 메뉴): 정방형 간격 + 이동 그리드 스냅
const gridCfg = reactive({ size: STAGE_GRID, snap: false, ...(prefs.grid || {}) });
const showBBox = ref(true); // 바운딩박스(선택 오버레이) 표시 토글
// 뷰 옵션 (코너 바 우클릭 메뉴): 방향키 이동 px · 링크 배지 표시 · 유닛 그리드 색 · 캔버스 격자/배경 색 (§85)
const view = reactive({
  nudge: 5, showLinks: true, showGroups: true, guideColor: null,
  stageGridColor: null, stageBgColor: null,
  seamOn: true, seamCutoff: 40, // seam 스트로크 보정: 줌 < cutoff% 에서만 (§86)
  resMon: false, // 리소스 모니터 표시 (§86)
  ...(prefs.view || {}),
});
// seam 보정 폭 (화면 px): 토글 + 컷오프 줌 이상에서 0
const seamW = computed(() =>
  view.seamOn && vp.scale < view.seamCutoff / 100 ? Math.max(0, 1.2 - vp.scale) : 0
);
// 블렌드 설정 (툴 버튼 우클릭 메뉴에서 편집, 좌클릭/B로 즉시 적용)
const blendCfg = reactive({ axis: 'h', count: 4, gap: 20, scale: 0.5, ...(prefs.blend || {}) });
// 그리드 배열 설정 (툴 버튼 우클릭 메뉴, 좌클릭/G로 즉시 적용). columns 0 = 자동
const arrangeCfg = reactive({ gap: 40, columns: 0, ...(prefs.arrange || {}) });
// 현재 컬러 — 선택 없을 때 스와치로 지정, 그리기 툴 기본값
const currentColor = ref(prefs.currentColor || null);
// 커스텀 컬러 (7번 스와치) — 우클릭 픽커로 편집
const customColor = ref(prefs.customColor || '#3b3b3b');
// 최근 사용 커스텀 컬러 (픽커 팝업 하단 슬롯, 팝업 닫힐 때 자동 저장 — §85)
const recentColors = ref(Array.isArray(prefs.recentColors) ? prefs.recentColors : []);
function commitRecentColor(c) {
  if (!c) return;
  const arr = [c, ...recentColors.value.filter((x) => x !== c)].slice(0, 6);
  recentColors.value = arr;
}
// 사각형 더블클릭 즉시 생성 크기 (사각 툴 우클릭 메뉴에서 편집 — §85)
const rectQuickCfg = reactive({ w: 1920, h: 800, ...(prefs.rectQuick || {}) });
// 프로젝트 JSON 저장/열기 범위 3분류 (§88) — 카메라는 토글 없이 항상 저장·복원.
// work = 캔버스 데이터 / tools = 도구 커스터마이즈 / viewport = 그리드·렌더 옵션
const pickScope = (src) => ({
  work: src?.work ?? true, tools: src?.tools ?? false, viewport: src?.viewport ?? false,
});
const saveScope = reactive(pickScope(prefs.saveScope));
const openScope = reactive({ ...pickScope(prefs.openScope), tools: prefs.openScope?.tools ?? true, viewport: prefs.openScope?.viewport ?? true });
// 지오메트리 하한 (유닛 그리드 버튼 우클릭 메뉴 — §87). LIMITS(플레인)로 흘려보내고
// 변경 시 params 객체 교체로 파생 캐시를 무효화해 즉시 재렌더.
const limitsCfg = reactive({
  unitMin: LIMITS.unitMin, threadMinRatio: LIMITS.threadMinRatio, ...(prefs.limits || {}),
});
LIMITS.unitMin = limitsCfg.unitMin;
LIMITS.threadMinRatio = limitsCfg.threadMinRatio;
// thread min px 환산 기준: 선택(활성) 유닛의 W, rect·무선택이면 기본 유닛 960 (§89)
const threadRefW = computed(() => {
  const u = activeUnit.value;
  return u && u.type !== 'rect' ? u.params.W : 960;
});
watch(limitsCfg, () => {
  LIMITS.unitMin = limitsCfg.unitMin;
  LIMITS.threadMinRatio = limitsCfg.threadMinRatio;
  props.actions.withGeomOp(() => {
    for (const u of props.doc.units) u.params = { ...u.params };
  });
});
watch(
  () => JSON.stringify({
    eyedropScope, grid: gridCfg, view, blend: blendCfg, arrange: arrangeCfg,
    currentColor: currentColor.value, customColor: customColor.value,
    recentColors: recentColors.value, rectQuick: rectQuickCfg,
    saveScope, openScope, limits: limitsCfg,
  }),
  (s) => localStorage.setItem(PREFS_KEY, s)
);
const smartGuides = ref([]); // [{ axis: 'v'|'h', pos, from, to }] — 월드 좌표
const gapGuides = ref([]);   // [{ axis: 'x'|'y', at, segs: [[a,b],[c,d]] }] — 등간격 표시

// 유닛 우클릭 컨텍스트 메뉴 — 프리셋 등록류 (저빈도·명명형 작업 전용 표면)
const ctxMenu = ref(null); // { x, y, u } — 스테이지 로컬 px
function onUnitContext(u, e) {
  // 좌클릭과 동일한 선택 동작: 미선택 유닛이면 최외곽 그룹 기준으로 선택 (기존 선택 안이면 유지)
  if (!props.doc.selectedIds.includes(u.id)) {
    const og = props.actions.outermost(u);
    props.actions.setSelection(og ? props.actions.groupMemberIds(og) : [u.id]);
    props.doc.activeId = u.id;
  }
  const [lx, ly] = local(e);
  ctxMenu.value = { x: lx, y: ly, u };
}
function closeCtx() {
  ctxMenu.value = null;
}
watch(ctxMenu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeCtx, { once: true }), 0);
});
// 유닛 프리셋 등록 가능 조건: 단일 선택 + 프리셋 가능 타입 — 아니면 메뉴 항목 비활성 (§70)
const canRegisterPreset = computed(
  () =>
    !!ctxMenu.value &&
    props.doc.selectedIds.length === 1 &&
    isPresetable(ctxMenu.value.u)
);
function onRegisterPreset() {
  if (!canRegisterPreset.value) return;
  const p = props.actions.registerPreset(ctxMenu.value.u);
  toast(`Registered "${p.name}" — browse presets when nothing is selected`);
  closeCtx();
}
// 직전 행동 반복 (⇧D §74) — 반복 가능한 조작이 실행될 때마다 등록
let lastAction = null; // { label, run }
function setLast(label, run) {
  lastAction = { label, run };
}
function repeatLast() {
  if (!lastAction) {
    toast('Nothing to repeat yet');
    return;
  }
  lastAction.run();
  toast(`Repeated: ${lastAction.label}`);
}
function doFlip(axis) {
  props.actions.flipSelected(axis);
  setLast(axis === 'h' ? 'flip horizontal' : 'flip vertical', () => props.actions.flipSelected(axis));
}
function doOrder(where) {
  props.actions.orderSelected(where);
  setLast(where === 'front' ? 'bring to top' : 'send to back', () => props.actions.orderSelected(where));
}

// 컨텍스트 메뉴: 오더 그룹 + 액션 그룹(오버레이 버튼의 대체 표면 §59)
const CTX_ORDER = [
  { key: 'front', label: 'Bring to top (Q)' },
  { key: 'back', label: 'Send to back (W)' },
];
const CTX_ACTIONS = [
  { key: 'flip', label: 'Flip horizontal (⇧H)' },
  { key: 'flipv', label: 'Flip vertical (⇧V)' },
  { key: 'del', label: 'Delete (D)' },
];
function onCtxAction(key) {
  if (key === 'front' || key === 'back') doOrder(key);
  else if (key === 'flip') doFlip('h');
  else if (key === 'flipv') doFlip('v');
  else if (key === 'del') props.actions.deleteSelected();
  closeCtx();
}

// 시스템 클립보드 복사 (컨텍스트 메뉴 Export 그룹 + ⌘C/⌘⇧C)
async function onCopySvg() {
  try {
    if (await props.actions.copySelectionSvg()) toast('Copied as SVG — paste into Figma etc.');
  } catch {
    toast('SVG copy failed (clipboard blocked?)');
  }
}
async function onCopyPng() {
  try {
    if (await props.actions.copySelectionPng()) toast('Copied as PNG (2x)');
  } catch {
    toast('PNG copy failed (clipboard blocked?)');
  }
}

// 블렌드 적용 (툴 버튼 좌클릭 / B 단축키) — 현재 blendCfg로 즉시 실행.
// 단일 유닛 = 유닛 블렌드, 단일 그룹(전체 선택) = 그룹 블렌드, 그 외 멀티 선택 = 경고 (§80)
function onBlend() {
  const ids = props.doc.selectedIds;
  const sel = props.doc.units.filter((u) => ids.includes(u.id));
  if (!sel.length) {
    toast('Select a single unit or a single group to blend');
    return;
  }
  let created;
  if (sel.length === 1) {
    created = props.actions.blendFrom(sel[0], { ...blendCfg });
  } else {
    const gids = [...new Set(sel.map((u) => props.actions.outermost(u)))];
    const singleGroup = gids.length === 1 && gids[0] != null &&
      props.actions.groupMemberIds(gids[0]).length === ids.length;
    if (!singleGroup) {
      toast('Blend works on a single unit or a single group — not a mixed selection');
      return;
    }
    created = props.actions.blendUnitsFrom(sel, { ...blendCfg });
  }
  toast(`Blended ${created.length} ${blendCfg.axis === 'v' ? 'vertical' : 'horizontal'} copies — grouped`);
  setLast('blend', () => onBlend());
}

// 그리드 배열 적용 (툴 버튼 좌클릭 / G 단축키)
function onArrange() {
  const n = props.actions.arrangeGrid({ ...arrangeCfg });
  if (!n) {
    toast('Select 2+ items to arrange');
    return;
  }
  toast(`Arranged ${n} blocks into a grid`);
  setLast('grid arrange', () => onArrange());
}

// 직사각형 즉시 생성 (툴 버튼 더블클릭): rectQuickCfg 크기, 스테이지 중앙 (§85)
function onRectQuick() {
  const r = el.value.getBoundingClientRect();
  const [cx, cy] = props.viewport.toWorld(r.width / 2, r.height / 2);
  const { w, h } = rectQuickCfg;
  props.actions.createRect(cx - w / 2, cy - h / 2, w, h, currentColor.value || null);
  mode.value = 'select';
}

// 스와치/숫자키 컬러: 선택이 있으면 적용, 없으면 현재 컬러만 지정 (그리기 툴 기본값)
let recentTimer = null;
function onFill(c) {
  currentColor.value = c;
  if (props.doc.selectedIds.length) {
    props.actions.setFill(c);
    setLast(`apply ${c}`, () => props.actions.setFill(c));
    // 오브젝트에 실제 적용된 비 브랜드 컬러만 최근 슬롯에 저장 (§86)
    // 픽커 드래그 중 연속 적용은 디바운스로 최종색만 남김
    if (!BRAND_COLORS.includes(c)) {
      clearTimeout(recentTimer);
      recentTimer = setTimeout(() => commitRecentColor(c), 500);
    }
  }
}

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
    e.preventDefault();
    if (e.shiftKey) {
      onCopyPng(); // ⌘⇧C = 시스템 클립보드에 PNG(2x)
    } else {
      props.actions.copyActive(); // 내부 클립보드 (앱 내 ⌘V)
      onCopySvg(); // + 시스템 클립보드에 SVG 텍스트 (외부 툴 붙여넣기)
    }
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
  // D = 삭제 (Delete/Backspace와 동일)
  if (!mod && !e.shiftKey && e.code === 'KeyD' && props.doc.selectedIds.length) {
    e.preventDefault();
    props.actions.deleteSelected();
    return;
  }
  // Shift+D = 직전 행동 반복 (§74)
  if (!mod && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    repeatLast();
    return;
  }
  // Shift+H / Shift+V = 화면축 좌우/상하 반전 (선택 대상 전체)
  if (!mod && e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV') && props.doc.selectedIds.length) {
    e.preventDefault();
    doFlip(e.code === 'KeyH' ? 'h' : 'v');
    return;
  }
  // Shift+E = Export SVG file (선택 필요 — 컨텍스트 메뉴와 동일 경로)
  if (!mod && e.shiftKey && e.code === 'KeyE' && props.doc.selectedIds.length) {
    e.preventDefault();
    props.actions.exportSvg();
    return;
  }
  // 1~6 = 브랜드 컬러 (6 = BLACK, §82), 7 = 커스텀 컬러 (선택 있으면 적용, 없으면 현재 컬러 지정)
  const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 };
  if (!mod && !e.shiftKey && DIGITS[e.code] != null) {
    onFill(BRAND_COLORS[DIGITS[e.code]]);
    return;
  }
  if (!mod && !e.shiftKey && e.code === 'Digit7') {
    onFill(customColor.value);
    return;
  }
  // 방향키: 선택 유닛 view.nudge px 이동, Shift = 10배
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (ARROWS[e.key] && props.doc.selectedIds.length) {
    e.preventDefault();
    const step = e.shiftKey ? view.nudge * 10 : view.nudge;
    const [ax, ay] = ARROWS[e.key];
    props.actions.nudgeSelected(ax * step, ay * step);
    setLast(`nudge ${ax * step || ''}${ax ? 'px x' : ''}${ay * step || ''}${ay ? 'px y' : ''}`.trim(),
      () => props.actions.nudgeSelected(ax * step, ay * step));
    return;
  }
  if (!mod && !e.shiftKey && e.code === 'KeyV') mode.value = 'select';
  if (!mod && !e.shiftKey && e.code === 'KeyI') mode.value = 'eyedrop';
  if (!mod && !e.shiftKey && e.code === 'KeyR') mode.value = 'rect';
  if (!mod && !e.shiftKey && e.code === 'KeyB') onBlend();
  if (!mod && !e.shiftKey && e.code === 'KeyG') onArrange();
  if (!mod && !e.shiftKey && e.code === 'KeyQ' && props.doc.selectedIds.length) doOrder('front');
  if (!mod && !e.shiftKey && e.code === 'KeyW' && props.doc.selectedIds.length) doOrder('back');
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
  } else if (e.button === 0 && mode.value === 'rect') {
    const [wx, wy] = props.viewport.toWorld(...local(e));
    beginDrag(e, { kind: 'rectdraw', wx, wy });
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
  if (mode.value === 'rect') {
    // 그리기 모드: 유닛 위에서도 새 직사각형 드래그 시작
    const [wx, wy] = props.viewport.toWorld(...local(e));
    beginDrag(e, { kind: 'rectdraw', wx, wy });
    return;
  }
  if (mode.value === 'eyedrop') {
    // 스포이드: 클릭한 유닛의 파라미터를 선택된 유닛들에 흡수 후 선택툴 복귀
    props.actions.absorbFrom(u, { ...eyedropScope });
    mode.value = 'select';
    return;
  }
  // ⇧⌘+클릭 = 딥 셀렉트 멀티 토글 (그룹 계층 무시하고 개별 유닛을 선택에 추가/제거)
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
    props.actions.toggleSelect(u.id);
    return;
  }
  // ⌘(또는 Ctrl)+클릭 = 그룹 계층 무시하고 해당 유닛을 바로 선택 (딥 셀렉트)
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
    props.actions.selectOnly(u.id);
    beginDrag(e, { kind: 'move', targets: [{ u, x0: u.x, y0: u.y }] });
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
    // Alt+드래그 복제 대상: 멀티선택 안이면 선택 전체, 그룹 멤버면 그룹 전체(미선택이어도), 아니면 단일
    const inMulti = props.doc.selectedIds.includes(u.id) && props.doc.selectedIds.length > 1;
    const srcIds = inMulti ? props.doc.selectedIds : members;
    targets =
      srcIds.length > 1
        ? props.actions.duplicateUnits(props.doc.units.filter((x) => srcIds.includes(x.id)))
        : [props.actions.duplicateFrom(u)];
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
  beginDrag(e, {
    kind: 'move',
    targets: targets.map((t) => ({ u: t, x0: t.x, y0: t.y })),
    altDup: !!e.altKey, // 복제 드래그 — 종료 시 "같은 간격 복제" 반복 등록 (§74)
  });
}

function onAlign(t) {
  if (t === 'disth') props.actions.distributeSelected('h');
  else if (t === 'distv') props.actions.distributeSelected('v');
  else props.actions.alignSelected(t);
}

// 통합 바운딩박스 액션 버튼 — 선택 전체 대상
function onGroupAction(key) {
  if (key === 'flip') props.actions.flipSelected('h');
  else if (key === 'flipv') props.actions.flipSelected('v');
  else if (key === 'dup') props.actions.duplicateSelectedOffset();
  else if (key === 'del') props.actions.deleteSelected();
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

// 회전 드래그 (코너 존): 90° 스텝 스냅. group=true면 선택 전체를 한 덩어리로 회전
function onRotateStart(e, group = false) {
  const [wx, wy] = props.viewport.toWorld(...local(e));
  let cx, cy;
  if (group) {
    const b = selBounds.value;
    if (!b) return;
    cx = b.x + b.w / 2;
    cy = b.y + b.h / 2;
  } else {
    const u = activeUnit.value;
    if (!u) return;
    cx = u.x + u.params.W / 2;
    cy = u.y + u.params.H / 2;
  }
  beginDrag(e, {
    kind: 'rotate', group,
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
  if (drag.kind === 'rectdraw') {
    const [wx, wy] = props.viewport.toWorld(...local(e));
    rectPreview.value = {
      x: Math.min(drag.wx, wx), y: Math.min(drag.wy, wy),
      w: Math.abs(wx - drag.wx), h: Math.abs(wy - drag.wy),
    };
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
      const g = drag.group;
      g ? props.actions.rotateSelected(d) : props.actions.rotate(d);
      setLast(`rotate ${d > 0 ? '+' : '−'}90°`, () => (g ? props.actions.rotateSelected(d) : props.actions.rotate(d)));
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
    if (!e.shiftKey && e.altKey) {
      // 중심 대칭 + 스냅
      const gcx = b0.x + b0.w / 2, gcy = b0.y + b0.h / 2;
      if (dir.includes('e') || dir.includes('w')) {
        const edge = dir.includes('e') ? gcx + W / 2 : gcx - W / 2;
        const sn = snapEdge('x', edge, exclude, SNAPG);
        if (sn) { W = 2 * Math.abs(sn.pos - gcx); gGuides.push(edgeGuide('x', sn, gcy - H / 2, gcy + H / 2)); }
      }
      if (dir.includes('s') || dir.includes('n')) {
        const edge = dir.includes('s') ? gcy + H / 2 : gcy - H / 2;
        const sn = snapEdge('y', edge, exclude, SNAPG);
        if (sn) { H = 2 * Math.abs(sn.pos - gcy); gGuides.push(edgeGuide('y', sn, gcx - W / 2, gcx + W / 2)); }
      }
    } else if (!e.shiftKey) {
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
    // 유닛별로 다른 값을 쓰므로 브로드캐스트 억제 (geomOp) — 드래그 중 '와리가리' 방지
    props.actions.withGeomOp(() => {
      for (const t of snaps) {
        t.u.x = Math.round(ax + (t.x0 - ax) * sx);
        t.u.y = Math.round(ay + (t.y0 - ay) * sy);
        t.u.params.W = clamp(Math.round(t.W0 * sx), LIMITS.unitMin, UNIT_MAX);
        t.u.params.H = clamp(Math.round(t.H0 * sy), LIMITS.unitMin, UNIT_MAX);
      }
    });
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
      // 사각형 레이아웃 그리드 스냅: 마진 박스 엣지 + 컬럼/로우(거터 포함) 라인
      if (o.type === 'rect' && o.params.gridOn) {
        const gl = rectGridLines(o.params);
        ox.push(o.x + gl.mx, o.x + o.params.W - gl.mx, ...gl.v.map((x) => o.x + x));
        oy.push(o.y + gl.my, o.y + o.params.H - gl.my, ...gl.h.map((y) => o.y + y));
      }
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
    let sdx = dx + (bestX ? bestX.d : gapX ? gapX.d : 0);
    let sdy = dy + (bestY ? bestY.d : gapY ? gapY.d : 0);
    // 그리드 스냅: 엣지/등간격 스냅이 없는 축만 선택 bbox 좌상단을 격자에 양자화
    if (gridCfg.snap) {
      if (!bestX && !gapX) sdx = dx + Math.round(minX / gridCfg.size) * gridCfg.size - minX;
      if (!bestY && !gapY) sdy = dy + Math.round(minY / gridCfg.size) * gridCfg.size - minY;
    }
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
  if (!e.shiftKey) {
    if (e.altKey) {
      // 중심 대칭: 이동 엣지가 스냅되면 반대편도 같이 — W = 2·(snap − 중심)
      const cx = x0 + W0 / 2, cy = y0 + H0 / 2;
      if (dir.includes('e') || dir.includes('w')) {
        const edge = dir.includes('e') ? cx + W / 2 : cx - W / 2;
        const sn = snapEdge('x', edge, [u], SNAP);
        if (sn) { W = 2 * Math.abs(sn.pos - cx); rGuides.push(edgeGuide('x', sn, cy - H / 2, cy + H / 2)); }
      }
      if (dir.includes('s') || dir.includes('n')) {
        const edge = dir.includes('s') ? cy + H / 2 : cy - H / 2;
        const sn = snapEdge('y', edge, [u], SNAP);
        if (sn) { H = 2 * Math.abs(sn.pos - cy); rGuides.push(edgeGuide('y', sn, cx - W / 2, cx + W / 2)); }
      }
    } else {
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
  }
  smartGuides.value = rGuides;
  W = clamp(Math.round(W), LIMITS.unitMin, UNIT_MAX);
  H = clamp(Math.round(H), LIMITS.unitMin, UNIT_MAX);
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
    // 사각형 레이아웃 그리드 라인도 리사이즈 스냅 후보 (이동 스냅과 동일 규칙 — §71 픽스)
    if (o.type === 'rect' && o.params.gridOn) {
      const gl = rectGridLines(o.params);
      if (axis === 'x') cands.push(o.x + gl.mx, o.x + o.params.W - gl.mx, ...gl.v.map((x) => o.x + x));
      else cands.push(o.y + gl.my, o.y + o.params.H - gl.my, ...gl.h.map((y) => o.y + y));
    }
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
      // 정렬 가능 상태(블록 2개 이상)에서만 키 지정 — 그룹 하나만 선택 시 무의미 (§77)
      if (moved < 4 && alignActive.value) props.doc.keyId = keyCandidate;
    }
    // Alt+드래그 복제 종료 → ⇧D = 같은 간격으로 연속 복제 (최신 사본 기준 체인)
    if (drag.kind === 'move' && drag.altDup && drag.targets.length) {
      const ddx = drag.targets[0].u.x - drag.targets[0].x0;
      const ddy = drag.targets[0].u.y - drag.targets[0].y0;
      let lastIds = drag.targets.map((t) => t.u.id);
      setLast('duplicate again', () => {
        const units = props.doc.units.filter((u) => lastIds.includes(u.id));
        if (!units.length) return;
        const copies =
          units.length > 1
            ? props.actions.duplicateUnits(units)
            : [props.actions.duplicateFrom(units[0])];
        for (const c of copies) {
          c.x += ddx;
          c.y += ddy;
        }
        lastIds = copies.map((c) => c.id);
      });
    }
    if (drag.kind === 'resize') {
      props.actions.setSize({}); // W 변경에 따른 파생 제약 정리 (거터 클램프)
    } else if (drag.kind === 'resizeg') {
      props.actions.normalizeSelected();
    } else if (drag.kind === 'marquee') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      if (moved < 4) props.actions.deselect(); // 제자리 클릭 = 선택 해제
      marquee.value = null;
    } else if (drag.kind === 'rectdraw') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      const fill = currentColor.value || null;
      if (moved < 4) {
        props.actions.createRect(drag.wx, drag.wy, 300, 200, fill); // 클릭 = 기본 크기
      } else if (rectPreview.value) {
        const r = rectPreview.value;
        props.actions.createRect(r.x, r.y, r.w, r.h, fill);
      }
      rectPreview.value = null;
      mode.value = 'select';
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

// 프로젝트 JSON의 워크스페이스 설정 반영 (App.openProject가 eo.prefs 갱신 후 'eo:prefs' 발신 — §86)
function applyPrefsFromStorage() {
  let p2;
  try { p2 = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return; }
  Object.assign(eyedropScope, p2.eyedropScope || {});
  Object.assign(gridCfg, p2.grid || {});
  Object.assign(view, p2.view || {});
  Object.assign(blendCfg, p2.blend || {});
  Object.assign(arrangeCfg, p2.arrange || {});
  if (p2.currentColor !== undefined) currentColor.value = p2.currentColor;
  if (p2.customColor) customColor.value = p2.customColor;
  if (Array.isArray(p2.recentColors)) recentColors.value = p2.recentColors;
  Object.assign(rectQuickCfg, p2.rectQuick || {});
  Object.assign(saveScope, p2.saveScope || {});
  Object.assign(openScope, p2.openScope || {});
  Object.assign(limitsCfg, p2.limits || {});
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('eo:prefs', applyPrefsFromStorage);
  // 초기 뷰: 100% 줌, 첫 유닛 중앙 배치
  if (!props.viewport.restored) centerFirstUnit();
  // 자동저장 복원 안내
  const meta = props.actions.restoredMeta;
  if (meta?.count) {
    const when = meta.savedAt ? new Date(meta.savedAt).toLocaleString() : '';
    toast(`Restored ${meta.count} unit${meta.count > 1 ? 's' : ''} from autosave${when ? ' · ' + when : ''}`);
  }
});
function centerWorld() {
  const r = el.value.getBoundingClientRect();
  return props.viewport.toWorld(r.width / 2, r.height / 2);
}
defineExpose({ centerWorld, toast });

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('eo:prefs', applyPrefsFromStorage);
  window.removeEventListener('pointermove', onMove);
});
</script>

<template>
  <div
    ref="el"
    class="stage"
    :class="{ panning: spaceHeld, eyedrop: mode === 'eyedrop', rectmode: mode === 'rect' }"
    :style="{
      ...(view.guideColor ? { '--unit-guide': view.guideColor } : {}),
      ...(view.stageGridColor ? { '--stage-grid': view.stageGridColor } : {}),
      ...(view.stageBgColor ? { background: view.stageBgColor } : {}),
    }"
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
          :width="gridCfg.size" :height="gridCfg.size"
          :patternTransform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`"
        >
          <!-- 패턴 내부에선 non-scaling-stroke가 무시되므로 1/scale로 수동 보정 (§91)
               — 저배율에서 선이 0.1px대로 얇아져 사라지던 문제 -->
          <path class="gridline" :d="`M ${gridCfg.size} 0 H 0 V ${gridCfg.size}`" :stroke-width="1 / vp.scale" />
        </pattern>
      </defs>
      <rect v-if="showStageGrid" class="gridbg" width="100%" height="100%" fill="url(#stage-grid)" />
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <g v-for="u in zOrdered" :key="u.id" :transform="`translate(${u.x} ${u.y})`">
          <RectGraphic v-if="u.type === 'rect'" :params="u.params" />
          <UnitGraphic
            v-else
            :params="u.params"
            :show-guides="showGuides && doc.selectedIds.includes(u.id)"
            :seam-width="seamW"
          />
          <rect
            class="hit"
            :width="u.params.W" :height="u.params.H"
            fill="transparent"
            @pointerdown.stop="onUnitDown(u, $event)"
            @contextmenu.prevent.stop="onUnitContext(u, $event)"
          />
        </g>
        <!-- 그룹 표시: 점선 아웃라인 (선택 시, 바운딩박스·그룹 표시 토글 적용) -->
        <template v-if="showBBox && view.showGroups">
          <rect
            v-for="(g, i) in groupOutlines" :key="'go' + i"
            class="groupLine"
            :x="g.x" :y="g.y" :width="g.w" :height="g.h"
          />
        </template>
        <!-- 링크 배지 (선택 관련 링크만, 뷰 옵션으로 숨김 가능) -->
        <g
          v-for="u in view.showLinks ? doc.units.filter((x) => x.linkId && visibleLinkIds.has(x.linkId)) : []"
          :key="'lk' + u.id"
          class="linkBadge"
          :transform="`translate(${u.x + u.params.W} ${u.y})`"
        >
          <text
            v-if="showLinkNums"
            :x="-pxs(20)" :y="-pxs(9)" :font-size="pxs(12)" text-anchor="end"
          >{{ linkIndex[u.linkId] }}</text>
          <g :transform="`translate(${-pxs(16)} ${-pxs(19)}) scale(${pxs(13) / 24})`">
            <path v-for="(d, pi) in ICONS.link" :key="pi" :d="d" />
          </g>
        </g>
        <!-- 정렬 키 오브젝트: 두꺼운 스트로크 하이라이트 -->
        <rect
          v-if="showBBox && keyRect"
          class="keySel"
          :x="keyRect.x" :y="keyRect.y"
          :width="keyRect.w" :height="keyRect.h"
        />
        <!-- 멀티선택/그룹: 통합 바운딩 박스 + 리사이즈 핸들 -->
        <GroupOverlay
          v-if="showBBox && selBounds"
          :bounds="selBounds"
          :label="groupLabel"
          :scale="vp.scale"
          @resize-start="onGroupResizeStart"
          @rotate-start="(e) => onRotateStart(e, true)"
          @action="onGroupAction"
        />
        <SelectionOverlay
          v-if="showBBox && singleSelected && activeUnit"
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
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <rect
          v-if="rectPreview"
          class="rectDraw"
          :x="rectPreview.x" :y="rectPreview.y" :width="rectPreview.w" :height="rectPreview.h"
        />
      </g>
      <rect
        v-if="marquee"
        class="marquee"
        :x="marquee.x" :y="marquee.y" :width="marquee.w" :height="marquee.h"
      />
    </svg>
    <Toolbar
      v-model:mode="mode"
      :fill="doc.selectedIds.length ? activeUnit?.params.fill : currentColor"
      :scope="eyedropScope"
      :blend-cfg="blendCfg"
      :arrange-cfg="arrangeCfg"
      :custom-color="customColor"
      :recent-colors="recentColors"
      :rect-quick-cfg="rectQuickCfg"
      @fill="onFill"
      @blend="onBlend"
      @arrange="onArrange"
      @rect-quick="onRectQuick"
      @update:custom-color="(c) => (customColor = c)"
    />
    <FileBar
      :view="view"
      :save-scope="saveScope"
      :open-scope="openScope"
      @save="actions.saveProject({ ...saveScope })"
      @open="(f) => actions.openProject(f, { ...openScope })"
      @reset="onReset"
    />
    <ResourceMonitor v-if="view.resMon" :count="doc.units.length" />
    <AlignBar :active="alignActive" @align="onAlign" />
    <ZoomBadge
      :scale="vp.scale"
      :guides="showGuides"
      :stage-grid="showStageGrid"
      :bbox="showBBox"
      :grid-cfg="gridCfg"
      :limits="limitsCfg"
      :ref-w="threadRefW"
      :view="view"
      @reset="resetZoom"
      @toggle-guides="showGuides = !showGuides"
      @toggle-stage-grid="showStageGrid = !showStageGrid"
      @toggle-bbox="showBBox = !showBBox"
    />
    <div
      v-if="ctxMenu"
      class="ctxMenu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <button
        v-for="a in CTX_ORDER" :key="a.key"
        class="ctxItem" @click="onCtxAction(a.key)"
      >{{ a.label }}</button>
      <div class="ctxSep" />
      <button
        v-for="a in CTX_ACTIONS" :key="a.key"
        class="ctxItem" @click="onCtxAction(a.key)"
      >{{ a.label }}</button>
      <div class="ctxSep" />
      <button
        class="ctxItem" :class="{ off: !canRegisterPreset }"
        :disabled="!canRegisterPreset"
        @click="onRegisterPreset"
      >Register unit preset</button>
      <div class="ctxSep" />
      <button class="ctxItem" @click="onCopySvg(); closeCtx()">Copy as SVG (⌘C)</button>
      <button class="ctxItem" @click="onCopyPng(); closeCtx()">Copy as PNG (⌘⇧C)</button>
      <button class="ctxItem" @click="actions.exportSvg(); closeCtx()">Export SVG file (⇧E)</button>
    </div>
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
// non-scaling-stroke에서는 대시 패턴도 화면 좌표로 계산됨 — 고정값이 곧 화면 고정 간격
.groupLine {
  fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke;
  stroke-dasharray: 5 4; opacity: 0.7;
}
.keySel { fill: none; stroke: var(--accent); stroke-width: 5; vector-effect: non-scaling-stroke; opacity: 0.9; }
.linkBadge path {
  fill: none; stroke: var(--link); stroke-width: 2;
  stroke-linecap: square; stroke-linejoin: miter;
}
.linkBadge text { fill: var(--link); font-family: inherit; font-weight: 600; }
.toast {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); padding: 7px 14px; pointer-events: none;
  border-radius: var(--radius);
}
.marquee { fill: var(--accent-alpha); stroke: var(--accent); stroke-width: 1; }
.ctxMenu {
  position: absolute; z-index: 10;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 4px; display: flex; flex-direction: column;
}
.ctxItem {
  border: none; background: none; color: var(--text); cursor: pointer;
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  padding: 6px 10px; text-align: left; border-radius: var(--radius);
  white-space: nowrap;
  &:hover { color: var(--accent); }
}
.ctxSep { height: 1px; background: var(--line); margin: 3px 4px; }
.ctxItem.off { color: var(--disabled); cursor: default; &:hover { color: var(--disabled); } }
.smartguide { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gapline { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gaptext { fill: var(--guide); font-family: inherit; user-select: none; }
.stage.eyedrop, .stage.eyedrop .hit { cursor: crosshair; }
.stage.rectmode, .stage.rectmode .hit { cursor: crosshair; }
.rectDraw { fill: var(--accent-alpha); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gridline { stroke: var(--stage-grid); fill: none; }
</style>
