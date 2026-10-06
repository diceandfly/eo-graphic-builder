<script setup>
import { computed, ref, reactive } from 'vue';
import Slider from './controls/Slider.vue';
import NumberField from './controls/NumberField.vue';
import Toggle from './controls/Toggle.vue';
import ChipRow from './controls/ChipRow.vue';
import LinkSection from './panel/LinkSection.vue';
import { isLinkScoped, typeOf } from '../objects/registry.js';
import { primaryLid } from '../composables/useDocument.js';
import ColorField from './controls/ColorField.vue';
import { ICONS } from '../ui/icons.js';
import { useRecentColors } from '../composables/useRecentColors.js';
import {
  COLS_MIN, COLS_MAX, RATE_MAX,
  D_PCT_MIN, D_PCT_MAX, A_MIN, A_MAX, B_MAX,
  GUTTER_MIN, GUTTER_MAX,
  LIMITS, UNIT_MAX, ASPECT_TOL, COMP_SCALE, COMP_SNAP,
  FRAME_COMP_SCALE, FRAME_RATE_MAX,
} from '../geometry/constants.js';

const props = defineProps({
  unit: Object,          // 활성 유닛 { id, type, name, params }
  gutterMax: Number,
  selected: { type: Array, default: () => [] }, // 선택된 유닛들
  group: Object,         // { gid, name } — 선택이 하나의 최외곽 그룹 전체일 때
  linkScope: Object,     // 링크 동기화 스코프 (null = 전체 on)
  anim: Boolean,         // §255: 애니 모드 — offset 행 조건부 표시용
});
const emit = defineEmits([
  'setSize', 'setAspect', 'setA', 'setB', 'rename', 'link', 'fill',
  'renameGroup', 'linkScopeToggle', 'unlinkOne', 'setCatLink', // §264
  'hoverCat', // §279: 링크 칩 호버 → 스테이지 하이라이트
]);

// 멀티선택에서 값이 갈리는 파라미터는 '—'(mixed)로 표기. 조작하면 전체에 통일 적용됨.
const mixed = (...keys) =>
  props.selected.length > 1 &&
  props.selected.some((u) => keys.some((k) => u.params[k] !== props.unit.params[k]));

// 링크 멤버 1개만 선택 — "이 유닛만 해제" 버튼 표시 (§73) — §220: 범주형 links의 대표 lid 기준
const singleLinked = computed(() => props.selected.length === 1 && primaryLid(props.selected[0]) != null);
// §264: 섹션 접기 — 서브타이틀 우측 화살표 토글, 상태는 localStorage 영속
const fold = reactive((() => { try { return JSON.parse(localStorage.getItem('eo.panelFold') || '{}'); } catch { return {}; } })());
function toggleFold(k) { fold[k] = !fold[k]; localStorage.setItem('eo.panelFold', JSON.stringify(fold)); }
// §296: 접기 상태는 프레임/유닛 선택이 **비공유** — 프레임은 'f_' 네임스페이스 키 (유닛 키는 종전 유지)
const fkey = (k) => (isFrame.value ? 'f_' + k : k);
// (§264: offset 조건부 표시 폐기 — ANIMATION 섹션 + 접기로 대체)
// 선택 전체가 이미 하나의 링크인지
const linked = computed(() => {
  if (props.selected.length < 2) return false;
  const lids = [...new Set(props.selected.map((u) => primaryLid(u)))];
  return lids.length === 1 && lids[0] != null;
});

// 동적 삽입 input 포커스 (autofocus는 초기 로드에만 동작)
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

const p = computed(() => props.unit?.params);
// 프레임 오브젝트: 전용 섹션(GRID) 분기
const isFrame = computed(() => typeOf(props.unit) === 'frame');
const ON_OFF = [{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }];
// 링크 스코프 범주는 스코프형 타입(유닛)만 — rect가 섞이면 칩 숨김 (rect 링크는 전체 동기화)
const scopeChipsVisible = computed(() => props.selected.every((u) => isLinkScoped(u)));
// 멀티선택: SIZE는 통합 bbox 기준으로 표시·편집 (그룹을 하나의 대상처럼)
// EACH 토글 on이면 bbox 대신 개별 유닛 속성으로 표시·적용 (같은 값을 각자에게)
const eachMode = ref(false);
const selBox = computed(() => {
  if (props.selected.length < 2) return null;
  const minX = Math.min(...props.selected.map((u) => u.x));
  const minY = Math.min(...props.selected.map((u) => u.y));
  return {
    w: Math.max(...props.selected.map((u) => u.x + u.params.W)) - minX,
    h: Math.max(...props.selected.map((u) => u.y + u.params.H)) - minY,
  };
});
const sizeEach = computed(() => eachMode.value && props.selected.length > 1);
const useBox = computed(() => (sizeEach.value ? null : selBox.value));
const dispW = computed(() => (useBox.value ? Math.round(useBox.value.w) : p.value?.W));
const dispH = computed(() => (useBox.value ? Math.round(useBox.value.h) : p.value?.H));
const aspect = computed(() =>
  useBox.value ? useBox.value.w / useBox.value.h : p.value ? p.value.W / p.value.H : 1
);

