import * as THREE from 'three';
import { streamCorridor, buildCorridorNear } from './corridor.js';
import { streamRegion, buildRegionNear, updateRegionSignals } from './region.js';
import { buildWorld, streamBuildings, buildBuildingsNear, W, roadInfoAt, zoneAt, onBump, groundY, levelAt, updateSignals, signalState, queryColliders, blocked, UG, obNearest, linkY, railDist, edgesNear, lanePos } from './world.js';
import { Train } from './train.js';
import { buildVehicle, buildPed, animPed, randomPlate, applyEnv, setEnvIntensity, MAT, buildAvatar } from './models.js';
const MAT_CABIN = MAT.cabinLight;
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Showroom } from './showroom.js';
import { Multiplayer } from './mp.js';
import { ensureQuests, questAdd } from './quests.js';
import { VehicleSim } from './physics.js';
import { Traffic } from './traffic.js';
import { Env } from './env.js';
import { GameAudio } from './audio.js';
import { HUBS, hubNear, tripsFrom, playTrip, decorateAirport, hubSign } from './travel.js';
import { S, load, save, ownedBy, hasOpt, initCloud, flushCloud } from './state.js';
import { BY_ID, ROUTES, ROUTE_COLORS, DISTRICTS, BUS_TYPES, trimKind } from './data.js';
import { Nav, arrowSVG, fmtDist, TURN_WORD } from './nav.js';
import { initNavUI } from './navui.js';
import { initAdmin, ensureAdmin, syncAdminWithWorld, adminTick, customRoutesForWorld, routeWeightOf, companyNameOf, routeModelOf, routeLiveryOf } from './admin.js';
import { drawCityMap, mapView, basemap, cityAt, cityBox } from './mapdraw.js';
import { SUBWAY } from './subway.js';
import { Transit } from './transit.js';
import { Hazards } from './hazards.js';
import { AutoDrive } from './autodrive.js';
import { initUI, show, hideAll, currentScreen, summaryModal, drawWorldMap } from './ui.js';
import { BusRouteMission, CheckpointMission, ParkingMission, FreeMission, MODES } from './missions.js';
import { clamp, lerp, won, isTouch } from './util.js';

const $ = (s) => document.querySelector(s);
load();
// 처음 실행(또는 이 버전 처음): 기기에 맞게 그래픽 품질 자동 선택 — 휴대폰·태블릿은 '낮음'
if (S.settings.qv !== 2) {
  S.settings.qv = 2;
  const mobile = isTouch || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  S.settings.quality = mobile || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'medium';
  try { save(); } catch (e) { /* 저장 실패해도 계속 */ }
}
const Q = S.settings.quality;
const QF = Q === 'high' ? 1 : Q === 'medium' ? 0.8 : 0.55; // 보이는 거리 비율

// ===================== 렌더러 =====================
const renderer = new THREE.WebGLRenderer({ antialias: Q !== 'low', powerPreference: 'high-performance', stencil: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q === 'high' ? 1.5 : Q === 'medium' ? 1.15 : 0.9));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = Q !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
$('#game').appendChild(renderer.domElement);
// 차량 반사용 환경맵
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  applyEnv(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3600);
camera.position.set(0, 30, -60);

// 사이드미러 (렌더 타깃 → 화면 위 오버레이)
const MRW = Q === 'low' ? 240 : 360, MRH = Q === 'low' ? 146 : 220;
const mirrorRT = [new THREE.WebGLRenderTarget(MRW, MRH), new THREE.WebGLRenderTarget(MRW, MRH)];
mirrorRT.forEach((r) => (r.texture.colorSpace = THREE.SRGBColorSpace));
const mirrorCam = [new THREE.PerspectiveCamera(34, 360 / 220, 0.5, Q === 'low' ? 160 : 400), new THREE.PerspectiveCamera(34, 360 / 220, 0.5, Q === 'low' ? 160 : 400)];
const overlay = new THREE.Scene();
const overlayCam = new THREE.OrthographicCamera(0, innerWidth, innerHeight, 0, -1, 1);
const mirrorQuads = mirrorRT.map((rt) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }));
  overlay.add(m); return m;
});
const mirrorFrames = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  m.position.z = -0.5; overlay.add(m); return m;
});
function layoutMirrors() {
  overlayCam.right = innerWidth; overlayCam.top = innerHeight; overlayCam.updateProjectionMatrix();
  const w = innerWidth * 0.18, h = w * 0.6;
  [[innerWidth * 0.18, innerHeight * 0.44, 0], [innerWidth * 0.84, innerHeight * 0.56, 1]].forEach(([x, y, i]) => {
    mirrorQuads[i].scale.set(-w, h, 1); mirrorQuads[i].position.set(x, y, 0);
    mirrorFrames[i].scale.set(w + 8, h + 8, 1); mirrorFrames[i].position.set(x, y, -0.5);
  });
}
layoutMirrors();

// ===================== 상태 =====================
const G = {
  state: 'loading', mission: null, P: null, camMode: 0, simT: 0, keys: {}, touch: {},
  steerIn: 0, thrIn: 0, brkIn: 0, lookYaw: 0, lookPitch: 0, zoom: 1, lastLook: 0, camHeading: 0,
  shake: 0, sigT: 0, roadT: 0, road: null, prevRoad: null, speedT: 0, speedWarn: -99, busLaneT: 0, frame: 0,
  free: { pos: new THREE.Vector3(), yaw: 0, pitch: -0.2 }, refuel: null, bigMap: false, missionHTML: '', hintT: 0, menuT: 0, impactCool: 0,
  dirtyVehicle: false, mirrorsOn: S.settings.mirrors, prevToll: null,
};
const CAMS = [['chase', '추적 카메라'], ['driver', '운전석 시점'], ['interior', '실내 시점'], ['orbit', '3인칭 외부 시점'], ['svm', '서라운드 뷰 (옵션)'], ['free', '자유 카메라']];
let env, traffic, train, showroom, mp, nav, transit;
const hazards = new Hazards();
const autod = new AutoDrive();
const audio = new GameAudio();
audio.setVolume(S.settings.volume); audio.voice = S.settings.voice;

// ===================== 로딩 =====================
async function boot() {
  const bar = $('#loadFill'), txt = $('#loadText');
  // 내 계정 저장(클라우드) 읽기 — 늦게 오면 그때 반영
  const onSaveLoaded = (local, msg) => {
    ensureAdmin();
    if (app.ready) syncAdminWithWorld();
    if (showroom) { showroom.setFeatured(ownedBy(S.current)); showroom.setAvatar(S.avatar); }
    if (app.ready && G.state === 'menu') { setPlayer(ownedBy(S.current)); }
    if (env) { env.hour = S.world.hour; env.setWeather(S.world.weather); }
    app.refreshMenu && app.refreshMenu();
    toast(msg || (local ? '💾 이 기기에 저장된 기록을 불러왔어요' : '☁️ 내 계정에 저장된 기록을 불러왔어요'), 'good', 2600);
  };
  app.onSaveLoaded = onSaveLoaded;
  // 다른 도시 지도를 받으면: 노선 · 회사 설정에 반영
  W.onRegion = (def, st) => {
    if (st !== 'loaded') return;
    try { syncAdminWithWorld(); } catch (e) { console.warn(e); }
    if (nav) nav._places = null;
    try { for (const h of HUBS) if (h.reg === def.id) { hubSign(scene, h); hubCurb(h); if (h.kind === 'air') decorateAirport(scene, h); } } catch (e) { console.warn('airport', e); }
    try { if (transit) transit.addLines(SUBWAY.lines.filter((L) => L.city === def.id)); } catch (e) { console.warn('metro', e); }
    if (app.refreshMenu) app.refreshMenu();
  };
  initCloud(onSaveLoaded);
  // 자동 저장: 15초마다 · 앱을 닫거나 다른 앱으로 갈 때
  setInterval(() => { if (G.state === 'play' || G.state === 'pause') save(); }, 15000);
  const saveNow = () => { save(); flushCloud(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', saveNow);
  try {
    // 1) 타이틀부터 바로 띄움 (쇼룸은 지도와 따로 그려짐)
    ensureAdmin();
    showroom = new Showroom();
    showroom.setFeatured(ownedBy(S.current));
    showroom.setAvatar(S.avatar);
    ensureQuests(S);
    initUI(app);
    initNavUI(app);
    initAdmin(app);
    // 로딩 화면: 다 되면 '화면을 눌러 시작' → 누르면 타이틀로 (지도는 그동안 뒤에서 만들어요)
    {
      bar.style.width = '100%'; txt.textContent = '준비 완료!';
      const st = $('#ldStart'); const shownAt = performance.now();
      const go = () => {
        if (performance.now() - shownAt < 400) return;
        removeEventListener('pointerdown', go); removeEventListener('keydown', go);
        $('#loading').classList.add('hidden');
        try { audio.unlock && audio.unlock(); } catch (e) { /* 무시 */ }
      };
      setTimeout(() => { if (st) st.classList.remove('hidden'); addEventListener('pointerdown', go); addEventListener('keydown', go); }, 900);
    }
    G.state = 'menu';
    show('title');
    requestAnimationFrame(frame);
    // 2) 지도는 뒤에서 만들기 (메뉴를 보는 동안)
    const pill = $('#worldPill');
    const prog = (p, t) => { if (pill) { pill.classList.remove('hidden'); pill.querySelector('i').style.width = Math.round(p * 100) + '%'; pill.querySelector('span').textContent = t; } };
    await buildWorld(scene, prog, { extraRoutes: customRoutesForWorld() });
    prog(0.95, '차들을 도로에 놓는 중...');
    await new Promise((r) => setTimeout(r, 0));
    syncAdminWithWorld();
    env = new Env(scene, renderer, Q);
    env.hour = S.world.hour; env.setWeather(S.world.weather);
    env.onThunder = () => audio.thunder();
    traffic = new Traffic(scene);
    traffic.weightFn = routeWeightOf; traffic.companyFn = companyNameOf; traffic.modelFn = routeModelOf; traffic.liveryFn = routeLiveryOf;
    app.traffic = traffic;
    traffic.init(Q === 'low' ? 70 : 110, Q === 'low' ? 24 : 46);
    train = new Train(scene, audio);
    transit = new Transit({
      scene, camera, audio, toast, traffic, G, quest: (id, n) => quest(id, n),
      hidePerson: (b) => { if (G.P && G.P.person) G.P.person.visible = !b; },
      placeFoot: (x, z, h) => { const P = G.P; P.px = x; P.pz = z; P.ph = h; P.plevel = 'surface'; G.camHeading = h; G.lookYaw = 0; snapCamera(); },
    });
    transit.build(scene, S.admin && S.admin.metro && S.admin.metro.lines);
    hazards.build(scene);
    traffic.hazards = hazards;
    app.transit = transit;
    mp = new Multiplayer(scene);
    app.mp = mp;
    mp.onChat = (n, m) => chatLine(n, m);
    setPlayer(ownedBy(S.current));
    placeAt(W.spawns[S.world.spawn] || W.spawns.city);
    traffic.initialPlace(G.P.sim.x, G.P.sim.z, desiredTraffic());
    nav = new Nav(scene, audio);
    nav.voice = S.settings.navVoice !== false; nav.show3D = S.settings.nav3D !== false;
    nav.toast = (m, k, ms) => toast(m, k, ms);
    nav.onCamera = (c, kmh) => onSpeedCamera(c, kmh);
    nav.onArrive = (d) => { if (!d.auto) { toast(`🏁 <b>${d.name}</b>에 도착했어요!`, 'good', 3000); audio.chime && audio.chime(); quest('nav', 1); } };
    nav.recent = (S.nav && S.nav.recent) || [];
    app.nav = nav;
    app.ready = true;
    try { for (const h of HUBS) if (!h.reg) { hubSign(scene, h); hubCurb(h); if (h.kind === 'air') decorateAirport(scene, h); } } catch (e) { console.warn('airport', e); }
    if (pill) pill.classList.add('hidden');
    for (const f of app.waiters.splice(0)) f();
  } catch (e) {
    console.error(e);
    $('#loading').classList.remove('hidden');
    txt.textContent = '불러오기 중 오류가 났어요: ' + e.message;
    void bar;
  }
}
setTimeout(boot, 0);

// ===================== 플레이어 차량 =====================
function disposeObj(obj) {
  scene.remove(obj.group);
  obj.group.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position.count > 200) o.geometry.dispose(); });
}
function setPlayer(own) {
  const spec = BY_ID[own.id];
  const old = G.P;
  if (old) { disposeObj(old.obj); if (old.person) scene.remove(old.person); }
  const route = G.routeForSign;
  const obj = buildVehicle(spec, {
    color: own.color, wheel: own.wheel, plate: own.plate, livery: own.livery, company: own.company,
    route: route ? route.id : '회송', dest: route ? route.dest : '차고지', routeColor: route ? ROUTE_COLORS[route.type] : '#555',
  });
  scene.add(obj.group);
  // 전조등
  const spots = [];
  for (const hp of obj.headPos) {
    const sp = new THREE.SpotLight(0xfff1d6, 0, 120, 0.42, 0.55, 1.5);
    sp.position.copy(hp);
    sp.target.position.set(hp.x * 1.3, 0, hp.z + 30);
    obj.body.add(sp); obj.body.add(sp.target);
    spots.push(sp);
  }
  // 버스 실물 미러에 미러 화면 표시
  if (obj.mirrorFaces) obj.mirrorFaces.forEach((f, i) => { f.material = new THREE.MeshBasicMaterial({ map: mirrorRT[i].texture }); f.scale.x *= -1; });
  const sim = new VehicleSim(spec, own);
  G.P = { own, spec, obj, sim, spots, lights: false, blink: 0, hazard: false, wiper: 0, wiperPh: 0, onFoot: false, engine: true, park: false, cabin: true, gearMode: 'auto', person: null, y: 0, blinkAcc: 0, bell: false, bumpT: 0, lastBlinkOn: false };
  G.P.len = spec.len; G.P.wid = spec.wid;
  if (old) { sim.reset(old.sim.x, old.sim.z, old.sim.heading); }
  syncPlayerModel(0);
}
function placeAt(sp) { placePlayer(sp.x, sp.z, sp.heading, sp.level); }
function placePlayer(x, z, h, level = 'surface') {
  const P = G.P;
  buildBuildingsNear(x, z, 700);
  buildCorridorNear(x, z); buildRegionNear(x, z);
  P.sim.reset(x, z, h);
  P.sim.level = level;
  W.refY = undefined;
  P.y = levelAt(x, z, level).y;
  if (P.onFoot) exitFoot(true);
  G.camHeading = h; G.lookYaw = 0; G.lookPitch = 0;
  syncPlayerModel(0);
  snapCamera();
}

