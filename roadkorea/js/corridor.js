// ===================== 광주 → 서울 고속도로 (호남 · 논산천안 · 경부) =====================
// 도로망(링크)은 처음에 한 번에 만들고, 눈에 보이는 것(도로면 · 차선 · 방호울타리 · 산 · 나무 · 표지판 · 터널 · 휴게소 · 요금소)은
// 플레이어 근처 1km 조각만 그때그때 만들고 멀어지면 지움. 조각마다 원점을 따로 둬서 멀리 가도 화면이 떨리지 않음.
import * as THREE from 'three';
import { inB as inSeoul } from './region.js';
import { W, LANE_W, addOBox, addCircle } from './roadnet.js';
import { canvasTex, GEO } from './util.js';

const CH = 1000;                // 조각 길이 (m)
const KEEP = [-2, 3];           // 만들어 둘 조각 범위 (뒤 2, 앞 3)
const DROP = 6;                 // 이보다 멀면 지움
const CELL = 400;

// 고속도로 하나 (여러 개를 만들 수 있게 상태를 함수 안에 둠)
function makeCorr(LIST) {
  const self = {};
  // 다른 고속도로 바로 옆이면 (갈라지는 분기점 근처) 이 고속도로의 산 · 나무를 안 그림
  const nearOther = (x, z, pad) => LIST.some((o) => { if (o === self) return false; const q = o.proj(x, z); return q && q.d < o.hwAt(q.s) + pad; });
  const otherHill = (x, z) => { let h = Infinity; for (const o of LIST) { if (o === self) continue; const q = o.proj(x, z); if (q && q.d < 900) h = Math.min(h, o.hill(q.s, q.lat)); } return h; };
const CORR = { on: false };
let H = null, P = null, cum = null, grid = null, mats = null, scene = null, NET = null, META = null;
const chunks = new Map();
const colDone = new Set();

// ---------- 준비 ----------
function initCorridor(Hdata, sceneRef, M, net, meta) {
  H = Hdata; scene = sceneRef; NET = net; META = meta || {};
  const C = net;
  P = C.nodes.map((n) => ({ x: n.x, z: n.z }));
  cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  grid = new Map();
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    for (let gx = Math.floor((Math.min(a.x, b.x) - 900) / CELL); gx <= Math.floor((Math.max(a.x, b.x) + 900) / CELL); gx++)
      for (let gz = Math.floor((Math.min(a.z, b.z) - 900) / CELL); gz <= Math.floor((Math.max(a.z, b.z) + 900) / CELL); gz++) {
        const k = gx * 100003 + gz; let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(i);
      }
  }
  const ds = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  mats = {
    asphalt: M.asphalt, lot: ds(M.asphalt), concrete: M.concrete, metal: ds(M.metal), white: M.white, yellow: M.yellow, basic: M.basic, lamp: M.tunnelLamp, wall: ds(M.tunnelWall),
    ground: new THREE.MeshStandardMaterial({ map: M.grass.map, vertexColors: true, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }),
    sign: new THREE.MeshStandardMaterial({ color: 0x1f6e3b, roughness: 0.6 }),
  };
  CORR.on = true;
  CORR.len = cum[cum.length - 1];
  CORR.road = (s) => H.segs.find((g) => s >= g[0] && s < g[1]) || H.segs[H.segs.length - 1];
}
const hwAt = (s) => { const g = CORR.road(s); return 2.4 / 2 + g[3] * LANE_W + 2.8; };

// 가장 가까운 선분 (1km 안에 없으면 null)
function corrProj(x, z) {
  if (!grid) return null;
  const arr = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!arr) return null;
  let best = null, bd = 1e18;
  for (const i of arr) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const cx = a.x + dx * t, cz = a.z + dz * t, d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bd) { bd = d; const L = Math.sqrt(l2); best = { i, t, s: cum[i] + t * L, lat: ((x - a.x) * -dz + (z - a.z) * dx) / L, d: Math.sqrt(d), dx: dx / L, dz: dz / L }; }
  }
  return best;
}
const tunAt = (s) => { for (const [a, b] of H.tunnels) if (s >= a - 30 && s <= b + 30) return [a, b]; return null; };
const restNear = (s, side) => H.rest.find((r) => (r[2] === 'N' ? 1 : -1) === side && Math.abs(r[0] - s) < 240);
// 산 · 들 높이 (도로 중심에서 옆으로 lat)
function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
function hillH(s, lat) {
  const side = lat >= 0 ? 1 : -1, a = Math.abs(lat), hw = hwAt(s);
  if (a < hw + 6) return 0;
  // 휴게소 자리는 평평하게
  const r = restNear(s, side); if (r && a < hw + 110) return 0;
  const k = side > 0 ? 17.3 : 91.7;
  const big = noise1(s / 2600 + k) * 0.7 + noise1(s / 900 + k * 2) * 0.3;     // 산이 가까운지 먼지
  const amp = 8 + big * big * 140;
  const near = Math.min(1, (a - hw - 6) / (40 + (1 - big) * 160));
  const t = near * near * (3 - 2 * near);
  let h = amp * t * (0.6 + 0.4 * noise1(s / 300 + a / 200 + k));
  // 먼 산 (시야 끝이 비지 않게)
  if (a > 500) h += (a - 500) * 0.35;
  return h;
}
// 물리용 땅 높이: 터널 안 · 도로 위는 0
function corrGround(x, z) {
  const q = corrProj(x, z);
  if (!q || q.d > 900) return { h: 400, off: true };
  const hw = hwAt(q.s);
  if (Math.abs(q.lat) < hw + 0.5 && tunAt(q.s)) return { h: 0, tunnel: true };
  return { h: hillH(q.s, q.lat), q };
}

