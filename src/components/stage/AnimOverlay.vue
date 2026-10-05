<script setup>
import { ref, computed } from 'vue';
import { ICONS } from '../../ui/icons.js';

// §223: 애니메이션 모드 오버레이 (Phase B) — 프레임 좌/우 원형 노드 + 키프레임 연결 와이어.
// 월드 좌표 SVG 그룹으로 렌더 (DashboardStage .world 내부). 노드/와이어는 화면 고정 크기.
// 와이어 = 수평 탄젠트 큐빅 베지어 — 거리에 비례해 탄젠트가 늘어나는 탄력 곡선 (Grasshopper류, §220 확정).
// 규칙(§220): 우(from)→좌(to)만 · 노드당 1연결 · 재드래그 = 이설 · 빈 곳 드롭 = 해제.
const props = defineProps({
  units: { type: Array, required: true },
  edges: { type: Array, required: true },
  scale: { type: Number, required: true },
  clientToWorld: { type: Function, required: true }, // (cx, cy) => [wx, wy]
  selectedEdge: { default: null }, // §224: 선택 엣지 — 와이어 강조 + 애니메이션 창 연동
  dimmed: Boolean, // §225: 애니 모드 밖 — 연결 와이어만 회색 점선으로 표시 (노드·조작 없음)
  selectedIds: { type: Array, default: () => [] }, // §245: 선택 미페어 프레임 = 고스트 뱃지 (페어링 진입점)
  showBadges: { type: Boolean, default: true }, // §250: 페어 ▶ 뱃지 표시 토글 (바운딩박스 팝업)
  viewRect: { type: Object, default: null }, // §273: 뷰포트 월드 사각형 {x0,y0,x1,y1} — 페어 번호를 화면 가시 프레임 한정으로 매김
});
const emit = defineEmits(['connect', 'disconnect', 'edgeClick', 'edgeSelect', 'pairContext', 'pairClick']);
const edgeKey = (e) => `${e.from}-${e.to}`;

const pxs = (n) => n / props.scale;
const frames = computed(() => props.units.filter((u) => u.type === 'frame'));
const nodeOf = (f, side) => ({
  x: side === 'right' ? f.x + f.params.W : f.x,
  y: f.y + f.params.H / 2,
});
const frameById = (id) => props.units.find((u) => u.id === id);

