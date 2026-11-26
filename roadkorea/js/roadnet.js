// ===================== 도로망 (임의 각도·곡선 도로) =====================
// gwangju.js 의 실제 좌표 데이터로 교차로·도로·차선 링크를 만들고, 위치 조회 함수를 제공해요.
import { clamp, mulberry, MinHeap } from './util.js';
import { A, P, ROADS, ROAD_TYPES, RAMPS, RIVERS, RAIL, ALLEYS, toXZ, toLL } from './gwangju.js';

export const LANE_W = 3.3;
export const SIDEWALK = 4.0;
export const HWY_Y = 7.2;
const R = mulberry(4242);

export const W = {
  nodes: [], edges: [], links: [], stops: [], routes: [], zones: [], bumps: [], landmarks: [],
  parkingSpots: [], busBays: [], mats: {}, curve: null, signalLamps: [], spawns: {}, buildingMats: [],
  lampHeads: null, tunnelLights: null, mini: { roads: [], water: [], blocks: [], rail: null, rivers: [], lakes: [] }, blockRects: [],
  crossings: [], crossDown: {}, ugSpots: [], cams: [], rivers: [], rail: null, anchorNode: {}, walks: [], lod: [],
};

// ---------- 작은 기하 ----------
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function segInter(a, b, c, d) {
  const r1x = b.x - a.x, r1z = b.z - a.z, r2x = d.x - c.x, r2z = d.z - c.z;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * r2z - (c.z - a.z) * r2x) / den;
  const u = ((c.x - a.x) * r1z - (c.z - a.z) * r1x) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { t, u, x: a.x + r1x * t, z: a.z + r1z * t };
}
function catmull(pts, step) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(k === n ? p2 : { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  return out;
}

// ===================== 실제 지도(오픈스트리트맵)로 도로망 만들기 =====================
// map: { nodes:[[x,z]], ways:[[cls, flags, a, b, [[x,z]...], nameIdx]], names:[] }
// cls 0 고속도로 1 자동차전용·간선 2 주간선 3 보조간선 4 집산 5 골목 / flags 1 다리 2 터널 4 연결로 8 일방통행
const OSM_T = [
  { n: 2, median: 3.0, limit: 100, kind: 'highway', shoulder: 2.4, type: '고속도로', dn: '고속도로' },
  { n: 3, median: 1.6, limit: 80, kind: 'city', shoulder: 1.2, type: '자동차전용·간선도로', dn: '간선도로' },
  { n: 3, median: 1.6, limit: 60, kind: 'city', shoulder: 0.6, type: '주간선도로 (왕복 6차선급)', dn: '대로' },
  { n: 2, median: 0.6, limit: 50, kind: 'city', shoulder: 0.6, type: '보조간선도로 (왕복 4차선급)', dn: '로' },
  { n: 1, median: 0.4, limit: 50, kind: 'city', shoulder: 0.8, type: '집산도로 (왕복 2차선)', dn: '길' },
  { n: 1, median: 0.25, limit: 30, kind: 'alley', shoulder: 0.25, type: '이면도로 · 골목', dn: '골목길' },
];
function ingestOSM(map, reg) {
  const e0 = W.edges.length, n0 = W.nodes.length;
  const base = map.nodes.map(([x, z]) => mkNode(x, z, 0));
  // 일방통행·연결로가 지도 데이터 틈 때문에 막다른 길로 끝나면, 가까운 교차점(30m 이내)에 이어 붙임
  const deg = new Int32Array(base.length);
  for (const w of map.ways) { deg[w[2]]++; deg[w[3]]++; }
  const ng = new Map();
  base.forEach((nd, i) => { const k = Math.floor(nd.x / 30) + ',' + Math.floor(nd.z / 30); let a = ng.get(k); if (!a) ng.set(k, a = []); a.push(i); });
  const remap = new Map();
  for (const w of map.ways) {
    const cls = w[0], fl = w[1];
    if (!((fl & 8) || (fl & 4) || cls <= 1)) continue;
    for (const [end, other] of [[w[2], w[3]], [w[3], w[2]]]) {
      if (deg[end] !== 1 || remap.has(end)) continue;
      const p = base[end]; let bi = -1, bd = 30;
      const gx = Math.floor(p.x / 30), gz = Math.floor(p.z / 30);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of ng.get(gx + i + ',' + (gz + j)) || []) {
        if (m === end || m === other || deg[m] < 1) continue;
        const d = Math.hypot(base[m].x - p.x, base[m].z - p.z); if (d < bd) { bd = d; bi = m; }
      }
      if (bi >= 0) { remap.set(end, bi); deg[bi]++; }
    }
  }
  // 분리 도로(같은 이름의 반대 방향 일방통행 두 줄)의 실제 간격 → 그 사이를 차로로 채움 (실제 대로 폭)
  const wayGap = pairGaps(map, base);
  const roadsAt = new Map();
  for (let wi = 0; wi < map.ways.length; wi++) {
    const w = map.ways[wi];
    const [cls, fl, ia0, ib0, mid, ni] = w;
    const ia = remap.get(ia0) ?? ia0, ib = remap.get(ib0) ?? ib0;
    const T0 = OSM_T[cls];
    const one = (fl & 8) !== 0, ramp = (fl & 4) !== 0;
    const name = ni >= 0 ? map.names[ni] : ramp ? '나들목 연결로' : T0.dn;
    let n = ramp ? 1 : one ? (cls <= 2 ? (cls === 0 ? 2 : 3) : cls === 3 ? 2 : 1) : T0.n;
    const gap = one && !ramp ? wayGap[wi] : 0;
    let sh0 = one ? Math.max(0.6, T0.shoulder) : T0.shoulder;
    if (gap) {
      // 차로 수: 간격을 채우되 가운데 분리대 1m 정도 남김, 최대 6차로
      let ng = Math.min(6, Math.round((gap - 1.6) / LANE_W));
      while (ng > n && gap - (ng * LANE_W + 2 * sh0) < 0.5) ng--;
      if (ng > n) n = ng;
      // 두 길이 겹치지 않게 갓길을 줄여 가운데 방호벽(0.6m) 자리를 남김
      sh0 = Math.min(sh0, Math.max(0.5, (gap - 0.7 - n * LANE_W) / 2));
    }
    const kind = ramp ? 'ic' : cls === 1 && /순환|고속|자동차/.test(name) ? 'highway' : T0.kind;
    const r = {
      name, n, median: one ? -n * LANE_W : T0.median, limit: ramp ? 50 : cls === 1 && kind === 'highway' ? 80 : T0.limit, kind, shoulder: sh0, gap,
      type: (one ? '일방통행 · ' : '') + (ramp ? '나들목 연결로' : T0.type), bus: cls === 2 && !one, osm: cls, oneway: one, bridge: !!(fl & 1), tunnel: !!(fl & 2),
    };
    const pts = [base[ia], ...mid.map(([x, z]) => mkNode(x, z, 0)), base[ib]];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (a === b || Math.hypot(a.x - b.x, a.z - b.z) < 1) continue;
      const e = makeEdge(a, b, r);
      e.oneway = r.oneway; e.bridge = r.bridge; e.tunnel = r.tunnel; e.osm = cls; e.gap = r.gap || 0; e.layer = ((fl >> 4) & 7) - 2; e.wr = r; e.named = ni >= 0;
    }
  }
  const NE = W.edges.slice(e0);
  for (const e of NE) { e.reg = reg; if (!e.a.inW) { e.a.inW = 1; W.nodes.push(e.a); } if (!e.b.inW) { e.b.inW = 1; W.nodes.push(e.b); } }
  const NN = W.nodes.slice(n0);
  W.nodes.forEach((nd, i) => (nd.idx = i));
  inheritTrunkNames(NE);
  const hts = assignHeightsOSM(NN, NE);
  for (const nd of NN) setupNode(nd);
  // 가까운 신호 교차로(분리 도로가 만나는 큰 교차로)는 같은 신호 주기를 씀
  const sg = new Map();
  for (const nd of NN) if (nd.signal) { const k = Math.floor(nd.x / 45) + ',' + Math.floor(nd.z / 45); if (!sg.has(k)) sg.set(k, []); sg.get(k).push(nd); }
  const done = new Set();
  for (const nd of NN) {
    if (!nd.signal || done.has(nd)) continue;
    const gx = Math.floor(nd.x / 45), gz = Math.floor(nd.z / 45);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of sg.get(gx + i + ',' + (gz + j)) || []) {
      if (done.has(m) || Math.hypot(m.x - nd.x, m.z - nd.z) > 60) continue;
      done.add(m); m.offset = nd.offset; m.dur = nd.dur; m.total = nd.total; m.refAng = nd.refAng;
    }
  }
  for (const e of NE) makeLinks(e);
  for (const nd of NN) { nd.ext.x = nd.ext.z = nd.r; }
  return { nodes: NN, edges: NE, ...hts };
}
// 분리 도로 간격: 일방통행 길(큰길)마다 같은 이름의 반대 방향 길까지 옆 거리(가운데 값)
function pairGaps(map, base) {
  const gaps = new Float32Array(map.ways.length);
  const segs = [], grid = new Map(), G = 60;
  const P = (i) => base[i];
  map.ways.forEach((w, wi) => {
    const [cls, fl, ia, ib, mid, ni] = w;
    if (!(fl & 8) || (fl & 4) || cls > 3 || ni < 0) return;
    const pts = [[P(ia).x, P(ia).z], ...mid, [P(ib).x, P(ib).z]];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 4) continue;
      const sg = { wi, ni, ax: a[0], az: a[1], ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, L };
      segs.push(sg);
      const key = Math.floor((a[0] + b[0]) / 2 / G) + ',' + Math.floor((a[1] + b[1]) / 2 / G);
      let arr = grid.get(key); if (!arr) grid.set(key, arr = []); arr.push(sg);
    }
  });
  const per = new Map();
  for (const sg of segs) {
    if (sg.L < 12) continue;
    const mx = sg.ax + sg.ux * sg.L / 2, mz = sg.az + sg.uz * sg.L / 2;
    const gx = Math.floor(mx / G), gz = Math.floor(mz / G);
    let best = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of grid.get(gx + i + ',' + (gz + j)) || []) {
      if (t.ni !== sg.ni || t.wi === sg.wi) continue;
      if (t.ux * sg.ux + t.uz * sg.uz > -0.9) continue;
      const px = mx - t.ax, pz = mz - t.az, al = px * t.ux + pz * t.uz;
      if (al < -2 || al > t.L + 2) continue;
      const lat = Math.abs(px * t.uz - pz * t.ux);
      if (lat < best) best = lat;
    }
    if (best >= 7 && best <= 30) { let a = per.get(sg.wi); if (!a) per.set(sg.wi, a = []); a.push(best); }
  }
  for (const [wi, a] of per) { a.sort((p, q) => p - q); gaps[wi] = a[Math.floor(a.length / 2)]; }
  return gaps;
}
// 다른 지역(서울 등) 실제 지도를 도로망에 덧붙임
export function appendNetworkOSM(map, reg) {
  const r = ingestOSM(map, reg);
  for (const e of r.edges) addEdgeToGrid(e);
  return r;
}
export function buildNetworkOSM(map) {
  const hts = ingestOSM(map, 'gwangju');
  W.mtnTunnels = hts.mtn; W.underpasses = hts.under; W.overpasses = hts.over;
  // 기준점(옛 지도 이름) → 가장 가까운 실제 교차로
  const pool = W.nodes.filter((nd) => nd.edges.length >= 3 && nd.edges.some((e) => e.osm <= 4 && e.kind === 'city' && !e.bridge && !e.tunnel) && !nd.edges.some((e) => e.kind === 'ic' || e.kind === 'highway'));
  const hwyPool = W.nodes.filter((nd) => nd.edges.some((e) => e.osm === 0));
  // 큰길 교차로를 우선 (작은 길일수록 거리 벌점)
  const PEN = [0, 0, 0, 25, 60, 140];
  const rank = (nd) => { let m = 9; for (const e of nd.edges) if (e.osm < m) m = e.osm; return PEN[Math.min(5, m)] || 0; };
  const near = (list, x, z, pen) => { let b = null, bd = 1e18; for (const nd of list) { const d = Math.hypot(nd.x - x, nd.z - z) + (pen ? rank(nd) : 0); if (d < bd) { bd = d; b = nd; } } return b; };
  W.anchorNode = {};
  for (const k in A) {
    const p = toXZ(A[k][0], A[k][1]);
    W.anchorNode[k] = near(pool, p.x, p.z, true);
    if (hwyPool.length) W.anchorNode[k + '@hi'] = near(hwyPool, p.x, p.z);
  }
  W.osm = true;
  buildEdgeGrid();
  buildRail();
  return W;
}