// compression: 슬라이더 표기 -2.5x ~ +2.5x, 중앙 0(무압축) 스냅.
// rate = 1 + |v|·(RATE_MAX-1)/COMP_SCALE, 부호 = 방향(+ = L→S)
const compVal = computed(() => {
  const t = ((p.value.rate - 1) / (RATE_MAX - 1)) * COMP_SCALE;
  return p.value.direction === 'StoL' ? -t : t;
});
function setComp(v) {
  if (Math.abs(v) < COMP_SNAP) v = 0; // 중앙 스냅포인트
  p.value.rate = 1 + (Math.abs(v) / COMP_SCALE) * (RATE_MAX - 1);
  // §124: 부호 전환 = 압축 방향만 반전 — thread 기울기(쉐입)는 유지.
  // (구버전은 threadDir까지 함께 미러했음 — 좌우 미러가 필요하면 flip 버튼(⇧H)이 담당)
  p.value.direction = v >= 0 ? 'LtoS' : 'StoL';
}

// (§264: 유닛 Ratio 칩 폐지 — §294: 커스텀 비율 구독 잔재(allAspects·eo:ratios 리스너) 제거.
//  커스텀 비율 저장·사용은 Slider 칩/useRecentColors와 무관한 eo.customRatios 소비처에서 계속)

// Δ 슬라이더 = 변의 실제 폭 (col 폭 대비 %). 둘 다 "올리면 그 변이 넓어짐".
// top width = a (10–70%), bottom width = 1-b (30–100%)
const aPct = computed(() => Math.round(p.value.a * 100));
const bottomPct = computed(() => Math.round((1 - p.value.b) * 100));

// 유닛/그룹 이름 편집 — 선택이 그룹 전체면 그룹 이름을 대상으로
const editingName = ref(false);
const nameDraft = ref('');
function startRename() {
  nameDraft.value = props.group ? props.group.name : props.unit.name;
  editingName.value = true;
}
function commitRename() {
  if (editingName.value) {
    if (props.group) emit('renameGroup', props.group.gid, nameDraft.value);
    else emit('rename', nameDraft.value);
  }
  editingName.value = false;
}
function cancelRename() {
  editingName.value = false;
}

// 직사각형 비율 그룹 — 디지털(비율) + 피지컬(출판 규격, dpi 기반 실제 px 크기)
const RECT_DIGITAL = [
  { label: '16:9', v: 16 / 9 },
  { label: '9:16', v: 9 / 16 },
  { label: '4:5', v: 4 / 5 }, // IG
];
const RECT_PHYSICAL = [
  { label: 'A2', wmm: 420, hmm: 594 }, // §134 추가
  { label: 'A3', wmm: 297, hmm: 420 },
  { label: 'A4', wmm: 210, hmm: 297 },
  { label: 'A5', wmm: 148, hmm: 210 },
  { label: 'Letter', wmm: 215.9, hmm: 279.4 },
];
const dpi = ref(Number(localStorage.getItem('eo.dpi')) || 300);
// §123: dpi 필드도 공통 커밋 문법 — change = 커밋+플래시, Enter = 커밋+블러
const dpiFlash = ref(false);
let dpiFlashT = null;
function onDpi(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 36) dpi.value = Math.min(1200, Math.round(v));
  e.target.value = dpi.value;
  localStorage.setItem('eo.dpi', String(dpi.value));
  dpiFlash.value = false;
  requestAnimationFrame(() => {
    dpiFlash.value = true;
    clearTimeout(dpiFlashT);
    dpiFlashT = setTimeout(() => (dpiFlash.value = false), 220);
  });
}
function onDpiKey(e) {
  if (e.key === 'Enter') {
    onDpi(e);
    e.target.blur();
  }
}
function applyPhysical(pp) {
  const w = Math.round((pp.wmm * dpi.value) / 25.4);
  const h = Math.round((pp.hmm * dpi.value) / 25.4);
  emit('setSize', { W: w, H: h }, sizeEach.value);
}

