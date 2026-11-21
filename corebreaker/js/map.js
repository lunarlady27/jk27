// ===================== 맵: "항만 기지" (오리지널) =====================
// 2m 칸으로 된 격자 맵. 칸마다 높이(0 바닥, 1.2 낮은 상자, 2.4 높은 상자, 6 벽).
// 충돌 · 총알 · 시야 · 봇 길찾기 모두 이 격자로 계산.
import * as THREE from 'three';

export const CELL = 2;
export const GW = 60, GH = 44;
export const WALL_H = 6;
const H = new Float32Array(GW * GH).fill(WALL_H);
const ZONE = new Uint8Array(GW * GH); // 0 없음, 1 A 설치 구역, 2 B 설치 구역, 3 공격 시작, 4 수비 시작
export const MAP = { H, ZONE, name: '항만 기지', dyn: [] };

const idx = (cx, cz) => cz * GW + cx;
const carve = (x0, z0, x1, z1, h = 0) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) H[idx(x, z)] = h; };
const zone = (x0, z0, x1, z1, v) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) ZONE[idx(x, z)] = v; };

// ---- 공간 파내기 (북쪽 = 수비, 남쪽 = 공격) ----
carve(22, 2, 37, 6);      // 수비 시작 지점
carve(3, 6, 18, 17);      // A 사이트
carve(41, 6, 56, 17);     // B 사이트
carve(18, 3, 22, 6);      // 수비 → A
carve(37, 3, 41, 6);      // 수비 → B
carve(27, 6, 32, 11);     // 미드 위
carve(26, 11, 33, 30);    // 미드
carve(18, 12, 26, 15);    // 미드 → A (A 숏)
carve(33, 12, 41, 15);    // 미드 → B (B 숏)
carve(3, 17, 8, 34);      // A 롱
carve(3, 30, 22, 35);     // A 로비
carve(22, 34, 37, 41);    // 공격 시작 지점
carve(27, 30, 32, 34);    // 미드 아래
carve(37, 30, 56, 35);    // B 로비
carve(50, 17, 56, 34);    // B 메인
carve(44, 17, 49, 20);    // B 창고
carve(19, 20, 25, 25);    // 정원 (A 쪽 옆방)
carve(8, 22, 19, 24);     // 정원 ↔ A 롱
carve(25, 21, 26, 23);    // 정원 ↔ 미드
carve(34, 20, 40, 25);    // 시장 (B 쪽 옆방)
carve(33, 21, 34, 23);    // 시장 ↔ 미드
carve(40, 22, 50, 24);    // 시장 ↔ B 메인
// 기둥 · 벽 조각 (엄폐)
carve(10, 10, 11, 11, WALL_H); carve(48, 10, 49, 11, WALL_H);
carve(29, 18, 30, 19, WALL_H);
carve(5, 26, 6, 27, WALL_H); carve(53, 26, 54, 27, WALL_H);
zone(6, 8, 15, 14, 1);
zone(44, 8, 53, 14, 2);
zone(23, 36, 36, 40, 3);
zone(23, 2, 36, 5, 4);

// ---- 상자 (낮은 1.2m: 올라설 수 있음 · 높은 2.4m) ----
const LOW = 1.2, TALL = 2.4;
const crates = [
  // A 사이트
  [8, 9, TALL], [9, 9, LOW], [13, 12, LOW], [13, 13, TALL], [6, 15, LOW], [16, 8, TALL], [16, 9, LOW], [11, 14, LOW],
  // B 사이트
  [46, 9, TALL], [47, 9, LOW], [51, 12, LOW], [51, 13, TALL], [44, 15, LOW], [53, 8, LOW], [54, 8, TALL], [48, 14, LOW],
  // 미드
  [28, 14, LOW], [31, 24, TALL], [27, 27, LOW], [32, 12, LOW],
  // A 롱 · B 메인
  [7, 20, LOW], [4, 31, TALL], [51, 20, LOW], [55, 31, TALL],
  // 로비 · 옆방
  [15, 32, LOW], [16, 32, TALL], [42, 33, LOW], [43, 33, TALL], [21, 22, LOW], [38, 23, LOW], [36, 21, TALL],
  // 시작 지점
  [24, 38, LOW], [35, 38, LOW], [24, 4, LOW], [35, 4, LOW],
];
for (const [x, z, h] of crates) H[idx(x, z)] = h;

