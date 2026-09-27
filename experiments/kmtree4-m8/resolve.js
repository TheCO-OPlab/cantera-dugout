/* How a moment resolves, and how it explains itself.
 *
 * Eduardo, 2026-09-22: "Margin +4 means nothing to me. If 20 is +4 than 16,
 * why not just you 100% win. And if that's not how the math works, then show
 * it. I'm not advocating for a specific formula, just that you actually show
 * the formula in terms familiar/easy to understand to the player."
 *
 * He caught a real incoherence: the old version printed a margin and then,
 * separately, a chance that did not follow from it. The chance came out of a
 * curve nobody could see. So the rule is now one sentence and every number on
 * screen comes out of it:
 *
 *   YOUR STAT + a roll of 1 to 6   against   THEIR STAT + a roll of 1 to 6
 *
 *     win by 4 or more            the good outcome
 *     win by 1 to 3, or level     the middling one
 *     lose                        the bad one
 *
 * Two things fall out instead of being invented, which is the point:
 *
 *   CERTAIN when your stat is 9 or more above theirs, because then even your
 *   worst roll against their best still wins by 4.
 *
 *   IMPOSSIBLE when your stat is 6 or more below theirs, because then even
 *   your best roll against their worst still loses.
 *
 * The old code had CERTAIN_BY = 6 as a number I picked. Now it is 9 and I did
 * not pick it; the dice did.
 */
