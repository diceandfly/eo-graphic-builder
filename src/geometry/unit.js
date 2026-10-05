import { EPS, LIMITS } from './constants.js';

// 유닛 지오메트리. 상/하 thread는 처음부터 분리 (Phase 3 비대칭 대비).
// 반환 좌표는 raw number — 문자열 포매팅(소수 3자리)은 렌더러 책임.
// threads: 'both' | 'one'
// 'both': shaft 세로 중앙, 상/하 thread 밴드 대칭
// 'one' : shaft가 캔버스 바닥에 접하고(shaftBot = H), 상단 밴드가 위쪽 전체를 차지
// threadDir: 'LtoR' | 'RtoL' — RtoL이면 각 col 안에서 thread를 좌우 반전
// threadMin: §274 — threadMinPx(§108) 오버라이드 (애니 시뮬레이터 토글용). null/undefined = 전역 LIMITS.
export function buildUnit({ columns, W, H, D, a, b, threads = 'both', threadDir = 'LtoR', threadMin = null }) {
  const one = threads === 'one';
  const rtl = threadDir === 'RtoL';
  const shaftTop = one ? H - D : (H - D) / 2;
  const shaftBot = one ? H : (H + D) / 2;
  const h = shaftTop; // 상단 thread 밴드 높이

  const shaft = D < EPS ? null : { x: 0, y: shaftTop, width: W, height: D };

  // §200: 스레드가 샤프트 중앙(cy)까지 파고든다 — 밑변 양끝에서 사선을 그대로 연장(x 시프트 = b·w/2,
  // 사선이 shaft 전체 깊이 D에 b·w를 가로지르므로 절반 깊이엔 절반 시프트). 스레드·샤프트 경계에
  // 맞닿는 선이 사라져 줌 배율과 무관하게 안티앨리어싱 틈이 원천 차단된다 (구 THREAD_OVERLAP 1px 대체).
  // 'both'는 상하 스레드 밑변이 cy에서 정확히 일치 — 이음선이 샤프트 솔리드 내부라 보이지 않음.
  // 스레드 밴드 안의 실루엣(수직 변 포함)은 종전 사다리꼴과 동일.
  const cy = (shaftTop + shaftBot) / 2;
  const ext = b / 2; // 연장부 x 시프트 계수 (× w)

  const threadsTop = [];
  const threadsBottom = [];
  const minW = threadMin ?? LIMITS.threadMinPx;  // 극한 압축 보정 — 문서 px 절대 하한 (§108)
  const blendEnd = 3 * minW;          // minW~3·minW 구간에서 사다리꼴 → 직사각형 모프
  const wantBottom = !one;
  if (h >= EPS) {
    for (const { L, R, w } of columns) {
      if (w < minW) {
        // 극한 압축: 최소폭 직사각형으로 대체 (캔버스 안쪽으로 클램프) — 밑변은 cy까지
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
        threadsTop.push([[tx1, cy], [tx1, 0], [tx2, 0], [tx2, cy]]);
        if (wantBottom) {
          const [bx1, bx2] = rect(rtl);
          threadsBottom.push([[bx2, H - cy], [bx2, H], [bx1, H], [bx1, H - cy]]);
        }
      } else {
        // 시계방향: 좌하 킨크(Δb) → 좌상(Δa) → 우상 → 우하 킨크 → 우측 연장 밑점 → 좌측 연장 밑점
        let top = [
          [L + b * w, shaftTop],
          [R - a * w, 0],
          [R, 0],
          [R, shaftTop],
          [R - ext * w, cy],
          [L + (b - ext) * w, cy],
        ];
        // 모프 블렌드: 폭이 blendEnd 아래로 내려가면 col 전체 직사각형 형태로 선형 보간.
        // t=1(blendEnd)에서 온전한 형태, t=0(minW)에서 직사각형 — 이진 치환의 시각적 점프 제거.
        if (w < blendEnd) {
          const t = (w - minW) / (blendEnd - minW);
          const rect = [[L, shaftTop], [L, 0], [R, 0], [R, shaftTop], [R, cy], [L, cy]];
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
