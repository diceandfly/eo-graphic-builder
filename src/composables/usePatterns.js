import { reactive, watch } from 'vue';
import { saveFileAs } from '../utils/saveFile.js';

// 패턴 프리셋 스토어 (§205) — 프레임 1개 + 소유 유닛 전체(파라미터·상대배치·그룹·링크)를
// 한 벌로 등록/삭제/이름변경. localStorage 영속. 캡처/재생성 로직은 useDocument
// (capturePattern/placePattern) — 여기는 목록·이름·입출력만 담당한다 (usePresets와 대칭).
const KEY = 'eo.patterns';

// §209: id 유니크 보장 — Date.now()만으로는 같은 밀리초 연속 등록(빠른 클릭·테스트)에서 충돌
const newId = () => Date.now() + Math.random();

export function usePatterns() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { saved = []; }
  const stored = reactive(Array.isArray(saved) ? saved : []);

  watch(
    () => JSON.stringify(stored),
    (s) => localStorage.setItem(KEY, s)
  );

  // 이름 중복 시 " (2)" 식 접미 (usePresets와 동일 문법)
  function uniqueName(base) {
    const names = new Set(stored.map((p) => p.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i += 1;
    return `${base} (${i})`;
  }
  // data = useDocument.capturePattern() 결과, baseName = 프레임 이름
  function register(data, baseName) {
    if (!data) return null;
    const base = (baseName || '').trim() || 'Pattern';
    const pattern = { id: newId(), name: uniqueName(base), ...data };
    stored.push(pattern);
    return pattern;
  }
  // 히스토리 편입용 직렬화/복원 (§103 문법 공유)
  function serialize() {
    return JSON.parse(JSON.stringify(stored));
  }
  function restore(list) {
    stored.splice(0, stored.length, ...(Array.isArray(list) ? list : []));
  }
  function remove(id) {
    const i = stored.findIndex((p) => p.id === id);
    if (i !== -1) stored.splice(i, 1);
  }
  // §209: 드래그 정렬 — from을 to 앞에 삽입
  function reorder(fromId, toId) {
    if (String(fromId) === String(toId)) return;
    const fi = stored.findIndex((p) => String(p.id) === String(fromId));
    if (fi === -1) return;
    const [item] = stored.splice(fi, 1);
    const ti = stored.findIndex((p) => String(p.id) === String(toId));
    stored.splice(ti === -1 ? stored.length : ti, 0, item);
  }
  // §209: 캔버스에서 카드로 프레임 드래그 = 패턴 덮어쓰기 (이름·id 유지)
  function update(id, data) {
    const p = stored.find((x) => String(x.id) === String(id));
    if (!p || !data) return null;
    Object.assign(p, JSON.parse(JSON.stringify(data)));
    return p;
  }
  function rename(id, name) {
    const t = String(name).trim();
    const p = stored.find((x) => x.id === id);
    if (p && t && t !== p.name) p.name = uniqueName(t);
  }

  // 전체 패턴 JSON 내보내기/가져오기 (가져오기는 병합 + 이름 중복 접미)
  function exportJson() {
    const data = { version: 1, patterns: serialize() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveFileAs(blob, 'eo-graphic-pattern-preset.json', 'pattern'); // §199 폴더 기억 버킷
  }
  async function importJson(file) {
    let list;
    try {
      const data = JSON.parse(await file.text());
      list = Array.isArray(data) ? data : data.patterns;
    } catch {
      return 0;
    }
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const p of list) {
      if (p && p.frame && Number.isFinite(p.frame.W) && Array.isArray(p.units)) {
        stored.push({
          ...JSON.parse(JSON.stringify(p)),
          id: newId(),
          name: uniqueName(String(p.name || 'Pattern').trim() || 'Pattern'),
        });
        n += 1;
      }
    }
    return n;
  }

  return { patterns: stored, register, remove, rename, reorder, update, exportJson, importJson, serialize, restore };
}
