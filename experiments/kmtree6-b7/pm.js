/* pm.js (kmtree5 a14, stream PICMENU1, 2026-10-05): THE PICTURE MENU. Eduardo's ruling of 10-05 (MENUC-1: "build it for real").
 *
 * WHAT IT DOES. The picture places the 22 men first (today's director positions at the decision, unchanged). Then this
 * file READS those positions and decides which cards exist at the decision: a pass into space exists when a team-mate
 * can reach a spot before any defender; a double-up exists when a second man can reach the man on the ball; and so on.
 * About twenty hand-written KINDS of card (their words, stats and results are written once, in this file and in
 * options.js's results table); the positions decide which kinds exist and WHO they name; the squad's stats set the
 * odds exactly as today (the card is built by options.js's own builder, so a build's pieces and an opponent's effects
 * still change it). Named parts from the men standing near add to the duel (the team-mates and the opponents who
 * close the options out), each written on the card with its reason. PICMENU-DESIGN.md has the full table.
 *
 * WHERE IT RUNS. The page (play.html wordsStaged calls KMPM.stage after the picture is final) and node (pm_sim.js
 * runs the director beside the engine). It only REPLACES the menu of a pending decision; the engine, the dice and the
 * results table are today's. Decisions it does not cover keep today's menu: free kicks and other modes, the keeper's
 * ball, the box (the last decision of their attack), their keyword moments, an attack for show.
 *
 * SWITCH (ON by default in a14): node KM_PM=off (or none), page ?pm=off. KM_PM_OFF=<kind,kind> / ?pmoff=<kind> turns
 * single kinds off (for the checks). KM_PM_BREAK=<name> breaks one existence rule on purpose, to show pm_check.js
 * fails without it (names: nolane, nofree, noreach, noflip, nowide, noclose).
 *
 *   KMPM.apply(O, st, p, pic) -> { applied: bool, why, cards, cands, facts }   pic = { pos: {id: {x,y}}, ball: {x,y}, holder }
 *   KMPM.scene(ctx, pic), KMPM.candidates(ctx, S), KMPM.keep(O, built, ctx), KMPM.ON, KMPM.verify (independent checker lives in pm_check.js)
 * Coordinates: metres, x 0..68 across, y 0..105 from your goal line to theirs (the page's and the director's). */
