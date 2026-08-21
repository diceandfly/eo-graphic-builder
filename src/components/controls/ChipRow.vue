<script setup>
import { RATIO_CHIPS } from '../../geometry/ratios.js';
import { CHIP_TOL } from '../../geometry/constants.js';

const props = defineProps({
  modelValue: Number,
  chips: { type: Array, default: () => RATIO_CHIPS }, // [{ label, v }]
  tol: { type: Number, default: CHIP_TOL },
});
defineEmits(['update:modelValue']);
const isActive = (v) => Math.abs(props.modelValue - v) < props.tol;
</script>

<template>
  <div class="chips">
    <button
      v-for="c in chips"
      :key="c.label"
      class="chip"
      :class="{ on: isActive(c.v) }"
      @click="$emit('update:modelValue', c.v)"
    >{{ c.label }}</button>
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.chip {
  border: 1px solid var(--line); background: none; color: var(--faint);
  font-size: 11px; letter-spacing: 0.02em; padding: 5px 9px; min-width: 34px;
  font-family: inherit; cursor: pointer;
}
.chip.on { background: var(--accent); color: var(--bg); border-color: var(--accent); }
</style>
