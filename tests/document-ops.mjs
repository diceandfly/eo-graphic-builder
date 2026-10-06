// 문서 조작 회귀 (§122) — useDocument 로직을 node에서 직접 구동.
// 대상: 블록 판정·프레임 소유(§92)·정렬/등간격/어레인지 동반 이동(§114·§120)·마이그레이션·히스토리.
// UI 배선(팝업·입력·드래그)은 대상 아님 — 브라우저 검증 채널 유지.
import { strict as assert } from 'node:assert';
import { dockAxesParallel } from '../src/geometry/dock.js';

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

// 14. 링크 자동 분리 (§200 → §303 개정): 균일 변형은 분화 대신 전파 — 분화는 값이 갈릴 때만
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const u2 = api.createUnit(3000, 1500);
  const u3 = api.createUnit(1500, 3000);
  api.setSelection([u1.id, u2.id, u3.id]);
  api.toggleLinkSelected();
  const lid0 = primaryLid(u1);
  assert.ok(lid0 != null && primaryLid(u3) === lid0);
  // §303: 3멤버 중 2개만 통합 스케일 — 같은 배율(값 동일 유지) → 그룹 유지 + 나머지 전파
  api.setSelection([u1.id, u2.id]);
  api.setSize({ W: 5000 });
  ok('§303: 균일 서브셋 스케일 = 그룹 유지 + 미선택 멤버 전파', () => {
    assert.equal(primaryLid(u1), lid0);
    assert.equal(primaryLid(u2), lid0);
    assert.equal(primaryLid(u3), lid0);
    assert.ok(Math.abs(u3.params.W - u1.params.W) < 1e-6);
  });
  // §303: 링크 밖 유닛과 묶어 1멤버만 스케일 — 단일 변경은 자명히 균일 → 그룹 유지 + 동기
  const u4 = api.createUnit(6000, 1000);
  const u5 = api.createUnit(6000, 2500);
  api.setSelection([u4.id, u5.id]);
  api.toggleLinkSelected();
  const lid4 = primaryLid(u4);
  const u6 = api.createUnit(8000, 1000); // 링크 밖 동반 선택용
  api.setSelection([u4.id, u6.id]);
  api.setSize({ W: 7000 });
  ok('§303: 1멤버 지오메트리 조작 = 그룹 유지 + 동기 (핸들·패널 일관화)', () => {
    assert.equal(primaryLid(u4), lid4);
    assert.equal(primaryLid(u5), lid4);
    assert.ok(Math.abs(u5.params.W - u4.params.W) < 1e-6);
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
    // §312: 키프레임 네이밍 — 체인은 이름 공유 (K<n>은 파생 표기, 저장 이름 미포함)
    assert.equal(nf.name, f.name);
    assert.ok(!/ K\d+$/.test(f.name), f.name);
    assert.equal(api.frameKIndex(f), 1);
    assert.equal(api.frameKIndex(nf), 2);
    assert.equal(api.displayName(nf), `${nf.name} K2`);
  });
  ok('페어 복제: 파라미터 링크는 사본끼리 새 lid (키프레임 간 동기화 차단)', () => {
    assert.ok(primaryLid(c1) != null && primaryLid(c1) === primaryLid(c2));
    assert.ok(primaryLid(c1) !== lid0);
    assert.equal(primaryLid(u1), lid0);
  });
  const e1 = api.connectAnim(f.id, nf.id);
  ok('애니 엣지: 연결 생성 (ease in-out · 1s 기본) + 자기 연결 무효', () => {
    assert.equal(api.doc.animEdges.length, 1);
    assert.equal(e1.duration, 2000); // §302: 기본 2000ms
    assert.deepEqual(e1.curve, [0, 0, 1, 1]); // §302: 기본 Linear (§227 Ease 33·33 교체)
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


// 20. §227 애니 모드 이산값 잠금: 페어 유닛 편집 경고+원복
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  api.duplicatePairedFrame(f.id, 5000, 0);
  api.setAnimMode(true);
  let warned = null;
  api.setNotifier((m) => { warned = m; });
  api.doc.activeId = u1.id;
  api.doc.selectedIds = [u1.id];
  await sleep(10);
  // §261: orientation·flipX는 잠금 대상에서 제외 — threads 같은 나머지 이산키만 원복+경고 유지
  u1.params.threads = 'one';
  await sleep(20);
  ok('잠금: 페어 유닛 threads 편집 = 원복+경고 (§261 잔존 잠금)', () => {
    assert.equal(u1.params.threads, 'both');
    assert.ok(/locked/i.test(warned ?? ''));
  });
  // §261: 회전 = 잠금 대신 **짝 전체 동시 적용**
  const mate = api.doc.units.find((m) => m !== u1 && m.type !== 'frame' && m.pair === u1.pair);
  api.rotate(1);
  await sleep(20);
  ok('§261: 페어 유닛 회전 = 짝 동기 (양쪽 90°)', () => {
    assert.equal(u1.params.orientation, 90);
    assert.equal(mate.params.orientation, 90);
  });
  // §261: 반전도 짝 동기 (화면 H — 현재 90° 상태라 mirrorScreen 분기 포함 검증)
  const f0 = { a: u1.params.flipX, b: mate.params.flipX };
  api.flipUnit();
  await sleep(20);
  ok('§261: 페어 유닛 좌우반전 = 짝 동기', () => {
    assert.notEqual(u1.params.flipX, f0.a);
    assert.notEqual(mate.params.flipX, f0.b);
    assert.equal(u1.params.orientation, mate.params.orientation);
  });
  api.setAnimMode(false);
  api.rotate(1);
  await sleep(20);
  // 90° 상태의 H-flip은 orientation 270(+flipX)이 됨 → +90 회전 = 0
  ok('§261: 비애니 모드 회전도 짝 동기 (대응 유지)', () => {
    assert.equal(u1.params.orientation, 0);
    assert.equal(mate.params.orientation, 0);
    assert.equal(u1.params.flipX, mate.params.flipX);
  });
}


// 21. §235 페어 해제: 페어·소속·연결 정리 → 삭제 차단 해제
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  const r = api.duplicatePairedFrame(f.id, 5000, 0);
  api.connectAnim(f.id, r.frame.id);
  const res = api.unpairFrame(r.frame.id);
  ok('페어 해제: pair/home/연결 정리', () => {
    assert.equal(res.units, 1);
    assert.equal(r.frame.pair, null);
    assert.ok(api.doc.units.every((u) => u.home !== r.frame.id));
    assert.equal(api.doc.animEdges.length, 0);
    assert.equal(f.pair, null); // §254: 계보에 1개만 남으면 파트너도 자동 초기화
    assert.ok(api.doc.units.every((u) => u.home !== f.id)); // 파트너 소속 유닛도 해제
  });
  api.setAnimMode(true);
  api.setSelection([r.frame.id]);
  api.deleteSelected(); // 스테이지 guardedDelete는 UI쪽 — 문서 연산은 항상 허용, pair 없으니 UI 가드도 통과
  ok('페어 해제 후 삭제 가능', () => {
    assert.ok(!api.doc.units.some((u) => u.id === r.frame.id));
  });
}


