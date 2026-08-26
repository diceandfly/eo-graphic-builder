// ─── 오브젝트 타입 레지스트리 (§68 부채 ④) ──────────────
// 스테이지 오브젝트의 타입별 특성 단일 정의처.
// 새 타입(예: 이미지)을 추가할 때는 여기 한 항목 + 렌더 컴포넌트 분기만 늘린다.
// 흩어진 `type === 'frame'` 비교 대신 아래 헬퍼를 쓸 것.
export const OBJECT_TYPES = {
  unit: {
    namePrefix: 'Unit',
    layer: 1,          // 렌더 z-레이어 (높을수록 위)
    presetable: true,  // 유닛 프리셋 등록 가능 여부
    linkScoped: true,  // 링크 스코프 칩(5범주) 적용 여부 — false면 전체 동기화
  },
  frame: {
    namePrefix: 'Frame',
    layer: 0,          // 프레임은 항상 유닛 아래
    presetable: false,
    linkScoped: false,
  },
};

export const typeOf = (u) => u?.type ?? 'unit';
export const traitsOf = (u) => OBJECT_TYPES[typeOf(u)];
export const layerOf = (u) => traitsOf(u).layer;
export const namePrefix = (type) => OBJECT_TYPES[type ?? 'unit'].namePrefix;
export const isPresetable = (u) => traitsOf(u).presetable;
export const isLinkScoped = (u) => traitsOf(u).linkScoped;
