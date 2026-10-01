<script setup>
import { ref, computed, watch } from 'vue';
import Toggle from '../controls/Toggle.vue';

// 공용 프리셋 그리드 브라우저 (§207~§210) — 유닛/패턴 프리셋 플로팅 패널이 공유하는 본문.
// §210 상호작용 모델:
//  · 카드 클릭 = 선택, ⇧클릭 = 멀티 토글 (즉시 배치 아님 — 실수 방지)
//  · 카드 드래그 → 캔버스에 드랍 = 그 지점에 배치 / 폴더 카드에 드랍 = 폴더로 이동 /
//    다른 카드에 드랍 = 그 앞으로 정렬 (전부 앱 공통 포인터 드래그 — HTML5 DnD 아님)
//  · 카드 더블클릭 = 화면 중앙 배치 (빠른 배치 폴백)
//  · 폴더(1단계): 클릭 = 열기, 헤더의 ‹ = 상위로, + folder = 새 폴더, ⤒ = 선택을 루트로
//  · 검색은 폴더 전체(상위+하위) 대상 — 결과 카드에 폴더명 뱃지
//  · 우클릭 메뉴 = 선택 전체 일괄 (Duplicate/Delete, Rename·Export SVG는 단일만)
const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, default: () => [] },
  folders: { type: Array, default: () => [] },
  emptyText: { type: String, default: 'nothing registered yet' },
  protectedId: { default: null },
  showExportSvg: Boolean,
  viewBoxOf: { type: Function, required: true }, // item → svg viewBox 문자열
  thumbAspect: { type: String, default: '1 / 1' }, // §208: 패턴은 16 / 9
  colsKey: { type: String, default: 'eo.presetCols' }, // §211: 열 세팅 저장 키 — 패널별 분리
});
const emit = defineEmits([
  'place', 'placeAt', 'remove', 'rename', 'duplicate', 'reorder', 'moveToFolder',
  'addFolder', 'renameFolder', 'removeFolder', 'exportJson', 'importJson', 'exportSvg',
]);

const vFocus = { mounted: (el) => { el.focus(); el.select(); } };

// §208~§211: 열 수 토글 (2/3/4/6) — 패널별 개별 저장 (colsKey)
const cols = ref(['2', '3', '4', '6'].includes(localStorage.getItem(props.colsKey)) ? localStorage.getItem(props.colsKey) : '4');
watch(cols, (v) => localStorage.setItem(props.colsKey, v));

// ── 폴더 내비게이션 + 검색 (§210) ──
const currentFolder = ref(null); // 폴더 id | null(루트)
const q = ref('');
const searching = computed(() => q.value.trim() !== '');
const currentFolderName = computed(() => props.folders.find((f) => String(f.id) === String(currentFolder.value))?.name ?? null);
const visibleItems = computed(() => {
  const t = q.value.trim().toLowerCase();
  if (t) return props.items.filter((p) => p.name.toLowerCase().includes(t)); // 전체(상위+하위) 검색
  return props.items.filter((p) => String(p.folder ?? '') === String(currentFolder.value ?? ''));
});
const folderOf = (p) => props.folders.find((f) => String(f.id) === String(p.folder))?.name ?? null;
function goUp() {
  currentFolder.value = null;
  q.value = '';
}

// ── 선택 (§210) ──
const selected = ref([]); // item id 배열
const isSel = (id) => selected.value.some((x) => String(x) === String(id));
function toggleSel(id) {
  selected.value = isSel(id) ? selected.value.filter((x) => String(x) !== String(id)) : [...selected.value, id];
}
watch([currentFolder, q], () => { selected.value = []; });
const movableUp = computed(() =>
  selected.value.length > 0 &&
  selected.value.some((id) => (props.items.find((p) => String(p.id) === String(id))?.folder ?? null) != null)
);

