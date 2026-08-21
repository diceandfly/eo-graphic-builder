import { reactive, watch } from 'vue';
import { ZOOM_MIN, ZOOM_MAX } from '../geometry/constants.js';

const VP_KEY = 'eo.viewport';

// 팬/줌 뷰포트. 문서 모델과 완전 분리. localStorage 자동 저장/복원.
// world → screen: screen = world * scale + (x, y)
export function useViewport() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(VP_KEY) || 'null'); } catch { saved = null; }
  const vp = reactive(saved ?? { x: 0, y: 0, scale: 1 });
  const restored = !!saved;

  let t = null;
  watch(vp, () => {
    clearTimeout(t);
    t = setTimeout(() => localStorage.setItem(VP_KEY, JSON.stringify({ ...vp })), 500);
  });

  function panBy(dx, dy) {
    vp.x += dx;
    vp.y += dy;
  }
  // (px, py) 화면 고정점 기준 줌
  function zoomAt(px, py, factor) {
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
