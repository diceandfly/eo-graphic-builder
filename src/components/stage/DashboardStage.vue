<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { LIMITS, UNIT_MAX, STAGE_GRID, BRAND_COLORS } from '../../geometry/constants.js';
import UnitGraphic from './UnitGraphic.vue';
import SelectionOverlay from './SelectionOverlay.vue';
import ZoomBadge from './ZoomBadge.vue';
import Toolbar from './Toolbar.vue';
import FileBar from './FileBar.vue';
import ManualOverlay from './ManualOverlay.vue';
import FrameGraphic from './FrameGraphic.vue';
import GroupOverlay from './GroupOverlay.vue';
import AlignBar from './AlignBar.vue';
import ResourceMonitor from './ResourceMonitor.vue';
import ManagerBar from './ManagerBar.vue';
import PresetFloatWindow from './PresetFloatWindow.vue';
import StepField from '../controls/StepField.vue';
import AnimOverlay from './AnimOverlay.vue';
import AnimWindow from './AnimWindow.vue';
import { CURVE_PRESETS } from '../../geometry/anim.js';
import { readTokenMs } from '../../utils/cssToken.js';
import { dockNodePoint, dockBridges, dockBridgeGuides, dockAttachedEnds, dockAxesParallel } from '../../geometry/dock.js';
import { ICONS } from '../../ui/icons.js';
import { frameGridLines } from '../../geometry/frameGrid.js';
import { framePresetById } from '../../geometry/framePresets.js';
import { canvasPointToLocal } from '../../geometry/derive.js';
import { layerOf, isPresetable } from '../../objects/registry.js';
import { useRecentColors } from '../../composables/useRecentColors.js';
import { registerPopup, unregisterPopup } from '../../utils/popupBus.js';

