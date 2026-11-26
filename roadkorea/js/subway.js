// ===================== 지하철 노선 · 실시간 열차 위치 =====================
// 노선 · 역 · 선로 모양은 실제 지도(OSM)에서, 열차 운행은 시간표로 계산 (실제 운행 정보를 받아오는 것은 아님).
// 같은 시각이면 언제 열어도 같은 자리 → 지도에서 "지금" 열차 위치를 볼 수 있음.
export const SUBWAY = { lines: [] };
const V = 11.5;      // 역 사이 평균 속도 (m/s, 약 41km/h)
const DWELL = 25;    // 역 정차 (초)
const HEADWAY = { seoul: 240, gwangju: 480, daejeon: 480, busan: 360, daegu: 420, incheon: 420 };
const CITY_KO = { seoul: '서울', gwangju: '광주', daejeon: '대전', busan: '부산', daegu: '대구', incheon: '인천' };
// 관리 모드 설정 (노선별 배차간격 · 운행 중지) — key: 도시:노선id
export const METRO_CFG = { map: {} };
export const lineKey = (L) => L.city + ':' + L.id;
export function applyMetroCfg(map) {
  if (map) METRO_CFG.map = map;
  for (const L of SUBWAY.lines) { const c = METRO_CFG.map[lineKey(L)] || {}; L.hw = c.hw || L.hw0; L.off = !!c.off; }
}

