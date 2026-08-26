<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 대시보드 우상단 — 매니저 바 (§99: 자리만 확보, 클릭 no-op).
// layers = 레이어 매니저(추후 기획) / pattern = 패턴 매니저(Phase 2)
// pattern 아이콘 = EO 심볼의 스트로크 재해석 (§106 — 필 원본은 src/assets/EO symbol_S_W.svg)
const ACTIONS = [
  { key: 'layers', tip: 'Layer manager — coming soon', paths: ICONS.layers },
  { key: 'pattern', tip: 'Pattern manager — coming soon', paths: ICONS.pattern },
];
</script>

<template>
  <div class="managerCorner">
    <FloatingBar>
      <IconButton
        v-for="a in ACTIONS"
        :key="a.key"
        :paths="a.paths"
        :tip="a.tip"
        tip-side="bottom" tip-align="right"
      />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.managerCorner { position: absolute; right: var(--sp-6); top: var(--sp-6); }
</style>
