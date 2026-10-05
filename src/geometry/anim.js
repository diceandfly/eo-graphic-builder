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
// §227: 사용자 확대 시안(AE 스피드그래프, in/out 영향도 표기) **순서·모양·수치 그대로**.
// 환산: 구간 시작 = out 영향도, 구간 끝 = in 영향도 → curve = [out/100, 0, 1 − in/100, 1] (1행 등속만 예외).
// icon = 시트 글리프 모사 수제 패스 (viewBox 0 0 24 20, 베이스라인 y17 — 샘플링 생성 폐기, §227 사용자 지시).
export const CURVE_PRESETS = [
  // §246: 1번 = **미드 스파이크** (중앙에서 속도가 가장 뾰족하게 솟는 "뿅" 이즈 — 사용자 정정:
  // ⊥ 글리프는 리니어가 아니라 중앙 스파이크의 속도그래프였음). out 100 → in 100.
  { key: 'spike', label: 'Ease 100 · 100', curve: [1, 0, 0, 1],
    icon: 'M4 17 H20 M12 17 V5' }, // ⊥ (양끝 정지 + 중앙 수직 스파이크)
  { key: 'ease-50', label: 'Ease 50 · 50', curve: [0.5, 0, 0.5, 1],
    icon: 'M5 17 C9 12, 10.5 4, 12 4 C13.5 4, 15 12, 19 17' },
  { key: 'ease-33', label: 'Ease 33 · 33', curve: [0.33, 0, 0.67, 1],
    icon: 'M5 17 C7.5 10, 9 4, 12 4 C15 4, 16.5 10, 19 17' },
  { key: 'ease-25', label: 'Ease 25 · 25', curve: [0.25, 0, 0.75, 1],
    icon: 'M5 17 C6.5 8, 8 4, 12 4 C16 4, 17.5 8, 19 17' },
  { key: 'ease-10', label: 'Ease 10 · 10', curve: [0.1, 0, 0.9, 1],
    icon: 'M5 17 C5 8, 6 4.5, 9 4.5 L15 4.5 C18 4.5, 19 8, 19 17' },
  { key: 'end-spike', label: 'Out 5 → in 100', curve: [1, 0, 0.95, 1],
    icon: 'M4 16.5 C12 16.2, 16.5 14, 18.5 8 C19 6.5, 19.3 5, 19.5 4 L19.5 17' }, // §228: 우단 수직 낙하 완성
  { key: 'start-spike', label: 'Out 100 → in 5', curve: [0.05, 0, 0, 1],
    icon: 'M4.5 17 L4.5 4 C4.7 5, 5 6.5, 5.5 8 C7.5 14, 12 16.2, 20 16.5' }, // §228: 좌단 수직 상승 + 우하향 (6번 좌우반전)
  { key: 'peak-late', label: 'Out 75 → in 33', curve: [0.75, 0, 0.67, 1],
    icon: 'M4 17 C9 15.5, 13.5 10, 15 5.5 C15.4 4.5, 15.8 4, 16 4 C17 4.5, 18.5 12, 19.5 17' },
  { key: 'peak-early', label: 'Out 33 → in 75', curve: [0.33, 0, 0.25, 1],
    icon: 'M4.5 17 C5.5 12, 7 4.5, 8 4 C8.2 4, 8.6 4.5, 9 5.5 C10.5 10, 15 15.5, 20 17' },
  // §246: 10번 = 리니어 복귀 버튼 (등속 — 속도그래프는 수평선). 9+1 = 5열 그리드 2행 완성.
  { key: 'linear', label: 'Linear', curve: [0, 0, 1, 1],
    icon: 'M4 10.5 H20' },
];
export const DEFAULT_CURVE = [0.33, 0, 0.67, 1]; // 연결 기본값 = Ease 33·33 (AE easy ease)

const lerp = (a, b, t) => a + (b - a) * t;

