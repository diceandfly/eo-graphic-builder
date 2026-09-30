<script setup>
import { ref, computed, watch } from 'vue';
import Toggle from '../controls/Toggle.vue';
import UnitGraphic from '../stage/UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';

// 패턴 브라우저 (§205) — 패턴 매니저(우하단) 플로팅 패널 본문.
// PresetBrowser와 동일 문법: 썸네일 2열/리스트 토글, 검색, 인라인 이름변경,
// × 2클릭 삭제, 우클릭 메뉴(Rename/Delete), JSON 입출력.
const props = defineProps({
  patterns: { type: Array, default: () => [] },
});
const emit = defineEmits([
  'placePattern', 'deletePattern', 'renamePattern', 'exportPatterns', 'importPatterns',
]);

const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

const patternView = ref(localStorage.getItem('eo.patternView') || 'thumbs');
watch(patternView, (v) => localStorage.setItem('eo.patternView', v));

// 이름 검색 (유닛 프리셋 브라우저와 동일 디자인)
const q = ref('');
const filtered = computed(() => {
  const t = q.value.trim().toLowerCase();
  return t ? props.patterns.filter((p) => p.name.toLowerCase().includes(t)) : props.patterns;
});

const editing = ref(null); // { id, draft }
function startRename(p) {
  editing.value = { id: p.id, draft: p.name };
}
function commitName(e) {
  if (e && e.isComposing) return;
  if (editing.value) emit('renamePattern', editing.value.id, editing.value.draft);
  editing.value = null;
}

const menu = ref(null); // { x, y, p } — 뷰포트(fixed) 좌표
function openMenu(p, e) {
  menu.value = { x: e.clientX, y: e.clientY, p };
}
function closeMenu() {
  menu.value = null;
}
watch(menu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeMenu, { once: true }), 0);
});

// 삭제 2단계 확인 (§102 문법)
const armedDel = ref(null);
let armTimer = null;
function onDelClick(p) {
  clearTimeout(armTimer);
  if (armedDel.value === p.id) {
    armedDel.value = null;
    emit('deletePattern', p.id);
  } else {
    armedDel.value = p.id;
    armTimer = setTimeout(() => (armedDel.value = null), 3000);
  }
}

const fileEl = ref(null);
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('importPatterns', f);
  e.target.value = '';
}
</script>

<template>
  <section>
    <div class="secHead">
      <h2>Pattern Presets</h2>
      <Toggle
        class="viewToggle" v-model="patternView"
        :options="[{ value: 'thumbs', label: 'thumbs' }, { value: 'list', label: 'list' }]"
      />
    </div>
    <input
      v-if="patterns.length > 1"
      v-model="q" class="pSearch" type="text" placeholder="search" spellcheck="false"
    />
    <div v-if="!patterns.length" class="pEmpty">right-click a frame to register a pattern</div>
    <div v-else-if="!filtered.length" class="pEmpty">no patterns match "{{ q }}"</div>
    <div v-else-if="patternView === 'thumbs'" class="pGrid">
      <div
        v-for="p in filtered" :key="p.id" class="pCard"
        @click="emit('placePattern', p)"
        @contextmenu.prevent.stop="openMenu(p, $event)"
      >
        <svg class="pThumb" :viewBox="`0 0 ${p.frame.W} ${p.frame.H}`">
          <rect
            :width="p.frame.W" :height="p.frame.H"
            :fill="frameAttrs(p.frame).fill" :stroke="frameAttrs(p.frame).stroke"
            :stroke-width="frameAttrs(p.frame).strokeW"
          />
          <g v-for="(u, i) in p.units" :key="i" :transform="`translate(${u.dx} ${u.dy})`">
            <UnitGraphic :params="u.params" :seam-width="0.75" />
          </g>
        </svg>
        <input
          v-if="editing?.id === p.id"
          v-focus class="pNameInput" v-model="editing.draft"
          @click.stop @pointerdown.stop
          @keydown.enter="commitName"
          @keydown.esc="editing = null"
          @blur="editing = null"
        />
        <div v-else class="pName" title="click to rename" @click.stop="startRename(p)">{{ p.name }}</div>
        <button
          class="pDel" :class="{ armed: armedDel === p.id }"
          :title="armedDel === p.id ? 'click again to delete' : 'delete pattern'"
          @click.stop="onDelClick(p)"
        >×</button>
      </div>
    </div>
    <div v-else class="pList">
      <div
        v-for="p in filtered" :key="p.id" class="pRow"
        @click="emit('placePattern', p)"
        @contextmenu.prevent.stop="openMenu(p, $event)"
      >
        <svg class="pMini" :viewBox="`0 0 ${p.frame.W} ${p.frame.H}`">
          <rect
            :width="p.frame.W" :height="p.frame.H"
            :fill="frameAttrs(p.frame).fill" :stroke="frameAttrs(p.frame).stroke"
            :stroke-width="frameAttrs(p.frame).strokeW"
          />
          <g v-for="(u, i) in p.units" :key="i" :transform="`translate(${u.dx} ${u.dy})`">
            <UnitGraphic :params="u.params" :seam-width="0.75" />
          </g>
        </svg>
        <input
          v-if="editing?.id === p.id"
          v-focus class="pNameInput" v-model="editing.draft"
          @click.stop @pointerdown.stop
          @keydown.enter="commitName"
          @keydown.esc="editing = null"
          @blur="editing = null"
        />
        <span v-else class="pName" title="click to rename" @click.stop="startRename(p)">{{ p.name }}</span>
        <button
          class="pDel" :class="{ armed: armedDel === p.id }"
          :title="armedDel === p.id ? 'click again to delete' : 'delete pattern'"
          @click.stop="onDelClick(p)"
        >×</button>
      </div>
    </div>
  </section>
  <div class="pIoRow">
    <button class="pIoBtn" @click="emit('exportPatterns')">export json</button>
    <button class="pIoBtn" @click="fileEl.click()">import json</button>
    <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
  </div>

  <!-- 우클릭 메뉴 -->
  <div
    v-if="menu"
    class="pMenu"
    :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <button class="pMenuItem" @click="startRename(menu.p); closeMenu()">Rename</button>
    <button class="pMenuItem" @click="emit('deletePattern', menu.p.id); closeMenu()">Delete</button>
  </div>
