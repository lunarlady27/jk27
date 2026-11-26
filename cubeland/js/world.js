// ===================== 큐브랜드 — 블록 세계 (지형 생성 · 청크 · 메시) =====================
import * as THREE from 'three';

export const CS = 16, CH = 72, SEA = 22;
// 블록: [이름, 위, 옆, 아래 (아틀라스 칸), 투명, 단단함, 빛]
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANK: 8, GLASS: 9, BRICK: 10, COBBLE: 11, SNOW: 12, LAMP: 13, CACTUS: 14, WOOL_R: 15, WOOL_B: 16, WOOL_Y: 17, ORE: 18, BEDROCK: 19, PINE: 20,
};
export const INFO = [
  null,
  { n: '잔디', t: [0, 1, 2] }, { n: '흙', t: [2, 2, 2] }, { n: '돌', t: [3, 3, 3] }, { n: '모래', t: [4, 4, 4] },
  { n: '물', t: [5, 5, 5], liquid: true, see: true }, { n: '나무', t: [7, 6, 7] }, { n: '나뭇잎', t: [8, 8, 8], see: true, leaf: true },
  { n: '판자', t: [9, 9, 9] }, { n: '유리', t: [10, 10, 10], see: true, glass: true }, { n: '벽돌', t: [11, 11, 11] }, { n: '조약돌', t: [12, 12, 12] },
  { n: '눈', t: [13, 14, 2] }, { n: '등불', t: [15, 15, 15], light: true }, { n: '선인장', t: [17, 16, 17] },
  { n: '빨간 양털', t: [18, 18, 18] }, { n: '파란 양털', t: [19, 19, 19] }, { n: '노란 양털', t: [20, 20, 20] }, { n: '광석', t: [21, 21, 21] }, { n: '기반암', t: [22, 22, 22] }, { n: '전나무 잎', t: [23, 23, 23], see: true, leaf: true },
];
export const HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANK, B.LOG, B.BRICK, B.GLASS, B.LAMP, B.SAND, B.LEAVES, B.SNOW, B.WOOL_R, B.WOOL_B, B.WOOL_Y, B.WATER];

