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
  position: relative; isolation: isolate; // §258: ::before(z-1)를 바 안에 가두는 스태킹 컨텍스트
  padding: var(--sp-1);
  /* §258: 챔퍼는 **배경 가상요소**에만 — 바 자체를 clip하면 슬롯 자식인 팝업 메뉴까지 잘려
     우클릭 팝업이 전부 먹통이 되던 회귀(§257)의 원인 */
  &::before {
    content: ''; position: absolute; inset: 0; z-index: -1; box-sizing: border-box;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    @include chamfer(var(--chamfer-2)); // §257·§272
  }
  :deep(.sep) { width: 1px; height: 18px; background: var(--line); margin: 0 var(--sp-1); }
}
</style>
