// ===================== 라운드 제로 — 시작 · 메뉴 · 방 · 게임 루프 =====================
import { Game } from './game.js';
import { AGENTS } from './weapons.js';
import { I, SET, saveSet, bindInput, bindTouch, onKey, isLocked } from './input.js';
import { updateHud, drawMinimap, renderShop, showBoard, resetHud, esc } from './hud.js';
import { initAudio, setVol } from './audio.js';
import { Net } from './net.js';

const $ = (s) => document.querySelector(s);
const show = (id) => { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id); };
const host = $('#view');
let G = null, net = null, room = null, raf = 0, lastT = 0, paused = false, touch = false, frame = 0;
const ST = { name: '', agent: 'blaze', grp: 'red', diff: 'normal' };
try { Object.assign(ST, JSON.parse(localStorage.getItem('rz_me') || '{}')); } catch (e) { /* 무시 */ }
const saveMe = () => { try { localStorage.setItem('rz_me', JSON.stringify(ST)); } catch (e) { /* 무시 */ } };
if (!ST.name) ST.name = '요원' + Math.floor(100 + Math.random() * 900);

// ---------- 메인 메뉴 ----------
function menu() {
  show('menu');
  $('#nick').value = ST.name;
  $('#nick').oninput = (e) => { ST.name = e.target.value.trim().slice(0, 12) || ST.name; saveMe(); };
  $('#m-solo').onclick = () => pickAgent('solo');
  $('#m-make').onclick = () => makeRoom();
  $('#m-join').onclick = () => joinRoom($('#code').value.trim().toLowerCase());
  $('#m-set').onclick = () => settings(menu);
  $('#m-help').onclick = () => { show('help'); $('#help-back').onclick = menu; };
  const mp = $('#mp-note');
  if (room) { mp.textContent = '친구와 같은 방 코드로 들어오면 함께 싸워요 (빈자리는 봇이 채워요)'; $('#m-make').disabled = false; $('#m-join').disabled = false; }
  else { mp.textContent = '온라인 대전은 이 버전에서 준비 중이에요 · 지금은 봇(컴퓨터)과 함께 즐겨 주세요'; $('#m-make').disabled = true; $('#m-join').disabled = true; }
}
// 요원 고르기
function agentCards(sel) {
  return Object.values(AGENTS).map((A) => `<button class="agent ${A.id === sel ? 'sel' : ''}" data-ag="${A.id}" style="--c:${A.color}"><div class="face">${agentSvg(A)}</div><b>${A.name}</b><small>${A.role} · ${A.desc}</small>
  <div class="sk"><span><i>Q</i>${A.q.icon} ${A.q.name}</span><span><i>E</i>${A.e.icon} ${A.e.name}</span></div></button>`).join('');
}
function agentSvg(A) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="g${A.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.color}"/><stop offset="1" stop-color="#0b1016"/></linearGradient></defs>
  <rect width="100" height="100" fill="url(#g${A.id})"/><path d="M20 100 C22 70 34 62 50 62 C66 62 78 70 80 100Z" fill="#1b232c"/><path d="M30 100 L36 72 L64 72 L70 100Z" fill="${A.color}" opacity=".55"/>
  <circle cx="50" cy="42" r="19" fill="#d9ab85"/><path d="M29 40 C29 22 71 22 71 40 L71 46 L29 46Z" fill="#2c3640"/><rect x="31" y="38" width="38" height="9" rx="4" fill="#0b0f14"/><rect x="33" y="40" width="34" height="4" rx="2" fill="${A.color}"/></svg>`;
}
function pickAgent(mode) {
  show('agents');
  const render = () => {
    $('#ag-list').innerHTML = agentCards(ST.agent);
    document.querySelectorAll('[data-ag]').forEach((b) => b.onclick = () => { ST.agent = b.dataset.ag; saveMe(); render(); });
    $('#ag-opts').innerHTML = `<div class="row"><span>시작 팀</span>${[['red', '공격 먼저'], ['blue', '수비 먼저']].map(([k, n]) => `<button data-grp="${k}" class="${ST.grp === k ? 'sel' : ''}">${n}</button>`).join('')}</div>
    <div class="row"><span>봇 실력</span>${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button data-diff="${k}" class="${ST.diff === k ? 'sel' : ''}">${n}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-grp]').forEach((b) => b.onclick = () => { ST.grp = b.dataset.grp; saveMe(); render(); });
    document.querySelectorAll('[data-diff]').forEach((b) => b.onclick = () => { ST.diff = b.dataset.diff; saveMe(); render(); });
  };
  render();
  $('#ag-go').onclick = () => start({ mode: 'solo' });
  $('#ag-back').onclick = menu;
}
// ---------- 방 ----------
async function makeRoom() {
  const code = Math.random().toString(36).slice(2, 6);
  await enterRoom(code, true);
}
async function joinRoom(code) {
  if (!/^[a-z0-9]{3,12}$/.test(code)) { $('#mp-note').textContent = '방 코드를 확인해 주세요 (영문 소문자 · 숫자)'; return; }
  await enterRoom(code, false);
}
async function enterRoom(code, isHost) {
  let R;
  try { R = await room.join('rz-' + code); } catch (e) { $('#mp-note').textContent = '방에 들어가지 못했어요 (' + (e.code || e.message) + ')'; return; }
  net = new Net(R, { host: isHost, name: ST.name, grp: ST.grp, agent: ST.agent, onLobby: () => lobbyRender(code) });
  show('lobby');
  lobbyRender(code);
}
function lobbyRender(code) {
  if (!net || G) { if (net && G && !net.host) { /* 게임 중 */ } return; }
  const meP = net.me(); const ps = net.R.peers().filter((p) => p.kind === 'viewer');
  const hostP = ps.find((p) => p.presence && p.presence.host === 1);
  // 방장이 시작하면 손님도 시작
  if (!net.host && hostP && hostP.presence.st === 'game') { start({ mode: 'client' }); return; }
  const col = (grp) => ps.filter((p) => (p.sameTab ? ST.grp : p.presence.g) === grp).map((p) => { const P = p.sameTab ? { n: ST.name, ag: ST.agent, host: net.host ? 1 : 0 } : p.presence; return `<li style="--c:${AGENTS[P.ag]?.color || '#888'}">${esc(P.n || '?')}${p.sameTab ? ' <em>나</em>' : ''}${P.host === 1 ? ' 👑' : ''}<small>${esc(AGENTS[P.ag]?.name || '')}</small></li>`; }).join('') || '<li class="muted">비어 있음 (봇이 채워요)</li>';
  $('#lobby-body').innerHTML = `<h2>방 코드 <b class="code">${esc(code)}</b></h2><p class="muted">친구에게 이 코드를 알려 주세요 · ${ps.length}명 들어옴</p>
  <div class="teams"><div><h3 style="color:#ff6a3d">🔥 레드 (공격 먼저)</h3><ul>${col('red')}</ul><button data-grp="red" class="${ST.grp === 'red' ? 'sel' : ''}">레드로</button></div>
  <div><h3 style="color:#36d1c4">🛡️ 블루 (수비 먼저)</h3><ul>${col('blue')}</ul><button data-grp="blue" class="${ST.grp === 'blue' ? 'sel' : ''}">블루로</button></div></div>
  <h3>내 요원</h3><div class="agents mini">${agentCards(ST.agent)}</div>
  <div class="row">${net.host ? `<span>봇 실력</span>${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, n]) => `<button data-diff="${k}" class="${ST.diff === k ? 'sel' : ''}">${n}</button>`).join('')}` : ''}</div>
  <div class="row">${net.host ? '<button id="lb-start" class="primary big">▶ 시작</button>' : '<p class="muted">방장이 시작하기를 기다리는 중…</p>'}<button id="lb-leave">나가기</button></div>`;
  document.querySelectorAll('#lobby-body [data-grp]').forEach((b) => b.onclick = () => { ST.grp = b.dataset.grp; saveMe(); net.setLobby({ g: ST.grp }); lobbyRender(code); });
  document.querySelectorAll('#lobby-body [data-ag]').forEach((b) => b.onclick = () => { ST.agent = b.dataset.ag; saveMe(); net.setLobby({ ag: ST.agent }); lobbyRender(code); });
  document.querySelectorAll('#lobby-body [data-diff]').forEach((b) => b.onclick = () => { ST.diff = b.dataset.diff; saveMe(); lobbyRender(code); });
  const s = $('#lb-start'); if (s) s.onclick = () => start({ mode: 'host' });
  $('#lb-leave').onclick = () => { net.leave(); net = null; menu(); };
}