// ── 카드 포인터 드래그: 클릭(선택) / 정렬 / 폴더 이동 / 캔버스 배치 (§210) ──
let press = null;
const ghost = ref(null);    // { x, y, label }
const dropHint = ref(null); // { kind: 'item'|'folder'|'canvas', id? }
const insertLine = ref(null); // §215: 정렬 삽입 위치 라인 — 대상 카드 왼쪽 갭에 표시 ("이 앞에 들어감")
function draggedIds() {
  return press && isSel(press.id) ? [...selected.value] : press ? [press.id] : [];
}
function onCardDown(p, kind, e) {
  if (e.button !== 0) return;
  press = { id: p.id, kind, name: p.name, x: e.clientX, y: e.clientY, moved: false, shift: e.shiftKey };
  window.addEventListener('pointermove', onCardMove);
  window.addEventListener('pointerup', onCardUp, { once: true });
}
function onCardMove(e) {
  if (!press) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
  if (press.kind === 'folder') return; // 폴더 카드는 드래그 대상 아님 (클릭 = 열기)
  press.moved = true;
  const n = draggedIds().length;
  ghost.value = { x: e.clientX, y: e.clientY, label: n > 1 ? `${n} items` : press.name };
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const card = el?.closest?.('.pCard');
  if (card && String(card.dataset.pid) !== String(press.id)) {
    dropHint.value = { kind: card.dataset.kind, id: card.dataset.pid };
    // §215: 아이템 정렬 드롭은 "대상 앞 삽입" — 카드 왼쪽 갭에 세로 라인으로 삽입 지점 표시
    if (card.dataset.kind === 'item' && !searching.value) {
      const grid = card.closest('.pGrid');
      const cr = card.getBoundingClientRect();
      const gr = grid.getBoundingClientRect();
      // 보호 프리셋(항상 맨 앞 고정)이 대상이면 실제 삽입 위치는 그 뒤 — 라인도 오른쪽 갭에
      const after = props.protectedId != null && String(card.dataset.pid) === String(props.protectedId);
      insertLine.value = {
        left: Math.max(0, (after ? cr.right - gr.left + 4 : cr.left - gr.left - 6)),
        top: cr.top - gr.top,
        height: cr.height,
      };
    } else {
      insertLine.value = null;
    }
  } else if (!card && el?.closest?.('.stage') && !el.closest?.('.presetFloat')) {
    dropHint.value = { kind: 'canvas' };
    insertLine.value = null;
  } else {
    dropHint.value = null;
    insertLine.value = null;
  }
}
function onCardUp(e) {
  window.removeEventListener('pointermove', onCardMove);
  if (!press) return;
  const info = press;
  press = null;
  const hint = dropHint.value;
  dropHint.value = null;
  insertLine.value = null;
  ghost.value = null;
  if (!info.moved) {
    // 클릭: 폴더 = 열기, 아이템 = 선택 (⇧ = 멀티 토글)
    if (info.kind === 'folder') {
      currentFolder.value = info.id;
      return;
    }
    if (info.shift) toggleSel(info.id);
    else selected.value = [info.id];
    return;
  }
  if (!hint) return;
  const ids = isSel(info.id) ? [...selected.value] : [info.id];
  if (hint.kind === 'folder') {
    emit('moveToFolder', ids.filter((id) => id !== props.protectedId), hint.id);
  } else if (hint.kind === 'item' && !searching.value) {
    emit('reorder', ids, hint.id);
  } else if (hint.kind === 'canvas') {
    const item = props.items.find((p) => String(p.id) === String(info.id));
    if (item) emit('placeAt', item, e.clientX, e.clientY);
  }
}

// ── 인라인 이름 편집 (이름 더블클릭 / 메뉴 Rename) ──
const editing = ref(null); // { id, draft, isFolder }
function startRename(p, isFolder = false) {
  if (!isFolder && p.id === props.protectedId) return;
  editing.value = { id: p.id, draft: p.name, isFolder };
}
function commitName(e) {
  if (e && e.isComposing) return;
  if (editing.value) {
    emit(editing.value.isFolder ? 'renameFolder' : 'rename', editing.value.id, editing.value.draft);
  }
  editing.value = null;
}

