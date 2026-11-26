import blocks from './blocks.js';
import merge from './merge.js';
import rhythm from './rhythm.js';
import runner from './runner.js';
import td from './td.js';

const GAMES = [blocks, merge, rhythm, runner, td];
const $ = (s) => document.querySelector(s);
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('hm_' + k)); localStorage.setItem('hm_' + k, JSON.stringify(v)); } catch (e) { return null; } };

// 효과음 (공용)
let AC = null;
export function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
export function sfx(freq = 440, dur = 0.08, type = 'square', vol = 0.12, slide = 0) {
  const a = ac(); if (!a) return; const t = a.currentTime; const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

let cur = null, curDef = null, paused = false, last = 0, raf = 0;
const cv = $('#cv'), g = cv.getContext('2d');
let view = { s: 1, ox: 0, oy: 0 };

function fit() {
  if (!cur) return; const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight; const s = Math.min(W / cur.W, H / cur.H);
  const cw = cur.W * s, ch = cur.H * s; cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.style.left = (W - cw) / 2 + 'px'; cv.style.top = (H - ch) / 2 + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); view = { s: s * dpr, css: s, ox: (W - cw) / 2, oy: (H - ch) / 2 };
}
addEventListener('resize', fit);
const toL = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / view.css, (e.clientY - r.top) / view.css]; };

cv.addEventListener('pointerdown', (e) => { ac(); if (!cur || paused || cur.done) return; cv.setPointerCapture(e.pointerId); const [x, y] = toL(e); cur.down && cur.down(x, y, e.pointerId); e.preventDefault(); });
cv.addEventListener('pointermove', (e) => { if (!cur || paused) return; const [x, y] = toL(e); cur.move && cur.move(x, y, e.pointerId); });
cv.addEventListener('pointerup', (e) => { if (!cur || paused) return; const [x, y] = toL(e); cur.up && cur.up(x, y, e.pointerId); });
cv.addEventListener('pointercancel', (e) => { if (!cur) return; const [x, y] = toL(e); cur.up && cur.up(x, y, e.pointerId); });
addEventListener('keydown', (e) => { if (!cur) return; if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; } if (paused || cur.done) { if (cur.done && (e.code === 'Enter' || e.code === 'Space')) play(curDef); return; } if (cur.key && cur.key(e.code, true) !== false && e.code.match(/Arrow|Space/)) e.preventDefault(); });
addEventListener('keyup', (e) => { if (cur && cur.key && !paused) cur.key(e.code, false); });

function loop(t) {
  raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; if (!cur) return;
  if (!paused && !cur.done) cur.update(dt);
  g.setTransform(view.s, 0, 0, view.s, 0, 0); cur.draw(g);
}
function api(def) {
  return {
    sfx, ac, rr,
    best: () => LS('best_' + def.id) || 0,
    end(score, title = '게임 끝', note = '') {
      if (cur.done) return; cur.done = true; const best = LS('best_' + def.id) || 0; const nb = score > best; if (nb) LS('best_' + def.id, score);
      sfx(nb ? 880 : 220, 0.4, 'triangle', 0.15, nb ? 400 : -100);
      $('#over').innerHTML = `<div class="box"><h2>${title}</h2><div class="sc">${score.toLocaleString()}</div><div>${nb ? '🏆 새 최고 기록!' : '최고 기록 ' + Math.max(best, score).toLocaleString()}</div>${note ? `<div class="help">${note}</div>` : ''}<div class="row"><button class="primary" id="again">다시 하기</button><button id="tohub">목록</button></div></div>`;
      $('#over').classList.remove('hidden'); $('#again').onclick = () => play(def); $('#tohub').onclick = hub;
    },
  };
}
function play(def) {
  if (cur && cur.destroy) cur.destroy(); curDef = def; paused = false; $('#over').classList.add('hidden');
  cur = def.make(api(def)); cur.done = false; $('#gtitle').textContent = def.name; $('#hub').classList.add('hidden'); $('#game').classList.remove('hidden'); fit(); ac();
}
function togglePause() {
  if (!cur || cur.done) return; paused = !paused; if (cur.pause) cur.pause(paused);
  if (paused) { $('#over').innerHTML = `<div class="box"><h2>일시정지</h2><div class="help">${curDef.help}</div><div class="row"><button class="primary" id="res">계속</button><button id="rst">처음부터</button><button id="tohub">목록</button></div></div>`; $('#over').classList.remove('hidden'); $('#res').onclick = togglePause; $('#rst').onclick = () => play(curDef); $('#tohub').onclick = hub; }
  else $('#over').classList.add('hidden');
}
function hub() {
  if (cur && cur.destroy) cur.destroy(); cur = null; paused = false; $('#game').classList.add('hidden'); $('#over').classList.add('hidden'); $('#hub').classList.remove('hidden');
  $('#cards').innerHTML = GAMES.map((d, i) => `<button class="card" data-i="${i}"><canvas width="320" height="200" data-ic="${i}"></canvas><span class="best">최고 ${(LS('best_' + d.id) || 0).toLocaleString()}</span><div class="t"><b>${d.icon} ${d.name}</b><small>${d.desc}</small></div></button>`).join('');
  document.querySelectorAll('[data-ic]').forEach((c) => { const d = GAMES[c.dataset.ic]; const x = c.getContext('2d'); d.thumb(x, 320, 200); });
  document.querySelectorAll('.card').forEach((b) => b.onclick = () => play(GAMES[b.dataset.i]));
}
$('#back').onclick = hub; $('#pz').onclick = togglePause;
document.addEventListener('visibilitychange', () => { if (document.hidden && cur && !paused && !cur.done) togglePause(); });
hub(); requestAnimationFrame(loop);
window.__hm = { GAMES, play: (i) => play(GAMES[i]), get cur() { return cur; }, hub };
