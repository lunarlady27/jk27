// ===================== 다른 도시 실제 지도 (서울 · 대전 …) =====================
// 지역 자료는 가까이 갈 때 불러옴(world.ensureRegion). 도로망은 그때 붙이고, 눈에 보이는 것(땅 · 건물 · 도로 · 차선 · 신호등)은
// 400m 칸 단위로 플레이어 근처만 만들고 멀면 지움. 칸마다 원점을 따로 둬서 광주에서 수백 km 떨어져도 화면이 떨리지 않음.
import * as THREE from 'three';
import { W, addOBox, edgesNear, signalState } from './roadnet.js';
import { canvasTex } from './util.js';

const CELL = 400, NEAR = 1500, FAR = 2300;
export const REGS = [];
export const REG = { get on() { return REGS.length > 0; } };
let scene = null, M = null;

const ck = (i, j) => i * 100003 + j;
const cellOf = (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)];
const hrand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const toXZ = (lat, lon) => ({ x: -(lon - 126.885) * 91060, z: (lat - 35.155) * 110950 });

// ---------- 준비 ----------
export function initRegion(id, map, sceneRef, mats, opts = {}) {
  scene = sceneRef; M = mats;
  const b = map.bounds;
  const R = { id, name: opts.name || id, D: map, B: { x0: b[0], x1: b[1], z0: b[2], z1: b[3] }, cells: new Map(), water: null, tower: null, towerAt: null, built: 0 };
  const B = R.B;
  const get = (i, j) => { const k = ck(i, j); let c = R.cells.get(k); if (!c) R.cells.set(k, c = { i, j, blds: [], edges: [], nodes: [], links: [], built: null }); return c; };
  const edges = W.edges.filter((e) => e.reg === id);
  // 도로 · 교차로 · 차선을 칸에 나눠 담음 (칸이 가까워지면 광주와 같은 방식으로 그림)
  const nset = new Set();
  for (const e of edges) {
    const [i, j] = cellOf((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2), c = get(i, j);
    c.edges.push(e); for (const L of [e.fwd, e.bwd]) if (L) c.links.push(L);
    nset.add(e.a); nset.add(e.b);
    W.mini.roads.push({ ax: e.a.x, az: e.a.z, bx: e.b.x, bz: e.b.z, w: e.hw * 2, kind: e.kind, up: e.elevated || e.ramp, name: e.name });
  }
  for (const n of nset) { const [i, j] = cellOf(n.x, n.z); get(i, j).nodes.push(n); }
  if (W.computeBigJ) W.computeBigJ([...nset], edges);
  for (let i = Math.floor(B.x0 / CELL); i <= Math.floor(B.x1 / CELL); i++) for (let j = Math.floor(B.z0 / CELL); j <= Math.floor(B.z1 / CELL); j++) get(i, j);
  // 물 (강 · 호수): 물리 판정용 격자 + 화면용 다각형
  const WC = 8, wnx = Math.ceil((B.x1 - B.x0) / WC) + 1, wnz = Math.ceil((B.z1 - B.z0) / WC) + 1;
  const wg = new Uint8Array(wnx * wnz);
  R.water = { WC, wnx, wnz, g: wg };
  R.waterMeshes = [];
  for (const w of map.water) {
    const pts = []; for (let q = 1; q < w.length; q += 2) pts.push([w[q], w[q + 1]]);
    rasterPoly(pts, WC, (x, z) => { const i = Math.floor((x - B.x0) / WC), j = Math.floor((z - B.z0) / WC); if (i >= 0 && j >= 0 && i < wnx && j < wnz) wg[j * wnx + i] = 1; });
    let ox = 0, oz = 0; for (const p of pts) { ox += p[0]; oz += p[1]; } ox /= pts.length; oz /= pts.length;
    const ids = earcut(pts);
    if (!ids.length) continue;
    const pos = new Float32Array(ids.length * 3);
    ids.forEach((idd, q) => { pos[q * 3] = pts[idd][0] - ox; pos[q * 3 + 1] = 0.04; pos[q * 3 + 2] = pts[idd][1] - oz; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.water); m.position.set(ox, 0, oz); m.receiveShadow = true; scene.add(m);
  }
  // 건물: 자리 · 높이 (충돌 상자는 칸을 처음 만들 때)
  const tower = opts.tower ? toXZ(opts.tower.lat, opts.tower.lon) : null;
  R.towerAt = tower; R.towerOpt = opts.tower || null;
  const blds = map.blds;
  for (let k = 0; k < blds.length; k++) {
    const bb = blds[k], n = (bb.length - 1) >> 1; if (n < 3) continue;
    let ar = 0, cx = 0, cz = 0;
    for (let q = 0; q < n; q++) { const q2 = (q + 1) % n; ar += bb[1 + q * 2] * bb[2 + q2 * 2] - bb[1 + q2 * 2] * bb[2 + q * 2]; cx += bb[1 + q * 2]; cz += bb[2 + q * 2]; }
    cx /= n; cz /= n; const area = Math.abs(ar) / 2;
    if (tower && Math.hypot(cx - tower.x, cz - tower.z) < 70 && bb[0] > 200) continue; // 롯데월드타워는 따로 만듦
    if (onRoad(cx, cz, 1)) continue;
    let h = bb[0];
    const r1 = hrand(k, 1), r2 = hrand(k, 2);
    const wet = waterIn(R, cx, cz);
    if (h <= 8 && wet) h = 4 + r1 * 8;
    else if (h <= 8) {
      if (area > 380 && area < 2200) h = 40 + r1 * 50;        // 아파트
      else if (area >= 2200) h = 12 + r1 * 16;
      else h = area > 150 ? 8 + r1 * 14 : 5 + r1 * 6;
    }
    const mi = h > 40 ? (area < 2200 && r2 < 0.65 ? 1 : 2) : area > 2500 ? 0 : r2 < 0.3 ? 2 : 0;
    const [i, j] = cellOf(cx, cz);
    get(i, j).blds.push(k, h, mi);
  }
  if (tower) addOBox(tower.x, tower.z, 34, 34, 0.3, 'bld');
  // 고속도로 끝과 이 지역 고속도로를 잇는 짧은 연결 도로 (도로 그리기 뒤에 생겨서 여기서 그림)
  for (const e of W.edges) if (e.corr && e.cs === -1 && !e.drawn && inBox(B, e.a.x, e.a.z, 800)) { drawConnector(e); e.drawn = true; }
  REGS.push(R);
  R.edges = edges.length; R.blds = blds.length;
  return R;
}
const inBox = (B, x, z, pad = 0) => x > B.x0 - pad && x < B.x1 + pad && z > B.z0 - pad && z < B.z1 + pad;
// 어느 지역 안인지 (pad 만큼 넓혀서)
export const regionAt = (x, z, pad = 0) => { for (const R of REGS) if (inBox(R.B, x, z, pad)) return R; return null; };
export const inB = (x, z, pad = 0) => !!regionAt(x, z, pad);
function waterIn(R, x, z) {
  const w = R.water; if (!w) return false;
  const i = Math.floor((x - R.B.x0) / w.WC), j = Math.floor((z - R.B.z0) / w.WC);
  return i >= 0 && j >= 0 && i < w.wnx && j < w.wnz && w.g[j * w.wnx + i] === 1;
}
export function regionWater(x, z) { const R = regionAt(x, z); return R ? waterIn(R, x, z) : false; }
function onRoad(x, z, pad) {
  for (const e of edgesNear(x, z)) {
    if (e.elevated) continue;
    const s = (x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z;
    if (s < -2 || s > e.len + 2) continue;
    if (Math.abs((x - e.a.x) * -e.dir.z + (z - e.a.z) * e.dir.x) < e.hw + pad + 2.4) return true;
  }
  return false;
}
// 건물 충돌 상자 (가장 긴 변 방향, 도로에 걸치면 줄임)
function bldCollider(bb) {
  const n = (bb.length - 1) >> 1;
  let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += bb[1 + q * 2]; cz += bb[2 + q * 2]; } cx /= n; cz /= n;
  let bl = 0, ang = 0;
  for (let q = 0; q < n; q++) { const q2 = (q + 1) % n, dx = bb[1 + q2 * 2] - bb[1 + q * 2], dz = bb[2 + q2 * 2] - bb[2 + q * 2], l = Math.hypot(dx, dz); if (l > bl) { bl = l; ang = Math.atan2(dx, dz); } }
  const ux = Math.sin(ang), uz = Math.cos(ang);
  let a0 = Infinity, a1 = -Infinity, l0 = Infinity, l1 = -Infinity;
  for (let q = 0; q < n; q++) { const px = bb[1 + q * 2] - cx, pz = bb[2 + q * 2] - cz, al = px * ux + pz * uz, la = px * -uz + pz * ux; a0 = Math.min(a0, al); a1 = Math.max(a1, al); l0 = Math.min(l0, la); l1 = Math.max(l1, la); }
  const ocx = cx + ux * (a0 + a1) / 2 - uz * (l0 + l1) / 2, ocz = cz + uz * (a0 + a1) / 2 + ux * (l0 + l1) / 2;
  let hx = (l1 - l0) / 2, hz = (a1 - a0) / 2, ok = false;
  for (let t = 0; t < 3 && !ok; t++) {
    ok = true;
    for (const [fu, fv] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = ocx - uz * fu * hx * 0.9 + ux * fv * hz * 0.9, z = ocz + ux * fu * hx * 0.9 + uz * fv * hz * 0.9;
      if (onRoad(x, z, 0.3)) { ok = false; break; }
    }
    if (!ok) { hx *= 0.8; hz *= 0.8; }
  }
  if (ok) addOBox(ocx, ocz, hx, hz, ang, 'bld');
}
function rasterPoly(pts, step, fn) {
  let z0 = Infinity, z1 = -Infinity; for (const p of pts) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  for (let z = Math.floor(z0 / step) * step + step / 2; z <= z1; z += step) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= z) !== (b[1] <= z)) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] / step) * step + step / 2; x < xs[k + 1]; x += step) fn(x, z);
  }
}
// 귀 자르기 삼각분할
function earcut(pts) {
  const n = pts.length; if (n < 3) return [];
  let ar = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
  const idx = []; for (let i = 0; i < n; i++) idx.push(ar > 0 ? i : n - 1 - i);
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 0) continue;
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push(ia, ib, ic); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  // 반시계 → 위를 보게 (x 가 서쪽이라 뒤집힘)
  for (let i = 0; i < out.length; i += 3) { const t = out[i + 1]; out[i + 1] = out[i + 2]; out[i + 2] = t; }
  return out;
}


