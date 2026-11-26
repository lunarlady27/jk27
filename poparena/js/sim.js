// ===================== 팝 아레나 — 시뮬레이션 (판정 · 봇) =====================
import { T, MW, MH, tile, tileAt, solid, blocksMove, SPAWN, GEM_SPOT, HEROES, MODES, BOT_NAMES } from './data.js';

const R = 0.48; // 몸 반지름
let uid = 1;
const ang = (dx, dz) => Math.atan2(dx, dz);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Sim {
  constructor(opts) {
    this.mode = opts.mode || 'gem'; this.M = MODES[this.mode];
    this.time = 0; this.timer = this.M.time; this.over = null;
    this.players = []; this.shots = []; this.lobs = []; this.zones = []; this.gems = []; this.fx = [];
    this.score = { red: 0, blue: 0 }; this.count = null; this.gemT = 4; this.diff = opts.diff || 'normal';
  }
  addPlayer(o) {
    const H = HEROES[o.hero];
    const p = { id: o.id || 'p' + uid++, name: o.name, team: o.team, hero: o.hero, isBot: !!o.isBot, human: !!o.human, x: 0, z: 0, vx: 0, vz: 0, face: o.team === 'red' ? 0 : Math.PI,
      hp: H.hp, maxHp: H.hp, ammo: 3, superCh: 0, dead: false, respawnT: 0, gems: 0, kos: 0, deaths: 0, dmgDone: 0, revealT: 0, calmT: 0, burstQ: [], spinT: 0, dashT: 0, leap: null, ai: {} };
    this.players.push(p); this.spawn(p); return p;
  }
  removePlayer(id) { this.players = this.players.filter((p) => p.id !== id); }
  fillBots() {
    const heroes = Object.keys(HEROES); let k = 0;
    for (const team of ['red', 'blue']) {
      while (this.players.filter((p) => p.team === team).length < 3) {
        const used = this.players.filter((p) => p.team === team).map((p) => p.hero);
        const free = heroes.filter((h) => !used.includes(h));
        this.addPlayer({ name: BOT_NAMES[(k++ + (team === 'blue' ? 6 : 0)) % BOT_NAMES.length], team, hero: free[Math.floor(Math.random() * free.length)], isBot: true });
      }
    }
  }
  spawn(p) {
    const list = SPAWN[p.team], i = this.players.filter((q) => q.team === p.team).indexOf(p);
    const s = list[(i < 0 ? 0 : i) % list.length];
    p.x = s.x; p.z = s.z; p.vx = p.vz = 0; p.hp = p.maxHp; p.dead = false; p.ammo = 3; p.leap = null; p.spinT = 0; p.dashT = 0; p.face = p.team === 'red' ? 0 : Math.PI;
  }
  // ---------- 매 프레임 ----------
  step(dt) {
    if (this.over) return;
    this.time += dt; this.timer -= dt;
    for (const p of this.players) this.stepPlayer(p, dt);
    this.stepShots(dt); this.stepLobs(dt); this.stepZones(dt);
    if (this.mode === 'gem') this.stepGems(dt);
    this.checkEnd(dt);
  }
  stepPlayer(p, dt) {
    const H = HEROES[p.hero];
    if (p.dead) { p.respawnT -= dt; if (p.respawnT <= 0) this.spawn(p); return; }
    p.revealT = Math.max(0, p.revealT - dt); p.calmT += dt;
    // 재장전 (한 칸씩)
    if (p.ammo < 3) p.ammo = Math.min(3, p.ammo + dt / (H.atk.kind === 'melee' ? 1.1 : 1.45));
    // 쉬면 체력 회복
    if (p.calmT > 3 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.13 * dt);
    // 연사 대기열
    if (p.burstQ.length) { p.burstQ[0].t -= dt; if (p.burstQ[0].t <= 0) { const b = p.burstQ.shift(); this.bullet(p, b.a, H.atk); } }
    // 필살기 진행 중
    if (p.dashT > 0) {
      p.dashT -= dt; const sp = 20;
      this.moveBy(p, Math.sin(p.dashA) * sp * dt, Math.cos(p.dashA) * sp * dt);
      for (const e of this.players) if (e.team !== p.team && !e.dead && dist(e, p) < 1.3 && !p.dashHit.includes(e.id)) { p.dashHit.push(e.id); this.hurt(e, H.sup.dmg, p); this.fx.push({ t: 'hit', x: e.x, z: e.z }); }
      return;
    }
    if (p.leap) {
      const L = p.leap; L.t += dt; const k = Math.min(1, L.t / L.T);
      p.x = L.x0 + (L.x1 - L.x0) * k; p.z = L.z0 + (L.z1 - L.z0) * k; p.y = Math.sin(k * Math.PI) * 3;
      if (k >= 1) { p.leap = null; p.y = 0; this.unstick(p); this.blast(p.x, p.z, H.sup.radius, H.sup.dmg, p); }
      return;
    }
    if (p.spinT > 0) {
      p.spinT -= dt; p.spinTick = (p.spinTick || 0) - dt; p.face += dt * 14;
      if (p.spinTick <= 0) { p.spinTick = 0.4; for (const e of this.players) if (e.team !== p.team && !e.dead && dist(e, p) < H.sup.radius) { this.hurt(e, H.sup.dmg * 0.4, p); this.fx.push({ t: 'hit', x: e.x, z: e.z }); } }
    }
    // 이동 (사람: 입력 · 봇: AI)
    const inp = p.isBot ? this.botThink(p, dt) : p.inp || {};
    let mx = inp.mx || 0, mz = inp.mz || 0; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = H.speed * (p.spinT > 0 ? 1.15 : 1);
    if (!p.remoteMove) { p.vx = mx * sp; p.vz = mz * sp; this.moveBy(p, p.vx * dt, p.vz * dt); }
    if (ml > 0.1 && !inp.aiming) p.face = ang(mx, mz);
    if (inp.aim !== undefined && inp.aiming) p.face = inp.aim;
    if (inp.fire) { this.attack(p, inp.aim ?? p.face, inp.aimD); inp.fire = false; }
    if (inp.sup) { this.superAtk(p, inp.aim ?? p.face, inp.aimD); inp.sup = false; }
    // 젬 줍기
    if (this.mode === 'gem') for (const g of this.gems) if (!g.taken && Math.hypot(g.x - p.x, g.z - p.z) < 0.9 && g.cool <= 0) { g.taken = true; p.gems++; this.fx.push({ t: 'gem', x: g.x, z: g.z, id: p.id }); }
  }
  moveBy(p, dx, dz) {
    const ok = (x, z) => { for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]]) if (blocksMove(tileAt(x + ox, z + oz))) return false; return true; };
    if (ok(p.x + dx, p.z)) p.x += dx;
    if (ok(p.x, p.z + dz)) p.z += dz;
  }
  unstick(p) { if (!blocksMove(tileAt(p.x, p.z))) return; for (let r = 1; r < 6; r++) for (let a = 0; a < 8; a++) { const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; if (!blocksMove(tileAt(x, z))) { p.x = x; p.z = z; return; } } }
  // ---------- 공격 ----------
  attack(p, a, d) {
    const H = HEROES[p.hero], A = H.atk;
    if (p.dead || p.ammo < 1 || p.leap || p.dashT > 0) return false;
    p.ammo -= 1; p.revealT = 1.2; p.calmT = 0; p.face = a;
    if (A.kind === 'shot') {
      if (A.burst) for (let i = 0; i < A.n; i++) p.burstQ.push({ t: i === 0 ? 0 : A.burst, a: a + (Math.random() - 0.5) * A.spread });
      else for (let i = 0; i < A.n; i++) this.bullet(p, a + (A.n > 1 ? (i / (A.n - 1) - 0.5) * A.spread : 0), A);
    } else if (A.kind === 'heal') this.bullet(p, a, A, true);
    else if (A.kind === 'melee') {
      this.fx.push({ t: 'swing', x: p.x, z: p.z, a, r: A.range, color: H.color });
      for (const e of this.players) { if (e.team === p.team || e.dead) continue; const dd = dist(e, p); if (dd > A.range + 0.4) continue; let da = ang(e.x - p.x, e.z - p.z) - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; if (Math.abs(da) < A.arc / 2 + 0.25) { this.hurt(e, A.dmg, p); this.fx.push({ t: 'hit', x: e.x, z: e.z }); } }
    } else if (A.kind === 'lob') {
      const L = Math.min(A.range, Math.max(1.5, d ?? A.range));
      this.lobs.push({ owner: p.id, team: p.team, x0: p.x, z0: p.z, x1: p.x + Math.sin(a) * L, z1: p.z + Math.cos(a) * L, t: 0, T: A.flight, dmg: A.dmg, r: A.radius, big: false });
    }
    this.fx.push({ t: 'fire', id: p.id, hero: p.hero });
    return true;
  }
  bullet(p, a, A, heal) {
    this.shots.push({ id: uid++, owner: p.id, team: p.team, x: p.x + Math.sin(a) * 0.6, z: p.z + Math.cos(a) * 0.6, vx: Math.sin(a) * A.speed, vz: Math.cos(a) * A.speed, left: A.range, dmg: A.dmg, heal: heal ? A.heal : 0, size: A.size, hero: p.hero, pierce: false });
  }
  superAtk(p, a, d) {
    const H = HEROES[p.hero], S = H.sup;
    if (p.dead || p.superCh < 1 || p.leap || p.dashT > 0) return false;
    p.superCh = 0; p.revealT = 1.5; p.calmT = 0; p.face = a;
    this.fx.push({ t: 'super', id: p.id, hero: p.hero, x: p.x, z: p.z });
    if (S.kind === 'dash') { p.dashT = S.range / 20; p.dashA = a; p.dashHit = []; }
    else if (S.kind === 'leap') { const L = Math.min(S.range, Math.max(2, d ?? S.range)); let x1 = p.x + Math.sin(a) * L, z1 = p.z + Math.cos(a) * L; x1 = Math.max(T, Math.min((MW - 1) * T, x1)); z1 = Math.max(T, Math.min((MH - 1) * T, z1)); p.leap = { x0: p.x, z0: p.z, x1, z1, t: 0, T: 0.6 }; }
    else if (S.kind === 'beam') this.shots.push({ id: uid++, owner: p.id, team: p.team, x: p.x, z: p.z, vx: Math.sin(a) * 34, vz: Math.cos(a) * 34, left: S.range, dmg: S.dmg, heal: 0, size: 0.5, hero: p.hero, pierce: true, hit: [] });
    else if (S.kind === 'spin') { p.spinT = S.time; p.spinTick = 0; }
    else if (S.kind === 'bigbomb') { const L = Math.min(S.range, Math.max(2, d ?? S.range)); this.lobs.push({ owner: p.id, team: p.team, x0: p.x, z0: p.z, x1: p.x + Math.sin(a) * L, z1: p.z + Math.cos(a) * L, t: 0, T: 1.0, dmg: S.dmg, r: S.radius, big: true }); }
    else if (S.kind === 'healzone') { const L = Math.min(7, Math.max(0, d ?? 4)); this.zones.push({ team: p.team, owner: p.id, x: p.x + Math.sin(a) * L, z: p.z + Math.cos(a) * L, r: S.radius, t: S.time, heal: S.heal, tick: 0 }); }
    return true;
  }
  stepShots(dt) {
    for (const s of this.shots) {
      const step = Math.hypot(s.vx, s.vz) * dt;
      const n = Math.ceil(step / 0.3);
      for (let i = 0; i < n && s.left > 0; i++) {
        s.x += s.vx * dt / n; s.z += s.vz * dt / n; s.left -= step / n;
        if (!s.pierce && solid(tileAt(s.x, s.z))) { s.left = 0; this.fx.push({ t: 'spark', x: s.x, z: s.z }); break; }
        for (const e of this.players) {
          if (e.dead || e.id === s.owner || (s.pierce && s.hit.includes(e.id))) continue;
          if (Math.hypot(e.x - s.x, e.z - s.z) > R + s.size) continue;
          const own = this.players.find((q) => q.id === s.owner);
          if (e.team === s.team) { if (s.heal && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + s.heal); this.fx.push({ t: 'num', x: e.x, z: e.z, n: s.heal, heal: true }); if (own) own.superCh = Math.min(1, own.superCh + s.heal / HEROES[own.hero].sup.charge); s.left = 0; break; } continue; }
          // 산탄: 가까울수록 강함
          let dmg = s.dmg;
          if (s.hero === 'punk') dmg = Math.round(dmg * (0.7 + 0.6 * Math.max(0, s.left / 6.2)));
          this.hurt(e, dmg, own); this.fx.push({ t: 'hit', x: s.x, z: s.z });
          if (s.pierce) s.hit.push(e.id); else { s.left = 0; break; }
        }
      }
    }
    this.shots = this.shots.filter((s) => s.left > 0);
  }
  stepLobs(dt) {
    for (const L of this.lobs) { L.t += dt; if (L.t >= L.T) { const own = this.players.find((q) => q.id === L.owner); this.blast(L.x1, L.z1, L.r, L.dmg, own, L.team); } }
    this.lobs = this.lobs.filter((L) => L.t < L.T);
  }
  blast(x, z, r, dmg, own, team) {
    this.fx.push({ t: 'boom', x, z, r });
    team = team || (own && own.team);
    for (const e of this.players) if (!e.dead && e.team !== team && Math.hypot(e.x - x, e.z - z) < r + R) this.hurt(e, dmg, own);
  }
  stepZones(dt) {
    for (const zn of this.zones) {
      zn.t -= dt; zn.tick -= dt;
      if (zn.tick <= 0) { zn.tick = 0.5; for (const e of this.players) if (!e.dead && e.team === zn.team && Math.hypot(e.x - zn.x, e.z - zn.z) < zn.r && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + zn.heal * 0.5); this.fx.push({ t: 'num', x: e.x, z: e.z, n: Math.round(zn.heal * 0.5), heal: true }); } }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }
  hurt(e, dmg, by) {
    if (e.dead) return;
    dmg = Math.round(dmg);
    e.hp -= dmg; e.calmT = 0; e.revealT = Math.max(e.revealT, 0.6);
    this.fx.push({ t: 'num', x: e.x, z: e.z, n: dmg });
    if (by) { by.superCh = Math.min(1, by.superCh + dmg / HEROES[by.hero].sup.charge); by.dmgDone += dmg; }
    if (e.isBot) e.ai.hurtBy = by ? by.id : null;
    if (e.hp <= 0) this.knockout(e, by);
  }
  knockout(e, by) {
    e.dead = true; e.hp = 0; e.respawnT = this.mode === 'ko' ? 5 : 3; e.deaths++; e.leap = null; e.dashT = 0; e.spinT = 0;
    if (by) { by.kos++; if (this.mode === 'ko') this.score[by.team]++; }
    // 젬 떨어뜨림
    for (let i = 0; i < e.gems; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3; this.gems.push({ id: uid++, x: e.x, z: e.z, vx: Math.sin(a) * s, vz: Math.cos(a) * s, cool: 0.6, taken: false }); }
    e.gems = 0;
    this.fx.push({ t: 'ko', id: e.id, by: by ? by.id : null, x: e.x, z: e.z });
  }
  stepGems(dt) {
    this.gemT -= dt;
    const onField = this.gems.filter((g) => !g.taken).length;
    if (this.gemT <= 0 && !this.count) { this.gemT = 7; if (onField < 20) { const a = Math.random() * Math.PI * 2; this.gems.push({ id: uid++, x: GEM_SPOT.x, z: GEM_SPOT.z, vx: Math.sin(a) * 3, vz: Math.cos(a) * 3, cool: 0.3, taken: false }); this.fx.push({ t: 'mine', x: GEM_SPOT.x, z: GEM_SPOT.z }); } }
    for (const g of this.gems) {
      if (g.taken) continue;
      g.cool -= dt;
      if (g.vx || g.vz) { const nx = g.x + g.vx * dt, nz = g.z + g.vz * dt; if (!blocksMove(tileAt(nx, nz))) { g.x = nx; g.z = nz; } else { g.vx = g.vz = 0; } g.vx *= Math.pow(0.05, dt); g.vz *= Math.pow(0.05, dt); if (Math.hypot(g.vx, g.vz) < 0.1) g.vx = g.vz = 0; }
    }
    this.gems = this.gems.filter((g) => !g.taken);
    this.score.red = this.players.filter((p) => p.team === 'red').reduce((s, p) => s + p.gems, 0);
    this.score.blue = this.players.filter((p) => p.team === 'blue').reduce((s, p) => s + p.gems, 0);
  }
  checkEnd(dt) {
    const S = this.score;
    if (this.mode === 'gem') {
      const lead = S.red >= 10 && S.red > S.blue ? 'red' : S.blue >= 10 && S.blue > S.red ? 'blue' : null;
      if (lead) { if (!this.count || this.count.team !== lead) this.count = { team: lead, t: 15 }; this.count.t -= dt; if (this.count.t <= 0) return this.finish(lead); }
      else this.count = null;
      if (this.timer <= 0 && !this.count) return this.finish(S.red > S.blue ? 'red' : S.blue > S.red ? 'blue' : 'draw');
      if (this.timer < 0) this.timer = 0;
    } else {
      if (S.red >= 10) return this.finish('red'); if (S.blue >= 10) return this.finish('blue');
      if (this.timer <= 0) return this.finish(S.red > S.blue ? 'red' : S.blue > S.red ? 'blue' : 'draw');
    }
  }
  finish(w) {
    const mvp = this.players.slice().sort((a, b) => (b.kos * 1000 + b.dmgDone / 10 + b.gems * 300) - (a.kos * 1000 + a.dmgDone / 10 + a.gems * 300))[0];
    this.over = { win: w, mvp: mvp ? mvp.id : null };
    this.fx.push({ t: 'over', win: w });
  }
  // 적이 덤불 속에 숨었는지
  hidden(p, viewerTeam) {
    if (p.team === viewerTeam || p.dead) return false;
    if (tileAt(p.x, p.z) !== 'b' || p.revealT > 0) return false;
    for (const q of this.players) if (q.team === viewerTeam && !q.dead && dist(q, p) < 2.6) return false;
    return true;
  }
  los(a, b) { const d = dist(a, b), n = Math.ceil(d / 0.4); for (let i = 1; i < n; i++) { const t = i / n; if (solid(tileAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))) return false; } return true; }

  // ---------- 봇 ----------
  botThink(p, dt) {
    const ai = p.ai, H = HEROES[p.hero], A = H.atk;
    const DIFF = { easy: { err: 0.32, rate: 0.45, react: 0.6 }, normal: { err: 0.16, rate: 0.75, react: 0.35 }, hard: { err: 0.07, rate: 1, react: 0.18 } }[this.diff];
    ai.t = (ai.t || 0) - dt;
    const out = ai.out || (ai.out = { mx: 0, mz: 0 });
    out.fire = false; out.sup = false;
    if (ai.t > 0) return out;
    ai.t = 0.12 + Math.random() * 0.06;
    // 보이는 적
    let tgt = null, td = 1e9;
    for (const e of this.players) { if (e.team === p.team || e.dead || this.hidden(e, p.team)) continue; const d = dist(e, p); if (d < td && d < 15) { td = d; tgt = e; } }
    const hurtBy = ai.hurtBy && this.players.find((q) => q.id === ai.hurtBy && !q.dead); if (!tgt && hurtBy) { tgt = hurtBy; td = dist(hurtBy, p); }
    const range = A.range || 8;
    const low = p.hp < p.maxHp * 0.33;
    const home = SPAWN[p.team][0];
    let goal = null, keep = 0;
    if (low && tgt && td < 8) goal = home; // 도망
    else if (this.mode === 'gem' && (p.gems >= 4 || (this.count && this.count.team === p.team && p.gems > 0)) && !(tgt && td < 4)) goal = { x: home.x, z: home.z + (p.team === 'red' ? 6 : -6) };
    else if (tgt) { goal = tgt; keep = Math.max(1.2, range * (A.kind === 'melee' ? 0.4 : 0.7)); }
    else if (this.mode === 'gem') { let g = null, gd = 1e9; for (const q of this.gems) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < gd) { gd = d; g = q; } } goal = g || { x: GEM_SPOT.x + (p.team === 'red' ? -3 : 3), z: GEM_SPOT.z + (p.team === 'red' ? -4 : 4) }; }
    else { const e = this.players.find((q) => q.team !== p.team && !q.dead); goal = e || GEM_SPOT; keep = range * 0.7; }
    // 싸우기
    if (tgt && td < range * 1.02 && (A.kind === 'lob' || this.los(p, tgt))) {
      ai.seen = (ai.seen || 0) + 0.15;
      const lead = td / (A.speed || 18);
      const px = tgt.x + tgt.vx * lead * 0.8, pz = tgt.z + tgt.vz * lead * 0.8;
      const a = ang(px - p.x, pz - p.z) + (Math.random() - 0.5) * DIFF.err * 2;
      out.aim = a; out.aimD = Math.hypot(px - p.x, pz - p.z); out.aiming = true;
      if (ai.seen > DIFF.react && p.ammo >= 1 && Math.random() < DIFF.rate) out.fire = true;
      if (p.superCh >= 1 && td < (H.sup.range || H.sup.radius * 1.5 || 6)) out.sup = true;
      if (H.sup.kind === 'healzone' && p.superCh >= 1) { out.sup = true; out.aimD = 0; }
    } else { ai.seen = 0; out.aiming = false; }
    // 아군 치유 (솜)
    if (p.hero === 'som' && !out.fire) { const m = this.players.find((q) => q.team === p.team && q !== p && !q.dead && q.hp < q.maxHp * 0.7 && dist(q, p) < range && this.los(p, q)); if (m && p.ammo >= 2) { out.aim = ang(m.x - p.x, m.z - p.z); out.aiming = true; out.fire = true; } }
    // 움직이기 (길 찾기)
    if (goal) {
      const d = Math.hypot(goal.x - p.x, goal.z - p.z);
      if (keep && d < keep) { // 거리 유지 + 옆으로
        ai.side = ai.side || 1; if (Math.random() < 0.08) ai.side *= -1;
        const a = ang(goal.x - p.x, goal.z - p.z) + Math.PI / 2 * ai.side;
        out.mx = Math.sin(a) * 0.8 - (d < keep * 0.6 ? Math.sin(a - Math.PI / 2 * ai.side) * 0.6 : 0); out.mz = Math.cos(a) * 0.8 - (d < keep * 0.6 ? Math.cos(a - Math.PI / 2 * ai.side) * 0.6 : 0);
      } else {
        if (!ai.path || (ai.pathT = (ai.pathT || 0) - 0.15) <= 0 || ai.goalKey !== Math.round(goal.x) + ',' + Math.round(goal.z)) { ai.path = findPath(p.x, p.z, goal.x, goal.z); ai.pathT = 0.8; ai.goalKey = Math.round(goal.x) + ',' + Math.round(goal.z); ai.pi = 0; }
        const P = ai.path;
        while (P && ai.pi < P.length - 1 && Math.hypot(P[ai.pi].x - p.x, P[ai.pi].z - p.z) < 0.6) ai.pi++;
        const w = P && P[ai.pi] ? P[ai.pi] : goal;
        const dx = w.x - p.x, dz = w.z - p.z, l = Math.hypot(dx, dz) || 1;
        out.mx = dx / l; out.mz = dz / l;
      }
    } else { out.mx = out.mz = 0; }
    return out;
  }
  // 네트워크용 상태 (방장 → 손님)
  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      p: this.players.map((p) => [p.id, p.name, p.team, p.hero, r1(p.x), r1(p.z), Math.round(p.face * 100) / 100, Math.round(p.hp), p.dead ? 1 : 0, Math.round(p.ammo * 10) / 10, Math.round(p.superCh * 100) / 100, p.gems, p.kos, r1(p.y || 0), p.spinT > 0 ? 1 : 0, p.revealT > 0 ? 1 : 0, p.isBot ? 1 : 0, p.deaths, (p.dashT > 0 || p.leap) ? 1 : 0]),
      s: this.shots.slice(0, 30).map((s) => [s.id, r1(s.x), r1(s.z), r1(s.vx), r1(s.vz), s.hero, s.size > 0.4 ? 1 : 0]),
      l: this.lobs.map((L) => [r1(L.x0), r1(L.z0), r1(L.x1), r1(L.z1), Math.round(L.t / L.T * 100) / 100, L.big ? 1 : 0, L.T]),
      z: this.zones.map((z) => [r1(z.x), r1(z.z), z.r, r1(z.t), z.team]),
      g: this.mode === 'gem' ? this.gems.map((g) => [r1(g.x), r1(g.z)]) : [],
      m: this.mode, sc: [this.score.red, this.score.blue], tm: Math.round(this.timer), ct: this.count ? [this.count.team, Math.ceil(this.count.t)] : null, ov: this.over ? [this.over.win, this.over.mvp] : null,
    };
  }
}

