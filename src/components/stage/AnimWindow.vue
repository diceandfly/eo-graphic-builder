<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import UnitGraphic from './UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';
import { bezierEase, samplePose } from '../../geometry/anim.js';
import { ICONS } from '../../ui/icons.js';

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

// §225: 창 크기 조절 — 좌상단 코너 그립 (우하단 앵커라 좌·위로 늘어남), 로컬 영속
const winSize = ref((() => {
  try { const s = JSON.parse(localStorage.getItem('eo.animWinSize') || 'null'); if (s?.w && s?.ph) return s; } catch { /* 기본값 */ }
  return { w: 300, ph: 210 };
})());
function onSizeGripDown(e) {
  e.preventDefault();
  const sx = e.clientX;
  const sy = e.clientY;
  const { w: w0, ph: p0 } = winSize.value;
  const mv = (ev) => {
    winSize.value = {
      w: Math.min(640, Math.max(240, w0 + (sx - ev.clientX))),
      ph: Math.min(560, Math.max(120, p0 + (sy - ev.clientY))),
    };
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    localStorage.setItem('eo.animWinSize', JSON.stringify(winSize.value));
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
</script>

<template>
  <div class="animWin" :style="{ width: winSize.w + 'px' }" @pointerdown.stop @wheel.stop @contextmenu.stop.prevent>
    <div class="sizeGrip" title="Drag to resize" @pointerdown.stop="onSizeGripDown" />
    <h2 class="title">Animation</h2>
    <template v-if="pose">
      <!-- 프리뷰 — viewBox = 프레임(크롭/카메라): 바깥 유닛은 자동 클립 (§220 시뮬 클립) -->
      <svg class="preview" :viewBox="`0 0 ${pose.W} ${pose.H}`" :style="{ height: winSize.ph + 'px' }">
        <rect :width="pose.W" :height="pose.H" :fill="fa.fill" :stroke="fa.stroke" :stroke-width="fa.strokeW" />
        <g v-for="it in pose.items" :key="it.key" :transform="`translate(${it.dx} ${it.dy})`" :opacity="it.opacity">
          <UnitGraphic :params="it.params" :seam-width="0.75" />
        </g>
      </svg>
      <!-- 스크러버 + 트랜스포트 -->
      <input
        class="scrub" type="range" min="0" max="1000" :value="Math.round(p * 1000)"
        @input="(e) => { stop(); p = Number(e.target.value) / 1000; }"
      />
      <div class="row">
        <button class="playBtn" :title="playing ? 'Pause' : 'Play'" @click="playing ? stop() : play()">
          <svg viewBox="0 0 24 24">
            <g v-if="!playing"><path v-for="(d, i) in ICONS.animation" :key="i" :d="d" /></g>
            <g v-else><path d="M8 5v14" /><path d="M16 5v14" /></g>
          </svg>
        </button>
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
  </div>
</template>

<style scoped lang="scss">
.animWin {
  position: absolute;
  /* §225: 애니메이션 버튼(프리셋 바) 바로 위 — 우하단 앵커 (사용자 확정) */
  right: var(--sp-6);
  bottom: calc(var(--sp-6) + 42px + var(--sp-6));
  z-index: 9;
  box-sizing: border-box;
  padding: var(--window-pad-y) var(--panel-pad);
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  display: flex; flex-direction: column; gap: 10px;
}
.title {
  /* L2 창 타이틀 (§218 전역 사다리) */
  font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--text);
  letter-spacing: 0; margin: 0; text-transform: capitalize;
}
.preview {
  width: 100%; display: block;
  background: var(--stage-bg);
  border: 1px solid var(--line); border-radius: var(--radius);
}
// §225: 좌상단 코너 크기 조절 그립
.sizeGrip {
  position: absolute; top: 0; left: 0; width: 12px; height: 12px;
  cursor: nwse-resize;
  &:hover { box-shadow: inset 2px 2px 0 var(--accent); }
}
.scrub {
  width: 100%; margin: 0; accent-color: var(--accent);
}
.row { display: flex; align-items: center; gap: 8px; }
.playBtn {
  @include bordered-control;
  width: 28px; height: 21px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: miter; }
}
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
