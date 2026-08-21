import { EPS, THREAD_MIN_RATIO, THREAD_OVERLAP } from './constants.js';

// 유닛 지오메트리. 상/하 thread는 처음부터 분리 (Phase 3 비대칭 대비).
// 반환 좌표는 raw number — 문자열 포매팅(소수 3자리)은 렌더러 책임.
// threads: 'both' | 'one'
// 'both': shaft 세로 중앙, 상/하 thread 밴드 대칭
// 'one' : shaft가 캔버스 바닥에 접하고(shaftBot = H), 상단 밴드가 위쪽 전체를 차지
// threadDir: 'LtoR' | 'RtoL' — RtoL이면 각 col 안에서 thread를 좌우 반전
export function buildUnit({ columns, W, H, D, a, b, threads = 'both', threadDir = 'LtoR' }) {
  const one = threads === 'one';
  const rtl = threadDir === 'RtoL';
  const shaftTop = one ? H - D : (H - D) / 2;
  const shaftBot = one ? H : (H + D) / 2;
  const h = shaftTop; // 상단 thread 밴드 높이

  const shaft = D < EPS ? null : { x: 0, y: shaftTop, width: W, height: D };

  // thread 밑변을 shaft 쪽으로 1px 파묻어 경계 안티앨리어싱 유격을 없앤다
  const yB = shaftTop + THREAD_OVERLAP;

  const threadsTop = [];
  const threadsBottom = [];
  const minW = W * THREAD_MIN_RATIO;  // 극한 압축 기준은 캔버스 폭 비례 (기본 0.2%)
  const blendEnd = 3 * minW;          // minW~3·minW 구간에서 사다리꼴 → 직사각형 모프
  const wantBottom = !one;
  if (h >= EPS) {
    for (const { L, R, w } of columns) {
      if (w < minW) {
        // 극한 압축: 최소폭 직사각형으로 대체 (캔버스 안쪽으로 클램프)
        const rect = (attachRight) => {
          let x1, x2;
          if (attachRight) {
            x1 = R - minW; x2 = R;
            if (x1 < 0) { x1 = 0; x2 = minW; }
          } else {
            x1 = L; x2 = L + minW;
            if (x2 > W) { x2 = W; x1 = W - minW; }
          }
          return [x1, x2];
        };
        const [tx1, tx2] = rect(!rtl);
        threadsTop.push([[tx1, yB], [tx1, 0], [tx2, 0], [tx2, yB]]);
        if (wantBottom) {
          const [bx1, bx2] = rect(rtl);
          threadsBottom.push([[bx2, H - yB], [bx2, H], [bx1, H], [bx1, H - yB]]);
        }
      } else {
        // 시계방향: 좌하(Δb) → 좌상(Δa) → 우상 → 우하
        let top = [
          [L + b * w, yB],
          [R - a * w, 0],
          [R, 0],
          [R, yB],
        ];
        // 모프 블렌드: 폭이 blendEnd 아래로 내려가면 col 전체 직사각형 형태로 선형 보간.
        // t=1(blendEnd)에서 온전한 사다리꼴, t=0(minW)에서 직사각형 — 이진 치환의 시각적 점프 제거.
        if (w < blendEnd) {
          const t = (w - minW) / (blendEnd - minW);
          const rect = [[L, yB], [L, 0], [R, 0], [R, yB]];
          top = top.map(([x, y], i) => [rect[i][0] + t * (x - rect[i][0]), y]);
        }
        if (rtl) top = top.map(([x, y]) => [L + R - x, y]); // col 내 좌우 반전
        threadsTop.push(top);
        // 하단 = 컬럼 중심점 기준 180° 회전 (점대칭): x' = L+R-x, y' = H-y
        if (wantBottom) threadsBottom.push(top.map(([x, y]) => [L + R - x, H - y]));
      }
    }
  }
  return { shaft, threadsTop, threadsBottom, shaftTop, shaftBot, h };
}
