<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import PresetBrowser from './panel/PresetBrowser.vue';
import LinkSection from './panel/LinkSection.vue';
import { ASPECT_CHIPS } from '../geometry/aspects.js';
import { isLinkScoped, typeOf } from '../objects/registry.js';
import ColorField from './controls/ColorField.vue';
import { useRecentColors } from '../composables/useRecentColors.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP,
  LIMITS, UNIT_MAX, ASPECT_TOL, COMP_SCALE, COMP_SNAP,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,          // 활성 유닛 { id, type, name, params }
  gutterMax: Number,
  selected: { type: Array, default: () => [] }, // 선택된 유닛들
  group: Object,         // { gid, name } — 선택이 하나의 최외곽 그룹 전체일 때
  linkScope: Object,     // 링크 동기화 스코프 (null = 전체 on)
  presets: { type: Array, default: () => [] }, // 유닛 프리셋 목록
});
const emit = defineEmits([
  'setSize', 'setAspect', 'setA', 'setB', 'rename', 'link', 'fill',
  'renameGroup', 'linkScopeToggle', 'placePreset', 'deletePreset', 'renamePreset', 'exportPreset',
  'exportPresets', 'importPresets', 'unlinkOne',
]);

// 멀티선택에서 값이 갈리는 파라미터는 '—'(mixed)로 표기. 조작하면 전체에 통일 적용됨.
const mixed = (...keys) =>
  props.selected.length > 1 &&
  props.selected.some((u) => keys.some((k) => u.params[k] !== props.unit.params[k]));

// 링크 멤버 1개만 선택 — "이 유닛만 해제" 버튼 표시 (§73)
const singleLinked = computed(() => props.selected.length === 1 && props.selected[0].linkId != null);
// 선택 전체가 이미 하나의 링크인지
const linked = computed(() => {
  if (props.selected.length < 2) return false;
  const lids = [...new Set(props.selected.map((u) => u.linkId))];
  return lids.length === 1 && lids[0] != null;
});

// 동적 삽입 input 포커스 (autofocus는 초기 로드에만 동작)
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

const p = computed(() => props.unit?.params);
// 프레임 오브젝트: 전용 섹션(GRID) 분기
const isFrame = computed(() => typeOf(props.unit) === 'frame');
const ON_OFF = [{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }];
// 링크 스코프 범주는 스코프형 타입(유닛)만 — rect가 섞이면 칩 숨김 (rect 링크는 전체 동기화)
const scopeChipsVisible = computed(() => props.selected.every((u) => isLinkScoped(u)));
// 멀티선택: SIZE는 통합 bbox 기준으로 표시·편집 (그룹을 하나의 대상처럼)
// EACH 토글 on이면 bbox 대신 개별 유닛 속성으로 표시·적용 (같은 값을 각자에게)
const eachMode = ref(false);
const selBox = computed(() => {
  if (props.selected.length < 2) return null;
  const minX = Math.min(...props.selected.map((u) => u.x));
  const minY = Math.min(...props.selected.map((u) => u.y));
  return {
    w: Math.max(...props.selected.map((u) => u.x + u.params.W)) - minX,
    h: Math.max(...props.selected.map((u) => u.y + u.params.H)) - minY,
  };
});
const sizeEach = computed(() => eachMode.value && props.selected.length > 1);
const useBox = computed(() => (sizeEach.value ? null : selBox.value));
const dispW = computed(() => (useBox.value ? Math.round(useBox.value.w) : p.value?.W));
const dispH = computed(() => (useBox.value ? Math.round(useBox.value.h) : p.value?.H));
const aspect = computed(() =>
  useBox.value ? useBox.value.w / useBox.value.h : p.value ? p.value.W / p.value.H : 1
);

