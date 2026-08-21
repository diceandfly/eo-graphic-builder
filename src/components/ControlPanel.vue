<script setup>
import { computed } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MIN, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP, SIZE_MIN, SIZE_MAX,
} from '../geometry/constants.js';

const props = defineProps({
  p: Object,        // reactive params
  D: Number,        // 파생 shaft 높이 (px)
  gutterMax: Number,
});
const emit = defineEmits(['setA', 'setB', 'rotate']);

// Δ 슬라이더는 각자 실제 범위(a: 30–70%, b: 0–30%)를 0–100으로 정규화해 표기
const aNorm = computed(() => Math.round(((props.p.a - A_MIN) / (A_MAX - A_MIN)) * 100));
const bNorm = computed(() => Math.round(((props.p.b - B_MIN) / (B_MAX - B_MIN)) * 100));
// compression: 슬라이더는 -1(S→L 최대) ~ +1(L→S 최대) 정규화 값. rate = 1 + |v|·(RATE_MAX-1)
const compVal = computed(() => {
  const t = (props.p.rate - 1) / (RATE_MAX - 1);
  return props.p.direction === 'StoL' ? -t : t;
});
function setComp(v) {
  props.p.rate = 1 + Math.abs(v) * (RATE_MAX - 1);
  props.p.direction = v >= 0 ? 'LtoS' : 'StoL';
}
const compDisplay = computed(() => `${(compVal.value * 100).toFixed(1)}%`);
</script>

<template>
  <div class="panel">
    <section>
      <h2>Unit Size</h2>
      <NumberField label="width (px)" :model-value="p.W" :min="SIZE_MIN" :max="SIZE_MAX" @update:model-value="(v) => (p.W = Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)))" />
      <Slider label="" v-model="p.W" :min="SIZE_MIN" :max="SIZE_MAX" :step="1" />
      <NumberField label="height (px)" :model-value="p.H" :min="SIZE_MIN" :max="SIZE_MAX" @update:model-value="(v) => (p.H = Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)))" />
      <Slider label="" v-model="p.H" :min="SIZE_MIN" :max="SIZE_MAX" :step="1" />
      <button class="ghost" @click="emit('rotate')">rotate 90°</button>
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
        :min="-1" :max="1" :step="0.001"
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
      <Toggle
        label="thread direction" v-model="p.threadDir"
        :options="[
          { value: 'LtoR', label: 'L→R' },
          { value: 'RtoL', label: 'R→L' },
        ]"
      />
    </section>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 26px; }
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
