<script setup>
defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
  mixed: Boolean, // 멀티선택에서 값이 갈릴 때 — 표기로 안내
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="row">
    <span class="label">{{ label }}</span>
    <input
      type="number"
      :value="mixed ? '' : modelValue"
      placeholder="—"
      :min="min"
      :max="max"
      step="any"
      @change="$emit('update:modelValue', Number($event.target.value))"
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
}
</style>
