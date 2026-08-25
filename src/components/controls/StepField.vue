<script setup>
// 스테퍼 숫자 필드 — 네이티브 스피너 대신 상시 표시되는 토큰 스타일 화살표.
// 화살표는 필드 밖(우측 분리 컬럼)에 있어 숫자를 가리지 않는다.
const props = defineProps({
  modelValue: Number,
  min: Number,
  max: Number,
  step: { type: Number, default: 1 },
});
const emit = defineEmits(['update:modelValue']);

function clampV(v) {
  if (props.min != null) v = Math.max(props.min, v);
  if (props.max != null) v = Math.min(props.max, v);
  return v;
}
function onChange(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v)) emit('update:modelValue', clampV(v));
  else e.target.value = props.modelValue;
}
function bump(d) {
  const cur = Number(props.modelValue) || 0;
  emit('update:modelValue', clampV(Math.round((cur + d * props.step) * 100) / 100));
}
</script>

<template>
  <div class="sf">
    <input type="number" :value="modelValue" @change="onChange" @keydown.stop />
    <div class="btns">
      <button tabindex="-1" @click="bump(1)">
        <svg viewBox="0 0 8 6"><path d="M4 1 7 5H1z" /></svg>
      </button>
      <button tabindex="-1" @click="bump(-1)">
        <svg viewBox="0 0 8 6"><path d="M1 1h6L4 5z" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sf {
  display: flex; align-items: stretch;
  border: 1px solid var(--line); border-radius: var(--radius);
  &:focus-within { border-color: var(--accent); }
}
.sf input {
  width: 42px; padding: 2px 6px; text-align: right;
  border: none; background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-xs);
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &:focus { outline: none; }
}
.btns { display: flex; flex-direction: column; border-left: 1px solid var(--line); }
.btns button {
  flex: 1; min-height: 10px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; padding: 0 4px;
  &:first-child { border-bottom: 1px solid var(--line); }
  // 위/아래 동일한 SVG 삼각형 — 글리프(▴▾) 크기 편차 제거
  svg { width: 7px; height: 5px; fill: var(--faint); }
  &:hover svg { fill: var(--accent); }
}
</style>