// ---------- 텍스처 아틀라스 (16px 칸, 8칸 × 3줄) ----------
const AT = 8, AR = 3, TS = 16;
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
function noiseFill(g, ox, oy, base, vary, seed = 1) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const k = (r() - 0.5) * vary; const c = base.map((v) => Math.max(0, Math.min(255, Math.round(v + k)))); px(g, ox + x, oy + y, `rgb(${c})`); }
}
export function makeAtlas() {
  const c = document.createElement('canvas'); c.width = AT * TS; c.height = AR * TS; const g = c.getContext('2d');
  const T = (i, fn) => { const ox = (i % AT) * TS, oy = Math.floor(i / AT) * TS; fn(ox, oy); };
  T(0, (x, y) => noiseFill(g, x, y, [96, 168, 62], 34, 3)); // 잔디 위
  T(1, (x, y) => { noiseFill(g, x, y, [134, 96, 62], 30, 5); for (let i = 0; i < TS; i++) { const h = 3 + ((i * 7) % 3); for (let k = 0; k < h; k++) px(g, x + i, y + k, `rgb(${90 + (i * 13) % 30},${160 + (k * 9) % 20},60)`); } });
  T(2, (x, y) => noiseFill(g, x, y, [134, 96, 62], 30, 7)); // 흙
  T(3, (x, y) => { noiseFill(g, x, y, [128, 128, 132], 30, 9); });
  T(4, (x, y) => noiseFill(g, x, y, [222, 206, 150], 22, 11));
  T(5, (x, y) => noiseFill(g, x, y, [52, 110, 210], 20, 13));
  T(6, (x, y) => { noiseFill(g, x, y, [110, 82, 52], 18, 15); for (let i = 0; i < TS; i += 4) for (let k = 0; k < TS; k++) px(g, x + i, y + k, 'rgb(86,62,38)'); }); // 나무 옆
  T(7, (x, y) => { noiseFill(g, x, y, [168, 132, 84], 14, 17); g.strokeStyle = 'rgb(130,98,60)'; g.beginPath(); g.arc(x + 8, y + 8, 3, 0, 7); g.arc(x + 8, y + 8, 6, 0, 7); g.stroke(); });
  T(8, (x, y) => { g.clearRect(x, y, TS, TS); let s = 21; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let yy = 0; yy < TS; yy++) for (let xx = 0; xx < TS; xx++) if (r() < 0.82) px(g, x + xx, y + yy, `rgb(${50 + r() * 40},${120 + r() * 50},${40 + r() * 30})`); });
  T(9, (x, y) => { noiseFill(g, x, y, [184, 146, 92], 14, 23); g.fillStyle = 'rgb(140,104,62)'; for (let k = 3; k < TS; k += 4) g.fillRect(x, y + k, TS, 1); g.fillRect(x + 7, y, 1, 4); g.fillRect(x + 3, y + 4, 1, 4); g.fillRect(x + 11, y + 8, 1, 4); });
  T(10, (x, y) => { g.clearRect(x, y, TS, TS); g.fillStyle = 'rgba(200,235,255,.25)'; g.fillRect(x, y, TS, TS); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x, y, TS, 1); g.fillRect(x, y + 15, TS, 1); g.fillRect(x, y, 1, TS); g.fillRect(x + 15, y, 1, TS); g.fillRect(x + 3, y + 3, 1, 3); g.fillRect(x + 4, y + 2, 2, 1); });
  T(11, (x, y) => { noiseFill(g, x, y, [168, 74, 58], 22, 27); g.fillStyle = 'rgb(200,190,180)'; for (let k = 3; k < TS; k += 4) g.fillRect(x, y + k, TS, 1); for (let row = 0; row < 4; row++) for (let k = (row % 2) * 4; k < TS; k += 8) g.fillRect(x + k, y + row * 4, 1, 3); });
  T(12, (x, y) => { noiseFill(g, x, y, [120, 120, 122], 40, 29); g.fillStyle = 'rgba(60,60,64,.8)'; for (let i = 0; i < 6; i++) g.fillRect(x + (i * 5) % 14, y + (i * 7) % 14, 3, 1); });
  T(13, (x, y) => noiseFill(g, x, y, [240, 246, 250], 10, 31));
  T(14, (x, y) => { noiseFill(g, x, y, [134, 96, 62], 30, 33); g.fillStyle = 'rgb(242,246,250)'; g.fillRect(x, y, TS, 4); });
  T(15, (x, y) => { noiseFill(g, x, y, [255, 214, 120], 40, 35); g.fillStyle = 'rgb(255,250,220)'; g.fillRect(x + 4, y + 4, 8, 8); });
  T(16, (x, y) => { noiseFill(g, x, y, [74, 150, 64], 20, 37); g.fillStyle = 'rgb(40,90,36)'; for (let k = 2; k < TS; k += 5) g.fillRect(x + k, y, 1, TS); });
  T(17, (x, y) => { noiseFill(g, x, y, [90, 166, 80], 16, 39); });
  T(18, (x, y) => noiseFill(g, x, y, [210, 50, 50], 20, 41));
  T(19, (x, y) => noiseFill(g, x, y, [50, 90, 210], 20, 43));
  T(20, (x, y) => noiseFill(g, x, y, [240, 200, 40], 20, 45));
  T(21, (x, y) => { noiseFill(g, x, y, [128, 128, 132], 30, 47); g.fillStyle = 'rgb(40,40,44)'; for (let i = 0; i < 5; i++) g.fillRect(x + 2 + (i * 5) % 12, y + 2 + (i * 3) % 12, 2, 2); g.fillStyle = 'rgb(90,220,230)'; g.fillRect(x + 10, y + 4, 2, 2); });
  T(22, (x, y) => noiseFill(g, x, y, [60, 60, 64], 50, 49));
  T(23, (x, y) => { g.clearRect(x, y, TS, TS); let s = 51; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let yy = 0; yy < TS; yy++) for (let xx = 0; xx < TS; xx++) if (r() < 0.85) px(g, x + xx, y + yy, `rgb(${30 + r() * 30},${80 + r() * 40},${50 + r() * 30})`); });
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  t.userData = { canvas: c };
  return t;
}
export function tileIcon(atlas, id) {
  const i = INFO[id].t[1], c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(atlas.userData.canvas, (i % AT) * TS, Math.floor(i / AT) * TS, TS, TS, 0, 0, 32, 32); return c.toDataURL();
}

// ---------- 잡음 ----------
function hash(x, z, s) { let h = (x * 374761393 + z * 668265263 + s * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z, s) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, z, s, o = 4) { let a = 0, f = 1, w = 0.5, t = 0; for (let i = 0; i < o; i++) { a += vnoise(x * f, z * f, s + i * 17) * w; t += w; f *= 2; w *= 0.5; } return a / t; }
function hash3(x, y, z, s) { return hash(x * 31 + y * 7919, z * 17 + y * 131, s); }
function vnoise3(x, y, z, s) { const yi = Math.floor(y), yf = y - yi; const a = vnoise(x + yi * 13.1, z, s), b = vnoise(x + (yi + 1) * 13.1, z, s); return a + (b - a) * yf * yf * (3 - 2 * yf); }

