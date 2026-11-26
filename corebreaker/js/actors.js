// ===================== 요원(사람 · 봇 · 다른 플레이어) =====================
import * as THREE from 'three';
import { groundAt, zoneAt, MAP } from './map.js';
import { WEAPONS, AGENTS } from './weapons.js';

export const TEAM = { atk: { name: '공격', color: '#ff6a3d', hex: 0xff6a3d }, def: { name: '수비', color: '#36d1c4', hex: 0x36d1c4 } };
export const EYE = 1.62, EYE_C = 1.15, RADIUS = 0.4;

let nextId = 1;
export class Actor {
  constructor(o) {
    this.id = o.id || 'a' + nextId++;
    this.name = o.name; this.team = o.team; this.agent = o.agent || 'blaze';
    this.isBot = !!o.isBot; this.isLocal = !!o.isLocal; this.remote = !!o.remote;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0; this.alive = true; this.onGround = true; this.crouch = 0; this.walk = false;
    this.credits = 800; this.kills = 0; this.deaths = 0; this.score = 0;
    this.guns = { 1: null, 2: { id: 'sting', mag: 12, res: 36 } }; this.slot = 2;
    this.abil = { q: 0, e: 0 };
    this.flashT = 0; this.slowT = 0; this.revealT = 0; this.healT = 0; this.reloadT = 0; this.fireCD = 0; this.shotN = 0; this.spreadKick = 0; this.lastShot = -9;
    this.animT = Math.random() * 6; this.deadT = 0; this.carry = false; this.speedNow = 0;
    this.model = buildSoldier(this.team, this.agent);
    this.resetAbil(true);
  }
  get gun() { return this.guns[this.slot] || this.guns[2]; }
  get W() { return WEAPONS[this.gun.id]; }
  get eye() { return this.y + (this.crouch > 0.5 ? EYE_C : EYE); }
  resetAbil(full) { const A = AGENTS[this.agent]; if (full) this.abil = { q: A.q.free, e: A.e.free }; else { this.abil.q = Math.max(this.abil.q, A.q.free); this.abil.e = Math.max(this.abil.e, A.e.free); } }
  setTeam(t) { if (t === this.team) return; this.team = t; const p = this.model.parent; if (p) p.remove(this.model); this.model = buildSoldier(t, this.agent); if (p) p.add(this.model); }
  setAgent(a) { if (a === this.agent) return; this.agent = a; const p = this.model.parent; if (p) p.remove(this.model); this.model = buildSoldier(this.team, a); if (p) p.add(this.model); }
  spawn(p, yaw) {
    this.x = p.x; this.z = p.z; this.y = 0; this.vx = this.vy = this.vz = 0; this.yaw = yaw; this.pitch = 0;
    this.hp = 100; this.alive = true; this.deadT = 0; this.flashT = this.slowT = this.revealT = this.healT = 0; this.reloadT = 0; this.carry = false;
    this.model.visible = true; this.model.rotation.set(0, 0, 0);
    if (!this.guns[this.slot]) this.slot = 2;
    for (const k of [1, 2]) { const g = this.guns[k]; if (g) { g.mag = WEAPONS[g.id].mag; g.res = WEAPONS[g.id].reserve; } }
  }
  die() {
    this.alive = false; this.hp = 0; this.deaths++; this.deadT = 0;
    // 죽으면 주무기 · 방어구 · 기술 잃음
    this.guns[1] = null; this.armor = 0; this.slot = 2;
  }
}

