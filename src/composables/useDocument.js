import { reactive, computed, watch, nextTick } from 'vue';
import { namePrefix } from '../objects/registry.js';
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
    // Shape
    dPct: 35,
    a: 0.4,
    b: 0,
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL'
    flipX: false, // 표시 계수: 좌우 미러 (내부 rate/direction은 불변 — 플립만 다른 유닛은 mixed로 취급 안 됨)
    fill: BRAND_COLORS[0], // EO NEON
    showGuides: true,
    ...overrides,
  };
}

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
    fill: '#3b3b3b',
    fillOn: true,
    drawMode: 'fill', // 'fill' = 면 채우기 | 'stroke' = 외곽선만 (§75)
    stroke: '#EFEAE1', // HALO WHITE — 다크 캔버스에서 보이는 기본값
    strokeW: 5, // 외곽선 두께 (px 고정 — cm 표기 모드와 무관)
    unitMode: 'px', // 패널 표기 단위 'px' | 'cm' — 내부 저장은 항상 px, dpi 기준 환산 표시
    // 내부 레이아웃 그리드 (가이드 전용 — export 미포함, px 단위)
    gridOn: true, // 표시 + 스냅 겸용 (별도 snap 토글 폐기, §75)
    margin: 20,
    rows: 2,
    cols: 2,
    gutterX: 20,
    gutterY: 20,
    ...overrides,
  };
}

function migrateUnit(u) {
  if (!u.type) u.type = 'unit';
  // §92: rect → frame 재정의 (기존 문서 자동 마이그레이션, 이름도 Rect-N → Frame-N)
  if (u.type === 'rect') {
    u.type = 'frame';
    if (u.name) u.name = u.name.replace(/^Rect-/, 'Frame-');
  }
  // 구버전 frame: 이후 추가된 키(drawMode 등)를 기본값으로 보충
  if (u.type === 'frame' && u.params) u.params = { ...createFrameParams(), ...u.params };
  if (!Array.isArray(u.groups)) u.groups = u.groupId ? [u.groupId] : [];
  delete u.groupId;
  if (u.linkId === undefined) u.linkId = null;
  if (u.params && u.params.flipX === undefined) u.params.flipX = false;
  return u;
}

