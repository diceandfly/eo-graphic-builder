<script setup>
import { ref, watch } from 'vue';
import Toggle from '../controls/Toggle.vue';
import UnitGraphic from '../stage/UnitGraphic.vue';

// 프리셋 브라우저 — 선택 없음 상태의 패널 본문 (§68 부채 ③: ControlPanel에서 분리).
// 썸네일/리스트 뷰, 인라인 이름 편집, 우클릭 메뉴(Export/Rename/Delete), JSON 입출력.
defineProps({
  presets: { type: Array, default: () => [] },
});
const emit = defineEmits([
  'placePreset', 'deletePreset', 'renamePreset', 'exportPreset', 'exportPresets', 'importPresets',
]);

// 동적 삽입 input 포커스
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

// 뷰 모드 (썸네일 2컬럼 / 리스트) — localStorage 영속
const presetView = ref(localStorage.getItem('eo.presetView') || 'thumbs');
watch(presetView, (v) => localStorage.setItem('eo.presetView', v));

// 이름 인라인 편집 (Default는 고정)
const editingPreset = ref(null); // { id, draft }
function startPresetRename(p) {
  if (p.id === 'default') return;
  editingPreset.value = { id: p.id, draft: p.name };
}
function commitPresetName(e) {
  if (e && e.isComposing) return;
  if (editingPreset.value) emit('renamePreset', editingPreset.value.id, editingPreset.value.draft);
  editingPreset.value = null;
}

// 우클릭 메뉴 — 추출(Export SVG)·이름변경·삭제 (Default는 추출·삭제 시 안내)
const presetMenu = ref(null); // { x, y, p } — 뷰포트(fixed) 좌표
function openPresetMenu(p, e) {
  presetMenu.value = { x: e.clientX, y: e.clientY, p };
}
function closePresetMenu() {
  presetMenu.value = null;
}
watch(presetMenu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closePresetMenu, { once: true }), 0);
});

// JSON 입출력
const presetFileEl = ref(null);
function onPresetFile(e) {
  const f = e.target.files[0];
  if (f) emit('importPresets', f);
  e.target.value = '';
}
</script>

<template>
  <section>
    <div class="secHead">
      <h2>Unit Presets</h2>
      <Toggle
        class="viewToggle" v-model="presetView"
        :options="[{ value: 'thumbs', label: 'thumbs' }, { value: 'list', label: 'list' }]"
      />
    </div>
    <div v-if="!presets.length" class="pEmpty">right-click a unit to register a preset</div>
    <div v-else-if="presetView === 'thumbs'" class="pGrid">
      <div
        v-for="p in presets" :key="p.id" class="pCard"
        @click="emit('placePreset', p)"
        @contextmenu.prevent.stop="openPresetMenu(p, $event)"
      >
        <svg class="pThumb" :viewBox="`0 0 ${p.params.W} ${p.params.H}`">
          <UnitGraphic :params="p.params" />
        </svg>
        <input
          v-if="editingPreset?.id === p.id"
          v-focus class="pNameInput" v-model="editingPreset.draft"
          @click.stop @pointerdown.stop
          @keydown.enter="commitPresetName"
          @keydown.esc="editingPreset = null"
          @blur="editingPreset = null"
        />
        <div
          v-else class="pName"
          :title="p.id === 'default' ? '' : 'click to rename'"
          @click.stop="startPresetRename(p)"
        >{{ p.name }}</div>
        <button
          class="pDel" title="delete preset"
          @click.stop="emit('deletePreset', p.id)"
        >×</button>
      </div>
    </div>
    <div v-else class="pList">
      <div
        v-for="p in presets" :key="p.id" class="pRow"
        @click="emit('placePreset', p)"
        @contextmenu.prevent.stop="openPresetMenu(p, $event)"
      >
        <svg class="pMini" :viewBox="`0 0 ${p.params.W} ${p.params.H}`">
          <UnitGraphic :params="p.params" />
        </svg>
        <input
          v-if="editingPreset?.id === p.id"
          v-focus class="pNameInput" v-model="editingPreset.draft"
          @click.stop @pointerdown.stop
          @keydown.enter="commitPresetName"
          @keydown.esc="editingPreset = null"
          @blur="editingPreset = null"
        />
        <span
          v-else class="pName"
          :title="p.id === 'default' ? '' : 'click to rename'"
          @click.stop="startPresetRename(p)"
        >{{ p.name }}</span>
        <button
          class="pDel" title="delete preset"
          @click.stop="emit('deletePreset', p.id)"
        >×</button>
      </div>
    </div>
  </section>
  <!-- 프리셋 라이브러리 JSON 입출력 — 패널 최하단 -->
  <div class="pIoRow">
    <button class="pIoBtn" @click="emit('exportPresets')">export json</button>
    <button class="pIoBtn" @click="presetFileEl.click()">import json</button>
    <input ref="presetFileEl" type="file" accept=".json,application/json" hidden @change="onPresetFile" />
  </div>

  <!-- 우클릭 메뉴 -->
  <div
    v-if="presetMenu"
    class="pMenu"
    :style="{ left: presetMenu.x + 'px', top: presetMenu.y + 'px' }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <button class="pMenuItem" @click="emit('exportPreset', presetMenu.p); closePresetMenu()">Export SVG</button>
    <button
      v-if="presetMenu.p.id !== 'default'"
      class="pMenuItem" @click="startPresetRename(presetMenu.p); closePresetMenu()"
    >Rename</button>
    <button
      class="pMenuItem" @click="emit('deletePreset', presetMenu.p.id); closePresetMenu()"
    >Delete</button>
  </div>
</template>

<style scoped lang="scss">
section h2 {
  font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
  color: var(--accent); font-weight: 600;
  margin: 0 0 14px;
}
.secHead { display: flex; justify-content: space-between; align-items: baseline; }
.viewToggle { margin-bottom: 0; }
.pEmpty {
  font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base);
  border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 16px 12px; text-align: center;
}
.pGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pCard {
  position: relative; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 6px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
.pThumb { display: block; width: 100%; height: auto; background: var(--bg); border-radius: var(--radius); }
.pList { display: flex; flex-direction: column; gap: 6px; }
.pRow {
  position: relative; display: flex; align-items: center; gap: 10px; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
.pMini { width: 34px; height: 26px; flex-shrink: 0; background: var(--bg); border-radius: var(--radius); }
.pName { font-size: var(--fs-xs); color: var(--text); margin-top: 4px; cursor: text; }
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
}
.pMenu {
  position: fixed; z-index: 20;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 4px; display: flex; flex-direction: column;
}
.pMenuItem {
  border: none; background: none; color: var(--text); cursor: pointer;
  font-family: inherit; font-size: var(--fs-xs); letter-spacing: var(--ls-base);
  padding: 6px 10px; text-align: left; border-radius: var(--radius); white-space: nowrap;
  &:hover { color: var(--accent); }
}
.pIoRow { display: flex; gap: 6px; }
.pIoBtn {
  @include bordered-control;
  flex: 1; font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  padding: 5px 0;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
