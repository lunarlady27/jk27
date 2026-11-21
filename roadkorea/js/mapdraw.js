// ===================== 지도 렌더러 (전체 지도 · 내비 · 관리자 관제 · 미니맵 공용) =====================
import { W, terrainH, REGION_DEFS } from './world.js';
import { REGS } from './region.js';
import { drawSubway } from './subway.js';
import { DONGS, toXZ } from './gwangju.js';

export const GU_COLORS = { 동구: 'rgba(255,140,90,.10)', 서구: 'rgba(90,170,255,.10)', 남구: 'rgba(120,220,140,.10)', 북구: 'rgba(200,140,255,.10)', 광산구: 'rgba(255,210,90,.10)' };
let GU_LABEL = null;
function guLabels() {
  if (GU_LABEL) return GU_LABEL;
  const acc = {};
  for (const [, g, lat, lon] of DONGS) { const p = toXZ(lat, lon); (acc[g] = acc[g] || []).push(p); }
  GU_LABEL = Object.entries(acc).map(([g, ps]) => [g, ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length]);
  return GU_LABEL;
}
const BIG_PLACE = { es: 1, ms: 1, hs: 1, univ: 1, mall: 1, bakery: 1, hospital: 1, museum: 1, attraction: 1, stadium: 1 };
const PLACE_DOT = { es: '#ffd400', ms: '#ffd400', hs: '#ffd400', school: '#ffd400', univ: '#ffb000', mall: '#ff7ab6', mart: '#ff7ab6', bakery: '#ffa86b', cafe: '#c89a6b', food: '#ff9a5a', hospital: '#ff5a5a' };
const roadColor = (kind, up) => (kind === 'highway' ? '#f0c04a' : up ? '#e9d48a' : kind === 'alley' ? '#c9ccd0' : kind === 'rural' || kind === 'mountain' || kind === 'coast' ? '#e8e2c8' : '#eef0f2');

export function mapView(cv, cx, cz, scale, bounds) {
  const w = cv.width, h = cv.height;
  const B = bounds || W.bounds || { x0: -6000, x1: 6000, z0: -4000, z1: 4800 };
  if (cx === undefined) { cx = (B.x0 + B.x1) / 2; cz = (B.z0 + B.z1) / 2; }
  const sc = scale || Math.min(w / (B.x1 - B.x0), h / (B.z1 - B.z0)) * 1.02;
  return {
    w, h, sc, cx, cz,
    X: (x) => w / 2 - (x - cx) * sc,
    Y: (z) => h / 2 - (z - cz) * sc,
    toWorld: (px, py) => ({ x: cx - (px - w / 2) / sc, z: cz - (py - h / 2) / sc }),
  };
}

// 도시별 지도 범위 (광주 · 서울 · 대전 · 고속도로)
const llBox = (b) => ({ x0: -(b[1] - 126.885) * 91060, x1: -(b[0] - 126.885) * 91060, z0: (b[2] - 35.155) * 110950, z1: (b[3] - 35.155) * 110950 });
export function cityBox(id) {
  if (!id || id === 'gwangju') return W.bounds;
  const R = REGS.find((r) => r.id === id);
  if (R) return R.B;
  const d = REGION_DEFS.find((r) => r.id === id);
  if (d) return llBox(d.bbox);
  if (id === 'xhwy') { const B = W.bounds; return { x0: -212000, x1: B.x1 + 4000, z0: Math.min(B.z0 - 2000, -26000), z1: 272000 }; }
  return W.bounds;
}
export function cityAt(x, z) {
  for (const R of REGS) if (x > R.B.x0 - 1500 && x < R.B.x1 + 1500 && z > R.B.z0 - 1500 && z < R.B.z1 + 1500) return R.id;
  const B = W.bounds; if (x > B.x0 - 1500 && x < B.x1 + 1500 && z > B.z0 - 1500 && z < B.z1 + 1500) return 'gwangju';
  return null;
}

