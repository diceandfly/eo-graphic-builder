// ─── §224 애니메이션 보간 엔진 (Phase C) ─────────────────────
// Vue 의존 0 순수 함수 — 시뮬레이터 렌더와 테스트가 공유한다 (geometry 관례).
// 모델(§220 확정): 키프레임 = 프레임 페어, 유닛 대응 = pair id. 보간 정책 하이브리드 —
//  · 연속 수치 파라미터 = lerp
//  · cols = 다단계 스텝 (eased 진행률의 반올림 — 열이 하나씩 틱틱 변함)
//  · 비수치/불리언(차단 대상 — double/single·orientation 등) = 50% 컷 (편집 차단이 1차 방어)
//  · 페어 없는 유닛 = 페이드 인/아웃 (§220: "페어 없는 건 페이드")
// 좌표는 프레임 로컬(dx/dy) — 프레임이 캔버스 어디 있든 같은 모션. 프레임 = 크롭/카메라.

// 큐빅 베지어 타이밍 (CSS cubic-bezier와 동일 의미): curve = [x1, y1, x2, y2], 입력 x(진행률) → 출력 y
export function bezierEase(curve, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  const cx = (t) => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t;
  const cy = (t) => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
  // x(t) 단조 — 이분법이면 충분 (프레임당 수십 회 호출 수준)
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (cx(mid) < x) lo = mid;
    else hi = mid;
  }
  return cy((lo + hi) / 2);
}

// 곡선 프리셋 — §225: 사용자 시안(스피드그래프 글리프 9종)과 **같은 순서·같은 모양**:
// ⊓등속 · 삼각 벨 · 곡선 벨(기본) · 와이드 벨 · 라운드 플래토 · 상승 램프 · 하강 램프 · 급상승 램프 · 후반 피크
export const CURVE_PRESETS = [
  { key: 'linear', label: 'Linear', curve: [0, 0, 1, 1] },
  { key: 'in-out-2', label: 'In-out quad', curve: [0.45, 0, 0.55, 1] },
  { key: 'in-out-3', label: 'In-out cubic', curve: [0.65, 0, 0.35, 1] },
  { key: 'in-out-sine', label: 'In-out sine', curve: [0.37, 0, 0.63, 1] },
  { key: 'soft-linear', label: 'Soft linear', curve: [0.1, 0, 0.9, 1] },
  { key: 'in', label: 'In', curve: [0.32, 0, 0.67, 0] },
  { key: 'out', label: 'Out', curve: [0.33, 1, 0.68, 1] },
  { key: 'in-5', label: 'In quint', curve: [0.64, 0, 0.78, 0] },
  { key: 'late-peak', label: 'Late peak', curve: [0.7, 0, 0.85, 1] },
];
export const DEFAULT_CURVE = [0.65, 0, 0.35, 1]; // 연결 기본값 = 곡선 벨 (ease in-out)

const lerp = (a, b, t) => a + (b - a) * t;

// 파라미터 보간 — cols 다단계 스텝, 수치 lerp, 그 외 50% 컷.
// §225: 패널 편집을 거친 값이 문자열 숫자("500")로 저장될 수 있어 **수치 강제 변환** —
// 문자열이면 전부 50% 컷으로 빠져 "한 프레임에 싹 바뀌는" 버그가 났던 원인.
export function lerpParams(a, b, t) {
  const out = { ...a };
  for (const k in b) {
    const av = a[k];
    const bv = b[k];
    if (av === bv) { out[k] = av; continue; }
    const an = typeof av === 'boolean' ? NaN : Number(av);
    const bn = typeof bv === 'boolean' ? NaN : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      out[k] = k === 'cols' || k === 'rows' ? Math.round(lerp(an, bn, t)) : lerp(an, bn, t);
    } else {
      out[k] = t < 0.5 ? av : bv;
    }
  }
  return out;
}

// 포즈 샘플 — fromF/toF: 프레임 유닛, fromUnits/toUnits: 각 키프레임 소유 유닛들, t: eased 진행률.
// 반환: { W, H, frame, items: [{ key, params, dx, dy, opacity }] } — dx/dy = 프레임 로컬.
export function samplePose(fromF, fromUnits, toF, toUnits, t) {
  const byPair = new Map();
  for (const u of toUnits) if (u.pair != null) byPair.set(u.pair, u);
  const items = [];
  const matchedTo = new Set();
  for (const a of fromUnits) {
    const b = a.pair != null ? byPair.get(a.pair) : null;
    if (b) {
      matchedTo.add(b.id);
      items.push({
        key: `p${a.pair}`,
        params: lerpParams(a.params, b.params, t),
        dx: lerp(a.x - fromF.x, b.x - toF.x, t),
        dy: lerp(a.y - fromF.y, b.y - toF.y, t),
        opacity: lerp(a.params.opacity ?? 100, b.params.opacity ?? 100, t) / 100,
      });
    } else {
      // 시작 키프레임에만 존재 — 페이드 아웃
      items.push({
        key: `a${a.id}`, params: a.params, dx: a.x - fromF.x, dy: a.y - fromF.y,
        opacity: ((a.params.opacity ?? 100) / 100) * (1 - t),
      });
    }
  }
  for (const b of toUnits) {
    if (matchedTo.has(b.id)) continue;
    if (b.pair != null && byPair.get(b.pair) === b && fromUnits.some((a) => a.pair === b.pair)) continue;
    // 끝 키프레임에만 존재 — 페이드 인
    items.push({
      key: `b${b.id}`, params: b.params, dx: b.x - toF.x, dy: b.y - toF.y,
      opacity: ((b.params.opacity ?? 100) / 100) * t,
    });
  }
  // 프레임 전제 = 동일 크기(§220) — 뷰박스는 시작 프레임 기준 (크롭/카메라)
  return { W: fromF.params.W, H: fromF.params.H, frame: fromF.params, items };
}