export function useDocument() {
  // localStorage 자동 복원 (새로고침 안전망)
  let savedUnits;
  let savedMeta = null;
  let savedGroupNames = {};
  let savedLinkScopes = {};
  try {
    const raw = JSON.parse(localStorage.getItem(DOC_KEY) || 'null');
    savedUnits = raw?.units ?? null;
    savedGroupNames = raw?.groupNames ?? {};
    savedLinkScopes = raw?.linkScopes ?? {};
    if (savedUnits) savedMeta = { count: savedUnits.length, savedAt: raw.savedAt ?? null };
  } catch { savedUnits = null; }
  const initialUnits = (savedUnits ?? [{ id: 1, type: 'unit', name: 'Unit-1', x: 0, y: 0, params: createParams() }]).map(migrateUnit);

  let nextId = 2;
  let nextUnitVer = 2; // 유닛/프레임 넘버링 분리 (§64)
  let nextFrameVer = 1;
  let nextGroup = 1;
  let nextLink = 1;
  const doc = reactive({
    units: initialUnits,
    activeId: initialUnits.length ? initialUnits[initialUnits.length - 1].id : null,
    selectedIds: [],
    keyId: null, // 정렬 기준(키 오브젝트) — 멀티선택 중 재클릭으로 지정
    groupNames: savedGroupNames, // gid → 이름 (Group-N)
    linkScopes: savedLinkScopes, // linkId → { size, orientation, grid, shape, color } 동기화 범주
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
    nextLink = doc.units.reduce((m, u) => Math.max(m, u.linkId || 0), 0) + 1;
  }
  // 타입별 다음 이름 (접두어는 오브젝트 레지스트리에서)
  const nextName = (type) =>
    `${namePrefix(type)}-${type === 'frame' ? nextFrameVer++ : nextUnitVer++}`;

  // 자동 저장 (500ms 디바운스) — 유닛 + 그룹 이름 + 링크 스코프
  let saveTimer = null;
  watch(
    () => JSON.stringify({ u: doc.units, g: doc.groupNames, l: doc.linkScopes }),
    (snap) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const { u, g, l } = JSON.parse(snap);
        localStorage.setItem(DOC_KEY, JSON.stringify({
          version: 1, savedAt: Date.now(), units: u, groupNames: g, linkScopes: l,
        }));
      }, 500);
    }
  );

  // 존재하지 않는 gid/linkId의 메타 정리
  function pruneMeta() {
    const gids = new Set(doc.units.flatMap((u) => u.groups));
    for (const k of Object.keys(doc.groupNames)) if (!gids.has(Number(k))) delete doc.groupNames[k];
    const lids = new Set(doc.units.map((u) => u.linkId).filter(Boolean));
    for (const k of Object.keys(doc.linkScopes)) if (!lids.has(Number(k))) delete doc.linkScopes[k];
  }

  // JSON 프로젝트 로드 (파일 열기)
  function loadProject(units, meta = {}) {
    doc.units.splice(0, doc.units.length, ...units.map(migrateUnit));
    doc.groupNames = meta.groupNames ?? {};
    doc.linkScopes = meta.linkScopes ?? {};
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
    grid: ['cols', 'gutterMode', 'gutterPx', 'g', 'rate', 'direction'],
    shape: ['dPct', 'a', 'b', 'threads', 'threadDir'],
    color: ['fill'],
  };
  // 파라미터 키 → 범주 역맵 (링크 스코프 필터용). 미분류 키(showGuides 등)는 항상 동기화.
  const KEY_CAT = {};
  for (const [cat, keys] of Object.entries(SCOPE_KEYS)) for (const k of keys) KEY_CAT[k] = cat;
  // 기본: color·orientation은 off (사용자 확정 §62 — 개별성 유지가 더 흔한 사용례)
  const linkScopeDefault = () => ({ size: true, orientation: false, grid: true, shape: true, color: false });
  function absorbFrom(source, scope = null) {
    const keys = scope
      ? Object.entries(scope).filter(([, v]) => v).flatMap(([k]) => SCOPE_KEYS[k] || [])
      : Object.keys(source.params);
    if (!keys.length) return;
    const patch = {};
    for (const k of keys) patch[k] = source.params[k];
    // 직접 대상(선택)은 전체 패치, 링크로만 딸려오는 멤버는 링크 스코프 필터 적용
    const direct = new Set(doc.selectedIds);
    const viaLink = new Map(); // id → linkId
    for (const u of doc.units) {
      if (direct.has(u.id) && u.linkId) {
        for (const lid of linkMemberIds(u.linkId)) if (!direct.has(lid)) viaLink.set(lid, u.linkId);
      }
    }
    for (const u of doc.units) {
      if (u.id === source.id) continue;
      if (u.type !== source.type) continue; // 타입이 다른 오브젝트에는 흡수 불가
      if (direct.has(u.id)) Object.assign(u.params, patch);
      else if (viaLink.has(u.id)) Object.assign(u.params, filterByLinkScope(patch, viaLink.get(u.id)));
    }
  }
  // ── 링크 확산 공용 헬퍼 (§68 부채 정리) ──
  // 링크 전파 표면은 두 종류뿐이어야 한다:
  //  1) 미러 워처 (아래 watch) — 패널 편집의 패치를 스코프 필터로 전파
  //  2) 직접 확산 — 반드시 expandLinkByScope / filterByLinkScope 를 거칠 것.
  //     현재 사용처: setFill('color') · rotate('orientation') · absorbFrom(filterByLinkScope)
  // 새 기능이 링크로 퍼져야 한다면 이 두 헬퍼 외의 경로를 만들지 말 것.
  // cat 범주가 켜진 링크의 멤버 id들로 집합을 확장
  function expandLinkByScope(ids, cat) {
    const out = new Set(ids);
    for (const u of doc.units) {
      if (out.has(u.id) && u.linkId && doc.linkScopes[u.linkId]?.[cat] !== false) {
        for (const lid of linkMemberIds(u.linkId)) out.add(lid);
      }
    }
    return out;
  }
  // 링크 스코프가 꺼진 범주의 키를 patch에서 제거
  function filterByLinkScope(patch, lid) {
    const scope = doc.linkScopes[lid];
    if (!scope) return patch;
    const out = {};
    for (const k in patch) {
      const cat = KEY_CAT[k];
      if (!cat || scope[cat] !== false) out[k] = patch[k];
    }
    return out;
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
  // 지오메트리 조작 가드 — 유닛별로 "다른" 값을 의도적으로 쓰는 조작(통합 스케일·회전·플립) 중에는
  // 멀티선택 브로드캐스트가 끼어들어 활성 유닛 값으로 덮어쓰지 않도록 한 틱 동안 억제.
  let geomOp = false;
  function withGeomOp(fn) {
    geomOp = true;
    try {
      fn();
    } finally {
      nextTick(() => { geomOp = false; }); // pre-flush 워처가 먼저 돌고 난 뒤 해제
    }
  }
  watch(
    () => (active.value ? [active.value.id, JSON.stringify(active.value.params)] : [null, null]),
    ([id, now], [oldId, old]) => {
      if (geomOp) return;
      if (mirrorGuard || id == null || id !== oldId || now === old) return;
      // 대상: 멀티선택 미러링(전체 패치) + 링크 그룹 상시 동기화(스코프 범주 필터)
      const selT = new Set();
      if (doc.selectedIds.length >= 2 && doc.selectedIds.includes(id)) {
        for (const sid of doc.selectedIds) selT.add(sid);
      }
      const linkT = new Set();
      const me = doc.units.find((u) => u.id === id);
      if (me?.linkId) for (const lid of linkMemberIds(me.linkId)) linkT.add(lid);
      selT.delete(id);
      linkT.delete(id);
      for (const t of selT) linkT.delete(t); // 선택에 포함된 유닛은 전체 패치 우선
      if (!selT.size && !linkT.size) return;
      const prev = JSON.parse(old);
      const cur = JSON.parse(now);
      const patch = {};
      for (const k in cur) if (cur[k] !== prev[k]) patch[k] = cur[k];
      if (!Object.keys(patch).length) return;
      // 링크 스코프: 꺼진 범주의 키는 링크 멤버에 전파하지 않음
      let linkPatch = patch;
      const scope = me?.linkId ? doc.linkScopes[me.linkId] : null;
      if (scope) {
        linkPatch = {};
        for (const k in patch) {
          const cat = KEY_CAT[k];
          if (!cat || scope[cat] !== false) linkPatch[k] = patch[k];
        }
      }
      mirrorGuard = true;
      for (const u of doc.units) {
        if (selT.has(u.id)) Object.assign(u.params, patch);
        else if (linkT.has(u.id) && Object.keys(linkPatch).length) Object.assign(u.params, linkPatch);
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
  const histSnap = () => JSON.stringify({ u: doc.units, g: doc.groupNames, l: doc.linkScopes });
  const stack = [histSnap()];
  let idx = 0;
  let pending = null;
  watch(histSnap, (snap) => {
    clearTimeout(pending);
    pending = setTimeout(() => pushState(snap), 350);
  });
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
    const { u, g, l } = JSON.parse(snap);
    doc.units.splice(0, doc.units.length, ...u);
    doc.groupNames = g ?? {};
    doc.linkScopes = l ?? {};
    doc.selectedIds = doc.selectedIds.filter((id) => doc.units.some((x) => x.id === id));
    if (!doc.units.find((x) => x.id === doc.activeId)) {
      doc.activeId = doc.units.length ? doc.units[doc.units.length - 1].id : null;
    }
    recalcCounters(); // undo/redo 시 이름·id 카운터도 스냅샷 기준으로 복원
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
  function copyActive() {
    if (active.value) {
      clipboard = { type: active.value.type, params: { ...active.value.params }, linkId: active.value.linkId };
    }
  }
  function pasteAt(x, y) {
    if (!clipboard) return;
    const p = clipboard.params;
    pushUnit({ ...p }, Math.round(x - p.W / 2), Math.round(y - p.H / 2), clipboard.linkId, clipboard.type || 'unit');
  }

  function pushUnit(params, x, y, linkId = null, type = 'unit') {
    const id = nextId++;
    doc.units.push({ id, type, name: nextName(type), x, y, groups: [], linkId, params });
    selectOnly(id);
    return doc.units[doc.units.length - 1];
  }
  // 프레임 생성 (그리기 툴 F) — fill 기본값은 현재 컬러(없으면 createFrameParams 기본)
  function createFrame(x, y, W = 300, H = 200, fill = null) {
    const params = createFrameParams(fill ? { fill } : {});
    params.W = clamp(Math.round(W), LIMITS.unitMin, UNIT_MAX);
    params.H = clamp(Math.round(H), LIMITS.unitMin, UNIT_MAX);
    return pushUnit(params, Math.round(x), Math.round(y), null, 'frame');
  }
  function createUnit(x = 0, y = 0) {
    const params = createParams();
    return pushUnit(params, Math.round(x - params.W / 2), Math.round(y - params.H / 2));
  }
  // 프리셋 파라미터로 유닛 생성 (구버전 프리셋은 createParams 기본값으로 보충)
  function createUnitFrom(params, x = 0, y = 0) {
    const p = createParams({ ...params });
    return pushUnit(p, Math.round(x - p.W / 2), Math.round(y - p.H / 2));
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
    return pushUnit({ ...src.params }, src.x + src.params.W + 80, src.y, src.linkId, src.type);
  }
  // Alt+드래그 복제: 같은 위치에 사본 생성 (파라미터는 전부 원시값 — 얕은 복사로 완전 독립)
  function duplicateFrom(u) {
    return pushUnit({ ...u.params }, u.x, u.y, u.linkId, u.type);
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
        id, type: u.type, name: nextName(u.type), x: u.x, y: u.y,
        groups, linkId: u.linkId, params: { ...u.params },
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
  // 화면 기준 좌우 반전 — 90/270° 회전 상태면 로컬 축이 바뀌어 있으므로 로컬 상하 미러를 적용
  function flipUnit() {
    if (!active.value) return;
    const p = active.value.params;
    isOdd(p) ? mirrorLocalY(p) : mirrorLocalX(p);
  }
  // 스와치: 선택 유닛(없으면 활성)에 fill 적용 — 링크 확산은 color 스코프가 켜진 링크만
  function setFill(color) {
    const base = doc.selectedIds.length ? doc.selectedIds : doc.activeId != null ? [doc.activeId] : [];
    const ids = expandLinkByScope(base, 'color');
    for (const u of doc.units) {
      if (!ids.has(u.id)) continue;
      // rect가 stroke 모드면 스와치 적용 대상 = 외곽선 색 (보이는 색을 바꿈, §75)
      if (u.type === 'frame' && u.params.drawMode === 'stroke') u.params.stroke = color;
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

  // ---- 링크 (파라미터 상시 동기화) ----
  function linkMemberIds(lid) {
    return doc.units.filter((u) => u.linkId === lid).map((u) => u.id);
  }
  // 선택 전체가 이미 같은 링크면 해제, 아니면 새 링크로 통합.
  // scope: 링크 생성 시 초기 동기화 범주 (패널 드래프트 — 없으면 전체 on)
  function toggleLinkSelected(scope = null) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (sel.length < 2) return null;
    if (new Set(sel.map((u) => u.type)).size > 1) return { action: 'mixed' }; // 타입 혼합 링크 불가
    const lids = [...new Set(sel.map((u) => u.linkId))];
    if (lids.length === 1 && lids[0] != null && linkMemberIds(lids[0]).length === sel.length) {
      for (const u of sel) u.linkId = null;
      pruneMeta();
      return { action: 'unlinked', count: sel.length };
    } else {
      const lid = nextLink++;
      const sc = scope ? { ...linkScopeDefault(), ...scope } : linkScopeDefault();
      doc.linkScopes[lid] = sc;
      // 링크 생성 시 활성 유닛(선택에 없으면 첫 유닛) 기준으로 파라미터 즉시 통일.
      // 단, 스코프가 꺼진 범주(orientation 등)는 각 유닛의 값을 유지 (§58 드래프트 반영)
      const src = sel.find((u) => u.id === doc.activeId) ?? sel[0];
      const patch = {};
      for (const k in src.params) {
        const cat = KEY_CAT[k];
        if (!cat || sc[cat] !== false) patch[k] = src.params[k];
      }
      for (const u of sel) {
        u.linkId = lid;
        if (u !== src) Object.assign(u.params, patch);
      }
      cleanupLinks(); // 기존 링크에서 일부만 편입된 경우, 밖에 홀로 남은 멤버 해제
      pruneMeta();
      return { action: 'linked', count: sel.length, src: src.name };
    }
  }
  // 단일 유닛을 자기 링크에서 제거 (나머지 멤버는 유지, 1개만 남으면 자동 해체)
  function unlinkUnit(id) {
    const u = doc.units.find((x) => x.id === id);
    if (!u || !u.linkId) return null;
    u.linkId = null;
    cleanupLinks();
    pruneMeta();
    return { name: u.name };
  }
  function cleanupLinks() {
    const counts = {};
    for (const u of doc.units) if (u.linkId) counts[u.linkId] = (counts[u.linkId] || 0) + 1;
    for (const u of doc.units) if (u.linkId && counts[u.linkId] < 2) u.linkId = null;
  }
  // dir: +1 시계 / -1 반시계. 캔버스 W/H 스왑 + orientation 90° 스텝.
  // 회전은 링크 멤버 각각에 자기 중심 기준으로 직접 적용
  // (미러 패치는 W/H만 복사해 위치가 어긋나므로 여기서 위치까지 보정.
  //  반올림 없이 소수 좌표 유지 — 반복 회전 시 누적 오차 방지)
  function rotate(dir) {
    const u = active.value;
    if (!u) return;
    // 링크 확산은 orientation 스코프가 켜진 링크만 (공용 헬퍼 경유)
    const ids = expandLinkByScope([u.id], 'orientation');
    const targets = [u, ...doc.units.filter((m) => m !== u && ids.has(m.id))];
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
    });
  }
  // 화면 기준 상하 반전 — 90/270° 회전 상태면 로컬 좌우 미러가 화면 상하 미러
  function flipUnitV() {
    if (!active.value) return;
    const p = active.value.params;
    isOdd(p) ? mirrorLocalX(p) : mirrorLocalY(p);
  }
  // 선택 전체 플립 (통합 바운딩박스 기준): 각 유닛을 화면축 미러 + 위치를 bbox 중심 대칭으로 재배치
  function flipSelected(axis) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (!sel.length) return;
    const bb = bboxOf(sel);
    withGeomOp(() => {
      for (const u of sel) {
        const p = u.params;
        if (axis === 'h') {
          isOdd(p) ? mirrorLocalY(p) : mirrorLocalX(p);
          u.x = bb.minX + bb.maxX - (u.x + p.W);
        } else {
          isOdd(p) ? mirrorLocalX(p) : mirrorLocalY(p);
          u.y = bb.minY + bb.maxY - (u.y + p.H);
        }
      }
    });
  }
  // 선택 전체를 하나의 덩어리처럼 90° 회전 — 통합 bbox 중심 기준으로 각 유닛 중심을 회전시키고 유닛 자체도 회전
  function rotateSelected(dir) {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (!sel.length) return;
    const bb = bboxOf(sel);
    const C = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    withGeomOp(() => {
      for (const u of sel) {
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
        id, type: u.type, name: nextName(u.type),
        x, y, groups: [], linkId: null, params: p,
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
          id, type: u.type, name: nextName(u.type),
          x, y, groups: [gid], linkId: null, params: p,
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
  // 읽기 순서(위→아래, 왼→오른쪽) 보존, 셀 크기 = 해당 행/열의 블록 최대 치수, 간격 = gap.
  // columns 0 = 자동 (ceil(sqrt(n))).
  function arrangeGrid({ gap = 40, columns = 0 } = {}) {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length < 2) return 0;
    const items = blocks.map((b) => ({ b, bb: bboxOf(b) }));
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
        xs += colW[c] + gap;
      }
      ys += rowH[r] + gap;
    }
    return items.length;
  }

  // 멀티/그룹 리사이즈 후 파생 제약 정리
  function normalizeSelected() {
    for (const u of doc.units) if (doc.selectedIds.includes(u.id)) normalize(u.params);
  }

  // ---- 정렬 (좌하단 정렬 패널) ----
  // 블록 = 최외곽 그룹 단위 (그룹은 한 덩어리로 이동), 기준 = 키 오브젝트 블록 (없으면 선택 전체 bbox)
  function blocksOf(ids) {
    const map = new Map();
    for (const u of doc.units) {
      if (!ids.includes(u.id)) continue;
      const g = outermost(u);
      const key = g ? 'g' + g : 'u' + u.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(u);
    }
    return [...map.values()];
  }
  function bboxOf(units) {
    return {
      minX: Math.min(...units.map((u) => u.x)),
      minY: Math.min(...units.map((u) => u.y)),
      maxX: Math.max(...units.map((u) => u.x + u.params.W)),
      maxY: Math.max(...units.map((u) => u.y + u.params.H)),
    };
  }
  // 등간격 배치 — 3블록 이상, 양 끝 고정, 사이 간격 균등
  function distributeSelected(axis) {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length < 3) return;
    const items = blocks.map((b) => ({ b, bb: bboxOf(b) }));
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
      for (const u of it.b) {
        if (axis === 'h') u.x += d;
        else u.y += d;
      }
      cursor += size + gap;
    }
  }

  function alignSelected(type) {
    const blocks = blocksOf(doc.selectedIds);
    if (blocks.length < 2) return;
    const keyU =
      doc.keyId != null && doc.selectedIds.includes(doc.keyId)
        ? doc.units.find((u) => u.id === doc.keyId)
        : null;
    const ref = keyU
      ? bboxOf(blocks.find((b) => b.includes(keyU)))
      : bboxOf(doc.units.filter((u) => doc.selectedIds.includes(u.id)));
    for (const b of blocks) {
      if (keyU && b.includes(keyU)) continue;
      const bb = bboxOf(b);
      let dx = 0, dy = 0;
      if (type === 'left') dx = ref.minX - bb.minX;
      else if (type === 'hcenter') dx = (ref.minX + ref.maxX) / 2 - (bb.minX + bb.maxX) / 2;
      else if (type === 'right') dx = ref.maxX - bb.maxX;
      else if (type === 'top') dy = ref.minY - bb.minY;
      else if (type === 'vcenter') dy = (ref.minY + ref.maxY) / 2 - (bb.minY + bb.maxY) / 2;
      else if (type === 'bottom') dy = ref.maxY - bb.maxY;
      for (const u of b) {
        u.x += dx;
        u.y += dy;
      }
    }
  }

  // 대시보드 초기화 — 기본 유닛 1개, 이름/카운터도 v1부터 재시작 (undo로 복구 가능)
  function resetDoc() {
    nextId = 1;
    nextUnitVer = 1;
    nextFrameVer = 1;
    nextGroup = 1;
    nextLink = 1;
    doc.units.splice(0, doc.units.length, {
      id: nextId++, type: 'unit', name: nextName('unit'), x: 0, y: 0,
      groups: [], linkId: null, params: createParams(),
    });
    doc.activeId = doc.units[0].id;
    doc.selectedIds = [doc.units[0].id];
    doc.keyId = null;
    doc.groupNames = {};
    doc.linkScopes = {};
  }

  return {
    doc, active, gutterMax, alignSelected, distributeSelected, resetDoc,
    selectOnly, toggleSelect, setSelection, deselect,
    duplicateActive, duplicateFrom, duplicateUnits, nudgeSelected, deleteSelected, createUnit, createUnitFrom,
    createFrame, renameGroup, blendFrom, blendUnitsFrom, arrangeGrid, orderSelected,
    setSize, setAspect, setA, setB, rotate, rotateSelected, flipActive, flipUnit, flipUnitV, flipSelected, duplicateSelectedOffset, setFill, withGeomOp,
    normalizeSelected, outermost, groupMemberIds, expandGroups, groupSelected, ungroupSelected,
    toggleLinkSelected, linkMemberIds, unlinkUnit,
    undo, redo, copyActive, pasteAt, renameActive,
    loadProject, absorbFrom, setNotifier,
    restoredMeta: savedMeta, // 자동저장 복원 정보 (시작 토스트용)
  };
}
