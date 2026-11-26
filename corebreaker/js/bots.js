// ===================== 봇 인공지능 =====================
import { findPath, rayWorld, SITES, HOLDS, ENTRIES, zoneAt, cellOf, hAt } from './map.js';
import { WEAPONS, AGENTS } from './weapons.js';

const DIFF = {
  easy: { react: [0.55, 0.85], turn: 4.5, err: 0.09, head: 0.12, burst: 3 },
  normal: { react: [0.32, 0.55], turn: 7, err: 0.05, head: 0.28, burst: 4 },
  hard: { react: [0.18, 0.32], turn: 11, err: 0.025, head: 0.5, burst: 6 },
};
const BOT_NAMES = ['라온', '해솔', '다온', '바람', '노을', '이든', '하람', '새봄', '가람', '누리', '단비', '한결', '초롱', '마루', '별하', '은솔'];
export function botName(i) { return BOT_NAMES[i % BOT_NAMES.length]; }

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// 봇이 상점에서 사기
export function botBuy(a) {
  const c = a.credits;
  const has1 = !!a.guns[1];
  const buy = (id) => { const W = WEAPONS[id]; if (a.credits >= W.price) { a.credits -= W.price; a.guns[1] = { id, mag: W.mag, res: W.reserve }; a.slot = 1; return true; } return false; };
  const arm = (k, p, ap) => { if (a.credits >= p && a.armor < ap) { a.credits -= p; a.armor = ap; } };
  if (!has1) {
    if (c >= 3900) { if (a.agent === 'echo' && Math.random() < 0.35 && c >= 5700) buy('owl'); else buy(Math.random() < 0.5 ? 'lance' : 'halberd'); arm('heavy', 1000, 50); }
    else if (c >= 2400 && Math.random() < 0.7) { buy(Math.random() < 0.5 ? 'lance' : 'halberd'); }
    else if (c >= 1600 && Math.random() < 0.5) { buy(Math.random() < 0.7 ? 'wasp' : 'burst'); arm('light', 400, 25); }
    else if (c >= 700 && Math.random() < 0.4) { a.credits -= 500; a.guns[2] = { id: 'viper', mag: 8, res: 24 }; }
  } else arm(a.credits >= 1800 ? 'heavy' : 'light', a.credits >= 1800 ? 1000 : 400, a.credits >= 1800 ? 50 : 25);
  const A = AGENTS[a.agent];
  for (const k of ['q', 'e']) while (a.abil[k] < A[k].max && a.credits >= A[k].price + 300 && A[k].price > 0) { a.credits -= A[k].price; a.abil[k]++; }
  a.slot = a.guns[1] ? 1 : 2;
}

