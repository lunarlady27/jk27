import * as THREE from 'three';
import { drawCityMap, mapView, cityBox } from './mapdraw.js';
import { SUBWAY, nextArrivals } from './subway.js';
import { DISTRICTS, BRANDS, ALL, BY_ID, PAINTS, WHEELS, LIVERIES, LIVERY_BY_ID, COMPANIES, COMPANY_INFO, ROUTES, ROUTE_COLORS, BUS_TYPES, OPTIONS, OPT_BY_ID, trimStd, PT_NAME } from './data.js';
import { S, save, newOwned, ownedBy, hasOpt, trimName, exportCode, importCode, cloudStatus } from './state.js';
import { buildVehicle, buildAvatar, AVATAR_OPTS } from './models.js';
import { ensureQuests, timeLeft } from './quests.js';
import { won, clamp } from './util.js';
import { MODES } from './missions.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEATHER_LIST } from './env.js';
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let app = null;
let current = 'title';

// ===== 3D 미리보기 =====
class Preview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.env = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445566, 1.1));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(6, 10, 8); d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024); Object.assign(d.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); d.shadow.camera.updateProjectionMatrix();
    this.scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.8, 9, 64), new THREE.MeshBasicMaterial({ color: 0x36d1c4 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
    this.yaw = 0.7; this.pitch = 0.25; this.auto = true; this.obj = null; this.running = false;
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.auto = false; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (!drag) return; this.yaw -= (e.clientX - drag.x) * 0.01; this.pitch = clamp(this.pitch + (e.clientY - drag.y) * 0.005, 0.02, 0.9); drag = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
  }
  mount(el) { el.appendChild(this.canvas); this.resize(); this.start(); }
  resize() { const r = this.canvas.parentElement?.getBoundingClientRect(); if (!r || !r.width) return; this.renderer.setSize(r.width, r.height, false); this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix(); }
  show(spec, opts) {
    if (this.obj) {
      this.scene.remove(this.obj.group);
      this.obj.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
    this.obj = buildVehicle(spec, { ...opts });
    // 다른 렌더러용 반사맵으로 재질 복제
    this.obj.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material && o.material.envMap) { o.material = o.material.clone(); o.material.envMap = this.env; } } });
    this.scene.add(this.obj.group);
    this.dist = Math.max(spec.len * 1.15, 4) + 3;
    this.spec = spec;
    if (this.av) this.scene.remove(this.av);
    this.av = buildAvatar(S.avatar);
    this.av.position.set(-(spec.wid / 2 + 1.1), 0, spec.len * 0.18); this.av.rotation.y = -0.5;
    this.scene.add(this.av);
  }
  showAvatar(opts) {
    if (this.obj) { this.scene.remove(this.obj.group); this.obj = null; }
    if (this.av) this.scene.remove(this.av);
    this.av = buildAvatar(opts); this.scene.add(this.av);
    this.obj = { group: new THREE.Group() }; this.scene.add(this.obj.group);
    this.spec = { hei: 1.9, len: 0.6 }; this.dist = 4.2;
  }
  start() { if (this.running) return; this.running = true; const loop = () => { if (!this.running) return; requestAnimationFrame(loop); this.render(); }; loop(); }
  stop() { this.running = false; }
  render() {
    if (!this.obj) return;
    if (this.auto) this.yaw += 0.004;
    this.resize();
    const h = this.spec ? this.spec.hei * 0.5 : 0.7;
    this.camera.position.set(Math.sin(this.yaw) * this.dist * Math.cos(this.pitch), h + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * this.dist * Math.cos(this.pitch));
    this.camera.lookAt(0, h * 0.8, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
let preview = null;

// ===== 공통 =====
export function show(id) {
  current = id;
  $$('.screen').forEach((s) => s.classList.toggle('show', s.id === 's-' + id));
  if (preview && !['shop', 'garage', 'busgarage', 'char'].includes(id)) preview.stop();
  const fn = RENDER[id]; if (fn) fn();
}
export const currentScreen = () => current;
export function hideAll() { $$('.screen').forEach((s) => s.classList.remove('show')); current = null; if (preview) preview.stop(); }

export function modal(html, buttons = [{ label: '확인', primary: true }]) {
  return new Promise((res) => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-card">${html}<div class="modal-btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}">${b.label}</button>`).join('')}</div></div>`;
    m.classList.remove('hidden');
    $$('button[data-i]', m).forEach((b) => b.onclick = () => { m.classList.add('hidden'); res(Number(b.dataset.i)); });
  });
}
const confirmBox = (html) => modal(html, [{ label: '취소' }, { label: '확인', primary: true }]).then((i) => i === 1);

function specBars(spec, own) {
  const t = own?.tune || { engine: 0, brake: 0, handling: 0 };
  const vmax = spec.vmax * (1 + 0.03 * t.engine);
  const acc = spec.acc / (1 + 0.08 * t.engine);
  const brake = (spec.type === 'bus' ? 5 : 8.6) * (1 + 0.1 * t.brake);
  const bar = (label, v, txt) => `<div class="bar"><span>${label}</span><i><b style="width:${Math.round(clamp(v, 0.04, 1) * 100)}%"></b></i><em>${txt}</em></div>`;
  return `<div class="bars">
    ${bar('최고속도', vmax / 300, Math.round(vmax) + ' km/h')}
    ${bar('가속력', (20 - acc) / 18, '0→100 ' + acc.toFixed(1) + '초')}
    ${bar('제동력', brake / 10, '100→0 ' + Math.round((27.8 * 27.8) / (2 * brake)) + 'm')}
    ${bar('회전', (12 - spec.turnR) / 8, '회전반경 ' + spec.turnR + 'm')}
    ${bar('무게', spec.mass / 13000, spec.mass.toLocaleString() + ' kg')}
    ${bar('크기', spec.len / 12.5, `${spec.len}×${spec.wid}×${spec.hei}m`)}
  </div>`;
}
const brandName = (id) => BRANDS.find((b) => b.id === id)?.name || id;
const vehTitle = (spec) => `${brandName(spec.brand)} ${spec.name}`;
function refreshMoney() { $$('.money-now').forEach((e) => (e.textContent = won(S.money))); }