// ===================== 입력 =====================
const key = (...c) => c.some((k) => G.keys[k] || G.touch[k]);
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter' && G.state === 'play' && mp && mp.active) { e.preventDefault(); openChat(); return; }
  if (G.keys[e.code]) return;
  G.keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'play') pause();
    else if (G.state === 'pause' && (currentScreen() === 'pause' || e.code === 'Escape')) resume();
    return;
  }
  if (G.state !== 'play') return;
  action(e.code);
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; if (e.code === 'KeyH') audio.horn(false); if (e.code === 'Tab') toggleBigMap(false); });
addEventListener('blur', () => { G.keys = {}; audio.horn(false); });

function action(code) {
  const P = G.P;
  if (P && P.onFoot && transit && transit.key(code)) return;
  switch (code) {
    case 'KeyO': toggleAssist(1); break;
    case 'KeyU': toggleAssist(2); break;
    case 'Equal': case 'NumpadAdd': case 'BracketRight': if (autod.on) { autod.adjust(code === 'BracketRight' ? 1 : 5); assistToast(); } break;
    case 'Minus': case 'NumpadSubtract': case 'BracketLeft': if (autod.on) { autod.adjust(code === 'BracketLeft' ? -1 : -5); assistToast(); } break;
    case 'KeyT': if (autod.on) { autod.cycleGap(); assistToast(); } break;
    case 'KeyC': G.camMode = (G.camMode + 1) % CAMS.length; if (CAMS[G.camMode][0] === 'svm' && !hasOpt(P.own, 'svm')) G.camMode = (G.camMode + 1) % CAMS.length; G.lookYaw = 0; G.lookPitch = 0; if (CAMS[G.camMode][0] === 'free') { G.free.pos.copy(camera.position); G.free.yaw = P.sim.heading; G.free.pitch = -0.15; } toast('📷 ' + CAMS[G.camMode][1], 'info', 1200); break;
    case 'KeyL': P.lights = !P.lights; toast(P.lights ? '💡 전조등 켜짐' : '전조등 꺼짐', 'info', 1000); break;
    case 'KeyZ': case 'Comma': P.hazard = false; P.blink = P.blink === -1 ? 0 : -1; P.blinkAcc = 0; if (autod.mode === 2 && P.blink === -1) { autod.requestLane(-1); toast('↖ 왼쪽 차로로 바꿀게요', 'info', 1200); } break;
    case 'KeyX': case 'Period': P.hazard = false; P.blink = P.blink === 1 ? 0 : 1; P.blinkAcc = 0; if (autod.mode === 2 && P.blink === 1) { autod.requestLane(1); toast('↗ 오른쪽 차로로 바꿀게요', 'info', 1200); } break;
    case 'KeyY': if (autod.on) { const on = autod.toggleAuto(G.road && G.road.limit); toast(on ? '🚦 제한속도 자동 맞춤 켜짐 (구간마다 속도를 바꿔요)' : '제한속도 자동 맞춤 꺼짐 — +/-로 속도를 정해요', 'info', 1800); } break;
    case 'KeyV': P.hazard = !P.hazard; break;
    case 'KeyK': P.wiper = (P.wiper + 1) % 3; toast(['와이퍼 끔', '와이퍼 느리게', '와이퍼 빠르게'][P.wiper], 'info', 1000); break;
    case 'KeyH': audio.horn(true, P.spec.type === 'bus'); break;
    case 'Digit1': case 'Numpad1': door(0); break;
    case 'Digit2': case 'Numpad2': door(1); break;
    case 'KeyE': interact(); break;
    case 'KeyI': P.engine = !P.engine; if (P.engine) { audio.init(); audio.burst(0.6, 300, 'lowpass', 0.5); audio.tone(90, 0.5, 'sawtooth', 0.08); } toast(P.engine ? '🔑 시동 켜짐' : '🔑 시동 꺼짐', 'info', 1200); break;
    case 'KeyB': P.park = !P.park; toast(P.park ? '🅿️ 사이드브레이크 채움' : '사이드브레이크 풂', 'info', 1000); break;
    case 'KeyJ': P.cabin = !P.cabin; toast(P.cabin ? '🔆 실내등 켜짐' : '실내등 꺼짐', 'info', 1000); break;
    case 'KeyG': { const order = ['auto', 'P', 'R', 'N', 'D']; setGear(order[(order.indexOf(P.gearMode) + 1) % order.length]); break; }
    case 'KeyM': G.mirrorsOn = !G.mirrorsOn; toast(G.mirrorsOn ? '사이드미러 화면 켜짐' : '사이드미러 화면 꺼짐', 'info', 1000); break;
    case 'Tab': toggleBigMap(true); break;
    case 'KeyN': openNav(); break;
    case 'F1': case 'Slash': pause(); show('help'); break;
  }
}
function door(i) {
  const P = G.P;
  if (!P.obj.doors.length || P.onFoot) return;
  const d = P.obj.doors[i] || P.obj.doors[0];
  if (d.target === 0 && P.sim.kmh > 3) return toast('🚫 달리는 중에는 문을 열 수 없어요', 'warn', 1500);
  d.target = d.target ? 0 : 1;
  audio.door();
}
function openNav() { if (G.state !== 'play') return; G.state = 'pause'; audio.engine({ on: false }); audio.horn(false); toggleBigMap(false); show('nav'); }
function onSpeedCamera(c, kmh) {
  const over = Math.round(kmh - c.limit);
  const amt = over > 40 ? 90000 : over > 20 ? 60000 : 30000;
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  audio.beep && audio.beep();
  fine(amt, `📸 과속 단속 카메라! 제한 ${c.limit}km/h · ${Math.round(kmh)}km/h (+${over})`);
}
function toggleBigMap(on) { G.bigMap = on; $('#bigmap').classList.toggle('hidden', !on); }

$('#btn-pause').onclick = () => pause();
$('#btn-nav').onclick = () => openNav();
$('#p-nav').onclick = () => show('nav');
$('#btn-scc').onclick = () => { if (G.state === 'play') action('KeyO'); };
$('#btn-auto').onclick = () => { if (G.state === 'play') action('KeyU'); };
$('#adas').onclick = (e) => { if (e.target.closest('[data-ad]')) return; if (G.state === 'play' && autod.on) { autod.cycleGap(); assistToast(); } };
$('#prompt').onclick = () => { if (G.state === 'play' && G.P) interact(); };
$('#nav-stop').onclick = () => { if (nav) { nav.stop(); G.navKey = 'user-stopped'; } };
$('#camname').onclick = () => { if (G.state === 'play') action('KeyC'); };
$('#btn-help').onclick = () => { pause(); show('help'); };

// 마우스로 둘러보기 / 확대
const cv = renderer.domElement;
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
  if (CAMS[G.camMode][0] === 'free' && !G.P.onFoot) { G.free.yaw -= dx * 0.004; G.free.pitch = clamp(G.free.pitch - dy * 0.004, -1.4, 1.4); }
  else { G.lookYaw -= dx * 0.005; G.lookPitch = clamp(G.lookPitch - dy * 0.004, -0.9, 0.7); }
  G.lastLook = performance.now();
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('wheel', (e) => { G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.45, 3); }, { passive: true });

// ===================== 운전석 버튼 · 기어 · 페달 · 핸들 =====================
const ACT = { more: 'more', garage: 'garage', key: 'KeyI', park: 'KeyB', lights: 'KeyL', wiper: 'KeyK', cabin: 'KeyJ', door0: 'Digit1', door1: 'Digit2', blinkL: 'KeyZ', hazard: 'KeyV', blinkR: 'KeyX', mirror: 'KeyM', cam: 'KeyC', scc: 'KeyO', auto: 'KeyU', sccup: 'Equal', sccdn: 'Minus'};
document.querySelectorAll('#ctrlbar [data-act]').forEach((b) => {
  const a = b.dataset.act;
  if (a === 'horn') {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (G.state === 'play') audio.horn(true, G.P.spec.type === 'bus'); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => audio.horn(false));
  } else if (a === 'more') b.addEventListener('click', () => document.querySelector('#ctrlbar .more').classList.toggle('hidden'));
  else if (a === 'garage') b.addEventListener('click', () => { if (G.state === 'play') { pause(); show(G.P.spec.type === 'bus' ? 'busgarage' : 'garage'); } });
  else b.addEventListener('click', () => { if (G.state === 'play') action(ACT[a]); });
});
document.querySelectorAll('#gearsel [data-g]').forEach((b) => b.addEventListener('click', () => { if (G.state === 'play') setGear(b.dataset.g); }));
function setGear(g) {
  const P = G.P;
  if ((g === 'R' && P.sim.vl > 1) || (g === 'D' && P.sim.vl < -1) || (g === 'P' && P.sim.kmh > 3)) return toast('먼저 차를 멈추고 기어를 바꿔요', 'warn', 1500);
  P.gearMode = g;
  toast(g === 'auto' ? '⚙️ 자동 기어 (S를 계속 누르면 후진)' : `⚙️ 기어 ${g} ${{ P: '주차', R: '후진', N: '중립', D: '주행' }[g]}`, 'info', 1200);
}
const showPads = S.settings.pads !== false || isTouch;
document.body.classList.toggle('pads', showPads);
if (showPads) {
  $('#pedals').classList.remove('hidden'); $('#wheelpad').classList.remove('hidden');
  document.querySelectorAll('#pedals [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); G.touch[k] = true; b.classList.add('press'); };
    const off = () => { G.touch[k] = false; b.classList.remove('press'); };
    b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  });
  const wp = $('#wheelpad');
  let wd = null;
  const ang = (e) => { const r = wp.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
  wp.addEventListener('pointerdown', (e) => { e.preventDefault(); wp.setPointerCapture(e.pointerId); wd = { a0: ang(e), s0: G.wheelSteer || 0 }; G.wheelHeld = true; });
  wp.addEventListener('pointermove', (e) => { if (!wd) return; let d = ang(e) - wd.a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; G.wheelSteer = clamp(wd.s0 - d / 2.4, -1, 1); });
  const rel = () => { wd = null; G.wheelHeld = false; };
  wp.addEventListener('pointerup', rel); wp.addEventListener('pointercancel', rel);
}

