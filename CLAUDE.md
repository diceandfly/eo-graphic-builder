# EO Graphic Builder — 프로젝트 규칙 (Claude 세션 공통)

파라메트릭 나사축 단면 그래픽 빌더. Vue 3 + Vite(JS) + SCSS, 인라인 SVG 렌더.

## 대화·표기
- **한국어 존댓말**로 응답.
- 색은 **브랜드 컬러명**으로 지칭 (§200 리뉴얼): Builder Neon(#F9EE3A) · Bay Green(#66B88A) · Day Blue(#6EC6D2) · Air White(#FCFBF5) · Medium Gray(#8E8E8E) · Solid Gray(#333333) · Space Black(#000000). 팔레트 단일 출처 = `src/geometry/brandColors.js`(CMYK·PANTONE 포함), 내부 CSS 변수명은 구명(--eo-neon 등) 유지. ("옆랑" 같은 오타 금지)

## 문서가 곧 기억
- **SPEC.md** = 전체 이력·확정 사양의 단일 출처. 새 세션은 SPEC.md §순서대로 훑으면 맥락 복구됨. **매 작업 라운드마다 SPEC에 §N 항목 추가 후 커밋·푸시**가 관례.
- **src/styles/README.md** = 스타일 층 경계 규칙(어느 파일을 고칠지의 답).
- 디자인/UX가 애매하면 **반드시 사용자에게 질문** (AskUserQuestion). 임의 결정 금지 영역: 색·타이포·라운딩·활성 문법·UX 플로우.

## 작업 원칙 (insights 반영)
- **명시 요청만 구현.** 레퍼런스 구현의 UI·옵션을 임의로 가져오지 말 것. 추가 범위가 필요해 보이면 구현 대신 제안으로 목록화하고 승인 대기.
- **모드 구분.** 사용자가 "스펙/논의/분석/의견"이라 하면 토론 모드 — 파일 편집·구현 제안 금지, 사용자가 "구현/진행/고"라고 할 때까지. 질문형 문장("~어때?", "~할까?")은 답변만.
- **검증 채널 일치.** "코드 리뷰" 요청이면 소스 읽기로 검증(브라우저 스크린샷·eval 대체 금지). 브라우저 검증은 시각/런타임 동작을 확인해달라 했을 때만.

## 코드 관례
- geometry/는 Vue 의존 0 순수 함수. 파생은 `geometry/derive.js` `deriveUnit()` 단일 경로 (렌더·export 공유). 도킹 기하(노드·브리지·결착면)는 `geometry/dock.js` — 스테이지·익스포트·애니패널이 동일 소스.
- 문서 모델 `composables/useDocument.js`: units[]·selectedIds·activeId·groups[](중첩)·linkId·flipX(표시 계수). 유닛별로 다른 값을 쓰는 지오메트리 조작은 `withGeomOp()`로 감싸 브로드캐스트 워처 간섭 방지.
- 스타일: 색·치수·타이포는 `src/styles/tokens/*` CSS 변수만, 패널 컨트롤 룩은 `styles/mixins.scss`, 플로팅 바는 `components/ui/IconButton·FloatingBar`, 아이콘 패스는 `src/ui/icons.js`.
- 커밋: 영어 제목 + 상세 불릿, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 사용자가 "커밋"이라 하면 SPEC 갱신 포함.

## 개발 루프
- dev 서버는 preview_start(name: "dev")로만. 검증은 브라우저 팬에서 JS 시뮬레이션 + 스크린샷, 지오메트리는 node로 수치 검증.
- 브라우저 팬 localStorage는 팬 재시작 시 초기화될 수 있음(실브라우저는 유지) — 테스트 결과 해석 시 주의.
- 오버레이류 구조 변경 시 정규식 일괄 치환 금지(블록 명시 치환) — 과거 회귀 사례 있음.

## 진행 상태 포인터
- Phase 1 + 대시보드 완료. 애니메이션 시스템(키프레임 페어·체인·시뮬레이터·export, §220~), 연속 그리드 필드 공리계(§255~·§261), 멀티 링크(범주별, §264~·§277 페어 복제), **도킹**(샤프트 노드 결착·브리지·페어 복제, §278~§293) 완료. 리팩토링 8(폰트 셀프호스팅)은 폰트 확정 대기.
- 보류 합의: blend 컴포넌트화(멤버 = 실유닛, 컴포넌트 = 파라메트릭 프레임 — §9 답신 참조, 유닛 로직 완성 후), 칩 호버 하이라이트는 §284 구현됨.
- 다음 큰 단계: Phase 2 템플릿(프리셋 유닛 배치 JSON 등록/불러오기, SPEC §20·§22·§29-7 참고) 또는 blend 컴포넌트화.
