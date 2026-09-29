/* m6: REVIEW ROUND 3, THE PICTURE AGREES WITH TWO MORE SENTENCES (show only).
 *
 * 1. "X is the nearest of your players to him". The director puts X about
 *    5 m from the man on the ball but never checked the rest of X's team:
 *    in 200 matches 1,103 of 2,193 such pictures had someone of X's team
 *    nearer (the review: the man just beaten, Rodri, 2.9 m behind, while
 *    the text names Cubarsí at 5.1 m). Now X is the nearest of his team by
 *    at least MARGIN metres: X steps in along his own line to the man (never
 *    closer than 3.2 m, never nearer the ball than the man on it, and never within the director's 2.9 m of anyone), and when
 *    that is not enough the men nearer than him (the beaten man, a team-mate)
 *    step back out along their own line. All or nothing.
 * 2. "X, your full-back, is the only one of your players on that wing in
 *    front of him" (options.js, m6 wording; it said "the only one of your
 *    players in front of him" while four to six of yours stood between him
 *    and the goal, 4 of 4 in the review). Anyone else of yours in front of
 *    him in his lane (the wing, x 0 to 22 or 46 to 68) moves just inside
 *    the lane line, keeping his distance from goal.
 *
 * apply(st, pend, seg) edits the END of the segment that stops at this
 * decision (seg.end and its last key, so the play glides into it), the way
 * whystage.js does. Nothing in the match is read for a number or written.
 *
 *   KMR3Stage.apply(st, pend, seg) -> { near: 'ok'|'moved'|'failed'|null, wing: ... }
 *   KMR3Stage.tamper  { near: false, wing: false } (the checks' --break) */
