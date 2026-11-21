// ===================== 버스 운영 관리자 모드 =====================
// 운영 자금 · 노선(배차/요금/차종/회사) · 버스회사 설립 · 차량(구매/정비/배차) · 실시간 관제 · 정산
import { S, save } from './state.js';
import { W, registerRoute, linksFromPts, nodeAt } from './world.js';
import { BUS_TYPES, COMPANY_INFO, REGION_COMPANIES, OLD_CO, BY_ID, BUSES, DONG, ROUTES, LIVERIES, dongAt } from './data.js';
import { registerScreen, show, modal } from './ui.js';
import { drawCityMap, mapView } from './mapdraw.js';
import { randomPlate } from './models.js';
import { SUBWAY, applyMetroCfg, lineKey, trainsNow } from './subway.js';
import { won, clamp } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEFAULT_FLEET = { express: 4, trunk: 6, branch: 4, village: 2, seat: 3 };
const capOf = (spec) => (spec.style === 'country' ? 30 : spec.low ? 62 : 52);
let app = null;

// ---------- 상태 ----------
export function ensureAdmin() {
  if (!S.admin || typeof S.admin !== 'object') S.admin = {};
  const A = S.admin;
  A.v = 1;
  if (A.mapv !== 2) { A.mapv = 2; A.custom = []; A.routes = {}; A.fleet = []; A.seeded = false; }
  if (typeof A.cash !== 'number') A.cash = 3000000000;
  if (!A.day) A.day = 1;
  if (!Array.isArray(A.companies)) A.companies = COMPANY_INFO.map((c) => ({ ...c }));
  if (!A.wiped) for (const c of COMPANY_INFO) if (!A.companies.find((x) => x.id === c.id)) A.companies.push({ ...c });
  if (S.infMoney) { A.cash = Math.max(A.cash, 1e15); }
  if (!A.routes || typeof A.routes !== 'object') A.routes = {};
  if (!Array.isArray(A.custom)) A.custom = [];
  if (!Array.isArray(A.fleet)) A.fleet = [];
  if (!Array.isArray(A.history)) A.history = [];
  if (!Array.isArray(A.log)) A.log = [];
  if (!A.today) A.today = { rev: 0, cost: 0, sub: 0, pax: 0, comp: 0 };
  if (!A.subsidy && A.subsidy !== 0) A.subsidy = 0.6;
  if (!A.wage) A.wage = 32000;
  if (!A.metro || !Array.isArray(A.metro.lines)) A.metro = { lines: null };
  if (!A.metroCfg || typeof A.metroCfg !== 'object') A.metroCfg = {};
  applyMetroCfg(A.metroCfg);
  ensureDrivers();
  migrateCompanies(A);
  return A;
}
// 실제 광주 운수사 10곳으로 다시 채우기 (예전 가상 회사·전부 지운 상태 → 실제 회사, 내가 세운 회사는 그대로)
function migrateCompanies(A) {
  for (const c of REGION_COMPANIES) if (!A.companies.some((x) => x.id === c.id)) A.companies.push({ ...c });
  if (A.cov === 2) return;
  A.cov = 2;
  const mine = A.companies.filter((c) => c.custom);
  A.companies = [...COMPANY_INFO.map((c) => ({ ...c })), ...mine];
  const ok = (id) => A.companies.some((c) => c.id === id);
  const fix = (id) => (id && OLD_CO[id]) || (ok(id) ? id : null);
  const byRoute = Object.fromEntries(ROUTES.map((r) => [r.id, r.company]));
  for (const id in A.routes) {
    const c = A.routes[id];
    c.company = fix(c.company) || byRoute[id] || COMPANY_INFO[0].id;
    c.active = true;
  }
  for (const v of A.fleet) v.company = fix(v.company) || (v.route && A.routes[v.route] ? A.routes[v.route].company : COMPANY_INFO[0].id);
  for (const d of A.drivers || []) if (d.company) d.company = fix(d.company) || COMPANY_INFO[0].id;
  // 버스가 하나도 없는 노선(전부 지웠던 경우)은 기본 대수만큼 다시 배치
  for (const id in A.routes) {
    if (A.fleet.some((v) => v.route === id)) continue;
    const R = ROUTES.find((r) => r.id === id) || (A.custom || []).find((r) => r.id === id);
    const T = BUS_TYPES[R ? R.type : 'trunk'] || BUS_TYPES.trunk, n = DEFAULT_FLEET[R ? R.type : 'trunk'] || 3;
    for (let i = 0; i < n; i++) addVehicle(A.routes[id].model || T.models[i % T.models.length], A.routes[id].company, id, true);
  }
  A.wiped = false;
  if (!A.myCo && mine.length) A.myCo = mine[0].id;
  log('🚌 광주 시내버스 실제 운수사 10곳(대창운수 · 라정버스 · 삼아교통 · 현대교통 · 세영운수 · 을로운수 · 천일버스 · 동화운수 · 대원버스 · 대진운수)으로 다시 채웠어요' + (mine.length ? ' · 내가 세운 회사는 그대로예요' : ''), 'good');
}
// 월드가 만들어진 뒤: 노선 설정 · 차량 기본 배치
export function syncAdminWithWorld() {
  const A = ensureAdmin();
  for (const R of W.routes) {
    if (!A.routes[R.id]) {
      const T = BUS_TYPES[R.type] || BUS_TYPES.trunk;
      const wiped = A.wiped || !A.companies.length;
      A.routes[R.id] = { company: wiped ? null : R.company || COMPANY_INFO[0].id, fare: T.fare, model: T.models[0], active: !wiped, pax: 0, sat: 80, ontime: 92, comp: 0, rev: 0, cost: 0 };
      if (!wiped) { const n = DEFAULT_FLEET[R.type] || 3; for (let i = 0; i < n; i++) addVehicle(T.models[i % T.models.length], A.routes[R.id].company, R.id, true); }
    }
  }
  // 처음 시작할 때: 지난 3일 운행 기록을 미리 만들어 둠
  if (!A.seeded) {
    A.seeded = true;
    for (let d = 0; d < 3; d++) for (let h = 5; h <= 28; h++) { hourStep(h % 24); if (h % 24 === 4) rollDay(); }
    const nowH = Math.floor(S.world.hour || 13);
    for (let h = 5; h <= nowH; h++) hourStep(h);
    A.log = A.log.filter((l) => l.msg.startsWith('📊'));
    log('👋 관리자 취임! 노선·차량·요금을 조정해서 시민 만족도와 수지를 함께 챙겨 보세요', 'good');
    A.lastHour = nowH;
  }
  // 회사 없어진 노선 정리
  for (const id in A.routes) if (A.routes[id].company && !A.companies.find((c) => c.id === A.routes[id].company)) { A.routes[id].company = A.companies[0]?.id || null; if (!A.routes[id].company) A.routes[id].active = false; }
}
function addVehicle(model, company, route, init) {
  const A = S.admin;
  const v = { no: randomPlate('bus'), model, company, route: route || null, km: init ? Math.round(20000 + Math.random() * 260000) : 0, cond: init ? Math.round(55 + Math.random() * 45) : 100, year: init ? 2017 + Math.floor(Math.random() * 9) : 2026, id: (A.nextVid = (A.nextVid || 0) + 1) };
  A.fleet.push(v);
  if (init && route) { const d = makeDriver(company); d.vid = v.id; d.wage = Math.max(d.wage, A.wage || 32000); drv().push(d); }
  return v;
}
const NO_CO = { id: null, name: '운영사 없음', color: '#666b70', depot: '-', founded: '-' };
export const companyById = (id) => (id ? (S.admin?.companies || COMPANY_INFO).find((c) => c.id === id) : null) || (S.admin?.wiped || !id ? NO_CO : COMPANY_INFO[0]);
export const routeCfg = (R) => S.admin?.routes?.[R.id];
export const fleetOf = (rid) => (S.admin?.fleet || []).filter((v) => v.route === rid);
export function companyNameOf(R) { const c = routeCfg(R); return companyById(c ? c.company : R.company).name; }
export function routeModelOf(R) { const c = routeCfg(R); return c ? c.model : (BUS_TYPES[R.type] || BUS_TYPES.trunk).models[0]; }
export function routeWeightOf(R) { const c = routeCfg(R); if (!c) return 1; return c.active ? routeStats(R).n : 0; }
export function routeLiveryOf(R) { const c = routeCfg(R); const co = c && companyById(c.company); return co && co.livery ? co.livery : null; }
export const customRoutesForWorld = () => (ensureAdmin().custom || []).map((r) => ({ ...r }));
function log(msg, kind = 'info') {
  const A = S.admin;
  A.log.unshift({ d: A.day, h: Math.floor(S.world.hour || 12), msg, kind });
  A.log = A.log.slice(0, 80);
}

// ---------- 노선 운행 지표 ----------
export function routeStats(R) {
  const c = routeCfg(R) || {};
  const buses = fleetOf(R.id).filter(runnable);
  const n = c.active === false ? 0 : buses.length;
  const T = BUS_TYPES[R.type] || BUS_TYPES.trunk;
  const len = (R.len || 4000) / 1000;
  const cycle = (len / (T.stopEvery > 1 ? 24 : 18)) * 60 + R.stops.length * 0.45; // 분
  const headway = n ? cycle / n : Infinity;
  const spec = BY_ID[c.model] || BY_ID[T.models[0]];
  return { n, cycle, headway, cap: capOf(spec), spec, T, cond: buses.length ? buses.reduce((a, v) => a + v.cond, 0) / buses.length : 0 };
}
const demandAt = (h) => (h < 5 ? 0.04 : h < 6 ? 0.3 : h < 7 ? 0.7 : h < 9 ? 1.6 : h < 12 ? 0.9 : h < 14 ? 1.0 : h < 17 ? 0.9 : h < 19.5 ? 1.5 : h < 22 ? 0.8 : 0.35);

// 게임 시간 1시간마다 정산
export function adminTick(hour) {
  const A = ensureAdmin();
  const hNow = Math.floor(hour);
  if (A.lastHour === undefined || A.lastHour === null) { A.lastHour = hNow; return; }
  if (hNow === A.lastHour) return;
  let steps = (hNow - A.lastHour + 24) % 24;
  if (steps > 6) steps = 1;
  for (let k = 0; k < steps; k++) { const h = (A.lastHour + 1 + k) % 24; hourStep(h); if (h === 4) rollDay(); }
  A.lastHour = hNow;
}
function hourStep(h) {
  const A = S.admin;
  const dm = demandAt(h);
  for (const R of W.routes) {
    const c = routeCfg(R); if (!c) continue;
    const st = routeStats(R);
    const T = st.T;
    const first = c.first ?? 5, last = c.last ?? 24;
    const inService = c.active !== false && (h >= first && h < last);
    const adj = driverHour(R, c, h, inService && st.n > 0);
    if (!inService) continue;
    const typeK = { express: 1.5, trunk: 1.25, branch: 0.85, village: 0.5, seat: 0.9 }[R.type] || 1;
    const base = R.stops.length * 15 * typeK * dm;
    const hw = st.headway;
    const fH = st.n ? clamp(1.45 - hw / 28, 0.25, 1.35) : 0;
    const fFare = Math.pow(T.fare / Math.max(300, c.fare), 0.7);
    const capH = st.n ? (60 / st.cycle) * st.n * st.cap * 2.2 : 0;
    let pax = Math.round(Math.min(base * fH * fFare * (0.9 + Math.random() * 0.2), capH));
    const crowd = capH ? pax / capH : 1;
    const rev = pax * c.fare * 0.86;
    const busHours = st.n * (h < 5 ? 0.15 : 1);
    const energy = st.spec.ev ? 9000 : st.spec.cng ? 14000 : 17000;
    const team = fleetOf(R.id).map(driverOfVehicle).filter(Boolean);
    const wage = team.length ? team.reduce((a, d) => a + d.wage, 0) / team.length : A.wage;
    const cost = busHours * (wage + energy + 6000);
    c.pax = Math.round((c.pax || 0) * 0.6 + pax * 0.4 * (1 / Math.max(0.05, dm)));
    const target = { express: 5, trunk: 4, branch: 6, village: 10, seat: 12 }[R.type] || 6;
    const satNow = 93 - Math.max(0, hw - target) * 4 - Math.max(0, crowd - 0.7) * 90 - Math.max(0, 85 - st.cond) * 0.45 - (c.fare / T.fare - 1) * 45 - (st.spec.low ? 0 : 4) - Math.random() * 6 + adj.sat;
    c.sat = Math.round(clamp((c.sat || 80) * 0.8 + 0.2 * satNow, 5, 100));
    c.ontime = Math.round(clamp((c.ontime || 92) * 0.85 + 0.15 * (97 - (dm > 1.3 ? 9 : 2) - Math.max(0, 60 - st.cond) * 0.4 - Math.random() * 5 + adj.ontime), 40, 100));
    let comp = 0;
    if (dm > 0.5 && (hw > 18 || crowd > 1)) comp = Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : 0;
    c.comp = (c.comp || 0) + comp;
    c.rev = (c.rev || 0) + rev; c.cost = (c.cost || 0) + cost;
    A.today.rev += rev; A.today.cost += cost; A.today.pax += pax; A.today.comp += comp;
    // 차량 마모 · 고장
    for (const v of fleetOf(R.id)) {
      if (c.active === false) continue;
      const km = (R.len / 1000) * (60 / st.cycle) * (h < 5 ? 0.1 : 1);
      v.km += Math.round(km); v.cond = Math.max(0, v.cond - km * 0.012 - Math.random() * 0.05);
      if (v.cond < 25 && Math.random() < 0.02) { v.cond = 10; log(`🔧 ${v.no} (${R.id}번) 고장으로 운행 중단 — 정비가 필요해요`, 'bad'); }
    }
    if (comp >= 3) log(`📞 ${R.id}번 배차간격 민원 ${comp}건 (현재 ${hw === Infinity ? '운행 없음' : Math.round(hw) + '분'})`, 'warn');
  }
  // 운영 자금 반영 (시간당)
  const net = A.today.rev - A.today.cost;
  void net;
}
function rollDay() {
  const A = S.admin;
  const t = A.today;
  const deficit = Math.max(0, t.cost - t.rev);
  t.sub = deficit * A.subsidy;
  const net = t.rev + t.sub - t.cost;
  A.cash += net;
  A.history.push({ day: A.day, rev: Math.round(t.rev), cost: Math.round(t.cost), sub: Math.round(t.sub), pax: t.pax, comp: t.comp });
  A.history = A.history.slice(-14);
  log(`📊 ${A.day}일차 정산: 수입 ${won(t.rev)} · 재정지원 ${won(t.sub)} · 비용 ${won(t.cost)} → ${net >= 0 ? '흑자' : '적자'} ${won(net)}`, net >= 0 ? 'good' : 'bad');
  driverDay();
  A.day++;
  A.today = { rev: 0, cost: 0, sub: 0, pax: 0, comp: 0 };
  for (const id in A.routes) { const c = A.routes[id]; c.rev = 0; c.cost = 0; c.comp = 0; }
  // 무작위 이벤트
  const r = Math.random();
  const R = W.routes[Math.floor(Math.random() * W.routes.length)];
  if (r < 0.25) log(`🎉 ${R.stops[0]?.name || ''} 근처 행사로 ${R.id}번 승객이 늘 것 같아요`, 'good');
  else if (r < 0.4) log(`🚧 ${R.links[0]?.edge.name || '도로'} 공사로 ${R.id}번 정시율이 떨어질 수 있어요`, 'warn');
  save();
}

