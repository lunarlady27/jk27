// ===================== 터보 서킷 — 메뉴 · 화면 · 조작 · 소리 =====================
import * as THREE from 'three';
import { TRACKS, buildTrack, buildScene } from './track.js';
import { Race, KARTS, ITEMS, DIFFS, POINTS } from './race.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0; if (touch) document.body.classList.add('touch');
const fmt = (t) => { if (!isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };

// ---------- 저장 ----------
const ST = { name: '', mode: 'race', track: 'beach', kart: 'red', diff: 'normal', laps: 3, rec: {}, races: 0, wins: 0, cups: 0 };
try { Object.assign(ST, JSON.parse(localStorage.getItem('tc_st') || '{}')); } catch (e) { /* 무시 */ }
if (!ST.name) ST.name = '레이서' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('tc_st', JSON.stringify(ST)); } catch (e) { /* 무시 */ } };
const loadGhost = (id) => { try { return JSON.parse(localStorage.getItem('tc_gh_' + id) || 'null'); } catch (e) { return null; } };
const saveGhost = (id, g) => { try { localStorage.setItem('tc_gh_' + id, JSON.stringify(g)); } catch (e) { /* 무시 */ } };

// ---------- 소리 ----------
let AC = null, eng = null;
function audioOn() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
    const g2 = AC.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(f);
    o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); o2.start(); eng = { o, o2, f, g };
  } catch (e) { AC = null; }
}
function tone(f, d, type = 'square', gain = 0.05, f1, delay = 0) {
  if (!AC) return; const t = AC.currentTime + delay, o = AC.createOscillator(), e = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d);
  e.gain.setValueAtTime(gain, t); e.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(e); e.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, freq, gain) {
  if (!AC) return; const t = AC.currentTime, b = AC.createBuffer(1, Math.floor(AC.sampleRate * d), AC.sampleRate), x = b.getChannelData(0);
  for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 2);
  const s = AC.createBufferSource(); s.buffer = b; const f = AC.createBiquadFilter(); f.frequency.value = freq; const g = AC.createGain(); g.gain.value = gain;
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t);
}
function engineSet(v, boost, on) {
  if (!eng) return; const t = AC.currentTime, a = Math.abs(v);
  eng.o.frequency.setTargetAtTime(48 + a * 4.2 + (boost ? 30 : 0), t, 0.05); eng.o2.frequency.setTargetAtTime(24 + a * 2.1, t, 0.05);
  eng.f.frequency.setTargetAtTime(500 + a * 30, t, 0.1); eng.g.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.08);
}

