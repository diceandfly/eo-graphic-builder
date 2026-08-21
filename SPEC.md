# EO Graphic Builder — Phase 1 Spec (확정본)

> 이 문서 하나로 새 세션에서 바로 개발 착수 가능하도록 작성된 인수인계 문서.
> Phase 1 사양은 **전부 확정**되었음. 미결 사항 없음.
> 최종 갱신: 2026-08-19

---

## 0. 프로젝트 개요

추상화된 **나사축 단면(screw shaft cross-section)** 그래픽을, 배수관계(등비수열) 컬럼 그리드 위에 얹어 생성하는 파라메트릭 빌더.

- **스택**: Vue 3 + Vite (JS). 렌더링은 인라인 SVG.
- **위치**: `/Users/taeil/Desktop/dev/Web/eo-graphic-builder/`
- **UI**: 1차는 기능 검증용 최소 UI. 디자인은 사용자가 직접 수정 예정.
  → **요청되지 않은 기능은 넣지 말 것.** 레퍼런스 빌더의 UI 그룹 구조를 통째로 베끼지 않는다.

### 단계 계획
| 단계 | 범위 |
|---|---|
| **Phase 1 (지금)** | 단일 유닛 캔버스, 세로 컬럼 그리드 1행 고정, shaft + thread 렌더, 파라미터 컨트롤 |
| Phase 2 | 유닛을 조합해 템플릿 컴포지션 (캔버스를 비율로 분할 → 각 영역에 유닛 배치 + flip-x/flip-y) |
| Phase 3+ | row 방향 전개, thread 상/하 비대칭 및 한쪽만 남기기, SVG/PNG export |

Phase 2의 목표 결과물은 별첨 레퍼런스(30장 카드 그리드) 형태.
→ **따라서 Phase 1의 렌더 결과는 self-contained한 `<g>` 심볼이어야 하며, 외부에서 translate/scale/flip만으로 재배치 가능해야 한다.**

---

## 1. 용어 (이 이름으로 통일)

| 이름 | 의미 |
|---|---|
| **unit canvas** | 유닛 1개가 그려지는 캔버스. `W × H` (px) |
| **col** | 세로 컬럼. 총 `cols`개 |
| **gutter** | col 사이 간격 |
| **compression** | col 폭의 배수비 (등비수열 공비). 값은 `rate` |
| **shaft** | 나사기둥. 세로 중앙정렬된 가로 막대 |
| **D** | shaft의 높이 (px) |
| **thread** | 나사선. shaft 위/아래 밴드에 col마다 1쌍 붙는 사다리꼴 |
| **Δb** | thread 사다리꼴 **좌하 꼭지점**의, 해당 col **왼쪽 끝**으로부터의 거리 (col 폭 대비 비율) |
| **Δa** | thread 사다리꼴 **좌상 꼭지점**의, 해당 col **오른쪽 끝**으로부터의 거리 (col 폭 대비 비율) |

---

## 2. 지오메트리 사양

### 2.1 컬럼 레이아웃

정규화된 등비수열. 인접 col의 폭 비는 정확히 `rate`.

```js
raw[i] = direction === 'LtoS' ? rate ** (cols - 1 - i)   // 좌측이 가장 넓음
                              : rate ** i                 // 우측이 가장 넓음
wN[i]  = raw[i] / sum(raw)                                // 정규화, Σ wN = 1
```

거터 모드가 두 가지이고, 폭 산출식이 갈린다. *(2차에서 삭제했다가 7차에서 복원)*

**(a) `gutterMode: 'fixed'`** — 거터를 먼저 빼고 남은 폭을 배수비로 분배 (레퍼런스와 동일)

```js
inner   = max(0, W - (cols - 1) * gutterPx)
colW[i] = wN[i] * inner
```
- `gutterPx` 슬라이더 범위: `10 – min(30, W/cols)` (§7 오버플로 결함 방지)

**(b) `gutterMode: 'proportional'`** — 거터가 자기 왼쪽 col 폭에 비례해 함께 압축