// ── 우클릭 메뉴 — 선택 전체 일괄 (§210) ──
const menu = ref(null); // { x, y, kind, p }
function openMenu(p, kind, e) {
  if (kind === 'item' && !isSel(p.id)) selected.value = [p.id];
  menu.value = { x: e.clientX, y: e.clientY, kind, p };
}
function closeMenu() {
  menu.value = null;
}
function onMenuOutside(e) {
  if (e.target instanceof Element && e.target.closest('.pMenu')) return;
  closeMenu();
}
watch(menu, (open, was) => {
  // §210: 패널 내부 클릭으로도 닫히도록 캡처 단계 (패널의 pointerdown.stop을 우회)
  if (open && !was) setTimeout(() => window.addEventListener('pointerdown', onMenuOutside, true), 0);
  else if (!open) window.removeEventListener('pointerdown', onMenuOutside, true);
});
const menuIds = computed(() => (menu.value?.kind === 'item' ? [...selected.value] : []));
const singleTarget = computed(() =>
  menuIds.value.length === 1 ? props.items.find((p) => String(p.id) === String(menuIds.value[0])) : null
);
function menuDelete() {
  if (menu.value.kind === 'folder') emit('removeFolder', menu.value.p.id);
  else emit('remove', menuIds.value);
  closeMenu();
}
function menuDuplicate() {
  emit('duplicate', menuIds.value);
  closeMenu();
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
      <Toggle
        class="colToggle" v-model="cols"
        :options="[{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '6', label: '6' }]"
      />
    </div>
    <!-- §210·§211: [검색] … [back·move out(상황부)] [+ folder] — 기호 버튼 대신 단어 라벨 -->
    <div class="toolRow">
      <input v-model="q" class="pSearch" type="text" placeholder="Search all" spellcheck="false" />
      <button
        class="tBtn" :disabled="currentFolder == null && !searching"
        title="Back to all presets" @click="goUp"
      >← Back</button>
      <button
        class="tBtn" :disabled="!movableUp"
        title="Move selection out of its category"
        @click="emit('moveToFolder', selected, null)"
      >Move out</button>
      <button class="tBtn" title="New category" @click="emit('addFolder')">+ Category</button>
    </div>
    <div v-if="currentFolderName && !searching" class="crumb">▸ {{ currentFolderName }}</div>
    <div class="gridArea" @pointerdown.self="selected = []">
      <div v-if="!items.length && !folders.length" class="pEmpty">{{ emptyText }}</div>
      <div v-else-if="searching && !visibleItems.length" class="pEmpty">no matches for "{{ q }}"</div>
      <div v-else class="pGrid" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
        <!-- 폴더 카드 (루트·비검색에서만) -->
        <template v-if="!searching && currentFolder == null">
          <div
            v-for="f in folders" :key="'fd' + f.id" class="pCard folderCard"
            :class="{ dropTarget: dropHint?.kind === 'folder' && String(dropHint.id) === String(f.id) }"
            :data-pid="f.id" data-kind="folder"
            @pointerdown.stop="onCardDown(f, 'folder', $event)"
            @contextmenu.prevent.stop="openMenu(f, 'folder', $event)"
          >
            <div class="folderBody">
              <svg viewBox="0 0 24 24"><path d="M3 5h7l2 3h9v12H3z" /></svg>
              <span class="fCount">{{ items.filter((p) => String(p.folder ?? '') === String(f.id)).length }}</span>
            </div>
            <input
              v-if="editing?.isFolder && String(editing.id) === String(f.id)"
              v-focus class="pNameInput" v-model="editing.draft"
              @click.stop @pointerdown.stop
              @keydown.enter="commitName" @keydown.esc="editing = null" @blur="editing = null"
            />
            <div v-else class="pName" @dblclick.stop="startRename(f, true)">{{ f.name }}</div>
          </div>
        </template>
        <!-- §215: 정렬 삽입 라인 — 드롭 시 이 위치(대상 카드 앞)에 들어간다는 표시 -->
        <div
          v-if="insertLine" class="insertLine"
          :style="{ left: insertLine.left + 'px', top: insertLine.top + 'px', height: insertLine.height + 'px' }"
        />
        <!-- 아이템 카드 -->
        <div
          v-for="p in visibleItems" :key="p.id" class="pCard"
          :class="{ sel: isSel(p.id) }"
          :data-pid="p.id" data-kind="item"
          @pointerdown.stop="onCardDown(p, 'item', $event)"
          @dblclick.stop="emit('place', p)"
          @contextmenu.prevent.stop="openMenu(p, 'item', $event)"
        >
          <svg class="pThumb" :viewBox="viewBoxOf(p)">
            <slot name="thumb" :item="p" />
          </svg>
          <span v-if="searching && folderOf(p)" class="fBadge">{{ folderOf(p) }}</span>
          <input
            v-if="editing && !editing.isFolder && String(editing.id) === String(p.id)"
            v-focus class="pNameInput" v-model="editing.draft"
            @click.stop @pointerdown.stop
            @keydown.enter="commitName" @keydown.esc="editing = null" @blur="editing = null"
          />
          <div
            v-else class="pName"
            :title="p.id === protectedId ? '' : 'Double-click to rename'"
            @dblclick.stop="startRename(p)"
          >{{ p.name }}</div>
        </div>
      </div>
    </div>
    <div class="pIoRow">
      <button class="pIoBtn" @click="emit('exportJson')">Export JSON</button>
      <button class="pIoBtn" @click="fileEl.click()">Import JSON</button>
      <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
    </div>

    <!-- 드래그 고스트 -->
    <div v-if="ghost" class="dragGhost" :style="{ left: ghost.x + 12 + 'px', top: ghost.y + 12 + 'px' }">
      {{ ghost.label }}
    </div>

    <!-- 우클릭 메뉴 — 선택 전체 일괄 -->
    <div
      v-if="menu"
      class="pMenu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <template v-if="menu.kind === 'item'">
        <button class="pMenuItem" @click="menuDuplicate">Duplicate{{ menuIds.length > 1 ? ` (${menuIds.length})` : '' }}</button>
        <button
          v-if="singleTarget && singleTarget.id !== protectedId"
          class="pMenuItem" @click="startRename(singleTarget); closeMenu()"
        >Rename</button>
        <button
          v-if="showExportSvg && singleTarget"
          class="pMenuItem" @click="emit('exportSvg', singleTarget); closeMenu()"
        >Export SVG</button>
        <button class="pMenuItem" @click="menuDelete">Delete{{ menuIds.length > 1 ? ` (${menuIds.length})` : '' }}</button>
      </template>
      <template v-else>
        <button class="pMenuItem" @click="startRename(menu.p, true); closeMenu()">Rename category</button>
        <button class="pMenuItem" @click="menuDelete">Delete category</button>
      </template>
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
    /* §213: 창 타이틀 — 문장형·13px·semibold·주 텍스트색 (위계는 크기·웨이트·밝기) */
    font-size: var(--fs-md); letter-spacing: 0;
    color: var(--text); font-weight: var(--fw-semibold); margin: 0; white-space: nowrap;
  }
}
.colToggle { margin-bottom: 0; }
.toolRow { display: flex; gap: 6px; margin-bottom: 10px; align-items: stretch; }
.pSearch {
  @include text-field;
  flex: 1; min-width: 0; box-sizing: border-box; font-size: var(--fs-xs);
  padding: 4px 8px;
}
.tBtn {
  @include bordered-control;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-base); padding: 4px 10px;
  white-space: nowrap;
  &:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  /* §214: 비활성도 형태는 그대로 — 글자만 흐리게 (버튼이 안 보인다는 피드백) */
  &:disabled { color: var(--faint); cursor: default; }
}
.crumb { font-size: var(--fs-2xs); color: var(--faint); letter-spacing: var(--ls-base); margin: -4px 0 8px; }
.gridArea {
  flex: 1; min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.pEmpty {
  font-size: var(--fs-xs); color: var(--faint); letter-spacing: var(--ls-base);
  border: 1px dashed var(--line); border-radius: var(--radius);
  padding: 16px 12px; text-align: center;
  &::first-letter { text-transform: uppercase; } /* §215: 본문·안내문도 이니셜 캡 (가독) */
}
.pGrid { position: relative; display: grid; gap: 10px; } /* §215: insertLine 기준 좌표 */
// §215: 정렬 삽입 라인 — 카드 왼쪽 갭(10px) 중앙의 2px 세로 라인
.insertLine {
  position: absolute; width: 2px; border-radius: 1px;
  background: var(--accent); pointer-events: none; z-index: 2;
}
.pCard {
  position: relative; cursor: pointer;
  border: 1px solid var(--line); border-radius: var(--radius); padding: 0;
  overflow: hidden; /* §211: 썸네일이 카드 모서리를 그대로 공유 (패딩 0) */
  user-select: none; -webkit-user-select: none;
  &:hover { border-color: var(--accent); }
  /* §210: 선택 상태 — 캔버스 선택과 동일한 액센트 문법 */
  &.sel { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  /* §215: 아이템 정렬 드롭 표시는 카드 하이라이트 대신 .insertLine(삽입 지점 라인)으로 — 폴더 드롭만 카드 강조 */
  &.dropTarget { border-color: var(--accent); box-shadow: inset 2px 0 0 var(--accent); }
}
.folderCard {
  .folderBody {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    aspect-ratio: v-bind(thumbAspect);
    background: var(--hover-bg);
    svg { width: 38%; height: 38%; fill: none; stroke: var(--faint); stroke-width: 1.6; stroke-linejoin: miter; }
  }
  .fCount {
    position: absolute; right: 8px; bottom: 6px;
    font-size: var(--fs-2xs); color: var(--faint);
  }
  &:hover .folderBody svg { stroke: var(--accent); }
  &.dropTarget .folderBody svg { stroke: var(--accent); }
}
// 썸네일 — contain 중앙 배치, 카드 꽉 채움 (§211: 패딩 0 — 라운딩은 카드 overflow가 클립)
.pThumb {
  display: block; width: 100%; aspect-ratio: v-bind(thumbAspect);
  background: var(--stage-bg);
  pointer-events: none; /* 드래그 히트는 카드가 담당 */
}
.fBadge {
  position: absolute; top: 9px; left: 9px;
  font-size: var(--fs-2xs); color: var(--faint);
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 1px 5px;
}
.pName {
  font-size: var(--fs-xs); color: var(--text);
  padding: 5px 7px 6px; /* §211: 카드 패딩 0에 상응하는 최소 보정값 */
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pCard.sel .pName { color: var(--accent); }
.pNameInput {
  @include text-field;
  border-color: var(--accent); padding: 1px 5px; margin: 4px 5px 5px;
  width: calc(100% - 10px); box-sizing: border-box; font-size: var(--fs-xs);
}
.dragGhost {
  position: fixed; z-index: 40; pointer-events: none;
  background: var(--panel); border: 1px solid var(--accent); border-radius: var(--radius);
  color: var(--text); font-size: var(--fs-xs); padding: 3px 8px; white-space: nowrap;
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
  flex: 1; font-size: var(--fs-2xs); letter-spacing: var(--ls-base); /* §214: 캡스 해제 */
  padding: 5px 0;
  &:hover { border-color: var(--accent); color: var(--accent); }
}
</style>