// ---------- 메뉴 ----------
let gp = null; // 그랑프리 진행
function menu() {
  show('menu'); engineSet(0, false, false); gp = null;
  $('#nick').value = ST.name; $('#nick').oninput = () => { ST.name = $('#nick').value.trim().slice(0, 10) || ST.name; save(); };
  const render = () => {
    $('#modes').innerHTML = [['race', '🏁 단일 레이스'], ['gp', '🏆 그랑프리 (4트랙)'], ['ta', '⏱️ 타임 어택']].map(([k, n]) => `<button data-m="${k}" class="${ST.mode === k ? 'sel' : ''}">${n}</button>`).join('');
    $('#tracks').innerHTML = TRACKS.map((T) => { const r = ST.rec[T.id] || {}; return `<button class="opt ${ST.track === T.id ? 'sel' : ''}" data-t="${T.id}" ${ST.mode === 'gp' ? 'disabled' : ''}><b>${T.icon} ${T.name}</b><small>${T.desc}</small><small>🏅 최고 ${fmt(r.race)} · 한 바퀴 ${fmt(r.lap)}</small></button>`; }).join('');
    $('#karts').innerHTML = KARTS.map((K) => { const c = '#' + K.color.toString(16).padStart(6, '0'); const bar = (n, v) => `<span>${n}</span><i><span style="width:${v * 25}%"></span></i>`; return `<button class="opt ${ST.kart === K.id ? 'sel' : ''}" data-k="${K.id}" style="--c:${c}"><b><span class="sw"></span>${K.name}</b><small>${K.desc}</small><div class="bars">${bar('속도', K.spd)}${bar('가속', K.acc)}${bar('핸들', K.hdl)}</div></button>`; }).join('');
    $('#diffs').innerHTML = Object.entries(DIFFS).map(([k, D]) => `<button data-d="${k}" class="${ST.diff === k ? 'sel' : ''}" ${ST.mode === 'ta' ? 'disabled' : ''}>${D.name}</button>`).join('');
    $('#lapsel').innerHTML = [1, 3, 5].map((n) => `<button data-l="${n}" class="${ST.laps === n ? 'sel' : ''}">${n}바퀴</button>`).join('');
    $('#rec').textContent = `🏆 ${ST.cups} · 1등 ${ST.wins} / ${ST.races}판`;
    const T = TRACKS.find((t) => t.id === ST.track);
    $('#best').textContent = ST.mode === 'gp' ? `${TRACKS.map((t) => t.name).join(' → ')} · 순위 점수 합계로 우승!` : ST.mode === 'ta' ? `혼자 달려 기록 도전 · 최고 기록은 유령 카트로 함께 달려요 (${T.name})` : `${T.name} · 상대 7명`;
    document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { ST.mode = b.dataset.m; save(); render(); });
    document.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { ST.track = b.dataset.t; save(); render(); });
    document.querySelectorAll('#karts [data-k]').forEach((b) => b.onclick = () => { ST.kart = b.dataset.k; save(); render(); });
    document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { ST.diff = b.dataset.d; save(); render(); });
    document.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { ST.laps = Number(b.dataset.l); save(); render(); });
  };
  render();
  $('#go').onclick = () => {
    audioOn();
    if (ST.mode === 'gp') { gp = { i: 0, pts: {} }; start(TRACKS[0].id); }
    else start(ST.track);
  };
}

// ---------- 3D ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#view').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 3000);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function kartModel(K, ghost) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const body = M(K.color, ghost ? { transparent: true, opacity: 0.35 } : {}), dark = M(0x23262e, ghost ? { transparent: true, opacity: 0.35 } : {});
  inner.add(box(2.0, 0.42, 3.0, body, 0, 0.55, 0), box(1.3, 0.34, 1.0, body, 0, 0.5, 1.85), box(2.3, 0.18, 0.5, body, 0, 0.42, 2.25));
  for (const s of [-1, 1]) inner.add(box(0.45, 0.42, 1.5, body, s * 1.2, 0.5, -0.1));
  inner.add(box(1.0, 0.65, 0.45, dark, 0, 0.98, -0.75), box(1.2, 0.5, 0.7, dark, 0, 0.82, -1.35));
  inner.add(box(2.3, 0.12, 0.55, body, 0, 1.55, -1.55)); for (const s of [-1, 1]) inner.add(box(0.1, 0.5, 0.2, dark, s * 0.8, 1.25, -1.5));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), M(K.helm, ghost ? { transparent: true, opacity: 0.35 } : {})); head.position.set(0, 1.62, -0.35); inner.add(head);
  inner.add(box(0.62, 0.18, 0.2, M(0x101820), 0, 1.66, 0.0));
  inner.add(box(0.8, 0.55, 0.55, M(0x3a3f4a, ghost ? { transparent: true, opacity: 0.35 } : {}), 0, 1.08, -0.35));
  const wg = new THREE.CylinderGeometry(0.47, 0.47, 0.5, 14); wg.rotateZ(Math.PI / 2); const wm = M(0x15171c, ghost ? { transparent: true, opacity: 0.35 } : {});
  const wheels = [], fronts = [];
  for (const [x, z] of [[-1.2, 1.15], [1.2, 1.15], [-1.25, -1.15], [1.25, -1.15]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.47, z); const w = new THREE.Mesh(wg, wm); piv.add(w); inner.add(piv); wheels.push(w); if (z > 0) fronts.push(piv);
    w.add(box(0.52, 0.12, 0.3, M(0x777777), 0, 0, 0));
  }
  if (ghost) return { g, inner, wheels, fronts };
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.scale.set(0.8, 1.15, 1); g.add(sh);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), new THREE.MeshBasicMaterial({ color: 0x5ae0ff, transparent: true, opacity: 0.28, depthWrite: false })); shield.position.y = 1; shield.visible = false; g.add(shield);
  const fg = new THREE.ConeGeometry(0.32, 1.6, 8); fg.rotateX(-Math.PI / 2); fg.translate(0, 0, -0.8);
  const flames = []; for (const s of [-0.3, 0.3]) { const f = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 })); f.position.set(s, 0.85, -1.7); f.visible = false; inner.add(f); flames.push(f); }
  const sparks = []; for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0x36c8ff })); p.position.set(s * 1.25, 0.2, -1.55); p.visible = false; inner.add(p); sparks.push(p); }
  return { g, inner, wheels, fronts, shield, flames, sparks };
}
function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '800 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(text, 128, 34); x.fillStyle = color; x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(4.4, 1.1, 1); s.position.y = 2.9; return s;
}
const qTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, '#ff6ad5'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(1, '#36d1ff'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); x.fillStyle = '#fff'; x.font = '900 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 32, 35); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

