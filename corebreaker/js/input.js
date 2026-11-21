// ===================== 조작 (키보드 · 마우스 · 터치) =====================
export const I = { f: 0, b: 0, l: 0, r: 0, jump: false, crouch: false, walk: false, fire: false, aim: false, reload: false, q: false, e: false, use: false, slot: 0, dx: 0, dy: 0, jx: 0, jy: 0, fireEdge: false };
export const SET = { sens: 1.0, fov: 80, vol: 0.7, quality: 'high', xcolor: '#5dffb0', invert: false };
try { Object.assign(SET, JSON.parse(localStorage.getItem('rz_settings') || '{}')); } catch (e) { /* 저장 못 함 */ }
export function saveSet() { try { localStorage.setItem('rz_settings', JSON.stringify(SET)); } catch (e) { /* 무시 */ } }

let handlers = {};
export function onKey(fn) { handlers = fn; }
let locked = false;
export const isLocked = () => locked;
export function bindInput(canvasHost) {
  const key = (e, down) => {
    if (handlers.typing && handlers.typing()) return;
    const c = e.code;
    if (c === 'KeyW' || c === 'ArrowUp') I.f = down;
    else if (c === 'KeyS' || c === 'ArrowDown') I.b = down;
    else if (c === 'KeyA' || c === 'ArrowLeft') I.l = down;
    else if (c === 'KeyD' || c === 'ArrowRight') I.r = down;
    else if (c === 'Space') { if (down && !e.repeat) I.jump = true; e.preventDefault(); }
    else if (c === 'ControlLeft' || c === 'KeyC') I.crouch = down;
    else if (c === 'ShiftLeft') I.walk = down;
    else if (c === 'KeyR' && down) I.reload = true;
    else if (c === 'KeyQ' && down && !e.repeat) I.q = true;
    else if (c === 'KeyE' && down && !e.repeat) I.e = true;
    else if (c === 'KeyF') I.use = down;
    else if (c === 'Digit1' && down) I.slot = 1;
    else if (c === 'Digit2' && down) I.slot = 2;
    else if (c === 'KeyB' && down && !e.repeat) handlers.buy && handlers.buy();
    else if (c === 'Tab') { e.preventDefault(); handlers.board && handlers.board(down); }
    else if (c === 'Escape' && down) handlers.esc && handlers.esc();
  };
  addEventListener('keydown', (e) => key(e, true));
  addEventListener('keyup', (e) => key(e, false));
  addEventListener('blur', () => { I.f = I.b = I.l = I.r = 0; I.fire = I.aim = I.use = I.crouch = I.walk = false; });
  canvasHost.addEventListener('mousedown', (e) => {
    if (!locked && handlers.wantLock && handlers.wantLock()) { canvasHost.requestPointerLock?.(); return; }
    if (e.button === 0) { I.fire = true; I.fireEdge = true; }
    if (e.button === 2) I.aim = !I.aim || !SET.toggleAim ? true : false;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) I.fire = false; if (e.button === 2 && !SET.toggleAim) I.aim = false; });
  canvasHost.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvasHost; if (!locked) { I.fire = false; handlers.unlock && handlers.unlock(); } });
  addEventListener('mousemove', (e) => {
    if (!locked) return;
    const k = 0.0022 * SET.sens * (handlers.zoom ? handlers.zoom() : 1);
    I.dx += e.movementX * k; I.dy += e.movementY * k * (SET.invert ? -1 : 1);
  });
  addEventListener('wheel', (e) => { if (locked) I.slot = e.deltaY > 0 ? 2 : 1; });
}

// ---- 태블릿 · 휴대폰 ----
export function bindTouch(host) {
  const ui = document.getElementById('touch');
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return false;
  ui.classList.remove('hidden');
  document.body.classList.add('touch');
  const stick = ui.querySelector('.stick'), knob = ui.querySelector('.knob');
  let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
  const btn = (sel, down, up) => { const b = ui.querySelector(sel); if (!b) return; b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); up && up(); }, { passive: false }); };
  btn('[data-t=fire]', () => { I.fire = true; I.fireEdge = true; }, () => { I.fire = false; });
  btn('[data-t=fire2]', () => { I.fire = true; I.fireEdge = true; }, () => { I.fire = false; });
  btn('[data-t=aim]', () => { I.aim = !I.aim; });
  btn('[data-t=jump]', () => { I.jump = true; });
  btn('[data-t=crouch]', () => { I.crouch = !I.crouch; });
  btn('[data-t=reload]', () => { I.reload = true; });
  btn('[data-t=q]', () => { I.q = true; });
  btn('[data-t=e]', () => { I.e = true; });
  btn('[data-t=use]', () => { I.use = true; }, () => { I.use = false; });
  btn('[data-t=buy]', () => handlers.buy && handlers.buy());
  btn('[data-t=swap]', () => { I.slot = handlers.curSlot && handlers.curSlot() === 1 ? 2 : 1; });
  btn('[data-t=menu]', () => handlers.esc && handlers.esc());
  btn('[data-t=board]', () => handlers.board && handlers.board(true), () => handlers.board && handlers.board(false));
  host.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && sid === null) { sid = t.identifier; sx = t.clientX; sy = t.clientY; stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on'); }
      else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  host.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        let dx = (t.clientX - sx) / 50, dy = (t.clientY - sy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        I.jx = dx; I.jy = dy; knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`;
      } else if (t.identifier === lid) {
        const k = 0.006 * SET.sens * (handlers.zoom ? handlers.zoom() : 1);
        I.dx += (t.clientX - lx) * k; I.dy += (t.clientY - ly) * k; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; I.jx = I.jy = 0; knob.style.transform = ''; stick.classList.remove('on'); } if (t.identifier === lid) lid = null; } };
  host.addEventListener('touchend', end); host.addEventListener('touchcancel', end);
  return true;
}
