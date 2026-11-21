// ===================== 듀얼 스트라이크 — 메뉴 · 조작 · 화면 · 함께 하기 =====================
import { Fighter, Match, FIGHTERS, STAGES, W, H, FLOOR, drawStage, drawFighter, drawFx } from './fight.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0; if (touch) document.body.classList.add('touch');
const ST = { p1: 'jin', p2: 'luna', mode: 'cpu', diff: 'normal', stage: 0, name: '' , wins: 0, games: 0 };
try { Object.assign(ST, JSON.parse(localStorage.getItem('ds_st') || '{}')); } catch (e) { /* 무시 */ }
if (!ST.name) ST.name = '파이터' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('ds_st', JSON.stringify(ST)); } catch (e) { /* 무시 */ } };
const cv = $('#cv'), g = cv.getContext('2d');
let M = null, raf = 0, acc = 0, last = 0, room = null, link = null, NS = null, banner = [], paused = false, frame = 0;

// ---------- 소리 ----------
let AC = null;
function tone(f, d, type = 'square', gain = 0.06, f1) { if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), e = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d); e.gain.setValueAtTime(gain, t); e.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(e); e.connect(AC.destination); o.start(t); o.stop(t + d + 0.02); }
function thud(big) { if (!AC) return; const t = AC.currentTime, b = AC.createBuffer(1, AC.sampleRate * 0.15, AC.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3); const s = AC.createBufferSource(); s.buffer = b; const f = AC.createBiquadFilter(); f.frequency.value = big ? 900 : 1800; const gn = AC.createGain(); gn.gain.value = big ? 0.5 : 0.3; s.connect(f); f.connect(gn); gn.connect(AC.destination); s.start(t); tone(big ? 90 : 160, 0.12, 'sine', 0.2, 50); }
function say(text) { try { if (!window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US'; u.rate = 1.05; u.pitch = 0.7; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* 무시 */ } }

// ---------- 메뉴 ----------
function portrait(id, w = 180, h = 200, face = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const D = FIGHTERS[id]; const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, D.color); gr.addColorStop(1, '#10121a'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  const f = new Fighter(D, 0, 'none'); f.x = 0; f.y = FLOOR; f.face = face; f.pose = [6, 0, 60, 110, 40, 120, 18, -20, -14, -10, 0];
  x.save(); x.translate(w / 2 - 6, 290 - FLOOR * 1.3); x.scale(1.3, 1.3); drawFighter(x, f, D, 0); x.restore();
  return c.toDataURL();
}
let PORT = null;
function menu() {
  show('menu');
  PORT = PORT || Object.fromEntries(Object.keys(FIGHTERS).map((k) => [k, portrait(k)]));
  const render = () => {
    const card = (side) => Object.values(FIGHTERS).map((D) => `<button class="ch ${ST[side] === D.id ? 'sel' : ''}" data-side="${side}" data-c="${D.id}" style="--c:${D.color}"><img src="${PORT[D.id]}"><b>${D.name}</b><small>${D.title}</small></button>`).join('');
    $('#p1sel').innerHTML = card('p1'); $('#p2sel').innerHTML = card('p2');
    const D1 = FIGHTERS[ST.p1];
    $('#info').innerHTML = `<b style="color:${D1.color}">${D1.name}</b> · 체력 ${D1.hp} · 기공 <em>${D1.sp.n.name}</em> · 앞+기공 <em>${D1.sp.f.name}</em> · 아래+기공 <em>${D1.sp.d.name}</em> · 초필살 <em>${D1.sup.name}</em>`;
    $('#modes').innerHTML = [['cpu', '🤖 컴퓨터와 대전'], ['2p', '👥 둘이서 (한 키보드)'], ['online', '🛰️ 온라인 방']].map(([k, n]) => `<button data-mode="${k}" class="${ST.mode === k ? 'sel' : ''}">${n}</button>`).join('');
    $('#diffs').innerHTML = [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button data-d="${k}" class="${ST.diff === k ? 'sel' : ''}">${n}</button>`).join('');
    $('#stages').innerHTML = STAGES.map((S, i) => `<button data-st="${i}" class="${ST.stage === i ? 'sel' : ''}">${S.name}</button>`).join('');
    $('#p2box').classList.toggle('hidden', ST.mode === 'online');
    $('#onl').classList.toggle('hidden', ST.mode !== 'online');
    $('#onl-note').textContent = room ? '방을 만들면 내가 1P, 들어온 친구가 2P' : '온라인 대전은 이 버전에서 준비 중이에요 · 지금은 봇(컴퓨터)과 함께 즐겨 주세요';
    $('#mk').disabled = $('#jn').disabled = !room;
    document.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { ST[b.dataset.side] = b.dataset.c; save(); render(); });
    document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { ST.mode = b.dataset.mode; save(); render(); });
    document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { ST.diff = b.dataset.d; save(); render(); });
    document.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { ST.stage = Number(b.dataset.st); save(); render(); });
    $('#rec').textContent = `전적 ${ST.wins}승 / ${ST.games}판`;
  };
  render();
  $('#fight').onclick = () => { if (ST.mode === 'online') return; start(ST.mode); };
  $('#mk').onclick = () => openRoom(Math.random().toString(36).slice(2, 6), true);
  $('#jn').onclick = () => { const c = $('#code').value.trim().toLowerCase(); if (/^[a-z0-9]{3,12}$/.test(c)) openRoom(c, false); };
}

// ---------- 조작 ----------
const KEYS = {
  p1: { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', lp: 'KeyJ', hp: 'KeyK', lk: 'KeyL', sp: 'KeyU', su: 'KeyI' },
  p2: { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', lp: 'Numpad1', hp: 'Numpad2', lk: 'Numpad3', sp: 'Numpad4', su: 'Numpad5' },
  p2b: { lp: 'Comma', hp: 'Period', lk: 'Slash', sp: 'Semicolon', su: 'Quote' },
};
const down = {}, edge = {};
addEventListener('keydown', (e) => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; if (!down[e.code]) edge[e.code] = true; down[e.code] = true; if (M && /Arrow|Space/.test(e.code)) e.preventDefault(); if (e.code === 'Escape' && M) togglePause(); });
addEventListener('keyup', (e) => { down[e.code] = false; });
const TB = {}; // 터치 버튼
function readInput(map, alt) {
  const I = {};
  for (const k of ['l', 'r', 'u', 'd']) I[k] = !!down[map[k]] || !!TB[k];
  for (const k of ['lp', 'hp', 'lk', 'sp', 'su']) { I[k] = !!edge[map[k]] || (alt && !!edge[alt[k]]) || !!TB['e' + k]; }
  return I;
}
function clearEdges() { for (const k in edge) edge[k] = false; for (const k of ['elp', 'ehp', 'elk', 'esp', 'esu']) TB[k] = false; }
if (touch) {
  const pad = $('#tpad'); pad.classList.remove('hidden');
  pad.querySelectorAll('[data-k]').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('on'); if (['l', 'r', 'u', 'd'].includes(k)) TB[k] = true; else TB['e' + k] = true; }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); if (['l', 'r', 'u', 'd'].includes(k)) TB[k] = false; }, { passive: false });
  });
  $('#tpause').addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); });
}

// ---------- 함께 하기 ----------
class Link {
  constructor(R, host) { this.R = R; this.host = host; this.last = 0; R.presence({ n: ST.name, host: host ? 1 : 0, c: ST.p1, st: 'lobby' }).catch(() => {}); this.un = R.onPeers(() => this.onPeers()); }
  me() { return this.R.peers().find((p) => p.sameTab); }
  other() { return this.R.peers().find((p) => !p.sameTab && p.kind === 'viewer'); }
  leave() { try { this.un(); } catch (e) { /* 무시 */ } this.R.leave().catch(() => {}); }
  tick(now, inp) {
    if (now - this.last < 33) return; this.last = now;
    if (this.host && M) this.R.presence({ st: 'game', snap: M.snap(), c: ST.p1, c2: this.c2 }).catch(() => {});
    else if (!this.host) this.R.presence({ st: NS ? 'game' : 'lobby', in: inp ? Object.entries(inp).filter(([, v]) => v).map(([k]) => k).join(',') : '', c: ST.p1 }).catch(() => {});
  }
  onPeers() {
    const o = this.other(); const P = o ? o.presence || {} : {};
    if (this.host) {
      if (!M) return lobby();
      if (M && o && P.in !== undefined) { const keys = String(P.in).split(','); const I = {}; for (const k of keys) if (k) I[k] = true; M.f[1].inp = { ...I, lp: I.lp && !this.prev?.lp, hp: I.hp && !this.prev?.hp, lk: I.lk && !this.prev?.lk, sp: I.sp && !this.prev?.sp, su: I.su && !this.prev?.su }; this.prev = I; }
    } else {
      if (!NS && P.st === 'game' && P.snap) { startClient(P.c); }
      if (NS && P.snap) NS.snap = P.snap;
      if (!o) lobby();
    }
  }
}
async function openRoom(code, host) {
  let R; try { R = await room.join('ds-' + code); } catch (e) { $('#onl-note').textContent = '방에 못 들어갔어요'; return; }
  link = new Link(R, host); link.code = code; show('lobby'); lobby();
}
function lobby() {
  if (!link || M || NS) return;
  const o = link.other();
  $('#lobby').innerHTML = `<div class="card"><h2>방 코드 <b class="code">${esc(link.code)}</b></h2><p>1P: ${esc(link.host ? ST.name : o ? o.presence.n : '?')} · 2P: ${esc(link.host ? (o ? o.presence.n : '기다리는 중…') : ST.name)}</p><p class="muted">캐릭터는 메뉴에서 고른 1P 캐릭터로 싸워요</p><div class="row">${link.host ? `<button id="lg" class="primary big" ${o ? '' : 'disabled'}>▶ 대전 시작</button>` : '<span class="muted">방장이 시작하기를 기다리는 중…</span>'}<button id="lx">나가기</button></div></div>`;
  const b = $('#lg'); if (b) b.onclick = () => { link.c2 = o.presence.c || 'luna'; start('host', link.c2); };
  $('#lx').onclick = () => { link.leave(); link = null; menu(); };
}

// ---------- 게임 ----------
function start(mode, c2) {
  if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  stop(); show('play'); $('#end').classList.add('hidden'); paused = false;
  const a = new Fighter(FIGHTERS[ST.p1], 0, 'p1'), b = new Fighter(FIGHTERS[mode === 'host' ? (FIGHTERS[c2] ? c2 : 'luna') : ST.p2], 1, mode === 'cpu' ? 'cpu' : mode === 'host' ? 'net' : 'p2');
  M = new Match(a, b, { diff: ST.diff }); M.mode = mode; M.stage = STAGES[ST.stage];
  last = performance.now(); acc = 0; raf = requestAnimationFrame(loop);
}
function startClient(hostChar) {
  stop(); show('play'); $('#end').classList.add('hidden');
  NS = { snap: null, defs: [FIGHTERS[hostChar] || FIGHTERS.jin, FIGHTERS[ST.p1]], stage: STAGES[0] };
  last = performance.now(); raf = requestAnimationFrame(loopClient);
}
function stop() { cancelAnimationFrame(raf); M = null; NS = null; }
function togglePause() { if (link) return; paused = !paused; $('#pause').classList.toggle('hidden', !paused); $('#pause').innerHTML = '<div class="card"><h2>멈춤</h2><div class="row"><button id="pz1" class="primary big">계속</button><button id="pz2">메뉴로</button></div></div>'; $('#pz1').onclick = togglePause; $('#pz2').onclick = () => { paused = false; $('#pause').classList.add('hidden'); quit(); }; }
function quit() { stop(); if (link) { link.leave(); link = null; } menu(); }
function loop(t) {
  raf = requestAnimationFrame(loop);
  acc += Math.min(100, t - last); last = t;
  if (!M) return;
  while (acc >= 1000 / 60) {
    acc -= 1000 / 60;
    if (paused) continue;
    M.f[0].inp = readInput(KEYS.p1);
    if (M.mode === '2p') M.f[1].inp = readInput(KEYS.p2, KEYS.p2b);
    clearEdges();
    M.step(); frame++;
    for (const e of M.events) onEvent(e);
    M.events.length = 0;
    if (M.mode === 'host' && M.f[1].inp) { for (const k of ['lp', 'hp', 'lk', 'sp', 'su']) M.f[1].inp[k] = false; }
  }
  render(M.snap(), M.f.map((f) => f.d), M.stage);
  if (link) link.tick(t);
}
function loopClient(t) {
  raf = requestAnimationFrame(loopClient);
  const I = readInput(KEYS.p1); const held = { ...I }; for (const k of ['lp', 'hp', 'lk', 'sp', 'su']) held[k] = !!down[KEYS.p1[k]] || I[k];
  // 손님은 자기가 오른쪽(2P): 좌우는 그대로 보냄
  clearEdges();
  if (link) link.tick(t, held);
  if (NS && NS.snap) { render(NS.snap, NS.defs, NS.stage); const sn = NS.snap; if (sn.ph === 'over' && !NS.ended) { NS.ended = true; endScreen(sn.wn === 1); } }
  else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.fillText('연결 중…', W / 2 - 60, H / 2); }
}
function onEvent(e) {
  if (e.t === 'hit') { thud(e.big); if (e.combo >= 3) banner.push({ s: `${e.combo} HIT COMBO!`, t: 60, side: e.side, small: true }); }
  else if (e.t === 'block') tone(1400, 0.05, 'square', 0.04);
  else if (e.t === 'announce') { banner.push({ s: e.s, t: 80 }); say(e.s === 'FIGHT!' ? 'Fight!' : e.s === 'K.O.' ? 'K.O.' : e.s); }
  else if (e.t === 'special') { banner.push({ s: e.name, t: 45, side: e.side, small: true }); tone(500, 0.2, 'sawtooth', 0.04, 900); }
  else if (e.t === 'super') { banner.push({ s: '초필살! ' + e.name, t: 70, side: e.side }); tone(200, 0.6, 'sawtooth', 0.08, 1400); say(e.name); }
  else if (e.t === 'proj') tone(700, 0.15, 'triangle', 0.05, 300);
  else if (e.t === 'jump') tone(300, 0.06, 'sine', 0.03, 500);
  else if (e.t === 'over') setTimeout(() => endScreen(e.w === 0), 1200);
}
function endScreen(won) {
  const vsCpu = M && M.mode === 'cpu';
  if (vsCpu || link) { ST.games++; if (won) ST.wins++; save(); }
  const who = M ? (M.mode === '2p' ? (won ? '1P 승리!' : '2P 승리!') : won ? '승리!' : '패배') : won ? '승리!' : '패배';
  $('#end').innerHTML = `<div class="card"><h1 class="${won ? 'win' : 'lose'}">${who}</h1><div class="row"><button id="e1" class="primary big">다시 하기</button><button id="e2">메뉴</button></div></div>`;
  $('#end').classList.remove('hidden');
  $('#e1').onclick = () => { if (link && !link.host) return; start(M ? M.mode : 'cpu', link && link.c2); };
  $('#e2').onclick = quit;
}

// ---------- 그리기 ----------
function render(sn, defs, stage) {
  const s = sn;
  g.save();
  const sh = s.sh || 0; g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  drawStage(g, stage, frame);
  // 캐릭터 (맞은 쪽 먼저)
  const F = s.f.map((a, i) => ({ x: a[0], y: a[1], face: a[2], hp: a[3], lag: a[4], meter: a[5], state: a[6], pose: a[7], combo: a[8], frz: a[9], i }));
  for (const f of F.sort((a, b) => (a.state === 'hurt' ? -1 : 0) - (b.state === 'hurt' ? -1 : 0))) {
    drawFighter(g, f, defs[f.i], frame);
    if (f.frz) { g.fillStyle = 'rgba(190,240,255,.35)'; g.fillRect(f.x - 40, f.y - 190, 80, 190); }
  }
  drawFx(g, s.fx.map(([k, x, y, t, n, big, face]) => ({ k, x, y, t, n, big, face })), s.p.map(([x, y, size, color, dir]) => ({ x, y, size, color, dir })), frame);
  g.restore();
  if (s.fl > 0) { g.fillStyle = `rgba(255,255,255,${s.fl * 0.6})`; g.fillRect(0, 0, W, H); }
  // 위 표시: 체력 · 시간 · 판
  const bar = (i) => {
    const f = s.f[i], D = defs[i], left = i === 0, x0 = left ? 40 : W - 40 - 500, hp = f[3] / D.hp, lag = f[4] / D.hp;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0 - 4, 30, 508, 34);
    g.fillStyle = '#c0392b'; const lw = 500 * Math.max(0, lag); g.fillRect(left ? x0 + 500 - lw : x0, 34, lw, 26);
    const hw = 500 * Math.max(0, hp); const gr = g.createLinearGradient(0, 34, 0, 60); gr.addColorStop(0, hp > 0.3 ? '#ffe14a' : '#ff6a3d'); gr.addColorStop(1, hp > 0.3 ? '#f2a21a' : '#c83a1a'); g.fillStyle = gr; g.fillRect(left ? x0 + 500 - hw : x0, 34, hw, 26);
    g.font = '900 24px sans-serif'; g.textAlign = left ? 'left' : 'right'; g.lineWidth = 5; g.strokeStyle = '#000'; const nm = `${D.name}`; g.strokeText(nm, left ? x0 : x0 + 500, 92); g.fillStyle = '#fff'; g.fillText(nm, left ? x0 : x0 + 500, 92);
    for (let k = 0; k < 2; k++) { g.fillStyle = s.w[i] > k ? '#ffd23a' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(left ? x0 + 480 - k * 26 : x0 + 20 + k * 26, 84, 9, 0, 7); g.fill(); }
    // 초필살 게이지
    const mx0 = left ? 40 : W - 40 - 300, m = f[5] / 100;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(mx0 - 3, H - 46, 306, 22); g.fillStyle = m >= 1 ? `hsl(${(frame * 6) % 360},90%,60%)` : '#3fa9ff'; g.fillRect(left ? mx0 : mx0 + 300 - 300 * m, H - 43, 300 * m, 16);
    g.font = '800 15px sans-serif'; g.fillStyle = '#fff'; g.textAlign = left ? 'left' : 'right'; g.fillText(m >= 1 ? '초필살 준비! (I)' : '필살 게이지', left ? mx0 : mx0 + 300, H - 52);
  };
  bar(0); bar(1);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(W / 2 - 46, 22, 92, 60); g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(String(s.tm), W / 2, 68);
  // 알림 글자
  for (const b of banner) b.t--; banner = banner.filter((b) => b.t > 0);
  banner.forEach((b) => {
    const big = !b.small; g.save(); g.globalAlpha = Math.min(1, b.t / 15); g.textAlign = 'center';
    g.font = `900 ${big ? 92 : 34}px sans-serif`; g.lineWidth = big ? 10 : 6; g.strokeStyle = '#000';
    const x = b.side === undefined ? W / 2 : b.side === 0 ? 300 : W - 300, y = big ? H / 2 - 40 : 170;
    g.strokeText(b.s, x, y); const gr = g.createLinearGradient(0, y - 80, 0, y); gr.addColorStop(0, '#fff'); gr.addColorStop(1, big ? '#ffb02e' : '#ffe14a'); g.fillStyle = gr; g.fillText(b.s, x, y); g.restore();
  });
}
function fit() { const r = Math.min(innerWidth / W, innerHeight / H); cv.style.width = W * r + 'px'; cv.style.height = H * r + 'px'; }
addEventListener('resize', fit); fit();
menu();
(async () => { try { if (window.claude && window.claude.use) { room = await window.claude.use('room'); if (!$('#menu').classList.contains('hidden')) menu(); } } catch (e) { room = null; } })();
window.__ds = { get M() { return M; }, start, ST };
