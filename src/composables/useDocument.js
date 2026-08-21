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
    g: 0.2,
    rate: 1.618,
    direction: 'LtoS',
    // Shape
    dPct: 50,
    a: 0.4,
    b: 0,
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL'
    fill: '#F9EE48',
    showGuides: true,
    ...overrides,
  };
}

// 문서 모델: 스테이지 위 유닛 버전들 + 멀티선택 상태.
// - activeId: 패널이 편집하는 유닛 (선택 해제 후에도 유지, 유닛 0개면 null)
// - selectedIds: 바운딩박스/이동/일괄 편집 대상
const DOC_KEY = 'eo.doc';

// 구버전 스키마 호환: groupId(단일) → groups(중첩 스택, 바깥쪽이 끝)
function migrateUnit(u) {
  if (!Array.isArray(u.groups)) u.groups = u.groupId ? [u.groupId] : [];
  delete u.groupId;
  if (u.linkId === undefined) u.linkId = null;
  return u;
}

export function useDocument() {
  // localStorage 자동 복원 (새로고침 안전망)
  let savedUnits = null;
  try {
    savedUnits = JSON.parse(localStorage.getItem(DOC_KEY) || 'null')?.units ?? null;
  } catch { savedUnits = null; }
  const initialUnits = (savedUnits ?? [{ id: 1, name: 'unit v1', x: 0, y: 0, params: createParams() }]).map(migrateUnit);

  let nextId = 2;
  let nextVersion = 2;
  let nextGroup = 1;
  let nextLink = 1;
  const doc = reactive({
    units: initialUnits,
    activeId: initialUnits.length ? initialUnits[initialUnits.length - 1].id : null,
    selectedIds: [],
    keyId: null, // 정렬 기준(키 오브젝트) — 멀티선택 중 재클릭으로 지정
  });
  recalcCounters();
  function recalcCounters() {
    nextId = doc.units.reduce((m, u) => Math.max(m, u.id), 0) + 1;
    nextVersion = doc.units.reduce((m, u) => {
      const mt = u.name.match(/v(\d+)$/);
      return Math.max(m, mt ? Number(mt[1]) : 0);
    }, 0) + 1;
    nextGroup = doc.units.reduce((m, u) => Math.max(m, ...u.groups, 0), 0) + 1;
    nextLink = doc.units.reduce((m, u) => Math.max(m, u.linkId || 0), 0) + 1;
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
    doc.units.splice(0, doc.units.length, ...units.map(migrateUnit));
    doc.selectedIds = [];
    doc.activeId = units.length ? units[units.length - 1].id : null;
    recalcCounters();
  }

  // 스포이드: 소스 유닛의 파라미터를 선택된 유닛들에 흡수 (위치·이름 유지)
  // scope: { size, grid, shape, color } — 켜진 범주의 키만 흡수 (없으면 전체)
  const SCOPE_KEYS = {
    size: ['W', 'H', 'orientation'],
    grid: ['cols', 'gutterMode', 'gutterPx', 'g', 'rate', 'direction'],
    shape: ['dPct', 'a', 'b', 'threads', 'threadDir'],
    color: ['fill'],
  };
  function absorbFrom(source, scope = null) {
    const keys = scope
      ? Object.entries(scope).filter(([, v]) => v).flatMap(([k]) => SCOPE_KEYS[k] || [])
      : Object.keys(source.params);
    if (!keys.length) return;
    const patch = {};
    for (const k of keys) patch[k] = source.params[k];
    const ids = new Set(doc.selectedIds);
    for (const u of doc.units) {
      if (ids.has(u.id) && u.linkId) for (const lid of linkMemberIds(u.linkId)) ids.add(lid);
    }
    for (const u of doc.units) {
      if (u.id !== source.id && ids.has(u.id)) Object.assign(u.params, patch);
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
  watch(
    () => (active.value ? [active.value.id, JSON.stringify(active.value.params)] : [null, null]),
    ([id, now], [oldId, old]) => {
      if (mirrorGuard || id == null || id !== oldId || now === old) return;
      // 대상: 멀티선택 미러링 + 링크 그룹 상시 동기화
      const targets = new Set();
      if (doc.selectedIds.length >= 2 && doc.selectedIds.includes(id)) {
        for (const sid of doc.selectedIds) targets.add(sid);
      }
      const me = doc.units.find((u) => u.id === id);
      if (me?.linkId) for (const lid of linkMemberIds(me.linkId)) targets.add(lid);
      targets.delete(id);
      if (!targets.size) return;
      const prev = JSON.parse(old);
      const cur = JSON.parse(now);
      const patch = {};
      for (const k in cur) if (cur[k] !== prev[k]) patch[k] = cur[k];
      if (!Object.keys(patch).length) return;
      mirrorGuard = true;
      for (const u of doc.units) {
        if (targets.has(u.id)) Object.assign(u.params, patch);
      }
      mirrorGuard = false;
      // 멀티선택 편집이 여러 유닛에 퍼졌음을 1회성 토스트로 안내
      if (doc.selectedIds.length >= 2 && Date.now() - lastBroadcastNote > 2500) {
        lastBroadcastNote = Date.now();
        notify(`Applied to ${doc.selectedIds.length} selected units`);
      }
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
    if (active.value) clipboard = { params: { ...active.value.params }, linkId: active.value.linkId };
  }
  function pasteAt(x, y) {
    if (!clipboard) return;
    const p = clipboard.params;
    pushUnit({ ...p }, Math.round(x - p.W / 2), Math.round(y - p.H / 2), clipboard.linkId);
  }

  function pushUnit(params, x, y, linkId = null) {
    const id = nextId++;
    doc.units.push({ id, name: `unit v${nextVersion++}`, x, y, groups: [], linkId, params });
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
    cleanupLinks(); // 1개만 남은 링크 그룹 해제
    // 멤버가 1개만 남은 그룹 레이어 제거
    const gcount = {};
    for (const u of doc.units) for (const g of u.groups) gcount[g] = (gcount[g] || 0) + 1;
    for (const u of doc.units) u.groups = u.groups.filter((g) => gcount[g] >= 2);
  }

  function duplicateActive() {
    const src = active.value;
    if (!src) return;
    return pushUnit({ ...src.params }, src.x + src.params.W + 80, src.y, src.linkId);
  }
  // Alt+드래그 복제: 같은 위치에 사본 생성 (파라미터는 전부 원시값 — 얕은 복사로 완전 독립)
  function duplicateFrom(u) {
    return pushUnit({ ...u.params }, u.x, u.y, u.linkId);
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
    const ids = new Set(
      doc.selectedIds.length ? doc.selectedIds : doc.activeId != null ? [doc.activeId] : []
    );
    for (const u of doc.units) {
      if (ids.has(u.id) && u.linkId) for (const lid of linkMemberIds(u.linkId)) ids.add(lid);
    }
    for (const u of doc.units) if (ids.has(u.id)) u.params.fill = color;
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
  }
  // 1레이어 언그룹: 선택된 유닛들의 최외곽 그룹만 벗김
  function ungroupSelected() {
    const outs = new Set(
      doc.units.filter((u) => doc.selectedIds.includes(u.id)).map(outermost).filter(Boolean)
    );
    for (const u of doc.units) {
      if (doc.selectedIds.includes(u.id) && outs.has(outermost(u))) u.groups.pop();
    }
  }

  // ---- 링크 (파라미터 상시 동기화) ----
  function linkMemberIds(lid) {
    return doc.units.filter((u) => u.linkId === lid).map((u) => u.id);
  }
  // 선택 전체가 이미 같은 링크면 해제, 아니면 새 링크로 통합
  function toggleLinkSelected() {
    const sel = doc.units.filter((u) => doc.selectedIds.includes(u.id));
    if (sel.length < 2) return null;
    const lids = [...new Set(sel.map((u) => u.linkId))];
    if (lids.length === 1 && lids[0] != null && linkMemberIds(lids[0]).length === sel.length) {
      for (const u of sel) u.linkId = null;
      return { action: 'unlinked', count: sel.length };
    } else {
      const lid = nextLink++;
      // 링크 생성 시 활성 유닛(선택에 없으면 첫 유닛) 기준으로 파라미터 즉시 통일
      const src = sel.find((u) => u.id === doc.activeId) ?? sel[0];
      for (const u of sel) {
        u.linkId = lid;
        if (u !== src) Object.assign(u.params, { ...src.params });
      }
      cleanupLinks(); // 기존 링크에서 일부만 편입된 경우, 밖에 홀로 남은 멤버 해제
      return { action: 'linked', count: sel.length, src: src.name };
    }
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
    const targets = [u];
    if (u.linkId) {
      for (const m of doc.units) if (m.linkId === u.linkId && m !== u) targets.push(m);
    }
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
  }
  // 상하 반전 = 180° 회전 + 좌우 반전 (W/H 불변, one-side의 shaft 위치도 뒤집힘)
  function flipUnitV() {
    if (!active.value) return;
    const p = active.value.params;
    p.orientation = (p.orientation + 180) % 360;
    p.direction = p.direction === 'LtoS' ? 'StoL' : 'LtoS';
    p.threadDir = p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR';
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

  return {
    doc, active, gutterMax, alignSelected,
    selectOnly, toggleSelect, setSelection, deselect,
    duplicateActive, duplicateFrom, deleteSelected, createUnit,
    setSize, setAspect, setA, setB, rotate, flipActive, flipUnit, flipUnitV, setFill,
    normalizeSelected, outermost, groupMemberIds, expandGroups, groupSelected, ungroupSelected,
    toggleLinkSelected, linkMemberIds,
    undo, redo, copyActive, pasteAt, renameActive,
    loadProject, absorbFrom, setNotifier,
  };
}