// ---------- 칸 만들기 (땅 · 건물 · 도로) ----------
function buildCell(R, c) {
  const ox = (c.i + 0.5) * CELL, oz = (c.j + 0.5) * CELL;
  const g = new THREE.Group(); g.position.set(ox, 0, oz);
  const disp = [];
  {
    const h = CELL / 2, y = -0.02, arr = [-h, y, -h, h, y, h, h, y, -h, -h, y, -h, -h, y, h, h, y, h];
    upward(arr);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const uv = new Float32Array(12); for (let q = 0; q < 6; q++) { uv[q * 2] = (arr[q * 3] + (ox % 4096)) / 12; uv[q * 2 + 1] = (arr[q * 3 + 2] + (oz % 4096)) / 12; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, groundMat()); m.receiveShadow = true; g.add(m); disp.push(geo);
  }
  const bA = [];
  for (let q = 0; q < c.blds.length; q += 3) {
    addBld(R.D, bA, c.blds[q], c.blds[q + 1], c.blds[q + 2], ox, oz);
    if (!c.colDone) bldCollider(R.D.blds[c.blds[q]]);
  }
  for (let mi = 0; mi < 5; mi++) {
    const gb = bA[mi]; if (!gb || !gb.pos.length) continue;
    orientTo(gb);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gb.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(gb.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(gb.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(gb.col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, [M.shop, M.apt, M.office, M.factory, M.roof][mi]); m.castShadow = mi !== 4; m.receiveShadow = true; g.add(m); disp.push(geo);
  }
  scene.add(g);
  let roads = null;
  if (W.drawRoadCell && (c.edges.length || c.nodes.length)) {
    roads = W.drawRoadCell(c.edges, c.nodes, c.links, !c.colDone);
    scene.add(roads.group);
  }
  c.colDone = true;
  R.built++;
  return { g, disp, roads };
}
function drawConnector(e) {
  const ox = Math.round(e.a.x), oz = Math.round(e.a.z), arr = [], wl = [];
  const P = (s2, l, y) => [e.a.x + e.dir.x * s2 - e.dir.z * l - ox, y, e.a.z + e.dir.z * s2 + e.dir.x * l - oz];
  const quad = (A, a, b, c, d) => A.push(...a, ...b, ...c, ...a, ...c, ...d);
  const s0 = -4, s1 = e.len + 4;
  quad(arr, P(s0, -e.hw, 0.03), P(s0, e.hw, 0.03), P(s1, e.hw, 0.03), P(s1, -e.hw, 0.03));
  for (const l of [-e.hw + 0.5, e.hw - 0.5]) quad(wl, P(s0, l - 0.08, 0.045), P(s0, l + 0.08, 0.045), P(s1, l + 0.08, 0.045), P(s1, l - 0.08, 0.045));
  for (let k = 1; k < e.n; k++) { const l = -e.n * 3.3 / 2 + k * 3.3; for (let s2 = 0; s2 < e.len - 2; s2 += 20) quad(wl, P(s2, l - 0.08, 0.045), P(s2, l + 0.08, 0.045), P(Math.min(s2 + 8, e.len), l + 0.08, 0.045), P(Math.min(s2 + 8, e.len), l - 0.08, 0.045)); }
  for (const [A, mat] of [[arr, M.asphalt], [wl, M.white]]) {
    upward(A);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3));
    const uv = new Float32Array(A.length / 3 * 2); for (let q = 0; q < A.length / 3; q++) { uv[q * 2] = A[q * 3] / 8; uv[q * 2 + 1] = A[q * 3 + 2] / 8; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.position.set(ox, 0, oz); m.receiveShadow = true; scene.add(m);
  }
}
// 삼각형이 위를 보게 (뒤집힌 건 꼭짓점 순서 바꿈)
function upward(a) {
  for (let i = 0; i < a.length; i += 9) {
    const ux = a[i + 3] - a[i], uz = a[i + 5] - a[i + 2], vx = a[i + 6] - a[i], vz = a[i + 8] - a[i + 2];
    if (uz * vx - ux * vz < 0) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
}
// 저장된 법선 쪽이 앞면이 되게
function orientTo(g) {
  const P = g.pos;
  for (let t = 0; t < P.length / 9; t++) {
    const i = t * 9;
    const ux = P[i + 3] - P[i], uy = P[i + 4] - P[i + 1], uz = P[i + 5] - P[i + 2], vx = P[i + 6] - P[i], vy = P[i + 7] - P[i + 1], vz = P[i + 8] - P[i + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const n = g.nrm; if (cx * n[i] + cy * n[i + 1] + cz * n[i + 2] >= 0) continue;
    const sw = (arr, w) => { for (let k = 0; k < w; k++) { const a = t * 3 * w + w + k, b = t * 3 * w + 2 * w + k, x = arr[a]; arr[a] = arr[b]; arr[b] = x; } };
    sw(g.pos, 3); sw(g.nrm, 3); sw(g.uv, 2); sw(g.col, 3);
  }
}
let GM = null;
function groundMat() {
  if (!GM) {
    // 도시 바닥: 보도블록 · 단지 안 포장 (연한 회색, 군데군데 얼룩)
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#a9aca6'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { const v = 150 + Math.floor(Math.random() * 40); c.fillStyle = `rgba(${v},${v + 2},${v - 4},0.35)`; c.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 3 + Math.random() * 10); }
      c.strokeStyle = 'rgba(90,92,88,0.35)'; c.lineWidth = 1;
      for (let y = 0; y <= h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    GM = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.95 });
    Object.assign(GM, { stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
  }
  return GM;
}

// 건물 벽 · 지붕 (칸 원점 기준)
function addBld(D, acc, k, h, mi, ox, oz) {
  const bb = D.blds[k], n = (bb.length - 1) >> 1;
  const A = acc[mi] || (acc[mi] = { pos: [], nrm: [], uv: [], col: [] });
  const R = acc[4] || (acc[4] = { pos: [], nrm: [], uv: [], col: [] });
  const cols = mi === 1 ? [0xf2efe6, 0xe9e4d8, 0xdfe6ea, 0xf5f2ec] : mi === 2 ? [0xd9e4ee, 0xc8d6e2, 0xe6edf2, 0xb7c7d6] : [0xe8e1d4, 0xd8cfc0, 0xece7de, 0xc9c2b6];
  const col = cols[Math.floor(hrand(k, 3) * cols.length) % cols.length];
  const cr = ((col >> 16) & 255) / 255, cg = ((col >> 8) & 255) / 255, cbl = (col & 255) / 255;
  const tw = mi === 2 ? 4 : 8, th = mi === 1 ? 2.9 : mi === 2 ? 4 : 3.2;
  let ar = 0; for (let q = 0; q < n; q++) { const q2 = (q + 1) % n; ar += bb[1 + q * 2] * bb[2 + q2 * 2] - bb[1 + q2 * 2] * bb[2 + q * 2]; }
  const ccw = ar > 0;
  let per = 0;
  const v = (x, y, z, u, w, nx, nz) => { A.pos.push(x - ox, y, z - oz); A.nrm.push(nx, 0, nz); A.uv.push(u, w); A.col.push(cr, cg, cbl); };
  for (let q = 0; q < n; q++) {
    const q2 = (q + 1) % n, px = bb[1 + q * 2], pz = bb[2 + q * 2], qx = bb[1 + q2 * 2], qz = bb[2 + q2 * 2];
    const len = Math.hypot(qx - px, qz - pz); if (len < 0.05) continue;
    let nx = (qz - pz) / len, nz = -(qx - px) / len; if (!ccw) { nx = -nx; nz = -nz; }
    const u0 = per / tw, u1 = (per + len) / tw, v1 = h / th; per += len;
    if (ccw) { v(px, 0, pz, u0, 0, nx, nz); v(qx, 0, qz, u1, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz); v(px, 0, pz, u0, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz); v(px, h, pz, u0, v1, nx, nz); }
    else { v(px, 0, pz, u0, 0, nx, nz); v(qx, h, qz, u1, v1, nx, nz); v(qx, 0, qz, u1, 0, nx, nz); v(px, 0, pz, u0, 0, nx, nz); v(px, h, pz, u0, v1, nx, nz); v(qx, h, qz, u1, v1, nx, nz); }
  }
  const pts = []; for (let q = 0; q < n; q++) pts.push([bb[1 + q * 2], bb[2 + q * 2]]);
  const ids = earcut(pts);
  for (const id of ids) { const p = pts[id]; R.pos.push(p[0] - ox, h, p[1] - oz); R.nrm.push(0, 1, 0); R.uv.push(p[0] / 8, p[1] / 8); R.col.push(cr * 0.8, cg * 0.8, cbl * 0.8); }
}

// 롯데월드타워 (555m, 위로 갈수록 가늘어지는 탑)
function buildTower(R) {
  const p = R.towerAt;
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
  const tex = canvasTex(256, 1024, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#dfe8ef'); gr.addColorStop(1, '#9fb2c2'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,90,110,.35)'; c.lineWidth = 2;
    for (let y = 0; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.5)'; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 6);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(15, 38, 500, 4, 24, false, Math.PI / 4), mat);
  body.position.y = 250; body.castShadow = true; g.add(body);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(4, 15, 55, 4, 1, true, Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xc8d4de, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
  crown.position.y = 527.5; g.add(crown);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(110, 22, 90), new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.6 }));
  pod.position.set(0, 11, 70); pod.castShadow = true; g.add(pod);
  const light = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 })); light.position.y = 556; g.add(light);
  scene.add(g);
  return g;
}
function dropCell(c) {
  const b = c.built; if (!b) return;
  scene.remove(b.g);
  for (const d of b.disp) d.dispose();
  if (b.roads) {
    scene.remove(b.roads.group);
    b.roads.group.traverse((o) => {
      if (o.isInstancedMesh) { o.dispose(); return; }
      if (!o.isMesh) return;
      if (o.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); return; }
      o.geometry.dispose();
    });
  }
  c.built = null;
}
function dropAll(R) {
  for (const c of R.cells.values()) if (c.built) dropCell(c);
  if (R.tower) { scene.remove(R.tower); R.tower = null; }
}
// 매 프레임: 근처 칸 하나씩 만들고 먼 칸 지움 (지역마다)
export function streamRegion(px, pz) {
  for (const R of REGS) {
    if (!inBox(R.B, px, pz, 2500)) { if (R.built) { dropAll(R); R.built = 0; } continue; }
    if (R.towerAt && !R.tower && Math.hypot(R.towerAt.x - px, R.towerAt.z - pz) < 12000) R.tower = buildTower(R);
    let best = null, bd = Infinity;
    for (const c of R.cells.values()) {
      const cx = (c.i + 0.5) * CELL, cz = (c.j + 0.5) * CELL, d = Math.hypot(cx - px, cz - pz);
      if (c.built && d > FAR) dropCell(c);
      else if (!c.built && d < NEAR && d < bd) { bd = d; best = c; }
    }
    if (best) best.built = buildCell(R, best);
  }
}
export function buildRegionNear(px, pz) {
  for (const R of REGS) {
    if (!inBox(R.B, px, pz, 2000)) continue;
    for (let k = 0; k < 40; k++) {
      let best = null, bd = Infinity;
      for (const c of R.cells.values()) { const d = Math.hypot((c.i + 0.5) * CELL - px, (c.j + 0.5) * CELL - pz); if (!c.built && d < 900 && d < bd) { bd = d; best = c; } }
      if (!best) break;
      best.built = buildCell(R, best);
    }
    if (R.towerAt && !R.tower) R.tower = buildTower(R);
  }
}
const SIGC = { r: new THREE.Color(0xff3b30), y: new THREE.Color(0xffc21a), g: new THREE.Color(0x2ee06a), off: new THREE.Color(0x222222) };
export function updateRegionSignals(t) {
  for (const R of REGS) for (const c of R.cells.values()) {
    const r = c.built && c.built.roads; if (!r || !r.signalMesh) continue;
    const m = r.signalMesh;
    for (const sl of r.signalLamps) {
      const st = signalState(sl.node, sl.axis, t);
      const red = st.s === 'R' && st.l !== 'Y', yel = st.s === 'Y' || st.l === 'Y';
      m.setColorAt(sl.idx, red ? SIGC.r : SIGC.off);
      m.setColorAt(sl.idx + 1, yel ? SIGC.y : SIGC.off);
      m.setColorAt(sl.idx + 2, st.l === 'G' ? SIGC.g : SIGC.off);
      m.setColorAt(sl.idx + 3, st.s === 'G' ? SIGC.g : SIGC.off);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
export const regionCells = () => { let n = 0; for (const R of REGS) for (const c of R.cells.values()) if (c.built) n++; return n; };
