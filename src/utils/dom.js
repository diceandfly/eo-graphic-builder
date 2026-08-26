// 포커스된 입력을 블러해 pending 입력값을 커밋 (§93)
// 팝업 close 핸들러 첫 줄에서 호출 — 바깥 클릭으로 팝업이 닫히기 전에 change가 발화되도록.
export function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function' && el.tagName !== 'BODY') el.blur();
}
