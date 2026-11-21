import * as THREE from 'three';
import { GEO, mx, Merger, clamp, smooth, canvasTex, roundRect } from './util.js';
import { LIVERY_BY_ID } from './data.js';

// ===== 공용 재질 =====
export const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x18222a, metalness: 0.4, roughness: 0.05, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  doorGlass: new THREE.MeshStandardMaterial({ color: 0x1b252b, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  black: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.75, metalness: 0.1 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.45, metalness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.18, metalness: 1 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.9 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.95 }),
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0x9aa8b6, metalness: 1, roughness: 0.04 }),
  busFloor: new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.95 }),
  busCeil: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.9, side: THREE.DoubleSide }),
  pole: new THREE.MeshStandardMaterial({ color: 0x1f5fe0, roughness: 0.3, metalness: 0.35 }),
  strap: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }),
  handle: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }),
  bell: new THREE.MeshStandardMaterial({ color: 0xd9221c, roughness: 0.4, emissive: 0x400000 }),
  seatBlue: new THREE.MeshStandardMaterial({ color: 0x3a56a0, roughness: 0.95 }),
  seatPink: new THREE.MeshStandardMaterial({ color: 0xe0628a, roughness: 0.95 }),
  seatOrange: new THREE.MeshStandardMaterial({ color: 0xe0782c, roughness: 0.95 }),
  under: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.95 }),
  grey: new THREE.MeshStandardMaterial({ color: 0xc9cdd1, roughness: 0.5, metalness: 0.3 }),
  cabinLight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 0.6 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x22dd77, emissiveIntensity: 0.8 }),
};
// 밤에 AI 차량 전조등이 함께 켜지도록 공유
export const AI_HEAD = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff3d6, emissiveIntensity: 0.15, roughness: 0.2 });

// 반사(환경맵) — main에서 렌더러가 만들어지면 채워 넣음
export const ENV = { map: null };
const paintCache = new Map();
export function paintMat(hex) {
  if (!paintCache.has(hex)) {
    const m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMap: ENV.map, envMapIntensity: 1.1 });
    paintCache.set(hex, m);
  }
  return paintCache.get(hex);
}
export function applyEnv(map) {
  ENV.map = map;
  for (const m of paintCache.values()) { m.envMap = map; m.needsUpdate = true; }
  for (const k of ['glass', 'doorGlass', 'chrome', 'trim', 'mirror', 'wheel']) { MAT[k].envMap = map; MAT[k].needsUpdate = true; }
}
export function setEnvIntensity(v) {
  for (const m of paintCache.values()) m.envMapIntensity = 1.1 * v;
  for (const k of ['glass', 'doorGlass', 'chrome', 'trim', 'mirror', 'wheel']) MAT[k].envMapIntensity = v;
}
function lightMats(shared) {
  return {
    head: shared ? AI_HEAD : new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff3d6, emissiveIntensity: 0.15, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1414, emissiveIntensity: 0.12, roughness: 0.3 }),
    indL: new THREE.MeshStandardMaterial({ color: 0x6a4000, emissive: 0xffa000, emissiveIntensity: 0, roughness: 0.3 }),
    indR: new THREE.MeshStandardMaterial({ color: 0x6a4000, emissive: 0xffa000, emissiveIntensity: 0, roughness: 0.3 }),
    rev: new THREE.MeshStandardMaterial({ color: 0xbbbbbb, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 }),
  };
}

// ===== 번호판 =====
const HANGUL_CAR = '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주하허호';
const HANGUL_BUS = '바사아자';
export function randomPlate(kind = 'car') {
  const r = (n) => Math.floor(Math.random() * n);
  if (kind === 'bus') return `${70 + r(9)}${HANGUL_BUS[r(4)]} ${String(1000 + r(9000))}`;
  return `${100 + r(299)}${HANGUL_CAR[r(HANGUL_CAR.length)]} ${String(1000 + r(9000))}`;
}
const plateCache = new Map();
export function plateMat(text, kind) {
  const key = text + '|' + kind;
  if (plateCache.has(key)) return plateCache.get(key);
  const bg = kind === 'bus' ? '#f4c51c' : kind === 'ev' ? '#bfe2f5' : '#f7f7f7';
  const tex = canvasTex(256, 56, (g, w, h) => {
    g.fillStyle = bg; roundRect(g, 1, 1, w - 2, h - 2, 6); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 3; roundRect(g, 3, 3, w - 6, h - 6, 5); g.stroke();
    if (kind === 'ev') { g.fillStyle = '#1d5fa0'; g.fillRect(8, 10, 12, 36); }
    g.fillStyle = '#111'; g.font = '900 38px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2 + (kind === 'ev' ? 8 : 0), h / 2 + 2, w - 26);
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  plateCache.set(key, m);
  return m;
}

// ===== LED 행선판 =====
export function makeLED(w, h, opts = {}) {
  const tex = canvasTex(w, h, () => {});
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1, map: tex, roughness: 0.6 });
  const api = {
    mat, tex,
    set(parts) {
      const g = tex.userData.ctx;
      g.fillStyle = '#050505'; g.fillRect(0, 0, w, h);
      let x = 6;
      g.textBaseline = 'middle';
      for (const p of parts) {
        const fs = Math.round(h * (p.size || 0.72));
        g.font = `900 ${fs}px "Noto Sans KR", sans-serif`;
        const tw = Math.min(g.measureText(p.text).width, p.max || w);
        if (p.box) { g.fillStyle = p.box; g.fillRect(x - 3, 3, tw + 8, h - 6); g.fillStyle = '#fff'; }
        else g.fillStyle = p.color || '#ffb21a';
        g.fillText(p.text, x + (p.box ? 1 : 0), h / 2 + 1, p.max || w);
        x += tw + (p.gap ?? 14);
      }
      // LED 도트 느낌
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let yy = 0; yy < h; yy += 3) g.fillRect(0, yy, w, 1);
      for (let xx = 0; xx < w; xx += 3) g.fillRect(xx, 0, 1, h);
      tex.needsUpdate = true;
    },
  };
  api.set(opts.parts || [{ text: '' }]);
  return api;
}

// ===== 계기판 (실시간 캔버스) =====
export function makeDash(isBus, analog = false) {
  const W = 512, H = 256;
  const tex = canvasTex(W, H, () => {});
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.4 });
  function gauge(g, cx, cy, r, val, max, label, unit, color) {
    g.strokeStyle = '#333'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.strokeStyle = color; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * clamp(val / max, 0, 1)); g.stroke();
    g.fillStyle = '#9aa'; g.font = '600 13px sans-serif'; g.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 6;
      g.fillText(String(Math.round((max * i) / 6)), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22) + 4);
    }
    const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(val / max, 0, 1);
    g.strokeStyle = '#ff4d3d'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 26px sans-serif'; g.fillText(label, cx, cy + r * 0.62);
    g.fillStyle = '#8aa'; g.font = '600 12px sans-serif'; g.fillText(unit, cx, cy + r * 0.62 + 16);
  }
  // 디지털 클러스터 (슈퍼 에어로시티를 뺀 모든 차)
  function digital(g, s) {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1420'); bg.addColorStop(1, '#03060a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const max = isBus ? 100 : 240, v = clamp(s.kmh / max, 0, 1);
    // 가로 속도 막대
    g.fillStyle = '#16212c'; g.fillRect(40, 196, 432, 14);
    const gr = g.createLinearGradient(40, 0, 472, 0); gr.addColorStop(0, '#36d1c4'); gr.addColorStop(0.7, '#4aa3ff'); gr.addColorStop(1, '#ff4d3d');
    g.fillStyle = gr; g.fillRect(40, 196, 432 * v, 14);
    for (let i = 0; i <= 10; i++) { g.fillStyle = '#5d6f80'; g.fillRect(40 + 43.2 * i, 212, 2, 6); }
    g.textAlign = 'center';
    g.fillStyle = '#fff'; g.font = '800 96px sans-serif'; g.fillText(String(Math.round(s.kmh)), 256, 150);
    g.fillStyle = '#7fa0b4'; g.font = '700 18px sans-serif'; g.fillText('km/h', 256, 176);
    // 왼쪽: 기어 · 오른쪽: 출력/연료
    g.textAlign = 'left'; g.fillStyle = '#36d1c4'; g.font = '900 54px sans-serif'; g.fillText(s.gear, 40, 120);
    g.fillStyle = '#7fa0b4'; g.font = '700 15px sans-serif'; g.fillText(s.ev ? '출력 ' + Math.round(Math.max(0, s.power) * 100) + '%' : (s.rpm / 1000).toFixed(1) + 'k rpm', 40, 150);
    g.textAlign = 'right'; g.fillStyle = s.fuel < 15 ? '#ff4d3d' : '#cfe'; g.font = '800 24px sans-serif'; g.fillText(Math.round(s.fuel) + '%', 472, 110);
    g.fillStyle = '#7fa0b4'; g.font = '700 15px sans-serif'; g.fillText(s.ev ? '배터리' : '연료', 472, 132);
    g.fillStyle = '#16212c'; g.fillRect(392, 140, 80, 7); g.fillStyle = s.fuel < 15 ? '#ff4d3d' : '#36d1c4'; g.fillRect(392, 140, 0.8 * s.fuel, 7);
    g.textAlign = 'center';
    const icon = (x, y, on, col, txt) => { g.fillStyle = on ? col : '#18222c'; g.font = '800 18px sans-serif'; g.fillText(txt, x, y); };
    icon(150, 36, s.blinkL, '#2ee06a', '◀'); icon(362, 36, s.blinkR, '#2ee06a', '▶');
    icon(226, 36, s.lights, '#4aa3ff', '◉'); icon(286, 36, s.park, '#ff4d3d', 'P');
    if (isBus) { icon(110, 240, s.doorF, '#ff9a1a', '앞문'); icon(170, 240, s.doorR, '#ff9a1a', '뒷문'); icon(402, 240, s.bell, '#ff4d3d', '정차'); }
  }
  return {
    mat, tex,
    draw(s) {
      const g = tex.userData.ctx;
      if (!analog) { digital(g, s); tex.needsUpdate = true; return; }
      g.fillStyle = '#07090b'; g.fillRect(0, 0, W, H);
      gauge(g, 118, 128, 96, s.kmh, isBus ? 120 : 260, String(Math.round(s.kmh)), 'km/h', '#36d1c4');
      if (s.ev) gauge(g, 394, 128, 96, Math.max(0, s.power) * 100, 100, Math.round(Math.max(0, s.power) * 100) + '%', '출력', '#4aa3ff');
      else gauge(g, 394, 128, 96, s.rpm / 1000, isBus ? 3 : 8, (s.rpm / 1000).toFixed(1), 'x1000 rpm', '#ffb21a');
      g.textAlign = 'center';
      g.fillStyle = '#fff'; g.font = '900 44px sans-serif'; g.fillText(s.gear, 256, 110);
      g.font = '600 13px sans-serif'; g.fillStyle = '#8aa'; g.fillText((s.ev ? '배터리 ' : '연료 ') + Math.round(s.fuel) + '%', 256, 140);
      g.fillStyle = '#222'; g.fillRect(206, 148, 100, 8); g.fillStyle = s.fuel < 15 ? '#ff4d3d' : '#36d1c4'; g.fillRect(206, 148, s.fuel, 8);
      const icon = (x, y, on, col, txt) => { g.fillStyle = on ? col : '#1b1f22'; g.font = '800 16px sans-serif'; g.fillText(txt, x, y); };
      icon(214, 40, s.blinkL, '#2ee06a', '◀'); icon(298, 40, s.blinkR, '#2ee06a', '▶');
      icon(256, 40, s.lights, '#4aa3ff', '◉');
      icon(226, 196, s.park, '#ff4d3d', 'P');
      if (isBus) {
        icon(256, 196, s.doorF, '#ff9a1a', '앞문');
        icon(256, 222, s.doorR, '#ff9a1a', '뒷문');
        icon(300, 196, s.bell, '#ff4d3d', '정차');
      }
      tex.needsUpdate = true;
    },
  };
}