// §245. 프레임 회전: 내부 유닛 동반 (프레임 중심 기준 블록 회전 + 유닛 orientation 스텝)
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 960×800
  const f = api.createFrame(0, 0, 2000, 1000);
  u1.x = 100; u1.y = 100; // 프레임 좌상단 영역 (중심 (580, 500) — 프레임 안)
  api.setSelection([f.id]);
  api.doc.activeId = f.id;
  api.rotate(1); // 시계 90°
  ok('프레임 회전: 프레임 W/H 스왑 + 중심 유지', () => {
    assert.equal(f.params.W, 1000);
    assert.equal(f.params.H, 2000);
    assert.equal(f.x + f.params.W / 2, 1000);
    assert.equal(f.y + f.params.H / 2, 500);
  });
  ok('프레임 회전: 내부 유닛 위치 동반 + orientation', () => {
    // 유닛 중심 (580,500) → C(1000,500) 기준 시계 90° → (1000, 80)
    assert.equal(u1.params.orientation, 90);
    assert.equal(u1.params.W, 800); // W/H 스왑
    assert.equal(u1.x + u1.params.W / 2, 1000);
    assert.equal(u1.y + u1.params.H / 2, 80);
  });
  // 4회 회전 = 원위치 (누적 오차 없음)
  api.rotate(1); api.rotate(1); api.rotate(1);
  ok('프레임 회전: 4회 = 원위치·orientation 0', () => {
    assert.equal(u1.params.orientation, 0);
    assert.equal(u1.x, 100);
    assert.equal(u1.y, 100);
  });
}

// §245. rotateSelected: 선택에 프레임 포함 시 내부 유닛 동반
{
  const api = fresh();
  const u1 = api.doc.units[0];
  const f = api.createFrame(0, 0, 2000, 1000);
  centerIn(u1, f);
  const f2 = api.createFrame(3000, 0, 2000, 1000);
  api.setSelection([f.id, f2.id]);
  api.rotateSelected(1);
  ok('rotateSelected: 프레임 선택 시 내부 유닛 동반', () => {
    assert.equal(u1.params.orientation, 90);
    // u1 중심 = f 중심과 일치 → 회전 후에도 f 중심과 일치해야 함
    assert.equal(u1.x + u1.params.W / 2, f.x + f.params.W / 2);
    assert.equal(u1.y + u1.params.H / 2, f.y + f.params.H / 2);
  });
}