// 미리 그린 바탕 지도 (구역 색 · 산 · 물 · 도로)
export function basemap() {
  if (W.basemap) return W.basemap;
  const B = W.bounds, res = Math.max(5, Math.ceil(Math.sqrt(((B.x1 - B.x0) * (B.z1 - B.z0)) / 9e6)));
  const cw = Math.ceil((B.x1 - B.x0) / res), ch = Math.ceil((B.z1 - B.z0) / res);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  // 픽셀 (i,j) = 월드 (x0 + i*res, z0 + j*res)
  const cell = 8; // px
  for (let j = 0; j < ch; j += cell) for (let i = 0; i < cw; i += cell) {
    const x = B.x0 + (i + cell / 2) * res, z = B.z0 + (j + cell / 2) * res;
    const k = W.zoneOf ? W.zoneOf(x, z) : 'mixed';
    const hh = terrainH(x, z);
    let c = k === 'rural' ? '#3f5a34' : k === 'park' || k === 'campus' ? '#3e6b3a' : k === 'ind' ? '#55524a' : k === 'apt' ? '#566158' : k === 'cbd' ? '#5c5f66' : '#4f5a4d';
    if (hh > 2) { const t = Math.min(1, hh / 260); c = `rgb(${Math.round(52 + t * 70)},${Math.round(84 + t * 50)},${Math.round(44 + t * 50)})`; }
    g.fillStyle = c; g.fillRect(i, j, cell + 0.5, cell + 0.5);
  }
  g.save();
  g.scale(1 / res, 1 / res); g.translate(-B.x0, -B.z0);
  // 물
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of W.rivers || []) {
    g.strokeStyle = '#3e6b3a'; g.lineWidth = r.hw * 2; g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke();
    g.strokeStyle = '#2f73a0'; g.lineWidth = r.hw * 1.24; g.stroke();
  }
  for (const wp of W.waterPolys || []) { g.fillStyle = '#2f73a0'; g.beginPath(); wp.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); }
  for (const l of W.lakes || []) { g.fillStyle = '#2f73a0'; g.beginPath(); g.ellipse(l.x, l.z, l.rx, l.rz, l.rot, 0, Math.PI * 2); g.fill(); }
  // 철도
  if (W.rail) { g.strokeStyle = '#3a332c'; g.lineWidth = 8; g.beginPath(); W.rail.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke(); g.strokeStyle = '#ddd'; g.lineWidth = 3; g.setLineDash([20, 20]); g.stroke(); g.setLineDash([]); }
  // 도로 (지상 먼저, 고가는 위에)
  for (const pass of [0, 1]) for (const e of W.edges) {
    const up = e.elevated || e.ramp; if ((pass === 1) !== up) continue;
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = e.hw * 2 + 6; g.beginPath(); g.moveTo(e.a.x, e.a.z); g.lineTo(e.b.x, e.b.z); g.stroke();
    g.strokeStyle = roadColor(e.kind, up); g.lineWidth = Math.max(4, e.hw * 2); g.stroke();
  }
  g.restore();
  W.basemap = { canvas: cv, res };
  return W.basemap;
}