// ===== 시내버스 아날로그 계기판 (속도 · RPM · 연료 · 수온 · 공기압 2개 · 경고등 · 가운데 LCD) =====
export function makeBusCluster(ev) {
  const W = 1024, H = 400;
  const tex = canvasTex(W, H, () => {});
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.35 });
  const st = { odo: 48213.4, trip: 0, air1: 9.2, air2: 9.0, temp: 40, last: performance.now() };
  const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  function dial(g, cx, cy, r, val, max, major, minor, red, label, unit, fmt) {
    const bg = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    bg.addColorStop(0, '#20252b'); bg.addColorStop(1, '#0a0c0f');
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8c949c'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r - 2, 0, Math.PI * 2); g.stroke();
    if (red) { g.strokeStyle = '#d9261c'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, r - 14, A0 + SW * (red / max), A0 + SW); g.stroke(); }
    for (let v = 0; v <= max + 1e-6; v += minor) {
      const a = A0 + SW * (v / max), big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      g.strokeStyle = big ? '#f2f4f6' : '#9aa3ab'; g.lineWidth = big ? 4 : 2;
      const r1 = r - 10, r2 = r - (big ? 30 : 21);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
      if (big) { g.fillStyle = '#fff'; g.font = `700 ${Math.round(r * 0.14)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(fmt ? fmt(v) : String(v), cx + Math.cos(a) * (r - 52), cy + Math.sin(a) * (r - 52)); }
    }
    g.fillStyle = '#c9d1d8'; g.font = `700 ${Math.round(r * 0.12)}px sans-serif`; g.fillText(label, cx, cy + r * 0.42); g.fillStyle = '#7d8790'; g.font = `600 ${Math.round(r * 0.09)}px sans-serif`; g.fillText(unit, cx, cy + r * 0.58);
    const a = A0 + SW * clamp(val / max, 0, 1.02);
    g.strokeStyle = '#ff5a1f'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.cos(a) * 16, cy - Math.sin(a) * 16); g.lineTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22)); g.stroke();
    g.fillStyle = '#2a2f35'; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8c949c'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.lineCap = 'butt';
  }
  function small(g, cx, cy, r, val, min, max, label, lo, hi, warn) { // 반원 작은 계기
    g.fillStyle = '#0c0e11'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8c949c'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r - 1, 0, Math.PI * 2); g.stroke();
    const a0 = Math.PI * 1.15, sw = Math.PI * 0.7;
    for (let i = 0; i <= 4; i++) { const a = a0 + (sw * i) / 4; g.strokeStyle = '#dfe4e8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); g.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16)); g.stroke(); }
    g.fillStyle = '#c9d1d8'; g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(lo, cx - r * 0.62, cy + 4); g.fillText(hi, cx + r * 0.62, cy + 4); g.fillText(label, cx, cy + r * 0.45);
    const k = clamp((val - min) / (max - min), 0, 1), a = a0 + sw * k;
    g.strokeStyle = warn ? '#ff3b30' : '#ff5a1f'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy + 6); g.lineTo(cx + Math.cos(a) * (r - 10), cy + 6 + Math.sin(a) * (r - 10)); g.stroke();
    g.fillStyle = '#555'; g.beginPath(); g.arc(cx, cy + 6, 5, 0, Math.PI * 2); g.fill();
  }
  function lamp(g, x, y, on, col, txt) {
    g.fillStyle = on ? col : '#15181c'; g.beginPath(); g.roundRect ? g.roundRect(x - 26, y - 14, 52, 28, 6) : g.rect(x - 26, y - 14, 52, 28); g.fill();
    g.fillStyle = on ? '#0a0a0a' : '#3a4047'; g.font = '800 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + 1);
  }
  return {
    mat, tex,
    draw(s) {
      const now = performance.now(), dt = Math.min(0.5, (now - st.last) / 1000); st.last = now;
      st.odo += (s.kmh * dt) / 3600; st.trip += (s.kmh * dt) / 3600;
      // 공기압: 엔진이 돌면 차오르고, 브레이크 · 문 열림에 조금씩 씀
      const use = (s.brake || 0) * 0.35 + (s.doorF || s.doorR ? 0.12 : 0);
      st.air1 = clamp(st.air1 + (0.25 - use) * dt * (s.rpm > 300 || ev ? 1 : 0.2), 5.5, 10); st.air2 = clamp(st.air2 + (0.23 - use * 0.9) * dt * (s.rpm > 300 || ev ? 1 : 0.2), 5.5, 10);
      st.temp = Math.min(88 + Math.sin(now / 9000) * 2, st.temp + dt * 0.8);
      const g = tex.userData.ctx;
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#16191d'); bg.addColorStop(1, '#050607');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      dial(g, 200, 200, 175, s.kmh, 120, 20, 5, 0, '속도', 'km/h');
      if (ev) dial(g, 824, 200, 175, Math.max(0, s.power) * 100, 100, 20, 5, 0, '출력', '%');
      else dial(g, 824, 200, 175, s.rpm / 100, 30, 5, 1, 24, '엔진 회전', 'x100 rpm');
      // 가운데 LCD
      g.fillStyle = '#081016'; g.fillRect(392, 70, 240, 150); g.strokeStyle = '#3a4650'; g.lineWidth = 3; g.strokeRect(392, 70, 240, 150);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#7fe0ff'; g.font = '900 58px sans-serif'; g.fillText(s.gear, 512, 140);
      g.fillStyle = '#cfe9f5'; g.font = '700 18px sans-serif'; g.fillText(`누적 ${st.odo.toFixed(1)} km`, 512, 172);
      g.fillStyle = '#8fb3c4'; g.font = '600 15px sans-serif'; g.fillText(`구간 ${st.trip.toFixed(1)} km · ${new Date().toTimeString().slice(0, 5)}`, 512, 198);
      // 작은 계기: 연료(또는 배터리) · 수온 · 공기압 1 · 공기압 2
      small(g, 432, 270, 46, s.fuel, 0, 100, ev ? '배터리' : '연료', 'E', 'F', s.fuel < 15);
      small(g, 592, 270, 46, ev ? 30 + st.temp * 0.2 : st.temp, 40, 120, '수온', 'C', 'H', false);
      small(g, 432, 352, 40, st.air1, 0, 10, '공기압 1', '0', '10', st.air1 < 6.5);
      small(g, 592, 352, 40, st.air2, 0, 10, '공기압 2', '0', '10', st.air2 < 6.5);
      g.fillStyle = '#c9d1d8'; g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.fillText('bar', 512, 356);
      // 경고등 줄
      lamp(g, 330, 30, s.blinkL, '#2ee06a', '◀'); lamp(g, 694, 30, s.blinkR, '#2ee06a', '▶');
      lamp(g, 392, 30, s.lights, '#4aa3ff', '전조'); lamp(g, 450, 30, s.park, '#ff3b30', 'P'); lamp(g, 512, 30, st.air1 < 6.5 || st.air2 < 6.5, '#ff3b30', '공기');
      lamp(g, 574, 30, s.doorF || s.doorR, '#ffb000', '문'); lamp(g, 632, 30, s.bell, '#ff3b30', '정차');
      lamp(g, 70, 380, s.fuel < 15, '#ffb000', '연료'); lamp(g, 130, 380, false, '#ffb000', 'ABS'); lamp(g, 894, 380, false, '#ff3b30', '배터리'); lamp(g, 954, 380, s.kmh > 2 && !s.belt, '#ff3b30', '벨트');
      tex.needsUpdate = true;
    },
  };
}

// ===== 바퀴 =====
const WHEEL_STYLE = {
  std: { n: 5, rim: 0xb9bec4, w: 0.07 },
  sport: { n: 10, rim: 0xcfd3d8, w: 0.035 },
  aero: { n: 0, rim: 0xd5d9de, w: 0 },
  black: { n: 7, rim: 0x2a2c30, w: 0.05 },
  bus: { n: 10, rim: 0xeef0f2, w: 0.035 },
};
function makeWheel(r, w, style, lod) {
  const spin = new THREE.Group();
  const M = new Merger();
  const st = WHEEL_STYLE[style] || WHEEL_STYLE.std;
  M.add(GEO.cyl, MAT.wheel, mx(0, 0, 0, 0, 0, Math.PI / 2, r, w, r), 0x151515);
  M.add(GEO.cyl, MAT.wheel, mx(0, 0, 0, 0, 0, Math.PI / 2, r * 0.66, w + 0.012, r * 0.66), style === 'aero' ? 0xe2e5e8 : 0x2a2c30);
  if (!lod) {
    for (let i = 0; i < st.n; i++) {
      const a = (i / st.n) * Math.PI * 2;
      M.add(GEO.box, MAT.wheel, mx(0, Math.cos(a) * r * 0.33, Math.sin(a) * r * 0.33, a, 0, 0, w + 0.03, r * 0.62, st.w * (r / 0.33)), st.rim);
    }
    M.add(GEO.cyl, MAT.wheel, mx(0, 0, 0, 0, 0, Math.PI / 2, r * 0.6, w + 0.02, r * 0.6), style === 'bus' ? 0xdfe3e7 : 0x1d1f22);
    M.add(GEO.cyl, MAT.wheel, mx(0, 0, 0, 0, 0, Math.PI / 2, r * 0.16, w + 0.04, r * 0.16), st.rim);
  } else {
    M.add(GEO.cyl8, MAT.wheel, mx(0, 0, 0, 0, 0, Math.PI / 2, r * 0.5, w + 0.02, r * 0.5), st.rim);
  }
  M.build(spin, { cast: !lod });
  return spin;
}
function addWheels(obj, parent, positions, r, w, style, lod) {
  for (const p of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(p.x, r, p.z);
    const spin = makeWheel(r, p.w || w, style, lod);
    pivot.add(spin);
    parent.add(pivot);
    obj.wheels.push({ pivot, spin, front: p.front, r });
  }
}

// ===== 승용차 =====
const PROFILES = {
  sedan: { wb: 0.585, hood: 0.53, trunk: 0.6, low: [[0, 0], [0, 0.5], [0.03, 0.6], [0.24, 0.62], [0.7, 0.6], [0.95, 0.53], [1, 0.42], [1, 0]], cab: [[0.2, 0.6], [0.34, 0.97], [0.63, 0.97], [0.78, 0.6]] },
  sedan_l: { wb: 0.585, hood: 0.54, trunk: 0.61, low: [[0, 0], [0, 0.5], [0.03, 0.61], [0.23, 0.63], [0.7, 0.61], [0.95, 0.54], [1, 0.43], [1, 0]], cab: [[0.19, 0.61], [0.33, 0.97], [0.64, 0.97], [0.79, 0.61]] },
  coupe: { wb: 0.6, hood: 0.52, trunk: 0.6, low: [[0, 0], [0, 0.52], [0.03, 0.6], [0.2, 0.61], [0.7, 0.59], [0.95, 0.52], [1, 0.42], [1, 0]], cab: [[0.13, 0.6], [0.37, 0.96], [0.6, 0.96], [0.79, 0.59]] },
  hatch: { wb: 0.67, hood: 0.54, trunk: 0.63, low: [[0, 0], [0, 0.6], [0.02, 0.64], [0.78, 0.62], [0.97, 0.54], [1, 0.43], [1, 0]], cab: [[0.03, 0.63], [0.1, 0.96], [0.6, 0.97], [0.79, 0.62]] },
  cuv: { wb: 0.64, hood: 0.55, trunk: 0.63, low: [[0, 0], [0, 0.6], [0.03, 0.64], [0.8, 0.62], [0.98, 0.55], [1, 0.42], [1, 0]], cab: [[0.04, 0.63], [0.12, 0.95], [0.62, 0.96], [0.81, 0.62]] },
  suv: { wb: 0.6, hood: 0.57, trunk: 0.63, low: [[0, 0], [0, 0.6], [0.02, 0.63], [0.82, 0.63], [0.98, 0.57], [1, 0.4], [1, 0]], cab: [[0.04, 0.63], [0.07, 0.97], [0.7, 0.98], [0.84, 0.63]] },
  suv_l: { wb: 0.6, hood: 0.58, trunk: 0.63, low: [[0, 0], [0, 0.6], [0.02, 0.63], [0.83, 0.63], [0.98, 0.58], [1, 0.4], [1, 0]], cab: [[0.035, 0.63], [0.06, 0.97], [0.71, 0.98], [0.85, 0.63]] },
  mpv: { wb: 0.6, hood: 0.52, trunk: 0.6, low: [[0, 0], [0, 0.58], [0.02, 0.6], [0.86, 0.6], [0.99, 0.52], [1, 0.38], [1, 0]], cab: [[0.02, 0.6], [0.04, 0.97], [0.74, 0.98], [0.88, 0.6]] },
  boxy: { wb: 0.7, hood: 0.52, trunk: 0.6, low: [[0, 0], [0, 0.58], [0.02, 0.6], [0.88, 0.6], [0.99, 0.52], [1, 0.38], [1, 0]], cab: [[0.02, 0.6], [0.03, 0.98], [0.8, 0.98], [0.9, 0.6]] },
  gwagon: { wb: 0.59, hood: 0.58, trunk: 0.6, low: [[0, 0], [0, 0.58], [0.02, 0.6], [0.82, 0.6], [0.99, 0.58], [1, 0.3], [1, 0]], cab: [[0.06, 0.6], [0.07, 0.98], [0.74, 0.98], [0.78, 0.6]] },
};

export function buildCar(spec, opts = {}) {
  const L = spec.len, W = spec.wid, H = spec.hei, lod = !!opts.lod;
  const P = PROFILES[spec.body] || PROFILES.sedan;
  const paint = paintMat(opts.color || '#cccccc');
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const obj = { group, body, wheels: [], spec, isBus: false, doors: [], wipers: [], mirrors: [] };
  const r = clamp(0.2 * H + 0.03, 0.29, 0.4);
  const wb = L * P.wb, fo = (L - wb) * 0.47;
  const zF = L / 2 - fo, zR = zF - wb;
  const yb = r * 0.62;
  const toX = (f) => (f - 0.5) * L;
  const belt = P.cab[0][1] * H;
  // 실제 차처럼: 앞뒤 끝은 좁아지고(평면 곡률), 창문 쪽은 안으로 기울어짐(텀블홈)
  const deform = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const tz = Math.min(1, Math.abs(z) / (L / 2));
      let f = 1 - 0.075 * tz ** 4 - 0.025 * tz * tz;
      if (y > belt) f *= 1 - 0.2 * Math.min(1, (y - belt) / (H - belt));
      else f *= 1 - 0.05 * ((belt - y) / belt) ** 2;
      p.setX(i, x * f);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  };
  const M = new Merger({ deform });

  // 차체 옆모습 + 휠하우스 (곡선으로 부드럽게)
  const sh = new THREE.Shape();
  const pts = P.low.map(([f, y]) => new THREE.Vector2(toX(f), y < 0.3 ? yb : y * H));
  sh.moveTo(pts[0].x, pts[0].y);
  sh.lineTo(pts[1].x, pts[1].y);
  sh.splineThru(pts.slice(2, pts.length - 1));
  sh.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  const ar = r + 0.05, cy = r;
  const a0 = Math.asin(clamp((yb - cy) / ar, -1, 1));
  sh.lineTo(zF + ar * Math.cos(a0), yb);
  sh.absarc(zF, cy, ar, a0, Math.PI - a0, false);
  sh.lineTo(zR + ar * Math.cos(a0), yb);
  sh.absarc(zR, cy, ar, a0, Math.PI - a0, false);
  sh.lineTo(pts[0].x, pts[0].y);
  const depth = W - 0.16;
  const eg = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.045, bevelSegments: lod ? 1 : 3, curveSegments: lod ? 5 : 10 });
  eg.translate(0, 0, -depth / 2); eg.rotateY(-Math.PI / 2);
  M.add(eg, paint);
  eg.dispose();
  // 하부/범퍼
  M.add(GEO.box, MAT.trim, mx(0, yb + 0.05, L / 2 - 0.02, 0, 0, 0, W - 0.1, 0.12, 0.1));
  M.add(GEO.box, MAT.trim, mx(0, yb + 0.05, -L / 2 + 0.02, 0, 0, 0, W - 0.1, 0.12, 0.1));
  M.add(GEO.box, MAT.under, mx(0, yb + 0.02, 0, 0, 0, 0, W - 0.3, 0.06, L - 0.6));

  // 캐빈 유리
  const cab = P.cab.map(([f, y]) => [toX(f), y * H]);
  const cs = new THREE.Shape();
  const V = (x, y) => new THREE.Vector2(x, y);
  const lp = (a, b, t, dy) => V(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + dy);
  cs.moveTo(cab[0][0], cab[0][1]);
  cs.splineThru([lp(cab[0], cab[1], 0.55, 0.025), V(cab[1][0], cab[1][1]), V((cab[1][0] + cab[2][0]) / 2, cab[1][1] + 0.025), V(cab[2][0], cab[2][1]), lp(cab[2], cab[3], 0.45, 0.03), V(cab[3][0], cab[3][1])]);
  cs.closePath();
  const cw = W * 0.84;
  const cg = new THREE.ExtrudeGeometry(cs, { depth: cw, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.02, bevelSegments: 1 });
  cg.translate(0, -0.005, -cw / 2); cg.rotateY(-Math.PI / 2);
  M.add(cg, MAT.glass);
  cg.dispose();
  // 지붕 + 필러
  const roofLen = cab[2][0] - cab[1][0];
  M.add(GEO.box, paint, mx(0, cab[1][1] + 0.02, (cab[1][0] + cab[2][0]) / 2, 0, 0, 0, cw + 0.06, 0.06, roofLen + 0.12));
  const strut = (a, b, xs, mat, t = 0.07) => {
    const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
    M.add(GEO.box, mat, mx(xs, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2, -Math.atan2(dy, dz), 0, 0, t, t, len));
  };
  for (const s of [1, -1]) {
    const xs = s * (cw / 2 + 0.03);
    strut(cab[3], cab[2], xs, paint, 0.08); // A
    strut(cab[0], cab[1], xs, paint, 0.12); // C
    const bz = cab[1][0] + roofLen * 0.52;
    M.add(GEO.box, MAT.black, mx(xs, (cab[1][1] + cab[0][1]) / 2, bz, 0, 0, 0, 0.06, cab[1][1] - cab[0][1], 0.1)); // B
    // 사이드 스커트 · 벨트라인 크롬 · 창문 아래 검은 몰딩
    M.add(GEO.box, MAT.trim, mx(s * (W / 2 - 0.01), yb + 0.08, (zF + zR) / 2, 0, 0, 0, 0.05, 0.1, wb - 2 * ar - 0.1));
    M.add(GEO.box, MAT.black, mx(s * (cw / 2 + 0.035), belt + 0.025, (cab[0][0] + cab[3][0]) / 2, 0, 0, 0, 0.03, 0.05, cab[3][0] - cab[0][0] - 0.1));
    if (!lod) {
      M.add(GEO.box, MAT.chrome, mx(s * (W / 2 + 0.003), belt - 0.06, (cab[0][0] + cab[3][0]) / 2, 0, 0, 0, 0.012, 0.018, cab[3][0] - cab[0][0] - 0.3));
      const bzz = cab[1][0] + (cab[2][0] - cab[1][0]) * 0.52;
      const doorZs = spec.body === 'hatch' || (spec.body === 'coupe' && L < 4.5) ? [cab[3][0] - 0.05, bzz + 0.6] : [cab[3][0] - 0.05, bzz, cab[0][0] + 0.25];
      for (const dz of doorZs) M.add(GEO.box, MAT.black, mx(s * (W / 2 + 0.004), (yb + 0.2 + belt) / 2, dz, 0, 0, 0, 0.008, belt - yb - 0.25, 0.012));
      for (const dz of [bzz + 0.35, bzz - 0.5]) M.add(GEO.box, MAT.chrome, mx(s * (W / 2 + 0.012), belt - 0.15, dz, 0, 0, 0, 0.025, 0.035, 0.2));
      for (const za of [zF, zR]) M.add(new THREE.TorusGeometry(ar - 0.01, 0.035, 5, 18, Math.PI - 2 * a0), MAT.black, mx(s * (W / 2 - 0.03), cy, za, 0, Math.PI / 2, a0));
    }
  }
  // 그릴
  const hoodY = P.hood * H;
  const gy = Math.max(yb + 0.2, hoodY * 0.6);
  if (spec.brand === 'bayern') {
    for (const s of [1, -1]) M.add(GEO.box, MAT.black, mx(s * 0.17, gy, L / 2 + 0.01, 0, 0, 0, 0.28, 0.2, 0.06));
  } else if (spec.brand === 'zenith') {
    M.add(GEO.box, MAT.chrome, mx(0, gy - 0.02, L / 2 + 0.005, 0, 0, 0, 0.62, 0.3, 0.05));
    M.add(GEO.box, MAT.black, mx(0, gy - 0.02, L / 2 + 0.02, 0, 0, 0, 0.56, 0.25, 0.05));
  } else if (spec.brand === 'stern') {
    M.add(GEO.box, MAT.black, mx(0, gy, L / 2 + 0.01, 0, 0, 0, 0.7, 0.22, 0.05));
    M.add(GEO.box, MAT.chrome, mx(0, gy, L / 2 + 0.03, 0, 0, 0, 0.7, 0.025, 0.03));
  } else if (!spec.ev) {
    M.add(GEO.box, MAT.black, mx(0, gy, L / 2 + 0.01, 0, 0, 0, W * 0.5, 0.2, 0.05));
  } else {
    M.add(GEO.box, MAT.black, mx(0, yb + 0.12, L / 2 + 0.03, 0, 0, 0, W * 0.6, 0.08, 0.05));
  }

  // 등화
  const lights = lightMats(lod);
  obj.lights = lights;
  const hy = hoodY - 0.1;
  if (spec.ev || spec.brand === 'sora' || spec.brand === 'hanbit') M.add(GEO.box, lights.head, mx(0, hoodY - 0.04, L / 2 - 0.03, 0, 0, 0, W - 0.25, 0.03, 0.12));
  for (const s of [1, -1]) {
    M.add(GEO.box, MAT.black, mx(s * (W / 2 - 0.32), hy, L / 2 - 0.07, 0, s * -0.25, 0, 0.44, 0.14, 0.16));
    M.add(GEO.box, lights.head, mx(s * (W / 2 - 0.3), hy + 0.03, L / 2 - 0.04, 0, s * -0.25, 0, 0.38, 0.03, 0.14));
    if (!lod) for (const k of [0, 1]) M.add(GEO.cyl8, lights.head, mx(s * (W / 2 - 0.22 - k * 0.15), hy - 0.03, L / 2 - 0.02, Math.PI / 2, 0, 0, 0.045, 0.1, 0.045));
    if (!lod) M.add(GEO.box, MAT.black, mx(s * (W / 2 - 0.3), yb + 0.18, L / 2, 0, 0, 0, 0.32, 0.1, 0.08));
  }
  const ty = P.trunk * H - 0.1;
  for (const s of [1, -1]) M.add(GEO.box, lights.tail, mx(s * (W / 2 - 0.24), ty, -L / 2 + 0.02, 0, 0, 0, 0.36, 0.11, 0.12));
  if (spec.ev || spec.brand === 'hanbit' || spec.brand === 'zenith') M.add(GEO.box, lights.tail, mx(0, ty + 0.03, -L / 2 + 0.03, 0, 0, 0, W - 0.5, 0.035, 0.1));
  M.add(GEO.box, lights.indL, mx(W / 2 - 0.1, hy - 0.04, L / 2 - 0.12, 0, 0, 0, 0.1, 0.06, 0.12));
  M.add(GEO.box, lights.indR, mx(-(W / 2 - 0.1), hy - 0.04, L / 2 - 0.12, 0, 0, 0, 0.1, 0.06, 0.12));
  M.add(GEO.box, lights.indL, mx(W / 2 - 0.1, ty - 0.12, -L / 2 + 0.04, 0, 0, 0, 0.12, 0.06, 0.1));
  M.add(GEO.box, lights.indR, mx(-(W / 2 - 0.1), ty - 0.12, -L / 2 + 0.04, 0, 0, 0, 0.12, 0.06, 0.1));
  M.add(GEO.box, lights.rev, mx(0.25, ty - 0.14, -L / 2 + 0.04, 0, 0, 0, 0.12, 0.05, 0.1));

  // 사이드미러
  const mz = cab[3][0] - 0.12, myy = cab[3][1] + 0.1;
  for (const s of [1, -1]) {
    M.add(GEO.box, paint, mx(s * (W / 2 + 0.07), myy, mz, 0, 0, 0, 0.18, 0.13, 0.09));
    M.add(GEO.box, s > 0 ? lights.indL : lights.indR, mx(s * (W / 2 + 0.07), myy - 0.05, mz + 0.046, 0, 0, 0, 0.14, 0.02, 0.01));
  }

  // 실내
  const dashZ = cab[3][0] - 0.38;
  const wheelZ = dashZ - 0.38;
  const seatZ = wheelZ - 0.62;
  if (!lod) {
    M.add(GEO.box, MAT.interior, mx(0, hoodY + 0.02, dashZ, 0, 0, 0, W * 0.82, 0.18, 0.42));
    for (const s of [1, -1]) {
      M.add(GEO.box, MAT.seat, mx(s * W * 0.22, yb + 0.33, seatZ, 0, 0, 0, 0.5, 0.12, 0.5));
      M.add(GEO.box, MAT.seat, mx(s * W * 0.22, yb + 0.7, seatZ - 0.27, -0.15, 0, 0, 0.5, 0.65, 0.12));
    }
    if (L > 4) M.add(GEO.box, MAT.seat, mx(0, yb + 0.36, seatZ - 0.95, 0, 0, 0, W * 0.74, 0.14, 0.5));
    M.add(GEO.box, MAT.interior, mx(0, yb + 0.25, seatZ + 0.1, 0, 0, 0, 0.22, 0.25, 0.9)); // 센터콘솔
  }
  M.build(body, { cast: true });

  // 운전대 (애니메이션)
  if (!lod) {
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), MAT.black);
    const swg = new THREE.Group();
    swg.position.set(W * 0.22, hoodY + 0.12, wheelZ);
    swg.rotation.x = -0.45;
    swg.add(sw);
    const hub = new THREE.Mesh(GEO.cyl8, MAT.black); hub.scale.set(0.06, 0.05, 0.06); hub.rotation.x = Math.PI / 2; swg.add(hub);
    body.add(swg);
    obj.steeringWheel = sw;
    // 계기판
    const dash = makeDash(false);
    const dm = new THREE.Mesh(GEO.plane, dash.mat);
    dm.scale.set(0.34, 0.17, 1);
    dm.position.set(W * 0.22, hoodY + 0.14, dashZ - 0.17);
    dm.rotation.y = Math.PI; dm.rotation.x = 0.25;
    body.add(dm);
    obj.dash = dash;
  }

  // 번호판
  const plateKind = spec.ev ? 'ev' : 'car';
  const pm = plateMat(opts.plate || randomPlate('car'), plateKind);
  const pf = new THREE.Mesh(GEO.plane, pm); pf.scale.set(0.52, 0.11, 1); pf.position.set(0, Math.max(yb + 0.16, 0.36), L / 2 + 0.075); body.add(pf);
  const pr = new THREE.Mesh(GEO.plane, pm); pr.scale.set(0.52, 0.11, 1); pr.position.set(0, ty - 0.3, -L / 2 - 0.035); pr.rotation.y = Math.PI; body.add(pr);
  obj.plates = [pf, pr];

  addWheels(obj, group, [
    { x: W / 2 - 0.16, z: zF, front: true }, { x: -(W / 2 - 0.16), z: zF, front: true },
    { x: W / 2 - 0.16, z: zR }, { x: -(W / 2 - 0.16), z: zR },
  ], r, 0.24, opts.wheel || 'std', lod);

  obj.wb = wb;
  obj.driverEye = new THREE.Vector3(W * 0.22, hoodY + 0.44, seatZ + 0.02);
  obj.interiorEye = new THREE.Vector3(-W * 0.2, hoodY + 0.48, seatZ - 0.95);
  obj.mirrorPos = [new THREE.Vector3(W / 2 + 0.1, myy, mz), new THREE.Vector3(-W / 2 - 0.1, myy, mz)];
  obj.headPos = [new THREE.Vector3(0.5, hy, L / 2), new THREE.Vector3(-0.5, hy, L / 2)];
  group.traverse((o) => { if (o.isMesh && o.material !== MAT.glass) o.castShadow = !lod; });
  return obj;
}

// ===== 버스 =====
function cut(g, x, y, w, h, r = 6, tint = 'rgba(14,22,28,0.55)') {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  roundRect(g, x, y, w, h, r); g.fill();
  g.restore();
  if (tint) { g.fillStyle = tint; roundRect(g, x, y, w, h, r); g.fill(); }
}

// 버스 앞/뒤 끝: 평면도에서 둥근 모서리 + 살짝 볼록한 면 + 위쪽 둥근 지붕 테두리를 한 장의 곡면으로
function busEnd(W, H, skirt, topY, cr, bulge, lean, wsBot, draw) {
  const hw = W / 2 - cr, capR = H - topY;
  const path = [];
  const NA = 10, NF = 22;
  for (let i = 0; i <= NA; i++) { const t = (i / NA) * Math.PI / 2; path.push({ x: -(hw + cr * Math.cos(t)), z: cr * Math.sin(t), nx: -Math.cos(t), nz: Math.sin(t) }); }
  for (let i = 1; i < NF; i++) { const x = -hw + (2 * hw * i) / NF; const dz = (-2 * bulge * x) / (hw * hw); const nl = Math.hypot(dz, 1); path.push({ x, z: cr + bulge * (1 - (x / hw) ** 2), nx: -dz / nl, nz: 1 / nl }); }
  for (let i = 0; i <= NA; i++) { const t = Math.PI / 2 - (i / NA) * Math.PI / 2; path.push({ x: hw + cr * Math.cos(t), z: cr * Math.sin(t), nx: Math.cos(t), nz: Math.sin(t) }); }
  let tot = 0; path[0].s = 0;
  for (let i = 1; i < path.length; i++) { tot += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z); path[i].s = tot; }
  const fw = (p) => clamp(p.z / (cr + bulge), 0, 1);
  const leanAt = (y, p) => -lean * smooth(wsBot, H, y) * fw(p) + (y < 0.62 ? 0.03 * fw(p) : 0);
  const rows = [];
  for (let y = skirt; y < topY - 0.01; y += 0.12) rows.push({ y, inset: 0 });
  rows.push({ y: topY, inset: 0 });
  for (let k = 1; k <= 6; k++) { const ph = (k / 6) * Math.PI / 2; rows.push({ y: topY + capR * Math.sin(ph), inset: capR * (1 - Math.cos(ph)) }); }
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < path.length; i++) {
    const p = path[i], rw = rows[j];
    const ln = leanAt(rw.y, p);
    pos.push(p.x - p.nx * rw.inset, rw.y, p.z - p.nz * rw.inset + ln);
    uv.push(p.s / tot, (rw.y - skirt) / (H - skirt));
  }
  const nP = path.length;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nP - 1; i++) {
    const a = j * nP + i, b = a + 1, c = a + nP, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const top = rows.length - 1, tl = rows[top];
  const sh = new THREE.Shape();
  path.forEach((p, i) => { const x = p.x - p.nx * tl.inset, z = p.z - p.nz * tl.inset + leanAt(tl.y, p); if (i === 0) sh.moveTo(x, -z); else sh.lineTo(x, -z); });
  sh.lineTo(path[0].x - path[0].nx * tl.inset, 0.01);
  const tg = new THREE.ShapeGeometry(sh); tg.rotateX(-Math.PI / 2); tg.translate(0, H, 0);
  const tex = canvasTex(Math.round(tot * 128), Math.round((H - skirt) * 128), (cg, cw, ch) => draw(cg, cw, ch, {
    tot, cr, W, H, X: (x) => {
      let best = 0, bd = 1e9; for (const p of path) { const d = Math.abs(p.x - x) + (p.z < cr * 0.5 ? 1 : 0); if (d < bd) { bd = d; best = p.s; } } return (best / tot) * cw;
    }, S: (s) => (s / tot) * cw, Y: (y) => ((H - y) / (H - skirt)) * ch,
  }));
  return {
    geo: g, top: tg, tex,
    surf: (x, y) => {
      const xx = clamp(x, -hw, hw);
      return cr + bulge * (1 - (xx / hw) ** 2) + leanAt(y, { z: cr + bulge }) + (Math.abs(x) > hw ? -(cr - Math.sqrt(Math.max(0, cr * cr - (Math.abs(x) - hw) ** 2))) : 0);
    },
  };
}

export function buildBus(spec, opts = {}) {
  const L = spec.len, W = spec.wid, H = spec.hei, low = spec.low, lod = !!opts.lod;
  const country = spec.style === 'country';
  const liv = LIVERY_BY_ID[opts.livery || spec.livery] || LIVERY_BY_ID.teal;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const obj = { group, body, wheels: [], spec, isBus: true, doors: [], wipers: [], mirrors: [] };
  const floorY = low ? 0.36 : country ? 0.75 : 0.98;
  const skirt = 0.3, topY = H - 0.32, roofY = topY;
  const r = country ? 0.4 : 0.5;
  const fo = country ? 1.45 : 2.55;
  const zF = L / 2 - fo, zR = zF - spec.wb;
  const crF = country ? 0.3 : 0.36, crR = 0.26;
  const doorW = country ? 0.85 : 1.2;
  const d0 = crF + 0.06;
  const fdC = L / 2 - d0 - doorW / 2;
  const mdC = country ? null : zR + 1.85;
  const wTop = topY - 0.1;
  const wBot = low ? 1.12 : country ? 1.25 : 1.55;
  const wsBot = country ? 1.15 : spec.style === 'nd' ? 0.95 : 1.02;
  const M = new Merger();
  const pxm = 80;
  const sideL = L - crF - crR, sideZ = (crR - crF) / 2;

  // ---- 옆면 데칼 (유리창/문/휠하우스는 투명) ----
  const sideTex = (isRight) => canvasTex(Math.round(sideL * pxm), Math.round((topY - skirt) * pxm), (g, cw, ch) => {
    const X = (d) => (isRight ? (L - crR - d) * pxm : (d - crF) * pxm);
    const Y = (y) => (topY - y) * pxm;
    const rect = (da, db, y0, y1) => [Math.min(X(da), X(db)), Y(y1), Math.abs(X(db) - X(da)), Y(y0) - Y(y1)];
    g.fillStyle = liv.mid; g.fillRect(0, 0, cw, ch);
    g.fillStyle = liv.top; g.fillRect(0, 0, cw, Y(wTop) + 2);
    g.fillStyle = liv.low;
    g.beginPath(); g.moveTo(X(crF), Y(0.62)); g.lineTo(X(L * 0.5), Y(0.62)); g.bezierCurveTo(X(L * 0.68), Y(0.62), X(L * 0.78), Y(wBot - 0.05), X(L * 0.9), Y(wBot - 0.05));
    g.lineTo(X(L - crR), Y(wBot - 0.05)); g.lineTo(X(L - crR), Y(skirt)); g.lineTo(X(crF), Y(skirt)); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(Math.min(X(crF), X(L * 0.5)), Y(0.64), Math.abs(X(L * 0.5) - X(crF)), 2);
    g.fillStyle = '#111417'; g.fillRect(0, Y(wTop), cw, Y(wBot - 0.06) - Y(wTop));
    const mdFrom = mdC !== null ? L / 2 - mdC - doorW / 2 - 0.08 : 99, mdTo = mdC !== null ? L / 2 - mdC + doorW / 2 + 0.08 : 99;
    let d = isRight ? d0 + doorW + 0.1 : 1.6;
    while (d < L - crR - 0.3) {
      let seg = Math.min(1.42, L - crR - 0.25 - d);
      if (isRight && d < mdTo && d + seg > mdFrom) { if (d < mdFrom - 0.3) seg = mdFrom - d; else { d = mdTo; continue; } }
      if (seg < 0.35) { d += seg; continue; }
      const raised = low && L / 2 - (d + seg / 2) < (mdC ?? -99) - doorW / 2;
      cut(g, ...rect(d + 0.03, d + seg - 0.03, raised ? wBot + 0.22 : wBot, wTop - 0.04), 6, 'rgba(10,16,20,0.62)');
      d += seg;
    }
    if (!isRight) { g.fillStyle = '#111417'; g.fillRect(...rect(crF, 1.62, wBot - 0.32, wTop)); cut(g, ...rect(crF + 0.02, 1.56, wBot - 0.3, wTop - 0.04), 8, 'rgba(10,16,20,0.55)'); }
    if (isRight) {
      cut(g, ...rect(d0, d0 + doorW, skirt - 0.05, wTop + 0.02), 4, null);
      if (mdC !== null) { const dm = L / 2 - mdC; cut(g, ...rect(dm - doorW / 2, dm + doorW / 2, skirt - 0.05, wTop + 0.02), 4, null); }
    }
    for (const za of [zF, zR]) {
      const dx = X(L / 2 - za);
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(dx, Y(r), (r + 0.1) * pxm, 0, Math.PI * 2); g.fill(); g.restore();
      g.strokeStyle = '#0d0e10'; g.lineWidth = 7; g.beginPath(); g.arc(dx, Y(r), (r + 0.13) * pxm, Math.PI, 0); g.stroke();
    }
    g.fillStyle = liv.text; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(0.18 * pxm)}px "Noto Sans KR", sans-serif`;
    if (!country) g.fillText(opts.company || '광주 시내버스', X(L * 0.42), Y(0.9));
    g.font = `700 ${Math.round(0.13 * pxm)}px "Noto Sans KR", sans-serif`;
    if (spec.ev) g.fillText('친환경 전기버스  ELECTRIC', X(L * 0.25), Y(0.82));
    else if (spec.cng) g.fillText('CNG 천연가스버스', X(L * 0.25), Y(0.82));
    if (low) { g.fillStyle = '#1a6fd1'; g.font = `800 ${Math.round(0.15 * pxm)}px sans-serif`; g.fillText('♿ 저상버스', X(isRight ? 2.1 : L * 0.3), Y(0.98)); }
  });
  for (const isRight of [false, true]) {
    const m = new THREE.MeshStandardMaterial({ map: sideTex(isRight), transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.28, metalness: 0.2, envMap: ENV.map, envMapIntensity: 0.8 });
    const p = new THREE.Mesh(GEO.plane, m);
    p.scale.set(sideL, topY - skirt, 1);
    p.rotation.y = isRight ? -Math.PI / 2 : Math.PI / 2;
    p.position.set(isRight ? -W / 2 : W / 2, (topY + skirt) / 2, sideZ);
    p.castShadow = true;
    body.add(p);
  }

  // ---- 앞면 (볼록한 통유리 + 둥근 모서리) ----
  const front = busEnd(W, H, skirt, topY, crF, country ? 0.18 : 0.12, country ? 0.3 : 0.16, wsBot, (g, cw, ch, k) => {
    const { X, S, Y } = k;
    g.fillStyle = liv.mid; g.fillRect(0, 0, cw, ch);
    g.fillStyle = spec.style === 'km' ? '#15171a' : liv.top; g.fillRect(0, 0, cw, Y(H - 0.6));
    const gx0 = S(k.tot * 0.03), gx1 = S(k.tot * 0.97);
    if (spec.style === 'nd') { g.fillStyle = '#111316'; roundRect(g, 0, Y(H - 0.55), cw, Y(0.7) - Y(H - 0.55), 24); g.fill(); }
    g.fillStyle = '#111417'; roundRect(g, gx0 - 6, Y(H - 0.6) - 4, gx1 - gx0 + 12, Y(wsBot - 0.04) - Y(H - 0.6) + 8, 26); g.fill();
    cut(g, gx0, Y(H - 0.6), gx1 - gx0, Y(wsBot) - Y(H - 0.6), country ? 40 : 26, 'rgba(12,20,26,0.5)');
    if (spec.style === 'km') { g.fillStyle = '#15171a'; g.fillRect(cw / 2 - 4, Y(H - 0.6), 8, Y(wsBot) - Y(H - 0.6)); }
    g.fillStyle = '#121416'; g.fillRect(S(k.tot * 0.1), Y(wsBot), S(k.tot * 0.8), Y(wsBot - 0.16) - Y(wsBot));
    g.fillStyle = '#cfd5da'; roundRect(g, cw / 2 - 0.35 * 128, Y(wsBot - 0.06), 0.7 * 128, 0.04 * 128, 3); g.fill();
    g.fillStyle = '#15171a';
    for (const side of [-1, 1]) {
      const xa = side < 0 ? S(0) : S(k.tot), xb = X(side * (W / 2 - 0.62));
      g.beginPath(); g.moveTo(xa, Y(0.98)); g.quadraticCurveTo((xa + xb) / 2, Y(1.02), xb, Y(0.9)); g.lineTo(xb, Y(0.72)); g.quadraticCurveTo((xa + xb) / 2, Y(0.66), xa, Y(0.7)); g.closePath(); g.fill();
    }
    g.fillStyle = liv.low; g.fillRect(0, Y(0.5), cw, ch);
    g.fillStyle = '#1a1c1f'; roundRect(g, cw / 2 - 0.55 * 128, Y(0.62), 1.1 * 128, 0.1 * 128, 6); g.fill();
    if (country) { g.fillStyle = '#1b1d20'; roundRect(g, cw / 2 - 0.55 * 128, Y(1.0), 1.1 * 128, 0.3 * 128, 10); g.fill(); }
  });
  const fMat = new THREE.MeshStandardMaterial({ map: front.tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.22, metalness: 0.2, envMap: ENV.map });
  front.geo.translate(0, 0, L / 2 - crF); front.top.translate(0, 0, L / 2 - crF);
  const fm = new THREE.Mesh(front.geo, fMat); fm.castShadow = true; body.add(fm);
  obj.frontMesh = fm; // 운전석 시점에서는 숨김 (짙은 앞유리 때문에 앞이 안 보이던 문제)
  // 안쪽에서 보이는 앞유리 틀 (A필러 · 위 가로대) — 밖에서는 앞판에 가려 안 보임
  for (const sx of [1, -1]) M.add(GEO.box, MAT.black, mx(sx * (W / 2 - 0.035), (wsBot + H - 0.6) / 2, L / 2 - crF - 0.04, 0, 0, 0, 0.05, H - 0.6 - wsBot, 0.06));
  M.add(GEO.box, MAT.black, mx(0, H - 0.5, L / 2 - crF - 0.04, 0, 0, 0, W - 0.1, 0.22, 0.08));
  const frontZ = (x, y) => L / 2 - crF + front.surf(x, y);

  // ---- 뒷면 ----
  const rear = busEnd(W, H, skirt, topY, crR, 0.03, 0, wsBot, (g, cw, ch, k) => {
    const { S, Y } = k;
    g.fillStyle = liv.mid; g.fillRect(0, 0, cw, ch);
    g.fillStyle = liv.top; g.fillRect(0, 0, cw, Y(H - 0.5));
    g.fillStyle = liv.low; g.fillRect(0, Y(wBot - 0.05), cw, ch);
    const wy1 = low || country ? H - 0.95 : H - 1.35;
    g.fillStyle = '#111417'; roundRect(g, S(k.tot * 0.14), Y(H - 0.48), S(k.tot * 0.72), Y(wy1 - 0.03) - Y(H - 0.48), 10); g.fill();
    cut(g, S(k.tot * 0.15), Y(H - 0.5), S(k.tot * 0.7), Y(wy1) - Y(H - 0.5), 10);
    g.fillStyle = '#2a2d31';
    const ey0 = Y(low ? 1.55 : 1.35), ey1 = Y(0.72);
    roundRect(g, S(k.tot * 0.2), ey0, S(k.tot * 0.6), ey1 - ey0, 10); g.fill();
    g.strokeStyle = '#454a50'; g.lineWidth = 3;
    for (let y = ey0 + 8; y < ey1 - 4; y += 10) { g.beginPath(); g.moveTo(S(k.tot * 0.22), y); g.lineTo(S(k.tot * 0.78), y); g.stroke(); }
  });
  const rMat = new THREE.MeshStandardMaterial({ map: rear.tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.25, metalness: 0.2, envMap: ENV.map });
  rear.geo.translate(0, 0, L / 2 - crR); rear.geo.rotateY(Math.PI);
  rear.top.translate(0, 0, L / 2 - crR); rear.top.rotateY(Math.PI);
  const rm = new THREE.Mesh(rear.geo, rMat); rm.castShadow = true; body.add(rm);

  // ---- 지붕 (둥근 단면) + 배터리/CNG 덮개 ----
  const roofMat = paintMat(liv.top);
  const rs = new THREE.Shape();
  const capR = H - topY;
  rs.moveTo(-W / 2, topY - 0.01); rs.lineTo(W / 2, topY - 0.01);
  for (let k = 1; k <= 6; k++) { const ph = (k / 6) * Math.PI / 2; rs.lineTo(W / 2 - capR * (1 - Math.cos(ph)), topY + capR * Math.sin(ph)); }
  for (let k = 0; k <= 6; k++) { const ph = Math.PI / 2 - (k / 6) * Math.PI / 2; rs.lineTo(-(W / 2 - capR * (1 - Math.cos(ph))), topY + capR * Math.sin(ph)); }
  rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, { depth: sideL, bevelEnabled: false });
  rg.translate(0, 0, -sideL / 2 + sideZ);
  M.add(rg, roofMat); rg.dispose();
  M.add(front.top, roofMat); M.add(rear.top, roofMat);
  const fairing = (z0, z1, h, mat) => {
    const s = new THREE.Shape();
    s.moveTo(z0, H - 0.02); s.lineTo(z0, H + h - 0.25); s.quadraticCurveTo(z0, H + h, z0 + 0.3, H + h); s.lineTo(z1 - 1.4, H + h); s.quadraticCurveTo(z1 - 0.9, H - 0.02, z1, H - 0.02); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: W - 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, -(W - 0.5) / 2); g.rotateY(-Math.PI / 2);
    M.add(g, mat); g.dispose();
  };
  if (spec.ev) fairing(-L / 2 + 0.5, L / 2 - 2.8, 0.42, roofMat);
  else if (spec.cng) fairing(-1.5, L / 2 - 2.0, 0.4, roofMat);
  else M.add(GEO.box, MAT.grey, mx(0, H + 0.14, country ? -0.5 : -1.0, 0, 0, 0, 1.6, 0.28, 1.6));

  // ---- 바닥/하부/휠하우스 ----
  // 바퀴 자리를 피해서 바닥판을 까는 함수
  const wz = r + 0.18;
  const slab = (y0, y1, z0, z1, mat) => {
    if (z1 - z0 < 0.02) return;
    M.add(GEO.box, mat, mx(0, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, W - 1.4, y1 - y0, z1 - z0));
    const cuts = [[zR - wz, zR + wz], [zF - wz, zF + wz]];
    let a = z0;
    const segs = [];
    for (const [c0, c1] of cuts) { if (c1 <= a || c0 >= z1) continue; if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
    if (a < z1) segs.push([a, z1]);
    for (const [s0, s1] of segs) for (const s of [1, -1]) M.add(GEO.box, mat, mx(s * (W / 2 - 0.37), (y0 + y1) / 2, (s0 + s1) / 2, 0, 0, 0, 0.66, y1 - y0, s1 - s0));
  };
  slab(floorY - 0.08, floorY, -L / 2 + 0.05, L / 2 - 0.05, MAT.busFloor);
  M.add(GEO.box, MAT.under, mx(0, (floorY - 0.08 + 0.3) / 2, 0, 0, 0, 0, W - 1.42, Math.max(0.05, floorY - 0.38), L - 0.4));
  for (const za of [zF, zR]) {
    for (const s of [1, -1]) {
      M.add(GEO.box, MAT.busFloor, mx(s * (W / 2 - 0.37), 2 * r + 0.12, za, 0, 0, 0, 0.66, 0.06, 2 * wz));
      M.add(GEO.box, MAT.under, mx(s * (W / 2 - 0.71), (2 * r + 0.15) / 2, za, 0, 0, 0, 0.04, 2 * r + 0.15, 2 * wz));
    }
  }
  // 저상버스 뒤쪽 단차 / 고상버스 계단
  let platZ = -99;
  if (low && mdC !== null) {
    platZ = mdC - doorW / 2 - 0.35;
    slab(floorY, floorY + 0.36, -L / 2 + 0.05, platZ, MAT.busFloor);
  }
  if (!low) {
    const doors = [fdC]; if (mdC !== null) doors.push(mdC);
    for (const dz of doors) {
      const st = (floorY - 0.32) / 3;
      for (let k = 1; k <= 2; k++) M.add(GEO.box, MAT.busFloor, mx(-W / 2 + 0.5 - (k - 1) * 0.0, 0.32 + st * k - st / 2, dz, 0, 0, 0, 0.9 - (k - 1) * 0.3, st * k, doorW - 0.05));
    }
  }

  // ---- 실내 ----
  obj.seatSpots = [];
  const seat = (x, z, base, mat, rot = 0) => {
    if (!lod && Math.abs(rot) < 0.01 && base < floorY + 0.5) obj.seatSpots.push({ x, y: base + 0.49, z: z + 0.02, used: false });
    M.add(GEO.box, mat, mx(x, base + 0.44, z, 0, rot, 0, 0.42, 0.1, 0.42));
    const bx = x - Math.sin(rot) * 0.2, bz = z - Math.cos(rot) * 0.2;
    M.add(GEO.box, mat, mx(bx, base + 0.76, bz, -0.12, rot, 0, 0.42, 0.56, 0.08));
    M.add(GEO.box, MAT.trim, mx(x, base + 0.2, z, 0, rot, 0, 0.08, 0.4, 0.08));
  };
  obj.floorAt = (z) => (low && z < platZ ? floorY + 0.36 : floorY);
  if (!lod) {
    const baseAt = (z) => (z < platZ ? floorY + 0.36 : floorY);
    const onHump = (z) => low && (Math.abs(z - zF) < r + 0.3 || Math.abs(z - zR) < r + 0.3);
    let count = 0;
    for (let z = L / 2 - 2.35; z > -L / 2 + 1.1; z -= 0.8) {
      if (country && z > L / 2 - 2.0) continue;
      const hump = onHump(z);
      const b = hump ? 2 * r + 0.12 - 0.3 : baseAt(z);
      seat(W / 2 - 0.32, z, b, MAT.seatBlue); seat(W / 2 - 0.76, z, b, MAT.seatBlue);
    }
    for (let z = fdC - doorW / 2 - 0.6; z > -L / 2 + 1.1; z -= 0.8) {
      if (mdC !== null && z < mdC + doorW / 2 + 0.45 && z > mdC - doorW / 2 - 0.45) continue;
      const hump = onHump(z);
      const b = hump ? 2 * r + 0.12 - 0.3 : baseAt(z);
      const mat = count < 2 ? MAT.seatOrange : count === 2 ? MAT.seatPink : MAT.seatBlue; // 교통약자석 / 임산부 배려석
      seat(-W / 2 + 0.32, z, b, mat);
      if (!(low && z > (mdC ?? -99))) seat(-W / 2 + 0.76, z, b, mat);
      count++;
    }
    for (let i = 0; i < 5; i++) seat(-W / 2 + 0.35 + i * ((W - 0.7) / 4), -L / 2 + 0.5, baseAt(-L / 2 + 0.5), MAT.seatBlue);
    // 기둥/손잡이
    const pole = (x, z, y0) => M.add(GEO.cyl8, MAT.pole, mx(x, (y0 + roofY) / 2, z, 0, 0, 0, 0.022, roofY - y0, 0.022));
    pole(-W / 2 + 1.0, fdC - doorW / 2 - 0.1, floorY); pole(-0.25, fdC - 0.2, floorY);
    if (mdC !== null) { pole(-W / 2 + 0.95, mdC + doorW / 2 + 0.05, floorY); pole(-W / 2 + 0.95, mdC - doorW / 2 - 0.05, floorY); }
    for (let z = L / 2 - 3; z > -L / 2 + 1.5; z -= 2.4) { pole(0.45, z, baseAt(z)); }
    for (const x of [0.5, -0.5]) M.add(GEO.cyl8, MAT.pole, mx(x, roofY - 0.28, -0.3, Math.PI / 2, 0, 0, 0.02, L - 3.4, 0.02));
    // 손잡이 끈 (천장 봉에 매달린 삼각 손잡이)
    for (const x of [0.5, -0.5]) for (let z = L / 2 - 2.2; z > -L / 2 + 1.6; z -= 0.42) {
      M.add(GEO.box, MAT.strap, mx(x, roofY - 0.4, z, 0, 0, 0, 0.035, 0.22, 0.012));
      M.add(GEO.box, MAT.handle, mx(x, roofY - 0.53, z, 0, 0, 0, 0.1, 0.02, 0.025));
      M.add(GEO.box, MAT.handle, mx(x - 0.032, roofY - 0.49, z, 0, 0, -0.55, 0.018, 0.085, 0.025));
      M.add(GEO.box, MAT.handle, mx(x + 0.032, roofY - 0.49, z, 0, 0, 0.55, 0.018, 0.085, 0.025));
    }
    // 하차벨 (STOP): 세로 봉마다 + 창가 벽마다
    const bell = (x, y, z, ry) => { M.add(GEO.cyl8, MAT.bell, mx(x, y, z, Math.PI / 2, ry, 0, 0.07, 0.04, 0.07)); M.add(GEO.box, MAT.handle, mx(x, y, z, 0, ry, 0, 0.05, 0.05, 0.05)); };
    for (let z = L / 2 - 3; z > -L / 2 + 1.5; z -= 2.4) bell(0.45, baseAt(z) + 1.35, z + 0.03, 0);
    for (let z = L / 2 - 2.6; z > -L / 2 + 1.5; z -= 1.6) bell(-W / 2 + 0.07, baseAt(z) + 1.15, z, Math.PI / 2);
    if (mdC !== null) bell(-W / 2 + 0.95, floorY + 1.35, mdC + doorW / 2 + 0.08, 0);
    // 천장 + 조명
    M.add(GEO.box, MAT.busCeil, mx(0, roofY - 0.02, 0, 0, 0, 0, W - 0.1, 0.03, L - 0.12));
    for (const x of [0.75, -0.75]) M.add(GEO.box, MAT.cabinLight, mx(x, roofY - 0.05, -0.2, 0, 0, 0, 0.12, 0.03, L - 3));
    // 운전석
    const dX = W / 2 - 0.62, dZ = L / 2 - 1.25;
    seat(dX, dZ, floorY + 0.12, MAT.seat);
    M.add(GEO.box, MAT.interior, mx(W / 2 - 0.75, floorY + 0.75, L / 2 - 0.45, 0, 0, 0, 1.25, 0.32, 0.6));
    M.add(GEO.box, MAT.interior, mx(-0.1, floorY + 0.5, L / 2 - 0.35, 0, 0, 0, 1.6, 0.25, 0.35));
    // 운전석 보호 칸막이
    M.add(GEO.box, MAT.glass, mx(W / 2 - 1.08, floorY + 1.0, dZ - 0.1, 0, 0, 0, 0.03, 0.9, 0.9));
    // 교통카드 단말기
    M.add(GEO.box, MAT.trim, mx(0.05, floorY + 0.55, L / 2 - 1.55, 0, 0, 0, 0.06, 1.1, 0.06));
    M.add(GEO.box, MAT.trim, mx(0.05, floorY + 1.15, L / 2 - 1.55, 0, 0, 0, 0.18, 0.24, 0.14));
    M.add(GEO.box, MAT.screen, mx(-0.04, floorY + 1.17, L / 2 - 1.55, 0, 0, 0, 0.01, 0.12, 0.1));
    if (mdC !== null) {
      M.add(GEO.box, MAT.trim, mx(-W / 2 + 1.05, floorY + 1.2, mdC + doorW / 2 + 0.06, 0, 0, 0, 0.14, 0.2, 0.06));
      M.add(GEO.box, MAT.screen, mx(-W / 2 + 1.05, floorY + 1.2, mdC + doorW / 2 + 0.02, 0, 0, 0, 0.1, 0.12, 0.01));
    }
    // 하차벨 버튼 (기둥마다 빨간 버튼)
    for (let z = L / 2 - 3; z > -L / 2 + 1.5; z -= 2.4) M.add(GEO.box, MAT.seatPink, mx(0.45, baseAt(z) + 1.25, z - 0.03, 0, 0, 0, 0.06, 0.08, 0.04));
  }

  // ---- 등화 ----
  const lights = lightMats(lod);
  obj.lights = lights;
  const hl = country ? 1.05 : 0.84;
  const rearZ = (x, y) => -(L / 2 - crR + rear.surf(x, y));
  for (const s of [1, -1]) {
    for (const [xo, w] of [[W / 2 - 0.42, 0.34], [W / 2 - 0.78, 0.24]]) M.add(GEO.box, lights.head, mx(s * xo, hl, frontZ(s * xo, hl) - 0.01, 0, 0, 0, w, 0.1, 0.06));
    M.add(GEO.box, lights.head, mx(s * (W / 2 - 0.6), hl + 0.1, frontZ(s * (W / 2 - 0.6), hl + 0.1) - 0.005, 0, s * -0.12, 0, 0.62, 0.025, 0.04));
    M.add(GEO.box, lights.tail, mx(s * (W / 2 - 0.3), 1.0, rearZ(s * (W / 2 - 0.3), 1) - 0.01, 0, 0, 0, 0.2, 0.62, 0.06));
    M.add(GEO.box, lights.tail, mx(s * (W / 2 - 0.5), H - 0.42, rearZ(s * (W / 2 - 0.5), H - 0.42) - 0.01, 0, 0, 0, 0.14, 0.07, 0.05));
    M.add(GEO.box, lights.head, mx(s * (W / 2 - 0.5), H - 0.15, frontZ(s * (W / 2 - 0.5), H - 0.15) - 0.02, 0, 0, 0, 0.1, 0.05, 0.06));
  }
  M.add(GEO.box, lights.indL, mx(W / 2 - 0.25, hl - 0.08, frontZ(W / 2 - 0.25, hl) - 0.02, 0, 0, 0, 0.12, 0.08, 0.06));
  M.add(GEO.box, lights.indR, mx(-(W / 2 - 0.25), hl - 0.08, frontZ(W / 2 - 0.25, hl) - 0.02, 0, 0, 0, 0.12, 0.08, 0.06));
  M.add(GEO.box, lights.indL, mx(W / 2 - 0.3, 1.42, rearZ(W / 2 - 0.3, 1.42) - 0.01, 0, 0, 0, 0.2, 0.16, 0.06));
  M.add(GEO.box, lights.indR, mx(-(W / 2 - 0.3), 1.42, rearZ(W / 2 - 0.3, 1.42) - 0.01, 0, 0, 0, 0.2, 0.16, 0.06));
  M.add(GEO.box, lights.indL, mx(W / 2 + 0.005, 0.95, L / 2 - 1.8, 0, 0, 0, 0.02, 0.06, 0.16));
  M.add(GEO.box, lights.indR, mx(-W / 2 - 0.005, 0.95, L / 2 - 1.8, 0, 0, 0, 0.02, 0.06, 0.16));
  M.add(GEO.box, lights.rev, mx(0.5, 0.62, rearZ(0.5, 0.62) - 0.01, 0, 0, 0, 0.14, 0.1, 0.05));
  M.add(GEO.box, MAT.trim, mx(0, skirt + 0.06, frontZ(0, 0.4) - 0.04, 0, 0, 0, W - 0.5, 0.12, 0.1));
  M.add(GEO.box, MAT.trim, mx(0, skirt + 0.06, rearZ(0, 0.4) + 0.04, 0, 0, 0, W - 0.5, 0.12, 0.1));

  // ---- 토끼귀 미러 ----
  const mirrorFaces = [];
  for (const s of [1, -1]) {
    const ax = s * (W / 2 - 0.12), ay = H - 0.3, az = frontZ(s * (W / 2 - 0.12), H - 0.3) - 0.05;
    const bx = s * (W / 2 + 0.22), by = H - 0.2, bz = L / 2 + 0.48;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const arm = new THREE.Mesh(GEO.cyl8, MAT.black);
    arm.scale.set(0.03, len, 0.03);
    arm.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    body.add(arm);
    M.add(GEO.cyl8, MAT.black, mx(bx, by - 0.3, bz, 0, 0, 0, 0.03, 0.6, 0.03));
    M.add(GEO.box, MAT.black, mx(bx, by - 0.85, bz + 0.02, 0, s * 0.12, 0, 0.3, 0.62, 0.07));
    const face = new THREE.Mesh(GEO.plane, MAT.mirror);
    face.scale.set(0.26, 0.56, 1);
    face.position.set(bx, by - 0.85, bz - 0.02);
    face.rotation.y = Math.PI + s * 0.12;
    body.add(face);
    mirrorFaces.push(face);
  }
  obj.mirrorFaces = mirrorFaces;
  obj.mirrorPos = [new THREE.Vector3(W / 2 + 0.22, H - 1.05, L / 2 + 0.4), new THREE.Vector3(-W / 2 - 0.22, H - 1.05, L / 2 + 0.4)];

  M.build(body, { cast: true });

  // ---- 문 (앞문/뒷문, 2짝 플러그 도어) ----
  const doorH = wTop + 0.04 - (skirt - 0.02);
  const mkDoor = (zc) => {
    const door = { leaves: [], t: 0, target: 0, zc };
    for (const sgn of [1, -1]) {
      const leaf = new THREE.Group();
      const gl = new THREE.Mesh(GEO.box, MAT.doorGlass); gl.scale.set(0.03, doorH - 0.1, doorW / 2 - 0.06); leaf.add(gl);
      const fr = new Merger();
      fr.add(GEO.box, MAT.black, mx(0, doorH / 2 - 0.04, 0, 0, 0, 0, 0.05, 0.08, doorW / 2 - 0.02));
      fr.add(GEO.box, MAT.black, mx(0, -doorH / 2 + 0.04, 0, 0, 0, 0, 0.05, 0.08, doorW / 2 - 0.02));
      fr.add(GEO.box, MAT.black, mx(0, 0, sgn * (doorW / 4 - 0.02), 0, 0, 0, 0.05, doorH, 0.05));
      fr.add(GEO.box, MAT.black, mx(0, 0, -sgn * (doorW / 4 - 0.02), 0, 0, 0, 0.05, doorH, 0.03));
      fr.add(GEO.box, MAT.pole, mx(0.04, 0.1, -sgn * (doorW / 4 - 0.1), 0, 0, 0, 0.02, doorH * 0.5, 0.02));
      fr.build(leaf);
      leaf.position.set(-W / 2 - 0.01, skirt - 0.02 + doorH / 2, zc + sgn * doorW / 4);
      leaf.userData = { sgn, z0: zc + sgn * doorW / 4 };
      body.add(leaf);
      door.leaves.push(leaf);
    }
    obj.doors.push(door);
  };
  mkDoor(fdC);
  if (mdC !== null) mkDoor(mdC);
  obj.updateDoors = (dt) => {
    for (const d of obj.doors) {
      d.t += clamp(d.target - d.t, -dt * 1.1, dt * 1.1);
      const t = d.t, out = Math.min(1, t * 3) * 0.1, slide = Math.max(0, (t - 0.2) / 0.8);
      for (const lf of d.leaves) {
        lf.position.x = -W / 2 - 0.01 - out;
        lf.position.z = lf.userData.z0 + lf.userData.sgn * (doorW / 2 - 0.08) * (slide * slide * (3 - 2 * slide));
      }
    }
  };

  // ---- 와이퍼 ----
  for (const px of [-0.95, 0.12]) {
    const pivot = new THREE.Group();
    pivot.position.set(px, wsBot + 0.06, frontZ(px, wsBot + 0.06) + 0.03);
    pivot.rotation.x = -0.12;
    const arm = new THREE.Mesh(GEO.box, MAT.black);
    arm.scale.set(0.025, country ? 0.75 : 0.95, 0.02);
    arm.position.y = country ? 0.375 : 0.475;
    pivot.add(arm);
    pivot.rotation.z = -1.45;
    body.add(pivot);
    obj.wipers.push(pivot);
  }

  // ---- 행선판 LED ----
  const signF = makeLED(512, 64);
  const sf = new THREE.Mesh(GEO.plane, signF.mat);
  sf.scale.set(W - 0.7, 0.34, 1); sf.position.set(0, H - 0.36, frontZ(0, H - 0.36) + 0.012); sf.rotation.x = -0.25; body.add(sf);
  const signS = makeLED(256, 64);
  const ss = new THREE.Mesh(GEO.plane, signS.mat);
  ss.scale.set(1.1, 0.26, 1); ss.position.set(-W / 2 - 0.012, wTop - 0.25, fdC - doorW / 2 - 0.85); ss.rotation.y = -Math.PI / 2; body.add(ss);
  const signR = makeLED(128, 64);
  const sr = new THREE.Mesh(GEO.plane, signR.mat);
  sr.scale.set(0.7, 0.32, 1); sr.position.set(0, H - 0.3, -L / 2 - 0.012); sr.rotation.y = Math.PI; body.add(sr);
  // 행선판: 앞 = 노선 번호(크게) + 기점 ↔ 종점, 옆 = 번호 + 주요 경유지, 뒤 = 번호
  obj.setSign = (route, dest, color) => {
    const parts = String(dest || '').split(/↔|→|-/).map((t) => t.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    const ends = parts.length > 1 ? `${parts[0]}↔${parts[parts.length - 1]}` : (parts[0] || '');
    const via = parts.length > 2 ? parts[Math.floor(parts.length / 2)] : ends;
    const num = String(route);
    signF.set([{ text: num, box: color || '#2a63d4', size: 0.86, gap: 12 }, { text: ends, size: 0.56, max: 512 - 30 - num.length * 40 }]);
    signS.set([{ text: num, box: color || '#2a63d4', size: 0.78, gap: 10 }, { text: via, size: 0.5, max: 256 - 24 - num.length * 36 }]);
    signR.set([{ text: num, size: num.length > 4 ? 0.62 : 0.86, max: 120 }]);
  };
  obj.setSign(opts.route || '회송', opts.dest || '차고지', opts.routeColor || '#555');

  // 실내 다음 정류장 안내기 / 계기판
  if (!lod) {
    const inner = makeLED(512, 64);
    const im = new THREE.Mesh(GEO.plane, inner.mat);
    im.scale.set(1.3, 0.17, 1); im.position.set(-0.1, roofY - 0.22, L / 2 - 1.7); im.rotation.y = Math.PI; body.add(im);
    obj.setInner = (txt) => inner.set([{ text: txt, size: 0.6, color: '#ff4d3d' }]);
    obj.setInner('안전운행 · 광주 시내버스');
    // ===== 운전석: 넓은 대시보드 · 계기판 후드 · 스위치 판 · 요금 단말기 · 운전대 =====
    const dx = W / 2 - 0.62, fz = L / 2;
    const cockpit = new Merger();
    const dashM = MAT.interior;
    // 앞 유리 아래 대시보드 (차 폭 전체)
    cockpit.add(GEO.box, dashM, mx(0.05, floorY + 0.98, fz - 0.4, -0.18, 0, 0, W - 0.3, 0.12, 0.42));
    cockpit.add(GEO.box, dashM, mx(0.05, floorY + 0.6, fz - 0.36, 0, 0, 0, W - 0.3, 0.7, 0.36));
    // 운전석 계기판 후드 (계기판을 감싸는 갓)
    cockpit.add(GEO.box, MAT.black, mx(dx, floorY + 1.27, fz - 0.58, -0.35, 0, 0, 1.0, 0.4, 0.03));
    cockpit.add(GEO.box, dashM, mx(dx, floorY + 1.47, fz - 0.5, -0.1, 0, 0, 1.08, 0.035, 0.1));
    cockpit.add(GEO.box, dashM, mx(dx + 0.53, floorY + 1.28, fz - 0.6, -0.35, 0, 0, 0.05, 0.44, 0.2));
    cockpit.add(GEO.box, dashM, mx(dx - 0.53, floorY + 1.28, fz - 0.6, -0.35, 0, 0, 0.05, 0.44, 0.2));
    // 운전석 오른쪽 스위치 판 (비스듬히)
    cockpit.add(GEO.box, dashM, mx(dx - 0.78, floorY + 1.0, fz - 0.78, -1.0 + Math.PI / 2, 0.45, 0, 0.5, 0.42, 0.06));
    // 왼쪽 창가 작은 판
    cockpit.add(GEO.box, dashM, mx(dx + 0.62, floorY + 0.95, fz - 0.9, -0.3, -0.3, 0, 0.22, 0.05, 0.36));
    // 요금 단말기 (기둥 + 화면 상자)
    cockpit.add(GEO.cyl8, MAT.trim, mx(dx - 1.02, floorY + 0.55, fz - 1.18, 0, 0, 0, 0.035, 1.1, 0.035));
    cockpit.add(GEO.box, MAT.black, mx(dx - 1.02, floorY + 1.16, fz - 1.18, -0.2, 0.6, 0, 0.2, 0.26, 0.12));
    // 운전대 기둥 · 운전석 의자 등받이
    cockpit.add(GEO.box, MAT.black, mx(dx, floorY + 0.75, fz - 0.86, -0.55, 0, 0, 0.14, 0.7, 0.14));
    cockpit.add(GEO.box, MAT.seat || MAT.black, mx(dx, floorY + 0.95, fz - 1.75, 0.08, 0, 0, 0.52, 0.75, 0.1));
    cockpit.build(body);
    // 아날로그 계기판
    const dash = makeBusCluster(!!spec.ev);
    const dm = new THREE.Mesh(GEO.plane, dash.mat);
    dm.scale.set(0.96, 0.375, 1);
    dm.position.set(dx, floorY + 1.27, fz - 0.64);
    dm.rotation.set(-0.35, Math.PI, 0, 'YXZ');
    body.add(dm);
    obj.dash = dash;
    // 스위치 판 그림 (로커 스위치 · 라벨)
    {
      const st = canvasTex(512, 384, (g, w, h) => {
        g.fillStyle = '#1b1d21'; g.fillRect(0, 0, w, h);
        const names = ['앞문', '뒷문', '비상등', '실내등', '냉방', '난방', '환기', '와이퍼', '안개등', '경음', '무릎', '정차벨'];
        names.forEach((n, i) => { const x = 40 + (i % 4) * 118, y = 40 + Math.floor(i / 4) * 116;
          g.fillStyle = '#2c3036'; g.fillRect(x, y, 86, 56); g.fillStyle = i === 2 ? '#d9261c' : i < 2 ? '#2a7de1' : '#4a5058'; g.fillRect(x + 8, y + 8, 70, 40);
          g.fillStyle = '#dfe4e8'; g.font = '700 20px sans-serif'; g.textAlign = 'center'; g.fillText(n, x + 43, y + 82); });
      });
      const sm = new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 }));
      sm.scale.set(0.46, 0.36, 1); sm.position.set(dx - 0.78, floorY + 1.035, fz - 0.78); sm.rotation.set(-1.0, Math.PI + 0.45, 0, 'YXZ');
      body.add(sm);
      // 요금 단말기 화면
      const ft = canvasTex(128, 160, (g, w, h) => { g.fillStyle = '#0e2a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5dff9a'; g.font = '800 22px sans-serif'; g.textAlign = 'center'; g.fillText('교통카드', 64, 50); g.font = '700 18px sans-serif'; g.fillText('1,250원', 64, 86); g.fillStyle = '#ffd23a'; g.fillText('환승', 64, 120); });
      const fm = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: ft }));
      fm.scale.set(0.15, 0.19, 1); fm.position.set(dx - 1.02 + Math.sin(0.6 + Math.PI) * 0.065, floorY + 1.17, fz - 1.18 + Math.cos(0.6 + Math.PI) * 0.065); fm.rotation.set(-0.2, 0.6 + Math.PI, 0, 'YXZ'); body.add(fm);
    }
    // 운전대: 4스포크 + 큰 허브 (버스는 거의 눕혀진 큰 운전대)
    const sw = new THREE.Group();
    sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.03, 12, 40), MAT.black));
    const hub = new THREE.Mesh(GEO.cyl, MAT.trim); hub.scale.set(0.1, 0.05, 0.1); hub.rotation.x = Math.PI / 2; sw.add(hub);
    for (const ang of [Math.PI / 2 + 0.25, -Math.PI / 2 - 0.25, Math.PI + 0.45, Math.PI - 0.45]) { const sp = new THREE.Mesh(GEO.box, MAT.black); sp.scale.set(0.045, 0.2, 0.028); sp.position.set(Math.sin(ang) * 0.13, -Math.cos(ang) * 0.13, 0); sp.rotation.z = -ang; sw.add(sp); }
    const swg = new THREE.Group();
    swg.position.set(dx, floorY + 1.05, fz - 1.0);
    swg.rotation.x = -0.95;
    swg.add(sw);
    body.add(swg);
    obj.steeringWheel = sw;
    obj.defaultPitch = -0.32;
  }

  // 번호판
  const pm = plateMat(opts.plate || randomPlate('bus'), 'bus');
  const pf = new THREE.Mesh(GEO.plane, pm); pf.scale.set(0.52, 0.11, 1); pf.position.set(0, 0.48, frontZ(0, 0.48) + 0.02); body.add(pf);
  const pr = new THREE.Mesh(GEO.plane, pm); pr.scale.set(0.52, 0.11, 1); pr.position.set(-0.4, 0.62, rearZ(0.4, 0.62) - 0.02); pr.rotation.y = Math.PI; body.add(pr);
  obj.plates = [pf, pr];

  // 바퀴: 앞 단륜, 뒤 복륜
  const wx = W / 2 - 0.33;
  addWheels(obj, group, [
    { x: wx, z: zF, front: true, w: 0.3 }, { x: -wx, z: zF, front: true, w: 0.3 },
    { x: wx, z: zR, w: 0.56 }, { x: -wx, z: zR, w: 0.56 },
  ], r, 0.3, 'bus', lod);

  obj.wb = spec.wb;
  obj.floorY = floorY;
  obj.driverEye = new THREE.Vector3(W / 2 - 0.62, floorY + 1.62, L / 2 - 1.32);
  obj.interiorEye = new THREE.Vector3(-0.2, (low ? floorY + 0.36 : floorY) + 1.55, -L / 2 + 1.4);
  obj.doorPos = { front: new THREE.Vector3(-W / 2, 0, fdC), rear: mdC !== null ? new THREE.Vector3(-W / 2, 0, mdC) : null };
  // 멀리 보이는 버스(간이 모델)에도 창 너머로 앉은 승객이 보이게
  if (lod) {
    const pg = new THREE.Group(); body.add(pg);
    const figs = [];
    let k = 0;
    for (let z = L / 2 - 2.6; z > -L / 2 + 1.4 && figs.length < 14; z -= 0.85) for (const sd of [1, -1]) {
      const f = new THREE.Group();
      const t = new THREE.Mesh(GEO.box, RIDER_TOPS[(k++ * 7) % RIDER_TOPS.length]); t.scale.set(0.36, 0.5, 0.24); t.position.y = 0.3; f.add(t);
      const h = new THREE.Mesh(GEO.sph, RIDER_SKIN); h.scale.set(0.11, 0.13, 0.12); h.position.y = 0.68; f.add(h);
      const hr = new THREE.Mesh(GEO.sph, RIDER_HAIR); hr.scale.set(0.12, 0.08, 0.125); hr.position.set(0, 0.75, -0.01); f.add(hr);
      f.position.set(sd * (W / 2 - 0.45), (low && z < (mdC ?? -99) - doorW / 2 ? floorY + 0.36 : floorY) + 0.5, z);
      f.visible = false; pg.add(f); figs.push(f);
    }
    const order = figs.map((f, i) => i).sort(() => Math.random() - 0.5);
    obj.setRiders = (n) => { order.forEach((i, j) => { figs[i].visible = j < n; }); };
    obj.setRiders(2 + Math.floor(Math.random() * 9));
  }
  obj.headPos = [new THREE.Vector3(0.9, hl, L / 2), new THREE.Vector3(-0.9, hl, L / 2)];
  return obj;
}