// ===================== 상호작용 (E) =====================
function interact() {
  const P = G.P;
  if (P.onFoot) {
    if (transit && transit.interact(P.px, P.pz)) return;
    const hub = hubNear(P.px, P.pz);
    if (hub) return openTickets(hub);
    const d = Math.hypot(P.px - P.sim.x, P.pz - P.sim.z);
    if (d < P.len / 2 + 3) exitFoot(false);
    else if (d > 60) callCar();
    else toast('차 가까이 가서 E를 누르면 탈 수 있어요', 'info');
    return;
  }
  if (P.sim.kmh > 2) return toast('먼저 차를 멈춰 주세요', 'warn', 1200);
  const own = P.own;
  if (own.fuel <= 0.5 && !fuelZone()) {
    const zs = W.zones.filter((z) => z.type === (P.spec.ev ? 'ev' : 'fuel'));
    const z = zs.sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - P.sim.x, (a.z0 + a.z1) / 2 - P.sim.z) - Math.hypot((b.x0 + b.x1) / 2 - P.sim.x, (b.z0 + b.z1) / 2 - P.sim.z))[0];
    S.money = Math.max(0, S.money - 200000); own.fuel = 40;
    placePlayer((z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2, P.sim.heading);
    return toast('🚨 긴급출동! 가까운 충전·주유소로 옮겼어요 (-20만원)', 'bad');
  }
  const fz = fuelZone();
  if (fz && own.fuel < 99) {
    const cost = Math.round((100 - own.fuel) * (P.spec.type === 'bus' ? 1500 : 800) * (P.spec.ev ? 0.45 : 1));
    if (S.money < cost) return toast('돈이 부족해요', 'bad');
    S.money -= cost; G.refuel = { t: 0 };
    return toast(`${P.spec.ev ? '⚡ 충전' : '⛽ 주유'} 시작 (-${won(cost)})`, 'money');
  }
  const hub = hubNear(P.sim.x, P.sim.z, 90);
  enterFoot();
  if (hub) openTickets(hub);
}
// ===================== 기차역 · 공항: 표 사고 다른 도시로 =====================
function laneNear(x, z, R = 160) {
  let best = null;
  const n = Math.ceil(R / 60); const seen = new Set();
  for (let dx = -n; dx <= n; dx++) for (let dz = -n; dz <= n; dz++) for (const e of edgesNear(x + dx * 60, z + dz * 60)) {
    if (seen.has(e)) continue; seen.add(e);
    if (e.elevated || e.ramp || e.corr || e.kind === 'highway' || e.kind === 'ic') continue;
    const s = clamp((x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z, 0, e.len);
    const d = Math.hypot(e.a.x + e.dir.x * s - x, e.a.z + e.dir.z * s - z);
    if (!best || d < best.d) best = { e, s, d };
  }
  if (!best || best.d > R) return null;
  const Ls = W.links.filter((L) => L.edge === best.e);
  const sOf = (L) => clamp(L.from === best.e.a ? best.s : L.len - best.s, L.s0 + 2, Math.max(L.s0 + 2, L.s1 - 2));
  const L = Ls.sort((a, b) => { const qa = lanePos(a, a.n - 1, sOf(a)), qb = lanePos(b, b.n - 1, sOf(b)); return Math.hypot(qa.x - x, qa.z - z) - Math.hypot(qb.x - x, qb.z - z); })[0];
  if (!L) return null;
  const q = lanePos(L, L.n - 1, sOf(L));
  return { x: q.x, z: q.z, heading: L.heading };
}
function hubCurb(h) { if (!h.curb) h.curb = laneNear(h.x, h.z, 160) || laneNear(h.x, h.z, 650); return h.curb; }
function openTickets(hub) {
  const P = G.P;
  if (G.mission && G.mission.riders) return toast('버스 운행 중에는 기차 · 비행기를 탈 수 없어요', 'warn');
  const trips = tripsFrom(hub);
  const icon = (k) => (k === 'air' ? '✈️' : k === 'metro' ? '🚇' : k === 'xbus' ? '🚌' : '🚄');
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card wide tix"><h3>${icon(hub.kind)} ${hub.name} <small class="muted">${hub.kind === 'air' ? '항공권' : '승차권'} · 가진 돈 ${won(S.money)}</small></h3>
    <p class="muted">내 차는 도착지 ${hub.kind === 'air' ? '공항' : '역'} 앞으로 옮겨 드려요 (탁송). 도착하면 걸어서 내려요.</p>
    <div class="tix-list">${trips.map((t, i) => `<button class="tix-row ${t.svc === 'SRT' ? 'srt' : t.svc === 'KTX' ? 'ktx' : t.kind}" data-i="${i}"><span class="tx-svc">${icon(t.kind)} ${t.svc}</span><b>${t.to.name}</b><small>${t.to.city}</small><span class="tx-time">${Math.floor(t.min / 60) ? Math.floor(t.min / 60) + '시간 ' : ''}${t.min % 60}분</span><span class="tx-fare">${t.fare.toLocaleString()}원</span></button>`).join('') || '<p>여기서 갈 수 있는 곳이 없어요</p>'}</div>
    <div class="modal-btns"><button data-x="0">닫기</button></div></div>`;
  m.classList.remove('hidden');
  $('[data-x="0"]', m).onclick = () => m.classList.add('hidden');
  m.querySelectorAll('.tix-row').forEach((b) => b.onclick = () => { m.classList.add('hidden'); doTrip(hub, trips[+b.dataset.i]); });
}
async function doTrip(hub, trip) {
  const P = G.P;
  if (S.money < trip.fare) return toast('돈이 부족해요', 'bad');
  S.money -= trip.fare; refreshMoneyHud();
  const prev = G.state; G.state = 'trip';
  $('#hud').classList.add('hidden');
  audio.engine({ on: false });
  try { if (nav) nav.stop(true); } catch (e) { /* 무시 */ }
  const dest = trip.to;
  await playTrip(trip, hub, async () => { if (dest.reg) await W.ensureRegion(dest.reg); });
  if (env) env.hour = (env.hour + trip.min / 60) % 24;
  const q = hubCurb(dest) || { x: dest.x, z: dest.z, heading: 0 };
  if (P.onFoot) exitFoot(true);
  placePlayer(q.x, q.z, q.heading);
  if (dest.kind === 'air') decorateAirport(scene, dest);
  G.state = prev === 'trip' ? 'play' : 'play';
  $('#hud').classList.remove('hidden');
  enterFoot();
  toast(`${trip.kind === 'air' ? '✈️' : trip.kind === 'xbus' ? '🚌' : '🚄'} <b>${dest.name}</b> 도착! 내 차는 바로 옆에 세워 뒀어요 (E: 타기)`, 'good', 4000);
  save();
}
function refreshMoneyHud() { const el = $('#money'); if (el) el.textContent = won(S.money); }
// ---- 운전 보조 켜고 끄기 ----
function toggleAssist(mode) {
  const P = G.P;
  if (!P || P.onFoot) return;
  if (autod.mode === mode) { autod.off(); toast(mode === 2 ? '🛑 자율주행 꺼짐 — 직접 운전하세요' : 'SCC 꺼짐', 'info', 1500); return; }
  if (!P.engine) return toast('먼저 시동을 걸어 주세요 (I)', 'warn');
  if (P.park) P.park = false;
  if (P.gearMode !== 'auto' && P.gearMode !== 'D') P.gearMode = 'auto';
  const r0 = roadInfoAt(P.sim.x, P.sim.z, P.sim.level === 'hwy' ? 'hwy' : 'surface'), road = r0 && r0.link ? r0 : null;
  if (mode === 2 && !hasOpt(P.own, 'hda2')) return toast("🤖 자율주행은 '고속도로 주행 보조 2' 옵션이 있어야 해요 — 차고 → 옵션에서 달 수 있어요 (스마트 크루즈 O는 그냥 돼요)", 'warn', 4000);
  if (mode === 2 && !road) return toast('도로 위에서만 자율주행을 켤 수 있어요', 'warn');
  autod.engage(mode, P.sim, road);
  if (mode === 2) toast(`🤖 자율주행 시작! ${nav.active ? '내비 경로를 따라가요' : '길을 따라가요 (내비 목적지를 정하면 거기까지 가요)'} · 제한속도 자동 · 깜빡이(Z/X)로 차로 변경 · 느린 차는 알아서 추월 · 브레이크(S)나 U로 끄기`, 'good', 4500);
  else toast(`🚗 스마트 크루즈 켜짐 · ${autod.set}km/h${autod.autoSpd ? ' (제한속도 자동)' : ''} · +/-: 속도 · Y: 제한속도 자동 · T: 차간거리 · S: 끄기${autod.onHwy ? '' : ' · 고속도로에선 구간 속도를 자동 유지'}`, 'good', 3500);
  audio.beep();
}
// 자율주행 · SCC 패널의 속도 버튼
$('#adas').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-ad]'); if (!b || !autod.on) return;
  e.preventDefault(); e.stopPropagation();
  if (b.dataset.ad === 'up') autod.adjust(5);
  else if (b.dataset.ad === 'dn') autod.adjust(-5);
  else { const on = autod.toggleAuto(G.road && G.road.limit); toast(on ? '🚦 제한속도를 따라가요' : '내가 정한 속도로 달려요 — ＋/− 로 맞춰요', 'info', 1600); return; }
  assistToast();
});
function assistToast() { toast(`${autod.manual ? '🤖 자율주행 내 속도' : '설정 속도'} <b>${autod.set}km/h</b>${autod.manual ? ' (제한속도와 상관없이 · 커브·신호·앞차에선 알아서 줄여요)' : ''} · 차간거리 ${'▮'.repeat(autod.gapI + 1)}${'▯'.repeat(3 - autod.gapI)}`, 'info', 1200); }
function updateAssistHud() {
  const el = $('#adas');
  if (!autod.on || G.P.onFoot) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const r = G.road && G.road.edge ? G.road : null, hw = !!(r && (r.kind === 'highway' || r.edge.elevated));
  const lim = autod.manual ? autod.set : hw && autod.hda ? Math.min(autod.set, r.limit) : autod.mode === 2 && r ? Math.min(autod.set, r.limit) : autod.set;
  const tags = `${hw && !autod.manual ? '<em class="hda">HDA</em>' : ''}${autod.autoSpd ? '<em>AUTO</em>' : autod.manual ? '<em class="me">내 속도</em>' : ''}`;
  const html = `<span class="ad-ico ${autod.mode === 2 ? 'auto' : ''}">${autod.mode === 2 ? '🤖' : '⟳'}</span><div><b>${lim}<small>km/h</small>${tags}</b><small>${autod.status}${lim < autod.set ? ' · 구간 제한' : ''}${autod.manual && r && autod.set > r.limit ? ` · 제한 ${r.limit} 초과` : ''}</small></div><div class="ad-spd"><button data-ad="dn" title="속도 -5 (-)">−</button><button data-ad="auto" class="${autod.autoSpd ? 'on' : ''}" title="제한속도 따라가기 (Y)">제한</button><button data-ad="up" title="속도 +5 (+)">＋</button></div><div class="ad-gap"><i class="car"></i>${[0, 1, 2, 3].map((k) => `<i class="${k <= autod.gapI ? 'on' : ''}"></i>`).join('')}${autod.lead && autod.lead.gap < 80 ? '<i class="car lead"></i>' : ''}</div>`;
  if (el.innerHTML !== html) el.innerHTML = html;
}
// 멀리 떨어진 내 차를 가까운 도로로 부르기
function callCar() {
  const P = G.P;
  let best = null;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const e of edgesNear(P.px + dx * 60, P.pz + dz * 60)) {
    if (e.elevated || e.ramp) continue;
    const s = clamp((P.px - e.a.x) * e.dir.x + (P.pz - e.a.z) * e.dir.z, 0, e.len);
    const d = Math.hypot(e.a.x + e.dir.x * s - P.px, e.a.z + e.dir.z * s - P.pz);
    if (!best || d < best.d) best = { e, s, d };
  }
  if (!best || best.d > 120) return toast('근처에 차를 세울 도로가 없어요', 'warn');
  const Ls = W.links.filter((L) => L.edge === best.e);
  const sOf = (L) => clamp(L.from === best.e.a ? best.s : L.len - best.s, L.s0 + 2, Math.max(L.s0 + 2, L.s1 - 2));
  const dOf = (L) => { const q = lanePos(L, L.n - 1, sOf(L)); return Math.hypot(q.x - P.px, q.z - P.pz); };
  const L = Ls.sort((a, b) => dOf(a) - dOf(b))[0];
  if (!L) return;
  const q = lanePos(L, L.n - 1, sOf(L));
  placePlayer(q.x, q.z, L.heading, 'surface');
  toast(`🚗 내 차를 불렀어요 — ${best.e.name || '도로'}에 세워 뒀어요`, 'good', 2500);
}
function fuelZone() { const P = G.P; return zoneAt(P.sim.x, P.sim.z, P.spec.ev ? 'ev' : 'fuel'); }
function enterFoot() {
  const P = G.P;
  P.onFoot = true;
  P.person = buildAvatar(S.avatar);
  scene.add(P.person);
  const s = Math.sin(P.sim.heading), c = Math.cos(P.sim.heading);
  const side = P.spec.type === 'bus' ? -1 : 1; // 버스는 앞문(오른쪽)으로 내림
  P.px = P.sim.x + c * side * (P.wid / 2 + 0.9) + s * (P.len / 2 - 1.2);
  P.pz = P.sim.z - s * side * (P.wid / 2 + 0.9) + c * (P.len / 2 - 1.2);
  P.ph = P.sim.heading; P.pphase = 0; P.plevel = P.sim.level;
  if (P.obj.doors.length) P.obj.doors[0].target = 1;
  toast('🚶 걸어서 둘러보세요. 차 옆에서 E를 누르면 다시 타요', 'info');
}
function exitFoot(silent) {
  const P = G.P;
  P.onFoot = false;
  if (P.person) scene.remove(P.person);
  P.person = null;
  if (P.obj.doors.length) P.obj.doors[0].target = 0;
  if (!silent) toast('🚗 탑승!', 'info', 900);
}

// ===================== 메시지 =====================
function toast(msg, kind = 'info', ms = 3200) {
  const box = $('#toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + kind; d.innerHTML = msg;
  box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
}
function hint(t) { const h = $('#hint'); if (h.textContent !== t) h.textContent = t; h.classList.remove('hidden'); G.hintT = 0.4; }
// 돈 쉽게 벌기: 모든 보상 3배
const EARN_MULT = 3;
function addMoney(n, reason) { n = Math.round(n * EARN_MULT); S.money += n; if (reason) toast(`<b>+${won(n)}</b> ${reason}`, 'money'); saveSoon(); return n; }
function fine(n, reason) { n = Math.round(n * 0.5); S.money = Math.max(0, S.money - n); toast(`<b>-${won(n)}</b> ${reason}`, 'bad'); saveSoon(); }
let saveTimer = null;
function saveSoon() { if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; save(); }, 1500); }

// ===================== 모드 시작 =====================
function quest(id, n) { questAdd(S, id, n, (q) => { toast(`📋 일일 퀘스트 완료: <b>${q.t}</b> — 메뉴의 퀘스트에서 보상을 받으세요!`, 'good', 4500); audio.coin(); saveSoon(); }); }
const ctx = {
  scene, audio, toast, hint, addMoney, fine, save: S, quest,
  get P() { return G.P; },
  get road() { return G.road; },
  get input() { return { handbrake: key('Space') || (G.P && G.P.park) }; },
  setMission(html) { if (html !== G.missionHTML) { G.missionHTML = html; $('#mission').innerHTML = html; } },
  placePlayer: (x, z, h, lv) => placePlayer(x, z, h, lv),
  summary(d) {
    G.state = 'pause';
    audio.engine({ on: false });
    summaryModal(d).then((i) => {
      if (i === 0) toMenu();
      else { endMission(); G.mission = new FreeMission(); G.mission.start(ctx); G.state = 'play'; }
    });
  },
};
function endMission() { if (G.mission) G.mission.dispose(scene); G.mission = null; G.missionHTML = ''; $('#mission').innerHTML = ''; if (nav && nav.auto) nav.stop(true); G.navKey = null; }

// 다른 도시에 가까워지면 (8km) 그 도시 지도를 미리 받아 붙임
function autoRegions(px, pz) {
  for (const d of W.regionDefs || []) {
    if (d.promise || !d.B) continue;
    const dx = Math.max(d.B.x0 - px, 0, px - d.B.x1), dz = Math.max(d.B.z0 - pz, 0, pz - d.B.z1);
    if (Math.hypot(dx, dz) < 8000) W.ensureRegion(d.id).then((ok) => { if (ok) toast(`🗺️ <b>${d.name}</b> 지도를 불러왔어요. 고속도로가 ${d.name} 시내 도로로 이어져요.`, 'good', 3500); });
  }
}
// 아직 안 불러온 도시가 필요하면 (그 도시에서 출발 · 그 도시 버스 노선) 지도를 먼저 받음
function regionNeeded(modeId, opts) {
  const mode = MODES.find((m) => m.id === modeId);
  if (mode && mode.veh === 'bus') {
    const r = (W.routes || []).find((x) => x.id === opts.route) || (W.pendingRoutes || []).find((x) => x.id === opts.route);
    return r && r.region && !W.regionDefs.find((d) => d.id === r.region).loaded ? r.region : null;
  }
  const sp = W.spawns[S.world.spawn];
  return sp && sp.lazy ? sp.lazy : null;
}
function loadRegionThen(id, fn) {
  const def = W.regionDefs.find((d) => d.id === id);
  toast(`🗺️ <b>${def ? def.name : id}</b> 지도를 받는 중이에요... (처음 한 번만)`, '', 4000);
  W.ensureRegion(id).then((ok) => { if (ok) fn(); else toast('지도를 받지 못했어요. 잠시 뒤 다시 해 주세요.', 'bad', 3000); });
}
function startMode(modeId, opts = {}) {
  if (!app.ready) { app.whenReady(() => startMode(modeId, opts)); return; }
  { const need = regionNeeded(modeId, opts); if (need) { loadRegionThen(need, () => startMode(modeId, opts)); return; } }
  audio.init();
  endMission();
  const mode = MODES.find((m) => m.id === modeId);
  let own = ownedBy(S.current);
  G.routeForSign = null;
  if (mode.veh === 'bus') {
    const route = W.routes.find((r) => r.id === opts.route) || W.routes[0];
    G.routeForSign = route;
    const WR = withLinks(route) || route;
    const T = BUS_TYPES[route.type] || BUS_TYPES.trunk;
    if (opts.bus === 'company' || !ownedBy(opts.bus)) own = { uid: -1, id: routeModelOf(WR) || T.models[0], color: '#ffffff', wheel: 'std', plate: randomPlate('bus'), tune: { engine: 0, brake: 0, handling: 0 }, livery: route.type === 'trunk' && Math.random() < 0.35 ? 'teal' : T.livery, company: companyNameOf(WR), fuel: 100, temp: true };
    else own = ownedBy(opts.bus);
  } else if (mode.veh === 'car' && BY_ID[own.id].type === 'bus') {
    own = S.owned.find((o) => BY_ID[o.id].type === 'car') || own;
  }
  setPlayer(own);
  const route = G.routeForSign;
  let m;
  switch (modeId) {
    case 'bus': m = new BusRouteMission(withLinks(route), {}); break;
    case 'stopping': m = new BusRouteMission(withLinks(route), { precision: true }); break;
    case 'passenger': m = new BusRouteMission(withLinks(route), { schedule: true }); break;
    case 'highway': m = new CheckpointMission('highway'); break;
    case 'mountain': m = new CheckpointMission('mountain'); break;
    case 'parking': m = new ParkingMission(); break;
    case 'ugparking': m = new ParkingMission('ug'); break;
    default: m = new FreeMission(mode.name);
  }
  if (m instanceof FreeMission) placeAt(W.spawns[S.world.spawn] || W.spawns.city);
  G.mission = m;
  m.start(ctx);
  env.hour = S.world.hour; env.setWeather(S.world.weather);
  for (const a of traffic.cars) { a.active = false; a.obj.group.visible = false; }
  traffic.initialPlace(G.P.sim.x, G.P.sim.z, desiredTraffic());
  G.state = 'play';
  hideAll();
  $('#hud').classList.remove('hidden');
  toast(`<b>${mode.name}</b> 시작! W/S 가속·브레이크, A/D 핸들, C 카메라, F1 도움말`, 'info', 5000);
  if (G.P.spec.type === 'bus') { G.camMode = 1; toast('🚌 운전석 시점이에요 (C로 카메라 바꾸기) · 1: 앞문 · 2: 뒷문', 'info', 5000); }
}
function withLinks(r) { return W.routes.find((x) => x.id === r.id); }
function pause() { if (G.state !== 'play') return; G.state = 'pause'; audio.engine({ on: false }); audio.horn(false); show('pause'); }
function resume() {
  if (G.state !== 'pause') return;
  hideAll();
  if (G.dirtyVehicle && G.P && !G.P.own.temp) {
    G.dirtyVehicle = false;
    const o = ownedBy(S.current);
    if (o && (!G.mission || G.mission instanceof FreeMission || (BY_ID[o.id].type === G.P.spec.type))) setPlayer(o);
  }
  G.state = 'play';
  $('#hud').classList.remove('hidden');
}
function toMenu() {
  endMission();
  G.state = 'menu';
  $('#hud').classList.add('hidden');
  toggleBigMap(false);
  audio.engine({ on: false }); audio.horn(false);
  try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
  if (nav) nav.stop(true);
  $('#navui').classList.add('hidden'); $('#nav-bar').classList.add('hidden'); $('#camwarn').classList.add('hidden');
  G.routeForSign = null;
  setPlayer(ownedBy(S.current));
  placeAt(W.spawns.city);
  save();
  show('title');
}
function desiredTraffic() {
  const base = Math.round(({ low: 30, normal: 60, high: 95 }[S.settings.traffic] || 60) * (Q === 'low' ? 0.6 : Q === 'medium' ? 0.85 : 1));
  const h = env ? env.hour : 12;
  const m = (h >= 7 && h < 9.5) || (h >= 17.5 && h < 19.5) ? 1.3 : h < 5 ? 0.35 : h >= 22 ? 0.6 : 1;
  const hw = G.road && G.road.edge && G.road.edge.corr ? 0.55 : 1; // 서울 가는 고속도로는 길이 하나라 덜 촘촘하게
  return Math.min(traffic ? traffic.cars.length : 60, Math.round(base * m * hw));
}
// 아직 지도를 받지 않은 도시: 그림으로 그린 도시 풍경
function skylineThumb(id, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  let seed = id.length * 97 + id.charCodeAt(0); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#16233f'); sky.addColorStop(0.55, '#3d4f86'); sky.addColorStop(0.8, '#e98b62'); sky.addColorStop(1, '#f6c27a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.5})`; g.fillRect(rnd() * w, rnd() * h * 0.45, 1.5, 1.5); }
  const base = h * 0.82;
  if (id === 'seoul') { // 남산 + 타워 · 롯데월드타워
    g.fillStyle = '#1b2440'; g.beginPath(); g.moveTo(10, base); g.quadraticCurveTo(70, base - 90, 130, base); g.fill();
    g.fillRect(68, base - 150, 5, 70); g.fillRect(63, base - 110, 15, 8);
    g.beginPath(); g.moveTo(178, base); g.lineTo(186, base - 205); g.lineTo(194, base); g.fill();
  } else if (id === 'busan') { // 광안대교 + 해운대 고층
    g.fillStyle = '#1b2440'; for (const [x, hh] of [[150, 190], [166, 170], [182, 205]]) g.fillRect(x, base - hh, 12, hh);
    g.strokeStyle = '#8fb3ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, base - 18); g.lineTo(w, base - 18); g.stroke();
    for (const x of [60, 120]) { g.fillStyle = '#1b2440'; g.fillRect(x, base - 70, 4, 70); g.beginPath(); g.moveTo(x + 2, base - 70); g.quadraticCurveTo(x - 25, base - 30, x - 50, base - 18); g.moveTo(x + 2, base - 70); g.quadraticCurveTo(x + 30, base - 30, x + 60, base - 18); g.strokeStyle = '#8fb3ff'; g.stroke(); }
  } else { // 대전: 한빛탑
    g.fillStyle = '#1b2440'; g.fillRect(150, base - 160, 6, 160); g.beginPath(); g.arc(153, base - 150, 13, 0, Math.PI * 2); g.fill();
  }
  for (let x = 0; x < w;) {
    const bw = 14 + rnd() * 26, bh = 40 + rnd() * 120;
    g.fillStyle = '#121a30'; g.fillRect(x, base - bh, bw, bh);
    for (let yy = base - bh + 6; yy < base - 4; yy += 9) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (rnd() < 0.35) { g.fillStyle = 'rgba(255,214,140,.85)'; g.fillRect(xx, yy, 3, 4); }
    x += bw + 2;
  }
  g.fillStyle = '#0b2a3d'; g.fillRect(0, base, w, h - base);
  g.fillStyle = 'rgba(246,194,122,.35)'; for (let i = 0; i < 12; i++) g.fillRect(rnd() * w, base + 4 + rnd() * (h - base - 8), 20 + rnd() * 30, 2);
  return c.toDataURL('image/jpeg', 0.85);
}
// 구별 미리보기 사진 (실제 3D 지도를 찍어서)
function makeThumbs() {
  if (G.thumbs) return G.thumbs;
  const out = {};
  const w = 240, h = 300, pr = renderer.getPixelRatio();
  const cam = new THREE.PerspectiveCamera(58, w / h, 0.5, 2500);
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const g = tmp.getContext('2d');
  const size = new THREE.Vector2(); renderer.getSize(size);
  try {
    for (const d of DISTRICTS) {
      const sp = W.spawns[d.spawns[0]]; if (!sp) continue;
      if (sp.lazy) { out[d.id] = skylineThumb(d.id, w, h); continue; }
      buildBuildingsNear(sp.x, sp.z, 500); buildCorridorNear(sp.x, sp.z); buildRegionNear(sp.x, sp.z);
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
      cam.position.set(sp.x - fx * 26 + fz * 6, 14, sp.z - fz * 26 - fx * 6);
      cam.lookAt(sp.x + fx * 70, 4, sp.z + fz * 70);
      env.update(0.016, sp, cam.position);
      renderer.shadowMap.needsUpdate = true;
      renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
      renderer.render(scene, cam);
      g.drawImage(renderer.domElement, 0, renderer.domElement.height - h * pr, w * pr, h * pr, 0, 0, w, h);
      out[d.id] = tmp.toDataURL('image/jpeg', 0.82);
    }
  } catch (e) { console.warn('thumbs', e); }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y);
  G.thumbs = out;
  return out;
}
const app = {
  W, audio, thumbs: makeThumbs, ready: false, waiters: [],
  whenReady(f) { if (app.ready) f(); else { app.waiters.push(f); toast('🗺️ 광주 지도를 마저 준비하고 있어요. 곧 시작해요!', '', 2500); } },
  startMode, resume, toMenu,
  inGame: () => G.state === 'play' || G.state === 'pause',
  applySettings() { audio.setVolume(S.settings.volume); audio.voice = S.settings.voice; G.mirrorsOn = S.settings.mirrors; },
  setTimeWeather(h, w) { if (env) { env.hour = h; env.setWeather(w); } },
  toHub(id) { const h = HUBS.find((x) => x.id === id); if (!h) return; const q = hubCurb(h) || { x: h.x, z: h.z, heading: 0 }; placePlayer(q.x, q.z, q.heading); },
  teleport(k) {
    const sp = W.spawns[k]; if (!sp) return;
    if (sp.lazy) { loadRegionThen(sp.lazy, () => app.teleport(k)); return; }
    if (G.mission && !(G.mission instanceof FreeMission)) { endMission(); G.mission = new FreeMission(); G.mission.start(ctx); }
    placeAt(sp);
    for (const a of traffic.cars) { a.active = false; a.obj.group.visible = false; }
    traffic.initialPlace(G.P.sim.x, G.P.sim.z, desiredTraffic());
    hideAll(); G.state = 'play'; $('#hud').classList.remove('hidden');
  },
  onAvatarChanged() { showroom.setAvatar(S.avatar); },
  playerPose() { const P = G.P; if (!P) return { x: 0, z: 0, heading: 0 }; return P.onFoot ? { x: P.px, z: P.pz, heading: G.camHeading } : { x: P.sim.x, z: P.sim.z, heading: P.sim.heading, level: P.sim.level }; },
  playerPos() { return G.state === 'menu' ? null : app.playerPose(); },
  roadName() { return G.road && G.road.name; },
  toast: (m, k, ms) => toast(m, k, ms),
  companyName: (R) => companyNameOf(R),
  routeModel: (R) => routeModelOf(R),
  companyNames: () => (S.admin && S.admin.companies ? S.admin.companies.map((c) => c.name) : []),
  onVehicleChanged() { showroom.setFeatured(ownedBy(S.current)); if (!app.ready) return; if (G.state === 'menu') { setPlayer(ownedBy(S.current)); placeAt(W.spawns.city); } else G.dirtyVehicle = true; },
};

