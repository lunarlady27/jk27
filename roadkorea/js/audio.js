// WebAudio로 엔진음·경적·문소리 등을 합성 (외부 파일 없음)
export class GameAudio {
  constructor() { this.ctx = null; this.vol = 0.7; this.voice = true; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // 엔진
    this.eGain = c.createGain(); this.eGain.gain.value = 0;
    this.eFilt = c.createBiquadFilter(); this.eFilt.type = 'lowpass'; this.eFilt.frequency.value = 600;
    this.eFilt.connect(this.eGain); this.eGain.connect(this.master);
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'sawtooth';
    this.o3 = c.createOscillator(); this.o3.type = 'square';
    const g3 = c.createGain(); g3.gain.value = 0.5;
    this.o1.connect(this.eFilt); this.o2.connect(this.eFilt); this.o3.connect(g3); g3.connect(this.eFilt);
    [this.o1, this.o2, this.o3].forEach((o) => o.start());
    this.rumble = this.loopNoise(140, 'bandpass', 1.2);
    // 전기 모터
    this.evGain = c.createGain(); this.evGain.gain.value = 0; this.evGain.connect(this.master);
    this.ev1 = c.createOscillator(); this.ev1.type = 'sine';
    this.ev2 = c.createOscillator(); this.ev2.type = 'triangle';
    const e2g = c.createGain(); e2g.gain.value = 0.25;
    this.ev1.connect(this.evGain); this.ev2.connect(e2g); e2g.connect(this.evGain);
    this.ev1.start(); this.ev2.start();
    // 타이어 / 비 / 바람
    this.squeal = this.loopNoise(2300, 'bandpass', 9);
    this.rainN = this.loopNoise(1400, 'bandpass', 0.6);
    this.wind = this.loopNoise(400, 'lowpass', 0.7);
    // 경적
    this.hornG = c.createGain(); this.hornG.gain.value = 0;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2200;
    hf.connect(this.hornG); this.hornG.connect(this.master);
    this.h1 = c.createOscillator(); this.h1.type = 'square';
    this.h2 = c.createOscillator(); this.h2.type = 'square';
    this.h1.connect(hf); this.h2.connect(hf); this.h1.start(); this.h2.start();
  }
  loopNoise(freq, type, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { g, f };
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  set(param, v, tc = 0.05) { if (this.ctx) param.setTargetAtTime(v, this.ctx.currentTime, tc); }

  engine(st) {
    if (!this.ctx) return;
    const { rpm, throttle, speed, isBus, ev, on, slip, rain } = st;
    const prem = st.premium ? 1.35 : 1;
    if (!on) { this.set(this.eGain.gain, 0); this.set(this.evGain.gain, 0); this.set(this.rumble.g.gain, 0); this.set(this.squeal.g.gain, 0); this.set(this.wind.g.gain, 0); return; }
    if (ev) {
      this.set(this.eGain.gain, 0); this.set(this.rumble.g.gain, 0);
      const f = (isBus ? 90 : 160) + speed * (isBus ? 16 : 26);
      this.set(this.ev1.frequency, f); this.set(this.ev2.frequency, f * 2.31);
      this.set(this.evGain.gain, (0.012 + throttle * 0.05 + Math.min(speed, 30) * 0.0012) * prem);
    } else {
      this.set(this.evGain.gain, 0);
      const f0 = isBus ? rpm / 20 : rpm / 30;
      this.set(this.o1.frequency, f0); this.set(this.o2.frequency, f0 * 2.01); this.set(this.o3.frequency, f0 * 0.5);
      this.set(this.eFilt.frequency, (isBus ? 180 : 300) + throttle * (isBus ? 700 : 1600) + rpm * 0.12);
      this.set(this.eGain.gain, ((isBus ? 0.1 : 0.06) + throttle * (isBus ? 0.1 : 0.1)) * prem);
      this.set(this.rumble.g.gain, (isBus ? 0.08 + throttle * 0.18 : 0.02 + throttle * 0.04) * (prem > 1 ? 1.8 : 1));
    }
    this.set(this.squeal.g.gain, Math.min(0.25, Math.max(0, slip - 2.2) * 0.06));
    this.set(this.wind.g.gain, Math.min(0.12, speed * 0.003));
    this.set(this.rainN.g.gain, rain * 0.1, 0.5);
  }
  horn(on, isBus) {
    if (!this.ctx) return;
    this.h1.frequency.value = isBus ? 330 : 415; this.h2.frequency.value = isBus ? 392 : 523;
    this.set(this.hornG.gain, on ? (isBus ? 0.18 : 0.12) : 0, 0.01);
  }
  burst(dur, freq, type, gain, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(); src.stop(c.currentTime + dur + 0.05);
  }
  tone(freq, dur, type = 'sine', gain = 0.15, when = 0) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t0 = c.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  tick(on) { this.burst(0.03, on ? 2600 : 1800, 'highpass', 0.25); }
  door() { this.burst(1.0, 2600, 'bandpass', 0.35, 0.8); for (let i = 0; i < 3; i++) this.tone(1050, 0.12, 'square', 0.05, 0.1 + i * 0.25); }
  chime() { this.tone(988, 0.5, 'sine', 0.2); this.tone(784, 0.8, 'sine', 0.2, 0.35); }
  bell() { this.tone(1320, 0.25, 'triangle', 0.15); this.tone(1320, 0.25, 'triangle', 0.15, 0.3); }
  beep() { this.tone(1650, 0.09, 'square', 0.06); }
  coin() { this.tone(1200, 0.08, 'square', 0.06); this.tone(1800, 0.15, 'square', 0.06, 0.08); }
  crash(v) { this.burst(0.5, 500, 'lowpass', Math.min(0.9, 0.2 + v * 0.06)); this.burst(0.25, 3000, 'bandpass', Math.min(0.4, v * 0.03)); }
  thunder() { this.burst(2.5, 120, 'lowpass', 0.8); }
  trainHorn(v = 1) { this.tone(311, 1.1, 'sawtooth', 0.12 * v); this.tone(392, 1.1, 'sawtooth', 0.09 * v); this.tone(311, 0.7, 'sawtooth', 0.1 * v, 1.3); }
  crossingBell(v = 1) { this.tone(1180, 0.18, 'triangle', 0.12 * v); }
  trainRumble(level) {
    if (!this.ctx) return;
    if (!this.trainN) this.trainN = this.loopNoise(90, 'lowpass', 0.8);
    this.set(this.trainN.g.gain, Math.min(0.5, level * 0.5), 0.2);
  }
  bump() { this.burst(0.15, 200, 'lowpass', 0.4); }
  speak(text, queue = false) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    try {
      if (!queue) speechSynthesis.cancel();
      else if (speechSynthesis.pending) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR'; u.rate = 1.0; u.volume = this.vol;
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ko'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* 음성 미지원 */ }
  }
}
