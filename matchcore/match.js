/* The match. Six moments, you choose, it resolves.
 *
 * Built for Thursday 2026-09-24: Eduardo screenshares this to Arturo and
 * Rodrigo and asks whether it is fertile ground rather than whether it is
 * finished.
 *
 * HOW A MOMENT RESOLVES. Each option is a stat check (his ruling). The margin
 * decides the spread; beat it by six and it simply works. Then:
 *
 *   YOUR moment   good  -> you score (or, for a switch or an overlap run,
 *                          the same attack goes on to a follow-up choice)
 *                 mixed -> the ball goes out of play and the attack is over
 *                 bad   -> you lose it and they break, so the next moment is
 *                          theirs and it is a dangerous one
 *
 *   THEIR moment  good  -> you stop it
 *                 mixed -> they get a shot away and it goes wide
 *                 bad   -> they score
 *
 * That is the whole outcome table. It fits in four lines on purpose: he has to
 * be able to explain it on a call in one sentence.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  var A = root.KMAttr || require('./attributes.js');
  var M = root.KMModel || require('./model.js');
  var R = root.KMResolve || require('./resolve.js');

  function sgn(n) { return (n > 0 ? ' +' : ' ') + n; }
  /* "(14 +4 a short pass is easy, +2 there is space on the right)" */
  function parts(total, mods, bonus, because) {
    if (mods && mods.length) {
      var sum = mods.reduce(function (a, m) { return a + m.n; }, 0);
      return ' (' + (total - sum) + mods.map(function (m) { return sgn(m.n) + ' ' + m.why; }).join(',') + ')';
    }
    if (bonus) return ' (' + (total - bonus) + sgn(bonus) + ', ' + (because || 'the safe option') + ')';
    return '';
  }
  function O() { return root.KMOptions || require('./options.js'); }
  function first(p) { return p ? String(p.name || '').split(' ')[0] || p.name : 'him'; }
  function statName(a) { return (root.KMOptions || require('./options.js')).statOf(a); }

  var MOMENTS = 6;
  var ZONE_AT = ['in your half', 'in midfield', 'at the edge of their box', 'in their box'];
  var ZONE_GAIN = ['', 'You got the ball into midfield.', 'You got the ball to the edge of their box.', 'You got the ball into their box.'];                       // his ruling: start with six
  var MINUTES = [12, 27, 41, 58, 71, 86];

  /* After you lose the ball going forward, the next moment is their counter.
   * Only situations that ARE a counter: "they have had the ball in your half
   * for several minutes" cannot follow a turnover ten seconds ago. */
  var COUNTERS = { over_the_top: 1, their_winger: 1, caught_square: 1, tired_gap: 1 };
  /* After a switch or an overlap run comes off, the same attack goes on into
   * one of these, in the same minute. Open-play attacks only. */
  var FOLLOW_ON = { overlap: 1, third_man: 1 };

  /* Each time a situation has already happened this match, its weight is
   * multiplied by this again. His playtest, 2026-09-23, seed 34 with a high
   * press: "Ball in behind your line" five times out of six, Keith against Tom
   * every time. Nothing stopped a moment repeating, and at a high press 13.5
   * percent of matches had one situation four or more times. Style still
   * decides which moments come up most; it just cannot fill the match. */
  var REPEAT_DAMP = 0.3;

  /* One plain sentence saying how the play ended, for the top of the screen.
   * Keyed by what the match did, so it cannot disagree with the scoreline. */
  function headline(effect, who, pays, actorName) {
    switch (effect) {
      case 'goal': return 'You scored.';
      case 'concede': return 'They scored.';
      case 'break': return 'You lost the ball. They are attacking, and you have to stop it.';
      case 'ground': return 'It worked. The same attack goes on: choose what happens next.';
      case 'stopped': return 'You stopped them. Their attack is over.';
      case 'rest': return 'Fresh players are on.';
    }
    if (who === 'them') return 'They did not score. Their attack is over.';
    if (pays === 'keep') return 'You kept the ball, but this attack did not score.';
    return 'The attack is over. Nobody scored.';
  }

  /* CHAINED EVENTS. Eduardo, 2026-09-23: "each event covered over a series
   * of turns ... it chains from one decision to the next until an event
   * concludes with a safe recovery, a goal, out of bounds, a save, a yellow
   * card, a foul." Still six events a match; an event is now a string of
   * decisions in the same minute:
   *
   *   your step   goal, shot wide/out, stopped, substitution  -> event ends
   *               switch or overlap comes off ('ground')      -> you go on, to
   *                                                              a chance (CHAIN_GROUND)
   *               safe pass comes off ('keep', good)          -> you still have
   *                                                              it (CHAIN_KEEP)
   *               ball lost after a gamble ('break')          -> their counter
   *   their step  anything                                    -> event ends
   *
   * At most CHAIN_CAP of your decisions in one event. On the last one no
   * option can carry the move on, so every event ends within CHAIN_CAP + 1
   * decisions (the +1 is their counter). opts.chain === false keeps the
   * six-moment rules exactly as they were (the switch on the page). */
  /* ZONES (a1): an attack now runs up the pitch zone by zone, so it needs
   * more room than three decisions: from your half to a shot is four. Five
   * of yours at most, then their counter if you lose it. On the fifth,
   * nothing on the menu can carry the attack on (options.js CONTINUES), so
   * every event still ends. */
  var CHAIN_CAP = 4;
  /* THEIR ATTACK BY ZONES (a4): a half-stop pushes them back a zone only
   * on the first T_CAP - 1 decisions of their attack; after that it ends
   * it, so their attack cannot go back and forth for ever */
  var T_CAP = 1;
  /* an attack that starts from winning the ball back in their attack is
   * quick: at most WIN_CAP decisions of yours (a4, keeps matches short) */
  var WIN_CAP = 3;
  var START_EDGES = false;
  var CHAIN_GROUND = { overlap: 1, second_ball: 1, third_man: 1 };
  var CHAIN_KEEP = { third_man: 1, overlap: 1 };

  /* g1: f2's COUNTERPLAY, brought onto e2 (its comments kept). */
  /* COUNTERPLAY (f1). Eduardo's a3 match: "Yamal cuts it back to Oyarzabal"
   * then "Oyarzabal shoots as hard as he can" scored two of his three goals,
   * and his decision time fell from 40-60 seconds to 3-15. A route that keeps
   * working stops being a decision. Three answers, one switch:
   *
   *   learn  the defender who was beaten learns: each time you beat the same
   *          named player with the same kind of option, he gets +2 against it
   *          next time (up to +6)
   *   fade   an option that just worked is -2 for the rest of that event and
   *          the next one, then it is back to normal
   *   adapt  at half-time they put a second player on the side you attacked
   *          most and on the player who scored or shot most; the other side
   *          has more room
   *   off    a5 exactly
   *
   * None of them reads the score. They react to what you did, never to who
   * is winning (he rejected momentum because it spirals). */
  /* f2, two changes to Learn (the default):
   *   the KEEPER does not learn. On f1 one goal with the hard shot made every
   *   later hard shot +2 for him, which is most of why goals fell. Instead he
   *   reads the last shot (from your next attack on, not on a rebound in
   *   the same one): after a hard shot he is ready for another (+2
   *   against the next hard shot, -1 against a placed one); after a placed
   *   shot, the reverse. The two shots trade off instead of both getting worse.
   *   ROOM: when an outfield defender has learned a move, he is staying close
   *   to the man who beat him, and one other option on the same menu (a
   *   different move that does not go past him) gets +1, named on both
   *   cards. It points you at something newly good, not only away from the
   *   old thing. It reads what you did, never the score. */
  var KEEP_UP = 2, KEEP_DOWN = 0, ROOM_BY = 1;
  var SHOT_KIND = { Z_SHOOT: 'hard', Z_SHOOT_FAR: 'hard', Z_PLACE: 'placed' };
  var SHOT_NOUN = { hard: 'hard shot', placed: 'placed shot' };
  /* moves that go backwards are not "room": the pointer is to a way forward */
  var NOT_ROOM = { Z_KEEP_BACK: 1, Z_RECYCLE: 1 };
  /* g2: a pass backwards or across the back beats nobody, so it is not a
   * move the other team learns, fades or reacts to (round 3 review: 53 cards
   * said a defender "has seen this pass back"); they are out of NOUN */
  function learnKey(q) { return q.foil.id + '|' + q.id; }
  function isKeeper(st, p) { return !!(p && st.opp && p === st.opp.keeper); }
  var COUNTER_MODES = { learn: 1, fade: 1, adapt: 1, off: 1 };
  var COUNTER_DEFAULT = 'learn';
  var LEARN_STEP = 2, LEARN_MAX = 3, FADE_BY = 2, ADAPT_BY = 2;
  /* the kind of option, as a noun for "has seen this ___" */
  var NOUN = {
    Z_PASS_MID: 'pass into midfield', Z_CARRY_OUT: 'run out of defence', Z_LONG_UP: 'long ball to head',
    Z_RUN_BEHIND: 'long ball to chase', Z_CARRY: 'run with the ball',
    Z_THROUGH: 'pass through', Z_SWITCH: 'switch to the other side', Z_SHOOT_FAR: 'shot from distance',
    Z_CROSS: 'cross to head', Z_WIDE: 'pass out wide', Z_CUTBACK: 'cut-back', Z_TAKE_ON: 'run at him',
    Z_OVERLAP: 'overlap', Z_LAYOFF: 'short pass', Z_SHOOT: 'hard shot',
    Z_PLACE: 'placed shot', Z_PULLBACK: 'pull-back', Z_CHIP: 'lifted shot', Z_SQUARE: 'pass across the goal',
    /* g1: e2's keyword and pair moves are moves too: a Dribbler who beats
     * the same man twice meets a man who has seen it (Messi's run moved the
     * final more than anything else in e1) */
    KW_Z_THROUGH_DEEP: 'long pass from deep', KW_Z_DRIBBLE_TWO: 'run at two defenders', KW_Z_DRIBBLE_BOX: 'run at two defenders',
    KW_Z_HEAD_DOWN: 'header down', KW_Z_EARLY_CROSS: 'early cross', KW_Z_LOW_CROSS: 'low cross', KW_Z_LATE_RUN: 'late run',
    PAIR_ONE_TWO: 'one-two', PAIR_OVERLAP: 'overlap', PAIR_FLICK: 'flick-on', PAIR_ROUTINE: 'far-post routine'
  };
  var TIMES = ['', 'once', 'twice', 'three times'];
  function times(k) { return TIMES[k] || k + ' times'; }
  var SIDE = ['left', 'middle', 'right'];
  function laneOf(p) { return O().lane(p); }
  function counterMode(opts) {
    var m = opts && opts.counter;
    if (!m && typeof process !== 'undefined' && process.env && process.env.KM_COUNTER) m = process.env.KM_COUNTER;
    return COUNTER_MODES[m] ? m : COUNTER_DEFAULT;
  }
  function teamName(sq) { return (sq && sq.club) || 'They'; }

  /* what the counterplay does to one of your options: parts for your number
   * (mine) and for theirs (theirs), each with the sentence for the card */
  function counterFor(st, q) {
    var out = { mine: [], theirs: [], notes: [] };
    var cm = st.cmem;
    if (!cm || st.counter === 'off' || !NOUN[q.id]) return out;
    if (st.counter === 'learn' && q.foil && isKeeper(st, q.foil)) {
      /* f2: the keeper reads the last shot instead of learning */
      var kind = SHOT_KIND[q.id], last = cm.keeper;
      /* he reads it between attacks: a second shot in the same attack (a
       * rebound) is not read, which on the harness halved the matches where
       * one route scored twice (21 to 11 in 300 as Spain) */
      if (cm.keeperN === st.n) last = null;
      if (kind && last) {
        var kn = first(q.foil);
        if (kind === last) {
          out.theirs.push({ n: KEEP_UP, why: kn + ' faced a ' + SHOT_NOUN[last] + ' last time and is ready for another' });
          out.notes.push(kn + ' faced a ' + SHOT_NOUN[last] + ' last time and is ready for another: +' + KEEP_UP + ' to him');
        } else if (KEEP_DOWN) {
          out.theirs.push({ n: -KEEP_DOWN, why: kn + ' is ready for another ' + SHOT_NOUN[last] + ', not a ' + SHOT_NOUN[kind] });
          out.notes.push(kn + ' is ready for another ' + SHOT_NOUN[last] + ', not a ' + SHOT_NOUN[kind] + ': -' + KEEP_DOWN + ' to him');
        }
      }
    } else if (st.counter === 'learn' && q.foil) {
      var k = cm.learn[learnKey(q)] || 0;
      if (k) {
        var n = LEARN_STEP * Math.min(LEARN_MAX, k);
        out.theirs.push({ n: n, why: first(q.foil) + ' has seen this ' + NOUN[q.id] + ' ' + times(k) });
        out.notes.push(first(q.foil) + ' has seen this ' + NOUN[q.id] + ' ' + times(k) + ': +' + n + ' to him');
        out.learned = { foil: q.foil, k: k, near: cm.beat[learnKey(q)] || q.actor };
      }
    }
    /* f2: the room a learned defender leaves (chosen by counterRoom) */
    var rm = st.counter === 'learn' && st.room;
    if (rm && rm.target && rm.target.id === q.id && rm.target.actor === q.actor && rm.target.foil === q.foil && rm.target.to === (q.to || null)) {
      out.mine.push({ n: ROOM_BY, why: first(rm.foil) + ' is staying close to ' + first(rm.near) });
      out.notes.push(first(rm.foil) + ' is staying close to ' + first(rm.near) + ': +' + ROOM_BY + ' to ' + first(q.actor));
    } else if (rm && rm.source && rm.source.id === q.id && rm.source.foil === q.foil && rm.source.actor === q.actor) {
      out.notes.push(first(rm.foil) + ' is staying close to ' + first(rm.near) + ', so ' + roomPhrase(rm.target) + ': +' + ROOM_BY);
    }
    if (st.counter === 'fade') {
      var f = cm.fade[q.id];
      if (f && st.n + 1 <= f.until) {
        out.mine.push({ n: -FADE_BY, why: 'they are ready for the ' + NOUN[q.id] + ' now' });
        out.notes.push('They are ready for the ' + NOUN[q.id] + ' now: -' + FADE_BY + ' to ' + first(q.actor));
      }
    }
    if (st.counter === 'adapt' && cm.adapt.set) {
      var a = cm.adapt.set, T = teamName(st.opp);
      var ln = laneOf(q.actor), lt = q.to ? laneOf(q.to) : ln;
      if (a.side !== null && (ln === a.side || lt === a.side)) {
        out.theirs.push({ n: ADAPT_BY, why: T + ' have a second player on the ' + SIDE[a.side] });
        out.notes.push(T + ' have a second player on the ' + SIDE[a.side] + ' since half-time: +' + ADAPT_BY + ' against ' + first(q.actor));
      } else if (a.side !== null && a.room !== null && ln === a.room) {
        out.mine.push({ n: ADAPT_BY, why: T + ' moved a player off the ' + SIDE[a.room] });
        out.notes.push(T + ' moved a player off the ' + SIDE[a.room] + ' at half-time: +' + ADAPT_BY + ' to ' + first(q.actor));
      }
      if (a.man && (q.actor === a.man || q.to === a.man)) {
        out.theirs.push({ n: ADAPT_BY, why: T + ' put a second player on ' + first(a.man) });
        out.notes.push(T + ' put a second player on ' + first(a.man) + ' at half-time: +' + ADAPT_BY + ' against ' + first(q.actor));
      }
    }
    return out;
  }

  /* f2: "the pass through to Williams has more room" */
  function roomPhrase(t) {
    var nn = NOUN[t.id];
    if (t.to && t.to !== t.actor && !t.shot) return 'the ' + nn + ' to ' + first(t.to) + ' has more room';
    if (t.id === 'Z_TAKE_ON') return first(t.actor) + ' has more room to run at ' + first(t.foil);
    return first(t.actor) + ' has more room for the ' + nn;
  }

  /* f2: given the menu about to be shown (options.js offer), pick where the
   * room is. The learned defender with the most looks on this menu is the
   * one staying close; the room is the best way forward on the same menu
   * that is a different move, does not go past him, and does not involve
   * the man he is staying close to. Menu order breaks ties, so it is the
   * same every time for the same menu. Returns null when there is none. */
  function counterRoom(st, live) {
    if (st.counter !== 'learn') return null;
    var src = null, best = 0;
    live.forEach(function (o) {
      var lr = o.learned;
      /* g2: the man he is staying close to is a man on that card (the one
       * who runs or the one the ball goes to); otherwise there is no room
       * line (g1 named the last man who beat him, who was often not on the
       * card: 54 of 105 menus with a room line) */
      if (GUARD.roomOnCard && lr && !(o.actor === lr.near || o.to === lr.near || (o.label && o.label.indexOf(first(lr.near)) >= 0))) return;
      if (lr && lr.k > best) { best = lr.k; src = { o: o, lr: lr }; }
    });
    if (!src) return null;
    var D = src.lr.foil, A = src.lr.near, pick = null, pv = -99;
    live.forEach(function (o) {
      /* +1 on something that cannot fail is not a pointer */
      if (o.certain) return;
      if (o === src.o || o.disabled || !o.foil || !o.actor || !NOUN[o.id] || NOT_ROOM[o.id]) return;
      if (o.id === src.o.id || o.foil === D || o.learned) return;
      var shot = isKeeper(st, o.foil);
      if (o.actor === A || (!shot && o.to === A)) return;
      /* nor a play that goes through him (a cross FROM the man he is
       * staying close to is not room) */
      if (o.label && A && o.label.indexOf(first(A)) >= 0) return;
      var v = typeof o.edge === 'number' ? o.edge : -99;
      if (v > pv) { pv = v; pick = o; }
    });
    if (!pick) return null;
    return { foil: D, near: A,
      source: { id: src.o.id, foil: src.o.foil, actor: src.o.actor },
      target: { id: pick.id, actor: pick.actor, foil: pick.foil, to: pick.to || null, shot: isKeeper(st, pick.foil) } };
  }

  /* after one of your decisions: what the opponent remembers */
  function counterRecord(st, p, o, band, effect) {
    var cm = st.cmem;
    if (!cm || !NOUN[o.id] || p.moment.sit.who !== 'you') return;
    var won = band === 'good' || effect === 'goal';
    if (st.counter === 'learn' && SHOT_KIND[o.id] && isKeeper(st, o.foil)) {
      /* f2: the keeper remembers the last shot, whatever became of it */
      cm.keeper = SHOT_KIND[o.id]; cm.keeperN = st.n;
    } else if (won && o.foil && !(st.counter === 'learn' && isKeeper(st, o.foil))) {
      var k = learnKey(o); cm.learn[k] = (cm.learn[k] || 0) + 1;
      if (o.actor) cm.beat[k] = o.actor;
    }
    if (won) cm.fade[o.id] = { until: p.index + 1 };
    if (p.index <= MOMENTS / 2) {
      /* the side of the pitch the move went down: where the ball went if it
       * was a pass, otherwise where the man with it is */
      var l = o.to && o.to !== o.actor ? laneOf(o.to) : laneOf(o.actor);
      cm.adapt.lanes[l]++;
      cm.adapt.total++;
      if (o.actor && /^Z_(SHOOT|PLACE|CHIP|SHOOT_FAR)$/.test(o.id)) {
        var r = cm.adapt.men[o.actor.id] || (cm.adapt.men[o.actor.id] = { p: o.actor, shots: 0, goals: 0 });
        r.shots++; if (effect === 'goal') r.goals++;
      }
    }
  }

  /* half-time: they change their setup to what you did most */
  function counterAdapt(st) {
    var cm = st.cmem, ad = cm.adapt;
    ad.done = true;
    if (st.counter !== 'adapt' || !ad.total) return null;
    var L = ad.lanes, side = 0;
    for (var i = 1; i < 3; i++) if (L[i] > L[side]) side = i;
    /* a side only if it was clearly where you went: most of it, and at least 3 */
    var second = L.slice().sort(function (a, b) { return b - a; })[1];
    if (L[side] < 3 || L[side] === second) side = null;
    var room = side === null ? null : side === 1 ? null : (L[0] <= L[2] ? 0 : 2);
    if (room === side) room = null;
    var man = null, best = -1;
    Object.keys(ad.men).forEach(function (id) {
      var r = ad.men[id], v = r.goals * 10 + r.shots;
      if (v > best) { best = v; man = r; }
    });
    if (side === null && !man) return null;
    ad.set = { side: side, room: room, man: man ? man.p : null };
    var T = teamName(st.opp), bits = [];
    if (side !== null) bits.push('a second player on the ' + SIDE[side] + ', where ' + L[side] + ' of your ' + ad.total + ' attacking decisions went');
    if (man) bits.push('a second player on ' + first(man.p) + ' (' + (man.goals ? man.goals + ' goal' + (man.goals > 1 ? 's' : '') + ' from ' : '') +
      man.shots + ' shot' + (man.shots > 1 ? 's' : '') + ' in the first half)');
    return 'After half-time ' + T + ' put ' + bits.join(', and ') + '.' +
      (room !== null ? ' That leaves more room on the ' + SIDE[room] + '.' : '');
  }


  function newMatch(squad, opp, seed, style, opts) {
    return {
      chainMode: !(opts && opts.chain === false), chain: null,
      squad: squad, opp: opp, seed: seed,
      rng: new C.RNG(seed),
      style: style || { press: 60, direct: 50, width: 50 },
      n: 0, score: { you: 0, them: 0 },
      log: [], pending: null, forcedTheirs: false, forcedYours: false, follow: null,
      /* minute each line was last refreshed by a substitution, so "stamina
       * back to 100" is a thing that happens rather than a thing it says */
      rested: { def: null, mid: null, att: null },
      subsLeft: 3, booked: {},
      spent: { def: 0, mid: 0, att: 0 }, usedSubs: {},
      /* who was in each situation already, so a repeat casts other men */
      seen: {},
      /* e1 CARRY-OVER (from c2): a shot's result stays with the man who
       * took it until his next shot; their men booked for tripping yours;
       * your Destroyer's one foul with no card */
      form: {}, oppBooked: {}, freeFouls: {},
      /* e1: THE STATE OF PLAY, one object every sentence reads from (see
       * playOf): who is attacking, where, whether the ball is in the air,
       * and which named man has it */
      play: null,
      /* g1 (f1/f2): what the opponent remembers of your attacks */
      counter: counterMode(opts),
      cmem: { learn: {}, beat: {}, keeper: null, fade: {}, adapt: { lanes: [0, 0, 0], total: 0, men: {}, set: null, done: false } }
    };
  }

  /* THE STATE OF PLAY (e1). The worst bugs of the a3 review came from
   * sentences composed without it: after a failed pass the next decision
   * gave the ball to someone else, a header was offered for a ball on the
   * ground, and the man through on goal changed name. So each decision
   * carries this, the options read it (options.js: a header needs
   * play.air), and the tests check the sentences against it. */
  function playOf(side, zone, ball, opts) {
    opts = opts || {};
    return { attacking: side, zone: zone, air: !!opts.air, ball: ball || null,
      target: opts.target || null, via: opts.via || null, mode: opts.mode || null };
  }
  var AIR_VIA = { cross: 1, corner: 1, fkcross: 1, header: 1 };
  /* e1: switches for the tests, which show each check fails without the
   * rule it guards (test.js "E1") */
  var GUARD = { theirTo: true, form: true, theirBreak: true, lastOne: true, lastWin: true, roomOnCard: true, freshScene: true, caughtShot: true, diceNote: true, halfSame: true };
  /* the state of play in names, for the log (never the player objects) */
  function playNames(pl) {
    if (!pl) return null;
    return { attacking: pl.attacking, zone: pl.zone, air: pl.air, via: pl.via, mode: pl.mode,
      ball: pl.ball ? first(pl.ball) : null, target: pl.target ? first(pl.target) : null, near: pl.near ? first(pl.near) : null };
  }

  function minute(st) { return st.minuteNow || MINUTES[Math.min(st.n, MINUTES.length - 1)]; }
  function legs(st) {
    var now = M.legsAt(st.style, minute(st), st.squad);
    ['def', 'mid', 'att'].forEach(function (k) {
      var at = st.rested[k];
      if (at !== null) {
        var burnedBefore = 100 - M.legsAt(st.style, at, st.squad)[k];
        now[k] = Math.min(100, now[k] + burnedBefore);
      }
      /* what your own choices spent (options.js costOf), on top of the
       * clock; a substitution wipes it for that line */
      now[k] = Math.max(0, now[k] - ((st.spent && st.spent[k]) || 0));
    });
    return now;
  }
  function state(st) {
    var s = M.freshState(minute(st), legs(st), { you: st.score.you, them: st.score.them });
    /* a follow-up ends the attack: no second switch, so a play cannot chain
     * forever and the decision in front of you is how to finish it */
    if (st.follow) s.finishOnly = true;
    /* the last of your decisions in an event: nothing may carry it on */
    if (st.chainMode && st.chain && st.chain.next === 'zone' && st.chain.youSteps + 1 >= (st.chain.cap || CHAIN_CAP)) s.finishOnly = true;
    /* your keeper's pass out can start your attack (options.js escape) */
    if (st.chainMode) s.zoneEscape = true;
    /* winning the ball back starts your attack, on the first decision of
     * their attack only (options.js winback) */
    if (st.chainMode && !st.chain) s.winBack = true;
    s.subsLeft = st.subsLeft; s.usedSubs = st.usedSubs; s.booked = st.booked;
    s.form = st.form; s.oppBooked = st.oppBooked; s.freeFouls = st.freeFouls; s.stepNo = st.log.length;
    s.kwPrev = st.kwPrev || {};
    /* g1 (f1/f2): what the opponent has learned (options.js reads it on your
     * attack). Named counterplay, not counter: e2's state.counter is "their
     * counter-attack" */
    s.counterplay = function (q) { return counterFor(st, q); };
    s.counterRoom = function (live) { return counterRoom(st, live); };
    s.setRoom = function (r) { st.room = r || null; };
    return s;
  }

  function isOver(st) { return st.n >= MOMENTS && !st.pending; }

  /* g1 (from p2): how many real choices the next decision of this attack
   * would have: live, and its good result more than 2 times in 36 */
  function nextLive(st) {
    var zc = st.chain, s = state(st);
    s.seen = st.seen; s.prevCarrier = zc.prev || null; s.carried = zc.carried || null; s.rebounded = !!zc.rebounded;
    s.mode = zc.mode || null; s.play = playOf('you', zc.zone, zc.carrier, { mode: s.mode });
    var zmo = M.zoneMoment(M.ZONE_SITS[zc.zone], zc.zone, zc.carrier, st.squad, st.opp, st.style, s);
    return zmo.options.filter(function (o) {
      if (o.disabled) return false;
      var g = (o.outcomes || []).filter(function (x) { return (x.bands || [x.band]).indexOf('good') >= 0; })
        .reduce(function (a, x) { return a + x.p; }, 0);
      return g > NEXT_REAL;
    }).length;
  }
  /* what counts as a real choice for that test: p2 used "comes off more
   * than 2 times in 36"; g1 counts any live option, so an attack is cut
   * short only when the next menu would have one button (measured: the
   * stricter test cost 3 points of attacks reaching 3 decisions) */
  var NEXT_REAL = -1;

  /* Draw the next moment. A failed gamble hands them the next one, which is
   * the chain he asked for: a disaster is another decision, not a scoreline. */
  function next(st) {
    if (isOver(st)) return null;
    /* f1: at the first event of the second half, they may change their
     * setup (adapt), said in one line above that event */
    var announce = null;
    if (st.cmem && !st.cmem.adapt.done && st.n >= MOMENTS / 2 && !st.chain) {
      announce = counterAdapt(st);
      if (announce) st.announced = announce;
    }
    var p = nextMoment(st);
    if (p && announce) p.announce = announce;
    if (p) annotate(p);
    return p;
  }
  /* call3: every result on the menu gets its icon and short form here,
   * where the ball is known (options.js iconOf: one function, from the
   * result's data and this decision's zone, never per card). Reads the
   * state, changes nothing. */
  function annotate(p) {
    var who = p.moment.sit.who, zoned = typeof p.zoneIndex === 'number';
    var info = { who: who, pos: zoned ? p.zoneIndex : (who === 'them' ? 0 : 2), zoned: zoned,
      tzone: typeof p.tzone === 'number' ? p.tzone : null, flipOk: !!p.flipOk };
    if (O().annotate) O().annotate(p.moment.options, info);
    p.iconInfo = info;
  }
  function nextMoment(st) {
    /* WINNING THE BALL IS THE NEXT MOMENT (a4): when you win the ball in
     * their attack, your attack from there is the next of the six moments,
     * a minute later, rather than more decisions inside theirs. It keeps a
     * match to about a dozen decisions. */
    var handoff = false;
    if (st.chainMode && st.handoff && !st.chain) { st.chain = st.handoff; st.handoff = null; handoff = true; }
    var s = state(st);
    s.seen = st.seen;
    var zc = st.chainMode ? st.chain : null;
    if (zc && zc.next === 'box') {
      /* their man is in your box: the last decision of their attack (a3) */
      s.flipOk = !!zc.flipOk; s.carried = zc.carried || null; s.bounced = !!zc.bounced;
      s.theirCarried = (zc.theirCarried || []).concat(zc.counterEdge ? [zc.counterEdge] : []);
      s.crosser = zc.via === 'cross' ? zc.foil : null;
      s.play = playOf('them', -1, zc.foil, { air: !!AIR_VIA[zc.via], via: zc.via });
      var bmo = M.boxMoment(zc.foil, zc.via, zc.blocker, st.squad, st.opp, st.style, s);
      s.play.via = bmo.via; s.play.air = !!AIR_VIA[bmo.via]; s.play.target = bmo.cast.foil;
      st.pending = {
        moment: bmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.THEIR_BOX, zoneIndex: -1, attacking: 'them', flipOk: !!zc.flipOk, bounced: !!zc.bounced, counterEdge: zc.counterEdge || null,
        carried: (zc.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; }),
        theirCarried: s.theirCarried, theirCarry: s.theirCarried[0] || null,
        play: s.play, threat: bmo.threat || null, via: bmo.via
      };
      return st.pending;
    }
    if (zc && (zc.next === 'tzone' || zc.next === 'counter')) {
      /* THEIR ATTACK GOES ON (a4), or starts as a counter after you lost
       * the ball: the zone it is in decides how you can defend */
      var counter = zc.next === 'counter'; st.brokeFrom = null;
      var tz = counter ? zc.counterTz : zc.tz;
      s.carried = counter ? null : (zc.carried || null);
      /* a4: on their counter, the edge from how you lost the ball stays with
       * them for the whole counter, against your outfield players */
      var cEdge = counter ? zc.theirCarry || null : zc.counterEdge || null;
      s.theirCarried = (counter ? [] : (zc.theirCarried || [])).concat(cEdge ? [cEdge] : []);
      if (!s.theirCarried.length) s.theirCarried = null;
      s.flipOk = !counter && !!zc.flipOk; s.firstStep = false;
      s.tCapped = (counter ? 0 : (zc.tSteps || 0)) + 1 >= T_CAP;
      var base = counter ? M.COUNTER_SIT : zc.sit;
      var tsit = { id: base.id, name: base.name, who: 'them', line: '' };
      /* your Ball winner wins it straight back only right after you lost it */
      s.counter = counter;
      s.counterTaker = counter ? zc.counterTaker || null : null;
      s.tVia = counter ? null : zc.via || null;
      s.play = playOf('them', tz === 0 ? 1 : 0, counter ? zc.counterFoil : zc.foil);
      var tmo = M.theirZoneMoment(tsit, tz, counter ? zc.counterFoil : zc.foil, st.squad, st.opp, st.style, s);
      s.play.ball = tmo.cast.foil; s.play.near = tmo.cast.actor;
      st.pending = {
        moment: tmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: counter ? zc.brokeFrom || null : null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.T_ZONES[tz], zoneIndex: tz === 0 ? 1 : 0, tzone: tz, attacking: 'them',
        flipOk: s.flipOk, tSteps: counter ? 0 : (zc.tSteps || 0), via: counter ? null : zc.via || null, bounced: !counter && !!zc.bounced,
        counterEdge: cEdge, isCounter: s.counter,
        carried: (s.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; }),
        theirCarried: s.theirCarried || [], theirCarry: (s.theirCarried || [])[0] || null,
        play: s.play, threat: tmo.threat || null
      };
      return st.pending;
    }
    if (zc && zc.next === 'zone') {
      /* the attack goes on, in the zone the last decision put the ball in */
      s.prevCarrier = zc.prev || null;
      s.rebounded = !!zc.rebounded;
      s.carried = zc.carried || null;
      s.mode = zc.mode || null;
      s.play = playOf('you', zc.zone, zc.carrier, { mode: s.mode });
      var zmo = M.zoneMoment(M.ZONE_SITS[zc.zone], zc.zone, zc.carrier, st.squad, st.opp, st.style, s);
      s.play.ball = zmo.cast.actor;
      st.pending = {
        moment: zmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.ZONES[zc.zone], zoneIndex: zc.zone, carrier: zmo.cast.actor, mode: s.mode, play: s.play,
        /* what the last decision won, in words, for the screen (a2) */
        carried: (zc.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; })
      };
      if (handoff) {
        st.pending.continues = false; st.pending.handoff = true;
        /* call: the attack you start by winning the ball opens with where
         * the ball is; the second time the same man has it there, it says
         * "again" (round 4 review: the same opening scene twice) */
        if (GUARD.freshScene) {
          var f0 = String(zmo.text || '').split('. ')[0];
          st.handoffSeen = st.handoffSeen || {};
          if (st.handoffSeen[f0]) zmo.text = f0 + ' again' + String(zmo.text).slice(f0.length);
          st.handoffSeen[f0] = 1;
        }
      }
      /* g1: the page says when this is the last decision of your attack
       * (the review: a kept ball then "the attack is over" with no warning) */
      st.pending.lastStep = !!s.finishOnly;
      return st.pending;
    }
    var w = M.weights(st.squad, st.opp, st.style, s);
    /* damp what has already happened (see REPEAT_DAMP); a follow-up is
     * exempt because it is chosen from a fixed pair on purpose */
    if (!st.follow && !(st.chainMode && st.chain)) {
      w.rows.forEach(function (r) {
        var n = st.seen[r.sit.id] ? st.seen[r.sit.id].count : 0;
        if (n) r.raw *= Math.pow(REPEAT_DAMP, n);
      });
    }
    var row;
    /* Pick weighted, among either every situation or only one side's. Taking
     * side[0] when a moment was forced meant a broken attack always produced
     * the SAME counter-attack, so a match that chained twice showed the same
     * scene twice with the same three options. */
    var pool = w.rows, follow = st.follow, ch = st.chainMode ? st.chain : null;
    if (ch) {
      /* the event goes on: their counter, or your move carried on */
      var want2 = ch.next === 'counter' ? COUNTERS : ch.next === 'keep' ? CHAIN_KEEP : CHAIN_GROUND;
      var on2 = w.rows.filter(function (r) { return want2[r.sit.id] && r.sit.id !== ch.lastSit; });
      if (!on2.length) on2 = w.rows.filter(function (r) { return want2[r.sit.id]; });
      if (on2.length) pool = on2;
    } else if (follow) {
      var on = w.rows.filter(function (r) { return FOLLOW_ON[r.sit.id]; });
      if (on.length) pool = on;
    } else if (st.forcedTheirs || st.forcedYours) {
      var want = st.forcedTheirs ? 'them' : 'you';
      var side = w.rows.filter(function (r) {
        return r.sit.who === want && (!st.forcedTheirs || COUNTERS[r.sit.id]);
      });
      if (!side.length) side = w.rows.filter(function (r) { return r.sit.who === want; });
      if (side.length) pool = side;
      st.forcedTheirs = false; st.forcedYours = false;
    }
    /* call: THE SAME OPENING SCENE NEVER TWICE IN ONE MATCH (round 4
     * review: 86 of 200 matches showed one twice; the damping made a repeat
     * rarer, not impossible). A new moment is picked from the situations not
     * yet seen this match, while there are any on that side. */
    if (GUARD.freshScene && !ch && !follow) {
      var fresh = pool.filter(function (r) { return !(st.seen[r.sit.id] && st.seen[r.sit.id].count); });
      if (fresh.length) pool = fresh;
    }
    var total = pool.reduce(function (a, r) { return a + r.raw; }, 0);
    var roll = st.rng.next() * total, acc = 0;
    row = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) {
      acc += pool[i].raw;
      if (roll <= acc) { row = pool[i]; break; }
    }
    var mo, zi = null, tzi = null, startVia = null;
    s.theirCarry = ch && ch.next === 'counter' && ch.theirCarry ? ch.theirCarry : null;
    if (st.chainMode && row.sit.who === 'you' && M.START_ZONE[row.sit.id] !== undefined) {
      /* your attack starts where the situation puts the ball, with the man
       * the situation is about on it */
      zi = M.START_ZONE[row.sit.id];
      var who = M.castFor(row.sit, st.squad, st.opp, s).actor;
      s.play = playOf('you', zi, who);
      /* the man the situation is about has it (the midfielder who won it
       * back in a press trap, the full-back on the overlap). If he is not
       * the best man for the zone, giving it to someone better is one of
       * the choices (options.js Z_LAYOFF). */
      mo = M.zoneMoment(row.sit, zi, who, st.squad, st.opp, st.style, s);
    } else if (st.chainMode && row.sit.who === 'them' && row.sit.id !== 'keeper_to_feet' && !ch) {
      /* their attack starts in a zone (a4): midfield, or already at the
       * edge of your box for a ball over the top, their winger one against
       * one or a siege. The man the situation is about has the ball. */
      tzi = M.T_START[row.sit.id] !== undefined ? M.T_START[row.sit.id] : 1;
      s.flipOk = true; s.firstStep = true; s.tCapped = 1 >= T_CAP; s.carried = null; s.theirCarried = null;
      /* at the edge of your box the man the situation is about has it (their
       * winger, the forward running onto the ball over the top); e1: their
       * keyword moment is about the man with the keyword */
      var tf = row.sit.threat && row.sit.id !== 'their_cross' ? M.threatFoil(row.sit.id, st.opp, st.seen[row.sit.id])
        : row.sit.id === 'their_winger' ? M.theirWinger(st.opp, st.seen[row.sit.id])
        : tzi >= 1 ? M.castFor(row.sit, st.squad, st.opp, s).foil : M.theirCarrier(tzi, st.opp, st.seen);
      if (START_EDGES && M.T_START_EDGE[row.sit.id]) s.theirCarried = [M.T_START_EDGE[row.sit.id](tf)];
      if (tzi === 2) {
        /* a siege is already in your box: the ball is crossed in again. e1:
         * their cross (their keyword moment) is high to their Target man or
         * low from their Crosser */
        var plan = row.sit.id === 'their_cross' || row.sit.id === 'siege' ? M.crossPlan(st.opp) : null;
        if (plan) { s.crossTarget = plan.target; s.crosser = plan.crosser; tf = plan.crosser; startVia = plan.high ? 'cross' : 'lowcross'; }
        else { s.crossTarget = tf; s.crosser = null; startVia = 'cross'; }
        s.play = playOf('them', -1, tf, { air: startVia === 'cross', via: startVia, target: s.crossTarget });
        mo = M.boxMoment(tf, startVia, null, st.squad, st.opp, st.style, s);
        mo.sit = row.sit; mo.text = (row.sit.id === 'their_cross' ? '' : row.sit.line + ' ') + mo.text;
      } else {
        /* a ball over your defence is in the air when it arrives: nobody
         * has it, and tf is running onto it */
        var inAir = row.sit.id === 'over_the_top';
        s.play = playOf('them', tzi === 0 ? 1 : 0, inAir ? null : tf, { air: inAir, target: inAir ? tf : null });
        s.tVia = row.sit.id === 'their_winger' ? 'cross' : null;
        mo = M.theirZoneMoment(row.sit, tzi, tf, st.squad, st.opp, st.style, s);
      }
      mo.cast.foil = mo.cast.foil || tf;
    } else {
      s.play = playOf(row.sit.who, row.sit.id === 'keeper_to_feet' ? -1 : 0, row.sit.id === 'keeper_to_feet' ? st.squad.keeper : null);
      mo = M.moment(row.sit, st.squad, st.opp, st.style, s);
    }
    var seen = st.seen[row.sit.id] || (st.seen[row.sit.id] = { count: 0, actors: {}, foils: {} });
    if (!follow && !ch) seen.count++;
    if (mo.cast.actor) seen.actors[mo.cast.actor.id] = 1;
    if (mo.cast.foil) seen.foils[mo.cast.foil.id] = 1;
    st.pending = {
      moment: mo, share: row.pct, minute: minute(st), index: st.n + 1,
      legs: s.legs, broke: st.brokeFrom || null,
      continues: !!follow || !!ch,
      lead: follow ? follow.text : (ch && ch.next !== 'counter' ? ch.text : null),
      step: ch ? ch.step + 1 : 1,
      play: s.play || null, threat: mo.threat || null
    };
    if (s.play && tzi === null && zi !== null) s.play.ball = mo.cast.actor;
    if (st.chainMode) {
      /* where the ball is. Their attacks are always in your half. */
      st.pending.zoneIndex = zi === null ? 0 : zi;
      st.pending.zone = M.ZONES[st.pending.zoneIndex];
      if (tzi === 2) {
        st.pending.zoneIndex = -1; st.pending.zone = M.THEIR_BOX; st.pending.flipOk = true; st.pending.via = mo.via || startVia;
        if (s.play) { s.play.via = mo.via || startVia; s.play.air = !!AIR_VIA[s.play.via]; s.play.target = mo.cast.foil; }
      } else if (tzi !== null) {
        st.pending.tzone = tzi; st.pending.zoneIndex = tzi === 0 ? 1 : 0; st.pending.zone = M.T_ZONES[tzi];
        st.pending.flipOk = true; st.pending.tSteps = 0;
        if (s.theirCarried) { st.pending.theirCarried = s.theirCarried; st.pending.theirCarry = s.theirCarried[0]; }
        st.pending.via = row.sit.id === 'their_winger' ? 'cross' : null;
      }
      st.pending.attacking = row.sit.who;
      if (s.theirCarry) { st.pending.theirCarry = s.theirCarry; st.pending.theirCarried = [s.theirCarry]; }
      st.pending.carried = [];
      if (zi !== null) st.pending.carrier = mo.cast.actor;
    }
    st.brokeFrom = null;
    st.follow = null;
    return st.pending;
  }

  /* Resolve a choice. Returns what happened, in the same plain words the
   * option promised, so nothing arrives that was not on the card. */
  function choose(st, index) {
    var p = st.pending;
    if (!p) return null;
    /* e1: the keyword options this menu showed (options.js: not two running) */
    st.kwPrev = {};
    p.moment.options.forEach(function (o) { if (o.unlock && !o.disabled) st.kwPrev[o.unlock] = 1; });
    var live = p.moment.options.filter(function (o) { return !o.disabled; });
    var o = live[index];
    if (!o) return null;

    /* Roll the dice the card promised. The screen says "Pace 13 + roll(1 to 6)
     * against Pace 11 + roll(1 to 6)", so that is literally what happens here,
     * and the feed prints both numbers. Before this it drew one number against
     * the odds, which gave the same distribution but nothing to show him. */
    var ch = o.chances, band, dice = null;
    if (o.mineVal !== null && o.themVal !== null) {
      var d1 = 1 + Math.floor(st.rng.next() * 6);
      var d2 = 1 + Math.floor(st.rng.next() * 6);
      var mineTotal = o.mineVal + d1, themTotal = o.themVal + d2;
      var diff = mineTotal - themTotal;
      band = diff >= R.GOOD_BY ? 'good' : (diff >= 0 ? 'mixed' : 'bad');
      dice = {
        mine: d1, theirs: d2, mineTotal: mineTotal, themTotal: themTotal, diff: diff,
        /* call: a win by 1 to 3 is not a clean result, and the banner says
         * so under the totals (round 4 review: "you win the roll and it goes
         * wrong", with nothing on screen saying a clean result needs 4) */
        margin: GUARD.diceNote && diff >= 1 && diff < R.GOOD_BY ? 'edged it by ' + diff + ': half a win (' + R.GOOD_BY + ' or more is a clean win)' : null,
        /* o.mineVal already carries the bonus, so the feed has to say where it
         * came from or the number will not match the player's card. */
        /* every part of the number, named: base, then each bonus with where
         * it came from (a2: carried advantage adds parts) */
        line: first(o.actor) + ' ' + statName(o.mineAttr) + ' ' + o.mineVal + parts(o.mineVal, o.mods, o.bonus, o.because) +
          ' + ' + d1 + ' = ' + mineTotal + '   against   ' + first(o.foil) + ' ' +
          statName(o.themAttr) + ' ' + o.themVal + parts(o.themVal, o.theirMods) + ' + ' + d2 + ' = ' + themTotal
      };
    } else {
      var r = st.rng.next();
      band = r < ch.good ? 'good' : (r < ch.good + ch.mixed ? 'mixed' : 'bad');
    }

    /* The words and the scoreline come from the same row of the same table. */
    var picked = null;
    /* g1 (from p2): a line can stand for two dice results when they end the
     * same way (options.js GUARD.merge, `bands`) */
    (o.outcomes || []).forEach(function (x) { if ((x.bands || [x.band]).indexOf(band) >= 0) picked = x; });
    if (!picked) picked = { band: band, text: o.label + '.', effect: band === 'bad' ? 'nothing' : 'nothing' };
    /* call3: when a half win and a clean win end the same way (one line on
     * the card covers both), the banner does not talk about half and clean
     * wins: "Yamal won by 2" (Eduardo: "edged it by 2: half a win" over a
     * safe pass that simply kept the ball) */
    if (dice && GUARD.halfSame && band === 'mixed' && (picked.bands || [picked.band]).indexOf('good') >= 0) {
      dice.margin = null; dice.halfSame = true;
    }

    var ev = {
      minute: p.minute, index: p.index, label: o.label, band: band,
      certain: !!ch.certain, check: o.check, sit: p.moment.sit,
      dice: dice, effect: picked.effect, text: picked.text,
      cont: !!p.continues, pays: o.pays, optionId: o.id,
      headline: headline(picked.effect, p.moment.sit.who, o.pays),
      /* call3: the icon and short form of the result that happened */
      icon: picked.icon || (O().iconOf && p.iconInfo ? O().iconOf(picked, o, p.iconInfo).icon : null),
      iconRule: picked.iconRule || null, short: picked.short || null, fromZone: typeof p.zoneIndex === 'number' ? p.zoneIndex : null,
      /* e1: whose keyword made this option, and which of theirs shaped it */
      unlock: o.unlock || null, threat: o.threat || null, play: playNames(p.play),
      /* p3: who was in it, for the report at full time */
      actorName: o.actor ? first(o.actor) : null, foilName: o.foil ? first(o.foil) : null, shot: !!o.shotBy,
      uses: (o.uses || []).filter(function (u) { return u.n && !u.part; }).map(function (u) { return { name: u.name, n: u.n }; }),
      /* call2: what the page's verdict line needs: every edge that applied
       * to this roll, on both sides, and which stat each man rolled */
      mods: (o.mods || []).map(function (m) { return { n: m.n, why: m.why }; }),
      theirMods: (o.theirMods || []).map(function (m) { return { n: m.n, why: m.why }; }),
      bonus: o.bonus || 0, because: o.because || null,
      mineStat: o.mineAttr ? statName(o.mineAttr) : null, themStat: o.themAttr ? statName(o.themAttr) : null
    };

    switch (picked.effect) {
      case 'goal':
        st.score.you++; ev.kind = 'goal'; ev.text = 'GOAL. ' + picked.text; break;
      case 'concede':
        st.score.them++; ev.kind = 'conceded'; ev.text = 'THEY SCORE. ' + picked.text; break;
      case 'break':
        /* e1: only YOUR gamble loses the ball. On their attack 'break' is
         * their man getting past yours (the zone code below says where to);
         * a5 counted it as you losing the ball, which forced the next event
         * to be theirs and printed "You lost the ball going forward" over it */
        if (p.moment.sit.who !== 'you' && GUARD.theirBreak) { ev.kind = 'past'; break; }
        ev.kind = 'lost'; st.forcedTheirs = true; st.brokeFrom = o.label;
        ev.chains = 'The next moment is theirs.'; break;
      case 'ground':
        /* the play is not over: the same attack continues, same minute, and
         * it does not use up one of the six moments */
        ev.kind = 'ground';
        st.follow = { text: picked.text };
        ev.chains = 'The same attack goes on.'; break;
      case 'rest':
        ev.kind = 'rest';
        /* the line the option names (restLine), since the man coming on is
         * a bench player with no line; before this, nothing was restored */
        var rl = o.restLine || (o.actor && typeof o.actor.line === 'number' ? ['def', 'mid', 'att'][o.actor.line] : null);
        if (rl) { st.rested[rl] = p.minute; st.spent[rl] = 0; ev.restLine = rl; }
        if (o.actor) st.usedSubs[o.actor.id] = 1;
        st.subsLeft = Math.max(0, st.subsLeft - 1);
        break;
      case 'stopped': ev.kind = 'stopped'; break;
      default: ev.kind = 'nothing';
    }

    /* f1: what the opponent remembers of this decision */
    counterRecord(st, p, o, band, picked.effect);

    /* the running is paid whatever happened */
    if (o.cost && picked.effect !== 'rest') {
      st.spent[o.cost.line] += o.cost.amount;
      ev.cost = o.cost;
    }

    /* a booking sticks for the rest of the match */
    if ((o.id === 'FOUL' || o.id === 'M_FOUL' || ((o.id === 'E_FOUL' || o.id === 'TD_FOUL') && band !== 'bad')) && o.actor) {
      if (!st.booked[o.actor.id]) ev.booked = first(o.actor) + ' is on a yellow card: Defending -2 for the rest of the match.';
      st.booked[o.actor.id] = true;
    }
    /* e1: your Destroyer's one foul with no card is used up */
    if (o.freeFoul && o.actor) st.freeFouls[o.actor.id] = true;
    /* e1: their man who tripped your Dribbler is booked, and your players
     * run at him at +2 for the rest of the match (c2) */
    if (picked.trip && !st.oppBooked[picked.trip.id]) {
      st.oppBooked[picked.trip.id] = p.minute;
      ev.booked = first(picked.trip) + ' is on a yellow card: +2 to your players running at ' + first(picked.trip) + ' for the rest of the match.';
    }
    /* e1 CARRY-OVER (from c2): a shot is remembered by the man who took it,
     * until his next shot; the one he takes now spends what he carried */
    if (o.formUse && o.actor) delete st.form[o.actor.id];
    if (o.shotBy && GUARD.form) {
      var sn = first(o.shotBy);
      if (picked.effect === 'goal') {
        st.form[o.shotBy.id] = { n: 1, why: sn + ' scored at ' + p.minute + ' minutes' };
        ev.carry = sn + ' scored: +1 the next time ' + sn + ' shoots.';
      } else {
        st.form[o.shotBy.id] = { n: -2, why: sn + ' missed a chance at ' + p.minute + ' minutes' };
        ev.carry = sn + ' missed the chance: -2 the next time ' + sn + ' shoots.';
      }
    }

    if (st.chainMode && typeof p.tzone === 'number') {
      /* THEIR ATTACK BY ZONES (a4) */
      ev.step = p.step || 1; ev.zone = p.zone; ev.zoneIndex = p.zoneIndex;
      var tSteps = (p.tSteps || 0) + 1;
      var yourGot = ((o.grants && o.grants[band]) || []).slice();
      /* their edge: from a duel they won, or (a4) from your keeper coming
       * out and only getting a touch */
      var theirGot = o.theirGrant && (band === 'bad' || (o.pays === 'tsweep' && band === 'mixed')) ? [o.theirGrant] : [];
      st.chain = null;
      if (picked.effect !== 'concede' && picked.win && (p.flipOk || o.counterWin)) {
        /* you won the ball: your attack starts from there, higher up the
         * earlier you won it */
        var wz = typeof o.winZone === 'number' ? o.winZone : 0;
        /* a defender who wins it gives it to a midfielder when the attack
         * starts in midfield or higher */
        var starter = o.counterWin && o.to ? o.to : wz >= 1 && o.actor && o.actor.line === 0 ? M.carrierFor(wz, st.squad, legs(st)) : o.actor;
        st.chain = { next: 'zone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
          zone: wz, carrier: starter, carried: yourGot, prev: null, cap: WIN_CAP };
        ev.kind = 'escaped'; ev.carried = yourGot.map(function (c) { return O().carryText(c); });
        ev.toZone = M.ZONES[wz]; ev.toZoneIndex = wz;
        ev.headline = 'You won the ball. Your attack starts ' + ZONE_AT[wz] + ': choose what happens next.';
        ev.chains = first(starter) + ' has the ball ' + ZONE_AT[wz] + '. Your attack starts.';
      } else if (picked.effect !== 'concede' && typeof picked.tmove === 'number') {
        var ntz = p.tzone + picked.tmove;
        var carrierT = (GUARD.theirTo && picked.theirTo) || (picked.tmove > 0 ? (o.theirTo || o.foil) : M.theirCarrier(0, st.opp, st.seen));
        if (ntz >= 2) {
          var via2 = picked.via || o.via || p.via || 'box';
          st.chain = { next: 'box', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            foil: carrierT, via: via2, blocker: o.actor && o.actor.line === 0 ? o.actor : null,
            flipOk: !!p.flipOk, carried: yourGot, theirCarried: theirGot, bounced: !!p.bounced, counterEdge: p.counterEdge || null };
          ev.kind = 'inbox';
          ev.headline = via2 === 'cross' || via2 === 'lowcross' ? first(carrierT) + ' is going to cross it into your box. One last chance to stop it.'
            : via2 === 'corner' ? 'They have a corner. One last chance to stop it.'
              : via2 === 'freekick' || via2 === 'fkcross' ? 'They have a free kick near your box. One last chance to stop it.'
                : via2 === 'alone' ? first(carrierT) + ' is through on your goal. One last chance to stop ' + first(carrierT) + '.'
                : first(carrierT) + ' is in your box. One last chance to stop ' + first(carrierT) + '.';
          ev.chains = 'Their attack goes on, into your box.';
        } else {
          st.chain = { next: 'tzone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            tz: ntz, foil: carrierT, sit: p.moment.sit, tSteps: tSteps, flipOk: !!p.flipOk, via: p.via || null,
            carried: yourGot, theirCarried: theirGot, counterEdge: p.counterEdge || null, isCounter: !!p.isCounter };
          if (picked.tmove > 0) {
            ev.kind = 'theyadvance';
            ev.headline = first(carrierT) + ' is at the edge of your box. Choose how to stop him.';
            ev.chains = 'Their attack goes on, at the edge of your box.';
          } else {
            ev.kind = 'pushedback';
            ev.headline = 'You pushed them back into midfield. Their attack goes on: choose how to stop it there.';
            ev.chains = 'Their attack goes on, in midfield.';
          }
        }
        ev.carried = yourGot.map(function (c) { return O().carryText(c); });
        if (theirGot.length) ev.theirCarry = theirGot[0].text;
      } else if (picked.effect === 'nothing') {
        ev.headline = 'They did not get through. Their attack is over.';
      }
      ev.goesOn = !!st.chain;
    } else if (st.chainMode) {
      /* does the event go on? (see CHAIN_CAP) */
      var mine = p.moment.sit.who === 'you';
      var wasReb = !!(st.chain && st.chain.rebounded);
      var youSteps = ((st.chain && st.chain.youSteps) || 0) + (mine ? 1 : 0);
      var goOn = null, nz = null;
      var zoned = typeof p.zoneIndex === 'number';
      if (mine && picked.effect === 'break') goOn = 'counter';
      else if (zoned && typeof picked.move === 'number' && picked.effect !== 'concede' && picked.effect !== 'goal') {
        /* ZONES: the ball moves (or stays, or goes back) and the attack goes
         * on. On their moment this is your keeper playing it out. */
        goOn = 'zone';
        nz = mine ? Math.max(0, Math.min(3, p.zoneIndex + picked.move)) : Math.max(0, Math.min(3, picked.move));
        if (!mine) youSteps = 0;
      }
      var capNow = mine && st.chain && st.chain.cap ? st.chain.cap : CHAIN_CAP;
      if (goOn === 'zone' && youSteps >= capNow) goOn = null;
      /* a half clearance in your box (a4): the ball is back at the edge of
       * your box with one of their players, once */
      if (!mine && p.zoneIndex === -1 && picked.tmove === -1 && picked.effect !== 'concede') {
        goOn = 'tback';
      }
      /* a block in your box that goes out for a corner (a4), once */
      if (!mine && p.zoneIndex === -1 && picked.tmove === 0 && picked.via && picked.effect !== 'concede') goOn = 'tcorner';
      /* THEIR ATTACK COMES UP THE PITCH (a3): their man gets into your box */
      if (!mine && !goOn && picked.into && p.zoneIndex !== -1) goOn = 'box';
      st.follow = null; st.forcedTheirs = false; st.forcedYours = false;
      ev.step = p.step || 1;
      ev.zone = p.zone; ev.zoneIndex = p.zoneIndex;
      if (goOn) {
        st.chain = { next: goOn, text: picked.text, youSteps: youSteps, step: ev.step, lastSit: p.moment.sit.id };
        if (goOn === 'tcorner') {
          /* a corner, or (a5) a rebound after your keeper pushed it out */
          var rb = picked.via === 'box', hd = picked.via === 'header';
          st.chain = { next: 'box', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            foil: rb ? (GUARD.theirTo && picked.theirTo) || o.theirTo || o.foil : o.foil, via: picked.via, blocker: rb ? null : null, flipOk: !!p.flipOk, carried: [], theirCarried: [], bounced: true };
          ev.kind = 'inbox';
          ev.headline = rb ? first(st.chain.foil) + ' has the rebound in your box. One last chance to stop ' + first(st.chain.foil) + '.'
            : hd ? first(st.chain.foil) + ' heads it at your goal. Your keeper has one chance to stop it.'
              : 'They have a corner. One last chance to stop it.';
          ev.chains = rb ? 'Their attack goes on: a rebound in your box.' : hd ? 'Their attack goes on: a header on your goal.' : 'Their attack goes on: a corner.';
        } else if (goOn === 'tback') {
          st.chain = { next: 'tzone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            tz: 1, foil: o.theirTo || o.foil, sit: M.BOX_SIT, tSteps: 1, flipOk: !!p.flipOk, via: null,
            carried: [], theirCarried: [], bounced: true };
          ev.kind = 'pushedback';
          ev.headline = first(st.chain.foil) + ' has the ball at the edge of your box. Choose how to stop him.';
          ev.chains = 'Their attack goes on, at the edge of your box.';
        } else if (goOn === 'box') {
          var via = p.moment.sit.id === 'their_winger' ? 'cross' : 'box';
          var cameFrom = st.chainPrev || null;
          st.chain.next = 'box'; st.chain.foil = o.foil; st.chain.via = via; st.chain.blocker = o.actor;
          /* the keeper holding it starts your attack only if their attack
           * started this event (not a counter after you lost it) */
          st.chain.flipOk = !p.continues;
          st.chain.carried = ((o.grants && o.grants[band]) || []).slice();
          /* their counter's edge stays with them into your box */
          st.chain.theirCarried = (p.theirCarried || []).slice();
          ev.carried = st.chain.carried.map(function (c) { return O().carryText(c); });
          ev.kind = 'inbox';
          ev.headline = via === 'cross' ? first(o.foil) + ' is going to cross it into your box. One last chance to stop it.'
            : first(o.foil) + ' is in your box. One last chance to stop ' + first(o.foil) + '.';
          ev.chains = 'Their attack goes on, into your box.';
        } else if (goOn === 'counter') {
          st.brokeFrom = o.label; ev.chains = 'They are breaking. You have to stop it.';
          /* and losing it hands THEM an edge on the counter: worse the
           * further back you lost it, because more of your players are
           * ahead of the ball (a2) */
          var zAt = typeof p.zoneIndex === 'number' ? p.zoneIndex : 1;
          var amt = [3, 2, 1, 1][zAt];
          st.chain.theirCarry = { amount: amt, why: 'your team lost the ball ' + ZONE_AT[zAt] + ' going forward', outfield: true,
            text: 'You lost the ball ' + ZONE_AT[zAt] + ', with your players going forward: +' + amt + ' to them in this attack' };
          ev.theirCarry = st.chain.theirCarry.text;
          /* a4: their counter starts in a zone: at the edge of your box if
           * you lost it in your half, otherwise in midfield; the man who
           * took the ball runs with it if he can */
          st.chain.counterTz = zAt <= 1 ? 1 : 0;
          st.chain.counterFoil = o.foil && o.foil.line >= (st.chain.counterTz === 1 ? 2 : 1) ? o.foil : M.theirCarrier(st.chain.counterTz, st.opp, st.seen);
          st.chain.brokeFrom = o.label;
          st.chain.counterTaker = o.foil || null;
        }
        else {
          /* e1: who has the ball comes from the result, not the option: a
           * pass that did not get through stays with the passer */
          st.chain.zone = nz; st.chain.carrier = picked.to || o.to || o.actor;
          /* g2: the free kick is taken by the man who stands over it */
          if (mine && picked.mode === 'freekick' && O().fkTaker) st.chain.carrier = O().fkTaker(st.squad) || st.chain.carrier;
          st.chain.mode = mine ? picked.mode || null : null;
          st.chain.rebounded = mine && (wasReb || !!picked.rebound);
          if (mine && capNow !== CHAIN_CAP) st.chain.cap = capNow;
          /* CARRIED ADVANTAGE (a2): what this decision won goes into the
           * next one: the option's own grants for the band it landed in, and
           * any defender it beat clearly is out of position */
          /* e1: every edge a result carries is declared by the option
           * (options.js), so the card can say it before the choice; the
           * beaten defender, the players up the pitch after their attack and
           * after your keeper's catch are no longer added here unseen */
          var got = ((o.grants && o.grants[band]) || []).slice();
          st.chain.carried = got;
          ev.carried = got.map(function (c) { return O().carryText(c); });
          st.chain.prev = st.chain.carrier !== o.actor && mine ? p.carrier || null : null;
          ev.toZone = M.ZONES[nz]; ev.toZoneIndex = nz;
          var carrierName = first(st.chain.carrier);
          if (!mine) {
            ev.kind = 'escaped';
            ev.headline = (/^winback/.test(o.pays) ? 'You won the ball.' : /^box.*hold$/.test(o.pays) ? 'Your keeper has it.' : 'Your keeper got it out.') +
              ' Now it is your attack, from ' + (nz === 1 ? 'midfield' : 'your half') + ': choose what happens next.';
          } else if (picked.mode === 'freekick') {
            ev.kind = 'ground';
            ev.headline = 'Free kick to you at the edge of their box. Choose what happens next.';
          } else if (nz > p.zoneIndex) {
            ev.kind = 'ground';
            ev.headline = ZONE_GAIN[nz] + ' Choose what happens next.';
          } else if (picked.rebound) {
            ev.kind = 'kept';
            ev.headline = 'The rebound fell to ' + carrierName + ', in their box. Choose what happens next.';
          } else if (nz === p.zoneIndex) {
            ev.kind = 'kept';
            ev.headline = 'You kept the ball ' + ZONE_AT[nz] + '. Choose what happens next.';
          } else {
            ev.kind = 'kept';
            ev.headline = 'You went back, and still have the ball ' + ZONE_AT[nz] + '. Choose what happens next.';
          }
          ev.chains = carrierName + ' has the ball ' + ZONE_AT[nz] + '. The same attack goes on.';
          /* g1 (from p2): the last decision of a long attack could leave one
           * button ("plays a short, safe pass"), which is not a decision.
           * Then the attack ends here, with the ball kept, and says why.
           * (A rebound is always played: it is the reward for the shot.) */
          if (mine && GUARD.lastOne && youSteps + 1 >= capNow && !picked.rebound && picked.mode !== 'freekick' && nextLive(st) < 2) {
            st.chain = null; goOn = null;
            ev.kind = 'kept'; ev.carried = [];
            ev.headline = 'You kept the ball ' + ZONE_AT[nz] + ', but their players are all back now. The attack is over.';
            ev.chains = null;
          }
        }
      } else {
        st.chain = null;
        if (picked.effect === 'break') ev.chains = null;
      }
      ev.goesOn = !!goOn;
    }

    if (GUARD.lastWin && st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them' && st.n + 1 >= MOMENTS) {
      /* g1 (from p3): won in the last moment of the match. The headline
       * said "Your attack is the next moment" and then the match ended. */
      st.chain = null; ev.carried = []; ev.goesOn = false; ev.chains = null; ev.lastWin = true;
      ev.headline = 'You won the ball, and that is the end of the match.';
    }
    if (st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them') {
      /* you won the ball: your attack is the next moment (see next) */
      st.chain.cap = WIN_CAP; st.chain.youSteps = 0; st.chain.step = 0;
      st.handoff = st.chain; st.chain = null; ev.handoff = true; ev.goesOn = true;
      ev.chains = 'Your attack is the next moment.';
    }
    st.log.push(ev);
    st.pending = null;
    if (st.chainMode ? !st.chain : !st.follow) {
      st.n++;
      st.minuteNow = st.handoff ? Math.min(89, p.minute + 1) : null;
    }
    return ev;
  }

  /* The report. p3: at most three lines, each about what happened in THIS
   * match, read off the log: where you lost the ball, which of their
   * players did the most against you, the edge you used most, your shots,
   * their attacks into your box, a tired line. p2 printed the same
   * "Finishing problem" line in most matches, because its lines were keyed
   * on the score and gave advice rather than facts. Each candidate line
   * carries a weight for how much it mattered in this match; the three
   * heaviest are shown. */
  var SHOTS = { shot: 1, shotreb: 1, placed: 1, longshot: 1, header: 1, square: 1, pullback: 1 };
  /* (times() is f2's, above: once, twice, three times) */
  /* g1: "all 2 of them" reads as a machine; "both" */
  function allOf(n, what) { return n === 2 ? 'both ' + what : 'all ' + n + ' ' + what; }
  function listCounts(obj, fmt) {
    var ks = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    var parts = ks.map(function (k) { return fmt(k, obj[k]); });
    return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  function report(st) {
    var won = st.score.you > st.score.them, drew = st.score.you === st.score.them;
    var log = st.log;
    var yours = log.filter(function (e) { return e.sit.who === 'you' && !e.cont; });
    var theirs = log.filter(function (e) { return e.sit.who === 'them'; });
    var events = log.filter(function (e) { return !e.cont; }).length;
    var conceded = theirs.filter(function (e) { return e.kind === 'conceded'; }).length;
    var cands = [];

    /* 1. where you lost the ball going forward, and what it cost */
    var lostEv = [], lostAt = {}, fromLoss = 0, counter = false;
    log.forEach(function (e) {
      if (!e.cont) counter = false;
      if (e.sit.who === 'you' && e.kind === 'lost') {
        lostEv.push(e); counter = true;
        var where = typeof e.zoneIndex === 'number' && ZONE_AT[e.zoneIndex] ? ZONE_AT[e.zoneIndex] : 'going forward';
        lostAt[where] = (lostAt[where] || 0) + 1;
      } else if (counter && e.sit.who === 'them' && e.kind === 'conceded') { fromLoss++; counter = false; }
    });
    if (lostEv.length) {
      var takers = {}, caught = {};
      /* call: a shot their keeper catches is not the ball "taken from you"
       * (round 4 review: "Simon took it from you" for a caught shot) */
      lostEv.forEach(function (e) {
        if (!e.foilName) return;
        if (GUARD.caughtShot && e.shot) caught[e.foilName] = (caught[e.foilName] || 0) + 1;
        else takers[e.foilName] = (takers[e.foilName] || 0) + 1;
      });
      var topT = Object.keys(takers).sort(function (a, b) { return takers[b] - takers[a]; })[0];
      var topC = Object.keys(caught).sort(function (a, b) { return caught[b] - caught[a]; })[0];
      var one = lostEv.length === 1;
      cands.push({ w: 2 * lostEv.length + 3 * fromLoss, good: false,
        head: 'You lost the ball ' + times(lostEv.length) + ' going forward' + (lostAt['going forward'] ? '.'
          : one ? ', ' + Object.keys(lostAt)[0] + '.' : Object.keys(lostAt).length === 1 ? ', ' + (lostEv.length === 2 ? 'both ' : 'all ') + Object.keys(lostAt)[0] + '.'
            : ': ' + listCounts(lostAt, function (k, n) { return n + ' ' + k; }) + '.'),
        why: (topT ? topT + ' took it ' + (one ? 'from you' : times(takers[topT])) + '. ' : '') +
          (topC ? topC + ' caught ' + (caught[topC] === 1 ? (one ? 'your shot' : 'one of your shots') : caught[topC] + ' of your shots') + ', and their team attacked. ' : '') +
          (one ? (fromLoss ? 'They scored from the counter.' : 'They did not score from the counter.')
            : fromLoss ? 'They scored from ' + (fromLoss === lostEv.length ? allOf(fromLoss, 'of those counters') : fromLoss + ' of those counters') + '.'
              : 'They did not score from any of those counters.') });
    }

    /* 2. which of their players did the most against you */
    var foe = {};
    function F(n) { return foe[n] || (foe[n] = { goals: 0, duels: 0, won: 0, took: 0, faced: {} }); }
    log.forEach(function (e) {
      if (e.sit.who === 'them' && e.foilName) {
        if (e.kind === 'conceded') F(e.foilName).goals++;
        if (e.dice) {
          var f = F(e.foilName); f.duels++; if (e.band === 'bad') f.won++;
          if (e.actorName) f.faced[e.actorName] = (f.faced[e.actorName] || 0) + 1;
        }
      }
      if (e.sit.who === 'you' && e.kind === 'lost' && e.foilName) { if (GUARD.caughtShot && e.shot) F(e.foilName).caught = (F(e.foilName).caught || 0) + 1; else F(e.foilName).took++; }
    });
    var foeName = null, foeW = 0;
    Object.keys(foe).forEach(function (n) {
      var f = foe[n], w = 2 * f.goals + f.won + f.took + (f.caught || 0);
      if (w > foeW) { foeW = w; foeName = n; }
    });
    if (foeName && foeW >= 2) {
      var f = foe[foeName], bits = [];
      if (f.goals) bits.push('scored ' + (f.goals === 1 ? 'once' : f.goals + ' goals'));
      if (f.duels) bits.push(f.duels === 1 ? (f.won ? 'won his one duel with your players' : 'lost his one duel with your players')
        : f.won === f.duels ? (f.duels === 2 ? 'won both his duels with your players' : 'won all ' + f.duels + ' of his duels with your players')
          : 'won ' + f.won + ' of his ' + f.duels + ' duels with your players');
      if (f.took) bits.push('took the ball from you ' + times(f.took));
      if (f.caught) bits.push(f.caught === 1 ? 'caught one of your shots' : 'caught ' + f.caught + ' of your shots');
      var fk = Object.keys(f.faced).sort(function (a, b) { return f.faced[b] - f.faced[a]; });
      var facedBy = fk[0];
      cands.push({ w: foeW, good: false,
        head: 'Of their players, ' + foeName + ' did the most against you: he ' +
          (bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]) + '.',
        why: !facedBy ? foeName + ' was never in a duel with one of your players.'
          : f.faced[facedBy] >= 2 ? facedBy + ' faced ' + foeName + ' most often (' + f.faced[facedBy] + ' of those duels).'
            : fk.length === 1 ? facedBy + ' was the one who faced ' + foeName + '.'
              : fk.slice(0, -1).join(', ') + ' and ' + fk[fk.length - 1] + ' each faced ' + foeName + ' once.' });
    }

    /* 3. the edge you used most (carried advantage, a2) */
    var edges = {};
    log.forEach(function (e) {
      if (e.sit.who !== 'you' || !e.uses) return;
      e.uses.forEach(function (u) {
        var g = edges[u.name] || (edges[u.name] = { n: 0, amount: u.n, won: 0 });
        g.n++; if (e.dice && e.dice.diff >= 0) g.won++;
      });
    });
    var edgeName = Object.keys(edges).sort(function (a, b) { return edges[b].n - edges[a].n; })[0];
    if (edgeName) {
      var eg = edges[edgeName], allE = 0, allW = 0;
      Object.keys(edges).forEach(function (k) { allE += edges[k].n; allW += edges[k].won; });
      var wonOf = function (w, n, what) {
        return n === 1 ? 'You ' + (w ? 'won' : 'lost') + ' the check ' + what + '.'
          : w === n ? 'You won ' + (n === 2 ? 'both' : 'all ' + n) + ' of the checks ' + what + '.'
            : 'You won ' + w + ' of the ' + n + ' checks ' + what + '.';
      };
      var spread = allE > eg.n && eg.n === 1;
      cands.push({ w: 2 + eg.n, good: (spread ? allW * 2 >= allE : eg.won * 2 >= eg.n),
        head: spread ? 'You used ' + allE + ' different edges from earlier decisions: ' +
            (function (ks) { var q = ks.slice(0, 3).map(function (k) { return '"' + k + '"'; });
              if (ks.length > 3) q.push(ks.length - 3 + ' more');
              return q.slice(0, -1).join(', ') + ' and ' + q[q.length - 1]; })(Object.keys(edges)) + '.'
          : allE > eg.n ? 'You used an edge from an earlier decision ' + times(allE) + ', most often "' + edgeName + '" (+' + eg.amount + ', ' + times(eg.n) + ').'
            : 'You used the edge "' + edgeName + '" (+' + eg.amount + ') ' + times(eg.n) + '.',
        why: spread ? wonOf(allW, allE, 'they helped') : wonOf(eg.won, eg.n, 'it helped') });
    }

    /* 4. your shots */
    var shots = log.filter(function (e) { return e.sit.who === 'you' && (e.shot || SHOTS[e.pays]); });
    if (shots.length) {
      var sc = shots.filter(function (e) { return e.kind === 'goal'; }).length, by = {};
      shots.forEach(function (e) { if (e.actorName) by[e.actorName] = (by[e.actorName] || 0) + 1; });
      var shooter = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
      cands.push({ w: 1 + shots.length / 2 + (sc === 0 && shots.length >= 2 ? 4 : 0), good: sc > 0,
        head: 'You had ' + shots.length + ' shot' + (shots.length === 1 ? '' : 's') + ' and scored ' +
          (sc === 0 ? (shots.length === 1 ? 'with none' : 'with none of them') : sc) + '.',
        why: shooter + ' took ' + (by[shooter] === shots.length ? (shots.length === 1 ? 'it' : 'all of them') : by[shooter] + ' of them') + '.' });
    }

    /* 5. their attacks that reached your box */
    var boxEv = theirs.filter(function (e) { return e.zoneIndex === -1; });
    if (boxEv.length >= 2) {
      var boxGoals = boxEv.filter(function (e) { return e.kind === 'conceded'; }).length;
      var kn = st.squad.keeper ? first(st.squad.keeper) : null;
      var kFaced = boxEv.filter(function (e) { return kn && e.actorName === kn; }).length;
      var kSaves = boxEv.filter(function (e) { return e.kind !== 'conceded' && kn && e.actorName === kn; }).length;
      cands.push({ w: boxEv.length + boxGoals, good: boxGoals === 0,
        head: 'They got into your box ' + times(boxEv.length) + (boxGoals ? ' and scored ' + times(boxGoals) + '.' : ' and did not score.'),
        why: !kn ? '' : !kFaced ? kn + ' did not have to face any of them himself: your defenders did.'
          : kFaced === 1 ? kn + ' faced one of them himself and ' + (kSaves ? 'stopped it.' : 'did not stop it.')
          : kn + ' faced ' + (kFaced === boxEv.length ? 'every one of them' : kFaced + ' of them') + ' himself and stopped ' +
            (kSaves === kFaced ? (kFaced === 2 ? 'both' : 'all of them') : kSaves === 0 ? 'none' : kSaves) + '.' });
    }

    /* 6. a tired line (the style cards promise it, so the report says
     * whether it happened) */
    var end = legs(st), lo = 'def';
    ['mid', 'att'].forEach(function (k) { if (end[k] < end[lo]) lo = k; });
    if (end[lo] < 55) {
      var word = { def: 'defence', mid: 'midfield', att: 'attack' }[lo];
      cands.push({ w: 1 + (55 - end[lo]) / 4, good: false, head: 'Your ' + word + ' finished with ' + Math.round(end[lo]) + ' out of 100 stamina.',
        why: 'A tired line plays below its numbers. ' + (st.subsLeft === 3 ? 'You did not use any of your 3 substitutions.'
          : st.subsLeft > 0 ? 'You used ' + (3 - st.subsLeft) + ' of your 3 substitutions.' : 'You used all 3 substitutions.') });
    }

    /* 7. g1: the keyword and pair options you chose (e2 printed this as a
     * fourth line under the report) */
    var usedKw = log.filter(function (e) { return e.sit.who === 'you' && e.unlock; });
    if (usedKw.length) {
      var kwGoals = usedKw.filter(function (e) { return e.kind === 'goal'; }).length;
      /* each one with its minute and what came of it, so the line is about
       * this match ("Messi (Dribbler) at 27 minutes: the attack went on") */
      var came = function (e) {
        return e.kind === 'goal' ? 'a goal' : e.kind === 'lost' ? 'you lost the ball' : e.goesOn ? 'the attack went on'
          : e.kind === 'stopped' || e.kind === 'escaped' ? 'you stopped them' : 'no goal';
      };
      cands.push({ kw: true, w: 1 + usedKw.length / 2 + 3 * kwGoals, good: kwGoals > 0,
        head: 'You chose ' + usedKw.length + ' option' + (usedKw.length === 1 ? '' : 's') + ' only your players unlock, and ' +
          (kwGoals === 0 ? (usedKw.length === 1 ? 'it did not score.' : 'none of them scored.') : kwGoals + ' of them scored.'),
        why: usedKw.slice(0, 4).map(function (e) { return e.unlock.replace(/: (.*)$/, ' ($1)') + ' at ' + e.minute + ' minutes: ' + came(e); }).join('; ') +
          (usedKw.length > 4 ? '; and ' + (usedKw.length - 4) + ' more' : '') + '.' });
    }

    /* the heaviest three, in the order they were weighed */
    var ranked = cands.map(function (c, i) { c.i = i; return c; })
      .sort(function (a, b) { return b.w - a.w || a.i - b.i; });
    var top = ranked.slice(0, 3);
    /* g1: the options only your players unlock are always one of the three
     * when you chose any (what a keyword is worth is something you saw) */
    var kwc = ranked.filter(function (c) { return c.kw; })[0];
    if (kwc && top.indexOf(kwc) < 0) top[top.length === 3 ? 2 : top.length] = kwc;
    var lines = top.map(function (c) { return { good: c.good, head: c.head, why: c.why }; });
    if (!lines.length) {
      lines.push({ good: drew, head: 'You had no shots and never lost the ball going forward.',
        why: 'Nothing else in this match stood out either way.' });
    }

    return {
      won: won, drew: drew, score: st.score,
      lines: lines,
      counts: { yours: yours.length, theirs: theirs.length, scored: st.score.you, conceded: conceded, lost: lostEv.length,
        /* events they started, not counting counters inside your events */
        theirsStarted: theirs.filter(function (e) { return !e.cont; }).length, events: events }
    };
  }

  /* headless play, for the tests */
  function auto(squad, opp, seed, style, policy, opts) {
    var st = newMatch(squad, opp, seed, style, opts);
    var guard = 0;
    while (!isOver(st) && guard++ < 40) {
      var p = next(st);
      if (!p) break;
      var live = p.moment.options.filter(function (o) { return !o.disabled; });
      choose(st, policy ? policy(st, live) : 0);
    }
    return { state: st, report: report(st) };
  }

  var API = {
    MOMENTS: MOMENTS, MINUTES: MINUTES, COUNTER_MODES: COUNTER_MODES, COUNTER_DEFAULT: COUNTER_DEFAULT, NOUN: NOUN, COUNTERS: COUNTERS, CHAIN_CAP: CHAIN_CAP, GUARD: GUARD, playNames: playNames,
    CHAIN_GROUND: CHAIN_GROUND, T_CAP: T_CAP, WIN_CAP: WIN_CAP, CHAIN_KEEP: CHAIN_KEEP, REPEAT_DAMP: REPEAT_DAMP, FOLLOW_ON: FOLLOW_ON, headline: headline,
    newMatch: newMatch, next: next, choose: choose, isOver: isOver,
    /* for the harness sweeps (g1 node.json) */
    setCounterSizes: function (v) { if (v.up !== undefined) KEEP_UP = v.up; if (v.down !== undefined) KEEP_DOWN = v.down; if (v.room !== undefined) ROOM_BY = v.room; if (v.step !== undefined) LEARN_STEP = v.step; },
    report: report, auto: auto, minute: minute, legs: legs
  };
  root.KMMatch = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
