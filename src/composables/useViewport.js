import { reactive } from 'vue';
import { ZOOM_MIN, ZOOM_MAX } from '../geometry/constants.js';

// 팬/줌 뷰포트. 문서 모델과 완전 분리.
// world → screen: screen = world * scale + (x, y)
export function useViewport() {
  const vp = reactive({ x: 0, y: 0, scale: 1 });

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
  return { vp, panBy, zoomAt, resetAt, toWorld };
}