// 이름 없는 자동차전용도로(분리 도로 한쪽)는 나란히 가는 이름 있는 도로 이름을 물려받음
function inheritTrunkNames(EDGES) {
  const C = 60, grid = new Map();
  for (const e of EDGES) {
    if (!(e.osm <= 1 && e.named)) continue;
    const k = Math.floor((e.a.x + e.b.x) / 2 / C) * 100003 + Math.floor((e.a.z + e.b.z) / 2 / C);
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e);
  }
  const ways = new Map();
  for (const e of EDGES) if (e.osm <= 1 && !e.named && !e.ramp) { let a = ways.get(e.wr); if (!a) ways.set(e.wr, a = []); a.push(e); }
  for (const [r, es] of ways) {
    const votes = new Map();
    for (const e of es) {
      const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2, gi = Math.floor(mx / C), gj = Math.floor(mz / C);
      let best = null, bd = 60;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get((gi + i) * 100003 + gj + j) || []) {
        if (Math.abs(Math.cos(o.heading - e.heading)) < 0.9) continue;
        const d = segDist(mx, mz, o.a.x, o.a.z, o.b.x, o.b.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) votes.set(best.wr, (votes.get(best.wr) || 0) + e.len);
    }
    let src = null, bv = 0; for (const [w, v] of votes) if (v > bv) { bv = v; src = w; }
    if (!src || bv < 0.4 * es.reduce((a, e) => a + e.len, 0)) continue;
    for (const e of es) { e.name = e.road = src.name; e.kind = src.kind; e.limit = src.limit; e.type = src.type; e.a.roads.add(src.name); e.b.roads.add(src.name); }
  }
}

