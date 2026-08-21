<script setup>
defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
  step: { type: Number, default: 1 },
  display: String, // 우측 값 표기 (없으면 modelValue 그대로)
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="row">
    <div v-if="label || display" class="head">
      <span class="label">{{ label }}</span>
      <span class="value">{{ display ?? modelValue }}</span>
    </div>
    <input
      class="rg"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      @input="$emit('update:modelValue', Number($event.target.value))"
    />
  </div>
</template>

<style scoped>
.row { margin-bottom: 12px; }
.head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.label { font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--faint); }
.value { font-size: 13px; color: var(--text); font-variant-numeric: tabular-nums; }
</style>
