<script setup>
import { ref } from 'vue';
import { BRAND_COLORS } from '../../geometry/constants.js';

// 대시보드 하단 중앙 툴바 — 선택/스포이드 툴 + 내보내기/저장/열기.
// 아이콘: 24 viewBox 스트로크 패스 (바운딩박스 버튼과 동일 톤)
const props = defineProps({ mode: String, fill: String }); // mode: 'select' | 'eyedrop'
const emit = defineEmits(['update:mode', 'fill', 'export', 'save', 'open']);

const TOOLS = [
  {
    key: 'select', tip: 'Select (V)',
    paths: ['M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z', 'M13 13l9 9'],
  },
  {
    key: 'eyedrop', tip: 'Eyedropper (I)',
    paths: [
      'm2 22 1-1h3l9-9', 'M3 21v-3l9-9',
      'm15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z',
    ],
  },
];
const ACTIONS = [
  {
    key: 'export', tip: 'Export SVG',
    paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  },
  {
    key: 'save', tip: 'Save JSON',
    paths: [
      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
      'M17 21v-8H7v8', 'M7 3v5h8',
    ],
  },
  {
    key: 'open', tip: 'Open JSON',
    paths: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
  },
];

const fileEl = ref(null);
function onAction(key) {
  if (key === 'export') emit('export');
  else if (key === 'save') emit('save');
  else if (key === 'open') fileEl.value.click();
}
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('open', f);
  e.target.value = '';
}
</script>

<template>
  <div class="toolbarWrap" @pointerdown.stop>
    <div class="bar swatches">
      <button
        v-for="c in BRAND_COLORS"
        :key="c"
        class="sw"
        :class="{ on: fill === c }"
        @click="emit('fill', c)"
      ><span class="chip" :style="{ background: c }" /></button>
    </div>
    <div class="bar">
    <button
      v-for="t in TOOLS"
      :key="t.key"
      class="tbtn"
      :class="{ on: mode === t.key }"
      @click="emit('update:mode', t.key)"
    >
      <svg viewBox="0 0 24 24"><path v-for="(d, i) in t.paths" :key="i" :d="d" /></svg>
      <span class="tip">{{ t.tip }}</span>
    </button>
    <span class="sep" />
    <button v-for="a in ACTIONS" :key="a.key" class="tbtn" @click="onAction(a.key)">
      <svg viewBox="0 0 24 24"><path v-for="(d, i) in a.paths" :key="i" :d="d" /></svg>
      <span class="tip">{{ a.tip }}</span>
    </button>
    <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
    </div>
  </div>
</template>

<style scoped>
.toolbarWrap {
  position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
}
.bar {
  display: flex; align-items: center; gap: 2px;
  background: var(--panel); border: 1px solid var(--line); padding: 4px;
}
.sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
.swatches { display: flex; gap: 2px; }
.sw {
  width: 32px; height: 32px; border: none; background: none;
  display: flex; align-items: center; justify-content: center;
  padding: 0; cursor: pointer;
}
.sw .chip { width: 17px; height: 17px; display: block; }
.sw.on { background: #222; }
.tbtn {
  position: relative;
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; padding: 0;
}
.tbtn svg {
  width: 16px; height: 16px;
  fill: none; stroke: var(--text); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.tbtn:hover svg { stroke: var(--accent); }
.tbtn.on { background: #222; }
.tbtn.on svg { stroke: var(--accent); }
.tip {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  font-size: 11px; padding: 4px 8px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 0.1s;
}
.tbtn:hover .tip { opacity: 1; transition-delay: 0.35s; }
</style>
