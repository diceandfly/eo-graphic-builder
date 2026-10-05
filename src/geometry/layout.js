import { MIN_COL_W } from './constants.js';

// MIN_COL_W 가드로 늘어난 만큼 전체를 재정규화 — 합계가 목표(inner/k)를 넘지 않게.
// (극소 폭에서 가드가 컬럼을 억지로 넓혀 W를 초과하던 오버플로 방지. 서브픽셀 영역이라 비율 왜곡은 비가시)
function renorm(ws, target) {
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum <= target || sum === 0) return ws;
  const f = target / sum;
  return ws.map((w) => w * f);
}

// ─── §255·§261: 연속 그리드 필드 — 등비수열 레이아웃의 일반화 ─────────
// 모델: 공간 고정 밀도 필드 g(지수 누적 워프, 끝점 0→0/1→1) 속을 칸이 흐른다.
//  · cols(N) = 연속 허용 — 비정수 부분 칸의 생성/소멸 끝단 = **항상 우측 고정**(L4′ — §261:
//    "좁은 쪽" 규칙 폐기. direction이 보간 중 부호를 지날 때 끝단이 좌↔우로 점프하며
//    50% 틱을 만들던 원인. 반대쪽 성장이 필요하면 flipX = 표시 미러)
//  · offset(φ) = 칸 단위 위상, 소수·± 허용, 랩 순환 (φ+1 = 동일 화면, L3). +φ = 화면 왼쪽으로 흐름(방향 무관)
//  · direction = **지수의 부호**(좌표 미러 아님 — §261: §255의 미러 방식 폐기): 컷 사다리·끝단·거터
//    규칙은 방향 무관 캐노니컬 고정, 밀도 기울기만 뒤집힌다 → rate·direction 결합 부호 보간이
//    균등(0)을 지나는 내내 연속. 정적 결과는 구(§pre-255) 구현과 완전 호환(proportional StoL 포함).
//  · 컷 거터 스케일 = min(1, 양옆 칸의 인덱스 길이) — 칸 생성/소멸 무점프.
//  · 극소 칸 드랍(w < 0.75px) — 0폭 칸의 스트로크가 1~2px로 깜빡이는 틱 방지 (§261).
//  · mode (§262): 'flow' = 부분 칸을 눌린 폭으로 그림(종전) / 'step' = 부분 칸을 **온전 슬롯 폭**
//    (가상 경계 — 유닛 밖으로 연장될 수 있음)으로 내보내 렌더가 유닛 경계로 클립 — 샤프트가
//    통째로 미끄러져 들어와 정수 offset마다 결착하는 스텝 컨베이어. 경계 수학은 flow와 동일.
// 반환: [{ L, R, w }] (px, 좌→우 — step의 끝 칸은 L<0 또는 R>W 가능)
export function computeColumns({ W, cols, gutterMode, gutterPx, g, rate, direction, offset = 0, mode = 'flow' }) {
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
  // 워프 — 밀도 ∝ r^(∓N·u), 누적 g(u) = (1 − e^(−a·u)) / (1 − e^(−a)), a = ±ln(r)·N. r→1 = 선형.
  // LtoS = +a(넓→좁), StoL = −a(좁→넓) — 같은 식의 부호만 바뀌므로 a가 0을 지나도 연속 (§261)
  const a = Math.log(r) * N * (direction === 'StoL' ? -1 : 1);
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

  const out = [];
  let x = 0;
  for (let i = 0; i < nCells; i += 1) {
    const L = x;
    const R = L + colW[i];
    out.push({ L, R, w: colW[i] });
    x = R + (i < nCells - 1 ? gutterAfter(i) : 0);
  }
  // §262: step 모드 — 부분 칸을 "온전 슬롯"의 가상 경계로 치환 (렌더가 유닛 밖을 클립).
  // 가상 폭 = 같은 워프 g를 도메인 밖으로 자연 연장(지수식 — 단조)해 구한 그 슬롯의 전체 폭.
  if (mode === 'step' && nCells > 0) {
    const wnSum = wN.reduce((s, v) => s + v, 0);
    const pxSum = colW.reduce((s, v) => s + v, 0);
    const scale = wnSum > 0 ? pxSum / wnSum : 0; // 가드/renorm 반영된 유효 px 배율
    if (len[0] < 1 - EPS) { // 왼쪽 부분 칸: 슬롯 = [t1−1, t1]
      const vw = (gw(ts[1] / N) - gw((ts[1] - 1) / N)) * scale;
      out[0] = { L: out[0].R - vw, R: out[0].R, w: vw };
    }
    const li = nCells - 1;
    if (li > 0 && len[li] < 1 - EPS) { // 오른쪽 부분 칸: 슬롯 = [tk, tk+1]
      const vw = (gw((ts[li] + 1) / N) - gw(ts[li] / N)) * scale;
      out[li] = { L: out[li].L, R: out[li].L + vw, w: vw };
    }
  }
  // §261·§262: 극소 **부분 칸** 드랍 — 기준 = **가시 폭**(step은 가상 폭이 커도 보이는 조각이
  // 0.75px 미만이면 스트로크 틱만 남음). 정적 극압축의 실제 가는 칸(len=1)은 유지 (회귀 보존)
  return out.filter((c, i) => {
    const visW = Math.min(c.R, W) - Math.max(c.L, 0);
    return visW >= 0.75 || len[i] >= 1 - EPS;
  });
}