```js
gutter[i] = g * colW[i]              // i = 0 .. cols-2, 마지막 col 뒤에는 거터 없음
k         = W / (1 + g * (1 - wN[cols-1]))
colW[i]   = k * wN[i]
```
- 유도: `Σ colW + Σ g·colW[i<last] = k·(1 + g·(1 - wN[last])) = W`
- 이 모드에서는 **구조적으로 오버플로가 불가능**하고 수렴 착시가 가장 강하다.
- `g` 슬라이더: 0.1 – 0.5, step 0.005, 기본 0.1. 모드에 따라 해당 컨트롤만 노출.

**공통 — 좌표 누적**
```js
L[0] = 0
L[i] = L[i-1] + colW[i-1] + gutterAfter(i-1)
R[i] = L[i] + colW[i]
```
- 마지막 col의 우측 끝은 캔버스 우측(`W`)에 정확히 접함. **trailing gutter 없음.**
- 좌우 마진 없음. 캔버스 = 콘텐츠 영역.
- 폭이 0에 수렴하는 col의 path가 깨지지 않도록 **최소 0.01px 가드**.

### 2.2 shaft

```js
shaftTop = (H - D) / 2
shaftBot = (H + D) / 2
```
- 캔버스 세로 중앙 기준 대칭.
- **가로로 거터를 가로질러 연속.** `x ∈ [0, W]` 전 구간.
  (레퍼런스 와이어프레임에서 thread 밴드의 거터는 비어 있고 shaft 밴드의 거터는 채워져 있음으로 확인)

### 2.3 thread

thread 밴드 높이는 자동 도출. **별도 두께 파라미터 없음.**
```js
h = (H - D) / 2      // 상단 밴드 = 하단 밴드
```

**상단 사다리꼴** (col `i`, `cw = R[i] - L[i]`), 시계방향 4점:
```
P1 = (L + b*cw, shaftTop)     // 좌하 — Δb
P2 = (R - a*cw, 0)            // 좌상 — Δa   (shaftTop - h === 0)
P3 = (R,        0)            // 우상
P4 = (R,        shaftTop)     // 우하
```
- 윗변 = `a*cw`, 아랫변 = `(1-b)*cw`
- 오른쪽 변은 col 우측 끝에 수직으로 붙음
- 거터 구간은 비어 있음 (배경 노출)

**하단 사다리꼴**: 상단을 각 **컬럼 중심점 기준 180° 회전(점대칭)**. `x' = L + R - x`, `y' = H - y`.
수직변이 col **왼쪽** 끝에 붙고 Δa·Δb 적용 방향이 상단의 반대. (단순 상하 선대칭 아님 — 2026-08-19 수정)
- Phase 3에서 비대칭 / 한쪽만 남기기 옵션 추가 예정
- → **데이터 모델은 상/하 thread를 처음부터 분리 가능하게 설계할 것**

### 2.4 제약

```js
A_MIN = 0.30, A_MAX = 0.70   // Δa 범위
B_MIN = 0,    B_MAX = 0.30   // Δb 범위
```
- a/b는 **독립 클램프.** 상호 제약(`a+b ≤ AB_MAX`) 없음 — a+b = 1(계단형 프로파일) 도달 가능.
- 슬라이더는 각자 범위를 0–100으로 정규화 표기.

---

## 3. 파라미터 / 컨트롤 (Phase 1)

UI 그룹은 **아래 3개만.** margin, bleed, rows, 단위 전환, format preset, symmetric compression, export는 넣지 않는다.

### Canvas
| 파라미터 | 타입 | 범위 | 기본값 |
|---|---|---|---|
| `W` | number 입력 + slider (px) | 250 – 2400 | 1200 |
| `H` | number 입력 + slider (px) | 250 – 2400 | 675 |

### Grid
| 파라미터 | 타입 | 범위 | 기본값 |
|---|---|---|---|
| `cols` | slider int | 1 – 24 | 12 |
| `gutterPx` | slider (px) | 10 – `min(30, W/cols)` | 15 |
| `rate` (compression) | 비율칩 + slider | 1.000 – 2.500, step 0.001 | 1.618 (φ) |
| `direction` | toggle | `L→S` / `S→L` | `L→S` |

- compression은 **directional만.** symmetric 모드 없음.

