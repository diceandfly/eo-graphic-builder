<script setup>
defineProps({
  label: String,
  modelValue: String,
  options: Array, // [{ value, label }]
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="row">
    <span class="label">{{ label }}</span>
    <div class="seg">
      <button
        v-for="o in options"
        :key="o.value"
        :class="{ on: o.value === modelValue }"
        @click="$emit('update:modelValue', o.value)"
      >{{ o.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.label { font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--faint); }
.seg { display: flex; border: 1px solid var(--line); }
.seg button {
  border: none; background: none; padding: 6px 12px;
  font-size: 11px; letter-spacing: 0.03em; color: var(--faint);
  font-family: inherit; cursor: pointer;
}
.seg button:not(:last-child) { border-right: 1px solid var(--line); }
.seg button.on {
  background: none; color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
</style>