export function buildVehicle(spec, opts = {}) {
  return spec.type === 'bus' ? buildBus(spec, opts) : buildCar(spec, opts);
}

// ===== 보행자 =====
const RIDER_TOPS = ['#f4f4f2', '#2a63d4', '#d8383a', '#222428', '#6b8f5a', '#c9b79c', '#3b4a6b', '#e57a9a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const RIDER_SKIN = new THREE.MeshStandardMaterial({ color: 0xe8c3a0, roughness: 0.7 });
const RIDER_HAIR = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8 });
// 사람 (보행자 · 승객): 머리 · 머리카락 · 눈 · 팔 · 무릎이 굽는 다리 · 신발 · 가방
const pm = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const SKINS = ['#f1d0b5', '#e8c3a0', '#dcae88', '#c98e65'].map((c) => pm(c, 0.7));
const HAIRS = ['#14100c', '#1a1410', '#2e1d12', '#4a2c1a', '#7a5230', '#b8b2aa'].map((c) => pm(c, 0.8));
const TOPS = ['#f4f4f2', '#2a63d4', '#d8383a', '#22bfb0', '#f0bd1f', '#222428', '#8a5cc6', '#ee7d22', '#6b8f5a', '#c9b79c', '#3b4a6b', '#e57a9a', '#9aa5b1'].map((c) => pm(c));
const BOTS = ['#111214', '#1f2633', '#2d3e66', '#46505f', '#5b5f66', '#7a5c3a', '#c9c2b2', '#30343a'].map((c) => pm(c, 0.9));
const SHOES = ['#f2f2f2', '#111111', '#5a3b22', '#2a2f3a'].map((c) => pm(c, 0.6));
const BAGS = ['#1b1b1d', '#6b3e26', '#2a4b7c', '#b23a48'].map((c) => pm(c, 0.7));
const EYE = pm('#0d0d0f', 0.4);
const capsuleT = new THREE.CapsuleGeometry(0.19, 0.42, 4, 10);
const limbG = new THREE.CapsuleGeometry(0.055, 0.32, 3, 6);
const legG = new THREE.CapsuleGeometry(0.07, 0.34, 3, 6);
export function buildPed(seed = Math.random()) {
  let k = Math.floor(seed * 1e6) || 1;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const P = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const g = new THREE.Group();
  const female = rnd() < 0.5, kid = rnd() < 0.08, old = !kid && rnd() < 0.15;
  const scale = kid ? 0.7 : (female ? 0.93 : 1.0) + (rnd() - 0.5) * 0.08;
  const sk = P(SKINS), top = P(TOPS), bot = P(BOTS), shoe = P(SHOES);
  const hairM = old ? HAIRS[5] : P(HAIRS.slice(0, 5));
  // 몸통 (어깨가 넓고 앞뒤로 얇게)
  const torso = new THREE.Mesh(capsuleT, top); torso.position.y = 1.2; torso.scale.set(female ? 0.95 : 1.05, 1, 0.72); torso.castShadow = true; g.add(torso);
  if (rnd() < 0.35) { const coat = new THREE.Mesh(GEO.box, P(TOPS)); coat.scale.set(0.42, 0.62, 0.3); coat.position.set(0, 1.12, 0); g.add(coat); }
  const neck = new THREE.Mesh(GEO.cyl8, sk); neck.scale.set(0.055, 0.08, 0.055); neck.position.y = 1.53; g.add(neck);
  const head = new THREE.Mesh(GEO.sph, sk); head.scale.set(0.115, 0.135, 0.125); head.position.y = 1.67; head.castShadow = true; g.add(head);
  for (const sx of [-0.042, 0.042]) { const e = new THREE.Mesh(GEO.sph, EYE); e.scale.setScalar(0.013); e.position.set(sx, 1.685, 0.112); g.add(e); }
  // 머리 모양
  const hs = rnd();
  const hair = new THREE.Mesh(GEO.sph, hairM); hair.scale.set(0.125, 0.1, 0.132); hair.position.set(0, 1.735, -0.012); g.add(hair);
  if (female && hs < 0.6) { const lh = new THREE.Mesh(GEO.box, hairM); lh.scale.set(0.24, hs < 0.3 ? 0.34 : 0.2, 0.1); lh.position.set(0, hs < 0.3 ? 1.55 : 1.62, -0.08); g.add(lh); }
  else if (female) { const bun = new THREE.Mesh(GEO.sph, hairM); bun.scale.setScalar(0.06); bun.position.set(0, 1.76, -0.12); g.add(bun); }
  if (!female && hs < 0.18) { const cap = new THREE.Mesh(GEO.cyl, P(TOPS)); cap.scale.set(0.13, 0.07, 0.13); cap.position.set(0, 1.77, 0); g.add(cap); const br = new THREE.Mesh(GEO.box, cap.material); br.scale.set(0.17, 0.018, 0.12); br.position.set(0, 1.745, 0.13); g.add(br); }
  // 팔 (어깨에서 흔들림)
  const arms = [];
  for (const sd of [1, -1]) {
    const ar = new THREE.Group(); ar.position.set(sd * 0.25, 1.43, 0);
    const up = new THREE.Mesh(limbG, top); up.position.y = -0.22; ar.add(up);
    const hand = new THREE.Mesh(GEO.sph, sk); hand.scale.setScalar(0.05); hand.position.y = -0.45; ar.add(hand);
    ar.rotation.z = sd * 0.06; g.add(ar); arms.push(ar);
  }
  // 다리: 엉덩이 → 무릎 (앉으면 굽힘)
  const legs = [], knees = [];
  for (const sd of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(sd * 0.09, 0.88, 0);
    const th = new THREE.Mesh(legG, bot); th.position.y = -0.21; th.castShadow = true; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const sh = new THREE.Mesh(legG, bot); sh.position.y = -0.2; sh.scale.set(0.9, 1, 0.9); knee.add(sh);
    const foot = new THREE.Mesh(GEO.box, shoe); foot.scale.set(0.11, 0.07, 0.24); foot.position.set(0, -0.42, 0.05); knee.add(foot);
    g.add(hip); legs.push(hip); knees.push(knee);
  }
  if (female && rnd() < 0.3) { const sk2 = new THREE.Mesh(GEO.cyl, bot); sk2.scale.set(0.2, 0.28, 0.16); sk2.position.y = 0.8; g.add(sk2); }
  // 가방 (백팩 · 숄더백)
  const bag = rnd();
  if (bag < 0.3) { const bp = new THREE.Mesh(GEO.box, P(BAGS)); bp.scale.set(0.3, 0.38, 0.15); bp.position.set(0, 1.22, -0.2); g.add(bp); }
  else if (bag < 0.5) { const sb = new THREE.Mesh(GEO.box, P(BAGS)); sb.scale.set(0.08, 0.24, 0.3); sb.position.set(0.3, 1.0, 0); g.add(sb); }
  g.scale.setScalar(scale);
  g.userData.legs = legs; g.userData.knees = knees; g.userData.arms = arms;
  return g;
}
export function animPed(p, phase, moving) {
  const u = p.userData;
  if (u.seated) return;
  const a = moving ? Math.sin(phase) * 0.5 : 0;
  u.legs[0].rotation.x = a; u.legs[1].rotation.x = -a;
  if (u.knees) { u.knees[0].rotation.x = moving ? Math.max(0, -Math.sin(phase)) * 0.6 : 0; u.knees[1].rotation.x = moving ? Math.max(0, Math.sin(phase)) * 0.6 : 0; }
  if (u.arms) { u.arms[0].rotation.x = -a * 0.8; u.arms[1].rotation.x = a * 0.8; }
  if (u.elbows) { u.elbows[0].rotation.x = moving ? -0.25 - Math.max(0, a) * 0.6 : -0.08; u.elbows[1].rotation.x = moving ? -0.25 - Math.max(0, -a) * 0.6 : -0.08; }
  if (u.hq) { const b = moving ? Math.abs(Math.cos(phase)) * 0.035 : Math.sin(performance.now() / 900) * 0.004; for (const k of ['torso', 'head']) if (u[k]) u[k].position.y = (k === 'torso' ? 0.88 : 1.74) + b; for (const h of u.legs) h.position.y = 0.88 + b * 0.6; for (const r of u.arms) r.position.y = 1.44 + b; }
}
// 앉은 자세 (버스 좌석): 엉덩이 높이 = 사람 바닥에서 0.88
export function holdPed(p, on = true) { // 서서 천장 손잡이 잡기
  const u = p.userData; if (!u.arms || !u.arms.length) return; const a = u.arms[u.holdArm ?? (u.holdArm = Math.random() < 0.5 ? 0 : 1)];
  a.rotation.x = on ? -2.95 : 0; a.rotation.z = on ? (u.holdArm ? -0.12 : 0.12) : 0;
}
export function sitPed(p, on = true) {
  const u = p.userData; u.seated = on;
  for (const h of u.legs) h.rotation.x = on ? -1.45 : 0;
  for (const k of u.knees || []) k.rotation.x = on ? 1.45 : 0;
  for (const a of u.arms || []) a.rotation.x = on ? -0.5 : 0;
}