// ---------- 게임 ----------
function start({ mode }) {
  initAudio(); setVol(SET.vol);
  stopGame();
  show('play');
  resetHud();
  const myId = net ? (net.me() || {}).peer || 'me' : 'me';
  G = new Game(host, { mode, me: { name: ST.name, grp: ST.grp, agent: ST.agent }, myId, diff: ST.diff, fov: SET.fov, quality: SET.quality, bots: mode !== 'client' });
  document.documentElement.style.setProperty('--xc', SET.xcolor);
  if (net) {
    net.attach(G);
    // 방장: 들어와 있는 사람을 요원으로 (봇 자리 대신)
    if (mode === 'host') { net.setLobby({ st: 'game' }); net.onPeers({}); }
  }
  $('#over').classList.add('hidden'); delete $('#over').dataset.shown;
  paused = false; lastT = performance.now();
  if (!touch) $('#click').classList.remove('hidden');
  cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
function stopGame() { if (G) { G.dispose(); G = null; } cancelAnimationFrame(raf); }
function loop(t) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (!G) return;
  frame++;
  const shopOpen = !$('#shop').classList.contains('hidden');
  if (shopOpen && G.phase !== 'buy') closeShop();
  if (!paused || net) G.update(dt, paused || shopOpen ? { ...I, f: 0, b: 0, l: 0, r: 0, fire: false, dx: 0, dy: 0, jx: 0, jy: 0 } : I);
  if (paused || shopOpen) { I.dx = I.dy = 0; }
  G.render(dt);
  updateHud(G, I);
  if (frame % 2 === 0) drawMinimap(G);
  if (net) net.tick(t);
  if (shopOpen && frame % 15 === 0) { const c = $('#shop .cr'); if (c) c.textContent = '◈ ' + G.me.credits.toLocaleString(); }
  // 끝난 판 버튼
  const ag = $('#again'); if (ag && !ag.onclick) { ag.onclick = () => { if (net && !net.host) return; start({ mode: net ? 'host' : 'solo' }); }; $('#tomenu').onclick = leaveGame; }
}
function leaveGame() {
  stopGame();
  if (net) { net.leave(); net = null; }
  document.exitPointerLock?.();
  $('#pause').classList.add('hidden'); closeShop();
  menu();
}
function openShop() {
  if (!G || G.phase !== 'buy' || !G.me.alive) return;
  document.exitPointerLock?.();
  $('#shop').classList.remove('hidden');
  renderShop(G, (what) => { const err = G.buy(G.me, what); if (!err) { G.setViewGun(); import('./audio.js').then((m) => m.sfx.buy()); } return err; });
}
function closeShop() { $('#shop').classList.add('hidden'); }
function pause(on) {
  paused = on;
  $('#pause').classList.toggle('hidden', !on);
  if (on) {
    $('#pause').innerHTML = `<div class="card"><h2>일시정지</h2>${net ? '<p class="muted">함께 하는 중에는 게임이 멈추지 않아요</p>' : ''}<div class="col"><button id="p-resume" class="primary big">계속하기</button><button id="p-set">설정</button><button id="p-quit" class="danger">나가기</button></div></div>`;
    $('#p-resume').onclick = () => { pause(false); if (!touch) host.requestPointerLock?.(); };
    $('#p-set').onclick = () => settings(() => pause(true));
    $('#p-quit').onclick = leaveGame;
  }
}
// ---------- 설정 ----------
function settings(back) {
  const el = G ? $('#pause') : null;
  const html = `<div class="card"><h2>설정</h2>
  <label>마우스 감도 <input id="s-sens" type="range" min="0.2" max="3" step="0.05" value="${SET.sens}"><b>${SET.sens.toFixed(2)}</b></label>
  <label>시야각 (FOV) <input id="s-fov" type="range" min="65" max="105" step="1" value="${SET.fov}"><b>${SET.fov}</b></label>
  <label>소리 <input id="s-vol" type="range" min="0" max="1" step="0.05" value="${SET.vol}"><b>${Math.round(SET.vol * 100)}</b></label>
  <label>그래픽 <select id="s-q"><option value="high" ${SET.quality === 'high' ? 'selected' : ''}>높음 (그림자)</option><option value="low" ${SET.quality === 'low' ? 'selected' : ''}>낮음 (빠름)</option></select></label>
  <label>십자선 색 <input id="s-xc" type="color" value="${SET.xcolor}"></label>
  <label><input id="s-inv" type="checkbox" ${SET.invert ? 'checked' : ''}> 마우스 위아래 반전</label>
  <label><input id="s-tog" type="checkbox" ${SET.toggleAim ? 'checked' : ''}> 조준(우클릭) 눌러서 켜고 끄기</label>
  <p class="muted">그래픽은 다음 판부터 바뀌어요.</p>
  <button id="s-back" class="primary">확인</button></div>`;
  if (el) el.innerHTML = html; else { show('setscr'); $('#setscr').innerHTML = html; }
  const rng = (id, k, f = (v) => v) => { const i = $(id); i.oninput = () => { SET[k] = f(Number(i.value)); i.nextElementSibling.textContent = k === 'vol' ? Math.round(SET[k] * 100) : k === 'sens' ? SET[k].toFixed(2) : SET[k]; saveSet(); if (k === 'vol') setVol(SET.vol); if (k === 'fov' && G) G.opts.fov = SET.fov; }; };
  rng('#s-sens', 'sens'); rng('#s-fov', 'fov'); rng('#s-vol', 'vol');
  $('#s-q').onchange = (e) => { SET.quality = e.target.value; saveSet(); };
  $('#s-xc').oninput = (e) => { SET.xcolor = e.target.value; saveSet(); document.documentElement.style.setProperty('--xc', SET.xcolor); };
  $('#s-inv').onchange = (e) => { SET.invert = e.target.checked; saveSet(); };
  $('#s-tog').onchange = (e) => { SET.toggleAim = e.target.checked; saveSet(); };
  $('#s-back').onclick = back;
}

