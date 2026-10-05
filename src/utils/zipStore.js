// §247: STORE(무압축) ZIP 생성 — PNG 시퀀스 익스포트 묶음 전용.
// PNG는 이미 압축 포맷이라 store로 충분. 의존성 없이 로컬 파일 헤더 + 중앙 디렉터리 직접 조립.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: string, data: Uint8Array }] → ZIP Blob
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
  const u32 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF]);
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    // 로컬 파일 헤더 — bit11 = UTF-8 파일명
    const local = [u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0)];
    central.push({ name, crc, size: f.data.length, offset });
    for (const c of local) { chunks.push(c); }
    chunks.push(name, f.data);
    offset += 30 + name.length + f.data.length;
  }
  const cdStart = offset;
  for (const e of central) {
    const hdr = [u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(e.offset)];
    for (const c of hdr) chunks.push(c);
    chunks.push(e.name);
    offset += 46 + e.name.length;
  }
  chunks.push(u32(0x06054B50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(offset - cdStart), u32(cdStart), u16(0));
  return new Blob(chunks, { type: 'application/zip' });
}
