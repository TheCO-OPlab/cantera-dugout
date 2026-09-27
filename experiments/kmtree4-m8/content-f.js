/* CONTENT F (wave 1f of the kmtree3 build-emergence run): BREADTH.
 *
 * The harness found m1 narrow in four ways: only 6 shared states (2 held by
 * the opponent), components that almost never name another class of
 * component (7%), too many flat "+N good stuff" components (40%), and a
 * fifth of the options with a single action tag. This file adds SEVEN
 * SHARED STATES from the idea catalogue, each produced and read in two or
 * more different systems, so a producer written by one wave pays off a
 * reader written by another:
 *
 *   rattled         (theirs)  one of theirs beaten cleanly or fouling; he
 *                             stays rattled until he wins a duel against you
 *   keeper down     (theirs)  their keeper on the ground after a save
 *   scrambling      (theirs)  their defence scrambling after a loose ball
 *   caught upfield  (theirs)  their players going forward when you won it
 *   on his own      (theirs)  one of their defenders with no cover
 *   rhythm          (yours)   your attack has strung clean wins together
 *   banked edge     (yours)   an edge kept for later
 *
 * It does that two ways:
 *   1. CLAUSES on components other waves wrote (clause() below): one short
 *      rule and one sentence added to the component's text. A clause never
 *      changes what the component already did; it only produces or reads a
 *      new state. So a build made before this wave plays as before unless it
 *      holds both a producer and a reader of the same new state.
 *   2. TEN NEW COMPONENTS, most of which name another class: a captain who
 *      hears what other components did, tactics that pay off a role.
 *
 * The rules of the other content files hold: every change goes through an
 * effects-layer helper (named on the card before the pick and in the log
 * when it fires); states and tags, never another wave's option ids; every
 * refund, free decision, continuation and effect that hears other effects
 * has a limit. Plain English, no dashes. Load after content-a/b/e.js.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function O() { return root.KMOptions || require('./options.js'); }
  function CB() { return root.KMContentB || require('./content-b.js'); }
  function CA() { return root.KMContentA || require('./content-a.js'); }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function has(tags, list) { return list.some(function (t) { return (tags || []).indexOf(t) >= 0; }); }
  function best(list, attr) {
    return list.filter(Boolean).slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null;
  }
  var RUNS = ['dribble', 'carry'];
  var TACKLES = ['tackle', 'press', 'interception', 'double team'];
  var BACKWARDS = ['back pass', 'recycle', 'time wasting', 'substitution', 'keeper action', 'clearance'];
  var BEHIND = ['run in behind', 'long ball', 'through ball'];
  var INTO_BOX = ['cut-back', 'pull-back', 'square ball', 'cross', 'low cross', 'layoff'];
  var DEF_THEM = { line: 'def', side: 'them' };

  /* ------------------------------------------------------ memory */
  /* per match, keyed by your squad (hooks see the squad, events the match) */
  var MEM = new WeakMap();
  function mem(squad) {
    var m = MEM.get(squad);
    if (!m) {
      m = { caught: {}, pointed: {}, hard: {}, n: 0, poss: -1, lastCarried: 0, cin: 0 };
      MEM.set(squad, m);
    }
    return m;
  }
  /* the attack goes on after this decision */
  function goesOn(st) { return !!(st.chain && st.chain.next === 'zone'); }
  /* a record of `prefix` (a component's name) with one of `fields` was written for this decision */
  function firedHere(e, prefix, fields, text) {
    var at = e.st.log.length;
    return e.st.fx.log.some(function (l) {
      return l.at === at && String(l.source).indexOf(prefix) === 0 && fields.indexOf(l.field) >= 0 && (!text || String(l.text).indexOf(text) >= 0);
    });
  }
  /* THE MAN LEFT ON HIS OWN when a centre-back (`gone`) is pulled out of
   * his place: the full-back beside him, who has no cover inside him now.
   * Of their wide defenders, one who is up against one of your wingers (a
   * player with that role) comes first; then the nearest to the gap. */
  function besideGap(opp, gone, wingers) {
    var wide = opp.players.filter(function (p) { return p.line === 0 && p !== gone && (p.slot === 0 || p.slot === 4); });
    if (!wide.length) return null;
    var faced = wide.filter(function (d) { return wingers.some(function (w) { return O().markerOf(opp, w, 0) === d; }); });
    var pool = faced.length ? faced : wide, gs = typeof gone.slot === 'number' ? gone.slot : 2;
    return pool.slice().sort(function (a, b) { return Math.abs(a.slot - gs) - Math.abs(b.slot - gs); })[0];
  }

  /* ------------------------------------------------ clauses */
  /* clause(id, effect, sentence): add one rule to a component another wave
   * wrote, and one sentence to its text. The rule is checked the way
   * define() checks one. Effects keep their indices (it is appended), so the
   * component's own limits are untouched. */
  var CLAUSES = [];
  function clause(id, eff, sentence) {
    var d = FX.REG[id];
    if (!d) return false;
    if (eff.hook && !FX.HOOKS[eff.hook]) throw new Error('content-f: unknown hook ' + eff.hook);
    if (eff.on && !FX.EVENTS[eff.on]) throw new Error('content-f: unknown event ' + eff.on);
    if (eff.limit && (FX.DURATIONS.indexOf(eff.limit.per) < 0 || !(eff.limit.n >= 1))) throw new Error('content-f: bad limit on ' + id);
    eff.w1f = true;
    d.effects = (d.effects || []).concat([eff]);
    if (sentence && String(d.text).indexOf(sentence) < 0) d.text = d.text + ' ' + sentence;
    CLAUSES.push({ id: id, name: eff.name, sentence: sentence || '' });
    return true;
  }

  /* shared rules the producers of a state carry (idempotent: with several
   * producers in one build the first does it and the rest find nothing) */
  /* rattled ends when he wins a duel against you: your man lost to him,
   * on your attack or on theirs */
  function unrattle() {
    return { name: 'unrattle', on: 'loss',
      when: function (e) { return !!e.foil && e.hasState('rattled', e.foil); },
      run: function (e) { e.removeState('rattled', e.foil, first(e.foil) + ' won that one and is no longer rattled'); } };
  }
  /* rhythm breaks on a half win or a loss in your attack */
  function breakRhythm(on) {
    return { name: 'break', on: on,
      when: function (e) { return e.side === 'you' && e.hasState('rhythm', 'team'); },
      run: function (e) { e.removeState('rhythm', 'team', 'that was not a clean win: the attack loses its rhythm'); } };
  }
  /* caught upfield: a producer marks the ball it won, and the attack that
   * starts from it begins with their players caught upfield */
  function caughtStart(id) {
    return { name: 'caught', on: 'possession_start',
      when: function (e) { var m = mem(e.st.squad); return e.side === 'you' && !!m.caught[id] && !e.hasState('caught upfield', 'opponent'); },
      run: function (e) {
        var m = mem(e.st.squad), why = m.caught[id];
        Object.keys(m.caught).forEach(function (k) { m.caught[k] = null; });
        e.addState('caught upfield', 'opponent', { duration: 'possession' }, why + ': their players are caught upfield for this attack');
      } };
  }
  function caughtClear() {
    return { name: 'caught', on: 'possession_start', when: function (e) {
      if (e.side === 'them') { var m = mem(e.st.squad); Object.keys(m.caught).forEach(function (k) { m.caught[k] = null; }); }
      return false;
    }, run: function () { } };
  }
  /* your attacks, decision by decision (for "the first pass of the attack") */
  /* idempotent: several components carry it and it counts once a decision.
   * m.cin: how many edges the decision just made carried into it */
  var TRACK = [
    { name: 'track', on: 'possession_start', when: function (e) {
      var m = mem(e.st.squad);
      if (m.poss !== e.st.fx.scope.possession) { m.poss = e.st.fx.scope.possession; m.n = 0; m.lastCarried = 0; m.cin = 0; }
      return false;
    }, run: function () { } },
    { name: 'track', on: 'decision_end', when: function (e) {
      var m = mem(e.st.squad), at = e.st.fx.scope.decision;
      if (m.at === at) return false;
      m.at = at;
      if (e.side === 'you') { m.n++; m.cin = m.lastCarried; m.lastCarried = goesOn(e.st) ? (e.st.chain.carried || []).length : 0; }
      return false;
    }, run: function () { } }
  ];

  /* ================================================== 1. RATTLED */

  clause('WB_CLEAN_TACKLER', { name: 'rattle', on: 'clean_win',
    when: function (e) { return e.side === 'them' && e.byOwner() && has(e.tags, TACKLES) && !!e.foil && !e.hasState('rattled', e.foil); },
    run: function (e) { e.addState('rattled', e.foil, { duration: 'match' }, first(e.owner) + ' took it cleanly off ' + first(e.foil) + ', who is rattled until he wins a duel against you'); } },
    'The man he takes it from cleanly is rattled until he wins a duel against you.');
  clause('WB_CLEAN_TACKLER', unrattle());

  /* the man who fouled him: the event names him (w1f: foul_won's fouler;
   * on a run at two men it is the second man, not the one faced) */
  clause('PF_DRAWS_FOULS', { name: 'rattle', on: 'foul_won',
    when: function (e) { return e.side === 'you' && e.byOwner() && has(e.tags, RUNS) && !!e.fouler && !e.hasState('rattled', e.fouler); },
    run: function (e) { e.addState('rattled', e.fouler, { duration: 'match' }, first(e.fouler) + ' brought ' + first(e.owner) + ' down and is rattled until he wins a duel against you'); } },
    'The man who fouls him is rattled as well as booked, until he wins a duel against you.');
  clause('PF_DRAWS_FOULS', unrattle());

  FX.define({
    id: 'TA_RUN_AT_HIM', name: 'Run at him', kind: 'tactic', system: 'Team tactics (three slots)',
    archetypes: ['B03', 'B06'],
    text: 'When a run with the ball in midfield or their half beats a man cleanly, he is rattled until he wins a duel against you. A run by one of your carriers or wingers (players with those roles) rattles him on a half win too. Your runs with the ball at a rattled man cost 5 less stamina: he backs off.',
    effects: [
      { name: 'rattle', on: 'clean_win',
        when: function (e) { return e.side === 'you' && has(e.tags, RUNS) && typeof e.zone === 'number' && e.zone >= 1 && !!e.foil && e.foil !== e.st.opp.keeper && !e.hasState('rattled', e.foil); },
        run: function (e) { e.addState('rattled', e.foil, { duration: 'match' }, first(e.actor) + ' went straight past ' + first(e.foil) + ', who is rattled until he wins a duel against you'); } },
      { name: 'role', on: 'half_win',
        when: function (e) {
          if (e.side !== 'you' || !has(e.tags, RUNS) || typeof e.zone !== 'number' || e.zone < 1 || !e.foil || e.foil === e.st.opp.keeper || e.hasState('rattled', e.foil)) return false;
          return e.roles('carrier').concat(e.roles('winger')).indexOf(e.actor) >= 0;
        },
        run: function (e) { e.addState('rattled', e.foil, { duration: 'match' }, first(e.actor) + ' keeps running at ' + first(e.foil) + ', who is rattled until he wins a duel against you'); } },
      { name: 'backs off', hook: 'cost',
        when: function (q) { return q.side === 'you' && has(q.tags, RUNS) && !!q.foil && q.hasState('rattled', q.foil); },
        apply: function (q) { q.costBy(-5, first(q.foil) + ' is rattled and backs off: this run costs 5 less stamina'); } },
      unrattle()
    ]
  });

  clause('TA_BOOKED_MAN', { name: 'rattled', hook: 'duel',
    when: function (q) {
      if (!q.foil || q.hasState('booked', q.foil) || !q.hasState('rattled', q.foil)) return false;
      return (q.side === 'you' && has(q.tags, RUNS)) || (q.side === 'them' && has(q.tags, TACKLES));
    },
    apply: function (q) { q.dice(2, first(q.foil) + ' is rattled and hesitates: two dice, keep the higher'); } },
    'A rattled man hesitates the same way: your runs at him, and your tackles on him when they attack, are rolled with two dice, keeping the higher.');

  FX.define({
    id: 'CAP_KEEP_AT_HIM', name: 'Keep at him', kind: 'captain', system: 'Captaincy',
    archetypes: ['B04', 'B10'],
    text: 'When a teammate, a link or a tactic of yours rattles one of theirs, the captain points him out. Once in each attack, a half win against a man he pointed out counts as a clean win, on your attack or theirs, while that man is still rattled.',
    effects: [
      { name: 'point', on: 'state_added', fromEffects: true, limit: { per: 'moment', n: 3 },
        when: function (e) { return e.state === 'rattled' && !!e.target && !!e.target.name && e.hasState('rattled', e.target) && !mem(e.st.squad).pointed[e.target.id]; },
        run: function (e) { mem(e.st.squad).pointed[e.target.id] = 1; e.note('the captain points out ' + first(e.target) + ': keep at him'); } },
      { name: 'tier', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) { return !!q.foil && !!mem(q.squad).pointed[q.foil.id] && q.hasState('rattled', q.foil); },
        apply: function (q) { q.tier('mixed', 'good', 'the captain said keep at ' + first(q.foil) + ': a half win against him counts as a clean win'); } }
    ]
  });

  /* ================================================== 2. KEEPER DOWN */

  clause('WE_SECOND_BALL', { name: 'down', on: 'half_win',
    when: function (e) { return e.side === 'you' && e.has('shot') && goesOn(e.st) && firedHere(e, 'Second ball', ['branch']) && !e.hasState('keeper down', e.st.opp.keeper); },
    run: function (e) { e.addState('keeper down', e.st.opp.keeper, { duration: 'possession' }, first(e.st.opp.keeper) + ' is on the ground after the save, for the rest of the attack'); } },
    'When that happens their keeper is on the ground for the rest of the attack.');

  FX.define({
    id: 'TR_HITS_HARD', name: 'Hits it hard', kind: 'trait', system: 'Footballer traits',
    archetypes: ['B07', 'B12'],
    text: 'Once an attack, when their keeper only saves his hard shot (a half win), he cannot hold it: the ball is loose in their box and falls to your finisher (a player with that role; otherwise to him), and the attack goes on, with one more decision if it was the last. Their keeper is on the ground and their defence is scrambling for the rest of the attack.',
    /* m3: once an attack is the limit alone. w1f kept its own count here
     * because a record that only adds a decision did not use up an effect's
     * limit; the engine now counts it (effects.js GUARD.extraLimit) */
    effects: TRACK.concat([
      { name: 'loose', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('hard shot') && typeof q.zone === 'number'; },
        apply: function (q) {
          var s = q.lines().filter(function (x) { return x.band === 'mixed' && x.effect !== 'goal'; })[0];
          if (!s) return;
          var f = q.roles('finisher').filter(function (p) { return q.onPitch(p); })[0] || q.owner;
          if (s.effect === 'nothing' && typeof s.move !== 'number') {
            q.branch('mixed', { effect: 'ground', move: q.zone >= 3 ? 0 : 3 - q.zone, to: f }, 'the keeper cannot hold it: the ball is loose in their box and falls to ' + first(f));
          } else if (typeof s.move !== 'number') return;
          /* on the attack's last decision the loose ball is one more decision */
          if (q.finishing) q.extraDecision('mixed', 'the ball is loose in their box: the attack gets one more decision');
        } },
      { name: 'down', on: 'half_win',
        when: function (e) { return e.side === 'you' && e.byOwner() && e.has('hard shot') && goesOn(e.st) && !e.hasState('keeper down', e.st.opp.keeper); },
        run: function (e) { e.addState('keeper down', e.st.opp.keeper, { duration: 'possession' }, first(e.st.opp.keeper) + ' is on the ground after the save, for the rest of the attack'); } },
      { name: 'scramble', on: 'half_win',
        when: function (e) { return e.side === 'you' && e.byOwner() && e.has('hard shot') && goesOn(e.st) && !e.hasState('scrambling', DEF_THEM); },
        run: function (e) { e.addState('scrambling', DEF_THEM, { duration: 'possession' }, 'their defence is scrambling for the loose ball, for the rest of the attack'); } }
    ])
  });

  clause('WE_FIRST_TO_IT', { name: 'down', hook: 'duel',
    when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && q.hasState('keeper down', q.opp.keeper); },
    apply: function (q) { q.threshold(3, 'their keeper is on the ground: a clean win on his shot needs 3'); } },
    'While their keeper is on the ground, his shot needs only 3 for a clean win.');

  clause('TR_COOL_HEAD', { name: 'down', hook: 'duel', limit: { per: 'possession', n: 1 },
    when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && !q.hasState('unmarked', q.owner) && q.hasState('keeper down', q.opp.keeper); },
    apply: function (q) { q.threshold(3, 'their keeper is on the ground and ' + first(q.owner) + ' picks his spot: a clean win needs 3'); } },
    'When their keeper is on the ground he picks his spot: a clean win on his shot needs 3 (once an attack).');

  FX.define({
    id: 'TA_FOLLOW_IN', name: 'Follow it in', kind: 'tactic', system: 'Team tactics (three slots)',
    archetypes: ['B12', 'B07'],
    text: 'While their keeper is on the ground, your finishers (players with that role) are +2 on their shots, and a cut-back, pull-back, low cross or ball across the goal goes to your finisher, wherever the menu would have sent it.',
    effects: [
      { name: 'shot', hook: 'stat',
        when: function (q) { return q.side === 'you' && q.has('shot') && !!q.actor && q.roles('finisher').indexOf(q.actor) >= 0 && q.hasState('keeper down', q.opp.keeper); },
        apply: function (q) { q.stat(2, 'their keeper is on the ground and ' + first(q.actor) + ' followed it in'); } },
      { name: 'to', hook: 'option',
        when: function (q) {
          if (q.side !== 'you' || !q.to || !has(q.tags, ['cut-back', 'pull-back', 'low cross', 'square ball']) || !q.hasState('keeper down', q.opp.keeper)) return false;
          var f = q.roles('finisher').filter(function (p) { return q.onPitch(p) && p !== q.actor; })[0];
          return !!f && f !== q.to;
        },
        apply: function (q) {
          var f = q.roles('finisher').filter(function (p) { return q.onPitch(p) && p !== q.actor; })[0];
          q.setRecipient(f, 'their keeper is on the ground: the ball goes to ' + first(f) + ', who followed it in');
        } }
    ]
  });

  /* ================================================== 3. SCRAMBLING */

  clause('WE_BROKEN', { name: 'scramble', on: 'half_win',
    when: function (e) { return e.side === 'you' && goesOn(e.st) && firedHere(e, 'Broken play', ['branch']) && !e.hasState('scrambling', DEF_THEM); },
    run: function (e) { e.addState('scrambling', DEF_THEM, { duration: 'possession' }, 'the ball broke loose: their defence is scrambling for the rest of the attack'); } },
    'When it breaks loose their defence is scrambling for the rest of the attack.');

  clause('TR_TARGET_MAN', { name: 'scramble', on: 'half_win',
    when: function (e) { return e.side === 'you' && e.byOwner() && e.has('header') && goesOn(e.st) && firedHere(e, 'Target man', ['branch']) && !e.hasState('scrambling', DEF_THEM); },
    run: function (e) { e.addState('scrambling', DEF_THEM, { duration: 'possession' }, 'he knocked it down: their defence is scrambling for the rest of the attack'); } },
    'His knock-down leaves their defence scrambling for the rest of the attack.');

  clause('SP_ROUTINES', { name: 'scramble', on: 'clean_win',
    when: function (e) { return e.side === 'you' && e.id === 'FXB_FLICK' && goesOn(e.st) && !e.hasState('scrambling', DEF_THEM); },
    run: function (e) { e.addState('scrambling', DEF_THEM, { duration: 'possession' }, 'the flick-on beat the near post: their defence is scrambling for the rest of the attack'); } },
    'A near-post flick that comes off leaves their defence scrambling for the rest of the attack.');

  clause('WE_BEFORE_SET', { name: 'scramble', hook: 'duel',
    when: function (q) { return q.side === 'you' && q.zone >= 2 && has(q.tags, ['cross', 'low cross', 'cut-back', 'pull-back', 'square ball', 'through ball']) && q.hasState('scrambling', DEF_THEM); },
    apply: function (q) { q.threshold(3, 'their defence is scrambling, so it is not set: a clean win needs 3'); } },
    'While their defence is scrambling (a loose ball, a knock-down, a flick-on) it is not set either: the same 3 for a clean win, on any decision.');

  FX.define({
    id: 'RO_POACHER', name: 'Poacher', kind: 'trait', system: 'Roles',
    archetypes: ['B12', 'B02'],
    text: 'While their defence is scrambling, a cut-back, pull-back, cross, low cross, layoff or ball across the goal in their half goes to him, wherever the menu would have sent it, and once an attack his shot that would be lost is only blocked (a loss counts as a half win).',
    effects: [
      { name: 'to', hook: 'option',
        when: function (q) { return q.side === 'you' && q.zone >= 2 && !!q.to && q.to !== q.owner && q.actor !== q.owner && q.onPitch(q.owner) && has(q.tags, INTO_BOX) && !q.has('shot') && q.hasState('scrambling', DEF_THEM); },
        apply: function (q) { q.setRecipient(q.owner, 'their defence is scrambling and ' + first(q.owner) + ' is first to it'); } },
      { name: 'block', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && q.hasState('scrambling', DEF_THEM); },
        apply: function (q) { q.tier('bad', 'mixed', 'in the scramble his shot is only blocked: a loss counts as a half win'); } }
    ]
  });

  /* ================================================== 4. CAUGHT UPFIELD */

  clause('WB_GONE', { name: 'mark', on: 'recovery',
    when: function (e) { return e.band === 'good'; },
    run: function (e) { mem(e.st.squad).caught.WB_GONE = 'you won it back cleanly while they were going forward'; } },
    'Their players are also caught upfield for the whole of that attack.');
  clause('WB_GONE', caughtStart('WB_GONE'));
  clause('WB_GONE', caughtClear());

  clause('WE_INVITE', { name: 'mark', on: 'clean_win',
    when: function (e) { return e.side === 'them' && e.id === 'FXE_INVITE'; },
    run: function (e) { mem(e.st.squad).caught.WE_INVITE = first(e.owner) + ' stole the pass their runner was waiting for'; } },
    'When he steals it, their players are caught upfield for the attack that starts.');
  clause('WE_INVITE', caughtStart('WE_INVITE'));
  clause('WE_INVITE', caughtClear());

  clause('WB_COUNTERPRESS', { name: 'mark', on: 'clean_win',
    when: function (e) { return e.side === 'them' && e.id === 'FXB_COUNTERPRESS'; },
    run: function (e) { mem(e.st.squad).caught.WB_COUNTERPRESS = 'you won it straight back before they turned'; } },
    'A clean win leaves their players caught upfield for the attack that starts.');
  clause('WB_COUNTERPRESS', caughtStart('WB_COUNTERPRESS'));
  clause('WB_COUNTERPRESS', caughtClear());

  clause('WE_HOLD_LINE', { name: 'mark', on: 'decision_end',
    when: function (e) { return e.side === 'them' && e.id === 'FXE_STEP_UP' && e.band !== 'bad'; },
    run: function (e) { mem(e.st.squad).caught.WE_HOLD_LINE = 'their man was left offside'; } },
    'When it works their players are caught upfield for the attack that starts.');
  clause('WE_HOLD_LINE', caughtStart('WE_HOLD_LINE'));
  clause('WE_HOLD_LINE', caughtClear());

  clause('WE_OVER_THE_TOP', { name: 'caught', hook: 'duel',
    when: function (q) { return q.side === 'you' && has(q.tags, BEHIND) && q.hasState('caught upfield', 'opponent'); },
    apply: function (q) { q.threshold(3, 'their players are caught upfield: a clean win on a ball in behind needs 3'); } },
    'While their players are caught upfield, any ball in behind them needs only 3 for a clean win.');

  FX.define({
    id: 'RO_OUTLET', name: 'Outlet', kind: 'trait', system: 'Roles',
    archetypes: ['B04', 'B05'],
    text: 'While their players are caught upfield, the first pass of your attack goes to him, wherever the menu would have sent it (the card names him), and it does not use up one of the attack\'s decisions.',
    effects: TRACK.concat([
      { name: 'to', hook: 'option',
        when: function (q) { return q.side === 'you' && mem(q.squad).n === 0 && !!q.to && q.to !== q.owner && q.actor !== q.owner && q.onPitch(q.owner) && q.has('pass') && !has(q.tags, BACKWARDS) && q.hasState('caught upfield', 'opponent'); },
        apply: function (q) { q.setRecipient(q.owner, 'their players are caught upfield and ' + first(q.owner) + ' is the outlet'); } },
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && mem(q.squad).n === 0 && q.to === q.owner && q.actor !== q.owner && q.has('pass') && !has(q.tags, BACKWARDS) && q.hasState('caught upfield', 'opponent'); },
        apply: function (q) { q.freeDecision('the outlet ball goes before they get back: it does not use up a decision'); } }
    ])
  });

  /* ================================================== 5. ON HIS OWN */

  clause('WE_DECOY', { name: 'alone', on: 'possession_start',
    when: function (e) { return e.side === 'you' && e.onPitch(e.owner) && e.hasState('marked', e.owner); },
    run: function (e) {
      var follow = O().markerOf(e.st.opp, e.owner, 0);
      var man = follow ? besideGap(e.st.opp, follow, e.roles('winger')) : null;
      if (!man || e.hasState('on his own', man)) return;
      e.addState('on his own', man, { duration: 'possession' }, first(follow) + ' goes with the decoy, so ' + first(man) + ' has no cover inside him: he is on his own this attack');
    } },
    'The full-back beside the centre-back who follows him (the one on your winger, a player with that role, if there is one) has no cover and is on his own for that attack.');

  clause('TR_DRAG', { name: 'alone', on: 'decision_end',
    when: function (e) { return e.side === 'you' && goesOn(e.st) && firedHere(e, 'Drops deep', ['state']); },
    run: function (e) {
      var follow = O().markerOf(e.st.opp, e.owner, 0);
      var man = follow ? besideGap(e.st.opp, follow, e.roles('winger')) : null;
      if (!man || e.hasState('on his own', man)) return;
      e.addState('on his own', man, { duration: 'possession' }, first(follow) + ' went with ' + first(e.owner) + ', so ' + first(man) + ' has no cover inside him: he is on his own for the rest of the attack');
    } },
    'The full-back beside the centre-back who went with him (the one on your winger, a player with that role, if there is one) is then on his own for the rest of the attack.');

  clause('LK_WALL_PASS', { name: 'alone', on: 'clean_win',
    when: function (e) {
      /* the layoff Understanding pays: to one of the pair, from the other, who is a target man */
      if (e.side !== 'you' || !e.pair || !e.has('layoff') || !e.to || e.pair.indexOf(e.to) < 0 || e.to === e.actor || !goesOn(e.st)) return false;
      var other = e.pair[0] === e.to ? e.pair[1] : e.pair[0];
      return (other.roles || []).indexOf('target man') >= 0;
    },
    run: function (e) {
      var man = O().markerOf(e.st.opp, e.to, 0);
      if (!man || e.hasState('on his own', man)) return;
      e.addState('on his own', man, { duration: 'possession' }, first(e.to) + ' ran off ' + first(man) + ', who is on his own for the rest of the attack');
    } },
    'A clean layoff leaves the man marking the one who gets it on his own for the rest of the attack.');

  clause('RO_INSIDE_FORWARD', { name: 'alone', hook: 'duel',
    when: function (q) { return q.side === 'you' && q.byOwner() && has(q.tags, RUNS) && !!q.foil && q.hasState('on his own', q.foil); },
    apply: function (q) { q.threshold(3, first(q.foil) + ' is on his own: a clean win on this run needs 3'); } },
    'Against a man on his own (no cover beside him) a clean win on his run needs only 3.');

  FX.define({
    id: 'TA_ISOLATE', name: 'Isolate him', kind: 'tactic', system: 'Team tactics (three slots)',
    archetypes: ['B09', 'B01'],
    text: 'When one of their men is on his own, your wingers, carriers and finishers (players with those roles) who run at him roll two dice and keep the higher. A pass to one of them past a man on his own is +1.',
    effects: [
      { name: 'dice', hook: 'duel',
        when: function (q) {
          if (q.side !== 'you' || !q.actor || !q.foil || !has(q.tags, RUNS) || !q.hasState('on his own', q.foil)) return false;
          return q.roles('winger').concat(q.roles('carrier'), q.roles('finisher')).indexOf(q.actor) >= 0;
        },
        apply: function (q) { q.dice(2, first(q.foil) + ' is on his own against ' + first(q.actor) + ': two dice, keep the higher'); } },
      { name: 'pass', hook: 'stat',
        when: function (q) {
          if (q.side !== 'you' || !q.to || q.to === q.actor || !q.foil || !q.has('pass') || has(q.tags, BACKWARDS) || !q.hasState('on his own', q.foil)) return false;
          return q.roles('winger').concat(q.roles('carrier'), q.roles('finisher')).indexOf(q.to) >= 0;
        },
        apply: function (q) { q.stat(1, first(q.foil) + ' is on his own and cannot cover ' + first(q.to)); } }
    ]
  });

  /* ================================================== 6. RHYTHM */

  clause('SE_RHYTHM', { name: 'rhythm', on: 'decision_end',
    when: function (e) { return e.side === 'you' && CB().mem(e.st.squad).streak >= 2 && goesOn(e.st) && !e.hasState('rhythm', 'team'); },
    run: function (e) { e.addState('rhythm', 'team', { duration: 'possession' }, 'two clean wins in a row: the attack has rhythm until a half win or a loss'); } },
    'The attack also has rhythm until a half win or a loss.');
  clause('SE_RHYTHM', breakRhythm('half_win'));
  clause('SE_RHYTHM', breakRhythm('loss'));

  clause('LK_KNOWS_RUN', { name: 'rhythm', on: 'clean_win',
    when: function (e) {
      if (e.side !== 'you' || !e.byPair() || !e.has('pass') || !goesOn(e.st) || e.hasState('rhythm', 'team')) return false;
      return e.to === (e.actor === e.pair[0] ? e.pair[1] : e.pair[0]);
    },
    run: function (e) { e.addState('rhythm', 'team', { duration: 'possession' }, first(e.pair[0]) + ' and ' + first(e.pair[1]) + ' found each other cleanly: the attack has rhythm until a half win or a loss'); } },
    'A clean pass between them gives the attack rhythm until a half win or a loss.');
  clause('LK_KNOWS_RUN', breakRhythm('half_win'));
  clause('LK_KNOWS_RUN', breakRhythm('loss'));

  clause('RO_SETS_PACE', { name: 'rhythm', on: 'clean_win',
    when: function (e) { return e.side === 'you' && e.byOwner() && e.has('short pass') && !e.has('back pass') && goesOn(e.st) && !e.hasState('rhythm', 'team'); },
    run: function (e) { e.addState('rhythm', 'team', { duration: 'possession' }, first(e.owner) + ' sets the pace: the attack has rhythm until a half win or a loss'); } },
    'A clean short pass of his gives the attack rhythm until a half win or a loss.');
  clause('RO_SETS_PACE', breakRhythm('half_win'));
  clause('RO_SETS_PACE', breakRhythm('loss'));

  clause('GR_TEMPO', { name: 'rhythm', on: 'possession_end',
    when: function (e) { var m = CB().mem(e.st.squad); return e.side === 'you' && m.box && m.tempo < 2 && e.hasState('rhythm', 'team'); },
    run: function (e) { var m = CB().mem(e.st.squad); m.tempo = Math.min(2, m.tempo + 1); e.note('it reached their box with rhythm: one more tempo, your tempo is ' + m.tempo + ' of 2'); } },
    'An attack that reaches their box with rhythm adds one more tempo (the cap of 2 holds).');

  FX.define({
    id: 'CAP_CONDUCTOR', name: 'Conducts', kind: 'captain', system: 'Captaincy',
    archetypes: ['B08', 'B10'],
    text: 'When a tactic, link or teammate of yours gives the attack rhythm, the captain calms everyone down: his line gets 6 stamina back (once in each moment). While the attack has rhythm, a pass by him or to him cannot be lost: a loss counts as a half win (once an attack).',
    effects: [
      { name: 'calm', on: 'state_added', fromEffects: true, limit: { per: 'moment', n: 1 },
        when: function (e) { return e.state === 'rhythm' && e.onPitch(e.owner) && typeof e.owner.line === 'number'; },
        run: function (e) { e.refund(['def', 'mid', 'att'][e.owner.line], 6, 'the captain takes charge of the rhythm and calms everyone down'); } },
      { name: 'safe', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.has('pass') && !has(q.tags, BACKWARDS) && (q.byOwner() || q.to === q.owner) && q.hasState('rhythm', 'team'); },
        apply: function (q) { q.tier('bad', 'mixed', 'the attack has rhythm and the captain is on it: a loss counts as a half win'); } }
    ]
  });

  /* ================================================== 7. BANKED EDGE */

  FX.define({
    id: 'EC_BANK_EDGE', name: 'Keep it for later', kind: 'tactic', system: 'Resource economy',
    archetypes: ['B08', 'B10'],
    text: 'Once in each moment, when you play the ball back (a back pass or a recycle) while carrying an edge from the decision before, your team banks it for later (one at most). Your captain looks after it: while he is on the pitch it lasts the match; without him it is lost when the moment ends.',
    effects: TRACK.concat([
      { name: 'bank', on: 'decision_end', limit: { per: 'moment', n: 1 },
        when: function (e) { var m = mem(e.st.squad); return e.side === 'you' && has(e.tags, ['back pass', 'recycle']) && e.band !== 'bad' && m.cin > 0 && !e.hasState('banked edge', 'team'); },
        run: function (e) { e.addState('banked edge', 'team', { duration: 'match' }, 'the ball goes back and your team keeps the edge it had for later: an edge is banked'); } },
      { name: 'lost', on: 'moment_end',
        when: function (e) { var c = e.st.squad.captain; return (!c || !e.onPitch(c)) && e.hasState('banked edge', 'team'); },
        run: function (e) { e.removeState('banked edge', 'team', 'your captain is not on the pitch: the banked edge is lost'); } }
    ])
  });

  clause('AD_DECOY_ROUTE', { name: 'bank', on: 'possession_end',
    when: function (e) { return e.side === 'you' && CA().mem(e.st).yourDone === 1 && !e.hasState('banked edge', 'team'); },
    run: function (e) { e.addState('banked edge', 'team', { duration: 'match' }, 'the show attack is over and your team keeps what it learned: an edge is banked'); } },
    'When the show attack ends, your team banks an edge for later.');

  /* a reader spends the banked edge when the record it put on the chosen card fired */
  function spend(prefix, fields, text) {
    return { name: 'spend', on: 'decision_end',
      when: function (e) { return e.side === 'you' && e.hasState('banked edge', 'team') && firedHere(e, prefix, fields, text); },
      run: function (e) { e.removeState('banked edge', 'team', 'the banked edge is spent'); } };
  }
  clause('TR_DEAD_BALL', { name: 'banked', hook: 'duel',
    when: function (q) { return q.side === 'you' && q.byOwner() && q.has('free kick') && q.has('shot') && q.hasState('banked edge', 'team'); },
    apply: function (q) { q.dice(2, 'he spends the banked edge: two dice, keep the higher'); } },
    'His free kick at goal spends a banked edge: he rolls two dice and keeps the higher.');
  clause('TR_DEAD_BALL', spend('Dead-ball specialist', ['dice'], 'banked edge'));

  clause('EX_STACK_EDGES', { name: 'banked', hook: 'stat',
    when: function (q) { return q.side === 'you' && q.has('shot') && q.zone === 3 && q.hasState('banked edge', 'team'); },
    apply: function (q) { q.stat(2, 'the banked edge counts as well'); } },
    'A banked edge counts on top on a shot in their box (+2), and is spent.');
  clause('EX_STACK_EDGES', spend('Two edges at once', ['stat'], 'banked edge'));

  FX.define({
    id: 'CAP_BIG_ONE', name: 'Saves it for the big one', kind: 'captain', system: 'Captaincy',
    archetypes: ['B10', 'B09'],
    text: 'The captain decides when the banked edge is used: on your finisher\'s shot in their box (a player with that role). Then a clean win needs only 3, and the edge is spent.',
    effects: [
      { name: 'big', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.has('shot') && q.zone === 3 && !!q.actor && q.roles('finisher').indexOf(q.actor) >= 0 && q.hasState('banked edge', 'team'); },
        apply: function (q) { q.threshold(3, 'the captain saved the banked edge for this: a clean win needs 3'); } },
      spend('Saves it for the big one', ['threshold'], 'banked edge')
    ]
  });

  /* ================================================== 8. NAMING ANOTHER CLASS */
  /* a link that pays off what another component did */
  clause('LK_FLANK_PAIR', { name: 'hear', on: 'state_added', fromEffects: true, limit: { per: 'possession', n: 1 },
    when: function (e) {
      if (e.state !== 'unmarked' || !e.target || !e.pair || e.pair.indexOf(e.target) < 0) return false;
      return e.st.fx.side === 'you' && goesOn(e.st) && e.onPitch(e.pair[0]) && e.onPitch(e.pair[1]);
    },
    run: function (e) {
      var other = e.target === e.pair[0] ? e.pair[1] : e.pair[0];
      e.addEdge({ n: 2, man: other, tags: ['cross', 'low cross', 'cut-back', 'overlap', 'pass'], why: first(other) + ' goes with his partner' }, 'a component left ' + first(e.target) + ' unmarked and ' + first(other) + ' goes with him');
    } },
    'When another component of yours leaves one of the two unmarked, the other goes with him: +2 to his next cross, cut-back, overlap or pass (once an attack).');

  /* the tag audit: the one option another wave created with a single tag.
   * Stepping up to leave a man offside is marking him as much as a trap. */
  (function () { var d = FX.REG.WE_HOLD_LINE, p = d && (d.pool || []).filter(function (x) { return x.id === 'FXE_STEP_UP'; })[0]; if (p && p.tags.indexOf('marking') < 0) p.tags = p.tags.concat(['marking']); })();

  var IDS = ['TA_RUN_AT_HIM', 'CAP_KEEP_AT_HIM', 'TR_HITS_HARD', 'TA_FOLLOW_IN', 'RO_POACHER', 'RO_OUTLET', 'TA_ISOLATE',
    'CAP_CONDUCTOR', 'EC_BANK_EDGE', 'CAP_BIG_ONE'];
  var NEW_STATES = ['rattled', 'keeper down', 'scrambling', 'caught upfield', 'on his own', 'rhythm', 'banked edge'];
  var API = { IDS: IDS, NEW_STATES: NEW_STATES, CLAUSES: CLAUSES, mem: mem, DEF_THEM: DEF_THEM };
  root.KMContentF = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
