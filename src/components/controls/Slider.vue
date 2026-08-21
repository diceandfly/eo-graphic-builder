<script setup>
const props = defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
  step: { type: Number, default: 1 },
  display: String, // 우측 값 표기 (없으면 modelValue 그대로)
  snapTo: { type: Number, default: null },     // 이 값 근처에서 스냅
  snapRadius: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue']);
function onInput(e) {
  let v = Number(e.target.value);
  if (props.snapTo != null && Math.abs(v - props.snapTo) <= props.snapRadius) {
    v = props.snapTo;
    e.target.value = String(v); // 썸도 스냅 위치로 고정 (비주얼 스냅)
  }
  emit('update:modelValue', v);
}
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
      @input="onInput"
    />
  </div>
</template>

<style scoped lang="scss">
.row { margin-bottom: 12px; }
.head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.label { font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint); }
.value { font-size: var(--fs-sm); color: var(--text); font-variant-numeric: tabular-nums; }
</style>