// ---------- 실제 지도 높이: 입체교차(다리)는 올리고, 지하차도는 내리고, 산 터널은 표시 ----------
// 오픈스트리트맵은 다리·터널 구간만 표시되고 접근로(성토·절토)는 평범한 도로라서,
// 다리/터널 묶음에서 높이를 정하고 양쪽 길로 경사(고속 5%, 일반 7%)를 따라 퍼뜨림.
function assignHeightsOSM(NODES, E) {
  const C = 50, grid = new Map();
  NODES.forEach((n, i) => (n.hi = i));
  const cellKey = (i, j) => i * 100003 + j;
  for (const e of E) {
    for (let i = Math.floor(Math.min(e.a.x, e.b.x) / C); i <= Math.floor(Math.max(e.a.x, e.b.x) / C); i++)
      for (let j = Math.floor(Math.min(e.a.z, e.b.z) / C); j <= Math.floor(Math.max(e.a.z, e.b.z) / C); j++) {
        const k = cellKey(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e);
      }
  }
  const crosses = (e, skip) => {
    for (let i = Math.floor(Math.min(e.a.x, e.b.x) / C); i <= Math.floor(Math.max(e.a.x, e.b.x) / C); i++)
      for (let j = Math.floor(Math.min(e.a.z, e.b.z) / C); j <= Math.floor(Math.max(e.a.z, e.b.z) / C); j++)
        for (const o of grid.get(cellKey(i, j)) || []) {
          if (o === e || skip(o)) continue;
          if (o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
          if (segInter(e.a, e.b, o.a, o.b)) return o;
        }
    return null;
  };
  // 골목의 작은 다리·굴다리는 그냥 땅 높이로
  for (const e of E) if (e.osm >= 5) { e.bridge = false; e.tunnel = false; }
  const chains = (flag) => {
    const seen = new Set(), out = [];
    for (const e0 of E) {
      if (!e0[flag] || seen.has(e0)) continue;
      const ch = [e0]; seen.add(e0);
      for (let q = 0; q < ch.length; q++) for (const n of [ch[q].a, ch[q].b]) for (const o of n.edges) if (o[flag] && !seen.has(o)) { seen.add(o); ch.push(o); }
      out.push(ch);
    }
    return out;
  };
  const N = NODES.length, up = new Float32Array(N), dn = new Float32Array(N), inCh = new Uint8Array(N);
  const OUT = { mtn: [], under: [], over: [] };
  // 다리 묶음마다 층: 오픈스트리트맵 layer 값, 같은 층 다리끼리 엇갈리면 연결로(또는 짧은 쪽)를 한 층 위로
  const bch = chains('bridge');
  bch.forEach((ch, i) => { ch.lv = Math.max(1, Math.min(3, Math.max(...ch.map((e) => e.layer || 1)))); for (const e of ch) e.bch = i; });
  const chLen = (ch) => ch.reduce((a, e) => a + e.len, 0);
  for (let it = 0; it < 3; it++) {
    let changed = false;
    for (const ch of bch) for (const e of ch) {
      const o = crosses(e, (x) => !x.bridge || x.bch === e.bch || bch[x.bch].lv !== ch.lv);
      if (!o) continue;
      const other = bch[o.bch];
      const icA = ch.some((x) => x.kind === 'ic'), icB = other.some((x) => x.kind === 'ic');
      const up2 = icA !== icB ? (icA ? ch : other) : chLen(ch) <= chLen(other) ? ch : other;
      if (up2.lv < 3) { up2.lv++; changed = true; }
    }
    if (!changed) break;
  }
  for (const ch of bch) {
    let cross = null;
    for (const e of ch) { cross = crosses(e, (o) => o.bridge && bch[o.bch].lv >= ch.lv); if (cross) break; }
    if (!cross) continue;
    const H = ch.lv * (ch.some((e) => e.kind === 'highway' || e.kind === 'ic') ? HWY_Y + 0.3 : HWY_Y);
    for (const e of ch) for (const n of [e.a, e.b]) { up[n.hi] = Math.max(up[n.hi], H); inCh[n.hi] = 1; }
    OUT.over.push(ch);
  }
  for (const ch of chains('tunnel')) {
    let cross = null; for (const e of ch) { cross = crosses(e, (o) => o.tunnel); if (cross) break; }
    const len = ch.reduce((a, e) => a + e.len, 0);
    if (!cross) { if (len > 120) { OUT.mtn.push(ch); for (const e of ch) e.mtn = true; } continue; }
    for (const e of ch) for (const n of [e.a, e.b]) { dn[n.hi] = Math.max(dn[n.hi], 6.8); inCh[n.hi] = 1; }
    OUT.under.push(ch);
  }
  // 평면 교차로(시내 도로가 3갈래 이상 만나는 곳)는 땅 높이에 고정
  const pinned = (n) => !inCh[n.hi] && n.edges.length >= 3 && n.edges.some((e) => e.kind === 'city' || e.kind === 'alley');
  const spread = (val) => {
    const hp = new MinHeap();
    for (let i = 0; i < N; i++) if (val[i] > 0) hp.push(-val[i], NODES[i]);
    while (hp.size) {
      const n = hp.pop(), v = -hp.topKey;
      if (v < val[n.hi] - 1e-6) continue;
      for (const e of n.edges) {
        const m = e.a === n ? e.b : e.a;
        if (pinned(m)) continue;
        const slope = e.kind === 'highway' || e.kind === 'ic' ? 0.05 : 0.07;
        const nv = v - slope * e.len;
        if (nv > val[m.hi] + 0.01) { val[m.hi] = nv; hp.push(-nv, m); }
      }
    }
  };
  spread(up); spread(dn);
  for (const n of NODES) { const u = up[n.hi], d = dn[n.hi]; n.y = u >= d ? (u > 0.3 ? u : 0) : (d > 0.3 ? -d : 0); }
  for (const e of E) {
    e.ya = e.a.y; e.yb = e.b.y;
    const mag = Math.max(Math.abs(e.ya), Math.abs(e.yb)), lo = Math.min(Math.abs(e.ya), Math.abs(e.yb));
    e.elevated = mag > 0.3;
    e.ramp = e.elevated && lo < 1.0;
    e.sunken = e.elevated && Math.min(e.ya, e.yb) < -0.3;
  }
  return OUT;
}

// ---------- 광주 → 서울 고속도로 (gjhwy.js 선형) ----------
// 상행선(서울 방향) 선형을 중심선으로 왕복 도로 하나로 만들고, 광주 쪽 호남고속도로 끝(지도 경계)에 이어 붙임
function refreshNodeLinks(n) {
  setupNode(n);
  for (const e of n.edges) {
    let ca = e.a.clear.get(e) || 0, cb = e.b.clear.get(e) || 0;
    if (ca + cb > e.len - 2) { const k = (e.len - 2) / (ca + cb); ca *= k; cb *= k; }
    e.ca = ca; e.cb = cb;
    for (const L of [e.fwd, e.bwd]) {
      if (!L) continue;
      const fwd = L === e.fwd;
      L.s0 = fwd ? ca : cb; L.s1 = e.len - (fwd ? cb : ca);
      L.stopS = L.to.signal ? L.s1 - 5.5 : L.s1 - 0.5;
      L.axis = groupOf(L.to, L.heading);
    }
  }
}
// 고속도로 끝을 그 지역(서울 · 대전 …) 지도의 고속도로 상행 시작 / 하행 끝에 이어 붙임 (지역을 불러온 뒤에 다시 불러도 됨)
export function joinCorridorEnd(C) {
  if (!C || C.joined) return false;
  const nE = C.nodes[C.nodes.length - 1], reg = C.endRegion;
  const linkOne = (a, b, like) => {
    const r = { name: like.name, n: like.n, median: like.median, limit: like.limit, kind: 'highway', shoulder: like.shoulder, type: like.type, bus: false };
    const e = makeEdge(a, b, r); e.oneway = true; e.osm = 0; e.corr = true; e.cs = -1; e.layer = 0;
    makeLinks(e); refreshNodeLinks(a); refreshNodeLinks(b); addEdgeToGrid(e);
    return e;
  };
  let ns = null, ss = null, dA = 500, dB = 500;
  for (const L of W.links) {
    const e = L.edge;
    if (e.corr || e.reg !== reg || e.kind !== 'highway' || !e.oneway) continue;
    const noIn = !L.from.inc.some((o) => o.edge.kind === 'highway' && Math.abs(o.heading - L.heading) < 0.6);
    const fwdOk = L.dir.x * (L.from.x - nE.x) + L.dir.z * (L.from.z - nE.z) > 0;
    if (noIn && fwdOk) { const d = Math.hypot(L.from.x - nE.x, L.from.z - nE.z); if (d < dA) { dA = d; ns = L; } }
    const noOut = !L.to.out.some((o) => o.edge.kind === 'highway' && Math.abs(o.heading - L.heading) < 0.6);
    const backOk = L.dir.x * (nE.x - L.to.x) + L.dir.z * (nE.z - L.to.z) > 0;
    if (noOut && backOk) { const d = Math.hypot(L.to.x - nE.x, L.to.z - nE.z); if (d < dB) { dB = d; ss = L; } }
  }
  // 고속도로 이음점에는 신호등 없음
  nE.noSignal = true; if (ns) ns.from.noSignal = true; if (ss) ss.to.noSignal = true;
  if (ns) linkOne(nE, ns.from, ns.edge);
  if (ss) linkOne(ss.to, nE, ss.edge);
  refreshNodeLinks(nE);
  if (ns) refreshNodeLinks(ns.from);
  if (ss) refreshNodeLinks(ss.to);
  if ((!ns && !ss) || C.H.cityJoin) {
    // 도시 쪽에 고속도로 끝이 없을 때(부산 사상 등) 또는 끝이 시내로 안 이어질 때(대구 성서): 가까운 큰길 교차점에 왕복 도로로 이음
    let best = null, bd = 700, like = null; const hw = !!(ns || ss);
    for (const e of W.edges) {
      if (e.corr || e.reg !== reg || e.n < 2 || (hw && e.kind === 'highway')) continue;
      for (const n of [e.a, e.b]) { const d = Math.hypot(n.x - nE.x, n.z - nE.z); if (d < bd) { bd = d; best = n; like = e; } }
    }
    if (best) {
      const r = { name: C.H.segs[C.H.segs.length - 1][2], n: 2, median: 1.2, limit: 60, kind: like.kind, shoulder: like.shoulder, type: like.type, bus: false };
      const e = makeEdge(nE, best, r); e.oneway = false; e.osm = 0; e.corr = true; e.cs = -1; e.layer = 0;
      makeLinks(e); refreshNodeLinks(nE); refreshNodeLinks(best); addEdgeToGrid(e);
      C.joined = true; C.cityJ = Math.round(bd); if (!hw) { C.seoulN = C.seoulS = Math.round(bd); return true; }
    }
  }
  C.joined = !!(ns || ss);
  C.seoulN = ns ? Math.round(dA) : false; C.seoulS = ss ? Math.round(dB) : false;
  return C.joined;
}

export function addCorridorNetwork(H, opts = {}) {
  const pts = H.pts, nodes = pts.map(([x, z]) => mkNode(x, z, 0));
  // 시작점이 광주 지도의 호남고속도로 끝 교차점과 같으면 그 점을 그대로 씀
  { let best = null, bd = 3; for (const n of W.nodes) { const d = Math.hypot(n.x - pts[0][0], n.z - pts[0][1]); if (d < bd) { bd = d; best = n; } } if (best) nodes[0] = best; }
  const segOf = (s) => H.segs.find((g) => s >= g[0] && s < g[1]) || H.segs[H.segs.length - 1];
  const rC = new Map();
  const edges = [];
  let s = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.5) { nodes[i + 1] = a; continue; }
    const g = segOf(s + L / 2);
    let r = rC.get(g[2]);
    if (!r) { r = { name: g[2], n: g[3], median: 2.4, limit: g[4], kind: 'highway', shoulder: 2.8, type: `고속도로 (왕복 ${g[3] * 2}차로)`, bus: false }; rC.set(g[2], r); }
    const e = makeEdge(a, b, r);
    e.corr = true; e.cs = s; e.osm = 0; e.oneway = false; e.layer = 0;
    e.mtn = H.tunnels.some(([t0, t1]) => s + L / 2 >= t0 && s + L / 2 <= t1); e.tunnel = e.mtn;
    edges.push(e); s += L;
  }
  for (const n of nodes) { if (!n.edges.length || n.inW) continue; n.inW = 1; n.idx = W.nodes.length; W.nodes.push(n); setupNode(n); }
  if (nodes[0].inW) refreshNodeLinks(nodes[0]);
  for (const e of edges) makeLinks(e);
  // 광주 쪽 연결: 호남고속도로 상행(북쪽) 막다른 끝 → 시작점, 시작점 → 하행 시작
  const n0 = nodes[0];
  if (opts.branch) n0.noSignal = true;
  // 지도 경계에서 잘린 호남고속도로 상행 끝 / 하행 시작 (가장 가까운 끝점)
  let nb = null, sb = null, dN = 3000, dS = 3000;
  for (const L of W.links) {
    const e = L.edge;
    if (e.corr || e.osm !== 0 || e.kind !== 'highway' || !e.oneway) continue;
    const dirOk = L.dir.x * (n0.x - L.to.x) + L.dir.z * (n0.z - L.to.z) > 0;   // 진행 방향 앞쪽에 시작점
    const noOn = !L.to.out.some((o) => o.edge.kind === 'highway' && Math.abs(o.heading - L.heading) < 0.6);
    if (dirOk && noOn) { const d = Math.hypot(L.to.x - n0.x, L.to.z - n0.z); if (d < dN) { dN = d; nb = L; } }
    const back = L.dir.x * (L.from.x - n0.x) + L.dir.z * (L.from.z - n0.z) > 0;  // 시작점에서 나오는 방향 (시작점 → 링크 시작 → 앞으로)
    const noIn = !L.from.inc.some((o) => o.edge.kind === 'highway' && Math.abs(o.heading - L.heading) < 0.6);
    if (back && noIn) { const d = Math.hypot(L.from.x - n0.x, L.from.z - n0.z); if (d < dS) { dS = d; sb = L; } }
  }
  const linkOne = (a, b, like) => {
    const r = { name: like.name, n: like.n, median: like.median, limit: like.limit, kind: 'highway', shoulder: like.shoulder, type: like.type, bus: false };
    const e = makeEdge(a, b, r); e.oneway = true; e.osm = 0; e.corr = true; e.cs = -1; e.layer = 0;
    makeLinks(e); refreshNodeLinks(a); refreshNodeLinks(b); addEdgeToGrid(e);
    return e;
  };
  if (opts.branch || n0.out.some((L) => !L.edge.corr)) { nb = sb = null; } // 이미 도로망 점에서 시작 → 따로 이을 필요 없음
  if (nb && sb && nb.to === sb.from) {
    // 상행 끝과 하행 시작이 한 점(지도 경계에서 돌아 나가던 곳) → 왕복 도로 하나로 이음
    const r = { name: '호남고속도로', n: 2, median: 2.4, limit: 100, kind: 'highway', shoulder: 2.8, type: '고속도로 (왕복 4차로)', bus: false };
    const e = makeEdge(nb.to, n0, r); e.oneway = false; e.osm = 0; e.corr = true; e.cs = -1; e.layer = 0;
    makeLinks(e); refreshNodeLinks(nb.to); addEdgeToGrid(e);
  } else {
    n0.noSignal = true;
    if (nb) linkOne(nb.to, n0, nb.edge);
    if (sb) linkOne(n0, sb.from, sb.edge);
  }
  refreshNodeLinks(n0);
  for (const e of edges) addEdgeToGrid(e);
  const C = { H, nodes, edges, len: s, joinedN: nb ? Math.round(dN) : false, joinedS: sb ? Math.round(dS) : false };
  if (!opts.branch && !opts.side) W.corridor = C;
  (W.corridors || (W.corridors = [])).push(C);
  if (opts.endRegion) { C.endRegion = opts.endRegion; joinCorridorEnd(C); }
  return C;
  return W.corridor;
}