// ---------- 표지판 그림 ----------
function signTex(lines, bg = '#1f6e3b', w = 512, h = 160) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => { g.font = `900 ${i === 0 ? 56 : 38}px "Noto Sans KR", sans-serif`; g.fillText(ln, w / 2, (h * (i + 0.5)) / n + (n === 1 ? 0 : i === 0 ? 6 : -4)); });
  });
}

// ---------- 조각 만들기 ----------
function buildChunk(k) {
  const s0 = k * CH, s1 = Math.min(CORR.len, s0 + CH);
  if (s0 >= CORR.len || s1 <= 0) return null;
  const i0 = Math.max(0, lowerIdx(s0)), i1 = Math.min(P.length - 1, lowerIdx(s1) + 1);
  const ox = P[i0].x, oz = P[i0].z;
  const g = new THREE.Group(); g.position.set(ox, 0, oz);
  const disp = [];
  const tex = [];
  const pos = { asphalt: [], white: [], yellow: [], concrete: [], metal: [], wall: [] };
  const quad = (arr, a, b, c, d) => arr.push(a[0] - ox, a[1], a[2] - oz, b[0] - ox, b[1], b[2] - oz, c[0] - ox, c[1], c[2] - oz, a[0] - ox, a[1], a[2] - oz, c[0] - ox, c[1], c[2] - oz, d[0] - ox, d[1], d[2] - oz);
  const ptAt = (i, t, lat, y = 0) => { const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return [a.x + dx * t - (dz / L) * lat, y, a.z + dz * t + (dx / L) * lat]; };
  // 꺾이는 점에서 옆 방향은 앞뒤 선분 평균 (틈 없이)
  const side = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return { x: -dz / L, z: dx / L }; };
  const at = (i, lat, y = 0) => { const n = side(i); return [P[i].x + n.x * lat, y, P[i].z + n.z * lat]; };
  const box = (arr, i, l0, l1, y0, y1) => { // 선분 i 위의 상자 (옆 l0~l1, 높이 y0~y1)
    const A0 = at(i, l0, y0), A1 = at(i, l1, y0), B0 = at(i + 1, l0, y0), B1 = at(i + 1, l1, y0);
    const A0u = at(i, l0, y1), A1u = at(i, l1, y1), B0u = at(i + 1, l0, y1), B1u = at(i + 1, l1, y1);
    quad(arr, A0u, A1u, B1u, B0u); quad(arr, A0, B0, B0u, A0u); quad(arr, A1, A1u, B1u, B1);
  };
  for (let i = i0; i < i1; i++) {
    const sm = (cum[i] + cum[i + 1]) / 2, g2 = CORR.road(sm), n = g2[3], med = 1.2, hw = hwAt(sm);
    const L = cum[i + 1] - cum[i];
    const tun = tunAt(sm);
    // 도로면
    quad(pos.asphalt, at(i, -hw, 0.03), at(i, hw, 0.03), at(i + 1, hw, 0.03), at(i + 1, -hw, 0.03));
    // 중앙분리대 (콘크리트)
    box(pos.concrete, i, -0.4, 0.4, 0.03, 0.95);
    for (const sg of [1, -1]) {
      // 황색 실선(분리대 쪽) · 흰색 바깥선
      const yl = sg * (med + 0.15), el = sg * (med + n * LANE_W + 0.1);
      quad(pos.yellow, at(i, yl - 0.08, 0.05), at(i, yl + 0.08, 0.05), at(i + 1, yl + 0.08, 0.05), at(i + 1, yl - 0.08, 0.05));
      quad(pos.white, at(i, el - 0.1, 0.05), at(i, el + 0.1, 0.05), at(i + 1, el + 0.1, 0.05), at(i + 1, el - 0.1, 0.05));
      // 차선 점선 (8m 칠하고 12m 띄움)
      for (let ln = 1; ln < n; ln++) {
        const lat = sg * (med + ln * LANE_W);
        for (let d = (20 - (cum[i] % 20)) % 20; d < L; d += 20) {
          const ta = d / L, tb = Math.min(1, (d + 8) / L);
          quad(pos.white, ptAt(i, ta, lat - 0.08, 0.05), ptAt(i, ta, lat + 0.08, 0.05), ptAt(i, tb, lat + 0.08, 0.05), ptAt(i, tb, lat - 0.08, 0.05));
        }
      }
      // 가드레일 (휴게소 진출입 구간은 비움)
      const rest = restNear(sm, sg);
      if (!tun && !(rest && Math.abs(rest[0] - sm) < 200)) {
        const l0 = sg * (hw + 0.2), l1 = sg * (hw + 0.45);
        box(pos.metal, i, Math.min(l0, l1), Math.max(l0, l1), 0.45, 0.8);
      }
      if (tun) { // 터널 벽
        const l0 = sg * (hw + 0.1), l1 = sg * (hw + 0.7);
        box(pos.wall, i, Math.min(l0, l1), Math.max(l0, l1), 0, 6.8);
      }
    }
    if (tun) quad(pos.wall, at(i, -hw - 0.7, 6.8), at(i, hw + 0.7, 6.8), at(i + 1, hw + 0.7, 6.8), at(i + 1, -hw - 0.7, 6.8));
    // 충돌 (한 번만)
    if (!colDone.has(i)) {
      colDone.add(i);
      const c = ptAt(i, 0.5, 0), hd = Math.atan2(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
      addOBox(c[0], c[2], 0.45, L / 2 + 0.2, hd, 'median');
      for (const sg of [1, -1]) {
        const rest = restNear(sm, sg);
        if (rest && Math.abs(rest[0] - sm) < 200 && !tun) continue;
        const q = ptAt(i, 0.5, sg * (hw + 0.35));
        addOBox(q[0], q[2], 0.25, L / 2 + 0.2, hd, tun ? 'tunnel' : 'rail');
      }
    }
  }
  const mk = (arr, mat, cast = false) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const n = arr.length / 3, uv = new Float32Array(n * 2);
    for (let q = 0; q < n; q++) { uv[q * 2] = arr[q * 3] / 8; uv[q * 2 + 1] = arr[q * 3 + 2] / 8; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; g.add(m); disp.push(geo);
  };
  mk(pos.asphalt, mats.asphalt); mk(pos.white, mats.white); mk(pos.yellow, mats.yellow);
  mk(pos.concrete, mats.concrete, true); mk(pos.metal, mats.metal, true); mk(pos.wall, mats.wall);
  // ---------- 땅 · 산 (단면 띠) ----------
  {
    const OFF = [0.5, 6, 14, 30, 55, 90, 140, 210, 300, 420, 560, 760];
    const cols = OFF.length * 2;
    const vp = [], vc = [], idx = [], cut = [];
    const col = new THREE.Color();
    const rows = [];
    for (let i = i0; i <= i1; i++) rows.push(i);
    for (const i of rows) {
      const s = cum[i], hw = hwAt(s), tun = tunAt(s);
      for (let c = 0; c < cols; c++) {
        const sg = c < OFF.length ? -1 : 1, o = c < OFF.length ? OFF[OFF.length - 1 - c] : OFF[c - OFF.length];
        const lat = sg * (hw + o);
        let h = hillH(s, lat);
        const pp0 = at(i, lat);
        const inMap = (W.bounds && pp0[0] > W.bounds.x0 && pp0[0] < W.bounds.x1 && pp0[2] > W.bounds.z0 && pp0[2] < W.bounds.z1) || inSeoul(pp0[0], pp0[2]);
        // 다른 고속도로(분기점에서 갈라진 길) 근처: 그 길 자리는 구멍, 높이는 둘 중 낮은 쪽
        cut.push(nearOther(pp0[0], pp0[2], 40) ? 1 : 0);
        h = Math.min(h, otherHill(pp0[0], pp0[2]));
        if (tun) { const [ta, tb] = tun, inside = Math.min(s - ta, tb - s); h = Math.max(h, Math.min(60, 12 + Math.max(0, inside) * 0.25) * Math.max(0, 1 - o / 260)); }
        const p = at(i, lat, inMap ? -1.5 : Math.max(0, h) - 0.02); // 광주 지도 안은 광주 땅이 보이게
        vp.push(p[0] - ox, p[1], p[2] - oz);
        const n = noise1(s / 120 + c * 3.1);
        if (h > 60) col.setRGB(0.3 + n * 0.08, 0.42 + n * 0.08, 0.26);
        else if (h > 4) col.setRGB(0.24 + n * 0.1, 0.4 + n * 0.12, 0.18 + n * 0.05);
        else if (o > 20) col.setRGB(0.62 + n * 0.2, 0.7 + n * 0.12, 0.34 + n * 0.1); // 논밭
        else col.setRGB(0.5, 0.58, 0.36);
        vc.push(col.r, col.g, col.b);
      }
    }
    for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols - 1; c++) {
      if (c === OFF.length - 1) continue; // 도로 자리 비움
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (cut[a] || cut[b] || cut[d] || cut[e]) continue;
      idx.push(a, b, d, b, e, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    const uv = new Float32Array((vp.length / 3) * 2); for (let q = 0; q < vp.length / 3; q++) { uv[q * 2] = vp[q * 3] / 10; uv[q * 2 + 1] = vp[q * 3 + 2] / 10; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats.ground); m.receiveShadow = true; g.add(m); disp.push(geo);
    // 터널 구간 산 덮개 (도로 위)
    const roof = [];
    for (let i = i0; i < i1; i++) {
      const sA = cum[i], sB = cum[i + 1], tA = tunAt(sA), tB = tunAt(sB);
      if (!tA || !tB) continue;
      const hwA = hwAt(sA);
      const hA = Math.min(60, 12 + Math.max(0, Math.min(sA - tA[0], tA[1] - sA)) * 0.25), hB = Math.min(60, 12 + Math.max(0, Math.min(sB - tB[0], tB[1] - sB)) * 0.25);
      quad(roof, at(i, -hwA - 1, hA), at(i, hwA + 1, hA), at(i + 1, hwA + 1, hB), at(i + 1, -hwA - 1, hB));
    }
    if (roof.length) {
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(roof, 3));
      const rc = new Float32Array(roof.length); for (let q = 0; q < roof.length; q += 3) { rc[q] = 0.24; rc[q + 1] = 0.4; rc[q + 2] = 0.18; }
      rg.setAttribute('color', new THREE.BufferAttribute(rc, 3)); rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, mats.ground); g.add(rm); disp.push(rg);
    }
  }
  // ---------- 나무 ----------
  {
    const N = 260, tm = new THREE.InstancedMesh(GEO.cyl8 || GEO.cyl, mats.trunk, N), cm = new THREE.InstancedMesh(coneGeo(), mats.leaf, N);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), c3 = new THREE.Color();
    let n = 0;
    for (let t = 0; t < N * 3 && n < N; t++) {
      const s = s0 + hash(k * 977 + t) * (s1 - s0), sg = hash(k * 131 + t * 7) < 0.5 ? -1 : 1;
      const lat = sg * (hwAt(s) + 12 + hash(k * 71 + t * 13) * 260);
      const qq = projS(s); if (!qq) continue;
      if (restNear(s, sg) && Math.abs(lat) < hwAt(s) + 120) continue;
      const h = hillH(s, lat); if (h > 120) continue;
      const x = qq.x - qq.dz * lat, z = qq.z + qq.dx * lat, sz = 0.8 + hash(t + k) * 1.1;
      if ((W.bounds && x > W.bounds.x0 && x < W.bounds.x1 && z > W.bounds.z0 && z < W.bounds.z1) || inSeoul(x, z, 30) || nearOther(x, z, 30)) continue;
      M4.compose(p3.set(x - ox, h + 1 * sz, z - oz), q.identity(), sc.set(0.25 * sz, 2 * sz, 0.25 * sz)); tm.setMatrixAt(n, M4);
      M4.compose(p3.set(x - ox, h + 5 * sz, z - oz), q.identity(), sc.set(2.6 * sz, 7.5 * sz, 2.6 * sz)); cm.setMatrixAt(n, M4);
      cm.setColorAt(n, c3.setHSL(0.28 + hash(t * 3) * 0.06, 0.42, 0.2 + hash(t * 5) * 0.08));
      n++;
    }
    tm.count = cm.count = n; tm.castShadow = cm.castShadow = true;
    g.add(tm); g.add(cm);
  }
  // ---------- 표지판 (나들목 · 분기점 · 거리 · 휴게소) ----------
  const gantry = (s, sgDir, lines, bg) => {
    const qq = projS(s); if (!qq) return;
    const hw = hwAt(s), lat0 = sgDir * (1.2 + 0.5), lat1 = sgDir * (hw + 0.5);
    const cx = qq.x - qq.dz * (lat0 + lat1) / 2, cz = qq.z + qq.dx * (lat0 + lat1) / 2;
    const t = signTex(lines, bg); tex.push(t);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); tex.push(mat);
    const w = Math.abs(lat1 - lat0) * 0.9, h = w * 0.31;
    const pl = new THREE.Mesh(GEO.plane, mat); pl.scale.set(w, h, 1);
    pl.position.set(cx - ox, 6.2 + h / 2, cz - oz);
    pl.rotation.y = Math.atan2(qq.dx, qq.dz) + (sgDir > 0 ? Math.PI : 0);
    g.add(pl);
    // 기둥 · 보
    for (const l of [lat0, lat1 + sgDir * 0.4]) {
      const px = qq.x - qq.dz * l, pz = qq.z + qq.dx * l;
      const pole = new THREE.Mesh(GEO.box, mats.metal); pole.scale.set(0.35, 6.2 + h, 0.35); pole.position.set(px - ox, (6.2 + h) / 2, pz - oz); g.add(pole);
    }
    const beam = new THREE.Mesh(GEO.box, mats.metal); beam.scale.set(Math.abs(lat1 - lat0), 0.3, 0.3); beam.position.set(cx - ox, 6.1, cz - oz); beam.rotation.y = Math.atan2(qq.dx, qq.dz) + Math.PI / 2; g.add(beam);
  };
  const kmTo = (s, dir) => (dir > 0 ? (CORR.len - s) / 1000 : s / 1000);
  for (const [sIc, name, kind] of H.ics) {
    for (const dir of [1, -1]) { // 1 = 서울 방향(상행), -1 = 광주 방향(하행)
      const label = kind === 'JC' ? name : `${name} IC`;
      for (const [d, txt] of [[2000, '2km'], [1000, '1km']]) {
        const s = sIc - dir * d;
        if (s >= s0 && s < s1) gantry(s, dir, [label, `${txt}  ${kind === 'JC' ? '분기점' : '출구 →'}`], kind === 'JC' ? '#1f5fa8' : '#1f6e3b');
      }
    }
  }
  for (let sKm = 10000; sKm < CORR.len; sKm += 20000) {
    if (sKm >= s0 && sKm < s1) {
      gantry(sKm, 1, [META.toEnd || '서울', `${kmTo(sKm, 1).toFixed(0)} km`], '#1f6e3b');
      gantry(sKm + 300, -1, [META.toStart || '광주', `${kmTo(sKm + 300, -1).toFixed(0)} km`], '#1f6e3b');
    }
  }
  for (const [sR, name, sd] of H.rest) {
    const dir = sd === 'N' ? 1 : -1, s = sR - dir * 1500;
    if (s >= s0 && s < s1) gantry(s, dir, [name.replace('휴게소', ''), '휴게소  1.5km →'], '#5a3a8a');
  }
  // ---------- 휴게소 ----------
  for (const [sR, name, sd] of H.rest) {
    if (sR < s0 || sR >= s1) continue;
    const dir = sd === 'N' ? 1 : -1, qq = projS(sR); if (!qq) continue;
    const hw = hwAt(sR), lot = [];
    const P2 = (ds, l) => { const q2 = projS(sR + ds) || qq; return [q2.x - q2.dz * l * dir, 0.04, q2.z + q2.dx * l * dir]; };
    // 주차장 (도로 오른쪽)
    for (let ds = -180; ds < 180; ds += 30) quad(lot, P2(ds, hw), P2(ds, hw + 75), P2(ds + 30, hw + 75), P2(ds + 30, hw));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lot, 3)); lg.computeVertexNormals();
    const uv = new Float32Array((lot.length / 3) * 2); for (let q2 = 0; q2 < lot.length / 3; q2++) { uv[q2 * 2] = lot[q2 * 3] / 8; uv[q2 * 2 + 1] = lot[q2 * 3 + 2] / 8; }
    lg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const lm = new THREE.Mesh(lg, mats.lot); lm.receiveShadow = true; g.add(lm); disp.push(lg);
    // 건물 · 지붕 · 이름
    const hd = Math.atan2(qq.dx, qq.dz);
    const bp = P2(20, hw + 62);
    if (!colDone.has('r' + sR + sd)) { colDone.add('r' + sR + sd); addOBox(bp[0], bp[2], 9, 35, hd, 'bld'); }
    const b = new THREE.Mesh(GEO.box, mats.basic.clone()); b.material.color.set(0xf1e9da); b.scale.set(18, 7, 70); b.position.set(bp[0] - ox, 3.5, bp[2] - oz); b.rotation.y = hd; b.castShadow = true; g.add(b); tex.push(b.material);
    const rf = new THREE.Mesh(GEO.box, mats.basic.clone()); rf.material.color.set(0x8a3b2c); rf.scale.set(20, 0.8, 73); rf.position.set(bp[0] - ox, 7.4, bp[2] - oz); rf.rotation.y = hd; g.add(rf); tex.push(rf.material);
    const t = signTex([name], '#7a2f2a', 768, 120); tex.push(t);
    const nm = new THREE.MeshStandardMaterial({ map: t }); tex.push(nm);
    const np = new THREE.Mesh(GEO.plane, nm); np.scale.set(36, 5.6, 1);
    const fp = P2(20, hw + 52.9); np.position.set(fp[0] - ox, 10.5, fp[2] - oz); np.rotation.y = hd + (dir > 0 ? -Math.PI / 2 : Math.PI / 2); g.add(np);
    // 주유소 지붕
    const gp = P2(-120, hw + 40);
    const cp = new THREE.Mesh(GEO.box, mats.basic.clone()); cp.material.color.set(0xf2f2f2); cp.scale.set(24, 0.8, 30); cp.position.set(gp[0] - ox, 6, gp[2] - oz); cp.rotation.y = hd; g.add(cp); tex.push(cp.material);
  }
  // ---------- 터널 입구 · 조명 ----------
  for (const [ta, tb] of H.tunnels) {
    for (const sP of [ta, tb]) {
      if (sP < s0 || sP >= s1) continue;
      const qq = projS(sP); if (!qq) continue;
      const hw = hwAt(sP), hd = Math.atan2(qq.dx, qq.dz);
      const fr = new THREE.Mesh(GEO.box, mats.concrete); fr.scale.set(2 * hw + 8, 4, 1.6); fr.position.set(qq.x - ox, 6.8 + 2, qq.z - oz); fr.rotation.y = hd; g.add(fr);
      for (const sg of [1, -1]) { const p2 = new THREE.Mesh(GEO.box, mats.concrete); p2.scale.set(3, 9, 1.6); p2.position.set(qq.x - qq.dz * sg * (hw + 2.2) - ox, 4.4, qq.z + qq.dx * sg * (hw + 2.2) - oz); p2.rotation.y = hd; g.add(p2); }
    }
    const a = Math.max(ta, s0), b = Math.min(tb, s1);
    if (a < b) {
      const n = Math.floor((b - a) / 14), im = new THREE.InstancedMesh(GEO.box, mats.lamp, Math.max(1, n * 2));
      const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1.8, 0.12, 0.3), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      let c = 0;
      for (let j = 0; j < n; j++) {
        const qq = projS(a + j * 14); if (!qq) continue;
        const hw = hwAt(a + j * 14);
        q.setFromAxisAngle(up, Math.atan2(qq.dx, qq.dz));
        for (const sg of [1, -1]) { M4.compose(p3.set(qq.x - qq.dz * sg * (hw - 0.5) - ox, 6.2, qq.z + qq.dx * sg * (hw - 0.5) - oz), q, sc); im.setMatrixAt(c++, M4); }
      }
      im.count = c; g.add(im);
    }
  }
  // ---------- 요금소 (광주 · 서울) ----------
  for (const [sT, name] of H.tolls) {
    if (sT < s0 || sT >= s1) continue;
    const qq = projS(sT); if (!qq) continue;
    const hw = hwAt(sT), hd = Math.atan2(qq.dx, qq.dz), n = CORR.road(sT)[3];
    const can = new THREE.Mesh(GEO.box, mats.concrete); can.scale.set(2 * hw + 6, 1, 18); can.position.set(qq.x - ox, 7.1, qq.z - oz); can.rotation.y = hd; g.add(can);
    const stripe = new THREE.Mesh(GEO.box, mats.yellow); stripe.scale.set(2 * hw + 6.1, 0.25, 18.2); stripe.position.set(qq.x - ox, 6.5, qq.z - oz); stripe.rotation.y = hd; g.add(stripe);
    for (const sg of [1, -1]) for (let ln = 0; ln <= n; ln++) {
      const l = sg * (1.2 + ln * LANE_W);
      const bx = qq.x - qq.dz * l, bz = qq.z + qq.dx * l;
      if (!colDone.has('t' + sT + ':' + sg + ':' + ln)) { colDone.add('t' + sT + ':' + sg + ':' + ln); addOBox(bx, bz, 0.4, 7, hd, 'toll'); }
      const bt = new THREE.Mesh(GEO.box, mats.basic.clone()); bt.material.color.set(0xe8e8e0); bt.scale.set(0.8, 2.7, 2.4); bt.position.set(bx - ox, 1.35, bz - oz); bt.rotation.y = hd; g.add(bt); tex.push(bt.material);
      const isl = new THREE.Mesh(GEO.box, mats.yellow); isl.scale.set(0.82, 0.35, 14); isl.position.set(bx - ox, 0.18, bz - oz); isl.rotation.y = hd; g.add(isl);
    }
    const t = signTex([name, '하이패스 ▼   통행권 ▼'], '#1e6e3a', 768, 160); tex.push(t);
    const sm = new THREE.MeshStandardMaterial({ map: t }); tex.push(sm);
    for (const sg of [1, -1]) {
      const pl = new THREE.Mesh(GEO.plane, sm); pl.scale.set(2 * hw, 2.2, 1);
      pl.position.set(qq.x + qq.dx * sg * 9.2 - ox, 7.6, qq.z + qq.dz * sg * 9.2 - oz); pl.rotation.y = hd + (sg > 0 ? 0 : Math.PI); g.add(pl);
    }
  }
  // 서울 끝: 회차 안내
  if (CORR.len >= s0 && CORR.len < s1 + 1) {
    const qq = projS(CORR.len - 60);
    if (qq) {
      const t = signTex(META.endSign || ['서울 · 양재 나들목', '서울 시내 도로로 이어져요'], '#1f5fa8', 768, 200); tex.push(t);
      const sm = new THREE.MeshStandardMaterial({ map: t }); tex.push(sm);
      const pl = new THREE.Mesh(GEO.plane, sm); pl.scale.set(18, 4.7, 1); pl.position.set(qq.x - ox, 7.5, qq.z - oz); pl.rotation.y = Math.atan2(qq.dx, qq.dz) + Math.PI; g.add(pl);
    }
  }
  scene.add(g);
  return { k, g, disp, tex };
}
let _cone = null;
const coneGeo = () => _cone || (_cone = new THREE.ConeGeometry(1, 1, 7));
function lowerIdx(s) { let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; } return lo; }
// s 위치의 점과 방향
function projS(s) {
  if (s < 0 || s > CORR.len) return null;
  const i = Math.min(P.length - 2, lowerIdx(s)), a = P[i], b = P[i + 1], L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L };
}
function dropChunk(c) {
  scene.remove(c.g);
  for (const d of c.disp) d.dispose();
  for (const t of c.tex) t.dispose && t.dispose();
  c.g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
}

