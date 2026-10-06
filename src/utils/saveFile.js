// §183: 저장 다이얼로그 — File System Access API(크롬)로 위치/이름을 고르는 저장.
// 미지원 브라우저·API 실패 시 기존 즉시 다운로드로 폴백, 사용자가 취소하면 조용히 종료.
// §199: id = 용도별 마지막 저장 폴더 기억 버킷 ('workspace'·'preset' 등) — 브라우저가
// id별로 최근 폴더를 따로 기억해 다음 다이얼로그를 그 폴더에서 연다.
// §318: types = 파일 확장자에서 유도 — JSON 하드코딩이었던 탓에 mp4/webm/gif 저장 때
// "JSON인데 .mp4로 저장?" 식의 OS 확장자 불일치 확인이 매번 뜨던 문제.
const PICKER_TYPES = {
  json: { description: 'JSON file', accept: { 'application/json': ['.json'] } },
  svg: { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } },
  png: { description: 'PNG image', accept: { 'image/png': ['.png'] } },
  gif: { description: 'GIF animation', accept: { 'image/gif': ['.gif'] } },
  webm: { description: 'WebM video', accept: { 'video/webm': ['.webm'] } },
  mp4: { description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } },
};
export async function saveFileAs(blob, suggestedName, id) {
  if (window.showSaveFilePicker) {
    try {
      const ext = (suggestedName.split('.').pop() || '').toLowerCase();
      const handle = await window.showSaveFilePicker({
        suggestedName,
        ...(id ? { id } : {}),
        // 미등록 확장자는 types 생략 — 픽커가 임의 저장 허용 (불일치 경고 없음)
        ...(PICKER_TYPES[ext] ? { types: [PICKER_TYPES[ext]] } : {}),
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false; // 취소 — 다운로드 폴백도 하지 않음
      // 그 외 오류(권한 등)는 폴백으로 계속
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
