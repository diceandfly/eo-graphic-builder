<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import UnitGraphic from './UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';
import { bezierEase, samplePose } from '../../geometry/anim.js';

// §224: 애니메이션 창 (Phase C) — 시뮬레이션 재생 + 전역 재생 파라미터 (fps 30 · once/loop/pingpong).
// 엣지 소속 파라미터(duration·곡선)는 와이어 중앙 컨트롤이 담당(§220 확정) — 여기선 재생만.
// 좌하단 정렬 바 위 플로팅 — 프리셋창(우하단)과 대칭.
const props = defineProps({
  edge: { default: null },        // 선택된 animEdge (null = 빈 상태)
  fromFrame: { default: null },
  toFrame: { default: null },
  fromUnits: { type: Array, default: () => [] },
  toUnits: { type: Array, default: () => [] },
});

const FPS = 30; // §220: 30fps 기본 (시뮬 전용 — 성능 가드)

// §226: 창 크기 — 우하단 그립(상시 표시)으로 조절. 비율은 임의가 아니라 **보고 있는 프레임 비율 고정**:
// 폭만 저장하고 프리뷰 높이는 프레임 W:H에서 파생된다.
const winW = ref((() => {
  const v = Number(localStorage.getItem('eo.animWinW'));
  return Number.isFinite(v) && v >= 240 ? Math.min(720, v) : 300;
})());
// §226: 타이틀바 드래그로 자유 이동 (null = 기본 앵커 — 애니메이션 버튼 위)
const pos = ref((() => {
  try { const p = JSON.parse(localStorage.getItem('eo.animWinPos') || 'null'); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return p; } catch { /* 기본 앵커 */ }
  return null;
})());
const rootEl = ref(null);
// §227: 컨트롤이 아닌 모든 영역 드래그 = 창 이동 (5px 임계 — 프리뷰는 임계 미만이면 클릭 = 재생 토글)
function onWinDown(e) {
  if (e.target.closest('input, button, .scrub, .loopSeg, .sizeGrip')) return;
  const host = rootEl.value?.parentElement;
  const wr = rootEl.value.getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  const offX = e.clientX - wr.left;
  const offY = e.clientY - wr.top;
  const sx = e.clientX;
  const sy = e.clientY;
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    moved = true;
    pos.value = {
      x: Math.min(hr.width - 80, Math.max(8 - wr.width + 80, ev.clientX - hr.left - offX)),
      y: Math.min(hr.height - 40, Math.max(0, ev.clientY - hr.top - offY)),
    };
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', mv);
    if (moved) localStorage.setItem('eo.animWinPos', JSON.stringify(pos.value));
    // §227: 프리뷰 클릭(무이동) = 재생/정지
    else if (ev.target.closest('.pvWrap')) (playing.value ? stop() : play());
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
}
function onSizeGripDown(e) {
  e.preventDefault();
  const sx = e.clientX;
  const w0 = winW.value;
  const mv = (ev) => {
    winW.value = Math.min(720, Math.max(240, w0 + (ev.clientX - sx)));
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    localStorage.setItem('eo.animWinW', String(Math.round(winW.value)));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
}
const playing = ref(false);
const loopMode = ref('loop'); // 'once' | 'loop' | 'pingpong'
const p = ref(0);             // raw 진행률 0..1
let dir = 1;
let rafId = 0;
let last = 0;
let acc = 0;

function tick(now) {
  rafId = requestAnimationFrame(tick);
  const dt = now - last;
  last = now;
  acc += dt;
  const step = 1000 / FPS;
  if (acc < step) return;
  const adv = (acc / (props.edge?.duration ?? 1000)) * dir;
  acc = 0;
  let np = p.value + adv;
  if (loopMode.value === 'pingpong') {
    if (np >= 1) { np = 1; dir = -1; }
    else if (np <= 0) { np = 0; dir = 1; }
  } else if (np >= 1) {
    if (loopMode.value === 'loop') np = 0;
    else { np = 1; stop(); }
  }
  p.value = np;
}
function play() {
  if (!props.edge || playing.value) return;
  if (loopMode.value !== 'pingpong' && p.value >= 1) p.value = 0;
  dir = dir || 1;
  playing.value = true;
  last = performance.now();
  acc = 0;
  rafId = requestAnimationFrame(tick);
}
function stop() {
  playing.value = false;
  cancelAnimationFrame(rafId);
}
watch(() => props.edge, () => { stop(); p.value = 0; dir = 1; });
onBeforeUnmount(stop);

const eased = computed(() => (props.edge ? bezierEase(props.edge.curve, p.value) : 0));
const pose = computed(() => {
  if (!props.edge || !props.fromFrame || !props.toFrame) return null;
  return samplePose(props.fromFrame, props.fromUnits, props.toFrame, props.toUnits, eased.value);
});
const fa = computed(() => (pose.value ? frameAttrs(pose.value.frame) : null));
const timeLabel = computed(() => {
  const d = props.edge?.duration ?? 0;
  return `${((p.value * d) / 1000).toFixed(2)}s / ${(d / 1000).toFixed(2)}s`;
});
// §226: 프리뷰 높이 = 폭 × 프레임 비율 (창 리사이즈가 프레임 비율을 유지)
const previewH = computed(() => {
  const inner = winW.value - 24; // --panel-pad 좌우
  const ratio = pose.value ? pose.value.H / pose.value.W : 9 / 16;
  return Math.round(inner * ratio);
});
</script>

<template>
  <div
    ref="rootEl"
    class="animWin"
    :class="{ floating: !!pos }"
    :style="{ width: winW + 'px', ...(pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' } : {}) }"
    @pointerdown.stop="onWinDown" @wheel.stop @contextmenu.stop.prevent
  >
    <h2 class="title" title="Drag to move">Animation</h2>
    <template v-if="pose">
      <!-- 프리뷰 — viewBox = 프레임(크롭/카메라): 바깥 유닛은 자동 클립 (§220 시뮬 클립) -->
      <div class="pvWrap">
        <svg class="preview" :viewBox="`0 0 ${pose.W} ${pose.H}`" :style="{ height: previewH + 'px' }">
          <rect :width="pose.W" :height="pose.H" :fill="fa.fill" :stroke="fa.stroke" :stroke-width="fa.strokeW" />
          <g v-for="it in pose.items" :key="it.key" :transform="`translate(${it.dx} ${it.dy})`" :opacity="it.opacity">
            <UnitGraphic :params="it.params" :seam-width="0.75" />
          </g>
        </svg>
        <!-- §228: 호버 시 중앙 재생/정지 안내 버튼 (클릭 판정은 프리뷰 전체) -->
        <div class="pvPlay">
          <svg viewBox="0 0 24 24">
            <path v-if="!playing" d="M8 5 L19 12 L8 19 Z" />
            <g v-else><path d="M8.5 5 V19" /><path d="M15.5 5 V19" /></g>
          </svg>
        </div>
      </div>
      <!-- 스크러버 + 트랜스포트 -->
      <input
        class="scrub" type="range" min="0" max="1000" :value="Math.round(p * 1000)"
        @input="(e) => { stop(); p = Number(e.target.value) / 1000; }"
      />
      <div class="row">
        <!-- §227: 재생/정지 = 프리뷰 클릭 (별도 버튼 폐기) -->
        <span class="time">{{ timeLabel }}</span>
        <div class="segMini loopSeg">
          <button :class="{ on: loopMode === 'once' }" @click="loopMode = 'once'">once</button>
          <button :class="{ on: loopMode === 'loop' }" @click="loopMode = 'loop'">loop</button>
          <button :class="{ on: loopMode === 'pingpong' }" @click="loopMode = 'pingpong'">pingpong</button>
        </div>
      </div>
      <div class="menuNote">30fps simulation — edge timing via the wire control</div>
    </template>
    <div v-else class="empty">
      Opt-drag a frame to make a paired keyframe, then drag its right node onto the copy's left node — the connection plays here
    </div>
    <!-- §226: 우하단 크기 조절 그립 — 상시 표시, 호버 시 액센트. 프레임 비율 고정 리사이즈 -->
    <div class="sizeGrip" title="Drag to resize (frame ratio locked)" @pointerdown.stop="onSizeGripDown">
      <svg viewBox="0 0 10 10"><path d="M9 1 1 9 M9 5 5 9" /></svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
.animWin {
  position: absolute;
  /* §225: 애니메이션 버튼(프리셋 바) 바로 위 — 우하단 앵커 (사용자 확정) */
  right: var(--sp-6);
  bottom: calc(var(--sp-6) + 42px + var(--sp-6));
  z-index: 25; /* §231: 최상 오더 — 메인 패널(z10)·이름 편집(z20)도 덮음 (도움말 z40 아래) */
  box-sizing: border-box;
  padding: var(--window-pad-y) var(--panel-pad);
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  display: flex; flex-direction: column; gap: 10px;
}
.title {
  /* L2 창 타이틀 (§218 전역 사다리) — §226: 드래그 = 창 이동 */
  font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--text);
  letter-spacing: 0; margin: 0; text-transform: capitalize;
  cursor: move; user-select: none; -webkit-user-select: none;
}
.pvWrap { position: relative; cursor: pointer; } /* §227: 클릭 = 재생/정지 */
.preview {
  width: 100%; display: block;
  background: var(--stage-bg);
  border: 1px solid var(--line); border-radius: var(--radius);
}
/* §228: 호버 시 중앙 재생/정지 표시 — 판정은 pvWrap, 표시는 오버레이 */
.pvPlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.12s; pointer-events: none;
  svg {
    /* §231: 원(배경) 2배(54→107px) · 아이콘 1.2배(34→41px) — border-box 기준 총폭 = 41 + 33×2 */
    width: 107px; height: 107px; padding: 33px;
    background: rgba(0, 0, 0, 0.55); border-radius: 50%;
    fill: var(--text); stroke: var(--text); stroke-width: 2.4; stroke-linejoin: miter;
    path[d^='M8 5 L'] { stroke-width: 0; }
  }
}
.pvWrap:hover .pvPlay { opacity: 1; }
// §226: 우하단 크기 조절 그립 — 기호 상시 표시, 호버 = 액센트
.sizeGrip {
  position: absolute; right: 2px; bottom: 2px; width: 14px; height: 14px;
  cursor: nwse-resize;
  display: flex; align-items: center; justify-content: center;
  svg { width: 10px; height: 10px; fill: none; stroke: var(--faint); stroke-width: 1.4; stroke-linecap: square; }
  &:hover svg { stroke: var(--accent); }
}
.scrub {
  width: 100%; margin: 0; accent-color: var(--accent);
}
.row { display: flex; align-items: center; gap: 8px; }
.time {
  font-size: var(--fs-xs); color: var(--dim); font-variant-numeric: tabular-nums;
  flex: 1;
}
.loopSeg {
  display: flex; border: 1px solid var(--line); border-radius: var(--radius);
  button {
    border: none; background: none; padding: 0 8px; height: 19px;
    display: inline-flex; align-items: center;
    font-size: var(--fs-xs); color: var(--faint); font-family: inherit; cursor: pointer;
    text-transform: none; // 토글 위계 (§216)
    &:not(:last-child) { border-right: 1px solid var(--line); }
    &.on { @include active-outline-inset; }
  }
}
.menuNote {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
  &::first-letter { text-transform: uppercase; }
}
.empty {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
  line-height: 1.6;
  border: 1px dashed var(--line); border-radius: var(--radius); padding: 14px 12px;
  &::first-letter { text-transform: uppercase; }
}
</style>
