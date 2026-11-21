// 기차역 · 공항 이동: 역/공항 앞에서 E → 표 사기 → 이동 장면 → 도착 도시에서 내려서 걷기
// 노선 · 시간 · 요금은 실제와 비슷하게 맞춘 게임용 값이에요.
import * as THREE from 'three';
import { GEO, mx, Merger } from './util.js';

const X = (lon) => -(lon - 126.885) * 91060, Z = (lat) => (lat - 35.155) * 110950;
export const HUBS = [
  { id: 'gj_songjeong', name: '광주송정역', city: '광주', kind: 'rail', reg: null, lat: 35.13784, lon: 126.79023, srt: true, ktx: true },
  { id: 'gj_airport', name: '광주공항', city: '광주', kind: 'air', reg: null, lat: 35.12639, lon: 126.80889, apron: [0.0016, 0.0012] },
  { id: 'se_suseo', name: '수서역', city: '서울', kind: 'rail', reg: 'seoul', lat: 37.4855, lon: 127.1040, srt: true },
  { id: 'se_yongsan', name: '용산역', city: '서울', kind: 'rail', reg: 'seoul', lat: 37.5299, lon: 126.9648, ktx: true },
  { id: 'se_seoul', name: '서울역', city: '서울', kind: 'rail', reg: 'seoul', lat: 37.5547, lon: 126.9707, ktx: true, arex: true },
  { id: 'dj_daejeon', name: '대전역', city: '대전', kind: 'rail', reg: 'daejeon', lat: 36.3326, lon: 127.4342, srt: true, ktx: true },
  { id: 'dg_dongdaegu', name: '동대구역', city: '대구', kind: 'rail', reg: 'daegu', lat: 35.8794, lon: 128.6286, srt: true, ktx: true },
  { id: 'bs_busan', name: '부산역', city: '부산', kind: 'rail', reg: 'busan', lat: 35.1151, lon: 129.0422, srt: true, ktx: true },
  { id: 'gp_gimpo', name: '김포공항', city: '서울 강서', kind: 'air', reg: 'gimpo', lat: 37.5622, lon: 126.8011, arex: true, apron: [0.0035, 0.002] },
  { id: 'gh_gimhae', name: '김해공항', city: '부산 강서', kind: 'air', reg: 'gimhae', lat: 35.1730, lon: 128.9475, apron: [0.0025, -0.002] },
  { id: 'jj_jeju', name: '제주공항', city: '제주', kind: 'air', reg: 'jeju', lat: 33.5070, lon: 126.4930, apron: [0.0028, -0.003] },
  { id: 'ulsan_hub', name: '태화강역', city: '울산', kind: 'rail', reg: 'ulsan', lat: 35.539, lon: 129.353, ktx: true, xbus: false },
  { id: 'changwon_hub', name: '창원중앙역', city: '창원', kind: 'rail', reg: 'changwon', lat: 35.243, lon: 128.696, ktx: true, xbus: false },
  { id: 'jeonju_hub', name: '전주역', city: '전주', kind: 'rail', reg: 'jeonju', lat: 35.85, lon: 127.161, ktx: true, xbus: false },
  { id: 'cheongju_hub', name: '청주고속버스터미널', city: '청주', kind: 'xbus', reg: 'cheongju', lat: 36.626, lon: 127.432, xbus: true },
  { id: 'suwon_hub', name: '수원역', city: '수원', kind: 'rail', reg: 'suwon', lat: 37.2659, lon: 127.0001, ktx: true, xbus: false },
  { id: 'pohang_hub', name: '포항역', city: '포항', kind: 'rail', reg: 'pohang', lat: 36.0716, lon: 129.342, ktx: true, xbus: false },
  { id: 'gangneung_hub', name: '강릉역', city: '강릉', kind: 'rail', reg: 'gangneung', lat: 37.764, lon: 128.899, ktx: true, xbus: false },
  { id: 'chuncheon_hub', name: '춘천역', city: '춘천', kind: 'rail', reg: 'chuncheon', lat: 37.8847, lon: 127.717, itx: true, xbus: false },
  { id: 'mokpo_hub', name: '목포역', city: '목포', kind: 'rail', reg: 'mokpo', lat: 34.791, lon: 126.387, ktx: true, xbus: false },
  { id: 'yeosu_hub', name: '여수엑스포역', city: '여수', kind: 'rail', reg: 'yeosu', lat: 34.753, lon: 127.748, ktx: true, xbus: false },
  { id: 'suncheon_hub', name: '순천역', city: '순천', kind: 'rail', reg: 'suncheon', lat: 34.946, lon: 127.503, ktx: true, xbus: false },
  { id: 'gyeongju_hub', name: '경주고속버스터미널', city: '경주', kind: 'xbus', reg: 'gyeongju', lat: 35.8385, lon: 129.2045, xbus: true },
  { id: 'gj_xbus', name: '광주 유스퀘어 (종합버스터미널)', city: '광주', kind: 'xbus', reg: null, lat: 35.1600, lon: 126.8790, xbus: false },
  { id: 'se_xbus', name: '서울고속버스터미널', city: '서울', kind: 'xbus', reg: 'seoul', lat: 37.5045, lon: 127.0050, xbus: false },
  { id: 'dj_xbus', name: '대전복합터미널', city: '대전', kind: 'xbus', reg: 'daejeon', lat: 36.3505, lon: 127.4375, xbus: false },
  { id: 'bs_xbus', name: '부산서부시외버스터미널 (사상)', city: '부산', kind: 'xbus', reg: 'busan', lat: 35.1645, lon: 128.9810, xbus: false },
  { id: 'ic_xbus', name: '인천종합터미널', city: '인천', kind: 'xbus', reg: 'incheon', lat: 37.4420, lon: 126.7010, xbus: false },
  { id: 'dg_xbus', name: '동대구 복합환승센터 (버스)', city: '대구', kind: 'xbus', reg: 'daegu', lat: 35.8775, lon: 128.6270, xbus: false },
].map((h) => ({ ...h, x: X(h.lon), z: Z(h.lat) }));
const HB = Object.fromEntries(HUBS.map((h) => [h.id, h]));
const km = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) / 1000;

