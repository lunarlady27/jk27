// ===================== 터보 서킷 — 경주 규칙 · 카트 물리 · 봇 · 아이템 =====================
import { ROAD, WALL, nearest } from './track.js';

export const KARTS = [
  { id: 'red', name: '번개호', color: 0xff4b4b, helm: 0xffffff, spd: 3, acc: 2, hdl: 2, desc: '균형 잡힌 기본기' },
  { id: 'blue', name: '파도호', color: 0x3ea0ff, helm: 0xffe14d, spd: 2, acc: 3, hdl: 3, desc: '부드러운 핸들링' },
  { id: 'green', name: '새싹호', color: 0x4ed36a, helm: 0xff7ab0, spd: 1, acc: 4, hdl: 4, desc: '초보 추천 · 빠른 가속' },
  { id: 'yellow', name: '황금호', color: 0xffc83a, helm: 0x2a2a2a, spd: 4, acc: 1, hdl: 2, desc: '최고 속도 · 무거운 핸들' },
  { id: 'purple', name: '유령호', color: 0xb06bff, helm: 0x36e0ff, spd: 3, acc: 3, hdl: 1, desc: '빠르지만 까다로움' },
  { id: 'orange', name: '노을호', color: 0xff8a2a, helm: 0x3a3a90, spd: 2, acc: 2, hdl: 4, desc: '드리프트 장인' },
];
export const BOT_NAMES = ['하늘', '바다', '민트', '도토리', '구름', '별빛', '콩떡', '모래', '솜사탕', '파랑'];
export const ITEMS = {
  boost: { name: '부스터', icon: '🚀' },
  triple: { name: '트리플 부스터', icon: '⚡' },
  oil: { name: '기름 웅덩이', icon: '🛢️' },
  shield: { name: '방패', icon: '🛡️' },
  missile: { name: '유도탄', icon: '🎯' },
};
export const DIFFS = { easy: { name: '쉬움', mul: 0.84 }, normal: { name: '보통', mul: 0.93 }, hard: { name: '어려움', mul: 1.0 } };
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 0, 0];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

function stats(K) { return { vmax: 33 + K.spd * 1.6, acc: 13 + K.acc * 3.2, turn: 1.45 + K.hdl * 0.17 }; }

export class Kart {
  constructor(id, kartDef, name, isBot) {
    this.id = id; this.K = kartDef; this.st = stats(kartDef); this.name = name; this.isBot = isBot;
    this.x = 0; this.z = 0; this.h = 0; this.v = 0; this.lat = 0;
    this.drift = 0; this.charge = 0; this.boostT = 0; this.boostKind = 0; this.spinT = 0; this.spinA = 0; this.shieldT = 0; this.hop = 0;
    this.item = null; this.uses = 0; this.itemDelay = 0; this.rollT = 0;
    this.idx = 0; this.prog = 0; this.maxLap = 0; this.lapStart = 0; this.bestLap = Infinity; this.laps = [];
    this.finished = false; this.finishTime = 0; this.place = 1; this.wrongT = 0; this.off = false; this.wallHit = 0;
    this.laneOff = 0; this.laneTo = 0; this.laneT = 0; this.vmul = 1; this.skill = 1;
    this.inp = { thr: 0, brk: 0, steer: 0, drift: 0, use: 0 }; this.prevDrift = 0; this.prevUse = 0;
  }
  get lap() { return Math.max(1, Math.floor(this.prog / this._N) + 1); }
}