(function (root) {
  'use strict';
  var P = root.KMPitch || require('./pitch.js');
  var T = { near: false, wing: false };
  try { var mb = /[?&]r3break=([a-zA-Z]+)/.exec((root.location && root.location.search) || ''); if (mb && mb[1] in T) T[mb[1]] = true; } catch (e) { }
  var MARGIN = 0.6, CLOSE = 3.2, GAP = P.MIN_GAP || 2.9;   // the director's own gap between men in a drawn frame
  /* when that cannot be done (their keeper stands close), a tighter try: 2.6 m to the man, 2.4 m between men */
  var TRIES = [[3.2, P.MIN_GAP || 2.9], [2.6, 2.4]];

  function d(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sceneText(p) { return String((p.moment && p.moment.text) || '') + ' ' + String(p.lead || ''); }
  var NEAR_RE = /([^ .,:]+) is the nearest of (your|their) players to (him|[^ .,:]+)/;
  var WING_RE = /([^ .,:]+), your (?:full-back|wide midfielder|player), is the only one of your players (?:on that wing|close) in front of him/;

  /* who the sentence names, and who it is about; the named man's team is
   * "your" (the user's) or "their" */
  function nearClaim(st, p) {
    var m = NEAR_RE.exec(sceneText(p));
    if (!m) return null;
    var team = m[2] === 'your' ? 'you' : 'them';
    var N = P.byFirst(st, m[1], team);
    var S = P.startOf(st, p);
    var tg = m[3] === 'him' ? P.byId(st, S.holderId) : P.byFirst(st, m[3]);
    return N && tg && N !== tg ? { N: N, target: tg, team: team, holderId: S.holderId } : null;
  }
  function wingClaim(st, p) {
    var m = WING_RE.exec(sceneText(p));
    if (!m) return null;
    var f = P.byFirst(st, m[1], 'you'), S = P.startOf(st, p);
    return f ? { front: f, holderId: S.holderId } : null;
  }

  function set(seg, key, id, q) {
    seg.end.pos[id] = { x: q.x, y: q.y };
    if (key && key.pos) key.pos[id] = { x: q.x, y: q.y };
  }
  function clearOf(pos, c, skip, gap) {
    for (var id in pos) { if (skip[id]) continue; if (d(pos[id], c) < gap) return false; }
    return c.x >= 1 && c.x <= 67 && c.y >= 1 && c.y <= P.L - 1;
  }

  function fixNear(st, p, seg, key) {
    var r0 = null;
    for (var tI = 0; tI < TRIES.length; tI++) { CLOSE = TRIES[tI][0]; GAP = TRIES[tI][1]; r0 = fixNearOnce(st, p, seg, key); if (r0 !== 'failed') break; }
    CLOSE = TRIES[0][0]; GAP = TRIES[0][1];
    return r0;
  }
  function fixNearOnce(st, p, seg, key) {
    var cl = nearClaim(st, p);
    if (!cl) return null;
    var pos = seg.end.pos, ball = seg.end.ball || null, tq = pos[cl.target.id], nq = pos[cl.N.id];
    if (!tq || !nq) return null;
    var mates = P.roster(st).filter(function (r) { return r.team === cl.team && r.p !== cl.N && pos[r.id]; });
    function dmin() { return mates.reduce(function (m, r) { return Math.min(m, d(pos[r.id], tq)); }, 1e9); }
    var dN = d(nq, tq), dm = dmin();
    if (dN <= dm - MARGIN) return 'ok';
    if (T.near) return 'failed';
    var hq = pos[cl.holderId], hb = ball && hq ? d(hq, ball) : 0;
    function okForN(c) {
      var skip = {}; skip[cl.N.id] = 1;
      if (!clearOf(pos, c, skip, GAP)) return false;
      if (d(c, tq) < CLOSE) return false;
      if (ball && cl.holderId !== cl.N.id && d(c, ball) < hb + 0.8) return false;
      return true;
    }
    /* a: X steps in, along his own line to the man, turning a little if he must */
    var want = dm - MARGIN, base = Math.atan2(nq.y - tq.y, nq.x - tq.x), plan = null;
    if (want >= CLOSE) {
      for (var r = want; r >= CLOSE && !plan; r -= 0.3) {
        for (var k = 0; k <= 8 && !plan; k++) {
          [1, -1].forEach(function (sg) {
            if (plan) return;
            var a = base + sg * k * 0.2, c = { x: tq.x + Math.cos(a) * r, y: tq.y + Math.sin(a) * r };
            if (okForN(c)) plan = c;
          });
        }
      }
      if (plan) { set(seg, key, cl.N.id, plan); return 'moved'; }
    }
    /* b: X at his closest, and the men of his team nearer than that step back out along their line */
    var nPlan = dN <= CLOSE + 0.05 ? { x: nq.x, y: nq.y } : null;   // already as close as he may be: he stays, the others step back
    for (var r2 = CLOSE; r2 <= Math.min(dN, CLOSE + 2) && !nPlan; r2 += 0.3) {
      for (var k2 = 0; k2 <= 10 && !nPlan; k2++) {
        [1, -1].forEach(function (sg) {
          if (nPlan) return;
          var a = base + sg * k2 * 0.25, c = { x: tq.x + Math.cos(a) * r2, y: tq.y + Math.sin(a) * r2 };
          var skip = {}; skip[cl.N.id] = 1; mates.forEach(function (m0) { if (d(pos[m0.id], tq) < r2 + MARGIN) skip[m0.id] = 1; });
          if (clearOf(pos, c, skip, GAP) && !(ball && d(c, ball) < hb + 0.8)) nPlan = c;
        });
      }
    }
    if (!nPlan) return 'failed';
    var rN = d(nPlan, tq), moves = {}, taken = {};
    for (var id0 in pos) taken[id0] = pos[id0];
    taken[cl.N.id] = nPlan;
    var ok = mates.every(function (m0) {
      var q = pos[m0.id], dq = d(q, tq);
      if (dq >= rN + MARGIN) return true;
      if (P.isKeeper(m0.p, st.squad) || P.isKeeper(m0.p, st.opp)) return false;
      delete taken[m0.id];
      var a0 = Math.atan2(q.y - tq.y, q.x - tq.x), got = null;
      for (var rr = rN + MARGIN + 0.2; rr <= rN + 8 && !got; rr += 0.4) {
        for (var k3 = 0; k3 <= 6 && !got; k3++) {
          [1, -1].forEach(function (sg) {
            if (got) return;
            var a = a0 + sg * k3 * 0.15, c = { x: tq.x + Math.cos(a) * rr, y: tq.y + Math.sin(a) * rr };
            if (clearOf(taken, c, {}, GAP)) got = c;
          });
        }
      }
      if (!got) return false;
      moves[m0.id] = got; taken[m0.id] = got;
      return true;
    });
    if (!ok) return 'failed';
    set(seg, key, cl.N.id, nPlan);
    for (var mid in moves) set(seg, key, mid, moves[mid]);
    return 'moved';
  }

  var LANE = [[0, 22], [22, 46], [46, 68]];
  function fixWing(st, p, seg, key) {
    var cl = wingClaim(st, p);
    if (!cl) return null;
    var pos = seg.end.pos, hq = pos[cl.holderId];
    if (!hq) return null;
    var ln = P.laneOfX(hq.x);
    if (ln === 1) return null;
    var dir = P.teamOf(st, P.byId(st, cl.holderId)) === 'them' ? -1 : 1;   // their attack runs down the screen
    var yours = P.roster(st).filter(function (r) { return r.team === 'you' && !r.keeper && r.p !== cl.front && pos[r.id]; });
    var bad = yours.filter(function (r) { var q = pos[r.id]; return P.laneOfX(q.x) === ln && (q.y - hq.y) * dir > 0 && d(q, hq) < 30; });
    if (!bad.length) return 'ok';
    if (T.wing) return 'failed';
    var edge = ln === 0 ? LANE[0][1] + 1.2 : LANE[2][0] - 1.2, plan = {}, taken = {};
    for (var id0 in pos) taken[id0] = pos[id0];
    var ok = bad.every(function (r) {
      var q = pos[r.id], got = null;
      delete taken[r.id];
      for (var s = 0; s <= 8 && !got; s++) {
        [0, 1, -1].forEach(function (sg) {
          if (got) return;
          var c = { x: clamp(edge + (ln === 0 ? 1 : -1) * s * 0.9, 1, 67), y: clamp(q.y + sg * s * 0.8, 1, P.L - 1) };
          if (clearOf(taken, c, {}, GAP)) got = c;
        });
      }
      if (!got) return false;
      plan[r.id] = got; taken[r.id] = got;
      return true;
    });
    if (!ok) return 'failed';
    for (var id in plan) set(seg, key, id, plan[id]);
    return 'moved';
  }

  function apply(st, pend, seg) {
    if (!st || !pend || !seg || !seg.end || !seg.end.pos) return null;
    var key = seg.keys && seg.keys.length ? seg.keys[seg.keys.length - 1] : null;
    var w = fixWing(st, pend, seg, key);
    var n = fixNear(st, pend, seg, key);   // after the wing: the nearest has the last word
    return { near: n, wing: w };
  }
  var API = { apply: apply, tamper: T, nearClaim: nearClaim, wingClaim: wingClaim, NEAR_RE: NEAR_RE, WING_RE: WING_RE, MARGIN: MARGIN };
  root.KMR3Stage = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
