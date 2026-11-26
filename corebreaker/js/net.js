// ===================== 함께 하기 (같은 방 실시간) =====================
// 각자 자기 상태를 "presence"로 계속 알리고(초당 15번), 일어난 일(맞힘 · 처치 · 기술 · 설치)은
// 번호 붙인 최근 사건 목록으로 실어 보냄. 방장은 라운드 · 봇 · 점수를 계산해서 함께 알림.
import { Actor } from './actors.js';

const RING = 14;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export class Net {
  constructor(R, opts) {
    this.R = R; this.opts = opts; this.host = !!opts.host; this.seq = 0; this.ring = []; this.seen = {}; this.G = null;
    this.myPeer = null; this.lastPub = 0; this.lobby = { n: opts.name, g: opts.grp, ag: opts.agent, host: this.host ? 1 : 0, st: 'lobby' };
    this.unsub = R.onPeers((ch) => this.onPeers(ch));
    this.pub(this.lobby);
  }
  me() { return this.R.peers().find((p) => p.sameTab); }
  peers() { return this.R.peers().filter((p) => !p.sameTab && p.kind === 'viewer'); }
  hostPeer() { return this.R.peers().find((p) => p.presence && p.presence.host === 1 && !p.sameTab); }
  pub(patch) { this.R.presence(patch).catch(() => {}); }
  setLobby(patch) { Object.assign(this.lobby, patch); this.pub(patch); }
  leave() { try { this.unsub(); } catch (e) { /* 무시 */ } this.R.leave().catch(() => {}); }

  // 사건 보내기
  push(ev) { ev.s = ++this.seq; this.ring.push(ev); if (this.ring.length > RING) this.ring.shift(); this.dirty = true; }
  sendEvent(ev) { this.push({ ...ev }); }
  sendHit(t, dmg, part, by, wid) { this.push({ k: 'hit', to: t.id, d: dmg, p: part, by: by ? by.id : null, w: wid }); }
  sendKill(t, by, wid, hs) { this.push({ k: 'kill', to: t.id, by: by ? by.id : null, w: wid, hs: hs ? 1 : 0 }); }

  attach(G) {
    this.G = G;
    G.net = this;
    G.onShot = (a) => { if (a.isLocal || (a.isBot && G.auth)) { if (!this.shotCD || G.time - this.shotCD > 0.05) { this.shotCD = G.time; this.push({ k: 'shot', by: a.id, w: a.gun.id }); } } };
    this.myPeer = (this.me() || {}).peer || G.me.id;
  }
  // 매 프레임: 내 상태 알리기 (초당 15번)
  tick(now) {
    const G = this.G; if (!G) return;
    if (now - this.lastPub < 66 && !this.dirty) return;
    this.lastPub = now; this.dirty = false;
    const m = G.me;
    const patch = { st: 'game', g: m.grp, ag: m.agent, n: m.name, p: [r1(m.x), r2(m.y), r1(m.z), r2(m.yaw), r2(m.pitch), r1(m.speedNow), r1(m.crouch), m.alive ? 1 : 0, Math.round(m.hp), m.armor, m.gun.id], ev: this.ring };
    if (this.host) {
      const C = G.core;
      patch.mt = { r: G.round, ph: G.phase, tm: r1(G.timer), sc: [G.score.red, G.score.blue], c: [C.state, r1(C.x), r1(C.z), C.site, r1(C.t), C.holder], w: G.lastWin ? [G.lastWin.grp, G.lastWin.why] : null, ov: G.over ? G.over.grp : null };
      patch.bots = G.actors.filter((a) => a.isBot).map((a) => [a.id, a.name, a.grp, a.agent, r1(a.x), r2(a.y), r1(a.z), r2(a.yaw), r2(a.pitch), r1(a.speedNow), r1(a.crouch), a.alive ? 1 : 0, Math.round(a.hp), a.armor, a.gun.id]);
    }
    this.pub(patch);
  }
  onPeers(ch) {
    if (this.opts.onLobby) this.opts.onLobby(this);
    const G = this.G; if (!G) return;
    const ps = this.peers();
    // 나간 사람
    for (const a of G.actors.filter((x) => x.remote && x.human)) if (!ps.some((p) => p.peer === a.id)) { G.removeActor(a); if (this.host) G.fillBots(); }
    for (const p of ps) {
      const P = p.presence || {};
      if (P.st !== 'game') continue;
      // 사람
      let a = G.actors.find((x) => x.id === p.peer);
      if (!a) {
        if (this.host) { const bot = G.actors.find((x) => x.isBot && x.grp === P.g); if (bot) G.removeActor(bot); }
        a = G.addActor({ id: p.peer, name: P.n || '플레이어', grp: P.g || 'blue', agent: P.ag || 'blaze' });
        a.remote = true; a.human = true;
      }
      if (P.p) { const q = P.p; a.net = { x: q[0], y: q[1], z: q[2], yaw: q[3], pitch: q[4], sp: q[5], cr: q[6] }; const al = !!q[7]; if (!al && a.alive) a.die(); if (al && !a.alive) { a.alive = true; a.model.visible = true; a.x = q[0]; a.z = q[2]; } a.alive = al; a.hp = q[8]; a.armor = q[9]; if (a.guns[1]?.id !== q[10] && a.guns[2]?.id !== q[10]) a.guns[1] = { id: q[10], mag: 30, res: 0 }; a.slot = a.guns[1]?.id === q[10] ? 1 : 2; }
      if (P.ag && P.ag !== a.agent) a.setAgent(P.ag);
      this.readEvents(p.peer, P.ev);
      // 방장 정보 (손님만)
      if (!this.host && P.host === 1) { this.readHost(P); }
    }
  }
  readEvents(peer, list) {
    if (!Array.isArray(list)) return;
    const G = this.G, last = this.seen[peer] || 0;
    let mx = last;
    for (const ev of list) {
      if (!ev || typeof ev.s !== 'number' || ev.s <= last) continue;
      mx = Math.max(mx, ev.s);
      if (this.seen[peer] === undefined) continue; // 처음 보는 사람의 옛 사건은 건너뜀
      this.apply(ev, peer);
    }
    this.seen[peer] = mx;
  }
  apply(ev, peer) {
    const G = this.G;
    const own = (id) => { const a = G.actors.find((x) => x.id === id); return a && (a.isLocal || (a.isBot && G.auth)) ? a : null; };
    if (ev.k === 'hit') { const t = own(ev.to); if (t) G.applyDamage(t, Math.min(260, Math.max(0, Number(ev.d) || 0)), ev.p, ev.by, ev.w); }
    else if (ev.k === 'kill') { G.onKill(ev.to, ev.by, ev.w, !!ev.hs); if (G.auth) { const t = G.actors.find((x) => x.id === ev.to); if (t && G.core.holder === t.id && G.core.state === 'carried') { G.core.state = 'dropped'; G.core.x = t.x; G.core.z = t.z; G.core.holder = null; } } }
    else if (ev.k === 'ab') G.abilityEvent(ev);
    else if (ev.k === 'shot') { const a = G.actors.find((x) => x.id === ev.by); if (a && a.alive) { G.soundAt(a, (g, p) => G.remoteShotSound(ev.w, g, p, a), 120); G.addFx('muzzle', a.x + Math.sin(a.yaw) * 0.8, a.eye - 0.15, a.z + Math.cos(a.yaw) * 0.8); } }
    else if (ev.k === 'plant' && G.auth) { const a = G.actors.find((x) => x.id === ev.by); if (a && G.core.holder === a.id) G.doPlant(ev); }
    else if (ev.k === 'defuse' && G.auth) G.doDefuse(ev);
  }
  readHost(P) {
    const G = this.G, m = P.mt;
    // 봇
    if (Array.isArray(P.bots)) {
      const ids = new Set();
      for (const b of P.bots) {
        const [id, name, grp, agent, x, y, z, yaw, pitch, sp, cr, al, hp, ar, gid] = b; ids.add(id);
        let a = G.actors.find((q) => q.id === id);
        if (!a) { a = G.addActor({ id, name, grp, agent }); a.remote = true; a.x = x; a.z = z; }
        a.net = { x, y, z, yaw, pitch, sp, cr };
        if (!al && a.alive) a.die(); if (al && !a.alive) { a.alive = true; a.model.visible = true; a.x = x; a.z = z; }
        a.alive = !!al; a.hp = hp; a.armor = ar; a.guns[1] = { id: gid, mag: 30, res: 0 }; a.slot = 1;
      }
      for (const a of G.actors.filter((q) => q.remote && !q.human)) if (!ids.has(a.id)) G.removeActor(a);
    }
    if (!m) return;
    if (m.r !== G.round) { G.round = m.r; G.startRound(false); }
    const wasPh = G.phase;
    G.phase = m.ph; G.timer = m.tm;
    G.score.red = m.sc[0]; G.score.blue = m.sc[1];
    const C = G.core, c = m.c;
    if (c) { const was = C.state; C.state = c[0]; C.x = c[1]; C.z = c[2]; C.site = c[3]; C.t = c[4]; C.holder = c[5]; G.me.carry = C.holder === G.me.id && C.state === 'carried'; if (was !== 'planted' && C.state === 'planted') G.say(`코어 설치됨 — ${C.site} 사이트`, G.me.team === 'atk' ? '40초 동안 지키세요' : '해체하세요! (F 길게, 7초)'); }
    if (wasPh !== 'end' && m.ph === 'end' && m.w) G.endRound(G.actors.find((a) => a.grp === m.w[0])?.team || 'atk', m.w[1]);
    if (wasPh === 'buy' && m.ph === 'live') G.say('전투 시작!', '');
    if (m.ov && !G.over) G.over = { win: m.ov === G.me.grp, grp: m.ov };
  }
}
export { Actor };