// ---------- 길 찾기 (A*) ----------
export function findPath(x0, z0, x1, z1) {
  const sx = Math.floor(x0 / T), sz = Math.floor(z0 / T), gx = Math.max(0, Math.min(MW - 1, Math.floor(x1 / T))), gz = Math.max(0, Math.min(MH - 1, Math.floor(z1 / T)));
  const walk = (x, z) => !blocksMove(tile(x, z));
  const N = MW * MH, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const id = (x, z) => z * MW + x, s = id(sx, sz), goal = id(gx, gz);
  g[s] = 0; const open = [s];
  while (open.length) {
    let bi = 0, bf = 1e9; for (let i = 0; i < open.length; i++) { const c = open[i], f = g[c] + Math.hypot(c % MW - gx, Math.floor(c / MW) - gz); if (f < bf) { bf = f; bi = i; } }
    const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (c === goal) break; if (closed[c]) continue; closed[c] = 1;
    const cx = c % MW, cz = Math.floor(c / MW);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz;
      if (!walk(nx, nz) || (dx && dz && (!walk(cx + dx, cz) || !walk(cx, cz + dz)))) continue;
      const n = id(nx, nz), ng = g[c] + (dx && dz ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; from[n] = c; open.push(n); }
    }
  }
  if (from[goal] < 0) return [{ x: x1, z: z1 }];
  const out = []; for (let c = goal; c !== s && c >= 0; c = from[c]) out.push({ x: (c % MW + 0.5) * T, z: (Math.floor(c / MW) + 0.5) * T });
  out.reverse(); out.push({ x: x1, z: z1 });
  return out;
}
