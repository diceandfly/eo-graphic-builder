// 문서 조작 회귀 (§122) — useDocument 로직을 node에서 직접 구동.
// 대상: 블록 판정·프레임 소유(§92)·정렬/등간격/어레인지 동반 이동(§114·§120)·마이그레이션·히스토리.
// UI 배선(팝업·입력·드래그)은 대상 아님 — 브라우저 검증 채널 유지.
import { strict as assert } from 'node:assert';

// useDocument는 모듈 로드 시가 아닌 호출 시 localStorage를 읽음 — node 스텁
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { useDocument, primaryLid, LINK_CATS } = await import('../src/composables/useDocument.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ── 셋업 헬퍼: 새 문서 + 프레임/유닛 배치 ──
function fresh() {
  const api = useDocument();
  return api;
}
function centerIn(u, f) {
  u.x = f.x + f.params.W / 2 - u.params.W / 2;
  u.y = f.y + f.params.H / 2 - u.params.H / 2;
}

// 1. 프레임 소유 판정 (§92): 중심점 포함 + z-오더 최상위 + 그룹 통째
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 기본 유닛 960×800
  const f1 = api.createFrame(0, 0, 1200, 1000);
  const f2 = api.createFrame(100, 100, 1200, 1000); // f1 위에 겹침 (나중 = z 상위)

  centerIn(u1, f1); // 중심이 f1·f2 겹침 영역 안
  ok('소유: 겹친 프레임 중 z-오더 최상위만', () => {
    assert.deepEqual(api.frameOwnedUnits([f1.id]).map((m) => m.id), []);
    assert.deepEqual(api.frameOwnedUnits([f2.id]).map((m) => m.id), [u1.id]);
  });

  u1.x = 5000; // 프레임 밖
  ok('소유: 중심이 밖이면 미소유', () => {
    assert.equal(api.frameOwnedUnits([f1.id, f2.id]).length, 0);
  });

  // 그룹 통째 판정: u1+u2 그룹의 bbox 중심으로 판정
  const u2 = api.createUnit(5000, 2000);
  api.setSelection([u1.id, u2.id]);
  api.groupSelected();
  ok('소유: 그룹은 블록 bbox 중심으로 통째 판정', () => {
    const bbCx = (Math.min(u1.x, u2.x) + Math.max(u1.x + u1.params.W, u2.x + u2.params.W)) / 2;
    const bbCy = (Math.min(u1.y, u2.y) + Math.max(u1.y + u1.params.H, u2.y + u2.params.H)) / 2;
    const f3 = api.createFrame(bbCx - 100, bbCy - 100, 200, 200); // 중심만 덮는 작은 프레임
    const owned = api.frameOwnedUnits([f3.id]).map((m) => m.id).sort();
    assert.deepEqual(owned, [u1.id, u2.id].sort());
  });
}

// 2. 블록 판정 단일 소스 (§120): blocksOf — 그룹 = 1블록
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const u2 = api.createUnit(3000, 0);
  const u3 = api.createUnit(6000, 0);
  api.setSelection([u1.id, u2.id]);
  api.groupSelected();
  ok('블록: 그룹(2유닛)+단독 = 2블록', () => {
    assert.equal(api.blocksOf([u1.id, u2.id, u3.id]).length, 2);
    assert.equal(api.blocksOf([u1.id, u2.id]).length, 1);
    assert.equal(api.blocksOf([]).length, 0);
  });
}

// 3. 정렬(top) — 프레임 블록은 소유 유닛 동반, 상대 위치 보존 (§114)
{
  const api = fresh();
  const u = api.doc.units[0];
  const f1 = api.createFrame(1200, 100, 300, 300);
  const f2 = api.createFrame(1600, 500, 300, 300);
  centerIn(u, f2);
  const rel = [u.x - f2.x, u.y - f2.y];
  api.doc.selectedIds = [f1.id, f2.id];
  api.alignSelected('top');
  ok('정렬: top 정렬 시 프레임 내용물 동반', () => {
    assert.equal(f2.y, 100);
    assert.deepEqual([u.x - f2.x, u.y - f2.y], rel);
  });
}