// §226: hex 색 보간 — #rgb/#rrggbb → RGB lerp (대표 사용례: fill 키프레임 변화.
// 문자열이라 50% 컷으로 떨어져 "50%에 뚝 바뀌는" 체감의 주범이었음)
const hexToRgb = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
export function lerpHex(a, b, t) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const c = ra.map((v, i) => Math.round(lerp(v, rb[i], t)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// §226: 보간 불가 이산키 — 수치여도 중간값이 무의미(orientation 45° 등). 편집 차단(§220 표)의 엔진측 방어.
const DISCRETE_KEYS = new Set([
  'orientation', 'flipX', 'threads', 'threadDir', 'gutterMode',
  'compModeX', 'compModeY', 'compOn', 'compLock', 'fillOn', 'strokeOn', 'gridOn', 'unitMode', 'showGuides',
]); // §229: direction은 rate와 결합한 부호 보간으로 이동 (컷 대상 아님)

// 파라미터 보간 — cols 다단계 스텝, 수치 lerp, 그 외 50% 컷.
// §225: 패널 편집을 거친 값이 문자열 숫자("500")로 저장될 수 있어 **수치 강제 변환** —
// 문자열이면 전부 50% 컷으로 빠져 "한 프레임에 싹 바뀌는" 버그가 났던 원인.
export function lerpParams(a, b, t) {
  const out = { ...a };
  // §229: 유닛 압축은 rate(크기)+direction(부호) 쌍 — 따로 보간하면 direction이 50%에 컷되며
  // 전체 패턴이 미러됨("50% 튐"의 실제 범인). 부호 있는 연속값으로 묶어 lerp 후 되돌린다.
  if ((a.rate !== b.rate || a.direction !== b.direction) && a.rate != null && b.rate != null) {
    // §261: 부호 결합을 **로그 지수** 기준으로 — 필드가 지수( e^(±ln r·N·u) )라 ln(r)·부호가
    // 레이아웃의 정칙 좌표. 구( (rate−1)·부호 ) 보간은 |·| 쿠스프로 50% 지점에서 변화율이
    // 꺾이며 "툭" 체감을 만들었음. 로그 보간은 균등(0)을 완전 매끄럽게 통과한다.
    const signed = (p) => Math.log(Math.max(1, Number(p.rate))) * (p.direction === 'StoL' ? -1 : 1);
    const sv = lerp(signed(a), signed(b), t);
    out.rate = Math.exp(Math.abs(sv));
    out.direction = sv >= 0 ? 'LtoS' : 'StoL';
  }
  for (const k in b) {
    if (k === 'rate' || k === 'direction') continue; // §229: 위에서 결합 처리
    const av = a[k];
    const bv = b[k];
    if (av === bv) { out[k] = av; continue; }
    if (DISCRETE_KEYS.has(k)) { out[k] = t < 0.5 ? av : bv; continue; } // §226: 이산키 명시 컷
    const hex = lerpHex(av, bv, t); // §226: 색은 RGB 보간
    if (hex) { out[k] = hex; continue; }
    const an = typeof av === 'boolean' ? NaN : Number(av);
    const bn = typeof bv === 'boolean' ? NaN : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      // §255: cols = 연속 보간 (부분 칸 렌더 — 디졸브/다단계 스텝 폐기). rows(프레임 가이드)도
      // 연속 — frameGrid가 자체 반올림하므로 거동 불변.
      out[k] = lerp(an, bn, t);
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
      const params = lerpParams(a.params, b.params, t);
      const dx = lerp(a.x - fromF.x, b.x - toF.x, t);
      const dy = lerp(a.y - fromF.y, b.y - toF.y, t);
      const op = lerp(a.params.opacity ?? 100, b.params.opacity ?? 100, t) / 100;
      // §228·§229: 보간 불가 차이(cols 토폴로지·이산키·비수치 — 과거에 작성된 키프레임 포함)는
      // 50% 컷 대신 **디졸브** — 두 상태를 겹쳐 크로스페이드, 연속 파라미터는 양쪽 모두에서 계속 lerp.
      // 이로써 "50% 점프"가 화면에 나타날 경로 자체가 없다.
      const hard = Object.keys(b.params).filter((k) => {
        const av = a.params[k];
        const bv = b.params[k];
        if (av === bv || k === 'rate' || k === 'direction') return false; // 압축은 부호 보간 처리
        if (DISCRETE_KEYS.has(k)) return true; // §255: cols는 연속 보간으로 전환 — 디졸브 대상 제외
        if (lerpHex(av, bv, 0.5)) return false;
        const an = typeof av === 'boolean' ? NaN : Number(av);
        const bn = typeof bv === 'boolean' ? NaN : Number(bv);
        return !(Number.isFinite(an) && Number.isFinite(bn));
      });
      if (hard.length) {
        const pa = { ...params };
        const pb = { ...params };
        for (const k of hard) { pa[k] = a.params[k]; pb[k] = b.params[k]; }
        items.push({ key: `p${a.pair}a`, params: pa, dx, dy, opacity: op * (1 - t) });
        items.push({ key: `p${a.pair}b`, params: pb, dx, dy, opacity: op * t });
      } else {
        items.push({ key: `p${a.pair}`, params, dx, dy, opacity: op });
      }
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