// ---------- 조작 ----------
const down = {};
addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  down[e.code] = true; if (G && /Arrow|Space/.test(e.code)) e.preventDefault();
  if (e.code === 'Escape' && G && G.R.state !== 'done') togglePause();
});
addEventListener('keyup', (e) => { down[e.code] = false; });
addEventListener('blur', () => { for (const k in down) down[k] = false; });
const TB = {}; let usedTouch = false;
if (touch) {
  const pad = $('#tpad'); pad.classList.remove('hidden');
  pad.querySelectorAll('[data-k]').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('on'); TB[k] = true; usedTouch = true; if (k === 'pause' && G && G.R.state !== 'done') togglePause(); }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); TB[k] = false; };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  });
}
function readInput() {
  const I = { thr: 0, brk: 0, steer: 0, drift: 0, use: 0 };
  I.thr = (down.ArrowUp || down.KeyW) ? 1 : 0; I.brk = (down.ArrowDown || down.KeyS) ? 1 : 0;
  I.steer = ((down.ArrowRight || down.KeyD) ? 1 : 0) - ((down.ArrowLeft || down.KeyA) ? 1 : 0);
  I.drift = (down.Space || down.ShiftLeft || down.ShiftRight) ? 1 : 0; I.use = (down.KeyE || down.ControlLeft || down.ControlRight || down.KeyX) ? 1 : 0;
  if (usedTouch) {
    if (!I.brk && !TB.brk) I.thr = 1; if (TB.brk) { I.brk = 1; I.thr = 0; }
    if (TB.left || TB.right) I.steer = (TB.right ? 1 : 0) - (TB.left ? 1 : 0);
    if (TB.drift) I.drift = 1; if (TB.use) I.use = 1;
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue; const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.2) I.steer = Math.max(-1, Math.min(1, ax * 1.2));
    const b = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4);
    if (b(0) || b(7)) I.thr = 1; if (b(1) || b(6)) I.brk = 1; if (b(2) || b(5)) I.drift = 1; if (b(3) || b(4)) I.use = 1;
    if (b(14)) I.steer = -1; if (b(15)) I.steer = 1; if (b(9) && G && !G.pauseLatch) { G.pauseLatch = true; togglePause(); } if (!b(9) && G) G.pauseLatch = false;
  }
  return I;
}

