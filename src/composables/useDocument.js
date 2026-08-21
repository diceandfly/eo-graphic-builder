import { reactive, computed, watch } from 'vue';
import {
  A_MIN, A_MAX, B_MIN, B_MAX, AB_SUM_MAX, GUTTER_MAX, UNIT_MIN, UNIT_MAX,
} from '../geometry/constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createParams(overrides = {}) {
  return {
    // Unit Size (캔버스 치수 — 회전 반영값)
    W: 1200,
    H: 675,
    orientation: 0, // 0 | 90 | 180 | 270 (시계방향)
    // Grid
    cols: 8,
    gutterMode: 'fixed', // 'fixed' | 'proportional'
    gutterPx: 20,
    g: 0.1,
    rate: 1.618,
    direction: 'LtoS',
    // Shape
    dPct: 50,
    a: 0.4,
    b: 0,
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL'
    fill: '#FAF04B',
    showGuides: true,
    ...overrides,
  };
}

// 문서 모델: 스테이지 위 유닛 버전들 + 멀티선택 상태.
// - activeId: 패널이 편집하는 유닛 (선택 해제 후에도 유지, 유닛 0개면 null)
// - selectedIds: 바운딩박스/이동/일괄 편집 대상
const DOC_KEY = 'eo.doc';

export function useDocument() {
  // localStorage 자동 복원 (새로고침 안전망)
  let savedUnits = null;
  try {
    savedUnits = JSON.parse(localStorage.getItem(DOC_KEY) || 'null')?.units ?? null;
  } catch { savedUnits = null; }
  const initialUnits = savedUnits ?? [{ id: 1, name: 'unit v1', x: 0, y: 0, params: createParams() }];

  let nextId = 2;
  let nextVersion = 2;
  let nextGroup = 1;
  const doc = reactive({
    units: initialUnits,
    activeId: initialUnits.length ? initialUnits[initialUnits.length - 1].id : null,
    selectedIds: [],
  });
  recalcCounters();
  function recalcCounters() {
    nextId = doc.units.reduce((m, u) => Math.max(m, u.id), 0) + 1;
    nextVersion = doc.units.reduce((m, u) => {
      const mt = u.name.match(/v(\d+)$/);
      return Math.max(m, mt ? Number(mt[1]) : 0);
    }, 0) + 1;
    nextGroup = doc.units.reduce((m, u) => Math.max(m, u.groupId || 0), 0) + 1;
  }

  // 자동 저장 (500ms 디바운스)
  let saveTimer = null;
  watch(
    () => JSON.stringify(doc.units),
    (snap) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        localStorage.setItem(DOC_KEY, JSON.stringify({ version: 1, units: JSON.parse(snap) }));
      }, 500);
    }
  );

  // JSON 프로젝트 로드 (파일 열기)
  function loadProject(units) {
    doc.units.splice(0, doc.units.length, ...units);
    doc.selectedIds = [];
    doc.activeId = units.length ? units[units.length - 1].id : null;
    recalcCounters();
  }

  // 스포이드: 소스 유닛의 파라미터를 선택된 유닛들에 흡수 (위치·이름 유지)
  function absorbFrom(source) {
    for (const u of doc.units) {
      if (u.id !== source.id && doc.selectedIds.includes(u.id)) {
        Object.assign(u.params, { ...source.params });
      }
    }
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
  }
  function deselect() {
    doc.selectedIds = [];
  }

  // ---- 멀티선택 파라미터 브로드캐스트 ----
  // 패널은 활성 유닛의 params를 직접 편집한다. 변경된 키만 감지해
  // 나머지 선택 유닛에 같은 값을 미러링한다.
  let mirrorGuard = false;
  watch(
    () => (active.value ? [active.value.id, JSON.stringify(active.value.params)] : [null, null]),
    ([id, now], [oldId, old]) => {
      if (mirrorGuard || id == null || id !== oldId || now === old) return;
      if (doc.selectedIds.length < 2 || !doc.selectedIds.includes(id)) return;
      const prev = JSON.parse(old);
      const cur = JSON.parse(now);
      const patch = {};
      for (const k in cur) if (cur[k] !== prev[k]) patch[k] = cur[k];
      if (!Object.keys(patch).length) return;
      mirrorGuard = true;
      for (const u of doc.units) {
        if (u.id !== id && doc.selectedIds.includes(u.id)) Object.assign(u.params, patch);
      }
      mirrorGuard = false;
    }
  );

  // ---- 히스토리 (undo/redo) — units 상태 스냅샷, 연속 조작은 350ms 디바운스로 병합 ----
  const stack = [JSON.stringify(doc.units)];
  let idx = 0;
  let pending = null;
  watch(
    () => JSON.stringify(doc.units),
    (snap) => {
      clearTimeout(pending);
      pending = setTimeout(() => pushState(snap), 350);
    }
  );
  function pushState(snap) {
    if (snap === stack[idx]) return;
    stack.splice(idx + 1);
    stack.push(snap);
    if (stack.length > 100) stack.shift();
    idx = stack.length - 1;
  }
  function flushHistory() {
    clearTimeout(pending);
    pushState(JSON.stringify(doc.units));
  }
  function applyState(snap) {
    const arr = JSON.parse(snap);
    doc.units.splice(0, doc.units.length, ...arr);
    doc.selectedIds = doc.selectedIds.filter((id) => doc.units.some((u) => u.id === id));
    if (!doc.units.find((u) => u.id === doc.activeId)) {
      doc.activeId = doc.units.length ? doc.units[doc.units.length - 1].id : null;
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
  function copyActive() {
    if (active.value) clipboard = { ...active.value.params };
  }
  function pasteAt(x, y) {
    if (!clipboard) return;
    pushUnit({ ...clipboard }, Math.round(x - clipboard.W / 2), Math.round(y - clipboard.H / 2));
  }

  function pushUnit(params, x, y) {
    const id = nextId++;
    doc.units.push({ id, name: `unit v${nextVersion++}`, x, y, groupId: null, params });
    selectOnly(id);
    return doc.units[doc.units.length - 1];
  }
  function createUnit(x = 0, y = 0) {
    const params = createParams();
    return pushUnit(params, Math.round(x - params.W / 2), Math.round(y - params.H / 2));
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
  }

  function duplicateActive() {
    const src = active.value;
    if (!src) return;
    return pushUnit({ ...src.params }, src.x + src.params.W + 80, src.y);
  }
  // Alt+드래그 복제: 같은 위치에 사본 생성 (파라미터는 전부 원시값 — 얕은 복사로 완전 독립)
  function duplicateFrom(u) {
    return pushUnit({ ...u.params }, u.x, u.y);
  }

  // ---- 활성 유닛 파라미터 액션 ----
  function normalize(p) {
    const odd = p.orientation === 90 || p.orientation === 270;
    const max = Math.min(GUTTER_MAX, (odd ? p.H : p.W) / p.cols);
    if (p.gutterPx > max) p.gutterPx = Math.floor(max * 100) / 100;
  }
  function setSize(patch) {
    if (!active.value) return;
    const p = active.value.params;
    if (patch.W != null) p.W = clamp(Math.round(patch.W), UNIT_MIN, UNIT_MAX);
    if (patch.H != null) p.H = clamp(Math.round(patch.H), UNIT_MIN, UNIT_MAX);
    normalize(p);
  }
  function setAspect(v) {
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
  // 유닛 좌우 반전 = 압축 방향 + thread 기울기 동시 반전 (로컬 좌표 기준 미러)
  function flipUnit() {
    if (!active.value) return;
    const p = active.value.params;
    p.direction = p.direction === 'LtoS' ? 'StoL' : 'LtoS';
    p.threadDir = p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR';
  }
  // 스와치: 선택 유닛(없으면 활성)에 fill 적용
  function setFill(color) {
    const ids = doc.selectedIds.length
      ? doc.selectedIds
      : doc.activeId != null ? [doc.activeId] : [];
    for (const u of doc.units) if (ids.includes(u.id)) u.params.fill = color;
  }

  // ---- 그룹 (⌘G / ⌘⇧G) ----
  function groupMemberIds(gid) {
    return doc.units.filter((u) => u.groupId === gid).map((u) => u.id);
  }
  function expandGroups(ids) {
    const out = new Set(ids);
    for (const u of doc.units) {
      if (out.has(u.id) && u.groupId) {
        for (const id of groupMemberIds(u.groupId)) out.add(id);
      }
    }
    return [...out];
  }
  function groupSelected() {
    const sel = doc.selectedIds;
    if (sel.length < 2) return; // 단일 유닛/단일 그룹의 중복 그룹 방지
    const gids = [...new Set(doc.units.filter((u) => sel.includes(u.id)).map((u) => u.groupId))];
    if (gids.length === 1 && gids[0] != null && groupMemberIds(gids[0]).length === sel.length) {
      return; // 이미 완전한 단일 그룹
    }
    const gid = nextGroup++;
    for (const u of doc.units) if (sel.includes(u.id)) u.groupId = gid;
  }
  function ungroupSelected() {
    for (const u of doc.units) if (doc.selectedIds.includes(u.id)) u.groupId = null;
  }
  // dir: +1 시계 / -1 반시계. 캔버스 W/H 스왑 + orientation 90° 스텝.
  function rotate(dir) {
    if (!active.value) return;
    const p = active.value.params;
    [p.W, p.H] = [p.H, p.W];
    p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
    normalize(p);
  }

  return {
    doc, active, gutterMax,
    selectOnly, toggleSelect, setSelection, deselect,
    duplicateActive, duplicateFrom, deleteSelected, createUnit,
    setSize, setAspect, setA, setB, rotate, flipActive, flipUnit, setFill,
    groupMemberIds, expandGroups, groupSelected, ungroupSelected,
    undo, redo, copyActive, pasteAt, renameActive,
    loadProject, absorbFrom,
  };
}
