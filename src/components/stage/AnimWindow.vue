<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { saveFileAs } from '../../utils/saveFile.js';
import UnitGraphic from './UnitGraphic.vue';
import { frameAttrs } from '../../geometry/frameGrid.js';
import { bezierEase, samplePose } from '../../geometry/anim.js';
import { dockBridges, dockAttachedEnds } from '../../geometry/dock.js';
import '../../ui/cursors.js'; // §264: 전역 커서 클래스(.curScale-se) 주입 — 인라인 스타일 커서 폐기

// §224: 애니메이션 창 (Phase C) — 시뮬레이션 재생 + 전역 재생 파라미터 (fps 30/24 · pingpong/cycle — §246: once 폐기).
// 엣지 소속 파라미터(duration·곡선)는 와이어 중앙 컨트롤이 담당(§220 확정) — 여기선 재생만.
// 좌하단 정렬 바 위 플로팅 — 프리셋창(우하단)과 대칭.
const props = defineProps({
  edge: { default: null },        // 선택된 animEdge (null = 빈 상태)
  fromFrame: { default: null },
  toFrame: { default: null },
  fromUnits: { type: Array, default: () => [] },
  toUnits: { type: Array, default: () => [] },
  docks: { type: Array, default: () => [] }, // §284: 도크 브리지 — 프리뷰·익스포트에 샤프트 연장 반영
});

// §244: fps 옵션(30/24) — 재생·익스포트 공통 (§220의 30 고정 해제). cycles = 익스포트 반복 회수.
const fps = ref(Number(localStorage.getItem('eo.animFps')) === 24 ? 24 : 30);
watch(fps, (v) => localStorage.setItem('eo.animFps', String(v)));
// (§276: Stroke fix 토글 폐기 — threadMin 보정이 len 비례로 자연 소멸해 애니 배제 불필요)
const cycles = ref((() => {
  const v = Number(localStorage.getItem('eo.animCycles'));
  return Number.isInteger(v) && v >= 1 && v <= 8 ? v : 1;
})());
watch(cycles, (v) => {
  if (!Number.isInteger(v) || v < 1) cycles.value = 1;
  else if (v > 8) cycles.value = 8;
  else localStorage.setItem('eo.animCycles', String(v));
});
// §247·§250: 익스포트 옵션 묶음 — format(WebM|MP4|GIF|JSON) · scale(0.5/1/2× — 1920 캡 동승) ·
// alpha(배경 투명 — GIF 전용: 비디오 실시간 녹화는 알파 비보존) · hold(끝 프레임 유지 ms, 루프 호흡)
const exportCfg = reactive({ format: 'webm', scale: 1, alpha: false, hold: 0 });
try { Object.assign(exportCfg, JSON.parse(localStorage.getItem('eo.animExport') || '{}')); } catch { /* 기본값 유지 */ }
if (!['webm', 'mp4', 'gif', 'json'].includes(exportCfg.format)) exportCfg.format = 'webm'; // §250: 구 'png' 이관
watch(exportCfg, (v) => localStorage.setItem('eo.animExport', JSON.stringify(v)));
// §247·§249: 옵션 접기 — 타이틀바 우측 토글, 프리뷰 제외 전부 숨김
const optsOpen = ref(localStorage.getItem('eo.animOptsOpen') !== '0');
watch(optsOpen, (v) => localStorage.setItem('eo.animOptsOpen', v ? '1' : '0'));

