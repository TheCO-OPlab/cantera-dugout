/* The option pool.
 *
 * Eduardo, 2026-09-21, and this file is his sentence turned into code:
 *
 *   "if they are countering you and your slowest defender is the one that's
 *    left, but you have a goalie who plays as a sweeper-keeper and has
 *    sufficient reflexes, you would get an additional option: clear with your
 *    keeper."
 *
 * So an option is NOT a slot that gets filled with a different name. It either
 * EXISTS or it does not, depending on who is on the pitch, what the clock
 * says, how much is left in the legs and what the score is. Two squads in the
 * same scene get different buttons, not the same button relabelled.
 *
 * That is the fix for the Phase 0 failure. The measurement there was brutal
 * and exact: every press trap offered the same three options across all twelve
 * squad-and-pressure combinations. Sixteen different descriptions, three
 * choices, forever. He filed all seven press traps under one heading and he
 * was right to.
 *
 * WRITING RULE, his, and it applies to every string in this file: plain
 * English, no commentator idiom, no metaphor, say literally what happens, and
 * put the stat in brackets.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  var A = root.KMAttr || require('./attributes.js');
  var R = root.KMResolve || require('./resolve.js');
  var KWL = root.KMKeywords || (typeof require === 'function' ? require('./keywords.js') : null);
  /* w0: the effects layer (effects.js). Only a match with a build has a
   * runtime (ctx.state.fx); without one every `fx` below is null and this
   * file does exactly what s0 did. */
  var FXL = root.KMEffects || (typeof require === 'function' ? require('./effects.js') : null);

  function eff(p, id, legs) { return p ? Math.round(A.eff(p, id, legs)) : 0; }
  function first(p) { return p ? p.name.split(' ')[0] : 'nobody'; }
  function full(p) { return p ? p.name : 'nobody'; }
  function statOf(id) {
    /* never a stat name of its own: an aerial duel is Physical plus height */
    if (id === 'reach') return 'in the air';
    var a = A.ATTRS.concat(A.KEEPER_ATTRS).filter(function (x) { return x.id === id; })[0];
    return a ? a.name : id;
  }
  /* Reach is not stored on the player: it is computed from Physical and how
   * tall he is. Reading it like an attribute printed a meaningless 7. */
  function value(p, id, legs) {
    return Math.round(id === 'reach' ? A.aerial(p, legs) : A.eff(p, id, legs));
  }
  /* How a value he cannot read off the player was arrived at. Only reach needs
   * one today, and it is his own formula: physical + 10 x height in metres. */
  function working(p, id, legs) {
    if (id !== 'reach' || !p) return null;
    var a = A.aerialSum(p, legs);
    return 'Physical ' + Math.round(a.physical) + ' + 10 x ' + a.heightM.toFixed(2) + 'm';
  }
  /* "Torv (Pace 18)", his own suggested form. Two stats for the same man go in
   * ONE bracket rather than repeating his name. And when tired legs have
   * dropped the number, say so, because a card reading Pace 8 and a moment
   * reading Pace 5 is exactly the kind of thing that makes a game feel like it
   * is lying to you. */
  /* His note, 2026-09-23: "each player should have their role next to them",
   * FM style: "Torv (CB, Pace 18)". The code comes from names.js. */
  function pos(p) { return p && p.pos ? p.pos + ', ' : ''; }
  function tag(p, id, legs) {
    if (!p) return 'nobody';
    return first(p) + ' (' + pos(p) + statLine(p, [id], legs) + ')';
  }
  function tag2(p, ids, legs) {
    if (!p) return 'nobody';
    return first(p) + ' (' + pos(p) + statLine(p, ids, legs) + ')';
  }
  function statLine(p, ids, legs) {
    var tired = false;
    var parts = ids.map(function (id) {
      if (id === 'reach') {
        /* Physical, and then his height in metres. His note: "if it will be
         * checked it should be a number, not 'tall'". The word was hiding the
         * half of the formula he is meant to be able to check. */
        var phys = value(p, 'physical', legs);
        if (Math.round((p.attr && p.attr.physical) || 0) > phys) tired = true;
        return 'Physical ' + phys + ', ' + (p.heightM || 1.80).toFixed(2) + 'm';
      }
      var now = value(p, id, legs);
      if (Math.round((p.attr && p.attr[id]) || 0) > now) tired = true;
      return statOf(id) + ' ' + now;
    });
    /* no vague "on tired legs" here: the stamina line under the option says it
     * with the actual numbers */
    return parts.join(', ');
  }

  function inLine(sq, n) { return sq.players.filter(function (p) { return p.line === n; }); }
  function best(list, id, legs) {
    var b = null, bv = -1;
    list.forEach(function (p) {
      var v = (id === 'reach') ? A.reach(p, legs) : A.eff(p, id, legs);
      if (v > bv) { bv = v; b = p; }
    });
    return b;
  }
  function worst(list, id, legs) {
    var b = null, bv = 1e9;
    list.forEach(function (p) {
      var v = A.eff(p, id, legs);
      if (v < bv) { bv = v; b = p; }
    });
    return b;
  }
  function tall(sq, line, legs) {
    var l = inLine(sq, line).filter(function (p) { return p.height === 'tall'; });
    return l.length ? best(l, 'finishing', legs) : null;
  }

  /* ---------------------------------------------- zone helpers (a1) */
  var ZONE_NAME = ['your half', 'midfield', 'the edge of their box', 'their box'];
  var ZONE_AT = ['in your half', 'in midfield', 'at the edge of their box', 'in their box'];
  var SIDE_WORD = ['left', 'middle', 'right'];
  function lane(p) { return p && typeof p.slot === 'number' ? C.CHANNEL_OF[p.slot] : 1; }
  /* the man in their line who stands opposite him: their right faces your left */
  function markerOf(opp, p, line, avoid) {
    var l = inLine(opp, line);
    if (!l.length) l = opp.players;
    /* a repeated situation faces a man who has not been in it yet, when
     * there is one (model.js castFor does the same for your man) */
    if (avoid) {
      var fresh = l.filter(function (q) { return !avoid[q.id]; });
      if (fresh.length) l = fresh;
    }
    /* the man standing opposite: slot 0 (your left touchline) faces their
     * slot 4 (their right), and so on. The nearest slot if nobody is there. */
    var want = 4 - (p && typeof p.slot === 'number' ? p.slot : 2);
    var b = null, bd = 99;
    l.forEach(function (q) {
      var d = Math.abs((typeof q.slot === 'number' ? q.slot : 2) - want);
      if (d < bd) { bd = d; b = q; }
    });
    return b;
  }
  function bestOf(list, id, legs, not) {
    return best(list.filter(function (p) { return p !== not; }), id, legs);
  }
  /* ------------------------------------------ CARRIED ADVANTAGE (a2) */
  /* What a decision wins carries into the NEXT decision of the same attack,
   * as a named edge with a number. Eduardo: the order of choices should
   * matter. A switch leaves space on one side, and a cross or a run down
   * that side is better for it; beating the full-back opens the pull-back;
   * going back draws their defenders up, and the pass through gets easier.
   * `applies(c, o, x)` says whether edge c helps option o on this menu. */
  var CARRY = {
    space: { amount: 2,
      text: function (c) { return 'Space on the ' + SIDE_WORD[c.lane] + ': +2 to a cross, a cut-back or a run down the ' + SIDE_WORD[c.lane]; },
      why: function (c) { return 'there is space on the ' + SIDE_WORD[c.lane]; },
      applies: function (c, o, x) { return ['Z_CROSS', 'Z_CUTBACK', 'Z_TAKE_ON', 'Z_OVERLAP'].indexOf(o.id) >= 0 && lane(x.actor) === c.lane; } },
    stretched: { amount: 2,
      text: function () { return 'Their defence is stretched across the pitch: +2 to a pass through or a long ball behind them'; },
      why: function () { return 'their defence is stretched'; },
      applies: function (c, o) { return ['Z_THROUGH', 'Z_RUN_BEHIND', 'Z_LONG_UP'].indexOf(o.id) >= 0; } },
    drawn: { amount: 2,
      text: function () { return 'Their defenders stepped up after the ball: +2 to a pass through or a long ball behind them'; },
      why: function () { return 'their defenders stepped up'; },
      applies: function (c, o) { return ['Z_THROUGH', 'Z_RUN_BEHIND', 'Z_LONG_UP'].indexOf(o.id) >= 0; } },
    backing: { amount: 2,
      text: function () { return 'Their defence is backing off: +2 to a shot from outside the box or to running at them'; },
      why: function () { return 'their defence is backing off'; },
      applies: function (c, o) { return ['Z_SHOOT_FAR', 'Z_TAKE_ON'].indexOf(o.id) >= 0; } },
    through: { amount: 2,
      text: function (c) { return first(c.man) + ' is past the last defender: +2 to his shot'; },
      why: function (c) { return first(c.man) + ' is past the last defender'; },
      applies: function (c, o) { return ['Z_SHOOT', 'Z_PLACE', 'Z_CHIP'].indexOf(o.id) >= 0 && o.actor === c.man; } },
    unmarked: { amount: 2,
      text: function (c) { return first(c.man) + ' arrives unmarked: +2 to his shot'; },
      why: function (c) { return first(c.man) + ' arrives unmarked'; },
      applies: function (c, o) { return ['Z_SHOOT', 'Z_PLACE', 'Z_CHIP'].indexOf(o.id) >= 0 && o.actor === c.man; } },
    beaten: { amount: 2,
      text: function (c) { return first(c.man) + ' is out of position: +2 in your next duel against him'; },
      why: function (c) { return first(c.man) + ' is out of position'; },
      applies: function (c, o) { return o.foil === c.man; } },
    /* defending (a3): what a half-successful stop wins for the last
     * decision in your box */
    goalside: { amount: 2,
      text: function (c) { return first(c.man) + ' is still between ' + first(c.foil) + ' and your goal: +2 to ' + first(c.man) + ' blocking a shot or winning a header'; },
      why: function (c) { return first(c.man) + ' is still between ' + first(c.foil) + ' and your goal'; },
      applies: function (c, o) { return (o.id === 'BOX_BLOCK' || o.id === 'BOX_HEADER') && o.actor === c.man; } },
    slowed: { amount: 2,
      text: function (c) { return first(c.man) + ' had to slow down: +2 to your keeper'; },
      why: function (c) { return first(c.man) + ' had to slow down'; },
      applies: function (c, o) { return ['BOX_SAVE', 'BOX_RUSH', 'BOX_CLAIM'].indexOf(o.id) >= 0; } },
    angle: { amount: 2,
      text: function (c) { return first(c.man) + ' was forced wide, so the angle is narrow: +2 to your keeper'; },
      why: function (c) { return first(c.man) + ' is shooting from a narrow angle'; },
      applies: function (c, o) { return ['BOX_SAVE', 'BOX_CLAIM'].indexOf(o.id) >= 0; } },
    /* a4: winning the ball in midfield while their players are going
     * forward, and a defence that dropped back in time */
    caught: { amount: 2,
      text: function () { return 'Their players were going forward when you won it: +2 to a pass through, a long ball or running at them'; },
      why: function () { return 'their players were going forward'; },
      applies: function (c, o) { return ['Z_THROUGH', 'Z_RUN_BEHIND', 'Z_CARRY'].indexOf(o.id) >= 0; } },
    far: { amount: 2,
      text: function () { return 'The free kick is 25 metres out: +2 to stopping it'; },
      why: function () { return 'the free kick is 25 metres out'; },
      applies: function (c, o) { return ['BOX_WALL', 'BOX_FK_SAVE', 'BOX_CHARGE'].indexOf(o.id) >= 0; } },
    short: { amount: 2,
      text: function () { return 'Their defence is short of players after their attack: +2 to running at them, a cross, a cut-back or a shot from outside the box'; },
      why: function () { return 'their defence is short of players'; },
      applies: function (c, o) { return ['Z_TAKE_ON', 'Z_CROSS', 'Z_CUTBACK', 'Z_SHOOT_FAR'].indexOf(o.id) >= 0; } },
    set: { amount: 2,
      text: function (c) { return 'Your defence was back in place before ' + first(c.man) + ' got there: +2 in your next duel against ' + first(c.man); },
      why: function (c) { return 'your defence was back in place before ' + first(c.man) + ' got there'; },
      applies: function (c, o) { return o.foil === c.man; } },
    upfield: { amount: 2,
      text: function () { return 'They have players up the pitch after their attack: +2 to a pass forward or a long ball'; },
      why: function () { return 'they have players up the pitch'; },
      applies: function (c, o) { return ['Z_LONG_UP', 'Z_RUN_BEHIND', 'Z_PASS_MID', 'Z_CARRY_OUT', 'KW_Z_THROUGH_DEEP', 'PAIR_FLICK'].indexOf(o.id) >= 0; } },
    /* ---- edges only a keyword or a pair wins (e1, from d1) */
    twoBeaten: { amount: 3,
      text: function (c) { return first(c.man) + ' got past ' + first(c.a) + ' and ' + first(c.b) + ', so they are a player short: +3 in your next duel'; },
      why: function (c) { return first(c.man) + ' got past two of their players'; },
      applies: function () { return true; } },
    running: { amount: 2,
      text: function (c) { return first(c.man) + ' has the ball running at their goal: +2 in his next duel'; },
      why: function (c) { return first(c.man) + ' is running at their goal'; },
      applies: function (c, o) { return o.actor === c.man; } },
    wide: { amount: 3,
      text: function (c) { return first(c.man) + ' is round the outside of ' + first(c.fb) + ': +3 to his cross, cut-back or pull-back'; },
      why: function (c) { return first(c.man) + ' is round the outside of ' + first(c.fb); },
      applies: function (c, o, x) { return ['Z_CROSS', 'Z_CUTBACK', 'Z_PULLBACK', 'KW_Z_LOW_CROSS'].indexOf(o.id) >= 0 && x.actor === c.man; } },
    onetwo: { amount: 2,
      text: function (c) { return first(c.man) + ' is running past ' + first(c.foil) + ': +2 to the pass straight back from ' + first(c.mate); },
      why: function (c) { return first(c.man) + ' is already running past ' + first(c.foil); },
      applies: function (c, o) { return o.id === 'OT_RETURN'; } },
    loose: { amount: 2,
      text: function (c) { return 'Their keeper is on the ground after the save: +2 to a shot by ' + first(c.man) + ' now'; },
      why: function () { return 'their keeper is on the ground'; },
      applies: function (c, o) { return ['REB_SHOOT', 'Z_SHOOT', 'Z_PLACE', 'Z_CHIP'].indexOf(o.id) >= 0 && o.actor === c.man; } },
    won: { amount: function (c) { return c.n || 2; },
      text: function (c) { return 'Their team was going forward when ' + first(c.man) + ' won the ball back: +' + (c.n || 2) + ' to your next pass or run'; },
      why: function (c) { return 'their team was going forward when ' + first(c.man) + ' won it back'; },
      applies: function (c, o) { return ['Z_RECYCLE', 'Z_KEEP_BACK', 'Z_LAYOFF', 'HOLD'].indexOf(o.id) < 0; } },
    /* m1 (w1a, w1b and w1e made this same fix): an edge a build component
     * carries into the next decision (effects.js grant / addEdge). w0 declared
     * it and said it on the card, but with no row here it never reached the
     * next roll. It helps the next option by its man (anyone if none) with one
     * of its tags (any if none), and is named by its reason and the component
     * that gave it. Only a build makes one. */
    fx: { amount: function (c) { return c.n || 0; },
      text: function (c) { return String(c.text || ''); },
      why: function (c) { return String(c.why || c.source) + ' (' + String(c.source).replace(/ \(.*$/, '') + ')'; },
      applies: function (c, o) {
        if (GUARD.fxEdge === false) return false;   /* m2 from w1d: content-d-check --break edgeapply */
        if (c.man && o.actor !== c.man) return false;
        return !c.tags || !c.tags.length || (o.tags || []).some(function (t) { return c.tags.indexOf(t) >= 0; });
      } }
  };
  function amountOf(d, c) { return typeof d.amount === 'function' ? d.amount(c) : d.amount; }
  function carryText(c) { var d = CARRY[c.id]; return d ? d.text(c) : ''; }
  /* "Space on the right: +2 to a cross" as "space on the right (+2 to a cross)" */
  function edgeWords(c) {
    var t = carryText(c), i = t.indexOf(': ');
    return i < 0 ? t : t.slice(0, i) + ' (' + t.slice(i + 2) + ')';
  }
  /* call2: "+2 space on the left", from the edge's own reason */
  function edgeShort(c) {
    var d = CARRY[c.id], n = amountOf(d, c);
    return (n > 0 ? '+' : '') + n + ' to you next (' + d.why(c).replace(/^there is /, '') + ')';
  }
  /* call3: THE OUTCOME ICON. Every result gets exactly one of eight icons,
   * always from your side (your goal is on the left of the field strip):
   *   fwd       the ball moves toward their goal (you go forward, you push
   *             their attack back, or you win it and your attack starts
   *             further up than where the ball was)
   *   back      the ball moves toward your goal with them: they win it and
   *             attack, or their attack comes closer
   *   backKeep  the ball moves toward your goal and you keep it (a pass
   *             back): the same arrow in grey, so a safe pass back never
   *             reads like losing the ball
   *   stay      the ball stays in the same zone (you keep it; their
   *             rebound or header in your box)
   *   goal      you score            conceded   they score
   *   lost      your attack ends: they have the ball, with no danger
   *   won       their attack ends: you win, stop or clear it
   *   dead      play stops: out of play, a save, a miss, a free kick, a
   *             corner, a substitution
   * Decided here, once, from the result's data (effect, where the ball was,
   * move / tmove / win and the zone they lead to, via, and resolve.js END for
   * a play that stops), never from its sentence and never per card. `info`
   * is where the ball is and whose moment it is (match.js annotate). The
   * rule names are the rows of the table in node.json. */
  var ICONS = ['fwd', 'back', 'backKeep', 'stay', 'goal', 'conceded', 'lost', 'won', 'dead'];
  var END_ICON = {
    you: { kept: 'stay', clock: 'stay', keeper: 'lost', cleared: 'lost', caught: 'lost', saved: 'dead', wide: 'dead', over: 'dead',
      out: 'dead', 'throw': 'dead', blocked: 'dead', time: 'dead', fresh: 'dead' },
    them: { won: 'won', stop: 'won', clear: 'won', held: 'won', back: 'dead', foul: 'dead', wide: 'dead', over: 'dead',
      out: 'dead', 'throw': 'dead', fresh: 'dead', clock: 'dead', time: 'dead' }
  };
  function clampZ(z, lo, hi) { return Math.max(lo, Math.min(hi, z)); }
  function iconOf(x, o, info) {
    var you = info.who === 'you', pos = info.pos, e = x.effect, zoned = !!info.zoned;
    var cmp = function (to, rule, ball) {
      return { icon: to > pos ? 'fwd' : to < pos ? (ball === 'you' ? 'backKeep' : 'back') : 'stay', to: to, ball: ball, rule: rule };
    };
    if (you) {
      if (e === 'goal') return { icon: 'goal', rule: 'you score' };
      if (e === 'break') return { icon: 'back', ball: 'them', rule: 'they win it and attack' };
      if (e === 'rest') return { icon: 'dead', rule: 'substitution' };
      if (x.caught) return { icon: 'lost', ball: 'them', rule: 'end: ' + (x.end || 'caught') };
      if (typeof x.move === 'number' && zoned) {
        var a = clampZ(pos + x.move, 0, 3);
        if (x.mode === 'freekick' && a <= pos) return { icon: 'dead', to: a, ball: 'you', rule: 'free kick where the ball is' };
        return cmp(a, 'your ball moves (move)', 'you');
      }
      if (e === 'ground') return { icon: 'stay', ball: 'you', rule: 'your attack goes on (no zones)' };
      var iy = END_ICON.you[x.end];
      return iy ? { icon: iy, ball: iy === 'lost' ? 'them' : iy === 'stay' ? 'you' : null, rule: 'end: ' + x.end }
        : { icon: 'dead', rule: 'your attack stops (no end given)' };
    }
    if (e === 'concede') return { icon: 'conceded', rule: 'they score' };
    var tz = typeof info.tzone === 'number';
    /* you win it in their attack: your attack starts at winZone (match.js) */
    if (x.win && tz) {
      var wz = typeof o.winZone === 'number' ? o.winZone : 0;
      return { icon: wz > pos ? 'fwd' : 'won', to: wz, ball: 'you', rule: 'you win it (win, winZone)' };
    }
    /* your keeper or defender plays it out: your attack starts at `move` */
    if (typeof x.move === 'number' && zoned && !tz && e !== 'break') {
      var nz = clampZ(x.move, 0, 3);
      return { icon: nz > pos ? 'fwd' : 'won', to: nz, ball: 'you', rule: 'your ball from their attack (move)' };
    }
    if (x.via === 'corner' || x.via === 'freekick' || x.via === 'fkcross') return { icon: 'dead', ball: 'them', rule: 'corner or free kick to them (via)' };
    /* their attack moves: tmove zones toward your goal, from midfield (1),
     * the edge of your box (0) or your box (-1) */
    if (typeof x.tmove === 'number' && (tz || pos === -1) && !(pos === -1 && x.tmove === 0 && !x.via)) {
      return cmp(Math.max(-1, pos - x.tmove), 'their attack moves (tmove)', 'them');
    }
    if (e === 'break' || x.into) return { icon: 'back', ball: 'them', rule: 'their man gets past (break, into)' };
    if (e === 'rest') return { icon: 'dead', rule: 'substitution' };
    var it = END_ICON.them[x.end];
    if (it) return { icon: it, ball: it === 'won' && (x.end === 'won' || x.end === 'held') ? 'you' : null, rule: 'end: ' + x.end };
    return e === 'stopped' ? { icon: 'won', rule: 'their attack stopped (no end given)' } : { icon: 'dead', rule: 'their attack stops (no end given)' };
  }

  /* call2: a result in a few words, from its data. call3: from the same
   * reading as its icon, so two results on one card that end differently
   * never read the same: who has the ball and where, how a play stops, and
   * an edge with whose it is ("then +2 to you next"). The icon says the
   * direction, so the words do not repeat it. */
  var SHORT_TO = ['Back in your half', 'Into midfield', 'To the edge of their box', 'Into their box'];
  var SHORT_BACK = ['Back to your half, still yours', 'Back to midfield, still yours', 'Back to the edge of their box, still yours', 'Back into their box, still yours'];
  var END_SHORT = {
    you: { kept: 'You keep it, start again', clock: 'The clock runs down', keeper: 'Runs through to their keeper',
      cleared: 'They kick it clear', caught: 'Their keeper catches it', saved: 'Their keeper saves it', wide: 'It goes wide',
      over: 'Over the bar', out: 'Out of play', 'throw': 'Out for their throw-in', blocked: 'Blocked, out of play',
      time: 'Time added back on', fresh: 'Fresh legs, no better' },
    them: { won: 'You win the ball', stop: 'You stop them', clear: 'You clear it', held: 'Your keeper holds it',
      back: 'They keep it but go back', foul: 'Free kick to them', wide: 'It goes wide', over: 'Over the bar',
      out: 'Out of play', 'throw': 'Out for their throw-in', fresh: 'Fresh legs, no better', clock: 'The clock runs down',
      time: 'Time added back on' }
  };
  function shortOf(x, o, info, ic) {
    ic = ic || iconOf(x, o, info);
    var you = info.who === 'you';
    var to = x.to ? first(x.to) : null;
    var him = first(x.theirTo || o.theirTo || o.foil);
    if (you) {
      if (x.effect === 'goal') return 'Goal';
      if (x.effect === 'break') return 'They win it and attack';
      if (x.effect === 'rest') return 'Stamina back to 100';
      if (x.caught) return END_SHORT.you.caught;
      if (typeof ic.to === 'number') {
        if (x.rebound) return to ? 'Saved, ' + to + ' follows up' : o.mate ? 'Saved, ' + first(o.mate) + ' follows up' : 'Saved, you get the rebound';
        if (x.mode === 'freekick') return ic.to === 2 ? 'Free kick to you, edge of their box' : 'Free kick to you';
        if (ic.icon === 'fwd') return SHORT_TO[ic.to];
        if (ic.icon === 'backKeep') return SHORT_BACK[ic.to];
        return 'You keep the ball' + (to ? ', ' + to + ' has it' : '');
      }
      if (x.end === 'kept' && o.receiver) return first(o.receiver) + ' has it, attack over';
      return END_SHORT.you[x.end] || (o.pays === 'sub' ? 'Fresh legs, no better' : 'Attack over');
    }
    if (x.effect === 'concede') return 'They score';
    if (ic.ball === 'you' && typeof ic.to === 'number') {
      return (x.end === 'held' ? 'Your keeper holds it: your ball ' : x.win ? 'You win it: your ball ' : 'Your ball ') + ZONE_AT[ic.to];
    }
    if (x.via === 'corner') return 'Corner to them';
    if (x.via === 'freekick' || x.via === 'fkcross') return 'Free kick to them, edge of your box';
    if (typeof ic.to === 'number') {
      if (ic.icon === 'fwd') return 'Pushed back: ' + him + ' at the edge of your box';
      if (ic.icon === 'stay') return x.via === 'header' ? him + ' heads at goal' : 'Saved, ' + him + ' follows up';
      if (x.via === 'alone') return him + ' through on goal';
      if (x.via === 'open') return him + ' round your keeper';
      if (x.via === 'cross') return 'They cross it into your box';
      if (x.via === 'box') return him + ' into your box';
      return ic.to === 0 ? 'They reach the edge of your box' : 'They get into your box';
    }
    if (x.effect === 'break' || x.into) return x.into || x.via === 'box' ? him + ' into your box' : him + ' gets past';
    return END_SHORT.them[x.end] || 'Their attack is over';
  }
  /* call3: what an edge a result carries says, short, with whose it is:
   * "then +2 to you next" on the result, the reason beside it */
  function edgeAmount(gl) { return gl.reduce(function (a, c) { return Math.max(a, amountOf(CARRY[c.id], c)); }, 0); }
  function withEdge(base, gl) { return gl.length ? base + ', then +' + edgeAmount(gl) + ' to you next' : base; }
  function gainsOf(x, o) {
    var gl = [];
    (x.bands || [x.band]).forEach(function (bd) {
      ((o.grants && o.grants[bd]) || []).forEach(function (c) { if (CARRY[c.id] && gl.indexOf(c) < 0) gl.push(c); });
    });
    return x.edgeNote ? gl : [];
  }
  /* the whole annotation of one decision's menu: every result's icon and
   * short form, where the ball is (`info`, from match.js) */
  function annotate(options, info) {
    (options || []).forEach(function (o) {
      (o.outcomes || []).forEach(function (x) {
        var ic = iconOf(x, o, info);
        x.icon = ic.icon; x.iconRule = ic.rule;
        x.ballTo = typeof ic.to === 'number' ? ic.to : null;
        x.shortBase = shortOf(x, o, info, ic);
        x.short = withEdge(x.shortBase, gainsOf(x, o));
        /* and the edge THEY get from it (match.js theirGot: your man lost
         * the duel, or your keeper only got a touch), with whose it is */
        var bs = x.bands || [x.band];
        if (info.who === 'them' && o.theirGrant && x.effect !== 'concede' && (bs.indexOf('bad') >= 0 || (o.pays === 'tsweep' && bs.indexOf('mixed') >= 0))) {
          x.short += ', then +' + o.theirGrant.amount + ' to them next';
          var tgt = o.theirGrant.text && /: \+\d+ to (.*)$/.test(o.theirGrant.text) ? o.theirGrant.text.replace(/^.*: \+\d+ to /, '') : 'them';
          x.theirEdgeNote = 'Then, for them next: +' + o.theirGrant.amount + ' to ' + tgt + ', because ' + o.theirGrant.why + '.';
        } else delete x.theirEdgeNote;
      });
    });
  }
  /* g1: what a result did NOT win, said on its line when the other result
   * that ends the same way did win it */
  function withoutEdge(c) {
    switch (c.id) {
      case 'space': return 'but without space on the ' + SIDE_WORD[c.lane];
      case 'stretched': return 'but their defence is still in shape';
      case 'drawn': return 'but their defenders are still in place';
      case 'backing': return 'but their defence is still close';
      case 'beaten': return 'but ' + first(c.man) + ' is still in position';
      case 'twoBeaten': return 'but their players are still in position';
      case 'through': case 'unmarked': return 'but ' + first(c.man) + ' is not clear of their defenders';
      case 'running': return 'but ' + first(c.man) + ' is not running at their goal';
      case 'wide': return 'but ' + first(c.man) + ' is not round the outside of ' + first(c.fb);
      case 'goalside': return 'but ' + first(c.man) + ' is no longer between ' + first(c.foil) + ' and your goal';
      case 'set': return 'but your defence is not back in place';
      case 'caught': case 'upfield': return 'but their players are back in position';
      /* txt2: the two that fell through to "but gains nothing more" (the
       * text audit, item 23): the closer free kick already says where it is */
      case 'short': return 'but their defence is not short of players';
      case 'far': return null;
    }
    return null;
  }
  /* txt2: the same, as a sentence of its own, after a result that ends the
   * attack ("..., and their attack is over, but their players are back in
   * position" read as if it went on) or would run over 30 words */
  function withoutEdgeSentence(c) {
    var w = withoutEdge(c);
    if (!w) return null;
    if (c.id === 'space') return 'There is no space on the ' + SIDE_WORD[c.lane] + '.';
    w = w.replace(/^but /, '');
    return w.charAt(0).toUpperCase() + w.slice(1) + '.';
  }
  /* e1: the rules that keep every sentence reading from the one state of
   * play. Each can be switched off, so the tests can show that the check
   * guarding it fails without it (test.js, "E1"). */
  var GUARD = { air: true, stack: true, dest: true, say: true, passer: true, nearest: true, form: true, aerial: true, merge: true, sureGoal: true, offRunner: true, noTrap: true, keeperFresh: true, realSafe: true, blockFloor: true, overlapScene: true, keepTwo: true, ghostFree: true, placedHonest: true, fxSlot: true, keeperOut: true, headerHonest: true, offsideStop: true, namesRolled: true, namesReceiver: true, wingScene: true, leftBehind: true };

  /* the full-back on the overlap scene: on the carrier's side, or else
   * the quickest wide defender (Z_OVERLAP, and call3's scene sentence,
   * model.js, so both read the same man) */
  function overlapBack(x) {
    var l = lane(x.actor);
    var wide = inLine(x.squad, 0).filter(function (p) { return lane(p) !== 1 && p !== x.actor; });
    return wide.filter(function (p) { return lane(p) === l; })[0] ||
      wide.slice().sort(function (a, b) { return A.eff(b, 'pace', x.legs) - A.eff(a, 'pace', x.legs); })[0] || null;
  }
  /* call3: THE WING SCENES FROM ONE STATE. The overlap scene said "your
   * full-back has run past your own winger" and then "Yamal has the ball in
   * midfield", which read as two different places. Now one sentence names
   * the carrier, his wing and the full-back the menu offers. */
  function overlapScene(x, zoneWords) {
    var a = x.actor, side = SIDE_WORD[lane(a)], fn = first(x.foil);
    if (!a || lane(a) === 1) return null;
    if (a.line === 0) {
      return first(a) + ' has the ball on the ' + side + ' wing, ' + zoneWords + ': he has run past your own winger on the outside, and nobody has gone with him. ' +
        fn + ' is the nearest of their players to ' + first(a) + '.';
    }
    var fb = overlapBack(x);
    if (!fb) return null;
    if (lane(fb) === lane(a)) {
      return first(fb) + ' has run past ' + first(a) + ' on the outside, on the ' + side + ' wing, and nobody has gone with ' + first(fb) + '. ' +
        first(a) + ' has the ball there, ' + zoneWords + '. ' + fn + ' is the nearest of their players to ' + first(a) + '.';
    }
    return first(fb) + ' is running up the ' + SIDE_WORD[lane(fb)] + ' wing, and nobody has gone with him. ' +
      first(a) + ' has the ball on the ' + side + ' wing, ' + zoneWords + '. ' + fn + ' is the nearest of their players to ' + first(a) + '.';
  }
  /* their winger one against one: his wing (your side of the pitch), where,
   * and the one man of yours in front of him */
  function theirWingScene(f, act, tzWords) {
    if (!f || typeof f.slot !== 'number') return null;
    var wl = C.CHANNEL_OF[4 - f.slot];
    var role = act && act.line === 0 ? 'your full-back' : act && act.line === 1 ? 'your wide midfielder' : 'your player';
    return first(f) + ', their winger, has the ball out wide' + (wl === 1 ? '' : ' on your ' + SIDE_WORD[wl]) + ', ' + tzWords + '. ' +
      first(act) + ', ' + role + (wl === 1 ? ', is the only one of your players close in front of him.' : ', is the only one of your players on that wing in front of him.');   // m6 (review round 3): it said "the only one of your players in front of him" with four to six of yours between him and the goal
  }
  /* call3: who a short, safe pass goes to: the man the scene names beside
   * the passer, or the best passer in his line or the one ahead of it */
  function receiverFor(x, sup0) {
    var passer = x.support;
    if (sup0 && sup0 !== passer && !sup0.off) return sup0;
    var ln = passer && typeof passer.line === 'number' ? passer.line : 1;
    var l = (x.squad && x.squad.players || []).filter(function (p) { return p !== passer && !p.off && (p.line === ln || p.line === Math.min(2, ln + 1)); });
    return best(l, 'technique', x.legs) || null;
  }
  /* a teammate in these lines, never the man on the ball */
  function near(x, lines, id) {
    var l = x.squad.players.filter(function (p) { return p !== x.actor && lines.indexOf(p.line) >= 0; });
    return best(l, id, x.legs);
  }

  /* ------------------------------------------- keywords in the zones (e1, from d1) */
  /* which of several players with the same keyword gets the option: the
   * Crosser on the side of the ball, otherwise they take turns through the
   * match, so two Playmakers both get their moments */
  function pickHolder(x, id, attr, keep) {
    if (!KWL) return null;
    var list = KWL.holders(x.squad, id).filter(function (p) { return !keep || keep(p); });
    if (list.length <= 1) return list[0] || null;
    list = list.slice().sort(function (a, b) {
      var va = attr === 'reach' ? A.reach(a, x.legs) : A.eff(a, attr, x.legs);
      var vb = attr === 'reach' ? A.reach(b, x.legs) : A.eff(b, attr, x.legs);
      return vb - va;
    });
    if (id === 'CROSSER' && x.actor && typeof x.actor.slot === 'number') {
      var side = list.filter(function (p) { return lane(p) === lane(x.actor); });
      if (side.length) return side[0];
    }
    var turn = Math.floor((((x.state && x.state.minute) || 0) + String(x.sit.id).length) / 5);
    return list[turn % list.length];
  }
  function pickPair(x, id) {
    if (!KWL) return null;
    var list = KWL.pairOf(x.squad, id);
    if (list.length <= 1) return list[0] || null;
    var turn = Math.floor((((x.state && x.state.minute) || 0) + String(x.sit.id).length) / 5);
    return list[turn % list.length];
  }
  /* the men in their line who stand nearest to the one opposite him */
  function facingLine(opp, p, line) {
    var l = inLine(opp, line);
    if (!l.length) l = opp.players.slice();
    var want = 4 - (p && typeof p.slot === 'number' ? p.slot : 2);
    return l.slice().sort(function (a, b) {
      return Math.abs((typeof a.slot === 'number' ? a.slot : 2) - want) - Math.abs((typeof b.slot === 'number' ? b.slot : 2) - want);
    });
  }
  /* the label when the keyword man is not the one on the ball: the man on
   * the ball gives it to him first ("Cubarsi gives it to Rodri, who ...") */
  function via(x, h, verb) {
    return h === x.actor ? first(h) + ' ' + verb : first(x.actor) + ' gives it to ' + first(h) + ', who ' + verb;
  }
  function kwName(h, id) { return KWL ? KWL.unlockName(h, id) : null; }
  function prName(pr) { return KWL ? KWL.pairName(pr) : null; }
  function kwOn(p, id) { return !!(KWL && p && KWL.active(p, id)); }
  /* their man with a keyword, the best at the stat it uses */
  function theirKw(x, id, attr) { return KWL ? best(KWL.holders(x.opp, id), attr, 100) : null; }
  /* model.js loads after this file in the browser, so it is looked up when needed */
  function M() { return root.KMModel || require('./model.js'); }
  /* your man in front of theirs is a Destroyer with his free foul unused */
  function destroyerFree(x) {
    var used = (x.state && x.state.freeFouls) || {};
    return kwOn(x.actor, 'DESTROYER') && !used[x.actor.id] && !(x.state.booked && x.state.booked[x.actor.id]);
  }

  /* ------------------------------------------------------------ the pool */
  /* family: what shape of decision it is, so a moment can offer a spread
   *   press    take the risk, go for it
   *   hold     the low-risk one
   *   move     change where the match is being played
   *   stop     a defensive answer
   *   last     only available when it is nearly over and you are losing
   * when(x): does this option exist at all, given everything
   * build(x): the button and the sentence under it */

  var POOL = [
    /* ------------------------------------------ your keeper has the ball */
    /* His playtest, 2026-09-23: "Your keeper has the ball ... The first
     * option is that Simón goes to tackle Álvarez, but Simón is my keeper and
     * he has the ball." Every keeper_to_feet moment offered only defending
     * actions (tackle, stay goal-side, foul, head it clear). These two are the
     * only options that moment offers now (see KEEPER_BALL in offer). */
    {
      id: 'KEEPER_SHORT', family: 'press', side: 'them', keeperBall: true,
      when: function (x) { return x.sit.id === 'keeper_to_feet' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        var to = best(inLine(x.squad, 0), 'passing', x.legs);
        return {
          test: { mine: k, mineAttr: 'distribution', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even',
          does: {
            good: 'plays it short to ' + first(to) + ' before {foil} gets there',
            mixed: 'gets it to ' + first(to) + ', but {foil} is on ' + first(to) + ' straight away',
            bad: 'plays it straight to {foil}'
          },
          pays: 'stop', to: to,
          label: first(k) + ' plays it short to ' + first(to),
          read: tag(k, 'distribution', 100) + ' against ' + tag(x.foil, 'pace', 100) +
            '. If it works you keep the ball and are out of trouble. If ' + first(x.foil) +
            ' gets there first, only an empty goal is in front of ' + first(x.foil) + '.'
        };
      }
    },
    {
      id: 'KEEPER_WIDE', family: 'move', side: 'them', keeperBall: true,
      when: function (x) {
        var w = inLine(x.squad, 0).filter(function (p) { return C.CHANNEL_OF[p.slot] !== 1; });
        x._wideBack = best(w, 'pace', x.legs);
        return x.sit.id === 'keeper_to_feet' && !!x._wideBack && !!x.foil;
      },
      build: function (x) {
        var fb = x._wideBack, k = x.squad.keeper;
        return {
          test: { mine: fb, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even',
          does: {
            good: 'takes it from ' + first(k) + ' and runs it out past {foil}',
            mixed: 'takes it from ' + first(k) + ' but is pushed back towards his own goal',
            bad: 'takes it from ' + first(k) + ' and loses it to {foil}'
          },
          pays: 'stop', to: fb,
          label: first(k) + ' rolls it out to ' + first(fb) + ' on the wing',
          read: tag(fb, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100) +
            '. A race down the wing: the quicker man wins it.'
        };
      }
    },
    {
      id: 'KEEPER_OUT', family: 'stop', side: 'them', keeperBall: true,
      when: function (x) { return x.sit.id === 'keeper_to_feet' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'physique', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', because: 'the touchline is a big target',
          does: {
            good: 'kicks it out for their throw-in, well away from goal',
            mixed: GUARD.keeperOut ? 'kicks it out for their throw-in near his own box' : 'kicks it out for their throw-in, near his own box',
            bad: 'slices the kick straight to {foil}'
          },
          pays: 'stop', table: GUARD.keeperOut ? R.CONSEQUENCE.them.kickout : null, keeperOutFloor: true,
          label: first(k) + ' kicks it out of play',
          read: tag(k, 'physique', 100) + ' against ' + tag(x.foil, 'pace', 100) +
            '. They get the ball back, but nobody is through on goal.'
        };
      }
    },
    {
      id: 'KEEPER_LONG', family: 'hold', side: 'them', keeperBall: true,
      when: function (x) { return x.sit.id === 'keeper_to_feet' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'distribution', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', because: 'a long kick only has to clear the forward in front of him',
          does: {
            good: 'kicks it long, over ' + '{foil}',
            mixed: 'kicks it long, but only as far as their midfield',
            bad: 'kicks it against {foil}'
          },
          pays: 'stop',
          label: first(k) + ' kicks it long',
          read: tag(k, 'distribution', 100) + ' against ' + tag(x.foil, 'intelligence', 100) +
            '. You give the ball away even when it works.'
        };
      }
    },

    /* ---------------------------------------------------- always there */
    {
      id: 'ATTACK_BALL', family: 'press', side: 'you',
      when: function (x) { return x.sit.who === 'you' && !!x.actor; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: x.act.mine, theirs: x.foil, theirsAttr: x.act.theirs },
          risk: 'even',
          does: {
            good: 'wins the ball',
            mixed: 'reaches it at the same time as {foil}',
            bad: 'is beaten to the ball'
          },
          pays: 'goal',
          /* The attribute decides what kind of duel this is, so the words have
           * to follow it. A dropping ball resolves in the air, and "goes for
           * the ball" above "in the air 38" reads like two different events. */
          label: first(x.actor) + (x.act.mine === 'reach' ? ' goes up for it'
            : x.act.mine === 'pace' ? ' chases it down' : ' goes for the ball'),
          read: tag(x.actor, x.act.mine, x.legs) + ' against ' + tag(x.foil, x.act.theirs, 100)
        };
      }
    },
    {
      id: 'MEET_IT', family: 'stop', side: 'them',
      when: function (x) { return x.sit.who === 'them' && !!x.actor; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: x.act.mine, theirs: x.foil, theirsAttr: x.act.theirs },
          risk: 'even',
          /* and so do the outcome verbs: "mistimes the tackle" is the wrong
           * sentence for a footrace he lost */
          does: x.act.mine === 'reach' ? {
            good: 'wins the header',
            mixed: 'gets a head to it',
            bad: 'is beaten in the air'
          } : x.act.mine === 'pace' ? {
            good: 'gets there first',
            mixed: 'stays with {foil}',
            bad: 'is left behind'
          } : {
            good: 'times the tackle',
            mixed: 'forces {foil} out wide',
            bad: 'mistimes the tackle'
          },
          pays: 'stop', twoStep: true, grants: { mixed: x.act.mine === 'pace' ? [{ id: 'goalside', man: x.actor, foil: x.foil }] : [{ id: 'angle', man: x.foil }] },
          /* same rule as the attacking one: a duel resolved on Pace is a race,
           * not a tackle, and the words follow the attribute */
          label: x.act.mine === 'reach' ? first(x.actor) + ' goes up against ' + first(x.foil)
            : x.act.mine === 'pace' ? first(x.actor) + ' tries to keep up with ' + first(x.foil)
            : first(x.actor) + ' goes to tackle ' + first(x.foil),
          read: tag(x.actor, x.act.mine, x.legs) + ' against ' + tag(x.foil, x.act.theirs, 100)
        };
      }
    },
    {
      /* The safe defensive answer, always there. HOLD and SWITCH are the safe
       * answers on YOUR moments; when they are attacking, "play a short pass"
       * is nonsense, so this is its opposite number. Without it a defensive
       * moment could fall back to one option whenever the conditional
       * defending did not fire. */
      id: 'STAY_GOALSIDE', family: 'stop', side: 'them',
      when: function (x) { return x.sit.who === 'them' && !!x.actor; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'low', because: 'he only has to stay in front, not win the ball',
         
          does: {
            good: 'shepherds {foil} away from goal',
            mixed: 'gives ground, staying in front of {foil}',
            bad: 'is turned too easily'
          },
          pays: 'stop', twoStep: true, grants: { mixed: [{ id: 'goalside', man: x.actor, foil: x.foil }] },
          label: first(x.actor) + ' stays between ' + first(x.foil) + ' and the goal',
          read: tag(x.actor, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'technique', 100) +
            '. He does not go to ground, so a trick cannot beat him. He does not win the ball back either.'
        };
      }
    },
    {
      id: 'HOLD', family: 'hold', side: 'you',
      when: function (x) { return !!x.support; },
      build: function (x) {
        /* e1: in the zones the man on the ball plays the safe pass (the
         * state of play names him; a5 gave it to someone else) */
        var sup0 = x.support;
        if (x.zone !== undefined && x.zone !== null && x.actor) x = Object.assign({}, x, { support: x.actor });
        /* call3: the man he passes to, named on the card and in the result
         * (Eduardo: "who passed the ball? who received it?"). The play ends
         * with the ball kept, so who receives it changes nothing that
         * follows; he is the man the scene names beside the passer, or else
         * the best passer in his line or the one ahead of it. No dice. */
        var recv = GUARD.namesReceiver ? receiverFor(x, sup0) : null;
        var v = eff(x.support, x.act.safe, x.legs);
        var loseP = R.odds(v + 4 - eff(x.foil, 'intelligence', 100)).bad;
        return {
          test: { mine: x.support, mineAttr: x.act.safe, theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', because: 'a short pass into feet is an easy ball',
         
          does: {
            good: recv ? 'plays it short to ' + first(recv) : 'finds a teammate with it',
            mixed: recv ? 'looks for ' + first(recv) + ' but cannot find him' : 'cannot find anyone to pass to',
            bad: 'gives it straight to {foil}'
          },
          pays: 'keep', mate: recv, receiver: recv,
          label: recv ? first(x.support) + ' plays it short to ' + first(recv) : first(x.support) + ' plays a short, safe pass',
          read: tag(x.support, x.act.safe, x.legs) + '. ' +
            /* no promise the odds do not keep, and no "nothing comes of it":
             * the outcomes under this say exactly how it ends */
            /* said from the real chance of losing it (his +4 included), not
             * from his stat alone: Technique 11 read "usually keeps the ball"
             * next to a 42 percent chance of giving it away */
            (loseP < 0.1 ? 'Very unlikely to lose the ball, but this will not create a chance.'
              : loseP < 0.3 ? 'Usually keeps the ball, but this will not create a chance.'
                : 'Even the easy pass could go wrong here: ' + first(x.foil) + ' reads it well.')
        };
      }
    },
    {
      id: 'SWITCH', family: 'move', side: 'you',
      when: function (x) { return !!x.outlet; },
      build: function (x) {
        return {
          test: { mine: x.outlet, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'low', because: 'nobody is closing him down on that side yet',
         
          does: {
            good: 'turns with it',
            mixed: 'controls it, but slowly',
            bad: 'misses the pass entirely'
          },
          pays: 'ground',
          label: 'Pass it across to ' + first(x.outlet) + ' on the other side',
          read: tag2(x.outlet, ['technique', 'pace'], x.legs) +
            '. Takes time. They get their shape back while the ball travels.'
        };
      }
    },

    /* -------------------------------------------- his sweeper-keeper case */
    {
      id: 'KEEPER_SWEEPS', family: 'stop', side: 'them',
      /* a ball is going in behind, the man left is slow, and the keeper can
       * actually do it. All three, or the option does not appear. */
      when: function (x) {
        if (x.sit.who !== 'them') return false;
        /* a4: only for a ball played over your defence (the review of a3:
         * not for a winger with the ball at his feet) */
        if (['over_the_top'].indexOf(x.sit.id) < 0) return false;
        var k = x.squad.keeper;
        if (!k || !k.attr) return false;
        /* His correction: "if you have a sweeper-keeper he should always be
         * able to run. It just depends on his success rate versus a fast
         * attacker." So availability asks only what kind of keeper he is.
         * e1: what kind of keeper he is is now his keyword (keywords.js
         * SWEEPER_KEEPER), printed on the sheet, not a pair of numbers. */
        return kwOn(k, 'SWEEPER_KEEPER');
      },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          /* No penalty for a quick defender. His question: "why does the speed
           * of the defender affect whether the keeper reaches the ball?" It
           * does not. It affects whether you NEED the keeper to go, which is
           * what the other options are for. */
          test: { mine: k, mineAttr: 'distribution', theirs: x.foil, theirsAttr: 'pace', fresh: true },
          risk: 'high',
          does: {
            good: 'kicks it clear before {foil} reaches it',
            mixed: 'gets a touch on it',
            bad: 'misses the ball'
          },
          pays: 'stop', unlock: kwName(k, 'SWEEPER_KEEPER'), air: true,
          label: first(k) + ' runs out of his goal to clear it',
          read: 'Your keeper leaves his goal. ' + tag2(k, ['distribution', 'reflexes'], 100) +
            ' against ' + tag(x.foil, 'pace', 100) + '. ' +
            /* g1: the review of p3 found this line naming a defender other
             * than the scene's nearest, and one with his own card on the
             * same menu ("Laporte is not getting there" next to "Laporte
             * jumps for the header"). It says what is at stake instead. */
            'If ' + first(k) + ' misses it, nobody is between ' + first(x.foil) + ' and your goal.'
        };
      }
    },

    /* --------------------------------------------- conditional attacking */
    {
      id: 'LONG_TO_TARGET', family: 'press', side: 'you',
      when: function (x) {
        return x.sit.who === 'you' && !!tall(x.squad, 2, x.legs) &&
          A.eff(tall(x.squad, 2, x.legs), 'finishing', x.legs) >= 11;
      },
      build: function (x) {
        var t = tall(x.squad, 2, x.legs);
        var mark = best(inLine(x.opp, 0), 'physical', 100);
        return {
          test: { mine: t, mineAttr: 'reach', theirs: mark, theirsAttr: 'reach' },
          risk: 'even',
          does: {
            good: 'wins the header',
            mixed: 'gets his head to it',
            bad: 'is beaten in the air'
          },
          pays: 'goal',
          label: 'Cross it high for ' + first(t) + ' to head',
          read: first(t) + ' is your tallest forward. In the air he is ' +
            value(t, 'reach', x.legs) + ' against ' + first(mark) + ' on ' +
            value(mark, 'reach', 100) + '. Wins it, or it is their ball.'
        };
      }
    },
    {
      id: 'RUN_IN_BEHIND', family: 'press', side: 'you',
      when: function (x) {
        if (x.sit.who !== 'you') return false;
        var q = best(inLine(x.squad, 2), 'pace', x.legs);
        var d = worst(inLine(x.opp, 0), 'pace', 100);
        return q && d && A.eff(q, 'pace', x.legs) - A.eff(d, 'pace', 100) >= 4;
      },
      build: function (x) {
        var q = best(inLine(x.squad, 2), 'pace', x.legs);
        var d = worst(inLine(x.opp, 0), 'pace', 100);
        return {
          test: { mine: q, mineAttr: 'pace', theirs: d, theirsAttr: 'pace' },
          risk: 'high',
          does: {
            good: 'runs clear of the last defender',
            mixed: 'gets there a step late',
            bad: 'is caught before the ball arrives'
          },
          pays: 'goal',
          label: 'Pass it long for ' + first(q) + ' to chase',
          read: tag(q, 'pace', x.legs) + ' against ' + tag(d, 'pace', 100) +
            '. He is faster. If the pass is short, it is a goal kick.'
        };
      }
    },
    {
      id: 'DRIBBLE', family: 'press', side: 'you',
      when: function (x) {
        return x.sit.who === 'you' && x.actor && A.eff(x.actor, 'technique', x.legs) >= 15;
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'high',
          does: {
            good: 'goes past {foil}',
            mixed: 'is forced backwards by {foil}',
            bad: 'loses control of it'
          },
          pays: 'goal',
          label: first(x.actor) + ' runs straight at ' + first(x.foil),
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.foil, 'defending', 100) +
            '. He beats him or he loses the ball right there.'
        };
      }
    },
    {
      id: 'SHOOT_LONG', family: 'press', side: 'you',
      when: function (x) {
        var f = best(inLine(x.squad, 1).concat(inLine(x.squad, 2)), 'finishing', x.legs);
        return x.sit.who === 'you' && f && A.eff(f, 'finishing', x.legs) >= 13 &&
          ['second_ball', 'dead_ball_wide', 'third_man'].indexOf(x.sit.id) >= 0;
      },
      build: function (x) {
        var f = best(inLine(x.squad, 1).concat(inLine(x.squad, 2)), 'finishing', x.legs);
        return {
          /* THEIR keeper. This read x.squad.keeper, so a shot at their goal was
           * saved by your own goalkeeper: signing a good keeper made your own
           * long shots harder. Found by rendering the page in a real browser
           * and reading the sentence it produced. */
          test: { mine: f, mineAttr: 'finishing', theirs: x.opp.keeper, theirsAttr: 'reflexes' },
          risk: 'high',
          does: {
            good: 'strikes it cleanly',
            mixed: 'hits the target',
            bad: 'scuffs it straight to {foil}'
          },
          pays: 'goal',
          label: first(f) + ' shoots from outside the box',
          read: tag(f, 'finishing', x.legs) + ' against ' + tag(x.opp.keeper, 'reflexes', 100) +
            ' in their goal. Long way out, so most of these miss, but nobody is blocking it.'
        };
      }
    },
    {
      id: 'OVERLAP_RUN', family: 'move', side: 'you',
      when: function (x) {
        if (x.sit.who !== 'you' || !x.actor) return false;
        var lane = C.CHANNEL_OF[x.actor.slot];
        var fb = inLine(x.squad, 0).filter(function (p) {
          return C.CHANNEL_OF[p.slot] === lane && A.eff(p, 'pace', x.legs) >= 14;
        })[0];
        x._fb = fb;
        return !!fb;
      },
      build: function (x) {
        return {
          test: { mine: x._fb, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even',
          does: {
            good: 'gets outside {foil}',
            mixed: 'gets the cross in',
            bad: 'is caught in possession'
          },
          pays: 'ground',
          label: 'Send ' + first(x._fb) + ' running outside ' + first(x.foil),
          read: tag(x._fb, 'pace', x.legs) + '. Your full-back overlaps. It works, or he is out of position ' +
            'when they win it back.'
        };
      }
    },

    /* --------------------------------------------- conditional defending */
    {
      id: 'DROP_OFF', family: 'stop', side: 'them',
      when: function (x) {
        return x.sit.who === 'them' && x.actor && A.eff(x.actor, 'intelligence', x.legs) >= 14;
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'low', because: 'he is not committing to a tackle he can lose',
         
          does: {
            good: 'blocks the pass',
            mixed: 'contains {foil} without winning it',
            bad: 'backs off too far'
          },
          pays: 'stop', twoStep: true, grants: { mixed: [{ id: 'slowed', man: x.foil }] },
          label: first(x.actor) + ' stays back instead of tackling ' + first(x.foil),
          read: tag(x.actor, 'intelligence', x.legs) + '. He does not dive in. They keep the ball ' +
            'but they do not get through.'
        };
      }
    },
    {
      id: 'DOUBLE_UP', family: 'stop', side: 'them',
      when: function (x) {
        if (x.sit.who !== 'them' || !x.actor) return false;
        var lane = C.CHANNEL_OF[x.actor.slot];
        var mate = x.squad.players.filter(function (p) {
          return p !== x.actor && C.CHANNEL_OF[p.slot] === lane && p.line <= 1;
        })[0];
        x._mate = mate;
        return !!mate;
      },
      build: function (x) {
        return {
          test: { mine: x._mate, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: 4, because: 'there are two of them against one',
          does: {
            good: 'traps {foil} between them',
            mixed: 'slows {foil} down',
            bad: 'commits too early'
          },
          pays: 'stop', twoStep: true, grants: { mixed: [{ id: 'slowed', man: x.foil }] },
          label: 'Send ' + first(x._mate) + ' across to help ' + first(x.actor) +
            ' against ' + first(x.foil),
          read: tag(x._mate, 'defending', x.legs) + ' comes across to help. Two on one here, ' +
            'nobody covering the other side.'
        };
      }
    },
    {
      id: 'FOUL', family: 'stop', side: 'them',
      /* His question: "what made this option show up?" Fair. It used to be
       * "past the 25th minute", which is almost always, for no reason. A
       * professional foul is a thought only when you are losing the duel. */
      when: function (x) {
        if (x.sit.who !== 'them' || !x.actor || x.state.minute <= 20) return false;
        var mine = value(x.actor, x.act.mine, x.legs);
        var theirs = value(x.foil, x.act.theirs, 100);
        return mine - theirs <= 1;
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', because: 'stopping a man by fouling him is easy',
         
          does: {
            good: 'pulls {foil} down',
            mixed: 'catches {foil} late',
            bad: 'dives in and misses'
          },
          pays: 'card',
          label: first(x.actor) + ' fouls ' + first(x.foil) + ' to stop the attack',
          read: 'Stops the attack. ' + first(x.actor) + ' is booked, so a second foul sends him off, ' +
            'and they get a free kick here.'
        };
      }
    },
    {
      id: 'HEAD_CLEAR', family: 'stop', side: 'them', air: true,
      when: function (x) {
        /* e1: on a5's strip the header is the nearest defender's, the man
         * the scene names (Eduardo's playtest of p2: the scene named Cubarsí
         * and Laporte jumped); off the strip, your tallest defender */
        var t = typeof x.tzone === 'number' && GUARD.nearest ? x.actor : tall(x.squad, 0, x.legs);
        x._tallDef = t;
        return x.sit.who === 'them' && !!t && !!x.foil;
      },
      build: function (x) {
        return {
          test: { mine: x._tallDef, mineAttr: 'reach', theirs: x.foil, theirsAttr: 'reach' },
          risk: 'even', via: 'alone', fwd: 'gets his head to it first and is through on your goal.',
          does: {
            good: 'climbs above {foil} and heads it away',
            mixed: 'heads it as far as their midfield',
            bad: 'misses the header'
          },
          pays: 'stop',
          label: first(x._tallDef) + ' jumps for the header' + (typeof x.tzone === 'number' ? ' before ' + first(x.foil) + ' gets to it' : ''),
          read: 'In the air ' + first(x._tallDef) + ' is ' + value(x._tallDef, 'reach', x.legs) +
            ' against ' + first(x.foil) + ' on ' + value(x.foil, 'reach', 100) +
            /* g1 (from p3): said as the results say it */
            '. If ' + first(x._tallDef) + ' wins it cleanly, the danger is over.'
        };
      }
    },
    {
      id: 'OFFSIDE_TRAP', family: 'stop', side: 'them',
      when: function (x) {
        var line0 = inLine(x.squad, 0);
        if (x.sit.who !== 'them' || !line0.length) return false;
        var avg = line0.reduce(function (a, p) { return a + A.eff(p, 'intelligence', x.legs); }, 0) / line0.length;
        var comm = x.squad.keeper && x.squad.keeper.attr ? eff(x.squad.keeper, 'communication', 100) : 0;
        x._trapIQ = Math.round(avg);
        return avg >= 13 && comm >= 11;
      },
      build: function (x) {
        return {
          test: { mine: x.squad.keeper, mineAttr: 'communication', theirs: x.foil, theirsAttr: 'intelligence', fresh: true },
          risk: 'high',
          does: {
            good: 'steps up in line with the rest of the defence',
            mixed: 'steps up half a second late',
            bad: 'steps up on his own'
          },
          pays: 'offside',
          label: 'The defenders step forward together to catch ' + first(x.foil) + ' offside',
          read: tag(x.squad.keeper, 'communication', 100) + ' is organising your defenders. If one man is slow ' +
            'stepping up, the striker is clean through.'
        };
      }
    },

    /* ------------------------------------------------ score and clock */
    {
      id: 'WASTE_TIME', family: 'hold', side: 'you',
      when: function (x) {
        return x.state.minute >= 75 && x.state.score.you > x.state.score.them && !!x.support;
      },
      build: function (x) {
        /* e1: in the zones, the man on the ball takes it to the corner flag */
        if (x.zone !== undefined && x.zone !== null && x.actor) x = Object.assign({}, x, { support: x.actor });
        return {
          test: { mine: x.support, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'low', because: 'holding the ball by the corner flag is easy',
         
          does: {
            good: 'keeps the ball in the corner',
            mixed: 'is shoved off it',
            bad: 'loses it trying to hold it up'
          },
          pays: 'clock',
          label: 'Take the ball to the corner flag and waste time',
          read: tag(x.support, 'technique', x.legs) + '. You are ' + x.state.score.you + '-' +
            x.state.score.them + ' up with ' + (90 - x.state.minute) + ' minutes left. No chance created, ' +
            'and the clock runs down.'
        };
      }
    },
    {
      id: 'KEEPER_UP', family: 'last', side: 'you',
      when: function (x) {
        return x.state.minute >= 82 && x.state.score.you < x.state.score.them &&
          (x.zone === 2 || ['dead_ball_wide', 'second_ball'].indexOf(x.sit.id) >= 0) &&
          x.squad.keeper && x.squad.keeper.attr;
      },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'physique', theirs: x.foil, theirsAttr: 'reach', fresh: true },
          risk: 'high',
          does: {
            good: 'gets his head to the cross',
            mixed: 'gets in the way of his own forward',
            bad: 'is stranded upfield'
          },
          pays: 'goal',
          label: 'Send ' + first(k) + ' forward into their penalty area',
          read: 'Your keeper goes into their box. ' + tag(k, 'physique', 100) +
            '. You are losing with ' + (90 - x.state.minute) + ' minutes left. If they clear it, ' +
            'your goal is empty.'
        };
      }
    },
    {
      id: 'THROW_EVERYONE', family: 'last', side: 'you',
      when: function (x) {
        return x.state.minute >= 75 && x.state.score.you < x.state.score.them && x.sit.who === 'you';
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: x.act.mine, theirs: x.foil, theirsAttr: x.act.theirs },
          risk: 'high',
          does: {
            /* g1 (from p2): the words follow the man on the ball; "Oyarzabal
             * leaves the back line wide open" blamed a forward for the full-backs */
            good: 'plays it into the box, where your full-backs make it five against four,',
            mixed: 'plays it into a crowded box, and nobody gets a clean touch',
            bad: 'loses it with only two of your defenders back'
          },
          pays: 'goal',
          label: 'Push both full-backs forward and leave only two defenders',
          read: 'More bodies in their box for the rest of the match. You are losing with ' +
            (90 - x.state.minute) + ' minutes left. Every time they win it back after this, ' +
            'they have two against two.'
        };
      }
    },
    {
      id: 'FRESH_LEGS', family: 'hold', side: 'both',
      when: function (x) {
        /* one of three changes, and never the same man twice: a sub used to
         * be offered again and again (match state.usedSubs, state.subsLeft) */
        var used = (x.state && x.state.usedSubs) || {};
        var left = x.state && typeof x.state.subsLeft === 'number' ? x.state.subsLeft : 3;
        /* w0b: REAL SUBSTITUTIONS, when the build asks for them (effects.js
         * pickSub): a named man goes off for a named bench player. Without
         * it this is s0's option exactly: the line gets its stamina back. */
        var fxs = x.state && x.state.fx && !x.state.fx.suspended && x.state.fx.realSubs('you') ? x.state.fx : null;
        x._off = null;
        if (fxs) {
          var pr = fxs.pickSub('you', x.act.legs, used);
          x._sub = pr ? pr.on : null; x._off = pr ? pr.off : null;
          return !!pr && left > 0 && (x.legs <= fxs.subs.below || (fxs.subs.from !== null && x.state.minute >= fxs.subs.from));
        }
        var sub = (x.squad.bench || []).filter(function (p) { return p.attr && !used[p.id]; })[0];
        x._sub = sub;
        return !!sub && left > 0 && x.legs <= 45;
      },
      build: function (x) {
        var off = x._off || null, lw = { def: 'defence', mid: 'midfield', att: 'attack' }[x.act.legs];
        return {
          test: { mine: x._sub, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace', fresh: true },
          risk: 'low',
          does: off ? {
            good: 'comes on for ' + first(off),
            mixed: 'comes on for ' + first(off),
            bad: 'comes on for ' + first(off)
          } : {
            good: 'comes on',
            mixed: 'comes on',
            bad: 'comes on'
          },
          pays: 'sub',
          /* the line he refreshes: the man coming on is on the bench and has
           * no line of his own, which is why a substitution used to restore
           * nothing at all */
          restLine: x.act.legs,
          /* w0b: the man who goes off (real substitutions only) */
          subOff: off,
          label: off ? 'Substitute ' + first(x._sub) + ' on for ' + first(off) + ', with fresh legs' : 'Substitute ' + first(x._sub) + ' on, with fresh legs',
          read: 'Your ' + lw + ' is down to ' + Math.round(x.legs) + ' out of 100' + (x.legs <= 45 ? ' and losing Pace and Physical because of it' : '') + '. ' +
            (off ? first(x._sub) + ' comes on fresh and ' + first(off) + ' goes off: ' + first(x._sub) + ' plays in his place, with his own numbers and strengths. '
              : first(x._sub) + ' comes on fresh. ') + 'You use one of your three changes.'
        };
      }
    },
    /* ==================================================== ZONES (a1) */
    /* Eduardo liked "the ball moving up the pitch". Every decision in your
     * attack happens in one of four zones, and each zone offers its own KIND
     * of option: in your half you get it forward; in midfield you carry it,
     * play it through or go back; at the edge of their box you shoot, cross,
     * cut it back or run at the defender; in their box you shoot or square
     * it. `zones` says where an option exists. `to` is the man who has the
     * ball afterwards, so the next decision is his. */
    {
      id: 'Z_PASS_MID', family: 'press', side: 'you', zones: [0],
      when: function (x) { return !!near(x, [1], 'technique'); },
      build: function (x) {
        var to = near(x, [1], 'technique');
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', bonus: 2, because: 'a pass into midfield is a normal ball', to: to,
          does: {
            good: 'plays it past {foil} to ' + first(to),
            mixed: 'cannot find a way past {foil}',
            bad: 'plays it straight to {foil}'
          },
          pays: 'probe',
          label: first(x.actor) + ' passes it forward to ' + first(to) + ' in midfield',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) +
            ', the forward nearest to him, who is trying to read the pass.'
        };
      }
    },
    {
      id: 'Z_CARRY_OUT', family: 'move', side: 'you', zones: [0],
      when: function (x) { return A.eff(x.actor, 'technique', x.legs) >= 12; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'even', to: x.actor,
          does: {
            good: 'goes past {foil} with the ball',
            mixed: 'just gets away from {foil}',
            bad: 'loses it to {foil}'
          },
          pays: 'advance',
          label: first(x.actor) + ' runs it out of defence past ' + first(x.foil),
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.foil, 'defending', 100) +
            '. Forwards are not used to defending, but if ' + first(x.actor) + ' loses it, it is near your goal.'
        };
      }
    },
    {
      id: 'Z_LONG_UP', family: 'press', side: 'you', zones: [0],
      when: function (x) { x._t = bestOf(inLine(x.squad, 2), 'reach', x.legs, x.actor); return !!x._t; },
      build: function (x) {
        var t = x._t, m = markerOf(x.opp, t, 0);
        return {
          test: { mine: t, mineAttr: 'reach', theirs: m, theirsAttr: 'reach' },
          risk: 'even', to: t,
          does: {
            good: 'wins the header',
            mixed: 'gets his head to it, with nobody there to take it',
            bad: 'is beaten in the air by {foil}'
          },
          pays: 'through',
          label: first(x.actor) + ' kicks it long for ' + first(t) + ' to win in the air',
          read: 'In the air ' + first(t) + ' is ' + value(t, 'reach', x.legs) + ' against ' + first(m) +
            ' on ' + value(m, 'reach', 100) + '. If ' + first(t) + ' wins it, you skip midfield.'
        };
      }
    },
    {
      id: 'Z_KEEP_BACK', family: 'hold', side: 'you', zones: [0],
      when: function (x) { x._d = near(x, [0], 'technique'); return !!x._d; },
      build: function (x) {
        var d = x._d;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', because: 'a short pass across the back is an easy ball', to: d,
          does: {
            good: 'passes it across to ' + first(d),
            mixed: 'passes it across to ' + first(d) + ', a little too far in front of him',
            bad: 'plays it straight to {foil}'
          },
          pays: 'hold',
          label: first(x.actor) + ' passes it across to ' + first(d) + ' and keeps it',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'pace', 100) +
            ', who is running at ' + first(x.actor) + ' to block the pass. The ball stays in your half, and ' + first(d) +
            ' has it for the next decision.'
        };
      }
    },
    {
      id: 'Z_RUN_BEHIND', family: 'press', side: 'you', zones: [0, 1],
      when: function (x) {
        var q = best(inLine(x.squad, 2), 'pace', x.legs);
        var d = worst(inLine(x.opp, 0), 'pace', 100);
        x._q = q; x._slow = d;
        return q && d && q !== x.actor && A.eff(q, 'pace', x.legs) - A.eff(d, 'pace', 100) >= 3;
      },
      build: function (x) {
        var q = x._q, d = x._slow;
        return {
          test: { mine: q, mineAttr: 'pace', theirs: d, theirsAttr: 'pace' },
          risk: 'high', to: q, grants: { good: [{ id: 'through', man: q }] },
          does: {
            good: 'runs clear of {foil}',
            mixed: 'gets there a step late',
            bad: 'is caught by {foil} before the ball arrives'
          },
          pays: 'through',
          label: first(x.actor) + ' kicks it long for ' + first(q) + ' to chase',
          read: tag(q, 'pace', x.legs) + ' against ' + tag(d, 'pace', 100) + ', their slowest defender. ' +
            'If ' + first(q) + ' wins the race, your team has the ball ' + ZONE_AT[Math.min(3, x.zone + 2)] + '.'
        };
      }
    },
    {
      id: 'Z_CARRY', family: 'press', side: 'you', zones: [1],
      when: function (x) { return !!x.foil; },
      build: function (x) {
        /* a quick man runs past, a skilful one dribbles past: his better one */
        var quick = A.eff(x.actor, 'pace', x.legs) > A.eff(x.actor, 'technique', x.legs);
        return {
          test: quick ? { mine: x.actor, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' }
            : { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'even', to: x.actor, grants: { good: [{ id: 'backing' }] },
          does: quick ? {
            good: 'runs clear of {foil}',
            mixed: 'gets a metre ahead of {foil}',
            bad: 'is caught by {foil}'
          } : {
            good: 'dribbles past {foil}',
            mixed: 'squeezes past {foil}',
            bad: 'loses it to {foil}'
          },
          pays: 'advance',
          label: first(x.actor) + (quick ? ' runs at ' + first(x.foil) + ' with the ball' : ' dribbles at ' + first(x.foil)),
          read: (quick ? tag(x.actor, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100)
            : tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.foil, 'defending', 100)) +
            '. If ' + first(x.actor) + ' gets past, your team has the ball at the edge of their box.'
        };
      }
    },
    {
      id: 'Z_THROUGH', family: 'press', side: 'you', zones: [1],
      when: function (x) {
        x._run = bestOf(inLine(x.squad, 2), 'pace', x.legs, x.actor);
        return !!x._run && A.eff(x.actor, 'passing', x.legs) >= 11;
      },
      build: function (x) {
        var a = x._run, d = markerOf(x.opp, a, 0);
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'high', to: a, grants: { good: [{ id: 'through', man: a }] },
          does: {
            good: 'puts ' + first(a) + ' through past {foil}',
            mixed: 'plays it a little too far ahead of ' + first(a),
            bad: 'plays it straight to {foil}'
          },
          pays: 'through',
          label: first(x.actor) + ' plays the ball through for ' + first(a) + ' to run onto',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(d, 'intelligence', 100) +
            ', who is marking ' + first(a) + '. If it comes off, ' + first(a) + ' has the ball in their box.'
        };
      }
    },
    {
      id: 'Z_SWITCH', family: 'move', side: 'you', zones: [1],
      when: function (x) {
        var l = lane(x.actor);
        var far = x.squad.players.filter(function (p) {
          return p !== x.actor && p.line >= 1 && lane(p) !== 1 && lane(p) !== l;
        });
        x._wide = best(far, 'technique', x.legs);
        return !!x._wide;
      },
      build: function (x) {
        var w = x._wide, fb = markerOf(x.opp, w, 0);
        return {
          test: { mine: w, mineAttr: 'technique', theirs: fb, theirsAttr: 'intelligence' },
          risk: 'low', bonus: 2, because: 'nobody is near him on that side yet', to: w,
          grants: { good: [{ id: 'space', lane: lane(w) }], mixed: [{ id: 'stretched' }] },
          does: {
            good: 'takes the long pass before {foil} is across',
            mixed: 'takes the long pass, but {foil} is already there',
            bad: 'lets it run under his foot to {foil}'
          },
          pays: 'probe',
          label: first(x.actor) + ' switches it to ' + first(w) + ' on the ' + SIDE_WORD[lane(w)],
          read: tag(w, 'technique', x.legs) + ' against ' + tag(fb, 'intelligence', 100) +
            ', their full-back on that side.'
        };
      }
    },
    {
      id: 'Z_SHOOT_FAR', family: 'press', side: 'you', zones: [2], lastZones: [1],
      /* only a man who can shoot tries it from there (Finishing 14 or more);
       * at the end of a long attack anyone may have a go */
      when: function (x) {
        return !!x.keeper && (A.eff(x.actor, 'finishing', x.legs) >= 14 || !!(x.state && x.state.finishOnly));
      },
      build: function (x) {
        var far = x.zone < 2;
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          /* g1: from outside the box, the same size as theirs (LONG_SAVE) */
          risk: 'high', bonus: far ? -7 : -YOUR_LONG,
          because: far ? 'he is shooting from 35 metres' : 'he is shooting from outside the box',
          does: {
            good: 'hits it into the corner',
            mixed: 'hits the target',
            bad: 'hits it straight at {foil}'
          },
          pays: 'shot',
          label: first(x.actor) + (far ? ' shoots from 35 metres' : ' shoots from outside the box'),
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) +
            ' in their goal. A long way out, so ' + first(x.keeper) + ' will usually save it or catch it.'
        };
      }
    },
    {
      id: 'Z_CROSS', family: 'press', side: 'you', zones: [2], high: true,
      when: function (x) {
        x._head = bestOf(inLine(x.squad, 2), 'reach', x.legs, x.actor) || bestOf(inLine(x.squad, 1), 'reach', x.legs, x.actor);
        /* a cross comes from out wide: from the middle, move it wide first */
        return !!x._head && lane(x.actor) !== 1;
      },
      build: function (x) {
        var t = x._head, m = markerOf(x.opp, t, 0), wide = lane(x.actor) !== 1;
        return {
          test: { mine: t, mineAttr: 'reach', theirs: m, theirsAttr: 'reach' },
          risk: 'even', to: null, bonus: HEAD_BY, because: first(t) + ' knows where the cross is going and ' + first(m) + ' does not',
          does: {
            good: 'rises above {foil} to meet it',
            mixed: 'gets his head to it',
            bad: 'is beaten in the air by {foil}'
          },
          pays: 'header', actorFirst: t,
          label: first(x.actor) + ' crosses it for ' + first(t) + ' to head',
          read: 'In the air ' + first(t) + ' is ' + value(t, 'reach', x.legs) + ' against ' + first(m) +
            ' on ' + value(m, 'reach', 100) + '. ' + first(t) + ' scores only if he wins the header clearly; a narrow win puts it wide.'
        };
      }
    },
    {
      /* from the middle, the way to a cross or a cut-back is out wide */
      id: 'Z_WIDE', family: 'move', side: 'you', zones: [2],
      when: function (x) {
        if (lane(x.actor) !== 1) return false;
        var w = x.squad.players.filter(function (p) { return p !== x.actor && p !== x.prev && p.line >= 1 && lane(p) !== 1; });
        x._w = best(w, 'passing', x.legs);
        return !!x._w;
      },
      build: function (x) {
        var w = x._w, fb = markerOf(x.opp, w, 0);
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: fb, theirsAttr: 'intelligence' },
          risk: 'low', because: 'the pass goes away from their defenders', to: w,
          grants: { good: [{ id: 'space', lane: lane(w) }] },
          does: {
            good: 'passes it out to ' + first(w) + ' on the ' + SIDE_WORD[lane(w)],
            mixed: 'passes it out to ' + first(w) + ', a little behind him',
            bad: 'plays it straight to {foil}'
          },
          pays: 'hold',
          label: first(x.actor) + ' passes it out to ' + first(w) + ' on the ' + SIDE_WORD[lane(w)],
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(fb, 'intelligence', 100) +
            '. From out wide, ' + first(w) + ' can cross it or cut it back.'
        };
      }
    },
    {
      id: 'Z_CUTBACK', family: 'move', side: 'you', zones: [2],
      when: function (x) {
        x._arr = bestOf(inLine(x.squad, 1).concat(inLine(x.squad, 2)), 'finishing', x.legs, x.actor);
        return lane(x.actor) !== 1 && !!x._arr;
      },
      build: function (x) {
        var m = x._arr;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', bonus: 2, because: 'a pass back along the ground is hard to stop', to: m,
          grants: { good: [{ id: 'unmarked', man: m }] },
          does: {
            good: 'cuts it back past {foil} to ' + first(m),
            mixed: 'cuts it back, but {foil} gets a foot in',
            bad: 'cuts it back straight to {foil}'
          },
          pays: 'probe',
          label: first(x.actor) + ' cuts it back to ' + first(m) + ', who is arriving in the box',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) +
            '. If it gets through, ' + tag(m, 'finishing', x.legs) + ' has it in their box.'
        };
      }
    },
    {
      id: 'Z_TAKE_ON', family: 'press', side: 'you', zones: [2],
      when: function (x) { return !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'high', to: x.actor,
          /* beat a centre-back and he is through on goal; beat a full-back
           * and the pull-back opens (the generic "out of position") */
          grants: { good: lane(x.foil) === 1 ? [{ id: 'through', man: x.actor }] : [] },
          does: {
            good: 'goes past {foil} into the box',
            mixed: 'gets half a metre on {foil}',
            bad: 'loses it to {foil}'
          },
          pays: 'advance',
          label: first(x.actor) + ' runs at ' + first(x.foil) + ' to get into the box',
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.foil, 'defending', 100) +
            '. If ' + first(x.actor) + ' beats ' + first(x.foil) + ', your team has the ball in their box.'
        };
      }
    },
    {
      id: 'Z_OVERLAP', family: 'move', side: 'you', zones: [1, 2],
      when: function (x) {
        var l = lane(x.actor);
        /* g2: the overlap scene says your full-back has already run past
         * your winger, so he is the man this option is about, whatever his
         * pace and wherever the ball is (round 3 review: 61 of 69 overlap
         * scenes offered no option with him) */
        if (x.sit && x.sit.id === 'overlap' && GUARD.overlapScene) {
          /* (when the man on the ball is the full-back himself, his run is
           * the carry already on the menu) */
          if (x.actor && x.actor.line === 0) return false;
          x._fb = overlapBack(x);
          return !!x._fb;
        }
        if (l === 1) return false;
        var fb = inLine(x.squad, 0).filter(function (p) { return lane(p) === l && A.eff(p, 'pace', x.legs) >= 13; })[0];
        x._fb = fb;
        return !!fb;
      },
      build: function (x) {
        var fb = x._fb, m = markerOf(x.opp, fb, x.zone === 1 ? 1 : 0);
        if (x.sit && x.sit.id === 'overlap' && GUARD.overlapScene) {
          /* g2: the scene says nobody went with him, so the question is the
           * pass, not a race: the man on the ball against the defender who
           * could cut it out */
          return {
            test: { mine: x.actor, mineAttr: 'passing', theirs: m, theirsAttr: 'intelligence' },
            risk: 'even', bonus: 4, because: 'nobody has gone with ' + first(fb) + ', so the pass only has to get past ' + first(m),
            to: fb, grants: { good: [{ id: 'space', lane: lane(fb) }] },
            does: {
              good: 'plays it past {foil} to ' + first(fb) + ', who is running free,',
              mixed: 'plays it out to ' + first(fb) + ', a step ahead of {foil},',
              bad: 'plays it straight to {foil}'
            },
            pays: 'advance',
            label: first(x.actor) + ' passes it out to ' + first(fb) + ', who is running free round the outside of ' + first(m),
            read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(m, 'intelligence', 100) + ', the nearest defender to ' + first(fb) +
              '. If ' + first(fb) + ' loses it, he is out of position when they attack.'
          };
        }
        return {
          test: { mine: fb, mineAttr: 'pace', theirs: m, theirsAttr: 'pace' },
          risk: 'even', to: fb, grants: { good: [{ id: 'space', lane: lane(fb) }] },
          does: {
            good: 'runs outside {foil} to take the pass from ' + first(x.actor),
            mixed: 'takes the pass a step ahead of {foil}',
            bad: 'is caught by {foil}, who takes the ball'
          },
          pays: 'advance',
          label: 'Send ' + first(fb) + ' running outside ' + first(m),
          read: tag(fb, 'pace', x.legs) + ' against ' + tag(m, 'pace', 100) +
            '. Your full-back overlaps. If he loses it, he is out of position when they attack.'
        };
      }
    },
    {
      /* give it to the best man for the job: costs a decision, gains a
       * better player on the ball */
      id: 'Z_LAYOFF', family: 'hold', side: 'you', zones: [1, 2],
      when: function (x) {
        var line = x.zone === 1 ? [1, 2] : [2, 1];
        var c = x.squad.players.filter(function (p) { return p !== x.actor && p !== x.prev && line.indexOf(p.line) >= 0; });
        var id = x.zone === 1 ? 'passing' : 'technique';
        var b = best(c, id, x.legs);
        x._lay = b; x._layAttr = id;
        return b && A.eff(b, id, x.legs) - A.eff(x.actor, id, x.legs) >= 2;
      },
      build: function (x) {
        var b = x._lay;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', because: 'it is a short pass to a teammate nearby', to: b,
          does: {
            good: 'gives it to ' + first(b),
            mixed: 'gives it to ' + first(b) + ', a little behind him',
            bad: 'plays it straight to {foil}'
          },
          pays: 'hold',
          label: first(x.actor) + ' gives it to ' + first(b),
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + ', who has to get across to stop it. ' +
            tag(b, x._layAttr, x.legs) + ' is better at this than ' + tag(x.actor, x._layAttr, x.legs) +
            '. The ball stays ' + ZONE_AT[x.zone] + ', and ' + first(b) + ' has it for the next decision.'
        };
      }
    },
    {
      id: 'Z_RECYCLE', family: 'hold', side: 'you', zones: [1, 2, 3],
      when: function (x) {
        var back = x.zone === 1 ? [0] : [1];
        x._back = near(x, back, 'passing');
        return !!x._back;
      },
      build: function (x) {
        var d = x._back;
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', because: 'a pass backwards is easier than a pass forward', to: d,
          /* g1 (from p2): no carried edge for passing back. A near-certain pass
           * that also bought +2 for the next one was a free bonus (the a3
           * review: "no free +2 for passing back") */
          grants: null,
          does: {
            good: 'passes it back to ' + first(d),
            mixed: 'passes it back to ' + first(d) + ', a little too hard',
            bad: 'plays it straight to {foil}'
          },
          pays: 'back',
          label: first(x.actor) + ' passes it back to ' + first(d) + ' ' + ZONE_AT[x.zone - 1],
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) +
            '. You keep the ball, but further from their goal.'
        };
      }
    },
    {
      id: 'Z_SHOOT', family: 'press', side: 'you', zones: [3],
      when: function (x) {
        x._reb = bestOf(inLine(x.squad, 2).concat(inLine(x.squad, 1)), 'finishing', x.legs, x.actor);
        /* e1: your Poacher is the man first to the ball their keeper pushes out */
        var po = KWL ? bestOf(KWL.holders(x.squad, 'POACHER'), 'finishing', x.legs, x.actor) : null;
        if (po) { x._reb = po; x._rebPo = po; } else x._rebPo = null;
        return !!x.keeper;
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          grants: x._rebPo ? { mixed: [{ id: 'loose', man: x._rebPo }] } : null,
          risk: 'even', bonus: CLOSE_HARD, because: 'he is inside the box, close to goal',
          does: {
            good: 'shoots past {foil}',
            mixed: 'shoots at {foil}',
            bad: 'shoots straight at {foil}'
          },
          /* a5: a rebound, once an attack, and not on its last decision */
          pays: x.state && (x.state.finishOnly || x.state.rebounded) || !x._reb ? 'shot' : 'shotreb',
          mate: x._reb, to: x._reb,
          label: first(x.actor) + ' shoots as hard as he can',
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + ' in their goal.'
        };
      }
    },
    {
      /* the careful finish: less likely to beat the keeper, but a miss goes
       * wide for a goal kick instead of into his hands */
      id: 'Z_PLACE', family: 'hold', side: 'you', zones: [3],
      when: function (x) { return !!x.keeper; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'low', bonus: CLOSE_PLACED, because: 'he is inside the box, close to goal',
          does: {
            good: 'places it past {foil}',
            mixed: 'places it, and it is too close to {foil}',
            bad: 'places it just wide'
          },
          pays: 'placed',
          label: first(x.actor) + ' places it carefully at the corner',
          /* call: the "better chance" clause is added after the odds are
           * known, only when the hard shot on the menu scores more often
           * (round 4: the two were equal on 46 menus); and a miss is saved
           * or goes wide, never only "a goal kick" */
          placedLine: 'Less power than a full shot, so ' + first(x.keeper) + ' has a better chance. ',
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) +
            ' in their goal. ' + (GUARD.placedHonest ? '' : 'Less power than a full shot, so ' + first(x.keeper) + ' has a better chance. ') +
            'If ' + first(x.keeper) + ' saves it or it goes wide, their team does not get the ball from it.'
        };
      }
    },
    {
      /* ONLY after beating their full-back (a2): he is behind the play, so
       * the ball back from the byline to the penalty spot is open */
      id: 'Z_PULLBACK', family: 'move', side: 'you', zones: [3],
      when: function (x) {
        var b = (x.carried || []).filter(function (c) {
          return c.id === 'beaten' && c.man && c.man.line === 0 && lane(c.man) !== 1;
        })[0];
        x._fbBeaten = b;
        x._pull = b ? bestOf(inLine(x.squad, 1).concat(inLine(x.squad, 2)), 'finishing', x.legs, x.actor) : null;
        return !!b && !!x._pull;
      },
      build: function (x) {
        var m = x._pull, d = markerOf(x.opp, m, 0), fb = x._fbBeaten.man;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', mate: m,
          usesCarry: carryText(x._fbBeaten),
          does: {
            good: 'pulls it back from the byline past {foil}',
            mixed: 'just gets it past {foil}',
            bad: 'pulls it back straight to {foil}'
          },
          pays: 'pullback',
          label: first(x.actor) + ' pulls it back from the byline for ' + first(m),
          read: 'Only there because ' + first(fb) + ' is beaten, so nobody is between ' + first(x.actor) +
            ' and the penalty spot. ' + tag(x.actor, 'passing', x.legs) + ' against ' +
            tag(d, 'intelligence', 100) + ', who is marking ' + first(m) + '. If the pass gets past ' + first(d) +
            ' at all, ' + first(m) + ' scores.'
        };
      }
    },
    {
      /* only a player with real touch tries this (Technique 15 or more) */
      id: 'Z_CHIP', family: 'press', side: 'you', zones: [3],
      when: function (x) { return !!x.keeper && A.eff(x.actor, 'technique', x.legs) >= 15; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.keeper, theirsAttr: 'intelligence' },
          risk: 'high',
          does: {
            good: 'lifts it over {foil} as ' + first(x.keeper) + ' comes out',
            mixed: 'lifts it towards goal, and {foil} gets back to it',
            bad: 'tries to lift it over {foil}, who does not move'
          },
          pays: 'shot',
          label: first(x.actor) + ' tries to lift it over the keeper',
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(x.keeper, 'intelligence', 100) +
            '. It depends on whether ' + first(x.keeper) + ' comes out, not on how hard it is hit.'
        };
      }
    },
    {
      id: 'Z_SQUARE', family: 'move', side: 'you', zones: [3],
      when: function (x) {
        x._mate = bestOf(inLine(x.squad, 2).concat(inLine(x.squad, 1)), 'finishing', x.legs, x.actor);
        return !!x._mate;
      },
      build: function (x) {
        var m = x._mate, d = markerOf(x.opp, m, 0);
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', mate: m,
          does: {
            good: 'passes it across the goal past {foil}',
            mixed: 'passes it across the goal',
            bad: 'passes it across the goal, straight to {foil}'
          },
          pays: 'square',
          label: first(x.actor) + ' passes it across the goal for ' + first(m),
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(d, 'intelligence', 100) +
            ', who is marking ' + first(m) + '. If the pass gets through, ' + first(m) + ' has an open goal.'
        };
      }
    },
    /* ========================================= THEIR ATTACK, ZONE BY ZONE (a4) */
    /* Their attack moves towards your goal: midfield, then the edge of your
     * box, then your box. Each zone has its own kinds of defending. `tzones`
     * says where an option exists (0 midfield, 1 the edge of your box).
     * x.actor is your man nearest to their man on the ball, x.foil. */
    {
      id: 'M_PRESS', family: 'press', side: 'them', tzones: [0],
      /* the man who goes for the ball is your best ball-winner in midfield,
       * not always the nearest man: who you have decides whether this works */
      when: function (x) { x._pr = best(inLine(x.squad, 1), 'defending', x.legs); return !!x._pr && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x._pr, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', grants: { good: [{ id: 'short' }] },
          does: {
            good: 'gets to {foil} and takes the ball off him',
            mixed: 'gets to {foil}, who cannot go forward',
            bad: 'gets to {foil} too late'
          },
          pays: 'twin', winZone: 2,
          label: first(x._pr) + ' runs at ' + first(x.foil) + ' to win the ball',
          read: tag(x._pr, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) +
            '. Win it and your attack starts at the edge of their box, while their players are still coming back. Lose it and ' +
            first(x._pr) + ' is left behind.'
        };
      }
    },
    {
      id: 'M_CUT', family: 'move', side: 'them', tzones: [0],
      when: function (x) {
        x._rcv = best(inLine(x.opp, 2).filter(function (p) { return p !== x.foil; }), 'pace', 100);
        return !!x.actor && !!x.foil && !!x._rcv;
      },
      build: function (x) {
        var r = x._rcv;
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'passing' },
          risk: 'even', theirTo: r,
          does: {
            good: 'steps into the path of the pass to ' + first(r) + ' and takes it',
            mixed: 'stands in the path of the pass to ' + first(r),
            bad: 'moves across a second too late'
          },
          pays: 'tcut', winZone: 1, grants: { good: [{ id: 'caught' }] },
          fwd: 'passes it past ' + first(x.actor) + ' to ' + first(r) + ', at the edge of your box.',
          fwd2: first(r) + ' gets the ball at the edge of your box, with ' + first(x.actor) + ' right behind him.',
          theirGrant: { amount: 2, why: 'the pass went past ' + first(x.actor),
            text: 'The pass went past ' + first(x.actor) + ': +2 to ' + first(r) + ' in the next duel' },
          label: first(x.actor) + ' blocks the pass from ' + first(x.foil) + ' to ' + first(r),
          read: tag(x.actor, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'passing', 100) + '. ' +
            first(x.actor) + ' does not go near ' + first(x.foil) + ': ' + first(x.actor) + ' stands where the pass to ' +
            tag(r, 'pace', 100) + ' has to go.'
        };
      }
    },
    {
      id: 'M_DROP', family: 'hold', side: 'them', tzones: [0],
      when: function (x) { return !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', bonus: 2, because: 'nobody has to win a tackle',
          grants: { good: [{ id: 'set', man: x.foil }] },
          does: {
            good: 'and your midfield get back in front of your defence',
            mixed: 'and your midfield get back in front of your defence',
            bad: 'and your midfield are too slow getting back'
          },
          pays: 'tend',
          fwd: 'runs at your defence with nobody in front of him, at the edge of your box.',
          theirGrant: { amount: 2, why: 'nobody got in front of ' + first(x.foil),
            text: 'Nobody got in front of ' + first(x.foil) + ': +2 to ' + first(x.foil) + ' in the next duel' },
          label: first(x.actor) + ' and your midfield drop back in front of your defence',
          read: tag(x.actor, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) +
            '. You will not win the ball, and ' + first(x.foil) + ' will reach the edge of your box. In return ' + first(x.foil) + ' almost never gets past anyone on the way.'
        };
      }
    },
    {
      id: 'M_FOUL', family: 'stop', side: 'them', tzones: [0],
      /* a foul to stop the break: only when your man is losing the duel or
       * they are running at you after you lost the ball, and never by a man
       * who is already booked */
      when: function (x) {
        if (!x.actor || !x.foil || x.state.minute <= 20) return false;
        if (x.state.booked && x.state.booked[x.actor.id]) return false;
        if (destroyerFree(x)) return false;
        var gap = value(x.actor, 'defending', x.legs) - value(x.foil, 'technique', 100);
        return gap <= 1 || !!(x.theirCarried && x.theirCarried.length);
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', bonus: 0,
          does: {
            good: 'pulls {foil} down',
            mixed: 'catches {foil} late',
            bad: 'dives in and misses'
          },
          pays: 'tcard',
          label: first(x.actor) + ' fouls ' + first(x.foil) + ' to stop the attack',
          read: tag(x.actor, 'physical', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. Stops the attack in midfield, far from your goal. ' +
            first(x.actor) + ' is booked, and a booked man cannot do this again.'
        };
      }
    },
    {
      id: 'E_TACKLE', family: 'press', side: 'them', tzones: [1], ground: true,
      when: function (x) { return !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', grants: { good: [{ id: 'caught' }] },
          does: { good: 'times the tackle on {foil}', mixed: 'gets in front of {foil}', bad: 'mistimes the tackle' },
          pays: 'twin', winZone: 1,
          label: first(x.actor) + ' goes to tackle ' + first(x.foil),
          read: tag(x.actor, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) +
            '. If ' + first(x.actor) + ' misses, ' + first(x.foil) + ' is in your box.'
        };
      }
    },
    {
      id: 'E_WIDE', family: 'hold', side: 'them', tzones: [1], ground: true,
      when: function (x) { return !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'low', bonus: 1, because: 'he only has to stay on the inside of ' + first(x.foil),
          does: {
            good: 'pushes {foil} out to the touchline',
            mixed: 'pushes {foil} out wide',
            bad: 'tries to push {foil} out wide'
          },
          pays: 'twide', via: 'cross',
          fwd: 'cuts inside past ' + first(x.actor) + ', into your box.',
          label: first(x.actor) + ' makes ' + first(x.foil) + ' go out wide',
          read: tag(x.actor, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'technique', 100) +
            '. ' + first(x.actor) + ' does not dive in. You will not win the ball, and most of the time the worst that happens is a cross into your box.'
        };
      }
    },
    {
      id: 'E_OFFSIDE', family: 'press', side: 'them', tzones: [1], ground: true,
      when: function (x) {
        var line0 = inLine(x.squad, 0);
        if (!line0.length || !x.foil) return false;
        var avg = line0.reduce(function (a, p) { return a + A.eff(p, 'intelligence', x.legs); }, 0) / line0.length;
        /* the defender who reads the game best calls it (the review of a3:
         * the keeper does not lead the defence out) */
        x._caller = best(line0, 'intelligence', x.legs);
        /* g1 (from p2): the trap is set for the man he would pass to, never
         * for the man on the ball, who cannot be offside (the review counted
         * 252 cards aimed at the man with the ball) */
        x._runner = GUARD.offRunner ? best(inLine(x.opp, 2).filter(function (p) { return p !== x.foil; }), 'pace', 100) : x.foil;
        return avg >= 13 && !!x._caller && !!x._runner && A.eff(x._caller, 'intelligence', x.legs) >= 14;
      },
      build: function (x) {
        var cl = x._caller, rn = x._runner, fr = first(rn);
        return {
          /* the duel is one of timing: your caller stepping up against the
           * man on the ball choosing when to pass */
          test: { mine: cl, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'high', winZone: 1, grants: { good: [{ id: 'caught' }] }, theirTo: rn,
          does: {
            good: 'calls them forward, and ' + fr + ' is offside when {foil} passes to him',
            mixed: 'calls them forward, and {foil} has nobody to pass to',
            bad: 'calls them forward, and one defender is late'
          },
          pays: 'ttrap', via: 'alone',
          fwd: 'passes to ' + fr + ', who stays onside and is through on his own, into your box.',
          theirGrant: { amount: 2, why: fr + ' is through on his own',
            text: fr + ' is through on his own, with only your keeper to beat: +2 to ' + fr },
          label: first(cl) + ' calls the defenders forward, to leave ' + fr + ' offside when ' + first(x.foil) + ' passes',
          /* g1: the back line's average was printed and never used (the
           * review of p3): only the numbers the roll uses are on the card */
          read: tag(cl, 'intelligence', x.legs) + ' calls it, against ' + tag(x.foil, 'intelligence', 100) + ', who has to time the pass to ' + fr +
            '. If one man is late stepping up, ' + fr + ' is through on his own, with only your keeper to beat.'
        };
      }
    },
    {
      id: 'E_DOUBLE', family: 'move', side: 'them', tzones: [1], ground: true,
      when: function (x) {
        if (!x.actor) return false;
        var l = lane(x.actor);
        x._mate = best(x.squad.players.filter(function (p) {
          return p !== x.actor && lane(p) === l && p.line <= 1;
        }), 'defending', x.legs);
        return !!x._mate && !!x.foil;
      },
      build: function (x) {
        var m = x._mate;
        var free = best(inLine(x.opp, 2).filter(function (p) { return p !== x.foil; }), 'finishing', 100) ||
          best(inLine(x.opp, 1).filter(function (p) { return p !== x.foil; }), 'finishing', 100) || x.foil;
        return {
          test: { mine: m, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: 2, because: 'there are two of them against one', winZone: 1, grants: { good: [{ id: 'caught' }] },
          does: {
            good: 'and ' + first(x.actor) + ' trap {foil} between them',
            mixed: 'and ' + first(x.actor) + ' stop {foil} going forward',
            bad: 'comes across too early'
          },
          pays: 'twin',
          theirTo: free,
          fwd: 'passes it to ' + first(free) + ', who is free in your box.',
          theirGrant: { amount: 2, why: 'two of your players went to ' + first(x.foil),
            text: 'Two of your players went to ' + first(x.foil) + ', so ' + first(free) + ' is free: +2 to ' + first(free) }, 
          label: 'Send ' + first(m) + ' across to help ' + first(x.actor) + ' against ' + first(x.foil),
          read: tag(m, 'defending', x.legs) + ' comes across to help. Two against one, but if it goes wrong, ' +
            first(free) + ' is free in your box.'
        };
      }
    },
    {
      /* e1: A BALL IN THE AIR at the edge of your box (a ball over your
       * defence): nobody has it yet, so nobody can be tackled or shown wide.
       * The defender the scene names races their man to it, or drops behind
       * him and lets it come down (or heads it: HEAD_CLEAR). */
      id: 'E_RACE', family: 'press', side: 'them', tzones: [1], air: true,
      when: function (x) { return !!(x.play && x.play.air) && !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even', winZone: 1, grants: { good: [{ id: 'caught' }] }, via: 'alone',
          fwd: 'gets to the ball first and is through on your goal.',
          does: { good: 'gets to the ball before {foil} and brings it down', mixed: 'gets there at the same time as {foil}', bad: 'is a step behind {foil}' },
          pays: 'twin',
          label: first(x.actor) + ' races ' + first(x.foil) + ' to the ball',
          read: tag(x.actor, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. Whoever gets there first has it. If ' + first(x.foil) +
            ' does, ' + first(x.foil) + ' is through on your goal.'
        };
      }
    },
    {
      id: 'E_COVER', family: 'hold', side: 'them', tzones: [1], air: true,
      when: function (x) { return !!(x.play && x.play.air) && !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', bonus: 2, because: first(x.actor) + ' only has to stay between ' + first(x.foil) + ' and your goal',
          does: { good: 'drops behind {foil} and lets the ball come down', mixed: 'drops behind {foil}, who takes it wide', bad: 'drops too deep' },
          pays: 'twide', via: 'cross', vias: { bad: 'alone' },
          fwd: 'controls it and is through on your goal.',
          label: first(x.actor) + ' drops behind ' + first(x.foil) + ' and lets the ball come down',
          read: tag(x.actor, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(x.actor) +
            ' does not go for the ball. Most of the time the worst that happens is ' + first(x.foil) + ' taking it wide and crossing it.'
        };
      }
    },
    {
      /* a4: stand in front of him at the edge of your box: he can shoot, and
       * a block that only half works is a corner */
      id: 'E_BLOCK', family: 'hold', side: 'them', tzones: [1], ground: true,
      when: function (x) { return !!x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'finishing' },
          risk: 'even', winZone: 1, grants: { good: [{ id: 'caught' }] },
          does: {
            good: 'blocks the shot from {foil}',
            mixed: 'gets a foot to the shot from {foil}',
            bad: 'goes to block the shot, and {foil} goes round him'
          },
          pays: 'tblock', fwd: 'is in your box.',
          label: first(x.actor) + ' stands in front of ' + first(x.foil) + ' to block his shot',
          read: tag(x.actor, 'defending', x.legs) + ' against ' + tag(x.foil, 'finishing', 100) +
            '. A block that only half works is a corner to them. If ' + first(x.foil) + ' goes round ' +
            first(x.actor) + ', ' + first(x.foil) + ' is in your box.'
        };
      }
    },
    {
      /* a4: a foul at the edge of your box stops him, and gives them a free
       * kick close to your goal */
      id: 'E_FOUL', family: 'stop', side: 'them', tzones: [1],
      when: function (x) {
        if (!x.actor || !x.foil || x.state.minute <= 20) return false;
        if (destroyerFree(x)) return false;
        return !(x.state.booked && x.state.booked[x.actor.id]);
      },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', bonus: 2, because: 'stopping a man by fouling him is easy',
          grants: { good: [{ id: 'far' }] },
          does: { good: 'pulls {foil} down', mixed: 'pulls {foil} down', bad: 'dives in and misses' },
          pays: 'tfk',
          label: first(x.actor) + (x.play && x.play.air ? ' pulls ' + first(x.foil) + ' back before the ball comes down'
            : ' fouls ' + first(x.foil) + ' before ' + first(x.foil) + ' gets into your box'),
          read: tag(x.actor, 'physical', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(x.actor) +
            ' is booked, and they get a free kick near your box: ' + (theirKw(x, 'FREEKICK', 'technique')
              ? first(theirKw(x, 'FREEKICK', 'technique')) + ' will shoot from it.' : 'nobody of theirs shoots free kicks, so it will be crossed in.')
        };
      }
    },
    {
      /* a4: when every way of stopping him is out of reach, you can always
       * give him the ground: everyone drops back, and nobody can be beaten.
       * Offered only then (see lastResort in offer), so it never crowds out
       * a real duel. */
      id: 'T_RETREAT', family: 'hold', side: 'them', tzones: [0, 1], lastResort: true,
      when: function (x) { return !!x.foil; },
      build: function (x) {
        var mid = x.tzone === 0;
        return {
          test: {}, risk: 'low', bonus: 0, theirTo: x.foil,
          fixedText: (mid ? 'All your players drop back to the edge of your box. ' : 'All your players drop back into your box. ') + first(x.foil) +
            (mid ? ' has the ball at the edge of your box, with all your players behind it.' : ' crosses it into your box.'),
          pays: mid ? 'tretreat' : 'tretreat2', via: mid ? null : 'cross',
          label: mid ? 'Everyone drops back to the edge of your box' : 'Everyone drops back into your box',
          read: 'No duel, so nobody can be beaten. ' + first(x.foil) + (mid ? ' reaches the edge of your box.' : ' crosses it into your box, and it is a header.')
        };
      }
    },
    /* =============================================== YOUR BOX (a3) */
    {
      /* a4: set pieces. A corner: mark their best man in the air */
      id: 'BOX_MARK', family: 'hold', side: 'them', box: true,
      when: function (x) {
        x._mk = best(inLine(x.squad, 0).concat(inLine(x.squad, 1)), 'defending', x.legs);
        /* g1 (from p3): and on a cross from open play, where the header
         * was the only answer and a weak back line against a tall forward
         * had none (most of the certain-loss menus in your box) */
        return (x.via === 'corner' || x.via === 'fkcross' || x.via === 'cross') && !!x._mk && !!x.foil;
      },
      build: function (x) {
        var d = x._mk, set = x.via !== 'cross';
        return {
          test: { mine: d, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'physical' },
          /* on a cross from open play there is no time to take hold of him
           * first, so no +2 (it is only on a set piece) */
          risk: 'even', bonus: set ? 2 : 0, because: first(d) + ' can hold on to ' + first(x.foil) + ' before the ball arrives',
          does: { good: 'stays with {foil}, who cannot jump', mixed: 'stays with {foil}, who cannot head it cleanly', bad: 'loses {foil}' },
          /* e2: losing his man is a free header on your goal, not a goal */
          pays: aerialPays(x, x.foil, true) || 'boxstop', names: { keeper: first(x.squad.keeper) },
          label: first(d) + ' marks ' + first(x.foil) + (x.via === 'fkcross' ? ' for the free kick' : x.via === 'cross' ? ' for the cross' : ' for the corner'),
          read: tag(d, 'defending', x.legs) + ' against ' + tag(x.foil, 'physical', 100) + '. ' + first(x.foil) +
            (set ? ' is their best in the air.' : ' is waiting for the cross.') + ' Marking him does not win the ball, it stops him getting a clean header. If ' + first(d) +
            ' loses him, ' + first(x.foil) + ' heads it at your goal and ' + first(x.squad.keeper) + ' has to save it.'
        };
      }
    },
    {
      /* a free kick: a wall, the keeper, or a man running at the ball */
      id: 'BOX_WALL', family: 'hold', side: 'them', box: true,
      when: function (x) { return x.via === 'freekick' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'communication', theirs: x.foil, theirsAttr: 'technique', fresh: true },
          /* e2: from 25 metres a free kick rarely goes in. With +2 Messi's
           * went in 8 times in 9 (e1, the final as Spain) */
          risk: 'low', bonus: FK_WALL, because: 'from 25 metres the ball has to get round five men and dip under the bar',
          does: { good: 'lines up five players in the wall, and the free kick hits it', mixed: 'lines up five players in the wall, and the free kick clears the bar',
            bad: 'lines up five players in the wall, and {foil} bends it round them' },
          pays: 'boxstop',
          label: first(k) + ' puts five players in the wall',
          read: tag(k, 'communication', 100) + ' organises the wall, against ' + tag(x.foil, 'technique', 100) +
            '. A big wall, but ' + first(k) + ' cannot see the ball until late.'
        };
      }
    },
    {
      id: 'BOX_FK_SAVE', family: 'stop', side: 'them', box: true,
      when: function (x) { return x.via === 'freekick' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'reflexes', theirs: x.foil, theirsAttr: 'technique', fresh: true },
          risk: 'even', bonus: FK_KEEPER, because: 'from 25 metres ' + first(k) + ' sees the ball the whole way',
          does: { good: 'sees it all the way and catches it', mixed: 'sees it all the way and pushes it round the post', bad: 'sees it all the way, and cannot reach it' },
          pays: x.flipOk ? 'boxhold' : 'boxstop', to: x.outBall,
          label: first(k) + ' puts two in the wall and watches the ball himself',
          read: tag(k, 'reflexes', 100) + ' against ' + tag(x.foil, 'technique', 100) + '. ' + first(k) + ' sees the ball the whole way.' +
            (x.flipOk ? ' If ' + first(k) + ' catches it, your attack starts in midfield.' : '')
        };
      }
    },
    {
      id: 'BOX_CHARGE', family: 'press', side: 'them', box: true,
      when: function (x) {
        x._ch = best(inLine(x.squad, 2).concat(inLine(x.squad, 1)), 'pace', x.legs);
        return x.via === 'freekick' && !!x._ch && !!x.foil;
      },
      build: function (x) {
        var c = x._ch;
        return {
          test: { mine: c, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'high', to: c, bonus: FK_CHARGE, because: first(c) + ' only has to get in the way of the kick',
          does: { good: 'gets to the ball as it is kicked and blocks it', mixed: 'gets to the ball as it is kicked, and it goes out of play', bad: 'is too slow, and {foil} bends it over him' },
          pays: x.flipOk ? 'boxhold' : 'boxstop',
          label: first(c) + ' runs at the ball as ' + first(x.foil) + ' takes it',
          read: tag(c, 'pace', x.legs) + ' against ' + tag(x.foil, 'technique', 100) + '. A small wall, and ' + first(c) +
            ' charges the kick.' + (x.flipOk ? ' If ' + first(c) + ' blocks it, your attack starts in midfield.' : '')
        };
      }
    },
    {
      /* a4: the defender nearest the ball gets there first and kicks it
       * anywhere, before their man can shoot */
      id: 'BOX_CLEAR', family: 'hold', side: 'them', box: true,
      when: function (x) {
        x._clr = x.blocker;
        x._next = best(inLine(x.opp, 1).concat(inLine(x.opp, 2)).filter(function (p) { return p !== x.foil; }), 'finishing', 100) || x.foil;
        return (x.via === 'box' || x.via === 'open') && !!x.blocker && !!x.foil;
      },
      build: function (x) {
        var b = x._clr;
        return {
          test: { mine: b, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even',
          does: { good: 'gets to the ball first and kicks it into the stand', mixed: 'gets to the ball first, but only kicks it a few metres', bad: 'gets there too late' },
          pays: x.state && x.state.bounced ? 'boxstop' : 'boxclear', theirTo: x._next,
          fwd2: 'The ball drops at the edge of your box, and ' + first(x._next) + ' has it.',
          label: first(b) + ' kicks it clear before ' + first(x.foil) + ' can shoot',
          read: tag(b, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. A race to the ball. Whoever gets there first decides it.'
        };
      }
    },
    /* Their man got into your box: the last decision of their attack. */
    {
      id: 'BOX_SAVE', family: 'stop', side: 'them', box: true,
      when: function (x) {
        /* e1: a ball your keeper pushes out drops to their Poacher; with no
         * Poacher of theirs, it goes out for a corner */
        x._follow = theirKw(x, 'POACHER', 'finishing');
        return !!x.squad.keeper && !!x.foil && x.via !== 'freekick' && x.via !== 'open' && x.via !== 'header' &&
          /* g1: through on his own, coming a few steps out (BOX_NARROW) is the keeper's careful answer */
          x.via !== 'alone';
      },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'reflexes', theirs: x.foil, theirsAttr: 'finishing', fresh: true },
          risk: 'even', bonus: x.via === 'box' ? BOX_SAVE_BONUS : 0, because: first(x.foil) + ' has to shoot before your defenders get back',
          does: { good: 'saves it', mixed: 'pushes the shot out', bad: 'cannot reach the shot' },
          /* a5: a save that only pushes it out is a rebound, once */
          pays: x.state && x.state.bounced ? (x.flipOk ? 'boxhold' : 'boxstop')
            : x._follow ? (x.flipOk ? 'boxsavehold' : 'boxsave') : (x.flipOk ? 'boxsavechold' : 'boxsavec'),
          to: x.outBall, theirTo: x._follow || null,
          fwd2: x._follow ? first(x._follow) + ' gets to the ball first, in your box.' : '',
          poacherNote: x._follow && !(x.state && x.state.bounced) ? KWL.because(x._follow, 'POACHER') + ', a ball your keeper pushes out drops to ' + first(x._follow) + '.' : null,
          poacherId: x._follow ? kwName(x._follow, 'POACHER') : null,
          label: first(k) + (x.via === 'cross' || x.via === 'corner' || x.via === 'fkcross' ? ' stays on his line for the header' : ' stays on his line and faces the shot'),
          read: tag(k, 'reflexes', 100) + ' against ' + tag(x.foil, 'finishing', 100) + '. Your keeper waits for ' +
            (x.via === 'cross' || x.via === 'corner' || x.via === 'fkcross' ? 'the header from ' + first(x.foil) + '.' : first(x.foil) + ' to shoot.') + (x.flipOk ? ' If ' + first(k) + ' holds it, your attack starts in midfield.' : '')
        };
      }
    },
    {
      id: 'BOX_BLOCK', family: 'stop', side: 'them', box: true,
      when: function (x) { return (x.via === 'box' || x.via === 'open') && !!x.blocker && !!x.foil; },
      build: function (x) {
        var b = x.blocker;
        return {
          test: { mine: b, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: 1, because: first(b) + ' is right next to ' + first(x.foil),
          does: { good: 'blocks the shot and clears it', mixed: 'gets a touch on the shot', bad: 'is too late to block it' },
          pays: x.state && x.state.bounced ? 'boxstop' : 'boxblock',
          label: first(b) + ' throws himself in front of the shot',
          read: tag(b, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) +
            (x.via === 'open' ? '. Your keeper is out of his goal, so if ' + first(b) + ' is late, the goal is empty.'
              : '. If ' + first(b) + ' is late, nothing is between the shot and your goal but ' + first(x.squad.keeper) + '.') +
            (x.state && x.state.bounced ? ' A touch that does not stop it sends it wide.' : ' A touch that does not stop it is a corner.')
        };
      }
    },
    {
      id: 'BOX_RUSH', family: 'stop', side: 'them', box: true,
      when: function (x) { return (x.via === 'box' || x.via === 'alone') && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'technique', fresh: true },
          risk: 'high', to: x.outBall,
          does: { good: 'comes out and takes the ball from {foil}', mixed: 'comes out and makes {foil} go wide', bad: 'comes out too late' },
          pays: x.flipOk ? 'boxrushhold' : 'boxrush',
          label: first(k) + ' runs out at ' + first(x.foil),
          read: tag(k, 'intelligence', 100) + ' against ' + tag(x.foil, 'technique', 100) +
            '. Your keeper leaves his line. If ' + first(x.foil) + ' gets round him, the goal is empty.'
        };
      }
    },
    {
      id: 'BOX_HEADER', family: 'stop', side: 'them', box: true, air: true,
      /* a header needs a ball in the air: a cross, a corner, a free kick
       * crossed in (never a low cross or a shot) */
      when: function (x) { x._hd = best(inLine(x.squad, 0), 'reach', x.legs); return (x.via === 'cross' || x.via === 'corner' || x.via === 'fkcross' || !GUARD.air) && !!x._hd && !!x.foil; },
      build: function (x) {
        var d = x._hd;
        return {
          test: { mine: d, mineAttr: 'reach', theirs: x.foil, theirsAttr: 'reach' },
          risk: 'even',
          does: { good: 'heads the cross away', mixed: 'gets his head to the cross first', bad: 'is beaten in the air by {foil}' },
          /* a5: a header that only just gets there goes out for a corner,
           * once; e2: one that is lost is their header on your goal */
          pays: aerialPays(x, x.foil, x.state && x.state.bounced) || (x.state && x.state.bounced ? 'boxstop' : 'boxheader'), names: { keeper: first(x.squad.keeper) },
          label: first(d) + ' attacks the cross',
          read: 'In the air ' + first(d) + ' is ' + value(d, 'reach', x.legs) + ' against ' + first(x.foil) + ' on ' +
            value(x.foil, 'reach', 100) + '.' + (GUARD.aerial ? ' If ' + first(x.foil) + ' wins it, ' + first(x.foil) + ' heads it at your goal and ' +
            first(x.squad.keeper) + ' has to save it.' : '')
        };
      }
    },
    {
      id: 'BOX_CLAIM', family: 'stop', side: 'them', box: true, air: true,
      /* e1: a Cross catcher has his own, better way to take it (KW_CLAIM) */
      when: function (x) { return (x.via === 'cross' || x.via === 'corner' || x.via === 'fkcross') && !!x.squad.keeper && !!x.foil && !kwOn(x.squad.keeper, 'CATCHER'); },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'physique', theirs: x.foil, theirsAttr: 'physical', fresh: true },
          risk: 'high', to: x.outBall,
          does: { good: 'comes for the cross and catches it', mixed: 'punches the cross away', bad: 'comes for the cross and misses it' },
          pays: x.flipOk ? 'boxhold' : 'boxstop',
          label: first(k) + ' comes off his line for the cross',
          read: tag(k, 'physique', 100) + ' against ' + tag(x.foil, 'physical', 100) + '. If ' + first(k) +
            ' misses it, ' + first(x.foil) + ' has an empty goal.'
        };
      }
    }
    ,
    /* g1 (from p3): THROUGH ON HIS OWN after a failed offside trap. p2 offered only
     * the keeper waiting on his line or running out, and a finisher with
     * +2 for being alone beat both before the dice (most of p2's
     * certain-loss options). Two real answers, the ones a defence has:
     * the keeper comes a few steps out so there is less goal to aim at, or
     * the fastest defender chases back. Who is through decides which works:
     * a slow man is caught, a great finisher is not. */
    {
      id: 'BOX_NARROW', family: 'hold', side: 'them', box: true,
      when: function (x) { return x.via === 'alone' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'finishing', fresh: true },
          /* g1: the careful answer (he does not dive in), so it is the
           * low-risk option the menu always keeps */
          risk: 'low', bonus: NARROW_BY, because: first(k) + ' coming a few steps out leaves ' + first(x.foil) + ' less of the goal to aim at',
          does: { good: 'comes a few steps out and saves the shot from {foil}', mixed: 'comes a few steps out, and {foil} has to aim for the corner',
            bad: 'is not far enough out to cover the corner' },
          pays: 'boxstop',
          label: first(k) + ' comes a few steps out to make the goal smaller',
          read: tag(k, 'intelligence', 100) + ' against ' + tag(x.foil, 'finishing', 100) + '. ' + first(k) +
            ' does not dive in, so ' + first(x.foil) + ' cannot go round him. ' + first(x.foil) + ' has to shoot, at a smaller goal.'
        };
      }
    },
    {
      id: 'BOX_COVER', family: 'press', side: 'them', box: true,
      when: function (x) {
        x._cv = best(inLine(x.squad, 0), 'pace', x.legs);
        return x.via === 'alone' && !!x._cv && !!x.foil;
      },
      build: function (x) {
        var d = x._cv;
        return {
          test: { mine: d, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'high',
          does: { good: 'gets back and takes the ball off {foil}', mixed: 'gets back in time to make {foil} shoot early',
            bad: 'cannot get back to {foil}' },
          pays: 'boxstop',
          label: first(d) + ' chases back after ' + first(x.foil),
          read: tag(d, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(d) +
            ' is your fastest defender. If ' + first(d) + ' catches up, ' + first(x.foil) + ' has to shoot early.'
        };
      }
    }
    ,
    /* ======================================== KEYWORDS IN THE ZONES (e1) */
    /* d2's keywords (keywords.js), brought onto a5's strip. Each option below
     * exists only because a player with that keyword stands where it works,
     * says so on the card ("Unlocked by Rodri (Playmaker)") and carries
     * option.unlock. They open zone moves nobody else has (a pass from your
     * half to the edge of their box), bigger edges (+3 after beating two),
     * and moments of their own: a free kick at the edge of their box and the
     * Poacher's first-time shot at a rebound. */
    {
      /* PLAYMAKER: from your half straight to the edge of their box */
      id: 'KW_Z_THROUGH_DEEP', family: 'press', side: 'you', zones: [0], kw: 'PLAYMAKER',
      when: function (x) {
        var h = pickHolder(x, 'PLAYMAKER', 'passing');
        if (!h) return false;
        x._pmh = h;
        x._pmr = bestOf(inLine(x.squad, 2), 'pace', x.legs, h);
        x._pmd = best(inLine(x.opp, 1), 'intelligence', 100);
        return !!x._pmr && !!x._pmd;
      },
      build: function (x) {
        var h = x._pmh, r = x._pmr, d = x._pmd;
        return {
          test: { mine: h, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'high', to: r, grants: { good: [{ id: 'running', man: r }] },
          does: {
            good: 'passes it past {foil} to ' + first(r),
            mixed: 'passes it past {foil}, too far ahead of ' + first(r),
            bad: 'passes it straight to {foil}'
          },
          pays: 'through', unlock: kwName(h, 'PLAYMAKER'),
          label: via(x, h, 'passes it past their midfield to ' + first(r) + ' at the edge of their box'),
          read: tag(h, 'passing', x.legs) + ' against ' + tag(d, 'intelligence', 100) +
            ', the best reader of a pass in their midfield. If it gets through, the ball skips midfield and ' +
            tag(r, 'pace', x.legs) + ' has it at the edge of their box, running at their goal (+2).'
        };
      }
    },
    {
      /* DRIBBLER: takes on two in midfield; past both is a bigger edge, past
       * one is a free kick at the edge of their box and a booking */
      id: 'KW_Z_DRIBBLE_TWO', family: 'press', side: 'you', zones: [1], kw: 'DRIBBLER',
      when: function (x) {
        var h = pickHolder(x, 'DRIBBLER', 'technique');
        if (!h) return false;
        var ds = facingLine(x.opp, h, 1);
        if (ds.length < 2) return false;
        x._drh = h; x._dr1 = ds[0]; x._dr2 = ds[1];
        return true;
      },
      build: function (x) {
        var h = x._drh, d1 = x._dr1, d2 = x._dr2;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: d1, theirsAttr: 'defending' },
          risk: 'high', to: h, grants: { good: [{ id: 'twoBeaten', man: h, a: d1, b: d2 }] },
          modes: { mixed: 'freekick' }, trip: d2, names: { trip: first(d2) },
          does: {
            good: 'goes past {foil}, then past ' + first(d2) + ',',
            mixed: 'goes past {foil}, and ' + first(d2) + ' trips ' + first(h),
            bad: 'loses the ball to {foil}'
          },
          pays: 'dribble2', unlock: kwName(h, 'DRIBBLER'),
          label: via(x, h, 'runs at ' + first(d1) + ' and ' + first(d2)),
          read: tag(h, 'technique', x.legs) + ' against ' + tag(d1, 'defending', 100) + ', with ' + first(d2) +
            ' next to ' + first(d1) + '. Past both and ' + first(h) + ' is at the edge of their box with +3 in his next duel. ' +
            'Past only ' + first(d1) + ' and ' + first(d2) + ' trips ' + first(h) + ': a free kick at the edge of their box, and ' +
            first(d2) + ' is booked.'
        };
      }
    },
    {
      /* DRIBBLER at the edge of their box: past both and he is through on
       * goal in their box; past one and he is tripped right there */
      id: 'KW_Z_DRIBBLE_BOX', family: 'press', side: 'you', zones: [2], kw: 'DRIBBLER',
      when: function (x) {
        var h = kwOn(x.actor, 'DRIBBLER') ? x.actor
          : pickHolder(x, 'DRIBBLER', 'technique', function (p) { return p.line === 2; });
        if (!h) return false;
        var ds = facingLine(x.opp, h, 0);
        if (ds.length < 2) return false;
        x._dbh = h; x._db1 = ds[0]; x._db2 = ds[1];
        return true;
      },
      build: function (x) {
        var h = x._dbh, d1 = x._db1, d2 = x._db2;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: d1, theirsAttr: 'defending' },
          risk: 'high', to: h, grants: { good: [{ id: 'through', man: h }] },
          modes: { mixed: 'freekick' }, trip: d2, names: { trip: first(d2) },
          does: {
            good: 'goes past {foil}, then past ' + first(d2) + ',',
            mixed: 'goes past {foil}, and ' + first(d2) + ' trips ' + first(h),
            bad: 'loses the ball to {foil}'
          },
          pays: 'dribble2e', unlock: kwName(h, 'DRIBBLER'),
          label: via(x, h, 'runs at ' + first(d1) + ' and ' + first(d2)),
          read: tag(h, 'technique', x.legs) + ' against ' + tag(d1, 'defending', 100) + ', with ' + first(d2) +
            ' next to ' + first(d1) + '. Past both and ' + first(h) + ' is through on goal in their box (+2 to his shot). ' +
            'Past only ' + first(d1) + ' and ' + first(d2) + ' trips ' + first(h) + ': a free kick right there, and ' + first(d2) + ' is booked.'
        };
      }
    },
    {
      /* TARGET MAN: at the edge of their box, wins the high ball and heads
       * it down to a teammate running into the box */
      id: 'KW_Z_HEAD_DOWN', family: 'move', side: 'you', zones: [2], kw: 'TARGET', high: true,
      when: function (x) {
        var h = pickHolder(x, 'TARGET', 'reach', function (p) { return p !== x.actor; });
        if (!h) return false;
        x._tmh = h;
        x._tmm = best(inLine(x.squad, 2).concat(inLine(x.squad, 1)).filter(function (p) { return p !== h && p !== x.actor; }), 'finishing', x.legs);
        x._tmd = markerOf(x.opp, h, 0);
        return !!x._tmm && !!x._tmd;
      },
      build: function (x) {
        var h = x._tmh, m = x._tmm, d = x._tmd;
        return {
          test: { mine: h, mineAttr: 'reach', theirs: d, theirsAttr: 'reach' },
          risk: 'even', to: m, tos: { mixed: m }, grants: { good: [{ id: 'unmarked', man: m }] },
          does: {
            good: 'wins the header above {foil}, heads it down to ' + first(m) + ',',
            mixed: 'gets his head to it first, and it drops to ' + first(m) + ' outside the box',
            bad: 'is beaten in the air by {foil}'
          },
          pays: 'probe', unlock: kwName(h, 'TARGET'),
          label: first(x.actor) + ' plays it high to ' + first(h) + ' to head down for ' + first(m),
          read: 'In the air ' + tag(h, 'reach', x.legs) + ' against ' + tag(d, 'reach', 100) + '. If ' + first(h) +
            ' wins it, ' + tag(m, 'finishing', x.legs) + ' has the ball in their box with nobody marking him (+2).'
        };
      }
    },
    {
      /* CROSSER: crosses from deeper, from midfield */
      id: 'KW_Z_EARLY_CROSS', family: 'press', side: 'you', zones: [1], kw: 'CROSSER', high: true,
      when: function (x) {
        var h = pickHolder(x, 'CROSSER', 'passing');
        if (!h) return false;
        x._ech = h;
        /* g1: never the man who just gave the ball to the crosser ("Rodri
         * gives it to Porro, who crosses it for Rodri to head") */
        x._ect = bestOf(inLine(x.squad, 2).concat(inLine(x.squad, 1)).filter(function (p) { return p !== x.actor; }), 'reach', x.legs, h);
        x._ecd = x._ect ? markerOf(x.opp, x._ect, 0) : null;
        return !!x._ect && !!x._ecd;
      },
      build: function (x) {
        var h = x._ech, t = x._ect, d = x._ecd;
        return {
          test: { mine: t, mineAttr: 'reach', theirs: d, theirsAttr: 'reach' },
          risk: 'even', bonus: -1, because: 'the cross comes from 35 metres, so their defenders see it coming',
          /* g1: the results name the man who crosses it, as the card does */
          does: {
            good: 'rises above {foil} to meet the cross from ' + first(h),
            mixed: 'gets his head to the cross from ' + first(h),
            bad: 'is beaten in the air by {foil} to the cross from ' + first(h)
          },
          pays: 'header', unlock: kwName(h, 'CROSSER'),
          label: via(x, h, 'crosses it early from midfield for ' + first(t) + ' to head'),
          read: first(h) + ' can cross it from this far out. In the air ' + tag(t, 'reach', x.legs) + ' against ' +
            tag(d, 'reach', 100) + '. ' + first(t) + ' scores only if he wins the header clearly, and a miss only gives them a goal kick.'
        };
      }
    },
    {
      /* CROSSER: the low ball across the six-yard box, from the edge */
      id: 'KW_Z_LOW_CROSS', family: 'press', side: 'you', zones: [2], kw: 'CROSSER',
      when: function (x) {
        var h = pickHolder(x, 'CROSSER', 'passing');
        if (!h || (h !== x.actor && lane(h) !== lane(x.actor))) return false;
        x._lch = h;
        x._lcm = best(inLine(x.squad, 2).filter(function (p) { return p !== h && p !== x.actor; }), 'finishing', x.legs) ||
          best(inLine(x.squad, 2).filter(function (p) { return p !== h; }), 'finishing', x.legs);
        x._lcd = markerOf(x.opp, h, 0);
        return !!x._lcm && !!x._lcd;
      },
      build: function (x) {
        var h = x._lch, m = x._lcm, d = x._lcd;
        return {
          test: { mine: h, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', bonus: LOWX_BY, because: first(h) + ' is a Crosser and practises this ball',
          mate: m, to: m, tos: { mixed: m }, grants: { mixed: [{ id: 'unmarked', man: m }] },
          does: {
            good: 'crosses it low past {foil} across the 5.5-metre box',
            mixed: 'crosses it low across the 5.5-metre box',
            bad: 'hits the cross against {foil}'
          },
          pays: x.state && x.state.finishOnly ? 'lowcross0' : 'lowcross', unlock: kwName(h, 'CROSSER'),
          /* a low cross is the answer to their Cross catcher */
          counter: kwOn(x.opp.keeper, 'CATCHER') ? kwName(x.opp.keeper, 'CATCHER') : null,
          label: via(x, h, 'crosses it low across the 5.5-metre box for ' + first(m)),
          read: tag(h, 'passing', x.legs) + ' against ' + tag(d, 'intelligence', 100) + '. If the cross gets past ' +
            first(d) + ' cleanly, ' + tag(m, 'finishing', x.legs) + ' scores from two metres; if it only just gets past, ' + first(m) +
            ' has the ball in their box, unmarked (+2).'
        };
      }
    },
    {
      /* LATE RUNNER: a midfielder arriving in the box after their defenders
       * have picked up your forwards */
      id: 'KW_Z_LATE_RUN', family: 'move', side: 'you', zones: [2], kw: 'LATE_RUN',
      when: function (x) {
        var h = pickHolder(x, 'LATE_RUN', 'finishing', function (p) { return p !== x.actor; });
        if (!h) return false;
        x._lrh = h; x._lrd = worst(inLine(x.opp, 1), 'intelligence', 100);
        return !!x._lrd;
      },
      build: function (x) {
        var h = x._lrh, d = x._lrd;
        return {
          test: { mine: h, mineAttr: 'intelligence', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', to: h, tos: { mixed: x.actor }, grants: { good: [{ id: 'unmarked', man: h }] },
          does: {
            good: 'times his run past {foil}, takes the pass from ' + first(x.actor) + ',',
            mixed: 'arrives with {foil} still next to him, so ' + first(x.actor) + ' does not pass',
            bad: 'is caught by {foil}'
          },
          pays: 'probe', unlock: kwName(h, 'LATE_RUN'),
          label: first(x.actor) + ' waits for ' + first(h) + ' to run into the box late from midfield',
          read: tag(h, 'intelligence', x.legs) + ' against ' + tag(d, 'intelligence', 100) +
            ', the midfielder who should follow ' + first(h) + '. Their defenders are marking your forwards, so if ' + first(h) +
            ' gets away from ' + first(d) + ', ' + first(h) + ' has the ball in their box, unmarked (+2 to his shot).'
        };
      }
    },
    {
      /* FREE-KICK TAKER: a shot straight from the wide free kick */
      id: 'KW_Z_FREE_KICK_WIDE', family: 'press', side: 'you', zones: [2], kw: 'FREEKICK',
      when: function (x) {
        if (x.sit.id !== 'dead_ball_wide' || !x.keeper) return false;
        x._fkw = pickHolder(x, 'FREEKICK', 'technique');
        return !!x._fkw;
      },
      build: function (x) {
        var h = x._fkw;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'high', bonus: -2, because: 'the angle from the side is tight',
          does: { good: 'curls it into the far corner', mixed: 'curls it on target', bad: 'curls it straight into the hands of {foil}' },
          pays: 'shot', unlock: kwName(h, 'FREEKICK'), shooter: true,
          label: (h !== x.actor ? first(x.actor) + ' leaves the free kick to ' + first(h) + ', who shoots straight at goal' : first(h) + ' shoots straight at goal from the free kick'),
          read: tag(h, 'technique', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + ' in their goal. Nobody else touches it.'
        };
      }
    },

    /* ---------------------- the free kick at the edge of their box (e1) */
    /* Reached only when their man trips your Dribbler (KW_Z_DRIBBLE_TWO and
     * KW_Z_DRIBBLE_BOX): the ball is still, on the ground, 20 metres out. */
    {
      id: 'FK_SHOT', family: 'press', side: 'you', zones: [2], modes: ['freekick'], kw: 'FREEKICK',
      /* g2: the man standing over the free kick takes it (round 3 review:
       * 22 cards had someone else shoot) */
      when: function (x) { x._fks = kwOn(x.actor, 'FREEKICK') ? x.actor : null; return !!x._fks && !!x.keeper; },
      build: function (x) {
        var h = x._fks;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: x.keeper, theirsAttr: 'reflexes' },
          /* g1: YOUR SET PIECES MATCH THEIRS. e2 sized their free kicks
           * against you (FK_KEEPER, FK_WALL: Messi 1 in 4) and noted yours
           * were left as they were; as the user, Messi's free kick and long
           * shot scored well above that. The same sizes now, both ways. */
          risk: 'even', bonus: -YOUR_FK, because: 'the wall covers part of the goal, and from 25 metres ' + first(x.keeper) + ' sees the ball the whole way',
          /* g2: and a Free-kick taker is better at it than anyone else */
          parts: [{ n: FK_KW_BY, why: first(h) + ' is a Free-kick taker and practises this' }],
          does: { good: 'curls it over the wall into the corner', mixed: 'curls it over the wall', bad: 'hits the wall' },
          pays: 'shot', table: R.CONSEQUENCE.you.fkshot, unlock: kwName(h, 'FREEKICK'), shooter: true,
          label: first(h) + ' curls it over the wall',
          read: tag(h, 'technique', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + ' in their goal.'
        };
      }
    },
    {
      id: 'FK_POWER', family: 'press', side: 'you', zones: [2], modes: ['freekick'],
      when: function (x) {
        /* g2: the man standing over it (match.js puts your Free-kick taker,
         * or else your best finisher, on the ball when the free kick is won) */
        x._fkp = x.actor;
        return !!x._fkp && !!x.keeper;
      },
      build: function (x) {
        var h = x._fkp;
        return {
          test: { mine: h, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'high', bonus: -YOUR_FK, because: 'the wall is in the way, and from 25 metres ' + first(x.keeper) + ' sees the ball the whole way',
          does: { good: 'hits it hard through a gap in the wall', mixed: 'hits it hard at goal', bad: 'hits the wall' },
          pays: 'shot', table: R.CONSEQUENCE.you.fkshot, shooter: true,
          label: first(h) + ' hits it as hard as he can',
          read: tag(h, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + ' in their goal.'
        };
      }
    },
    {
      id: 'FK_CROSS', family: 'move', side: 'you', zones: [2], modes: ['freekick'], high: true,
      when: function (x) {
        x._fkc = best(x.squad.players.filter(function (p) { return p !== x.actor; }), 'reach', x.legs);
        x._fkcd = x._fkc ? best(inLine(x.opp, 0), 'reach', 100) : null;
        return !!x._fkc && !!x._fkcd;
      },
      build: function (x) {
        var t = x._fkc, d = x._fkcd;
        return {
          test: { mine: t, mineAttr: 'reach', theirs: d, theirsAttr: 'reach' },
          risk: 'even',
          does: { good: 'rises above {foil} to meet it', mixed: 'gets his head to it', bad: 'is beaten in the air by {foil}' },
          pays: 'header', shooter: true,
          label: first(x.actor) + ' floats it into the box for ' + first(t) + ' to head',
          read: 'In the air ' + tag(t, 'reach', x.legs) + ' against ' + tag(d, 'reach', 100) + ', their best in the air.'
        };
      }
    },
    {
      id: 'FK_SHORT', family: 'hold', side: 'you', zones: [2], modes: ['freekick'],
      when: function (x) {
        x._fksh = near(x, [1], 'technique');
        x._fksd = x._fksh ? markerOf(x.opp, x._fksh, 1) : null;
        return !!x._fksh && !!x._fksd;
      },
      build: function (x) {
        var m = x._fksh;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x._fksd, theirsAttr: 'intelligence' },
          risk: 'low', because: 'a short free kick is an easy ball', to: m,
          does: {
            good: 'plays it short to ' + first(m),
            mixed: 'plays it short to ' + first(m) + ', a little behind him',
            bad: 'plays it straight to {foil}'
          },
          pays: 'hold',
          label: first(x.actor) + ' plays the free kick short to ' + first(m),
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x._fksd, 'intelligence', 100) +
            ', who is marking ' + first(m) + '. The ball stays at the edge of their box, and ' + first(m) + ' has it for the next decision.'
        };
      }
    },

    /* ------------------ the Poacher at a rebound in their box (e1) */
    /* On the decision after their keeper pushed a shot out: only a Poacher
     * shoots first time, before the keeper is up. */
    {
      id: 'REB_SHOOT', family: 'press', side: 'you', zones: [3], kw: 'POACHER',
      when: function (x) {
        if (!(x.state && x.state.rebounded) || !kwOn(x.actor, 'POACHER')) return false;
        x._rbd = markerOf(x.opp, x.actor, 0);
        return !!x._rbd;
      },
      build: function (x) {
        var d = x._rbd;
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: d, theirsAttr: 'defending' },
          risk: 'even',
          does: { good: 'hits it in before {foil} can block it', mixed: 'hits it at once, and {foil} blocks it',
            bad: 'hits it at once, straight at {foil}' },
          pays: 'rebshot', unlock: kwName(x.actor, 'POACHER'), shooter: true,
          label: first(x.actor) + ' shoots first time, before their keeper is up',
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(d, 'defending', 100) +
            ', who is sliding in to block it. Their keeper is still on the ground, so only ' + first(d) + ' is in the way.'
        };
      }
    },

    /* ============================================ PAIRS IN THE ZONES (e1) */
    {
      /* ONE-TWO, two decisions. First the pass to the partner and the run;
       * then, on the partner's own menu, the pass straight back. */
      id: 'PAIR_ONE_TWO', family: 'press', side: 'you', zones: [1], pair: 'ONE_TWO',
      when: function (x) {
        if (x.mode === 'onetwo' || (x.state && x.state.finishOnly)) return false;
        var pr = pickPair(x, 'ONE_TWO');
        if (!pr || x.actor === pr.b) return false;
        if (x.actor !== pr.a && !KWL.near(x.actor, pr.a)) return false;
        var d1 = markerOf(x.opp, pr.a, 1);
        x._p12 = pr; x._p12d1 = d1;
        return !!d1;
      },
      build: function (x) {
        var a = x._p12.a, b = x._p12.b, d1 = x._p12d1;
        var lead = x.actor !== a ? first(x.actor) + ' gives it to ' + first(a) + '. ' : '';
        return {
          test: { mine: a, mineAttr: 'passing', theirs: d1, theirsAttr: 'intelligence' },
          risk: 'even', bonus: OT_BY, because: first(a) + ' and ' + first(b) + ' have played this one-two together many times',
          to: b, mate: b, tos: { mixed: b },
          grants: { good: [{ id: 'onetwo', man: a, mate: b, foil: d1 }] }, modes: { good: 'onetwo' },
          does: {
            good: 'passes it to ' + first(b) + ' and runs past {foil}',
            mixed: 'passes it to ' + first(b) + ' and runs',
            bad: 'passes it straight to {foil}'
          },
          pays: 'onetwo1', unlock: prName(x._p12),
          label: lead + first(a) + ' passes to ' + first(b) + ' and runs past ' + first(d1) + ' for a one-two',
          read: tag(a, 'passing', x.legs) + ' against ' + tag(d1, 'intelligence', 100) + ', who is marking ' + first(a) +
            '. If ' + first(a) + ' gets past ' + first(d1) + ', ' + first(b) + ' has the ball a zone on and can play it straight back ' +
            'on the next decision (+2), another zone on: two zones for the two passes.'
        };
      }
    },
    {
      /* the second half of the one-two, on the partner's menu only */
      id: 'OT_RETURN', family: 'press', side: 'you', zones: [2], modes: ['onetwo'], pair: 'ONE_TWO',
      when: function (x) {
        var c = (x.carried || []).filter(function (e) { return e.id === 'onetwo'; })[0];
        if (!c || c.mate !== x.actor) return false;
        x._otc = c;
        x._otd = best(inLine(x.opp, 1).filter(function (q) { return q !== c.foil; }), 'intelligence', 100);
        return !!x._otd;
      },
      build: function (x) {
        var c = x._otc, a = c.man, d = x._otd;
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', to: a, tos: { mixed: a }, grants: { good: [{ id: 'running', man: a }] },
          does: {
            good: 'plays it first time past {foil} back to ' + first(a) + ',',
            mixed: 'plays it back to ' + first(a) + ', a step behind him,',
            bad: 'plays it straight to {foil}'
          },
          pays: 'onetwo', unlock: prName({ id: 'ONE_TWO', a: a, b: x.actor }),
          label: first(x.actor) + ' plays it straight back to ' + first(a),
          read: tag(x.actor, 'technique', x.legs) + ' against ' + tag(d, 'intelligence', 100) +
            ', who is trying to cut out the pass back. If it comes off, ' + first(a) + ' has the ball in their box, running at their goal (+2); ' +
            'a step behind him and ' + first(a) + ' has it where it is.'
        };
      }
    },
    {
      /* OVERLAP PARTNERS: the Crosser runs round the outside of the Dribbler */
      id: 'PAIR_OVERLAP', family: 'move', side: 'you', zones: [1, 2], pair: 'OVERLAP',
      when: function (x) {
        var pr = pickPair(x, 'OVERLAP');
        if (!pr) return false;
        x._pov = pr; x._povd = markerOf(x.opp, pr.a, 0);
        return !!x._povd;
      },
      build: function (x) {
        var a = x._pov.a, b = x._pov.b, fb = x._povd;
        var lead = x.actor !== b ? first(x.actor) + ' gives it to ' + first(b) + '. ' : '';
        return {
          test: { mine: a, mineAttr: 'pace', theirs: fb, theirsAttr: 'pace' },
          risk: 'even', to: a,
          grants: { good: [{ id: 'wide', man: a, fb: fb }, { id: 'beaten', man: fb }] },
          does: {
            good: 'runs round the outside of {foil}, takes the pass from ' + first(b) + ',',
            mixed: 'takes the pass from ' + first(b) + ' a step ahead of {foil}',
            bad: 'is caught by {foil}'
          },
          pays: 'advance', unlock: prName(x._pov),
          label: lead + first(b) + ' holds it while ' + first(a) + ' runs round the outside of ' + first(fb),
          read: tag(a, 'pace', x.legs) + ' against ' + tag(fb, 'pace', 100) + '. If ' + first(a) + ' gets clear, ' + first(a) +
            ' has the ball one zone on with +3 to his cross, cut-back or pull-back, and ' + first(fb) + ' is out of position.'
        };
      }
    },
    {
      /* STRIKE PARTNERS: the Target man flicks a long ball on to the Poacher */
      id: 'PAIR_FLICK', family: 'press', side: 'you', zones: [0, 1], pair: 'STRIKE_PAIR', high: true,
      when: function (x) {
        var pr = pickPair(x, 'STRIKE_PAIR');
        if (!pr || x.actor === pr.a || x.actor === pr.b) return false;
        x._pfl = pr; x._pfld = markerOf(x.opp, pr.a, 0);
        return !!x._pfld;
      },
      build: function (x) {
        var t = x._pfl.a, q = x._pfl.b, d = x._pfld;
        return {
          test: { mine: t, mineAttr: 'reach', theirs: d, theirsAttr: 'reach' },
          risk: 'even', to: q, grants: { good: [{ id: 'running', man: q }] },
          does: {
            good: 'flicks it on past {foil} to ' + first(q),
            mixed: 'flicks it on, too far ahead of ' + first(q),
            bad: 'is beaten in the air by {foil}'
          },
          pays: 'through', unlock: prName(x._pfl),
          label: first(x.actor) + ' kicks it long for ' + first(t) + ' to flick on to ' + first(q),
          read: 'In the air ' + tag(t, 'reach', x.legs) + ' against ' + tag(d, 'reach', 100) + '. ' + first(q) +
            ' starts running as the ball is kicked, so if ' + first(t) + ' wins it, ' + first(q) + ' has it two zones on.'
        };
      }
    },
    {
      /* PRACTISED ROUTINE: at a free kick, the far post, where the Target
       * man arrives unmarked */
      id: 'PAIR_ROUTINE', family: 'press', side: 'you', zones: [2], inModes: ['freekick'], pair: 'ROUTINE', high: true,
      when: function (x) {
        if (x.mode !== 'freekick' && x.sit.id !== 'dead_ball_wide') return false;
        var pr = pickPair(x, 'ROUTINE');
        x._prt = pr; x._prtd = best(inLine(x.opp, 0), 'reach', 100);
        return !!pr && !!x._prtd;
      },
      build: function (x) {
        var a = x._prt.a, b = x._prt.b;
        return {
          test: { mine: b, mineAttr: 'reach', theirs: x._prtd, theirsAttr: 'reach' },
          risk: 'even', bonus: 3, because: 'the routine puts ' + first(b) + ' at the far post, away from his marker',
          does: { good: 'meets it at the far post', mixed: 'gets his head to it at the far post', bad: 'is beaten to it by {foil}' },
          pays: 'header', unlock: prName(x._prt), shooter: true,
          label: (x.actor !== a && x.actor !== b ? first(x.actor) + ' rolls it to ' + first(a) + ', who aims' : first(a) + ' aims') + ' at the far post, where ' + first(b) + ' arrives unmarked',
          read: 'A practised routine. ' + tag(b, 'reach', x.legs) + ' against ' + tag(x._prtd, 'reach', 100) + ' in the air.'
        };
      }
    },

    /* ============================ YOUR KEYWORDS WHEN THEY ATTACK (e1) */
    {
      /* BALL WINNER. On their break after you lost the ball, he wins it
       * straight back (on a5's strip, winning the ball on a counter only
       * ended it: this is the one way to start your attack again from
       * there). Against their Dribbler he waits for the ball to be pushed
       * ahead; against their Playmaker (from midfield) he gets there first. */
      id: 'KW_STEAL', family: 'press', side: 'them', kw: 'BALL_WINNER', tzones: [0, 1], answer: true, counterPress: true,
      when: function (x) {
        if (!x.foil) return false;
        var sid = x.threatSit;
        if (sid === 'their_playmaker') {
          x._bw = pickHolder(x, 'BALL_WINNER', 'defending', function (p) { return p.line === 1; });
        } else if (sid === 'their_dribbler' || x.counter) {
          x._bw = pickHolder(x, 'BALL_WINNER', 'defending', function (p) { return p.line <= 1; });
        } else return false;
        return !!x._bw;
      },
      build: function (x) {
        var h = x._bw, sid = x.threatSit;
        if (sid === 'their_dribbler') {
          return {
            test: { mine: h, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'pace' },
            risk: 'even', bonus: BW_DRIB, because: first(x.foil) + ' is a Dribbler and keeps the ball close',
            to: h, grants: { good: [{ id: 'won', man: h, n: 2 }] },
            does: { good: 'takes the ball off {foil}', mixed: 'gets a foot to the ball', bad: 'steps in too late' },
            pays: 'twin', winZone: 1, via: 'alone', fwd: 'goes past ' + first(h) + ' and is through on your goal.', theirGrant: null,
            unlock: kwName(h, 'BALL_WINNER'), counter: kwName(x.foil, 'DRIBBLER'),
            label: first(h) + ' waits for ' + first(x.foil) + ' to push the ball ahead, then steps in',
            read: tag(h, 'defending', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(h) + ' does not try to out-trick ' +
              first(x.foil) + ', so Technique does not matter here, only how quickly ' + first(x.foil) + ' gets to the ball. If ' + first(h) +
              ' wins it, your attack starts in midfield with +2.'
          };
        }
        if (sid === 'their_playmaker') {
          var r = x.th && x.th.runner;
          return {
            test: { mine: h, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'passing' },
            risk: 'even', bonus: BW_BY, because: first(h) + ' is a Ball winner: getting to the ball first is what ' + first(h) + ' does best',
            to: h, grants: { good: [{ id: 'won', man: h, n: 2 }] },
            does: { good: 'takes the ball off {foil}', mixed: 'gets a foot to the ball', bad: 'is too late' },
            pays: 'tpass', table: R.CONSEQUENCE.them.ppass, winZone: 1, via: 'alone', theirTo: r, theirGrant: null,
            names: { mate: first(r), pm: first(x.foil) },
            unlock: kwName(h, 'BALL_WINNER'), counter: kwName(x.foil, 'PLAYMAKER'),
            label: first(h) + ' gets to ' + first(x.foil) + ' before the pass',
            read: tag(h, 'defending', x.legs) + ' against ' + tag(x.foil, 'passing', 100) + '. If ' + first(h) +
              ' wins it, your attack starts in midfield with +2. If not, ' + first(r) + ' is through on your goal.'
          };
        }
        /* the counter: their man has just taken it off you */
        var wz = x.tzone === 0 ? 2 : 1;
        return {
          test: { mine: h, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: BW_BY, because: first(h) + ' is a Ball winner: winning the ball straight back is what ' + first(h) + ' does best',
          to: h, grants: { good: [{ id: 'won', man: h, n: 2 }] },
          does: { good: 'wins the ball straight back from {foil}', mixed: 'gets a foot to the ball', bad: 'goes to win it back and misses' },
          pays: 'twin', winZone: wz, counterWin: true,
          unlock: kwName(h, 'BALL_WINNER'),
          label: first(h) + ' goes straight back at ' + first(x.foil) + ' to win the ball back',
          read: tag(h, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) + '. Their players have all started running forward. If ' +
            first(h) + ' wins it, your attack starts again ' + ZONE_AT[wz] + ' with +2. If not, ' + first(h) + ' is left behind.'
        };
      }
    },
    {
      /* PRESSING PAIR: the same on their counter, two men, a bigger edge */
      id: 'PAIR_PRESS', family: 'press', side: 'them', pair: 'PRESS_PAIR', tzones: [0, 1], counterPress: true,
      when: function (x) {
        if (!x.counter || !x.foil) return false;
        x._pps = pickPair(x, 'PRESS_PAIR');
        return !!x._pps;
      },
      build: function (x) {
        var a = x._pps.a, b = x._pps.b, wz = x.tzone === 0 ? 2 : 1;
        return {
          test: { mine: a, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: PRESS_BY, because: first(b) + ' comes at ' + first(x.foil) + ' from the other side',
          to: a, grants: { good: [{ id: 'won', man: a, n: 3 }] },
          does: { good: 'takes the ball off {foil}', mixed: 'gets a foot to the ball', bad: 'is beaten, and so is ' + first(b) },
          pays: 'twin', winZone: wz, counterWin: true, unlock: prName(x._pps),
          label: first(b) + ' and ' + first(a) + ' go at ' + first(x.foil) + ' together, one from each side',
          read: tag(a, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) + ', with ' + first(b) +
            ' closing him from the other side. If they win it, your attack starts again ' + ZONE_AT[wz] + ' with +3, because their players are going forward.'
        };
      }
    },
    {
      /* DESTROYER: one foul a match with no card */
      id: 'KW_FREE_FOUL', family: 'stop', side: 'them', kw: 'DESTROYER', tzones: [0, 1], answer: true,
      /* on their keyword moments, whoever your Destroyer is; otherwise only
       * when he is the man in front of theirs, where an ordinary foul would
       * be offered (it replaces that foul: no card) */
      when: function (x) {
        if (!x.foil || x.state.minute <= 20) return false;
        var used = (x.state && x.state.freeFouls) || {};
        if (x.threatSit) {
          x._de = pickHolder(x, 'DESTROYER', 'physical', function (p) { return !used[p.id]; });
          return !!x._de;
        }
        if (!destroyerFree(x)) return false;
        if (x.tzone === 0 && value(x.actor, 'defending', x.legs) - value(x.foil, 'technique', 100) > 1 && !(x.theirCarried && x.theirCarried.length)) return false;
        x._de = x.actor;
        return true;
      },
      build: function (x) {
        var h = x._de, near0 = x.tzone === 1;
        return {
          test: { mine: h, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', bonus: 2, because: 'stopping a man by fouling him is easy',
          does: { good: 'pulls {foil} down', mixed: 'catches {foil} late', bad: 'dives in and misses' },
          pays: near0 ? 'tfkfree' : 'tcardfree', via: near0 ? 'freekick' : null, freeFoul: true,
          unlock: kwName(h, 'DESTROYER'), counter: x.threatSit === 'their_dribbler' ? kwName(x.foil, 'DRIBBLER') : null,
          label: first(h) + ' fouls ' + first(x.foil) + ' and gets no card (once a match)',
          read: tag(h, 'physical', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(h) +
            ' can do this once a match without a yellow card. ' + (near0 ? 'They get a free kick near your box.' : 'They get a free kick in midfield, and their attack is over.')
        };
      }
    },
    {
      /* SWEEPER KEEPER against their Playmaker's pass */
      id: 'KW_KEEPER_START', family: 'stop', side: 'them', kw: 'SWEEPER_KEEPER', tzones: [0], answer: true,
      when: function (x) {
        var k = x.squad.keeper;
        if (x.threatSit !== 'their_playmaker' || !x.foil || !kwOn(k, 'SWEEPER_KEEPER') || !x.th || !x.th.runner) return false;
        x._ksm = best(x.squad.players.filter(function (p) { return p.line >= 1 && lane(p) !== 1; }), 'pace', x.legs) ||
          best(inLine(x.squad, 1), 'pace', x.legs);
        return !!x._ksm;
      },
      build: function (x) {
        var k = x.squad.keeper, m = x._ksm, run = x.th.runner;
        return {
          test: { mine: k, mineAttr: 'distribution', theirs: run, theirsAttr: 'pace', fresh: true },
          risk: 'high', to: m, grants: { good: [{ id: 'upfield' }] },
          does: { good: 'leaves his line, gets to the pass first and keeps the ball', mixed: 'leaves his line, gets to the pass first and kicks it clear',
            bad: 'leaves his line, and {foil} gets to the pass first' },
          pays: 'tsweep2', table: R.CONSEQUENCE.them.psweep, winZone: 0, via: 'open', theirTo: run, theirGrant: null,
          names: { mate: first(run) },
          unlock: kwName(k, 'SWEEPER_KEEPER'), counter: kwName(x.foil, 'PLAYMAKER'),
          label: first(k) + ' starts ten metres off his line and comes for the pass',
          read: tag(k, 'distribution', 100) + ' against ' + tag(run, 'pace', 100) + '. A Sweeper keeper can leave his box for a pass meant for ' +
            first(run) + '. If ' + first(k) + ' gets there first, ' + first(m) + ' has the ball and your attack starts. If not, your goal is empty.'
        };
      }
    },
    {
      id: 'KW_KEEPER_CARRY', family: 'move', side: 'them', keeperBall: true, kw: 'SWEEPER_KEEPER',
      when: function (x) {
        var k = x.squad.keeper;
        if (x.sit.id !== 'keeper_to_feet' || !x.foil || !kwOn(k, 'SWEEPER_KEEPER')) return false;
        x._skm = best(x.squad.players.filter(function (p) { return p.line >= 1 && lane(p) !== 1; }), 'pace', x.legs) ||
          best(inLine(x.squad, 1), 'pace', x.legs);
        return !!x._skm;
      },
      build: function (x) {
        var k = x.squad.keeper, m = x._skm;
        return {
          test: { mine: k, mineAttr: 'distribution', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'high', to: m, grants: { good: [{ id: 'upfield' }] },
          does: { good: 'goes past {foil} and passes to ' + first(m), mixed: 'goes past {foil} and kicks it out of play',
            bad: 'loses the ball to {foil}' },
          pays: 'stop', escapes: true, unlock: kwName(k, 'SWEEPER_KEEPER'),
          label: first(k) + ' runs out of the penalty area with the ball',
          read: tag(k, 'distribution', 100) + ' against ' + tag(x.foil, 'pace', 100) + '. If ' + first(k) +
            ' gets past ' + first(x.foil) + ', ' + first(m) + ' has the ball and their forwards are behind the play.'
        };
      }
    },
    {
      /* PLAYING OUT TOGETHER: keeper and Playmaker in defence */
      id: 'PAIR_PLAY_OUT', family: 'move', side: 'them', keeperBall: true, pair: 'PLAY_OUT',
      when: function (x) {
        if (x.sit.id !== 'keeper_to_feet' || !x.foil) return false;
        x._ppo = pickPair(x, 'PLAY_OUT');
        return !!x._ppo;
      },
      build: function (x) {
        var k = x._ppo.a, d = x._ppo.b;
        return {
          test: { mine: d, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'even', to: d, grants: { good: [{ id: 'upfield' }] },
          does: { good: 'takes the short pass and passes it past {foil}', mixed: 'takes the short pass and kicks it out of play',
            bad: 'takes the short pass and loses it to {foil}' },
          pays: 'escape1', unlock: prName(x._ppo),
          label: first(k) + ' passes short to ' + first(d) + ', who passes it past their forwards',
          read: tag(d, 'passing', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) + '. ' + first(k) + ' and ' +
            first(d) + ' do this together. If it works, your attack starts in midfield and their forwards are behind the ball.'
        };
      }
    },
    {
      /* SHOT BLOCKER: when their man is through on your goal, or first to a
       * ball your keeper pushed out, the only defender who gets back */
      id: 'KW_BLOCK_BACK', family: 'stop', side: 'them', kw: 'BLOCKER', box: true,
      when: function (x) {
        if (!x.foil) return false;
        if (!(x.via === 'alone' || x.via === 'open' || (x.via === 'box' && x.state && x.state.bounced))) return false;
        x._bb = pickHolder(x, 'BLOCKER', 'defending');
        return !!x._bb;
      },
      build: function (x) {
        var h = x._bb, pq = kwOn(x.foil, 'POACHER') && x.via === 'box';
        return {
          test: { mine: h, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'finishing' },
          risk: 'even', bonus: BLOCK_BY, because: first(h) + ' is a Shot blocker and only has to get his body in the way of the ball',
          does: { good: 'gets back and blocks the shot from {foil}', mixed: 'gets back and throws himself in front of the shot', bad: 'gets back too late' },
          pays: 'block', table: R.CONSEQUENCE.them.block,
          unlock: kwName(h, 'BLOCKER'), counter: pq ? kwName(x.foil, 'POACHER') : null,
          label: first(h) + ' gets back and throws himself in front of the shot',
          read: tag(h, 'defending', x.legs) + ' against ' + tag(x.foil, 'finishing', 100) + '. Only a Shot blocker gets back in time for this.'
        };
      }
    },
    {
      /* CROSS CATCHER: the check is your keeper against the man crossing
       * it, so their header man's height does not matter */
      id: 'KW_CLAIM', family: 'stop', side: 'them', kw: 'CATCHER', box: true, answer: true,
      when: function (x) {
        var k = x.squad.keeper;
        if (['cross', 'lowcross', 'corner', 'fkcross'].indexOf(x.via) < 0 || !x.foil || !kwOn(k, 'CATCHER')) return false;
        x._ckr = x.crosser && x.crosser !== x.foil ? x.crosser : best(x.opp.players.filter(function (p) { return p !== x.foil; }), 'passing', 100);
        return !!x._ckr;
      },
      build: function (x) {
        var k = x.squad.keeper, w = x._ckr, hold = !!x.flipOk;
        var tkw = x.via === 'lowcross' ? (kwOn(w, 'CROSSER') ? kwName(w, 'CROSSER') : null) : (kwOn(x.foil, 'TARGET') ? kwName(x.foil, 'TARGET') : null);
        return {
          test: { mine: k, mineAttr: 'physique', theirs: w, theirsAttr: 'passing', fresh: true },
          risk: 'even', to: x.outBall,
          does: { good: 'catches the ' + (x.via === 'lowcross' ? 'low ' : '') + 'cross', mixed: 'gets to the cross first and pushes it away', bad: 'comes for the cross and misses it' },
          pays: hold ? 'claimhold' : 'claim', table: hold ? R.CONSEQUENCE.them.claimhold : R.CONSEQUENCE.them.claim, names: { tgt: first(x.foil) },
          unlock: kwName(k, 'CATCHER'), counter: tkw,
          label: !GUARD.namesRolled ? first(k) + ' leaves the line to catch it before ' + first(x.foil) + ' gets to it'
            : first(k) + ' leaves the line to catch ' + first(w) + "'s " + (x.via === 'corner' || x.via === 'fkcross' ? 'kick' : 'cross') + ' before ' + first(x.foil) + ' gets to it',
          read: tag(k, 'physique', 100) + ' against the ' + (x.via === 'corner' || x.via === 'fkcross' ? 'kick' : 'cross') + ' from ' + tag(w, 'passing', 100) + '. ' + first(x.foil) +
            ' never gets to it if ' + first(k) + ' is there first.' + (hold ? ' If ' + first(k) + ' catches it, your attack starts in midfield.' : '')
        };
      }
    },

    /* ================================ THEIR KEYWORDS: MOMENTS YOU DEFEND (e1) */
    /* Their Dribbler runs at your back line at the edge of your box (model.js
     * THREAT_SITS). On that first decision the menu is these four, plus the
     * keywords of yours that answer him (KW_STEAL, KW_FREE_FOUL). */
    {
      id: 'TD_SHOW_WIDE', family: 'hold', side: 'them', tsit: 'their_dribbler',
      when: function (x) { return !!x.actor && !!x.foil; },
      build: function (x) {
        /* the cross from the byline comes in only to their Target man, or
         * if he is a Crosser himself; otherwise your defenders head it clear */
        var cr = M().crossPlan(x.opp), crossOn = !!cr && (cr.high || kwOn(x.foil, 'CROSSER'));
        return {
          /* a race down the outside: a quick Dribbler cannot be shown wide, a
           * slow one can, whatever his Technique */
          test: { mine: x.actor, mineAttr: 'pace', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'even', theirGrant: null,
          does: { good: 'stays on the inside of {foil} and pushes {foil} towards the touchline', mixed: 'stays on the inside of {foil}', bad: 'lets {foil} cut inside' },
          pays: crossOn ? 'dwidex' : 'dwide', via: crossOn ? 'cross' : null,
          label: first(x.actor) + ' stays on the inside of ' + first(x.foil) + ' and lets ' + first(x.foil) + ' go down the outside',
          read: tag(x.actor, 'pace', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. ' + first(x.actor) +
            ' does not try to win the ball, so Technique does not matter, only Pace. ' +
            (crossOn ? 'If ' + first(x.foil) + ' gets to the byline, ' + first(x.foil) + ' crosses it, and ' + first(cr.target) + ' is waiting in your box.'
              : 'Out wide ' + first(x.foil) + ' can only cross it, and nobody of theirs is waiting for it.')
        };
      }
    },
    {
      id: 'TD_DOUBLE', family: 'stop', side: 'them', tsit: 'their_dribbler', pairTwist: true,
      when: function (x) { return !!x.actor && !!x.support && x.support !== x.actor && !!x.foil; },
      build: function (x) {
        return {
          test: { mine: x.support, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', bonus: 2, because: 'there are two of them against ' + first(x.foil),
          does: { good: 'comes across and traps {foil} with ' + first(x.actor), mixed: 'comes across and slows {foil} down', bad: 'comes across too early' },
          pays: 'twin', winZone: 1, via: 'alone', fwd: 'goes past both of them and is through on your goal.', theirGrant: null,
          grants: { good: [{ id: 'caught' }] },
          label: 'Send ' + first(x.support) + ' across to help ' + first(x.actor) + ' against ' + first(x.foil),
          read: tag(x.support, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) + ', with ' + first(x.actor) +
            ' as well. Two against one, but ' + first(x.support) + ' leaves the man ' + first(x.support) + ' was marking.'
        };
      }
    },
    {
      id: 'TD_FOUL', family: 'stop', side: 'them', tsit: 'their_dribbler', books: true,
      when: function (x) { return !!x.actor && !!x.foil && !(x.state.booked && x.state.booked[x.actor.id]); },
      build: function (x) {
        var fk = theirKw(x, 'FREEKICK', 'technique');
        return {
          test: { mine: x.actor, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', bonus: 2, because: 'stopping a man by fouling him is easy',
          does: { good: 'pulls {foil} down', mixed: 'trips {foil} just outside your box', bad: 'dives in and misses' },
          pays: 'tfk', via: 'freekick', vias: { bad: 'alone' }, fwd: 'stays on his feet and is through on your goal.', theirGrant: null,
          label: first(x.actor) + ' fouls ' + first(x.foil) + ' to stop the run',
          read: tag(x.actor, 'physical', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. Stops the run, and ' + first(x.actor) +
            ' gets a yellow card. ' + (fk ? first(x.foil) + ' is 25 metres from your goal, so the free kick is a shot for ' + first(fk) + '.'
              : 'They get a free kick 25 metres out, and nobody of theirs shoots free kicks, so it will be crossed in.')
        };
      }
    },
    {
      id: 'TD_DROP', family: 'move', side: 'them', tsit: 'their_dribbler',
      when: function (x) { return !!x.actor && !!x.foil && !!x.squad.keeper; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'reflexes', theirs: x.foil, theirsAttr: 'finishing', fresh: true },
          risk: 'even', bonus: LONG_SAVE, because: 'a shot from 25 metres rarely goes in',
          does: { good: 'holds the shot from {foil}', mixed: 'pushes the shot from {foil} away', bad: 'cannot get to the shot from {foil}' },
          pays: 'tdrop', theirGrant: null,
          label: first(x.actor) + ' stays back, so ' + first(x.foil) + ' can only shoot from 25 metres',
          read: 'Nobody tackles. ' + tag(k, 'reflexes', 100) + ' against ' + tag(x.foil, 'finishing', 100) + ' from 25 metres.'
        };
      }
    },

    /* Their Playmaker in midfield looks for the pass between your defenders
     * for their fastest forward (x.th.runner). */
    {
      id: 'TP_DEEP', family: 'hold', side: 'them', tsit: 'their_playmaker',
      when: function (x) { return !!x.support && !!x.th && !!x.th.runner && !!x.foil; },
      build: function (x) {
        var d = x.support, r = x.th.runner;
        return {
          test: { mine: d, mineAttr: 'intelligence', theirs: r, theirsAttr: 'pace' },
          risk: 'low', bonus: 2, because: 'your defenders only have to get back, not win the ball',
          does: { good: 'takes your back line ten metres deeper', mixed: 'takes your back line deeper', bad: 'takes your back line deeper, too slowly' },
          pays: 'pdeep', theirTo: r, theirGrant: null, names: { pm: first(x.foil), mate: first(r) },
          label: first(d) + ' takes your back line ten metres deeper',
          read: tag(d, 'intelligence', x.legs) + ' against ' + tag(r, 'pace', 100) + '. No space behind your defence for ' +
            first(x.foil) + ' to pass into, but ' + first(x.foil) + ' can shoot from distance instead.'
        };
      }
    },
    {
      id: 'TP_PRESS', family: 'press', side: 'them', tsit: 'their_playmaker',
      when: function (x) { return !!x.actor && !!x.th && !!x.th.runner && !!x.foil; },
      build: function (x) {
        var r = x.th.runner;
        return {
          test: { mine: x.actor, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', winZone: 1, grants: { good: [{ id: 'caught' }] },
          does: { good: 'gets to {foil} before the pass', mixed: 'gets close to {foil}', bad: 'is too slow to get to {foil}' },
          pays: 'ppass', theirTo: r, theirGrant: null, names: { pm: first(x.foil), mate: first(r) },
          label: first(x.actor) + ' runs at ' + first(x.foil) + ' before the pass',
          read: tag(x.actor, 'defending', x.legs) + ' against ' + tag(x.foil, 'technique', 100) + '. If ' + first(x.foil) +
            ' gets the pass away, ' + first(r) + ' is through on your goal.'
        };
      }
    },
    {
      id: 'TP_CUT', family: 'stop', side: 'them', tsit: 'their_playmaker',
      when: function (x) { return !!x.support && !!x.th && !!x.th.runner && !!x.foil; },
      build: function (x) {
        var d = x.support, r = x.th.runner;
        return {
          test: { mine: d, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'passing' },
          risk: 'even', winZone: 1, grants: { good: [{ id: 'caught' }] },
          does: { good: 'steps across and cuts out the pass', mixed: 'gets a toe to the pass', bad: 'steps across too late' },
          pays: 'ppass', theirTo: r, theirGrant: null, names: { pm: first(x.foil), mate: first(r) },
          label: first(d) + ' reads the pass and steps across to cut it out',
          read: tag(d, 'intelligence', x.legs) + ' against ' + tag(x.foil, 'passing', 100) + '. If ' + first(d) +
            ' is late, ' + first(r) + ' is through on your goal.'
        };
      }
    },
    {
      id: 'TP_OFFSIDE', family: 'press', side: 'them', tsit: 'their_playmaker',
      when: function (x) {
        var line0 = inLine(x.squad, 0);
        if (!line0.length || !x.th || !x.th.runner) return false;
        var avg = line0.reduce(function (a, p) { return a + A.eff(p, 'intelligence', x.legs); }, 0) / line0.length;
        x._tpIQ = Math.round(avg);
        x._tpl = best(line0, 'intelligence', x.legs);
        return avg >= 12 && !!x._tpl;
      },
      build: function (x) {
        var r = x.th.runner, lead = x._tpl;
        return {
          test: { mine: lead, mineAttr: 'intelligence', theirs: r, theirsAttr: 'intelligence' },
          risk: 'high', winZone: 1, grants: { good: [{ id: 'caught' }] },
          does: { good: 'calls the step up, and your defenders move forward together', mixed: GUARD.offsideStop ? 'calls the step up just in time' : 'calls the step up half a second late', bad: 'steps up, and the others stay back' },
          pays: 'poff', table: GUARD.offsideStop ? R.CONSEQUENCE.them.poffstop : null, theirTo: r, names: { mate: first(r) },
          theirGrant: { amount: 2, why: first(r) + ' is through on his own', text: first(r) + ' is through on his own, with only your keeper to beat: +2 to ' + first(r) },
          label: first(lead) + ' calls your defenders forward together to catch ' + first(r) + ' offside',
          read: tag(lead, 'intelligence', x.legs) + ' leads the line, against ' +
            tag(r, 'intelligence', 100) + '. A step up that is late leaves ' + first(r) + ' through on your goal.'
        };
      }
    },

    /* ---- e2: their header on your goal, after your defender lost the duel
     * in the air: two ways for your keeper, safe or starting your attack */
    {
      id: 'BOX_KEEP_REACT', family: 'hold', side: 'them', box: true,
      when: function (x) { return x.via === 'header' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'reflexes', theirs: x.foil, theirsAttr: 'finishing', fresh: true },
          risk: 'low', bonus: HEADER_SAVE, because: 'a header is slower than a shot',
          does: { good: 'gets down and pushes the header away', mixed: 'gets a fingertip to the header', bad: 'cannot reach the header' },
          pays: 'keepreact', table: R.CONSEQUENCE.them.keepreact,
          label: first(k) + ' stays on his line and reacts to the header',
          read: tag(k, 'reflexes', 100) + ' against the header from ' + tag(x.foil, 'finishing', 100) + '. The safe way: a save or a tip over the bar ends their attack.'
        };
      }
    },
    {
      id: 'BOX_KEEP_CATCH', family: 'stop', side: 'them', box: true,
      when: function (x) { return x.via === 'header' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper, hold = !!x.flipOk;
        return {
          test: { mine: k, mineAttr: 'physique', theirs: x.foil, theirsAttr: 'finishing', fresh: true },
          risk: 'even', bonus: HEADER_SAVE - 2, because: 'a header is slower than a shot, but catching it is harder than pushing it away', to: x.outBall,
          does: { good: 'catches the header', mixed: 'goes to catch it and cannot hold it', bad: 'goes to catch it and lets it through' },
          pays: hold ? 'keepcatch' : 'keepcatch0', table: hold ? R.CONSEQUENCE.them.keepcatch : R.CONSEQUENCE.them.keepcatch0,
          label: first(k) + ' tries to catch the header',
          read: tag(k, 'physique', 100) + ' against the header from ' + tag(x.foil, 'finishing', 100) + '.' +
            (hold ? ' If ' + first(k) + ' catches it, your attack starts in midfield.' : ' A catch ends their attack for sure.')
        };
      }
    },

    /* ---- their low cross across your six-yard box (their Crosser): the
     * ball is on the ground, so nobody heads it */
    {
      id: 'BOX_SLIDE', family: 'stop', side: 'them', box: true,
      when: function (x) {
        x._bsl = best(inLine(x.squad, 0), 'intelligence', x.legs);
        return x.via === 'lowcross' && !!x._bsl && !!x.crosser && !!x.foil;
      },
      build: function (x) {
        var d = x._bsl;
        return {
          test: { mine: d, mineAttr: 'intelligence', theirs: x.crosser, theirsAttr: 'passing' },
          risk: 'even',
          does: { good: 'reads the low cross and gets to it first', mixed: 'gets a touch on the low cross', bad: 'misses the low cross' },
          pays: x.state && x.state.bounced ? 'slidestop' : 'slide', names: { tgt: first(x.foil) },
          /* call2: the card names the man whose number it rolls (the crosser),
           * not only the man the cross is for (Eduardo's 41st minute) */
          label: !GUARD.namesRolled ? first(d) + ' gets across to meet the low cross before ' + first(x.foil)
            : x.crosser === x.foil ? first(d) + ' gets across to meet ' + first(x.crosser) + "'s low cross"
            : first(d) + ' gets across before ' + first(x.crosser) + "'s low cross reaches " + first(x.foil),
          read: tag(d, 'intelligence', x.legs) + ' against the cross from ' + tag(x.crosser, 'passing', 100) + '. A touch that does not clear it is a corner.'
        };
      }
    },
    {
      id: 'BOX_DIVE', family: 'stop', side: 'them', box: true,
      when: function (x) { return x.via === 'lowcross' && !!x.squad.keeper && !!x.crosser && !kwOn(x.squad.keeper, 'CATCHER'); },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'physique', theirs: x.crosser, theirsAttr: 'passing', fresh: true },
          risk: 'high', bonus: -2, because: 'a keeper who is not a Cross catcher does not often leave his line', to: x.outBall,
          does: { good: 'dives at the low cross', mixed: 'dives and pushes the low cross out of play', bad: 'dives and misses the low cross' },
          pays: x.flipOk ? 'divehold' : 'dive', names: { tgt: first(x.foil) },
          label: first(k) + ' dives at the low cross',
          read: tag(k, 'physique', 100) + ' against the cross from ' + tag(x.crosser, 'passing', 100) + '. If ' + first(k) + ' misses, ' +
            first(x.foil) + ' has an empty goal.'
        };
      }
    }
  ];

  /* The maths lives in resolve.js so that one rule produces every number on
   * screen. The old version had a curve here that nobody could see, printed a
   * margin beside it, and the two did not explain each other. He caught it. */

  /* How tired that line is, said as numbers rather than as "on tired legs".
   * His note: "instead of tired legs say stamina 50/100, effect 50/100 *
   * Defending stat or however it works". */
  function staminaNote(p, id, legs) {
    /* his own line's number, not the moment's (attributes.js legsOf) */
    legs = A.legsOf ? A.legsOf(p, legs) : legs;
    if (!p || legs === undefined || legs >= 99) return null;
    var base = Math.round((p.attr && p.attr[id]) || 0);
    var now = value(p, id, legs);
    if (!base || base === now) return null;
    return 'Stamina ' + Math.round(legs) + ' out of 100 in that line, so ' +
      first(p) + "'s " + statOf(id) + ' ' + base + ' is playing as ' + now + '.';
  }

  /* The one-line verdict under an option, in plain English. No odds. */
  function verdict(x, id) {
    var mine = x.actor ? value(x.actor, id, x.legs) : 0;
    var theirs = x.foil ? value(x.foil, x.act.theirs, 100) : 0;
    var gap = mine - theirs;
    if (x.legs < 32) return 'His legs are down to ' + Math.round(x.legs) + ' out of 100, so he is slower than that number looks.';
    if (gap >= 5) return 'He should win this.';
    if (gap >= 2) return 'Slightly in your favour.';
    if (gap > -2) return "It's a 50/50. Dangerous counter if you lose it.";
    if (gap > -5) return 'Slightly against you.';
    return 'He is second favourite here.';
  }

  /* --------------------------------------------------------- selection */
  /* Build every option that exists, then show a spread: never three of the
   * same family, and the conditional ones get priority over the generic ones
   * because they are the reason two squads play differently. */

  /* KEEPER_LONG too: when the keeper has the ball the long kick must always
   * be there, or a weak keeper against a quick forward had no option at all */
  var ZONE_ANY = { WASTE_TIME: 1, FRESH_LEGS: 1, THROW_EVERYONE: 1, KEEPER_UP: 1, HOLD: 1 };
  var ZONE_PRIMARY = ['Z_PASS_MID', 'Z_CARRY', 'Z_TAKE_ON', 'Z_SHOOT'];
  var ZONE_SAFE = [['Z_PASS_MID', 'Z_KEEP_BACK'], ['Z_SWITCH', 'Z_LAYOFF', 'Z_RECYCLE'],
    ['Z_CUTBACK', 'Z_WIDE', 'Z_LAYOFF', 'Z_RECYCLE'], ['Z_PLACE', 'Z_RECYCLE']];
  var KIND = { advance: 'forward', probe: 'forward', through: 'long', hold: 'safe', back: 'safe',
    shot: 'finish', shotreb: 'finish', placed: 'finish', longshot: 'finish', header: 'air', square: 'pass', pullback: 'pass',
    dribble2: 'forward', dribble2e: 'forward', onetwo: 'forward', onetwo1: 'forward', lowcross: 'pass', lowcross0: 'pass', rebshot: 'finish' };
  var CONTINUES = { advance: 1, probe: 1, through: 1, hold: 1, back: 1, dribble2: 1, dribble2e: 1, onetwo: 1, onetwo1: 1, lowcross: 1 };
  /* e1 (from d1): the free kick your Dribbler wins has its own first choice
   * and its own safe ball; the one-two's second decision is the ordinary
   * menu plus the pass back */
  var MODE_PRIMARY = { freekick: ['FK_SHOT', 'FK_POWER'] };
  var MODE_SAFE = { freekick: ['FK_SHORT'] };
  var ADDITIVE = { onetwo: 1 };
  /* a save by their keeper, when your Poacher is on the pitch, is a loose
   * ball he reaches first (the hard shot does this for anyone: a5) */
  var SAVED = { Z_PLACE: 1, Z_SHOOT_FAR: 1, FK_SHOT: 1, FK_POWER: 1, KW_Z_FREE_KICK_WIDE: 1 };
  /* the shots, for carry-over (c2): the man who takes one carries the result */
  var SHOT_PAYS = { shot: 1, shotreb: 1, placed: 1, longshot: 1, header: 1, rebshot: 1 };
  /* g1: the passes that score when they come off (a pull-back, a ball across the goal) */
  var GOAL_PAYS = { square: 1, pullback: 1 };
  var GENERIC = { ATTACK_BALL: 1, MEET_IT: 1, HOLD: 1, SWITCH: 1, STAY_GOALSIDE: 1, KEEPER_LONG: 1, KEEPER_SHORT: 1,
    M_PRESS: 1, M_DROP: 1, M_CUT: 1, E_TACKLE: 1, E_WIDE: 1, E_BLOCK: 1 };
  /* THEIR ATTACK, ZONE BY ZONE (a4): 0 midfield, 1 the edge of your box */
  var T_AT = ['in midfield', 'at the edge of your box'];
  var T_PRIMARY = ['M_PRESS', 'E_TACKLE'];
  /* what they get when your man loses a duel in their attack: sized so a
   * thoughtful user concedes about as often as in a2 (0.6 to 0.7 a match) */
  var T_EDGE = 2;
  /* your keeper against a shot from inside your box */
  var BOX_SAVE_BONUS = 2;
  /* g1: the keeper coming a few steps out against a man through on his own
   * (BOX_NARROW, from p3). p3 used +4; on e2's match it took 0.3 goals a
   * match off Argentina's opponents (measured, g1 node.json) */
  var NARROW_BY = 2;
  var SAFE_DEF = 2, SAFE_ATT = 3;
  /* g1: a shot from inside the box, close to goal: +2 whoever shoots
   * (yours was +3 on the hard shot, theirs nothing); sized with the finals */
  var CLOSE_HARD = 3, CLOSE_PLACED = 2;
  var SHOT_CAP = 5, THEIR_CLOSE = 3, PASS_CAP = 4, THEIR_CAP = 2, PLACE_CAP = null;
  /* e2: SET PIECES AND SHOTS FROM DISTANCE AGAINST YOU. The dice swing 5
   * either way, so a stat gap of 6 decides a check outright: Messi (Technique
   * 20) against a keeper of 14 scored 8 free kicks in 9. These are what a
   * free kick from 25 metres, a shot from 25 metres and a header asks of
   * the man taking it, on the card with their reasons. Sized in the harness
   * (e2 node.json). */
  var FK_WALL = 6, FK_KEEPER = 6, FK_CHARGE = 3, LONG_SAVE = 5, HEADER_SAVE = 4;
  /* g1: your free kick and your shot from outside the box, sized as theirs */
  var YOUR_FK = 5, YOUR_LONG = 5;
  /* g2: UNLOCKS SIZED SO THEY ARE A REAL CHOICE (round 3 review, fix 1).
   * Each is a named part on the card. Before: the one-two came off 8 times
   * in 100 and was beaten on every count on all 65 menus it was on; your
   * Ball winner going back at their man lost 71 times in 100; the Pressing
   * pair 73; the Shot blocker 79; the Crosser's low ball 47. */
  var HEAD_BY = 0, FK_KW_BY = 0, OT_BY = 2, BW_BY = 0, BW_DRIB = -3, PRESS_BY = 3, BLOCK_BY = 3, LOWX_BY = 0;
  function setUnlockSizes(v) { if (v.head !== undefined) HEAD_BY = v.head; if (v.fk !== undefined) FK_KW_BY = v.fk; if (v.ot !== undefined) OT_BY = v.ot; if (v.bw !== undefined) BW_BY = v.bw; if (v.bwd !== undefined) BW_DRIB = v.bwd; if (v.press !== undefined) PRESS_BY = v.press; if (v.block !== undefined) BLOCK_BY = v.block; if (v.lowx !== undefined) LOWX_BY = v.lowx; }
  /* e2: when your keeper cannot fail against this man's header (a centre-
   * back with Finishing 7), the header step is not a decision: the lost
   * duel says so and ends there */
  function headerSure(x, man) {
    var k = x.squad.keeper;
    if (!k || !k.attr || !man) return false;
    return value(k, 'reflexes', 100) + HEADER_SAVE - value(man, 'finishing', 100) >= R.CERTAIN_AT;
  }
  function aerialPays(x, man, bounced) {
    if (!GUARD.aerial) return null;
    if (headerSure(x, man)) return bounced ? 'boxaerialsure1' : 'boxaerialsure';
    return bounced ? 'boxaerial1' : 'boxaerial';
  }
  function setSetPieces(v) { FK_WALL = v.wall; FK_KEEPER = v.keeper; FK_CHARGE = v.charge; LONG_SAVE = v.long; if (v.header !== undefined) HEADER_SAVE = v.header; }
  var T_SAFE = [['M_DROP'], ['E_WIDE']];
  /* e1: the safe answer on their keyword moments */
  var THREAT_SAFE = { their_dribbler: ['TD_SHOW_WIDE'], their_playmaker: ['TP_DEEP'] };
  var THREAT_PRIMARY = { their_dribbler: 'TD_DOUBLE', their_playmaker: 'TP_PRESS' };
  /* the older defending options that still exist when their attack is at
   * the edge of your box, on its first decision (the situation is about a
   * ball in the air or a ball over the top) */
  var T_OLD = { KEEPER_SWEEPS: 1, HEAD_CLEAR: 1 };
  /* e1: HOW OFTEN A KEYWORD OPTION IS ON THE MENU. d2 gave one a reserved
   * place on every menu that had one, and 73 percent of decisions in the
   * final carried a keyword option: wallpaper, not a signature. Here a
   * keyword option of yours competes for the places after the first choice
   * and the safe ball, and its reserved place comes up only on some
   * decisions (KW_SLOT), always on a moment only it can open (the pass back
   * of a one-two, the free kick) and always on their keyword moments, where
   * it is your answer. */
  var KW_SLOT = 0.5;
  /* g2: the keeper never tires, so his number is the same on the card and on
   * the dice banner (round 3 review: 14 cards said Distribution 13 and the
   * roll used 11) */
  function x_legsFor(ctx, t) { return t.fresh || (GUARD.keeperFresh && t.mine && ctx.squad && t.mine === ctx.squad.keeper) ? 100 : ctx.legs; }

  /* WHAT AN ACTION COSTS. Eduardo, 2026-09-23: stamina used to drain on the
   * clock whatever you did, so every choice was judged on its own. Now the
   * man who does it spends his line's stamina, paid whatever the result, and
   * the card says how much. Running and shoving (Pace, Physical, in the air)
   * cost RUN_COST; any other gamble costs TOUCH_COST; the safe option, a
   * substitution and running the clock cost nothing. The keeper never tires.
   * Sized by the harness (600 matches a style): at 8/3 weighing the cost made
   * no difference at all; at 16/5 a player who weighs it a little does a
   * little better (+2 to 3 points) and one who hoards stamina does clearly
   * worse (-9), the shape of a real trade-off; at 25/8 cost swamps play. */
  var RUN_COST = 16, TOUCH_COST = 5;
  var LINE_KEY = ['def', 'mid', 'att'], LINE_WORD = { def: 'defence', mid: 'midfield', att: 'attack' };
  function costOf(t, risk, pays) {
    var p = t.mine;
    if (!p || typeof p.line !== 'number' || !LINE_KEY[p.line]) return null;
    if (risk === 'low' || pays === 'sub' || pays === 'clock' || t.fresh) return null;
    var run = t.mineAttr === 'pace' || t.mineAttr === 'physical' || t.mineAttr === 'reach';
    return { line: LINE_KEY[p.line], amount: run ? RUN_COST : TOUCH_COST, run: run };
  }

  /* CARRY-OVER BETWEEN EVENTS (e1, from c2). What happened earlier in the
   * match, on the card with its reason:
   *   your man who scored shoots at +1 next time, one who missed at -2
   *   (match.js st.form: spent by his next shot);
   *   your defender on a yellow card tackles at -2 for the rest of the match;
   *   their man on a yellow card lets your players run at him at +2.
   * Returns [{ n, why, text, form }] for option o with test t. */
  var RUN_AT = { technique: 1, pace: 1 };
  function carryOver(ctx, t, pays) {
    var st = ctx.state || {}, out = [];
    if (!GUARD.form) return out;
    var mine = t.mine && ctx.squad.players.indexOf(t.mine) >= 0;
    if (!mine) return out;
    var f = st.form && st.form[t.mine.id];
    if (f && SHOT_PAYS[pays]) {
      out.push({ n: f.n, why: f.why, form: true,
        text: f.why + ': ' + statOf(t.mineAttr) + ' ' + (f.n > 0 ? '+' : '') + f.n + ' here' });
    }
    if (st.booked && st.booked[t.mine.id] && t.mineAttr === 'defending') {
      out.push({ n: -2, why: first(t.mine) + ' is on a yellow card and cannot go in fully',
        text: first(t.mine) + ' is on a yellow card: Defending -2 for the rest of the match' });
    }
    if (st.oppBooked && t.theirs && st.oppBooked[t.theirs.id] && RUN_AT[t.mineAttr] && ctx.sit.who === 'you') {
      var bk = st.oppBooked[t.theirs.id];
      out.push({ n: 2, why: first(t.theirs) + ' is on a yellow card and cannot risk a tackle',
        text: first(t.theirs) + ' is on a yellow card (booked at ' + bk + ' minutes) and cannot risk a tackle: +2 to running at ' + first(t.theirs) });
    }
    return out;
  }

  /* g1 (from p3): A MENU FITS ON ONE SCREEN. At most MENU_LIVE live
   * options and MENU_GREY greyed. Which three: the low-risk one always stays
   * (the question this game asks is how much risk to take), the strongest
   * one always stays (p3 measured the spread rule alone hiding the best move
   * on 14 to 25 percent of the final's menus), and the third is:
   *   a keyword or pair option of yours, when e2's rules give it its place
   *   (always on a moment only it opens and on your answers to their
   *   keywords; on half of your attacking menus otherwise, never the same
   *   one twice running), or else
   *   the option whose results are most different from those two.
   * A kind is what the option does when it comes off and when it goes wrong
   * (scores / moves the ball on / keeps it / wins the ball ...). */
  var MENU_LIVE = 3, MENU_GREY = 1, REALSAFE_AT = 0.4;
  function endKey(x) { return x ? [x.effect, x.move, x.into, x.tmove, !!x.win, x.via].join('|') : '-'; }
  function resultKind(o) {
    var by = {};
    (o.outcomes || []).forEach(function (x) { (x.bands || [x.band]).forEach(function (b) { by[b] = x; }); });
    return endKey(by.good) + '/' + endKey(by.bad || by.mixed);
  }
  function spreadTV(a, b) {
    var k = {}, d = 0;
    (a.outcomes || []).forEach(function (x) { var e = endKey(x); k[e] = (k[e] || 0) + x.p; });
    (b.outcomes || []).forEach(function (x) { var e = endKey(x); k[e] = (k[e] || 0) - x.p; });
    for (var e in k) d += Math.abs(k[e]);
    return d / 2;
  }
  function effectTV(a, b) {
    var k = {}, d = 0;
    (a.outcomes || []).forEach(function (x) { k[x.effect] = (k[x.effect] || 0) + x.p; });
    (b.outcomes || []).forEach(function (x) { k[x.effect] = (k[x.effect] || 0) - x.p; });
    for (var e in k) d += Math.abs(k[e]);
    return d / 2;
  }
  /* what an option is worth on average, in the same plain terms as the
   * outcome table: a goal 1, a stop 0.4, the ball further up 0.3, nothing
   * 0, the ball lost -0.5, a goal against -1 */
  var WORTH = { goal: 1, stopped: 0.4, ground: 0.3, rest: 0.1, nothing: 0, 'break': -0.5, concede: -1 };
  function worth(o) { return (o.outcomes || []).reduce(function (a, x) { return a + x.p * (WORTH[x.effect] || 0); }, 0); }
  var PIN_STRONG = true;
  var PIN_DEF = true;
  function pickSpread(ranked, safe, primary, want, kwPick, noStrong) {
    ranked.forEach(function (o) { o.pinned = null; });
    if (ranked.length <= want) {
      ranked.forEach(function (o) { o.pinned = o === safe ? 'safe' : o === kwPick ? 'keyword' : null; });
      return ranked;
    }
    var fixed = safe && ranked.indexOf(safe) >= 0 ? [safe] : [];
    var strong = null;
    if (PIN_STRONG && !noStrong) ranked.forEach(function (o) { if (fixed.indexOf(o) < 0 && (!strong || worth(o) > worth(strong) + 1e-9)) strong = o; });
    if (strong && fixed.length < want) fixed.push(strong);
    if (kwPick && ranked.indexOf(kwPick) >= 0 && fixed.indexOf(kwPick) < 0 && fixed.length < want) fixed.push(kwPick);
    ranked.forEach(function (o) {
      o.pinned = fixed.indexOf(o) < 0 ? null : o === safe ? 'safe' : o === strong ? 'strong' : o === kwPick ? 'keyword' : null;
    });
    var rest = ranked.filter(function (o) { return fixed.indexOf(o) < 0; });
    var need = want - fixed.length, best = null, bestScore = -Infinity;
    (function walk(from, chosen) {
      if (chosen.length === need) {
        var set = fixed.concat(chosen), kinds = {}, tv = 0, rank = 0;
        set.forEach(function (o) { kinds[resultKind(o)] = 1; rank += ranked.indexOf(o); });
        for (var i = 0; i < set.length; i++) for (var j = i + 1; j < set.length; j++) tv += spreadTV(set[i], set[j]);
        /* two options with the same results at the same odds, however they
         * are worded, are one choice shown twice */
        var twins = 0;
        for (var a = 0; a < set.length; a++) for (var c = a + 1; c < set.length; c++) if (effectTV(set[a], set[c]) < 0.01) twins++;
        var score = Object.keys(kinds).length * 10 - twins * 30 + tv + (primary && set.indexOf(primary) >= 0 ? 0.5 : 0) - rank * 0.01;
        if (score > bestScore) { bestScore = score; best = set; }
        return;
      }
      for (var k = from; k < rest.length; k++) walk(k + 1, chosen.concat([rest[k]]));
    })(0, []);
    /* shown in the old order: the obvious action first, the safe one next */
    return ranked.filter(function (o) { return best.indexOf(o) >= 0; });
  }

  /* f2 ROOM: a defender who has learned a move leaves room for another one
   * on the same menu. Which one depends on the menu, so the menu is built,
   * the room is chosen from it (match.js counterRoom), and the menu is built
   * again with the +1 in place. offer is deterministic (no dice), so the
   * second build is the first plus the room. If the +1 changes the menu so
   * that either card is gone, the first menu stands, with no room. */
  function offer(ctx, howMany) {
    var S = ctx.state;
    var zoneMode = ctx.zone !== undefined && ctx.zone !== null && ctx.sit.who === 'you';
    if (!zoneMode || !S || typeof S.counterRoom !== 'function') return offer1(ctx, howMany);
    S.setRoom(null);
    var r = offer1(ctx, howMany);
    var room = S.counterRoom(r.live);
    if (!room) return r;
    S.setRoom(room);
    var r2 = offer1(ctx, howMany);
    S.setRoom(null);
    var both = 0;
    r2.live.forEach(function (o) { if (o.counterNotes && o.counterNotes.join(' ').indexOf('is staying close to') >= 0) both++; });
    return both >= 2 ? r2 : r;
  }

  /* w0: an effect changed who receives the ball (hook 'option',
   * setRecipient): the card's words follow, name for name */
  function retarget(b, p, legs) {
    /* m1 from w1e: a pass that scores (a pull-back, a ball across the goal)
     * names its man as b.mate and has no b.to; the recipient is that man */
    var old = b.to || (['pullback', 'square'].indexOf(b.pays) >= 0 ? b.mate : null) || null, hadTo = !!b.to;
    if (!p || p === old) return;
    if (old) {
      /* m1 from w1a: the old man's own numbers in the words, "Oyarzabal (ST,
       * Finishing 19)", become the new man's, not his name on the old
       * man's stats (w0 printed "Olmo (ST, Finishing 19)") */
      var esc = function (t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var tre = new RegExp(esc(first(old)) + ' \\(' + esc(pos(old)) + '([A-Za-z ]+?) \\d+(, [0-9.]+m)?\\)', 'g');
      var byName = {};
      A.ATTRS.concat(A.KEEPER_ATTRS).forEach(function (a) { byName[statOf(a.id)] = a.id; });
      var tg = function (v) { return typeof v === 'string' ? v.replace(tre, function (m0, sn, h) { var id = h ? 'reach' : byName[sn]; return id ? tag(p, id, legs) : m0; }) : v; };
      b.label = tg(b.label); b.read = tg(b.read);
      var re = new RegExp('(?<![A-Za-z\u00c0-\u024f])' + first(old).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z\u00c0-\u024f])', 'g');
      var sw = function (v) { return typeof v === 'string' ? v.replace(re, first(p)) : v; };
      b.label = sw(b.label); b.read = sw(b.read);
      if (b.does) { var d = {}; Object.keys(b.does).forEach(function (k) { d[k] = sw(b.does[k]); }); b.does = d; }
      if (b.names) { var nm0 = {}; Object.keys(b.names).forEach(function (k) { nm0[k] = sw(b.names[k]); }); b.names = nm0; }
      if (b.tos) { var t2 = {}; Object.keys(b.tos).forEach(function (k) { t2[k] = b.tos[k] === old ? p : b.tos[k]; }); b.tos = t2; }
      if (b.mate === old) b.mate = p;
      if (b.receiver === old) b.receiver = p;
      /* m1 (w1a and w1e made the same fix): the edge the result carries for
       * the man it was meant for ("arrives unmarked") follows the ball to the
       * new man; w0 left it with the old one, who did not have the ball */
      if (b.grants) {
        var g2 = {};
        Object.keys(b.grants).forEach(function (k) {
          g2[k] = (b.grants[k] || []).map(function (c) {
            if (!c || c.man !== old) return c;
            var c2 = {}; Object.keys(c).forEach(function (kk) { c2[kk] = c[kk]; }); c2.man = p; return c2;
          });
        });
        b.grants = g2;
      }
    }
    if (hadTo || !b.mate) b.to = p;
  }
  /* w0: hook 'outcome' requests, applied to the result lines. A request
   * that has no line to act on (a result that cannot happen here, an attack
   * that ends) changes nothing and is marked idle, so the card never lists
   * a change that is not there. */
  /* w0: the consequence helpers act on the result lines. w0b: also on
   * DEFENDING decisions (their attack) and for an opponent's component.
   * `info` is where the decision is: zoneMode (your attack), tMode (their
   * attack in a zone), box (their man in your box), flipOk (a ball you win
   * here may start your attack), tCapped. What each op means where:
   *
   *   your attack      as w0 (move: zones the ball goes; to: who has it;
   *                    edge: for your next decision; branch: an ending goes
   *                    on; extra: one more decision). An opponent's move and
   *                    to act the same way (they tax the route); an
   *                    opponent's edge is theirs, for the next decision;
   *                    their branch and extra mean nothing here (idle).
   *   their attack     move: on a result that wins you the ball, the zone
   *                    your attack starts in (0 to 2); on a result where
   *                    their attack goes on in a zone, the zones it moves
   *                    (-1 to 1). to: one of yours on a won ball starts your
   *                    attack; one of theirs where it goes on has the ball.
   *                    edge: yours, for your next decision (won ball or
   *                    their attack going on); theirs, for their next.
   *                    branch: yours turns a result that ends their attack
   *                    into a ball you win (only where a won ball may start
   *                    your attack, flipOk); theirs keeps their attack going
   *                    in the same zone. extra: yours, on a won ball, gives
   *                    the attack it starts one more decision.
   * Keeping their attack going or pushing it back counts against
   * LIMIT.PROLONG_MAX an attack. A change that cannot happen here is idle
   * (not on the card, not in the log). */
  function fxLines(R, outs, grants, info) {
    var G = FXL.GUARD, fx = R.fx;
    if (typeof info !== 'object') info = { zoneMode: !!info };
    var zoneMode = !!info.zoneMode, tMode = !!info.tMode, defending = !zoneMode && R.d.side === 'them';
    /* m4 from fix2 (items 1 and 2): one owner for a loose ball; Broken play rewrites the line it changes */
    function looseOwnerText(s, p) {
      var who = first(p);
      s = String(s || '');
      if (!who) return s;
      s = s.replace(/\s*[^.]+ gets to the loose ball first\./ig, '');
      s = s.replace(/,\s*and\s+[^.]+ gets to (?:the loose ball|it) first\./ig, '.');
      s = s.replace(/,\s*and\s+[^.]+ has the ball in their box\./ig, '.');
      s = s.replace(/\s+/g, ' ').replace(/\s+\./g, '.').replace(/\.\s*\./g, '.').replace(/^\s+|\s+$/g, '');
      if (s && !/[.!?]$/.test(s)) s += '.';
      return (s ? s + ' ' : '') + who + ' gets to the loose ball first.';
    }
    function brokenLooseText(s) {
      s = String(s || '');
      if (/runs through to their keeper/i.test(s)) {
        return s.replace(/\. The ball runs through to their keeper, and the attack is over\.$/i,
          ', but it is running through to their keeper, and then it breaks loose and your team is first to it.');
      }
      if (/catches the ball/i.test(s)) {
        return s.replace(/ leaves his line and catches the ball before ([^.]+?) can get to it, and the attack is over\.$/i,
          ' leaves his line and reaches the ball before $1, but it breaks loose and your team is first to it.');
      }
      if (/goes out of play|kicks it out of play|heads it out of play|blocked, out of play/i.test(s)) {
        s = s.replace(/, and (?:it|the ball) goes out of play\. The attack is over\.$/i, ', but it breaks loose and your team is first to it.');
        s = s.replace(/ and kicks it out of play\.?$/i, ', but it breaks loose and your team is first to it.');
        s = s.replace(/\. [^.]+ heads it out of play, and the attack is over\.$/i, ', but it breaks loose and your team is first to it.');
        return s;
      }
      /* m4: the verifier's patch (reviews/fix2-verify.md item 2): a header that goes wide is out of play too */
      if (/header goes wide, and the attack is over\.$/i.test(s)) return s.replace(/\. The header goes wide, and the attack is over\.$/i, '. The header is going wide, but it breaks loose and your team is first to it.');
      return s.replace(/,? and the attack is over\.$/, '.').replace(/\. The attack is over\.$/, '.');
    }
    function youWin(x) {
      if (x.effect === 'concede') return false;
      return !!x.win || (!tMode && typeof x.move === 'number');
    }
    function theyGoOn(x) {
      if (x.effect === 'concede' || x.win) return false;
      return typeof x.tmove === 'number' || !!x.into;
    }
    function ends(x) {
      return (x.effect === 'nothing' || x.effect === 'stopped') && !x.win && typeof x.tmove !== 'number' && typeof x.move !== 'number' && !x.into;
    }
    function prolongOk() { return !fx || fx.prolonged < FXL.LIMIT.PROLONG_MAX; }
    function ours(p) { return !!p && !!fx && fx.isOurs(p); }
    R.lineOps.forEach(function (op) {
      var did = false, them = op.side === 'them';
      outs.forEach(function (x) {
        if (x.band !== op.band) return;
        var say = true;
        if (!defending) {
          /* YOUR ATTACK (w0), plus the opponent's reading of it */
          var goesOn = typeof x.move === 'number' && x.effect !== 'goal';
          if (op.op === 'move') { if (!(G.move && zoneMode && goesOn)) return; x.move = op.n; }
          else if (op.op === 'to') {
            if (!(G.to && goesOn && op.p) || (them && !ours(op.p))) return;
            x.to = op.p;
            if (/loose ball falls to/i.test(op.rec.text || '')) {
              x.text = looseOwnerText(x.text, op.p);
              say = false;
            }
          }
          else if (op.op === 'edge') {
            if (!(G.edge && zoneMode && goesOn)) return;
            if (them) { if (!G.oppEdge) return; x.fxOppEdge = op.c; }
            else { grants[op.band] = (grants[op.band] || []).concat([op.c]); say = false; }
          }
          else if (op.op === 'branch') {
            if (them) return;
            if (!(G.branch && zoneMode && typeof x.move !== 'number' && x.effect === 'nothing')) return;
            var sp = op.spec || {};
            x.effect = sp.effect || 'ground'; x.move = sp.move || 0;
            if (sp.to) x.to = sp.to;
            delete x.end; delete x.caught;
            /* m4 from fix2 item 2, with the verifier's patch: when the rewrite already says it breaks loose, the component's sentence is not added again */
            if (sp.rewriteLoose) { var t0 = String(x.text); x.text = brokenLooseText(t0); if (x.text !== t0 && /breaks loose/.test(x.text)) say = false; }
            else x.text = String(x.text).replace(/,? and the attack is over\.$/, '.').replace(/\. The attack is over\.$/, '.');
          }
          else if (op.op === 'extra') { if (them || !(G.extra && zoneMode && goesOn)) return; x.fxExtra = op.rec.source; }
          /* m1 from w1b: a result that becomes a foul (effects.js q.foul); your components only */
          else if (op.op === 'foul') {
            var fd = R.d;
            if (them || !(G.foul && zoneMode && !fd.finishing && fd.foil && fd.actor && (fd.zone === 1 || fd.zone === 2) &&
              x.effect !== 'goal' && x.mode !== 'freekick' && !x.trip)) return;
            x.effect = 'ground'; x.move = 0; x.to = fd.actor; x.trip = fd.foil;
            if (fd.zone === 2) x.mode = 'freekick';
            delete x.end; delete x.caught; delete x.rebound;
            x.text = first(fd.foil) + ' brings ' + first(fd.actor) + ' down. ' + (fd.zone === 2 ? 'Free kick to your team at the edge of their box' :
              'Your team keeps the ball in midfield') + ', and ' + first(fd.foil) + ' gets a yellow card.';
            say = false;
            x.text += ' ' + op.rec.text.charAt(0).toUpperCase() + op.rec.text.slice(1);
          }
          else return;
        } else {
          /* w0b: A DEFENDING DECISION (their attack) */
          if (op.op === 'move') {
            if (!G.defMove || typeof op.n !== 'number') return;
            if (youWin(x) && x.win) { x.fxWinZone = Math.max(0, Math.min(2, Math.round(op.n))); }
            else if (youWin(x)) { x.move = Math.max(0, Math.min(2, Math.round(op.n))); }
            else if (tMode && typeof x.tmove === 'number' && !x.into) {
              var tm = Math.max(-1, Math.min(1, Math.round(op.n)));
              if (tm < 1 && !prolongOk()) return;
              if (typeof R.d.tzone === 'number' && R.d.tzone + tm < 0) return;
              x.tmove = tm; if (tm < 1) x.fxProlong = 1;
              if (tm < 1 && x.effect === 'break') x.effect = 'nothing';
            }
            else return;
          }
          /* m3 from fix1 (item 1): a foul that gives them a free kick where it was */
          else if (op.op === 'theirFreeKick') {
            if (!G.defMove || !tMode) return;
            x.tmove = typeof R.d.tzone === 'number' ? Math.max(1, 2 - R.d.tzone) : 1;
            x.via = 'freekick'; x.effect = 'nothing'; x.fxProlong = 1;
            delete x.win; delete x.end;
          }
          else if (op.op === 'to') {
            if (!G.defTo || !op.p) return;
            if (ours(op.p)) {
              if (!youWin(x) || !fx.onPitch(op.p)) return;
              if (x.win) x.fxTo = op.p; else x.to = op.p;
            } else {
              if (!theyGoOn(x) && !(typeof x.tmove === 'number')) return;
              if (!fx.onPitch(op.p)) return;
              x.theirTo = op.p; x.fxTheirTo = op.p;
            }
          }
          else if (op.op === 'edge') {
            if (!G.defEdge) return;
            if (them) {
              if (!G.oppEdge || !theyGoOn(x)) return;
              x.fxOppEdge = op.c;
            } else {
              if (!(youWin(x) || (tMode && theyGoOn(x)) || (x.into && !tMode))) return;
              grants[op.band] = (grants[op.band] || []).concat([op.c]); say = false;
            }
          }
          else if (op.op === 'branch') {
            if (!G.defBranch || !ends(x)) return;
            var sp2 = op.spec || {};
            if (them) {
              /* their attack goes on where it is */
              if (!tMode || !prolongOk()) return;
              x.tmove = 0; x.fxProlong = 1; x.effect = 'nothing';
              if (sp2.to && !ours(sp2.to)) { x.theirTo = sp2.to; x.fxTheirTo = sp2.to; }
              x.text = String(x.text).replace(/,? and their attack is over\.$/, '.').replace(/\. Their attack is over\.$/, '.');
            } else {
              if (!info.flipOk) return;
              var z = typeof sp2.move === 'number' ? Math.max(0, Math.min(2, sp2.move)) : 0;
              if (tMode) { x.win = true; x.fxWinZone = z; if (sp2.to && ours(sp2.to)) x.fxTo = sp2.to; }
              else { x.move = z; if (sp2.to && ours(sp2.to)) x.to = sp2.to; }
              x.effect = 'stopped';
              delete x.end; delete x.caught;
            }
          }
          else if (op.op === 'extra') {
            if (them || !G.defExtra || !youWin(x)) return;
            x.fxExtra = op.rec.source;
          }
          else return;
        }
        did = true;
        if (say) x.text = String(x.text).replace(/\s*$/, '') + ' ' + op.rec.text.charAt(0).toUpperCase() + op.rec.text.slice(1);
      });
      if (!did) op.rec.idle = true;
    });
  }

  /* w0: "Your build: ..." on the card. w0b: an opponent's records follow
   * as "Their build: ...", the engine's own (their tired line) as they are */
  function fxNoteOf(recs) {
    var you = recs.filter(function (r) { return (r.side || 'you') === 'you'; }), them = recs.filter(function (r) { return r.side === 'them' && !r.system; }),
      sys = recs.filter(function (r) { return r.system; });
    var out = [];
    if (you.length) out.push('Your build: ' + you.map(function (r) { return r.line; }).join(' '));
    if (them.length) out.push('Their build: ' + them.map(function (r) { return r.line; }).join(' '));
    if (sys.length) out.push(sys.map(function (r) { return r.line; }).join(' '));
    return out.join(' ');
  }

  function offer1(ctx, howMany) {
    /* Four, not three. With three, rule 1 took a slot and rule 2 took the
     * other two, so the safe option was crowded out of every single moment
     * and every menu was three gambles. A choice between three gambles is a
     * dice roll wearing a menu. */
    /* g1: every live option is ranked by e2's rules below, then pickSpread
     * keeps MENU_LIVE of them */
    var want = Math.min(howMany || MENU_LIVE, MENU_LIVE);
    howMany = 99;
    var built = [];
    /* ZONES (a1): your decisions happen in a zone, and the zone decides the
     * menu. Options with `zones` exist only there; of the older attacking
     * options only the clock, the substitution and the late gambles stay. */
    var zoneMode = ctx.zone !== undefined && ctx.zone !== null && ctx.sit.who === 'you';
    var finishing = !!(ctx.state && ctx.state.finishOnly);
    var tMode = typeof ctx.tzone === 'number';
    var tCapped = !!(ctx.state && ctx.state.tCapped);
    var mode = zoneMode ? (ctx.mode || null) : null;
    var theirSide = ctx.sit.who === 'them';
    /* e1: THE STATE OF PLAY (match.js play). Whether the ball is in the air
     * decides whether anyone can head it: a header is never offered for a
     * ball on the ground (the a3 review). */
    var play = ctx.play || null;
    /* e1: the first decision of their keyword moment (their Dribbler at the
     * edge of your box, their Playmaker in midfield): only the options made
     * for it, and your keywords that answer it */
    var ownThreat = tMode && !!ctx.threatOwn;
    var rebounded = !!(ctx.state && ctx.state.rebounded);
    /* w0: the build's effects runtime, if any; a component's own options
     * join the pool and go through everything below like any other */
    var fx = FXL && ctx.state && ctx.state.fx && !ctx.state.fx.suspended ? ctx.state.fx : null;
    if (fx) fx.removed = [];
    (fx && FXL.GUARD.pool ? POOL.concat(fx.poolEntries()) : POOL).forEach(function (o) {
      /* your box (a3): only the last-ditch options, and only there */
      if (!!o.box !== !!ctx.boxStep) return;
      if (o.tsit) {
        if (!ownThreat || o.tsit !== ctx.threatSit) return;
      } else if (ownThreat && !o.answer && !(o.counterPress && ctx.counter)) {
        return;
      } else if (o.tzones) {
        if (!tMode || o.tzones.indexOf(ctx.tzone) < 0) return;
      } else if (tMode) {
        if (!T_OLD[o.id] || ctx.tzone !== 1 || !ctx.firstStep) return;
        if (o.id === 'HEAD_CLEAR' && ['over_the_top', 'siege'].indexOf(ctx.sit.id) < 0) return;
      }
      if (GUARD.air && o.air && play && !play.air) return;
      /* and a tackle, a block or showing him wide needs a man with the ball */
      if (GUARD.air && o.ground && play && play.air) return;
      if (o.zones) {
        if (!zoneMode) return;
        var zs = o.zones.concat(finishing && o.lastZones ? o.lastZones : []);
        if (zs.indexOf(ctx.zone) < 0) return;
        /* e1 (from d1): the free kick offers its own options, and a few
         * ordinary ones marked inModes */
        if (o.modes) { if (!mode || o.modes.indexOf(mode) < 0) return; }
        else if (mode && !ADDITIVE[mode] && !(o.inModes && o.inModes.indexOf(mode) >= 0)) return;
      } else if (zoneMode && mode && !ADDITIVE[mode]) {
        return;
      } else if (zoneMode && o.side !== 'them') {
        if (!ZONE_ANY[o.id]) return;
        /* the plain "keep it and start again" is how an attack at the cap ends */
        if (o.id === 'HOLD' && !finishing) return;
        /* the late all-out gambles only make sense near their goal */
        if ((o.id === 'THROW_EVERYONE' || o.id === 'KEEPER_UP') && ctx.zone < 2) return;
      }
      if (o.side === 'you' && ctx.sit.who !== 'you') return;
      /* KEEPER_BALL: when your keeper holds it, only keeper actions exist */
      if ((ctx.sit.id === 'keeper_to_feet') !== !!o.keeperBall) return;
      if (o.side === 'them' && ctx.sit.who !== 'them') return;
      var ok = false;
      try { ok = o.when(ctx); } catch (e) { ok = false; }
      if (!ok) return;
      var b = o.build(ctx);
      if (!b || !b.label) return;
      /* In a follow-up the attack has to end: no second switch, so a play
       * cannot chain forever. */
      if (ctx.state && ctx.state.finishOnly && b.pays === 'ground') return;
      /* at the cap nothing may carry the attack on (see match.js ZONE_CAP) */
      if (zoneMode && finishing && CONTINUES[b.pays]) return;
      /* your keeper under pressure: in zone play a pass that comes off is
       * the start of your attack, in your half */
      if (tMode) {
        if (o.id === 'HEAD_CLEAR') b.pays = 'tclear';
        /* a4: a touch that does not clear it leaves him going into your box
         * with your keeper out of his goal */
        if (o.id === 'KEEPER_SWEEPS') {
          b.pays = 'tsweep'; b.via = 'open';
          b.theirGrant = { amount: 1, why: 'your keeper is out of his goal',
            text: 'Your keeper is out of his goal: +1 to ' + first(ctx.foil) };
        }
      }
      else if (ctx.zoneEscape && b.to && (o.id === 'KEEPER_SHORT' || o.id === 'KEEPER_WIDE' || b.escapes)) b.pays = 'escape';
      /* and a clean stop by an outfield man, on the first decision of their
       * attack, wins you the ball there */
      else if (ctx.winBack && b.pays === 'stop' && !b.table && b.test && b.test.mine && typeof b.test.mine.line === 'number') {
        b.pays = 'winback'; b.to = b.test.mine;
      }
      /* their attack comes up the pitch (a3): a stop that half works, or a
       * lost duel, is not the end: their man is in your box */
      if (!tMode && ctx.zoneEscape && !ctx.boxStep && b.twoStep && ctx.sit.id !== 'keeper_to_feet') {
        if (b.pays === 'stop') b.pays = 'press2';
        else if (b.pays === 'winback') b.pays = 'winback2';
      }
      /* w0: THE EFFECTS LAYER, per option. One record for this option; the
       * hooks run in a fixed order (tags, option, stat, duel here; cost and
       * outcome where those are made below) and every change a component
       * makes is a named record on it. */
      var fxr = null;
      if (fx) {
        var t0 = b.test || {};
        fxr = fx.option({ id: o.id, side: ctx.sit.who, zone: zoneMode ? ctx.zone : null, tzone: tMode ? ctx.tzone : null,
          mode: mode, finishing: finishing,   /* m1 from w1b */
          pays: b.pays, sit: ctx.sit, actor: t0.mine || null, foil: t0.theirs || null,
          /* m1 from w1e: a pull-back or ball across the goal names its man as b.mate (never a shot's rebound man) */
          to: b.to || (b.mate && !b.shooter && ['pullback', 'square'].indexOf(b.pays) >= 0 ? b.mate : null) || null,
          /* m1 from w1e: the man on the ball on your attack, not always the option's actor */
          carrier: zoneMode ? (ctx.actor || null) : null,
          mineAttr: t0.mineAttr || null, theirsAttr: t0.theirsAttr || null,
          tags: o.fxSource ? o.fxTags.slice() : FXL.tagsFor(o.id, t0.mineAttr, b.pays, mode) });
        if (o.fxSource) {
          fxr.records.push({ source: o.fxSource, field: 'create', text: o.fxText.replace(/\.?$/, '.'), line: o.fxSource + ': ' + o.fxText.replace(/\.?$/, '.') });
          b.fxCreated = o.fxSource;
        }
        fx.hook('tags', fxr);
        if (!FXL.GUARD.tags) fxr.tags = FXL.tagsFor(o.id, t0.mineAttr, b.pays, mode);
        fx.hook('option', fxr);
        if (fxr.removedBy && FXL.GUARD.option) { fx.removed.push({ id: o.id, actor: t0.mine || null, foil: t0.theirs || null, source: fxr.removedBy.source, text: fxr.removedBy.text }); return; }
        if (fxr.to !== undefined && FXL.GUARD.option) retarget(b, fxr.to, ctx.legs);
        fx.hook('stat', fxr);
        fx.hook('duel', fxr);
        /* m3: the payoff switch (off by default; effects.js PAYOFF): a setup
         * card a piece of yours created counts a half win as a clean win in
         * your attack, named on that piece */
        if (FXL.payoffOn && FXL.payoffOn() && o.fxSource && ctx.sit.who === 'you' && zoneMode && FXL.GUARD.tier && !fxr.tier.mixed) {
          var pInst = fx.inst.filter(function (ii) { return ii.name === o.fxSource; })[0];
          if (pInst) {
            fxr.tier.mixed = 'good';
            fxr.rec({ name: pInst.name, i: pInst.i, k: 'payoff', side: 'you' }, 'tier', 'a setup card: a half win counts as a clean win', { band: 'mixed' });
          }
        }
        /* w0b: their tired line and their edges (effects.js oppParts) */
        fx.oppParts(fxr, function (p, a, lg) { return value(p, a, lg); });
      }
      /* other named men in the endings ({mate}, {pm}, {tgt}, {trip}, {keeper}) */
      var names = b.names ? Object.assign({}, b.names) : {};
      if (theirSide && ctx.squad.keeper && !names.keeper) names.keeper = first(ctx.squad.keeper);
      var places = { more: names, mate: b.mate ? first(b.mate) : (names.mate || null) };
      /* (g1: and your keeper catching their header, which starts your attack
       * in midfield: "your team has the ball ." had no place) */
      if (zoneMode || b.pays === 'escape' || b.pays === 'escape1' || b.pays === 'winback' || b.pays === 'winback2' || /hold$/.test(b.pays) || b.pays === 'keepcatch') {
        var z0 = zoneMode ? ctx.zone : 0;
        var cq = b.table || (R.CONSEQUENCE[ctx.sit.who] && R.CONSEQUENCE[ctx.sit.who][b.pays]);
        var mv = cq && cq.move && typeof cq.move.good === 'number' ? cq.move.good : 0;
        places.here = ZONE_AT[z0]; places.to = ZONE_AT[Math.max(0, Math.min(3, z0 + mv))];
      }
      if (tMode) {
        /* e1: the man the sentence says was beaten is the man who tried */
        var who0 = b.test && b.test.mine && typeof b.test.mine.line === 'number' ? b.test.mine : ctx.actor;
        var fn0 = first(ctx.foil), an0 = first(who0);
        places.here = T_AT[ctx.tzone]; places.to = typeof b.winZone === 'number' ? ZONE_AT[b.winZone] : '';
        places.back = fn0 + ' has to pass it back ' + (ctx.tzone === 0 ? 'into their own half' : 'into midfield') + ', and their attack is over.';
        places.fwd2 = b.fwd2 || (fn0 + ' gets to the edge of your box.');
        /* g1: a winger who gets past your man crosses it (the headline
         * after it says so, and the next decision is the cross) */
        places.fwd = b.fwd || ('gets past ' + an0 + (ctx.tzone === 0 ? ', to the edge of your box.'
          : ctx.via === 'cross' && !b.via && !(b.vias && b.vias.bad) ? ' and is going to cross it into your box.' : ', into your box.'));
      }
      if (ctx.boxStep && b.fwd2) places.fwd2 = b.fwd2;
      /* The structured half of an option. The manager reads the sentence; the
       * machine reads this. */
      var t = b.test || {};
      var mineV = t.mine ? value(t.mine, t.mineAttr, x_legsFor(ctx, t)) : null;
      var themV = t.theirs ? value(t.theirs, t.theirsAttr, 100) : null;
      var edge = (mineV !== null && themV !== null) ? mineV - themV : null;
      var risk = b.risk || (o.family === 'hold' ? 'low' : o.family === 'last' ? 'high' : 'even');

      /* A "safe" option that resolves on the same even check as a gamble is
       * not safe, it is a gamble with calmer words. So the low-risk options
       * carry a bonus, and the bonus is printed with its reason. */
      var bonus = b.bonus !== undefined ? b.bonus : (risk === 'low' ? (theirSide ? SAFE_DEF : SAFE_ATT) : 0);
      var mods = bonus ? [{ n: bonus, why: b.because || 'this is the safe option' }] : [];
      /* g2: a second named part the option itself carries */
      if (b.parts) b.parts.forEach(function (m) { if (m.n) mods.push({ n: m.n, why: m.why }); });
      var uses = [];
      /* e1: EDGES DO NOT STACK. Of everything that helps this option from
       * before (what the last decision won, a booked man in front of him, a
       * goal he scored), only the biggest counts; what hurts it (a missed
       * chance, his own yellow card) always counts. Stacked +2s made 97
       * percent options next to 28 percent ones (the a3 review). */
      var ups = [], downs = [];
      if ((zoneMode || ctx.boxStep || tMode) && ctx.carried && mineV !== null) {
        var probeO = { id: o.id, actor: t.mine, foil: t.theirs, tags: fxr ? fxr.tags : (FXL ? FXL.tagsFor(o.id, t.mineAttr, b.pays, mode) : []) };
        ctx.carried.forEach(function (c) {
          var d = CARRY[c.id];
          if (d && d.applies(c, probeO, ctx)) {
            /* g1: named by its reason, so the card and the sum on the result
             * banner use the same words */
            var wy = d.why(c);
            ups.push({ n: amountOf(d, c), why: wy, name: wy.charAt(0).toUpperCase() + wy.slice(1) });
          }
        });
        if (b.usesCarry) uses.push({ name: b.usesCarry.split(':')[0], n: null });
      }
      if (mineV !== null) carryOver(ctx, t, b.pays).forEach(function (c) {
        if (c.n > 0) ups.push({ n: c.n, why: c.why, name: c.text, text: c.text, form: c.form });
        else downs.push(c);
      });
      var top = null;
      ups.forEach(function (u) { if (!top || u.n > top.n) top = u; });
      /* w0: an effect may let carried edges add up (hook 'stat', stackEdges) */
      if (!GUARD.stack || (fxr && fxr.stack && FXL.GUARD.stat)) ups.forEach(function (u) { if (u !== top) { mods.push({ n: u.n, why: u.why }); uses.push({ name: u.name, n: u.n, text: u.text || null, why: u.why }); } });
      if (top) { mods.push({ n: top.n, why: top.why }); uses.push({ name: top.name, n: top.n, text: top.text || null, why: top.why }); }
      var formUse = !!(top && top.form);
      downs.forEach(function (d) {
        mods.push({ n: d.n, why: d.why }); uses.push({ name: d.text, n: d.n, text: d.text, why: d.why });
        if (d.form) formUse = true;
      });
      /* COUNTERPLAY (f1/f2, match.js counterFor): what the opponent has
       * learned about what you keep doing. Your attacks only; parts are
       * named like every other bonus, and the card says each one. */
      var cplay = { mine: [], theirs: [], notes: [] };
      if (zoneMode && ctx.state && typeof ctx.state.counterplay === 'function' && mineV !== null && themV !== null) {
        cplay = ctx.state.counterplay({ id: o.id, actor: t.mine, foil: t.theirs, to: b.to || null, pays: b.pays, tags: fxr ? fxr.tags : null });
        if (fxr && cplay.fx) fxr.records = fxr.records.concat(cplay.fx);
        cplay.mine.forEach(function (m) { mods.push({ n: m.n, why: m.why, cp: true }); });
      }
      /* w0: named parts from the build (hook 'stat') */
      if (fxr && FXL.GUARD.stat && mineV !== null) fxr.mine.forEach(function (m) { mods.push({ n: m.n, why: m.why, fx: true }); });
      /* m5: on an option with no duel (everyone drops back, a sure pass) a stat change has
       * nothing to change, so its record is idle and the card shows no chip for it (the
       * play between moments, on by default now, reaches their counter with Sit deep in
       * play, and buildviewcheck N1 caught a "+1" chip on a card with no dice) */
      if (fxr && mineV === null) fxr.records.forEach(function (r) { if (r.field === 'stat') r.idle = true; });
      bonus = mods.reduce(function (a, m) { return a + m.n; }, 0);
      if (bonus && mineV !== null) { mineV += bonus; edge = mineV - themV; }
      /* and what THEY carry: losing the ball going forward gives their
       * counter an edge (a2) */
      var theirMods = [];
      if (fxr && FXL.GUARD.stat && themV !== null && mineV !== null) fxr.theirs.forEach(function (m) {
        theirMods.push({ n: m.n, why: m.why, fx: true }); themV += m.n; edge = mineV - themV;
      });
      var tcs = ctx.theirCarried || (ctx.theirCarry ? [ctx.theirCarry] : []);
      if (!zoneMode && ctx.sit.who === 'them' && tcs.length && themV !== null) {
        /* e1: their edges do not stack either */
        var ttop = null;
        tcs.forEach(function (tc) {
          /* a4: a man left behind helps them against your defenders, not
           * against your keeper, who faces the same shot either way */
          if (tc.outfield && t.mine && t.mine === ctx.squad.keeper) return;
          if (!ttop || tc.amount > ttop.amount) ttop = tc;
        });
        if (ttop) { theirMods.push({ n: ttop.amount, why: ttop.why, carried: true }); themV += ttop.amount; }
        edge = mineV - themV;
      }
      /* g1: THEIR SHOT FROM INSIDE YOUR BOX IS CLOSE TO GOAL TOO. Your shot
       * in their box has +3 ("he is inside the box, close to goal"); theirs
       * had nothing, and your keeper +2. Now the man shooting in your box
       * has the same kind of part, named on the card. */
      if (THEIR_CLOSE && ctx.boxStep && theirSide && themV !== null && t.theirs && t.theirs === ctx.foil &&
          (ctx.via === 'box' || ctx.via === 'alone' || ctx.via === 'open') && (t.theirsAttr === 'finishing' || t.theirsAttr === 'technique')) {
        theirMods.push({ n: THEIR_CLOSE, why: first(t.theirs) + ' is inside your box, close to goal' });
        themV += THEIR_CLOSE; edge = mineV - themV;
      }
      /* g1: AND NO SHOT OF THEIRS IS A SURE GOAL either: your keeper
       * facing a shot in your box always keeps at least one chance in 6 of
       * getting a hand to it (their goal needs only to beat him, yours to
       * beat him by 4, so the cap is a margin of 3 here and 6 there) */
      if (GUARD.sureGoal && THEIR_CAP !== null && ctx.boxStep && theirSide && t.mine && (t.mine === ctx.squad.keeper || GUARD.blockFloor) && t.theirs === ctx.foil &&
          mineV !== null && themV !== null && mineV - themV < -THEIR_CAP && (t.theirsAttr === 'finishing' || t.theirsAttr === 'technique')) {
        var kUp = themV - mineV - THEIR_CAP;
        /* g2: and so can a defender throwing himself in front of it with your
         * keeper out of his goal (round 3 review: menus where every choice
         * conceded 100 times in 100) */
        mods.push({ n: kUp, why: t.mine === ctx.squad.keeper ? first(t.mine) + ' can always get a hand to at least one shot in ' + Math.round(1 / (1 - R.odds(-THEIR_CAP).bad))
          : first(t.mine) + ' always has at least one chance in ' + Math.round(1 / (1 - R.odds(-THEIR_CAP).bad)) + ' to get something on it' });
        mineV += kUp; bonus += kUp; edge = mineV - themV;
      }
      if (cplay.theirs.length) {
        cplay.theirs.forEach(function (m) { theirMods.push({ n: m.n, why: m.why, cp: true }); themV += m.n; });
        edge = mineV - themV;
      }
      /* call: YOUR KEEPER WITH THE BALL ALWAYS HAS ONE SAFE WAY OUT (round 4
       * review: every option conceded 15 times in 100 or more in 37 of 42 of
       * these scenes). Kicking it out of play only has to find the
       * touchline, so it goes wrong at most 3 times in 36: the same kind of
       * named floor as the keeper's 1 in 4 against a shot. */
      if (GUARD.keeperOut && b.keeperOutFloor && mineV !== null && themV !== null && mineV - themV < 3) {
        var koUp = 3 - (mineV - themV);
        mods.push({ n: koUp, why: first(t.mine) + ' can always find the touchline: it goes wrong at most 3 times in 36' });
        mineV += koUp; bonus += koUp; edge = mineV - themV;
      }

      /* g1: NO SHOT OF YOURS IS A SURE GOAL. With one die each side a stat
       * gap of 9 scores every time (the review counted 45 certain goals in
       * 200 matches), and elite finishers in the box scored 9 times in 10.
       * Their keeper always keeps at least one chance in 6 (SHOT_CAP), as a
       * named part on the card. Sized with the finals (g1 node.json).
       * (Whether the dice should be softer is Eduardo's call: DECISIONS 15.) */
      /* (a pull-back or a ball across the goal scores on a half-good pass
       * too, so for those the same one chance is kept at a margin of 4) */
      var capAt = GOAL_PAYS[b.pays] ? PASS_CAP : b.pays === 'placed' && PLACE_CAP !== null ? PLACE_CAP : SHOT_CAP;
      if (GUARD.sureGoal && zoneMode && (SHOT_PAYS[b.pays] || GOAL_PAYS[b.pays] || b.pays === 'goal') && t.theirs && edge !== null && edge > capAt) {
        var keepN = edge - capAt;
        var capOdds = R.odds(capAt), inN = Math.round(1 / (GOAL_PAYS[b.pays] ? capOdds.bad : 1 - capOdds.good));
        theirMods.push({ n: keepN, why: t.theirs === ctx.opp.keeper ? first(t.theirs) + ' can always get a hand to at least one shot in ' + inN
          : first(t.theirs) + ' always has at least one chance in ' + inN + ' to get something on it' });
        themV += keepN; edge = mineV - themV;
      }
      /* His note: an option he cannot do "should still show, but greyed out
       * and uninteractive". So it is built, marked dead, and shown last. */
      /* w0: a build may change the roll itself (hook 'duel'): the card's odds
       * are counted from the same rule match.js rolls with */
      var duelRule = fxr && t.mine && t.theirs ? fxr.duelRule() : null;
      var ch = duelRule ? FXL.odds(edge === null ? 0 : edge, duelRule, R) : R.odds(edge === null ? 0 : edge);
      /* no duel at all (a4 T_RETREAT): it simply happens */
      if (!t.mine) ch = { good: 1, mixed: 0, bad: 0, certain: true, impossible: false, margin: 0 };
      var dead = ch.impossible && !GENERIC[o.id];
      var mineLegs = x_legsFor(ctx, t);
      var actorName = t.mine ? first(t.mine) : null;
      var foilName = t.theirs ? first(t.theirs) : null;

      var cost = costOf(t, risk, b.pays);
      /* w0: hook 'cost' (stamina, and a decision that does not use one up) */
      var fxFree = false;
      if (fxr) {
        fx.hook('cost', fxr);
        var cost0 = cost ? cost.amount : 0;
        if (fxr.costDelta && FXL.GUARD.cost) {
          var cline = cost ? cost.line : (t.mine && typeof t.mine.line === 'number' ? LINE_KEY[t.mine.line] : null);
          var camt = Math.max(0, (cost ? cost.amount : 0) + fxr.costDelta);
          cost = cline && camt ? { line: cline, amount: camt, run: !!(cost && cost.run), fx: true } : null;
        }
        if ((cost ? cost.amount : 0) === cost0) fxr.records.forEach(function (r) { if (r.field === 'cost') r.idle = true; });
        fxFree = !!(fxr.free && FXL.GUARD.free && zoneMode);
        if (fxr.free && !fxFree) fxr.free.idle = true;
      }
      var outs = R.outcomes(ctx.sit.who, b.pays, actorName, foilName, b.does, ch, places, { table: b.table || null });
      if (b.fixedText) outs.forEach(function (x) { x.text = b.fixedText; });
      function verbOf(band) { return R.fill((b.does && b.does[band]) || 'tries it', actorName, foilName, places); }
      if (tMode) outs.forEach(function (x) {
        /* a half-stop at the edge of your box, on the first decision of
         * their attack, pushes them back into midfield and their attack goes
         * on there (match.js T_CAP) */
        if (b.pays === 'twin' && x.band === 'mixed' && ctx.tzone === 1 && !tCapped) {
          x.tmove = -1; x.effect = 'nothing';
          x.text = x.text.replace(/, and their attack is over\.$/, '. Their attack goes on in midfield.');
        }
        /* winning it back on their counter ends it: no attack of yours
         * starts inside it (so an event cannot bounce back and forth). e1:
         * except for your Ball winner or pressing pair, whose whole point is
         * winning it straight back (b.counterWin) */
        if (x.win && !ctx.flipOk && !b.counterWin) {
          x.win = false;
          x.text = (actorName + ' ' + b.does.good).replace(/\{foil\}/g, foilName) + '. Their attack is over.';
        }
      });
      /* e1: per-outcome state of play. Who has the ball after each result,
       * so the next sentence cannot give it to someone else (the a3 review:
       * a failed forward pass handed the ball to a different player in 22 of
       * 30); and how their attack reaches your box. */
      outs.forEach(function (x) {
        if (b.tos && b.tos[x.band]) x.to = b.tos[x.band];
        /* a forward pass that does not get through: the ball stays with the
         * man who tried it, not the man it was aimed at */
        else if (GUARD.passer && zoneMode && x.move === 0 && (b.pays === 'probe' || b.pays === 'dribble2e') && t.mine) x.to = t.mine;
        if (b.modes && b.modes[x.band] && !finishing) x.mode = b.modes[x.band];
        if (b.vias && b.vias[x.band]) x.via = b.vias[x.band];
        if (b.trip && x.mode === 'freekick') x.trip = b.trip;
      });
      var unlock = b.unlock || null;
      var unlockNote = unlock ? 'Unlocked by ' + unlock.replace(/: (.*)$/, ' ($1)') + '.' : null;
      /* one of your keywords answering one of theirs says so */
      if (b.counter && unlockNote) unlockNote += ' Your answer to ' + b.counter.replace(/: (.*)$/, ' ($1)') + '.';
      var threatNotes = [], threatIds = [];
      if (theirSide && KWL) {
        /* THEIR FREE-KICK TAKER: a foul near your box is a free kick he
         * shoots; without one, it is crossed in */
        var fk = theirKw(ctx, 'FREEKICK', 'technique'), fkUsed = false;
        outs.forEach(function (x) {
          if ((x.via || null) !== 'freekick') return;
          if (fk) { x.theirTo = fk; fkUsed = true; }
          else x.via = 'fkcross';
        });
        if (fkUsed) {
          threatNotes.push(KWL.because(fk, 'FREEKICK') + ', a foul here gives ' + first(fk) + ' a shot at goal.');
          threatIds.push(KWL.unlockName(fk, 'FREEKICK'));
        }
        /* THEIR ONE-TWO PAIR: a second man sent at the Dribbler leaves the
         * Playmaker free to give the ball back */
        if (o.pairTwist && ctx.th && ctx.th.pair) {
          var tpr = ctx.th.pair, pa = first(tpr.a), pb = first(tpr.b);
          outs.forEach(function (x) {
            if (x.band !== 'bad') return;
            x.text = actorName + ' ' + verbOf(x.band) + '. ' + pb + ' passes to ' + pa + ', who is free because ' + actorName +
              ' came across, and ' + pa + ' passes it straight back. ' + pb + ' is through on your goal.';
          });
          threatNotes.push('Because ' + pa + ' and ' + pb + ' play one-twos, sending a second man at ' + pb + ' leaves ' + pa + ' free.');
          threatIds.push(KWL.pairName(tpr));
        }
        /* THEIR POACHER: a shot your keeper pushes out runs loose, and he is
         * first to it; without him it goes out for a corner */
        var tpq = !(ctx.state && ctx.state.bounced) ? theirKw(ctx, 'POACHER', 'finishing') : null;
        if (tpq) {
          var pqUsed = false;
          outs.forEach(function (x) {
            if (!x.shotBand) return;
            pqUsed = true;
            x.via = 'box'; x.theirTo = tpq;
            x.text = x.text.replace(/\. The ball goes out for their corner\.$/, '. ' + first(tpq) + ' gets to the ball first, in your box.');
          });
          if (pqUsed) {
            threatNotes.push(KWL.because(tpq, 'POACHER') + ', a ball your keeper pushes out drops to ' + first(tpq) + '.');
            threatIds.push(KWL.unlockName(tpq, 'POACHER'));
          }
        }
        if (b.poacherNote) { threatNotes.push(b.poacherNote); threatIds.push(b.poacherId); }
      }
      /* THEIR CROSS CATCHER takes the high balls your man does not win
       * cleanly, and the attack is over */
      var ck = !theirSide && o.high && kwOn(ctx.opp.keeper, 'CATCHER') ? ctx.opp.keeper : null;
      if (ck) {
        outs.forEach(function (x) {
          if (x.band !== 'mixed') return;
          x.effect = 'nothing'; x.caught = true; x.end = 'caught';
          delete x.move; delete x.to; delete x.mode;
          x.text = first(ck) + ' leaves his line and catches the ball before ' + actorName + ' can get to it, and the attack is over.';
        });
        threatNotes.push(KWL.because(ck, 'CATCHER') + ', a high ball your player does not win cleanly is caught.');
        threatIds.push(KWL.unlockName(ck, 'CATCHER'));
      }
      /* YOUR POACHER: their keeper's save becomes a loose ball he reaches
       * first, and the same attack goes on in their box (+2, their keeper
       * is on the ground). Not on the last decision of an attack, and not
       * on the rebound itself. */
      var rebGrant = null;
      if (zoneMode && KWL && !finishing && !rebounded) {
        var po = bestOf(KWL.holders(ctx.squad, 'POACHER'), 'finishing', ctx.legs, t.mine);
        if (po && SAVED[o.id]) {
          outs.forEach(function (x) {
            if (x.band !== 'mixed' || x.effect !== 'nothing' || x.caught) return;
            x.effect = 'ground'; x.move = 3 - ctx.zone; x.to = po; x.rebound = true; delete x.end;
            x.text = x.text.replace(/, and the attack is over\.$/, ', but cannot hold it.') + ' ' + first(po) + ' gets to the loose ball first.';
          });
          rebGrant = { mixed: [{ id: 'loose', man: po }] };
        }
        if (po && (SAVED[o.id] || (o.id === 'Z_SHOOT' && b.pays === 'shotreb'))) {
          unlockNote = (unlockNote ? unlockNote + ' ' : '') + first(po) + ' (Poacher) adds a second chance: if their keeper pushes it out, ' +
            first(po) + ' gets to it first (+2).';
        }
      }
      outs.forEach(function (x) { if (b.pays === 'shotreb' && x.band === 'mixed') x.rebound = true; });
      /* e1: EVERY EDGE A RESULT CARRIES IS DECLARED HERE, and said on the
       * card before the choice (Eduardo: a pass wide that quietly won +2 next
       * to one that did not looked like the same option). a5 added three of
       * these in match.js, out of sight. */
      var grants = {};
      [b.grants, rebGrant].forEach(function (gs) {
        if (!gs) return;
        Object.keys(gs).forEach(function (band) { grants[band] = (grants[band] || []).concat(gs[band]); });
      });
      if (zoneMode && { advance: 1, probe: 1, through: 1 }[b.pays] && t.theirs && typeof t.theirs.line === 'number' &&
          !(grants.good || []).some(function (c) { return c.id === 'beaten' && c.man === t.theirs; })) {
        grants.good = (grants.good || []).concat([{ id: 'beaten', man: t.theirs }]);
      }
      if (/^winback/.test(b.pays)) grants.good = (grants.good || []).concat([{ id: 'upfield' }]);
      if (/hold$/.test(b.pays) && !zoneMode) grants.good = (grants.good || []).concat([{ id: 'caught' }]);
      /* w0: hook 'outcome': the consequences of each result */
      if (fxr) {
        fxr.lines = outs;
        fx.hook('outcome', fxr);
        fxLines(fxr, outs, grants, { zoneMode: zoneMode, tMode: tMode, box: !!ctx.boxStep, flipOk: !!ctx.flipOk, tCapped: tCapped });
      }
      /* said on the very line of the result that carries it ("Then: ..."),
       * so a save that drops to your Poacher says so where the save is
       * listed (said once: the read above it was already long) */
      var saysEdge = [];
      if (GUARD.say) outs.forEach(function (x) {
        var gl = (grants[x.band] || []).filter(function (c) { return CARRY[c.id]; });
        if (!gl.length || x.effect === 'goal' || x.effect === 'concede' || x.effect === 'break' || x.caught) return;
        x.edgeNote = 'Then, for you next: ' + gl.map(function (c) { return edgeWords(c); }).join('; ') + '.';
        saysEdge.push(x.band);
      });
      if (!Object.keys(grants).length) grants = null;
      var check = (t.mine && t.theirs)
        ? R.explain(actorName, statOf(t.mineAttr), value(t.mine, t.mineAttr, mineLegs),
            foilName, statOf(t.theirsAttr), value(t.theirs, t.theirsAttr, 100),
            { mineWork: working(t.mine, t.mineAttr, mineLegs),
              theirWork: working(t.theirs, t.theirsAttr, 100),
              bonus: bonus, because: b.because, mods: mods, theirMods: theirMods })
        : 'No check: this one always happens.';
      /* what they get if your man loses this duel (a4) */
      var tGrant = null;
      /* call3: the man left behind is the man who tried (Eduardo's screen:
       * "Rodri gets to Mac Allister too late" then "Olmo was left behind") */
      var behind = GUARD.leftBehind && t.mine && typeof t.mine.line === 'number' ? t.mine : ctx.actor;
      if (tMode) tGrant = b.theirGrant !== undefined ? b.theirGrant : { amount: T_EDGE, why: first(behind) + ' was left behind', outfield: true,
        text: first(behind) + ' was left behind: +' + T_EDGE + ' to ' + first(b.theirTo || ctx.foil) + ' against your defenders (not your keeper)' };
      /* g1 (from p2): TWO LINES THAT END THE SAME WAY ARE ONE LINE. The
       * review counted 1879 cards with two results that end identically
       * ("Baena goes past Montiel into the box and your team has the ball in
       * their box" next to "Baena gets half a yard on Montiel, and your team
       * has the ball in their box"). When everything that follows is the
       * same (the ball, the man, the zone, the edge carried), the cleaner
       * sentence stays, the chances add up, and `bands` says which dice
       * results it covers (match.js picks the line by band). When only the
       * edge differs, the line without it says so. */
      if (GUARD.merge) {
        var sameKey = function (x) {
          return [x.effect, x.move, x.tmove, !!x.win, x.via, x.into, x.mode, x.to && x.to.id, !!x.rebound, !!x.caught,
            x.trip && x.trip.id, x.theirTo && x.theirTo.id, x.edgeNote || '', x.fxExtra || '',
            /* w0b: what the build did to a defending result */
            x.fxWinZone === undefined ? '' : x.fxWinZone, x.fxTo ? x.fxTo.id : '', x.fxOppEdge ? x.fxOppEdge.source + x.fxOppEdge.n : '', x.fxProlong || '',
            JSON.stringify(((grants && grants[x.band]) || []).map(function (c) { return c.id + (c.man ? c.man.id : ''); }))].join('|');
        };
        var merged = [];
        outs.forEach(function (x) {
          var k = sameKey(x), same = merged.filter(function (y) { return y._k === k; })[0];
          if (!same) { x._k = k; x.bands = [x.band]; merged.push(x); return; }
          /* call: in a duel in the air, the merged line says what the more
           * likely result says (round 4 review: "Romero 30 against Laporte
           * 35" and then "Romero gets his head to the cross first" 100 times
           * in 100, because Laporte's header ends the same way) */
          if (GUARD.headerHonest && t.mineAttr === 'reach' && x.p > same.p) same.text = x.text;
          same.bands.push(x.band); same.p += x.p;
        });
        merged.forEach(function (x) { delete x._k; });
        outs = merged;
        /* same ending, but one carries an edge and the other does not */
        var endOf = function (x) { return [x.effect, x.move, x.tmove, !!x.win, x.via, x.into, x.mode, x.to && x.to.id].join('|'); };
        outs.forEach(function (x) {
          if (x.effect === 'goal' || x.effect === 'concede' || (grants && (grants[x.band] || []).length)) return;
          var other = outs.filter(function (y) { return y !== x && endOf(y) === endOf(x) && grants && (grants[y.band] || []).length; })[0];
          if (!other || !/\.$/.test(x.text)) return;
          var wo = withoutEdge(grants[other.band][0]);
          if (!wo) return;
          var lastS = x.text.split(/\. (?=[A-Z])/).pop();
          if (/attack is over\.$/.test(x.text) || lastS.split(/\s+/).length + wo.split(/\s+/).length > 30) x.text += ' ' + withoutEdgeSentence(grants[other.band][0]);
          else x.text = x.text.replace(/\.$/, ', ' + wo + '.');
        });
      }
      /* g1: A CARD NEVER PROMISES WHAT NONE OF ITS RESULTS DELIVERS (the
       * review of p3: "Win it and your attack starts..." on cards where no
       * result wins the ball, "If Simon holds it" with no result where he
       * does). The sentence goes when no result can deliver it. */
      var readTxt = b.read;
      /* g2: A SENTENCE ABOUT HOW OFTEN FOLLOWS THE ODDS ON THE CARD (round 3
       * review: "most of the time the worst that happens is a cross" on cards
       * where he got past 50 times in 100 or more, 279 of 462) */
      var loseP = outs.reduce(function (a, x) { return a + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0);
      if (loseP >= 0.5) readTxt = readTxt.replace(/most of the time the worst that happens is/g, 'when it works, the worst that happens is')
        .replace(/Most of the time the worst that happens is/g, 'When it works, the worst that happens is');
      if (o.id === 'KEEPER_LONG') readTxt += loseP < 0.1 ? ' Very unlikely to go wrong.' : ' Here it goes wrong ' + Math.round(loseP * 36) + ' times in 36.';
      /* call: two more sentences that follow the odds (round 4 review): "you
       * keep the ball" only on a pass back that keeps it most of the time,
       * and "will usually save it" only when he does (the shot scores less
       * than 3 times in 10) */
      if (GUARD.placedHonest) {
        if (o.id === 'Z_RECYCLE' && loseP >= 0.5) readTxt = readTxt.replace('. You keep the ball, but further from their goal.',
          '. If it works, you keep the ball, but further from their goal. Here it goes wrong ' + Math.round(loseP * 36) + ' times in 36.');
        var goalP0 = outs.reduce(function (a, x) { return a + (x.effect === 'goal' ? x.p : 0); }, 0);
        if (o.id === 'Z_SHOOT_FAR' && goalP0 >= 0.3) readTxt = readTxt.replace(/ A long way out, so \S+ will usually save it or catch it\./,
          ' A long way out, so it is harder than a shot from inside the box.');
      }
      if (theirSide && !outs.some(function (x) { return x.win || /your attack starts|your team has the ball/i.test(x.text); })) {
        readTxt = readTxt.replace(/(^|\. )[^.]*your attack starts[^.]*\.\s*/g, function (all, pre) { return pre; })
          .replace(/(^|\. )If not, /g, '$1If it fails, ').replace(/\s+$/, '');
        if (/[^.!?)]$/.test(readTxt)) readTxt += '.';
      }
      /* g1: EVERY PART OF THE NUMBER IS ON THE CARD, maths switch or not.
       * The review of p3 found the result banner adding bonuses the card
       * never showed ("22 + 2 = 24" next to "Technique 18") in 1893 of 2938
       * rolls. Each bonus and each of their edges is a part with its
       * reason; play.html prints them in one line. The counterplay parts
       * have their own line (counterNotes), so they are not repeated. */
      mods.forEach(function (m) {
        if (m.cp || uses.some(function (u) { return u.why === m.why; })) return;
        uses.push({ name: m.why, why: m.why, n: m.n, part: true });
      });
      theirMods.forEach(function (m) {
        if (m.cp) return;
        uses.push({ name: m.why, why: m.why, n: m.n, part: true, theirs: true, who: foilName, carried: !!m.carried });
      });
      built.push({
        /* w0: the option's action tags (effects.js), and what the build did to it */
        tags: fxr ? fxr.tags.slice() : (FXL ? FXL.tagsFor(o.id, t.mineAttr, b.pays, mode) : null),
        fx: fxr ? fxr.visible() : null, fxRec: fxr, duel: duelRule, fxFree: fxFree, fxCreated: b.fxCreated || null,
        fxNote: fxr && fxr.visible().length ? fxNoteOf(fxr.visible()) : null,
        placedLine: b.placedLine || null,
        unlock: unlock, unlockNote: unlockNote, kw: o.kw || null, pair: o.pair || null, modeOpt: !!o.modes,
        /* the opponent's keywords that shape this option, and what yours answers */
        threat: threatIds.length ? threatIds[0] : null, threats: threatIds, threatNote: threatNotes.length ? threatNotes.join(' ') : null,
        counter: b.counter || null, answer: !!(b.counter && unlock),
        id: o.id, family: o.family, label: b.label, lastResort: !!o.lastResort,
        /* some reads end on a bracket with no full stop: add one first */
        read: readTxt + (cost ? (/[.!?]$/.test(readTxt) ? '' : '.') + ' Costs your ' + LINE_WORD[cost.line] + ' ' + cost.amount + ' stamina' +
          (cost.run ? ', because it is running and chasing.' : '.') : ''),
        cost: cost, restLine: b.restLine || null, subOff: b.subOff || null,
        pays: b.pays, does: b.does, bonus: bonus, because: mods.map(function (m) { return m.why; }).join(', ') || b.because,
        mods: mods, theirMods: theirMods, uses: uses, grants: grants, saysEdge: saysEdge,
        outcomes: outs,
        theirTo: b.theirTo || null, via: b.via || null, theirGrant: tGrant,
        winZone: typeof b.winZone === 'number' ? b.winZone : null,
        /* who has the ball next if the attack goes on (zones) */
        to: b.to || null, mate: b.mate || null, receiver: b.receiver || null,
        /* e1: carry-over bookkeeping for match.js */
        shotBy: (SHOT_PAYS[b.pays] || b.shooter) && t.mine && ctx.squad.players.indexOf(t.mine) >= 0 ? t.mine : null,
        formUse: formUse, freeFoul: !!b.freeFoul, counterWin: !!b.counterWin, books: !!o.books,
        chances: ch,
        check: check,
        stamina: t.mine ? staminaNote(t.mine, t.mineAttr, mineLegs) : null,
        generic: !!GENERIC[o.id], disabled: dead,
        counterNotes: cplay.notes.length ? cplay.notes : null,
        /* f2: this option faces a defender who has learned it (match.js) */
        learned: cplay.learned || null,
        actor: t.mine || null, attr: t.mineAttr || null,
        mineVal: mineV, themVal: themV,
        mineAttr: t.mineAttr || null, themAttr: t.theirsAttr || null,
        foil: t.theirs || null,
        edge: edge, risk: risk, builtRisk: risk, certain: ch.certain && !dead
      });
    });

    /* Two options that test the same man on the same attribute against the
     * same opponent are one option wearing two labels. */
    function signature(o) {
      return [o.attr, o.actor && o.actor.id, o.edge].join('|') + (zoneMode || tMode ? '|' + o.pays + '|' + o.themAttr : '');
    }

    /* ZONES (a1): an option that goes wrong at least 9 times in 10 and
     * almost never comes off is not a real choice. It is shown greyed out,
     * with its odds, as long as two real choices are left. */
    if (zoneMode || ctx.zoneEscape || tMode) {
      built.forEach(function (o) {
        if (o.disabled) return;
        var bad = 0, good = 0;
        (o.outcomes || []).forEach(function (x) {
          if (x.effect === 'break' || x.effect === 'concede') bad += x.p;
          if (x.effect === 'goal' || x.effect === 'stopped' || x.effect === 'ground') good += x.p;
        });
        if (bad >= 0.9 && good < 0.02) { o.disabled = true; o.hopeless = Math.round(bad * 36); }
      });
      var still = built.filter(function (o) { return !o.disabled; });
      var hopeless = built.filter(function (o) { return o.hopeless; })
        .sort(function (a, b) { return a.hopeless - b.hopeless; });
      /* a4: in their attack, falling back comes before a hopeless duel */
      var resort = built.filter(function (o) { return o.lastResort; });
      built.forEach(function (o) { if (o.lastResort) o.disabled = true; });
      still = still.filter(function (o) { return !o.lastResort; });
      while (still.length < 2 && resort.length) { var rs = resort.shift(); rs.disabled = false; still.push(rs); }
      built.forEach(function (o) { if (o.lastResort && o.disabled) o.hide = true; });
      while (still.length < 2 && hopeless.length) {
        var back = hopeless.shift(); back.disabled = false; back.hopeless = null; still.push(back);
      }
      /* a menu of one is not a decision (a3, in your box; e1, everywhere):
       * if it comes to that, the least hopeless of the impossible ones is
       * offered too, with its odds on the card */
      if (still.length < 2) {
        built.filter(function (o) { return o.disabled && !o.hopeless; })
          .sort(function (a, b) { return (b.edge || 0) - (a.edge || 0); })
          .forEach(function (o) { if (still.length < 2) { o.disabled = false; still.push(o); } });
      }
      built.forEach(function (o) {
        if (o.hopeless) o.check += ' This goes wrong ' + o.hopeless + ' times in 36, so it is shown greyed out.';
      });
      /* e1: a gamble of yours that cannot come off and simply ends the
       * attack (a placed shot or a cross with no chance) is not a choice */
      if (zoneMode) built.forEach(function (o) {
        if (o.disabled || o.pays === 'clock' || o.pays === 'keep') return;
        /* g2: the Free-kick taker's own free kick stays live when he is
         * standing over it (round 3 review: greyed 13 of 28) */
        if (o.modeOpt && o.unlock) return;
        var endN = (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'nothing' && typeof x.move !== 'number' ? x.p : 0); }, 0);
        if (endN >= 0.97 && built.filter(function (q) { return !q.disabled; }).length > 2) {
          o.disabled = true; o.dominated = true;
          o.check += ' This cannot come off: it ends the attack with nothing, so it is shown greyed out.';
        }
      });
      /* g1: an option whose own result (what its name says: the pass
       * reaches Nathan, the cross finds Rodri) cannot happen at all is not a
       * choice either (the review of p3: "cuts it back to Nathan" with no
       * result where Nathan gets it) */
      if (zoneMode) built.forEach(function (o) {
        if (o.disabled || o.pays === 'clock' || o.pays === 'keep' || o.noDice) return;
        if (o.modeOpt && o.unlock) return;
        var gpo = (o.outcomes || []).reduce(function (a, x) { return a + ((x.bands || [x.band]).indexOf('good') >= 0 ? x.p : 0); }, 0);
        if (gpo < 0.001 && built.filter(function (q) { return !q.disabled; }).length > 2) {
          o.disabled = true; o.dominated = true;
          o.check += ' What its name says cannot happen here, so it is shown greyed out.';
        }
      });
      /* e1: NO 3 PERCENT OPTION NEXT TO A 92 PERCENT ONE (the a3 review). An
       * option that almost never comes off, next to one that almost always
       * does and is no riskier, is not a choice: it is greyed out with the
       * reason, as long as two real choices are left. */
      var gp = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' || x.effect === 'stopped' || x.effect === 'ground' ? x.p : 0); }, 0); };
      var bp = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0); };
      var liveNow = built.filter(function (o) { return !o.disabled; });
      liveNow.slice().sort(function (a, b) { return gp(a) - gp(b); }).forEach(function (o) {
        /* only a gamble: a safe ball that keeps the ball is never "worse" */
        if (gp(o) >= 0.05 || o.risk === 'low' || bp(o) < 0.3) return;
        var left = built.filter(function (q) { return !q.disabled; });
        if (left.length <= 2) return;
        var better = left.filter(function (q) { return q !== o && gp(q) >= 0.9 && bp(q) <= bp(o) + 0.001; })[0];
        if (!better) return;
        o.disabled = true; o.dominated = true; o._better = better;
        o.check += ' "' + better.label + '" comes off far more often and is no riskier, so this one is shown greyed out.';
      });
    }
    /* g2: AN UNLOCK IS NEVER A TRAP (round 3 review, fix 1). An option only
     * your players open is a reward for picking them, so it is offered only
     * when it is a real choice: it loses the ball (or concedes) less than
     * half the time, and no other option on the menu is better on every
     * count (scores as often, gets as far, loses it no more). Otherwise it
     * is shown greyed out with the reason, as long as two real choices are
     * left. (It was: 369 of 1122 live unlock options lost half the time,
     * and 175 of 519 of yours were beaten on every count.) */
    if (GUARD.noTrap && (zoneMode || ctx.zoneEscape || tMode || ctx.boxStep)) {
      var ug = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' ? x.p : 0); }, 0); };
      var ua = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' || x.effect === 'ground' ? x.p : 0); }, 0); };
      var ub = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0); };
      built.filter(function (o) { return o.unlock && !o.disabled; }).forEach(function (o) {
        var left = built.filter(function (q) { return !q.disabled; });
        if (left.length <= 2) return;
        var b0 = ub(o), why = null;
        var short = null;
        if (b0 >= 0.5) {
          why = ' Here it goes wrong ' + Math.round(b0 * 36) + ' times in 36, so it is shown greyed out.';
          short = 'Greyed: here it goes wrong ' + Math.round(b0 * 36) + ' times in 36.';
        } else if (zoneMode && !o.modeOpt) {
          var beat = left.filter(function (q) {
            return q !== o && ug(q) >= ug(o) && ua(q) >= ua(o) && ub(q) <= ub(o) && (ug(q) - ug(o)) + (ua(q) - ua(o)) + (ub(o) - ub(q)) >= 0.15;
          })[0];
          if (beat) { o._beat = beat; why = ' "' + beat.label + '" does at least as well on every count here, so this one is shown greyed out.';
            short = 'Greyed: "' + beat.label + '" does at least as well on every count.'; }
        }
        if (!why) return;
        o.disabled = true; o.dominated = true; o.trap = true;
        o.check += why; o.greyWhy = short;
      });
    }
    var live = built.filter(function (o) { return !o.disabled; });
    if (!live.length && built.length) {
      var lb = built.slice().sort(function (a, b) { return (b.edge || 0) - (a.edge || 0); })[0];
      lb.disabled = false; live = [lb];
    }
    var seenSig = {};
    /* e1: when a keyword option and an ordinary one are the same check on
     * the same man, the keyword one stays (on their counter, your Ball
     * winner's tackle can start your attack; the ordinary one cannot) */
    live = live.filter(function (o) { return o.unlock; }).concat(live.filter(function (o) { return !o.unlock; }));
    live = live.filter(function (o) {
      var sg = signature(o);
      if (seenSig[sg]) { o.dropBy = seenSig[sg]; o.sameAs = seenSig[sg].label; return false; }
      seenSig[sg] = o; return true;
    });
    /* e1: TWO OPTIONS THAT END IN THE SAME PLACE ARE ONE OPTION. Eduardo,
     * at the edge of their box: "Rodri passes it out to Yamal on the right"
     * and "Rodri gives it to Yamal" both ended with Yamal on the ball there,
     * one with an edge the card never mentioned. When two options give the
     * ball to the same man in the same zone, the one that wins something
     * stays (then the safer one). */
    var destOf = null;
    if (GUARD.dest && zoneMode) {
      destOf = function (o) {
        var g = (o.outcomes || []).filter(function (x) { return x.band === 'good'; })[0];
        if (!g || typeof g.move !== 'number' || g.effect === 'goal') return null;
        var to = g.to || o.to || o.actor;
        return to ? to.id + '@' + (ctx.zone + g.move) + (g.mode ? ':' + g.mode : '') : null;
      };
      var byDest = {};
      live.forEach(function (o) { var d = destOf(o); if (d) (byDest[d] = byDest[d] || []).push(o); });
      Object.keys(byDest).forEach(function (d) {
        var grp = byDest[d];
        if (grp.length < 2) return;
        var worth = function (o) {
          var bad = (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'break' ? x.p : 0); }, 0);
          return ((o.grants && o.grants.good && o.grants.good.length) ? 10 : 0) + (o.unlock ? 5 : 0) - bad;
        };
        grp.sort(function (a, b) { return worth(b) - worth(a); });
        grp.slice(1).forEach(function (o) {
          /* g2: never down to one live option this way: two ways to give the
           * ball to the same man beat bringing back one that cannot come off */
          if (GUARD.keepTwo && live.length <= 2) return;
          o.sameAs = grp[0].label; o.dropBy = grp[0]; live.splice(live.indexOf(o), 1);
        });
      });
    }
    /* still never a menu of one after the duplicates are gone */
    if (live.length < 2) {
      built.filter(function (o) { return o.disabled && !o.hide && !seenSig[signature(o)]; })
        .sort(function (a, b) { return (b.edge || 0) - (a.edge || 0); })
        .forEach(function (o) {
          if (live.length >= 2) return;
          o.disabled = false; o.hopeless = null; o.dominated = null; seenSig[signature(o)] = 1;
          o.check = o.check.replace(/ This goes wrong \d+ times in 36, so it is shown greyed out\./, '');
          live.push(o);
        });
    }

    /* m5 (designer ruling q3, 2026-09-26): A BUILD CARD HAS ITS OWN PLACE.
     * An option a piece of your build created no longer competes for the
     * three places (m1 gave it the keyword place when that was free, so a
     * card made about 4 times a match was shown about 0.6). It is taken out
     * of the running here and added after the menu is cut, as an extra
     * card: it never takes the place of a plain card or a keyword card. Two
     * build cards live at once make a menu of five. The page makes a small
     * event of each one (play.html: the build card's arrival). Greyed
     * build cards still go with the greyed ones. KMOptions.setGuard('fxSlot',
     * false) is m4's rule. */
    var fxExtra = [];
    if (fx && GUARD.fxSlot) {
      fxExtra = live.filter(function (o) { return o.fxCreated; });
      if (fxExtra.length) live = live.filter(function (o) { return fxExtra.indexOf(o) < 0; });
    }
    var out = [], families = {};
    /* call: q does at least as well as o on every count (scores, gets
     * further, loses it no more), and clearly better on the sum */
    var domBy = function (q, o) {
      var g = function (z) { return (z.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' ? x.p : 0); }, 0); };
      var a = function (z) { return (z.outcomes || []).reduce(function (a2, x) { return a2 + (x.effect === 'goal' || x.effect === 'ground' ? x.p : 0); }, 0); };
      var b = function (z) { return (z.outcomes || []).reduce(function (a2, x) { return a2 + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0); };
      return g(q) >= g(o) && a(q) >= a(o) && b(q) <= b(o) && (g(q) - g(o)) + (a(q) - a(o)) + (b(o) - b(q)) >= 0.15;
    };
    var primary = MODE_PRIMARY[mode] ? live.filter(function (o) { return MODE_PRIMARY[mode].indexOf(o.id) >= 0; })[0]
      : ownThreat ? live.filter(function (o) { return o.id === THREAT_PRIMARY[ctx.threatSit]; })[0]
      : zoneMode ? live.filter(function (o) { return o.id === ZONE_PRIMARY[ctx.zone]; })[0]
      : tMode ? live.filter(function (o) { return o.id === (play && play.air ? 'E_RACE' : T_PRIMARY[ctx.tzone]); })[0]
      : live.filter(function (o) { return o.id === 'ATTACK_BALL' || o.id === 'MEET_IT'; })[0];
    if (primary) { out.push(primary); families[primary.family] = 1; }

    /* ONE SAFE BALL, reserved: the question of how much risk to take does not
     * exist without a low-risk answer on the table. */
    var safe = null;
    var safeIds = MODE_SAFE[mode] || (ownThreat ? THREAT_SAFE[ctx.threatSit] : tMode && play && play.air ? ['E_COVER'] : tMode ? T_SAFE[ctx.tzone] : zoneMode ? ZONE_SAFE[ctx.zone] : null);
    (safeIds || []).forEach(function (id) {
      if (!safe) safe = live.filter(function (o) { return o.id === id && out.indexOf(o) < 0; })[0] || null;
    });
    if (!safe) safe = live.filter(function (o) { return o.risk === 'low' && out.indexOf(o) < 0; })[0];
    /* g2: THE LOW-RISK OPTION IS THE ONE LEAST LIKELY TO LOSE IT. The
     * reserved place went to the zone's usual safe ball whatever its odds:
     * as Argentina the switch in midfield lost the ball 33 times in 100 and
     * "make him go wide" let Spain's winger past 72 times in 100, so playing
     * carefully won 31 percent of finals (as Spain 55). When the usual one
     * loses it a quarter of the time or more and another option on the menu
     * loses it clearly less, that one takes the place. */
    var lossOf = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0); };
    if (GUARD.realSafe && safe && lossOf(safe) >= REALSAFE_AT) {
      var safer = null;
      live.forEach(function (o) { if (o !== safe && out.indexOf(o) < 0 && !(zoneMode && o.unlock) && (!safer || lossOf(o) < lossOf(safer) - 1e-9)) safer = o; });
      if (safer && lossOf(safer) <= lossOf(safe) - 0.15) { safe = safer; safe.risk = 'low'; }
    }
    if (safe) { out.push(safe); families[safe.family] = 1; }

    var special0 = live.filter(function (o) { return !o.generic && out.indexOf(o) < 0; });
    /* e1: a keyword or pair option of yours, and your answer to their
     * keyword, first among the specials when it gets its place (KW_SLOT) */
    var su = special0.filter(function (o) { return o.unlock; }).sort(function (a, b) {
      return ((b.modeOpt ? 8 : 0) + (b.answer ? 4 : 0) + (b.pair ? 2 : 0)) - ((a.modeOpt ? 8 : 0) + (a.answer ? 4 : 0) + (a.pair ? 2 : 0));
    });
    var sn = special0.filter(function (o) { return !o.unlock; });
    var slotted = null;
    /* e1: and not the same keyword option two decisions running: the one on
     * the last menu waits a turn, so a keyword-rich eleven does not show
     * the same card every time */
    var prevKw = (ctx.state && ctx.state.kwPrev) || {};
    if (zoneMode && su.length && !su[0].modeOpt) su = su.filter(function (o) { return !prevKw[o.unlock]; });
    if (su.length && out.length < howMany) {
      /* always: a moment only it opens, your answer to their keyword, your
       * Ball winner on their break, and any keyword of yours when they
       * attack (those are rare); your attacking ones take turns (KW_SLOT) */
      var must = su[0].modeOpt || su[0].answer || su[0].counterWin || ownThreat || !!ctx.boxStep || theirSide;
      if (must || kwTurn(ctx)) { slotted = su.shift(); out.push(slotted); families[slotted.family] = 1; }
    }
    /* g1: an ordinary option dropped as the twin of a keyword option comes
     * back when that keyword option waits its turn: otherwise the move
     * vanished from the menu altogether (the strongest option was missing
     * on about 1 menu in 200) */
    if (zoneMode) built.forEach(function (o) {
      var k = o.dropBy;
      if (!k || o.disabled || live.indexOf(o) >= 0 || !k.unlock || k === slotted || live.indexOf(k) < 0 || o.unlock) return;
      /* (never a second card that gives the ball to the same man in the same zone) */
      if (destOf && destOf(o) && live.some(function (q) { return q !== k && destOf(q) === destOf(o); })) return;
      o.dropBy = null; o.sameAs = null;
      /* m5: a build card that comes back goes to its own place, not the three */
      if (o.fxCreated && fx && GUARD.fxSlot) { if (fxExtra.indexOf(o) < 0) fxExtra.push(o); return; }
      live.push(o);
      if (!o.generic) sn.push(o);
    });
    /* the rest: the squad's other special options first, then its keyword
     * options (they are still there, just not on top of every menu) */
    var special = sn.concat(su);
    if (tMode) {
      /* their attack (a4): a spread of KINDS of defending before a second
       * of the same kind */
      var mapOf = function (o) { return (o.outcomes || []).map(function (x) { return x.band + x.effect; }).join(','); };
      var tk = {};
      out.forEach(function (o) { tk[mapOf(o)] = 1; });
      if (special[0] && out.length < howMany && !slotted) { out.push(special[0]); tk[mapOf(special[0])] = 1; families[special[0].family] = 1; }
      live.forEach(function (o) {
        if (out.length >= howMany || out.indexOf(o) >= 0 || tk[mapOf(o)]) return;
        tk[mapOf(o)] = 1; out.push(o); families[o.family] = 1;
      });
    }
    if (zoneMode) {
      /* zones: a spread of KINDS first (a way forward, a finish, a safe
       * ball), so a menu is not three safe passes that play the same */
      var kinds = {};
      out.forEach(function (o) { kinds[KIND[o.pays] || o.pays] = 1; });
      sn.forEach(function (o) {
        var k = KIND[o.pays] || o.pays;
        if (out.length >= howMany || kinds[k]) return;
        kinds[k] = 1; out.push(o); families[o.family] = 1;
      });
    }
    /* on your attack a keyword option is on the menu only when it has its
     * place (above); otherwise every menu of a keyword-rich eleven carries
     * one, which is d2's wallpaper */
    var held = function (o) { return zoneMode && o.unlock && o !== slotted; };
    for (var i = 0; i < special.length && out.length < howMany; i++) {
      if (out.indexOf(special[i]) >= 0 || held(special[i])) continue;
      out.push(special[i]);
      families[special[i].family] = 1;
    }
    live.forEach(function (o) {
      if (out.length >= howMany) return;
      if (out.indexOf(o) >= 0 || held(o)) return;
      if (families[o.family]) return;
      families[o.family] = 1; out.push(o);
    });
    live.forEach(function (o) {
      if (out.length >= howMany) return;
      if (out.indexOf(o) >= 0 || held(o)) return;
      out.push(o);
    });
    /* never leave a decision with one live option because a keyword option
     * was held back */
    live.forEach(function (o) {
      if (out.length >= 2 || out.indexOf(o) >= 0) return;
      out.push(o);
    });

    /* e1: NO TWO OPTIONS WITH THE SAME RESULTS AT THE SAME ODDS on one
     * menu: the later one (lower priority) gives its place to an option
     * that plays differently, if there is one (Eduardo, p2: two certain
     * passes to Yamal; the scorecard's "menus with two options that end
     * identically"). */
    /* (chained play only: the six-moment switch on the page keeps a5's menus) */
    if (GUARD.dest && (zoneMode || tMode || ctx.boxStep || ctx.zoneEscape)) {
      var tvd = function (a, b) {
        var k = {}, d = 0;
        (a.outcomes || []).forEach(function (x) { k[x.effect] = (k[x.effect] || 0) + x.p; });
        (b.outcomes || []).forEach(function (x) { k[x.effect] = (k[x.effect] || 0) - x.p; });
        for (var e in k) d += Math.abs(k[e]);
        return d / 2;
      };
      /* on your attack, two options with the same odds that put the ball
       * in different zones are different choices (a switch to the wing and
       * a pass into their box), so there it takes the same odds AND the same
       * zone after the good result */
      var zoneAfter = function (o) {
        if (!zoneMode) return 0;
        var g = (o.outcomes || []).filter(function (x) { return x.band === 'good'; })[0];
        return g && typeof g.move === 'number' ? ctx.zone + g.move : 'end';
      };
      /* ...unless both are all but certain: two sure things with the same
       * result read as one option wherever they leave the ball */
      var sure = function (o) {
        var byE = {};
        (o.outcomes || []).forEach(function (x) { byE[x.effect] = (byE[x.effect] || 0) + x.p; });
        return Object.keys(byE).some(function (e) { return byE[e] >= 0.9; });
      };
      var twin = function (a, b) { return tvd(a, b) < 0.01 && (zoneAfter(a) === zoneAfter(b) || (sure(a) && sure(b))); };
      for (var ti = 1; ti < out.length; ti++) {
        var tw0 = out[ti];
        var twOf = out.slice(0, ti).filter(function (q) { return twin(q, tw0); })[0];
        if (!twOf) continue;
        /* the same results at the same odds: the one that says it is the
         * careful one stays, since that is what it is */
        if (tw0.risk === 'low' && twOf.risk !== 'low') out[out.indexOf(twOf)] = tw0;
        out.splice(ti, 1); ti--;
      }
      live.forEach(function (o) {
        if (out.length >= howMany || out.indexOf(o) >= 0 || held(o)) return;
        if (out.some(function (q) { return twin(q, o); })) return;
        out.push(o);
      });
      live.forEach(function (o) { if (out.length < 2 && out.indexOf(o) < 0) out.push(o); });
    }
    /* g2: on the overlap scene, the full-back's run is on the menu */
    if (GUARD.overlapScene && zoneMode && ctx.sit && ctx.sit.id === 'overlap') {
      var ovl = live.filter(function (o) { return o.id === 'PAIR_OVERLAP'; })[0];
      /* call: the pair's overlap is the one offered unless another option
       * does at least as well on every count (g2 greyed it before this
       * point; the grey check now runs after the cut) */
      if (ovl && GUARD.ghostFree && live.some(function (q) { return q !== ovl && domBy(q, ovl); })) ovl = null;
      ovl = ovl || live.filter(function (o) { return o.id === 'Z_OVERLAP'; })[0];
      if (ovl && ovl !== safe) {
        if (out.indexOf(ovl) < 0) out.push(ovl);
        slotted = ovl;
        /* (and an option that plays exactly like it gives it its place) */
        out = out.filter(function (o) { return o === ovl || o === safe || effectTV(o, ovl) >= 0.01; });
        if (primary && out.indexOf(primary) < 0) primary = null;
      }
    }
    /* m1 from w1a: a build's own option (a component's pool entry) takes the
     * keyword place when no keyword or pair option has it this decision, so
     * an option a build creates is not cut from nearly every menu (w0: a
     * layoff option built 4 times a match was shown 0.6). Only with a build.
     * A menu-policy rule for Eduardo (dashboard q3). */
    if (fx && zoneMode && !slotted && !GUARD.fxSlot) {   /* m5: only with the fxSlot guard off (m4's rule) */
      var fxOwn = live.filter(function (o) { return o.fxCreated && !o.disabled; })
        .sort(function (a, b) { return worth(b) - worth(a); })[0];
      if (fxOwn) { if (out.indexOf(fxOwn) < 0) out.push(fxOwn); slotted = fxOwn; }
    }
    out = pickSpread(out, safe, primary, want, slotted, theirSide && !PIN_DEF);
    /* g2: and the word "low risk" (o.risk) goes with the odds: the option in
     * the low-risk place is it, and another that loses it clearly more
     * often is not */
    if (GUARD.realSafe && safe && out.indexOf(safe) >= 0) out.forEach(function (o) {
      if (o === safe) o.risk = 'low';
      else if (o.risk === 'low' && lossOf(o) >= lossOf(safe) + 0.15) o.risk = 'even';
    });
    /* call: EVERY GREY REASON NAMES AN OPTION YOU CAN SEE (round 4 review:
     * 104 reasons named an option that had been cut from the menu). The
     * "beaten on every count" check for an unlock runs here, after the menu
     * is cut to three, and only against the options still shown: if the one
     * that beat it was cut, the unlock stays live. The placed shot next to
     * the hard shot is judged the same way. */
    if (GUARD.ghostFree) {
      var cg = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' ? x.p : 0); }, 0); };
      var ca = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' || x.effect === 'ground' ? x.p : 0); }, 0); };
      var cb = function (o) { return (o.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'break' || x.effect === 'concede' ? x.p : 0); }, 0); };
      var refillFor = function (gone, wantSafe) {
        return live.filter(function (o) {
          return out.indexOf(o) < 0 && o !== gone && !o.disabled && !held(o) && !(o.unlock && zoneMode) &&
            !out.some(function (q) { return q !== gone && effectTV(q, o) < 0.01; });
        }).sort(function (a, b) {
          return wantSafe ? ((a.risk === 'low' ? 0 : 1) - (b.risk === 'low' ? 0 : 1)) || cb(a) - cb(b) : worth(b) - worth(a);
        })[0] || null;
      };
      var greyNow = function (o, beat) {
        /* (when it held the low-risk place, the option that takes its place
         * is the one least likely to lose the ball) */
        var wasSafe = o.pinned === 'safe' || (o.risk === 'low' && !out.some(function (q) { return q !== o && (q.risk === 'low' || q.pinned === 'safe'); }));
        var fill = refillFor(o, wasSafe);
        /* (never down to one button: as the fill above does, a menu of two
         * may take any option still live, even one like another) */
        if (!fill && out.length - 1 < 2) fill = live.filter(function (q) { return out.indexOf(q) < 0 && q !== o && !q.disabled && !(q.unlock && domBy(beat, q)); })[0] || null;
        if (out.length - 1 + (fill ? 1 : 0) < 2) return false;
        o.disabled = true; o.dominated = true; o.cutGrey = true;
        if (o.unlock) o.trap = true;
        o.check += ' "' + beat.label + '" does at least as well on every count here, so this one is shown greyed out.';
        o.greyWhy = 'Greyed: "' + beat.label + '" does at least as well on every count.';
        o.pinned = null;
        out.splice(out.indexOf(o), 1);
        /* (a low-risk option that plays exactly like one still shown takes
         * that one's place, as the twin rule above does) */
        if (wasSafe && !(fill && fill.risk === 'low')) {
          live.forEach(function (c) {
            if (c.risk !== 'low' || out.indexOf(c) >= 0 || c === o || c.disabled || held(c)) return;
            if (out.some(function (q) { return q.risk === 'low' || q.pinned === 'safe'; })) return;
            var tw = out.filter(function (q) { return q !== beat && q.risk !== 'low' && effectTV(q, c) < 0.01; })[0];
            if (!tw) return;
            out[out.indexOf(tw)] = c; tw.pinned = null; c.pinned = 'safe';
          });
          if (out.some(function (q) { return q.pinned === 'safe'; })) { wasSafe = false; fill = refillFor(o, false); }
        }
        if (fill) { out.push(fill); fill.pinned = null; }
        /* (the low-risk place goes to the option now on the menu least
         * likely to lose the ball, when it is no riskier than the one greyed:
         * next to a capped placed shot that is the hard shot, which loses
         * nothing either) */
        if (wasSafe) {
          var least = out.slice().sort(function (a, b) { return cb(a) - cb(b); })[0];
          if (least && cb(least) <= cb(o) + 1e-9) {
            out.forEach(function (q) { if (q.pinned === 'safe') q.pinned = null; });
            least.pinned = 'safe'; least.risk = 'low';
            out.forEach(function (q) { if (q !== least && q.risk === 'low' && cb(q) >= cb(least) + 0.15) q.risk = 'even'; });
          } else if (fill && (fill.risk === 'low' || cb(fill) < 0.5)) { fill.pinned = 'safe'; fill.risk = 'low'; }
        }
        return true;
      };
      /* an unlock greyed above as beaten by an option the cut then left
       * off: named after one still shown that beats it too, or else it
       * stays live (in the place of the third option, or off this menu
       * when it is waiting its turn) */
      built.forEach(function (o) {
        if (!o._beat || !o.disabled || !o.trap) return;
        if (out.indexOf(o._beat) >= 0) return;
        var was = ' "' + o._beat.label + '" does at least as well on every count here, so this one is shown greyed out.';
        var alt = out.filter(function (q) { return domBy(q, o); })[0];
        if (alt) {
          o.check = o.check.replace(was, ' "' + alt.label + '" does at least as well on every count here, so this one is shown greyed out.');
          o.greyWhy = 'Greyed: "' + alt.label + '" does at least as well on every count.';
          return;
        }
        o.check = o.check.replace(was, ''); o.greyWhy = null;
        o.disabled = false; o.dominated = null; o.trap = null; o._beat = null;
        /* (and never as a second card that plays like one on the menu or
         * gives the ball to the same man in the same zone) */
        var like = out.some(function (q) { return effectTV(q, o) < 0.01 || (destOf && destOf(q) && destOf(q) === destOf(o)); });
        /* m5: a build card that comes back live goes to its own place */
        if (o.fxCreated && fx && GUARD.fxSlot) { if (like) o.hide = true; else if (fxExtra.indexOf(o) < 0) fxExtra.push(o); return; }
        if (like || (o !== slotted && !kwTurn(ctx))) { o.hide = true; return; }
        if (out.length < want) { out.push(o); o.pinned = null; return; }
        var swap = out.slice().reverse().filter(function (q) { return !q.pinned && q !== primary; })[0];
        if (swap) { out[out.indexOf(swap)] = o; o.pinned = null; } else o.hide = true;
      });
      /* the placed shot: greyed when it is no better on any count (scores
       * no more often, gets no further, loses the ball no less often) */
      if (zoneMode && GUARD.placedHonest) {
        var pl0 = out.filter(function (o) { return o.id === 'Z_PLACE'; })[0], hd0 = out.filter(function (o) { return o.id === 'Z_SHOOT'; })[0];
        if (pl0 && hd0 && cg(pl0) <= cg(hd0) + 1e-9 && ca(pl0) <= ca(hd0) + 1e-9 && cb(pl0) >= cb(hd0) - 1e-9) greyNow(pl0, hd0);
      }
      /* a gamble greyed earlier as beaten by an option that was then cut:
       * the reason names one still shown, or says what it is */
      built.forEach(function (o) {
        if (!o.disabled || !o._better || out.indexOf(o._better) >= 0) return;
        var alt = out.filter(function (q) { return gp(q) >= 0.9 && bp(q) <= bp(o) + 0.001; })[0];
        var was = ' "' + o._better.label + '" comes off far more often and is no riskier, so this one is shown greyed out.';
        o.check = o.check.replace(was, alt ? ' "' + alt.label + '" comes off far more often and is no riskier, so this one is shown greyed out.'
          : ' It almost never comes off, so it is shown greyed out.');
      });
    }
    /* call: the placed shot's card says the keeper has a better chance only
     * when the hard shot on the menu really scores more often */
    if (GUARD.placedHonest) {
      var hd1 = out.filter(function (o) { return o.id === 'Z_SHOOT'; })[0];
      built.forEach(function (o) {
        if (o.id !== 'Z_PLACE' || !o.placedLine || !hd1) return;
        var gq = function (q) { return (q.outcomes || []).reduce(function (a, x) { return a + (x.effect === 'goal' ? x.p : 0); }, 0); };
        if (gq(o) < gq(hd1) - 0.005) o.read = o.read.replace(' in their goal. ', ' in their goal. ' + o.placedLine);
      });
    }
    /* e2: your Poacher's note once per menu, on the first shot that has it
     * (e1 printed it on every shot, and a menu read like wallpaper) */
    var poSaid = false;
    out.forEach(function (o) {
      if (!o.unlockNote || o.unlockNote.indexOf('(Poacher) adds a second chance') < 0) return;
      if (poSaid) {
        o.unlockNote = o.unlockNote.replace(/ ?[^.]*\(Poacher\) adds a second chance[^.]*\([^)]*\)\./, '').trim() || null;
      }
      poSaid = true;
    });
    /* m5: the build cards, each in its own extra place after the cut menu,
     * the most valuable first. "Low risk" goes with the odds here too. */
    if (fxExtra.length) {
      var safeNow = out.filter(function (q) { return q.pinned === 'safe'; })[0] || (safe && out.indexOf(safe) >= 0 ? safe : null);
      fxExtra.slice().sort(function (a, b) { return worth(b) - worth(a); }).forEach(function (o) {
        if (out.indexOf(o) >= 0) return;
        o.pinned = 'build'; o.extraSlot = true;
        if (GUARD.realSafe && safeNow && o.risk === 'low' && lossOf(o) >= lossOf(safeNow) + 0.15) o.risk = 'even';
        out.push(o);
      });
    }
    /* the ones he cannot do, shown after and marked, up to two; an option
     * only this moment has is shown even when it cannot come off */
    var greyed = built.filter(function (o) { return o.disabled && !o.hide; })
      .sort(function (a, b) { return (b.modeOpt ? 2 : b.cutGrey ? 1 : 0) - (a.modeOpt ? 2 : a.cutGrey ? 1 : 0); }).slice(0, MENU_GREY);
    /* call2: every result gets a short form of a few words (x.short), and
     * the edge it carries a short "Then:" line (x.edgeShort), for the
     * playtester view of the page. Both are built from the result's own data
     * (its effect, where the ball goes, who has it next, the edge it
     * carries), never from its sentence, so every result has one and no card
     * needs its own wording. */
    built.forEach(function (o) {
      (o.outcomes || []).forEach(function (x) {
        var gl = [];
        (x.bands || [x.band]).forEach(function (bd) {
          ((o.grants && o.grants[bd]) || []).forEach(function (c) { if (CARRY[c.id] && gl.indexOf(c) < 0) gl.push(c); });
        });
        x.edgeShort = x.edgeNote && gl.length ? 'Then: ' + gl.map(edgeShort).join('; ') : null;
      });
    });
    return { shown: out.concat(greyed), live: out, greyed: greyed, available: built };
  }
  /* whether this decision's menu gives a keyword option its own place:
   * decided from the match's own numbers (minute, decision, zone) so a seed
   * replays it and the random numbers of the match are not touched */
  function kwTurn(ctx) {
    var st = ctx.state || {};
    var k = ((st.minute || 0) * 7 + (st.stepNo || 0) * 13 + (ctx.zone || 0) * 5 + (ctx.tzone || 0) * 3) % 100;
    return k < KW_SLOT * 100;
  }
  function setKwSlot(v) { KW_SLOT = v; }
  /* g2: who stands over a free kick you win at the edge of their box: your
   * Free-kick taker (the best at it, if two), or else your best finisher */
  function fkTaker(squad) {
    var on = squad.players.filter(function (p) { return !p.off; });
    var kw = KWL ? KWL.holders(squad, 'FREEKICK') : [];
    var pool = kw.length ? kw : on.filter(function (p) { return p.line >= 1; });
    var attr = kw.length ? 'technique' : 'finishing';
    return pool.slice().sort(function (a, b) { return A.eff(b, attr, 100) - A.eff(a, attr, 100); })[0] || null;
  }

  var API = { sizes: function () { return { SHOT_CAP: SHOT_CAP, THEIR_CAP: THEIR_CAP, CLOSE_HARD: CLOSE_HARD, CLOSE_PLACED: CLOSE_PLACED, THEIR_CLOSE: THEIR_CLOSE, RUN_COST: RUN_COST, TOUCH_COST: TOUCH_COST }; }, fkTaker: fkTaker, setUnlockSizes: setUnlockSizes, MENU_LIVE: MENU_LIVE, MENU_GREY: MENU_GREY, worth: worth, setPinStrong: function (v) { PIN_STRONG = v; }, setNarrow: function (v) { NARROW_BY = v; }, setPinDef: function (v) { PIN_DEF = v; }, setBoxSave: function (v) { BOX_SAVE_BONUS = v; }, setYourSetPieces: function (fk, lg) { YOUR_FK = fk; YOUR_LONG = lg; }, setTEdge: function (v) { T_EDGE = v; }, setSafeDef: function (v) { SAFE_DEF = v; }, setSafeAtt: function (v) { SAFE_ATT = v; }, setClose: function (h, p) { CLOSE_HARD = h; CLOSE_PLACED = p; }, setShotCap: function (v) { SHOT_CAP = v; }, setPlaceCap: function (v) { PLACE_CAP = v; }, setRealSafe: function (v) { REALSAFE_AT = v; }, setTheirClose: function (v) { THEIR_CLOSE = v; }, setPassCap: function (v) { PASS_CAP = v; }, setTheirCap: function (v) { THEIR_CAP = v; }, setSetPieces: setSetPieces, POOL: POOL, offer: offer, verdict: verdict, shortOf: shortOf, iconOf: iconOf, annotate: annotate, overlapBack: overlapBack, overlapScene: overlapScene, theirWingScene: theirWingScene, SIDE_WORD: SIDE_WORD, ICONS: ICONS, END_ICON: END_ICON, tag: tag, statOf: statOf, setKwSlot: setKwSlot, setGuard: function (k, v) { GUARD[k] = v; }, SHOT_PAYS: SHOT_PAYS, GUARD: GUARD,
    markerOf: markerOf, lane: lane, T_AT: T_AT, T_PRIMARY: T_PRIMARY, CARRY: CARRY, carryText: carryText, ZONE_NAME: ZONE_NAME, ZONE_AT: ZONE_AT, ZONE_PRIMARY: ZONE_PRIMARY, CONTINUES: CONTINUES };
  root.KMOptions = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