// ─── px/cm 표기 단위 (rect 전용, §75) — 내부 저장은 항상 px, dpi 기준 환산 표시 ───
const isCm = computed(() => isFrame.value && p.value.unitMode === 'cm');
const unitSuffix = computed(() => (isCm.value ? 'cm' : 'px'));
const round2 = (n) => Math.round(n * 100) / 100;
const toDisp = (v) => (isCm.value ? round2((v * 2.54) / dpi.value) : v);
const fromDisp = (v) => (isCm.value ? (v * dpi.value) / 2.54 : v);
function setSizeField(key, v) {
  emit('setSize', { [key]: Math.round(fromDisp(v)) }, sizeEach.value);
}
// 그리드 컴프레션 (§132): 잠금 시 rows·cols 동기 편집
function setCompAxis(key, v) {
  if (p.value.compLock) {
    p.value.compX = v;
    p.value.compY = v;
  } else p.value[key] = v;
}
function setCompLock(v) {
  p.value.compLock = v === 'on';
  if (p.value.compLock) {
    // 켜는 순간 rows 기준으로 값·모드 통일 (§134)
    p.value.compX = p.value.compY;
    p.value.compModeX = p.value.compModeY;
  }
}
// §134: 축별 dir/sym — 잠금 시 양축 동기
function setCompMode(key, m) {
  if (p.value.compLock) {
    p.value.compModeX = m;
    p.value.compModeY = m;
  } else p.value[key] = m;
}
// §133: 프리셋 칩 — 유닛과 동일 비율 세트, 칩 값(rate) ↔ 슬라이더 값 상호 변환.
// rate = 1 + |v|/FRAME_COMP_SCALE·(FRAME_RATE_MAX-1) 의 역산. 칩은 현재 부호(방향/대칭) 유지.
const frameCompRate = (v) => 1 + (Math.abs(v) / FRAME_COMP_SCALE) * (FRAME_RATE_MAX - 1);
function setCompChip(key, rate) {
  const sign = p.value[key] < 0 ? -1 : 1;
  setCompAxis(key, sign * ((rate - 1) * FRAME_COMP_SCALE) / (FRAME_RATE_MAX - 1));
}
// 그리드 필드 (margin·gutter): 표시 단위 기준 클램프 → px 환산 저장
function setGridField(key, v, lo, hi) {
  p.value[key] = Math.round(fromDisp(Math.min(hi, Math.max(lo, v))));
}
// §309: 비대칭 마진 토글 — 켜는 순간 4방이 전부 균일값과 같으면(= 아직 커스텀 전) 현재 margin으로 시드
function setMarginAsym(on) {
  const q = p.value;
  if (on && ['marginT', 'marginR', 'marginB', 'marginL'].every((k) => q[k] == null || q[k] === q.marginT)) {
    q.marginT = q.margin; q.marginR = q.margin; q.marginB = q.margin; q.marginL = q.margin;
  }
  q.marginAsym = on;
}
// 단위 전환 — 각 단위의 그리드 기본값 적용 (px 20/20/20 ↔ cm 0.6/0.2/0.2, §76·§116)
function setUnitMode(mode) {
  if (p.value.unitMode === mode) return;
  p.value.unitMode = mode;
  if (mode === 'cm') {
    const cmToPx = (v) => Math.round((v * dpi.value) / 2.54);
    p.value.margin = cmToPx(0.6);
    p.value.gutterX = cmToPx(0.2);
    p.value.gutterY = cmToPx(0.2);
  } else {
    p.value.margin = 20;
    p.value.gutterX = 20;
    p.value.gutterY = 20;
  }
}

// stroke 색 (§110) — 공유 픽커 팝업(ColorField) + 최근 컬러, 적용 색은 recents에 편입(디바운스)
const { recentColors, commitRecentColor, removeRecentColor } = useRecentColors();
let strokeRecentTimer = null;
function setStrokeColor(c) {
  if (!c) return; // 빈 hex(기본 복귀)는 stroke 색엔 의미 없음 — 유지
  p.value.stroke = c;
  clearTimeout(strokeRecentTimer);
  strokeRecentTimer = setTimeout(() => commitRecentColor(c), 500);
}
</script>

