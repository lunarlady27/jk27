// 비트 탭 — 떨어지는 음표를 박자에 맞춰 탭 (음악은 브라우저에서 바로 만들어요)
const LANES = 4, LX = 40, LW = 100, HIT_Y = 680;
const KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
const LCOL = ['#ff5e8a', '#ffb02e', '#3ee0b0', '#5a9bff'];
const SONGS = [
  { name: '네온 펄스', bpm: 118, seed: 7, key: 57, minor: true, prog: [0, 5, 3, 4], col: '#ff3dbb', mood: '신스 · 밤거리' },
  { name: '봄비 산책', bpm: 96, seed: 21, key: 60, minor: false, prog: [0, 3, 4, 0], col: '#3ee0b0', mood: '느긋 · 연습용' },
  { name: '하이퍼 러시', bpm: 148, seed: 99, key: 62, minor: true, prog: [0, 6, 5, 4], col: '#ffb02e', mood: '빠름 · 도전' },
];
const DIFF = [['쉬움', 420], ['보통', 520], ['어려움', 640]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function compose(song, diff) {
  const R = rng(song.seed * 31 + diff), beat = 60 / song.bpm, e8 = beat / 2, BARS = 34, scale = song.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const ev = [], notes = []; let deg = 4; const motif = [];
  for (let i = 0; i < 8; i++) motif.push(R() < 0.7 ? Math.floor(R() * 5) - 2 : null);
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * beat, root = song.prog[bar % 4], ch = [0, 2, 4].map((k) => scale[(root + k) % 7] + 12 * Math.floor((root + k) / 7));
    const sect = bar < 2 ? 0 : bar >= BARS - 2 ? 3 : bar < 10 ? 1 : 2; // 0 도입 1 A 2 B(꽉 참) 3 마무리
    for (let b = 0; b < 4; b++) {
      ev.push({ t: t0 + b * beat, k: 'kick' }); if (sect > 0) ev.push({ t: t0 + b * beat + e8, k: 'hat' }); if (b % 2 === 1 && sect > 0) ev.push({ t: t0 + b * beat, k: 'snare' });
      if (sect > 0 && sect < 3) ev.push({ t: t0 + b * beat, k: 'bass', m: song.key - 24 + ch[0] + (b === 3 ? 7 : 0), d: beat * 0.9 });
    }
    if (sect < 3) ev.push({ t: t0, k: 'pad', ms: ch.map((x) => song.key - 12 + x), d: beat * 4 });
    if (sect === 0 || sect === 3) continue;
    for (let s = 0; s < 8; s++) {
      const m = motif[(s + (bar % 2) * 3) % 8]; const dense = sect === 2 ? 0.85 : 0.6;
      if (m === null || R() > dense) continue; if (diff === 0 && s % 2) continue;
      deg = Math.max(0, Math.min(10, deg + m + (R() < 0.3 ? (R() < 0.5 ? 1 : -1) : 0)));
      if (s % 2 === 0 && R() < 0.5) { const tgt = ch[Math.floor(R() * 3)]; deg = scale.indexOf(tgt % 12) >= 0 ? scale.indexOf(tgt % 12) + 7 * Math.floor(deg / 7) : deg; }
      const midi = song.key + scale[deg % 7] + 12 * Math.floor(deg / 7), t = t0 + s * e8;
      ev.push({ t, k: 'lead', m: midi, d: e8 * 0.9 });
      notes.push({ t, lane: deg % LANES, hit: 0 });
      if (diff === 2 && s % 4 === 0 && sect === 2 && R() < 0.45) notes.push({ t, lane: (deg + 2) % LANES, hit: 0 });
    }
  }
  // 같은 시각·같은 칸 겹침 제거
  const seen = new Set(); const uniq = notes.filter((n) => { const k = n.t.toFixed(3) + n.lane; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ev: ev.sort((a, b) => a.t - b.t), notes: uniq, len: BARS * 4 * beat };
}

export default {
  id: 'rhythm', name: '비트 탭', icon: '🎵', desc: '떨어지는 음표를 박자에 맞춰 탭! 곡 3개 · 난이도 3단계.',
  help: 'D F J K (또는 ← ↓ ↑ →) 키, 또는 해당 칸을 탭해요. 판정선에 닿는 순간 누를수록 점수가 높아요.',
  thumb(x, w, h) {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0f3d'); gr.addColorStop(1, '#0d0820'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(80 + i * 42, 0, 40, h); for (let j = 0; j < 3; j++) { if ((i + j) % 2) continue; x.fillStyle = LCOL[i]; x.beginPath(); x.roundRect(83 + i * 42, 20 + j * 55 + i * 12, 34, 14, 6); x.fill(); } }
    x.fillStyle = '#fff'; x.fillRect(80, 160, 166, 3);
  },
  make(api) {
    const S = { W: 480, H: 800, mode: 'select', diff: 1, score: 0, combo: 0, maxc: 0, judge: null, hits: [0, 0, 0, 0], fx: [], press: [0, 0, 0, 0], pausedAt: 0 };
    let A = null, master = null, noise = null, song = null, chart = null, t0 = 0, si = 0;
    function audio() {
      A = api.ac(); if (!A) return false; master = A.createGain(); master.gain.value = 0.55; master.connect(A.destination);
      noise = A.createBuffer(1, A.sampleRate * 0.3, A.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return true;
    }
    function play(e, t) {
      const env = (g, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
      if (e.k === 'kick') { const o = A.createOscillator(), g = A.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, 0.002, 0.25, 0.9); o.connect(g).connect(master); o.start(t); o.stop(t + 0.3); }
      else if (e.k === 'hat' || e.k === 'snare') { const s = A.createBufferSource(); s.buffer = noise; const f = A.createBiquadFilter(); f.type = e.k === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = e.k === 'hat' ? 7000 : 1800; const g = A.createGain(); env(g, 0.001, e.k === 'hat' ? 0.05 : 0.16, e.k === 'hat' ? 0.25 : 0.5); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.25); }
      else if (e.k === 'bass') { const o = A.createOscillator(), g = A.createGain(); o.type = 'triangle'; o.frequency.value = mtof(e.m); env(g, 0.01, e.d, 0.45); o.connect(g).connect(master); o.start(t); o.stop(t + e.d + 0.05); }
      else if (e.k === 'pad') { const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; const g = A.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + e.d); f.connect(g).connect(master); e.ms.forEach((m) => { const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = Math.random() * 10 - 5; o.connect(f); o.start(t); o.stop(t + e.d + 0.05); }); }
      else if (e.k === 'lead') { const o = A.createOscillator(), g = A.createGain(), f = A.createBiquadFilter(); o.type = 'square'; f.type = 'lowpass'; f.frequency.value = 3000; o.frequency.value = mtof(e.m); env(g, 0.005, e.d, 0.12); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + e.d + 0.05); }
    }
    const now = () => (A ? A.currentTime - t0 : 0);
    function start(i) {
      if (!A && !audio()) return; song = SONGS[i]; chart = compose(song, S.diff); si = 0; t0 = A.currentTime + 1.2; Object.assign(S, { mode: 'play', score: 0, combo: 0, maxc: 0, hits: [0, 0, 0, 0], judge: null, fx: [] });
      S.speed = DIFF[S.diff][1];
    }
    function hit(l) {
      if (S.mode !== 'play') return; S.press[l] = 0.12; const t = now(); let best = null, bd = 9;
      for (const n of chart.notes) { if (n.hit || n.lane !== l) continue; const d = Math.abs(n.t - t); if (d < bd) { bd = d; best = n; } if (n.t > t + 0.3) break; }
      if (!best || bd > 0.14) return;
      const j = bd < 0.045 ? 0 : bd < 0.085 ? 1 : 2; best.hit = 1; S.hits[j]++; S.combo++; S.maxc = Math.max(S.maxc, S.combo);
      S.score += [300, 200, 100][j] * (1 + Math.min(1, S.combo / 60)) | 0; S.judge = { j, t: 0.5, early: best.t > t }; S.fx.push({ l, t: 0, j });
    }
    return Object.assign(S, {
      pause(p) { if (!A) return; if (p) A.suspend(); else A.resume(); },
      destroy() { if (master) { master.disconnect(); master = null; } },
      key(k, d) { if (d && S.mode === 'select') { if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') start(+k.slice(5) - 1); return false; } if (d && k in KEYS) { hit(KEYS[k]); return; } return false; },
      down(x, y) {
        if (S.mode === 'select') {
          DIFF.forEach((_, i) => { if (y > 200 && y < 250 && x > 40 + i * 136 && x < 40 + i * 136 + 128) { S.diff = i; api.sfx(500 + i * 100, 0.05, 'sine', 0.08); } });
          SONGS.forEach((_, i) => { if (y > 290 + i * 140 && y < 290 + i * 140 + 120 && x > 40 && x < 440) start(i); });
          return;
        }
        const l = Math.floor((x - LX) / LW); if (l >= 0 && l < LANES) hit(l);
      },
      update(dt) {
        S.press = S.press.map((p) => Math.max(0, p - dt)); S.fx.forEach((f) => f.t += dt); S.fx = S.fx.filter((f) => f.t < 0.35); if (S.judge) { S.judge.t -= dt; if (S.judge.t <= 0) S.judge = null; }
        if (S.mode !== 'play' || !master) return; const t = now();
        while (si < chart.ev.length && chart.ev[si].t < t + 0.25) { const e = chart.ev[si++]; play(e, t0 + e.t); }
        for (const n of chart.notes) { if (n.t > t) break; if (!n.hit && t - n.t > 0.15) { n.hit = -1; S.hits[3]++; S.combo = 0; S.judge = { j: 3, t: 0.5 }; } }
        if (t > chart.len + 0.8) {
          const tot = chart.notes.length, acc = tot ? (S.hits[0] + S.hits[1] * 0.7 + S.hits[2] * 0.4) / tot : 0, rank = acc > 0.95 ? 'S' : acc > 0.85 ? 'A' : acc > 0.7 ? 'B' : acc > 0.5 ? 'C' : 'D';
          S.mode = 'done'; api.end(S.score, `${song.name} · ${rank}등급`, `정확도 ${(acc * 100).toFixed(1)}% · 최대 콤보 ${S.maxc} · 퍼펙트 ${S.hits[0]} / 그레이트 ${S.hits[1]} / 굿 ${S.hits[2]} / 미스 ${S.hits[3]}`);
        }
      },
      draw(g) {
        const bg = g.createLinearGradient(0, 0, 0, 800); bg.addColorStop(0, '#22093a'); bg.addColorStop(1, '#070514'); g.fillStyle = bg; g.fillRect(0, 0, 480, 800); g.textAlign = 'center';
        if (S.mode === 'select') {
          g.fillStyle = '#fff'; g.font = '900 44px system-ui'; g.fillText('비트 탭', 240, 120); g.font = '600 15px system-ui'; g.fillStyle = '#c9b8ff'; g.fillText('난이도를 고르고 곡을 눌러 시작', 240, 160);
          DIFF.forEach(([n], i) => { g.fillStyle = S.diff === i ? '#ffcc33' : 'rgba(255,255,255,.1)'; g.beginPath(); g.roundRect(40 + i * 136, 200, 128, 50, 12); g.fill(); g.fillStyle = S.diff === i ? '#2a1600' : '#fff'; g.font = '800 18px system-ui'; g.fillText(n, 104 + i * 136, 232); });
          SONGS.forEach((s, i) => { const y = 290 + i * 140; const gr = g.createLinearGradient(40, 0, 440, 0); gr.addColorStop(0, s.col); gr.addColorStop(1, 'rgba(255,255,255,.05)'); g.fillStyle = gr; g.beginPath(); g.roundRect(40, y, 400, 120, 18); g.fill(); g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '900 30px system-ui'; g.fillText(`${i + 1}. ${s.name}`, 64, y + 54); g.font = '600 15px system-ui'; g.fillText(`${s.mood} · ${s.bpm} BPM · 약 ${Math.round((34 * 4 * 60) / s.bpm)}초`, 64, y + 86); g.textAlign = 'center'; });
          g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 13px system-ui'; g.fillText('PC: D F J K 키 · 모바일: 칸을 탭', 240, 740); return;
        }
        const t = now(), sp = S.speed;
        for (let l = 0; l < LANES; l++) { g.fillStyle = l % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)'; g.fillRect(LX + l * LW, 0, LW, 800); if (S.press[l] > 0) { const gr = g.createLinearGradient(0, HIT_Y, 0, HIT_Y - 300); gr.addColorStop(0, LCOL[l] + '88'); gr.addColorStop(1, LCOL[l] + '00'); g.fillStyle = gr; g.fillRect(LX + l * LW, HIT_Y - 300, LW, 300); } }
        // 박자선
        const beat = 60 / song.bpm; for (let b = Math.floor(t / beat); b < t / beat + 800 / sp / beat; b++) { const y = HIT_Y - (b * beat - t) * sp; if (y > HIT_Y) continue; g.fillStyle = b % 4 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.16)'; g.fillRect(LX, y, LW * LANES, 2); }
        g.fillStyle = '#fff'; g.fillRect(LX, HIT_Y - 2, LW * LANES, 4);
        for (const n of chart.notes) {
          const y = HIT_Y - (n.t - t) * sp; if (y < -30) break; if (n.hit === 1 || y > 830) continue;
          const x = LX + n.lane * LW; g.globalAlpha = n.hit === -1 ? 0.3 : 1; g.fillStyle = LCOL[n.lane]; g.beginPath(); g.roundRect(x + 8, y - 13, LW - 16, 26, 10); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.roundRect(x + 14, y - 9, LW - 28, 7, 4); g.fill(); g.globalAlpha = 1;
        }
        for (let l = 0; l < LANES; l++) { g.fillStyle = S.press[l] > 0 ? LCOL[l] : 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(LX + l * LW + 8, HIT_Y + 20, LW - 16, 60, 14); g.fill(); g.fillStyle = '#fff'; g.font = '800 18px system-ui'; g.fillText('DFJK'[l], LX + l * LW + LW / 2, HIT_Y + 57); }
        S.fx.forEach((f) => { const k = f.t / 0.35; g.strokeStyle = LCOL[f.l]; g.globalAlpha = 1 - k; g.lineWidth = 4; g.beginPath(); g.arc(LX + f.l * LW + LW / 2, HIT_Y, 20 + k * 50, 0, 7); g.stroke(); g.globalAlpha = 1; });
        g.fillStyle = '#fff'; g.font = '900 34px system-ui'; g.fillText(S.score.toLocaleString(), 240, 70);
        if (S.combo > 2) { g.font = '900 64px system-ui'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(S.combo, 240, 330); g.font = '700 16px system-ui'; g.fillText('콤보', 240, 356); }
        if (S.judge) { const J = [['퍼펙트!', '#ffe14d'], ['그레이트', '#3ee0b0'], ['굿', '#5a9bff'], ['미스', '#ff5e5e']][S.judge.j]; g.globalAlpha = Math.min(1, S.judge.t * 3); g.fillStyle = J[1]; g.font = '900 38px system-ui'; g.fillText(J[0], 240, 470); g.globalAlpha = 1; }
        if (t < 0) { g.fillStyle = '#fff'; g.font = '900 30px system-ui'; g.fillText(song.name, 240, 420); }
        const pr = Math.max(0, Math.min(1, t / chart.len)); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(40, 92, 400, 5); g.fillStyle = song.col; g.fillRect(40, 92, 400 * pr, 5);
      },
    });
  },
};