// 4. 등간격(h) — 간격 균등 + 동반 이동 (§114)
{
  const api = fresh();
  const u = api.doc.units[0];
  const f1 = api.createFrame(1200, 100, 300, 300);
  const f2 = api.createFrame(1600, 100, 300, 300);
  const f3 = api.createFrame(2600, 100, 300, 300);
  centerIn(u, f2);
  const rel = [u.x - f2.x, u.y - f2.y];
  api.doc.selectedIds = [f1.id, f2.id, f3.id];
  api.distributeSelected('h');
  ok('등간격: 간격 균등 + 프레임 내용물 동반', () => {
    const gapAB = f2.x - (f1.x + f1.params.W);
    const gapBC = f3.x - (f2.x + f2.params.W);
    assert.ok(Math.abs(gapAB - gapBC) < 1e-6);
    assert.deepEqual([u.x - f2.x, u.y - f2.y], rel);
  });
}

// 5. 어레인지 — 동반 이동 + 혼합 선택 이중 이동 방지 (§114)
{
  const api = fresh();
  const u = api.doc.units[0];
  const f1 = api.createFrame(2000, 1400, 300, 300);
  const f2 = api.createFrame(1000, 500, 300, 300);
  centerIn(u, f1);
  const rel = [u.x - f1.x, u.y - f1.y];
  api.doc.selectedIds = [f1.id, f2.id];
  api.arrangeGrid({ gapX: 40, gapY: 40 });
  ok('어레인지: 프레임 이동 시 내용물 동반', () => {
    assert.deepEqual([u.x - f1.x, u.y - f1.y], rel);
  });
  // 혼합 선택: 소유 유닛이 별도 선택되면 자기 블록으로만 이동 (이중 이동 없음)
  centerIn(u, f1);
  api.doc.selectedIds = [u.id, f1.id, f2.id];
  api.arrangeGrid({ gapX: 40, gapY: 40 });
  ok('어레인지: 혼합 선택 시 이중 이동 없음', () => {
    for (const o of [u, f1, f2]) {
      assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
    }
    // 3블록 그리드: 유닛은 자기 셀 — 프레임과 상대 위치가 깨져야 정상 (동반 아님)
    assert.notDeepEqual([u.x - f1.x, u.y - f1.y], rel);
  });
}

// 5b. 어레인지 축별 간격 (§198): gapX/gapY가 각각 열/행 간격에 적용
{
  const api = fresh();
  const u1 = api.doc.units[0];           // 960×800 @ (0,0)
  const u2 = api.createUnit(4000, 1500); // 중심 배치
  const u3 = api.createUnit(2500, 3000);
  const u4 = api.createUnit(1200, 900);
  api.setSelection([u1.id, u2.id, u3.id, u4.id]);
  api.arrangeGrid({ gapX: 50, gapY: 120, columns: 2 });
  ok('어레인지: gapX/gapY 축별 간격 적용', () => {
    // 2×2 그리드 — 읽기 순서 정렬 후 셀 좌상단 간격 검증
    const sorted = [u1, u2, u3, u4].sort((a, z) => (a.y - z.y) || (a.x - z.x));
    const colW = Math.max(sorted[0].params.W, sorted[2].params.W);
    const rowH = Math.max(sorted[0].params.H, sorted[1].params.H);
    assert.equal(sorted[1].x, sorted[0].x + colW + 50);
    assert.equal(sorted[2].y, sorted[0].y + rowH + 120);
  });
}

// 6. 마이그레이션: 구버전 rect + drawMode → frame + fillOn/strokeOn (§92·§110)
{
  const api = fresh();
  api.loadProject([
    { id: 1, type: 'rect', name: 'Rect-1', x: 0, y: 0, params: { W: 400, H: 300, drawMode: 'stroke' } },
  ]);
  const f = api.doc.units[0];
  ok('마이그레이션: rect→frame, drawMode→토글 이관', () => {
    assert.equal(f.type, 'frame');
    assert.equal(f.params.drawMode, undefined);
    assert.equal(f.params.strokeOn, true);
    assert.equal(f.params.fillOn, false);
    assert.equal(f.params.margin, 20); // 이후 추가 키 기본값 보충
  });
}

