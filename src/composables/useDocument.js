import { reactive, computed, ref, watch, nextTick } from 'vue';
import { namePrefix } from '../objects/registry.js';
import { localPointToCanvas } from '../geometry/derive.js';
import { migrateBrandHex } from '../geometry/brandColors.js';
import {
  A_MIN, A_MAX, B_MIN, B_MAX, AB_SUM_MAX, GUTTER_MAX, LIMITS, UNIT_MAX,
  BRAND_COLORS,
} from '../geometry/constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createParams(overrides = {}) {
  return {
    // Unit Size (캔버스 치수 — 회전 반영값)
    W: 960,
    H: 800, // 6:5 (비율 칩 기본)
    orientation: 0, // 0 | 90 | 180 | 270 (시계방향)
    // Grid
    cols: 12,
    gutterMode: 'fixed', // 'fixed' | 'proportional'
    gutterPx: 10,
    g: 0.2,
    rate: 2, // 2:1 칩 = UI 표기 +1.67x (compression 슬라이더 환산값)
    direction: 'LtoS',
    offset: 0, // §255: 칸 위상 (소수·± 허용, 랩 순환 — 컨베이어 흐름. 패널 표시는 조건부)
    offsetType: 'step', // §262: 'step'(기본 — 온전 샤프트 결착 진입) | 'flow'(눌리며 통과)
    grow: 'r', // §263: 생산/흐름 끝단 — 'r'(우측, 기본) | 'l'(좌측) — 유닛별 교차 연출용
    // Shape
    dPct: 35,
    a: 0.4,
    b: 0,
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL'
    flipX: false, // 표시 계수: 좌우 미러 (내부 rate/direction은 불변 — 플립만 다른 유닛은 mixed로 취급 안 됨)
    fill: BRAND_COLORS[0], // Builder Neon
    showGuides: true,
    // §220: 애니메이션 예약 필드 (렌더 레벨 — derive 미사용, UI는 Phase B+)
    rotation: 0,   // 연속 회전각(deg) — 90° 이산 orientation과 별개
    opacity: 100,  // 투명도 %
    anchorU: 0,    // 회전·스케일 앵커 (로컬 정규화 좌표, 기본 로컬 원점)
    anchorV: 0,
    ...overrides,
  };
}

// ── §220: 범주형 다중 링크 스키마 ─────────────────────────────
// unit.links = { size, orientation, grid, shape, color } — 범주별 링크그룹 id(없으면 null).
// 구 스키마(unit.linkId 단일 + doc.linkScopes[lid] 플래그)를 대체: "스코프 off" = 그 범주 null.
// unit.pair = 애니메이션 페어 id (동기화 없음 — 보간 대응 관계 전용, Phase B+).
export const LINK_CATS = ['size', 'orientation', 'grid', 'shape', 'color', 'animation']; // §264: animation 신설
export const emptyLinks = () => ({ size: null, orientation: null, grid: null, shape: null, color: null, animation: null });
// 대표 링크그룹 id — 배지 표시·그룹 소속 판정용 (현행 UI는 유닛당 한 그룹이 전 범주를 공유)
export const primaryLid = (u) => {
  if (!u?.links) return null;
  for (const c of LINK_CATS) if (u.links[c] != null) return u.links[c];
  return null;
};

// 문서 모델: 스테이지 위 유닛 버전들 + 멀티선택 상태.
// - activeId: 패널이 편집하는 유닛 (선택 해제 후에도 유지, 유닛 0개면 null)
// - selectedIds: 바운딩박스/이동/일괄 편집 대상
const DOC_KEY = 'eo.doc';

// 구버전 스키마 호환: groupId(단일) → groups(중첩 스택, 바깥쪽이 끝)
// 프레임 오브젝트 파라미터 (그리기 툴 F, §92: rect에서 재정의) — 레이아웃 프레임.
export function createFrameParams(overrides = {}) {
  return {
    W: 300,
    H: 200,
    orientation: 0, // 회전(W/H 스왑) 공유 경로 호환용
    fill: '#333333', // Solid Gray (§200 리뉴얼)
    fillOn: true,   // §110: fill/stroke 독립 토글 (배타 drawMode 폐기)
    strokeOn: false,
    stroke: '#FCFBF5', // Air White — 다크 캔버스에서 보이는 기본값
    strokeW: 5, // 외곽선 두께 (px 고정 — cm 표기 모드와 무관)
    unitMode: 'px', // 패널 표기 단위 'px' | 'cm' — 내부 저장은 항상 px, dpi 기준 환산 표시
    // 내부 레이아웃 그리드 (가이드 전용 — export 미포함, px 단위)
    gridOn: true, // §131: on/off 옵션 폐기 — 상시 on (마이그레이션에서 강제)
    margin: 20,
    rows: 2,
    cols: 2,
    gutterX: 20,
    gutterY: 20,
    // 그리드 컴프레션 (§131) — compX/Y: 부호 있는 압축값(±2.5, 0 균등), 유닛과 동일 매핑
    compOn: false,
    compModeX: 'dir', // §134: 축별 모드 — 'dir' 한 방향 등비 | 'sym' 중앙 대칭
    compModeY: 'dir',
    compX: 0,
    compY: 0,
    compLock: false, // §132: rows-cols 값(+모드) 동기화 잠금
    // §220: 애니메이션 예약 필드 (유닛과 동일 — 파라미터 셰이프 통일)
    rotation: 0,
    opacity: 100,
    anchorU: 0,
    anchorV: 0,
    ...overrides,
  };
}

function migrateUnit(u, legacyScopes = {}) {
  // §213: 리뉴얼 이전 브랜드 hex 자동 치환
  if (u.params) {
    if (u.params.fill) u.params.fill = migrateBrandHex(u.params.fill);
    if (u.params.stroke) u.params.stroke = migrateBrandHex(u.params.stroke);
  }
  if (!u.type) u.type = 'unit';
  // §92: rect → frame 재정의 (기존 문서 자동 마이그레이션, 이름도 Rect-N → Frame-N)
  if (u.type === 'rect') {
    u.type = 'frame';
    if (u.name) u.name = u.name.replace(/^Rect-/, 'Frame-');
  }
  // 구버전 frame: 이후 추가된 키를 기본값으로 보충 + drawMode(배타) → fillOn/strokeOn(독립) 이관 (§110)
  if (u.type === 'frame' && u.params) {
    u.params = { ...createFrameParams(), ...u.params };
    u.params.gridOn = true; // §131: 그리드 on/off 폐기 — 구버전 off 저장분도 상시 on
    if (u.params.compMode) {
      // §134: 단일 compMode → 축별 이관
      u.params.compModeX = u.params.compMode;
      u.params.compModeY = u.params.compMode;
      delete u.params.compMode;
    }
    if (u.params.drawMode) {
      u.params.strokeOn = u.params.drawMode === 'stroke';
      u.params.fillOn = u.params.drawMode !== 'stroke';
      delete u.params.drawMode;
    }
  }
  // §255: offset 백필 — 구 유닛 문서는 키 자체가 없음 (0 = 외형 불변)
  if (u.type !== 'frame' && u.params && u.params.offset == null) u.params.offset = 0;
  if (u.type !== 'frame' && u.params && u.params.offsetType == null) u.params.offsetType = 'step'; // §262
  if (u.type !== 'frame' && u.params && u.params.grow == null) u.params.grow = 'r'; // §263
  if (!Array.isArray(u.groups)) u.groups = u.groupId ? [u.groupId] : [];
  delete u.groupId;
  // §220: linkId 단일 + linkScopes 플래그 → 범주형 links로 이관
  // (구 런타임에서 스코프 메타 부재 = 전 범주 동기였으므로, 매핑 없으면 전 범주 on)
  if (!u.links) {
    u.links = emptyLinks();
    if (u.linkId != null) {
      const sc = legacyScopes[u.linkId] ?? null;
      for (const c of LINK_CATS) if (!sc || sc[c] !== false) u.links[c] = u.linkId;
    }
  }
  // §264: animation 범주 신설 백필 — 종전엔 cols 등이 grid 소속이었으므로 grid 멤버십을 상속
  if (u.links && u.links.animation === undefined) u.links.animation = u.links.grid ?? null;
  delete u.linkId;
  if (u.pair === undefined) u.pair = null; // §220: 애니메이션 페어 예약
  if (u.home === undefined) u.home = null; // §225: 키프레임 소속 (페어 복제 시 확정 — 겹친 키프레임에서도 소속 유지)
  if (u.params && u.params.flipX === undefined) u.params.flipX = false;
  if (u.params) {
    // §220: 애니메이션 예약 필드 보충
    if (u.params.rotation === undefined) u.params.rotation = 0;
    if (u.params.opacity === undefined) u.params.opacity = 100;
    if (u.params.anchorU === undefined) { u.params.anchorU = 0; u.params.anchorV = 0; }
  }
  return u;
}