export class Race {
  constructor(tr, o) {
    this.tr = tr; this.o = o; this.laps = o.laps; this.t = -3.6; this.state = 'count'; this.events = []; this.endT = 0;
    this.hazards = []; this.proj = []; this.boxes = []; this.firstThr = null;
    const N = tr.N, nb = o.timeAttack ? 0 : o.bots;
    const total = nb + 1, pSlot = Math.min(total - 1, o.timeAttack ? 0 : Math.min(5, nb));
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const pool = KARTS.filter((k) => k.id !== o.kart.id);
    this.karts = [];
    let bi = 0;
    for (let s = 0; s < total; s++) {
      const isP = s === pSlot;
      const k = isP ? new Kart(0, o.kart, o.name, false) : new Kart(s + 1, pool[bi % pool.length], names[bi % names.length], true);
      if (!isP) { bi++; k.skill = 1 + (Math.random() * 0.06 - 0.03) - (s / total) * 0.02; }
      k._N = N;
      const row = Math.floor(s / 2), side = s % 2 ? 1 : -1;
      const i = (N - 3 - row * 4) % N;
      k.idx = i; k.prog = i - N; k.lapStart = 0;
      k.x = tr.P[i * 2] + tr.Nn[i * 2] * side * 3.6; k.z = tr.P[i * 2 + 1] + tr.Nn[i * 2 + 1] * side * 3.6;
      k.h = Math.atan2(tr.T[i * 2], tr.T[i * 2 + 1]);
      k.laneOff = k.laneTo = side * 3.6;
      this.karts.push(k);
      if (isP) this.player = k;
    }
    if (!o.timeAttack) for (const f of tr.def.items) {
      const i = Math.floor(f * N);
      for (const l of [-6, -2, 2, 6]) this.boxes.push({ i, x: tr.P[i * 2] + tr.Nn[i * 2] * l, z: tr.P[i * 2 + 1] + tr.Nn[i * 2 + 1] * l, t: 0 });
    }
    this.vmulBase = DIFFS[o.diff].mul;
    this.rank();
  }

  emit(type, k, extra) { this.events.push({ type, k, ...extra }); }

