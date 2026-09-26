/* why1: MAKING THE PICTURE AGREE WITH THE REASON (show only).
 *
 * The engine can carry an edge into a decision that says where a man is:
 * "Baena is past the last defender: +2 to his shot" (options.js CARRY
 * 'through'). The director stages the scene from the commentator's text
 * ("Baena has the ball in their box. Montiel is the nearest"), which does
 * not say it, so in 60 of 60 finals the frozen picture had defenders between
 * him and the goal: the one reason the reviewer named could not be drawn.
 *
 * apply(st, pend, seg) edits the END of the segment that stops at this
 * decision (its last key and seg.end, so the play glides into it): every
 * outfield defender who is level with or goal-side of the man goes to a spot
 * behind him (further from their goal), keeping his side of the pitch, clear
 * of every other man, and never nearer to him than the man the text calls
 * the nearest. Nothing in the match is read for a number or written: the
 * positions are the only thing that changes (whycheck.js proves the
 * scorecard and the text claims are untouched).
 *
 *   KMWhyStage.apply(st, pend, seg) -> { edge, moved: [ids] } | null */
(function (root) {
  'use strict';
  var P = root.KMPitch || require('./pitch.js');
  var T = { off: false, near: false };
  /* ?whybreak=<name> in the page: the same switches, for whycheck.js's page part */
  try { var mb = /[?&]whybreak=([a-zA-Z]+)/.exec((root.location && root.location.search) || ''); if (mb && mb[1] in T) T[mb[1]] = true; } catch (e) { }

  function d(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function apply(st, pend, seg) {
    if (T.off || !st || !pend || !seg || !seg.end || !seg.end.pos) return null;
    var carried = (st.chain && st.chain.carried) || (pend.moment && pend.moment.sit && pend.moment.sit.carried) || [];
    var th = carried.filter(function (c) { return c && c.id === 'through' && c.man; })[0];
    if (!th) return null;
    var S = P.startOf(st, pend);
    if (!S.holder || S.holder !== th.man) return null;
    var team = P.teamOf(st, th.man);
    if (!team) return null;
    var pos = seg.end.pos, key = seg.keys && seg.keys.length ? seg.keys[seg.keys.length - 1] : null;
    var a = pos[th.man.id];
    if (!a) return null;
    var G = team === 'you' ? P.L : 0, dir = team === 'you' ? 1 : -1;
    var dsq = team === 'you' ? st.opp : st.squad;
    var near = S.near && pos[S.near.id] ? S.near : null;
    function toGoal(q) { return (G - q.y) * dir; }
    var mine = toGoal(a);
    var defs = dsq.players.filter(function (p) { return pos[p.id]; });
    var moving = defs.filter(function (p) { return toGoal(pos[p.id]) <= mine + 0.8; });
    if (!moving.length) return { edge: 'through', moved: [] };
    /* the named nearest goes first and closest; the others keep further off */
    moving.sort(function (p, q) { return (p === near ? -1 : 0) - (q === near ? -1 : 0) || d(pos[p.id], a) - d(pos[q.id], a); });
    /* the others that stay where they are: the named nearest must stay nearer than all of them */
    var stay = defs.filter(function (p) { return moving.indexOf(p) < 0 && p !== near; });
    var minStay = stay.reduce(function (m, p) { return Math.min(m, d(pos[p.id], a)); }, 1e9);
    var nearD = near && moving.indexOf(near) < 0 ? d(pos[near.id], a) : null;
    var plan = {}, taken = {};
    for (var id0 in pos) taken[id0] = pos[id0];
    var okAll = moving.every(function (p) {
      var q = pos[p.id], side = q.x < a.x ? -1 : 1, best = null;
      delete taken[p.id];
      for (var back = 1.6; back <= 14 && !best; back += 0.8) {
        for (var s = 0; s <= 10 && !best; s += 1) {
          [side, -side].forEach(function (sd) {
            if (best) return;
            var c = { x: clamp(q.x + sd * s * 1.2, 1, 67), y: clamp(a.y - dir * back, 1, P.L - 1) };
            if (toGoal(c) < mine + 0.9) return;
            var dd = d(c, a);
            if (dd < 2.4) return;
            if (p === near && dd > minStay - 0.2) return;
            if (p !== near && nearD !== null && dd <= nearD + 0.3) return;
            for (var id in taken) if (d(taken[id], c) < 2.5) return;
            best = c;
          });
        }
      }
      if (!best) return false;
      plan[p.id] = best; taken[p.id] = best;
      if (p === near) nearD = d(best, a);
      return true;
    });
    /* all or nothing: a half-staged picture would be neither the director's nor true */
    if (!okAll) return { edge: 'through', moved: [], failed: true };
    var moved = [];
    moving.forEach(function (p) {
      var b0 = plan[p.id];
      pos[p.id] = { x: b0.x, y: b0.y };
      if (key && key.pos) key.pos[p.id] = { x: b0.x, y: b0.y };
      moved.push(p.id);
    });
    /* --break near only: the named nearest is sent 12 m back */
    if (T.near && near && pos[near.id]) { pos[near.id] = { x: pos[near.id].x, y: clamp(a.y - dir * 12, 1, P.L - 1) }; if (key && key.pos) key.pos[near.id] = pos[near.id]; if (moved.indexOf(near.id) < 0) moved.push(near.id); }
    return { edge: 'through', moved: moved };
  }
  var API = { apply: apply, tamper: T };
  root.KMWhyStage = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