// §254. 자동 페어 초기화 — 계보에 프레임이 1개만 남으면 (삭제 경로)
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1000);
  const r = api.duplicatePairedFrame(f.id, 5000, 0);
  api.connectAnim(f.id, r.frame.id);
  const copyIds = [r.frame.id, ...api.doc.units.filter((u) => u.home === r.frame.id).map((u) => u.id)];
  api.setSelection(copyIds);
  api.deleteSelected();
  ok('§254: 파트너 삭제 시 남은 프레임 자동 언페어', () => {
    assert.equal(f.pair, null);
    assert.equal(api.doc.animEdges.length, 0);
    assert.ok(api.doc.units.every((u) => u.home !== f.id));
  });
}


// §266·§269. 오리엔테이션 링크 — 결성 = 방위 통일(활성 기준), 이후 일부 선택 조작도 전 멤버 동반
{
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x += 3000;
  u2.params.orientation = 90; // 홀수 방위 + 캔버스 치수 스왑 상태
  [u2.params.W, u2.params.H] = [u2.params.H, u2.params.W];
  u2.params.flipX = true;
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'orientation', 'new');
  await sleep(30);
  ok('§269: 오리 링크 결성 = 방위 통일 + 캔버스 W/H 재스왑', () => {
    assert.equal(u2.params.orientation, 0);
    assert.equal(u2.params.flipX, false);
    assert.equal(u2.params.W, u1.params.W); // 홀→짝 전환 시 치수 복원
    assert.equal(u2.params.H, u1.params.H);
  });
  api.setSelection([u1.id]); // 하나만 선택해도 링크 확산 (§266)
  api.flipSelected('h');
  await sleep(30);
  ok('§266: 오리 링크 + 일부 선택 플립 = 링크 유지·전 멤버 동반', () => {
    assert.ok(u1.links.orientation != null && u1.links.orientation === u2.links.orientation);
    assert.equal(u1.params.flipX, true);
    assert.equal(u2.params.flipX, true); // §269: 통일 상태라 동일 변화
  });
  api.rotateSelected(1);
  await sleep(30);
  ok('§266: 오리 링크 + 일부 선택 회전 = 전 멤버 +90', () => {
    assert.equal(u1.params.orientation, 90);
    assert.equal(u2.params.orientation, 90);
    assert.ok(u1.links.orientation === u2.links.orientation);
  });
}


// §268. setCategoryLink = 걸면 통일 — 기준 유닛 값으로 즉시 동기 (orientation 범주는 예외)
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 960×800
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x += 3000;
  u2.params.W = 400; u2.params.H = 300;
  u2.params.orientation = 180;
  api.doc.activeId = u1.id; // 기준 = 활성(u1)
  api.setCategoryLink([u1.id, u2.id], 'size', 'new');
  await sleep(30);
  ok('§268: size 링크 결성 = 즉시 치수 통일 (활성 기준, 로컬 치수)', () => {
    assert.equal(u1.params.W, 960);
    assert.equal(u2.params.W, 960);
    assert.equal(u2.params.H, 800);
  });
  // §269: orientation도 결성 시 통일 (교차 디자인은 "같은 방위끼리 따로 걸기"로 — 멀티 링크 정석)
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'orientation', 'new');
  await sleep(30);
  ok('§269: orientation 링크 결성 = 활성 기준 통일', () => {
    assert.equal(u1.params.orientation, 0);
    assert.equal(u2.params.orientation, 0);
    assert.ok(u1.links.orientation != null && u1.links.orientation === u2.links.orientation);
  });
  // 기존 그룹 합류 = 그룹 값이 기준
  const u3 = api.duplicateFrom(u1);
  u3.x += 6000; u3.params.W = 123;
  api.setCategoryLink([u3.id, u1.id], 'size', u1.links.size);
  await sleep(30);
  ok('§268: 기존 그룹 합류 = 그룹 값 기준 동기', () => {
    assert.equal(u3.params.W, 960);
  });
}

// §273. cols = grid 범주 복귀 — grid 링크면 결성 동기 + 라이브 브로드캐스트 모두 cols 포함
{
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x += 3000;
  u1.params.cols = 9;
  u2.params.cols = 4;
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'grid', 'new');
  await sleep(30);
  ok('§273: grid 링크 결성 = cols 즉시 통일', () => {
    assert.equal(u2.params.cols, 9);
  });
  api.doc.selectedIds = [u1.id];
  api.doc.activeId = u1.id;
  u1.params.cols = 6;
  await sleep(30);
  ok('§273: grid 링크 라이브 동기 = cols 브로드캐스트', () => {
    assert.equal(u2.params.cols, 6);
  });
}

// §274. 멀티 링크 라이브 동기 — 범주별 그룹이 달라도 뒤 범주(animation) 상대에 전파
// (종전: primaryLid 하나의 멤버만 모아 size 링크 상대에게만 전파 → grow 미동기)
{
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1); u2.x += 3000;
  const u3 = api.duplicateFrom(u1); u3.x += 6000;
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'size', 'new');      // 앞 범주 링크 = u1-u2
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u3.id], 'animation', 'new'); // 뒤 범주 링크 = u1-u3
  await sleep(30);
  api.doc.selectedIds = [u1.id];
  api.doc.activeId = u1.id;
  u1.params.grow = 'l';
  await sleep(30);
  ok('§274: animation 링크 상대(비 primaryLid 그룹)에 grow 전파', () => {
    assert.equal(u3.params.grow, 'l');
  });
  ok('§274: 범주 필터 유지 — size만 링크된 u2에는 grow 미전파', () => {
    assert.equal(u2.params.grow, 'r');
  });
}

