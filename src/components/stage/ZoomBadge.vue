<script setup>
import { computed } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 우하단 코너 바 — 캔버스 그리드 / 유닛 그리드 토글 + 줌%
const props = defineProps({ scale: Number, guides: Boolean, stageGrid: Boolean });
defineEmits(['reset', 'toggleGuides', 'toggleStageGrid']);
const pct = computed(() => Math.round(props.scale * 100));

</script>

<template>
  <div class="corner">
    <FloatingBar>
      <IconButton
        :paths="ICONS.canvasGrid" :active="stageGrid" tip-align="right"
        :tip="stageGrid ? 'Hide Canvas Grid' : 'Show Canvas Grid'"
        @click="$emit('toggleStageGrid')"
      />
      <IconButton
        :paths="ICONS.unitGrid" :active="guides" tip-align="right"
        :tip="guides ? 'Hide Unit Grid' : 'Show Unit Grid'"
        @click="$emit('toggleGuides')"
      />
      <IconButton class="zoom" tip="Reset zoom (100%)" tip-align="right" @click="$emit('reset')">
        {{ pct }}%
      </IconButton>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.corner { position: absolute; right: var(--sp-6); bottom: var(--sp-6); }
.zoom { width: var(--zoom-w); font-variant-numeric: tabular-nums; }
</style>