// 디버그용 (콘솔에서 window.__bitgoeul 로 상태 확인)
window.__bitgoeul = { app, G, get showroom() { return showroom; }, get nav() { return nav; }, get traffic() { return traffic; }, interact: () => interact(), enterFoot: () => enterFoot(), action: (c) => action(c), autod };

// ===================== 메인 루프 =====================
let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt); last = now;
  fpsAcc += rawDt; fpsN++; perfTick(rawDt);
  if (fpsAcc > 0.5) { const f = $('#fps'); f.classList.toggle('hidden', !S.settings.fps); f.textContent = `${(fpsAcc / fpsN * 1000).toFixed(1)} ms (${Math.round(fpsN / fpsAcc)} fps)`; fpsAcc = 0; fpsN = 0; }
  G.frame++;
  if (app.ready && G.P) { const P = G.P, px = P.onFoot ? P.px : P.sim.x, pz = P.onFoot ? P.pz : P.sim.z; streamBuildings(px, pz, G.state === 'play' ? (Q === 'low' ? 2 : 3) : 9); if (G.state === 'play' && G.frame % 2 === 0) streamCorridor(px, pz); if (G.state === 'play' && G.frame % 2 === 1) streamRegion(px, pz); if (G.state === 'play' && G.frame % 30 === 0) autoRegions(px, pz); }
  if (S.infMoney && G.frame % 30 === 0) { if (S.money < 1e15) S.money = 1e15; if (S.admin && S.admin.cash < 1e15) S.admin.cash = 1e15; } // 관리자 돈 무제한
  if (G.state === 'play') updatePlay(dt);
  else if (G.state === 'menu') updateMenu(dt);
  render();
}

function updateMenu(dt) {
  G.menuT += dt;
  camera.near = 0.1; camera.fov = 45;
  showroom.update(dt, camera);
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

function playerAgent() {
  const P = G.P, s = P.sim;
  const tp = transit && transit.pos();
  const c = tp || (P.onFoot ? { x: P.px, z: P.pz } : null);
  return { x: s.x, z: s.z, fx: Math.sin(s.heading), fz: Math.cos(s.heading), v: Math.abs(s.vl), len: P.len, wid: P.wid, cx: c ? c.x : undefined, cz: c ? c.z : undefined };
}
function camInfo() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return { x: camera.position.x, z: camera.position.z, fx: d.x, fz: d.z }; }

// 통행료: 개방식(요금소마다), 폐쇄식(들어올 때 통행권, 나갈 때 거리만큼: 1종 900원 + km당 44.3원, 2종 45.2원, 경차 50%)
function tollFor(km) {
  const P = G.P, bus = P.spec.type === 'bus';
  let f = (bus ? 900 : 900) + km * (bus ? 45.2 : 44.3);
  if (!bus && /경/.test(P.spec.cls || '')) f *= 0.5;
  return Math.max(0, Math.round(f / 100) * 100);
}
function payToll(t) {
  const P = G.P, bus = P.spec.type === 'bus', light = !bus && /경/.test(P.spec.cls || '');
  audio.beep();
  if (t.kind === 'open') {
    const fee = Math.round((t.fee * (bus ? 1.3 : light ? 0.5 : 1)) / 100) * 100;
    S.money = Math.max(0, S.money - fee);
    toast(`🛣️ ${t.name} 하이패스 통과 <b>-${fee.toLocaleString()}원</b>`, 'money', 2200);
    return;
  }
  if (t.kind === 'closed') {
    const tk = G.hwTicket;
    if (!tk || tk.name === t.name) {
      G.hwTicket = { name: t.name, s: t.s ?? 0, x: t.x, z: t.z, km: t.km };
      toast(`🎫 ${t.name} 진입 · 하이패스 통행권 기록 <small>(나가는 요금소에서 거리만큼 정산)</small>`, 'good', 2600);
      return;
    }
    const km = Math.abs((t.km ?? 0) - (tk.km ?? 0)) || Math.hypot(t.x - tk.x, t.z - tk.z) / 1000;
    const fee = tollFor(km);
    S.money = Math.max(0, S.money - fee);
    G.hwTicket = null;
    toast(`🛣️ ${tk.name} → ${t.name} ${km.toFixed(0)}km · 하이패스 <b>-${fee.toLocaleString()}원</b>`, 'money', 3200);
    return;
  }
  toast(`🛣️ ${t.name} 하이패스 통과`, '', 1500);
}

