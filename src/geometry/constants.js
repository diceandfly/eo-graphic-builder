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
export const THREAD_MIN_PX = 1; // thread 최소 폭 하한 — 문서 px 절대값 (§108: "1px 미만 라인 보정"이 목적이라 유닛 크기 무관 절대 기준으로 전환, 비율 방식 폐기)
// (THREAD_OVERLAP은 §200에서 폐기 — 스레드가 샤프트 중앙까지 파고들어 오버랩 불필요)
export const UNIT_MIN = 20;      // 유닛 W/H 내부 가드 하한 기본값 (px, §109: 2→20 상향). 런타임 조정은 LIMITS.unitMin
export const UNIT_MAX = 8000;    // 유닛 W/H 내부 가드 상한 (px)
// 런타임 조정 가능한 지오메트리 하한 (§87) — 기본값 = 위 상수, 줌% 우클릭 메뉴에서 편집.
// geometry 순수성 유지를 위해 플레인 객체(Vue 의존 없음). 소비처는 호출 시점에 읽는다.
export const LIMITS = { unitMin: UNIT_MIN, threadMinPx: THREAD_MIN_PX };
export const ASPECT_TOL = 0.01;  // 비율 프리셋 칩 활성 판정 허용오차
export const COMP_SCALE = 2.5;   // compression 슬라이더 표기 범위 (±2.5x)
export const COMP_SNAP = 0.1;    // 중앙 0 스냅 반경 (표기 단위)
// 프레임 그리드 컴프레션 (§133) — 매핑 로직은 유닛과 동일, 상한만 확장:
// 2등분에서 최대 9:1 (= 10등분 그리드의 90% 라인에 분할선이 걸림)
export const FRAME_COMP_SCALE = 9;
export const FRAME_RATE_MAX = 9;
export const STAGE_GRID = 80;    // 대시보드 배경 라인 그리드 간격 기본값 (px, 월드 좌표)
export const STAGE_GRID_MIN = 20;   // 격자 하한 — 과소 간격의 렌더 부하 방지
export const STAGE_GRID_MAX = 1000;
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
// ── 브랜드 스와치 (도형 fill) — §200: 팔레트 단일 출처는 geometry/brandColors.js ──
// 여기서는 팔레트를 파생 형태(토큰 맵·스와치 배열)로만 노출한다.
// main.js가 부팅 시 CSS 1층 토큰(--eo-neon 등)으로 주입 — colors.css의 1층 값은
// 첫 페인트용 폴백일 뿐. 색 변경은 반드시 brandColors.js에서.
import { BRAND_PALETTE } from './brandColors.js';
export { BRAND_PALETTE };
export const BRAND_TOKENS = Object.fromEntries(BRAND_PALETTE.map((c) => [c.token, c.hex]));
// 스와치 표시 순서 = 팔레트 배열 순서 (§146: Y G B W MG SG SB, 커스텀 C가 마지막)
export const BRAND_COLORS = BRAND_PALETTE.map((c) => c.hex);
// BRAND_COLORS와 인덱스 1:1 — 스와치 툴팁·단축키(1~6) 안내용
export const BRAND_COLOR_NAMES = BRAND_PALETTE.map((c) => c.name);
