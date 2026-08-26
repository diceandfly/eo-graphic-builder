<script setup>
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 좌하단 정렬 패널 — 키 오브젝트(선택 중 재클릭) 기준 정렬. 2개 이상 선택 시 활성.
defineProps({ active: Boolean });
defineEmits(['align']);
// 2행 4열: [좌·중·우·가로등간격] / [상·중·하·세로등간격]
const BTNS = [
  { key: 'left', tip: 'Align left edges', paths: ICONS.alignLeft },
  { key: 'hcenter', tip: 'Align horizontal centers', paths: ICONS.alignHCenter },
  { key: 'right', tip: 'Align right edges', paths: ICONS.alignRight },
  { key: 'disth', tip: 'Distribute horizontally', paths: ICONS.distributeH },
  { key: 'top', tip: 'Align top edges', paths: ICONS.alignTop },
  { key: 'vcenter', tip: 'Align vertical centers', paths: ICONS.alignVCenter },
  { key: 'bottom', tip: 'Align bottom edges', paths: ICONS.alignBottom },
  { key: 'distv', tip: 'Distribute vertically', paths: ICONS.distributeV },
];
</script>

<template>
  <div class="alignbar">
    <FloatingBar>
      <div class="grid">
        <IconButton
          v-for="b in BTNS"
          :key="b.key"
          :paths="b.paths" :tip="b.tip" tip-align="left"
          :disabled="!active"
          @click="$emit('align', b.key)"
        />
      </div>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
// 패널 오버레이(§85) 이후 좌하단이 패널에 가려짐 — 패널 오른쪽 옆으로 이동 (§97, FileBar와 동일 문법)
.alignbar { position: absolute; left: calc(var(--panel-w) + 2 * var(--sp-6)); bottom: var(--sp-6); }
.grid { display: grid; grid-template-columns: repeat(4, auto); gap: 2px; }
// 정렬 아이콘은 라인 위주라 같은 16px에서도 가늘어 보임 — 광학 보정 +2px
.grid :deep(.ib svg) { width: calc(var(--icon-size) + 2px); height: calc(var(--icon-size) + 2px); }
</style>
