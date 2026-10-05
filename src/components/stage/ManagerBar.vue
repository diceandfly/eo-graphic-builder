<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 대시보드 우하단 — 프리셋 바 (§203 위치 스왑 · §207 재구성).
// [EO 심볼 = 유닛 프리셋] [layers = 패턴 프리셋] [플레이 = 애니메이션 매니저(예정)]
// EO 심볼 아이콘 원본: src/assets/EO symbol_S_W.svg (§106)
// tipsOff (§210): 프리셋 패널이 열려 있을 때 툴팁 억제 — 패널 모서리로 삐져나오는 네임카드 방지
defineProps({ panel: String, tipsOff: Boolean, anim: Boolean }); // panel: 'units' | 'patterns' | null
const emit = defineEmits(['togglePanel', 'toggleAnim']);
</script>

<template>
  <div class="managerCorner">
    <FloatingBar>
      <IconButton
        :active="panel === 'units'" tip-align="right"
        :tip="tipsOff ? '' : 'Unit presets (U)'"
        @click="emit('togglePanel', 'units')"
      >
        <svg class="eoSym" viewBox="0 0 4.07 4.11">
          <polygon points="4.07 3.05 3.08 3.05 3.08 2.59 3.1 2.59 4.07 1.84 4.07 1.52 3.08 1.52 3.08 1.07 3.09 1.07 4.07 .31 4.07 0 .97 0 0 .77 0 1.06 .99 1.06 .99 1.52 .97 1.52 0 2.27 0 2.59 .99 2.59 .99 3.03 .98 3.04 0 3.8 0 4.11 3.1 4.11 4.07 3.34 4.07 3.05" />
        </svg>
      </IconButton>
      <IconButton
        :paths="ICONS.layers" :active="panel === 'patterns'" tip-align="right"
        :tip="tipsOff ? '' : 'Pattern presets (P)'"
        @click="emit('togglePanel', 'patterns')"
      />
      <!-- §223: 애니메이션 모드 토글 (A) — §241: 호버 시 재생 진행 루프 애니메이션 -->
      <IconButton
        class="animHover"
        :paths="ICONS.animation" :active="anim" tip-align="right"
        :tip="tipsOff ? '' : 'Animation mode (A)'"
        @click="emit('toggleAnim')"
      />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.managerCorner { position: absolute; right: var(--sp-6); bottom: var(--sp-6); } /* §203: 우하단 (보기와 스왑) */
// 솔리드 심볼 확정 (§106) — 필 밀도 광학 보정으로 13px 고정
.eoSym {
  width: 13px; height: 13px;
  polygon { fill: var(--text); }
}
.managerCorner button:hover .eoSym polygon { fill: var(--accent); }
.managerCorner button.active .eoSym polygon { fill: var(--accent); }
/* §244: 애니메이션 버튼 — **모드 활성 중** 재생 삼각형이 오른쪽으로 톡톡 튕기는 루프
   (후보 C "미세 바운스" — 호버 트리거는 §243에서 활성 트리거로 정정, 사용자 확정).
   후보 B "재생 진행"(슬라이드+되감기)은 git 이력 §241 참조. */
@keyframes animPlayNudge {
  0%, 60%, 100% { transform: translateX(0); }
  30% { transform: translateX(2.5px); }
}
.animHover.active :deep(svg) { animation: animPlayNudge 0.8s ease-in-out infinite; }
</style>
