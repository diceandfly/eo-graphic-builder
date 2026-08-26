<script setup>
import { ref, watch } from 'vue';
import ColorPicker from './ColorPicker.vue';
import { blurActive } from '../../utils/dom.js';

// 컬러 옵션 행 공용 컨트롤 (§90·§91) — 미리보기 칩 + hex 입력.
// 칩 클릭 = 별도 플로팅 픽커 팝오버(메뉴 레이아웃 불변, 칩 왼쪽에 표시).
// 픽커는 라이브 적용, 픽 동작(패드/휴 릴리즈) 후 자동 닫힘. 빈 hex = 기본색 복귀(null).
// 사용처: 코너 바 팝업의 Canvas/Grid/Unit grid color (확장 시에도 이 컴포넌트만 재사용할 것).
const props = defineProps({
  modelValue: String,               // hex 또는 null(기본색)
  fallback: { type: String, default: '#888888' }, // 미표시(null) 시 칩에 보여줄 CSS 색
  recents: { type: Array, default: null }, // 최근 사용 컬러 슬롯 (§110 — 컬러 툴바와 공유)
  side: { type: String, default: 'left' }, // 팝오버 방향 'left' | 'right' (패널처럼 좌측 클리핑 시 right)
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
let picked = false; // 팝오버 안에서 실제 색 변경이 있었는지 (hex 필드 클릭만으로는 닫지 않음)

function onHex(e) {
  let t = e.target.value.trim();
  if (!t) { emit('update:modelValue', null); return; }
  if (t[0] !== '#') t = '#' + t;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t)) emit('update:modelValue', t);
  else e.target.value = props.modelValue || '';
}
function onPick(c) {
  emit('update:modelValue', c);
  picked = true;
}
// 픽 동작을 마친 포인터 릴리즈에서 닫기 (패드/휴 드래그는 캡처로 팝오버에 pointerup이 버블됨)
function onPopUp() {
  if (picked) {
    open.value = false;
    picked = false;
  }
}
function closeOutside() {
  blurActive(); // 닫히기 전에 pending hex 입력 커밋 (§93)
  open.value = false;
}
watch(open, (o) => {
  picked = false;
  if (o) setTimeout(() => window.addEventListener('pointerdown', closeOutside, { once: true }), 0);
  else window.removeEventListener('pointerdown', closeOutside);
});
</script>

<template>
  <div class="cf">
    <button
      class="preview" :style="{ background: modelValue || fallback }"
      title="pick color" @click="open = !open"
    />
    <input
      class="hexInput" type="text" placeholder="#RRGGBB" spellcheck="false"
      :value="modelValue || ''"
      @keydown.enter="onHex" @change="onHex"
    />
    <!-- 플로팅 픽커 — 메뉴 흐름 밖(side 방향), 픽 후 자동 닫힘 -->
    <div
      v-if="open" class="pop" :class="side"
      @pointerdown.stop
      @pointerup="onPopUp"
      @keydown.enter="open = false"
    >
      <ColorPicker :model-value="modelValue || '#888888'" @update:model-value="onPick" />
      <!-- 최근 사용 컬러 (컬러 툴바와 동일 소스·문법, §110) -->
      <div v-if="recents && recents.length" class="recentRow">
        <button
          v-for="rc in recents" :key="rc"
          class="recentChip" :style="{ background: rc }" :title="rc"
          @click="onPick(rc)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// position 미지정 — .pop의 앵커를 가장 가까운 positioned 조상(호스트 메뉴 .menu)으로 넘겨
// 팝오버가 메뉴 '바깥' 왼쪽에 뜨게 한다 (§91)
.cf { display: flex; align-items: center; gap: var(--sp-3); }
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
.pop {
  position: absolute; top: 0;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  &.left { right: calc(100% + 12px); }
  &.right { left: calc(100% + 12px); }
}
.recentRow { display: flex; gap: 6px; }
.recentChip {
  width: 16px; height: 16px; flex-shrink: 0; border: none; cursor: pointer;
  border-radius: var(--radius);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--void-grey) 40%, transparent);
  &:hover { box-shadow: inset 0 0 0 1px var(--accent); }
}
</style>
