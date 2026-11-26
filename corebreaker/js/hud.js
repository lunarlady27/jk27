// ===================== 화면 표시 (HUD · 미니맵 · 상점 · 점수판) =====================
import { WEAPONS, AGENTS, SHOP, ARMOR } from './weapons.js';
import { RULES } from './game.js';
import { TEAM } from './actors.js';
import { GW, GH, CELL, hAt, SITES, MAP } from './map.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let last = {};
const set = (sel, html) => { if (last[sel] !== html) { last[sel] = html; const e = $(sel); if (e) e.innerHTML = html; } };
export function resetHud() { last = {}; }
const fmtT = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// 미니맵 바탕 (한 번만)
let mmBase = null;
function minimapBase() {
  if (mmBase) return mmBase;
  const s = 4, c = document.createElement('canvas'); c.width = GW * s; c.height = GH * s;
  const g = c.getContext('2d');
  for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
    const h = hAt(x, z);
    g.fillStyle = h >= 6 ? 'rgba(0,0,0,0)' : h > 0 ? '#5b6672' : '#9aa6b2';
    g.fillRect(x * s, z * s, s, s);
  }
  g.fillStyle = 'rgba(255,210,58,.35)';
  for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) { const zn = MAP.ZONE[z * GW + x]; if (zn === 1 || zn === 2) g.fillRect(x * s, z * s, s, s); }
  g.font = '900 22px sans-serif'; g.fillStyle = '#ffd23a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const st of Object.values(SITES)) g.fillText(st.name, st.x / CELL * s, st.z / CELL * s);
  mmBase = c; return c;
}
export function drawMinimap(G) {
  const cv = $('#minimap'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const me = G.me, pov = G.alivePov();
  g.clearRect(0, 0, W, H);
  g.save();
  // 내 위치 중심, 내가 보는 쪽이 위
  const sc = 2.6; // 1m = 2.6px
  g.translate(W / 2, H / 2); g.rotate(pov.yaw + Math.PI);
  g.scale(sc / (4 / CELL) / 2 * 2, sc / (4 / CELL) / 2 * 2);
  const k = sc * CELL / 4;
  g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.rotate(pov.yaw + Math.PI); g.scale(k, k);
  g.drawImage(minimapBase(), -pov.x / CELL * 4, -pov.z / CELL * 4);
  const P = (x, z) => [(x - pov.x) / CELL * 4, (z - pov.z) / CELL * 4];
  // 연막
  g.fillStyle = 'rgba(160,165,200,.75)';
  for (const s of G.smokes) { const [x, y] = P(s.x, s.z); g.beginPath(); g.arc(x, y, s.r / CELL * 4, 0, 7); g.fill(); }
  // 코어
  const C = G.core;
  if (C.state === 'planted' || (C.state === 'dropped' && me.team === 'atk')) { const [x, y] = P(C.x, C.z); g.fillStyle = '#ff3b3b'; g.fillRect(x - 4, y - 4, 8, 8); }
  // 요원
  for (const a of G.actors) {
    if (!a.alive) continue;
    const mate = a.team === me.team;
    if (!mate && !(a.revealT > 0) && !a.seenByMyTeam) continue;
    const [x, y] = P(a.x, a.z);
    g.save(); g.translate(x, y); g.rotate(-a.yaw + Math.PI);
    g.fillStyle = a === me ? '#ffffff' : mate ? TEAM[a.team].color : '#ff3b3b';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    if (mate && a.carry) { g.fillStyle = '#ff3b3b'; g.fillRect(x + 4, y - 9, 5, 5); }
  }
  g.restore();
  // 테두리 · 북쪽 표시 없음 (회전 지도)
}

export function updateHud(G, I) {
  const me = G.me, pov = G.alivePov();
  // 위: 점수 · 시계
  const red = G.score.red, blue = G.score.blue;
  const myGrp = me.grp, oppGrp = myGrp === 'red' ? 'blue' : 'red';
  const myTeam = me.team, oppTeam = myTeam === 'atk' ? 'def' : 'atk';
  const icons = (team) => G.actors.filter((a) => a.team === team).sort((p, q) => (p.id < q.id ? -1 : 1)).map((a) => `<i class="ag ${a.alive ? '' : 'dead'}" style="--c:${AGENTS[a.agent].color}" title="${esc(a.name)}">${esc(AGENTS[a.agent].name[0])}</i>`).join('');
  const C = G.core;
  const center = G.phase === 'planted' ? `<b class="core">◆ ${Math.ceil(C.t)}</b>` : G.phase === 'buy' ? `<b>${fmtT(G.timer)}</b><small>구매</small>` : G.phase === 'end' ? `<b>${fmtT(G.timer)}</b>` : `<b>${fmtT(G.timer)}</b>`;
  set('#top', `<div class="side me"><div class="icons">${icons(myTeam)}</div><b class="sc" style="color:${TEAM[myTeam].color}">${G.score[myGrp]}</b></div>
    <div class="clock">${center}<small>라운드 ${G.round}</small></div>
    <div class="side op"><b class="sc" style="color:${TEAM[oppTeam].color}">${G.score[oppGrp]}</b><div class="icons">${icons(oppTeam)}</div></div>`);
  // 아래: 체력 · 방어구
  set('#hp', `<div class="hpv"><b>${Math.max(0, Math.ceil(pov.hp))}</b><small>체력</small></div><div class="hpv ar"><b>${pov.armor}</b><small>방어구</small></div><div class="hpbar"><i style="width:${Math.max(0, pov.hp)}%"></i></div>`);
  // 무기 · 탄
  const g = pov.gun, W = WEAPONS[g.id];
  set('#ammo', `<small>${esc(W.kind)} · ${esc(W.name)}</small><div><b>${g.mag}</b><span>/ ${g.res}</span></div>${pov.reloadT > 0 ? '<em>장전 중…</em>' : g.mag === 0 ? '<em class="warn">R 장전</em>' : ''}<div class="cr">◈ ${pov.credits.toLocaleString()}</div>`);
  // 기술
  const A = AGENTS[pov.agent];
  set('#abil', ['q', 'e'].map((k) => `<div class="ab ${pov.abil[k] ? '' : 'off'}"><span class="key">${k.toUpperCase()}</span><i>${A[k].icon}</i><small>${esc(A[k].name)}</small><b>${'●'.repeat(pov.abil[k])}${'○'.repeat(Math.max(0, A[k].max - pov.abil[k]))}</b></div>`).join('') + `<div class="agname" style="color:${A.color}">${esc(A.name)} <small>${esc(A.role)}</small></div>`);
  // 킬 로그
  set('#feed', G.feed.slice(-6).map((k) => `<div><b style="color:${TEAM[k.byTeam]?.color || '#ccc'}">${esc(k.by)}</b><span>${esc(k.w)}${k.hs ? ' 🎯' : ''}</span><b style="color:${TEAM[k.toTeam]?.color || '#ccc'}">${esc(k.to)}</b></div>`).join(''));
  // 메시지
  const m = G.msg;
  set('#msg', m ? `<b>${esc(m.big)}</b><small>${esc(m.small || '')}</small>` : '');
  $('#msg').style.opacity = m ? Math.min(1, m.t * 2) : 0;
  // 설치 · 해체 진행
  const prog = me.useProg || 0;
  const tot = me.team === 'atk' ? RULES.plantHold : RULES.defuseHold;
  $('#prog').style.display = prog > 0 ? 'block' : 'none';
  if (prog > 0) set('#prog', `<small>${me.team === 'atk' ? '코어 설치 중' : '코어 해체 중'}</small><div><i style="width:${Math.min(100, prog / tot * 100)}%"></i></div>`);
  // 코어 들고 있음 · 힌트
  let hint = '';
  if (me.alive) {
    if (G.phase === 'buy') hint = 'B: 상점 · 시작 전에 무기를 사세요';
    else if (me.carry) hint = '◆ 코어를 들고 있어요 — 사이트에서 F 길게';
    else if (me.team === 'def' && C.state === 'planted' && Math.hypot(me.x - C.x, me.z - C.z) < 1.8) hint = 'F 길게: 코어 해체 (7초)';
  } else hint = G.specOf ? `관전 중: ${esc(G.specOf.name)} · 클릭으로 바꾸기` : '다음 라운드를 기다려요';
  set('#hint', hint);
  // 맞음 표시 · 피격 방향 · 섬광 · 조준경
  const hm = G.hitMark;
  const xh = $('#xhair');
  xh.className = (hm && hm.t > 0 ? 'hit' + (hm.head ? ' head' : '') + (hm.kill ? ' kill' : '') : '') + (G.scoped ? ' scoped' : '');
  if (hm) { hm.t -= 1 / 60; if (hm.t <= 0) G.hitMark = null; }
  // 탄퍼짐에 맞춰 십자선 벌어짐
  const spr = me.alive ? G.spreadOf(me) : 0;
  xh.style.setProperty('--gap', `${4 + Math.min(40, spr * 600)}px`);
  const fl = $('#flash'); fl.style.opacity = Math.min(1, pov.flashT * 0.9);
  $('#scope').style.display = G.scoped && me.alive ? 'block' : 'none';
  const hd = $('#hurt');
  if (G.hurtT > 0) { G.hurtT -= 1 / 60; hd.style.opacity = Math.min(1, G.hurtT * 1.5); if (G.hurtDir !== null) hd.style.transform = `translate(-50%,-50%) rotate(${-(G.hurtDir - me.yaw)}rad)`; } else hd.style.opacity = 0;
  $('#vign').style.opacity = me.alive && me.hp < 35 ? 0.6 - me.hp / 70 : 0;
  // 끝
  if (G.over && !$('#over').dataset.shown) showOver(G);
}
function showOver(G) {
  const o = $('#over'); o.dataset.shown = '1';
  o.classList.remove('hidden');
  o.innerHTML = `<div class="card"><h1 class="${G.over.win ? 'win' : 'lose'}">${G.over.win ? '승리!' : '패배'}</h1><p>${G.score[G.me.grp]} : ${G.score[G.me.grp === 'red' ? 'blue' : 'red']}</p>${scoreTable(G)}<div class="row"><button id="again" class="primary">다시 하기</button><button id="tomenu">메인 메뉴</button></div></div>`;
}
export function scoreTable(G) {
  const rows = (grp) => G.actors.filter((a) => a.grp === grp).sort((p, q) => q.kills - p.kills).map((a) => `<tr class="${a === G.me ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td><i class="ag" style="--c:${AGENTS[a.agent].color}">${esc(AGENTS[a.agent].name[0])}</i> ${esc(a.name)}</td><td>${a.kills}</td><td>${a.deaths}</td><td>◈ ${a.team === G.me.team ? a.credits.toLocaleString() : '—'}</td></tr>`).join('');
  return `<table class="sb"><tr><th>${TEAM[G.me.team].name} (우리)</th><th>처치</th><th>죽음</th><th>크레딧</th></tr>${rows(G.me.grp)}
  <tr><th>${TEAM[G.me.team === 'atk' ? 'def' : 'atk'].name} (상대)</th><th></th><th></th><th></th></tr>${rows(G.me.grp === 'red' ? 'blue' : 'red')}</table>`;
}
export function showBoard(G, on) { const b = $('#board'); b.classList.toggle('hidden', !on); if (on) b.innerHTML = `<div class="card">${scoreTable(G)}</div>`; }

// 상점
export function renderShop(G, onBuy) {
  const me = G.me, A = AGENTS[me.agent];
  const el = $('#shop');
  el.innerHTML = `<div class="card shop"><div class="shop-h"><h2>상점</h2><b class="cr">◈ ${me.credits.toLocaleString()}</b><small>구매 시간 ${Math.ceil(G.timer)}초 · B 또는 Esc 로 닫기</small></div>
  <div class="shop-grid">${SHOP.map(([cat, ids]) => `<div class="col"><h3>${cat}</h3>${ids.map((id) => { const W = WEAPONS[id], own = me.guns[W.slot]?.id === id; return `<button data-b="w:${id}" class="${own ? 'own' : ''} ${me.credits < W.price && !own ? 'poor' : ''}"><b>${W.name}</b><small>${W.kind} · 머리 ${W.dmg[0]} / 몸 ${W.dmg[1]}</small><span>◈ ${W.price}</span></button>`; }).join('')}</div>`).join('')}
  <div class="col"><h3>방어구</h3>${Object.entries(ARMOR).map(([k, v]) => `<button data-b="a:${k}" class="${me.armor >= v.ap ? 'own' : ''}"><b>${v.name}</b><small>피해 흡수 ${v.ap}</small><span>◈ ${v.price}</span></button>`).join('')}
  <h3>기술 — ${A.name}</h3>${['q', 'e'].map((k) => `<button data-b="s:${k}" class="${me.abil[k] >= A[k].max ? 'own' : ''}"><b>${A[k].icon} ${A[k].name} <em>${me.abil[k]}/${A[k].max}</em></b><small>${A[k].desc}</small><span>◈ ${A[k].price}</span></button>`).join('')}</div></div>
  <p class="tip" id="shop-msg"></p></div>`;
  el.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => { const err = onBuy(b.dataset.b); if (err) $('#shop-msg').textContent = err; else renderShop(G, onBuy); });
}
export { esc };
