// SVG export — 뷰포트 렌더와 동일 구조 (도형만, 배경 없음, 소수 3자리)
import { orientationTransform } from '../geometry/derive.js';

const f = (n) => n.toFixed(3);
const pts = (poly) => poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

export function buildSvgString({ W, H, unit, orientation = 0, fill = '#FAF04B' }) {
  const odd = orientation === 90 || orientation === 270;
  const localW = odd ? H : W;
  const localH = odd ? W : H;

  const parts = [];
  if (unit.shaft) {
    const s = unit.shaft;
    parts.push(
      `<rect id="shaft" x="${f(s.x)}" y="${f(s.y)}" width="${f(s.width)}" height="${f(s.height)}" fill="${fill}"/>`
    );
  }
  const polys = (arr) => arr.map((p) => `<polygon points="${pts(p)}" fill="${fill}"/>`).join('');
  parts.push(`<g id="threads-top">${polys(unit.threadsTop)}</g>`);
  parts.push(`<g id="threads-bottom">${polys(unit.threadsBottom)}</g>`);

  let body = `<g id="unit">${parts.join('')}</g>`;
  const otf = orientationTransform(orientation, localW, localH);
  if (otf) body = `<g transform="${otf}">${body}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    body +
    `</svg>`
  );
}

export function downloadSvg(args) {
  const blob = new Blob([buildSvgString(args)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eo-unit-${args.W}x${args.H}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
