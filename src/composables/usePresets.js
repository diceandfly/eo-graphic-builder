import { reactive, computed, watch } from 'vue';
import { createParams } from './useDocument.js';

// 유닛 프리셋 스토어 — 파라미터 1벌 단위 등록/삭제/이름변경. localStorage 영속.
// 리스트 1번은 항상 기본 유닛 프리셋(Default) — 삭제·이름변경 불가, 저장소 미포함(런타임 생성).
// (배치 단위 프리셋 = Phase 2 템플릿과 별개 계층)
const KEY = 'eo.presets';
const DEFAULT_PRESET = Object.freeze({ id: 'default', name: 'Default Unit', params: createParams() });

export function usePresets() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { saved = []; }
  const stored = reactive(Array.isArray(saved) ? saved.filter((p) => p.id !== 'default') : []);

  watch(
    () => JSON.stringify(stored),
    (s) => localStorage.setItem(KEY, s)
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
  function register(params, baseName) {
    const base = (baseName || '').trim() || `Preset-${stored.length + 1}`;
    const preset = { id: Date.now(), name: uniqueName(base), params: { ...params } };
    stored.push(preset);
    return preset;
  }
  // 히스토리 편입용 직렬화/복원 (§103) — Default 제외 저장분만
  function serialize() {
    return JSON.parse(JSON.stringify(stored));
  }
  function restore(list) {
    stored.splice(0, stored.length, ...(Array.isArray(list) ? list : []));
  }
  function remove(id) {
    if (id === 'default') return;
    const i = stored.findIndex((p) => p.id === id);
    if (i !== -1) stored.splice(i, 1);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eo-presets.json';
    a.click();
    URL.revokeObjectURL(url);
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
          id: Date.now() + n,
          name: uniqueName(String(p.name || 'Preset').trim() || 'Preset'),
          params: { ...p.params },
        });
        n += 1;
      }
    }
    return n;
  }

  return { presets, register, remove, rename, exportJson, importJson, serialize, restore };
}
