// 스마트 크루즈 컨트롤(SCC) · 고속도로 주행 보조(HDA) · 자율주행
// mode 0: 꺼짐 · 1: SCC(설정 속도 + 앞차 거리 유지) · 2: 자율주행(차선 유지 + 길 따라가기 + 신호 정지 + 내비 경로)
import { W, roadInfoAt, lanePos, signalState } from './world.js';
import { clamp, angDiff } from './util.js';

const GAPS = [1.0, 1.4, 1.8, 2.3]; // 차간 시간(초) — 1~4단계

export class AutoDrive {
  constructor() {
    this.mode = 0; this.set = 60; this.gapI = 2; this.lane = 0; this.status = ''; this.lead = null; this.link = null;
    this.hda = true; // 고속도로·자동차전용도로에서 제한속도에 맞춰 설정 속도 자동 조정
    this.autoSpd = true; // 제한속도 자동 맞춤 (+/-로 직접 정하면 꺼짐)
    this.req = 0; this.lcT = 0; this.lcMsg = '';
  }
  get on() { return this.mode > 0; }
  engage(mode, sim, road) {
    this.mode = mode;
    const k = Math.round(sim.kmh / 5) * 5;
    this.autoSpd = mode === 2 ? !this.apManual : (k < 30 || !!(road && (road.kind === 'highway' || road.edge?.elevated)));
    this.set = mode === 2 && this.apManual ? this.apManual : clamp(this.autoSpd ? (road?.limit || 50) : k, 30, 160);
    this.req = 0; this.lcT = 0;
    if (road) this.lane = road.lane;
    this.link = road ? road.link : null;
    this.offT = 0;
  }
  off() { this.mode = 0; this.lead = null; }
  // 자율주행에서도 +/-로 내가 정한 속도로 달림 (Y로 다시 제한속도 따라가기)
  adjust(d) { this.set = clamp(this.set + d, 10, 180); this.autoSpd = false; if (this.mode === 2) this.apManual = this.set; }
  toggleAuto(limit) { this.autoSpd = !this.autoSpd; if (this.autoSpd && limit) this.set = limit; if (this.mode === 2) this.apManual = this.autoSpd ? 0 : this.set; return this.autoSpd; }
  get manual() { return this.mode === 2 && !this.autoSpd; }
  requestLane(d) { if (this.mode === 2) { this.req = d; this.reqT = 6; } }
  cycleGap() { this.gapI = (this.gapI + 1) % GAPS.length; }

  // 앞차 찾기 (같은 방향 · 내 차로 폭 안)
  findLead(sim, P, cars, agents, aim) {
    const fx = Math.sin(aim), fz = Math.cos(aim), rx = -fz, rz = fx;
    let best = null;
    const test = (a, v, len) => {
      const dx = a.x - sim.x, dz = a.z - sim.z;
      const along = dx * fx + dz * fz; if (along < 0 || along > 160) return;
      const lat = dx * rx + dz * rz;
      if (Math.abs(lat) > 1.9 + along * 0.012) return;
      if (a.y !== undefined && Math.abs((a.y || 0) - (P.y || 0)) > 3) return;
      const gap = along - (len + P.len) / 2;
      if (!best || gap < best.gap) best = { gap, v: v * Math.cos(angDiff(aim, a.heading ?? aim)) };
    };
    for (const a of cars) if (a.active) test(a, a.v || 0, a.len);
    for (const a of agents || []) test(a, a.v || a.s / 3.6 || 0, a.len || 4.5);
    return best;
  }

