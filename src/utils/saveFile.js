// §183: 저장 다이얼로그 — File System Access API(크롬)로 위치/이름을 고르는 저장.
// 미지원 브라우저·API 실패 시 기존 즉시 다운로드로 폴백, 사용자가 취소하면 조용히 종료.
export async function saveFileAs(blob, suggestedName) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
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
