// ===================== 라스트 아일랜드 — 섬 · 판정 · 봇 =====================
export const SIZE = 340, CX = SIZE / 2, CZ = SIZE / 2;
export const GUNS = {
  pistol: { id: 'pistol', name: '권총', dmg: 22, rate: 4, mag: 12, reload: 1.3, spread: 0.03, range: 34, speed: 70, color: '#bbbbbb', rar: 0 },
  smg: { id: 'smg', name: '기관단총', dmg: 15, rate: 12, mag: 30, reload: 2.0, spread: 0.07, range: 30, speed: 70, auto: true, color: '#5dd6ff', rar: 1 },
  shotgun: { id: 'shotgun', name: '산탄총', dmg: 11, pellets: 8, rate: 1.1, mag: 5, reload: 2.6, spread: 0.22, range: 16, speed: 60, color: '#5dd6ff', rar: 1 },
  rifle: { id: 'rifle', name: '돌격소총', dmg: 26, rate: 8, mag: 30, reload: 2.2, spread: 0.035, range: 48, speed: 85, auto: true, color: '#b36bff', rar: 2 },
  sniper: { id: 'sniper', name: '저격총', dmg: 95, rate: 0.7, mag: 5, reload: 3.0, spread: 0.004, range: 90, speed: 140, color: '#ffb02e', rar: 3 },
};
export const ITEMS = {
  vest1: { name: '방탄복 1', armor: 50, icon: '🦺' }, vest2: { name: '방탄복 2', armor: 75, icon: '🦺' }, vest3: { name: '방탄복 3', armor: 100, icon: '🛡️' },
  band: { name: '붕대', heal: 15, cap: 75, time: 2, icon: '🩹' }, med: { name: '구급상자', heal: 100, cap: 100, time: 5, icon: '💉' },
};
const ZONES = [{ wait: 45, shrink: 35, r: 120, dmg: 1 }, { wait: 35, shrink: 30, r: 80, dmg: 2 }, { wait: 30, shrink: 25, r: 50, dmg: 4 }, { wait: 25, shrink: 20, r: 28, dmg: 6 }, { wait: 20, shrink: 18, r: 12, dmg: 9 }, { wait: 15, shrink: 15, r: 0, dmg: 14 }];
const NAMES = ['바다곰', '번개토끼', '고요한늑대', '붉은여우', '하늘매', '모래뱀', '은빛사슴', '푸른고래', '초록개구리', '밤부엉이', '얼음펭귄', '불꽃용', '돌거북', '바람수리', '달빛고양이', '숲다람쥐', '노을참새', '안개표범', '파도수달', '별빛나비', '천둥코뿔소', '꿀벌기사'];

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function hash(x, z) { let h = (x * 374761393 + z * 668265263 + 1013904223) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

// ---------- 섬 만들기 (씨앗이 같으면 같은 섬) ----------
export function makeIsland(s) {
  seed = s || 1;
  const off = rnd() * 1000;
  const land = (x, z) => { const a = Math.atan2(z - CZ, x - CX), d = Math.hypot(x - CX, z - CZ); const R = 140 + (vnoise(Math.cos(a) * 2 + off, Math.sin(a) * 2 + off) - 0.5) * 50 + (vnoise(x / 40 + off, z / 40) - 0.5) * 20; return R - d; };
  const I = { seed: s, land, buildings: [], trees: [], rocks: [], loot: [], towns: [], walls: [], roads: [] };
  const TOWN_NAMES = ['항구 마을', '언덕 학교', '풍차 농장', '옛 공장', '해변 리조트', '숲속 캠프', '중앙 광장'];
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < 50; k++) {
      const a = rnd() * Math.PI * 2, d = 20 + rnd() * 95, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
      if (land(x, z) < 22 || I.towns.some((t) => Math.hypot(t.x - x, t.z - z) < 55)) continue;
      I.towns.push({ name: TOWN_NAMES[i % TOWN_NAMES.length], x, z, n: 4 + Math.floor(rnd() * 4) }); break;
    }
  }
  const okSpot = (x, z, w, d) => land(x, z) > Math.max(w, d) && !I.buildings.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 4 && Math.abs(b.z - z) < (b.d + d) / 2 + 4);
  const addB = (x, z) => {
    const w = 8 + Math.floor(rnd() * 3) * 2, d = 8 + Math.floor(rnd() * 3) * 2;
    if (!okSpot(x, z, w, d)) return;
    const doors = [Math.floor(rnd() * 4), Math.floor(rnd() * 4)];
    const b = { x, z, w, d, doors, color: ['#e8d8c0', '#c9d6e3', '#e3c9c9', '#d6e3c9', '#efe2a8'][Math.floor(rnd() * 5)], roof: ['#a8432f', '#3d5a80', '#5a6b4a', '#7a4a2a'][Math.floor(rnd() * 4)] };
    I.buildings.push(b);
    // 벽 (문 자리는 비움) · 두께 0.4
    const T = 0.4, DW = 1.8;
    const side = (k, x0, z0, x1, z1) => {
      if (!doors.includes(k)) { I.walls.push({ x0: Math.min(x0, x1) - T / 2, x1: Math.max(x0, x1) + T / 2, z0: Math.min(z0, z1) - T / 2, z1: Math.max(z0, z1) + T / 2 }); return; }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (x0 === x1) { I.walls.push({ x0: x0 - T / 2, x1: x0 + T / 2, z0: Math.min(z0, z1), z1: mz - DW / 2 }); I.walls.push({ x0: x0 - T / 2, x1: x0 + T / 2, z0: mz + DW / 2, z1: Math.max(z0, z1) }); }
      else { I.walls.push({ x0: Math.min(x0, x1), x1: mx - DW / 2, z0: z0 - T / 2, z1: z0 + T / 2 }); I.walls.push({ x0: mx + DW / 2, x1: Math.max(x0, x1), z0: z0 - T / 2, z1: z0 + T / 2 }); }
    };
    const hx = w / 2, hz = d / 2;
    side(0, x - hx, z - hz, x + hx, z - hz); side(1, x + hx, z - hz, x + hx, z + hz); side(2, x - hx, z + hz, x + hx, z + hz); side(3, x - hx, z - hz, x - hx, z + hz);
    // 안쪽 물건
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) I.loot.push(rollLoot(x + (rnd() - 0.5) * (w - 2), z + (rnd() - 0.5) * (d - 2), 0.15));
  };
  for (const t of I.towns) for (let i = 0; i < t.n * 3 && I.buildings.filter((b) => Math.hypot(b.x - t.x, b.z - t.z) < 40).length < t.n; i++) addB(t.x + (rnd() - 0.5) * 50, t.z + (rnd() - 0.5) * 50);
  for (let i = 0; i < 40; i++) addB(CX + (rnd() - 0.5) * 260, CZ + (rnd() - 0.5) * 260);
  // 길 (마을끼리)
  for (let i = 0; i < I.towns.length; i++) { const a = I.towns[i], b = I.towns[(i + 1) % I.towns.length]; I.roads.push([a.x, a.z, b.x, b.z]); }
  // 나무 · 바위
  for (let i = 0; i < 1400 && I.trees.length < 380; i++) { const x = rnd() * SIZE, z = rnd() * SIZE; if (land(x, z) < 8 || I.buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 2.5 && Math.abs(b.z - z) < b.d / 2 + 2.5)) continue; if (vnoise(x / 30, z / 30) < 0.45) continue; I.trees.push({ x, z, r: 0.5, s: 0.8 + rnd() * 0.6 }); }
  for (let i = 0; i < 400 && I.rocks.length < 70; i++) { const x = rnd() * SIZE, z = rnd() * SIZE; if (land(x, z) < 4 || I.buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 3 && Math.abs(b.z - z) < b.d / 2 + 3)) continue; I.rocks.push({ x, z, r: 0.9 + rnd() * 1.1 }); }
  // 바깥 물건
  for (let i = 0; i < 70; i++) { const x = rnd() * SIZE, z = rnd() * SIZE; if (land(x, z) < 5) continue; I.loot.push(rollLoot(x, z, 0)); }
  I.loot.forEach((l, i) => (l.id = i));
  // 충돌 격자 (4m)
  I.grid = new Map();
  const put = (o, x0, z0, x1, z1) => { for (let gx = Math.floor(x0 / 4); gx <= Math.floor(x1 / 4); gx++) for (let gz = Math.floor(z0 / 4); gz <= Math.floor(z1 / 4); gz++) { const k = gx + ',' + gz; let a = I.grid.get(k); if (!a) I.grid.set(k, a = []); a.push(o); } };
  for (const w of I.walls) { w.kind = 'wall'; put(w, w.x0, w.z0, w.x1, w.z1); }
  for (const t of I.trees) { t.kind = 'circ'; put(t, t.x - 1, t.z - 1, t.x + 1, t.z + 1); }
  for (const r of I.rocks) { r.kind = 'circ'; put(r, r.x - r.r, r.z - r.r, r.x + r.r, r.z + r.r); }
  return I;
}
function rollLoot(x, z, bonus) {
  const r = rnd() + bonus;
  let item;
  if (r < 0.32) item = { t: 'gun', g: rnd() < 0.55 ? 'pistol' : rnd() < 0.5 ? 'smg' : 'shotgun' };
  else if (r < 0.48) item = { t: 'gun', g: rnd() < 0.8 ? 'rifle' : 'sniper' };
  else if (r < 0.62) item = { t: 'item', i: rnd() < 0.55 ? 'vest1' : rnd() < 0.7 ? 'vest2' : 'vest3' };
  else if (r < 0.86) item = { t: 'item', i: 'band', n: 3 };
  else item = { t: 'item', i: 'med', n: 1 };
  return { x, z, ...item, taken: false };
}