// ---------- 공통 ----------
const TABS = [['dash', '📊 대시보드'], ['routes', '🚏 노선 관리'], ['companies', '🏢 버스회사'], ['drivers', '👷 기사 관리'], ['fleet', '🚌 차량 관리'], ['live', '🛰️ 실시간 관제'], ['editor', '✏️ 노선 만들기'], ['metro', '🚇 지하철 노선']];
let drvFilter = 'all', drvSort = 'company', metroEd = null;
let tab = 'dash', routeCity = 'all', metroCity = 'gwangju', routeFilter = 'all', routeQ = '', fleetFilter = 'all', liveSel = null, liveView = null, editor = null, fleetPage = 0;
const typeChip = (t) => { const T = BUS_TYPES[t] || BUS_TYPES.trunk; return `<span class="tchip" style="background:${T.color}">${T.ko}</span>`; };
const coChip = (id) => { const c = companyById(id); return `<span class="cchip"><i style="background:${c.color}"></i>${esc(c.name)}</span>`; };
function hwText(h) { return h === Infinity ? '<span class="bad">운행 없음</span>' : `${Math.round(h)}분`; }

export function initAdmin(a) {
  app = a;
  registerScreen('admin', renderAdmin);
}
function renderAdmin() {
  const A = ensureAdmin();
  $('#ad-cash').textContent = won(A.cash);
  $$('.money-now').forEach((e) => (e.textContent = won(S.money)));
  $('#ad-day').textContent = `${A.day}일차 · ${String(Math.floor(S.world.hour)).padStart(2, '0')}시`;
  $('#ad-tabs').innerHTML = TABS.map(([k, n]) => `<button class="${tab === k ? 'sel' : ''}" data-tab="${k}">${n}</button>`).join('');
  $$('#ad-tabs [data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderAdmin(); });
  const body = $('#ad-body');
  cancelAnimationFrame(liveRaf);
  ({ dash, routes: routesTab, companies: companiesTab, drivers: driversTab, fleet: fleetTab, live: liveTab, editor: editorTab, metro: metroTab })[tab](body, A);
}
export function openAdmin(t) { if (t) tab = t; show('admin'); }

// ---------- 대시보드 ----------
function dash(body, A) {
  const tot = W.routes.length, act = W.routes.filter((R) => routeStats(R).n > 0).length;
  const fleet = A.fleet.length, running = A.fleet.filter((v) => v.route && v.cond > 15).length;
  const sats = W.routes.map((R) => routeCfg(R)?.sat || 0), ons = W.routes.map((R) => routeCfg(R)?.ontime || 0);
  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
  const t = A.today;
  const kpi = [
    ['💰', '운영 자금', won(A.cash), A.cash < 0 ? 'bad' : ''],
    ['💵', '오늘 운송수입', won(t.rev), ''],
    ['👥', '오늘 승객', t.pax.toLocaleString() + '명', ''],
    ['🚌', '운행 버스', `${running} / ${fleet}대`, ''],
    ['🚏', '운행 노선', `${act} / ${tot}개`, ''],
    ['😊', '평균 만족도', avg(sats) + '점', avg(sats) < 60 ? 'bad' : avg(sats) > 80 ? 'good' : ''],
    ['⏱️', '평균 정시율', avg(ons) + '%', ''],
    ['📞', '오늘 민원', t.comp + '건', t.comp > 20 ? 'bad' : ''],
  ];
  const byType = Object.keys(BUS_TYPES).map((k) => { const rs = W.routes.filter((R) => R.type === k); return { k, n: rs.length, bus: rs.reduce((a, R) => a + routeStats(R).n, 0), pax: rs.reduce((a, R) => a + (routeCfg(R)?.pax || 0), 0) }; });
  const top = [...W.routes].sort((a, b) => (routeCfg(b)?.pax || 0) - (routeCfg(a)?.pax || 0)).slice(0, 6);
  body.innerHTML = `<div class="kpis">${kpi.map(([i, n, v, c]) => `<div class="kpi ${c}"><i>${i}</i><small>${n}</small><b>${v}</b></div>`).join('')}</div>
    <div class="ad-cols">
      <div class="card"><h3>최근 14일 수입 · 비용</h3><canvas id="ad-chart" width="640" height="240"></canvas><div class="legend"><span><i style="background:#36d1c4"></i>운송수입</span><span><i style="background:#8a5cc6"></i>재정지원</span><span><i style="background:#ff6b5a"></i>운영비용</span></div></div>
      <div class="card"><h3>유형별 운행 현황</h3><table class="tbl"><tr><th>유형</th><th>노선</th><th>버스</th><th>시간당 승객</th></tr>${byType.map((x) => `<tr><td>${typeChip(x.k)}</td><td>${x.n}</td><td>${x.bus}대</td><td>${x.pax.toLocaleString()}명</td></tr>`).join('')}</table>
      <h3 style="margin-top:14px">승객 많은 노선</h3><table class="tbl">${top.map((R) => `<tr><td><span class="rno sm" style="background:${R.color}">${esc(R.id)}</span></td><td>${esc(R.dest)}</td><td>${(routeCfg(R)?.pax || 0).toLocaleString()}명/시</td></tr>`).join('')}</table></div>
    </div>
    <div class="card"><h3>운영 일지</h3><div class="ad-log">${A.log.length ? A.log.slice(0, 18).map((l) => `<div class="${l.kind}"><small>${l.d}일 ${l.h}시</small>${esc(l.msg)}</div>`).join('') : '<p class="muted">아직 기록이 없어요. 게임 속 시간이 흐르면(운전 중) 1시간마다 정산되고, 새벽 4시에 하루 결산을 해요.</p>'}</div>
      <div class="row"><label>재정지원 비율 <select id="ad-sub">${[0, 0.3, 0.5, 0.6, 0.8].map((v) => `<option value="${v}" ${A.subsidy === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
      <label>기사 시급(버스 1대·1시간) <select id="ad-wage">${[26000, 32000, 38000, 45000].map((v) => `<option value="${v}" ${A.wage === v ? 'selected' : ''}>${won(v)}</option>`).join('')}</select></label>
      <button id="ad-wd">💸 운영 자금 1억 → 내 지갑</button><button id="ad-dep">🏦 내 지갑 1억 → 운영 자금</button></div>
      <div class="row"><b style="margin-right:6px">👑 관리자 권한</b><button id="ad-give">💰 돈 지급</button><label class="switch-l"><input type="checkbox" id="ad-inf" ${S.infMoney ? 'checked' : ''}> 돈 무제한 (운영 자금·내 지갑)</label><button id="ad-wipe" class="danger">🧹 버스회사 전부 지우고 처음부터</button></div></div>`;
  drawFinance($('#ad-chart'), A.history.length ? A.history : [{ day: A.day, rev: t.rev, cost: t.cost, sub: 0 }]);
  $('#ad-sub').onchange = (e) => { A.subsidy = Number(e.target.value); save(); };
  $('#ad-wage').onchange = (e) => { A.wage = Number(e.target.value); log(`👷 기사 처우 변경: 시간당 ${won(A.wage)}`); save(); };
  $('#ad-give').onclick = async () => {
    const v = await formModal(`<h3>💰 관리자 돈 지급</h3><div class="form"><label>어디에? <select id="gv-to"><option value="cash">운영 자금</option><option value="wallet">내 지갑</option><option value="both">둘 다</option></select></label>
      <label>금액 <select id="gv-amt">${[1e8, 1e9, 1e10, 1e11, 1e12].map((n) => `<option value="${n}">${won(n)}</option>`).join('')}</select></label></div>`, '지급');
    if (!v) return;
    const n = Number(v['gv-amt']);
    if (v['gv-to'] !== 'wallet') A.cash += n;
    if (v['gv-to'] !== 'cash') S.money += n;
    log(`👑 관리자 지급 ${won(n)} (${{ cash: '운영 자금', wallet: '내 지갑', both: '운영 자금·내 지갑' }[v['gv-to']]})`, 'good'); save(); renderAdmin();
  };
  $('#ad-inf').onchange = (e) => { S.infMoney = e.target.checked; if (S.infMoney) { A.cash = Math.max(A.cash, 1e15); S.money = Math.max(S.money, 1e15); } log(S.infMoney ? '👑 돈 무제한 켜짐' : '돈 무제한 꺼짐'); save(); renderAdmin(); };
  $('#ad-wipe').onclick = async () => {
    if ((await modal('<h3>🧹 버스회사 전부 지우기</h3><p>모든 버스회사·버스·기사가 사라지고, 모든 노선은 <b>운행 중지(운영사 없음)</b> 상태가 돼요.<br>새 회사를 세우고 노선을 맡기면서 처음부터 시작해요. 되돌릴 수 없어요.</p>', [{ label: '취소' }, { label: '전부 지우기', primary: true }])) !== 1) return;
    A.companies = []; A.fleet = []; if (Array.isArray(A.drivers)) A.drivers = [];
    for (const id in A.routes) { A.routes[id].company = null; A.routes[id].active = false; }
    A.wiped = true;
    log('🧹 모든 버스회사를 지우고 새로 시작해요. 버스회사 탭에서 회사를 세워 보세요', 'warn'); save(); renderAdmin();
  };
  $('#ad-wd').onclick = () => { if (A.cash < 1e8) return modal('<p>운영 자금이 부족해요.</p>'); A.cash -= 1e8; S.money += 1e8; save(); renderAdmin(); };
  $('#ad-dep').onclick = () => { if (S.money < 1e8) return modal('<p>내 지갑에 1억이 없어요.</p>'); S.money -= 1e8; A.cash += 1e8; save(); renderAdmin(); };
}
function drawFinance(cv, hist) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  const max = Math.max(1, ...hist.map((d) => Math.max(d.rev + d.sub, d.cost)));
  const pad = 36, bw = (w - pad - 10) / 14;
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.fillStyle = '#8fa3b1'; g.font = '11px "Noto Sans KR"'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const y = h - 24 - ((h - 40) * i) / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(w, y); g.stroke(); g.fillText((max * i / 4 / 1e8).toFixed(1) + '억', pad - 4, y + 4); }
  hist.forEach((d, i) => {
    const x = pad + 6 + i * bw, H = h - 40;
    const r = (d.rev / max) * H, s = (d.sub / max) * H, c = (d.cost / max) * H;
    g.fillStyle = '#36d1c4'; g.fillRect(x, h - 24 - r, bw * 0.38, r);
    g.fillStyle = '#8a5cc6'; g.fillRect(x, h - 24 - r - s, bw * 0.38, s);
    g.fillStyle = '#ff6b5a'; g.fillRect(x + bw * 0.42, h - 24 - c, bw * 0.38, c);
    g.fillStyle = '#8fa3b1'; g.textAlign = 'center'; g.fillText(d.day + '일', x + bw * 0.4, h - 8);
  });
}

// ---------- 노선 관리 ----------
function routesTab(body, A) {
  const types = [['all', '전체'], ...Object.entries(BUS_TYPES).map(([k, v]) => [k, v.ko])];
  const cityOf = (R) => R.region || 'gwangju';
  const cities = [['all', '전체 도시'], ['gwangju', '광주'], ...[...new Set([...W.routes, ...(W.pendingRoutes || [])].map((R) => R.region).filter(Boolean))].map((id) => [id, ([...W.routes, ...(W.pendingRoutes || [])].find((R) => R.region === id) || {}).regionName || id])];
  const okR = (R) => (routeCity === 'all' || cityOf(R) === routeCity) && (routeFilter === 'all' || R.type === routeFilter) && (!routeQ || (R.id + R.name + R.dest + companyNameOf(R)).includes(routeQ));
  const list = W.routes.filter(okR);
  const pend = (W.pendingRoutes || []).filter((R) => !W.routes.some((x) => x.id === R.id) && okR(R));
  const pendRegions = [...new Set(pend.map((R) => R.region))];
  body.innerHTML = `<div class="ad-toolbar"><div class="tabs">${cities.map(([k, n]) => `<button class="${routeCity === k ? 'sel' : ''}" data-city="${k}">${n}</button>`).join('')}</div></div>
  <div class="ad-toolbar"><div class="tabs">${types.map(([k, n]) => `<button class="${routeFilter === k ? 'sel' : ''}" data-f="${k}">${n}</button>`).join('')}</div><input id="ad-rq" placeholder="노선 번호·이름·회사 검색" value="${esc(routeQ)}"><button id="ad-newr" class="primary">＋ 새 노선 만들기</button></div>
  ${pendRegions.map((id) => `<div class="tip">🗺️ <b>${esc(pend.find((R) => R.region === id).regionName)}</b> 노선 ${pend.filter((R) => R.region === id).length}개는 아직 지도를 받지 않았어요. <button data-loadreg="${id}" class="primary sm">지도 받고 관리하기</button> <small class="muted">${pend.filter((R) => R.region === id).map((R) => esc(R.id)).join(' · ')}</small></div>`).join('')}
  <div class="tbl-wrap"><table class="tbl big"><tr><th>노선</th><th>유형</th><th>운행 구간</th><th>운수사</th><th>차종</th><th>배차 대수</th><th>배차간격</th><th>요금</th><th>승객/시</th><th>만족도</th><th>정시율</th><th>운행</th><th>설정</th></tr>
  ${list.map((R) => {
    const c = routeCfg(R), st = routeStats(R), T = st.T;
    return `<tr data-r="${esc(R.id)}"><td><span class="rno sm" style="background:${R.color}">${esc(R.id)}</span></td><td>${typeChip(R.type)}</td><td class="wrap"><b>${esc(R.dest)}</b><small>정류장 ${R.stops.length}곳 · ${(R.len / 1000).toFixed(1)}km · 1회 ${Math.round(st.cycle)}분</small></td>
    <td><select data-k="company">${c.company ? '' : '<option value="" selected>운영사 없음</option>'}${A.companies.map((co) => `<option value="${co.id}" ${c.company === co.id ? 'selected' : ''}>${esc(co.name)}</option>`).join('')}</select></td>
    <td><select data-k="model">${[...new Set([...T.models, ...BUSES.map((b) => b.id)])].map((m) => `<option value="${m}" ${c.model === m ? 'selected' : ''}>${BY_ID[m].name}${T.models.includes(m) ? '' : ' (비추천)'}</option>`).join('')}</select></td>
    <td><div class="stepper"><button data-a="minus">−</button><b>${fleetOf(R.id).length}</b><button data-a="plus">＋</button></div></td>
    <td>${hwText(st.headway)}${c.target ? `<small class="muted"> / 목표 ${c.target}분</small>` : ''}<small class="muted" style="display:block">${String(c.first ?? 5).padStart(2, '0')}~${String(c.last ?? 24).padStart(2, '0')}시 · 기사 ${teamOf(R).length}/${fleetOf(R.id).length}</small></td>
    <td><select data-k="fare">${[800, 1000, 1250, 1500, 1800, 2000, 2500].map((f) => `<option value="${f}" ${c.fare === f ? 'selected' : ''}>${f.toLocaleString()}원</option>`).join('')}</select></td>
    <td>${(c.pax || 0).toLocaleString()}</td><td><div class="meter"><i style="width:${c.sat || 0}%;background:${c.sat < 50 ? '#ff4d3d' : c.sat < 75 ? '#ffb21a' : '#2ee06a'}"></i></div>${c.sat || 0}</td><td>${c.ontime || 0}%</td>
    <td><label class="switch"><input type="checkbox" data-k="active" ${c.active !== false ? 'checked' : ''}><i></i></label>${R.custom ? '<button data-a="del" class="danger sm">삭제</button>' : ''}</td><td><button data-a="cfg" class="sm">⚙️ 배차</button></td></tr>`;
  }).join('')}</table></div>
  <p class="muted">＋ 는 예비 차량에서 배차하고, 예비 차량이 없으면 새 버스를 구매해요(운영 자금). 차종·회사 도색은 거리를 달리는 버스에 <b>다음 실행 때</b> 반영되고, 배차 대수는 바로 반영돼요.</p>`;
  $$('[data-f]', body).forEach((b) => b.onclick = () => { routeFilter = b.dataset.f; renderAdmin(); });
  $$('[data-city]', body).forEach((b) => b.onclick = () => { routeCity = b.dataset.city; renderAdmin(); });
  $$('[data-loadreg]', body).forEach((b) => b.onclick = async () => { b.disabled = true; b.textContent = '받는 중…'; await W.ensureRegion(b.dataset.loadreg); log(`🗺️ ${b.dataset.loadreg} 지도를 받아 노선을 관리할 수 있어요`, 'good'); renderAdmin(); });
  $('#ad-rq').oninput = (e) => { routeQ = e.target.value.trim(); clearTimeout(routesTab.t); routesTab.t = setTimeout(() => { renderAdmin(); const i = $('#ad-rq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); };
  $('#ad-newr').onclick = () => { tab = 'editor'; renderAdmin(); };
  $$('tr[data-r]', body).forEach((tr) => {
    const R = W.routes.find((x) => x.id === tr.dataset.r), c = routeCfg(R);
    $$('select[data-k]', tr).forEach((sel) => sel.onchange = () => {
      const k = sel.dataset.k;
      c[k] = k === 'fare' ? Number(sel.value) : sel.value;
      if (k === 'company' && sel.value) c.active = true; if (k === 'company' && !sel.value) { c.company = null; c.active = false; }
      if (k === 'company') { for (const v of fleetOf(R.id)) v.company = sel.value; log(`🏢 ${R.id}번 운수사 변경 → ${companyById(sel.value).name}`); }
      if (k === 'model') log(`🚌 ${R.id}번 투입 차종 변경 → ${BY_ID[sel.value].name}`);
      if (k === 'fare') log(`💳 ${R.id}번 요금 변경 → ${Number(sel.value).toLocaleString()}원`);
      save(); renderAdmin();
    });
    $('input[data-k=active]', tr).onchange = (e) => { c.active = e.target.checked; log(`${c.active ? '▶️' : '⏸️'} ${R.id}번 ${c.active ? '운행 재개' : '운행 중지'}`); save(); renderAdmin(); };
    $('[data-a=plus]', tr).onclick = () => assignOne(R);
    $('[data-a=cfg]', tr).onclick = () => routeCfgForm(R);
    $('[data-a=minus]', tr).onclick = () => { const v = fleetOf(R.id).sort((a, b) => a.cond - b.cond)[0]; if (v) { v.route = null; log(`↩️ ${v.no} ${R.id}번에서 예비 차량으로`); save(); renderAdmin(); } };
    const del = $('[data-a=del]', tr);
    if (del) del.onclick = async () => {
      if ((await modal(`<p><b>${esc(R.id)}번</b> 노선을 삭제할까요? 배차된 버스는 예비 차량이 돼요.</p>`, [{ label: '취소' }, { label: '삭제', primary: true }])) !== 1) return;
      for (const v of fleetOf(R.id)) v.route = null;
      A.custom = A.custom.filter((x) => x.id !== R.id); delete A.routes[R.id];
      const i = W.routes.indexOf(R); if (i >= 0) W.routes.splice(i, 1);
      for (const s of R.stops) s.routes = s.routes.filter((x) => x !== R.id);
      log(`🗑️ ${R.id}번 노선 폐지`); save(); renderAdmin();
    };
  });
}
async function assignOne(R) {
  const A = S.admin, c = routeCfg(R);
  if (!c.company) return modal('<p>이 노선을 맡을 버스회사가 없어요. 운수사 칸에서 회사를 먼저 고르세요 (회사가 없으면 버스회사 탭에서 세워요).</p>');
  if (c.active === false) { c.active = true; }
  let v = A.fleet.find((x) => !x.route && x.company === c.company && x.cond > 15) || A.fleet.find((x) => !x.route && x.cond > 15);
  if (!v) {
    const spec = BY_ID[c.model];
    if (A.cash < spec.price) return modal(`<p>예비 차량이 없고, 새 버스(${spec.name}, ${won(spec.price)})를 살 운영 자금이 부족해요.</p>`);
    if ((await modal(`<p>예비 차량이 없어요. <b>${spec.name}</b> 1대를 <b>${won(spec.price)}</b>에 사서 ${esc(R.id)}번에 배차할까요?</p>`, [{ label: '취소' }, { label: '구매 · 배차', primary: true }])) !== 1) return;
    A.cash -= spec.price; v = addVehicle(c.model, c.company, null);
    log(`🆕 ${spec.name} 구매 (${v.no})`);
  }
  v.route = R.id; v.company = c.company;
  log(`➡️ ${v.no} → ${R.id}번 배차`);
  if (!driverOfVehicle(v)) { const d = drv().filter((x) => !x.vid && x.company === v.company).sort((a, b) => b.skill - a.skill)[0]; if (d) d.vid = v.id; else log(`⚠️ ${v.no}에 탈 ${companyById(v.company).name} 기사가 없어요 — 기사 관리에서 채용하세요`, 'warn'); }
  save(); renderAdmin();
}

// ---------- 버스회사 ----------
function companiesTab(body, A) {
  const order = [...A.companies].sort((a, b) => (b.id === A.myCo) - (a.id === A.myCo) || (b.custom ? 1 : 0) - (a.custom ? 1 : 0));
  const myco = A.companies.find((c) => c.id === A.myCo);
  body.innerHTML = `<div class="ad-toolbar"><h3 style="margin-right:auto">광주 시내버스 운수사 ${A.companies.filter((c) => !c.custom).length}곳${A.companies.some((c) => c.custom) ? ` + 내 회사 ${A.companies.filter((c) => c.custom).length}곳` : ''}</h3>${A.companies.some((c) => !c.custom) ? '' : '<button id="ad-realco">🏙️ 실제 운수사 다시 채우기</button>'}<button id="ad-newco" class="primary">＋ 내 버스회사 세우기 (5억)</button></div>
  ${myco ? '' : '<div class="co-tip">💡 <b>내 버스회사</b>를 세우면 실제 광주 운수사 10곳 사이에서 경쟁해요. 버스를 사고 기사를 뽑고, 다른 회사 노선을 <b>인수</b>해서 회사를 키워 보세요. 기록은 내 계정에 저장돼요.</div>'}
  <div class="cos">${order.map((co) => {
    const rs = W.routes.filter((R) => routeCfg(R)?.company === co.id);
    const fl = A.fleet.filter((v) => v.company === co.id);
    const rev = rs.reduce((a, R) => a + (routeCfg(R).rev || 0), 0), cost = rs.reduce((a, R) => a + (routeCfg(R).cost || 0), 0);
    const sat = rs.length ? Math.round(rs.reduce((a, R) => a + (routeCfg(R).sat || 0), 0) / rs.length) : 0;
    return `<div class="co" data-co="${co.id}"><div class="co-head" style="background:linear-gradient(135deg, ${co.color}, ${co.color}aa)"><b>${co.id === A.myCo ? '⭐ ' : ''}${esc(co.name)}</b><small>${esc(co.depot)} · ${co.founded}년 설립${co.custom ? ' · 내가 세운 회사' : ''}</small></div>
      <div class="co-stats"><span><small>노선</small><b>${rs.length}</b></span><span><small>버스</small><b>${fl.length}</b></span><span><small>예비</small><b>${fl.filter((v) => !v.route).length}</b></span><span><small>만족도</small><b>${sat}</b></span><span><small>기사</small><b>${drv().filter((d) => d.company === co.id).length}</b></span><span><small>기사 사기</small><b>${Math.round(avgOf(drv().filter((d) => d.company === co.id), 'morale', 0))}</b></span></div>
      ${co.slogan ? `<div class="muted">“${esc(co.slogan)}”</div>` : ''}<div class="muted">기본 시급 ${won(co.wageBase || A.wage)} · 복지 ${['보통', '좋음', '아주 좋음', '최고'][co.welfare || 0]}${co.livery ? ' · 회사 도색 ' + esc((LIVERIES.find((l) => l.id === co.livery) || {}).name || '') : ''}</div>
      <div class="co-routes">${rs.map((R) => `<span class="rno sm" style="background:${R.color}">${esc(R.id)}</span>`).join('') || '<span class="muted">운행 노선 없음</span>'}</div>
      <div class="muted">오늘 수입 ${won(rev)} · 비용 ${won(cost)}</div>
      <div class="row"><button data-a="rename">⚙️ 회사 설정</button><button data-a="buy">버스 구매</button><button data-a="give">🍱 배급·상여금</button><button data-a="staff">👷 기사</button>${co.custom ? '<button data-a="take">🤝 노선 인수</button>' : ''}${co.custom && co.id !== A.myCo ? '<button data-a="mine">⭐ 내 회사로</button>' : ''}${co.custom ? '<button data-a="close" class="danger">폐업</button>' : ''}</div></div>`;
  }).join('')}</div>`;
  $('#ad-newco').onclick = () => companyForm();
  const rc = $('#ad-realco'); if (rc) rc.onclick = () => { A.cov = 0; migrateCompanies(A); save(); renderAdmin(); };
  $$('.co', body).forEach((el) => {
    const co = A.companies.find((c) => c.id === el.dataset.co);
    $('[data-a=rename]', el).onclick = () => companyForm(co);
    $('[data-a=buy]', el).onclick = () => buyForm(co.id);
    $('[data-a=give]', el).onclick = () => giveForm(co);
    $('[data-a=staff]', el).onclick = () => { drvFilter = co.id; tab = 'drivers'; renderAdmin(); };
    const tk = $('[data-a=take]', el); if (tk) tk.onclick = () => takeoverForm(co);
    const mn = $('[data-a=mine]', el); if (mn) mn.onclick = () => { A.myCo = co.id; save(); renderAdmin(); };
    if (co.id === A.myCo) el.classList.add('mine');
    const cl = $('[data-a=close]', el);
    if (cl) cl.onclick = async () => {
      const heir = A.companies.find((c) => c !== co && !c.custom) || A.companies.find((c) => c !== co);
      if ((await modal(`<p><b>${esc(co.name)}</b>을(를) 폐업할까요? 노선과 버스는 ${heir ? esc(heir.name) : '운영사 없음'}(으)로 넘어가요.</p>`, [{ label: '취소' }, { label: '폐업', primary: true }])) !== 1) return;
      for (const id in A.routes) if (A.routes[id].company === co.id) { A.routes[id].company = heir ? heir.id : null; if (!heir) A.routes[id].active = false; }
      for (const v of A.fleet) if (v.company === co.id) v.company = heir ? heir.id : null;
      for (const d of drv()) if (d.company === co.id) d.company = heir ? heir.id : null;
      if (A.myCo === co.id) A.myCo = null;
      A.companies = A.companies.filter((c) => c !== co); log(`🏚️ ${co.name} 폐업`); save(); renderAdmin();
    };
  });
}
// 입력 폼 모달: 확인을 누르면 입력값(id → 값)을 돌려줌, 취소는 null
function formModal(html, okLabel) {
  return new Promise((res) => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-card">${html}<div class="modal-btns"><button data-x="0">취소</button><button data-x="1" class="primary">${okLabel}</button></div></div>`;
    m.classList.remove('hidden');
    $$('.swatches .sw', m).forEach((b) => b.onclick = () => { $$('.swatches .sw', m).forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); });
    $$('button[data-x]', m).forEach((b) => b.onclick = () => {
      let vals = null;
      if (b.dataset.x === '1') {
        vals = {};
        $$('input[id], select[id]', m).forEach((el) => (vals[el.id] = el.value));
        const sw = $('.swatches .sw.sel', m); if (sw) vals.color = sw.dataset.c;
      }
      m.classList.add('hidden'); res(vals);
    });
  });
}
async function companyForm(co) {
  const A = S.admin;
  const dongs = DONG.flat();
  const colors = ['#22bfb0', '#2a63d4', '#d8383a', '#4bb048', '#e0a800', '#8a5cc6', '#ee7d22', '#1f7a8c', '#c2185b', '#555b63'];
  const v = await formModal(`<h3>${co ? '회사 설정' : '새 버스회사 설립'}</h3>
    <div class="form"><label>회사 이름 <input id="cf-name" maxlength="12" value="${co ? esc(co.name) : ''}" placeholder="예: 무지개교통"></label>
    <label>한 줄 소개 (슬로건) <input id="cf-slogan" maxlength="30" value="${co && co.slogan ? esc(co.slogan) : ''}" placeholder="예: 시민의 발, 안전 제일"></label>
    <label>차고지 <select id="cf-depot">${dongs.map((d) => `<option ${co && co.depot === d + ' 차고지' ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <div>대표 색 <div class="swatches">${colors.map((c, i) => `<button class="sw ${(co ? co.color === c : i === 8) ? 'sel' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <label>버스 도색 <select id="cf-livery"><option value="">노선 유형 색 그대로 (급행 빨강·간선 파랑…)</option>${LIVERIES.map((l) => `<option value="${l.id}" ${co && co.livery === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <label>기사 기본 시급 <select id="cf-wage">${[26000, 30000, 32000, 36000, 40000, 45000, 52000].map((w) => `<option value="${w}" ${(co ? co.wageBase || A.wage : 32000) === w ? 'selected' : ''}>${won(w)}</option>`).join('')}</select></label>
    <label>복지 수준 <select id="cf-welfare">${['보통 (추가 비용 없음)', '좋음 (하루 기사 1명당 1만 원)', '아주 좋음 (2만 원)', '최고 (4만 원)'].map((t, i) => `<option value="${i}" ${(co && co.welfare || 0) === i ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${co ? '' : `<label>처음 살 버스 <select id="cf-model">${BUSES.map((b) => `<option value="${b.id}" ${b.id === 'hb_ecity_low' ? 'selected' : ''}>${b.name} · ${won(b.price)}</option>`).join('')}</select></label>
    <label>처음 버스 대수 <select id="cf-n">${[2, 3, 5, 8, 10].map((n) => `<option>${n}</option>`).join('')}</select></label>
    <label>처음 채용할 기사 <select id="cf-d">${[0, 2, 3, 5, 8, 10].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p class="muted">설립 비용 5억 원 + 버스값 + 기사 채용비(1명 300만 원). 운영 자금: ${won(A.cash)}</p>`}</div>`, co ? '저장' : '설립하기');
  if (!v) return;
  const name = (v['cf-name'] || '').trim().slice(0, 12);
  const depot = v['cf-depot'] + ' 차고지', color = v.color || '#22bfb0';
  if (!name) return modal('<p>회사 이름을 입력해 주세요.</p>');
  if (A.companies.some((c) => c.name === name && c !== co)) return modal('<p>같은 이름의 회사가 이미 있어요.</p>');
  const extra = { slogan: (v['cf-slogan'] || '').trim().slice(0, 30), livery: v['cf-livery'] || null, wageBase: Number(v['cf-wage']), welfare: Number(v['cf-welfare']) };
  if (co) { Object.assign(co, { name, color, depot }, extra); log(`✏️ 회사 정보 변경: ${name}`); }
  else {
    const m = v['cf-model'], n = Number(v['cf-n']), nd = Number(v['cf-d']);
    const cost = 5e8 + BY_ID[m].price * n + nd * 3e6;
    if (A.cash < cost) return modal(`<p>운영 자금이 부족해요 (${won(cost)} 필요).</p>`);
    A.cash -= cost;
    const id = 'c' + Date.now().toString(36);
    A.companies.push({ id, name, color, depot, founded: 2026, custom: true, ...extra });
    if (!A.myCo) A.myCo = id;
    for (let i = 0; i < n; i++) addVehicle(m, id, null);
    for (let i = 0; i < nd; i++) { const d = makeDriver(id); d.wage = Math.max(d.wage, extra.wageBase); drv().push(d); }
    log(`🏢 새 버스회사 ${name} 설립 (${depot}) · 버스 ${n}대 · 기사 ${nd}명`, 'good');
  }
  save(); renderAdmin();
}
// 🤝 다른 회사 노선 인수 (노선 면허 + 그 노선 버스와 기사까지)
async function takeoverForm(co) {
  const A = S.admin;
  const cand = W.routes.filter((R) => routeCfg(R) && routeCfg(R).company !== co.id);
  if (!cand.length) return modal('<p>인수할 수 있는 노선이 없어요.</p>');
  const price = (R) => 1e8 + fleetOf(R.id).length * 6e7;
  const v = await formModal(`<h3>${esc(co.name)} · 노선 인수</h3><div class="form">
    <label>어느 노선? <select id="tk-r">${cand.map((R) => `<option value="${esc(R.id)}">${esc(R.id)}번 (${esc(companyNameOf(R))}) · 버스 ${fleetOf(R.id).length}대 · ${won(price(R))}</option>`).join('')}</select></label>
    <p class="muted">노선 면허와 그 노선을 달리던 버스·기사를 함께 넘겨받아요. 비용은 운영 자금에서 나가요: ${won(A.cash)}</p></div>`, '인수하기');
  if (!v) return;
  const R = cand.find((r) => r.id === v['tk-r']); if (!R) return;
  const cost = price(R);
  if (A.cash < cost) return modal(`<p>운영 자금이 부족해요 (${won(cost)} 필요).</p>`);
  A.cash -= cost;
  const from = companyNameOf(R);
  const c = routeCfg(R); c.company = co.id; c.active = true;
  for (const bus of fleetOf(R.id)) { bus.company = co.id; const d = driverOfVehicle(bus); if (d) d.company = co.id; }
  log(`🤝 ${co.name}이(가) ${from}의 ${R.id}번 노선을 인수 (${won(cost)})`, 'good');
  save(); renderAdmin();
}
// 🍱 배급 · 상여금 · 휴가
async function giveForm(co) {
  const A = S.admin, team = drv().filter((d) => d.company === co.id);
  if (!team.length) return modal('<p>이 회사에는 기사가 없어요.</p>');
  const opts = [
    ['snack', `🍙 간식 배급 (1명 3만 원 · 사기 +5 · 피로 -10)`, 3e4, { morale: 5, fatigue: -10 }],
    ['meal', `🍱 점심 도시락 배급 (1명 1.5만 원 · 사기 +3 · 피로 -5)`, 1.5e4, { morale: 3, fatigue: -5 }],
    ['gift', `🎁 명절 선물 세트 (1명 10만 원 · 사기 +10)`, 1e5, { morale: 10 }],
    ['b1', `💵 상여금 10만 원 (사기 +8)`, 1e5, { morale: 8 }],
    ['b3', `💰 상여금 30만 원 (사기 +15)`, 3e5, { morale: 15 }],
    ['b5', `💎 상여금 50만 원 (사기 +22)`, 5e5, { morale: 22 }],
    ['rest', `🏖️ 단체 휴가 (1명 하루 일당 · 피로 0 · 사기 +6)`, null, { morale: 6, fatigue: -100 }],
    ['uni', `👔 새 유니폼 지급 (1명 8만 원 · 친절 +3 · 사기 +4)`, 8e4, { morale: 4, kind: 3 }],
    ['edu', `📚 안전·친절 교육 (1명 20만 원 · 안전 +5 · 친절 +4 · 피로 +5)`, 2e5, { safety: 5, kind: 4, fatigue: 5 }],
  ];
  const v = await formModal(`<h3>${esc(co.name)} 기사 ${team.length}명에게</h3><div class="form"><label>무엇을 나눠 줄까요? <select id="gv-k">${opts.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label>누구에게? <select id="gv-who"><option value="all">회사 기사 모두 (${team.length}명)</option><option value="low">사기 낮은 기사만 (60 미만)</option><option value="tired">피곤한 기사만 (피로 60 이상)</option></select></label>
    <p class="muted">비용은 운영 자금에서 나가요: ${won(A.cash)}</p></div>`, '나눠 주기');
  if (!v) return;
  const o = opts.find((x) => x[0] === v['gv-k']);
  const who = team.filter((d) => v['gv-who'] === 'all' || (v['gv-who'] === 'low' ? d.morale < 60 : d.fatigue >= 60));
  if (!who.length) return modal('<p>조건에 맞는 기사가 없어요.</p>');
  const cost = who.reduce((a, d) => a + (o[2] == null ? d.wage * 8 : o[2]), 0);
  if (A.cash < cost) return modal(`<p>운영 자금이 부족해요 (${won(cost)} 필요).</p>`);
  A.cash -= cost;
  for (const d of who) for (const [k, dv] of Object.entries(o[3])) d[k] = clamp(d[k] + dv, 0, k === 'morale' || k === 'fatigue' ? 100 : 99);
  log(`${o[1].split(' (')[0]} → ${co.name} 기사 ${who.length}명 (${won(cost)})`, 'good');
  save(); renderAdmin();
}
// ⚙️ 노선 배차 설정 (목표 배차간격 · 첫차 · 막차)
async function routeCfgForm(R) {
  const c = routeCfg(R), st = routeStats(R);
  const v = await formModal(`<h3><span class="rno sm" style="background:${R.color}">${esc(R.id)}</span> 배차 설정</h3><div class="form">
    <p class="muted">한 바퀴 ${Math.round(st.cycle)}분 · 지금 운행 ${st.n}대 → 배차간격 ${hwText(st.headway)}</p>
    <label>목표 배차간격 <select id="rc-t">${[0, 3, 5, 7, 8, 10, 12, 15, 20, 25, 30, 40, 60].map((m) => `<option value="${m}" ${(c.target || 0) === m ? 'selected' : ''}>${m ? m + '분마다 (필요 ' + Math.ceil(st.cycle / m) + '대)' : '직접 정하기 (자동 안 함)'}</option>`).join('')}</select></label>
    <label>첫차 <select id="rc-f">${[4, 5, 5.5, 6, 6.5, 7, 8].map((h) => `<option value="${h}" ${(c.first ?? 5) === h ? 'selected' : ''}>${Math.floor(h)}시${h % 1 ? ' 30분' : ''}</option>`).join('')}</select></label>
    <label>막차 <select id="rc-l">${[20, 21, 22, 22.5, 23, 23.5, 24].map((h) => `<option value="${h}" ${(c.last ?? 24) === h ? 'selected' : ''}>${h === 24 ? '자정' : Math.floor(h) + '시' + (h % 1 ? ' 30분' : '')}</option>`).join('')}</select></label>
    <label>차종 <select id="rc-m">${BUSES.map((b) => `<option value="${b.id}" ${c.model === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select></label>
    <p class="muted">목표 간격을 정하면 저장할 때 예비 버스·기사를 자동으로 배차하고, 남는 버스는 예비로 돌려요. 모자라면 버스를 사요(운영 자금).</p></div>`, '저장 · 배차 맞추기');
  if (!v) return;
  c.target = Number(v['rc-t']); c.first = Number(v['rc-f']); c.last = Number(v['rc-l']); c.model = v['rc-m'];
  if (c.target) fitHeadway(R);
  log(`⚙️ ${R.id}번 배차 설정: ${c.target ? c.target + '분 간격' : '직접'} · ${c.first}~${c.last}시`);
  save(); renderAdmin();
}
function fitHeadway(R) {
  const A = S.admin, c = routeCfg(R);
  const need = Math.max(1, Math.ceil(routeStats(R).cycle / c.target));
  let cur = fleetOf(R.id);
  while (cur.length > need) { const v = cur.sort((a, b) => a.cond - b.cond)[0]; v.route = null; cur = fleetOf(R.id); }
  let bought = 0, noDriver = 0;
  while (fleetOf(R.id).length < need) {
    let v = A.fleet.find((x) => !x.route && x.company === c.company && x.cond > 15) || A.fleet.find((x) => !x.route && x.cond > 15);
    if (!v) { const spec = BY_ID[c.model]; if (A.cash < spec.price) break; A.cash -= spec.price; v = addVehicle(c.model, c.company, null); bought++; }
    v.route = R.id; v.company = c.company;
  }
  for (const v of fleetOf(R.id)) if (!driverOfVehicle(v)) { const d = drv().filter((x) => !x.vid && x.company === v.company).sort((a, b) => b.skill - a.skill)[0]; if (d) d.vid = v.id; else noDriver++; }
  log(`🚌 ${R.id}번 ${c.target}분 간격 맞춤: ${fleetOf(R.id).length}/${need}대${bought ? ` (새 버스 ${bought}대 구매)` : ''}${noDriver ? ` · ⚠️ 기사 ${noDriver}명 부족` : ''}`, noDriver ? 'warn' : 'good');
}
async function buyForm(coId) {
  const A = S.admin;
  if (!A.companies.length) return modal('<p>버스회사가 없어요. 먼저 <b>버스회사</b> 탭에서 회사를 세워 주세요.</p>');
  if (!A.companies.find((c) => c.id === coId)) coId = A.companies[0].id;
  const v = await formModal(`<h3>버스 구매</h3><div class="form"><label>운수사 <select id="bf-co">${A.companies.map((c) => `<option value="${c.id}" ${c.id === coId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label>차종 <select id="bf-m">${BUSES.map((b) => `<option value="${b.id}">${b.name} · ${b.cls} · ${won(b.price)}</option>`).join('')}</select></label>
    <label>대수 <select id="bf-n">${[1, 2, 3, 5, 10].map((n) => `<option>${n}</option>`).join('')}</select></label><p class="muted">운영 자금: ${won(A.cash)} · 산 버스는 예비 차량으로 들어가요. 노선 관리에서 ＋ 로 배차하세요.</p></div>`, '구매');
  if (!v) return;
  const m = v['bf-m'], n = Number(v['bf-n']), co = v['bf-co'];
  const cost = BY_ID[m].price * n;
  if (A.cash < cost) return modal(`<p>운영 자금이 부족해요. (${won(cost)} 필요)</p>`);
  A.cash -= cost;
  for (let i = 0; i < n; i++) addVehicle(m, co, null);
  log(`🆕 ${companyById(co).name}: ${BY_ID[m].name} ${n}대 구매 (${won(cost)})`, 'good');
  save(); renderAdmin();
}

// ---------- 차량 관리 ----------
function fleetTab(body, A) {
  const filters = [['all', '전체'], ['spare', '예비'], ['bad', '정비 필요'], ...A.companies.map((c) => [c.id, c.name])];
  const list = A.fleet.filter((v) => fleetFilter === 'all' || (fleetFilter === 'spare' ? !v.route : fleetFilter === 'bad' ? v.cond < 50 : v.company === fleetFilter));
  const per = 40, pages = Math.max(1, Math.ceil(list.length / per));
  fleetPage = Math.min(fleetPage, pages - 1);
  const rows = list.slice(fleetPage * per, fleetPage * per + per);
  body.innerHTML = `<div class="ad-toolbar"><select id="ad-ff">${filters.map(([k, n]) => `<option value="${k}" ${fleetFilter === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><span class="muted">${list.length}대 · 평균 상태 ${Math.round(list.reduce((a, v) => a + v.cond, 0) / Math.max(1, list.length))}%</span>
    <button id="ad-fixall" style="margin-left:auto">🔧 상태 50% 미만 모두 정비</button><button id="ad-buy" class="primary">＋ 버스 구매</button></div>
  <div class="tbl-wrap"><table class="tbl big"><tr><th>차량번호</th><th>차종</th><th>운수사</th><th>배차 노선</th><th>기사</th><th>상태</th><th>주행거리</th><th>연식</th><th></th></tr>
  ${rows.map((v) => `<tr data-v="${v.id}"><td><b>${esc(v.no)}</b></td><td>${BY_ID[v.model]?.name || v.model}</td><td>${coChip(v.company)}</td>
    <td><select data-k="route"><option value="">예비 (차고지)</option>${W.routes.map((R) => `<option value="${esc(R.id)}" ${v.route === R.id ? 'selected' : ''}>${esc(R.id)} · ${BUS_TYPES[R.type]?.ko}</option>`).join('')}</select></td>
    <td><select data-k="drv"><option value="">— 기사 없음 —</option>${drv().filter((d) => d.company === v.company && (!d.vid || d.vid === v.id)).map((d) => `<option value="${d.id}" ${d.vid === v.id ? 'selected' : ''}>${esc(d.name)} (실력 ${Math.round(d.skill)})</option>`).join('')}</select></td>
    <td><div class="meter"><i style="width:${v.cond}%;background:${v.cond < 30 ? '#ff4d3d' : v.cond < 60 ? '#ffb21a' : '#2ee06a'}"></i></div>${Math.round(v.cond)}%</td>
    <td>${v.km.toLocaleString()}km</td><td>${v.year}</td><td><button data-a="fix" ${v.cond > 95 ? 'disabled' : ''}>정비 ${won(fixCost(v))}</button><button data-a="sell" class="danger">매각</button></td></tr>`).join('')}</table></div>
  <div class="pager">${Array.from({ length: pages }, (_, i) => `<button class="${i === fleetPage ? 'sel' : ''}" data-p="${i}">${i + 1}</button>`).join('')}</div>`;
  $('#ad-ff').onchange = (e) => { fleetFilter = e.target.value; fleetPage = 0; renderAdmin(); };
  $$('[data-p]', body).forEach((b) => b.onclick = () => { fleetPage = Number(b.dataset.p); renderAdmin(); });
  $('#ad-buy').onclick = () => buyForm(fleetFilter);
  $('#ad-fixall').onclick = () => {
    const bad = A.fleet.filter((v) => v.cond < 50); const cost = bad.reduce((a, v) => a + fixCost(v), 0);
    if (!bad.length) return modal('<p>정비가 필요한 차량이 없어요 👍</p>');
    if (A.cash < cost) return modal(`<p>운영 자금이 부족해요 (${won(cost)} 필요).</p>`);
    A.cash -= cost; bad.forEach((v) => (v.cond = 100)); log(`🔧 일괄 정비 ${bad.length}대 (${won(cost)})`); save(); renderAdmin();
  };
  $$('tr[data-v]', body).forEach((tr) => {
    const v = A.fleet.find((x) => x.id === Number(tr.dataset.v));
    $('select[data-k=route]', tr).onchange = (e) => { v.route = e.target.value || null; if (v.route) v.company = routeCfg(W.routes.find((R) => R.id === v.route))?.company || v.company; log(`➡️ ${v.no} → ${v.route ? v.route + '번' : '예비'}`); save(); renderAdmin(); };
    $('select[data-k=drv]', tr).onchange = (e) => { const cur = driverOfVehicle(v); if (cur) cur.vid = null; const d = drv().find((x) => x.id === Number(e.target.value)); if (d) d.vid = v.id; save(); renderAdmin(); };
    $('[data-a=fix]', tr).onclick = () => { const c = fixCost(v); if (A.cash < c) return modal('<p>운영 자금이 부족해요.</p>'); A.cash -= c; v.cond = 100; log(`🔧 ${v.no} 정비 완료`); save(); renderAdmin(); };
    $('[data-a=sell]', tr).onclick = async () => {
      const price = Math.round(BY_ID[v.model].price * clamp(0.75 - (2026 - v.year) * 0.06 - v.km / 2e6, 0.1, 0.8) / 1e5) * 1e5;
      if ((await modal(`<p><b>${esc(v.no)}</b> (${BY_ID[v.model].name})를 <b>${won(price)}</b>에 매각할까요?</p>`, [{ label: '취소' }, { label: '매각', primary: true }])) !== 1) return;
      A.cash += price; const dv = driverOfVehicle(v); if (dv) dv.vid = null; A.fleet = A.fleet.filter((x) => x !== v); log(`💱 ${v.no} 매각 (${won(price)})`); save(); renderAdmin();
    };
  });
}
const fixCost = (v) => Math.round(((100 - v.cond) * 180000 + 500000) / 1e4) * 1e4;

// ---------- 실시간 관제 ----------
let liveRaf = 0;
function routePointAt(R, f) {
  let d = f * R.len;
  for (const L of R.links) {
    if (d <= L.len) { const o = L.median / 2 + L.n * 1.6; return { x: L.from.x + L.dir.x * d + L.right.x * o, z: L.from.z + L.dir.z * d + L.right.z * o }; }
    d -= L.len;
  }
  return { x: R.links[0].from.x, z: R.links[0].from.z };
}
// 관제 화면용 가상 운행표: 실제 속도(약 9m/s)로 달리고 정류장마다 18초 정차
const LIVE_V = 9, LIVE_DWELL = 18;
function routeTimeline(R) {
  if (R._tl && R._tl.len === R.len) return R._tl;
  const stopD = [];
  let d = 0;
  for (const L of R.links) { if (L.stop && R.stopLinks.has(L.id)) stopD.push(d + L.stop.s); d += L.len; }
  stopD.sort((a, b) => a - b);
  const seg = []; let prev = 0, t = 0;
  for (const sd of stopD) { if (sd > prev) { seg.push({ t0: t, t1: t + (sd - prev) / LIVE_V, d0: prev, d1: sd }); t += (sd - prev) / LIVE_V; } seg.push({ t0: t, t1: t + LIVE_DWELL, d0: sd, d1: sd, dwell: true }); t += LIVE_DWELL; prev = sd; }
  seg.push({ t0: t, t1: t + (R.len - prev) / LIVE_V, d0: prev, d1: R.len }); t += (R.len - prev) / LIVE_V;
  R._tl = { seg, T: t, len: R.len };
  return R._tl;
}
function livePos(R, tau) {
  const tl = routeTimeline(R); tau = ((tau % tl.T) + tl.T) % tl.T;
  for (const g of tl.seg) if (tau <= g.t1) { const f = g.t1 > g.t0 ? (tau - g.t0) / (g.t1 - g.t0) : 0; const p = routePointAt(R, (g.d0 + (g.d1 - g.d0) * f) / R.len); p.dwell = !!g.dwell; return p; }
  return routePointAt(R, 0);
}
function liveTab(body, A) {
  const sel = W.routes.find((R) => R.id === liveSel);
  body.innerHTML = `<div class="live"><div class="live-side"><input id="lv-q" placeholder="노선 검색"><div id="lv-list" class="rows"></div></div>
    <div class="live-main"><canvas id="lv-map" width="900" height="700"></canvas><div class="live-tools"><button id="lv-in">＋</button><button id="lv-out">－</button><button id="lv-all">전체 보기</button><span class="muted">🟢 실제 거리를 달리는 버스 · ⚪ 운행 계획상 위치</span></div></div>
    <div class="live-info" id="lv-info">${sel ? '' : '<p class="muted">왼쪽에서 노선을 고르면 노선도와 정류장, 버스 위치를 보여줘요.</p>'}</div></div>`;
  const drawList = (q = '') => {
    $('#lv-list').innerHTML = W.routes.filter((R) => !q || (R.id + R.dest).includes(q)).map((R) => { const st = routeStats(R); return `<button class="route-row ${liveSel === R.id ? 'sel' : ''}" data-r="${esc(R.id)}"><span class="rno sm" style="background:${R.color}">${esc(R.id)}</span><span><b>${esc(R.dest)}</b><small>${st.n}대 · 간격 ${st.headway === Infinity ? '-' : Math.round(st.headway) + '분'} · ${esc(companyNameOf(R))}</small></span></button>`; }).join('');
    $$('#lv-list [data-r]').forEach((b) => b.onclick = () => { liveSel = b.dataset.r; liveView = null; renderAdmin(); });
  };
  drawList();
  $('#lv-q').oninput = (e) => drawList(e.target.value.trim());
  const cv = $('#lv-map');
  if (!liveView) {
    if (sel) { const xs = sel.links.flatMap((L) => [L.from.x, L.to.x]), zs = sel.links.flatMap((L) => [L.from.z, L.to.z]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2; const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 300; liveView = { cx, cz, sc: Math.min(cv.width, cv.height) / span }; }
    else { const v0 = mapView(cv); liveView = { cx: v0.cx, cz: v0.cz, sc: v0.sc }; }
  }
  $('#lv-in').onclick = () => (liveView.sc *= 1.3); $('#lv-out').onclick = () => (liveView.sc /= 1.3); $('#lv-all').onclick = () => { const v0 = mapView(cv); liveView = { cx: v0.cx, cz: v0.cz, sc: v0.sc }; };
  let drag = null;
  cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => { if (!drag) return; const k = cv.width / cv.getBoundingClientRect().width; liveView.cx += (e.clientX - drag.x) * k / liveView.sc; liveView.cz += (e.clientY - drag.y) * k / liveView.sc; drag = { x: e.clientX, y: e.clientY }; };
  cv.onpointerup = () => (drag = null);
  cv.onwheel = (e) => { e.preventDefault(); liveView.sc *= e.deltaY > 0 ? 0.88 : 1.14; };
  if (sel) {
    const st = routeStats(sel), c = routeCfg(sel);
    $('#lv-info').innerHTML = `<div class="lv-head" style="border-color:${sel.color}"><span class="rno" style="background:${sel.color}">${esc(sel.id)}</span><div><b>${esc(sel.name)}</b><small>${esc(sel.dest)}</small></div></div>
      <div class="lv-grid"><span><small>운수사</small><b>${esc(companyNameOf(sel))}</b></span><span><small>운행 대수</small><b>${st.n}대</b></span><span><small>배차간격</small><b>${st.headway === Infinity ? '-' : Math.round(st.headway) + '분'}</b></span><span><small>1회 운행</small><b>${Math.round(st.cycle)}분</b></span><span><small>요금</small><b>${c.fare.toLocaleString()}원</b></span><span><small>만족도</small><b>${c.sat}</b></span></div>
      <h4>정류장 ${sel.stops.length}곳</h4><ol class="lv-stops">${sel.stops.map((s) => `<li><i style="border-color:${sel.color}"></i>${esc(s.name)}<small>${s.routes.filter((x) => x !== sel.id).slice(0, 4).map(esc).join(' · ')}</small></li>`).join('')}</ol>`;
  }
  const loop = () => {
    if (!$('#lv-map')) return;
    const v = mapView(cv, liveView.cx, liveView.cz, liveView.sc);
    const t = performance.now() / 1000;
    const buses = [];
    const routes = sel ? [sel] : W.routes;
    for (const R of routes) {
      const st = routeStats(R);
      const T = routeTimeline(R).T;
      for (let k = 0; k < st.n; k++) { const p = livePos(R, t + (k * T) / st.n); buses.push({ ...p, color: p.dwell ? '#ffd23a' : '#fff', r: 3.5 }); }
    }
    for (const a of app.traffic?.cars || []) if (a.active && a.isBus && (!sel || a.R === sel)) buses.push({ x: a.x, z: a.z, color: a.R ? a.R.color : '#4bb048', r: 5.5 });
    const P = app.playerPos?.();
    drawCityMap(cv, v, { routes: routes.map((R) => ({ route: R, color: R.color, width: sel ? 5 : 2 })), routeStops: !!sel, buses, player: P, names: true, stops: false });
    liveRaf = requestAnimationFrame(loop);
  };
  loop();
}

// ---------- 노선 만들기 (지도에서 교차로를 순서대로 클릭) ----------
function editorTab(body, A) {
  if (!editor) editor = { pts: [], type: 'branch', id: '', name: '', dest: '', company: S.admin.myCo || S.admin.companies[0]?.id || null, view: null };
  const E = editor;
  body.innerHTML = `<div class="live ed"><div class="live-side form">
      <h3>새 노선 만들기</h3>
      <p class="muted">지도에서 <b>교차로</b>를 순서대로 눌러 모퉁이를 찍으세요. 모퉁이끼리는 <b>같은 직선 도로</b>로 이어져야 하고, 마지막 점은 첫 점으로 자동으로 이어져 순환 노선이 돼요.</p>
      <label>유형 <select id="ed-type">${Object.entries(BUS_TYPES).map(([k, v]) => `<option value="${k}" ${E.type === k ? 'selected' : ''}>${v.ko}</option>`).join('')}</select></label>
      <label>노선 번호 <input id="ed-id" maxlength="8" value="${esc(E.id)}" placeholder="예: 777, 급행09"></label>
      <label>노선 설명 <input id="ed-dest" maxlength="30" value="${esc(E.dest)}" placeholder="예: 우리동네 ↔ 시청"></label>
      <label>운수사 <select id="ed-co">${A.companies.map((c) => `<option value="${c.id}" ${E.company === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div id="ed-status" class="tip"></div>
      <div class="row"><button id="ed-undo">↶ 되돌리기</button><button id="ed-reset">전체 지우기</button></div>
      <button id="ed-save" class="primary big">노선 개통 (1억)</button>
      <p class="muted">개통하면 바로 버스 운전 모드에서 고를 수 있어요. 새로 생기는 정류장의 승강장 시설은 다음 실행 때 설치돼요.</p>
    </div><div class="live-main"><canvas id="ed-map" width="900" height="700"></canvas></div></div>`;
  const cv = $('#ed-map');
  if (!E.view) { const v0 = mapView(cv); E.view = { cx: v0.cx, cz: v0.cz, sc: v0.sc * 1.6 }; }
  const bind = (id, k) => { $(id).oninput = (e) => { E[k] = e.target.value; status(); }; };
  bind('#ed-id', 'id'); bind('#ed-dest', 'dest');
  $('#ed-type').onchange = (e) => { E.type = e.target.value; status(); };
  $('#ed-co').onchange = (e) => { E.company = e.target.value; };
  $('#ed-undo').onclick = () => { E.pts.pop(); status(); };
  $('#ed-reset').onclick = () => { E.pts = []; status(); };
  const nodes = W.nodes.filter((n) => n.edges.length >= 3 && n.y < 1);
  function valid() {
    if (E.pts.length < 3) return { ok: false, msg: `모퉁이를 3개 이상 찍어 주세요 (지금 ${E.pts.length}개)` };
    const links = linksFromPts(E.pts);
    if (!links) return { ok: false, msg: '⚠️ 이어지지 않는 구간이 있어요. 모퉁이끼리 같은 직선 도로 위에 있어야 해요 (마지막 점 → 첫 점 포함).' };
    return { ok: true, links, msg: `✅ 노선 길이 ${(links.reduce((a, L) => a + L.len, 0) / 1000).toFixed(1)}km · 구간 ${links.length}개` };
  }
  function status() {
    const v = valid();
    const idOk = E.id.trim() && !W.routes.some((R) => R.id === E.id.trim());
    $('#ed-status').innerHTML = v.msg + (E.id && !idOk ? '<br>⚠️ 이미 있는 노선 번호예요' : '');
    $('#ed-save').disabled = !(v.ok && idOk && E.dest.trim());
  }
  status();
  cv.onclick = (e) => {
    const rc = cv.getBoundingClientRect(), k = cv.width / rc.width;
    const view = mapView(cv, E.view.cx, E.view.cz, E.view.sc);
    const w = view.toWorld((e.clientX - rc.left) * k, (e.clientY - rc.top) * k);
    let best = null, bd = 30 / E.view.sc;
    for (const n of nodes) { const d = Math.hypot(n.x - w.x, n.z - w.z); if (d < bd) { bd = d; best = n; } }
    if (!best) return;
    const last = E.pts[E.pts.length - 1];
    if (last && last[0] === best.x && last[1] === best.z) return;
    E.pts.push([best.x, best.z]);
    status();
  };
  cv.onwheel = (e) => { e.preventDefault(); E.view.sc *= e.deltaY > 0 ? 0.88 : 1.14; };
  $('#ed-save').onclick = () => {
    const v = valid(); if (!v.ok) return;
    if (A.cash < 1e8) return modal('<p>운영 자금이 부족해요 (1억 필요).</p>');
    const T = BUS_TYPES[E.type];
    const R0 = { type: E.type, id: E.id.trim(), name: `${T.ko} ${E.id.trim()}`, dest: E.dest.trim(), company: E.company, pts: E.pts.map((p) => [...p]), livery: T.livery, express: T.stopEvery > 1, custom: true };
    const R = registerRoute(R0);
    if (!R) return modal('<p>노선을 만들 수 없어요.</p>');
    for (const st of R.stops) if (!st.name) st.name = st.link.edge.stopName || (st.link.edge.name + ' 정류장');
    A.cash -= 1e8;
    A.custom.push(R0);
    syncAdminWithWorld();
    log(`🎊 새 노선 ${R0.id}번 개통 — ${R0.dest}`, 'good');
    editor = null; tab = 'routes'; routeFilter = 'all';
    save(); renderAdmin();
  };
  const loop = () => {
    if (!$('#ed-map')) return;
    const view = mapView(cv, E.view.cx, E.view.cz, E.view.sc);
    const v = valid();
    drawCityMap(cv, view, { routes: v.ok ? [{ route: { links: v.links, stops: [], color: BUS_TYPES[E.type].color }, width: 5 }] : [], names: true, pois: true });
    const g = cv.getContext('2d');
    for (const n of nodes) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(view.X(n.x), view.Y(n.z), 4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = BUS_TYPES[E.type].color; g.lineWidth = 3; g.setLineDash(v.ok ? [] : [8, 6]); g.beginPath();
    E.pts.forEach((p, i) => (i ? g.lineTo(view.X(p[0]), view.Y(p[1])) : g.moveTo(view.X(p[0]), view.Y(p[1]))));
    if (E.pts.length > 2) g.closePath();
    g.stroke(); g.setLineDash([]);
    E.pts.forEach((p, i) => { g.fillStyle = i === 0 ? '#ffb21a' : '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(view.X(p[0]), view.Y(p[1]), 8, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#000'; g.font = '800 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i + 1, view.X(p[0]), view.Y(p[1])); });
    liveRaf = requestAnimationFrame(loop);
  };
  loop();
  void nodeAt; void ROUTES;
}

// =====================================================================
// 👷 버스 기사 (채용 · 급여 · 배정 · 사기 · 피로 · 배급/상여금)
// =====================================================================
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '문', '양', '손', '배', '백', '노'];
const GIV = ['민수', '영호', '성훈', '정희', '지훈', '현우', '미경', '상철', '동욱', '은정', '준호', '경수', '수진', '태식', '병철', '혜원', '재원', '광호', '선영', '용석', '종민', '하늘', '도윤', '서연', '기범', '순자', '말순', '진호', '창민', '유진'];
const TRAITS = [
  ['🧓 베테랑', { skill: 18, safety: 10 }], ['😊 친절왕', { kind: 22 }], ['🛡️ 안전운전', { safety: 22 }], ['🐣 신입', { skill: -14, wage: -4000 }],
  ['⏰ 지각대장', { skill: -6, morale: -8 }], ['🏎️ 급출발', { safety: -16, skill: 6 }], ['💪 체력왕', { fatigueK: -0.35 }], ['🗣️ 안내방송 잘함', { kind: 12 }], ['', {}], ['', {}], ['', {}],
];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export function makeDriver(company) {
  const [trait, fx] = TRAITS[rint(0, TRAITS.length - 1)];
  const exp = rint(0, 28);
  const d = {
    id: (S.admin.nextDid = (S.admin.nextDid || 0) + 1), name: SUR[rint(0, SUR.length - 1)] + GIV[rint(0, GIV.length - 1)], age: clamp(24 + exp + rint(0, 14), 24, 68), exp,
    skill: clamp(45 + exp * 1.4 + rint(-10, 10) + (fx.skill || 0), 15, 99), kind: clamp(rint(40, 85) + (fx.kind || 0), 10, 99), safety: clamp(rint(45, 85) + exp * 0.5 + (fx.safety || 0), 10, 99),
    morale: clamp(rint(60, 85) + (fx.morale || 0), 10, 100), fatigue: rint(0, 25), trait, fatigueK: 1 + (fx.fatigueK || 0),
    company: company || null, vid: null, day: S.admin.day,
  };
  d.wage = Math.round((26000 + d.skill * 160 + exp * 250 + (fx.wage || 0)) / 500) * 500; // 희망 시급
  return d;
}
const drv = () => (S.admin.drivers = S.admin.drivers || []);
export const driverOfVehicle = (v) => drv().find((d) => d.vid === v.id) || null;
export function ensureDrivers() {
  const A = S.admin;
  if (!Array.isArray(A.drivers)) A.drivers = [];
  if (!A.driversV) {
    A.driversV = 1;
    for (const v of A.fleet) if (v.route) { const d = makeDriver(v.company); d.vid = v.id; d.wage = Math.max(d.wage, A.wage || 32000); A.drivers.push(d); }
    for (const c of A.companies) for (let i = 0; i < 2; i++) A.drivers.push(makeDriver(c.id));
  }
  if (!Array.isArray(A.market) || !A.market.length) refreshMarket();
  for (const c of A.companies) { if (!c.wageBase) c.wageBase = A.wage || 32000; }
}
export function refreshMarket() { S.admin.market = Array.from({ length: 8 }, () => makeDriver(null)); }
// 노선의 운행 가능한 버스 = 배차됨 + 상태 15% 이상 + 기사 배정
export function runnable(v) { return v.cond > 15 && !!driverOfVehicle(v); }
function teamOf(R) { return fleetOf(R.id).map(driverOfVehicle).filter(Boolean); }
const avgOf = (arr, k, dflt) => (arr.length ? arr.reduce((a, d) => a + d[k], 0) / arr.length : dflt);
// 시간마다: 노선 기사들 피로 · 사기 변화 + 노선 지표 보정값
export function driverHour(R, c, h, running) {
  const team = teamOf(R);
  for (const d of team) {
    if (running) { d.fatigue = clamp(d.fatigue + 3.2 * d.fatigueK, 0, 100); if (d.fatigue > 85) d.morale = clamp(d.morale - 0.6, 0, 100); }
    else d.fatigue = clamp(d.fatigue - 6, 0, 100);
  }
  const skill = avgOf(team, 'skill', 60), kind = avgOf(team, 'kind', 60), mor = avgOf(team, 'morale', 70), fat = avgOf(team, 'fatigue', 20), safe = avgOf(team, 'safety', 60);
  // 사고
  if (running && team.length && Math.random() < 0.0025 * (1 + Math.max(0, fat - 60) / 20) * (1.6 - safe / 100)) {
    const d = team[rint(0, team.length - 1)];
    const cost = rint(3, 15) * 1e6; S.admin.cash -= cost; d.morale = clamp(d.morale - 10, 0, 100);
    log(`🚨 ${R.id}번 ${d.name} 기사 접촉 사고 — 수리·보상 ${won(cost)}${d.fatigue > 70 ? ' (피로가 쌓였어요)' : ''}`, 'bad');
  }
  return { sat: (kind - 60) * 0.18 + (mor - 65) * 0.12 - Math.max(0, fat - 70) * 0.25, ontime: (skill - 60) * 0.12 - Math.max(0, fat - 75) * 0.2 };
}
export function driverDay() {
  const A = S.admin;
  for (const d of drv()) {
    d.fatigue = clamp(d.fatigue - 55, 0, 100);
    const co = companyById(d.company);
    const fair = 26000 + d.skill * 160 + d.exp * 250;
    d.morale = clamp(d.morale + (d.wage - fair) / 2500 + (co.welfare || 0) * 0.6 - (d.vid ? 0 : 0.5) + rint(-2, 2), 0, 100);
    if (d.vid && Math.random() < 0.03) d.exp += 1;
  }
  // 사기가 너무 낮으면 그만둠
  for (const d of [...drv()]) if (d.morale < 18 && Math.random() < 0.35) { A.drivers = A.drivers.filter((x) => x !== d); log(`😢 ${companyById(d.company).name} ${d.name} 기사가 회사를 그만뒀어요 (사기 ${Math.round(d.morale)})`, 'bad'); }
  // 하루 급여 (대기 기사 기본급: 하루 4시간분)
  let pay = 0;
  for (const d of drv()) { if (!d.vid) pay += d.wage * 4; pay += [0, 1e4, 2e4, 4e4][companyById(d.company).welfare || 0]; }
  A.cash -= pay; if (pay) A.today.cost += 0;
  if (Math.random() < 0.6) refreshMarket();
}
export function autoAssignDrivers() {
  const A = S.admin; let n = 0;
  for (const v of A.fleet) {
    if (!v.route || driverOfVehicle(v)) continue;
    const d = drv().filter((x) => !x.vid && x.company === v.company).sort((a, b) => b.skill - a.skill)[0];
    if (d) { d.vid = v.id; n++; }
  }
  return n;
}

// ---------- 👷 기사 관리 탭 ----------
const bar = (v, good = true) => `<div class="meter"><i style="width:${Math.round(v)}%;background:${(good ? v : 100 - v) < 35 ? '#ff4d3d' : (good ? v : 100 - v) < 60 ? '#ffb21a' : '#2ee06a'}"></i></div>${Math.round(v)}`;
function driversTab(body, A) {
  const all = drv();
  const list = all.filter((d) => drvFilter === 'all' || (drvFilter === 'idle' ? !d.vid : drvFilter === 'tired' ? d.fatigue >= 60 : drvFilter === 'low' ? d.morale < 50 : d.company === drvFilter));
  const sorters = { company: (a, b) => String(a.company).localeCompare(String(b.company)) || b.skill - a.skill, skill: (a, b) => b.skill - a.skill, morale: (a, b) => a.morale - b.morale, fatigue: (a, b) => b.fatigue - a.fatigue, wage: (a, b) => b.wage - a.wage };
  list.sort(sorters[drvSort] || sorters.company);
  const noDrv = A.fleet.filter((v) => v.route && !driverOfVehicle(v)).length;
  const filters = [['all', '전체'], ['idle', '대기 중'], ['tired', '피곤함'], ['low', '사기 낮음'], ...A.companies.map((c) => [c.id, c.name])];
  body.innerHTML = `<div class="kpis">
      <div class="kpi"><i>👷</i><small>전체 기사</small><b>${all.length}명</b></div>
      <div class="kpi"><i>🚌</i><small>운행 중</small><b>${all.filter((d) => d.vid).length}명</b></div>
      <div class="kpi ${noDrv ? 'bad' : ''}"><i>⚠️</i><small>기사 없는 배차 버스</small><b>${noDrv}대</b></div>
      <div class="kpi"><i>😊</i><small>평균 사기</small><b>${Math.round(avgOf(all, 'morale', 0))}</b></div>
      <div class="kpi"><i>😪</i><small>평균 피로</small><b>${Math.round(avgOf(all, 'fatigue', 0))}</b></div>
      <div class="kpi"><i>💵</i><small>평균 시급</small><b>${won(Math.round(avgOf(all, 'wage', 0)))}</b></div></div>
    <div class="card"><h3>📋 채용 시장 <small class="muted">— 채용비 1명 300만 원 · 하루마다 지원자가 바뀌어요</small></h3>
      <div class="row"><label>입사할 회사 <select id="dv-hireco">${A.companies.map((c) => `<option value="${c.id}" ${drvFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><button id="dv-ad">📢 구인 광고 (200만 원 · 새 지원자)</button><button id="dv-auto" class="primary">🔄 대기 기사 → 빈 버스 자동 배정</button></div>
      <div class="cands">${(A.market || []).map((d, i) => `<div class="cand"><b>${esc(d.name)}</b> <small>${d.age}세 · 경력 ${d.exp}년</small><div class="muted">${d.trait || '　'}</div>
        <div class="cstat"><span>운전 ${Math.round(d.skill)}</span><span>친절 ${Math.round(d.kind)}</span><span>안전 ${Math.round(d.safety)}</span></div><div>희망 시급 <b>${won(d.wage)}</b></div><button data-hire="${i}" class="primary sm">채용</button></div>`).join('')}</div></div>
    <div class="ad-toolbar"><select id="dv-f">${filters.map(([k, n]) => `<option value="${k}" ${drvFilter === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select id="dv-s">${[['company', '회사순'], ['skill', '실력순'], ['morale', '사기 낮은 순'], ['fatigue', '피곤한 순'], ['wage', '시급순']].map(([k, n]) => `<option value="${k}" ${drvSort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <span class="muted">${list.length}명</span>${drvFilter !== 'all' && A.companies.find((c) => c.id === drvFilter) ? '<button id="dv-give" style="margin-left:auto">🍱 이 회사에 배급·상여금</button>' : ''}</div>
    <div class="tbl-wrap"><table class="tbl big"><tr><th>이름</th><th>회사</th><th>담당 버스</th><th>운전 실력</th><th>친절</th><th>안전</th><th>사기</th><th>피로</th><th>시급</th><th></th></tr>
    ${list.slice(0, 120).map((d) => {
      const v = d.vid && A.fleet.find((x) => x.id === d.vid);
      const opts = A.fleet.filter((x) => x.company === d.company && (!driverOfVehicle(x) || x.id === d.vid));
      return `<tr data-d="${d.id}"><td><b>${esc(d.name)}</b><small class="muted" style="display:block">${d.age}세 · ${d.exp}년 ${d.trait || ''}</small></td><td>${coChip(d.company)}</td>
      <td><select data-k="vid"><option value="">대기 (차고지)</option>${opts.map((x) => `<option value="${x.id}" ${x.id === d.vid ? 'selected' : ''}>${esc(x.no)}${x.route ? ' · ' + esc(x.route) + '번' : ' · 예비'}</option>`).join('')}</select>${v && !v.route ? '<small class="muted" style="display:block">예비 버스라 운행 안 함</small>' : ''}</td>
      <td>${bar(d.skill)}</td><td>${bar(d.kind)}</td><td>${bar(d.safety)}</td><td>${bar(d.morale)}</td><td>${bar(d.fatigue, false)}</td>
      <td><div class="stepper"><button data-a="wd">−</button><b>${(d.wage / 1000).toFixed(1)}천</b><button data-a="wu">＋</button></div></td>
      <td><button data-a="bonus" class="sm">💵 상여</button><button data-a="rest" class="sm">🏖️ 휴가</button><button data-a="fire" class="danger sm">해고</button></td></tr>`;
    }).join('')}</table></div>${list.length > 120 ? '<p class="muted">처음 120명만 보여요. 회사로 걸러 보세요.</p>' : ''}`;
  $('#dv-f').onchange = (e) => { drvFilter = e.target.value; renderAdmin(); };
  $('#dv-s').onchange = (e) => { drvSort = e.target.value; renderAdmin(); };
  $('#dv-ad').onclick = () => { if (A.cash < 2e6) return modal('<p>운영 자금이 부족해요.</p>'); A.cash -= 2e6; refreshMarket(); log('📢 구인 광고를 냈어요'); save(); renderAdmin(); };
  $('#dv-auto').onclick = () => { const n = autoAssignDrivers(); log(`🔄 기사 ${n}명 자동 배정`); save(); renderAdmin(); if (!n) modal('<p>배정할 대기 기사나 빈 버스가 없어요. 기사가 모자라면 채용하세요.</p>'); };
  const gb = $('#dv-give'); if (gb) gb.onclick = () => giveForm(A.companies.find((c) => c.id === drvFilter));
  $$('[data-hire]', body).forEach((b) => b.onclick = () => {
    const d = A.market[Number(b.dataset.hire)]; if (!d) return;
    if (A.cash < 3e6) return modal('<p>운영 자금이 부족해요 (300만 원 필요).</p>');
    A.cash -= 3e6; d.company = $('#dv-hireco').value; d.day = A.day;
    const co = companyById(d.company); if (co.wageBase && d.wage < co.wageBase) { d.wage = co.wageBase; d.morale = clamp(d.morale + 5, 0, 100); }
    drv().push(d); A.market.splice(Number(b.dataset.hire), 1);
    const v = A.fleet.find((x) => x.company === d.company && x.route && !driverOfVehicle(x)); if (v) d.vid = v.id;
    log(`🤝 ${co.name}에 ${d.name} 기사 채용${v ? ` → ${v.no} (${v.route}번)` : ''}`, 'good'); save(); renderAdmin();
  });
  $$('tr[data-d]', body).forEach((tr) => {
    const d = drv().find((x) => x.id === Number(tr.dataset.d));
    $('select[data-k=vid]', tr).onchange = (e) => { const id = Number(e.target.value) || null; d.vid = id; save(); renderAdmin(); };
    $('[data-a=wu]', tr).onclick = () => { d.wage += 1000; d.morale = clamp(d.morale + 3, 0, 100); save(); renderAdmin(); };
    $('[data-a=wd]', tr).onclick = () => { d.wage = Math.max(20000, d.wage - 1000); d.morale = clamp(d.morale - 5, 0, 100); save(); renderAdmin(); };
    $('[data-a=bonus]', tr).onclick = () => { if (A.cash < 3e5) return modal('<p>운영 자금이 부족해요.</p>'); A.cash -= 3e5; d.morale = clamp(d.morale + 15, 0, 100); log(`💵 ${d.name} 기사 상여금 30만 원`); save(); renderAdmin(); };
    $('[data-a=rest]', tr).onclick = () => { const c = d.wage * 8; if (A.cash < c) return modal('<p>운영 자금이 부족해요.</p>'); A.cash -= c; d.fatigue = 0; d.morale = clamp(d.morale + 4, 0, 100); log(`🏖️ ${d.name} 기사 하루 휴가`); save(); renderAdmin(); };
    $('[data-a=fire]', tr).onclick = async () => {
      const sev = d.wage * 8 * 20;
      if ((await modal(`<p><b>${esc(d.name)}</b> 기사를 해고할까요? 퇴직금 <b>${won(sev)}</b>이 나가고, 같은 회사 기사들 사기가 조금 떨어져요.</p>`, [{ label: '취소' }, { label: '해고', primary: true }])) !== 1) return;
      A.cash -= sev; A.drivers = A.drivers.filter((x) => x !== d);
      for (const o of drv()) if (o.company === d.company) o.morale = clamp(o.morale - 3, 0, 100);
      log(`📤 ${d.name} 기사 해고 (퇴직금 ${won(sev)})`, 'warn'); save(); renderAdmin();
    };
  });
}

// ---------- 🚇 지하철 노선 편집 ----------
function metroLines() {
  const A = S.admin;
  if (!A.metro.lines) A.metro.lines = (app && app.transit ? app.transit.lines.filter((x) => !x.region) : []).map((L) => ({ id: L.id, name: L.name, color: L.color, stations: L.stations.map((s) => ({ name: s.name, x: Math.round(s.x), z: Math.round(s.z) })) }));
  return A.metro.lines;
}
const HW_OPTS = [120, 150, 180, 240, 300, 360, 480, 600, 900];
function metroCityTab(body, A, city) {
  const ls = SUBWAY.lines.filter((L) => L.city === city);
  const tr = trainsNow(undefined, city);
  const cnt = (L) => tr.filter((t) => t.line === L).length;
  body.innerHTML = `${metroCityBar()}
  <div class="tbl-wrap"><table class="tbl big"><tr><th>노선</th><th>구간</th><th>역</th><th>길이</th><th>배차간격</th><th>지금 달리는 열차</th><th>운행</th></tr>
  ${ls.map((L) => `<tr data-ml="${esc(lineKey(L))}"><td><span class="rno sm" style="background:${L.color}">${esc(L.name)}</span></td><td class="wrap"><b>${esc(L.st[0].name)} ↔ ${esc(L.st[L.st.length - 1].name)}</b><small>${L.st.map((x) => esc(x.name)).join(' · ')}</small></td><td>${L.st.length}</td><td>${(L.len / 1000).toFixed(1)}km</td>
  <td><select data-k="hw">${HW_OPTS.map((v) => `<option value="${v}" ${L.hw === v ? 'selected' : ''}>${v < 60 ? v + '초' : v / 60 + '분'}${v === L.hw0 ? ' (기본)' : ''}</option>`).join('')}</select></td>
  <td><b>${cnt(L)}</b>대</td><td><label class="switch"><input type="checkbox" data-k="on" ${L.off ? '' : 'checked'}><i></i></label></td></tr>`).join('') || `<tr><td colspan="7" class="muted">이 도시 지하철은 지도를 받으면 나와요. <button id="mt-load" class="primary sm">지도 받기</button></td></tr>`}
  </table></div>
  <p class="muted">배차간격을 줄이면 열차가 더 자주 다녀요(지도·역 도착 정보에 바로 반영). 운행을 끄면 그 노선 열차가 멈춰요. 열차 위치는 시간표로 계산해요.</p>`;
  metroCityBind(body);
  const ld = $('#mt-load', body); if (ld) ld.onclick = async () => { ld.disabled = true; ld.textContent = '받는 중…'; await W.ensureRegion(city); renderAdmin(); };
  $$('tr[data-ml]', body).forEach((row) => {
    const key = row.dataset.ml;
    const c = () => (A.metroCfg[key] = A.metroCfg[key] || {});
    $('select[data-k=hw]', row).onchange = (e) => { const L = SUBWAY.lines.find((x) => lineKey(x) === key); c().hw = Number(e.target.value); applyMetroCfg(A.metroCfg); log(`🚇 ${L.cityKo} ${L.name} 배차간격 ${Number(e.target.value) / 60}분`); save(); renderAdmin(); };
    $('input[data-k=on]', row).onchange = (e) => { const L = SUBWAY.lines.find((x) => lineKey(x) === key); c().off = !e.target.checked; applyMetroCfg(A.metroCfg); log(`🚇 ${L.cityKo} ${L.name} ${e.target.checked ? '운행 재개' : '운행 중지'}`, e.target.checked ? 'good' : 'warn'); save(); renderAdmin(); };
  });
}
function metroCityBar() {
  const cities = [['gwangju', '광주 (노선 직접 편집)'], ...[...new Set(SUBWAY.lines.map((L) => L.city).filter((c) => c !== 'gwangju'))].map((c) => [c, SUBWAY.lines.find((L) => L.city === c).cityKo]), ...[['seoul', '서울'], ['daejeon', '대전'], ['busan', '부산'], ['daegu', '대구'], ['incheon', '인천'], ['jeju', '제주']].filter(([c]) => !SUBWAY.lines.some((L) => L.city === c))];
  return `<div class="ad-toolbar"><div class="tabs">${cities.map(([k, n]) => `<button class="${metroCity === k ? 'sel' : ''}" data-mcity="${k}">🚇 ${n}</button>`).join('')}</div></div>`;
}
function metroCityBind(body) { $$('[data-mcity]', body).forEach((b) => b.onclick = () => { metroCity = b.dataset.mcity; renderAdmin(); }); }
function metroTab(body, A) {
  if (metroCity !== 'gwangju') return metroCityTab(body, A, metroCity);
  const lines = metroLines();
  if (!metroEd) metroEd = { li: 0, mode: 'add', view: null, sel: -1, drag: null };
  const E = metroEd; E.li = clamp(E.li, 0, Math.max(0, lines.length - 1));
  const L = lines[E.li];
  const dirty = JSON.stringify(lines) !== JSON.stringify((app && app.transit ? app.transit.lines.filter((x) => !x.region) : []).map((x) => ({ id: x.id, name: x.name, color: x.color, stations: x.stations.map((s) => ({ name: s.name, x: Math.round(s.x), z: Math.round(s.z) })) })));
  body.innerHTML = `${metroCityBar()}<div class="live ed"><div class="live-side form">
    <h3>🚇 지하철 노선 개편</h3>
    <div class="row">${lines.map((x, i) => `<button data-li="${i}" class="${i === E.li ? 'sel' : ''}" style="border-left:6px solid ${x.color}">${esc(x.name)} <small>${x.stations.length}역</small></button>`).join('')}<button id="mt-new">＋ 새 노선</button></div>
    ${L ? `<label>노선 이름 <input id="mt-name" maxlength="10" value="${esc(L.name)}"></label>
    <label>노선 색 <input id="mt-color" type="color" value="${L.color}"></label>
    <div class="tabs">${[['add', '➕ 역 추가 (지도 클릭)'], ['ins', '↔ 사이에 끼우기'], ['move', '✋ 역 옮기기 (끌기)'], ['del', '🗑️ 역 지우기 (클릭)']].map(([k, n]) => `<button data-mode="${k}" class="${E.mode === k ? 'sel' : ''}">${n}</button>`).join('')}</div>
    <div class="mt-list">${L.stations.map((s, i) => `<div class="mt-st ${i === E.sel ? 'sel' : ''}" data-si="${i}"><i style="background:${L.color}">${i + 1}</i><input data-nm="${i}" value="${esc(s.name)}" maxlength="10"><button data-up="${i}" class="sm">▲</button><button data-dn="${i}" class="sm">▼</button><button data-rm="${i}" class="sm danger">✕</button></div>`).join('') || '<p class="muted">역이 없어요. 지도를 눌러 역을 놓으세요.</p>'}</div>
    <div class="row"><button id="mt-rev">⇅ 순서 뒤집기</button><button id="mt-delline" class="danger">노선 없애기</button></div>` : '<p class="muted">노선이 없어요. ＋ 새 노선을 눌러 만들어 보세요.</p>'}
    <div class="tip">역 신설 1곳 1억 · 옮기기·이름 바꾸기는 무료. 바꾼 뒤 <b>적용</b>을 눌러야 거리의 역 입구가 바뀌어요.</div>
    <div class="row"><button id="mt-apply" class="primary big" ${dirty ? '' : 'disabled'}>✅ 개편 적용</button><button id="mt-resetdef">기본(1호선)으로 되돌리기</button></div>
  </div><div class="live-main"><canvas id="mt-map" width="900" height="700"></canvas></div></div>`;
  const cv = $('#mt-map');
  if (!E.view) { const v0 = mapView(cv); E.view = { cx: v0.cx, cz: v0.cz, sc: v0.sc * 1.3 }; }
  const view = () => mapView(cv, E.view.cx, E.view.cz, E.view.sc);
  const toW = (e) => { const rc = cv.getBoundingClientRect(), k = cv.width / rc.width; return view().toWorld((e.clientX - rc.left) * k, (e.clientY - rc.top) * k); };
  const pickSt = (w) => { if (!L) return -1; let bi = -1, bd = 26 / E.view.sc; L.stations.forEach((s, i) => { const d = Math.hypot(s.x - w.x, s.z - w.z); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const nameFor = (w) => { const d = dongAt(w.x, w.z); let n = d ? d.replace(/[0-9·]+동$|동$/, '') : '새역'; let k = 2; const base = n; while (lines.some((x) => x.stations.some((s) => s.name === n))) n = base + k++; return n; };
  const paidNew = () => { if (A.cash < 1e8) { modal('<p>운영 자금이 부족해요 (역 신설 1억).</p>'); return false; } A.cash -= 1e8; return true; };
  metroCityBind(body);
  $$('[data-li]', body).forEach((b) => b.onclick = () => { E.li = Number(b.dataset.li); E.sel = -1; renderAdmin(); });
  $('#mt-new').onclick = () => { const cols = ['#00a54f', '#f08300', '#2a63d4', '#8a5cc6', '#d8383a', '#e0a800']; lines.push({ id: 'L' + Date.now().toString(36), name: (lines.length + 1) + '호선', color: cols[lines.length % cols.length], stations: [] }); E.li = lines.length - 1; E.mode = 'add'; save(); renderAdmin(); };
  if (L) {
    $('#mt-name').onchange = (e) => { L.name = e.target.value.trim() || L.name; save(); renderAdmin(); };
    $('#mt-color').onchange = (e) => { L.color = e.target.value; save(); renderAdmin(); };
    $$('[data-mode]', body).forEach((b) => b.onclick = () => { E.mode = b.dataset.mode; renderAdmin(); });
    $$('[data-nm]', body).forEach((inp) => inp.onchange = () => { L.stations[Number(inp.dataset.nm)].name = inp.value.trim() || '역'; save(); renderAdmin(); });
    $$('[data-up]', body).forEach((b) => b.onclick = () => { const i = Number(b.dataset.up); if (i > 0) { [L.stations[i - 1], L.stations[i]] = [L.stations[i], L.stations[i - 1]]; save(); renderAdmin(); } });
    $$('[data-dn]', body).forEach((b) => b.onclick = () => { const i = Number(b.dataset.dn); if (i < L.stations.length - 1) { [L.stations[i + 1], L.stations[i]] = [L.stations[i], L.stations[i + 1]]; save(); renderAdmin(); } });
    $$('[data-rm]', body).forEach((b) => b.onclick = () => { L.stations.splice(Number(b.dataset.rm), 1); save(); renderAdmin(); });
    $$('[data-si]', body).forEach((el) => el.onclick = (e) => { if (e.target.tagName !== 'DIV' && e.target.tagName !== 'I') return; const s = L.stations[Number(el.dataset.si)]; E.sel = Number(el.dataset.si); E.view.cx = s.x; E.view.cz = s.z; E.view.sc = Math.max(E.view.sc, 0.35); renderAdmin(); });
    $('#mt-rev').onclick = () => { L.stations.reverse(); save(); renderAdmin(); };
    $('#mt-delline').onclick = async () => { if ((await modal(`<p><b>${esc(L.name)}</b> 노선을 없앨까요?</p>`, [{ label: '취소' }, { label: '없애기', primary: true }])) !== 1) return; lines.splice(E.li, 1); E.li = 0; save(); renderAdmin(); };
  }
  $('#mt-apply').onclick = () => {
    const bad = lines.find((x) => x.stations.length === 1);
    if (bad) return modal(`<p>${esc(bad.name)}은 역이 1개뿐이에요. 2개 이상이어야 다닐 수 있어요.</p>`);
    app.transit.build(app.transit.scene, lines.filter((x) => x.stations.length >= 2));
    log(`🚇 지하철 개편 적용 — 노선 ${lines.length}개 · 역 ${lines.reduce((a, x) => a + x.stations.length, 0)}곳`, 'good');
    save(); renderAdmin();
  };
  $('#mt-resetdef').onclick = async () => { if ((await modal('<p>지하철을 처음 1호선으로 되돌릴까요?</p>', [{ label: '취소' }, { label: '되돌리기', primary: true }])) !== 1) return; A.metro.lines = null; app.transit.build(app.transit.scene, null); metroLines(); E.li = 0; save(); renderAdmin(); };
  // 지도 조작: 클릭(추가·삭제), 끌기(역 옮기기 / 지도 이동), 휠(확대)
  let down = null;
  cv.onpointerdown = (e) => { const w = toW(e); const i = pickSt(w); down = { x: e.clientX, y: e.clientY, w, i, cx: E.view.cx, cz: E.view.cz, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
    if (!down.moved) return;
    if (E.mode === 'move' && down.i >= 0 && L) { const w = toW(e); L.stations[down.i].x = Math.round(w.x); L.stations[down.i].z = Math.round(w.z); }
    else { const rc = cv.getBoundingClientRect(), k = cv.width / rc.width; E.view.cx = down.cx + ((e.clientX - down.x) * k) / E.view.sc; E.view.cz = down.cz + ((e.clientY - down.y) * k) / E.view.sc; }
  };
  cv.onpointerup = () => {
    const d = down; down = null; if (!d || !L) return;
    if (d.moved) { if (E.mode === 'move' && d.i >= 0) { save(); renderAdmin(); } return; }
    if (E.mode === 'add') { if (!paidNew()) return; L.stations.push({ name: nameFor(d.w), x: Math.round(d.w.x), z: Math.round(d.w.z) }); log(`🚇 ${L.name} 새 역 계획: ${L.stations[L.stations.length - 1].name}`); }
    else if (E.mode === 'ins') {
      if (L.stations.length < 2) { if (!paidNew()) return; L.stations.push({ name: nameFor(d.w), x: Math.round(d.w.x), z: Math.round(d.w.z) }); }
      else {
        let bi = 0, bd = 1e9;
        for (let i = 0; i < L.stations.length - 1; i++) { const a = L.stations[i], b = L.stations[i + 1]; const dd = segD(d.w.x, d.w.z, a.x, a.z, b.x, b.z); if (dd < bd) { bd = dd; bi = i; } }
        if (!paidNew()) return;
        L.stations.splice(bi + 1, 0, { name: nameFor(d.w), x: Math.round(d.w.x), z: Math.round(d.w.z) });
      }
    } else if (E.mode === 'del' && d.i >= 0) L.stations.splice(d.i, 1);
    else if (d.i >= 0) E.sel = d.i;
    save(); renderAdmin();
  };
  cv.onwheel = (e) => { e.preventDefault(); E.view.sc = clamp(E.view.sc * (e.deltaY > 0 ? 0.88 : 1.14), 0.05, 3); };
  const loop = () => {
    if (!$('#mt-map')) return;
    const v = view();
    drawCityMap(cv, v, { names: true, pois: true });
    const g = cv.getContext('2d');
    lines.forEach((x, li) => {
      g.globalAlpha = li === E.li ? 1 : 0.55;
      g.strokeStyle = x.color; g.lineWidth = li === E.li ? 6 : 4; g.lineJoin = 'round'; g.beginPath();
      x.stations.forEach((s, i) => (i ? g.lineTo(v.X(s.x), v.Y(s.z)) : g.moveTo(v.X(s.x), v.Y(s.z)))); g.stroke();
      x.stations.forEach((s, i) => {
        g.fillStyle = '#fff'; g.strokeStyle = x.color; g.lineWidth = 3; g.beginPath(); g.arc(v.X(s.x), v.Y(s.z), li === E.li && i === E.sel ? 10 : 7, 0, Math.PI * 2); g.fill(); g.stroke();
        if (li === E.li || v.sc > 0.3) { g.fillStyle = '#fff'; g.font = '800 12px "Noto Sans KR", sans-serif'; g.textAlign = 'left'; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3; g.strokeText(s.name, v.X(s.x) + 10, v.Y(s.z) + 4); g.fillText(s.name, v.X(s.x) + 10, v.Y(s.z) + 4); }
      });
    });
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(8, 8, 330, 26); g.fillStyle = '#fff'; g.font = '700 13px sans-serif'; g.textAlign = 'left';
    g.fillText({ add: '지도를 누르면 노선 끝에 역이 생겨요', ins: '지도를 누르면 가장 가까운 두 역 사이에 끼워요', move: '역을 끌어서 옮겨요 (빈 곳 끌기 = 지도 이동)', del: '지울 역을 누르세요' }[E.mode] || '', 16, 26);
    liveRaf = requestAnimationFrame(loop);
  };
  loop();
}
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const t = clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
