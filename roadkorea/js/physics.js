import { hasOpt } from './state.js';
import { clamp, lerp } from './util.js';
import { queryColliders, blocked, obNearest } from './world.js';

const G = 9.81;
const _cands = [];

// 플레이어 차량 주행 물리 (자전거 모델 + 미끄러짐)
export class VehicleSim {
  constructor(spec, own = {}) {
    this.spec = spec;
    const tune = own.tune || { engine: 0, brake: 0, handling: 0 };
    const opt = (id) => spec.type !== 'bus' && hasOpt(own, id);
    const perf = opt('perf') ? 1.08 : 1, bigWheel = opt('wheel19') ? 1.02 : 1;
    const isBus = spec.type === 'bus';
    this.isBus = isBus;
    this.mass = spec.mass;
    this.len = spec.len; this.wid = spec.wid;
    this.wb = isBus ? spec.wb : spec.len * ({ hatch: 0.67, boxy: 0.7, cuv: 0.64, coupe: 0.6, suv: 0.6, suv_l: 0.6, mpv: 0.6, gwagon: 0.59 }[spec.body] || 0.585);
    // 버스: 시원하게 달리도록 힘 · 최고속도를 높임 (시내버스도 최고 약 120km/h)
    this.power = (spec.mass * 385.8 / spec.acc) * 1.18 * (1 + 0.08 * tune.engine) * (isBus ? 1.35 : 1) * perf;
    this.vmax = ((isBus ? Math.min(Math.max(spec.vmax, 100) * 1.2, 130) : spec.vmax) / 3.6) * (1 + 0.03 * tune.engine);
    this.roll = spec.mass * G * 0.012;
    this.drag = Math.max(0.15, (this.power / this.vmax - this.roll) / (this.vmax * this.vmax));
    this.brakeDecel = (isBus ? 5.0 : 8.6) * (1 + 0.1 * tune.brake) * (perf > 1 ? 1.1 : 1);
    this.maxSteer = Math.asin(clamp(this.wb / spec.turnR, 0.05, 0.95));
    this.steerRate = isBus ? 0.75 : 1.7;
    this.v0 = isBus ? 11 : 17;
    this.gripBase = (isBus ? 0.78 : 1.0) * (1 + 0.06 * tune.handling) * bigWheel;
    this.ev = !!spec.ev;
    this.gears = isBus ? 6 : 7;
    this.redline = isBus ? 2600 : spec.hp > 400 ? 7200 : 6500;
    this.reset(0, 0, 0);
  }
  reset(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0; this.vl = 0; this.vs = 0;
    this.steer = 0; this.yawRate = 0;
    this.gear = 'D'; this.gearN = 1; this.rpm = 800;
    this.pitch = 0; this.rollA = 0; this.accel = 0;
    this.reverseHold = 0; this.slip = 0; this.throttle = 0; this.brakeIn = 0;
    this.odo = 0; this.lastImpact = 0; this.level = 'surface';
  }
  hits(k) {
    if (k.off) return false;
    if (k.busOnly && !this.isBus) return false;
    if (k.y !== undefined && this.py !== undefined && Math.abs(k.y - this.py) > 3) return false; // 다른 높이의 고가 방호벽
    const lv = k.lvl || 'surface';
    return (lv === 'both' && this.level !== 'hwy') || lv === this.level;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get kmh() { return Math.abs(this.vl) * 3.6; }

  step(dt, inp, env) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const fx = s, fz = c, rx = -c, rz = s;
    let vl = this.vx * fx + this.vz * fz;
    let vs = this.vx * rx + this.vz * rz;
    const grip = this.gripBase * env.grip;
    const thr = env.noFuel || inp.engineOff ? 0 : inp.throttle, brk = inp.brake;
    let drive = 0, brake = 0;

    const gm = inp.gearMode || 'auto';
    if (gm !== 'auto') {
      // 수동 기어 레버 (P·R·N·D)
      this.gear = gm === 'R' ? 'R' : 'D';
      if (gm === 'D') { drive = thr; if (brk > 0) brake = brk; }
      else if (gm === 'R') { if (thr > 0) { if (vl > 0.3) brake = thr; else drive = -thr; } if (brk > 0) brake = brk; }
      else { if (brk > 0) brake = brk; if (gm === 'P') brake = 1; }
      this.reverseHold = 0;
    } else if (this.gear === 'R') {
      if (thr > 0) { if (vl < -0.3) brake = thr; else { this.gear = 'D'; } }
      if (brk > 0) drive = -brk;
    } else {
      if (brk > 0) {
        if (vl > 0.4) brake = brk;
        else { this.reverseHold += dt; if (this.reverseHold > 0.35) this.gear = 'R'; else brake = brk; }
      } else this.reverseHold = 0;
      if (thr > 0 && this.gear !== 'R') { this.gear = 'D'; drive = thr; }
    }
    if (env.noFuel || inp.engineOff) drive = 0;

    let F = 0;
    const traction = this.mass * G * grip * 0.85;
    if (drive > 0) {
      F = drive * Math.min(traction, this.power / Math.max(Math.abs(vl), 2.2));
      if (vl >= this.vmax) F = 0;
    } else if (drive < 0) {
      F = drive * Math.min(traction, this.mass * 3.2);
      if (vl < -(this.isBus ? 4 : 6)) F = 0;
    }
    let a = F / this.mass;
    const sgn = Math.sign(vl);
    a -= sgn * (this.roll + this.drag * vl * vl) / this.mass;
    if (drive === 0 && Math.abs(vl) > 0.1) a -= sgn * (this.isBus ? 0.6 : 0.35) * (this.ev ? 1.4 : 1); // 엔진/회생 제동
    let decel = brake * this.brakeDecel * Math.min(1, grip + 0.2);
    if (inp.handbrake) decel += 5.5 * grip;
    if (decel > 0) {
      const dv = decel * dt;
      if (Math.abs(vl) <= dv && drive === 0) { vl = 0; a = 0; }
      else a -= sgn * decel;
    }
    const prevVl = vl;
    vl += a * dt;
    if (drive === 0 && prevVl !== 0 && Math.sign(vl) !== Math.sign(prevVl)) vl = 0;
    if (inp.handbrake && Math.abs(vl) < 0.5 && drive === 0) vl = 0;
    this.accel = lerp(this.accel, (vl - prevVl) / Math.max(dt, 1e-4), 0.2);

    // 조향
    const spd = Math.abs(vl);
    const lim = this.maxSteer / (1 + (spd / this.v0) ** 2);
    const target = clamp(inp.steer, -1, 1) * lim;
    const rate = (Math.abs(target) < Math.abs(this.steer) ? 1.6 : 1) * this.steerRate;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    let yaw = (vl * Math.tan(this.steer)) / this.wb;
    const maxLat = grip * G * (this.isBus ? 0.6 : 0.95);
    if (spd > 1) yaw = clamp(yaw, -maxLat / spd, maxLat / spd);
    if (inp.handbrake && spd > 3) yaw *= 1.45;
    this.yawRate = yaw;
    this.heading += yaw * dt;

    // 측면 미끄러짐 감쇠
    const lat = inp.handbrake ? 1.4 : 9 * grip;
    vs *= Math.exp(-lat * dt);
    this.slip = Math.abs(vs);
    this.vx = fx * vl + rx * vs;
    this.vz = fz * vl + rz * vs;
    this.vl = vl; this.vs = vs;

    const ox = this.x, oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.odo += Math.hypot(this.x - ox, this.z - oz);

    // 기어 / rpm (표시용)
    if (this.ev) { this.gearN = 1; this.rpm = 0; }
    else {
      const top = this.vmax;
      const ratios = [0.16, 0.3, 0.45, 0.6, 0.75, 0.88, 1.0].slice(-this.gears);
      let g = 0;
      while (g < ratios.length - 1 && spd > ratios[g] * top * 0.92) g++;
      this.gearN = g + 1;
      const lo = g ? ratios[g - 1] * top * 0.92 : 0, hi = ratios[g] * top;
      const t = clamp((spd - lo * 0.75) / Math.max(1, hi - lo * 0.75), 0, 1);
      const idle = this.isBus ? 600 : 800;
      const target = idle + t * (this.redline - idle) * (0.55 + 0.45 * thr) + thr * 300;
      this.rpm = lerp(this.rpm, target, 0.15);
    }
    this.throttle = thr; this.brakeIn = Math.max(brk * (this.gear === 'R' ? 0 : 1), brake);

    // 자세 (가감속 피칭 / 코너 롤)
    const soft = this.isBus ? 1.6 : 1;
    this.pitch = lerp(this.pitch, clamp(-this.accel * 0.006 * soft, -0.05, 0.05), 0.1);
    this.rollA = lerp(this.rollA, clamp(yaw * vl * 0.006 * soft, -0.06, 0.06), 0.1);

    return this.collide(ox, oz);
  }

