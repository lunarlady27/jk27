import * as THREE from 'three';
import { W, lanePos, LANE_W, roadInfoAt } from './world.js';
import { buildPed, animPed, sitPed, holdPed } from './models.js';
import { clamp, angDiff, won } from './util.js';
import { ROUTE_COLORS } from './data.js';

export const MODES = [
  { id: 'free', name: '자유 주행', icon: '🗺️', desc: '넓은 도시를 마음대로 달려요. 새로운 장소를 발견하면 보너스!', veh: 'any' },
  { id: 'bus', name: '버스 운전 모드', icon: '🚌', desc: '진짜 버스기사처럼 노선을 따라 정류장마다 승객을 태우고 내려요.', veh: 'bus' },
  { id: 'car', name: '자동차 운전 모드', icon: '🚗', desc: '내 차를 골라 도심을 달려요. 신호와 차선을 지켜 보세요.', veh: 'car' },
  { id: 'highway', name: '고속도로 주행', icon: '🛣️', desc: '톨게이트 → 휴게소 → IC → 시청까지 고속도로를 달려요.', veh: 'any' },
  { id: 'mountain', name: '산길 주행', icon: '⛰️', desc: '구불구불 산길과 무등터널을 지나는 타임 트라이얼.', veh: 'any' },
  { id: 'parking', name: '주차 연습', icon: '🅿️', desc: '주차 칸(버스는 버스 베이)에 정확히 세우고 Space로 확인해요.', veh: 'any' },
  { id: 'ugparking', name: '지하주차장 주차', icon: '🅿️', desc: '경사로를 내려가 기둥 사이 좁은 칸에 주차해요. 높이제한 2.3m라 승용차만!', veh: 'car' },
  { id: 'stopping', name: '버스 정류장 정차 미션', icon: '🚏', desc: '정류장 5곳에 앞문을 딱 맞춰 정차하세요. 정확도 점수!', veh: 'bus' },
  { id: 'passenger', name: '승객 운송 미션', icon: '👥', desc: '배차 시간을 지키며 승객을 부드럽게 모셔요. 급정거는 승객이 싫어해요.', veh: 'bus' },
];

// 목표 표시 기둥
function makeMarker(color = 0x36d1c4, r = 4) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  cyl.position.y = 15; g.add(cyl);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 12), new THREE.MeshBasicMaterial({ color }));
  cone.rotation.x = Math.PI; cone.position.y = 9; g.add(cone);
  g.userData.cone = cone;
  return g;
}
function bob(m, t) { if (m && m.userData.cone) { m.userData.cone.position.y = 8 + Math.sin(t * 3) * 0.8; m.userData.cone.rotation.y = t; } }