// 7. 활성 프레임 기준 단일 블록 정렬 (§123)
{
  const api = fresh();
  const u = api.doc.units[0];
  const f = api.createFrame(2000, 2000, 600, 400); // 생성 = 선택 경유 → 활성 프레임
  await sleep(10); // selectedIds 워처 플러시
  ok('활성 프레임: 생성/선택 시 갱신', () => {
    assert.equal(api.activeFrameId.value, f.id);
  });
  api.setSelection([u.id]);
  await sleep(10);
  api.alignSelected('left');
  api.alignSelected('top');
  ok('정렬: 단일 유닛 → 활성 프레임 기준', () => {
    assert.equal(u.x, f.x);
    assert.equal(u.y, f.y);
  });
  api.alignSelected('hcenter');
  api.alignSelected('vcenter');
  ok('정렬: 단일 유닛 → 프레임 중앙', () => {
    assert.equal(u.x + u.params.W / 2, f.x + f.params.W / 2);
    assert.equal(u.y + u.params.H / 2, f.y + f.params.H / 2);
  });
  // 프레임 자신만 선택된 경우: 기준=자신 → 무동작
  api.setSelection([f.id]);
  await sleep(10);
  const fx = f.x;
  api.alignSelected('left');
  ok('정렬: 활성 프레임 자신 선택 시 무동작', () => {
    assert.equal(f.x, fx);
  });
}

// 8. 기준 프레임 폴백 (§124): 활성 프레임 부재 시(재로딩 등) 소유 프레임 기준
{
  const api = fresh();
  const u = api.doc.units[0];
  const f = api.createFrame(3000, 3000, 800, 600);
  await sleep(10);
  api.activeFrameId.value = null; // 재로딩 상황 시뮬레이션 — 세션 포인터 소실
  u.x = f.x + 50; u.y = f.y + 50; // 유닛이 프레임에 속함... (중심 포함되게)
  u.x = f.x + f.params.W / 2 - u.params.W / 2 + 30;
  u.y = f.y + f.params.H / 2 - u.params.H / 2 + 20;
  api.setSelection([u.id]);
  await sleep(10);
  ok('기준 프레임: 활성 부재 시 소유 프레임 폴백', () => {
    assert.equal(api.alignRefFrame()?.id, f.id);
  });
  api.alignSelected('right');
  ok('정렬: 소유 프레임 기준 right', () => {
    assert.equal(u.x + u.params.W, f.x + f.params.W);
  });
  // 프레임 밖 유닛 + 활성 부재 = 기준 없음 (정렬바 비활성 조건)
  u.x = 9000;
  ok('기준 프레임: 소유도 활성도 없으면 null', () => {
    assert.equal(api.alignRefFrame(), null);
  });
}

// 9. 링크그룹: 서브셋 언링크·분리·1멤버 자동 소멸 (§129)
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const u2 = api.createUnit(3000, 0);
  const u3 = api.createUnit(6000, 0);
  const u4 = api.createUnit(9000, 0);
  api.setSelection([u1.id, u2.id, u3.id, u4.id]);
  api.toggleLinkSelected({ color: false });
  const lid0 = primaryLid(u1);
  ok('링크: 4유닛 링크 생성', () => {
    assert.ok(lid0 != null);
    assert.ok([u2, u3, u4].every((u) => primaryLid(u) === lid0));
  });
  // 서브셋 분리: u3·u4 선택 + 칩(color) 조작 → 새 그룹, 스코프 = 원본 복사 + color 토글
  api.setSelection([u3.id, u4.id]);
  const r = api.splitLinkSelected('color');
  ok('링크: 서브셋 칩 조작 = 새 링크그룹 분리', () => {
    assert.equal(r.count, 2);
    assert.ok(primaryLid(u3) === primaryLid(u4) && primaryLid(u3) !== lid0);
    assert.equal(primaryLid(u1), lid0);
    assert.equal(u3.links.color, primaryLid(u3));  // 원본 off → 토글 on (§220: 범주 멤버십)
    assert.equal(u1.links.color, null);            // 원본 불변 (color off)
  });
  // 서브셋 언링크: 그룹(u1·u2)에서 u2만... 은 single 경로 — 여기선 3멤버 그룹에서 2개 언링크 시 잔여 1개 자동 소멸 확인
  const u5 = api.createUnit(12000, 0);
  api.setSelection([u1.id, u2.id, u5.id]);
  api.toggleLinkSelected(); // u1·u2(기존 lid0)+u5 → 혼합이라 새 그룹 생성 경로
  const lidB = primaryLid(u1);
  api.setSelection([u1.id, u2.id]);
  api.toggleLinkSelected(); // 서브셋 언링크 (§129)
  ok('링크: 서브셋 언링크 + 잔여 1멤버 그룹 자동 소멸', () => {
    assert.equal(primaryLid(u1), null);
    assert.equal(primaryLid(u2), null);
    assert.equal(primaryLid(u5), null); // 홀로 남은 u5 — cleanupLinks로 소멸
    assert.ok(api.doc.units.every((u) => LINK_CATS.every((c) => u.links[c] !== lidB))); // lidB 멤버십 전무 (§220)
  });
  // 삭제로 1멤버가 남는 경우도 소멸
  api.setSelection([u3.id]);
  api.deleteSelected();
  ok('링크: 삭제로 1멤버 남으면 그룹 소멸', () => {
    assert.equal(primaryLid(u4), null);
  });
}

