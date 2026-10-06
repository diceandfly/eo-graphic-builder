<script setup>
import { RATIO_CHIPS } from '../../geometry/ratios.js';
import { CHIP_TOL } from '../../geometry/constants.js';

const props = defineProps({
  modelValue: Number,
  chips: { type: Array, default: () => RATIO_CHIPS }, // [{ label, v }]
  tol: { type: Number, default: CHIP_TOL },
  outline: Boolean, // §310: 활성 = 스트로크 문법 (프레임 Ratio — 토글류와 통일, 사용자 확정)
});
defineEmits(['update:modelValue']);
const isActive = (v) => Math.abs(props.modelValue - v) < props.tol;
</script>

<template>
  <div class="chips" :class="{ outline }">
    <button
      v-for="c in chips"
      :key="c.label"
      class="chip"
      :class="{ on: isActive(c.v) }"
      @click="$emit('update:modelValue', c.v)"
    >{{ c.label }}</button>
    <slot /><!-- §264: 행 끝 추가 칩 자리 (예: 압축 ± 전환) -->
  </div>
</template>

<style scoped lang="scss">
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--sp-group); } /* §271: 칩 행 뒤 = 묶음 간격 */
.chip {
  @include bordered-control;
  padding: 0 9px; min-width: 34px;
  height: 21px; display: inline-flex; align-items: center; justify-content: center; // §141: 토글 세그와 동일 세로폭
  &.on { @include active-filled; }
}
/* §310: outline 변형 — 채움 대신 EO NEON 보더/텍스트 (seg 토글과 같은 활성 문법) */
.chips.outline .chip.on { background: none; @include active-outline; }
</style>
