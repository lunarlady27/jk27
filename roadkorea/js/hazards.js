// 도로 위 위험 요소: 과속방지턱 · 어린이 보호구역 · 포트홀 · 싱크홀
import * as THREE from 'three';
import { W, edgesNear, lanePos } from './roadnet.js';
import { ZONES, toXZ } from './gwangju.js';
import { canvasTex, clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// 결정적 난수 (매번 같은 자리에 방지턱이 생기게)
let seed = 20261117;
const srand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class Hazards {
  constructor() {
    this.bumps = [];     // { x, z, dx, dz, hw, hd, edge, school }
    this.holes = [];     // 포트홀 · 싱크홀 { x, z, r, kind, t, mesh, edge, lane }
    this.obstacles = []; // 교통 AI용 정지 장애물
    this.nextSink = 40;
    this.schoolEdges = new Set();
    this.bgrid = new Map();
  }

  // ---------- 처음 한 번: 방지턱 · 어린이 보호구역 · 포트홀 ----------
  build(scene) {
    this.scene = scene;
    const apt = ZONES.filter((z) => z[0] === 'apt').map((z) => ({ ...toXZ(z[1], z[2]), r: z[3] * 0.42 }));
    const inApt = (x, z) => apt.some((a) => Math.hypot(a.x - x, a.z - z) < a.r);
    const bumpTex = canvasTex(256, 64, (g, w, h) => {
      for (let x = -32; x < w + 32; x += 32) { g.fillStyle = ((x / 32) & 1) ? '#f2c418' : '#f4f4f0'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.lineTo(x - 16, h); g.fill(); }
    });
    bumpTex.wrapS = THREE.RepeatWrapping;
    const bumpMat = new THREE.MeshStandardMaterial({ map: bumpTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const schoolMat = new THREE.MeshStandardMaterial({ color: 0xa8302a, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
    const schoolSign = new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(128, 8); g.lineTo(248, 236); g.lineTo(8, 236); g.closePath(); g.fill();
      g.strokeStyle = '#d42a2a'; g.lineWidth = 14; g.stroke();
      g.fillStyle = '#111'; g.font = '900 40px sans-serif'; g.textAlign = 'center'; g.fillText('어린이', 128, 150); g.fillText('보호구역', 128, 196);
    }) });
    const bumpSign = new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 10); g.lineTo(246, 234); g.lineTo(10, 234); g.closePath(); g.fill();
      g.strokeStyle = '#d42a2a'; g.lineWidth = 16; g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(128, 180, 70, 26, 0, Math.PI, 0); g.fill(); g.fillRect(40, 178, 176, 12);
      g.font = '900 30px sans-serif'; g.textAlign = 'center'; g.fillText('과속방지턱', 128, 120);
    }) });
    const geoBox = new THREE.BoxGeometry(1, 1, 1);
    const bumpMeshes = [], schoolStrips = [], signs = [];
    for (const e of W.edges) {
      if (e.elevated || e.ramp || e.kind === 'highway' || e.kind === 'ic' || e.len < 38) continue;
      const small = e.kind === 'alley' || (e.n === 1 && e.kind === 'city');
      const school = (e.kind === 'city' && e.n <= 2 && inApt((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2) && srand() < 0.35);
      if (!small && !school) continue;
      const s0 = (e.a.r || 8) + 9, s1 = e.len - (e.b.r || 8) - 9;
      if (s1 - s0 < 8) continue;
      if (school) {
        // 어린이 보호구역: 빨간 노면 · 제한속도 30 · 표지판
        this.schoolEdges.add(e); e.school = true; e.limit = 30;
        for (const L of [e.fwd, e.bwd]) if (L) L.limit = 30;
        if (!e.fwd) for (const L of W.links) if (L.edge === e) L.limit = 30;
        schoolStrips.push({ e, s0, s1 });
        const sp = (ss, sg) => { const q = this.ep(e, ss, sg * (e.hw + 1.2)); signs.push({ x: q.x, z: q.z, h: e.heading + (sg > 0 ? 0 : Math.PI), mat: schoolSign }); };
        sp(s0 + 4, 1); sp(s1 - 4, -1);
      }
      const gap = school ? 40 : W.osm ? (e.kind === 'alley' ? 80 : 160) : e.kind === 'alley' ? 45 : 110;
      for (let s = s0 + rnd(5, 20); s < s1; s += gap * (0.8 + srand() * 0.5)) {
        if (!school && srand() < (W.osm ? 0.45 : 0.15)) continue;
        const c = this.ep(e, s, 0);
        // 다른 길과 겹치면 건너뜀
        if (edgesNear(c.x, c.z).some((o) => o !== e && !o.elevated && Math.abs((c.x - o.a.x) * -o.dir.z + (c.z - o.a.z) * o.dir.x) < o.hw + 3 && (c.x - o.a.x) * o.dir.x + (c.z - o.a.z) * o.dir.z > -5 && (c.x - o.a.x) * o.dir.x + (c.z - o.a.z) * o.dir.z < o.len + 5)) continue;
        const b = { x: c.x, z: c.z, dx: e.dir.x, dz: e.dir.z, hw: e.hw - e.shoulder * 0.5, hd: 1.8, edge: e, school };
        this.bumps.push(b); (e.bumps || (e.bumps = [])).push(b);
        const gk = Math.floor(b.x / 50) + ',' + Math.floor(b.z / 50); (this.bgrid.get(gk) || this.bgrid.set(gk, []).get(gk)).push(b);
        bumpMeshes.push(b);
        if (srand() < (W.osm ? 0.2 : 0.5)) { const q = this.ep(e, s - 25, e.hw + 1.2); signs.push({ x: q.x, z: q.z, h: e.heading, mat: bumpSign }); }
      }
    }
    // 방지턱 메쉬 (둥근 언덕 모양 = 납작한 반원기둥)
    const humpGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
    const humps = new THREE.InstancedMesh(humpGeo, bumpMat, Math.max(1, bumpMeshes.length));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    bumpMeshes.forEach((b, i) => {
      q.setFromAxisAngle(up, Math.atan2(b.dx, b.dz));
      M.compose(p.set(b.x, 0.02, b.z), q, sc.set(b.hw * 2, 0.11, b.hd));
      humps.setMatrixAt(i, M);
    });
    humps.count = bumpMeshes.length; humps.receiveShadow = true;
    if (bumpMeshes.length) scene.add(humps);
    // 어린이 보호구역 빨간 노면
    {
      const im = new THREE.InstancedMesh(geoBox, schoolMat, Math.max(1, schoolStrips.length));
      schoolStrips.forEach((z, i) => {
        const len = z.s1 - z.s0, c = this.ep(z.e, (z.s0 + z.s1) / 2, 0);
        q.setFromAxisAngle(up, z.e.heading);
        M.compose(p.set(c.x, 0.035, c.z), q, sc.set(z.e.hw * 2 - 0.4, 0.02, len));
        im.setMatrixAt(i, M);
      });
      im.count = schoolStrips.length; im.receiveShadow = true;
      if (schoolStrips.length) scene.add(im);
    }
    // 표지판 (인스턴스로 한 번에 그림)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.6, roughness: 0.4 });
    const signGeo = new THREE.PlaneGeometry(0.9, 0.9);
    if (signs.length) {
      const poles = new THREE.InstancedMesh(geoBox, poleMat, signs.length);
      signs.forEach((sg, i) => { M.compose(p.set(sg.x, 1.2, sg.z), q.identity(), sc.set(0.08, 2.4, 0.08)); poles.setMatrixAt(i, M); });
      scene.add(poles);
      for (const mat of [schoolSign, bumpSign]) {
        const list = signs.filter((sg) => sg.mat === mat); if (!list.length) continue;
        const im = new THREE.InstancedMesh(signGeo, mat, list.length);
        list.forEach((sg, i) => { q.setFromAxisAngle(up, sg.h + Math.PI); M.compose(p.set(sg.x, 2.5, sg.z), q, sc.set(1, 1, 1)); im.setMatrixAt(i, M); });
        scene.add(im);
      }
    }
    // 포트홀: 오래된 길에 작은 구멍 (덜컹)
    this.holeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const cand = W.links.filter((L) => !L.edge.elevated && !L.edge.ramp && (L.edge.kind === 'city' || L.edge.kind === 'rural' || L.edge.kind === 'industrial' || L.edge.kind === 'alley') && L.s1 - L.s0 > 40);
    for (let i = 0; i < 140 && cand.length; i++) {
      const L = cand[Math.floor(srand() * cand.length)];
      const lane = Math.floor(srand() * L.n), s = L.s0 + 10 + srand() * (L.s1 - L.s0 - 20);
      const c = lanePos(L, lane, s);
      this.addHole(c.x + rnd(-0.6, 0.6), c.z + rnd(-0.6, 0.6), rnd(0.35, 0.6), 'pot', L, lane, s);
    }
    // 싱크홀 공사 꼬깔 재료
    this.coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 });
    this.coneGeo = new THREE.ConeGeometry(0.22, 0.7, 10);
    this.stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    this.barrierMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g, w, h) => { for (let x = -32; x < w + 32; x += 32) { g.fillStyle = ((x / 32) & 1) ? '#d42a2a' : '#ffffff'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.lineTo(x - 16, h); g.fill(); } }), roughness: 0.7 });
  }
  ep(e, s, lat) { return { x: e.a.x + e.dir.x * s - e.dir.z * lat, z: e.a.z + e.dir.z * s + e.dir.x * lat }; }

  addHole(x, z, r, kind, L, lane, s) {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r, kind === 'sink' ? 20 : 9), this.holeMat);
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.04; g.add(hole);
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r * (kind === 'sink' ? 1.35 : 1.25), kind === 'sink' ? 20 : 9), this.rimMat);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.035; g.add(rim);
    if (kind === 'sink') {
      // 깊어 보이게: 안쪽 벽
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 2.5, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 1, side: THREE.BackSide }));
      wall.position.y = -1.2; g.add(wall);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
    const h = { x, z, r, kind, t: 0, mesh: g, L, lane, s, cones: null };
    this.holes.push(h);
    return h;
  }

  // ---------- 싱크홀 발생 (플레이어 근처 길 위) ----------
  spawnSink(px, pz, toast, nav) {
    const cand = W.links.filter((L) => !L.edge.elevated && !L.edge.ramp && L.edge.kind === 'city' && L.s1 - L.s0 > 70 && L.n >= 1 && Math.hypot(L.from.x + L.dir.x * L.len / 2 - px, L.from.z + L.dir.z * L.len / 2 - pz) < 700 && Math.hypot(L.from.x + L.dir.x * L.len / 2 - px, L.from.z + L.dir.z * L.len / 2 - pz) > 180);
    if (!cand.length) return;
    const L = cand[Math.floor(Math.random() * cand.length)];
    const lane = L.n > 1 ? L.n - 1 : 0, s = L.s0 + 25 + Math.random() * (L.s1 - L.s0 - 50);
    const c = lanePos(L, lane, s);
    const h = this.addHole(c.x, c.z, rnd(1.4, 2.2), 'sink', L, lane, s);
    h.life = rnd(420, 720); // 게임 속 7~12분 뒤 복구
    // 꼬깔 · 바리케이드
    const cg = new THREE.Group();
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = h.r + 1.6;
      const cone = new THREE.Mesh(this.coneGeo, this.coneMat); cone.position.set(Math.sin(a) * rr, 0.35, Math.cos(a) * rr); cone.castShadow = true; cg.add(cone);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.15), this.barrierMat);
    bar.position.set(-L.dir.x * (h.r + 6), 0.7, -L.dir.z * (h.r + 6)); bar.rotation.y = L.heading + Math.PI / 2; cg.add(bar);
    cg.position.set(c.x, 0, c.z); this.scene.add(cg); h.cones = cg;
    const name = L.edge.name || '도로';
    toast(`⚠️ 긴급: <b>${name}</b>에 싱크홀이 생겼어요! 해당 차로를 피해 가세요`, 'warn', 5000);
    if (nav && nav.active) nav.say?.(`전방 ${name}에 싱크홀이 발생했습니다. 주의하세요.`);
    this.lastSinkName = name;
  }

  // ---------- 매 프레임 ----------
  update(dt, simDt, px, pz, toast, nav) {
    this.nextSink -= simDt;
    if (this.nextSink <= 0) { this.nextSink = rnd(240, 480); if (this.holes.filter((h) => h.kind === 'sink').length < 3) this.spawnSink(px, pz, toast, nav); }
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      if (h.kind !== 'sink') continue;
      h.life -= simDt;
      if (h.life <= 0) {
        this.scene.remove(h.mesh); if (h.cones) this.scene.remove(h.cones);
        this.holes.splice(i, 1);
        toast(`🚧 ${h.L.edge.name || '도로'} 싱크홀 복구가 끝났어요`, 'info', 2500);
      }
    }
    // 교통 AI 장애물 (싱크홀은 멈춰 선 차처럼 취급 → 뒤에서 멈추거나 차로 변경)
    this.obstacles.length = 0;
    for (const h of this.holes) if (h.kind === 'sink') this.obstacles.push({ x: h.x, z: h.z, fx: 0, fz: 0, v: 0, len: h.r * 2 + 3, wid: h.r * 2 + 1, heading: 0, active: true, hazard: true });
  }

  // 플레이어 차가 밟고 있는 것
  check(x, z, kmh) {
    for (const b of this.bgrid.get(Math.floor(x / 50) + ',' + Math.floor(z / 50)) || []) {
      const dx = x - b.x, dz = z - b.z;
      const al = dx * b.dx + dz * b.dz, lat = dx * -b.dz + dz * b.dx;
      if (Math.abs(al) < b.hd && Math.abs(lat) < b.hw) return { kind: 'bump', school: b.school };
    }
    for (const h of this.holes) if (Math.hypot(x - h.x, z - h.z) < h.r * (h.kind === 'sink' ? 0.9 : 1.1)) return { kind: h.kind, h };
    void kmh;
    return null;
  }
  // 교통 AI: 링크 위 앞쪽에 방지턱이 있으면 감속
  bumpAhead(L, s, dist) {
    const e = L.edge;
    if (!e.bumps) return false;
    for (const b of e.bumps) {
      const bs = (b.x - L.from.x) * L.dir.x + (b.z - L.from.z) * L.dir.z;
      if (bs > s && bs - s < dist) return true;
    }
    return false;
  }
  isSchool(e) { return !!(e && e.school); }
}
export { clamp };