// ---- 격자 도우미 ----
export const cellOf = (v) => Math.floor(v / CELL);
export function hAt(cx, cz) { if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return WALL_H; return H[idx(cx, cz)]; }
export function zoneAt(x, z) { const cx = cellOf(x), cz = cellOf(z); if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return 0; return ZONE[idx(cx, cz)]; }
export const cellCenter = (cx, cz) => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });
// 설치 구역 중심
export const SITES = {
  A: { name: 'A', x: 11 * CELL, z: 11.5 * CELL, zone: 1 },
  B: { name: 'B', x: 49 * CELL, z: 11.5 * CELL, zone: 2 },
};
export const SPAWNS = {
  atk: [[24, 37], [27, 39], [30, 37], [33, 39], [35, 36]].map(([x, z]) => cellCenter(x, z)),
  def: [[24, 3], [27, 5], [30, 3], [33, 5], [35, 3]].map(([x, z]) => cellCenter(x, z)),
};
// 봇이 지킬 자리 (수비) · 들어갈 길목 (공격)
export const HOLDS = {
  A: [cellCenter(9, 7), cellCenter(15, 15), cellCenter(5, 12), cellCenter(17, 11)],
  B: [cellCenter(50, 7), cellCenter(45, 16), cellCenter(55, 12), cellCenter(42, 11)],
  mid: [cellCenter(29, 8), cellCenter(30, 13)],
};
export const ENTRIES = {
  A: [[cellCenter(5, 28), cellCenter(5, 18)], [cellCenter(29, 26), cellCenter(22, 13)], [cellCenter(22, 22), cellCenter(10, 23), cellCenter(5, 18)]],
  B: [[cellCenter(53, 28), cellCenter(53, 18)], [cellCenter(30, 26), cellCenter(37, 13)], [cellCenter(37, 22), cellCenter(45, 23), cellCenter(53, 18)]],
};

// ---- 움직이는 장애물 (장벽 스킬 등): 축 정렬 상자 ----
export function addDyn(b) { MAP.dyn.push(b); return b; }
export function removeDyn(b) { const i = MAP.dyn.indexOf(b); if (i >= 0) MAP.dyn.splice(i, 1); }

// 발 높이 feet 인 반지름 r 원이 (x,z)에 설 수 있는지 → 바닥 높이 (못 서면 null)
export function groundAt(x, z, r, feet, step = 0.5) {
  let g = 0;
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const h = hAt(cx, cz);
    if (h <= 0) continue;
    // 원과 칸이 실제로 겹치는지
    const nx = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL)), nz = Math.max(cz * CELL, Math.min(z, (cz + 1) * CELL));
    if ((nx - x) ** 2 + (nz - z) ** 2 >= r * r) continue;
    if (h > feet + step) return null;
    if (h > g) g = h;
  }
  for (const b of MAP.dyn) {
    if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
    if (b.y1 > feet + step) return null;
    if (b.y1 > g) g = b.y1;
  }
  return g;
}

// 3D 광선 (총알 · 시야): 격자 벽/상자 + 움직이는 장애물. 맞으면 거리, 아니면 maxD
export function rayWorld(ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  // 격자 DDA (xz)
  let cx = cellOf(ox), cz = cellOf(oz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
  let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
  let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
  let t0 = 0;
  for (let k = 0; k < 200 && t0 < best; k++) {
    const t1 = Math.min(tmx, tmz, best);
    const h = hAt(cx, cz);
    if (h > 0) {
      // 이 칸 안에서 광선 높이가 h 보다 낮은 구간이 있으면 맞음
      const y0 = oy + dy * t0, y1 = oy + dy * t1;
      if (y0 <= h) { best = Math.min(best, t0); break; }
      if (y1 <= h) { const th = dy !== 0 ? (h - oy) / dy : t0; best = Math.min(best, Math.max(t0, th)); break; }
    }
    if (tmx < tmz) { cx += stepX; t0 = tmx; tmx += tdx; } else { cz += stepZ; t0 = tmz; tmz += tdz; }
    if (cx < -1 || cz < -1 || cx > GW || cz > GH) break;
  }
  for (const b of MAP.dyn) { const t = rayBox(ox, oy, oz, dx, dy, dz, b); if (t !== null && t < best) best = t; }
  // 바닥
  if (dy < 0) { const tf = -oy / dy; if (tf < best) best = tf; }
  return best;
}
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) return null;
  }
  return tmin;
}

