import { MIN_COL_W } from './constants.js';

// MIN_COL_W 가드로 늘어난 만큼 전체를 재정규화 — 합계가 목표(inner/k)를 넘지 않게.
// (극소 폭에서 가드가 컬럼을 억지로 넓혀 W를 초과하던 오버플로 방지. 서브픽셀 영역이라 비율 왜곡은 비가시)
function renorm(ws, target) {
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum <= target || sum === 0) return ws;
  const f = target / sum;
  return ws.map((w) => w * f);
}

// ─── §255: 연속 그리드 필드 — 등비수열 레이아웃의 일반화 ─────────
// 모델: 공간 고정 밀도 필드 g(지수 누적 워프, 끝점 0→0/1→1) 속을 칸이 흐른다.
//  · cols(N) = 연속 허용 — 비정수는 좁은 끝단의 부분 칸 (성장/소멸 끝단 = 좁은 쪽, L4)
//  · offset(φ) = 칸 단위 위상, 소수·± 허용, 랩 순환 (φ+1 = 동일 화면, L3)
//  · direction = **캐노니컬(LtoS: 넓→좁) 계산 후 좌표 미러** — 반전 = 구조적으로 정확한 거울 (L2).
//    (주의: 구 구현의 proportional+StoL은 "거터 = 왼쪽 col 비례"가 방향을 안 따라가 완전 대칭이
//     아니었음 — §255 공리 우선으로 미러 통일, 해당 조합의 정적 레이아웃이 미세 변경됨)
//  · 컷 거터 스케일 = min(1, 양옆 칸의 인덱스 길이) — 칸이 끝단에서 0으로 수렴할 때 거터도
//    함께 0으로: 칸 생성/소멸이 무점프 연속 (애니 L1·L3의 화면 연속성 보장)
// 정수 cols + offset 0 = 종전 출력과 동일 (fixed 전 방향·proportional LtoS — 회귀 테스트 고정).
// 반환: [{ L, R, w }] (px, 좌→우)
export function computeColumns({ W, cols, gutterMode, gutterPx, g, rate, direction, offset = 0 }) {
  const EPS = 1e-9;
  const N = Math.max(1, Number(cols) || 1);
  const r = Math.max(1e-6, Number(rate) || 1);
  // 인덱스 공간 경계: 양 끝(0, N) + 내부 컷 (k − frac(φ))
  const f = (((Number(offset) || 0) % 1) + 1) % 1;
  const ts = [0];
  for (let k = 1; ; k += 1) {
    const t = k - f;
    if (t >= N - EPS) break;
    if (t > EPS) ts.push(t);
  }
  ts.push(N);
  // 워프 — 캐노니컬(넓→좁): 밀도 ∝ r^(−N·u), 누적 g(u) = (1 − r^(−N·u)) / (1 − r^(−N)). r→1 = 선형
  const a = Math.log(r) * N;
  const gw = Math.abs(a) < 1e-9 ? (u) => u : (u) => (1 - Math.exp(-a * u)) / (1 - Math.exp(-a));
  const nCells = ts.length - 1;
  const wN = [];
  const len = []; // 칸의 인덱스 공간 길이 (부분 칸 < 1) — MIN 가드·거터 스케일 공용
  for (let i = 0; i < nCells; i += 1) {
    wN.push(gw(ts[i + 1] / N) - gw(ts[i] / N));
    len.push(ts[i + 1] - ts[i]);
  }
  const gs = []; // 컷 j(칸 j|j+1 사이)의 거터 스케일
  for (let j = 0; j < nCells - 1; j += 1) gs.push(Math.min(1, len[j], len[j + 1]));

  let colW;
  let gutterAfter; // gutterAfter(i): col i 뒤의 거터 (마지막 col 뒤는 없음)
  if (gutterMode === 'proportional') {
    // Σ k·wN + Σ g·k·wN[j]·gs[j] = W (정수·φ0에서 종전 폐형식과 일치)
    const k = W / (1 + g * wN.slice(0, -1).reduce((s, w, j) => s + w * gs[j], 0));
    colW = renorm(wN.map((w, i) => Math.max(MIN_COL_W * Math.min(1, len[i]), k * w)), k);
    gutterAfter = (i) => g * colW[i] * gs[i];
  } else {
    const inner = Math.max(0, W - gs.reduce((s, v) => s + v, 0) * gutterPx);
    colW = renorm(wN.map((w, i) => Math.max(MIN_COL_W * Math.min(1, len[i]), w * inner)), inner);
    gutterAfter = (i) => gutterPx * gs[i];
  }

  let out = [];
  let x = 0;
  for (let i = 0; i < nCells; i += 1) {
    const L = x;
    const R = L + colW[i];
    out.push({ L, R, w: colW[i] });
    x = R + (i < nCells - 1 ? gutterAfter(i) : 0);
  }
  // §255: StoL = 캐노니컬 좌표 미러 (L2) — 성장 끝단·흐름 방향이 함께 뒤집힌다
  if (direction === 'StoL') {
    out = out.map((c) => ({ L: W - c.R, R: W - c.L, w: c.w })).reverse();
  }
  return out;
}