// §277. 페어 프레임 간 링크 구조 자동 동기 — 프레임별 분리 lid 복제 + 해제 동기
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  const u2 = api.createUnit(f.x + 1500, f.y + 1000);
  api.duplicatePairedFrame(f.id, 5000, 0);
  const m1 = api.doc.units.find((u) => u.pair === u1.pair && u.id !== u1.id);
  const m2 = api.doc.units.find((u) => u.pair === u2.pair && u.id !== u2.id);
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'grid', 'new');
  await sleep(30);
  ok('§277: 링크 결성 = 짝 프레임 유닛에 구조 복제 (분리 lid)', () => {
    assert.ok(m1.links.grid != null);
    assert.equal(m1.links.grid, m2.links.grid);
    assert.notEqual(m1.links.grid, u1.links.grid); // duplicatePairedFrame lidMap 관례와 동일
  });
  ok('§277: 짝 프레임 내 값 통일 — 키프레임 간 값은 불간섭', () => {
    assert.equal(m1.params.cols, m2.params.cols);
  });
  api.unlinkUnit(u1.id);
  await sleep(30);
  ok('§277: 해제도 동기 — 짝 프레임 링크 소멸', () => {
    assert.equal(m1.links.grid, null);
    assert.equal(m2.links.grid, null);
  });
}

// §278. 도킹(docking) — 결착 정렬·거터 평균·실시간 재정렬·동반 이동·회전 락·사이클 가드
{
  const api = fresh();
  const u1 = api.doc.units[0]; // 960×800, gutterPx 10
  u1.x = 0; u1.y = 0;
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x = 5000; u2.y = 3000;
  const u3 = api.duplicateFrom(u1);
  u3.x = 9000; u3.y = -2000;
  await sleep(30);
  const e1 = api.connectDock(u1.id, u2.id);
  ok('§278: 결착 = 샤프트 정렬 + 거터(평균) 접착', () => {
    assert.ok(e1);
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 10)) < 1e-6, `u2.x=${u2.x}`);
    assert.ok(Math.abs(u2.y - u1.y) < 1e-6, `u2.y=${u2.y}`);
  });
  api.connectDock(u2.id, u3.id); // 직렬 체인 u1→u2→u3
  ok('§278: 직렬 도킹 — 3연속 체인 정렬', () => {
    assert.ok(Math.abs(u3.x - (u2.x + 960 + 10)) < 1e-6, `u3.x=${u3.x}`);
    assert.ok(Math.abs(u3.y - u1.y) < 1e-6);
  });
  ok('§278: 사이클 가드 — 꼬리→머리 결착 거부', () => {
    assert.equal(api.connectDock(u3.id, u1.id), null);
  });
  api.doc.selectedIds = [u1.id];
  api.doc.activeId = u1.id;
  u1.params.gutterPx = 30; // §273: grid 링크 결성 없음 — 단독 변경
  await sleep(30);
  ok('§278: 거터 편집 실시간 재정렬 — 평균 (30+10)/2 = 20', () => {
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 20)) < 1e-6, `u2.x=${u2.x}`);
  });
  api.nudgeSelected(7, -3); // u1만 선택 — 체인 동반
  await sleep(30);
  ok('§278: 동반 이동 — 체인 전체가 함께', () => {
    assert.ok(Math.abs(u1.x - 7) < 1e-6);
    assert.ok(Math.abs(u2.x - (7 + 960 + 20)) < 1e-6, `u2.x=${u2.x}`);
    assert.ok(Math.abs(u3.y - (-3)) < 1e-6, `u3.y=${u3.y}`);
  });
  const o0 = u2.params.orientation;
  api.doc.selectedIds = [u2.id];
  api.rotateSelected(1);
  ok('§278: 도킹 중 회전 락', () => {
    assert.equal(u2.params.orientation, o0);
  });
  ok('§278: 해제 — 우측 노드 기준', () => {
    assert.ok(api.disconnectDock(u2.id, 'right'));
    assert.equal(api.doc.docks.length, 1);
  });
}

