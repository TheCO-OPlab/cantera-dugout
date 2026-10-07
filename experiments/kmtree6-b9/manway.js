/* manway.js (kmtree5 a16, stream A16, 2026-10-06): M-3, THE MAN IN THE WAY. His ruling of 10-06: "Yes: distance and the man in the way".
 *
 * WHAT IT DOES. a16's cards are made by the engine before the picture is drawn (a12's menus), so this file waits for the picture of the
 * decision to be final (the page: play.html wordsStaged; node: mw_lib.js runs the director beside the engine), READS where the director
 * has the men, and for each live pass card of yours on the menu:
 *   - the man in the way: of their outfield men (and their keeper, on a card whose duel is already with him), the one nearest the line of
 *     the pass, within 2 m plus 5 cm per metre of the pass (the first 3 m from the passer not counted: ODDS option E's lane, a14 pm.js),
 *     is the man in the duel, with his Intelligence, and a named part for how close he is: under 1 m -4, 1 to 2 m -2, further -1;
 *   - the distance: a pass longer than 20 m is -1 for every 10 m more (or part of 10), named on the card.
 * The card is then REBUILT by options.js's own builder with these two changes (options.js a16Rebuild: so every other part, the floor, the
 * steps, the words and the results follow), and takes its old place on the menu. Nothing else on the menu changes. The match's dice are
 * never touched: building cards draws nothing from them.
 *
 * WHICH CARDS (CLASS below; a16_way_check.js prints the list it saw):
 *   'ground'  a pass along the ground whose own duel is the pass (the passer's Passing against a defender): the man in the way and the length
 *   'long'    a lofted pass whose duel is still the pass (a switch, a long ball past their midfield): the length only (it goes over the men)
 *   not read  a ball over the top as a race (Pace against Pace), a long kick or a cross to a header (in the air), a shot, a dribble, a
 *             card with no duel; their attack (the picture menus of a14 were never built for it, and the ruling is about your passes)
 * Where the ball goes: to the receiver's feet; for a through ball, 6 m beyond him toward their goal (where he runs onto it).
 *
 * SWITCH: effects.js part 'way' (KM_A16_OFF=way, ?a16off=way). A16_BREAK=waynoforce: the menu keeps its cards (a16_way_check W1 must fail);
 * A16_BREAK=waynolen: no length part (W2 must fail).
 *   KMWay.stage(st, p, frame) (the page)   KMWay.apply(O, st, p, pic, X) -> { applied, cards: [{ id, label, from, to, man, d, len, parts }] }
 * Coordinates: metres, x 0..68 across, y 0..105 from your goal line to theirs (the director's and pm.js's). */
