// ===================== 실제 장소 (학교 · 쇼핑 · 빵집 · 병원 …) · 어린이 보호구역 =====================
import { W, edgesNear } from './roadnet.js';

// 장소 종류: 이름 · 아이콘 · 내비 분류
export const PLACE_CATS = {
  es: { ko: '초등학교', icon: '🏫', nav: 'school' }, ms: { ko: '중학교', icon: '🏫', nav: 'school' }, hs: { ko: '고등학교', icon: '🏫', nav: 'school' },
  school: { ko: '학교', icon: '🏫', nav: 'school' }, univ: { ko: '대학교', icon: '🎓', nav: 'school' },
  mall: { ko: '백화점 · 쇼핑몰', icon: '🛍️', nav: 'shop' }, mart: { ko: '대형마트', icon: '🛒', nav: 'shop' }, bakery: { ko: '빵집', icon: '🥐', nav: 'shop' },
  cafe: { ko: '카페', icon: '☕', nav: 'shop' }, food: { ko: '음식점', icon: '🍽️', nav: 'shop' },
  hospital: { ko: '병원', icon: '🏥', nav: 'life' }, gov: { ko: '관공서', icon: '🏛️', nav: 'life' }, post: { ko: '우체국', icon: '📮', nav: 'life' },
  library: { ko: '도서관', icon: '📚', nav: 'life' }, hotel: { ko: '호텔', icon: '🏨', nav: 'life' },
  park: { ko: '공원', icon: '🌳', nav: 'poi' }, museum: { ko: '박물관 · 미술관', icon: '🏛️', nav: 'poi' }, attraction: { ko: '명소', icon: '📍', nav: 'poi' },
  stadium: { ko: '경기장', icon: '🏟️', nav: 'poi' }, culture: { ko: '공연장 · 영화관', icon: '🎭', nav: 'poi' }, station: { ko: '기차역', icon: '🚉', nav: 'poi' },
};

// 장소를 지도 · 내비에 넣음 (같은 이름이 가까이 이미 있으면 건너뜀)
export function addPlaces(pois, city, lm) {
  const near = new Map();
  const key = (x, z) => Math.floor(x / 300) + ',' + Math.floor(z / 300);
  for (const l of W.landmarks) { const k = key(l.x, l.z); let a = near.get(k); if (!a) near.set(k, a = []); a.push(l); }
  let n = 0;
  for (const [name, cat, x, z] of pois) {
    if (!PLACE_CATS[cat]) continue;
    const k = key(x, z);
    if ((near.get(k) || []).some((l) => l.name === name)) continue;
    lm(name, x, z, cat === 'park' || cat === 'univ' || cat === 'stadium' ? 120 : 40, { place: cat, city });
    let a = near.get(k); if (!a) near.set(k, a = []); a.push({ name });
    n++;
  }
  return n;
}

// 초등학교 둘레(약 150m) 도로: 어린이 보호구역 (시속 30km · 빨간 노면 · 표지판)
export function markSchoolZones(pois, filter = () => true) {
  let n = 0;
  for (const [, cat, x, z] of pois) {
    if (cat !== 'es') continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const e of edgesNear(x + dx * 120, z + dz * 120)) {
        if (e.schoolZone || !filter(e) || e.elevated || e.ramp || e.corr || e.kind === 'highway' || e.kind === 'ic' || e.osm <= 1) continue;
        const s = Math.max(0, Math.min(e.len, (x - e.a.x) * e.dir.x + (z - e.a.z) * e.dir.z));
        const px = e.a.x + e.dir.x * s, pz = e.a.z + e.dir.z * s;
        if (Math.hypot(px - x, pz - z) > 150) continue;
        e.schoolZone = true; n++;
        if (e.limit > 30) e.limit = 30;
        for (const L of [e.fwd, e.bwd]) if (L && L.limit > 30) L.limit = 30;
      }
    }
  }
  return n;
}