function updatePlay(dt) {
  const P = G.P, sim = P.sim;
  G.simT += dt;
  W.refY = P.onFoot ? undefined : P.y; sim.py = P.y; // 여러 층 고가에서 지금 높이 기준
  env.hour = (env.hour + (dt * S.settings.timeSpeed) / 3600) % 24;
  S.world.hour = env.hour;
  G.sigT -= dt; if (G.sigT <= 0) { G.sigT = 0.2; updateSignals(G.simT); updateRegionSignals(G.simT); }

  // ---- 조작 ----
  const camName = CAMS[G.camMode][0];
  const control = !P.onFoot && camName !== 'free';
  const tl = control && key('KeyA', 'ArrowLeft'), tr = control && key('KeyD', 'ArrowRight');
  let steerT = (tl ? 1 : 0) - (tr ? 1 : 0);
  if (control && G.wheelSteer && !tl && !tr) steerT = G.wheelSteer;
  // ---- 운전 보조 (SCC · 자율주행) ----
  const uThr = control && key('KeyW', 'ArrowUp'), uBrk = control && key('KeyS', 'ArrowDown');
  let ad = null;
  if (autod.on) {
    if (!control || P.onFoot || P.park || !P.engine || (P.gearMode !== 'auto' && P.gearMode !== 'D')) { autod.off(); toast('운전 보조가 꺼졌어요', 'info', 1400); }
    else if (uBrk) { autod.off(); toast('🦶 브레이크를 밟아 운전 보조가 꺼졌어요', 'info', 1600); }
    else {
      ad = autod.update(dt, { sim, P, cars: traffic.cars, agents: mp.agents().concat(hazards.obstacles), nav, simT: G.simT, isBus: P.spec.type === 'bus', hz: hazards });
      if (ad && ad.lost) { toast(ad.lost, ad.done ? 'good' : 'warn', 2500); ad = null; }
      else if (ad && ad.steer !== null && !tl && !tr && !G.wheelHeld) steerT = ad.steer;
      if (ad && ad.blink !== undefined && autod.mode === 2 && !P.hazard) { if (ad.blink) { P.blink = ad.blink; G.autoBlink = true; } else if (G.autoBlink) { P.blink = 0; G.autoBlink = false; } }
    }
  }
  if (!control) G.wheelSteer = 0;
  const sr = steerT === 0 ? 5 : Math.sign(steerT) !== Math.sign(G.steerIn) ? 6 : (P.spec.type === 'bus' ? 2.2 : 3.2);
  G.steerIn += clamp(steerT - G.steerIn, -sr * dt, sr * dt);
  if (G.wheelSteer && !G.wheelHeld) G.wheelSteer *= 1 - Math.min(1, dt * 2.5);
  $('#wheelpad svg') && ($('#wheelpad svg').style.transform = `rotate(${-G.steerIn * 135}deg)`);
  let thrT = uThr ? 1 : 0, brkT = uBrk ? 1 : 0;
  if (ad && !uThr) { thrT = ad.throttle; brkT = ad.brake; }
  G.thrIn += clamp(thrT - G.thrIn, -4 * dt, (P.spec.type === 'bus' ? 1.6 : 3) * dt);
  G.brkIn += clamp(brkT - G.brkIn, -6 * dt, 4 * dt);
  const handbrake = (control && key('Space')) || !control || P.park || !!(ad && ad.hold && !uThr);
  const noFuel = P.own.fuel <= 0;

  // ---- 물리 ----
  let impact = 0;
  if (!P.onFoot) {
    const n = Math.ceil(dt / 0.0125);
    for (let i = 0; i < n; i++) impact = Math.max(impact, sim.step(dt / n, { throttle: G.thrIn, brake: G.brkIn, steer: G.steerIn, handbrake, gearMode: P.gearMode, engineOff: !P.engine }, { grip: env.grip, noFuel }));
    // AI 차량과 충돌
    for (const a of traffic.cars) {
      if (!a.active) continue;
      const d = Math.hypot(a.x - sim.x, a.z - sim.z);
      if (d > (a.len + P.len) / 2 + 3) continue;
      const k = Math.max(2, Math.round(a.len / a.wid));
      for (let i = 0; i < k; i++) {
        const off = -a.len / 2 + a.wid / 2 + ((a.len - a.wid) * i) / (k - 1);
        const imp = sim.pushFrom(a.x + a.fx * off, a.z + a.fz * off, a.wid / 2);
        if (imp > 0) { impact = Math.max(impact, imp); a.v = 0; }
      }
    }
    if (mp.active) for (const a of mp.agents()) {
      if (Math.hypot(a.x - sim.x, a.z - sim.z) > (a.len + P.len) / 2 + 3) continue;
      const k = Math.max(2, Math.round(a.len / a.wid));
      for (let i = 0; i < k; i++) { const off = -a.len / 2 + a.wid / 2 + ((a.len - a.wid) * i) / (k - 1); impact = Math.max(impact, sim.pushFrom(a.x + a.fx * off, a.z + a.fz * off, a.wid / 2)); }
    }
    impact = Math.max(impact, train.collide(sim));
  } else {
    if (transit) transit.update(dt);
    const tp = transit && transit.pos();
    if (tp) { P.px = tp.x; P.pz = tp.z; } else if (!(transit && transit.riding)) updateFoot(dt);
  }
  // 층 / 경사로
  if (!P.onFoot) {
    const lv = levelAt(sim.x, sim.z, sim.level);
    sim.level = lv.level;
    if (P.spec.type === 'bus' && lv.ramp !== undefined && !G.rampWarn) { G.rampWarn = true; toast('🚫 높이제한 2.3m — 버스는 지하주차장에 들어갈 수 없어요', 'warn'); }
    if (lv.ramp === undefined) G.rampWarn = false;
  }
  // 열차 / 건널목
  train.update(dt, { x: sim.x, z: sim.z });
  audio.trainRumble(train.near * Math.min(1, train.v / 10 + 0.15));
  let nearCross = null;
  for (const c of W.crossings) if (W.crossDown[c.id] && Math.hypot(c.x - sim.x, c.z - sim.z) < 150) nearCross = c;
  if (nearCross && !G.crossWaited && sim.kmh < 1 && Math.hypot(nearCross.x - sim.x, nearCross.z - sim.z) < 40) { G.crossWaited = true; quest('cross', 1); toast('👍 잘했어요! 열차가 지나갈 때까지 기다려요', 'good', 2500); }
  if (!nearCross) G.crossWaited = false;
  if (nearCross && G.frame % 22 === 0) audio.crossingBell(Math.max(0.2, 1 - Math.hypot(nearCross.x - sim.x, nearCross.z - sim.z) / 150));
  // 철도 선을 넘었는지 (건널목 근처, 차단기 내려감)
  for (const c of W.crossings) {
    if (Math.hypot(c.x - sim.x, c.z - sim.z) > 20) continue;
    const side = (sim.x - c.x) * -c.dir.z + (sim.z - c.z) * c.dir.x;
    const key = 'cs' + c.id;
    if (!P.onFoot && G[key] !== undefined && G[key] * side < 0 && W.crossDown[c.id]) {
      if (G.mission && !(G.mission instanceof FreeMission)) fine(500000, '🚂 차단기가 내려간 건널목을 건너면 아주 위험해요!');
      else toast('🚂 위험! 차단기가 내려가면 기차가 지나갈 때까지 기다려요', 'bad');
    }
    G[key] = side;
  }
  G.impactCool -= dt;
  if (impact > 1.2 && G.impactCool <= 0) {
    G.impactCool = 1.2;
    audio.crash(impact);
    G.shake = Math.min(1, impact / 8);
    if (G.mission && G.mission.onImpact) G.mission.onImpact(impact);
    else if (G.mission && !(G.mission instanceof FreeMission) && impact > 3) fine(100000, '충돌! 안전 운전하세요');
    else if (impact > 3) toast('💥 쿵! 조심하세요', 'warn', 1500);
  }

  // ---- 연료 ----
  if (!P.onFoot) {
    const eco = { hev: 0.55, phev: 0.4, diesel: 0.8 }[trimKind(P.spec, P.own.trim)] || 1; // 하이브리드·디젤은 연비가 좋아요
    const used = Math.abs(sim.vl) * dt * (0.25 + 0.75 * G.thrIn) * (100 / (P.spec.type === 'bus' ? 45000 : 60000)) * eco;
    P.own.fuel = Math.max(0, P.own.fuel - used);
    if (G.refuel) { G.refuel.t += dt; P.own.fuel = Math.min(100, P.own.fuel + dt * 35); if (P.own.fuel >= 100 || sim.kmh > 3) { G.refuel = null; toast('가득 찼어요! 👍', 'good', 1500); } }
  }

  // ---- 일일 퀘스트 거리 ----
  if (!P.onFoot) {
    G.qDist = (G.qDist || 0) + Math.abs(sim.vl) * dt;
    if (G.qDist >= 100) {
      G.qDist -= 100; quest('km', 0.1);
      if (env.nightF > 0.5) quest('night', 0.1);
      if (G.road && G.road.kind === 'highway') quest('hwy', 0.1);
    }
  }
  // ---- 표시등/장치 ----
  const blinkOn = (G.simT % 0.75) < 0.4;
  if ((P.blink || P.hazard) && blinkOn !== P.lastBlinkOn) audio.tick(blinkOn);
  P.lastBlinkOn = blinkOn;
  if (P.blink && !P.hazard) { P.blinkAcc += sim.yawRate * dt; if (Math.abs(P.blinkAcc) > 1.1 && Math.abs(G.steerIn) < 0.1) { P.blink = 0; } }
  if (P.wiper) P.wiperPh += dt * (P.wiper === 1 ? 2.6 : 5);
  else P.wiperPh = 0;
  // ---- 과속방지턱 · 포트홀 · 싱크홀 ----
  const hz = sim.level === 'hwy' ? null : hazards.check(sim.x, sim.z, sim.kmh);
  if (hz && P.bumpT <= 0 && !G.sinkT) {
    const kmh = Math.abs(sim.kmh);
    if (hz.kind === 'bump' && kmh > 8) {
      P.bumpT = 0.4; P.bumpAmp = clamp(kmh / 30, 0.4, 3); audio.bump();
      if (kmh > 30) { G.shake = Math.min(1.2, kmh / 50); sim.vl *= 0.86; toast(kmh > 45 ? '💥 덜컹! 과속방지턱을 너무 빨리 넘었어요' : '과속방지턱! 천천히 지나가세요', 'warn', 1500); }
      if (hz.school && kmh > 33) fine(40000, '어린이 보호구역 과속방지턱 과속 (30km/h)');
    } else if (hz.kind === 'pot' && kmh > 10) {
      P.bumpT = 0.4; P.bumpAmp = clamp(kmh / 40, 0.5, 2); audio.bump(); G.shake = Math.min(0.8, kmh / 70);
      if (kmh > 40) toast('🕳️ 포트홀! 덜컹', 'warn', 1200);
    } else if (hz.kind === 'sink') {
      G.sinkT = 2.2; G.sinkHole = hz.h; sim.vl = 0; G.shake = 1.6; audio.bump();
      autod.off();
      toast('🕳️ 싱크홀에 빠졌어요! 견인차를 불러요…', 'bad', 3000);
    }
  }
  if (G.sinkT) {
    G.sinkT -= dt; sim.vl = 0;
    if (G.sinkT <= 0) {
      const h = G.sinkHole; G.sinkT = 0;
      const bx = h.x - Math.sin(sim.heading) * (h.r + 9), bz = h.z - Math.cos(sim.heading) * (h.r + 9);
      placePlayer(bx, bz, sim.heading, 'surface');
      fine(300000, '싱크홀 견인 · 수리비');
    }
  }
  P.bumpT -= dt;
  syncPlayerModel(dt, blinkOn);

  // ---- 도로 정보 / 위반 ----
  G.roadT -= dt;
  if (G.roadT <= 0) {
    G.roadT = 0.12;
    const prev = G.road;
    G.road = roadInfoAt(sim.x, sim.z, sim.level === 'hwy' ? 'hwy' : 'surface');
    checkViolations(prev, G.road);
    updateRoadHud();
  }
  // 톨게이트
  let tz = P.onFoot ? null : zoneAt(sim.x, sim.z, 'toll');
  if (tz && tz.y !== undefined && Math.abs(tz.y - P.y) > 3) tz = null;
  if (tz && !G.prevToll) payToll(tz.toll || { name: '톨게이트', kind: 'open', fee: 1100 });
  G.prevToll = tz;
  // 휴게소
  const rz = P.onFoot ? null : zoneAt(sim.x, sim.z, 'rest');
  if (rz && rz !== G.prevRest) toast(`🍜 <b>${rz.name}</b> · 주유소에서 기름을 넣을 수 있어요`, 'good', 2600);
  G.prevRest = rz;
  // 주행 수당 (어떤 모드든 1km마다)
  if (!P.onFoot) {
    G.payDist = (G.payDist || 0) + Math.abs(sim.vl || 0) * dt;
    if (G.payDist >= 1000) { G.payDist -= 1000; G.payKm = (G.payKm || 0) + 1; const got = addMoney(P.spec.type === 'bus' ? 30000 : 20000, null); if (G.payKm % 3 === 0) toast(`🚗 주행 수당 ${G.payKm}km · <b>+${won(got * 3)}</b>`, 'money', 1800); }
  }
  // 명소 발견
  if (G.frame % 20 === 0) for (const l of W.landmarks) if (!l.place && !S.visited.includes(l.name) && Math.hypot(l.x - sim.x, l.z - sim.z) < l.r) { S.visited.push(l.name); addMoney(2000000, `새로운 장소 발견: <b>${l.name}</b>`); audio.coin(); }
  // 상호작용 안내
  let prompt = '';
  if (P.onFoot) {
    const tp = transit ? transit.prompt(P.px, P.pz) : null;
    const dc = Math.hypot(P.px - sim.x, P.pz - sim.z);
    const hb = tp == null && G.frame % 1 === 0 ? hubNear(P.px, P.pz) : null;
    prompt = tp != null ? tp : hb ? `E: ${hb.kind === 'air' ? '✈️ 항공권 사기' : hb.kind === 'xbus' ? '🚌 고속버스 표 사기' : '🚄 승차권 사기'} (${hb.name})` : dc < P.len / 2 + 3 ? 'E: 차에 타기' : dc > 60 ? 'E: 내 차 부르기' : '';
  }
  else if (sim.kmh < 2) {
    const fz = fuelZone();
    const hb = hubNear(sim.x, sim.z, 90);
    if (hb && !(G.mission && G.mission.riders)) prompt = `E: 내려서 ${hb.kind === 'air' ? '✈️ 항공권 사기' : hb.kind === 'xbus' ? '🚌 고속버스 표 사기' : '🚄 승차권 사기'} (${hb.name})`;
    else
    if (P.own.fuel <= 0.5 && !fz) prompt = '연료가 다 떨어졌어요! E: 긴급출동 (20만원)';
    else if (fz && P.own.fuel < 99 && !G.refuel) prompt = `E: ${P.spec.ev ? '충전하기' : '주유하기'} (${fz.name})`;
    else if (G.refuel) prompt = `${P.spec.ev ? '충전' : '주유'} 중... ${Math.round(P.own.fuel)}%`;
  } else if (P.own.fuel < 12) prompt = `⚠️ ${P.spec.ev ? '배터리' : '연료'}가 얼마 남지 않았어요 — 주유소/충전소를 찾아가세요`;
  const pe = $('#prompt'); if (pe.textContent !== prompt) { pe.textContent = prompt; pe.classList.toggle('hidden', !prompt); }
  const riding = !!(transit && transit.riding);
  if (riding !== G.wasRiding) { G.wasRiding = riding; document.body.classList.toggle('riding', riding); }

  // ---- 미션 ----
  if (G.mission) G.mission.update(dt, ctx);
  // ---- 내비 · 버스 운영 정산 ----
  missionNav();
  const pose = app.playerPose();
  const ni = nav.update(dt, { ...pose, kmh: P.onFoot ? 0 : sim.kmh }, { camPos: camera.position });
  if (G.frame % 6 === 0) { updateNavHud(ni); updateAssistHud(); }
  if (G.frame % 3 === 0) updateHudProj(ni);
  adminTick(env.hour);
  G.hintT -= dt; if (G.hintT <= 0) $('#hint').classList.add('hidden');

  // ---- 교통 ----
  hazards.update(dt, dt, P.onFoot ? P.px : sim.x, P.onFoot ? P.pz : sim.z, toast, nav);
  traffic.update(dt, G.simT, playerAgent(), camInfo(), desiredTraffic(), env.nightF, mp.agents().concat(hazards.obstacles));
  if (mp.active) {
    mp.update(dt, (G.simT % 0.75) < 0.4);
    const o = P.obj;
    mp.publish(dt, { name: S.mp.name, v: P.spec.id, c: P.own.color, l: P.own.livery, rt: G.routeForSign ? G.routeForSign.id : null, x: P.onFoot ? P.px : sim.x, z: P.onFoot ? P.pz : sim.z, h: sim.heading, y: P.y, s: sim.kmh, d: (o.doors[0]?.target ? 1 : 0) | (o.doors[1]?.target ? 2 : 0), lt: P.lights, b: (P.blink === -1 || P.hazard ? 1 : 0) | (P.blink === 1 || P.hazard ? 2 : 0) });
    if (G.frame % 30 === 0) { const n = mp.list().length; $('#mpbox').textContent = `👥 채널 ${mp.channel} · ${n}명 · Enter 채팅`; }
  }
  if (!S.settings.peds) for (const p of traffic.peds) { p.active = false; p.mesh.visible = false; }

  // ---- 카메라 / 환경 / 소리 ----
  updateCamera(dt);
  env.update(dt, sim, camera.position);
  setEnvIntensity(0.25 + 0.75 * env.dayF);
  if (!P.cabin) MAT_CABIN.emissiveIntensity = 0.03;
  audio.engine({ premium: P.spec.type !== 'bus' && hasOpt(P.own, 'sound'), on: !P.onFoot && !noFuel && P.engine, rpm: sim.rpm, throttle: G.thrIn, speed: Math.abs(sim.vl), isBus: P.spec.type === 'bus', ev: P.spec.ev || (/hev/.test(trimKind(P.spec, P.own.trim)) && Math.abs(sim.vl) < 8 && G.thrIn < 0.6), slip: sim.slip, rain: env.w.rain || 0 });
  updateHud(dt);
  if (G.frame % 600 === 0) save();
}

