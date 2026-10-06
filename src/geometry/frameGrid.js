import { FRAME_RATE_MAX, FRAME_COMP_SCALE } from './constants.js';

// 프레임 rect 표현 속성 — 렌더(FrameGraphic)와 export(exportSvg) 단일 경로 (§120).
// fill/stroke 독립 토글(§110) 규칙은 여기에만 존재해야 한다 (유닛의 deriveUnit과 같은 역할).
export function frameAttrs(p) {
  return {
    fill: p.fillOn ? p.fill : 'none',
    stroke: p.strokeOn ? p.stroke : 'none',
    strokeW: p.strokeOn ? p.strokeW : 0,
  };
}

// 그리드 컴프레션 가중치 (§131·§133) — v: 부호 있는 압축값(±FRAME_COMP_SCALE, 0 = 균등),
// 매핑은 유닛 컴프레션과 동일 구조(rate = 1 + |v|/SCALE·(MAX-1)), 상한만 9 (2등분 최대 9:1).
// mode 'dir': 한 방향 등비 (+ = 앞쪽 넓게, 유닛 L→S와 동일 부호 규약)
// mode 'sym': 중앙 대칭 (+ = 중앙 넓게 ↔ − = 가장자리 넓게)
function compWeights(n, v, mode) {
  if (!v || n < 2) return Array(n).fill(1);
  const rate = 1 + (Math.min(Math.abs(v), FRAME_COMP_SCALE) / FRAME_COMP_SCALE) * (FRAME_RATE_MAX - 1);
  const w = [];
  for (let i = 0; i < n; i++) {
    const e = mode === 'sym' ? -Math.abs(i - (n - 1) / 2) : n - 1 - i;
    w.push(v > 0 ? rate ** e : rate ** -e);
  }
  return w;
}

// 프레임 내부 레이아웃 그리드 라인 (로컬 px 좌표) — 렌더(FrameGraphic)와 스냅(이동) 공유
export function frameGridLines(p) {
  const { W, H, margin, rows, cols, gutterX, gutterY } = p;
  // §309: 비대칭 마진 — marginAsym on이면 T/R/B/L 개별(미정의는 margin 폴백), off면 균일
  const asym = !!p.marginAsym;
  const mL = asym ? (p.marginL ?? margin) : margin;
  const mR = asym ? (p.marginR ?? margin) : margin;
  const mT = asym ? (p.marginT ?? margin) : margin;
  const mB = asym ? (p.marginB ?? margin) : margin;
  const mx = mL;
  const my = mT;
  const cw = W - mL - mR;
  const ch = H - mT - mB;
  const v = [];
  const h = [];
  if (cw > 0 && ch > 0) {
    const nc = Math.max(1, Math.round(cols));
    const nr = Math.max(1, Math.round(rows));
    const innerW = cw - gutterX * (nc - 1);
    const innerH = ch - gutterY * (nr - 1);
    // §131: 컴프레션 on이면 등비 가중 분배, off면 균등 (가중 [1,…] = 종전과 동일 좌표)
    const wx = p.compOn ? compWeights(nc, p.compX, p.compModeX) : Array(nc).fill(1);
    const wy = p.compOn ? compWeights(nr, p.compY, p.compModeY) : Array(nr).fill(1);
    const sx = wx.reduce((a, b) => a + b, 0);
    const sy = wy.reduce((a, b) => a + b, 0);
    if (innerW > 0) {
      let x = mx;
      for (let i = 0; i < nc - 1; i++) {
        x += (innerW * wx[i]) / sx;
        v.push(x);
        if (gutterX > 0) v.push(x + gutterX);
        x += gutterX;
      }
    }
    if (innerH > 0) {
      let y = my;
      for (let i = 0; i < nr - 1; i++) {
        y += (innerH * wy[i]) / sy;
        h.push(y);
        if (gutterY > 0) h.push(y + gutterY);
        y += gutterY;
      }
    }
  }
  // §309: 콘텐츠 박스 동봉 — 소비자(렌더·스냅)가 대칭 가정(W−2mx) 없이 사용
  return { mx, my, v, h, bx: mL, by: mT, bw: Math.max(0, cw), bh: Math.max(0, ch) };
}
