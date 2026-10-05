<script setup>
import { ref } from 'vue';

// LINK 섹션 — §264: 다중 링크 그룹 UI (범주 행 × 그룹 번호 코인).
// 각 범주(size/orientation/grid/shape/color/animation)가 **서로 다른 파트너 그룹**을 가질 수 있다 —
// 행의 코인 클릭 → 옵션 칩(— / 그룹 번호들 / +New)에서 그 범주의 소속만 바꾼다.
// 상단 Link/Unlink 버튼은 "전 범주 기본 스코프로 새 그룹" 숏컷으로 유지 (§68 문법 계승).
const props = defineProps({
  linked: Boolean,
  single: Boolean,       // 링크 멤버 1개만 선택 — "이 유닛만 해제" 모드 (§73)
  rowsVisible: Boolean,  // 유닛 전용 (프레임 혼합 선택이면 행 숨김 — 프레임 링크는 전체 동기)
  selected: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] }, // [{ lid, n }] — 문서 전역, lid 오름차순 번호
});
const emit = defineEmits(['link', 'unlinkOne', 'setCatLink']);

// §264: 패널 표기 순서 (orientation은 §205에서 칩 삭제됐었으나 행 UI로 복귀 — 명시 지정이 가능해짐)
const CATS = ['size', 'orientation', 'grid', 'shape', 'color', 'animation'];
// Link parameters 숏컷의 기본 스코프 (useDocument linkScopeDefault와 동일 값 유지)
const DEFAULT_SCOPE = { size: true, orientation: false, grid: true, shape: true, color: false, animation: true };

const open = ref(null); // 펼친 범주 행
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
// 행의 현재 값: 선택 전원이 같은 lid면 그 lid, 전원 null이면 null, 갈리면 'mixed'
function catVal(cat) {
  const us = units();
  if (!us.length) return null;
  const v = us[0].links?.[cat] ?? null;
  return us.every((u) => (u.links?.[cat] ?? null) === v) ? v : 'mixed';
}
const numOf = (lid) => props.groups.find((g) => g.lid === lid)?.n ?? '?';
const coinLabel = (cat) => {
  const v = catVal(cat);
  return v === 'mixed' ? '—*' : v == null ? '—' : String(numOf(v));
};
function pick(cat, v) {
  emit('setCatLink', cat, v);
  open.value = null;
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
    <!-- §264: 범주 행 — 라벨 + 현재 그룹 코인. 클릭 = 그 범주의 그룹 선택지 펼침 -->
    <div v-if="rowsVisible && !single" class="catRows">
      <div v-for="cat in CATS" :key="cat" class="catRow">
        <div class="catLine">
          <span class="catLabel">{{ cat }}</span>
          <button
            class="coin" :class="{ on: catVal(cat) != null && catVal(cat) !== 'mixed', open: open === cat }"
            @click="open = open === cat ? null : cat"
          >{{ coinLabel(cat) }}</button>
        </div>
        <div v-if="open === cat" class="catOpts">
          <button class="opt" :class="{ on: catVal(cat) == null }" @click="pick(cat, null)">—</button>
          <button
            v-for="g in groups" :key="g.lid"
            class="opt" :class="{ on: catVal(cat) === g.lid }"
            @click="pick(cat, g.lid)"
          >{{ g.n }}</button>
          <button v-if="selected.length >= 2" class="opt new" @click="pick(cat, 'new')">+ new</button>
        </div>
      </div>
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
/* §264: 범주 행 — L5 라벨 + 코인(그룹 번호 칩). 링크 배지 번호 문법과 동일 */
.catRows { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.catLine { display: flex; align-items: center; justify-content: space-between; }
.catLabel { font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint); text-transform: capitalize; }
.coin {
  @include bordered-control;
  min-width: 26px; height: 19px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--faint); font-variant-numeric: tabular-nums;
  &.on { border-color: var(--accent); color: var(--accent); }
  &.open { background: var(--hover-bg); }
}
.catOpts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.opt {
  @include bordered-control;
  min-width: 24px; height: 19px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--faint); font-variant-numeric: tabular-nums;
  &.on { border-color: var(--accent); color: var(--accent); }
  &.new { text-transform: lowercase; }
  &:hover { color: var(--accent); border-color: var(--accent); }
}
</style>