function checkViolations(prev, cur) {
  const P = G.P, sim = P.sim;
  if (P.onFoot) return;
  const strict = G.mission && !(G.mission instanceof FreeMission);
  // 신호위반
  if (prev && cur && prev.link && cur.link === prev.link && cur.link.to.signal && prev.s < cur.link.stopS && cur.s >= cur.link.stopS && sim.kmh > 3) {
    const st = signalState(cur.link.to, cur.link.axis, G.simT);
    const turningRight = P.blink === 1 && cur.lane === cur.link.n - 1;
    if (st.s === 'G' || st.l === 'G') quest('green', 1);
    if (st.s === 'R' && st.l !== 'G' && !turningRight) {
      if (strict) fine(300000, '🚦 신호위반! 빨간불에서는 멈춰야 해요');
      else toast('🚦 신호위반! 빨간불이었어요', 'bad');
    }
  }
  // 과속
  if (cur && cur.limit && sim.kmh > cur.limit + 10) G.speedT += 0.12; else G.speedT = 0;
  if (G.speedT > 3 && G.simT - G.speedWarn > 12) {
    G.speedWarn = G.simT;
    if (strict) fine(200000, `과속! 제한속도는 ${cur.limit}km/h`);
    else toast(`⚠️ 과속 중! 제한속도 ${cur.limit}km/h`, 'warn');
  }
  // 버스전용차로 (승용차)
  if (P.spec.type !== 'bus' && cur && cur.link && cur.link.bus && cur.lane === cur.link.n - 1 && env.hour >= 7 && env.hour < 21 && sim.kmh > 5 && cur.s < cur.link.stopS - 40) G.busLaneT += 0.12; else G.busLaneT = 0;
  if (G.busLaneT > 3) { G.busLaneT = -20; toast('🚌 버스전용차로예요! 승용차는 다른 차로로 가 주세요', 'warn'); }
}

// ---- 걷기 ----
const _cands = [];
function updateFoot(dt) {
  const P = G.P;
  const run = key('ShiftLeft', 'ShiftRight') ? 4.5 : 1.7;
  let mx = 0, mz = 0;
  if (key('KeyW', 'ArrowUp')) mz += 1; if (key('KeyS', 'ArrowDown')) mz -= 1;
  if (key('KeyA', 'ArrowLeft')) mx += 1; if (key('KeyD', 'ArrowRight')) mx -= 1;
  const yaw = G.camHeading + G.lookYaw;
  const moving = mx || mz;
  if (moving) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const nx = P.px + dx * run * dt, nz = P.pz + dz * run * dt;
    if (!blocked(nx, nz)) { P.px = nx; P.pz = nz; }
    P.ph = Math.atan2(dx, dz);
    queryColliders(P.px, P.pz, 1, _cands);
    for (const k of _cands) {
      if (k.lvl && k.lvl !== 'both' && k.lvl !== (P.plevel || 'surface')) continue;
      if (k.t === 2) { const q = obNearest(k, P.px, P.pz); const d = Math.hypot(P.px - q.x, P.pz - q.z); if (q.inside) { P.px = q.x + (q.x - k.cx) * 0.02; P.pz = q.z + (q.z - k.cz) * 0.02; } else if (d < 0.3 && d > 0) { P.px = q.x + ((P.px - q.x) / d) * 0.3; P.pz = q.z + ((P.pz - q.z) / d) * 0.3; } }
      else if (k.t === 0) { const cx = clamp(P.px, k.x0, k.x1), cz = clamp(P.pz, k.z0, k.z1); const d = Math.hypot(P.px - cx, P.pz - cz); if (d < 0.3 && d > 0) { P.px = cx + ((P.px - cx) / d) * 0.3; P.pz = cz + ((P.pz - cz) / d) * 0.3; } }
      else { const d = Math.hypot(P.px - k.x, P.pz - k.z); if (d < k.r + 0.3 && d > 0) { P.px = k.x + ((P.px - k.x) / d) * (k.r + 0.3); P.pz = k.z + ((P.pz - k.z) / d) * (k.r + 0.3); } }
    }
    P.pphase += dt * (run > 2 ? 12 : 7);
  }
  const pl = levelAt(P.px, P.pz, P.plevel || 'surface'); P.plevel = pl.level;
  P.person.position.set(P.px, pl.y, P.pz);
  P.person.rotation.y = P.ph;
  animPed(P.person, P.pphase, !!moving);
}

// ---- 플레이어 모델 반영 ----
function syncPlayerModel(dt, blinkOn = false) {
  const P = G.P, sim = P.sim, o = P.obj;
  const lv = levelAt(sim.x, sim.z, sim.level);
  P.y = lerp(P.y, lv.y, dt ? Math.min(1, dt * (lv.ramp !== undefined || Math.abs(lv.y) > 0.5 ? 20 : 8)) : 1);
  const fx = Math.sin(sim.heading) * P.len / 2, fz = Math.cos(sim.heading) * P.len / 2;
  const yf = levelAt(sim.x + fx, sim.z + fz, sim.level).y, yr = levelAt(sim.x - fx, sim.z - fz, sim.level).y;
  const slope = Math.abs(yf - yr) > 0.25 ? -Math.atan((yf - yr) / P.len) : 0;
  o.group.position.set(sim.x, P.y, sim.z);
  o.group.rotation.order = 'YXZ';
  o.group.rotation.y = sim.heading;
  P.slope = lerp(P.slope || 0, slope, dt ? Math.min(1, dt * 10) : 1);
  o.group.rotation.x = P.slope;
  const bump = (P.bumpT > 0 ? Math.sin((0.4 - P.bumpT) * 16) * 0.025 * (P.bumpAmp || 1) : 0) + (G.sinkT ? 0.25 : 0);
  o.body.rotation.x = sim.pitch + bump;
  o.body.rotation.z = sim.rollA;
  for (const w of o.wheels) {
    w.spin.rotation.x += (sim.vl / w.r) * dt;
    if (w.front) w.pivot.rotation.y = sim.steer;
  }
  if (o.steeringWheel) {
    o.steeringWheel.rotation.z = -sim.steer * (P.spec.type === 'bus' ? 9 : 7);
    // 화면 핸들과 겹치지 않게: 화면 패드가 보일 때 운전석 시점에서는 실내 핸들을 숨김
    o.steeringWheel.visible = P.spec.type === 'bus' || !(showPads && CAMS[G.camMode][0] === 'driver');
  }
  if (o.updateDoors) o.updateDoors(dt);
  const L = o.lights;
  const night = env ? env.nightF : 0;
  L.head.emissiveIntensity = P.lights ? 3 : 0.15;
  L.tail.emissiveIntensity = (P.lights || night > 0.3 ? 0.7 : 0.12) + (sim.brakeIn > 0.1 || (Math.abs(sim.vl) < 0.1 && G.brkIn > 0.1) ? 2.5 : 0);
  L.rev.emissiveIntensity = sim.gear === 'R' ? 2 : 0;
  const bl = (P.hazard || P.blink === -1) && blinkOn, br = (P.hazard || P.blink === 1) && blinkOn;
  L.indL.emissiveIntensity = bl ? 3 : 0; L.indR.emissiveIntensity = br ? 3 : 0;
  for (const sp of P.spots) sp.intensity = P.lights ? 260 : 0;
  for (const w of o.wipers) w.rotation.z = P.wiper ? -1.45 + (0.5 - 0.5 * Math.cos(P.wiperPh)) * 1.35 : lerp(w.rotation.z, -1.45, 0.2);
  if (o.dash && G.frame % (Q === 'low' ? 10 : 5) === 0) {
    o.dash.draw({ kmh: sim.kmh, rpm: sim.rpm, gear: P.gearMode !== 'auto' ? P.gearMode : sim.ev ? (sim.gear === 'R' ? 'R' : sim.kmh < 0.5 && G.thrIn < 0.05 ? 'N' : 'D') : sim.gear === 'R' ? 'R' : 'D' + sim.gearN, fuel: P.own.fuel, ev: P.spec.ev, power: G.thrIn, blinkL: bl, blinkR: br, lights: P.lights, park: key('Space') || P.park, doorF: o.doors[0]?.t > 0.05, doorR: o.doors[1]?.t > 0.05, bell: P.bell, brake: G.brkIn || 0, belt: true });
  }
}

// ===================== 카메라 =====================
const _v = new THREE.Vector3(), _t = new THREE.Vector3();
function snapCamera() { G.snap = true; }
function updateCamera(dt) {
  const P = G.P, sim = P.sim, o = P.obj;
  const name = CAMS[G.camMode][0];
  const isBus = P.spec.type === 'bus';
  if (o.frontMesh && name !== 'driver' && name !== 'interior') o.frontMesh.visible = true;
  let hd = sim.heading;
  if (sim.vl < -1 && name === 'chase') hd = sim.heading; // 후진 시에도 뒤에서
  let d = hd - G.camHeading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  G.camHeading += d * Math.min(1, dt * (isBus ? 2.5 : 3.5));
  if (G.snap) { G.camHeading = hd; }
  if (performance.now() - G.lastLook > 1800 && (name === 'chase')) { G.lookYaw *= 1 - Math.min(1, dt * 2); G.lookPitch *= 1 - Math.min(1, dt * 2); }
  camera.near = 0.1; camera.fov = 62;
  if (P.onFoot && transit && transit.camera(camera, dt)) {
    // 버스 승객 시점
  } else if (P.onFoot) {
    const yaw = G.camHeading + G.lookYaw;
    G.camHeading = P.ph * 0 + G.camHeading;
    const dist = 4.5 * G.zoom;
    const py = P.person.position.y;
    _v.set(P.px - Math.sin(yaw) * dist, py + 2.0 + G.lookPitch * -3, P.pz - Math.cos(yaw) * dist);
    if (P.plevel === 'ug') _v.y = Math.min(_v.y, -0.9);
    camera.position.lerp(_v, G.snap ? 1 : Math.min(1, dt * 8));
    camera.lookAt(P.px, py + 1.4, P.pz);
  } else if (name === 'chase' || name === 'orbit') {
    const yaw = (name === 'orbit' ? hd : G.camHeading) + G.lookYaw + (name === 'orbit' ? Math.PI * 0.75 : 0);
    const dist = (isBus ? 15 : 7.2) * G.zoom * (name === 'orbit' ? 1.15 : 1);
    const hgt = (isBus ? 4.8 : 2.4) * (0.6 + G.zoom * 0.4) + G.lookPitch * -6;
    _v.set(sim.x - Math.sin(yaw) * dist, P.y + Math.max(0.6, hgt), sim.z - Math.cos(yaw) * dist);
    if (blocked(_v.x, _v.z) && sim.x < -600) _v.y += 8;
    if (sim.level === 'ug' || (UG && levelAt(sim.x, sim.z, sim.level).ramp > 0.3)) _v.y = Math.min(_v.y, -0.9);
    camera.position.lerp(_v, G.snap ? 1 : Math.min(1, dt * 7));
    _t.set(sim.x + Math.sin(hd) * 3, P.y + (isBus ? 2.2 : 1.1), sim.z + Math.cos(hd) * 3);
    camera.lookAt(_t);
  } else if (name === 'driver' || name === 'interior') {
    if (o.frontMesh) o.frontMesh.visible = false;
    const eye = (name === 'driver' ? o.driverEye : o.interiorEye).clone();
    o.body.localToWorld(eye);
    camera.position.copy(eye);
    const yaw = sim.heading + G.lookYaw, pit = G.lookPitch + (name === 'driver' ? (o.defaultPitch ?? -0.08) : -0.05);
    _t.set(eye.x + Math.sin(yaw) * Math.cos(pit) * 10, eye.y + Math.sin(pit) * 10, eye.z + Math.cos(yaw) * Math.cos(pit) * 10);
    camera.lookAt(_t);
    camera.near = 0.05; camera.fov = (name === 'driver' ? (isBus ? 82 : 76) : 75) / Math.sqrt(name === 'driver' ? G.zoom : 1);
  } else if (name === 'svm') {
    // 서라운드 뷰: 차 위에서 내려다보기
    const h = (isBus ? 26 : 13) * G.zoom;
    _v.set(sim.x - Math.sin(sim.heading) * h * 0.18, P.y + h, sim.z - Math.cos(sim.heading) * h * 0.18);
    camera.position.lerp(_v, G.snap ? 1 : Math.min(1, dt * 8));
    camera.up.set(Math.sin(sim.heading), 0, Math.cos(sim.heading));
    camera.lookAt(sim.x, P.y, sim.z);
    camera.up.set(0, 1, 0);
    camera.fov = 62; camera.near = 0.3;
  } else if (name === 'free') {
    const f = G.free;
    const sp = (key('ShiftLeft', 'ShiftRight') ? 60 : 18) * dt;
    const fx = Math.sin(f.yaw) * Math.cos(f.pitch), fy = Math.sin(f.pitch), fz = Math.cos(f.yaw) * Math.cos(f.pitch);
    const rx = -Math.cos(f.yaw), rz = Math.sin(f.yaw);
    if (key('KeyW', 'ArrowUp')) f.pos.add(_v.set(fx, fy, fz).multiplyScalar(sp));
    if (key('KeyS', 'ArrowDown')) f.pos.add(_v.set(fx, fy, fz).multiplyScalar(-sp));
    if (key('KeyA', 'ArrowLeft')) f.pos.add(_v.set(-rx, 0, -rz).multiplyScalar(sp));
    if (key('KeyD', 'ArrowRight')) f.pos.add(_v.set(rx, 0, rz).multiplyScalar(sp));
    if (key('KeyR', 'PageUp')) f.pos.y += sp; if (key('KeyF', 'PageDown')) f.pos.y = Math.max(0.5, f.pos.y - sp);
    camera.position.copy(f.pos);
    camera.lookAt(f.pos.x + fx, f.pos.y + fy, f.pos.z + fz);
  }
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.5; camera.position.y += (Math.random() - 0.5) * G.shake * 0.4; G.shake = Math.max(0, G.shake - dt * 2.5); }
  camera.updateProjectionMatrix();
  G.snap = false;
  $('#camname').textContent = P.onFoot ? '🚶 걷기' : '📷 ' + CAMS[G.camMode][1];
}