// 10. 스포이드: 프레임 grid/shape(style)/color 범주 흡수 + 동일 타입 한정 (§133)
{
  const api = fresh();
  const u = api.doc.units[0];
  const fA = api.createFrame(1000, 0, 400, 300);
  const fB = api.createFrame(2000, 0, 500, 350);
  Object.assign(fA.params, { margin: 44, rows: 3, cols: 5, compOn: true, compX: 2, fill: '#123456', strokeOn: true, stroke: '#654321', strokeW: 9 });
  api.setSelection([fB.id]);
  api.absorbFrom(fA, { grid: true });
  ok('스포이드: 프레임 grid 범주 흡수 (color·style 불변)', () => {
    assert.equal(fB.params.margin, 44);
    assert.equal(fB.params.cols, 5);
    assert.equal(fB.params.compX, 2);
    assert.notEqual(fB.params.fill, '#123456');
    assert.equal(fB.params.strokeOn, false);
  });
  api.absorbFrom(fA, { shape: true, color: true });
  ok('스포이드: 프레임 style+color 범주 흡수', () => {
    assert.equal(fB.params.strokeOn, true);
    assert.equal(fB.params.strokeW, 9);
    assert.equal(fB.params.fill, '#123456');
  });
  const uFill = u.params.fill;
  api.setSelection([u.id]);
  api.absorbFrom(fA, { color: true, grid: true });
  ok('스포이드: 타입 불일치(유닛←프레임)는 무동작', () => {
    assert.equal(u.params.fill, uFill);
    assert.equal(u.params.margin, undefined);
  });
}

// 11. 클립보드: 멀티 선택 복사·붙여넣기 (§152)
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 960×800 @ (0,0)
  const u2 = api.createUnit(3000, 1500);
  const u3 = api.createUnit(5000, 400);
  // 그룹(u1·u2) + 링크(u2·u3) 구조 포함
  api.setSelection([u1.id, u2.id]);
  api.groupSelected();
  const origGid = api.outermost(u1);
  api.setSelection([u2.id, u3.id]);
  api.toggleLinkSelected();
  const lid = primaryLid(u2);
  // 3개 전체 복사 → 붙여넣기
  api.setSelection([u1.id, u2.id, u3.id]);
  api.copyActive();
  const n0 = api.doc.units.length;
  api.pasteAt(10000, 10000);
  const pasted = api.doc.units.slice(n0);
  ok('클립보드: 멀티 3개 전부 붙여넣기', () => {
    assert.equal(pasted.length, 3);
    assert.deepEqual(api.doc.selectedIds.length, 3);
  });
  ok('클립보드: 상대 배치 보존 + 대상점 중심', () => {
    // 원본 u2-u1 상대 오프셋 = 사본 간 동일
    assert.equal(pasted[1].x - pasted[0].x, u2.x - u1.x);
    assert.equal(pasted[1].y - pasted[0].y, u2.y - u1.y);
  });
  ok('클립보드: 그룹 재생성(새 gid)·링크 합류', () => {
    const g = api.outermost(pasted[0]);
    assert.ok(g != null && g !== origGid);
    assert.equal(api.outermost(pasted[1]), g);
    assert.equal(primaryLid(pasted[1]), lid); // §129 현행: 사본은 원본 링크그룹 합류
    assert.equal(primaryLid(pasted[2]), lid);
  });
  // 단일 선택 복사 = 종전 동작 (대상점 = 유닛 중심)
  api.setSelection([u1.id]);
  api.copyActive();
  api.pasteAt(20000, 20000);
  const single = api.doc.units[api.doc.units.length - 1];
  ok('클립보드: 단일 붙여넣기 = 대상점 중심 배치', () => {
    assert.equal(single.x + single.params.W / 2, 20000);
    assert.equal(single.y + single.params.H / 2, 20000);
  });
  // 프레임 복사도 타입 보존
  const f = api.createFrame(0, 5000, 500, 400);
  api.setSelection([f.id]);
  api.copyActive();
  api.pasteAt(30000, 30000);
  ok('클립보드: 프레임 타입 보존', () => {
    assert.equal(api.doc.units[api.doc.units.length - 1].type, 'frame');
  });
}