// 이동 (사람 · 봇 공통): wish = 원하는 방향(단위), 빠르기 계수
export function moveActor(a, dt, wx, wz, jump, opts = {}) {
  const W = a.W;
  let max = (W.speed || 6.75) * (a.walk ? 0.52 : 1) * (a.crouch > 0.5 ? 0.42 : 1) * (a.slowT > 0 ? 0.5 : 1);
  if (opts.frozen) max = 0;
  const acc = a.onGround ? 60 : 12;
  const tx = wx * max, tz = wz * max;
  const k = Math.min(1, acc * dt / Math.max(0.01, max || 1));
  if (a.onGround || wx || wz) { a.vx += (tx - a.vx) * k; a.vz += (tz - a.vz) * k; }
  if (a.onGround && jump && a.crouch < 0.5) { a.vy = 5.2; a.onGround = false; }
  a.vy -= 18 * dt;
  // 가로 이동: x, z 따로 (벽 미끄러짐)
  const step = (nx, nz) => {
    if (opts.zoneLock && zoneAt(nx, nz) !== opts.zoneLock) return false;
    const g = groundAt(nx, nz, RADIUS, a.y);
    if (g === null) return false;
    a.x = nx; a.z = nz; return true;
  };
  const dx = a.vx * dt, dz = a.vz * dt;
  if (!step(a.x + dx, a.z)) a.vx = 0;
  if (!step(a.x, a.z + dz)) a.vz = 0;
  // 세로
  const floor = groundAt(a.x, a.z, RADIUS * 0.95, a.y + 0.01, 0.5) ?? 0;
  a.y += a.vy * dt;
  if (a.y <= floor) { if (a.vy < -9 && opts.onLand) opts.onLand(a.vy); a.y = floor; a.vy = 0; a.onGround = true; }
  else if (a.y > floor + 0.05) a.onGround = false;
  // 머리 위 (장벽 등) 무시 — 맵에 천장 없음
  a.speedNow = Math.hypot(a.vx, a.vz);
}

// 광선 → 요원 (맞은 부위 · 거리)
function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const fx = ox - cx, fz = oz - cz;
  const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r;
  if (A < 1e-9) return null;
  const D = B * B - 4 * A * C; if (D < 0) return null;
  const s = Math.sqrt(D);
  for (const t of [(-B - s) / (2 * A), (-B + s) / (2 * A)]) { if (t < 0) continue; const y = oy + dy * t; if (y >= y0 && y <= y1) return t; }
  return null;
}
function raySph(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - r * r, D = b * b - c;
  if (D < 0) return null; const t = -b - Math.sqrt(D); return t >= 0 ? t : null;
}
export function rayActor(a, ox, oy, oz, dx, dy, dz) {
  if (!a.alive) return null;
  const c = a.crouch > 0.5 ? 0.72 : 1;
  const hy = a.y + 1.62 * c;
  let best = null;
  const th = raySph(ox, oy, oz, dx, dy, dz, a.x, hy, a.z, 0.17);
  if (th !== null) best = { t: th, part: 'head' };
  const tb = rayCyl(ox, oy, oz, dx, dy, dz, a.x, a.z, 0.3, a.y + 0.88 * c, a.y + 1.45 * c);
  if (tb !== null && (!best || tb < best.t)) best = { t: tb, part: 'body' };
  const tl = rayCyl(ox, oy, oz, dx, dy, dz, a.x, a.z, 0.24, a.y, a.y + 0.88 * c);
  if (tl !== null && (!best || tl < best.t)) best = { t: tl, part: 'leg' };
  return best;
}