<template>
  <div class="panel" @contextmenu.prevent>
    <header class="brand">
      <svg class="logo" viewBox="0 0 57.87 27.92" height="15" aria-hidden="true">
        <g class="logoFill">
          <path d="M27.66,12.58v-2.39h-6.65v-2.72l6.63-5.16V0H6.82c-.11,0-.22.04-.31.11L.02,5.25v2.2h6.63v2.73L0,15.34v2.39h6.65v2.72L.02,25.61v2.31h20.82c.11,0,.22-.04.31-.11l6.49-5.15v-2.2h-6.63v-2.73l6.65-5.16Z"/>
          <path d="M57.87,7.81L49.63.2h-10.55l-8.25,7.61v12.37s0,0,0,0l8.25,7.61h10.55l8.25-7.61s0,0,0,0V7.81s0,0,0,0ZM54.44,15.7h-5.21l-3.21,2.9v5.81h-3.34v-5.81l-3.21-2.9h-5.21v-3.4h5.21l3.21-2.9V3.58h3.34v5.81l3.21,2.9h5.21v3.4Z"/>
        </g>
      </svg>
      <span>GRAPHIC BUILDER</span>
    </header>

    <div v-if="unit" class="unitRow">
      <input
        v-if="editingName"
        v-focus
        class="nameInput"
        v-model="nameDraft"
        @keydown.enter="(e) => { if (!e.isComposing) commitRename(); }"
        @keydown.esc="cancelRename"
        @blur="cancelRename"
      />
      <span v-else class="unitName" title="Click to rename" @click="startRename">{{ group ? group.name : unit.name }}</span>
    </div>

    <template v-if="unit">
    <section>
      <div class="secHead">
        <h2 class="secH">Size</h2>
        <div class="headBtns"><!-- §265: 단위/each 토글 = 서브타이틀 바로 옆, 셰브론 = 행 끝 -->
          <!-- rect 전용 px/cm 표기 토글 — SIZE·RATIO·GRID 표기에 공통 적용 (§75) -->
          <div v-if="isFrame" class="unitSeg">
            <button :class="{ on: !isCm }" @click="setUnitMode('px')">px</button>
            <button :class="{ on: isCm }" @click="setUnitMode('cm')">cm</button>
          </div>
          <button
            v-if="selected.length >= 2"
            class="eachBtn" :class="{ on: eachMode }"
            title="Apply to each unit instead of the combined bounding box"
            @click="eachMode = !eachMode"
          >each</button>
        </div>
        <button class="foldTg foldEnd" :class="{ isFolded: fold[fkey('size')] }" @click="toggleFold(fkey('size'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('size')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button>
      </div>
      <NumberField
        :label="isFrame ? `width (${unitSuffix})` : 'width'" :model-value="toDisp(dispW)"
        :min="toDisp(LIMITS.unitMin)" :max="toDisp(UNIT_MAX)"
        :mixed="sizeEach && mixed('W')"
        @update:model-value="(v) => setSizeField('W', v)"
      />
      <NumberField
        :label="isFrame ? `height (${unitSuffix})` : 'height'" :model-value="toDisp(dispH)"
        :min="toDisp(LIMITS.unitMin)" :max="toDisp(UNIT_MAX)"
        :mixed="sizeEach && mixed('H')"
        @update:model-value="(v) => setSizeField('H', v)"
      />
      <!-- cm 모드: 환산 기준 dpi를 치수 바로 아래 배치 (§75) -->
      <div v-if="isCm" class="dpiRow dpiUnder">
        <label class="dpiWrap">
          <span>dpi</span>
          <input
            class="dpiInput" type="number" min="36" max="1200"
            :class="{ flash: dpiFlash }"
            :value="dpi" @change="onDpi" @keydown="onDpiKey"
          />
        </label>
      </div>
      <!-- §264: 유닛 Ratio 칩 폐지(패널 다이어트 — 사용자 확정). 프레임 규격 칩만 유지 -->
      <div v-if="isFrame" class="ratioHead">ratio</div>
      <!-- 직사각형: px 모드 = 디지털 비율 / cm 모드 = 출판 규격 + dpi (단위 토글로 태그 스왑, §75) -->
      <template v-if="isFrame">
        <div v-if="!isCm" class="ratioRow">
          <ChipRow
            :model-value="aspect" :chips="RECT_DIGITAL" :tol="ASPECT_TOL"
            @update:model-value="(v) => emit('setAspect', v, sizeEach)"
          />
        </div>
        <div v-else class="physRow">
          <button
            v-for="pp in RECT_PHYSICAL" :key="pp.label"
            class="physChip" @click="applyPhysical(pp)"
          >{{ pp.label }}</button>
        </div>
      </template>
    </section>

    <!-- 직사각형 전용 (§296: 순서 = GRID → STYLE, 사용자 확정) -->
    <template v-if="isFrame">
    <!-- 레이아웃 그리드 (내부 px 저장, 표기만 px/cm 환산). on/off 옵션 폐기 — 상시 표시 (§131) -->
    <section>
      <h2 class="secH">Grid<button class="foldTg" :class="{ isFolded: fold[fkey('grid')] }" @click="toggleFold(fkey('grid'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('grid')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
      <!-- §132 확정 순서: margin → gutter rows/cols → rows/cols → compression 블록 -->
      <!-- 조절 범위: px = margin 0-200·gutter 0-100 / cm = margin 0-5·gutter 0-2 (§76) -->
      <!-- §309: 비대칭 마진 — 교체형(A안): off = 균일 margin 1개 / on = T·R·B·L 4개로 교체
           (두 UI 동시 노출로 인한 혼동 원천 제거 — Grid Compression의 on/off 확장 문법) -->
      <Slider
        v-if="!p.marginAsym"
        :label="`margin (${unitSuffix})`" :model-value="toDisp(p.margin)"
        :min="0" :max="isCm ? 5 : 200" :step="isCm ? 0.01 : 1" :decimals="isCm ? 2 : 0"
        :arrow-step="isCm ? 0.01 : 5"
        @update:model-value="(v) => setGridField('margin', v, 0, isCm ? 5 : 200)"
      />
      <template v-else>
        <Slider
          v-for="mk in [['marginT', 'top margin'], ['marginR', 'right margin'], ['marginB', 'bottom margin'], ['marginL', 'left margin']]"
          :key="mk[0]"
          :label="`${mk[1]} (${unitSuffix})`" :model-value="toDisp(p[mk[0]])"
          :min="0" :max="isCm ? 5 : 200" :step="isCm ? 0.01 : 1" :decimals="isCm ? 2 : 0"
          :arrow-step="isCm ? 0.01 : 5"
          @update:model-value="(v) => setGridField(mk[0], v, 0, isCm ? 5 : 200)"
        />
      </template>
      <Toggle
        label="asymmetric margin" :model-value="p.marginAsym ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => setMarginAsym(v === 'on')"
      />
      <Slider
        :label="`row gutter (${unitSuffix})`" :model-value="toDisp(p.gutterY)"
        :min="0" :max="isCm ? 2 : 100" :step="isCm ? 0.01 : 1" :decimals="isCm ? 2 : 0"
        :arrow-step="isCm ? 0.01 : 5"
        @update:model-value="(v) => setGridField('gutterY', v, 0, isCm ? 2 : 100)"
      />
      <Slider
        :label="`col gutter (${unitSuffix})`" :model-value="toDisp(p.gutterX)"
        :min="0" :max="isCm ? 2 : 100" :step="isCm ? 0.01 : 1" :decimals="isCm ? 2 : 0"
        :arrow-step="isCm ? 0.01 : 5"
        @update:model-value="(v) => setGridField('gutterX', v, 0, isCm ? 2 : 100)"
      />
      <Slider label="rows" v-model="p.rows" :min="1" :max="12" :step="1" />
      <Slider label="cols" v-model="p.cols" :min="1" :max="12" :step="1" />
      <!-- 그리드 컴프레션 (§131): 유닛 컴프레션과 동일 부호 규약 (±2.5x, 0 균등) -->
      <Toggle
        label="grid compression" :model-value="p.compOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.compOn = v === 'on')"
      />
      <template v-if="p.compOn">
        <!-- §134: 축별 dir/sym — 별도 행 대신 슬라이더 라벨 옆 인라인 미니 세그 (UI 1행 절약) -->
        <div class="compSet">
          <Slider
            label="row compression" :model-value="p.compY"
            :min="-FRAME_COMP_SCALE" :max="FRAME_COMP_SCALE" :step="0.01" :arrow-step="0.1" :decimals="2"
            :snap-to="0" :snap-radius="0.1" suffix="x"
            @update:model-value="(v) => setCompAxis('compY', v)"
          >
            <template #aux>
              <span class="modeSeg">
                <button :class="{ on: p.compModeY === 'dir' }" title="Directional" @click="setCompMode('compModeY', 'dir')">
                  <svg class="segIco" viewBox="0 0 24 24"><path v-for="d in ICONS.compDir" :key="d" :d="d" /></svg>
                </button>
                <button :class="{ on: p.compModeY === 'sym' }" title="Symmetrical" @click="setCompMode('compModeY', 'sym')">
                  <svg class="segIco" viewBox="0 0 24 24"><path v-for="d in ICONS.compSym" :key="d" :d="d" /></svg>
                </button>
              </span>
            </template>
          </Slider>
          <ChipRow :model-value="frameCompRate(p.compY)" @update:model-value="(r) => setCompChip('compY', r)" />
        </div>
        <div class="compSet">
          <Slider
            label="col compression" :model-value="p.compX"
            :min="-FRAME_COMP_SCALE" :max="FRAME_COMP_SCALE" :step="0.01" :arrow-step="0.1" :decimals="2"
            :snap-to="0" :snap-radius="0.1" suffix="x"
            @update:model-value="(v) => setCompAxis('compX', v)"
          >
            <template #aux>
              <span class="modeSeg">
                <button :class="{ on: p.compModeX === 'dir' }" title="Directional" @click="setCompMode('compModeX', 'dir')">
                  <svg class="segIco" viewBox="0 0 24 24"><path v-for="d in ICONS.compDir" :key="d" :d="d" /></svg>
                </button>
                <button :class="{ on: p.compModeX === 'sym' }" title="Symmetrical" @click="setCompMode('compModeX', 'sym')">
                  <svg class="segIco" viewBox="0 0 24 24"><path v-for="d in ICONS.compSym" :key="d" :d="d" /></svg>
                </button>
              </span>
            </template>
          </Slider>
          <ChipRow :model-value="frameCompRate(p.compX)" @update:model-value="(r) => setCompChip('compX', r)" />
        </div>
        <!-- §132: 잠금 on = rows·cols 값+모드 동기화 (켜는 순간 rows 기준 통일) -->
        <Toggle
          label="sync row &amp; col compression" :model-value="p.compLock ? 'on' : 'off'" :options="ON_OFF"
          @update:model-value="setCompLock"
        />
      </template>
    </section>

    <!-- 렌더 스타일 — fill(면) / stroke(외곽선) 토글 (§75) -->
    <section>
      <h2 class="secH">Style<button class="foldTg" :class="{ isFolded: fold[fkey('style')] }" @click="toggleFold(fkey('style'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('style')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
      <!-- §110: fill/stroke 독립 on·off — stroke on일 때만 색·두께 확장 옵션 -->
      <Toggle
        label="fill" :model-value="p.fillOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.fillOn = v === 'on')"
      />
      <Toggle
        label="stroke" :model-value="p.strokeOn ? 'on' : 'off'" :options="ON_OFF"
        @update:model-value="(v) => (p.strokeOn = v === 'on')"
      />
      <template v-if="p.strokeOn">
        <!-- §133: width를 color 위로 -->
        <Slider label="stroke width" v-model="p.strokeW" :min="1" :max="100" :step="1" />
        <div class="strokeRow">
          <span class="rowLabel">stroke color</span>
          <ColorField
            :model-value="p.stroke" :recents="recentColors" side="right" :fallback="p.stroke"
            @update:model-value="setStrokeColor"
            @remove-recent="removeRecentColor"
          />
        </div>
      </template>
    </section>
    </template>

    <template v-if="!isFrame">
    <section>
      <h2 class="secH">Shape<button class="foldTg" :class="{ isFolded: fold[fkey('shape')] }" @click="toggleFold(fkey('shape'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('shape')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
      <Slider
        label="shaft size" v-model="p.dPct"
        :min="D_PCT_MIN" :max="D_PCT_MAX" :step="1" :arrow-step="5"
        prefix="Unit height ×" suffix="%" :mixed="mixed('dPct')"
      />
      <Slider
        label="thread top width" :model-value="aPct"
        :min="A_MIN * 100" :max="A_MAX * 100" :step="1" :arrow-step="5"
        suffix="%" :mixed="mixed('a')"
        @update:model-value="(v) => emit('setA', v / 100)"
      />
      <Slider
        label="thread bottom width" :model-value="bottomPct"
        :min="Math.round((1 - B_MAX) * 100)" :max="100" :step="1" :arrow-step="5"
        suffix="%" :mixed="mixed('b')"
        @update:model-value="(v) => emit('setB', 1 - v / 100)"
      />
      <Toggle
        label="thread sides" v-model="p.threads"
        :options="[
          { value: 'both', label: 'double' },
          { value: 'one', label: 'single' },
        ]"
      />
    </section>

    <section>
      <h2 class="secH">Grid<button class="foldTg" :class="{ isFolded: fold[fkey('grid')] }" @click="toggleFold(fkey('grid'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('grid')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
      <!-- §278: 용어 교체 — cols → threads · §305: Thread Amount (파라미터 키는 cols 유지) -->
      <Slider
        label="thread amount" v-model="p.cols"
        :min="COLS_MIN" :max="COLS_MAX" :step="1"
        :mixed="mixed('cols')"
      />
      <div class="compSet">
        <Slider
          label="thread compression" :model-value="compVal"
          :min="-COMP_SCALE" :max="COMP_SCALE" :step="0.01" :arrow-step="0.05" :decimals="2"
          :snap-to="0" :snap-radius="COMP_SNAP" suffix="x"
          :mixed="mixed('rate', 'direction')"
          @update:model-value="setComp"
        />
        <ChipRow v-model="p.rate">
          <!-- §264: ± 전환 — 수치(rate) 유지한 채 압축 방향만 반전 -->
          <button
            class="pmChip" title="Flip compression direction (keep value)"
            @click="p.direction = p.direction === 'StoL' ? 'LtoS' : 'StoL'"
          >±</button>
        </ChipRow>
      </div>
      <!-- §273: gutter mode 토글 숨김 — fixed로 통일 (proportional·g는 데이터만 유지) -->
      <Slider
        label="gutter" v-model="p.gutterPx"
        :min="GUTTER_MIN" :max="Math.floor(Math.min(GUTTER_MAX, gutterMax))" :step="1" :arrow-step="5"
        :mixed="mixed('gutterPx')"
      />
    </section>
    <!-- §264: ANIMATION 섹션 — offset 묶음 승격 (조건부 표시 폐기, 접기로 대체) -->
    <section>
      <h2 class="secH">Animation<button class="foldTg" :class="{ isFolded: fold[fkey('anim')] }" @click="toggleFold(fkey('anim'))"><svg viewBox="0 0 24 24"><path :d="fold[fkey('anim')] ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'" /></svg></button></h2>
      <div class="offsetSet">
        <!-- §274: 순서 = offset → grow (사용자 확정 — §265 순서 교체).
             §273: offset mode 토글 숨김 — step으로 통일 (flow 로직·데이터는 유지) -->
        <Slider
          label="offset" v-model="p.offset"
          :min="-12" :max="12" :step="0.01" :arrow-step="1" :decimals="2"
          :snap-to="0" :snap-radius="0.08"
          :mixed="mixed('offset')"
        />
        <!-- grow = 논리 파라미터: 스레드 생산·offset 흐름이 compression과 같은 쪽(+)인지 반대쪽(−)인지 -->
        <Toggle
          label="thread driving direction" :model-value="p.grow ?? 'r'"
          :options="[{ value: 'r', label: '+' }, { value: 'l', label: '−' }]"
          @update:model-value="(v) => { p.grow = v; }"
        />
      </div>
    </section>

    </template>

    <!-- §264: 다중 링크 행 UI — 그룹 번호 목록/범주 지정은 App(문서 전역) 경유 -->
    <!-- §278: 단일 유닛 선택에서도 상시 표시 (사용자 확정) — 프레임 단독은 종전대로 링크 시에만 -->
    <LinkSection
      v-if="selected.length >= 2 || singleLinked || (selected.length === 1 && scopeChipsVisible)"
      :linked="linked"
      :rows-visible="scopeChipsVisible"
      :single="singleLinked"
      :selected="selected"
      @link="(scope) => emit('link', scope)"
      @set-cat-link="(cat, v) => emit('setCatLink', cat, v)"
      @unlink-one="emit('unlinkOne')"
      @hover-cat="(c) => emit('hoverCat', c)"
    />
    </template>

    <!-- §207: 문서가 비어 활성 유닛이 없을 때만 — 프리셋 브라우저는 우하단 프리셋 바로 이관 -->
    <div v-else class="noSel">
      <p>Nothing to edit yet</p>
      <p class="hint">Place a unit from Unit presets (bottom right) or draw a frame (F)</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel { display: flex; flex-direction: column; gap: var(--sp-section); }
