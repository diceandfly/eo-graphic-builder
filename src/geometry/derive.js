import { computeColumns } from './layout.js';
import { buildUnit } from './unit.js';
import { D_PCT_MAX } from './constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const f = (n) => n.toFixed(3);

// params → 지오메트리 파생. Vue 의존성 0 — 렌더러와 export가 공유.
// params.W/H는 캔버스(회전 반영) 치수, 지오메트리는 로컬(비회전) 좌표계에서 계산.
export function deriveUnit(p) {
  const odd = p.orientation === 90 || p.orientation === 270;
  const localW = odd ? p.H : p.W;
  const localH = odd ? p.W : p.H;
  const D = (localH * clamp(p.dPct, 0, D_PCT_MAX)) / 100;
  // §263: flipX = **컬럼 좌표 미러 + 나사산 형상 미러(threadDir 스왑)** — 완전한 표시 미러.
  // (§261의 "direction 스왑" 방식은 부호 모델에서 밀도만 뒤집고 생산 끝단·컷·offset 흐름을
  //  안 뒤집어 flipX가 반쪽 미러가 됐었음 — 교차 유닛들의 cols 생산이 전부 같은 쪽으로 나오던 버그)
  // §263: grow('r'|'l') = 유닛별 생산/흐름 끝단 선택 — 컬럼 좌표 미러만(형상은 유지).
  // 둘이 겹치면 상쇄(XOR).
  const threadDir = p.flipX
    ? (p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR')
    : p.threadDir;
  let columns = computeColumns({
    W: localW, cols: p.cols, gutterMode: p.gutterMode,
    gutterPx: p.gutterPx, g: p.g, rate: p.rate, direction: p.direction,
    offset: p.offset ?? 0,
    // §262: offsetType — 'step'(기본) = 부분 칸을 온전 슬롯으로(유닛 밖 연장 → 렌더 클립) /
    // 'flow' = 눌린 부분 칸 (종전)
    mode: p.offsetType === 'flow' ? 'flow' : 'step',
  });
  if ((p.grow === 'l') !== !!p.flipX) {
    columns = columns.map((c) => ({ L: localW - c.R, R: localW - c.L, w: c.w })).reverse();
  }
  const unit = buildUnit({
    columns, W: localW, H: localH, D,
    a: p.a, b: p.b, threads: p.threads, threadDir,
  });
  // clip: step 가상 경계가 유닛 밖으로 나갈 때만 렌더가 클립 창을 씌움 (미러 반영 후 판정)
  const clip = columns.some((c) => c.L < -1e-6 || c.R > localW + 1e-6);
  return { localW, localH, D, columns, unit, clip };
}

// §204·§205: 회전(orientation)·반전(flipX) 통합 판정 단일 소스 — 유닛 박스의 정규화 좌표
// (0~1)를 로컬 ↔ 캔버스로 변환한다. 두 오리엔트가 개별 저장되어 중첩 판정이 흩어지던 혼선 방지:
// 오리엔트 조합을 따지는 로직은 반드시 이 두 헬퍼를 쓸 것. (예: 로컬 원점 (0,0)은 0°=좌상,
// 90°=우상, 180°=우하, 270°=좌하, flipX는 캔버스 좌우 미러)
// §261: flipX는 **로컬(회전 전) 미러** — 렌더가 deriveUnit에서 direction/threadDir을 뒤집어
// 로컬 지오메트리를 미러한 뒤 orientationTransform을 적용하므로(R∘M 순서), 판정도 같은 순서여야 한다.
// (구현 전: 캔버스(회전 후) 미러로 계산해 90/270°+flipX 조합에서 판정이 180° 어긋났음 —
//  "좌우반전했는데 앵커가 상하로 바뀌어 보이던" 이상현상의 원인)
export function localPointToCanvas(p, u, v) {
  const uu = p.flipX ? 1 - u : u;
  if (p.orientation === 90) return [1 - v, uu];
  if (p.orientation === 180) return [1 - uu, 1 - v];
  if (p.orientation === 270) return [v, 1 - uu];
  return [uu, v];
}
export function canvasPointToLocal(p, x, y) {
  let u, v;
  if (p.orientation === 90) { u = y; v = 1 - x; }
  else if (p.orientation === 180) { u = 1 - x; v = 1 - y; }
  else if (p.orientation === 270) { u = 1 - y; v = x; }
  else { u = x; v = y; }
  return [p.flipX ? 1 - u : u, v];
}

// 로컬 좌표 → 캔버스 배치 transform (0/90/180/270, 시계방향)
export function orientationTransform(o, localW, localH) {
  if (o === 90) return `rotate(90) translate(0 ${f(-localH)})`;
  if (o === 180) return `rotate(180) translate(${f(-localW)} ${f(-localH)})`;
  if (o === 270) return `rotate(270) translate(${f(-localW)} 0)`;
  return '';
}
