// Round state machine — PURE (no DOM, no THREE). Owner: E. See SPEC.md §1 + §10.
//
//   lobby → hide ("Until Search Starts", Hunter Wait Time / Paint Time)
//         → search ("Search Start!" banner, "Search Time")
//         → answer ("Answer Check": win banner, survivors revealed, Missed-Spot Ranking)
//         → result (scoreboard, a few seconds) → lobby
//
// World queries (view cones, line of sight, burial) are injected through `sense`, so this file runs in
// node for tests:   sense = { canSee(hunter, hider) -> bool, buriedRatio(hider) -> 0..1 }
//
// Events (round.on):
//   'phase'    (phase, prev)
//   'banner'   ({ text, kind })                   kind: 'hide'|'start'|'win'|'lose'
//   'catch'    ({ hunter, hider })
//   'team'     ({ actor, team })                  infection conversion
//   'closeCall'({ hider, hunter })                +1 line-of-sight point
//   'taunt'    ({ actor, forced })
//   'buried'   ({ actor, on, t })                 warning on/off for a hider
//   'reveal'   ({ actor })                        buried too long → location ping
//   'tick'     (secondsLeft)                      last 10 s of hide/search, once per second
//   'like'     ({ from, to })
//   'end'      ({ winner, text })
import { Emitter } from '../core/emitter.js';

export const SETTINGS = Object.freeze({
  mode: 'infection', hunters: 1, hunterWait: 60, paintTime: 60, searchTime: 300,
  answerCheck: 30, forcedTaunt: 0, showMissedSpot: true,
  filters: Object.freeze({ monochrome: false, horror: false, mosaic: false }),
  map: 'mansion', bots: 7, botDifficulty: 'normal',
});

export function defaultSettings(patch = {}) {
  const s = { ...SETTINGS, filters: { ...SETTINGS.filters }, ...patch };
  s.filters = { ...SETTINGS.filters, ...(patch.filters || {}) };
  return s;
}

// Mode titles (bottom-right) + descriptions, word for word from the game.
export const MODES = [
  { id: 'infection', name: 'Infection', color: '#3ee23a', desc: ['If you get caught, you become a hunter.', 'Hide until the end to win'] },
  { id: 'normal', name: 'Normal', color: '#4fc3ff', desc: ['If you get caught, you are out.', 'Hide until the end to win'] },
  { id: 'double', name: 'Double', color: '#e449e4', desc: ['Everyone hides at the start.', 'After that, everyone searches and the first player to find everyone wins.'] },
];
export const modeInfo = (id) => MODES.find((m) => m.id === id) || MODES[0];

export const PHASE_LABEL = { hide: 'Until Search Starts', search: 'Search Time', answer: 'Answer Check', result: 'Results', lobby: '' };

export const SCORE = { find: 100, survive: 100, closeCall: 1, like: 10, alivePerSec: 1 };
export const CLOSE_CALL_RANGE = 12;       // metres (used by the app's sense.canSee)
export const BURIED_RATIO = 0.35;         // above this the body counts as buried
export const BURIED_REVEAL = 5;           // seconds of burial before the location is revealed
export const RESULT_TIME = 7;

export class Round extends Emitter {
  constructor({ settings = defaultSettings(), actors = [], map = null, sense = null, rng = Math.random } = {}) {
    super();
    this.settings = defaultSettings(settings);
    this.actors = actors;
    this.map = map;
    this.sense = sense || { canSee: () => false, buriedRatio: () => 0 };
    this.rng = rng;
    this.phase = 'lobby';
    this.timeLeft = 0;
    this.elapsed = 0;           // seconds in the current phase
    this.winner = null;         // 'hunters' | 'hiders' | actorId (double)
    this.winText = '';
    this.foundBy = new Map();   // double: hunterId -> Set(hiderId)
    this.log = [];              // [{t, hunter, hider}] find order
    this._sight = new Map();    // `${hunter}|${hider}` -> seconds accumulated
    this._senseT = 0;
    this._tauntT = 0;
    this._lastTick = null;
    this._likePlan = [];
  }

  get mode() { return this.settings.mode; }
  get label() { return PHASE_LABEL[this.phase] ?? ''; }
  get isDouble() { return this.mode === 'double'; }
  byId(id) { return this.actors.find((a) => a.id === id) || null; }

