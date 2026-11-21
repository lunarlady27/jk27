// ===================== 터보 서킷 — 트랙 · 풍경 =====================
import * as THREE from 'three';

export const ROAD = 9;      // 도로 절반 폭
export const CURB = 1.4;    // 연석 폭
export const WALL = 16;     // 방호벽까지 거리
const S = 1.3;              // 트랙 크기 배율

export const TRACKS = [
  {
    id: 'beach', name: '해변 서킷', desc: '완만한 곡선이 이어지는 바닷가 · 처음이라면 여기!', icon: '🏖️',
    theme: { sky: 0x8fd3ff, fog: 0xcdeeff, fogN: 260, fogF: 900, ground: 0xe8d59a, sea: 0x2f9fe0, wall: 0x2f8fd0, wall2: 0xffffff, sun: 1.15, hemi: 0.75, night: false, scen: 'palm' },
    pts: [[0, 0], [200, 0], [300, 60], [320, 180], [250, 260], [120, 240], [60, 320], [-80, 330], [-180, 250], [-170, 120], [-90, 60]],
    items: [0.18, 0.47, 0.76],
  },
  {
    id: 'city', name: '네온 시티', desc: '밤의 도심 · 직각에 가까운 코너가 많아요', icon: '🌃',
    theme: { sky: 0x0b0f2a, fog: 0x141a3c, fogN: 120, fogF: 620, ground: 0x23263a, wall: 0xff3d9a, wall2: 0x36e0ff, sun: 0.35, hemi: 0.55, night: true, scen: 'city' },
    pts: [[0, 0], [250, 0], [300, 40], [300, 200], [260, 230], [180, 220], [150, 150], [60, 140], [40, 250], [-10, 275], [-120, 260], [-160, 200], [-160, 40], [-110, 0]],
    items: [0.15, 0.45, 0.72],
  },
  {
    id: 'snow', name: '설산 고개', desc: '눈 덮인 산길 · 연속 헤어핀을 드리프트로!', icon: '🏔️',
    theme: { sky: 0xc9dcf0, fog: 0xe6eef7, fogN: 160, fogF: 700, ground: 0xf4f8ff, wall: 0xd04040, wall2: 0xffffff, sun: 1.0, hemi: 0.85, night: false, scen: 'pine' },
    pts: [[0, 0], [150, -40], [280, 20], [300, 140], [200, 180], [120, 120], [40, 180], [60, 300], [-60, 340], [-200, 280], [-220, 140], [-120, 80]],
    items: [0.2, 0.5, 0.8],
  },
  {
    id: 'canyon', name: '붉은 협곡', desc: '긴 직선과 급커브 · 최고 속도 승부', icon: '🏜️',
    theme: { sky: 0xffc28a, fog: 0xf0b585, fogN: 200, fogF: 850, ground: 0xc8703a, wall: 0x7a3a1a, wall2: 0xf2d0a0, sun: 1.2, hemi: 0.7, night: false, scen: 'rock' },
    pts: [[0, 0], [340, 0], [380, 50], [340, 110], [150, 120], [110, 170], [160, 230], [330, 250], [350, 320], [280, 360], [-120, 360], [-190, 300], [-140, 220], [-200, 140], [-150, 40]],
    items: [0.12, 0.42, 0.7],
  },
];

// ---------- 트랙 계산 ----------
export function buildTrack(def) {
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S)), true, 'centripetal');
  const len = curve.getLength();
  const N = Math.round(len / 2);
  const sp = curve.getSpacedPoints(N); sp.pop();
  const P = new Float32Array(N * 2), T = new Float32Array(N * 2), Nn = new Float32Array(N * 2), K = new Float32Array(N), D = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) { P[i * 2] = sp[i].x; P[i * 2 + 1] = sp[i].z; }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = P[b * 2] - P[a * 2], tz = P[b * 2 + 1] - P[a * 2 + 1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    T[i * 2] = tx; T[i * 2 + 1] = tz; Nn[i * 2] = tz; Nn[i * 2 + 1] = -tx;
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 14) % N; const c = T[i * 2] * T[j * 2] + T[i * 2 + 1] * T[j * 2 + 1];
    K[i] = Math.acos(Math.max(-1, Math.min(1, c)));
    D[i + 1] = D[i] + Math.hypot(P[((i + 1) % N) * 2] - P[i * 2], P[((i + 1) % N) * 2 + 1] - P[i * 2 + 1]);
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, P[i * 2]); maxX = Math.max(maxX, P[i * 2]); minZ = Math.min(minZ, P[i * 2 + 1]); maxZ = Math.max(maxZ, P[i * 2 + 1]); }
  // 가까운 지점 찾기용 격자
  const cell = 24, grid = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(P[i * 2] / cell) + ',' + Math.floor(P[i * 2 + 1] / cell); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  return { def, N, P, T, Nn, K, D, len: D[N], bounds: { minX, maxX, minZ, maxZ }, cell, grid };
}

