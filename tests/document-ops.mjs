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

const { useDocument } = await import('../src/composables/useDocument.js');

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
  api.arrangeGrid({ gap: 40 });
  ok('어레인지: 프레임 이동 시 내용물 동반', () => {
    assert.deepEqual([u.x - f1.x, u.y - f1.y], rel);
  });
  // 혼합 선택: 소유 유닛이 별도 선택되면 자기 블록으로만 이동 (이중 이동 없음)
  centerIn(u, f1);
  api.doc.selectedIds = [u.id, f1.id, f2.id];
  api.arrangeGrid({ gap: 40 });
  ok('어레인지: 혼합 선택 시 이중 이동 없음', () => {
    for (const o of [u, f1, f2]) {
      assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
    }
    // 3블록 그리드: 유닛은 자기 셀 — 프레임과 상대 위치가 깨져야 정상 (동반 아님)
    assert.notDeepEqual([u.x - f1.x, u.y - f1.y], rel);
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

// 8. 히스토리: 이동 → undo 복원 (350ms 디바운스 대기)
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

console.log(`✓ document ops: ${passed} cases passed`);
