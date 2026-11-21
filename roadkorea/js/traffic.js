import * as THREE from 'three';
import { W, LANE_W, lanePos, signalState, groundY, linkY, edgesNear } from './world.js';
// 회전 종류: 각도가 작으면 직진(굽은 길), 크면 좌/우회전
export const turnType = (L, o) => { if (o === L.rev) return 'U'; const cr = L.dir.x * o.dir.z - L.dir.z * o.dir.x, dt = L.dir.x * o.dir.x + L.dir.z * o.dir.z; const ang = Math.atan2(cr, dt); return Math.abs(ang) < 0.55 ? 'S' : ang < 0 ? 'L' : 'R'; };
import { buildVehicle, buildPed, animPed } from './models.js';
import { CARS, BUSES, TRAFFIC_PAINTS, BUS_TYPES, COMPANY_INFO, BY_ID } from './data.js';
import { clamp, lerp, pick } from './util.js';

const CELL = 40;
const BRAND_W = { hanbit: 34, sora: 30, zenith: 10, bayern: 12, stern: 14 };
function randomCarSpec() {
  const tot = Object.values(BRAND_W).reduce((a, b) => a + b, 0);
  let r = Math.random() * tot, brand = 'hanbit';
  for (const k in BRAND_W) { r -= BRAND_W[k]; if (r <= 0) { brand = k; break; } }
  return pick(CARS.filter((c) => c.brand === brand));
}
function bez(c, u, out) {
  const m = 1 - u, a = m * m * m, b = 3 * m * m * u, d = 3 * m * u * u, e = u * u * u;
  out.x = a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x;
  out.z = a * c.p0.z + b * c.p1.z + d * c.p2.z + e * c.p3.z;
  const da = 3 * m * m, db = 6 * m * u, dc = 3 * u * u;
  out.tx = da * (c.p1.x - c.p0.x) + db * (c.p2.x - c.p1.x) + dc * (c.p3.x - c.p2.x);
  out.tz = da * (c.p1.z - c.p0.z) + db * (c.p2.z - c.p1.z) + dc * (c.p3.z - c.p2.z);
  return out;
}
const _b = {};

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = []; this.peds = []; this.grid = new Map();
    this.t = 0; this.desired = 60; this.respawnT = 0; this.blink = 0;
    this.occ = new Map();
  }

  // 노선별 투입 가중치 (관리자 모드에서 바꿈)
  routeWeight(R) { return this.weightFn ? this.weightFn(R) : 1; }
  companyOf(R) { return this.companyFn ? this.companyFn(R) : (COMPANY_INFO.find((c) => c.id === R.company) || COMPANY_INFO[0]).name; }
  pickRoute(list) {
    const ws = list.map((R) => Math.max(0, this.routeWeight(R)));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[0];
  }
  init(maxCars, maxPeds) {
    for (let i = 0; i < maxCars; i++) {
      const isBus = i % 7 === 3;
      let spec, opts = {}, R = null;
      if (isBus) {
        R = this.pickRoute(W.routes);
        const T = BUS_TYPES[R.type] || BUS_TYPES.trunk;
        const model = this.modelFn && this.modelFn(R);
        spec = (model && BY_ID[model]) || BY_ID[pick(T.models)] || pick(BUSES);
        opts = { livery: (this.liveryFn && this.liveryFn(R)) || T.livery, route: R.id, dest: R.dest, routeColor: R.color, company: this.companyOf(R), lod: true };
      } else {
        spec = randomCarSpec();
        opts = { color: pick(TRAFFIC_PAINTS), lod: true };
      }
      const obj = buildVehicle(spec, opts);
      obj.group.visible = false;
      this.scene.add(obj.group);
      this.cars.push({
        R, busType: R ? R.type : null, company: opts.company, ri: 0,
        obj, spec, isBus, len: spec.len, wid: spec.wid, active: false, x: 0, z: 0, heading: 0, fx: 0, fz: 1,
        v: 0, link: null, lane: 0, laneF: 0, laneTarget: 0, s: 0, state: 'road', cross: null, next: null, turn: 'S',
        pers: 0.88 + Math.random() * 0.22, stuck: 0, ghost: 0, dwell: 0, served: -1, braking: false, blinkDir: 0, brakeLit: -1, steer: 0,
      });
    }
    for (let i = 0; i < maxPeds; i++) {
      const p = buildPed(Math.random());
      p.visible = false;
      this.scene.add(p);
      this.peds.push({ mesh: p, active: false, mode: 'walk', phase: Math.random() * 6, x: 0, z: 0, fx: 0, fz: 1, v: 0, len: 0.6, wid: 0.7 });
    }
  }

  // ---------- 링크 선택 ----------
  chooseNext(a) {
    const L = a.link;
    if (a.R) {
      const ni = (a.ri + 1) % a.R.links.length;
      const o = a.R.links[ni];
      if (o && o.from === L.to) {
        a.next = o; a.nextRi = ni; a.turn = turnType(L, o);
        a.laneTarget = L.n === 1 ? 0 : a.turn === 'L' || a.turn === 'U' ? 0 : L.n - 1;
        return;
      }
    }
    a.nextRi = -1;
    let outs = L.to.out.filter((o) => o !== L.rev);
    if (!outs.length) outs = L.rev ? [L.rev] : [];
    if (!outs.length) { a.next = null; a.turn = 'S'; return; } // 일방통행 막다른 길
    const weights = outs.map((o) => {
      const t = turnType(L, o);
      let w = t === 'S' ? 0.56 : t === 'U' ? 0.01 : 0.22;
      if (o.edge.kind === 'alley') w *= 0.2;
      if (o.edge.kind === 'ic') w *= 0.35;
      if (o.edge.kind === 'highway') w *= a.isBus ? 0.2 : 0.8;
      if (o.edge.kind === 'mountain' || o.edge.kind === 'coast') w *= 0.6;
      return { o, t, w };
    });
    let r = Math.random() * weights.reduce((s, x) => s + x.w, 0), ch = weights[0];
    for (const x of weights) { r -= x.w; if (r <= 0) { ch = x; break; } }
    a.next = ch.o; a.turn = ch.t;
    const n = L.n;
    if (n === 1) a.laneTarget = 0;
    else if (a.isBus) a.laneTarget = ch.t === 'L' || ch.t === 'U' ? 0 : n - 1;
    else if (ch.t === 'L' || ch.t === 'U') a.laneTarget = 0;
    else if (ch.t === 'R') a.laneTarget = n - 1;
    else a.laneTarget = Math.min(a.lane, L.bus ? n - 2 : n - 1);
  }

  spawnOnLink(a, L, s, lane) {
    if (a.R) { const k = a.R.links.indexOf(L); a.ri = k >= 0 ? k : 0; }
    a.link = L; a.s = s; a.lane = a.laneF = a.laneTarget = lane;
    a.state = 'road'; a.cross = null; a.dwell = 0; a.served = -1; a.stuck = 0; a.ghost = 0;
    a.v = (L.limit / 3.6) * 0.6;
    this.chooseNext(a);
    if (a.isBus) { a.lane = a.laneF = a.laneTarget = L.n - 1; }
    const p = lanePos(L, a.laneF, a.s);
    a.x = p.x; a.z = p.z; a.heading = L.heading;
    a.active = true; a.obj.group.visible = true;
  }

  // 버스: 플레이어 근처를 지나는 같은 유형의 노선으로 배차 (행선판 교체)
  assignRoute(a, px, pz, maxD) {
    const near = W.routes.filter((R) => R.type === a.busType && R.links.some((L) => Math.abs((L.from.x + L.to.x) / 2 - px) + Math.abs((L.from.z + L.to.z) / 2 - pz) < maxD + 100));
    if (!near.length) return false;
    const same = near.filter((R) => this.companyOf(R) === a.company);
    const R = this.pickRoute(same.length && Math.random() < 0.8 ? same : near);
    if (!R || this.routeWeight(R) <= 0) return false;
    if (R !== a.R) { a.R = R; if (a.obj.setSign) a.obj.setSign(R.id, R.dest, R.color); }
    return true;
  }
  placeNear(a, px, pz, cam, minD, maxD) {
    if (a.isBus && a.R && !this.assignRoute(a, px, pz, maxD)) return false;
    for (let tries = 0; tries < 25; tries++) {
      let L = a.isBus && a.R ? a.R.links[Math.floor(Math.random() * a.R.links.length)] : null;
      if (!L) {
        // 플레이어 둘레(링 안)의 아무 점 → 그 근처 도로 (고속도로처럼 길이 드문 곳에서도 차가 생기게)
        const r = minD + Math.random() * (maxD - minD), an = Math.random() * Math.PI * 2;
        const es = edgesNear(px + Math.cos(an) * r, pz + Math.sin(an) * r);
        const ed = es.length ? es[Math.floor(Math.random() * es.length)] : null;
        const ls = ed ? [ed.fwd, ed.bwd].filter(Boolean) : [];
        L = ls.length ? ls[Math.floor(Math.random() * ls.length)] : W.links[Math.floor(Math.random() * W.links.length)];
      }
      if (L.s1 - L.s0 < 6) continue;
      const s = L.s0 + 5 + Math.random() * Math.max(1, L.s1 - L.s0 - 20);
      let lane = Math.floor(Math.random() * L.n);
      if (L.bus && !a.isBus && lane === L.n - 1 && L.n > 1) lane = L.n - 2;
      if (a.isBus) lane = L.n - 1;
      if (a.isBus && !a.R && L.edge.kind === 'highway') continue;
      const p = lanePos(L, lane, s);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < minD || d > maxD) continue;
      if (cam && d < 260) { const dx = p.x - cam.x, dz = p.z - cam.z; if ((dx * cam.fx + dz * cam.fz) / Math.max(1, Math.hypot(dx, dz)) > 0.35) continue; }
      let ok = true;
      for (const o of this.cars) if (o.active && o !== a && Math.hypot(o.x - p.x, o.z - p.z) < 14) { ok = false; break; }
      if (!ok) continue;
      this.spawnOnLink(a, L, s, lane);
      return true;
    }
    return false;
  }

  initialPlace(px, pz, n) {
    let k = 0;
    for (const a of this.cars) { if (k >= n) break; if (this.placeNear(a, px, pz, null, 15, 520)) k++; }
  }

  // ---------- 장애물 탐색 ----------
  rebuildGrid(player, extras) {
    this.grid.clear();
    const put = (o) => { const k = Math.floor(o.x / CELL) + ',' + Math.floor(o.z / CELL); let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(o); };
    for (const a of this.cars) if (a.active) put(a);
    for (const p of this.peds) if (p.active && p.mode === 'crossing') put(p);
    if (player) put(player);
    if (extras) for (const e of extras) put(e);
    this.occ.clear();
    for (const a of this.cars) {
      if (!a.active) continue;
      if (a.state === 'road') { const k = a.link.id * 8 + Math.round(a.laneF); const v = this.occ.get(k); if (v === undefined || a.s < v) this.occ.set(k, a.s - a.len / 2); }
      else { const k = a.next.id * 8 + a.cross.lane; this.occ.set(k, -50); }
    }
  }
  leader(a) {
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading), rx = -fz, rz = fx;
    const cx = a.x + fx * 30, cz = a.z + fz * 30;
    const ci = Math.floor(cx / CELL), cj = Math.floor(cz / CELL);
    let best = 90, bv = 0, who = null;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const l = this.grid.get(i + ',' + j); if (!l) continue;
      for (const o of l) {
        if (o === a) continue;
        const dx = o.x - a.x, dz = o.z - a.z;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > 90) continue;
        const lat = Math.abs(dx * rx + dz * rz);
        if (lat > (o.wid + a.wid) * 0.38 + 0.3) continue;
        const hd = o.fx * fx + o.fz * fz;
        const gap = along - (a.len + o.len) / 2;
        if (hd < -0.3 && gap > 3) continue;
        if (gap < best) { best = gap; bv = Math.max(0, o.v * hd); who = o; }
      }
    }
    return { gap: best, v: bv, who };
  }
  laneFree(a, lane) {
    for (const o of this.cars) {
      if (!o.active || o === a || o.state !== 'road' || o.link !== a.link) continue;
      if (Math.abs(o.laneF - lane) < 0.7 && Math.abs(o.s - a.s) < 9 + a.v * 0.9) return false;
    }
    return true;
  }

  // ---------- 매 프레임 ----------
  update(dt, simT, player, cam, desired, nightF, extras) {
    this.t = simT;
    this.blink = (simT % 0.8) < 0.4;
    this.rebuildGrid(player, extras);
    // 활성 차량 수 조절 + 먼 차 재배치
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = 0.4;
      let active = this.cars.filter((a) => a.active).length;
      for (const a of this.cars) {
        if (!a.active || a.keep) continue;
        const d = Math.hypot(a.x - (player.cx ?? player.x), a.z - (player.cz ?? player.z));
        if (d > 620) {
          if (active > desired) { a.active = false; a.obj.group.visible = false; active--; }
          else this.placeNear(a, player.x, player.z, cam, 150, 520);
        }
      }
      let budget = 3;
      for (const a of this.cars) {
        if (active >= desired || budget <= 0) break;
        if (!a.active) { if (this.placeNear(a, player.cx ?? player.x, player.cz ?? player.z, cam, 140, 520)) { active++; budget--; } }
      }
    }
    for (const a of this.cars) if (a.active) this.step(a, dt, nightF);
    this.updatePeds(dt, simT, player.cx != null ? { ...player, x: player.cx, z: player.cz } : player);
  }

  step(a, dt, nightF) {
    const L = a.link;
    // 버스는 천천히: 시내 최대 40km/h 근처, 고속도로도 70km/h 이하
    let vDes = a.isBus ? (Math.min(L.limit, L.edge.kind === 'highway' ? 110 : 80) / 3.6) * Math.min(1.08, a.pers + 0.06) : (L.limit / 3.6) * a.pers;
    if (this.hazards && L.edge.bumps && this.hazards.bumpAhead(L, a.s, 22 + a.v * 1.5)) vDes = Math.min(vDes, (L.edge.school ? 15 : 20) / 3.6); // 과속방지턱 앞 감속
    if (W.toll && L.edge.kind === 'highway' && Math.abs(a.z - W.toll.z) + Math.abs(a.x - W.toll.x) < 90) vDes = Math.min(vDes, 12);
    let gap = 1e9, lv = 0;
    const ld = a.ghost > 0 ? { gap: 1e9, v: 0 } : this.leader(a);
    gap = ld.gap; lv = ld.v;
    let atLight = false;
    a.ghost = Math.max(0, a.ghost - dt);

    if (a.state === 'road') {
      const toEnd = L.s1 - a.s;
      if (a.turn !== 'S') vDes = Math.min(vDes, 6.5 + Math.max(0, toEnd - 10) * 0.12);
      // 신호
      if (a.s < L.stopS + 0.3) {
        let must = false;
        if (L.to.signal) {
          const st = signalState(L.to, L.axis, this.t);
          const sig = a.turn === 'L' || a.turn === 'U' ? st.l : st.s;
          if (a.turn === 'R') must = false;
          else if (sig === 'R') must = true;
          else if (sig === 'Y') { const dS = L.stopS - a.s - a.len / 2; if (dS > (a.v * a.v) / (2 * 4.0) + 1) must = true; }
        }
        // 교차로 너머가 막혔으면 진입 금지
        if (!must && a.next) {
          const nl = this.nextLane(a);
          const occ = this.occ.get(a.next.id * 8 + nl);
          if (occ !== undefined && occ < a.next.s0 + a.len + 1.5 && L.stopS - a.s < 25) must = true;
        }
        if (must) { const g2 = L.stopS - a.s - a.len / 2; if (g2 < gap) { gap = g2; lv = 0; atLight = true; } }
      }
      // 철도 건널목
      if (L.rail && W.crossDown[L.rail.x] && a.s < L.rail.stopS + 0.5) {
        const g4 = L.rail.stopS - a.s - a.len / 2;
        if (g4 < gap) { gap = g4; lv = 0; atLight = true; }
      }
      // 버스 정류장 정차
      if (a.isBus && L.stop && a.served !== L.id && (!a.R || a.R.stopLinks.has(L.id))) {
        const stopAt = L.stop.s - (a.len / 2 - 0.8);
        const d = stopAt - a.s;
        if (d > -1.5 && d + 2.2 < gap) { gap = d + 2.2; lv = 0; }
        if (d < 1.2 && a.v < 0.6) {
          a.dwell += dt;
          for (const dr of a.obj.doors) dr.target = a.dwell > 0.7 && a.dwell < 4.6 ? 1 : 0;
          if (a.dwell > 5.5) { a.served = L.id; a.dwell = 0; if (a.obj.setRiders) a.obj.setRiders(Math.floor(Math.random() * 15)); }
        }
        if (d < -1.5) a.served = L.id;
      }
      // 차선 변경
      if (a.laneF !== a.laneTarget) {
        const dir = Math.sign(a.laneTarget - a.laneF);
        const onLane = Math.abs(a.laneF - Math.round(a.laneF)) < 1e-6;
        if (onLane && !this.laneFree(a, Math.round(a.laneF) + dir)) { /* 옆 차선이 비길 기다림 */ }
        else {
          a.laneF += dir * dt * 0.5;
          if ((dir > 0 && a.laneF >= a.laneTarget) || (dir < 0 && a.laneF <= a.laneTarget)) a.laneF = a.laneTarget;
        }
        a.blinkDir = a.laneTarget > a.laneF ? 1 : -1;
      } else {
        a.blinkDir = a.turn === 'L' || a.turn === 'U' ? -1 : a.turn === 'R' ? 1 : 0;
        if (a.blinkDir && L.s1 - a.s > 60) a.blinkDir = 0;
        // 추월 차선 변경
        if (!a.isBus && a.turn === 'S' && L.n > 1 && gap < 30 && lv < vDes * 0.6 && L.stopS - a.s > 60 && Math.random() < dt * 0.5) {
          const opts = [a.lane - 1, a.lane + 1].filter((x) => x >= 0 && x < L.n && !(L.bus && x === L.n - 1));
          const t = pick(opts);
          if (t !== undefined && this.laneFree(a, t)) { a.laneTarget = t; }
        }
      }
      a.lane = Math.round(a.laneF);
    } else {
      vDes = Math.min(vDes, a.turn === 'S' ? vDes : 7.5);
    }

    // IDM 가속
    const aMax = a.isBus ? 1.5 : 1.7, bComf = a.isBus ? 2.2 : 2.5, T = 1.3, s0 = 2.2;
    const dv = a.v - lv;
    const sStar = s0 + a.v * T + (a.v * dv) / (2 * Math.sqrt(aMax * bComf));
    let acc = aMax * (1 - Math.pow(a.v / Math.max(vDes, 0.5), 4) - Math.pow(Math.max(sStar, 0) / Math.max(gap, 0.1), 2));
    acc = clamp(acc, -9, aMax);
    a.v = Math.max(0, a.v + acc * dt);
    if (gap < 0.3 && lv < 0.5) a.v = Math.min(a.v, 0.3);
    if (a.dwell > 0) a.v = 0;
    a.braking = acc < -0.6 || (a.v < 0.2 && gap < 6);
    if (a.v < 0.15 && !atLight && a.dwell === 0) { a.stuck += dt; if (a.stuck > 9) { a.ghost = 2.5; a.stuck = 0; } } else a.stuck = 0;

    // 이동
    if (a.state === 'road') {
      a.s += a.v * dt;
      if (a.s >= L.s1) {
        if (!a.next) { a.active = false; a.obj.group.visible = false; return; }
        this.startCross(a);
      }
      else {
        const p = lanePos(L, a.laneF, a.s);
        const latV = a.laneF !== a.laneTarget ? Math.sign(a.laneTarget - a.laneF) * 0.5 * LANE_W : 0;
        a.x = p.x; a.z = p.z;
        a.heading = L.heading - Math.atan2(latV, Math.max(a.v, 2)) * 0.6;
        a.steer = 0;
      }
    }
    if (a.state === 'cross') {
      const c = a.cross;
      c.d += a.v * dt;
      const u = Math.min(1, c.d / c.len);
      bez(c, u, _b);
      a.x = _b.x; a.z = _b.z;
      const nh = Math.atan2(_b.tx, _b.tz);
      let dh = nh - a.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      a.steer = clamp(dh * 8, -0.6, 0.6);
      a.heading = nh;
      if (u >= 1) {
        const N = a.next;
        if (a.R) a.ri = a.nextRi >= 0 ? a.nextRi : Math.max(0, a.R.links.indexOf(N));
        a.link = N; a.s = N.s0 + 1 + (c.d - c.len); a.lane = a.laneF = a.laneTarget = c.lane;
        a.state = 'road'; a.cross = null; a.served = -1;
        this.chooseNext(a);
        if (a.isBus) a.laneTarget = a.turn === 'L' || a.turn === 'U' ? 0 : N.n - 1;
      }
    }
    a.fx = Math.sin(a.heading); a.fz = Math.cos(a.heading);

    // 모델 반영
    const g = a.obj.group;
    let gy = 0, gp = 0;
    {
      const Lk = a.link;
      if (a.state === 'cross') gy = Lk.to.y;
      else if (Lk.y0 || Lk.y1) { gy = linkY(Lk, a.s); gp = -Math.atan((Lk.y1 - Lk.y0) / Lk.len); }
    }
    a.y = gy;
    g.position.set(a.x, gy, a.z);
    g.rotation.order = 'YXZ';
    g.rotation.y = a.heading; g.rotation.x = gp;
    for (const w of a.obj.wheels) {
      w.spin.rotation.x += (a.v / w.r) * dt;
      if (w.front) w.pivot.rotation.y = a.steer;
    }
    if (a.obj.updateDoors) a.obj.updateDoors(dt);
    const lm = a.obj.lights;
    const tail = (nightF > 0.3 ? 0.7 : 0.12) + (a.braking ? 2.2 : 0);
    if (Math.abs(lm.tail.emissiveIntensity - tail) > 0.01) lm.tail.emissiveIntensity = tail;
    const bl = this.blink ? 2.5 : 0;
    lm.indL.emissiveIntensity = a.blinkDir < 0 ? bl : 0;
    lm.indR.emissiveIntensity = a.blinkDir > 0 ? bl : 0;
  }

  nextLane(a) {
    const N = a.next;
    if (a.turn === 'L' || a.turn === 'U') return 0;
    if (a.turn === 'R') return a.isBus ? N.n - 1 : (N.bus && N.n > 1 ? N.n - 2 : N.n - 1);
    let l = Math.min(a.lane, N.n - 1);
    if (a.isBus) l = N.n - 1;
    else if (N.bus && l === N.n - 1 && N.n > 1) l = N.n - 2;
    return l;
  }

  startCross(a) {
    const L = a.link, N = a.next;
    const lane = this.nextLane(a);
    const p0 = { x: a.x, z: a.z };
    const p3 = lanePos(N, lane, N.s0 + 1);
    const dist = Math.hypot(p3.x - p0.x, p3.z - p0.z);
    const k = dist * 0.42 + (a.turn === 'U' ? 8 : 0);
    const c = {
      p0, p3, lane, d: Math.max(0, a.s - L.s1),
      p1: { x: p0.x + L.dir.x * k, z: p0.z + L.dir.z * k },
      p2: { x: p3.x - N.dir.x * k, z: p3.z - N.dir.z * k },
    };
    let len = 0, px = p0.x, pz = p0.z;
    for (let i = 1; i <= 12; i++) { bez(c, i / 12, _b); len += Math.hypot(_b.x - px, _b.z - pz); px = _b.x; pz = _b.z; }
    c.len = Math.max(1, len);
    a.cross = c; a.state = 'cross';
  }

  // ---------- 보행자 ----------
  updatePeds(dt, t, player) {
    if (!this._walkT || this._walkT-- <= 0) {
      this._walkT = 30;
      this._near = W.walks.filter((wk) => { const e = wk.e; const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2; return Math.hypot(mx - player.x, mz - player.z) < 260 + e.len / 2; });
    }
    for (const p of this.peds) {
      if (!p.active || Math.hypot(p.x - player.x, p.z - player.z) > 260) {
        // 플레이어 근처 보도나 횡단보도에 다시 배치
        const near = this._near || [];
        if (!near.length) { p.active = false; p.mesh.visible = false; continue; }
        p.walk = null;
        if (Math.random() < 0.3) this.assignCrosser(p, player);
        if (p.mode !== 'waiting') {
          const wk = pick(near);
          p.mode = 'walk'; p.walk = wk;
          p.pp = wk.s0 + 2 + Math.random() * Math.max(1, wk.s1 - wk.s0 - 4); p.dir = Math.random() < 0.5 ? 1 : -1;
          p.spd = 1.1 + Math.random() * 0.5;
          p.lat = wk.side * (wk.e.hw + 1.2 + Math.random() * 2.2);
        }
        p.active = true; p.mesh.visible = true;
      }
      let moving = true;
      if (p.mode === 'walk' && !p.walk) { p.active = false; p.mesh.visible = false; continue; }
      if (p.mode === 'walk') {
        const wk = p.walk, e = wk.e;
        p.pp += p.dir * p.spd * dt;
        if (p.pp > wk.s1 - 1.5 || p.pp < wk.s0 + 1.5) { p.dir = -p.dir; p.pp = Math.max(wk.s0 + 1.5, Math.min(wk.s1 - 1.5, p.pp)); }
        p.x = e.a.x + e.dir.x * p.pp - e.dir.z * p.lat; p.z = e.a.z + e.dir.z * p.pp + e.dir.x * p.lat;
        p.fx = e.dir.x * p.dir; p.fz = e.dir.z * p.dir; p.v = 0;
      } else {
        const L = p.L;
        const st = signalState(L.to, L.axis, t);
        const ok = st.s === 'R' && st.l === 'R';
        if (p.mode === 'waiting') {
          moving = false;
          if (ok && Math.random() < dt * 2) p.mode = 'crossing';
          p.fx = -L.right.x * p.side; p.fz = -L.right.z * p.side;
        } else if (p.mode === 'crossing') {
          p.lat -= p.side * p.spd * dt * (ok ? 1 : 1.6);
          if (p.lat * p.side < -p.edge) { p.side = -p.side; p.lat = p.edge * p.side; p.mode = 'waiting'; if (Math.random() < 0.4) p.active = false; }
        }
        p.x = L.to.x - L.dir.x * p.back + L.right.x * p.lat;
        p.z = L.to.z - L.dir.z * p.back + L.right.z * p.lat;
        p.v = 0;
      }
      // 플레이어 피하기
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
      if (d < player.len / 2 + 1.2 && player.v > 0.5) { p.x += (dx / d) * 0.8; p.z += (dz / d) * 0.8; if (p.mode === 'walk') p.pp += p.dir * 1.5; }
      p.phase += dt * 7 * (moving ? 1 : 0);
      p.mesh.position.set(p.x, groundY(p.x, p.z) + (p.mode === 'walk' ? 0.15 : 0), p.z);
      p.mesh.rotation.y = Math.atan2(p.fx, p.fz);
      animPed(p.mesh, p.phase, moving);
    }
  }
  assignCrosser(p, player) {
    const ns = (this._sigNodes || (this._sigNodes = W.nodes.filter((n) => n.signal))).filter((n) => Math.hypot(n.x - player.x, n.z - player.z) < 220);
    if (!ns.length) { p.active = false; return; }
    const n = pick(ns), L = pick(n.inc);
    p.mode = 'waiting'; p.L = L;
    p.back = L.len - L.s1 + 2.4;
    p.edge = L.edge.hw + 1.4;
    p.side = Math.random() < 0.5 ? 1 : -1;
    p.lat = p.edge * p.side;
    p.spd = 1.2 + Math.random() * 0.4;
  }
}