// 근처 탐색 (hint 주변) → 못 찾으면 격자로 전체 탐색
export function nearest(tr, x, z, hint) {
  const { N, P } = tr; let best = hint, bd = Infinity;
  for (let o = -25; o <= 45; o++) { const i = (hint + o + N) % N; const dx = P[i * 2] - x, dz = P[i * 2 + 1] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
  if (bd > 40 * 40) {
    const cx = Math.floor(x / tr.cell), cz = Math.floor(z / tr.cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const L = tr.grid.get((cx + a) + ',' + (cz + b)); if (!L) continue; for (const i of L) { const dx = P[i * 2] - x, dz = P[i * 2 + 1] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
  }
  return best;
}
export function distToTrack(tr, x, z) {
  const cx = Math.floor(x / tr.cell), cz = Math.floor(z / tr.cell); let bd = Infinity;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const L = tr.grid.get((cx + a) + ',' + (cz + b)); if (!L) continue; for (const i of L) { const dx = tr.P[i * 2] - x, dz = tr.P[i * 2 + 1] - z; bd = Math.min(bd, dx * dx + dz * dz); } }
  return Math.sqrt(bd);
}

// ---------- 텍스처 ----------
function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function roadTex(night) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = night ? '#2a2c38' : '#4a4d55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = Math.random() * 40 - 20; g.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},.08)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#f4f4f4'; g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    g.fillStyle = night ? '#ffe25a' : '#ffffff'; g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  });
}
const curbTex = (c2) => canvasTex(16, 64, (g, w, h) => { g.fillStyle = '#e8312f'; g.fillRect(0, 0, w, h / 2); g.fillStyle = c2; g.fillRect(0, h / 2, w, h / 2); });

