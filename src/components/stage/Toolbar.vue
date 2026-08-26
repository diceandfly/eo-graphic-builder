<script setup>
import { ref, watch, computed } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import StepField from '../controls/StepField.vue';
import ColorPicker from '../controls/ColorPicker.vue';
import { BRAND_COLORS, BRAND_COLOR_NAMES } from '../../geometry/constants.js';
import { ICONS } from '../../ui/icons.js';
import { useRecentColors } from '../../composables/useRecentColors.js';
import { blurActive } from '../../utils/dom.js';
import { registerPopup, unregisterPopup, POPUP_IDLE_MS } from '../../utils/popupBus.js';

// 대시보드 하단 중앙 — 스와치 바 + 작업 도구 바 (두 FloatingBar, gap 분리).
// 파일 작업(export/save/open/reset)은 FileBar(좌상단)로 분리 (§59).
const props = defineProps({
  mode: String, fill: String,
  scope: Object,       // 스포이드 범주 토글 { size, orientation, grid, shape, color }
  blendCfg: Object,    // 블렌드 설정 reactive 스토어 { axis, count, gap, scale }
  arrangeCfg: Object,  // 그리드 배열 설정 { gap, columns(0=auto) }
  customColor: String, // 커스텀 컬러 (7번 스와치)
  frameQuickCfg: Object, // 프레임 더블클릭 즉시 생성 크기 { w, h } (§85·§92)
  frameMode: Boolean, // 프레임 조작 모드 (선택툴 우클릭 스왑, §92)
}); // mode: 'select' | 'eyedrop' | 'frame'
const emit = defineEmits(['update:mode', 'fill', 'blend', 'arrange', 'update:customColor', 'frameQuick', 'toggleFrameMode']);
const isCustomFill = computed(() => !!props.fill && !BRAND_COLORS.includes(props.fill));
// 최근 컬러 — 공유 스토어 직결 (§110·§111)
const { recentColors, removeRecentColor } = useRecentColors();

// 도구 순서: select → frame → eyedrop → blend → arrange (§85에서 스포이드 왼쪽 배치, §92에서 rect→frame)

// ── 팝업 공통 관리 (§97): 단일 상태 + 5초 무조작 자동 닫힘 + 전역 배타 ──
// 'scope' | 'blend' | 'arrange' | 'custom' | 'frame'
const openPopup = ref(null);
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closePopup, POPUP_IDLE_MS);
}
function togglePopup(key, e) {
  e?.preventDefault();
  openPopup.value = openPopup.value === key ? null : key;
}
function closePopup() {
  blurActive(); // 닫히기 전에 pending 입력 커밋 (§93)
  clearTimeout(idleTimer);
  openPopup.value = null;
}
watch(openPopup, (open) => {
  clearTimeout(idleTimer);
  if (open) {
    registerPopup(closePopup); // 다른 열린 팝업 자동 닫기 (§97)
    resetIdle();
    setTimeout(() => window.addEventListener('pointerdown', closePopup, { once: true }), 0);
  } else unregisterPopup(closePopup);
});
const SCOPE_LABELS = { size: 'Size', grid: 'Grid', shape: 'Shape', color: 'Color', orientation: 'Orientation' };

