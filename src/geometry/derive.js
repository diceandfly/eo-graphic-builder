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
  });
  const unit = buildUnit({
    columns, W: localW, H: localH, D,
    a: p.a, b: p.b, threads: p.threads, threadDir,
  });
  return { localW, localH, D, columns, unit };
}

// §204: 회전(orientation)·반전(flipX) 통합 판정 단일 소스 — 유닛의 "로컬 원점(앵커) 코너"가
// 캔버스에서 어느 코너에 놓이는지. 두 오리엔트가 개별 저장되어 중첩 판정이 흩어지던 혼선 방지:
// 오리엔트 조합을 따지는 로직은 반드시 이 헬퍼를 쓸 것.
// 회전(시계): 0→좌상 90→우상 180→우하 270→좌하, flipX = 캔버스 좌우 미러(좌↔우).
export function localOriginCorner(p) {
  const base = { 0: 'tl', 90: 'tr', 180: 'br', 270: 'bl' }[p.orientation] ?? 'tl';
  return p.flipX ? { tl: 'tr', tr: 'tl', br: 'bl', bl: 'br' }[base] : base;
}

// 로컬 좌표 → 캔버스 배치 transform (0/90/180/270, 시계방향)
export function orientationTransform(o, localW, localH) {
  if (o === 90) return `rotate(90) translate(0 ${f(-localH)})`;
  if (o === 180) return `rotate(180) translate(${f(-localW)} ${f(-localH)})`;
  if (o === 270) return `rotate(270) translate(${f(-localW)} 0)`;
  return '';
}