export function addSubwayLines(lines, city) {
  for (const L0 of lines || []) {
    if (SUBWAY.lines.some((x) => x.id === L0.id && x.city === city)) continue;
    const pts = L0.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const st = L0.stations.map(([name, x, z, d]) => ({ name, x, z, d: Math.min(d, cum[cum.length - 1]) }));
    // 역 도착 시각 (첫 역 출발 기준)
    const arr = st.map((s, i) => s.d / V + i * DWELL);
    const L = { ...L0, city, cityKo: CITY_KO[city] || city, cum, len: cum[cum.length - 1], st, arr, T: arr[arr.length - 1], hw0: HEADWAY[city] || 360 };
    const c = METRO_CFG.map[lineKey(L)] || {}; L.hw = c.hw || L.hw0; L.off = !!c.off;
    SUBWAY.lines.push(L);
  }
}
// 노선 위 거리 d 의 점
function posAt(L, d) {
  const c = L.cum, p = L.pts;
  let lo = 0, hi = c.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= d) lo = m; else hi = m - 1; }
  const i = Math.min(lo, p.length - 2), seg = c[i + 1] - c[i] || 1, t = Math.max(0, Math.min(1, (d - c[i]) / seg));
  return { x: p[i][0] + (p[i + 1][0] - p[i][0]) * t, z: p[i][1] + (p[i + 1][1] - p[i][1]) * t, hd: Math.atan2(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) };
}
// 출발 뒤 el 초가 지난 열차 (dir 1 = 첫 역 → 끝 역)
function trainAt(L, el, dir) {
  const n = L.st.length;
  // 정방향 기준 시간표를 역방향은 거울처럼 씀
  const A = dir > 0 ? L.arr : L.arr.map((a, i) => L.T - L.arr[n - 1 - i]);
  const D = dir > 0 ? L.st.map((s) => s.d) : L.st.map((s, i) => L.len - L.st[n - 1 - i].d);
  const name = (i) => (dir > 0 ? L.st[i].name : L.st[n - 1 - i].name);
  for (let i = 0; i < n; i++) {
    if (el < A[i]) {
      // i-1 역에서 i 역으로 가는 중
      const dep = A[i - 1] + DWELL, tt = A[i] - dep, u = Math.max(0, Math.min(1, (el - dep) / (tt || 1)));
      const dd = D[i - 1] + (D[i] - D[i - 1]) * u;
      return { d: dir > 0 ? dd : L.len - dd, next: name(i), at: null };
    }
    if (el < A[i] + DWELL || i === n - 1) return { d: dir > 0 ? D[i] : L.len - D[i], next: name(Math.min(n - 1, i + 1)), at: name(i) };
  }
  return null;
}
// 지금 운행 중인 모든 열차
export function trainsNow(t = Date.now() / 1000, city = null) {
  const out = [];
  for (const L of SUBWAY.lines) {
    if ((city && L.city !== city) || L.off) continue;
    for (const dir of [1, -1]) {
      const base = Math.floor(t / L.hw) * L.hw + (dir > 0 ? 0 : L.hw / 2);
      for (let k = 0; ; k++) {
        const dep = base - k * L.hw, el = t - dep;
        if (el < 0) continue;
        if (el > L.T) break;
        const r = trainAt(L, el, dir); if (!r) continue;
        const p = posAt(L, r.d);
        out.push({ line: L, x: p.x, z: p.z, hd: dir > 0 ? p.hd : p.hd + Math.PI, dir, at: r.at, next: r.next, end: dir > 0 ? L.st[L.st.length - 1].name : L.st[0].name });
      }
    }
  }
  return out;
}
// 어떤 역에 다음 열차가 오기까지 (방향별, 초)
export function nextArrivals(L, stIdx, t = Date.now() / 1000) {
  const n = L.st.length, res = [];
  if (L.off) return res;
  for (const dir of [1, -1]) {
    const i = dir > 0 ? stIdx : n - 1 - stIdx;
    const A = dir > 0 ? L.arr : L.arr.map((a, k) => L.T - L.arr[n - 1 - k]);
    if ((dir > 0 && stIdx === n - 1) || (dir < 0 && stIdx === 0)) continue;
    const off = dir > 0 ? 0 : L.hw / 2;
    // 이 역에 닿는 시각 = 출발 + A[i] → 다음 출발 찾기
    const k = Math.ceil((t - A[i] - off) / L.hw);
    const when = k * L.hw + off + A[i] - t;
    res.push({ dir, end: dir > 0 ? L.st[n - 1].name : L.st[0].name, sec: Math.max(0, when) });
  }
  return res;
}
// 지도에 노선 · 역 · 열차 그리기 (view: mapView 결과)
export function drawSubway(g, view, opts = {}) {
  const { X, Y, sc, w, h } = view;
  const city = opts.city || null;
  const lines = SUBWAY.lines.filter((L) => !city || L.city === city);
  if (!lines.length) return 0;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const L of lines) {
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 6.5; g.beginPath();
    L.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();
    g.strokeStyle = L.color; g.lineWidth = 4; g.stroke();
  }
  // 역
  const showName = sc > (opts.nameScale || 0.12);
  g.font = `800 ${sc > 0.4 ? 12 : 10}px "Noto Sans KR", sans-serif`; g.textAlign = 'center';
  const drawn = new Set();
  for (const L of lines) for (const s of L.st) {
    const px = X(s.x), py = Y(s.z);
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
    g.fillStyle = '#fff'; g.strokeStyle = L.color; g.lineWidth = 2.2; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    if (showName && !drawn.has(s.name)) { drawn.add(s.name); g.fillStyle = 'rgba(0,0,0,.65)'; g.fillText(s.name, px + 1, py - 7); g.fillStyle = '#fff'; g.fillText(s.name, px, py - 8); }
  }
  // 열차
  const trains = trainsNow(opts.t, city);
  for (const tr of trains) {
    const px = X(tr.x), py = Y(tr.z);
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
    g.save(); g.translate(px, py); g.rotate(-tr.hd);
    g.fillStyle = tr.line.color; g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    const s = sc > 0.3 ? 1.4 : 1;
    g.beginPath(); g.moveTo(0, -8 * s); g.lineTo(5 * s, -3 * s); g.lineTo(5 * s, 7 * s); g.lineTo(-5 * s, 7 * s); g.lineTo(-5 * s, -3 * s); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
  return trains.length;
}
