<script setup>
import { reactive } from 'vue';

// LINK 섹션 — 링크 토글 + 동기화 범주 칩 (§68 부채 ③: ControlPanel에서 분리).
// 링크 전에는 로컬 드래프트를 편집하고, "link parameters" 시 그 값이 링크 초기 스코프가 된다.
const props = defineProps({
  linked: Boolean,
  linkScope: Object,    // 링크된 상태의 스코프 (null = 전체 on)
  chipsVisible: Boolean, // rect 혼합 선택이면 false (rect 링크는 전체 동기화)
  single: Boolean,       // 링크 멤버 1개만 선택 — "이 유닛만 해제" 모드 (§73)
});
const emit = defineEmits(['link', 'scopeToggle', 'unlinkOne']);

const LINK_CATS = { size: 'size', grid: 'grid', shape: 'shape', color: 'color', orientation: 'orientation' };
// 기본: color·orientation off (useDocument linkScopeDefault와 동일 값 유지)
const draftScope = reactive({ size: true, orientation: false, grid: true, shape: true, color: false });
const scopeOn = (k) =>
  props.linked ? (props.linkScope ? props.linkScope[k] !== false : true) : draftScope[k];
function onChip(k) {
  if (props.linked) emit('scopeToggle', k);
  else draftScope[k] = !draftScope[k];
}
</script>

<template>
  <section>
    <h2>Link</h2>
    <!-- 단일 링크 멤버: 이 유닛만 링크에서 빼기 -->
    <button v-if="single" class="ghost linked" @click="emit('unlinkOne')">
      unlink this unit
    </button>
    <button v-else class="ghost" :class="{ linked }" @click="emit('link', { ...draftScope })">
      {{ linked ? 'unlink parameters' : 'link parameters' }}
    </button>
    <div v-if="!single && chipsVisible" class="scopeChips">
      <button
        v-for="(label, key) in LINK_CATS" :key="key"
        class="scopeChip" :class="{ on: scopeOn(key) }"
        @click="onChip(key)"
      >{{ label }}</button>
    </div>
  </section>
</template>

<style scoped lang="scss">
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: var(--fw-semibold);
  margin: 0 0 12px; /* §138: ControlPanel h2와 동일 */
}
.ghost {
  width: 100%; margin-top: 2px; padding: 8px 12px;
  border: 1px solid var(--line); background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost.linked { border-color: var(--accent); color: var(--accent); }
.scopeChips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.scopeChip {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base); padding: 0 8px;
  height: 21px; display: inline-flex; align-items: center; // §141: 토글 세그와 동일 세로폭
  color: var(--faint);
  &.on { border-color: var(--accent); color: var(--accent); }
}
</style>
