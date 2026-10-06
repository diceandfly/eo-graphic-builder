<script setup>
import { ref } from 'vue';

// LINK 섹션 — §265: 범주별 **linked | solo** 원클릭 토글 (§264 번호 코인 UI 폐기 — 사용자:
// "그룹 번호를 내가 고르는 건 과함". 멘탈 모델 = "선택된 유닛들끼리, 이 범주는 통일 / 이 범주는 각자").
// 행 클릭: off → 선택 유닛들을 그 범주 한 그룹으로(선택 안에 기존 그룹이 있으면 합류, 없으면 새 그룹)
//          on  → 그 범주 해제(각자). 그룹 id는 내부 자동 관리 — 번호 노출 없음.
const props = defineProps({
  linked: Boolean,
  single: Boolean,       // 링크 멤버 1개만 선택 — 그 유닛만 전 범주 이탈 (§73·§311: 라벨은 통일)
  rowsVisible: Boolean,  // 유닛 전용 (프레임 혼합 선택이면 행 숨김 — 프레임 링크는 전체 동기)
  forkable: Boolean,     // §311: 포크 가능 — 선택 내 2+ 공유 lid에 바깥 멤버가 있을 때
  selected: { type: Array, default: () => [] },
});
const emit = defineEmits(['link', 'unlinkOne', 'fork', 'setCatLink', 'hoverCat']); // §279: hoverCat = 칩 호버 하이라이트

const CATS = ['size', 'shape', 'grid', 'color', 'orientation', 'animation']; // §269: 메인 패널 섹션 순서와 정렬 (사용자 확정)
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
// §278: 단일 선택 + solo 상태 = 결성 불가(상대 없음) — 칩 비활성
const soloDisabled = (cat) => units().length < 2 && catState(cat) !== 'on';
function rowToggle(cat) {
  if (catState(cat) === 'on') {
    emit('setCatLink', cat, null); // 각자 (단일 선택이면 그 유닛만 그룹 이탈)
  } else {
    if (soloDisabled(cat)) return;
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
    <!-- §265·§267: 범주 토글 칩 — 컴팩트(내용 폭·랩 배치). linked = 전체 하이라이트,
         mixed = 보더 하이라이트 없이 상태 텍스트만 강조 (사용자 확정)
         §278: 단일 선택에서도 상시 표시 — linked 칩 클릭 = 그 범주만 이탈, solo 칩은 상태 표시만
         (상대 없는 단독 결성은 무의미라 비활성) -->
    <div v-if="rowsVisible" class="catRows">
      <button
        v-for="cat in CATS" :key="cat"
        class="catTg" :class="{ on: catState(cat) === 'on', mixed: catState(cat) === 'mixed', dis: soloDisabled(cat) }"
        :title="catState(cat) === 'on'
          ? (units().length < 2 ? 'Linked — click to leave this group' : 'Linked — click to make each solo')
          : soloDisabled(cat) ? 'Solo — select 2+ units to link' : 'Solo — click to link selection'"
        @click="rowToggle(cat)"
        @mouseenter="emit('hoverCat', cat)"
        @mouseleave="emit('hoverCat', null)"
      >
        <span class="catName">{{ cat }}</span>
        <span class="catState">{{ catState(cat) === 'on' ? 'linked' : catState(cat) === 'mixed' ? 'mixed' : 'solo' }}</span>
      </button>
    </div>
    <!-- §267: Link/Unlink 숏컷 = 섹션 하단으로
         §311: "Unlink this unit" 분기 폐기 — 라벨은 Unlink all parameters로 통일(단일 선택 = 그
         유닛만 전 범주 이탈), 링크 상태 하이라이팅 제거(Link와 동일 고스트 룩, 사용자 확정) -->
    <button v-if="single" class="ghost" @click="emit('unlinkOne')">
      Unlink all parameters
    </button>
    <button v-else-if="selected.length >= 2" class="ghost" @click="emit('link', { ...DEFAULT_SCOPE })">
      {{ linked ? 'Unlink all parameters' : 'Link all parameters' }}<!-- §284: 범주 칩과 구분되는 "전체" 명시 --></button>
    <!-- §311: 포크 — 선택분을 새 링크그룹으로 절연 (내부 동기 유지, 그룹별 각각 분리) -->
    <button
      v-if="forkable" class="ghost"
      title="Detach selection from its link group(s) — selection stays linked together"
      @click="emit('fork')"
    >Split into new group</button>
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
  width: 100%; margin-top: 0; padding: 0 12px; height: 21px; /* §219: 컨트롤 공통 높이 */
  border: 1px solid var(--line); background: none; color: var(--text);
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base); /* §214: 캡스 해제 */
  text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
  cursor: pointer;
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost + .ghost { margin-top: 5px; } /* §311: 숏컷 2행(Unlink·Split) — catRows gap과 동일 리듬 */
/* §265·§267: 범주 토글 칩 — 내용 폭 랩 배치(100% 행 폐기). on = 전체 액센트,
   mixed = 보더·이름은 기본, 상태 텍스트만 액센트 */
.catRows { margin-bottom: var(--sp-group); display: grid; grid-template-columns: 1fr 1fr; gap: 5px; } /* §267·§271 */
.catTg {
  @include bordered-control;
  height: 21px; padding: 0 8px;
  display: inline-flex; align-items: center; justify-content: space-between; gap: 6px;
  color: var(--faint);
  .catName { text-transform: capitalize; }
  .catState { font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); }
  &.on { border-color: var(--accent); color: var(--accent); }
  &.mixed .catState { color: var(--accent); }
  &:hover { border-color: var(--accent); color: var(--accent); }
  &.dis { cursor: default; color: var(--disabled); &:hover { border-color: var(--line); color: var(--disabled); } } /* §278 */
}
</style>
