// ===================== 큐브랜드 — 시작 · 조작 · 화면 · 저장 =====================
import * as THREE from 'three';
import { World, B, INFO, HOTBAR, CS, CH, SEA, makeAtlas, tileIcon } from './world.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add('touch');
const SET = { dist: 4, sens: 1, fov: 75 };
try { Object.assign(SET, JSON.parse(localStorage.getItem('cl_set') || '{}')); } catch (e) { /* 무시 */ }

// ---------- 저장 (localStorage) ----------
const store = {
  list() { try { return JSON.parse(localStorage.getItem('cl_worlds') || '[]'); } catch (e) { return []; } },
  saveList(l) { try { localStorage.setItem('cl_worlds', JSON.stringify(l)); } catch (e) { /* 무시 */ } },
  load(id) { try { return JSON.parse(localStorage.getItem('cl_w_' + id) || 'null'); } catch (e) { return null; } },
  save(id, data) { try { localStorage.setItem('cl_w_' + id, JSON.stringify(data)); return true; } catch (e) { return false; } },
  del(id) { try { localStorage.removeItem('cl_w_' + id); } catch (e) { /* 무시 */ } },
};

// ---------- 메뉴 ----------
function menu() {
  show('menu');
  const L = store.list();
  $('#worlds').innerHTML = L.length ? L.map((w) => `<div class="wrow"><div><b>${esc(w.name)}</b><small>씨앗 ${w.seed} · ${new Date(w.t).toLocaleString('ko-KR')}</small></div><button data-play="${w.id}" class="primary">▶ 들어가기</button><button data-del="${w.id}" class="danger">지우기</button></div>`).join('') : '<p class="muted">아직 세계가 없어요. 새 세계를 만들어 보세요!</p>';
  document.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => { const w = L.find((x) => x.id === b.dataset.play); play(w); });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { if (b.dataset.sure) { store.del(b.dataset.del); store.saveList(L.filter((x) => x.id !== b.dataset.del)); menu(); } else { b.dataset.sure = 1; b.textContent = '정말 지우기'; } });
  $('#new').onclick = () => {
    const name = $('#wname').value.trim() || '나의 세계'; const seedTxt = $('#wseed').value.trim();
    const seed = seedTxt ? Math.abs([...seedTxt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 100000 : Math.floor(Math.random() * 100000);
    const w = { id: Date.now().toString(36), name, seed, t: Date.now() };
    store.saveList([w, ...L]); play(w);
  };
  $('#dist').value = SET.dist; $('#dist').oninput = (e) => { SET.dist = Number(e.target.value); $('#distv').textContent = SET.dist; saveSet(); }; $('#distv').textContent = SET.dist;
}
const saveSet = () => { try { localStorage.setItem('cl_set', JSON.stringify(SET)); } catch (e) { /* 무시 */ } };

// ---------- 게임 ----------
let G = null;
function play(meta) {
  show('play');
  const data = store.load(meta.id) || { edits: {}, pos: null, time: 0.3, slot: 0, fly: false };
  G = new Game(meta, data);
}
class Game {
  constructor(meta, data) {
    this.meta = meta; this.world = new World(meta.seed, data.edits || {}); this.world.indexEdits();
    const r = this.r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace;
    $('#view').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(SET.fov, 1, 0.05, 1000); this.cam.rotation.order = 'YXZ';
    this.atlas = makeAtlas();
    this.mat = new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
    this.wmat = new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x777766, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.8); this.scene.add(this.sun);
    this.scene.fog = new THREE.Fog(0x9fd0ff, 30, SET.dist * CS);
    // 해 · 달 · 구름
    this.sunM = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0xfff6c0, fog: false })); this.scene.add(this.sunM);
    this.moonM = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false })); this.scene.add(this.moonM);
    this.clouds = this.makeClouds(); this.scene.add(this.clouds);
    // 선택 상자
    this.sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.scene.add(this.sel);
    // 플레이어
    const sp = data.pos || this.spawnPoint();
    this.p = { x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, yaw: sp.yaw || 0, pitch: sp.pitch || 0, ground: false, fly: !!data.fly };
    this.time = data.time ?? 0.3; this.slot = data.slot || 0; this.parts = [];
    this.keys = {}; this.lastSave = performance.now(); this.locked = false; this.breakT = 0;
    this.buildHotbar(); this.resize();
    this.bind();
    this.last = performance.now(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    this.msg(touch ? '왼쪽 끌기: 이동 · 오른쪽 끌기: 둘러보기 · ⛏ 캐기 · 🧱 놓기' : '클릭해서 시작 · WASD 이동 · 클릭 캐기 · 우클릭 놓기 · F 날기 · E 블록 목록');
  }
  spawnPoint() {
    for (const want of ['plains', null]) for (let r = 0; r < 900; r += 12) for (let a = 0; a < 12; a++) { const x = Math.round(Math.sin(a / 12 * 6.283) * r), z = Math.round(Math.cos(a / 12 * 6.283) * r); const h = this.world.heightAt(x, z); if (h > SEA + 1 && h < SEA + 14 && (!want || this.world.biome(x, z) === want)) return { x: x + 0.5, y: h + 3, z: z + 0.5 }; }
    return { x: 0.5, y: SEA + 6, z: 0.5 };
  }
  makeClouds() {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 16, 2, 6 + Math.random() * 12), m); c.position.set((Math.random() - 0.5) * 300, 0, (Math.random() - 0.5) * 300); g.add(c); }
    g.position.y = CH + 12; return g;
  }
  resize() { const w = innerWidth, h = innerHeight; this.r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  // ---------- 핫바 ----------
  buildHotbar() {
    this.icons = {}; for (const id of HOTBAR.concat([B.ORE, B.CACTUS, B.PINE, B.BEDROCK])) this.icons[id] = tileIcon(this.atlas, id);
    this.bar = HOTBAR.slice(0, 9);
    this.drawBar();
    $('#inv').innerHTML = `<div class="card"><h2>블록 고르기</h2><p class="muted">눌러서 지금 칸에 넣기 · E로 닫기</p><div class="grid">${Object.keys(this.icons).map((id) => `<button data-blk="${id}" title="${INFO[id].n}"><img src="${this.icons[id]}"><small>${INFO[id].n}</small></button>`).join('')}</div></div>`;
    document.querySelectorAll('[data-blk]').forEach((b) => b.onclick = () => { this.bar[this.slot] = Number(b.dataset.blk); this.drawBar(); $('#inv').classList.add('hidden'); });
  }
  drawBar() { $('#bar').innerHTML = this.bar.map((id, i) => `<div class="slot ${i === this.slot ? 'on' : ''}" data-s="${i}"><img src="${this.icons[id]}"><i>${i + 1}</i></div>`).join(''); $('#bname').textContent = INFO[this.bar[this.slot]].n; document.querySelectorAll('[data-s]').forEach((d) => d.onclick = () => { this.slot = Number(d.dataset.s); this.drawBar(); }); }
  msg(t) { const m = $('#msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(this.mt); this.mt = setTimeout(() => (m.style.opacity = 0), 4500); }
  // ---------- 조작 ----------
  bind() {
    const el = this.r.domElement;
    this.on = [];
    const L = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this.on.push([t, ev, fn, o]); };
    L(window, 'keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (e.code === 'Space') { const now = performance.now(); if (now - (this.lastSpace || 0) < 280) this.toggleFly(); this.lastSpace = now; e.preventDefault(); }
      if (e.code === 'KeyF') this.toggleFly();
      if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)) - 1; if (n >= 0 && n < 9) { this.slot = n; this.drawBar(); } }
      if (e.code === 'KeyE') { $('#inv').classList.toggle('hidden'); if (!$('#inv').classList.contains('hidden')) document.exitPointerLock?.(); }
      if (e.code === 'KeyT') { this.time = (this.time + 0.25) % 1; }
      if (e.code === 'Escape') this.pause(true);
    });
    L(window, 'keyup', (e) => { this.keys[e.code] = false; });
    L(el, 'mousedown', (e) => {
      if (!this.locked) { el.requestPointerLock?.(); return; }
      if (e.button === 0) { this.mining = true; this.breakT = 0; }
      if (e.button === 2) this.place();
      if (e.button === 1) { const h = this.hit; if (h) { const i = this.bar.indexOf(h.id); if (i >= 0) this.slot = i; else this.bar[this.slot] = h.id; this.drawBar(); } }
    });
    L(window, 'mouseup', (e) => { if (e.button === 0) this.mining = false; });
    L(el, 'contextmenu', (e) => e.preventDefault());
    L(document, 'pointerlockchange', () => { this.locked = document.pointerLockElement === el; $('#cross').classList.toggle('hidden', !this.locked && !touch); });
    L(window, 'mousemove', (e) => { if (!this.locked) return; const k = 0.0022 * SET.sens; this.p.yaw -= e.movementX * k; this.p.pitch = Math.max(-1.55, Math.min(1.55, this.p.pitch - e.movementY * k)); });
    L(window, 'wheel', (e) => { if (!this.locked) return; this.slot = (this.slot + (e.deltaY > 0 ? 1 : 8)) % 9; this.drawBar(); });
    L(window, 'resize', () => this.resize());
    if (touch) this.bindTouch();
  }
  bindTouch() {
    $('#tpad').classList.remove('hidden');
    const st = { mv: null, lk: null, mx: 0, mz: 0 }; this.ts = st;
    const el = this.r.domElement, knob = $('#tknob'), stick = $('#tstick');
    el.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (t.clientX < innerWidth * 0.4 && !st.mv) { st.mv = { id: t.identifier, x: t.clientX, y: t.clientY }; stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; stick.classList.add('on'); } else if (!st.lk) st.lk = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 }; } e.preventDefault(); }, { passive: false });
    el.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (st.mv && t.identifier === st.mv.id) { let dx = (t.clientX - st.mv.x) / 45, dy = (t.clientY - st.mv.y) / 45; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } st.mx = dx; st.mz = dy; knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; } if (st.lk && t.identifier === st.lk.id) { const dx = t.clientX - st.lk.x, dy = t.clientY - st.lk.y; st.lk.moved += Math.abs(dx) + Math.abs(dy); this.p.yaw -= dx * 0.006 * SET.sens; this.p.pitch = Math.max(-1.55, Math.min(1.55, this.p.pitch - dy * 0.006 * SET.sens)); st.lk.x = t.clientX; st.lk.y = t.clientY; } } e.preventDefault(); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) { if (st.mv && t.identifier === st.mv.id) { st.mv = null; st.mx = st.mz = 0; knob.style.transform = ''; stick.classList.remove('on'); } if (st.lk && t.identifier === st.lk.id) { if (st.lk.moved < 10 && performance.now() - st.lk.t0 < 250) this.place(); st.lk = null; } } };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    const hold = (sel, on, off) => { const b = $(sel); b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); on(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); off && off(); }, { passive: false }); };
    hold('#tjump', () => { this.keys.Space = true; }, () => { this.keys.Space = false; });
    hold('#tdown', () => { this.keys.ShiftLeft = true; }, () => { this.keys.ShiftLeft = false; });
    hold('#tmine', () => { this.mining = true; this.breakT = 0; }, () => { this.mining = false; });
    hold('#tplace', () => this.place());
    hold('#tfly', () => this.toggleFly());
    hold('#tinv', () => $('#inv').classList.toggle('hidden'));
    hold('#tmenu', () => this.pause(true));
  }
  toggleFly() { this.p.fly = !this.p.fly; this.p.vy = 0; this.msg(this.p.fly ? '✈️ 날기 켜짐 (Space 위 · Shift 아래)' : '날기 꺼짐'); }
  pause(on) {
    if (on) {
      document.exitPointerLock?.();
      $('#pause').classList.remove('hidden');
      $('#pause').innerHTML = `<div class="card"><h2>멈춤</h2><label>둘러보기 감도 <input id="ps" type="range" min="0.3" max="3" step="0.1" value="${SET.sens}"></label><label>시야 거리 <input id="pd" type="range" min="2" max="8" step="1" value="${SET.dist}"> <b id="pdv">${SET.dist}</b> 청크</label><div class="row"><button id="pgo" class="primary big">계속하기</button><button id="psave">💾 저장</button><button id="pexit">저장하고 나가기</button></div><p class="muted">세계는 이 기기(브라우저)에 저장돼요. 30초마다 자동 저장.</p></div>`;
      $('#ps').oninput = (e) => { SET.sens = Number(e.target.value); saveSet(); };
      $('#pd').oninput = (e) => { SET.dist = Number(e.target.value); $('#pdv').textContent = SET.dist; saveSet(); this.scene.fog.far = SET.dist * CS; };
      $('#pgo').onclick = () => { this.pause(false); if (!touch) this.r.domElement.requestPointerLock?.(); };
      $('#psave').onclick = () => { this.save(); this.msg('저장했어요'); };
      $('#pexit').onclick = () => { this.save(); this.destroy(); menu(); };
    } else $('#pause').classList.add('hidden');
  }
  save() {
    const p = this.p;
    const ok = store.save(this.meta.id, { edits: this.world.edits, pos: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, time: this.time, slot: this.slot, fly: p.fly });
    const L = store.list(); const w = L.find((x) => x.id === this.meta.id); if (w) { w.t = Date.now(); store.saveList(L); }
    if (!ok) this.msg('⚠️ 저장 공간이 모자라요');
  }
  destroy() { cancelAnimationFrame(this.raf); for (const [t, ev, fn, o] of this.on) t.removeEventListener(ev, fn, o); this.r.dispose(); this.r.domElement.remove(); document.exitPointerLock?.(); G = null; }
  // ---------- 블록 캐기 · 놓기 ----------
  place() {
    const h = this.hit; if (!h) return;
    const { px, py, pz } = h, id = this.bar[this.slot];
    const p = this.p;
    if (px + 1 > p.x - 0.3 && px < p.x + 0.3 && pz + 1 > p.z - 0.3 && pz < p.z + 0.3 && py + 1 > p.y && py < p.y + 1.8 && id !== B.WATER) return;
    if (this.world.set(px, py, pz, id)) this.sound(300, 0.06);
  }
  breakBlock(h) {
    if (h.id === B.BEDROCK) return;
    this.world.set(h.x, h.y, h.z, B.AIR);
    this.sound(140, 0.08);
    // 부서지는 조각
    const t = INFO[h.id].t[1];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this.partMat(t));
      m.position.set(h.x + 0.5 + (Math.random() - 0.5) * 0.6, h.y + 0.5 + (Math.random() - 0.5) * 0.6, h.z + 0.5 + (Math.random() - 0.5) * 0.6);
      this.scene.add(m); this.parts.push({ m, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, t: 0.8 });
    }
  }
  partMat(t) { this.pm = this.pm || {}; if (!this.pm[t]) { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(this.atlas.userData.canvas, (t % 8) * 16 + 6, Math.floor(t / 8) * 16 + 6, 4, 4, 0, 0, 4, 4); const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter; this.pm[t] = new THREE.MeshLambertMaterial({ map: tx }); } return this.pm[t]; }
  sound(f, d) { try { this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)(); const a = this.ac, t = a.currentTime, b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length); const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.frequency.value = f * 6; const gn = a.createGain(); gn.gain.value = 0.25; s.connect(fl); fl.connect(gn); gn.connect(a.destination); s.start(t); } catch (e) { /* 무시 */ } }
  // ---------- 움직임 (상자 충돌) ----------
  solidAt(x, y, z) { const id = this.world.get(Math.floor(x), Math.floor(y), Math.floor(z)); return id !== B.AIR && id !== B.WATER; }
  collide(nx, ny, nz) { const W = 0.3; for (const dx of [-W, W]) for (const dz of [-W, W]) for (const dy of [0, 0.9, 1.75]) if (this.solidAt(nx + dx, ny + dy, nz + dz)) return true; return false; }
  move(dt) {
    const p = this.p, K = this.keys;
    let f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), s = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    if (this.ts && (this.ts.mx || this.ts.mz)) { f = -this.ts.mz; s = this.ts.mx; }
    const inWater = this.world.get(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)) === B.WATER;
    const sp = p.fly ? (K.ControlLeft ? 22 : 11) : (K.ControlLeft ? 6.2 : 4.4) * (inWater ? 0.55 : 1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let wx = fx * f + -fz * s * -1, wz = fz * f + fx * s * -1;
    wx = fx * f - fz * s; wz = fz * f + fx * s;
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const k = Math.min(1, dt * (p.ground || p.fly ? 14 : 4));
    p.vx += (wx * sp - p.vx) * k; p.vz += (wz * sp - p.vz) * k;
    if (p.fly) { p.vy = ((K.Space ? 1 : 0) - (K.ShiftLeft ? 1 : 0)) * sp * 0.8; }
    else if (inWater) { p.vy = K.Space ? 3 : Math.max(p.vy - 8 * dt, -2.5); }
    else { p.vy -= 24 * dt; if (K.Space && p.ground) { p.vy = 8.2; p.ground = false; } p.vy = Math.max(p.vy, -40); }
    // 축마다 따로
    const tryM = (ax, v) => { const n = { x: p.x, y: p.y, z: p.z }; n[ax] += v * dt; if (!this.collide(n.x, n.y, n.z)) { p[ax] = n[ax]; return true; } return false; };
    if (!tryM('x', p.vx)) { if (p.ground && !p.fly && !this.collide(p.x + p.vx * dt, p.y + 1.05, p.z) && this.autoJump) { p.vy = 7; } p.vx = 0; }
    if (!tryM('z', p.vz)) p.vz = 0;
    p.ground = false;
    if (!tryM('y', p.vy)) { if (p.vy < 0) { p.ground = true; p.y = Math.floor(p.y + 0.01); if (this.collide(p.x, p.y, p.z)) p.y += 1; } p.vy = 0; }
    if (p.y < -10) { const s2 = this.spawnPoint(); Object.assign(p, s2); }
  }
  // ---------- 청크 관리 ----------
  chunks() {
    const pcx = Math.floor(this.p.x / CS), pcz = Math.floor(this.p.z / CS), R = SET.dist;
    // 생성 (테두리 한 칸 더)
    let made = 0;
    for (let r = 0; r <= R + 1 && made < 3; r++) for (let dz = -r; dz <= r && made < 3; dz++) for (let dx = -r; dx <= r && made < 3; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (!this.world.chunk(pcx + dx, pcz + dz, false)) { this.world.chunk(pcx + dx, pcz + dz); made++; }
    }
    // 메시 (가까운 것부터, 한 프레임에 몇 개)
    let built = 0;
    for (let r = 0; r <= R && built < 2; r++) for (let dz = -r; dz <= r && built < 2; dz++) for (let dx = -r; dx <= r && built < 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const C = this.world.chunk(pcx + dx, pcz + dz, false);
      if (!C || !C.dirty) continue;
      let ready = true; for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.world.chunk(C.cx + ax, C.cz + az, false)) ready = false;
      if (!ready) continue;
      this.remesh(C); built++;
    }
    // 수정된 청크는 바로
    for (const C of this.world.chunks.values()) if (C.dirty && C.mesh && Math.abs(C.cx - pcx) <= R && Math.abs(C.cz - pcz) <= R) this.remesh(C);
    // 멀어진 청크 지우기
    for (const [k, C] of this.world.chunks) if (Math.abs(C.cx - pcx) > R + 3 || Math.abs(C.cz - pcz) > R + 3) { this.dropMesh(C); this.world.chunks.delete(k); }
  }
  remesh(C) {
    this.dropMesh(C);
    const m = this.world.mesh(C);
    C.mesh = {};
    if (m.solid) { const o = new THREE.Mesh(m.solid, this.mat); o.position.set(C.cx * CS, 0, C.cz * CS); this.scene.add(o); C.mesh.s = o; }
    if (m.water) { const o = new THREE.Mesh(m.water, this.wmat); o.position.set(C.cx * CS, 0, C.cz * CS); o.renderOrder = 2; this.scene.add(o); C.mesh.w = o; }
    C.dirty = false;
  }
  dropMesh(C) { if (!C.mesh) return; for (const o of Object.values(C.mesh)) { this.scene.remove(o); o.geometry.dispose(); } C.mesh = null; }
  // ---------- 낮밤 ----------
  sky(dt) {
    this.time = (this.time + dt / 600) % 1; // 10분 하루
    const a = this.time * Math.PI * 2, sunY = Math.sin(a), day = Math.max(0, Math.min(1, sunY * 3 + 0.5));
    const top = new THREE.Color(0x0a1028).lerp(new THREE.Color(0x7ec0ff), day);
    const dusk = Math.max(0, 1 - Math.abs(sunY) * 4) * 0.6;
    top.lerp(new THREE.Color(0xff9a5a), dusk);
    this.scene.background = top; this.scene.fog.color.copy(top);
    this.hemi.intensity = 0.25 + day * 0.8; this.sun.intensity = day * 0.8;
    this.mat.color.setScalar(0.45 + day * 0.55); this.wmat.color.setScalar(0.45 + day * 0.55);
    const p = this.p;
    this.sun.position.set(p.x + Math.cos(a) * 100, Math.sin(a) * 100, p.z + 30);
    this.sunM.position.set(p.x + Math.cos(a) * 300, Math.sin(a) * 300, p.z); this.sunM.lookAt(p.x, p.y, p.z);
    this.moonM.position.set(p.x - Math.cos(a) * 300, -Math.sin(a) * 300, p.z); this.moonM.lookAt(p.x, p.y, p.z);
    this.clouds.position.x = p.x + ((performance.now() / 1000) % 300) - 150; this.clouds.position.z = p.z; this.clouds.children.forEach((c) => (c.material.opacity = 0.3 + day * 0.55));
    $('#clock').textContent = `${String(Math.floor((this.time * 24 + 6) % 24)).padStart(2, '0')}시`;
  }
  // ---------- 매 프레임 ----------
  loop(t) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const paused = !$('#pause').classList.contains('hidden');
    this.chunks();
    if (!paused && this.world.chunk(Math.floor(this.p.x / CS), Math.floor(this.p.z / CS), false)?.mesh) this.move(dt);
    const p = this.p;
    this.cam.position.set(p.x, p.y + 1.62, p.z); this.cam.rotation.set(p.pitch, p.yaw, 0);
    // 보고 있는 블록
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.cam.rotation);
    this.hit = this.world.raycast(this.cam.position, dir, 6);
    this.sel.visible = !!this.hit; if (this.hit) this.sel.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
    // 캐기 (단단함에 따라 시간)
    if (this.mining && this.hit) {
      const key = this.hit.x + ',' + this.hit.y + ',' + this.hit.z; if (this.mineKey !== key) { this.mineKey = key; this.breakT = 0; }
      this.breakT += dt;
      const need = p.fly ? 0.05 : { 3: 0.45, 11: 0.45, 10: 0.5, 18: 0.6, 9: 0.15, 7: 0.1, 20: 0.1 }[this.hit.id] || 0.25;
      this.sel.material.opacity = 0.6 + Math.min(1, this.breakT / need) * 0.4; this.sel.material.color.setRGB(Math.min(1, this.breakT / need), 0, 0);
      if (this.breakT >= need) { this.breakBlock(this.hit); this.breakT = 0; this.mineKey = null; }
    } else { this.sel.material.color.setRGB(0, 0, 0); }
    for (const q of this.parts) { q.t -= dt; q.vy -= 12 * dt; q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt; }
    this.parts = this.parts.filter((q) => { if (q.t <= 0) { this.scene.remove(q.m); q.m.geometry.dispose(); return false; } return true; });
    this.sky(dt);
    // 물속
    const under = this.world.get(Math.floor(p.x), Math.floor(p.y + 1.62), Math.floor(p.z)) === B.WATER;
    $('#water').style.opacity = under ? 1 : 0;
    $('#pos').textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}${p.fly ? ' · ✈️' : ''}`;
    if (t - this.lastSave > 30000) { this.lastSave = t; this.save(); }
    this.r.render(this.scene, this.cam);
  }
}
addEventListener('beforeunload', () => { if (G) G.save(); });
menu();
window.__cl = { get G() { return G; }, play };