// ===== 내 캐릭터 =====
export const AVATAR_OPTS = {
  skin: ['#f1d0b5', '#e3b48f', '#c98e65'],
  hair: ['#1a1410', '#4a2c1a', '#8a5a2b', '#d9b26a', '#2b3a8a'],
  style: [['short', '짧은 머리'], ['long', '긴 머리'], ['cap', '모자']],
  top: ['#f4f4f2', '#2a63d4', '#d8383a', '#22bfb0', '#f0bd1f', '#222428', '#8a5cc6', '#ee7d22'],
  bottom: ['#111214', '#2d3e66', '#5b5f66', '#7a5c3a', '#e6e2da'],
};
export function buildAvatar(o = {}) {
  // 내 캐릭터 (고품질): 둥근 몸통 · 어깨 · 팔꿈치 · 무릎 관절 · 얼굴(눈 · 눈썹 · 코 · 입 · 귀) · 머리 모양 · 옷 주름선
  const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const sk = M(o.skin || '#f1d0b5', 0.65), hairM = M(o.hair || '#1a1410', 0.7), topM = M(o.top || '#f4f4f2', 0.85), botM = M(o.bottom || '#111214', 0.9);
  const shoeM = M('#f2f2f2', 0.5), soleM = M('#2a2a2a', 0.8), eyeW = M('#ffffff', 0.3), pupil = M('#1a1410', 0.3), lip = M('#c46a5a', 0.6);
  const trimM = M(new THREE.Color(o.top || '#f4f4f2').multiplyScalar(0.8), 0.85);
  const cap = (r, h, mat, seg = 12) => new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 6, seg), mat);
  const g = new THREE.Group();
  // 몸통: 가슴이 넓고 허리가 잘록한 회전체
  const prof = [[0.0, 0.0], [0.17, 0.0], [0.175, 0.08], [0.16, 0.2], [0.18, 0.36], [0.21, 0.5], [0.215, 0.58], [0.19, 0.64], [0.07, 0.69], [0, 0.69]].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoG = new THREE.LatheGeometry(prof, 20); const torso = new THREE.Mesh(torsoG, topM); torso.scale.set(1, 1, 0.72); torso.position.y = 0.88; g.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 20), M('#2a2420', 0.5)); belt.scale.z = 0.72; belt.position.y = 0.9; g.add(belt);
  const hipsG = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), botM); hipsG.scale.set(1, 0.55, 0.75); hipsG.position.y = 0.9; g.add(hipsG);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 16), trimM); collar.rotation.x = Math.PI / 2; collar.position.y = 1.56; g.add(collar);
  // 목 · 머리
  const neck = cap(0.055, 0.06, sk); neck.position.y = 1.6; g.add(neck);
  const headG = new THREE.Group(); headG.position.y = 1.74; g.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), sk); head.scale.set(0.112, 0.135, 0.122); headG.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), sk); jaw.scale.set(0.09, 0.07, 0.1); jaw.position.set(0, -0.07, 0.015); headG.add(jaw);
  for (const sx of [-1, 1]) {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), eyeW); ew.scale.set(0.02, 0.014, 0.01); ew.position.set(sx * 0.042, 0.01, 0.112); headG.add(ew);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), pupil); pu.scale.set(0.009, 0.011, 0.006); pu.position.set(sx * 0.042, 0.009, 0.12); headG.add(pu);
    const br = new THREE.Mesh(GEO.box, hairM); br.scale.set(0.038, 0.008, 0.01); br.position.set(sx * 0.043, 0.04, 0.115); br.rotation.z = sx * -0.12; headG.add(br);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), sk); ear.scale.set(0.014, 0.03, 0.022); ear.position.set(sx * 0.112, 0.0, 0.0); headG.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), sk); nose.rotation.x = Math.PI / 2 - 0.3; nose.position.set(0, -0.02, 0.128); headG.add(nose);
  const mouth = new THREE.Mesh(GEO.box, lip); mouth.scale.set(0.034, 0.007, 0.006); mouth.position.set(0, -0.062, 0.113); headG.add(mouth);
  // 머리카락: 정수리 덮개 + 앞머리 (+ 긴 머리 / 모자)
  const st = o.style || 'short';
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hairTop.scale.set(0.12, 0.145, 0.13); hairTop.position.set(0, 0.012, -0.006); headG.add(hairTop);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, Math.PI * 0.25, Math.PI * 1.5, Math.PI * 0.4, Math.PI * 0.35), hairM); back.scale.set(0.118, 0.14, 0.128); back.rotation.y = Math.PI; headG.add(back);
  const fringe = new THREE.Mesh(GEO.box, hairM); fringe.scale.set(0.17, 0.035, 0.03); fringe.position.set(0, 0.085, 0.1); fringe.rotation.x = -0.35; headG.add(fringe);
  if (st === 'long') { const lh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.2, 4, 12), hairM); lh.scale.set(1.15, 1, 0.5); lh.position.set(0, -0.12, -0.07); headG.add(lh); }
  if (st === 'cap') {
    const cm = M(o.hair === '#2b3a8a' ? '#d8383a' : '#2b3a8a', 0.6);
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), cm); c1.scale.set(0.125, 0.11, 0.135); c1.position.y = 0.035; headG.add(c1);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), cm); brim.position.set(0, 0.04, 0.11); brim.scale.z = 1.1; headG.add(brim);
  }
  // 팔: 어깨 → 팔꿈치 → 손 (반팔 소매)
  const arms = [], elbows = [];
  for (const sd of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(sd * 0.235, 1.44, 0);
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), topM); sh.add(delt);
    const sleeve = cap(0.062, 0.12, topM); sleeve.position.y = -0.1; sh.add(sleeve);
    const up = cap(0.048, 0.18, sk); up.position.y = -0.17; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    const fo = cap(0.043, 0.18, sk); fo.position.y = -0.12; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), sk); hand.scale.set(0.042, 0.06, 0.03); hand.position.y = -0.27; el.add(hand);
    sh.rotation.z = sd * 0.07; g.add(sh); arms.push(sh); elbows.push(el);
  }
  // 다리: 엉덩이 → 무릎 → 신발
  const legs = [], knees = [];
  for (const sd of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(sd * 0.088, 0.88, 0);
    const th = cap(0.075, 0.28, botM); th.position.y = -0.2; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const cf = cap(0.062, 0.28, botM); cf.position.y = -0.19; knee.add(cf);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), shoeM); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1, 1, 0.75); shoe.position.set(0, -0.41, 0.05); knee.add(shoe);
    const sole = new THREE.Mesh(GEO.box, soleM); sole.scale.set(0.11, 0.02, 0.26); sole.position.set(0, -0.445, 0.05); knee.add(sole);
    g.add(hip); legs.push(hip); knees.push(knee);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.userData.legs = legs; g.userData.knees = knees; g.userData.arms = arms; g.userData.elbows = elbows; g.userData.torso = torso; g.userData.head = headG; g.userData.hq = true;
  return g;
}

