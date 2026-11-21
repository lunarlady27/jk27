// ===================== 듀얼 스트라이크 — 격투 엔진 (판정 · 동작 · CPU · 그리기) =====================
export const W = 1280, H = 720, FLOOR = 620, STAGE_L = 60, STAGE_R = 1220;
const G = 0.9;
// 자세: [몸통 기울기, 머리, 앞팔 위, 앞팔 아래, 뒷팔 위, 뒷팔 아래, 앞다리 위, 앞다리 아래, 뒷다리 위, 뒷다리 아래, 엉덩이 높이 보정]
// 각도 단위: 도 (0 = 아래쪽, +는 앞쪽으로)
const P = {
  idle: [6, 0, 60, 110, 40, 120, 18, -20, -14, -10, 0], idle2: [8, 2, 64, 112, 44, 122, 18, -22, -14, -12, 3],
  walk1: [8, 0, 55, 110, 45, 110, 30, -10, -24, -30, 0], walk2: [8, 0, 65, 110, 35, 120, -10, -30, 22, -6, 0],
  crouch: [20, 4, 60, 100, 40, 110, 80, -110, 40, -110, 30], jump: [0, 0, 100, 90, 70, 100, 60, -100, 20, -80, -10],
  block: [-4, -4, 120, 140, 110, 150, 10, -14, -16, -10, 0], cblock: [12, -4, 120, 140, 110, 150, 80, -110, 40, -110, 30],
  hurt: [-22, -16, 30, 40, 10, 50, 10, -20, -26, -10, 0], fall: [-70, -20, 150, 30, 130, 40, -40, -20, -60, -10, 30], down: [-90, -10, 170, 10, 160, 10, -90, 0, -90, 0, 60],
  jab1: [12, 4, 90, 0, 40, 120, 18, -20, -14, -10, 0], jab0: [8, 2, 75, 80, 40, 120, 18, -20, -14, -10, 0],
  str0: [-6, 0, 40, 120, 20, 120, 10, -10, -20, -10, 0], str1: [26, 8, 92, 0, 20, 90, 34, -30, -26, -10, 6],
  kick0: [-10, 0, 60, 100, 30, 100, 70, -100, -10, -10, -4], kick1: [-24, -4, 50, 80, 20, 80, 100, 0, -14, -6, -8],
  low1: [26, 6, 60, 90, 40, 110, 110, -10, 40, -110, 34], upp0: [10, 0, 60, 130, 40, 120, 40, -90, 10, -80, 20], upp1: [-10, -12, 170, 0, 60, 100, 10, -10, -20, -10, -16],
  cast0: [-4, 0, 30, 140, 10, 140, 18, -20, -18, -10, 0], cast1: [18, 4, 90, 0, 86, 4, 30, -24, -24, -10, 4],
  dash: [36, 10, 100, 0, 20, 60, 50, -30, -50, -20, 8], grab: [20, 4, 80, 30, 80, 30, 20, -20, -20, -10, 2], throw: [-20, -10, 150, 20, 140, 20, 10, -10, -30, -10, -4],
  spin: [0, 0, 100, 0, 100, 0, 90, 0, -90, 0, -14], win: [-4, -8, 170, 10, 40, 110, 14, -10, -14, -10, 0], air1: [10, 4, 70, 40, 60, 100, 90, -10, 30, -100, -10],
};
// 기술: f = [준비, 판정, 회복] (프레임), dmg, hb = [앞 x, 위 y(엉덩이 기준), 폭, 높이], kb 밀어내기, hs 경직, lv: 'h'/'l'/'m', poses [준비, 판정]
const NORMALS = {
  lp: { f: [4, 3, 7], dmg: 40, hb: [30, -78, 70, 26], kb: 4, hs: 14, bs: 9, lv: 'h', poses: ['jab0', 'jab1'], meter: 4, cancel: true },
  hp: { f: [7, 4, 14], dmg: 85, hb: [30, -84, 86, 30], kb: 9, hs: 20, bs: 13, lv: 'h', poses: ['str0', 'str1'], meter: 8, cancel: true },
  lk: { f: [5, 3, 9], dmg: 50, hb: [26, -50, 86, 30], kb: 5, hs: 15, bs: 10, lv: 'h', poses: ['kick0', 'kick1'], meter: 5, cancel: true },
  cl: { f: [5, 3, 10], dmg: 45, hb: [30, -10, 96, 24], kb: 5, hs: 15, bs: 10, lv: 'l', poses: ['crouch', 'low1'], meter: 5, cancel: true, crouch: true },
  ap: { f: [4, 8, 6], dmg: 70, hb: [16, -40, 80, 56], kb: 6, hs: 18, bs: 11, lv: 'm', poses: ['jump', 'air1'], meter: 6, air: true },
};
export const FIGHTERS = {
  jin: { id: 'jin', name: '진', title: '바람의 권사', color: '#3a7bd5', c2: '#f2f2f2', skin: '#e8b48a', hair: '#1a1a1a', speed: 4.6, jump: 18, hp: 1000,
    sp: { n: { name: '기공파', type: 'proj', f: [12, 2, 22], dmg: 90, speed: 11, size: 30, color: '#6ad1ff' }, f: { name: '돌풍각', type: 'rush', f: [8, 14, 14], dmg: 110, dist: 220, hb: [20, -70, 80, 50] }, d: { name: '승천권', type: 'upper', f: [3, 10, 28], dmg: 130, hb: [10, -150, 70, 150], inv: 8 } },
    sup: { name: '폭풍 연격', dmg: 320, hits: 6 } },
  luna: { id: 'luna', name: '루나', title: '달빛 무용가', color: '#c43a8a', c2: '#2a1a3a', skin: '#f2c8a8', hair: '#f2d24a', speed: 5.6, jump: 19, hp: 920,
    sp: { n: { name: '초승달 날', type: 'proj', f: [10, 2, 18], dmg: 70, speed: 15, size: 22, color: '#ffe08a' }, f: { name: '섬광 돌진', type: 'rush', f: [5, 12, 12], dmg: 95, dist: 300, hb: [20, -60, 70, 40] }, d: { name: '반월 차기', type: 'upper', f: [4, 12, 24], dmg: 115, hb: [0, -140, 90, 140], inv: 6 } },
    sup: { name: '월광 난무', dmg: 300, hits: 8 } },
  kang: { id: 'kang', name: '강철', title: '산을 옮기는 장사', color: '#7a4a2a', c2: '#d8a03a', skin: '#c98e65', hair: '#3a2a1a', speed: 3.8, jump: 16, hp: 1150, big: 1.12,
    sp: { n: { name: '대지 강타', type: 'quake', f: [16, 6, 24], dmg: 110, dist: 260 }, f: { name: '어깨 돌진', type: 'rush', f: [10, 16, 18], dmg: 140, dist: 240, hb: [10, -80, 70, 70], armor: true }, d: { name: '업어치기', type: 'grab', f: [6, 3, 26], dmg: 170, hb: [10, -90, 54, 90] } },
    sup: { name: '천지 메치기', dmg: 360, hits: 3 } },
  mio: { id: 'mio', name: '미오', title: '얼음 마법사', color: '#3ad1c4', c2: '#eafcff', skin: '#f6d6c0', hair: '#9ad8ff', speed: 4.2, jump: 17, hp: 950,
    sp: { n: { name: '얼음 화살', type: 'proj', f: [14, 2, 20], dmg: 85, speed: 8, size: 26, color: '#bff4ff', freeze: true }, f: { name: '빙판 미끄럼', type: 'rush', f: [6, 16, 16], dmg: 80, dist: 260, hb: [10, -20, 90, 30], low: true }, d: { name: '얼음 기둥', type: 'pillar', f: [10, 8, 26], dmg: 120 } },
    sup: { name: '절대 영도', dmg: 300, hits: 5 } },
};