// ---------- 노드 ----------
let NID = 0;
function mkNode(x, z, y = 0, anchor = null) {
  return { id: NID++, x, z, y, anchor, edges: [], out: [], inc: [], ext: { x: 4, z: 4 }, r: 4, signal: false, dur: null, total: 1, offset: 0, rep: null, roads: new Set() };
}
const find = (n) => { while (n.rep) n = n.rep; return n; };
function union(a, b) { a = find(a); b = find(b); if (a === b) return a; if (b.anchor && !a.anchor) [a, b] = [b, a]; b.rep = a; return a; }

// ---------- 도로망 생성 ----------
export function buildNetwork(extraRoads = []) {
  const anchorNode = {};
  const getAnchor = (name, y) => {
    const key = name + (y ? '@hi' : '');
    if (!anchorNode[key]) { const p = toXZ(...P(name)); anchorNode[key] = mkNode(p.x, p.z, y, name); }
    return anchorNode[key];
  };
  const roads = [];
  for (const r0 of [...ROADS, ...genAlleys(), ...extraRoads]) {
    const T = ROAD_TYPES[r0.t];
    const y = T.elevated ? HWY_Y : 0;
    let pts = r0.path.map((p) => (typeof p === 'string' ? getAnchor(p, y) : (() => { const q = toXZ(p[0], p[1]); return mkNode(q.x, q.z, y); })()));
    if (T.curvy) {
      const sm = catmull(pts, 22);
      const out = [];
      for (const q of sm) out.push(pts.includes(q) ? q : mkNode(q.x, q.z, y));
      pts = out;
    }
    roads.push({ ...T, name: r0.name, t: r0.t, nodes: pts, level: T.elevated ? 'hi' : 'lo', gen: !!r0.gen });
  }
  // 1) 끝점 T자 연결: 다른 도로 선분 위로 끝점을 붙임
  const segsOf = () => {
    const segs = [];
    roads.forEach((r, ri) => { for (let k = 0; k < r.nodes.length - 1; k++) segs.push({ r, ri, k, a: r.nodes[k], b: r.nodes[k + 1], ins: [] }); });
    return segs;
  };
  let segs = segsOf();
  const SNAP = 26;
  for (const r of roads) {
    for (const endI of [0, r.nodes.length - 1]) {
      const n = find(r.nodes[endI]);
      // 다른 도로가 이미 같은 기준점을 쓰면 그대로
      if (n.anchor && roads.some((o) => o !== r && o.level === r.level && o.nodes.some((m) => find(m) === n))) continue;
      let best = null, bd = SNAP;
      for (const s of segs) {
        if (s.r === r || s.r.level !== r.level) continue;
        const a = find(s.a), b = find(s.b);
        const d = segDist(n.x, n.z, a.x, a.z, b.x, b.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) continue;
      const a = find(best.a), b = find(best.b);
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = clamp(((n.x - a.x) * dx + (n.z - a.z) * dz) / l2, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (Math.hypot(px - a.x, pz - a.z) < 10) union(a, n);
      else if (Math.hypot(px - b.x, pz - b.z) < 10) union(b, n);
      else { n.x = px; n.z = pz; best.ins.push({ t, n }); }
    }
  }
  for (const s of segs) applyIns(s);
  // 2) 교차점
  segs = segsOf();
  const CELL = 260, grid = new Map();
  segs.forEach((s, i) => {
    const a = find(s.a), b = find(s.b);
    for (let gx = Math.floor(Math.min(a.x, b.x) / CELL); gx <= Math.floor(Math.max(a.x, b.x) / CELL); gx++)
      for (let gz = Math.floor(Math.min(a.z, b.z) / CELL); gz <= Math.floor(Math.max(a.z, b.z) / CELL); gz++) {
        const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
  });
  const seen = new Set();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const s1 = segs[list[i]], s2 = segs[list[j]];
      if (s1.r.level !== s2.r.level) continue;
      if (s1.r === s2.r && Math.abs(s1.k - s2.k) <= 1) continue;
      const key = Math.min(list[i], list[j]) + ':' + Math.max(list[i], list[j]);
      if (seen.has(key)) continue; seen.add(key);
      const a = find(s1.a), b = find(s1.b), c = find(s2.a), d = find(s2.b);
      if (a === c || a === d || b === c || b === d) continue;
      const X = segInter(a, b, c, d);
      if (!X) continue;
      const near = (n) => Math.hypot(n.x - X.x, n.z - X.z) < 9;
      let n = [a, b, c, d].find(near);
      if (!n) n = mkNode(X.x, X.z, a.y);
      if (n !== a && n !== b) s1.ins.push({ t: X.t, n });
      if (n !== c && n !== d) s2.ins.push({ t: X.u, n });
    }
  }
  for (const s of segs) applyIns(s);
  function applyIns(s) {
    if (!s.ins.length) return;
    s.ins.sort((p, q) => p.t - q.t);
    const r = s.r, idx = r.nodes.indexOf(s.b, s.k);
    const at = idx >= 0 ? idx : s.k + 1;
    r.nodes.splice(at, 0, ...s.ins.map((x) => x.n));
    s.ins = [];
  }
  // 3) 가까운 노드 합치기
  const all = new Set();
  for (const r of roads) for (const n of r.nodes) all.add(find(n));
  const arr = [...all];
  const g2 = new Map();
  for (const n of arr) { const k = Math.floor(n.x / 12) + ',' + Math.floor(n.z / 12) + ',' + (n.y > 1 ? 1 : 0); if (!g2.has(k)) g2.set(k, []); g2.get(k).push(n); }
  for (const n of arr) {
    const gx = Math.floor(n.x / 12), gz = Math.floor(n.z / 12), lv = n.y > 1 ? 1 : 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of g2.get(gx + i + ',' + (gz + j) + ',' + lv) || []) {
      if (m === n || find(m) === find(n)) continue;
      if (Math.hypot(m.x - n.x, m.z - n.z) < 7) union(n, m);
    }
  }
  // 4) 엣지
  const edgeKey = new Set();
  for (const r of roads) {
    const ns = [];
    for (const n of r.nodes) { const f = find(n); if (ns[ns.length - 1] !== f) ns.push(f); }
    r.nodes = ns;
    for (let k = 0; k < ns.length - 1; k++) {
      const a = ns[k], b = ns[k + 1];
      if (a === b || Math.hypot(a.x - b.x, a.z - b.z) < 1.5) continue;
      const key = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
      if (edgeKey.has(key)) continue; edgeKey.add(key);
      makeEdge(a, b, r);
    }
  }
  // 나들목 연결로
  for (const [hi, lo] of RAMPS) {
    const a = anchorNode[hi + '@hi'], b = anchorNode[lo];
    if (!a || !b) continue;
    makeEdge(find(b), find(a), { ...ROAD_TYPES.ramp, name: `${hi.replace(/JC|IC/, '')} 나들목`, t: 'ramp' });
  }
  W.anchorNode = {};
  for (const k in anchorNode) W.anchorNode[k] = find(anchorNode[k]);
  // 5) 노드 정리
  for (const e of W.edges) { if (!W.nodes.includes(e.a)) W.nodes.push(e.a); if (!W.nodes.includes(e.b)) W.nodes.push(e.b); }
  W.nodes.forEach((n, i) => (n.idx = i));
  for (const n of W.nodes) setupNode(n);
  for (const e of W.edges) makeLinks(e);
  for (const n of W.nodes) { n.ext.x = n.ext.z = n.r; }
  buildEdgeGrid();
  buildRail();
  return W;
}