(function (root) {
  'use strict';
  var FXL = root.KMEffects || (typeof require === 'function' ? require('./effects.js') : null);
  function on() { return !!(FXL && FXL.a16 && FXL.a16('way')); }
  /* which men count (NOT ruled; DECISIONS-A16.md M-3): 'line' (default, ODDS option E exactly as a14 built it: anywhere along the pass,
   * the receiver's end included, so the man marking the receiver counts when he stands within the lane's width of him) or 'between' (only a
   * man between the passer and the receiver: his point on the line at least 2 m short of the receiver). Node KM_A16_WAY, page ?a16way= */
  var WHO = (function () {
    var v = ''; try { v = (typeof process !== 'undefined' && process.env && process.env.KM_A16_WAY) || ''; } catch (e) { }
    try { var q = /[?&]a16way=(\w+)/.exec((root.location && root.location.search) || ''); if (q) v = q[1]; } catch (e) { }
    return v === 'between' ? 'between' : 'line';
  })();
  function along(p, a, b) { var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1e-9; return ((p.x - a.x) * dx + (p.y - a.y) * dy) / L; }
  function brk() { return FXL && FXL.a16brk ? FXL.a16brk() : ''; }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : 'nobody'; }
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function segDist(p, a, b, skip) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L), t0 = Math.min(1, (skip || 0) / L);
    t = Math.max(t0, Math.min(1, t));
    return d2(p, { x: a.x + t * dx, y: a.y + t * dy });
  }
  function laneR(L) { return 2 + 0.05 * L; }
  /* which reading a card gets (null: none) */
  function classOf(o) {
    if (!o || o.disabled || o.rattled || o.noRoll || o.fixedOdds || (o.chances && o.chances.fixed)) return null;
    if (o.mineAttr !== 'passing' || !o.themAttr || o.mineVal === null || o.themVal === null || !o.actor || !o.foil) return null;
    var tg = o.tags || [];
    if (tg.indexOf('pass') < 0) return null;
    if (tg.indexOf('cross') >= 0 && tg.indexOf('low cross') < 0) return null;
    if (tg.indexOf('switch') >= 0 || tg.indexOf('long ball') >= 0) return 'long';
    return 'ground';
  }
  function through(o) { return (o.tags || []).indexOf('through ball') >= 0; }
  /* what a rebuilt card gives the card on the menu (everything about its duel; never its place or its label) */
  var TAKE = ['foil', 'themVal', 'themAttr', 'mineVal', 'mineAttr', 'edge', 'mods', 'theirMods', 'uses', 'bonus', 'because', 'chances', 'certain', 'check', 'read',
    'outcomes', 'a16Plan', 'a16Floor', 'a16Way', 'r12Best', 'r12BestFrom', 'guess', 'counterNotes', 'learned', 'duel', 'fxRec', 'fx', 'fxNote', 'multi', 'grants',
    'saysEdge', 'theirTo', 'theirGrant', 'shotBy', 'stamina', 'cost'];
  var STATS = { seen: 0, applied: 0, cards: 0, man: 0, sameMan: 0, lenOnly: 0, none: 0, skipped: {}, classes: {} };
  function skip(why) { STATS.skipped[why] = (STATS.skipped[why] || 0) + 1; return { applied: false, why: why, cards: [] }; }

  /* the reading of one card from the picture: { man, d, len, parts } or null when nothing changes */
  function readCard(o, st, pic, cls) {
    var opp = st.opp, P = pic.pos, from = P[o.actor.id], rcv = o.to || o.receiver || o.mate || null;
    if (!from || !rcv || !P[rcv.id]) return { none: 'no receiver on the picture' };
    var to = { x: P[rcv.id].x, y: P[rcv.id].y };
    if (through(o)) to = { x: to.x, y: Math.min(101, to.y + 6) };
    var L = d2(from, to), parts = [], man = null, dm = null;
    if (cls === 'ground') {
      var kp = opp.keeper, cands = opp.players.filter(function (q) { return !q.off && P[q.id]; });
      if (kp && o.foil === kp && P[kp.id]) cands.push(kp);
      var r = laneR(L), best = null;
      cands.forEach(function (q) {
        if (WHO === 'between' && along(P[q.id], from, to) > L - 2) return;
        var dd = segDist(P[q.id], from, to, 3); if (dd < r && (!best || dd < best.d)) best = { q: q, d: dd, at: along(P[q.id], from, to) / (L || 1) };
      });
      if (best) {
        man = best.q; dm = best.d;
        var n = dm < 1 ? -4 : dm < 2 ? -2 : -1;
        parts.push({ n: n, why: first(man) + ' is ' + dm.toFixed(1) + ' m from the line of the pass' + (n <= -2 ? ', so he can cut it out' : '') });
      }
    }
    var Lm = Math.round(L);
    if (Lm > 20 && brk() !== 'waynolen') parts.push({ n: -Math.ceil((Lm - 20) / 10), why: 'a long pass (' + Lm + ' m) is easier to read' });
    if (!man && !parts.length) return { none: 'nobody in the way, and a short pass' };
    return { man: man, d: dm, at: best ? best.at : null, len: Lm, parts: parts, from: from, to: to, receiver: rcv };
  }

  function apply(O, st, p, pic, X) {
    STATS.seen++;
    if (!on()) return skip('off');
    if (!p || !p.moment || !pic || !pic.pos) return skip('no picture');
    if (p.moment.sit.who !== 'you') return skip('their attack');
    if (p.a16WayDone) return skip('done');
    var arr = p.moment.options, ctx = arr && arr.a16Ctx;
    if (!ctx) return skip('no context');
    var way = {}, ids = {}, read = [];
    arr.forEach(function (o) {
      var cls = classOf(o);
      if (!cls) return;
      STATS.classes[o.id + ':' + cls] = (STATS.classes[o.id + ':' + cls] || 0) + 1;
      var rd = readCard(o, st, pic, cls);
      if (!rd || rd.none) { STATS.none++; return; }
      if (!o.a16Key) { STATS.none++; return; }
      way[o.a16Key] = { foil: rd.man || null, parts: rd.parts, d: rd.d, len: rd.len, cls: cls };
      ids[o.id] = true;
      read.push({ o: o, rd: rd, cls: cls });
    });
    p.a16WayDone = true;
    if (!read.length) return skip('nothing to read');
    if (brk() === 'waynoforce') return skip('break');
    var built = O.a16Rebuild(ctx, ids, way), out = [];
    read.forEach(function (r) {
      var o = r.o, nu = built.filter(function (q) { return q.a16Key === o.a16Key; })[0];
      if (!nu || nu.disabled) { STATS.skipped['not rebuilt'] = (STATS.skipped['not rebuilt'] || 0) + 1; return; }
      /* the card keeps its place, its object and the words the picture fitted (its label); what the duel is, its parts, odds, check,
       * read and results come from the rebuild (the page fits their words to the picture next: play.html fitStaged) */
      var was = { foil: o.foil, chances: o.chances, label: o.label };
      TAKE.forEach(function (k) { if (k in nu) o[k] = nu[k]; else delete o[k]; });
      if (was.foil && o.foil && was.foil !== o.foil) o.label = String(o.label).split(', with ' + first(was.foil) + ' trying to stop it').join(', with ' + first(o.foil) + ' trying to stop it');
      STATS.cards++;
      if (r.rd.man && r.rd.man !== was.foil) STATS.man++; else if (r.rd.man) STATS.sameMan++; else STATS.lenOnly++;
      out.push({ id: o.id, label: o.label, cls: r.cls, was: was.foil ? was.foil.id : null, man: r.rd.man ? r.rd.man.id : null, d: r.rd.d, at: r.rd.at, len: r.rd.len, parts: r.rd.parts,
        from: r.rd.from, to: r.rd.to, before: was.chances, after: o.chances });
    });
    if (!out.length) return skip('none rebuilt');
    if (O.annotate && p.iconInfo) O.annotate(arr, p.iconInfo);
    if (X && X.a16Refresh) X.a16Refresh(st, p);
    p.a16Way = out;
    STATS.applied++;
    return { applied: true, cards: out };
  }
  /* the page: the picture of the decision is final (play.html wordsStaged) */
  function stage(st, p, frame) {
    var O = root.KMOptions || (typeof require === 'function' ? require('./options.js') : null), X = root.KMMatch;
    if (!O || !frame) return false;
    return !!apply(O, st, p, { pos: frame.pos, ball: frame.ball, holder: frame.holder }, X).applied;
  }
  var API = { WHO: WHO, get ON() { return on(); }, stage: stage, apply: apply, classOf: classOf, readCard: readCard, segDist: segDist, laneR: laneR, STATS: STATS };
  root.KMWay = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