  step(dt) {
    const tr = this.tr, N = tr.N, P = this.player;
    if (this.state === 'count') {
      const before = this.t; this.t += dt;
      if (P.inp.thr && this.firstThr === null) this.firstThr = this.t;
      for (const s of [-3, -2, -1]) if (before < s && this.t >= s) this.emit('count', null, { n: -s });
      if (this.t >= 0) {
        this.state = 'race'; this.t = 0; this.emit('go');
        if (this.firstThr !== null && this.firstThr > -0.8 && this.firstThr <= 0.05) { P.boostT = 1.3; P.boostKind = 2; this.emit('startboost', P); }
        for (const k of this.karts) if (k.isBot && Math.random() < 0.4) { k.boostT = 0.9; k.boostKind = 1; }
      }
      return;
    }
    this.t += dt;
    for (const k of this.karts) {
      if (k.isBot || k.finished) this.ai(k, dt);
      this.physics(k, dt);
    }
    // 카트끼리 부딪힘
    const ks = this.karts;
    for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) {
      const A = ks[a], B = ks[b], dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz;
      if (d2 < 2.5 * 2.5 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (2.5 - d) / 2, nx = dx / d, nz = dz / d;
        const ma = A.shieldT > 0 ? 3 : 1, mb = B.shieldT > 0 ? 3 : 1;
        A.x -= nx * push * (mb / ma); A.z -= nz * push * (mb / ma); B.x += nx * push * (ma / mb); B.z += nz * push * (ma / mb);
        const avg = (A.v + B.v) / 2; A.v = A.v * 0.9 + avg * 0.1; B.v = B.v * 0.9 + avg * 0.1;
        if (A === P || B === P) this.emit('bump', P);
      }
    }
    // 아이템 상자
    for (const bx of this.boxes) {
      if (bx.t > 0) { bx.t -= dt; continue; }
      for (const k of ks) {
        if (k.item || k.rollT > 0) continue;
        if ((k.x - bx.x) ** 2 + (k.z - bx.z) ** 2 < 2.8 * 2.8) { bx.t = 3.5; k.rollT = k.isBot ? 0.01 : 1.1; k.pending = this.roll(k); this.emit('box', k); break; }
      }
    }
    for (const k of ks) if (k.rollT > 0) { k.rollT -= dt; if (k.rollT <= 0) { k.item = k.pending; k.uses = k.item === 'triple' ? 3 : 1; k.itemDelay = 0.8 + Math.random() * 3; this.emit('got', k); } }
    // 기름 웅덩이
    for (const hz of this.hazards) {
      hz.t -= dt; hz.safe -= dt;
      for (const k of ks) { if (hz.t <= 0 || (k === hz.owner && hz.safe > 0)) continue; if ((k.x - hz.x) ** 2 + (k.z - hz.z) ** 2 < 2.4 * 2.4) { this.hit(k, 'oil'); hz.t = 0; } }
    }
    this.hazards = this.hazards.filter((h) => h.t > 0);
    // 유도탄
    for (const m of this.proj) {
      m.t -= dt;
      if (m.target && !m.target.finished) {
        const want = Math.atan2(m.target.x - m.x, m.target.z - m.z); m.h += clamp(wrapA(want - m.h), -4 * dt, 4 * dt);
      }
      m.x += Math.sin(m.h) * m.v * dt; m.z += Math.cos(m.h) * m.v * dt;
      for (const k of ks) { if (k === m.owner && m.t > 5.4) continue; if ((k.x - m.x) ** 2 + (k.z - m.z) ** 2 < 2.4 * 2.4) { this.hit(k, 'missile'); m.t = 0; break; } }
    }
    this.proj = this.proj.filter((m) => m.t > 0);
    this.rank();
    // 끝
    if (P.finished) {
      this.endT += dt;
      if (this.endT > 7 || ks.every((k) => k.finished)) this.finish();
    }
  }

  finish() {
    if (this.state === 'done') return;
    for (const k of this.karts) if (!k.finished) {
      const remain = this.laps * this.tr.N - k.prog; const sp = Math.max(12, k.st.vmax * 0.8) / 2; k.finished = true; k.finishTime = this.t + remain / sp; k.est = true;
    }
    this.rank(); this.state = 'done'; this.emit('done');
  }

  rank() {
    const s = this.karts.slice().sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog);
    s.forEach((k, i) => { k.place = i + 1; }); this.order = s;
  }

  roll(k) {
    const n = this.karts.length; const f = n > 1 ? (k.place - 1) / (n - 1) : 0.5;
    const W = { boost: 3 + 2 * f, triple: 4 * f * f, oil: 3.5 * (1 - f) + 0.3, shield: 2 * (1 - f) + 0.6, missile: k.place > 1 ? 0.6 + 3 * f : 0 };
    let sum = 0; for (const w of Object.values(W)) sum += w; let x = Math.random() * sum;
    for (const [id, w] of Object.entries(W)) { x -= w; if (x <= 0) return id; } return 'boost';
  }

  useItem(k) {
    const it = k.item; if (!it || k.rollT > 0) return;
    if (it === 'boost' || it === 'triple') { k.boostT = Math.max(k.boostT, it === 'boost' ? 1.6 : 1.15); k.boostKind = 2; this.emit('boost', k); }
    else if (it === 'oil') { this.hazards.push({ x: k.x - Math.sin(k.h) * 3.2, z: k.z - Math.cos(k.h) * 3.2, t: 25, safe: 0.8, owner: k }); this.emit('drop', k); }
    else if (it === 'shield') { k.shieldT = 8; this.emit('shield', k); }
    else if (it === 'missile') {
      const tgt = this.order[k.place - 2] || null;
      this.proj.push({ x: k.x + Math.sin(k.h) * 2.5, z: k.z + Math.cos(k.h) * 2.5, h: k.h, v: Math.max(62, k.v + 25), t: 6, owner: k, target: tgt });
      this.emit('fire', k, { target: tgt });
    }
    k.uses--; if (k.uses <= 0) k.item = null;
  }

  hit(k, why) {
    if (k.shieldT > 0) { k.shieldT = 0; this.emit('block', k); return; }
    if (k.spinT > 0) return;
    k.spinT = why === 'missile' ? 1.4 : 1.05; k.drift = 0; k.charge = 0; k.boostT = 0; this.emit('hit', k, { why });
  }

  ai(k, dt) {
    const tr = this.tr, N = tr.N, I = k.inp;
    k.laneT -= dt; if (k.laneT <= 0) { k.laneT = 2 + Math.random() * 3; k.laneTo = (Math.random() * 2 - 1) * 5.5; }
    // 앞에 기름이 있으면 피하기
    for (const hz of this.hazards) { const dx = hz.x - k.x, dz = hz.z - k.z; if (dx * dx + dz * dz < 30 * 30) { const fwd = dx * Math.sin(k.h) + dz * Math.cos(k.h); if (fwd > 0) { const i = hz.i ?? nearest(tr, hz.x, hz.z, k.idx); hz.i = i; const hl = (hz.x - tr.P[i * 2]) * tr.Nn[i * 2] + (hz.z - tr.P[i * 2 + 1]) * tr.Nn[i * 2 + 1]; if (Math.abs(hl - k.laneTo) < 3.5) k.laneTo = hl > 0 ? hl - 5 : hl + 5; } } }
    k.laneOff += clamp(k.laneTo - k.laneOff, -4 * dt, 4 * dt);
    const look = 5 + Math.floor(Math.max(0, k.v) * 0.33);
    const ti = (k.idx + look) % N;
    const tx = tr.P[ti * 2] + tr.Nn[ti * 2] * k.laneOff, tz = tr.P[ti * 2 + 1] + tr.Nn[ti * 2 + 1] * k.laneOff;
    const want = Math.atan2(tx - k.x, tz - k.z), diff = wrapA(want - k.h);
    I.steer = clamp(-diff * 2.4, -1, 1);
    let curv = 0; for (let o = 0; o < look * 2 + 10; o += 3) curv = Math.max(curv, tr.K[(k.idx + o) % N]);
    const vm = k.st.vmax * k.vmul;
    const corner = vm * (1 - clamp((curv - 0.25) * 0.55, 0, 0.42));
    I.thr = k.v < corner ? 1 : 0; I.brk = k.v > corner + 5 ? 1 : 0; I.drift = 0;
    // 속도 조절 (실력 + 따라잡기)
    if (k.isBot) {
      const gap = this.player.prog - k.prog;
      const rb = gap > 60 ? clamp(1 + (gap - 60) / 900, 1, 1.09) : gap < -90 ? clamp(1 + (gap + 90) / 1500, 0.93, 1) : 1;
      k.vmul = this.vmulBase * k.skill * rb;
    } else k.vmul = 0.92; // 결승 후 자동 주행
    // 아이템
    I.use = 0;
    if (k.isBot && k.item && k.rollT <= 0) {
      k.itemDelay -= dt;
      if (k.itemDelay <= 0) {
        let ok = true;
        if (k.item === 'missile') ok = k.place > 1;
        if (k.item === 'oil') ok = this.karts.some((o) => o !== k && o.prog < k.prog && k.prog - o.prog < 40) || k.itemDelay < -6;
        if (k.item === 'shield') ok = this.proj.some((m) => m.target === k) || k.itemDelay < -8;
        if (ok) { this.useItem(k); k.itemDelay = 0.6 + Math.random() * 1.5; }
      }
    }
  }

  physics(k, dt) {
    const tr = this.tr, N = tr.N, I = k.inp, S = k.st;
    let vmax = S.vmax * (k.isBot || k.finished ? k.vmul : 1);
    if (k.off && k.boostT <= 0) vmax *= 0.52;
    if (k.drift) vmax *= 0.97;
    if (k.boostT > 0) { k.boostT -= dt; vmax *= k.boostKind === 2 ? 1.34 : 1.24; k.v += 45 * dt; }
    if (k.shieldT > 0) k.shieldT -= dt;
    if (k.hop > 0) k.hop = Math.max(0, k.hop - dt * 3);
    if (k.spinT > 0) {
      k.spinT -= dt; k.spinA += dt * 13; k.v *= Math.pow(0.2, dt);
    } else {
      k.spinA = 0;
      if (I.thr && !I.brk) { if (k.v < vmax) k.v += S.acc * dt * (1 - 0.55 * Math.max(0, k.v) / vmax); }
      else if (I.brk) { k.v -= (k.v > 0 ? 32 : 9) * dt; if (k.v < -10) k.v = -10; }
      else { k.v -= k.v * 0.7 * dt; if (Math.abs(k.v) < 0.3) k.v = 0; }
      if (k.v > vmax) k.v -= (k.v - vmax) * 2.2 * dt;
      // 드리프트
      if (!k.isBot) {
        const pressed = I.drift && !k.prevDrift;
        if (!k.drift && I.drift && Math.abs(I.steer) > 0.3 && k.v > 14 && (pressed || k.hop <= 0)) { k.drift = Math.sign(I.steer); k.charge = 0; k.hop = 0.35; this.emit('drift', k); }
        if (k.drift) {
          if (!I.drift || k.v < 9 || k.off) {
            if (!k.off && k.v >= 9) {
              if (k.charge > 1.9) { k.boostT = Math.max(k.boostT, 1.1); k.boostKind = 2; this.emit('miniboost', k, { lv: 2 }); }
              else if (k.charge > 0.85) { k.boostT = Math.max(k.boostT, 0.6); k.boostKind = 1; this.emit('miniboost', k, { lv: 1 }); }
            }
            k.drift = 0; k.charge = 0;
          } else k.charge += dt * (0.65 + 0.55 * Math.max(0, I.steer * k.drift));
        }
        if (I.drift && k.hop <= 0 && !k.drift && !k.prevDrift) k.hop = 0.25;
        k.prevDrift = I.drift;
        if (I.use && !k.prevUse) this.useItem(k);
        k.prevUse = I.use;
      }
      const sp = clamp(k.v / 10, -1, 1);
      if (k.drift) { const amt = k.drift * (0.72 + 0.5 * I.steer * k.drift); k.h -= amt * S.turn * 1.12 * dt * sp; }
      else k.h -= I.steer * S.turn * dt * sp * (1 - 0.22 * clamp(k.v / S.vmax, 0, 1));
    }
    k.x += Math.sin(k.h) * k.v * dt; k.z += Math.cos(k.h) * k.v * dt;
    // 트랙 위치
    const old = k.idx; k.idx = nearest(tr, k.x, k.z, k.idx);
    let d = k.idx - old; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    if (!k.finished) k.prog += d;
    const i = k.idx, px = tr.P[i * 2], pz = tr.P[i * 2 + 1], nx = tr.Nn[i * 2], nz = tr.Nn[i * 2 + 1];
    k.lat = (k.x - px) * nx + (k.z - pz) * nz;
    k.off = Math.abs(k.lat) > ROAD + 1.0;
    const lim = WALL - 1.3;
    if (Math.abs(k.lat) > lim) {
      const s = Math.sign(k.lat), over = Math.abs(k.lat) - lim; k.x -= nx * s * over; k.z -= nz * s * over; k.lat = s * lim;
      // 벽을 따라 미끄러지게
      const tx = tr.T[i * 2], tz = tr.T[i * 2 + 1], fwdDot = Math.sin(k.h) * tx + Math.cos(k.h) * tz;
      const along = Math.atan2(tx * Math.sign(fwdDot || 1), tz * Math.sign(fwdDot || 1));
      k.h += wrapA(along - k.h) * Math.min(1, dt * 6);
      if (k.wallHit <= 0 && Math.abs(k.v) > 8) { k.v *= 0.72; k.wallHit = 0.4; if (k === this.player) this.emit('wall', k); }
      k.v *= Math.pow(0.6, dt);
    }
    if (k.wallHit > 0) k.wallHit -= dt;
    // 역주행
    const fd = Math.sin(k.h) * tr.T[i * 2] + Math.cos(k.h) * tr.T[i * 2 + 1];
    k.wrongT = (fd < -0.35 && k.v > 4) ? k.wrongT + dt : 0;
    // 바퀴 수
    if (!k.finished) {
      const lapNow = Math.floor(k.prog / N);
      if (k.prog >= 0 && lapNow > (k.lapsDone || 0)) {
        k.lapsDone = lapNow; const lt = this.t - k.lapStart; k.laps.push(lt); k.bestLap = Math.min(k.bestLap, lt); k.lapStart = this.t;
        if (lapNow >= this.laps) { k.finished = true; k.finishTime = this.t; this.emit('finish', k); }
        else this.emit('lap', k, { lap: lapNow + 1, final: lapNow + 1 === this.laps, time: lt });
      }
    }
  }
}