// ===== 전동열차 (가상의 한빛선) =====
export function buildTrain(nCars = 5) {
  const group = new THREE.Group();
  const CL = 21, gap = 0.6, Wd = 3.1;
  const white = paintMat('#f1f3f4'), blue = paintMat('#1f6fc2'), teal = paintMat('#22bfb0');
  const headM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 2.5 });
  const tailM = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 1.5 });
  const total = nCars * CL + (nCars - 1) * gap;
  const cars = [];
  for (let i = 0; i < nCars; i++) {
    const M = new Merger();
    const zc = total / 2 - CL / 2 - i * (CL + gap);
    const cab = i === 0 || i === nCars - 1;
    const dir = i === 0 ? 1 : -1;
    const bodyL = cab ? CL - 4.5 : CL;
    const bz = cab ? zc - dir * 2.25 : zc;
    M.add(GEO.box, white, mx(0, 2.3, bz, 0, 0, 0, Wd, 2.6, bodyL));
    M.add(GEO.box, MAT.black, mx(0, 3.0, bz, 0, 0, 0, Wd + 0.02, 0.75, bodyL - 1));
    M.add(GEO.box, blue, mx(0, 2.45, bz, 0, 0, 0, Wd + 0.03, 0.18, bodyL));
    M.add(GEO.box, teal, mx(0, 1.35, bz, 0, 0, 0, Wd + 0.03, 0.14, bodyL));
    M.add(GEO.box, white, mx(0, 3.75, bz, 0, 0, 0, Wd - 0.3, 0.3, bodyL));
    for (const dz of [-CL / 4, CL / 4]) for (const s of [1, -1]) M.add(GEO.box, MAT.trim, mx(s * (Wd / 2 + 0.02), 2.15, zc + dz, 0, 0, 0, 0.03, 2.1, 1.3));
    for (const dz of [-(CL / 2 - 3.5), CL / 2 - 3.5]) M.add(GEO.box, MAT.under, mx(0, 0.85, zc + dz, 0, 0, 0, 2.5, 0.8, 3.2));
    M.add(GEO.box, MAT.under, mx(0, 0.95, zc, 0, 0, 0, Wd - 0.4, 0.3, CL - 1));
    if (cab) {
      // 앞코: 옆모습을 그려서 폭 방향으로 밀어냄
      const s = new THREE.Shape();
      s.moveTo(0, 1.0); s.lineTo(3.6, 1.0); s.quadraticCurveTo(4.6, 1.2, 4.5, 1.9); s.quadraticCurveTo(3.8, 3.7, 0, 3.9); s.lineTo(0, 1.0);
      const g = new THREE.ExtrudeGeometry(s, { depth: Wd - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2, curveSegments: 8 });
      g.translate(0, 0, -(Wd - 0.2) / 2); g.rotateY(-Math.PI / 2);
      if (dir < 0) g.rotateY(Math.PI);
      g.translate(0, 0, zc + dir * (CL / 2 - 4.5));
      M.add(g, white);
      const w = new THREE.Shape();
      w.moveTo(0.6, 3.0); w.lineTo(3.2, 2.55); w.quadraticCurveTo(2.6, 3.4, 0.6, 3.6); w.lineTo(0.6, 3.0);
      const wg = new THREE.ExtrudeGeometry(w, { depth: Wd - 0.5, bevelEnabled: false });
      wg.translate(0, 0, -(Wd - 0.5) / 2); wg.scale(1, 1, 1); wg.rotateY(-Math.PI / 2);
      if (dir < 0) wg.rotateY(Math.PI);
      wg.translate(0, 0.02, zc + dir * (CL / 2 - 4.5));
      M.add(wg, MAT.black);
      for (const sx of [0.9, -0.9]) {
        M.add(GEO.box, headM, mx(sx, 1.5, zc + dir * (CL / 2 - 0.1), 0, 0, 0, 0.5, 0.14, 0.1));
        M.add(GEO.box, tailM, mx(sx * 1.2, 1.25, zc + dir * (CL / 2 - 0.05), 0, 0, 0, 0.2, 0.1, 0.1));
      }
    }
    if (i === 1) { // 팬터그래프
      M.add(GEO.box, MAT.trim, mx(0, 4.25, zc, 0.5, 0, 0, 0.06, 0.06, 1.6));
      M.add(GEO.box, MAT.trim, mx(0, 4.25, zc + 0.7, -0.5, 0, 0, 0.06, 0.06, 1.6));
      M.add(GEO.box, MAT.trim, mx(0, 4.62, zc + 0.35, 0, 0, 0, 1.4, 0.05, 0.1));
    }
    const cg = new THREE.Group();
    M.build(cg, { cast: true });
    for (const m of cg.children) m.position.z -= zc;
    cg.userData.zc = zc;
    group.add(cg); cars.push(cg);
  }
  return { group, length: total, cars, CL, gap };
}
