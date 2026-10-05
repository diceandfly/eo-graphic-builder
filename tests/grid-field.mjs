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
for (const direction of ['LtoS', 'StoL']) {
  for (const rate of [1.5, 2]) {
    const p = { ...BASE, rate, gutterMode: 'proportional', direction };
    ok(`회귀 proportional ${direction} rate=${rate}`, () => colsClose(computeColumns(p), legacyColumns(p), 1e-6));
  }
}
// §261: direction = 지수 부호 — 구(§pre-255) 구현과 전 조합 완전 호환 (proportional StoL 포함)

// ── L2′ (§261): direction = 지수 부호 — fixed·정수 N에서 StoL(φ) = mirror(LtoS(−φ)) ──
// (§255의 "StoL = 좌표 미러" 폐기: 컷·끝단은 캐노니컬 고정, 거울상은 φ 부호까지 함께 뒤집어야 성립)
{
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 40; i += 1) {
    const p = {
      W: rnd(200, 2000), cols: 2 + Math.floor(rnd(0, 11)), gutterPx: rnd(0, 20), g: 0.2,
      rate: rnd(1, 3.5), gutterMode: 'fixed',
    };
    const phi = rnd(-5, 5);
    const A = computeColumns({ ...p, direction: 'LtoS', offset: -phi });
    const B = computeColumns({ ...p, direction: 'StoL', offset: phi });
    const M = A.map((c) => ({ L: p.W - c.R, R: p.W - c.L, w: c.w })).reverse();
    colsClose(B, M, 1e-6);
  }
  ok('L2′: StoL(φ) = mirror(LtoS(−φ)) — fixed·정수 N 랜덤 40조합', () => {});
}

// ── §261: 50% 튐 회귀 — cols 4↔5 + 압축 부호 반전 동시 보간이 전 구간 연속인지 ──
{
  const layout = (cols, rate, direction) =>
    computeColumns({ ...BASE, cols, rate, direction, gutterPx: 10 });
  const edges = (cs) => cs.flatMap((c) => [c.L, c.R]);
  // §261: 로그 부호 결합 (anim.js lerpParams와 동일 수식) — 균등(0) 통과가 매끄러움
  const sweep = (step) => {
    let worst = 0;
    let prev = null;
    for (let t = 0; t <= 1.0001; t += step) {
      const sv = Math.log(2.56) * -1 * (1 - t) + Math.log(2.56) * 1 * t;
      const cur = layout(4 + t, Math.exp(Math.abs(sv)), sv >= 0 ? 'LtoS' : 'StoL');
      if (prev) {
        for (const x of edges(cur)) {
          const d = Math.min(...edges(prev).map((y) => Math.abs(y - x)));
          worst = Math.max(worst, d);
        }
      }
      prev = cur;
    }
    return worst;
  };
  const w1 = sweep(0.01);
  const w2 = sweep(0.002);
  // 연속 함수라면 스텝을 1/5로 줄일 때 프레임 간 최대 이동도 그에 비례해 줄어야 (점프는 안 줄어듦)
  assert.ok(w2 < w1 * 0.4, `점프 의심: step 0.01→0.002에서 ${w1.toFixed(2)}→${w2.toFixed(2)}px`);
  assert.ok(w2 < 4, `미세 스텝에서도 ${w2.toFixed(2)}px 이동 — 불연속`);
  ok(`§261: cols 4→5 + 압축 ± 동시 보간 연속 (0.01스텝 ${w1.toFixed(2)}px → 0.002스텝 ${w2.toFixed(2)}px)`, () => {});
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

// ── L4′ (§261): 성장 끝단 = **항상 우측 고정** (방향 무관 — 보간 중 direction 플립에도 불변) ──
{
  for (const direction of ['LtoS', 'StoL']) {
    const a = computeColumns({ ...BASE, cols: 3.25, rate: 2, direction });
    assert.equal(a.length, 4, `${direction}: 3.25칸 = 4칸`);
    const minW = Math.min(...a.map((c) => c.w));
    assert.ok(Math.abs(a[3].w - minW) < 1e-6 || a[3].w < a[2].w, `${direction}: 부분 칸은 우측 끝`);
    // 극소(0폭 수렴) 칸은 드랍 — 스트로크 틱 방지 (§261)
    const b = computeColumns({ ...BASE, cols: 3 + 1e-6, rate: 2, direction });
    assert.equal(b.length, 3, `${direction}: 극소 칸 드랍`);
  }
  ok('L4′: 부분 칸 = 항상 우측 + 극소 칸 드랍 (양 방향)', () => {});
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
    assert.ok(cs[cs.length - 1].R <= p.W + 5e-3, `오버플로: ${cs[cs.length - 1].R} > ${p.W}`);
    assert.ok(cs[0].L >= -5e-3);
  }
  ok('총폭 보존: 랜덤 30조합 오버플로 없음', () => {});
}


// ── §262: step 모드 — 온전 슬롯 가상 경계 (결착·연장·연속성) ──
{
  // 정수 offset = flow와 완전 동일 (부분 칸 없음 — 결착)
  for (const phi of [0, 1, -2]) {
    const a = computeColumns({ ...BASE, cols: 7, offset: phi, mode: 'flow' });
    const b = computeColumns({ ...BASE, cols: 7, offset: phi, mode: 'step' });
    colsClose(b, a, 1e-9);
  }
  ok('§262 step: 정수 offset 결착 = flow/정적과 동일', () => {});
  // 소수 offset: 양 끝 칸이 온전 슬롯 폭으로 유닛 밖까지 연장
  const st = computeColumns({ ...BASE, cols: 7, rate: 2, offset: 0.4, mode: 'step' });
  const fl = computeColumns({ ...BASE, cols: 7, rate: 2, offset: 0.4, mode: 'flow' });
  assert.ok(st[0].L < -1e-6, `좌측 가상 연장: ${st[0].L}`);
  assert.ok(st[st.length - 1].R > BASE.W + 1e-6, `우측 가상 연장: ${st[st.length - 1].R}`);
  // 내부(온전) 칸들은 두 모드 동일
  for (let i = 1; i < st.length - 1; i += 1) {
    assert.ok(Math.abs(st[i].L - fl[i].L) < 1e-9 && Math.abs(st[i].R - fl[i].R) < 1e-9, `내부 칸 ${i} 불일치`);
  }
  ok('§262 step: 끝 칸 = 온전 슬롯(밖 연장), 내부 칸 = flow와 동일', () => {});
  // 가상 폭 = 워프 연장의 그 슬롯 전체 폭 (좌측: 슬롯 [t1−1, t1])
  const inner1 = st[1];
  assert.ok(st[0].w > fl[0].w, 'step 끝 칸이 flow 부분 칸보다 넓어야');
  assert.ok(st[0].w > inner1.w, '좌측(넓은 쪽) 슬롯이 이웃보다 넓어야 (rate 2)');
  ok('§262 step: 가상 폭이 수열 연속선상 (좌측 슬롯 > 이웃)', () => {});
}

console.log(`✓ grid field: ${passed} cases passed`);
