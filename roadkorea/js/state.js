import { BY_ID, trimStd } from './data.js';
import { randomPlate } from './models.js';

const KEY = 'hanbit_drive_save_v1';
export const S = {
  money: 50000000,
  owned: [],
  current: null,
  settings: { traffic: 'normal', peds: true, quality: 'high', mirrors: true, timeSpeed: 30, volume: 0.7, voice: true, pads: true, navAuto: true, navVoice: true, nav3D: true },
  nav: { fav: {}, recent: [] },
  admin: null,
  world: { hour: 13, weather: 'clear', spawn: 'city' },
  nextUid: 1,
  visited: [],
  stats: { km: 0, pax: 0 },
  mp: { name: '', ch: 1 },
  avatar: { skin: '#f1d0b5', hair: '#1a1410', style: 'short', top: '#f4f4f2', bottom: '#111214' },
  quest: null,
};

export function newOwned(id, opts = {}) {
  const spec = BY_ID[id];
  return {
    uid: S.nextUid++, id,
    color: spec.type === 'bus' ? '#ffffff' : '#eeeeec',
    wheel: 'std', plate: randomPlate(spec.type === 'bus' ? 'bus' : 'car'),
    tune: { engine: 0, brake: 0, handling: 0 },
    livery: spec.livery || 'teal', company: '광주 시내버스', fuel: 100,
    trim: 0, opts: [],
    ...opts,
  };
}
// 옵션 보유 여부 (트림 기본 포함 + 따로 고른 옵션). 버스는 모든 기능 기본
export function hasOpt(own, id) {
  if (!own) return false;
  const spec = BY_ID[own.id]; if (!spec) return false;
  if (spec.type === 'bus') return id !== 'roof';
  return (own.opts || []).includes(id) || trimStd(spec, own.trim || 0).includes(id);
}
export const trimName = (own) => { const spec = BY_ID[own.id]; const t = spec?.trims?.[own.trim || 0]; return t ? (spec.trims.some((x) => x.pt !== t.pt) ? t.pt + ' ' : '') + t.n : ''; };

// 저장 내용 S 에 덮기 (기본값과 합치기)
function applySave(d) {
  Object.assign(S, d, { settings: { ...S.settings, ...(d.settings || {}) }, world: { ...S.world, ...(d.world || {}) } });
  S.owned = (S.owned || []).filter((o) => BY_ID[o.id]);
}
let localFresh = true;
export function load() {
  try {
    const t = localStorage.getItem(KEY);
    if (t) { applySave(JSON.parse(t)); localFresh = false; }
  } catch (e) { /* 저장소 사용 불가 */ }
  fixup();
}
function fixup() {
  if (!S.owned.length) {
    // 처음 시작: 모닝 1대 지급 (헤드업 디스플레이·고속도로 주행 보조 2 포함)
    const o = newOwned('sr_momo', { color: '#eeeeec', opts: ['hud', 'hda2'], gift: true });
    S.owned.push(o); S.current = o.uid;
  }
  // 옵션 제도가 생기기 전에 산 차: 자율주행을 계속 쓸 수 있게 hda2를 주고, 첫 차에는 HUD도 선물
  if (!S.optV) {
    S.optV = 1;
    S.owned.forEach((o, i) => { if (!Array.isArray(o.opts)) { o.opts = ['hda2']; o.trim = 0; if (i === 0) o.opts.push('hud'); } });
  }
  if (!S.owned.find((o) => o.uid === S.current)) S.current = S.owned[0].uid;
  if (!S.mp || typeof S.mp !== 'object') S.mp = { name: '', ch: 1 };
  if (!S.avatar || typeof S.avatar !== 'object') S.avatar = { skin: '#f1d0b5', hair: '#1a1410', style: 'short', top: '#f4f4f2', bottom: '#111214' };
  if (!S.mp.name) S.mp.name = '드라이버' + Math.floor(100 + Math.random() * 900);
}

