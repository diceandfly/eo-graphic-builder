// ─── §243 아이콘 에셋 카탈로그 생성기 ─────────────────────────
// 런타임 단일 출처(src/ui/icons.js의 ICONS, src/geometry/anim.js의 CURVE_PRESETS)를
// 개별 SVG 파일로 내보내 src/assets/icons/에 정리한다 — 디자인 열람·공유용 사본.
// 아이콘을 고치면 원본(js)을 고친 뒤 `node scripts/export-icon-assets.mjs`로 재생성.
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ICONS } from '../src/ui/icons.js';
import { CURVE_PRESETS } from '../src/geometry/anim.js';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '../src/assets/icons');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.svg')) unlinkSync(join(out, f));

// IconButton 렌더 문법 그대로: 24 뷰박스, 스트로크 2, square cap / miter join, 필 없음
const iconSvg = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">\n` +
  paths.map((d) => `  <path d="${d}"/>\n`).join('') +
  `</svg>\n`;
// 곡선 글리프 문법(.curveBtn): 24×20 뷰박스, 스트로크 1.6, round cap
const curveSvg = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 20" fill="none" stroke="#333333" stroke-width="1.6" stroke-linecap="round">\n  <path d="${d}"/>\n</svg>\n`;

let n = 0;
for (const [key, paths] of Object.entries(ICONS)) {
  writeFileSync(join(out, `${key}.svg`), iconSvg(paths));
  n += 1;
}
for (const { key, icon } of CURVE_PRESETS) {
  writeFileSync(join(out, `curve-${key}.svg`), curveSvg(icon));
  n += 1;
}
console.log(`exported ${n} icons → src/assets/icons/`);
