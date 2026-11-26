// ===================== 무기 · 요원 (모두 오리지널 이름) =====================
import * as THREE from 'three';

// dmg: [머리, 몸, 다리] (거리 감소 전), rate: 초당 발, mag: 탄창, reload 초, spread: 기본 탄퍼짐(라디안), move: 움직일 때 더해지는 퍼짐,
// recoil: 연사 반동(위로), price, slot: 1 주무기 2 보조, auto: 연사, pellets: 산탄, zoom: 확대 배율
export const WEAPONS = {
  sting: { id: 'sting', name: '스팅', kind: '권총', slot: 2, price: 0, dmg: [78, 26, 22], rate: 6.5, mag: 12, reserve: 36, reload: 1.5, spread: 0.004, move: 0.03, recoil: 0.012, auto: false, falloff: [30, 0.85], speed: 6.75 },
  viper: { id: 'viper', name: '바이퍼', kind: '권총', slot: 2, price: 500, dmg: [104, 34, 28], rate: 4, mag: 8, reserve: 24, reload: 1.8, spread: 0.003, move: 0.025, recoil: 0.02, auto: false, falloff: [30, 0.8], speed: 6.75 },
  wasp: { id: 'wasp', name: '와스프', kind: '기관단총', slot: 1, price: 1100, dmg: [72, 26, 22], rate: 13, mag: 30, reserve: 90, reload: 2.2, spread: 0.01, move: 0.012, recoil: 0.0065, auto: true, falloff: [20, 0.8], speed: 6.75 },
  burst: { id: 'burst', name: '버스트', kind: '산탄총', slot: 1, price: 1700, dmg: [22, 11, 9], pellets: 12, rate: 1.1, mag: 5, reserve: 15, reload: 2.6, spread: 0.06, move: 0.01, recoil: 0.05, auto: false, falloff: [10, 0.5], speed: 6.3 },
  lance: { id: 'lance', name: '랜스', kind: '소총', slot: 1, price: 2900, dmg: [160, 40, 34], rate: 9.75, mag: 25, reserve: 75, reload: 2.5, spread: 0.0025, move: 0.06, recoil: 0.0105, auto: true, falloff: [50, 0.9], speed: 6.0 },
  halberd: { id: 'halberd', name: '할버드', kind: '소총', slot: 1, price: 2900, dmg: [140, 35, 30], rate: 11, mag: 30, reserve: 90, reload: 2.3, spread: 0.0035, move: 0.05, recoil: 0.0085, auto: true, falloff: [50, 0.9], speed: 6.0 },
  owl: { id: 'owl', name: '아울', kind: '저격총', slot: 1, price: 4700, dmg: [255, 150, 120], rate: 0.6, mag: 5, reserve: 10, reload: 3.6, spread: 0.0008, move: 0.12, recoil: 0.06, auto: false, falloff: [200, 1], zoom: 2.5, scopeOnly: true, speed: 5.4 },
};
export const SHOP = [
  ['보조', ['viper']],
  ['기관단총 · 산탄', ['wasp', 'burst']],
  ['소총', ['lance', 'halberd']],
  ['저격', ['owl']],
];
export const ARMOR = { light: { name: '가벼운 방어구', price: 400, ap: 25 }, heavy: { name: '무거운 방어구', price: 1000, ap: 50 } };

// 요원: 각자 Q · E 기술 (기본 충전 / 최대 충전 / 1회 가격)
export const AGENTS = {
  blaze: { id: 'blaze', name: '블레이즈', role: '돌격', color: '#ff6a3d', desc: '빠르게 치고 들어가는 돌격 요원',
    q: { id: 'dash', name: '돌진', icon: '💨', free: 1, max: 2, price: 150, desc: '바라보는 쪽으로 7m 순간 돌진' },
    e: { id: 'flash', name: '섬광탄', icon: '✴️', free: 0, max: 2, price: 250, desc: '던지고 0.6초 뒤 터져서 보고 있는 적의 눈을 멀게 함' } },
  mist: { id: 'mist', name: '미스트', role: '연막', color: '#8a8cf2', desc: '연막으로 시야를 끊어 주는 요원',
    q: { id: 'smoke', name: '연막구', icon: '☁️', free: 2, max: 3, price: 100, desc: '조준한 곳(40m 안)에 15초 연막' },
    e: { id: 'slow', name: '감속 지대', icon: '🌀', free: 0, max: 1, price: 200, desc: '조준한 곳에 6초 동안 적을 느리게 하는 지대' } },
  echo: { id: 'echo', name: '에코', role: '정찰', color: '#3fd1a3', desc: '적 위치를 밝혀내는 정찰 요원',
    q: { id: 'pulse', name: '음파', icon: '📡', free: 1, max: 1, price: 0, desc: '15m 안의 적을 벽 너머로 2초간 표시' },
    e: { id: 'dart', name: '탐지 화살', icon: '🏹', free: 0, max: 2, price: 200, desc: '맞은 곳 14m 안의 보이는 적을 3초 표시' } },
  medi: { id: 'medi', name: '메디', role: '수호', color: '#f2d24a', desc: '팀을 치료하고 길을 막는 수호 요원',
    q: { id: 'heal', name: '치유', icon: '💚', free: 1, max: 1, price: 0, desc: '바라보는 아군(없으면 나)을 3초에 걸쳐 60 치유' },
    e: { id: 'wall', name: '장벽', icon: '🧱', free: 0, max: 1, price: 300, desc: '조준한 곳에 20초 동안 막는 벽' } },
};