  // ---- team queries -------------------------------------------------------------------------
  /** Hiders still in play (their body is still hidden somewhere). */
  hidersAlive() { return this.actors.filter((a) => a.team === 'hider' && !a.caught); }
  hiders() { return this.actors.filter((a) => a.team === 'hider'); }
  hunters() { return this.actors.filter((a) => a.team === 'hunter'); }
  /** In Double every player hunts during search. */
  seekers() { return this.isDouble ? (this.phase === 'search' ? this.actors.slice() : []) : this.hunters(); }
  /** Bodies that can currently be found by `hunter`. */
  targetsFor(hunter) {
    if (this.isDouble) return this.actors.filter((a) => a !== hunter && !this.hasFound(hunter, a));
    return this.hidersAlive();
  }
  hasFound(hunter, hider) { return !!this.foundBy.get(hunter.id ?? hunter)?.has(hider.id ?? hider); }

  // ---- lifecycle ----------------------------------------------------------------------------
  /** Assign teams and enter the hide phase. */
  start() {
    const s = this.settings;
    for (const a of this.actors) {
      a.caught = false; a.closeCalls = 0; a.spotCount = 0; a.finds = 0; a.roundScore = 0;
      a.buriedT = 0; a.buriedWarn = false; a.revealed = false; a.tauntCd = 0; a.survived = false;
      a.team = 'hider';
      a.wasHunter = false;
    }
    if (!this.isDouble) {
      const n = Math.max(1, Math.min(s.hunters | 0, this.actors.length - 1));
      const forced = this.actors.filter((a) => a.forceRole === 'hunter');
      const applicants = shuffle(this.actors.filter((a) => a.applicant && a.forceRole !== 'hider' && !forced.includes(a)), this.rng);
      const rest = shuffle(this.actors.filter((a) => !a.applicant && !a.forceRole), this.rng);
      const pool = [...forced, ...applicants, ...rest];
      for (const a of pool.slice(0, Math.max(n, forced.length))) { a.team = 'hunter'; a.wasHunter = true; }
      if (this.actors.length === 1) this.actors[0].team = this.actors[0].forceRole || 'hider';
    }
    this.foundBy.clear();
    for (const a of this.actors) this.foundBy.set(a.id, new Set());
    this.log = [];
    this._sight.clear();
    this.winner = null; this.winText = '';
    this._setPhase('hide', this.isDouble ? s.paintTime : s.hunterWait);
    this.emit('banner', { text: 'Hide Time', kind: 'hide' });
  }

  _setPhase(phase, time) {
    const prev = this.phase;
    this.phase = phase;
    this.timeLeft = Math.max(0, time);
    this.elapsed = 0;
    this._lastTick = null;
    this.emit('phase', phase, prev);
  }

  /** Harness / debug: jump straight to a phase. */
  skipTo(phase) {
    const s = this.settings;
    if (phase === 'lobby') { this._setPhase('lobby', 0); return; }
    if (this.phase === 'lobby' && phase !== 'lobby') this.start();
    if (phase === 'hide') return;
    if (phase === 'search') { if (this.phase === 'hide') this._beginSearch(); return; }
    if (phase === 'answer' || phase === 'result') {
      if (this.phase === 'hide') this._beginSearch();
      if (this.phase === 'search') this._endSearch();
      if (phase === 'result' && this.phase === 'answer') this._setPhase('result', RESULT_TIME);
    }
    void s;
  }

  setTime(sec) { this.timeLeft = Math.max(0, sec); this._lastTick = null; }

  _beginSearch() {
    this._setPhase('search', this.settings.searchTime);
    this._tauntT = 0;
    if (this.isDouble) for (const a of this.actors) { a.seeking = true; }
    this.emit('banner', { text: 'Search Start!', kind: 'start' });
  }