// ---------- 판정 ----------
const R = 0.45;
export class Sim {
  constructor(o) {
    this.I = makeIsland(o.seed);
    this.players = []; this.shots = []; this.fx = []; this.time = 0; this.diff = o.diff || 'normal'; this.over = null; this.alive = 0; this.place = {};
    // 비행기 길
    const a = (o.seed % 628) / 100;
    this.plane = { x0: CX - Math.cos(a) * 200, z0: CZ - Math.sin(a) * 200, x1: CX + Math.cos(a) * 200, z1: CZ + Math.sin(a) * 200, T: 26, t: 0 };
    this.zone = { x: CX, z: CZ, r: 175, tx: CX, tz: CZ, tr: 175, phase: -1, t: 30, state: 'wait', dmg: 0.5 };
    this.nextZone();
    this.baseLoot = this.I.loot.length;
  }
  addPlayer(o) {
    const p = { id: o.id || 'p' + this.players.length + Math.random().toString(36).slice(2, 5), name: o.name, isBot: !!o.isBot, human: !!o.human, x: this.plane.x0, z: this.plane.z0, y: 60, vx: 0, vz: 0, face: 0,
      hp: 100, armor: 0, state: 'plane', guns: [null, null], slot: 0, mag: [0, 0], reloadT: 0, cd: 0, band: 0, med: 0, healT: 0, healing: null, kills: 0, dmg: 0, ai: {}, inp: {} };
    this.players.push(p); return p;
  }
  fillBots(n = 20) { let i = 0; while (this.players.length < n) { const p = this.addPlayer({ name: NAMES[i++ % NAMES.length], isBot: true }); p.ai.jumpAt = 3 + Math.random() * 20; } }
  removePlayer(id) { this.players = this.players.filter((p) => p.id !== id); }
  nextZone() {
    const Z = this.zone; Z.phase++;
    const P = ZONES[Math.min(Z.phase, ZONES.length - 1)];
    Z.x = Z.tx; Z.z = Z.tz; Z.r = Z.tr;
    const maxOff = Math.max(0, Z.r - P.r);
    let nx = Z.x, nz = Z.z;
    for (let k = 0; k < 20; k++) { const a = Math.random() * Math.PI * 2, d = Math.random() * maxOff; nx = Z.x + Math.cos(a) * d; nz = Z.z + Math.sin(a) * d; if (this.I.land(nx, nz) > 0 || P.r < 30) break; }
    Z.tx = nx; Z.tz = nz; Z.tr = P.r; Z.state = 'wait'; Z.t = P.wait; Z.P = P; Z.sx = Z.x; Z.sz = Z.z; Z.sr = Z.r;
  }
  // ---------- 매 프레임 ----------
  step(dt) {
    if (this.over) return;
    this.time += dt;
    // 비행기
    const PL = this.plane; PL.t = Math.min(PL.T, PL.t + dt);
    PL.x = PL.x0 + (PL.x1 - PL.x0) * PL.t / PL.T; PL.z = PL.z0 + (PL.z1 - PL.z0) * PL.t / PL.T;
    // 자기장
    const Z = this.zone;
    if (PL.t >= PL.T * 0.5) {
      Z.t -= dt;
      if (Z.state === 'wait' && Z.t <= 0) { Z.state = 'shrink'; Z.t = Z.P.shrink; }
      else if (Z.state === 'shrink') { const k = 1 - Math.max(0, Z.t) / Z.P.shrink; Z.x = Z.sx + (Z.tx - Z.sx) * k; Z.z = Z.sz + (Z.tz - Z.sz) * k; Z.r = Z.sr + (Z.tr - Z.sr) * k; if (Z.t <= 0) this.nextZone(); }
      Z.dmg = Z.P.dmg;
    }
    for (const p of this.players) this.stepPlayer(p, dt);
    this.stepShots(dt);
    // 끝?
    const alive = this.players.filter((p) => p.state !== 'dead');
    this.alive = alive.length;
    if (alive.length <= 1 && this.players.length > 1) { const w = alive[0]; if (w) this.place[w.id] = 1; this.over = { win: w ? w.id : null }; this.fx.push({ t: 'over' }); }
  }
  stepPlayer(p, dt) {
    if (p.state === 'dead') return;
    const inp = p.isBot ? this.bot(p, dt) : p.inp;
    if (p.state === 'plane') {
      p.x = this.plane.x; p.z = this.plane.z;
      if (inp.jump || this.plane.t >= this.plane.T) { p.state = 'chute'; p.y = 60; inp.jump = false; this.fx.push({ t: 'jump', id: p.id }); }
      return;
    }
    let mx = inp.mx || 0, mz = inp.mz || 0; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (p.state === 'chute') {
      p.y -= dt * (inp.dive ? 12 : 7); this.moveBy(p, mx * 13 * dt, mz * 13 * dt, true);
      if (p.y <= 0) { p.y = 0; p.state = 'ground'; this.unstick(p); }
      return;
    }
    // 땅 위
    const sp = p.healing ? 2.2 : 5.4;
    if (!p.remoteMove) { p.vx = mx * sp; p.vz = mz * sp; this.moveBy(p, p.vx * dt, p.vz * dt); }
    if (inp.aim !== undefined) p.face = inp.aim; else if (ml > 0.1) p.face = Math.atan2(mx, mz);
    // 회복
    if (p.healing) { p.healT -= dt; if (ml > 0.3 && p.healing === 'med' && !p.isBot) { /* 움직여도 계속 */ } if (p.healT <= 0) { const H = ITEMS[p.healing]; p.hp = Math.min(H.cap, Math.max(p.hp, Math.min(H.cap, p.hp + H.heal))); p.healing = null; } }
    if (inp.heal) { inp.heal = false; this.startHeal(p); }
    // 무기
    p.cd -= dt;
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { const G = GUNS[p.guns[p.slot]]; if (G) p.mag[p.slot] = G.mag; } }
    if (inp.slot !== undefined && inp.slot !== p.slot) { if (p.guns[inp.slot]) { p.slot = inp.slot; p.reloadT = 0; p.cd = 0.3; } inp.slot = undefined; }
    if (inp.reload) { inp.reload = false; this.reload(p); }
    if (inp.fire) { this.fire(p, inp.aim ?? p.face); if (!GUNS[p.guns[p.slot]]?.auto) inp.fire = false; }
    if (inp.pick) { inp.pick = false; this.pickup(p); }
    // 자기장 피해
    const Z = this.zone;
    if (Math.hypot(p.x - Z.x, p.z - Z.z) > Z.r && this.plane.t >= this.plane.T * 0.5) { p.zoneT = (p.zoneT || 0) + dt; if (p.zoneT >= 1) { p.zoneT = 0; this.hurt(p, Z.dmg, null, true); } }
  }
  moveBy(p, dx, dz, air) {
    const nx = p.x + dx, nz = p.z + dz;
    if (air) { p.x = Math.max(0, Math.min(SIZE, nx)); p.z = Math.max(0, Math.min(SIZE, nz)); return; }
    if (!this.blocked(nx, p.z) && this.I.land(nx, p.z) > -2) p.x = nx;
    if (!this.blocked(p.x, nz) && this.I.land(p.x, nz) > -2) p.z = nz;
  }
  blocked(x, z, r = R) {
    const a = this.I.grid.get(Math.floor(x / 4) + ',' + Math.floor(z / 4));
    if (!a) return false;
    for (const o of a) {
      if (o.kind === 'wall') { if (x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1) return true; }
      else if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
    }
    return false;
  }
  unstick(p) { if (!this.blocked(p.x, p.z)) return; for (let r = 1; r < 10; r += 0.5) for (let a = 0; a < 12; a++) { const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; if (!this.blocked(x, z)) { p.x = x; p.z = z; return; } } }
  // 광선이 벽 · 나무 · 바위에 막히는지 (거리 반환)
  rayHit(x0, z0, dx, dz, max) {
    for (let t = 0; t < max; t += 0.35) { const x = x0 + dx * t, z = z0 + dz * t; const a = this.I.grid.get(Math.floor(x / 4) + ',' + Math.floor(z / 4)); if (!a) continue; for (const o of a) { if (o.kind === 'wall') { if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return t; } else if (Math.hypot(x - o.x, z - o.z) < o.r * (o.s ? 0.7 : 1)) return t; } }
    return max;
  }
  los(a, b) { const d = Math.hypot(b.x - a.x, b.z - a.z); return this.rayHit(a.x, a.z, (b.x - a.x) / d, (b.z - a.z) / d, d) >= d - 0.5; }
  // ---------- 싸움 ----------
  fire(p, a) {
    const G = GUNS[p.guns[p.slot]];
    if (!G || p.state !== 'ground' || p.cd > 0 || p.reloadT > 0) return;
    if (p.mag[p.slot] <= 0) { this.reload(p); return; }
    p.mag[p.slot]--; p.cd = 1 / G.rate; p.healing = null;
    const moving = Math.hypot(p.vx, p.vz) > 1;
    for (let i = 0; i < (G.pellets || 1); i++) {
      const sa = a + (Math.random() - 0.5) * 2 * G.spread * (moving ? 1.6 : 1);
      this.shots.push({ id: Math.random().toString(36).slice(2, 7), owner: p.id, x: p.x + Math.sin(a) * 0.6, z: p.z + Math.cos(a) * 0.6, vx: Math.sin(sa) * G.speed, vz: Math.cos(sa) * G.speed, left: G.range, dmg: G.dmg, g: G.id });
    }
    this.fx.push({ t: 'fire', id: p.id, g: G.id, x: p.x, z: p.z });
  }
  reload(p) { const G = GUNS[p.guns[p.slot]]; if (!G || p.reloadT > 0 || p.mag[p.slot] >= G.mag) return; p.reloadT = G.reload; }
  stepShots(dt) {
    for (const s of this.shots) {
      const sp = Math.hypot(s.vx, s.vz) * dt, n = Math.ceil(sp / 0.5);
      for (let i = 0; i < n && s.left > 0; i++) {
        s.x += s.vx * dt / n; s.z += s.vz * dt / n; s.left -= sp / n;
        if (this.blocked(s.x, s.z, 0.05)) { s.left = 0; this.fx.push({ t: 'spark', x: s.x, z: s.z }); break; }
        for (const e of this.players) {
          if (e.id === s.owner || e.state !== 'ground') continue;
          if (Math.hypot(e.x - s.x, e.z - s.z) > R + 0.1) continue;
          const by = this.players.find((q) => q.id === s.owner);
          this.hurt(e, s.dmg * (s.left / GUNS[s.g].range < 0.3 && s.g === 'shotgun' ? 0.6 : 1), by);
          this.fx.push({ t: 'hit', x: s.x, z: s.z }); s.left = 0; break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.left > 0);
  }
  hurt(e, dmg, by, zone) {
    if (e.state !== 'ground') return;
    dmg = Math.round(dmg);
    if (!zone && e.armor > 0) { const a = Math.min(e.armor, Math.round(dmg * 0.5)); e.armor -= a; dmg -= a; }
    e.hp -= dmg; e.healing = null;
    if (by) { by.dmg += dmg; if (e.isBot) e.ai.hurtBy = by.id; }
    this.fx.push({ t: 'num', x: e.x, z: e.z, n: dmg, id: e.id, zone: !!zone });
    if (e.hp <= 0) this.kill(e, by, zone);
  }
  kill(e, by, zone) {
    e.state = 'dead'; e.hp = 0; this.place[e.id] = this.players.filter((p) => p.state !== 'dead').length + 1;
    if (by) by.kills++;
    // 가진 것 떨어뜨림
    const drop = (o) => { const L = { ...o, x: e.x + (Math.random() - 0.5) * 2, z: e.z + (Math.random() - 0.5) * 2, taken: false, id: this.I.loot.length }; this.I.loot.push(L); };
    for (const g of e.guns) if (g) drop({ t: 'gun', g });
    if (e.band) drop({ t: 'item', i: 'band', n: e.band }); if (e.med) drop({ t: 'item', i: 'med', n: e.med });
    this.fx.push({ t: 'kill', id: e.id, by: by ? by.id : null, zone: !!zone, x: e.x, z: e.z });
  }
  startHeal(p) { if (p.healing || p.state !== 'ground') return; const k = p.hp < 75 && p.band > 0 ? 'band' : p.med > 0 && p.hp < 100 ? 'med' : null; if (!k) return; p[k]--; p.healing = k; p.healT = ITEMS[k].time; }
  nearLoot(p, r = 2.2) { let best = null, bd = r; for (const L of this.I.loot) { if (L.taken) continue; const d = Math.hypot(L.x - p.x, L.z - p.z); if (d < bd) { bd = d; best = L; } } return best; }
  pickup(p, L) {
    L = L || this.nearLoot(p); if (!L || L.taken) return false;
    if (L.t === 'gun') {
      const slot = !p.guns[0] ? 0 : !p.guns[1] ? 1 : p.slot;
      const old = p.guns[slot];
      if (old === L.g) return false;
      p.guns[slot] = L.g; p.mag[slot] = GUNS[L.g].mag; p.slot = slot; p.reloadT = 0;
      L.taken = true;
      if (old) { const N = { t: 'gun', g: old, x: p.x, z: p.z, taken: false, id: this.I.loot.length }; this.I.loot.push(N); }
    } else {
      const it = ITEMS[L.i];
      if (it.armor) { if (p.armor >= it.armor) return false; p.armor = it.armor; }
      else p[L.i] = (p[L.i] || 0) + (L.n || 1);
      L.taken = true;
    }
    this.fx.push({ t: 'pick', id: p.id, x: L.x, z: L.z });
    return true;
  }

  // ---------- 봇 ----------
  bot(p, dt) {
    const ai = p.ai, o = ai.o || (ai.o = {});
    o.fire = false;
    if (p.state === 'plane') { if (this.plane.t > ai.jumpAt) o.jump = true; return o; }
    if (p.state === 'chute') { if (!ai.land) { const t = this.I.towns[Math.floor(Math.random() * this.I.towns.length)] || { x: CX, z: CZ }; ai.land = { x: t.x + (Math.random() - 0.5) * 40, z: t.z + (Math.random() - 0.5) * 40 }; } const dx = ai.land.x - p.x, dz = ai.land.z - p.z, d = Math.hypot(dx, dz) || 1; o.mx = dx / d; o.mz = dz / d; o.dive = d < 20; return o; }
    const D = { easy: { err: 0.16, react: 0.7, vis: 26 }, normal: { err: 0.09, react: 0.45, vis: 34 }, hard: { err: 0.045, react: 0.25, vis: 42 } }[this.diff];
    ai.t = (ai.t || 0) - dt;
    if (ai.t > 0) return o;
    ai.t = 0.12;
    const G = GUNS[p.guns[p.slot]];
    // 적 찾기
    let tgt = null, td = D.vis;
    for (const e of this.players) { if (e === p || e.state !== 'ground') continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < td && this.los(p, e)) { td = d; tgt = e; } }
    if (!tgt && ai.hurtBy) { const h = this.players.find((q) => q.id === ai.hurtBy && q.state === 'ground'); if (h && Math.hypot(h.x - p.x, h.z - p.z) < 50) { tgt = h; td = Math.hypot(h.x - p.x, h.z - p.z); } }
    // 회복
    if (!tgt && p.hp < 60 && (p.band || p.med) && !p.healing) { o.heal = true; o.mx = o.mz = 0; return o; }
    // 가장 좋은 총 들기
    if (p.guns[0] && p.guns[1]) { const best = GUNS[p.guns[0]].dmg * GUNS[p.guns[0]].rate > GUNS[p.guns[1]].dmg * GUNS[p.guns[1]].rate ? 0 : 1; if (tgt && td < 12 && (p.guns[0] === 'shotgun' || p.guns[1] === 'shotgun')) o.slot = p.guns[0] === 'shotgun' ? 0 : 1; else if (best !== p.slot) o.slot = best; }
    const Z = this.zone, outZone = Math.hypot(p.x - Z.tx, p.z - Z.tz) > Z.tr * 0.85 && (Z.state === 'shrink' || Z.t < 15) || Math.hypot(p.x - Z.x, p.z - Z.z) > Z.r - 3;
    if (tgt && G) {
      ai.seen = (ai.seen || 0) + 0.12;
      const lead = td / G.speed;
      const a = Math.atan2(tgt.x + tgt.vx * lead - p.x, tgt.z + tgt.vz * lead - p.z) + (Math.random() - 0.5) * D.err * 2;
      o.aim = a;
      if (ai.seen > D.react && td < G.range * 0.95) { o.fire = true; if (p.mag[p.slot] <= 0) o.reload = true; }
      ai.side = ai.side || 1; if (Math.random() < 0.06) ai.side *= -1;
      const keep = G.range * 0.55;
      const perp = a + Math.PI / 2 * ai.side;
      o.mx = Math.sin(perp) * 0.7 + (td > keep ? Math.sin(a) * 0.6 : td < keep * 0.5 ? -Math.sin(a) * 0.5 : 0);
      o.mz = Math.cos(perp) * 0.7 + (td > keep ? Math.cos(a) * 0.6 : td < keep * 0.5 ? -Math.cos(a) * 0.5 : 0);
      if (outZone) { const za = Math.atan2(Z.tx - p.x, Z.tz - p.z); o.mx = Math.sin(za); o.mz = Math.cos(za); }
      return o;
    }
    ai.seen = 0; o.aim = undefined;
    if (p.mag[p.slot] < (G ? G.mag * 0.5 : 0)) o.reload = true;
    // 줍기 → 자기장 안으로 → 돌아다니기
    const L = this.nearLoot(p, 1.6); if (L && this.wantLoot(p, L)) o.pick = true;
    let goal = null;
    if (outZone) goal = { x: Z.tx + (Math.random() - 0.5) * Z.tr * 0.5, z: Z.tz + (Math.random() - 0.5) * Z.tr * 0.5 };
    else if (!p.guns[0] || !p.guns[1] || p.armor < 50 || (p.band + p.med) < 2) { let best = null, bd = 60; for (const q of this.I.loot) { if (q.taken || !this.wantLoot(p, q)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } } goal = best; }
    if (!goal) { if (!ai.wander || Math.hypot(ai.wander.x - p.x, ai.wander.z - p.z) < 3 || Math.random() < 0.01) { const a = Math.random() * 6.28, d = Math.random() * Z.r * 0.7; ai.wander = { x: Z.x + Math.cos(a) * d, z: Z.z + Math.sin(a) * d }; } goal = ai.wander; }
    const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1;
    let a = Math.atan2(dx, dz);
    // 앞이 막혔으면 옆으로 돌아감
    if (this.rayHit(p.x, p.z, Math.sin(a), Math.cos(a), 2.5) < 2.5) { ai.turn = ai.turn || (Math.random() < 0.5 ? 1 : -1); for (let k = 1; k < 8; k++) { const b = a + k * 0.4 * ai.turn; if (this.rayHit(p.x, p.z, Math.sin(b), Math.cos(b), 2.5) >= 2.5) { a = b; break; } } } else ai.turn = 0;
    o.mx = Math.sin(a) * Math.min(1, d); o.mz = Math.cos(a) * Math.min(1, d);
    return o;
  }
  wantLoot(p, L) {
    if (L.t === 'gun') { if (!p.guns[0] || !p.guns[1]) return !p.guns.includes(L.g); const worst = Math.min(GUNS[p.guns[0]].rar, GUNS[p.guns[1]].rar); return GUNS[L.g].rar > worst; }
    const it = ITEMS[L.i]; if (it.armor) return p.armor < it.armor; return (p.band + p.med) < 6;
  }
  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10, Z = this.zone;
    return {
      p: this.players.map((p) => [p.id, p.name, r1(p.x), r1(p.z), r1(p.y), Math.round(p.face * 100) / 100, Math.round(p.hp), p.armor, { plane: 0, chute: 1, ground: 2, dead: 3 }[p.state], p.guns[0] || '', p.guns[1] || '', p.slot, p.mag[0], p.mag[1], p.kills, p.healing ? 1 : 0, p.isBot ? 1 : 0, p.band, p.med, p.reloadT > 0 ? 1 : 0]),
      s: this.shots.slice(0, 24).map((s) => [r1(s.x), r1(s.z), r1(s.vx), r1(s.vz)]),
      z: [r1(Z.x), r1(Z.z), r1(Z.r), r1(Z.tx), r1(Z.tz), r1(Z.tr), Math.ceil(Z.t), Z.state === 'shrink' ? 1 : 0, Z.phase],
      pl: [r1(this.plane.t)],
      lt: this.I.loot.filter((l) => l.taken).map((l) => l.id.toString(36)).join('.'),
      nl: this.I.loot.slice(Math.max(this.baseLoot || 0, this.I.loot.length - 30)).map((l) => [l.id, r1(l.x), r1(l.z), l.t === 'gun' ? l.g : l.i, l.n || 1]),
      ov: this.over ? [this.over.win] : null, al: this.alive, pc: this.place,
    };
  }
}
