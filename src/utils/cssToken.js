// CSS 커스텀 프로퍼티(디자인 토큰)를 JS에서 읽는 헬퍼.
// 시간 토큰(--tip-delay, --toast-time)처럼 JS 타이머가 토큰과 동기돼야 할 때 사용.
export function readTokenMs(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return fallback;
}
