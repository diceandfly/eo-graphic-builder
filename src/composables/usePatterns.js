import { reactive, watch } from 'vue';
import { saveFileAs } from '../utils/saveFile.js';

// 패턴 프리셋 스토어 (§205) — 프레임 1개 + 소유 유닛 전체(파라미터·상대배치·그룹·링크)를
// 한 벌로 등록/삭제/이름변경. localStorage 영속. 캡처/재생성 로직은 useDocument
// (capturePattern/placePattern) — 여기는 목록·이름·입출력만 담당한다 (usePresets와 대칭).
const KEY = 'eo.patterns';
const FKEY = 'eo.patterns.folders'; // §210: 1단계 폴더

// §209: id 유니크 보장 — Date.now()만으로는 같은 밀리초 연속 등록(빠른 클릭·테스트)에서 충돌
const newId = () => Date.now() + Math.random();

export function usePatterns() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { saved = []; }
  const stored = reactive(Array.isArray(saved) ? saved : []);
  // §210: 폴더 (1단계 깊이) — 항목의 folder = 폴더 id | null(루트)
  let savedF;
  try { savedF = JSON.parse(localStorage.getItem(FKEY) || '[]') || []; } catch { savedF = []; }
  const folders = reactive(Array.isArray(savedF) ? savedF : []);

  watch(
    () => JSON.stringify(stored),
    (s) => localStorage.setItem(KEY, s)
  );
  watch(
    () => JSON.stringify(folders),
    (s) => localStorage.setItem(FKEY, s)
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
  function register(data, baseName, folder = null) {
    if (!data) return null;
    const base = (baseName || '').trim() || 'Pattern';
    const pattern = { id: newId(), name: uniqueName(base), folder, ...data };
    stored.push(pattern);
    return pattern;
  }
  // 히스토리 편입용 직렬화/복원 (§103·§210: 폴더 포함 — 구 스냅샷(배열)도 수용)
  function serialize() {
    return JSON.parse(JSON.stringify({ items: stored, folders }));
  }
  function restore(v) {
    const items = Array.isArray(v) ? v : v?.items ?? [];
    const fs = Array.isArray(v) ? [] : v?.folders ?? [];
    stored.splice(0, stored.length, ...items);
    folders.splice(0, folders.length, ...fs);
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
  // ── §210: 폴더 관리 (1단계) — usePresets와 동일 문법 ──
  function folderName(base) {
    const names = new Set(folders.map((f) => f.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i += 1;
    return `${base} (${i})`;
  }
  function addFolder(name = 'Folder') {
    const f = { id: newId(), name: folderName(name) };
    folders.push(f);
    return f;
  }
  function renameFolder(id, name) {
    const t = String(name).trim();
    const f = folders.find((x) => String(x.id) === String(id));
    if (f && t && t !== f.name) f.name = folderName(t);
  }
  function removeFolder(id) {
    const i = folders.findIndex((f) => String(f.id) === String(id));
    if (i === -1) return;
    for (const p of stored) if (String(p.folder ?? '') === String(id)) p.folder = null;
    folders.splice(i, 1);
  }
  function moveToFolder(ids, folderId) {
    const set = new Set(ids.map(String));
    for (const p of stored) if (set.has(String(p.id))) p.folder = folderId ?? null;
  }
  function duplicate(ids) {
    const out = [];
    for (const id of ids) {
      const src = stored.find((x) => String(x.id) === String(id));
      if (!src) continue;
      const copy = { ...JSON.parse(JSON.stringify(src)), id: newId(), name: uniqueName(src.name) };
      stored.push(copy);
      out.push(copy);
    }
    return out;
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

  return {
    patterns: stored, folders, register, remove, rename, reorder, update,
    addFolder, renameFolder, removeFolder, moveToFolder, duplicate,
    exportJson, importJson, serialize, restore,
  };
}
