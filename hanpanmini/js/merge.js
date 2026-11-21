// 숫자 합치기 — 같은 숫자를 밀어 붙여 합쳐요
const N = 4, BX = 30, BY = 210, SZ = 420, GAP = 12, TS = (SZ - GAP * (N + 1)) / N, ANIM = 0.11;
const PAL = { 2: ['#f3ead7', '#6b5a45'], 4: ['#f1dfb8', '#6b5a45'], 8: ['#ffb36b', '#fff'], 16: ['#ff8f52', '#fff'], 32: ['#ff6b5a', '#fff'], 64: ['#ff4a3a', '#fff'], 128: ['#ffd84d', '#fff'], 256: ['#ffcc2e', '#fff'], 512: ['#ffbf00', '#fff'], 1024: ['#7ad36b', '#fff'], 2048: ['#33c4a0', '#fff'], 4096: ['#4a9bff', '#fff'], 8192: ['#8a6bff', '#fff'] };
const pal = (v) => PAL[v] || ['#2b2b3a', '#fff'];
const px = (c) => BX + GAP + c * (TS + GAP), py = (r) => BY + GAP + r * (TS + GAP);

export default {
  id: 'merge', name: '숫자 합치기', icon: '🔢', desc: '밀어서 같은 숫자를 합쳐요. 2048을 넘어 끝까지 가 보기!',
  help: '방향키(또는 WASD)나 화면을 밀어서 모든 숫자를 한쪽으로 보내요. 같은 숫자가 부딪히면 합쳐져요. Z = 한 번 되돌리기.',
  thumb(x, w, h) {
    x.fillStyle = '#2a2420'; x.fillRect(0, 0, w, h); const v = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4, 2, 8, 16, 2];
    for (let i = 0; i < 8; i++) { const r = Math.floor(i / 4), c = i % 4, s = 56; const [bg, fg] = pal(v[(i * 3) % 16]); x.fillStyle = bg; x.beginPath(); x.roundRect(46 + c * (s + 8), 34 + r * (s + 8) + (r ? 0 : 0), s, s, 8); x.fill(); x.fillStyle = fg; x.font = '900 20px system-ui'; x.textAlign = 'center'; x.fillText(v[(i * 3) % 16], 46 + c * (s + 8) + s / 2, 34 + r * (s + 8) + s / 2 + 7); }
  },
  make(api) {
    let id = 0;
    const S = { W: 480, H: 800, tiles: [], score: 0, shown: 0, anim: 0, best: api.best(), won: false, undo: null, sw: null, pops: [], banner: 0 };
    const at = () => { const g = Array.from({ length: N }, () => Array(N).fill(null)); S.tiles.forEach((t) => { if (!t.dead) g[t.r][t.c] = t; }); return g; };
    const spawn = () => { const g = at(), free = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) free.push([r, c]); if (!free.length) return; const [r, c] = free[Math.floor(Math.random() * free.length)]; S.tiles.push({ id: id++, v: Math.random() < 0.9 ? 2 : 4, r, c, fr: r, fc: c, born: 0, pop: 0 }); };
    spawn(); spawn();
    const canMove = () => { const g = at(); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = g[r][c]; if (!t) return true; if (c < N - 1 && g[r][c + 1] && g[r][c + 1].v === t.v) return true; if (r < N - 1 && g[r + 1][c] && g[r + 1][c].v === t.v) return true; } return false; };
    function slide(dr, dc) {
      if (S.anim > 0) finish();
      S.tiles = S.tiles.filter((t) => !t.dead);
      const snap = { tiles: S.tiles.map((t) => ({ ...t })), score: S.score };
      const g = at(); let moved = false, gain = 0;
      S.tiles.forEach((t) => { t.fr = t.r; t.fc = t.c; t.born = 1; t.pop = 0; t.merged = false; });
      const order = [...Array(N).keys()]; const rows = dr > 0 ? order.slice().reverse() : order, cols = dc > 0 ? order.slice().reverse() : order;
      for (const r of rows) for (const c of cols) {
        const t = g[r][c]; if (!t) continue; let nr = r, nc = c;
        while (true) { const ar = nr + dr, ac = nc + dc; if (ar < 0 || ac < 0 || ar >= N || ac >= N) break; const o = g[ar][ac]; if (!o) { nr = ar; nc = ac; continue; } if (o.v === t.v && !o.merged && !o.dead) { g[r][c] = null; t.r = ar; t.c = ac; t.dead = true; o.v *= 2; o.merged = true; o.pop = 1; gain += o.v; moved = true; t.into = o; } break; }
        if (!t.dead && (nr !== r || nc !== c)) { g[r][c] = null; g[nr][nc] = t; t.r = nr; t.c = nc; moved = true; }
      }
      if (!moved) return;
      S.undo = snap; S.score += gain; S.anim = ANIM;
      if (gain) { api.sfx(260 + Math.log2(gain) * 50, 0.08, 'triangle', 0.12); S.pops.push({ txt: '+' + gain, t: 0 }); } else api.sfx(200, 0.03, 'sine', 0.05);
      S.pending = true;
    }
    function finish() {
      S.anim = 0; S.tiles = S.tiles.filter((t) => !t.dead); S.tiles.forEach((t) => { t.fr = t.r; t.fc = t.c; });
      if (S.pending) { S.pending = false; spawn(); S.tiles[S.tiles.length - 1].born = 0;
        if (!S.won && S.tiles.some((t) => t.v >= 2048)) { S.won = true; S.banner = 2.5; api.sfx(784, 0.5, 'triangle', 0.15, 400); }
        if (!canMove()) setTimeout(() => api.end(S.score, '더 밀 수 없어요', '가장 큰 수: ' + Math.max(...S.tiles.map((t) => t.v))), 400);
      }
    }
    const dirs = { ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1], ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0] };
    return Object.assign(S, {
      key(k, d) { if (!d) return false; if (dirs[k]) { slide(...dirs[k]); return; } if (k === 'KeyZ' && S.undo) { S.tiles = S.undo.tiles; S.score = S.undo.score; S.undo = null; S.anim = 0; S.pending = false; api.sfx(300, 0.06, 'sine', 0.08, -100); } return false; },
      down(x, y) { S.sw = [x, y]; if (x > 330 && y > 120 && y < 175 && S.undo) S.key('KeyZ', true); },
      up(x, y) { if (!S.sw) return; const dx = x - S.sw[0], dy = y - S.sw[1]; S.sw = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return; if (Math.abs(dx) > Math.abs(dy)) slide(0, dx > 0 ? 1 : -1); else slide(dy > 0 ? 1 : -1, 0); },
      update(dt) {
        if (S.anim > 0) { S.anim -= dt; if (S.anim <= 0) finish(); }
        S.tiles.forEach((t) => { if (t.born < 1) t.born = Math.min(1, t.born + dt * 7); if (t.pop > 0 && S.anim <= 0) t.pop = Math.max(0, t.pop - dt * 6); });
        S.shown += (S.score - S.shown) * Math.min(1, dt * 12); S.pops.forEach((p) => p.t += dt); S.pops = S.pops.filter((p) => p.t < 0.8); if (S.banner > 0) S.banner -= dt;
      },
      draw(g) {
        g.fillStyle = '#faf6ee'; g.fillRect(0, 0, 480, 800); g.textAlign = 'center';
        g.fillStyle = '#3d3326'; g.font = '900 46px system-ui'; g.textAlign = 'left'; g.fillText('합치기', 30, 110);
        const box = (x, lab, v) => { g.fillStyle = '#bba98f'; g.beginPath(); g.roundRect(x, 66, 100, 56, 10); g.fill(); g.fillStyle = '#f3ead7'; g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText(lab, x + 50, 84); g.fillStyle = '#fff'; g.font = '900 22px system-ui'; g.fillText(Math.round(v).toLocaleString(), x + 50, 110); };
        box(240, '점수', S.shown); box(350, '최고', Math.max(S.best, S.score));
        S.pops.forEach((p) => { g.globalAlpha = 1 - p.t / 0.8; g.fillStyle = '#7a6a55'; g.font = '800 18px system-ui'; g.fillText(p.txt, 290, 62 - p.t * 30); g.globalAlpha = 1; });
        g.fillStyle = S.undo ? '#8f7a60' : '#d8cdbc'; g.beginPath(); g.roundRect(350, 130, 100, 40, 10); g.fill(); g.fillStyle = '#fff'; g.font = '800 15px system-ui'; g.fillText('↶ 되돌리기', 400, 156);
        g.fillStyle = '#7a6a55'; g.font = '600 14px system-ui'; g.textAlign = 'left'; g.fillText('밀어서 합치기 · 목표 2048', 30, 156);
        g.fillStyle = '#bba98f'; g.beginPath(); g.roundRect(BX, BY, SZ, SZ, 14); g.fill();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { g.fillStyle = '#d6c8b2'; g.beginPath(); g.roundRect(px(c), py(r), TS, TS, 8); g.fill(); }
        const k = S.anim > 0 ? 1 - S.anim / ANIM : 1, e = 1 - (1 - k) * (1 - k);
        const list = S.tiles.slice().sort((a, b) => (a.dead ? 0 : 1) - (b.dead ? 0 : 1));
        g.textAlign = 'center';
        for (const t of list) {
          if (t.dead && S.anim <= 0) continue;
          const x = px(t.fc) + (px(t.c) - px(t.fc)) * e, y = py(t.fr) + (py(t.r) - py(t.fr)) * e;
          const v = t.dead || (t.merged && S.anim > 0) ? (t.dead ? t.into.v / 2 : t.v / 2) : t.v;
          let s = t.born < 1 ? t.born : 1; if (t.pop > 0 && S.anim <= 0) s = 1 + Math.sin(t.pop * Math.PI) * 0.12;
          const [bg, fg] = pal(v); const w = TS * s; g.fillStyle = bg; g.beginPath(); g.roundRect(x + (TS - w) / 2, y + (TS - w) / 2, w, w, 8); g.fill();
          if (v >= 128) { g.shadowColor = bg; g.shadowBlur = 16; g.fill(); g.shadowBlur = 0; }
          g.fillStyle = fg; g.font = `900 ${(v < 100 ? 44 : v < 1000 ? 38 : v < 10000 ? 30 : 24) * s}px system-ui`; g.fillText(v, x + TS / 2, y + TS / 2 + 14 * s);
        }
        if (S.banner > 0) { g.globalAlpha = Math.min(1, S.banner); g.fillStyle = 'rgba(255,204,46,.92)'; g.beginPath(); g.roundRect(60, 360, 360, 100, 18); g.fill(); g.fillStyle = '#fff'; g.font = '900 34px system-ui'; g.fillText('2048 달성! 🎉', 240, 410); g.font = '700 16px system-ui'; g.fillText('계속해서 더 큰 수까지!', 240, 440); g.globalAlpha = 1; }
        g.fillStyle = '#a2927a'; g.font = '600 14px system-ui'; g.fillText('방향키 · WASD · 화면 밀기', 240, 690);
      },
    });
  },
};
