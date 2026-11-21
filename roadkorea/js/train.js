import { W, railPoint, railDist } from './world.js';
import { buildTrain } from './models.js';
import { clamp } from './util.js';

// 광주선 열차: 광주송정역 ↔ 광주역 (실제 철길 모양을 따라 달리며 건널목 차단기를 내림)
export class Train {
  constructor(scene, audio) {
    this.obj = buildTrain(5);
    scene.add(this.obj.group);
    this.len = this.obj.length;
    const L = W.rail.len;
    this.sA = clamp(W.station ? W.station.s : 30, this.len / 2 + 5, L - this.len / 2 - 5);
    this.sB = clamp(W.station2 ? W.station2.s : L - 30, this.len / 2 + 5, L - this.len / 2 - 5);
    if (this.sB < this.sA) [this.sA, this.sB] = [this.sB, this.sA];
    this.s = this.sA; this.v = 0; this.dir = 1; this.state = 'station'; this.t = 10;
    this.audio = audio; this.horned = new Set(); this.blink = 0;
  }
  get lo() { return this.s - this.len / 2; }
  get hi() { return this.s + this.len / 2; }
  points() { const out = []; for (let s = this.lo; s <= this.hi; s += this.len / 6) out.push(railPoint(s)); return out; }
  update(dt, player) {
    const VMAX = 22, A = 0.75;
    this.t += dt;
    if (this.state === 'station') {
      this.v = 0;
      if (this.t > 28) { this.state = 'run'; this.t = 0; this.horned.clear(); this.horn(player, 0.6); }
    } else {
      const target = this.dir > 0 ? this.sB : this.sA;
      const d = (target - this.s) * this.dir;
      this.v = clamp(Math.min(VMAX, this.v + A * dt, Math.sqrt(2 * 0.55 * Math.max(d, 0)) + 0.3), 0, VMAX);
      this.s += this.v * dt * this.dir;
      if (d < 0.3) { this.s = target; this.state = 'station'; this.t = 0; this.dir = -this.dir; }
    }
    // 객차마다 철길 위에
    const CL = this.obj.CL, gap = this.obj.gap;
    this.obj.cars.forEach((cg, i) => {
      const off = this.len / 2 - CL / 2 - i * (CL + gap);
      const sc = this.s + off * this.dir;
      const a = railPoint(sc - CL * 0.4), b = railPoint(sc + CL * 0.4);
      cg.position.set((a.x + b.x) / 2, 0.45, (a.z + b.z) / 2);
      cg.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + (this.dir > 0 ? 0 : Math.PI);
    });
    this.obj.group.visible = true;
    // 건널목
    this.blink += dt;
    const on = Math.floor(this.blink * 2.4) % 2 === 0;
    for (const c of W.crossings) {
      let down = false;
      if (this.state === 'run') down = this.dir > 0 ? c.s <= this.hi + 25 && c.s >= this.lo - 190 : c.s >= this.lo - 25 && c.s <= this.hi + 190;
      if (this.state === 'station' && this.t > 24) down = Math.abs(c.s - this.s) < 220 && (this.dir > 0 ? c.s > this.s : c.s < this.s);
      W.crossDown[c.id] = down;
      c.t = clamp(c.t + (down ? dt * 0.6 : -dt * 0.5), 0, 1);
      for (const p of c.arms) p.rotation.z = p.userData.down * c.t;
      c.lamps.forEach((m, i) => (m.emissiveIntensity = down ? ((i % 2 === 0) === on ? 3 : 0) : 0));
      for (const col of c.colliders) col.off = c.t < 0.7;
      if (down && !this.horned.has(c.id) && Math.abs(c.s - this.s) < 260) { this.horned.add(c.id); this.horn(player, 1); }
    }
    if (player) {
      const rd = railDist(player.x, player.z);
      const along = clamp(rd.s, this.lo, this.hi);
      const q = railPoint(along);
      this.near = Math.max(0, 1 - Math.hypot(player.x - q.x, player.z - q.z) / 250);
    } else this.near = 0;
  }
  horn(player, vol) {
    if (!player || !this.audio) return;
    const q = railPoint(this.s);
    const d = Math.hypot(player.x - q.x, player.z - q.z);
    if (d < 600) this.audio.trainHorn(vol * Math.max(0.15, 1 - d / 600));
  }
  // 플레이어 차량과의 충돌
  collide(sim) {
    const rd = railDist(sim.x, sim.z);
    if (rd.d > 8 || rd.s < this.lo - 10 || rd.s > this.hi + 10 || sim.level !== 'surface') return 0;
    let imp = 0;
    for (let s = this.lo + 1.6; s < this.hi; s += 2.4) { const q = railPoint(s); imp = Math.max(imp, sim.pushFrom(q.x, q.z, 1.6)); }
    return imp;
  }
  occupies(s) { return s > this.lo - 2 && s < this.hi + 2; }
}
