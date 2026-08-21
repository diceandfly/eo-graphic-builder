<script setup>
import { ref, watch } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { BRAND_COLORS } from '../../geometry/constants.js';
import { ICONS } from '../../ui/icons.js';

// 대시보드 하단 중앙 — 스와치 바 + 도구 바 (두 FloatingBar, gap 분리)
// 아이콘: 24 viewBox 스트로크 패스 (Feather/Lucide)
const props = defineProps({
  mode: String, fill: String,
  scope: Object, // 스포이드 범주 토글 { size, grid, shape, color }
}); // mode: 'select' | 'eyedrop'
const emit = defineEmits(['update:mode', 'fill', 'export', 'save', 'open', 'reset']);

const TOOLS = [
  { key: 'select', tip: 'Select (V)', paths: ICONS.select },
  { key: 'eyedrop', tip: 'Eyedropper (I)', paths: ICONS.eyedrop },
];
const ACTIONS = [
  { key: 'export', tip: 'Export SVG', paths: ICONS.exportSvg },
  { key: 'save', tip: 'Save JSON', paths: ICONS.save },
  { key: 'open', tip: 'Open JSON', paths: ICONS.open },
  { key: 'reset', tip: 'Reset dashboard', paths: ICONS.reset },
];

const fileEl = ref(null);

// 스포이드 우클릭 → 범주 스코프 메뉴 (5초 무조작 시 자동 닫힘)
const menuOpen = ref(false);
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeMenu, 5000);
}
function onToolContext(key, e) {
  if (key !== 'eyedrop') return;
  e.preventDefault();
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) resetIdle();
}
function closeMenu() {
  clearTimeout(idleTimer);
  menuOpen.value = false;
}
watch(menuOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeMenu, { once: true }), 0);
});
const SCOPE_LABELS = { size: 'Size', grid: 'Grid', shape: 'Shape Adjustment', color: 'Color' };

// 리셋 3단계 확인: 1차 경고 → 2차 최후통첩 → 3차 실행. 각 단계 타임아웃 시 해제.
const resetStage = ref(0);
let armTimer = null;
const RESET_TIPS = [
  'Reset dashboard',
  'Click again to reset',
  'FINAL WARNING — every unit will be vaporized. They had families.',
];
const RESET_TONES = ['default', 'danger', 'doom'];
function onAction(key) {
  if (key === 'export') emit('export');
  else if (key === 'save') emit('save');
  else if (key === 'open') fileEl.value.click();
  else if (key === 'reset') {
    clearTimeout(armTimer);
    if (resetStage.value >= 2) {
      resetStage.value = 0;
      emit('reset');
    } else {
      resetStage.value += 1;
      armTimer = setTimeout(() => (resetStage.value = 0), resetStage.value === 2 ? 5000 : 3000);
    }
  }
}
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('open', f);
  e.target.value = '';
}
</script>

<template>
  <div class="toolbarWrap">
    <!-- 스와치 바 -->
    <FloatingBar>
      <IconButton
        v-for="c in BRAND_COLORS"
        :key="c"
        :active="fill === c"
        @click="emit('fill', c)"
      ><span class="chip" :style="{ background: c }" /></IconButton>
    </FloatingBar>

    <!-- 도구 바 -->
    <FloatingBar>
      <div v-for="t in TOOLS" :key="t.key" class="toolWrap">
        <IconButton
          :paths="t.paths"
          :tip="menuOpen && t.key === 'eyedrop' ? '' : t.tip"
          :active="mode === t.key"
          @click="emit('update:mode', t.key)"
          @contextmenu="onToolContext(t.key, $event)"
        />
        <!-- 스포이드 스코프 메뉴: 버튼 기준 중앙 정렬, 표시 중엔 툴팁 억제 -->
        <div
          v-if="t.key === 'eyedrop' && menuOpen && scope"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Eyedropper picks</div>
          <label v-for="(label, key) in SCOPE_LABELS" :key="key" class="menuRow">
            <input type="checkbox" v-model="scope[key]" />
            <span>{{ label }}</span>
          </label>
        </div>
      </div>
      <span class="sep" />
      <IconButton
        v-for="a in ACTIONS"
        :key="a.key"
        :paths="a.paths"
        :tip="a.key === 'reset' ? RESET_TIPS[resetStage] : a.tip"
        :tone="a.key === 'reset' ? RESET_TONES[resetStage] : 'default'"
        @click="onAction(a.key)"
      />
      <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.toolbarWrap {
  position: absolute; left: 50%; bottom: var(--sp-6); transform: translateX(-50%);
  display: flex; align-items: center; gap: var(--sp-4);
}
.chip {
  width: var(--swatch-chip); height: var(--swatch-chip); display: block;
  border-radius: var(--radius);
}
.toolWrap { position: relative; }
.menu {
  position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.menuTitle {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  color: var(--faint); margin-bottom: 2px;
}
.menuRow {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--text); cursor: pointer; white-space: nowrap;
}
</style>
