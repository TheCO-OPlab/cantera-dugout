/* OPPONENT EFFECTS (kmtree5, Helper E, 2026-09-29): the effects on the team you play against in
 * Eduardo's doc (SPEC-eduardo-2026-09-29.txt, "Opponent effects"), all but Trash town (parked with
 * Birthplace). Three proposed in his feedback and five from Slay the Spire's elites are the ELITES; four
 * from Balatro's bosses are the BOSSES (his ruling 10). The cup (Helper R) picks them per round and passes
 * them as oppBuild.effects; each is shown before kickoff with its sentence and how to play around it
 * (list()). His numbers exactly.
 *
 * Each is a component of kind 'tactic' marked opEffect, owned by their team: "Fortress (their team)" on
 * the card and in the log. What they need from the engine: their parts on your cards (theirStat), your
 * parts (stat), a penalty in your box (q.penalty, options.js), a greyed card (q.grey), a card that clogs
 * one of the three places (pool clog), switching your traits off (effects.js gates), their taking the
 * ball (match.js forceTheirs). The page reads KMOpponents.counters(st).
 *
 * Plain English, no dashes. Browser: window.KMOpponents (after archetypes.js). Node: require('./opponents.js').
 * OPP_BREAK (env) breaks one thing for archcheck.js --prove.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  var R = root.KMResolve || require('./resolve.js');
  var AR = root.KMArchetypes || require('./archetypes.js');
  function MX() { return root.KMMatch || require('./match.js'); }
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.OPP_BREAK) || '';
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function ops(st) { return st && st.oparch ? st.oparch : null; }
  function note(fx, source, text) { return fx.write(source, text, 'event', 'counter'); }
  function yours(inst) { return (inst.side || 'you') === 'you'; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  function yourAttack(q) { return q.side === 'you' && typeof q.zone === 'number'; }
  function inBox(q) { return !!(q.sit && q.sit.id === 'zone_yourbox'); }
  function theirs(q) { return q.theirVal !== null && !!q.foil; }

  var LIST = [];
  function op(def) {
    def.kind = 'tactic'; def.opEffect = true;
    FX.define(def);
    LIST.push(def.id);
  }

  /* ============================================================ ELITES: proposed in his feedback */
  var PEN_DIVE = 'OP_C_PEN_DIVE', PEN_WAIT = 'OP_C_PEN_WAIT';
  op({
    id: 'OP_DIVER', name: 'Diver', tier: 'elite',
    text: 'In your box, a duel you only half win against one of their forwards is given as a penalty to them.',
    playAround: 'Only clean wins are safe in your box, so stop them earlier, or win cleanly there.',
    effects: [
      { hook: 'outcome', when: function (q) { return q.side === 'them' && inBox(q) && q.via !== 'penalty' && !!q.foil && q.foil.line === 2 && BREAK !== 'diver'; },
        apply: function (q) { q.penalty('mixed', 'a half win against ' + first(q.foil) + ' in your box is a penalty to them'); } },
      /* the penalty is the only thing on the menu */
      { hook: 'option', when: function (q) { return q.side === 'them' && q.via === 'penalty' && q.id !== PEN_DIVE && q.id !== PEN_WAIT; },
        apply: function (q) { q.remove('a penalty: only your keeper can stop it'); } },
      /* (review item 9) no number of its own: the penalty is your keeper's duel with the taker, with the engine's own
       * parts only (OPP_BREAK=penplus puts back the +3 it had) */
      { hook: 'stat', when: function (q) { return BREAK === 'penplus' && q.side === 'them' && q.via === 'penalty' && theirs(q); },
        apply: function (q) { q.theirStat(3, 'a penalty is taken from 11 metres'); } }
    ],
    pool: [{
      id: PEN_DIVE, side: 'them', box: true, family: 'stop', tags: ['keeper action', 'save'],
      text: 'your keeper dives for the penalty',
      when: function (x) { return x.via === 'penalty' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'reflexes', theirs: x.foil, theirsAttr: 'finishing' },
          risk: 'even', pays: 'boxstop',
          does: { good: 'dives the right way and saves it', mixed: 'dives the right way, and the ball goes wide', bad: 'dives the wrong way' },
          label: first(k) + ' picks a side and dives',
          read: first(k) + ' (Reflexes ' + Math.round(k.attr.reflexes) + ') against ' + first(x.foil) + ' (Finishing ' + Math.round(x.foil.attr.finishing) + ') from the penalty spot.'
        };
      }
    }, {
      id: PEN_WAIT, side: 'them', box: true, family: 'stop', tags: ['keeper action', 'save'],
      text: 'your keeper waits for the penalty',
      when: function (x) { return x.via === 'penalty' && !!x.squad.keeper && !!x.foil; },
      build: function (x) {
        var k = x.squad.keeper;
        return {
          test: { mine: k, mineAttr: 'intelligence', theirs: x.foil, theirsAttr: 'technique' },
          risk: 'even', pays: 'boxstop',
          does: { good: 'stays on his feet and saves it', mixed: 'stays on his feet, and the ball goes wide', bad: 'stays on his feet, and it goes past him' },
          label: first(k) + ' stays on his feet until ' + first(x.foil) + ' shoots',
          read: first(k) + ' (Intelligence ' + Math.round(k.attr.intelligence) + ') against ' + first(x.foil) + ' (Technique ' + Math.round(x.foil.attr.technique) + ') from the penalty spot.'
        };
      }
    }]
  });

  op({
    id: 'OP_STRONG_BELIEF', name: 'Strong belief', tier: 'elite',
    text: 'They start the match at -2 in every duel and get +1 at the start of each moment from the second one: +3 by the last moment.',
    playAround: 'Score early, before their belief builds up.',
    effects: [
      { hook: 'stat', when: function (q) { return theirs(q) && q.st.n - 2 !== 0; },
        apply: function (q) { var n = BREAK === 'strong' ? -2 : q.st.n - 2; q.theirStat(n, 'moment ' + (q.st.n + 1) + ' of 6: they are ' + (n > 0 ? '+' : '') + n + ' in every duel'); } }
    ]
  });

  op({
    id: 'OP_CHECKED_OUT', name: 'Checked out, then all in', tier: 'elite',
    text: 'They are -2 in every duel until half-time, then +4 for the rest of the match.',
    playAround: 'Score heavily in the first half, and protect the lead after it.',
    effects: [
      { hook: 'stat', when: function (q) { return theirs(q); },
        apply: function (q) { var h = q.st.n < 3 || BREAK === 'checked'; q.theirStat(h ? -2 : 4, h ? 'they are -2 in every duel until half-time (first half)' : 'they are +4 in every duel after half-time (second half)'); } }
    ]
  });

  /* ============================================================ ELITES: Slay the Spire */
  op({
    id: 'OP_HATES_TIME_WASTING', name: 'Hates time-wasting', tier: 'elite',
    text: 'Each duel of your attack after which your team keeps the ball without moving forward (in the same zone, or further back) gives them +1 in every duel for the rest of the match.',
    playAround: 'Play direct, and take risks.',
    effects: [
      { on: 'decision_end', when: function (e) {
        if (e.side !== 'you' || !e.duel || e.zone === null || e.effect === 'break' || e.effect === 'goal') return false;
        return (typeof e.move === 'number' && e.move <= 0) || (e.effect === 'nothing' && (e.pays === 'keep' || e.pays === 'clock'));
      },
        run: function (e) { var O = ops(e.st); if (!O) return; O.htw += BREAK === 'htw' ? 0 : 1; note(e.st.fx, e.inst.name, 'your team held the ball without going forward: they get +1 in every duel (+' + O.htw + ' now)'); } },
      { hook: 'stat', when: function (q) { var O = ops(q.st); return !!O && O.htw > 0 && theirs(q); },
        apply: function (q) { var O = ops(q.st); q.theirStat(O.htw, 'your team has kept the ball without going forward ' + O.htw + ' time' + (O.htw === 1 ? '' : 's') + ' (+' + O.htw + ' to them)'); } }
    ]
  });

  op({
    id: 'OP_SLEEPING_GIANT', name: 'Sleeping giant', tier: 'elite',
    text: 'Their best defender is -3 in the first 3 moments. A duel with him ends that at once. When it ends (after a duel with him, or at the start of the fourth moment even if you never had one), your player is -1 in every duel of your attacks for the rest of the match.',
    playAround: 'Score while he is asleep, or make sure he doesn\'t wake up.',
    effects: [
      { hook: 'stat', when: function (q) { var O = ops(q.st); return !!O && !O.awake && q.st.n < 3 && q.foil === O.giant && theirs(q); },
        apply: function (q) { q.theirStat(-3, first(q.foil) + ' is -3 until you have a duel with him (first 3 moments)'); } },
      { hook: 'stat', when: function (q) { var O = ops(q.st); return !!O && O.awake && yourAttack(q) && q.mineVal !== null && BREAK !== 'giant'; },
        apply: function (q) { var O = ops(q.st); q.stat(-1, 'your player is -1 in your attacks now that ' + first(O.giant) + '\'s -3 has ended'); } },
      { on: 'clean_win', when: function (e) { var O = ops(e.st); return !!O && !O.awake && e.foil === O.giant; }, run: function (e) { wake(e, 'you had a duel with him'); } },
      { on: 'half_win', when: function (e) { var O = ops(e.st); return !!O && !O.awake && e.foil === O.giant; }, run: function (e) { wake(e, 'you had a duel with him'); } },
      { on: 'loss', when: function (e) { var O = ops(e.st); return !!O && !O.awake && e.foil === O.giant; }, run: function (e) { wake(e, 'you had a duel with him'); } },
      { on: 'moment_start', when: function (e) { var O = ops(e.st); return !!O && !O.awake && e.st.n >= 3; }, run: function (e) { wake(e, 'the fourth moment starts'); } }
    ]
  });
  function wake(e, why) { var O = ops(e.st); O.awake = true; note(e.st.fx, e.inst.name, first(O.giant) + '\'s -3 ends (' + why + '): from now on your player is -1 in every duel of your attacks'); }

  op({
    id: 'OP_SHELL_UP', name: 'Shell up', tier: 'elite',
    text: 'After your players win 3 duels cleanly, in your next attack they keep every player behind the ball: each duel you lose in their box in that attack costs that line of yours 10 stamina.',
    playAround: 'Slow down after your third clean win, or accept the stamina cost.',
    effects: [
      { on: 'clean_win', run: function (e) {
        var O = ops(e.st), fx = e.st.fx;
        if (!O) return;
        O.shellWins++;
        if (O.shellWins >= 3) {
          O.shellWins = 0;
          /* (review item 3) it falls on your next attack, not on the next moment whoever attacks */
          if (BREAK === 'shellnext') O.shellAt = fx.scope.moment + 1; else O.shellPending = true;
          note(fx, e.inst.name, 'you won 3 duels cleanly: in your next attack they keep every player behind the ball (a duel you lose in their box costs 10 stamina)');
        } else note(fx, e.inst.name, 'a clean win (' + O.shellWins + ' of 3)');
      } },
      { on: 'loss', when: function (e) { var O = ops(e.st); return !!O && O.shellAt === e.st.fx.scope.moment && e.side === 'you' && e.zone === 3 && !!e.actor && typeof e.actor.line === 'number'; },
        run: function (e) { var ln = ['def', 'mid', 'att'][e.actor.line]; e.tire(ln, BREAK === 'shell' ? 0 : 10, 'you lost a duel in their box while they keep every player behind the ball'); } },
      { on: 'possession_start', when: function (e) { var O = ops(e.st); return !!O && O.shellPending && e.side === 'you'; },
        run: function (e) { var O = ops(e.st); O.shellPending = false; O.shellAt = e.st.fx.scope.moment;
          note(e.st.fx, e.inst.name, 'this attack: they keep every player behind the ball (a duel you lose in their box costs 10 stamina)'); } }
    ]
  });

  op({
    id: 'OP_GAME_MANAGER', name: 'Game manager', tier: 'elite',
    text: 'Every 6th decision you make in the match, they take the ball and come one zone closer to your goal.',
    playAround: 'Keep your attacks short, and count your decisions.',
    effects: []   /* afterResolve (the extension below): match.js forceTheirs */
  });

  var RATTLE_YOU = 'OP_C_RATTLED', RATTLE_THEM = 'OP_C_RATTLED_D';
  function rattledCard(x, q, theirAttack) {
    var p = x.actor;
    return {
      test: {}, actorMan: p, fixedOdds: { bad: 1 }, sureDuel: 'loss', risk: 'high', pays: theirAttack ? 'tcut' : 'rattled', theirTo: theirAttack ? x.foil : null,
      table: theirAttack ? { good: '.', mixed: '.', bad: '.', effect: { good: 'nothing', mixed: 'nothing', bad: 'break' }, tmove: { bad: 1 } }
        : { good: '.', mixed: '.', bad: '.', effect: { good: 'nothing', mixed: 'nothing', bad: 'break' } },
      fixedText: theirAttack ? first(p) + ' is rattled and lets ' + first(x.foil) + ' go past him. He is no longer rattled.'
        : first(p) + ' is rattled and gives the ball away to them, and their team attacks. He is no longer rattled.',
      checkText: 'No duel: he loses it. Choosing it is the only way to stop him being rattled.',
      label: first(p) + ' is rattled: ' + (theirAttack ? 'he lets his man go past' : 'he gives the ball away') + ', and he is no longer rattled',
      read: 'No duel: ' + first(p) + ' loses it. Choosing this card is the only way to stop him being rattled; until then it takes one of the places on every menu he is in.'
    };
  }
  op({
    id: 'OP_UNDER_YOUR_SKIN', name: 'Gets under your skin', tier: 'elite',
    text: 'At the start of each moment one of your players (chosen at random) is rattled. While he is rattled, a card where he loses the ball takes one of the places on every menu he is in. Choosing that card loses the duel, and he is no longer rattled.',
    playAround: 'Plan attacks that do not need every place on the menu.',
    effects: [
      { on: 'moment_start', run: function (e) {
        var O = ops(e.st), st = e.st, fx = st.fx;
        if (!O || BREAK === 'skin') return;
        var pool = st.squad.players.filter(function (p) { return !O.rattled[p.id]; });
        if (!pool.length) return;
        var r = rng(((st.seed | 0) * 7727 + fx.scope.moment * 131 + 17) >>> 0);
        var p = pool[Math.floor(r() * pool.length)];
        O.rattled[p.id] = true;
        if (st.arch) st.arch.rattled[p.id] = true;
        note(fx, e.inst.name, first(p) + ' is rattled: until he gives the ball away, a card for it takes a place on every menu he is in');
      } },
      { on: 'decision_end', when: function (e) { return e.id === RATTLE_YOU || e.id === RATTLE_THEM; },
        run: function (e) {
          var O = ops(e.st), p = e.actor, st = e.st;
          if (!O || !p) return;
          var orig = st.arch && st.arch.copies[p.id];
          [p, orig].forEach(function (m) { if (m) { delete O.rattled[m.id]; if (st.arch) delete st.arch.rattled[m.id]; } });
          note(st.fx, e.inst.name, first(p) + ' is no longer rattled');
        } }
    ],
    pool: [{
      id: RATTLE_YOU, side: 'you', zones: [0, 1, 2, 3], family: 'hold', tags: ['pass'], clog: true,
      text: 'a rattled player gives the ball away',
      when: function (x, q) { return isRattled(q.st, x.actor) && q.st.squad.players.indexOf(x.actor) >= 0; },
      build: function (x, q) { return rattledCard(x, q, false); }
    }, {
      id: RATTLE_THEM, side: 'them', tzones: [0, 1], family: 'stop', tags: ['tackle'], clog: true,
      text: 'a rattled player lets his man past',
      when: function (x, q) { return isRattled(q.st, x.actor) && q.st.squad.players.indexOf(x.actor) >= 0 && !!x.foil; },
      build: function (x, q) { return rattledCard(x, q, true); }
    }]
  });
  /* your decisions already made in this moment, before the menu being built: a menu the engine builds
   * ahead while a decision is still being resolved (match.js nextLive) counts that decision too */
  function decisionsBefore(q) { var O = ops(q.st); return O ? O.youDecisions + (q.st.fx.inChoose ? 1 : 0) : 99; }
  function isRattled(st, p) { var O = ops(st); if (!O || !p) return false; return !!O.rattled[p.id] || AR.rattled(st, p); }

  /* ============================================================ BOSSES: Balatro */
  op({
    id: 'OP_FORTRESS', name: 'Fortress', tier: 'boss',
    text: 'Their defenders are +2 in every duel for the whole match.',
    playAround: 'Build more bonuses, or find ways forward that avoid duels with their defenders.',
    effects: [
      { hook: 'stat', when: function (q) { return theirs(q) && q.foil.line === 0 && q.st.opp.players.indexOf(q.foil) >= 0; },
        apply: function (q) { q.theirStat(BREAK === 'fortress' ? 0 : 2, 'their defenders are +2 in every duel, and ' + first(q.foil) + ' is a defender'); } }
    ]
  });

  op({
    id: 'OP_NO_QUICK_SHOTS', name: 'No quick shots', tier: 'boss',
    text: 'In each moment you can only shoot, or play a card that can score, from your 4th decision on. Until then those cards are greyed out.',
    playAround: 'Build up before you shoot.',
    effects: [
      { hook: 'option', when: function (q) { return decisionsBefore(q) < 3 && yourAttack(q) && R.canScore('you', q.pays) && BREAK !== 'noquick'; },
        apply: function (q) { q.grey('you can only try to score from your 4th decision of a moment (this is your ' + ['1st', '2nd', '3rd'][decisionsBefore(q)] + ')'); } },
      { on: 'moment_start', quiet: true, run: function (e) { var O = ops(e.st); if (O) O.youDecisions = 0; } },
      { on: 'decision_end', quiet: true, when: function (e) { return e.side === 'you'; }, run: function (e) { var O = ops(e.st); if (O) O.youDecisions++; } }
    ]
  });

  op({
    id: 'OP_SHADOW_MARKER', name: 'Shadow marker', tier: 'boss',
    text: 'At the start of each moment, one of your player traits (chosen at random) is switched off for that moment.',
    playAround: 'Do not depend on a single trait.',
    effects: [
      { on: 'moment_start', run: function (e) {
        var O = ops(e.st), st = e.st, fx = st.fx;
        if (!O) return;
        O.shadowOff = null;
        var cand = fx.inst.filter(function (x) { return yours(x) && x.def && x.def.kind === 'trait' && !x.def.hidden && fx.active(x); });
        if (!cand.length || BREAK === 'shadowmarker') { note(fx, e.inst.name, 'you have no player trait for them to switch off'); return; }
        var r = rng(((st.seed | 0) * 6151 + fx.scope.moment * 97 + 5) >>> 0);
        O.shadowOff = cand[Math.floor(r() * cand.length)];
        note(fx, e.inst.name, O.shadowOff.name + ' is switched off for this moment');
      } }
    ]
  });

  op({
    id: 'OP_COLD_START', name: 'Cold start', tier: 'boss',
    text: 'All your player traits are switched off until your first substitution.',
    playAround: 'Plan an early substitution.',
    effects: [
      { on: 'sub_in', when: function (e) { var O = ops(e.st); return !!O && O.cold && e.side !== 'them'; },
        run: function (e) { var O = ops(e.st); O.cold = false; note(e.st.fx, e.inst.name, 'your first substitution: your player traits are switched on'); } }
    ]
  });

  /* ============================================================ THE KICKOFF */
  FX.extensions.push(function (fx, st, build, oppBuild) {
    var mine = fx.inst.filter(function (x) { return x.side === 'them' && x.def && x.def.opEffect; });
    if (!mine.length) return;
    var has = function (id) { return mine.some(function (x) { return x.def.id === id; }); };
    var O = st.oparch = { htw: 0, awake: false, giant: null, shellWins: 0, shellAt: -1, gm: 0, rattled: {}, shadowOff: null, cold: false, youDecisions: 0,
      ids: mine.map(function (x) { return x.def.id; }) };
    if (has('OP_SLEEPING_GIANT')) {
      var defs = st.opp.players.filter(function (p) { return p.line === 0; });
      O.giant = defs.slice().sort(function (a, b) { return ((b.attr && b.attr.defending) || 0) - ((a.attr && a.attr.defending) || 0); })[0] || null;
      if (O.giant) note(fx, 'Sleeping giant (their team)', first(O.giant) + ', their best defender, is -3 in the first 3 moments, until you have a duel with him');
    }
    if (has('OP_COLD_START') && BREAK !== 'cold') {
      O.cold = true;
      note(fx, 'Cold start (their team)', 'all your player traits are switched off until your first substitution');
    }
    /* your player traits off: Cold start until your first substitution, Shadow marker's pick for its moment.
     * First in line, so a trait working from the bench or copied from another man is switched off too. */
    fx.gates = fx.gates || [];
    fx.gates.unshift(function (inst) {
      if (!yours(inst) || !inst.def || inst.def.kind !== 'trait' || inst.def.hidden) return undefined;
      if (O.cold) return false;
      if (O.shadowOff && inst === O.shadowOff) return false;
      return undefined;
    });
    /* Game manager: every 6th decision you make, they take the ball, one zone closer to your goal */
    if (has('OP_GAME_MANAGER')) {
      fx.afterResolve = fx.afterResolve || [];
      fx.afterResolve.push(function (st2, p, o, ev) {
        O.gm++;
        var every = BREAK === 'gm' ? 999 : 6;
        if (O.gm % every !== 0) return;
        var ok = MX().forceTheirs(st2, p, ev, 'That was your ' + O.gm + 'th decision, so they take the ball.');
        fx.countFire(mine.filter(function (x) { return x.def.id === 'OP_GAME_MANAGER'; })[0]);
        note(fx, 'Game manager (their team)', ok ? 'your ' + O.gm + 'th decision: they take the ball and come one zone closer to your goal'
          : 'your ' + O.gm + 'th decision: a goal was scored, so nothing changes');
      });
    }
  });

  /* ============================================================ WHAT THE PAGE SHOWS */
  function list() {
    return (BREAK === 'oplist' ? LIST.slice(1) : LIST).map(function (id) { var d = FX.get(id); return { id: id, name: d.name, tier: d.tier, text: d.text, playAround: d.playAround }; });
  }
  function counters(st) {
    var O = ops(st), fx = st && st.fx, out = [];
    if (!O || !fx) return out;
    O.ids.forEach(function (id) {
      var d = FX.get(id), n = null, t = null;
      if (id === 'OP_STRONG_BELIEF') { n = st.n - 2; t = 'Their belief: ' + (n > 0 ? '+' : '') + n + ' in every duel this moment.'; }
      else if (id === 'OP_CHECKED_OUT') { n = st.n < 3 ? -2 : 4; t = n < 0 ? 'They are -2 in every duel until half-time.' : 'They are +4 in every duel now.'; }
      else if (id === 'OP_HATES_TIME_WASTING') { n = O.htw; t = O.htw ? 'They are +' + O.htw + ' in every duel: your team has kept the ball without going forward ' + O.htw + ' time' + (O.htw === 1 ? '' : 's') + '.' : 'Each time your team keeps the ball without going forward, they get +1 in every duel.'; }
      else if (id === 'OP_SLEEPING_GIANT') { n = O.awake ? -1 : -3; t = O.giant ? (O.awake ? 'Your player is -1 in every duel of your attacks (' + first(O.giant) + '\'s -3 has ended).' : first(O.giant) + ' is -3 until you have a duel with him or the fourth moment starts.') : 'No defender to wake.'; }
      else if (id === 'OP_SHELL_UP') { n = O.shellWins; t = O.shellAt === fx.scope.moment ? 'This attack they keep every player behind the ball: a duel you lose in their box costs 10 stamina.' : O.shellPending ? 'In your next attack they keep every player behind the ball.' : 'Clean wins: ' + O.shellWins + ' of 3.'; }
      else if (id === 'OP_GAME_MANAGER') { n = 6 - (O.gm % 6); t = 'They take the ball in ' + n + ' decision' + (n === 1 ? '' : 's') + '.'; }
      else if (id === 'OP_UNDER_YOUR_SKIN') { var rt = Object.keys(O.rattled).map(function (pid) { return st.squad.players.concat([st.squad.keeper]).concat(st.squad.bench || []).filter(function (p) { return p && p.id === pid; })[0]; }).filter(Boolean).map(first); n = rt.length; t = rt.length ? 'Rattled: ' + rt.join(', ') + '.' : 'Nobody is rattled.'; }
      else if (id === 'OP_SHADOW_MARKER') { n = O.shadowOff ? 1 : 0; t = O.shadowOff ? O.shadowOff.name + ' is switched off this moment.' : 'Nothing is switched off this moment.'; }
      else if (id === 'OP_COLD_START') { n = O.cold ? 1 : 0; t = O.cold ? 'Your player traits are off until your first substitution.' : 'Your player traits are on.'; }
      else if (id === 'OP_NO_QUICK_SHOTS') { n = O.youDecisions; t = O.youDecisions >= 3 ? 'You can try to score now.' : 'You can try to score from your 4th decision of this moment (you have made ' + O.youDecisions + ').'; }
      else if (id === 'OP_FORTRESS') { n = 2; t = 'Their defenders are +2 in every duel.'; }
      else if (id === 'OP_DIVER') { n = null; t = 'A half win against one of their forwards in your box is a penalty.'; }
      out.push({ id: 'op:' + id, label: d.name, n: n, text: t, opponent: true });
    });
    return out;
  }

  var API = { IDS: LIST, list: list, counters: counters, isRattled: isRattled, BREAK: BREAK,
    ELITES: LIST.filter(function (id) { return FX.get(id).tier === 'elite'; }), BOSSES: LIST.filter(function (id) { return FX.get(id).tier === 'boss'; }) };
  root.KMOpponents = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
