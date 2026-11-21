// ===================== 내비 화면 (목적지 검색 · 지도 선택 · 경로 비교) =====================
import { W } from './world.js';
import { S, save } from './state.js';
import { dongAt, guAt } from './data.js';
import { registerScreen } from './ui.js';
import { drawCityMap, mapView } from './mapdraw.js';
import { CATS, MODES, fmtDist } from './nav.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let app = null, cat = 'all', q = '', view = null, picked = null, plans = null, mode = 'fast', raf = 0;

export function initNavUI(a) {
  app = a;
  registerScreen('nav', renderNav);
}
const minutes = (s) => Math.max(1, Math.round(s / 60));
function clockAfter(sec) {
  const h = (S.world.hour + (sec * (S.settings.timeSpeed || 30)) / 3600) % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}
function renderNav() {
  const nav = app.nav, me = app.playerPose();
  if (!S.nav) S.nav = { fav: {}, recent: [] };
  nav.recent = S.nav.recent || nav.recent;
  $('#nav-here').textContent = `📍 지금 위치: ${guAt(me.x, me.z)} ${dongAt(me.x, me.z)}${app.roadName() ? ' · ' + app.roadName() : ''}`;
  $('#nav-voice').checked = nav.voice; $('#nav-3d').checked = nav.show3D; $('#nav-auto').checked = S.settings.navAuto !== false;
  $('#nav-voice').onchange = (e) => { nav.voice = e.target.checked; S.settings.navVoice = nav.voice; save(); };
  $('#nav-3d').onchange = (e) => { nav.show3D = e.target.checked; S.settings.nav3D = nav.show3D; save(); if (nav.active) nav.build3D(); };
  $('#nav-auto').onchange = (e) => { S.settings.navAuto = e.target.checked; save(); };
  $('#nav-close').onclick = () => app.resume();
  $('#nav-cats').innerHTML = CATS.map((c) => `<button class="${cat === c.id ? 'sel' : ''}" data-c="${c.id}">${c.icon} ${c.name}</button>`).join('');
  $$('#nav-cats [data-c]').forEach((b) => b.onclick = () => { cat = b.dataset.c; renderNav(); });
  const qi = $('#nav-q');
  qi.value = q;
  qi.oninput = () => { q = qi.value; drawResults(); };
  qi.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { const r = nav.search(q, cat, me)[0]; if (r) pick(r); } if (e.key === 'Escape') app.resume(); };
  $('#nav-qx').onclick = () => { q = ''; qi.value = ''; drawResults(); qi.focus(); };
  // 즐겨찾기 · 최근
  const fav = S.nav.fav || {};
  const quick = [];
  for (const [k, lbl, ic] of [['home', '집', '🏠'], ['work', '회사', '🏢']]) {
    const f = fav[k];
    quick.push(`<button class="qk" data-fav="${k}">${ic} <b>${lbl}</b><small>${f ? esc(f.name) : '눌러서 등록'}</small></button>`);
  }
  if (nav.active && nav.dest) quick.push(`<button class="qk on" id="nav-cur">🧭 <b>안내 중</b><small>${esc(nav.dest.name)} · 그만하기</small></button>`);
  $('#nav-quick').innerHTML = quick.join('') + (nav.recent.length ? `<div class="recent"><small>최근 목적지</small>${nav.recent.map((r, i) => `<button data-rc="${i}">${r.icon || '📍'} ${esc(r.name)}</button>`).join('')}</div>` : '');
  $$('#nav-quick [data-fav]').forEach((b) => b.onclick = () => {
    const k = b.dataset.fav;
    if (fav[k]) pick(fav[k]);
    else if (picked) { fav[k] = { name: picked.name, x: picked.x, z: picked.z, icon: k === 'home' ? '🏠' : '🏢', sub: picked.sub }; S.nav.fav = fav; save(); app.toast(`${k === 'home' ? '🏠 집' : '🏢 회사'}으로 <b>${esc(picked.name)}</b>을(를) 등록했어요`, 'good', 2200); renderNav(); }
    else app.toast('먼저 목적지를 고른 다음 눌러서 등록하세요', 'info', 2200);
  });
  $$('#nav-quick [data-rc]').forEach((b) => b.onclick = () => pick(nav.recent[Number(b.dataset.rc)]));
  const cur = $('#nav-cur'); if (cur) cur.onclick = () => { nav.stop(); renderNav(); };
  drawResults();
  // 지도
  const cv = $('#nav-map');
  { const r = cv.getBoundingClientRect(); if (r.width > 50) { const dpr = Math.min(1.5, window.devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); } }
  if (!view) view = { cx: me.x, cz: me.z, sc: Math.min(cv.width, cv.height) / 1400 };
  $('#nav-zin').onclick = () => (view.sc = Math.min(3, view.sc * 1.3));
  $('#nav-zout').onclick = () => (view.sc = Math.max(0.05, view.sc / 1.3));
  $('#nav-me').onclick = () => { const p = app.playerPose(); view.cx = p.x; view.cz = p.z; };
  let drag = null, moved = 0;
  cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => { if (!drag) return; const k = cv.width / cv.getBoundingClientRect().width; const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k; moved += Math.abs(dx) + Math.abs(dy); view.cx += dx / view.sc; view.cz += dy / view.sc; drag = { x: e.clientX, y: e.clientY }; };
  cv.onpointerup = (e) => {
    if (drag && moved < 6) {
      const rc = cv.getBoundingClientRect(), k = cv.width / rc.width;
      const w = mapView(cv, view.cx, view.cz, view.sc).toWorld((e.clientX - rc.left) * k, (e.clientY - rc.top) * k);
      // 가까운 장소가 있으면 그 장소, 없으면 지점
      let best = null, bd = 28 / view.sc;
      for (const p of nav.places()) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < bd) { bd = d; best = p; } }
      pick(best || { name: `${dongAt(w.x, w.z)} 부근 지점`, x: w.x, z: w.z, icon: '📌', sub: `${guAt(w.x, w.z)} ${dongAt(w.x, w.z)}`, cat: 'pt' });
    }
    drag = null;
  };
  cv.onwheel = (e) => { e.preventDefault(); view.sc = Math.max(0.05, Math.min(3, view.sc * (e.deltaY > 0 ? 0.88 : 1.14))); };
  drawPlan();
  cancelAnimationFrame(raf);
  const loop = () => {
    if (!$('#s-nav').classList.contains('show')) return;
    const me2 = app.playerPose();
    const v = mapView(cv, view.cx, view.cz, view.sc);
    drawCityMap(cv, v, { player: me2, names: true, stops: true, cams: true, pin: picked });
    const g = cv.getContext('2d');
    if (plans) for (const p of [...plans].reverse()) nav.drawMap(g, v.X, v.Y, p.r, p.mode.id === mode ? '#39c6ff' : 'rgba(160,180,200,.65)', p.mode.id === mode ? 6 : 4);
    else if (nav.active) nav.drawMap(g, v.X, v.Y);
    raf = requestAnimationFrame(loop);
  };
  loop();
  setTimeout(() => qi.focus(), 50);
}
function drawResults() {
  const nav = app.nav, me = app.playerPose();
  const list = nav.search(q, cat, me);
  $('#nav-results').innerHTML = list.length ? list.map((p, i) => `<button class="nres ${picked && picked.name === p.name ? 'sel' : ''}" data-i="${i}"><span class="ni">${p.icon}</span><span class="nt"><b>${hl(p.name)}</b><small>${esc(p.sub)}${p.routes ? ' · ' + p.routes.slice(0, 5).map(esc).join(', ') + (p.routes.length > 5 ? ' 외' : '') : ''}</small></span><span class="nd">${fmtDist(Math.hypot(p.x - me.x, p.z - me.z))}</span></button>`).join('') : '<p class="muted" style="padding:10px">검색 결과가 없어요. 다른 이름이나 초성으로 찾아보세요.</p>';
  $$('#nav-results [data-i]').forEach((b) => b.onclick = () => pick(list[Number(b.dataset.i)]));
}
function hl(name) {
  if (!q || /^[ㄱ-ㅎ\s]+$/.test(q)) return esc(name);
  const i = name.indexOf(q.trim());
  return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.trim().length)) + '</mark>' + esc(name.slice(i + q.trim().length));
}
function pick(p) {
  picked = p;
  const me = app.playerPose();
  plans = app.nav.compare(me, p);
  if (plans.length && !plans.find((x) => x.mode.id === mode)) mode = plans[0].mode.id;
  view.cx = (me.x + p.x) / 2; view.cz = (me.z + p.z) / 2;
  const span = Math.max(Math.abs(me.x - p.x), Math.abs(me.z - p.z)) + 300;
  view.sc = Math.max(0.05, Math.min(2, Math.min($('#nav-map').width, $('#nav-map').height) / span));
  drawResults(); drawPlan();
}
function drawPlan() {
  const el = $('#nav-plan');
  if (!picked) { el.innerHTML = '<div class="np-empty">🔎 목적지를 검색하거나 지도에서 골라 주세요<br><small>예: 광주역 · 전남대 · 주유소 · 금남로 · ㅈㄴㄷ</small></div>'; return; }
  if (!plans || !plans.length) { el.innerHTML = `<div class="np-empty">🚫 <b>${esc(picked.name)}</b>까지 갈 수 있는 경로를 찾지 못했어요</div>`; return; }
  // 같은 경로 합치기
  const uniq = [];
  for (const p of plans) { const sig = p.r.links.map((l) => l.id).join(','); const u = uniq.find((x) => x.sig === sig); if (u) u.names.push(p.mode.name); else uniq.push({ ...p, sig, names: [p.mode.name] }); }
  el.innerHTML = `<div class="np-dest"><span class="ni">${picked.icon || '📍'}</span><div><b>${esc(picked.name)}</b><small>${esc(picked.sub || '')}</small></div></div>
    <div class="np-opts">${uniq.map((p) => `<button class="np-opt ${p.names.includes(MODES.find((m) => m.id === mode).name) ? 'sel' : ''}" data-m="${p.mode.id}"><small>${p.names.join(' · ')}</small><b>${minutes(p.r.time)}분</b><span>${fmtDist(p.r.total)} · 신호 ${p.r.signals}개${p.r.toll ? ' · 통행료 ' + p.r.toll.toLocaleString() + '원' : ' · 무료'}</span><em>${p.r.roads.slice(0, 3).map(esc).join(' → ')}${p.r.roads.length > 3 ? ' …' : ''}</em><i>${clockAfter(p.r.time)} 도착</i></button>`).join('')}</div>
    <button id="nav-go" class="primary big">🧭 안내 시작</button>`;
  $$('#nav-plan [data-m]').forEach((b) => b.onclick = () => { mode = b.dataset.m; drawPlan(); });
  $('#nav-go').onclick = () => {
    const p = plans.find((x) => x.mode.id === mode) || plans[0];
    const ok = app.nav.start(picked, app.playerPose(), p.mode.id, { route: p.r });
    if (ok) { S.nav.recent = app.nav.recent; save(); plans = null; picked = null; app.resume(); }
  };
}