// 골목 격자 생성 (다각형 안을 두 방향 평행선으로 채움)
function genAlleys() {
  const out = [];
  for (const al of ALLEYS) {
    const poly = al.poly.map((p) => toXZ(p[0], p[1]));
    const a = toXZ(...P(al.along[0])), b = toXZ(...P(al.along[1]));
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    let k = 1;
    for (const th of [ang, ang + Math.PI / 2]) {
      const d = { x: Math.sin(th), z: Math.cos(th) }, nrm = { x: -d.z, z: d.x };
      const offs = poly.map((p) => p.x * nrm.x + p.z * nrm.z);
      const lo = Math.min(...offs), hi = Math.max(...offs);
      for (let o = lo + al.spacing * 0.6; o < hi - al.spacing * 0.4; o += al.spacing) {
        // 직선 o 와 다각형 교차
        const ts = [];
        for (let i = 0; i < poly.length; i++) {
          const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
          const f1 = p1.x * nrm.x + p1.z * nrm.z - o, f2 = p2.x * nrm.x + p2.z * nrm.z - o;
          if ((f1 < 0) === (f2 < 0)) continue;
          const t = f1 / (f1 - f2);
          const q = { x: p1.x + (p2.x - p1.x) * t, z: p1.z + (p2.z - p1.z) * t };
          ts.push(q.x * d.x + q.z * d.z);
        }
        if (ts.length < 2) continue;
        const t0 = Math.min(...ts), t1 = Math.max(...ts);
        if (t1 - t0 < 40) continue;
        const pt = (t) => { const x = nrm.x * o + d.x * t, z = nrm.z * o + d.z * t; const ll = toLLlocal(x, z); return [ll.lat, ll.lon]; };
        out.push({ name: `${al.prefix}${k}길`, t: 'alley', path: [pt(t0), pt(t1)], gen: true });
        k++;
      }
    }
  }
  return out;
}
function toLLlocal(x, z) { return toLL(x, z); }

