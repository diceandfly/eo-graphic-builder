import { computeColumns } from './layout.js';
import { buildUnit } from './unit.js';
import { D_PCT_MAX } from './constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const f = (n) => n.toFixed(3);

// params → 지오메트리 파생. Vue 의존성 0 — 렌더러와 export가 공유.
// params.W/H는 캔버스(회전 반영) 치수, 지오메트리는 로컬(비회전) 좌표계에서 계산.
// opts.dockedEnds (§292): { left, right } — 도킹된 면 (렌더 로컬 기준, dockAttachedEnds 산출)
export function deriveUnit(p, opts = {}) {
  const odd = p.orientation === 90 || p.orientation === 270;
  const localW = odd ? p.H : p.W;
  const localH = odd ? p.W : p.H;
  const D = (localH * clamp(p.dPct, 0, D_PCT_MAX)) / 100;
  // §263: flipX = **컬럼 좌표 미러 + 나사산 형상 미러(threadDir 스왑)** — 완전한 표시 미러.
  // §265: grow = **형태 불변의 논리 파라미터** (사용자 재정의) — 정적 레이아웃(압축 분포)은
  // 그대로 두고, cols 생산·offset 흐름의 끝단만 compression과 같은 쪽/반대쪽으로 정한다.
  // 구현: 반대쪽(l)이면 "필드를 뒤집어 계산한 결과를 좌표 미러" — 밀도는 이중 반전으로 원위치,
  // 컷 사다리·부분 칸 끝단·흐름만 미러된다. (§263의 '절대 좌표 미러' 방식은 정적 형태까지
  // 뒤집어 compression ±·orientation과 중복 충돌 — 폐기)
  const threadDir = p.flipX
    ? (p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR')
    : p.threadDir;
  const rev = p.grow === 'l';
  const fieldDir = rev
    ? (p.direction === 'LtoS' ? 'StoL' : 'LtoS')
    : p.direction;
  let columns = computeColumns({
    W: localW, cols: p.cols, gutterMode: p.gutterMode,
    gutterPx: p.gutterPx, g: p.g, rate: p.rate, direction: fieldDir,
    offset: p.offset ?? 0,
    // §262: offsetType — 'step'(기본) = 부분 칸을 온전 슬롯으로(유닛 밖 연장 → 렌더 클립) /
    // 'flow' = 눌린 부분 칸 (종전)
    mode: p.offsetType === 'flow' ? 'flow' : 'step',
  });
  const mirrorCols = (cs) => cs.map((c) => ({ L: localW - c.R, R: localW - c.L, w: c.w, len: c.len })).reverse();
  if (rev) columns = mirrorCols(columns);      // §265: 생산/흐름만 반대 끝 (밀도 원위치)
  if (p.flipX) columns = mirrorCols(columns);  // §263: 표시 미러 (형상은 threadDir 스왑이 담당)
  const unit = buildUnit({
    columns, W: localW, H: localH, D,
    a: p.a, b: p.b, threads: p.threads, threadDir,
    dockedEnds: opts.dockedEnds ?? null,
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