// ---------- 경주 ----------
let G = null, raf = 0;
function start(trackId) {
  cancelAnimationFrame(raf);
  const def = TRACKS.find((t) => t.id === trackId), tr = buildTrack(def);
  const scene = new THREE.Scene(); buildScene(tr, scene);
  const kart = KARTS.find((k) => k.id === ST.kart) || KARTS[0];
  const ta = !gp && ST.mode === 'ta';
  const R = new Race(tr, { laps: ST.laps, kart, name: ST.name, diff: ST.diff, bots: 7, timeAttack: ta });
  const models = R.karts.map((k) => { const m = kartModel(k.K); if (k.isBot) m.g.add(labelSprite(k.name, '#fff')); scene.add(m.g); return m; });
  const boxes = R.boxes.map((b) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), new THREE.MeshLambertMaterial({ map: qTex, emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 })); m.position.set(b.x, 1.3, b.z); scene.add(m); return m; });
  const pool = { oil: [], missile: [] };
  const ghostData = ta ? loadGhost(def.id + '_' + ST.laps) : null;
  let ghost = null; if (ghostData) { ghost = kartModel(KARTS.find((k) => k.id === ghostData.kart) || KARTS[0], true); scene.add(ghost.g); }
  G = { R, tr, def, scene, models, boxes, pool, paused: false, msgT: 0, subT: 0, camPos: null, ta, ghostData, ghost, rec: [], recT: 0, shake: 0, lastItem: '' };
  G.mini = miniBase(tr);
  $('#overlay').classList.add('hidden'); show('play');
  msg('', 0); sub(`${def.icon} ${def.name} · ${ST.laps}바퀴${gp ? ` · 그랑프리 ${gp.i + 1}/${TRACKS.length}` : ta ? ' · 타임 어택' : ''}`, 3);
  last = performance.now(); acc = 0; raf = requestAnimationFrame(loop);
}

function togglePause() {
  if (!G) return; G.paused = !G.paused;
  if (G.paused) {
    engineSet(0, false, false);
    overlay(`<div class="card" style="width:min(380px,92vw);text-align:center"><h2 style="margin:4px 0 14px">⏸ 일시정지</h2><div class="row" style="justify-content:center"><button id="o-res" class="primary">계속하기</button><button id="o-re">다시 시작</button><button id="o-q">메뉴로</button></div></div>`);
    $('#o-res').onclick = togglePause; $('#o-re').onclick = () => { G.paused = false; start(G.def.id); }; $('#o-q').onclick = quit;
  } else { $('#overlay').classList.add('hidden'); last = performance.now(); }
}
function quit() { cancelAnimationFrame(raf); if (G) disposeScene(G.scene); G = null; $('#overlay').classList.add('hidden'); menu(); }
function disposeScene(s) { s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } }); }
function overlay(html) { const o = $('#overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function msg(t, sec = 1.2, color = '#fff') { const el = $('#hmsg'); el.textContent = t; el.style.color = color; el.style.opacity = t ? 1 : 0; if (G) G.msgT = sec; }
function sub(t, sec = 2) { $('#hsub').textContent = t; if (G) G.subT = sec; }

let last = 0, acc = 0;
const DT = 1 / 60;
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!G) return;
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (G.paused) { render(0); return; }
  acc += dt;
  const R = G.R, P = R.player;
  while (acc >= DT) {
    acc -= DT;
    if (!P.finished) Object.assign(P.inp, readInput());
    R.step(DT);
    if (G.ta && R.state === 'race' && !P.finished) { G.recT -= DT; if (G.recT <= 0) { G.recT += 0.1; G.rec.push([+P.x.toFixed(2), +P.z.toFixed(2), +P.h.toFixed(3)]); } }
    handleEvents();
    if (!G) return;
  }
  render(dt);
}