function makeEdge(a, b, r) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const e = {
    id: W.edges.length, a, b, road: r.name, name: r.name, kind: r.kind, n: r.n, median: r.median, bus: !!r.bus, limit: r.limit, type: r.type || '',
    shoulder: r.shoulder ?? 0.6, dashedCenter: !!r.dashedCenter, elevated: !!r.elevated, ramp: !!r.ramp, t: r.t, gen: !!r.gen,
    dir: { x: dx / len, z: dz / len }, len, heading: Math.atan2(dx, dz), ya: a.y, yb: b.y,
  };
  e.hw = e.median / 2 + e.n * LANE_W + e.shoulder;
  e.axis = Math.abs(e.dir.z) >= Math.abs(e.dir.x) ? 'z' : 'x';
  W.edges.push(e); a.edges.push(e); b.edges.push(e);
  a.roads.add(r.name); b.roads.add(r.name);
  return e;
}

// 노드: 교차 각도에 따라 각 도로가 시작되는 거리(여유 거리) 계산, 신호 여부
function setupNode(n) {
  const items = n.edges.map((e) => {
    const out = e.a === n ? e.dir : { x: -e.dir.x, z: -e.dir.z };
    return { e, out, ang: Math.atan2(out.x, out.z) };
  }).sort((p, q) => p.ang - q.ang);
  n.items = items;
  n.clear = new Map();
  const deg = items.length;
  for (let i = 0; i < deg; i++) {
    const it = items[i];
    let c = 0;
    if (deg >= 2) {
      for (const j of [(i + 1) % deg, (i - 1 + deg) % deg]) {
        if (j === i) continue;
        const o = items[j];
        const cos = it.out.x * o.out.x + it.out.z * o.out.z;
        const th = Math.acos(clamp(cos, -1, 1));
        const sin = Math.sin(th);
        if (sin < 0.12) { c = Math.max(c, cos > 0 ? Math.max(it.e.hw, o.e.hw) * 3 : 0.5); continue; }
        c = Math.max(c, (o.e.hw + it.e.hw * Math.max(cos, -0.95)) / sin);
      }
    }
    if (deg >= 3) c = Math.max(c, Math.max(...items.filter((x) => x !== it).map((x) => x.e.hw)) * 0.6);
    n.clear.set(it.e, clamp(c, deg >= 3 ? 4 : 0.3, 48));
  }
  n.r = Math.max(4, ...[...n.clear.values()], ...n.edges.map((e) => e.hw));
  const main = n.edges.filter((e) => e.kind !== 'alley' && e.kind !== 'ic');
  n.signal = n.y < 1 && deg >= 3 && main.length >= 3 && !n.noSignal && !n.edges.some((e) => e.osm === 0 || e.kind === 'highway');
  n.dur = [20, 3, 8, 3, 20, 3, 8, 3];
  if (main.some((e) => e.n >= 4)) n.dur = [26, 3, 9, 3, 18, 3, 7, 3];
  n.total = n.dur.reduce((a, b) => a + b, 0);
  n.offset = R() * n.total;
  // 신호 그룹: 기준 도로와 비슷한 방향이면 'z', 아니면 'x'
  const ref = (main[0] || n.edges[0]);
  n.refAng = ref ? ref.heading : 0;
}
const groupOf = (n, heading) => {
  let d = Math.abs(((heading - n.refAng) % Math.PI + Math.PI) % Math.PI);
  if (d > Math.PI / 2) d = Math.PI - d;
  return d < Math.PI / 4 ? 'z' : 'x';
};