// 도로처럼 길게 이어진 띠
function ribbon(tr, a, b, y, mat, vScale, vertical = 0) {
  const { N, P, Nn, D } = tr; const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const j = i % N, px = P[j * 2], pz = P[j * 2 + 1], nx = Nn[j * 2], nz = Nn[j * 2 + 1], v = D[i] / vScale;
    if (vertical) { pos.push(px + nx * a, y, pz + nz * a, px + nx * a, y + vertical, pz + nz * a); }
    else { pos.push(px + nx * a, y, pz + nz * a, px + nx * b, y, pz + nz * b); }
    uv.push(0, v, 1, v);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  mat.side = THREE.DoubleSide; const m = new THREE.Mesh(g, mat); return m;
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- 장면 만들기 ----------
export function buildScene(tr, scene) {
  const th = tr.def.theme, root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, th.fogN, th.fogF);
  const hemi = new THREE.HemisphereLight(th.night ? 0x6a78ff : 0xffffff, th.night ? 0x201030 : 0x806a50, th.hemi); root.add(hemi);
  const sun = new THREE.DirectionalLight(th.night ? 0x9aa8ff : 0xfff2dd, th.sun); sun.position.set(200, 400, 120); root.add(sun);
  const B = tr.bounds, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, R = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2 + 160;
  if (th.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: th.sea })); sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -0.6, cz); root.add(sea);
    const land = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshLambertMaterial({ color: th.ground })); land.rotation.x = -Math.PI / 2; land.position.set(cx, 0, cz); root.add(land);
  } else {
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: th.ground })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(cx, 0, cz); root.add(gnd);
  }
  // 갓길 (풀/눈/흙)
  const shoulderC = { palm: 0x7fbf55, city: 0x1a1c28, pine: 0xdfe8f2, rock: 0xb0602e }[th.scen];
  root.add(ribbon(tr, -WALL, WALL, 0.01, new THREE.MeshLambertMaterial({ color: shoulderC }), 20));
  const rt = roadTex(th.night); root.add(ribbon(tr, -ROAD, ROAD, 0.03, new THREE.MeshLambertMaterial({ map: rt }), 22));
  const ct = curbTex('#ffffff');
  root.add(ribbon(tr, -ROAD - CURB, -ROAD, 0.04, new THREE.MeshLambertMaterial({ map: ct }), 6));
  root.add(ribbon(tr, ROAD, ROAD + CURB, 0.04, new THREE.MeshLambertMaterial({ map: ct }), 6));
  // 방호벽
  const wt = canvasTex(16, 64, (g, w, h) => { g.fillStyle = '#' + th.wall.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h / 2); g.fillStyle = '#' + th.wall2.toString(16).padStart(6, '0'); g.fillRect(0, h / 2, w, h / 2); });
  const wm = th.night ? new THREE.MeshBasicMaterial({ map: wt, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map: wt, side: THREE.DoubleSide });
  root.add(ribbon(tr, -WALL, 0, 0, wm, 8, 1.3)); root.add(ribbon(tr, WALL, 0, 0, wm, 8, 1.3));
  // 출발선
  const st = canvasTex(64, 16, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 4, y * 4, 4, 4); } }, false);
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 3), new THREE.MeshLambertMaterial({ map: st }));
  sl.rotation.x = -Math.PI / 2; const yaw = Math.atan2(tr.T[0], tr.T[1]); const slG = new THREE.Group(); slG.rotation.y = yaw; slG.position.set(tr.P[0], 0, tr.P[1]); sl.position.set(0, 0.05, 0); slG.add(sl); root.add(slG);
  // 출발 아치
  const arch = new THREE.Group(); arch.rotation.y = yaw; arch.position.set(tr.P[0], 0, tr.P[1]);
  const pm = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), pm); p.position.set(s * (ROAD + 2.5), 4.5, 0); arch.add(p); }
  const banner = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#ff3d6e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('한판 HANPAN · TURBO CIRCUIT', w / 2, h / 2 + 2); }, false);
  const bn = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 6, 2.2, 0.6), new THREE.MeshBasicMaterial({ map: banner })); bn.position.y = 8.6; arch.add(bn); root.add(arch);

  // 풍경
  const r = rng(tr.N * 7 + tr.def.id.length);
  const spots = []; let tries = 0;
  while (spots.length < 520 && tries++ < 9000) {
    const x = cx + (r() * 2 - 1) * R, z = cz + (r() * 2 - 1) * R;
    if (th.sea && Math.hypot(x - cx, z - cz) > R - 8) continue;
    const d = distToTrack(tr, x, z); if (d < WALL + 6 || (d > 120 && r() < 0.7)) continue;
    spots.push([x, z, r(), r()]);
  }
  const dummy = new THREE.Object3D();
  const inst = (geo, mat, list, f) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((s, i) => { f(dummy, s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }); root.add(m); return m; };
  if (th.scen === 'palm') {
    inst(new THREE.CylinderGeometry(0.4, 0.7, 9, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }), spots, (o, s) => { o.position.set(s[0], 4.5, s[1]); o.rotation.set(0.15 * (s[2] - 0.5), 0, 0.15 * (s[3] - 0.5)); o.scale.setScalar(0.8 + s[2] * 0.5); });
    inst(new THREE.ConeGeometry(4.5, 3, 7), new THREE.MeshLambertMaterial({ color: 0x3fb850, side: THREE.DoubleSide }), spots, (o, s) => { const k = 0.8 + s[2] * 0.5; o.position.set(s[0], 9.4 * k, s[1]); o.rotation.set(Math.PI, s[3] * 6, 0); o.scale.setScalar(k); });
    const um = spots.filter((s) => s[3] < 0.12);
    inst(new THREE.ConeGeometry(2.6, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0xff6a8a }), um, (o, s) => { o.position.set(s[0] + 5, 2.6, s[1] + 3); o.rotation.set(0, 0, 0); o.scale.setScalar(1); });
  } else if (th.scen === 'pine') {
    inst(new THREE.ConeGeometry(3.2, 9, 7), new THREE.MeshLambertMaterial({ color: 0x24563a }), spots, (o, s) => { const k = 0.7 + s[2] * 0.8; o.position.set(s[0], 4.5 * k, s[1]); o.scale.setScalar(k); o.rotation.set(0, 0, 0); });
    inst(new THREE.ConeGeometry(1.8, 3.4, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), spots, (o, s) => { const k = 0.7 + s[2] * 0.8; o.position.set(s[0], 8 * k, s[1]); o.scale.setScalar(k); });
    const far = []; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; far.push([cx + Math.cos(a) * (R + 180), cz + Math.sin(a) * (R + 180), r(), r()]); }
    inst(new THREE.ConeGeometry(90, 160, 6), new THREE.MeshLambertMaterial({ color: 0x8a9ab8 }), far, (o, s) => { const k = 0.6 + s[2] * 0.8; o.position.set(s[0], 70 * k, s[1]); o.scale.set(k, k, k); });
    inst(new THREE.ConeGeometry(38, 50, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), far, (o, s) => { const k = 0.6 + s[2] * 0.8; o.position.set(s[0], 136 * k, s[1]); o.scale.set(k, k, k); });
  } else if (th.scen === 'rock') {
    inst(new THREE.DodecahedronGeometry(5, 0), new THREE.MeshLambertMaterial({ color: 0x9a4a24 }), spots.filter((s) => s[3] < 0.5), (o, s) => { o.position.set(s[0], 2, s[1]); o.rotation.set(s[2] * 3, s[3] * 9, 0); o.scale.set(1 + s[2] * 2, 0.6 + s[3] * 3, 1 + s[3]); });
    inst(new THREE.CylinderGeometry(0.6, 0.8, 5, 7), new THREE.MeshLambertMaterial({ color: 0x4f8a3a }), spots.filter((s) => s[3] >= 0.85), (o, s) => { o.position.set(s[0], 2.5, s[1]); o.rotation.set(0, 0, 0); o.scale.set(1, 0.8 + s[2], 1); });
    const far = []; for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; far.push([cx + Math.cos(a) * (R + 140), cz + Math.sin(a) * (R + 140), r(), r()]); }
    inst(new THREE.CylinderGeometry(60, 75, 90, 7), new THREE.MeshLambertMaterial({ color: 0xa8502a }), far, (o, s) => { o.position.set(s[0], 45 * (0.7 + s[2]), s[1]); o.scale.set(0.8 + s[3], 0.7 + s[2], 0.8 + s[2]); });
  } else if (th.scen === 'city') {
    const wtex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#10142a'; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) { const on = Math.random() < 0.45; g.fillStyle = on ? (Math.random() < 0.3 ? '#ff9ad8' : '#ffe9a0') : '#1c2244'; g.fillRect(x, y, 6, 6); } });
    const bl = spots.filter((s) => s[3] < 0.75);
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: wtex, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 0.9 }), bl, (o, s) => { const hgt = 12 + s[2] * s[2] * 70; o.position.set(s[0], hgt / 2, s[1]); o.scale.set(10 + s[3] * 10, hgt, 10 + s[2] * 8); o.rotation.set(0, 0, 0); });
    // 가로등
    const lamps = []; for (let i = 0; i < tr.N; i += 22) for (const sd of [-1, 1]) lamps.push([tr.P[i * 2] + tr.Nn[i * 2] * (WALL + 1.5) * sd, tr.P[i * 2 + 1] + tr.Nn[i * 2 + 1] * (WALL + 1.5) * sd, sd]);
    inst(new THREE.CylinderGeometry(0.2, 0.25, 8, 5), new THREE.MeshLambertMaterial({ color: 0x444a5a }), lamps, (o, s) => { o.position.set(s[0], 4, s[1]); o.scale.setScalar(1); });
    inst(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), lamps, (o, s) => { o.position.set(s[0], 8.2, s[1]); });
    const stars = new THREE.BufferGeometry(); const sp = []; for (let i = 0; i < 600; i++) { const a = r() * Math.PI * 2, e = 0.15 + r() * 0.9; sp.push(cx + Math.cos(a) * 1500 * Math.cos(e), 1500 * Math.sin(e), cz + Math.sin(a) * 1500 * Math.cos(e)); }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); root.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 3, fog: false, sizeAttenuation: false })));
  }
  // 관중석 (출발선 옆)
  const gs = new THREE.Group(); gs.rotation.y = yaw; gs.position.set(tr.P[0], 0, tr.P[1]);
  const crowdT = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#556'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${Math.random() * 360},70%,60%)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3, 0, 7); g.fill(); } }, false);
  for (const s of [-1, 1]) { const st2 = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 60), new THREE.MeshLambertMaterial({ map: crowdT })); st2.position.set(s * (WALL + 5), 2.5, -10); gs.add(st2); }
  root.add(gs);
  return root;
}
