<script setup>
import { computed } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import { ref } from 'vue';
import { ASPECT_CHIPS } from '../geometry/aspects.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MIN, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP,
  UNIT_MIN, UNIT_MAX, ASPECT_TOL, COMP_SCALE, COMP_SNAP,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,      // 활성 유닛 { id, name, params }
  gutterMax: Number,
});
const emit = defineEmits(['setSize', 'setAspect', 'setA', 'setB', 'duplicate', 'export']);

const p = computed(() => props.unit.params);
const aspect = computed(() => p.value.W / p.value.H);

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

// Δ 슬라이더는 각자 실제 범위(a: 10–70%, b: 0–30%)를 0–100으로 정규화해 표기
const aNorm = computed(() => Math.round(((p.value.a - A_MIN) / (A_MAX - A_MIN)) * 100));
const bNorm = computed(() => Math.round(((p.value.b - B_MIN) / (B_MAX - B_MIN)) * 100));
</script>

<template>
  <div class="panel">
    <header class="brand">
      <!-- placeholder 로고 — 추후 교체 -->
      <svg class="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="0" y="9.5" width="24" height="5" fill="#FAF04B" />
        <polygon points="3,9.5 13,3 16,3 16,9.5" fill="#FAF04B" />
        <polygon points="8,14.5 8,21 11,21 21,14.5" fill="#FAF04B" />
      </svg>
      <span>GRAPHIC BUILDER</span>
    </header>

    <div class="unitRow">
      <span class="unitName">{{ unit.name }}</span>
      <button class="mini" @click="emit('duplicate')">+ duplicate</button>
    </div>

    <section>
      <h2>Unit Size</h2>
      <NumberField
        label="width (px)" :model-value="p.W" :min="UNIT_MIN" :max="UNIT_MAX"
        @update:model-value="(v) => emit('setSize', { W: v })"
      />
      <NumberField
        label="height (px)" :model-value="p.H" :min="UNIT_MIN" :max="UNIT_MAX"
        @update:model-value="(v) => emit('setSize', { H: v })"
      />
      <div class="ratioHead">ratio</div>
      <div class="ratioRow">
        <ChipRow
          :model-value="aspect" :chips="allAspects" :tol="ASPECT_TOL"
          @update:model-value="(v) => emit('setAspect', v)"
        />
        <button v-if="!ratioInputOpen" class="chipPlus" title="add custom ratio" @click="ratioInputOpen = true">+</button>
        <input
          v-else
          class="ratioInput"
          v-model="ratioInput"
          placeholder="21:9"
          @keydown.enter="addRatio"
          @keydown.esc="ratioInputOpen = false"
          @blur="addRatio"
          autofocus
        />
      </div>
    </section>

    <section>
      <h2>Grid</h2>
      <Slider label="cols" v-model="p.cols" :min="COLS_MIN" :max="COLS_MAX" :step="1" />
      <Toggle
        label="gutter mode" v-model="p.gutterMode"
        :options="[{ value: 'fixed', label: 'fixed' }, { value: 'proportional', label: 'prop' }]"
      />
      <Slider
        v-if="p.gutterMode === 'fixed'"
        label="gutter (px)" v-model="p.gutterPx"
        :min="GUTTER_MIN" :max="Math.floor(Math.min(GUTTER_MAX, gutterMax))" :step="1"
        :display="`${p.gutterPx}px`"
      />
      <Slider
        v-else
        label="gutter (ratio)" v-model="p.g"
        :min="G_MIN" :max="G_MAX" :step="G_STEP"
        :display="p.g.toFixed(3)"
      />
      <ChipRow v-model="p.rate" />
      <Slider
        label="compression rate" :model-value="compVal"
        :min="-COMP_SCALE" :max="COMP_SCALE" :step="0.01"
        :display="compDisplay"
        @update:model-value="setComp"
      />
      <label class="check">
        <input type="checkbox" v-model="p.showGuides" />
        <span>grid guides</span>
      </label>
    </section>

    <section>
      <h2>Shape Adjustment</h2>
      <Slider
        label="shaft size" v-model="p.dPct"
        :min="D_PCT_MIN" :max="D_PCT_MAX" :step="1"
        :display="`${p.dPct}% × UNIT HEIGHT`"
      />
      <Slider
        label="thread width Δa" :model-value="aNorm"
        :min="0" :max="100" :step="1"
        :display="`${aNorm}%`"
        @update:model-value="(v) => emit('setA', A_MIN + (v / 100) * (A_MAX - A_MIN))"
      />
      <Slider
        label="thread width Δb" :model-value="bNorm"
        :min="0" :max="100" :step="1"
        :display="`${bNorm}%`"
        @update:model-value="(v) => emit('setB', B_MIN + (v / 100) * (B_MAX - B_MIN))"
      />
      <Toggle
        label="threads" v-model="p.threads"
        :options="[
          { value: 'both', label: 'both side' },
          { value: 'one', label: 'one side' },
        ]"
      />
    </section>

    <section>
      <h2>Export</h2>
      <button class="ghost" @click="emit('export')">export svg</button>
    </section>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 26px; }
.brand {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.2em; color: var(--text);
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
.mini {
  border: 1px solid var(--line); background: none; color: var(--faint);
  font-family: inherit; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 3px 8px; cursor: pointer;
}
.mini:hover { border-color: var(--accent); color: var(--accent); }
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
.check {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--faint); cursor: pointer;
}
</style>
