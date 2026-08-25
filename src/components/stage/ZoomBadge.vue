<script setup>
import { computed, ref, watch } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';
import { STAGE_GRID_MIN, STAGE_GRID_MAX } from '../../geometry/constants.js';

// 우하단 코너 바 — 바운딩박스 / 캔버스 그리드 / 유닛 그리드 토글 + 줌%
// 캔버스 그리드 버튼 우클릭 → 격자 크기(정방형)·그리드 스냅 메뉴 (스포이드 스코프 메뉴와 동일 UX)
const props = defineProps({
  scale: Number, guides: Boolean, stageGrid: Boolean, bbox: Boolean,
  gridCfg: Object, // { size, snap } — reactive 스토어 (깊은 변경으로 직접 편집)
});
defineEmits(['reset', 'toggleGuides', 'toggleStageGrid', 'toggleBbox']);
const pct = computed(() => Math.round(props.scale * 100));

// 그리드 설정 메뉴 (5초 무조작 시 자동 닫힘)
const menuOpen = ref(false);
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeMenu, 5000);
}
function onGridContext(e) {
  e.preventDefault();
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) resetIdle();
}
function closeMenu() {
  clearTimeout(idleTimer);
  menuOpen.value = false;
}
watch(menuOpen, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeMenu, { once: true }), 0);
});
function onSize(e) {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v > 0) {
    props.gridCfg.size = Math.min(STAGE_GRID_MAX, Math.max(STAGE_GRID_MIN, Math.round(v)));
  }
  e.target.value = props.gridCfg.size;
}
</script>

<template>
  <div class="corner">
    <FloatingBar>
      <IconButton
        :paths="ICONS.boxSelect" :active="bbox" tip-align="right"
        :tip="bbox ? 'Hide Bounding Box' : 'Show Bounding Box'"
        @click="$emit('toggleBbox')"
      />
      <div class="gridWrap">
        <IconButton
          :paths="ICONS.canvasGrid" :active="stageGrid" tip-align="right"
          :tip="menuOpen ? '' : stageGrid ? 'Hide Canvas Grid' : 'Show Canvas Grid'"
          @click="$emit('toggleStageGrid')"
          @contextmenu="onGridContext"
        />
        <div
          v-if="menuOpen && gridCfg"
          class="menu"
          @pointerdown.stop="resetIdle"
          @pointermove="resetIdle"
          @change="resetIdle"
        >
          <div class="menuTitle">Canvas grid</div>
          <label class="menuRow">
            <span>Size (px)</span>
            <input
              class="sizeInput" type="number"
              :min="STAGE_GRID_MIN" :max="STAGE_GRID_MAX"
              :value="gridCfg.size" @change="onSize"
            />
          </label>
          <label class="menuRow">
            <input type="checkbox" v-model="gridCfg.snap" />
            <span>Snap to grid</span>
          </label>
        </div>
      </div>
      <IconButton
        :paths="ICONS.unitGrid" :active="guides" tip-align="right"
        :tip="guides ? 'Hide Unit Grid' : 'Show Unit Grid'"
        @click="$emit('toggleGuides')"
      />
      <IconButton class="zoom" tip="Reset zoom (100%)" tip-align="right" @click="$emit('reset')">
        {{ pct }}%
      </IconButton>
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
.corner { position: absolute; right: var(--sp-6); bottom: var(--sp-6); }
.zoom { width: var(--zoom-w); font-variant-numeric: tabular-nums; }
.gridWrap { position: relative; }
.menu {
  position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.menuTitle {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  color: var(--faint); margin-bottom: 2px;
}
.menuRow {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--text); cursor: pointer; white-space: nowrap;
}
.sizeInput {
  @include text-field;
  width: 52px; padding: 2px 6px; text-align: right;
}
</style>
