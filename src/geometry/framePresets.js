// ─── 퀵 프레임 프리셋 (§201) ──────────────────────────────
// SNS 배너 규격 + 안전영역 경계 그리드 — 그리드 컴프레션(sym)으로 경계선을 정확히 표현.
// comp 값 유도: rate = 1 + |v|/9·8 (§133), 3분할 sym에서 중앙:사이드 = rate(+) / 1:rate(−).
// 수치 출처(2026 가이드 기준, 자세한 근거는 SPEC §201):
//  · YouTube 채널 아트 2560×1440 — 데스크탑 표시 2560×423 · 모바일/안전 1546×423 (센터)
//  · X 헤더 1500×500 — 상하 크롭 대비 중앙 60% 밴드(1500×300)가 안전영역
//  · LinkedIn 개인 1584×396 — 안전영역 약 1350×220 센터 (가로는 comp 상한 9:1에 맞춰 1296 보수 적용)
//  · LinkedIn 회사 1128×191 — 모바일 좌우 크롭 대비 중앙 70% 폭(789.6px)이 안전영역 (세로 크롭 없음)
// 값 수정은 이 파일에서만 — 퀵 프레임 팝업 토글·더블클릭 생성이 이 데이터를 그대로 사용.
export const FRAME_PRESETS = [
  {
    id: 'youtube', label: 'YouTube banner', w: 2560, h: 1440,
    grid: {
      margin: 0, rows: 3, cols: 3, gutterX: 0, gutterY: 0,
      compOn: true, compModeX: 'sym', compX: 2.3055, compModeY: 'sym', compY: -0.2274,
    }, // 세로선 x 507·2053 (모바일 1546 폭) · 가로선 y 508.5·931.5 (데스크탑 423 밴드)
  },
  {
    id: 'x', label: 'X banner', w: 1500, h: 500,
    grid: {
      margin: 0, rows: 3, cols: 1, gutterX: 0, gutterY: 0,
      compOn: true, compModeX: 'sym', compX: 0, compModeY: 'sym', compY: 2.25,
    }, // 가로선 y 100·400 (중앙 60% 안전 밴드)
  },
  {
    id: 'linkedin', label: 'LinkedIn profile', w: 1584, h: 396,
    grid: {
      margin: 0, rows: 3, cols: 3, gutterX: 0, gutterY: 0,
      compOn: true, compModeX: 'sym', compX: 9, compModeY: 'sym', compY: 1.6875,
    }, // 세로선 x 144·1440 (안전폭 1296) · 가로선 y 88·308 (안전높이 220)
  },
  {
    id: 'linkedin-co', label: 'LinkedIn company', w: 1128, h: 191,
    grid: {
      margin: 0, rows: 1, cols: 3, gutterX: 0, gutterY: 0,
      compOn: true, compModeX: 'sym', compX: 4.125, compModeY: 'sym', compY: 0,
    }, // 세로선 x 169.2·958.8 (중앙 70% 안전폭)
  },
];
export const framePresetById = (id) => FRAME_PRESETS.find((p) => p.id === id) || null;
