// 툴바 우클릭 팝업 전역 배타 (§97) — 새 팝업이 열리면 직전 팝업을 자동으로 닫는다.
// 사용법: watch(open)에서 열릴 때 registerPopup(closeFn), 닫힐 때 unregisterPopup(closeFn).
// 중첩 팝오버(ColorField 픽커 등, 부모 메뉴 안에 사는 것)는 등록하지 말 것 — 부모가 닫혀버림.
// 모든 팝업 공통 무조작 자동 닫힘 시간 (§97 통일)
export const POPUP_IDLE_MS = 5000;

let closeCurrent = null;

export function registerPopup(close) {
  if (closeCurrent && closeCurrent !== close) closeCurrent();
  closeCurrent = close;
}

export function unregisterPopup(close) {
  if (closeCurrent === close) closeCurrent = null;
}
