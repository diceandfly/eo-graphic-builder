// §224 애니메이션 보간 엔진 회귀 — geometry/anim.js (순수 모듈, Vue 의존 0)
import { strict as assert } from 'node:assert';
import { bezierEase, lerpParams, lerpHex, samplePose, CURVE_PRESETS } from '../src/geometry/anim.js';

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

ok('베지어: 끝점 고정 + 선형 항등', () => {
  for (const c of CURVE_PRESETS) {
    assert.equal(bezierEase(c.curve, 0), 0);
    assert.equal(bezierEase(c.curve, 1), 1);
  }
  assert.ok(Math.abs(bezierEase([0, 0, 1, 1], 0.37) - 0.37) < 1e-3);
});
ok('베지어: ease in-out 대칭·단조', () => {
  const c = [0.42, 0, 0.58, 1];
  assert.ok(Math.abs(bezierEase(c, 0.5) - 0.5) < 1e-3);
  let prev = 0;
  for (let i = 1; i <= 20; i++) {
    const y = bezierEase(c, i / 20);
    assert.ok(y >= prev - 1e-6);
    prev = y;
  }
  assert.ok(bezierEase(c, 0.15) < 0.15); // in 구간은 느리게
  assert.ok(bezierEase(c, 0.85) > 0.85); // out 구간은 앞서감
});
ok('파라미터 보간: 문자열 숫자도 lerp (§225 — 패널 편집값 "500" 등)', () => {
  const mid = lerpParams({ W: 100, flipX: false }, { W: '500', flipX: true }, 0.5);
  assert.equal(mid.W, 300);              // '500' 강제 변환 lerp
  assert.equal(mid.flipX, true);         // 불리언은 50% 컷 (수치 변환 금지)
});
ok('색 보간: hex RGB lerp (§226 — "50%에 뚝" 주범 해결)', () => {
  assert.equal(lerpHex('#000000', '#ffffff', 0.5), '#808080');
  const q = lerpParams({ fill: '#F9EE3A' }, { fill: '#6EC6D2' }, 0.25);
  assert.notEqual(q.fill, '#F9EE3A');
  assert.notEqual(q.fill, '#6EC6D2');
  assert.ok(/^#[0-9a-f]{6}$/.test(q.fill));
  // 비 hex 문자열은 여전히 컷
  assert.equal(lerpParams({ gutterMode: 'fixed' }, { gutterMode: 'prop' }, 0.4).gutterMode, 'fixed');
});
ok('이산키: orientation 등은 수치여도 50% 컷 (§226)', () => {
  const m4 = lerpParams({ orientation: 0 }, { orientation: 90 }, 0.4);
  const m6 = lerpParams({ orientation: 0 }, { orientation: 90 }, 0.6);
  assert.equal(m4.orientation, 0);
  assert.equal(m6.orientation, 90);
});
ok('파라미터 보간: 연속 lerp · cols 다단계 스텝 · 비수치 50% 컷', () => {
  const a = { W: 100, H: 200, cols: 12, gutterMode: 'fixed', flipX: false };
  const b = { W: 300, H: 200, cols: 9, gutterMode: 'prop', flipX: false };
  const mid = lerpParams(a, b, 0.5);
  assert.equal(mid.W, 200);
  assert.equal(mid.H, 200);
  assert.equal(mid.flipX, false);
  assert.equal(mid.gutterMode, 'prop'); // t=0.5부터 to값
  assert.equal(lerpParams(a, b, 0.49).gutterMode, 'fixed');
  // cols 12→9: 구간별 한 칸씩 (반올림 스텝) — 등장 값이 12,11,10,9 전부
  const seen = new Set();
  for (let t = 0; t <= 1.0001; t += 0.05) seen.add(lerpParams(a, b, Math.min(1, t)).cols);
  assert.deepEqual([...seen].sort((x, y) => y - x), [12, 11, 10, 9]);
});
ok('포즈: 페어 유닛 = 프레임 로컬 위치·파라미터 lerp', () => {
  const fA = { id: 1, params: { W: 1000, H: 800, fill: '#333' } , x: 0, y: 0 };
  const fB = { id: 2, params: { W: 1000, H: 800, fill: '#333' }, x: 5000, y: 0 };
  const uA = { id: 10, pair: 7, x: 100, y: 100, params: { W: 200, H: 100, opacity: 100 } };
  const uB = { id: 20, pair: 7, x: 5000 + 500, y: 300, params: { W: 400, H: 100, opacity: 100 } };
  const pose = samplePose(fA, [uA], fB, [uB], 0.5);
  assert.equal(pose.W, 1000);
  assert.equal(pose.items.length, 1);
  const it = pose.items[0];
  assert.equal(it.dx, 300); // (100→500 로컬) 중간
  assert.equal(it.dy, 200);
  assert.equal(it.params.W, 300);
  assert.equal(it.opacity, 1);
});
ok('포즈: 페어 없는 유닛 = 페이드 아웃/인', () => {
  const fA = { id: 1, params: { W: 1000, H: 800 }, x: 0, y: 0 };
  const fB = { id: 2, params: { W: 1000, H: 800 }, x: 0, y: 0 };
  const onlyA = { id: 11, pair: null, x: 10, y: 10, params: { W: 100, H: 100, opacity: 100 } };
  const onlyB = { id: 21, pair: null, x: 20, y: 20, params: { W: 100, H: 100, opacity: 80 } };
  const pose = samplePose(fA, [onlyA], fB, [onlyB], 0.25);
  const a = pose.items.find((i) => i.key === 'a11');
  const b = pose.items.find((i) => i.key === 'b21');
  assert.ok(Math.abs(a.opacity - 0.75) < 1e-9);       // 1-t
  assert.ok(Math.abs(b.opacity - 0.8 * 0.25) < 1e-9); // 유닛 opacity × t
});
ok('포즈: opacity 파라미터도 lerp (페어)', () => {
  const fA = { id: 1, params: { W: 1000, H: 800 }, x: 0, y: 0 };
  const fB = { id: 2, params: { W: 1000, H: 800 }, x: 0, y: 0 };
  const uA = { id: 10, pair: 3, x: 0, y: 0, params: { W: 100, H: 100, opacity: 100 } };
  const uB = { id: 20, pair: 3, x: 0, y: 0, params: { W: 100, H: 100, opacity: 0 } };
  const pose = samplePose(fA, [uA], fB, [uB], 0.5);
  assert.ok(Math.abs(pose.items[0].opacity - 0.5) < 1e-9);
});

console.log(`✓ anim engine: ${passed} cases passed`);
