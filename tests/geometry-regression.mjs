// ─── 지오메트리 회귀 스위트 (§68 부채 ⑥) ──────────────────
// 파라미터 조합별 SVG export 문자열을 스냅샷으로 저장/비교한다.
// 브라우저·의존성 없이 node로 실행 — 지오메트리/export 리팩토링의 안전망.
//
//   node tests/geometry-regression.mjs            # 기준선과 비교 (diff 시 exit 1)
//   node tests/geometry-regression.mjs --update   # 기준선 재생성 (의도된 변경 후)
//
// 기준선: tests/baselines/geometry.json (커밋 대상)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createParams } from '../src/composables/useDocument.js';
import { deriveUnit } from '../src/geometry/derive.js';
import { buildSvgString } from '../src/export/exportSvg.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, 'baselines', 'geometry.json');

// ── 조합 정의: 각 축의 대표값 + 경계값. 데카르트 곱이 아니라 선별 목록.
const combos = [];
const add = (id, overrides) => combos.push({ id, overrides });

// 기본형과 축별 변주
add('default', {});
add('cols-min', { cols: 3 });
add('cols-max', { cols: 24 });
add('rate-1', { rate: 1 });
add('rate-max', { rate: 2.5 });
add('dir-StoL', { direction: 'StoL' });
add('gutter-0', { gutterPx: 0 });
add('gutter-prop', { gutterMode: 'proportional', g: 0.2 });
add('gutter-prop-min', { gutterMode: 'proportional', g: 0.2, cols: 24 });
add('shaft-min', { dPct: 2 });
add('shaft-max', { dPct: 95 });
add('a-min', { a: 0.1 });
add('a-max', { a: 0.7 });
add('b-max', { b: 0.7, a: 0.2 });
add('ab-couple', { a: 0.7, b: 0.7 });
add('threads-one', { threads: 'one' });
add('threadDir-RtoL', { threadDir: 'RtoL' });
add('flipX', { flipX: true });
add('flipX-StoL', { flipX: true, direction: 'StoL' });
add('orient-90', { orientation: 90, W: 800, H: 960 });
add('orient-180', { orientation: 180 });
add('orient-270', { orientation: 270, W: 800, H: 960 });
// 극소/극대 크기 (renorm·THREAD_OVERLAP 가드 경계)
add('tiny-1px', { W: 1, H: 1 });
add('tiny-10px', { W: 10, H: 10 });
add('tiny-wide', { W: 1200, H: 4 });
add('tiny-tall', { W: 4, H: 1200 });
add('huge', { W: 8000, H: 8000 });
// 복합 케이스
add('combo-compress-one', { rate: 2.5, threads: 'one', cols: 18, dPct: 10 });
add('combo-flip-rot', { flipX: true, orientation: 90, W: 675, H: 1200, threadDir: 'RtoL' });
add('combo-prop-extreme', { gutterMode: 'proportional', g: 3, cols: 12, rate: 2.5 });

// ── 스냅샷 생성
function snapshot() {
  const out = {};
  for (const { id, overrides } of combos) {
    const p = createParams(overrides);
    const d = deriveUnit(p);
    const svg = buildSvgString({
      type: 'unit', W: p.W, H: p.H, unit: d.unit, orientation: p.orientation, fill: p.fill,
    });
    // NaN/Infinity는 즉시 실패 (스냅샷 이전의 하드 가드)
    if (/NaN|Infinity/.test(svg)) {
      console.error(`✗ ${id}: SVG contains NaN/Infinity`);
      process.exit(1);
    }
    out[id] = {
      hash: createHash('sha256').update(svg).digest('hex').slice(0, 16),
      bytes: svg.length,
    };
  }
  return out;
}

const current = snapshot();

if (process.argv.includes('--update')) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline updated: ${combos.length} combos → ${BASELINE}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error('no baseline — run with --update first');
  process.exit(1);
}

const diffs = [];
for (const { id } of combos) {
  if (!baseline[id]) diffs.push(`${id}: new combo (baseline missing)`);
  else if (baseline[id].hash !== current[id].hash) {
    diffs.push(`${id}: hash ${baseline[id].hash} → ${current[id].hash} (${baseline[id].bytes} → ${current[id].bytes} bytes)`);
  }
}
for (const id of Object.keys(baseline)) {
  if (!current[id]) diffs.push(`${id}: combo removed`);
}

if (diffs.length) {
  console.error(`✗ geometry regression: ${diffs.length} diff(s)`);
  for (const d of diffs) console.error('  ' + d);
  console.error('의도된 변경이면: node tests/geometry-regression.mjs --update');
  process.exit(1);
}
console.log(`✓ geometry regression: ${combos.length} combos match baseline`);