**비율 칩** (레퍼런스와 동일, 레퍼런스 이미지 하단 열과 일치):
```
1:1 (1) · 6:5 (1.2) · 5:4 (1.25) · 4:3 (1.3333) · √2 (1.4142) · 3:2 (1.5)
· φ (1.618) · √3 (1.7321) · 2:1 (2) · √5 (2.2361) · 1+√2 (2.4142)
```
칩 활성 판정: `Math.abs(rate - chip.v) < 0.004`

### Graphic
| 파라미터 | 타입 | 범위 | 기본값 |
|---|---|---|---|
| `dPct` (shaft height, H 대비 %) | slider (%) | `ceil(200/H·100)` – 90 (D 하한 200px), px 병기 | 50 |
| `Δb` | slider | 실제 0–30% (표기 0–100 정규화) | 0 |
| `Δa` | slider | 실제 30–70% (표기 0–100 정규화) | 40 (표기 25) |

### 색상 / 단위
- 도형 fill: **노란색** (레퍼런스 기준 `#FAF04B` 계열)
- 브라우저 뷰포트 배경: **검정**
- **SVG 출력 시에는 도안(도형)만.** 배경 사각형을 넣지 않는다.
- **px 전용.** mm/in 없음.

---

## 4. 렌더 / SVG 오브젝트 구조

**구조 (i) 확정** — shaft 1개 + thread 2N개, 총 `2N + 1` 오브젝트. 와이어프레임 레이어 구조 그대로.

```xml
<g id="unit">
  <rect id="shaft" x="0" y="{shaftTop}" width="{W}" height="{D}"/>
  <g id="threads-top">    <polygon .../> × N </g>
  <g id="threads-bottom"> <polygon .../> × N </g>
</g>
```

- 뷰포트 렌더와 SVG 출력이 동일 구조를 쓴다. 분기 없음.
- 좌표 소수점은 3자리로 고정 출력.

---

## 5. 직관성 UI

**그리드 가이드 토글** (col 경계선 + 중앙선 + shaft 상/하단선, 기본 on)만 제공.
파라미터 인디케이터·미니 개념도는 시도 후 **삭제됨** (이력: §11–§14).

## 6. 아키텍처

```
src/
  geometry/
    constants.js     // AB_MAX, COLS_MAX, RATE_MIN/MAX, TOL 등
    ratios.js        // 비율칩 테이블
    layout.js        // computeColumns({W, cols, gutterMode, gutterPx, g, rate, direction}) → [{L, R, w}]
    unit.js          // buildUnit({cols, H, D, a, b}) → { shaft, threadsTop[], threadsBottom[] }
  components/
    UnitCanvas.vue   // SVG 렌더 (self-contained <g id="unit">)
    ControlPanel.vue
    controls/        // Slider.vue, ChipRow.vue, NumberField.vue, Toggle.vue
  composables/
    useUnitParams.js // 상태 + 제약 강제 (a/b 독립 클램프, gutter 상한 클램프)
  App.vue
```

**원칙**
- `geometry/`는 Vue 의존성 0. 순수 함수. → Phase 2 컴포지션 엔진과 export가 그대로 재사용.
- 렌더러는 지오메트리 결과를 받아 그리기만 한다. 계산 로직을 컴포넌트에 두지 않는다.

---

## 7. 레퍼런스 빌더 분석 결과

파일: `/Users/taeil/Desktop/dev/Web/keyword-visualizer/reticula-original.html`
(RETÍCULA by Design Syndrome — 번들된 React 앱, 미니파이됨)

### 승계한 것
등비수열 정규화 알고리즘 · 비율 칩 테이블과 값 · `rate` 범위 1.0–2.5 / step 0.001 · 칩 활성 tolerance 0.004 · "라벨 + 값 우측정렬" 슬라이더 행 UI 패턴 · 섹션 헤더 패턴

### 승계하지 않은 것
margins · bleed · rows · 단위 전환(mm/in/px) · format preset · symmetric compression 모드 · 색상 가이드 옵션 · export 일체

### 알려진 결함 (우리는 고침)
레퍼런스는 `inner = max(0, W - (cols-1)*gutter)`만 하고 거터 입력에 상한이 없다.
`gutter*(cols-1) ≥ W`가 되면 `inner = 0` → 모든 col 폭이 0이 되는데, x 커서는 거터만큼씩 계속 전진하므로 **폭 0짜리 컬럼 경계선들이 캔버스 밖으로 줄줄이 넘어간다.** 경고도 클램프도 없이 조용히 깨짐.
→ 우리는 `fixed` 모드에서 슬라이더 상한을 동적 클램프하고, `proportional` 모드에서는 구조적으로 발생 불가.

