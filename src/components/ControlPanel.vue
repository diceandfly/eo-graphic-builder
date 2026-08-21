<script setup>
import { computed } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ASPECT_CHIPS } from '../geometry/aspects.js';
import { BRAND_COLORS } from '../geometry/constants.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MIN, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP,
  UNIT_MIN, UNIT_MAX, ASPECT_TOL, COMP_SCALE, COMP_SNAP,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,          // 활성 유닛 { id, name, params }
  gutterMax: Number,
  selected: { type: Array, default: () => [] }, // 선택된 유닛들
});
const emit = defineEmits(['setSize', 'setAspect', 'setA', 'setB', 'rename', 'create', 'link', 'fill']);

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
const aspect = computed(() => (p.value ? p.value.W / p.value.H : 1));

// compression: 슬라이더 표기 -2.5x ~ +2.5x, 중앙 0(무압축) 스냅.
// rate = 1 + |v|·(RATE_MAX-1)/COMP_SCALE, 부호 = 방향(+ = L→S)
const compVal = computed(() => {
  const t = ((p.value.rate - 1) / (RATE_MAX - 1)) * COMP_SCALE;
  return p.value.direction === 'StoL' ? -t : t;
});
function setComp(v) {
  if (Math.abs(v) < COMP_SNAP) v = 0; // 중앙 스냅포인트
  p.value.rate = 1 + (Math.abs(v) / COMP_SCALE) * (RATE_MAX - 1);
  p.value.direction = v >= 0 ? 'LtoS' : 'StoL';
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

// 유닛 이름 편집
const editingName = ref(false);
const nameDraft = ref('');
function startRename() {
  nameDraft.value = props.unit.name;
  editingName.value = true;
}
function commitRename() {
  if (editingName.value) emit('rename', nameDraft.value);
  editingName.value = false;
}
function cancelRename() {
  editingName.value = false;
}
</script>

<template>
  <div class="panel">
    <header class="brand">
      <svg class="logo" viewBox="0 0 57.87 27.92" height="18" aria-hidden="true">
        <g fill="#FAF04B">
          <path d="M27.66,12.58v-2.39h-6.65v-2.72l6.63-5.16V0H6.82c-.11,0-.22.04-.31.11L.02,5.25v2.2h6.63v2.73L0,15.34v2.39h6.65v2.72L.02,25.61v2.31h20.82c.11,0,.22-.04.31-.11l6.49-5.15v-2.2h-6.63v-2.73l6.65-5.16Z"/>
          <path d="M57.87,7.81L49.63.2h-10.55l-8.25,7.61v12.37s0,0,0,0l8.25,7.61h10.55l8.25-7.61s0,0,0,0V7.81s0,0,0,0ZM54.44,15.7h-5.21l-3.21,2.9v5.81h-3.34v-5.81l-3.21-2.9h-5.21v-3.4h5.21l3.21-2.9V3.58h3.34v5.81l3.21,2.9h5.21v3.4Z"/>
        </g>
      </svg>
      <span>GRAPHIC BUILDER</span>
    </header>

    <div class="unitRow">
      <template v-if="unit">
        <input
          v-if="editingName"
          v-focus
          class="nameInput"
          v-model="nameDraft"
          @keydown.enter="(e) => { if (!e.isComposing) commitRename(); }"
          @keydown.esc="cancelRename"
          @blur="cancelRename"
        />
        <span v-else class="unitName" title="click to rename" @click="startRename">{{ unit.name }}</span>
      </template>
      <button v-else class="ghost" @click="emit('create')">new unit</button>
    </div>

    <template v-if="unit">
    <section>
      <h2>Size</h2>
      <NumberField
        label="width (px)" :model-value="p.W" :min="UNIT_MIN" :max="UNIT_MAX"
        :mixed="mixed('W')"
        @update:model-value="(v) => emit('setSize', { W: v })"
      />
      <NumberField
        label="height (px)" :model-value="p.H" :min="UNIT_MIN" :max="UNIT_MAX"
        :mixed="mixed('H')"
        @update:model-value="(v) => emit('setSize', { H: v })"
      />
      <div class="ratioHead">ratio</div>
      <div class="ratioRow">
        <ChipRow
          :model-value="aspect" :chips="allAspects" :tol="ASPECT_TOL"
          @update:model-value="(v) => emit('setAspect', v)"
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
      <Slider
        label="compression rate" :model-value="compVal"
        :min="-COMP_SCALE" :max="COMP_SCALE" :step="0.01"
        :snap-to="0" :snap-radius="COMP_SNAP"
        :display="mixed('rate', 'direction') ? '—' : compDisplay"
        @update:model-value="setComp"
      />
      <ChipRow v-model="p.rate" />
    </section>

    <section>
      <h2>Shape Adjustment</h2>
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
    </section>

    <section v-if="selected.length >= 2">
      <h2>Link</h2>
      <button class="ghost" :class="{ linked }" @click="emit('link')">
        {{ linked ? 'unlink parameters' : 'link parameters' }}
      </button>
    </section>
    </template>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 26px; }
.brand {
  display: flex; align-items: center; gap: 10px;
  font-size: 16px; font-weight: 700; letter-spacing: 0em; color: var(--text);
  padding: 4px 2px 14px; border-bottom: 1px solid var(--line);
}
.logo { flex-shrink: 0; }
.unitRow { display: flex; justify-content: space-between; align-items: center; margin-bottom: -10px; }
.ratioHead {
  font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--faint); margin-bottom: 6px;
}
.ratioRow { display: flex; align-items: flex-start; gap: 6px; }
.ratioRow :deep(.chips) { margin-bottom: 0; }
.chipPlus {
  border: 1px solid var(--line); background: none; color: var(--faint);
  font-family: inherit; font-size: 12px; padding: 4px 9px; cursor: pointer;
}
.chipPlus:hover { color: var(--accent); border-color: var(--accent); }
.ratioInput {
  width: 56px; border: 1px solid var(--accent); background: none; color: var(--text);
  font: inherit; font-size: 11px; padding: 4px 6px;
}
.unitName { font-size: 12px; color: var(--text); }
.unitName { cursor: text; }
.unitName:hover { color: var(--accent); }
.nameInput {
  border: 1px solid var(--accent); background: none; color: var(--text);
  font: inherit; font-size: 12px; padding: 2px 6px; flex: 1;
}
.unitRow .ghost { margin-top: 0; }
section h2 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em;
  color: var(--accent); font-weight: 600;
  margin: 0 0 14px;
}
.ghost {
  width: 100%; margin-top: 2px; padding: 8px 12px;
  border: 1px solid var(--line); background: none; color: var(--text);
  font-family: inherit; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost.linked { border-color: var(--accent); color: var(--accent); }
.colorRow { display: flex; align-items: center; gap: 10px; }
.bigChip {
  width: 34px; height: 34px; border: 1px solid var(--line);
  padding: 0; cursor: pointer; color: var(--faint); font: inherit;
}
.bigChip:hover { border-color: var(--accent); }
.hex { font-size: 11px; color: var(--faint); letter-spacing: 0.04em; text-transform: uppercase; }
.palette { display: flex; gap: 6px; margin-top: 10px; }
.colorChip {
  width: 18px; height: 18px; border: 1px solid var(--line);
  padding: 0; cursor: pointer;
}
.colorChip.on { outline: 1px solid var(--text); outline-offset: 1px; }
.check {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--faint); cursor: pointer;
}
</style>
