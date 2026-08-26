<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 대시보드 우상단 — 매니저 바 (§99: 자리만 확보, 클릭 no-op).
// layers = 레이어 매니저(추후 기획) / pattern = 패턴 매니저(Phase 2)
// pattern 아이콘 = EO 심볼 폴리곤의 윤곽 스트로크판 (§106 — 원본: src/assets/EO symbol_S_W.svg)
</script>

<template>
  <div class="managerCorner">
    <FloatingBar>
      <IconButton :paths="ICONS.layers" tip="Layer manager — coming soon" tip-side="bottom" tip-align="right" />
      <IconButton tip="Pattern manager — coming soon" tip-side="bottom" tip-align="right">
        <svg class="eoSym" viewBox="0 0 4.07 4.11">
          <polygon points="4.07 3.05 3.08 3.05 3.08 2.59 3.1 2.59 4.07 1.84 4.07 1.52 3.08 1.52 3.08 1.07 3.09 1.07 4.07 .31 4.07 0 .97 0 0 .77 0 1.06 .99 1.06 .99 1.52 .97 1.52 0 2.27 0 2.59 .99 2.59 .99 3.03 .98 3.04 0 3.8 0 4.11 3.1 4.11 4.07 3.34 4.07 3.05" />
        </svg>
      </IconButton>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.managerCorner { position: absolute; right: var(--sp-6); top: var(--sp-6); }
// 솔리드 심볼 확정 (§106) — 필 밀도 광학 보정으로 13px 고정
.eoSym {
  width: 13px; height: 13px;
  polygon { fill: var(--text); }
}
.managerCorner button:hover .eoSym polygon { fill: var(--accent); }
</style>
