// ===================== 팝 아레나 — 메뉴 · 조작 · 화면 · 함께 하기 =====================
import { Sim } from './sim.js';
import { View } from './view.js';
import { HEROES, MODES, T, tileAt, blocksMove } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const ME = { name: '', hero: 'volt', mode: 'gem', diff: 'normal', team: 'blue', trophies: {} };
try { Object.assign(ME, JSON.parse(localStorage.getItem('pa_me') || '{}')); } catch (e) { /* 무시 */ }
if (!ME.name) ME.name = '플레이어' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('pa_me', JSON.stringify(ME)); } catch (e) { /* 무시 */ } };
let room = null, link = null, sim = null, view = null, raf = 0, last = 0, myId = 'me', S = null, ended = false;
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add('touch');

// ---------------- 소리 ----------------
let AC = null;
function snd(f, d, type = 'square', g = 0.08, f1) { if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), e = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d); e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(e); e.connect(AC.destination); o.start(t); o.stop(t + d + 0.02); }
const SFX = { fire: () => snd(520, 0.06, 'square', 0.04, 260), hit: () => snd(220, 0.08, 'sawtooth', 0.05, 90), boom: () => snd(120, 0.35, 'sawtooth', 0.1, 40), gem: () => { snd(1200, 0.08, 'triangle', 0.06); setTimeout(() => snd(1600, 0.1, 'triangle', 0.06), 60); }, ko: () => snd(300, 0.3, 'triangle', 0.08, 80), sup: () => snd(300, 0.4, 'sawtooth', 0.08, 1200), win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => snd(f, 0.25, 'triangle', 0.08), i * 130)) };