.brand {
  display: flex; align-items: center; gap: 9px;
  // §218: L1 브랜드 — 전역 유일 최고위계 (16 bold 캡스)
  font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: 0em; color: var(--text);
  padding: 2px 2px 12px; border-bottom: 1px solid var(--line);
}
.logo { flex-shrink: 0; }
.logoFill { fill: var(--accent); }
/* §273: 이름 행 → 첫 섹션 간격 = --sp-head (패널 gap 26 위에 차액 가산) — 섹션 간보다 한 단계 큰 위계 */
.unitRow { display: flex; justify-content: space-between; align-items: center; margin-bottom: calc(var(--sp-head) - var(--sp-section)); }
.ratioHead {
  font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  color: var(--dim); margin-bottom: 6px;
  text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
}
.ratioRow { display: flex; align-items: flex-start; gap: 6px; }
.ratioRow :deep(.chips) { margin-bottom: 0; }
.unitName { font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--text); cursor: text; } /* §218: L2 */
.unitName:hover { color: var(--accent); }
.nameInput {
  @include text-field;
  border-color: var(--accent); padding: 2px 6px; flex: 1;
}
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: var(--fw-semibold);
  margin: 0 0 12px; /* §138: 14→12 */
}
/* §138: 섹션 마지막 컨트롤의 트레일링 마진 제거 — 섹션 간 체감 간격을 --sp-section으로 통일
   (기존엔 SIZE만 개별 오버라이드로 0이라 26 vs 38px 불일치) */
