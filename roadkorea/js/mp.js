import * as THREE from 'three';
import { buildVehicle } from './models.js';
import { BY_ID, ROUTES, ROUTE_COLORS } from './data.js';
import { canvasTex, lerp } from './util.js';

// 멀티플레이: 같은 채널에 들어온 사람들의 위치를 presence로 주고받음
export class Multiplayer {
  constructor(scene) {
    this.scene = scene;
    this.lobby = null; this.room = null; this.channel = null;
    this.remotes = new Map();
    this.status = 'off';
    this.onChat = null; this.onList = null;
    this.sendT = 0; this.lastMsg = null;
  }
  get active() { return !!this.room; }
  async connect() {
    if (this.lobby) return this.lobby;
    this.status = 'connecting';
    for (let i = 0; i < 50 && !(window.claude && window.claude.use); i++) await new Promise((r) => setTimeout(r, 100));
    try { this.lobby = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { this.lobby = null; }
    this.status = this.lobby ? 'ready' : 'unavailable';
    return this.lobby;
  }
  async join(ch) {
    const lobby = await this.connect();
    if (!lobby) return false;
    try {
      if (this.room) { await this.room.leave(); this.clearRemotes(); }
      this.room = await lobby.join('gwangju-ch' + ch);
      this.channel = ch;
      this.room.onPeers((c) => this.handlePeers(c), () => { this.status = 'unavailable'; });
      this.status = 'joined';
      return true;
    } catch (e) { this.status = 'unavailable'; this.room = null; return false; }
  }
  async leave() { if (this.room) { try { await this.room.leave(); } catch (e) { /* 무시 */ } } this.room = null; this.channel = null; this.clearRemotes(); this.status = this.lobby ? 'ready' : 'off'; }
  clearRemotes() { for (const r of this.remotes.values()) this.dropRemote(r); this.remotes.clear(); }
  dropRemote(r) { if (r.obj) this.scene.remove(r.obj.group); if (r.tag) this.scene.remove(r.tag); }
  list() {
    if (!this.room) return [];
    return this.room.peers().map((p) => ({ me: p.sameTab, name: (p.presence && typeof p.presence.n === 'string' ? p.presence.n : '드라이버').slice(0, 16), veh: p.presence && BY_ID[p.presence.v] ? BY_ID[p.presence.v].name : '-', guest: p.guest }));
  }
  handlePeers(c) {
    for (const p of c.left) { const r = this.remotes.get(p.peer); if (r) { this.dropRemote(r); this.remotes.delete(p.peer); } }
    for (const p of c.peers) {
      if (p.sameTab) continue;
      const pr = p.presence || {};
      if (!Array.isArray(pr.p) || pr.p.length < 4 || !BY_ID[pr.v]) continue;
      let r = this.remotes.get(p.peer);
      const look = `${pr.v}|${pr.c}|${pr.l}|${pr.rt}`;
      if (!r || r.look !== look) {
        if (r) this.dropRemote(r);
        const spec = BY_ID[pr.v];
        const route = ROUTES.find((x) => x.id === pr.rt);
        const obj = buildVehicle(spec, { color: typeof pr.c === 'string' ? pr.c : '#ccc', livery: pr.l, lod: true, route: route ? route.id : undefined, dest: route ? route.dest : undefined, routeColor: route ? ROUTE_COLORS[route.type] : undefined });
        this.scene.add(obj.group);
        const tag = this.makeTag(pr.n);
        this.scene.add(tag);
        r = { obj, tag, look, spec, x: pr.p[0], z: pr.p[1], h: pr.p[2], y: pr.p[3], name: pr.n };
        obj.group.position.set(r.x, r.y, r.z);
        this.remotes.set(p.peer, r);
      }
      if (r.name !== pr.n) { this.scene.remove(r.tag); r.tag = this.makeTag(pr.n); this.scene.add(r.tag); r.name = pr.n; }
      r.tx = +pr.p[0] || 0; r.tz = +pr.p[1] || 0; r.th = +pr.p[2] || 0; r.ty = +pr.p[3] || 0; r.v = +pr.s || 0;
      r.doors = +pr.d || 0; r.lights = !!pr.lt; r.blink = +pr.b || 0;
      if (pr.mt && pr.mt !== r.mt && typeof pr.m === 'string') { r.mt = pr.mt; if (r.seen && this.onChat) this.onChat(String(pr.n || '드라이버').slice(0, 16), pr.m.slice(0, 120)); }
      r.seen = true;
    }
    if (this.onList) this.onList(this.list());
  }
  makeTag(name) {
    const t = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = 'rgba(10,18,26,0.75)'; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 14); g.fill();
      g.fillStyle = '#36d1c4'; g.font = '800 30px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(name || '드라이버').slice(0, 12), w / 2, h / 2 + 1);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(4, 1, 1); s.renderOrder = 5;
    return s;
  }
  // 내 상태 보내기 (초당 10회)
  publish(dt, st) {
    if (!this.room) return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.1;
    const patch = { n: st.name, v: st.v, c: st.c, l: st.l, rt: st.rt || null, p: [+st.x.toFixed(2), +st.z.toFixed(2), +st.h.toFixed(3), +st.y.toFixed(2)], s: +st.s.toFixed(1), d: st.d, lt: st.lt ? 1 : 0, b: st.b };
    if (this.lastMsg) { patch.m = this.lastMsg.m; patch.mt = this.lastMsg.t; }
    this.room.presence(patch).catch(() => {});
  }
  say(text) { this.lastMsg = { m: String(text).slice(0, 120), t: Date.now() }; this.sendT = 0; }
  update(dt, blinkOn) {
    for (const r of this.remotes.values()) {
      if (r.tx === undefined) continue;
      const k = Math.min(1, dt * 8);
      if (Math.hypot(r.tx - r.x, r.tz - r.z) > 30) { r.x = r.tx; r.z = r.tz; r.h = r.th; }
      r.x = lerp(r.x, r.tx, k); r.z = lerp(r.z, r.tz, k); r.y = lerp(r.y, r.ty, k);
      let d = r.th - r.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; r.h += d * k;
      const g = r.obj.group;
      g.position.set(r.x, r.y, r.z); g.rotation.y = r.h;
      for (const w of r.obj.wheels) w.spin.rotation.x += (r.v / 3.6 / w.r) * dt;
      if (r.obj.updateDoors) { r.obj.doors.forEach((dr, i) => (dr.target = (r.doors >> i) & 1)); r.obj.updateDoors(dt); }
      const L = r.obj.lights;
      L.indL.emissiveIntensity = r.blink & 1 && blinkOn ? 3 : 0; L.indR.emissiveIntensity = r.blink & 2 && blinkOn ? 3 : 0;
      r.tag.position.set(r.x, r.y + r.spec.hei + 1.3, r.z);
    }
  }
  // 충돌·AI용 장애물 목록
  agents() {
    const out = [];
    for (const r of this.remotes.values()) out.push({ x: r.x, z: r.z, fx: Math.sin(r.h), fz: Math.cos(r.h), v: (r.v || 0) / 3.6, len: r.spec.len, wid: r.spec.wid });
    return out;
  }
}
