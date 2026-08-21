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
      @change="$emit('update:modelValue', Number($event.target.value))"
    />
  </label>
</template>

<style scoped lang="scss">
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.label { font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint); }
input {
  width: 58px; border: 1px solid var(--line); background: none; color: var(--text);
  font: inherit; font-size: var(--fs-sm); padding: 3px 8px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
  border-radius: var(--radius);
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
input::placeholder { color: var(--faint); }
</style>
