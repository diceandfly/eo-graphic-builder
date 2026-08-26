<script setup>
import { ref } from 'vue';
import ColorPicker from './ColorPicker.vue';

// 컬러 옵션 행 공용 컨트롤 (§90) — 미리보기 칩 + hex 입력, 칩 클릭 = 인라인 픽커 토글.
// 픽커는 라이브 적용(저장 슬롯 없음). 빈 hex = 기본색 복귀(null).
// 사용처: 코너 바 팝업의 Canvas/Grid/Unit grid color (확장 시에도 이 컴포넌트만 재사용할 것).
const props = defineProps({
  modelValue: String,               // hex 또는 null(기본색)
  fallback: { type: String, default: '#888888' }, // 미표시(null) 시 칩에 보여줄 CSS 색
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
function onHex(e) {
  let t = e.target.value.trim();
  if (!t) { emit('update:modelValue', null); return; }
  if (t[0] !== '#') t = '#' + t;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) emit('update:modelValue', t);
  else e.target.value = props.modelValue || '';
}
</script>

<template>
  <div class="cf">
    <div class="row">
      <button
        class="preview" :style="{ background: modelValue || fallback }"
        title="pick color" @click="open = !open"
      />
      <input
        class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
        :value="modelValue || ''"
        @keydown.enter="onHex" @change="onHex"
      />
    </div>
    <ColorPicker
      v-if="open" class="picker"
      :model-value="modelValue || '#888888'"
      @update:model-value="(c) => emit('update:modelValue', c)"
    />
  </div>
</template>

<style scoped lang="scss">
.cf { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: var(--sp-3); }
.preview {
  width: var(--swatch-chip); height: var(--swatch-chip); flex-shrink: 0;
  border: 1px solid var(--line); border-radius: var(--radius);
  cursor: pointer; padding: 0;
  &:hover { border-color: var(--accent); }
}
.hexInput {
  @include text-field;
  width: 76px; padding: 3px 8px; text-transform: uppercase;
}
</style>
