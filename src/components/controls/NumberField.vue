<script setup>
defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="row">
    <span class="label">{{ label }}</span>
    <input
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      @change="$emit('update:modelValue', Number($event.target.value))"
    />
  </label>
</template>

<style scoped>
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.label { font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--faint); }
input {
  width: 58px; border: 1px solid var(--line); background: none; color: var(--text);
  font: inherit; font-size: 12px; padding: 2px 6px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
</style>
