// ===================== 팝 아레나 — 3D 그리기 =====================
import * as THREE from 'three';
import { T, MW, MH, ROWS, HEROES, GEM_SPOT } from './data.js';

const TEAMC = { red: 0xff4d5e, blue: 0x3fa9ff };
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export class View {
  constructor(el) {
    this.el = el;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(r.domElement);
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x7fc8ff);
    s.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.3));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.0); sun.position.set(MW * T / 2 - 20, 50, MH * T / 2 + 30); sun.target.position.set(MW * T / 2, 0, MH * T / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 45, bottom: -45, near: 10, far: 140 }); sun.shadow.bias = -0.0005;
    s.add(sun, sun.target);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    this.camX = MW * T / 2; this.camZ = MH * T / 2;
    this.models = new Map(); this.shotM = new Map(); this.fxs = []; this.lobM = []; this.zoneM = []; this.gemM = [];
    this.buildMap();
    this.resize();
  }
  resize() { const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight; this.r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  dispose() { this.r.dispose(); this.r.domElement.remove(); }
  buildMap() {
    const s = this.scene;
    // 바닥 (체크 무늬 잔디)
    const grass = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#8fd16a' : '#82c55f'; g.fillRect(x * 128, y * 128, 128, 128); } for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(40,90,30,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 5); } });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(MW / 2, MH / 2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW * T, MH * T), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(MW * T / 2, 0, MH * T / 2); ground.receiveShadow = true; s.add(ground);
    // 바깥 (절벽 · 바다)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3da0d8, roughness: 0.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(MW * T / 2, -1.5, MH * T / 2); s.add(sea);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(MW * T + 4, 1.5, MH * T + 4), new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.9 }));
    cliff.position.set(MW * T / 2, -0.76, MH * T / 2); s.add(cliff);
    // 팀 진영 바닥 색
    for (const [team, z0] of [['red', 0], ['blue', MH - 4]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(MW * T - 4, 4 * T - 2), new THREE.MeshBasicMaterial({ color: TEAMC[team], transparent: true, opacity: 0.18, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(MW * T / 2, 0.02, (z0 + 2) * T); s.add(m); }
    // 벽 · 덤불 · 물
    const crate = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#d99a52'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a5a2a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke(); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(5, 5, w - 10, 8); });
    const stone = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},.12)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 16, 0, 7); g.fill(); } g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); });
    const walls = [], bushes = [], water = [];
    ROWS.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === '#') walls.push([x, z]); else if (ch === 'b') bushes.push([x, z]); else if (ch === '~') water.push([x, z]); }));
    const edge = (x, z) => x === 0 || z === 0 || x === MW - 1 || z === MH - 1;
    const wg = new THREE.BoxGeometry(T, 1.8, T);
    const wIn = new THREE.InstancedMesh(wg, new THREE.MeshStandardMaterial({ map: crate, roughness: 0.8 }), walls.length);
    const wEd = new THREE.InstancedMesh(wg, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 }), walls.length);
    let ni = 0, ne = 0; const M = new THREE.Matrix4();
    for (const [x, z] of walls) { M.makeTranslation((x + 0.5) * T, 0.9, (z + 0.5) * T); if (edge(x, z)) wEd.setMatrixAt(ne++, M); else wIn.setMatrixAt(ni++, M); }
    wIn.count = ni; wEd.count = ne; for (const m of [wIn, wEd]) { m.castShadow = m.receiveShadow = true; s.add(m); }
    // 덤불: 공 모양 잎 여러 개
    const leaf = new THREE.IcosahedronGeometry(0.75, 1);
    const bm = new THREE.InstancedMesh(leaf, new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.8, flatShading: true }), bushes.length * 4);
    let bi = 0; for (const [x, z] of bushes) for (let k = 0; k < 4; k++) { const q = new THREE.Matrix4().compose(new THREE.Vector3((x + 0.28 + (k % 2) * 0.44) * T, 0.65 + Math.random() * 0.2, (z + 0.28 + Math.floor(k / 2) * 0.44) * T), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), 0)), new THREE.Vector3(1, 0.9 + Math.random() * 0.3, 1)); bm.setMatrixAt(bi++, q); }
    bm.castShadow = true; s.add(bm); this.bushMat = bm.material;
    const wt = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#38a6e0'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); const y = 10 + i * 22; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 10) * 4); g.stroke(); } });
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping; this.waterTex = wt;
    for (const [x, z] of water) { const m = new THREE.Mesh(new THREE.PlaneGeometry(T, T), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.2, metalness: 0.1 })); m.rotation.x = -Math.PI / 2; m.position.set((x + 0.5) * T, 0.04, (z + 0.5) * T); s.add(m); }
    // 젬 광산
    const mine = new THREE.Group(); mine.position.set(GEM_SPOT.x, 0, GEM_SPOT.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.8 })); base.position.y = 0.25; mine.add(base);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0xc58bff, emissive: 0x7a2bd8, emissiveIntensity: 0.7, roughness: 0.2 })); cr.position.y = 1.0; mine.add(cr); this.mineCrystal = cr;
    s.add(mine);
    // 조준 표시
    this.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.aimLine.rotation.x = -Math.PI / 2; this.aimLine.visible = false; s.add(this.aimLine);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    this.aimRing.rotation.x = -Math.PI / 2; this.aimRing.visible = false; s.add(this.aimRing);
  }
  // ---------- 캐릭터 모델 ----------
  makeHero(p) {
    const H = HEROES[p.hero], col = new THREE.Color(H.color);
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    const mb = mat(col), skin = mat(0xffe0c4), dark = mat(0x26282e), white = mat(0xffffff);
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, par = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; par.add(o); return o; };
    const SPH = new THREE.SphereGeometry(1, 20, 14), BOX = new THREE.BoxGeometry(1, 1, 1), CAP = new THREE.CapsuleGeometry(1, 1, 4, 10);
    add(CAP, mb, 0, 0.62, 0, 0.36, 0.28, 0.32); // 몸
    add(SPH, skin, 0, 1.25, 0, 0.42, 0.4, 0.4); // 큰 머리
    for (const sx of [-0.14, 0.14]) { add(SPH, white, sx, 1.3, 0.34, 0.09, 0.11, 0.06); add(SPH, dark, sx, 1.3, 0.38, 0.05, 0.065, 0.04); }
    for (const sx of [-0.16, 0.16]) add(CAP, dark, sx, 0.18, 0, 0.1, 0.12, 0.1); // 다리
    const hand = add(SPH, skin, 0.36, 0.7, 0.18, 0.11, 0.11, 0.11);
    // 영웅마다 장식
    if (p.hero === 'volt') { add(BOX, mat(0xffe14a, { emissive: 0xffc400, emissiveIntensity: 0.6 }), 0, 1.75, 0, 0.06, 0.35, 0.06); add(SPH, mat(0xffe14a, { emissive: 0xffc400 }), 0, 1.95, 0, 0.1, 0.1, 0.1); add(BOX, dark, 0.38, 0.75, 0.42, 0.12, 0.14, 0.55); }
    if (p.hero === 'punk') { for (let i = 0; i < 5; i++) add(BOX, mat(0xff3d6e), 0, 1.62 + Math.sin(i / 4 * Math.PI) * 0.08, -0.25 + i * 0.12, 0.08, 0.22, 0.1); add(BOX, dark, 0.38, 0.72, 0.4, 0.2, 0.18, 0.6); }
    if (p.hero === 'momo') { add(SPH, mb, 0, 1.38, -0.05, 0.46, 0.38, 0.46); add(BOX, dark, 0.36, 0.78, 0.55, 0.08, 0.1, 1.2); add(SPH, mat(0x9de0ff, { emissive: 0x3fa9ff }), 0.36, 0.86, 0.1, 0.07, 0.07, 0.07); }
    if (p.hero === 'tank') { body.scale.setScalar(1.18); add(SPH, mat(0x8a5a3a), 0.42, 0.72, 0.3, 0.22, 0.22, 0.22); add(SPH, mat(0x8a5a3a), -0.42, 0.72, 0.3, 0.22, 0.22, 0.22); add(BOX, mat(0x4a7a3a), 0, 1.55, 0, 0.5, 0.12, 0.5); }
    if (p.hero === 'lumi') { add(new THREE.ConeGeometry(1, 1, 16), mat(0x5a3ad8), 0, 1.78, 0, 0.4, 0.55, 0.4); add(SPH, mat(0xffd23a, { emissive: 0xffa000, emissiveIntensity: 0.6 }), 0, 2.08, 0, 0.08, 0.08, 0.08); add(SPH, dark, -0.3, 0.7, -0.25, 0.22, 0.22, 0.22); }
    if (p.hero === 'som') { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add(SPH, mat(i % 2 ? 0xffffff : 0xff7ab6), Math.sin(a) * 0.36, 1.58, Math.cos(a) * 0.36, 0.09, 0.07, 0.09); } add(SPH, mat(0xff7ab6, { emissive: 0xff3d9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 0.38, 0.8, 0.35, 0.16, 0.16, 0.16); }
    // 팀 고리
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: TEAMC[p.team], transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    // 이름 · 체력 표
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    tag.scale.set(2.6, 0.81, 1); tag.position.y = 2.6; tag.renderOrder = 10; g.add(tag);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow);
    g.userData = { body, cv, tex, tag, key: '', glow, hand, mats: [] };
    g.traverse((o) => { if (o.isMesh && o.material && o !== ring && o !== glow) g.userData.mats.push(o.material); });
    this.scene.add(g);
    return g;
  }
  drawTag(m, p, isMe) {
    const u = m.userData, H = HEROES[p.hero];
    const key = `${p.name}|${Math.ceil(p.hp / 50)}|${p.team}|${isMe ? Math.floor(p.ammo * 4) : ''}|${p.gems}|${p.superCh >= 1}`;
    if (u.key === key) return; u.key = key;
    const g = u.cv.getContext('2d'); g.clearRect(0, 0, 256, 80);
    g.font = '800 22px sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.65)';
    const nm = (p.gems ? `💎${p.gems} ` : '') + p.name; g.strokeText(nm, 128, 22); g.fillStyle = isMe ? '#ffd23a' : '#fff'; g.fillText(nm, 128, 22);
    const w = 180, x = 38, y = 32;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 3, y - 3, w + 6, 22);
    g.fillStyle = p.team === 'red' ? '#ff4d5e' : '#3fa9ff'; if (isMe) g.fillStyle = '#5dffa0';
    g.fillRect(x, y, w * Math.max(0, p.hp / H.hp), 16);
    g.fillStyle = '#fff'; g.font = '800 14px sans-serif'; g.fillText(String(Math.max(0, Math.ceil(p.hp))), 128, y + 13);
    if (isMe) for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + i * 61, 56, 58, 10); g.fillStyle = '#ffb02e'; g.fillRect(x + i * 61, 56, 58 * Math.max(0, Math.min(1, p.ammo - i)), 10); }
    u.tex.needsUpdate = true;
  }
  // ---------- 매 프레임 ----------
  render(S, meId, myTeam, aim, dt) {
    const t = performance.now() / 1000;
    this.waterTex.offset.x = t * 0.05; this.mineCrystal.rotation.y = t; this.mineCrystal.position.y = 1 + Math.sin(t * 2) * 0.1;
    const seen = new Set();
    let me = null;
    for (const p of S.players) {
      seen.add(p.id);
      let m = this.models.get(p.id);
      if (!m || m.userData.hero !== p.hero || m.userData.team !== p.team) { if (m) this.scene.remove(m); m = this.makeHero(p); m.userData.hero = p.hero; m.userData.team = p.team; this.models.set(p.id, m); }
      if (p.id === meId) me = p;
      const hidden = S.hidden ? S.hidden(p, myTeam) : false;
      m.visible = !p.dead && !hidden;
      const inBush = !p.dead && S.inBush && S.inBush(p);
      for (const mt of m.userData.mats) { mt.transparent = inBush; mt.opacity = inBush ? 0.55 : 1; }
      if (!m.visible) continue;
      // 부드럽게
      const u = m.userData;
      if (u.px === undefined) { u.px = p.x; u.pz = p.z; }
      const k = Math.min(1, dt * (p.id === meId ? 30 : 16));
      u.px += (p.x - u.px) * k; u.pz += (p.z - u.pz) * k;
      m.position.set(u.px, p.y || 0, u.pz);
      let df = p.face - (u.face ?? p.face); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      u.face = (u.face ?? p.face) + df * Math.min(1, dt * 18); u.body.rotation.y = u.face;
      const mv = Math.hypot(p.x - (u.lx ?? p.x), p.z - (u.lz ?? p.z)) / Math.max(dt, 0.001); u.lx = p.x; u.lz = p.z;
      u.body.position.y = mv > 0.5 ? Math.abs(Math.sin(t * 14)) * 0.12 : Math.sin(t * 3) * 0.02;
      u.body.rotation.z = mv > 0.5 ? Math.sin(t * 14) * 0.08 : 0;
      u.glow.material.opacity = p.superCh >= 1 ? 0.55 + Math.sin(t * 6) * 0.3 : 0;
      this.drawTag(m, p, p.id === meId);
    }
    for (const [id, m] of this.models) if (!seen.has(id)) { this.scene.remove(m); this.models.delete(id); }
    // 총알
    const sseen = new Set();
    for (const s of S.shots) {
      sseen.add(s.id);
      let m = this.shotM.get(s.id);
      if (!m) { const c = new THREE.Color(HEROES[s.hero].color); m = new THREE.Mesh(new THREE.SphereGeometry(s.size > 0.4 ? 0.45 : 0.2, 10, 8), new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.4) })); m.userData.x = s.x; m.userData.z = s.z; this.scene.add(m); this.shotM.set(s.id, m); }
      m.userData.x += (s.x - m.userData.x) * 0.6; m.userData.z += (s.z - m.userData.z) * 0.6;
      m.position.set(m.userData.x, 0.8, m.userData.z);
    }
    for (const [id, m] of this.shotM) if (!sseen.has(id)) { this.scene.remove(m); this.shotM.delete(id); }
    // 폭탄 (포물선)
    while (this.lobM.length < S.lobs.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: 0xff5a00, emissiveIntensity: 0.4 })); m.castShadow = true; this.scene.add(m); this.lobM.push(m); }
    this.lobM.forEach((m, i) => { const L = S.lobs[i]; m.visible = !!L; if (!L) return; const k = L.k ?? L.t / L.T; m.position.set(L.x0 + (L.x1 - L.x0) * k, 0.8 + Math.sin(k * Math.PI) * (L.big ? 5 : 3.2), L.z0 + (L.z1 - L.z0) * k); m.scale.setScalar(L.big ? 2 : 1); });
    // 치유 꽃밭
    while (this.zoneM.length < S.zones.length) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.35, depthWrite: false })); m.rotation.x = -Math.PI / 2; this.scene.add(m); this.zoneM.push(m); }
    this.zoneM.forEach((m, i) => { const z = S.zones[i]; m.visible = !!z; if (!z) return; m.position.set(z.x, 0.06, z.z); m.scale.setScalar(z.r * (1 + Math.sin(t * 4) * 0.03)); });
    // 젬
    while (this.gemM.length < S.gems.length) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: 0xc58bff, emissive: 0x9a4bff, emissiveIntensity: 0.8, roughness: 0.2 })); m.castShadow = true; this.scene.add(m); this.gemM.push(m); }
    this.gemM.forEach((m, i) => { const g = S.gems[i]; m.visible = !!g; if (!g) return; m.position.set(g.x, 0.55 + Math.sin(t * 3 + i) * 0.12, g.z); m.rotation.y = t * 2 + i; });
    // 효과
    for (const f of this.fxs) { f.t -= dt; f.upd(f, dt); }
    this.fxs = this.fxs.filter((f) => { if (f.t <= 0) { this.scene.remove(f.o); return false; } return true; });
    // 카메라 (나를 따라감)
    const fx = me ? me.x : MW * T / 2, fz = me ? me.z : MH * T / 2;
    const flip = myTeam === 'blue' ? -1 : 1; // 우리 진영이 화면 아래
    this.camX += (fx - this.camX) * Math.min(1, dt * 6); this.camZ += (fz - this.camZ) * Math.min(1, dt * 6);
    const cz = Math.max(8, Math.min(MH * T - 8, this.camZ));
    this.cam.position.set(Math.max(9, Math.min(MW * T - 9, this.camX)), 21, cz - 11 * flip);
    this.cam.lookAt(this.cam.position.x, 0, cz + 1.5 * flip);
    // 조준 표시
    if (me && !me.dead && aim && aim.on) {
      const H = HEROES[me.hero], A = aim.sup ? H.sup : H.atk;
      const lob = A.kind === 'lob' || A.kind === 'bigbomb' || A.kind === 'leap' || A.kind === 'healzone';
      const R = A.range || (A.radius ? A.radius * 1.5 : 7);
      if (lob) {
        const d = Math.min(R, aim.d ?? R); this.aimLine.visible = false; this.aimRing.visible = true;
        this.aimRing.position.set(me.x + Math.sin(aim.a) * d, 0.06, me.z + Math.cos(aim.a) * d); this.aimRing.scale.setScalar(A.radius || 1.7);
        this.aimRing.material.color.set(aim.sup ? 0xffd23a : 0xffffff);
      } else {
        this.aimRing.visible = false; this.aimLine.visible = true;
        const w = A.kind === 'melee' ? 1.6 : A.n > 3 ? 2.2 : 0.5;
        this.aimLine.scale.set(w, R, 1); this.aimLine.rotation.z = -aim.a + Math.PI; this.aimLine.rotation.order = 'XYZ';
        this.aimLine.rotation.set(-Math.PI / 2, 0, aim.a + Math.PI);
        this.aimLine.position.set(me.x + Math.sin(aim.a) * R / 2, 0.06, me.z + Math.cos(aim.a) * R / 2);
        this.aimLine.material.color.set(aim.sup ? 0xffd23a : 0xffffff);
      }
    } else { this.aimLine.visible = false; this.aimRing.visible = false; }
    this.r.render(this.scene, this.cam);
  }
  // 화면 좌표 → 땅 위 좌표
  ground(sx, sy) {
    const v = new THREE.Vector3((sx / this.r.domElement.clientWidth) * 2 - 1, -(sy / this.r.domElement.clientHeight) * 2 + 1, 0.5).unproject(this.cam);
    const d = v.sub(this.cam.position).normalize(); const t = (0.8 - this.cam.position.y) / d.y;
    return { x: this.cam.position.x + d.x * t, z: this.cam.position.z + d.z * t };
  }
  // ---------- 효과 ----------
  effect(f, S) {
    const add = (o, t, upd) => { this.scene.add(o); this.fxs.push({ o, t, T: t, upd }); };
    if (f.t === 'hit' || f.t === 'spark') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: f.t === 'hit' ? 0xffffff : 0xffd27a, transparent: true }));
      m.position.set(f.x, 0.8, f.z); add(m, 0.18, (q) => { m.scale.setScalar(1 + (0.18 - q.t) * 6); m.material.opacity = q.t / 0.18; });
    } else if (f.t === 'boom') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
      m.position.set(f.x, 0.4, f.z); add(m, 0.45, (q) => { const k = 1 - q.t / 0.45; m.scale.set(f.r * (0.4 + k), f.r * (0.3 + k * 0.5), f.r * (0.4 + k)); m.material.opacity = 0.85 * (1 - k); });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0x5a3a20, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(f.x, 0.05, f.z); ring.scale.setScalar(f.r); add(ring, 1.2, (q) => { ring.material.opacity = q.t / 2.4; });
    } else if (f.t === 'num') {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48; const g = cv.getContext('2d');
      g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; const tx = (f.heal ? '+' : '') + f.n; g.strokeText(tx, 64, 36); g.fillStyle = f.heal ? '#5dffa0' : '#ffffff'; g.fillText(tx, 64, 36);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
      sp.scale.set(1.6, 0.6, 1); sp.position.set(f.x + (Math.random() - 0.5) * 0.6, 2.2, f.z); sp.renderOrder = 12;
      add(sp, 0.8, (q, dt) => { sp.position.y += dt * 1.6; sp.material.opacity = Math.min(1, q.t * 2.5); });
    } else if (f.t === 'ko') {
      for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); const a = i / 8 * Math.PI * 2; m.position.set(f.x, 0.8, f.z); add(m, 0.6, (q, dt) => { m.position.x += Math.sin(a) * dt * 4; m.position.z += Math.cos(a) * dt * 4; m.position.y += dt * 2; m.material.opacity = q.t / 0.6; }); }
    } else if (f.t === 'swing') {
      const m = new THREE.Mesh(new THREE.RingGeometry(f.r * 0.4, f.r, 24, 1, -0.6, 1.2), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = f.a - Math.PI / 2; m.position.set(f.x, 0.5, f.z);
      m.rotation.set(-Math.PI / 2, 0, f.a - Math.PI / 2);
      add(m, 0.18, (q) => { m.material.opacity = q.t / 0.3; });
    } else if (f.t === 'super' || f.t === 'mine' || f.t === 'gem') {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: f.t === 'super' ? 0xffd23a : 0xc58bff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.08, f.z); add(m, 0.5, (q) => { const k = 1 - q.t / 0.5; m.scale.setScalar(0.5 + k * (f.t === 'super' ? 4 : 2)); m.material.opacity = 1 - k; });
    }
  }
}
