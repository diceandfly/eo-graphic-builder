// ─── IndexedDB 헬퍼 (§68 부채 ⑤) ──────────────────────
// 저장 아키텍처 결정: 문서 메타(JSON)는 localStorage 유지(작고 동기 복원 가능),
// 대용량 바이너리(이미지 blob 등)만 여기 'blobs' 스토어에 id로 저장한다.
// 문서에는 blob id만 넣으므로 localStorage 5MB 한계와 무관해진다.
// 사용 예정: 이미지 붙여넣기(클립보드) 기능. 현재는 기반만 마련.
const DB_NAME = 'eo-store';
const DB_VER = 1;
const STORE = 'blobs';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const putBlob = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const getBlob = (id) => tx('readonly', (s) => s.get(id));
export const deleteBlob = (id) => tx('readwrite', (s) => s.delete(id));
export const listBlobIds = () => tx('readonly', (s) => s.getAllKeys());