// ---- 봇 길찾기 (A*, 바닥 칸만) ----
const walk = (cx, cz) => hAt(cx, cz) <= 0;
export function findPath(x0, z0, x1, z1) {
  const s = [cellOf(x0), cellOf(z0)], g = [cellOf(x1), cellOf(z1)];
  const near = (c) => { if (walk(c[0], c[1])) return c; for (let r = 1; r < 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (walk(c[0] + dx, c[1] + dz)) return [c[0] + dx, c[1] + dz]; return c; };
  const S = near(s), G = near(g);
  const N = GW * GH, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [idx(S[0], S[1])]; gs[open[0]] = 0;
  const hh = (i) => Math.hypot((i % GW) - G[0], Math.floor(i / GW) - G[1]);
  const goal = idx(G[0], G[1]);
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let k = 0; k < open.length; k++) { const f = gs[open[k]] + hh(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % GW, cz = Math.floor(cur / GW);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!walk(nx, nz)) continue;
      if (dx && dz && (!walk(cx + dx, cz) || !walk(cx, cz + dz))) continue; // 모서리 끼임 방지
      const ni = idx(nx, nz), ng = gs[cur] + (dx && dz ? 1.414 : 1);
      if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; open.push(ni); }
    }
  }
  if (from[goal] < 0 && goal !== idx(S[0], S[1])) return null;
  const path = [];
  for (let c = goal; c >= 0 && c !== idx(S[0], S[1]); c = from[c]) path.push(cellCenter(c % GW, Math.floor(c / GW)));
  path.reverse();
  // 직선으로 보이는 점은 건너뛰기 (자연스러운 움직임)
  const out = [];
  let a = { x: x0, z: z0 };
  for (let i = 0; i < path.length; i++) {
    const nx = path[i + 1];
    if (nx && clearLine(a.x, a.z, nx.x, nx.z)) continue;
    out.push(path[i]); a = path[i];
  }
  out.push({ x: x1, z: z1 });
  return out;
}
// 땅 위 두 점 사이가 막힘 없이 걸어갈 수 있는지 (몸 폭 고려)
export function clearLine(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.6);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    for (const [ox, oz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) if (!walk(cellOf(x + ox), cellOf(z + oz))) return false;
  }
  return true;
}

