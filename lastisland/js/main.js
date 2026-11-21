// ===================== 라스트 아일랜드 — 메뉴 · 조작 · 화면 · 함께 하기 =====================
import { Sim, makeIsland, GUNS, ITEMS, SIZE } from './sim.js';
import { View, drawMap } from './view.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0; if (touch) document.body.classList.add('touch');
const ME = { name: '', diff: 'normal', wins: 0, games: 0, kills: 0, best: 99 };
try { Object.assign(ME, JSON.parse(localStorage.getItem('li_me') || '{}')); } catch (e) { /* 무시 */ }
if (!ME.name) ME.name = '생존자' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('li_me', JSON.stringify(ME)); } catch (e) { /* 무시 */ } };
let room = null, link = null, sim = null, view = null, S = null, myId = 'me', raf = 0, last = 0, ended = false, I = null;

// ---------- 소리 ----------
let AC = null;
function noise(d, f, g = 0.15) { if (!AC) return; const t = AC.currentTime, b = AC.createBuffer(1, AC.sampleRate * d, AC.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 2); const s = AC.createBufferSource(); s.buffer = b; const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f; const gn = AC.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn); gn.connect(AC.destination); s.start(t); }
function tone(f, d, g = 0.06) { if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), e = AC.createGain(); o.frequency.value = f; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(e); e.connect(AC.destination); o.start(t); o.stop(t + d); }