// 탄력 베지어 — 탄젠트 길이는 화면 px 기준(가까우면 짧고 멀면 길게), 수평 방향 고정
function wirePath(x1, y1, x2, y2) {
  const t = pxs(Math.min(160, Math.max(40, Math.abs((x2 - x1) * props.scale) * 0.45)));
  return `M ${x1} ${y1} C ${x1 + t} ${y1}, ${x2 - t} ${y2}, ${x2} ${y2}`;
}
const edgeWires = computed(() =>
  props.edges
    .map((e) => {
      const a = frameById(e.from);
      const b = frameById(e.to);
      if (!a || !b) return null;
      const p1 = nodeOf(a, 'right');
      const p2 = nodeOf(b, 'left');
      return { e, d: wirePath(p1.x, p1.y, p2.x, p2.y), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
    })
    .filter(Boolean)
);
const connectedR = computed(() => new Set(props.edges.map((e) => e.from)));
const connectedL = computed(() => new Set(props.edges.map((e) => e.to)));

// §236: 페어 번호 — 링크 배지와 같은 로직: 계보(lineage)가 하나면 아이콘만, 여럿이면 1..k 번호
// §273: 카운트 대상 = **뷰포트에서 동시에 보이는** 페어 프레임 한정 — 팬/줌에 따라 1..k 재부여
const inViewRect = (f) => {
  const r = props.viewRect;
  if (!r) return true;
  return f.x + f.params.W >= r.x0 && f.x <= r.x1 && f.y + f.params.H >= r.y0 && f.y <= r.y1;
};
const pairIndex = computed(() => {
  const ids = [...new Set(frames.value.filter((f) => f.pair != null && inViewRect(f)).map((f) => f.pair))].sort((a, b) => a - b);
  return Object.fromEntries(ids.map((id, i) => [id, i + 1]));
});
const showPairNums = computed(() => Object.keys(pairIndex.value).length >= 2);
// §245: 뱃지 표시 대상 — 페어 프레임(상시) + 애니 모드에서 **선택된 미페어 프레임**(고스트:
// 번호 없는 점선 뱃지 = "여기서 페어를 만들 수 있다"는 진입점, 클릭 = Make paired keyframe 팝업)
const markFrames = computed(() => {
  if (!props.showBadges) return []; // §250: 뱃지 토글 off
  return frames.value.filter((f) => f.pair != null || (!props.dimmed && props.selectedIds.includes(f.id)));
});

// §254: 하이라이트 2단계 체계 (사용자 확정 — §247 3단계·§252 체인 컨텍스트 대체):
//  기본 = **딤드 네온 전체**(모든 노드·와이어·컨트롤), 클릭한 대상만 **풀 Neon** —
//  프레임 클릭 = 프레임 아웃라인+그 좌우 노드 / 와이어 클릭 = 라인+≡ 컨트롤+양끝 노드.
const isSelEdge = (e) => !props.dimmed && props.selectedEdge && edgeKey(props.selectedEdge) === edgeKey(e);
// §263: 활성 체인 집합 복원 — 비선택 체인 프레임에 **딤드 네온 아웃라인**(체인 전체 가독, §254에서
// 제거했던 것을 "선택 = 풀 Neon / 나머지 체인 = 딤드" 2단 문법으로 재도입)
const chainIds = computed(() => {
  if (!props.selectedEdge || props.dimmed) return new Set();
  const ids = new Set([props.selectedEdge.from, props.selectedEdge.to]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of props.edges) {
      const hasF = ids.has(e.from);
      const hasT = ids.has(e.to);
      if (hasF !== hasT) { ids.add(e.from); ids.add(e.to); grew = true; }
    }
  }
  return ids;
});
const chainDimFrames = computed(() =>
  frames.value.filter((f) => chainIds.value.has(f.id) && !props.selectedIds.includes(f.id))
);
// 노드 풀 Neon 조건: 소속 프레임이 선택됐거나, 선택 엣지가 그 노드에 꽂혀 있을 때
const hotNode = (f, side) => {
  if (props.dimmed) return false;
  if (props.selectedIds.includes(f.id)) return true;
  const e = props.selectedEdge;
  if (!e) return false;
  return side === 'right' ? e.from === f.id : e.to === f.id;
};

