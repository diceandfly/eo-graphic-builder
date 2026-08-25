import { reactive, computed, watch } from 'vue';
import { createParams } from './useDocument.js';

// 유닛 프리셋 스토어 — 파라미터 1벌 단위 등록/삭제/이름변경. localStorage 영속.
// 리스트 1번은 항상 기본 유닛 프리셋(Default) — 삭제·이름변경 불가, 저장소 미포함(런타임 생성).
// (배치 단위 프리셋 = Phase 2 템플릿과 별개 계층)
const KEY = 'eo.presets';
const DEFAULT_PRESET = Object.freeze({ id: 'default', name: 'Default', params: createParams() });

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

  return { presets, register, remove, rename };
}
