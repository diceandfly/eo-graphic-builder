// §261: 오리엔테이션/플립 전수 검증 — 렌더(R∘M: 로컬 미러 후 회전)와 판정 헬퍼의 일치.
// 과거 버그: localPointToCanvas가 flipX를 캔버스(회전 후) 미러로 계산해 90/270°+flipX 조합에서
// 판정이 180° 어긋남 → "좌우반전했는데 앵커가 상하로 바뀌어 보이는" 이상현상.
import { strict as assert } from 'node:assert';
import { localPointToCanvas, canvasPointToLocal, deriveUnit } from '../src/geometry/derive.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
const close = (a, b) => Math.abs(a - b) < 1e-9;
const ORIENTS = [0, 90, 180, 270];
const PTS = [[0, 0], [1, 0], [0, 1], [0.25, 0.7], [0.9, 0.1]];

// ── 8상태 왕복: canvasPointToLocal ∘ localPointToCanvas = 항등 ──
{
  for (const orientation of ORIENTS) {
    for (const flipX of [false, true]) {
      const p = { orientation, flipX };
      for (const [u, v] of PTS) {
        const [x, y] = localPointToCanvas(p, u, v);
        const [u2, v2] = canvasPointToLocal(p, x, y);
        assert.ok(close(u, u2) && close(v, v2), `round-trip 깨짐 @o${orientation} f${flipX}: (${u},${v})→(${u2},${v2})`);
      }
    }
  }
  ok('왕복 항등: 8상태 × 5점 전수', () => {});
}

// ── 렌더 일치: 헬퍼 = R(orientation) ∘ M(flipX, 로컬) — deriveUnit의 미러-후-회전 순서 ──
{
  const rot = (o, x, y) => {
    if (o === 90) return [1 - y, x];
    if (o === 180) return [1 - x, 1 - y];
    if (o === 270) return [y, 1 - x];
    return [x, y];
  };
  for (const orientation of ORIENTS) {
    for (const flipX of [false, true]) {
      const p = { orientation, flipX };
      for (const [u, v] of PTS) {
        const uu = flipX ? 1 - u : u;        // 로컬 미러 먼저 (렌더 순서)
        const [ex, ey] = rot(orientation, uu, v);
        const [x, y] = localPointToCanvas(p, u, v);
        assert.ok(close(x, ex) && close(y, ey), `렌더 불일치 @o${orientation} f${flipX}`);
      }
    }
  }
  ok('렌더 순서 일치: flipX = 회전 전 로컬 미러 (8상태 전수)', () => {});
}

// ── 플립 연산 수학: 화면 H/V 미러가 상태 변환으로 정확히 표현되는지 (16 시나리오) ──
// 화면 H-flip 규칙(useDocument flipUnit): isOdd ? (o+180, f토글) : (f토글)
// 화면 V-flip 규칙(flipUnitV):            isOdd ? (f토글) : (o+180, f토글)
{
  const isOdd = (o) => o === 90 || o === 270;
  const applyH = ({ orientation, flipX }) =>
    isOdd(orientation) ? { orientation: (orientation + 180) % 360, flipX: !flipX } : { orientation, flipX: !flipX };
  const applyV = ({ orientation, flipX }) =>
    isOdd(orientation) ? { orientation, flipX: !flipX } : { orientation: (orientation + 180) % 360, flipX: !flipX };
  for (const orientation of ORIENTS) {
    for (const flipX of [false, true]) {
      const p = { orientation, flipX };
      const ph = applyH(p);
      const pv = applyV(p);
      for (const [u, v] of PTS) {
        const [x, y] = localPointToCanvas(p, u, v);
        const [hx, hy] = localPointToCanvas(ph, u, v);
        assert.ok(close(hx, 1 - x) && close(hy, y), `H-flip 불일치 @o${orientation} f${flipX}: (${x},${y})→(${hx},${hy})`);
        const [vx, vy] = localPointToCanvas(pv, u, v);
        assert.ok(close(vx, x) && close(vy, 1 - y), `V-flip 불일치 @o${orientation} f${flipX}`);
      }
    }
  }
  ok('플립 연산: 화면 H/V 미러 = 상태 변환과 정확 일치 (16 시나리오 전수)', () => {});
}


// ── §265: grow = 형태 불변의 논리 파라미터 — 정적 레이아웃 동일, 생산 끝단만 반대 ──
{
  const base = {
    W: 960, H: 800, orientation: 0, cols: 6, gutterMode: 'fixed', gutterPx: 10, g: 0.2,
    rate: 2, direction: 'LtoS', dPct: 35, a: 0.4, b: 0, threads: 'both', threadDir: 'LtoR',
    flipX: false, offset: 0, offsetType: 'step', grow: 'r',
  };
  const wsR = deriveUnit(base).columns.map((c) => c.w);
  const wsL = deriveUnit({ ...base, grow: 'l' }).columns.map((c) => c.w);
  assert.equal(wsR.length, wsL.length);
  for (let i = 0; i < wsR.length; i += 1) assert.ok(Math.abs(wsR[i] - wsL[i]) < 1e-6, `정적 형태 변형 @${i}`);
  ok('grow: 정적 레이아웃 불변 (r = l, 정수 cols·offset 0)', () => {});
  const cr = deriveUnit({ ...base, cols: 6.4 }).columns;
  const cl = deriveUnit({ ...base, cols: 6.4, grow: 'l' }).columns;
  assert.ok(cr[cr.length - 1].R > base.W + 1e-6, 'grow r: 우측 연장');
  assert.ok(Math.abs(cr[0].L) < 1e-6, 'grow r: 좌측 고정');
  assert.ok(cl[0].L < -1e-6, 'grow l: 좌측 연장');
  assert.ok(Math.abs(cl[cl.length - 1].R - base.W) < 1e-6, 'grow l: 우측 고정');
  // 밀도 방향(넓→좁)은 양쪽 동일 — compression과 충돌 없음
  assert.ok(cr[0].w > cr[cr.length - 2].w && cl[1].w > cl[cl.length - 1].w);
  ok('grow: 부분 칸 끝단만 미러 — 밀도 방향 불변 (compression 독립)', () => {});
}

console.log(`✓ orientation: ${passed} cases passed`);
