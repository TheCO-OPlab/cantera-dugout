/* Key Moments v2: the model.
 *
 * The idea in one sentence:
 *
 *   STYLE DOES NOT PICK MOMENTS. Style changes the pitch, and every situation
 *   reads the pitch through the SAME ten numbers.
 *
 * Under those ten sit the seven attributes (attributes.js), which is the layer
 * Eduardo was right to ask for. The chain is:
 *
 *   seven attributes  ->  ten primitives  ->  twelve situations
 *
 * Note what did NOT change when the whole stat model was replaced on
 * 2026-09-21: not one situation. The twelve weight functions below are
 * character for character what they were when the stats were WIN, PROGRESS and
 * FINISH. That is the middle layer doing its job, and it is the reason the
 * primitives are worth having as a layer at all.
 *
 * Runs in a browser as a classic script and under node.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  var A = root.KMAttr || require('./attributes.js');
  var O = root.KMOptions || require('./options.js');
  var KWL = root.KMKeywords || require('./keywords.js');

  /* ------------------------------------------------------------- style */

  var DIALS = [
    { id: 'press', name: 'Press height', low: 'Sit off', high: 'Press high',
      text: 'How high up the pitch you try to win it back.' },
    { id: 'direct', name: 'Directness', low: 'Build it', high: 'Go long',
      text: 'How quickly you want it forward.' },
    { id: 'width', name: 'Width', low: 'Through the middle', high: 'Out wide',
      text: 'Where you attack.' }
  ];

  function burnRates(style) {
    return {
      def: 1.2 + (style.press / 100) * 3.0 + (style.width / 100) * 2.2,
      mid: 1.5 + (style.press / 100) * 6.5 + (1 - style.direct / 100) * 2.0,
      att: 1.0 + (style.width / 100) * 2.0 + (style.direct / 100) * 1.6
    };
  }

  /* A line with more Physical lasts longer. This is the one place stamina
   * lives, and it is the reason Physical is not simply strength. */
  function staminaFactor(squad, lineNo) {
    return 1.25 - (A.lineAvg(squad, lineNo, 'physical') / 20) * 0.5;
  }

  /* -------------------------------------------------------- primitives */
  /* TEN. Every situation reads only from this list, and every one of them is a
   * weighted average of attributes over a line or a lane. An eleventh is the
   * signal to stop and ask whether the vocabulary is really shared. */

  function mix(squad, lineNo, legs, w) {
    var t = 0, n = 0;
    squad.players.forEach(function (p) {
      if (p.line !== lineNo) return;
      var v = 0;
      for (var k in w) v += A.eff(p, k, legs) * w[k];
      t += v; n++;
    });
    return n ? t / n : 0;
  }
  function laneMix(squad, lane, legs, w) {
    var t = 0, n = 0;
    squad.players.forEach(function (p) {
      if (C.CHANNEL_OF[p.slot] !== lane) return;
      var v = 0;
      for (var k in w) v += A.eff(p, k, legs) * w[k];
      t += v; n++;
    });
    return n ? t / n : 0;
  }

  /* The weakest man in a line, by a weighted read. Used where football says
   * the chain breaks at its weakest link rather than at its average. */
  function weakest(squad, lineNo, legs, w) {
    var lo = null, who = null;
    squad.players.forEach(function (p) {
      if (p.line !== lineNo) return;
      var v = 0;
      for (var k in w) v += A.eff(p, k, legs) * w[k];
      if (lo === null || v < lo) { lo = v; who = p; }
    });
    return { v: lo === null ? 0 : lo, p: who };
  }

  /* what each primitive is made of, printed on screen so the chain is visible */
  var RECIPE = {
    winHigh: 'midfield Defending, Pace, Intelligence',
    cover: 'your WEAKEST defender, then the back line average: Pace, Defending, Intelligence',
    buildUp: 'back line Passing and Technique',
    carry: 'midfield Technique, Pace, Passing',
    boxThreat: 'attack Finishing, Technique and height',
    flank: 'your best flank: Pace and Technique',
    theirDirect: 'their attack Finishing, Physical and height',
    theirCarry: 'their midfield Technique and Pace',
    theirPress: 'their midfield Defending, Physical, Pace'
  };

  function primitives(squad, opp, style, state) {
    var L = state.legs, F = 100;
    var wk = weakest(squad, 0, L.def, { pace: 0.55, defending: 0.25, intelligence: 0.20 });
    return {
      press: style.press,
      direct: style.direct,
      width: style.width,

      winHigh: mix(squad, 1, L.mid, { defending: 0.45, pace: 0.30, intelligence: 0.25 }) * 1.95,
      /* A back line is as exposed as its WEAKEST man. A ball in behind goes at
       * the slowest defender, not at the average of four. Averaging was hiding
       * exactly the change a manager makes: swap one slow centre-back and the
       * forecast should move, and on the average it barely did. */
      cover: (wk.v * 0.6
        + mix(squad, 0, L.def, { pace: 0.40, defending: 0.35, intelligence: 0.25 }) * 0.4) * 2.05
        * (1 - style.press / 340),

      /* Named, because this is where the actionability actually lives. The
       * percentage barely moves when you sign one quick defender, since the
       * next slowest man becomes the weak link. What a manager can act on is
       * not a five point swing in an abstract share: it is the game saying
       * "Tarn Grimsdale, Pace 9, is the man they keep going at." */
      weakLink: wk.p,
      buildUp: mix(squad, 0, L.def, { passing: 0.60, technique: 0.40 }) * 1.75,
      carry: mix(squad, 1, L.mid, { technique: 0.45, pace: 0.30, passing: 0.25 }) * 2.55,
      boxThreat: mix(squad, 2, L.att, { finishing: 0.70, technique: 0.30 }) * 1.85
        + A.lineReach(squad, 2, L.att) * 0.25,   // rescaled: aerial values roughly doubled with his metres formula
      flank: Math.max(
        laneMix(squad, 0, L.def, { pace: 0.50, technique: 0.50 }),
        laneMix(squad, 2, L.def, { pace: 0.50, technique: 0.50 })
      ) * 1.85,

      theirDirect: mix(opp, 2, F, { finishing: 0.55, physical: 0.45 }) * 1.45
        + A.lineReach(opp, 2, F) * 0.38,         // same rescale
      theirCarry: mix(opp, 1, F, { technique: 0.50, pace: 0.50 }) * 2.25,
      theirPress: mix(opp, 1, F, { defending: 0.50, physical: 0.30, pace: 0.20 }) * 1.95
    };
  }

  /* Smooth, never clamped. The first version used Math.max(14, cover) and the
   * clamp swallowed the whole signal exactly where it mattered: a weak defence
   * and a hopeless one were identical to the model. */
  function exposure(v, k) { k = k || 40; return k / (14 + Math.max(0, v)); }
  function legFactor(legs) { return Math.max(0.15, legs / 100); }

  /* --------------------------------------------------------- situations */
  /* Twelve. `who` is who has to decide, and there is no separate roll for
   * whose turn it is: the situation IS the turn, so nothing is ever passive. */

  /* Pressing has to BUY you the press trap, sharply. A shallow exponent left
   * the trap as the top situation even at a balanced press, which is not what
   * a press is. Tuned by grid search in test.js against four targets: the trap
   * tops a high press, the ball in behind tops the eightieth minute, a
   * balanced side sees about half the moments, and sitting off produces a
   * different match. */
  var PRESS_TRAP = 9, TRAP_EXP = 2.6;

  var SITUATIONS = [
    { id: 'press_trap', name: 'Press trap, high up', who: 'you',
      reads: ['press', 'winHigh'],
      line: 'You win the ball back in their half, about 27 metres from their goal.',
      w: function (P, S) { return Math.pow(P.press / 100, TRAP_EXP) * P.winHigh * PRESS_TRAP; } },

    { id: 'over_the_top', name: 'Ball in behind your line', who: 'them',
      reads: ['press', 'cover', 'theirDirect'],
      line: 'They have passed the ball over your defence, and one of their forwards is running onto it.',
      w: function (P, S) { return (0.06 + Math.pow(P.press / 100, 2) * 1.5) * P.theirDirect * exposure(P.cover) * 1.15; } },

    { id: 'overlap', name: 'Overlap on the flank', who: 'you',
      reads: ['width', 'flank'],
      line: 'Your full-back has run past your own winger on the outside. Nobody has gone with him.',
      w: function (P, S) { return (0.2 + P.width / 100) * P.flank * 1.15; } },

    { id: 'second_ball', name: 'Second ball in their box', who: 'you',
      reads: ['direct', 'boxThreat'],
      line: 'A long ball was headed clear, and it has dropped just outside their penalty area.',
      w: function (P, S) { return (0.1 + P.direct / 100) * P.boxThreat * 1.15; } },

    { id: 'third_man', name: 'Third man run through the middle', who: 'you',
      reads: ['direct', 'carry'],
      line: 'Your midfield has kept the ball, and one of your players is running past their defence.',
      w: function (P, S) { return (0.1 + 1 - P.direct / 100) * P.carry * 0.95; } },

    { id: 'caught_square', name: 'Caught square on a turnover', who: 'them',
      reads: ['direct', 'theirPress'],
      line: 'You lost the ball passing out from the back. Your defenders are all level with each other.',
      w: function (P, S) { return (1 - P.direct / 100) * P.theirPress * (0.35 + S.looseDef * 0.30) * 0.42; } },

    { id: 'their_winger', name: 'Their winger, one against one', who: 'them',
      reads: ['theirCarry', 'cover'],
      line: 'Their winger has the ball out wide, with only your full-back in front of him.',
      w: function (P, S) { return P.theirCarry * exposure(P.cover) * (1.5 - P.press / 130) * 0.42; } },

    { id: 'siege', name: 'Siege in your box', who: 'them',
      reads: ['cover', 'lanePressure'],
      line: 'They have had the ball in your half for several minutes. It keeps coming back at you.',
      w: function (P, S) { return Math.max(0, -S.tilt) * 0.5 + exposure(P.cover) * (1.6 - P.press / 110) * 5; } },

    { id: 'dead_ball_wide', name: 'Dead ball in a wide area', who: 'you',
      reads: ['width', 'boxThreat'],
      line: 'You have a free kick near the touchline, level with the edge of their penalty area.',
      w: function (P, S) { return 5 + (P.width / 100) * 7 + P.boxThreat * 0.10; } },

    { id: 'keeper_to_feet', name: 'Your keeper, pressed, has to play', who: 'them',
      reads: ['buildUp', 'theirPress'],
      line: 'They have pushed their players up the pitch. Your keeper has the ball and nobody safe to pass to.',
      w: function (P, S) { return P.theirPress * exposure(P.buildUp, 22) * (1.1 - P.press / 260) * 0.42; } },

    { id: 'tired_gap', name: 'Legs gone, a gap opens', who: 'them',
      reads: ['legs', 'minute'],
      line: 'Your players have not got back. There is a large gap in front of your defence.',
      w: function (P, S) {
        var drained = (300 - (S.legs.def + S.legs.mid + S.legs.att)) / 300;
        return Math.max(0, Math.pow(drained, 1.5)) * (S.minute / 90) * 190;
      } },

    { id: 'counter_from_corner', name: 'Break from their corner', who: 'you',
      reads: ['flank', 'legs'],
      line: 'Their corner has been cleared. Two of your players are running at their two defenders.',
      w: function (P, S) { return (P.flank * 0.28 + S.quickAtt * 6) * legFactor(S.legs.att); } }
  ];

  /* THEIR KEYWORDS (e1, from b3 and d2). Three moments you defend that only
   * exist because of a keyword in THEIR eleven, placed on a5's strip: their
   * Dribbler runs at your back line at the edge of your box, their Playmaker
   * looks for the pass from midfield, their cross comes into your box (high
   * to their Target man, or low from their Crosser). They are drawn like any
   * other moment of theirs, only when the keyword's man is on their pitch,
   * and take their share from the ordinary moments of theirs rather than
   * adding to it (THREAT_SHARE), so how often you attack does not move. */
  var THREAT_SITS = [
    { id: 'their_dribbler', name: 'Their Dribbler runs at your back line', who: 'them', threat: 'DRIBBLER', reads: [],
      line: 'One of their players is running at your back line with the ball.', w: function () { return 0; } },
    { id: 'their_playmaker', name: 'Their Playmaker looks for the pass', who: 'them', threat: 'PLAYMAKER', reads: [],
      line: 'Their Playmaker has the ball in midfield and is looking for a pass between your defenders.', w: function () { return 0; } },
    { id: 'their_cross', name: 'Their cross into your box', who: 'them', threat: 'CROSS', reads: [],
      line: 'They have the ball on the wing and are about to cross it into your box.', w: function () { return 0; } }
  ];
  var THREAT_SHARE = 0.12;
  function setThreatShare(v) { THREAT_SHARE = v; }
  /* is their keyword moment possible against this eleven of theirs? */
  function threatOn(id, opp) {
    if (!opp || !opp.players) return false;
    if (id === 'their_dribbler') return KWL.holders(opp, 'DRIBBLER').filter(function (p) { return p.line >= 1; }).length > 0;
    if (id === 'their_playmaker') return KWL.holders(opp, 'PLAYMAKER').length > 0 &&
      opp.players.some(function (p) { return p.line === 2 && !KWL.has(p, 'PLAYMAKER'); });
    if (id === 'their_cross') return crossPlan(opp) !== null;
    return false;
  }
  /* their cross: a Target man waiting (a high ball), or a Crosser with a
   * finisher running in (a low one) */
  function crossPlan(opp, crosser) {
    var tm = KWL.holders(opp, 'TARGET').filter(function (p) { return p.line >= 1 && p !== crosser; });
    var cr = KWL.holders(opp, 'CROSSER');
    var wideMen = opp.players.filter(function (p) { return C.CHANNEL_OF[p.slot] !== 1 && p.line >= 1; });
    if (tm.length) {
      var t = tm[0];
      var w = crosser || cr.filter(function (p) { return p !== t; })[0] || bestBy(wideMen.filter(function (p) { return p !== t; }), 'passing', 100);
      return w ? { high: true, target: t, crosser: w } : null;
    }
    var c0 = crosser ? (KWL.active(crosser, 'CROSSER') ? crosser : null) : cr[0];
    if (c0) {
      var f = bestBy(opp.players.filter(function (p) { return p.line === 2 && p !== c0; }), 'finishing', 100);
      return f ? { high: false, target: f, crosser: c0 } : null;
    }
    return null;
  }
  /* several of theirs with the keyword: one not yet seen in this moment first */
  function rotate(list, seen) {
    if (!list.length) return null;
    if (seen) { var fresh = list.filter(function (p) { return !seen.foils[p.id]; }); if (fresh.length) return fresh[0]; }
    return list[0];
  }
  /* the man of theirs a keyword moment is about */
  function threatFoil(id, opp, seen) {
    if (id === 'their_dribbler') return rotate(KWL.holders(opp, 'DRIBBLER').filter(function (p) { return p.line >= 1; }), seen);
    if (id === 'their_playmaker') return rotate(KWL.holders(opp, 'PLAYMAKER'), seen);
    return null;
  }
  /* your defenders sorted by who meets their man: their left meets your right */
  function meets(squad, line, p) {
    var mine = squad.players.filter(function (q) { return q.line === line; });
    var ch = typeof p.slot === 'number' ? C.CHANNEL_OF[p.slot] : 1, want = 2 - ch, ps = typeof p.slot === 'number' ? p.slot : 2;
    return mine.slice().sort(function (a, b) {
      var da = (C.CHANNEL_OF[a.slot] === want ? 0 : 10) + Math.abs((4 - a.slot) - ps);
      var db = (C.CHANNEL_OF[b.slot] === want ? 0 : 10) + Math.abs((4 - b.slot) - ps);
      return da - db;
    });
  }

  /* What a situation may see beyond the primitives. Short on purpose, and both
   * of these are now attribute counts rather than the old opaque tags. */
  function stateView(squad, style, state) {
    var quickAtt = 0, looseDef = 0;
    squad.players.forEach(function (p) {
      if (p.line === 2 && A.eff(p, 'pace') >= 15) quickAtt++;
      if (p.line <= 1 && A.eff(p, 'intelligence') <= 11) looseDef++;
    });
    return {
      minute: state.minute, score: state.score, legs: state.legs,
      tilt: state.tilt || 0, looseDef: looseDef, quickAtt: quickAtt
    };
  }

  /* One honest knob rather than twelve fiddles. Against an equal opponent a
   * balanced side should see roughly half the notable moments; pressing early
   * should tilt that your way and a drained eightieth minute should tilt it
   * back. THEM_WEIGHT is the single scalar that sets the resting split, tuned
   * in test.js against those three targets. */
  var THEM_WEIGHT = 2.2;
  function tuneSplit(v, pt, te) { THEM_WEIGHT = v; if (pt) PRESS_TRAP = pt; if (te) TRAP_EXP = te; }

  function weights(squad, opp, style, state) {
    var P = primitives(squad, opp, style, state);
    var S = stateView(squad, style, state);
    var rows = SITUATIONS.map(function (s) {
      var raw = Math.max(0, s.w(P, S));
      if (s.who === 'them') raw *= THEM_WEIGHT;
      return { sit: s, raw: raw };
    });
    /* e1: their keyword moments, carved out of their share */
    var avail = THREAT_SITS.filter(function (s) { return threatOn(s.id, opp); });
    if (avail.length) {
      var themRaw = rows.filter(function (r) { return r.sit.who === 'them'; }).reduce(function (a, r) { return a + r.raw; }, 0);
      var keep = 1 - THREAT_SHARE * avail.length;
      rows.forEach(function (r) { if (r.sit.who === 'them') r.raw *= keep; });
      avail.forEach(function (s) { rows.push({ sit: s, raw: themRaw * THREAT_SHARE }); });
    }
    var total = rows.reduce(function (a, r) { return a + r.raw; }, 0) || 1;
    rows.forEach(function (r) { r.pct = r.raw / total; });
    rows.sort(function (a, b) { return b.raw - a.raw; });
    return { rows: rows, primitives: P, state: S, total: total };
  }

  function draw(squad, opp, style, state, rng) {
    var w = weights(squad, opp, style, state);
    var roll = rng.next() * w.total, acc = 0;
    for (var i = 0; i < w.rows.length; i++) {
      acc += w.rows[i].raw;
      if (roll <= acc) return { row: w.rows[i], table: w };
    }
    return { row: w.rows[0], table: w };
  }

  /* --------------------------------------------- the moment, assembled */

  function bestBy(list, id, legs) {
    var b = null, bv = -1;
    list.forEach(function (p) {
      var v = (id === 'reach') ? A.reach(p, legs) : A.eff(p, id, legs);
      if (v > bv) { bv = v; b = p; }
    });
    return b;
  }
  function lineOf(squad, n) { return squad.players.filter(function (p) { return p.line === n; }); }
  function wideOf(squad) { return squad.players.filter(function (p) { return C.CHANNEL_OF[p.slot] !== 1; }); }

  /* Which attribute the moment is about, on each side. This pair is what makes
   * the risk read actor x action x marker: the same man is narrow at one
   * action and wild at another, which was the correction the review forced. */
  /* `mine` and `theirs` are the ambitious option's duel. `safe` is the
   * attribute the cautious option tests instead, and it is deliberately a
   * DIFFERENT one, on a DIFFERENT man, so that all three options compose
   * rather than two of them being boilerplate. Phase 0 measured 63 percent of
   * options as boilerplate before this existed, which is the "thirty moments
   * that read like three" failure, caught on paper. */
  var ACTION = {
    press_trap:          { mine: 'defending',    theirs: 'technique',    legs: 'mid', safe: 'intelligence', safeVerb: 'hold the line and make them play round you' },
    over_the_top:        { mine: 'pace',         theirs: 'pace',         legs: 'def', safe: 'intelligence', safeVerb: 'drop off and give him the ball in front of you' },
    overlap:             { mine: 'pace',         theirs: 'defending',    legs: 'def', safe: 'passing',      safeVerb: 'stand it up to the back post' },
    second_ball:         { mine: 'reach',        theirs: 'reach',        legs: 'att', safe: 'technique',    safeVerb: 'take a touch and wait for support' },
    third_man:           { mine: 'passing',      theirs: 'intelligence', legs: 'mid', safe: 'technique',    safeVerb: 'keep it and go again' },
    caught_square:       { mine: 'intelligence', theirs: 'pace',         legs: 'def', safe: 'passing',      safeVerb: 'go long and give the ball away properly' },
    their_winger:        { mine: 'defending',    theirs: 'technique',    legs: 'def', safe: 'intelligence', safeVerb: 'show him inside where the help is' },
    siege:               { mine: 'defending',    theirs: 'finishing',    legs: 'def', safe: 'physical',     safeVerb: 'put everybody in the box and head it away' },
    dead_ball_wide:      { mine: 'passing',      theirs: 'reach',        legs: 'att', safe: 'technique',    safeVerb: 'play it short and keep the ball' },
    keeper_to_feet:      { mine: 'passing',      theirs: 'pace',         legs: 'def', safe: 'physical',     safeVerb: 'hit it long and take the throw-in' },
    tired_gap:           { mine: 'pace',         theirs: 'pace',         legs: 'def', safe: 'intelligence', safeVerb: 'get everybody behind the ball' },
    counter_from_corner: { mine: 'pace',         theirs: 'pace',         legs: 'att', safe: 'passing',      safeVerb: 'slow it down and get bodies up' },
    /* e1 (from b3 and d2): their keyword moments */
    their_dribbler:      { mine: 'defending',    theirs: 'technique',    legs: 'def', safe: 'intelligence' },
    their_playmaker:     { mine: 'intelligence', theirs: 'passing',      legs: 'mid', safe: 'intelligence' },
    their_cross:         { mine: 'reach',        theirs: 'reach',        legs: 'def', safe: 'intelligence' }
  };

  function castFor(sit, squad, opp, state) {
    var act = ACTION[sit.id], L = state.legs[act.legs];
    var mineList, theirList;
    switch (sit.id) {
      case 'press_trap': mineList = lineOf(squad, 1); theirList = lineOf(opp, 0); break;
      case 'over_the_top': mineList = lineOf(squad, 0); theirList = lineOf(opp, 2); break;
      case 'overlap': mineList = wideOf(squad); theirList = lineOf(opp, 0); break;
      case 'second_ball': mineList = lineOf(squad, 2); theirList = lineOf(opp, 0); break;
      case 'third_man': mineList = lineOf(squad, 1); theirList = lineOf(opp, 0); break;
      case 'caught_square': mineList = lineOf(squad, 0); theirList = lineOf(opp, 1); break;
      case 'their_winger': mineList = lineOf(squad, 0); theirList = lineOf(opp, 2); break;
      case 'siege': mineList = lineOf(squad, 0); theirList = lineOf(opp, 2); break;
      case 'keeper_to_feet': mineList = [squad.keeper]; theirList = lineOf(opp, 2); break;
      case 'tired_gap': mineList = lineOf(squad, 0); theirList = lineOf(opp, 2); break;
      default: mineList = lineOf(squad, 2); theirList = lineOf(opp, 0);
    }
    if (!mineList.length) mineList = squad.players;
    if (!theirList.length) theirList = opp.players;
    /* A repeat of a situation casts men who have not been in it yet, when
     * there are any. Otherwise the same situation is the same two names
     * word for word, which is what he saw: Keith against Tom, five times. */
    var seen = state.seen && state.seen[sit.id];
    if (seen) {
      var freshMine = mineList.filter(function (p) { return !seen.actors[p.id]; });
      var freshTheirs = theirList.filter(function (p) { return !seen.foils[p.id]; });
      if (freshMine.length) mineList = freshMine;
      if (freshTheirs.length) theirList = freshTheirs;
    }
    var actor = bestBy(mineList, act.mine, L);
    /* the second man: who the cautious option relies on, tested on a
     * different attribute from the ambitious one */
    var rest = mineList.filter(function (p) { return p !== actor; });
    /* The easy ball goes to the best man for it nearby: the actor's own line
     * and the lines either side, never the keeper. Taking it only from the
     * moment's own line handed the "safe" pass to Gary (Technique 11) with a
     * 42 percent chance of losing it, the riskiest option on the screen. */
    if (actor && typeof actor.line === 'number') {
      squad.players.forEach(function (p) {
        if (p !== actor && rest.indexOf(p) < 0 && Math.abs(p.line - actor.line) === 1) rest.push(p);
      });
    }
    var support = bestBy(rest.length ? rest : mineList, act.safe, L);
    /* the outlet: the best ball on the far side, for the option that moves
     * the match somewhere else */
    var actorLane = actor ? C.CHANNEL_OF[actor.slot] : 1;
    var far = squad.players.filter(function (p) {
      /* never the same man as the support: the three options have to be three
       * different people or the switch reads as a contradiction of the hold */
      return C.CHANNEL_OF[p.slot] !== actorLane && p.line >= 1 && p !== support && p !== actor;
    });
    var outlet = bestBy(far.length ? far : squad.players.filter(function (p) {
      return p !== support && p !== actor;
    }), 'technique', L);
    return { actor: actor, foil: bestBy(theirList, act.theirs, 100), support: support, outlet: outlet, action: act, legs: L };
  }

  /* The options now come from the POOL in options.js, which asks of every
   * option "does this exist at all, given who is on the pitch, the clock, the
   * legs and the score". Before this, every press trap offered the same three
   * buttons across all twelve squad-and-pressure combinations: sixteen
   * different descriptions, three choices, forever. That measurement is what
   * killed Phase 0, and this is the answer to it. */
  function options(sit, cast, squad, opp, state, style) {
    var ctx = {
      sit: sit, squad: squad, opp: opp, state: state, style: style,
      actor: cast.actor, foil: cast.foil, support: cast.support, outlet: cast.outlet,
      act: cast.action, legs: cast.legs, A: A, zoneEscape: !!(state && state.zoneEscape),
      winBack: !!(state && state.winBack),
      /* their edge on the counter after you lose it (a2) */
      theirCarry: (state && state.theirCarry) || null,
      play: (state && state.play) || null
    };
    var r = O.offer(ctx, 4);
    cast.available = r.available;
    return r.shown;
  }

  function moment(sit, squad, opp, style, state) {
    /* each of your men reads his own line's stamina while this moment is
     * built (attributes.js setLineLegs), then the map is cleared */
    A.setLineLegs(state.legs, squad);
    try {
      var cast = castFor(sit, squad, opp, state);
      return {
        sit: sit, cast: cast, text: sit.line,
        options: options(sit, cast, squad, opp, state, style),
        available: cast.available
      };
    } finally {
      A.setLineLegs(null);
    }
  }

  /* ============================================================ ZONES (a1) */
  /* The ball moves up the pitch. Four zones, from your goal to theirs. An
   * attack starts in the zone its situation puts it in, and every decision
   * of yours happens in a zone: the zone decides the kinds of option on the
   * menu (options.js, `zones`). */
  var ZONES = O.ZONE_NAME;            // 'your half', 'midfield', 'the edge of their box', 'their box'
  /* where each of your situations puts the ball when it starts. Their
   * situations are in your half; your keeper, if he plays out, starts your
   * attack in your half (match.js). */
  var START_ZONE = { press_trap: 2, overlap: 1, second_ball: 2, third_man: 1, dead_ball_wide: 2, counter_from_corner: 1 };
  /* who stands opposite the man on the ball, by zone: their forwards when
   * you are in your half, their midfield in midfield, their defenders after */
  var ZONE_OPP_LINE = [2, 1, 0, 0];
  var ZONE_ACT = [
    { mine: 'passing', theirs: 'intelligence', legs: 'def', safe: 'passing' },
    { mine: 'technique', theirs: 'defending', legs: 'mid', safe: 'technique' },
    { mine: 'technique', theirs: 'defending', legs: 'att', safe: 'technique' },
    { mine: 'finishing', theirs: 'defending', legs: 'att', safe: 'technique' }
  ];
  /* the situation for a decision in the middle of an attack: the scene
   * sentence is written from who has the ball and where */
  var ZONE_SITS = ['zone_half', 'zone_mid', 'zone_edge', 'zone_box'].map(function (id, z) {
    return { id: id, name: 'Your attack, ' + ZONES[z], who: 'you', zone: z, line: '' };
  });
  var LKEY = ['def', 'mid', 'att'];
  /* the default man on the ball in a zone, when nobody is carried over */
  function carrierFor(zone, squad, legs) {
    var line = zone === 0 ? 0 : zone === 1 ? 1 : 2;
    var attr = zone === 3 ? 'finishing' : zone === 2 ? 'technique' : 'passing';
    return bestBy(lineOf(squad, line).length ? lineOf(squad, line) : squad.players, attr, legs[LKEY[line]]);
  }
  function zoneCast(zone, carrier, squad, opp, state) {
    var act = ZONE_ACT[zone];
    var p = carrier || carrierFor(zone, squad, state.legs);
    var L = state.legs[LKEY[typeof p.line === 'number' ? p.line : 1]];
    var seen = state.seen && state.sitId && state.seen[state.sitId];
    var foil = O.markerOf(opp, p, ZONE_OPP_LINE[zone], seen ? seen.foils : null);
    var rest = squad.players.filter(function (q) { return q !== p; });
    var support = bestBy(rest, act.safe, L);
    return { actor: p, foil: foil, support: support, outlet: null, action: act, legs: L,
      keeper: opp.keeper, zone: zone };
  }
  function zoneScene(zone, p, foil) {
    var nm = String(p.name || '').split(' ')[0], fn = String((foil && foil.name) || '').split(' ')[0];
    return nm + ' has the ball ' + O.ZONE_AT[zone] + '. ' +
      (foil ? fn + ' is the nearest of their players to him.' : '');
  }
  /* A decision of yours in a zone. `sit` is the situation that started the
   * attack on its first decision, and the zone's own situation after that. */
  function zoneMoment(sit, zone, carrier, squad, opp, style, state) {
    A.setLineLegs(state.legs, squad);
    state.sitId = sit.id;
    try {
      var cast = zoneCast(zone, carrier, squad, opp, state);
      var ctx = {
        sit: sit, squad: squad, opp: opp, state: state, style: style, zone: zone,
        actor: cast.actor, foil: cast.foil, support: cast.support, outlet: null,
        keeper: cast.keeper, act: cast.action, legs: cast.legs, A: A,
        /* the man who passed it to him, so a pass does not go straight back */
        prev: state.prevCarrier || null,
        /* what the last decision won (a2 carried advantage) */
        carried: state.carried || null,
        /* e1: the free kick your Dribbler won, or the one-two's pass back */
        mode: state.mode || null, play: state.play || null
      };
      var r = O.offer(ctx, 4);
      cast.available = r.available;
      return {
        sit: sit, cast: cast, zone: zone,
        text: sit.id === 'overlap' && O.GUARD.wingScene && state.mode !== 'freekick' && O.overlapScene(ctx, O.ZONE_AT[zone])
          ? O.overlapScene(ctx, O.ZONE_AT[zone])
          : (sit.line ? sit.line + ' ' : '') + (state.mode === 'freekick'
          ? String(cast.actor.name || '').split(' ')[0] + ' is standing over the free kick at the edge of their box. Their wall is ten metres away.'
          : zoneScene(zone, cast.actor, cast.foil)),
        options: r.shown, available: r.available
      };
    } finally {
      A.setLineLegs(null);
    }
  }

  /* ========================================================= YOUR BOX (a3) */
  /* Their attack comes up the pitch too: when a stop half works, or a duel
   * is lost, their man is in your box and there is one last decision.
   * via: 'box' (he got past, and shoots) or 'cross' (their winger was
   * held up out wide and crosses; the header is the danger). A duel lost
   * outright is still a goal, as in v0. */
  var BOX_SIT = { id: 'zone_yourbox', name: 'Their attack, in your box', who: 'them', line: '' };
  var THEIR_BOX = 'your box';
  function boxMoment(foil, via, blocker, squad, opp, style, state) {
    A.setLineLegs(state.legs, squad);
    try {
      var k = squad.keeper, notes = [], crosser = null, f;
      /* e1: THEIR KEYWORDS decide what the cross is. Their Target man is
       * where a high cross goes; with no Target man, a Crosser hits it low
       * across your six-yard box, where nobody can head it. */
      if (via === 'cross' || via === 'lowcross') {
        crosser = state.crosser || foil;
        var plan = state.crossTarget ? { high: via === 'cross', target: state.crossTarget, crosser: crosser } : crossPlan(opp, crosser);
        if (plan && !state.crossTarget) via = plan.high ? 'cross' : 'lowcross';
        f = plan ? plan.target : (bestBy(lineOf(opp, 2).filter(function (p) { return p !== foil; }), 'reach', 100) || foil);
        if (via === 'cross' && KWL.active(f, 'TARGET')) notes.push(KWL.because(f, 'TARGET') + ', the cross is aimed at ' + first(f) + '.');
        if (via === 'lowcross' && KWL.active(crosser, 'CROSSER')) notes.push(KWL.because(crosser, 'CROSSER') + ', ' + first(crosser) + ' can hit it low across your 5.5-metre box.');
      } else if (via === 'corner' || via === 'fkcross') {
        /* their best in the air, from any line (a4) */
        f = bestBy(opp.players, 'reach', 100) || foil;
        crosser = bestBy(opp.players.filter(function (p) { return p !== f; }), 'passing', 100);
        if (KWL.active(f, 'TARGET')) notes.push(KWL.because(f, 'TARGET') + ', the ball is aimed at ' + first(f) + '.');
      } else if (via === 'freekick') {
        /* their Free-kick taker shoots it (options.js makes it a cross when
         * they have none) */
        f = bestBy(KWL.holders(opp, 'FREEKICK'), 'technique', 100) || foil || bestBy(opp.players, 'technique', 100);
        if (KWL.active(f, 'FREEKICK')) notes.push(KWL.because(f, 'FREEKICK') + ', ' + first(f) + ' shoots from it.');
      } else {
        f = foil;
        if (via === 'box' && state.bounced && KWL.active(f, 'POACHER')) notes.push(KWL.because(f, 'POACHER') + ', ' + first(f) + ' was first to the ball.');
      }
      var b = blocker && typeof blocker.line === 'number' && blocker.line === 0 ? blocker
        : O.markerOf(squad, f, 0);
      /* who the keeper gives it to if he holds it */
      /* a4: he throws it out quickly to a midfielder */
      var out = bestBy(lineOf(squad, 1).length ? lineOf(squad, 1) : lineOf(squad, 0), 'passing', state.legs.mid);
      var ctx = {
        sit: BOX_SIT, squad: squad, opp: opp, state: state, style: style,
        actor: k, foil: f, blocker: b, via: via, outBall: out, boxStep: true, crosser: crosser,
        flipOk: !!state.flipOk, carried: state.carried || null, theirCarried: state.theirCarried || null,
        act: { mine: 'reflexes', theirs: 'finishing', legs: 'def', safe: 'defending' },
        legs: state.legs.def, A: A, zoneEscape: true, play: state.play || null
      };
      var r = O.offer(ctx, 4);
      var fn = String(f.name || '').split(' ')[0], kn = k ? String(k.name || '').split(' ')[0] : 'your keeper';
      var text = via === 'cross' ? fn + ' is waiting in your box for the cross.'
        : via === 'lowcross' ? first(crosser) + ' is about to cross it low across your 5.5-metre box, and ' + fn + ' is running in.'
        : via === 'corner' ? 'Their corner. ' + fn + ' is their best player in the air, and is waiting in your box.'
          : via === 'fkcross' ? 'Their free kick is going to be crossed into your box. ' + fn + ' is their best player in the air.'
          : via === 'header' ? fn + ' has won the header, and the ball is going towards your goal. ' + kn + ' is in goal.'
          : via === 'alone' ? fn + ' is through on his own, with only ' + kn + ' to beat.'
            : via === 'open' ? fn + ' is in your box, and ' + kn + ' is out of his goal.'
          : via === 'freekick' ? fn + ' is going to take the free kick. ' + kn + ' is in goal.'
            : fn + ' is in your box and about to shoot. ' + kn + ' is in goal.';
      return { sit: BOX_SIT, cast: { actor: k, foil: f, available: r.available, crosser: crosser }, zone: -1, via: via,
        text: text, options: r.shown, available: r.available, threat: notes.length ? notes.join(' ') : null };
    } finally {
      A.setLineLegs(null);
    }
  }

  /* ============================================ THEIR ATTACK BY ZONES (a4) */
  /* Their attack comes up the pitch in zones too: midfield (tz 0), the edge
   * of your box (tz 1), then your box (boxMoment). Each zone has its own
   * kinds of defending (options.js `tzones`). Their man on the ball is
   * `foil`; your man is the one standing opposite him: a midfielder in
   * midfield, a defender at the edge of your box. */
  var T_ZONES = ['midfield', 'the edge of your box'];
  /* where each of their situations starts. A ball over the top and their
   * winger one against one are already at the edge of your box; a siege is
   * in your box (2), with the ball being crossed in again. */
  var T_START = { over_the_top: 1, their_winger: 1, siege: 2, caught_square: 1, tired_gap: 0,
    /* e1: their keyword moments */
    their_dribbler: 1, their_playmaker: 0, their_cross: 2 };
  /* what the situation itself gives them on its first decision: the
   * sentence on screen says why */
  var T_START_EDGE = {
    over_the_top: function (f) { return { amount: 2, why: first(f) + ' is running onto the ball at full speed',
      text: first(f) + ' is running onto the ball at full speed: +2 to ' + first(f) }; },
    tired_gap: function (f) { return { amount: 2, why: 'your players have not got back',
      text: 'Your players have not got back: +2 to ' + first(f) }; }
  };
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }
  /* what the situation itself gives them on its first decision: the
   * sentence on screen says why */
  var T_START_EDGE = {
    over_the_top: function (f) { return { amount: 2, why: firstName(f) + ' is running onto the ball at full speed',
      text: firstName(f) + ' is running onto the ball at full speed: +2 to ' + firstName(f) }; },
    tired_gap: function (f) { return { amount: 2, why: 'your players have not got back',
      text: 'Your players have not got back: +2 to ' + firstName(f) }; }
  };
  function firstName(p) { return String((p && p.name) || '').split(' ')[0]; }
  var COUNTER_SIT = { id: 'their_counter', name: 'Their counter', who: 'them', line: '' };
  /* their default man on the ball in a zone: a midfielder who can carry it,
   * or a forward at the edge of your box */
  /* `seen` (the match's record) spreads the ball around: a man who has
   * already carried it at you is picked again only when everyone in his line
   * has had it */
  function theirCarrier(tz, opp, seen) {
    var l = lineOf(opp, tz === 0 ? 1 : 2);
    if (!l.length) l = opp.players;
    var rec = seen ? (seen._carriers || (seen._carriers = {})) : null;
    if (rec) { var f = l.filter(function (p) { return !rec[p.id]; }); if (!f.length) { for (var k in rec) delete rec[k]; } else l = f; }
    var p = bestBy(l, tz === 0 ? 'technique' : 'finishing', 100);
    if (rec && p) rec[p.id] = 1;
    return p;
  }
  /* their winger: a wide player, so the man in front of him is your
   * full-back on that side, as the scene says (the review of a3) */
  function theirWinger(opp, seen) {
    var w = opp.players.filter(function (p) { return p.line >= 1 && C.CHANNEL_OF[p.slot] !== 1; });
    if (seen) { var f = w.filter(function (p) { return !seen.foils[p.id]; }); if (f.length) w = f; }
    return bestBy(w.length ? w : lineOf(opp, 2), 'technique', 100);
  }
  function theirZoneMoment(sit, tz, foil, squad, opp, style, state) {
    A.setLineLegs(state.legs, squad);
    try {
      var f = foil || theirCarrier(tz, opp, state.seen || null);
      /* a repeat of a situation brings a different one of your men to it
       * when there is one (as castFor does) */
      var seenSit = state.seen && state.seen[sit.id];
      var act = O.markerOf(squad, f, tz === 0 ? 1 : 0, seenSit ? seenSit.actors : null);
      /* their winger one against one: the man in front of him is your wide
       * defender on that side (a wing-back if you play three at the back) */
      if (sit.id === 'their_winger' && state.firstStep && typeof f.slot === 'number') {
        var wl = C.CHANNEL_OF[4 - f.slot];
        var onSide = function (n) { return lineOf(squad, n).filter(function (p) { return C.CHANNEL_OF[p.slot] === wl; }); };
        var fresh = function (l) { return seenSit ? l.filter(function (p) { return !seenSit.actors[p.id]; }) : l; };
        /* a repeat of the situation on the same side brings your wide
         * midfielder back to help, so it is not the same two men again */
        var wide = fresh(onSide(0)).length ? fresh(onSide(0)) : fresh(onSide(1)).length ? fresh(onSide(1)) : onSide(0).length ? onSide(0) : onSide(1);
        if (wide.length) act = bestBy(wide, 'defending', state.legs.def);
      }
      /* e1: THEIR KEYWORD MOMENT, on its first decision: the man in front
       * of their Dribbler is the defender opposite him, and the second man
       * a midfielder on that side; against their Playmaker, the midfielder
       * opposite him, and the defender who reads the game best */
      var th = null, notes = [], support = null;
      var own = !!(sit.threat && state.firstStep && ((sit.id === 'their_dribbler' && tz === 1) || (sit.id === 'their_playmaker' && tz === 0)));
      if (own && sit.id === 'their_dribbler') {
        var d0 = meets(squad, 0, f);
        act = d0[0] || act;
        support = meets(squad, 1, f)[0] || d0[1] || null;
        th = {};
        notes.push(KWL.because(f, 'DRIBBLER') + ', ' + first(f) + ' can run at your defenders with the ball.');
        var pr = KWL.pairs(opp).filter(function (x) { return x.id === 'ONE_TWO' && x.b === f; })[0];
        if (pr) { th.pair = pr; notes.push('Because ' + first(pr.a) + ' and ' + first(f) + ' play one-twos, ' + first(pr.a) + ' is there to give ' + first(f) + ' the ball back.'); }
      } else if (own && sit.id === 'their_playmaker') {
        th = { runner: bestBy(lineOf(opp, 2).filter(function (p) { return p !== f; }), 'pace', 100) };
        act = meets(squad, 1, f)[0] || act;
        support = bestBy(lineOf(squad, 0), 'intelligence', state.legs.def) || act;
        notes.push(KWL.because(f, 'PLAYMAKER') + ', ' + first(f) + ' can pass the ball between your defenders.');
      }
      var L = state.legs[LKEY[typeof act.line === 'number' ? act.line : 0]];
      var ctx = {
        sit: sit, squad: squad, opp: opp, state: state, style: style, tzone: tz,
        actor: act, foil: f, legs: L, A: A, act: ACTION[sit.id] || { mine: 'defending', theirs: 'technique', legs: 'def', safe: 'intelligence' },
        carried: state.carried || null, theirCarried: state.theirCarried || null,
        flipOk: !!state.flipOk, firstStep: !!state.firstStep,
        support: support, th: th, threatSit: own ? sit.id : null, threatOwn: own,
        /* their break after you lost the ball (your Ball winner can win it
         * straight back) */
        counter: !!state.counter, play: state.play || null,
        /* g1: how their attack means to reach your box (a winger crosses) */
        via: state.tVia || null
      };
      var r = O.offer(ctx, 4);
      var fn = String(f.name || '').split(' ')[0], an = String(act.name || '').split(' ')[0];
      var line = sit.line;
      if (sit.id === 'their_winger' && line && act.line !== 0) line = line.replace('your full-back', 'your wide midfielder ' + an);
      /* e1: a ball over your defence is in the air: nobody has it yet (the
       * state of play, match.js), so the scene cannot say it is with him */
      var air = !!(state.play && state.play.air) && O.GUARD.air;
      if (state.play) state.play.near = act;
      var wingT = sit.id === 'their_winger' && state.firstStep && !air && O.GUARD.wingScene ? O.theirWingScene(f, act, O.T_AT[tz]) : null;
      var text = wingT ? wingT : air
        ? 'They have passed the ball over your defence. The ball is in the air, dropping at the edge of your box, and ' + fn + ' is running onto it. ' + an + ' is the nearest of your players to ' + fn + '.'
        : own && sit.id === 'their_dribbler'
        ? fn + ' has the ball at the edge of your box and runs straight at your back line. ' + an + ' is the defender in front of ' + fn + '.'
        : own && sit.id === 'their_playmaker'
          ? fn + ' has the ball in midfield, facing your goal. ' + first(th.runner) + ' is starting to run between your defenders. ' + an + ' is the nearest of your players to ' + fn + '.'
          : (line ? line + ' The ball is with ' + fn + ', ' + O.T_AT[tz] + '. '
            : fn + ' has the ball ' + O.T_AT[tz] + ', running at your goal. ') +
            an + ' is the nearest of your players to him.';
      /* g1: their counter starts with the man who took the ball from you;
       * when someone else runs with it, the scene says he passed it (the
       * review of p3: "Mac Allister takes the ball" then "Alvarez has the
       * ball at the edge of your box") */
      if (state.counterTaker && state.counterTaker !== f && !air) text = first(state.counterTaker) + ' took the ball and passed it to ' + fn + '. ' + text;
      return { sit: sit, cast: { actor: act, foil: f, available: r.available }, tzone: tz,
        text: text, options: r.shown, available: r.available, threat: notes.length ? notes.join(' ') : null };
    } finally {
      A.setLineLegs(null);
    }
  }

  /* ------------------------------------------------------------ helpers */

  function freshState(minute, legs, score, tilt) {
    return {
      minute: minute === undefined ? 0 : minute,
      legs: legs || { def: 100, mid: 100, att: 100 },
      score: score || { you: 0, them: 0 },
      tilt: tilt || 0
    };
  }

  function legsAt(style, minute, squad, moments) {
    moments = moments || 8;
    var b = burnRates(style);
    var share = (minute / 90) * moments;
    var sf = squad
      ? { def: staminaFactor(squad, 0), mid: staminaFactor(squad, 1), att: staminaFactor(squad, 2) }
      : { def: 1, mid: 1, att: 1 };
    return {
      def: Math.max(0, 100 - b.def * share * 0.95 * sf.def),
      mid: Math.max(0, 100 - b.mid * share * 0.95 * sf.mid),
      att: Math.max(0, 100 - b.att * share * 0.95 * sf.att)
    };
  }

  var API = {
    DIALS: DIALS, SITUATIONS: SITUATIONS, ACTION: ACTION, RECIPE: RECIPE,
    burnRates: burnRates, staminaFactor: staminaFactor,
    primitives: primitives, weights: weights, draw: draw,
    moment: moment, options: options, castFor: castFor, tuneSplit: tuneSplit,
    freshState: freshState, legsAt: legsAt,
    /* e1: keywords are drawn with their own rng after the numbers
     * (keywords.js assign), so no number on the sheet moves */
    attach: function (squad, seed, opts) { A.attach(squad, seed, opts); KWL.assign(squad, seed); return squad; },
    THREAT_SITS: THREAT_SITS, threatOn: threatOn, crossPlan: crossPlan, threatFoil: threatFoil, setThreatShare: setThreatShare,
    ZONES: ZONES, START_ZONE: START_ZONE, ZONE_SITS: ZONE_SITS, ZONE_OPP_LINE: ZONE_OPP_LINE,
    zoneMoment: zoneMoment, zoneCast: zoneCast, carrierFor: carrierFor, boxMoment: boxMoment, BOX_SIT: BOX_SIT, THEIR_BOX: THEIR_BOX,
    theirZoneMoment: theirZoneMoment, theirWinger: theirWinger, theirCarrier: theirCarrier, T_START_EDGE: T_START_EDGE, T_START_EDGE: T_START_EDGE, T_ZONES: T_ZONES, T_START: T_START, COUNTER_SIT: COUNTER_SIT
  };
  root.KMModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