---

## 8. Phase 2+ 로 미뤄둔 아이디어 (기록용)

- **tail cols**: 압축 수열 끝에 최소폭 col을 K개 **균일 복제**해 수렴 착시 극대화. (cols를 그냥 늘리는 것과는 다른 결과물)
- thread 상/하 **비대칭**, 또는 한쪽만 렌더
- 유닛 **flip-x / flip-y** — Phase 2 컴포지션에서 처리.
  → 그래서 Phase 1에 thread 기울기 방향 토글을 따로 만들지 않는다.
  단, flip-x는 압축 방향과 기울기를 **동시에** 뒤집으므로, 4가지 조합이 전부 필요해지면 그때 독립 토글을 추가한다.
- `AB_MAX`를 1.0으로 개방 (직사각형/계단형 프로파일)
- SVG / PNG export

---

## 9. 2026-08-19 토론 확정 사항 (구현 규칙)

1. **`D`는 비율로 저장** — 상태는 `dPct`(0–90, 기본 50). `D = H * dPct / 100`으로 파생. H 변경 시 자동 추종. 슬라이더는 % 단위, px 병기.
2. **gutterPx 상한 = `W / cols`** — §2.1 반영 완료.
3. **미니 개념도는 추상 단일 col** — 실제 그리드와 무관한 고정 크기 모식도. D·Δa·Δb만 실시간 반영.
4. **스캐폴딩**: `npm create vite` vue 템플릿 → §6 구조로 재편.
5. degenerate 가드: `h < 0.01`이면 thread 생략, `D < 0.01`이면 shaft 생략.
6. 그리드 가이드는 `<g id="unit">` **밖**에 렌더 (유닛은 순수 도형만).
7. a/b 상호 클램프: 조작한 쪽 우선, `a + b > AB_MAX`이면 반대쪽을 `AB_MAX - (조작값)`으로 밀어냄.
8. 비율칩 클릭 시 칩의 4자리 값 그대로 저장 (step 0.001과 불일치 허용, tolerance 0.004가 흡수).
9. 캔버스는 `viewBox="0 0 W H"` + 컨테이너 fit. 줌 컨트롤 없음.

## 10. 2026-08-19 2차 변경 사항

1. **proportional 거터 모드 삭제** — `gutterMode`/`g` 파라미터 제거, `layout.js`는 fixed 전용.
2. **W/H에 슬라이더 추가** — number 입력 아래 각각 slider (100–2400 / 100–1350).
3. **UnitSchematic 삭제 → 캔버스 인디케이터로 대체** (§5 참조).

## 11. 2026-08-19 3차 변경 사항

1. **인디케이터 위치/크기** — `D`는 캔버스 왼쪽 끝, `Δa`는 위쪽 끝에 밀착. 라벨 화면 10px (축소율 역보정). Graphic 섹션에 show/hide 토글 (기본 on).
2. **폰트 통일** — Pretendard Variable (jsDelivr CDN), UI·인디케이터 전부.
3. **thread 1px 오버랩** (`THREAD_OVERLAP = 1`) — thread 밑변을 shaft 쪽으로 1px 파묻어 경계 안티앨리어싱 유격 제거.
4. **gutterPx 상한 = `min(30, W/cols)`** (`GUTTER_MAX = 30`).
5. **극한 압축 가드** (`THREAD_MIN_W = 2`) — col 폭 < 2px이면 thread를 2px 직사각형으로 렌더 (상단은 col 우측, 하단은 col 좌측 부착, 캔버스 안쪽 클램프).

## 12. 2026-08-19 4차 변경 사항

1. **가이드에 shaft 상/하단 가로선 추가** (col 경계 + 중앙선 + shaftTop/shaftBot).
2. **인디케이터는 호버 전용** — show/hide 토글 삭제. Graphic의 D/Δb/Δa 슬라이더에 마우스를 올리면 해당 인디케이터만 표시. 라벨 화면 18px 볼드, 선 2px.
3. **기본값 변경** — gutter 15px, rate 1.618(φ).
4. **하한 추가** — D ≥ 200px (`D_MIN`, dPct 슬라이더 하한 동적), W ≥ 400 (`W_MIN`), H ≥ 250 (`H_MIN`).
5. **캔버스 contain 피팅** — stage 크기를 ResizeObserver로 측정해 `min(sw/W, sh/H)` 배율로 명시적 width/height 지정. 세로로 긴 비율도 프레임 이탈 없음.