function makeLinks(e) {
  // 짧은 구간: 두 교차로 여유 거리가 겹치면 줄임
  let ca = e.a.clear.get(e) || 0, cb = e.b.clear.get(e) || 0;
  if (ca + cb > e.len - 2) { const k = (e.len - 2) / (ca + cb); ca *= k; cb *= k; }
  e.ca = ca; e.cb = cb;
  const pair = [];
  for (const [from, to, fwd] of (e.oneway ? [[e.a, e.b, true]] : [[e.a, e.b, true], [e.b, e.a, false]])) {
    const dx = fwd ? e.dir.x : -e.dir.x, dz = fwd ? e.dir.z : -e.dir.z;
    const L = {
      id: W.links.length, edge: e, from, to, dir: { x: dx, z: dz }, right: { x: -dz, z: dx },
      len: e.len, n: e.n, median: e.median, limit: e.limit, bus: e.bus,
      heading: Math.atan2(dx, dz), stop: null, y0: from.y, y1: to.y,
    };
    L.axis = groupOf(to, L.heading);
    L.s0 = fwd ? ca : cb;
    L.s1 = e.len - (fwd ? cb : ca);
    L.stopS = to.signal ? L.s1 - 5.5 : L.s1 - 0.5;
    W.links.push(L); from.out.push(L); to.inc.push(L); pair.push(L);
  }
  e.fwd = pair[0]; e.bwd = pair[1] || null;
  if (pair[1]) { pair[0].rev = pair[1]; pair[1].rev = pair[0]; }
}
export const linkY = (L, s) => L.y0 + ((L.y1 - L.y0) * clamp(s, 0, L.len)) / L.len;
export const edgeY = (e, s) => e.ya + ((e.yb - e.ya) * clamp(s, 0, e.len)) / e.len;