// ---------- 메뉴 ----------
function menu() {
  show('menu');
  $('#nick').value = ME.name; $('#nick').oninput = (e) => { ME.name = e.target.value.trim().slice(0, 10) || ME.name; save(); };
  $('#stats').innerHTML = `🏆 우승 ${ME.wins} · 🎮 ${ME.games}판 · 💀 처치 ${ME.kills} · 최고 ${ME.best < 99 ? ME.best + '등' : '-'}`;
  const r = () => { $('#diffs').innerHTML = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button data-d="${k}" class="${ME.diff === k ? 'sel' : ''}">${n}</button>`).join(''); document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { ME.diff = b.dataset.d; save(); r(); }); };
  r();
  $('#go').onclick = () => start('solo');
  $('#mk').onclick = () => openRoom(Math.random().toString(36).slice(2, 6), true);
  $('#jn').onclick = () => { const c = $('#code').value.trim().toLowerCase(); if (/^[a-z0-9]{3,12}$/.test(c)) openRoom(c, false); };
  $('#mk').disabled = $('#jn').disabled = !room;
  $('#mpn').textContent = room ? '방을 만들어 친구와 같은 섬에 떨어져요 (나머지는 봇)' : '온라인 대전은 이 버전에서 준비 중이에요 · 지금은 봇(컴퓨터)과 함께 즐겨 주세요';
}

// ---------- 함께 하기 ----------
class Link {
  constructor(R, host) { this.R = R; this.host = host; this.seq = 0; this.ring = []; this.seen = {}; this.last = 0; this.seed = host ? Math.floor(Math.random() * 1e6) : null; R.presence({ n: ME.name, host: host ? 1 : 0, st: 'lobby', seed: this.seed }).catch(() => {}); this.un = R.onPeers(() => this.onPeers()); }
  me() { return this.R.peers().find((p) => p.sameTab); }
  others() { return this.R.peers().filter((p) => !p.sameTab && p.kind === 'viewer'); }
  push(ev) { ev.s = ++this.seq; this.ring.push(ev); if (this.ring.length > 10) this.ring.shift(); this.dirty = true; }
  leave() { try { this.un(); } catch (e) { /* 무시 */ } this.R.leave().catch(() => {}); }
  tick(now) {
    if (now - this.last < 80 && !this.dirty) return; this.last = now; this.dirty = false;
    if (this.host && sim) this.R.presence({ st: 'game', snap: sim.snapshot(), seed: this.seed }).catch(() => {});
    else if (!this.host && S && S.local) { const L = S.local; this.R.presence({ st: 'game', pos: [Math.round(L.x * 10) / 10, Math.round(L.z * 10) / 10, Math.round(L.face * 100) / 100], ev: this.ring }).catch(() => {}); }
  }
  onPeers() {
    if (!S) return lobby();
    if (this.host && sim) {
      for (const p of this.others()) {
        const P = p.presence || {}; if (P.st !== 'game') continue;
        let pl = sim.players.find((q) => q.id === p.peer);
        if (!pl) { const bot = sim.players.find((q) => q.isBot && q.state === 'plane'); if (!bot && sim.plane.t > 5) continue; if (bot) sim.removePlayer(bot.id); pl = sim.addPlayer({ id: p.peer, name: String(P.n || '친구').slice(0, 10) }); pl.remoteMove = true; }
        if (Array.isArray(P.pos) && pl.state === 'ground') { const [x, z, f] = P.pos; if (Math.hypot(x - pl.x, z - pl.z) < 6) { pl.vx = (x - pl.x) * 12; pl.vz = (z - pl.z) * 12; pl.x = x; pl.z = z; pl.face = f; } }
        if (Array.isArray(P.pos) && pl.state === 'chute') { const [x, z] = P.pos; pl.x = x; pl.z = z; }
        const last = this.seen[p.peer] ?? -1;
        for (const ev of P.ev || []) { if (ev.s <= last || last < 0) continue; if (ev.k === 'fire') sim.fire(pl, Number(ev.a) || 0); else if (ev.k === 'jump') pl.inp.jump = true; else if (ev.k === 'pick') { const L = sim.I.loot[ev.id]; if (L && Math.hypot(L.x - pl.x, L.z - pl.z) < 3) sim.pickup(pl, L); } else if (ev.k === 'heal') sim.startHeal(pl); else if (ev.k === 'reload') sim.reload(pl); else if (ev.k === 'slot') { if (pl.guns[ev.v]) { pl.slot = ev.v; pl.reloadT = 0; } } }
        this.seen[p.peer] = Math.max(last, ...(P.ev || []).map((e) => e.s), 0);
      }
    } else if (!this.host) { const h = this.others().find((p) => p.presence && p.presence.host === 1); if (h && h.presence.snap) applySnap(h.presence.snap); }
  }
}
async function openRoom(code, host) {
  let R; try { R = await room.join('li-' + code); } catch (e) { $('#mpn').textContent = '방에 못 들어갔어요'; return; }
  link = new Link(R, host); link.code = code; show('lobby'); lobby();
}
function lobby() {
  if (!link || S) return;
  const ps = link.R.peers().filter((p) => p.kind === 'viewer');
  const h = ps.find((p) => !p.sameTab && p.presence.host === 1);
  if (!link.host && h && h.presence.st === 'game' && h.presence.seed) { link.seed = h.presence.seed; start('client'); return; }
  $('#lobby').innerHTML = `<div class="card"><h2>방 코드 <b class="code">${esc(link.code)}</b></h2><p>${ps.map((p) => esc(p.sameTab ? ME.name + ' (나)' : p.presence.n)).join(' · ')}</p><p class="muted">20명 중 남는 자리는 봇이에요</p><div class="row">${link.host ? '<button id="lg" class="primary big">▶ 출발</button>' : '<span class="muted">방장이 출발하기를 기다리는 중…</span>'}<button id="lx">나가기</button></div></div>`;
  const g = $('#lg'); if (g) g.onclick = () => start('host');
  $('#lx').onclick = () => { link.leave(); link = null; menu(); };
}

// ---------- 게임 ----------
function start(kind) {
  if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  stop(); ended = false; show('play'); $('#end').classList.add('hidden'); feedL.length = 0;
  const seed = link ? link.seed : Math.floor(Math.random() * 1e6);
  if (kind === 'client') {
    I = makeIsland(seed); myId = (link.me() || {}).peer;
    S = { I, loot: I.loot, players: [], shots: [], zone: { x: SIZE / 2, z: SIZE / 2, r: 175, tx: SIZE / 2, tz: SIZE / 2, tr: 175 }, plane: { x0: 0, z0: 0, x1: 0, z1: 0, x: 0, z: 0, t: 0, T: 26 }, local: null, alive: 20, place: {} };
    const a = (seed % 628) / 100; Object.assign(S.plane, { x0: SIZE / 2 - Math.cos(a) * 200, z0: SIZE / 2 - Math.sin(a) * 200, x1: SIZE / 2 + Math.cos(a) * 200, z1: SIZE / 2 + Math.sin(a) * 200 });
    link.R.presence({ st: 'game', n: ME.name }).catch(() => {});
  } else {
    sim = new Sim({ seed, diff: ME.diff }); I = sim.I;
    const me = sim.addPlayer({ id: link ? (link.me() || {}).peer : 'me', name: ME.name, human: true }); myId = me.id;
    sim.fillBots(20);
    S = sim; S.loot = I.loot;
    if (link) { link.R.presence({ st: 'game', seed }).catch(() => {}); link.onPeers(); }
  }
  view = new View($('#view'), I);
  last = performance.now(); raf = requestAnimationFrame(loop);
  msg('✈️ 비행기에서 Space(또는 ⬇ 버튼)로 뛰어내려요 · M 지도에서 내릴 곳 표시');
}
function stop() { cancelAnimationFrame(raf); if (view) view.dispose(); view = null; sim = null; S = null; }
function applySnap(sn) {
  if (!S || sim) return;
  const st = ['plane', 'chute', 'ground', 'dead'];
  const old = new Map(S.players.map((p) => [p.id, p]));
  S.players = sn.p.map((a) => { const [id, name, x, z, y, face, hp, armor, s, g0, g1, slot, m0, m1, kills, heal, bot, band, med, rel] = a; const o = old.get(id) || {}; const vx = o.x !== undefined ? (x - o.x) * 12 : 0, vz = o.z !== undefined ? (z - o.z) * 12 : 0; return Object.assign(o, { id, name, x, z, y, face, hp, armor, state: st[s], guns: [g0 || null, g1 || null], slot, mag: [m0, m1], kills, healing: heal ? 1 : null, isBot: !!bot, band, med, reloadT: rel ? 1 : 0, vx, vz }); });
  S.shots = sn.s.map(([x, z, vx, vz]) => ({ x, z, vx, vz }));
  const z = sn.z; Object.assign(S.zone, { x: z[0], z: z[1], r: z[2], tx: z[3], tz: z[4], tr: z[5], t: z[6], state: z[7] ? 'shrink' : 'wait', phase: z[8] });
  const P = S.plane; P.t = sn.pl[0]; P.x = P.x0 + (P.x1 - P.x0) * P.t / P.T; P.z = P.z0 + (P.z1 - P.z0) * P.t / P.T;
  const taken = new Set((sn.lt || '').split('.').filter(Boolean).map((v) => parseInt(v, 36)));
  for (const [id, x, zz, what, n] of sn.nl || []) if (!S.loot[id]) S.loot[id] = { id, x, z: zz, t: GUNS[what] ? 'gun' : 'item', g: GUNS[what] ? what : undefined, i: GUNS[what] ? undefined : what, n, taken: false };
  S.loot.forEach((L) => { if (L) L.taken = taken.has(L.id); });
  S.alive = sn.al; S.place = sn.pc || {};
  if (sn.ov && !S.over) S.over = { win: sn.ov[0] };
  const me = S.players.find((p) => p.id === myId);
  if (me) { if (!S.local || me.state !== 'ground' || Math.hypot(S.local.x - me.x, S.local.z - me.z) > 6) S.local = { x: me.x, z: me.z, face: me.face }; S.local.state = me.state; }
}

// ---------- 조작 ----------
const K = {}; const aim = { a: 0, d: 0, scope: false }; let mouse = { x: innerWidth / 2, y: innerHeight / 2 }, firing = false;
addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  K[e.code] = true; if (!S) return;
  if (e.code === 'Space') { act('jump'); e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'KeyF') act('pick');
  if (e.code === 'KeyR') act('reload'); if (e.code === 'KeyQ' || e.code === 'KeyH') act('heal');
  if (e.code === 'Digit1') act('slot', 0); if (e.code === 'Digit2') act('slot', 1);
  if (e.code === 'KeyM' || e.code === 'Tab') { $('#bigmap').classList.toggle('hidden'); e.preventDefault(); }
  if (e.code === 'Escape') pauseMenu();
});
addEventListener('keyup', (e) => { K[e.code] = false; });
const viewEl = $('#view');
viewEl.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
viewEl.addEventListener('mousedown', (e) => { if (touch) return; if (e.button === 0) { firing = true; act('fire'); } if (e.button === 2) aim.scope = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) aim.scope = false; });
viewEl.addEventListener('contextmenu', (e) => e.preventDefault());
$('#bigmap').addEventListener('click', (e) => { const cv = $('#bigcv'); const r = cv.getBoundingClientRect(); const k = Math.min(cv.width, cv.height) / SIZE, ox = (cv.width - SIZE * k) / 2, oz = (cv.height - SIZE * k) / 2; const x = ((e.clientX - r.left) * cv.width / r.width - ox) / k, z = ((e.clientY - r.top) * cv.height / r.height - oz) / k; if (x > 0 && z > 0 && x < SIZE && z < SIZE) { S.drop = { x, z }; msg('📍 내릴 곳을 표시했어요'); } });
function meP() { if (!S) return null; const m = S.players.find((p) => p.id === myId); if (!m) return null; if (!sim && S.local && m.state === 'ground') return { ...m, x: S.local.x, z: S.local.z }; return m; }
function act(k, v) {
  const m = meP(); if (!m) return;
  if (sim) {
    const p = sim.players.find((q) => q.id === myId);
    if (k === 'jump') p.inp.jump = true; else if (k === 'pick') sim.pickup(p); else if (k === 'reload') sim.reload(p); else if (k === 'heal') sim.startHeal(p); else if (k === 'slot') { if (p.guns[v]) { p.slot = v; p.reloadT = 0; } } else if (k === 'fire') sim.fire(p, aim.a);
  } else if (link) {
    if (k === 'pick') { let best = null, bd = 2.4; for (const L of S.loot) { if (!L || L.taken) continue; const d = Math.hypot(L.x - m.x, L.z - m.z); if (d < bd) { bd = d; best = L; } } if (best) link.push({ k: 'pick', id: best.id }); }
    else if (k === 'fire') { if (m.state === 'ground' && m.guns[m.slot]) { link.push({ k: 'fire', a: Math.round(aim.a * 100) / 100 }); } }
    else link.push({ k, v });
  }
  if (k === 'fire' && m.state === 'ground' && m.guns[m.slot]) noise(0.12, 1800, 0.12);
  if (k === 'jump' && m.state === 'plane') tone(400, 0.2);
}
// 터치
const TS = { mv: null, am: null, mx: 0, mz: 0 };
if (touch) {
  $('#tpad').classList.remove('hidden');
  const sL = $('#tL'), sR = $('#tR');
  viewEl.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (t.clientX < innerWidth / 2 && !TS.mv) { TS.mv = { id: t.identifier, x: t.clientX, y: t.clientY }; sL.style.left = t.clientX + 'px'; sL.style.top = t.clientY + 'px'; sL.classList.add('on'); } else if (!TS.am) { TS.am = { id: t.identifier, x: t.clientX, y: t.clientY }; sR.style.left = t.clientX + 'px'; sR.style.top = t.clientY + 'px'; sR.classList.add('on'); } } e.preventDefault(); }, { passive: false });
  viewEl.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (TS.mv && t.identifier === TS.mv.id) { let dx = (t.clientX - TS.mv.x) / 45, dy = (t.clientY - TS.mv.y) / 45; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } TS.mx = dx; TS.mz = dy; sL.firstElementChild.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; } if (TS.am && t.identifier === TS.am.id) { const dx = t.clientX - TS.am.x, dy = t.clientY - TS.am.y; if (Math.hypot(dx, dy) > 12) { aim.a = Math.atan2(dx, dy); firing = true; } sR.firstElementChild.style.transform = `translate(${Math.max(-40, Math.min(40, dx))}px,${Math.max(-40, Math.min(40, dy))}px)`; } } e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { if (TS.mv && t.identifier === TS.mv.id) { TS.mv = null; TS.mx = TS.mz = 0; sL.classList.remove('on'); } if (TS.am && t.identifier === TS.am.id) { TS.am = null; firing = false; sR.classList.remove('on'); } } };
  viewEl.addEventListener('touchend', end); viewEl.addEventListener('touchcancel', end);
  const btn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  btn('#tjump', () => act('jump')); btn('#tpick', () => act('pick')); btn('#theal', () => act('heal')); btn('#trel', () => act('reload')); btn('#tswap', () => { const m = meP(); act('slot', m && m.slot === 0 ? 1 : 0); }); btn('#tmap', () => $('#bigmap').classList.toggle('hidden')); btn('#tmenu', pauseMenu);
}
function pauseMenu() { const P = $('#pause'); if (!P.classList.contains('hidden')) { P.classList.add('hidden'); return; } P.innerHTML = '<div class="card"><h2>멈춤</h2><div class="row"><button id="pz1" class="primary big">계속하기</button><button id="pz2">그만두기</button></div></div>'; P.classList.remove('hidden'); $('#pz1').onclick = () => P.classList.add('hidden'); $('#pz2').onclick = () => { P.classList.add('hidden'); quit(); }; }
function quit() { stop(); if (link) { link.leave(); link = null; } menu(); }
function msg(t) { const m = $('#msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(msg.t); msg.t = setTimeout(() => (m.style.opacity = 0), 4000); }
const feedL = [];

// ---------- 루프 ----------
function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (!S || !view) return;
  const paused = !link && !$('#pause').classList.contains('hidden');
  let kx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), kz = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0);
  if (TS.mv) { kx = TS.mx; kz = TS.mz; }
  const m = meP();
  if (m && !touch) { const cam = view.cam; const v = { x: (mouse.x / innerWidth) * 2 - 1, y: -(mouse.y / innerHeight) * 2 + 1 }; const ray = view.r && cam ? (() => { const vec = new (cam.position.constructor)(v.x, v.y, 0.5).unproject(cam).sub(cam.position).normalize(); const tt = (1 - cam.position.y) / vec.y; return { x: cam.position.x + vec.x * tt, z: cam.position.z + vec.z * tt }; })() : null; if (ray) aim.a = Math.atan2(ray.x - m.x, ray.z - m.z); }
  // 플레이어가 표시한 곳으로 낙하 (자동 조종)
  if (m && m.state === 'chute' && S.drop && !kx && !kz) { const dx = S.drop.x - m.x, dz = S.drop.z - m.z, d = Math.hypot(dx, dz); if (d > 2) { kx = dx / d; kz = dz / d; } }
  if (sim) {
    if (!paused) {
      const p = sim.players.find((q) => q.id === myId);
      if (p) { p.inp.mx = kx; p.inp.mz = kz; p.inp.aim = aim.a; p.inp.dive = K.ShiftLeft; if (firing && GUNS[p.guns[p.slot]]?.auto) sim.fire(p, aim.a); if (m.state === 'plane' && S.drop && Math.hypot(sim.plane.x - S.drop.x, sim.plane.z - S.drop.z) < 60) p.inp.jump = true; }
      sim.step(dt);
    }
    for (const f of sim.fx) { view.effect(f); fxSound(f); } sim.fx.length = 0;
  } else if (S.local) {
    const me = S.players.find((p) => p.id === myId);
    if (me && me.state === 'ground') {
      const sp = me.healing ? 2.2 : 5.4; const l = Math.hypot(kx, kz) || 1, k = Math.min(1, Math.hypot(kx, kz));
      const nx = S.local.x + kx / l * k * sp * dt, nz = S.local.z + kz / l * k * sp * dt;
      if (!blockedC(nx, S.local.z)) S.local.x = nx; if (!blockedC(S.local.x, nz)) S.local.z = nz;
      S.local.face = aim.a; me.x = S.local.x; me.z = S.local.z; me.face = aim.a; me.moving = k > 0.1;
      if (firing && GUNS[me.guns[me.slot]]?.auto && (!S.fireCd || t - S.fireCd > 1000 / GUNS[me.guns[me.slot]].rate)) { S.fireCd = t; act('fire'); }
    } else if (me && me.state === 'chute') { S.local.x += kx * 13 * dt; S.local.z += kz * 13 * dt; me.x = S.local.x; me.z = S.local.z; }
    else if (me && me.state === 'plane' && S.drop && Math.hypot(S.plane.x - S.drop.x, S.plane.z - S.drop.z) < 60 && !S.jumped) { S.jumped = true; act('jump'); }
    for (const s of S.shots) { s.x += s.vx * dt; s.z += s.vz * dt; }
  }
  if (link) link.tick(t);
  // 죽으면 관전
  if (m && m.state === 'dead') { if (!S.spec || S.players.find((p) => p.id === S.spec)?.state === 'dead') { const a = S.players.find((p) => p.state === 'ground'); S.spec = a ? a.id : null; } }
  view.render(S, myId, dt, aim);
  hud(m);
}
function blockedC(x, z) { const a = I.grid.get(Math.floor(x / 4) + ',' + Math.floor(z / 4)); if (!a) return I.land(x, z) < -2; for (const o of a) { if (o.kind === 'wall') { if (x + 0.45 > o.x0 && x - 0.45 < o.x1 && z + 0.45 > o.z0 && z - 0.45 < o.z1) return true; } else if (Math.hypot(x - o.x, z - o.z) < o.r + 0.45) return true; } return I.land(x, z) < -2; }
function fxSound(f) {
  if (f.t === 'fire' && f.id !== myId) { const m = meP(); if (m) { const d = Math.hypot(f.x - m.x, f.z - m.z); if (d < 60) noise(0.12, 900, 0.1 * (1 - d / 60)); } }
  if (f.t === 'hit') tone(200, 0.05, 0.03);
  if (f.t === 'pick' && f.id === myId) tone(900, 0.08);
  if (f.t === 'kill') { const by = S.players.find((p) => p.id === f.by), to = S.players.find((p) => p.id === f.id); feedL.push({ t: performance.now(), by: by ? by.name : f.zone ? '자기장' : '?', to: to ? to.name : '?', me: f.by === myId || f.id === myId }); if (f.by === myId) { tone(880, 0.15, 0.08); msg('💀 처치!'); } }
}

// ---------- 화면 정보 ----------
let lastH = '';
function hud(m) {
  if (!m) return;
  const Z = S.zone;
  const zoneTxt = S.plane.t < S.plane.T * 0.5 ? '비행 중' : Z.state === 'shrink' ? `⚠️ 자기장 줄어드는 중 ${Math.max(0, Math.ceil(Z.t))}초` : `자기장 줄어들기까지 ${Math.max(0, Math.ceil(Z.t))}초`;
  const outside = m.state === 'ground' && Math.hypot(m.x - Z.x, m.z - Z.z) > Z.r;
  const top = `<div class="pill">👥 ${S.alive || S.players.filter((p) => p.state !== 'dead').length}</div><div class="pill">💀 ${m.kills}</div><div class="pill ${outside ? 'warn' : ''}">${zoneTxt}${outside ? ' · 자기장 밖!' : ''}</div>`;
  const G0 = m.guns[0], G1 = m.guns[1];
  const slot = (i, g) => `<div class="gun ${m.slot === i ? 'on' : ''}" style="--c:${g ? GUNS[g].color : '#555'}"><small>${i + 1}</small><b>${g ? GUNS[g].name : '비어 있음'}</b><span>${g ? m.mag[i] + ' / ' + GUNS[g].mag : ''}</span></div>`;
  const bot = `<div class="bars"><div class="hp"><i style="width:${Math.max(0, m.hp)}%"></i><b>${Math.max(0, Math.ceil(m.hp))}</b></div><div class="ar"><i style="width:${m.armor}%"></i></div></div><div class="guns">${slot(0, G0)}${slot(1, G1)}</div><div class="heals">🩹 ${m.band || 0} · 💉 ${m.med || 0}${m.healing ? ' <em>치료 중…</em>' : ''}${m.reloadT > 0 ? ' <em>장전 중…</em>' : ''}</div>`;
  let near = '';
  if (m.state === 'ground') { let best = null, bd = 2.2; for (const L of S.loot) { if (!L || L.taken) continue; const d = Math.hypot(L.x - m.x, L.z - m.z); if (d < bd) { bd = d; best = L; } } if (best) near = `${touch ? '✋' : 'E'} 줍기: ${best.t === 'gun' ? GUNS[best.g].name : ITEMS[best.i].icon + ' ' + ITEMS[best.i].name}`; }
  if (m.state === 'plane') near = `${touch ? '⬇ 버튼' : 'Space'}: 뛰어내리기 · ${touch ? '🗺' : 'M'}: 지도에서 내릴 곳 표시`;
  if (m.state === 'chute') near = '낙하산 · 이동키로 방향 조종' + (touch ? '' : ' · Shift 빨리 내려가기');
  const feed = feedL.filter((f) => performance.now() - f.t < 5000).slice(-5).map((f) => `<div class="${f.me ? 'me' : ''}">${esc(f.by)} 💥 ${esc(f.to)}</div>`).join('');
  const h = top + bot + near + feed;
  if (h !== lastH) { lastH = h; $('#top').innerHTML = top; $('#bottom').innerHTML = bot; $('#near').textContent = near; $('#feed').innerHTML = feed; }
  $('#zone').style.opacity = outside && m.state === 'ground' ? 1 : 0;
  // 지도
  if (!$('#bigmap').classList.contains('hidden')) drawMap($('#bigcv'), view.mapCanvas, S, myId, true, I);
  drawMap($('#mini'), view.mapCanvas, S, myId, false);
  // 끝
  const place = S.place && S.place[myId];
  if (!ended && (m.state === 'dead' || S.over)) {
    if (m.state === 'dead' && !S.over && !S.deadShown) { S.deadShown = true; setTimeout(() => endScreen(place || '?', false), 1500); }
    if (S.over) { ended = true; setTimeout(() => endScreen(S.over.win === myId ? 1 : place || '?', S.over.win === myId), 1200); }
  }
}
function endScreen(place, win) {
  const m = S && S.players.find((p) => p.id === myId) || { kills: 0 };
  if (!S.counted) { S.counted = true; ME.games++; ME.kills += m.kills; if (typeof place === 'number') ME.best = Math.min(ME.best, place); }
  if (win && !S.wonCounted) { S.wonCounted = true; ME.wins++; ME.best = 1; }
  save();
  $('#end').innerHTML = `<div class="card"><h1 class="${win ? 'win' : ''}">${win ? '🏆 오늘의 생존자!' : `#${place} 등`}</h1><p>처치 ${m.kills} · ${win ? '마지막까지 살아남았어요' : '다음엔 더 오래 살아남아요'}</p><div class="row"><button id="e1" class="primary big">${win || S.over ? '다시 하기' : '계속 관전'}</button><button id="e2">메뉴</button></div></div>`;
  $('#end').classList.remove('hidden');
  $('#e1').onclick = () => { if (win || S.over) { if (link && !link.host) return; start(link ? 'host' : 'solo'); } else $('#end').classList.add('hidden'); };
  $('#e2').onclick = quit;
}
addEventListener('resize', () => view && view.resize());
menu();
(async () => { try { if (window.claude && window.claude.use) { room = await window.claude.use('room'); if (!$('#menu').classList.contains('hidden')) menu(); } } catch (e) { room = null; } })();
window.__li = { get sim() { return sim; }, start, get S() { return S; } };