// ===================== 3D 요원 모델 =====================
const BX = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(1, 16, 12), CAP = new THREE.CapsuleGeometry(1, 1, 4, 10);
const MATS = {};
function mats(team, agent) {
  const k = team + agent;
  if (MATS[k]) return MATS[k];
  const tc = TEAM[team].hex, ac = new THREE.Color(AGENTS[agent].color);
  MATS[k] = {
    suit: new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0x6b4c3c : 0x3d5c6e, roughness: 0.8 }),
    armor: new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0xa0735a : 0x6a95ab, roughness: 0.45, metalness: 0.25 }),
    team: new THREE.MeshStandardMaterial({ color: tc, emissive: tc, emissiveIntensity: 0.6, roughness: 0.4 }),
    agent: new THREE.MeshStandardMaterial({ color: ac, roughness: 0.5 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0b0f14, emissive: tc, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.5 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9ab85, roughness: 0.7 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.8 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.5, metalness: 0.6 }),
  };
  return MATS[k];
}
function P(g, geo, m, sx, sy, sz, x, y, z) { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; }
export function buildSoldier(team, agent) {
  const m = mats(team, agent);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // 다리 (엉덩이 · 무릎)
  const legs = [], knees = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.13, 0.92, 0); body.add(hip);
    P(hip, CAP, m.suit, 0.1, 0.3, 0.1, 0, -0.22, 0);
    P(hip, BX, m.armor, 0.15, 0.14, 0.06, 0, -0.18, 0.09); // 허벅지 보호대
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    P(knee, CAP, m.suit, 0.09, 0.28, 0.09, 0, -0.2, 0);
    P(knee, BX, m.boot, 0.14, 0.12, 0.28, 0, -0.42, 0.05);
    legs.push(hip); knees.push(knee);
  }
  // 몸통 · 방탄복 · 팀색 띠 · 배낭
  const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso);
  P(torso, CAP, m.suit, 0.22, 0.32, 0.16, 0, 0.3, 0);
  P(torso, BX, m.armor, 0.46, 0.36, 0.3, 0, 0.36, 0.01);
  P(torso, BX, m.team, 0.47, 0.05, 0.31, 0, 0.3, 0.01);
  P(torso, BX, m.agent, 0.12, 0.1, 0.02, 0.12, 0.45, 0.165); // 어깨 휘장
  P(torso, BX, m.suit, 0.34, 0.32, 0.14, 0, 0.36, -0.22);
  // 머리 · 헬멧 · 바이저
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  P(head, SPH, m.skin, 0.12, 0.13, 0.12, 0, 0.02, 0);
  P(head, SPH, m.armor, 0.145, 0.12, 0.15, 0, 0.07, -0.01);
  P(head, BX, m.visor, 0.22, 0.06, 0.06, 0, 0.04, 0.11);
  P(head, BX, m.team, 0.02, 0.06, 0.2, 0.14, 0.08, 0);
  // 팔 + 총 (앞으로 겨눔)
  const arms = new THREE.Group(); arms.position.set(0, 0.52, 0.05); torso.add(arms);
  for (const s of [1, -1]) {
    const up = P(arms, CAP, m.suit, 0.07, 0.2, 0.07, s * 0.24, -0.12, 0.12); up.rotation.x = -1.1;
    P(arms, SPH, m.boot, 0.06, 0.06, 0.06, s * 0.08, -0.16, 0.42);
  }
  const gun = new THREE.Group(); gun.position.set(0.05, -0.12, 0.42); arms.add(gun);
  P(gun, BX, m.gun, 0.07, 0.1, 0.6, 0, 0, 0.1);
  P(gun, BX, m.team, 0.072, 0.015, 0.4, 0, 0.05, 0.1);
  root.userData = { body, legs, knees, torso, head, arms, gun };
  return root;
}
// 모델 자세 맞추기 (걷기 · 앉기 · 쓰러짐)
export function poseSoldier(a, dt) {
  const u = a.model.userData;
  a.model.position.set(a.x, a.y, a.z);
  if (!a.alive) {
    a.deadT += dt;
    const t = Math.min(1, a.deadT * 2.2);
    a.model.rotation.set(-t * Math.PI / 2 * 0.95, a.yaw, 0, 'YXZ');
    a.model.position.y = a.y + 0.15 * t;
    return;
  }
  a.model.rotation.set(0, a.yaw, 0);
  const sp = a.speedNow || 0;
  a.animT += dt * (2 + sp * 1.6);
  const sw = Math.min(1, sp / 5) * 0.65;
  const c = a.crouch;
  u.legs[0].rotation.x = Math.sin(a.animT) * sw - c * 1.0; u.legs[1].rotation.x = -Math.sin(a.animT) * sw - c * 1.0;
  u.knees[0].rotation.x = Math.max(0, -Math.sin(a.animT)) * sw * 1.2 + c * 1.6; u.knees[1].rotation.x = Math.max(0, Math.sin(a.animT)) * sw * 1.2 + c * 1.6;
  u.body.position.y = -c * 0.32 + Math.abs(Math.sin(a.animT)) * sw * 0.04;
  u.torso.rotation.x = c * 0.25;
  u.arms.rotation.x = -a.pitch * 0.9 - c * 0.2;
  u.head.rotation.x = -a.pitch * 0.5;
}