// ---------- 링크 위치 ----------
export const laneOff = (L, lane) => L.median / 2 + LANE_W * (lane + 0.5);
export function lanePos(L, lane, s, out = {}) {
  const o = laneOff(L, lane);
  out.x = L.from.x + L.dir.x * s + L.right.x * o;
  out.z = L.from.z + L.dir.z * s + L.right.z * o;
  return out;
}
export function nodeAt(x, z) {
  let best = null, bd = 1e9;
  for (const n of W.nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}
export function linkBetween(a, b) { return a && b ? a.out.find((l) => l.to === b) : null; }

// 신호: axis = 진입 그룹
export function signalState(n, axis, t) {
  if (!n.signal) return { s: 'G', l: 'G' };
  let u = (t + n.offset) % n.total, p = 0;
  while (u >= n.dur[p]) { u -= n.dur[p]; p++; }
  const q = p - (axis === 'z' ? 0 : 4);
  return { s: q === 0 ? 'G' : q === 1 ? 'Y' : 'R', l: q === 2 ? 'G' : q === 3 ? 'Y' : 'R', remain: n.dur[p] - u };
}

// ---------- 도로 공간 격자 ----------
const EG = 64;
let egrid = new Map();
function buildEdgeGrid() {
  egrid = new Map();
  for (const e of W.edges) addEdgeToGrid(e);
}
function addEdgeToGrid(e) {
  {
    const pad = e.hw + 20;
    const x0 = Math.min(e.a.x, e.b.x) - pad, x1 = Math.max(e.a.x, e.b.x) + pad, z0 = Math.min(e.a.z, e.b.z) - pad, z1 = Math.max(e.a.z, e.b.z) + pad;
    for (let i = Math.floor(x0 / EG); i <= Math.floor(x1 / EG); i++) for (let j = Math.floor(z0 / EG); j <= Math.floor(z1 / EG); j++) {
      const k = i + ',' + j;
      if (segDist((i + 0.5) * EG, (j + 0.5) * EG, e.a.x, e.a.z, e.b.x, e.b.z) > pad + EG * 0.75) continue;
      if (!egrid.has(k)) egrid.set(k, []); egrid.get(k).push(e);
    }
  }
}
export function edgesNear(x, z) { return egrid.get(Math.floor(x / EG) + ',' + Math.floor(z / EG)) || []; }

// 도로 위치 정보. level: 'surface' | 'hwy' | undefined(모두)
export function roadInfoAt(x, z, level) {
  let best = null, bd = 1e9;
  for (const e of edgesNear(x, z)) {
    const up = e.elevated || e.ramp;
    if (level === 'surface' && e.elevated) continue;
    if (level === 'hwy' && !up) continue;
    const s = (x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z;
    const lat = (x - e.a.x) * -e.dir.z + (z - e.a.z) * e.dir.x;
    if (s < -e.a.r || s > e.len + e.b.r) continue;
    if (Math.abs(lat) > e.hw * 1.05 + 0.3) continue;
    if (level === 'surface' && e.ramp && Math.abs(edgeY(e, s)) > 1.2) continue;
    let d = Math.abs(lat) / e.hw;
    if (s < e.ca) d += (e.ca - s) / (e.hw * 4);
    if (s > e.len - e.cb) d += (s - (e.len - e.cb)) / (e.hw * 4);
    if (level === undefined && up) d += 0.6;
    if (level === 'hwy' && W.refY !== undefined) d += Math.abs(edgeY(e, s) - W.refY) * 0.3; // 여러 층 고가: 지금 높이와 가까운 길
    if (d < bd) { bd = d; best = { e, s, lat }; }
  }
  if (best) {
    const e = best.e;
    const fwd = e.oneway || best.lat >= 0;
    const L = (fwd ? e.fwd : e.bwd) || W.links.find((l) => l.edge === e && (l.from === e.a) === fwd);
    const s = fwd ? best.s : e.len - best.s;
    const side = e.oneway ? best.lat : Math.abs(best.lat);
    let lane = Math.floor((side - L.median / 2) / LANE_W); if (lane >= L.n) lane = L.n - 1; if (lane < 0) lane = 0;
    return { name: e.name, type: e.type, limit: e.limit, kind: e.kind, edge: e, link: L, lane, lat: side, s, y: edgeY(e, best.s), up: e.elevated || e.ramp };
  }
  return null;
}

// ---------- 충돌체 ----------
const CELL = 32;
const cgrid = new Map();
let stamp = 0;
function cellsFor(x0, z0, x1, z1, fn) {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) fn(i + ',' + j);
}
export function addBox(x0, z0, x1, z1, tag) {
  const c = { t: 0, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), s: 0, tag };
  cellsFor(c.x0, c.z0, c.x1, c.z1, (k) => { if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c); });
  return c;
}
export function addCircle(x, z, r, tag) {
  const c = { t: 1, x, z, r, s: 0, tag };
  cellsFor(x - r, z - r, x + r, z + r, (k) => { if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c); });
  return c;
}
// 회전된 사각형 (중심, 반폭, 반길이, 방향각)
export function addOBox(cx, cz, hx, hz, ang, tag) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  if (Math.min(Math.abs(sn), Math.abs(cs)) * Math.max(hx, hz) < 0.08) {
    const ax = Math.abs(cs) > 0.5 ? hx : hz, az = Math.abs(cs) > 0.5 ? hz : hx;
    return addBox(cx - ax, cz - az, cx + ax, cz + az, tag);
  }
  const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
  const c = { t: 2, cx, cz, hx, hz, cs, sn, s: 0, tag, x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez };
  cellsFor(c.x0, c.z0, c.x1, c.z1, (k) => { if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c); });
  return c;
}
export function queryColliders(x, z, r, out) {
  stamp++; out.length = 0;
  cellsFor(x - r, z - r, x + r, z + r, (k) => {
    const l = cgrid.get(k); if (!l) return;
    for (const c of l) if (c.s !== stamp) { c.s = stamp; out.push(c); }
  });
  return out;
}
// 회전 사각형: 점에서 가장 가까운 점과 바깥 방향
export function obNearest(k, px, pz) {
  const dx = px - k.cx, dz = pz - k.cz;
  // 로컬: u = 진행축(ang 방향 = sin,cos), v = 옆
  const u = dx * k.sn + dz * k.cs, v = dx * k.cs - dz * k.sn;
  const cu = clamp(u, -k.hz, k.hz), cv = clamp(v, -k.hx, k.hx);
  const inside = cu === u && cv === v;
  return { x: k.cx + cu * k.sn + cv * k.cs, z: k.cz + cu * k.cs - cv * k.sn, inside, u, v };
}

// ---------- 철도 ----------
function buildRail() {
  const pts = RAIL.map((p) => toXZ(p[0], p[1]));
  let s = 0;
  const seg = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    seg.push({ a, b, s0: s, len, dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } });
    s += len;
  }
  W.rail = { pts, seg, len: s };
  // 건널목: 철도와 지상 도로가 만나는 곳
  for (const e of W.edges) {
    if (e.elevated || e.ramp) continue;
    for (const sg of seg) {
      const X = segInter(e.a, e.b, sg.a, sg.b);
      if (!X) continue;
      const se = X.t * e.len;
      if (se < e.ca + 6 || se > e.len - e.cb - 6) continue;
      const id = W.crossings.length;
      const cr = { id, x: X.x, z: X.z, s: sg.s0 + X.u * sg.len, dir: sg.dir, edge: e, arms: [], lamps: [], colliders: [], t: 0 };
      W.crossings.push(cr); W.crossDown[id] = false;
      for (const L of W.links.filter((l) => l.edge === e)) {
        const sl = L.from === e.a ? se : e.len - se;
        const ang = Math.abs(L.dir.x * sg.dir.z - L.dir.z * sg.dir.x) || 0.3;
        L.rail = { id, x: id, s: sl, stopS: sl - 9.5 };
        void ang;
      }
    }
  }
}
export function railPoint(s) {
  const r = W.rail; s = clamp(s, 0, r.len);
  for (const sg of r.seg) if (s <= sg.s0 + sg.len) { const u = s - sg.s0; return { x: sg.a.x + sg.dir.x * u, z: sg.a.z + sg.dir.z * u, dir: sg.dir }; }
  const sg = r.seg[r.seg.length - 1];
  return { x: sg.b.x, z: sg.b.z, dir: sg.dir };
}
export function railDist(x, z) {
  let bd = 1e9, bs = 0;
  for (const sg of W.rail.seg) {
    const u = clamp((x - sg.a.x) * sg.dir.x + (z - sg.a.z) * sg.dir.z, 0, sg.len);
    const d = Math.hypot(sg.a.x + sg.dir.x * u - x, sg.a.z + sg.dir.z * u - z);
    if (d < bd) { bd = d; bs = sg.s0 + u; }
  }
  return { d: bd, s: bs };
}
export { RIVERS };
void A;