function handleEvents() {
  const R = G.R, P = R.player;
  for (const e of R.events) {
    const me = e.k === P;
    switch (e.type) {
      case 'count': msg(String(e.n), 0.9, '#ffcc33'); tone(440, 0.18, 'square', 0.07); break;
      case 'go': msg('GO!', 1, '#5dff8a'); tone(880, 0.45, 'square', 0.08); break;
      case 'startboost': sub('🔥 스타트 부스트!', 1.5); tone(500, 0.4, 'sawtooth', 0.05, 1400); break;
      case 'box': if (me) { tone(700, 0.08, 'square', 0.04); tone(1000, 0.08, 'square', 0.04, null, 0.08); } break;
      case 'got': if (me) tone(1300, 0.15, 'triangle', 0.06); break;
      case 'boost': if (me) { noise(0.5, 1800, 0.25); tone(300, 0.5, 'sawtooth', 0.05, 1200); G.shake = 0.2; } break;
      case 'miniboost': if (me) { tone(e.lv === 2 ? 1100 : 800, 0.2, 'sawtooth', 0.05, e.lv === 2 ? 1800 : 1200); sub(e.lv === 2 ? '🟠 슈퍼 미니 부스트!' : '🔵 미니 부스트', 0.8); } break;
      case 'drift': if (me) tone(1500, 0.08, 'square', 0.02); break;
      case 'drop': if (me) tone(200, 0.2, 'sine', 0.08, 90); break;
      case 'shield': if (me) tone(600, 0.3, 'sine', 0.07, 1200); break;
      case 'fire': if (me) { noise(0.4, 900, 0.3); sub(e.target ? `🎯 ${e.target.name} 조준!` : '🎯 발사!', 1); } else if (e.target === P) { sub('⚠️ 유도탄이 날아와요!', 1.5); tone(1200, 0.12, 'square', 0.05); tone(1200, 0.12, 'square', 0.05, null, 0.18); } break;
      case 'hit': if (me) { noise(0.35, 700, 0.5); tone(160, 0.3, 'sine', 0.15, 50); G.shake = 0.5; sub(e.why === 'oil' ? '🛢️ 미끄덩!' : '💥 맞았어요!', 1.2); } else if (Math.hypot(e.k.x - P.x, e.k.z - P.z) < 60) noise(0.2, 900, 0.15); break;
      case 'block': if (me) { sub('🛡️ 방패로 막았어요!', 1.2); tone(900, 0.2, 'triangle', 0.08); } break;
      case 'wall': noise(0.15, 500, 0.25); G.shake = 0.15; break;
      case 'bump': noise(0.08, 1200, 0.1); break;
      case 'lap': if (me) { if (e.final) { msg('FINAL LAP', 1.6, '#ff6a3d'); tone(660, 0.2, 'square', 0.06); tone(880, 0.3, 'square', 0.06, null, 0.2); } else { msg(`LAP ${e.lap}`, 1.1); tone(880, 0.2, 'square', 0.05); } sub(`한 바퀴 ${fmt(e.time)}`, 2); } break;
      case 'finish': if (me) { msg(P.place === 1 ? '🏆 1등!' : `${P.place}등 골인!`, 3, P.place <= 3 ? '#ffcc33' : '#fff'); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.06, null, i * 0.13)); } break;
      case 'done': setTimeout(results, 300); break;
    }
  }
  R.events.length = 0;
}

