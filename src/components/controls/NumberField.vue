<script setup>
import { ref } from 'vue';

defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
  mixed: Boolean, // 멀티선택에서 값이 갈릴 때 — 표기로 안내
});
const emit = defineEmits(['update:modelValue']);

// §123: 팝업 StepField와 동일한 커밋 문법 — change(바깥 클릭 포함) = 커밋+플래시, Enter = 커밋+블러
const flash = ref(false);
let flashT = null;
function ping() {
  flash.value = false;
  requestAnimationFrame(() => {
    flash.value = true;
    clearTimeout(flashT);
    flashT = setTimeout(() => (flash.value = false), 220);
  });
}
function onCommit(e) {
  emit('update:modelValue', Number(e.target.value));
  ping();
}
function onKey(e) {
  if (e.key === 'Enter') {
    onCommit(e);
    e.target.blur();
  }
}
</script>

<template>
  <label class="row">
    <span class="label">{{ label }}</span>
    <input
      type="number"
      :class="{ flash }"
      :value="mixed ? '' : modelValue"
      placeholder="—"
      :min="min"
      :max="max"
      step="any"
      @change="onCommit"
      @keydown="onKey"
    />
  </label>
</template>

<style scoped lang="scss">
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.label { font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint); }
input {
  @include text-field;
  width: 58px; padding: 3px 8px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &.flash { animation: nfPulse 0.2s ease-out; }
}
@keyframes nfPulse {
  0% { border-color: var(--accent); background: var(--hover-bg); }
  100% { border-color: var(--line); background: none; }
}
</style>
