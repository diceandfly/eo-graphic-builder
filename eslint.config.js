import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

// 수준: 에러 탐지 위주(essential) — 스타일 규칙은 최소화.
// 목적: 미정의 변수·미사용 변수·export 누락 같은 "조용한 실패" 조기 경보.
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  // tests/는 node 실행 스크립트 (회귀 스위트)
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // 단어 1개 컴포넌트명(Toolbar 등) 허용 — 기존 네이밍 유지
      'vue/multi-word-component-names': 'off',
      // doc/scope는 reactive 스토어를 프롭으로 내려 깊은 변경하는 구조 — 재할당만 금지
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
      // 인자 미사용은 _ 접두어로 의도 표시 가능
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
