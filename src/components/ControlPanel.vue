<script setup>
import { computed } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import { ASPECT_CHIPS } from '../geometry/aspects.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MIN, B_MAX,
  GUTTER_MIN, GUTTER_MAX, G_MIN, G_MAX, G_STEP,
  UNIT_MIN, UNIT_MAX, ASPECT_TOL,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,      // 활성 유닛 { id, name, params }
  gutterMax: Number,
});
const emit = defineEmits(['setSize', 'setAspect', 'setA', 'setB', 'duplicate', 'export']);

const p = computed(() => props.unit.params);
const aspect = computed(() => p.value.W / p.value.H);

// compression: 슬라이더는 -1(S→L 최대) ~ +1(L→S 최대) 정규화 값. rate = 1 + |v|·(RATE_MAX-1)
const compVal = computed(() => {
  const t = (p.value.rate - 1) / (RATE_MAX - 1);
  return p.value.direction === 'StoL' ? -t : t;
});
function setComp(v) {
  p.value.rate = 1 + Math.abs(v) * (RATE_MAX - 1);
  p.value.direction = v >= 0 ? 'LtoS' : 'StoL';
}
const compDisplay = computed(() => `${(compVal.value * 100).toFixed(1)}%`);

// Δ 슬라이더는 각자 실제 범위(a: 10–70%, b: 0–30%)를 0–100으로 정규화해 표기
const aNorm = computed(() => Math.round(((p.value.a - A_MIN) / (A_MAX - A_MIN)) * 100));
const bNorm = computed(() => Math.round(((p.value.b - B_MIN) / (B_MAX - B_MIN)) * 100));
</script>

<template>
  <div class="panel">
    <header class="brand">EO GRAPHIC BUILDER</header>

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
      <ChipRow
        :model-value="aspect" :chips="ASPECT_CHIPS" :tol="ASPECT_TOL"
        @update:model-value="(v) => emit('setAspect', v)"
      />
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

    <section>
      <h2>Export</h2>
      <button class="ghost" @click="emit('export')">export svg</button>
    </section>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 26px; }
.brand {
  font-size: 13px; font-weight: 700; letter-spacing: 0.18em; color: var(--text);
  padding-bottom: 14px; border-bottom: 1px solid var(--line);
}
.unitRow { display: flex; justify-content: space-between; align-items: center; margin: -8px 0; }
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
