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

<style scoped lang="scss">
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.label { font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint); }
.seg { display: flex; border: 1px solid var(--line);   border-radius: var(--radius);
}
.seg button {
  border: none; background: none; padding: 3px 9px;
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); color: var(--faint);
  font-family: inherit; cursor: pointer;
}
.seg button:not(:last-child) { border-right: 1px solid var(--line); }
.seg button.on {
  background: none; color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
</style>