  // 원 여러 개로 차체를 근사해서 충돌 처리
  collide(ox, oz) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const r = this.wid / 2;
    const n = Math.max(2, Math.round(this.len / this.wid));
    let impact = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < n; i++) {
        const off = -this.len / 2 + r + ((this.len - 2 * r) * i) / (n - 1);
        const cx = this.x + s * off, cz = this.z + c * off;
        queryColliders(cx, cz, r + 1, _cands);
        for (const k of _cands) {
          if (!this.hits(k)) continue;
          let nx, nz, d;
          if (k.t === 2) {
            const q = obNearest(k, cx, cz);
            if (q.inside) {
              // 안쪽: 가장 가까운 면으로 밀어냄
              const du = k.hz - Math.abs(q.u), dv = k.hx - Math.abs(q.v);
              if (du < dv) { nx = Math.sign(q.u || 1) * k.sn; nz = Math.sign(q.u || 1) * k.cs; d = -du; }
              else { nx = Math.sign(q.v || 1) * k.cs; nz = -Math.sign(q.v || 1) * k.sn; d = -dv; }
              const pen = r - d; this.x += nx * pen; this.z += nz * pen; impact = Math.max(impact, this.bounce(nx, nz));
              continue;
            }
            nx = cx - q.x; nz = cz - q.z; d = Math.hypot(nx, nz);
            if (d === 0) continue;
          } else if (k.t === 0) {
            const px = clamp(cx, k.x0, k.x1), pz = clamp(cz, k.z0, k.z1);
            nx = cx - px; nz = cz - pz; d = Math.hypot(nx, nz);
            if (d === 0) { // 중심이 박스 안
              const dl = cx - k.x0, dr = k.x1 - cx, db = cz - k.z0, dt2 = k.z1 - cz;
              const m = Math.min(dl, dr, db, dt2);
              if (m === dl) { nx = -1; nz = 0; d = -dl; } else if (m === dr) { nx = 1; nz = 0; d = -dr; } else if (m === db) { nx = 0; nz = -1; d = -db; } else { nx = 0; nz = 1; d = -dt2; }
              const pen = r - d; this.x += nx * pen; this.z += nz * pen; impact = Math.max(impact, this.bounce(nx, nz));
              continue;
            }
          } else {
            nx = cx - k.x; nz = cz - k.z; d = Math.hypot(nx, nz);
            if (d === 0) { nx = 1; nz = 0; d = 1e-3; }
            d -= k.r;
            const dd = Math.hypot(nx, nz); nx /= dd; nz /= dd;
            if (d < r) { const pen = r - d; this.x += nx * pen; this.z += nz * pen; impact = Math.max(impact, this.bounce(nx, nz)); }
            continue;
          }
          if (d < r) { nx /= d; nz /= d; const pen = r - d; this.x += nx * pen; this.z += nz * pen; impact = Math.max(impact, this.bounce(nx, nz)); }
        }
      }
    }
    // 지형/강/바다
    for (let i = 0; i < n; i++) {
      const off = -this.len / 2 + r + ((this.len - 2 * r) * i) / (n - 1);
      if (this.level === 'surface' && blocked(this.x + s * off, this.z + c * off)) {
        const sp = this.speed;
        this.x = ox; this.z = oz;
        this.vx *= -0.2; this.vz *= -0.2;
        impact = Math.max(impact, sp);
        break;
      }
    }
    return impact;
  }
  bounce(nx, nz) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
      this.vx *= 0.85; this.vz *= 0.85;
      return -vn;
    }
    return 0;
  }
  // 다른 차와의 충돌 (상대는 움직이지 않는다고 가정)
  pushFrom(px, pz, pr) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const r = this.wid / 2;
    const n = Math.max(2, Math.round(this.len / this.wid));
    let impact = 0;
    for (let i = 0; i < n; i++) {
      const off = -this.len / 2 + r + ((this.len - 2 * r) * i) / (n - 1);
      const cx = this.x + s * off, cz = this.z + c * off;
      let nx = cx - px, nz = cz - pz;
      const d = Math.hypot(nx, nz);
      if (d < r + pr && d > 1e-4) {
        nx /= d; nz /= d;
        const pen = r + pr - d;
        this.x += nx * pen; this.z += nz * pen;
        impact = Math.max(impact, this.bounce(nx, nz));
      }
    }
    return impact;
  }
}
