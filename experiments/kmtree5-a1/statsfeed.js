/* m1: THE STATS FEED. What the page hands stats.js (st1), in one place, so
 * the page and statscheck.js run the same code.
 *
 * Two sources, both real:
 *   1. the director's play before each moment (director.js segment): every
 *      event, in order, as it is played. Its five seconds stand for the
 *      match minutes since the last moment (the last moment's minute, or 0
 *      at kick-off, up to this moment's minute), so possession and the
 *      heatmap are minutes the ball spent with each team, where it was.
 *   2. each decision: the engine's result (match.js choose, the event it
 *      returns) goes to stats.moment, which counts goals, shots, shots on
 *      target, corners, fouls and the key moments timeline. The second of
 *      play the director stages for that result (director.js resolve) adds
 *      its passes only: its shots, saves, tackles and balls out are the
 *      result itself, already counted once from the engine's event, and it
 *      takes no match time (it happens at the moment's minute).
 *
 * How the director's events are read (stats.js's own reading is written at
 * the top of stats.js): a director `out` event names the team that has the
 * ball after it (a corner to the attackers, a goal kick to the keeper's
 * team), so it is passed on with `poss` set to that team. A tackle or an
 * interception inside a result is passed on as a carry by the team that won
 * it, so the pass before it counts as not completed without counting the
 * ball won twice.
 *
 * Pure: it reads the director's segments and the engine's events and never
 * writes either. Browser (after stats.js) and node. */
(function (root) {
  'use strict';
  var S = root.KMStats || require('./stats.js');

  function create(opts) { return { s: S.create(opts), lastMin: 0, seg: null, fed: 0, passesShown: 0 }; }

  /* the play before a moment, event by event */
  function mapPlay(e, beat) {
    var o = { t: e.t, kind: e.kind, team: e.team, from: e.from, to: e.to, ball: e.ball, note: e.note };
    /* m3: a pass is completed when the director gives it to a team-mate
     * (its beat ends with him on the ball). stats.js's own guess from the next
     * event is wrong for d1: a tackle or an interception is its own event, on
     * the man who RECEIVED the pass (his next pass is the one cut out), and a
     * cross headed away ends with nobody on it */
    if (e.kind === 'pass' && beat) o.ok = !!(beat.holder && beat.poss === e.team);
    /* m3: d1's events say who has the ball after them (`poss`): a clearance
     * that drops to the other side, a shot the keeper pushes out to the
     * attackers, a foul (the team fouled), a ball out (the restart's team) */
    if (e.poss === 'you' || e.poss === 'them') o.poss = e.poss;
    if (e.kind === 'out') { o.poss = e.team; o.restart = e.note || ''; }
    return o;
  }
  function beginPlay(F, seg, toMinute) {
    endPlay(F);
    var to = typeof toMinute === 'number' ? Math.max(toMinute, F.lastMin) : F.lastMin;
    S.beginSegment(F.s, { fromMinute: F.lastMin, toMinute: to, duration: seg.duration });
    F.seg = seg; F.fed = 0; F.lastMin = to;
    return F;
  }
  /* feed every event of the running segment that starts at or before t
   * (seconds of the segment); returns how many were fed now */
  function playTo(F, t) {
    if (!F.seg) return 0;
    var ev = F.seg.events, n = 0;
    while (F.fed < ev.length && ev[F.fed].t <= t + 1e-9) {
      if (ev[F.fed].kind === 'pass' || ev[F.fed].kind === 'kickoff') F.passesShown += ev[F.fed].kind === 'pass' ? 1 : 0;
      S.event(F.s, mapPlay(ev[F.fed], F.seg.beats && F.seg.beats[F.fed])); F.fed++; n++;
    }
    return n;
  }
  function endPlay(F) {
    if (!F.seg) return F;
    playTo(F, Infinity);
    S.endSegment(F.s);
    F.seg = null;
    return F;
  }
  function play(F, seg, toMinute) { beginPlay(F, seg, toMinute); return endPlay(F); }

  /* a decision: the director's second of play (passes only), then the
   * engine's result */
  var KEEP = { pass: 1, carry: 1, dribble: 1, kickoff: 1 };
  var AS_CARRY = { tackle: 1, interception: 1 };
  function result(F, seg, ev) {
    endPlay(F);
    var m = ev && typeof ev.minute === 'number' ? ev.minute : F.lastMin;
    if (seg && seg.events && seg.events.length) {
      S.beginSegment(F.s, { fromMinute: m, toMinute: m, duration: seg.duration });
      seg.events.forEach(function (e, j) {
        if (KEEP[e.kind]) { if (e.kind === 'pass') F.passesShown++; S.event(F.s, mapPlay(e, seg.beats && seg.beats[j])); }
        else if (AS_CARRY[e.kind]) S.event(F.s, { t: e.t, kind: 'carry', team: e.team, ball: e.ball });
      });
      S.endSegment(F.s);
    }
    if (ev) S.moment(F.s, ev);
    if (m > F.lastMin) F.lastMin = m;
    return F;
  }
  function summary(F) { return S.summary(F.s); }

  var API = { create: create, beginPlay: beginPlay, playTo: playTo, endPlay: endPlay, play: play, result: result, summary: summary };
  root.KMStatsFeed = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
