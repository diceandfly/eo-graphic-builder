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
  // flipX(표시 계수): 저작 파라미터는 그대로 두고 렌더 시에만 방향·기울기를 반전
  const direction = p.flipX
    ? (p.direction === 'LtoS' ? 'StoL' : 'LtoS')
    : p.direction;
  const threadDir = p.flipX
    ? (p.threadDir === 'LtoR' ? 'RtoL' : 'LtoR')
    : p.threadDir;
  const columns = computeColumns({
    W: localW, cols: p.cols, gutterMode: p.gutterMode,
    gutterPx: p.gutterPx, g: p.g, rate: p.rate, direction,
    // §255: offset은 부호 그대로 — flipX의 표시 미러는 direction 스왑만으로 완성됨
    // (StoL = 캐노니컬 좌표 미러 구조라, 같은 φ의 미러가 곧 화면 전체 미러. φ까지 뒤집으면 이중 반전)
    offset: p.offset ?? 0,
  });
  const unit = buildUnit({
    columns, W: localW, H: localH, D,
    a: p.a, b: p.b, threads: p.threads, threadDir,
  });
  return { localW, localH, D, columns, unit };
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