// §282. 도킹 기하 — 역평행(180°) = 서로를 향한 끝끼리 접착(겹침 금지) · 비평행 = 거부
{
  const api = fresh();
  const u1 = api.doc.units[0];
  u1.x = 0; u1.y = 0;
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x = 5000; u2.y = 0;
  await sleep(30);
  // 180° 회전(역평행) — 축은 평행, 로컬 좌/우 노드는 기하적으로 뒤집힘
  u2.params.orientation = 180;
  const r = api.connectDock(u1.id, u2.id);
  ok('§282: 역평행 결착 = 현 배치 그대로 — u2가 u1 오른쪽에 접착 (겹침 없음)', () => {
    assert.ok(r);
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 10)) < 1e-6, `u2.x=${u2.x}`);
    assert.ok(Math.abs(u2.y - u1.y) < 1e-6, `u2.y=${u2.y}`);
  });
  const u3 = api.duplicateFrom(u1);
  u3.x = 9000; u3.y = 0;
  u3.params.orientation = 90; // 수직 축 — 비평행
  await sleep(30);
  ok('§282: 축 비평행 결착 거부', () => {
    assert.equal(api.connectDock(u1.id, u3.id), null);
    assert.equal(dockAxesParallel(u1, u2), true);
    assert.equal(dockAxesParallel(u1, u3), false);
  });
}

// §283. 페어 프레임 간 도크 자동 복제 + Undock(배지 팝업) + 복제 시 도크 동반
{
  const api = fresh();
  const f = api.createFrame(0, 0, 3000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  u1.x = f.x + 100;
  const u2 = api.createUnit(f.x + 1500, u1.y);
  api.duplicatePairedFrame(f.id, 8000, 0);
  const m1 = api.doc.units.find((u) => u.pair === u1.pair && u.id !== u1.id);
  const m2 = api.doc.units.find((u) => u.pair === u2.pair && u.id !== u2.id);
  await sleep(30);
  api.connectDock(u1.id, u2.id);
  await sleep(30);
  ok('§283: 결착 = 짝 키프레임에 도크 복제 + 그 프레임 기준 정렬', () => {
    assert.ok(api.doc.docks.some((e) => e.from === m1.id && e.to === m2.id));
    assert.ok(Math.abs(m2.x - (m1.x + m1.params.W + 10)) < 1e-6, `m2.x=${m2.x}`);
  });
  api.undockUnit(u1.id);
  await sleep(30);
  ok('§283: Undock = 짝 키프레임 포함 전체 해제', () => {
    assert.equal(api.doc.docks.length, 0);
  });
  // 도크가 있는 프레임을 페어 복제하면 사본에도 도크 동반
  api.connectDock(u1.id, u2.id);
  await sleep(30);
  const before = api.doc.docks.length;
  api.duplicatePairedFrame(f.id, 16000, 0);
  ok('§283: 페어 복제 시 소유 유닛 간 도크 동반 복제', () => {
    assert.ok(api.doc.docks.length > before);
  });
}

// §290. 도크 거터 보정(comp) — 평균±px + 짝 키프레임 복제
{
  const api = fresh();
  const f = api.createFrame(0, 0, 3000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  u1.x = f.x + 100;
  const u2 = api.createUnit(f.x + 1500, u1.y);
  api.duplicatePairedFrame(f.id, 8000, 0);
  const m1 = api.doc.units.find((u) => u.pair === u1.pair && u.id !== u1.id);
  const m2 = api.doc.units.find((u) => u.pair === u2.pair && u.id !== u2.id);
  await sleep(30);
  api.connectDock(u1.id, u2.id);
  await sleep(30);
  api.setDockComp(u1.id, u2.id, 67);
  await sleep(30);
  ok('§290: 거터 보정 = 평균+comp 재정렬 + 짝 엣지에 복제', () => {
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 10 + 67)) < 1e-6, `u2.x=${u2.x}`);
    const me = api.doc.docks.find((e) => e.from === m1.id && e.to === m2.id);
    assert.equal(me?.comp, 67);
    assert.ok(Math.abs(m2.x - (m1.x + 960 + 77)) < 1e-6, `m2.x=${m2.x}`);
  });
  api.setDockComp(u1.id, u2.id, 0);
  await sleep(30);
  ok('§290: 보정 0 = 평균 복귀 + 짝 comp 키 제거', () => {
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 10)) < 1e-6, `u2.x=${u2.x}`);
    const me = api.doc.docks.find((e) => e.from === m1.id && e.to === m2.id);
    assert.ok(me && me.comp === undefined);
  });
}

// §295. 도킹 회전 락 완화 — 체인 전체가 조작 대상이면 허용, 쪼개지면 락
{
  const api = fresh();
  const u1 = api.doc.units[0];
  u1.x = 0; u1.y = 0;
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1);
  u2.x = 5000; u2.y = 0;
  await sleep(30);
  api.connectDock(u1.id, u2.id);
  await sleep(30);
  api.doc.selectedIds = [u1.id];
  api.rotateSelected(1);
  ok('§295: 체인 일부만 선택 = 회전 락 유지', () => {
    assert.equal(u1.params.orientation, 0);
  });
  api.doc.selectedIds = [u1.id, u2.id];
  api.rotateSelected(1);
  await sleep(30);
  ok('§295: 체인 전체 선택 = 함께 회전 허용 + 결착 유지', () => {
    assert.equal(u1.params.orientation, 90);
    assert.equal(u2.params.orientation, 90);
    assert.equal(api.doc.docks.length, 1);
    // 수직 축 재정렬: u2가 u1 아래로, 경계 간 거터 10
    assert.ok(Math.abs(u2.y - (u1.y + u1.params.H + 10)) < 1e-6, `u2.y=${u2.y} u1.y=${u1.y} H=${u1.params.H}`);
    assert.ok(Math.abs(u2.x - u1.x) < 1e-6);
  });
}