// 12. 히스토리: 이동 → undo 복원 (350ms 디바운스 대기)
{
  const api = fresh();
  const u = api.doc.units[0];
  const x0 = u.x;
  await sleep(450); // 초기 스냅샷 안정화
  u.x = x0 + 500;
  await sleep(450); // 디바운스 통과 → push
  api.undo();
  ok('히스토리: 이동 undo 복원', () => {
    assert.equal(api.doc.units[0].x, x0);
  });
}

// 13. 히스토리 × 링크 (§200): undo 복원을 미러 워처가 재브로드캐스트하지 않는다
// (발산 상태의 링크 멤버가 활성 유닛 값으로 덮어써지고 redo 스택이 오염되던 버그)
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const u2 = api.createUnit(3000, 1500);
  api.setSelection([u1.id, u2.id]);
  api.toggleLinkSelected();
  api.doc.activeId = u1.id;
  api.doc.selectedIds = [u1.id];
  await sleep(450); // 링크 스냅샷 안정화
  u2.params.W = 500; // 레거시 발산 상태 재현 (비활성 직접 수정 — 워처 미개입)
  await sleep(450);
  u1.params.W = 2000; // 활성 편집 → 미러가 u2에도 전파 (수렴)
  await sleep(450);
  assert.equal(u2.params.W, 2000);
  const U = (id) => api.doc.units.find((u) => u.id === id); // undo가 유닛 객체를 교체하므로 id로 재조회
  api.undo(); // 발산 상태(u1 960 / u2 500)로 복원되어야 함
  await sleep(400); // 버그 재현 조건: 복원 후 워처 틱 + 디바운스 경과
  ok('히스토리: undo가 링크 멤버의 개별 복원값을 보존', () => {
    assert.equal(U(u1.id).params.W, 960);
    assert.equal(U(u2.id).params.W, 500); // 버그 시 u1 값(960)으로 덮어써짐
  });
  api.redo();
  ok('히스토리: undo 후 redo 스택 미오염', () => {
    assert.equal(U(u1.id).params.W, 2000);
    assert.equal(U(u2.id).params.W, 2000);
  });
}

// 14. 링크 자동 분리 (§200): 지오메트리 조작이 링크 일부에만 발산을 만들면 서브셋을 새 링크로
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const u2 = api.createUnit(3000, 1500);
  const u3 = api.createUnit(1500, 3000);
  api.setSelection([u1.id, u2.id, u3.id]);
  api.toggleLinkSelected();
  const lid0 = primaryLid(u1);
  assert.ok(lid0 != null && primaryLid(u3) === lid0);
  // 3멤버 중 2개만 통합 스케일 → 발산 → 2개는 새 링크, 남은 1개는 자동 해체
  api.setSelection([u1.id, u2.id]);
  api.setSize({ W: 5000 });
  ok('링크 분리: 서브셋 스케일 = 서브셋끼리 새 링크', () => {
    assert.ok(primaryLid(u1) != null && primaryLid(u1) === primaryLid(u2) && primaryLid(u1) !== lid0);
    assert.equal(primaryLid(u3), null); // 잔여 1멤버 자동 소멸
  });
  // 2멤버 링크에서 1개만 발산 → 양쪽 모두 링크 해제 (1멤버 링크는 존재 불가)
  const u4 = api.createUnit(6000, 1000);
  const u5 = api.createUnit(6000, 2500);
  api.setSelection([u4.id, u5.id]);
  api.toggleLinkSelected();
  const u6 = api.createUnit(8000, 1000); // 링크 밖 동반 선택용
  api.setSelection([u4.id, u6.id]);
  api.setSize({ W: 7000 });
  ok('링크 분리: 1개만 발산하면 전체 해제', () => {
    assert.equal(primaryLid(u4), null);
    assert.equal(primaryLid(u5), null);
  });
  // 링크 전체를 함께 조작하면 분리되지 않음
  const u7 = api.createUnit(10000, 1000);
  const u8 = api.createUnit(10000, 2500);
  api.setSelection([u7.id, u8.id]);
  api.toggleLinkSelected();
  const lid7 = primaryLid(u7);
  api.setSize({ W: 4000 }); // 전 멤버 선택 상태의 통합 스케일
  ok('링크 분리: 전체 조작은 링크 유지', () => {
    assert.equal(primaryLid(u7), lid7);
    assert.equal(primaryLid(u8), lid7);
  });
}