// ===== 화면별 렌더 =====
const RENDER = {
  title() {
    const own = ownedBy(S.current); const spec = own && BY_ID[own.id];
    $('#t-money').textContent = won(S.money);
    $('#t-name').textContent = S.mp.name;
    $('#t-car').textContent = spec ? vehTitle(spec) : '-';
    $('#t-kind').textContent = spec ? `${spec.cls} · ${S.owned.indexOf(own) + 1} / ${S.owned.length}대 보유` : '';
    $('#t-plate').textContent = own ? own.plate : '';
    const step = (d) => { const i = S.owned.indexOf(ownedBy(S.current)); const n = S.owned[(i + d + S.owned.length) % S.owned.length]; S.current = n.uid; save(); app.onVehicleChanged?.(); RENDER.title(); };
    $('#t-prev').onclick = () => step(-1); $('#t-next').onclick = () => step(1);
    $('#t-garage').onclick = () => show(spec && spec.type === 'bus' ? 'busgarage' : 'garage');
    const Q = ensureQuests(S); const left = Q.list.filter((q) => q.done && !q.claimed).length;
    $('#t-quest').textContent = left ? `보상 ${left}개 받기!` : `${timeLeft()} 남음`;
    // 환영 말풍선: 잠깐 보였다가 사라짐
    const bub = $('#t-bubble');
    if (bub && !RENDER._bubbled) { RENDER._bubbled = true; bub.classList.remove('gone'); setTimeout(() => bub.classList.add('gone'), 6000); }
    // 차 선택: 내가 가진 차 목록
    $('#t-pick').onclick = async () => {
      const html = `<h3>🚗 차 선택 <small class="muted">${S.owned.length}대 보유</small></h3><div class="pick-grid">${S.owned.map((o) => { const sp = BY_ID[o.id]; return `<button class="pick ${o.uid === S.current ? 'sel' : ''}" data-u="${o.uid}"><i style="background:${o.color}"></i><b>${esc(vehTitle(sp))}</b><small>${esc(sp.cls)} · ${esc(o.plate)}</small></button>`; }).join('')}</div>`;
      const m = $('#modal');
      m.innerHTML = `<div class="modal-card wide">${html}<div class="modal-btns"><button data-x="0">닫기</button><button data-x="shop" class="primary">자동차 상점</button></div></div>`;
      m.classList.remove('hidden');
      $$('.pick', m).forEach((b) => b.onclick = () => { S.current = Number(b.dataset.u); save(); app.onVehicleChanged?.(); m.classList.add('hidden'); RENDER.title(); });
      $('[data-x="0"]', m).onclick = () => m.classList.add('hidden');
      $('[data-x="shop"]', m).onclick = () => { m.classList.add('hidden'); show('shop'); };
    };
  },
  modes() {
    $('#modes-grid').innerHTML = MODES.map((m) => `<button class="mode-card" data-mode="${m.id}"><span class="mi">${m.icon}</span><b>${m.name}</b><small>${m.desc}</small><em>${m.veh === 'bus' ? '버스 필요 · 회사 버스 제공' : m.veh === 'car' ? '승용차' : '현재 차량 사용'}</em></button>`).join('');
    $$('#modes-grid .mode-card').forEach((b) => b.onclick = () => {
      const m = MODES.find((x) => x.id === b.dataset.mode);
      if (m.veh === 'bus') return busSetup(m.id);
      app.startMode(m.id, {});
    });
  },
  shop() { renderShop(); },
  garage() { renderGarage('car'); },
  busgarage() { renderGarage('bus'); },
  map() { renderMap(); },
  settings() { renderSettings(); },
  pause() { refreshMoney(); },
  exit() { save(); },
  mp() { renderMp(); },
  char() { renderChar(); },
  quest() { renderQuest(); },
  help() {},
};

// ===== 버스 운행 준비 =====
let busPick = { route: ROUTES[0].id, bus: 'company', type: 'all' };
function busSetup(modeId) {
  current = 'bussetup';
  $$('.screen').forEach((s) => s.classList.toggle('show', s.id === 's-bussetup'));
  const mode = MODES.find((m) => m.id === modeId);
  $('#bs-title').textContent = mode.name;
  const buses = S.owned.filter((o) => BY_ID[o.id].type === 'bus');
  const routes = () => (app.W ? [...app.W.routes, ...(app.W.pendingRoutes || []).filter((r) => !app.W.routes.some((x) => x.id === r.id))] : ROUTES);
  const coName = (r) => app.companyName ? app.companyName(r) : (COMPANY_INFO.find((c) => c.id === r.company) || COMPANY_INFO[0]).name;
  const draw = () => {
    const all = routes();
    if (!all.find((r) => r.id === busPick.route)) busPick.route = all[0].id;
    const sel = all.find((r) => r.id === busPick.route);
    const T = BUS_TYPES[sel.type] || BUS_TYPES.trunk;
    const model = (app.routeModel && app.routeModel(sel)) || T.models[0];
    const tabs = [['all', '전체', '#36d1c4'], ...Object.entries(BUS_TYPES).map(([k, v]) => [k, v.ko, v.color])];
    $('#bs-routes').innerHTML = `<div class="tabs rtabs">${tabs.map(([k, n, c]) => `<button class="${busPick.type === k ? 'sel' : ''}" data-t="${k}"><i style="background:${c}"></i>${n} <small>${k === 'all' ? all.length : all.filter((r) => r.type === k).length}</small></button>`).join('')}</div>
      <div class="rlist">${all.filter((r) => busPick.type === 'all' || r.type === busPick.type).map((r) => `<button class="route-row ${busPick.route === r.id ? 'sel' : ''}" data-r="${r.id}"><span class="rno" style="background:${r.color}">${r.id}</span><span><b>${r.name}${r.custom ? ' <em class="tag">내 노선</em>' : ''}</b><small>${r.dest}</small><small class="rmeta">${r.regionName && !r.stops ? `🗺️ ${r.regionName} — 고르면 ${r.regionName} 지도를 받아요 · ` : r.regionName ? `${r.regionName} · ` : ''}${BUS_TYPES[r.type]?.ko || ''} · 정류장 ${r.stops ? r.stops.length : '-'}곳 · ${r.len ? (r.len / 1000).toFixed(1) + 'km' : ''} · ${coName(r)}</small></span></button>`).join('')}</div>`;
    $('#bs-buses').innerHTML = `<div class="tip">🚌 <b>${T.ko}버스</b> — ${T.desc}${T.stopEvery > 1 ? '<br>⚡ 급행·좌석은 주요 정류장에만 서요.' : ''}</div>` + [`<button class="route-row ${busPick.bus === 'company' ? 'sel' : ''}" data-b="company"><span class="rno" style="background:${T.color}">회사</span><span><b>${coName(sel)} 배차 버스 · ${vehTitle(BY_ID[model])}</b><small>노선 유형에 맞는 회사 버스로 무료 운행</small></span></button>`,
      ...buses.map((o) => `<button class="route-row ${busPick.bus === o.uid ? 'sel' : ''}" data-b="${o.uid}"><span class="rno" style="background:${LIVERY_BY_ID[o.livery]?.top || '#555'}">내꺼</span><span><b>${vehTitle(BY_ID[o.id])}</b><small>${o.plate} · ${o.company}</small></span></button>`)].join('');
    $$('#bs-routes [data-t]').forEach((b) => b.onclick = () => { busPick.type = b.dataset.t; draw(); });
    $$('#bs-routes [data-r]').forEach((b) => b.onclick = () => { busPick.route = b.dataset.r; draw(); });
    $$('#bs-buses [data-b]').forEach((b) => b.onclick = () => { busPick.bus = b.dataset.b === 'company' ? 'company' : Number(b.dataset.b); draw(); });
  };
  draw();
  $('#bs-start').onclick = () => app.startMode(modeId, { route: busPick.route, bus: busPick.bus });
}

