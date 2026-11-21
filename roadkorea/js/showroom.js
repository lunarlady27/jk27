import * as THREE from 'three';
import { buildVehicle, buildAvatar, ENV } from './models.js';
import { BY_ID } from './data.js';
import { canvasTex } from './util.js';

// 시작 화면용 차량 전시장
const LINEUP = [
  { id: 'zn_90', color: '#121315', a: -1.05, r: 15 },
  { id: 'sr_se6', color: '#79b2de', a: -0.7, r: 15.5 },
  { id: 'st_g', color: '#555b63', a: -0.36, r: 16 },
  { id: 'bm_m3', color: '#1c3a72', a: 0.36, r: 16 },
  { id: 'hb_grandia', color: '#eeeeec', a: 0.7, r: 15.5 },
  { id: 'sr_caravan', color: '#5a1922', a: 1.05, r: 15 },
  { id: 'hb_ionix5', color: '#b5bac0', a: 1.4, r: 14 },
  { id: 'sr_momo', color: '#e3bd2f', a: -1.4, r: 14 },
];

export class Showroom {
  constructor() {
    // 밝은 전시장: 하늘색 바닥 · 흰 벽 · 파란 사선 벽 · 초록 식물 벽 · 천장 조명 레일
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0xdfe7ec);
    s.fog = new THREE.Fog(0xdfe7ec, 45, 110);
    s.add(new THREE.HemisphereLight(0xffffff, 0x8fb8c8, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(10, 24, 16); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
    key.shadow.bias = -0.0004;
    key.shadow.camera.updateProjectionMatrix();
    s.add(key);
    const fill = new THREE.DirectionalLight(0xdff2ff, 0.8); fill.position.set(-14, 10, -6); s.add(fill);
    // 바닥
    const floorM = new THREE.MeshStandardMaterial({ color: 0x5fb9d8, roughness: 0.35, metalness: 0.1, envMap: ENV.map, envMapIntensity: 0.35 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), floorM);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // 회전 무대 (낮은 하늘색 원판)
    this.turn = new THREE.Group(); s.add(this.turn);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.2, 0.25, 72), new THREE.MeshStandardMaterial({ color: 0x74c8e2, roughness: 0.3, metalness: 0.05 }));
    disc.position.y = 0.125; disc.receiveShadow = true; this.turn.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.1, 0.07, 8, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; s.add(ring);
    // 벽: 흰 벽 + 파란 사선 판넬
    const white = new THREE.MeshStandardMaterial({ color: 0xe9eef1, roughness: 0.9 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2b7fc4, roughness: 0.6 });
    const box = (w, h, d, x, y, z, ry, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true; s.add(o); return o; };
    box(80, 18, 1, 0, 9, -26, 0, white);
    box(1, 18, 70, -32, 9, 0, 0, white);
    box(1, 18, 70, 32, 9, 0, 0, white);
    const p1 = box(22, 16, 0.6, -16, 8, -24.9, 0, blue); p1.rotation.z = 0.0;
    const sl = (x, ry) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), blue); g.position.set(x, 10, -24.4); g.rotation.set(0, ry, 0.42); s.add(g); };
    sl(-6, 0); sl(14, 0);
    // 간판 (뒤 벽)
    const signTex = canvasTex(2048, 360, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '900 170px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,.95)'; g.fillText('로드 코리아', w / 2, h / 2 - 20);
      g.font = '700 64px "Noto Sans KR", sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('광주  ·  서울 3D 오픈월드', w / 2, h - 50);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.5), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(-4, 10.5, -24.3); s.add(sign);
    // 식물 벽 (세로 초록 기둥)
    const leafTex = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#2f5f25'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() * 9; g.fillStyle = `hsl(${95 + Math.random() * 30}, ${45 + Math.random() * 25}%, ${18 + Math.random() * 28}%)`; g.beginPath(); g.ellipse(x, y, r, r * 0.55, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    });
    const leafM = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 1 });
    for (const [x, z] of [[-24, -22], [22, -22], [-30.4, -6], [30.4, -6]]) box(3.2, 16, 1.6, x, 8, z, 0, leafM).castShadow = true;
    // 천장 조명 레일
    const rail = new THREE.MeshStandardMaterial({ color: 0x9aa7b0, roughness: 0.5, metalness: 0.4 });
    for (const z of [-10, 2]) {
      box(46, 0.35, 0.35, 0, 15, z, 0, rail);
      for (let x = -18; x <= 18; x += 6) { const sp = box(0.6, 0.9, 0.6, x, 14.4, z, 0, rail); sp.rotation.x = 0.5; }
    }
    for (const [x, z] of [[-10, 6], [10, 6], [0, -14]]) {
      const sp = new THREE.SpotLight(0xffffff, 380, 50, 0.6, 0.6, 1.6);
      sp.position.set(x, 15, z); sp.target.position.set(0, 0, 0); s.add(sp); s.add(sp.target);
    }
    this.cars = [];
    this.featSpec = BY_ID.hb_super_low;
    for (const c of LINEUP) {
      const spec = BY_ID[c.id]; if (!spec) continue;
      const v = buildVehicle(spec, { color: c.color, wheel: 'sport' });
      const x = Math.sin(c.a) * (c.r + 5), z = -Math.cos(c.a) * (c.r + 5) + 4;
      v.group.position.set(x, 0, z);
      v.group.rotation.y = Math.atan2(-x, -(z - 4)) + 0.6 * Math.sign(c.a);
      s.add(v.group);
      this.cars.push(v);
    }
    s.traverse((o) => { if (o.isMesh && o.material !== undefined) { o.castShadow = true; o.receiveShadow = true; } });
    this.t = 0;
  }
  // 가운데 회전 무대: 지금 고른 내 차
  setFeatured(own) {
    const spec = BY_ID[own.id]; if (!spec) return;
    if (this.feat) this.turn.remove(this.feat.group);
    this.feat = buildVehicle(spec, { color: own.color, wheel: own.wheel, plate: own.plate, livery: own.livery, company: own.company, route: spec.type === 'bus' ? '금남55' : undefined, dest: '문화전당 ↔ 영산강', routeColor: '#2a63d4' });
    if (this.feat.setInner) this.feat.setInner('어서 오세요 · 로드 코리아');
    if (this.feat.setRoute) this.feat.setRoute('01', '광천터미널 ↔ 금남로');
    this.feat.group.position.y = 0.25;
    this.feat.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.turn.add(this.feat.group);
    this.featSpec = spec;
    this.placeAvatar();
  }
  setAvatar(opts) {
    if (this.avatar) this.scene.remove(this.avatar);
    this.avatar = buildAvatar(opts);
    this.scene.add(this.avatar);
    this.placeAvatar();
  }
  placeAvatar() {
    if (!this.avatar) return;
    const s = this.featSpec;
    this.avatar.position.set(-(Math.max(s.len / 2, 2.6) + 1.2) * 0.75, 0.25, Math.max(s.len / 2, 2.6) * 0.75 + 1);
    this.avatar.rotation.y = 0.6;
  }
  update(dt, camera) {
    this.t += dt;
    this.turn.rotation.y += dt * 0.18;
    const s = this.featSpec;
    const big = s.len > 7;
    const d = big ? s.len * 1.0 + 4.5 : Math.max(9.5, s.len * 1.55 + 2);
    const a = Math.sin(this.t * 0.07) * (big ? 0.3 : 0.45) - (big ? 0.35 : 0.55);
    camera.position.set(Math.sin(a) * d, big ? s.hei * 0.62 + 0.8 : s.hei * 0.75 + 1.6 + Math.sin(this.t * 0.1) * 0.3, Math.cos(a) * d);
    camera.lookAt(0, s.hei * 0.45, 0);
    if (this.avatar) { this.avatar.rotation.y = 0.6 + Math.sin(this.t * 0.8) * 0.15; }
  }
}
