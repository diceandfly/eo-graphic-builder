<script setup>
import { ref, watch, nextTick } from 'vue';
import { readTokenMs } from '../../utils/cssToken.js';
import { ICONS } from '../../ui/icons.js';

// 바운딩박스 우측 상단 액션 버튼 (SVG) — 단일 선택(SelectionOverlay)과 통합 선택(GroupOverlay) 공용.
// 부모가 translate로 위치(우측변 상단)를 잡아준다. 화면 크기 고정을 위해 scale 역보정.
// 툴팁 규격은 HTML IconButton과 동일 토큰(--tip-delay, panel/line/text, fs-xs).
const props = defineProps({ scale: Number });
const emit = defineEmits(['action']); // 'flip' | 'flipv' | 'dup' | 'del'
const px = (n) => n / props.scale;

const BTN = 28;
const ICON = 16;
const ACTIONS = [
  { key: 'flip', tip: 'Flip horizontal (⇧H)', paths: ICONS.flipH },
  { key: 'flipv', tip: 'Flip vertical (⇧V)', paths: ICONS.flipV },
  { key: 'dup', tip: 'Duplicate', paths: ICONS.duplicate },
  { key: 'del', tip: 'Delete (D)', paths: ICONS.trash },
];

const tip = ref(null);
const tipTextEl = ref(null);
const tipW = ref(0);
watch(tip, async (v) => {
  tipW.value = 0;
  if (v) {
    await nextTick();
    if (tipTextEl.value) tipW.value = tipTextEl.value.getBBox().width;
  }
});
let tipTimer = null;
function tipEnter(a, i) {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.value = { i, text: a.tip }; }, readTokenMs('--tip-delay', 350));
}
function tipLeave() {
  clearTimeout(tipTimer);
  tip.value = null;
}
</script>

<template>
  <g class="actions">
    <g
      v-for="(a, i) in ACTIONS"
      :key="a.key"
      class="abtn"
      :transform="`translate(0 ${i * px(BTN + 6)})`"
      @pointerdown.stop
      @click.stop="emit('action', a.key)"
      @pointerenter="tipEnter(a, i)"
      @pointerleave="tipLeave"
    >
      <rect :width="px(BTN)" :height="px(BTN)" />
      <g
        class="icon"
        :transform="`translate(${px((BTN - ICON) / 2)} ${px((BTN - ICON) / 2)}) scale(${px(ICON) / 24})`"
      >
        <path v-for="(d, j) in a.paths" :key="j" :d="d" />
      </g>
    </g>
    <g v-if="tip" class="tip" :transform="`translate(${px(BTN + 10)} ${tip.i * px(BTN + 6)})`">
      <rect v-if="tipW" :width="tipW + px(16)" :height="px(22)" :y="px(3)" />
      <text ref="tipTextEl" :x="px(8)" :y="px(14)" :font-size="px(11)" dominant-baseline="central">{{ tip.text }}</text>
    </g>
  </g>
</template>

<style scoped lang="scss">
.abtn { cursor: pointer; }
.abtn rect { fill: var(--panel); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.abtn .icon path {
  fill: none; stroke: var(--text); stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round;
}
.abtn:hover rect { stroke: var(--accent); }
.abtn:hover .icon path { stroke: var(--accent); }
.tip { pointer-events: none; }
.tip rect { fill: var(--panel); stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.tip text { fill: var(--text); font-family: inherit; user-select: none; }
</style>
