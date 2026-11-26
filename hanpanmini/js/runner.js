// 도시 질주 — 택배 달리미가 지붕 위를 달려요
const W = 960, H = 540, GY = 440, PX = 190;

export default {
  id: 'runner', name: '도시 질주', icon: '🏃', desc: '끝없이 달리며 점프·슬라이드로 피하기. 동전 모으고 방패로 버티기!',
  help: '점프: 스페이스 / ↑ / 화면 탭 (공중에서 한 번 더 = 2단 점프). 슬라이드: ↓ / S / 아래로 밀기.',
  thumb(x, w, h) {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff9a5a'); gr.addColorStop(1, '#ffd29a'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c0607a'; for (let i = 0; i < 9; i++) x.fillRect(i * 38, 70 + ((i * 37) % 50), 32, 200); x.fillStyle = '#3d2a4a'; x.fillRect(0, 160, w, 40);
    x.fillStyle = '#2f6bff'; x.fillRect(90, 118, 18, 26); x.fillStyle = '#f5c99b'; x.beginPath(); x.arc(99, 110, 9, 0, 7); x.fill(); x.fillStyle = '#ffcc33'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(150 + i * 26, 105 - Math.sin(i) * 14, 7, 0, 7); x.fill(); }
    x.fillStyle = '#ff5e5e'; x.fillRect(250, 136, 22, 24);
  },
  make(api) {
    const S = { W, H, y: GY, vy: 0, jumps: 0, slide: 0, holdSlide: false, speed: 400, dist: 0, coins: 0, obs: [], items: [], next: 900, t: 0, shield: 0, inv: 0, dead: false, parts: [], sw: null, best: api.best(), pop: [] };
    const far = Array.from({ length: 24 }, (_, i) => ({ x: i * 80, w: 60 + ((i * 53) % 40), h: 120 + ((i * 97) % 140) }));
    const near = Array.from({ length: 14 }, (_, i) => ({ x: i * 150, w: 110 + ((i * 41) % 50), h: 90 + ((i * 71) % 110), win: (i * 13) % 3 }));
    const onGround = () => S.y >= GY && !S.overGap;
    function jump() { if (S.dead) return; if (S.jumps < 2) { S.vy = S.jumps === 0 ? -930 : -820; S.jumps++; S.slide = 0; api.sfx(S.jumps === 1 ? 520 : 700, 0.09, 'square', 0.08, 300); } }
    function slide() { if (S.dead) return; if (S.y < GY) { S.vy = Math.max(S.vy, 900); } S.slide = 0.65; api.sfx(180, 0.12, 'sawtooth', 0.05, -80); }
    function spawn() {
      const r = Math.random(), x = W + 60, lvl = Math.min(1, S.dist / 25000);
      if (r < 0.3) S.obs.push({ k: 'box', x, w: 38, h: 42 });
      else if (r < 0.45) { S.obs.push({ k: 'box', x, w: 38, h: 42 }); S.obs.push({ k: 'box', x: x + 38, w: 38, h: 42 }); S.obs.push({ k: 'box', x: x + 19, w: 38, h: 42, top: 42 }); }
      else if (r < 0.68) S.obs.push({ k: 'bar', x, w: 90, y0: GY - 140, y1: GY - 48 });
      else if (r < 0.85) S.obs.push({ k: 'gap', x, w: 120 + lvl * 80 });
      else S.obs.push({ k: 'drone', x, w: 46, h: 30, by: GY - 70 - Math.random() * 40, ph: Math.random() * 6 });
      // 동전 줄
      const arc = Math.random() < 0.5, n = 5 + Math.floor(Math.random() * 4), cx = x + (arc ? -40 : 260);
      for (let i = 0; i < n; i++) S.items.push({ k: 'coin', x: cx + i * 40, y: arc ? GY - 110 - Math.sin((i / (n - 1)) * Math.PI) * 90 : GY - 30 });
      if (Math.random() < 0.06 && !S.shield) S.items.push({ k: 'shield', x: x + 200, y: GY - 150 });
      S.next = S.speed * (0.95 + Math.random() * 0.9) * (1.15 - lvl * 0.25) + 160;
    }
    function hurt() {
      if (S.inv > 0) return;
      if (S.shield) { S.shield = 0; S.inv = 1.2; api.sfx(300, 0.2, 'triangle', 0.15, -150); for (let i = 0; i < 16; i++) S.parts.push({ x: PX, y: S.y - 40, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 400, t: 0.6, c: '#5ad8ff' }); return; }
      S.dead = true; S.vy = -600; api.sfx(150, 0.5, 'sawtooth', 0.15, -100);
      setTimeout(() => api.end(score(), '넘어졌어요!', `거리 ${Math.floor(S.dist / 10)}m · 동전 ${S.coins}개`), 1100);
    }
    const score = () => Math.floor(S.dist / 10) + S.coins * 10;
    return Object.assign(S, {
      key(k, d) { if (k === 'ArrowDown' || k === 'KeyS') { S.holdSlide = d; if (d) slide(); return; } if (d && (k === 'Space' || k === 'ArrowUp' || k === 'KeyW')) { jump(); return; } return false; },
      down(x, y) { S.sw = [x, y, performance.now()]; },
      up(x, y) { if (!S.sw) return; const dy = y - S.sw[1]; S.sw = null; if (dy > 40) slide(); else jump(); },
      move(x, y) { if (S.sw && y - S.sw[1] > 40) { S.sw = null; slide(); } },
      update(dt) {
        S.t += dt; S.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1200 * dt; p.t -= dt; }); S.parts = S.parts.filter((p) => p.t > 0); S.pop.forEach((p) => p.t -= dt); S.pop = S.pop.filter((p) => p.t > 0);
        if (S.dead) { S.vy += 2200 * dt; S.y += S.vy * dt; return; }
        S.speed = Math.min(980, 400 + S.dist / 60); const mv = S.speed * dt; S.dist += mv; if (S.inv > 0) S.inv -= dt;
        if (S.slide > 0) { S.slide -= dt; if (S.holdSlide && S.y >= GY) S.slide = Math.max(S.slide, 0.05); }
        for (const o of S.obs) o.x -= mv; for (const it of S.items) it.x -= mv; far.forEach((b) => { b.x -= mv * 0.15; if (b.x < -100) b.x += 24 * 80; }); near.forEach((b) => { b.x -= mv * 0.4; if (b.x < -200) b.x += 14 * 150; });
        S.obs = S.obs.filter((o) => o.x + o.w > -50); S.items = S.items.filter((it) => it.x > -40 && !it.got);
        S.next -= mv; if (S.next <= 0) spawn();
        // 구멍 위?
        S.overGap = S.obs.some((o) => o.k === 'gap' && PX - 10 > o.x && PX + 10 < o.x + o.w);
        S.vy += 2500 * dt; S.y += S.vy * dt;
        if (S.y >= GY && !S.overGap && S.y - S.vy * dt <= GY + 4) { S.y = GY; S.vy = 0; S.jumps = 0; }
        if (S.y > H + 60) { S.inv = 0; S.shield = 0; hurt(); return; }
        const ph = S.slide > 0 && S.y >= GY - 2 ? 34 : 74, top = S.y - ph, L = PX - 16, R = PX + 16;
        for (const o of S.obs) {
          if (o.k === 'box') { const oy = GY - o.h - (o.top || 0); if (R > o.x + 4 && L < o.x + o.w - 4 && S.y > oy + 4 && top < oy + o.h) { if (S.vy > 0 && S.y - S.vy * dt <= oy + 8) { S.y = oy; S.vy = 0; S.jumps = 0; } else hurt(); } }
          else if (o.k === 'bar') { if (R > o.x + 6 && L < o.x + o.w - 6 && top < o.y1 && S.y > o.y0) hurt(); }
          else if (o.k === 'drone') { const dy = o.by + Math.sin(S.t * 3 + o.ph) * 18; if (R > o.x + 4 && L < o.x + o.w - 4 && top < dy + o.h && S.y > dy) hurt(); }
        }
        // 상자 위에서 걸어 나가기
        if (S.y < GY && S.vy === 0 && !S.obs.some((o) => o.k === 'box' && R > o.x && L < o.x + o.w && Math.abs(GY - o.h - (o.top || 0) - S.y) < 2)) S.vy = 1;
        for (const it of S.items) { if (Math.abs(it.x - PX) < 30 && Math.abs(it.y - (S.y - ph / 2)) < ph / 2 + 18) { it.got = true; if (it.k === 'coin') { S.coins++; api.sfx(1180, 0.06, 'square', 0.05); } else { S.shield = 1; S.pop.push({ txt: '방패!', t: 1 }); api.sfx(660, 0.25, 'triangle', 0.12, 400); } } }
      },
      draw(g) {
        const dusk = Math.min(1, S.dist / 40000), sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, `hsl(${20 - dusk * 250}, 80%, ${66 - dusk * 46}%)`); sky.addColorStop(1, `hsl(${35 - dusk * 230}, 90%, ${80 - dusk * 50}%)`); g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(255,240,200,${0.8 - dusk * 0.4})`; g.beginPath(); g.arc(760, 140, 50, 0, 7); g.fill();
        g.fillStyle = `hsl(${330 - dusk * 90}, 35%, ${62 - dusk * 35}%)`; far.forEach((b) => g.fillRect(b.x, GY - b.h - 40, b.w, b.h + 40));
        near.forEach((b) => { g.fillStyle = `hsl(${290 - dusk * 60}, 25%, ${40 - dusk * 22}%)`; g.fillRect(b.x, GY - b.h, b.w, b.h); g.fillStyle = dusk > 0.4 ? '#ffe28a' : 'rgba(255,255,255,.25)'; for (let yy = GY - b.h + 14; yy < GY - 20; yy += 26) for (let xx = b.x + 12; xx < b.x + b.w - 14; xx += 24) if ((xx + yy + b.win) % 3) g.fillRect(xx, yy, 10, 12); });
        // 지붕(땅)
        g.fillStyle = '#3a2a48'; g.fillRect(0, GY, W, H - GY); g.fillStyle = '#5a4470'; g.fillRect(0, GY, W, 8);
        g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = -((S.dist * 1) % 60); x < W; x += 60) g.fillRect(x, GY + 20, 30, 4);
        for (const o of S.obs) {
          if (o.k === 'gap') { g.fillStyle = sky; g.fillRect(o.x, GY, o.w, H - GY); g.fillStyle = '#5a4470'; g.fillRect(o.x - 6, GY, 6, H); g.fillRect(o.x + o.w, GY, 6, H); }
          else if (o.k === 'box') { const y = GY - o.h - (o.top || 0); g.fillStyle = '#c98a4b'; g.fillRect(o.x, y, o.w, o.h); g.strokeStyle = '#8a5a2b'; g.lineWidth = 3; g.strokeRect(o.x + 1.5, y + 1.5, o.w - 3, o.h - 3); g.beginPath(); g.moveTo(o.x, y); g.lineTo(o.x + o.w, y + o.h); g.stroke(); }
          else if (o.k === 'bar') { g.fillStyle = '#666'; g.fillRect(o.x + 4, o.y0 - 60, 8, o.y1 - o.y0 + 60); g.fillRect(o.x + o.w - 12, o.y0 - 60, 8, o.y1 - o.y0 + 60); for (let i = 0; i < o.w; i += 20) { g.fillStyle = (i / 20) % 2 ? '#ffcc33' : '#222'; g.fillRect(o.x + i, o.y0, 20, o.y1 - o.y0); } }
          else { const y = o.by + Math.sin(S.t * 3 + o.ph) * 18; g.fillStyle = '#2b2b3a'; g.fillRect(o.x + 6, y + 8, o.w - 12, o.h - 12); g.fillStyle = '#ff4a4a'; g.beginPath(); g.arc(o.x + o.w / 2, y + 16, 5, 0, 7); g.fill(); g.fillStyle = 'rgba(200,220,255,.7)'; const sp = Math.sin(S.t * 60) * 12; g.fillRect(o.x - 4 + sp * 0.2, y, 22, 3); g.fillRect(o.x + o.w - 18 - sp * 0.2, y, 22, 3); }
        }
        for (const it of S.items) { if (it.k === 'coin') { const s = Math.abs(Math.cos(S.t * 4 + it.x * 0.02)); g.fillStyle = '#ffcc33'; g.beginPath(); g.ellipse(it.x, it.y, 11 * s + 2, 11, 0, 0, 7); g.fill(); g.fillStyle = '#e69a00'; g.beginPath(); g.ellipse(it.x, it.y, (11 * s + 2) * 0.55, 6, 0, 0, 7); g.fill(); } else { g.fillStyle = '#5ad8ff'; g.beginPath(); g.moveTo(it.x, it.y - 16); g.lineTo(it.x + 14, it.y - 8); g.lineTo(it.x + 10, it.y + 10); g.lineTo(it.x, it.y + 16); g.lineTo(it.x - 10, it.y + 10); g.lineTo(it.x - 14, it.y - 8); g.fill(); } }
        // 달리미
        if (!(S.inv > 0 && Math.floor(S.t * 20) % 2)) {
          g.save(); g.translate(PX, S.y); const sl = S.slide > 0 && S.y >= GY - 2, run = S.t * S.speed * 0.03;
          if (sl) { g.rotate(-1.2); }
          if (S.dead) g.rotate(S.t * 8);
          const leg = (a, c) => { g.strokeStyle = c; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -30); g.lineTo(Math.sin(a) * 16, -14); g.lineTo(Math.sin(a) * 14 - 4, 0); g.stroke(); };
          const air = S.y < GY - 2; leg(air ? 0.9 : Math.sin(run) * 1.1, '#2a3550'); leg(air ? -0.5 : -Math.sin(run) * 1.1, '#34446a');
          g.fillStyle = '#ff8a3a'; g.fillRect(-18, -62, 12, 26); // 가방
          g.fillStyle = '#2f6bff'; g.beginPath(); g.roundRect(-11, -64, 22, 36, 6); g.fill();
          g.strokeStyle = '#f5c99b'; g.lineWidth = 7; g.beginPath(); g.moveTo(2, -56); g.lineTo(2 + Math.cos(run) * 14, -42); g.stroke();
          g.fillStyle = '#f5c99b'; g.beginPath(); g.arc(2, -74, 11, 0, 7); g.fill(); g.fillStyle = '#ffcc33'; g.fillRect(-10, -86, 22, 7); g.fillRect(6, -82, 12, 4); g.fillStyle = '#222'; g.fillRect(7, -76, 3, 3);
          if (S.shield) { g.strokeStyle = 'rgba(90,216,255,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(0, -40, 50, 0, 7); g.stroke(); }
          g.restore();
        }
        S.parts.forEach((p) => { g.fillStyle = p.c; g.globalAlpha = p.t / 0.6; g.fillRect(p.x, p.y, 5, 5); g.globalAlpha = 1; });
        g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '900 34px system-ui'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.35)'; const sc = score().toLocaleString(); g.strokeText(sc, W - 24, 50); g.fillText(sc, W - 24, 50);
        g.font = '700 17px system-ui'; g.fillText(`${Math.floor(S.dist / 10)}m · 🪙 ${S.coins} · 최고 ${Math.max(S.best, score()).toLocaleString()}`, W - 24, 78);
        S.pop.forEach((p) => { g.globalAlpha = p.t; g.textAlign = 'center'; g.font = '900 30px system-ui'; g.fillStyle = '#5ad8ff'; g.fillText(p.txt, PX, S.y - 120); g.globalAlpha = 1; });
        if (S.dist < 1200) { g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.roundRect(W / 2 - 250, 120, 500, 44, 12); g.fill(); g.fillStyle = '#fff'; g.font = '700 17px system-ui'; g.fillText('탭/스페이스 = 점프 (2단 가능) · 아래로 밀기/↓ = 슬라이드', W / 2, 148); }
      },
    });
  },
};
