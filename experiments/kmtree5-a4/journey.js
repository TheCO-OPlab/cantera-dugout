/* bx1: HOW A BUILD IS INTRODUCED (the core, pure; node and browser).
 *
 * A build is a team (players, roles, keywords, captain's name, bench,
 * substitutions, the opponent's build it was made to face) plus its PIECES:
 * every tactic, every link (relationship), the captain's component, and every
 * player trait and specialisation. This file:
 *
 *   1. names each piece with a key that does not depend on a match:
 *        T:<id>                       a tactic
 *        R:<id>@<first a>+<first b>   a link between two players
 *        C:<id>                       the captain's component
 *        P:<id>@<first name>          a player's trait or specialisation
 *   2. makes the build for one step of a journey: the same team with only
 *      the pieces named so far (stepBuild). Nothing a piece does is touched:
 *      a piece is either in (exactly as in the full build) or out. When every
 *      piece is in, stepBuild returns THE ORIGINAL BUILD OBJECT, so the match
 *      is the full build's match (journeycheck.js J3 proves it against s0).
 *   3. reads the journey data (journeys.json, bundled as journeys.js):
 *      the order the pieces arrive in, and the steps.
 *
 * Node: require('./journey.js'). Browser: window.KMJourney.
 * journeycheck.js --break <name> sets BREAK to show each check fails. */
