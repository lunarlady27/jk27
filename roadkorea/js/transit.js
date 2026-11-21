// 대중교통 타기: 시내버스 승객 · 광주 도시철도 1호선
import * as THREE from 'three';
import { W, edgesNear, lanePos, linkY } from './roadnet.js';
import { A, toXZ } from './gwangju.js';
import { BUS_TYPES } from './data.js';
import { S } from './state.js';
import { won, clamp, canvasTex } from './util.js';

// 광주 도시철도 1호선 (녹동 ↔ 평동, 20개 역)
export const METRO = [
  ['녹동', '녹동'], ['소태', '소태'], ['학동·증심사입구', '학동'], ['남광주', '남광주'], ['문화전당', '5·18광장'],
  ['금남로4가', '금남로4가'], ['금남로5가', '금남로5가'], ['양동시장', '양동시장'], ['돌고개', '돌고개'], ['농성', '농성'],
  ['화정', '화정'], ['쌍촌', '쌍촌'], ['운천', '운천'], ['상무', '상무'], ['김대중컨벤션센터', '김대중센터'],
  ['공항', '공항입구'], ['송정공원', '송정공원'], ['광주송정', '송정역'], ['도산', '도산'], ['평동', '평동'],
];
const LINE_COLOR = '#00a54f';
const METRO_FARE = 1250;
const SEG_T = 9, DWELL_T = 4; // 역 사이 주행 · 정차 시간(초)

const $ = (q) => document.querySelector(q);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const destOf = (R) => { const p = String(R.dest || '').split('↔').map((x) => x.trim()).filter(Boolean); return p.length > 1 ? p[p.length - 1] : p[0] || ''; };

// 가장 가까운 보도 위 지점 (지상 도로 가장자리 바깥)
function sidewalkNear(x, z) {
  let best = null;
  for (let r = 0; r <= 2 && !best; r++) {
    const seen = new Set();
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      for (const e of edgesNear(x + dx * 60, z + dz * 60)) {
        if (seen.has(e) || e.elevated || e.ramp || e.kind === 'highway' || e.kind === 'alley') continue;
        seen.add(e);
        const s = clamp((x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z, 8, e.len - 8);
        const px = e.a.x + e.dir.x * s, pz = e.a.z + e.dir.z * s;
        const rx = -e.dir.z, rz = e.dir.x;
        const side = ((x - px) * rx + (z - pz) * rz) >= 0 ? 1 : -1;
        const off = e.hw + 2.2;
        const q = { x: px + rx * side * off, z: pz + rz * side * off, h: Math.atan2(e.dir.x, e.dir.z), side, e };
        const d = Math.hypot(px - x, pz - z);
        if (!best || d < best.d) best = { ...q, d };
      }
    }
  }
  return best;
}

export class Transit {
  constructor(app) {
    this.app = app; // { scene, camera, audio, toast, traffic, G, placeFoot(x,z,h), hidePerson(b) }
    this.mode = null; // null | 'wait' | 'bus' | 'metro'
    this.stations = [];
    this.rideCam = 0;
  }

