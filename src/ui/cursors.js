// ─── §241 커서 에셋 방향 변형 생성 ─────────────────────────────
// 디자인 에셋(cursorRotation = 우하단 기준, cursorScale = ↖↘ 대각)을 회전시켜
// 핸들 방향별 커서 CSS 값을 만든다. 포인터 계열(화살표 4종)과 달리 핸들 호버 커서는
// OS 관례대로 **중앙 핫스팟**. 정사각 캔버스에 중앙 배치 후 회전 — 어떤 각도도 클리핑 없음.
import rotationRaw from '../assets/cursor/cursorRotation.svg?raw';
import scaleRaw from '../assets/cursor/cursorScale.svg?raw';

const SIZE = 17; // 렌더 px (통념적 핸들 커서 크기, §240 85% 패밀리와 균형)

function orientedCursor(raw, deg) {
  const m = raw.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const vw = Number(m[1]);
  const vh = Number(m[2]);
  const S = Math.max(vw, vh);
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${S} ${S}">` +
    `<g transform="rotate(${deg} ${S / 2} ${S / 2}) translate(${(S - vw) / 2} ${(S - vh) / 2})">${inner}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(SIZE / 2)} ${Math.round(SIZE / 2)}`;
}

// 회전 핸들 — 원본 = 우하단(se). 시계방향 90° 스텝으로 네 모서리.
const ROT_DEG = { se: 0, sw: 90, nw: 180, ne: 270 };
// 스케일 핸들 — 원본 = ↖↘(nw-se) 대각. 축·반대각은 회전으로.
const SCALE_DEG = { nw: 0, se: 0, n: 45, s: 45, ne: 90, sw: 90, e: 135, w: 135 };

const rotCache = Object.fromEntries(
  Object.entries(ROT_DEG).map(([d, deg]) => [d, `${orientedCursor(rotationRaw, deg)}, alias`])
);
const scaleCache = Object.fromEntries(
  Object.entries(SCALE_DEG).map(([d, deg]) => [d, `${orientedCursor(scaleRaw, deg)}, ${d.length === 2 ? (d === 'nw' || d === 'se' ? 'nwse-resize' : 'nesw-resize') : (d === 'n' || d === 's' ? 'ns-resize' : 'ew-resize')}`])
);

export const rotateCursor = (corner) => rotCache[corner] ?? rotCache.se;
export const scaleCursor = (dir) => scaleCache[dir] ?? scaleCache.se;
