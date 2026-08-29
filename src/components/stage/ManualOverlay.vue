<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { marked } from 'marked';
import { ICONS } from '../../ui/icons.js';
import manualMd from '../../../docs/MANUAL.md?raw';

// 도움말 오버레이 (§157) — docs/MANUAL.md를 빌드에 번들(?raw)해 렌더.
// MD 수정 → 로컬은 HMR 즉시, 배포본은 푸시 시 자동 배포로 반영. 콘텐츠 원본은 MD 파일 하나뿐.
const emit = defineEmits(['close']);

// GitHub 슬러거와 동일 규칙 — MANUAL.md 목차 앵커(#1-화면-구성 등)와 일치해야 함
function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}
// §166: {icon:이름} 토큰 → UI 아이콘 사전(icons.js)의 인라인 SVG — 문서와 실제 UI가 같은 아이콘 공유.
// 13px + 베이스라인 보정(-2px)이라 라인박스(폰트 12px·행간 1.7)보다 작아 행간에 영향 없음.
// §172: 세로로 긴 글리프(마우스)는 뷰박스를 크롭하고 폭을 비율대로 좁혀 옆 텍스트와의 여백 제거
const ICON_CROP = { mouseL: [5, 1, 14, 22], mouseR: [5, 1, 14, 22] };
const iconSvg = (name) => {
  const paths = ICONS[name];
  if (!paths) return `{icon:${name}}`; // 오타 시 토큰 노출로 바로 발견
  const crop = ICON_CROP[name];
  const vb = crop ? crop.join(' ') : '0 0 24 24';
  const w = crop ? ` style="width:${Math.round((13 * crop[2]) / crop[3])}px"` : '';
  return `<svg class="mdIco" viewBox="${vb}"${w}>${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
};
const html = computed(() => {
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => t.raw ?? '').join('');
    return `<h${depth} id="${slug(text)}">${marked.parseInline(text)}</h${depth}>`;
  };
  return marked
    .parse(manualMd, { renderer, gfm: true })
    .replace(/\{icon:([a-zA-Z]+)\}/g, (_, n) => iconSvg(n));
});

// 목차 앵커 클릭: 기본 해시 내비게이션 대신 오버레이 내부 스크롤
function onClick(e) {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  const el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function onKey(e) {
  if (e.key === 'Escape') emit('close');
}
const docEl = ref(null);
onMounted(async () => {
  window.addEventListener('keydown', onKey);
  // §162·§164: 2열 표(단축키·조작 안내류)는 전부 첫 컬럼 160px 고정으로 통일 — 설명 컬럼이 나머지를 차지
  // §167: 3열 표는 표별 컬럼 배분 (첫 헤더로 식별) — 이름/도구/버튼 열은 줄바꿈 없이 내용 폭 확보
  await nextTick();
  const TABLE_CLASS = { '위치': 't-layout', '도구': 't-tools', '버튼': 't-view' };
  for (const t of docEl.value?.querySelectorAll('table') ?? []) {
    const ths = t.querySelectorAll('thead th, tr:first-child th');
    if (ths.length === 2) t.classList.add('kbdTable');
    else if (TABLE_CLASS[ths[0]?.textContent.trim()]) t.classList.add(TABLE_CLASS[ths[0].textContent.trim()]);
  }
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
// §158: 전면 입력 락 — 오버레이 위의 포인터/휠이 스테이지 핸들러(팬·줌·선택)로 버블되지 않게.
// 딤 자체 클릭만 닫기로 처리 (키보드 락은 DashboardStage onKeyDown의 showManual 가드가 담당)
function onDimDown(e) {
  if (e.target === e.currentTarget) emit('close');
}
</script>

<template>
  <div
    class="manualDim"
    @pointerdown.stop="onDimDown"
    @pointerup.stop @pointermove.stop @click.stop @dblclick.stop
    @wheel.stop @contextmenu.stop.prevent
  >
    <div class="manualPanel">
      <button class="closeBtn" title="close (Esc)" @click="emit('close')">
        <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" /></svg>
      </button>
      <div ref="docEl" class="doc" @click="onClick" v-html="html" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.manualDim {
  position: absolute; inset: 0; z-index: 40;
  background: rgb(0 0 0 / 55%);
}
/* §164·§165: 앱 그리드 앵커 — 파일 바 "우측"에 --sp-6 간격, 상단 라인은 파일 바와 동일 (144px = 파일 바 폭) */
.manualPanel {
  position: absolute;
  left: calc(var(--panel-w) + 3 * var(--sp-6) + 144px);
  top: var(--sp-6);
  width: min(660px, calc(100% - var(--panel-w) - 4 * var(--sp-6) - 144px)); /* §163: 760→660 — 행당 글자 수 축소 */
  height: calc(100% - 2 * var(--sp-6));
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  display: flex; flex-direction: column; overflow: hidden;
}
.closeBtn {
  position: absolute; top: 10px; right: 10px; z-index: 1;
  width: 26px; height: 26px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--panel); cursor: pointer;
  svg { width: 12px; height: 12px; fill: none; stroke: var(--faint); stroke-width: 2; stroke-linecap: square; }
  &:hover svg { stroke: var(--accent); }
}
.doc {
  user-select: text; -webkit-user-select: text; /* §160: 도움말 본문은 텍스트 드래그 허용 (전역 락 예외) */
  overflow-y: auto; padding: 26px 32px 40px;
  color: var(--text); font-size: var(--fs-sm); line-height: 1.7; letter-spacing: var(--ls-base);
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;

  :deep(h1) { font-size: 16px; font-weight: var(--fw-bold); margin: 0 0 14px; color: var(--text); }
  :deep(h2) {
    font-size: var(--fs-sm); font-weight: var(--fw-semibold); text-transform: uppercase;
    letter-spacing: var(--ls-caps); color: var(--accent);
    margin: 30px 0 10px; scroll-margin-top: 12px;
  }
  :deep(h3) { font-size: var(--fs-sm); font-weight: var(--fw-semibold); margin: 18px 0 8px; scroll-margin-top: 12px; }
  :deep(p) { margin: 0 0 10px; color: var(--text); }
  :deep(ul), :deep(ol) { margin: 0 0 10px; padding-left: 20px; }
  :deep(li) { margin: 3px 0; }
  :deep(a) { color: var(--accent); text-decoration: none; &:hover { text-decoration: underline; } }
  :deep(strong) { font-weight: var(--fw-semibold); color: var(--text); }
  :deep(code) {
    font-family: inherit; font-size: var(--fs-xs);
    background: var(--hover-bg); border: 1px solid var(--line); border-radius: 3px; padding: 1px 5px;
  }
  :deep(hr) { border: none; border-top: 1px solid var(--line); margin: 22px 0; }
  :deep(table) {
    width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: var(--fs-xs);
  }
  :deep(th), :deep(td) { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
  :deep(th) { color: var(--faint); text-transform: uppercase; letter-spacing: var(--ls-base); font-weight: var(--fw-semibold); }
  /* §166: 인라인 아이콘 — 라인박스보다 작게(13px), 행간 불변 */
  :deep(.mdIco) {
    width: 13px; height: 13px; display: inline-block; vertical-align: -2px;
    margin-right: 3px; flex-shrink: 0;
    fill: none; stroke: currentColor; stroke-width: 2;
    stroke-linecap: square; stroke-linejoin: miter;
  }
  /* §162: 단축키 표 — 키 컬럼 160px 고정, 설명 컬럼이 나머지 전부 */
  :deep(table.kbdTable) { table-layout: fixed; }
  :deep(table.kbdTable th:first-child), :deep(table.kbdTable td:first-child) { width: 160px; }
  /* §167: 3열 표 컬럼 배분 — 1열은 줄바꿈 금지 폭 확보, 지정 열만 넓히고 나머지가 흡수 */
  :deep(table.t-layout), :deep(table.t-tools), :deep(table.t-view) { table-layout: fixed; }
  :deep(table.t-layout td:first-child), :deep(table.t-tools td:first-child), :deep(table.t-view td:first-child) { white-space: nowrap; }
  /* 화면 구성: 위치 84(+2글자·무줄바꿈) · 이름 132(무줄바꿈) · 역할 = 나머지 */
  :deep(table.t-layout th:nth-child(1)) { width: 84px; }
  :deep(table.t-layout th:nth-child(2)) { width: 132px; }
  :deep(table.t-layout td:nth-child(2)) { white-space: nowrap; }
  /* 도구 바: 도구 128(무줄바꿈) · 우클릭 260(+2글자) · 좌클릭 = 나머지 */
  :deep(table.t-tools th:nth-child(1)) { width: 128px; }
  :deep(table.t-tools th:nth-child(3)) { width: 260px; }
  /* 보기 옵션: 버튼 158(무줄바꿈) · 좌클릭 268(+4글자) · 우클릭 = 나머지 */
  :deep(table.t-view th:nth-child(1)) { width: 158px; }
  :deep(table.t-view th:nth-child(2)) { width: 268px; }
}
</style>