export class World {
  constructor(seed, edits) {
    this.seed = seed; this.chunks = new Map(); this.edits = edits || {}; // "x,y,z" → id
  }
  key(cx, cz) { return cx + ',' + cz; }
  heightAt(x, z) {
    const s = this.seed;
    const cont = fbm(x / 220, z / 220, s, 3);
    const hills = fbm(x / 60, z / 60, s + 5, 4);
    const mount = Math.max(0, fbm(x / 120, z / 120, s + 9, 4) - 0.55) * 2.2;
    return Math.floor(SEA - 6 + cont * 18 + hills * 12 + mount * 34);
  }
  biome(x, z) { const t = fbm(x / 300, z / 300, this.seed + 99, 2); return t < 0.38 ? 'snow' : t > 0.62 ? 'desert' : 'plains'; }
  gen(cx, cz) {
    const d = new Uint8Array(CS * CS * CH), s = this.seed;
    const I = (x, y, z) => (y * CS + z) * CS + x;
    const hs = [];
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = cx * CS + x, wz = cz * CS + z;
      const h = Math.min(CH - 8, Math.max(3, this.heightAt(wx, wz)));
      const bio = this.biome(wx, wz);
      hs.push([x, z, h, bio]);
      for (let y = 0; y < CH; y++) {
        let b = B.AIR;
        if (y === 0) b = B.BEDROCK;
        else if (y < h - 3) b = hash3(wx, y, wz, s + 7) < 0.012 && y < 30 ? B.ORE : B.STONE;
        else if (y < h) b = bio === 'desert' ? B.SAND : B.DIRT;
        else if (y === h) b = h <= SEA + 1 ? B.SAND : bio === 'desert' ? B.SAND : bio === 'snow' || h > SEA + 30 ? B.SNOW : B.GRASS;
        else if (y <= SEA) b = B.WATER;
        // 동굴
        if (b !== B.AIR && b !== B.WATER && b !== B.BEDROCK && y > 3 && y < h - 2) { const c = vnoise3(wx / 14, y / 9, wz / 14, s + 33); if (c > 0.72) b = B.AIR; }
        d[I(x, y, z)] = b;
      }
    }
    // 나무 · 선인장
    for (const [x, z, h, bio] of hs) {
      const wx = cx * CS + x, wz = cz * CS + z;
      if (h <= SEA + 1 || x < 2 || z < 2 || x > CS - 3 || z > CS - 3) continue;
      const r = hash(wx, wz, s + 55);
      if (bio === 'desert') { if (r < 0.004) for (let k = 1; k <= 3; k++) d[I(x, h + k, z)] = B.CACTUS; continue; }
      if (r < (bio === 'snow' ? 0.012 : 0.02) && d[I(x, h, z)] !== B.SAND) {
        const th = 4 + Math.floor(hash(wx, wz, s + 56) * 3), leaf = bio === 'snow' ? B.PINE : B.LEAVES;
        for (let k = 1; k <= th; k++) d[I(x, h + k, z)] = B.LOG;
        for (let ly = th - 2; ly <= th + 1; ly++) {
          const rr = bio === 'snow' ? Math.max(0, 2 - Math.floor((ly - th + 2) / 1.5)) : ly > th ? 1 : 2;
          for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) { if (Math.abs(dx) === rr && Math.abs(dz) === rr && rr > 1) continue; const yy = h + ly; if (yy < CH && d[I(x + dx, yy, z + dz)] === B.AIR) d[I(x + dx, yy, z + dz)] = leaf; }
        }
        if (bio === 'snow') d[I(x, h + th + 2, z)] = leaf;
      }
    }
    // 저장된 수정 적용
    const pre = cx + ',' + cz + ':';
    const C = { cx, cz, d, mesh: null, dirty: true };
    if (this.byChunk && this.byChunk[pre]) for (const [x, y, z, id] of this.byChunk[pre]) d[I(x, y, z)] = id;
    return C;
  }
  indexEdits() { this.byChunk = {}; for (const k in this.edits) { const [x, y, z] = k.split(',').map(Number); const cx = Math.floor(x / CS), cz = Math.floor(z / CS), pre = cx + ',' + cz + ':'; (this.byChunk[pre] = this.byChunk[pre] || []).push([x - cx * CS, y, z - cz * CS, this.edits[k]]); } }
  chunk(cx, cz, make = true) { const k = this.key(cx, cz); let c = this.chunks.get(k); if (!c && make) { c = this.gen(cx, cz); this.chunks.set(k, c); } return c; }
  get(x, y, z) {
    if (y < 0) return B.BEDROCK; if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS), c = this.chunk(cx, cz, false);
    if (!c) return B.AIR;
    return c.d[(y * CS + (z - cz * CS)) * CS + (x - cx * CS)];
  }
  set(x, y, z, id) {
    if (y < 1 || y >= CH) return false;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS), c = this.chunk(cx, cz);
    const lx = x - cx * CS, lz = z - cz * CS;
    c.d[(y * CS + lz) * CS + lx] = id; c.dirty = true;
    this.edits[x + ',' + y + ',' + z] = id;
    if (!this.byChunk) this.byChunk = {};
    const pre = cx + ',' + cz + ':'; (this.byChunk[pre] = this.byChunk[pre] || []).push([lx, y, lz, id]);
    // 이웃 청크도 다시 그리기
    if (lx === 0) { const n = this.chunk(cx - 1, cz, false); if (n) n.dirty = true; } if (lx === CS - 1) { const n = this.chunk(cx + 1, cz, false); if (n) n.dirty = true; }
    if (lz === 0) { const n = this.chunk(cx, cz - 1, false); if (n) n.dirty = true; } if (lz === CS - 1) { const n = this.chunk(cx, cz + 1, false); if (n) n.dirty = true; }
    return true;
  }
  // ---------- 메시 (보이는 면만, 모서리 그늘) ----------
  mesh(C) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const wpos = [], wnor = [], wuv = [], wcol = [], widx = [];
    const ox = C.cx * CS, oz = C.cz * CS;
    const g = (x, y, z) => this.get(ox + x, y, oz + z);
    const opaque = (id) => id !== B.AIR && !INFO[id].see;
    const FACES = [
      { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: 0, sh: 1.0 },
      { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: 2, sh: 0.55 },
      { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: 1, sh: 0.8 },
      { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: 1, sh: 0.8 },
      { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: 1, sh: 0.9 },
      { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: 1, sh: 0.7 },
    ];
    const us = 1 / AT, vs = 1 / AR;
    for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = C.d[(y * CS + z) * CS + x]; if (!id) continue;
      const inf = INFO[id], water = inf.liquid;
      for (const F of FACES) {
        const n = g(x + F.d[0], y + F.d[1], z + F.d[2]);
        if (water) { if (n === B.WATER || (opaque(n) && F.d[1] !== 1)) continue; if (F.d[1] !== 1 && n !== B.AIR && n !== B.GLASS) continue; }
        else if (opaque(n) || (n === id && (inf.glass))) continue;
        else if (inf.leaf && n === id && F.d[1] === 0 && (x + y + z) % 2) continue;
        const P = water ? wpos : pos, N = water ? wnor : nor, U = water ? wuv : uv, Co = water ? wcol : col, Ix = water ? widx : idx;
        const base = P.length / 3, ti = inf.t[F.t], tu = (ti % AT) * us, tv = 1 - (Math.floor(ti / AT) + 1) * vs;
        const lamp = inf.light ? 1.25 : 1;
        const ao = [];
        for (const c of F.c) {
          let yy = y + c[1]; if (water && F.d[1] === 1) yy -= 0.12;
          P.push(x + c[0], yy, z + c[2]); N.push(...F.d);
          // 모서리 그늘: 면 바깥쪽 이웃 3칸
          let a = 1;
          if (!water && !inf.light) {
            const sx = c[0] ? 1 : -1, sy = c[1] ? 1 : -1, sz = c[2] ? 1 : -1;
            const fx = x + F.d[0], fy = y + F.d[1], fz = z + F.d[2];
            let s1, s2, s3;
            if (F.d[1]) { s1 = opaque(g(fx + sx, fy, fz)); s2 = opaque(g(fx, fy, fz + sz)); s3 = opaque(g(fx + sx, fy, fz + sz)); }
            else if (F.d[0]) { s1 = opaque(g(fx, fy + sy, fz)); s2 = opaque(g(fx, fy, fz + sz)); s3 = opaque(g(fx, fy + sy, fz + sz)); }
            else { s1 = opaque(g(fx + sx, fy, fz)); s2 = opaque(g(fx, fy + sy, fz)); s3 = opaque(g(fx + sx, fy + sy, fz)); }
            a = s1 && s2 ? 0.45 : 1 - (s1 + s2 + s3) * 0.16;
          }
          ao.push(a);
          const v = F.sh * a * lamp; Co.push(v, v, v);
        }
        U.push(tu, tv, tu + us, tv, tu + us, tv + vs, tu, tv + vs);
        if (ao[0] + ao[2] > ao[1] + ao[3]) Ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else Ix.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }
    const geo = (P, N, U, Co, Ix) => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g2.setAttribute('color', new THREE.Float32BufferAttribute(Co, 3)); g2.setIndex(Ix); g2.computeBoundingSphere(); return g2; };
    return { solid: pos.length ? geo(pos, nor, uv, col, idx) : null, water: wpos.length ? geo(wpos, wnor, wuv, wcol, widx) : null };
  }
  // 광선: 처음 닿는 블록과 그 앞 칸
  raycast(o, d, max = 6) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
    let px = x, py = y, pz = z, t = 0;
    while (t <= max) {
      const id = this.get(x, y, z);
      if (id && id !== B.WATER) return { x, y, z, id, px, py, pz };
      px = x; py = y; pz = z;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
    }
    return null;
  }
}