</template>

<style scoped lang="scss">
// PresetBrowser와 동일 문법 (§205) — 클래스·치수 일치 유지
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: var(--fw-semibold);
  margin: 0 0 14px;
}
.secHead { display: flex; justify-content: space-between; align-items: baseline; }
.viewToggle { margin-bottom: 0; }
.pSearch {
  @include text-field;
  width: 100%; box-sizing: border-box; font-size: var(--fs-xs);
  padding: 4px 8px; margin-bottom: 10px;
}
.pEmpty {
  font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base);
  border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 16px 12px; text-align: center;
}
.pGrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.pCard {
  position: relative; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 6px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
// 패턴 썸네일은 프레임 비율 유지 (유닛 프리셋의 정사각과 달리 가로형이 일반적)
.pThumb {
  display: block; width: 100%; aspect-ratio: 16 / 10;
  background: var(--stage-bg); border-radius: var(--radius);
}
.pList { display: flex; flex-direction: column; gap: 6px; }
.pRow {
  position: relative; display: flex; align-items: center; gap: 10px; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
.pMini { width: 34px; height: 26px; flex-shrink: 0; background: var(--bg); border-radius: var(--radius); }
.pName {
  font-size: var(--fs-xs); color: var(--text); margin-top: 6px; cursor: text;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pName:hover { color: var(--accent); }
.pRow .pName { margin-top: 0; }
.pNameInput {
  @include text-field;
  border-color: var(--accent); padding: 1px 5px; margin-top: 4px; width: 100%;
  font-size: var(--fs-xs);
}
.pRow .pNameInput { margin-top: 0; flex: 1; min-width: 0; }
.pDel {
  position: absolute; top: 3px; right: 3px; opacity: 0;
  border: none; background: var(--panel); color: var(--faint);
  font: inherit; font-size: var(--fs-sm); line-height: 1; padding: 1px 5px;
  border-radius: var(--radius); cursor: pointer;
  &:hover { color: var(--danger); }
  &.armed { opacity: 1; color: var(--danger); background: var(--danger-bg); }
}
.pMenu {
  position: fixed; z-index: 30;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 4px; display: flex; flex-direction: column;
}
.pMenuItem {
  border: none; background: none; color: var(--text); cursor: pointer;
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  padding: 6px 10px; text-align: left; border-radius: var(--radius); white-space: nowrap;
  &:hover { color: var(--accent); }
}
.pIoRow { display: flex; gap: 6px; margin-top: 12px; }
.pIoBtn {
  @include bordered-control;
  flex: 1; font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  padding: 5px 0;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