// ===================== 버스 노선 (버스 모드 / 정차 미션 / 승객 운송) =====================
export class BusRouteMission {
  constructor(route, opts = {}) {
    this.route = route; this.opts = opts;
    this.idx = 0; this.onboard = []; this.riders = []; this.state = 'drive';
    this.waitPeds = new Map(); this.walkers = [];
    this.stats = { board: 0, alight: 0, stops: 0, skipped: 0, earned: 0, fines: 0, prec: [], sat: 100 };
    this.boardT = 0; this.stopT = 0; this.bell = false; this.doorFine = 0; this.lastGuide = '';
    this.maxStops = opts.precision ? 5 : route.stops.length;
    this.t = 0; this.schedule = [];
    this.done = false;
  }
  get title() { return this.opts.precision ? '정류장 정차 미션' : this.opts.schedule ? '승객 운송 미션' : '버스 운전 모드'; }
  start(ctx) {
    this.ctx = ctx;
    const R = this.route;
    const L = R.links[0];
    const p = lanePos(L, L.n - 1, L.s0 + 6);
    ctx.placePlayer(p.x, p.z, L.heading);
    const obj = ctx.P.obj;
    if (obj.setSign) obj.setSign(R.id, R.dest, R.color);
    for (const st of R.stops) st.waiting = 1 + Math.floor(Math.random() * 5);
    // 배차 시간표 (평균 22km/h + 정차 25초)
    let t = 0, prev = { x: p.x, z: p.z };
    for (let i = 0; i < this.maxStops; i++) {
      const st = R.stops[i];
      t += Math.hypot(st.door.x - prev.x, st.door.z - prev.z) / (22 / 3.6) + (i ? 25 : 0);
      this.schedule.push(t + 20);
      prev = st.door;
    }
    this.marker = makeMarker(0xffb21a, 3);
    ctx.scene.add(this.marker);
    this.announce(true);
  }
  get stop() { return this.route.stops[this.idx % this.route.stops.length]; }
  announce(first) {
    const st = this.stop, nx = this.route.stops[(this.idx + 1) % this.route.stops.length];
    const msg = `이번 정류장은 ${st.name}입니다.${nx ? ' 다음 정류장은 ' + nx.name + '입니다.' : ''}`;
    this.ctx.audio.speak(msg);
    if (this.ctx.P.obj.setInner) this.ctx.P.obj.setInner(`이번 정류장  ${st.name}`);
    if (!first) this.ctx.audio.chime();
  }
  doorWorld(which) {
    const o = this.ctx.P.obj;
    const lp = which === 'rear' && o.doorPos.rear ? o.doorPos.rear : o.doorPos.front;
    return o.body.localToWorld(lp.clone());
  }
  // ---- 차 안 승객: 앞문으로 들어와 통로를 걸어 빈자리에 앉음 (자리가 없으면 서서 감) ----
  riderIn(rider, mesh) {
    const o = this.ctx.P.obj; if (!o.body) { this.ctx.scene.remove(mesh); return; }
    const free = (o.seatSpots || []).filter((q) => !q.used && q.z < o.spec.len / 2 - 1.9);
    let spot = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    if (spot) spot.used = true;
    const L = o.spec.len, W = o.spec.wid, fz = o.doorPos.front.z;
    const fl = (z) => (o.floorAt ? o.floorAt(z) : 0.4);
    if (!spot) { const z = fz - 1.2 - Math.random() * (L * 0.55); spot = { x: (Math.random() < 0.5 ? 0.5 : -0.5) - 0.06 * Math.sign(Math.random() - 0.5), y: null, z, stand: true }; }
    rider.spot = spot; rider.mesh = mesh;
    this.ctx.scene.remove(mesh); o.body.add(mesh);
    mesh.rotation.set(0, Math.PI / 2, 0);
    mesh.position.set(-W / 2 + 0.35, fl(fz), fz);
    const path = [[0, fz - 0.5], [0, spot.z], [spot.x, spot.z]];
    this.walkers.push({ mesh, mode: 'inside', path, phase: 0, rider });
  }
  riderOut(destIdx) {
    const k = this.riders.findIndex((r) => r.dest === destIdx);
    if (k < 0) return null;
    const r = this.riders[k]; this.riders.splice(k, 1);
    if (r.spot) r.spot.used = false;
    if (r.mesh && r.mesh.parent) r.mesh.parent.remove(r.mesh);
    const w = this.walkers.findIndex((x) => x.rider === r); if (w >= 0) this.walkers.splice(w, 1);
    return r;
  }
  cleanupStop(st) {
    const list = this.waitPeds.get(st.id);
    if (list) { for (const p of list) this.ctx.scene.remove(p.mesh); this.waitPeds.delete(st.id); }
  }
  update(dt, ctx) {
    if (this.done) return;
    this.t += dt;
    const P = ctx.P, sim = P.sim, obj = P.obj;
    const st = this.stop;
    const L = st.link;
    const fd = this.doorWorld('front');
    const dx = fd.x - st.door.x, dz = fd.z - st.door.z;
    const along = dx * L.dir.x + dz * L.dir.z;
    const lat = dx * L.right.x + dz * L.right.z;
    const dist = Math.hypot(dx, dz);
    this.marker.position.set(st.door.x, 0, st.door.z);
    bob(this.marker, this.t);

    // 대기 승객 생성 (가까워지면)
    for (const s of this.route.stops) {
      const d = Math.hypot(s.curb.x - sim.x, s.curb.z - sim.z);
      if (d < 260 && !this.waitPeds.has(s.id) && s.waiting > 0) {
        const list = [];
        for (let i = 0; i < s.waiting; i++) {
          const m = buildPed(Math.random());
          const off = (i - s.waiting / 2) * 0.9;
          m.position.set(s.wait.x + s.link.dir.x * off, 0.17, s.wait.z + s.link.dir.z * off);
          m.rotation.y = Math.atan2(-s.link.right.x, -s.link.right.z);
          ctx.scene.add(m);
          list.push({ mesh: m, phase: Math.random() * 6 });
        }
        this.waitPeds.set(s.id, list);
      } else if (d > 320 && this.waitPeds.has(s.id)) this.cleanupStop(s);
    }

    const front = obj.doors[0], rear = obj.doors[1] || obj.doors[0];
    const kmh = sim.kmh;
    // 하차벨
    const alighting = this.onboard.filter((d) => d === this.idx).length;
    if (!this.bell && alighting > 0 && dist < 220) { this.bell = true; ctx.audio.bell(); ctx.toast('🔔 하차 벨이 울렸어요 — 다음 정류장에 꼭 세워 주세요', 'info'); }
    P.bell = this.bell;
    // 문 열고 주행
    this.doorFine -= dt;
    if ((front.t > 0.2 || rear.t > 0.2) && kmh > 5 && this.doorFine <= 0) { this.doorFine = 6; ctx.fine(100000, '문 열고 주행하면 위험해요!'); this.stats.fines += 100000; this.stats.sat -= 8; }

    const tol = this.opts.precision ? 2.0 : 5.0;
    if (this.state === 'drive') {
      if (kmh < 0.8 && Math.abs(along) < tol && lat > -4.5 && lat < 2.0) {
        this.state = 'stopped'; this.stopT = 0; this.boardT = 0;
        const err = Math.abs(along);
        if (this.opts.precision) {
          const score = Math.round(clamp(100 - err * 40 - Math.max(0, -lat - 1.2) * 20, 0, 100));
          this.stats.prec.push(score);
          ctx.toast(`정차 정확도 ${err.toFixed(2)}m — ${score}점 ${score >= 90 ? '완벽해요! 🎯' : score >= 70 ? '좋아요!' : '조금 더 정확하게!'}`, score >= 70 ? 'good' : 'warn');
        } else ctx.toast(`🚏 ${st.name} 정차! 1: 앞문(승차)  2: 뒷문(하차)`, 'info');
        if (this.opts.schedule) {
          const diff = this.t - this.schedule[this.idx];
          if (Math.abs(diff) > 30) ctx.toast(diff > 0 ? `배차보다 ${Math.round(diff)}초 늦었어요` : `배차보다 ${Math.round(-diff)}초 빨라요`, 'warn');
          else ctx.toast('배차 시간 정확! ⏱️', 'good');
          this.stats.sat += Math.abs(diff) > 30 ? -5 : 3;
        }
      }
      // 통과 판정
      if (along > 14 && Math.abs(lat) < 25) {
        const waiting = st.waiting;
        if (waiting > 0 || alighting > 0) { ctx.fine(200000, `무정차 통과! ${st.name}에 승객이 있었어요`); this.stats.fines += 200000; this.stats.skipped++; this.stats.sat -= 10; this.onboard = this.onboard.map((d) => (d === this.idx ? this.idx + 1 : d)); for (const r of this.riders) if (r.dest === this.idx) r.dest = this.idx + 1; }
        else ctx.toast(`${st.name} — 타고 내릴 승객이 없어 통과`, 'info');
        this.next();
      }
    } else if (this.state === 'stopped') {
      this.stopT += dt;
      if (kmh > 3 && Math.abs(along) > tol + 3) { // 출발해버림
        const left = st.waiting + this.onboard.filter((d) => d === this.idx).length;
        if (left > 0) { ctx.fine(100000, '승객이 다 타거나 내리기 전에 출발했어요'); this.stats.fines += 100000; this.stats.sat -= 8; this.onboard = this.onboard.filter((d) => d !== this.idx); while (this.riderOut(this.idx)); }
        this.serve(true);
        return;
      }
      this.boardT -= dt;
      const list = this.waitPeds.get(st.id) || [];
      if (front.t > 0.9 && st.waiting > 0 && this.boardT <= 0) {
        this.boardT = 1.0;
        st.waiting--;
        const ped = list.pop();
        const dest = Math.min(this.idx + 1 + Math.floor(Math.random() * 5), this.maxStops - 1);
        const rider = { dest, mesh: null, spot: null };
        if (dest > this.idx) { this.onboard.push(dest); this.riders.push(rider); }
        if (ped) this.walkers.push({ mesh: ped.mesh, target: fd.clone(), phase: 0, mode: 'board', rider: dest > this.idx ? rider : null });
        this.stats.board++;
        if (ctx.quest) ctx.quest('pax', 1);
        ctx.audio.beep();
        if (Math.random() < 0.3) ctx.audio.speak(Math.random() < 0.5 ? '환승입니다' : '감사합니다');
        ctx.addMoney(100000, null);
        this.stats.earned += 100000;
      }
      const rearOpen = rear.t > 0.9;
      if (rearOpen && this.boardT <= 0) {
        const k = this.onboard.indexOf(this.idx);
        if (k >= 0) {
          this.onboard.splice(k, 1);
          this.riderOut(this.idx);
          this.boardT = 0.8;
          const rp = this.doorWorld('rear');
          const m = buildPed(Math.random());
          m.position.set(rp.x, 0.2, rp.z);
          ctx.scene.add(m);
          this.walkers.push({ mesh: m, dir: { x: L.right.x, z: L.right.z }, phase: 0, mode: 'alight', t: 0 });
          this.stats.alight++;
          ctx.addMoney(50000, null);
          this.stats.earned += 50000;
        }
      }
      const pending = st.waiting + this.onboard.filter((d) => d === this.idx).length;
      if (pending === 0 && front.t < 0.05 && rear.t < 0.05 && this.stopT > 1.5) this.serve(false);
      else if (pending === 0 && this.stopT > 2 && (front.t > 0.5 || rear.t > 0.5)) ctx.hint('승객이 모두 타고 내렸어요. 문을 닫고(1, 2) 출발하세요');
      else if (st.waiting > 0 && front.t < 0.5) ctx.hint('1: 앞문 열기 (승차)');
      else if (this.onboard.includes(this.idx) && rear.t < 0.5) ctx.hint('2: 뒷문 열기 (하차)');
    }
    // 걸어가는 승객 애니메이션
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      w.phase += dt * 7;
      if (w.mode === 'board') {
        const p = w.mesh.position, tx = w.target.x - p.x, tz = w.target.z - p.z, d = Math.hypot(tx, tz);
        if (d < 0.6) { this.walkers.splice(i, 1); if (w.rider && this.riders.includes(w.rider)) this.riderIn(w.rider, w.mesh); else ctx.scene.remove(w.mesh); continue; }
        p.x += (tx / d) * 1.8 * dt; p.z += (tz / d) * 1.8 * dt; w.mesh.rotation.y = Math.atan2(tx, tz);
      } else if (w.mode === 'inside') {
        // 차 안 통로 걷기 (버스 기준 좌표)
        const o = ctx.P.obj, p = w.mesh.position, tgt = w.path[0];
        const tx = tgt[0] - p.x, tz = tgt[1] - p.z, d = Math.hypot(tx, tz);
        if (d < 0.08) {
          w.path.shift();
          if (!w.path.length) {
            this.walkers.splice(i, 1);
            const sp = w.rider.spot, sc = w.mesh.scale.x;
            if (sp && !sp.stand) { sitPed(w.mesh, true); w.mesh.position.set(sp.x, sp.y - 0.88 * sc, sp.z); w.mesh.rotation.y = 0; }
            else { animPed(w.mesh, 0, false); w.mesh.rotation.y = Math.random() < 0.6 ? Math.PI : Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); holdPed(w.mesh, true); }
            continue;
          }
        } else { const st = Math.min(d, 1.3 * dt); p.x += (tx / d) * st; p.z += (tz / d) * st; w.mesh.rotation.y = Math.atan2(tx, tz); }
        p.y = o.floorAt ? o.floorAt(p.z) : p.y;
      } else {
        w.t += dt; const p = w.mesh.position; p.x += w.dir.x * 1.4 * dt; p.z += w.dir.z * 1.4 * dt; w.mesh.rotation.y = Math.atan2(w.dir.x, w.dir.z);
        if (w.t > 5) { ctx.scene.remove(w.mesh); this.walkers.splice(i, 1); continue; }
      }
      animPed(w.mesh, w.phase, true);
    }
    for (const list of this.waitPeds.values()) for (const p of list) { p.phase += dt; p.mesh.rotation.y += Math.sin(p.phase * 0.5) * 0.002; }

    // 승객 만족도 (급가속/급제동)
    if (this.onboard.length && Math.abs(sim.accel) > 3.2) { this.stats.sat -= dt * 12; if (!this.jerkT || this.t - this.jerkT > 4) { this.jerkT = this.t; ctx.toast('😣 승객들이 휘청였어요! 부드럽게 운전해 주세요', 'warn'); } }
    this.stats.sat = clamp(this.stats.sat, 0, 100);

    // HUD
    const guide = this.guide(ctx);
    const sched = this.opts.schedule && this.schedule[this.idx] !== undefined ? this.t - this.schedule[this.idx] : null;
    ctx.setMission(`
      <div class="m-route" style="background:${this.route.color}">${this.route.id}</div>
      <div class="m-body">
        <div class="m-title">${this.title} · ${this.route.name}</div>
        <div class="m-main">다음 정류장 <b>${st.name}</b> <span class="m-dist">${this.state === 'stopped' ? '정차 중' : Math.max(0, Math.round(-along)) + 'm'}</span></div>
        <div class="m-sub">${guide}</div>
        <div class="m-stats">🧍 대기 ${st.waiting} · 🚌 탑승 ${this.onboard.length} · 정류장 ${this.idx}/${this.maxStops}${this.bell ? ' · <span class="bell">🔔 하차벨</span>' : ''}${sched !== null ? ` · ⏱️ ${sched > 0 ? '+' : ''}${Math.round(sched)}초` : ''}${this.opts.schedule ? ` · 😊 ${Math.round(this.stats.sat)}%` : ''}</div>
      </div>`);
  }
  guide(ctx) {
    const info = ctx.road;
    const R = this.route;
    if (!info || !info.link) return '노선 경로로 돌아가세요 (미니맵의 노선 색 선을 따라가요)';
    const k = R.links.indexOf(info.link);
    if (k < 0) return '노선을 벗어났어요! 미니맵의 노선 색 선으로 돌아가세요';
    if (info.lane !== info.link.n - 1 && info.link.n > 1) {
      const toEnd = info.link.s1 - (info.s || 0);
      const nx = R.links[(k + 1) % R.links.length];
      const cr = info.link.dir.x * nx.dir.z - info.link.dir.z * nx.dir.x;
      if (cr < 0) return `${Math.round(toEnd)}m 앞 교차로에서 ⬅ 좌회전 (1차로로)`;
      return '오른쪽 끝 차로(버스전용차로)로 주행하세요';
    }
    const nx = R.links[(k + 1) % R.links.length];
    const cr = info.link.dir.x * nx.dir.z - info.link.dir.z * nx.dir.x;
    const toEnd = Math.round(info.link.s1 - (info.s || 0));
    return cr < 0 ? `${toEnd}m 앞 교차로에서 ⬅ 좌회전` : cr > 0 ? `${toEnd}m 앞 교차로에서 우회전 ➡` : `${toEnd}m 앞 교차로 ⬆ 직진`;
  }
  serve(departed) {
    const ctx = this.ctx, st = this.stop;
    this.stats.stops++;
    if (!departed && ctx.quest) ctx.quest('stops', 1);
    if (!departed) { ctx.addMoney(300000, `${st.name} 정류장 운행 완료`); this.stats.earned += 300000; }
    st.waiting = 0;
    this.cleanupStop(st);
    this.next();
  }
  next() {
    this.state = 'drive'; this.bell = false;
    this.idx++;
    if (this.idx >= this.maxStops) return this.finish();
    if (this.stop.waiting === 0 && Math.random() < 0.7) this.stop.waiting = 1 + Math.floor(Math.random() * 4);
    this.announce(false);
  }
  finish() {
    const ctx = this.ctx;
    this.done = true;
    let bonus = this.opts.precision ? 0 : 3000000;
    let grade = '';
    if (this.opts.precision) {
      const avg = this.stats.prec.length ? this.stats.prec.reduce((a, b) => a + b, 0) / this.stats.prec.length : 0;
      grade = avg >= 90 ? 'S' : avg >= 75 ? 'A' : avg >= 55 ? 'B' : 'C';
      bonus = { S: 5000000, A: 3000000, B: 1500000, C: 500000 }[grade];
    }
    if (this.opts.schedule) { bonus = Math.round(bonus * (0.4 + this.stats.sat / 100)); grade = this.stats.sat >= 85 ? 'S' : this.stats.sat >= 65 ? 'A' : this.stats.sat >= 45 ? 'B' : 'C'; }
    ctx.addMoney(bonus, '운행 완료 보너스');
    this.stats.earned += bonus;
    ctx.summary({
      title: `${this.title} 완료!`, grade,
      rows: [['노선', this.route.name], ['정차한 정류장', this.stats.stops + '곳'], ['승차 승객', this.stats.board + '명'], ['하차 승객', this.stats.alight + '명'],
        ...(this.opts.precision ? [['평균 정차 정확도', (this.stats.prec.reduce((a, b) => a + b, 0) / Math.max(1, this.stats.prec.length)).toFixed(0) + '점']] : []),
        ...(this.opts.schedule ? [['승객 만족도', Math.round(this.stats.sat) + '%']] : []),
        ['벌금', won(this.stats.fines)], ['번 돈', won(this.stats.earned)]],
    });
  }
  minimap() {
    return { path: this.route.links, color: this.route.color, stops: this.route.stops, current: this.stop, target: this.stop.door };
  }
  dispose(scene) {
    if (this.marker) scene.remove(this.marker);
    for (const st of this.route.stops) { const l = this.waitPeds.get(st.id); if (l) for (const p of l) scene.remove(p.mesh); }
    this.waitPeds.clear();
    for (const w of this.walkers) if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
    for (const r of this.riders) { if (r.mesh && r.mesh.parent) r.mesh.parent.remove(r.mesh); if (r.spot) r.spot.used = false; }
    this.riders = [];
    if (this.ctx && this.ctx.P.obj.setInner) this.ctx.P.obj.setInner('안전운행 · 광주 시내버스');
  }
}

