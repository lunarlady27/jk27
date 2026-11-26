// 블록 채우기 — 8x8 판에 조각을 끌어다 놓고 줄을 지워요
const N = 8, CS = 52, BX = 32, BY = 150, TRAY_Y = 640;
const COLORS = ['#ff5e5e', '#ffb02e', '#ffe14d', '#5fe07a', '#3ec9ff', '#6e7bff', '#c86bff', '#ff7bc4'];
const raw = [
  [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], [[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [0, 1]],
];
const SHAPES = raw.map((c) => ({ c, w: Math.max(...c.map((p) => p[0])) + 1, h: Math.max(...c.map((p) => p[1])) + 1 }));

function cell(g, x, y, s, col, a = 1) {
  g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.18); g.fill();
  g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.roundRect(x + 4, y + 4, s - 8, s * 0.32, s * 0.12); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 4, y + s - 7, s - 8, 3); g.globalAlpha = 1;
}

export default {
  id: 'blocks', name: '블록 채우기', icon: '🧩', desc: '조각을 판에 끼워 가로·세로 줄을 지우기. 연속으로 지우면 콤보!',
  help: '아래 조각 3개를 끌어서 판에 놓아요. 한 줄이 꽉 차면 사라져요. 놓을 곳이 없으면 끝.',
  thumb(x, w, h) {
    x.fillStyle = '#20223a'; x.fillRect(0, 0, w, h); const s = 24;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { x.fillStyle = '#2c2f50'; x.fillRect(64 + i * s + 1, 28 + j * s + 1, s - 2, s - 2); if ((i * 7 + j * 3) % 5 < 2 || j === 4) cell(x, 64 + i * s, 28 + j * s, s, COLORS[(i + j) % 8]); }
  },
  make(api) {
    const S = { W: 480, H: 800, grid: Array.from({ length: N }, () => Array(N).fill(null)), tray: [], drag: null, score: 0, shown: 0, combo: 0, fx: [], pops: [], t: 0, best: api.best() };
    const fits = (sh, cx, cy) => sh.c.every(([dx, dy]) => { const x = cx + dx, y = cy + dy; return x >= 0 && y >= 0 && x < N && y < N && !S.grid[y][x]; });
    const anyFit = (sh) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fits(sh, x, y)) return true; return false; };
    const deal = () => {
      // 너무 가혹하지 않게: 적어도 한 조각은 들어갈 수 있도록 몇 번 다시 뽑아요
      for (let tries = 0; tries < 12; tries++) {
        S.tray = [0, 1, 2].map(() => ({ sh: SHAPES[Math.floor(Math.random() * SHAPES.length)], col: COLORS[Math.floor(Math.random() * COLORS.length)] }));
        if (S.tray.some((p) => anyFit(p.sh))) break;
      }
    };
    deal();
    const slotX = (i) => 80 + i * 160;
    const target = () => { const d = S.drag; if (!d) return null; const px = d.x - (d.p.sh.w * CS) / 2, py = d.y - 90 - (d.p.sh.h * CS) / 2; const cx = Math.round((px - BX) / CS), cy = Math.round((py - BY) / CS); return fits(d.p.sh, cx, cy) ? [cx, cy] : null; };
    function place(p, cx, cy) {
      p.sh.c.forEach(([dx, dy]) => { S.grid[cy + dy][cx + dx] = p.col; });
      let gain = p.sh.c.length; api.sfx(330, 0.06, 'triangle', 0.12);
      const rows = [], cols = [];
      for (let i = 0; i < N; i++) { if (S.grid[i].every(Boolean)) rows.push(i); if (S.grid.every((r) => r[i])) cols.push(i); }
      const lines = rows.length + cols.length;
      if (lines) {
        S.combo++; const pts = lines * 10 * lines * Math.max(1, S.combo); gain += pts;
        rows.forEach((r) => { for (let x = 0; x < N; x++) S.fx.push({ x, y: r, c: S.grid[r][x], t: 0 }); });
        cols.forEach((c) => { for (let y = 0; y < N; y++) S.fx.push({ x: c, y, c: S.grid[y][c], t: 0 }); });
        rows.forEach((r) => { for (let x = 0; x < N; x++) S.grid[r][x] = null; });
        cols.forEach((c) => { for (let y = 0; y < N; y++) S.grid[y][c] = null; });
        S.pops.push({ x: BX + (cx + p.sh.w / 2) * CS, y: BY + cy * CS, txt: (S.combo > 1 ? `콤보 ${S.combo}! ` : '') + '+' + pts, t: 0 });
        [523, 659, 784, 1046].slice(0, 1 + Math.min(3, lines + S.combo - 1)).forEach((f, i) => setTimeout(() => api.sfx(f, 0.12, 'square', 0.08), i * 60));
        if (S.grid.every((r) => r.every((v) => !v))) { gain += 300; S.pops.push({ x: 240, y: BY + 200, txt: '판 비우기! +300', t: 0 }); }
      } else S.combo = 0;
      S.score += gain;
    }
    return Object.assign(S, {
      down(x, y) { S.tray.forEach((p, i) => { if (p && Math.abs(x - slotX(i)) < 78 && y > TRAY_Y - 20 && y < TRAY_Y + 150) { S.drag = { p, i, x, y }; api.sfx(500, 0.03, 'sine', 0.06); } }); },
      move(x, y) { if (S.drag) { S.drag.x = x; S.drag.y = y; } },
      up() {
        const d = S.drag; if (!d) return; const t = target(); S.drag = null;
        if (!t) { api.sfx(160, 0.08, 'sawtooth', 0.05); return; }
        place(d.p, t[0], t[1]); S.tray[d.i] = null;
        if (S.tray.every((p) => !p)) deal();
        if (!S.tray.some((p) => p && anyFit(p.sh))) setTimeout(() => api.end(S.score, '더 놓을 곳이 없어요'), 500);
      },
      update(dt) {
        S.t += dt; S.shown += (S.score - S.shown) * Math.min(1, dt * 10); if (Math.abs(S.score - S.shown) < 1) S.shown = S.score;
        S.fx.forEach((f) => f.t += dt); S.fx = S.fx.filter((f) => f.t < 0.45); S.pops.forEach((f) => f.t += dt); S.pops = S.pops.filter((f) => f.t < 1.1);
      },
      draw(g) {
        const bg = g.createLinearGradient(0, 0, 0, 800); bg.addColorStop(0, '#1d1f3a'); bg.addColorStop(1, '#121325'); g.fillStyle = bg; g.fillRect(0, 0, 480, 800);
        g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '900 52px system-ui'; g.fillText(Math.round(S.shown).toLocaleString(), 240, 112);
        g.font = '700 15px system-ui'; g.fillStyle = '#ffcc33'; g.fillText('최고 ' + Math.max(S.best, S.score).toLocaleString(), 240, 62);
        g.fillStyle = '#272a4a'; g.beginPath(); g.roundRect(BX - 8, BY - 8, N * CS + 16, N * CS + 16, 14); g.fill();
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = S.grid[y][x]; if (c) cell(g, BX + x * CS, BY + y * CS, CS, c); else { g.fillStyle = '#323660'; g.beginPath(); g.roundRect(BX + x * CS + 2, BY + y * CS + 2, CS - 4, CS - 4, 6); g.fill(); } }
        const t = target();
        if (t && S.drag) {
          // 놓을 자리 미리보기 + 지워질 줄 강조
          const tmp = S.grid.map((r) => r.slice()); S.drag.p.sh.c.forEach(([dx, dy]) => { tmp[t[1] + dy][t[0] + dx] = 1; });
          for (let i = 0; i < N; i++) { if (tmp[i].every(Boolean)) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(BX, BY + i * CS, N * CS, CS); } if (tmp.every((r) => r[i])) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(BX + i * CS, BY, CS, N * CS); } }
          S.drag.p.sh.c.forEach(([dx, dy]) => cell(g, BX + (t[0] + dx) * CS, BY + (t[1] + dy) * CS, CS, S.drag.p.col, 0.4));
        }
        S.fx.forEach((f) => { const k = f.t / 0.45, s = CS * (1 - k * 0.6); cell(g, BX + f.x * CS + (CS - s) / 2, BY + f.y * CS + (CS - s) / 2, s, f.c, 1 - k); g.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; g.fillRect(BX + f.x * CS, BY + f.y * CS, CS, CS); });
        g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.roundRect(16, TRAY_Y - 24, 448, 160, 18); g.fill();
        S.tray.forEach((p, i) => {
          if (!p || (S.drag && S.drag.i === i)) return; const s = 26; const ok = anyFit(p.sh);
          p.sh.c.forEach(([dx, dy]) => cell(g, slotX(i) - (p.sh.w * s) / 2 + dx * s, TRAY_Y + 56 - (p.sh.h * s) / 2 + dy * s, s, ok ? p.col : '#555', ok ? 1 : 0.5));
        });
        if (S.drag) { const d = S.drag; d.p.sh.c.forEach(([dx, dy]) => cell(g, d.x - (d.p.sh.w * CS) / 2 + dx * CS, d.y - 90 - (d.p.sh.h * CS) / 2 + dy * CS, CS, d.p.col, 0.92)); }
        S.pops.forEach((p) => { g.globalAlpha = 1 - p.t / 1.1; g.font = '900 30px system-ui'; g.lineWidth = 6; g.strokeStyle = '#1a1030'; g.strokeText(p.txt, p.x, p.y - p.t * 50); g.fillStyle = '#ffe14d'; g.fillText(p.txt, p.x, p.y - p.t * 50); g.globalAlpha = 1; });
      },
    });
  },
};
