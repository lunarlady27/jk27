import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

export function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry(20261114);
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}
export function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let k = 0; k < 5; k++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

export function won(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4;
  const parts = [];
  if (eok) parts.push(eok.toLocaleString('ko-KR') + '억');
  if (man) parts.push(man.toLocaleString('ko-KR') + '만');
  if (rest || !parts.length) parts.push(rest.toLocaleString('ko-KR'));
  return sign + parts.join(' ') + '원';
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData = { canvas: c, ctx: g };
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// shared base geometries
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sph: new THREE.SphereGeometry(1, 14, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};
for (const k in GEO) GEO[k].userData.shared = true;

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function mx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Merges many small static parts into one mesh per material (fewer draw calls)
export class Merger {
  constructor(opts = {}) { this.groups = new Map(); this.tile = opts.tile || 0; this.planar = opts.planar || null; this.deform = opts.deform || null; }
  add(geo, mat, m4, color) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    // 칸 나누기: 칸 중심을 원점으로 둔 좌표로 저장 (광주에서 멀리 떨어진 서울에서도 떨림 없음)
    let ox = 0, oz = 0, tkey = null;
    if (this.tile && m4) {
      const tx = m4.elements[12], tz = m4.elements[14];
      const ti = Math.floor(tx / this.tile), tj = Math.floor(tz / this.tile);
      ox = (ti + 0.5) * this.tile; oz = (tj + 0.5) * this.tile; tkey = ti + ':' + tj;
      m4 = new THREE.Matrix4().makeTranslation(-ox, 0, -oz).multiply(m4);
    }
    if (m4) g.applyMatrix4(m4);
    if (this.deform) this.deform(g);
    if (mat.vertexColors) {
      const c = new THREE.Color(color ?? 0xffffff);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    let key = mat;
    if (this.tile) {
      if (tkey === null) {
        g.computeBoundingBox();
        const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2, cz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
        tkey = Math.floor(cx / this.tile) + ':' + Math.floor(cz / this.tile);
      }
      key = mat.uuid + ':' + tkey;
      if (!this.groups.has(key)) this.groups.set(key, { mat, list: [], ox, oz });
      this.groups.get(key).list.push(g);
    } else {
      if (!this.groups.has(key)) this.groups.set(key, { mat, list: [] });
      this.groups.get(key).list.push(g);
    }
  }
  build(parent, opts = {}) {
    const meshes = [];
    for (const { mat, list, ox = 0, oz = 0 } of this.groups.values()) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (!merged) continue;
      const pl = opts.planar ?? this.planar;
      if (pl && mat.userData.planar !== false) {
        const pos = merged.attributes.position, uv = merged.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + (ox % 4096)) / pl, (pos.getZ(i) + (oz % 4096)) / pl);
        uv.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.position.set(ox, 0, oz);
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? false;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

// Box with UVs scaled to real size so window textures tile properly
export function boxUV(w, h, d, tw, th) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.02); continue; }
      const su = (f < 2 ? d : w) / tw, sv = h / th;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  return g;
}

export const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
// 최소 힙 (경로 탐색용)
export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const tk = k[0], tv = v[0];
    const lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n) {
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mk = lk; if (l < n && k[l] < mk) { m = l; mk = k[l]; } if (r < n && k[r] < mk) { m = r; mk = k[r]; } if (m < 0) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    this.topKey = tk; return tv;
  }
}
