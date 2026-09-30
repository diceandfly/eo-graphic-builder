// ─── 브랜드 컬러 팔레트 단일 출처 (§200 리뉴얼) ──────────────────
// 화면 렌더는 hex, rgb/cmyk/pantone은 출력(인쇄) 연계용 메타데이터.
// 이 배열이 유일한 정의처: constants.js가 스와치(BRAND_COLORS 등)를 파생하고,
// 작업파일 저장(JSON)의 colors 섹션으로도 그대로 내보낸다 — 컬러 수정은 반드시 여기서.
// token = 내부 CSS 변수 키 (--eo-neon 등). 코드 전반의 참조 안정성을 위해 구명 유지,
// 표시명(name)만 리뉴얼 네이밍을 따른다. 배열 순서 = 스와치 표시 순서 (§146: Y G B W MG SG SB).
// §213: §200 리뉴얼 이전 브랜드 hex → 현행 hex — 문서·프리셋·패턴 로드 시 자동 치환.
// (리뉴얼 전에 칠한 오브젝트가 구색을 유지해 "팔레트 미반영"처럼 보이던 문제의 해결)
export const LEGACY_HEX = {
  '#F9EE48': '#F9EE3A', // EO NEON → Builder Neon
  '#55BB73': '#66B88A', // WORLD GREEN → Bay Green
  '#6ECBD6': '#6EC6D2', // HORIZON BLUE → Day Blue
  '#EFEAE1': '#FCFBF5', // HALO WHITE → Air White
  '#3B3B3B': '#333333', // VOID GREY → Solid Gray
  '#0B0B0B': '#000000', // 구 SPACE BLACK → Space Black
};
export const migrateBrandHex = (v) =>
  (typeof v === 'string' && LEGACY_HEX[v.toUpperCase()]) || v;

export const BRAND_PALETTE = [
  { token: 'eo-neon',      name: 'Builder Neon', hex: '#F9EE3A', rgb: [250, 239, 54],  cmyk: [5, 0, 95, 0],   pantone: '3945 C' },
  { token: 'horizon-blue', name: 'Day Blue',     hex: '#6EC6D2', rgb: [110, 198, 210], cmyk: [60, 0, 10, 0],  pantone: '298 C' }, // §201: 그린과 순서 교체
  { token: 'world-green',  name: 'Bay Green',    hex: '#66B88A', rgb: [102, 184, 138], cmyk: [60, 0, 50, 0],  pantone: '2248 C' },
  { token: 'halo-white',   name: 'Air White',    hex: '#FCFBF5', rgb: [252, 251, 245], cmyk: [1, 2, 2, 0],    note: 'or raw paper' },
  { token: 'steel-grey',   name: 'Medium Gray',  hex: '#8E8E8E', rgb: [142, 142, 142], cmyk: [2, 0, 0, 45],   note: 'or K45 only' },
  { token: 'void-grey',    name: 'Solid Gray',   hex: '#333333', rgb: [51, 51, 51],    cmyk: [4, 0, 0, 100],  note: 'or K100 only' },
  { token: 'space-black',  name: 'Space Black',  hex: '#000000', rgb: [0, 0, 0],       cmyk: [60, 60, 0, 100] },
];