// 이 역/공항에서 갈 수 있는 곳
export function tripsFrom(h) {
  const out = [];
  const rail = (svc, b, speed, perKm, extra = 0) => {
    const d = km(h, b) * 1.25; const min = Math.round(d / speed * 60 + 8 + extra);
    out.push({ svc, to: b, min, fare: Math.round((d * perKm + 2600) / 100) * 100, kind: 'rail' });
  };
  if (h.kind === 'rail') {
    // KTX · SRT 노선(같은 노선 안에서만 바로 감) · 그 밖은 무궁화 · ITX (300km 안)
    const LINES = [
      ['gj_songjeong', 'mokpo_hub', 'se_yongsan', 'se_suseo'],
      ['se_yongsan', 'se_suseo', 'jeonju_hub', 'suncheon_hub', 'yeosu_hub'],
      ['se_seoul', 'se_suseo', 'dj_daejeon', 'dg_dongdaegu', 'bs_busan', 'ulsan_hub', 'pohang_hub'],
      ['se_seoul', 'se_suseo', 'dg_dongdaegu', 'changwon_hub'],
      ['se_seoul', 'gangneung_hub'],
    ];
    const SRT = new Set(['se_suseo', 'gj_songjeong', 'mokpo_hub', 'dj_daejeon', 'dg_dongdaegu', 'bs_busan', 'jeonju_hub', 'suncheon_hub', 'yeosu_hub', 'pohang_hub', 'changwon_hub', 'ulsan_hub']);
    for (const b of HUBS) {
      if (b === h || b.kind !== 'rail' || (h.reg === 'seoul' && b.reg === 'seoul')) continue;
      const same = LINES.some((L) => L.includes(h.id) && L.includes(b.id));
      let any = false;
      if (same && SRT.has(h.id) && SRT.has(b.id) && (h.id === 'se_suseo' || b.id === 'se_suseo' || h.reg !== 'seoul' && b.reg !== 'seoul')) { rail('SRT', b, 200, 108); any = true; }
      if (same && h.id !== 'se_suseo' && b.id !== 'se_suseo') { rail('KTX', b, 195, 112, 4); any = true; }
      if (!any && km(h, b) < 300) { if (h.itx || b.itx) rail('ITX-청춘', b, 95, 70, 5); else rail('무궁화호', b, 78, 58, 10); }
    }
  }
  if (h.kind === 'xbus') {
    for (const b of HUBS) { if (b === h || b.kind !== 'xbus') continue; const d = km(h, b) * 1.18; out.push({ svc: '고속버스', to: b, min: Math.round(d / 82 * 60 + 15), fare: Math.round((d * 92 + 3000) / 100) * 100, kind: 'xbus' }); }
  }
  if (h.arex) { const b = h.id === 'se_seoul' ? HB.gp_gimpo : HB.se_seoul; out.push({ svc: '공항철도', to: b, min: 22, fare: 1450, kind: 'metro' }); }
  if (h.kind === 'air') {
    const AIR = { gj_airport: ['gp_gimpo', 'jj_jeju'], gp_gimpo: ['gj_airport', 'jj_jeju', 'gh_gimhae'], gh_gimhae: ['gp_gimpo', 'jj_jeju'], jj_jeju: ['gp_gimpo', 'gj_airport', 'gh_gimhae'] };
    for (const id of AIR[h.id] || []) { const b = HB[id], d = km(h, b); out.push({ svc: '항공', to: b, min: Math.round(d / 520 * 60 + 25), fare: Math.round((d * 260 + 30000) / 1000) * 1000, kind: 'air' }); }
  }
  // 같은 목적지에 SRT · KTX 둘 다 있으면 둘 다 보여 줌 (시간 순)
  return out.sort((a, b) => a.min - b.min);
}
export function hubNear(x, z, r = 110) {
  let best = null, bd = r;
  for (const h of HUBS) { const d = Math.min(Math.hypot(h.x - x, h.z - z), h.curb ? Math.hypot(h.curb.x - x, h.curb.z - z) : 1e9); if (d < bd) { bd = d; best = h; } }
  return best;
}