// §297. 페어 키프레임 프레임 = 회전 락
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  api.duplicatePairedFrame(f.id, 5000, 0);
  await sleep(30);
  api.doc.selectedIds = [f.id];
  api.doc.activeId = f.id;
  const o0 = f.params.orientation;
  const w0 = f.params.W;
  api.rotateSelected(1);
  api.rotate(1);
  ok('§297: 페어 프레임 회전 락 (rotateSelected·rotate 양 경로)', () => {
    assert.equal(f.params.orientation, o0);
    assert.equal(f.params.W, w0);
  });
}

// §303. 균일 변형 = 링크 유지+전파 / 비균일 = 분화+토스트 · 정렬의 도크 체인 동반
{
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1); u2.x += 3000;
  const u3 = api.duplicateFrom(u1); u3.x += 6000;
  await sleep(30);
  api.setCategoryLink([u1.id, u2.id, u3.id], 'size', 'new');
  await sleep(30);
  const lid0 = u1.links.size;
  // 균일: u1·u2만 같은 배율로 스케일 (그룹 bbox 리사이즈 시뮬레이션)
  api.withGeomOp(() => {
    for (const u of [u1, u2]) { u.params.W *= 2; u.params.H *= 2; }
  });
  await sleep(30);
  ok('§303: 균일 변형 = 분화 없이 그룹 유지 + 미선택 멤버 전파', () => {
    assert.equal(u1.links.size, lid0);
    assert.equal(u2.links.size, lid0);
    assert.equal(u3.links.size, lid0);
    assert.equal(u3.params.W, 1920); // 전파됨
  });
  // 비균일: u1·u2가 서로 다른 값으로 → 분화 + 토스트
  let msg = null;
  api.setNotifier((m) => { msg = m; });
  api.withGeomOp(() => {
    u1.params.W = 500;
    u2.params.W = 700;
  });
  await sleep(30);
  ok('§303: 비균일 변형 = 분화 + 시스템 메시지', () => {
    assert.notEqual(u1.links.size, lid0);
    assert.equal(u1.links.size, u2.links.size);
    assert.ok(u1.links.size !== u3.links.size);
    assert.ok(String(msg).includes('Link split'));
  });
}
{
  const api = fresh();
  const u1 = api.doc.units[0];
  u1.x = 0; u1.y = 0;
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1); u2.x = 5000; u2.y = 0;
  const u3 = api.duplicateFrom(u1); u3.x = 0; u3.y = 5000; // 정렬 상대
  await sleep(30);
  api.connectDock(u1.id, u2.id); // u2 → (970, 0)
  await sleep(30);
  api.doc.selectedIds = [u1.id, u3.id];
  api.alignSelected('left'); // 두 블록 좌측 정렬 — u1 블록 이동 시 체인(u2) 동반
  await sleep(30);
  ok('§303: 정렬 = 도크 체인 동반 (재정렬 스냅백 없음)', () => {
    assert.ok(Math.abs(u1.x - u3.x) < 1e-6);
    assert.ok(Math.abs(u2.x - (u1.x + 960 + 10)) < 1e-6, `u2.x=${u2.x}`);
    assert.equal(api.doc.docks.length, 1);
  });
}

// §304. 멀티선택 브로드캐스트 — 선택 전원의 링크그룹 합집합 동기 (키프레임 평행 그룹 포함)
{
  // 일반형: 서로 다른 두 링크그룹에서 1개씩 선택해 편집 → 양 그룹 전체 동기
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1); u2.x += 3000;
  const u3 = api.duplicateFrom(u1); u3.x += 6000;
  const u4 = api.duplicateFrom(u1); u4.x += 9000;
  await sleep(30);
  api.setCategoryLink([u1.id, u2.id], 'grid', 'new');
  api.setCategoryLink([u3.id, u4.id], 'grid', 'new');
  await sleep(30);
  api.doc.selectedIds = [u1.id, u3.id];
  api.doc.activeId = u1.id;
  await sleep(30); // 워처의 activeId 전환 가드 통과 후 변이
  u1.params.cols = 5;
  await sleep(30);
  ok('§304: 두 그룹에서 1개씩 선택 편집 = 양 그룹 전체 동기', () => {
    assert.equal(u2.params.cols, 5); // 활성의 그룹
    assert.equal(u3.params.cols, 5); // 선택 미러
    assert.equal(u4.params.cols, 5); // 두번째 선택의 그룹 (수정 전엔 미동기)
  });
}
{
  // 키프레임형: K1·K2 평행 그룹에서 하나씩 선택해 편집 → 양 키프레임 그룹 동기
  const api = fresh();
  const f = api.createFrame(0, 0, 3000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  u1.x = f.x + 100;
  const u2 = api.createUnit(f.x + 1500, u1.y);
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id], 'grid', 'new');
  api.duplicatePairedFrame(f.id, 8000, 0);
  const m1 = api.doc.units.find((u) => u.pair === u1.pair && u.id !== u1.id);
  const m2 = api.doc.units.find((u) => u.pair === u2.pair && u.id !== u2.id);
  await sleep(30);
  api.doc.selectedIds = [u1.id, m1.id];
  api.doc.activeId = u1.id;
  await sleep(30);
  u1.params.cols = 7;
  await sleep(30);
  ok('§304: K1·K2 평행 그룹 각 1개 선택 편집 = 양 키프레임 그룹 동기', () => {
    assert.equal(u2.params.cols, 7);
    assert.equal(m1.params.cols, 7);
    assert.equal(m2.params.cols, 7); // 두번째 키프레임의 링크 상대 (수정 전엔 미동기)
  });
}