// compression: 슬라이더 표기 -2.5x ~ +2.5x, 중앙 0(무압축) 스냅.
// rate = 1 + |v|·(RATE_MAX-1)/COMP_SCALE, 부호 = 방향(+ = L→S)
const compVal = computed(() => {
  const t = ((p.value.rate - 1) / (RATE_MAX - 1)) * COMP_SCALE;
  return p.value.direction === 'StoL' ? -t : t;
});
function setComp(v) {
  if (Math.abs(v) < COMP_SNAP) v = 0; // 중앙 스냅포인트
  p.value.rate = 1 + (Math.abs(v) / COMP_SCALE) * (RATE_MAX - 1);
  const dir = v >= 0 ? 'LtoS' : 'StoL';
  if (dir !== p.value.direction) {
    // 부호 전환 = 유닛 좌우 미러: 압축 방향과 thread 기울기를 함께 반전 (flip 버튼과 동일 의미)
    p.value.direction = dir;
    p.value.threadDir = p.value.threadDir === 'LtoR' ? 'RtoL' : 'LtoR';
  }
}
const compDisplay = computed(() => {
  const v = compVal.value;
  return v === 0 ? '0' : `${v > 0 ? '+' : ''}${v.toFixed(2)}x`;
});

// 커스텀 비율 프리셋 — localStorage 영속
const RATIO_KEY = 'eo.customRatios';
const customRatios = ref(JSON.parse(localStorage.getItem(RATIO_KEY) || '[]'));
// JSON 프로젝트 열기 등으로 저장소가 바뀌면 칩 목록 즉시 갱신
const reloadRatios = () => {
  customRatios.value = JSON.parse(localStorage.getItem(RATIO_KEY) || '[]');
};
onMounted(() => window.addEventListener('eo:ratios', reloadRatios));
onBeforeUnmount(() => window.removeEventListener('eo:ratios', reloadRatios));
const allAspects = computed(() => ASPECT_CHIPS.concat(customRatios.value));

// Δ 슬라이더 = 변의 실제 폭 (col 폭 대비 %). 둘 다 "올리면 그 변이 넓어짐".
// top width = a (10–70%), bottom width = 1-b (30–100%)
const aPct = computed(() => Math.round(p.value.a * 100));
const bottomPct = computed(() => Math.round((1 - p.value.b) * 100));

// 유닛/그룹 이름 편집 — 선택이 그룹 전체면 그룹 이름을 대상으로
const editingName = ref(false);
const nameDraft = ref('');
function startRename() {
  nameDraft.value = props.group ? props.group.name : props.unit.name;
  editingName.value = true;
}
function commitRename() {
  if (editingName.value) {
    if (props.group) emit('renameGroup', props.group.gid, nameDraft.value);
    else emit('rename', nameDraft.value);
  }
  editingName.value = false;
}
function cancelRename() {
  editingName.value = false;
}

// 직사각형 비율 그룹 — 디지털(비율) + 피지컬(출판 규격, dpi 기반 실제 px 크기)
const RECT_DIGITAL = [
  { label: '16:9', v: 16 / 9 },
  { label: '9:16', v: 9 / 16 },
  { label: '4:5', v: 4 / 5 }, // IG
];
const RECT_PHYSICAL = [
  { label: 'A3', wmm: 297, hmm: 420 },
  { label: 'A4', wmm: 210, hmm: 297 },
  { label: 'A5', wmm: 148, hmm: 210 },
  { label: 'Letter', wmm: 215.9, hmm: 279.4 },
];
const dpi = ref(Number(localStorage.getItem('eo.dpi')) || 300);
function onDpi(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 36) dpi.value = Math.min(1200, Math.round(v));
  e.target.value = dpi.value;
  localStorage.setItem('eo.dpi', String(dpi.value));
}
function applyPhysical(pp) {
  const w = Math.round((pp.wmm * dpi.value) / 25.4);
  const h = Math.round((pp.hmm * dpi.value) / 25.4);
  emit('setSize', { W: w, H: h }, sizeEach.value);
}

