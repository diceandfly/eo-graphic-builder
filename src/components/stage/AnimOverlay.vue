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
});
const emit = defineEmits(['connect', 'disconnect']);

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
    <!-- 연결 와이어 + 중앙 페어 아이콘 (엣지 파라미터 컨트롤 자리 — Phase C) -->
    <g v-for="w in edgeWires" :key="'aw' + w.e.from + '-' + w.e.to">
      <path class="wire" :d="w.d" />
      <g class="pairBadge" :transform="`translate(${w.mx} ${w.my})`">
        <circle :r="pxs(9)" />
        <g :transform="`translate(${-pxs(6)} ${-pxs(6)}) scale(${pxs(12) / 24})`">
          <path v-for="(d, i) in ICONS.animation" :key="i" :d="d" />
        </g>
      </g>
    </g>
    <!-- 드래그 중 임시 와이어 -->
    <path v-if="drag" class="wire temp" :d="wirePath(drag.x1, drag.y1, drag.x, drag.y)" />
    <!-- 프레임 노드: 좌(입력)·우(출력) — 연결된 노드는 액센트 필 -->
    <g v-for="f in frames" :key="'an' + f.id">
      <circle
        class="node left" :class="{ on: connectedL.has(f.id), target: !!drag && drag.fromId !== f.id }"
        :cx="f.x" :cy="f.y + f.params.H / 2" :r="pxs(6)"
      />
      <circle
        class="node right" :class="{ on: connectedR.has(f.id) }"
        :cx="f.x + f.params.W" :cy="f.y + f.params.H / 2" :r="pxs(6)"
        @pointerdown.stop.prevent="onNodeDown(f, $event)"
      />
    </g>
  </g>
</template>

<style scoped lang="scss">
.wire {
  fill: none; stroke: var(--accent); stroke-width: 1.5;
  vector-effect: non-scaling-stroke; opacity: 0.9;
}
.wire.temp { stroke-dasharray: 5 4; opacity: 0.7; pointer-events: none; }
.node {
  // 프레임 라벨과 같은 가독 문법: 캔버스 위 중립색, 호버/활성 = 액센트
  fill: var(--panel); stroke: color-mix(in srgb, var(--text) 60%, var(--faint));
  stroke-width: 1.5; vector-effect: non-scaling-stroke;
  cursor: crosshair;
  &:hover { stroke: var(--accent); }
  &.on { fill: var(--accent); stroke: var(--accent); }
  &.target { stroke: var(--accent); } // 드래그 중: 드롭 가능 노드 안내
  &.left { cursor: default; }
}
.pairBadge {
  circle { fill: var(--panel); stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  path { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: miter; }
  pointer-events: none; // Phase C: 엣지 컨트롤 팝업이 여기 앉음
}
</style>