export class BotBrain {
  constructor(a, diff = 'normal') { this.a = a; this.D = DIFF[diff] || DIFF.normal; this.reset(); }
  reset() {
    this.path = null; this.pi = 0; this.goal = null; this.target = null; this.react = 0; this.seenT = 0; this.burst = 0;
    this.think = 0; this.strafe = 0; this.strafeT = 0; this.stuckT = 0; this.lx = 0; this.lz = 0; this.waitT = 0; this.lookYaw = null;
    this.plan = null; this.planT = 0; this.usedAbil = false; this.aimErr = [0, 0];
  }
  go(x, z) { this.path = findPath(this.a.x, this.a.z, x, z); this.pi = 0; this.goal = { x, z }; }
  // G: 게임 (적 목록 · 연막 · 코어 상태 등)
  update(dt, G) {
    const a = this.a, D = this.D;
    if (!a.alive) return null;
    const out = { wx: 0, wz: 0, jump: false, fire: false, crouch: false, walk: false, use: null, plant: false, defuse: false };
    // ---- 보기 ----
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.12;
      let best = null, bd = 1e9;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      for (const e of G.actors) {
        if (!e.alive || e.team === a.team) continue;
        const dx = e.x - a.x, dz = e.z - a.z, d = Math.hypot(dx, dz);
        if (d > 75) continue;
        const known = e.revealT > 0 || (this.target === e && this.seenT > 0);
        const inFov = (dx * fx + dz * fz) / (d || 1) > 0.35 || d < 4 || this.hurtBy === e;
        if (!inFov && !known) continue;
        if (a.flashT > 0.3) continue;
        if (!G.canSee(a, e)) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (best && best !== this.target) { this.target = best; this.react = D.react[0] + Math.random() * (D.react[1] - D.react[0]); this.aimErr = [(Math.random() - 0.5) * D.err * 6, (Math.random() - 0.5) * D.err * 4]; }
      if (best) { this.seenT = 1.2; this.last = { x: best.x, z: best.z }; G.teamIntel(a.team, best); }
      else if (this.seenT <= 0) this.target = null;
    }
    this.seenT -= dt; this.hurtBy = null;
    const W = a.W;
    // ---- 싸우기 ----
    if (this.target && this.target.alive && this.seenT > 0.9) {
      const e = this.target;
      const head = Math.random() < D.head;
      const ty = (head ? e.eye - 0.02 : e.y + 1.15 * (e.crouch > 0.5 ? 0.72 : 1));
      const dx = e.x - a.x, dz = e.z - a.z, dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz) + this.aimErr[0] / Math.max(1, dist * 0.08), wantPitch = Math.atan2(ty - a.eye, dist) + this.aimErr[1] / Math.max(1, dist * 0.08);
      const turn = D.turn * dt;
      const dy = angDiff(a.yaw, wantYaw), dp = wantPitch - a.pitch;
      a.yaw += Math.max(-turn, Math.min(turn, dy)); a.pitch += Math.max(-turn, Math.min(turn, dp));
      // 조준이 점점 정확해짐
      this.aimErr[0] *= Math.pow(0.15, dt); this.aimErr[1] *= Math.pow(0.15, dt);
      this.react -= dt;
      if (this.react <= 0 && Math.abs(angDiff(a.yaw, wantYaw)) < 0.06 + 0.4 / Math.max(2, dist)) {
        if (a.gun.mag <= 0) out.reload = true;
        else if (W.auto) { if (this.burst > 0 || Math.random() < dt * 8) { out.fire = true; this.burst = this.burst > 0 ? this.burst - 1 : D.burst; } }
        else out.fire = Math.random() < dt * (W.rate * 0.8);
        if (a.shotN > D.burst + 2) { out.fire = false; this.burst = 0; } // 연사 끊기 (반동 정리)
      }
      // 옆으로 움직이며 싸움 (소총 · 저격은 쏠 때 멈춤)
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.4 + Math.random() * 0.7; this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) this.strafe = 0; }
      if (!(out.fire && (W.slot === 1 && W.id !== 'wasp'))) { out.wx = Math.cos(a.yaw) * this.strafe; out.wz = -Math.sin(a.yaw) * this.strafe; }
      if (a.hp < 45 && a.agent === 'medi' && a.abil.q > 0) out.use = 'q';
      if (a.agent === 'blaze' && a.abil.e > 0 && dist > 8 && dist < 22 && Math.random() < dt * 0.4) out.use = 'e';
      return out;
    }
    if (a.gun.mag < W.mag * 0.4 && a.gun.res > 0 && !this.target) out.reload = true;
    if (a.hp < 60 && a.agent === 'medi' && a.abil.q > 0) out.use = 'q';
    // ---- 계획 ----
    const atk = a.team === 'atk', C = G.core;
    this.planT -= dt;
    const goTo = (x, z, key) => { if (this.plan !== key || !this.path) { this.plan = key; this.go(x, z); } };
    if (G.phase === 'buy') { this.lookYaw = atk ? Math.PI : 0; return out; }
    if (atk) {
      if (C.state === 'planted') {
        if (!this.post) { const s = SITES[C.site]; this.post = { x: s.x + (Math.random() - 0.5) * 14, z: s.z + 6 + Math.random() * 8 }; }
        goTo(this.post.x, this.post.z, 'post');
      } else if (a.carry) {
        const s = SITES[G.atkSite];
        if (zoneAt(a.x, a.z) === s.zone && Math.hypot(a.x - s.x, a.z - s.z) < 7) { out.plant = true; this.path = null; return out; }
        this.route(G, s, 'carry');
      } else if (C.state === 'dropped' && Math.hypot(C.x - a.x, C.z - a.z) < 40) {
        goTo(C.x, C.z, 'pick');
      } else {
        const s = SITES[G.atkSite];
        if (Math.hypot(a.x - s.x, a.z - s.z) < 9) { if (!this.post) this.post = { x: s.x + (Math.random() - 0.5) * 12, z: s.z + (Math.random() - 0.5) * 8 }; goTo(this.post.x, this.post.z, 'onsite'); }
        else this.route(G, s, 'push');
        // 사이트 들어가기 전 연막 · 정찰
        if (!this.usedAbil && Math.hypot(a.x - s.x, a.z - s.z) < 26) {
          if (a.agent === 'mist' && a.abil.q > 0) { this.usedAbil = true; out.use = 'q'; out.useAt = HOLDS[s.name][Math.floor(Math.random() * 2)]; }
          else if (a.agent === 'echo' && a.abil.q > 0) { this.usedAbil = true; out.use = 'q'; }
        }
      }
    } else {
      if (C.state === 'planted') {
        const intel = G.intel[a.team];
        const threat = intel && G.time - intel.t < 2.5 && Math.hypot(intel.x - C.x, intel.z - C.z) < 12;
        if (Math.hypot(C.x - a.x, C.z - a.z) < 1.6 && !threat) { out.defuse = true; out.crouch = true; this.path = null; return out; }
        goTo(C.x, C.z, 'retake');
      } else {
        // 지킬 자리 (사이트별로 나눔)
        if (!this.hold) {
          const site = this.site || 'A';
          const list = HOLDS[site];
          this.hold = list[this.holdIdx % list.length];
        }
        const intel = G.intel[a.team];
        if (intel && G.time - intel.t < 4 && this.rotateOk && Math.hypot(intel.x - a.x, intel.z - a.z) < 45) goTo(intel.x, intel.z, 'rotate' + Math.round(intel.t));
        else {
          goTo(this.hold.x, this.hold.z, 'hold');
          if (this.path && this.pi >= this.path.length) this.lookYaw = this.holdLook;
        }
      }
    }
    // 길 따라 걷기
    if (this.path && this.pi < this.path.length) {
      const p = this.path[this.pi];
      const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.7) this.pi++;
      else { out.wx = dx / d; out.wz = dz / d; const wy = Math.atan2(dx, dz); a.yaw += Math.max(-dt * 6, Math.min(dt * 6, angDiff(a.yaw, wy))); a.pitch *= 0.9; }
      // 끼임 풀기
      if (Math.hypot(a.x - this.lx, a.z - this.lz) < dt * 0.6) { this.stuckT += dt; if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; out.jump = true; } } else this.stuckT = 0;
      this.lx = a.x; this.lz = a.z;
    } else if (this.lookYaw !== null && this.lookYaw !== undefined) {
      a.yaw += Math.max(-dt * 3, Math.min(dt * 3, angDiff(a.yaw, this.lookYaw)));
      // 가만히 지킬 때는 가끔 둘러봄
      if (Math.random() < dt * 0.3) this.lookYaw += (Math.random() - 0.5) * 1.2;
    }
    return out;
  }
  // 공격: 정해진 길목을 지나서 사이트로
  route(G, s, key) {
    const a = this.a;
    if (!this.entry) { const list = ENTRIES[s.name]; this.entry = list[this.entryIdx % list.length].slice(); }
    while (this.entry.length && Math.hypot(this.entry[0].x - a.x, this.entry[0].z - a.z) < 3) this.entry.shift();
    const tgt = this.entry[0] || { x: s.x, z: s.z };
    const k = key + tgt.x + ',' + tgt.z;
    if (this.plan !== k || !this.path) { this.plan = k; this.go(tgt.x, tgt.z); }
  }
}
export { hAt, cellOf, rayWorld };
