import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    preprocessorOptions: {
      // 모든 SFC <style lang="scss">에 패널 컨트롤 믹스인 자동 주입
      scss: { additionalData: '@use "@/styles/mixins" as *;\n' },
    },
  },
});
