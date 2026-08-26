<script setup>
import { ref, watch } from 'vue';
import IconButton from '../ui/IconButton.vue';
import FloatingBar from '../ui/FloatingBar.vue';
import { ICONS } from '../../ui/icons.js';

// 대시보드 좌상단 — 파일 작업 바 (manual / save / open / reset). export는 우클릭 메뉴로 이동 (§60).
// 우클릭 메뉴 (§86): manual = 리소스 모니터 토글, save/open = JSON 저장·불러오기 범위 토글
defineProps({
  view: Object,      // { resMon, ... } — 뷰 옵션 reactive 스토어
  saveScope: Object, // { objects, viewport, workspace }
  openScope: Object,
});
const emit = defineEmits(['save', 'open', 'reset']);

const SCOPE_LABELS = { objects: 'Objects & groups', viewport: 'Viewport', workspace: 'Workspace settings' };
const openMenu = ref(null); // 'manual' | 'save' | 'open' | null
function onContext(key, e) {
  if (!['manual', 'save', 'open'].includes(key)) return;
  e.preventDefault();
  openMenu.value = openMenu.value === key ? null : key;
}
function closeCtxMenu() {
  openMenu.value = null;
}
watch(openMenu, (open) => {
  if (open) setTimeout(() => window.addEventListener('pointerdown', closeCtxMenu, { once: true }), 0);
});

const ACTIONS = [
  { key: 'manual', tip: 'Manual — coming soon', paths: ICONS.manual }, // 자리만 확보 (§74)
  { key: 'save', tip: 'Save JSON', paths: ICONS.save },
  { key: 'open', tip: 'Open JSON', paths: ICONS.open },
  { key: 'reset', tip: 'Reset dashboard', paths: ICONS.resetArrow },
];

const fileEl = ref(null);

// 리셋 3단계 확인: 1차 경고 → 2차 최후통첩 → 3차 실행. 각 단계 타임아웃 시 해제.
const resetStage = ref(0);
let armTimer = null;
const RESET_TIPS = [
  'Reset dashboard',
  'Click again to reset',
  'FINAL WARNING — every unit will be vaporized. They had families.',
];
const RESET_TONES = ['default', 'danger', 'doom'];
// 1·2단계 = 일반 리셋 화살표, 3단계(최후통첩)에서만 묘비
const RESET_ICONS = [ICONS.resetArrow, ICONS.resetArrow, ICONS.tombstone];

function onAction(key) {
  if (key === 'manual') return; // 좌클릭 no-op — 추후 기획 (우클릭 = 모니터 토글)
  if (key === 'save') emit('save');
  else if (key === 'open') fileEl.value.click();
  else if (key === 'reset') {
    clearTimeout(armTimer);
    if (resetStage.value >= 2) {
      resetStage.value = 0;
      emit('reset');
    } else {
      resetStage.value += 1;
      armTimer = setTimeout(() => (resetStage.value = 0), resetStage.value === 2 ? 5000 : 3000);
    }
  }
}
function onFile(e) {
  const f = e.target.files[0];
  if (f) emit('open', f);
  e.target.value = '';
}
</script>

<template>
  <div class="fileCorner">
    <FloatingBar>
      <div v-for="a in ACTIONS" :key="a.key" class="optWrap">
        <IconButton
          :paths="a.key === 'reset' ? RESET_ICONS[resetStage] : a.paths"
          :tip="openMenu === a.key ? '' : a.key === 'reset' ? RESET_TIPS[resetStage] : a.tip"
          :tone="a.key === 'reset' ? RESET_TONES[resetStage] : 'default'"
          tip-side="bottom" tip-align="left"
          @click="onAction(a.key)"
          @contextmenu="onContext(a.key, $event)"
        />
        <!-- manual 우클릭: 뷰 유틸 -->
        <div v-if="openMenu === 'manual' && view" class="menu" @pointerdown.stop>
          <div class="menuTitle">View utilities</div>
          <label class="menuRow">
            <input type="checkbox" v-model="view.resMon" />
            <span>Resource monitor</span>
          </label>
        </div>
        <!-- save/open 우클릭: JSON에 포함/적용할 범위 -->
        <div v-if="openMenu === 'save' && saveScope" class="menu" @pointerdown.stop>
          <div class="menuTitle">Save to JSON</div>
          <label v-for="(label, k) in SCOPE_LABELS" :key="k" class="menuRow">
            <input type="checkbox" v-model="saveScope[k]" />
            <span>{{ label }}</span>
          </label>
        </div>
        <div v-if="openMenu === 'open' && openScope" class="menu" @pointerdown.stop>
          <div class="menuTitle">Load from JSON</div>
          <label v-for="(label, k) in SCOPE_LABELS" :key="k" class="menuRow">
            <input type="checkbox" v-model="openScope[k]" />
            <span>{{ label }}</span>
          </label>
        </div>
      </div>
      <input ref="fileEl" type="file" accept=".json,application/json" hidden @change="onFile" />
    </FloatingBar>
  </div>
</template>

<style scoped lang="scss">
// 패널이 스테이지 위 오버레이가 되면서(§85) 파일바는 패널 오른쪽 옆에 배치
.fileCorner { position: absolute; left: calc(var(--panel-w) + 2 * var(--sp-6)); top: var(--sp-6); }
.optWrap { position: relative; }
// 상단 바라 메뉴는 아래로 드롭 (코너 바와 동일 문법)
.menu {
  position: absolute; top: calc(100% + 14px); left: 0;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.menuTitle {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-wide); text-transform: uppercase;
  color: var(--faint); margin-bottom: 2px; white-space: nowrap;
}
.menuRow {
  display: flex; align-items: center; gap: var(--sp-3);
  font-size: var(--fs-xs); color: var(--text); cursor: pointer; white-space: nowrap;
}
</style>