// ===================== 렌더 =====================
// ---- 성능 자동 조절: 해상도 · 먼 곳 작은 물체 숨기기 · 그림자/거울 갱신 주기 ----
const PERF = { base: renderer.getPixelRatio(), pr: renderer.getPixelRatio(), acc: 0, n: 0, slow: 0 };
function perfTick(rawDt) {
  PERF.acc += rawDt; PERF.n++;
  if (PERF.acc < 2) return;
  const fps = PERF.n / PERF.acc; PERF.acc = 0; PERF.n = 0;
  PERF.fps = fps;
  if (S.settings.autoRes === false) return;
  let pr = PERF.pr;
  if (fps < 45) pr = Math.max(0.55, pr - (fps < 30 ? 0.15 : 0.08));
  else if (fps > 57) pr = Math.min(PERF.base, pr + 0.05);
  PERF.slow = fps < 40 ? Math.min(3, PERF.slow + 1) : Math.max(0, PERF.slow - 1);
  if (Math.abs(pr - PERF.pr) > 0.01) { PERF.pr = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); }
}
function lodTick() {
  const cx = camera.position.x, cz = camera.position.z, k = (PERF.slow >= 2 ? 0.7 : 1) * (0.4 + QF * 0.6);
  for (const l of W.lod) { const d = Math.hypot(l.x - cx, l.z - cz) - 430; l.m.visible = d < l.far * k; }
  const fogFar = scene.fog ? scene.fog.far : 3000;
  const far = clamp(fogFar + 150, 500, 3600);
  if (Math.abs(camera.far - far) > 20) { camera.far = far; camera.updateProjectionMatrix(); }
}
function render() {
  // 그림자: 고화질은 매 프레임, 그 밖에는 2프레임마다 (느리면 3프레임마다)
  const every = Q === 'high' && PERF.slow < 2 ? 1 : PERF.slow >= 2 || Q !== 'high' ? 3 : 2;
  if (G.frame % every === 0) renderer.shadowMap.needsUpdate = true;
  if (G.frame % 10 === 0 && G.state !== 'menu') lodTick();
  const P = G.P;
  const cam = CAMS[G.camMode][0];
  const showMirrors = G.state === 'play' && G.mirrorsOn && P && !P.onFoot && (cam === 'driver' || (P.spec.type === 'bus' && cam === 'interior'));
  const busMirrors = P && P.obj.mirrorFaces && G.state !== 'loading' && G.state !== 'menu' && camera.position.distanceTo(P.obj.group.position) < 30;
  const ME = PERF.slow >= 2 || Q === 'low' ? 4 : 2;
  if ((showMirrors || busMirrors) && G.frame % ME === 0) {
    const i = (G.frame / ME) % 2 | 0;
    const o = P.obj, sim = P.sim;
    const mp = o.body.localToWorld(o.mirrorPos[i].clone());
    const s = Math.sin(sim.heading), c = Math.cos(sim.heading);
    const side = i === 0 ? 1 : -1; // 0: 왼쪽(+X), 1: 오른쪽
    const lx = c * side, lz = -s * side;
    mirrorCam[i].position.copy(mp);
    mirrorCam[i].lookAt(mp.x - s * 10 + lx * 1.4, mp.y - 0.6, mp.z - c * 10 + lz * 1.4);
    if (o.mirrorFaces) o.mirrorFaces.forEach((f) => (f.visible = false));
    renderer.setRenderTarget(mirrorRT[i]);
    renderer.render(scene, mirrorCam[i]);
    renderer.setRenderTarget(null);
    if (o.mirrorFaces) o.mirrorFaces.forEach((f) => (f.visible = true));
  }
  if (G.state === 'menu') { renderer.render(showroom.scene, camera); return; }
  if (camera.view && camera.view.enabled) { camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  if (showMirrors) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, overlayCam);
    renderer.autoClear = true;
  }
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  layoutMirrors();
});