  // 매 프레임: { throttle, brake, steer(null이면 운전자가 조향) }
  update(dt, c) {
    const { sim, P, cars, agents, nav, simT, isBus } = c;
    if (!this.mode) return null;
    const v = Math.max(0, sim.vl);
    const r0 = roadInfoAt(sim.x, sim.z, sim.level === 'hwy' ? 'hwy' : 'surface');
    const road = r0 && r0.link && r0.edge ? r0 : null;
    let steer = null, aim = sim.heading;
    const hwy = !!(road && (road.kind === 'highway' || road.edge.elevated));
    this.onHwy = hwy;
    // 제한속도 자동: 자율주행은 모든 길, SCC는 고속도로·자동차전용도로에서 구간 제한속도를 그대로 유지
    if (road && this.autoSpd && (this.mode === 2 || hwy)) this.set = road.limit;
    let vDes = this.set / 3.6;
    // 고속도로 주행 보조(HDA): 설정 속도가 높아도 구간 제한속도를 넘지 않음
    if (road && this.hda && hwy && !this.manual) vDes = Math.min(vDes, road.limit / 3.6);
    this.lcT = Math.max(0, this.lcT - dt);
    if (this.req && (this.reqT -= dt) <= 0) this.req = 0;
    let blink = 0;
    let obstacle = 1e9, obsV = 0;
    this.status = this.mode === 2 ? '자율주행' : 'SCC';

    if (this.mode === 2) {
      // 현재 링크 · 위치 (교차로 안처럼 도로 판정이 끊기는 곳은 직전 링크를 이어서 씀)
      let L = null, sNow = 0;
      // 중앙선 근처에서 반대 방향 링크로 잡히면 내 진행 방향 링크로 바꿈
      let rl = road ? road.link : null, rs = road ? road.s : 0;
      if (rl && rl.rev && Math.abs(angDiff(rl.heading, sim.heading)) > Math.PI / 2) { rs = rl.len - rs; rl = rl.rev; }
      let useRoad = !!rl;
      if (rl && this.link && rl !== this.link) {
        const exp = this.nextLink(this.link, nav);
        const nearNode = Math.hypot(sim.x - this.link.to.x, sim.z - this.link.to.z) < (this.link.to.r || 12) + 14;
        const onExp = exp && rl === exp;
        if (!onExp && (nearNode || rl.edge === this.link.edge)) useRoad = false; // 교차로 안에서 옆길에 잡히지 않게
        // 갈라지는 연결로와 겹치는 구간: 아직 지금 길 폭 안이면 그대로 (연결로로 새지 않게)
        if (useRoad && !onExp) {
          const K = this.link, e = K.edge, ps = (sim.x - K.from.x) * K.dir.x + (sim.z - K.from.z) * K.dir.z;
          const lat = Math.abs((sim.x - e.a.x) * -e.dir.z + (sim.z - e.a.z) * e.dir.x);
          if (ps > -2 && ps < K.len + 2 && lat < e.hw + 0.5) useRoad = false;
        }
      }
      if (useRoad) { this.offT = 0; L = rl; sNow = rs; if (L !== this.link) { if (!this.link || this.link.n !== L.n) this.lane = rl === road.link ? road.lane : L.n - 1; this.link = L; } }
      else if (this.link) {
        if (!road) this.offT = (this.offT || 0) + dt;
        L = this.link;
        const proj = (K) => (sim.x - K.from.x) * K.dir.x + (sim.z - K.from.z) * K.dir.z;
        sNow = proj(L);
        if (sNow > L.len - 1) { const nx = this.nextLink(L, nav); if (nx) { L = nx; sNow = proj(nx); this.link = nx; this.lane = Math.min(this.lane, nx.n - 1); } }
      }
      if (!L || this.offT > 5) { this.off(); return { lost: '도로를 벗어나서 자율주행을 껐어요' }; }
      {
        if (!Number.isFinite(this.lane)) this.lane = L.n - 1;
        if (!this.manual) vDes = Math.min(vDes, L.limit / 3.6);
        this.lane = clamp(this.lane, 0, L.n - 1);
        const roadS = sNow;
        const next = this.nextLink(L, nav);
        const look = clamp(5 + v * 0.6, 5, 30);
        const turnA = next ? angDiff(L.heading, next.heading) : 0;
        // 회전 전에 미리 차로 바꾸기 (우회전 → 맨 오른쪽, 좌회전 → 맨 왼쪽)
        if (next && L.s1 - roadS < 150 && L.n > 1) { if (turnA < -0.5) this.lane = L.n - 1; else if (turnA > 0.5) this.lane = 0; }
        const ln = !next ? 0 : turnA < -0.5 ? next.n - 1 : turnA > 0.5 ? (next.median >= 1 ? 0 : Math.min(this.lane, next.n - 1)) : Math.min(this.lane, next.n - 1);
        // 차로 변경: 깜빡이 요청 · 느린 앞차 추월 (회전 구간이 아닐 때)
        const toEnd0 = L.s1 - roadS;
        const turnSoon = next && Math.abs(turnA) > 0.5 && toEnd0 < 220;
        if (L.n > 1 && !turnSoon && this.lcT <= 0 && Math.abs(this.laneF - this.lane) < 0.15) {
          let want = 0;
          if (this.req) want = this.req;
          else {
            const ld0 = this.findLead(sim, P, cars, agents, L.heading);
            if (ld0 && ld0.gap < (hwy ? 70 : 40) && ld0.v < Math.min(vDes, L.limit / 3.6) - (hwy ? 4 : 3) && v > 5) want = -1; // 추월은 왼쪽으로
            else if (hwy && this.lane < L.n - 1 && !this.slowAhead(sim, L, this.lane + 1, roadS, cars, vDes)) want = 1; // 추월 후 오른쪽 차로로 복귀
          }
          if (want) {
            const tl = this.lane + want;
            if (tl >= 0 && tl < L.n && this.laneFree(sim, L, tl, roadS, cars, agents)) {
              this.lane = tl; this.lcT = hwy ? 6 : 4; this.blinkT = 3;
              this.lcMsg = this.req ? (want < 0 ? '왼쪽 차로로 변경' : '오른쪽 차로로 변경') : want < 0 ? '앞차 추월' : '주행 차로 복귀';
              this.lastDir = want;
            } else if (this.req) this.lcMsg = '옆 차로에 차가 있어 기다리는 중';
            if (this.req && (this.lane === tl || tl < 0 || tl >= L.n)) this.req = 0;
          }
        }
        if (this.blinkT > 0) { this.blinkT -= dt; blink = this.lastDir; this.status = this.lcMsg; }
        // 따라갈 길: 지금 링크 차로 → 교차로 곡선(베지어) → 다음 링크 차로
        if (!Number.isFinite(this.laneF) || this.laneLink !== L) { this.laneF = this.lane; this.laneLink = L; }
        this.laneF += clamp(this.lane - this.laneF, -0.45 * dt, 0.45 * dt);
        const pts = [];
        for (let ss = Math.min(roadS - 6, L.s1 - 4); ss < L.s1; ss += 4) pts.push(lanePos(L, this.laneF + (this.lane - this.laneF) * clamp((ss - roadS) / 40, 0, 1), ss));
        const P1 = lanePos(L, this.lane, L.s1); pts.push(P1);
        if (next) {
          const P2 = lanePos(next, ln, next.s0);
          const gap = Math.hypot(P2.x - P1.x, P2.z - P1.z);
          const C1 = { x: P1.x + L.dir.x * gap * 0.5, z: P1.z + L.dir.z * gap * 0.5 }, C2 = { x: P2.x - next.dir.x * gap * 0.5, z: P2.z - next.dir.z * gap * 0.5 };
          for (let k = 1; k <= 8; k++) {
            const t = k / 8, u = 1 - t;
            pts.push({ x: u * u * u * P1.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t * t * t * P2.x, z: u * u * u * P1.z + 3 * u * u * t * C1.z + 3 * u * t * t * C2.z + t * t * t * P2.z });
          }
          for (let ss = next.s0 + 4; ss < Math.min(next.s1, next.s0 + 40); ss += 4) pts.push(lanePos(next, ln, ss));
        }
        let bi = 0, bd = 1e9;
        for (let k = 0; k < pts.length; k++) { const d = (pts[k].x - sim.x) ** 2 + (pts[k].z - sim.z) ** 2; if (d < bd) { bd = d; bi = k; } }
        let tp = pts[pts.length - 1], rem = look;
        for (let k = bi; k < pts.length - 1; k++) {
          const sl = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
          if (sl >= rem) { const f = rem / Math.max(1e-6, sl); tp = { x: pts[k].x + (pts[k + 1].x - pts[k].x) * f, z: pts[k].z + (pts[k + 1].z - pts[k].z) * f }; break; }
          rem -= sl;
        }
        // 경로에서 벗어나 있으면 천천히 복귀
        const off = Math.sqrt(bd);
        this.pathOff = off;
        if (off > 2.5) vDes = Math.min(vDes, (off > 6 ? 12 : 25) / 3.6);
        const tAng = Math.atan2(tp.x - sim.x, tp.z - sim.z);
        const err = angDiff(sim.heading, tAng);
        const ld = Math.max(4, Math.hypot(tp.x - sim.x, tp.z - sim.z));
        const delta = Math.atan((2 * sim.wb * Math.sin(err)) / ld);
        const lim = sim.maxSteer / (1 + (v / sim.v0) ** 2);
        steer = clamp(delta / Math.max(0.02, lim), -1, 1);
        aim = tAng;
        // 교차로 회전 감속
        const toEnd = L.s1 - roadS;
        if (next) {
          const turn = Math.abs(angDiff(L.heading, next.heading));
          const vTurn = (turn > 2.0 ? 8 : turn > 1.2 ? 12 : turn > 0.5 ? 18 : 30) * (isBus ? 0.75 : 1);
          if (turn > 0.25 && toEnd < 80) vDes = Math.min(vDes, vTurn / 3.6 + Math.max(0, toEnd - 8) * 0.1);
        }
        // 과속방지턱 앞에서 감속
        if (c.hz && L.edge.bumps && c.hz.bumpAhead(L, roadS, 20 + v * 1.6)) { vDes = Math.min(vDes, (L.edge.school ? 15 : 22) / 3.6); this.status = '과속방지턱 감속'; }
        // 신호등: 빨간불·노란불이면 정지선에서 멈춤
        if (L.to.signal && toEnd < 110) {
          const left = next && angDiff(L.heading, next.heading) > 0.5;
          const st = signalState(L.to, L.axis, simT);
          const col = left ? st.l : st.s;
          const dStop = L.stopS - roadS - P.len / 2 + 1;
          if ((col === 'R' || (col === 'Y' && dStop > v * 1.2)) && dStop > -1) { obstacle = Math.min(obstacle, Math.max(0.1, dStop)); obsV = 0; this.status = '신호 대기'; }
        }
        // 길 끝 (막다른 길): 끝에서 멈추고 자율주행 종료
        if (!next) {
          const dEnd = L.s1 - roadS - P.len / 2;
          obstacle = Math.min(obstacle, Math.max(0.1, dEnd)); obsV = 0; this.status = '길 끝 — 정지';
          if (dEnd < 4 && v < 0.5) { this.off(); return { lost: '🚧 막다른 길이라 멈췄어요. 직접 돌려서 가거나 내비 목적지를 정해 주세요' }; }
        }
        // 건널목
        if (L.rail && W.crossDown[L.rail.x] && L.rail.stopS > roadS) { obstacle = Math.min(obstacle, L.rail.stopS - roadS - P.len / 2); obsV = 0; this.status = '건널목 정지'; }
        // 목적지 도착
        if (nav && nav.active && nav.route && L === nav.route.links[nav.route.links.length - 1]) {
          const dG = nav.route.goalS - roadS;
          if (dG < 60) { obstacle = Math.min(obstacle, Math.max(0.1, dG)); obsV = 0; if (dG < 3 && v < 0.5) { this.off(); return { lost: '🏁 목적지에 도착해서 자율주행을 마쳤어요', done: true }; } }
        }
      }
    }
    // 앞차
    const ld = this.findLead(sim, P, cars, agents, aim);
    this.lead = ld;
    if (ld && ld.gap < obstacle) { obstacle = ld.gap; obsV = Math.max(0, ld.v); }
    // IDM 가속 계획
    const aMax = isBus ? 0.9 : 2.0, bComf = isBus ? 1.6 : 2.6, T = GAPS[this.gapI];
    const dv = v - obsV;
    const sStar = 3 + v * T + (v * dv) / (2 * Math.sqrt(aMax * bComf));
    let acc = aMax * (1 - Math.pow(v / Math.max(vDes, 0.5), 4)) - aMax * Math.pow(Math.max(0, sStar) / Math.max(obstacle, 0.1), 2);
    acc = clamp(acc, -8, aMax);
    let throttle = 0, brake = 0;
    if (acc > 0.05) throttle = clamp(acc / aMax * 0.85 + 0.1, 0, 1);
    else if (acc < -0.25) brake = clamp(-acc / (sim.brakeDecel || 7), 0, 1);
    let hold = false;
    if (v < 0.4 && obstacle < 6) { throttle = 0; brake = 0; hold = true; }
    else if (v < 0.6 && brake > 0) { brake = 0; hold = true; } // 멈춘 상태는 정차 유지(후진 방지)
    if (this.mode === 1 && ld && ld.gap < 40) this.status = 'SCC 앞차 따라가기';
    if (this.mode === 2 && hwy && this.status === '자율주행') this.status = '고속도로 자율주행';
    else if (this.mode === 1 && hwy && this.status === 'SCC') this.status = 'HDA 속도 유지';
    return { throttle, brake, steer, hold, blink };
  }
  // 옆 차로가 비었는지 (뒤 20m · 앞 30m)
  laneFree(sim, L, lane, s, cars, agents) {
    const c = lanePos(L, lane, s);
    for (const a of [...cars, ...(agents || [])]) {
      if (a.active === false || a.x === undefined) continue;
      const dx = a.x - c.x, dz = a.z - c.z;
      const al = dx * L.dir.x + dz * L.dir.z, lat = dx * L.right.x + dz * L.right.z;
      if (Math.abs(lat) < 2.2 && al > -22 && al < 32) return false;
    }
    return true;
  }
  slowAhead(sim, L, lane, s, cars, vDes) {
    const c = lanePos(L, lane, s);
    for (const a of cars) {
      if (!a.active) continue;
      const dx = a.x - c.x, dz = a.z - c.z;
      const al = dx * L.dir.x + dz * L.dir.z, lat = dx * L.right.x + dz * L.right.z;
      if (Math.abs(lat) < 2.2 && al > -22 && al < 90 && (a.v || 0) < vDes - 3) return true;
    }
    return !this.laneFree(sim, L, lane, s, cars, []);
  }
  nextLink(L, nav) {
    if (nav && nav.active && nav.route) {
      const ls = nav.route.links, k = ls.indexOf(L);
      if (k >= 0 && k < ls.length - 1) return ls[k + 1];
    }
    let best = null, bd = 9;
    for (const o of L.to.out) {
      if (o.to === L.from || o.edge === L.edge) continue; // 유턴 안 함
      if (o.edge.kind === 'alley' && L.edge.kind !== 'alley' && L.to.out.length > 2) continue;
      const d = Math.abs(angDiff(L.heading, o.heading)) + (o.edge.name === L.edge.name ? -0.3 : 0) + ((o.edge.t === 'ramp' || o.edge.kind === 'ic') && !(L.edge.t === 'ramp' || L.edge.kind === 'ic') ? 0.8 : 0);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
}
