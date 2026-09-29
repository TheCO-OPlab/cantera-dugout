/* m1: hp1's preview, carried over. Changes: requires m1's own engine files
 * (./, not ../s0/), and a lost ball's arrow ends where m1's pitch shows it
 * won (see placeOf). previewcheck.js is hp1's test.js with m1's LANDS checks.
 *
 * hp1: THE HOVER OUTCOME PREVIEW (backlog item 3; Eduardo: "Can we preview
 * potential outcomes when you hover over an option?").
 *
 *   preview(st, option)  ->  {
 *     optionId, label, disabled, who,              // whose moment it is
 *     start: {x, y, holderId, team},               // where the ball is now (pitch contract)
 *     dice: {dice, mineVal, themVal, ways: {good, mixed, bad}},   // ways out of 36
 *     outcomes: [{
 *       bands: ['good'] | ['good','mixed'] | ...,  // which dice results lead here
 *       kinds: ['clean'] | ['clean','half'] ...,   // the same, in the card's words
 *       p,                                        // exact chance, 0..1
 *       ways,                                     // the same as a count out of 36 (null without dice)
 *       effect, icon, tone,                       // the engine's effect and icon; tone g / r / n
 *       tag,                                      // goal | conceded | saved | wide | over | caught |
 *                                                 // lost | won | cleared | held | corner | freekick |
 *                                                 // throw | out | blocked | kept | forward | back |
 *                                                 // rebound | stay | sub | clock
 *       short,                                    // the engine's short words for it
 *       dest: {x, y},                             // where the ball would end (contract metres)
 *       zone,                                     // 'your box' ... 'their box', or 'the net' / 'out of play'
 *       lane,                                     // 0 left, 1 centre, 2 right (user's view)
 *       holder: {id, name, team} | null,          // who would have it (null: nobody, the ball is dead)
 *       likely                                    // true on the most likely outcome
 *     }]
 *   }
 *   previewAll(st) -> one preview per option on the pending moment's menu
 *
 * THE ODDS ARE THE ENGINE'S OWN. match.js choose rolls d1 and d2 (1 to 6)
 * and compares (mineVal + d1) - (themVal + d2) with resolve.js GOOD_BY: 4 or
 * more is the good band, 0 to 3 the mixed one, below 0 the bad one. This
 * file counts the 36 pairs with that same rule; no sampling. An option
 * without a duel (mineVal null) uses its own `chances`, which is exactly what
 * choose draws against. Each band leads to the LAST outcome listing it, as
 * in choose.
 *
 * PURE. It reads the match state and never writes it: it never calls
 * st.rng, never calls match.next or choose, and where the engine's own
 * helper would write (model.theirCarrier records who has carried the ball in
 * st.seen) it is handed a copy. test.js proves the scorecard and the RNG are
 * untouched after previewing every option of every moment.
 *
 * Runs in a browser (after the s0 engine and pitch.js) and under node. */