// ===================== 맵 그리기 =====================
function tex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const noise = (g, w, h, a) => { const im = g.getImageData(0, 0, w, h); for (let i = 0; i < im.data.length; i += 4) { const n = (Math.random() - 0.5) * a; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0); };
export function buildMap(scene) {
  const T = {
    floor: tex(256, 256, (g, w, h) => { g.fillStyle = '#8d8a84'; g.fillRect(0, 0, w, h); noise(g, w, h, 18); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); } }),
    site: tex(256, 256, (g, w, h) => { g.fillStyle = '#6f7c88'; g.fillRect(0, 0, w, h); noise(g, w, h, 14); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } }),
    wall: tex(256, 512, (g, w, h) => {
      g.fillStyle = '#c9c1b2'; g.fillRect(0, 0, w, h); noise(g, w, h, 22);
      g.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 3);
      g.fillStyle = '#3c4a5c'; g.fillRect(0, h - 70, w, 70); noise(g, w, h, 6);
      g.fillStyle = '#ffb21a'; g.fillRect(0, h - 74, w, 6);
    }),
    crate: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#7a5a36'; g.fillRect(0, 0, w, h); noise(g, w, h, 26);
      g.strokeStyle = '#4a3420'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
      g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.15)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    }),
    metal: tex(256, 256, (g, w, h) => { g.fillStyle = '#4b6a7d'; g.fillRect(0, 0, w, h); noise(g, w, h, 16); g.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); g.fillStyle = '#e8eef2'; g.font = '900 40px sans-serif'; g.fillText('RZ-07', 20, 60); }),
  };
  const group = new THREE.Group(); scene.add(group);
  // 바닥
  const fm = new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.92 });
  T.floor.repeat.set(GW * CELL / 6, GH * CELL / 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * CELL, GH * CELL), fm);
  floor.rotation.x = -Math.PI / 2; floor.position.set(GW * CELL / 2, 0, GH * CELL / 2); floor.receiveShadow = true; group.add(floor);
  // 사이트 바닥 + 큰 글자
  for (const s of Object.values(SITES)) {
    const zc = Object.entries(SITES).find(([, v]) => v === s)[1].zone;
    let x0 = 99, x1 = 0, z0 = 99, z1 = 0;
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) if (ZONE[idx(x, z)] === zc) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const sm = new THREE.MeshStandardMaterial({ map: T.site.clone(), roughness: 0.85 });
    sm.map.needsUpdate = true; sm.map.repeat.set((x1 - x0 + 1) * CELL / 4, (z1 - z0 + 1) * CELL / 4);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0 + 1) * CELL, (z1 - z0 + 1) * CELL), sm);
    pl.rotation.x = -Math.PI / 2; pl.position.set((x0 + x1 + 1) / 2 * CELL, 0.01, (z0 + z1 + 1) / 2 * CELL); pl.receiveShadow = true; group.add(pl);
    // 테두리 (노란 선)
    const lt = tex(512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#ffd23a'; g.lineWidth = 10; g.setLineDash([40, 20]); g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = 'rgba(255,210,58,.85)'; g.font = '900 300px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.name, w / 2, h / 2 + 10); }, false);
    const lm = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0 + 1) * CELL, (z1 - z0 + 1) * CELL), new THREE.MeshBasicMaterial({ map: lt, transparent: true, opacity: 0.55, depthWrite: false }));
    lm.rotation.x = -Math.PI / 2; lm.position.set(pl.position.x, 0.02, pl.position.z); group.add(lm);
  }
  // 벽: 바닥과 맞닿은 벽 칸만 (속은 비워 둠) → 가로로 이어진 칸을 한 상자로 합침
  const wm = new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.9 });
  const cm = new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.85 });
  const mm = new THREE.MeshStandardMaterial({ map: T.metal, roughness: 0.6, metalness: 0.3 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const boxes = [];
  const border = (x, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (hAt(x + dx, z + dz) < WALL_H && x + dx >= 0 && z + dz >= 0 && x + dx < GW && z + dz < GH) return true; return false; };
  for (let z = 0; z < GH; z++) {
    let run = null;
    for (let x = 0; x <= GW; x++) {
      const isW = x < GW && hAt(x, z) >= WALL_H && border(x, z);
      if (isW && !run) run = x;
      if ((!isW || x === GW) && run !== null) { boxes.push({ x0: run, x1: x - 1, z, h: WALL_H, m: wm }); run = null; }
    }
  }
  for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { const h = hAt(x, z); if (h > 0 && h < WALL_H) boxes.push({ x0: x, x1: x, z, h, m: (x * 7 + z) % 5 === 0 ? mm : cm }); }
  for (const b of boxes) {
    const w = (b.x1 - b.x0 + 1) * CELL;
    const geo = box.clone();
    // 벽 무늬가 늘어나지 않게 UV 맞춤
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const nx = geo.attributes.normal.getX(i), nz = geo.attributes.normal.getZ(i); if (Math.abs(nz) > 0.5) uv.setX(i, uv.getX(i) * w / 4); else if (Math.abs(nx) < 0.5) uv.setX(i, uv.getX(i) * w / 4); }
    const m = new THREE.Mesh(geo, b.m);
    const inset = b.h < WALL_H ? 0.12 : 0;
    m.scale.set(w - inset * 2, b.h, CELL - inset * 2);
    m.position.set((b.x0 * CELL + w / 2), b.h / 2, (b.z + 0.5) * CELL);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  // 네온 띠 · 조명 장식 (사이트 방향 표지)
  const neon = (x, z, ry, color, text) => {
    const t = tex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = color; g.font = '900 86px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 24; g.fillText(text, w / 2, h / 2); }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.position.set(x, 3.6, z); m.rotation.y = ry; group.add(m);
  };
  neon(5 * CELL + 1, 34.9 * CELL, Math.PI, '#ffd23a', 'A 롱 ↑');
  neon(53 * CELL + 1, 34.9 * CELL, Math.PI, '#ffd23a', 'B 메인 ↑');
  neon(29.5 * CELL + 1, 29.9 * CELL, Math.PI, '#36d1c4', '미드 ↑');
  neon(18.1 * CELL, 13.5 * CELL, Math.PI / 2, '#ffd23a', '◀ A');
  neon(40.9 * CELL, 13.5 * CELL, -Math.PI / 2, '#ffd23a', 'B ▶');
  // 하늘 (그라데이션 구) + 먼 산 실루엣
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, map: tex(16, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b4f8a'); gr.addColorStop(0.45, '#8ab6e0'); gr.addColorStop(0.52, '#f2d6b0'); gr.addColorStop(1, '#6d6a66'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false) }));
  sky.position.set(GW, 0, GH); group.add(sky);
  // 바깥 바다 (맵 둘레)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x2a5f7a, roughness: 0.3, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(GW, -0.5, GH); group.add(sea);
  // 크레인 (분위기)
  for (const [x, z] of [[-14, 30], [140, 20], [60, -16]]) {
    const cr = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8572a, roughness: 0.6 });
    for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const leg = new THREE.Mesh(box, mat); leg.scale.set(0.6, 28, 0.6); leg.position.set(a, 14, b); cr.add(leg); }
    const arm = new THREE.Mesh(box, mat); arm.scale.set(36, 1.2, 1.2); arm.position.set(8, 27, 0); cr.add(arm);
    cr.position.set(x, 0, z); cr.rotation.y = Math.random() * 3; group.add(cr);
  }
  return group;
}
