// ===================== 소리 (전부 즉석 합성) =====================
let ctx = null, master = null, noiseBuf = null;
export const SND = { vol: 0.7 };
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = SND.vol; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setVol(v) { SND.vol = v; if (master) master.gain.value = v; }
// 위치 소리: pan(-1~1) · gain(0~1)
function out(gain, pan) {
  const g = ctx.createGain(); g.gain.value = gain;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); p.connect(master); }
  else g.connect(master);
  return g;
}
function noise(dur, f0, f1, q, gain, pan, type = 'bandpass') {
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); f.Q.value = q;
  const e = ctx.createGain(); e.gain.setValueAtTime(1, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(e); e.connect(out(gain, pan)); s.start(t); s.stop(t + dur + 0.02);
}
function tone(freq, dur, type, gain, pan, f1) {
  const t = ctx.currentTime, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const e = ctx.createGain(); e.gain.setValueAtTime(gain, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(e); e.connect(out(1, pan)); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  shot(id, gain = 1, pan = 0) {
    if (!ctx) return;
    const big = id === 'owl' || id === 'burst', smg = id === 'wasp', pis = id === 'sting' || id === 'viper';
    noise(big ? 0.45 : pis ? 0.16 : 0.22, big ? 2200 : 3200, 120, 0.7, 0.9 * gain, pan, 'lowpass');
    tone(big ? 70 : smg ? 140 : 100, big ? 0.3 : 0.12, 'sine', 0.6 * gain, pan, 40);
    noise(0.05, 6000, 2000, 1.5, 0.35 * gain, pan);
  },
  far(id, gain, pan) { if (!ctx) return; noise(0.35, 900, 120, 0.6, 0.6 * gain, pan, 'lowpass'); },
  hit() { if (!ctx) return; tone(1400, 0.06, 'square', 0.15, 0); },
  head() { if (!ctx) return; tone(2200, 0.09, 'triangle', 0.3, 0); tone(3300, 0.12, 'sine', 0.15, 0); },
  hurt() { if (!ctx) return; noise(0.18, 600, 200, 1, 0.6, 0, 'lowpass'); },
  kill() { if (!ctx) return; tone(880, 0.08, 'triangle', 0.25, 0); setTimeout(() => tone(1320, 0.14, 'triangle', 0.25, 0), 70); },
  step(gain, pan) { if (!ctx) return; noise(0.07, 900, 300, 2, 0.45 * gain, pan); },
  land() { if (!ctx) return; noise(0.12, 500, 120, 1, 0.5, 0, 'lowpass'); },
  reload() { if (!ctx) return; noise(0.05, 3000, 1500, 3, 0.3, 0); setTimeout(() => noise(0.06, 2500, 900, 3, 0.35, 0), 380); },
  empty() { if (!ctx) return; tone(2600, 0.03, 'square', 0.08, 0); },
  beep(hi) { if (!ctx) return; tone(hi ? 1800 : 1200, 0.08, 'square', 0.12, 0); },
  plant() { if (!ctx) return; tone(600, 0.25, 'sawtooth', 0.12, 0, 900); },
  boom() { if (!ctx) return; noise(1.4, 600, 40, 0.5, 1.3, 0, 'lowpass'); tone(50, 1.0, 'sine', 0.8, 0, 25); },
  ability(kind) { if (!ctx) return; if (kind === 'flash') { noise(0.3, 5000, 800, 0.6, 0.6, 0); } else if (kind === 'smoke') noise(0.8, 700, 200, 0.5, 0.4, 0, 'lowpass'); else tone(kind === 'heal' ? 660 : 440, 0.25, 'sine', 0.2, 0, kind === 'heal' ? 990 : 880); },
  buy() { if (!ctx) return; tone(990, 0.06, 'triangle', 0.2, 0); setTimeout(() => tone(1480, 0.08, 'triangle', 0.2, 0), 60); },
  round(win) { if (!ctx) return; const ns = win ? [523, 659, 784, 1046] : [392, 330, 262]; ns.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.25, 0), i * 120)); },
  tick() { if (!ctx) return; tone(1000, 0.03, 'sine', 0.08, 0); },
};
