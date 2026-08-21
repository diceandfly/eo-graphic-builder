import { MIN_COL_W } from './constants.js';

// MIN_COL_W 가드로 늘어난 만큼 전체를 재정규화 — 합계가 목표(inner/k)를 넘지 않게.
// (극소 폭에서 가드가 컬럼을 억지로 넓혀 W를 초과하던 오버플로 방지. 서브픽셀 영역이라 비율 왜곡은 비가시)
function renorm(ws, target) {
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum <= target || sum === 0) return ws;
  const f = target / sum;
  return ws.map((w) => w * f);
}

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
    colW = renorm(wN.map((w) => Math.max(MIN_COL_W, k * w)), k);
    gutterAfter = (i) => g * colW[i];
  } else {
    const inner = Math.max(0, W - (cols - 1) * gutterPx);
    colW = renorm(wN.map((w) => Math.max(MIN_COL_W, w * inner)), inner);
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