// ===== 판매점 =====
let shopBrand = 'hanbit', shopSel = null, compare = [], shopCfg = { trim: 0, opts: [] };
function renderShop() {
  refreshMoney();
  $('#shop-brands').innerHTML = `<div class="sec">승용차 전시장</div>` + BRANDS.filter((b) => b.kind === 'car').map(brandBtn).join('') + `<div class="sec">버스 전시장</div>` + BRANDS.filter((b) => b.kind === 'bus').map(brandBtn).join('');
  function brandBtn(b) { return `<button class="brand ${shopBrand === b.id ? 'sel' : ''}" data-b="${b.id}"><i style="background:${b.color}">${b.en[0]}</i><span><b>${b.name}</b><small>${b.note}</small></span></button>`; }
  $$('#shop-brands .brand').forEach((x) => x.onclick = () => { shopBrand = x.dataset.b; shopSel = null; renderShop(); });
  const list = ALL.filter((v) => v.brand === shopBrand && !v.hidden);
  if (!shopSel || shopSel.brand !== shopBrand) { shopSel = list[0]; shopCfg = { trim: 0, opts: [] }; }
  $('#shop-list').innerHTML = list.map((v) => {
    const owned = S.owned.some((o) => o.id === v.id);
    return `<button class="vcard ${shopSel.id === v.id ? 'sel' : ''}" data-v="${v.id}"><b>${v.name}</b><small>${v.cls}${v.ev ? ' · ⚡전기' : ''}</small><small class="ref">${v.trims ? `트림 ${v.trims.length}개${v.hasHybrid ? ' · <span class="ptag k-hev">하이브리드</span>' : ''}${v.kinds && v.kinds.includes('diesel') ? ' · 디젤' : ''}` : '모티브: ' + v.ref}</small><em>${won(v.price)}${v.trims && v.trims.length > 1 ? '~' : ''}</em>${owned ? '<span class="badge">보유</span>' : ''}</button>`;
  }).join('');
  $$('#shop-list .vcard').forEach((x) => x.onclick = () => { shopSel = BY_ID[x.dataset.v]; shopCfg = { trim: 0, opts: [] }; renderShop(); });
  const v = shopSel;
  const isCar = v.type === 'car' && v.trims;
  const std = isCar ? trimStd(v, shopCfg.trim) : [];
  shopCfg.opts = shopCfg.opts.filter((o) => !std.includes(o));
  const total = isCar ? v.trims[shopCfg.trim].p + shopCfg.opts.reduce((a, o) => a + OPT_BY_ID[o].price, 0) : v.price;
  $('#shop-detail').innerHTML = `
    <div class="pv" id="shop-pv"></div>
    <div class="dt-head"><div><h2>${vehTitle(v)}</h2><p>${v.cls}${isCar ? ' · ' + v.ref : ' · 모티브: ' + v.ref}${v.type === 'bus' ? (v.low ? ' · 저상(바닥 낮음)' : ' · 고상(계단 있음)') : ''}</p></div><div class="price">${won(total)}</div></div>
    ${isCar ? `<div class="trimbox"><div class="tb-h">① 트림 고르기</div>${[...new Set(v.trims.map((t) => t.pt))].map((pt) => { const k = v.trims.find((t) => t.pt === pt).kind; return `<div class="ptrow"><span class="ptag k-${k}">${PT_NAME[k] || pt}</span><small>${pt}</small></div><div class="trims">${v.trims.map((t, i) => (t.pt !== pt ? '' : `<button class="${shopCfg.trim === i ? 'sel' : ''}" data-ti="${i}"><b>${t.n}</b><small>${won(t.p)}</small></button>`)).join('')}</div>`; }).join('')}
      <div class="tb-h">② 옵션 고르기 <small>(✔ 기본 포함은 이 트림에 이미 들어 있어요 · 옵션 가격은 게임용)</small></div>
      <div class="optlist">${OPTIONS.map((o) => { const inc = std.includes(o.id), on = inc || shopCfg.opts.includes(o.id); return `<label class="opt ${on ? 'on' : ''} ${inc ? 'inc' : ''}"><input type="checkbox" data-o="${o.id}" ${on ? 'checked' : ''} ${inc ? 'disabled' : ''}><span class="oi">${o.icon}</span><span><b>${o.name}</b><small>${o.desc}</small></span><em>${inc ? '기본 포함' : '+' + won(o.price)}</em></label>`; }).join('')}</div>
      <div class="tb-sum">트림 ${won(v.trims[shopCfg.trim].p)} + 옵션 ${won(total - v.trims[shopCfg.trim].p)} = <b>${won(total)}</b></div></div>` : ''}
    ${specBars(v)}
    <div class="dt-btns"><button class="primary" id="buy">구매하기</button><button id="cmp">${compare.includes(v.id) ? '비교에서 빼기' : '성능 비교에 담기'}</button></div>`;
  if (!preview) preview = new Preview();
  preview.mount($('#shop-pv'));
  preview.show(v, { color: v.type === 'bus' ? undefined : '#1c3a72', livery: v.livery, route: v.type === 'bus' ? '000' : undefined, dest: '빛고을 판매점', routeColor: '#22bfb0' });
  $$('#shop-detail [data-ti]').forEach((b) => b.onclick = () => { shopCfg.trim = Number(b.dataset.ti); renderShop(); });
  $$('#shop-detail [data-o]').forEach((c) => c.onchange = () => { const id = c.dataset.o; shopCfg.opts = c.checked ? [...shopCfg.opts, id] : shopCfg.opts.filter((x) => x !== id); renderShop(); });
  $('#buy').onclick = async () => {
    const what = isCar ? `${vehTitle(v)} ${v.trims[shopCfg.trim].pt} ${v.trims[shopCfg.trim].n}` : vehTitle(v);
    const optTxt = isCar && shopCfg.opts.length ? `<p class="muted">옵션: ${shopCfg.opts.map((o) => OPT_BY_ID[o].name).join(', ')}</p>` : '';
    if (S.money < total) return modal(`<h3>돈이 부족해요</h3><p>${won(total - S.money)}이 더 필요해요.<br>버스 운전 모드나 미션으로 돈을 모아 보세요!</p>`);
    if (!(await confirmBox(`<h3>${what}</h3>${optTxt}<p>${won(total)}에 구매할까요?</p><p class="muted">구매 후 남는 돈: ${won(S.money - total)}</p>`))) return;
    S.money -= total;
    const o = newOwned(v.id, { color: v.type === 'bus' ? '#ffffff' : '#eeeeec', trim: isCar ? shopCfg.trim : 0, opts: isCar ? [...shopCfg.opts] : [], paid: total });
    S.owned.push(o); S.current = o.uid; save();
    app.audio?.coin();
    await modal(`<h3>🎉 구매 완료!</h3><p>${vehTitle(v)}이(가) ${v.type === 'bus' ? '버스 차고' : '내 차고'}에 들어왔어요.<br>번호판: <b>${o.plate}</b></p>`);
    renderShop();
  };
  $('#cmp').onclick = () => {
    if (compare.includes(v.id)) compare = compare.filter((x) => x !== v.id);
    else { compare.push(v.id); if (compare.length > 3) compare.shift(); }
    renderShop();
  };
  $('#compare-bar').innerHTML = compare.length ? `<span>비교함:</span>${compare.map((id) => `<b>${BY_ID[id].name}</b>`).join('')}<button class="primary" id="cmp-go">성능 비교 (${compare.length})</button><button id="cmp-clear">비우기</button>` : '<span class="muted">차량 2~3대를 비교함에 담으면 성능을 나란히 비교할 수 있어요</span>';
  if (compare.length) {
    $('#cmp-go').onclick = () => {
      const vs = compare.map((id) => BY_ID[id]);
      const row = (label, f) => `<tr><th>${label}</th>${vs.map((x) => `<td>${f(x)}</td>`).join('')}</tr>`;
      modal(`<h3>차량별 성능 비교</h3><table class="cmp"><tr><th></th>${vs.map((x) => `<th>${x.name}</th>`).join('')}</tr>
        ${row('가격', (x) => won(x.price))}${row('최고속도', (x) => x.vmax + ' km/h')}${row('0→100km/h', (x) => x.acc + '초')}
        ${row('출력', (x) => x.hp + ' 마력')}${row('무게', (x) => x.mass.toLocaleString() + ' kg')}${row('회전반경', (x) => x.turnR + ' m')}
        ${row('제동거리(100→0)', (x) => Math.round((27.8 * 27.8) / (2 * (x.type === 'bus' ? 5 : 8.6))) + ' m')}${row('크기', (x) => `${x.len}×${x.wid}×${x.hei}`)}${row('연료', (x) => (x.ev ? '전기' : x.cng ? 'CNG' : x.type === 'bus' ? '디젤' : '가솔린'))}</table>`);
    };
    $('#cmp-clear').onclick = () => { compare = []; renderShop(); };
  }
}