(function (root) {
  'use strict';

  /* two six-sided dice: the difference runs -5 to +5, and the count of ways to
   * roll each difference is 6 minus its size, out of 36 */
  var WAYS = 36;
  function ways(d) { return d < -5 || d > 5 ? 0 : 6 - Math.abs(d); }
  function pOf(lo, hi) {
    var n = 0;
    for (var d = Math.max(-5, lo); d <= Math.min(5, hi); d++) n += ways(d);
    return n / WAYS;
  }

  var GOOD_BY = 4;              // win by this much and it comes off properly
  var CERTAIN_AT = 9;           // stat lead where the worst roll still wins by GOOD_BY
  var IMPOSSIBLE_AT = -6;       // stat deficit where the best roll still loses

  /* margin = your stat minus theirs. Returns the three exact chances. */
  function odds(margin) {
    var m = Math.round(margin);
    var good = pOf(GOOD_BY - m, 5);
    var bad = pOf(-5, -m - 1);
    var mixed = Math.max(0, 1 - good - bad);
    return {
      good: good, mixed: mixed, bad: bad,
      certain: m >= CERTAIN_AT,
      impossible: m <= IMPOSSIBLE_AT,
      margin: m
    };
  }

  function pct(p) { return Math.round(p * 100); }

  /* The arithmetic, written out. His example was "(20 passing - 16
   * intelligence) + random(6) => 22", so: both numbers, both rolls, and what
   * each band needs. */
  function explain(mineName, mineStat, mineVal, theirName, theirStat, theirVal, extra) {
    extra = extra || {};
    var m = mineVal - theirVal;
    var o = odds(m);
    /* mineWork/theirWork show a value that is not read straight off the player,
     * so "in the air 34" is followed by "(Physical 16 + 10 x 1.83m)". His note:
     * a number he cannot find on the player is not acceptable. */
    var mine = mineName + ' ' + mineStat + ' ' + mineVal +
      (extra.mineWork ? ' (' + extra.mineWork + ')' : '') + ' + roll(1 to 6)';
    var theirs = theirName + ' ' + theirStat + ' ' + theirVal +
      (extra.theirWork ? ' (' + extra.theirWork + ')' : '') + ' + roll(1 to 6)';
    var head = mine + '  against  ' + theirs;
    function sgn(n) { return (n > 0 ? '+' : '') + n; }
    if (extra.mods && extra.mods.length) {
      /* one named part per bonus (a2: carried advantage adds parts) */
      head += '. ' + mineName + ' gets ' + extra.mods.map(function (x) { return sgn(x.n) + ' because ' + x.why; }).join(', ') +
        ', so ' + mineVal + ' counts as ' + (mineVal + extra.bonus);
      mineVal += extra.bonus; m = mineVal - theirVal; o = odds(m);
    } else if (extra.bonus) {
      head += '. ' + mineName + ' gets ' + sgn(extra.bonus) + ' because ' +
        (extra.because || 'this is the safe option') + ', so ' + mineVal + ' counts as ' +
        (mineVal + extra.bonus);
      mineVal += extra.bonus; m = mineVal - theirVal; o = odds(m);
    }
    if (extra.theirMods && extra.theirMods.length) {
      var tb = extra.theirMods.reduce(function (a, x) { return a + x.n; }, 0);
      head += '. ' + theirName + ' gets ' + extra.theirMods.map(function (x) { return sgn(x.n) + ' because ' + x.why; }).join(', ') +
        ', so ' + theirVal + ' counts as ' + (theirVal + tb);
      theirVal += tb; m = mineVal - theirVal; o = odds(m);
    }
    if (o.certain) {
      return head + '. ' + mineVal + ' beats ' + theirVal + ' by ' + m +
        ', which is more than the 5 the dice can swing, so this cannot fail.';
    }
    if (o.impossible) {
      return head + '. ' + theirVal + ' beats ' + mineVal + ' by ' + (-m) +
        ', which is more than the 5 the dice can swing, so this cannot come off.';
    }
    if (m === 0) return head + '. ' + mineName + ' and ' + theirName + ' are level, so it comes down to the dice.';
    return head + '. ' + mineName + ' is ' + (m > 0 ? m + ' ahead' : (-m) + ' behind') +
      ' before the dice are rolled.';
  }

  /* --------------------------------------------------- outcome sentences */
  /* His instruction: "Use this logic to build a system for every event/scene
   * and every possible outcome. These should be produced systematically, not
   * handwritten by you for every event."
   *
   * A sentence is composed, not written. Two parts:
   *
   *   THE ACTION   one short verb phrase per option, because "heads it clear"
   *                and "kicks it clear" are genuinely different things and no
   *                generator is going to invent that distinction. Three per
   *                option, and each is a fragment, never a sentence.
   *
   *   THE CONSEQUENCE  what it means for the match. From the table below, by
   *                whose moment it is and what the option pays off in.
   *
   * The first version had 57 hand-written full sentences and the consequences
   * drifted between them: HOLD read "nothing comes of it either" and then
   * scored a goal, because match.js decided the score separately from the
   * words. So the score EFFECT lives in the same table as the text. They
   * cannot disagree any more, because there is only one of them.
   *
   * pays: what a good outcome buys you.
   *   goal    an attacking gamble. Comes off, you score.
   *   keep    the safe ball. Comes off, you still have it. Never a goal.
   *   ground  territory. Comes off, you are attacking somewhere better.
   *   stop    a defensive answer. Comes off, the attack is over.
   *   card    a foul. The booking is the outcome.
   *   offside the trap. Play stops rather than continuing.
   *   sub     a substitution. Not a duel.
   *   clock   running time down. Never creates anything. */

  /* EVERY PLAY ENDS. His note after playing it, 2026-09-23: "I basically won
   * a duel but nothing came of it because I couldn't continue playing. Duels
   * should resolve." So each sentence below says where the ball ends up:
   * in the net, out of play, wide of the post, or with them and running at
   * you. The one exception is `ground` done well: the play is not over, so
   * the match hands you the follow-up decision in the same minute rather
   * than leaving the move hanging. "Nothing comes of it" is gone; it was the
   * cliffhanger he was describing. Each ending is its own sentence, so it
   * reads after any action: ", but ..." after "controls it, but slowly" gave
   * "controls it, but slowly, but they get players back". */
  var CONSEQUENCE = {
    you: {
      goal: {
        good: ' and scores.',
        mixed: '. The ball goes out of play, and the attack is over.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'break' }
      },
      keep: {
        good: '. {mate} has the ball, and your team keeps it, but their players are all back in position. This attack is over.',
        mixed: '. The ball goes out for their throw-in.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' }
      },
      ground: {
        good: ' and your team attacks down the other side.',
        mixed: '. They get enough players back, and the ball goes out for their throw-in.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'nothing', bad: 'break' }
      },
      sub: {
        good: '. That line gets its stamina back to 100.',
        mixed: '. That line has fresh legs, but no more quality.',
        bad: '. {actor} gives the ball away, and their team attacks.',
        effect: { good: 'rest', mixed: 'nothing', bad: 'break' }
      },
      clock: {
        good: '. The clock runs down.',
        mixed: '. The referee adds the time back on at the end.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' }
      },
      /* ZONES (a1). The ball moves up the pitch: your half, midfield, the
       * edge of their box, their box. `move` is how many zones the ball goes
       * forward when the attack goes on; no `move` means the attack is over.
       * {to} and {here} are filled by options.js with the zone's words. */
      /* winning the duel (by any margin) moves the ball on a zone */
      advance: {
        good: ' and your team has the ball {to}.',
        mixed: ', and your team has the ball {to}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'ground', bad: 'break' },
        move: { good: 1, mixed: 1 }
      },
      /* a safer way forward: only a clear win gets you further */
      probe: {
        good: ' and your team has the ball {to}.',
        mixed: '. Your team keeps the ball {here}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'nothing', bad: 'break' },
        move: { good: 1, mixed: 0 }
      },
      through: {
        good: ' and your team has the ball {to}.',
        mixed: '. The ball runs through to their keeper, and the attack is over.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'nothing', bad: 'break' },
        move: { good: 2 }
      },
      /* the safe ball: it arrives (well or not so well) or it is lost */
      hold: {
        good: ' and your team keeps the ball {here}.',
        mixed: ', and your team keeps the ball {here}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' },
        move: { good: 0, mixed: 0 }
      },
      back: {
        good: ' and your team starts again {to}.',
        mixed: ', and your team starts again {to}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' },
        move: { good: -1, mixed: -1 }
      },
      shot: {
        good: ' and scores.',
        mixed: '. {foil} saves it, and the attack is over.',
        bad: '. {foil} catches it and their team attacks.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'break' }
      },
      /* a5: a hard shot their keeper only pushes out is a rebound, and one
       * of your players gets to it first: the attack goes on, once */
      shotreb: {
        good: ' and scores.',
        mixed: '. {foil} pushes it out, and {mate} gets to it first.',
        bad: '. {foil} catches it and their team attacks.',
        effect: { good: 'goal', mixed: 'ground', bad: 'break' },
        move: { mixed: 0 }
      },
      /* a pass across the goal: only a clean one (win by 4) is a tap-in.
       * Weak on its own; strong once a defender is out of position (a2) */
      square: {
        good: ', and {mate} scores from close in.',
        mixed: '. {foil} gets back and blocks it, and the ball goes out of play. The attack is over.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'break' }
      },
      /* the pull-back after beating the full-back: if the pass gets past the
       * defender at all, it is a tap-in (a2) */
      pullback: {
        good: ', and {mate} scores from close in.',
        mixed: ', and {mate} scores from close in.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'goal', bad: 'break' }
      },
      placed: {
        good: ' and scores.',
        mixed: '. {foil} saves it, and the attack is over.',
        bad: '. It is a goal kick, and the attack is over.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'nothing' }
      },
      longshot: {
        good: ' and scores.',
        mixed: '. {foil} saves it, and the attack is over.',
        bad: '. The ball goes over the bar, and the attack is over.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'nothing' }
      },
      header: {
        good: ' and scores.',
        mixed: '. The header goes wide, and the attack is over.',
        bad: '. {foil} heads it out of play, and the attack is over.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'nothing' }
      },
      /* KEYWORDS AND PAIRS IN THE ZONES (e1, from d1). A Dribbler who runs
       * at two: past both and the ball is a zone on with a bigger edge; past
       * one and the second trips him, which is a free kick at the edge of
       * their box (and a yellow card for the man who tripped him) */
      dribble2: {
        good: ' and your team has the ball {to}.',
        mixed: '. Free kick to your team at the edge of their box, and {trip} gets a yellow card.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'ground', bad: 'break' },
        move: { good: 1, mixed: 1 }
      },
      dribble2e: {
        good: ' and your team has the ball {to}.',
        mixed: '. Free kick to your team at the edge of their box, and {trip} gets a yellow card.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'ground', bad: 'break' },
        move: { good: 1, mixed: 0 }
      },
      /* A ONE-TWO is two decisions, a zone each. The first pass: the
       * partner has the ball a zone on, and the pass straight back is on. */
      onetwo1: {
        good: '. {mate} has it {to}, and the pass straight back is on.',
        mixed: '. {foil} goes with him, so {mate} keeps the ball {here}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'nothing', bad: 'break' },
        move: { good: 1, mixed: 0 }
      },
      onetwo: {
        good: ' and your team has the ball {to}.',
        mixed: ', and your team has the ball {here}.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'ground', mixed: 'nothing', bad: 'break' },
        move: { good: 1, mixed: 0 }
      },
      /* a Crosser's low ball across the six-yard box: a clean one is a
       * tap-in; one {foil} does not quite reach gets to {mate} in their box,
       * and the attack goes on (e1). On the last decision of an attack
       * (lowcross0) that one is blocked instead. */
      lowcross: {
        good: ', and {mate} scores from two metres.',
        mixed: '. {foil} cannot quite reach it, and {mate} has the ball in their box.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'ground', bad: 'break' },
        move: { mixed: 1 }
      },
      lowcross0: {
        good: ', and {mate} scores from two metres.',
        mixed: '. {foil} gets a foot to it, and it goes out of play. The attack is over.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'break' }
      },
      /* g2: a free kick at goal that hits the wall is cleared: the attack is
       * over, and nobody is running at your goal from it (round 3 review:
       * the Free-kick taker's shot lost the ball 92 times in 100, so it was
       * greyed out on 13 of 28 free kicks he stood over) */
      fkshot: {
        good: ' and scores.',
        mixed: '. {foil} saves it, and the attack is over.',
        bad: ', and their players kick it clear. The attack is over.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'nothing' }
      },
      /* e1: the Poacher's first-time shot at a rebound, before their keeper
       * is up; a block on the line ends it */
      rebshot: {
        good: ' and scores.',
        mixed: '. The ball goes out for a goal kick, and the attack is over.',
        bad: '. {foil} takes the ball and their team attacks.',
        effect: { good: 'goal', mixed: 'nothing', bad: 'break' }
      }
    },
    them: {
      stop: {
        good: ', and the danger is over.',
        mixed: '. {foil} still gets a shot away, and it goes wide.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      card: {
        good: '. Free kick to them, and {actor} gets a yellow card.',
        mixed: '. Free kick to them in a dangerous spot, and {actor} gets a yellow card.',
        bad: '. {actor} gets a yellow card, and {foil} scores anyway.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      offside: {
        good: '. {foil} is offside and the referee stops play.',
        mixed: '. Their attack stops, and they pass it back to their own defence.',
        bad: '. {foil} times his run, stays onside and scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      sub: {
        good: '. That line gets its stamina back to 100.',
        mixed: '. That line has fresh legs, but no more quality.',
        bad: '. {actor} misreads the first ball, and {foil} scores.',
        effect: { good: 'rest', mixed: 'nothing', bad: 'concede' }
      },
      clock: {
        good: '. The clock runs down.',
        mixed: '. The referee adds the time back on at the end.',
        bad: '. They win the ball back, and {foil} scores.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'concede' }
      },
      /* you stop them cleanly and the ball is yours: in zone play your
       * attack starts from there, in your half (a1). Only on the first
       * decision of their attack, so it cannot bounce back and forth. */
      winback: {
        good: ', and your team has the ball {to}.',
        mixed: '. {foil} still gets a shot away, and it goes wide.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 0 }
      },
      /* THEIR ATTACK COMES UP THE PITCH (a3). A stop that half works lets
       * their man into your box, and there is one more decision there. A
       * lost duel is still a goal. */
      press2: {
        good: ', and the danger is over.',
        mixed: '. {foil} keeps going, into your box.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        into: { mixed: 'box' }
      },
      winback2: {
        good: ', and your team has the ball {to}.',
        mixed: '. {foil} keeps going, into your box.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 0 },
        into: { mixed: 'box' }
      },
      /* THEIR ATTACK MOVES THROUGH ZONES (a4): midfield, the edge of your
       * box, your box. The effect words mean, on their attack:
       *   stopped  their attack is over (you won the ball, or they had to
       *            pass it back, or it went out of play, or a foul)
       *   nothing  their attack goes on, and they have no edge
       *   break    their attack goes on, past your man, with an edge
       * {back}, {fwd} and {fwd2} are filled by options.js with the zone's
       * words; `tmove` is the zones they move towards your goal, `win`
       * means the ball is yours and your attack can start from there. */
      /* go for the ball: win it or be left behind */
      twin: {
        good: '. Your team has the ball, and your attack starts {to}.',
        mixed: '. {back}',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        win: { good: 1 }, tmove: { bad: 1 }
      },
      /* stand in the path of the pass: take it, or it reaches their man */
      tcut: {
        good: '. Your team has the ball, and your attack starts {to}.',
        mixed: '. {fwd2}',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'break' },
        win: { good: 1 }, tmove: { mixed: 1, bad: 1 }
      },
      /* drop back in front of your defence: you give them the ground, and
       * in return they almost never get an edge */
      tend: {
        good: '. {foil} gets to the edge of your box, and your defence is ready for him.',
        mixed: '. {foil} gets to the edge of your box.',
        bad: '. {foil} {fwd}',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' },
        tmove: { good: 1, mixed: 1, bad: 1 }
      },
      /* a4: everyone drops back; no duel */
      tretreat: {
        good: '. {foil} has the ball at the edge of your box, with all your players behind it.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'nothing' },
        tmove: { good: 1 }
      },
      tretreat2: {
        good: '. {foil} crosses it into your box.',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'nothing' },
        tmove: { good: 1 }, via: { good: 'cross' }
      },
      tcard: {
        good: '. Free kick to them {here}, and {actor} gets a yellow card. Their attack is over.',
        mixed: '. Free kick to them {here}, and {actor} gets a yellow card. Their attack is over.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        tmove: { bad: 1 }
      },
      /* showing him wide: you never win the ball, and the usual worst is a
       * cross rather than a man through */
      twide: {
        good: '. The ball goes out for their throw-in, and their attack is over.',
        mixed: '. {foil} crosses it into your box.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'break' },
        tmove: { mixed: 1, bad: 1 }, via: { mixed: 'cross', bad: 'box' }
      },
      /* a4: blocking the shot at the edge of your box; half a block is a
       * corner */
      tblock: {
        good: '. Your team has the ball, and your attack starts {to}.',
        mixed: '. The ball goes out for their corner.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'break' },
        win: { good: 1 }, tmove: { mixed: 1, bad: 1 }, via: { mixed: 'corner', bad: 'box' }
      },
      /* a4: a foul at the edge of your box is a free kick near your goal */
      tfk: {
        good: '. Free kick to them, 25 metres from your goal, and {actor} gets a yellow card.',
        mixed: '. Free kick to them, just outside your box, and {actor} gets a yellow card.',
        bad: '. {foil} {fwd}',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' },
        tmove: { good: 1, mixed: 1, bad: 1 }, via: { good: 'freekick', mixed: 'freekick', bad: 'box' }
      },
      ttrap: {
        good: '. Free kick to your team, and your attack starts {to}.',
        mixed: '. They pass it back to their own defence, and their attack is over.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        win: { good: 1 }, tmove: { bad: 1 }
      },
      /* a4: your keeper runs out for a ball over the top */
      tsweep: {
        good: ', and the danger is over.',
        mixed: '. {foil} is still going, into your box, and your keeper is out of his goal.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 1 }
      },
      tclear: {
        good: ', and the danger is over.',
        mixed: '. Their players have to start again from there, and their attack is over.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        tmove: { bad: 1 }
      },
      /* in your box, a clearance that only half works: the ball is back at
       * the edge of your box with one of their players (a4) */
      boxclear: {
        good: ', and the danger is over.',
        mixed: '. {fwd2}',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: -1 }
      },
      /* the last decision, in your box */
      boxstop: {
        good: ', and the danger is over.',
        mixed: '. The ball goes wide, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      /* a4: your keeper runs out: it works or it does not, and a half
       * success still ends their attack */
      boxrush: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      boxrushhold: {
        good: ', and holds on to it. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' },
        move: { good: 1 }
      },
      /* a5: your keeper pushes it out, and one of their players gets to the
       * rebound first: another decision in your box, once */
      boxsave: {
        good: ', and the danger is over.',
        mixed: '. {fwd2}',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 0 }, via: { mixed: 'box' }
      },
      boxsavehold: {
        good: ', and holds on to it. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. {fwd2}',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 1 }, tmove: { mixed: 0 }, via: { mixed: 'box' }
      },
      /* a5: a header that only just gets there is a corner, once */
      boxheader: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 0 }, via: { mixed: 'corner' }
      },
      /* a4: a block that only half works is a corner */
      boxblock: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 0 }, via: { mixed: 'corner' }
      },
      /* your keeper holds it: when their attack started the event, the ball
       * is yours and your attack starts from your half */
      boxhold: {
        good: ', and holds on to it. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball goes wide, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 1 }
      },
      /* your keeper plays his way out: done well, it is your attack now,
       * starting in your half (a1) */
      escape: {
        good: ', and your team has the ball {to}.',
        mixed: '. The ball goes out of play for their throw-in, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' },
        move: { good: 0 }
      },
      /* e1: playing out together (keeper and Playmaker): your attack starts
       * in midfield */
      escape1: {
        good: ', and your team has the ball {to}.',
        mixed: '. The ball goes out of play for their throw-in, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' },
        move: { good: 1 }
      },
      /* ============== THEIR KEYWORDS ON a5's STRIP (e1, from b3 and d2) */
      /* their Dribbler at the edge of your box, shown down the outside: the
       * worst is that he cuts inside and is through on your goal. `x` says
       * whether the cross from the byline comes in (a Target man or a
       * Crosser waiting) or is headed clear. */
      dwide: {
        good: '. The ball goes out for their throw-in, and their attack is over.',
        mixed: '. {foil} gets to the byline and crosses it, and your defenders head it clear. Their attack is over.',
        bad: '. {foil} cuts inside and is through on your goal.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        tmove: { bad: 1 }, via: { bad: 'alone' }
      },
      dwidex: {
        good: '. The ball goes out for their throw-in, and their attack is over.',
        mixed: '. {foil} gets to the byline and crosses it into your box.',
        bad: '. {foil} cuts inside and is through on your goal.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'break' },
        tmove: { mixed: 1, bad: 1 }, via: { mixed: 'cross', bad: 'alone' }
      },
      /* nobody tackles: he shoots from 25 metres, and your keeper faces it */
      tdrop: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 1 }, via: { mixed: 'corner' }, shot: { mixed: true }
      },
      /* a foul with no card, once a match (Destroyer): in midfield it ends
       * their attack; near your box it is a free kick there */
      tcardfree: {
        good: '. Free kick to them {here}, and the referee shows no card. Their attack is over.',
        mixed: '. Free kick to them {here}, and the referee shows no card. Their attack is over.',
        bad: '. {foil} {fwd}',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        tmove: { bad: 1 }
      },
      tfkfree: {
        good: '. Free kick to them, 25 metres from your goal, and the referee shows no card.',
        mixed: '. Free kick to them, just outside your box, and the referee shows no card.',
        bad: '. {foil} {fwd}',
        effect: { good: 'nothing', mixed: 'nothing', bad: 'break' },
        tmove: { good: 1, mixed: 1, bad: 1 }, via: { good: 'freekick', mixed: 'freekick', bad: 'box' }
      },
      /* their Playmaker in midfield looks for the pass between your
       * defenders for their fastest forward ({mate}) */
      pdeep: {
        good: '. {pm} has nobody to pass to and passes it sideways, and their attack is over.',
        mixed: '. {pm} passes it to {mate} anyway, and {mate} has the ball at the edge of your box, with your defenders in front of him.',
        bad: '. {mate} still gets between your defenders and is through on your goal.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'break' },
        tmove: { mixed: 1, bad: 2 }, via: { bad: 'alone' }
      },
      ppass: {
        good: '. Your team has the ball, and your attack starts {to}.',
        mixed: '. The pass goes out of play, and their attack is over.',
        bad: '. {pm} passes it past {actor}, and {mate} is through on your goal.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        win: { good: 1 }, tmove: { bad: 2 }, via: { bad: 'alone' }
      },
      /* a defender calls the step up: a late step is a failure (the a3
       * review), and {mate} is through */
      poff: {
        good: '. {mate} is offside. Free kick to your team, and your attack starts {to}.',
        mixed: '. {mate} stays onside and is through on your goal.',
        bad: '. {mate} stays onside and is through on your goal.',
        effect: { good: 'stopped', mixed: 'break', bad: 'break' },
        win: { good: 1 }, tmove: { mixed: 2, bad: 2 }, via: { mixed: 'alone', bad: 'alone' }
      },
      /* call: a step up your man wins by 1 to 3 (or level) stops the
       * attack: the runner has to stop his run (round 4 review: the man
       * who won the roll still left their forward through on goal) */
      poffstop: {
        good: '. {mate} is offside. Free kick to your team, and your attack starts {to}.',
        mixed: '. {mate} has to stop his run, and their attack is over.',
        bad: '. {mate} stays onside and is through on your goal.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        win: { good: 1 }, tmove: { bad: 2 }, via: { bad: 'alone' }
      },
      /* call: your keeper kicks it out of play: a throw-in near his own box
       * still ends their attack (round 4 review: "kicks it out for their
       * throw-in ... Alvarez still gets a shot away") */
      kickout: {
        good: ', and the danger is over.',
        mixed: ', and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      /* a Sweeper keeper comes for the Playmaker's pass */
      psweep: {
        good: ', and your team has the ball {to}.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: '. {mate} goes round {actor} and is in your box with your goal empty.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'break' },
        win: { good: 1 }, tmove: { bad: 2 }, via: { bad: 'open' }
      },
      /* in your box: a Shot blocker gets back (only he can, where normally
       * only your keeper is left) */
      block: {
        good: ', and the danger is over.',
        mixed: '. The ball hits {actor} and goes over the bar. Their attack is over.',
        bad: '. The ball goes past {actor}, and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      /* e2: A LOST AERIAL DUEL IS A HEADER ON YOUR GOAL, not a goal: your
       * keeper still has a say (the next decision, via 'header'). A header
       * that is only half won goes out for a corner, once. */
      boxaerial: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: '. {foil} heads it at your goal.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'nothing' },
        tmove: { mixed: 0, bad: 0 }, via: { mixed: 'corner', bad: 'header' }
      },
      boxaerial1: {
        good: ', and the danger is over.',
        mixed: '. The ball goes wide, and their attack is over.',
        bad: '. {foil} heads it at your goal.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'nothing' },
        tmove: { bad: 0 }, via: { bad: 'header' }
      },
      /* ...and when your keeper cannot fail against that man's header */
      boxaerialsure: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: '. {foil} heads it at your goal, and {keeper} catches it easily. Their attack is over.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'nothing' },
        tmove: { mixed: 0 }, via: { mixed: 'corner' }
      },
      boxaerialsure1: {
        good: ', and the danger is over.',
        mixed: '. The ball goes wide, and their attack is over.',
        bad: '. {foil} heads it at your goal, and {keeper} catches it easily. Their attack is over.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'nothing' }
      },
      /* and the header itself, against your keeper: nothing goes on after it */
      keepreact: {
        good: ', and the danger is over.',
        mixed: '. The ball goes over the bar, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      keepcatch: {
        good: ' and throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball bounces off him and goes wide, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 1 }
      },
      keepcatch0: {
        good: ', and the danger is over.',
        mixed: '. The ball bounces off him and goes wide, and their attack is over.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      /* your keeper dives at their low cross: if he misses, their man
       * running in has an empty goal */
      dive: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: '. {tgt} gets to the ball first and scores into an empty net.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      divehold: {
        good: ', and holds on to it. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: '. {tgt} gets to the ball first and scores into an empty net.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' },
        move: { good: 1 }
      },
      /* a Cross catcher takes the cross before their man can head it */
      claim: {
        good: ', and the danger is over.',
        mixed: '. The ball lands outside your box, and their attack is over.',
        bad: '. {tgt} gets to it first, and scores into an empty net.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' }
      },
      claimhold: {
        good: '. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball lands outside your box, and their attack is over.',
        bad: '. {tgt} gets to it first, and scores into an empty net.',
        effect: { good: 'stopped', mixed: 'stopped', bad: 'concede' },
        move: { good: 1 }
      },
      /* a low cross across your six-yard box: a defender gets across to it */
      slide: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {tgt} scores from two metres.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 0 }, via: { mixed: 'corner' }
      },
      slidestop: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out of play, and their attack is over.',
        bad: ', and {tgt} scores from two metres.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' }
      },
      /* your keeper faces the shot and only pushes it out: with no Poacher
       * of theirs near him, the ball goes out for a corner (e1) */
      boxsavec: {
        good: ', and the danger is over.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        tmove: { mixed: 0 }, via: { mixed: 'corner' }, shot: { mixed: true }
      },
      boxsavechold: {
        good: ', and holds on to it. {actor} throws it out quickly, and your team has the ball {to}.',
        mixed: '. The ball goes out for their corner.',
        bad: ', and {foil} scores.',
        effect: { good: 'stopped', mixed: 'nothing', bad: 'concede' },
        move: { good: 1 }, tmove: { mixed: 0 }, via: { mixed: 'corner' }, shot: { mixed: true }
      }
    }
  };

  /* call3: HOW A PLAY THAT STOPS HERE STOPS, for the outcome icons and the
   * short results of the playtester view (options.js iconOf, shortOf). A
   * result that moves the ball (move, tmove, win) is placed by those; this
   * says, for every result that ends the play or keeps the ball where it
   * is, what the player is left with. The words are the table's own
   * sentences, read once here, so no card needs its own icon:
   *   your attack   kept     you keep the ball and start again
   *                 clock    you keep it and the clock runs down
   *                 keeper   the ball runs through to their keeper
   *                 cleared  their players kick it clear
   *                 caught   their keeper catches it (options.js, Cross catcher)
   *                 saved    their keeper saves it
   *                 wide / over / out / throw / blocked / time / fresh
   *                          play stops: wide, over the bar, out of play,
   *                          their throw-in, blocked out, time added back,
   *                          a substitution that gains nothing
   *   their attack  won      you win the ball
   *                 stop     you stop them, the danger is over
   *                 clear    you clear it
   *                 held     your keeper holds it
   *                 back     they keep it but have to go back
   *                 foul     free kick to them
   *                 wide / over / out / throw / fresh / clock / time
   * Adding this changes no number: match.js never reads it. */
  var END = {
    you: {
      goal: { mixed: 'out' }, keep: { good: 'kept', mixed: 'throw' }, ground: { mixed: 'throw' },
      sub: { mixed: 'fresh' }, clock: { good: 'clock', mixed: 'time' },
      through: { mixed: 'keeper' }, shot: { mixed: 'saved' }, square: { mixed: 'blocked' },
      placed: { mixed: 'saved', bad: 'wide' }, longshot: { mixed: 'saved', bad: 'over' },
      header: { mixed: 'wide', bad: 'out' }, lowcross0: { mixed: 'out' },
      fkshot: { mixed: 'saved', bad: 'cleared' }, rebshot: { mixed: 'wide' }
    },
    them: {
      stop: { good: 'stop', mixed: 'wide' }, card: { good: 'foul', mixed: 'foul' },
      offside: { good: 'won', mixed: 'back' }, sub: { mixed: 'fresh' }, clock: { good: 'clock', mixed: 'time' },
      winback: { good: 'won', mixed: 'wide' }, press2: { good: 'stop' }, winback2: { good: 'won' },
      twin: { good: 'won', mixed: 'back' }, tcut: { good: 'won' }, tcard: { good: 'foul', mixed: 'foul' },
      twide: { good: 'throw' }, tblock: { good: 'won' }, ttrap: { good: 'won', mixed: 'back' },
      tsweep: { good: 'clear' }, tclear: { good: 'clear', mixed: 'clear' }, boxclear: { good: 'clear' },
      boxstop: { good: 'stop', mixed: 'wide' }, boxrush: { good: 'stop', mixed: 'out' },
      boxrushhold: { good: 'held', mixed: 'out' }, boxsave: { good: 'stop' }, boxsavehold: { good: 'held' },
      boxheader: { good: 'clear' }, boxblock: { good: 'stop' }, boxhold: { good: 'held', mixed: 'wide' },
      escape: { good: 'won', mixed: 'throw' }, escape1: { good: 'won', mixed: 'throw' },
      dwide: { good: 'throw', mixed: 'clear' }, dwidex: { good: 'throw' }, tdrop: { good: 'held' },
      tcardfree: { good: 'foul', mixed: 'foul' }, pdeep: { good: 'back' }, ppass: { good: 'won', mixed: 'out' },
      poff: { good: 'won' }, poffstop: { good: 'won', mixed: 'back' }, kickout: { good: 'stop', mixed: 'throw' },
      psweep: { good: 'won', mixed: 'out' }, block: { good: 'stop', mixed: 'over' },
      boxaerial: { good: 'clear' }, boxaerial1: { good: 'clear', mixed: 'wide' },
      boxaerialsure: { good: 'clear', bad: 'held' }, boxaerialsure1: { good: 'clear', mixed: 'wide', bad: 'held' },
      keepreact: { good: 'stop', mixed: 'over' }, keepcatch: { good: 'held', mixed: 'wide' },
      keepcatch0: { good: 'held', mixed: 'wide' }, dive: { good: 'stop', mixed: 'out' }, divehold: { good: 'held', mixed: 'out' },
      claim: { good: 'held', mixed: 'clear' }, claimhold: { good: 'held', mixed: 'clear' },
      slide: { good: 'stop' }, slidestop: { good: 'stop', mixed: 'out' },
      boxsavec: { good: 'stop' }, boxsavechold: { good: 'held' }
    }
  };
  Object.keys(END).forEach(function (sd) {
    Object.keys(END[sd]).forEach(function (k) { if (CONSEQUENCE[sd][k]) CONSEQUENCE[sd][k].end = END[sd][k]; });
  });

  function slot(side, pays) {
    var bySide = CONSEQUENCE[side] || CONSEQUENCE.you;
    return bySide[pays] || bySide[side === 'them' ? 'stop' : 'goal'];
  }

  function fill(t, actor, foil, places) {
    var s = String(t)
      .replace(/\{actor\}/g, actor || 'He')
      .replace(/\{foil\}/g, foil || 'their forward');
    if (places) {
      s = s.replace(/\{to\}/g, places.to || '').replace(/\{here\}/g, places.here || '')
        .replace(/\{mate\}/g, places.mate || 'a teammate')
        .replace(/\{back\}/g, places.back || '').replace(/\{fwd2\}/g, places.fwd2 || '').replace(/\{fwd\}/g, places.fwd || '');
      /* e1 (from d1): other named men in a keyword sentence ({pm}, {tgt}, {trip}, {keeper}) */
      if (places.more) for (var k in places.more) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), places.more[k]);
    }
    s = s.replace(/\{actor\}/g, actor || 'He').replace(/\{foil\}/g, foil || 'their forward');
    return s;
  }

  /* e1 (from d2): an option may bring its own table of endings (same shape) */
  function slotOf(side, pays, table) { return table || slot(side, pays); }
  function sentence(side, pays, band, actor, foil, does, places, table) {
    var verb = (does && does[band]) || 'tries it';
    return fill(join(verb, slotOf(side, pays, table)[band], actor), actor, foil, places);
  }
  /* txt2: the join of an action and its ending never says a thing twice
   * (the text audit, reviews/text-audit.md items 16, 19 and 20):
   * an action that ends in a comma before an ending that starts with its
   * own punctuation ("a step ahead of {foil},, and your team"); a keeper
   * who "catches it, and holds on to it"; a ball pushed "out of play. The
   * ball goes out of play". The words the director reads ("catches it",
   * "out of play", "their throw-in") all stay in the sentence. */
  function join(verb, end, actor) {
    var v = String(verb), e = String(end);
    if (/,$/.test(v) && /^[,.]/.test(e)) v = v.slice(0, -1);
    if (/\bcatches it$/.test(v) && /^, and holds on to it\. /.test(e)) e = '.' + e.slice(', and holds on to it.'.length);
    if (/\bout of play$/.test(v)) {
      e = e.replace(/^\. The ball goes out of play for their throw-in, and /, '. It is their throw-in, and ')
        .replace(/^\. The ball goes out of play, and their attack is over\./, '. Their attack is over.')
        .replace(/^\. The ball goes out of play, and the attack is over\./, '. The attack is over.');
    }
    return (actor || 'He') + ' ' + v + e;
  }

  /* What the match does about it. Same table, so the words and the scoreline
   * are the same decision rather than two decisions that agree by luck. */
  function effect(side, pays, band) { return slot(side, pays).effect[band]; }

  /* places (zones, a1): { to, here } in words, and `move` on an outcome says
   * the attack goes on and how many zones the ball goes forward. opts.table
   * is an option's own endings (e1); `shot` marks a band where your keeper
   * saved their shot, which their Poacher can follow up. */
  function outcomes(side, pays, actor, foil, does, o, places, opts) {
    opts = opts || {};
    var sl = slotOf(side, pays, opts.table), sh = sl.shot || {};
    return ['good', 'mixed', 'bad'].map(function (b) {
      var x = {
        band: b, p: o[b], effect: sl.effect[b],
        text: sentence(side, pays, b, actor, foil, does, places, opts.table)
      };
      if (sl.move && typeof sl.move[b] === 'number') x.move = sl.move[b];
      if (sl.into && sl.into[b]) x.into = sl.into[b];
      if (sl.tmove && typeof sl.tmove[b] === 'number') x.tmove = sl.tmove[b];
      if (sl.win && sl.win[b]) x.win = true;
      if (sl.via && sl.via[b]) x.via = sl.via[b];
      if (sl.end && sl.end[b]) x.end = sl.end[b];
      if (sh[b]) x.shotBand = true;
      return x;
    }).filter(function (x) { return x.p > 0.004; });
  }

  var API = {
    GOOD_BY: GOOD_BY, CERTAIN_AT: CERTAIN_AT, IMPOSSIBLE_AT: IMPOSSIBLE_AT,
    odds: odds, pct: pct, explain: explain, outcomes: outcomes, sentence: sentence, fill: fill, slotOf: slotOf,
    effect: effect, CONSEQUENCE: CONSEQUENCE
  };
  root.KMResolve = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