// ─── px/cm 표기 단위 (rect 전용, §75) — 내부 저장은 항상 px, dpi 기준 환산 표시 ───
const isCm = computed(() => isFrame.value && p.value.unitMode === 'cm');
const unitSuffix = computed(() => (isCm.value ? 'cm' : 'px'));
const round2 = (n) => Math.round(n * 100) / 100;
const toDisp = (v) => (isCm.value ? round2((v * 2.54) / dpi.value) : v);
const fromDisp = (v) => (isCm.value ? (v * dpi.value) / 2.54 : v);
function setSizeField(key, v) {
  emit('setSize', { [key]: Math.round(fromDisp(v)) }, sizeEach.value);
}
// 그리드 필드 (margin·gutter): 표시 단위 기준 클램프 → px 환산 저장
function setGridField(key, v, lo, hi) {
  p.value[key] = Math.round(fromDisp(Math.min(hi, Math.max(lo, v))));
}
// 단위 전환 — 각 단위의 그리드 기본값 적용 (px 30/30/30 ↔ cm 0.6/0.2/0.2, §76·§115)
function setUnitMode(mode) {
  if (p.value.unitMode === mode) return;
  p.value.unitMode = mode;
  if (mode === 'cm') {
    const cmToPx = (v) => Math.round((v * dpi.value) / 2.54);
    p.value.margin = cmToPx(0.6);
    p.value.gutterX = cmToPx(0.2);
    p.value.gutterY = cmToPx(0.2);
  } else {
    p.value.margin = 30;
    p.value.gutterX = 30;
    p.value.gutterY = 30;
  }
}

// stroke 색 (§110) — 공유 픽커 팝업(ColorField) + 최근 컬러, 적용 색은 recents에 편입(디바운스)
const { recentColors, commitRecentColor, removeRecentColor } = useRecentColors();
let strokeRecentTimer = null;
function setStrokeColor(c) {
  if (!c) return; // 빈 hex(기본 복귀)는 stroke 색엔 의미 없음 — 유지
  p.value.stroke = c;
  clearTimeout(strokeRecentTimer);
  strokeRecentTimer = setTimeout(() => commitRecentColor(c), 500);
}
</script>