// ===== 차고 =====
let garageSel = {}, garageTab = 'info';
function renderGarage(type) {
  refreshMoney();
  const scr = type === 'bus' ? 'busgarage' : 'garage';
  const root = $(`#s-${scr} .garage`);
  const list = S.owned.filter((o) => BY_ID[o.id].type === type);
  if (!list.length) {
    root.innerHTML = `<div class="empty"><p>${type === 'bus' ? '아직 보유한 버스가 없어요.<br>버스 운전 모드에서는 회사 버스를 무료로 운행할 수 있어요!' : '보유한 차가 없어요.'}</p><button class="primary" data-go="shop">🏬 판매점 가기</button></div>`;
    bindGo(root); return;
  }
  let sel = ownedBy(garageSel[type]) || list.find((o) => o.uid === S.current) || list[0];
  garageSel[type] = sel.uid;
  const spec = BY_ID[sel.id];
  const tabs = type === 'bus' ? [['info', '기본'], ['livery', '도색'], ['plate', '번호판'], ['tune', '튜닝']] : [['info', '기본'], ['opt', '옵션'], ['paint', '색상'], ['wheel', '휠'], ['plate', '번호판'], ['tune', '튜닝']];
  if (!tabs.find((t) => t[0] === garageTab)) garageTab = 'info';
  const tuneVal = (o) => o.tune.engine + o.tune.brake + o.tune.handling;
  const basePrice = sel.paid || (spec.trims ? spec.trims[sel.trim || 0].p : spec.price);
  const sellPrice = Math.round(basePrice * 0.6 + tuneVal(sel) * spec.price * 0.02);
  root.innerHTML = `
    <div class="g-list">${list.map((o) => `<button class="vcard ${o.uid === sel.uid ? 'sel' : ''}" data-u="${o.uid}"><b>${BY_ID[o.id].name}</b><small>${brandName(BY_ID[o.id].brand)}</small><small class="ref">${o.plate}</small>${o.uid === S.current ? '<span class="badge">운전 중</span>' : ''}</button>`).join('')}</div>
    <div class="g-main">
      <div class="pv" id="g-pv"></div>
      <div class="dt-head"><div><h2>${vehTitle(spec)} ${trimName(sel)}</h2><p>${spec.cls} · ${sel.plate}${type === 'car' ? ' · 옵션 ' + OPTIONS.filter((o) => hasOpt(sel, o.id)).map((o) => o.icon).join('') : ''}</p></div><button class="primary" id="g-drive">${sel.uid === S.current ? '✔ 운전할 차량' : '이 차로 운전하기'}</button></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${garageTab === k ? 'sel' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <div class="tab-body" id="g-body"></div>
    </div>`;
  $$('.g-list .vcard', root).forEach((b) => b.onclick = () => { garageSel[type] = Number(b.dataset.u); renderGarage(type); });
  $$('.tabs button', root).forEach((b) => b.onclick = () => { garageTab = b.dataset.t; renderGarage(type); });
  $('#g-drive').onclick = () => { S.current = sel.uid; save(); renderGarage(type); app.onVehicleChanged?.(); };
  if (!preview) preview = new Preview();
  preview.mount($('#g-pv'));
  preview.show(spec, { color: sel.color, wheel: sel.wheel, plate: sel.plate, livery: sel.livery, company: sel.company, route: '회송', dest: '차고지', routeColor: '#555' });
  const body = $('#g-body');
  const pay = async (cost, what, fn) => {
    if (S.money < cost) return modal(`<h3>돈이 부족해요</h3><p>${what}에 ${won(cost)}이 필요해요.</p>`);
    if (cost > 0 && !(await confirmBox(`<p>${what} — ${won(cost)}</p>`))) return;
    S.money -= cost; fn(); save(); app.onVehicleChanged?.(); renderGarage(type);
  };
  if (garageTab === 'info') {
    body.innerHTML = `${specBars(spec, sel)}<div class="dt-btns"><button class="danger" id="g-sell">판매하기 (${won(sellPrice)})</button></div>`;
    $('#g-sell').onclick = async () => {
      if (S.owned.length <= 1) return modal('<p>마지막 한 대는 팔 수 없어요.</p>');
      if (!(await confirmBox(`<h3>${vehTitle(spec)} 판매</h3><p>${won(sellPrice)}에 팔까요?</p>`))) return;
      S.money += sellPrice; S.owned = S.owned.filter((o) => o.uid !== sel.uid);
      if (S.current === sel.uid) S.current = S.owned[0].uid;
      delete garageSel[type]; save(); app.onVehicleChanged?.(); renderGarage(type);
    };
  } else if (garageTab === 'opt') {
    const std = trimStd(spec, sel.trim || 0);
    body.innerHTML = `<div class="optlist">${OPTIONS.map((o) => { const inc = std.includes(o.id), on = hasOpt(sel, o.id); return `<div class="opt ${on ? 'on' : ''} ${inc ? 'inc' : ''}"><span class="oi">${o.icon}</span><span><b>${o.name}</b><small>${o.desc}</small></span>${on ? `<em>${inc ? '트림 기본' : '장착됨'}</em>${!inc ? `<button data-rm="${o.id}">떼기</button>` : ''}` : `<button class="primary" data-add="${o.id}">달기 ${won(Math.round(o.price * 1.2))}</button>`}</div>`; }).join('')}</div><p class="muted">구매 후에 다는 옵션은 출고 때보다 20% 비싸요 (공임 포함). 떼어도 환불은 없어요.</p>`;
    $$('[data-add]', body).forEach((b) => b.onclick = () => { const o = OPT_BY_ID[b.dataset.add]; pay(Math.round(o.price * 1.2), o.name + ' 장착', () => { sel.opts = [...(sel.opts || []), o.id]; }); });
    $$('[data-rm]', body).forEach((b) => b.onclick = () => { sel.opts = (sel.opts || []).filter((x) => x !== b.dataset.rm); save(); app.onVehicleChanged?.(); renderGarage(type); });
  } else if (garageTab === 'paint') {
    body.innerHTML = `<div class="swatches">${PAINTS.map((p) => `<button class="sw ${sel.color === p.hex ? 'sel' : ''}" data-c="${p.hex}" style="background:${p.hex}" title="${p.name}"></button>`).join('')}<label class="sw custom">직접 고르기<input type="color" id="g-color" value="${sel.color}"></label></div><p class="muted">색상 변경 비용: ${won(500000)}</p>`;
    $$('.sw[data-c]', body).forEach((b) => b.onclick = () => pay(500000, '도색', () => (sel.color = b.dataset.c)));
    $('#g-color').onchange = (e) => pay(500000, '맞춤 도색', () => (sel.color = e.target.value));
  } else if (garageTab === 'wheel') {
    body.innerHTML = `<div class="opts">${WHEELS.map((w) => `<button class="${sel.wheel === w.id ? 'sel' : ''}" data-w="${w.id}"><b>${w.name}</b><small>${w.price ? won(w.price) : '무료'}</small></button>`).join('')}</div>`;
    $$('[data-w]', body).forEach((b) => b.onclick = () => { const w = WHEELS.find((x) => x.id === b.dataset.w); pay(w.price, w.name + ' 장착', () => (sel.wheel = w.id)); });
  } else if (garageTab === 'livery') {
    body.innerHTML = `<div class="opts">${LIVERIES.map((l) => `<button class="${sel.livery === l.id ? 'sel' : ''}" data-l="${l.id}"><i class="chip" style="background:linear-gradient(${l.top} 50%, ${l.mid} 50%)"></i><b>${l.name}</b></button>`).join('')}</div>
      <div class="row"><label>버스 회사 <select id="g-company">${(app.companyNames ? app.companyNames() : COMPANIES).map((c) => `<option ${sel.company === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div><p class="muted">도색 변경 비용: ${won(2000000)}</p>`;
    $$('[data-l]', body).forEach((b) => b.onclick = () => pay(2000000, '버스 도색', () => (sel.livery = b.dataset.l)));
    $('#g-company').onchange = (e) => { sel.company = e.target.value; save(); renderGarage(type); };
  } else if (garageTab === 'plate') {
    body.innerHTML = `<div class="row"><input id="g-plate" value="${sel.plate}" maxlength="10"><button id="g-rand">무작위</button><button class="primary" id="g-pset">변경 (${won(100000)})</button></div><p class="muted">${type === 'bus' ? '영업용 노란 번호판 · 예) 70아 1234' : '예) 123가 4567'} ${spec.ev ? '· 전기차는 하늘색 번호판' : ''}</p>`;
    $('#g-rand').onclick = () => { $('#g-plate').value = (type === 'bus' ? `${70 + Math.floor(Math.random() * 9)}${'바사아자'[Math.floor(Math.random() * 4)]}` : `${100 + Math.floor(Math.random() * 299)}${'가나다라마거너더러머버서어저'[Math.floor(Math.random() * 14)]}`) + ' ' + (1000 + Math.floor(Math.random() * 9000)); };
    $('#g-pset').onclick = () => {
      const v = $('#g-plate').value.trim();
      if (!/^\d{2,3}\s?[가-힣]\s?\d{4}$/.test(v)) return modal('<p>번호판 형식이 맞지 않아요. 예) 123가 4567</p>');
      pay(100000, '번호판 변경', () => (sel.plate = v.replace(/^(\d{2,3})\s?([가-힣])\s?(\d{4})$/, '$1$2 $3')));
    };
  } else if (garageTab === 'tune') {
    const base = Math.round(spec.price * (type === 'bus' ? 0.02 : 0.04));
    const names = { engine: ['엔진', '출력·최고속도 ↑'], brake: ['브레이크', '제동거리 ↓'], handling: ['서스펜션·타이어', '코너링·접지력 ↑'] };
    body.innerHTML = `<div class="tunes">${Object.keys(names).map((k) => `<div class="tune"><b>${names[k][0]}</b><small>${names[k][1]}</small><div class="lv">${[1, 2, 3].map((l) => `<i class="${sel.tune[k] >= l ? 'on' : ''}"></i>`).join('')}</div><button ${sel.tune[k] >= 3 ? 'disabled' : ''} data-k="${k}">${sel.tune[k] >= 3 ? '최고 단계' : '업그레이드 ' + won(base * (sel.tune[k] + 1))}</button></div>`).join('')}</div>`;
    $$('[data-k]', body).forEach((b) => b.onclick = () => { const k = b.dataset.k; pay(base * (sel.tune[k] + 1), names[k][0] + ' 튜닝', () => sel.tune[k]++); });
  }
}

// ===== 맵 선택 =====
function renderMap() {
  const W = app.W;
  const thumbs = app.thumbs ? app.thumbs() : {};
  let dist = DISTRICTS.find((d) => d.spawns.includes(S.world.spawn)) || DISTRICTS[0];
  $('#map-districts').innerHTML = DISTRICTS.map((d) => `<button class="dcard ${d === dist ? 'sel' : ''}" data-d="${d.id}"><div class="en">${d.en}</div><div class="img" style="background-image:url(${thumbs[d.id] || ''})"></div><div class="ko">${d.ko}</div><small>${d.desc}</small></button>`).join('');
  $$('#map-districts .dcard').forEach((b) => b.onclick = () => { const d = DISTRICTS.find((x) => x.id === b.dataset.d); S.world.spawn = d.spawns.find((k) => W.spawns[k]) || S.world.spawn; save(); renderMap(); });
  const keys = dist.spawns.filter((k) => W.spawns[k]);
  const icons = { city: '🏙️', bridge: '🌉', highway: '🛣️', rest: '☕', tunnel: '🚇', mountain: '⛰️', coast: '🌊', industrial: '🏭', apartment: '🏢', hyocheon: '🏘️', hyocheon2: '🏘️', hw_gj: '🛣️', hw_jeongeup: '🛣️', hw_nonsan: '🛣️', hw_cheonan: '🛣️', hw_seoultg: '🛣️', hw_seoul: '🏙️', sl_jamsil: '🗼', sl_lake: '🌊', sl_sports: '🏟️', sl_coex: '🏢', sl_gangnam: '🏙️', sl_yangjae: '🛣️', sl_gwanghwamun: '🏯', sl_seoulst: '🚉', sl_seongsu: '🏭', sl_konkuk: '🎓', sl_banpo: '🚌', sl_hannam: '🌉', dj_station: '🚉', dj_dunsan: '🏛️', dj_expo: '🔬', dj_yuseong: '♨️', dj_ic: '🛣️', bs_station: '🚉', dg_dongseong: '🛍️', ic_cityhall: '🏛️', jj_airport: '✈️', us_station: '🚉', us_city: '🏙️', cw_station: '🚉', cw_city: '🏙️', jj2_station: '🚉', jj2_hanok: '🏙️', cj_terminal: '🚉', cj_city: '🏙️', sw_station: '🚉', sw_hwaseong: '🏙️', ph_station: '🚉', ph_beach: '🏙️', gn_station: '🚉', gn_gyeongpo: '🏙️', cc_station: '🚉', cc_city: '🏙️', mp_station: '🚉', mp_peace: '🏙️', ys_station: '🚉', ys_city: '🏙️', sc_station: '🚉', sc_garden: '🏙️', gj2_terminal: '🚉', gj2_daereung: '🏙️', jj_city: '🏛️', jj_tapdong: '🌊', jj_nohyeong: '🏙️', gp_terminal: '✈️', gh_terminal: '✈️', ic_bupyeong: '🚉', ic_juan: '🚉', ic_chinatown: '🏮', ic_songdo: '🌳', ic_munhak: '⚾', ic_east: '🛣️', hw_ic_jc: '🔀', hw_ic_ansan: '🛣️', hw_ic_end: '🏙️', dg_station: '🚉', dg_dongdaegu: '🚄', dg_beomeo: '🏙️', dg_duryu: '🗼', dg_seongseo: '🛣️', hw_dg_gj: '🛣️', hw_dg_namwon: '🛣️', hw_dg_geochang: '🛣️', hw_dg_end: '🏙️', bs_seomyeon: '🏙️', bs_nampo: '🐟', bs_gwangan: '🌉', bs_haeundae: '🏖️', bs_centum: '🏬', bs_sasang: '🛣️', hw_bs_gj: '🛣️', hw_bs_suncheon: '🔀', hw_bs_jinju: '🛣️', hw_bs_changwon: '🛣️', hw_bs_end: '🏙️', hw_dj_jc: '🔀', hw_dj_cheongju: '🛣️', hw_dj_end: '🏙️', parking: '🅿️', country: '🌾', underpass: '🚇', station: '🚂', ugparking: '🅿️' };
  $('#map-spawns').innerHTML = `<p class="muted" style="margin:0 0 6px">${dist.ko} · ${dist.desc}</p>` + keys.map((k) => `<button class="spawn ${S.world.spawn === k ? 'sel' : ''}" data-s="${k}"><span>${icons[k] || '📍'}</span>${W.spawns[k].label}</button>`).join('');
  $$('#map-spawns .spawn').forEach((b) => b.onclick = () => { S.world.spawn = b.dataset.s; save(); renderMap(); });
  const hr = $('#map-hour');
  hr.value = S.world.hour;
  const lab = () => { const h = Number(hr.value); $('#map-hour-l').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} ${h < 5 ? '밤' : h < 6.5 ? '새벽' : h < 11 ? '아침' : h < 17 ? '낮' : h < 19.5 ? '일몰' : '밤'}`; };
  lab();
  hr.oninput = () => { S.world.hour = Number(hr.value); lab(); app.setTimeWeather(S.world.hour, S.world.weather); };
  $$('#map-time-presets button').forEach((b) => b.onclick = () => { hr.value = b.dataset.h; S.world.hour = Number(b.dataset.h); lab(); app.setTimeWeather(S.world.hour, S.world.weather); save(); });
  $('#map-weather').innerHTML = WEATHER_LIST.map((w) => `<button class="${S.world.weather === w.id ? 'sel' : ''}" data-w="${w.id}">${{ clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' }[w.id]} ${w.name}</button>`).join('');
  $$('#map-weather button').forEach((b) => b.onclick = () => { S.world.weather = b.dataset.w; save(); app.setTimeWeather(S.world.hour, S.world.weather); renderMap(); });
  $('#map-go').textContent = app.inGame() ? '이 위치로 이동' : '확인';
  $('#map-go').onclick = () => { save(); if (app.inGame()) app.teleport(S.world.spawn); else show('title'); };
  mapScreen(dist);
}
// ---- 맵 화면: 도시 지도 · 확대/이동 · 지하철 실시간 ----
const MS = { city: null, cx: 0, cz: 0, sc: 0, timer: 0, sub: true, pl: true, sel: null, loading: false };
const CITY_NAME = { gwangju: '광주광역시', seoul: '서울특별시', daejeon: '대전광역시', busan: '부산광역시', daegu: '대구광역시', incheon: '인천광역시', jeju: '제주특별자치도', ulsan: '울산', changwon: '창원', jeonju: '전주', cheongju: '청주', suwon: '수원', pohang: '포항', gangneung: '강릉', chuncheon: '춘천', mokpo: '목포', yeosu: '여수', suncheon: '순천', gyeongju: '경주', xhwy: '고속도로 (광주 ↔ 서울 · 대전 · 부산 · 대구 · 인천)' };
function mapScreen(dist) {
  const W = app.W, cv = $('#map-canvas');
  const city = ['seoul', 'daejeon', 'busan', 'daegu', 'incheon', 'jeju', 'ulsan', 'changwon', 'jeonju', 'cheongju', 'suwon', 'pohang', 'gangneung', 'chuncheon', 'mokpo', 'yeosu', 'suncheon', 'gyeongju', 'xhwy'].includes(dist.id) ? dist.id : 'gwangju';
  const fit = () => { const v = mapView(cv, undefined, undefined, 0, cityBox(MS.city)); MS.cx = v.cx; MS.cz = v.cz; MS.sc = v.sc; };
  if (MS.city !== city) { MS.city = city; MS.sel = null; fit(); }
  $('#map-title').textContent = '맵 선택 · ' + CITY_NAME[city];
  const needLoad = ['seoul', 'daejeon', 'busan', 'daegu', 'incheon', 'jeju', 'ulsan', 'changwon', 'jeonju', 'cheongju', 'suwon', 'pohang', 'gangneung', 'chuncheon', 'mokpo', 'yeosu', 'suncheon', 'gyeongju'].includes(city) && W.ensureRegion && !(W.regionLoaded && W.regionLoaded(city));
  const ld = $('#map-load');
  if (needLoad && !MS.loading) {
    MS.loading = true; ld.textContent = `🗺️ ${CITY_NAME[city]} 지도를 받는 중…`; ld.classList.remove('hidden');
    W.ensureRegion(city).then((ok) => { MS.loading = false; ld.classList.add('hidden'); if (!ok) toastMap('지도를 받지 못했어요. 잠시 뒤 다시 해 주세요.'); if (current === 'map') { if (MS.city === city) fit(); draw(); } });
  } else if (!needLoad) ld.classList.add('hidden');
  const subCity = city === 'xhwy' ? null : city;
  const draw = () => {
    if (current !== 'map') return;
    const v = mapView(cv, MS.cx, MS.cz, MS.sc);
    const L = { spawn: S.world.spawn, names: true, places: MS.pl, subway: MS.sub ? (subCity || true) : false };
    drawCityMap(cv, v, L);
    const info = $('#map-info');
    const lines = SUBWAY.lines.filter((x) => !subCity || x.city === subCity);
    if (MS.sel) {
      const { L: SL, i } = MS.sel, st = SL.st[i];
      const arr = nextArrivals(SL, i).map((a) => `${a.end} 방면 <b>${a.sec < 40 ? '곧 도착' : Math.ceil(a.sec / 60) + '분 후'}</b>`).join(' · ');
      info.innerHTML = `<span class="ln" style="background:${SL.color}">${SL.name}</span><b>${st.name}역</b> — ${arr} <small class="muted">(시간표 기준)</small>`;
    } else if (lines.length && MS.sub) {
      info.innerHTML = `🚇 지금 달리는 열차 <b>${L.trainCount || 0}</b>대 · ` + lines.filter((x, k, a) => a.findIndex((y) => y.name === x.name) === k).slice(0, 14).map((x) => `<span class="ln" style="background:${x.color}">${x.name}</span>`).join('') + ' <small class="muted">· 역을 누르면 도착 정보</small>';
    } else info.innerHTML = '<small class="muted">휠 · ＋/－ 로 확대, 끌어서 이동</small>';
  };
  MS.draw = draw;
  draw();
  clearInterval(MS.timer);
  MS.timer = setInterval(() => { if (current !== 'map') { clearInterval(MS.timer); return; } draw(); }, 1000);
  // 확대 · 이동
  const zoom = (f, px, py) => {
    const v = mapView(cv, MS.cx, MS.cz, MS.sc);
    const r = cv.getBoundingClientRect();
    const ax = px === undefined ? cv.width / 2 : ((px - r.left) / r.width) * cv.width, ay = py === undefined ? cv.height / 2 : ((py - r.top) / r.height) * cv.height;
    const wpt = v.toWorld(ax, ay);
    const fitSc = mapView(cv, undefined, undefined, 0, cityBox(MS.city)).sc;
    MS.sc = clamp(MS.sc * f, Math.min(fitSc, 0.004) * 0.8, 3);
    MS.cx = wpt.x + (ax - cv.width / 2) / MS.sc; MS.cz = wpt.z + (ay - cv.height / 2) / MS.sc;
    draw();
  };
  $('#map-zin').onclick = () => zoom(1.6);
  $('#map-zout').onclick = () => zoom(1 / 1.6);
  $('#map-zfit').onclick = () => { fit(); draw(); };
  $('#map-l-sub').classList.toggle('sel', MS.sub); $('#map-l-pl').classList.toggle('sel', MS.pl);
  $('#map-l-sub').onclick = () => { MS.sub = !MS.sub; MS.sel = null; $('#map-l-sub').classList.toggle('sel', MS.sub); draw(); };
  $('#map-l-pl').onclick = () => { MS.pl = !MS.pl; $('#map-l-pl').classList.toggle('sel', MS.pl); draw(); };
  cv.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); };
  let drag = null;
  cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: MS.cx, cz: MS.cz, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    MS.cx = drag.cx + dx / MS.sc; MS.cz = drag.cz + dy / MS.sc; draw();
  };
  cv.onpointerup = (e) => {
    const d = drag; drag = null; if (!d || d.moved) return;
    // 역 누르기 → 다음 열차
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const v = mapView(cv, MS.cx, MS.cz, MS.sc);
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    let best = null, bd = 14 * 14;
    if (MS.sub) for (const L of SUBWAY.lines) L.st.forEach((st, i) => { const dd = (v.X(st.x) - px) ** 2 + (v.Y(st.z) - py) ** 2; if (dd < bd) { bd = dd; best = { L, i }; } });
    MS.sel = best; draw();
  };
}
function toastMap(t) { const i = $('#map-info'); if (i) i.textContent = t; }
export function drawWorldMap(cv, W, spawnKey, player, extra = {}) {
  drawCityMap(cv, mapView(cv), { spawn: spawnKey, player, names: true, ...extra });
}