// ---------------- 메뉴 ----------------
function heroCard(H, sel) {
  const tr = ME.trophies[H.id] || 0;
  return `<button class="hero ${sel ? 'sel' : ''}" data-h="${H.id}" style="--c:${H.color}"><div class="pic">${heroSvg(H)}</div><b>${H.name}</b><small>${H.role} · 🏆 ${tr}</small>
  <div class="st"><span>체력 ${H.hp}</span><span>공격 ${H.atk.dmg}${H.atk.n > 1 ? '×' + H.atk.n : ''}</span><span>사거리 ${H.atk.range}</span></div><p>${H.desc}</p><em>필살기: ${H.sup.name}</em></button>`;
}
function heroSvg(H) {
  const deco = { volt: '<rect x="47" y="6" width="6" height="18" fill="#ffe14a"/><circle cx="50" cy="6" r="6" fill="#ffe14a"/>', punk: '<path d="M38 18 L44 4 L50 18 L56 4 L62 18Z" fill="#ff3d6e"/>', momo: `<path d="M24 40 C24 12 76 12 76 40Z" fill="${H.color}"/>`, tank: '<rect x="28" y="14" width="44" height="8" fill="#4a7a3a"/>', lumi: '<path d="M30 22 L50 -4 L70 22Z" fill="#5a3ad8"/><circle cx="50" cy="-2" r="5" fill="#ffd23a"/>', som: '<g fill="#ff7ab6"><circle cx="32" cy="20" r="6"/><circle cx="50" cy="14" r="6" fill="#fff"/><circle cx="68" cy="20" r="6"/></g>' }[H.id] || '';
  return `<svg viewBox="0 -8 100 108"><circle cx="50" cy="92" r="30" fill="${H.color}"/><circle cx="50" cy="44" r="26" fill="#ffe0c4"/><circle cx="41" cy="46" r="6" fill="#fff"/><circle cx="59" cy="46" r="6" fill="#fff"/><circle cx="42" cy="47" r="3.5" fill="#222"/><circle cx="60" cy="47" r="3.5" fill="#222"/><path d="M42 58 Q50 64 58 58" stroke="#a0522d" stroke-width="3" fill="none"/>${deco}</svg>`;
}
function menu() {
  show('menu');
  $('#nick').value = ME.name; $('#nick').oninput = (e) => { ME.name = e.target.value.trim().slice(0, 10) || ME.name; save(); };
  const render = () => {
    $('#heroes').innerHTML = Object.values(HEROES).map((H) => heroCard(H, H.id === ME.hero)).join('');
    document.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { ME.hero = b.dataset.h; save(); render(); if (link) link.lobby({ hero: ME.hero }); });
    $('#modes').innerHTML = Object.values(MODES).map((M) => `<button data-m="${M.id}" class="${ME.mode === M.id ? 'sel' : ''}"><b>${M.icon} ${M.name}</b><small>${M.desc}</small></button>`).join('');
    document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { ME.mode = b.dataset.m; save(); render(); });
    $('#diffs').innerHTML = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button data-d="${k}" class="${ME.diff === k ? 'sel' : ''}">${n}</button>`).join('');
    document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { ME.diff = b.dataset.d; save(); render(); });
    const tot = Object.values(ME.trophies).reduce((a, b) => a + b, 0);
    $('#troph').textContent = `🏆 ${tot}`;
  };
  render();
  $('#go').onclick = () => startGame('solo');
  $('#mk').onclick = () => openRoom(Math.random().toString(36).slice(2, 6), true);
  $('#jn').onclick = () => { const c = $('#code').value.trim().toLowerCase(); if (/^[a-z0-9]{3,12}$/.test(c)) openRoom(c, false); else $('#mpn').textContent = '방 코드를 확인해 주세요'; };
  $('#mk').disabled = $('#jn').disabled = !room;
  $('#mpn').textContent = room ? '방을 만들고 코드를 친구에게 알려 주세요 · 빈자리는 봇이 채워요' : '온라인 대전은 이 버전에서 준비 중이에요 · 지금은 봇(컴퓨터)과 함께 즐겨 주세요';
}

// ---------------- 함께 하기 ----------------
class Link {
  constructor(R, host) { this.R = R; this.host = host; this.seq = 0; this.ring = []; this.seen = {}; this.last = 0; this.state = { n: ME.name, hero: ME.hero, team: ME.team, host: host ? 1 : 0, st: 'lobby' }; R.presence(this.state).catch(() => {}); this.un = R.onPeers(() => this.onPeers()); }
  lobby(p) { Object.assign(this.state, p); this.R.presence(p).catch(() => {}); }
  me() { return this.R.peers().find((p) => p.sameTab); }
  others() { return this.R.peers().filter((p) => !p.sameTab && p.kind === 'viewer'); }
  push(ev) { ev.s = ++this.seq; this.ring.push(ev); if (this.ring.length > 10) this.ring.shift(); this.dirty = true; }
  leave() { try { this.un(); } catch (e) { /* 무시 */ } this.R.leave().catch(() => {}); }
  tick(now) {
    if (now - this.last < 66 && !this.dirty) return; this.last = now; this.dirty = false;
    if (this.host && sim) this.R.presence({ st: 'game', snap: sim.snapshot(), mode: sim.mode }).catch(() => {});
    else if (!this.host && S && S.local) { const L = S.local; this.R.presence({ st: 'game', pos: [Math.round(L.x * 10) / 10, Math.round(L.z * 10) / 10, Math.round(L.face * 100) / 100], ev: this.ring }).catch(() => {}); }
  }
  onPeers() {
    if (!sim && !S) return lobbyRender();
    if (this.host && sim) {
      for (const p of this.others()) {
        const P = p.presence || {}; if (P.st !== 'game') continue;
        let pl = sim.players.find((q) => q.id === p.peer);
        if (!pl) {
          const team = P.team === 'red' ? 'red' : 'blue';
          const bot = sim.players.find((q) => q.isBot && q.team === team) || sim.players.find((q) => q.isBot);
          if (bot) sim.removePlayer(bot.id);
          pl = sim.addPlayer({ id: p.peer, name: String(P.n || '친구').slice(0, 10), team: bot ? bot.team : team, hero: HEROES[P.hero] ? P.hero : 'volt' });
          pl.remoteMove = true; pl.inp = {};
        }
        if (Array.isArray(P.pos) && !pl.dead && !pl.leap && !(pl.dashT > 0)) { const [x, z, f] = P.pos; if (Math.hypot(x - pl.x, z - pl.z) < 6) { pl.vx = (x - pl.x) * 15; pl.vz = (z - pl.z) * 15; pl.x = x; pl.z = z; pl.face = f; } }
        const last = this.seen[p.peer] ?? -1;
        for (const ev of P.ev || []) { if (ev.s <= last) continue; if (last >= 0) { if (ev.k === 'atk') sim.attack(pl, Number(ev.a) || 0, Number(ev.d) || undefined); else if (ev.k === 'sup') sim.superAtk(pl, Number(ev.a) || 0, Number(ev.d) || undefined); } }
        this.seen[p.peer] = Math.max(last, ...(P.ev || []).map((e) => e.s), 0);
      }
      for (const pl of sim.players.filter((q) => q.remoteMove)) if (!this.others().some((p) => p.peer === pl.id)) { const team = pl.team; sim.removePlayer(pl.id); sim.fillBots(); void team; }
    } else if (!this.host) {
      const h = this.others().find((p) => p.presence && p.presence.host === 1);
      if (h && h.presence.snap) applySnap(h.presence.snap);
    }
  }
}
async function openRoom(code, host) {
  let R; try { R = await room.join('pa-' + code); } catch (e) { $('#mpn').textContent = '방에 못 들어갔어요 (' + (e.code || e.message) + ')'; return; }
  link = new Link(R, host); link.code = code;
  show('lobby'); lobbyRender();
}
function lobbyRender() {
  if (!link || sim || S) return;
  const ps = link.R.peers().filter((p) => p.kind === 'viewer');
  const host = ps.find((p) => (p.sameTab ? link.host : p.presence.host === 1));
  if (!link.host && host && host.presence.st === 'game') { startGame('client'); return; }
  const row = (team) => ps.filter((p) => (p.sameTab ? ME.team : p.presence.team) === team).map((p) => { const P = p.sameTab ? { n: ME.name, hero: ME.hero } : p.presence; const H = HEROES[P.hero] || HEROES.volt; return `<li style="--c:${H.color}">${esc(P.n)}${p.sameTab ? ' (나)' : ''} <small>${H.name}</small></li>`; }).join('') || '<li class="muted">봇이 채워요</li>';
  $('#lobby').innerHTML = `<div class="card"><h2>방 코드 <b class="code">${esc(link.code)}</b></h2><p class="muted">${ps.length}명 · 모드: ${MODES[ME.mode].name} (방장이 정해요)</p>
  <div class="teams"><div><h3 class="blue">🔵 블루</h3><ul>${row('blue')}</ul><button data-t="blue">블루로</button></div><div><h3 class="red">🔴 레드</h3><ul>${row('red')}</ul><button data-t="red">레드로</button></div></div>
  <div class="row">${link.host ? '<button id="lb-go" class="primary big">▶ 시작</button>' : '<span class="muted">방장이 시작하기를 기다리는 중…</span>'}<button id="lb-x">나가기</button></div><p class="muted">캐릭터는 메인 메뉴에서 고른 걸로 해요 (지금: ${HEROES[ME.hero].name})</p></div>`;
  document.querySelectorAll('#lobby [data-t]').forEach((b) => b.onclick = () => { ME.team = b.dataset.t; save(); link.lobby({ team: ME.team }); lobbyRender(); });
  const g = $('#lb-go'); if (g) g.onclick = () => startGame('host');
  $('#lb-x').onclick = () => { link.leave(); link = null; menu(); };
}

// ---------------- 게임 ----------------
function startGame(kind) {
  if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  stop(); ended = false;
  show('play'); $('#end').classList.add('hidden');
  view = new View($('#view'));
  if (kind === 'client') {
    myId = (link.me() || {}).peer;
    S = { players: [], shots: [], lobs: [], zones: [], gems: [], score: { red: 0, blue: 0 }, timer: 150, mode: 'gem', local: null, fx: [] };
    S.hidden = (p, team) => p.team !== team && !p.dead && tileAt(p.x, p.z) === 'b' && !p.rev && !S.players.some((q) => q.team === team && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < 2.6);
    S.inBush = (p) => tileAt(p.x, p.z) === 'b';
    link.lobby({ st: 'game' });
  } else {
    sim = new Sim({ mode: ME.mode, diff: ME.diff });
    const me = sim.addPlayer({ id: link ? (link.me() || {}).peer : 'me', name: ME.name, team: link ? ME.team : 'blue', hero: ME.hero, human: true });
    myId = me.id; me.inp = {};
    sim.fillBots();
    sim.inBush = (p) => tileAt(p.x, p.z) === 'b';
    S = sim;
    if (link) { link.lobby({ st: 'game' }); link.onPeers(); }
  }
  last = performance.now(); raf = requestAnimationFrame(loop);
}
function stop() { cancelAnimationFrame(raf); if (view) view.dispose(); view = null; sim = null; S = null; }
// 손님: 방장 상태 받기
function applySnap(sn) {
  if (!S || sim) return;
  const old = new Map(S.players.map((p) => [p.id, p]));
  S.players = sn.p.map((a) => { const [id, name, team, hero, x, z, face, hp, dead, ammo, sup, gems, kos, y, spin, rev, bot, deaths, drv] = a; const o = old.get(id) || {}; return Object.assign(o, { id, name, team, hero, x, z, face, hp, maxHp: HEROES[hero].hp, dead: !!dead, ammo, superCh: sup, gems, kos, y, rev: !!rev, isBot: !!bot, deaths, drv: !!drv, vx: 0, vz: 0 }); });
  S.shots = sn.s.map(([id, x, z, vx, vz, hero, big]) => ({ id, x, z, vx, vz, hero, size: big ? 0.5 : 0.2 }));
  S.lobs = sn.l.map(([x0, z0, x1, z1, k, big]) => ({ x0, z0, x1, z1, k, big: !!big }));
  S.zones = sn.z.map(([x, z, r, t, team]) => ({ x, z, r, t, team }));
  S.gems = sn.g.map(([x, z]) => ({ x, z }));
  S.score = { red: sn.sc[0], blue: sn.sc[1] }; S.timer = sn.tm; S.count = sn.ct ? { team: sn.ct[0], t: sn.ct[1] } : null; S.mode = sn.m || S.mode;
  if (sn.ov && !S.over) S.over = { win: sn.ov[0], mvp: sn.ov[1] };
  const me = S.players.find((p) => p.id === myId);
  if (me) {
    if (!S.local || me.drv || (S.local.dead && !me.dead) || Math.hypot(S.local.x - me.x, S.local.z - me.z) > 5) S.local = { x: me.x, z: me.z, face: me.face };
    S.local.dead = me.dead;
  }
}

// ---------------- 조작 ----------------
const K = {}; const aim = { on: false, a: 0, d: 6, sup: false };
let mouse = { x: 0, y: 0, in: false };
addEventListener('keydown', (e) => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; K[e.code] = true; if ((e.code === 'Space' || e.code === 'KeyE') && S) { superNow(); e.preventDefault(); } if (e.code === 'KeyF' && S) autoFire(); if (e.code === 'Escape' && S) quitAsk(); });
addEventListener('keyup', (e) => { K[e.code] = false; });
const viewEl = $('#view');
viewEl.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, in: true }; });
viewEl.addEventListener('mouseleave', () => { mouse.in = false; });
viewEl.addEventListener('mousedown', (e) => { if (touch) return; if (e.button === 0) fireNow(); if (e.button === 2) superNow(); });
viewEl.addEventListener('contextmenu', (e) => e.preventDefault());
function meP() { if (!S) return null; if (sim) return sim.players.find((p) => p.id === myId); const m = S.players.find((p) => p.id === myId); return m && S.local ? { ...m, x: S.local.x, z: S.local.z, face: S.local.face } : m; }
function aimFromMouse() { const m = meP(); if (!m || !view || !mouse.in) return; const g = view.ground(mouse.x, mouse.y); aim.a = Math.atan2(g.x - m.x, g.z - m.z); aim.d = Math.hypot(g.x - m.x, g.z - m.z); }
function doAtk(sup) {
  const m = meP(); if (!m || m.dead) return;
  if (sim) { const p = sim.players.find((q) => q.id === myId); (sup ? sim.superAtk(p, aim.a, aim.d) : sim.attack(p, aim.a, aim.d)); }
  else if (link) { if (sup ? m.superCh < 1 : m.ammo < 1) return; link.push({ k: sup ? 'sup' : 'atk', a: Math.round(aim.a * 100) / 100, d: Math.round(aim.d * 10) / 10 }); if (S.local) S.local.face = aim.a; }
  if (sup) SFX.sup(); else SFX.fire();
}
function fireNow() { aimFromMouse(); doAtk(false); }
function superNow() { aimFromMouse(); doAtk(true); }
function autoFire() { const m = meP(); if (!m) return; let best = null, bd = 1e9; for (const e of S.players) { if (e.team === m.team || e.dead) continue; const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < bd) { bd = d; best = e; } } if (best) { aim.a = Math.atan2(best.x - m.x, best.z - m.z); aim.d = bd; } doAtk(false); }
// 터치: 왼쪽 이동 · 오른쪽 조준 끌기 (놓으면 발사, 톡 치면 자동 조준)
const TS = { move: null, aimT: null, mx: 0, mz: 0 };
if (touch) {
  const pad = $('#tpad');
  pad.classList.remove('hidden');
  const stickL = $('#stL'), stickR = $('#stR'), supB = $('#tsup');
  const rel = (t, el) => { const r = el.getBoundingClientRect(); return { x: t.clientX - (r.left + r.width / 2), y: t.clientY - (r.top + r.height / 2) }; };
  viewEl.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (t.clientX < innerWidth / 2 && !TS.move) { TS.move = { id: t.identifier, x: t.clientX, y: t.clientY }; stickL.style.left = t.clientX + 'px'; stickL.style.top = t.clientY + 'px'; stickL.classList.add('on'); } else if (t.clientX >= innerWidth / 2 && !TS.aimT) { TS.aimT = { id: t.identifier, x: t.clientX, y: t.clientY, moved: false, sup: false }; stickR.style.left = t.clientX + 'px'; stickR.style.top = t.clientY + 'px'; stickR.classList.add('on'); } } e.preventDefault(); }, { passive: false });
  viewEl.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (TS.move && t.identifier === TS.move.id) { let dx = (t.clientX - TS.move.x) / 45, dy = (t.clientY - TS.move.y) / 45; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } TS.mx = dx; TS.mz = dy; stickL.firstElementChild.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; } if (TS.aimT && t.identifier === TS.aimT.id) { const dx = t.clientX - TS.aimT.x, dy = t.clientY - TS.aimT.y; if (Math.hypot(dx, dy) > 14) { TS.aimT.moved = true; setAimFromStick(dx, dy, TS.aimT.sup); stickR.firstElementChild.style.transform = `translate(${Math.max(-40, Math.min(40, dx))}px,${Math.max(-40, Math.min(40, dy))}px)`; } } } e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { if (TS.move && t.identifier === TS.move.id) { TS.move = null; TS.mx = TS.mz = 0; stickL.classList.remove('on'); stickL.firstElementChild.style.transform = ''; } if (TS.aimT && t.identifier === TS.aimT.id) { if (TS.aimT.moved) doAtk(TS.aimT.sup); else if (TS.aimT.sup) superNow(); else autoFire(); TS.aimT = null; aim.on = false; aim.sup = false; stickR.classList.remove('on'); stickR.firstElementChild.style.transform = ''; } } };
  viewEl.addEventListener('touchend', end); viewEl.addEventListener('touchcancel', end);
  supB.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); const t = e.changedTouches[0]; TS.aimT = { id: t.identifier, x: t.clientX, y: t.clientY, moved: false, sup: true }; aim.sup = true; }, { passive: false });
  supB.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.changedTouches[0]; if (!TS.aimT) return; const dx = t.clientX - TS.aimT.x, dy = t.clientY - TS.aimT.y; if (Math.hypot(dx, dy) > 14) { TS.aimT.moved = true; setAimFromStick(dx, dy, true); } }, { passive: false });
  supB.addEventListener('touchend', (e) => { e.preventDefault(); if (TS.aimT) { if (TS.aimT.moved) doAtk(true); else superNow(); } TS.aimT = null; aim.on = false; aim.sup = false; }, { passive: false });
  $('#tmenu').addEventListener('touchstart', (e) => { e.preventDefault(); quitAsk(); });
}
function setAimFromStick(dx, dy, sup) {
  // 화면 위 = 앞 (우리 진영 기준)
  const flip = myTeam() === 'blue' ? -1 : 1;
  const m = meP(); if (!m) return;
  aim.a = Math.atan2(-dx * flip, -dy * flip) + (flip < 0 ? 0 : 0);
  aim.a = Math.atan2(dx * -flip, -dy * flip);
  const H = HEROES[m.hero], A = sup ? H.sup : H.atk; const R = A.range || 6;
  aim.d = Math.min(R, Math.hypot(dx, dy) / 70 * R); aim.on = true; aim.sup = sup;
}
function myTeam() { const m = S && S.players.find((p) => p.id === myId); return m ? m.team : 'blue'; }
function quitAsk() {
  const P = $('#pause'); if (!P.classList.contains('hidden')) { P.classList.add('hidden'); return; }
  P.innerHTML = `<div class="card"><h2>멈춤</h2><p class="muted">${link ? '함께 하는 중에는 게임이 계속 진행돼요' : ''}</p><div class="row"><button id="pz-go" class="primary big">계속하기</button><button id="pz-x">그만두기</button></div></div>`;
  P.classList.remove('hidden'); $('#pz-go').onclick = () => P.classList.add('hidden'); $('#pz-x').onclick = () => { P.classList.add('hidden'); leave(); };
}
function leave() { stop(); if (link) { link.leave(); link = null; } menu(); }

// ---------------- 루프 ----------------
function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (!view || !S) return;
  const team = myTeam(), flip = team === 'blue' ? -1 : 1;
  // 내 이동 입력 (화면 기준 → 맵 기준)
  let kx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), ky = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0);
  if (TS.move) { kx = TS.mx; ky = TS.mz; }
  const mx = -kx * flip, mz = -ky * flip;
  if (!touch) { aimFromMouse(); aim.on = mouse.in; aim.sup = false; }
  const paused = !link && !$('#pause').classList.contains('hidden');
  if (sim && paused) { view.render(S, myId, team, aim, 0); return; }
  if (sim) {
    const p = sim.players.find((q) => q.id === myId);
    if (p) { p.inp.mx = mx; p.inp.mz = mz; p.inp.aiming = aim.on && (touch ? !!TS.aimT : false); p.inp.aim = aim.a; }
    sim.step(dt);
    for (const f of sim.fx) { view.effect(f, sim); fxSound(f); }
    sim.fx.length = 0;
  } else if (S.local && !S.local.dead) {
    // 손님: 내 움직임은 내가 바로 계산
    const H = HEROES[(S.players.find((p) => p.id === myId) || {}).hero || 'volt'];
    const l = Math.hypot(mx, mz) || 1, k = Math.min(1, Math.hypot(mx, mz));
    const vx = mx / l * k * H.speed, vz = mz / l * k * H.speed;
    const ok = (x, z) => { for (const [ox, oz] of [[0.48, 0], [-0.48, 0], [0, 0.48], [0, -0.48]]) if (blocksMove(tileAt(x + ox, z + oz))) return false; return true; };
    if (ok(S.local.x + vx * dt, S.local.z)) S.local.x += vx * dt;
    if (ok(S.local.x, S.local.z + vz * dt)) S.local.z += vz * dt;
    if (k > 0.1) S.local.face = Math.atan2(vx, vz);
    const me = S.players.find((p) => p.id === myId); if (me) { me.x = S.local.x; me.z = S.local.z; me.face = S.local.face; }
    for (const s of S.shots) { s.x += s.vx * dt; s.z += s.vz * dt; }
  }
  if (link) link.tick(t);
  view.render(S, myId, team, aim, dt);
  hud();
}
function fxSound(f) {
  if (f.t === 'boom') SFX.boom(); else if (f.t === 'hit') SFX.hit(); else if (f.t === 'gem' && f.id === myId) SFX.gem(); else if (f.t === 'ko') { SFX.ko(); feed(f); }
}
const feedL = [];
function feed(f) { const by = S.players.find((p) => p.id === f.by), to = S.players.find((p) => p.id === f.id); feedL.push({ t: performance.now(), by, to }); }

// ---------------- 화면 정보 ----------------
let lastHud = '';
function hud() {
  const me = S.players.find((p) => p.id === myId) || {};
  const team = me.team || 'blue', opp = team === 'blue' ? 'red' : 'blue';
  const mode = sim ? sim.mode : S.mode;
  const sc = S.score, tm = Math.max(0, Math.ceil(sim ? sim.timer : S.timer));
  const cnt = S.count;
  let top = `<div class="sc ${team}"><b>${sc[team]}</b><small>${mode === 'gem' ? '💎 우리' : '🥊 우리'}</small></div><div class="tm"><b>${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}</b><small>${MODES[mode].name}</small></div><div class="sc ${opp}"><b>${sc[opp]}</b><small>${mode === 'gem' ? '💎 상대' : '🥊 상대'}</small></div>`;
  if (cnt) top += `<div class="count ${cnt.team === team ? 'good' : 'bad'}">${cnt.team === team ? '우리 팀' : '상대 팀'} 승리까지 ${Math.ceil(cnt.t)}초</div>`;
  const feedHtml = feedL.filter((f) => performance.now() - f.t < 4000).slice(-4).map((f) => `<div><b class="${f.by?.team}">${esc(f.by?.name || '?')}</b> 💥 <b class="${f.to?.team}">${esc(f.to?.name || '?')}</b></div>`).join('');
  const H = HEROES[me.hero || 'volt'];
  const sup = Math.min(1, me.superCh || 0);
  const html = top + '|' + feedHtml + '|' + Math.round(sup * 20) + (me.dead ? '|dead' + Math.ceil(me.respawnT || 3) : '');
  if (html !== lastHud) {
    lastHud = html;
    $('#top').innerHTML = top; $('#feed').innerHTML = feedHtml;
    $('#sup').innerHTML = `<div class="ring" style="--p:${sup * 100}%"><span>${sup >= 1 ? '⚡' : Math.round(sup * 100) + '%'}</span></div><small>${H.sup.name}<br>${touch ? '눌러서 끌기' : '우클릭 · Space'}</small>`;
    $('#sup').classList.toggle('ready', sup >= 1);
    $('#dead').classList.toggle('hidden', !me.dead);
    if (me.dead) $('#dead').textContent = `쓰러졌어요 · 곧 다시 나와요`;
  }
  // 끝
  const ov = sim ? sim.over : S.over;
  if (ov && !ended) { ended = true; setTimeout(() => endScreen(ov, team), 900); }
}
function endScreen(ov, team) {
  const win = ov.win === team, draw = ov.win === 'draw';
  const me = S.players.find((p) => p.id === myId) || {};
  const mvp = ov.mvp === myId;
  const d = draw ? 0 : win ? 8 + (mvp ? 3 : 0) : -4;
  ME.trophies[ME.hero] = Math.max(0, (ME.trophies[ME.hero] || 0) + d); save();
  if (win) SFX.win();
  const rows = S.players.slice().sort((a, b) => (a.team === team ? -1 : 1) - (b.team === team ? -1 : 1) || b.kos - a.kos).map((p) => `<tr class="${p.id === myId ? 'me' : ''}"><td><b class="${p.team}">${esc(p.name)}</b> ${p.id === ov.mvp ? '⭐MVP' : ''}</td><td>${HEROES[p.hero].name}</td><td>${p.kos}</td><td>${p.deaths || 0}</td></tr>`).join('');
  $('#end').innerHTML = `<div class="card"><h1 class="${draw ? '' : win ? 'win' : 'lose'}">${draw ? '무승부' : win ? '승리!' : '패배'}</h1><p>🏆 ${d >= 0 ? '+' : ''}${d} (${HEROES[ME.hero].name} ${ME.trophies[ME.hero]})${mvp ? ' · 내가 MVP!' : ''}</p>
  <table><tr><th>이름</th><th>캐릭터</th><th>처치</th><th>쓰러짐</th></tr>${rows}</table><div class="row"><button id="again" class="primary big">다시 하기</button><button id="tomenu">메뉴</button></div></div>`;
  $('#end').classList.remove('hidden');
  $('#again').onclick = () => { if (link && !link.host) { $('#again').textContent = '방장이 다시 시작하면 들어가요'; return; } startGame(link ? 'host' : 'solo'); };
  $('#tomenu').onclick = leave;
  void me;
}
addEventListener('resize', () => view && view.resize());
menu();
(async () => { try { if (window.claude && window.claude.use) { room = await window.claude.use('room'); if (!$('#menu').classList.contains('hidden')) menu(); } } catch (e) { room = null; } })();
window.__pa = { get sim() { return sim; }, startGame, ME };