// ---------- 그리기 ----------
const tmpV = new THREE.Vector3(), lookV = new THREE.Vector3();
function render(dt) {
  const { R, models, scene } = G, P = R.player, t = performance.now() / 1000;
  R.karts.forEach((k, i) => {
    const m = models[i];
    m.g.position.set(k.x, k.hop > 0 ? Math.sin(k.hop / 0.35 * Math.PI) * 0.45 : 0, k.z);
    const dv = k.drift ? k.drift * -0.38 : 0; m.dv = (m.dv || 0) + (dv - (m.dv || 0)) * Math.min(1, dt * 10);
    m.g.rotation.y = k.h + m.dv + k.spinA;
    m.roll = (m.roll || 0) + ((k.inp.steer || 0) * Math.min(1, k.v / 30) * 0.06 - (m.roll || 0)) * Math.min(1, dt * 8); m.inner.rotation.z = m.roll;
    for (const w of m.wheels) w.rotation.x += k.v * dt / 0.47;
    for (const f of m.fronts) f.rotation.y = -(k.inp.steer || 0) * 0.4;
    m.shield.visible = k.shieldT > 0; if (m.shield.visible) m.shield.material.opacity = 0.2 + 0.1 * Math.sin(t * 12) + (k.shieldT < 2 ? 0.1 * Math.sin(t * 30) : 0);
    for (const f of m.flames) { f.visible = k.boostT > 0; if (f.visible) { f.scale.set(1, 1, 0.7 + Math.random() * 0.6); f.material.color.setHex(k.boostKind === 2 ? 0xff7a2a : 0x36c8ff); } }
    const sc = k.drift ? (k.charge > 1.9 ? 0xff8a2a : k.charge > 0.85 ? 0x36c8ff : 0xffffff) : 0;
    for (const s of m.sparks) { s.visible = !!k.drift && Math.random() < 0.8; if (s.visible) { s.material.color.setHex(sc); s.scale.setScalar(0.6 + Math.random() * (k.charge > 0.85 ? 1.2 : 0.5)); } }
  });
  R.boxes.forEach((b, i) => { const m = G.boxes[i]; m.visible = b.t <= 0; m.rotation.set(t * 0.9, t * 1.3 + i, 0); m.position.y = 1.4 + Math.sin(t * 2 + i) * 0.2; });
  syncPool('oil', R.hazards, () => { const g = new THREE.Group(); const d = new THREE.Mesh(new THREE.CircleGeometry(2.1, 18), new THREE.MeshBasicMaterial({ color: 0x14101c })); d.rotation.x = -Math.PI / 2; d.position.y = 0.07; g.add(d); const s = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.6 })); s.rotation.x = -Math.PI / 2; s.position.set(0.5, 0.08, 0.3); g.add(s); return g; }, (o, h) => o.position.set(h.x, 0, h.z));
  syncPool('missile', R.proj, () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 10), M(0xff3d3d)); c.rotation.x = Math.PI / 2; g.add(c); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc33 })); gl.position.z = -0.9; g.add(gl); return g; }, (o, m) => { o.position.set(m.x, 1.1, m.z); o.rotation.y = m.h; });
  // 유령 카트
  if (G.ghost) {
    const gd = G.ghostData.p, f = Math.max(0, R.t) * 10, i = Math.floor(f), a = gd[Math.min(i, gd.length - 1)], b = gd[Math.min(i + 1, gd.length - 1)], u = f - i;
    if (a && b) { G.ghost.g.position.set(a[0] + (b[0] - a[0]) * u, 0, a[1] + (b[1] - a[1]) * u); let dh = b[2] - a[2]; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2; G.ghost.g.rotation.y = a[2] + dh * u; G.ghost.g.visible = R.state !== 'count' || true; for (const w of G.ghost.wheels) w.rotation.x += 30 * dt; }
  }
  // 카메라
  const fx = Math.sin(P.h), fz = Math.cos(P.h);
  const back = R.state === 'count' ? 9 : 8.5 + Math.min(2, Math.abs(P.v) / 25);
  const cy = P.spinT > 0 ? P.h - P.spinA * 0.15 : P.h + (models[R.karts.indexOf(P)].dv || 0) * 0.35;
  tmpV.set(P.x - Math.sin(cy) * back, 4.2, P.z - Math.cos(cy) * back);
  if (!G.camPos) G.camPos = tmpV.clone(); else G.camPos.lerp(tmpV, 1 - Math.exp(-dt * 7));
  camera.position.copy(G.camPos);
  if (G.shake > 0) { G.shake -= dt; camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; }
  lookV.set(P.x + fx * 5, 1.2, P.z + fz * 5); camera.lookAt(lookV);
  const fov = 66 + Math.min(14, Math.max(0, P.v - 20) * 0.45) + (P.boostT > 0 ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  if (!G.paused) engineSet(P.v, P.boostT > 0, R.state !== 'done');
  hud(dt);
}
function syncPool(kind, list, make, set) {
  const pool = G.pool[kind];
  while (pool.length < list.length) { const o = make(); G.scene.add(o); pool.push(o); }
  pool.forEach((o, i) => { o.visible = i < list.length; if (o.visible) set(o, list[i]); });
}