// ===== 캐릭터 =====
function renderChar() {
  if (!preview) preview = new Preview();
  preview.mount($('#char-pv'));
  preview.showAvatar(S.avatar);
  const names = { skin: '피부', hair: '머리 색', style: '머리 모양', top: '윗옷', bottom: '바지' };
  $('#char-opts').innerHTML = Object.keys(names).map((k) => `<div class="copt"><h3>${names[k]}</h3><div class="${k === 'style' ? 'opts' : 'swatches'}">${AVATAR_OPTS[k].map((v) => k === 'style' ? `<button class="${S.avatar.style === v[0] ? 'sel' : ''}" data-k="style" data-v="${v[0]}"><b>${v[1]}</b></button>` : `<button class="sw ${S.avatar[k] === v ? 'sel' : ''}" data-k="${k}" data-v="${v}" style="background:${v}"></button>`).join('')}</div></div>`).join('') + '<p class="muted">차에서 내려 걸을 때(E)와 차고·시작 화면에 이 캐릭터가 나와요.</p>';
  $$('#char-opts [data-k]').forEach((b) => b.onclick = () => { S.avatar[b.dataset.k] = b.dataset.v; save(); app.onAvatarChanged?.(); renderChar(); });
}
// ===== 일일 퀘스트 =====
function renderQuest() {
  const Q = ensureQuests(S);
  $('#q-left').textContent = `⏱️ ${timeLeft()} 남음`;
  $('#q-list').innerHTML = Q.list.map((q, i) => `<div class="qrow"><div><b>${q.t}</b><div class="rw">보상 ${won(q.reward * 3)}</div></div>
    <button data-i="${i}" class="${q.done && !q.claimed ? 'primary' : ''}" ${!q.done || q.claimed ? 'disabled' : ''}>${q.claimed ? '받음 ✓' : q.done ? '보상 받기' : `${q.prog} / ${q.goal}${q.unit}`}</button>
    <div class="qbar"><i style="width:${Math.round((q.prog / q.goal) * 100)}%"></i></div></div>`).join('');
  $$('#q-list button[data-i]').forEach((b) => b.onclick = () => { const q = Q.list[Number(b.dataset.i)]; if (!q.done || q.claimed) return; q.claimed = true; S.money += q.reward * 3; save(); app.audio?.coin(); renderQuest(); });
}