## 13. 2026-08-19 5차 변경 사항

1. **Δ 범위 재정의** — Δa: 30–70%, Δb: 0–30% (`A_MIN/A_MAX/B_MIN/B_MAX`). `a + b ≤ AB_MAX` 상호 제약 **삭제** (`AB_MAX` 상수 제거, a+b=1 계단 프로파일 도달 가능). 슬라이더는 각자 범위를 **0–100으로 정규화 표기**.
2. **gutterPx 하한 10px** (`GUTTER_MIN`).
3. **극한 압축 기준을 캔버스 비례로** — `THREAD_MIN_W(2px)` → `THREAD_MIN_RATIO = 0.002` (W의 0.2%). 직사각형 폭도 동일 비례.
4. **인디케이터 컬러** — 빨강 → **화이트 + `mix-blend-mode: difference`** (노란 도형 위 자동 반전, 어떤 표면에서도 대비 확보).
5. **UI 스타일을 RETÍCULA 참조로 전면 교체** — 팔레트 CSS 변수화(`--bg #0B0B0B / --panel #151515 / --canvas #0E0E0E / --line #262626 / --text #ECECEC / --faint #7C7C7C / --trim #C9C9C9`), accent만 브랜드 옐로우 `#FAF04B`. 2px 트랙 + 15px 사각 썸 슬라이더, radius 0 보더 칩/seg 토글, uppercase 섹션 헤더(0.16em). 폰트는 Pretendard 유지.

## 14. 2026-08-19 6차 변경 사항

1. **thread 한쪽 제거 옵션** — Graphic에 `threads` 토글 (`both` / `top` / `bottom`, 기본 both). `buildUnit({ ..., threads })` 파라미터로 지오메트리 단계에서 생략. (Phase 3 예정 항목 조기 반영)
2. **인디케이터 기능 전체 삭제** — hover 표시, blend 오버레이, ResizeObserver 역보정 모두 제거. §5의 인디케이터 사양 폐기, 그리드 가이드 토글만 유지.
3. **rotate 90° 버튼** — Canvas 섹션. W ↔ H 스왑. 이를 위해 W/H 범위를 **공통 250–2400**으로 통일 (`SIZE_MIN`/`SIZE_MAX`, 기존 `W_MIN`/`H_MIN` 대체) — 스왑이 항상 손실 없음.

## 15. 2026-08-19 7차 변경 사항

1. **proportional 거터 모드 복원** — §2.1(b) 원래 수식 그대로 (`gutter[i] = g·colW[i]`, `k = W / (1 + g·(1 - wN[last]))`). `gutterMode` 토글 (fixed/prop), `g` 슬라이더 0–0.5 step 0.005 기본 0.06 (`G_MAX`/`G_STEP`). 모드에 따라 해당 슬라이더만 노출.

## 16. 2026-08-19 8차 변경 사항

1. **proportional `g` 하한 0.1** (`G_MIN`), 기본값도 0.1로.
2. **rotate 90° = 도안 전체 회전** — 해상도 스왑만 하던 것을 `orientation` 상태(0/90) 도입으로 변경. 지오메트리는 항상 로컬(비회전) 좌표계 `localW × localH`에서 계산하고, 렌더에서 `<g transform="rotate(90) translate(0,-localH)">`로 시계방향 회전 배치. `(x,y) → (localH−y, x)`. 가이드도 로컬 좌표로 같이 회전. D%·gutter 상한 등 파생값 기준도 로컬 치수. `<g id="unit">` 좌표는 로컬 그대로라 Phase 2 재배치 규약(translate/scale/flip) 유지.

## 17. 2026-08-20 9차 변경 사항

