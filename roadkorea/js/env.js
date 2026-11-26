import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';
import { W } from './world.js';
import { AI_HEAD, MAT } from './models.js';

const KEYS = [
  [0, '#04070f', '#0b1222', 0.0],
  [4.5, '#070b18', '#141a2e', 0.0],
  [5.5, '#1b2446', '#7a5670', 0.0],
  [6.3, '#3a5d92', '#f2a66d', 0.6],
  [8, '#3f7fd0', '#a9cdea', 1],
  [12, '#2c6bd0', '#b9d8f2', 1],
  [16.5, '#3a6fbc', '#d9c69c', 1],
  [18.2, '#2e477c', '#f48a4a', 0.7],
  [19.3, '#131b38', '#40364f', 0.1],
  [20.5, '#05080f', '#0d1324', 0],
  [24, '#04070f', '#0b1222', 0],
];
const WEATHER = {
  clear: { name: '맑음', cloud: 0, light: 1, far: 1900, grip: 1 },
  cloudy: { name: '흐림', cloud: 0.6, light: 0.55, far: 1300, grip: 1 },
  rain: { name: '비', cloud: 0.75, light: 0.42, far: 650, grip: 0.82, rain: 1 },
  storm: { name: '폭우', cloud: 0.88, light: 0.25, far: 300, grip: 0.7, rain: 2.2 },
  snow: { name: '눈', cloud: 0.6, light: 0.62, far: 480, grip: 0.55, snow: 1 },
  fog: { name: '안개', cloud: 0.8, light: 0.5, far: 130, grip: 0.95 },
};
export const WEATHER_LIST = Object.entries(WEATHER).map(([id, w]) => ({ id, name: w.name }));
const tmpA = new THREE.Color(), tmpB = new THREE.Color(), grey = new THREE.Color('#9aa3ad'), darkGrey = new THREE.Color('#3b4148');

export class Env {
  constructor(scene, renderer, quality) {
    this.quality = quality;
    this.scene = scene; this.renderer = renderer;
    this.hour = 12; this.weather = 'clear'; this.w = WEATHER.clear;
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality !== 'low';
    const sz = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 900; sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun); scene.add(this.sun.target);

