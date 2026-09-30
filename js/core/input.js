// Keyboard + mouse state. ONE owner of raw listeners — everything else reads from here. See SPEC.md §Input.
// Codes are KeyboardEvent.code ('KeyW', 'Space', 'ShiftLeft', 'Digit1', 'AltLeft' ...).
import { Emitter } from './emitter.js';

class Input extends Emitter {
  constructor() {
    super();
    this.held = new Set();
    this._pressed = new Set();
    this._released = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this._mPressed = new Set();
    this._mReleased = new Set();
    this.locked = false;
    this.enabled = true;
    this.el = null;
  }

  attach(el) {
    this.el = el;
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['Space', 'Tab', 'AltLeft', 'AltRight', 'F1'].includes(e.code) || (e.code.startsWith('Arrow'))) e.preventDefault();
      if (!this.held.has(e.code)) this._pressed.add(e.code);
      this.held.add(e.code);
      this.emit('keydown', e);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this._released.add(e.code);
      this.emit('keyup', e);
    });
    window.addEventListener('blur', () => { this.held.clear(); this.mouse.buttons = 0; });
    el.addEventListener('mousedown', (e) => {
      this.mouse.buttons = e.buttons;
      this._mPressed.add(e.button);
      this.emit('mousedown', e);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons = e.buttons;
      this._mReleased.add(e.button);
      this.emit('mouseup', e);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
      this.mouse.buttons = e.buttons;
    });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      this.emit('lock', this.locked);
    });
  }

  down(code) { return this.enabled && this.held.has(code); }
  pressed(code) { return this.enabled && this._pressed.has(code); }
  released(code) { return this._released.has(code); }
  /** 0 = left, 1 = middle, 2 = right */
  button(b) { return this.enabled && !!(this.mouse.buttons & [1, 4, 2][b]); }
  clicked(b) { return this.enabled && this._mPressed.has(b); }
  unclicked(b) { return this._mReleased.has(b); }
  alt() { return this.down('AltLeft') || this.down('AltRight'); }
  shift() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  ctrl() { return this.down('ControlLeft') || this.down('ControlRight'); }

  lock() { if (this.el && !this.locked) this.el.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Call once at the END of each frame (engine order 1000). */
  endFrame() {
    this._pressed.clear(); this._released.clear();
    this._mPressed.clear(); this._mReleased.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}

export const input = new Input();