(function (root) {
  'use strict';
  var BREAK = null;
  function first(n) { return String(n || '').split(' ')[0]; }
  function norm(s) { return String(s || '').replace(/ /g, ' ').toLowerCase(); }

  /* ------------------------------------------------ 1. the pieces */
  /* every piece of a build, in the build's own order (tactics, links,
   * captain, then players as the build lists them) */
  function piecesOf(b) {
    var out = [];
    if (!b) return out;
    (b.tactics || []).forEach(function (id) { out.push({ key: 'T:' + id, id: id, kind: 'tactic' }); });
    (b.relationships || []).forEach(function (r) { out.push({ key: 'R:' + r.component + '@' + first(r.a) + '+' + first(r.b), id: r.component, kind: 'link', a: first(r.a), b: first(r.b) }); });
    if (b.captain && typeof b.captain === 'object' && b.captain.component) out.push({ key: 'C:' + b.captain.component, id: b.captain.component, kind: 'captain', player: first(b.captain.name) });
    (b.players || []).forEach(function (pl) {
      (pl.traits || []).forEach(function (id) { out.push({ key: 'P:' + id + '@' + first(pl.name), id: id, kind: 'trait', player: first(pl.name) }); });
      (pl.specialisations || []).forEach(function (id) { out.push({ key: 'P:' + id + '@' + first(pl.name), id: id, kind: 'specialisation', player: first(pl.name) }); });
    });
    return out;
  }
  /* the key of one engine instance (st.fx.inst[i]), so the page can find a
   * journey piece on a card chip ("Wears them down (Oyarzabal)") */
  function instKey(x) {
    var o = x.owner || {}, id = x.def && x.def.id;
    if (o.kind === 'team') return 'T:' + id;
    if (o.kind === 'relationship') return 'R:' + id + '@' + first(o.a && o.a.name) + '+' + first(o.b && o.b.name);
    if (o.kind === 'captain') return 'C:' + id;
    return 'P:' + id + '@' + first(o.player && o.player.name);
  }
  /* key -> the engine's instance name, for this match (null when not in it) */
  function instName(st, key) {
    var fx = st && st.fx; if (!fx) return null;
    for (var i = 0; i < fx.inst.length; i++) {
      var x = fx.inst[i];
      if ((x.side || 'you') === 'you' && norm(instKey(x)) === norm(key)) return x.name;
    }
    return null;
  }
  /* a piece's name for people: "Wears them down (Oyarzabal)" */
  function label(p, getDef) {
    var d = getDef ? getDef(p.id) : null, n = d && d.name ? d.name : p.id;
    if (p.kind === 'tactic') return n + ' (tactic)';
    if (p.kind === 'link') return n + ' (' + p.a + ' and ' + p.b + ')';
    if (p.kind === 'captain') return n + ' (captain ' + p.player + ')';
    return n + ' (' + p.player + ')';
  }

  /* ------------------------------------------------ 2. one step's build */
  /* keys: the pieces that are in. Returns the original object when all are. */
  function subset(b, keys) {
    var all = piecesOf(b), want = {};
    (keys || []).forEach(function (k) { want[norm(k)] = 1; });
    var every = all.every(function (p) { return want[norm(p.key)]; });
    if (every && BREAK !== 'full') return b;
    var c = JSON.parse(JSON.stringify(b));
    function keep(k) { return !!want[norm(k)]; }
    c.tactics = (b.tactics || []).filter(function (id) { return keep('T:' + id); });
    if (b.relationships) c.relationships = b.relationships.filter(function (r) { return keep('R:' + r.component + '@' + first(r.a) + '+' + first(r.b)); }).map(function (r) { return JSON.parse(JSON.stringify(r)); });
    if (b.captain && typeof b.captain === 'object' && b.captain.component && !keep('C:' + b.captain.component)) c.captain = b.captain.name;
    c.players = (b.players || []).map(function (pl) {
      var q = JSON.parse(JSON.stringify(pl));
      if (pl.traits) q.traits = pl.traits.filter(function (id) { return keep('P:' + id + '@' + first(pl.name)); });
      if (pl.specialisations) q.specialisations = pl.specialisations.filter(function (id) { return keep('P:' + id + '@' + first(pl.name)); });
      return q;
    });
    if (BREAK === 'invalid') c.tactics = c.tactics.concat(['NO_SUCH_PIECE']);
    return c;
  }

  /* ------------------------------------------------ 3. the journey data */
  function data() {
    if (root.KMJourneys) return root.KMJourneys;
    if (typeof require === 'function') { try { return require('./journeys.json'); } catch (e) { } }
    return null;
  }
  function journeyOf(id) { var d = data(); return d && d.builds ? d.builds[id] || null : null; }
  /* the steps of a journey: cumulative piece counts. 'one' = one new piece
   * a match (his words); 'short' = at most four matches */
  function steps(j, pace) {
    if (!j) return [];
    var n = j.order.length;
    if (pace === 'short') return j.short ? j.short.slice() : shortSteps(n);
    if (j.one) return j.one.slice();   /* one new piece a match; a piece that almost never comes up rides with the one before it */
    var s = []; for (var k = 1; k <= n; k++) s.push(k);
    return s;
  }
  function shortSteps(n) {
    if (n <= 4) { var a = []; for (var k = 1; k <= n; k++) a.push(k); return a; }
    var c1 = 2, rest = n - c1, out = [c1], per = rest / 3, acc = c1;
    for (var i = 1; i <= 3; i++) { var to = c1 + Math.round(per * i); if (to > acc) { out.push(to); acc = to; } }
    if (out[out.length - 1] !== n) out.push(n);
    return out;
  }
  /* the build for step `i` (0-based) of a journey at a pace; the new pieces
   * of that step; and how many steps there are */
  function stepBuild(b, j, i, pace) {
    var s = steps(j, pace);
    if (!s.length) return { build: b, keys: [], added: [], step: 0, of: 0, full: true };
    i = Math.max(0, Math.min(s.length - 1, i | 0));
    var n = s[i], prev = i ? s[i - 1] : 0;
    var keys = j.order.slice(0, n);
    if (BREAK === 'drop' && i === s.length - 1) keys = keys.slice(1);
    var sb = subset(b, keys);
    return { build: sb, keys: keys, added: j.order.slice(prev, n), step: i, of: s.length, full: sb === b };
  }

  var API = { piecesOf: piecesOf, instKey: instKey, instName: instName, label: label, subset: subset, data: data,
    journeyOf: journeyOf, steps: steps, shortSteps: shortSteps, stepBuild: stepBuild,
    setBreak: function (b) { BREAK = b || null; }, get BREAK() { return BREAK; } };
  root.KMJourney = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
