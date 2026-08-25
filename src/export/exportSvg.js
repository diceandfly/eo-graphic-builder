// SVG export — 뷰포트 렌더와 동일 구조 (도형만, 배경 없음, 소수 3자리)
import { orientationTransform } from '../geometry/derive.js';
import { BRAND_COLORS } from '../geometry/constants.js';

const f = (n) => n.toFixed(3);
const pts = (poly) => poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

// 유닛 1개의 <g id="unit"> 본문 (orientation wrapper 포함)
function unitBody({ W, H, unit, orientation = 0, fill = BRAND_COLORS[0] }) {
  const odd = orientation === 90 || orientation === 270;
  const localW = odd ? H : W;
  const localH = odd ? W : H;

  const parts = [];
  if (unit.shaft) {
    const s = unit.shaft;
    parts.push(
      `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.width)}" height="${f(s.height)}" fill="${fill}"/>`
    );
  }
  const polys = (arr) => arr.map((p) => `<polygon points="${pts(p)}" fill="${fill}"/>`).join('');
  parts.push(`<g class="threads-top">${polys(unit.threadsTop)}</g>`);
  parts.push(`<g class="threads-bottom">${polys(unit.threadsBottom)}</g>`);

  let body = `<g class="unit">${parts.join('')}</g>`;
  const otf = orientationTransform(orientation, localW, localH);
  if (otf) body = `<g transform="${otf}">${body}</g>`;
  return body;
}

// 오브젝트 타입 분기: 나사축 유닛 | 직사각형 (그리드 가이드는 export 미포함)
function objectBody(i) {
  if (i.type === 'rect') {
    const fill = i.fillOn === false ? 'none' : i.fill || '#3b3b3b';
    return `<rect width="${f(i.W)}" height="${f(i.H)}" fill="${fill}"/>`;
  }
  return unitBody(i);
}

export function buildSvgString(args) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.W}" height="${args.H}" viewBox="0 0 ${args.W} ${args.H}">` +
    objectBody(args) +
    `</svg>`
  );
}

// 다중 선택: 상대 배치를 보존한 컴포지트 SVG
// items: [{ x, y, W, H, unit, orientation, fill }]
export function buildCompositeSvgString(items) {
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const w = Math.max(...items.map((i) => i.x + i.W)) - minX;
  const h = Math.max(...items.map((i) => i.y + i.H)) - minY;
  const body = items
    .map((i) => `<g transform="translate(${f(i.x - minX)} ${f(i.y - minY)})">${objectBody(i)}</g>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}">` +
    body +
    `</svg>`
  );
}

// 선택 아이템들 → { svg, w, h } (단일 = 원본 크기, 다중 = 컴포지트 bbox)
export function buildSelectionSvg(items) {
  if (items.length === 1) {
    const i = items[0];
    return { svg: buildSvgString(i), w: i.W, h: i.H };
  }
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const w = Math.max(...items.map((i) => i.x + i.W)) - minX;
  const h = Math.max(...items.map((i) => i.y + i.H)) - minY;
  return { svg: buildCompositeSvgString(items), w, h };
}

function download(str, name) {
  const blob = new Blob([str], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(args) {
  download(buildSvgString(args), `eo-unit-${args.W}x${args.H}.svg`);
}
export function downloadCompositeSvg(items) {
  download(buildCompositeSvgString(items), `eo-composite-${items.length}units.svg`);
}