// §226: 창 크기 — 화면 우하단 그립으로 조절. 비율은 임의가 아니라 **보고 있는 프레임 비율 고정**:
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
  } else {
    // §265: cycle — 핑퐁에서 넘어온 dir=-1 잔존 시 p가 음수로 폭주하며 화면이 먹통이 되던 버그.
    // cycle은 항상 전진.
    dir = 1;
    if (np >= 1) np = 0;
    if (np < 0) np = 0;
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
// §264: 시뮬레이터 설정 = **엣지(연결)에 저장** — 연결이 살아있는 동안 그 연결의 설정이 유지되고
// (자동저장 포함 — animEdges에 동반 직렬화), 연결 삭제 시 함께 소멸. 전역(localStorage) 값은
// "새 연결의 초기값" 역할로 유지.
let simLoading = false;
function loadSim(e) {
  if (!e?.sim) return;
  simLoading = true;
  if (e.sim.loop === 'pingpong' || e.sim.loop === 'loop') loopMode.value = e.sim.loop;
  if (e.sim.fps === 24 || e.sim.fps === 30) fps.value = e.sim.fps;
  if (Number.isInteger(e.sim.cycles)) cycles.value = e.sim.cycles;
  for (const k of ['format', 'scale', 'alpha', 'hold']) if (e.sim[k] !== undefined) exportCfg[k] = e.sim[k];
  nextTick(() => { simLoading = false; });
}
function saveSim() {
  if (simLoading || !props.edge) return;
  props.edge.sim = {
    loop: loopMode.value, fps: fps.value, cycles: cycles.value,
    format: exportCfg.format, scale: exportCfg.scale, alpha: exportCfg.alpha, hold: exportCfg.hold,
  };
}
watch(loopMode, () => { dir = 1; p.value = Math.min(1, Math.max(0, p.value)); }); // §265: 모드 전환 즉시 정규화
watch([loopMode, fps, cycles], saveSim);
watch(exportCfg, saveSim);
watch(() => props.edge, (e) => { stop(); p.value = 0; dir = 1; loadSim(e); }, { immediate: true });
onBeforeUnmount(stop);

const eased = computed(() => (props.edge ? bezierEase(props.edge.curve, p.value) : 0));
const pose = computed(() => {
  if (!props.edge || !props.fromFrame || !props.toFrame) return null;
  return samplePose(props.fromFrame, props.fromUnits, props.toFrame, props.toUnits, eased.value);
});
const fa = computed(() => (pose.value ? frameAttrs(pose.value.frame) : null));
// §284: 포즈의 도크 — 페어 계보로 아이템 매칭 (도크는 양 키프레임에 복제돼 있음 §283).
// 디졸브 분리(p<pair>a/b) 시 같은 pair의 첫 아이템 기준. §292: 도킹면 정보(ends)도 동일 소스.
const poseDockData = computed(() => {
  if (!pose.value || !props.docks.length) return null;
  const byId = new Map(props.fromUnits.map((u) => [u.id, u]));
  const fakeByPair = new Map();
  for (const it of pose.value.items) {
    const m = /^p(\d+)/.exec(it.key);
    if (m && !fakeByPair.has(+m[1])) fakeByPair.set(+m[1], { id: +m[1], x: it.dx, y: it.dy, type: 'unit', params: it.params });
  }
  const edges = [];
  for (const e of props.docks) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a.pair == null || b.pair == null) continue;
    if (fakeByPair.has(a.pair) && fakeByPair.has(b.pair)) edges.push({ from: a.pair, to: b.pair });
  }
  return { fakes: [...fakeByPair.values()], edges };
});
const poseBridges = computed(() => (poseDockData.value ? dockBridges(poseDockData.value.fakes, poseDockData.value.edges) : []));
const poseDockEnds = computed(() => (poseDockData.value ? dockAttachedEnds(poseDockData.value.fakes, poseDockData.value.edges) : new Map()));
const poseEndsFor = (key) => {
  const m = /^p(\d+)/.exec(key);
  return m ? poseDockEnds.value.get(+m[1]) ?? null : null;
};
// ── §233·§247·§250: 익스포트 — WebM/MP4(실시간 녹화) · GIF(비실시간) · JSON(웹 모션 데이터) ──
// 프리뷰 SVG(동일 렌더러)를 프레임마다 캔버스에 래스터. 파일명 = `From→To_1000ms` 규칙.
const exporting = ref(false);
const exportPct = ref(0);
const exportMsg = ref(''); // §250: 폴백 안내 등 1회성 메시지 (menuNote 자리)
const fileBase = computed(() => {
  const nm = (u) => (u?.name || 'Frame').replace(/[\\/:*?"<>|]/g, '-');
  return `${nm(props.fromFrame)}→${nm(props.toFrame)}_${props.edge?.duration ?? 0}ms`;
});
// §250: JSON (웹 모션용) — 두 키프레임 + 타이밍을 재생 가능한 데이터로 직렬화 (렌더 독립)
function motionJson() {
  const unitOf = (u, f) => ({
    name: u.name, pair: u.pair ?? null,
    x: u.x - f.x, y: u.y - f.y, params: { ...u.params },
  });
  return {
    version: 1,
    generator: 'eo-graphic-builder',
    fps: fps.value,
    durationMs: props.edge.duration,
    curve: [...props.edge.curve], // cubic-bezier [x1, y1, x2, y2]
    loop: loopMode.value,         // 'pingpong' | 'loop'
    cycles: cycles.value,
    endHoldMs: Math.max(0, Number(exportCfg.hold) || 0),
    keyframes: [
      { role: 'from', frame: { ...props.fromFrame.params }, units: props.fromUnits.map((u) => unitOf(u, props.fromFrame)) },
      { role: 'to', frame: { ...props.toFrame.params }, units: props.toUnits.map((u) => unitOf(u, props.toFrame)) },
    ],
  };
}
async function doExport() {
  if (!props.edge || !pose.value || exporting.value) return;
  stop();
  exportMsg.value = '';
  if (exportCfg.format === 'json') {
    await saveFileAs(new Blob([JSON.stringify(motionJson(), null, 2)], { type: 'application/json' }), `${fileBase.value}.json`, 'export');
    return;
  }
  exporting.value = true;
  exportPct.value = 0;
  // §257: 재생/익스포트 중 편집 정책 — 재생 중 편집 = 라이브 반영(의도), 익스포트 중 편집 =
  // 결과물에 섞여 들어감 → 진행 중 안내문 상시 표시 (유일한 실제 위험 시나리오)
  const EXPORT_NOTE = 'Exporting — leave the document untouched until it finishes';
  exportMsg.value = EXPORT_NOTE;
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
    const ctx = canvas.getContext('2d', { willReadFrequently: exportCfg.format === 'gif' });
    const alpha = exportCfg.format === 'gif' && exportCfg.alpha; // §250: 투명 = GIF 전용
    // §251: GIF 외 포맷에서 투명 체크 시 — 배경 유지 안내 (체크박스 자체는 상시 활성)
    if (exportCfg.alpha && exportCfg.format !== 'gif') exportMsg.value = 'Transparent bg applies to GIF only — background kept';
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
    if (exportCfg.format === 'gif') {
      // §250: GIF — 비실시간 프레임 루프 (gifenc: 팔레트 양자화 + LZW). 홀드 = 끝 프레임 딜레이 연장
      const frameMs = 1000 / fps.value;
      const n = Math.max(2, Math.round(total / frameMs));
      const gif = GIFEncoder();
      const fmt = alpha ? 'rgba4444' : 'rgb444';
      const addFrame = (delayMs) => {
        const { data } = ctx.getImageData(0, 0, cw, ch);
        const palette = quantize(data, 256, { format: fmt });
        const index = applyPalette(data, palette, fmt);
        gif.writeFrame(index, cw, ch, { palette, delay: Math.round(delayMs), transparent: alpha, dispose: alpha ? 2 : -1 });
      };
      for (let i = 0; i < n; i += 1) {
        await drawAt(tAt(i * frameMs));
        addFrame(frameMs);
        exportPct.value = Math.round((i / (n + 1)) * 100);
      }
      await drawAt(endT);
      addFrame(frameMs + hold);
      gif.finish();
      exportPct.value = 100;
      await saveFileAs(new Blob([gif.bytes()], { type: 'image/gif' }), `${fileBase.value}.gif`, 'export');
    } else {
      // WebM / MP4 — 실시간 녹화. §250: MP4 미지원 브라우저는 WebM 폴백 + 안내
      const wantMp4 = exportCfg.format === 'mp4';
      const cand = wantMp4
        ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4']
        : ['video/webm;codecs=vp9', 'video/webm'];
      let mime = cand.find((m) => MediaRecorder.isTypeSupported(m));
      let ext = wantMp4 ? 'mp4' : 'webm';
      if (!mime) {
        mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        ext = 'webm';
        exportMsg.value = 'MP4 not supported by this browser — saved as WebM';
      }
      const stream = canvas.captureStream(fps.value);
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
      await saveFileAs(new Blob(chunks, { type: mime.split(';')[0] }), `${fileBase.value}.${ext}`, 'export');
    }
  } finally {
    exporting.value = false;
    p.value = 0;
    if (exportMsg.value === EXPORT_NOTE) exportMsg.value = ''; // 폴백 안내(MP4→WebM 등)는 유지
  }
}

const timeLabel = computed(() => {
  const d = props.edge?.duration ?? 0;
  return `${((p.value * d) / 1000).toFixed(2)}s / ${(d / 1000).toFixed(2)}s`;
});
// §226: 프리뷰 높이 = 폭 × 프레임 비율 (창 리사이즈가 프레임 비율을 유지)
// §257: 화면 좌우 패딩 = 5px (§254 3px + 2 — 사용자 확정). 내부 폭 = winW − 창보더2 − 10
const previewH = computed(() => {
  const ratio = pose.value ? pose.value.H / pose.value.W : 9 / 16;
  return Math.round((winW.value - 12) * ratio);
});
// §251: 재생/정지 글리프 = 화면 비례 (지름 ≈ 화면 높이 65%, 아이콘 ≈ 지름 46% — 유튜브류 사이즈감)
const playD = computed(() => Math.max(48, Math.min(220, Math.round(previewH.value * 0.36))));
// §252: 출력 총 길이 = duration × 반복 + 홀드 — Cycles/End hold 합성 결과를 숫자로 보여줘 혼동 제거
const totalLabel = computed(() => {
  if (!props.edge) return '';
  const legs = loopMode.value === 'loop' ? cycles.value : cycles.value * 2;
  const t = (props.edge.duration * legs + Math.max(0, Number(exportCfg.hold) || 0)) / 1000;
  return `${Math.round(t * 10) / 10}s`;
});
</script>

<template>
  <div
    ref="rootEl"
    class="animWin"
    :class="{ floating: !!pos, collapsed: pose && !optsOpen }"
    :style="{ width: winW + 'px', ...(pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' } : {}) }"
    @pointerdown.stop="onWinDown" @wheel.stop @contextmenu.stop.prevent
  >
    <!-- §251: 접기 토글은 창 하단 · §252: 타이틀 우측 = 재생 구간명 (풀 Neon 와이어 = 이 구간) -->
    <div class="titleRow">
      <h2 class="title" title="Drag to move">Animation Simulator</h2><!-- §260: 명칭 변경 -->
      <span v-if="pose" class="segName" :title="`${fromFrame?.name} → ${toFrame?.name}`">{{ fromFrame?.name }} → {{ toFrame?.name }}</span>
    </div>
    <template v-if="pose">
      <!-- 프리뷰 — viewBox = 프레임(크롭/카메라): 바깥 유닛은 자동 클립 (§220 시뮬 클립) -->
      <div class="pvWrap">
        <svg class="preview" :viewBox="`0 0 ${pose.W} ${pose.H}`" :style="{ height: previewH + 'px' }">
          <!-- §260: 양옆 1px 선의 진짜 정체 = 프레임 rect 가장자리 안티앨리어싱으로 svg 배경이
               0.5px 비치던 것 — 배경 rect를 viewBox 밖까지 1px 오버드로(루트 클립이 잘라줌, export 동일) -->
          <rect :x="-1" :y="-1" :width="pose.W + 2" :height="pose.H + 2" :fill="fa.fill" :stroke="fa.stroke" :stroke-width="fa.strokeW" />
          <!-- §284: 도크 브리지 — 샤프트 연장 (유닛 아래 레이어, 갭 애니에 동승) -->
          <polygon
            v-for="(bp, bi) in poseBridges" :key="'pb' + bi"
            :points="bp.pts.map((p) => `${p[0]},${p[1]}`).join(' ')"
            :fill="bp.fill"
          />
          <g v-for="it in pose.items" :key="it.key" :transform="`translate(${it.dx} ${it.dy})`" :opacity="it.opacity">
            <UnitGraphic :params="it.params" :seam-width="0.75" :docked-ends="poseEndsFor(it.key)" />
          </g>
        </svg>
        <!-- §228: 호버 시 중앙 재생/정지 안내 버튼 (클릭 판정은 프리뷰 전체)
             §251: 크기 = 화면 비례 (playD — 리사이즈를 따라 글리프도 스케일) -->
        <div class="pvPlay">
          <!-- §232: 필 글리프 + 광학 중심 보정(삼각형 우측 치우침 상쇄) -->
          <svg
            viewBox="0 0 24 24"
            :style="{ width: playD + 'px', height: playD + 'px', padding: Math.round(playD * 0.07) + 'px' }"
          >
            <!-- §253: 삼각형 좌측 보정 — bbox 중심 +2.65(11%)는 과우측, +1.15(≈5% 광학 표준)로 -->
            <path v-if="!playing" d="M7.8 5.2 L18.5 12 L7.8 18.8 Z" />
            <g v-else><rect x="7" y="5.5" width="3.6" height="13" /><rect x="13.4" y="5.5" width="3.6" height="13" /></g>
          </svg>
        </div>
        <!-- §248: 크기 조절 그립 = **화면(프리뷰) 우하단** — 리사이즈가 곧 화면 스케일이라 화면에 귀속 -->
        <div class="sizeGrip curScale-se" title="Drag to resize (frame ratio locked)" @pointerdown.stop="onSizeGripDown">
          <svg viewBox="0 0 10 10"><path d="M9 1 1 9 M9 5 5 9" /></svg>
        </div>
      </div>
      <template v-if="optsOpen">
        <!-- ── 재생 그룹: 스크러버 · 시간 · 루프 모드(시뮬 보기 전용) · 프레임레이트 ── -->
        <input
          class="scrub" type="range" min="0" max="1000" :value="Math.round(p * 1000)"
          @input="(e) => { stop(); p = Number(e.target.value) / 1000; }"
        />
        <div class="row">
          <!-- §227: 재생/정지 = 프리뷰 클릭 (별도 버튼 폐기) -->
          <span class="time">{{ timeLabel }}</span>
          <!-- §233: pingpong · cycle, 기본 pingpong (§246: once 폐기 — 시뮬레이터 보기 옵션) -->
          <div class="segMini loopSeg">
            <button :class="{ on: loopMode === 'pingpong' }" @click="loopMode = 'pingpong'">pingpong</button>
            <button :class="{ on: loopMode === 'loop' }" @click="loopMode = 'loop'">cycle</button>
          </div>
        </div>
        <div class="optRow">
          <span class="optLabel">Frame rate</span>
          <div class="segMini">
            <button :class="{ on: fps === 30 }" @click="fps = 30">30fps</button>
            <button :class="{ on: fps === 24 }" @click="fps = 24">24fps</button>
          </div>
        </div>
        <!-- ── §247·§251: 익스포트 그룹 — 투명 · 배율 · 반복 · 홀드 · 포맷(맨 아래) · 저장 ── -->
        <div class="sectHead">Export</div>
        <div class="optRow">
          <span class="optLabel">Transparent bg</span>
          <!-- §251: 상시 활성 (GIF 외는 익스포트 시 안내) · §257: MP4 선택 시에만 비활성 (사용자 확정) -->
          <input
            type="checkbox" v-model="exportCfg.alpha" :disabled="exportCfg.format === 'mp4'"
            :title="exportCfg.format === 'mp4' ? 'MP4 cannot carry alpha' : 'Drop the frame background — applies to GIF (binary alpha)'"
          />
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
          <span class="optLabel">Cycles</span>
          <label class="cycWrap" title="Cycles to export (pingpong cycle = round trip)">
            ×<input
              class="numIn cycIn" type="number" min="1" max="8" v-model.number="cycles"
              @keydown.enter.stop.prevent="$event.target.blur()"
            />
          </label>
        </div>
        <div class="optRow">
          <span class="optLabel">End hold (ms)</span>
          <input
            class="numIn holdIn" type="number" min="0" max="5000" step="100" v-model.number="exportCfg.hold"
            @keydown.enter.stop.prevent="$event.target.blur()"
          />
        </div>
        <div class="optRow">
          <span class="optLabel">Format</span>
          <!-- §257: 순서 = WebM · JSON · GIF · MP4 (사용자 확정) -->
          <div class="segMini">
            <button :class="{ on: exportCfg.format === 'webm' }" @click="exportCfg.format = 'webm'">WebM</button>
            <button :class="{ on: exportCfg.format === 'json' }" @click="exportCfg.format = 'json'">JSON</button>
            <button :class="{ on: exportCfg.format === 'gif' }" @click="exportCfg.format = 'gif'">GIF</button>
            <button :class="{ on: exportCfg.format === 'mp4' }" @click="exportCfg.format = 'mp4'">MP4</button>
          </div>
        </div>
        <div class="exRow">
          <!-- §250: 라벨은 포맷 비반응 · §252: 총 길이 병기 (duration × cycles + hold) -->
          <button class="exBtn" :disabled="exporting" @click="doExport">
            {{ exporting ? `Exporting… ${exportPct}%` : `Export · ${totalLabel}` }}
          </button>
        </div>
        <!-- §251: 설명문 삭제 — 폴백/투명 안내 등 1회성 메시지만 조건 표시 -->
        <div v-if="exportMsg" class="menuNote">{{ exportMsg }}</div>
      </template>
      <!-- §251: 접기 토글 = 창 하단 (구 설명문 자리) — 접힘 상태에서도 이 자리에 상주 -->
      <button class="optTg" @click="optsOpen = !optsOpen">
        {{ optsOpen ? 'Hide options' : 'Show options' }}
        <svg viewBox="0 0 24 24"><path :d="optsOpen ? 'M6 14.5 12 8.5 18 14.5' : 'M6 9.5 12 15.5 18 9.5'" /></svg>
      </button>
    </template>
    <!-- §245·§250: 페어링 진입점 — 뱃지 팝업(Make keyframe) -->
    <div v-else class="empty">
      Select a frame and click its ▶ badge → Make keyframe, then drag the right node onto the copy's left node — the connection plays here
    </div>
    <!-- §248: 빈 상태 전용 그립 (화면이 없을 땐 창 우하단 유지) — 화면이 있으면 프리뷰 쪽 그립 사용 -->
    <div v-if="!pose" class="sizeGrip curScale-se" title="Drag to resize (frame ratio locked)" @pointerdown.stop="onSizeGripDown">
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
  z-index: var(--z-win-anim); /* §231·§272 */
  box-sizing: border-box;
  padding: var(--window-pad-y) var(--panel-pad);
  @include window-surface; /* §272 */
  @include chamfer(var(--chamfer-1)); // §272: 중형 창
  display: flex; flex-direction: column; gap: var(--sp-win); /* §271: 창 블록 리듬 */
}
/* (§251의 접힘 전용 하단 3px 폐기 — §257: 토글 바 패딩이 상태별로 달라지던 원인. 전 상태 공통 패딩) */
.title {
  /* L2 창 타이틀 (§218 전역 사다리) — §226: 드래그 = 창 이동 */
  font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--text);
  letter-spacing: 0; margin: 0; text-transform: capitalize;
  cursor: move; user-select: none; -webkit-user-select: none;
  flex-shrink: 0;
}
/* §252: 타이틀 우측 재생 구간명 — "풀 Neon 와이어 = 프리뷰 구간" 공식의 텍스트 짝 */
.titleRow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-win); min-width: 0; }
.segName {
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
/* §227: 클릭 = 재생/정지 · §257: 좌우 5px 패딩 (§254 3px + 2) */
.pvWrap { position: relative; cursor: pointer; margin: 0 calc(5px - var(--panel-pad)); }
.preview {
  width: 100%; display: block;
  /* §260: 배경 제거 — 프레임 rect가 전면 커버(+오버드로)라 불필요했고, 안티앨리어싱 틈으로
     비치며 양옆 1px 헤어라인을 만들던 원인 (§257의 보더 제거는 오진이었음) */
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0;
}
/* §228: 호버 시 중앙 재생/정지 표시 — 판정은 pvWrap, 표시는 오버레이 */
.pvPlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.12s; pointer-events: none;
  svg {
    /* §251: 크기 = 화면 비례 (인라인 playD) — border-box: width가 곧 원 지름 */
    box-sizing: border-box;
    background: var(--space-black); border-radius: 50%;
    fill: var(--text);
  }
}
.pvWrap:hover .pvPlay { opacity: 1; }
// §226·§248·§257·§262: 화면 우하단 크기 조절 그립 — 호버 시에만, **연하게** (커서 = cursorScale)
.sizeGrip {
  position: absolute; right: 0; bottom: 0; width: 22px; height: 22px; /* §263: 히트 확대 — 호버 이탈 깜빡임 완화 */
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.12s;
  svg { width: 12px; height: 12px; fill: none; stroke: var(--text); stroke-width: 1.6; stroke-linecap: square; }
  &:hover { opacity: 0.95; svg { stroke: var(--accent); } }
}
.pvWrap:hover .sizeGrip, .animWin:hover > .sizeGrip { opacity: 0.5; } /* §262: 평시 호버 = 연하게 */
/* §260·§261: 플레이바 — 메인 패널 슬라이더(.rg)와 동일 문법: 2px 트랙 + 정사각 썸.
   썸은 --thumb-size(8px)보다 한 단계 큰 10px 정사각 (사용자 확정: 동일~조금 큰) */