// ===== 멀티플레이 =====
function renderMp() {
  const mp = app.mp;
  $('#mp-name').value = S.mp.name;
  $('#mp-name').onchange = (e) => { S.mp.name = e.target.value.trim().slice(0, 12) || S.mp.name; save(); };
  const draw = () => {
    $('#mp-ch').innerHTML = [1, 2, 3, 4].map((c) => `<button class="${S.mp.ch === c ? 'sel' : ''}" data-c="${c}">채널 ${c}</button>`).join('');
    $$('#mp-ch button').forEach((b) => b.onclick = async () => { S.mp.ch = Number(b.dataset.c); save(); draw(); await mp.join(S.mp.ch); draw(); });
    const st = { off: '연결 준비 중…', connecting: '서버에 연결하는 중…', ready: '연결됐어요. 채널을 골라 들어가세요.', joined: `✅ 채널 ${mp.channel}에 접속했어요!`, unavailable: '⚠️ 지금 이 화면에서는 멀티플레이 서버에 연결할 수 없어요. Claude에 로그인한 상태로 이 게임 페이지를 직접 열어 주세요.' }[mp.status] || '';
    $('#mp-status').textContent = st;
    const list = mp.list();
    $('#mp-list').innerHTML = list.length ? list.map((p) => `<div class="route-row"><span class="rno" style="background:${p.me ? '#22bfb0' : '#c2185b'}">${p.me ? '나' : '친구'}</span><span><b class="${p.me ? 'mp-me' : ''}"></b><small>${p.veh}${p.guest ? ' · 초대 손님' : ''}</small></span></div>`).join('') : '<p class="muted">아직 아무도 없어요. 채널에 들어가 보세요!</p>';
    $$('#mp-list b').forEach((b, i) => (b.textContent = list[i].name));
  };
  mp.onList = () => { if (current === 'mp') draw(); };
  draw();
  if (!mp.active) mp.join(S.mp.ch).then(draw);
  $('#mp-go').onclick = async () => {
    S.mp.name = $('#mp-name').value.trim().slice(0, 12) || S.mp.name; save();
    if (!mp.active) await mp.join(S.mp.ch);
    if (!mp.active) return modal('<h3>연결할 수 없어요</h3><p>멀티플레이는 이 버전에서 아직 준비 중이에요. 혼자서 자유 주행은 그대로 할 수 있어요!</p>');
    app.startMode('free', {});
  };
  $('#mp-leave').onclick = async () => { await mp.leave(); $('#mpbox').textContent = ''; draw(); };
}