(function (root) {
  'use strict';
  var GOAL = { x: 34, y: 105 }, POSTS = [30.34, 37.66];
  var ENV = (typeof process !== 'undefined' && process.env) ? process.env : {};
  var SEARCH = (root.location && root.location.search) || '';
  function flag(env, q) { var m = new RegExp('[?&]' + q + '=([\\w,]+)').exec(SEARCH); return m ? m[1] : (ENV[env] || ''); }
  var PMV = flag('KM_PM', 'pm'), ON = !/^(off|none|0)$/.test(PMV);
  var OFFK = {}; flag('KM_PM_OFF', 'pmoff').split(',').forEach(function (k) { if (k) OFFK[k] = true; });
  var SIDE = flag('KM_PM_SIDE', 'pmside');   /* 'you' or 'them': the picture menu on that side only (measuring where a change comes from) */
  var DRY = !!flag('KM_PM_DRY', 'pmdry');   /* build the picture menu but leave today's in place (pm_check.js: building must not change the match) */
  var NOPARTS = !!flag('KM_PM_NOPARTS', 'pmnoparts');   /* (measuring only: the named parts of positions left off) */
  var BIAS = +flag('KM_PM_BIAS', 'pmbias') || 0;   /* (measuring only, default 0: a flat part added to every card of your attack the picture menu makes, to say how big a correction would bring Cups won back; never on in a build) */
  var BRK = {}; flag('KM_PM_BREAK', 'pmbreak').split(',').forEach(function (k) { if (k) BRK[k] = true; });
  /* stream PICMENU2 (his PM-3: "The picture should make those too", "make sure that keywords or pairs of cards don't stop
   * triggering because of the picture"): the keyword and pair cards are made from where the named men stand. ON by default
   * in a14; node KM_PM_KW=off, page ?pmkw=off = PICMENU1's a14 exactly (pm2_same.js). KM_PM_KWSLOT=off / ?pmkwslot=off:
   * the keep rule without the keyword card's own place (measuring only). */
  var KWON = !/^(off|none|0)$/.test(flag('KM_PM_KW', 'pmkw'));
  var KWSLOT = KWON && !/^(off|none|0)$/.test(flag('KM_PM_KWSLOT', 'pmkwslot'));
  /* KM_PM_KWRUN=off / ?pmkwrun=off: a keyword man who is not yet where his card works never gets the card. ON (default): he
   * may make the run there when he gets to the spot no later than 0.8 s after the first of theirs, and the card says the run
   * (Spain's Crossers are full-backs the picture keeps 35 to 65 m from goal; see DECISIONS-PICMENU2.md). */
  var KWRUN = KWON && !/^(off|none|0)$/.test(flag('KM_PM_KWRUN', 'pmkwrun'));
  /* the odds options of review/odds-10-05 (his calls ODDS-1..4, open): ALL OFF by default. Node KM_ODDS=e (and a5, a10, f,
   * read by options.js and match.js), page ?odds=e. E here: the man nearest the line of a pass is the man in the duel. */
  var ODDS_E = /(^|,)e(,|$)/.test(flag('KM_ODDS', 'odds'));

  /* ------------------------------------------------------------------ geometry */
  function first(p) { return p ? String(p.name).split(' ')[0] : 'nobody'; }
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function segDist(p, a, b, skip) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L), t0 = Math.min(1, (skip || 0) / L);
    t = Math.max(t0, Math.min(1, t));
    return d2(p, { x: a.x + t * dx, y: a.y + t * dy });
  }
  function inTri(p, a, b, c, m) {
    function sgn(p1, p2, p3) { return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y); }
    var s1 = sgn(p, a, b), s2 = sgn(p, b, c), s3 = sgn(p, c, a);
    if (!((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0))) return true;
    return segDist(p, a, b) <= m || segDist(p, b, c) <= m || segDist(p, c, a) <= m;
  }
  function inBox(q) { return q.y >= 88.5 && q.x >= 13.84 && q.x <= 54.16; }
  function sideWord(x) { return x < 22 ? 'left' : x < 46 ? 'middle' : 'right'; }
  function laneTrue(L) { return 2 + 0.05 * L; }   /* (what a claim says; the checker reads this radius, never the break's) */
  function laneR(L) { return BRK.nolane ? 0 : laneTrue(L); }
  function m0(x) { return Math.round(x); }

  /* the picture, turned so the side with the ball always attacks up (y toward 105) */
  function scene(ctx, pic) {
    var who = ctx.sit.who, attSq = who === 'you' ? ctx.squad : ctx.opp, defSq = who === 'you' ? ctx.opp : ctx.squad;
    function N(q) { return who === 'you' ? { x: q.x, y: q.y } : { x: 68 - q.x, y: 105 - q.y }; }
    function men(sq) {
      var out = [];
      if (sq.keeper && pic.pos[sq.keeper.id]) out.push({ p: sq.keeper, k: true, at: N(pic.pos[sq.keeper.id]) });
      sq.players.forEach(function (p) { if (!p.off && pic.pos[p.id]) out.push({ p: p, k: false, at: N(pic.pos[p.id]) }); });
      return out;
    }
    var att = men(attSq), def = men(defSq), ball = N(pic.ball);
    var car = att.filter(function (m) { return m.p.id === pic.holder; })[0] || null;
    var defOut = def.filter(function (m) { return !m.k; }), attOut = att.filter(function (m) { return !m.k; });
    var lineY = defOut.length ? Math.max.apply(null, defOut.map(function (m) { return m.at.y; })) : 70;
    var S = { who: who, att: att, def: def, defOut: defOut, attOut: attOut, car: car, ball: ball, lineY: lineY, N: N, A: ctx.A };
    S.stat = function (m, k) { return ctx.A.eff(m.p, k, 100); };
    S.v = function (m) { return 5.2 + 0.13 * S.stat(m, 'pace'); };   /* metres a second, from Pace */
    return S;
  }
  function nearest(list, q, not) { var b = null, bd = 1e9; list.forEach(function (m) { if (not && not.indexOf(m) >= 0) return; var d = d2(m.at, q); if (d < bd) { bd = d; b = m; } }); return b ? { m: b, d: bd } : null; }
  function laneBlockers(S, a, b, list) {
    var L = d2(a, b), r = laneR(L);
    return (list || S.def).filter(function (m) { return segDist(m.at, a, b, 3) < r; });
  }
  function inFront(S, from) {
    return S.defOut.filter(function (m) { var dy = m.at.y - from.y, dx = Math.abs(m.at.x - from.x); return dy > 0 && dy <= 10 && dx <= 0.6 * dy + 2; });
  }
  function shotBlockers(S, from) {
    var a = { x: POSTS[0], y: 105 }, b = { x: POSTS[1], y: 105 };
    return S.defOut.filter(function (m) { return m.at.y > from.y - 0.5 && inTri(m.at, from, a, b, 1); });
  }
  function freeOf(S, m, list) { var n = nearest(list || S.defOut, m.at); return n ? n.d : 99; }
  function wide(x) { return Math.min(x, 68 - x); }   /* metres from the nearer touchline */

  /* ------------------------------------------------------------------ the kinds (YOUR ATTACK) */
  /* part(n, why): a named part on the duel (the card prints it with its reason; options.js sums it into the odds) */
  function part(parts, n, why) { if (n) parts.push({ n: n, why: why }); }
  function capParts(parts, lo, hi) {
    var s = 0; parts.forEach(function (q) { s += q.n; });
    if (s < lo) { var k = lo - s; for (var i = parts.length - 1; i >= 0 && k > 0; i--) { if (parts[i].n < 0) { var t = Math.min(k, -parts[i].n); parts[i] = { n: parts[i].n + t, why: parts[i].why }; k -= t; } } }
    return parts.filter(function (q) { return q.n; });
  }

  /* A ball played into SPACE for a team-mate to run onto. The team-mate R runs to a spot P; P is a kind of pass:
   * 'space' (P in front of their last man: the ball goes a zone on) or 'through' (P behind their last man: it goes two).
   * It exists when R can get to P before any defender, or nearly (within 0.8 s), with at most two defenders (one for
   * a through ball) able to contest it and at most one who could cut the ball on its way. */
  function spotCards(ctx, S, add) {
    var c = S.car, cp = c.p, found = { space: [], through: [] };
    S.attOut.forEach(function (R) {
      if (R === c) return;
      if (R.at.y > S.lineY + 0.5 && !BRK.nooffside) return;                  /* he would be offside when the ball is played */
      var L = d2(c.at, R.at); if (L < 6 || L > 42) return;
      var vR = S.v(R), best = null;
      [[0, 1], [0.6, 0.8], [-0.6, 0.8], [0.85, 0.5], [-0.85, 0.5]].forEach(function (dir) {
        [6, 10].forEach(function (rn) {
          var P = { x: R.at.x + dir[0] * rn, y: R.at.y + dir[1] * rn };
          if (P.x < 3 || P.x > 65 || P.y > 101 || P.y < c.at.y + 3) return;
          var tR = d2(R.at, P) / vR, tb = 0.35 + d2(c.at, P) / 19, cut = laneBlockers(S, c.at, P);
          var keeperNear = S.def.some(function (m) { return m.k && d2(m.at, P) < 7; });
          if (keeperNear) return;
          var tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
          var cont = tds.filter(function (x) { return x.t <= Math.max(tR, tb) + 0.5; });
          var margin = tds[0].t - tR, kind = P.y > S.lineY + 1 ? 'through' : 'space';
          if (kind === 'space' && P.y > S.lineY + 1) return;
          if (cut.length >= 2 || cont.length > (kind === 'through' ? 2 : 3) || (margin < -0.8 && !BRK.noreach)) return;
          var sc = margin - 0.3 * cont.length - 0.3 * cut.length + 0.02 * (P.y - c.at.y);
          if (!best || sc > best.sc) best = { P: P, tR: tR, tb: tb, cut: cut, cont: cont, tds: tds, margin: margin, kind: kind, sc: sc };
        });
      });
      if (best) found[best.kind].push({ R: R, b: best, L: L });
    });
    ['space', 'through'].forEach(function (kind) {
      found[kind].sort(function (a, b) { return b.b.sc - a.b.sc; });
      found[kind].slice(0, 2).forEach(function (f) {
        var R = f.R, B = f.b, foil = B.tds[0].m, P = B.P, parts = [];
        var dp = S.stat(R, 'pace') - S.stat(foil, 'pace'), n = clamp(Math.round(dp / 3), -2, 2);
        part(parts, n, first(R.p) + (n > 0 ? ' is quicker than ' : ' is slower than ') + first(foil.p) + ' (Pace ' + m0(S.stat(R, 'pace')) + ' against ' + m0(S.stat(foil, 'pace')) + ')');
        B.cont.slice(1).forEach(function (x, i) { part(parts, i === 0 ? -2 : -1, first(x.m.p) + ' can also get to the ball (' + m0(d2(x.m.at, P)) + ' m from where it lands)'); });
        if (B.cut.length && !ODDS_E) part(parts, -1, first(B.cut[0].p) + ' is ' + segDist(B.cut[0].at, c.at, P, 3).toFixed(1) + ' m from the line of the pass');
        var sup = nearest(S.attOut, P, [c, R]);
        if (sup && sup.d <= 12 && sup.m.at.y <= S.lineY + 0.5) part(parts, 1, first(sup.m.p) + ' is ' + m0(sup.d) + ' m from where it lands, to help');
        parts = capParts(parts, -4, 3);
        var m = m0(f.L), through = kind === 'through';
        /* (a14 PICMENU2, odds option E, off by default: the man in the way of the pass is the man in the duel; its parts are not capped) */
        var foil0 = foil, eE = laneE(S, c.at, P, B.cut, m); if (eE) { if (eE.foil) foil = eE.foil; parts = parts.concat(eE.parts); }
        var contNames = B.cont.slice(0, 2).map(function (x) { return first(x.m.p); }).join(' and ');
        var claims = [{ t: 'reach', man: R.p.id, spot: P, before: foil0.p.id, within: 0.8 }, { t: 'onside', man: R.p.id }];
        if (!B.cut.length) claims.push({ t: 'lane', a: c.at, b: P, r: laneTrue(d2(c.at, P)) }); else if (eE && eE.foil) claims.push({ t: 'onLine', man: foil.p.id, a: c.at, b: P, r: laneTrue(d2(c.at, P)) });
        add({ kind: kind === 'space' ? 'space pass' : 'through ball', id: through ? 'Z_THROUGH' : 'Z_PASS_MID', man: R.p, free: B.cont.length === 0, freeM: nearest(S.defOut, R.at).d, lane: [c.at, P], spot: P, runFrom: R.at, oddsE: !!eE,
          why: first(R.p) + ' can reach the spot (' + m0(d2(R.at, P)) + ' m) ' + (B.margin >= 0 ? m0(B.margin * 10) / 10 + ' s before ' : 'within ' + Math.abs(m0(B.margin * 10) / 10) + ' s of ') + first(foil.p) + (B.cont.length > 1 ? '; ' + contNames + ' can contest it' : ''),
          claims: claims, foilMan: foil.p,
          b: { test: { mine: cp, mineAttr: 'passing', theirs: foil.p, theirsAttr: 'intelligence' }, risk: through ? 'high' : 'even', bonus: 0, parts: parts, to: R.p,
            grants: through ? { good: [{ id: 'through', man: R.p }] } : undefined,
            cStage: through ? { through: R.p.id, past: foil.p.id } : undefined,
            pays: through ? 'through' : 'probe',
            does: through ? { good: 'puts ' + first(R.p) + ' through past {foil}', mixed: 'plays it a little too far ahead of ' + first(R.p), bad: 'plays it straight to {foil}' }
              : { good: 'plays it into the space for ' + first(R.p) + ', clear of {foil}', mixed: 'plays it into the space, but {foil} is there too', bad: 'plays it straight to {foil}' },
            label: first(cp) + (through ? ' plays the ball through for ' + first(R.p) + ' to run onto (' + m + ' m)' : ' passes it into the space for ' + first(R.p) + ' to run onto (' + m + ' m)') + ', ' + (B.cont.length > 1 ? first(B.cont[0].m.p) + ' and ' + first(B.cont[1].m.p) + ' can dispute it' : B.cont.length ? first(B.cont[0].m.p) + ' can dispute it' : 'nobody can get there first'),
            read: first(cp) + ' (Passing ' + m0(S.stat(S.car, 'passing')) + ') against ' + first(foil.p) + ' (Intelligence ' + m0(S.stat(foil, 'intelligence')) + '), ' + (eE && eE.foil ? 'the man in the way of the pass. ' : 'the defender who can reach the ball first. ') + first(R.p) + ' has to run ' + m0(d2(R.at, P)) + ' m to it. The parts below are the race and the men near it.' } });
      });
    });
  }

  /* A pass to feet on an open lane (no defender within 2 m + 5 in 100 of its length, the first 3 m not counted) */
  function safePassCards(ctx, S, add) {
    var c = S.car, cp = c.p, z = ctx.zone;
    S.att.forEach(function (t) {
      if (t === c || t.k) return;
      var L = d2(c.at, t.at); if (L < 5 || L > 45) return;
      if (laneBlockers(S, c.at, t.at).length) return;
      var mk = nearest(S.defOut, t.at), free = mk ? mk.d : 99, dy = t.at.y - c.at.y, dx = Math.abs(t.at.x - c.at.x), m = m0(L);
      var lf = null, bd = 1e9; S.defOut.forEach(function (q) { var d = segDist(q.at, c.at, t.at, 3); if (d < bd) { bd = d; lf = q; } });
      var foil = (mk && mk.d < bd) ? mk.m : lf;
      if (!foil) return;
      var kind, id, label, does, pays, mineAttr = 'passing', theirsAttr = 'intelligence', because;
      var beyond = t.at.y > S.lineY + 1;
      if (z >= 3) {
        if (inBox(t.at) && dy > -6) {   /* across the goal: the keeper has to come for it */
          var kp = ctx.keeper || (S.def.filter(function (q) { return q.k; })[0] || {}).p; if (!kp) return;
          kind = 'square ball'; id = 'Z_SQUARE'; pays = 'square'; foil = { p: kp, at: S.def.filter(function (q) { return q.k; })[0].at }; theirsAttr = 'intelligence';
          label = first(cp) + ' passes it across the goal for ' + first(t.p) + ' (' + m + ' m)';
          does = { good: 'passes it across the goal past {foil}', mixed: 'passes it across the goal', bad: 'passes it across the goal' };
        } else return;
      } else if (beyond) return;   /* a pass to a man past their line is a through ball (spotCards), not a pass to feet */
      else if (dy >= 8 && dx >= 22 && L >= 25) {
        kind = 'switch'; id = 'Z_SWITCH'; pays = 'probe'; mineAttr = 'technique';
        label = first(cp) + ' switches it to ' + first(t.p) + ' (' + m + ' m) on the ' + sideWord(t.at.x);
        does = { good: 'takes the long pass before {foil} is across', mixed: 'takes the long pass, but {foil} is already there', bad: 'lets it run under his foot to {foil}' };
        because = free >= 5 ? 'nobody is within 5 m of ' + first(t.p) : undefined;
      } else if (dy >= 8) {
        kind = 'pass forward'; id = 'Z_PASS_MID'; pays = 'probe';
        label = first(cp) + ' passes it forward to ' + first(t.p) + ' (' + m + ' m)';
        does = { good: 'plays it past {foil} to ' + first(t.p), mixed: 'cannot find a way past {foil}', bad: 'plays it straight to {foil}' };
        because = free >= 5 ? 'nobody is within 5 m of ' + first(t.p) : undefined;
      } else if (dy <= -8) {
        kind = 'pass back'; id = 'Z_RECYCLE'; pays = 'back'; mineAttr = 'technique'; because = 'a pass backwards is easier than a pass forward';
        label = first(cp) + ' passes it back to ' + first(t.p) + ' (' + m + ' m)';
        does = { good: 'passes it back to ' + first(t.p), mixed: 'passes it back to ' + first(t.p) + ', a little too hard', bad: 'plays it straight to {foil}' };
      } else {
        kind = 'pass sideways'; id = 'Z_LAYOFF'; pays = 'hold'; theirsAttr = 'pace'; because = 'it is a short pass to a teammate nearby';
        label = first(cp) + ' gives it to ' + first(t.p) + ' (' + m + ' m), level with him';
        does = { good: 'gives it to ' + first(t.p), mixed: 'gives it to ' + first(t.p) + ', a little behind him', bad: 'plays it straight to {foil}' };
      }
      var bonus, parts = [];
      if (id === 'Z_PASS_MID' || id === 'Z_SWITCH') bonus = free >= 5 ? 2 : 0;
      if (id === 'Z_SQUARE') bonus = 0;
      if (id === 'Z_SQUARE') { var kdef = S.def.filter(function (q) { return q.k; })[0]; if (kdef && d2(kdef.at, t.at) < 6) part(parts, -1, first(kdef.p) + ' is only ' + m0(d2(kdef.at, t.at)) + ' m from ' + first(t.p)); }
      var eS = laneE(S, c.at, t.at, null, m); if (eS) parts = parts.concat(eS.parts);   /* (a14 PICMENU2, odds option E: a long pass, off by default) */
      add({ kind: kind, id: id, man: t.p, free: free >= 5, freeM: free, lane: [c.at, t.at], foilMan: foil.p, oddsE: !!eS,
        why: 'open lane: nobody within ' + laneR(L).toFixed(1) + ' m of the line; ' + (free >= 5 ? first(t.p) + ' is free (nearest opponent ' + free.toFixed(1) + ' m)' : first(t.p) + ' has ' + first(mk.m.p) + ' ' + free.toFixed(1) + ' m away'),
        claims: [{ t: 'lane', a: c.at, b: t.at, r: laneTrue(L) }].concat(free >= 5 ? [{ t: 'free', man: t.p.id, atLeast: 5 }] : []),
        b: { test: { mine: cp, mineAttr: mineAttr, theirs: foil.p, theirsAttr: theirsAttr }, risk: id === 'Z_SQUARE' ? 'even' : 'low', bonus: bonus, because: because, parts: parts.length ? parts : undefined, to: t.p, mate: id === 'Z_SQUARE' ? t.p : undefined, pays: pays,
          cStage: id === 'Z_RECYCLE' ? { back: true } : undefined,
          does: does, label: label,
          read: first(cp) + ' (' + (mineAttr === 'technique' ? 'Technique ' : 'Passing ') + m0(S.stat(S.car, mineAttr)) + ') against ' + first(foil.p) + ' (' + (theirsAttr === 'pace' ? 'Pace ' : 'Intelligence ') + m0(S.stat(foil, theirsAttr)) + '), the opponent nearest the pass.' } });
    });
  }

  /* The pass for the overlapping man: a team-mate level with or behind the man on the ball, out wide on his side, with
   * a defender pinned to the man on the ball (so the outside is open) and a run down the outside that nobody gets to first. */
  function overlapCards(ctx, S, add) {
    var c = S.car, cp = c.p;
    if (ctx.zone < 1 || ctx.zone > 2 || wide(c.at.x) > 30) return;
    var pin = nearest(S.defOut, c.at);
    S.attOut.forEach(function (R) {
      if (R === c) return;
      var sideC = c.at.x < 34 ? -1 : 1, sideR = R.at.x < 34 ? -1 : 1;
      if (sideC !== sideR && !BRK.noflip) return;
      if (wide(R.at.x) > 14 || Math.abs(R.at.x - c.at.x) > 26) return;
      if (R.at.y < c.at.y - 14 || R.at.y > c.at.y + 4) return;
      if (wide(R.at.x) > wide(c.at.x) - 2 && !BRK.nowide) return;           /* he is outside the man on the ball */
      var L = d2(c.at, R.at); if (L < 5) return;
      if (laneBlockers(S, c.at, R.at).length) return;
      var P = { x: sideR < 0 ? 5 : 63, y: Math.min(98, R.at.y + 16) }, vR = S.v(R), tR = d2(R.at, P) / vR;
      var tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
      if (tds[0].t - tR < -0.6) return;
      var foil = tds[0].m, parts = [];
      var dp = S.stat(R, 'pace') - S.stat(foil, 'pace'); part(parts, clamp(Math.round(dp / 3), -2, 2), first(R.p) + (dp > 0 ? ' is quicker than ' : ' is slower than ') + first(foil.p) + ' (Pace ' + m0(S.stat(R, 'pace')) + ' against ' + m0(S.stat(foil, 'pace')) + ')');
      if (pin && pin.d <= 4.5 && pin.m !== foil) part(parts, 2, first(pin.m.p) + ' is ' + pin.d.toFixed(1) + ' m from ' + first(cp) + ' and is not going with ' + first(R.p));
      if (tds[1] && tds[1].t <= tR + 0.7) part(parts, -2, first(tds[1].m.p) + ' can also cover the wing');
      add({ kind: 'overlap pass', id: 'Z_OVERLAP', man: R.p, free: foil && d2(foil.at, R.at) >= 5, freeM: d2(foil.at, R.at), lane: [c.at, R.at], spot: P, runFrom: R.at, foilMan: foil.p,
        why: first(R.p) + ' is outside ' + first(cp) + ', level or behind (' + m0(L) + ' m), with an open lane and a free run down the touchline',
        claims: [{ t: 'lane', a: c.at, b: R.at, r: laneTrue(L) }, { t: 'outside', man: R.p.id, of: cp.id }],
        b: { test: { mine: R.p, mineAttr: 'pace', theirs: foil.p, theirsAttr: 'pace' }, risk: 'even', bonus: 0, parts: capParts(parts, -4, 3), to: R.p, grants: { good: [{ id: 'space', lane: R.at.x < 34 ? 0 : 2 }] },
          pays: 'advance',
          does: { good: 'runs outside {foil} to take the pass from ' + first(cp), mixed: 'takes the pass a step ahead of {foil}', bad: 'is caught by {foil}, who takes the ball' },
          label: first(cp) + ' passes it for ' + first(R.p) + ' to overlap round the outside of ' + first(foil.p),
          read: first(R.p) + ' (Pace ' + m0(S.stat(R, 'pace')) + ') against ' + first(foil.p) + ' (Pace ' + m0(S.stat(foil, 'pace')) + '), the defender who can get to the wing first. If he loses it, he is out of position when they attack.' } });
    });
  }

  function carryCards(ctx, S, add) {
    var c = S.car, cp = c.p, z = ctx.zone, fr = inFront(S, c.at);
    if (fr.length === 1) {
      var f = fr[0], f1 = f.p, zz = z >= 2, parts = [];
      var cov = nearest(S.defOut, c.at, [f]);
      if (cov && cov.d <= 7) part(parts, -2, first(cov.m.p) + ' is ' + m0(cov.d) + ' m away to cover');
      var ov = S.attOut.filter(function (t) { return t !== c && d2(t.at, c.at) <= 14 && wide(t.at.x) < wide(c.at.x) - 2 && t.at.y >= c.at.y - 8; })[0];
      if (ov) part(parts, 1, first(ov.p) + ' is running past on the outside, so ' + first(f1) + ' has to watch him too');
      add({ kind: 'dribble', id: z === 0 ? 'Z_CARRY_OUT' : zz ? 'Z_TAKE_ON' : 'Z_CARRY', man: f1, free: false, freeM: 0, lane: [c.at, f.at], foilMan: f1,
        why: 'exactly one man in front of him (' + first(f1) + ', ' + d2(c.at, f.at).toFixed(1) + ' m)',
        claims: [{ t: 'front', from: cp.id, men: [f1.id] }],
        b: { test: { mine: cp, mineAttr: zz ? 'technique' : 'pace', theirs: f1, theirsAttr: 'defending' }, risk: zz ? 'high' : 'even', parts: capParts(parts, -3, 2), to: cp, grants: { good: [{ id: 'backing' }] }, pays: 'advance',
          does: { good: 'dribbles past {foil}', mixed: 'squeezes past {foil}', bad: 'loses it to {foil}' },
          label: first(cp) + ' dribbles at ' + first(f1) + ', the only man in front of him',
          read: first(cp) + ' (' + (zz ? 'Technique ' : 'Pace ') + m0(S.stat(c, zz ? 'technique' : 'pace')) + ') against ' + first(f1) + ' (Defending ' + m0(S.stat(f, 'defending')) + ').' } });
    }
    if (fr.length === 0 && S.lineY - c.at.y >= 15 && c.at.y < 88) {
      var ch = nearest(S.defOut, c.at);
      if (ch) add({ kind: 'run with it', id: z === 0 ? 'Z_CARRY_OUT' : 'Z_CARRY', man: cp, free: true, freeM: ch.d, lane: [c.at, { x: c.at.x, y: c.at.y + 12 }], foilMan: ch.m.p,
        why: 'nobody in front of him; ' + m0(S.lineY - c.at.y) + ' m to their last man',
        claims: [{ t: 'front', from: cp.id, men: [] }],
        b: { test: { mine: cp, mineAttr: 'pace', theirs: ch.m.p, theirsAttr: 'pace' }, risk: 'even', to: cp, pays: 'advance',
          does: { good: 'runs clear of {foil}', mixed: 'gets a metre ahead of {foil}', bad: 'is caught by {foil}' },
          label: first(cp) + ' runs with the ball into the space in front of him (' + m0(S.lineY - c.at.y) + ' m), ' + first(ch.m.p) + ' chasing',
          read: first(cp) + ' (Pace ' + m0(S.stat(c, 'pace')) + ') against ' + first(ch.m.p) + ' (Pace ' + m0(S.stat(ch.m, 'pace')) + ').' } });
    }
  }

  function finishCards(ctx, S, add) {
    var c = S.car, cp = c.p, dg = d2(c.at, GOAL), kdef = S.def.filter(function (q) { return q.k; })[0], kp = ctx.keeper || (kdef || {}).p;
    if (!kp || !kdef) return;
    if (dg <= 28 && c.at.y >= 75) {
      /* a shot exists in range; the men in the way are named parts, not a reason it does not exist (their box is crowded) */
      var inside = inBox(c.at), m2 = m0(dg), pr = nearest(S.defOut, c.at), parts = [], bk = shotBlockers(S, c.at);
      if (pr && pr.d <= 2.5) part(parts, -1, first(pr.m.p) + ' is on him (' + pr.d.toFixed(1) + ' m)');
      if (bk.length) { var bm0 = bk.sort(function (a, b) { return d2(a.at, c.at) - d2(b.at, c.at); }); part(parts, -Math.min(3, 1 + bk.length), first(bm0[0].p) + (bk.length > 1 ? ' and ' + (bk.length - 1) + ' more' : '') + (bk.length > 1 ? ' are' : ' is') + ' in the way (' + m0(d2(bm0[0].at, c.at)) + ' m)'); }
      var claim = [{ t: 'range', man: cp.id, max: 28 }];
      /* the man who gets to a rebound: the nearest of yours within 12 m of the ball, in or near their box (today's cards name the best finisher) */
      var reb = nearest(S.attOut, c.at, [c]); reb = reb && reb.d <= 12 && reb.m.at.y >= 80 ? reb.m : null;
      add({ kind: 'shot', id: inside ? 'Z_SHOOT' : 'Z_SHOOT_EDGE', man: cp, free: true, freeM: freeOf(S, c), lane: [c.at, GOAL], foilMan: kp, claims: claim, why: 'in range (' + m2 + ' m)' + (bk.length ? '; ' + bk.length + ' of theirs in the way' : ' and nobody between him and the goal'),
        b: { test: { mine: cp, mineAttr: 'finishing', theirs: kp, theirsAttr: 'reflexes' }, risk: inside ? 'even' : 'high', parts: parts.length ? parts : undefined, bonus: inside ? 3 : -5,
          because: inside ? 'he is inside the box, close to goal' : 'he is shooting from ' + m2 + ' m', mate: reb ? reb.p : undefined, to: reb ? reb.p : undefined, pays: inside && reb && !(ctx.state && (ctx.state.finishOnly || ctx.state.rebounded)) ? 'shotreb' : 'shot',
          does: { good: inside ? 'shoots past {foil}' : 'hits it into the corner', mixed: inside ? 'shoots at {foil}' : 'hits the target', bad: 'hits it straight at {foil}' },
          label: first(cp) + ' shoots from ' + m2 + ' m' + (bk.length ? ', with ' + first(bk[0].p) + ' in the way' : ': nobody is between him and the goal'), read: first(cp) + ' (Finishing ' + m0(S.stat(c, 'finishing')) + ') against ' + first(kp) + ' (Reflexes ' + m0(S.stat(kdef, 'reflexes')) + ').' } });
      if (inside) add({ kind: 'placed shot', id: 'Z_PLACE', man: cp, free: true, freeM: freeOf(S, c), lane: [c.at, { x: 31, y: 105 }], foilMan: kp, claims: claim, why: 'in range (' + m2 + ' m)',
        b: { test: { mine: cp, mineAttr: 'finishing', theirs: kp, theirsAttr: 'reflexes' }, risk: 'low', bonus: 2, parts: parts.length ? parts : undefined, because: 'he is inside the box, close to goal', pays: 'placed',
          does: { good: 'places it past {foil}', mixed: 'places it, and it is too close to {foil}', bad: 'places it just wide' },
          label: first(cp) + ' places it carefully at the corner from ' + m2 + ' m', read: first(cp) + ' (Finishing ' + m0(S.stat(c, 'finishing')) + ') against ' + first(kp) + ' (Reflexes ' + m0(S.stat(kdef, 'reflexes')) + ').' } });
      var off = 105 - kdef.at.y;
      if (off >= 5 && dg >= 8) add({ kind: 'chip', id: 'Z_CHIP', man: cp, free: true, freeM: freeOf(S, c), lane: [c.at, GOAL], foilMan: kp, claims: claim.concat([{ t: 'keeperOff', min: 5 }]), why: 'their keeper is ' + m0(off) + ' m off his line',
        b: { test: { mine: cp, mineAttr: 'technique', theirs: kp, theirsAttr: 'intelligence' }, risk: 'high', pays: 'shot',
          does: { good: 'lifts it over {foil}', mixed: 'lifts it towards goal, and {foil} gets back to it', bad: 'tries to lift it over {foil}, who does not move' },
          label: first(cp) + ' lifts it over ' + first(kp) + ', who is ' + m0(off) + ' m off his line', read: first(cp) + ' (Technique ' + m0(S.stat(c, 'technique')) + ') against ' + first(kp) + ' (Intelligence ' + m0(S.stat(kdef, 'intelligence')) + ').' } });
    }
  }

  function crossCards(ctx, S, add) {
    var c = S.car, cp = c.p;
    if (!(wide(c.at.x) <= 16 && c.at.y >= 65 && ctx.zone >= 1 && ctx.zone <= 2)) return;
    var tg = S.attOut.filter(function (t) { return t !== c && inBox(t.at); }), bt = null;
    tg.forEach(function (t) { var mk = nearest(S.defOut, t.at); if (mk && (!bt || mk.d > bt.mk.d)) bt = { t: t, mk: mk }; });
    if (!bt) return;
    var parts = [], inB = S.defOut.filter(function (m) { return inBox(m.at) && m !== bt.mk.m && d2(m.at, bt.t.at) <= 5; });
    if (inB.length) part(parts, -Math.min(2, inB.length), first(inB[0].p) + (inB.length > 1 ? ' and ' + (inB.length - 1) + ' more' : '') + ' close the box as well (within 5 m of ' + first(bt.t.p) + ')');
    var others = tg.filter(function (t) { return t !== bt.t; }).length;
    if (others) part(parts, 1, others === 1 ? 'a second man of yours is in the box' : others + ' more of yours are in the box');
    add({ kind: 'cross', id: 'Z_CROSS', man: bt.t.p, free: bt.mk.d >= 5, freeM: bt.mk.d, lane: [c.at, bt.t.at], foilMan: bt.mk.m.p,
      why: 'he is wide (' + m0(wide(c.at.x)) + ' m from the touchline) and ' + first(bt.t.p) + ' is in their box (' + first(bt.mk.m.p) + ' ' + bt.mk.d.toFixed(1) + ' m from him)',
      claims: [{ t: 'inbox', man: bt.t.p.id }, { t: 'wide', man: cp.id, max: 16 }],
      b: { test: { mine: bt.t.p, mineAttr: 'reach', theirs: bt.mk.m.p, theirsAttr: 'reach' }, risk: 'even', to: null, bonus: 0, parts: capParts(parts, -3, 2), because: first(bt.t.p) + ' knows where the cross is going and ' + first(bt.mk.m.p) + ' does not', pays: 'header', actorFirst: bt.t.p,
        does: { good: 'rises above {foil} to meet it', mixed: 'gets his head to it', bad: 'is beaten in the air by {foil}' },
        label: first(cp) + ' crosses it for ' + first(bt.t.p) + ' to head, with ' + first(bt.mk.m.p) + ' ' + m0(bt.mk.d) + ' m from him',
        read: first(bt.t.p) + ' (Reach ' + m0(S.stat(bt.t, 'reach')) + ') against ' + first(bt.mk.m.p) + ' (Reach ' + m0(S.stat(bt.mk.m, 'reach')) + ') in the air.' } });
  }

  /* the cut-back from near the goal line to a man arriving at the edge of the six-yard box or the penalty spot */
  function cutbackCards(ctx, S, add) {
    var c = S.car, cp = c.p;
    if (ctx.zone < 2 || c.at.y < 91 || Math.abs(c.at.x - 34) < 9) return;
    S.attOut.forEach(function (M) {
      if (M === c || !(inBox(M.at) && M.at.y >= 86 && M.at.y <= 100 && Math.abs(M.at.x - 34) <= 16)) return;
      var L = d2(c.at, M.at); if (L < 5 || L > 22) return;
      if (laneBlockers(S, c.at, M.at).length) return;
      var mk = nearest(S.defOut, M.at); if (!mk || mk.d < 2.5) return;
      add({ kind: 'cut-back', id: 'Z_CUTBACK', man: M.p, free: mk.d >= 5, freeM: mk.d, lane: [c.at, M.at], foilMan: mk.m.p,
        why: 'he is on the byline side of the box and ' + first(M.p) + ' is arriving (' + first(mk.m.p) + ' ' + mk.d.toFixed(1) + ' m from him)',
        claims: [{ t: 'lane', a: c.at, b: M.at, r: laneTrue(L) }, { t: 'inbox', man: M.p.id }],
        b: { test: { mine: cp, mineAttr: 'passing', theirs: mk.m.p, theirsAttr: 'intelligence' }, risk: 'low', bonus: 2, because: first(M.p) + ' is arriving and has room', to: M.p, pays: 'probe',
          does: { good: 'cuts it back past {foil} to ' + first(M.p), mixed: 'cuts it back, but {foil} is there', bad: 'cuts it back straight to {foil}' },
          label: first(cp) + ' cuts it back to ' + first(M.p) + ', who is arriving (' + first(mk.m.p) + ' ' + m0(mk.d) + ' m from him)',
          read: first(cp) + ' (Passing ' + m0(S.stat(c, 'passing')) + ') against ' + first(mk.m.p) + ' (Intelligence ' + m0(S.stat(mk.m, 'intelligence')) + '), the man nearest ' + first(M.p) + '.' } });
    });
  }

  /* ------------------------------------------------------------------ the kinds (THEIR ATTACK: your defending) */
  function defendCards(ctx, S, add) {
    var c = S.car, cp = c.p, tz = ctx.tzone, mine = S.defOut;
    var pr = nearest(mine, c.at), E = tz >= 1;
    /* the options for the ball: their team-mates with an open lane and nobody of yours within 5 m (the team closing out the options) */
    function freeMates() {
      return S.attOut.filter(function (t) { if (t === c) return false; var L = d2(c.at, t.at); return L >= 6 && L <= 45 && !laneBlockers(S, c.at, t.at).length && freeOf(S, t, mine) >= 5; });
    }
    var fm = freeMates();
    function closeCard(man, dist, kindName, second) {
      var parts = [], h = nearest(mine, c.at, [man]);
      if (h && h.d <= 9) part(parts, 1, first(h.m.p) + ' is ' + m0(h.d) + ' m away to help');
      if (fm.length) part(parts, -Math.min(2, fm.length), fm.length === 1 ? first(fm[0].p) + ' is free to take the pass' : fm.length + ' of them are free to take the pass (' + first(fm[0].p) + ', ' + first(fm[1].p) + ')');
      if (second) { var extra = Math.max(0, dist - pr.d); var pn = -Math.min(3, Math.round(extra / 6)); if (pn) part(parts, pn, first(man.p) + ' has ' + m0(dist) + ' m to run (' + first(pr.m.p) + ' is ' + m0(pr.d) + ' m away)'); }
      add({ kind: kindName, id: E ? 'E_TACKLE' : 'M_PRESS', man: man.p, free: false, freeM: dist, lane: [man.at, c.at], foilMan: cp,
        why: first(man.p) + (second ? ' is your best defender (Defending ' + m0(S.stat(man, 'defending')) + ') within ' + m0(dist) + ' m' : ' is the nearest of yours, ' + dist.toFixed(1) + ' m from him'),
        claims: [{ t: 'near', a: man.p.id, b: cp.id, max: 20 }].concat(second ? [{ t: 'best', man: man.p.id, over: pr.m.p.id }] : [{ t: 'nearest', man: man.p.id }]),
        b: { test: { mine: man.p, mineAttr: 'defending', theirs: cp, theirsAttr: 'technique' }, risk: 'even', parts: capParts(parts, -3, 2), grants: { good: [{ id: E ? 'caught' : 'short' }] }, winZone: E ? 1 : undefined, pays: 'twin',
          does: E ? { good: 'times the tackle on {foil}', mixed: 'gets in front of {foil}', bad: 'mistimes the tackle' } : { good: 'gets to {foil} and takes the ball off him', mixed: 'gets to {foil}, who cannot go forward', bad: 'gets to {foil} too late' },
          label: second ? first(man.p) + ' comes across to take ' + first(cp) + ' on (' + m0(dist) + ' m)' : first(man.p) + ' goes at ' + first(cp) + ' (' + m0(dist) + ' m) to win the ball',
          read: first(man.p) + ' (Defending ' + m0(S.stat(man, 'defending')) + ') against ' + first(cp) + ' (Technique ' + m0(S.stat(c, 'technique')) + ').' + (E ? ' If he misses, ' + first(cp) + ' is in your box.' : '') } });
    }
    if (pr && pr.d <= 20) closeCard(pr.m, pr.d, 'close down', false);
    /* his MENUC-2: the nearest man, and the best man as a second card */
    var bestM = null;
    mine.forEach(function (m) { var d = d2(m.at, c.at); if (m === (pr && pr.m) || d > 20 || m.at.y > c.at.y + 3) return; var b = S.stat(m, 'defending'); if (!bestM || b > bestM.b) bestM = { m: m, d: d, b: b }; });
    if (pr && bestM && bestM.b >= S.stat(pr.m, 'defending') + 2 && pr.d <= 20) closeCard(bestM.m, bestM.d, 'best man steps in', true);
        /* double up: the nearest man is on him, a second can reach the ball side before he is away (the wing, mostly) */
    if (pr && pr.d <= 8 && E) {
      var H = null;
      mine.forEach(function (m) { if (m === pr.m) return; var d = d2(m.at, c.at); if (d > 16) return; var t = d / S.v(m); if (!H || t < H.t) H = { m: m, d: d, t: t }; });
      if (H && (wide(c.at.x) <= 20 || BRK.noclose)) {
        var free = fm.length ? fm[0] : null, parts = [];
        part(parts, 2, first(H.m.p) + ' comes across to help (' + m0(H.d) + ' m): two of you against one');
        if (free) part(parts, -1, first(free.p) + ' is left free if ' + first(H.m.p) + ' goes');
        add({ kind: 'double up', id: 'E_DOUBLE', man: H.m.p, free: false, freeM: H.d, lane: [H.m.at, c.at], foilMan: cp, theirToMan: free ? free.p : null,
          why: first(pr.m.p) + ' is on him (' + pr.d.toFixed(1) + ' m); ' + first(H.m.p) + ' can reach him (' + m0(H.d) + ' m) and he is wide (' + m0(wide(c.at.x)) + ' m from the touchline)',
          claims: [{ t: 'near', a: pr.m.p.id, b: cp.id, max: 8 }, { t: 'near', a: H.m.p.id, b: cp.id, max: 16 }, { t: 'wide', man: cp.id, max: 20 }],
          b: { test: { mine: H.m.p, mineAttr: 'defending', theirs: cp, theirsAttr: 'technique' }, risk: 'even', bonus: 0, parts: capParts(parts, -3, 3), winZone: 1, grants: { good: [{ id: 'caught' }] }, pays: 'twin',
            theirTo: free ? free.p : undefined,
            does: { good: 'and ' + first(pr.m.p) + ' trap {foil} between them', mixed: 'and ' + first(pr.m.p) + ' stop {foil} going forward', bad: 'comes across too early' },
            label: first(H.m.p) + ' comes across to help ' + first(pr.m.p) + ' (' + m0(H.d) + ' m): two against ' + first(cp) + ' on the wing',
            read: first(H.m.p) + ' (Defending ' + m0(S.stat(H.m, 'defending')) + ') against ' + first(cp) + ' (Technique ' + m0(S.stat(c, 'technique')) + ').' + (free ? ' If it goes wrong, ' + first(free.p) + ' is free.' : '') } });
      }
    }
    /* the winger tracks back: one of yours on the ball's flank, well up the pitch, runs back to help (he is out of position next play) */
    var W = null;
    mine.forEach(function (m) {
      if (m === (pr && pr.m)) return;
      if (m.at.y > c.at.y - 8) return;   /* only a man up the pitch from the ball (nearer their goal than the ball) */
      if (Math.abs(m.at.x - c.at.x) > 22 || wide(m.at.x) > 14) return;
      var d = d2(m.at, c.at); if (d > 45) return;
      if (!W || d < W.d) W = { m: m, d: d };
    });
    if (W && (E || c.at.y >= 25)) {
      var wp = [], race = S.stat(W.m, 'pace') - S.stat(c, 'pace');
      part(wp, clamp(Math.round(race / 3), -2, 2), first(W.m.p) + (race > 0 ? ' is quicker than ' : ' is slower than ') + first(cp) + ' (Pace ' + m0(S.stat(W.m, 'pace')) + ' against ' + m0(S.stat(c, 'pace')) + ')');
      var pn2 = -Math.min(3, Math.round(Math.max(0, W.d - 12) / 8)); part(wp, pn2, first(W.m.p) + ' has ' + m0(W.d) + ' m to run back');
      if (pr && pr.d <= 7) part(wp, 1, first(pr.m.p) + ' already has him held (' + pr.d.toFixed(1) + ' m)');
      add({ kind: 'winger tracks back', id: 'E_COVER', man: W.m.p, free: false, freeM: W.d, lane: [W.m.at, c.at], foilMan: cp,
        why: first(W.m.p) + ' is up the pitch on that wing, ' + m0(W.d) + ' m from the ball',
        claims: [{ t: 'near', a: W.m.p.id, b: cp.id, max: 45 }, { t: 'upfield', man: W.m.p.id, of: cp.id }, { t: 'wide', man: W.m.p.id, max: 14 }],
        b: { test: { mine: W.m.p, mineAttr: 'pace', theirs: cp, theirsAttr: 'pace' }, risk: 'low', bonus: 1, because: first(W.m.p) + ' only has to get between ' + first(cp) + ' and your goal', parts: capParts(wp, -3, 3), pays: 'twide', via: 'cross', vias: { bad: 'alone' },
          does: { good: 'gets back and cuts off {foil}', mixed: 'gets back, and {foil} takes it wide', bad: 'is too late to get back' },
          label: first(W.m.p) + ' runs back to help (' + m0(W.d) + ' m), and will be out of position next play',
          read: first(W.m.p) + ' (Pace ' + m0(S.stat(W.m, 'pace')) + ') against ' + first(cp) + ' (Pace ' + m0(S.stat(c, 'pace')) + '). He leaves his place up the pitch, so he is out of position for your next attack.' } });
    }
    /* show him wide: your nearest man is goal-side of him and he is on the wing */
    if (pr && pr.d <= 10 && pr.m.at.y > c.at.y && (c.at.x < 22 || c.at.x > 46) && E) {
      add({ kind: 'show wide', id: 'E_WIDE', man: pr.m.p, free: false, freeM: pr.d, lane: [pr.m.at, { x: c.at.x < 34 ? 2 : 66, y: c.at.y + 6 }], foilMan: cp,
        why: first(pr.m.p) + ' is between him and your goal, and he is on the wing',
        claims: [{ t: 'goalside', man: pr.m.p.id, of: cp.id }, { t: 'near', a: pr.m.p.id, b: cp.id, max: 10 }],
        b: { test: { mine: pr.m.p, mineAttr: 'intelligence', theirs: cp, theirsAttr: 'technique' }, risk: 'low', bonus: 1, because: 'he only has to stay on the inside of ' + first(cp), pays: 'twide', via: 'cross',
          does: { good: 'pushes {foil} out to the touchline', mixed: 'pushes {foil} out wide', bad: 'tries to push {foil} out wide' },
          label: first(pr.m.p) + ' stays goal-side and makes ' + first(cp) + ' go out wide', read: first(pr.m.p) + ' (Intelligence ' + m0(S.stat(pr.m, 'intelligence')) + ') against ' + first(cp) + ' (Technique ' + m0(S.stat(c, 'technique')) + ').' } });
    }
    /* cut out the pass to their most advanced free man */
    var open = S.attOut.filter(function (t) { if (t === c) return false; var L = d2(c.at, t.at); return L >= 6 && L <= 45 && t.at.y > c.at.y - 4 && !laneBlockers(S, c.at, t.at).length; });
    open.sort(function (a, b) { return b.at.y - a.at.y; });
    if (open.length) {
      var tt = open[0], mid = { x: (c.at.x + tt.at.x) / 2, y: (c.at.y + tt.at.y) / 2 }, ct = nearest(mine, mid, pr ? [pr.m] : []);
      if (ct && ct.d <= 25) add({ kind: 'cut out the pass', id: 'M_CUT', man: tt.p, free: freeOf(S, tt, mine) >= 5, freeM: freeOf(S, tt, mine), lane: [c.at, tt.at], cutBy: ct.m.at, foilMan: cp, theirToMan: tt.p,
        why: 'the pass to ' + first(tt.p) + ' is open; ' + first(ct.m.p) + ' is the nearest of yours to it (' + ct.d.toFixed(1) + ' m)',
        claims: [{ t: 'lane', a: c.at, b: tt.at, r: laneTrue(d2(c.at, tt.at)) }, { t: 'nearPoint', man: ct.m.p.id, pt: mid, max: 25 }],
        b: { test: { mine: ct.m.p, mineAttr: 'defending', theirs: cp, theirsAttr: 'passing' }, risk: 'even', theirTo: tt.p, winZone: 1, pays: 'tcut', grants: { good: [{ id: 'caught' }] },
          does: { good: 'steps into the path of the pass to ' + first(tt.p) + ' and takes it', mixed: 'stands in the path of the pass to ' + first(tt.p), bad: 'moves across a second too late' },
          label: first(ct.m.p) + ' steps across to cut out the pass from ' + first(cp) + ' to ' + first(tt.p) + (freeOf(S, tt, mine) >= 5 ? ', who is free' : ''),
          read: first(ct.m.p) + ' (Defending ' + m0(S.stat(ct.m, 'defending')) + ') against ' + first(cp) + ' (Passing ' + m0(S.stat(c, 'passing')) + ').' } });
    }
    /* block the shot */
    var dg2 = d2(c.at, GOAL);
    if (dg2 <= 28 && E) {
      var bks = shotBlockers(S, c.at);
      if (bks.length) {
        var bm = bks.sort(function (a, b) { return d2(a.at, c.at) - d2(b.at, c.at); })[0];
        add({ kind: 'block', id: 'E_BLOCK', man: bm.p, free: false, freeM: 0, lane: [c.at, GOAL], foilMan: cp, claims: [{ t: 'inShotLine', man: bm.p.id, from: cp.id }],
          why: first(bm.p) + ' stands between him and your goal (' + m0(dg2) + ' m out)',
          b: { test: { mine: bm.p, mineAttr: 'defending', theirs: cp, theirsAttr: 'finishing' }, risk: 'even', winZone: 1, pays: 'tblock', grants: { good: [{ id: 'caught' }] }, fwd: 'is in your box.',
            does: { good: 'blocks the shot from {foil}', mixed: 'gets a foot to the shot from {foil}', bad: 'goes to block the shot, and {foil} goes round him' },
            label: first(bm.p) + ' stays between ' + first(cp) + ' and your goal to block the shot (' + m0(dg2) + ' m out)', read: first(bm.p) + ' (Defending ' + m0(S.stat(bm, 'defending')) + ') against ' + first(cp) + ' (Finishing ' + m0(S.stat(c, 'finishing')) + ').' } });
      }
    }
    /* foul him: your nearest man is within 6 m */
    if (pr && pr.d <= 6 && (ctx.state.minute || 0) > 20) {
      add({ kind: 'foul', id: E ? 'E_FOUL' : 'M_FOUL', man: pr.m.p, free: false, freeM: pr.d, lane: [pr.m.at, c.at], foilMan: cp, claims: [{ t: 'near', a: pr.m.p.id, b: cp.id, max: 6 }],
        why: first(pr.m.p) + ' is within reach (' + pr.d.toFixed(1) + ' m)',
        b: { test: { mine: pr.m.p, mineAttr: 'physical', theirs: cp, theirsAttr: 'pace' }, risk: 'low', bonus: E ? 2 : 0, because: E ? 'stopping a man by fouling him is easy' : undefined, pays: E ? 'tfk' : 'tcard',
          does: { good: 'pulls {foil} down', mixed: 'catches {foil} late', bad: 'dives in and misses' },
          label: first(pr.m.p) + ' fouls ' + first(cp) + ' (' + m0(pr.d) + ' m away) to stop the attack', read: first(pr.m.p) + ' (Physical ' + m0(S.stat(pr.m, 'physical')) + ') against ' + first(cp) + ' (Pace ' + m0(S.stat(c, 'pace')) + ').' } });
    }
    /* the offside trap: one of theirs is level with your last line (edge of your box only) */
    var yL = Math.max.apply(null, mine.map(function (m) { return m.at.y; }));
    var lv = S.attOut.filter(function (t) { return t !== c && Math.abs(t.at.y - yL) <= 2; })[0];
    if (E && lv) {
      var line0 = mine.filter(function (m) { return m.at.y >= yL - 4; });
      var cl = line0.slice().sort(function (a, b) { return S.stat(b, 'intelligence') - S.stat(a, 'intelligence'); })[0] || line0[0];
      add({ kind: 'offside trap', id: 'E_OFFSIDE', man: lv.p, free: false, freeM: 0, lane: [cl.at, lv.at], foilMan: cp, theirToMan: lv.p, claims: [{ t: 'level', man: lv.p.id, line: yL, within: 2 }],
        why: first(lv.p) + ' is level with your last man (' + Math.abs(lv.at.y - yL).toFixed(1) + ' m)',
        b: { test: { mine: cl.p, mineAttr: 'intelligence', theirs: cp, theirsAttr: 'intelligence' }, risk: 'high', winZone: 1, theirTo: lv.p, pays: 'ttrap', via: 'alone', grants: { good: [{ id: 'caught' }] },
          does: { good: 'calls them forward, and ' + first(lv.p) + ' is offside when {foil} passes to him', mixed: 'calls them forward, and {foil} has nobody to pass to', bad: 'calls them forward, and one defender is late' },
          label: first(cl.p) + ' calls your defenders forward to leave ' + first(lv.p) + ' offside (he is level with them now)', read: first(cl.p) + ' (Intelligence ' + m0(S.stat(cl, 'intelligence')) + ') against ' + first(cp) + ' (Intelligence ' + m0(S.stat(c, 'intelligence')) + ').' } });
    }
  }

  /* ------------------------------------------------------------------ KEYWORD AND PAIR CARDS FROM THE PICTURE (stream PICMENU2) */
  /* Each card keeps today's words, results and keyword (its id, its results table, "Unlocked by ..."), but WHO it names and
   * WHETHER it exists come from where the men stand: the keyword man must be able to get the ball (he has it, or an open,
   * onside pass reaches him), and the men the card names must be where the card says (a header man in or near their box, the
   * two men a Dribbler runs at in front of him, the man in the duel the one actually nearest). Every such fact is a claim
   * that pm_claims.js re-checks. */
  var KW_IDS = ['KW_Z_THROUGH_DEEP', 'KW_Z_DRIBBLE_TWO', 'KW_Z_DRIBBLE_BOX', 'KW_Z_HEAD_DOWN', 'KW_Z_EARLY_CROSS', 'KW_Z_LOW_CROSS', 'KW_Z_LATE_RUN', 'REB_SHOOT',
    'PAIR_ONE_TWO', 'PAIR_OVERLAP', 'PAIR_FLICK', 'KW_STEAL', 'PAIR_PRESS', 'KW_FREE_FOUL', 'KW_KEEPER_START'];
  var KW_REPL = {}; KW_IDS.forEach(function (k) { KW_REPL[k] = true; });
  var KW_COPY = ['kw', 'pair', 'high', 'books', 'counterPress', 'lastResort', 'pairTwist'];
  function OPT() { return root.KMOptions || (typeof require === 'function' ? require('./options.js') : null); }
  function KWL() { return root.KMKeywords || (typeof require === 'function' ? require('./keywords.js') : null); }
  function manIn(list, p) { for (var i = 0; i < list.length; i++) if (list[i].p === p) return list[i]; return null; }
  function nearOut(list, q, not) { return nearest(list.filter(function (m) { return !m.k; }), q, not); }
  /* can the ball get to him: he has it, or an open pass (5 to 40 m, nobody near its line) reaches him onside */
  function handOff(S, h) {
    var c = S.car;
    if (h === c) return { direct: true, claims: [] };
    if (h.k) return null;
    var L = d2(c.at, h.at); if (L < 5 || L > 40) return null;
    if (laneBlockers(S, c.at, h.at).length && !BRK.kwlane) return null;   /* (KM_PM_BREAK=kwlane: pm2_check K1 must fail) */
    if (h.at.y > S.lineY + 0.5) return null;
    return { direct: false, L: L, claims: [{ t: 'lane', a: c.at, b: h.at, r: laneTrue(L) }, { t: 'onside', man: h.p.id }] };
  }
  /* the holders of a keyword who can get the ball, the man on the ball first, then the nearest */
  function reachable(ctx, S, id, ok) {
    var K = KWL(); if (!K) return [];
    var mine = S.who === 'you' ? S.att : S.def;
    return K.holders(ctx.squad, id).map(function (p) { return manIn(mine, p); }).filter(function (m) { return m && (!ok || ok(m)); })
      .map(function (m) { return { m: m, ho: S.who === 'you' ? handOff(S, m) : { direct: true, claims: [] } }; }).filter(function (x) { return x.ho; })
      .sort(function (a, b) { return (a.ho.direct ? 0 : 1) - (b.ho.direct ? 0 : 1) || d2(a.m.at, S.car.at) - d2(b.m.at, S.car.at); });
  }
  function viaW(S, h, verb) { return h === S.car ? first(h.p) + ' ' + verb : first(S.car.p) + ' gives it to ' + first(h.p) + ', who ' + verb; }
  function entryOf(O, id) { var e = null; O.POOL.forEach(function (q) { if (q.id === id) e = q; }); return e; }
  /* today's card built for the picture's men: the fields its build reads are set here (never its own `when`) */
  function todays(O, ctx, id, fields) { var e = entryOf(O, id); if (!e) return null; Object.keys(fields).forEach(function (k) { ctx[k] = fields[k]; }); var b = e.build(ctx); return b ? { b: b, e: e } : null; }
  /* H: the keyword man and how the ball gets to him; a pass to him first is a step of its own (option F, off by default:
   * options.js rolls it), against the man nearest him in the picture */
  function kwAdd(add, id, t, k, S, H) {
    var ep = {}; KW_COPY.forEach(function (q) { if (t.e[q] !== undefined) ep[q] = t.e[q]; });
    if (S && H && H.ho && !H.ho.direct) { var nm = nearOut(S.def, H.m.at); t.b.handoff = { from: S.car.p, to: H.m.p, foil: nm ? nm.m.p : null }; }
    k.kind = 'kw:' + id; k.id = id; k.b = t.b; k.kwc = true; k.entry = ep; k.free = !!k.free; k.freeM = k.freeM || 0;
    add(k);
  }
  /* a ball into the space for a runner, from the man at `from` (the Playmaker's pass past their midfield) */
  function spotFrom(S, from, R, minAhead, minY) {
    var vR = S.v(R), best = null;
    [[0, 1], [0.6, 0.8], [-0.6, 0.8], [0.85, 0.5], [-0.85, 0.5]].forEach(function (dir) {
      [6, 10].forEach(function (rn) {
        var P = { x: R.at.x + dir[0] * rn, y: R.at.y + dir[1] * rn };
        if (P.x < 3 || P.x > 65 || P.y > 101 || P.y < from.at.y + minAhead || P.y < (minY || 0)) return;
        if (S.def.some(function (m) { return m.k && d2(m.at, P) < 7; })) return;
        var tR = d2(R.at, P) / vR, tb = 0.35 + d2(from.at, P) / 19, cut = laneBlockers(S, from.at, P);
        var tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
        var cont = tds.filter(function (x) { return x.t <= Math.max(tR, tb) + 0.5; }), margin = tds[0].t - tR;
        if (cut.length >= 2 || cont.length > 2 || margin < -0.8) return;
        var sc = margin - 0.3 * cont.length - 0.3 * cut.length;
        if (!best || sc > best.sc) best = { P: P, tR: tR, cut: cut, cont: cont, tds: tds, margin: margin, sc: sc };
      });
    });
    return best;
  }
  /* KWRUN: he is not there yet but can run there (at most maxRun metres, no later than 0.8 s after the first of theirs; the
   * ball can be played to that spot, at most one man near its line) */
  function runTo(S, h, Q, maxRun) {
    var dR = d2(h.at, Q); if (dR > maxRun || h.at.y > S.lineY + 0.5) return null;
    var tR = dR / S.v(h), tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, Q) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
    if (!tds.length || tds[0].t - tR < -0.8) return null;
    if (h !== S.car && laneBlockers(S, S.car.at, Q).length >= 2) return null;
    return { Q: Q, d: dR, foil: tds[0].m, margin: tds[0].t - tR, claims: [{ t: 'reach', man: h.p.id, spot: Q, before: tds[0].m.p.id, within: 0.8 }, { t: 'onside', man: h.p.id }] };
  }
  /* a header man gets into their box by the time a cross from `from` arrives (or is in it already) */
  function boxPoint(q) { return { x: clamp(q.x, 20, 48), y: 90 }; }
  function arrives(S, from, q) { if (inBox(q.at) || BRK.kwarrive) return true;   /* (KM_PM_BREAK=kwarrive: pm2_check K1 must fail) */ var B = boxPoint(q.at); return d2(q.at, B) / S.v(q) <= 0.35 + d2(from, B) / 19 + 0.5; }
  function holdersIn(ctx, S, id) { var K = KWL(); return K ? K.holders(ctx.squad, id).map(function (p) { return manIn(S.att, p); }).filter(Boolean) : []; }
  /* E (odds option, off by default): the man nearest the line of a pass is the man in the duel, priced by how close he is;
   * a pass longer than 20 m costs 1 for every 10 m more. Returns { foil, parts } or null. */
  function laneE(S, a, b, cut, lenM) {
    if (!ODDS_E) return null;
    var out = { foil: null, parts: [] };
    if (cut && cut.length) {
      var lm = cut[0], d = segDist(lm.at, a, b, 3), n = d < 1 ? -4 : d < 2 ? -2 : -1;
      out.foil = lm; part(out.parts, n, first(lm.p) + ' is ' + d.toFixed(1) + ' m from the line of the pass, so he is the man in the way' + (n <= -2 ? ' and can cut it out' : ''));
    }
    if (lenM > 20) part(out.parts, -Math.ceil((lenM - 20) / 10), 'a long pass (' + lenM + ' m) is easier to read');
    return out.foil || out.parts.length ? out : null;
  }
  function kwCards(ctx, S, add) {
    var O = OPT(), K = KWL(), z = ctx.zone, c = S.car;
    if (!O || !K) return;
    var legs = ctx.legs, tag = O.tag;
    if (S.who === 'you') {
      /* THE PLAYMAKER (your half): a ball past their midfield line (2 m beyond their furthest midfielder, 20 m or more up the
       * pitch) to a spot a runner gets to first */
      if (z === 0) reachable(ctx, S, 'PLAYMAKER').some(function (H) {
        var h = H.m, best = null, mids = S.defOut.filter(function (m) { return m.p.line === 1; });
        var midY = mids.length ? Math.max.apply(null, mids.map(function (m) { return m.at.y; })) : S.lineY - 15;
        S.attOut.forEach(function (R) {
          if (R === h || R === c || R.at.y > S.lineY + 0.5) return;
          var sp = spotFrom(S, h, R, 20, midY + 2); if (sp && (!best || sp.sc > best.sp.sc)) best = { R: R, sp: sp };
        });
        if (!best) return false;
        var R = best.R, B = best.sp, foil = B.tds[0].m, parts = [], P = B.P;
        var dp = S.stat(R, 'pace') - S.stat(foil, 'pace'), n = clamp(Math.round(dp / 3), -2, 2);
        part(parts, n, first(R.p) + (n > 0 ? ' is quicker than ' : ' is slower than ') + first(foil.p) + ' (Pace ' + m0(S.stat(R, 'pace')) + ' against ' + m0(S.stat(foil, 'pace')) + ')');
        B.cont.slice(1).forEach(function (x, i) { part(parts, i === 0 ? -2 : -1, first(x.m.p) + ' can also get to the ball (' + m0(d2(x.m.at, P)) + ' m from where it lands)'); });
        if (B.cut.length && !ODDS_E) part(parts, -1, first(B.cut[0].p) + ' is ' + segDist(B.cut[0].at, h.at, P, 3).toFixed(1) + ' m from the line of the pass');
        parts = capParts(parts, -4, 3);
        var mL = m0(d2(h.at, R.at)), eE = laneE(S, h.at, P, B.cut, mL); if (eE) { if (eE.foil) foil = eE.foil; parts = parts.concat(eE.parts); }
        var t = todays(O, ctx, 'KW_Z_THROUGH_DEEP', { _pmh: h.p, _pmr: R.p, _pmd: foil.p }); if (!t) return false;
        t.b.parts = parts.length ? parts : undefined;
        t.b.label = viaW(S, h, 'passes it past their midfield for ' + first(R.p) + ' to run onto (' + mL + ' m)');
        t.b.read = tag(h.p, 'passing', legs) + ' against ' + tag(foil.p, 'intelligence', 100) + (eE && eE.foil ? ', the man in the way of the pass. ' : ', the defender who can reach the ball first. ') + first(R.p) +
          ' has to run ' + m0(d2(R.at, P)) + ' m to it. If it gets through, the ball skips midfield and ' + tag(R.p, 'pace', legs) + ' has it at the edge of their box, running at their goal (+2).';
        var cl = H.ho.claims.concat([{ t: 'reach', man: R.p.id, spot: P, before: B.tds[0].m.p.id, within: 0.8 }, { t: 'onside', man: R.p.id }, { t: 'pastMid', spot: P, by: 2 }]);
        if (!B.cut.length) cl.push({ t: 'lane', a: h.at, b: P, r: laneTrue(d2(h.at, P)) }); else if (eE && eE.foil) cl.push({ t: 'onLine', man: foil.p.id, a: h.at, b: P, r: laneTrue(d2(h.at, P)) });
        kwAdd(add, 'KW_Z_THROUGH_DEEP', t, { man: R.p, free: B.cont.length <= 1, freeM: nearOut(S.def, R.at).d, lane: [h.at, P], spot: P, runFrom: R.at, foilMan: foil.p, oddsE: !!eE,
          why: first(h.p) + ' (Playmaker) can play it ' + m0(d2(h.at, P)) + ' m up the pitch, and ' + first(R.p) + ' gets to the spot first', claims: cl }, S, H);
        return true;
      });
      /* THE DRIBBLER (midfield; the edge of their box): runs at the two men nearest in front of him */
      if (z === 1 || z === 2) {
        var did = z === 1 ? 'KW_Z_DRIBBLE_TWO' : 'KW_Z_DRIBBLE_BOX';
        reachable(ctx, S, 'DRIBBLER').some(function (H) {
          var h = H.m, fr = S.defOut.filter(function (m) { var dy = m.at.y - h.at.y, dx = Math.abs(m.at.x - h.at.x); return dy > -1 && d2(m.at, h.at) <= 18 && dx <= 0.6 * Math.max(dy, 0) + 6; })
            .sort(function (a, b) { return d2(a.at, h.at) - d2(b.at, h.at); });
          if (fr.length < 2) return false;
          var d1 = fr[0], dd2 = fr[1], f = {};
          if (z === 1) { f._drh = h.p; f._dr1 = d1.p; f._dr2 = dd2.p; } else { f._dbh = h.p; f._db1 = d1.p; f._db2 = dd2.p; }
          var t = todays(O, ctx, did, f); if (!t) return false;
          t.b.label = viaW(S, h, 'runs at ' + first(d1.p) + ' and ' + first(dd2.p));
          t.b.read = String(t.b.read).replace(', with ' + first(dd2.p) + ' next to ' + first(d1.p) + '.', ', the nearer of the two in front of him (' + m0(d2(d1.at, h.at)) + ' m); ' + first(dd2.p) + ' is ' + m0(d2(dd2.at, h.at)) + ' m from him.');
          kwAdd(add, did, t, { man: h.p, lane: [h.at, d1.at], foilMan: d1.p,
            why: first(h.p) + ' (Dribbler) can get the ball, and ' + first(d1.p) + ' and ' + first(dd2.p) + ' are the two men in front of him',
            claims: H.ho.claims.concat([{ t: 'near', a: d1.p.id, b: h.p.id, max: 18 }, { t: 'near', a: dd2.p.id, b: h.p.id, max: 18 }, { t: 'ahead', man: d1.p.id, of: h.p.id, by: -1 }, { t: 'ahead', man: dd2.p.id, of: h.p.id, by: -1 }]) }, S, H);
          return true;
        });
      }
      /* THE TARGET MAN (the edge of their box): in or near their box, a team-mate within 12 m to head it down to */
      if (z === 2) reachable(ctx, S, 'TARGET', function (m) { return m !== c && m.at.y >= 76 && d2(m.at, c.at) <= 45; }).some(function (H) {
        var h = H.m, mm = nearest(S.attOut, h.at, [h, c]); if (!mm || mm.d > 12) return false;
        var d = nearOut(S.def, h.at); if (!d) return false;
        var t = todays(O, ctx, 'KW_Z_HEAD_DOWN', { _tmh: h.p, _tmm: mm.m.p, _tmd: d.m.p }); if (!t) return false;
        kwAdd(add, 'KW_Z_HEAD_DOWN', t, { man: h.p, lane: [c.at, h.at], foilMan: d.m.p, why: first(h.p) + ' (Target man) is ' + m0(d2(h.at, GOAL)) + ' m from goal and ' + first(mm.m.p) + ' is ' + m0(mm.d) + ' m from him',
          claims: [{ t: 'near', a: mm.m.p.id, b: h.p.id, max: 12 }, { t: 'nearestTo', man: d.m.p.id, to: h.p.id }, { t: 'range', man: h.p.id, max: 31 }] });
        return true;
      });
      /* THE CROSSER, EARLY (midfield): on a wing, a header man who gets into their box by the time the cross does (the
       * ball at 19 m a second, as every pass here; half a second spare), onside, the cross at most 45 m; the man in the air
       * with him is the one nearest him */
      if (z === 1) reachable(ctx, S, 'CROSSER', function (m) { return wide(m.at.x) <= 20; }).some(function (H) {
        var h = H.m, tg = S.attOut.filter(function (q) { return q !== h && q !== c && q.at.y <= S.lineY + 0.5 && d2(h.at, boxPoint(q.at)) <= 45 && arrives(S, h.at, q); });
        if (!tg.length) return false;
        tg.sort(function (a, b) { return S.stat(b, 'reach') - S.stat(a, 'reach') || d2(a.at, GOAL) - d2(b.at, GOAL); });
        var tt = tg[0], d = nearOut(S.def, tt.at); if (!d) return false;
        var t = todays(O, ctx, 'KW_Z_EARLY_CROSS', { _ech: h.p, _ect: tt.p, _ecd: d.m.p }); if (!t) return false;
        t.b.because = 'the cross comes from ' + m0(d2(h.at, tt.at)) + ' metres, so their defenders see it coming';
        t.b.crossFoil = (nearOut(S.def, h.at) || {}).m ? nearOut(S.def, h.at).m.p : null;
        kwAdd(add, 'KW_Z_EARLY_CROSS', t, { man: tt.p, free: d.d >= 5, freeM: d.d, lane: [h.at, tt.at], foilMan: d.m.p,
          why: first(h.p) + ' (Crosser) is ' + m0(wide(h.at.x)) + ' m from the touchline, and ' + first(tt.p) + (inBox(tt.at) ? ' is in their box' : ' can get into their box (' + m0(d2(tt.at, boxPoint(tt.at))) + ' m) before the cross') + ' (' + first(d.m.p) + ' ' + d.d.toFixed(1) + ' m from him)',
          claims: H.ho.claims.concat([{ t: 'wide', man: h.p.id, max: 20 }, { t: 'arrive', man: tt.p.id, from: h.at }, { t: 'crossLen', a: h.at, man: tt.p.id, max: 45 }, { t: 'onside', man: tt.p.id }, { t: 'nearestTo', man: d.m.p.id, to: tt.p.id }]) }, S, H);
        return true;
      });
      /* THE CROSSER, LOW (the edge of their box): wide and level with their box (or, KWRUN, able to run there), a team-mate
       * in their box; the man in the way is the one nearest the line of the cross */
      if (z === 2) holdersIn(ctx, S, 'CROSSER').some(function (h) {
        var there = wide(h.at.x) <= 18 && h.at.y >= 78, ho = there ? handOff(S, h) : null, rn = null;
        if (!ho) { if (!KWRUN) return false; rn = runTo(S, h, { x: h.at.x < 34 ? 7 : 61, y: 90 }, 35); if (!rn) return false; }
        var X0 = rn ? rn.Q : h.at, six = { x: 34, y: 99 }, mt = S.attOut.filter(function (q) { return q !== h && q !== c && inBox(q.at); }).sort(function (a, b) { return d2(a.at, six) - d2(b.at, six); })[0];
        if (!mt) return false;
        var lf = null, bd = 1e9; S.defOut.forEach(function (q) { var dd = segDist(q.at, X0, mt.at, 3); if (dd < bd) { bd = dd; lf = q; } });
        var d = (lf && bd <= 8) ? lf : (nearOut(S.def, X0) || {}).m; if (!d) return false;
        var t = todays(O, ctx, 'KW_Z_LOW_CROSS', { _lch: h.p, _lcm: mt.p, _lcd: d.p }); if (!t) return false;
        if (rn) {
          t.b.label = (h === c ? first(h.p) + ' runs with it up the wing (' + m0(rn.d) + ' m)' : first(c.p) + ' plays it into the space for ' + first(h.p) + ', who runs up the wing (' + m0(rn.d) + ' m),') + ' and crosses it low across the 5.5-metre box for ' + first(mt.p);
          if (h !== c) t.b.handoff = { from: c.p, to: h.p, foil: rn.foil.p, into: true };
        }
        kwAdd(add, 'KW_Z_LOW_CROSS', t, { man: mt.p, lane: [X0, mt.at], spot: rn ? rn.Q : undefined, runFrom: rn ? h.at : undefined, foilMan: d.p,
          why: first(h.p) + ' (Crosser) ' + (rn ? 'can run to the crossing spot (' + m0(rn.d) + ' m) before ' + first(rn.foil.p) + ' gets there' : 'is ' + m0(wide(h.at.x)) + ' m from the touchline at their box') + ', ' + first(mt.p) + ' is in their box, ' + first(d.p) + ' is ' + (d === lf ? bd.toFixed(1) + ' m from the line of the cross' : 'the man nearest the cross'),
          claims: (rn ? rn.claims : ho.claims.concat([{ t: 'wide', man: h.p.id, max: 18 }])).concat([{ t: 'inbox', man: mt.p.id }]) }, S, rn ? null : { m: h, ho: ho });
        return true;
      });
      /* THE LATE RUNNER (the edge of their box): a man behind the ball, outside their box, who can arrive in it (60 m or more up
       * the pitch, within 32 m of the middle of their box; KWRUN: from their half, within 45 m); the man who should follow him
       * is the one nearest him */
      if (z === 2) holdersIn(ctx, S, 'LATE_RUN').some(function (h) {
        if (h === c || h.at.y >= 88.5 || h.at.y > c.at.y + 6) return false;
        var dm = d2(h.at, { x: 34, y: 94 }), near0 = h.at.y >= 60 && dm <= 32;
        if (!near0 && !(KWRUN && h.at.y >= 52.5 && dm <= 45)) return false;
        var d = nearOut(S.def, h.at); if (!d) return false;
        var t = todays(O, ctx, 'KW_Z_LATE_RUN', { _lrh: h.p, _lrd: d.m.p }); if (!t) return false;
        t.b.label = first(c.p) + ' waits for ' + first(h.p) + ' to run into the box late from midfield (' + m0(dm) + ' m)';
        t.b.read = String(t.b.read).replace(', the midfielder who should follow ', ', the nearest of theirs (' + m0(d.d) + ' m), who should follow ');
        kwAdd(add, 'KW_Z_LATE_RUN', t, { man: h.p, free: d.d >= 5, freeM: d.d, lane: [h.at, { x: 34, y: 94 }], foilMan: d.m.p,
          why: first(h.p) + ' (Late runner) is behind the ball, ' + m0(dm) + ' m from the middle of their box, ' + first(d.m.p) + ' ' + d.d.toFixed(1) + ' m from him',
          claims: [{ t: 'nearestTo', man: d.m.p.id, to: h.p.id }, { t: 'ahead', man: c.p.id, of: h.p.id, by: -6 }, { t: 'half', man: h.p.id, min: 52.5 }] });
        return true;
      });
      /* THE POACHER at a rebound: the man sliding in to block is the one nearest him */
      if (z === 3 && ctx.state && ctx.state.rebounded && K.active(c.p, 'POACHER')) {
        var dr = nearOut(S.def, c.at);
        if (dr) { var tr = todays(O, ctx, 'REB_SHOOT', { _rbd: dr.m.p }); if (tr) kwAdd(add, 'REB_SHOOT', tr, { man: c.p, foilMan: dr.m.p, lane: [c.at, GOAL], why: first(dr.m.p) + ' is the nearest of theirs (' + dr.d.toFixed(1) + ' m)', claims: [{ t: 'nearestTo', man: dr.m.p.id, to: c.p.id }] }); }
      }
      /* THE ONE-TWO PAIR (midfield): the first man can get the ball, an open pass to his partner, the man he runs past is the one nearest him */
      if (z === 1 && !(ctx.state && ctx.state.finishOnly)) K.pairOf(ctx.squad, 'ONE_TWO').some(function (pr) {
        var a = manIn(S.att, pr.a), b = manIn(S.att, pr.b); if (!a || !b || b === c) return false;
        var ho = handOff(S, a); if (!ho) return false;
        var L = d2(a.at, b.at); if (L < 6 || L > 30 || b.at.y < a.at.y - 4 || b.at.y > S.lineY + 0.5 || laneBlockers(S, a.at, b.at).length) return false;
        var d = nearOut(S.def, a.at); if (!d) return false;
        var t = todays(O, ctx, 'PAIR_ONE_TWO', { _p12: pr, _p12d1: d.m.p }); if (!t) return false;
        kwAdd(add, 'PAIR_ONE_TWO', t, { man: b.p, lane: [a.at, b.at], foilMan: d.m.p, why: first(a.p) + ' can get the ball and has an open pass to ' + first(b.p) + ' (' + m0(L) + ' m); ' + first(d.m.p) + ' is the nearest of theirs',
          claims: ho.claims.concat([{ t: 'lane', a: a.at, b: b.at, r: laneTrue(L) }, { t: 'onside', man: b.p.id }, { t: 'nearestTo', man: d.m.p.id, to: a.p.id }]) }, S, { m: a, ho: ho });
        return true;
      });
      /* THE OVERLAP PAIR: the Dribbler can get the ball, the Crosser is outside him on his wing, level or behind (KWRUN: or on
       * his wing up to 35 m behind, and he gets to the wing ahead of the Dribbler no later than 0.8 s after the first of
       * theirs); the man he runs round is the first of theirs to the wing */
      if (z === 1 || z === 2) K.pairOf(ctx.squad, 'OVERLAP').some(function (pr) {
        var a = manIn(S.att, pr.a), b = manIn(S.att, pr.b); if (!a || !b) return false;
        var ho = handOff(S, b); if (!ho || (a.at.x < 34) !== (b.at.x < 34) || a.at.y > b.at.y + 4 || d2(a.at, b.at) < 5) return false;
        var strict = wide(a.at.x) <= wide(b.at.x) - 2 && a.at.y >= b.at.y - 14, rn = null, P, fb;
        if (strict) {
          P = { x: a.at.x < 34 ? 5 : 63, y: Math.min(98, a.at.y + 16) };
          var tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (x, y) { return x.t - y.t; });
          if (!tds.length) return false; fb = tds[0].m;
        } else {
          if (!KWRUN || a.at.y < b.at.y - 35) return false;
          rn = runTo(S, a, { x: a.at.x < 34 ? 5 : 63, y: Math.min(98, b.at.y + 10) }, 45); if (!rn) return false;
          P = rn.Q; fb = rn.foil;
        }
        var t = todays(O, ctx, 'PAIR_OVERLAP', { _pov: pr, _povd: fb.p }); if (!t) return false;
        if (rn) t.b.read = String(t.b.read) + ' ' + first(a.p) + ' has ' + m0(rn.d) + ' m to run to get round him.';
        kwAdd(add, 'PAIR_OVERLAP', t, { man: a.p, lane: [b.at, P], spot: P, runFrom: a.at, foilMan: fb.p,
          why: rn ? first(a.p) + ' is on ' + first(b.p) + '\'s wing, ' + m0(b.at.y - a.at.y) + ' m behind him, and can get to the wing ahead of him (' + m0(rn.d) + ' m) before ' + first(fb.p) : first(a.p) + ' is outside ' + first(b.p) + ' on his wing; ' + first(fb.p) + ' is the first of theirs to the wing',
          claims: ho.claims.concat(rn ? rn.claims : [{ t: 'outside', man: a.p.id, of: b.p.id }]) }, S, { m: b, ho: ho });
        return true;
      });
      /* THE STRIKE PAIR (your half, midfield): the Target man 15 m or more up the pitch, the Poacher within 15 m of him */
      if (z <= 1) K.pairOf(ctx.squad, 'STRIKE_PAIR').some(function (pr) {
        var tm = manIn(S.att, pr.a), q = manIn(S.att, pr.b); if (!tm || !q || tm === c || q === c) return false;
        if (tm.at.y < c.at.y + 15 || tm.at.y < 55 || d2(q.at, tm.at) > 15) return false;
        var d = nearOut(S.def, tm.at); if (!d) return false;
        var t = todays(O, ctx, 'PAIR_FLICK', { _pfl: pr, _pfld: d.m.p }); if (!t) return false;
        kwAdd(add, 'PAIR_FLICK', t, { man: q.p, lane: [c.at, tm.at], foilMan: d.m.p, why: first(tm.p) + ' is ' + m0(tm.at.y - c.at.y) + ' m up the pitch and ' + first(q.p) + ' is ' + m0(d2(q.at, tm.at)) + ' m from him',
          claims: [{ t: 'ahead', man: tm.p.id, of: c.p.id, by: 15 }, { t: 'near', a: q.p.id, b: tm.p.id, max: 15 }, { t: 'nearestTo', man: d.m.p.id, to: tm.p.id }] });
        return true;
      });
    } else {
      /* YOUR KEYWORDS WHEN THEY ATTACK: the man must be within reach of their man on the ball, in today's situations */
      var mine = S.defOut, foil = ctx.foil, used = (ctx.state && ctx.state.freeFouls) || {};
      var sid = ctx.threatSit;
      if (foil && (sid === 'their_playmaker' || sid === 'their_dribbler' || ctx.counter)) {
        var bw = reachable(ctx, S, 'BALL_WINNER', function (m) { return !m.k && d2(m.at, c.at) <= 20 && (sid === 'their_playmaker' ? m.p.line === 1 : m.p.line <= 1); })
          .sort(function (a, b) { return d2(a.m.at, c.at) - d2(b.m.at, c.at); })[0];
        if (bw) { var tb = todays(O, ctx, 'KW_STEAL', { _bw: bw.m.p }); if (tb) kwAdd(add, 'KW_STEAL', tb, { man: bw.m.p, lane: [bw.m.at, c.at], foilMan: c.p, why: first(bw.m.p) + ' (Ball winner) is ' + m0(d2(bw.m.at, c.at)) + ' m from ' + first(c.p), claims: [{ t: 'near', a: bw.m.p.id, b: c.p.id, max: 20 }] }); }
      }
      if (foil && ctx.counter) K.pairOf(ctx.squad, 'PRESS_PAIR').some(function (pr) {
        var a = manIn(mine, pr.a), b = manIn(mine, pr.b); if (!a || !b || d2(a.at, c.at) > 20 || d2(b.at, c.at) > 20) return false;
        var t = todays(O, ctx, 'PAIR_PRESS', { _pps: pr }); if (!t) return false;
        kwAdd(add, 'PAIR_PRESS', t, { man: a.p, lane: [a.at, c.at], foilMan: c.p, why: first(a.p) + ' and ' + first(b.p) + ' are both within 20 m of ' + first(c.p), claims: [{ t: 'near', a: a.p.id, b: c.p.id, max: 20 }, { t: 'near', a: b.p.id, b: c.p.id, max: 20 }] });
        return true;
      });
      if (foil && (ctx.state.minute || 0) > 20) {
        var de = reachable(ctx, S, 'DESTROYER', function (m) { return !m.k && !used[m.p.id] && !(ctx.state.booked && ctx.state.booked[m.p.id]) && d2(m.at, c.at) <= 8; })
          .sort(function (a, b) { return d2(a.m.at, c.at) - d2(b.m.at, c.at); })[0];
        if (de && !(ctx.tzone === 0 && !sid && S.stat(de.m, 'defending') - S.stat(c, 'technique') > 1 && !(ctx.theirCarried && ctx.theirCarried.length))) {
          var td = todays(O, ctx, 'KW_FREE_FOUL', { _de: de.m.p }); if (td) kwAdd(add, 'KW_FREE_FOUL', td, { man: de.m.p, lane: [de.m.at, c.at], foilMan: c.p, why: first(de.m.p) + ' (Destroyer) is ' + d2(de.m.at, c.at).toFixed(1) + ' m from ' + first(c.p), claims: [{ t: 'near', a: de.m.p.id, b: c.p.id, max: 8 }] });
        }
      }
      if (sid === 'their_playmaker' && ctx.tzone === 0 && foil && ctx.th && ctx.th.runner && K.active(ctx.squad.keeper, 'SWEEPER_KEEPER')) {
        var run = manIn(S.att, ctx.th.runner), ke = entryOf(O, 'KW_KEEPER_START');
        if (run && run.at.y >= 52.5 && ke && ke.when(ctx)) { var tk = { b: ke.build(ctx), e: ke }; if (tk.b) kwAdd(add, 'KW_KEEPER_START', tk, { man: ctx.squad.keeper, foilMan: run.p, lane: [run.at, { x: 34, y: 105 }], why: first(run.p) + ' is in your half, and your keeper is a Sweeper keeper', claims: [{ t: 'half', man: run.p.id, min: 52.5 }] }); }
      }
    }
  }

  /* ------------------------------------------------------------------ AT A WORLD STOP (kmtree6 b4, helper PLAY-PM; review r1 items 4 and 7)
   * The world (SIM v2, simrel/sim-v2/sim_world.js chance()) stopped play for a chance, and simplay.js hands the stop to apply() as
   * p.simStop { kind, kinds, who, team, where, c2, c4 }. Only there (engine menus and the sim off never reach this code):
   *   STOP SHOT   at a C1 stop (an open shot) or a C3 stop (at most one man in the way) the man on the ball gets a shot whatever the
   *               distance: the world's own rule decides the range (SIM v3: C1 30 m, C3 35 m; SIM v4: both 30 m), so stops and menus
   *               agree with no edit here (the lead's call SIM-1 as corrected at 04:29). Engine-made menus keep their old ranges.
   *               Beyond pm.js's own 28 m it is today's long shot (Z_SHOOT_FAR, -7, the engine's own number for a shot from about
   *               30 m), so a longer shot stays harder than the -5 shot from the edge of their box.
   *   STOP CROSS  at a C4 stop the cross (cut-back) goes to the world's cross target when the stop names one (stop.c4 an object with
   *               the man and the spot: the lead's call SIM-1), else to the team-mate who can REACH the world's cross spot (y 94, x 20
   *               to 48; cut-back x 26 to 42) before the quickest of theirs, running in or already there, onside; Reach against Reach
   *               in the air with the first of theirs to the spot, as Z_CROSS.
   *   TWO CARDS   no stop menu (yours or theirs) has fewer than 2 live cards: the card the stop is for is put on the menu when the
   *               keep rule left it off, and a plain option the picture supports (a pass to the nearest team-mate; your nearest man
   *               closing down) fills a menu the keep rule left with one.
   *   M-3         his ruling "the man in the way" (manway.js) at the stops: every pass card of yours M-3 reads gets the man nearest
   *               the line of the pass as the man in the duel and the length part, rebuilt by options.js's own a16Rebuild, as
   *               manway.js does on the engine's menus.
   * SWITCH: KM_SIM_BREAK=stopmenu / ?simbreak=stopmenu: the first three off (b3's stop menus); KM_SIM_BREAK=nomw / ?simbreak=nomw: M-3 off.
   * Both: b3 exactly. (simplay.js reads the same variable and ignores names it does not know.) */
  var SIMBRK = {}; flag('KM_SIM_BREAK', 'simbreak').split(',').forEach(function (k) { if (k) SIMBRK[k] = true; });
  var STOPNEW = !SIMBRK.stopmenu, STOPMW = !SIMBRK.nomw;
  /* b5: STOPRANGE (item 3; break shot28): at any stop of yours inside the world's shot-stop range (stop.range from simplay.js, the release's max of
   * C1 and C3: 30 m on SIM v4) the man on the ball has a shot card, as at a C1 or C3 stop; pm.js's own finishing range is 28 m.
   * STOPRUN (r2 M2; break c2run): at a C2 stop of yours the ball to a runner the world found (a card whose man is one of stop.c2) goes on the
   * menu when the keep rule left it off, as the stop shot and the stop cross do; greyed with its reason when no live one was built. */
  var STOPRANGE = !SIMBRK.shot28, STOPRUN = !SIMBRK.c2run;
  /* (no range of pm.js's own at a stop: the lead's call SIM-1, corrected 04:29; the range claim states the distance the words give) */
  function stopKinds(stop) { return stop ? (stop.kinds || [stop.kind]) : []; }
  /* the card the stop is for ('shot', 'cross' or null), read with simplay.js family()'s own words */
  function stopNeed(stop, who) { var kk = stopKinds(stop); if (who !== 'you') return null; return kk.indexOf('C1') >= 0 || kk.indexOf('C3') >= 0 ? 'shot' : kk[0] === 'C4' ? 'cross' : null; }
  function famOf(o) {
    var id = o.id || '', k = (o.mc && o.mc.kind) || '', lab = o.label || '';
    if (/^Z_(SHOOT|SHOOT_EDGE|PLACE|CHIP)$/.test(id) || /^(shot|placed shot|chip)$/.test(k) || /\bshoots\b|places it|lifts it over/.test(lab)) return 'shot';
    if (/CROSS|SQUARE|CUT_?BACK/.test(id) || /cross|cut-back|square/.test(k) || /\bcrosses\b|cuts it back|across the goal/.test(lab)) return 'cross';
    return 'other';
  }
  function stopShot(ctx, S, add, stop, out) {
    var kk = stopKinds(stop), isShot = kk.indexOf('C3') >= 0 || kk.indexOf('C1') >= 0;
    var inRange = STOPRANGE && !!(stop && stop.range && S.car && d2(S.car.at, GOAL) <= stop.range);   /* b5 (item 3) */
    if (!(isShot || inRange) || out.some(function (k) { return k.kind === 'shot'; })) return;
    var c = S.car, cp = c.p, dg = d2(c.at, GOAL), kdef = S.def.filter(function (q) { return q.k; })[0], kp = ctx.keeper || (kdef || {}).p, R = Math.ceil(dg);
    if (!kp || !kdef) return;
    var inside = inBox(c.at), far = !inside && dg > 28, m2 = m0(dg), pr = nearest(S.defOut, c.at), parts = [], bk = shotBlockers(S, c.at);
    if (pr && pr.d <= 2.5) part(parts, -1, first(pr.m.p) + ' is on him (' + pr.d.toFixed(1) + ' m)');
    if (bk.length) { var bm0 = bk.slice().sort(function (a, b) { return d2(a.at, c.at) - d2(b.at, c.at); }); part(parts, -Math.min(3, 1 + bk.length), first(bm0[0].p) + (bk.length > 1 ? ' and ' + (bk.length - 1) + ' more' : '') + (bk.length > 1 ? ' are' : ' is') + ' in the way (' + m0(d2(bm0[0].at, c.at)) + ' m)'); bk = bm0; }
    var reb = nearest(S.attOut, c.at, [c]); reb = reb && reb.d <= 12 && reb.m.at.y >= 80 ? reb.m : null;
    add({ kind: 'shot', id: inside ? 'Z_SHOOT' : far ? 'Z_SHOOT_FAR' : 'Z_SHOOT_EDGE', man: cp, free: true, freeM: freeOf(S, c), lane: [c.at, GOAL], foilMan: kp, stopCard: true,
      claims: [{ t: 'range', man: cp.id, max: R }],
      why: 'play stopped for a shot (' + kk.join('+') + ', the world\'s range): ' + m2 + ' m' + (bk.length ? '; ' + bk.length + ' of theirs in the way' : ' and nobody between him and the goal'),
      b: { test: { mine: cp, mineAttr: 'finishing', theirs: kp, theirsAttr: 'reflexes' }, risk: inside ? 'even' : 'high', parts: parts.length ? parts : undefined, bonus: inside ? 3 : far ? -7 : -5,
        because: inside ? 'he is inside the box, close to goal' : 'he is shooting from ' + m2 + ' m', mate: reb ? reb.p : undefined, to: reb ? reb.p : undefined, pays: inside && reb && !(ctx.state && (ctx.state.finishOnly || ctx.state.rebounded)) ? 'shotreb' : 'shot',
        does: { good: inside ? 'shoots past {foil}' : 'hits it into the corner', mixed: inside ? 'shoots at {foil}' : 'hits the target', bad: 'hits it straight at {foil}' },
        label: first(cp) + ' shoots from ' + m2 + ' m' + (bk.length ? ', with ' + first(bk[0].p) + ' in the way' : ': nobody is between him and the goal'), read: first(cp) + ' (Finishing ' + m0(S.stat(c, 'finishing')) + ') against ' + first(kp) + ' (Reflexes ' + m0(S.stat(kdef, 'reflexes')) + ').' } });
  }
  function stopCross(ctx, S, add, stop, out) {
    var kk = stopKinds(stop); if (kk[0] !== 'C4' || !S.defOut.length) return;
    var c4 = stop.c4 || null, c4o = c4 && typeof c4 === 'object' ? c4 : null, cut = (c4o ? (c4o.kind || c4o.type) : c4) === 'cut-back', c = S.car, cp = c.p;
    if (out.some(function (k) { return k.kind === 'cross' || k.kind === 'cut-back' || /^kw:KW_Z_(EARLY|LOW)_CROSS$/.test(k.kind); })) return;
    /* the world's spots and its race (each man at 5.2 m a second + 0.13 a point of Pace, sim_world.js vch = pm.js S.v); here against the
     * QUICKEST of theirs (the world races the nearest), so the claim the card makes is true by pm_claims.js's own reading */
    /* which man and which spot: first the men who get there first, else (pm.js's rule for a ball into space, spotCards) the men who get
     * there within 0.8 s of the first of theirs (the world's stats and frame can differ from the picture's by that much); among them
     * the best in the air against the first of theirs to his spot (Reach against Reach), then the bigger lead */
    var best = null;
    function better(q, b) { if (!b) return true; if ((q.mg > 0) !== (b.mg > 0)) return q.mg > 0; if (q.air !== b.air) return q.air > b.air; return q.mg > b.mg; }
    for (var x = cut ? 26 : 20; x <= (cut ? 42 : 48); x += 2) {
      var P = { x: x, y: 94 }, tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
      S.attOut.forEach(function (m) {
        if (m === c || m.at.y > S.lineY + 0.5) return;   /* onside when the ball is played */
        var dm = d2(m.at, P), mg = tds[0].t - dm / S.v(m); if (mg < -0.8) return;
        var q = { P: P, X: m, dX: dm, tds: tds, mg: mg, air: cut ? -S.stat(tds[0].m, 'intelligence') : S.stat(m, 'reach') - S.stat(tds[0].m, 'reach') };
        if (better(q, best)) best = q;
      });
    }
    /* the world's own target (the lead's call SIM-1): its man and its spot when the stop carries them; his race is still read here, so the
     * claim says how close it is (pm_claims.js re-reads it) */
    var tid = c4o ? (c4o.who || c4o.target || c4o.man || c4o.id || null) : null, tgt = tid ? S.attOut.filter(function (m) { return m.p.id === (tid.id || tid) && m !== c; })[0] : null;
    if (tgt) {
      var sp0 = c4o.spot || c4o.at || c4o.where || null, spots = sp0 && typeof sp0.x === 'number' ? [S.N(sp0)] : [];
      if (!spots.length) for (var x2 = cut ? 26 : 20; x2 <= (cut ? 42 : 48); x2 += 2) spots.push({ x: x2, y: 94 });
      var bt0 = null;
      spots.forEach(function (P) {
        var tds = S.defOut.map(function (m) { return { m: m, t: d2(m.at, P) / S.v(m) }; }).sort(function (a, b) { return a.t - b.t; });
        var dm = d2(tgt.at, P), mg = tds[0].t - dm / S.v(tgt);
        if (!bt0 || mg > bt0.mg) bt0 = { P: P, X: tgt, dX: dm, tds: tds, mg: mg, world: true };
      });
      if (bt0) best = bt0;
    }
    if (!best) return;
    var X = best.X, P0 = best.P, D = best.tds[0].m, dD = d2(D.at, P0), parts = [];
    var near = S.defOut.filter(function (m) { return m !== D && d2(m.at, P0) <= 5; });
    if (near.length) part(parts, -Math.min(2, near.length), first(near[0].p) + (near.length > 1 ? ' and ' + (near.length - 1) + ' more are' : ' is') + ' near where it lands as well (within 5 m)');
    var also = S.attOut.filter(function (m) { return m !== c && m !== X && m.at.y <= S.lineY + 0.5 && d2(m.at, P0) / S.v(m) < best.tds[0].t; });
    if (also.length) part(parts, 1, first(also[0].p) + ' can also get there before ' + first(D.p));
    var run = best.dX >= 2 ? ', who is running in (' + m0(best.dX) + ' m away)' : ', who is there already';
    if (best.mg < 0) part(parts, -1, first(D.p) + ' gets there at about the same time (' + Math.abs(m0(best.mg * 10) / 10) + ' s sooner)');
    var cl = [{ t: 'reach', man: X.p.id, spot: P0, before: D.p.id, within: best.mg >= 0 ? 0 : Math.max(0.8, Math.ceil(-best.mg * 10) / 10) }].concat(X.at.y <= S.lineY + 0.5 ? [{ t: 'onside', man: X.p.id }] : []).concat(cut ? [] : [{ t: 'wide', man: cp.id, max: 16 }]);
    var why = (cut ? 'he is on the byline side of their box' : 'he is wide (' + m0(wide(c.at.x)) + ' m from the touchline)') + ' and ' + first(X.p) + ' can get to the spot (' + m0(best.dX) + ' m) ' + (best.mg >= 0 ? m0(best.mg * 10) / 10 + ' s before ' : 'within ' + Math.abs(m0(best.mg * 10) / 10) + ' s of ') + first(D.p);
    if (cut) add({ kind: 'cut-back', id: 'Z_CUTBACK', man: X.p, free: dD >= 5, freeM: dD, lane: [c.at, P0], spot: P0, runFrom: X.at, foilMan: D.p, claims: cl, why: why, stopCard: true,
      b: { test: { mine: cp, mineAttr: 'passing', theirs: D.p, theirsAttr: 'intelligence' }, risk: 'low', bonus: 0, parts: parts.length ? capParts(parts, -3, 2) : undefined, to: X.p, pays: 'probe',
        does: { good: 'cuts it back past {foil} to ' + first(X.p), mixed: 'cuts it back, but {foil} is there', bad: 'cuts it back straight to {foil}' },
        label: first(cp) + ' cuts it back for ' + first(X.p) + run + ', with ' + first(D.p) + ' ' + m0(dD) + ' m from where it lands',
        read: first(cp) + ' (Passing ' + m0(S.stat(c, 'passing')) + ') against ' + first(D.p) + ' (Intelligence ' + m0(S.stat(D, 'intelligence')) + '), the first of theirs to the spot. ' + first(X.p) + ' has ' + m0(best.dX) + ' m to run to it.' } });
    else add({ kind: 'cross', id: 'Z_CROSS', man: X.p, free: dD >= 5, freeM: dD, lane: [c.at, P0], spot: P0, runFrom: X.at, foilMan: D.p, claims: cl, why: why, stopCard: true,
      b: { test: { mine: X.p, mineAttr: 'reach', theirs: D.p, theirsAttr: 'reach' }, risk: 'even', to: null, bonus: 0, parts: capParts(parts, -3, 2), because: first(X.p) + ' knows where the cross is going and ' + first(D.p) + ' does not', pays: 'header', actorFirst: X.p,
        does: { good: 'rises above {foil} to meet it', mixed: 'gets his head to it', bad: 'is beaten in the air by {foil}' },
        label: first(cp) + ' crosses it into their box for ' + first(X.p) + run + ', with ' + first(D.p) + ' ' + m0(dD) + ' m from where it lands',
        read: first(X.p) + ' (Reach ' + m0(S.stat(X, 'reach')) + ') against ' + first(D.p) + ' (Reach ' + m0(S.stat(D, 'reach')) + ') in the air. ' + first(X.p) + ' has ' + m0(best.dX) + ' m to run to it, ' + first(D.p) + ' ' + m0(dD) + ' m.' } });
  }
  /* the plain options that fill a stop menu the keep rule left with one live card: your attack, a pass to the nearest onside team-mate
   * (an open lane first; else past the man in the way, named); their attack, your nearest and second nearest men closing him down */
  function plainCards(ctx, S, add, only) {   /* b5 (r2 M2): only, a list of man ids: a plain pass to each of these men (a C2 stop's runners) */
    var c = S.car, cp = c.p;
    if (S.who === 'you') {
      var ms = S.attOut.filter(function (t) { var L = d2(c.at, t.at); return t !== c && t.at.y <= S.lineY + 0.5 && L >= 5 && L <= 45 && (!only || only.indexOf(t.p.id) >= 0); }).sort(function (a, b) { return d2(a.at, c.at) - d2(b.at, c.at); });
      var op = ms.filter(function (t) { return !laneBlockers(S, c.at, t.at).length; }), picks = only ? ms : op.slice(0, 2).concat(ms.filter(function (t) { return op.indexOf(t) < 0; }).slice(0, 2));   /* up to 4, open lanes first: a filler can be greyed */
      picks.forEach(function (t) {
        var L = d2(c.at, t.at), m = m0(L), dy = t.at.y - c.at.y, lb = laneBlockers(S, c.at, t.at).sort(function (a, b) { return segDist(a.at, c.at, t.at, 3) - segDist(b.at, c.at, t.at, 3); });
        var mk = nearest(S.defOut, t.at), foil = lb.length ? lb[0] : mk ? mk.m : null; if (!foil) return;
        var back = dy <= -8, fwd = dy >= 8, id = back ? 'Z_RECYCLE' : fwd ? 'Z_PASS_MID' : 'Z_LAYOFF', mineAttr = back ? 'technique' : 'passing', theirsAttr = back || fwd ? 'intelligence' : 'pace';
        var how = back ? ' passes it back to ' : fwd ? ' passes it forward to ' : ' gives it to ';
        add({ kind: back ? 'pass back' : fwd ? 'pass forward' : 'pass sideways', id: id, man: t.p, free: !!mk && mk.d >= 5, freeM: mk ? mk.d : 99, lane: [c.at, t.at], foilMan: foil.p, plain: true,
          why: lb.length ? first(foil.p) + ' is ' + segDist(foil.at, c.at, t.at, 3).toFixed(1) + ' m from the line of the pass' : 'open lane to the nearest team-mate (' + m + ' m)',
          claims: lb.length ? [{ t: 'onLine', man: foil.p.id, a: c.at, b: t.at, r: laneTrue(L) }, { t: 'onside', man: t.p.id }] : [{ t: 'lane', a: c.at, b: t.at, r: laneTrue(L) }, { t: 'onside', man: t.p.id }],
          b: { test: { mine: cp, mineAttr: mineAttr, theirs: foil.p, theirsAttr: theirsAttr }, risk: 'low', bonus: 0, to: t.p, pays: back ? 'back' : fwd ? 'probe' : 'hold', cStage: back ? { back: true } : undefined,
            does: { good: (back ? 'passes it back to ' : 'gives it to ') + first(t.p), mixed: 'gives it to ' + first(t.p) + ', a little behind him', bad: 'plays it straight to {foil}' },
            label: first(cp) + how + first(t.p) + ' (' + m + ' m)' + (lb.length ? ', with ' + first(foil.p) + ' in the way' : ''),
            read: first(cp) + ' (' + (mineAttr === 'technique' ? 'Technique ' : 'Passing ') + m0(S.stat(c, mineAttr)) + ') against ' + first(foil.p) + ' (' + (theirsAttr === 'pace' ? 'Pace ' : 'Intelligence ') + m0(S.stat(foil, theirsAttr)) + '), ' + (lb.length ? 'the man in the way of the pass.' : 'the opponent nearest the pass.') } });
      });
    } else {
      var E = ctx.tzone >= 1, mine = S.defOut.slice().sort(function (a, b) { return d2(a.at, c.at) - d2(b.at, c.at); });
      mine.slice(0, 2).forEach(function (m, i) {
        var d = d2(m.at, c.at);
        add({ kind: i ? 'second man steps in' : 'close down', id: E ? 'E_TACKLE' : 'M_PRESS', man: m.p, free: false, freeM: d, lane: [m.at, c.at], foilMan: cp, plain: true,
          why: first(m.p) + ' is the ' + (i ? 'second ' : '') + 'nearest of yours, ' + d.toFixed(1) + ' m from him',
          claims: [{ t: 'near', a: m.p.id, b: cp.id, max: Math.ceil(d) + 0.5 }],
          b: { test: { mine: m.p, mineAttr: 'defending', theirs: cp, theirsAttr: 'technique' }, risk: 'even', grants: { good: [{ id: E ? 'caught' : 'short' }] }, winZone: E ? 1 : undefined, pays: 'twin',
            does: E ? { good: 'times the tackle on {foil}', mixed: 'gets in front of {foil}', bad: 'mistimes the tackle' } : { good: 'gets to {foil} and takes the ball off him', mixed: 'gets to {foil}, who cannot go forward', bad: 'gets to {foil} too late' },
            label: first(m.p) + ' goes at ' + first(cp) + ' (' + m0(d) + ' m) to win the ball',
            read: first(m.p) + ' (Defending ' + m0(S.stat(m, 'defending')) + ') against ' + first(cp) + ' (Technique ' + m0(S.stat(c, 'technique')) + ').' } });
      });
    }
  }
  /* M-3 at a stop: manway.js classOf, the same rule (which cards it reads) */
  function m3class(o) {
    if (!o || o.disabled || o.rattled || o.noRoll || o.fixedOdds || (o.chances && o.chances.fixed)) return null;
    if (o.mineAttr !== 'passing' || !o.themAttr || o.mineVal === null || o.themVal === null || !o.actor || !o.foil) return null;
    var tg = o.tags || [];
    if (tg.indexOf('pass') < 0 || (tg.indexOf('cross') >= 0 && tg.indexOf('low cross') < 0)) return null;
    return tg.indexOf('switch') >= 0 || tg.indexOf('long ball') >= 0 ? 'long' : 'ground';
  }
  /* M-3's reading of one card from the stop's picture, with pm.js's own geometry (laneTrue, segDist): the man nearest the line of the
   * pass (their outfield men; their keeper only on a card whose duel is already with him), within 2 m + 5 cm a metre, the first 3 m not
   * counted, the line to the receiver (6 m beyond him toward their goal for a through ball); a pass longer than 20 m, -1 a 10 m more */
  function m3read(S, o, cls) {
    function at(p) { return p ? S.att.concat(S.def).filter(function (m) { return m.p.id === p.id; })[0] || null : null; }
    var A0 = at(o.actor), R0 = at(o.to || o.receiver || o.mate || null); if (!A0 || !R0) return null;
    var to = { x: R0.at.x, y: R0.at.y }; if ((o.tags || []).indexOf('through ball') >= 0) to = { x: to.x, y: Math.min(101, to.y + 6) };
    var L = d2(A0.at, to), parts = [], man = null, dm = null;
    if (cls === 'ground') {
      var list = S.defOut.slice(), kd = S.def.filter(function (m) { return m.k; })[0]; if (kd && o.foil && o.foil.id === kd.p.id) list.push(kd);
      var r = laneTrue(L); list.forEach(function (m) { var dd = segDist(m.at, A0.at, to, 3); if (dd < r && (!man || dd < dm)) { man = m; dm = dd; } });
      if (man) { var n = dm < 1 ? -4 : dm < 2 ? -2 : -1; parts.push({ n: n, why: first(man.p) + ' is ' + dm.toFixed(1) + ' m from the line of the pass' + (n <= -2 ? ', so he can cut it out' : '') }); }
    }
    var Lm = Math.round(L); if (Lm > 20) parts.push({ n: -Math.ceil((Lm - 20) / 10), why: 'a long pass (' + Lm + ' m) is easier to read' });
    if (!man && !parts.length) return null;
    return { foil: man ? man.p : null, parts: parts, d: dm, len: Lm, cls: cls };
  }
  /* (manway.js TAKE: what a rebuilt card gives the card on the menu, everything about its duel, never its place or its label) */
  var M3TAKE = ['foil', 'themVal', 'themAttr', 'mineVal', 'mineAttr', 'edge', 'mods', 'theirMods', 'uses', 'bonus', 'because', 'chances', 'certain', 'check', 'read',
    'outcomes', 'a16Plan', 'a16Floor', 'a16Way', 'r12Best', 'r12BestFrom', 'guess', 'counterNotes', 'learned', 'duel', 'fxRec', 'fx', 'fxNote', 'multi', 'grants',
    'saysEdge', 'theirTo', 'theirGrant', 'shotBy', 'stamina', 'cost'];
  function stopWay(O, ctx, S, cands, built) {
    if (!O.a16Rebuild) return [];
    var way = {}, ids = {}, read = [];
    built.forEach(function (o) {
      var cls = m3class(o); if (!cls || !o.a16Key) return;
      var rd = m3read(S, o, cls); if (!rd) return;
      way[o.a16Key] = rd; ids[o.id] = true; read.push({ o: o, rd: rd });
    });
    if (!read.length) return [];
    var nu = swapPool(O, entriesOf(ctx, cands, {}), function () { return O.a16Rebuild(ctx, ids, way); }), out = [];
    read.forEach(function (r) {
      var o = r.o, n = nu.filter(function (q) { return q.a16Key === o.a16Key; })[0];
      if (!n || n.disabled) return;
      var was = { foil: o.foil, chances: o.chances };
      M3TAKE.forEach(function (k) { if (k in n) o[k] = n[k]; else delete o[k]; });
      if (was.foil && o.foil && was.foil !== o.foil) o.label = String(o.label).split(', with ' + first(was.foil) + ' trying to stop it').join(', with ' + first(o.foil) + ' trying to stop it');
      out.push({ id: o.id, label: o.label, cls: r.rd.cls, was: was.foil ? was.foil.id : null, man: r.rd.foil ? r.rd.foil.id : null, d: r.rd.d, len: r.rd.len, parts: r.rd.parts, before: was.chances, after: o.chances });
    });
    return out;
  }

  function candidates(ctx, S, stop) {
    var out = [];
    function add(k) { if (!OFFK[k.kind]) out.push(k); }
    if (S.who === 'you') {
      spotCards(ctx, S, add); safePassCards(ctx, S, add); overlapCards(ctx, S, add); carryCards(ctx, S, add);
      finishCards(ctx, S, add); crossCards(ctx, S, add); cutbackCards(ctx, S, add);
    } else defendCards(ctx, S, add);
    if (KWON) kwCards(ctx, S, add);
    if (stop && STOPNEW && S.who === 'you') { stopShot(ctx, S, add, stop, out); stopCross(ctx, S, add, stop, out); }   /* (at a world stop only) */
    return out;
  }

  /* ------------------------------------------------------------------ the cards of today's menu this file replaces */
  var REPLACED = {};
  ['Z_PASS_MID', 'Z_THROUGH', 'Z_RUN_BEHIND', 'Z_OVERLAP', 'Z_LAYOFF', 'Z_RECYCLE', 'Z_SWITCH', 'Z_WIDE', 'Z_KEEP_BACK', 'Z_CARRY', 'Z_CARRY_OUT', 'Z_TAKE_ON',
    'Z_SHOOT', 'Z_SHOOT_EDGE', 'Z_SHOOT_FAR', 'Z_PLACE', 'Z_CHIP', 'Z_CROSS', 'Z_CUTBACK', 'Z_PULLBACK', 'Z_SQUARE', 'Z_LONG_UP',
    'M_PRESS', 'M_CUT', 'E_TACKLE', 'E_WIDE', 'E_DOUBLE', 'E_BLOCK', 'E_FOUL', 'M_FOUL', 'E_OFFSIDE', 'E_COVER', 'E_RACE', 'HEAD_CLEAR'].forEach(function (k) { REPLACED[k] = true; });

  /* where the picture menu covers a decision at all */
  function covers(ctx, p) {
    if (!ctx || !ctx.sit || !ctx.state) return false;
    if (ctx.boxStep || ctx.mode || ctx.sit.id === 'keeper_to_feet') return false;
    if (p && (p.showing || p.showSafeCards)) return false;
    if (SIDE && ctx.sit.who !== SIDE) return false;
    if (ctx.sit.who === 'you') return typeof ctx.zone === 'number' && ctx.zone >= 0 && ctx.zone <= 3;
    return typeof ctx.tzone === 'number' && ctx.tzone >= 0 && ctx.tzone <= 1 && !(ctx.play && ctx.play.air);
  }

  /* ------------------------------------------------------------------ build with options.js's own builder */
  /* (b4 PLAY-PM: the entries and the swap of options.js's POOL are shared with the M-3 rebuild at a stop; build() does what it did) */
  function entriesOf(ctx, cands, byLabel) {
    var who = ctx.sit.who, zoneMode = who === 'you', tMode = typeof ctx.tzone === 'number';
    var mode = zoneMode ? (ctx.mode || null) : null;
    return cands.map(function (k) {
      byLabel[k.b.label] = k;
      var e = { id: k.id, family: k.b.risk === 'low' ? 'hold' : 'move', side: who, box: !!ctx.boxStep, answer: true, keeperBall: ctx.sit.id === 'keeper_to_feet', pmKind: k.kind,
        when: function () { return true; }, build: function () { var b = {}; Object.keys(k.b).forEach(function (q) { if (k.b[q] !== undefined) b[q] = k.b[q]; }); if (NOPARTS) delete b.parts; if (BIAS && who === 'you') b.parts = (b.parts || []).concat([{ n: BIAS, why: 'calibration (measuring only)' }]); return b; } };
      if (k.entry) Object.keys(k.entry).forEach(function (q) { e[q] = k.entry[q]; });   /* (PICMENU2: a keyword card keeps today's keyword, pair, high ball...) */
      if (zoneMode) { e.zones = [ctx.zone]; if (mode) e.inModes = [mode]; }
      if (tMode) e.tzones = [ctx.tzone];
      return e;
    });
  }
  function swapPool(O, entries, fn) {
    var saved = O.POOL.slice(), kept = saved.filter(function (e) { return !REPLACED[e.id] && !(KWON && KW_REPL[e.id]); });
    O.POOL.length = 0; kept.concat(entries).forEach(function (e) { O.POOL.push(e); });
    var r = null, err = null;
    try { r = fn(); } catch (e) { err = e; }
    O.POOL.length = 0; saved.forEach(function (e) { O.POOL.push(e); });
    if (err) throw err;
    return r;
  }
  function build(O, ctx, cands) {
    var byLabel = {}, entries = entriesOf(ctx, cands, byLabel);
    var r = swapPool(O, entries, function () { return O.offer(ctx, 4); });
    var all = r.available || [];
    all.forEach(function (o) { if (byLabel[o.label]) o.mc = byLabel[o.label]; });
    return { built: all, shown: r.shown || [] };
  }

  /* ------------------------------------------------------------------ the keep rule: 3 to 4 cards that differ in kind AND risk */
  function sure(o) { var c = o.chances || {}; return (c.good || 0) >= 0.9 - 1e-9 && (c.bad || 0) <= 1e-9; }
  function dead(o) { var c = o.chances || {}; return ((c.good || 0) < 0.05 && (c.bad || 0) >= 0.5) || o.disabled; }   /* hopeless: it hardly ever works and mostly loses the ball */
  function band(o) { var c = o.chances || {}, g = c.good || 0; if (sure(o)) return 'sure'; return g >= 0.65 ? 'likely' : g >= 0.35 ? 'even' : 'long'; }   /* how likely the card is to come off cleanly */
  function groupOf(o) {
    if (o.mc) { var k = o.mc.kind; return k === 'pass back' || k === 'pass sideways' ? 'keep it' : k; }
    return 'x:' + o.id;
  }
  /* what a card is worth to the manager: today's worth (goal, ball kept, ball lost) plus a little for each zone the ball goes on */
  function valueOf(O, o) { var v = O.worth(o); (o.outcomes || []).forEach(function (x) { if (typeof x.move === 'number' && x.move > 0) v += 0.12 * x.p * x.move; }); return v; }
  function keep(O, built, ctx, S) {
    var live = built.filter(function (o) { return !o.disabled && o.chances && !dead(o); });
    var nonPM = live.filter(function (o) { return !o.mc; }), pm = live.filter(function (o) { return o.mc; });
    var judged = nonPM.length && S ? judge(ctx, S, nonPM) : [];
    var bad = {}; judged.forEach(function (v) { if (!v.ok) bad[v.id + '|' + v.label] = v; });
    var dropped = nonPM.filter(function (o) { return bad[o.id + '|' + o.label]; });
    nonPM = nonPM.filter(function (o) { return !bad[o.id + '|' + o.label]; });
    live = pm.concat(nonPM);
    if (!live.length) { live = built.filter(function (o) { return !o.disabled && o.chances; }).sort(function (a, b) { return ((a.chances.bad) || 0) - ((b.chances.bad) || 0); }).slice(0, 2); }
    function better(a, b) { var d = valueOf(O, a) - valueOf(O, b); if (Math.abs(d) > 1e-9) return d > 0; return ((a.chances && a.chances.good) || 0) > ((b.chances && b.chances.good) || 0); }
    /* per kind: the best card, and a second for another man at another risk level (his pass into space to Oyarzabal beside the safer one to Yamal) */
    var per = {};
    live.slice().sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; }).forEach(function (o) {
      var k = groupOf(o), g = per[k] || (per[k] = []);
      if (!g.length) g.push(o);
      else if (o.mc && g.length < 2 && g[0].mc && g[0].mc.man !== o.mc.man && band(g[0]) !== band(o)) g.push(o);
    });
    var pool = []; Object.keys(per).forEach(function (k) { per[k].forEach(function (o) { pool.push(o); }); });
    /* two kinds that read the same (same results within 3 in 100) count once: a hard and a placed shot at the same odds */
    var pool0 = pool.slice(); pool = pool0.filter(function (o, i) { return !pool0.some(function (q, j) { return j < i && same(q, o); }); });
    var mx = Math.max.apply(null, pool.map(function (o) { return Math.abs(valueOf(O, o)); }).concat([1e-9]));
    var pick = [];
    /* PICMENU2 (his PM-3, "make sure they do trigger often"): a keyword or pair card the picture makes has its own place: the
     * best of them (not a hopeless one: those were dropped above) is on the menu first. KM_PM_KWSLOT=off: no own place. */
    if (KWSLOT) {
      var kws = pool.filter(function (o) { return o.mc && o.mc.kwc; }).sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; });
      if (kws.length) pick.push(pool.splice(pool.indexOf(kws[0]), 1)[0]);
    }
    while (pick.length < 4 && pool.length) {
      var bands = pick.map(band), nSure = pick.filter(sure).length;
      var sc = pool.map(function (o) {
        var s = valueOf(O, o) / mx;
        if (bands.indexOf(band(o)) < 0) s += 1;                       /* a risk level not on the menu yet */
        if (sure(o) && nSure >= 1) s -= 1.2;                          /* never an all-certain menu */
        if (!o.mc && (o.fxSource || /^KW_/.test(o.id))) s += 0.6;     /* a piece's or a trait's card: the squad is your hand */
        if (KWON && o.mc && o.mc.kwc) s += 0.6;                       /* (PICMENU2: and a keyword or pair card the picture made) */
        if (BRK.jitter) s += Math.random() * 0.6;                    /* (a break: the keep rule rolls dice; pm_check.js C4 must fail) */
        if (!o.mc && UTIL[o.id]) s -= 1.0;                            /* a utility card (a substitution, time wasting, keeping it) only fills a menu */
        if (pick.length >= 3 && bands.indexOf(band(o)) >= 0) s -= 2;  /* the fourth card must add a new risk level */
        return s;
      });
      var bi = sc.indexOf(Math.max.apply(null, sc));
      if (pick.length >= 3 && sc[bi] < 0.3) break;
      pick.push(pool.splice(bi, 1)[0]);
    }
    if (pick.length < 3) {   /* fewer than 3 kinds: the next best card for another man fills the menu to 3 */
      var rest = live.filter(function (o) { return pick.indexOf(o) < 0 && !pick.some(function (q) { return q.mc && o.mc && q.mc.man === o.mc.man && q.mc.kind === o.mc.kind; }); });
      rest.sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; });
      while (pick.length < 3 && rest.length) pick.push(rest.shift());
    }
    if (pick.length < 3) {   /* still fewer than 3: the least bad of the cards that hardly ever work (never a card the builder greyed) */
      var hop = built.filter(function (o) { return !o.disabled && o.chances && pick.indexOf(o) < 0 && !bad[o.id + '|' + o.label] && !pick.some(function (q) { return q.mc && o.mc && q.mc.kind === o.mc.kind && q.mc.man === o.mc.man; }); });
      hop.sort(function (a, b) { return ((b.chances.good || 0) - (b.chances.bad || 0)) - ((a.chances.good || 0) - (a.chances.bad || 0)); });
      while (pick.length < 3 && hop.length) pick.push(hop.shift());
    }
    return { pick: pick, live: live, dropped: dropped };
  }
  /* (b4 PLAY-PM, at a world stop only) the card the stop is for goes on the menu when the keep rule left it off (in place of the card
   * worth least, when the menu is full); a menu left with fewer than 2 live cards takes the other live cards built, then the plain options */
  function stopFill(O, ctx, S, stop, k, bt, sMW, way) {
    function live(o) { return o && !o.disabled && o.chances; }
    function byWorth(a, b) { return valueOf(O, b) - valueOf(O, a); }
    var need = stopNeed(stop, S.who);
    if (need && !k.pick.some(function (o) { return famOf(o) === need; })) {
      var f = bt.built.filter(function (o) { return live(o) && famOf(o) === need; }).sort(byWorth)[0];
      if (f) {
        if (k.pick.length >= 4) { var lo = k.pick.slice().sort(byWorth).pop(); k.pick.splice(k.pick.indexOf(lo), 1); }
        k.pick.push(f); k.forced = f;
      }
    }
    /* b5 (r2 M2): the ball to a runner the world found at a C2 stop of yours */
    var kk0 = stopKinds(stop);
    if (STOPRUN && S.who === 'you' && kk0[0] === 'C2' && stop.c2 && stop.c2.length) {
      var isRun = function (o) { var m2 = o && o.mc && o.mc.man, mid = m2 && (m2.id || m2); return !!mid && stop.c2.indexOf(mid) >= 0; };
      if (!k.pick.some(isRun)) {
        var fr = bt.built.filter(function (o) { return live(o) && isRun(o); }).sort(byWorth)[0];
        if (fr) {
          if (k.pick.length >= 4) { var lo2 = k.pick.filter(function (o) { return o !== k.forced; }).sort(byWorth).pop(); if (lo2) k.pick.splice(k.pick.indexOf(lo2), 1); }
          k.pick.push(fr); k.forcedRun = fr;
        } else {
          var gr = bt.built.filter(function (o) { return o && o.disabled && o.mc && isRun(o) && k.pick.indexOf(o) < 0; }).sort(byWorth)[0];
          if (!gr) {   /* no card to a runner was built (pm.js's spot rule found no spot where the world found one): a plain pass to him, read by M-3 */
            var rc = []; plainCards(ctx, S, function (q) { rc.push(q); }, stop.c2);
            if (rc.length) {
              var b3 = build(O, ctx, rc), mr = b3.built.filter(function (o) { return o.mc && o.mc.plain && isRun(o); });
              if (sMW) { var w3 = stopWay(O, ctx, S, rc, mr); if (way) w3.forEach(function (x) { way.push(x); }); }
              bt.built = bt.built.concat(mr);
              var lv = mr.filter(live).sort(byWorth)[0];
              if (lv) { if (k.pick.length >= 4) { var lo3 = k.pick.filter(function (o) { return o !== k.forced; }).sort(byWorth).pop(); if (lo3) k.pick.splice(k.pick.indexOf(lo3), 1); } k.pick.push(lv); k.forcedRun = lv; STATS.runPlain = (STATS.runPlain || 0) + 1; }
              else gr = mr.filter(function (o) { return o.disabled; })[0] || null;
            }
          }
          if (gr) { k.greyRun = gr; STATS.runGrey = (STATS.runGrey || 0) + 1; } else if (!k.forcedRun) STATS.runNone = (STATS.runNone || 0) + 1;
        }
      }
    }
    if (k.pick.length >= 2) return;
    var more = bt.built.filter(function (o) { return live(o) && k.pick.indexOf(o) < 0 && k.dropped.indexOf(o) < 0; }).sort(byWorth);
    while (k.pick.length < 2 && more.length) k.pick.push(more.shift());
    if (k.pick.length >= 2) return;
    var pc = []; plainCards(ctx, S, function (q) { if (!k.pick.some(function (o) { return o.mc && o.mc.kind === q.kind && o.mc.man === q.man; })) pc.push(q); });
    if (!pc.length) return;
    var b2 = build(O, ctx, pc), mine = b2.built.filter(function (o) { return o.mc && o.mc.plain; });
    if (sMW) { var w2 = stopWay(O, ctx, S, pc, mine); if (way) w2.forEach(function (x) { way.push(x); }); }
    var fl = mine.filter(live);
    while (k.pick.length < 2 && fl.length) k.pick.push(fl.shift());
    k.filled = mine.length;
    bt.built = bt.built.concat(mine);
  }
  var UTIL = { FRESH_LEGS: 1, WASTE_TIME: 1, HOLD: 1, THROW_EVERYONE: 1, KEEPER_UP: 1 };
  function same(a, b) {
    var x = a.chances || {}, y = b.chances || {};
    return a !== b && a.mc && b.mc && a.mc.kind !== b.mc.kind && Math.abs((x.good || 0) - (y.good || 0)) < 0.03 && Math.abs((x.bad || 0) - (y.bad || 0)) < 0.03 && /shot/.test(a.mc.kind) && /shot/.test(b.mc.kind);
  }

  /* ------------------------------------------------------------------ today's cards against the picture (the cards this file keeps: pieces, traits, pairs) */
  function judge(ctx, S, opts) {
    var c = S.car;
    function at(p) { var m = S.att.concat(S.def).filter(function (q) { return p && q.p.id === p.id; })[0]; return m || null; }
    return opts.map(function (o) {
      var tags = o.tags || [], v = { id: o.id, label: o.label, ok: true, why: '' };
      var to = at(o.to), foil = at(o.foil), mate = at(o.mate), isPass = tags.indexOf('pass') >= 0 || tags.indexOf('cross') >= 0;
      if (S.who === 'you') {
        if (tags.indexOf('shot') >= 0) { v.ok = d2(c.at, GOAL) <= 30; }
        else if (tags.indexOf('dribble') >= 0 || tags.indexOf('carry') >= 0) {
          if (tags.indexOf('overlap') >= 0) {   /* a run round the outside: the runner is outside the man on the ball, on his side, level or behind */
            var rn = at(o.actor); v.ok = !!rn && (rn.at.x < 34) === (c.at.x < 34) && wide(rn.at.x) < wide(c.at.x) - 2 && rn.at.y <= c.at.y + 4 && rn.at.y >= c.at.y - 14; return v;
          }
          var fr = inFront(S, c.at); v.ok = !!foil && fr.indexOf(foil) >= 0 && fr.length <= 1;
        } else if (isPass && (to || mate)) {
          var tgt = to || mate;
          if (tags.indexOf('cross') >= 0 && tags.indexOf('header') >= 0 && !to) return v;
          v.ok = laneBlockers(S, c.at, tgt.at).length === 0;
        }
      } else {
        var mine = at(o.actor);
        if (tags.indexOf('tackle') >= 0 || tags.indexOf('press') >= 0) { var dd = mine ? d2(mine.at, c.at) : 99; v.ok = tags.indexOf('foul') >= 0 ? dd <= 6 : dd <= 12; }
        else if (tags.indexOf('block') >= 0) v.ok = !!mine && shotBlockers(S, c.at).indexOf(mine) >= 0;
      }
      return v;
    });
  }

  /* ------------------------------------------------------------------ apply: replace a pending decision's menu */
  var STATS = { seen: 0, applied: 0, skipped: {}, noctx: 0, mismatch: 0 };
  function skip(why) { STATS.skipped[why] = (STATS.skipped[why] || 0) + 1; return { applied: false, why: why }; }
  function apply(O, st, p, pic, opts) {
    opts = opts || {};
    STATS.seen++;
    if (!ON && !opts.force) return skip('off');
    if (!p || !p.moment || !pic || !pic.pos) return skip('nopic');
    var arr = p.moment.options, ctx = arr && arr.pmCtx;
    if (!ctx) { STATS.noctx++; return skip('noctx'); }
    if (!covers(ctx, p)) return skip('not covered');
    var S = scene(ctx, pic), holderId = pic.holder;
    if (!S.car) {   /* the picture has nobody holding the ball: the man the decision names (kept simple: skip) */
      return skip('no holder');
    }
    var named = ctx.sit.who === 'you' ? ctx.actor : ctx.foil;
    if (named && S.car.p.id !== named.id && !opts.anyCarrier) { STATS.mismatch++; return skip('carrier differs'); }
    /* (b4 PLAY-PM: at a world stop, p.simStop; sNew: the stop card and two live cards, sMW: M-3 on your pass cards) */
    var stop = p.simStop || null, sNew = !!stop && STOPNEW, sMW = !!stop && STOPMW && ctx.sit.who === 'you', way = null;
    var cands = candidates(ctx, S, stop);
    if (!cands.length && sNew) plainCards(ctx, S, function (q) { cands.push(q); });   /* (a stop with no kind: the plain options, not today's menu) */
    if (!cands.length) return skip('no kinds');
    var saveSkin = ctx.state.g11Skin;
    function skinOn() { if (p.rattledAt) ctx.state.g11Skin = { seed: st ? st.seed : 0, moment: p.rattledAt.moment }; }
    function skinOff() { if (p.rattledAt) { if (saveSkin === undefined) delete ctx.state.g11Skin; else ctx.state.g11Skin = saveSkin; } }
    skinOn();
    var bt;
    try { bt = build(O, ctx, cands); if (sMW) way = stopWay(O, ctx, S, cands, bt.built); } finally { skinOff(); }
    var k = keep(O, bt.built, ctx, S);
    if (sNew) { skinOn(); try { stopFill(O, ctx, S, stop, k, bt, sMW, way); } finally { skinOff(); } }
    if (sMW) { p.a16WayDone = true; if (way && way.length) p.a16Way = way; }
    if (!k.pick.length) return skip('nothing live');
    if (BRK.dryleak && st && st.rng) st.rng.next();   /* (a break: the build draws a number from the match's dice; pm_check.js C2 must fail) */
    if (DRY || opts.dry) return { applied: false, why: 'dry', cards: k.pick, cands: cands, built: bt.built, S: S, dropped: k.dropped };
    var before = arr.slice(), pmK = {};
    var final = k.pick.slice();
    final.sort(function (a, b) { var o1 = { sure: 0, likely: 1, even: 2, long: 3 }; return (o1[band(a)] - o1[band(b)]) || (O.worth(b) - O.worth(a)); });
    final.forEach(function (o) { o.pm = true; });
    /* fewer than 3 live cards: the cards the picture offers that cannot come off are shown greyed (as today's menu shows them), so the manager sees why they are not a choice */
    if (k.greyRun && final.indexOf(k.greyRun) < 0) {   /* b5 (r2 M2): greyed, with its reason; (Codex r1 item 8) at most 4 cards: it takes the place of the last live card that is not the stop's forced one (break c2cap: no cap) */
      if (final.length >= 4 && !SIMBRK.c2cap) { for (var ci = final.length - 1; ci >= 0; ci--) if (final[ci] !== k.forced) { final.splice(ci, 1); STATS.runGreyCap = (STATS.runGreyCap || 0) + 1; break; } }
      k.greyRun.pm = true; k.greyRun.pmGrey = true; final.push(k.greyRun);
    }
    if (final.length < 3) {
      var greys = bt.built.filter(function (o) { return o.disabled && o.mc && final.indexOf(o) < 0; }).sort(function (a, b) { return O.worth(b) - O.worth(a); });
      while (final.length < 3 && greys.length) { var g = greys.shift(); g.pm = true; g.pmGrey = true; final.push(g); }
    }
    p.moment.options = final;
    Object.defineProperty(final, 'pmCtx', { value: ctx, enumerable: false, configurable: true });
    p.moment.available = bt.built;
    p.pm = { cards: final.length, cands: cands.length, before: before, kinds: final.map(function (o) { return o.mc ? o.mc.kind : 'x:' + o.id; }), dropped: k.dropped.length, S: S };
    if (O.annotate && p.iconInfo) O.annotate(final, p.iconInfo);
    if (opts.refresh) opts.refresh(st, p);
    STATS.applied++;
    return { applied: true, cards: final, cands: cands, built: bt.built, facts: p.pm, S: S, dropped: k.dropped };
  }

  /* the page: the picture of the decision is final (wordsStaged); returns true when the menu was replaced */
  function stage(st, p, frame) {
    var O = root.KMOptions || (typeof require === 'function' ? require('./options.js') : null), X = root.KMMatch;
    if (!O || !frame) return false;
    var r = apply(O, st, p, { pos: frame.pos, ball: frame.ball, holder: frame.holder }, { refresh: X && X.pmRefresh });
    return !!r.applied;
  }

  var API = { ON: ON, apply: apply, stage: stage, scene: scene, candidates: candidates, keep: keep, build: build, judge: judge, covers: covers, band: band, sure: sure, dead: dead,
    STATS: STATS, REPLACED: REPLACED, laneBlockers: laneBlockers, laneR: laneR, shotBlockers: shotBlockers, inFront: inFront, GOAL: GOAL, flags: { off: OFFK, brk: BRK } };
  root.KMPM = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
