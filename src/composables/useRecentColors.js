import { ref } from 'vue';

// 최근 사용 컬러 공유 스토어 (§110) — 모듈 싱글턴.
// 소스: 오브젝트에 실제 적용된 비 브랜드 컬러 (§86 규칙). 영속은 DashboardStage의 eo.prefs 워처가 담당.
// 사용처: 컬러 툴바 커스텀 팝업 · 패널 stroke 색 팝업 (ColorField recents)
const recentColors = ref([]);

export function useRecentColors() {
  function commitRecentColor(c) {
    if (!c) return;
    recentColors.value = [c, ...recentColors.value.filter((x) => x !== c)].slice(0, 6);
  }
  return { recentColors, commitRecentColor };
}
