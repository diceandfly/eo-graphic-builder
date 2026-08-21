<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 좌하단 정렬 패널 — 키 오브젝트(선택 중 재클릭) 기준 정렬. 2개 이상 선택 시 활성.
defineProps({ active: Boolean });
defineEmits(['align']);
const BTNS = [
  { key: 'left', tip: 'Align left edges', paths: ICONS.alignLeft },
  { key: 'hcenter', tip: 'Align horizontal centers', paths: ICONS.alignHCenter },
  { key: 'right', tip: 'Align right edges', paths: ICONS.alignRight },
  { key: 'top', tip: 'Align top edges', paths: ICONS.alignTop },
  { key: 'vcenter', tip: 'Align vertical centers', paths: ICONS.alignVCenter },
  { key: 'bottom', tip: 'Align bottom edges', paths: ICONS.alignBottom },
];
</script>

<template>
  <div class="alignbar">
    <FloatingBar>
      <IconButton
        v-for="b in BTNS"
        :key="b.key"
        :paths="b.paths" :tip="b.tip" tip-align="left"
        :disabled="!active"
        @click="$emit('align', b.key)"
      />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.alignbar { position: absolute; left: var(--sp-6); bottom: var(--sp-6); }
</style>
