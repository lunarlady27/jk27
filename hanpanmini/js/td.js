// 성벽 수비 — 길을 따라 오는 몬스터를 탑으로 막아요
const W = 960, H = 540, CS = 60, OY = 60, COLS = 16, ROWS = 8, MAXW = 30;
const PATH = [[-1, 1], [3, 1], [3, 6], [7, 6], [7, 2], [11, 2], [11, 6], [14, 6], [14, 3], [16, 3]];
const TOWERS = {
  arrow: { name: '화살탑', icon: '🏹', cost: 50, range: 150, rate: 0.45, dmg: 12, col: '#c98a4b', key: 'Digit1', info: '빠른 단일 공격' },
  cannon: { name: '대포탑', icon: '💣', cost: 90, range: 140, rate: 1.3, dmg: 32, splash: 60, col: '#6b6b7a', key: 'Digit2', info: '범위 피해' },
  frost: { name: '서리탑', icon: '❄️', cost: 70, range: 125, rate: 0.8, dmg: 6, slow: 0.45, col: '#5ad8ff', key: 'Digit3', info: '느리게 만들기' },
  bolt: { name: '번개탑', icon: '⚡', cost: 130, range: 165, rate: 1.1, dmg: 24, chain: 4, col: '#c86bff', key: 'Digit4', info: '연쇄 번개' },
};
const FOES = {
  slime: { hp: 32, spd: 58, gold: 5, col: '#5fe07a', r: 13 },
  bat: { hp: 20, spd: 112, gold: 5, col: '#c86bff', r: 11, fly: true },
  turtle: { hp: 125, spd: 38, gold: 12, col: '#3a9a6a', r: 17, armor: 3 },
  boss: { hp: 950, spd: 33, gold: 100, col: '#ff4a4a', r: 26, armor: 5 },
};
const pts = PATH.map(([c, r]) => [c * CS + CS / 2, OY + r * CS + CS / 2]);
const segs = []; let TOTAL = 0; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, s: TOTAL }); TOTAL += l; }
const posAt = (d) => { for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k]; } return pts[pts.length - 1]; };
const ROAD = new Set(); for (let i = 0; i < PATH.length - 1; i++) { let [c, r] = PATH[i]; const [c2, r2] = PATH[i + 1]; while (c !== c2 || r !== r2) { ROAD.add(c + ',' + r); c += Math.sign(c2 - c); r += Math.sign(r2 - r); } ROAD.add(c2 + ',' + r2); }
const stat = (t) => { const T = TOWERS[t.k], L = t.lv - 1; return { range: T.range + L * 18, rate: T.rate * Math.pow(0.85, L), dmg: T.dmg * Math.pow(1.65, L), splash: T.splash, slow: T.slow ? Math.min(0.65, T.slow + L * 0.08) : 0, chain: T.chain ? T.chain + L : 0 }; };
const upCost = (t) => Math.round(TOWERS[t.k].cost * 0.8 * t.lv);

function drawTower(g, k, x, y, lv = 1, a = 0) {
  const T = TOWERS[k]; g.fillStyle = '#4a4a58'; g.beginPath(); g.roundRect(x - 22, y - 22, 44, 44, 9); g.fill(); g.fillStyle = T.col; g.beginPath(); g.arc(x, y, 15 + lv, 0, 7); g.fill();
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#222'; if (k === 'cannon') g.fillRect(0, -6, 24, 12); else if (k === 'arrow') g.fillRect(0, -3, 22, 6); else if (k === 'frost') { g.fillStyle = '#e6f8ff'; g.fillRect(0, -4, 18, 8); } else { g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); } g.restore();
  for (let i = 0; i < lv; i++) { g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(x - 12 + i * 12, y + 26, 3.5, 0, 7); g.fill(); }
}

