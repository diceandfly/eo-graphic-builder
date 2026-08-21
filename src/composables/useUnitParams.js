import { reactive, computed, watch } from 'vue';
import { A_MIN, A_MAX, B_MIN, B_MAX, D_PCT_MAX, GUTTER_MAX } from '../geometry/constants.js';
import { computeColumns } from '../geometry/layout.js';
import { buildUnit } from '../geometry/unit.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function useUnitParams() {
  const p = reactive({
    // Canvas
    W: 1200,
    H: 675,
    orientation: 0, // 0 | 90 — 90이면 도안 전체가 시계방향 회전
    // Grid
    cols: 12,
    gutterMode: 'fixed', // 'fixed' | 'proportional'
    gutterPx: 15,
    g: 0.1,              // proportional 거터 비율 (왼쪽 col 폭 대비)
    rate: 1.618,
    direction: 'LtoS', // 'LtoS' | 'StoL'
    // Graphic
    dPct: 50, // shaft 높이, H 대비 % (0–90)
    a: 0.4,   // Δa (A_MIN–A_MAX)
    b: 0,     // Δb (B_MIN–B_MAX)
    threads: 'both',   // 'both' | 'one'
    threadDir: 'LtoR', // 'LtoR' | 'RtoL' — thread 기울기 방향
    // View
    showGuides: true,
  });

  // 로컬(비회전) 좌표계 치수 — 지오메트리는 항상 여기서 계산하고 렌더에서 회전
  const localW = computed(() => (p.orientation ? p.H : p.W));
  const localH = computed(() => (p.orientation ? p.W : p.H));

  const gutterMax = computed(() => Math.min(GUTTER_MAX, localW.value / p.cols));
  const D = computed(() => (localH.value * clamp(p.dPct, 0, D_PCT_MAX)) / 100);

  // a/b 독립 클램프 (상호 제약 없음)
  function setA(v) { p.a = clamp(v, A_MIN, A_MAX); }
  function setB(v) { p.b = clamp(v, B_MIN, B_MAX); }

  // W/cols 변경으로 상한이 내려가면 gutterPx를 따라 클램프
  watch(gutterMax, (m) => {
    if (p.gutterPx > m) p.gutterPx = Math.floor(m * 100) / 100;
  });

  const columns = computed(() =>
    computeColumns({
      W: localW.value, cols: p.cols, gutterMode: p.gutterMode,
      gutterPx: p.gutterPx, g: p.g,
      rate: p.rate, direction: p.direction,
    })
  );

  const unit = computed(() =>
    buildUnit({
      columns: columns.value, W: localW.value, H: localH.value, D: D.value,
      a: p.a, b: p.b, threads: p.threads, threadDir: p.threadDir,
    })
  );

  // 90° 회전: 캔버스 해상도 스왑 + 도안 전체 회전 (지오메트리는 로컬 좌표 유지)
  function rotate() {
    [p.W, p.H] = [p.H, p.W];
    p.orientation = p.orientation ? 0 : 90;
  }

  return { p, D, gutterMax, localH, columns, unit, setA, setB, rotate };
}
