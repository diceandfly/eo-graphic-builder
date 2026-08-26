<script setup>
import { ref, watch, computed } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import StepField from '../controls/StepField.vue';
import ColorPicker from '../controls/ColorPicker.vue';
import { BRAND_COLORS, BRAND_COLOR_NAMES } from '../../geometry/constants.js';
import { ICONS } from '../../ui/icons.js';

// 대시보드 하단 중앙 — 스와치 바 + 작업 도구 바 (두 FloatingBar, gap 분리).
// 파일 작업(export/save/open/reset)은 FileBar(좌상단)로 분리 (§59).
const props = defineProps({
  mode: String, fill: String,
  scope: Object,       // 스포이드 범주 토글 { size, orientation, grid, shape, color }
  blendCfg: Object,    // 블렌드 설정 reactive 스토어 { axis, count, gap, scale }
  arrangeCfg: Object,  // 그리드 배열 설정 { gap, columns(0=auto) }
  customColor: String, // 커스텀 컬러 (7번 스와치)
  recentColors: Array, // 최근 사용 커스텀 컬러 (팝업 하단 슬롯, §85)
  rectQuickCfg: Object, // 사각형 더블클릭 즉시 생성 크기 { w, h } (§85)
}); // mode: 'select' | 'eyedrop' | 'rect'
const emit = defineEmits(['update:mode', 'fill', 'blend', 'arrange', 'update:customColor', 'rectQuick']);
const isCustomFill = computed(() => !!props.fill && !BRAND_COLORS.includes(props.fill));

// 도구 순서: select → rect → eyedrop → blend → arrange (§85에서 rect를 스포이드 왼쪽으로)

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

// 블렌드/배열 도구 — 좌클릭·단축키 = 현재 설정으로 즉시 적용, 우클릭 = 옵션 메뉴
const blendOpen = ref(false);
function onBlendContext(e) {
  e.preventDefault();
  blendOpen.value = !blendOpen.value;
}
function closeBlend() {
  blendOpen.value = false;
}
watch(blendOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeBlend, { once: true }), 0);
});
const arrangeOpen = ref(false);
function onArrangeContext(e) {
  e.preventDefault();
  arrangeOpen.value = !arrangeOpen.value;
}
function closeArrange() {
  arrangeOpen.value = false;
}
watch(arrangeOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeArrange, { once: true }), 0);
});

// 커스텀 컬러 (7번 스와치) — 좌클릭/7 = 현재 커스텀 컬러 적용, 우클릭 = 픽커 팝업
const customOpen = ref(false);
function onCustomContext(e) {
  e.preventDefault();
  customOpen.value = !customOpen.value;
}
function closeCustom() {
  customOpen.value = false;
}
watch(customOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeCustom, { once: true }), 0);
});
function onPick(c) {
  emit('update:customColor', c);
  emit('fill', c); // 라이브 적용 (선택 없으면 현재 컬러만 갱신됨)
}

