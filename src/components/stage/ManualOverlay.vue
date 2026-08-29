<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { marked } from 'marked';
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
const html = computed(() => {
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => t.raw ?? '').join('');
    return `<h${depth} id="${slug(text)}">${marked.parseInline(text)}</h${depth}>`;
  };
  return marked.parse(manualMd, { renderer, gfm: true });
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
onMounted(() => window.addEventListener('keydown', onKey));
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
      <div class="doc" @click="onClick" v-html="html" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.manualDim {
  position: absolute; inset: 0; z-index: 40;
  background: rgb(0 0 0 / 55%);
  display: flex; align-items: center; justify-content: center;
}
.manualPanel {
  position: relative;
  width: min(760px, calc(100% - 2 * var(--sp-6)));
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
}
</style>