// ===================== 클라우드 저장 (내 계정에 저장 → 다른 기기 · 앱을 다시 열어도 그대로) =====================
// 브라우저 저장소(localStorage)는 앱/기기에 따라 지워질 수 있어서, 아티팩트의 개인 저장소(db)에도 같이 저장함.
// 한 문서 크기 제한(256KB) 때문에 내용을 조각으로 나눠 저장 (save_0, save_1 …) + 목차 문서(save)
const CHUNK = 60000;
const cloud = { col: null, ok: false, busy: false, pending: false, timer: null, last: [], status: 'off' };
export const cloudStatus = () => cloud.status;
const withTimeout = (p, ms = 10000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// ---------- 브라우저 안 두 번째 저장소 (IndexedDB) : localStorage 가 지워져도 남도록 ----------
const IDB = { db: null, timer: null };
function idbOpen() {
  return new Promise((res) => {
    try {
      const rq = indexedDB.open('bitgoeul_drive', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function idbGet(db) {
  return new Promise((res) => { try { const rq = db.transaction('kv').objectStore('kv').get(KEY); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } });
}
function idbQueue() {
  if (!IDB.db || IDB.timer) return;
  IDB.timer = setTimeout(() => {
    IDB.timer = null;
    try { IDB.db.transaction('kv', 'readwrite').objectStore('kv').put(JSON.stringify(S), KEY); } catch (e) { /* 무시 */ }
  }, 800);
}
// ---------- 저장 코드 (다른 기기 · 저장이 지워졌을 때 옮기기) ----------
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export async function exportCode() {
  const json = JSON.stringify(S);
  try {
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    return 'BGD1:' + b64(new Uint8Array(await new Response(cs).arrayBuffer()));
  } catch (e) {
    return 'BGD0:' + b64(new TextEncoder().encode(json));
  }
}
export async function importCode(code) {
  code = String(code || '').trim().replace(/\s+/g, '');
  const m = /^BGD([01]):(.+)$/.exec(code);
  if (!m) throw new Error('저장 코드 형식이 아니에요');
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  let json;
  if (m[1] === '1') json = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  else json = new TextDecoder().decode(bin);
  const d = JSON.parse(json);
  if (!d || !Array.isArray(d.owned)) throw new Error('저장 내용이 비어 있어요');
  applySave(d); fixup(); localFresh = false; save();
  return true;
}
export async function initCloud(onApplied) {
  // 1) IndexedDB 에 더 최근 저장이 있으면 그걸로
  IDB.db = await idbOpen();
  if (IDB.db) {
    const t = await idbGet(IDB.db);
    try {
      const d = t ? JSON.parse(t) : null;
      if (d && (d.savedAt || 0) > (S.savedAt || 0) && Array.isArray(d.owned)) {
        applySave(d); fixup(); localFresh = false;
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
        if (onApplied) onApplied(true);
      } else if (!localFresh) idbQueue();
    } catch (e) { /* 무시 */ }
  }
  cloud.status = 'connecting';
  for (let i = 0; i < 60 && !(window.claude && window.claude.use); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(window.claude && window.claude.use)) { cloud.status = 'off'; return false; }
  let db = null, user = null;
  try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch (e) { db = null; }
  if (!db || !user) { cloud.status = 'off'; return false; }
  let id = null;
  try { id = await user.id(); } catch (e) { id = null; }
  if (!id) { cloud.status = 'off'; return false; }
  const col = db.collection('data/users/' + id);
  let meta;
  try { meta = await withTimeout(col.doc('save').get()); } catch (e) { cloud.status = 'error'; return false; }
  cloud.col = col;
  let applied = false;
  if (meta.exists) {
    const m = meta.data() || {};
    if ((m.at || 0) > (S.savedAt || 0)) {
      try {
        const parts = [];
        for (let i = 0; i < (m.n || 0); i++) { const d = await withTimeout(col.doc('save_' + i).get()); if (!d.exists) throw new Error('missing part'); parts.push(d.data().s); }
        const d = JSON.parse(parts.join(''));
        applySave(d); fixup();
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
        cloud.last = parts; applied = true;
      } catch (e) { cloud.status = 'error'; }
    }
  }
  cloud.ok = true; cloud.status = 'on'; localFresh = false;
  if (!meta.exists || (meta.data().at || 0) < (S.savedAt || 0)) queueCloud(500);
  if (applied && onApplied) onApplied();
  return applied;
}
function queueCloud(ms = 3000) {
  if (!cloud.ok) return;
  cloud.pending = true;
  if (!cloud.timer) cloud.timer = setTimeout(flushCloud, ms);
}
export async function flushCloud() {
  cloud.timer = null;
  if (!cloud.ok) return;
  if (cloud.busy) { cloud.timer = setTimeout(flushCloud, 1500); return; }
  if (!cloud.pending) return;
  cloud.pending = false; cloud.busy = true;
  try {
    const json = JSON.stringify(S), parts = [];
    for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
    for (let i = 0; i < parts.length; i++) if (cloud.last[i] !== parts[i]) await cloud.col.doc('save_' + i).set({ s: parts[i] });
    await cloud.col.doc('save').set({ n: parts.length, at: S.savedAt || Date.now(), v: 1 });
    cloud.last = parts; cloud.status = 'on';
  } catch (e) {
    cloud.pending = true; cloud.status = 'error';
  }
  cloud.busy = false;
  if (cloud.pending && !cloud.timer) cloud.timer = setTimeout(flushCloud, 6000);
}
export function save() {
  // 새 기기에서 클라우드 저장을 아직 못 읽었으면 시각을 찍지 않음 (빈 새 게임이 클라우드 저장을 덮지 않게)
  if (!localFresh) S.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  idbQueue();
  queueCloud();
}
export const ownedBy = (uid) => S.owned.find((o) => o.uid === uid);
export function resetSave() { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } }
