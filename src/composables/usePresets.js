import { reactive, watch } from 'vue';

// 유닛 프리셋 스토어 — 파라미터 1벌 단위 등록/삭제. localStorage 영속.
// (배치 단위 프리셋 = Phase 2 템플릿과 별개 계층)
const KEY = 'eo.presets';

export function usePresets() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { saved = []; }
  const presets = reactive(Array.isArray(saved) ? saved : []);

  watch(
    () => JSON.stringify(presets),
    (s) => localStorage.setItem(KEY, s)
  );

  function register(params) {
    const n = presets.reduce((m, p) => {
      const mt = p.name.match(/^Preset-(\d+)$/);
      return Math.max(m, mt ? Number(mt[1]) : 0);
    }, 0) + 1;
    const preset = { id: Date.now(), name: `Preset-${n}`, params: { ...params } };
    presets.push(preset);
    return preset;
  }
  function remove(id) {
    const i = presets.findIndex((p) => p.id === id);
    if (i !== -1) presets.splice(i, 1);
  }
  function rename(id, name) {
    const t = String(name).trim();
    const p = presets.find((x) => x.id === id);
    if (p && t) p.name = t;
  }

  return { presets, register, remove, rename };
}