  _endSearch() {
    // Decide the winner.
    if (this.isDouble) {
      if (!this.winner) {
        const best = this.actors.slice().sort((a, b) => (b.finds || 0) - (a.finds || 0))[0];
        this.winner = best?.id ?? null;
        this.winText = best ? `${best.name} Wins!` : 'Draw';
      }
    } else if (!this.winner) {
      const alive = this.hidersAlive();
      this.winner = alive.length ? 'hiders' : 'hunters';
      this.winText = alive.length ? 'Hiders Win!' : 'Hunters Win!';
    }
    for (const a of this.hidersAlive()) {
      a.survived = true; a.revealed = true;
      this._award(a, SCORE.survive);
    }
    this._planLikes();
    this._setPhase('answer', this.settings.answerCheck);
    this.emit('end', { winner: this.winner, text: this.winText });
    this.emit('banner', { text: this.winText, kind: this._winKindFor() });
  }

  _winKindFor() { return 'win'; }

  /** Did the given actor's side win? (for win/lose stingers) */
  didWin(actor) {
    if (!actor || !this.winner) return false;
    if (this.isDouble) return this.winner === actor.id;
    if (this.winner === 'hunters') return actor.team === 'hunter';
    return actor.team === 'hider' && !actor.caught;
  }

  // ---- per-frame ----------------------------------------------------------------------------
  update(dt) {
    if (this.phase === 'lobby') return;
    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (const a of this.actors) if (a.tauntCd > 0) a.tauntCd -= dt;

    if (this.phase === 'hide' || this.phase === 'search') {
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec >= 1 && sec !== this._lastTick) { this._lastTick = sec; this.emit('tick', sec); }
      this._updateBuried(dt);
    }