<template>
  <div class="panel" @contextmenu.prevent>
    <header class="brand">
      <svg class="logo" viewBox="0 0 57.87 27.92" height="15" aria-hidden="true">
        <g class="logoFill">
          <path d="M27.66,12.58v-2.39h-6.65v-2.72l6.63-5.16V0H6.82c-.11,0-.22.04-.31.11L.02,5.25v2.2h6.63v2.73L0,15.34v2.39h6.65v2.72L.02,25.61v2.31h20.82c.11,0,.22-.04.31-.11l6.49-5.15v-2.2h-6.63v-2.73l6.65-5.16Z"/>
          <path d="M57.87,7.81L49.63.2h-10.55l-8.25,7.61v12.37s0,0,0,0l8.25,7.61h10.55l8.25-7.61s0,0,0,0V7.81s0,0,0,0ZM54.44,15.7h-5.21l-3.21,2.9v5.81h-3.34v-5.81l-3.21-2.9h-5.21v-3.4h5.21l3.21-2.9V3.58h3.34v5.81l3.21,2.9h5.21v3.4Z"/>
        </g>
      </svg>
      <span>GRAPHIC BUILDER</span>
    </header>

    <div v-if="unit" class="unitRow">
      <input
        v-if="editingName"
        v-focus
        class="nameInput"
        v-model="nameDraft"
        @keydown.enter="(e) => { if (!e.isComposing) commitRename(); }"
        @keydown.esc="cancelRename"
        @blur="cancelRename"
      />
      <span v-else class="unitName" title="click to rename" @click="startRename">{{ group ? group.name : unit.name }}</span>
    </div>

    <template v-if="unit">
    <section>
      <div class="secHead">
        <h2>Size</h2>
        <div class="headBtns">
          <!-- rect 전용 px/cm 표기 토글 — SIZE·RATIO·GRID 표기에 공통 적용 (§75) -->
          <div v-if="isFrame" class="unitSeg">
            <button :class="{ on: !isCm }" @click="setUnitMode('px')">px</button>
            <button :class="{ on: isCm }" @click="setUnitMode('cm')">cm</button>
          </div>
          <button
            v-if="selected.length >= 2"
            class="eachBtn" :class="{ on: eachMode }"
            title="apply to each unit instead of the combined bounding box"
            @click="eachMode = !eachMode"
          >each</button>
        </div>
      </div>
      <NumberField
        :label="isFrame ? `width (${unitSuffix})` : 'width'" :model-value="toDisp(dispW)"
        :min="toDisp(LIMITS.unitMin)" :max="toDisp(UNIT_MAX)"
        :mixed="sizeEach && mixed('W')"
        @update:model-value="(v) => setSizeField('W', v)"
      />
      <NumberField
        :label="isFrame ? `height (${unitSuffix})` : 'height'" :model-value="toDisp(dispH)"
        :min="toDisp(LIMITS.unitMin)" :max="toDisp(UNIT_MAX)"
        :mixed="sizeEach && mixed('H')"
        @update:model-value="(v) => setSizeField('H', v)"
      />
      <!-- cm 모드: 환산 기준 dpi를 치수 바로 아래 배치 (§75) -->
      <div v-if="isCm" class="dpiRow dpiUnder">
        <label class="dpiWrap">
          <span>dpi</span>
          <input
            class="dpiInput" type="number" min="36" max="1200"
            :value="dpi" @change="onDpi"
          />
        </label>
      </div>
      <div class="ratioHead">ratio</div>
      <!-- 직사각형: px 모드 = 디지털 비율 / cm 모드 = 출판 규격 + dpi (단위 토글로 태그 스왑, §75) -->
      <template v-if="isFrame">
        <div v-if="!isCm" class="ratioRow">
          <ChipRow
            :model-value="aspect" :chips="RECT_DIGITAL" :tol="ASPECT_TOL"
            @update:model-value="(v) => emit('setAspect', v, sizeEach)"
          />
        </div>
        <div v-else class="physRow">
          <button
            v-for="pp in RECT_PHYSICAL" :key="pp.label"
            class="physChip" @click="applyPhysical(pp)"
          >{{ pp.label }}</button>
        </div>
      </template>
      <div v-else class="ratioRow">
        <ChipRow
          :model-value="aspect" :chips="allAspects" :tol="ASPECT_TOL"
          @update:model-value="(v) => emit('setAspect', v, sizeEach)"
        />
        <!-- 커스텀 비율 + 버튼: 보류 (로직은 유지 — git 이력 §51) -->
      </div>
    </section>

    <!-- 직사각형 전용: 렌더 스타일 — fill(면) / stroke(외곽선) 토글 (§75) -->
    <template v-if="isFrame">
    <section>
      <h2>Style</h2>
      <!-- §110: fill/stroke 독립 on·off — stroke on일 때만 색·두께 확장 옵션 -->
      <Toggle
        label="fill" :model-value="p.fillOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.fillOn = v === 'on')"
      />
      <Toggle
        label="stroke" :model-value="p.strokeOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.strokeOn = v === 'on')"
      />
      <template v-if="p.strokeOn">
        <div class="strokeRow">
          <span class="rowLabel">stroke color</span>
          <ColorField
            :model-value="p.stroke" :recents="recentColors" side="right" :fallback="p.stroke"
            @update:model-value="setStrokeColor"
            @remove-recent="removeRecentColor"
          />
        </div>
        <Slider label="stroke width" v-model="p.strokeW" :min="1" :max="100" :step="1" editable />
      </template>
    </section>

    <!-- 직사각형 전용: 레이아웃 그리드 (내부 px 저장, 표기만 px/cm 환산) -->
    <section>
      <h2>Grid</h2>
      <Toggle
        label="grid" :model-value="p.gridOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.gridOn = v === 'on')"
      />
      <template v-if="p.gridOn">
        <!-- 조절 범위: px = margin 0-200·gutter 0-100 / cm = margin 0-5·gutter 0-2 (§76) -->
        <Slider
          :label="`margin (${unitSuffix})`" :model-value="toDisp(p.margin)"
          :min="0" :max="isCm ? 5 : 200" :step="isCm ? 0.01 : 1" editable
          @update:model-value="(v) => setGridField('margin', v, 0, isCm ? 5 : 200)"
        />
        <Slider label="rows" v-model="p.rows" :min="1" :max="12" :step="1" editable />
        <Slider label="cols" v-model="p.cols" :min="1" :max="12" :step="1" editable />
        <Slider
          :label="`gutter x (${unitSuffix})`" :model-value="toDisp(p.gutterX)"
          :min="0" :max="isCm ? 2 : 100" :step="isCm ? 0.01 : 1" editable
          @update:model-value="(v) => setGridField('gutterX', v, 0, isCm ? 2 : 100)"
        />
        <Slider
          :label="`gutter y (${unitSuffix})`" :model-value="toDisp(p.gutterY)"
          :min="0" :max="isCm ? 2 : 100" :step="isCm ? 0.01 : 1" editable
          @update:model-value="(v) => setGridField('gutterY', v, 0, isCm ? 2 : 100)"
        />
      </template>
    </section>
    </template>

    <template v-if="!isFrame">
    <section>
      <h2>Grid</h2>
      <Slider
        label="cols" v-model="p.cols"
        :min="COLS_MIN" :max="COLS_MAX" :step="1"
        :display="mixed('cols') ? '—' : String(p.cols)"
      />
      <Slider
        label="pitch compression" :model-value="compVal"
        :min="-COMP_SCALE" :max="COMP_SCALE" :step="0.01"
        :snap-to="0" :snap-radius="COMP_SNAP"
        :display="mixed('rate', 'direction') ? '—' : compDisplay"
        @update:model-value="setComp"
      />
      <ChipRow v-model="p.rate" />
      <Toggle
        label="gutter mode" v-model="p.gutterMode"
        :options="[{ value: 'fixed', label: 'fixed' }, { value: 'proportional', label: 'prop' }]"
      />
      <Slider
        v-if="p.gutterMode === 'fixed'"
        label="gutter" v-model="p.gutterPx"
        :min="GUTTER_MIN" :max="Math.floor(Math.min(GUTTER_MAX, gutterMax))" :step="1"
        :display="mixed('gutterPx') ? '—' : String(p.gutterPx)"
      />
      <Slider
        v-else
        label="gutter" v-model="p.g"
        :min="G_MIN" :max="G_MAX" :step="G_STEP"
        :display="mixed('g') ? '—' : p.g.toFixed(3)"
      />
    </section>

    <section>
      <h2>Shape</h2>
      <Slider
        label="shaft size" v-model="p.dPct"
        :min="D_PCT_MIN" :max="D_PCT_MAX" :step="1"
        :display="mixed('dPct') ? '—' : `${p.dPct}% × UNIT HEIGHT`"
      />
      <Slider
        label="thread top width" :model-value="aPct"
        :min="A_MIN * 100" :max="A_MAX * 100" :step="1"
        :display="mixed('a') ? '—' : `${aPct}%`"
        @update:model-value="(v) => emit('setA', v / 100)"
      />
      <Slider
        label="thread bottom width" :model-value="bottomPct"
        :min="Math.round((1 - B_MAX) * 100)" :max="100" :step="1"
        :display="mixed('b') ? '—' : `${bottomPct}%`"
        @update:model-value="(v) => emit('setB', 1 - v / 100)"
      />
      <Toggle
        label="thread sides" v-model="p.threads"
        :options="[
          { value: 'both', label: 'double' },
          { value: 'one', label: 'single' },
        ]"
      />
    </section>
    </template>

    <LinkSection
      v-if="selected.length >= 2 || singleLinked"
      :linked="linked"
      :link-scope="linkScope"
      :chips-visible="scopeChipsVisible"
      :single="singleLinked"
      @link="(scope) => emit('link', scope)"
      @scope-toggle="(k) => emit('linkScopeToggle', k)"
      @unlink-one="emit('unlinkOne')"
    />
    </template>

    <!-- 선택 없음: 프리셋 브라우저 -->
    <PresetBrowser
      v-else
      :presets="presets"
      @place-preset="(pr) => emit('placePreset', pr)"
      @delete-preset="(id) => emit('deletePreset', id)"
      @rename-preset="(id, name) => emit('renamePreset', id, name)"
      @export-preset="(pr) => emit('exportPreset', pr)"
      @export-presets="emit('exportPresets')"
      @import-presets="(f) => emit('importPresets', f)"
    />
  </div>
