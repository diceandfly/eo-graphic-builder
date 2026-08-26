<script setup>
import { ref } from 'vue';

// 패널 슬라이더 — 값 표시부는 항상 입력 필드 + 스테퍼 화살표 병용 (§124).
// 커밋 문법은 StepField와 동일: change(바깥 클릭 포함) = 커밋+플래시, Enter = 커밋+블러.
const props = defineProps({
  label: String,
  modelValue: Number,
  min: Number,
  max: Number,
  step: { type: Number, default: 1 },
  arrowStep: { type: Number, default: null }, // 화살표 증감 단위 (기본 = step)
  decimals: { type: Number, default: null },  // 입력칸 표시 소수 자리 (파생값의 부동소수 노이즈 제거)
  suffix: String,    // 입력 필드 뒤 단위 표기 (%, x 등)
  mixed: Boolean,    // 멀티선택에서 값이 갈릴 때 — 플레이스홀더 표기
  snapTo: { type: Number, default: null },     // 이 값 근처에서 스냅
  snapRadius: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue']);

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
const fmt = (v) => (props.decimals != null ? Number(v.toFixed(props.decimals)) : v);
const clampV = (v) => Math.min(props.max, Math.max(props.min, v));

function onInput(e) {
  let v = Number(e.target.value);
  if (props.snapTo != null && Math.abs(v - props.snapTo) <= props.snapRadius) {
    v = props.snapTo;
    e.target.value = String(v); // 썸도 스냅 위치로 고정 (비주얼 스냅)
  }
  emit('update:modelValue', v);
}
function onField(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v)) {
    emit('update:modelValue', clampV(v));
    ping();
  } else {
    e.target.value = fmt(props.modelValue);
  }
}
function onFieldKey(e) {
  if (e.key === 'Enter') {
    onField(e);
    e.target.blur();
  }
}
function bump(d) {
  const st = props.arrowStep ?? props.step;
  const cur = Number(props.modelValue) || 0;
  emit('update:modelValue', clampV(Math.round((cur + d * st) * 1000) / 1000));
  ping();
}
</script>

<template>
  <div class="row">
    <div class="head">
      <span class="label">{{ label }}</span>
      <!-- §125: 단위는 필드 박스 안의 어도른먼트 — 입력 텍스트와 분리(편집 불가), 클릭 시 입력 포커스 -->
      <span class="sf" :class="{ flash }" @click="$event.currentTarget.querySelector('input').focus()">
        <input
          class="valIn" type="number"
          :value="mixed ? '' : fmt(modelValue)" placeholder="—"
          @change="onField" @keydown="onFieldKey"
        />
        <span v-if="suffix" class="suffix">{{ suffix }}</span>
        <span class="btns">
          <button tabindex="-1" @click.stop="bump(1)">
            <svg viewBox="0 0 8 6"><path d="M4 1 7 5H1z" /></svg>
          </button>
          <button tabindex="-1" @click.stop="bump(-1)">
            <svg viewBox="0 0 8 6"><path d="M1 1h6L4 5z" /></svg>
          </button>
        </span>
      </span>
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
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.label { font-size: var(--fs-xs); letter-spacing: var(--ls-base); text-transform: uppercase; color: var(--faint); }
// 필드+화살표 — StepField와 동일 문법 (§124), 단위 어도른먼트 내장 (§125)
.sf {
  display: flex; align-items: stretch;
  border: 1px solid var(--line); border-radius: var(--radius);
  cursor: text;
  &:focus-within { border-color: var(--accent); }
  &.flash { animation: slPulse 0.2s ease-out; }
}
@keyframes slPulse {
  0% { border-color: var(--accent); background: var(--hover-bg); }
  100% { border-color: var(--line); background: none; }
}
.valIn {
  width: 44px; padding: 2px 6px; text-align: right;
  border: none; background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-sm); font-variant-numeric: tabular-nums;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &:focus { outline: none; }
}
.btns { display: flex; flex-direction: column; border-left: 1px solid var(--line); }
.btns button {
  flex: 1; min-height: 9px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; padding: 0 4px;
  &:first-child { border-bottom: 1px solid var(--line); }
  svg { width: 7px; height: 5px; fill: var(--faint); }
  &:hover svg { fill: var(--accent); }
}
.suffix {
  font-size: var(--fs-xs); color: var(--faint); white-space: nowrap;
  align-self: center; padding-right: 6px; pointer-events: none; // 편집 대상 아님 — 클릭은 .sf가 입력 포커스로
}
</style>