export class Fighter {
  constructor(def, side, ctrl) {
    this.d = def; this.side = side; this.ctrl = ctrl; // 'p1','p2','cpu','net'
    this.reset();
  }
  reset() {
    this.x = this.side === 0 ? 400 : 880; this.y = FLOOR; this.vx = 0; this.vy = 0; this.face = this.side === 0 ? 1 : -1;
    this.hp = this.d.hp; this.lag = this.d.hp; this.meter = this.meter || 0; this.state = 'idle'; this.t = 0; this.move = null; this.hit = false;
    this.stun = 0; this.bstun = 0; this.combo = 0; this.inv = 0; this.downT = 0; this.juggle = 0; this.pose = P.idle.slice(); this.target = 'idle'; this.freeze = 0;
  }
  get air() { return this.y < FLOOR - 1; }
  get crouching() { return this.state === 'crouch' || (this.move && this.move.crouch); }
}

export class Match {
  constructor(a, b, opts = {}) {
    this.f = [a, b]; this.round = 1; this.wins = [0, 0]; this.timer = 99; this.phase = 'intro'; this.pt = 0; this.projs = []; this.fx = []; this.shake = 0; this.flash = 0; this.diff = opts.diff || 'normal'; this.hitstop = 0; this.events = []; this.superCine = 0; this.winner = null;
    for (const f of this.f) f.meter = 0;
  }
  input(f, inp) { f.inp = inp; }
  step() {
    this.pt++;
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.superCine > 0) { this.superCine--; return; }
    const [a, b] = this.f;
    if (this.phase === 'intro') { if (this.pt === 1) this.events.push({ t: 'announce', s: `ROUND ${this.round}` }); if (this.pt === 80) this.events.push({ t: 'announce', s: 'FIGHT!' }); if (this.pt > 100) { this.phase = 'fight'; this.pt = 0; } for (const f of this.f) this.pose(f); return; }
    if (this.phase === 'fight') { if (this.pt % 60 === 0) this.timer = Math.max(0, this.timer - 1); if (this.timer <= 0) this.endRound(a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1, 'TIME'); }
    if (this.phase === 'ko') { if (this.pt > 150) this.nextRound(); }
    for (const f of this.f) { const o = f === a ? b : a; if (f.ctrl === 'cpu' && this.phase === 'fight') f.inp = this.cpu(f, o); this.update(f, o); }
    this.projectiles();
    // 서로 겹치지 않게
    if (!a.air && !b.air || Math.abs(a.y - b.y) < 120) { const d = b.x - a.x, min = 70 * Math.max(a.d.big || 1, b.d.big || 1); if (Math.abs(d) < min) { const push = (min - Math.abs(d)) / 2 * Math.sign(d || 1); a.x -= push; b.x += push; } }
    for (const f of this.f) { f.x = Math.max(STAGE_L, Math.min(STAGE_R, f.x)); if (f.lag > f.hp) f.lag -= (f.combo ? 0 : 6); }
    // 서로 바라보기
    if (this.phase === 'fight') for (const f of this.f) { const o = f === a ? b : a; if (!f.move && !f.air && f.state !== 'hurt' && f.state !== 'down') f.face = o.x > f.x ? 1 : -1; }
    for (const f of this.f) this.pose(f);
    for (const e of this.fx) e.t--; this.fx = this.fx.filter((e) => e.t > 0);
    if (this.shake > 0) this.shake *= 0.85; if (this.flash > 0) this.flash -= 0.05;
  }
  endRound(w, why) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko'; this.pt = 0;
    if (w >= 0) { this.wins[w]++; this.f[w].state = 'win'; }
    this.events.push({ t: 'announce', s: why === 'TIME' ? 'TIME OVER' : 'K.O.' });
    this.events.push({ t: 'ko' });
  }
  nextRound() {
    if (this.wins[0] >= 2 || this.wins[1] >= 2) { this.phase = 'over'; this.winner = this.wins[0] >= 2 ? 0 : 1; this.events.push({ t: 'over', w: this.winner }); return; }
    this.round++; this.timer = 99; this.phase = 'intro'; this.pt = 0; this.projs = [];
    for (const f of this.f) { const m = f.meter; f.reset(); f.meter = m; }
  }
  // ---------- 한 명 움직이기 ----------
  update(f, o) {
    const I = f.inp || {}, dir = (I.r ? 1 : 0) - (I.l ? 1 : 0), fwd = dir * f.face;
    f.t++; if (f.inv > 0) f.inv--;
    if (f.freeze > 0) { f.freeze--; return; }
    // 공중 물리
    if (f.air || f.vy < 0) { f.vy += G; f.y += f.vy; f.x += f.vx; if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; if (f.state === 'fall') { f.state = 'down'; f.downT = 40; f.vx = 0; this.events.push({ t: 'land', big: true }); this.shake = 6; } else if (f.state === 'jump' || (f.move && f.move.air)) { f.state = 'idle'; f.move = null; f.vx = 0; } else if (f.state === 'hurt') { f.vx = 0; } } }
    else if (f.state !== 'dash') { f.x += f.vx; f.vx *= 0.82; }
    if (this.phase !== 'fight') { if (f.state !== 'win' && f.state !== 'down' && f.state !== 'fall') { f.state = 'idle'; f.move = null; } if (f.state === 'down' && f.hp > 0) { f.downT--; if (f.downT <= 0) f.state = 'idle'; } return; }
    // 경직
    if (f.state === 'hurt') { f.stun--; if (f.stun <= 0 && !f.air) { f.state = 'idle'; f.combo = 0; f.juggle = 0; } return; }
    if (f.state === 'block') { f.bstun--; if (f.bstun <= 0) f.state = I.d ? 'crouch' : 'idle'; return; }
    if (f.state === 'fall') return;
    if (f.state === 'down') { f.downT--; if (f.downT <= 0) { if (f.hp <= 0) return; f.state = 'idle'; f.inv = 12; f.combo = 0; f.juggle = 0; } return; }
    if (f.state === 'thrown') return;
    // 기술 진행
    if (f.move) { this.runMove(f, o, I); return; }
    // 필살기 · 기술 입력 (같은 프레임 우선순위: 초필 > 필살 > 일반)
    if (I.su && f.meter >= 100 && !f.air) return this.startSuper(f, o);
    if (I.sp) { const k = I.d ? 'd' : fwd > 0 ? 'f' : 'n'; return this.startSpecial(f, o, k); }
    if (f.air) { if (I.lp || I.hp || I.lk) this.startNormal(f, 'ap'); return; }
    if (I.lp) return this.startNormal(f, I.d ? 'cl' : 'lp');
    if (I.hp) return this.startNormal(f, I.d ? 'cl' : 'hp');
    if (I.lk) return this.startNormal(f, I.d ? 'cl' : 'lk');
    // 이동
    if (I.u && !f.air) { f.state = 'jump'; f.vy = -f.d.jump; f.vx = dir * f.d.speed * 1.1; f.y -= 1; this.events.push({ t: 'jump' }); return; }
    if (I.d) { f.state = 'crouch'; f.vx = 0; return; }
    if (dir) { f.state = 'walk'; f.vx = dir * f.d.speed * (fwd < 0 ? 0.8 : 1); } else f.state = 'idle';
  }
  startNormal(f, k) { const m = NORMALS[k]; f.move = { ...m, k, t: 0 }; f.hit = false; f.state = 'atk'; if (!f.air) f.vx = 0; }
  startSpecial(f, o, k) {
    const s = f.d.sp[k]; if (!s) return;
    f.move = { ...s, k: 'sp' + k, t: 0, special: true, lv: s.low ? 'l' : 'm', hs: 22, bs: 14, kb: 10, meter: 10 }; f.hit = false; f.state = 'atk'; f.vx = 0;
    if (s.inv) f.inv = s.inv;
    this.events.push({ t: 'special', name: s.name, side: f.side });
  }
  startSuper(f, o) {
    f.meter = 0; f.move = { k: 'super', f: [20, 30, 30], dmg: f.d.sup.dmg, hits: f.d.sup.hits, t: 0, special: true, lv: 'm', hs: 30, bs: 20, kb: 6, super: true }; f.hit = false; f.state = 'atk'; f.inv = 30;
    this.superCine = 40; this.flash = 1; this.events.push({ t: 'super', name: f.d.sup.name, side: f.side });
  }
  runMove(f, o, I) {
    const m = f.move; m.t++;
    const [s, a, r] = m.f, T = s + a + r;
    // 취소 (일반기 → 필살기)
    if (m.cancel && f.hit && I.sp && m.t > s) { f.move = null; return this.startSpecial(f, o, I.d ? 'd' : ((I.r ? 1 : 0) - (I.l ? 1 : 0)) * f.face > 0 ? 'f' : 'n'); }
    if (m.cancel && f.hit && I.su && f.meter >= 100) { f.move = null; return this.startSuper(f, o); }
    const act = m.t > s && m.t <= s + a;
    // 종류별 움직임
    if (m.type === 'rush' && act) { f.x += f.face * (m.dist / a); }
    if (m.type === 'upper' && m.t === s + 1) { f.vy = -16; f.vx = f.face * 3; f.y -= 1; }
    if (m.k === 'super' && act) { f.x += f.face * 7; }
    if (m.type === 'proj' && m.t === s + 1) { this.projs.push({ x: f.x + f.face * 60, y: f.y - 90, vx: f.face * m.speed, owner: f, dmg: m.dmg, size: m.size, color: m.color, freeze: m.freeze, life: 200 }); this.events.push({ t: 'proj' }); }
    if (m.type === 'quake' && m.t === s + 1) { this.shake = 10; this.fx.push({ k: 'quake', x: f.x, face: f.face, t: 26 }); if (!o.air && Math.abs(o.x - f.x) < m.dist && Math.sign(o.x - f.x) === f.face) this.landHit(f, o, m, 'l'); }
    if (m.type === 'pillar' && m.t === s + 1) { const px = Math.max(STAGE_L, Math.min(STAGE_R, o.x)); this.fx.push({ k: 'pillar', x: px, t: 30 }); if (Math.abs(o.x - px) < 60) this.landHit(f, o, m, 'm', true); }
    // 맞히기
    if (act && !f.hit && m.type !== 'proj' && m.type !== 'quake' && m.type !== 'pillar') {
      const hb = m.hb || [20, -90, 90, 80];
      const sc = f.d.big || 1;
      const x0 = f.face > 0 ? f.x + hb[0] * sc : f.x - (hb[0] + hb[2]) * sc, x1 = x0 + hb[2] * sc, y0 = f.y + hb[1] * sc, y1 = y0 + hb[3] * sc;
      const hx0 = o.x - 32 * (o.d.big || 1), hx1 = o.x + 32 * (o.d.big || 1), hy0 = o.y - (o.crouching ? 100 : 170) * (o.d.big || 1), hy1 = o.y;
      if (x0 < hx1 && x1 > hx0 && y0 < hy1 && y1 > hy0 && o.inv <= 0 && o.state !== 'down') {
        if (m.type === 'grab') { if (!o.air && o.state !== 'block' && o.state !== 'hurt') { f.hit = true; this.doThrow(f, o, m); } }
        else if (m.k === 'super') { f.hit = true; this.superHit(f, o, m); }
        else { f.hit = true; this.landHit(f, o, m, m.lv); }
      }
    }
    if (m.t >= T && !f.air) { f.move = null; f.state = 'idle'; }
    if (m.t >= T && f.air && m.type !== 'upper') { f.move = null; f.state = 'jump'; }
    if (m.t >= T && m.type === 'upper' && !f.air) { f.move = null; f.state = 'idle'; }
  }
  // 막았는지: 뒤로 누르고 있고, 높이가 맞아야
  blocks(o, att, lv) {
    if (o.air || o.move || o.state === 'hurt' || o.state === 'down' || o.state === 'fall') return false;
    const I = o.inp || {}; const back = ((I.r ? 1 : 0) - (I.l ? 1 : 0)) * o.face < 0;
    if (!back && o.state !== 'block') return false;
    if (lv === 'l' && !I.d) return false; if (lv === 'h' && false) return false;
    if (lv === 'm' && att.air && I.d) return false;
    return true;
  }
  landHit(f, o, m, lv, unblockable) {
    const dir = Math.sign(o.x - f.x) || f.face;
    if (!unblockable && this.blocks(o, f, lv)) {
      o.state = 'block'; o.bstun = m.bs || 10; o.vx = dir * (m.kb || 5) * 0.8; o.hp -= Math.round((m.dmg || 50) * (m.special ? 0.15 : 0)); f.meter = Math.min(100, f.meter + (m.meter || 5) * 0.5); o.meter = Math.min(100, o.meter + 3);
      this.fx.push({ k: 'block', x: o.x - dir * 20, y: o.y - 100, t: 10 }); this.hitstop = 4; this.events.push({ t: 'block' }); return;
    }
    const scale = Math.max(0.35, 1 - o.combo * 0.12);
    const dmg = Math.round((m.dmg || 50) * scale);
    o.hp -= dmg; o.combo++; f.meter = Math.min(100, f.meter + (m.meter || 6)); o.meter = Math.min(100, o.meter + 4);
    o.move = null; o.state = 'hurt'; o.stun = m.hs || 16; o.vx = dir * (m.kb || 6);
    if (o.air || m.type === 'upper' || m.type === 'pillar' || o.juggle > 2) { o.state = 'fall'; o.vy = m.type === 'upper' || m.type === 'pillar' ? -15 : -8; o.vx = dir * 4; o.y -= 1; o.juggle++; }
    if (m.freeze) { o.freeze = 24; this.fx.push({ k: 'ice', x: o.x, y: o.y - 90, t: 24 }); }
    this.fx.push({ k: 'hit', x: o.x - dir * 18, y: o.y - (lv === 'l' ? 30 : 110), t: 12, big: dmg > 90 });
    this.fx.push({ k: 'num', x: o.x, y: o.y - 190, n: dmg, t: 40 });
    this.hitstop = dmg > 90 ? 8 : 5; this.shake = dmg > 90 ? 8 : 3;
    this.events.push({ t: 'hit', big: dmg > 90, combo: o.combo, side: f.side });
    if (o.hp <= 0) { o.hp = 0; o.state = 'fall'; o.vy = -12; o.vx = dir * 6; o.y -= 1; this.hitstop = 30; this.endRound(f.side, 'KO'); }
  }
  doThrow(f, o, m) {
    o.move = null; o.state = 'fall'; const dir = f.face; o.x = f.x + dir * 20; o.vy = -14; o.vx = -dir * 9; o.y -= 1; o.face = -dir; f.face = -dir;
    o.hp -= m.dmg; o.combo = 0; f.meter = Math.min(100, f.meter + 12);
    this.fx.push({ k: 'hit', x: o.x, y: o.y - 120, t: 14, big: true }); this.fx.push({ k: 'num', x: o.x, y: o.y - 190, n: m.dmg, t: 40 }); this.shake = 12; this.hitstop = 10;
    this.events.push({ t: 'hit', big: true, combo: 1, side: f.side });
    if (o.hp <= 0) { o.hp = 0; this.endRound(f.side, 'KO'); }
  }
  superHit(f, o, m) {
    const per = Math.round(m.dmg / m.hits);
    let k = 0;
    const tick = () => { if (k >= m.hits || this.phase !== 'fight') return; k++; this.landHit(f, o, { ...m, dmg: per, hs: 40, kb: k === m.hits ? 14 : 1, type: k === m.hits ? 'upper' : null }, 'm', true); if (k < m.hits) setTimeout(tick, 70); };
    tick(); this.flash = 0.8;
  }
  projectiles() {
    for (const p of this.projs) {
      p.x += p.vx; p.life--;
      const o = this.f.find((q) => q !== p.owner);
      if (Math.abs(p.x - o.x) < 34 + p.size && o.y - 170 < p.y + p.size && o.y > p.y - p.size && o.inv <= 0 && o.state !== 'down' && !(o.crouching && p.size < 24)) {
        p.life = 0; this.landHit(p.owner, o, { dmg: p.dmg, hs: 20, bs: 14, kb: 8, special: true, meter: 8, freeze: p.freeze }, 'm');
      }
      for (const q of this.projs) if (q !== p && q.owner !== p.owner && Math.abs(q.x - p.x) < p.size + q.size && q.life > 0) { p.life = q.life = 0; this.fx.push({ k: 'hit', x: p.x, y: p.y, t: 12, big: true }); }
      if (p.x < 0 || p.x > W) p.life = 0;
    }
    this.projs = this.projs.filter((p) => p.life > 0);
  }
  // ---------- 컴퓨터 ----------
  cpu(f, o) {
    const D = { easy: { react: 0.25, block: 0.25, aggro: 0.35 }, normal: { react: 0.5, block: 0.55, aggro: 0.55 }, hard: { react: 0.85, block: 0.8, aggro: 0.7 } }[this.diff];
    const ai = f.ai || (f.ai = { t: 0, plan: null, hold: 0 });
    const I = { l: 0, r: 0, u: 0, d: 0, lp: 0, hp: 0, lk: 0, sp: 0, su: 0 };
    const dist = Math.abs(o.x - f.x), toward = o.x > f.x ? 'r' : 'l', away = toward === 'r' ? 'l' : 'r';
    // 막기: 상대가 공격 중이고 가까우면
    const threat = (o.move && (o.move.t < (o.move.f[0] + o.move.f[1])) && dist < 260) || this.projs.some((p) => p.owner === o && Math.abs(p.x - f.x) < 220 && Math.sign(p.vx) === Math.sign(f.x - p.x));
    if (threat && Math.random() < D.block) { I[away] = 1; if (o.move && o.move.lv === 'l') I.d = 1; if (this.projs.some((p) => p.owner === o && p.size < 24) && Math.random() < 0.5) { I[away] = 0; I.d = 1; } return I; }
    // 대공: 상대가 점프해서 다가오면
    if (o.air && dist < 220 && o.vy > -4 && Math.random() < D.react) { I.d = 1; I.sp = 1; return I; }
    ai.t--;
    if (ai.t <= 0) {
      ai.t = 8 + Math.floor(Math.random() * 14);
      const r = Math.random();
      if (f.meter >= 100 && dist < 200 && r < 0.4) ai.plan = 'super';
      else if (dist > 420) ai.plan = r < 0.45 && f.d.sp.n.type !== 'quake' ? 'zone' : 'approach';
      else if (dist > 170) ai.plan = r < D.aggro ? (r < 0.15 ? 'jumpin' : r < 0.32 ? 'rush' : 'approach') : r < 0.75 ? 'zone' : 'wait';
      else ai.plan = r < 0.55 ? 'combo' : r < 0.7 ? 'low' : r < 0.82 ? 'back' : 'grab';
    }
    switch (ai.plan) {
      case 'zone': I.sp = this.projs.some((p) => p.owner === f) ? 0 : 1; ai.plan = 'wait'; break;
      case 'approach': I[toward] = 1; break;
      case 'jumpin': I.u = 1; I[toward] = 1; ai.plan = 'airatk'; break;
      case 'airatk': if (f.air && dist < 140) { I.hp = 1; ai.plan = 'combo'; } break;
      case 'rush': I[toward] = 1; I.sp = 1; ai.plan = 'wait'; break;
      case 'combo': { const step = (ai.cs = (ai.cs || 0) + 1); if (step === 1) I.lp = 1; else if (step === 6) I.hp = 1; else if (step === 12) { I.sp = 1; I[toward] = Math.random() < 0.5 ? 1 : 0; ai.cs = 0; ai.plan = 'wait'; } break; }
      case 'low': I.d = 1; I.lk = 1; ai.plan = 'wait'; break;
      case 'grab': if (f.d.sp.d.type === 'grab') { I.d = 1; I.sp = 1; } else { I.lp = 1; } ai.plan = 'wait'; break;
      case 'back': I[away] = 1; break;
      case 'super': I.su = 1; ai.plan = 'wait'; break;
      default: break;
    }
    return I;
  }
  // ---------- 자세 보간 ----------
  pose(f) {
    let tgt = 'idle', k = 0.35;
    const m = f.move;
    if (f.state === 'win') tgt = 'win';
    else if (m) { const [s, a] = m.f; const ps = m.poses || (m.type === 'proj' || m.type === 'pillar' ? ['cast0', 'cast1'] : m.type === 'rush' ? ['dash', 'dash'] : m.type === 'upper' ? ['upp0', 'upp1'] : m.type === 'grab' ? ['grab', 'throw'] : m.type === 'quake' ? ['upp1', 'crouch'] : m.k === 'super' ? ['cast0', (this.pt >> 2) % 2 ? 'str1' : 'kick1'] : ['str0', 'str1']); tgt = m.t <= s ? ps[0] : m.t <= s + a ? ps[1] : ps[1]; k = m.t <= s ? 0.5 : 0.7; if (f.d.id === 'luna' && m.type === 'rush') tgt = 'kick1'; if (f.d.id === 'luna' && m.type === 'upper') tgt = 'spin'; if (f.d.id === 'mio' && m.type === 'rush') tgt = 'low1'; }
    else if (f.state === 'hurt') tgt = 'hurt'; else if (f.state === 'fall') tgt = 'fall'; else if (f.state === 'down') tgt = 'down';
    else if (f.state === 'block') tgt = (f.inp && f.inp.d) ? 'cblock' : 'block';
    else if (f.state === 'crouch') tgt = 'crouch'; else if (f.state === 'jump' || f.air) tgt = 'jump';
    else if (f.state === 'walk') tgt = (Math.floor(this.pt / 9) % 2) ? 'walk1' : 'walk2';
    else tgt = (Math.floor(this.pt / 30) % 2) ? 'idle' : 'idle2';
    const T = P[tgt]; for (let i = 0; i < f.pose.length; i++) f.pose[i] += (T[i] - f.pose[i]) * k;
  }
  // 네트워크 상태
  snap() { return { f: this.f.map((f) => [Math.round(f.x), Math.round(f.y), f.face, Math.round(f.hp), Math.round(f.lag), Math.round(f.meter), f.state, f.pose.map((v) => Math.round(v)), f.combo, f.freeze > 0 ? 1 : 0]), p: this.projs.map((p) => [Math.round(p.x), Math.round(p.y), p.size, p.color, p.vx > 0 ? 1 : -1]), fx: this.fx.map((e) => [e.k, Math.round(e.x), Math.round(e.y || 0), e.t, e.n || 0, e.big ? 1 : 0, e.face || 0]), r: this.round, w: this.wins, tm: this.timer, ph: this.phase, sh: Math.round(this.shake), fl: Math.round(this.flash * 10) / 10, wn: this.winner }; }
}