// ---------- 화면 정보 ----------
function miniBase(tr) {
  const c = document.createElement('canvas'); c.width = c.height = 340; const x = c.getContext('2d'), B = tr.bounds;
  const sc = 300 / Math.max(B.maxX - B.minX, B.maxZ - B.minZ), ox = 170 - (B.minX + B.maxX) / 2 * sc, oz = 170 - (B.minZ + B.maxZ) / 2 * sc;
  const map = (px, pz) => [ox + px * sc, oz + pz * sc];
  x.lineJoin = 'round'; x.beginPath(); for (let i = 0; i <= tr.N; i++) { const j = i % tr.N, [a, b] = map(tr.P[j * 2], tr.P[j * 2 + 1]); if (i) x.lineTo(a, b); else x.moveTo(a, b); }
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 16; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 8; x.stroke();
  const [sx, sz] = map(tr.P[0], tr.P[1]); x.fillStyle = '#ff3d6e'; x.fillRect(sx - 5, sz - 5, 10, 10);
  return { c, map };
}
const hcache = {};
const setH = (id, v, html) => { if (hcache[id] === v) return; hcache[id] = v; const el = document.getElementById(id); if (html) el.innerHTML = v; else el.textContent = v; };
function hud(dt) {
  const R = G.R, P = R.player, n = R.karts.length;
  setH('hpos', G.ta ? '⏱️' : `${P.place}<small>/${n}</small>`, true);
  setH('hlap', `LAP ${Math.min(R.laps, P.lap)}/${R.laps}`);
  const best = (ST.rec[G.def.id] || {}).lap;
  setH('htime', `${fmt(Math.max(0, P.finished ? P.finishTime : R.t))}${isFinite(P.bestLap) ? ` · 베스트 ${fmt(P.bestLap)}` : best ? ` · 기록 ${fmt(best)}` : ''}`);
  setH('hspeed', `${Math.round(Math.abs(P.v) * 4.2)}<small> km/h</small>`, true);
  const ic = P.rollT > 0 ? ['🚀', '🛡️', '🛢️', '🎯', '⚡'][Math.floor(performance.now() / 90) % 5] : P.item ? ITEMS[P.item].icon + (P.uses > 1 ? `<em>×${P.uses}</em>` : '') : '';
  setH('hitem', ic, true); $('#hitem').classList.toggle('roll', P.rollT > 0); $('#hitem').classList.toggle('hidden', G.ta);
  const ch = $('#hcharge i'); ch.style.width = P.drift ? Math.min(100, P.charge / 1.9 * 100) + '%' : '0%'; ch.style.background = P.charge > 1.9 ? '#ff8a2a' : P.charge > 0.85 ? '#36c8ff' : '#ffffff';
  if (!G.ta) setH('hboard', R.order.map((k) => `<div class="${k === P ? 'me' : ''}">${k.place}. ${esc(k.name)}${k.finished && !k.est ? ' 🏁' : ''}</div>`).join(''), true); else setH('hboard', '', true);
  setH('hwrong', P.wrongT > 1.2 ? '⛔ 역주행!' : '');
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) $('#hmsg').style.opacity = 0; }
  if (G.subT > 0) { G.subT -= dt; if (G.subT <= 0) $('#hsub').textContent = ''; }
  // 미니맵
  const cv = $('#mini'), x = cv.getContext('2d'); x.clearRect(0, 0, 340, 340); x.drawImage(G.mini.c, 0, 0);
  for (const b of R.boxes) if (b.t <= 0) { const [a, c] = G.mini.map(b.x, b.z); x.fillStyle = 'rgba(255,210,58,.8)'; x.fillRect(a - 2, c - 2, 4, 4); }
  if (G.ghost) { const gp2 = G.ghost.g.position, [a, c] = G.mini.map(gp2.x, gp2.z); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(a, c, 8, 0, 7); x.fill(); }
  for (const k of [...R.karts].sort((a, b) => (a === P) - (b === P))) {
    const [a, c] = G.mini.map(k.x, k.z); x.beginPath(); x.arc(a, c, k === P ? 11 : 8, 0, 7); x.fillStyle = '#' + k.K.color.toString(16).padStart(6, '0'); x.fill(); x.lineWidth = 3; x.strokeStyle = k === P ? '#fff' : '#000'; x.stroke();
  }
}

