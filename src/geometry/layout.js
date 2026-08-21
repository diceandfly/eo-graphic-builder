import { MIN_COL_W } from './constants.js';

// 등비수열 컬럼 레이아웃. 반환: [{ L, R, w }] (px, 좌→우)
// gutterMode 'fixed'        : 거터를 먼저 빼고 남은 폭을 배수비로 분배
// gutterMode 'proportional' : 거터가 자기 왼쪽 col 폭에 비례해 함께 압축 (오버플로 구조적 불가)
export function computeColumns({ W, cols, gutterMode, gutterPx, g, rate, direction }) {
  const raw = [];
  for (let i = 0; i < cols; i++) {
    raw.push(direction === 'LtoS' ? rate ** (cols - 1 - i) : rate ** i);
  }
  const sum = raw.reduce((s, v) => s + v, 0);
  const wN = raw.map((v) => v / sum);

  let colW, gutterAfter; // gutterAfter(i): col i 뒤의 거터 (마지막 col 뒤는 없음)
  if (gutterMode === 'proportional') {
    // Σ colW + Σ g·colW[i<last] = k·(1 + g·(1 - wN[last])) = W
    const k = W / (1 + g * (1 - wN[cols - 1]));
    colW = wN.map((w) => Math.max(MIN_COL_W, k * w));
    gutterAfter = (i) => g * colW[i];
  } else {
    const inner = Math.max(0, W - (cols - 1) * gutterPx);
    colW = wN.map((w) => Math.max(MIN_COL_W, w * inner));
    gutterAfter = () => gutterPx;
  }

  const out = [];
  let x = 0;
  for (let i = 0; i < cols; i++) {
    const L = x;
    const R = L + colW[i];
    out.push({ L, R, w: colW[i] });
    x = R + (i < cols - 1 ? gutterAfter(i) : 0);
  }
  return out;
}
