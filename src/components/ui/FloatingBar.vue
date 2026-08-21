<script setup>
// 공통 플로팅 바 컨테이너 — 툴바·코너바·정렬바의 박스 스타일 단일 출처.
// 위치(absolute 배치)는 사용처에서 래퍼로 지정한다. 자식에 class="sep"로 구분선 사용.
// 스타일 토큰: --panel --line --radius --sp-1
</script>

<template>
  <div class="fbar" @pointerdown.stop><slot /></div>
</template>

<style scoped lang="scss">
.fbar {
  display: flex; align-items: center; gap: 2px;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: var(--sp-1);
  :deep(.sep) { width: 1px; height: 18px; background: var(--line); margin: 0 var(--sp-1); }
}
</style>