    this.skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, flash: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float flash; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
          vec3 c = mix(hor, top, pow(h, 0.5)); if (d.y < 0.0) c = hor * 0.85;
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 10.0) * 0.22);
          c += vec3(flash);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;

    // 별
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.08;
      sp.set([Math.cos(u) * Math.cos(Math.asin(v)) * 420, v * 420, Math.sin(u) * Math.cos(Math.asin(v)) * 420], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // 비
    const RN = 7000;
    this.rainPos = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 120, y = Math.random() * 45, z = (Math.random() - 0.5) * 120; this.rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.05], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    // 눈
    const SN = 5000;
    this.snowPos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) this.snowPos.set([(Math.random() - 0.5) * 120, Math.random() * 45, (Math.random() - 0.5) * 120], i * 3);
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(ng, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false; this.snow.visible = false;
    scene.add(this.snow);

    scene.fog = new THREE.Fog(0xb9d8f2, 100, 1900);
    this.flash = 0; this.nextFlash = 5; this.onThunder = null;
    this.nightF = 0; this.dayF = 1; this.grip = 1;
    this.base = {};
    for (const k of ['asphalt', 'grass', 'sidewalk']) if (W.mats[k]) this.base[k] = W.mats[k].color.clone();
  }

  setWeather(id) { this.weather = id; this.w = WEATHER[id] || WEATHER.clear; }
  get weatherName() { return this.w.name; }
  timeLabel() {
    const h = this.hour;
    if (h >= 4.5 && h < 6.3) return '새벽';
    if (h >= 6.3 && h < 11) return '아침';
    if (h >= 11 && h < 17) return '낮';
    if (h >= 17 && h < 19.3) return '일몰';
    return '밤';
  }

  update(dt, focus, camPos) {
    const h = this.hour;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1];
    const t = (h - k0[0]) / (k1[0] - k0[0]);
    const cl = this.w.cloud;
    tmpA.set(k0[1]).lerp(tmpB.set(k1[1]), t);
    const top = this.skyU.top.value.copy(tmpA);
    tmpA.set(k0[2]).lerp(tmpB.set(k1[2]), t);
    const hor = this.skyU.hor.value.copy(tmpA);
    const sunA = ((h - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(-Math.cos(sunA), Math.sin(sunA), 0.38).normalize();
    this.dayF = smooth(-0.08, 0.22, sunDir.y);
    this.nightF = 1 - smooth(-0.14, 0.06, sunDir.y);
    const dimGrey = tmpB.copy(grey).multiplyScalar(0.25 + 0.75 * this.dayF);
    top.lerp(dimGrey, cl * 0.85); hor.lerp(dimGrey, cl * 0.7);
    if (this.weather === 'storm') { top.lerp(darkGrey, 0.4 * this.dayF); hor.lerp(darkGrey, 0.3 * this.dayF); }
    this.skyU.sunDir.value.copy(sunDir);
    this.skyU.sunCol.value.setRGB(1, 0.75 + 0.2 * this.dayF, 0.5 + 0.4 * this.dayF).multiplyScalar((1 - cl) * smooth(-0.05, 0.1, sunDir.y));

    // 조명
    const L = this.w.light;
    const moon = sunDir.y < -0.02;
    const ld = moon ? new THREE.Vector3(-sunDir.x, -sunDir.y, sunDir.z).normalize() : sunDir;
    this.sun.color.setRGB(moon ? 0.6 : 1, moon ? 0.7 : 0.88 + 0.12 * this.dayF, moon ? 1 : 0.72 + 0.28 * this.dayF);
    this.sun.intensity = moon ? 0.22 * (1 - cl) + 0.05 : (0.15 + 2.6 * this.dayF) * L;
    this.hemi.intensity = (0.18 + 0.75 * this.dayF) * (0.6 + 0.4 * L) + this.nightF * 0.12;
    this.hemi.color.copy(top).lerp(tmpB.set(0xffffff), 0.5);
    this.hemi.groundColor.set(this.weather === 'snow' ? 0xbfc6cc : 0x4a4436);
    this.sun.position.set(focus.x + ld.x * 400, ld.y * 400, focus.z + ld.z * 400);
    this.sun.target.position.set(focus.x, 0, focus.z);

    // 안개
    const fogC = this.scene.fog.color.copy(hor);
    const far = this.w.far * (this.weather === 'fog' ? 1 : (0.75 + 0.25 * this.dayF)) * (this.quality === 'low' ? 0.55 : this.quality === 'medium' ? 0.8 : 1);
    this.scene.fog.far = far; this.scene.fog.near = Math.min(60, far * 0.08);
    void fogC;
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.material.opacity = this.nightF * (1 - cl);
    this.renderer.toneMappingExposure = 0.95 + 0.1 * this.dayF;

    // 밤 불빛
    const dark = Math.max(this.nightF, this.weather === 'storm' || this.weather === 'fog' ? 0.45 : 0);
    for (const m of W.buildingMats) m.emissiveIntensity = this.nightF * 1.1;
    if (W.lampHeads) W.lampHeads.material.emissiveIntensity = dark * 3;
    AI_HEAD.emissiveIntensity = 0.15 + dark * 3;
    MAT.cabinLight.emissiveIntensity = 0.4 + this.nightF * 1.4;

    // 노면 / 눈
    const snow = this.weather === 'snow';
    const wet = this.w.rain ? 1 : 0;
    if (this.base.asphalt) {
      W.mats.asphalt.color.copy(this.base.asphalt).multiplyScalar(wet ? 0.62 : 1);
      if (snow) W.mats.asphalt.color.lerp(tmpB.set(0xffffff), 0.35);
      W.mats.asphalt.roughness = wet ? 0.35 : 0.9;
      W.mats.asphalt.metalness = wet ? 0.25 : 0;
      W.mats.grass.color.copy(this.base.grass); if (snow) W.mats.grass.color.lerp(tmpB.set(0xffffff), 0.85);
      W.mats.sidewalk.color.copy(this.base.sidewalk); if (snow) W.mats.sidewalk.color.lerp(tmpB.set(0xffffff), 0.6);
      if (W.mats.leaf) W.mats.leaf.color.set(snow ? 0xe8eef0 : 0xffffff);
      W.mats.mountain.color.set(snow ? 0xf0f4f6 : 0xffffff);
      if (snow) W.mats.mountain.color.multiplyScalar(2.2);
    }
    this.grip = this.w.grip;

    // 비 / 눈 입자
    const rain = this.w.rain || 0;
    this.rain.visible = rain > 0;
    if (rain) {
      this.rain.position.set(camPos.x, camPos.y - 15, camPos.z);
      const n = Math.floor((this.rainPos.length / 6) * Math.min(1, rain / 2.2 + 0.3));
      this.rain.geometry.setDrawRange(0, n * 2);
      const sp = 26 * dt;
      for (let j = 0; j < n; j++) {
        const o = j * 6;
        this.rainPos[o + 1] -= sp; this.rainPos[o + 4] -= sp;
        if (this.rainPos[o + 1] < 0) { this.rainPos[o + 1] += 45; this.rainPos[o + 4] += 45; }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.25 + 0.2 * (rain / 2.2);
    }
    this.snow.visible = !!this.w.snow;
    if (this.w.snow) {
      this.snow.position.set(camPos.x, camPos.y - 15, camPos.z);
      const tt = performance.now() * 0.001;
      for (let j = 0; j < this.snowPos.length; j += 3) {
        this.snowPos[j + 1] -= 1.6 * dt;
        this.snowPos[j] += Math.sin(tt + j) * 0.4 * dt;
        if (this.snowPos[j + 1] < 0) this.snowPos[j + 1] += 45;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // 번개
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.weather === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash < 0) { this.flash = 1; this.nextFlash = 6 + Math.random() * 12; if (this.onThunder) setTimeout(() => this.onThunder(), 600 + Math.random() * 1500); }
    }
    this.skyU.flash.value = this.flash * 0.6;
    this.hemi.intensity += this.flash * 2;
  }
}
