<script setup>
import { ref, computed, watch } from 'vue';

// 공용 프리셋 그리드 브라우저 (§207) — 유닛/패턴 프리셋 플로팅 패널이 공유하는 본문.
// 헤더(타이틀 + 우측 검색) / 자동 열 썸네일 그리드(스크롤) / 하단 고정 JSON 입출력.
// 썸네일 내용은 #thumb 슬롯(호스트가 svg 렌더 제공). protectedId 항목은 이름변경 불가
// (삭제 시도는 emit — 호스트가 안내 담당), showExportSvg면 우클릭 메뉴에 Export SVG.
const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, default: () => [] },
  emptyText: { type: String, default: 'nothing registered yet' },
  protectedId: { default: null },
  showExportSvg: Boolean,
  viewBoxOf: { type: Function, required: true }, // item → svg viewBox 문자열
});
const emit = defineEmits(['place', 'remove', 'rename', 'exportJson', 'importJson', 'exportSvg']);

const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

// 이름 검색 — 타이틀 행 우측 (§207)
const q = ref('');
const filtered = computed(() => {
  const t = q.value.trim().toLowerCase();
  return t ? props.items.filter((p) => p.name.toLowerCase().includes(t)) : props.items;
});

const editing = ref(null); // { id, draft }
function startRename(p) {
  if (p.id === props.protectedId) return;
  editing.value = { id: p.id, draft: p.name };
}
function commitName(e) {
  if (e && e.isComposing) return;
  if (editing.value) emit('rename', editing.value.id, editing.value.draft);
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
    emit('remove', p.id);
  } else {
    armedDel.value = p.id;
    armTimer = setTimeout(() => (armedDel.value = null), 3000);
  }
}

const fileEl = ref(null);
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('importJson', f);
  e.target.value = '';
}
</script>

<template>
  <div class="browser">
    <div class="secHead">
      <h2>{{ title }}</h2>
      <input v-model="q" class="pSearch" type="text" placeholder="search" spellcheck="false" />
    </div>
    <div class="gridArea">
      <div v-if="!items.length" class="pEmpty">{{ emptyText }}</div>
      <div v-else-if="!filtered.length" class="pEmpty">no matches for "{{ q }}"</div>
      <div v-else class="pGrid">
        <div
          v-for="p in filtered" :key="p.id" class="pCard"
          @click="emit('place', p)"
          @contextmenu.prevent.stop="openMenu(p, $event)"
        >
          <svg class="pThumb" :viewBox="viewBoxOf(p)">
            <slot name="thumb" :item="p" />
          </svg>
          <input
            v-if="editing?.id === p.id"
            v-focus class="pNameInput" v-model="editing.draft"
            @click.stop @pointerdown.stop
            @keydown.enter="commitName"
            @keydown.esc="editing = null"
            @blur="editing = null"
          />
          <div
            v-else class="pName"
            :title="p.id === protectedId ? '' : 'click to rename'"
            @click.stop="startRename(p)"
          >{{ p.name }}</div>
          <button
            class="pDel" :class="{ armed: armedDel === p.id }"
            :title="armedDel === p.id ? 'click again to delete' : 'delete'"
            @click.stop="onDelClick(p)"
          >×</button>
        </div>
      </div>
    </div>
    <div class="pIoRow">
      <button class="pIoBtn" @click="emit('exportJson')">export json</button>
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
      <button v-if="showExportSvg" class="pMenuItem" @click="emit('exportSvg', menu.p); closeMenu()">Export SVG</button>
      <button
        v-if="menu.p.id !== protectedId"
        class="pMenuItem" @click="startRename(menu.p); closeMenu()"
      >Rename</button>
      <button class="pMenuItem" @click="emit('remove', menu.p.id); closeMenu()">Delete</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 호스트 플로팅 패널을 세로로 꽉 채움 — 그리드만 스크롤, 헤더/IO는 고정
.browser { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.secHead {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  margin-bottom: 12px;
  h2 {
    font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--ls-caps);
    color: var(--accent); font-weight: var(--fw-semibold); margin: 0; white-space: nowrap;
  }
}
.pSearch {
  @include text-field;
  width: 150px; box-sizing: border-box; font-size: var(--fs-xs);
  padding: 4px 8px;
}
.gridArea {
  flex: 1; min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.pEmpty {
  font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base);
  border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 16px 12px; text-align: center;
}
// 열 수 = 패널 폭 자동 (카드 최소폭 120px ≈ 메인 패널 카드 스케일 → 기본 폭에서 4열)
.pGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.pCard {
  position: relative; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 6px;
  &:hover { border-color: var(--accent); }
  &:hover .pDel { opacity: 1; }
}
// 정사각 썸네일 — contain 중앙 배치 (SVG preserveAspectRatio meet 기본값)
.pThumb {
  display: block; width: 100%; aspect-ratio: 1 / 1;
  background: var(--stage-bg); border-radius: var(--radius);
}
.pName {
  font-size: var(--fs-xs); color: var(--text); margin-top: 6px; cursor: text;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pName:hover { color: var(--accent); }
.pNameInput {
  @include text-field;
  border-color: var(--accent); padding: 1px 5px; margin-top: 4px; width: 100%;
  font-size: var(--fs-xs);
}
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
