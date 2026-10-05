<script setup>
import { ref } from 'vue';

// LINK 섹션 — §265: 범주별 **linked | solo** 원클릭 토글 (§264 번호 코인 UI 폐기 — 사용자:
// "그룹 번호를 내가 고르는 건 과함". 멘탈 모델 = "선택된 유닛들끼리, 이 범주는 통일 / 이 범주는 각자").
// 행 클릭: off → 선택 유닛들을 그 범주 한 그룹으로(선택 안에 기존 그룹이 있으면 합류, 없으면 새 그룹)
//          on  → 그 범주 해제(각자). 그룹 id는 내부 자동 관리 — 번호 노출 없음.
const props = defineProps({
  linked: Boolean,
  single: Boolean,       // 링크 멤버 1개만 선택 — "이 유닛만 해제" 모드 (§73)
  rowsVisible: Boolean,  // 유닛 전용 (프레임 혼합 선택이면 행 숨김 — 프레임 링크는 전체 동기)
  selected: { type: Array, default: () => [] },
});
const emit = defineEmits(['link', 'unlinkOne', 'setCatLink']);

const CATS = ['size', 'orientation', 'grid', 'shape', 'color', 'animation'];
// Link parameters 숏컷의 기본 스코프 (useDocument linkScopeDefault와 동일 값 유지)
const DEFAULT_SCOPE = { size: true, orientation: false, grid: true, shape: true, color: false, animation: true };

// §264: 섹션 접기 (ControlPanel과 동일 문법·저장 키 공유)
const foldInit = (() => { try { return !!JSON.parse(localStorage.getItem('eo.panelFold') || '{}').link; } catch { return false; } })();
const folded = ref(foldInit);
function toggleFold() {
  folded.value = !folded.value;
  try {
    const f = JSON.parse(localStorage.getItem('eo.panelFold') || '{}');
    f.link = folded.value;
    localStorage.setItem('eo.panelFold', JSON.stringify(f));
  } catch { /* 저장 실패 무시 */ }
}

const units = () => props.selected.filter((u) => u.type !== 'frame');
// 행 상태: 'on'(전원 같은 그룹) | 'off'(전원 solo) | 'mixed'
function catState(cat) {
  const us = units();
  if (!us.length) return 'off';
  const v = us[0].links?.[cat] ?? null;
  if (!us.every((u) => (u.links?.[cat] ?? null) === v)) return 'mixed';
  return v == null ? 'off' : 'on';
}
function rowToggle(cat) {
  if (catState(cat) === 'on') {
    emit('setCatLink', cat, null); // 각자
  } else {
    // 선택 안에 이미 그 범주 그룹이 있으면 합류, 없으면 새 그룹
    const lids = units().map((u) => u.links?.[cat]).filter((x) => x != null);
    emit('setCatLink', cat, lids[0] ?? 'new');
  }
}
</script>

<template>
  <section>
    <h2 class="secH">Link<button class="foldTg" @click="toggleFold"><svg viewBox="0 0 24 24"><path :d="folded ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
    <template v-if="!folded">
    <!-- 단일 링크 멤버: 이 유닛만 링크에서 빼기 -->
    <button v-if="single" class="ghost linked" @click="emit('unlinkOne')">
      Unlink this unit
    </button>
    <button v-else class="ghost" :class="{ linked }" @click="emit('link', { ...DEFAULT_SCOPE })">
      {{ linked ? 'Unlink parameters' : 'Link parameters' }}
    </button>
    <!-- §265: 범주 토글 행 — "선택끼리 이 범주 통일(linked) / 각자(solo)" -->
    <div v-if="rowsVisible && !single" class="catRows">
      <button
        v-for="cat in CATS" :key="cat"
        class="catTg" :class="{ on: catState(cat) === 'on', mixed: catState(cat) === 'mixed' }"
        :title="catState(cat) === 'on' ? 'Linked — click to make each solo' : 'Solo — click to link selection'"
        @click="rowToggle(cat)"
      >
        <span class="catName">{{ cat }}</span>
        <span class="catState">{{ catState(cat) === 'on' ? 'linked' : catState(cat) === 'mixed' ? 'mixed' : 'solo' }}</span>
      </button>
    </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: var(--fw-semibold);
  margin: 0 0 12px; /* §138: ControlPanel h2와 동일 */
}
.secH { display: flex; align-items: center; justify-content: space-between; }
.foldTg {
  border: none; background: none; cursor: pointer; padding: 0;
  width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
  svg { width: 12px; height: 12px; fill: none; stroke: var(--faint); stroke-width: 2; stroke-linecap: square; }
  &:hover svg { stroke: var(--accent); }
}
.ghost {
  width: 100%; margin-top: 2px; padding: 0 12px; height: 21px; /* §219: 컨트롤 공통 높이 */
  border: 1px solid var(--line); background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base); /* §214: 캡스 해제 */
  text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost.linked { border-color: var(--accent); color: var(--accent); }
/* §265: 범주 토글 행 — 좌 라벨(L5) / 우 상태 뱃지. on = 액센트 */
.catRows { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.catTg {
  @include bordered-control;
  height: 21px; padding: 0 8px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  color: var(--faint);
  .catName { text-transform: capitalize; }
  .catState { font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); }
  &.on { border-color: var(--accent); color: var(--accent); }
  &.mixed .catState { color: var(--dim); font-style: normal; }
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