// 다른 도시(서울 · 대전) 바탕 지도: 물 · 도로를 한 번 그려 둠
function regionBasemap(R) {
  if (R.basemap) return R.basemap;
  const B = R.B, res = 8;
  const cw = Math.ceil((B.x1 - B.x0) / res), ch = Math.ceil((B.z1 - B.z0) / res);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.fillStyle = '#4f5a4d'; g.fillRect(0, 0, cw, ch);
  g.save(); g.scale(1 / res, 1 / res); g.translate(-B.x0, -B.z0);
  g.fillStyle = '#2f73a0';
  for (const wp of R.D.water || []) { g.beginPath(); for (let q = 1; q < wp.length; q += 2) (q === 1 ? g.moveTo(wp[q], wp[q + 1]) : g.lineTo(wp[q], wp[q + 1])); g.closePath(); g.fill(); }
  g.lineCap = 'round';
  for (const pass of [0, 1]) for (const e of W.edges) {
    if (e.reg !== R.id) continue;
    const up = e.elevated || e.ramp; if ((pass === 1) !== up) continue;
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = e.hw * 2 + 6; g.beginPath(); g.moveTo(e.a.x, e.a.z); g.lineTo(e.b.x, e.b.z); g.stroke();
    g.strokeStyle = roadColor(e.kind, up); g.lineWidth = Math.max(4, e.hw * 2); g.stroke();
  }
  g.restore();
  R.basemap = { canvas: cv, res };
  return R.basemap;
}
// layers: { names, gu, pois, stops, player, spawn, routes:[{route,color}], buses, pin, cams, routeStops, subway, places }
export function drawCityMap(cv, view, layers = {}) {
  const g = cv.getContext('2d');
  const { w, h, sc, X, Y } = view;
  const B = W.bounds;
  g.save();
  g.fillStyle = '#22372a'; g.fillRect(0, 0, w, h);
  if (B) {
    const bm = basemap();
    g.save();
    g.setTransform(-sc, 0, 0, -sc, w / 2 + view.cx * sc, h / 2 + view.cz * sc);
    g.imageSmoothingEnabled = true;
    const vx0 = view.toWorld(w, 0).x, vx1 = view.toWorld(0, 0).x, vz1 = view.toWorld(0, 0).z, vz0 = view.toWorld(0, h).z;
    const seen = (b) => !(b.x1 < vx0 || b.x0 > vx1 || b.z1 < vz0 || b.z0 > vz1);
    if (seen(B)) g.drawImage(bm.canvas, B.x0, B.z0, bm.canvas.width * bm.res, bm.canvas.height * bm.res);
    for (const R of REGS) if (seen(R.B)) { const rb = regionBasemap(R); g.drawImage(rb.canvas, R.B.x0, R.B.z0, rb.canvas.width * rb.res, rb.canvas.height * rb.res); }
    // 확대하면 도로를 선명하게 다시 그림
    if (sc <= 0.35) {
      // 멀리서 볼 때: 고속도로 · 도시 간 도로만
      if (!W._hwyEdges || W._hwyEdges.n !== W.edges.length) { W._hwyEdges = W.edges.filter((e) => e.kind === 'highway' || e.corr || e.kind === 'ic'); W._hwyEdges.n = W.edges.length; }
      g.lineCap = 'round';
      for (const e of W._hwyEdges) { g.strokeStyle = '#f2b63c'; g.lineWidth = Math.max(2.2 / sc, e.hw * 2); g.beginPath(); g.moveTo(e.a.x, e.a.z); g.lineTo(e.b.x, e.b.z); g.stroke(); }
    }
    if (sc > 0.35) {
      g.lineCap = 'round';
      const wx0 = view.toWorld(w, 0).x, wx1 = view.toWorld(0, 0).x, wz1 = view.toWorld(0, 0).z, wz0 = view.toWorld(0, h).z;
      for (const pass of [0, 1]) for (const e of W.edges) {
        const up = e.elevated || e.ramp; if ((pass === 1) !== up) continue;
        if (Math.max(e.a.x, e.b.x) < wx0 - 50 || Math.min(e.a.x, e.b.x) > wx1 + 50 || Math.max(e.a.z, e.b.z) < wz0 - 50 || Math.min(e.a.z, e.b.z) > wz1 + 50) continue;
        g.strokeStyle = roadColor(e.kind, up); g.lineWidth = Math.max(2 / sc, e.hw * 2); g.beginPath(); g.moveTo(e.a.x, e.a.z); g.lineTo(e.b.x, e.b.z); g.stroke();
      }
    }
    // 노선
    if (layers.routes) for (const { route, color, width } of layers.routes) {
      g.strokeStyle = color || route.color; g.lineWidth = (width || 3) / sc; g.lineJoin = 'round'; g.globalAlpha = 0.92;
      g.beginPath();
      route.links.forEach((L, i) => { const o = L.median / 2 + L.n * 1.6; const ax = L.from.x + L.right.x * o, az = L.from.z + L.right.z * o, bx = L.to.x + L.right.x * o, bz = L.to.z + L.right.z * o; if (!i) g.moveTo(ax, az); else g.lineTo(ax, az); g.lineTo(bx, bz); });
      g.stroke(); g.globalAlpha = 1;
      if (layers.routeStops) for (const st of route.stops || []) { g.fillStyle = '#fff'; g.strokeStyle = color || route.color; g.lineWidth = 2 / sc; g.beginPath(); g.arc(st.door.x, st.door.z, 4 / sc, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
    g.restore();
  }
  // 구 이름
  if (layers.gu !== false && view.cz < 60000) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.max(14, Math.min(44, 300 * sc))}px "Noto Sans KR", sans-serif`;
    for (const [n, x, z] of guLabels()) { g.fillStyle = 'rgba(255,255,255,.26)'; g.fillText(n, X(x), Y(z)); }
  }
  // 도로 이름 (같은 이름은 가장 긴 구간에 한 번)
  if (layers.names !== false && sc > 0.12) {
    if (!W._nameEdges) {
      const best = new Map();
      for (const e of W.edges) { if (!e.name || e.ramp || e.gen) continue; const b = best.get(e.name); if (!b || e.len > b.len) best.set(e.name, e); }
      W._nameEdges = [...best.values()];
    }
    g.font = `700 ${Math.round(Math.min(15, 10 + sc * 6))}px "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const e of W._nameEdges) {
      if (e.len * sc < 50 && sc < 0.4) continue;
      const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2, px = X(mx), py = Y(mz);
      if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;
      let ang = Math.atan2(Y(e.b.z) - Y(e.a.z), X(e.b.x) - X(e.a.x));
      if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      g.save(); g.translate(px, py); g.rotate(ang);
      g.lineWidth = 3; g.strokeStyle = 'rgba(20,30,40,.85)'; g.strokeText(e.name, 0, 0);
      g.fillStyle = e.kind === 'highway' ? '#ffe08a' : '#fff'; g.fillText(e.name, 0, 0);
      g.restore();
    }
  }
  // 정류장
  if (layers.stops && sc > 0.6) for (const st of W.stops) { g.fillStyle = '#4bb048'; g.fillRect(X(st.curb.x) - 2, Y(st.curb.z) - 2, 4, 4); }
  // 명소
  if (layers.pois !== false) {
    g.font = `700 ${sc > 0.5 ? 12 : 11}px "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const l of W.landmarks) {
      if (l.bridge || l.river || /건널목|나들목|입구$/.test(l.name)) { if (sc < 0.5) continue; }
      if (!l.poi && sc < 0.25) continue;
      if (l.metro && layers.subway) continue;
      if (l.place && (layers.places === false || sc < (layers.places ? 0.18 : 0.55) || (l.place === 'park' && sc < 0.8))) continue;
      const px = X(l.x), py = Y(l.z);
      if (px < -60 || px > w + 60 || py < -20 || py > h + 20) continue;
      g.fillStyle = l.poi ? '#ffcf5a' : '#36d1c4'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
      if (l.place) { g.fillStyle = PLACE_DOT[l.place] || '#ffcf5a'; g.beginPath(); g.arc(px, py, 3.6, 0, Math.PI * 2); g.fill(); }
      if ((sc > 0.16 && !l.place) || (l.place && sc > (BIG_PLACE[l.place] ? 0.42 : 0.8)) || /역$|시청|경기장|공항|전당/.test(l.name)) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(l.name, px + 1, py - 5); g.fillStyle = '#fff'; g.fillText(l.name, px, py - 6); }
    }
  }
  if (layers.subway) layers.trainCount = drawSubway(g, view, { city: layers.subway === true ? null : layers.subway });
  if (layers.buses) for (const b of layers.buses) { g.fillStyle = b.color; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(b.x), Y(b.z), b.r || 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  if (layers.cams && sc > 0.4) for (const c of W.cams || []) { g.fillStyle = '#ff4d3d'; g.fillRect(X(c.x) - 3, Y(c.z) - 3, 6, 6); }
  if (layers.spawn && W.spawns[layers.spawn]) { const s = W.spawns[layers.spawn]; g.fillStyle = '#ff4d3d'; g.beginPath(); g.arc(X(s.x), Y(s.z), 7, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  if (layers.pin) { const p = layers.pin; const px = X(p.x), py = Y(p.z); g.fillStyle = '#ff3d6e'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px - 12, py - 16, px - 9, py - 28, px, py - 28); g.bezierCurveTo(px + 9, py - 28, px + 12, py - 16, px, py); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py - 19, 4, 0, Math.PI * 2); g.fill(); }
  if (layers.player) {
    const p = layers.player, px = X(p.x), py = Y(p.z);
    g.save(); g.translate(px, py); if (p.heading !== undefined) g.rotate(-p.heading);
    g.fillStyle = '#36d1c4'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  // 나침반 · 축척
  g.fillStyle = 'rgba(10,18,26,.75)'; g.beginPath(); g.arc(w - 26, 26, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff4d3d'; g.beginPath(); g.moveTo(w - 26, 12); g.lineTo(w - 20, 26); g.lineTo(w - 32, 26); g.fill();
  g.fillStyle = '#fff'; g.font = '800 10px sans-serif'; g.textAlign = 'center'; g.fillText('N', w - 26, 38);
  // 축척 (게임 거리 → 실제 거리 표시)
  const m = sc > 0.6 ? 100 : sc > 0.3 ? 200 : sc > 0.1 ? 500 : 1000;
  g.fillStyle = 'rgba(10,18,26,.75)'; g.fillRect(10, h - 28, m * sc + 54, 20);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, h - 14); g.lineTo(16 + m * sc, h - 14); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 11px "Noto Sans KR", sans-serif'; g.textAlign = 'left'; g.fillText(m >= 1000 ? m / 1000 + 'km' : m + 'm', 22 + m * sc, h - 13);
  g.restore();
}
