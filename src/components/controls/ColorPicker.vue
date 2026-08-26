<script setup>
import { ref, watch } from 'vue';

// 커스텀 컬러 픽커 — SV 패드 + 휴 바 + hex 입력. 전부 DOM/토큰 스타일 (네이티브 창 없음).
const props = defineProps({ modelValue: { type: String, default: '#F9EE48' } });
const emit = defineEmits(['update:modelValue']);

const SV_W = 148;
const SV_H = 110;

// hex ↔ hsv 변환
function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (u) => Math.round((u + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

const hsv = ref(hexToHsv(props.modelValue) || { h: 0, s: 1, v: 1 });
let internal = false; // 자체 emit로 인한 되반사 무시
watch(
  () => props.modelValue,
  (v) => {
    if (internal) { internal = false; return; }
    const p = hexToHsv(v);
    if (p) hsv.value = p;
  }
);
function commit() {
  internal = true;
  emit('update:modelValue', hsvToHex(hsv.value.h, hsv.value.s, hsv.value.v));
}

// 드래그 공통: pointerdown 후 window에서 move 추적
function dragTrack(onPoint) {
  return (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      onPoint(
        Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
      );
      commit();
    };
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  };
}
const onSvDown = dragTrack((px, py) => {
  hsv.value.s = px;
  hsv.value.v = 1 - py;
});
const onHueDown = dragTrack((px) => {
  hsv.value.h = Math.min(359.9, px * 360);
});

// §112: 숫자 필드와 동일 커밋 문법 — Enter = 커밋+블러, 커밋 시 플래시
const hexFlash = ref(false);
let hexFlashT = null;
function onHex(e) {
  const p = hexToHsv(e.target.value);
  if (p) {
    hsv.value = p;
    commit();
    hexFlash.value = false;
    requestAnimationFrame(() => {
      hexFlash.value = true;
      clearTimeout(hexFlashT);
      hexFlashT = setTimeout(() => (hexFlash.value = false), 220);
    });
  } else {
    e.target.value = props.modelValue;
  }
}
function onHexKey(e) {
  onHex(e);
  e.target.blur();
}
</script>

<template>
  <div class="picker">
    <div
      class="sv"
      :style="{ width: SV_W + 'px', height: SV_H + 'px', background: `hsl(${hsv.h} 100% 50%)` }"
      @pointerdown="onSvDown"
    >
      <div class="svWhite" />
      <div class="svBlack" />
      <div
        class="dot"
        :style="{ left: hsv.s * SV_W + 'px', top: (1 - hsv.v) * SV_H + 'px' }"
      />
    </div>
    <div class="hue" :style="{ width: SV_W + 'px' }" @pointerdown="onHueDown">
      <div class="hueCursor" :style="{ left: (hsv.h / 360) * SV_W + 'px' }" />
    </div>
    <div class="row">
      <span class="preview" :style="{ background: modelValue }" />
      <input
        class="hexInput" type="text" spellcheck="false"
        :class="{ flash: hexFlash }"
        :value="modelValue"
        @keydown.enter="onHexKey"
        @change="onHex"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.picker { display: flex; flex-direction: column; gap: var(--sp-3); }
.sv {
  position: relative; cursor: crosshair;
  border: 1px solid var(--line); border-radius: var(--radius);
  overflow: hidden; touch-action: none;
}
.svWhite { position: absolute; inset: 0; background: linear-gradient(to right, #fff, transparent); }
.svBlack { position: absolute; inset: 0; background: linear-gradient(to top, #000, transparent); }
.dot {
  position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px;
  border: 1px solid #fff; outline: 1px solid #000; pointer-events: none;
}
.hue {
  position: relative; height: 10px; cursor: ew-resize;
  border: 1px solid var(--line); border-radius: var(--radius); touch-action: none;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.hueCursor {
  position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1px;
  background: #fff; outline: 1px solid #000; pointer-events: none;
}
.row { display: flex; align-items: center; gap: var(--sp-3); }
.preview {
  width: var(--swatch-chip); height: var(--swatch-chip); flex-shrink: 0;
  border: 1px solid var(--line); border-radius: var(--radius);
}
.hexInput.flash { animation: cpPulse 0.2s ease-out; }
@keyframes cpPulse {
  0% { border-color: var(--accent); background: var(--hover-bg); }
  100% { border-color: var(--line); background: none; }
}
.hexInput {
  @include text-field;
  width: 76px; padding: 3px 8px; text-transform: uppercase;
}
</style>
