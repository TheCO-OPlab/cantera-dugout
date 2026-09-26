/* CONTENT E (wave 1e of the kmtree3 build-emergence run).
 *
 * Wave B found that its builds added strength (+0.1 to +0.4 goals a match)
 * but changed which option the best player picks in only 0 to 11 percent of
 * decisions. This wave's components are aimed at the DECISION: each one
 * changes which options exist, who gets the ball, what a failure turns into,
 * when an option is worth taking, or what an option costs. A flat "+N" is
 * kept to a few, and where a number moves it moves because of who is on the
 * card or what happened earlier (the sign of the number depends on the choice).
 *
 *   Bait and switch     the value is in NOT picking a man: a decoy who
 *                       drags his marker, a runner who takes the pass meant
 *                       for him, defenders who are set for what they saw
 *                       last, and a defender who leaves a man free on purpose
 *   Broken play         a failed option opens a different continuation: a
 *                       saved hard shot or a half-won ball through is loose,
 *                       one man is first to it; on defence a lost tackle is a
 *                       foul that costs a booking
 *   The late arrival    a runner's value depends on timing: he arrives on
 *                       the second decision in their half, so pass now or
 *                       hold it for him; a defender who waits a decision
 *   Two edges at once   a rule exception: edges add up instead of the
 *                       biggest counting, so a runner (a movement edge) and a
 *                       support player (a player edge) stop competing
 *   Hold the line       (my own) a back line that steps up in its own box,
 *                       a keeper who sweeps behind it, and a ball over the top
 *                       the moment it works; every trap teaches them
 *
 * Rules of the file (EFFECTS.md): every change goes through an effects-layer
 * helper, so it is named on the card before the pick and in the log when it
 * fires; components match on tags, states and roles, never on option ids of
 * the engine or on another component; every repeat and every new option has
 * a limit. What happened earlier in an attack lives in MEM (keyed by the
 * squad) and is only read by the hooks. Plain English, no dashes.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  var LK = ['def', 'mid', 'att'];
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function has(tags, list) { return list.some(function (t) { return (tags || []).indexOf(t) >= 0; }); }
  function best(list, attr, low) {
    var s = list.filter(Boolean).slice().sort(function (a, b) {
      var d = ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0);
      return low ? -d : d;
    });
    return s[0] || null;
  }
  function inLine(sq, n) { return (sq.players || []).filter(function (p) { return p.line === n; }); }

  var BACKWARDS = ['back pass', 'recycle', 'time wasting', 'substitution', 'keeper action', 'clearance'];
  var TACKLES = ['tackle', 'press', 'interception', 'double team'];
  /* the kind of move a defender remembers (Guessing) */
  function moveKind(t) {
    if (has(t, BACKWARDS)) return null;
    /* m3: pushing everyone forward is not a move against a man (w1f gave it a
     * second tag, 'late run', which read as a pass here) */
    if (has(t, ['all out attack'])) return null;
    if (has(t, ['shot'])) return 'shot';
    if (has(t, ['dribble', 'carry'])) return 'run';
    if (has(t, ['cross', 'low cross'])) return 'cross';
    if (has(t, ['cut-back', 'pull-back', 'square ball'])) return 'cut-back';
    if (has(t, ['through ball', 'long ball', 'run in behind', 'switch'])) return 'ball in behind';
    if (has(t, ['short pass', 'layoff', 'one-two', 'overlap', 'late run', 'pass'])) return 'pass';
    return null;
  }
  var KIND_WORD = { run: 'run with the ball', cross: 'cross', 'cut-back': 'cut-back', 'ball in behind': 'ball in behind him', pass: 'pass', shot: 'shot' };

  /* ------------------------------------------------------ memory */
  var MEM = new WeakMap();
  function mem(squad) {
    var m = MEM.get(squad);
    if (!m) {
      m = { st: null, last: -1, att: fresh('you'), def: fresh('them'), faced: {}, invites: 0, traps: 0, wonBack: false };
      MEM.set(squad, m);
    }
    return m;
  }
  function fresh(side) { return side === 'you' ? { n: 0, half: 0, touched: {} } : { n: 0, invited: false }; }
  /* Every component that reads the history of an attack carries TRACK. Its
   * `when` records and returns false, so it never fires, changes nothing and
   * writes nothing (the effects audit agrees). record() runs once per
   * decision whichever component hears it first. */
  var TRACK = [
    { name: 'track:start', on: 'possession_start', when: function (e) {
      var m = mem(e.st.squad); m.st = e.st;
      if (e.side === 'you') m.att = fresh('you'); else m.def = fresh('them');
      return false;
    }, run: function () { } },
    { name: 'track:decision', on: 'decision_end', when: function (e) { record(e); return false; }, run: function () { } }
  ];
  function record(e) {
    var m = mem(e.st.squad), at = e.st.fx.scope.decision;
    m.st = e.st;
    if (m.last === at) return m;
    m.last = at;
    if (e.side === 'you') {
      m.att.n++;
      if (typeof e.zone === 'number' && e.zone >= 2) m.att.half++;
      if (e.actor) m.att.touched[e.actor.id] = 1;
      if (e.st.pending && e.st.pending.carrier) m.att.touched[e.st.pending.carrier.id] = 1;
      if (e.to && e.band !== 'bad') m.att.touched[e.to.id] = 1;
      if (e.id === 'FXE_HOLD_UP') m.att.held = true;
      var k = moveKind(e.tags);
      if (k && k !== 'shot' && e.foil && e.actor && e.foil !== e.st.opp.keeper) m.faced[e.actor.id] = k;
      m.wonBack = false;
    } else {
      m.def.n++;
      /* your attack starts from this: a clean stop or their man offside */
      m.wonBack = e.effect === 'stopped';
    }
    return m;
  }
  function att(q) { return mem(q.squad).att; }
  function dfn(q) { return mem(q.squad).def; }
  /* the man on the ball for the decision being built (w1e's q.carrier) */
  function carrierOf(q) { return q.carrier || null; }
  /* a man of yours they are watching: the state "marked" (a Decoy, or the
   * man their half-time change put a second player on), or a man a defender
   * of theirs has learned a move from (match.js counterplay) */
  function watched(q, p) {
    if (!p) return false;
    if (q.hasState('marked', p)) return true;
    var st = mem(q.squad).st, cm = st && st.cmem;
    if (!cm || !cm.beat) return false;
    return Object.keys(cm.beat).some(function (k) { return cm.beat[k] === p && (cm.learn[k] || 0) >= 1; });
  }

  /* ================================================== A. BAIT AND SWITCH */

  FX.define({
    id: 'WE_DECOY', name: 'Decoy', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['recipient', 'odds'],
    text: 'At the start of each of your attacks a centre-back of theirs is told to go wherever he goes (he is marked). Until he touches the ball, a pass to him or a move by him in their half is -2 (two men are on him), and a move by anyone else against one of their defenders there is +1 (a defender is missing from his place). He is worth most to a team that has someone to take the ball meant for him. Once the ball reaches him the marking is over for that attack.',
    effects: TRACK.concat([
      { name: 'mark', on: 'possession_start', when: function (e) { return e.side === 'you' && e.onPitch(e.owner); },
        run: function (e) { e.addState('marked', e.owner, { duration: 'possession' }, 'a centre-back of theirs goes wherever ' + first(e.owner) + ' goes this attack'); } },
      { name: 'free', on: 'decision_end',
        when: function (e) {
          var ch = e.st.chain && e.st.chain.next === 'zone' ? e.st.chain : null;
          var had = e.st.pending && e.st.pending.carrier === e.owner;   /* he was on the ball for this decision */
          return e.side === 'you' && e.hasState('marked', e.owner) && (had || (e.band !== 'bad' && (e.actor === e.owner || e.to === e.owner)) || (!!ch && ch.carrier === e.owner));
        },
        run: function (e) { e.removeState('marked', e.owner, first(e.owner) + ' has the ball now, so the marking is over for this attack'); } },
      { name: 'onHim', hook: 'stat',
        when: function (q) { return q.side === 'you' && q.zone >= 2 && q.hasState('marked', q.owner) && carrierOf(q) !== q.owner && (q.actor === q.owner || (q.to === q.owner && !q.has('shot'))) && !has(q.tags, BACKWARDS); },
        apply: function (q) { q.stat(-2, 'two of theirs are on ' + first(q.owner)); } },
      { name: 'elsewhere', hook: 'stat',
        when: function (q) {
          return q.side === 'you' && q.zone >= 2 && q.hasState('marked', q.owner) && carrierOf(q) !== q.owner && q.actor !== q.owner && (q.to !== q.owner || q.has('shot')) &&
            !!q.foil && q.foil.line === 0 && !has(q.tags, BACKWARDS);
        },
        apply: function (q) { q.stat(1, 'the centre-back marking ' + first(q.owner) + ' has left his place'); } }
    ])
  });

  FX.define({
    id: 'WE_ARRIVES_LATE', name: 'Arrives late', kind: 'trait', system: 'S18 Routing',
    changes: ['recipient', 'odds'],
    text: 'In their half, a pass meant for a man they are watching (marked, or a man one of their defenders has learned a move from) goes to him instead: he arrives late from midfield, nobody has picked him up, so the pass to him is +2, and whatever edge the pass carried for that man (arriving unmarked, +2 to his shot) is his. The card names him before you choose.',
    effects: TRACK.concat([
      { name: 'swap', hook: 'option',
        when: function (q) {
          return q.side === 'you' && q.zone >= 2 && !!q.to && q.to !== q.actor && q.actor !== q.owner && q.to !== q.owner &&
            has(q.tags, ['pass', 'cross', 'low cross', 'cut-back', 'pull-back', 'square ball']) && !has(q.tags, BACKWARDS) &&
            q.onPitch(q.owner) && watched(q, q.to);
        },
        apply: function (q) {
          var late = first(q.owner);
          q.setRecipient(q.owner, first(q.to) + ' is being watched, so ' + late + ' arrives late and takes it instead');
          /* m1: the +2 wave E trimmed, restored under the designer's steer (powerful: make rare later) */
          q.stat(2, 'nobody has picked up ' + late + ' arriving late');
        } },
    ])
  });

  FX.define({
    id: 'WE_GUESSING', name: 'Guessing', kind: 'tactic', system: 'S12 Opponent adaptation',
    changes: ['odds', 'opponent state'],
    text: 'Their defence remembers the last kind of move each of your players tried against one of their outfield men (a run, a cross, a cut-back, a ball in behind, a pass), whether it worked or not, and is set for it. The same kind again from that player is +2 to the defender facing him; any other kind from him is +2 to your player.',
    effects: TRACK.concat([
      { name: 'guess', hook: 'stat',
        when: function (q) {
          if (q.side !== 'you' || !q.actor || !q.foil || q.foil === q.opp.keeper) return false;
          var k = moveKind(q.tags);
          return !!k && k !== 'shot' && !!mem(q.squad).faced[q.actor.id];
        },
        apply: function (q) {
          var was = mem(q.squad).faced[q.actor.id], k = moveKind(q.tags);
          if (was === k) q.theirStat(2, 'their defence is set for the ' + KIND_WORD[k] + ' ' + first(q.actor) + ' tried last time');
          else q.stat(2, 'their defence is set for the ' + KIND_WORD[was] + ' ' + first(q.actor) + ' tried last time, not this');
        } }
    ])
  });

  FX.define({
    id: 'WE_INVITE', name: 'Invites the pass', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['option availability', 'opponent state'],
    text: 'On their attack, in midfield or at the edge of your box: he leaves their runner free on purpose and steps into the pass when it comes (his Intelligence against their man\'s Passing, +2: they do not see it coming). A clean win steals it and your attack starts at the edge of their box; a half win and they play round him; a loss leaves the runner free. Every time it works they are less fooled: -2 each time, for the match.',
    effects: TRACK.concat([
      { name: 'learnt', on: 'clean_win', when: function (e) { return e.side === 'them' && e.id === 'FXE_INVITE'; },
        run: function (e) { var m = mem(e.st.squad); m.invites++; e.note('they fell for it; next time they will half expect it (-' + (2 * m.invites) + ' to the trick for the match)'); } }
    ]),
    pool: [{
      id: 'FXE_INVITE', side: 'them', tzones: [0, 1], family: 'press', tags: ['interception', 'marking'], ground: true,
      text: 'he leaves a man free on purpose and steps into the pass',
      when: function (x, q) {
        var m = mem(q.squad);
        return !!q.owner && !!x.foil && q.owner !== x.foil && x.foil.attr && typeof x.foil.attr.passing === 'number';
      },
      build: function (x, q) {
        /* m1: +2 to start (wave E's first number, trimmed to -1 in tuning; restored under the steer), 2 less each time it has worked */
        var h = q.owner, m = mem(q.squad), b = 2 - 2 * m.invites;
        return {
          test: { mine: h, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'passing' },
          bonus: b, because: !m.invites ? 'they do not see it coming' : m.invites + (m.invites === 1 ? ' time' : ' times') + ' they fell for it, so now they half expect it',
          risk: 'high', to: h, pays: 'tcut', winZone: 2,
          does: { good: 'steps in front of the pass ' + first(x.foil) + ' thought was on', mixed: 'gets there, but ' + first(x.foil) + ' plays it round him', bad: 'is a step late, and the man he left is free' },
          label: first(h) + ' leaves their runner free and steps into the pass',
          read: first(h) + ' (Intelligence ' + h.attr.intelligence + ') against ' + first(x.foil) + ' (Passing ' + x.foil.attr.passing + '). ' +
            'The runner is left free on purpose. A clean win steals the pass and your attack starts at the edge of their box; lose it and the runner is free.'
        };
      }
    }]
  });

  /* ======================================================= B. BROKEN PLAY */

  FX.define({
    id: 'WE_SECOND_BALL', name: 'Second ball', kind: 'tactic', system: 'S19 Drawbacks and productive failure',
    changes: ['continuation'],
    text: 'Once an attack, a hard shot or a shot from distance that their keeper only saves (a half win) is not the end: he cannot hold it, the ball is loose in their box and your attack goes on there. A placed shot he catches, so it gets nothing from this.',
    effects: [
      { name: 'loose', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.has('shot') && (q.has('hard shot') || q.has('long shot')) && !q.has('placed shot') && typeof q.zone === 'number'; },
        apply: function (q) {
          /* m3 from fix1: not a line that ends with their keeper holding it */
          var s = q.lines().filter(function (x) {
            return x.band === 'mixed' && x.effect === 'nothing' && typeof x.move !== 'number' &&
              x.end !== 'keeper' && !x.caught && !/runs through to their keeper/i.test(x.text || '');
          })[0];
          if (!s) return;
          q.branch('mixed', { effect: 'ground', move: q.zone >= 3 ? 0 : 1, to: q.actor }, 'the keeper cannot hold it: the ball is loose in their box and the attack goes on');
        } }
    ]
  });

  FX.define({
    id: 'WE_BROKEN', name: 'Broken play', kind: 'tactic', system: 'S19 Drawbacks and productive failure',
    changes: ['continuation'],
    text: 'Once an attack, a ball through, a cross or a long ball in their half that is only half won (it would run through to their keeper or out of play) breaks loose instead, and your team is first to it: the attack goes on where it was.',
    effects: [
      { name: 'loose', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) {
          return q.side === 'you' && q.zone >= 1 && !q.has('shot') &&
            has(q.tags, ['through ball', 'cross', 'low cross', 'long ball', 'run in behind', 'switch']);
        },
        apply: function (q) {
          var s = q.lines().filter(function (x) { return x.band === 'mixed' && x.effect === 'nothing' && typeof x.move !== 'number'; })[0];
          if (!s) return;
          q.branch('mixed', { effect: 'ground', move: 0, rewriteLoose: true }, 'the ball breaks loose and your team is first to it: the attack goes on here');
        } }
    ]
  });

  FX.define({
    id: 'WE_FIRST_TO_IT', name: 'First to it', kind: 'trait', system: 'S18 Routing',
    changes: ['recipient'],
    text: 'In their half, when a shot, a cross or a ball through is only half won and the attack still goes on (a loose ball), the ball falls to him, and his shots in the rest of that attack are +2 (their keeper is still getting up). He makes no loose balls himself: someone else has to.',
    effects: [
      { name: 'to', hook: 'outcome',
        when: function (q) {
          return q.side === 'you' && q.zone >= 2 && q.actor !== q.owner && q.onPitch(q.owner) &&
            has(q.tags, ['shot', 'cross', 'low cross', 'through ball', 'long ball', 'run in behind']);
        },
        apply: function (q) {
          q.setTo('mixed', q.owner, 'the loose ball falls to ' + first(q.owner));
          q.grant('mixed', { n: 2, tags: ['shot'], man: q.owner, why: 'their keeper is still getting up' }, 'their keeper is still getting up');
        } }
    ]
  });

  FX.define({
    id: 'WE_ONE_FOR_TEAM', name: 'Takes one for the team', kind: 'tactic', system: 'S19 Drawbacks and productive failure',
    changes: ['outcome tier', 'continuation', 'cost'],
    text: 'Outside your box, when a tackle, press or interception by a man who is not on a yellow card loses, he pulls their man down instead: their attack does not get past him (a free kick to them where it was), and he is booked for the match. A booked man is never asked again, and his tackles are -1 from then on (he cannot go in hard).',
    effects: [
      /* m1: no longer once in each of their attacks (a balance cap, removed under the designer's steer).
       * What bounds it: a booked man is never asked again, and the engine keeps one of their attacks going at most PROLONG_MAX (2) times */
      { name: 'foul', hook: 'outcome',
        when: function (q) {
          return q.side === 'them' && typeof q.tzone === 'number' && !!q.actor && has(q.tags, TACKLES) && !q.has('foul') && !q.hasState('booked', q.actor);
        },
        /* m3 from fix1 (item 1): the free kick it announces happens */
        apply: function (q) { q.setTheirFreeKick('bad', first(q.actor) + ' pulls ' + first(q.foil) + ' down rather than let him go: a free kick to them where it was, and ' + first(q.actor) + ' is booked'); } },
      { name: 'book', on: 'loss',
        when: function (e) {
          if (e.side !== 'them' || !e.actor) return false;
          var at = e.st.log.length;
          return e.st.fx.log.some(function (l) { return l.at === at && l.field === 'move' && /^Takes one for the team/.test(l.source); });
        },
        run: function (e) { e.addState('booked', e.actor, { duration: 'match' }, first(e.actor) + ' is on a yellow card for the rest of the match'); } },
      { name: 'careful', hook: 'stat',
        when: function (q) { return q.side === 'them' && !!q.actor && has(q.tags, TACKLES) && q.hasState('booked', q.actor); },
        apply: function (q) { q.stat(-1, first(q.actor) + ' is on a yellow card and cannot go in hard'); } }
    ]
  });

  /* =================================================== C. THE LATE ARRIVAL */

  FX.define({
    id: 'WE_LATE_RUNNER', name: 'Late runner', kind: 'trait', system: 'S17 Sequence and timing',
    changes: ['option availability', 'timing'],
    text: 'He starts deep and arrives on the SECOND decision of each of your attacks, not before and not after. On that decision only, a new option: the ball to him arriving late (his Intelligence against their weakest-reading midfielder, +2 because nobody tracked him). In midfield a clean win gives him the ball at the edge of their box, at the edge a clean win gives it to him in their box (+2 to his next move), a half win one zone short; in their box a clean win is a goal. Pass early and he is not there yet; wait too long and they have picked him up.',
    effects: TRACK,
    pool: [{
      id: 'FXE_LATE_RUN', side: 'you', zones: [1, 2, 3], family: 'move', tags: ['late run', 'pass'],
      text: 'he arrives late, on the second decision of the attack',
      when: function (x, q) {
        var a = mem(q.squad).att;
        if (!q.owner || x.actor === q.owner || a.n !== 1 || a.touched[q.owner.id]) return false;
        x._fxeD = best(inLine(q.opp, 1), 'intelligence', true);
        return !!x._fxeD;
      },
      build: function (x, q) {
        var r = q.owner, d = x._fxeD, box = x.zone >= 3, mid = x.zone <= 1;
        return {
          test: { mine: r, mineAttr: 'intelligence', theirs: d, theirsAttr: 'intelligence' },
          bonus: 2, because: 'nobody tracked ' + first(r) + ' from midfield',
          risk: 'even', to: r, pays: box ? 'square' : 'probe',
          grants: box ? undefined : { good: [{ id: 'unmarked', man: r }] },
          table: box ? undefined : {
            good: ' and ' + first(r) + ' has the ball ' + (mid ? 'at the edge of their box.' : 'in their box.'), mixed: ', and ' + first(r) + ' has the ball ' + (mid ? 'in midfield.' : 'at the edge of their box.'),
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: 'ground', mixed: 'ground', bad: 'break' }, move: { good: 1, mixed: 0 }
          },
          does: { good: 'arrives late past {foil}, unseen,', mixed: 'arrives with {foil} just behind him', bad: 'is picked up by {foil}' },
          label: first(x.actor) + ' waits for ' + first(r) + ' to arrive late and plays it to him',
          read: first(r) + ' (Intelligence ' + r.attr.intelligence + ') against ' + first(d) + ' (Intelligence ' + d.attr.intelligence + '), the midfielder who should have tracked him. ' +
            'This is the one decision he is there: ' + (box ? 'a clean win and he scores.' : mid ? 'a clean win and he has the ball at the edge of their box, unmarked (+2 to his next move).' : 'a clean win and he has the ball in their box, unmarked (+2 to his shot).')
        };
      }
    }]
  });

  FX.define({
    id: 'WE_HOLD_UP', name: 'Holds it up', kind: 'trait', system: 'S17 Sequence and timing',
    changes: ['option availability', 'cost', 'timing'],
    text: 'In midfield or at the edge of their box, a new option: the ball into his feet and he holds it up with his back to goal (his Physical against the defender behind him, +1). It keeps the ball where it is and does not use up one of the attack\'s decisions (no attack gets more than two free decisions). It is worth something only on the first decision of an attack with a runner of yours still to come: then holding it means he arrives for the second.',
    effects: TRACK.concat([
      { name: 'free', hook: 'cost', when: function (q) { return q.id === 'FXE_HOLD_UP'; },
        apply: function (q) { q.freeDecision('holding it up does not use up one of the attack\'s decisions'); } }
    ]),
    pool: [{
      id: 'FXE_HOLD_UP', side: 'you', zones: [1, 2], family: 'hold', tags: ['layoff', 'short pass', 'pass'],
      text: 'he holds the ball up and waits for support',
      when: function (x, q) {
        var a = mem(q.squad).att;
        /* m1: no longer once an attack (a balance cap, removed under the designer's steer); the engine's FREE_MAX (2 free decisions an attack) is the loop guard */
        if (!q.owner || !x.foil) return false;
        x._fxeCB = best(inLine(q.opp, 0), 'physical');
        return !!x._fxeCB;
      },
      build: function (x, q) {
        var h = q.owner, d = x._fxeCB, a = mem(q.squad).att;
        /* a runner of yours still in midfield who has not had the ball */
        var runner = q.roles('runner').filter(function (p) { return p.line === 1 && p !== x.actor && p !== h && !a.touched[p.id]; })[0] || null;
        var worth = !!runner && a.n === 0;
        return {
          test: { mine: h, mineAttr: 'physical', theirs: d, theirsAttr: 'physical' },
          bonus: 1, because: first(h) + ' only has to keep it, not turn', risk: 'low', to: h, pays: 'hold',
          table: {
            good: worth ? ', and ' + first(runner) + ' is arriving from midfield.' : ', and your team keeps the ball where it was.',
            mixed: ', and your team keeps the ball where it was.',
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: worth ? 'ground' : 'nothing', mixed: 'nothing', bad: 'break' }, move: { good: 0, mixed: 0 }
          },
          does: { good: 'holds off {foil} and keeps it', mixed: 'just keeps it with {foil} all over him', bad: 'is knocked off it by {foil}' },
          label: (x.actor === h ? first(h) : first(x.actor) + ' plays it into ' + first(h) + ', who') + ' holds it up with his back to goal',
          read: first(h) + ' (Physical ' + h.attr.physical + ') against ' + first(d) + ' (Physical ' + d.attr.physical + '). The ball stays where it is and it does not use up a decision. ' +
            (worth ? first(runner) + ' is still coming from midfield: holding it means he arrives for the next decision.' : 'Nobody is coming from midfield, so it only buys time.')
        };
      }
    }]
  });
  FX.define({
    id: 'WE_BEFORE_SET', name: 'Before they are set', kind: 'tactic', system: 'S17 Sequence and timing',
    changes: ['outcome tier', 'timing'],
    text: 'On the FIRST decision of each attack at the edge of their box or in it, their defence is still running back: a cross, a cut-back, a pull-back, a ball across the goal or a ball through needs only 3, not 4, for a clean win. From the second decision on they are set and it is the normal 4.',
    effects: TRACK.concat([
      { name: 'early', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.zone >= 2 && att(q).half === 0 && has(q.tags, ['cross', 'low cross', 'cut-back', 'pull-back', 'square ball', 'through ball']); },
        apply: function (q) { q.threshold(3, 'their defence is still running back: a clean win needs 3'); } }
    ])
  });

  FX.define({
    id: 'WE_PICKS_MOMENT', name: 'Picks his moment', kind: 'trait', system: 'S17 Sequence and timing',
    changes: ['odds', 'outcome tier', 'timing'],
    text: 'On the first decision of their attack he never dives in: his tackle, press or interception is -2. From their second decision on he has read it: +2, and a clean win needs only 3.',
    effects: TRACK.concat([
      { name: 'early', hook: 'stat',
        when: function (q) { return q.side === 'them' && q.byOwner() && has(q.tags, TACKLES) && dfn(q).n === 0; },
        apply: function (q) { q.stat(-2, first(q.owner) + ' never dives in on the first ball'); } },
      { name: 'late', hook: 'stat',
        when: function (q) { return q.side === 'them' && q.byOwner() && has(q.tags, TACKLES) && dfn(q).n >= 1; },
        apply: function (q) { q.stat(2, first(q.owner) + ' has read their attack by now'); } },
      { name: 'lateTier', hook: 'duel',
        when: function (q) { return q.side === 'them' && q.byOwner() && has(q.tags, TACKLES) && dfn(q).n >= 1; },
        apply: function (q) { q.threshold(3, 'a clean win needs 3: he picked his moment'); } }
    ])
  });

  /* ================================================= D. TWO EDGES AT ONCE */

  /* how many edges this decision carries from the last one (the engine's
   * own and the build's); the exception only shows where there are two */
  function carriedN(q) { var st = mem(q.squad).st; return st && st.fx ? (st.fx.carried() || []).length : 0; }
  var EDGE_TAGS = ['pass', 'cross', 'low cross', 'cut-back', 'pull-back', 'square ball', 'through ball', 'shot'];
  FX.define({
    id: 'WE_TWO_EDGES', name: 'Two edges at once', kind: 'tactic', system: 'S16 Rule exceptions',
    changes: ['odds', 'rule exceptions'],
    text: 'Normally only the biggest edge you carry into a decision counts. With this, on a pass, a cross or a shot, and on your keeper\'s and defenders\' last stop in your box, every edge you carry counts: a run that pulled them apart and a man left unmarked add up.',
    effects: [
      { name: 'stack', hook: 'stat',
        when: function (q) {
          var ok = (q.side === 'you' && has(q.tags, EDGE_TAGS) && !has(q.tags, BACKWARDS)) || (q.side === 'them' && typeof q.tzone !== 'number' && has(q.tags, ['save', 'block', 'claim', 'header']));
          return ok && carriedN(q) >= 2;
        },
        apply: function (q) { q.stackEdges('two edges at once: the edges this carries add up'); } }
    ]
  });

  FX.define({
    id: 'WE_TAKES_TWO', name: 'Takes two with him', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['opponent state', 'continuation'],
    text: 'When his run with the ball in midfield or their half is won (a half win is enough), he took two of them with him: their defence is stretched for the rest of the attack, which is an edge on every later pass, cross or shot in it (+2). It is a movement edge, so without a rule that lets edges add up it competes with any other edge you carry.',
    effects: TRACK.concat([
      { name: 'pull', on: 'decision_end',
        when: function (e) { return e.side === 'you' && e.byOwner() && e.band !== 'bad' && has(e.tags, ['dribble', 'carry']) && typeof e.zone === 'number' && e.zone >= 1 && !e.hasState('stretched', 'opponent') && !!(e.st.chain && e.st.chain.next === 'zone'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, first(e.owner) + ' took two of them with him: their defence is stretched for the rest of this attack'); } },
      { name: 'edge', on: 'decision_end',
        when: function (e) { return e.side === 'you' && e.hasState('stretched', 'opponent') && !!(e.st.chain && e.st.chain.next === 'zone'); },
        run: function (e) { e.addEdge({ n: 2, tags: EDGE_TAGS, why: 'their defence is stretched' }, 'their defence is still stretched'); } }
    ])
  });

  FX.define({
    id: 'WE_FREE_MAN', name: 'Finds the free man', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['option availability', 'recipient', 'odds'],
    text: 'In their half he always finds the free man: a new option on any menu where someone else has the ball at the edge of their box, the ball to him and on to whichever teammate is free (his Technique against the nearest midfielder, +1). A clean or half win: the ball is still at the edge and the man who gets it is unmarked, +2 to his next move. It is a player edge, so without a rule that lets edges add up it competes with any other edge you carry.',
    effects: [],
    pool: [{
      id: 'FXE_FREE_MAN', side: 'you', zones: [2], family: 'hold', tags: ['short pass', 'one-two', 'pass'],
      text: 'he finds the free man',
      when: function (x, q) {
        if (!q.owner || x.actor === q.owner) return false;
        x._fxeM = best(inLine(q.opp, 1), 'intelligence');
        x._fxeTo = best(q.squad.players.filter(function (p) { return p.line === 2 && p !== x.actor && p !== q.owner; }), 'finishing');
        return !!x._fxeM && !!x._fxeTo;
      },
      build: function (x, q) {
        var h = q.owner, d = x._fxeM, t = x._fxeTo;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: d, theirsAttr: 'intelligence' },
          bonus: 1, because: first(h) + ' only needs a yard', risk: 'even', to: t, pays: 'probe',
          grants: { good: [{ id: 'unmarked', man: t }], mixed: [{ id: 'unmarked', man: t }] },
          table: {
            good: ', and ' + first(t) + ' has it at the edge of their box with nobody on him.', mixed: ', and ' + first(t) + ' has it at the edge of their box with nobody on him.',
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: 'ground', mixed: 'ground', bad: 'break' }, move: { good: 0, mixed: 0 }
          },
          does: { good: 'takes it off ' + first(x.actor) + ' and finds ' + first(t), mixed: 'gets it to ' + first(t) + ' just past {foil}', bad: 'is closed down by {foil}' },
          label: first(x.actor) + ' gives it to ' + first(h) + ', who finds ' + first(t) + ' free',
          read: first(h) + ' (Technique ' + h.attr.technique + ') against ' + first(d) + ' (Intelligence ' + d.attr.intelligence + '). The ball stays at the edge of their box, and ' + first(t) + ' gets it unmarked (+2 to his next move).'
        };
      }
    }]
  });

  FX.define({
    id: 'WE_SHOWS_WIDE', name: 'Shows him wide', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['odds', 'continuation'],
    text: 'On their attack, when he stays on his man instead of tackling (he covers, marks or drops) and it is a clean or half win, their man has to go wide: the angle is narrow, +2 to your next stop in that attack. It is a movement edge, so without a rule that lets edges add up it competes with any other edge your defence carries.',
    effects: [
      { name: 'wide', hook: 'outcome',
        when: function (q) { return q.side === 'them' && q.byOwner() && has(q.tags, ['cover', 'marking', 'drop back']) && !has(q.tags, TACKLES); },
        apply: function (q) {
          q.grant('good', { n: 2, why: first(q.foil) + ' was shown wide, so the angle is narrow' }, first(q.foil) + ' is shown wide: +2 to your next stop');
          q.grant('mixed', { n: 2, why: first(q.foil) + ' was shown wide, so the angle is narrow' }, first(q.foil) + ' is shown wide: +2 to your next stop');
        } }
    ]
  });

  /* ======================================================= E. HOLD THE LINE */

  FX.define({
    id: 'WE_HOLD_LINE', name: 'Hold the line', kind: 'tactic', system: 'S16 Rule exceptions',
    changes: ['option availability', 'opponent state'],
    text: 'Your back line may step up together even in your own box: when their man is waiting for a cross or a pass into your box, a new option leaves him offside (your best reader of the game, his Intelligence against their man\'s, +2). A clean or half win and he is offside; a loss and he is through with only your keeper to beat. Every time you use it they time their runs better: -2 each time, for the match.',
    effects: TRACK.concat([
      { name: 'seen', on: 'decision_end', when: function (e) { if (e.side === 'them' && e.id === 'FXE_STEP_UP') mem(e.st.squad).traps++; return false; }, run: function () { } }
    ]),
    pool: [{
      id: 'FXE_STEP_UP', side: 'them', box: true, family: 'stop', tags: ['offside trap'],
      text: 'your back line steps up in your own box',
      when: function (x, q) {
        if (!x.foil || ['cross', 'lowcross', 'box', 'fkcross'].indexOf(x.via) < 0) return false;
        if (x.state && x.state.bounced) return false;
        x._fxeC = best(inLine(q.squad, 0), 'intelligence');
        return !!x._fxeC;
      },
      build: function (x, q) {
        var c = x._fxeC, m = mem(q.squad), b = 2 - 2 * m.traps;
        return {
          test: { mine: c, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'intelligence' },
          bonus: b, because: m.traps ? 'they have seen your line step up ' + m.traps + (m.traps === 1 ? ' time' : ' times') : 'they do not expect it inside the box',
          risk: 'high', pays: 'offside',
          does: { good: 'calls your line out together, and ' + first(x.foil) + ' is caught offside', mixed: 'steps up just in time, and ' + first(x.foil) + ' is offside by a yard', bad: 'steps up a moment late, and ' + first(x.foil) + ' is through' },
          label: first(c) + ' steps your back line up, to leave ' + first(x.foil) + ' offside',
          read: first(c) + ' (Intelligence ' + c.attr.intelligence + ') against ' + first(x.foil) + ' (Intelligence ' + x.foil.attr.intelligence + '). ' +
            'A clean or half win and he is offside. A loss and he scores. They learn from it: -2 each time you use it.'
        };
      }
    }]
  });

  FX.define({
    id: 'WE_SWEEPER', name: 'Sweeper keeper', kind: 'trait', system: 'S01 Footballer traits',
    changes: ['odds', 'outcome tier'],
    text: 'He stands high behind the back line. When he comes out (a keeper action on his Intelligence or Pace) he is +2 and a clean win needs only 3; when he has to react on his line (Reflexes) he is -1, because he is a step too far out.',
    effects: [
      { name: 'out', hook: 'stat',
        when: function (q) { return q.side === 'them' && q.byOwner() && q.has('keeper action') && (q.mineAttr === 'intelligence' || q.mineAttr === 'pace'); },
        apply: function (q) { q.stat(2, first(q.owner) + ' is already off his line'); } },
      { name: 'outTier', hook: 'duel',
        when: function (q) { return q.side === 'them' && q.byOwner() && q.has('keeper action') && (q.mineAttr === 'intelligence' || q.mineAttr === 'pace'); },
        apply: function (q) { q.threshold(3, 'a clean win needs 3: he is there first'); } },
      { name: 'line', hook: 'stat',
        when: function (q) { return q.side === 'them' && q.byOwner() && q.has('keeper action') && q.mineAttr === 'reflexes'; },
        apply: function (q) { q.stat(-1, first(q.owner) + ' is a step too far off his line'); } }
    ]
  });

  FX.define({
    id: 'WE_OVER_THE_TOP', name: 'Straight over the top', kind: 'tactic', system: 'S18 Routing',
    changes: ['option availability', 'timing'],
    text: 'When your attack starts from a ball you won in their attack (a stop, a steal, their man offside), their players are still upfield: on its first decision only, a new option, the ball straight over the top for your fastest forward (his Pace against their slowest defender, +1). A clean win puts him in their box, a half win at the edge; a loss gives it back.',
    effects: TRACK,
    pool: [{
      id: 'FXE_OVER_TOP', side: 'you', zones: [0, 1, 2], family: 'press', tags: ['run in behind', 'long ball', 'pass'],
      text: 'the ball straight over the top while they are upfield',
      when: function (x, q) {
        var m = mem(q.squad);
        if (!m.wonBack || m.att.n !== 0) return false;
        x._fxeR = best(inLine(q.squad, 2).filter(function (p) { return p !== x.actor; }), 'pace');
        x._fxeS = best(inLine(q.opp, 0), 'pace', true);
        return !!x._fxeR && !!x._fxeS && !!x.actor;
      },
      build: function (x, q) {
        var r = x._fxeR, d = x._fxeS;
        return {
          test: { mine: r, mineAttr: 'pace', theirs: d, theirsAttr: 'pace' },
          bonus: 1, because: 'their players are still upfield', risk: 'high', to: r, pays: 'through',
          table: {
            good: ' and ' + first(r) + ' has the ball in their box.', mixed: ', and ' + first(r) + ' has the ball at the edge of their box.',
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: 'ground', mixed: x.zone >= 2 ? 'nothing' : 'ground', bad: 'break' }, move: { good: 3 - x.zone, mixed: 2 - x.zone }
          },
          does: { good: 'is away from ' + first(d) + ' before they turn', mixed: 'gets to it first but ' + first(d) + ' recovers', bad: 'is caught by {foil}' },
          label: first(x.actor) + ' plays it straight over the top for ' + first(r),
          read: first(r) + ' (Pace ' + r.attr.pace + ') against ' + first(d) + ' (Pace ' + d.attr.pace + '), their slowest defender, while their players are still upfield. Only on the first decision of this attack.'
        };
      }
    }]
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = { loaded: true, mem: mem, moveKind: moveKind, record: record };
})(typeof window !== 'undefined' ? window : globalThis);