// ---------- 결과 ----------
function results() {
  if (!G || G.R.state !== 'done' || G.shown) return;
  G.shown = true;
  engineSet(0, false, false);
  const R = G.R, P = R.player, id = G.def.id, rec = ST.rec[id] || (ST.rec[id] = {});
  let note = '';
  const raceT = P.finishTime;
  if (isFinite(P.bestLap) && (!rec.lap || P.bestLap < rec.lap)) { rec.lap = P.bestLap; note += `🎉 새 한 바퀴 기록 ${fmt(P.bestLap)}! `; }
  if (ST.laps === 3 && !P.est && (!rec.race || raceT < rec.race)) { rec.race = raceT; note += `🎉 새 3바퀴 기록 ${fmt(raceT)}! `; }
  if (G.ta) {
    const key = id + '_' + ST.laps, old = loadGhost(key);
    if (!old || raceT < old.t) { saveGhost(key, { t: raceT, kart: ST.kart, p: G.rec }); note += '👻 유령 카트를 저장했어요. '; }
  } else { ST.races++; if (P.place === 1) ST.wins++; }
  save();
  const rows = R.order.map((k) => `<tr class="${k === P ? 'me' : ''}"><td>${k.place}</td><td><span class="sw" style="--c:#${k.K.color.toString(16).padStart(6, '0')}"></span>${esc(k.name)}</td><td class="num">${k.est ? '(' + fmt(k.finishTime) + ')' : fmt(k.finishTime)}</td><td class="num">${isFinite(k.bestLap) ? fmt(k.bestLap) : '-'}</td>${gp ? `<td class="num">+${POINTS[k.place - 1] || 0}</td>` : ''}</tr>`).join('');
  let gpHtml = '', btns = '';
  if (gp) {
    for (const k of R.karts) gp.pts[k.name] = (gp.pts[k.name] || { pts: 0, color: k.K.color, me: k === P }), gp.pts[k.name].pts += POINTS[k.place - 1] || 0;
    const tbl = Object.entries(gp.pts).sort((a, b) => b[1].pts - a[1].pts);
    const last = gp.i === TRACKS.length - 1;
    gpHtml = `<h3 style="margin:14px 0 4px">🏆 그랑프리 순위 ${gp.i + 1}/${TRACKS.length}</h3><table>${tbl.map(([n, v], i) => `<tr class="${v.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n)}</td><td class="num">${v.pts}점</td></tr>`).join('')}</table>`;
    if (last) { const myRank = tbl.findIndex(([, v]) => v.me) + 1; if (myRank === 1) { ST.cups++; save(); } gpHtml = `<h2 style="text-align:center;margin:10px 0">${myRank === 1 ? '🏆 그랑프리 우승!' : myRank <= 3 ? `🥈 그랑프리 ${myRank}위 시상대!` : `그랑프리 ${myRank}위`}</h2>` + gpHtml; btns = `<button id="r-menu" class="primary">메뉴로</button>`; }
    else btns = `<button id="r-next" class="primary">다음 경기 ▶ ${TRACKS[gp.i + 1].icon} ${TRACKS[gp.i + 1].name}</button><button id="r-menu">그만하기</button>`;
  } else btns = `<button id="r-again" class="primary">다시 달리기</button><button id="r-menu">메뉴로</button>`;
  overlay(`<div class="card" style="max-height:92vh;overflow:auto"><h2 style="margin:2px 0 8px">${G.ta ? '⏱️ 타임 어택 결과' : P.place === 1 ? '🏆 우승!' : `🏁 ${P.place}등`} <span class="muted">${G.def.icon} ${G.def.name}</span></h2>
    ${note ? `<p style="color:#ffcc33;font-weight:800;margin:4px 0 10px">${note}</p>` : ''}
    <table><tr><th>순위</th><th>이름</th><th class="num">기록</th><th class="num">베스트 랩</th>${gp ? '<th class="num">점수</th>' : ''}</tr>${rows}</table>${gpHtml}
    <div class="row" style="margin-top:14px">${btns}</div><p class="muted">괄호 기록은 결승선까지 남은 거리로 계산한 예상 기록이에요.</p></div>`);
  const nx = $('#r-next'), ag = $('#r-again'), mn = $('#r-menu');
  if (nx) nx.onclick = () => { gp.i++; const id2 = TRACKS[gp.i].id; disposeScene(G.scene); start(id2); };
  if (ag) ag.onclick = () => { disposeScene(G.scene); start(G.def.id); };
  if (mn) mn.onclick = quit;
}

menu();
window.__tc = { get G() { return G; }, start, ST };