// 15. 링크 × 오리엔트 (§202·§204): 개별 회전은 링크 유지, 사이즈 동기 = 로컬 치수,
//     앵커 = 각 멤버의 로컬 원점 코너 고정 (180°는 정반대 방향으로 스케일)
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 960×800, 0°
  const u2 = api.createUnit(3000, 1500);
  const u3 = api.createUnit(1500, 3000);
  api.setSelection([u1.id, u2.id, u3.id]);
  api.toggleLinkSelected(); // 기본 스코프: size on / orientation off
  const lid = primaryLid(u1);
  api.doc.activeId = u2.id;
  api.doc.selectedIds = [u2.id];
  api.rotate(1); // u2 = 90°
  api.doc.activeId = u3.id;
  api.doc.selectedIds = [u3.id];
  api.rotate(1);
  api.rotate(1); // u3 = 180°
  await sleep(10);
  ok('링크 회전: 개별 회전은 링크를 깨지 않음 (로컬 치수 불변)', () => {
    assert.equal(primaryLid(u2), lid);
    assert.equal(primaryLid(u3), lid);
    assert.deepEqual([u2.params.W, u2.params.H], [800, 960]);
    assert.deepEqual([u3.params.W, u3.params.H], [960, 800]);
  });
  const p2 = { x: u2.x, y: u2.y };
  const p3 = { x: u3.x, y: u3.y };
  api.doc.activeId = u1.id;
  api.doc.selectedIds = [u1.id];
  await sleep(10); // 활성 전환 안정화 (미러 워처의 id 비교)
  u1.params.W = 1200; // 활성 편집 → 링크 동기
  await sleep(10);
  ok('링크 사이즈: 로컬 치수 매핑 (90° 멤버는 캔버스 H로)', () => {
    assert.deepEqual([u2.params.W, u2.params.H], [800, 1200]);
    assert.deepEqual([u3.params.W, u3.params.H], [1200, 800]);
  });
  ok('링크 앵커: 로컬 원점 코너 고정 — 90°(우상단) 제자리, 180°(우하단)는 정반대로 확장', () => {
    assert.equal(u2.x, p2.x);
    assert.equal(u2.y, p2.y);
    assert.equal(u3.x, p3.x - 240); // 우하단 코너 고정 → 왼쪽으로 +240 확장
    assert.equal(u3.y, p3.y);
  });
  // 회전+반전 통합 판정 (localOriginCorner): 180°+flip = 좌하단 앵커 → 가로 확장이 오른쪽으로
  u3.params.flipX = true;
  const x3 = u3.x;
  u1.params.W = 1500;
  await sleep(10);
  ok('링크 앵커: 회전·반전 통합 판정 (180°+flip = 좌하단 고정)', () => {
    assert.deepEqual([u3.params.W, u3.params.H], [1500, 800]);
    assert.equal(u3.x, x3);
  });
}

