// ===================== 라스트 아일랜드 — 3D 그리기 · 지도 =====================
import * as THREE from 'three';
import { SIZE, GUNS, ITEMS } from './sim.js';

const ctex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
// 섬 그림 (바닥 · 지도 공용)
export function paintIsland(I, px = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
  const k = px / SIZE, im = g.createImageData(px, px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const wx = x / k, wz = y / k, L = I.land(wx, wz), n = (Math.sin(wx * 0.9) * Math.cos(wz * 1.1) + Math.sin(wx * 0.23 + wz * 0.31)) * 6;
    let r, gg, b;
    if (L < -2) { const d = Math.min(1, -L / 30); r = 40 - d * 20; gg = 150 - d * 60; b = 200 - d * 30; }
    else if (L < 6) { r = 226 + n; gg = 206 + n; b = 150 + n; }
    else { const h = Math.min(1, L / 100); r = 102 - h * 30 + n; gg = 160 - h * 20 + n; b = 72 - h * 10 + n; }
    const i = (y * px + x) * 4; im.data[i] = r; im.data[i + 1] = gg; im.data[i + 2] = b; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  // 길
  g.strokeStyle = 'rgba(120,100,80,.85)'; g.lineWidth = 4 * k; g.lineCap = 'round';
  for (const [x0, z0, x1, z1] of I.roads) { g.beginPath(); g.moveTo(x0 * k, z0 * k); g.quadraticCurveTo((x0 + x1) / 2 * k + 30, (z0 + z1) / 2 * k - 30, x1 * k, z1 * k); g.stroke(); }
  // 건물 바닥
  for (const b of I.buildings) { g.fillStyle = '#b9ab92'; g.fillRect((b.x - b.w / 2) * k, (b.z - b.d / 2) * k, b.w * k, b.d * k); }
  return c;
}

export class View {
  constructor(el, I) {
    this.el = el; this.I = I;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    r.shadowMap.enabled = true; r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(r.domElement);
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x9fd4ff); s.fog = new THREE.Fog(0x9fd4ff, 70, 220);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a7a5a, 1.2));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 1.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 }); s.add(sun, sun.target);
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
    this.mapCanvas = paintIsland(I, 1024);
    this.build();
    this.models = new Map(); this.lootM = new Map(); this.shotM = []; this.fxs = [];
    this.resize();
  }
  resize() { const w = innerWidth, h = innerHeight; this.r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  dispose() { this.r.dispose(); this.r.domElement.remove(); }
  build() {
    const s = this.scene, I = this.I;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x2a86c0, roughness: 0.25, metalness: 0.1 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(SIZE / 2, -0.3, SIZE / 2); s.add(sea);
    const gt = ctex(this.mapCanvas); gt.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, transparent: true }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(SIZE / 2, 0, SIZE / 2); ground.receiveShadow = true; s.add(ground);
    // 나무
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }), I.trees.length);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.8, 7), new THREE.MeshStandardMaterial({ color: 0x2f7a3a, flatShading: true }), I.trees.length);
    const M = new THREE.Matrix4();
    I.trees.forEach((t, i) => { M.makeScale(t.s, t.s, t.s).setPosition(t.x, 1.2 * t.s, t.z); trunk.setMatrixAt(i, M); M.makeScale(t.s, t.s, t.s).setPosition(t.x, 4.2 * t.s, t.z); crown.setMatrixAt(i, M); });
    trunk.castShadow = crown.castShadow = true; s.add(trunk, crown); this.crown = crown;
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8d92, flatShading: true }), I.rocks.length);
    I.rocks.forEach((r, i) => { M.makeScale(r.r, r.r * 0.75, r.r).setPosition(r.x, r.r * 0.4, r.z); rock.setMatrixAt(i, M); });
    rock.castShadow = true; s.add(rock);
    // 건물
    const wallG = new THREE.BoxGeometry(1, 1, 1);
    this.roofs = [];
    const wm = {};
    for (const b of I.buildings) {
      const mat = wm[b.color] || (wm[b.color] = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85 }));
      for (const w of I.walls) if (w.x0 >= b.x - b.w / 2 - 0.5 && w.x1 <= b.x + b.w / 2 + 0.5 && w.z0 >= b.z - b.d / 2 - 0.5 && w.z1 <= b.z + b.d / 2 + 0.5) {
        const m = new THREE.Mesh(wallG, mat); m.scale.set(w.x1 - w.x0, 3, w.z1 - w.z0); m.position.set((w.x0 + w.x1) / 2, 1.5, (w.z0 + w.z1) / 2); m.castShadow = m.receiveShadow = true; s.add(m);
      }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), new THREE.MeshStandardMaterial({ color: 0x9a7a5a, roughness: 0.9 })); fl.rotation.x = -Math.PI / 2; fl.position.set(b.x, 0.02, b.z); fl.receiveShadow = true; s.add(fl);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.35, b.d + 0.6), new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.7, transparent: true }));
      roof.position.set(b.x, 3.15, b.z); roof.castShadow = true; s.add(roof); this.roofs.push({ m: roof, b });
    }
    // 자기장 벽
    this.zoneM = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x6a3aff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    s.add(this.zoneM);
    this.nextM = new THREE.Mesh(new THREE.RingGeometry(0.995, 1, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    this.nextM.rotation.x = -Math.PI / 2; s.add(this.nextM);
    // 비행기
    const pl = this.planeM = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }), pr = new THREE.MeshStandardMaterial({ color: 0xff5a3a });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 9, 6, 12), pm); body.rotation.x = Math.PI / 2; pl.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 2.6), pm); pl.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 2), pr); tail.position.set(0, 1.6, -5); pl.add(tail);
    s.add(pl);
  }
  makePlayer(p, me) {
    const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
    const hue = (p.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
    const shirt = new THREE.MeshStandardMaterial({ color: me ? 0xffb02e : new THREE.Color(`hsl(${hue},55%,50%)`) }), skin = new THREE.MeshStandardMaterial({ color: 0xe8c0a0 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33 });
    const add = (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; b.add(o); return o; };
    const C = new THREE.CapsuleGeometry(1, 1, 4, 8), S = new THREE.SphereGeometry(1, 14, 10), BX = new THREE.BoxGeometry(1, 1, 1);
    add(C, shirt, 0, 1.0, 0, 0.3, 0.35, 0.24); add(S, skin, 0, 1.68, 0, 0.22, 0.24, 0.22); add(S, dark, 0, 1.78, -0.03, 0.23, 0.13, 0.23);
    for (const x of [-0.14, 0.14]) add(C, dark, x, 0.35, 0, 0.11, 0.22, 0.11);
    const gun = add(BX, dark, 0.22, 1.05, 0.45, 0.1, 0.12, 0.7);
    const vest = add(BX, new THREE.MeshStandardMaterial({ color: 0x3a4a3a }), 0, 1.05, 0, 0.66, 0.5, 0.52); vest.visible = false;
    const chute = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: me ? 0xffb02e : 0x4ab0ff, side: THREE.DoubleSide })); chute.position.y = 4.5; chute.visible = false; g.add(chute);
    // 이름표
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const tex = new THREE.CanvasTexture(cv);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); tag.scale.set(3, 0.75, 1); tag.position.y = 2.6; tag.renderOrder = 9; g.add(tag);
    g.userData = { b, gun, vest, chute, cv, tex, key: '' };
    this.scene.add(g); return g;
  }
  tag(m, p, me) {
    const u = m.userData, key = `${p.name}|${Math.ceil(p.hp / 5)}|${p.armor}`;
    if (u.key === key) return; u.key = key;
    const g = u.cv.getContext('2d'); g.clearRect(0, 0, 256, 64);
    g.font = '800 22px sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(p.name, 128, 22); g.fillStyle = me ? '#ffd23a' : '#fff'; g.fillText(p.name, 128, 22);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(48, 32, 160, 14); g.fillStyle = '#5dffa0'; g.fillRect(50, 34, 156 * Math.max(0, p.hp) / 100, 10);
    if (p.armor) { g.fillStyle = '#7ac6ff'; g.fillRect(50, 48, 156 * p.armor / 100, 5); }
    u.tex.needsUpdate = true;
  }
  render(S, meId, dt, aim) {
    const t = performance.now() / 1000;
    let me = S.players.find((p) => p.id === meId);
    const pov = me && me.state === 'dead' && S.spec ? S.players.find((p) => p.id === S.spec) || me : me;
    // 사람들
    const seen = new Set();
    for (const p of S.players) {
      seen.add(p.id);
      let m = this.models.get(p.id); if (!m) { m = this.makePlayer(p, p.id === meId); this.models.set(p.id, m); }
      m.visible = p.state === 'ground' || p.state === 'chute';
      if (!m.visible) continue;
      const u = m.userData;
      if (u.px === undefined || Math.hypot(p.x - u.px, p.z - u.pz) > 8) { u.px = p.x; u.pz = p.z; }
      const k = Math.min(1, dt * (p.id === meId ? 30 : 14)); u.px += (p.x - u.px) * k; u.pz += (p.z - u.pz) * k;
      m.position.set(u.px, p.state === 'chute' ? Math.max(0, p.y) : 0, u.pz);
      let df = p.face - (u.f ?? p.face); while (df > Math.PI) df -= 6.283; while (df < -Math.PI) df += 6.283; u.f = (u.f ?? p.face) + df * Math.min(1, dt * 16); u.b.rotation.y = u.f;
      u.chute.visible = p.state === 'chute'; u.gun.visible = !!(p.guns && p.guns[p.slot]); u.vest.visible = p.armor > 0;
      const mv = Math.hypot(p.vx || 0, p.vz || 0) > 0.5 || p.moving; u.b.position.y = mv ? Math.abs(Math.sin(t * 12)) * 0.08 : 0;
      this.tag(m, p, p.id === meId);
    }
    for (const [id, m] of this.models) if (!seen.has(id)) { this.scene.remove(m); this.models.delete(id); }
    // 떨어진 물건
    const near = pov ? (L) => Math.abs(L.x - pov.x) < 70 && Math.abs(L.z - pov.z) < 70 : () => true;
    for (const L of S.loot) {
      let m = this.lootM.get(L.id);
      if (L.taken || !near(L)) { if (m) m.visible = false; continue; }
      if (!m) { m = this.lootMesh(L); this.lootM.set(L.id, m); }
      m.visible = true; m.rotation.y = t + L.id; m.position.y = 0.35 + Math.sin(t * 2 + L.id) * 0.08;
    }
    // 총알
    while (this.shotM.length < S.shots.length) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), new THREE.MeshBasicMaterial({ color: 0xffe08a })); this.scene.add(m); this.shotM.push(m); }
    this.shotM.forEach((m, i) => { const s = S.shots[i]; m.visible = !!s; if (!s) return; m.position.set(s.x, 1.05, s.z); m.rotation.y = Math.atan2(s.vx, s.vz); });
    // 자기장
    const Z = S.zone; this.zoneM.visible = !pov || pov.state !== 'plane'; this.zoneM.position.set(Z.x, 20, Z.z); this.zoneM.scale.set(Z.r, 1, Z.r); this.zoneM.material.opacity = 0.18 + Math.sin(t * 2) * 0.04;
    this.nextM.position.set(Z.tx, 0.12, Z.tz); this.nextM.scale.setScalar(Math.max(0.1, Z.tr)); this.nextM.visible = Z.tr < Z.r - 1;
    // 비행기
    const PL = S.plane; this.planeM.visible = PL.t < PL.T; this.planeM.position.set(PL.x, 60, PL.z); this.planeM.rotation.y = Math.atan2(PL.x1 - PL.x0, PL.z1 - PL.z0);
    // 지붕: 안에 있으면 투명
    for (const R of this.roofs) { const inside = pov && Math.abs(pov.x - R.b.x) < R.b.w / 2 + 0.5 && Math.abs(pov.z - R.b.z) < R.b.d / 2 + 0.5; R.m.material.opacity += ((inside ? 0.12 : 1) - R.m.material.opacity) * Math.min(1, dt * 8); }
    // 효과
    for (const f of this.fxs) { f.t -= dt; f.u(f, dt); }
    this.fxs = this.fxs.filter((f) => { if (f.t <= 0) { this.scene.remove(f.o); return false; } return true; });
    // 카메라
    let fx = SIZE / 2, fz = SIZE / 2, h = 34;
    if (pov) { if (pov.state === 'plane') { fx = PL.x; fz = PL.z; h = 110; } else if (pov.state === 'chute') { fx = pov.x; fz = pov.z; h = 40 + pov.y * 0.8; } else { fx = pov.x; fz = pov.z; h = aim && aim.scope ? 44 : 21; } }
    this.cx = this.cx ?? fx; this.cz = this.cz ?? fz; this.ch = this.ch ?? h;
    this.cx += (fx - this.cx) * Math.min(1, dt * 7); this.cz += (fz - this.cz) * Math.min(1, dt * 7); this.ch += (h - this.ch) * Math.min(1, dt * 3);
    this.cam.position.set(this.cx, this.ch, this.cz + this.ch * 0.42); this.cam.lookAt(this.cx, 0, this.cz);
    this.sun.position.set(this.cx + 30, 60, this.cz + 20); this.sun.target.position.set(this.cx, 0, this.cz);
    this.scene.fog.far = this.ch * 5 + 80;
    this.r.render(this.scene, this.cam);
  }
  lootMesh(L) {
    const g = new THREE.Group();
    const col = L.t === 'gun' ? GUNS[L.g].color : L.i.startsWith('vest') ? '#7ac6ff' : '#5dffa0';
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 })); base.position.y = -0.3; g.add(base);
    if (L.t === 'gun') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, L.g === 'sniper' ? 1.3 : L.g === 'pistol' ? 0.45 : 0.9), new THREE.MeshStandardMaterial({ color: 0x2a2d33, emissive: col, emissiveIntensity: 0.25 })); g.add(m); }
    else if (L.i.startsWith('vest')) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.25), new THREE.MeshStandardMaterial({ color: 0x3a5a6a })); g.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.32), new THREE.MeshStandardMaterial({ color: 0xffffff })); g.add(m); const c = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3b3b })); g.add(c); const c2 = c.clone(); c2.scale.set(0.25, 1, 3); g.add(c2); }
    g.position.set(L.x, 0.35, L.z); this.scene.add(g); return g;
  }
  effect(f) {
    const add = (o, t, u) => { this.scene.add(o); this.fxs.push({ o, t, u }); };
    if (f.t === 'hit' || f.t === 'spark') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: f.t === 'hit' ? 0xff4040 : 0xffe08a, transparent: true })); m.position.set(f.x, 1.05, f.z); add(m, 0.15, (q) => { m.material.opacity = q.t / 0.15; m.scale.setScalar(1 + (0.15 - q.t) * 8); }); }
    else if (f.t === 'num') { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48; const g = cv.getContext('2d'); g.font = '900 32px sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.n, 64, 36); g.fillStyle = f.zone ? '#c49aff' : '#fff'; g.fillText(f.n, 64, 36); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })); sp.scale.set(1.8, 0.68, 1); sp.position.set(f.x, 2.4, f.z); sp.renderOrder = 10; add(sp, 0.7, (q, dt) => { sp.position.y += dt * 2; sp.material.opacity = Math.min(1, q.t * 3); }); }
    else if (f.t === 'kill') { for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); const a = i * 0.63; m.position.set(f.x, 1, f.z); add(m, 0.6, (q, dt) => { m.position.x += Math.sin(a) * dt * 4; m.position.z += Math.cos(a) * dt * 4; m.position.y += dt * 3; m.material.opacity = q.t / 0.6; }); } }
  }
}
// 지도 그리기 (큰 지도 · 작은 지도)
export function drawMap(cv, base, S, meId, full, I) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const me = S.players.find((p) => p.id === meId) || { x: SIZE / 2, z: SIZE / 2 };
  let k, ox, oz;
  if (full) { k = Math.min(W, H) / SIZE; ox = (W - SIZE * k) / 2; oz = (H - SIZE * k) / 2; }
  else { k = W / 90; ox = W / 2 - me.x * k; oz = H / 2 - me.z * k; }
  g.save(); g.beginPath(); if (!full) g.arc(W / 2, H / 2, W / 2, 0, 7); else g.rect(0, 0, W, H); g.clip();
  g.fillStyle = '#2a86c0'; g.fillRect(0, 0, W, H);
  g.drawImage(base, ox, oz, SIZE * k, SIZE * k);
  const P = (x, z) => [ox + x * k, oz + z * k];
  // 자기장 (바깥 어둡게)
  const Z = S.zone; const [zx, zz] = P(Z.x, Z.z);
  g.fillStyle = 'rgba(90,40,200,.35)'; g.beginPath(); g.rect(0, 0, W, H); g.arc(zx, zz, Z.r * k, 0, 7, true); g.fill();
  g.strokeStyle = '#a07aff'; g.lineWidth = 2; g.beginPath(); g.arc(zx, zz, Z.r * k, 0, 7); g.stroke();
  if (Z.tr < Z.r - 1) { const [tx, tz] = P(Z.tx, Z.tz); g.strokeStyle = '#fff'; g.setLineDash([6, 4]); g.beginPath(); g.arc(tx, tz, Z.tr * k, 0, 7); g.stroke(); g.setLineDash([]); }
  // 비행기 길
  const PL = S.plane; if (PL.t < PL.T) { const [a, b] = P(PL.x0, PL.z0), [c, d] = P(PL.x1, PL.z1); g.strokeStyle = 'rgba(255,255,255,.7)'; g.setLineDash([8, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.setLineDash([]); const [px, pz] = P(PL.x, PL.z); g.fillStyle = '#fff'; g.font = '18px sans-serif'; g.fillText('✈️', px - 9, pz + 6); }
  if (full && I) { g.font = '800 13px sans-serif'; g.textAlign = 'center'; for (const t of I.towns) { const [x, y] = P(t.x, t.z); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(t.name, x, y); g.fillStyle = '#fff'; g.fillText(t.name, x, y); } }
  // 나
  const [mx, mz] = P(me.x, me.z); g.fillStyle = '#ffd23a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(mx, mz, full ? 6 : 5, 0, 7); g.fill(); g.stroke();
  if (S.drop && full) { const [dx, dz] = P(S.drop.x, S.drop.z); g.strokeStyle = '#ffd23a'; g.lineWidth = 3; g.beginPath(); g.moveTo(dx - 8, dz - 8); g.lineTo(dx + 8, dz + 8); g.moveTo(dx + 8, dz - 8); g.lineTo(dx - 8, dz + 8); g.stroke(); }
  g.restore();
  return { k, ox, oz };
}
export { ITEMS };