// ===================== 체크포인트 (고속도로 / 산길) =====================
export class CheckpointMission {
  constructor(kind) {
    this.kind = kind; this.idx = 0; this.t = 0; this.done = false;
    if (kind === 'highway') {
      this.title = '고속도로 · 제2순환도로 주행';
      const an = (k) => W.anchorNode[k] || W.anchorNode[k + '@hi'];
      const t = W.toll || { x: an('광산IC@hi').x, z: an('광산IC@hi').z };
      this.cps = [
        { x: t.x, z: t.z, r: 26, name: '광주 톨게이트 통과', reward: 500000 },
        { x: an('산월IC@hi').x, z: an('산월IC@hi').z, r: 40, name: '산월 나들목 (제2순환도로 갈림길)', reward: 800000 },
        { x: an('동림IC@hi').x, z: an('동림IC@hi').z, r: 40, name: '제2순환도로 동림 나들목', reward: 1000000 },
        { x: an('시청').x, z: an('시청').z, r: 40, name: '광주광역시청 도착', reward: 2000000 },
      ];
    } else {
      this.title = '무등산 산길 타임 트라이얼';
      const pts = W.curve.pts;
      this.cps = [];
      for (let i = 40; i < pts.length - 5; i += 70) this.cps.push({ x: pts[i].x, z: pts[i].z, r: 14, name: '산길 체크포인트', reward: 0 });
      const end = pts[pts.length - 1];
      this.cps.push({ x: end.x, z: end.z, r: 18, name: '결승선 · 증심사', reward: 0 });
    }
  }
  start(ctx) {
    this.ctx = ctx;
    const sp = this.kind === 'highway' ? W.spawns.highway : W.spawns.mountain;
    ctx.placePlayer(sp.x, sp.z, sp.heading, sp.level);
    this.marker = makeMarker(this.kind === 'highway' ? 0x36d1c4 : 0xff7a1a, this.cps[0].r * 0.5);
    ctx.scene.add(this.marker);
    ctx.toast(this.kind === 'highway' ? '🛣️ 고속도로 제한속도는 100km/h예요. 첫 목표: 톨게이트!' : '⛰️ 출발! 구불구불한 산길에서는 속도를 줄이세요', 'info');
  }
  update(dt, ctx) {
    if (this.done) return;
    this.t += dt;
    const cp = this.cps[this.idx], sim = ctx.P.sim;
    this.marker.position.set(cp.x, cp.y || 0, cp.z);
    bob(this.marker, this.t);
    const d = Math.hypot(sim.x - cp.x, sim.z - cp.z);
    if (d < cp.r) {
      if (cp.reward) ctx.addMoney(cp.reward, cp.name);
      else ctx.toast(`✅ ${cp.name} · ${this.fmt(this.t)}`, 'good');
      ctx.audio.coin();
      this.idx++;
      if (this.idx >= this.cps.length) return this.finish();
      this.marker.scale.setScalar(this.cps[this.idx].r / this.cps[0].r);
    }
    ctx.setMission(`<div class="m-route" style="background:${this.kind === 'highway' ? '#1e6e3a' : '#a0522d'}">${this.kind === 'highway' ? '🛣️' : '⛰️'}</div>
      <div class="m-body"><div class="m-title">${this.title}</div>
      <div class="m-main">목표: <b>${cp.name}</b> <span class="m-dist">${Math.round(d)}m</span></div>
      <div class="m-stats">체크포인트 ${this.idx}/${this.cps.length} · ⏱️ ${this.fmt(this.t)}</div></div>`);
  }
  fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  finish() {
    this.done = true;
    const ctx = this.ctx;
    let bonus = 3000000;
    let grade = '';
    if (this.kind === 'mountain') {
      bonus = Math.max(500000, Math.round(6000000 - this.t * 20000));
      grade = this.t < 150 ? 'S' : this.t < 200 ? 'A' : this.t < 260 ? 'B' : 'C';
    }
    ctx.addMoney(bonus, '완주 보너스');
    ctx.summary({ title: `${this.title} 완주!`, grade, rows: [['기록', this.fmt(this.t)], ['보너스', won(bonus)]] });
  }
  minimap() { return { target: this.cps[this.idx] }; }
  dispose(scene) { if (this.marker) scene.remove(this.marker); }
}

