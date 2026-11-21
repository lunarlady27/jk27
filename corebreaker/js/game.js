// ===================== 게임 한 판 (라운드 · 경제 · 전투 · 기술 · 효과) =====================
import * as THREE from 'three';
import { buildMap, rayWorld, SPAWNS, SITES, zoneAt, addDyn, removeDyn, CELL, GW, GH, MAP, HOLDS } from './map.js';
import { Actor, moveActor, rayActor, poseSoldier, TEAM, RADIUS } from './actors.js';
import { WEAPONS, AGENTS, ARMOR, damageOf, buildViewModel, flashTex } from './weapons.js';
import { BotBrain, botBuy, botName } from './bots.js';
import { sfx } from './audio.js';

export const RULES = { win: 7, half: 6, buyT: 20, liveT: 100, plantT: 40, endT: 6, plantHold: 4, defuseHold: 7, maxCredits: 9000 };
const tmpV = new THREE.Vector3();

export class Game {
  constructor(el, opts) {
    this.opts = opts; this.el = el;
    this.auth = opts.mode !== 'client'; // 라운드 · 봇을 내가 계산?
    this.time = 0; this.events = []; this.feed = []; this.intel = { atk: null, def: null };
    this.fx = []; this.smokes = []; this.zones = []; this.walls = []; this.projs = [];
    this.round = 1; this.score = { red: 0, blue: 0 }; this.phase = 'buy'; this.timer = RULES.buyT; this.streak = { red: 0, blue: 0 };
    this.core = { state: 'carried', holder: null, x: 0, z: 0, site: null, t: 0, prog: 0, defHalf: false };
    this.atkSite = 'A'; this.msg = null; this.over = null;
    this.initRender();
    buildMap(this.scene);
    this.actors = [];
    // 나
    this.me = this.addActor({ id: opts.myId || 'me', name: opts.me.name, grp: opts.me.grp || 'red', agent: opts.me.agent, isLocal: true });
    this.viewGun = null; this.setViewGun();
    // 봇 (혼자 하기 · 방장)
    if (this.auth && opts.bots !== false) this.fillBots();
    this.startRound(true);
  }
  teamOf(grp) { return (grp === 'red') === (this.round <= RULES.half) ? 'atk' : 'def'; }
  addActor(o) {
    const a = new Actor({ ...o, team: this.teamOf(o.grp) });
    a.grp = o.grp;
    this.actors.push(a); this.scene.add(a.model);
    if (a.isLocal) a.model.visible = false;
    if (a.isBot) a.brain = new BotBrain(a, this.opts.diff);
    return a;
  }
  removeActor(a) { this.scene.remove(a.model); this.actors = this.actors.filter((x) => x !== a); if (a.revealS) this.scene.remove(a.revealS); }
  fillBots() {
    const ag = Object.keys(AGENTS);
    let n = 0;
    for (const grp of ['red', 'blue']) {
      const have = this.actors.filter((a) => a.grp === grp).length;
      for (let i = have; i < 5; i++) {
        const used = this.actors.filter((a) => a.grp === grp).map((a) => a.agent);
        const free = ag.filter((x) => !used.includes(x));
        this.addActor({ id: 'bot' + grp + i + Math.random().toString(36).slice(2, 5), name: botName(n++ + (grp === 'blue' ? 7 : 0)) + ' (봇)', grp, agent: free.length ? free[Math.floor(Math.random() * free.length)] : ag[Math.floor(Math.random() * ag.length)], isBot: true });
      }
    }
  }
  // ---------- 그리기 ----------
  initRender() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.opts.quality === 'low' ? 1 : 1.6));
    r.shadowMap.enabled = this.opts.quality !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;
    this.el.appendChild(r.domElement);
    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0xb8c6d4, 70, 260);
    s.add(new THREE.HemisphereLight(0xdfeeff, 0x7a6e60, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(GW * CELL / 2 + 40, 90, GH * CELL / 2 - 30); sun.target.position.set(GW * CELL / 2, 0, GH * CELL / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 220; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    this.cam = new THREE.PerspectiveCamera(this.opts.fov || 80, 1, 0.05, 600); this.cam.rotation.order = 'YXZ';
    // 손에 든 총은 따로 그림 (벽에 파묻히지 않게)
    this.vscene = new THREE.Scene();
    this.vscene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const vl = new THREE.DirectionalLight(0xffffff, 1.4); vl.position.set(1, 2, 1); this.vscene.add(vl);
    this.vcam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.resize();
  }
  resize() {
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.vcam.aspect = w / h; this.vcam.updateProjectionMatrix();
  }
  setViewGun() {
    if (this.viewGun) this.vscene.remove(this.viewGun);
    this.viewGun = buildViewModel(this.me.gun.id); this.viewGunId = this.me.gun.id;
    this.vscene.add(this.viewGun); this.vkick = 0; this.vbob = 0;
  }
  dispose() { this.renderer.dispose(); this.renderer.domElement.remove(); }

  // ---------- 라운드 ----------
  startRound(first) {
    for (const a of this.actors) a.setTeam(this.teamOf(a.grp));
    this.phase = 'buy'; this.timer = RULES.buyT;
    for (const s of this.smokes) this.scene.remove(s.g); this.smokes = [];
    for (const z of this.zones) this.scene.remove(z.m); this.zones = [];
    for (const w of this.walls) { this.scene.remove(w.m); removeDyn(w.b); } this.walls = [];
    for (const f of this.fx) if (f.o) this.scene.remove(f.o); this.fx = [];
    for (const p of this.projs) this.scene.remove(p.m); this.projs = [];
    this.core = { state: 'carried', holder: null, x: 0, z: 0, site: null, t: 0, prog: 0, defHalf: false };
    if (this.coreMesh) this.coreMesh.visible = false;
    // 시작 자리
    for (const team of ['atk', 'def']) {
      const list = this.actors.filter((a) => a.team === team).sort((p, q) => (p.id < q.id ? -1 : 1));
      list.forEach((a, i) => {
        if (!a.isLocal && !(a.isBot && this.auth)) return;
        const sp = SPAWNS[team][i % 5];
        a.spawn({ x: sp.x + (i >= 5 ? 1 : 0), z: sp.z }, team === 'atk' ? Math.PI : 0);
        if (first || !a.alive) a.resetAbil(true); else a.resetAbil(false);
      });
    }
    // 반 바뀜: 돈 · 무기 처음부터
    if (first || this.round === RULES.half + 1) for (const a of this.actors) { a.credits = 800; a.guns = { 1: null, 2: { id: 'sting', mag: 12, res: 36 } }; a.slot = 2; a.armor = 0; a.resetAbil(true); }
    if (this.auth) {
      const atks = this.actors.filter((a) => a.team === 'atk');
      const carrier = atks[Math.floor(Math.random() * atks.length)];
      if (carrier) { carrier.carry = true; this.core.holder = carrier.id; }
      this.atkSite = Math.random() < 0.5 ? 'A' : 'B';
      // 봇 역할
      const defs = this.actors.filter((a) => a.isBot && a.team === 'def');
      defs.forEach((b, i) => { b.brain.reset(); b.brain.site = i % 2 ? 'B' : 'A'; b.brain.holdIdx = Math.floor(i / 2) + Math.floor(Math.random() * 2); b.brain.rotateOk = i % 2 === 0; b.brain.hold = null; b.brain.holdLook = Math.PI; });
      atks.filter((a) => a.isBot).forEach((b, i) => { b.brain.reset(); b.brain.entryIdx = Math.floor(Math.random() * 3); b.brain.entry = null; b.brain.post = null; });
      for (const a of this.actors) if (a.isBot) botBuy(a);
    }
    if (this.me) { this.setViewGun(); this.me.yaw = this.me.team === 'atk' ? Math.PI : 0; }
    this.say(first ? `${this.me.team === 'atk' ? '공격' : '수비'} 팀으로 시작해요` : this.round === RULES.half + 1 ? '공수 교대! 이제 ' + (this.me.team === 'atk' ? '공격' : '수비') + '이에요' : `라운드 ${this.round}`, this.me.team === 'atk' ? '코어를 A나 B 사이트에 설치하세요' : '사이트를 지키고 코어를 해체하세요');
  }
  say(big, small) { this.msg = { big, small, t: 3.2 }; }
  endRound(winTeam, why) {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end'; this.timer = RULES.endT;
    const winGrp = this.actors.find((a) => a.team === winTeam)?.grp || (winTeam === this.teamOf('red') ? 'red' : 'blue');
    const loseGrp = winGrp === 'red' ? 'blue' : 'red';
    if (this.auth) this.score[winGrp]++;
    this.streak[winGrp] = 0; this.streak[loseGrp] = Math.min(2, this.streak[loseGrp] + 1);
    const planted = this.core.state === 'planted' || this.core.state === 'exploded' || this.core.state === 'defused';
    for (const a of this.actors) {
      if (!(a.isLocal || (a.isBot && this.auth))) continue;
      const win = a.grp === winGrp;
      a.credits = Math.min(RULES.maxCredits, a.credits + (win ? 3000 : 1900 + 500 * (this.streak[loseGrp] - 1)) + (planted && a.team === 'atk' && !win ? 300 : 0));
    }
    const myWin = this.me.grp === winGrp;
    sfx.round(myWin);
    this.say(myWin ? '라운드 승리' : '라운드 패배', why);
    this.lastWin = { grp: winGrp, why };
    if (this.auth && this.score[winGrp] >= RULES.win) { this.phase = 'over'; this.timer = 9999; this.over = { win: myWin, grp: winGrp }; }
  }

  // ---------- 매 프레임 ----------
  update(dt, input) {
    this.time += dt;
    const me = this.me;
    // 라운드 시계 (방장 · 혼자)
    if (this.auth) this.tickRound(dt);
    // 나
    this.updateMe(dt, input);
    // 봇
    if (this.auth) for (const a of this.actors) if (a.isBot) this.updateBot(a, dt);
    // 공통: 상태 시간
    for (const a of this.actors) {
      a.flashT = Math.max(0, a.flashT - dt); a.slowT = Math.max(0, a.slowT - dt); a.revealT = Math.max(0, a.revealT - dt);
      if (a.healT > 0 && a.alive) { a.healT -= dt; a.hp = Math.min(100, a.hp + 20 * dt); }
      if (a.dashT > 0) a.dashT -= dt;
      if (!a.isLocal) poseSoldier(a, dt);
      this.revealMark(a);
      if (a.remote && a.net) this.lerpRemote(a, dt);
    }
    // 감속 지대
    for (const z of this.zones) { z.t -= dt; for (const a of this.actors) if (a.alive && a.team !== z.team && Math.hypot(a.x - z.x, a.z - z.z) < z.r) a.slowT = 0.25; }
    this.zones = this.zones.filter((z) => { if (z.t <= 0) { this.scene.remove(z.m); return false; } z.m.material.opacity = Math.min(0.5, z.t * 0.4); return true; });
    // 연막 · 벽
    for (const s of this.smokes) { s.t -= dt; const k = Math.min(1, (15 - s.t) * 2.5) * Math.min(1, s.t * 0.8); s.g.scale.setScalar(Math.max(0.01, k)); s.g.children.forEach((p, i) => { p.material.rotation += dt * 0.05 * (i % 2 ? 1 : -1); }); }
    this.smokes = this.smokes.filter((s) => { if (s.t <= 0) { this.scene.remove(s.g); return false; } return true; });
    for (const w of this.walls) w.t -= dt;
    this.walls = this.walls.filter((w) => { if (w.t <= 0 || w.hp <= 0) { this.scene.remove(w.m); removeDyn(w.b); return false; } return true; });
    // 던진 것들
    this.updateProjs(dt);
    // 효과
    for (const f of this.fx) { f.t -= dt; if (f.upd) f.upd(f, dt); }
    this.fx = this.fx.filter((f) => { if (f.t <= 0) { if (f.o) this.scene.remove(f.o); return false; } return true; });
    // 코어
    this.updateCoreMesh(dt);
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    this.feed = this.feed.filter((k) => this.time - k.t < 6);
  }
  tickRound(dt) {
    if (this.phase === 'over') return;
    this.timer -= dt;
    const C = this.core;
    if (this.phase === 'buy' && this.timer <= 0) { this.phase = 'live'; this.timer = RULES.liveT; this.say('전투 시작!', this.me.team === 'atk' ? `코어를 들고 사이트로` : '사이트를 지키세요'); }
    else if (this.phase === 'live' || this.phase === 'planted') {
      const alive = (t) => this.actors.some((a) => a.alive && a.team === t);
      if (C.state === 'planted') {
        C.t -= dt;
        if (Math.floor(C.t) !== Math.floor(C.t + dt)) sfx.beep(C.t < 10);
        if (C.t <= 0) { this.explode(); this.endRound('atk', '코어 폭발'); return; }
        if (!alive('def')) { this.endRound('atk', '수비 전멸'); return; }
      } else {
        if (!alive('atk')) { this.endRound('def', '공격 전멸'); return; }
        if (!alive('def')) { this.endRound('atk', '수비 전멸'); return; }
        if (this.timer <= 0) { this.endRound('def', '시간 종료'); return; }
      }
      // 떨어진 코어 줍기
      if (C.state === 'dropped') for (const a of this.actors) if (a.alive && a.team === 'atk' && Math.hypot(a.x - C.x, a.z - C.z) < 1.3) { C.state = 'carried'; C.holder = a.id; a.carry = true; if (a === this.me) this.say('코어를 주웠어요', '사이트에 가서 F를 길게 눌러 설치'); break; }
    } else if (this.phase === 'end' && this.timer <= 0) {
      this.round++;
      this.startRound(false);
    }
  }
  explode() {
    const C = this.core; C.state = 'exploded'; sfx.boom();
    this.addFx('boom', C.x, 1, C.z);
    for (const a of this.actors) if (a.alive && Math.hypot(a.x - C.x, a.z - C.z) < 14 && (a.isLocal || (a.isBot && this.auth))) this.kill(a, null, 'core');
  }

  // ---------- 내 조작 ----------
  updateMe(dt, I) {
    const me = this.me;
    if (!me.alive) { this.spectate(dt, I); return; }
    me.yaw -= I.dx; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - I.dy));
    I.dx = I.dy = 0;
    me.walk = I.walk; me.crouch += ((I.crouch ? 1 : 0) - me.crouch) * Math.min(1, dt * 10);
    // 움직임
    const f = (I.f ? 1 : 0) - (I.b ? 1 : 0), s = (I.r ? 1 : 0) - (I.l ? 1 : 0);
    let wx = Math.sin(me.yaw) * f - Math.cos(me.yaw) * s, wz = Math.cos(me.yaw) * f + Math.sin(me.yaw) * s;
    if (I.jx || I.jy) { wx = Math.sin(me.yaw) * -I.jy - Math.cos(me.yaw) * I.jx; wz = Math.cos(me.yaw) * -I.jy + Math.sin(me.yaw) * I.jx; }
    const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    const busy = this.holding;
    if (me.dashT > 0) { me.vx = me.dashVx; me.vz = me.dashVz; }
    const lock = this.phase === 'buy' ? (me.team === 'atk' ? 3 : 4) : null;
    const was = me.onGround;
    moveActor(me, dt, busy ? 0 : wx, busy ? 0 : wz, I.jump && !busy, { zoneLock: lock, onLand: () => sfx.land() });
    I.jump = false;
    if (!was && me.onGround) this.vkick += 0.04;
    // 발소리 (뛸 때)
    me.stepT = (me.stepT || 0) - dt * me.speedNow;
    if (me.onGround && me.speedNow > 4 && !me.walk && me.crouch < 0.5 && me.stepT <= 0) { me.stepT = 2.2; sfx.step(0.35, 0); me.loud = this.time; }
    // 무기 바꾸기 · 장전 · 사격
    if (I.slot && I.slot !== me.slot && me.guns[I.slot]) { me.slot = I.slot; me.reloadT = 0; me.fireCD = 0.35; this.setViewGun(); }
    I.slot = 0;
    if (this.viewGunId !== me.gun.id) this.setViewGun();
    this.weaponTick(me, dt, I.fire, I.reload);
    I.reload = false;
    if (!I.fire || !me.W.auto) { if (!I.fire) me.trigger = false; }
    // 기술
    if (I.q) { this.useAbility(me, 'q'); I.q = false; }
    if (I.e) { this.useAbility(me, 'e'); I.e = false; }
    // 코어 설치 · 해체 (F 길게)
    this.holding = false;
    if (I.use) this.tryPlantDefuse(me, dt); else if (me.useProg) me.useProg = 0;
    // 들고 있는 코어 표시
    // 카메라
    const eye = me.eye;
    this.cam.position.set(me.x, eye, me.z);
    this.recoilP = (this.recoilP || 0) * Math.pow(0.002, dt);
    this.cam.rotation.set(me.pitch + this.recoilP, me.yaw + Math.PI, 0);
    const zoom = I.aim && me.W.zoom ? me.W.zoom : I.aim ? 1.15 : 1;
    this.scoped = I.aim && !!me.W.zoom;
    const fov = (this.opts.fov || 80) / zoom;
    if (Math.abs(this.cam.fov - fov) > 0.1) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 18); this.cam.updateProjectionMatrix(); }
    this.aimHeld = I.aim;
  }
  spectate(dt, I) {
    // 죽으면 살아 있는 팀원을 따라 봄
    const mates = this.actors.filter((a) => a.alive && a.team === this.me.team && a !== this.me);
    if (I.fireEdge) { this.specI = (this.specI || 0) + 1; I.fireEdge = false; }
    const t = mates.length ? mates[(this.specI || 0) % mates.length] : null;
    this.specOf = t;
    if (t) { this.cam.position.set(t.x - Math.sin(t.yaw) * 2.8, t.eye + 0.8, t.z - Math.cos(t.yaw) * 2.8); this.cam.rotation.set(-0.2 + t.pitch * 0.5, t.yaw + Math.PI, 0); }
    else { const d = this.me; this.cam.position.set(d.x, 8, d.z + 6); this.cam.lookAt(d.x, 0, d.z); }
  }
  // 사격 (사람 · 봇 공통)
  weaponTick(a, dt, fire, reload) {
    const g = a.gun, W = a.W;
    a.fireCD -= dt;
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0) { const need = W.mag - g.mag, take = Math.min(need, g.res); g.mag += take; g.res -= take; }
      return;
    }
    if (reload && g.mag < W.mag && g.res > 0) { a.reloadT = W.reload; if (a.isLocal) sfx.reload(); return; }
    if (this.phase === 'buy' || this.phase === 'over') return;
    if (!fire) { if (this.time - a.lastShot > 0.32) a.shotN = 0; return; }
    if (a.fireCD > 0) return;
    if (!W.auto && a.trigger) return;
    if (g.mag <= 0) { if (g.res > 0) { a.reloadT = W.reload; if (a.isLocal) sfx.reload(); } else if (a.isLocal) sfx.empty(); a.trigger = true; return; }
    if (this.holding && a.isLocal) return;
    a.trigger = true;
    g.mag--; a.fireCD = 1 / W.rate; a.lastShot = this.time; a.shotN++;
    this.fireShot(a);
  }
  spreadOf(a) {
    const W = a.W;
    let sp = W.spread + W.move * Math.min(1, a.speedNow / 5) * (a.walk ? 0.4 : 1);
    if (!a.onGround) sp += 0.12;
    if (a.crouch > 0.5) sp *= 0.75;
    if (W.auto) sp += Math.min(10, Math.max(0, a.shotN - 2)) * W.recoil * 0.35;
    if (W.scopeOnly && !(a.isLocal ? this.scoped : a.scoped !== false)) sp += 0.07;
    return sp;
  }
  fireShot(a) {
    const W = a.W;
    const sp = this.spreadOf(a);
    const pel = W.pellets || 1;
    const ex = a.x, ey = a.eye, ez = a.z;
    let anyHit = false;
    for (let k = 0; k < pel; k++) {
      // 탄퍼짐
      const r = Math.sqrt(Math.random()) * sp, th = Math.random() * Math.PI * 2;
      const yaw = a.yaw + Math.cos(th) * r, pitch = a.pitch + Math.sin(th) * r + (a.isLocal ? this.recoilP || 0 : 0);
      const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
      let wallD = rayWorld(ex, ey, ez, dx, dy, dz, 200);
      // 장벽 맞으면 장벽 체력 깎음
      let hit = null;
      for (const t of this.actors) {
        if (t === a || !t.alive || t.team === a.team) continue;
        const h = rayActor(t, ex, ey, ez, dx, dy, dz);
        if (h && h.t < wallD && (!hit || h.t < hit.t)) hit = { ...h, a: t };
      }
      const endD = hit ? hit.t : wallD;
      if (k === 0 || pel > 1 && k % 3 === 0) this.tracer(a, ex + dx * endD, ey + dy * endD, ez + dz * endD);
      if (hit) {
        anyHit = true;
        const dmg = damageOf(W, hit.part, hit.t);
        this.addFx('blood', ex + dx * hit.t, ey + dy * hit.t, ez + dz * hit.t);
        this.damage(hit.a, dmg, hit.part, a, W.id);
      } else if (wallD < 200) {
        this.addFx('spark', ex + dx * wallD - dx * 0.02, ey + dy * wallD, ez + dz * wallD - dz * 0.02);
        for (const w of this.walls) if (w.b && Math.abs((ex + dx * wallD) - (w.b.x0 + w.b.x1) / 2) < 3.5 && Math.abs((ez + dz * wallD) - (w.b.z0 + w.b.z1) / 2) < 3.5) w.hp -= damageOf(W, 'body', wallD);
      }
    }
    // 소리 · 반동
    if (a.isLocal) {
      sfx.shot(W.id, 1, 0);
      this.recoilP = (this.recoilP || 0) + W.recoil * (W.auto ? 0.7 + Math.min(8, a.shotN) * 0.08 : 1.6);
      a.yaw += (Math.random() - 0.5) * W.recoil * (W.auto && a.shotN > 6 ? 0.9 : 0.25);
      this.vkick = Math.min(0.12, (this.vkick || 0) + (W.slot === 2 ? 0.035 : 0.025) * (W.id === 'owl' || W.id === 'burst' ? 3 : 1));
      if (this.viewGun) this.viewGun.userData.flash.visible = true, this.flashT = 0.04;
      if (anyHit) {}
    } else this.soundAt(a, (g, p) => (Math.hypot(a.x - this.me.x, a.z - this.me.z) < 45 ? sfx.shot(W.id, g, p) : sfx.far(W.id, g, p)), 120);
    if (this.onShot) this.onShot(a);
  }
  remoteShotSound(w, g, p, a) { if (Math.hypot(a.x - this.me.x, a.z - this.me.z) < 45) sfx.shot(w, g, p); else sfx.far(w, g, p); }
  // 거리 · 방향 소리
  soundAt(a, fn, range) {
    const L = this.alivePov(), dx = a.x - L.x, dz = a.z - L.z, d = Math.hypot(dx, dz);
    if (d > range) return;
    const g = Math.max(0.05, 1 - d / range);
    const right = -Math.cos(L.yaw) * dx + Math.sin(L.yaw) * dz; // 오른쪽 성분
    fn(g, Math.max(-1, Math.min(1, -right / Math.max(4, d))));
  }
  alivePov() { return this.me.alive ? this.me : (this.specOf || this.me); }
  // 피해 (소유자만 실제로 깎음 · 나머지는 네트워크로 보냄)
  damage(t, dmg, part, by, wid) {
    if (by && by.isLocal) { part === 'head' ? sfx.head() : sfx.hit(); this.hitMark = { t: 0.25, head: part === 'head', kill: false }; }
    const own = t.isLocal || (t.isBot && this.auth);
    if (!own) { if (this.net) this.net.sendHit(t, dmg, part, by, wid); return; }
    this.applyDamage(t, dmg, part, by ? by.id : null, wid);
  }
  applyDamage(t, dmg, part, byId, wid) {
    if (!t.alive) return;
    const ab = Math.min(t.armor, Math.round(dmg * 0.66));
    t.armor -= ab; t.hp -= dmg - ab;
    const by = this.actors.find((x) => x.id === byId);
    if (t.isBot) { t.brain.hurtBy = by; if (by && t.brain.target !== by) { t.brain.target = by; t.brain.seenT = 1.2; t.brain.react = 0.25; } }
    if (t.isLocal) { sfx.hurt(); this.hurtDir = by ? Math.atan2(by.x - t.x, by.z - t.z) : null; this.hurtT = 0.8; }
    if (t.hp <= 0) this.kill(t, by, wid, part === 'head');
  }
  kill(t, by, wid, hs) {
    if (!t.alive) return;
    t.die();
    if (t.carry || this.core.holder === t.id) { t.carry = false; if (this.core.state === 'carried') { this.core.state = 'dropped'; this.core.x = t.x; this.core.z = t.z; this.core.holder = null; } }
    this.onKill(t.id, by ? by.id : null, wid, hs);
    if (this.net) this.net.sendKill(t, by, wid, hs);
  }
  onKill(tid, bid, wid, hs) {
    const t = this.actors.find((x) => x.id === tid), by = this.actors.find((x) => x.id === bid);
    if (t && t.alive) t.die();
    if (by && by !== t) {
      by.kills++;
      if (by.isLocal || (by.isBot && this.auth)) by.credits = Math.min(RULES.maxCredits, by.credits + 200);
      if (by.isLocal) { sfx.kill(); if (this.hitMark) this.hitMark.kill = true; }
    }
    this.feed.push({ t: this.time, by: by ? by.name : '', byTeam: by ? by.team : '', to: t ? t.name : '?', toTeam: t ? t.team : '', w: wid === 'core' ? '💥' : WEAPONS[wid]?.name || '', hs });
    if (t && t.isLocal) this.say('쓰러졌어요', by ? `${by.name} · ${WEAPONS[wid]?.name || ''}${hs ? ' (헤드샷)' : ''}` : '');
  }
  tracer(a, x, y, z) {
    let sx = a.x, sy = a.eye - 0.12, sz = a.z;
    if (a.isLocal) { sx += Math.sin(a.yaw) * 0.6 + Math.cos(a.yaw) * -0.18; sz += Math.cos(a.yaw) * 0.6 - Math.sin(a.yaw) * -0.18; sy -= 0.08; }
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx, sy, sz), new THREE.Vector3(x, y, z)]);
    const m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8 }));
    this.scene.add(m);
    this.fx.push({ o: m, t: 0.06 });
    // 다른 요원 총구 섬광
    if (!a.isLocal) this.addFx('muzzle', sx + Math.sin(a.yaw) * 0.7, sy + 0.05, sz + Math.cos(a.yaw) * 0.7);
  }
  addFx(kind, x, y, z) {
    if (kind === 'spark' || kind === 'blood' || kind === 'muzzle') {
      const mat = new THREE.SpriteMaterial({ map: flashTex(), color: kind === 'blood' ? 0xc8102e : kind === 'muzzle' ? 0xffd27a : 0xffe6a0, transparent: true, depthWrite: false, blending: kind === 'blood' ? THREE.NormalBlending : THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat); s.position.set(x, y, z); s.scale.setScalar(kind === 'blood' ? 0.45 : kind === 'muzzle' ? 0.5 : 0.25);
      this.scene.add(s); this.fx.push({ o: s, t: kind === 'blood' ? 0.25 : 0.08, upd: (f) => { s.material.opacity = Math.max(0, f.t * 6); } });
      if (kind === 'spark') {
        // 총알 자국
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
        d.position.set(x, y, z); d.lookAt(this.cam.position); this.scene.add(d); this.fx.push({ o: d, t: 12 });
      }
    } else if (kind === 'boom') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9 }));
      s.position.set(x, y, z); this.scene.add(s);
      this.fx.push({ o: s, t: 1.2, upd: (f, dt) => { s.scale.addScalar(dt * 22); s.material.opacity = Math.max(0, f.t * 0.7); } });
    } else if (kind === 'flash') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(x, y, z); s.scale.setScalar(6); this.scene.add(s);
      this.fx.push({ o: s, t: 0.35, upd: (f) => { s.material.opacity = f.t * 3; } });
    } else if (kind === 'pulse' || kind === 'heal') {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: kind === 'heal' ? 0x5dff8a : 0x3fd1a3, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); this.scene.add(m);
      const R = kind === 'heal' ? 2 : 15;
      this.fx.push({ o: m, t: 0.8, upd: (f) => { const k = (0.8 - f.t) / 0.8; m.scale.setScalar(0.5 + k * R); m.material.opacity = 1 - k; } });
    }
  }
  // 적이 표시되면 머리 위 빨간 표시 (벽 너머로도)
  revealMark(a) {
    const show = a.alive && a.revealT > 0 && a.team !== this.me.team;
    if (show && !a.revealS) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 32); g.lineTo(32, 58); g.lineTo(8, 32); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      a.revealS = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      a.revealS.scale.setScalar(0.6); a.revealS.renderOrder = 20; this.scene.add(a.revealS);
    }
    if (a.revealS) { a.revealS.visible = show; if (show) a.revealS.position.set(a.x, a.y + 2.2, a.z); }
  }

  // ---------- 기술 ----------
  aimPoint(a, maxD) {
    const dx = Math.sin(a.yaw) * Math.cos(a.pitch), dy = Math.sin(a.pitch), dz = Math.cos(a.yaw) * Math.cos(a.pitch);
    const d = Math.min(maxD, rayWorld(a.x, a.eye, a.z, dx, dy, dz, maxD));
    return { x: a.x + dx * (d - 0.4), y: a.eye + dy * d, z: a.z + dz * (d - 0.4), d, dx, dy, dz };
  }
  useAbility(a, key, at) {
    if (!a.alive || this.phase === 'end' || this.phase === 'over' || a.abil[key] <= 0) return false;
    const A = AGENTS[a.agent][key];
    if (this.phase === 'buy' && A.id !== 'heal') return false;
    a.abil[key]--;
    let ev = { k: 'ab', t: A.id, by: a.id, team: a.team };
    if (A.id === 'dash') { a.dashT = 0.28; a.dashVx = Math.sin(a.yaw) * 25; a.dashVz = Math.cos(a.yaw) * 25; sfx.ability('dash'); return true; }
    if (A.id === 'flash') { const p = this.aimPoint(a, 30); ev = { ...ev, x: a.x, y: a.eye, z: a.z, vx: p.dx * 22, vy: p.dy * 22 + 3, vz: p.dz * 22 }; }
    else if (A.id === 'smoke') { const p = at || this.aimPoint(a, 40); ev = { ...ev, x: p.x, y: 0, z: p.z }; }
    else if (A.id === 'slow') { const p = this.aimPoint(a, 30); ev = { ...ev, x: p.x, y: 0, z: p.z }; }
    else if (A.id === 'pulse') { ev = { ...ev, x: a.x, y: 0, z: a.z }; }
    else if (A.id === 'dart') { const p = this.aimPoint(a, 60); ev = { ...ev, x: p.x, y: p.y, z: p.z }; }
    else if (A.id === 'heal') {
      let tgt = a;
      for (const m of this.actors) { if (m === a || !m.alive || m.team !== a.team) continue; const dx = m.x - a.x, dz = m.z - a.z, d = Math.hypot(dx, dz); if (d < 15 && (dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw)) / d > 0.95) tgt = m; }
      ev = { ...ev, to: tgt.id, x: tgt.x, y: 0, z: tgt.z };
    } else if (A.id === 'wall') { const p = this.aimPoint(a, 20); ev = { ...ev, x: p.x, y: 0, z: p.z, ax: Math.abs(Math.sin(a.yaw)) > Math.abs(Math.cos(a.yaw)) ? 'z' : 'x' }; }
    this.abilityEvent(ev);
    if (this.net) this.net.sendEvent(ev);
    return true;
  }
  abilityEvent(ev) {
    const by = this.actors.find((x) => x.id === ev.by);
    sfx.ability(ev.t);
    if (ev.t === 'flash') this.projs.push({ kind: 'flash', x: ev.x, y: ev.y, z: ev.z, vx: ev.vx, vy: ev.vy, vz: ev.vz, t: 0.6, team: ev.team, m: this.ball(0xffffff) });
    else if (ev.t === 'smoke') this.addSmoke(ev.x, ev.z);
    else if (ev.t === 'slow') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshBasicMaterial({ color: 0x8a8cf2, transparent: true, opacity: 0.5, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(ev.x, 0.05, ev.z); this.scene.add(m);
      this.zones.push({ x: ev.x, z: ev.z, r: 4, t: 6, team: ev.team, m });
    } else if (ev.t === 'pulse') {
      this.addFx('pulse', ev.x, 0, ev.z);
      for (const e of this.actors) if (e.alive && e.team !== ev.team && Math.hypot(e.x - ev.x, e.z - ev.z) < 15) e.revealT = Math.max(e.revealT, 2);
    } else if (ev.t === 'dart') {
      this.addFx('pulse', ev.x, 0, ev.z);
      for (const e of this.actors) if (e.alive && e.team !== ev.team && Math.hypot(e.x - ev.x, e.z - ev.z) < 14) { const dx = e.x - ev.x, dy = e.eye - ev.y, dz = e.z - ev.z, d = Math.hypot(dx, dy, dz); if (rayWorld(ev.x, ev.y, ev.z, dx / d, dy / d, dz / d, d) >= d - 0.3) e.revealT = Math.max(e.revealT, 3); }
    } else if (ev.t === 'heal') {
      const t = this.actors.find((x) => x.id === ev.to);
      if (t) { t.healT = 3; this.addFx('heal', t.x, 0, t.z); }
    } else if (ev.t === 'wall') {
      const L = 3.2, T = 0.3;
      const b = ev.ax === 'z' ? { x0: ev.x - T, x1: ev.x + T, z0: ev.z - L, z1: ev.z + L, y0: 0, y1: 3 } : { x0: ev.x - L, x1: ev.x + L, z0: ev.z - T, z1: ev.z + T, y0: 0, y1: 3 };
      // 사람 위에 생기지 않게
      if (this.actors.some((a) => a.alive && a.x > b.x0 - RADIUS && a.x < b.x1 + RADIUS && a.z > b.z0 - RADIUS && a.z < b.z1 + RADIUS)) { if (ev.ax === 'z') { b.x0 += 1.2; b.x1 += 1.2; } else { b.z0 += 1.2; b.z1 += 1.2; } }
      addDyn(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 3, b.z1 - b.z0), new THREE.MeshStandardMaterial({ color: 0xf2d24a, emissive: 0x7a6010, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.92 }));
      m.position.set((b.x0 + b.x1) / 2, 1.5, (b.z0 + b.z1) / 2); m.castShadow = true; this.scene.add(m);
      this.walls.push({ b, m, t: 20, hp: 400 });
    }
    if (by && by.isLocal && ev.t !== 'heal') this.vkick += 0.03;
  }
  ball(color) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color })); this.scene.add(m); return m; }
  updateProjs(dt) {
    for (const p of this.projs) {
      p.t -= dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      const dl = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
      if (dl > 0 && rayWorld(p.x, p.y, p.z, (nx - p.x) / dl, (ny - p.y) / dl, (nz - p.z) / dl, dl) < dl) { p.vx *= -0.3; p.vz *= -0.3; p.vy = Math.abs(p.vy) * 0.3; }
      else { p.x = nx; p.y = Math.max(0.1, ny); p.z = nz; }
      p.vy -= 14 * dt;
      p.m.position.set(p.x, p.y, p.z);
      if (p.t <= 0) {
        this.scene.remove(p.m);
        if (p.kind === 'flash') this.popFlash(p);
      }
    }
    this.projs = this.projs.filter((p) => p.t > 0);
  }
  popFlash(p) {
    this.addFx('flash', p.x, p.y, p.z);
    for (const a of this.actors) {
      if (!a.alive) continue;
      const dx = p.x - a.x, dy = p.y - a.eye, dz = p.z - a.z, d = Math.hypot(dx, dy, dz);
      if (d > 32) continue;
      if (rayWorld(a.x, a.eye, a.z, dx / d, dy / d, dz / d, d) < d - 0.3) continue;
      if (this.smokeBlocks(a.x, a.eye, a.z, p.x, p.y, p.z)) continue;
      const face = (dx * Math.sin(a.yaw) * Math.cos(a.pitch) + dy * Math.sin(a.pitch) + dz * Math.cos(a.yaw) * Math.cos(a.pitch)) / d;
      if (face < 0) continue;
      a.flashT = Math.max(a.flashT, 0.5 + face * 2.0 * (1 - d / 40));
    }
  }
  addSmoke(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const mat = () => new THREE.SpriteMaterial({ map: smokeTex(), color: 0x9fa6c8, transparent: true, depthWrite: false, opacity: 0.92 });
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(mat()); const a = Math.random() * Math.PI * 2, r = Math.random() * 3, y = 0.8 + Math.random() * 3.8;
      s.position.set(Math.cos(a) * r, y, Math.sin(a) * r); s.scale.setScalar(4.2 + Math.random() * 2.2); s.material.rotation = Math.random() * 6; g.add(s);
    }
    this.scene.add(g);
    this.smokes.push({ x, z, r: 4.5, t: 15, g });
  }
  smokeBlocks(x0, y0, z0, x1, y1, z1) {
    for (const s of this.smokes) {
      if (s.t > 14.6) continue;
      const cx = s.x, cy = 2.5, cz = s.z, r = s.r;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L2 = dx * dx + dy * dy + dz * dz;
      const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy + (cz - z0) * dz) / (L2 || 1)));
      const px = x0 + dx * t - cx, py = (y0 + dy * t - cy) * 0.75, pz = z0 + dz * t - cz;
      if (px * px + py * py + pz * pz < r * r) return true;
    }
    return false;
  }
  canSee(a, e) {
    const ex = e.x, ez = e.z;
    for (const ty of [e.eye - 0.05, e.y + 1.0]) {
      const dx = ex - a.x, dy = ty - a.eye, dz = ez - a.z, d = Math.hypot(dx, dy, dz);
      if (rayWorld(a.x, a.eye, a.z, dx / d, dy / d, dz / d, d) >= d - 0.4 && !this.smokeBlocks(a.x, a.eye, a.z, ex, ty, ez)) return true;
    }
    return false;
  }
  teamIntel(team, e) { this.intel[team] = { x: e.x, z: e.z, t: this.time }; }

  // ---------- 코어 ----------
  tryPlantDefuse(a, dt) {
    const C = this.core;
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    if (a.team === 'atk' && a.carry && C.state === 'carried') {
      const z = zoneAt(a.x, a.z);
      if (z !== 1 && z !== 2) { if (a.isLocal) this.say('설치 구역이 아니에요', 'A · B 사이트의 노란 선 안에서 설치'); return; }
      this.holding = a.isLocal; a.useProg = (a.useProg || 0) + dt;
      if (a.isLocal && Math.floor(a.useProg * 4) !== Math.floor((a.useProg - dt) * 4)) sfx.tick();
      if (a.useProg >= RULES.plantHold) { a.useProg = 0; const site = z === 1 ? 'A' : 'B'; const ev = { k: 'plant', by: a.id, x: a.x, z: a.z, site }; if (this.auth) this.doPlant(ev); else if (this.net) this.net.sendEvent(ev); }
    } else if (a.team === 'def' && C.state === 'planted' && Math.hypot(a.x - C.x, a.z - C.z) < 1.8) {
      this.holding = a.isLocal; a.useProg = Math.max(a.useProg || 0, C.defHalf && a.useProg < RULES.defuseHold / 2 ? RULES.defuseHold / 2 : 0) + dt;
      if (a.useProg >= RULES.defuseHold / 2 && !C.defHalf) C.defHalf = true;
      if (a.isLocal && Math.floor(a.useProg * 2) !== Math.floor((a.useProg - dt) * 2)) sfx.tick();
      if (a.useProg >= RULES.defuseHold) { a.useProg = 0; const ev = { k: 'defuse', by: a.id }; if (this.auth) this.doDefuse(ev); else if (this.net) this.net.sendEvent(ev); }
    } else a.useProg = 0;
  }
  doPlant(ev) {
    const C = this.core; if (C.state !== 'carried') return;
    const a = this.actors.find((x) => x.id === ev.by); if (a) a.carry = false;
    C.state = 'planted'; C.x = ev.x; C.z = ev.z; C.site = ev.site; C.t = RULES.plantT; C.holder = null; C.defHalf = false;
    this.phase = 'planted'; sfx.plant();
    this.say(`코어 설치됨 — ${ev.site} 사이트`, this.me.team === 'atk' ? '40초 동안 지키세요' : '해체하세요! (F 길게, 7초)');
    if (a && (a.isLocal || a.isBot)) a.credits = Math.min(RULES.maxCredits, a.credits + 300);
  }
  doDefuse(ev) {
    const C = this.core; if (C.state !== 'planted') return;
    C.state = 'defused'; this.endRound('def', '코어 해체');
  }
  updateCoreMesh(dt) {
    const C = this.core;
    if (!this.coreMesh) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.4 }));
      b.position.y = 0.25; g.add(b);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 2 }));
      l.position.y = 0.58; g.add(l); g.userData.light = l;
      const pl = new THREE.PointLight(0xff3030, 4, 8); pl.position.y = 0.8; g.add(pl); g.userData.pl = pl;
      this.scene.add(g); this.coreMesh = g;
    }
    const m = this.coreMesh;
    m.visible = C.state === 'planted' || C.state === 'dropped';
    if (m.visible) {
      m.position.set(C.x, 0, C.z);
      const blink = C.state === 'planted' ? (Math.sin(this.time * (C.t < 10 ? 18 : 7)) > 0 ? 2.5 : 0.3) : 0.6;
      m.userData.light.material.emissiveIntensity = blink; m.userData.pl.intensity = blink * 2;
    }
  }
  // 다른 사람 위치 부드럽게
  lerpRemote(a, dt) {
    const n = a.net, k = Math.min(1, dt * 14);
    a.x += (n.x - a.x) * k; a.y += (n.y - a.y) * k; a.z += (n.z - a.z) * k;
    let d = n.yaw - a.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    a.yaw += d * k; a.pitch += (n.pitch - a.pitch) * k;
    a.speedNow = n.sp || 0; a.crouch = n.cr || 0;
  }

  // ---------- 봇 ----------
  updateBot(a, dt) {
    if (!a.alive) return;
    const o = a.brain.update(dt, this) || {};
    a.walk = !!o.walk; a.crouch += ((o.crouch ? 1 : 0) - a.crouch) * Math.min(1, dt * 8);
    if (a.dashT > 0) { a.vx = a.dashVx; a.vz = a.dashVz; }
    const busy = o.plant || o.defuse;
    moveActor(a, dt, busy ? 0 : o.wx || 0, busy ? 0 : o.wz || 0, o.jump, { zoneLock: this.phase === 'buy' ? (a.team === 'atk' ? 3 : 4) : null });
    if (a.flashT > 0.3) o.fire = false;
    a.scoped = true;
    this.weaponTick(a, dt, o.fire, o.reload);
    if (!o.fire) a.trigger = false;
    if (o.use) {
      if (o.useAt) { const sy = a.yaw, sp = a.pitch; a.yaw = Math.atan2(o.useAt.x - a.x, o.useAt.z - a.z); this.useAbility(a, o.use, { x: o.useAt.x, z: o.useAt.z }); a.yaw = sy; a.pitch = sp; }
      else this.useAbility(a, o.use);
    }
    if (busy) this.tryPlantDefuse(a, dt); else a.useProg = 0;
    // 들리는 발소리
    a.stepT = (a.stepT || 0) - dt * a.speedNow;
    if (a.onGround && a.speedNow > 4 && a.stepT <= 0) { a.stepT = 2.2; if (a.team !== this.me.team) this.soundAt(a, (g, p) => sfx.step(g * 0.8, p), 28); }
  }

  // ---------- 상점 ----------
  buy(a, what) {
    if (this.phase !== 'buy' || !a.alive) return '지금은 살 수 없어요';
    if (what.startsWith('w:')) {
      const id = what.slice(2), W = WEAPONS[id], cur = a.guns[W.slot];
      if (cur && cur.id === id) return '이미 가지고 있어요';
      const refund = cur && cur.bought ? WEAPONS[cur.id].price : 0;
      if (a.credits + refund < W.price) return '크레딧이 모자라요';
      a.credits += refund - W.price; a.guns[W.slot] = { id, mag: W.mag, res: W.reserve, bought: this.round };
      a.slot = W.slot; return null;
    }
    if (what.startsWith('a:')) {
      const k = what.slice(2), A = ARMOR[k];
      if (a.armor >= A.ap) return '이미 있어요';
      if (a.credits < A.price) return '크레딧이 모자라요';
      a.credits -= A.price; a.armor = A.ap; return null;
    }
    if (what.startsWith('s:')) {
      const k = what.slice(2), A = AGENTS[a.agent][k];
      if (a.abil[k] >= A.max) return '더 살 수 없어요';
      if (a.credits < A.price) return '크레딧이 모자라요';
      a.credits -= A.price; a.abil[k]++; return null;
    }
    return '?';
  }

  // ---------- 그리기 ----------
  render(dt) {
    const me = this.me, r = this.renderer;
    r.clear();
    r.render(this.scene, this.cam);
    // 손에 든 총
    if (me.alive && this.viewGun && !this.scoped) {
      const g = this.viewGun;
      this.vkick *= Math.pow(0.0005, dt);
      const bob = me.onGround ? Math.min(1, me.speedNow / 6) : 0.2;
      this.vbob += dt * (6 + me.speedNow);
      const reload = me.reloadT > 0 ? Math.sin(Math.min(1, (me.W.reload - me.reloadT) / me.W.reload) * Math.PI) : 0;
      const aim = this.aimHeld ? 1 : 0;
      g.position.set(0.16 - aim * 0.16 + Math.cos(this.vbob) * 0.012 * bob, -0.17 + aim * 0.05 - Math.abs(Math.sin(this.vbob)) * 0.014 * bob - reload * 0.25 - me.crouch * 0.01, -0.3 + this.vkick * 1.5);
      g.scale.setScalar(0.8);
      g.rotation.set(this.vkick * 3 + reload * 0.9, 0, reload * 0.3);
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) g.userData.flash.visible = false; else g.userData.flash.rotation.z = Math.random() * 6; }
      r.clearDepth();
      r.render(this.vscene, this.vcam);
    }
  }
}
let ST = null;
function smokeTex() {
  if (ST) return ST;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(240,240,250,.75)'); gr.addColorStop(1, 'rgba(230,230,240,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(200,200,215,${Math.random() * 0.15})`; g.beginPath(); g.arc(20 + Math.random() * 88, 20 + Math.random() * 88, 6 + Math.random() * 14, 0, 7); g.fill(); }
  ST = new THREE.CanvasTexture(c); return ST;
}
export { HOLDS, SITES, TEAM, MAP };