// ── 노드 드래그: 우측 노드에서 시작 → 좌측 노드에 드롭 = 연결 / 빈 곳 = 해제 ──
const drag = ref(null); // { fromId, x1, y1, x, y }
function onNodeDown(f, e) {
  const p = nodeOf(f, 'right');
  drag.value = { fromId: f.id, x1: p.x, y1: p.y, x: p.x, y: p.y };
  const mv = (ev) => {
    const [wx, wy] = props.clientToWorld(ev.clientX, ev.clientY);
    if (drag.value) { drag.value.x = wx; drag.value.y = wy; }
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', mv);
    const d = drag.value;
    drag.value = null;
    if (!d) return;
    const [wx, wy] = props.clientToWorld(ev.clientX, ev.clientY);
    // 드롭 판정: 가장 가까운 "다른 프레임의 좌측 노드" — 화면 14px 이내
    let hit = null;
    let best = 14 / props.scale;
    for (const t of frames.value) {
      if (t.id === d.fromId) continue;
      const n = nodeOf(t, 'left');
      const dist = Math.hypot(wx - n.x, wy - n.y);
      if (dist < best) { best = dist; hit = t; }
    }
    if (hit) emit('connect', d.fromId, hit.id);
    else emit('disconnect', d.fromId, 'right'); // 빈 곳 드롭 = 해제 (연결 없었으면 no-op)
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
}
</script>

<template>
  <g class="animOverlay">
    <!-- §263: 체인 프레임 딤드 아웃라인 — 비선택 체인 멤버도 체인 소속이 보이게 (선택 = pairSel 풀 Neon) -->
    <rect
      v-for="f in chainDimFrames" :key="'cd' + f.id"
      class="chainDim"
      :x="f.x" :y="f.y" :width="f.params.W" :height="f.params.H"
    />
    <!-- 연결 와이어 + 중앙 컨트롤 — §254: 기본 딤드 네온, 선택 엣지만 풀 Neon -->
    <g v-for="w in edgeWires" :key="'aw' + w.e.from + '-' + w.e.to">
      <path class="wire" :class="{ sel: isSelEdge(w.e), dim: dimmed }" :d="w.d" />
      <!-- §252: 와이어 라인 자체 클릭 = 그 연결 선택(체인 활성) — 보이지 않는 넓은 히트 (사용자 확정 4안) -->
      <path
        v-if="!dimmed"
        class="wireHit" :d="w.d"
        @pointerdown.stop.prevent="(ev) => { if (ev.button === 0) emit('edgeSelect', w.e); }"
      />
      <!-- §224·§237: 와이어 중앙 컨트롤 — 비활성 모드에선 완전 숨김 (회색 잔존 = 와이어·페어 마크만) -->
      <g
        v-if="!dimmed"
        class="pairBadge" :class="{ sel: isSelEdge(w.e) }"
        :transform="`translate(${w.mx} ${w.my})`"
        @pointerdown.stop.prevent="(ev) => emit('edgeClick', w.e, ev.clientX, ev.clientY)"
      >
        <circle :r="pxs(9)" />
        <!-- §235: 타이밍 컨트롤 = 메뉴(가로 막대 3개) — 글리프 확대 (12→14px) -->
        <g :transform="`translate(${-pxs(7)} ${-pxs(7)}) scale(${pxs(14) / 24})`">
          <path d="M6.5 7.5 H17.5 M6.5 12 H17.5 M6.5 16.5 H17.5" />
        </g>
      </g>
    </g>
    <!-- 드래그 중 임시 와이어 -->
    <path v-if="drag" class="wire temp" :d="wirePath(drag.x1, drag.y1, drag.x, drag.y)" />
    <!-- §231: 페어 인디케이터 — 페어 프레임 우상단 · §245: 선택 미페어 프레임 = 고스트 뱃지 -->
    <g
      v-for="f in markFrames" :key="'pm' + f.id"
      class="pairMark" :class="{ dim: dimmed, ghost: f.pair == null }"
      :transform="`translate(${f.x + f.params.W - pxs(9)} ${f.y - pxs(12)})`"
      @contextmenu.stop.prevent="(ev) => emit('pairContext', f, ev.clientX, ev.clientY)"
      @pointerdown.stop.prevent="(ev) => { if (ev.button === 0) emit('pairClick', f, ev.clientX, ev.clientY); }"
    >
      <!-- §233: 페어 = 재생 삼각형 · §236: 번호(계보 2개↑)·우클릭 = 프레임 ctx 팝업 -->
      <text v-if="showPairNums && f.pair != null" class="pairNum" :x="-pxs(12)" :y="pxs(4)" :font-size="pxs(12)" text-anchor="end">{{ pairIndex[f.pair] }}</text>
      <circle class="bg" :r="pxs(8)" />
      <g :transform="`translate(${-pxs(5.5)} ${-pxs(5.5)}) scale(${pxs(11) / 24})`">
        <path v-for="(d, i) in ICONS.animation" :key="i" :d="d" />
      </g>
    </g>
    <!-- 프레임 노드: 좌(입력)·우(출력) — §237: 비활성 모드엔 숨김, §244: **연결된 노드만 회색 잔존**
         (와이어가 어디서 시작·끝나는지 비애니 모드에서도 읽히도록 — 조작은 불가) -->
    <g v-for="f in frames" :key="'an' + f.id">
      <circle
        v-if="!dimmed || connectedL.has(f.id)"
        class="node left"
        :class="{ dim: dimmed, on: !dimmed && connectedL.has(f.id), hot: hotNode(f, 'left'), target: !dimmed && !!drag && drag.fromId !== f.id }"
        :cx="f.x" :cy="f.y + f.params.H / 2" :r="pxs(6)"
      />
      <circle
        v-if="!dimmed || connectedR.has(f.id)"
        class="node right"
        :class="{ dim: dimmed, on: !dimmed && connectedR.has(f.id), hot: hotNode(f, 'right') }"
        :cx="f.x + f.params.W" :cy="f.y + f.params.H / 2" :r="pxs(6)"
        @pointerdown.stop.prevent="(ev) => { if (!dimmed) onNodeDown(f, ev); }"
      />
    </g>
  </g>
</template>

<style scoped lang="scss">
// §254: 하이라이트 2단계 (사용자 확정) — 기본 = **딤드 네온**(Builder Neon 50% + 패널), 클릭 대상 = 풀 Neon.
$dim-neon: color-mix(in srgb, var(--accent) 50%, var(--panel));
// §263: 체인 딤드 아웃라인 — pairSel(풀 Neon 2.5)과 같은 두께, 색만 딤드
.chainDim {
  fill: none; stroke: #{$dim-neon}; stroke-width: 2.5;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
// §254: 와이어 — 기본 딤드 네온, 선택 엣지 = Neon 볼드(= 프리뷰 재생 구간 공식 §252)
.wire {
  fill: none; stroke: #{$dim-neon}; stroke-width: 1.5;
  vector-effect: non-scaling-stroke; opacity: 0.9;
}
.wire.sel { stroke: var(--accent); stroke-width: 2.5; opacity: 1; } // §224: 선택 엣지 강조
.wire.temp { stroke: var(--accent); stroke-dasharray: 5 4; opacity: 0.7; pointer-events: none; }
// §252: 와이어 히트 — 라인 주변 10px 투명 스트로크, 클릭 = 연결 선택
.wireHit {
  fill: none; stroke: transparent; stroke-width: 10;
  vector-effect: non-scaling-stroke; pointer-events: stroke; cursor: pointer;
}
// §228·§237: 애니 모드 밖 — 회색 잔존 = **와이어·페어 마크만** (노드·와이어 컨트롤은 완전 숨김)
.wire.dim { stroke: var(--dim); opacity: 0.85; pointer-events: none; }
// §231·§233: 페어 인디케이터 — 재생 삼각형 (프레임 우상단). 와이어 컨트롤(모래시계)과 글리프 구별.
.pairMark {
  cursor: pointer; // §243: 클릭 = 페어 팝업 (Unpair) · 우클릭 = 프레임 ctx 팝업 (§236)
  .bg { fill: var(--panel); stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  path { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: miter; }
  .pairNum { fill: var(--accent); font-family: inherit; font-weight: var(--fw-semibold); } // §236: 링크 배지 번호 문법
  // §243: 호버 = 반전 강조 — 클릭 가능한 컨트롤임을 표시 (와이어 컨트롤 선택 문법과 동일)
  &:hover .bg { fill: var(--accent); }
  &:hover path { stroke: var(--bg); }
  &.dim .bg { stroke: var(--dim); }
  &.dim path { stroke: var(--dim); }
  &.dim .pairNum { fill: var(--dim); }
  &.dim:hover .bg { fill: var(--dim); }
  // §245: 고스트 뱃지 — 미페어 선택 프레임의 페어링 진입점 (점선 링, 호버 시 실선 반전)
  &.ghost .bg { stroke-dasharray: 3 2.5; }
  &.ghost:hover .bg { stroke-dasharray: none; }
}
.node {
  // §254: 기본 = 딤드 네온 (전체 하이라이팅), 클릭 대상(.hot)만 풀 Neon
  fill: var(--panel); stroke: #{$dim-neon};
  stroke-width: 1.5; vector-effect: non-scaling-stroke;
  cursor: crosshair;
  &:hover { stroke: var(--accent); }
  &.on { fill: #{$dim-neon}; stroke: #{$dim-neon}; }
  // §254: 풀 Neon — 소속 프레임 선택 또는 선택 엣지의 양끝 노드
  &.hot { stroke: var(--accent); }
  &.hot.on { fill: var(--accent); stroke: var(--accent); }
  &.target { stroke: var(--accent); } // 드래그 중: 드롭 가능 노드 안내
  &.left { cursor: default; }
  // §244: 비애니 모드 — 연결된 노드만 회색 잔존 (와이어.dim과 같은 문법, 조작 불가)
  &.dim { fill: var(--dim); stroke: var(--dim); pointer-events: none; cursor: default; }
}
.pairBadge {
  // §254: 기본 = 딤드 네온, 선택 엣지의 컨트롤만 풀 Neon 반전
  circle { fill: var(--panel); stroke: #{$dim-neon}; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  path { fill: none; stroke: #{$dim-neon}; stroke-width: 2; stroke-linejoin: miter; stroke-linecap: square; }
  cursor: pointer; // §224: 클릭 = 엣지 파라미터 팝업
  &:hover circle { stroke: var(--accent); }
  &:hover path { stroke: var(--accent); }
  &.sel circle { fill: var(--accent); stroke: var(--accent); }
  &.sel path { stroke: var(--bg); }
  &.sel:hover path { stroke: var(--bg); }
}
</style>