.scrub {
  width: 100%; margin: 0; height: 14px;
  -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
  &::-webkit-slider-runnable-track { height: 2px; background: var(--line); border-radius: 0; }
  &::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 10px; height: 10px; margin-top: -4px;
    background: var(--accent); border: none; border-radius: var(--radius);
  }
  &::-moz-range-track { height: 2px; background: var(--line); }
  &::-moz-range-thumb { width: 10px; height: 10px; background: var(--accent); border: none; border-radius: var(--radius); }
}
.row { display: flex; align-items: center; gap: var(--sp-group); } /* §271 */
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
// §244: 익스포트 반복 회수 — ×n (§250: Export 섹션으로 이동)
.cycWrap {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
}
// §247: 공용 숫자 입력 (반복 ×n · 끝 프레임 홀드) — §250: Enter = 커밋(blur)
.numIn {
  @include text-field;
  width: 28px; height: 21px; padding: 0 2px; text-align: center;
  -moz-appearance: textfield; appearance: textfield;
  &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  &:disabled { color: var(--disabled); }
}
.holdIn { width: 48px; }
// §251: 옵션 접기 토글 — 창 하단 중앙 라벨+셰브론 (구 설명문 자리)
.optTg {
  border: none; background: none; cursor: pointer; padding: 0;
  align-self: center;
  display: inline-flex; align-items: center; gap: 3px;
  font-family: inherit; font-size: var(--fs-2xs); letter-spacing: var(--ls-2xs); color: var(--faint);
  &::first-letter { text-transform: uppercase; }
  svg { width: 12px; height: 12px; fill: none; stroke: var(--faint); stroke-width: 2; stroke-linecap: square; }
  &:hover { color: var(--accent); svg { stroke: var(--accent); } }
}
// §247: 옵션 행 — L5 라벨 + 우측 컨트롤 (메인 패널 행 문법)
.optRow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-group); } /* §271 */
.optLabel {
  /* §279: 메인 패널 행 라벨(L? — Slider .label)과 동급으로 승격: fs-2xs·faint → fs-xs·dim */
  font-size: var(--fs-xs); letter-spacing: var(--ls-base); color: var(--dim);
  text-transform: capitalize;
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