function onPick(c) {
  emit('update:customColor', c);
  emit('fill', c); // 라이브 적용 (선택 없으면 현재 컬러만 갱신됨)
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
      ><span class="chip" :class="{ boost: BRAND_COLOR_NAMES[i] === 'SPACE BLACK' }" :style="{ background: c }" /></IconButton>
      <!-- 커스텀 컬러 스와치: 칩 = 현재 커스텀 컬러, 좌클릭/7 = 적용, 우클릭 = 픽커 -->
      <div class="toolWrap">
        <IconButton
          :active="isCustomFill || openPopup === 'custom'"
          :tip="openPopup === 'custom' ? '' : 'Custom color (7)'"
          @click="emit('fill', customColor)"
          @contextmenu="togglePopup('custom', $event)"
        ><span class="chip" :style="{ background: customColor }" /></IconButton>
        <div v-if="openPopup === 'custom'" class="menu" @pointerdown.stop="resetIdle" @pointermove="resetIdle" @change="resetIdle">
          <div class="menuTitle">Custom color</div>
          <ColorPicker :model-value="customColor" @update:model-value="onPick" />
          <!-- 최근 사용 컬러 슬롯 (오브젝트에 실제 적용된 비 브랜드 컬러 자동 저장, 최대 6 — §86·§111) -->
          <template v-if="recentColors.length">
            <div class="recentRow">
              <button
                v-for="rc in recentColors" :key="rc"
                class="recentChip" :style="{ background: rc }" :title="rc"
                @click="onPick(rc)"
                @contextmenu.prevent="removeRecentColor(rc)"
              />
            </div>
            <div class="menuNote">right-click to remove</div>
          </template>
        </div>
      </div>
    </FloatingBar>

    <!-- 도구 바 -->
    <FloatingBar>
      <!-- 선택툴: 우클릭 = 프레임 조작 모드 스왑 (꽉 찬 커서, §92) -->
      <IconButton
        :paths="frameMode ? null : ICONS.select"
        :tip="frameMode ? 'Frame select (A)' : 'Select (V)'"
        :active="mode === 'select'"
        @click="emit('update:mode', 'select')"
        @contextmenu.prevent="emit('toggleFrameMode')"
      >
        <svg v-if="frameMode" class="fillArrow" viewBox="0 0 24 24">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          <path class="tail" d="M13 13l9 9" />
        </svg>
      </IconButton>
      <!-- 프레임 툴 (F, §92): 드래그 = 그 크기, 더블클릭 = 퀵 사이즈 즉시 생성, 우클릭 = 퀵 사이즈 설정 -->
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.frame"
          :tip="openPopup === 'frame' ? '' : 'Frame (F)'"
          :active="mode === 'frame' || openPopup === 'frame'"
          @click="emit('update:mode', 'frame')"
          @dblclick="emit('frameQuick')"
          @contextmenu="togglePopup('frame', $event)"
        />
        <div v-if="openPopup === 'frame' && frameQuickCfg" class="menu" @pointerdown.stop="resetIdle" @pointermove="resetIdle" @change="resetIdle">
          <div class="menuTitle">Quick frame</div>
          <div class="menuRow">
            <span class="rowLabel">width</span>
            <StepField v-model="frameQuickCfg.w" :min="50" :max="8000" :step="10" />
          </div>
          <div class="menuRow">
            <span class="rowLabel">height</span>
            <StepField v-model="frameQuickCfg.h" :min="50" :max="8000" :step="10" />
          </div>
          <div class="menuNote">double-click the tool to create</div>
        </div>
      </div>
      <div class="toolWrap">
        <IconButton
          :paths="ICONS.eyedrop"
          :tip="openPopup === 'scope' ? '' : 'Eyedropper (I)'"
          :active="mode === 'eyedrop'"
          @click="emit('update:mode', 'eyedrop')"
          @contextmenu="togglePopup('scope', $event)"
        />
        <!-- 스포이드 스코프 메뉴: 버튼 기준 중앙 정렬, 표시 중엔 툴팁 억제 -->
        <div
          v-if="openPopup === 'scope' && scope"
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
          :active="openPopup === 'blend'"
          :tip="openPopup === 'blend' ? '' : 'Blend (B)'"
          @click="emit('blend')"
          @contextmenu="togglePopup('blend', $event)"
        />
        <div v-if="openPopup === 'blend' && blendCfg" class="menu" @pointerdown.stop="resetIdle" @pointermove="resetIdle" @change="resetIdle">
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
            <span class="rowLabel">gap</span>
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
          :active="openPopup === 'arrange'"
          :tip="openPopup === 'arrange' ? '' : 'Grid arrange (G)'"
          @click="emit('arrange')"
          @contextmenu="togglePopup('arrange', $event)"
        />
        <div v-if="openPopup === 'arrange' && arrangeCfg" class="menu" @pointerdown.stop="resetIdle" @pointermove="resetIdle" @change="resetIdle">
          <div class="menuTitle">Grid arrange</div>
          <div class="menuRow">
            <span class="rowLabel">gap</span>
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
// 하단 바 3종 배치 (§97): [정렬 = 패널 옆] [스와치+도구 = 캔버스 가용영역 중앙] [코너 바 = 우하단]
.toolbarWrap {
  position: absolute; bottom: var(--sp-6);
  left: calc(50% + (var(--panel-w) + 2 * var(--sp-6)) / 2);
  transform: translateX(-50%);
  display: flex; align-items: center; gap: var(--sp-6); // 바-바 간격 = 패널↔바 간격과 동일 (--sp-6)
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
// 채움 화살표 — 스트로크를 함께 유지해 일반(스트로크) 아이콘과 광학 크기 일치 (§95)
.fillArrow {
  width: var(--icon-size); height: var(--icon-size);
  path { fill: var(--accent); stroke: var(--accent); stroke-width: 2; stroke-linejoin: miter; }
  .tail { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: square; }
}
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
