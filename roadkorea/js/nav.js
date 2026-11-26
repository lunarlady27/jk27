// ===================== 내비게이션 (빛고을 내비) =====================
// 목적지 검색(초성 검색 포함) · 경로 탐색(추천/최단/큰길/무료도로) · 회전 안내 · 음성 안내
// · 차로 안내 · 재탐색 · 남은 거리/도착 예정 시각 · 과속 단속 카메라 · 3D 경로 표시 · 지도 경로
import * as THREE from 'three';
import { W, LANE_W, roadInfoAt, SIDEWALK, addCircle, linkY } from './world.js';
import { dongAt, guAt } from './data.js';
import { canvasTex, roundRect, GEO, MinHeap } from './util.js';
import { PLACE_CATS } from './places.js';
import { SUBWAY } from './subway.js';

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export function chosung(str) {
  return [...str].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
}
const isCho = (q) => /^[ㄱ-ㅎ\s]+$/.test(q);
export const TURN_WORD = { L: '좌회전', R: '우회전', S: '직진', U: '유턴', G: '목적지', KL: '왼쪽 방향', KR: '오른쪽 방향' };
export const MODES = [
  { id: 'fast', name: '추천 경로', desc: '가장 빨리 도착' },
  { id: 'short', name: '최단 거리', desc: '거리가 가장 짧은 길' },
  { id: 'big', name: '큰길 우선', desc: '넓은 도로 위주 · 초보 추천' },
  { id: 'free', name: '무료 도로', desc: '고속도로 · 톨게이트 피하기' },
];
export const CATS = [
  { id: 'all', name: '전체', icon: '🔎' }, { id: 'poi', name: '명소', icon: '📍' }, { id: 'stop', name: '정류장', icon: '🚏' },
  { id: 'school', name: '학교', icon: '🏫' }, { id: 'shop', name: '쇼핑·맛집', icon: '🛍️' }, { id: 'subway', name: '지하철', icon: '🚇' },
  { id: 'life', name: '생활', icon: '🏥' }, { id: 'fuel', name: '주유·충전', icon: '⛽' }, { id: 'park', name: '주차장', icon: '🅿️' }, { id: 'cross', name: '교차로', icon: '✚' },
];
export const turnOf = (A, B) => {
  if (B === A.rev) return 'U';
  const cr = A.dir.x * B.dir.z - A.dir.z * B.dir.x, dt = A.dir.x * B.dir.x + A.dir.z * B.dir.z;
  const ang = Math.atan2(cr, dt);
  return Math.abs(ang) < 0.55 ? 'S' : ang < 0 ? 'L' : 'R';
};
const isUp = (L) => L.edge.elevated || L.edge.ramp;
const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + 'km' : Math.max(0, Math.round(m / 10) * 10) + 'm');
const spokenDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.0', '') + '킬로미터' : Math.round(m / 50) * 50 + '미터');

// 회전 화살표 SVG (안내 카드 · 지도에 공용)
export function arrowSVG(t, color = '#fff') {
  const P = {
    S: 'M50 88 V28 M50 12 L30 36 H70 Z',
    L: 'M62 90 V52 Q62 40 50 40 H32 M14 40 L36 20 V60 Z',
    R: 'M38 90 V52 Q38 40 50 40 H68 M86 40 L64 20 V60 Z',
    U: 'M66 90 V40 Q66 20 48 20 Q30 20 30 40 V56 M30 74 L12 50 H48 Z',
    G: 'M50 92 C50 92 22 60 22 40 A28 28 0 0 1 78 40 C78 60 50 92 50 92 Z M50 30 A10 10 0 1 0 50.1 30 Z',
  }[t] || '';
  const fillHead = t === 'G' ? `<path d="${P}" fill="${color}" fill-rule="evenodd"/>` : `<path d="${P.split(' M')[0]}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M${P.split(' M')[1]}" fill="${color}"/>`;
  return `<svg viewBox="0 0 100 100">${fillHead}</svg>`;
}

