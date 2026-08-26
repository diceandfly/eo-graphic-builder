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

<style scoped lang="scss">
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; } /* §138 */
.chip {
  @include bordered-control;
  padding: 0 9px; min-width: 34px;
  height: 21px; display: inline-flex; align-items: center; justify-content: center; // §141: 토글 세그와 동일 세로폭
  &.on { @include active-filled; }
}
</style>
