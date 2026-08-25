<script setup>
// 공통 아이콘 버튼 — 플로팅 바(툴바·코너바·정렬바)의 단일 출처.
// - paths: 24 viewBox 스트로크 패스 배열. 없으면 슬롯 콘텐츠(텍스트·스와치 칩)를 렌더.
// - tip: 툴팁 텍스트 (빈 문자열이면 미표시). tipAlign: 바 위치에 따른 정렬.
// - active: 활성 배경. tone: 'default' | 'danger' | 'doom' (리셋 경고 단계). disabled: 비활성.
// 스타일 토큰: --btn-size --icon-size --radius --hover-bg --danger(-bg) --doom(-bg/-pulse)
//             --disabled --tip-delay --tip-fade --fs-xs --ls-base
defineProps({
  paths: { type: Array, default: null },
  tip: { type: String, default: '' },
  tipAlign: { type: String, default: 'center' }, // 'center' | 'left' | 'right'
  tipSide: { type: String, default: 'top' }, // 'top' | 'bottom' — 상단 바에서는 bottom
  active: Boolean,
  tone: { type: String, default: 'default' },
  disabled: Boolean,
});
defineEmits(['click', 'contextmenu']);
</script>

<template>
  <button
    class="ib"
    :class="[`tone-${tone}`, `tip-${tipAlign}`, `tipside-${tipSide}`, { active, disabled }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <svg v-if="paths" viewBox="0 0 24 24"><path v-for="(d, i) in paths" :key="i" :d="d" /></svg>
    <slot />
    <span v-if="tip && !disabled" class="tip">{{ tip }}</span>
  </button>
</template>

<style scoped lang="scss">
.ib {
  position: relative;
  width: var(--btn-size); height: var(--btn-size);
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: var(--radius);
  cursor: pointer; padding: 0;
  color: var(--faint); font: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base);

  svg {
    width: var(--icon-size); height: var(--icon-size);
    fill: none; stroke: var(--text); stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round;
  }
  &:hover { color: var(--accent); svg { stroke: var(--accent); } }
  &.active { background: var(--hover-bg); svg { stroke: var(--accent); } }

  /* 경고 톤 — 툴팁 상시 표시 */
  &.tone-danger {
    background: var(--danger-bg);
    svg { stroke: var(--danger); }
    .tip { opacity: 1; transition-delay: 0s; color: var(--danger); }
  }
  &.tone-doom {
    background: var(--doom-bg);
    animation: doomPulse 0.6s ease-in-out infinite alternate;
    svg { stroke: var(--doom); }
    .tip { opacity: 1; transition-delay: 0s; color: var(--doom); border-color: var(--doom); }
  }

  &.disabled {
    cursor: default;
    svg, &:hover svg { stroke: var(--disabled); }
  }

  /* 툴팁 — --tip-delay 후 표시 */
  .tip {
    position: absolute; bottom: calc(100% + 10px);
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    color: var(--text); font-size: var(--fs-xs); letter-spacing: var(--ls-base);
    padding: 4px 8px; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity var(--tip-fade);
  }
  &.tip-center .tip { left: 50%; transform: translateX(-50%); }
  &.tip-left .tip { left: 0; }
  &.tip-right .tip { right: 0; }
  &.tipside-bottom .tip { bottom: auto; top: calc(100% + 10px); }
  &:hover .tip { opacity: 1; transition-delay: var(--tip-delay); }
}
@keyframes doomPulse {
  from { background: var(--doom-bg); }
  to { background: var(--doom-pulse); }
}
</style>