// ===== 설정 =====
function renderSettings() {
  const st = S.settings;
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([val, lab]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
  $('#set-body').innerHTML = `
    <label>교통량 ${sel('st-traffic', [['low', '적음'], ['normal', '보통'], ['high', '많음']], st.traffic)}</label>
    <label>보행자 ${sel('st-peds', [['true', '켜기'], ['false', '끄기']], st.peds)}</label>
    <label>그래픽 품질 ${sel('st-quality', [['high', '높음 (그림자·반사)'], ['medium', '보통'], ['low', '낮음 (빠름)']], st.quality)}</label>
    <label>사이드미러 화면 ${sel('st-mirrors', [['true', '켜기'], ['false', '끄기']], st.mirrors)}</label>
    <label>시간 흐름 ${sel('st-time', [['0', '멈춤'], ['1', '실제 시간'], ['30', '빠르게 (1초=30초)'], ['120', '아주 빠르게 (1초=2분)']], st.timeSpeed)}</label>
    <label>소리 크기 <input type="range" id="st-vol" min="0" max="1" step="0.05" value="${st.volume}"></label>
    <label>버스 안내 방송 (음성) ${sel('st-voice', [['true', '켜기'], ['false', '끄기']], st.voice)}</label>
    <label>화면 핸들·페달·버튼 ${sel('st-pads', [['true', '보이기 (기본)'], ['false', '숨기기 (터치 화면 제외)']], st.pads !== false)}</label>
    <label>FPS 표시 ${sel('st-fps', [['false', '끄기'], ['true', '켜기']], !!st.fps)}</label>
    <p class="muted">그래픽 품질은 다음에 게임을 열 때 완전히 적용돼요.</p>
    <div class="save-box">
      <h3>💾 저장 · 백업</h3>
      <p class="muted">진행 상황은 15초마다, 그리고 메뉴로 나갈 때 자동 저장돼요 (이 기기 저장소 2곳${cloudStatus() === 'on' ? ' + 내 계정' : ''}). 혹시 기록이 사라질 때를 대비해 <b>저장 코드</b>를 복사해 두면 언제든 그대로 되살릴 수 있어요.</p>
      <div class="save-row"><button id="sv-copy">📋 저장 코드 복사</button><button id="sv-load">📥 저장 코드 불러오기</button></div>
      <textarea id="sv-code" rows="3" placeholder="여기에 저장 코드를 붙여 넣고 [저장 코드 불러오기]를 누르세요"></textarea>
      <small id="sv-msg" class="muted"></small>
    </div>`;
  $('#sv-copy').onclick = async () => {
    save();
    const code = await exportCode();
    $('#sv-code').value = code;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { /* 클립보드 막힘 */ }
    if (!ok) { $('#sv-code').select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
    $('#sv-msg').textContent = ok ? `✅ 복사했어요 (${(code.length / 1024).toFixed(1)}KB). 메모장 등에 붙여 넣어 보관하세요.` : '아래 칸의 코드를 길게 눌러 직접 복사해 두세요.';
  };
  $('#sv-load').onclick = async () => {
    const code = $('#sv-code').value;
    if (!code.trim()) { $('#sv-msg').textContent = '먼저 저장 코드를 붙여 넣어 주세요.'; return; }
    try {
      await importCode(code);
      app.onSaveLoaded && app.onSaveLoaded(true, '📥 저장 코드로 기록을 되살렸어요');
      $('#sv-msg').textContent = `✅ 불러왔어요 — 돈 ${S.money.toLocaleString()}원, 차 ${S.owned.length}대`;
    } catch (e) { $('#sv-msg').textContent = '❌ ' + (e.message || '불러오지 못했어요'); }
  };
  $('#set-save').onclick = () => {
    st.traffic = $('#st-traffic').value; st.peds = $('#st-peds').value === 'true'; st.quality = $('#st-quality').value;
    st.mirrors = $('#st-mirrors').value === 'true'; st.timeSpeed = Number($('#st-time').value); st.volume = Number($('#st-vol').value); st.voice = $('#st-voice').value === 'true'; st.pads = $('#st-pads').value === 'true'; st.fps = $('#st-fps').value === 'true';
    save(); app.applySettings(); show(app.inGame() ? 'pause' : 'title');
  };
}

// ===== 버튼 바인딩 =====
function bindGo(root = document) {
  $$('[data-go]', root).forEach((b) => b.onclick = () => {
    const to = b.dataset.go;
    if (to === 'back') return show(app.inGame() ? 'pause' : 'title');
    if (['map', 'admin', 'mp', 'nav'].includes(to) && app.ready === false) return app.whenReady(() => show(to));
    show(to);
  });
}
export function registerScreen(id, fn) { RENDER[id] = fn; }
export function initUI(a) {
  app = a;
  bindGo();
  $('#p-resume').onclick = () => app.resume();
  $('#p-menu').onclick = () => app.toMenu();
  $('#exit-restart').onclick = () => show('title');
  window.addEventListener('resize', () => preview?.resize());
}
export function summaryModal(d) {
  return modal(`<div class="summary"><h3>${d.title}</h3>${d.grade ? `<div class="grade g-${d.grade}">${d.grade}</div>` : ''}<table>${d.rows.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table></div>`, [{ label: '메인 메뉴' }, { label: '계속 주행', primary: true }]);
}