// ---------- 시작 ----------
bindInput(host);
touch = bindTouch(host);
onKey({
  typing: () => document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range',
  wantLock: () => !!G && !paused && $('#shop').classList.contains('hidden'),
  unlock: () => { if (G && !G.over && $('#shop').classList.contains('hidden') && !touch) pause(true); },
  buy: () => { if (!G) return; if ($('#shop').classList.contains('hidden')) openShop(); else { closeShop(); if (!touch) host.requestPointerLock?.(); } },
  board: (on) => { if (G) showBoard(G, on); },
  esc: () => { if (!G) return; if (!$('#shop').classList.contains('hidden')) { closeShop(); return; } if (touch) pause(!paused); },
  zoom: () => (G && G.scoped ? 0.4 : G && G.aimHeld ? 0.85 : 1),
  curSlot: () => (G ? G.me.slot : 2),
});
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === host) { $('#click').classList.add('hidden'); if (paused) pause(false); } });
$('#click').onclick = () => host.requestPointerLock?.();
addEventListener('resize', () => G && G.resize());
menu();
// 함께 하기 (가능하면)
(async () => {
  try { if (window.claude && window.claude.use) { room = await window.claude.use('room'); if ($('#menu') && !$('#menu').classList.contains('hidden')) menu(); } } catch (e) { room = null; }
})();
export { isLocked };
window.__rz = { get G() { return G; }, start, I, ST };