// ===================== 주차 연습 =====================
export class ParkingMission {
  constructor(kind = 'lot') { this.kind = kind; this.t = 0; this.count = 0; this.done = false; this.hits = 0; this.title = kind === 'ug' ? '지하주차장 주차' : '주차 연습'; }
  start(ctx) {
    this.ctx = ctx;
    this.bus = ctx.P.spec.type === 'bus';
    const sp = this.kind === 'ug' ? W.spawns.ugparking : W.spawns.parking;
    if (this.bus) { const b = W.busBays[0]; ctx.placePlayer(b.x + 25, b.z - 30, Math.PI / 2); }
    else ctx.placePlayer(sp.x, sp.z, sp.heading);
    const mat = new THREE.MeshBasicMaterial({ color: 0x36d1c4, transparent: true, opacity: 0.35, depthWrite: false });
    this.box = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    ctx.scene.add(this.box);
    this.marker = makeMarker(0x36d1c4, 1.5);
    ctx.scene.add(this.marker);
    this.pickSpot();
    ctx.toast(this.kind === 'ug' ? '🅿️ 앞의 경사로로 내려가 지하주차장(B1)의 초록색 칸에 주차하세요' : '🅿️ 초록색 칸에 차를 넣고 멈춘 뒤 Space(사이드 브레이크)를 누르세요', 'info');
  }
  pickSpot() {
    const list = this.bus ? W.busBays : this.kind === 'ug' ? W.ugSpots : W.parkingSpots;
    const sim = this.ctx.P.sim;
    const cand = list.filter((s) => Math.hypot(s.x - sim.x, s.z - sim.z) > 12);
    this.spot = cand[Math.floor(Math.random() * cand.length)] || list[0];
    this.box.scale.set(this.spot.w, 1, this.spot.l);
    this.box.position.set(this.spot.x, (this.spot.y ?? 0.2) + 0.04, this.spot.z);
    this.box.rotation.y = this.spot.heading;
    this.spotT = 0; this.hitsAtStart = this.hits;
  }
  onImpact(v) { if (v > 1) { this.hits++; this.ctx.fine(100000, '쿵! 주변 차량이나 시설물에 부딪혔어요'); } }
  update(dt, ctx) {
    this.t += dt; this.spotT += dt;
    const sim = ctx.P.sim, sp = this.spot;
    this.marker.position.set(sp.x, sp.y ?? 0, sp.z); bob(this.marker, this.t);
    if (this.kind === 'ug') this.marker.scale.set(1, sp.y !== undefined && ctx.P.sim.level === 'ug' ? 0.1 : 1, 1);
    const dx = sim.x - sp.x, dz = sim.z - sp.z;
    const s = Math.sin(sp.heading), c = Math.cos(sp.heading);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ad = Math.abs(angDiff(sim.heading, sp.heading));
    const aligned = ad < 0.14 || Math.abs(ad - Math.PI) < 0.14;
    const inside = Math.abs(lx) < (sp.w - sim.wid) / 2 + 0.3 && Math.abs(lz) < (sp.l - sim.len) / 2 + 0.45;
    const ok = inside && aligned;
    this.box.material.color.set(ok ? 0x2ee06a : 0x36d1c4);
    if (ok && sim.kmh < 0.5 && ctx.input.handbrake) {
      this.count++;
      if (ctx.quest) ctx.quest('park', 1);
      const reward = Math.max(300000, 1200000 - Math.round(this.spotT) * 8000) - (this.hits - this.hitsAtStart) * 100000;
      ctx.addMoney(Math.max(100000, reward), `주차 성공! (${Math.round(this.spotT)}초)`);
      ctx.audio.coin();
      if (this.count >= 5) return this.finish();
      this.pickSpot();
    }
    ctx.setMission(`<div class="m-route" style="background:#1a4fa6">P</div><div class="m-body"><div class="m-title">${this.title}${this.bus ? ' · 버스 베이' : ''}</div>
      <div class="m-main">${ok ? '<b style="color:#2ee06a">칸 안에 들어왔어요! 멈추고 Space</b>' : '초록색 칸으로 이동해 주차하세요'}</div>
      <div class="m-stats">성공 ${this.count}/5 · 각도 ${(Math.min(ad, Math.abs(ad - Math.PI)) * 57.3).toFixed(0)}° · ⏱️ ${Math.round(this.spotT)}초</div></div>`);
  }
  finish() {
    this.done = true;
    this.ctx.summary({ title: '주차 연습 완료!', grade: this.hits === 0 ? 'S' : this.hits < 3 ? 'A' : 'B', rows: [['성공', '5회'], ['총 시간', Math.round(this.t) + '초'], ['충돌', this.hits + '회']] });
  }
  minimap() { return { target: this.spot }; }
  dispose(scene) { scene.remove(this.box); scene.remove(this.marker); }
}

// ===================== 자유 주행 (발견 보상) =====================
export class FreeMission {
  constructor(title = '자유 주행') { this.title = title; this.lastKm = 0; this.done = false; }
  start(ctx) { this.ctx = ctx; this.lastKm = Math.floor(ctx.P.sim.odo / 1000); }
  update(dt, ctx) {
    const km = Math.floor(ctx.P.sim.odo / 1000);
    if (km > this.lastKm) { this.lastKm = km; ctx.addMoney(100000, '1km 주행 보상'); }
    const all = W.landmarks.filter((l) => !l.place);
    const left = all.filter((l) => !ctx.save.visited.includes(l.name));
    ctx.setMission(`<div class="m-route" style="background:#2a8c82">🗺️</div><div class="m-body"><div class="m-title">${this.title}</div>
      <div class="m-main">새로운 장소를 찾아보세요! <span class="m-dist">${all.length - left.length}/${all.length}</span></div>
      <div class="m-stats">${left.slice(0, 3).map((l) => l.name).join(' · ') || '모든 장소를 발견했어요! 🎉'}</div></div>`);
  }
  minimap() { return {}; }
  dispose() {}
}