// ===================== 그리기 =====================
const rad = (d) => d * Math.PI / 180;
export function drawStage(g, stage, t, shake) {
  g.save();
  // 하늘
  const S = stage;
  const sky = g.createLinearGradient(0, 0, 0, FLOOR); sky.addColorStop(0, S.sky[0]); sky.addColorStop(1, S.sky[1]); g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
  // 해/달
  g.fillStyle = S.sun; g.beginPath(); g.arc(W * 0.78, 150, 60, 0, 7); g.fill();
  // 먼 산 / 건물
  g.fillStyle = S.far; g.beginPath(); g.moveTo(0, 470); for (let x = 0; x <= W; x += 40) g.lineTo(x, 430 - Math.abs(Math.sin(x * 0.006 + S.seed)) * 160 - Math.sin(x * 0.03) * 12); g.lineTo(W, 520); g.lineTo(0, 520); g.fill();
  g.fillStyle = S.mid;
  for (let i = 0; i < 14; i++) { const x = i * 100 - 20 + (S.seed * 13) % 40, h = 120 + ((i * 53 + S.seed * 7) % 140); if (S.kind === 'city') { g.fillRect(x, 540 - h, 80, h); g.fillStyle = 'rgba(255,230,140,.55)'; for (let wy = 540 - h + 12; wy < 520; wy += 22) for (let wx = x + 10; wx < x + 70; wx += 20) if ((wx * 7 + wy * 3 + i) % 5 < 3) g.fillRect(wx, wy, 9, 12); g.fillStyle = S.mid; } else { g.beginPath(); g.moveTo(x - 30, 560); g.lineTo(x + 40, 540 - h * 0.7); g.lineTo(x + 110, 560); g.fill(); } }
  // 관중 · 울타리
  g.fillStyle = S.crowd;
  for (let i = 0; i < 70; i++) { const x = i * 19, bob = Math.sin(t * 0.15 + i) * 3; g.beginPath(); g.arc(x, 548 + bob + (i % 3) * 6, 10, 0, 7); g.fill(); g.fillRect(x - 9, 552 + bob + (i % 3) * 6, 18, 30); }
  // 바닥
  const fl = g.createLinearGradient(0, 560, 0, H); fl.addColorStop(0, S.floor[0]); fl.addColorStop(1, S.floor[1]); g.fillStyle = fl; g.fillRect(-20, 570, W + 40, H);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; for (let i = -10; i <= 22; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, 570); g.lineTo(W / 2 + i * 140, H); g.stroke(); }
  g.restore();
  void shake;
}
export const STAGES = [
  { name: '노을 도장', sky: ['#ff9a5a', '#ffd9a0'], sun: '#fff1c0', far: '#b0607a', mid: '#7a3a5a', crowd: '#4a2238', floor: ['#8a5a3a', '#5a3a22'], kind: 'mount', seed: 1 },
  { name: '밤의 도시', sky: ['#0a1030', '#3a2a6a'], sun: '#eef2ff', far: '#1a1a3a', mid: '#22224a', crowd: '#101028', floor: ['#3a3a4a', '#1a1a24'], kind: 'city', seed: 4 },
  { name: '설산 신전', sky: ['#7ec0ff', '#e8f6ff'], sun: '#ffffff', far: '#c8d8ec', mid: '#8aa4c4', crowd: '#5a6a8a', floor: ['#dde8f2', '#a8b8cc'], kind: 'mount', seed: 7 },
];
// 캐릭터 (뼈대 + 옷)
export function drawFighter(g, f, def, t, flashWhite) {
  const p = f.pose, sc = (def.big || 1), face = f.face;
  const legH = (th, kn) => 38 * Math.cos(rad(th)) + 38 * Math.cos(rad(th + kn));
  const hipY = f.y - Math.max(4, legH(p[6], p[7]), legH(p[8], p[9])) * sc, hipX = f.x;
  g.save();
  // 그림자
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(f.x, FLOOR + 4, 46 * sc * Math.max(0.4, 1 - (FLOOR - f.y) / 400), 10, 0, 0, 7); g.fill();
  g.translate(hipX, hipY); g.scale(face * sc, sc);
  const seg = (x, y, ang, len) => [x + Math.sin(rad(ang)) * len, y + Math.cos(rad(ang)) * len];
  const limb = (pts, w, col) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111'; g.lineWidth = w + 6; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
  const torsoA = p[0], tl = 56;
  const neck = seg(0, 0, 180 - torsoA, tl); // 위로 (+는 앞으로 숙임)
  const sh = [neck[0] * 0.92, neck[1] * 0.92];
  // 뒷다리 · 뒷팔 (어둡게)
  const kneeB = seg(0, 0, p[8], 38), footB = seg(kneeB[0], kneeB[1], p[8] + p[9], 38);
  const elbB = seg(sh[0], sh[1], p[4], 30), handB = seg(elbB[0], elbB[1], p[4] + p[5], 28);
  const dark = shade(def.c2, -0.25), darkC = shade(def.color, -0.25), darkS = shade(def.skin, -0.2);
  limb([[0, 0], kneeB, footB], 20, dark); drawFoot(g, footB, p[8] + p[9], '#222');
  limb([sh, elbB], 15, darkC); limb([elbB, handB], 13, darkS); drawFist(g, handB, darkS);
  // 몸통
  g.save(); g.rotate(rad(torsoA)); g.fillStyle = '#111'; roundRect(g, -25, -tl - 4, 50, tl + 12, 16); g.fill(); g.fillStyle = def.color; roundRect(g, -22, -tl - 1, 44, tl + 6, 14); g.fill();
  g.fillStyle = def.c2; g.fillRect(-22, -12, 44, 10); // 띠
  if (def.id === 'jin') { g.fillStyle = def.c2; g.beginPath(); g.moveTo(-6, -tl); g.lineTo(6, -tl); g.lineTo(0, -tl + 24); g.fill(); }
  if (def.id === 'mio') { g.fillStyle = def.c2; roundRect(g, -24, -20, 48, 34, 8); g.fill(); }
  if (def.id === 'kang') { g.fillStyle = def.skin; roundRect(g, -16, -tl + 2, 32, 30, 10); g.fill(); }
  g.restore();
  // 앞다리
  const kneeF = seg(0, 0, p[6], 38), footF = seg(kneeF[0], kneeF[1], p[6] + p[7], 38);
  limb([[0, 0], kneeF, footF], 21, def.c2); drawFoot(g, footF, p[6] + p[7], '#1a1a1a');
  // 머리
  const hd = seg(neck[0], neck[1], 180 - torsoA - p[1], 22);
  g.fillStyle = '#111'; g.beginPath(); g.arc(hd[0], hd[1], 21, 0, 7); g.fill();
  g.fillStyle = def.skin; g.beginPath(); g.arc(hd[0], hd[1], 18, 0, 7); g.fill();
  // 머리카락
  g.fillStyle = def.hair;
  if (def.id === 'luna') { g.beginPath(); g.arc(hd[0] - 2, hd[1] - 4, 19, Math.PI * 0.9, Math.PI * 2.1); g.fill(); g.beginPath(); g.moveTo(hd[0] - 16, hd[1] - 6); g.quadraticCurveTo(hd[0] - 40, hd[1] + 30 + Math.sin(t * 0.2) * 4, hd[0] - 30, hd[1] + 50); g.lineTo(hd[0] - 14, hd[1] + 10); g.fill(); }
  else if (def.id === 'mio') { g.beginPath(); g.arc(hd[0], hd[1] - 2, 21, Math.PI * 0.8, Math.PI * 2.2); g.fill(); g.fillRect(hd[0] - 20, hd[1] - 4, 8, 26); g.fillStyle = '#5a9ad8'; g.beginPath(); g.moveTo(hd[0] - 18, hd[1] - 18); g.lineTo(hd[0] + 2, hd[1] - 46); g.lineTo(hd[0] + 18, hd[1] - 18); g.fill(); }
  else if (def.id === 'kang') { g.beginPath(); g.arc(hd[0], hd[1] - 6, 16, Math.PI, Math.PI * 2); g.fill(); g.fillRect(hd[0] - 10, hd[1] + 10, 20, 8); }
  else { for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(hd[0] - 18 + i * 8, hd[1] - 8); g.lineTo(hd[0] - 22 + i * 9, hd[1] - 30 - (i % 2) * 6); g.lineTo(hd[0] - 10 + i * 8, hd[1] - 10); g.fill(); } g.fillStyle = '#d83a3a'; g.fillRect(hd[0] - 19, hd[1] - 10, 38, 6); g.beginPath(); g.moveTo(hd[0] - 18, hd[1] - 8); g.lineTo(hd[0] - 44, hd[1] - 2 + Math.sin(t * 0.25) * 5); g.lineTo(hd[0] - 18, hd[1] - 2); g.fill(); }
  // 눈
  g.fillStyle = '#111'; g.fillRect(hd[0] + 6, hd[1] - 3, 6, 3);
  if (f.state === 'hurt' || f.state === 'fall') { g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(hd[0] + 5, hd[1] - 6); g.lineTo(hd[0] + 12, hd[1]); g.stroke(); }
  // 앞팔
  const elbF = seg(sh[0], sh[1], p[2], 30), handF = seg(elbF[0], elbF[1], p[2] + p[3], 28);
  limb([sh, elbF], 16, def.color); limb([elbF, handF], 14, def.skin); drawFist(g, handF, def.id === 'kang' ? '#c84a2a' : def.skin);
  g.restore();
  if (flashWhite) { g.save(); g.globalAlpha = 0.5; g.restore(); }
}
function drawFoot(g, p, ang, c) { g.save(); g.translate(p[0], p[1]); g.rotate(-rad(ang) * 0.3); g.fillStyle = '#111'; roundRect(g, -6, -6, 26, 14, 6); g.fill(); g.fillStyle = c; roundRect(g, -4, -4, 22, 10, 5); g.fill(); g.restore(); }
function drawFist(g, p, c) { g.fillStyle = '#111'; g.beginPath(); g.arc(p[0], p[1], 11, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(p[0], p[1], 8.5, 0, 7); g.fill(); }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v + v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
export function drawFx(g, fx, projs, t) {
  for (const p of projs) { const gr = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.size * 1.6); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, p.color); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, p.size * 1.8, p.size * 1.2, 0, 0, 7); g.fill(); g.fillStyle = p.color; g.globalAlpha = 0.4; g.beginPath(); g.ellipse(p.x - (p.dir ?? Math.sign(p.vx)) * p.size * 1.6, p.y, p.size * 1.4, p.size * 0.6, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
  for (const e of fx) {
    if (e.k === 'hit' || e.k === 'block') { const r = (e.big ? 60 : 38) * (1 - e.t / 14) + 10; g.save(); g.translate(e.x, e.y); g.fillStyle = e.k === 'block' ? 'rgba(120,200,255,.8)' : 'rgba(255,240,180,.9)'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.4 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); g.restore(); }
    if (e.k === 'num') { g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#000'; g.globalAlpha = Math.min(1, e.t / 15); g.strokeText(e.n, e.x, e.y - (40 - e.t)); g.fillStyle = '#ffe14a'; g.fillText(e.n, e.x, e.y - (40 - e.t)); g.globalAlpha = 1; }
    if (e.k === 'quake') { g.fillStyle = 'rgba(160,110,60,.8)'; for (let i = 0; i < 8; i++) { const x = e.x + e.face * (40 + i * 30) * (1 - e.t / 30 + 0.3), h = 30 + Math.sin(i * 2) * 15; g.beginPath(); g.moveTo(x - 14, FLOOR); g.lineTo(x, FLOOR - h); g.lineTo(x + 14, FLOOR); g.fill(); } }
    if (e.k === 'pillar') { const h = Math.min(1, (30 - e.t) / 6) * 220; const gr = g.createLinearGradient(e.x - 40, 0, e.x + 40, 0); gr.addColorStop(0, 'rgba(180,240,255,.2)'); gr.addColorStop(0.5, 'rgba(230,252,255,.95)'); gr.addColorStop(1, 'rgba(180,240,255,.2)'); g.fillStyle = gr; g.beginPath(); g.moveTo(e.x - 40, FLOOR); g.lineTo(e.x - 26, FLOOR - h); g.lineTo(e.x, FLOOR - h - 30); g.lineTo(e.x + 26, FLOOR - h); g.lineTo(e.x + 40, FLOOR); g.fill(); }
    if (e.k === 'ice') { g.strokeStyle = 'rgba(190,245,255,.9)'; g.lineWidth = 4; g.strokeRect(e.x - 40, e.y - 90, 80, 180); }
  }
  void t;
}