export default {
  id: 'td', name: '성벽 수비', icon: '🏰', desc: '탑 4종을 세우고 강화해서 30웨이브를 막아요. 전략 디펜스!',
  help: '빈 땅을 눌러 탑 짓기(1~4), 탑을 눌러 강화(U)·판매(X). 스페이스 = 다음 웨이브, F = 2배속. 몬스터가 성에 닿으면 생명 -1.',
  thumb(x, w, h) {
    x.fillStyle = '#5c8a3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c9a66b'; x.lineWidth = 26; x.lineJoin = 'round'; x.beginPath(); x.moveTo(0, 50); x.lineTo(90, 50); x.lineTo(90, 150); x.lineTo(200, 150); x.lineTo(200, 70); x.lineTo(w, 70); x.stroke();
    [['arrow', 140, 95], ['cannon', 250, 120], ['frost', 40, 110], ['bolt', 150, 40]].forEach(([k, a, b]) => drawTower(x, k, a, b, 2)); x.fillStyle = '#5fe07a'; x.beginPath(); x.arc(200, 110, 9, 0, 7); x.fill(); x.fillStyle = '#ff4a4a'; x.beginPath(); x.arc(260, 70, 13, 0, 7); x.fill();
  },
  make(api) {
    const S = { W, H, gold: 130, lives: 20, wave: 0, foes: [], towers: [], shots: [], fx: [], queue: [], spawnT: 0, sel: null, fast: 1, kills: 0, t: 0, msg: null, waveOn: false, auto: false };
    const towerAt = (c, r) => S.towers.find((t) => t.c === c && t.r === r);
    const say = (txt, t = 2) => { S.msg = { txt, t }; };
    function nextWave() {
      if (S.waveOn || S.wave >= MAXW) return; S.wave++; S.waveOn = true; const w = S.wave; const q = [];
      const n = 7 + Math.floor(w * 1.3);
      for (let i = 0; i < n; i++) { let k = 'slime'; const r = (i * 7919 + w * 31) % 100; if (w >= 3 && r < 25 + w) k = 'bat'; if (w >= 5 && r > 80 - w) k = 'turtle'; q.push(k); }
      if (w % 10 === 0) q.push('boss'); else if (w % 5 === 0) q.push('turtle', 'turtle');
      S.queue = q; S.spawnT = 0; say(w % 10 === 0 ? `웨이브 ${w} — 보스 등장!` : `웨이브 ${w}`, 1.6); api.sfx(440, 0.2, 'triangle', 0.1, 220);
    }
    function spawn(k) { const F = FOES[k], w = S.wave, mul = 1 + 0.17 * w + 0.011 * w * w; S.foes.push({ k, hp: F.hp * mul, max: F.hp * mul, d: 0, slowT: 0, slow: 0, x: pts[0][0], y: pts[0][1], hit: 0 }); }
    function damage(f, dmg) { const F = FOES[f.k]; f.hp -= Math.max(dmg * 0.25, dmg - (F.armor || 0)); f.hit = 0.1; if (f.hp <= 0 && !f.dead) { f.dead = true; S.gold += F.gold; S.kills++; S.fx.push({ k: 'pop', x: f.x, y: f.y, t: 0.35, c: F.col, txt: '+' + F.gold }); if (Math.random() < 0.5) api.sfx(300 + Math.random() * 200, 0.05, 'square', 0.04); } }
    function fire(t) {
      const st = stat(t); let best = null;
      for (const f of S.foes) { if (f.dead) continue; if (Math.hypot(f.x - t.x, f.y - t.y) > st.range) continue; if (!best || f.d > best.d) best = f; }
      if (!best) return false; t.a = Math.atan2(best.y - t.y, best.x - t.x);
      if (t.k === 'bolt') {
        const hit = [best]; let cur = best; for (let i = 1; i < st.chain; i++) { let nx = null, nd = 110; for (const f of S.foes) { if (f.dead || hit.includes(f)) continue; const d = Math.hypot(f.x - cur.x, f.y - cur.y); if (d < nd) { nd = d; nx = f; } } if (!nx) break; hit.push(nx); cur = nx; }
        let px = t.x, py = t.y; hit.forEach((f, i) => { S.fx.push({ k: 'zap', x0: px, y0: py, x1: f.x, y1: f.y, t: 0.15 }); px = f.x; py = f.y; damage(f, st.dmg * Math.pow(0.8, i)); }); api.sfx(900, 0.06, 'sawtooth', 0.03, -500);
      } else S.shots.push({ k: t.k, x: t.x, y: t.y, tg: best, st, spd: t.k === 'cannon' ? 380 : 620 });
      return true;
    }
    function build(k) {
      const s = S.sel; if (!s || s.t) return; const T = TOWERS[k]; if (S.gold < T.cost) { say('골드가 부족해요', 1); api.sfx(150, 0.1, 'sawtooth', 0.05); return; }
      S.gold -= T.cost; const t = { k, c: s.c, r: s.r, x: s.c * CS + CS / 2, y: OY + s.r * CS + CS / 2, lv: 1, cd: 0, a: 0, spent: T.cost }; S.towers.push(t); S.sel = { c: s.c, r: s.r, t }; api.sfx(260, 0.12, 'triangle', 0.12, 200);
    }
    function upgrade() { const t = S.sel && S.sel.t; if (!t || t.lv >= 3) return; const c = upCost(t); if (S.gold < c) { say('골드가 부족해요', 1); return; } S.gold -= c; t.spent += c; t.lv++; api.sfx(520, 0.15, 'triangle', 0.12, 300); }
    function sell() { const t = S.sel && S.sel.t; if (!t) return; S.gold += Math.round(t.spent * 0.7); S.towers = S.towers.filter((x) => x !== t); S.sel = null; api.sfx(340, 0.1, 'sine', 0.1, -150); }
    // 화면 버튼 위치
    const menuBtns = () => {
      const s = S.sel; if (!s) return []; const bx = Math.min(W - 130, Math.max(130, s.c * CS + CS / 2)), by = s.r >= 4 ? OY + s.r * CS - 44 : OY + (s.r + 1) * CS + 44;
      if (!s.t) return Object.keys(TOWERS).map((k, i) => ({ k, x: bx - 99 + i * 66, y: by, act: () => build(k) }));
      const out = []; if (s.t.lv < 3) out.push({ k: 'up', x: bx - 36, y: by, act: upgrade }); out.push({ k: 'sell', x: bx + 36, y: by, act: sell }); return out;
    };
    const topBtns = () => [{ k: 'wave', x: 640, y: 8, w: 170, h: 44, act: nextWave }, { k: 'fast', x: 820, y: 8, w: 60, h: 44, act: () => { S.fast = S.fast === 1 ? 2 : 1; } }, { k: 'auto', x: 888, y: 8, w: 64, h: 44, act: () => { S.auto = !S.auto; } }];
    function endGame(win) { const sc = S.kills * 10 + S.wave * 100 + (win ? S.lives * 80 + 1000 : 0); api.end(sc, win ? '성을 지켰어요! 🏰' : '성이 무너졌어요', `웨이브 ${S.wave}/${MAXW} · 처치 ${S.kills} · 남은 생명 ${S.lives}`); }
    return Object.assign(S, {
      key(k, d) {
        if (!d) return false; const tk = Object.keys(TOWERS).find((x) => TOWERS[x].key === k); if (tk) { build(tk); return; }
        if (k === 'KeyU') upgrade(); else if (k === 'KeyX') sell(); else if (k === 'Space') nextWave(); else if (k === 'KeyF') S.fast = S.fast === 1 ? 2 : 1; else return false;
      },
      down(x, y) {
        for (const b of topBtns()) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.act(); return; }
        for (const b of menuBtns()) if (Math.hypot(x - b.x, y - b.y) < 30) { b.act(); return; }
        const c = Math.floor(x / CS), r = Math.floor((y - OY) / CS);
        if (y < OY || c < 0 || c >= COLS || r < 0 || r >= ROWS || ROAD.has(c + ',' + r)) { S.sel = null; return; }
        const t = towerAt(c, r); S.sel = S.sel && S.sel.c === c && S.sel.r === r ? null : { c, r, t };
      },
      update(rdt) {
        for (let it = 0; it < S.fast; it++) {
          const dt = rdt; S.t += dt; if (S.msg) { S.msg.t -= dt; if (S.msg.t <= 0) S.msg = null; }
          if (S.queue.length) { S.spawnT -= dt; if (S.spawnT <= 0) { spawn(S.queue.shift()); S.spawnT = Math.max(0.35, 0.8 - S.wave * 0.012); } }
          for (const f of S.foes) {
            if (f.dead) continue; const F = FOES[f.k]; if (f.slowT > 0) f.slowT -= dt; else f.slow = 0; if (f.hit > 0) f.hit -= dt;
            f.d += F.spd * (1 - f.slow) * dt; [f.x, f.y] = posAt(f.d);
            if (f.d >= TOTAL) { f.dead = true; f.leaked = true; S.lives -= f.k === 'boss' ? 5 : 1; S.fx.push({ k: 'leak', t: 0.4 }); api.sfx(120, 0.25, 'square', 0.12, -40); }
          }
          S.foes = S.foes.filter((f) => !f.dead);
          for (const t of S.towers) { t.cd -= dt; if (t.cd <= 0 && fire(t)) t.cd = stat(t).rate; }
          for (const s of S.shots) {
            const tx = s.tg.x, ty = s.tg.y, d = Math.hypot(tx - s.x, ty - s.y), mv = s.spd * dt;
            if (d <= mv || s.tg.dead) {
              s.done = true; if (s.tg.dead && d > mv) { s.x = tx; s.y = ty; }
              if (s.k === 'cannon') { S.foes.forEach((f) => { if (Math.hypot(f.x - tx, f.y - ty) < s.st.splash) damage(f, s.st.dmg); }); S.fx.push({ k: 'boom', x: tx, y: ty, t: 0.3, r: s.st.splash }); api.sfx(90, 0.15, 'sawtooth', 0.06, -40); }
              else if (!s.tg.dead) { damage(s.tg, s.st.dmg); if (s.k === 'frost') { s.tg.slow = Math.max(s.tg.slow, s.st.slow); s.tg.slowT = 1.6; } }
            } else { s.x += ((tx - s.x) / d) * mv; s.y += ((ty - s.y) / d) * mv; }
          }
          S.shots = S.shots.filter((s) => !s.done); S.fx.forEach((f) => f.t -= dt); S.fx = S.fx.filter((f) => f.t > 0);
          if (S.lives <= 0) { S.lives = 0; endGame(false); return; }
          if (S.waveOn && !S.queue.length && !S.foes.length) {
            S.waveOn = false; const bonus = 20 + S.wave * 4; S.gold += bonus; say(`웨이브 ${S.wave} 막음! +${bonus} 골드`, 1.8);
            if (S.wave >= MAXW) { endGame(true); return; } if (S.auto) setTimeout(nextWave, 1200);
          }
        }
      },
      draw(g) {
        g.fillStyle = '#5c8a3a'; g.fillRect(0, 0, W, H);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if ((r + c) % 2) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(c * CS, OY + r * CS, CS, CS); } }
        // 길
        g.lineJoin = 'round'; g.lineCap = 'butt'; g.strokeStyle = '#a8865a'; g.lineWidth = CS - 4; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke(); g.strokeStyle = '#c9a66b'; g.lineWidth = CS - 14; g.stroke();
        // 나무 장식 (길 아닌 칸 일부)
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (ROAD.has(c + ',' + r) || towerAt(c, r) || (c * 7 + r * 13) % 11) continue; const x = c * CS + 30, y = OY + r * CS + 34; g.fillStyle = '#3f6b28'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.fillStyle = '#4f8232'; g.beginPath(); g.arc(x - 4, y - 5, 9, 0, 7); g.fill(); }
        // 성
        const [ex, ey] = pts[pts.length - 2]; g.fillStyle = '#8a8a9a'; g.fillRect(ex + 46, ey - 50, 50, 100); g.fillStyle = '#6f6f80'; for (let i = 0; i < 3; i++) g.fillRect(ex + 46 + i * 18, ey - 62, 12, 14); g.fillStyle = '#ff4a4a'; g.fillRect(ex + 70, ey - 90, 3, 30); g.beginPath(); g.moveTo(ex + 73, ey - 90); g.lineTo(ex + 92, ey - 82); g.lineTo(ex + 73, ey - 74); g.fill();
        if (S.sel) { const s = S.sel; g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(s.c * CS + 2, OY + s.r * CS + 2, CS - 4, CS - 4); if (s.t) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(s.t.x, s.t.y, stat(s.t).range, 0, 7); g.fill(); } }
        for (const t of S.towers) drawTower(g, t.k, t.x, t.y, t.lv, t.a);
        for (const f of S.foes) {
          const F = FOES[f.k], bob = Math.sin(S.t * 10 + f.d * 0.1) * 2; g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(f.x, f.y + F.r * 0.8, F.r, F.r * 0.35, 0, 0, 7); g.fill();
          const y = f.y - (F.fly ? 14 : 0) + bob; g.fillStyle = f.hit > 0 ? '#fff' : f.slow ? '#a8e8ff' : F.col;
          if (f.k === 'bat') { g.beginPath(); const fl = Math.sin(S.t * 30) * 6; g.moveTo(f.x - 18, y - fl); g.lineTo(f.x, y + 4); g.lineTo(f.x + 18, y - fl); g.lineTo(f.x, y - 6); g.fill(); }
          if (f.k === 'turtle' || f.k === 'boss') { g.fillStyle = f.hit > 0 ? '#fff' : f.k === 'boss' ? '#8a1a2a' : '#2a6a4a'; g.beginPath(); g.arc(f.x, y, F.r, Math.PI, 0); g.fill(); g.fillStyle = f.hit > 0 ? '#fff' : F.col; }
          g.beginPath(); g.arc(f.x, y + (f.k === 'turtle' ? 4 : 0), F.r * (f.k === 'turtle' || f.k === 'boss' ? 0.75 : 1), 0, 7); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(f.x - F.r * 0.3, y - F.r * 0.15, F.r * 0.22, 0, 7); g.arc(f.x + F.r * 0.3, y - F.r * 0.15, F.r * 0.22, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(f.x - F.r * 0.25, y - F.r * 0.12, F.r * 0.1, 0, 7); g.arc(f.x + F.r * 0.35, y - F.r * 0.12, F.r * 0.1, 0, 7); g.fill();
          if (f.k === 'boss') { g.fillStyle = '#ffcc33'; g.beginPath(); g.moveTo(f.x - 14, y - 22); g.lineTo(f.x - 8, y - 34); g.lineTo(f.x, y - 24); g.lineTo(f.x + 8, y - 34); g.lineTo(f.x + 14, y - 22); g.fill(); }
          if (f.hp < f.max) { g.fillStyle = '#300'; g.fillRect(f.x - 16, y - F.r - 12, 32, 5); g.fillStyle = '#5fe07a'; g.fillRect(f.x - 16, y - F.r - 12, (32 * f.hp) / f.max, 5); }
        }
        for (const s of S.shots) { g.fillStyle = s.k === 'cannon' ? '#222' : s.k === 'frost' ? '#bff0ff' : '#6b4a2a'; g.beginPath(); g.arc(s.x, s.y, s.k === 'cannon' ? 7 : 4, 0, 7); g.fill(); }
        for (const f of S.fx) {
          if (f.k === 'zap') { g.strokeStyle = '#f0d0ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(f.x0, f.y0); const mx = (f.x0 + f.x1) / 2 + (Math.random() - 0.5) * 20, my = (f.y0 + f.y1) / 2 + (Math.random() - 0.5) * 20; g.lineTo(mx, my); g.lineTo(f.x1, f.y1); g.stroke(); }
          else if (f.k === 'boom') { g.fillStyle = `rgba(255,170,60,${f.t / 0.3 * 0.6})`; g.beginPath(); g.arc(f.x, f.y, f.r * (1.2 - f.t / 0.3 * 0.5), 0, 7); g.fill(); }
          else if (f.k === 'pop') { g.globalAlpha = f.t / 0.35; g.fillStyle = '#ffe14d'; g.font = '800 15px system-ui'; g.textAlign = 'center'; g.fillText(f.txt, f.x, f.y - 20 - (0.35 - f.t) * 60); g.globalAlpha = 1; }
          else if (f.k === 'leak') { g.fillStyle = `rgba(255,0,0,${f.t * 0.5})`; g.fillRect(0, 0, W, H); }
        }
        // 선택 메뉴
        for (const b of menuBtns()) {
          g.fillStyle = 'rgba(20,20,30,.88)'; g.beginPath(); g.arc(b.x, b.y, 30, 0, 7); g.fill(); g.textAlign = 'center';
          if (TOWERS[b.k]) { const T = TOWERS[b.k], ok = S.gold >= T.cost; g.globalAlpha = ok ? 1 : 0.45; g.font = '22px system-ui'; g.fillText(T.icon, b.x, b.y + 2); g.font = '800 12px system-ui'; g.fillStyle = '#ffcc33'; g.fillText(T.cost, b.x, b.y + 20); g.globalAlpha = 1; }
          else if (b.k === 'up') { const c = upCost(S.sel.t), ok = S.gold >= c; g.globalAlpha = ok ? 1 : 0.45; g.fillStyle = '#5fe07a'; g.font = '900 20px system-ui'; g.fillText('▲', b.x, b.y + 2); g.font = '800 12px system-ui'; g.fillStyle = '#ffcc33'; g.fillText(c, b.x, b.y + 20); g.globalAlpha = 1; }
          else { g.fillStyle = '#ff7b7b'; g.font = '800 13px system-ui'; g.fillText('판매', b.x, b.y + 2); g.fillStyle = '#ffcc33'; g.font = '800 12px system-ui'; g.fillText('+' + Math.round(S.sel.t.spent * 0.7), b.x, b.y + 19); }
        }
        if (S.sel) { const s = S.sel; g.textAlign = 'left'; g.fillStyle = 'rgba(20,20,30,.85)'; g.beginPath(); g.roundRect(8, H - 36, 520, 30, 8); g.fill(); g.fillStyle = '#fff'; g.font = '700 14px system-ui'; g.fillText(s.t ? `${TOWERS[s.t.k].name} Lv.${s.t.lv} · 공격 ${Math.round(stat(s.t).dmg)} · 사거리 ${stat(s.t).range}${s.t.lv < 3 ? ' · U 강화' : ' · 최대 레벨'} · X 판매` : Object.values(TOWERS).map((T, i) => `${i + 1} ${T.name}(${T.info})`).join(' · '), 18, H - 16); }
        // 위쪽 정보줄
        g.fillStyle = 'rgba(20,20,30,.9)'; g.fillRect(0, 0, W, OY); g.textAlign = 'left'; g.font = '800 20px system-ui';
        g.fillStyle = '#ffcc33'; g.fillText(`💰 ${S.gold}`, 250, 38); g.fillStyle = '#ff7b7b'; g.fillText(`❤️ ${S.lives}`, 370, 38); g.fillStyle = '#fff'; g.fillText(`웨이브 ${S.wave}/${MAXW}`, 470, 38);
        for (const b of topBtns()) { const on = b.k === 'wave' ? !S.waveOn && S.wave < MAXW : b.k === 'fast' ? S.fast === 2 : S.auto; g.fillStyle = b.k === 'wave' ? (on ? '#ff8a00' : '#444') : on ? '#3ec9ff' : '#333'; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 10); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 16px system-ui'; g.fillText(b.k === 'wave' ? (S.waveOn ? '진행 중…' : S.wave ? '다음 웨이브 ▶' : '시작 ▶') : b.k === 'fast' ? '2배' : '자동', b.x + b.w / 2, b.y + 28); }
        if (S.msg) { g.globalAlpha = Math.min(1, S.msg.t * 2); g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(W / 2 - 200, 220, 400, 60, 14); g.fill(); g.fillStyle = '#fff'; g.font = '900 26px system-ui'; g.textAlign = 'center'; g.fillText(S.msg.txt, W / 2, 260); g.globalAlpha = 1; }
        if (!S.wave && !S.towers.length) { g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(W / 2 - 260, 300, 520, 50, 12); g.fill(); g.fillStyle = '#fff'; g.font = '700 17px system-ui'; g.textAlign = 'center'; g.fillText('길 옆 빈 땅을 눌러 탑을 세운 뒤 [시작 ▶]을 눌러요', W / 2, 331); }
      },
    });
  },
};