// §311. 링크그룹 포크 — 선택분을 새 그룹으로 절연 (내부 관계 보존, 혼합은 그룹별 각각)
{
  // 단일 그룹 서브셋: 범주 간 그룹 동일성(size·grid 같은 lid) 보존 + 바깥 멤버 그룹 유지
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const u2 = api.duplicateFrom(u1); u2.x += 3000;
  const u3 = api.duplicateFrom(u1); u3.x += 6000;
  const u4 = api.duplicateFrom(u1); u4.x += 9000;
  await sleep(30);
  api.doc.selectedIds = [u1.id, u2.id, u3.id, u4.id];
  api.toggleLinkSelected(); // 기본 스코프 — size·grid 등이 같은 lid
  await sleep(30);
  const oldLid = u1.links.grid;
  api.doc.selectedIds = [u1.id, u2.id];
  ok('§311: 서브셋 선택 = 포크 가능 판정', () => assert.equal(api.canForkSelected(), true));
  const r = api.forkLinkSelected();
  ok('§311: 서브셋 포크 = 새 lid 공유 + 범주 간 동일성 보존 + 원본 그룹 유지', () => {
    assert.equal(r.groups, 1);
    assert.ok(u1.links.grid != null && u1.links.grid !== oldLid);
    assert.equal(u1.links.grid, u2.links.grid);
    assert.equal(u1.links.size, u1.links.grid); // 구lid→신lid 맵 공유
    assert.equal(u3.links.grid, oldLid);        // 바깥 2멤버 잔존 — 그룹 유지
    assert.equal(u4.links.grid, oldLid);
  });
  api.doc.selectedIds = [u1.id, u2.id, u3.id, u4.id];
  ok('§311: 그룹 전체 선택 = 포크 불가 (복제 무의미 — Unlink가 담당)', () => {
    // u1·u2(신그룹 전체)와 u3·u4(구그룹 전체) — 어느 lid도 바깥 멤버가 없음
    assert.equal(api.canForkSelected(), false);
    assert.equal(api.forkLinkSelected(), null);
  });
}
{
  // 혼합 선택(A안): 그룹별 각각 분리 + 홀로 남은 바깥 멤버는 자동 소멸(§129 규칙)
  const api = fresh();
  const u1 = api.doc.units[0];
  api.doc.activeId = u1.id;
  const us = [u1];
  for (let i = 1; i < 6; i += 1) { const u = api.duplicateFrom(u1); u.x += i * 3000; us.push(u); }
  await sleep(30);
  api.setCategoryLink([us[0].id, us[1].id, us[2].id], 'grid', 'new'); // 그룹 A
  api.setCategoryLink([us[3].id, us[4].id, us[5].id], 'grid', 'new'); // 그룹 B
  await sleep(30);
  api.doc.selectedIds = [us[0].id, us[1].id, us[3].id, us[4].id];
  const r = api.forkLinkSelected();
  ok('§311: 혼합 포크 = 그룹별 각각 새 그룹 + 1멤버 잔존 그룹 자동 소멸', () => {
    assert.equal(r.groups, 2);
    assert.ok(us[0].links.grid != null);
    assert.equal(us[0].links.grid, us[1].links.grid);
    assert.ok(us[3].links.grid != null);
    assert.equal(us[3].links.grid, us[4].links.grid);
    assert.notEqual(us[0].links.grid, us[3].links.grid); // 그룹 구조 보존 (합치지 않음)
    assert.equal(us[2].links.grid, null); // A 잔존 1멤버 — 소멸
    assert.equal(us[5].links.grid, null); // B 잔존 1멤버 — 소멸
  });
  // 선택 내 1개뿐인 멤버십은 불변 — 홀로 포크하면 링크를 잃으므로 원 그룹에 남긴다
  api.setCategoryLink([us[2].id, us[5].id], 'grid', 'new');          // 그룹 C
  api.setCategoryLink([us[0].id, us[1].id, us[3].id], 'grid', 'new'); // 그룹 D (3멤버)
  await sleep(30);
  const keepLid = us[2].links.grid;
  api.doc.selectedIds = [us[0].id, us[1].id, us[2].id];
  const r2 = api.forkLinkSelected();
  ok('§311: 선택 내 단독 멤버십은 불변 (원 그룹 유지)', () => {
    assert.equal(r2.groups, 1); // D의 us[0]·us[1]만 재편 (us[2]는 C의 단독 선택 — 불변)
    assert.ok(us[0].links.grid != null);
    assert.equal(us[0].links.grid, us[1].links.grid);
    assert.equal(us[2].links.grid, keepLid);
    assert.equal(us[5].links.grid, keepLid);
    assert.equal(us[3].links.grid, null); // D 잔존 1멤버 — 소멸
  });
}
{
  // 키프레임형: 포크도 §277 페어 복제 — K2 짝들이 별도 lid로 같은 구조를 가진다
  const api = fresh();
  const f = api.createFrame(0, 0, 4000, 1400);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  u1.x = f.x + 100;
  const u2 = api.createUnit(f.x + 1500, u1.y);
  const u3 = api.createUnit(f.x + 2800, u1.y);
  await sleep(30);
  api.doc.activeId = u1.id;
  api.setCategoryLink([u1.id, u2.id, u3.id], 'grid', 'new');
  api.duplicatePairedFrame(f.id, 9000, 0);
  const m = (u) => api.doc.units.find((x) => x.pair === u.pair && x.id !== u.id);
  await sleep(30);
  api.doc.selectedIds = [u1.id, u2.id];
  api.forkLinkSelected();
  await sleep(30);
  ok('§311: 포크의 페어 복제 — K2 짝도 같은 구조(별도 lid)로 분리', () => {
    assert.equal(u1.links.grid, u2.links.grid);
    assert.equal(m(u1).links.grid, m(u2).links.grid);
    assert.notEqual(m(u1).links.grid, u1.links.grid); // 프레임별 분리 lid (§277)
    assert.notEqual(m(u3).links.grid, m(u1).links.grid); // 짝 셋째는 포크 그룹 밖
  });
}

