# 스타일 관리 가이드 (리팩토링 7단계 — 경계 규칙)

"이 스타일은 어느 파일에 넣어야 하지?"의 답. 브랜딩 적용 시에도 이 순서로 찾는다.

## 파일 지도

| 층 | 파일 | 무엇을 담는가 | 언제 고치나 |
|---|---|---|---|
| **토큰** | `tokens/colors.css` | 브랜드 네임드 컬러(1층: EO NEON·WORLD GREEN·HORIZON BLUE·SPACE BLACK·VOID GREY·HALO WHITE) → 시맨틱(2층: bg/panel/line/text/faint/accent/danger/link/guide…) | 색을 바꿀 때. **값만** 고친다. 컴포넌트에 색 리터럴 금지 |
| | `tokens/typography.css` | 폰트 소스(@import)·`--font-sans`·크기 위계(fs-2xs/xs/sm/md)·자간(ls-base/wide/caps)·굵기 | 폰트 교체 / 위계 조정 |
| | `tokens/spacing.css` | 레이아웃 층위 간격(sp-1~6, sp-section, panel-pad) | 여백 리듬 조정 |
| | `tokens/sizes.css` | 컴포넌트 치수(btn/icon/thumb/check/swatch/panel-w/zoom-w)·`--radius` | 버튼 크기·라운딩 정책 |
| | `tokens/motion.css` | 툴팁 지연·토스트 시간 | 타이밍 감각 |
| **레시피** | `mixins.scss` | 패널 보더형 컨트롤 룩(`bordered-control`·`active-filled`·`active-outline(-inset)`·`text-field`) | 패널 컨트롤(칩·seg·ghost·입력칸)의 공통 룩 |
| **전역** | `../style.css` | 리셋, body 기본, 네이티브 폼 요소(range/checkbox) 커스터마이즈 | 네이티브 요소 외형 |
| **공용 컴포넌트** | `../components/ui/IconButton.vue` / `FloatingBar.vue` | 플로팅 바 버튼·컨테이너의 마크업+스타일 단일 출처 | 툴바/코너바/정렬바 버튼 디자인 |
| **아이콘** | `../ui/icons.js` | 24vb 스트로크 패스 딕셔너리 | 아이콘 교체/추가 |
| **컴포넌트 scoped** | 각 `.vue` `<style scoped lang="scss">` | 그 컴포넌트만의 레이아웃(배치·정렬·고유 패딩) | 레이아웃 변경 |

## 경계 규칙

1. **색·폰트크기·자간·라운딩·버튼치수는 컴포넌트에 리터럴로 쓰지 않는다.** 반드시 `var(--…)`. (예외: 체크박스 data-uri 체크마크 — `style.css` 주석 참고)
2. **컴포넌트 scoped에는 "레이아웃"만** — `display/gap/margin/position/width` 류. 룩(보더·호버·활성)은 토큰/믹스인/공용 컴포넌트로.
3. **패널 컨트롤 룩 = `mixins.scss`**, **플로팅 바 룩 = `IconButton`/`FloatingBar`**. 새 버튼이 필요하면 둘 중 하나를 확장하고, 세 번째 스타일을 만들지 않는다.
4. **토큰은 CSS 커스텀 프로퍼티로만** 정의한다(런타임 교체 가능). SCSS 변수($)로 토큰을 만들지 않는다. SCSS는 중첩·믹스인(저작 편의)에만 사용.
5. **간격 토큰은 레이아웃 층위**(섹션·바·행 간격)에만. 컴포넌트 내부 미세 패딩(칩 5px 9px 등)은 고유값 허용.
6. **캔버스 위 SVG 오버레이**(바운딩박스·핸들·가이드·갭 마커)는 `--radius` 미적용, 스트로크는 `vector-effect: non-scaling-stroke` + 토큰 색. JS 타이밍은 `utils/cssToken.js`로 토큰을 읽어 동기.
7. **JS 측 색**(도형 fill 스와치)은 `geometry/constants.js BRAND_COLORS` — `tokens/colors.css` 1층 값과 **수동 동기** 필요 (현재 5색 동일).

## 브랜딩 적용 절차 (요약)

1. `tokens/colors.css` 1층 값 교체 → `BRAND_COLORS` 동기 → 체크마크 data-uri 색 교체
2. 폰트 확정 시 `tokens/typography.css` @import + `--font-sans` (셀프호스팅이면 @font-face)
3. 라운딩 도입 시 `tokens/sizes.css --radius`
4. 버튼/컨트롤 룩 조정은 `IconButton.vue` · `mixins.scss`
5. 아이콘 세트 교체는 `ui/icons.js`
