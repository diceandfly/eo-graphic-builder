<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { saveFileAs } from '../../utils/saveFile.js';
import { zipStore } from '../../utils/zipStore.js';
import UnitGraphic from './UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';
import { bezierEase, samplePose } from '../../geometry/anim.js';

// §224: 애니메이션 창 (Phase C) — 시뮬레이션 재생 + 전역 재생 파라미터 (fps 30/24 · pingpong/cycle — §246: once 폐기).
// 엣지 소속 파라미터(duration·곡선)는 와이어 중앙 컨트롤이 담당(§220 확정) — 여기선 재생만.
// 좌하단 정렬 바 위 플로팅 — 프리셋창(우하단)과 대칭.
const props = defineProps({
  edge: { default: null },        // 선택된 animEdge (null = 빈 상태)
  fromFrame: { default: null },
  toFrame: { default: null },
  fromUnits: { type: Array, default: () => [] },
  toUnits: { type: Array, default: () => [] },
});

// §244: fps 옵션(30/24) — 재생·익스포트 공통 (§220의 30 고정 해제). cycles = 익스포트 반복 회수.
const fps = ref(Number(localStorage.getItem('eo.animFps')) === 24 ? 24 : 30);
watch(fps, (v) => localStorage.setItem('eo.animFps', String(v)));
const cycles = ref((() => {
  const v = Number(localStorage.getItem('eo.animCycles'));
  return Number.isInteger(v) && v >= 1 && v <= 8 ? v : 1;
})());
watch(cycles, (v) => {
  if (!Number.isInteger(v) || v < 1) cycles.value = 1;
  else if (v > 8) cycles.value = 8;
  else localStorage.setItem('eo.animCycles', String(v));
});
// §247: 익스포트 옵션 묶음 — format(WebM|PNG 시퀀스) · scale(0.5/1/2× — 1920 캡도 배율 동승) ·
// alpha(배경 투명 — PNG 전용: WebM 실시간 녹화는 알파 비보존) · hold(끝 프레임 유지 ms, 루프 호흡)
const exportCfg = reactive({ format: 'webm', scale: 1, alpha: false, hold: 0 });
try { Object.assign(exportCfg, JSON.parse(localStorage.getItem('eo.animExport') || '{}')); } catch { /* 기본값 유지 */ }
watch(exportCfg, (v) => localStorage.setItem('eo.animExport', JSON.stringify(v)));
// §247: 옵션 접기 — 재생화면 바로 아래 토글, 프리뷰 제외 전부 숨김
const optsOpen = ref(localStorage.getItem('eo.animOptsOpen') !== '0');
watch(optsOpen, (v) => localStorage.setItem('eo.animOptsOpen', v ? '1' : '0'));

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
  if (e.target.closest('input, button, .scrub, .segMini, .cycWrap, .sizeGrip')) return;
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
const loopMode = ref('pingpong'); // §233: 기본 = pingpong ('loop'(cycle) | 'pingpong' — §246: once 폐기)
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
  const step = 1000 / fps.value;
  if (acc < step) return;
  const adv = (acc / (props.edge?.duration ?? 1000)) * dir;
  acc = 0;
  let np = p.value + adv;
  if (loopMode.value === 'pingpong') {
    if (np >= 1) { np = 1; dir = -1; }
    else if (np <= 0) { np = 0; dir = 1; }
  } else if (np >= 1) {
    np = 0; // cycle: 처음으로 (§246: once 폐기)
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
// ── §233·§247: 익스포트 — WebM(MediaRecorder 실시간 녹화) / PNG 시퀀스(ZIP) 공용 엔진 ──
// 프리뷰 SVG(동일 렌더러)를 프레임마다 캔버스에 래스터. 옵션: 배율(0.5/1/2× — 1920 캡 동승) ·
// 배경 투명(PNG 전용) · 끝 프레임 홀드(ms). 파일명 = `From→To_1000ms` 규칙 (§247 사용자 확정).
const exporting = ref(false);
const exportPct = ref(0);
const fileBase = computed(() => {
  const nm = (u) => (u?.name || 'Frame').replace(/[\\/:*?"<>|]/g, '-');
  return `${nm(props.fromFrame)}→${nm(props.toFrame)}_${props.edge?.duration ?? 0}ms`;
});
async function doExport() {
  if (!props.edge || !pose.value || exporting.value) return;
  stop();
  exporting.value = true;
  exportPct.value = 0;
  try {
    const W0 = pose.value.W;
    const H0 = pose.value.H;
    // §247: 배율 — 캡도 배율에 동승 (0.5×=960 · 1×=1920 · 2×=3840)
    const k = exportCfg.scale * Math.min(1, 1920 / Math.max(W0, H0));
    const cw = Math.max(2, Math.round(W0 * k));
    const ch = Math.max(2, Math.round(H0 * k));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const alpha = exportCfg.format === 'png' && exportCfg.alpha; // §247: 투명 = PNG 전용
    const drawAt = async (t) => {
      p.value = t;
      await nextTick();
      const clone = rootEl.value.querySelector('.preview').cloneNode(true);
      clone.setAttribute('width', W0);
      clone.setAttribute('height', H0);
      clone.removeAttribute('style');
      if (alpha) {
        const bg = clone.querySelector('rect'); // 첫 rect = 프레임 배경
        bg.setAttribute('fill', 'none');
        bg.setAttribute('stroke', 'none');
      }
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch); URL.revokeObjectURL(url); res(); };
        img.onerror = rej;
        img.src = url;
      });
    };
    // §244: 반복 회수 — cycle = cycles패스, pingpong 1회 = **왕복**(2패스). §246: once 폐기
    const dur = props.edge.duration;
    const legs = loopMode.value === 'loop' ? cycles.value : cycles.value * 2;
    const total = dur * legs;
    const hold = Math.max(0, Number(exportCfg.hold) || 0); // §247: 끝 프레임 유지
    const endT = loopMode.value === 'pingpong' ? 0 : 1;    // 핑퐁은 출발점 복귀로 종료
    const tAt = (ms) => {
      const leg = Math.min(legs - 1, Math.floor(ms / dur));
      const local = Math.min(1, (ms - leg * dur) / dur);
      return loopMode.value === 'pingpong' && leg % 2 === 1 ? 1 - local : local;
    };
    if (exportCfg.format === 'png') {
      // §247: PNG 시퀀스 — 비실시간 프레임 루프 → ZIP(store) 한 파일로 저장
      const frameMs = 1000 / fps.value;
      const n = Math.max(2, Math.round(total / frameMs));
      const holdN = Math.round(hold / frameMs);
      const files = [];
      const grab = async () => new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/png'))).arrayBuffer());
      for (let i = 0; i < n; i += 1) {
        await drawAt(tAt(i * frameMs));
        files.push({ name: `seq_${String(i).padStart(4, '0')}.png`, data: await grab() });
        exportPct.value = Math.round((i / (n + holdN + 1)) * 100);
      }
      await drawAt(endT);
      const endData = await grab();
      files.push({ name: `seq_${String(n).padStart(4, '0')}.png`, data: endData });
      for (let h = 1; h <= holdN; h += 1) files.push({ name: `seq_${String(n + h).padStart(4, '0')}.png`, data: endData });
      exportPct.value = 100;
      await saveFileAs(zipStore(files), `${fileBase.value}_seq.zip`, 'export');
    } else {
      const stream = canvas.captureStream(fps.value);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { rec.onstop = res; });
      await drawAt(tAt(0));
      rec.start();
      const t0 = performance.now();
      let now = 0;
      while (now < total) {
        await drawAt(tAt(now));
        exportPct.value = Math.round((now / (total + hold)) * 100);
        await new Promise((r) => setTimeout(r, 1000 / fps.value));
        now = performance.now() - t0;
      }
      await drawAt(endT);
      if (hold) await new Promise((r) => setTimeout(r, hold)); // 끝 프레임 정지 화면을 hold만큼 녹화
      exportPct.value = 100;
      await new Promise((r) => setTimeout(r, 150));
      rec.stop();
      await done;
      await saveFileAs(new Blob(chunks, { type: 'video/webm' }), `${fileBase.value}.webm`, 'export');
    }
  } finally {
    exporting.value = false;
    p.value = 0;
  }
}

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
          <!-- §232: 필 글리프 + 광학 중심 보정(삼각형 우측 치우침 상쇄) -->
          <svg viewBox="0 0 24 24">
            <path v-if="!playing" d="M9.3 5.2 L20 12 L9.3 18.8 Z" />
            <g v-else><rect x="7" y="5.5" width="3.6" height="13" /><rect x="13.4" y="5.5" width="3.6" height="13" /></g>
          </svg>
        </div>
      </div>
      <!-- §247: 옵션 접기 토글 — 재생화면 바로 아래, 프리뷰 제외 전부 보기/숨기기 -->
      <button class="optTg" :title="optsOpen ? 'Hide options' : 'Show options'" @click="optsOpen = !optsOpen">
        <svg viewBox="0 0 24 24"><path :d="optsOpen ? 'M6 14.5 12 8.5 18 14.5' : 'M6 9.5 12 15.5 18 9.5'" /></svg>
      </button>
      <template v-if="optsOpen">
        <!-- ── 재생 그룹: 스크러버 · 시간 · 루프 모드 · 반복 · 프레임레이트 ── -->
        <input
          class="scrub" type="range" min="0" max="1000" :value="Math.round(p * 1000)"
          @input="(e) => { stop(); p = Number(e.target.value) / 1000; }"
        />
        <div class="row">
          <!-- §227: 재생/정지 = 프리뷰 클릭 (별도 버튼 폐기) -->
          <span class="time">{{ timeLabel }}</span>
          <!-- §233: pingpong · cycle, 기본 pingpong (§246: once 폐기) -->
          <div class="segMini loopSeg">
            <button :class="{ on: loopMode === 'pingpong' }" @click="loopMode = 'pingpong'">pingpong</button>
            <button :class="{ on: loopMode === 'loop' }" @click="loopMode = 'loop'">cycle</button>
          </div>
          <label class="cycWrap" title="Cycles to export (pingpong cycle = round trip)">
            ×<input class="numIn cycIn" type="number" min="1" max="8" v-model.number="cycles" />
          </label>
        </div>
        <div class="optRow">
          <span class="optLabel">Frame rate</span>
          <div class="segMini">
            <button :class="{ on: fps === 30 }" @click="fps = 30">30fps</button>
            <button :class="{ on: fps === 24 }" @click="fps = 24">24fps</button>
          </div>
        </div>
        <!-- ── §247: 익스포트 그룹 — 포맷 · 배율 · 투명 · 끝 프레임 홀드 · 저장 ── -->
        <div class="sectHead">Export</div>
        <div class="optRow">
          <span class="optLabel">Format</span>
          <div class="segMini">
            <button :class="{ on: exportCfg.format === 'webm' }" @click="exportCfg.format = 'webm'">WebM</button>
            <button :class="{ on: exportCfg.format === 'png' }" @click="exportCfg.format = 'png'">PNG seq</button>
          </div>
        </div>
        <div class="optRow">
          <span class="optLabel">Scale</span>
          <div class="segMini">
            <button :class="{ on: exportCfg.scale === 0.5 }" @click="exportCfg.scale = 0.5">0.5×</button>
            <button :class="{ on: exportCfg.scale === 1 }" @click="exportCfg.scale = 1">1×</button>
            <button :class="{ on: exportCfg.scale === 2 }" @click="exportCfg.scale = 2">2×</button>
          </div>
        </div>
        <div class="optRow">
          <span class="optLabel">Transparent bg</span>
          <!-- §247: PNG 전용 — WebM 실시간 녹화는 알파 비보존 -->
          <input
            type="checkbox" v-model="exportCfg.alpha" :disabled="exportCfg.format !== 'png'"
            :title="exportCfg.format === 'png' ? 'Drop the frame background (alpha PNG)' : 'PNG sequence only'"
          />
        </div>
        <div class="optRow">
          <span class="optLabel">End hold (ms)</span>
          <input class="numIn holdIn" type="number" min="0" max="5000" step="100" v-model.number="exportCfg.hold" />
        </div>
        <div class="exRow">
          <button class="exBtn" :disabled="exporting" @click="doExport">
            {{ exporting ? `Exporting… ${exportPct}%` : exportCfg.format === 'png' ? 'Export PNG sequence' : 'Export WebM' }}
          </button>
        </div>
        <div class="menuNote">Saved as {{ fileBase }} — timing per connection via the wire ≡ control</div>
      </template>
    </template>
    <!-- §245: 페어링 진입점 변경 — opt-드래그 복제 폐기, 뱃지 팝업(Make paired keyframe)으로 -->
    <div v-else class="empty">
      Select a frame and click its ▶ badge → Make paired keyframe, then drag the right node onto the copy's left node — the connection plays here
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
    /* §232·§233: 원 90%(96→86px) · 아이콘 115%(44→50px) */
    width: 86px; height: 86px; padding: 18px;
    background: var(--space-black); border-radius: 50%;
    fill: var(--text);
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
.segMini { // §244: loopSeg → 공용 (fps 세그도 동일 문법)
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
.exRow { display: flex; gap: 6px; align-items: center; }
// §244: 익스포트 반복 회수 — ×n (§246: 루프 모드 세그 옆으로 이동)
.cycWrap {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
}
// §247: 공용 숫자 입력 (반복 ×n · 끝 프레임 홀드)
.numIn {
  @include text-field;
  width: 28px; height: 21px; padding: 0 2px; text-align: center;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &:disabled { color: var(--disabled); }
}
.holdIn { width: 48px; }
// §247: 옵션 접기 토글 — 프리뷰 하단 슬림 셰브론 (풀폭)
.optTg {
  border: none; background: none; cursor: pointer; padding: 0;
  height: 12px; margin: -4px 0; display: flex; align-items: center; justify-content: center;
  svg { width: 14px; height: 14px; fill: none; stroke: var(--faint); stroke-width: 2; stroke-linecap: square; }
  &:hover svg { stroke: var(--accent); }
}
// §247: 옵션 행 — L5 라벨 + 우측 컨트롤 (메인 패널 행 문법)
.optRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.optLabel {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
  &::first-letter { text-transform: uppercase; }
}
// §247: 섹션 헤드 — L3 (액센트 캡스, 메인 패널 SIZE/STYLE 문법)
.sectHead {
  font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--accent);
  text-transform: uppercase; letter-spacing: var(--ls-caps);
  margin-top: 2px;
}
.exBtn {
  @include bordered-control; // §216 버튼 단일 규격
  flex: 1; height: 21px; display: inline-flex; align-items: center; justify-content: center;
  text-transform: capitalize;
  &:disabled { color: var(--faint); cursor: default; }
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