// 거리 · 부위별 피해
export function damageOf(W, part, dist) {
  const base = W.dmg[part === 'head' ? 0 : part === 'leg' ? 2 : 1];
  return Math.round(dist > W.falloff[0] ? base * W.falloff[1] : base);
}

// ===================== 1인칭 무기 모델 =====================
const M = (c, r = 0.5, m = 0.4) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const MAT = { body: M(0x5a6470, 0.35, 0.55), dark: M(0x2a2f36, 0.4, 0.6), grip: M(0x4a3a30, 0.85, 0), acc: M(0xff6a3d, 0.45, 0.2), teal: M(0x36d1c4, 0.3, 0.3), glove: M(0x3c4a58, 0.8, 0), skin: M(0xe2b892, 0.7, 0) };
MAT.teal.emissive = new THREE.Color(0x36d1c4); MAT.teal.emissiveIntensity = 0.8;
const BX = new THREE.BoxGeometry(1, 1, 1), CY = new THREE.CylinderGeometry(1, 1, 1, 12);
function part(g, geo, mat, sx, sy, sz, x, y, z, rx = 0) { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; }
export function buildViewModel(id) {
  const g = new THREE.Group();
  const W = WEAPONS[id];
  const len = W.slot === 2 ? 0.22 : id === 'owl' ? 0.78 : id === 'burst' ? 0.6 : 0.52;
  // 몸통 · 총열 · 손잡이 · 탄창
  part(g, BX, MAT.body, 0.055, 0.08, len, 0, 0, -len / 2);
  part(g, CY, MAT.dark, 0.014, len * 0.5, 0.014, 0, 0.018, -len - len * 0.2, Math.PI / 2);
  part(g, BX, MAT.grip, 0.045, 0.12, 0.05, 0, -0.08, -0.06, 0.25);
  if (W.slot === 1) {
    part(g, BX, MAT.dark, 0.04, id === 'burst' ? 0.04 : 0.13, 0.06, 0, -0.09, -len * 0.45, -0.15);
    part(g, BX, MAT.body, 0.05, 0.06, 0.2, 0, -0.01, 0.12); // 개머리판
    part(g, BX, id === 'owl' ? MAT.dark : MAT.acc, 0.058, 0.012, len * 0.6, 0, 0.046, -len * 0.45);
  }
  if (id === 'owl') { part(g, CY, MAT.dark, 0.03, 0.26, 0.03, 0, 0.075, -0.3, Math.PI / 2); part(g, CY, MAT.teal, 0.033, 0.01, 0.033, 0, 0.075, -0.43, Math.PI / 2); }
  else part(g, BX, MAT.teal, 0.012, 0.02, 0.02, 0, 0.055, -0.05); // 가늠쇠 빛
  // 손 (장갑)
  part(g, BX, MAT.glove, 0.07, 0.09, 0.11, 0.0, -0.09, -0.02);
  if (W.slot === 1) part(g, BX, MAT.glove, 0.07, 0.07, 0.12, 0.0, -0.05, -len * 0.62);
  part(g, BX, MAT.skin, 0.05, 0.05, 0.08, 0.02, -0.12, 0.05);
  // 총구 섬광
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: flashTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(0, 0.018, -len - len * 0.45); flash.visible = false; g.add(flash);
  g.userData = { flash, muzzle: flash.position.clone(), len };
  g.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; } });
  return g;
}
let FT = null;
function flashTex() {
  if (FT) return FT;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  FT = new THREE.CanvasTexture(c); return FT;
}
export { flashTex };