  // ---------- 지하철 노선 (기본: 광주 1호선 · 관리자에서 고칠 수 있음) ----------
  static defaultLines() {
    const st = [];
    for (const [name, key] of METRO) { const ll = A[key]; if (!ll) continue; const p = toXZ(ll[0], ll[1]); st.push({ name, x: Math.round(p.x), z: Math.round(p.z) }); }
    return [{ id: 'L1', name: '1호선', color: LINE_COLOR, stations: st }];
  }
  build(scene, lines) {
    this.scene = scene;
    this.lines = (lines && lines.length ? lines : Transit.defaultLines()).map((L) => ({ ...L, org: L.org || '광주 도시철도', stations: L.stations.map((x) => ({ ...x })) }));
    if (this.group) scene.remove(this.group);
    this.group = new THREE.Group(); scene.add(this.group);
    for (let k = W.landmarks.length - 1; k >= 0; k--) if (W.landmarks[k].metro) W.landmarks.splice(k, 1);
    this.stations = [];
    this.lines.forEach((line, li) => line.stations.forEach((stn, i) => this.entrance(line, li, stn, i, false)));
    // 서울 · 대전 등 나중에 받은 도시 노선
    const extra = this.extraLines || []; this.extraLines = [];
    if (extra.length) this.addLines(extra);
  }
  // 다른 도시 지하철 (지도를 받을 때 추가) — lines: subway.js 노선
  addLines(lines) {
    this.extraLines = this.extraLines || [];
    for (const L of lines) {
      if (this.extraLines.includes(L) || L.city === 'gwangju') continue;
      this.extraLines.push(L);
      const line = { id: L.city + L.id, region: L.city, name: L.name, color: L.color, org: (L.cityKo || '') + ' 도시철도', stations: L.st.map((x) => ({ name: x.name, x: x.x, z: x.z })) };
      this.lines.push(line);
      const li = this.lines.length - 1;
      line.stations.forEach((stn, i) => this.entrance(line, li, stn, i, true));
    }
  }
  entrance(line, li, stn, i, simple) {
    const M = Transit.mats || (Transit.mats = {
      glass: new THREE.MeshStandardMaterial({ color: 0x9fd8c8, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x2c3a40, roughness: 0.5, metalness: 0.6 }),
      stair: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 }),
    });
    const lc = line._mat || (line._mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color), roughness: 0.6 }));
    const box = Transit.box || (Transit.box = new THREE.BoxGeometry(1, 1, 1));
    const sw = sidewalkNear(stn.x, stn.z);
    const pos = sw || { x: stn.x, z: stn.z, h: 0, side: 1 };
    // 같은 자리에 다른 노선 입구가 있으면 옆으로 비킴
    const twin = this.stations.find((o) => Math.hypot(o.x - pos.x, o.z - pos.z) < 8);
    if (twin) { pos.x += Math.sin(pos.h) * 9; pos.z += Math.cos(pos.h) * 9; }
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z); g.rotation.y = pos.h;
    const add = (m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(box, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = !simple; g.add(o); return o; };
    add(M.frame, 0.12, 2.6, 0.12, -1.3, 1.3, -2.4); add(M.frame, 0.12, 2.6, 0.12, 1.3, 1.3, -2.4);
    add(M.frame, 0.12, 2.6, 0.12, -1.3, 1.3, 2.4); add(M.frame, 0.12, 2.6, 0.12, 1.3, 1.3, 2.4);
    add(M.glass, 2.7, 0.08, 5.0, 0, 2.62, 0);
    add(M.glass, 0.06, 2.4, 4.8, -1.32, 1.3, 0); add(M.glass, 0.06, 2.4, 4.8, 1.32, 1.3, 0);
    add(lc, 2.8, 0.25, 5.1, 0, 2.8, 0);
    for (let k = 0; k < (simple ? 3 : 6); k++) add(M.stair, 2.4, 0.12, simple ? 1.2 : 0.6, 0, -0.1 - k * (simple ? 0.56 : 0.28), -1.2 + k * (simple ? 1.2 : 0.6));
    const num = String(line.name).replace(/[^0-9]/g, '') || String(line.name).slice(0, 2);
    const W2 = simple ? 256 : 512, H2 = simple ? 64 : 128, f = W2 / 512;
    const tex = canvasTex(W2, H2, (c) => {
      c.scale(f, f);
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 128);
      c.fillStyle = line.color; c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = `900 ${num.length > 1 && !/^[0-9]+$/.test(num) ? 34 : 52}px sans-serif`; c.textAlign = 'center'; c.fillText(num.slice(0, 2), 64, 82);
      c.fillStyle = '#111'; c.textAlign = 'left'; c.font = '900 46px sans-serif'; c.fillText(String(stn.name).slice(0, 9) + '역', 128, 68);
      c.fillStyle = '#556'; c.font = '700 22px sans-serif'; c.fillText(line.org + ' ' + line.name + ' · ' + String((li + 1) * 100 + i + 1), 130, 106);
    });
    const sm = new THREE.MeshBasicMaterial({ map: tex });
    const sg = Transit.signG || (Transit.signG = new THREE.PlaneGeometry(2.6, 0.65));
    for (const zz of [2.58, -2.58]) { const sgn = new THREE.Mesh(sg, sm); sgn.position.set(0, 3.25, zz); if (zz < 0) sgn.rotation.y = Math.PI; g.add(sgn); }
    add(M.frame, 0.1, 3.4, 0.1, 1.9, 1.7, 2.6);
    const mg = Transit.markG || (Transit.markG = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24));
    const mk = new THREE.Mesh(mg, lc); mk.rotation.x = Math.PI / 2; mk.position.set(1.9, 3.6, 2.6); g.add(mk);
    this.group.add(g);
    this.stations.push({ line, li, i, name: stn.name, x: pos.x, z: pos.z, h: pos.h, side: pos.side });
    W.landmarks.push({ name: `지하철 ${stn.name}역`, x: pos.x, z: pos.z, r: 18, metro: true });
  }

  nearStation(x, z, r = 7) { let b = null, bd = r; for (const s of this.stations) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; b = s; } } return b; }
  nearStop(x, z, r = 7) {
    let b = null, bd = r;
    for (const st of W.stops) { if (!st.routes.length) continue; const d = Math.hypot(st.wait.x - x, st.wait.z - z); if (d < bd) { bd = d; b = st; } }
    return b;
  }
  routesAt(st) { return W.routes.filter((R) => R.stops.includes(st) && R.active !== false); }

  get busy() { return !!this.mode; }
  get riding() { return this.mode === 'bus' || this.mode === 'metro'; }
  // 플레이어(사람)의 실제 위치 — 교통 생성 중심
  pos() {
    if (this.mode === 'bus' && this.bus) return { x: this.bus.x, z: this.bus.z };
    return null;
  }

  // ---------- 안내 문구 ----------
  prompt(px, pz) {
    if (this.mode === 'wait') {
      const a = this.bus;
      if (a && a.active && a.link === this.stop.link && a.dwell > 0.6) return `E: ${this.R.id}번 버스 타기 (${won(this.fare())}) · Q: 그만 기다리기`;
      const eta = this.eta();
      return `🚏 ${this.stop.name} · ${this.R.id}번 ${destOf(this.R)} 방면 ${eta == null ? '오는 중' : eta < 20 ? '곧 도착' : '약 ' + Math.ceil(eta / 60) + '분 뒤 도착'} · Q: 그만 기다리기`;
    }
    if (this.mode) return '';
    const ms = this.nearStation(px, pz);
    if (ms) return `E: 🚇 지하철 ${ms.line.name} ${ms.name}역 타기`;
    const st = this.nearStop(px, pz);
    if (st) return `E: 🚏 ${st.name} 정류장에서 버스 타기 (${st.routes.length}개 노선)`;
    return null;
  }

  // ---------- E 키 ----------
  interact(px, pz) {
    if (this.mode === 'wait') {
      const a = this.bus;
      if (a && a.active && a.link === this.stop.link && a.dwell > 0.6) this.board();
      return true;
    }
    if (this.mode === 'bus') { this.bell(); return true; }
    if (this.mode) return true;
    const ms = this.nearStation(px, pz);
    if (ms) { this.openMetroPicker(ms); return true; }
    const st = this.nearStop(px, pz);
    if (st) { this.openBusPicker(st); return true; }
    return false;
  }
  key(code) {
    if (!this.mode) return false;
    if (code === 'KeyQ' || code === 'Escape') { if (this.mode === 'wait') { this.cancelWait(); return true; } if (this.mode === 'bus') { this.bell(); return true; } return code === 'KeyQ'; }
    if (code === 'KeyB' && this.mode === 'bus') { this.bell(); return true; }
    if (code === 'KeyC' && this.mode === 'bus') { this.rideCam = (this.rideCam + 1) % 3; this.app.toast(['💺 앞좌석 시점', '🪟 창가 시점', '🎥 바깥 시점'][this.rideCam], 'info', 1000); return true; }
    if (this.mode === 'metro' && code === 'KeyF') { this.metro.fast = !this.metro.fast; return true; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'].includes(code)) return this.riding;
    return false;
  }

  // ---------- 버스 ----------
  fare() { return (BUS_TYPES[this.R?.type] || BUS_TYPES.trunk).fare; }
  openBusPicker(st) {
    const rs = this.routesAt(st);
    if (!rs.length) return this.app.toast('이 정류장을 지나는 노선이 없어요', 'warn');
    this.picker(`🚏 ${st.name} 정류장`, '탈 버스를 골라요. 버스가 오면 E로 타요.', rs.map((R) => {
      const T = BUS_TYPES[R.type] || BUS_TYPES.trunk;
      const i = R.stops.indexOf(st), nx = R.stops[(i + 1) % R.stops.length];
      return { html: `<span class="tp-badge" style="background:${R.color}">${T.ko}</span><b>${R.id}</b> <span>${destOf(R)} 방면</span><small>다음: ${nx ? nx.name : '-'} · ${won(T.fare)}</small>`, fn: () => this.startWait(st, R) };
    }));
  }
  startWait(st, R) {
    this.mode = 'wait'; this.stop = st; this.R = R; this.bus = null; this.waitT = 0;
    this.summon();
    this.app.toast(`🚏 ${R.id}번 버스를 기다려요 · ${destOf(R)} 방면`, 'info', 2500);
  }
  summon() {
    const tr = this.app.traffic, R = this.R, st = this.stop;
    const buses = tr.cars.filter((a) => a.isBus);
    const cam = this.app.camera.position;
    // 이미 이 노선을 달리며 가까이 오는 버스가 있으면 그 버스
    let a = buses.find((b) => b.active && b.R === R && this.distAlong(b) != null && this.distAlong(b) < 250);
    if (!a) a = buses.filter((b) => !b.keep).sort((p, q) => (q.active ? Math.hypot(q.x - cam.x, q.z - cam.z) : 1e9) - (p.active ? Math.hypot(p.x - cam.x, p.z - cam.z) : 1e9))[0];
    if (!a) return;
    if (a.R !== R) { a.R = R; a.busType = R.type; if (a.obj.setSign) a.obj.setSign(R.id, R.dest, R.color); }
    a.keep = true;
    if (this.distAlong(a) == null || this.distAlong(a) > 250) {
      const k = R.links.indexOf(st.link);
      // 정류장에서 약 120m 뒤(노선 기준)에 버스를 등장시킴
      let need = 120 - Math.max(0, st.s - st.link.s0), L = st.link, sp = Math.max(st.link.s0 + 3, st.s - 120);
      if (need > 0 && st.s - st.link.s0 < 80) {
        let j = k;
        for (let n = 0; n < R.links.length; n++) {
          j = (j - 1 + R.links.length) % R.links.length;
          const Lj = R.links[j];
          const minS = Lj.stop && R.stopLinks.has(Lj.id) ? Lj.stop.s + 4 : Lj.s0 + 3;
          L = Lj; sp = Math.max(minS, Lj.s1 - need);
          if (Lj.s1 - minS >= need || minS > Lj.s0 + 3) break;
          need -= Lj.s1 - Lj.s0;
        }
      }
      tr.spawnOnLink(a, L, Math.min(sp, L.s1 - 1), L.n - 1);
    }
    a.served = -1;
    this.bus = a;
  }
  // 버스가 노선을 따라 정류장까지 남은 거리
  distAlong(a) {
    const R = this.R, st = this.stop; if (!a.active || a.R !== R) return null;
    const k = R.links.indexOf(st.link); if (k < 0) return null;
    let i = a.ri, d = 0;
    if (R.links[i] !== a.link) { i = R.links.indexOf(a.link); if (i < 0) return null; }
    if (i === k) { const r = st.s - a.s; return r > -2 ? Math.max(0, r) : null; }
    d = a.link.len - a.s;
    for (let n = 0; n < 60; n++) { i = (i + 1) % R.links.length; if (i === k) return d + st.s; d += R.links[i].len; }
    return null;
  }
  eta() { const a = this.bus; if (!a) return null; const d = this.distAlong(a); return d == null ? null : d / Math.max(4, a.v || 0); }
  cancelWait() { if (this.bus) this.bus.keep = false; this.mode = null; this.bus = null; this.app.toast('기다리기를 그만뒀어요', 'info', 1200); }
  board() {
    const fare = this.fare();
    if (S.money < fare) return this.app.toast('교통비가 모자라요', 'bad');
    S.money -= fare;
    this.mode = 'bus'; this.belled = false; this.lastSaid = null; this.rideCam = 0; this.boardStop = this.stop;
    this.app.hidePerson(true);
    this.app.audio.beep();
    this.app.toast(`💳 삑! <b>-${won(fare)}</b> ${this.R.id}번 탑승 · B: 하차벨 · C: 시점`, 'money', 3500);
    this.app.audio.speak(`이 버스는 ${destOf(this.R)} 방면 ${this.R.id}번 버스입니다.`, true);
    this.panel(true);
  }
  nextStop() {
    const a = this.bus, R = this.R;
    let i = R.links.indexOf(a.link); if (i < 0) i = a.ri;
    if (a.link.stop && R.stopLinks.has(a.link.id) && a.served !== a.link.id && a.s < a.link.stop.s + 1) return a.link.stop;
    for (let n = 1; n < R.links.length; n++) { const L = R.links[(i + n) % R.links.length]; if (L.stop && R.stopLinks.has(L.id)) return L.stop; }
    return null;
  }
  bell() {
    if (this.mode !== 'bus' || this.belled) return;
    this.belled = true; this.app.audio.chime();
    this.app.toast('🔔 하차벨! 다음 정류장에서 내려요', 'info', 1800);
  }
  getOff(st) {
    const a = this.bus;
    a.keep = false;
    const p = st ? st.wait : { x: a.x - a.fz * 3, z: a.z + a.fx * 3 };
    this.mode = null; this.bus = null;
    this.app.hidePerson(false);
    this.app.placeFoot(p.x, p.z, a.heading);
    this.panel(false);
    this.app.toast(`🚏 ${st ? st.name : '정류장'}에서 내렸어요`, 'good', 2500);
    this.app.quest?.('busride', 1);
  }

  // ---------- 지하철 ----------
  openMetroPicker(ms) {
    const here = this.stations.filter((o) => Math.hypot(o.x - ms.x, o.z - ms.z) < 14);
    const items = [];
    for (const at of here) {
      const line = at.line, st = line.stations;
      this.stations.filter((s) => s.line === line && s.i !== at.i).forEach((s) => {
        const n = Math.abs(s.i - at.i), dir = (s.i > at.i ? st[st.length - 1].name : st[0].name) + ' 방면';
        items.push({ html: `<span class="tp-badge" style="background:${line.color}">${esc(line.name)}</span><b>${esc(s.name)}</b> <span>${esc(dir)}</span><small>${n}개 역 · 약 ${Math.max(1, Math.round((n * (SEG_T + DWELL_T)) / 60))}분 · ${won(METRO_FARE)}</small>`, fn: () => this.startMetro(at, s) });
      });
    }
    if (!items.length) return this.app.toast('이 노선에는 다른 역이 없어요', 'warn');
    this.picker(`🚇 ${here.map((h) => esc(h.line.name)).join(' · ')} ${esc(ms.name)}역`, '어디까지 갈까요? (교통카드 ' + won(METRO_FARE) + ')', items);
  }
  startMetro(from, to) {
    if (S.money < METRO_FARE) return this.app.toast('교통비가 모자라요', 'bad');
    S.money -= METRO_FARE;
    this.mode = 'metro';
    const dir = to.i > from.i ? 1 : -1;
    const line = from.line, NM = line.stations.map((x) => x.name);
    this.metro = { line, NM, color: line.color, from, to, dir, pos: from.i, phase: 'dwell', t: 0, said: -1, fast: false, quit: false };
    this.app.hidePerson(true);
    this.app.audio.beep();
    this.app.audio.speak(`이 열차는 ${dir > 0 ? NM[NM.length - 1] : NM[0]}행 열차입니다.`, true);
    this.openMetroView();
  }
  openMetroView() {
    let el = $('#metro');
    if (!el) {
      el = document.createElement('div'); el.id = 'metro';
      el.innerHTML = `<canvas id="metro-cv"></canvas>
        <div class="mt-bar"><button id="mt-fast">⏩ 빨리 가기 (F)</button><button id="mt-off">🚪 다음 역에서 내리기</button></div>`;
      document.body.appendChild(el);
      $('#mt-fast').onclick = () => { this.metro.fast = !this.metro.fast; };
      $('#mt-off').onclick = () => { this.metro.quit = true; this.app.toast('🚪 다음 역에서 내려요', 'info', 1500); };
    }
    el.classList.remove('hidden');
  }
  updateMetro(dt) {
    const m = this.metro, k = m.fast ? 4 : 1;
    m.t += dt * k;
    const nextI = m.pos + (m.phase === 'run' ? 0 : m.dir);
    if (m.phase === 'dwell') {
      if (m.t > DWELL_T) {
        if (m.pos === m.to.i || (m.quit && m.pos !== m.from.i)) return this.endMetro();
        m.phase = 'run'; m.t = 0; m.seg = m.pos; this.app.audio.chime();
      }
    } else {
      const u = clamp(m.t / SEG_T, 0, 1);
      const cur = m.seg + m.dir * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      m.posF = cur;
      const target = m.seg + m.dir;
      if (m.said !== target && u > 0.25) {
        m.said = target;
        const nm = m.NM[target], nn = m.NM[target + m.dir];
        this.app.audio.speak(`이번 역은 ${nm}역입니다.${target === m.to.i ? ' 내리실 역입니다.' : nn ? ` 다음 역은 ${nn}역입니다.` : ''}`, true);
      }
      if (u >= 1) { m.pos = target; m.posF = target; m.phase = 'dwell'; m.t = 0; }
    }
    void nextI;
    this.drawMetro();
  }
  endMetro() {
    const m = this.metro, st = this.stations.find((s) => s.line === m.line && s.i === m.pos) || m.to;
    $('#metro')?.classList.add('hidden');
    this.mode = null; this.metro = null;
    this.app.hidePerson(false);
    const back = 3.5;
    this.app.placeFoot(st.x - Math.sin(st.h) * back, st.z - Math.cos(st.h) * back, st.h);
    this.app.toast(`🚇 ${st.name}역에서 내렸어요 · 지상으로 나왔어요`, 'good', 3000);
    this.app.quest?.('metro', 1);
  }
  drawMetro() {
    const cv = $('#metro-cv'); if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d'), m = this.metro, t = performance.now() / 1000;
    const moving = m.phase === 'run';
    const spd = moving ? Math.sin(clamp(m.t / SEG_T, 0, 1) * Math.PI) : 0;
    this.scroll = (this.scroll || 0) + spd * (m.fast ? 4 : 1) * 0.9;
    const vx = w / 2, vy = h * 0.46;
    // 천장·바닥·벽
    g.fillStyle = '#d9dde0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef0f1'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(vx + w * 0.12, vy - h * 0.14); g.lineTo(vx - w * 0.12, vy - h * 0.14); g.fill();
    g.fillStyle = '#9aa1a6'; g.beginPath(); g.moveTo(0, h); g.lineTo(w, h); g.lineTo(vx + w * 0.12, vy + h * 0.12); g.lineTo(vx - w * 0.12, vy + h * 0.12); g.fill();
    // 천장 조명
    for (let i = 0; i < 6; i++) { const f = i / 6, y = f * (vy - h * 0.14), hw = (1 - f) * w * 0.08 + w * 0.01; g.fillStyle = 'rgba(255,255,250,.95)'; g.fillRect(vx - hw, y + 6, hw * 2, Math.max(2, (1 - f) * 10)); }
    // 창문 (양쪽)
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const f0 = 0.12 + i * 0.26, f1 = f0 + 0.18;
        const x0 = sd < 0 ? w * f0 * 0.5 : w - w * f0 * 0.5, x1 = sd < 0 ? w * f1 * 0.5 : w - w * f1 * 0.5;
        const yT = (x) => vy - h * 0.14 - (Math.abs(x - vx) / (w / 2)) * (vy - h * 0.14) * 0.55;
        const yB = (x) => vy - (Math.abs(x - vx) / (w / 2)) * -h * 0.02;
        g.save(); g.beginPath();
        g.moveTo(x0, yT(x0) + 30); g.lineTo(x1, yT(x1) + 30); g.lineTo(x1, yB(x1) - 4); g.lineTo(x0, yB(x0) - 4); g.closePath(); g.clip();
        if (moving) {
          g.fillStyle = '#0b0d10'; g.fillRect(0, 0, w, h);
          for (let k = 0; k < 8; k++) { const xx = ((k * 140 - this.scroll * 60 * sd) % (w + 200) + w + 200) % (w + 200) - 100; g.fillStyle = 'rgba(255,220,150,.75)'; g.fillRect(xx, yT(xx) + 60, 50 + spd * 120, 4); }
        } else {
          g.fillStyle = '#c9d4d8'; g.fillRect(0, 0, w, h);
          g.fillStyle = m.color; g.fillRect(0, vy - h * 0.1, w, 18);
          g.fillStyle = '#fff'; g.font = `900 ${Math.round(Math.min(h * 0.03, Math.abs(x1 - x0) / Math.max(3, m.NM[m.pos].length) * 0.95))}px sans-serif`; g.textAlign = 'center';
          g.fillText(m.NM[m.pos], (x0 + x1) / 2, vy - h * 0.1 - 8);
          g.fillStyle = '#7b8a90'; g.fillRect(0, vy - h * 0.02, w, h);
        }
        g.restore();
        g.strokeStyle = '#7f878c'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, yT(x0) + 30); g.lineTo(x1, yT(x1) + 30); g.lineTo(x1, yB(x1) - 4); g.lineTo(x0, yB(x0) - 4); g.closePath(); g.stroke();
      }
      // 긴 의자
      g.fillStyle = '#2f7fb8'; g.beginPath();
      const ex = sd < 0 ? 0 : w, ix = vx + sd * w * 0.12;
      g.moveTo(ex, h * 0.78); g.lineTo(ix, vy + h * 0.06); g.lineTo(ix, vy + h * 0.1); g.lineTo(ex, h * 0.95); g.fill();
      // 손잡이 기둥
      g.strokeStyle = '#c9ced2'; g.lineWidth = 8;
      for (const f of [0.18, 0.42]) { const x = sd < 0 ? w * f : w - w * f; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    }
    // 끝 칸 문
    g.fillStyle = '#b8bec2'; g.fillRect(vx - w * 0.12, vy - h * 0.14, w * 0.24, h * 0.26);
    g.fillStyle = '#20262a'; g.fillRect(vx - w * 0.04, vy - h * 0.12, w * 0.08, h * 0.2);
    // LED 안내판
    const bw = Math.min(w * 0.62, 760), bx = vx - bw / 2, by = 14;
    g.fillStyle = '#111'; g.fillRect(bx, by, bw, 64);
    g.fillStyle = '#ff9a1a'; g.font = '800 26px sans-serif'; g.textAlign = 'center';
    const nxt = moving ? m.NM[m.seg + m.dir] : m.NM[m.pos];
    const msg = moving ? `이번 역은 ${nxt}역  ·  ${m.dir > 0 ? m.NM[m.NM.length - 1] : m.NM[0]}행` : `${m.NM[m.pos]}역입니다  ·  문이 열립니다`;
    g.save(); g.beginPath(); g.rect(bx + 6, by, bw - 12, 64); g.clip();
    const tw = g.measureText(msg).width, sx = bx + bw / 2 + (tw > bw - 20 ? Math.sin(t * 0.6) * (tw - bw + 30) / 2 : 0);
    g.fillText(msg, sx, by + 42); g.restore();
    // 노선도
    const ly = h - 118, lx0 = 40, lx1 = w - 60;
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(lx0 - 24, ly - 44, lx1 - lx0 + 64, 116);
    g.strokeStyle = m.color; g.lineWidth = 8; g.beginPath(); g.moveTo(lx0, ly); g.lineTo(lx1, ly); g.stroke();
    const n = m.NM.length, X = (i) => lx0 + ((lx1 - lx0) * i) / Math.max(1, n - 1);
    g.font = `700 ${w < 800 ? 9 : 12}px sans-serif`;
    for (let i = 0; i < n; i++) {
      const pass = m.dir > 0 ? i < Math.min(m.from.i, m.to.i) || i > Math.max(m.from.i, m.to.i) : i < Math.min(m.from.i, m.to.i) || i > Math.max(m.from.i, m.to.i);
      g.fillStyle = '#fff'; g.strokeStyle = pass ? '#9aa' : m.color; g.lineWidth = 3;
      g.beginPath(); g.arc(X(i), ly, i === m.to.i ? 9 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = i === m.to.i ? '#d8383a' : pass ? '#99a' : '#123';
      g.save(); g.translate(X(i), ly + 14); g.rotate(0.6); g.textAlign = 'left'; g.fillText(m.NM[i], 0, 0); g.restore();
    }
    const cur = m.posF != null && moving ? m.posF : m.pos;
    g.fillStyle = '#d8383a'; g.beginPath(); g.arc(X(cur), ly - 18, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#123'; g.font = '800 14px sans-serif'; g.textAlign = 'center'; g.fillText('🚇 지금', X(cur), ly - 30);
    // 남은 역
    const left = Math.abs(m.to.i - (moving ? m.seg + m.dir : m.pos));
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(16, 92, 250, 56);
    g.fillStyle = '#fff'; g.font = '800 18px sans-serif'; g.textAlign = 'left';
    g.fillText(`${m.to.name}역까지 ${left}개 역`, 28, 118);
    g.font = '600 13px sans-serif'; g.fillStyle = '#bfe9e4'; g.fillText(m.fast ? '⏩ 빨리 가는 중' : (m.line.org || '광주 도시철도') + ' ' + m.line.name, 28, 138);
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    if (this.mode === 'metro') return this.updateMetro(dt);
    if (this.mode === 'wait') {
      this.waitT += dt;
      const a = this.bus;
      if (!a || !a.active || a.R !== this.R) { this.summon(); return; }
      a.keep = true;
      // 문 열고 기다려 주기
      if (a.link === this.stop.link && a.dwell > 0) { a.dwell = Math.min(a.dwell, 5.5); this.holdT = (this.holdT || 0) + dt; if (this.holdT > 25) { this.holdT = 0; a.served = a.link.id; a.dwell = 0; this.app.toast('버스가 떠났어요. 다음 버스를 불러요', 'warn'); this.bus.keep = false; this.bus = null; } }
      else this.holdT = 0;
      if (this.distAlong(a) == null && !(a.link === this.stop.link)) { a.keep = false; this.bus = null; }
      return;
    }
    if (this.mode === 'bus') {
      const a = this.bus;
      if (!a || !a.active) { this.getOff(null); return; }
      a.keep = true;
      const st = this.nextStop();
      if (st && st !== this.lastSaid) {
        const d = a.link === st.link ? st.s - a.s : 1e9;
        const dd = d < 1e8 ? d : this.distTo(st);
        if (dd != null && dd < 260) {
          this.lastSaid = st;
          const i = this.R.stops.indexOf(st), nx = this.R.stops[(i + 1) % this.R.stops.length];
          this.app.audio.speak(`이번 정류장은 ${st.name}입니다.${nx ? ` 다음 정류장은 ${nx.name}입니다.` : ''}`, true);
          this.app.audio.chime();
        }
      }
      // 정차 중: 하차벨을 눌렀으면 내림
      if (a.dwell > 1.4 && a.link.stop && this.belled && a.link.stop !== this.boardStop) { this.getOff(a.link.stop); return; }
      if (a.dwell > 1.4 && a.link.stop) this.boardStop = a.link.stop === this.boardStop ? this.boardStop : null;
      this.updatePanel(st);
    }
  }
  distTo(st) {
    const a = this.bus, R = this.R; let i = R.links.indexOf(a.link); if (i < 0) return null;
    let d = a.link.len - a.s;
    for (let n = 1; n < 40; n++) { const L = R.links[(i + n) % R.links.length]; if (L === st.link) return d + st.s; d += L.len; }
    return null;
  }
  panel(on) {
    let el = $('#busride');
    if (!el) {
      el = document.createElement('div'); el.id = 'busride';
      el.innerHTML = '<div class="br-top"><span id="br-badge"></span><b id="br-route"></b><span id="br-dest"></span></div><div class="br-next"><small>다음 정류장</small><b id="br-next"></b></div><div class="br-btns"><button id="br-bell">🔔 하차벨 (B)</button><button id="br-cam">📷 시점 (C)</button></div>';
      $('#hud').appendChild(el);
      $('#br-bell').onclick = () => this.bell();
      $('#br-cam').onclick = () => this.key('KeyC');
    }
    el.classList.toggle('hidden', !on);
    if (on) { const T = BUS_TYPES[this.R.type] || BUS_TYPES.trunk; $('#br-badge').textContent = T.ko; $('#br-badge').style.background = this.R.color; $('#br-route').textContent = this.R.id; $('#br-dest').textContent = destOf(this.R) + ' 방면'; }
  }
  updatePanel(st) {
    const nb = $('#br-next'); if (!nb) return;
    const t = st ? st.name : '-';
    if (nb.textContent !== t) nb.textContent = t;
    $('#br-bell').classList.toggle('on', !!this.belled);
  }

  // ---------- 카메라 (버스 승객) ----------
  camera(cam, dt) {
    if (this.mode !== 'bus' || !this.bus) return false;
    const a = this.bus, y = a.obj.group.position.y;
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading), rx = -fz, rz = fx;
    const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
    if (this.rideCam === 0) { // 앞쪽 좌석
      pos.set(a.x + fx * (a.len * 0.18) - rx * 0.5, y + 2.15, a.z + fz * (a.len * 0.18) - rz * 0.5);
      tgt.set(a.x + fx * 40, y + 1.6, a.z + fz * 40);
    } else if (this.rideCam === 1) { // 창가 (오른쪽 보도 쪽)
      pos.set(a.x - fx * 1 + rx * 0.6, y + 2.0, a.z - fz * 1 + rz * 0.6);
      tgt.set(a.x + fx * 12 + rx * 25, y + 1.5, a.z + fz * 12 + rz * 25);
    } else {
      pos.set(a.x - fx * (a.len * 0.5 + 9), y + 5.5, a.z - fz * (a.len * 0.5 + 9));
      tgt.set(a.x + fx * 8, y + 1.8, a.z + fz * 8);
    }
    cam.near = 0.1;
    cam.position.lerp(pos, Math.min(1, dt * 10));
    cam.lookAt(tgt);
    return true;
  }

  // ---------- 고르기 창 ----------
  picker(title, sub, items) {
    let el = $('#tpick');
    if (!el) { el = document.createElement('div'); el.id = 'tpick'; document.body.appendChild(el); }
    el.innerHTML = `<div class="tp-card"><div class="tp-h"><b>${title}</b><small>${sub}</small></div><div class="tp-list">${items.map((it, i) => `<button data-i="${i}">${it.html}</button>`).join('')}</div><button class="tp-close">닫기</button></div>`;
    el.classList.remove('hidden');
    this.app.G.modal = true;
    const close = () => { el.classList.add('hidden'); this.app.G.modal = false; };
    el.querySelector('.tp-close').onclick = close;
    el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { close(); items[Number(b.dataset.i)].fn(); }; });
  }
}
export { linkY, lanePos };