// 16. 유닛 이름 (§202): 프리셋 이름 승계 + 복제·붙여넣기도 동일 이름
{
  const api = fresh();
  const u = api.createUnitFrom({ W: 500, H: 400 }, 0, 0, 'My Preset');
  assert.equal(u.name, 'My Preset');
  const d = api.duplicateFrom(u);
  api.setSelection([u.id]);
  api.copyActive();
  api.pasteAt(5000, 5000); // 붙여넣기 후 사본이 선택됨
  const p = api.doc.units.find((x) => api.doc.selectedIds.includes(x.id));
  ok('이름: 프리셋 이름 생성·복제·붙여넣기 승계', () => {
    assert.equal(d.name, 'My Preset');
    assert.equal(p.name, 'My Preset');
  });
  const f = api.createFrame(0, 0, 300, 200);
  const f2 = api.duplicateFrom(f);
  ok('이름: 프레임도 넘버링 폐지 — 생성·복제 모두 "Frame" (§204)', () => {
    assert.equal(f.name, 'Frame');
    assert.equal(f2.name, 'Frame');
  });
}

// 17. 링크 앵커 공유 (§205): 핸들 리사이즈 중에는 활성의 로컬 앵커가 링크로 공유됨
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 0°
  const u2 = api.createUnit(3000, 1500); // 0°
  const u3 = api.createUnit(1500, 3000);
  api.setSelection([u1.id, u2.id, u3.id]);
  api.toggleLinkSelected();
  api.doc.activeId = u3.id;
  api.doc.selectedIds = [u3.id];
  api.rotate(1);
  api.rotate(1); // u3 = 180°
  await sleep(10);
  api.doc.activeId = u1.id;
  api.doc.selectedIds = [u1.id];
  await sleep(10);
  const p2 = { x: u2.x, y: u2.y };
  const p3 = { x: u3.x, y: u3.y };
  api.setLinkResizeAnchor([1, 1]); // 활성이 좌상단 핸들을 잡은 상황 — 앵커 = 로컬 우하
  u1.params.W = 1200;
  await sleep(10);
  ok('링크 앵커 공유: 같은 오리엔트 = 활성과 동일(우하 고정, 좌로 확장) · 180° = 정반대(좌상 고정)', () => {
    assert.equal(u2.x, p2.x - 240);
    assert.equal(u2.y, p2.y);
    assert.equal(u3.x, p3.x);
    assert.equal(u3.y, p3.y);
  });
  api.setLinkResizeAnchor(null); // 드래그 종료 — 기본(로컬 원점) 복귀
}

// 18. 패턴 프리셋 (§205): 프레임+내용물 캡처 → 통째 재생성 (그룹·링크는 새 id)
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  u1.x -= 300; // 프레임 안 비대칭 배치
  const u2 = api.createUnit(f.x + 1500, f.y + 1000);
  api.setSelection([u1.id, u2.id]);
  api.toggleLinkSelected();
  api.groupSelected();
  const lid0 = primaryLid(u1);
  const gid0 = u1.groups[0];
  const count0 = api.doc.units.length;
  const pat = api.capturePattern(f.id);
  ok('패턴 캡처: 프레임+소유 유닛·그룹·링크 수집', () => {
    assert.equal(pat.units.length, 2);
    assert.equal(pat.frame.W, 2000);
    assert.ok(pat.units.every((u) => primaryLid(u) === lid0)); // §220: 유닛 내장 links
  });
  const nf = api.placePattern({ ...pat, name: 'P1' }, 9000, 9000);
  const placed = api.doc.units.slice(count0 + 1); // 새 프레임 뒤의 유닛들
  ok('패턴 배치: 상대 배치·이름 보존 + 그룹/링크 새 id 재구성', () => {
    assert.equal(api.doc.units.length, count0 + 3);
    assert.equal(nf.name, 'P1');
    assert.equal(nf.x + nf.params.W / 2, 9000);
    assert.equal(placed.length, 2);
    assert.equal(placed[0].x - nf.x, u1.x - f.x); // 상대 오프셋 보존
    assert.equal(placed[0].y - nf.y, u1.y - f.y);
    assert.ok(primaryLid(placed[0]) != null && primaryLid(placed[0]) === primaryLid(placed[1]) && primaryLid(placed[0]) !== lid0);
    assert.ok(placed[0].groups[0] && placed[0].groups[0] === placed[1].groups[0] && placed[0].groups[0] !== gid0);
  });
}