1. **grid guides** — 라벨에서 한글 설명 삭제, 기본값 on.
2. **compression 단일 슬라이더** — direction 토글 삭제. 슬라이더 -1.000 ~ +1.000 (정규화), `rate = 1 + |v|·(RATE_MAX-1)`, 부호 = 방향(+ = L→S). 표기는 부호 붙은 실제 rate. 비율칩은 크기만 지정하고 현재 방향 유지.
3. **D 하한 200px 삭제** (`D_MIN` 제거) — 순수 % (0–90)로 복귀. 작은 W/H에서 슬라이더가 턱에 걸리던 문제 해소.
4. **W/H number 입력** — 스피너 화살표 제거, 필드 폭 68px로 축소.
5. **섹션 이름** — CANVAS → **GRAPHIC UNIT**. (GRID 새 이름은 미정 — 사용자 입력 깨짐)
6. **SPEC 본문 동기화** — §2.4 현행 제약으로 교체, §5 인디케이터 사양 삭제, §6 주석 수정.

## 18. 2026-08-20 10차 변경 사항

1. **VIEW 섹션 삭제** — grid guides 체크박스를 GRID 섹션 맨 아래로 이동.
2. **UI 라벨 리네이밍** — CANVAS/GRAPHIC UNIT → **UNIT SIZE**, W(px) → **WIDTH (PX)**, H(px) → **HEIGHT (PX)**, GRAPHIC → **SHAPE ADJUSTMENT**, D — shaft height → **SHAFT SIZE**, Δa → **THREAD TOP WIDTH**, Δb → **THREAD BOTTOM WIDTH** (top이 먼저 오도록 순서 스왑).
3. **threads 옵션 재정의** — both/top/bottom → **both side / one side**. one side: `shaftTop = H - D`, `shaftBot = H` (shaft가 캔버스 바닥에 접함), 상단 밴드가 위쪽 전체(H - D)를 차지, 하단 thread 없음. `buildUnit`이 `shaftBot`도 반환하고 가이드가 이를 사용.
4. **shaft 슬라이더 하한 10%** (`D_PCT_MIN`), 범위 10–90%.
5. **compression 표기** — 부호 붙은 rate → **퍼센트** (-100.0% ~ +100.0%, 정규화 값 기준).
6. **슬라이더 썸 15px → 12px.**

## 19. 2026-08-20 11차 변경 사항

1. **토글 활성 스타일** — 솔리드 옐로우 → **보더 하이라이트** (inset 1px accent, 텍스트 accent). 입력필드 포커스와 톤 통일.
2. **라벨** — THREAD TOP/BOTTOM WIDTH → **THREAD WIDTH ΔA / ΔB**. `A_MIN` 0.30 → **0.10** (Δa 실제 범위 10–70%).
3. **패널 밀도 통일** — W/H 슬라이더의 중복 값 표기(헤더 행) 제거로 UNIT SIZE 밀도 정돈. 섹션 타이틀 **구분선 삭제** → 타이틀을 accent 옐로우로 (슬라이더 트랙과의 시각 혼동 해소). 섹션 간격 26px.
4. **shaft size** — 하한 2% (`D_PCT_MIN`), 값 표기 `n% × UNIT HEIGHT`.
5. **thread direction 토글** — Shape Adjustment 맨 아래, L→R / R→L. RtoL이면 각 col 안에서 thread 좌우 반전 (`x' = L+R−x`), 하단은 반전된 상단의 점대칭. 극한압축 직사각형도 부착 방향 반전.
6. **GitHub 원격 연결** — https://github.com/diceandfly/eo-graphic-builder

## 20. Phase 2 경계 확정 (2026-08-20 토론)

대시보드 구현 전에 아키텍처를 좌우하는 결정만 선확정. 세부 UX는 대시보드 완성 후 기획.