export function useDocument() {
  // localStorage 자동 복원 (새로고침 안전망)
  let savedUnits;
  let savedMeta = null;
  let savedGroupNames = {};
  let savedLinkScopes = {}; // §220: 구 스키마 이관용 (런타임 상태 아님)
  let savedAnimEdges = [];
  try {
    const raw = JSON.parse(localStorage.getItem(DOC_KEY) || 'null');
    savedUnits = raw?.units ?? null;
    savedGroupNames = raw?.groupNames ?? {};
    savedLinkScopes = raw?.linkScopes ?? {};
    savedAnimEdges = raw?.animEdges ?? [];
    if (savedUnits) savedMeta = { count: savedUnits.length, savedAt: raw.savedAt ?? null };
  } catch { savedUnits = null; }
  const initialUnits = (savedUnits ?? [{ id: 1, type: 'unit', name: 'Unit-1', x: 0, y: 0, params: createParams() }]).map((u) => migrateUnit(u, savedLinkScopes));

  let nextId = 2;
  let nextUnitVer = 2; // 유닛/프레임 넘버링 분리 (§64)
  let nextFrameVer = 1;
  let nextGroup = 1;
  let nextLink = 1;
  let nextPair = 1; // §220: 애니메이션 페어 id 카운터 (예약)
  const doc = reactive({
    units: initialUnits,
    activeId: initialUnits.length ? initialUnits[initialUnits.length - 1].id : null,
    selectedIds: [],
    keyId: null, // 정렬 기준(키 오브젝트) — 멀티선택 중 재클릭으로 지정
    groupNames: savedGroupNames, // gid → 이름 (Group-N)
    animEdges: savedAnimEdges, // §220: 키프레임 연결 [{ from, to, duration, curve, ... }] — Phase B+
    animOn: false, // §255: 애니 모드 플래그 (reactive — 패널의 조건부 표시용. 영속 안 함)
  });
  recalcCounters();
  function recalcCounters() {
    const maxVer = (units) => units.reduce((m, u) => {
      const mt = u.name.match(/(?:v|-)(\d+)$/);
      return Math.max(m, mt ? Number(mt[1]) : 0);
    }, 0) + 1;
    nextId = doc.units.reduce((m, u) => Math.max(m, u.id), 0) + 1;
    nextUnitVer = maxVer(doc.units.filter((u) => u.type !== 'frame'));
    nextFrameVer = maxVer(doc.units.filter((u) => u.type === 'frame'));
    nextGroup = doc.units.reduce((m, u) => Math.max(m, ...u.groups, 0), 0) + 1;
    nextLink = doc.units.reduce((m, u) => Math.max(m, ...LINK_CATS.map((c) => u.links[c] || 0)), 0) + 1;
    nextPair = doc.units.reduce((m, u) => Math.max(m, u.pair || 0), 0) + 1;
  }
  // 타입별 다음 이름 (접두어는 오브젝트 레지스트리에서)
  const nextName = (type) =>
    `${namePrefix(type)}-${type === 'frame' ? nextFrameVer++ : nextUnitVer++}`;

  // 자동 저장 (500ms 디바운스) — 유닛 + 그룹 이름 + 애니메이션 엣지 (§220: version 2 — linkScopes 폐기)
  let saveTimer = null;
  watch(
    () => JSON.stringify({ u: doc.units, g: doc.groupNames, a: doc.animEdges }),
    (snap) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const { u, g, a } = JSON.parse(snap);
        localStorage.setItem(DOC_KEY, JSON.stringify({
          version: 2, savedAt: Date.now(), units: u, groupNames: g, animEdges: a,
        }));
      }, 500);
    }
  );

  // 존재하지 않는 gid 메타·사라진 프레임의 애니 엣지 정리
  function pruneMeta() {
    const gids = new Set(doc.units.flatMap((u) => u.groups));
    for (const k of Object.keys(doc.groupNames)) if (!gids.has(Number(k))) delete doc.groupNames[k];
    const fids = new Set(doc.units.filter((u) => u.type === 'frame').map((u) => u.id));
    doc.animEdges = doc.animEdges.filter((e) => fids.has(e.from) && fids.has(e.to));
    for (const u of doc.units) if (u.home != null && !fids.has(u.home)) u.home = null; // §225
    // §254: 계보(pair)에 프레임이 1개만 남으면 자동 페어 초기화 — 짝 잃은 키프레임은 일반 프레임 복귀
    // (unpairFrame과 동일 정리를 인라인로 — 재귀 없이 일괄 스윕)
    const pairCounts = {};
    for (const u of doc.units) if (u.type === 'frame' && u.pair != null) pairCounts[u.pair] = (pairCounts[u.pair] || 0) + 1;
    for (const f of doc.units) {
      if (f.type !== 'frame' || f.pair == null || pairCounts[f.pair] >= 2) continue;
      f.pair = null;
      f.name = f.name.replace(/\sK\d+$/, ''); // §266: 키프레임 접미 자동 제거 (고아 초기화 경로)
      for (const u of doc.units) if (u.home === f.id) { u.pair = null; u.home = null; }
      doc.animEdges = doc.animEdges.filter((e) => e.from !== f.id && e.to !== f.id);
    }
  }

  // JSON 프로젝트 로드 (파일 열기) — meta.linkScopes는 구 포맷 이관용
  function loadProject(units, meta = {}) {
    doc.units.splice(0, doc.units.length, ...units.map((u) => migrateUnit(u, meta.linkScopes ?? {})));
    doc.groupNames = meta.groupNames ?? {};
    doc.animEdges = meta.animEdges ?? [];
    doc.selectedIds = [];
    doc.activeId = units.length ? units[units.length - 1].id : null;
    recalcCounters();
    pruneMeta();
  }

  // 스포이드: 소스 유닛의 파라미터를 선택된 유닛들에 흡수 (위치·이름 유지)
  // scope: { size, grid, shape, color } — 켜진 범주의 키만 흡수 (없으면 전체)
  const SCOPE_KEYS = {
    size: ['W', 'H'],
    orientation: ['orientation', 'flipX'], // 회전·반전 상태 (표시 계수 포함)
    grid: ['gutterMode', 'gutterPx', 'g', 'rate', 'direction'],
    // §264: 애니 재료(cols·grow·offsetType·offset)는 별도 범주 — "같은 그리드, 반전 애니" 조합 허용
    animation: ['cols', 'grow', 'offsetType', 'offset'],
    shape: ['dPct', 'a', 'b', 'threads', 'threadDir'],
    color: ['fill'],
  };
  // 파라미터 키 → 범주 역맵 (링크 스코프 필터용). 미분류 키(showGuides 등)는 항상 동기화.
  const KEY_CAT = {};
  for (const [cat, keys] of Object.entries(SCOPE_KEYS)) for (const k of keys) KEY_CAT[k] = cat;
  // 기본: color·orientation은 off (사용자 확정 §62 — 개별성 유지가 더 흔한 사용례)
  const linkScopeDefault = () => ({ size: true, orientation: false, grid: true, shape: true, color: false, animation: true });
  // 스포이드 전용 범주 매핑 (§133) — 링크 스코프(SCOPE_KEYS/KEY_CAT)와 분리 유지:
  // 프레임 키를 링크 범주에 편입하면 프레임 링크(전체 동기화, 미분류 키 = 항상 동기)가
  // 스코프 필터에 걸리므로, 흡수 경로에서만 확장한다. 적용은 종전대로 동일 타입 한정.
  const EYEDROP_KEYS = {
    size: ['W', 'H'],
    orientation: ['orientation', 'flipX'],
    grid: [
      ...['gutterMode', 'gutterPx', 'g', 'rate', 'direction'], // 유닛
      ...['margin', 'rows', 'cols', 'gutterX', 'gutterY', 'compOn', 'compModeX', 'compModeY', 'compX', 'compY', 'compLock'], // 프레임 (§264: cols — 유닛 cols는 animation 범주로 이동, 프레임 그리드 cols는 여기)
    ],
    animation: ['cols', 'grow', 'offsetType', 'offset'], // §264
    shape: [
      ...['dPct', 'a', 'b', 'threads', 'threadDir'],       // 유닛 shape
      ...['fillOn', 'strokeOn', 'stroke', 'strokeW'],       // 프레임 style (§133: Shape/Style 겸용)
    ],
    color: ['fill'],
  };
  function absorbFrom(source, scope = null) {
    const keys = scope
      ? Object.entries(scope).filter(([, v]) => v).flatMap(([k]) => EYEDROP_KEYS[k] || [])
      : Object.keys(source.params);
    if (!keys.length) return;
    const patch = {};
    for (const k of keys) if (k in source.params) patch[k] = source.params[k];
    // 직접 대상(선택)은 전체 패치, 링크로만 딸려오는 멤버는 범주별 멤버십 필터 적용 (§220)
    const direct = new Set(doc.selectedIds);
    const viaLink = new Map(); // memberId → 직접 선택된 링크 동료 유닛
    for (const u of doc.units) {
      if (direct.has(u.id) && primaryLid(u) != null) {
        for (const mid of linkMemberIds(primaryLid(u))) if (!direct.has(mid)) viaLink.set(mid, u);
      }
    }
    for (const u of doc.units) {
      if (u.id === source.id) continue;
      if (u.type !== source.type) continue; // 타입이 다른 오브젝트에는 흡수 불가
      if (direct.has(u.id)) Object.assign(u.params, patch);
      else if (viaLink.has(u.id)) applyLinkPatch(u, filterByLinkScope(patch, viaLink.get(u.id), u), source.params);
    }
  }
  // ── 링크 확산 공용 헬퍼 (§68 부채 정리) ──
  // 링크 전파 표면은 두 종류뿐이어야 한다:
  //  1) 미러 워처 (아래 watch) — 패널 편집의 패치를 스코프 필터로 전파
  //  2) 직접 확산 — 반드시 expandLinkByScope / filterByLinkScope 를 거칠 것.
  //     현재 사용처: setFill('color') · rotate('orientation') · absorbFrom(filterByLinkScope)
  // 새 기능이 링크로 퍼져야 한다면 이 두 헬퍼 외의 경로를 만들지 말 것.
  // cat 범주를 공유하는 링크 멤버 id들로 집합을 확장 (§220: 범주별 멤버십 기준)
  function expandLinkByScope(ids, cat) {
    const out = new Set(ids);
    const lids = new Set();
    for (const u of doc.units) if (out.has(u.id) && u.links[cat] != null) lids.add(u.links[cat]);
    for (const u of doc.units) if (u.links[cat] != null && lids.has(u.links[cat])) out.add(u.id);
    return out;
  }
  // 소스-멤버가 그 범주를 공유하지 않는 키를 patch에서 제거 (§220)
  // 무범주 키(프레임 파라미터 등)는 항상 동기 — 종전 규칙 유지.
  function filterByLinkScope(patch, src, member) {
    const out = {};
    for (const k in patch) {
      const cat = KEY_CAT[k];
      if (!cat || (src.links[cat] != null && src.links[cat] === member.links[cat])) out[k] = patch[k];
    }
    return out;
  }
  // §202·§204·§205: 링크 패치 적용 단일 경로 — W/H는 "로컬(회전 반영) 치수"로 동기화하고,
  // 멤버는 **링크된 로컬 앵커**를 고정한 채 스케일된다. 앵커는 로컬 정규화 좌표(0~1):
  //  · 핸들 리사이즈 중에는 활성이 잡은 앵커의 로컬 좌표가 공유됨(setLinkResizeAnchor, §205)
  //    — 같은 오리엔트 멤버는 활성과 똑같이, 180° 멤버는 정반대 방향으로 스케일.
  //  · 핸들이 없는 편집(패널 W/H 등)은 로컬 원점 (0,0) 고정.
  // 오리엔트 조합 판정은 localPointToCanvas 단일 소스. W/H 외 키는 그대로 복사.
  // 링크로 W/H가 전파되는 모든 경로는 이 함수를 거칠 것.
  const localDims = (p) => (p.orientation === 90 || p.orientation === 270 ? [p.H, p.W] : [p.W, p.H]);
  let linkAnchor = null; // 핸들 리사이즈 중의 공유 로컬 앵커 [u, v] — 드래그 종료 시 null
  function setLinkResizeAnchor(a) {
    linkAnchor = a;
  }
  function applyLinkPatch(member, patch, srcParams) {
    const { W, H, ...rest } = patch;
    Object.assign(member.params, rest); // orientation 패치가 있으면 먼저 반영 (아래 매핑 기준)
    if (W === undefined && H === undefined) return;
    const [lw, lh] = localDims(srcParams); // 소스의 로컬 치수 (패치 반영된 현재값)
    const odd = member.params.orientation === 90 || member.params.orientation === 270;
    const [nw, nh] = odd ? [lh, lw] : [lw, lh];
    const [au, av] = linkAnchor ?? [0, 0];
    const [ax, ay] = localPointToCanvas(member.params, au, av);
    member.x += (member.params.W - nw) * ax; // 앵커점의 캔버스 위치 고정
    member.y += (member.params.H - nh) * ay;
    member.params.W = nw;
    member.params.H = nh;
  }

  const active = computed(() => doc.units.find((u) => u.id === doc.activeId) ?? null);
  const gutterMax = computed(() => {
    if (!active.value) return GUTTER_MAX;
    const p = active.value.params;
    const odd = p.orientation === 90 || p.orientation === 270;
    return Math.min(GUTTER_MAX, (odd ? p.H : p.W) / p.cols);
  });

  // ---- 선택 ----
  function selectOnly(id) {
    doc.activeId = id;
    doc.selectedIds = [id];
    doc.keyId = null;
  }
  function toggleSelect(id) {
    const i = doc.selectedIds.indexOf(id);
    if (i === -1) {
      doc.selectedIds.push(id);
      doc.activeId = id;
    } else {
      doc.selectedIds.splice(i, 1);
      if (doc.activeId === id && doc.selectedIds.length) {
        doc.activeId = doc.selectedIds[doc.selectedIds.length - 1];
      }
    }
  }
  function setSelection(ids) {
    doc.selectedIds = [...ids];
    if (ids.length) doc.activeId = ids[ids.length - 1];
    if (!ids.includes(doc.keyId)) doc.keyId = null;
  }
  function deselect() {
    doc.selectedIds = [];
    doc.keyId = null;
  }

  // ---- 멀티선택 파라미터 브로드캐스트 ----
  // 패널은 활성 유닛의 params를 직접 편집한다. 변경된 키만 감지해
  // 나머지 선택 유닛에 같은 값을 미러링한다.
  let notify = () => {};
  function setNotifier(fn) {
    notify = fn;
  }
  let lastBroadcastNote = 0;

  let mirrorGuard = false;
  // §227: 애니메이션 모드 이산값 잠금 (§220 합의 "페어에서 조작 시 경고+차단"의 구현).
  // 보간 불가 키(orientation·flipX·threads·threadDir·gutterMode·direction)는 페어 유닛에서 편집 차단.
  let animGuard = false;
  let animRevertTick = false; // 원복 자체가 워처를 재점화하는 1회분 무시 (핑퐁 차단)
  function setAnimMode(on) { animGuard = !!on; doc.animOn = !!on; } // §255: 패널 조건부 표시 연동
  // §229: direction 제외 — 압축 부호는 rate와 결합해 연속 보간되므로 잠글 필요도, 잠그면 오히려
  // 슬라이더가 0을 지날 때 편집이 반쯤 원복되는 부작용만 있음.
  // §261: orientation·flipX 제외 — 회전/반전은 잠금 대신 **짝 전체 동시 적용**(pairMates)으로 전환.
  const ANIM_LOCKED = ['threads', 'threadDir', 'gutterMode'];
  // §261: 같은 계보(pair)의 대응 유닛들 — 회전/반전을 짝 전원에 전파해 키프레임 대응을 유지
  // (잠금+경고보다 친절: 어느 키프레임에서 뒤집든 애니 전체가 함께 뒤집힌다. 애니 모드 여부 무관)
  function pairMates(ids) {
    const pairs = new Set();
    for (const u of doc.units) if (ids.has(u.id) && u.type !== 'frame' && u.pair != null) pairs.add(u.pair);
    if (!pairs.size) return [];
    return doc.units.filter((m) => m.type !== 'frame' && m.pair != null && pairs.has(m.pair) && !ids.has(m.id));
  }
  function animLockBlock(targets) {
    if (!animGuard) return false;
    const arr = Array.isArray(targets) ? targets : [targets];
    if (arr.some((u) => u && u.pair != null && u.type !== 'frame')) {
      notify('Paired keyframe unit — rotation/flip/discrete values are locked in animation mode');
      return true;
    }
    return false;
  }
  // 지오메트리 조작 가드 — 유닛별로 "다른" 값을 의도적으로 쓰는 조작(통합 스케일·회전·플립) 중에는
  // 멀티선택 브로드캐스트가 끼어들어 활성 유닛 값으로 덮어쓰지 않도록 한 틱 동안 억제.
  let geomOp = false;   // 미러 워처 억제 플래그 (틱이 끝날 때 해제)
  let geomDepth = 0;    // 동기 중첩 카운터 — 분리 감지는 최상위 호출만 (geomOp은 틱 단위라 부적합)
  function withGeomOp(fn) {
    if (geomDepth > 0) { fn(); return; } // 중첩 호출: 분리 감지는 최상위가 담당
    geomDepth += 1;
    geomOp = true;
    // §200: 링크 서브셋 발산 감지용 조작 전 스냅샷 (링크 멤버만 — 통상 소수)
    const before = new Map();
    for (const u of doc.units) {
      const lid = primaryLid(u);
      if (lid != null) before.set(u.id, { lid, links: { ...u.links }, json: JSON.stringify(u.params) });
    }
    try {
      fn();
    } finally {
      geomDepth -= 1;
      nextTick(() => { geomOp = false; }); // pre-flush 워처가 먼저 돌고 난 뒤 해제
    }
    splitDivergedLinks(before);
  }
  // §200: 지오메트리 조작이 링크의 "일부"에만 동기화 대상 키를 바꿨다면, 그 서브셋을
  // 새 링크그룹으로 분리한다 (서브셋 칩 조작 = 분리 규칙 §129의 확장). 발산 상태를 방치하면
  // 이후 패널 편집 한 번에 전 멤버가 갑자기 동기화되는 충돌이 생기기 때문.
  function splitDivergedLinks(before) {
    const changed = new Map(); // lid → Set(변경 유닛 id)
    for (const u of doc.units) {
      const b = before.get(u.id);
      if (!b || primaryLid(u) !== b.lid) continue; // 조작 중 링크 소속이 바뀐 유닛은 제외
      if (JSON.stringify(u.params) === b.json) continue;
      // 변경 키 중 링크 동기화 대상(무범주 키 or 멤버십이 있는 범주)이 있어야 발산 (§220)
      const prev = JSON.parse(b.json);
      let synced = false;
      for (const k in u.params) {
        if (u.params[k] === prev[k]) continue;
        // §202: W/H는 로컬 치수로 비교 — 개별 회전의 W/H 스왑은 발산이 아님 (링크 동기화도 로컬 치수 기준)
        if (k === 'W' || k === 'H') {
          const [pw, ph] = localDims(prev);
          const [cw, ch] = localDims(u.params);
          if (pw === cw && ph === ch) continue;
        }
        const cat = KEY_CAT[k];
        if (!cat || b.links[cat] != null) { synced = true; break; }
      }
      if (!synced) continue;
      if (!changed.has(b.lid)) changed.set(b.lid, new Set());
      changed.get(b.lid).add(u.id);
    }
    let split = 0;
    for (const [lid, ids] of changed) {
      const members = linkMemberIds(lid);
      if (!ids.size || ids.size >= members.length) continue; // 전 멤버 변경 = 동기 유지, 분리 불필요
      const subset = members.filter((id) => ids.has(id));
      // §220: 서브셋을 새 링크그룹으로 — 범주 멤버십 구성은 그대로 승계 (lid만 치환)
      const nl = subset.length >= 2 ? nextLink++ : null;
      for (const u of doc.units) {
        if (!subset.includes(u.id)) continue;
        for (const c of LINK_CATS) if (u.links[c] === lid) u.links[c] = nl;
      }
      split += subset.length;
    }
    if (split) {
      cleanupLinks();
      pruneMeta();
      notify(`Link split — ${split} edited unit${split > 1 ? 's' : ''} re-linked separately`);
    }
  }
  watch(
    () => (active.value ? [active.value.id, JSON.stringify(active.value.params)] : [null, null]),
    ([id, now], [oldId, old]) => {
      if (geomOp) return;
      if (mirrorGuard || id == null || id !== oldId || now === old) return;
      // §227: 페어 유닛의 이산값 편집 = 경고 후 원복
      if (animRevertTick) { animRevertTick = false; return; }
      // §262: offsetType(보간 정책)은 짝 전체가 공유해야 정의됨 — 변경 시 짝에 자동 전파 (모드 무관)
      {
        const me0 = doc.units.find((u) => u.id === id);
        if (me0 && me0.pair != null && me0.type !== 'frame') {
          const prevP = JSON.parse(old);
          const curP = JSON.parse(now);
          if (prevP.offsetType !== curP.offsetType) {
            for (const m of pairMates(new Set([id]))) m.params.offsetType = curP.offsetType;
          }
          if (prevP.grow !== curP.grow) { // §263: grow도 짝 공유 (중간값 없는 기하 상태)
            for (const m of pairMates(new Set([id]))) m.params.grow = curP.grow;
          }
        }
      }
      if (animGuard) {
        const me0 = doc.units.find((u) => u.id === id);
        if (me0 && me0.pair != null && me0.type !== 'frame') {
          const prev0 = JSON.parse(old);
          const cur0 = JSON.parse(now);
          let hit = false;
          for (const k of ANIM_LOCKED) {
            if (cur0[k] !== prev0[k]) { me0.params[k] = prev0[k]; hit = true; }
          }
          if (hit) {
            animRevertTick = true; // 원복 재점화 1회 무시
            notify('Paired keyframe unit — this value cannot animate and is locked');
            return;
          }
        }
      }
      // 대상: 멀티선택 미러링(전체 패치) + 링크 그룹 상시 동기화(스코프 범주 필터)
      const selT = new Set();
      if (doc.selectedIds.length >= 2 && doc.selectedIds.includes(id)) {
        for (const sid of doc.selectedIds) selT.add(sid);
      }
      const linkT = new Set();
      const me = doc.units.find((u) => u.id === id);
      const myLid = me ? primaryLid(me) : null;
      if (myLid != null) for (const lid of linkMemberIds(myLid)) linkT.add(lid);
      selT.delete(id);
      linkT.delete(id);
      for (const t of selT) linkT.delete(t); // 선택에 포함된 유닛은 전체 패치 우선
      if (!selT.size && !linkT.size) return;
      const prev = JSON.parse(old);
      const cur = JSON.parse(now);
      const patch = {};
      for (const k in cur) if (cur[k] !== prev[k]) patch[k] = cur[k];
      // §262: orientation·flipX는 워처 raw 복사 금지 — 교차 디자인(유닛마다 다른 방위)을
      // 뭉개는 주범. 이 두 키의 전파는 rotate/flip 함수(멤버 각자 상태 기준 연산)만 담당한다.
      delete patch.orientation;
      delete patch.flipX;
      if (!Object.keys(patch).length) return;
      mirrorGuard = true;
      for (const u of doc.units) {
        if (selT.has(u.id)) Object.assign(u.params, patch);
        else if (linkT.has(u.id)) {
          // §220: 범주별 멤버십 필터 — 멤버가 그 범주를 공유할 때만 해당 키 전파
          const lp = filterByLinkScope(patch, me, u);
          if (Object.keys(lp).length) applyLinkPatch(u, lp, me.params);
        }
      }
      mirrorGuard = false;
      // 멀티선택 편집이 여러 유닛에 퍼졌음을 1회성 토스트로 안내
      if (doc.selectedIds.length >= 2 && Date.now() - lastBroadcastNote > 2500) {
        lastBroadcastNote = Date.now();
        notify(`Applied to ${doc.selectedIds.length} selected units`);
      }
    }
  );

  // ---- 히스토리 (undo/redo) — units+메타 스냅샷, 연속 조작은 350ms 디바운스로 병합 ----
  // §103: registerHistoryExtra로 외부 상태(프리셋 라이브러리)도 같은 스택에 편입 가능
  let extraHist = null; // { get: () => serializable, set: (v) => void }
  const histSnap = () => JSON.stringify({
    u: doc.units, g: doc.groupNames, a: doc.animEdges,
    ...(extraHist ? { x: extraHist.get() } : {}),
  });
  const stack = [histSnap()];
  let idx = 0;
  let pending = null;
  function scheduleHistPush() {
    clearTimeout(pending);
    pending = setTimeout(() => pushState(histSnap()), 350);
  }
  watch(histSnap, scheduleHistPush);
  function registerHistoryExtra(get, set) {
    extraHist = { get, set };
    // 편집 전(초기 스냅샷 1장)이면 x 포함으로 재작성 — 첫 조작이 프리셋 등록이어도 undo 가능
    if (stack.length === 1 && idx === 0) stack[0] = histSnap();
    watch(() => JSON.stringify(get()), scheduleHistPush);
  }
  function pushState(snap) {
    if (snap === stack[idx]) return;
    stack.splice(idx + 1);
    stack.push(snap);
    if (stack.length > 100) stack.shift();
    idx = stack.length - 1;
  }
  function flushHistory() {
    clearTimeout(pending);
    pushState(histSnap());
  }
  function applyState(snap) {
    // §200: 복원은 편집이 아님 — 미러 워처가 복원분을 재브로드캐스트해 링크 멤버를
    // 활성 유닛 값으로 덮어쓰고 스택을 오염시키던 버그 차단 (분리 감지 없이 가드만)
    geomOp = true;
    try {
      const { u, g, a, x } = JSON.parse(snap);
      if (extraHist && x !== undefined) extraHist.set(x);
      doc.units.splice(0, doc.units.length, ...u);
      doc.groupNames = g ?? {};
      doc.animEdges = a ?? [];
      doc.selectedIds = doc.selectedIds.filter((id) => doc.units.some((x) => x.id === id));
      if (!doc.units.find((x) => x.id === doc.activeId)) {
        doc.activeId = doc.units.length ? doc.units[doc.units.length - 1].id : null;
      }
      recalcCounters(); // undo/redo 시 이름·id 카운터도 스냅샷 기준으로 복원
    } finally {
      nextTick(() => { geomOp = false; });
    }
  }
  function undo() {
    flushHistory();
    if (idx === 0) return;
    idx -= 1;
    applyState(stack[idx]);
  }
  function redo() {
    flushHistory();
    if (idx >= stack.length - 1) return;
    idx += 1;
    applyState(stack[idx]);
  }

  // ---- 클립보드 (⌘C/⌘V) ----
  let clipboard = null;
  // §152: 내부 클립보드 멀티 지원 — 선택 전체를 상대 배치(bbox 중심 기준)로 저장.
  // 그룹은 붙여넣기 시 새 gid로 재생성(duplicateUnits와 동일 관례), 링크는 원본 그룹 합류(§129 현행 문법).
  function copyActive() {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    const src = sel.length ? sel : active.value ? [active.value] : [];
    if (!src.length) return;
    const bb = bboxOf(src);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    clipboard = src.map((u) => ({
      type: u.type, name: u.name, params: { ...u.params }, links: { ...u.links },
      groups: [...u.groups], dx: u.x - cx, dy: u.y - cy,
    }));
  }
  function pasteAt(x, y) {
    if (!clipboard?.length) return;
    const gidMap = new Map(); // 원본 gid → 사본 gid
    const ids = [];
    for (const it of clipboard) {
      const id = nextId++;
      const groups = it.groups.map((g) => {
        if (!gidMap.has(g)) {
          gidMap.set(g, nextGroup++);
          doc.groupNames[gidMap.get(g)] = doc.groupNames[g] ?? `Group-${gidMap.get(g)}`;
        }
        return gidMap.get(g);
      });
      doc.units.push({
        id, type: it.type, name: it.name ?? nextName(it.type), // §202·§204: 원본 이름 유지 (유닛·프레임 공통)
        x: Math.round(x + it.dx), y: Math.round(y + it.dy),
        groups, links: { ...it.links }, pair: null, home: null, params: { ...it.params },
      });
      ids.push(id);
    }
    setSelection(ids);
    cleanupLinks(); // 원본 링크그룹이 사라진 사본 등 1멤버 그룹 정리
    pruneMeta();
  }

  // §202: 유닛 이름은 프리셋 이름을 그대로 쓴다 (Unit-N 넘버링 폐지 — 프레임은 Frame-N 유지).
  // 넘버링 카운터(nextUnitVer)는 애니메이션 기능에서 쓸 수 있어 보존.
  function pushUnit(params, x, y, links = null, type = 'unit', name = null) {
    const id = nextId++;
    doc.units.push({
      id, type, name: name ?? nextName(type), x, y, groups: [],
      links: links ? { ...links } : emptyLinks(), pair: null, home: null, params,
    });
    selectOnly(id);
    return doc.units[doc.units.length - 1];
  }
  // 복제류 공용 (§204: 프레임도 넘버링 폐지 — 원본 이름 그대로. 넘버링은 애니메이션 기능에서 재활용 예정)
  const copyName = (u) => u.name;
  // 프레임 생성 (그리기 툴 F) — fill 기본값은 현재 컬러(없으면 createFrameParams 기본)
  // grid: 그리드 파라미터 오버라이드 { margin, gutterX, gutterY } (퀵프레임 설정, §116)
  function createFrame(x, y, W = 300, H = 200, fill = null, grid = null) {
    const params = createFrameParams({ ...(fill ? { fill } : {}), ...(grid || {}) });
    params.W = clamp(Math.round(W), LIMITS.unitMin, UNIT_MAX);
    params.H = clamp(Math.round(H), LIMITS.unitMin, UNIT_MAX);
    return pushUnit(params, Math.round(x), Math.round(y), null, 'frame', 'Frame'); // §204: 넘버링 폐지
  }
  function createUnit(x = 0, y = 0) {
    const params = createParams();
    return pushUnit(params, Math.round(x - params.W / 2), Math.round(y - params.H / 2), null, 'unit', 'Default Unit');
  }
  // 프리셋 파라미터로 유닛 생성 (구버전 프리셋은 createParams 기본값으로 보충) — 이름 = 프리셋 이름 (§202)
  function createUnitFrom(params, x = 0, y = 0, name = null) {
    const p = createParams({ ...params });
    return pushUnit(p, Math.round(x - p.W / 2), Math.round(y - p.H / 2), null, 'unit', name);
  }

  // ── 패턴 프리셋 (§205) — 프레임 + 소유 유닛 전체(파라미터·상대배치·그룹·링크)를 캡처/재생성 ──
  function capturePattern(frameId) {
    const f = doc.units.find((u) => u.id === frameId && u.type === 'frame');
    if (!f) return null;
    const owned = frameOwnedUnits([frameId]);
    const gids = new Set();
    for (const u of owned) u.groups.forEach((g) => gids.add(g));
    return {
      frame: { ...f.params },
      units: owned.map((u) => ({
        name: u.name, dx: u.x - f.x, dy: u.y - f.y,
        params: { ...u.params }, groups: [...u.groups], links: { ...u.links }, // §220: 범주형 링크
      })),
      groupNames: Object.fromEntries([...gids].filter((g) => doc.groupNames[g] != null).map((g) => [g, doc.groupNames[g]])),
    };
  }
  // 패턴 배치: (cx, cy) 중심으로 프레임+유닛 통째 재생성 — 그룹/링크는 새 id로 재구성 (§205)
  function placePattern(pat, cx, cy) {
    const fp = createFrameParams({ ...pat.frame });
    const fx = Math.round(cx - fp.W / 2);
    const fy = Math.round(cy - fp.H / 2);
    doc.units.push({ id: nextId++, type: 'frame', name: pat.name || 'Frame', x: fx, y: fy, groups: [], links: emptyLinks(), pair: null, home: null, params: fp });
    const frame = doc.units[doc.units.length - 1];
    const gidMap = new Map();
    const lidMap = new Map();
    const mapLid = (l) => {
      if (l == null) return null;
      if (!lidMap.has(l)) lidMap.set(l, nextLink++);
      return lidMap.get(l);
    };
    for (const u of pat.units ?? []) {
      const groups = (u.groups ?? []).map((g) => {
        if (!gidMap.has(g)) {
          gidMap.set(g, nextGroup++);
          doc.groupNames[gidMap.get(g)] = pat.groupNames?.[g] ?? `Group-${gidMap.get(g)}`;
        }
        return gidMap.get(g);
      });
      // §220: 구 패턴(linkId+linkScopes) → 범주형 links 이관 후 새 lid로 재구성
      let srcLinks = u.links;
      if (!srcLinks) {
        srcLinks = emptyLinks();
        if (u.linkId != null) {
          const sc = { ...linkScopeDefault(), ...(pat.linkScopes?.[u.linkId] ?? {}) };
          for (const c of LINK_CATS) if (sc[c] !== false) srcLinks[c] = u.linkId;
        }
      }
      const links = emptyLinks();
      for (const c of LINK_CATS) links[c] = mapLid(srcLinks[c]);
      doc.units.push({
        id: nextId++, type: 'unit', name: u.name ?? 'Default Unit',
        x: fx + u.dx, y: fy + u.dy, groups, links, pair: null, home: null, params: createParams({ ...u.params }),
      });
    }
    cleanupLinks();
    pruneMeta();
    setSelection([frame.id]);
    doc.activeId = frame.id;
    return frame;
  }

  // ── §223: 애니메이션 페어/엣지 (Phase B) ──────────────────────
  // 페어(pair) = 키프레임 간 대응 관계(계보 id) — 파라미터 동기화 없음 (§220 사용자 확정).
  // opt-드래그 복제 시 프레임+소유 유닛을 사본으로 만들고 pair를 공유한다.
  // 파라미터 링크(lid)·그룹(gid)은 사본끼리 새 id로 재구성 — 키프레임 간 동기화 원천 차단.
  function duplicatePairedFrame(frameId, dx = 0, dy = 0) {
    const f = doc.units.find((u) => u.id === frameId && u.type === 'frame');
    if (!f) return null;
    const owned = frameOwnedUnits([frameId]);
    if (f.pair == null) f.pair = nextPair++;
    // §262: 키프레임 네이밍 — "Base K<n>": 원본이 무접미면 K1 부여, 사본 = 체인(계보) 내 최대+1
    const nm = f.name.match(/^(.*)\sK(\d+)$/);
    const baseName = (nm ? nm[1] : f.name).trim() || 'Frame';
    if (!nm) f.name = `${baseName} K1`;
    let maxK = 0;
    for (const u of doc.units) {
      if (u.type !== 'frame' || u.pair !== f.pair) continue;
      const mk = u.name.match(/\sK(\d+)$/);
      if (mk) maxK = Math.max(maxK, Number(mk[1]));
    }
    const copyName = `${baseName} K${maxK + 1}`;
    for (const u of owned) {
      if (u.pair == null) u.pair = nextPair++;
      if (u.home == null) u.home = f.id; // §225: 원본 소속 확정
    }
    const gidMap = new Map();
    const lidMap = new Map();
    const mapG = (g) => {
      if (!gidMap.has(g)) {
        gidMap.set(g, nextGroup++);
        doc.groupNames[gidMap.get(g)] = doc.groupNames[g] ?? `Group-${gidMap.get(g)}`;
      }
      return gidMap.get(g);
    };
    const mapL = (l) => {
      if (l == null) return null;
      if (!lidMap.has(l)) lidMap.set(l, nextLink++);
      return lidMap.get(l);
    };
    const nf = {
      id: nextId++, type: 'frame', name: copyName, x: f.x + dx, y: f.y + dy, // §262: Base K<n>
      groups: [], links: emptyLinks(), pair: f.pair, home: null, params: { ...f.params },
    };
    doc.units.push(nf);
    const copies = [doc.units[doc.units.length - 1]];
    for (const u of owned) {
      const links = emptyLinks();
      for (const c of LINK_CATS) links[c] = mapL(u.links[c]);
      doc.units.push({
        id: nextId++, type: u.type, name: u.name, x: u.x + dx, y: u.y + dy,
        groups: u.groups.map(mapG), links, pair: u.pair, home: nf.id, params: { ...u.params },
      });
      copies.push(doc.units[doc.units.length - 1]);
    }
    setSelection(copies.map((c) => c.id));
    doc.activeId = copies[0].id;
    return { frame: copies[0], copies };
  }
  // §225: 키프레임 소유 유닛 — home(페어 복제 시 확정) 우선, 없으면 기하 소유 폴백.
  // 키프레임끼리 겹쳐 있어도 소속이 흔들리지 않는다 (§220: "소속 = 페어 멤버십").
  function animOwnedUnits(frameId) {
    const byHome = doc.units.filter((u) => u.home === frameId && u.type !== 'frame');
    // home이 없는 유닛(페어 복제 이전 생성분)만 기하 소유로 보충 — 타 키프레임 소속은 절대 끼지 않음
    const fallback = frameOwnedUnits([frameId]).filter((u) => u.home == null);
    return [...byHome, ...fallback];
  }
  // §228: 구 문서 페어 소속 복구 — home이 없는 페어 유닛(§225 이전 생성분)을 두 키프레임에
  // 중심 거리 기준으로 배정 (듀오가 한쪽에 몰리면 먼 쪽을 반대편으로). 연결/선택 시 호출 — 멱등.
  function repairAnimHomes(fromId, toId) {
    const f = doc.units.find((u) => u.id === fromId);
    const g = doc.units.find((u) => u.id === toId);
    if (!f || !g) return;
    const groups = new Map();
    for (const u of doc.units) {
      if (u.type !== 'frame' && u.pair != null && u.home == null) {
        if (!groups.has(u.pair)) groups.set(u.pair, []);
        groups.get(u.pair).push(u);
      }
    }
    const cdist = (u, fr) => Math.hypot(
      u.x + u.params.W / 2 - (fr.x + fr.params.W / 2),
      u.y + u.params.H / 2 - (fr.y + fr.params.H / 2)
    );
    for (const [, us] of groups) {
      for (const u of us) u.home = cdist(u, f) <= cdist(u, g) ? fromId : toId;
      if (us.length === 2 && us[0].home === us[1].home) {
        const anchor = us[0].home === fromId ? f : g;
        const far = cdist(us[0], anchor) > cdist(us[1], anchor) ? us[0] : us[1];
        far.home = us[0].home === fromId ? toId : fromId;
      }
    }
  }
  // §235: 페어 해제 — 프레임 우클릭 "Unpair keyframe". 그 프레임과 소유(home) 유닛의 페어·소속을
  // 걷어내고 물린 연결도 제거 → 일반 프레임으로 복귀 (삭제 차단 해제). 파트너 키프레임은 불변.
  function unpairFrame(frameId) {
    const f = doc.units.find((u) => u.id === frameId && u.type === 'frame');
    if (!f || f.pair == null) return null;
    f.pair = null;
    let n = 0;
    for (const u of doc.units) {
      if (u.home === frameId) {
        u.pair = null;
        u.home = null;
        n += 1;
      }
    }
    doc.animEdges = doc.animEdges.filter((e) => e.from !== frameId && e.to !== frameId);
    f.name = f.name.replace(/\sK\d+$/, ''); // §266: 키프레임 접미 자동 제거
    pruneMeta(); // §254: 남은 짝이 혼자가 되면 자동 초기화
    return { name: f.name, units: n };
  }
  // 키프레임 연결 — 우(from)→좌(to)만, 노드당 1연결(재연결 = 기존 이설, §220 사용자 확정).
  // A→B→A 사이클 = 루프 재생으로 해석(허용), 자기 연결만 차단.
  function connectAnim(fromId, toId) {
    if (fromId === toId) return null;
    const isFrame = (id) => doc.units.some((u) => u.id === id && u.type === 'frame');
    if (!isFrame(fromId) || !isFrame(toId)) return null;
    doc.animEdges = doc.animEdges.filter((e) => e.from !== fromId && e.to !== toId);
    const edge = { from: fromId, to: toId, duration: 1000, curve: [0.33, 0, 0.67, 1] }; // §227: 기본 = Ease 33·33
    doc.animEdges.push(edge);
    repairAnimHomes(fromId, toId); // §228: 구 문서 소속 복구
    return edge;
  }
  // side: 'right' = 나가는 연결(from) / 'left' = 들어오는 연결(to) 해제 (빈 곳 드롭 = 해제)
  function disconnectAnim(frameId, side = 'right') {
    const n = doc.animEdges.length;
    doc.animEdges = doc.animEdges.filter((e) => (side === 'right' ? e.from !== frameId : e.to !== frameId));
    return doc.animEdges.length !== n;
  }

  function renameActive(name) {
    const t = name.trim();
    if (t && active.value) active.value.name = t;
  }

  function deleteSelected() {
    if (!doc.selectedIds.length) return;
    const keep = doc.units.filter((u) => !doc.selectedIds.includes(u.id));
    doc.units.splice(0, doc.units.length, ...keep);
    doc.selectedIds = [];
    doc.activeId = keep.length ? keep[keep.length - 1].id : null;
    cleanupLinks(); // 1개만 남은 링크 그룹 해제
    // 멤버가 1개만 남은 그룹 레이어 제거
    const gcount = {};
    for (const u of doc.units) for (const g of u.groups) gcount[g] = (gcount[g] || 0) + 1;
    for (const u of doc.units) u.groups = u.groups.filter((g) => gcount[g] >= 2);
    pruneMeta();
  }

  function duplicateActive() {
    const src = active.value;
    if (!src) return;
    return pushUnit({ ...src.params }, src.x + src.params.W + 80, src.y, src.links, src.type);
  }
  // Alt+드래그 복제: 같은 위치에 사본 생성 (파라미터는 전부 원시값 — 얕은 복사로 완전 독립)
  function duplicateFrom(u) {
    return pushUnit({ ...u.params }, u.x, u.y, u.links, u.type, u.name);
  }
  // 복수 유닛 동시 복제 — 상대 위치 그대로, 그룹 구조는 사본끼리 새 gid로 재구성, 링크 승계
  function duplicateUnits(units) {
    const gidMap = new Map(); // 원본 gid → 사본 gid
    const copies = [];
    for (const u of units) {
      const id = nextId++;
      const groups = u.groups.map((g) => {
        if (!gidMap.has(g)) {
          gidMap.set(g, nextGroup++);
          doc.groupNames[gidMap.get(g)] = doc.groupNames[g] ?? `Group-${gidMap.get(g)}`;
        }
        return gidMap.get(g);
      });
      doc.units.push({
        id, type: u.type, name: copyName(u), x: u.x, y: u.y,
        groups, links: { ...u.links }, pair: null, home: null, params: { ...u.params },
      });
      copies.push(doc.units[doc.units.length - 1]);
    }
    setSelection(copies.map((c) => c.id));
    return copies;
  }
  // 선택 유닛 키보드 이동 (방향키 1px / Shift 10px)
  function nudgeSelected(dx, dy) {
    for (const u of doc.units) {
      if (doc.selectedIds.includes(u.id)) {
        u.x += dx;
        u.y += dy;
      }
    }
  }

  // ---- 활성 유닛 파라미터 액션 ----
  function normalize(p) {
    const odd = p.orientation === 90 || p.orientation === 270;
    const max = Math.min(GUTTER_MAX, (odd ? p.H : p.W) / p.cols);
    if (p.gutterPx > max) p.gutterPx = Math.floor(max * 100) / 100;
  }
  function setSize(patch, each = false) {
    // 멀티선택: 통합 bbox를 목표 치수로 비례 스케일 (앵커 = bbox 좌상단)
    // each = true (패널 EACH 토글): 선택된 각 유닛의 W/H에 같은 값을 개별 적용
    if (doc.selectedIds.length > 1) {
      const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
      if (each) {
        withGeomOp(() => {
          for (const u of sel) {
            if (patch.W != null) u.params.W = clamp(Math.round(patch.W), LIMITS.unitMin, UNIT_MAX);
            if (patch.H != null) u.params.H = clamp(Math.round(patch.H), LIMITS.unitMin, UNIT_MAX);
            normalize(u.params);
          }
        });
        return;
      }
      const bb = bboxOf(sel);
      const sx = patch.W != null ? Math.max(patch.W, LIMITS.unitMin) / (bb.maxX - bb.minX) : 1;
      const sy = patch.H != null ? Math.max(patch.H, LIMITS.unitMin) / (bb.maxY - bb.minY) : 1;
      withGeomOp(() => {
        for (const u of sel) {
          u.x = bb.minX + (u.x - bb.minX) * sx;
          u.y = bb.minY + (u.y - bb.minY) * sy;
          u.params.W = clamp(Math.round(u.params.W * sx), LIMITS.unitMin, UNIT_MAX);
          u.params.H = clamp(Math.round(u.params.H * sy), LIMITS.unitMin, UNIT_MAX);
          normalize(u.params);
        }
      });
      return;
    }
    if (!active.value) return;
    const p = active.value.params;
    if (patch.W != null) p.W = clamp(Math.round(patch.W), LIMITS.unitMin, UNIT_MAX);
    if (patch.H != null) p.H = clamp(Math.round(patch.H), LIMITS.unitMin, UNIT_MAX);
    normalize(p);
  }
  function setAspect(v, each = false) {
    if (doc.selectedIds.length > 1) {
      const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
      if (each) {
        // 각 유닛이 자기 W 기준으로 목표 비율 (H = W / v)
        withGeomOp(() => {
          for (const u of sel) {
            u.params.H = clamp(Math.round(u.params.W / v), LIMITS.unitMin, UNIT_MAX);
            normalize(u.params);
          }
        });
        return;
      }
      const bb = bboxOf(sel);
      setSize({ H: (bb.maxX - bb.minX) / v });
      return;
    }
    if (active.value) setSize({ H: active.value.params.W / v });
  }
  // Δa/Δb 커플링: 합이 AB_SUM_MAX를 넘으면 반대쪽을 밀어냄
  // → 경사변 수평 런 (1-a-b) = 10% 고정 유지, 사다리꼴 역전 구조적 방지
  function setA(v) {
    if (!active.value) return;
    const p = active.value.params;
    p.a = clamp(v, A_MIN, A_MAX);
    if (p.a + p.b > AB_SUM_MAX) p.b = Math.max(B_MIN, +(AB_SUM_MAX - p.a).toFixed(4));
  }
  function setB(v) {
    if (!active.value) return;
    const p = active.value.params;
    p.b = clamp(v, B_MIN, B_MAX);
    if (p.a + p.b > AB_SUM_MAX) p.a = Math.max(A_MIN, +(AB_SUM_MAX - p.b).toFixed(4));
  }
  function flipActive() {
    if (animLockBlock(active.value)) return; // §227
    if (!active.value) return;
    const p = active.value.params;
    p.threadDir = p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR';
  }
  // 로컬 좌우 미러 = flipX 계수 토글 (내부 rate/direction/threadDir은 저작값 그대로)
  function mirrorLocalX(p) {
    p.flipX = !p.flipX;
  }
  // 로컬 상하 미러 = 180° 회전 + 좌우 미러 (W/H 불변)
  function mirrorLocalY(p) {
    p.orientation = (p.orientation + 180) % 360;
    p.flipX = !p.flipX;
  }
  const isOdd = (p) => p.orientation === 90 || p.orientation === 270;
  // 화면 기준 좌우 반전 — §262: withGeomOp(워처 raw 복사 차단) + orientation 스코프 링크는
  // 멤버 **각자 상태 기준** 미러(rotate와 동일 확산 문법) + 짝 동기
  function flipUnit() {
    if (!active.value) return;
    withGeomOp(() => {
      const ids = expandLinkByScope([active.value.id], 'orientation');
      for (const u of doc.units) if (ids.has(u.id) && u.type !== 'frame') mirrorScreen(u.params, 'h');
      syncFlipToMates(ids, 'h');
    });
  }
  // 스와치: 선택 유닛(없으면 활성)에 fill 적용 — 링크 확산은 color 스코프가 켜진 링크만
  function setFill(color) {
    const base = doc.selectedIds.length ? doc.selectedIds : doc.activeId != null ? [doc.activeId] : [];
    const ids = expandLinkByScope(base, 'color');
    for (const u of doc.units) {
      if (!ids.has(u.id)) continue;
      // 프레임이 스트로크 전용(fill off)이면 스와치 적용 대상 = 외곽선 색 (보이는 색을 바꿈, §75·§110)
      if (u.type === 'frame' && !u.params.fillOn && u.params.strokeOn) u.params.stroke = color;
      else u.params.fill = color;
    }
  }

  // ---- 그룹 (⌘G / ⌘⇧G) — 중첩 지원: u.groups = [안쪽 ... 바깥쪽] ----
  const outermost = (u) => (u.groups.length ? u.groups[u.groups.length - 1] : null);
  function groupMemberIds(gid) {
    return doc.units.filter((u) => u.groups.includes(gid)).map((u) => u.id);
  }
  // 클릭/마퀴 선택 확장: 각 유닛의 최외곽 그룹 전체 포함
  function expandGroups(ids) {
    const out = new Set(ids);
    for (const u of doc.units) {
      if (out.has(u.id)) {
        const g = outermost(u);
        if (g) for (const id of groupMemberIds(g)) out.add(id);
      }
    }
    return [...out];
  }
  function groupSelected() {
    const sel = doc.selectedIds;
    if (sel.length < 2) return; // 단일 유닛/단일 그룹의 중복 그룹 방지
    const units = doc.units.filter((u) => sel.includes(u.id));
    const outs = [...new Set(units.map(outermost))];
    if (outs.length === 1 && outs[0] != null && groupMemberIds(outs[0]).length === sel.length) {
      return; // 이미 완전한 단일 그룹
    }
    const gid = nextGroup++;
    for (const u of units) u.groups.push(gid); // 바깥 레이어로 추가 — 내부 구조 유지
    doc.groupNames[gid] = `Group-${gid}`;
  }
  function renameGroup(gid, name) {
    const t = String(name).trim();
    if (t && doc.groupNames[gid] != null) doc.groupNames[gid] = t;
  }
  // 1레이어 언그룹: 선택된 유닛들의 최외곽 그룹만 벗김
  function ungroupSelected() {
    const outs = new Set(
      doc.units.filter((u) => doc.selectedIds.includes(u.id)).map(outermost).filter(Boolean)
    );
    for (const u of doc.units) {
      if (doc.selectedIds.includes(u.id) && outs.has(outermost(u))) u.groups.pop();
    }
    pruneMeta();
  }

  // ---- 링크 (파라미터 상시 동기화) — §220: 범주형 멤버십 ----
  function linkMemberIds(lid) {
    return doc.units.filter((u) => LINK_CATS.some((c) => u.links[c] === lid)).map((u) => u.id);
  }
  // 선택 전체가 이미 같은 링크면 해제, 아니면 새 링크로 통합.
  // scope: 링크 생성 시 초기 동기화 범주 (패널 드래프트 — 없으면 기본값)
  function toggleLinkSelected(scope = null) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (sel.length < 2) return null;
    if (new Set(sel.map((u) => u.type)).size > 1) return { action: 'mixed' }; // 타입 혼합 링크 불가
    const lids = [...new Set(sel.map((u) => primaryLid(u)))];
    // §129: 전체든 서브셋이든 단일 링크그룹 소속 선택이면 = 언링크 (서브셋은 선택분만 이탈,
    // 남은 멤버가 1개면 cleanupLinks가 그룹 자동 소멸). 버튼 라벨(unlink parameters)과 일치.
    if (lids.length === 1 && lids[0] != null) {
      for (const u of sel) u.links = emptyLinks();
      cleanupLinks();
      pruneMeta();
      return { action: 'unlinked', count: sel.length };
    } else {
      const lid = nextLink++;
      const sc = scope ? { ...linkScopeDefault(), ...scope } : linkScopeDefault();
      // 링크 생성 시 활성 유닛(선택에 없으면 첫 유닛) 기준으로 파라미터 즉시 통일.
      // 단, 스코프가 꺼진 범주(orientation 등)는 각 유닛의 값을 유지 (§58 드래프트 반영)
      const src = sel.find((u) => u.id === doc.activeId) ?? sel[0];
      const patch = {};
      for (const k in src.params) {
        const cat = KEY_CAT[k];
        if (!cat || sc[cat] !== false) patch[k] = src.params[k];
      }
      for (const u of sel) {
        u.links = emptyLinks();
        for (const c of LINK_CATS) if (sc[c] !== false) u.links[c] = lid;
        if (u !== src) applyLinkPatch(u, patch, src.params); // §202: W/H 로컬 치수·중심 앵커 규칙 공유
      }
      cleanupLinks(); // 기존 링크에서 일부만 편입된 경우, 밖에 홀로 남은 멤버 해제
      pruneMeta();
      return { action: 'linked', count: sel.length, src: src.name };
    }
  }
  // §129: 링크그룹 서브셋 분리 — 선택된 멤버들을 새 링크그룹으로 (스코프 = 원본 복사 + cat 토글).
  // 진입점은 서브셋 선택 상태의 스코프 칩 조작. 원본 그룹은 남은 멤버가 1개면 자동 소멸.
  function splitLinkSelected(cat = null) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (sel.length < 2) return null;
    const lids = [...new Set(sel.map((u) => primaryLid(u)))];
    if (lids.length !== 1 || lids[0] == null) return null;
    if (linkMemberIds(lids[0]).length === sel.length) return null; // 전체 선택은 일반 토글 경로
    // §220: 현 범주 멤버십에서 스코프 도출 + cat 토글 → 선택분을 새 lid로
    const sc = {};
    for (const c of LINK_CATS) sc[c] = sel[0].links[c] != null;
    if (cat) sc[cat] = !sc[cat];
    const lid = nextLink++;
    for (const u of sel) {
      u.links = emptyLinks();
      for (const c of LINK_CATS) if (sc[c]) u.links[c] = lid;
    }
    cleanupLinks();
    pruneMeta();
    return { count: sel.length, lid };
  }
  // 단일 유닛을 자기 링크에서 제거 (나머지 멤버는 유지, 1개만 남으면 자동 해체)
  function unlinkUnit(id) {
    const u = doc.units.find((x) => x.id === id);
    if (!u || primaryLid(u) == null) return null;
    u.links = emptyLinks();
    cleanupLinks();
    pruneMeta();
    return { name: u.name };
  }
  function cleanupLinks() {
    // §220: lid별 멤버 수(유닛당 1회) — 2 미만이면 그 lid의 범주 멤버십 전부 해제
    const counts = {};
    for (const u of doc.units) {
      const seen = new Set();
      for (const c of LINK_CATS) {
        const l = u.links[c];
        if (l != null && !seen.has(l)) { seen.add(l); counts[l] = (counts[l] || 0) + 1; }
      }
    }
    for (const u of doc.units) {
      for (const c of LINK_CATS) if (u.links[c] != null && counts[u.links[c]] < 2) u.links[c] = null;
    }
  }
  // §264: 범주별 링크그룹 직접 지정 — 다중 링크 UI(범주 행 × 그룹 번호)의 단일 경로.
  // v: lid(기존 그룹 합류) | null(그 범주 해제) | 'new'(새 그룹 — 선택 2개 이상에서 의미)
  function setCategoryLink(ids, cat, v) {
    const lid = v === 'new' ? nextLink++ : v;
    for (const u of doc.units) {
      if (!ids.includes(u.id) || u.type === 'frame') continue;
      u.links[cat] = lid;
    }
    cleanupLinks(); // 1멤버 그룹 자동 소멸 규칙 공유
  }
  // dir: +1 시계 / -1 반시계. 캔버스 W/H 스왑 + orientation 90° 스텝.
  // 회전은 링크 멤버 각각에 자기 중심 기준으로 직접 적용
  // (미러 패치는 W/H만 복사해 위치가 어긋나므로 여기서 위치까지 보정.
  //  반올림 없이 소수 좌표 유지 — 반복 회전 시 누적 오차 방지)
  function rotate(dir) {
    const u = active.value;
    if (!u) return;
    // §245: 프레임 회전 = 내부(기하 소속) 유닛 동반 (§261: 잠금 게이트 폐기 — 짝 동기로 대체)
    const carried = u.type === 'frame' ? frameOwnedUnits([u.id]) : [];
    // 링크 확산은 orientation 스코프가 켜진 링크만 (공용 헬퍼 경유)
    const ids = expandLinkByScope([u.id], 'orientation');
    const targets = [u, ...doc.units.filter((m) => m !== u && ids.has(m.id))];
    const C = { x: u.x + u.params.W / 2, y: u.y + u.params.H / 2 }; // 프레임 중심 (회전 불변)
    withGeomOp(() => {
      for (const t of targets) {
        const p = t.params;
        const cx = t.x + p.W / 2;
        const cy = t.y + p.H / 2;
        [p.W, p.H] = [p.H, p.W];
        p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
        t.x = cx - p.W / 2;
        t.y = cy - p.H / 2;
        normalize(p);
      }
      // §245: 동반 유닛 — 프레임 중심 기준 블록 회전 (rotateSelected와 동일 수식: 중심 재배치 + 자기 회전)
      for (const m of carried) {
        if (targets.includes(m)) continue;
        const p = m.params;
        const ucx = m.x + p.W / 2;
        const ucy = m.y + p.H / 2;
        const dx = ucx - C.x;
        const dy = ucy - C.y;
        const ncx = dir > 0 ? C.x - dy : C.x + dy;
        const ncy = dir > 0 ? C.y + dx : C.y - dx;
        [p.W, p.H] = [p.H, p.W];
        p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
        m.x = ncx - p.W / 2;
        m.y = ncy - p.H / 2;
        normalize(p);
      }
      syncRotateToMates(new Set([...targets, ...carried].map((t) => t.id)), dir);
    });
  }
  // §261: 짝 동기 — 회전: 짝 유닛들을 **자기 중심**에서 같은 방향으로 회전 (위치 불변, 파라미터 대응 유지)
  function spinOwn(m, dir) {
    const p = m.params;
    const cx = m.x + p.W / 2;
    const cy = m.y + p.H / 2;
    [p.W, p.H] = [p.H, p.W];
    p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
    m.x = cx - p.W / 2;
    m.y = cy - p.H / 2;
    normalize(p);
  }
  function syncRotateToMates(doneIds, dir) {
    for (const m of pairMates(doneIds)) spinOwn(m, dir);
  }
  // §261: 짝 동기 — 미러: 화면축 기준 미러를 각자의 orientation 상태에 맞춰 적용 (위치 불변)
  const mirrorScreen = (p, axis) => {
    if (axis === 'h') (isOdd(p) ? mirrorLocalY(p) : mirrorLocalX(p));
    else (isOdd(p) ? mirrorLocalX(p) : mirrorLocalY(p));
  };
  function syncFlipToMates(doneIds, axis) {
    for (const m of pairMates(doneIds)) mirrorScreen(m.params, axis);
  }
  // 화면 기준 상하 반전 — §262: flipUnit과 동일 문법 (withGeomOp + 링크 각자 미러 + 짝 동기)
  function flipUnitV() {
    if (!active.value) return;
    withGeomOp(() => {
      const ids = expandLinkByScope([active.value.id], 'orientation');
      for (const u of doc.units) if (ids.has(u.id) && u.type !== 'frame') mirrorScreen(u.params, 'v');
      syncFlipToMates(ids, 'v');
    });
  }
  // 선택 전체 플립 (통합 바운딩박스 기준): 각 유닛을 화면축 미러 + 위치를 bbox 중심 대칭으로 재배치
  // §266: orientation 링크 확산 — UI 플립은 전부 이 경로라, 확산이 없으면 링크 멤버 일부만
  // 변경되어 발산 감지가 그룹을 자동 분리("링크가 풀림" — 사용자 리포트). 선택 밖 멤버는
  // 위치 유지한 채 각자 상태 기준으로만 미러 (rotate의 링크 문법과 동일).
  function flipSelected(axis) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id)); // §261: 잠금 폐기 — 짝 동기
    if (!sel.length) return;
    const bb = bboxOf(sel);
    withGeomOp(() => {
      for (const u of sel) {
        const p = u.params;
        mirrorScreen(p, axis);
        if (axis === 'h') u.x = bb.minX + bb.maxX - (u.x + p.W);
        else u.y = bb.minY + bb.maxY - (u.y + p.H);
      }
      const selIds = new Set(sel.map((u) => u.id));
      const ids = expandLinkByScope([...selIds], 'orientation');
      for (const u of doc.units) {
        if (!ids.has(u.id) || selIds.has(u.id) || u.type === 'frame') continue;
        mirrorScreen(u.params, axis); // 링크 멤버 — 제자리 미러
      }
      syncFlipToMates(ids, axis);
    });
  }
  // 선택 전체를 하나의 덩어리처럼 90° 회전 — 통합 bbox 중심 기준으로 각 유닛 중심을 회전시키고 유닛 자체도 회전
  function rotateSelected(dir) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (!sel.length) return;
    // §245: 선택에 프레임이 있으면 내부(기하 소속) 유닛 동반 — bbox 기준은 선택만 (동반분은 같은 변환)
    const carried = frameOwnedUnits(sel.filter((u) => u.type === 'frame').map((u) => u.id))
      .filter((m) => !sel.includes(m)); // §261: 잠금 폐기 — 짝 동기
    const bb = bboxOf(sel);
    const C = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    withGeomOp(() => {
      for (const u of [...sel, ...carried]) {
        const p = u.params;
        const ucx = u.x + p.W / 2, ucy = u.y + p.H / 2;
        const dx = ucx - C.x, dy = ucy - C.y;
        const ncx = dir > 0 ? C.x - dy : C.x + dy;
        const ncy = dir > 0 ? C.y + dx : C.y - dx;
        [p.W, p.H] = [p.H, p.W];
        p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
        u.x = ncx - p.W / 2;
        u.y = ncy - p.H / 2;
        normalize(p);
      }
      // §266: orientation 링크 확산 — 선택 밖 멤버는 자기 중심 스핀 (flipSelected와 동일 사유)
      const doneIds = new Set([...sel, ...carried].map((u) => u.id));
      const ids = expandLinkByScope([...doneIds], 'orientation');
      for (const m of doc.units) {
        if (!ids.has(m.id) || doneIds.has(m.id) || m.type === 'frame') continue;
        spinOwn(m, dir);
      }
      syncRotateToMates(ids, dir);
    });
  }
  // 선택 전체 복제 — 통합 bbox 폭 + 80px 오른쪽에 배치 (단일 복제 버튼과 동일 규칙)
  function duplicateSelectedOffset() {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (!sel.length) return;
    const bb = bboxOf(sel);
    const copies = duplicateUnits(sel);
    for (const c of copies) c.x += bb.maxX - bb.minX + 80;
    return copies;
  }
  // 블렌드: 유닛을 축 방향으로 반복 복제 — 매 스텝 진행축 크기에 scale 누적, 간격 고정.
  // 결과 = 자동 그룹(Blend-N)만. 자동 링크는 §80에서 제거 — 필요하면 그룹 선택 후 패널 LINK로.
  function blendFrom(u, { axis = 'v', count = 4, gap = 20, scale = 0.8 }) {
    count = clamp(Math.round(count), 1, 100);
    scale = clamp(scale, 0.05, 3);
    const created = [];
    let cursor = axis === 'v' ? u.y + u.params.H : u.x + u.params.W;
    let size = axis === 'v' ? u.params.H : u.params.W;
    for (let i = 0; i < count; i++) {
      size *= scale;
      const p = { ...u.params };
      if (axis === 'v') p.H = clamp(Math.round(size), LIMITS.unitMin, UNIT_MAX);
      else p.W = clamp(Math.round(size), LIMITS.unitMin, UNIT_MAX);
      // 배율은 유닛 크기에만 적용, 간격은 고정 (§62)
      const x = axis === 'v' ? u.x : Math.round(cursor + gap);
      const y = axis === 'v' ? Math.round(cursor + gap) : u.y;
      const id = nextId++;
      doc.units.push({
        id, type: u.type, name: copyName(u),
        x, y, groups: [], links: emptyLinks(), pair: null, params: p,
      });
      const nu = doc.units[doc.units.length - 1];
      normalize(nu.params);
      created.push(nu);
      cursor = axis === 'v' ? y + nu.params.H : x + nu.params.W;
    }
    const all = [u, ...created];
    const gid = nextGroup++;
    for (const m of all) m.groups.push(gid);
    doc.groupNames[gid] = `Blend-${gid}`;
    pruneMeta();
    setSelection(all.map((m) => m.id));
    return created;
  }

  // 그룹 블렌드 (§80): 단일 그룹 전체를 하나의 블록으로 축 방향 반복 복제.
  // 진행축 치수·상대 배치만 배율 누적(교차축 유지), gap = 블록 bbox 사이 간격.
  // 결과 = 사본별 서브그룹 + 전체 Blend-N 그룹(소스 포함). 링크 생성 없음.
  function blendUnitsFrom(units, { axis = 'v', count = 4, gap = 20, scale = 0.8 }) {
    count = clamp(Math.round(count), 1, 100);
    scale = clamp(scale, 0.05, 3);
    const bb = bboxOf(units);
    const created = [];
    let factor = 1;
    let cursor = axis === 'v' ? bb.maxY : bb.maxX;
    for (let i = 0; i < count; i++) {
      factor *= scale;
      const start = Math.round(cursor + gap);
      const gid = nextGroup++;
      let hi = start;
      for (const u of units) {
        const p = { ...u.params };
        let x, y;
        if (axis === 'v') {
          p.H = clamp(Math.round(u.params.H * factor), LIMITS.unitMin, UNIT_MAX);
          x = u.x;
          y = start + Math.round((u.y - bb.minY) * factor);
        } else {
          p.W = clamp(Math.round(u.params.W * factor), LIMITS.unitMin, UNIT_MAX);
          x = start + Math.round((u.x - bb.minX) * factor);
          y = u.y;
        }
        const id = nextId++;
        doc.units.push({
          id, type: u.type, name: copyName(u),
          x, y, groups: [gid], links: emptyLinks(), pair: null, params: p,
        });
        const nu = doc.units[doc.units.length - 1];
        normalize(nu.params);
        created.push(nu);
        const end = axis === 'v' ? nu.y + nu.params.H : nu.x + nu.params.W;
        if (end > hi) hi = end;
      }
      cursor = hi;
    }
    // 소스의 기존 그룹 구조는 유지, 전체를 최외곽 Blend-N으로 감쌈
    const outer = nextGroup++;
    for (const m of [...units, ...created]) m.groups.push(outer);
    doc.groupNames[outer] = `Blend-${outer}`;
    pruneMeta();
    setSelection([...units, ...created].map((m) => m.id));
    return created;
  }

  // z-오더 조정 (Q/W): 선택을 배열 끝(앞으로)/처음(뒤로) — 상대 순서 유지.
  // 렌더는 타입 레이어(사각형 < 유닛) 안에서 배열 순서를 따름.
  function orderSelected(where) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (!sel.length) return 0;
    const rest = doc.units.filter((u) => !doc.selectedIds.includes(u.id));
    const arr = where === 'front' ? [...rest, ...sel] : [...sel, ...rest];
    doc.units.splice(0, doc.units.length, ...arr);
    return sel.length;
  }

  // 스마트 그리드 배열 (G): 선택 블록들을 선택 bbox 좌상단 기준 그리드로 재배치.
  // 읽기 순서(위→아래, 왼→오른쪽) 보존, 셀 크기 = 해당 행/열의 블록 최대 치수.
  // 간격은 축별 gapX/gapY (§198: axis 모드 폐지 — 항상 그리드, gap만 축 분리).
  // columns 0 = 자동 (ceil(sqrt(n))).
  function arrangeGrid({ gapX = 40, gapY = 40, columns = 0 } = {}) {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length < 2) return 0;
    const items = blocks.map((b) => ({ b, bb: bboxOf(b), carry: carryOf(b) }));
    const avgH = items.reduce((t, i) => t + (i.bb.maxY - i.bb.minY), 0) / items.length;
    items.sort((a, z) => {
      const ay = (a.bb.minY + a.bb.maxY) / 2;
      const zy = (z.bb.minY + z.bb.maxY) / 2;
      if (Math.abs(ay - zy) > avgH / 2) return ay - zy;
      return (a.bb.minX + a.bb.maxX) / 2 - (z.bb.minX + z.bb.maxX) / 2;
    });
    const cols = clamp(Math.round(columns) || Math.ceil(Math.sqrt(items.length)), 1, items.length);
    const rows = Math.ceil(items.length / cols);
    const colW = Array(cols).fill(0);
    const rowH = Array(rows).fill(0);
    items.forEach((it, i) => {
      colW[i % cols] = Math.max(colW[i % cols], it.bb.maxX - it.bb.minX);
      rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], it.bb.maxY - it.bb.minY);
    });
    const origin = bboxOf(doc.units.filter((u) => doc.selectedIds.includes(u.id)));
    let i = 0;
    let ys = origin.minY;
    for (let r = 0; r < rows; r++) {
      let xs = origin.minX;
      for (let c = 0; c < cols && i < items.length; c++, i++) {
        const it = items[i];
        const dx = xs - it.bb.minX;
        const dy = ys - it.bb.minY;
        for (const u of it.b) { u.x += dx; u.y += dy; }
        for (const u of it.carry) { u.x += dx; u.y += dy; }
        xs += colW[c] + gapX;
      }
      ys += rowH[r] + gapY;
    }
    return items.length;
  }

  // 멀티/그룹 리사이즈 후 파생 제약 정리
  function normalizeSelected() {
    for (const u of doc.units) if (doc.selectedIds.includes(u.id)) normalize(u.params);
  }

  // ---- 활성 프레임 (§123) ----
  // 가장 최근 생성·선택·조작된 프레임 (생성·이동 모두 선택을 경유하므로 선택 감시로 충분).
  // 단일 블록 정렬의 기준 프레임 — 영속·히스토리 미포함 (세션 로컬 포인터).
  const activeFrameId = ref(null);
  watch(
    () => doc.selectedIds.join(','),
    () => {
      const sel = doc.units.filter((u) => u.type === 'frame' && doc.selectedIds.includes(u.id));
      const f = sel.find((u) => u.id === doc.activeId) ?? sel[sel.length - 1];
      if (f) activeFrameId.value = f.id;
    }
  );

  // ---- 블록 판정 (단일 소스, §120) ----
  // 블록 = 최외곽 그룹 단위 (그룹은 한 덩어리) — 정렬·등간격·어레인지·프레임 소유·정렬바 활성이 공유
  function groupBlocks(units) {
    const map = new Map();
    for (const u of units) {
      const g = outermost(u);
      const key = g ? 'g' + g : 'u' + u.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(u);
    }
    return [...map.values()];
  }
  // 선택 id들 → 블록 목록. 기준 = 키 오브젝트 블록 (없으면 선택 전체 bbox)
  function blocksOf(ids) {
    return groupBlocks(doc.units.filter((u) => ids.includes(u.id)));
  }
  function bboxOf(units) {
    return {
      minX: Math.min(...units.map((u) => u.x)),
      minY: Math.min(...units.map((u) => u.y)),
      maxX: Math.max(...units.map((u) => u.x + u.params.W)),
      maxY: Math.max(...units.map((u) => u.y + u.params.H)),
    };
  }
  // 프레임 소유 판정 (§92): 유닛/그룹 블록의 bbox 중심점이 들어있는 프레임 중 z-오더 최상위 1개.
  // 이동 시작 시점 1회 동적 판정 — 영속 부모 관계 없음. 프레임은 프레임을 데려가지 않음.
  // 블록(유닛 목록)의 소유 프레임: bbox 중심점이 들어있는 프레임 중 z-오더 최상위 (§92 규칙)
  function ownerFrameOf(members) {
    const bb = bboxOf(members);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    let owner = null; // 배열 순서 = z-오더 (마지막 매치가 최상위)
    for (const f of doc.units) {
      if (f.type !== 'frame') continue;
      if (cx >= f.x && cx <= f.x + f.params.W && cy >= f.y && cy <= f.y + f.params.H) owner = f;
    }
    return owner;
  }
  function frameOwnedUnits(frameIds) {
    const moving = new Set(frameIds);
    // 그룹 통째 판정 (부분 이동으로 그룹 찢김 방지) — 블록 규칙은 groupBlocks 단일 소스
    const blocks = groupBlocks(doc.units.filter((u) => u.type !== 'frame'));
    const owned = [];
    for (const members of blocks) {
      const owner = ownerFrameOf(members);
      if (owner && moving.has(owner.id)) owned.push(...members);
    }
    return owned;
  }

  // 블록 이동 시 프레임 소유 유닛 동반 목록 (§92 드래그 문법 — 어레인지·정렬·등간격 공용).
  // 이동 전 위치로 1회 판정, 별도 선택되어 자기 블록으로 움직이는 유닛은 이중 이동 방지 위해 제외.
  function carryOf(block) {
    const fids = block.filter((u) => u.type === 'frame').map((u) => u.id);
    if (!fids.length) return [];
    const selSet = new Set(doc.selectedIds);
    return frameOwnedUnits(fids).filter((u) => !selSet.has(u.id));
  }

  // 등간격 배치 — 3블록 이상, 양 끝 고정, 사이 간격 균등
  function distributeSelected(axis) {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length < 3) return;
    const items = blocks.map((b) => ({ b, bb: bboxOf(b), carry: carryOf(b) }));
    const lo = axis === 'h' ? 'minX' : 'minY';
    const hi = axis === 'h' ? 'maxX' : 'maxY';
    items.sort((a, z) => a.bb[lo] - z.bb[lo]);
    const first = items[0];
    const last = items[items.length - 1];
    const span = last.bb[hi] - first.bb[lo];
    const sizes = items.reduce((t, i) => t + (i.bb[hi] - i.bb[lo]), 0);
    const gap = (span - sizes) / (items.length - 1);
    let cursor = first.bb[lo];
    for (const it of items) {
      const size = it.bb[hi] - it.bb[lo];
      const d = cursor - it.bb[lo];
      for (const u of [...it.b, ...it.carry]) {
        if (axis === 'h') u.x += d;
        else u.y += d;
      }
      cursor += size + gap;
    }
  }

  function alignDelta(refBox, bb, type) {
    let dx = 0, dy = 0;
    if (type === 'left') dx = refBox.minX - bb.minX;
    else if (type === 'hcenter') dx = (refBox.minX + refBox.maxX) / 2 - (bb.minX + bb.maxX) / 2;
    else if (type === 'right') dx = refBox.maxX - bb.maxX;
    else if (type === 'top') dy = refBox.minY - bb.minY;
    else if (type === 'vcenter') dy = (refBox.minY + refBox.maxY) / 2 - (bb.minY + bb.maxY) / 2;
    else if (type === 'bottom') dy = refBox.maxY - bb.maxY;
    return [dx, dy];
  }
  // 활성 프레임(§123) — 존재 확인 포함
  function activeFrame() {
    return doc.units.find((u) => u.id === activeFrameId.value && u.type === 'frame') ?? null;
  }
  // 단일 블록 정렬의 기준 프레임 해석 (§123·§124):
  // 활성 프레임 → 없으면(재로딩 등) 블록이 속한(중심점 소유) 프레임 폴백
  function alignRefFrame() {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length !== 1) return null;
    const f = activeFrame();
    if (f) return blocks[0].includes(f) ? null : f; // 프레임 자신 선택 = 기준 없음
    if (blocks[0].some((u) => u.type === 'frame')) return null;
    return ownerFrameOf(blocks[0]);
  }
  function alignSelected(type) {
    const blocks = blocksOf(doc.selectedIds);
    // 단일 블록 + 기준 프레임(활성 또는 소유): 프레임 bbox 기준 정렬 (§123·§124)
    if (blocks.length === 1) {
      const f = alignRefFrame();
      if (!f) return;
      const refBox = { minX: f.x, minY: f.y, maxX: f.x + f.params.W, maxY: f.y + f.params.H };
      const [dx, dy] = alignDelta(refBox, bboxOf(blocks[0]), type);
      for (const u of blocks[0]) {
        u.x += dx;
        u.y += dy;
      }
      return;
    }
    if (blocks.length < 2) return;
    const keyU =
      doc.keyId != null && doc.selectedIds.includes(doc.keyId)
        ? doc.units.find((u) => u.id === doc.keyId)
        : null;
    const ref = keyU
      ? bboxOf(blocks.find((b) => b.includes(keyU)))
      : bboxOf(doc.units.filter((u) => doc.selectedIds.includes(u.id)));
    // 동반 목록은 이동 전 위치 기준으로 전 블록 선판정 (앞 블록 이동이 소유 판정에 영향 주지 않게)
    const carries = blocks.map((b) => carryOf(b));
    blocks.forEach((b, i) => {
      if (keyU && b.includes(keyU)) return;
      const [dx, dy] = alignDelta(ref, bboxOf(b), type);
      for (const u of [...b, ...carries[i]]) {
        u.x += dx;
        u.y += dy;
      }
    });
  }

  // 대시보드 초기화 — 기본 유닛 1개, 이름/카운터도 v1부터 재시작 (undo로 복구 가능)
  function resetDoc() {
    nextId = 1;
    nextUnitVer = 1;
    nextFrameVer = 1;
    nextGroup = 1;
    nextLink = 1;
    doc.units.splice(0, doc.units.length, {
      id: nextId++, type: 'unit', name: 'Default Unit', x: 0, y: 0, // §202: 유닛 넘버링 폐지
      groups: [], links: emptyLinks(), pair: null, params: createParams(),
    });
    doc.activeId = doc.units[0].id;
    doc.selectedIds = [doc.units[0].id];
    doc.keyId = null;
    doc.groupNames = {};
    doc.animEdges = [];
    nextPair = 1;
  }

  return {
    doc, active, gutterMax, alignSelected, distributeSelected, resetDoc, frameOwnedUnits, blocksOf, activeFrameId, alignRefFrame,
    selectOnly, toggleSelect, setSelection, deselect,
    duplicateActive, duplicateFrom, duplicateUnits, nudgeSelected, deleteSelected, createUnit, createUnitFrom,
    createFrame, renameGroup, blendFrom, blendUnitsFrom, arrangeGrid, orderSelected,
    setLinkResizeAnchor, capturePattern, placePattern,
    duplicatePairedFrame, connectAnim, disconnectAnim, animOwnedUnits, setAnimMode, repairAnimHomes, unpairFrame, setCategoryLink,
    setSize, setAspect, setA, setB, rotate, rotateSelected, flipActive, flipUnit, flipUnitV, flipSelected, duplicateSelectedOffset, setFill, withGeomOp,
    normalizeSelected, outermost, groupMemberIds, expandGroups, groupSelected, ungroupSelected,
    toggleLinkSelected, linkMemberIds, unlinkUnit, splitLinkSelected,
    undo, redo, registerHistoryExtra, copyActive, pasteAt, renameActive,
    loadProject, absorbFrom, setNotifier,
    restoredMeta: savedMeta, // 자동저장 복원 정보 (시작 토스트용)
  };
}