// 사각 툴 우클릭 → 더블클릭 즉시 생성 크기 편집 (§85)
const rectOpen = ref(false);
function onRectContext(e) {
  e.preventDefault();
  rectOpen.value = !rectOpen.value;
}
function closeRect() {
  rectOpen.value = false;
}
watch(rectOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeRect, { once: true }), 0);
});
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
      ><span class="chip" :class="{ boost: BRAND_COLOR_NAMES[i] === 'SPACE BLACK' }" :style="{ background: c }" /></IconButton>
      <!-- 커스텀 컬러 스와치: 칩 = 현재 커스텀 컬러, 좌클릭/7 = 적용, 우클릭 = 픽커 -->
      <div class="toolWrap">
        <IconButton
          :active="isCustomFill || customOpen"
          :tip="customOpen ? '' : 'Custom color (7)'"
          @click="emit('fill', customColor)"
          @contextmenu="onCustomContext"
        ><span class="chip" :style="{ background: customColor }" /></IconButton>
        <div v-if="customOpen" class="menu" @pointerdown.stop>
          <div class="menuTitle">Custom color</div>
          <ColorPicker :model-value="customColor" @update:model-value="onPick" />
          <!-- 최근 사용 컬러 슬롯 (오브젝트에 실제 적용된 비 브랜드 컬러 자동 저장, 최대 6 — §86) -->
          <div v-if="recentColors && recentColors.length" class="recentRow">
            <button
              v-for="rc in recentColors" :key="rc"
              class="recentChip" :style="{ background: rc }" :title="rc"
              @click="onPick(rc)"
            />
          </div>
        </div>
      </div>
    </FloatingBar>

    <!-- 도구 바 -->
    <FloatingBar>
      <IconButton
        :paths="ICONS.select" tip="Select (V)"
        :active="mode === 'select'"
        @click="emit('update:mode', 'select')"
      />
      <!-- 직사각형 툴 (R): 드래그 = 그 크기, 더블클릭 = 퀵 사이즈 즉시 생성, 우클릭 = 퀵 사이즈 설정 -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.rect"
          :tip="rectOpen ? '' : 'Rectangle (R)'"
          :active="mode === 'rect' || rectOpen"
          @click="emit('update:mode', 'rect')"
          @dblclick="emit('rectQuick')"
          @contextmenu="onRectContext"
        />
        <div v-if="rectOpen && rectQuickCfg" class="menu" @pointerdown.stop>
          <div class="menuTitle">Quick rectangle</div>
          <div class="menuRow">
            <span class="rowLabel">width (px)</span>
            <StepField v-model="rectQuickCfg.w" :min="50" :max="8000" :step="10" />
          </div>
          <div class="menuRow">
            <span class="rowLabel">height (px)</span>
            <StepField v-model="rectQuickCfg.h" :min="50" :max="8000" :step="10" />
          </div>
          <div class="menuNote">double-click the tool to create</div>
        </div>
      </div>
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.eyedrop"
          :tip="menuOpen ? '' : 'Eyedropper (I)'"
          :active="mode === 'eyedrop'"
          @click="emit('update:mode', 'eyedrop')"
          @contextmenu="onToolContext('eyedrop', $event)"
        />
        <!-- 스포이드 스코프 메뉴: 버튼 기준 중앙 정렬, 표시 중엔 툴팁 억제 -->
        <div
          v-if="menuOpen && scope"
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
      <!-- 블렌드 도구: 좌클릭/B = 즉시 적용, 우클릭 = 옵션 (표시 중엔 툴팁 억제) -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.blend"
          :active="blendOpen"
          :tip="blendOpen ? '' : 'Blend (B)'"
          @click="emit('blend')"
          @contextmenu="onBlendContext"
        />
        <div v-if="blendOpen && blendCfg" class="menu" @pointerdown.stop>
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
        </div>
      </div>
      <!-- 그리드 배열: 좌클릭/G = 즉시 적용, 우클릭 = 옵션 -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.arrange"
          :active="arrangeOpen"
          :tip="arrangeOpen ? '' : 'Grid arrange (G)'"
          @click="emit('arrange')"
          @contextmenu="onArrangeContext"
        />
        <div v-if="arrangeOpen && arrangeCfg" class="menu" @pointerdown.stop>
          <div class="menuTitle">Grid arrange</div>
          <div class="menuRow">
            <span class="rowLabel">gap (px)</span>
            <StepField v-model="arrangeCfg.gap" :min="0" :max="2000" :step="5" />
          </div>
          <div class="menuRow">
            <span class="rowLabel">columns</span>
            <StepField v-model="arrangeCfg.columns" :min="0" :max="50" :step="1" />
          </div>
          <div class="menuNote">columns 0 = auto (√n)</div>
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
  // 전 칩 공통 은은한 inset 스트로크 — VOID GREY 40% (다크 전용 규칙 폐기, §83)
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--void-grey) 40%, transparent);
  // SPACE BLACK 칩 광학 보정: 다크 배경에서 수축되어 보여 8% 확대 (§83)
  &.boost { transform: scale(1.08); }
}
// 최근 커스텀 컬러 슬롯 — 스와치 칩과 동일 문법의 소형 칩
.recentRow { display: flex; gap: 6px; margin-top: 2px; }
.recentChip {
  width: 16px; height: 16px; flex-shrink: 0; border: none; cursor: pointer;
  border-radius: var(--radius);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--void-grey) 40%, transparent);
  &:hover { box-shadow: inset 0 0 0 1px var(--accent); }
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
  color: var(--faint); margin-bottom: 2px; white-space: nowrap;
}
.menuRow {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--text); cursor: pointer; white-space: nowrap;
}
.rowLabel { color: var(--faint); width: 62px; }
.menuNote { font-size: var(--fs-2xs); color: var(--faint); white-space: nowrap; }
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
</style>
