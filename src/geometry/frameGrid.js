// 프레임 내부 레이아웃 그리드 라인 (로컬 px 좌표) — 렌더(FrameGraphic)와 스냅(이동) 공유
export function frameGridLines(p) {
  const { W, H, margin, rows, cols, gutterX, gutterY } = p;
  const mx = margin;
  const my = margin;
  const cw = W - 2 * mx;
  const ch = H - 2 * my;
  const v = [];
  const h = [];
  if (cw > 0 && ch > 0) {
    const nc = Math.max(1, Math.round(cols));
    const nr = Math.max(1, Math.round(rows));
    const colW = (cw - gutterX * (nc - 1)) / nc;
    const rowH = (ch - gutterY * (nr - 1)) / nr;
    if (colW > 0) {
      for (let i = 1; i < nc; i++) {
        const x = mx + i * colW + (i - 1) * gutterX;
        v.push(x);
        if (gutterX > 0) v.push(x + gutterX);
      }
    }
    if (rowH > 0) {
      for (let i = 1; i < nr; i++) {
        const y = my + i * rowH + (i - 1) * gutterY;
        h.push(y);
        if (gutterY > 0) h.push(y + gutterY);
      }
    }
  }
  return { mx, my, v, h };
}