    if (this.phase === 'hide') {
      if (this.timeLeft <= 0) this._beginSearch();
    } else if (this.phase === 'search') {
      this._updateSight(dt);
      for (const a of this.hidersAlive()) this._award(a, SCORE.alivePerSec * dt, true);
      const ft = this.settings.forcedTaunt;
      if (ft > 0) {
        this._tauntT += dt;
        if (this._tauntT >= ft) {
          this._tauntT -= ft;
          for (const a of (this.isDouble ? this.actors : this.hidersAlive())) this.emit('taunt', { actor: a, forced: true });
        }
      }
      if (this.timeLeft <= 0 || this._checkEarlyEnd()) this._endSearch();
    } else if (this.phase === 'answer') {
      for (const p of this._likePlan) if (!p.done && this.elapsed >= p.t) { p.done = true; this.like(p.from, p.to); }
      if (this.timeLeft <= 0) this._setPhase('result', RESULT_TIME);
    } else if (this.phase === 'result') {
      if (this.timeLeft <= 0) this._setPhase('lobby', 0);
    }
  }

  _checkEarlyEnd() {
    if (this.isDouble) return !!this.winner;
    if (!this.hidersAlive().length) return true;
    return false;
  }

  _updateSight(dt) {
    // Accumulate visible time per (hunter, hider) pair; each full second = one close call (+1).
    this._senseT += dt;
    if (this._senseT < 0.2) return;
    const step = this._senseT;
    this._senseT = 0;
    for (const hunter of this.seekers()) {
      for (const hider of this.targetsFor(hunter)) {
        const key = `${hunter.id}|${hider.id}`;
        if (!this.sense.canSee(hunter, hider)) { this._sight.set(key, 0); continue; }
        let t = (this._sight.get(key) || 0) + step;
        while (t >= 1) {
          t -= 1;
          hider.closeCalls = (hider.closeCalls || 0) + 1;
          hider.spotCount = (hider.spotCount || 0) + 1;
          this._award(hider, SCORE.closeCall);
          this.emit('closeCall', { hider, hunter });
        }
        this._sight.set(key, t);
      }
    }
  }

  _updateBuried(dt) {
    const list = this.isDouble ? (this.phase === 'hide' ? this.actors : []) : this.hidersAlive();
    for (const a of list) {
      const r = this.sense.buriedRatio(a) || 0;
      if (r > BURIED_RATIO) {
        a.buriedT = (a.buriedT || 0) + dt;
        if (!a.buriedWarn) { a.buriedWarn = true; this.emit('buried', { actor: a, on: true, t: a.buriedT }); }
        if (a.buriedT >= BURIED_REVEAL) {
          a.buriedT = 0;
          if (this.phase === 'search') this.emit('reveal', { actor: a });
        }
      } else if (a.buriedWarn) {
        a.buriedWarn = false; a.buriedT = 0;
        this.emit('buried', { actor: a, on: false, t: 0 });
      }
    }
  }

  _award(actor, pts, silent = false) {
    actor.score = (actor.score || 0) + pts;
    actor.roundScore = (actor.roundScore || 0) + pts;
    if (!silent) this.emit('score', { actor, pts });
  }

  // ---- actions ------------------------------------------------------------------------------
  /** A hunter's shot hit a hider's body. Returns true if it counted. */
  catch(hunterId, hiderId) {
    if (this.phase !== 'search') return false;
    const hunter = this.byId(hunterId), hider = this.byId(hiderId);
    if (!hunter || !hider || hunter === hider) return false;
    if (this.isDouble) {
      const set = this.foundBy.get(hunter.id);
      if (set.has(hider.id)) return false;
      set.add(hider.id);
      hunter.finds = (hunter.finds || 0) + 1;
      hider.timesFound = (hider.timesFound || 0) + 1;
      this._award(hunter, SCORE.find);
      this.log.push({ t: this.elapsed, hunter: hunter.id, hider: hider.id });
      this.emit('catch', { hunter, hider });
      if (set.size >= this.actors.length - 1 && !this.winner) { this.winner = hunter.id; this.winText = `${hunter.name} Wins!`; }
      return true;
    }
    if (hunter.team !== 'hunter' || hider.team !== 'hider' || hider.caught) return false;
    hider.caught = true;
    hider.buriedWarn = false;
    hunter.finds = (hunter.finds || 0) + 1;
    this._award(hunter, SCORE.find);
    this.log.push({ t: this.elapsed, hunter: hunter.id, hider: hider.id });
    this.emit('catch', { hunter, hider });
    if (this.mode === 'infection') {
      hider.team = 'hunter';
      hider.infected = true;
      this.emit('team', { actor: hider, team: 'hunter' });
    }
    return true;
  }

  /** Taunt (1): whistle heard by nearby hunters. 3 s cooldown. */
  taunt(actorId, forced = false) {
    const a = this.byId(actorId);
    if (!a || (this.phase !== 'hide' && this.phase !== 'search')) return false;
    if (!forced && a.tauntCd > 0) return false;
    a.tauntCd = 3;
    this.emit('taunt', { actor: a, forced });
    return true;
  }

  like(fromId, toId) {
    const from = this.byId(fromId), to = this.byId(toId);
    if (!from || !to || from === to) return false;
    to.likes = (to.likes || 0) + 1;
    this._award(to, SCORE.like);
    this.emit('like', { from, to });
    return true;
  }

  _planLikes() {
    // Bots hand out 👍 to the best hiding spots during Answer Check.
    const survivors = this.isDouble ? this.actors.filter((a) => !a.timesFound) : this.hidersAlive();
    const pool = survivors.length ? survivors : [];
    this._likePlan = [];
    if (!pool.length) return;
    const span = Math.max(2, this.settings.answerCheck - 2);
    for (const b of this.actors.filter((a) => a.isBot)) {
      if (this.rng() > 0.55) continue;
      const to = pool[Math.floor(this.rng() * pool.length)];
      if (to === b) continue;
      this._likePlan.push({ t: 1.5 + this.rng() * span * 0.7, from: b.id, to: to.id, done: false });
    }
  }

  /** Surviving hiders ranked by how often hunters looked straight at them (close-call seconds). */
  missedRanking() {
    const list = this.isDouble ? this.actors.slice() : this.actors.filter((a) => a.team === 'hider' || a.infected);
    return list
      .filter((a) => (a.spotCount || 0) > 0 || (!a.caught && a.team === 'hider'))
      .sort((a, b) => (b.spotCount || 0) - (a.spotCount || 0))
      .map((a) => ({ actor: a, spots: a.spotCount || 0, caught: !!a.caught }));
  }

  /** Small green number next to the hourglass. */
  get bonus() {
    const hunters = this.isDouble ? this.actors.length : this.hunters().length;
    if (!hunters || this.actors.length < 2) return 0;
    const s = this.settings;
    if (this.phase === 'hide') return Math.max(0, s.searchTime - s.answerCheck);
    if (this.phase === 'search') return Math.max(0, Math.ceil(this.timeLeft) - s.answerCheck);
    return this._frozenBonus ?? 0;
  }
}

function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