// ===================== HUD =====================
const speedo = $('#speedo'), sg = speedo.getContext('2d');
const mini = $('#minimap'), mg = mini.getContext('2d');
function updateRoadHud() {
  const r = G.road;
  const lim = $('#limit'), rn = $('#roadName');
  if (r && r.name) {
    lim.textContent = r.limit; lim.classList.remove('hidden');
    rn.innerHTML = `<b>${r.name}</b><small>${r.type}${r.link && r.lane >= 0 && r.link.n > 1 ? ` · ${r.lane + 1}차로${r.link.bus && r.lane === r.link.n - 1 ? ' (버스전용)' : ''}` : ''}</small>`;
  } else { lim.classList.add('hidden'); rn.innerHTML = ''; }
}
function updateHud(dt) {
  const P = G.P, sim = P.sim;
  if (G.frame % 10 === 0) {
    $('#money').textContent = won(S.money);
    const h = env.hour;
    $('#clock').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${env.timeLabel()} · ${{ clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' }[env.weather]} ${env.weatherName}`;
    const st = [];
    const blinkOn = (G.simT % 0.75) < 0.4;
    st.push(`<i class="${(P.blink === -1 || P.hazard) && blinkOn ? 'on g' : ''}">◀</i>`);
    st.push(`<i class="${P.lights ? 'on b' : ''}">💡</i>`);
    st.push(`<i class="${P.wiper ? 'on' : ''}">🌧️${P.wiper === 2 ? '²' : ''}</i>`);
    if (P.obj.doors.length) { st.push(`<i class="${P.obj.doors[0].t > 0.05 ? 'on o' : ''}">앞문</i>`); if (P.obj.doors[1]) st.push(`<i class="${P.obj.doors[1].t > 0.05 ? 'on o' : ''}">뒷문</i>`); }
    st.push(`<i class="${key('Space') ? 'on r' : ''}">P</i>`);
    st.push(`<i class="${P.hazard ? 'on r' : ''}">▲</i>`);
    st.push(`<i class="${(P.blink === 1 || P.hazard) && blinkOn ? 'on g' : ''}">▶</i>`);
    const html = st.join('');
    if ($('#status').innerHTML !== html) $('#status').innerHTML = html;
  }
  // 속도계
  const w = speedo.width, h = speedo.height;
  sg.clearRect(0, 0, w, h);
  const kmh = sim.kmh, max = P.spec.type === 'bus' ? 120 : 260;
  const cx = w / 2, cy = h * 0.62, r = h * 0.48;
  sg.lineWidth = 16; sg.lineCap = 'round';
  sg.strokeStyle = 'rgba(255,255,255,0.12)'; sg.beginPath(); sg.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); sg.stroke();
  const lim = G.road?.limit || 999;
  sg.strokeStyle = kmh > lim + 10 ? '#ff4d3d' : '#36d1c4';
  sg.beginPath(); sg.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * clamp(kmh / max, 0, 1)); sg.stroke();
  if (lim < 999) { const a = Math.PI * 0.8 + Math.PI * 1.4 * clamp(lim / max, 0, 1); sg.strokeStyle = '#ff4d3d'; sg.lineWidth = 4; sg.beginPath(); sg.arc(cx, cy, r + 14, a - 0.02, a + 0.02); sg.stroke(); }
  sg.fillStyle = '#fff'; sg.textAlign = 'center'; sg.font = '800 76px "Noto Sans KR", sans-serif';
  sg.fillText(Math.round(kmh), cx, cy + 8);
  sg.font = '600 22px "Noto Sans KR", sans-serif'; sg.fillStyle = '#9fb3c0'; sg.fillText('km/h', cx, cy + 40);
  const gear = !P.engine ? 'OFF' : P.gearMode !== 'auto' ? P.gearMode : sim.gear === 'R' ? 'R' : sim.kmh < 0.3 && G.thrIn < 0.05 ? (key('Space') || P.park ? 'P' : 'N') : P.spec.ev ? 'D' : 'D' + sim.gearN;
  const camN = CAMS[G.camMode][0];
  const hs = $('#hudspeed'), showHs = !P.onFoot && (showPads || camN === 'driver' || camN === 'interior');
  hs.classList.toggle('hidden', !showHs);
  if (showHs) { hs.firstChild.textContent = Math.round(kmh); $('#hudgear').textContent = gear; }
  if (G.frame % 10 === 0) {
    const bo = (G.simT % 0.75) < 0.4;
    const on = { scc: autod.mode === 1, auto: autod.mode === 2, key: P.engine, park: P.park, lights: P.lights, wiper: P.wiper > 0, cabin: P.cabin, door0: P.obj.doors[0]?.target > 0, door1: P.obj.doors[1]?.target > 0, blinkL: (P.blink === -1 || P.hazard) && bo, hazard: P.hazard, blinkR: (P.blink === 1 || P.hazard) && bo, mirror: G.mirrorsOn };
    $('#btn-scc').classList.toggle('on', autod.mode === 1); $('#btn-auto').classList.toggle('on', autod.mode === 2);
    document.querySelectorAll('#ctrlbar [data-act]').forEach((b) => { b.classList.toggle('on', !!on[b.dataset.act]); if (b.classList.contains('busonly')) b.style.display = P.obj.doors.length ? '' : 'none'; });
    const eff = P.gearMode !== 'auto' ? P.gearMode : (P.park || key('Space')) && sim.kmh < 0.5 ? 'P' : sim.gear === 'R' ? 'R' : sim.kmh < 0.3 && G.thrIn < 0.05 ? 'N' : 'D';
    document.querySelectorAll('#gearsel [data-g]').forEach((b) => b.classList.toggle('sel', b.dataset.g === eff || (b.dataset.g === 'auto' && P.gearMode === 'auto')));
  }
  sg.font = '900 40px "Noto Sans KR", sans-serif'; sg.fillStyle = gear === 'R' ? '#ffb21a' : '#fff'; sg.fillText(gear, cx, cy - 66);
  // rpm / 연료
  const rp = P.spec.ev ? Math.max(0, G.thrIn) : sim.rpm / sim.redline;
  sg.fillStyle = 'rgba(255,255,255,0.12)'; sg.fillRect(cx - 120, h - 34, 240, 10);
  sg.fillStyle = P.spec.ev ? '#4aa3ff' : rp > 0.9 ? '#ff4d3d' : '#ffb21a'; sg.fillRect(cx - 120, h - 34, 240 * clamp(rp, 0, 1), 10);
  sg.fillStyle = 'rgba(255,255,255,0.12)'; sg.fillRect(cx - 120, h - 18, 240, 10);
  sg.fillStyle = P.own.fuel < 15 ? '#ff4d3d' : '#2ee06a'; sg.fillRect(cx - 120, h - 18, 2.4 * P.own.fuel, 10);
  sg.font = '600 16px "Noto Sans KR", sans-serif'; sg.fillStyle = '#9fb3c0'; sg.textAlign = 'left';
  sg.fillText(P.spec.ev ? '출력' : 'RPM', 8, h - 24); sg.fillText(P.spec.ev ? '배터리' : '연료', 8, h - 8);
  // 미니맵
  if (G.frame % 2 === 0) drawMinimap();
  if (G.bigMap && G.frame % 10 === 0) {
    const bm = $('#bigmap-canvas');
    const pp = app.playerPose();
    const city = cityAt(pp.x, pp.z);
    const v = city ? mapView(bm, undefined, undefined, 0, cityBox(city)) : mapView(bm, pp.x, pp.z, 0.03);
    const mm = G.mission?.minimap?.();
    const busesOnMap = traffic.cars.filter((a) => a.active && a.isBus).map((a) => ({ x: a.x, z: a.z, color: a.R ? a.R.color : '#4bb048', r: 3.5 }));
    drawCityMap(bm, v, { player: pp, names: true, subway: city || true, buses: busesOnMap, routes: mm && mm.path ? [{ route: { links: mm.path, stops: mm.stops || [] }, color: mm.color, width: 4 }] : null, routeStops: true });
    if (nav.active) nav.drawMap(bm.getContext('2d'), v.X, v.Y);
  }
}
// ---- 미션 자동 내비 (버스: 다음 정류장까지 노선 그대로 · 체크포인트 · 주차칸) ----
function busRoutePlan(m, from) {
  const R = m.route, st = m.stop;
  const sl = nav.startLinkAt(from.x, from.z, from.heading);
  const gi = R.links.indexOf(st.link);
  const dest = { name: st.name + ' 정류장', x: st.door.x, z: st.door.z };
  if (sl && gi >= 0) {
    const n = R.links.length;
    let bestK = -1, bestD = 1e9;
    R.links.forEach((L, k) => { if (L === sl.L) { let d = (gi - k + n) % n; if (d === 0 && sl.s > st.s - 2) d = n; if (d < bestD) { bestD = d; bestK = k; } } });
    if (bestK >= 0 && bestD < n) {
      const links = [];
      for (let k = 0; k <= bestD; k++) links.push(R.links[(bestK + k) % n]);
      return nav.planAlong(links, sl.s, st.s, dest);
    }
  }
  return nav.plan(from, dest, 'fast');
}
function missionNav() {
  const m = G.mission;
  if (!m || S.settings.navAuto === false) return;
  if (nav.active && !nav.auto) return;
  let key = null, dest = null, routeFn = null;
  if (m instanceof BusRouteMission && !m.done) {
    const st = m.stop; key = 'bus:' + m.idx;
    dest = { name: st.name + ' 정류장', x: st.door.x, z: st.door.z, icon: '🚏', auto: true };
    routeFn = (from) => busRoutePlan(m, from);
  } else if (m instanceof CheckpointMission && !m.done && m.cps && m.cps[m.idx]) {
    const cp = m.cps[m.idx]; key = 'cp:' + m.kind + m.idx;
    dest = { name: cp.name || '체크포인트', x: cp.x, z: cp.z, hwy: true, auto: true };
  } else if (m instanceof ParkingMission && !m.done && m.spot && m.kind !== 'ug') {
    key = 'park'; dest = { name: '주차할 곳', x: m.spot.x, z: m.spot.z, auto: true };
  }
  if (!key) { if (nav.auto) nav.stop(true); G.navKey = null; return; }
  if (key === G.navKey) return;
  G.navKey = key;
  dest.routeFn = routeFn;
  const pose = app.playerPose();
  const r = routeFn ? routeFn(pose) : null;
  nav.start(dest, pose, 'fast', { auto: true, silent: true, route: r || undefined });
}
// ---- 내비 HUD ----
let lastNavHtml = '';
// 헤드업 디스플레이 (옵션) — 운전석 시점에서 앞유리에 표시
let lastHudProj = '';
function updateHudProj(info) {
  const P = G.P, el = $('#hudproj');
  const camName = CAMS[G.camMode][0];
  const on = !P.onFoot && hasOpt(P.own, 'hud') && camName === 'driver' && !(transit && transit.riding);
  const rec = !P.onFoot && P.spec.type !== 'bus' && hasOpt(P.own, 'bcam');
  const re = $('#recdot'); if (re.classList.contains('hidden') === rec) re.classList.toggle('hidden', !rec);
  if (document.body.classList.contains('hudproj-on') !== on) document.body.classList.toggle('hudproj-on', on);
  if (!on) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); lastHudProj = ''; return; }
  el.classList.remove('hidden');
  const kmh = Math.round(Math.abs(P.sim.kmh)), lim = G.road && G.road.limit;
  const over = lim && kmh > lim + 3;
  let navh = '';
  if (info) { const m = info.m, t = m.toHwy || m.offHwy ? (m.t === 'S' ? 'R' : m.t) : m.t; navh = `<div class="hp-nav">${arrowSVG(t)}<b>${fmtDist(info.dNext)}</b><small>${m.t === 'G' ? '목적지' : TURN_WORD[m.t]}</small></div>`; }
  const ad = autod.on ? `<div class="hp-ad">${autod.mode === 2 ? '🤖' : '⟳'} ${autod.mode === 2 && G.road && !autod.manual ? Math.min(autod.set, G.road.limit) : autod.set}</div>` : '';
  const html = `${navh}<div class="hp-spd ${over ? 'over' : ''}"><b>${kmh}</b><small>km/h</small></div>${lim ? `<div class="hp-lim">${lim}</div>` : ''}${ad}`;
  if (html !== lastHudProj) { el.innerHTML = html; lastHudProj = html; }
}
function updateNavHud(info) {
  const ui = $('#navui');
  const cw = $('#camwarn');
  const ca = nav.camAhead;
  if (ca && !G.P.onFoot) {
    cw.classList.remove('hidden');
    $('#cw-lim').textContent = ca.c.limit; $('#cw-dist').textContent = fmtDist(ca.d);
    cw.classList.toggle('over', G.P.sim.kmh > ca.c.limit);
  } else cw.classList.add('hidden');
  const bar = $('#nav-bar');
  if (!info) { ui.classList.add('hidden'); bar.classList.add('hidden'); lastNavHtml = ''; return; }
  ui.classList.remove('hidden'); bar.classList.remove('hidden');
  const m = info.m, t = m.toHwy || m.offHwy ? (m.t === 'S' ? 'R' : m.t) : m.t;
  $('#nav-prog').style.width = Math.round(clamp(1 - info.dNext / 300, 0, 1) * 100) + '%';
  const key = t + '|' + Math.round(info.dNext / 10) + '|' + (info.m2 ? info.m2.t : '') + '|' + (info.lanes ? info.lanes.map((l) => (l.rec ? 1 : 0)).join('') : '') + '|' + Math.round(info.remain / 50) + '|' + Math.round(info.tRemain / 30);
  if (key === lastNavHtml) return;
  lastNavHtml = key;
  $('#nav-arrow').innerHTML = arrowSVG(t);
  $('#nav-arrow').className = 'nc-arrow ' + (info.dNext < 120 ? 'soon' : '');
  const dTxt = fmtDist(info.dNext), num = dTxt.replace(/[^0-9.]/g, ''), unit = dTxt.replace(/[0-9.]/g, '').trim();
  $('#nav-dist').innerHTML = `${num}<small>${unit}</small>`;
  $('#nav-turn').textContent = m.t === 'G' ? '목적지 도착' : m.toHwy ? '고속도로 진입' : m.offHwy ? '고속도로 출구' : TURN_WORD[m.t];
  $('#nav-road').textContent = m.t === 'G' ? info.dest.name : (m.road ? m.road + ' 방면' : '도로를 따라가세요');
  const m2 = info.m2;
  $('#nav-then').innerHTML = m2 && m2.at - m.at < 400 ? `그 다음 <span class="mini">${arrowSVG(m2.t)}</span> ${m2.t === 'G' ? '목적지' : TURN_WORD[m2.t]} · ${fmtDist(m2.at - m.at)}` : '';
  $('#nav-then').classList.toggle('hidden', !$('#nav-then').innerHTML);
  const ln = $('#nav-lanes');
  if (info.lanes) {
    const icon = { L: 'L', LS: 'LS', S: 'S', SR: 'SR', R: 'R' };
    ln.innerHTML = info.lanes.map((l) => `<i class="${l.rec ? 'rec' : ''} ${l.bus ? 'bus' : ''}">${laneIcon(icon[l.arr])}${l.bus ? '<em>버스</em>' : ''}</i>`).join('');
    ln.classList.remove('hidden');
  } else ln.classList.add('hidden');
  $('#nav-rem').textContent = fmtDist(info.remain);
  const h = (env.hour + (info.tRemain * S.settings.timeSpeed) / 3600) % 24;
  $('#nav-eta').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  $('#nav-min').textContent = `${Math.max(1, Math.round(info.tRemain / 60))}분 · 도착`;
  $('#nav-dest').textContent = (nav.auto ? '🚏 ' : '') + info.dest.name;
}
function laneIcon(k) {
  const L = '<path d="M20 34 V20 Q20 14 14 14 H8 M4 14 L10 8 V20 Z" />', S2 = '<path d="M20 34 V8 M14 12 L20 4 L26 12 Z" />', R = '<path d="M20 34 V20 Q20 14 26 14 H32 M36 14 L30 8 V20 Z" />';
  const parts = { L: [L], LS: [L, S2], S: [S2], SR: [S2, R], R: [R] }[k] || [S2];
  return `<svg viewBox="0 0 40 40">${parts.join('')}</svg>`;
}
function drawMinimap() {
  const P = G.P, sim = P.sim;
  const w = mini.width, h = mini.height, cx = w / 2, cy = h / 2;
  const px = P.onFoot ? P.px : sim.x, pz = P.onFoot ? P.pz : sim.z;
  const th = CAMS[G.camMode][0] === 'free' ? G.free.yaw : P.onFoot ? G.camHeading + G.lookYaw : sim.heading;
  const s = w / 520 * (sim.kmh > 70 ? 0.7 : 1);
  const c = Math.cos(th), sn = Math.sin(th);
  const a = -s * c, b = -s * sn, cc = s * sn, d = -s * c;
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.clearRect(0, 0, w, h);
  mg.save();
  mg.beginPath(); mg.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); mg.clip();
  mg.fillStyle = '#1d2b22'; mg.fillRect(0, 0, w, h);
  mg.setTransform(a, b, cc, d, cx - (a * px + cc * pz), cy - (b * px + d * pz));
  {
    const bm = basemap(), B = W.bounds;
    mg.drawImage(bm.canvas, B.x0, B.z0, bm.canvas.width * bm.res, bm.canvas.height * bm.res);
    mg.lineCap = 'round';
    const R0 = 320 / s * (w / 520);
    for (const pass of [0, 1]) for (const e of W.edges) {
      const up = e.elevated || e.ramp; if ((pass === 1) !== up) continue;
      if (Math.min(e.a.x, e.b.x) > px + R0 || Math.max(e.a.x, e.b.x) < px - R0 || Math.min(e.a.z, e.b.z) > pz + R0 || Math.max(e.a.z, e.b.z) < pz - R0) continue;
      mg.strokeStyle = e.kind === 'highway' ? '#c9a24a' : up ? '#b8a46a' : e.kind === 'alley' ? '#757a80' : '#8b9096';
      mg.lineWidth = e.hw * 2; mg.beginPath(); mg.moveTo(e.a.x, e.a.z); mg.lineTo(e.b.x, e.b.z); mg.stroke();
    }
  }
  const mm = G.mission?.minimap?.() || {};
  if (mm.path) {
    mg.strokeStyle = mm.color; mg.lineWidth = 5; mg.globalAlpha = 0.85; mg.beginPath();
    mm.path.forEach((l, i) => { const o = l.median / 2 + (l.n - 0.5) * 3.3; const ax = l.from.x + l.right.x * o, az = l.from.z + l.right.z * o, bx = l.to.x + l.right.x * o, bz = l.to.z + l.right.z * o; if (!i) mg.moveTo(ax, az); else mg.lineTo(ax, az); mg.lineTo(bx, bz); });
    mg.closePath(); mg.stroke(); mg.globalAlpha = 1;
    for (const st of mm.stops) { mg.fillStyle = st === mm.current ? '#ffb21a' : '#fff'; mg.beginPath(); mg.arc(st.door.x, st.door.z, st === mm.current ? 9 : 5, 0, Math.PI * 2); mg.fill(); }
  }
  if (nav && nav.active) nav.drawWorld(mg, 6);
  for (const c of W.cams || []) if (Math.abs(c.x - px) < 400 && Math.abs(c.z - pz) < 400) { mg.fillStyle = '#ff4d3d'; mg.fillRect(c.x - 4, c.z - 4, 8, 8); }
  if (train.obj.group.visible) { mg.strokeStyle = '#1f6fc2'; mg.lineWidth = 6; mg.beginPath(); const tp = train.points(); tp.forEach((q, i) => (i ? mg.lineTo(q.x, q.z) : mg.moveTo(q.x, q.z))); mg.stroke(); }
  for (const c of W.crossings) { mg.fillStyle = W.crossDown[c.id] ? '#ff4d3d' : '#f2c418'; mg.fillRect(c.x - 5, c.z - 5, 10, 10); }
  if (mp.active) for (const a3 of mp.agents()) { mg.fillStyle = '#ff7ad9'; mg.beginPath(); mg.arc(a3.x, a3.z, 7, 0, Math.PI * 2); mg.fill(); }
  for (const a2 of traffic.cars) if (a2.active) { mg.fillStyle = a2.isBus ? '#4bb048' : '#d9dde2'; mg.fillRect(a2.x - 2.5, a2.z - 2.5, 5, 5); }
  for (const z of W.zones) if (z.type === 'fuel' || z.type === 'ev') { mg.fillStyle = z.type === 'ev' ? '#4aa3ff' : '#ff6b3d'; mg.fillRect((z.x0 + z.x1) / 2 - 6, (z.z0 + z.z1) / 2 - 6, 12, 12); }
  mg.setTransform(1, 0, 0, 1, 0, 0);
  // 목표
  const tg = mm.target || (nav && nav.active && nav.route ? nav.route.goalPt : null);
  if (tg) {
    const dx = tg.x - px, dz = tg.z - pz;
    let sx = a * dx + cc * dz, sy = b * dx + d * dz;
    const rr = w / 2 - 14, dd = Math.hypot(sx, sy);
    const out = dd > rr;
    if (out) { sx = (sx / dd) * rr; sy = (sy / dd) * rr; }
    mg.fillStyle = '#ffb21a'; mg.strokeStyle = '#000'; mg.lineWidth = 2;
    mg.beginPath();
    if (out) { const ang = Math.atan2(sy, sx); mg.moveTo(cx + sx + Math.cos(ang) * 10, cy + sy + Math.sin(ang) * 10); mg.lineTo(cx + sx + Math.cos(ang + 2.4) * 10, cy + sy + Math.sin(ang + 2.4) * 10); mg.lineTo(cx + sx + Math.cos(ang - 2.4) * 10, cy + sy + Math.sin(ang - 2.4) * 10); }
    else mg.arc(cx + sx, cy + sy, 8, 0, Math.PI * 2);
    mg.closePath(); mg.fill(); mg.stroke();
  }
  // 내 차
  mg.fillStyle = '#36d1c4'; mg.strokeStyle = '#fff'; mg.lineWidth = 2.5;
  mg.beginPath(); mg.moveTo(cx, cy - 14); mg.lineTo(cx + 9, cy + 10); mg.lineTo(cx, cy + 5); mg.lineTo(cx - 9, cy + 10); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
  mg.strokeStyle = 'rgba(255,255,255,0.5)'; mg.lineWidth = 3; mg.beginPath(); mg.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); mg.stroke();
}

// ===================== 채팅 =====================
function chatLine(name, msg) {
  const box = $('#chatlog');
  const d = document.createElement('div');
  d.innerHTML = '<b></b> <span></span>';
  d.querySelector('b').textContent = name; d.querySelector('span').textContent = msg;
  box.appendChild(d);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 12000);
}
function openChat() {
  const inp = $('#chatin');
  inp.classList.remove('hidden'); inp.value = ''; inp.focus();
  G.keys = {};
  inp.onkeydown = (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { const t = inp.value.trim(); if (t) { mp.say(t); chatLine(S.mp.name + ' (나)', t); } inp.blur(); }
    if (ev.key === 'Escape') inp.blur();
  };
  inp.onblur = () => inp.classList.add('hidden');
}