</template>

<style scoped lang="scss">
.panel { display: flex; flex-direction: column; gap: var(--sp-section); }
.brand {
  display: flex; align-items: center; gap: 9px;
  font-size: 14px; font-weight: 700; letter-spacing: 0em; color: var(--text);
  padding: 4px 2px 14px; border-bottom: 1px solid var(--line);
}
.logo { flex-shrink: 0; }
.logoFill { fill: var(--accent); }
.unitRow { display: flex; justify-content: space-between; align-items: center; margin-bottom: -10px; }
.ratioHead {
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase;
  color: var(--faint); margin-bottom: 6px;
}
.ratioRow { display: flex; align-items: flex-start; gap: 6px; }
.ratioRow :deep(.chips) { margin-bottom: 0; }
.unitName { font-size: var(--fs-sm); color: var(--text); cursor: text; }
.unitName:hover { color: var(--accent); }
.nameInput {
  @include text-field;
  border-color: var(--accent); padding: 2px 6px; flex: 1;
}
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: 600;
  margin: 0 0 14px;
}
.secHead { display: flex; justify-content: space-between; align-items: baseline; }
.physRow { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.dpiRow { margin-top: 8px; }
// 치수 바로 아래 dpi — NumberField 행과 동일한 좌라벨/우입력 정렬
.dpiUnder {
  margin: 0 0 10px;
  .dpiWrap { justify-content: space-between; margin-left: 0; }
}
.physChip {
  @include bordered-control;
  font-size: var(--fs-xs); padding: 3px 9px;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
.dpiWrap {
  display: flex; align-items: center; gap: 5px; margin-left: 4px;
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint);
}
// NumberField 입력과 동일 규격 (W/H 행과 가로 정렬, §76)
.dpiInput {
  @include text-field;
  width: 58px; padding: 3px 8px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
}
.eachBtn {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide);
  padding: 2px 7px;
  &.on { border-color: var(--accent); color: var(--accent); }
}
.headBtns { display: flex; align-items: center; gap: 6px; }
// px/cm 세그먼트 토글 — eachBtn과 동일 문법의 2분할 칩
.unitSeg {
  display: flex;
  button {
    @include bordered-control;
    font-size: var(--fs-2xs); letter-spacing: var(--ls-wide);
    padding: 2px 7px;
    &:first-child { border-radius: var(--radius) 0 0 var(--radius); border-right-width: 0; }
    &:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
    &.on { border-color: var(--accent); color: var(--accent); }
    &.on + button { border-left-color: var(--accent); }
  }
}
.strokeRow { position: relative; display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.rowLabel {
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase;
  color: var(--faint); flex: 1;
}
.colorPrev {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 1px solid var(--line); border-radius: 2px;
}
.hexInput {
  @include text-field;
  width: 68px; padding: 3px 6px; text-align: right;
}
</style>
