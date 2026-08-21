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
    cols: 12,
    gutterMode: 'fixed', // 'fixed' | 'proportional'
    gutterPx: 15,
    g: 0.1,
    rate: 1.618,
    direction: 'LtoS',
    // Shape
    dPct: 50,
    a: 0.4,
    b: 0,
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL'
    showGuides: true,
    ...overrides,
  };
}

// 문서 모델: 스테이지 위 유닛 버전들 + 활성/선택 상태.
// 뷰포트와 완전 분리 — Phase 2에서 슬롯 배치 모델로 교체 가능.
export function useDocument() {
  let nextId = 2;
  let nextVersion = 2;
  const doc = reactive({
    units: [{ id: 1, name: 'unit v1', x: 0, y: 0, params: createParams() }],
    activeId: 1,     // 패널이 편집하는 유닛 (항상 존재)
    selected: true,  // 바운딩박스 표시 여부
  });

  const active = computed(() => doc.units.find((u) => u.id === doc.activeId));
  const gutterMax = computed(() => {
    const p = active.value.params;
    const odd = p.orientation === 90 || p.orientation === 270;
    return Math.min(GUTTER_MAX, (odd ? p.H : p.W) / p.cols);
  });

  // W/H 변경 후 파생 제약 정리
  function normalize(p) {
    const odd = p.orientation === 90 || p.orientation === 270;
    const max = Math.min(GUTTER_MAX, (odd ? p.H : p.W) / p.cols);
    if (p.gutterPx > max) p.gutterPx = Math.floor(max * 100) / 100;
  }

  function select(id) {
    doc.activeId = id;
    doc.selected = true;
  }
  function deselect() {
    doc.selected = false;
  }

  function duplicateActive() {
    const src = active.value;
    const id = nextId++;
    doc.units.push({
      id,
      name: `unit v${nextVersion++}`,
      x: src.x + src.params.W + 80,
      y: src.y,
      params: { ...src.params },
    });
    select(id);
  }

  function setSize(patch) {
    const p = active.value.params;
    if (patch.W != null) p.W = clamp(Math.round(patch.W), UNIT_MIN, UNIT_MAX);
    if (patch.H != null) p.H = clamp(Math.round(patch.H), UNIT_MIN, UNIT_MAX);
    normalize(p);
  }
  function setAspect(v) {
    setSize({ H: active.value.params.W / v });
  }
  // Δa/Δb 커플링: 합이 AB_SUM_MAX를 넘으면 반대쪽을 밀어냄
  // → 경사변 수평 런 (1-a-b) = 10% 고정 유지, 사다리꼴 역전 구조적 방지
  function setA(v) {
    const p = active.value.params;
    p.a = clamp(v, A_MIN, A_MAX);
    if (p.a + p.b > AB_SUM_MAX) p.b = Math.max(B_MIN, +(AB_SUM_MAX - p.a).toFixed(4));
  }
  function setB(v) {
    const p = active.value.params;
    p.b = clamp(v, B_MIN, B_MAX);
    if (p.a + p.b > AB_SUM_MAX) p.a = Math.max(A_MIN, +(AB_SUM_MAX - p.b).toFixed(4));
  }
  function flipActive() {
    const p = active.value.params;
    p.threadDir = p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR';
  }
  function deleteActive() {
    if (doc.units.length <= 1) return; // 마지막 유닛은 유지 (패널이 항상 활성 유닛을 필요로 함)
    const i = doc.units.findIndex((u) => u.id === doc.activeId);
    doc.units.splice(i, 1);
    select(doc.units[Math.max(0, i - 1)].id);
  }

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
    if (!doc.units.find((u) => u.id === doc.activeId)) {
      doc.activeId = doc.units[doc.units.length - 1].id;
      doc.selected = false;
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
    clipboard = { ...active.value.params };
  }
  // (x, y) = 월드 좌표 중심점 (마우스 커서). 클립보드 없으면 무시.
  function pasteAt(x, y) {
    if (!clipboard) return;
    const id = nextId++;
    doc.units.push({
      id,
      name: `unit v${nextVersion++}`,
      x: Math.round(x - clipboard.W / 2),
      y: Math.round(y - clipboard.H / 2),
      params: { ...clipboard },
    });
    select(id);
  }

  function renameActive(name) {
    const t = name.trim();
    if (t) active.value.name = t;
  }

  // Alt+드래그 복제: 같은 위치에 사본 생성 (파라미터는 얕은 복사 = 전부 원시값이라 완전 독립)
  function duplicateFrom(u) {
    const id = nextId++;
    const copy = {
      id,
      name: `unit v${nextVersion++}`,
      x: u.x,
      y: u.y,
      params: { ...u.params },
    };
    doc.units.push(copy);
    select(id);
    return doc.units[doc.units.length - 1]; // reactive proxy 반환
  }
  // dir: +1 시계 / -1 반시계. 캔버스 W/H 스왑 + orientation 90° 스텝.
  function rotate(dir) {
    const p = active.value.params;
    [p.W, p.H] = [p.H, p.W];
    p.orientation = (p.orientation + (dir > 0 ? 90 : 270)) % 360;
    normalize(p);
  }

  return {
    doc, active, gutterMax,
    select, deselect, duplicateActive, duplicateFrom, deleteActive,
    setSize, setAspect, setA, setB, rotate, flipActive,
    undo, redo, copyActive, pasteAt, renameActive,
  };
}