// 18. §223 애니메이션 페어/엣지 (Phase B): opt-복제 페어 공유·링크 재구성·연결 규칙·언두
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  const u2 = api.createUnit(f.x + 1500, f.y + 1000);
  api.setSelection([u1.id, u2.id]);
  api.toggleLinkSelected();
  const lid0 = primaryLid(u1);
  const r = api.duplicatePairedFrame(f.id, 5000, 0);
  const nf = r.frame;
  const [c1, c2] = r.copies.slice(1);
  ok('페어 복제: 프레임+소유 유닛, pair 공유·상대 배치 보존', () => {
    assert.equal(r.copies.length, 3);
    assert.ok(f.pair != null && nf.pair === f.pair);
    assert.ok(u1.pair != null && c1.pair === u1.pair);
    assert.ok(u2.pair != null && c2.pair === u2.pair);
    assert.equal(c1.x - nf.x, u1.x - f.x);
    assert.equal(c1.y - nf.y, u1.y - f.y);
    assert.equal(nf.name, f.name);
  });
  ok('페어 복제: 파라미터 링크는 사본끼리 새 lid (키프레임 간 동기화 차단)', () => {
    assert.ok(primaryLid(c1) != null && primaryLid(c1) === primaryLid(c2));
    assert.ok(primaryLid(c1) !== lid0);
    assert.equal(primaryLid(u1), lid0);
  });
  const e1 = api.connectAnim(f.id, nf.id);
  ok('애니 엣지: 연결 생성 (ease in-out · 1s 기본) + 자기 연결 무효', () => {
    assert.equal(api.doc.animEdges.length, 1);
    assert.equal(e1.duration, 1000);
    assert.deepEqual(e1.curve, [0.65, 0, 0.35, 1]); // §225 기본 곡선
    assert.equal(api.connectAnim(f.id, f.id), null);
  });
  const r2 = api.duplicatePairedFrame(nf.id, 5000, 0);
  const f3 = r2.frame;
  api.connectAnim(f.id, f3.id);
  ok('애니 엣지: 우측 노드 재연결 = 기존 연결 이설', () => {
    assert.equal(api.doc.animEdges.length, 1);
    assert.equal(api.doc.animEdges[0].to, f3.id);
  });
  api.connectAnim(nf.id, f3.id);
  ok('애니 엣지: 좌측 노드 중복 유입 = 기존 연결 교체', () => {
    assert.equal(api.doc.animEdges.length, 1);
    assert.equal(api.doc.animEdges[0].from, nf.id);
  });
  ok('애니 엣지: 빈 곳 드롭 해제 (side별·no-op 판정)', () => {
    assert.equal(api.disconnectAnim(nf.id, 'right'), true);
    assert.equal(api.doc.animEdges.length, 0);
    assert.equal(api.disconnectAnim(nf.id, 'right'), false);
  });
  api.connectAnim(f.id, nf.id);
  api.setSelection([f3.id]);
  api.deleteSelected();
  const keptAfterUnrelated = api.doc.animEdges.length;
  api.setSelection([nf.id]);
  api.deleteSelected();
  ok('애니 엣지: 무관 프레임 삭제 유지 · 연결 프레임 삭제 시 정리', () => {
    assert.equal(keptAfterUnrelated, 1);
    assert.equal(api.doc.animEdges.length, 0);
  });
  await sleep(400);
  const f4 = api.createFrame(9000, 0, 500, 400);
  api.connectAnim(f.id, f4.id);
  await sleep(400);
  const n1 = api.doc.animEdges.length;
  api.undo();
  ok('애니 엣지: 언두에 연결 포함', () => {
    assert.equal(n1, 1);
    assert.equal(api.doc.animEdges.length, 0);
  });
}


// 19. §225 애니 소속(home): 키프레임이 겹쳌도 소속·페어 매칭 유지
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  const r = api.duplicatePairedFrame(f.id, 30, 30); // 거의 겹치게 복제
  ok('애니 소속: home 확정 — 겹친 키프레임에서도 각자 1유닛', () => {
    const a = api.animOwnedUnits(f.id);
    const b = api.animOwnedUnits(r.frame.id);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(a[0].id, u1.id);
    assert.notEqual(b[0].id, u1.id);
    assert.equal(a[0].pair, b[0].pair);
  });
  api.setSelection([r.frame.id]);
  api.deleteSelected();
  ok('애니 소속: 프레임 삭제 시 home 해제', () => {
    assert.ok(api.doc.units.every((u) => u.home == null || u.home === f.id));
  });
}

console.log(`✓ document ops: ${passed} cases passed`);