// 실픽셀 대시보드 스테이지.
// 조작: 좌클릭 = 선택/이동/리사이즈, 휠 = 팬, 핀치·⌘+휠 = 커서 중심 줌,
//       휠버튼 드래그·Space+드래그 = 팬, 빈 곳 클릭 = 선택 해제.
const props = defineProps({
  doc: Object,      // useDocument().doc
  viewport: Object, // useViewport() 반환값
  actions: Object,  // useDocument() 액션 (select/deselect/rotate/flipActive/duplicateFrom/setSize)
  patterns: { type: Array, default: () => [] }, // §205: 패턴 프리셋 목록 (usePatterns)
  presets: { type: Array, default: () => [] },  // §207: 유닛 프리셋 목록 (usePresets — 메인 패널에서 이관)
  patternFolders: { type: Array, default: () => [] }, // §210: 프리셋 폴더 (1단계)
  presetFolders: { type: Array, default: () => [] },
  hoverLinkCat: { type: String, default: null }, // §279: LINK 칩 호버 중인 범주 — 링크 상대 하이라이트
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
// §278: 링크 배지 폐기(멀티 링크 전환으로 대표 lid 배지가 무의미 — 사용자 확정) →
// 그 자리/아이콘을 **도크 배지**가 승계: 결착된 유닛 표시 (뷰 옵션 showLinks 키 재사용)
const dockedIdSet = computed(() => {
  const s = new Set();
  for (const e of props.doc.docks) { s.add(e.from); s.add(e.to); }
  return s;
});
// §279: LINK 칩 호버 하이라이트 — 선택 유닛들의 그 범주 lid를 공유하는 모든 유닛 (딤드 네온 아웃라인)
const hoverLinkUnits = computed(() => {
  const cat = props.hoverLinkCat;
  if (!cat) return [];
  const lids = new Set();
  for (const u of props.doc.units) {
    if (props.doc.selectedIds.includes(u.id) && u.links?.[cat] != null) lids.add(u.links[cat]);
  }
  if (!lids.size) return [];
  return props.doc.units.filter((u) => u.links?.[cat] != null && lids.has(u.links[cat]));
});
// §280: 도킹 노드 — **선택한 유닛에만** 원형 노드 (사용자 확정 재설계).
// 연결 = 유닛 2개를 선택해 노드 4개가 뜬 상태에서, 한 노드를 **다른 선택 유닛의 반대쪽 노드**로
// 드래그. 양쪽 노드 모두 드래그 시작 가능 (우→좌 = 그대로, 좌→우 = 역방향 엣지). 빈 곳 = 그 노드 해제.
const dockDrag = ref(null); // { fromId, side, x1, y1, x, y }
// §279→§280: 노드 표시 위치 = 샤프트 축 위, 가장자리에서 안쪽 28px(화면 기준, 폭 1/3 상한)
function dockPt(u, side) {
  const [lx, ly] = dockNodePoint(u, 'left');
  const [rx, ry] = dockNodePoint(u, 'right');
  const L = Math.hypot(rx - lx, ry - ly) || 1;
  const inset = Math.min(L / 3, pxs(20)); // §287: 28→24 → §288: 24→20 (사용자 미세 조정)
  const d = [(rx - lx) / L, (ry - ly) / L];
  return side === 'right'
    ? [rx - d[0] * inset, ry - d[1] * inset]
    : [lx + d[0] * inset, ly + d[1] * inset];
}
// §284: 도크 브리지 — 공유 헬퍼 (익스포트·애니패널 프리뷰와 동일 소스)
const stageBridges = computed(() => dockBridges(props.doc.units, props.doc.docks));
// §289: 유닛 그리드 on + 결착 유닛의 가이드가 보일 때 브리지 경계도 그리드 문법으로
const stageBridgeGuides = computed(() => {
  if (!showGuides.value || !props.doc.docks.length) return [];
  return dockBridgeGuides(props.doc.units, props.doc.docks, new Set(props.doc.selectedIds));
});
// §285: 도크 배지 표시 대상 = 선택된 결착 유닛 + **같은 도크 체인의 상대들** (사용자 확정)
const dockBadgeIds = computed(() => {
  const ids = new Set(props.doc.selectedIds.filter((id) => dockedIdSet.value.has(id)));
  if (ids.size) for (const m of props.actions.dockMates([...ids])) ids.add(m.id);
  return ids;
});
// §283: 도크 배지 클릭 팝업 — 해제(Undock) 진입점 (페어 인디케이터 문법)
const dockMenu = ref(null); // { x, y, u }
function onDockBadgeClick(u, cx, cy) {
  const [wx, wy] = dropClientToWorld(cx, cy); // §308: 월드 앵커
  dockMenu.value = { wx, wy, u };
}
const closeDockMenu = () => { dockMenu.value = null; };
// §310: 팬 시작 pointerdown(휠클릭·스페이스 드래그)은 "바깥 클릭"이 아님 — 월드 앵커 팝업(§308)은
// 뷰포트 이동을 따라다니므로 팬으로 닫지 않는다. 닫힘 = 다른 곳 클릭·팝업 자체 로직만 (사용자 확정).
function isPanStart(e) { return e.button === 1 || spaceHeld.value; }
function closeDockMenuOutside(e) {
  if (isPanStart(e)) return;
  if (e.target instanceof Element && e.target.closest('.ctxMenu')) return;
  closeDockMenu();
}
watch(dockMenu, (open) => {
  if (open) {
    registerPopup(closeDockMenu);
    setTimeout(() => window.addEventListener('pointerdown', closeDockMenuOutside, true), 0);
  } else {
    unregisterPopup(closeDockMenu);
    window.removeEventListener('pointerdown', closeDockMenuOutside, true);
  }
});
function onUndockFromBadge() {
  const u = dockMenu.value?.u;
  closeDockMenu();
  if (u && props.actions.undockUnit(u.id)) toast(`Undocked — ${u.name}`);
}
// §290: 팝업의 결착별 거터 **보정** 행 — 자동 평균에 더하는 ±px 단일 필드 (auto|fixed 모드 폐기)
const dockMenuEdges = computed(() => {
  const u = dockMenu.value?.u;
  if (!u) return [];
  return props.doc.docks
    .filter((e) => e.from === u.id || e.to === u.id)
    .map((e) => ({ e, comp: Number(e.comp) || 0 }));
});
// §283: 노드 활성 조건 (사용자 확정) — ① 줌 ≥ 15% (자동 숨김 임계) ② 유닛 **2개 이상** 선택
// ③ 전원 샤프트 축 평행(역평행 포함). 단일 유닛 노드 폐기 — 해제는 도크 배지 팝업(Undock)으로.
const dockNodeUnits = computed(() => {
  if (vp.scale < 0.15) return [];
  const sel = props.doc.units.filter((u) => u.type !== 'frame' && props.doc.selectedIds.includes(u.id));
  if (sel.length < 2) return [];
  for (let i = 1; i < sel.length; i += 1) {
    if (!dockAxesParallel(sel[0], sel[i])) return [];
  }
  return sel;
});
// §283: 결착 표시 = **기하적으로 붙은 끝** — 로컬 좌/우 기준은 90/270·미러 조합에서 반대쪽 끝이
// 칠해져 "엉뚱한 데가 결착됐다"는 오독을 만들었음 (사용자 리포트 0-1의 실체)
// §292: 공유 헬퍼로 승격 (익스포트·애니패널과 동일 소스) — threadMin 경계 중심 100%에도 사용
const dockAttached = computed(() => dockAttachedEnds(props.doc.units, props.doc.docks));
// §293: 노드의 결착(파란 필) 표시 = **선택한 유닛들끼리 묶인 결착만** (사용자 확정) —
// 서로 다른 도크그룹의 유닛을 하나씩 선택하면 노드는 비활성 룩 (이 선택 안에선 결착이 아님)
const selDockAttached = computed(() => {
  const sel = new Set(props.doc.selectedIds);
  return dockAttachedEnds(props.doc.units, props.doc.docks.filter((e) => sel.has(e.from) && sel.has(e.to)));
});
// §281: 드래그 중 타깃 = 다른 선택 유닛의 **양쪽 노드 모두** — 같은쪽 노드에 놓아도 결착
// (반대쪽 한정이 "드래그는 되는데 연결이 안 됨" 무반응의 원인. 방향은 드래그 시작 쪽이 결정)
const dockTargetOf = (u) => !!dockDrag.value && dockDrag.value.fromId !== u.id;
function onDockNodeDown(u, side) {
  const [x1, y1] = dockPt(u, side);
  dockDrag.value = { fromId: u.id, side, x1, y1, x: x1, y: y1 };
  const mv = (ev) => {
    const [wx, wy] = dropClientToWorld(ev.clientX, ev.clientY);
    if (dockDrag.value) { dockDrag.value.x = wx; dockDrag.value.y = wy; }
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', mv);
    const d = dockDrag.value;
    dockDrag.value = null;
    if (!d) return;
    const [wx, wy] = dropClientToWorld(ev.clientX, ev.clientY);
    let hit = null;
    let best = 18 / vp.scale; // §281: 반경 14→18 (노드 소형화 보정)
    const others = dockNodeUnits.value.filter((t) => t.id !== d.fromId);
    for (const t of others) {
      for (const side of ['left', 'right']) { // §281: 양쪽 노드 모두 수용
        const [nx, ny] = dockPt(t, side);
        const dist = Math.hypot(wx - nx, wy - ny);
        if (dist < best) { best = dist; hit = t; }
      }
    }
    // §284: 같은 유닛의 반대 노드에 드롭 = 흔한 실수 — 전용 안내 (해제로 오폭하지 않게 최우선 판정)
    const me = props.doc.units.find((x) => x.id === d.fromId);
    if (!hit && me) {
      const [ox, oy] = dockPt(me, d.side === 'right' ? 'left' : 'right');
      if (Math.hypot(wx - ox, wy - oy) < 18 / vp.scale) {
        toast('Dock joins two units — drop on the other unit\'s node');
        return;
      }
    }
    if (hit) {
      // §282: 에러 구분 — 축 비평행(게이트 밖 변동 대비) vs 사이클
      if (me && !dockAxesParallel(me, hit)) {
        toast('Cannot dock — shaft axes are not parallel (rotate one unit first)');
        return;
      }
      const ok = d.side === 'right'
        ? props.actions.connectDock(d.fromId, hit.id)
        : props.actions.connectDock(hit.id, d.fromId); // 좌측에서 시작 = 역방향 결착
      if (!ok) toast('Cannot dock — this would close a loop');
    } else if (props.actions.disconnectDock(d.fromId, d.side)) {
      toast('Undocked');
    } else if (!others.length) {
      toast('Select both units first — then drag a node onto the other unit\'s node'); // §281: 무반응 방지 안내
    }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
}

const keyUnit = computed(() =>
  props.doc.keyId != null && props.doc.selectedIds.includes(props.doc.keyId)
    ? props.doc.units.find((u) => u.id === props.doc.keyId)
    : null
);
// 선택 블록 수 (최외곽 그룹 = 1블록, 프레임 = 각 1블록) — 판정은 useDocument 단일 소스 (§120)
const selBlockCount = computed(() => props.actions.blocksOf(props.doc.selectedIds).length);
// 정렬바 활성: 블록 2개 이상 — 또는 단일 블록 + 기준 프레임(활성/소유, §123·§124)
const alignActive = computed(() => selBlockCount.value >= 2 || !!props.actions.alignRefFrame());
// 등간격 활성: 블록 3개 이상일 때만 (양 끝 고정 방식이라 2개는 무의미, §114)
const distActive = computed(() => selBlockCount.value >= 3);
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
const mode = ref('select'); // 'select' | 'eyedrop' | 'frame'
// ── 프레임 조작 모드 (§92) — 선택툴 우클릭으로 커서 스왑 ──
// on: 프레임만 선택·조작(이동 시 내용물 동반), 유닛 패스스루 / off: 유닛 조작, 프레임 패스스루
// §203: 프레임 우선 모드는 줌 배율 자동 — 경계(framePickZoom %) 미만으로 축소되면
// 선택 도구가 프레임 우선(구 A 모드 문법: 유닛 패스스루)으로 전환되고 툴바 아이콘도 바뀐다.
// A 키는 추후 애니메이션 기능이 가져감. 경계는 % 배지 우클릭 팝업에서 설정 (0 = 자동 전환 끔).
// §206: 셀렉트 우클릭 = 일시 수동 전환 — 줌이 바뀌거나 다른 도구를 고르면 자동 기준으로 복귀.
const manualPick = ref(null); // 'frame' | 'unit' | null
const frameMode = computed(() =>
  manualPick.value ? manualPick.value === 'frame' : vp.scale < (view.framePickZoom || 0) / 100
);
let pickGuard = false; // 토글 자체가 mode를 select로 바꾸며 아래 워처에 지워지는 것 방지
function toggleFrameModeManual() {
  pickGuard = true;
  mode.value = 'select';
  manualPick.value = frameMode.value ? 'unit' : 'frame';
  nextTick(() => { pickGuard = false; });
}
watch(() => vp.scale, () => { manualPick.value = null; });
watch(mode, () => { if (!pickGuard) manualPick.value = null; });
// 소유권 판정 (§92) — 어레인지와 공유하는 문서 로직이라 useDocument로 이동, 여기선 위임
const frameOwnedUnits = (frameIds) => props.actions.frameOwnedUnits(frameIds);
// 스포이드 타깃 필터 (§137): 선택과 같은 타입만 포인터 히트 —
// 유닛/그룹 선택 = 프레임 무시, 프레임 선택 = 유닛/그룹 무시 (겹침 시 오픽 방지)
const eyedropType = computed(() => {
  const sel = props.doc.units.find((u) => props.doc.selectedIds.includes(u.id));
  return sel ? sel.type : null;
});
function hitPointerEvents(u) {
  if (mode.value === 'eyedrop') {
    return eyedropType.value && u.type !== eyedropType.value ? 'none' : 'auto';
  }
  if (mode.value !== 'select') return 'auto';
  // §201: V(일반 선택)에서도 프레임 직접 조작 (피그마식) — 유닛이 z 상위라 유닛 우선,
  // 프레임 몸체(빈 영역) 클릭 = 프레임. A(프레임 모드)는 유닛 패스스루 필터로 유지.
  if (u.type === 'frame') return 'auto';
  return frameMode.value ? 'none' : 'auto';
}
// (§202의 프레임 화면 크기 임계·topFrameAt은 §203에서 폐기 — 줌 경계 자동 모드가
//  유닛 패스스루로 같은 효과를 냄. 클릭 지점 프레임 탐색이 다시 필요하면 git 이력 참조)
// 활성 프레임 아웃라인 (§134·§135): 오프셋 없이 프레임 경계에 밀착
const activeFrameRect = computed(() => {
  const fid = props.actions.activeFrameId.value;
  const f = fid != null && props.doc.units.find((u) => u.id === fid && u.type === 'frame');
  if (!f) return null;
  return { x: f.x, y: f.y, w: f.params.W, h: f.params.H };
});
const framePreview = ref(null); // 프레임 드래그 생성 미리보기 (월드 좌표)
// §210: 프레임 라벨 목록 — 선택 프레임이 맨 위, 그리고 **겹치는 라벨은 위 것만 표시**
// (같은 자리에 쌓인 프레임들의 라벨이 후광 밖으로 삐져나와 지저분하던 잔여 문제 해결)
const frameLabels = computed(() => {
  if (mode.value !== 'select') return [];
  const fs = [...props.doc.units.filter((x) => x.type === 'frame')]
    .sort((a, b) => (props.doc.selectedIds.includes(a.id) ? 1 : 0) - (props.doc.selectedIds.includes(b.id) ? 1 : 0));
  // §222: 라벨 폭을 프레임 화면 폭에 맞춰 말줄임 — 저배율에서 긴 이름이 이웃 라벨 오클루전 필터에
  // 통째로 숨던 문제 해결 (숨기는 대신 잘라서라도 보여줌). 최소 4자+… 보장.
  const entry = (f) => {
    const maxChars = Math.max(5, Math.floor((f.params.W * vp.scale - 8) / 6.8));
    const label = f.name.length > maxChars ? `${f.name.slice(0, maxChars - 1)}…` : f.name;
    // w = 히트 패드 포함 화면 px 근사(렌더용) / tw = 텍스트만 (충돌 판정용 — §243)
    return { f, label, w: label.length * 6.8 + 20, tw: label.length * 6.8 };
  };
  // §242: 겹침 = 숨김 대신 **윗줄 스태거(최대 3줄)** — 저배율 군집에서도 긴 이름이 사라지지 않음.
  // 우선순위(선택 > z 상위)가 0줄을 차지하고, 겹치는 라벨은 한 줄씩 위로. 3줄 초과만 숨김.
  // §243: 충돌 판정은 **텍스트 폭(tw)** 기준 — 히트 패드(+20px)까지 포함하면 말줄임으로
  // 시각적 겹침이 이미 해소된 이웃 라벨이 가짜 충돌로 한 줄 올라가던 문제.
  const es = fs.reverse().map(entry); // reverse: 선택(정렬 끝) → 첫 순위, 그다음 z 상위
  const out = [];
  for (const a of es) {
    const clash = (row) => out.some((b) => {
      if (b.row !== row) return false;
      const dxs = (a.f.x - b.f.x) * vp.scale;
      const dys = (a.f.y - b.f.y) * vp.scale;
      return Math.abs(dys) < 18 && dxs < b.tw + 4 && dxs > -(a.tw + 4);
    });
    let row = 0;
    while (row <= 2 && clash(row)) row += 1;
    if (row <= 2) out.push({ ...a, row });
  }
  return out;
});
// §245: 애니 모드에서 선택에 페어 프레임이 포함되면 통합 bbox(핸들)가 억제됨 — 그동안의
// 선택·이동 피드백은 선택 프레임 **전부**(페어든 아니든)의 개별 아웃라인이 대신한다.
const animSelFrames = computed(() => {
  if (!animMode.value) return [];
  const fs = props.doc.units.filter((u) => u.type === 'frame' && props.doc.selectedIds.includes(u.id));
  return fs.some((f) => f.pair != null) ? fs : [];
});
// §251·§252: 체인 선택 이동 — 그립 폐기(사용자 정정): 합집합 bbox **점선 영역 내 클릭 = 전체 이동**.
// (유닛 편집은 바깥 클릭으로 선택 해제 후 — 사용자 확정)
const animSelBounds = computed(() => {
  const fs = animSelFrames.value;
  if (!fs.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const f of fs) {
    minX = Math.min(minX, f.x); minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.params.W); maxY = Math.max(maxY, f.y + f.params.H);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
});
// §294: 이동 동반 확장 단일 경로 — 프레임 소유 유닛(§92) + 페어 home 유닛(§245) + 도크 체인(§278).
// 체인 영역 드래그와 일반 이동 드래그가 공유 (중복 2벌이 §278 확장 때 한쪽만 고쳐질 뻔한 부채)
function expandMoveTargets(targets) {
  const frames = targets.filter((t) => t.type === 'frame');
  for (const o of frameOwnedUnits(frames.map((t) => t.id))) if (!targets.includes(o)) targets.push(o);
  for (const f of frames) {
    if (f.pair == null) continue;
    for (const o of props.actions.animOwnedUnits(f.id)) if (!targets.includes(o)) targets.push(o);
  }
  for (const o of props.actions.dockMates(targets.map((t) => t.id))) if (!targets.includes(o)) targets.push(o);
  return targets;
}
function onChainAreaDown(e) {
  if (e.button !== 0) return;
  const targets = expandMoveTargets(props.doc.units.filter((x) => props.doc.selectedIds.includes(x.id)));
  beginDrag(e, { kind: 'move', targets: targets.map((t) => ({ u: t, x0: t.x, y0: t.y })) });
}
// §246: 프레임 2개 이상 선택 = 프레임 단위 조작 중 — 유닛 링크 배지 숨김
const multiFrameSel = computed(
  () => props.doc.units.filter((u) => u.type === 'frame' && props.doc.selectedIds.includes(u.id)).length >= 2
);
// §208: 프레임 이름 라벨 더블클릭 = 뷰포트 인라인 이름변경 (HTML input을 라벨 화면 위치에 오버레이)
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };
const frameNameEdit = ref(null); // { id, draft }
function startFrameNameEdit(f) {
  frameNameEdit.value = { id: f.id, draft: f.name };
}
function commitFrameName(e) {
  if (e && e.isComposing) return; // 한글 조합 중 Enter 무시
  const ed = frameNameEdit.value;
  if (ed) {
    const f = props.doc.units.find((u) => u.id === ed.id);
    const t = ed.draft.trim();
    if (f && t) f.name = t;
  }
  frameNameEdit.value = null;
}
const frameNameEditPos = computed(() => {
  const ed = frameNameEdit.value;
  const f = ed && props.doc.units.find((u) => u.id === ed.id);
  if (!f) return null;
  return { left: `${f.x * vp.scale + vp.x}px`, top: `${f.y * vp.scale + vp.y - 24}px` };
});
// §205·§207: 프리셋 플로팅 패널 (우하단 프리셋 바 토글) — 'units' | 'patterns' | null (상호 배타)
const presetPanel = ref(null);
function togglePresetPanel(name) {
  presetPanel.value = presetPanel.value === name ? null : name;
  // §225: 툴바는 중앙 정렬이라 내용 폭이 변하면 좌변이 움직임 — 열 때마다 재측정
  if (presetPanel.value) nextTick(measurePresetW);
}
// §223: 애니메이션 모드 (Phase B) — 프레임 노드/와이어 오버레이, A 키·프리셋 바 버튼 토글
const animMode = ref(false);
function toggleAnimMode() {
  animMode.value = !animMode.value;
  props.actions.setAnimMode(animMode.value); // §227: 이산값 잠금 가드 동기화
}
// §237: 오버레이 표시 조건 — 모드 on / 엣지 존재 / 페어 존재(엣지 없어도 회색 페어 마크 유지)
const animOverlayOn = computed(() =>
  animMode.value || props.doc.animEdges.length > 0 || props.doc.units.some((u) => u.pair != null));
// §224: 엣지 선택(와이어 강조 + 애니메이션 창 연동) + 와이어 중앙 컨트롤 팝업 (duration·곡선)
const animEdgeSel = ref(null); // 'from-to' 키
const animEdgePopup = ref(null); // { x, y } — 화면 좌표
const edgeKey = (e) => `${e.from}-${e.to}`;
const selEdge = computed(() => {
  const edges = props.doc.animEdges;
  if (!edges.length) return null;
  // §235: 우선순위 = ①현재 선택(프레임 직접 + 유닛의 home 프레임) ②뱃지로 기억된 엣지 ③첫 엣지.
  // 종전엔 ②가 ①보다 우선이라 다른 체인의 프레임/유닛을 선택해도 하이라이트가 안 따라오던 문제.
  const selFrames = new Set();
  for (const id of props.doc.selectedIds) {
    const u = props.doc.units.find((x) => x.id === id);
    if (!u) continue;
    if (u.type === 'frame') selFrames.add(u.id);
    else if (u.home != null) selFrames.add(u.home);
  }
  const bySel = edges.find((e) => selFrames.has(e.from)) ?? edges.find((e) => selFrames.has(e.to));
  if (bySel) return bySel;
  return edges.find((e) => edgeKey(e) === animEdgeSel.value) ?? edges[0];
});
// §308: 노드계 팝업(타이밍·페어·도크)은 **월드 좌표 앵커** — 팬/줌해도 노드 옆에 고정 (사용자 확정).
// 렌더 시점에 월드→스테이지 로컬로 환산 (vp 반응형이라 뷰포트 이동을 자동 추종)
const worldToLocal = (wx, wy) => [wx * vp.scale + vp.x, wy * vp.scale + vp.y];
function onEdgeClick(e, cx, cy) {
  animEdgeSel.value = edgeKey(e);
  const [wx, wy] = dropClientToWorld(cx, cy);
  animEdgePopup.value = { wx, wy };
}
function onEdgePopupOutside(e) {
  if (isPanStart(e)) return; // §310: 팬 시작은 닫힘 트리거 아님
  if (e.target instanceof Element && e.target.closest('.edgeMenu')) return;
  animEdgePopup.value = null;
}
watch(animEdgePopup, (open, was) => {
  if (open && !was) setTimeout(() => window.addEventListener('pointerdown', onEdgePopupOutside, true), 0);
  else if (!open) window.removeEventListener('pointerdown', onEdgePopupOutside, true);
});
const sameCurve = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
// 애니메이션 창 데이터 — 선택 엣지의 양 키프레임 + 소유 유닛 (reactive)
const animFrom = computed(() => (selEdge.value ? props.doc.units.find((u) => u.id === selEdge.value.from) : null));
const animTo = computed(() => (selEdge.value ? props.doc.units.find((u) => u.id === selEdge.value.to) : null));
// §225: 소속 = home(페어 복제 시 확정) — 키프레임이 겹쳐 있어도 페어 매칭이 무너지지 않음
const animFromUnits = computed(() => (animFrom.value ? props.actions.animOwnedUnits(animFrom.value.id) : []));
const animToUnits = computed(() => (animTo.value ? props.actions.animOwnedUnits(animTo.value.id) : []));
// §228: 기존 엣지(구 문서) 선택 시에도 페어 소속 자동 복구 — 멱등이라 엣지 전환마다 1회
watch(() => selEdge.value && `${selEdge.value.from}-${selEdge.value.to}`, (k) => {
  if (k && selEdge.value) props.actions.repairAnimHomes(selEdge.value.from, selEdge.value.to);
}, { immediate: true });
// §223: 애니 모드에서 페어 오브젝트 삭제 = 경고 후 차단 (대응 관계 보호 — §220 사용자 확정)
function guardedDelete() {
  if (animMode.value) {
    const sel = props.doc.units.filter((x) => props.doc.selectedIds.includes(x.id));
    if (sel.some((x) => x.pair != null)) {
      toast('Keyframe — use its ▶ badge → Delete keyframe (or detach it first)'); // §246·§247: 용어 통일
      return;
    }
  }
  props.actions.deleteSelected();
}
// §224·§225: 프리셋창 왼쪽 끝 = **도구 툴바**(툴바 그룹의 마지막 바) 왼쪽 라인 정렬 — 폭 실측 (리사이즈 추적)
const presetW = ref(580);
const stageSize = ref({ w: 0, h: 0 }); // §225: 미니맵/핏 계산용 스테이지 크기
function measurePresetW() {
  const sr = el.value?.getBoundingClientRect();
  if (!sr) return;
  stageSize.value = { w: sr.width, h: sr.height };
  const tb = el.value?.querySelector('.toolbarWrap .fbar:last-of-type'); // 컬러 바가 아닌 도구 바
  if (!tb) return;
  const left = tb.getBoundingClientRect().left - sr.left;
  presetW.value = Math.max(240, Math.round(sr.width - 12 - left)); // 12 = --sp-6 (하한 240 = 2열 가용 최소)
}
// §225: 시점 복귀 — 전체 오브젝트가 보이게 핏 (미니맵 옆 버튼)
function fitAllView() {
  const us = props.doc.units;
  if (!us.length) return;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const u of us) {
    minX = Math.min(minX, u.x); minY = Math.min(minY, u.y);
    maxX = Math.max(maxX, u.x + u.params.W); maxY = Math.max(maxY, u.y + u.params.H);
  }
  const { w, h } = stageSize.value;
  const s = Math.min(8, Math.max(0.05, Math.min(w / ((maxX - minX) * 1.12), h / ((maxY - minY) * 1.12))));
  vp.scale = s;
  vp.x = w / 2 - ((minX + maxX) / 2) * s;
  vp.y = h / 2 - ((minY + maxY) / 2) * s;
}
// §225: 미니맵 클릭 — 그 월드 지점을 화면 중앙으로 (줌 유지)
function jumpToWorld(wx, wy) {
  vp.x = stageSize.value.w / 2 - wx * vp.scale;
  vp.y = stageSize.value.h / 2 - wy * vp.scale;
}
// §221: 프리셋 창 내부 로직은 PresetFloatWindow로 분리 — 스테이지는 좌표 변환만 공급
function panelCenterWorld() {
  const r = el.value.getBoundingClientRect();
  return props.viewport.toWorld(r.width / 2, r.height / 2);
}
// §210: 카드 → 캔버스 드랍 배치 (뷰포트 client 좌표 → 월드 변환)
function dropClientToWorld(cx, cy) {
  const r = el.value.getBoundingClientRect();
  return props.viewport.toWorld(cx - r.left, cy - r.top);
}
// §273: 뷰포트 월드 사각형(반응형) — 페어 번호를 "동시에 보이는 프레임" 한정으로 매기는 기준
const animViewRect = computed(() => {
  const { w, h } = stageSize.value;
  if (!w || !h) return null;
  const [x0, y0] = props.viewport.toWorld(0, 0); // vp 반응 접근 — 팬/줌 추적
  const [x1, y1] = props.viewport.toWorld(w, h);
  return { x0, y0, x1, y1 };
});
const showManual = ref(false);   // 도움말 오버레이 (§157 — 파일 바 ? 좌클릭)
const showGuides = ref(true);    // 유닛 그리드 가이드 (선택된 유닛에만 표시)
const showFrameGrid = ref(true); // 프레임 그리드 가이드 (§132 — on/off 파라미터 폐기 후 뷰 토글로 이관)
// 코너 바 아이콘 = 마스터 토글: 유닛·프레임 그리드 동시 (개별 토글은 우클릭 메뉴)
function toggleAllGrids() {
  const on = !(showGuides.value || showFrameGrid.value);
  showGuides.value = on;
  showFrameGrid.value = on;
}
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
const eyedropScope = reactive({ size: true, orientation: false, grid: true, shape: true, color: true, ...(prefs.eyedropScope || {}) });
// 캔버스 그리드 설정 (그리드 버튼 우클릭 메뉴): 정방형 간격 + 이동 그리드 스냅
const gridCfg = reactive({ size: STAGE_GRID, snap: false, ...(prefs.grid || {}) });
const showBBox = ref(true); // 바운딩박스(선택 오버레이) 표시 토글
// 뷰 옵션 (코너 바 우클릭 메뉴): 방향키 이동 px · 링크 배지 표시 · 유닛 그리드 색 · 캔버스 격자/배경 색 (§85)
const view = reactive({
  nudge: 5, showLinks: true, showGroups: true, showSelName: true, showAnimBadges: true, guideColor: null, // §245: showSelName · §250: showAnimBadges = 페어 ▶ 뱃지
  stageGridColor: null, stageBgColor: null,
  seamOn: true, seamCutoff: 40, // seam 스트로크 보정: 줌 < cutoff% 에서만 (§86)
  framePickZoom: 6, // §203: 이 줌(%) 미만 = 프레임 우선 선택 (0 = 끔) — §279: 기본 20→6%
  resMon: false, // 리소스 모니터 표시 (§86)
  ...(prefs.view || {}),
});
if (view.framePickZoom === 20) view.framePickZoom = 6; // §279: 구 기본값(20) 저장분 1회 이관
// seam 보정 폭 (화면 px): 토글 + 컷오프 줌 이상에서 0
// §148: 줌 배율 비례 보정 — 구식(1.2 - scale)은 줌아웃일수록 두꺼워져(0.05x에서 1.15px 화면 고정)
// 극소 렌더에서 스트로크가 과대해 보였음. 배율에 비례해 얇아지게: cutoff 부근 ≈1px → 줌아웃 시 점감.
// §150: 20% 이하는 완만한 기울기(×1.2)로 전환 — 저배율에서 §148 직선이 과하게 얇아지는 것 보정.
const seamW = computed(() => {
  if (!(view.seamOn && vp.scale < view.seamCutoff / 100)) return 0;
  if (vp.scale < 0.2) return Math.max(0.25, 0.5 - (0.2 - vp.scale) * 1.2);
  return Math.min(1, vp.scale * 2.5);
});
// 블렌드 설정 (툴 버튼 우클릭 메뉴에서 편집, 좌클릭/B로 즉시 적용)
const blendCfg = reactive({ axis: 'h', count: 7, gap: 30, scale: 0.4, ...(prefs.blend || {}) });
// 그리드 배열 설정 (툴 버튼 우클릭 메뉴, 좌클릭/G로 즉시 적용). columns 0 = 자동
// §198: axis 모드 폐지, gap → gapX/gapY 분리. 구버전 prefs { gap, axis } 마이그레이션 포함
function migrateArrange(p = {}) {
  const { gap, ...rest } = p;
  delete rest.axis; // §198: axis 모드 폐지 — 구 prefs 키 버림
  if (gap !== undefined) {
    if (rest.gapX === undefined) rest.gapX = gap;
    if (rest.gapY === undefined) rest.gapY = gap;
  }
  return rest;
}
const arrangeCfg = reactive({ gapX: 40, gapY: 40, columns: 0, ...migrateArrange(prefs.arrange) });
// 현재 컬러 — 선택 없을 때 스와치로 지정, 그리기 툴 기본값
const currentColor = ref(prefs.currentColor || null);
// 커스텀 컬러 (7번 스와치) — 우클릭 픽커로 편집
const customColor = ref(prefs.customColor || '#333333'); // Solid Gray (§200)
// 최근 사용 컬러 — 공유 스토어(§110: 패널 stroke 팝업과 공용). 영속은 아래 prefs 워처.
const { recentColors, commitRecentColor } = useRecentColors();
if (Array.isArray(prefs.recentColors)) recentColors.value = prefs.recentColors;
// 프레임 더블클릭 즉시 생성 크기 (프레임 툴 우클릭 메뉴에서 편집 — §85·§92)
// margin·gutter는 통합 1값(gutter = X/Y 공유, §116 결정 — 세밀 조정은 메인 패널)
// fill(§153): null = 현재 컬러 따름, hex = 고정 색
const frameQuickCfg = reactive({ w: 1920, h: 1080, margin: 20, gutter: 20, fill: null, preset: null, ...(prefs.rectQuick || {}), ...(prefs.frameQuick || {}) }); // §201: preset = SNS 배너 프리셋 id (null = 커스텀)
// 프로젝트 JSON 저장/열기 범위 3분류 (§88) — 카메라는 토글 없이 항상 저장·복원.
// work = 캔버스 데이터 / tools = 도구 커스터마이즈 / viewport = 그리드·렌더 옵션
const pickScope = (src) => ({
  work: src?.work ?? true, tools: src?.tools ?? false, viewport: src?.viewport ?? false,
});
const saveScope = reactive(pickScope(prefs.saveScope));
const openScope = reactive({ ...pickScope(prefs.openScope), tools: prefs.openScope?.tools ?? true, viewport: prefs.openScope?.viewport ?? true });
// 지오메트리 하한 (유닛 그리드 버튼 우클릭 메뉴 — §87). LIMITS(플레인)로 흘려보내고
// 변경 시 params 객체 교체로 파생 캐시를 무효화해 즉시 재렌더.
// §108: threadMin은 절대 px. 구버전 저장분(threadMinRatio)은 960 기준 px로 환산 이관
const migrateLimits = (l) => ({
  unitMin: l?.unitMin ?? LIMITS.unitMin,
  threadMinPx: l?.threadMinPx ??
    (l?.threadMinRatio != null ? +(l.threadMinRatio * 960).toFixed(2) : LIMITS.threadMinPx),
});
const limitsCfg = reactive(migrateLimits(prefs.limits));
LIMITS.unitMin = limitsCfg.unitMin;
LIMITS.threadMinPx = limitsCfg.threadMinPx;
watch(limitsCfg, () => {
  LIMITS.unitMin = limitsCfg.unitMin;
  LIMITS.threadMinPx = limitsCfg.threadMinPx;
  props.actions.withGeomOp(() => {
    for (const u of props.doc.units) u.params = { ...u.params };
  });
});
watch(
  () => JSON.stringify({
    eyedropScope, grid: gridCfg, view, blend: blendCfg, arrange: arrangeCfg,
    currentColor: currentColor.value, customColor: customColor.value,
    recentColors: recentColors.value, frameQuick: frameQuickCfg,
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
// §198: 메뉴 밖 어떤 포인터 입력이든 닫기 — 캡처 단계라 툴바류(@pointerdown.stop 내부)를
// 눌러도 닫힌다 (버블 리스너였던 종전엔 FloatingBar가 stop해 안 닫혔음)
function closeCtxOutside(e) {
  if (e.target instanceof Element && e.target.closest('.ctxMenu')) return;
  closeCtx();
}
watch(ctxMenu, (open) => {
  if (open) {
    registerPopup(closeCtx); // 툴바 팝업과 전역 배타 — 어느 쪽이 열리든 남은 쪽이 닫힘
    setTimeout(() => window.addEventListener('pointerdown', closeCtxOutside, true), 0);
  } else {
    unregisterPopup(closeCtx);
    window.removeEventListener('pointerdown', closeCtxOutside, true);
  }
});
// 유닛 프리셋 등록 가능 조건: 단일 선택 + 프리셋 가능 타입 — 아니면 메뉴 항목 비활성 (§70)
// (§205: 프레임 선택 시 자동 비활성 — isPresetable이 유닛 한정)
const canRegisterPreset = computed(
  () =>
    !!ctxMenu.value &&
    props.doc.selectedIds.length === 1 &&
    isPresetable(ctxMenu.value.u)
);
function onRegisterPreset() {
  if (!canRegisterPreset.value) return;
  const p = props.actions.registerPreset(ctxMenu.value.u);
  toast(`Registered "${p.name}" — open Unit presets (bottom right)`);
  closeCtx();
}
// §205: 패턴 프리셋 등록 — 단일 프레임 선택 시에만 (유닛 프리셋의 단일 유닛 규칙과 대칭)
const canRegisterPattern = computed(
  () =>
    !!ctxMenu.value &&
    props.doc.selectedIds.length === 1 &&
    ctxMenu.value.u.type === 'frame'
);
function onRegisterPattern() {
  if (!canRegisterPattern.value) return;
  const p = props.actions.registerPattern(ctxMenu.value.u);
  if (p) toast(`Registered "${p.name}" — open Pattern presets (bottom right)`);
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
// §100: 1그룹 = delete·flip, 2그룹 = 오더
const CTX_ACTIONS = [
  { key: 'del', label: 'Delete (D)', paths: ICONS.trash },
  { key: 'flip', label: 'Flip horizontal (⇧H)', paths: ICONS.flipH },
  { key: 'flipv', label: 'Flip vertical (⇧V)', paths: ICONS.flipV },
];
// §107 잠정 숨김 (복귀 대비 보존) — 단축키 Q/W와 onCtxAction 분기는 유지
// const CTX_ORDER = [
//   { key: 'front', label: 'Bring to front (Q)' },
//   { key: 'back', label: 'Send to back (W)' },
// ];
// §236: 페어 마크 우클릭 = 프레임 직접 우클릭과 동일한 ctx 팝업 (선택 동기 포함)
function onPairContext(f, cx, cy) {
  if (!props.doc.selectedIds.includes(f.id)) {
    props.actions.setSelection([f.id]);
    props.doc.activeId = f.id;
  }
  const r = el.value.getBoundingClientRect();
  ctxMenu.value = { x: cx - r.left, y: cy - r.top, u: f };
}
// §243: 페어 인디케이터 좌클릭 = 페어 전용 미니 팝업 — §244: 언페어는 뱃지 팝업으로 **단일화**
// (ctx 팝업의 Unpair 항목 제거 — 다른 우클릭 표면엔 없는 항목이라 비직관적, 사용자 확정)
const pairMenu = ref(null); // { x, y, f } — 스테이지 로컬 px
function onPairClick(f, cx, cy) {
  if (!props.doc.selectedIds.includes(f.id)) {
    props.actions.setSelection([f.id]);
    props.doc.activeId = f.id;
  }
  const [wx, wy] = dropClientToWorld(cx, cy); // §308: 월드 앵커
  pairMenu.value = { wx, wy, f };
}
function closePairMenu() { pairMenu.value = null; }
function closePairMenuOutside(e) {
  if (isPanStart(e)) return; // §310: 팬 시작은 닫힘 트리거 아님
  if (e.target instanceof Element && e.target.closest('.pairMenu')) return;
  closePairMenu();
}
watch(pairMenu, (open) => {
  if (open) {
    registerPopup(closePairMenu);
    setTimeout(() => window.addEventListener('pointerdown', closePairMenuOutside, true), 0);
  } else {
    unregisterPopup(closePairMenu);
    window.removeEventListener('pointerdown', closePairMenuOutside, true);
  }
});
// §247: Unpair → "Detach keyframe from chain" (개념 보류·명칭 교체 — 사용자 확정)
function onUnpairFromMark() {
  const r = props.actions.unpairFrame(pairMenu.value.f.id);
  if (r) toast(`Detached "${r.name}" from chain — ${r.units} unit${r.units === 1 ? '' : 's'} released`);
  closePairMenu();
}
// §245: 키프레임 생성 = 뱃지 팝업 — §246: 용어 통일 "Make new keyframe" (페어링 용어는 UI에서 배제).
// 페어 프레임에서도 가능 — 작동시킨 프레임 기준으로 같은 계보의 새 키프레임을 복제 (사용자 확정).
// 사본은 **오른쪽 옆 공간**(간격 = 프레임 폭의 10%, 최소 24px): 연결 규칙(우→좌)의 자연 흐름과 일치.
function onMakePair() {
  const f = pairMenu.value.f;
  // §247: 생성 거리 확대 (10%→30%, 최소 100px) — 프레임 밖에 둔 페어 유닛과 사본이 겹치던 문제
  const gap = Math.max(100, Math.round(f.params.W * 0.3));
  const r = props.actions.duplicatePairedFrame(f.id, f.params.W + gap, 0);
  if (r) toast('New keyframe created — drag the right node onto its left node to connect');
  closePairMenu();
}
// §246: 키프레임 삭제 — 프레임 + home 소속 유닛 + 연결·짝 정리를 한 번에 (뱃지 팝업 전용)
function onDeleteKeyframe() {
  const f = pairMenu.value.f;
  const ownedIds = props.actions.animOwnedUnits(f.id).map((u) => u.id);
  props.actions.unpairFrame(f.id); // 짝·연결 해제 (삭제 가드 통과)
  props.actions.setSelection([f.id, ...ownedIds]);
  props.actions.deleteSelected();
  toast(`Keyframe deleted — frame & ${ownedIds.length} unit${ownedIds.length === 1 ? '' : 's'} removed`);
  closePairMenu();
}
// (§278: Select all frames in chain 폐기 — 체인 선택은 점선 합집합 영역 드래그(§252)로 충분, 사용자 확정)
function onCtxAction(key) {
  if (key === 'front' || key === 'back') doOrder(key);
  else if (key === 'flip') doFlip('h');
  else if (key === 'flipv') doFlip('v');
  else if (key === 'del') guardedDelete();
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
  // §151: 프레임은 블렌드 대상 아님 (레이아웃 컨테이너 — 등비 사본 문법이 무의미)
  if (sel.some((u) => u.type === 'frame')) {
    toast('Blend works on units — not frames');
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

// 프레임 즉시 생성 (툴 버튼 더블클릭): frameQuickCfg 크기, 스테이지 중앙 (§85)
// §201: SNS 배너 프리셋 선택 시 규격 + 안전영역 경계 그리드(컴프레션)로 생성
function onFrameQuick() {
  const r = el.value.getBoundingClientRect();
  const [cx, cy] = props.viewport.toWorld(r.width / 2, r.height / 2);
  const preset = framePresetById(frameQuickCfg.preset);
  const fill = frameQuickCfg.fill || currentColor.value || null;
  if (preset) {
    const nf = props.actions.createFrame(cx - preset.w / 2, cy - preset.h / 2, preset.w, preset.h, fill, { ...preset.grid });
    if (nf) nf.name = preset.label; // §263: SNS 프리셋 생성 = 프리셋 이름을 프레임 이름으로
  } else {
    const { w, h, margin, gutter } = frameQuickCfg;
    props.actions.createFrame(cx - w / 2, cy - h / 2, w, h, fill, { margin, gutterX: gutter, gutterY: gutter });
  }
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
  if (showManual.value) return; // §158: 도움말 오버레이 중 단축키 전면 락 (Esc는 오버레이가 처리)
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
    guardedDelete();
    return;
  }
  // D = 삭제 (Delete/Backspace와 동일)
  if (!mod && !e.shiftKey && e.code === 'KeyD' && props.doc.selectedIds.length) {
    e.preventDefault();
    guardedDelete();
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
  // 1~7 = 브랜드 컬러 (7 = VOID GREY, §125), C = 커스텀 컬러 (선택 있으면 적용, 없으면 현재 컬러 지정)
  const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
  if (!mod && !e.shiftKey && DIGITS[e.code] != null) {
    onFill(BRAND_COLORS[DIGITS[e.code]]);
    return;
  }
  if (!mod && !e.shiftKey && e.code === 'KeyC') {
    onFill(customColor.value);
    return;
  }
  // 방향키: 선택 유닛 view.nudge px 이동, Shift = 10배
  // §201: 선택에 프레임이 있으면 모드와 무관하게 소유 유닛 동반 이동 (§92 확장)
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (ARROWS[e.key] && props.doc.selectedIds.length) {
    e.preventDefault();
    const [ax, ay] = ARROWS[e.key];
    const step = (e.shiftKey ? 10 : 1) * view.nudge;
    const sel = props.doc.units.filter((x) => props.doc.selectedIds.includes(x.id));
    const carried = frameOwnedUnits(sel.filter((x) => x.type === 'frame').map((x) => x.id))
      .filter((o) => !sel.includes(o));
    if (carried.length) {
      props.actions.withGeomOp(() => {
        for (const x of [...sel, ...carried]) { x.x += ax * step; x.y += ay * step; }
      });
    } else {
      props.actions.nudgeSelected(ax * step, ay * step);
      setLast(`nudge ${ax * step || ''}${ax ? 'px x' : ''}${ay * step || ''}${ay ? 'px y' : ''}`.trim(),
        () => props.actions.nudgeSelected(ax * step, ay * step));
    }
    return;
  }
  // V = 선택 도구 복귀 (§241: §233의 재입력 토글은 일시 해제 — 우클릭 전환만 유지)
  if (!mod && !e.shiftKey && e.code === 'KeyV') {
    mode.value = 'select';
    return;
  }
  // §223: A = 애니메이션 모드 토글 (§203에서 예약해 둔 키)
  if (!mod && !e.shiftKey && e.code === 'KeyA') {
    toggleAnimMode();
    return;
  }
  // §210: 프리셋 패널 단축키 — U = 유닛, P = 패턴 (재입력 = 닫기)
  if (!mod && !e.shiftKey && e.code === 'KeyU') togglePresetPanel('units');
  if (!mod && !e.shiftKey && e.code === 'KeyP') togglePresetPanel('patterns');
  // (§279: 스포이드 잠정 숨김 — 멀티 링크 정착으로 사용처 축소, I 단축키·툴바 버튼 동시 비활성. 복귀 대비 보존)
  // if (!mod && !e.shiftKey && e.code === 'KeyI') mode.value = 'eyedrop';
  if (!mod && !e.shiftKey && e.code === 'KeyF') mode.value = 'frame';
  if (!mod && !e.shiftKey && e.code === 'KeyB') onBlend();
  if (!mod && !e.shiftKey && e.code === 'KeyG') toggleAllGrids(); // §145: G = 그리드 보기 토글 (arrange 단축키 삭제)
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
  } else if (e.button === 0 && mode.value === 'frame') {
    const [wx, wy] = props.viewport.toWorld(...local(e));
    beginDrag(e, { kind: 'framedraw', wx, wy });
  } else if (e.button === 0) {
    const [lx, ly] = local(e);
    // §270: Shift+마퀴 = 기존 선택에 합산 — 시작 시 선택 스냅샷 보관 (드래그 중 setSelection이 갈아끼우므로)
    beginDrag(e, { kind: 'marquee', lx, ly, base: [...props.doc.selectedIds] });
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
  if (mode.value === 'frame') {
    // 그리기 모드: 유닛 위에서도 새 직사각형 드래그 시작
    const [wx, wy] = props.viewport.toWorld(...local(e));
    beginDrag(e, { kind: 'framedraw', wx, wy });
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
    let srcIds = inMulti ? [...props.doc.selectedIds] : [...members];
    // 프레임 복제 = 내용물 포함 (§92 확정 사양, §201: V 모드에서도 동일)
    const frameIds = srcIds.filter((id) => props.doc.units.find((x) => x.id === id)?.type === 'frame');
    for (const o of frameOwnedUnits(frameIds)) if (!srcIds.includes(o.id)) srcIds.push(o.id);
    // §245: 미페어 프레임의 opt-드래그 = 일반 복제 (페어링 진입은 뱃지 Make new keyframe).
    // §247: **이미 키프레임인 프레임**의 opt-드래그 = 키프레임 복제 복원 — 같은 계보의 새 키프레임
    if (u.type === 'frame' && u.pair != null) {
      const r = props.actions.duplicatePairedFrame(u.id);
      targets = r ? r.copies : [props.actions.duplicateFrom(u)];
      if (r) toast('New keyframe copy — drag the right node onto a left node to connect');
    } else {
      targets =
        srcIds.length > 1
          ? props.actions.duplicateUnits(props.doc.units.filter((x) => srcIds.includes(x.id)))
          : [props.actions.duplicateFrom(u)];
    }
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
  // 프레임 이동 = 소유 유닛 동반 (§92, §201: V 모드에서도) — 복제 드래그는 위에서 이미 사본에 포함됨
  // §294: 동반 규칙은 expandMoveTargets 단일 경로 (§92 프레임 + §245 페어 home + §278 도크 체인)
  if (!e.altKey) targets = expandMoveTargets(targets);
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
  else if (key === 'dup') {
    // §201: 선택에 프레임이 있으면 모드와 무관하게 내용물 포함 복제
    const hasFrame = props.doc.units.some((u) => props.doc.selectedIds.includes(u.id) && u.type === 'frame');
    if (hasFrame) dupFramesWithContents();
    else props.actions.duplicateSelectedOffset();
  }
  else if (key === 'del') guardedDelete();
}

// 프레임 복제 (오버레이 dup 버튼): 내용물 포함 + 40px 오프셋 (§92, §201: 혼합 선택도 전체 복제)
function dupFramesWithContents() {
  const sel = props.doc.units.filter((u) => props.doc.selectedIds.includes(u.id));
  const frames = sel.filter((u) => u.type === 'frame');
  if (!frames.length) return;
  const owned = frameOwnedUnits(frames.map((f) => f.id)).filter((o) => !sel.includes(o));
  const copies = props.actions.duplicateUnits([...sel, ...owned]);
  props.actions.withGeomOp(() => {
    for (const c of copies) { c.x += 40; c.y += 40; }
  });
  props.actions.setSelection(copies.filter((c) => c.type === 'frame').map((c) => c.id));
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
  if (drag.kind === 'framedraw') {
    const [wx, wy] = props.viewport.toWorld(...local(e));
    framePreview.value = {
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
    // §245: 완전 포함 규칙 (피그마식) — 유닛 모드에서도 마퀴가 프레임을 **통째로 덮으면** 프레임 선택
    // (일부만 걸치면 유닛만 — 프레임 위 유닛 멀티선택과 충돌 없음). ⌘ 드래그 = 유닛만 강제.
    const fullIn = (u) => u.x >= wx1 && u.x + u.params.W <= wx2 && u.y >= wy1 && u.y + u.params.H <= wy2;
    const unitsOnly = e.metaKey || e.ctrlKey;
    const ids = props.doc.units
      .filter((u) => (frameMode.value ? u.type === 'frame' : u.type !== 'frame' || (!unitsOnly && fullIn(u))))
      .filter((u) => u.x < wx2 && u.x + u.params.W > wx1 && u.y < wy2 && u.y + u.params.H > wy1)
      .map((u) => u.id);
    // §270: Shift = 시작 시점 선택과 합산 (피그마식 additive 마퀴)
    const merged = e.shiftKey && drag.base?.length ? [...new Set([...drag.base, ...ids])] : ids;
    props.actions.setSelection(props.actions.expandGroups(merged));
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
    // §306: 그룹 리사이즈도 링크 앵커 공유(§205) — 단일 리사이즈와 동일 문법. 미설정 시
    // 링크 전파(applyLinkPatch)가 로컬 원점 고정으로 떨어져, A·B 두 그룹을 함께 스케일할 때
    // 미선택 멤버의 오리엔테이션 앵커가 단일 조작 때와 달라지던 문제 (사용자 리포트)
    if (activeUnit.value) {
      const ax = e.altKey ? 0.5 : dir.includes('w') ? 1 : dir.includes('e') ? 0 : 0.5;
      const ay = e.altKey ? 0.5 : dir.includes('n') ? 1 : dir.includes('s') ? 0 : 0.5;
      props.actions.setLinkResizeAnchor(canvasPointToLocal(activeUnit.value.params, ax, ay));
    }
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
    // 드래그 데드존 (§104): 화면 4px를 넘기 전엔 클릭으로 취급 — 이동 미시작 (OS·피그마 관례)
    // 통과 후엔 down 지점 기준 delta 그대로 적용 (미세 점프는 지각 불가 수준)
    if (!drag.armed) {
      // §147: 4px 맨해튼 → 6px 유클리드 반경 — 클릭 시 미세 떨림(트랙패드 포함)의 드래그 오인 축소.
      // 방향 무관 동일 반경이라 대각 이동도 일관되게 판정.
      const ax = e.clientX - drag.sx;
      const ay = e.clientY - drag.sy;
      if (ax * ax + ay * ay < 36) return;
      drag.armed = true;
    }
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
    // 프레임 셀렉 모드: 스냅 후보를 프레임으로 한정 — 유닛 엣지에 안 들러붙게 (§123)
    // §298: 프레임을 끌고 있을 때도 동일 — 프레임 선택 이동은 **프레임끼리만** 스냅 (사용자 확정)
    // + 뷰포트 컬링(§126-1): 화면에 보이는 오브젝트만
    const vr = viewWorldRect();
    const framesOnly = frameMode.value || drag.targets.some((t) => t.u.type === 'frame');
    const others = props.doc.units.filter(
      (u) => !drag.targets.some((t) => t.u === u)
        && (!framesOnly || u.type === 'frame')
        && inView(u, vr)
    );
    const mineX = [minX, (minX + maxX) / 2, maxX];
    const mineY = [minY, (minY + maxY) / 2, maxY];
    let bestX = null, bestY = null;
    for (const o of others) {
      const { ox, oy } = snapPointsOf(o); // 후보 규칙 단일 소스 (§126)
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
    // §263: 그리드 스냅 on = **그리드가 지배** (스마트 엣지/등간격보다 우선 — 사용자 확정
    // "더 강하게". 종전엔 스마트가 없는 축만 격자에 붙어 체감이 약했음). 가이드도 생략.
    if (gridCfg.snap) {
      sdx = dx + Math.round(minX / gridCfg.size) * gridCfg.size - minX;
      sdy = dy + Math.round(minY / gridCfg.size) * gridCfg.size - minY;
      bestX = null; bestY = null; gapX = null; gapY = null;
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
  // §205: 링크 앵커 공유 — 지금 잡은 앵커(반대편 변/중심)를 활성의 로컬 좌표로 환산해 전달.
  // 미러 워처가 이 값으로 링크 멤버들을 각자 오리엔트에 맞는 "논리적 동일 앵커"에 고정한다.
  {
    const ax = e.altKey ? 0.5 : dir.includes('w') ? 1 : dir.includes('e') ? 0 : 0.5;
    const ay = e.altKey ? 0.5 : dir.includes('n') ? 1 : dir.includes('s') ? 0 : 0.5;
    props.actions.setLinkResizeAnchor(canvasPointToLocal(p, ax, ay));
  }
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

// ── 스마트 스냅 후보 필터 (§126) — 이동·리사이즈·프레임 드로우 공용 ──
// (1) 뷰포트 컬링: 화면에 보이는 오브젝트만 후보 (상시)
function viewWorldRect() {
  const r = el.value.getBoundingClientRect();
  const [x0, y0] = props.viewport.toWorld(0, 0);
  const [x1, y1] = props.viewport.toWorld(r.width, r.height);
  return { x0, y0, x1, y1 };
}
function inView(o, vr) {
  return o.x + o.params.W >= vr.x0 && o.x <= vr.x1 && o.y + o.params.H >= vr.y0 && o.y <= vr.y1;
}
// ── §127 실험 필터 (써보고 취소 가능 — 이 두 상수와 아래 snapPointsOf 분기 외에는 아무 데도 안 얽힘) ──
// (2) 극소 오브젝트 축소: 해당 축의 화면 크기가 이 값(px) 미만이면 엣지 3점 대신 중심 1점만. 0 = 비활성
const SNAP_TINY_SCREEN = 8;
// (3) 프레임 그리드 게이팅: 프레임의 화면 크기(짧은 변)가 이 값(px) 이상일 때만 그리드 라인 후보. 0 = 비활성
const SNAP_GRID_MIN_SCREEN = 120;

// 오브젝트 1개의 스냅 후보 좌표 — 엣지/센터(x·y 각 3) + 프레임 레이아웃 그리드 라인
function snapPointsOf(o) {
  const sw = o.params.W * vp.scale; // 화면 크기 (§127 판정용)
  const sh = o.params.H * vp.scale;
  const tinyX = SNAP_TINY_SCREEN && sw < SNAP_TINY_SCREEN;
  const tinyY = SNAP_TINY_SCREEN && sh < SNAP_TINY_SCREEN;
  const ox = tinyX ? [o.x + o.params.W / 2] : [o.x, o.x + o.params.W / 2, o.x + o.params.W];
  const oy = tinyY ? [o.y + o.params.H / 2] : [o.y, o.y + o.params.H / 2, o.y + o.params.H];
  if (
    o.type === 'frame' && o.params.gridOn &&
    (!SNAP_GRID_MIN_SCREEN || Math.min(sw, sh) >= SNAP_GRID_MIN_SCREEN)
  ) {
    const gl = frameGridLines(o.params);
    ox.push(o.x + gl.bx, o.x + gl.bx + gl.bw, ...gl.v.map((x) => o.x + x)); // §309: 비대칭 마진 박스
    oy.push(o.y + gl.by, o.y + gl.by + gl.bh, ...gl.h.map((y) => o.y + y));
  }
  return { ox, oy };
}

// 리사이즈 중 이동하는 엣지를 다른 유닛의 엣지/센터에 스냅
function snapEdge(axis, pos, excludeUnits, SNAP) {
  let best = null;
  const vr = viewWorldRect(); // §126-1
  // §298: 프레임을 조작 중이면(리사이즈 대상에 프레임 포함) 프레임끼리만 — 이동 스냅과 동일 규칙
  const framesOnly = frameMode.value || excludeUnits.some((u) => u.type === 'frame');
  for (const o of props.doc.units) {
    if (excludeUnits.includes(o)) continue;
    if (framesOnly && o.type !== 'frame') continue; // 프레임 셀렉 모드·프레임 조작: 프레임끼리만 (§123·§298)
    if (!inView(o, vr)) continue;
    const pts = snapPointsOf(o);
    const cands = axis === 'x' ? pts.ox : pts.oy;
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

// §209: 이동 드래그를 프리셋 카드 위에서 놓으면 그 프리셋을 현재 오브젝트로 덮어쓴다.
// 처리 시 오브젝트는 원위치로 복귀 (이동이 아니라 업데이트 제스처). 복제 드래그(alt)는 제외.
function dropOnPresetCard(e) {
  if (!presetPanel.value || drag.kind !== 'move' || drag.altDup) return false;
  const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.pCard');
  if (!card) return false;
  const pid = card.dataset.pid;
  for (const t of drag.targets) { t.u.x = t.x0; t.u.y = t.y0; } // 원위치 복귀
  const frames = drag.targets.filter((t) => t.u.type === 'frame');
  const units = drag.targets.filter((t) => t.u.type === 'unit');
  if (presetPanel.value === 'units') {
    if (units.length === 1 && !frames.length) {
      const r = props.actions.presetUpdate(pid, units[0].u.params);
      toast(r ? `Updated preset "${r.name}"` : 'Default Unit cannot be overwritten');
    } else {
      toast('Drop a single unit to update a preset');
    }
  } else if (frames.length === 1) {
    // 프레임 드래그는 내용물이 동반되므로 frames 1개면 패턴 갱신 대상
    const r = props.actions.patternUpdate(pid, props.actions.capturePattern(frames[0].u.id));
    toast(r ? `Updated pattern "${r.name}"` : 'Could not update that pattern');
  } else {
    toast('Drop a single frame to update a pattern');
  }
  return true;
}

function onUp(e) {
  if (drag && dropOnPresetCard(e)) {
    drag = null;
    keyCandidate = null;
    smartGuides.value = [];
    gapGuides.value = [];
    window.removeEventListener('pointermove', onMove);
    return;
  }
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
      props.actions.setLinkResizeAnchor(null); // §205: 링크 앵커 공유 종료 → 기본(로컬 원점) 복귀
      props.actions.setSize({}); // W 변경에 따른 파생 제약 정리 (거터 클램프)
    } else if (drag.kind === 'resizeg') {
      props.actions.setLinkResizeAnchor(null); // §306: 공유 앵커 종료 (단일 경로와 동일)
      props.actions.normalizeSelected();
    } else if (drag.kind === 'marquee') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      if (moved < 4 && !e.shiftKey) props.actions.deselect(); // 제자리 클릭 = 해제 (§270: Shift 클릭은 유지)
      marquee.value = null;
    } else if (drag.kind === 'framedraw') {
      const moved = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
      const fill = currentColor.value || null;
      if (moved < 4) {
        props.actions.createFrame(drag.wx, drag.wy, 300, 200, fill); // 클릭 = 기본 크기
      } else if (framePreview.value) {
        const r = framePreview.value;
        props.actions.createFrame(r.x, r.y, r.w, r.h, fill);
      }
      framePreview.value = null;
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
  Object.assign(arrangeCfg, migrateArrange(p2.arrange));
  if (p2.currentColor !== undefined) currentColor.value = p2.currentColor;
  if (p2.customColor) customColor.value = p2.customColor;
  if (Array.isArray(p2.recentColors)) recentColors.value = p2.recentColors;
  Object.assign(frameQuickCfg, p2.frameQuick || p2.rectQuick || {});
  Object.assign(saveScope, p2.saveScope || {});
  Object.assign(openScope, p2.openScope || {});
  Object.assign(limitsCfg, migrateLimits({ ...limitsCfg, ...(p2.limits || {}) }));
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('eo:prefs', applyPrefsFromStorage);
  measurePresetW(); // §224
  window.addEventListener('resize', measurePresetW);
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
  window.removeEventListener('resize', measurePresetW); // §224
});
</script>

<template>
  <div
    ref="el"
    class="stage"
    :class="{ panning: spaceHeld, eyedrop: mode === 'eyedrop', framedraw: mode === 'frame', framesel: frameMode && mode === 'select', unitsel: !frameMode && mode === 'select' }"
    :style="{
      ...(view.guideColor ? { '--unit-guide': view.guideColor } : {}),
      ...(view.stageGridColor ? { '--stage-grid': view.stageGridColor } : {}),
      ...(view.stageBgColor ? { background: view.stageBgColor, '--label-halo': view.stageBgColor } : {}),
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
      <!-- 저배율 페이드 (§91): 15%→5% 선형 감쇠, 바닥 0.15 — 극저배율에서 격자 노이즈 완화 -->
      <rect
        v-if="showStageGrid" class="gridbg" width="100%" height="100%" fill="url(#stage-grid)"
        :opacity="vp.scale >= 0.15 ? 1 : 0.15 + (Math.max(0, vp.scale - 0.05) / 0.1) * 0.85"
      />
      <g :transform="`translate(${vp.x} ${vp.y}) scale(${vp.scale})`">
        <!-- 프레임 모드 (§94): 유닛 g 전체 패스스루 — 유닛 도형 위 클릭도 아래 프레임으로 통과 -->
        <g
          v-for="u in zOrdered" :key="u.id" :transform="`translate(${u.x} ${u.y})`"
          :style="mode === 'select' && frameMode && u.type !== 'frame' ? { pointerEvents: 'none' } : null"
        >
          <FrameGraphic v-if="u.type === 'frame'" :params="u.params" :show-grid="showFrameGrid" />
          <UnitGraphic
            v-else
            :params="u.params"
            :show-guides="showGuides && doc.selectedIds.includes(u.id)"
            :seam-width="seamW"
            :docked-ends="dockAttached.get(u.id) || null"
          />
          <!-- 패스스루 (§92): 일반 커서 = 프레임 무시, 프레임 모드 = 유닛 무시 (그리기/스포이드 모드는 전부 활성) -->
          <!-- §244: 프레임 히트 = hitFrame — 유닛 우선 모드에서도 호버 시 그룹(BBox) 커서 -->
          <rect
            class="hit" :class="{ hitFrame: u.type === 'frame' }"
            :width="u.params.W" :height="u.params.H"
            fill="transparent"
            :style="{ pointerEvents: hitPointerEvents(u) }"
            @pointerdown.stop="onUnitDown(u, $event)"
            @contextmenu.prevent.stop="onUnitContext(u, $event)"
          />
        </g>
        <!-- §284: 도크 브리지 — 결착 갭을 샤프트 연장으로 메움 (도킹의 본래 목적: 한 축으로 이어진 룩) -->
        <!-- §287: seam 동반 — 유닛 도형은 봉합 스트로크(seamW)로 실두께가 D+seam이라
             브리지만 1px쯤 얇아 보이던 것. 같은 fill 스트로크를 입혀 동일 보정 -->
        <polygon
          v-for="(bp, bi) in stageBridges" :key="'db' + bi"
          class="dockBridge"
          :points="bp.pts.map((p) => `${p[0]},${p[1]}`).join(' ')"
          :fill="bp.fill"
          :stroke="seamW > 0 ? bp.fill : 'none'" :stroke-width="seamW"
        />
        <!-- §289·§290: 브리지 그리드 표시 = 그리드 컬러 60% 면으로 덮기 (사용자 확정 — 테두리/십자 폐기) -->
        <polygon
          v-for="(gq, gi) in stageBridgeGuides" :key="'dg' + gi"
          class="dockBridgeGuide"
          :points="gq.pts.map((p) => `${p[0]},${p[1]}`).join(' ')"
        />
        <!-- 그룹 표시: 점선 아웃라인 (선택 시, 바운딩박스·그룹 표시 토글 적용) -->
        <template v-if="showBBox && view.showGroups">
          <rect
            v-for="(g, i) in groupOutlines" :key="'go' + i"
            class="groupLine"
            :x="g.x" :y="g.y" :width="g.w" :height="g.h"
          />
        </template>
        <!-- §278 → §283: 도크 배지 = 페어 인디케이터 문법(원 안 글리프) + 클릭 = Undock 팝업
             §246: 프레임 다중선택 중엔 숨김 — 프레임 단위 조작 중 유닛 배지는 소음 -->
        <g
          v-for="u in view.showLinks && !multiFrameSel ? doc.units.filter((x) => dockBadgeIds.has(x.id)) : []"
          :key="'dk' + u.id"
          class="dockMark"
          :transform="`translate(${u.x + u.params.W - pxs(9)} ${u.y - pxs(12)})`"
          @pointerdown.stop.prevent="(ev) => { if (ev.button === 0) onDockBadgeClick(u, ev.clientX, ev.clientY); }"
        >
          <circle class="bg" :r="pxs(8)" />
          <g :transform="`translate(${-pxs(5.5)} ${-pxs(5.5)}) scale(${pxs(11) / 24})`">
            <path v-for="(d, pi) in ICONS.link" :key="pi" :d="d" />
          </g>
        </g>
        <!-- §279: LINK 칩 호버 하이라이트 — 그 범주 링크 상대 = 딤드 네온 아웃라인 (§254 문법 재사용) -->
        <rect
          v-for="u in hoverLinkUnits" :key="'hl' + u.id"
          class="hoverLinkHl"
          :x="u.x" :y="u.y" :width="u.params.W" :height="u.params.H"
        />
        <!-- §280: 도킹 노드 — 비애니 모드 + **선택 유닛만**, 샤프트 축 위 원형 노드
             (애니 노드 = 프레임·애니 모드와 모드/대상 분리). 양쪽 노드 모두 드래그 시작 가능,
             타깃 = 다른 선택 유닛의 반대쪽 노드 / 빈 곳 드롭 = 그 노드 해제 -->
        <template v-if="!animMode">
          <g v-for="u in dockNodeUnits" :key="'dn' + u.id">
            <circle
              v-for="side in ['left', 'right']" :key="side"
              class="dockNode"
              :class="{
                target: dockTargetOf(u),
                docked: selDockAttached.get(u.id)?.[side],
              }"
              :cx="dockPt(u, side)[0]" :cy="dockPt(u, side)[1]" :r="pxs(6.5)"
              @pointerdown.stop.prevent="(ev) => { if (ev.button === 0) onDockNodeDown(u, side); }"
            />
          </g>
          <line
            v-if="dockDrag"
            class="dockWire"
            :x1="dockDrag.x1" :y1="dockDrag.y1" :x2="dockDrag.x" :y2="dockDrag.y"
          />
        </template>
        <!-- §252: 체인 선택 이동 히트 — 합집합 영역 내 아무 곳이나 드래그 = 전체 이동.
             유닛 히트 **위**·애니 노드/와이어 **아래** 삽입: 선택 중 유닛 편집은 차단, 애니 조작은 유지 -->
        <rect
          v-if="animSelBounds && animSelFrames.length >= 2"
          class="chainSelHit"
          :x="animSelBounds.x" :y="animSelBounds.y" :width="animSelBounds.w" :height="animSelBounds.h"
          @pointerdown.stop.prevent="onChainAreaDown"
        />
        <!-- §223: 애니메이션 오버레이 — 프레임 노드 + 키프레임 와이어 (Phase B) -->
        <AnimOverlay
          v-if="animOverlayOn"
          :units="doc.units"
          :edges="doc.animEdges"
          :scale="vp.scale"
          :client-to-world="dropClientToWorld"
          :selected-edge="selEdge"
          :dimmed="!animMode"
          :selected-ids="doc.selectedIds"
          :show-badges="view.showAnimBadges !== false"
          :view-rect="animViewRect"
          @connect="(f, t) => { // §257: 연결 = 키프레임끼리만 — 미페어 프레임은 실패 + 안내
            const a = doc.units.find((x) => x.id === f);
            const b = doc.units.find((x) => x.id === t);
            if (a?.pair == null || b?.pair == null) { toast('Not a keyframe — use Make keyframe (▶ badge) on both frames first'); return; }
            const e = props.actions.connectAnim(f, t);
            if (e) { animEdgeSel = edgeKey(e); toast('Keyframes connected — ease in-out · 1s'); } }"
          @disconnect="(f, side) => { if (props.actions.disconnectAnim(f, side)) toast('Keyframe connection removed'); }"
          @edge-click="onEdgeClick"
          @edge-select="(e) => { props.actions.setSelection([]); animEdgeSel = edgeKey(e); }"
          @pair-context="onPairContext"
          @pair-click="onPairClick"
        />
        <!-- §201: 프레임 이름 라벨 (피그마식) — 좌상단 바깥, 화면 고정 크기.
             클릭/드래그 = 유닛이 가득해도 프레임 우선 선택·이동 (핸들러는 프레임 공용 경로)
             §204: 투명 히트 패드로 호버/클릭 영역 확장 (글리프 박스만으론 너무 좁음) -->
        <g
          v-for="{ f, label, w, row } in frameLabels"
          :key="'fl' + f.id"
          class="frameLabelG"
          :class="{ sel: doc.selectedIds.includes(f.id) }"
          :transform="`translate(${f.x} ${f.y - pxs(row * 16)})`"
          @pointerdown.stop="onUnitDown(f, $event)"
          @dblclick.stop="startFrameNameEdit(f)"
          @contextmenu.prevent.stop="onUnitContext(f, $event)"
        ><!-- §279: 라벨 우클릭 = 프레임 본체와 동일 ctx 팝업 -->
          <rect
            class="labelPad"
            :x="-pxs(6)" :y="-pxs(22)"
            :width="pxs(w)" :height="pxs(24)"
          />
          <text class="frameLabel" :x="0" :y="-pxs(6)" :font-size="pxs(11)">{{ label }}</text>
        </g>
        <!-- 활성 프레임 표시 (§134): 바깥 아웃라인 — difference 블렌드로 밝은/어두운 배경 모두 가시 -->
        <!-- §239: 애니 모드에선 비표시 — difference 블렌드가 체인 하이라이트(액센트)를 어둡게 오염 -->
        <rect
          v-if="activeFrameRect && !animMode"
          class="activeFrameOutline"
          :x="activeFrameRect.x" :y="activeFrameRect.y"
          :width="activeFrameRect.w" :height="activeFrameRect.h"
        />
        <!-- 정렬 키 오브젝트: 두꺼운 스트로크 하이라이트 -->
        <rect
          v-if="showBBox && keyRect"
          class="keySel"
          :x="keyRect.x" :y="keyRect.y"
          :width="keyRect.w" :height="keyRect.h"
        />
        <!-- §245: 애니 모드 — 선택에 **페어** 프레임이 있으면 핸들(bbox) 대신 프레임별 선택
             아웃라인 (스케일/회전 = 애니 에러 소지라 핸들 숨김은 유지, 이동 피드백은 프레임마다) -->
        <rect
          v-for="f in animSelFrames"
          :key="'ps' + f.id"
          class="pairSel"
          :x="f.x" :y="f.y" :width="f.params.W" :height="f.params.H"
        />
        <!-- §252: 체인 선택 — 합집합 점선 테두리 (멀티 선택 시, 그립은 §251에서 폐기) -->
        <rect
          v-if="animSelBounds && animSelFrames.length >= 2"
          class="chainSelBox"
          :x="animSelBounds.x" :y="animSelBounds.y" :width="animSelBounds.w" :height="animSelBounds.h"
        />
        <!-- 멀티선택/그룹: 통합 바운딩 박스 + 리사이즈 핸들 — §245: 애니 모드 숨김은 **페어 프레임**
             포함 시에만 (미페어 프레임은 애니 모드에서도 일반 bbox = 비애니 모드와 동일 문법) -->
        <GroupOverlay
          v-if="showBBox && selBounds && !(animMode && doc.selectedIds.some((id) => { const x = doc.units.find((v) => v.id === id); return x?.type === 'frame' && x?.pair != null; }))"
          :bounds="selBounds"
          :label="groupLabel"
          :scale="vp.scale"
          @resize-start="onGroupResizeStart"
          @rotate-start="(e) => onRotateStart(e, true)"
          @action="onGroupAction"
        />
        <SelectionOverlay
          v-if="showBBox && singleSelected && activeUnit && !(animMode && activeUnit.type === 'frame' && activeUnit.pair != null)"
          :unit="activeUnit"
          :show-name="view.showSelName !== false"
          :scale="vp.scale"
          @resize-start="onResizeStart"
          @rotate-start="onRotateStart"
          @flip="actions.flipUnit()"
          @flipv="actions.flipUnitV()"
          @dup="actions.duplicateActive()"
          @del="guardedDelete()"
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
          v-if="framePreview"
          class="rectDraw"
          :x="framePreview.x" :y="framePreview.y" :width="framePreview.w" :height="framePreview.h"
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
      :frame-quick-cfg="frameQuickCfg"
      :frame-mode="frameMode"
      @fill="onFill"
      @blend="onBlend"
      @arrange="onArrange"
      @frame-quick="onFrameQuick"
      @toggle-frame-mode="toggleFrameModeManual"
      @update:custom-color="(c) => (customColor = c)"
    />
    <FileBar
      :view="view"
      :save-scope="saveScope"
      :open-scope="openScope"
      @save="actions.saveProject({ ...saveScope })"
      @open="(f) => actions.openProject(f, { ...openScope })"
      @reset="onReset"
      @manual="showManual = true"
    />
    <ManualOverlay v-if="showManual" @close="showManual = false" />
    <ResourceMonitor v-if="view.resMon" :count="doc.units.length" />
    <AlignBar :active="alignActive" :dist-active="distActive" @align="onAlign" />
    <!-- §210: 패널이 열려 있을 땐 툴팁 억제 — 네임카드가 패널 모서리로 삐져나오는 것 방지 -->
    <ManagerBar :panel="presetPanel" :tips-off="!!presetPanel" :anim="animMode" @toggle-panel="togglePresetPanel" @toggle-anim="toggleAnimMode" />
    <!-- §224: 애니메이션 창 (Phase C) — 좌하단, 시뮬레이션 재생 (엣지 타이밍은 와이어 컨트롤) -->
    <AnimWindow
      v-if="animMode"
      :edge="selEdge"
      :from-frame="animFrom" :to-frame="animTo"
      :from-units="animFromUnits" :to-units="animToUnits"
      :docks="doc.docks"
    />
    <!-- §224: 와이어 중앙 컨트롤 팝업 — 엣지 소속 파라미터 (duration·곡선 프리셋) -->
    <div
      v-if="animEdgePopup && selEdge"
      class="edgeMenu"
      :style="{ left: worldToLocal(animEdgePopup.wx, animEdgePopup.wy)[0] + 12 + 'px', top: worldToLocal(animEdgePopup.wx, animEdgePopup.wy)[1] + 12 + 'px' }"
      @pointerdown.stop
    >
      <div class="menuTitle">Keyframe timing</div>
      <label class="menuRow">
        <span class="rowLabel">Duration</span>
        <span class="durWrap">
          <input
            class="durInput" type="number" min="100" max="60000" step="100"
            :value="selEdge.duration"
            @change="(e) => { selEdge.duration = Math.max(100, Math.min(60000, Number(e.target.value) || 1000)); }"
            @keydown.enter.stop.prevent="(e) => { selEdge.duration = Math.max(100, Math.min(60000, Number(e.target.value) || 1000)); e.target.blur(); }"
            @keydown.stop
          /> ms
        </span>
      </label>
      <div class="menuRow curves">
        <span class="rowLabel">Curve</span>
      </div>
      <div class="curveGrid">
        <button
          v-for="cp in CURVE_PRESETS" :key="cp.key"
          class="curveBtn" :class="{ on: sameCurve(selEdge.curve, cp.curve) }"
          :title="cp.label"
          @click="selEdge.curve = [...cp.curve]"
        >
          <svg viewBox="0 0 24 20"><path :d="cp.icon" /></svg>
        </button>
      </div>
    </div>
    <!-- §205·§207·§221: 프리셋 플로팅 창 — 내부 상호작용은 PresetFloatWindow가 전담 -->
    <PresetFloatWindow
      v-if="presetPanel"
      :width="presetW"
      :panel="presetPanel"
      :presets="presets" :preset-folders="presetFolders"
      :patterns="patterns" :pattern-folders="patternFolders"
      :actions="props.actions"
      :center-world="panelCenterWorld"
      :client-to-world="dropClientToWorld"
      @toast="toast"
    />
    <ZoomBadge
      :scale="vp.scale"
      :guides="showGuides || showFrameGrid"
      :unit-grid="showGuides"
      :frame-grid="showFrameGrid"
      :stage-grid="showStageGrid"
      :bbox="showBBox"
      :grid-cfg="gridCfg"
      :limits="limitsCfg"
      :view="view"
      :units="doc.units"
      :vpos="vp"
      :stage-size="stageSize"
      @reset="resetZoom"
      @fit-all="fitAllView"
      @jump-to="jumpToWorld"
      @toggle-guides="toggleAllGrids"
      @toggle-unit-grid="showGuides = !showGuides"
      @toggle-frame-grid="showFrameGrid = !showFrameGrid"
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
      <!-- §279: 프레임 대상이면 flip 2종 비활성 (사용자 확정) -->
      <button
        v-for="a in CTX_ACTIONS" :key="a.key"
        class="ctxItem"
        :class="{ off: ctxMenu.u.type === 'frame' && (a.key === 'flip' || a.key === 'flipv') }"
        :disabled="ctxMenu.u.type === 'frame' && (a.key === 'flip' || a.key === 'flipv')"
        @click="onCtxAction(a.key)"
      ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in a.paths" :key="d" :d="d" /></svg>{{ a.label }}</button>
      <!-- 오더 그룹(CTX_ORDER)은 §107에서 잠정 숨김 — 단축키 Q/W는 유지, 복귀 대비 정의 보존 -->
      <div class="ctxSep" />
      <button
        class="ctxItem" :class="{ off: !canRegisterPreset }"
        :disabled="!canRegisterPreset"
        @click="onRegisterPreset"
      ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.presetAdd" :key="d" :d="d" /></svg>Register unit preset</button>
      <button
        class="ctxItem" :class="{ off: !canRegisterPattern }"
        :disabled="!canRegisterPattern"
        @click="onRegisterPattern"
      ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.patternAdd" :key="d" :d="d" /></svg>Register pattern preset</button>
      <!-- (§235의 Unpair 항목은 §244에서 페어 뱃지 클릭 팝업으로 단일화 — 다른 우클릭 표면과 구성 통일) -->
      <div class="ctxSep" />
      <!-- §152: ⌘C와 동일하게 내부 클립보드도 채움 (라벨 패리티) -->
      <button class="ctxItem" @click="actions.copyActive(); onCopySvg(); closeCtx()"><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.duplicate" :key="d" :d="d" /></svg>Copy as SVG (⌘C)</button>
      <button class="ctxItem" @click="onCopyPng(); closeCtx()"><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.imagePng" :key="d" :d="d" /></svg>Copy as PNG (⌘⇧C)</button>
      <button class="ctxItem" @click="actions.exportSvg(); closeCtx()"><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.exportSvg" :key="d" :d="d" /></svg>Export SVG file (⇧E)</button>
    </div>
    <!-- §283: 도크 배지 클릭 = Undock 미니 팝업 (페어 인디케이터 문법) -->
    <div
      v-if="dockMenu"
      class="ctxMenu pairMenu"
      :style="{ left: worldToLocal(dockMenu.wx, dockMenu.wy)[0] + 'px', top: worldToLocal(dockMenu.wx, dockMenu.wy)[1] + 'px' }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <!-- §288 → §290: Gutter Compensation — 자동 평균에 더하는 ±px 단일 필드 (화살표 1px)
           §291: 잠정 숨김 (사용자 확정 — setDockComp·comp 데이터·짝 복제 로직은 보존) -->
      <template v-if="false">
      <div v-for="(row, ri) in dockMenuEdges" :key="row.e.from + '-' + row.e.to" class="dockGapRow">
        <svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.link" :key="d" :d="d" /></svg>
        <span class="dockGapLabel">Gutter compensation{{ dockMenuEdges.length > 1 ? ' ' + (ri + 1) : '' }}</span>
        <StepField
          :model-value="row.comp" :min="-2000" :max="2000" :step="1" suffix="px"
          @update:model-value="(v) => props.actions.setDockComp(row.e.from, row.e.to, v)"
        />
      </div>
      </template><!-- §289: 구분선 폐기 · §291: 보정 행 숨김 -->
      <button
        class="ctxItem"
        @click="onUndockFromBadge"
      ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.detach" :key="d" :d="d" /></svg>Undock</button>
    </div>
    <!-- §243: 페어 인디케이터 클릭 = 페어 전용 미니 팝업 — §245: 미페어 = Make / 페어 = Select chain·Unpair -->
    <div
      v-if="pairMenu"
      class="ctxMenu pairMenu"
      :style="{ left: worldToLocal(pairMenu.wx, pairMenu.wy)[0] + 'px', top: worldToLocal(pairMenu.wx, pairMenu.wy)[1] + 'px' }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <!-- §246·§247: 순서 = Make → Delete → Detach → Select chain (사용자 확정 1432) -->
      <button
        class="ctxItem"
        @click="onMakePair"
      ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.animation" :key="d" :d="d" /></svg>Make keyframe</button><!-- §250: 명칭 단축 -->
      <template v-if="pairMenu.f.pair != null">
        <button
          class="ctxItem"
          @click="onDeleteKeyframe"
        ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.trash" :key="d" :d="d" /></svg>Delete keyframe</button>
        <!-- §278: Detach 아이콘 = 사슬+슬래시 (▶ 오용 수정) · Select all frames in chain 항목 숨김 (사용자 확정) -->
        <button
          class="ctxItem"
          @click="onUnpairFromMark"
        ><svg class="ctxIco" viewBox="0 0 24 24"><path v-for="d in ICONS.detach" :key="d" :d="d" /></svg>Detach keyframe from chain</button>
      </template>
    </div>
    <!-- §208: 프레임 이름 인라인 편집 — 라벨 자리 오버레이 -->
    <input
      v-if="frameNameEdit && frameNameEditPos"
      v-focus
      class="frameNameInput"
      :style="frameNameEditPos"
      v-model="frameNameEdit.draft"
      spellcheck="false"
      @pointerdown.stop @dblclick.stop @contextmenu.stop
      @keydown.enter="commitFrameName"
      @keydown.esc="frameNameEdit = null"
      @blur="commitFrameName"
    />
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<style scoped lang="scss">
.stage { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--stage-bg); user-select: none; -webkit-user-select: none; }
.stage.panning { cursor: grab; }
.world { display: block; width: 100%; height: 100%; }
.hit { cursor: default; }
// §238: 커서 = 디자인 에셋 4종 (src/assets/cursor/ — 코드 생성 데이터URI 폐기).
// 일괄 정규화: 화살표 높이 22px 공통 축척(White는 자체 좌표계 환산), 핫스팟 = 좌상단 (0 0) 공통.
// 기본 = cursorDefault. 그룹(프레임) 선택은 나머지 3종 테스트 — 아래 한 줄 교체로 스왑.
.stage.unitsel:not(.panning), .stage.unitsel:not(.panning) .hit {
  cursor: url('../../assets/cursor/cursorDefault.svg') 0 0, default;
}
.stage.framesel:not(.panning), .stage.framesel:not(.panning) .hit {
  cursor: url('../../assets/cursor/cursorBoundingBox.svg') 0 0, default; /* §240: 바운딩박스 (현재) */
  /* cursor: url('../../assets/cursor/cursorBlock.svg') 0 0, default;  대체 1 */
  /* cursor: url('../../assets/cursor/cursorWhite.svg') 0 0, default;  대체 2 */
}
/* §244: 유닛 우선 모드에서도 프레임 선택 유효범위(프레임 히트 — 유닛이 덮지 않은 몸체) 호버 = 그룹 커서.
   SVG 히트는 최상위 요소 기준이라 유닛 위에선 유닛 커서, 프레임 빈 영역에선 BBox가 자연 분기됨 */
.stage.unitsel:not(.panning) .hit.hitFrame {
  cursor: url('../../assets/cursor/cursorBoundingBox.svg') 0 0, default;
}
.gridbg { pointer-events: none; }
.multiSel { fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
// non-scaling-stroke에서는 대시 패턴도 화면 좌표로 계산됨 — 고정값이 곧 화면 고정 간격
.groupLine {
  fill: none; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke;
  stroke-dasharray: 5 4; opacity: 0.7;
}
.keySel { fill: none; stroke: var(--accent); stroke-width: 5; vector-effect: non-scaling-stroke; opacity: 0.9; }
/* §245: 애니 모드 선택 페어 프레임 — 핸들 없는 선택 아웃라인 (이동 피드백 전용)
   §263: 1.5 → 2.5 — 체인 딤드(2.5)·기준 유닛(keySel 5)과의 두께 밸런스 */
.pairSel { fill: none; stroke: var(--accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; pointer-events: none; }
/* §251·§252: 체인 선택 — 합집합 점선 테두리(표시) + 영역 전체 이동 히트 (그립 폐기) */
.chainSelBox {
  fill: none; stroke: var(--accent); stroke-width: 1; stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke; pointer-events: none; opacity: 0.8;
}
.chainSelHit { fill: transparent; cursor: move; }
// 활성 프레임 아웃라인 (§134·§135) — 흰색 + difference 블렌드: 캔버스 색 무관 가시.
// §135: 오프셋 제거·1px·저오파시티로 은은하게
.activeFrameOutline {
  fill: none; stroke: #ffffff; stroke-width: 2; vector-effect: non-scaling-stroke; /* §139: 1→2 */
  mix-blend-mode: difference; pointer-events: none; opacity: 0.45;
}
.linkBadge path {
  fill: none; stroke: var(--link); stroke-width: 2;
  stroke-linecap: square; stroke-linejoin: miter;
}
.linkBadge text { fill: var(--link); font-family: inherit; font-weight: var(--fw-semibold); }
/* §283: 도크 배지 — 페어 인디케이터 문법 (원 안 사슬 글리프, 클릭 = Undock 팝업) */
.dockMark {
  cursor: pointer;
  .bg { fill: var(--panel); stroke: var(--link); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  path { fill: none; stroke: var(--link); stroke-width: 2.5; stroke-linejoin: miter; }
  &:hover .bg { fill: var(--link); }
  &:hover path { stroke: var(--bg); }
}
/* §280: 도킹 노드 — 원형(선택 유닛 한정 — 모드/대상으로 애니 노드와 분리), 결착 = 솔리드
   §282: 스트로크 = 화이트(--text) (사용자 확정 — §281 --link는 유닛색 위 가독 부족), 결착 필 = --link */
.dockNode {
  fill: var(--panel); stroke: var(--text);
  stroke-width: 1.5; vector-effect: non-scaling-stroke;
  cursor: crosshair;
  &.docked { fill: var(--link); }
  &.target, &:hover { stroke-width: 2.5; }
}
.dockWire {
  stroke: var(--link); stroke-width: 1.5; stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
.dockBridge { vector-effect: non-scaling-stroke; stroke-linejoin: miter; } /* §287: 유닛 seam과 동일 문법 */
/* §289·§290: 브리지 그리드 표시 — 그리드 컬러 60% 면 덮기 (사용자 확정) */
.dockBridgeGuide {
  fill: var(--unit-guide, var(--guide)); opacity: 0.6;
  stroke: none; pointer-events: none;
}
/* §287·§288: 도크 팝업의 결착별 거터 행 — ctxItem 행 문법(패딩 6px 10px·아이콘 gap 8) 정렬 */
.dockGapRow {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 10px;
  .dockGapLabel {
    font-size: var(--fs-sm); letter-spacing: var(--ls-base); color: var(--text); /* §218: L4 — ctxItem 동급 */
    white-space: nowrap; margin-right: auto; /* §290: 필드 우측 정렬 */
    &::first-letter { text-transform: uppercase; }
  }
}
/* §279 → §284: LINK 칩 호버 하이라이트 = 유닛 그리드 색 + 두꺼운 스트로크 (사용자 확정 —
   딤드 네온은 선택 문법과 혼동. 색은 그리드 커스텀(--unit-guide)을 따라감) */
.hoverLinkHl {
  fill: none; stroke: var(--unit-guide, var(--guide));
  stroke-width: 3; vector-effect: non-scaling-stroke; pointer-events: none;
}
// §221: 프리셋 플로팅 창 스타일은 PresetFloatWindow.vue로 이동
// §208: 프레임 이름 인라인 편집 인풋 — 라벨과 같은 화면 고정 크기/서체
.frameNameInput {
  @include text-field;
  position: absolute; z-index: var(--z-inline-edit); /* §272 */
  width: 140px; padding: 2px 6px;
  font-size: var(--fs-xs); border-color: var(--accent); background: var(--panel);
}
// §201·§204: 프레임 이름 라벨 — 화면 고정 크기(pxs), 투명 패드로 호버 영역 확장
.frameLabelG {
  cursor: url('../../assets/cursor/cursorBoundingBox.svg') 0 0, default; /* §241: 그룹 상태 호버 = 그룹 커서 */
  .labelPad { fill: transparent; }
  .frameLabel {
    /* §206: --faint는 스테이지 위에서 거의 안 보여 한 단계 밝게 (호버 --text·선택 --accent와 위계 유지) */
    fill: color-mix(in srgb, var(--text) 45%, var(--faint));
    font-family: inherit;
    user-select: none; -webkit-user-select: none;
    /* §209: 겹친 프레임의 라벨이 서로 얽혀 읽히지 않던 문제 — 배경색 후광으로 맨 위 라벨만 또렷하게
       (선택된 프레임 라벨은 렌더 순서상 항상 맨 위) */
    paint-order: stroke;
    stroke: var(--label-halo, var(--stage-bg));
    stroke-width: 0.25em;
    stroke-linejoin: round;
  }
  &:hover .frameLabel { fill: var(--text); }
  &.sel .frameLabel { fill: var(--accent); }
}
.toast {
  // 패널이 오버레이(§85)라 50%는 창 중앙 — 하단 툴바와 동일 공식으로 캔버스 가용영역 중앙에 배치
  position: absolute; top: var(--sp-6); /* §217: 갭 토큰 통일 */
  left: calc(50% + (var(--panel-w) + 2 * var(--sp-6)) / 2); transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: var(--fs-sm); letter-spacing: var(--ls-base); padding: 7px 14px; pointer-events: none; /* §218: L4 */
  border-radius: var(--radius);
  &::first-letter { text-transform: uppercase; } /* §215 */
}
.marquee { fill: var(--accent-alpha); stroke: var(--accent); stroke-width: 1; }
.ctxMenu {
  /* §244: 툴바 래퍼 z26과 동급 유지 (DOM 후순위라 위에 그려짐) + 애니 창(z25) 위 */
  position: absolute; z-index: var(--z-popover); /* §272 */
  @include window-surface;
  @include chamfer(var(--chamfer-2)); // §257·§272
  padding: var(--sp-1); display: flex; flex-direction: column; /* §272 */
}
.edgeMenu {
  @include popup-menu;
  @include chamfer(var(--chamfer-1)); // §259·§272
  position: fixed; z-index: var(--z-popup); /* §272 */
}
.durWrap { font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint); display: inline-flex; align-items: center; gap: 4px; }
.durInput {
  @include text-field;
  text-transform: none;
  width: 64px; padding: 0 6px; height: 21px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
}
.edgeMenu { min-width: 236px; } /* §228: 곡선 버튼 5개 폭 */
.curveGrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; } /* §228: 5열 (사용자 확정) */
.curveBtn {
  @include bordered-control;
  height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  svg { width: 30px; height: 25px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  &.on { border-color: var(--accent); color: var(--accent); }
}
.ctxItem {
  border: none; background: none; color: var(--text); cursor: pointer;
  font-family: inherit; font-size: var(--fs-sm); letter-spacing: var(--ls-base); /* §218: L4 메뉴 행 */
  padding: 6px 10px; text-align: left; border-radius: var(--radius);
  white-space: nowrap; text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
  display: flex; align-items: center; gap: 8px; // 좌측 주제 아이콘 (§119)
  &:hover { color: var(--accent); }
}
.ctxIco {
  width: 13px; height: 13px; flex-shrink: 0;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: square; stroke-linejoin: miter;
}
.ctxSep { height: 1px; background: var(--line); margin: 3px 4px; }
.ctxItem.off { color: var(--disabled); cursor: default; &:hover { color: var(--disabled); } }
.smartguide { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gapline { stroke: var(--guide); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gaptext { fill: var(--guide); font-family: inherit; user-select: none; }
.stage.eyedrop, .stage.eyedrop .hit { cursor: crosshair; }
.stage.framedraw, .stage.framedraw .hit { cursor: crosshair; }
/* 프레임 조작 모드 (§94): 화면 커서는 기본 유지 — 모드 표시는 툴바의 채움 화살표 아이콘으로 */
.rectDraw { fill: var(--accent-alpha); stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.gridline { stroke: var(--stage-grid); fill: none; }
</style>