1. **슬롯 피팅 = 스케일 핏.** 마스터 유닛 지오메트리 1벌을 SVG `<use>`로 슬롯마다 참조, 슬롯 크기·비율에 맞춰 (비균등 포함) scale. 원본 에셋의 일러스트레이터 제작 방식과 동일. 리플로우는 필요 시 슬롯 단위 옵션으로 추후 추가.
2. **문서 모델 = 마스터 파라미터 1벌 + 슬롯 배치 정보** (위치·크기·flip-x/y·rotate90). 슬롯별 파라미터 오버라이드 없음. 마스터 조작 → 전 슬롯 동시 갱신.
3. **스테이지 = 메인 아트보드 1개 + 템플릿 썸네일 패널.** 멀티 아트보드는 보류.
4. **템플릿 스키마 = 직렬화 가능한 JSON.** 코드 내장 프리셋과 사용자 등록 템플릿이 동일 포맷. (1차는 프리셋만, 등록 UI는 추후)
5. **export = 유닛 단독 / 컴포지션 양쪽 지원** (Phase 3).
6. **모션(Phase 3+)**: 파라미터 모션은 마스터 1벌 재계산으로 전 슬롯 전파, 배치 모션은 transform 애니메이션. 대시보드 팬/줌과 간섭 없음.

### 대시보드(Phase 1.5) 확정 사양
- 실픽셀 대시보드, 초기 100% 줌, 패널은 좌측 + 상단 "EO GRAPHIC BUILDER" 타이틀.
- 조작: 좌클릭 = 유닛 선택(바운딩박스), 휠버튼/Space 드래그 = 팬, 스크롤 = 팬, 핀치/⌘+휠 = 커서 중심 줌, 줌% 표시 + 클릭 리셋.
- 바운딩박스: 변 핸들 = W/H 단축 변환, 코너 = 자유, Shift = 비율 고정. 값은 UI에 실시간 양방향 반영.
- 회전: 선택 시 플로팅 시계/반시계 버튼 (90° 스텝). 패널 rotate 버튼 제거.
- W/H 슬라이더 제거 → 숫자 입력 + 비율 프리셋 칩. UI 상하한 제거, 내부 가드(50–8000px)만.
- 극미세 thread: 이진 치환 → **모프 블렌드** (w가 minW~3·minW 구간에서 사다리꼴→직사각형 선형 보간).
- 뷰포트/선택 코드는 유닛 상태와 분리 (Phase 2 문서 모델 교체 대비).

## 21. 2026-08-20 SVG export 선구현 (대시보드 홀드 중)

- 패널 하단 **Export 섹션 + export svg 버튼**. `src/export/exportSvg.js` (순수 함수 + 다운로드 헬퍼).
- 출력: §4 구조 그대로 (`<g id="unit">` + shaft rect + threads polygon), 도형만·배경 없음·소수 3자리. 가이드 미포함.
- 회전 상태는 렌더와 동일한 `rotate(90) translate(0,-localH)` wrapper로 반영.
- 파일명: `eo-unit-{W}x{H}.svg`.

## 22. 대시보드 범위 확장 + Phase 2 UX 방향 (2026-08-20 토론)

### 1차 범위로 승격 (뼈대 — 나중에 넣으면 재작업)
- **멀티유닛 문서 모델**: 스테이지에 유닛 여러 개(버전 v1/v2/v3...) 배치. 각 유닛 = 독립 파라미터 세트 + 스테이지 위치. 좌측 패널은 **선택된 유닛**을 편집.
- 유닛 선택 전환, 복제(현재 유닛 → 새 버전), 드래그 이동, 바운딩박스 위 이름 라벨.

### Phase 2로 미뤄도 수정 용이 (확정 모델 위에 얹는 층)
- **우측 레일 패널**: 카드 3개 수직 배치, 라이브 썸네일. 카드 클릭 → **드로어 확장** 방식(패널이 2~3배 폭으로 슬라이드, 30개 썸네일 그리드, 다중선택, 적용/취소, Esc 닫기)으로 전체 리스트.
- **⚡ LIVE 토글**: on = 선택된 유닛이 레일 전 카드에 실시간 반영. off = 레일 동결(스냅샷처럼 동작).
- 레일 하단 버튼: ⚡LIVE · ⟳SYNC ALL(일괄 푸시) · ✕CLEAR(초기화) · ↓EXPORT ALL(Phase 3) · ◂접기.
- **DnD 적용**: 유닛 드래그 = 대시보드 내 일반 이동 → 레일 진입 시 드롭 모드(고스트 + 카드 하이라이트) → 드롭 = 해당 카드 적용 + 이동 롤백. 레일 밖 드롭 = 이동 확정. Esc = 전체 취소.
- **확대 검토 모드**: 카드 더블클릭 → 중앙 스테이지가 레이아웃 확대 뷰로 전환, Esc로 복귀.