// 매 프레임: 플레이어 근처 조각을 하나씩 만들고, 먼 조각은 지움
function streamCorridor(px, pz) {
  if (!CORR.on) return;
  const q = corrProj(px, pz);
  let k;
  if (q && q.d < 2500) k = Math.floor(q.s / CH);
  else {
    // 광주 시내: 고속도로 시작점에서 가까우면 첫 조각만
    const d0 = Math.hypot(px - P[0].x, pz - P[0].z);
    if (d0 > 3500) { for (const [kk, c] of chunks) { dropChunk(c); chunks.delete(kk); } return; }
    k = 0;
  }
  for (const [kk, c] of chunks) if (kk < k - DROP || kk > k + DROP) { dropChunk(c); chunks.delete(kk); }
  // 가까운 것부터 한 프레임에 하나
  for (const d of [0, 1, -1, 2, 3, -2]) {
    const kk = k + d;
    if (d < KEEP[0] || d > KEEP[1] || kk < 0 || kk * CH >= CORR.len || chunks.has(kk)) continue;
    const c = buildChunk(kk); if (c) chunks.set(kk, c);
    return;
  }
}
// 출발할 때: 그 자리 조각들을 바로
function buildCorridorNear(px, pz) {
  if (!CORR.on) return;
  for (let t = 0; t < 6; t++) streamCorridor(px, pz);
}
const corridorChunks = () => chunks.size;
// 요금소 · 휴게소 · 나들목을 지도 정보(구역 · 장소 · 출발 위치)에 등록
function registerCorridor() {
  const out = { tolls: [], zones: [], places: [], spawns: {} };
  const pt = (s, lat = 0) => { const q = projS(Math.max(0, Math.min(CORR.len, s))); return { x: q.x - q.dz * lat, z: q.z + q.dx * lat, h: Math.atan2(q.dx, q.dz) }; };
  for (const [sT, name] of H.tolls) {
    const c = pt(sT), hw = hwAt(sT), e = NET.edges[Math.max(0, lowerIdx(sT))] || NET.edges[0];
    const t = { name, kind: 'closed', fee: 0, km: sT / 1000, x: c.x, z: c.z, y: 0, edge: e, s: sT };
    out.tolls.push(t);
    out.zones.push({ type: 'toll', x0: c.x - hw - 6, x1: c.x + hw + 6, z0: c.z - hw - 6, z1: c.z + hw + 6, y: 0, toll: t, r: 8 });
    if (e) e.toll = t;
    out.places.push({ name, x: c.x, z: c.z, r: 40 });
  }
  for (const [sR, name, sd] of H.rest) {
    const dir = sd === 'N' ? 1 : -1, hw = hwAt(sR);
    const g = pt(sR - 120, dir * (hw + 40)), c = pt(sR, dir * (hw + 40));
    out.zones.push({ type: 'fuel', name: name + ' 주유소', x0: g.x - 20, x1: g.x + 20, z0: g.z - 20, z1: g.z + 20 });
    out.zones.push({ type: 'ev', name: name + ' 전기차 충전기', x0: g.x - 20, x1: g.x + 20, z0: g.z - 20, z1: g.z + 20 });
    out.zones.push({ type: 'rest', name: name + (dir > 0 ? ` (${META.toEnd || '서울'} 방향)` : ` (${META.toStart || '광주'} 방향)`), x0: c.x - 120, x1: c.x + 120, z0: c.z - 120, z1: c.z + 120 });
    out.places.push({ name: name + (dir > 0 ? ` (${META.toEnd || '서울'} 방향)` : ` (${META.toStart || '광주'} 방향)`), x: c.x, z: c.z, r: 60, cat: 'rest' });
  }
  for (const [sI, name, kind] of H.ics) { const c = pt(sI); out.places.push({ name: kind === 'JC' ? name : name + ' IC', x: c.x, z: c.z, r: 50, cat: 'hwy' }); }
  const end = pt(CORR.len - 80);
  out.places.push({ name: META.endName || '서울 (양재 나들목)', x: end.x, z: end.z, r: 60 });
  const lane = (s, dir, ln) => { const hw = 1.2 + LANE_W * (ln + 0.5); const p = pt(s, dir * hw); return { x: p.x, z: p.z, heading: dir > 0 ? p.h : p.h + Math.PI }; };
  if (META.spawns) { for (const [key, s0, dir, label] of META.spawns) out.spawns[key] = { ...lane(s0 < 0 ? CORR.len + s0 : s0, dir, 1), label }; return out; }
  out.spawns.hw_gj = { ...lane(300, 1, 1), label: '호남고속도로 · 광주요금소 (서울 방향)' };
  out.spawns.hw_seoultg = { ...lane(257200, 1, 1), label: '경부고속도로 · 서울요금소 앞 (서울 방향)' };
  out.spawns.hw_jeongeup = { ...lane(45000, 1, 1), label: '호남고속도로 · 정읍 (서울 방향)' };
  out.spawns.hw_nonsan = { ...lane(120000, 1, 1), label: '논산천안고속도로 (서울 방향)' };
  out.spawns.hw_cheonan = { ...lane(200000, 1, 1), label: '경부고속도로 · 천안 (서울 방향)' };
  out.spawns.hw_seoul = { ...lane(CORR.len - 400, -1, 1), label: '경부고속도로 · 서울 양재 (광주 방향)' };
  return out;
}

  return Object.assign(self, { CORR, init: initCorridor, proj: corrProj, ground: corrGround, hill: hillH, stream: streamCorridor, buildNear: buildCorridorNear, chunks: corridorChunks, register: registerCorridor, hwAt, projS, get H() { return H; } });
}
// ---------- 여러 고속도로를 한꺼번에 다루는 함수들 ----------
export const CORRS = [];
export const CORR = { get on() { return CORRS.length > 0; }, get len() { return CORRS[0] ? CORRS[0].CORR.len : 0; }, road: (s) => CORRS[0].CORR.road(s) };
export function initCorridor(H, scene, M, net, meta) { const c = makeCorr(CORRS); c.init(H, scene, M, net, meta); CORRS.push(c); c.id = meta && meta.id || 'main'; return c; }
export function corrProj(x, z) { let best = null; for (const c of CORRS) { const q = c.proj(x, z); if (q && (!best || q.d < best.d)) { best = q; best.c = c; } } return best; }
export function corrGround(x, z) {
  let best = null;
  for (const c of CORRS) { const g = c.ground(x, z); if (g.off) continue; const d = g.q ? g.q.d : 0; if (!best || d < best.d) best = { g, d }; }
  return best ? best.g : { h: 400, off: true };
}
export function streamCorridor(px, pz) { for (const c of CORRS) c.stream(px, pz); }
export function buildCorridorNear(px, pz) { for (const c of CORRS) c.buildNear(px, pz); }
export const corridorChunks = () => CORRS.reduce((a, c) => a + c.chunks(), 0);
export function registerCorridor(c = CORRS[0]) { return c.register(); }
