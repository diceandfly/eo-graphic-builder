// 시스템 클립보드 복사 유틸 (§72) — Copy as SVG / PNG
// SVG는 텍스트로 복사(피그마 등이 벡터로 파싱), PNG는 캔버스 래스터화 후 image/png.
const MAX_DIM = 8192; // 캔버스 메모리 가드 — 초과 시 배율 자동 축소

export async function copyTextToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

export async function copySvgAsPng(svg, w, h, scale = 2) {
  const over = Math.max((w * scale) / MAX_DIM, (h * scale) / MAX_DIM, 1);
  const s = scale / over;
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('svg rasterize failed'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png encode failed');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
