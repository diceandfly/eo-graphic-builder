// §255: 연속 그리드 필드 공리 테스트 — 부호/방향 체계를 수치로 고정 (AE류 꼬임의 회귀 방벽).
// L1(φ 반전=역재생: 연속성으로 갈음) L2(방향=거울) L3(φ 주기 1) L4(성장 끝단=좁은 쪽) + 구 구현 회귀.
import { strict as assert } from 'node:assert';
import { computeColumns } from '../src/geometry/layout.js';
import { MIN_COL_W } from '../src/geometry/constants.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const colsClose = (A, B, tol = 1e-6) => {
  assert.equal(A.length, B.length);
  for (let i = 0; i < A.length; i += 1) {
    assert.ok(close(A[i].L, B[i].L, tol) && close(A[i].R, B[i].R, tol), `col ${i}: ${A[i].L}..${A[i].R} vs ${B[i].L}..${B[i].R}`);
  }
};

// 구 구현 (git §pre-255) — 정수 cols·offset 0 회귀 기준
function legacyColumns({ W, cols, gutterMode, gutterPx, g, rate, direction }) {
  const renorm = (ws, target) => {
    const sum = ws.reduce((a, b) => a + b, 0);
    if (sum <= target || sum === 0) return ws;
    return ws.map((w) => w * (target / sum));
  };
  const raw = [];
  for (let i = 0; i < cols; i++) raw.push(direction === 'LtoS' ? rate ** (cols - 1 - i) : rate ** i);
  const sum = raw.reduce((s, v) => s + v, 0);
  const wN = raw.map((v) => v / sum);
  let colW, gutterAfter;
  if (gutterMode === 'proportional') {
    const k = W / (1 + g * (1 - wN[cols - 1]));
    colW = renorm(wN.map((w) => Math.max(MIN_COL_W, k * w)), k);
    gutterAfter = (i) => g * colW[i];
  } else {
    const inner = Math.max(0, W - (cols - 1) * gutterPx);
    colW = renorm(wN.map((w) => Math.max(MIN_COL_W, w * inner)), inner);
    gutterAfter = () => gutterPx;
  }
  const out = [];
  let x = 0;
  for (let i = 0; i < cols; i++) {
    out.push({ L: x, R: x + colW[i], w: colW[i] });
    x += colW[i] + (i < cols - 1 ? gutterAfter(i) : 0);
  }
  return out;
}

const BASE = { W: 960, cols: 12, gutterMode: 'fixed', gutterPx: 10, g: 0.2, rate: 2 };

// ── 회귀: 정수 cols + offset 0 = 구 구현과 동일 ──
for (const direction of ['LtoS', 'StoL']) {
  for (const rate of [1, 1.5, 2, 3]) {
    const p = { ...BASE, rate, direction };
    ok(`회귀 fixed ${direction} rate=${rate}`, () => colsClose(computeColumns(p), legacyColumns(p), 1e-6));
  }
}
for (const rate of [1.5, 2]) {
  const p = { ...BASE, rate, gutterMode: 'proportional', direction: 'LtoS' };
  ok(`회귀 proportional LtoS rate=${rate}`, () => colsClose(computeColumns(p), legacyColumns(p), 1e-6));
}
// proportional StoL = §255에서 "LtoS의 정확한 거울"로 재정의 (구 구현은 비대칭이었음 — 의도 변경)

// ── L2: 방향 반전 = 정확한 공간 거울 (연속 cols·offset 포함 전수) ──
{
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 40; i += 1) {
    const p = {
      W: rnd(200, 2000), cols: rnd(1.2, 14), gutterPx: rnd(0, 20), g: rnd(0, 0.4),
      rate: rnd(1, 3.5), offset: rnd(-5, 5),
      gutterMode: Math.random() < 0.5 ? 'fixed' : 'proportional',
    };
    const A = computeColumns({ ...p, direction: 'LtoS' });
    const B = computeColumns({ ...p, direction: 'StoL' });
    const M = A.map((c) => ({ L: p.W - c.R, R: p.W - c.L, w: c.w })).reverse();
    colsClose(B, M, 1e-6);
  }
  ok('L2: StoL = mirror(LtoS) — 랜덤 40조합 (연속 cols·offset·양 거터모드)', () => {});
}

// ── L3: offset 주기 1 — φ와 φ±1·φ±3 동일 화면 ──
{
  for (const phi of [0.37, -1.2, 2.49]) {
    const a = computeColumns({ ...BASE, cols: 7.3, offset: phi });
    for (const d of [1, -1, 3]) {
      colsClose(computeColumns({ ...BASE, cols: 7.3, offset: phi + d }), a, 1e-6);
    }
  }
  ok('L3: offset 랩 주기 1 (φ ≡ φ±1 ≡ φ+3)', () => {});
}

// ── L1(연속성): 컷 생성/소멸 순간 무점프 — 경계 집합의 미소 이동 ──
{
  const edgesOf = (cs) => cs.flatMap((c) => [c.L, c.R]);
  for (const phi0 of [0, 0.5, 0.999]) {
    const A = edgesOf(computeColumns({ ...BASE, cols: 9, offset: phi0 - 5e-4 }));
    const B = edgesOf(computeColumns({ ...BASE, cols: 9, offset: phi0 + 5e-4 }));
    for (const x of A) {
      const d = Math.min(...B.map((y) => Math.abs(y - x)));
      assert.ok(d < 2.5, `경계 점프 ${d.toFixed(3)}px @φ≈${phi0}`); // 1e-3 위상 ≈ 섭동 수 px 미만
    }
  }
  ok('L1(연속성): 칸 생성/소멸 경계에서 위치 점프 없음', () => {});
}

// ── L4: 성장 끝단 = 좁은 쪽 (LtoS = 우측, StoL = 좌측) ──
{
  const a = computeColumns({ ...BASE, cols: 3 + 1e-6, rate: 2, direction: 'LtoS' });
  assert.equal(a.length, 4);
  assert.ok(a[3].w < 0.01, `신생 칸이 우측 0폭이어야: ${a[3].w}`);
  const b = computeColumns({ ...BASE, cols: 3 + 1e-6, rate: 2, direction: 'StoL' });
  assert.equal(b.length, 4);
  assert.ok(b[0].w < 0.01, `신생 칸이 좌측 0폭이어야: ${b[0].w}`);
  ok('L4: cols 성장 칸 = 좁은 끝단에서 0폭 출발 (방향 종속)', () => {});
}

// ── 총폭 보존: 어떤 조합에도 마지막 R ≤ W (+오차) ──
{
  for (let i = 0; i < 30; i += 1) {
    const p = {
      W: 100 + Math.random() * 1900, cols: 1 + Math.random() * 13,
      gutterPx: Math.random() * 20, g: Math.random() * 0.4,
      rate: 1 + Math.random() * 2.5, offset: (Math.random() - 0.5) * 8,
      gutterMode: Math.random() < 0.5 ? 'fixed' : 'proportional',
      direction: Math.random() < 0.5 ? 'LtoS' : 'StoL',
    };
    const cs = computeColumns(p);
    assert.ok(cs[cs.length - 1].R <= p.W + 1e-6, `오버플로: ${cs[cs.length - 1].R} > ${p.W}`);
    assert.ok(cs[0].L >= -1e-6);
  }
  ok('총폭 보존: 랜덤 30조합 오버플로 없음', () => {});
}

console.log(`✓ grid field: ${passed} cases passed`);
