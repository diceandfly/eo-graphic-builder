import { reactive, computed, watch } from 'vue';
import { createParams } from './useDocument.js';
import { saveFileAs } from '../utils/saveFile.js';
import { migrateBrandHex } from '../geometry/brandColors.js';

// 유닛 프리셋 스토어 — 파라미터 1벌 단위 등록/삭제/이름변경. localStorage 영속.
// 리스트 1번은 항상 기본 유닛 프리셋(Default) — 삭제·이름변경 불가, 저장소 미포함(런타임 생성).
// (배치 단위 프리셋 = Phase 2 템플릿과 별개 계층)
const KEY = 'eo.presets';
const FKEY = 'eo.presets.folders'; // §210: 1단계 폴더
const DEFAULT_PRESET = Object.freeze({ id: 'default', name: 'Default Unit', params: createParams() });

// §209: id 유니크 보장 — Date.now()만으로는 같은 밀리초 연속 등록(빠른 클릭·테스트)에서 충돌
const newId = () => Date.now() + Math.random();

export function usePresets() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { saved = []; }
  const stored = reactive(Array.isArray(saved) ? saved.filter((p) => p.id !== 'default') : []);
  for (const p of stored) if (p.params?.fill) p.params.fill = migrateBrandHex(p.params.fill); // §213
  // §210: 폴더 (1단계 깊이 — 루트 + 폴더 1층). 항목의 folder = 폴더 id | null(루트)
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

  const presets = computed(() => [DEFAULT_PRESET, ...stored]);

  // 이름 중복 시 " (2)" 식 접미
  function uniqueName(base) {
    const names = new Set(presets.value.map((p) => p.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i += 1;
    return `${base} (${i})`;
  }
  function register(params, baseName, folder = null) {
    const base = (baseName || '').trim() || `Preset-${stored.length + 1}`;
    const preset = { id: newId(), name: uniqueName(base), params: { ...params }, folder };
    stored.push(preset);
    return preset;
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
    if (id === 'default') return;
    const i = stored.findIndex((p) => p.id === id);
    if (i !== -1) stored.splice(i, 1);
  }
  // §209: 드래그 정렬 — from을 to 앞에 삽입 (Default는 항상 맨 앞 고정이라 대상 밖)
  function reorder(fromId, toId) {
    if (fromId === 'default' || String(fromId) === String(toId)) return;
    const fi = stored.findIndex((p) => String(p.id) === String(fromId));
    if (fi === -1) return;
    const [item] = stored.splice(fi, 1);
    const ti = toId === 'default' ? 0 : stored.findIndex((p) => String(p.id) === String(toId));
    stored.splice(ti === -1 ? stored.length : ti, 0, item);
  }
  // ── §210: 폴더 관리 (1단계) ──
  function folderName(base) {
    const names = new Set(folders.map((f) => f.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i += 1;
    return `${base} (${i})`;
  }
  function addFolder(name = 'Category') {
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
    for (const p of stored) if (String(p.folder ?? '') === String(id)) p.folder = null; // 내용물은 루트로
    folders.splice(i, 1);
  }
  // 선택 항목들을 폴더(null = 루트)로 이동 — Default는 루트 고정
  function moveToFolder(ids, folderId) {
    const set = new Set(ids.map(String));
    for (const p of stored) if (set.has(String(p.id))) p.folder = folderId ?? null;
  }
  // §210: 선택 복제 — 같은 폴더에 사본 (uniqueName이 " (2)" 접미 담당)
  function duplicate(ids) {
    const out = [];
    for (const id of ids) {
      const src = id === 'default' ? DEFAULT_PRESET : stored.find((x) => String(x.id) === String(id));
      if (!src) continue;
      const copy = {
        id: newId(), name: uniqueName(src.name), params: { ...src.params },
        folder: id === 'default' ? null : src.folder ?? null,
      };
      const at = stored.findIndex((x) => String(x.id) === String(id)); // §214: 원본 바로 뒤 삽입
      stored.splice(at === -1 ? stored.length : at + 1, 0, copy);
      out.push(copy);
    }
    return out;
  }
  // §209: 캔버스에서 카드로 드래그 = 프리셋 덮어쓰기 (이름 유지, Default 보호)
  function updateParams(id, params) {
    if (id === 'default') return null;
    const p = stored.find((x) => String(x.id) === String(id));
    if (!p) return null;
    p.params = { ...params };
    return p;
  }
  function rename(id, name) {
    if (id === 'default') return;
    const t = String(name).trim();
    const p = stored.find((x) => x.id === id);
    if (p && t && t !== p.name) p.name = uniqueName(t);
  }

  // 전체 프리셋 JSON 내보내기/가져오기 (Default 제외, 가져오기는 병합 + 이름 중복 접미)
  function exportJson() {
    const data = { version: 1, presets: stored.map((p) => ({ name: p.name, params: p.params })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveFileAs(blob, 'eo-graphic-unit-preset.json', 'preset'); // §183 다이얼로그 + §199 폴더 기억
  }
  async function importJson(file) {
    let list;
    try {
      const data = JSON.parse(await file.text());
      list = Array.isArray(data) ? data : data.presets;
    } catch {
      return 0;
    }
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const p of list) {
      if (p && p.params && Number.isFinite(p.params.W)) {
        stored.push({
          id: newId(),
          name: uniqueName(String(p.name || 'Preset').trim() || 'Preset'),
          params: { ...p.params, fill: migrateBrandHex(p.params.fill) }, // §213
        });
        n += 1;
      }
    }
    return n;
  }

  return {
    presets, folders, register, remove, rename, reorder, updateParams,
    addFolder, renameFolder, removeFolder, moveToFolder, duplicate,
    exportJson, importJson, serialize, restore,
  };
}