(function (root) {
  'use strict';
  var R = root.KMResolve || require('./resolve.js');
  var O = root.KMOptions || require('./options.js');
  var MD = root.KMModel || require('./model.js');
  var P = root.KMPitch || require('./pitch.js');
  var IC = root.KMIcons || require('./icons.js');
  var FX = root.KMEffects || require('./effects.js');
  /* m3: the director's own rule for where a lost ball is won (director.js lostWin) */
  function DR() { return root.KMDirector || require('./director.js'); }

  var W = 68, L = 105;
  /* test.js --prove only: each switch breaks one promise, so the check
   * guarding it can be seen to fail. All off in play. */
  var T = { write: false, rng: false, seen: false, goodBy: 0, holder: false, odds: false, lostBack: false, keeperOff: false, sumlabel: false };  // m7: sumlabel
  var BANDS = ['good', 'mixed', 'bad'];
  var KIND = { good: 'clean', mixed: 'half', bad: 'lose' };
  /* the user's attack zones 0..3 and their attack zones 1 (midfield),
   * 0 (the edge of your box), -1 (your box): y ranges a moment starts in
   * (the same numbers as pitch.js startOf) */
  var YOU_Y = [[21, 36], [45, 65], [74, 86], [92, 99]];
  var YOU_NAME = ['your half', 'midfield', 'the edge of their box', 'their box'];
  var THEM_Y = { '-1': [5, 13], '0': [21, 35], '1': [44, 64] };
  var THEM_NAME = { '-1': 'your box', '0': 'the edge of your box', '1': 'midfield' };
  var LANES = [[0, 22], [22, 46], [46, 68]];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : null; }

  /* ------------------------------------------------------------ the dice */
  /* count the 36 rolls exactly as match.js choose resolves them */
  function diceWays(mineVal, themVal) {
    var w = { good: 0, mixed: 0, bad: 0 };
    for (var d1 = 1; d1 <= 6; d1++) for (var d2 = 1; d2 <= 6; d2++) {
      var diff = (mineVal + d1) - (themVal + d2);
      w[diff >= R.GOOD_BY + T.goodBy ? 'good' : diff >= 0 ? 'mixed' : 'bad']++;
    }
    return w;
  }
  function bandChances(o) {
    if (o.mineVal !== null && o.mineVal !== undefined && o.themVal !== null && o.themVal !== undefined) {
      var w;
      if (o.duel) {
        var p = FX.odds(o.mineVal - o.themVal, o.duel, R);
        w = { good: p.good * 36, mixed: p.mixed * 36, bad: p.bad * 36 };
      } else {
        w = diceWays(o.mineVal, o.themVal);
      }
      return { dice: true, ways: w, p: { good: w.good / 36, mixed: w.mixed / 36, bad: w.bad / 36 } };
    }
    var ch = o.chances || { good: 0, mixed: 0, bad: 1 };
    if (T.odds) ch = { good: 0.5, mixed: 0.25 };
    return { dice: false, ways: null, p: { good: ch.good, mixed: ch.mixed, bad: Math.max(0, 1 - ch.good - ch.mixed) } };
  }
  /* which outcome a band leads to: the last one listing it (choose) */
  function pickFor(o, band) {
    var picked = null;
    (o.outcomes || []).forEach(function (x) { if ((x.bands || [x.band]).indexOf(band) >= 0) picked = x; });
    return picked;
  }

  /* ------------------------------------------------------------ who, where */
  function teamOf(st, p) { return P.teamOf(st, p); }
  function who(st, p) { return p ? { id: p.id, name: first(p), team: teamOf(st, p) } : null; }
  /* x for a man arriving in a lane: his home x, kept inside the lane */
  function laneX(st, p, lane, fallbackX) {
    var t = teamOf(st, p);
    var h = p && t ? P.homeOf(p, t, (t === 'you' ? st.squad : st.opp).formation) : null;
    var lb = LANES[lane];
    return clamp(h ? h.x : fallbackX, lb[0] + 3, lb[1] - 3);
  }
  function laneOf(st, p, fallback) {
    var t = teamOf(st, p);
    return p && t ? P.laneOf(p, t) : fallback;
  }
  /* a spot in a y range: two thirds of the way in, nudged by a hash of the
   * match and the option, so different arrows do not sit on top of each other */
  function yIn(r, j) { return r[0] + (r[1] - r[0]) * (0.35 + 0.4 * j); }

  /* legs after the choice: choose spends the option's cost before it picks
   * the man who starts your attack (model.carrierFor) */
  function legsAfter(pend, o, effect) {
    var lg = {}, src = pend.legs || { def: 100, mid: 100, att: 100 };
    for (var k in src) lg[k] = src[k];
    if (o.cost && effect !== 'rest') lg[o.cost.line] = Math.max(0, lg[o.cost.line] - o.cost.amount);
    return lg;
  }
  /* their default carrier, on a copy of the record (model.theirCarrier
   * writes into st.seen) */
  function theirCarrierPure(st, tz) {
    var seen = st.seen || null, copy = null;
    if (T.seen) return MD.theirCarrier(tz, st.opp, seen);
    if (seen) {
      var rec = seen._carriers || {}, r2 = {};
      for (var k in rec) r2[k] = rec[k];
      copy = { _carriers: r2 };
    }
    return MD.theirCarrier(tz, st.opp, copy);
  }

  /* ------------------------------------------------------------ one outcome */
  /* where the ball ends and who has it, for result x of option o. Mirrors
   * the paths of match.js choose (the chain it sets up) and options.js
   * iconOf (which reads the same data for the icon). */
  /* m3: the frozen picture the director starts the result from: the page
   * passes its own (run.pitch.pos); otherwise the same freeze the director
   * ends a play with (director.js planSegment) */
  function framePos(st, S, opts) {
    if (opts && opts.pos) return opts.pos;
    return P.freeze(st, S, P.shapeAll(st, { x: S.x, y: S.y }, S.team));
  }
  /* m3: a keeper's hands in the frozen picture, a step off his line (director.js resolve, 'catch') */
  function keeperHands(pos, k, team) {
    var q = k && pos[k.id] ? pos[k.id] : { x: 34, y: team === 'you' ? 3 : L - 3 };
    return { x: q.x, y: q.y + (team === 'you' ? 0.8 : -0.8) };
  }
  function placeOf(st, pend, o, x, ic, S, jit, pos) {
    var info = pend.iconInfo || { who: pend.moment.sit.who, pos: pend.zoneIndex };
    var you = info.who === 'you';
    var e = x.effect, end = x.end;
    var here = { x: S.x, y: S.y };
    var res = { tag: 'stay', dest: here, zone: null, lane: S.lane, holder: null };
    function at(yr, name, man, laneFallback, team) {
      if (T.holder) man = o.actor;
      var ln = man ? laneOf(st, man, laneFallback) : laneFallback;
      var xx = man ? laneX(st, man, ln, S.x) : clamp(S.x, LANES[ln][0] + 3, LANES[ln][1] - 3);
      return { dest: { x: xx, y: yIn(yr, jit) }, zone: name, lane: ln, holder: man ? who(st, man) : null };
    }
    function set(tag, r) { res = r; res.tag = tag; return res; }
    function out(tag, pt, zone, man) {
      return set(tag, { dest: { x: clamp(pt.x, 0.3, W - 0.3), y: clamp(pt.y, 0.3, L - 0.3) }, zone: zone, lane: P.laneOfX(pt.x), holder: man ? who(st, man) : null });
    }
    var theirK = st.opp.keeper, yourK = st.squad.keeper;
    var side = S.x < 34 ? -1 : 1;
    if (you) {
      if (e === 'goal') return out('goal', { x: 34 + side * 1.6, y: L - 0.2 }, 'the net', null);
      if (e === 'break') {
        /* "{foil} takes the ball and their team attacks": he has it where it was */
        var f = o.foil && teamOf(st, o.foil) === 'them' ? o.foil : null;
        /* their keeper takes it where he stands; an outfield man a few
         * metres back toward your goal, the way their attack will go */
        /* m3: exactly where d1's pitch shows the ball won, by the director's
         * own rule (director.js lostWin): their keeper where he stands, a lost
         * dribble a tackle where the man is (a stride on when it runs under
         * his foot), a pass played straight to them cut out most of the way
         * to the man who takes it. m1's arrow went 7 to 13 m ahead, p2's old
         * staging; hp1's went 7 m back (T.lostBack, kept for --prove). */
        if (T.lostBack) return out('lost', { x: S.x + (34 - S.x) * 0.2, y: S.y - 7 }, null, f);
        var tkm = /([^ .,]+) (?:takes the ball|catches it)/.exec(String(x.text || ''));
        var taker = (tkm && P.byFirst(st, tkm[1], 'them')) || f;
        if (taker) {
          var lw = DR().lostWin(st, x.text, o, { x: S.x, y: S.y }, 'you', pos, taker);
          return out('lost', lw.ball, taker === theirK ? 'their box' : null, taker);
        }
        return out('lost', { x: S.x, y: S.y }, null, f);
      }
      if (e === 'rest') return set('sub', { dest: here, zone: null, lane: S.lane, holder: who(st, st.squad.players.filter(function (q) { return q.id === S.holderId; })[0] || null) });
      if (x.caught || end === 'caught' || end === 'keeper') return out('caught', T.keeperOff ? { x: 34 + side * 1.2, y: L - 12 } : keeperHands(pos, theirK, 'them'), 'their box', theirK);  /* m3: in the keeper's hands */
      if (typeof x.move === 'number' && info.zoned && typeof ic.to === 'number') {
        var nz = ic.to;
        /* who has it next: the result's man, the option's, the man on the
         * ball (choose: picked.to || o.to || o.actor); a free kick is taken
         * by the man who stands over it */
        var man = x.to || o.to || o.actor;
        if (x.mode === 'freekick' && O.fkTaker) man = O.fkTaker(st.squad) || man;
        var r = at(YOU_Y[nz], YOU_NAME[nz], man, S.lane);
        if (x.mode === 'freekick') { r.dest.y = 80; r.dest.x = clamp(r.dest.x, 20, 48); return set('freekick', r); }
        if (x.rebound) return set('rebound', r);
        return set(nz > info.pos ? 'forward' : nz < info.pos ? 'back' : 'kept', r);
      }
      if (end === 'saved') return out('saved', T.keeperOff ? { x: 34 + side * 2, y: L - 12 } : keeperHands(pos, theirK, 'them'), 'their box', theirK);  /* m3: in the keeper's hands */
      if (end === 'wide') return out('wide', { x: 34 + side * 8.5, y: L - 0.2 }, 'out of play', null);
      if (end === 'over') return out('over', { x: 34 + side * 1.5, y: L - 0.2 }, 'out of play', null);
      if (end === 'blocked') return out('blocked', { x: 34 + side * 16, y: L - 0.2 }, 'out of play', null);
      if (end === 'throw' || end === 'out') return out(end === 'throw' ? 'throw' : 'out', { x: side < 0 ? 0.2 : W - 0.2, y: S.y + 3 }, 'out of play', null);
      if (end === 'cleared') return out('cleared', { x: S.x + side * -6, y: 55 }, 'midfield', null);
      if (end === 'kept' && (o.receiver || o.mate)) {
        var rc = o.receiver || o.mate;
        return set('kept', { dest: { x: laneX(st, rc, laneOf(st, rc, S.lane), S.x), y: S.y - 5 }, zone: null, lane: laneOf(st, rc, S.lane), holder: who(st, rc) });
      }
      if (end === 'clock' || end === 'time' || end === 'fresh' || end === 'kept') {
        return set(end === 'kept' ? 'kept' : 'clock', { dest: here, zone: null, lane: S.lane, holder: S.holderId ? who(st, byId(st, S.holderId)) : null });
      }
      return set('stay', { dest: here, zone: null, lane: S.lane, holder: null });
    }
    /* their moment: they attack down the screen */
    /* m3: when your keeper is the man who ends up with it, the arrow ends in
     * his hands where he takes it (director.js resolve stages a save there,
     * then his throw), not up the pitch where your attack starts */
    var r0 = theirSide();
    if (!T.keeperOff && r0 && r0.tag !== 'conceded' && r0.holder && yourK && r0.holder.id === yourK.id) {
      r0.dest = keeperHands(pos, yourK, 'you'); r0.lane = P.laneOfX(r0.dest.x);
    }
    return r0;
    function theirSide() {
      if (e === 'concede') return out('conceded', { x: 34 + side * 1.6, y: 0.2 }, 'the net', null);
      var tz = typeof info.tzone === 'number';
      if (x.win && tz) {
        /* you win it: your attack starts at winZone, with the man choose names */
        var wz = typeof o.winZone === 'number' ? o.winZone : 0;
        var starter = o.counterWin && o.to ? o.to : wz >= 1 && o.actor && o.actor.line === 0 ? MD.carrierFor(wz, st.squad, legsAfter(pend, o, e)) : o.actor;
        return set('won', at(YOU_Y[wz], YOU_NAME[wz], starter, S.lane));
      }
      if (typeof x.move === 'number' && info.zoned && !tz && e !== 'break') {
        /* your keeper or defender plays it out: your attack starts at `move` */
        var mz = clamp(x.move, 0, 3);
        var m2 = x.to || o.to || o.actor;
        var hr = set(/hold$/.test(o.pays || '') || x.end === 'held' ? 'held' : 'won', at(YOU_Y[mz], YOU_NAME[mz], m2, S.lane));
        if (T.keeperOff && hr.tag === 'held') hr.dest.y = 10;   /* --prove only: the arrow stops in your box */
        return hr;
      }
      /* their man on the ball after it, as choose sets up the chain */
      function inBox(man, via) {
        if (via === 'corner') return out('corner', { x: side < 0 ? 0.4 : W - 0.4, y: 0.4 }, 'your box', man);
        if (via === 'freekick' || via === 'fkcross') return out('freekick', { x: clamp(S.x, 18, 50), y: 22 }, 'the edge of your box', man);
        if (via === 'cross' || via === 'lowcross') {
          var cs = S.lane === 1 ? side : (S.lane === 0 ? -1 : 1);
          return out('forward', { x: cs < 0 ? 6 : W - 6, y: 12 }, 'your box', man);
        }
        var rb = at(THEM_Y['-1'], 'your box', man, S.lane);
        if (via === 'alone') rb.dest.y = 11;
        return set('forward', rb);
      }
      if (tz && typeof x.tmove === 'number') {
        /* THEIR ATTACK BY ZONES: the result's man, or the option's when they
         * go forward, or their default carrier when you push them back */
        var tm = x.theirTo || (x.tmove > 0 ? (o.theirTo || o.foil) : theirCarrierPure(st, 0));
        var ntz = info.tzone + x.tmove;
        if (ntz >= 2) return inBox(tm, x.via || o.via || pend.via || 'box');
        var p2 = ntz === 0 ? 1 : 0;
        return set(p2 < info.pos ? 'forward' : p2 > info.pos ? 'back' : 'stay', at(THEM_Y[String(p2)], THEM_NAME[String(p2)], tm, S.lane));
      }
      if (info.pos === -1 && x.tmove === -1) {
        /* a half clearance in your box: back to the edge of your box */
        return set('back', at(THEM_Y['0'], THEM_NAME['0'], o.theirTo || o.foil, S.lane));
      }
      if (info.pos === -1 && x.tmove === 0 && x.via) {
        /* a corner, a header on goal, or a rebound after your keeper's save */
        var man0 = x.via === 'box' ? (x.theirTo || o.theirTo || o.foil) : o.foil;
        if (x.via === 'box') return set('rebound', at(THEM_Y['-1'], 'your box', man0, S.lane));
        if (x.via === 'header') return set('stay', { dest: { x: clamp(S.x, 26, 42), y: 7 }, zone: 'your box', lane: 1, holder: who(st, man0) });
        return inBox(man0, x.via);
      }
      if (x.via === 'corner' || x.via === 'freekick' || x.via === 'fkcross') return inBox(o.foil, x.via);
      if (e === 'break' || x.into) return set('forward', at(THEM_Y['-1'], 'your box', o.foil, S.lane));
      if (end === 'won' || end === 'stop') return set('won', { dest: { x: S.x, y: S.y + 1.5 }, zone: null, lane: S.lane, holder: who(st, o.actor && teamOf(st, o.actor) === 'you' ? o.actor : null) });
      if (end === 'held') return out('held', T.keeperOff ? { x: 34, y: 14 } : keeperHands(pos, yourK, 'you'), 'your box', yourK);  /* m3: in your keeper's hands */
      if (end === 'clear') return out('cleared', { x: S.x + side * -8, y: 52 }, 'midfield', null);
      if (end === 'back') return set('back', { dest: { x: S.x, y: Math.min(L - 30, S.y + 16) }, zone: null, lane: S.lane, holder: who(st, o.foil) });
      if (end === 'foul') return out('freekick', { x: S.x, y: S.y }, null, o.foil);
      if (end === 'wide') return out('wide', { x: 34 + side * 8.5, y: 0.2 }, 'out of play', null);
      if (end === 'over') return out('over', { x: 34 + side * 1.5, y: 0.2 }, 'out of play', null);
      if (end === 'throw' || end === 'out') return out(end === 'throw' ? 'throw' : 'out', { x: side < 0 ? 0.2 : W - 0.2, y: S.y - 3 }, 'out of play', null);
      if (end === 'clock' || end === 'time' || end === 'fresh') return set('clock', { dest: here, zone: null, lane: S.lane, holder: null });
      if (e === 'stopped') return set('won', { dest: { x: S.x, y: S.y + 1.5 }, zone: null, lane: S.lane, holder: who(st, o.actor) });
      return set('stay', { dest: here, zone: null, lane: S.lane, holder: null });
    }
  }
  function byId(st, id) { return P.byId(st, id); }
  /* the contract's zone for a y (GOALS.md) */
  function zoneNameOf(y) {
    return y < 16.5 ? 'your box' : y < 40 ? 'your half' : y < 70 ? 'midfield' : y < 88.5 ? 'the edge of their box' : 'their box';
  }

  /* ------------------------------------------------------------ the preview */
  function preview(st, o, opts) {
    opts = opts || {};
    var pend = st.pending;
    if (!pend || !o) return null;
    if (T.rng) st.rng.next();
    if (T.write) pend.previewed = (pend.previewed || 0) + 1;
    var S = opts.start || P.startOf(st, pend);
    var pos = framePos(st, S, opts);
    var bc = bandChances(o);
    /* group the bands by the outcome they lead to */
    var groups = [];
    BANDS.forEach(function (b) {
      var pb = bc.p[b];
      if (!(pb > 0)) return;
      var x = pickFor(o, b);
      var g = groups.filter(function (q) { return q.x === x; })[0];
      if (!g) { g = { x: x, bands: [], p: 0, ways: bc.dice ? 0 : null }; groups.push(g); }
      g.bands.push(b); g.p += pb; if (bc.dice) g.ways += bc.ways[b];
    });
    var info = pend.iconInfo || { who: pend.moment.sit.who, pos: pend.zoneIndex, zoned: typeof pend.zoneIndex === 'number' };
    var outs = groups.map(function (g, i) {
      var x = g.x || { effect: 'nothing', text: o.label + '.' };
      var ic = O.iconOf(x, o, info);
      var icon = x.icon || ic.icon;
      var jit = P.hash01(st.seed, pend.index, pend.step || 1, o.id, i);
      var pl = placeOf(st, pend, o, x, ic, S, jit, pos);
      return {
        src: g.x && o.outcomes ? [o.outcomes.indexOf(g.x)].filter(function (j) { return j >= 0; }) : [],  // m7: the card's rows this arrow stands for
        bands: g.bands, kinds: g.bands.map(function (b) { return KIND[b]; }), p: g.p, ways: g.ways,
        effect: x.effect, icon: icon, tone: IC.TONE[icon] || 'n', tag: pl.tag,
        short: x.shortBase || x.short || x.text || '',
        edgeShort: x.short || '',  // col: the edge it carries, for the display kind (icons.js kindOf)
        dest: { x: +pl.dest.x.toFixed(2), y: +pl.dest.y.toFixed(2) },
        zone: pl.zone || zoneNameOf(pl.dest.y), lane: pl.lane, holder: pl.holder, likely: false
      };
    });
    /* merge results that land in the same place with the same man and icon
     * (a half win and a clean win that both move the ball on): one arrow */
    var merged = [];
    outs.forEach(function (a) {
      var m = merged.filter(function (b) {
        return b.icon === a.icon && b.tag === a.tag && (b.holder && b.holder.id) === (a.holder && a.holder.id) &&
          Math.abs(b.dest.x - a.dest.x) < 6 && Math.abs(b.dest.y - a.dest.y) < 6;
      })[0];
      if (!m) { merged.push(a); return; }
      m.bands = m.bands.concat(a.bands); m.kinds = m.kinds.concat(a.kinds); m.p += a.p; m.src = m.src.concat(a.src);  // m7: src
      if (m.ways !== null) m.ways += a.ways;
    });
    var best = null;
    merged.forEach(function (a) { if (!best || a.p > best.p + 1e-12) best = a; });
    if (best) best.likely = true;
    return {
      optionId: o.id, label: o.label, disabled: !!o.disabled, who: info.who,
      start: { x: S.x, y: S.y, holderId: S.holderId, team: S.team },
      dice: { dice: bc.dice, mineVal: bc.dice ? o.mineVal : null, themVal: bc.dice ? o.themVal : null, ways: bc.ways, p: bc.p },
      outcomes: merged
    };
  }
  function previewAll(st, opts) {
    if (!st.pending) return [];
    var S = P.startOf(st, st.pending);
    var pos = framePos(st, S, opts);
    return st.pending.moment.options.map(function (o) { var q = { start: S, pos: pos }; for (var k in (opts || {})) q[k] = opts[k]; return preview(st, o, q); });
  }
  /* the three bands for the card's odds bar, in order clean / half / lose,
   * each with the icon and tone of the outcome it leads to */
  function bar(pv, o) {
    return BANDS.map(function (b) {
      var p = pv.dice.p[b];
      var a = pv.outcomes.filter(function (q) { return q.bands.indexOf(b) >= 0; })[0] || null;
      return { band: b, kind: KIND[b], p: p, ways: pv.dice.ways ? pv.dice.ways[b] : null, icon: a ? a.icon : null, tone: a ? a.tone : 'n', short: a ? a.short : '' };
    });
  }

  /* m7: THE ARROWS' NUMBERS ARE THE CARD'S. An arrow can stand for several
   * of the card's results (two that land in the same place with the same man
   * and icon are one arrow), and the card prints each result's own whole
   * percent (the lean card adds up results that read the same). The label
   * gives the card's numbers for the results it stands for, "97% + 3%", so
   * the pitch and the card never disagree; one result, one number.
   *   labels(pv, o, { pct, key }) -> [{ text, parts: [whole %] }] per pv.outcomes
   *   pct(list of p) -> whole percents (the page's wholePercents);
   *   key(x) -> the card's row key (the lean card: display kind | words), or
   *   null for one row per result (the full card).
   * A card row whose results go to two arrows is split by result (each part
   * then is a number the full card prints). tamper.sumlabel: m6's label, the
   * arrow's merged chance. */
  function wholePct(ps) {
    var raw = ps.map(function (p) { return p * 100; }), out = raw.map(Math.floor);
    var left = 100 - out.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; }).sort(function (a, b) { return b.f - a.f; })
      .slice(0, Math.max(0, left)).forEach(function (q) { out[q.i]++; });
    return out;
  }
  function labels(pv, o, opts) {
    opts = opts || {};
    var outs = (pv && pv.outcomes) || [], list = (o && o.outcomes) || [];
    var pct = opts.pct || wholePct, key = opts.key || null;
    var mergedPc = wholePct(outs.map(function (q) { return q.p; }));
    if (T.sumlabel || !list.length) return outs.map(function (q, k) { return { text: mergedPc[k] + '%', parts: [mergedPc[k]] }; });
    var shown = pct(list.map(function (x) { return x.p; }));
    /* the card's rows: result indexes that print as one line */
    var rowOf = [], rows = [];
    list.forEach(function (x, j) {
      var kk = key ? key(x) : null, r = kk != null ? rows.filter(function (q) { return q.key === kk; })[0] : null;
      if (!r) { r = { key: kk != null ? kk : '#' + j, idx: [], pc: 0 }; rows.push(r); }
      r.idx.push(j); r.pc += shown[j]; rowOf[j] = r;
    });
    return outs.map(function (q, k) {
      var src = q.src || [];
      if (!src.length) return { text: mergedPc[k] + '%', parts: [mergedPc[k]] };
      var parts = [], seen = [];
      src.forEach(function (j) {
        var r = rowOf[j]; if (!r || seen.indexOf(r) >= 0) return;
        var inHere = r.idx.filter(function (i) { return src.indexOf(i) >= 0; });
        if (inHere.length === r.idx.length) { seen.push(r); parts.push(r.pc); }
        else parts.push(shown[j]);
      });
      parts.sort(function (a, b) { return b - a; });
      return { text: parts.map(function (n) { return n + '%'; }).join(' + '), parts: parts };
    });
  }

  var API = { labels: labels, wholePct: wholePct, tamper: T, theirCarrierPure: theirCarrierPure, preview: preview, previewAll: previewAll, bar: bar, diceWays: diceWays, bandChances: bandChances, pickFor: pickFor, KIND: KIND, zoneNameOf: zoneNameOf, YOU_Y: YOU_Y, THEM_Y: THEM_Y };
  root.KMPreview = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
