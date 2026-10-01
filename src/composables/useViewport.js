import { reactive, watch } from 'vue';
import { ZOOM_MIN, ZOOM_MAX } from '../geometry/constants.js';

const VP_KEY = 'eo.viewport';

// 팬/줌 뷰포트. 문서 모델과 완전 분리. localStorage 자동 저장/복원.
// world → screen: screen = world * scale + (x, y)
export function useViewport() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(VP_KEY) || 'null'); } catch { saved = null; }
  // §225: NaN 방역 — NaN은 JSON에서 null로 저장돼 다음 세션까지 전염된다. 복원 시 유한값 검증.
  const sane = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    && Number.isFinite(saved.scale) && saved.scale > 0;
  const vp = reactive(sane ? saved : { x: 0, y: 0, scale: 1 });
  const restored = !!sane;

  let t = null;
  watch(vp, () => {
    clearTimeout(t);
    t = setTimeout(() => localStorage.setItem(VP_KEY, JSON.stringify({ ...vp })), 500);
  });

  // §225: NaN 방역 — 비정상 입력(일부 마우스 드라이버/제스처의 이상 델타 등)이 한 번이라도 들어오면
  // 모든 산식이 NaN으로 전염되고 자동저장으로 고착되던 문제. 입력 가드 + 상태 자가 복구.
  function heal() {
    if (!Number.isFinite(vp.scale) || vp.scale <= 0) vp.scale = 1;
    if (!Number.isFinite(vp.x)) vp.x = 0;
    if (!Number.isFinite(vp.y)) vp.y = 0;
  }
  function panBy(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    heal();
    vp.x += dx;
    vp.y += dy;
  }
  // (px, py) 화면 고정점 기준 줌
  function zoomAt(px, py, factor) {
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(factor) || factor <= 0) return;
    heal();
    const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.scale * factor));
    const k = s / vp.scale;
    vp.x = px - k * (px - vp.x);
    vp.y = py - k * (py - vp.y);
    vp.scale = s;
  }
  function resetAt(px, py) {
    zoomAt(px, py, 1 / vp.scale);
  }
  function toWorld(px, py) {
    return [(px - vp.x) / vp.scale, (py - vp.y) / vp.scale];
  }
  return { vp, restored, panBy, zoomAt, resetAt, toWorld };
}
