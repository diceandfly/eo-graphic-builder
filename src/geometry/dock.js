// §294: 도킹 기하 — Vue 의존 0 순수 함수 (코드 관례: geometry/).
// 노드·샤프트 단면·브리지(§284)·가이드(§289)·결착면 맵(§292)·축 평행 판정(§282).
// 좌표는 전부 캔버스 px, 로컬 좌/우는 localPointToCanvas 기준(= 렌더 로컬).
import { localPointToCanvas } from './derive.js';

// §278: 도킹 노드 좌표 (캔버스 px) — 유닛 샤프트 중심선의 양 끝.
// 로컬 v = 샤프트 중심 (both = 1/2, one = 바닥 접지라 1 − dPct/200), u = 0(좌) | 1(우).
// orientation·flipX는 localPointToCanvas가 처리 — 회전 상태에서도 샤프트 실제 끝을 가리킨다.
export function dockNodePoint(unit, side) {
  const p = unit.params;
  const v = p.threads === 'one' ? 1 - (p.dPct ?? 0) / 200 : 0.5;
  const [cx, cy] = localPointToCanvas(p, side === 'right' ? 1 : 0, v);
  return [unit.x + cx * p.W, unit.y + cy * p.H];
}
// §284: 샤프트 단면 — 그 축 끝에서의 샤프트 상·하 모서리 점 (캔버스 px)
export function dockShaftEnd(unit, side) {
  const p = unit.params;
  const one = p.threads === 'one';
  const d = (p.dPct ?? 0) / 100;
  const vTop = one ? 1 - d : (1 - d) / 2;
  const vBot = one ? 1 : (1 + d) / 2;
  const u = side === 'right' ? 1 : 0;
  const [tx, ty] = localPointToCanvas(p, u, vTop);
  const [bx, by] = localPointToCanvas(p, u, vBot);
  return [[unit.x + tx * p.W, unit.y + ty * p.H], [unit.x + bx * p.W, unit.y + by * p.H]];
}
// §284: 도크 브리지 — 결착 갭을 **샤프트 연장**으로 메우는 폴리곤 2개 (도킹의 본래 목적:
// 두 유닛이 자연스런 거터와 함께 한 축으로 이어져 보이게). 양쪽 샤프트 단면을 취해 중간에서
// 접합 — 반쪽씩 각 유닛의 fill (두께가 다르면 사다리꼴 보간, 보통은 shape 링크로 동일).
// 끝은 유닛 안쪽으로 1px 연장 — 접합선 안티앨리어싱 틈 차단 (§200 문법).
// 공통 코어 — 양 유닛의 "서로를 향한" 샤프트 단면 쌍 (상·하 대응 정렬 포함)
function dockBridgeEnds(a, b) {
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const na = { l: dockNodePoint(a, 'left'), r: dockNodePoint(a, 'right') };
  const nb = { l: dockNodePoint(b, 'left'), r: dockNodePoint(b, 'right') };
  const ca = mid(na.l, na.r);
  const cb = mid(nb.l, nb.r);
  const sa = d2(na.r, cb) <= d2(na.l, cb) ? 'right' : 'left'; // 서로를 향한 끝 (§282와 동일 사상)
  const sb = d2(nb.r, ca) <= d2(nb.l, ca) ? 'right' : 'left';
  const pa = dockShaftEnd(a, sa);
  let pb = dockShaftEnd(b, sb);
  if (d2(pa[0], pb[0]) + d2(pa[1], pb[1]) > d2(pa[0], pb[1]) + d2(pa[1], pb[0])) pb = [pb[1], pb[0]]; // 상·하 대응 (역평행)
  return { pa, pb };
}
export function dockBridgePolys(a, b) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const { pa, pb } = dockBridgeEnds(a, b);
  const ma = mid(pa[0], pa[1]);
  const mb = mid(pb[0], pb[1]);
  const L = Math.hypot(mb[0] - ma[0], mb[1] - ma[1]) || 1;
  const dir = [(mb[0] - ma[0]) / L, (mb[1] - ma[1]) / L];
  // §285: 틈 보정 2px — 유닛 쪽 끝은 유닛 안으로, 중간 접합은 두 반쪽을 서로 1px씩(총 2px) 겹침
  // (접합선 AA 라인 제거 — 같은 fill이면 완전 비가시, 다른 fill이면 뒤쪽 반이 경계를 덮음)
  const ext = 2;
  const ov = 1;
  const paE = pa.map((pt) => [pt[0] - dir[0] * ext, pt[1] - dir[1] * ext]);
  const pbE = pb.map((pt) => [pt[0] + dir[0] * ext, pt[1] + dir[1] * ext]);
  const m0 = mid(pa[0], pb[0]);
  const m1 = mid(pa[1], pb[1]);
  const fwd = (pt) => [pt[0] + dir[0] * ov, pt[1] + dir[1] * ov];
  const bck = (pt) => [pt[0] - dir[0] * ov, pt[1] - dir[1] * ov];
  return [
    { pts: [paE[0], paE[1], fwd(m1), fwd(m0)], fill: a.params.fill },
    { pts: [bck(m0), bck(m1), pbE[1], pbE[0]], fill: b.params.fill },
  ];
}
// §292: 결착된 면 맵 — id → { left, right } (렌더 로컬 기준 — dockNodePoint의 'left'/'right'와 동일 축).
// 판정 = 상대 중심에 가까운 쪽 끝 (§282 기하 사상). 스테이지 렌더·익스포트·애니패널 프리뷰 공용.
export function dockAttachedEnds(units, docks) {
  const map = new Map();
  const byId = new Map(units.map((u) => [u.id, u]));
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  for (const e of docks ?? []) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a.type === 'frame' || b.type === 'frame') continue;
    for (const [u, p] of [[a, b], [b, a]]) {
      const l = dockNodePoint(p, 'left');
      const r = dockNodePoint(p, 'right');
      const c = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2]; // 상대 중심
      const ul = dockNodePoint(u, 'left');
      const ur = dockNodePoint(u, 'right');
      const side = d2(ur, c) <= d2(ul, c) ? 'right' : 'left';
      if (!map.has(u.id)) map.set(u.id, { left: false, right: false });
      map.get(u.id)[side] = true;
    }
  }
  return map;
}
// 문서 단위 일괄 — 스테이지·익스포트 공용
export function dockBridges(units, docks) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const out = [];
  for (const e of docks ?? []) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a.type === 'frame' || b.type === 'frame') continue;
    out.push(...dockBridgePolys(a, b));
  }
  return out;
}
// §289: 브리지 가이드 사각형 — 유닛 그리드가 켜져 있을 때 브리지 경계를 그리드 문법으로 표시
// (연장·겹침 보정 없는 순수 경계. visibleIds = 가이드가 보이는 유닛 — 한쪽이라도 포함되면 표시)
export function dockBridgeGuides(units, docks, visibleIds = null) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const out = [];
  for (const e of docks ?? []) {
    if (visibleIds && !visibleIds.has(e.from) && !visibleIds.has(e.to)) continue;
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a.type === 'frame' || b.type === 'frame') continue;
    const { pa, pb } = dockBridgeEnds(a, b);
    out.push({ pts: [pa[0], pa[1], pb[1], pb[0]] }); // §290: 표시 = 그리드 컬러 60% 면 덮기 (테두리/십자 폐기)
  }
  return out;
}

// §282: 두 유닛의 샤프트 축 평행 판정 (역평행 = 180°·미러 조합도 평행으로 간주)
export function dockAxesParallel(a, b) {
  const dir = (u) => {
    const [lx, ly] = dockNodePoint(u, 'left');
    const [rx, ry] = dockNodePoint(u, 'right');
    const L = Math.hypot(rx - lx, ry - ly) || 1;
    return [(rx - lx) / L, (ry - ly) / L];
  };
  const [ax, ay] = dir(a);
  const [bx, by] = dir(b);
  return Math.abs(ax * by - ay * bx) < 1e-3; // 외적 ≈ 0 = 평행 (부호 무관)
}