// ===== 공항 꾸미기: 서 있는 여객기 · 관제탑 =====
function airliner(M, x, z, rot, livery) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const body = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: livery, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.2 });
  const eng = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.5 });
  let q = P(0, 0); M.add(GEO.cyl, body, mx(q[0], 3.4, q[1], Math.PI / 2, rot, 0, 1.9, 36, 1.9));
  q = P(0, 18.5); M.add(GEO.cyl, body, mx(q[0], 3.3, q[1], Math.PI / 2, rot, 0, 1.6, 2.5, 1.5));
  q = P(0, 19.6); M.add(GEO.box, glass, mx(q[0], 3.9, q[1], 0.3, rot, 0, 1.6, 0.5, 0.6));
  q = P(0, -19); M.add(GEO.cyl, body, mx(q[0], 3.8, q[1], Math.PI / 2, rot, 0, 1.2, 4, 1.0));
  q = P(0, -19.5); M.add(GEO.box, tail, mx(q[0], 7.6, q[1], -0.35, rot, 0, 0.3, 6.5, 4.2));
  for (const sd of [1, -1]) {
    q = P(sd * 9, -1); M.add(GEO.box, body, mx(q[0], 2.9, q[1], 0, rot + sd * 0.35, 0, 17, 0.35, 4.4));
    q = P(sd * 5.5, 1.5); M.add(GEO.cyl, eng, mx(q[0], 1.8, q[1], Math.PI / 2, rot, 0, 1.05, 3.6, 1.05));
    q = P(sd * 3.5, -19.5); M.add(GEO.box, body, mx(q[0], 4.0, q[1], 0, rot + sd * 0.3, 0, 6, 0.25, 2.2));
  }
  for (const [lx, lz] of [[0, 14], [2.6, -1], [-2.6, -1]]) { q = P(lx, lz); M.add(GEO.cyl8, eng, mx(q[0], 0.85, q[1], 0, 0, 0, 0.25, 1.7, 0.25)); }
  // 창문 줄
  for (const sd of [1, -1]) { q = P(sd * 1.88, 0); M.add(GEO.box, glass, mx(q[0], 3.85, q[1], 0, rot, 0, 0.04, 0.32, 30)); }
}
export function decorateAirport(scene, h) {
  if (!h.apron || h._decor) return; h._decor = true;
  const M = new Merger();
  const ax = h.x + X(h.lon + h.apron[1]) - X(h.lon), az = h.z + Z(h.lat + h.apron[0]) - Z(h.lat);
  const rot = Math.atan2(ax - h.x, az - h.z);
  const cols = [0x1f5fe0, 0xd9261c, 0x14a06b, 0xf2a20c];
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 60, px = ax + Math.cos(rot) * off, pz = az - Math.sin(rot) * off;
    airliner(M, px, pz, rot + Math.PI, cols[(i + h.id.length) % cols.length]);
  }
  // 관제탑
  const tx = ax + Math.cos(rot) * 160, tz = az - Math.sin(rot) * 160;
  const conc = new THREE.MeshStandardMaterial({ color: 0xd8d9d6, roughness: 0.8 }), gl = new THREE.MeshStandardMaterial({ color: 0x2b4a63, roughness: 0.15, metalness: 0.4 });
  M.add(GEO.cyl, conc, mx(tx, 18, tz, 0, 0, 0, 2.2, 36, 2.2));
  M.add(GEO.cyl, gl, mx(tx, 38, tz, 0, 0, 0, 4.2, 4, 4.2));
  M.add(GEO.cyl, conc, mx(tx, 40.5, tz, 0, 0, 0, 4.6, 1, 4.6));
  M.build(scene);
}

