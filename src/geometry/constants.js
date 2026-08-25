// 지오메트리/제약 상수. 튜닝 지점은 전부 여기로 모은다.
export const A_MIN = 0.10;       // Δa 하한 (col 폭 대비)
export const A_MAX = 0.70;       // Δa 상한
export const B_MIN = 0;          // Δb 하한
export const B_MAX = 0.70;       // Δb 상한
export const AB_SUM_MAX = 0.90;  // Δa+Δb 상한 — 초과 시 반대쪽을 밀어내며 경사변 런 10% 유지 (역전 방지)
export const COLS_MIN = 1;
export const COLS_MAX = 24;
export const RATE_MIN = 1.0;
export const RATE_MAX = 2.5;
export const RATE_STEP = 0.001;
export const CHIP_TOL = 0.004;   // 비율칩 활성 판정 허용오차
export const MIN_COL_W = 0.01;   // 폭 0 수렴 col의 path 붕괴 가드 (px)
export const EPS = 0.01;         // degenerate 도형 생략 기준 (px)
export const D_PCT_MIN = 2;      // shaft 높이 하한 (H 대비 %)
export const D_PCT_MAX = 95;     // shaft 높이 상한 (H 대비 %)
export const GUTTER_MIN = 10;    // gutterPx 슬라이더 하한 (px)
export const G_MIN = 0.2;        // proportional 거터 비율 하한
export const G_MAX = 0.5;        // proportional 거터 비율 상한
export const G_STEP = 0.005;     // proportional 거터 슬라이더 step
export const GUTTER_MAX = 50;    // gutterPx 슬라이더 상한 (px) — min(GUTTER_MAX, W/cols)
export const THREAD_MIN_RATIO = 0.0006; // col 폭 < W·비율 이면 thread를 W·비율 폭 직사각형으로 렌더 (§70: 0.2%→0.1%, §82: 0.06%)
export const THREAD_OVERLAP = 1; // thread를 shaft 쪽으로 1px 파묻어 AA 유격 제거
export const UNIT_MIN = 2;       // 유닛 W/H 내부 가드 하한 (px). 지오메트리는 1px까지 무충돌 — 블렌드 극한 수렴 허용(§80), 소실 방지 최소 가드만
export const UNIT_MAX = 8000;    // 유닛 W/H 내부 가드 상한 (px)
export const ASPECT_TOL = 0.01;  // 비율 프리셋 칩 활성 판정 허용오차
export const COMP_SCALE = 2.5;   // compression 슬라이더 표기 범위 (±2.5x)
export const COMP_SNAP = 0.1;    // 중앙 0 스냅 반경 (표기 단위)
export const STAGE_GRID = 80;    // 대시보드 배경 라인 그리드 간격 기본값 (px, 월드 좌표)
export const STAGE_GRID_MIN = 20;   // 격자 하한 — 과소 간격의 렌더 부하 방지
export const STAGE_GRID_MAX = 1000;
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
// 브랜드 스와치 (도형 fill) — styles/tokens/colors.css의 네임드 토큰과 값 동기 유지
// EO NEON · WORLD GREEN · HORIZON BLUE · HALO WHITE · VOID GREY
// ── 브랜드 컬러 단일 출처 (§68 부채 정리) ──
// 여기가 유일한 정의처: main.js가 부팅 시 CSS 1층 토큰(--eo-neon 등)으로 주입한다.
// colors.css의 1층 값은 첫 페인트용 폴백일 뿐 — 색 변경은 반드시 여기서.
export const BRAND_TOKENS = {
  'eo-neon': '#F9EE48',
  'world-green': '#55BB73',
  'horizon-blue': '#6ECBD6',
  'space-black': '#0B0B0B',
  'void-grey': '#8E8E8E',
  'halo-white': '#EFEAE1',
  'black': '#000000',
};
// 스와치 구성 (표시 순서). BLACK은 §65에서 숨겼다가 §82에서 6번으로 재도입.
const SWATCHES = [
  ['EO NEON', 'eo-neon'],
  ['WORLD GREEN', 'world-green'],
  ['HORIZON BLUE', 'horizon-blue'],
  ['VOID GREY', 'void-grey'],
  ['HALO WHITE', 'halo-white'],
  ['BLACK', 'black'],
];
export const BRAND_COLORS = SWATCHES.map(([, k]) => BRAND_TOKENS[k]);
// BRAND_COLORS와 인덱스 1:1 — 스와치 툴팁·단축키(1~6) 안내용
export const BRAND_COLOR_NAMES = SWATCHES.map(([n]) => n);
