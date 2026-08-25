<script setup>
import { ref, reactive, watch, computed } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import StepField from '../controls/StepField.vue';
import { BRAND_COLORS, BRAND_COLOR_NAMES } from '../../geometry/constants.js';
import { ICONS } from '../../ui/icons.js';

// 대시보드 하단 중앙 — 스와치 바 + 작업 도구 바 (두 FloatingBar, gap 분리).
// 파일 작업(export/save/open/reset)은 FileBar(좌상단)로 분리 (§59).
const props = defineProps({
  mode: String, fill: String,
  scope: Object, // 스포이드 범주 토글 { size, orientation, grid, shape, color }
}); // mode: 'select' | 'eyedrop'
const emit = defineEmits(['update:mode', 'fill', 'blend']);
const isCustomFill = computed(() => !!props.fill && !BRAND_COLORS.includes(props.fill));

const TOOLS = [
  { key: 'select', tip: 'Select (V)', paths: ICONS.select },
  { key: 'eyedrop', tip: 'Eyedropper (I)', paths: ICONS.eyedrop },
];

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
const SCOPE_LABELS = { size: 'Size', grid: 'Grid', shape: 'Shape', color: 'Color', orientation: 'Orientation' };

// 블렌드 도구 — 단일 유닛 선택 후 방향·반복·간격·배율로 반복 복제 (§59)
const blendOpen = ref(false);
const blendCfg = reactive({ axis: 'v', count: 4, gap: 20, scale: 0.8 });
function toggleBlend() {
  blendOpen.value = !blendOpen.value;
}
function closeBlend() {
  blendOpen.value = false;
}
watch(blendOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeBlend, { once: true }), 0);
});
function applyBlend() {
  emit('blend', { ...blendCfg });
  closeBlend();
}

// 커스텀 컬러 hex 팝업 (옵션창 공통 UX: 5초 무조작 자동 닫힘 + 외부 클릭 닫힘)
const customOpen = ref(false);
let customIdle = null;
function resetCustomIdle() {
  clearTimeout(customIdle);
  customIdle = setTimeout(closeCustom, 5000);
}
function toggleCustom() {
  customOpen.value = !customOpen.value;
  if (customOpen.value) resetCustomIdle();
}
function closeCustom() {
  clearTimeout(customIdle);
  customOpen.value = false;
}
watch(customOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeCustom, { once: true }), 0);
});
function applyHex(e) {
  let t = e.target.value.trim();
  if (!t) return;
  if (t[0] !== '#') t = '#' + t;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) emit('fill', t);
}
</script>

<template>
  <div class="toolbarWrap">
    <!-- 스와치 바 -->
    <FloatingBar>
      <IconButton
        v-for="(c, i) in BRAND_COLORS"
        :key="c"
        :active="fill === c"
        :tip="`${BRAND_COLOR_NAMES[i]} (${i + 1})`"
        @click="emit('fill', c)"
      ><span class="chip" :style="{ background: c }" /></IconButton>
      <!-- 자유 컬러: 팔레트 아이콘 → hex 입력 팝업 -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.palette"
          :active="isCustomFill || customOpen"
          :tip="customOpen ? '' : 'Custom color'"
          @click="toggleCustom"
        />
        <div
          v-if="customOpen"
          class="menu"
          @pointerdown.stop="resetCustomIdle"
          @pointermove="resetCustomIdle"
        >
          <div class="menuTitle">Custom color</div>
          <div class="menuRow">
            <span class="preview" :style="{ background: fill }" />
            <input
              class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
              :value="fill"
              @keydown.enter="applyHex"
              @change="applyHex"
            />
          </div>
        </div>
      </div>
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
      <!-- 블렌드 도구: 반복 복제 팝업 -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.blend"
          :active="blendOpen"
          :tip="blendOpen ? '' : 'Blend (repeat & scale)'"
          @click="toggleBlend"
        />
        <div v-if="blendOpen" class="menu" @pointerdown.stop>
          <div class="menuTitle">Blend</div>
          <div class="menuRow">
            <span class="rowLabel">direction</span>
            <div class="segMini">
              <button :class="{ on: blendCfg.axis === 'h' }" @click="blendCfg.axis = 'h'">h</button>
              <button :class="{ on: blendCfg.axis === 'v' }" @click="blendCfg.axis = 'v'">v</button>
            </div>
          </div>
          <div class="menuRow">
            <span class="rowLabel">repeat</span>
            <StepField v-model="blendCfg.count" :min="1" :max="100" :step="1" />
          </div>
          <div class="menuRow">
            <span class="rowLabel">gap (px)</span>
            <StepField v-model="blendCfg.gap" :min="0" :max="2000" :step="5" />
          </div>
          <div class="menuRow">
            <span class="rowLabel">scale</span>
            <StepField v-model="blendCfg.scale" :min="0.05" :max="3" :step="0.05" />
          </div>
          <button class="applyBtn" @click="applyBlend">apply</button>
        </div>
      </div>
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
.preview {
  width: var(--swatch-chip); height: var(--swatch-chip); flex-shrink: 0;
  border: 1px solid var(--line); border-radius: var(--radius);
}
.hexInput {
  @include text-field;
  width: 76px; padding: 3px 8px; text-transform: uppercase;
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
.rowLabel { color: var(--faint); width: 62px; }
.numIn {
  @include text-field;
  width: 52px; padding: 2px 6px; text-align: right;
}
.segMini {
  display: flex; border: 1px solid var(--line); border-radius: var(--radius);
  button {
    border: none; background: none; padding: 2px 9px;
    font-size: var(--fs-xs); color: var(--faint); font-family: inherit; cursor: pointer;
    &:not(:last-child) { border-right: 1px solid var(--line); }
    &.on { @include active-outline-inset; }
  }
}
.applyBtn {
  @include bordered-control;
  font-size: var(--fs-xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  padding: 5px 10px; margin-top: 2px;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
