<script setup>
import { ref } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 대시보드 좌상단 — 파일 작업 바 (save / open / reset). export는 우클릭 메뉴로 이동 (§60).
const emit = defineEmits(['save', 'open', 'reset']);

const ACTIONS = [
  { key: 'manual', tip: 'Manual — coming soon', paths: ICONS.manual }, // 자리만 확보 (§74)
  { key: 'save', tip: 'Save JSON', paths: ICONS.save },
  { key: 'open', tip: 'Open JSON', paths: ICONS.open },
  { key: 'reset', tip: 'Reset dashboard', paths: ICONS.resetArrow },
];

const fileEl = ref(null);

// 리셋 3단계 확인: 1차 경고 → 2차 최후통첩 → 3차 실행. 각 단계 타임아웃 시 해제.
const resetStage = ref(0);
let armTimer = null;
const RESET_TIPS = [
  'Reset dashboard',
  'Click again to reset',
  'FINAL WARNING — every unit will be vaporized. They had families.',
];
const RESET_TONES = ['default', 'danger', 'doom'];
// 1·2단계 = 일반 리셋 화살표, 3단계(최후통첩)에서만 묘비
const RESET_ICONS = [ICONS.resetArrow, ICONS.resetArrow, ICONS.tombstone];

function onAction(key) {
  if (key === 'manual') return; // 빈 버튼 — 추후 기획
  if (key === 'save') emit('save');
  else if (key === 'open') fileEl.value.click();
  else if (key === 'reset') {
    clearTimeout(armTimer);
    if (resetStage.value >= 2) {
      resetStage.value = 0;
      emit('reset');
    } else {
      resetStage.value += 1;
      armTimer = setTimeout(() => (resetStage.value = 0), resetStage.value === 2 ? 5000 : 3000);
    }
  }
}
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('open', f);
  e.target.value = '';
}
</script>

<template>
  <div class="fileCorner">
    <FloatingBar>
      <IconButton
        v-for="a in ACTIONS"
        :key="a.key"
        :paths="a.key === 'reset' ? RESET_ICONS[resetStage] : a.paths"
        :tip="a.key === 'reset' ? RESET_TIPS[resetStage] : a.tip"
        :tone="a.key === 'reset' ? RESET_TONES[resetStage] : 'default'"
        tip-side="bottom" tip-align="left"
        @click="onAction(a.key)"
      />
      <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.fileCorner { position: absolute; left: var(--sp-6); top: var(--sp-6); }
</style>
