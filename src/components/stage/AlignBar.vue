<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';

// 좌하단 정렬 패널 — 키 오브젝트(선택 중 재클릭) 기준 정렬. 2개 이상 선택 시 활성.
defineProps({ active: Boolean });
defineEmits(['align']);
const BTNS = [
  { key: 'left', tip: 'Align left edges', paths: ['M5 3v18', 'M9 8h10', 'M9 14h6'] },
  { key: 'hcenter', tip: 'Align horizontal centers', paths: ['M12 3v18', 'M5 8h14', 'M8 14h8'] },
  { key: 'right', tip: 'Align right edges', paths: ['M19 3v18', 'M5 8h10', 'M9 14h6'] },
  { key: 'top', tip: 'Align top edges', paths: ['M3 5h18', 'M8 9v10', 'M14 9v6'] },
  { key: 'vcenter', tip: 'Align vertical centers', paths: ['M3 12h18', 'M8 5v14', 'M14 8v8'] },
  { key: 'bottom', tip: 'Align bottom edges', paths: ['M3 19h18', 'M8 5v10', 'M14 9v6'] },
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