section > :last-child { margin-bottom: 0; }
/* §138: 슬라이더+프리셋 칩 세트 — 내부 6px로 묶고 세트 단위 10px 리듬 */
/* §264: 섹션 접기 — 헤더 우측 셰브론, :has로 바디 숨김 */
.secH { display: flex; align-items: center; justify-content: space-between; }
.foldTg {
  border: none; background: none; cursor: pointer; padding: 0;
  width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
  svg { width: 12px; height: 12px; fill: none; stroke: var(--faint); stroke-width: 2; stroke-linecap: square; }
  &:hover svg { stroke: var(--accent); }
}
/* §265: 헤더가 래퍼(.secHead) 안에 있는 섹션(Size)도 커버 — 헤더류만 남기고 바디 숨김 */
section:has(.foldTg.isFolded) > :not(.secH):not(.secHead) { display: none; }
.foldEnd { margin-left: auto; }
/* §264: 압축 ± 전환 칩 — ChipRow 칩과 동일 문법 */
.pmChip {
  @include bordered-control;
  padding: 0 9px; min-width: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--faint);
  font-size: 15px; font-weight: var(--fw-semibold); line-height: 1; /* §266: ± 기호 가독 확대 */
  &:hover { color: var(--accent); border-color: var(--accent); }
}
.compSet { margin-bottom: var(--sp-group); } /* §271 */
/* §263: offset 묶음 — 압축 칩과 간격 분리(상단 gap) + 내부 행 간격 */
.offsetSet { margin: var(--sp-1) 0 var(--sp-group); display: flex; flex-direction: column; gap: var(--sp-row); } /* §271 */
.compSet :deep(.row) { margin-bottom: var(--sp-row); } /* §271 */
/* §273: 압축 프리셋 칩 = 6열 그리드로 행 100% 채움 (11칩+± = 정확히 2행) */
.compSet :deep(.chips) {
  margin-bottom: 0;
  display: grid; grid-template-columns: repeat(6, 1fr); width: 100%;
}
.compSet :deep(.chip), .compSet .pmChip { min-width: 0; padding: 0 2px; }
// §139·§140: 고정 높이 — each/px·cm 버튼 유무와 무관하게 헤더 총높이 25px(21+4) 불변 (밀림 방지).
// 버튼 세로폭은 Toggle 세그와 동일(§140) — 늘어난 만큼 하단 마진에서 상쇄해 행간 유지.
.secHead {
  display: flex; align-items: center; gap: var(--sp-group); /* §265·§271 */
  height: 21px; margin-bottom: 4px;
  h2 { margin: 0; }
}
.physRow { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.dpiRow { margin-top: 8px; }
// 치수 바로 아래 dpi — NumberField 행과 동일한 좌라벨/우입력 정렬
.dpiUnder {
  margin: 0 0 10px;
  .dpiWrap { justify-content: space-between; margin-left: 0; }
}
.physChip {
  @include bordered-control;
  font-size: var(--fs-xs); padding: 0 9px;
  height: 21px; display: inline-flex; align-items: center; // §141: 토글 세그와 동일 세로폭
  &:hover { border-color: var(--accent); color: var(--accent); }
}
.dpiWrap {
  display: flex; align-items: center; gap: 5px; margin-left: 4px;
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); color: var(--dim);
  text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
}
// NumberField 입력과 동일 규격 (W/H 행과 가로 정렬, §76)
.dpiInput {
  @include text-field;
  text-transform: none; /* §216: 입력값은 캡 상속 차단 */
  width: 58px; padding: 3px 8px; text-align: right;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &.flash { animation: dpiPulse 0.2s ease-out; }
}
@keyframes dpiPulse {
  0% { border-color: var(--accent); background: var(--hover-bg); }
  100% { border-color: var(--line); background: none; }
}
.eachBtn {
  @include bordered-control; // §216: 버튼 타이포 단일화 — fs-xs·ls-base (2xs·wide 개별값 폐기)
  padding: 3px 9px; height: 21px; // §140: Toggle 세그(컨테이너 보더 포함 21px)와 동일 세로폭
  &.on { border-color: var(--accent); color: var(--accent); }
}
.headBtns { display: flex; align-items: center; gap: 6px; }
// px/cm 세그먼트 토글 — eachBtn과 동일 문법의 2분할 칩
.unitSeg {
  display: flex;
  button {
    @include bordered-control; // §216: 버튼 타이포 단일화 — fs-xs·ls-base
    padding: 3px 9px; height: 21px; // §140: Toggle 세그와 동일 세로폭
    &:first-child { border-radius: var(--radius) 0 0 var(--radius); border-right-width: 0; }
    &:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
    &.on { border-color: var(--accent); color: var(--accent); }
    &.on + button { border-left-color: var(--accent); }
  }
}
.strokeRow { position: relative; display: flex; align-items: center; gap: 6px; margin-bottom: var(--sp-group); } /* §271 */
// §134·§135·§142: comp dir/sym 인라인 미니 세그 — Toggle .seg와 동일 문법 (활성 = active-outline-inset).
// §142: 텍스트 대신 스트로크 화살표 아이콘(→ / ↔), 두 버튼 동일 폭·기존 높이(19px+보더) 유지
.modeSeg {
  display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius);
  button {
    border: none; background: none; color: var(--faint); cursor: pointer;
    width: 28px; height: 19px;
    display: inline-flex; align-items: center; justify-content: center; padding: 0;
    &:not(:last-child) { border-right: 1px solid var(--line); }
    &.on { @include active-outline-inset; }
    &:hover { color: var(--accent); }
  }
}
.segIco {
  width: 12px; height: 12px;
  fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: square; stroke-linejoin: miter;
}
.rowLabel {
  font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  color: var(--dim); flex: 1;
  text-transform: capitalize; /* §216: 이니셜 캡 = 전 단어 */
}
.colorPrev {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 1px solid var(--line); border-radius: 2px;
}
.hexInput {
  @include text-field;
  width: 68px; padding: 3px 6px; text-align: right;
}
// §207: 빈 문서 상태 안내 (프리셋 브라우저는 우하단으로 이관)
.noSel {
  p { margin: 0 0 8px; font-size: var(--fs-sm); color: var(--text); } /* L4 */
  .hint { font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint); line-height: 1.6; } /* §218: L6 */
}
</style>
