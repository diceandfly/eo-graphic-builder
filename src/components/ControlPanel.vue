<script setup>
import { computed } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import UnitGraphic from './stage/UnitGraphic.vue';
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue';
import { ASPECT_CHIPS } from '../geometry/aspects.js';
import { BRAND_COLORS } from '../geometry/constants.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP,
  UNIT_MIN, UNIT_MAX, ASPECT_TOL, COMP_SCALE, COMP_SNAP,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,          // 활성 유닛 { id, name, params }
  gutterMax: Number,
  selected: { type: Array, default: () => [] }, // 선택된 유닛들
  group: Object,         // { gid, name } — 선택이 하나의 최외곽 그룹 전체일 때
  linkScope: Object,     // 링크 동기화 스코프 (null = 전체 on)
  presets: { type: Array, default: () => [] }, // 유닛 프리셋 목록
});
const emit = defineEmits([
  'setSize', 'setAspect', 'setA', 'setB', 'rename', 'link', 'fill',
  'renameGroup', 'linkScopeToggle', 'placePreset', 'deletePreset', 'renamePreset', 'exportPreset',
]);

// 멀티선택에서 값이 갈리는 파라미터는 '—'(mixed)로 표기. 조작하면 전체에 통일 적용됨.
const mixed = (...keys) =>
  props.selected.length > 1 &&
  props.selected.some((u) => keys.some((k) => u.params[k] !== props.unit.params[k]));

// 선택 전체가 이미 하나의 링크인지
const colorOpen = ref(false);

const linked = computed(() => {
  if (props.selected.length < 2) return false;
  const lids = [...new Set(props.selected.map((u) => u.linkId))];
  return lids.length === 1 && lids[0] != null;
});

// 동적 삽입 input 포커스 (autofocus는 초기 로드에만 동작)
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

const p = computed(() => props.unit?.params);
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
const ratioInputOpen = ref(false);
const ratioInput = ref('');
const allAspects = computed(() => ASPECT_CHIPS.concat(customRatios.value));
// eslint-disable-next-line no-unused-vars -- 커스텀 비율 + 버튼 숨김 상태, 복원 대비 유지
function addRatio() {
  const t = ratioInput.value.trim();
  let v = null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (m) v = Number(m[1]) / Number(m[2]);
  else if (/^\d+(?:\.\d+)?$/.test(t)) v = Number(t);
  if (v && v > 0.05 && v < 20) {
    customRatios.value.push({ label: t, v });
    localStorage.setItem(RATIO_KEY, JSON.stringify(customRatios.value));
    emit('setAspect', v);
  }
  ratioInput.value = '';
  ratioInputOpen.value = false;
}

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

// 링크 동기화 스코프 칩 (스포이드 범주와 동일 5종).
// 링크 전에는 드래프트를 편집하고, "link parameters" 시 그 값으로 링크 생성.
const LINK_CATS = { size: 'size', grid: 'grid', shape: 'shape', color: 'color', orientation: 'orientation' };
const draftScope = reactive({ size: true, orientation: true, grid: true, shape: true, color: true });
const scopeOn = (k) =>
  linked.value ? (props.linkScope ? props.linkScope[k] !== false : true) : draftScope[k];
function onScopeChip(k) {
  if (linked.value) emit('linkScopeToggle', k);
  else draftScope[k] = !draftScope[k];
}

// 프리셋 브라우저 뷰 모드 (썸네일 2컬럼 / 리스트) — localStorage 영속
const presetView = ref(localStorage.getItem('eo.presetView') || 'thumbs');
watch(presetView, (v) => localStorage.setItem('eo.presetView', v));

// 프리셋 이름 인라인 편집 (Default는 고정)
const editingPreset = ref(null); // { id, draft }
function startPresetRename(p) {
  if (p.id === 'default') return;
  editingPreset.value = { id: p.id, draft: p.name };
}
function commitPresetName(e) {
  if (e && e.isComposing) return;
  if (editingPreset.value) emit('renamePreset', editingPreset.value.id, editingPreset.value.draft);
  editingPreset.value = null;
}

// 프리셋 우클릭 메뉴 — 추출(Export SVG)·이름변경·삭제 (Default는 추출만)
const presetMenu = ref(null); // { x, y, p } — 뷰포트(fixed) 좌표
function openPresetMenu(p, e) {
  presetMenu.value = { x: e.clientX, y: e.clientY, p };
}
function closePresetMenu() {
  presetMenu.value = null;
}
watch(presetMenu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closePresetMenu, { once: true }), 0);
});