function chevronTex() {
  const t = canvasTex(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (const y0 of [8, 72]) { g.beginPath(); g.moveTo(10, y0 + 40); g.lineTo(32, y0 + 14); g.lineTo(54, y0 + 40); g.lineTo(54, y0 + 52); g.lineTo(32, y0 + 26); g.lineTo(10, y0 + 52); g.closePath(); g.fill(); }
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}
function arrowBoardTex() {
  // 2×2 아틀라스: S L / R U
  const t = canvasTex(512, 512, (g) => {
    const draw = (cx, cy, k) => {
      g.save(); g.translate(cx, cy);
      g.fillStyle = 'rgba(8,30,48,.85)'; roundRect(g, -118, -118, 236, 236, 34); g.fill();
      g.strokeStyle = '#39c6ff'; g.lineWidth = 8; roundRect(g, -110, -110, 220, 220, 28); g.stroke();
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 30; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      if (k === 'S') { g.moveTo(0, 80); g.lineTo(0, -30); g.stroke(); g.beginPath(); g.moveTo(-46, -20); g.lineTo(0, -82); g.lineTo(46, -20); g.closePath(); g.fill(); }
      if (k === 'L' || k === 'R') { const s = k === 'L' ? -1 : 1; g.moveTo(-s * 20, 80); g.lineTo(-s * 20, 0); g.quadraticCurveTo(-s * 20, -24, 4 * s, -24); g.lineTo(30 * s, -24); g.stroke(); g.beginPath(); g.moveTo(22 * s, -70); g.lineTo(84 * s, -24); g.lineTo(22 * s, 22); g.closePath(); g.fill(); }
      if (k === 'U') { g.moveTo(34, 80); g.lineTo(34, -20); g.arc(0, -20, 34, 0, Math.PI, true); g.lineTo(-34, 10); g.stroke(); g.beginPath(); g.moveTo(-76, 6); g.lineTo(-34, 70); g.lineTo(8, 6); g.closePath(); g.fill(); }
      g.restore();
    };
    g.clearRect(0, 0, 512, 512);
    draw(128, 128, 'S'); draw(384, 128, 'L'); draw(128, 384, 'R'); draw(384, 384, 'U');
  });
  return t;
}
const ATLAS = { S: [0, 0.5], L: [0.5, 0.5], R: [0, 0], U: [0.5, 0] };

export class Nav {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio;
    this.active = false; this.route = null; this.dest = null; this.mode = 'fast';
    this.ci = 0; this.s = 0; this.offT = 0; this.offRoadT = 0; this.t = 0; this.tick = 0;
    this.show3D = true; this.voice = true; this.recent = []; this.fav = {};
    this.onArrive = null; this.onCamera = null; this.onToast = null;
    this.info = null; this.camAhead = null; this.camSaid = new Set(); this.lastCamS = null;
    this.ribbonTex = chevronTex();
    this.ribbonMat = new THREE.MeshBasicMaterial({ map: this.ribbonTex, color: 0x39c6ff, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.ribbon = null;
    // 목적지 깃발
    const pin = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pole.position.y = 3.5; pin.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff3d6e }));
    head.position.y = 7.6; pin.add(head);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 40), new THREE.MeshBasicMaterial({ color: 0xff3d6e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; pin.add(ring);
    pin.userData = { head, ring };
    pin.visible = false; scene.add(pin); this.pin = pin;
    // 교차로 위 떠 있는 회전 화살표 (AR 안내판)
    const at = arrowBoardTex();
    this.boardMat = new THREE.MeshBasicMaterial({ map: at, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const bg = new THREE.PlaneGeometry(1, 1);
    this.board = new THREE.Mesh(bg, this.boardMat);
    this.board.scale.set(6, 6, 1); this.board.visible = false; this.board.renderOrder = 3;
    scene.add(this.board);
    this.buildCams();
  }

  // ---------- 과속 단속 카메라 ----------
  buildCams() {
    W.cams = [];
    const poleM = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 0.5, roughness: 0.4 });
    const camM = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5 });
    const signTex = canvasTex(128, 160, (g) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#1f4fb0'; g.fillRect(0, 0, 128, 44);
      g.fillStyle = '#fff'; g.font = '900 26px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('과속단속', 64, 23);
      g.fillStyle = '#222'; g.font = '800 18px "Noto Sans KR", sans-serif'; g.fillText('📷 무인 카메라', 64, 70);
      g.fillStyle = '#d42a2a'; g.font = '900 22px "Noto Sans KR", sans-serif'; g.fillText('안전운전', 64, 120);
    });
    const signM = new THREE.MeshStandardMaterial({ map: signTex });
    let k = 0;
    for (const L of W.links) {
      const e = L.edge;
      if (e.elevated || e.ramp) continue;
      const ok = (e.kind === 'city' && L.n >= 2 && L.s1 - L.s0 > 150 && (L.id * 7) % 9 === 0) || (e.kind === 'rural' && L.s1 - L.s0 > 120 && L.id % 4 === 1);
      if (!ok) continue;
      const s = L.s0 + (L.s1 - L.s0) * (L.stop ? 0.72 : 0.6);
      const lat = L.median / 2 + L.n * LANE_W + e.shoulder + SIDEWALK * 0.35;
      const x = L.from.x + L.dir.x * s + L.right.x * lat, z = L.from.z + L.dir.z * s + L.right.z * lat;
      const cam = { id: k++, link: L, s, limit: L.limit, x, z };
      W.cams.push(cam);
      // 기둥 + 가로 팔 + 카메라
      const g = new THREE.Group();
      g.position.set(x, 0, z); g.rotation.y = L.heading;
      const reach = L.n * LANE_W * 0.55 + SIDEWALK * 0.35;
      const pole = new THREE.Mesh(GEO.cyl, poleM); pole.scale.set(0.16, 6.4, 0.16); pole.position.y = 3.2; g.add(pole);
      const arm = new THREE.Mesh(GEO.box, poleM); arm.scale.set(reach, 0.18, 0.18); arm.position.set(reach / 2, 6.1, 0); g.add(arm);
      // 오른쪽(-x local)… 진행 방향 기준 오른쪽은 로컬 -x, 도로 쪽은 로컬 +x
      const box = new THREE.Mesh(GEO.box, camM); box.scale.set(0.55, 0.45, 0.9); box.position.set(reach - 0.4, 5.75, 0.2); g.add(box);
      const lens = new THREE.Mesh(GEO.cyl8 || GEO.cyl, new THREE.MeshBasicMaterial({ color: 0x0a0a0a })); lens.scale.set(0.16, 0.12, 0.16); lens.rotation.x = Math.PI / 2; lens.position.set(reach - 0.4, 5.75, -0.32); g.add(lens);
      const sb = new THREE.Mesh(GEO.plane, signM); sb.scale.set(0.9, 1.12, 1); sb.position.set(0, 3.6, -0.1); sb.rotation.y = Math.PI; g.add(sb);
      this.scene.add(g);
      addCircle(x, z, 0.25, 'pole');
    }
  }

  // ---------- 장소 목록 ----------
  places() {
    if (this._places) return this._places;
    const out = [];
    const add = (name, cat, icon, x, z, extra = {}) => out.push({ name, cat, icon, x, z, sub: `${guAt(x, z)} ${dongAt(x, z)}`, cho: chosung(name), kw: extra.kw || '', ...extra });
    for (const l of W.landmarks) {
      if (/건널목|입구$|톨게이트/.test(l.name) || l.river) continue;
      if (l.place) {
        const C = PLACE_CATS[l.place] || {};
        add(l.name, C.nav || 'poi', C.icon || '📍', l.x, l.z, { kw: `${C.ko || ''} ${l.city || ''}`, city: l.city });
        continue;
      }
      add(l.name, 'poi', l.poi === '학교' ? '🏫' : l.poi === '시장' ? '🛒' : l.poi === '교통' ? '🚉' : l.poi === '공원' ? '🌳' : l.poi === '관광' ? '⛰️' : '📍', l.x, l.z, { kw: l.poi || '명소' });
    }
    const seen = new Set();
    for (const st of W.stops) {
      if (seen.has(st.name)) continue; seen.add(st.name);
      add(st.name + ' 정류장', 'stop', '🚏', st.curb.x, st.curb.z, { kw: '버스 정류장 ' + st.routes.join(' '), routes: st.routes, stop: st });
    }
    for (const zn of W.zones) {
      if (zn.type === 'fuel') add(zn.name, 'fuel', '⛽', (zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2, { kw: '주유소 기름' });
      if (zn.type === 'ev') add(zn.name, 'fuel', '🔌', (zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2, { kw: '충전소 전기차 EV' });
      if (zn.type === 'rest') add('광주 휴게소', 'fuel', '🍜', (zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2, { kw: '휴게소 고속도로' });
    }
    if (W.parkingArea) { const p = W.parkingArea; add('주차 연습장', 'park', '🅿️', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, { kw: '주차장' }); }
    for (const l of W.landmarks) if (/지하주차장/.test(l.name)) add('지하주차장 (B1)', 'park', '🅿️', l.x, l.z, { kw: '주차장 지하' });
    for (const n of W.nodes) {
      if (n.edges.length < 3 || n.y > 1) continue;
      const names = [...new Set(n.edges.filter((e) => !e.ramp).map((e) => e.name))];
      if (names.length < 2) continue;
      add(`${names[0]}·${names[1]} ${n.edges.length >= 4 ? '사거리' : '삼거리'}`, 'cross', '✚', n.x, n.z, { kw: '교차로 ' + names.join(' '), node: n });
    }
    const seenSt = new Set(out.filter((p) => p.cat === 'poi' && /역$/.test(p.name)).map((p) => p.name));
    for (const L of SUBWAY.lines) for (const st of L.st) {
      const nm = /역$/.test(st.name) ? st.name : st.name + '역';
      const key = nm + '|' + L.city;
      if (seenSt.has(key)) { const p = out.find((q) => q.key === key); if (p) p.kw += ' ' + L.name; continue; }
      seenSt.add(key);
      add(nm, 'subway', '🚇', st.x, st.z, { kw: `지하철 전철 ${L.name} ${L.cityKo || ''}`, key, line: L });
    }
    for (const zn of W.zones) if (zn.type === 'toll') add('광주 톨게이트', 'poi', '🛣️', (zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2, { kw: '톨게이트 고속도로', hwy: true });
    this._places = out;
    return out;
  }
  search(q, cat = 'all', from) {
    q = (q || '').trim();
    const ql = q.replace(/\s/g, '');
    const cho = isCho(q);
    let list = this.places().filter((p) => cat === 'all' || p.cat === cat);
    if (q) {
      list = list.map((p) => {
        const n = p.name.replace(/\s/g, '');
        let sc = 0;
        if (cho) { const c = p.cho.replace(/\s/g, ''); sc = c.startsWith(ql) ? 3 : c.includes(ql) ? 2 : 0; }
        else sc = n.startsWith(ql) ? 4 : n.includes(ql) ? 3 : (p.kw + ' ' + p.sub).includes(q) ? 1 : 0;
        // 지금 있는 도시 안의 곳을 먼저
        if (sc > 0 && from && Math.hypot(p.x - from.x, p.z - from.z) < 15000) sc += 1.5;
        return { p, sc };
      }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || (from ? Math.hypot(a.p.x - from.x, a.p.z - from.z) - Math.hypot(b.p.x - from.x, b.p.z - from.z) : 0)).map((x) => x.p);
    } else if (from) list = [...list].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    return list.slice(0, 60);
  }

  // ---------- 경로 탐색 ----------
  linkCost(L, mode) {
    const k = L.edge.kind;
    let c = mode === 'short' ? L.len / 12 : L.len / ((L.limit * 0.8) / 3.6);
    if (L.to.signal) c += mode === 'short' ? 2 : 9;
    if (mode === 'free' && (k === 'highway' || k === 'ic')) c *= 12;
    if (mode === 'big') { if (L.n === 1) c *= 1.7; else if (L.n >= 3) c *= 0.85; }
    if (k === 'alley' && mode !== 'short') c *= 1.6;
    if (k === 'mountain' && mode !== 'short') c *= 1.25;
    return c;
  }
  turnCost(t, mode) { return mode === 'short' ? (t === 'U' ? 6 : 0) : t === 'L' ? 7 : t === 'R' ? 3 : t === 'U' ? 28 : 0; }
  // 현재 위치·방향에서 탈 링크
  startLinkAt(x, z, heading, level = this.level) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const ri = roadInfoAt(x, z, level === 'hwy' ? 'hwy' : 'surface');
    let L = ri.link;
    if (L) { if (L.dir.x * fx + L.dir.z * fz < 0 && L.rev) L = L.rev; }
    else {
      let bd = 1e9;
      for (const c of W.links) {
        if ((level === 'hwy') !== !!isUp(c)) continue;
        const s = (x - c.from.x) * c.dir.x + (z - c.from.z) * c.dir.z;
        if (s < -10 || s > c.len + 10) continue;
        const lat = Math.abs((x - c.from.x) * c.right.x + (z - c.from.z) * c.right.z);
        const d = lat + (c.dir.x * fx + c.dir.z * fz < 0 ? 30 : 0);
        if (d < bd) { bd = d; L = c; }
      }
    }
    if (!L) return null;
    const s = (x - L.from.x) * L.dir.x + (z - L.from.z) * L.dir.z;
    return { L, s: Math.max(0, Math.min(L.len, s)) };
  }
  // 목적지에 가장 가까운 도로 위치 (오른쪽 차로 쪽을 우선)
  goalCandidates(x, z, allowHwy) {
    const cand = [];
    for (const L of W.links) {
      if (!allowHwy && isUp(L)) continue;
      if (L.s1 - L.s0 < 8) continue;
      const s = (x - L.from.x) * L.dir.x + (z - L.from.z) * L.dir.z;
      const sc = Math.max(L.s0 + 3, Math.min(L.s1 - 3, s));
      const lat = (x - L.from.x) * L.right.x + (z - L.from.z) * L.right.z;
      const d = Math.hypot(s - sc, Math.abs(lat));
      cand.push({ L, s: sc, d: d + (lat < 0 ? 25 : 0), raw: d });
    }
    cand.sort((a, b) => a.d - b.d);
    const best = cand[0];
    return cand.filter((c) => c.raw < best.raw + 30).slice(0, 4);
  }
  plan(from, dest, mode = this.mode) {
    const st = this.startLinkAt(from.x, from.z, from.heading);
    if (!st) return null;
    const goals = this.goalCandidates(dest.x, dest.z, !!dest.hwy);
    const goalOf = new Map(goals.map((g) => [g.L, g]));
    // 같은 링크 앞쪽이면 바로
    const direct = goalOf.get(st.L);
    if (direct && direct.s > st.s + 5) return this.makeRoute([st.L], st.s, direct.s, dest, mode);
    // 다익스트라 (상태 = 링크, 값 = 링크 진입 시점 비용)
    const g = new Map(), prev = new Map();
    const open = new MinHeap();
    // A* 휴리스틱: 목적지까지 직선거리 / 최고 속도 (과대평가하지 않게)
    const gx = goals.length ? goals[0].L.from.x + goals[0].L.dir.x * goals[0].s : dest.x;
    const gz = goals.length ? goals[0].L.from.z + goals[0].L.dir.z * goals[0].s : dest.z;
    const vmax = mode === 'short' ? 12 : 110 / 3.6 / 0.8 * 1.0;
    const hOf = (L) => Math.max(0, Math.hypot(L.from.x - gx, L.from.z - gz) - 60) / vmax;
    const endCost0 = ((st.L.len - st.s) / Math.max(1, st.L.len)) * this.linkCost(st.L, mode);
    for (const O of st.L.to.out) {
      if (O === st.L.rev && st.L.to.out.length > 1) continue;
      const c = endCost0 + this.turnCost(turnOf(st.L, O), mode);
      if (!g.has(O) || c < g.get(O)) { g.set(O, c); prev.set(O, st.L); open.push(c + hOf(O), O); }
    }
    let best = null, bestC = 1e18;
    const done = new Set();
    while (open.size) {
      const L = open.pop(); const f = open.topKey;
      if (done.has(L)) continue;
      const c = g.get(L);
      done.add(L);
      if (f >= bestC || done.size > 150000) break;
      const gl = goalOf.get(L);
      if (gl) {
        const tot = c + (gl.s / L.len) * this.linkCost(L, mode) + (gl.d - gl.raw) * 0.6;
        if (tot < bestC) { bestC = tot; best = { L, gl }; }
      }
      const cEnd = c + this.linkCost(L, mode);
      for (const O of L.to.out) {
        if (O === L.rev && L.to.out.length > 1) continue;
        const nc = cEnd + this.turnCost(turnOf(L, O), mode);
        if (!g.has(O) || nc < g.get(O)) { g.set(O, nc); prev.set(O, L); open.push(nc + hOf(O), O); }
      }
    }
    if (!best) return null;
    const links = [];
    let cur = best.L;
    while (cur && cur !== st.L) { links.unshift(cur); cur = prev.get(cur); }
    links.unshift(st.L);
    return this.makeRoute(links, st.s, best.gl.s, dest, mode);
  }
  // 외부 경로(버스 노선)로 안내
  planAlong(links, startS, goalS, dest) { return this.makeRoute(links, startS, goalS, dest, 'route'); }
  makeRoute(links, startS, goalS, dest, mode) {
    const cum = [-startS];
    for (let i = 1; i < links.length; i++) cum.push(cum[i - 1] + links[i - 1].len);
    const total = cum[links.length - 1] + goalS;
    const man = [];
    for (let i = 0; i < links.length - 1; i++) {
      const A = links[i], B = links[i + 1];
      let t = turnOf(A, B);
      const roadChange = A.edge.name !== B.edge.name;
      const toHwy = isUp(B) && !isUp(A);
      const offHwy = isUp(A) && !isUp(B);
      if (t === 'S' && !roadChange) continue;
      man.push({ i, t, at: cum[i + 1], node: A.to, road: B.edge.name, roadType: B.edge.type, toHwy, offHwy, said: new Set(), lanes: A.n, bus: A.bus });
    }
    man.push({ i: links.length - 1, t: 'G', at: total, node: null, road: dest.name, said: new Set() });
    // 시간 추정 (평균 제한속도의 70% + 신호 대기)
    let time = 0, toll = 0, signals = 0, closedIn = null;
    links.forEach((L, i) => {
      const part = i === 0 ? (L.len - startS) / L.len : i === links.length - 1 ? goalS / L.len : 1;
      time += (L.len * part) / ((L.limit * (L.edge.kind === 'highway' ? 0.85 : 0.7)) / 3.6);
      if (i < links.length - 1 && L.to.signal) { time += 12; signals++; }
      const tl = L.edge.toll;
      if (tl && tl.kind === 'open') toll += tl.fee;
      if (tl && tl.kind === 'closed') { if (!closedIn) closedIn = tl; else if (closedIn.name !== tl.name) { toll += Math.round((900 + Math.abs((tl.km || 0) - (closedIn.km || 0)) * 44.3) / 100) * 100; closedIn = null; } }
    });
    const roads = [];
    for (const L of links) if (L.edge.name && roads[roads.length - 1] !== L.edge.name) roads.push(L.edge.name);
    const gl = links[links.length - 1];
    const gp = { x: gl.from.x + gl.dir.x * goalS + gl.right.x * (gl.median / 2 + gl.n * LANE_W), z: gl.from.z + gl.dir.z * goalS + gl.right.z * (gl.median / 2 + gl.n * LANE_W) };
    return { links, startS, goalS, cum, total, man, time, toll, signals, roads, mode, dest, goalPt: gp };
  }
  // 경로 비교 (경로 선택 화면용)
  compare(from, dest) {
    return MODES.map((m) => ({ mode: m, r: this.plan(from, dest, m.id) })).filter((x) => x.r);
  }

  // ---------- 안내 시작/종료 ----------
  start(dest, from, mode = this.mode, opts = {}) {
    const r = opts.route || this.plan(from, dest, mode);
    if (!r) { this.toast?.('🚫 경로를 찾을 수 없어요', 'bad'); return false; }
    this.mode = mode;
    this.dest = dest; this.route = r; this.active = true; this.ci = 0; this.s = r.startS; this.offT = 0; this.offRoadT = 0;
    this.auto = !!opts.auto;
    this.build3D();
    if (!opts.silent) {
      this.say(opts.auto ? `${dest.name}까지 안내합니다.` : `경로 안내를 시작합니다. ${dest.name}까지 ${spokenDist(r.total)}, 약 ${Math.max(1, Math.round(r.time / 60))}분 걸립니다.${r.toll ? ' 통행료가 있는 경로입니다.' : ''}`);
    }
    if (!opts.auto && !this.recent.find((p) => p.name === dest.name)) { this.recent.unshift({ name: dest.name, x: dest.x, z: dest.z, icon: dest.icon || '📍', sub: dest.sub || '' }); this.recent = this.recent.slice(0, 8); }
    this.onChange?.();
    return true;
  }
  stop(silent) {
    if (this.active && !silent) this.say('경로 안내를 종료합니다.');
    this.active = false; this.route = null; this.dest = null; this.auto = false;
    if (this.ribbon) { this.scene.remove(this.ribbon); this.ribbon.geometry.dispose(); this.ribbon = null; }
    this.pin.visible = false; this.board.visible = false;
    this.info = null;
    this.onChange?.();
  }
  reroute(from, why) {
    if (!this.dest) return;
    const r = this.dest.routeFn ? this.dest.routeFn(from) : this.plan(from, this.dest, this.mode);
    if (!r) return;
    this.route = r; this.ci = 0; this.s = r.startS; this.offT = 0; this.offRoadT = 0;
    this.build3D();
    if (why !== 'silent') { this.say('경로를 이탈하여 재탐색합니다.'); this.toast?.('🧭 경로를 재탐색했어요', 'info', 1800); }
  }
  say(t) { if (this.voice && this.audio) this.audio.speak(t, true); }

  // ---------- 3D 경로 ----------
  pathPoints(step = 4, r = this.route) {
    if (!r) return [];
    const pts = [];
    const P = (L, s, o) => ({ x: L.from.x + L.dir.x * s + L.right.x * o, z: L.from.z + L.dir.z * s + L.right.z * o, y: linkY(L, s) });
    const off = (L) => L.median / 2 + (L.n * LANE_W) / 2;
    r.links.forEach((L, i) => {
      const a = i === 0 ? r.startS : L.s0, b = i === r.links.length - 1 ? r.goalS : L.s1;
      if (i > 0) {
        // 교차로 곡선 (3차 베지어)
        const A = r.links[i - 1];
        const p0 = P(A, A.s1, off(A)), p3 = P(L, L.s0, off(L));
        const h = Math.hypot(p3.x - p0.x, p3.z - p0.z) * (A === L.rev ? 0.9 : 0.5);
        const p1 = { x: p0.x + A.dir.x * h, z: p0.z + A.dir.z * h }, p2 = { x: p3.x - L.dir.x * h, z: p3.z - L.dir.z * h };
        for (let k = 1; k < 8; k++) {
          const u = k / 8, m = 1 - u;
          pts.push({ x: m * m * m * p0.x + 3 * m * m * u * p1.x + 3 * m * u * u * p2.x + u * u * u * p3.x, z: m * m * m * p0.z + 3 * m * m * u * p1.z + 3 * m * u * u * p2.z + u * u * u * p3.z, y: A.to.y });
        }
      }
      const n = Math.max(1, Math.ceil((b - a) / step));
      for (let k = 0; k <= n; k++) pts.push(P(L, a + ((b - a) * k) / n, off(L)));
    });
    return pts;
  }
  build3D() {
    if (this.ribbon) { this.scene.remove(this.ribbon); this.ribbon.geometry.dispose(); this.ribbon = null; }
    const r = this.route; if (!r) return;
    const pts = this.pathPoints(r.total > 30000 ? 15 : r.total > 8000 ? 8 : 4); // 서울 가는 길처럼 길면 점을 성기게
    this.pts = pts;
    if (pts.length > 1 && this.show3D) {
      const pos = [], uv = [], idx = [];
      let v = 0;
      const w = 1.25;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const rx = -tz, rz = tx;
        if (i > 0) v += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / 5;
        const y = (pts[i].y || 0) + 0.14;
        pos.push(pts[i].x + rx * w, y, pts[i].z + rz * w, pts[i].x - rx * w, y, pts[i].z - rz * w);
        uv.push(0, v, 1, v);
        if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      this.ribbon = new THREE.Mesh(geo, this.ribbonMat);
      this.ribbon.renderOrder = 2;
      this.ribbon.frustumCulled = false;
      this.scene.add(this.ribbon);
    }
    this.pin.position.set(r.goalPt.x, linkY(r.links[r.links.length - 1], r.goalS), r.goalPt.z);
    this.pin.visible = true;
  }

  // ---------- 매 프레임 ----------
  update(dt, P, ctx) {
    this.t += dt;
    this.ribbonTex.offset.y -= dt * 1.6;
    if (this.pin.visible) { this.pin.userData.head.position.y = 7.6 + Math.sin(this.t * 3) * 0.5; this.pin.userData.ring.scale.setScalar(1 + (this.t % 1.2) * 0.4); this.pin.userData.ring.material.opacity = 0.8 - (this.t % 1.2) * 0.6; }
    this.tick -= dt;
    if (this.tick > 0) { this.updateBoard(ctx); return this.info; }
    this.tick = 0.2;
    const x = P.x, z = P.z, heading = P.heading, kmh = P.kmh;
    this.level = P.level || 'surface';
    this.updateCams(x, z, heading, kmh, ctx);
    if (!this.active || !this.route) { this.info = null; return null; }
    const r = this.route;
    // 현재 위치 → 경로 진행 상황
    const sl = this.startLinkAt(x, z, heading);
    const ri = roadInfoAt(x, z, this.level === 'hwy' ? 'hwy' : 'surface');
    const onRoad = !!ri.link;
    if (sl && onRoad) {
      let found = -1;
      for (let k = this.ci; k < Math.min(r.links.length, this.ci + 4); k++) if (r.links[k] === sl.L) { found = k; break; }
      if (found >= 0) { this.ci = found; this.s = sl.s; this.offT = 0; }
      else {
        const L = sl.L;
        const inside = sl.s > L.s0 + 4 && sl.s < L.s1 - 4;
        // 지금 링크가 경로의 다음 교차로 이전 구간과 같은 도로·같은 방향이면 무시 (교차로 통과 중)
        if (inside && kmh > 2) this.offT += 0.2;
        if (this.offT > 1.4) { this.reroute({ x, z, heading }); return this.info; }
      }
      this.offRoadT = 0;
    } else if (kmh > 3) {
      this.offRoadT += 0.2;
      const L = r.links[this.ci];
      const lat = Math.abs((x - L.from.x) * L.right.x + (z - L.from.z) * L.right.z);
      if (this.offRoadT > 3 && lat > 40) { this.reroute({ x, z, heading }); return this.info; }
    }
    const p = r.cum[this.ci] + this.s;
    const remain = Math.max(0, r.total - p);
    // 도착
    if ((this.ci === r.links.length - 1 && Math.abs(this.s - r.goalS) < 16) || Math.hypot(x - r.goalPt.x, z - r.goalPt.z) < 18) {
      const d = this.dest;
      if (!this.auto) this.say('목적지 부근에 도착했습니다. 안내를 종료합니다.');
      this.stop(true);
      this.onArrive?.(d);
      return null;
    }
    // 다음 안내 지점
    let mi = r.man.findIndex((m) => m.at > p + 1);
    if (mi < 0) mi = r.man.length - 1;
    const m = r.man[mi], m2 = r.man[mi + 1];
    const dNext = m.at - p;
    // 음성 안내
    const hwy = r.links[this.ci].edge.kind === 'highway';
    const ths = hwy ? [1500, 700, 250] : [600, 300, 120];
    for (const th of ths) {
      if (dNext <= th && dNext > th * 0.45 && !m.said.has(th)) {
        m.said.add(th);
        for (const t2 of ths) if (t2 > th || (t2 !== ths[2] && t2 >= dNext - 90)) m.said.add(t2);
        let msg;
        const near = th === ths[2];
        if (m.t === 'G') msg = near ? '잠시 후 목적지에 도착합니다.' : `${spokenDist(dNext)} 앞 목적지입니다.`;
        else {
          const w = m.toHwy ? '고속도로 진입' : m.offHwy ? '고속도로 출구' : TURN_WORD[m.t];
          msg = (near ? '잠시 후 ' : spokenDist(dNext) + ' 앞에서 ') + w + '입니다.' + (m.road && m.t !== 'S' ? ` ${m.road} 방면입니다.` : m.t === 'S' ? ` ${m.road} 방면으로 직진하세요.` : '');
          if (near && m2 && m2.at - m.at < 150) msg += ` 이어서 ${m2.t === 'G' ? '목적지입니다' : TURN_WORD[m2.t] + '입니다'}.`;
          if (!near && (m.t === 'L' || m.t === 'U') && r.links[this.ci].n > 1) msg += ' 1차로로 이동하세요.';
          if (!near && m.t === 'R' && r.links[this.ci].n > 1) msg += ' 오른쪽 차로로 이동하세요.';
        }
        this.say(msg);
        break;
      }
    }
    // 차로 안내
    const Lc = r.links[this.ci];
    let lanes = null;
    if (m.t !== 'G' && m.i === this.ci && dNext < 450 && Lc.n > 1) {
      lanes = [];
      for (let k = 0; k < Lc.n; k++) {
        const busLane = Lc.bus && k === Lc.n - 1;
        const arr = k === 0 ? (Lc.n >= 3 ? 'L' : 'LS') : k === Lc.n - 1 ? 'SR' : 'S';
        const want = m.t === 'U' ? 'L' : m.t;
        const rec = arr.includes(want) && !(busLane && want === 'S');
        lanes.push({ rec, arr, bus: busLane });
      }
    }
    // 도착 예정
    let tRemain = 0;
    for (let k = this.ci; k < r.links.length; k++) {
      const L = r.links[k];
      const a = k === this.ci ? this.s : 0, b = k === r.links.length - 1 ? r.goalS : L.len;
      tRemain += Math.max(0, b - a) / ((L.limit * 0.7) / 3.6);
      if (k < r.links.length - 1 && L.to.signal) tRemain += 12;
    }
    this.info = { m, m2, dNext, remain, tRemain, lanes, dest: this.dest, road: m.road, ci: this.ci, p };
    this.updateBoard(ctx);
    return this.info;
  }
  updateBoard(ctx) {
    const inf = this.info;
    if (!inf || !this.show3D || inf.m.t === 'G' || inf.dNext > 260 || inf.dNext < 4 || !inf.m.node) { this.board.visible = false; return; }
    const r = this.route, A = r && r.links[inf.m.i];
    if (!A) { this.board.visible = false; return; }
    const n = inf.m.node;
    const back = A.n * LANE_W * 0.5 + A.median / 2;
    const ext = A.len - A.s1 + 4;
    this.board.position.set(n.x - A.dir.x * ext + A.right.x * back, n.y + 9 + Math.sin(this.t * 2.4) * 0.3, n.z - A.dir.z * ext + A.right.z * back);
    this.board.rotation.set(0, A.heading + Math.PI, 0);
    const [u, v] = ATLAS[inf.m.t] || ATLAS.S;
    this.boardMat.map.repeat.set(0.5, 0.5); this.boardMat.map.offset.set(u, v);
    this.board.visible = true;
    if (ctx && ctx.camPos) { const d = Math.hypot(ctx.camPos.x - this.board.position.x, ctx.camPos.z - this.board.position.z); this.board.material.opacity = Math.min(1, Math.max(0, (d - 8) / 25)); }
  }
  // 과속 단속 카메라: 안내 · 단속
  updateCams(x, z, heading, kmh, ctx) {
    const sl = this.startLinkAt(x, z, heading);
    const ri = roadInfoAt(x, z, this.level === 'hwy' ? 'hwy' : 'surface');
    this.camAhead = null;
    if (!sl || !ri.link) { this.lastCamS = null; return; }
    const L = sl.L;
    // 단속 (링크 위에서 카메라 지점을 지남)
    if (this.lastCamS && this.lastCamS.L === L) {
      for (const c of W.cams) if (c.link === L && this.lastCamS.s < c.s && sl.s >= c.s) { if (kmh > c.limit + 3) this.onCamera?.(c, kmh); }
    }
    this.lastCamS = { L, s: sl.s };
    // 앞쪽 600m 안의 카메라
    let best = null;
    const look = (Lk, base) => { for (const c of W.cams) if (c.link === Lk) { const d = base + c.s; if (d > 0 && d < 600 && (!best || d < best.d)) best = { c, d }; } };
    look(L, -sl.s);
    let nx = null;
    if (this.active && this.route && this.route.links[this.ci] === L) nx = this.route.links[this.ci + 1];
    else nx = L.to.out.find((o) => o.dir.x === L.dir.x && o.dir.z === L.dir.z);
    if (nx) look(nx, L.len - sl.s);
    if (best) {
      this.camAhead = best;
      const key = best.c.id;
      if (best.d < 350 && !this.camSaid.has(key)) { this.camSaid.add(key); this.say(`전방에 과속 단속 카메라가 있습니다. 제한속도 ${best.c.limit}킬로미터입니다.`); setTimeout(() => this.camSaid.delete(key), 60000); }
    }
  }

  // ---------- 지도 그리기 ----------
  drawWorld(g, width = 6, color = '#39c6ff') {
    if (!this.route || !this.pts) return;
    const pts = this.pts;
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = width + 4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z))); g.stroke();
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
    const gp = this.route.goalPt;
    g.fillStyle = '#ff3d6e'; g.beginPath(); g.arc(gp.x, gp.z, width * 1.6, 0, Math.PI * 2); g.fill();
  }
  drawMap(g, X, Y, route = this.route, color = '#39c6ff', w = 5) {
    if (!route) return;
    const pts = route === this.route ? this.pts : (route._pts || (route._pts = this.pathPoints(12, route)));
    if (!pts || !pts.length) return;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = w + 3; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z)))); g.stroke();
    g.strokeStyle = color; g.lineWidth = w; g.stroke();
    const gp = route.goalPt;
    g.fillStyle = '#ff3d6e'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X(gp.x), Y(gp.z), 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
export { fmtDist, spokenDist };