// §312. 키프레임 공통 이름 — K<n> 파생 표기 · 리네임 체인 전파 · 고아 복귀 시 이름 보존
{
  const api = fresh();
  const f = api.createFrame(0, 0, 2000, 1200);
  const u1 = api.doc.units[0];
  centerIn(u1, f);
  await sleep(30);
  const r1 = api.duplicatePairedFrame(f.id, 3000, 0);
  const r2 = api.duplicatePairedFrame(f.id, 6000, 0);
  ok('§312: 3연속 키프레임 = 이름 공유 + K1·K2·K3 파생 순번', () => {
    assert.equal(r1.frame.name, f.name);
    assert.equal(r2.frame.name, f.name);
    assert.deepEqual([f, r1.frame, r2.frame].map((x) => api.frameKIndex(x)), [1, 2, 3]);
  });
  api.doc.activeId = f.id;
  api.renameActive('Hero');
  ok('§312: 키프레임 리네임 = 체인 전체 전파 (이름 공유)', () => {
    assert.deepEqual([f, r1.frame, r2.frame].map((x) => x.name), ['Hero', 'Hero', 'Hero']);
    assert.equal(api.displayName(r2.frame), 'Hero K3');
  });
  // §315: 스테이지 라벨 인라인 편집 경로(renameUnit)도 동일 전파 — 활성 여부와 무관
  api.renameUnit(r1.frame.id, 'Logo');
  ok('§315: renameUnit(비활성 키프레임) = 체인 전체 전파', () => {
    assert.deepEqual([f, r1.frame, r2.frame].map((x) => x.name), ['Logo', 'Logo', 'Logo']);
  });
  api.renameUnit(f.id, 'Hero'); // 후속 단언(Hero 기준) 복원
  // 중간 키프레임 삭제 → 뒤 순번 자연 재부여 (위치 배지)
  api.setSelection([r1.frame.id]);
  api.unpairFrame(r1.frame.id);
  api.deleteSelected();
  ok('§312: 중간 키프레임 삭제 = K 순번 재부여 (저장 이름 불변)', () => {
    assert.equal(api.frameKIndex(r2.frame), 2);
    assert.equal(r2.frame.name, 'Hero');
  });
  // 남은 짝 하나를 더 지우면 마지막은 일반 프레임 복귀 — 이름 보존 + K 표기 소멸
  api.setSelection([f.id]);
  api.unpairFrame(f.id);
  api.deleteSelected();
  ok('§312: 고아 키프레임 자동 복귀 = 이름 보존 · K 표기만 소멸', () => {
    assert.equal(r2.frame.pair, null);
    assert.equal(r2.frame.name, 'Hero');
    assert.equal(api.frameKIndex(r2.frame), null);
    assert.equal(api.displayName(r2.frame), 'Hero');
  });
}

console.log(`✓ document ops: ${passed} cases passed`);