// ===== 이동 장면 (기차 · 비행기) =====
export function playTrip(trip, from, onMid) {
  return new Promise((resolve) => {
    const el = document.createElement('div'); el.id = 'tripScene';
    el.innerHTML = `<canvas></canvas><div class="tp-info"><b>${trip.svc} · ${from.name} → ${trip.to.name}</b><span>${Math.floor(trip.min / 60) ? Math.floor(trip.min / 60) + '시간 ' : ''}${trip.min % 60}분 · ${trip.fare.toLocaleString()}원</span><i><em></em></i><small>도착지 지도를 준비하는 중...</small></div><button class="tp-skip">건너뛰기 ▶▶</button>`;
    document.body.appendChild(el);
    const cv = el.querySelector('canvas'), g = cv.getContext('2d'), bar = el.querySelector('em'), note = el.querySelector('small');
    const dpr = Math.min(2, devicePixelRatio || 1); let W = 0, H = 0;
    const rs = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; };
    rs(); addEventListener('resize', rs);
    const air = trip.kind === 'air', DUR = 9, t0 = performance.now(); let ready = false, skip = false, done = false;
    Promise.resolve(onMid && onMid()).then(() => { ready = true; note.textContent = '도착 준비 완료'; }).catch(() => { ready = true; });
    el.querySelector('.tp-skip').onclick = () => { skip = true; };
    const hills = Array.from({ length: 40 }, (_, i) => ({ x: i / 40, h: 0.08 + Math.random() * 0.12 }));
    const clouds = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random() * 0.5, s: 0.5 + Math.random() }));
    const color = trip.svc === 'SRT' ? '#6b2c91' : trip.svc === 'KTX' ? '#1d4fa3' : trip.svc === '공항철도' ? '#0b8fd6' : trip.svc === '무궁화호' ? '#d9261c' : trip.svc === 'ITX-청춘' ? '#2a9d5c' : '#1f5fe0';
    function frame(now) {
      if (done) return;
      const T = (now - t0) / 1000, k = Math.min(1, T / DUR);
      bar.style.width = (k * 100) + '%';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hr = Math.sin(k * Math.PI);
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, air ? '#3d8fe0' : '#6fb3ec'); sky.addColorStop(1, air ? '#cfe8ff' : '#e8f4ff'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (air) {
        const alt = Math.min(1, Math.min(k / 0.25, (1 - k) / 0.25));
        clouds.forEach((c) => { c.x -= 0.004 * c.s; if (c.x < -0.2) c.x += 1.4; const cy = H * (0.2 + c.y + alt * 0.25); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(c.x * W, cy, 90 * c.s, 26 * c.s, 0, 0, 7); g.fill(); });
        const gy = H * (0.72 + alt * 0.4); g.fillStyle = '#5c8a3a'; g.fillRect(0, gy, W, H); g.fillStyle = '#3f6b28'; hills.forEach((h0) => { h0.x -= 0.002 * (1 - alt * 0.8); if (h0.x < -0.05) h0.x += 1.05; g.beginPath(); g.arc(h0.x * W, gy, h0.h * H, Math.PI, 0); g.fill(); });
        // 비행기 (옆모습)
        const px = W * 0.5, py = H * (0.62 - alt * 0.2) + Math.sin(T * 2) * 3, pitch = k < 0.2 ? -0.12 : k > 0.82 ? 0.08 : 0;
        g.save(); g.translate(px, py); g.rotate(pitch); g.fillStyle = '#f4f6f8'; g.beginPath(); g.ellipse(0, 0, 170, 22, 0, 0, 7); g.fill();
        g.fillStyle = color; g.beginPath(); g.moveTo(-150, -8); g.lineTo(-185, -70); g.lineTo(-140, -70); g.lineTo(-100, -10); g.fill();
        g.fillStyle = '#c9ced4'; g.beginPath(); g.moveTo(-20, 6); g.lineTo(-70, 40); g.lineTo(-40, 40); g.lineTo(30, 8); g.fill(); g.fillRect(-35, 18, 46, 16);
        g.fillStyle = '#1b2633'; for (let i = -110; i < 120; i += 16) g.fillRect(i, -7, 8, 7); g.beginPath(); g.ellipse(150, -4, 14, 7, 0, 0, 7); g.fill();
        g.fillStyle = color; g.fillRect(-160, 6, 300, 5); g.restore();
      } else {
        // 산 · 들 · 전신주가 지나가는 창밖 + 고속열차
        g.fillStyle = '#8fb6a0'; g.beginPath(); g.moveTo(0, H * 0.55); for (let i = 0; i <= 20; i++) g.lineTo(i / 20 * W, H * (0.45 + 0.05 * Math.sin(i * 1.7 + T * 0.2))); g.lineTo(W, H); g.lineTo(0, H); g.fill();
        g.fillStyle = '#6a9a4a'; g.fillRect(0, H * 0.6, W, H * 0.4);
        g.fillStyle = '#4f7a35'; hills.forEach((h0) => { h0.x -= 0.006; if (h0.x < -0.05) h0.x += 1.05; g.beginPath(); g.arc(h0.x * W, H * 0.62, h0.h * H * 0.6, Math.PI, 0); g.fill(); });
        const off = (T * 900) % 240; g.fillStyle = '#5a5a5a'; if (trip.kind !== 'xbus') for (let x = -off; x < W; x += 240) { g.fillRect(x, H * 0.38, 6, H * 0.3); g.fillRect(x - 20, H * 0.4, 46, 4); }
        g.strokeStyle = '#333'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, H * 0.405); g.lineTo(W, H * 0.405); g.stroke();
        g.fillStyle = '#7a6e62'; g.fillRect(0, H * 0.8, W, H * 0.03); g.fillStyle = '#444'; for (let x = -((T * 1400) % 30); x < W; x += 30) g.fillRect(x, H * 0.83, 18, 6);
        if (trip.kind === 'xbus') {
          g.fillStyle = '#3a3d42'; g.fillRect(0, H * 0.78, W, H * 0.12); g.fillStyle = '#fff'; for (let x = -((T * 1400) % 80); x < W; x += 80) g.fillRect(x, H * 0.84, 40, 4);
          const by = H * 0.6 + Math.sin(T * 18) * 1, bx = W * 0.25, bw = W * 0.5, bh = H * 0.2;
          g.fillStyle = '#f4f6f8'; g.beginPath(); g.moveTo(bx, by + bh); g.lineTo(bx, by + 10); g.quadraticCurveTo(bx, by, bx + 14, by); g.lineTo(bx + bw - 30, by); g.quadraticCurveTo(bx + bw, by + 4, bx + bw, by + 40); g.lineTo(bx + bw, by + bh); g.fill();
          g.fillStyle = '#0f6b4a'; g.fillRect(bx, by + bh * 0.62, bw, bh * 0.12);
          g.fillStyle = '#1b2633'; g.fillRect(bx + 10, by + bh * 0.16, bw - 30, bh * 0.32);
          g.fillStyle = '#222'; for (const wx of [bx + bw * 0.18, bx + bw * 0.8]) { g.beginPath(); g.arc(wx, by + bh, 18, 0, 7); g.fill(); g.fillStyle = '#aaa'; g.beginPath(); g.arc(wx, by + bh, 8, 0, 7); g.fill(); g.fillStyle = '#222'; }
          g.fillStyle = '#fff'; g.font = '800 18px sans-serif'; g.fillText('고속버스', bx + 20, by + bh * 0.88);
        } else {
        // 열차 (앞쪽이 오른쪽)
        const ty = H * 0.66, bob = Math.sin(T * 30) * 0.8, len = W * 1.4, x0 = W * 0.88 - len;
        g.fillStyle = '#f2f4f6'; g.beginPath(); g.moveTo(x0, ty + bob); g.lineTo(W * 0.78, ty + bob); g.quadraticCurveTo(W * 0.92, ty + bob + 6, W * 0.95, ty + 70 + bob); g.lineTo(x0, ty + 70 + bob); g.fill();
        g.fillStyle = color; g.fillRect(x0, ty + 46 + bob, W * 0.94 - x0, 10);
        g.fillStyle = '#1b2633'; for (let x = W * 0.75; x > x0; x -= 46) g.fillRect(x - 30, ty + 16 + bob, 28, 18); g.beginPath(); g.moveTo(W * 0.82, ty + 12 + bob); g.lineTo(W * 0.9, ty + 22 + bob); g.lineTo(W * 0.82, ty + 28 + bob); g.fill();
        g.fillStyle = '#222'; for (let x = W * 0.86; x > x0; x -= 140) { g.beginPath(); g.arc(x, ty + 74 + bob, 9, 0, 7); g.arc(x - 40, ty + 74 + bob, 9, 0, 7); g.fill(); }
        }
      }
      void hr;
      if ((k >= 1 || skip) && ready) {
        done = true; el.classList.add('out'); removeEventListener('resize', rs);
        setTimeout(() => { el.remove(); }, 500); resolve(); return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// 역 · 공항 위 큰 안내판 (멀리서도 보이게)
export function hubSign(scene, h) {
  if (h._sign) return; h._sign = true;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = h.kind === 'air' ? '#0b5fa5' : h.kind === 'xbus' ? '#0f6b4a' : '#1d2a6b'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 504, 152, 26) : g.rect(4, 4, 504, 152); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#fff'; g.font = '900 62px sans-serif'; g.textAlign = 'center'; g.font = (h.name.length > 9 ? '900 40px' : '900 62px') + ' sans-serif'; g.fillText((h.kind === 'air' ? '✈ ' : h.kind === 'xbus' ? '🚌 ' : '🚄 ') + h.name, 256, 84);
  g.font = '700 30px sans-serif'; g.fillStyle = '#ffd23a';
  g.fillText(h.kind === 'air' ? '항공권 · 비행기 타기 (E)' : h.kind === 'xbus' ? '고속버스 타기 (E)' : ([h.srt ? 'SRT' : '', h.ktx ? 'KTX' : '', h.arex ? '공항철도' : ''].filter(Boolean).join(' · ') || '열차') + ' 타기 (E)', 256, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, fog: false }));
  sp.scale.set(26, 8.1, 1); sp.position.set(h.x, 30, h.z); scene.add(sp);
  const pole = new THREE.Mesh(GEO.cyl8, new THREE.MeshStandardMaterial({ color: 0x777b80 })); pole.scale.set(0.4, 26, 0.4); pole.position.set(h.x, 13, h.z); scene.add(pole);
}