// 자유 컬러 hex 입력 (#RGB / #RRGGBB)
function applyHex(e) {
  let t = e.target.value.trim();
  if (!t) return;
  if (t[0] !== '#') t = '#' + t;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) emit('fill', t);
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
        <button
          v-if="selected.length >= 2"
          class="eachBtn" :class="{ on: eachMode }"
          title="apply to each unit instead of the combined bounding box"
          @click="eachMode = !eachMode"
        >each</button>
      </div>
      <NumberField
        label="width (px)" :model-value="dispW" :min="UNIT_MIN" :max="UNIT_MAX"
        :mixed="sizeEach && mixed('W')"
        @update:model-value="(v) => emit('setSize', { W: v }, sizeEach)"
      />
      <NumberField
        label="height (px)" :model-value="dispH" :min="UNIT_MIN" :max="UNIT_MAX"
        :mixed="sizeEach && mixed('H')"
        @update:model-value="(v) => emit('setSize', { H: v }, sizeEach)"
      />
      <div class="ratioHead">ratio</div>
      <div class="ratioRow">
        <ChipRow
          :model-value="aspect" :chips="allAspects" :tol="ASPECT_TOL"
          @update:model-value="(v) => emit('setAspect', v, sizeEach)"
        />
        <!-- 커스텀 비율 + 버튼: 보류 (로직은 유지) -->
      </div>
    </section>

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
        label="gutter (px)" v-model="p.gutterPx"
        :min="GUTTER_MIN" :max="Math.floor(Math.min(GUTTER_MAX, gutterMax))" :step="1"
        :display="mixed('gutterPx') ? '—' : `${p.gutterPx}px`"
      />
      <Slider
        v-else
        label="gutter (ratio)" v-model="p.g"
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

    <section>
      <h2>Color</h2>
      <div class="colorRow">
        <button
          class="bigChip"
          :style="{ background: mixed('fill') ? 'transparent' : p.fill }"
          @click="colorOpen = !colorOpen"
        >{{ mixed('fill') ? '—' : '' }}</button>
        <span class="hex">{{ mixed('fill') ? 'mixed' : p.fill }}</span>
      </div>
      <div v-if="colorOpen" class="palette">
        <button
          v-for="c in BRAND_COLORS"
          :key="c"
          class="colorChip"
          :class="{ on: !mixed('fill') && p.fill === c }"
          :style="{ background: c }"
          @click="emit('fill', c); colorOpen = false"
        />
      </div>
      <!-- 자유 컬러: hex 직접 입력 -->
      <div v-if="colorOpen" class="hexRow">
        <span class="hexLabel">custom</span>
        <input
          class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
          :value="mixed('fill') ? '' : p.fill"
          @keydown.enter="applyHex"
          @change="applyHex"
        />
      </div>
    </section>

    <section v-if="selected.length >= 2">
      <h2>Link</h2>
      <button class="ghost" :class="{ linked }" @click="emit('link', { ...draftScope })">
        {{ linked ? 'unlink parameters' : 'link parameters' }}
      </button>
      <!-- 링크 동기화 범주: 링크 전엔 드래프트, 링크 후엔 해당 링크의 스코프 편집 -->
      <div class="scopeChips">
        <button
          v-for="(label, key) in LINK_CATS" :key="key"
          class="scopeChip" :class="{ on: scopeOn(key) }"
          @click="onScopeChip(key)"
        >{{ label }}</button>
      </div>
    </section>
    </template>

    <!-- 선택 없음: 새 유닛 + 프리셋 브라우저 -->
    <template v-else>
    <section>
      <div class="secHead">
        <h2>Unit Presets</h2>
        <Toggle
          class="viewToggle" v-model="presetView"
          :options="[{ value: 'thumbs', label: 'thumbs' }, { value: 'list', label: 'list' }]"
        />
      </div>
      <div v-if="!presets.length" class="pEmpty">right-click a unit to register a preset</div>
      <div v-else-if="presetView === 'thumbs'" class="pGrid">
        <div
          v-for="p in presets" :key="p.id" class="pCard"
          @click="emit('placePreset', p)"
          @contextmenu.prevent.stop="openPresetMenu(p, $event)"
        >
          <svg class="pThumb" :viewBox="`0 0 ${p.params.W} ${p.params.H}`">
            <UnitGraphic :params="p.params" />
          </svg>
          <input
            v-if="editingPreset?.id === p.id"
            v-focus class="pNameInput" v-model="editingPreset.draft"
            @click.stop @pointerdown.stop
            @keydown.enter="commitPresetName"
            @keydown.esc="editingPreset = null"
            @blur="editingPreset = null"
          />
          <div
            v-else class="pName"
            :title="p.id === 'default' ? '' : 'click to rename'"
            @click.stop="startPresetRename(p)"
          >{{ p.name }}</div>
          <button
            v-if="p.id !== 'default'"
            class="pDel" title="delete preset"
            @click.stop="emit('deletePreset', p.id)"
          >×</button>
        </div>
      </div>
      <div v-else class="pList">
        <div
          v-for="p in presets" :key="p.id" class="pRow"
          @click="emit('placePreset', p)"
          @contextmenu.prevent.stop="openPresetMenu(p, $event)"
        >
          <svg class="pMini" :viewBox="`0 0 ${p.params.W} ${p.params.H}`">
            <UnitGraphic :params="p.params" />
          </svg>
          <input
            v-if="editingPreset?.id === p.id"
            v-focus class="pNameInput" v-model="editingPreset.draft"
            @click.stop @pointerdown.stop
            @keydown.enter="commitPresetName"
            @keydown.esc="editingPreset = null"
            @blur="editingPreset = null"
          />
          <span
            v-else class="pName"
            :title="p.id === 'default' ? '' : 'click to rename'"
            @click.stop="startPresetRename(p)"
          >{{ p.name }}</span>
          <button
            v-if="p.id !== 'default'"
            class="pDel" title="delete preset"
            @click.stop="emit('deletePreset', p.id)"
          >×</button>
        </div>
      </div>
    </section>
    </template>

    <!-- 프리셋 우클릭 메뉴 -->
    <div
      v-if="presetMenu"
      class="pMenu"
      :style="{ left: presetMenu.x + 'px', top: presetMenu.y + 'px' }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <button class="pMenuItem" @click="emit('exportPreset', presetMenu.p); closePresetMenu()">Export SVG</button>
      <button
        v-if="presetMenu.p.id !== 'default'"
        class="pMenuItem" @click="startPresetRename(presetMenu.p); closePresetMenu()"
      >Rename</button>
      <button
        v-if="presetMenu.p.id !== 'default'"
        class="pMenuItem" @click="emit('deletePreset', presetMenu.p.id); closePresetMenu()"
      >Delete</button>
    </div>
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
.chipPlus {
  @include bordered-control;
  font-size: var(--fs-sm); padding: 4px 9px;
}
.ratioInput {
  @include text-field;
  width: 56px; border-color: var(--accent); font-size: var(--fs-xs); padding: 4px 6px;
}
.unitName { font-size: var(--fs-sm); color: var(--text); }
.unitName { cursor: text; }
.unitName:hover { color: var(--accent); }
.nameInput {
  @include text-field;
  border-color: var(--accent); padding: 2px 6px; flex: 1;
}
.unitRow .ghost { margin-top: 0;   border-radius: var(--radius);
}
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: 600;
  margin: 0 0 14px;
}
.secHead { display: flex; justify-content: space-between; align-items: baseline; }
.eachBtn {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide);
  padding: 2px 7px;
  &.on { border-color: var(--accent); color: var(--accent); }
}
.ghost {
  width: 100%; margin-top: 2px; padding: 8px 12px;
  border: 1px solid var(--line); background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost.linked { border-color: var(--accent); color: var(--accent); }
.colorRow { display: flex; align-items: center; gap: 10px; }
.bigChip {
  width: var(--swatch-big); height: var(--swatch-big); border: 1px solid var(--line);
  padding: 0; cursor: pointer; color: var(--faint); font: inherit;
  border-radius: var(--radius);
}
.bigChip:hover { border-color: var(--accent); }
.hex { font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base); text-transform: uppercase; }
.palette { display: flex; gap: 6px; margin-top: 10px; }
.colorChip {
  width: 18px; height: 18px; border: 1px solid var(--line);
  padding: 0; cursor: pointer;
  border-radius: var(--radius);
}
.colorChip.on { outline: 1px solid var(--text); outline-offset: 1px; }
.hexRow { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.hexLabel {
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase;
  color: var(--faint);
}
.hexInput {
  @include text-field;
  width: 76px; padding: 3px 8px; text-transform: uppercase;
}
.scopeChips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.scopeChip {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base); padding: 3px 8px;
  color: var(--faint);
  &.on { border-color: var(--accent); color: var(--accent); }
}
.viewToggle { margin-bottom: 0; }
.pEmpty {
  font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base);
  border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 16px 12px; text-align: center;
}
.pGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pCard {
  position: relative; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 6px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
.pThumb { display: block; width: 100%; height: auto; background: var(--bg); border-radius: var(--radius); }
.pList { display: flex; flex-direction: column; gap: 6px; }
.pRow {
  position: relative; display: flex; align-items: center; gap: 10px; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
.pMini { width: 34px; height: 26px; flex-shrink: 0; background: var(--bg); border-radius: var(--radius); }
.pName { font-size: var(--fs-xs); color: var(--text); margin-top: 4px; cursor: text; }
.pName:hover { color: var(--accent); }
.pRow .pName { margin-top: 0; }
.pNameInput {
  @include text-field;
  border-color: var(--accent); padding: 1px 5px; margin-top: 4px; width: 100%;
  font-size: var(--fs-xs);
}
.pRow .pNameInput { margin-top: 0; flex: 1; min-width: 0; }
.pDel {
  position: absolute; top: 3px; right: 3px; opacity: 0;
  border: none; background: var(--panel); color: var(--faint);
  font: inherit; font-size: var(--fs-sm); line-height: 1; padding: 1px 5px;
  border-radius: var(--radius); cursor: pointer;
  &:hover { color: var(--danger); }
}
.pMenu {
  position: fixed; z-index: 20;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 4px; display: flex; flex-direction: column;
}
.pMenuItem {
  border: none; background: none; color: var(--text); cursor: pointer;
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  padding: 6px 10px; text-align: left; border-radius: var(--radius); white-space: nowrap;
  &:hover { color: var(--accent); }
}
.check {
  display: flex; align-items: center; gap: 8px;
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase;
  color: var(--faint); cursor: pointer;
}
</style>
