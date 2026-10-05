# 아이콘 카탈로그 (생성물)

앱에서 쓰는 모든 아이콘의 **열람용 SVG 사본**. `node scripts/export-icon-assets.mjs`로 생성·갱신.

- **런타임 단일 출처는 여기가 아님** — UI 아이콘 패스는 `src/ui/icons.js`(ICONS), 곡선 프리셋 글리프(`curve-*.svg`)는 `src/geometry/anim.js`(CURVE_PRESETS). 아이콘을 고치려면 그 파일을 고친 뒤 스크립트 재실행.
- 색은 열람 편의상 Solid Gray(#333333) 고정 — 앱에서는 CSS 변수(currentColor/var(--text))로 칠해짐.
- 이 폴더에 없는 인라인 일회성 글리프: EO 심볼(`src/assets/EO symbol_S_W.svg`, ManagerBar), 애니 와이어 메뉴 막대 3개(AnimOverlay 인라인), 재생/정지 호버 글리프(AnimWindow 인라인), 커서 6종(`src/assets/cursor/`).
