// Tiny event emitter shared by engine, round, input.
export class Emitter {
  constructor() { this._ev = new Map(); }
  on(name, fn) {
    if (!this._ev.has(name)) this._ev.set(name, new Set());
    this._ev.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) { const off = this.on(name, (...a) => { off(); fn(...a); }); return off; }
  off(name, fn) { this._ev.get(name)?.delete(fn); }
  emit(name, ...args) { for (const fn of [...(this._ev.get(name) || [])]) fn(...args); }
}
