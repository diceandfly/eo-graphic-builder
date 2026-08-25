import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { BRAND_TOKENS } from './geometry/constants.js'

// 브랜드 컬러 단일 출처(constants.js BRAND_TOKENS)를 CSS 1층 토큰으로 주입.
// colors.css의 정적 값은 첫 페인트용 폴백 — 이 주입이 항상 우선한다.
for (const [name, value] of Object.entries(BRAND_TOKENS)) {
  document.documentElement.style.setProperty(`--${name}`, value)
}

createApp(App).mount('#app')
