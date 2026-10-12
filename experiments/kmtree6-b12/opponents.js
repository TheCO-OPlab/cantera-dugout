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

  /* kmtree5 a12 (stream EFFX, HANDOVER-EFFX.md; his ruling K2-7): the numbers of the four rebalanced effects. Each part
   * of effects.js efx (KM_EFX / ?efx=) switched off gives a12's number back. With the part 'pool' on, No quick shots and
   * Checked out are final-only (cup.js) and keep a12's strength. Node-only knobs for measuring (efx_batch.sh), never
   * read by the page: KM_EFX_NQ (the decision from which you can score), KM_EFX_CO ('first,second' half), KM_EFX_COLD,
   * KM_EFX_MARK. Breaks for efx_check.js (OPP_BREAK): efxquick (greyed to the 4th decision while the words say the 3rd),
   * efxco (+4 after half-time), efxcold (no -1), efxmark (the -2 lands on the other men), efxwords (a12's numbers in the
   * sentences). */
  function efxOn(k) { return !!(FX.efx && FX.efx(k)); }
  function knob(name, dflt) { try { if (typeof process !== 'undefined' && process.env && process.env[name] !== undefined && process.env[name] !== '') return process.env[name]; } catch (e) { } return dflt; }
  var EFX_POOL = efxOn('pool');
  /* the effects in the final's pool (node-only knob KM_EFX_POOLIDS=quick or quick,checked; default both): a pooled
   * effect keeps a12's strength, the others their rebalanced numbers */
  var POOL_IDS = String(knob('KM_EFX_POOLIDS', 'quick,checked')).split(',');
  function pooled(k) { return EFX_POOL && POOL_IDS.indexOf(k) >= 0; }
  var NQ_FROM = efxOn('quick') && !pooled('quick') ? +knob('KM_EFX_NQ', 3) : 4;            /* a12: 4 */
  var CO_NUM = efxOn('checked') && !pooled('checked') ? String(knob('KM_EFX_CO', '-2,3')).split(',').map(Number) : [-2, 4];   /* a12: -2, +4 */
  var COLD_N = efxOn('cold') ? +knob('KM_EFX_COLD', 1) : 0;                          /* a12: 0 (traits off only) */
  var MARK_N = efxOn('marker') ? +knob('KM_EFX_MARK', 2) : 0;                        /* a12: 0 (the trait off only) */
  var ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  /* the numbers the sentences say (always the numbers in use, except under the break efxwords) */
  var WB = BREAK === 'efxwords', W_NQ = WB ? 4 : NQ_FROM, W_CO = WB ? [-2, 4] : CO_NUM, W_COLD = WB ? 0 : COLD_N, W_MARK = WB ? 0 : MARK_N;
  function signed(n) { return (n > 0 ? '+' : '') + n; }
  /* the man whose trait Shadow marker switched off (the owner of the trait; one of a pair) */
  function markedMan(O) { var x = O && O.shadowOff, o = x && x.owner; return o ? (o.player || o.a || null) : null; }

  /* a12 stream ENG8 (HANDOVER-ENG8.md): options.js's KM_R12 switch, read here (this file loads before options.js on the page,
   * and its sentences are made at load time) the way options.js reads it: node KM_R12 / KM_R12_OFF / R12_BREAK, page ?r12=
   * / ?r12off=. Parts read here: nosub (Cold start without substitutions; KM_R12_COLD / ?r12cold= half | match | out) and
   * strongcap (Strong belief never past +3). */
  var R12P = (function () {
    var parts = { nosub: true, strongcap: true }, brk = '';
    function only(v) { if (typeof v !== 'string' || v === '') return; Object.keys(parts).forEach(function (k) { parts[k] = false; }); v.split(',').forEach(function (k) { if (k in parts) parts[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in parts) parts[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_R12); off(process.env.KM_R12_OFF); brk = process.env.R12_BREAK || ''; } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]r12=([\w,]+)/.exec(qs), m2 = /[?&]r12off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    var cold = (typeof process !== 'undefined' && process.env && process.env.KM_R12_COLD) || '';
    try { var q = /[?&]r12cold=(\w+)/.exec((root.location && root.location.search) || ''); if (q) cold = q[1]; } catch (e) { }
    return { on: function (k) { return !!parts[k] && brk !== k; }, cold: cold === 'match' || cold === 'out' ? cold : 'half' };
  })();
  /* Cold start without substitutions (nosub): 'half' ends it at half-time, 'match' never ends it, 'out' (cup.js) leaves it
   * out of the boss pool (its words are then never shown in a cup) */
  var COLD_NOSUB = R12P.on('nosub') ? R12P.cold : null;
  var COLD_UNTIL = COLD_NOSUB === 'half' ? 'until half-time' : COLD_NOSUB === 'match' ? 'for the whole match' : 'until your first substitution';
  var COLD_UNTIL_CAP = COLD_NOSUB === 'half' ? 'Until half-time' : COLD_NOSUB === 'match' ? 'For the whole match' : 'Until your first substitution';
  /* Strong belief (strongcap): the most it gives, as its card says ("+3 by the last moment" of six) */
  var STRONG_MAX = 3;
  function strongN(st) { var n = st.n - 2; return R12P.on('strongcap') && BREAK !== 'strong' ? Math.min(STRONG_MAX, n) : n; }
  /* ============================================================ RULE PARTS (a13, RULES2)
   * The opponent effects that fit the shared parts are written as rules (OP_RULES below; RULES-DESIGN.md section 9):
   * their number in a duel, your number in a duel, a penalty, a card taken off the menu, and the counters they keep
   * (state in st.oparch, made at kickoff by the extension at the end of this file). No part names an effect. KM_RULES=off
   * defines a12's hand-written effects instead. */
  var ORULES = !!(FX.rules && FX.rules.on);
  function sgn(n) { return (n > 0 ? '+' : '') + n; }
  function otpl(s, o) { return FX.rules.tpl(s, o); }
  function wallCount(e, r) {
    var O = ops(e.st), fx = e.st.fx;
    if (!O) return;
    O.shellWins++;
    if (O.shellWins >= r.do.n) {
      O.shellWins = 0;
      /* (review item 3) it falls on your next attack, not on the next moment whoever attacks */
      if (BREAK === 'shellnext') O.shellAt = fx.scope.moment + 1; else O.shellPending = true;
      note(fx, e.inst.name, r.do.whyAt);
    } else note(fx, e.inst.name, otpl(r.do.why, { c: O.shellWins }));
  }
  if (ORULES) {
    if (FX.rules.use) FX.rules.use({ brk2: BREAK });
    FX.rules.part({
      counters: { wasted: function (st) { var O = ops(st); return O ? O.htw : 0; },
        /* RULES4: your decisions in this moment (the one being chosen counts too: No quick shots) */
        decisions: function (st) { var O = ops(st); return O ? O.youDecisions + (st.fx.inChoose ? 1 : 0) : 99; } },
      ifs: {
        /* ('their number is checked' is the engine's own part now: effects.js, RULES4) */
        /* RULES4: the man whose trait Shadow marker switched off for this moment (OPP_BREAK=efxmark: the other men) */
        'the man in the duel is the one marked this moment': { duel: function (q) { var m = markedMan(ops(q.st)); return !!m && (BREAK === 'efxmark' ? q.actor !== m : q.actor === m); } },
        'their man is a defender in their eleven': { duel: function (q) { return !!q.foil && q.foil.line === 0 && q.st.opp.players.indexOf(q.foil) >= 0; } },
        'their man is a forward': { duel: function (q) { return !!q.foil && q.foil.line === 2; } },
        'in your box': { duel: function (q) { return inBox(q); } },
        'it is not a penalty yet': { duel: function (q) { return q.via !== 'penalty'; } },
        'it is a penalty': { duel: function (q) { return q.via === 'penalty'; } },
        'their man is the sleeper': { duel: function (q) { var O = ops(q.st); return !!O && q.foil === O.giant; } },
        'the sleeper is still asleep': { duel: function (q) { var O = ops(q.st); return !!O && !O.awake && q.st.n < 3; } },
        'the sleeper has woken': { duel: function (q) { var O = ops(q.st); return !!O && O.awake; } },
        'the sleeper has not woken': { event: function (e) { var O = ops(e.st); return !!O && !O.awake; } },
        'the duel was with the sleeper': { event: function (e) { var O = ops(e.st); return !!O && e.foil === O.giant; } },
        /* a15 (merge, a12 ENG8 strongcap): the six moments, and overtime after them */
        'in normal time': { duel: function (q) { return q.st.n < 6; } },
        'in overtime': { duel: function (q) { return q.st.n >= 6; } },
        'cold start is on': { duel: function (q) { var O = ops(q.st); return !!O && O.cold; }, event: function (e) { var O = ops(e.st); return !!O && O.cold; } },
        'it is your substitution': { event: function (e) { return e.side !== 'them'; } },
        /* a duel of your attack after which your team keeps the ball without moving forward (in the same zone or further back) */
        'your team kept the ball without going forward': { event: function (e) {
          if (e.side !== 'you' || !e.duel || e.zone === null || e.effect === 'break' || e.effect === 'goal') return false;
          return (typeof e.move === 'number' && e.move <= 0) || (e.effect === 'nothing' && (e.pays === 'keep' || e.pays === 'clock'));
        } },
        'in their box': { event: function (e) { return e.zone === 3; } },
        'the man has a line': { event: function (e) { return !!e.actor && typeof e.actor.line === 'number'; } },
        'a wall is pending': { event: function (e) { var O = ops(e.st); return !!O && !!O.shellPending; } },
        'their wall is up this moment': { event: function (e) { var O = ops(e.st); return !!O && O.shellAt === e.st.fx.scope.moment; } }
      },
      dos: {
        /* ('their stat add' is the engine's own part now: effects.js, RULES4; a repeat comes from your side only) */
        /* your number */
        'your stat add': { duel: function (q, r) {
          var O = ops(q.st);
          q.stat(r.do.n, otpl(r.do.why, { giant: O && O.giant ? first(O.giant) : '', actor: first(q.actor) }));
        } },
        /* RULES4: a card on the menu cannot be chosen now ({nth}: which decision of the moment this is) */
        'card grey': { option: function (q, r) { if (FX.rules.broken('grey')) return; q.grey(otpl(r.do.why, { nth: ORD[Math.min(5, FX.rules.counter('decisions', q.st, null))] })); } },
        'decisions reset': { event: function (e) { var O = ops(e.st); if (O) O.youDecisions = 0; } },
        'decisions add': { event: function (e) { var O = ops(e.st); if (O && !FX.rules.broken('decisions')) O.youDecisions++; } },
        /* RULES4: one of your player traits, chosen at random for this moment, is switched off (the engine's own gate, shared with Cold start) */
        'trait switch off': { event: function (e, r) {
          var O = ops(e.st), st = e.st, fx = st.fx;
          if (!O || FX.rules.broken('switchoff')) return;
          O.shadowOff = null;
          var cand = fx.inst.filter(function (x) { return yours(x) && x.def && x.def.kind === 'trait' && !x.def.hidden && fx.active(x); });
          if (!cand.length || BREAK === 'shadowmarker') { note(fx, e.inst.name, r.do.none); return; }
          var rn = rng(((st.seed | 0) * 6151 + fx.scope.moment * 97 + 5) >>> 0);
          O.shadowOff = cand[Math.floor(rn() * cand.length)];
          var mm = MARK_N ? markedMan(O) : null;
          note(fx, e.inst.name, otpl(r.do.why, { trait: O.shadowOff.name, marked: mm ? ', and ' + first(mm) + ' is -' + MARK_N + ' in every duel of it' : '' }));
        } },
        'penalty award': { outcome: function (q, r) { q.penalty(r.do.on, otpl(r.do.why, { foil: first(q.foil) })); } },
        'card remove': { option: function (q, r) { q.remove(r.do.why); } },
        'wasted add': { event: function (e, r) {
          var O = ops(e.st); if (!O) return;
          O.htw += r.do.n;
          note(e.st.fx, e.inst.name, otpl(r.do.why, { c: O.htw }));
        } },
        'sleeper wake': { event: function (e, r) {
          var O = ops(e.st); O.awake = true;
          note(e.st.fx, e.inst.name, otpl(r.do.say, { giant: first(O.giant), why: r.do.why }));
        } },
        'cold start end': { event: function (e, r) { var O = ops(e.st); O.cold = false; note(e.st.fx, e.inst.name, r.do.why); } },
        'wall count': { event: wallCount },
        'wall up': { event: function (e, r) { var O = ops(e.st); O.shellPending = false; O.shellAt = e.st.fx.scope.moment; note(e.st.fx, e.inst.name, r.do.why); } },
        'stamina tire': { event: function (e, r) { var ln = ['def', 'mid', 'att'][e.actor.line]; e.tire(ln, r.do.n, r.do.why); } }
      }
    });
  }

  var LIST = [];
  function op(def) {
    def.kind = 'tactic'; def.opEffect = true;
    if (ORULES && OP_RULES[def.id]) { delete def.effects; def.rules = OP_RULES[def.id]; }   /* a13 RULES2: the rules replace the hand-written effects */
    FX.define(def);
    LIST.push(def.id);
  }

  /* ============================================================ ELITES: proposed in his feedback */
  var PEN_DIVE = 'OP_C_PEN_DIVE', PEN_WAIT = 'OP_C_PEN_WAIT';
  /* ---- THE EFFECTS AS RULES (a13 RULES2): each one's words as WHEN / IF / DO / TO. A rule's `brk` is an OPP_BREAK name that
   * switches it off (archcheck.js --prove). Sentences are templates: {m} the moment, {sn} a number with its sign, {c} a
   * counter, {foil} their man, {giant} the sleeper. */
  var OP_RULES = {
    /* "In your box, a duel you only half win against one of their forwards is given as a penalty to them." */
    OP_DIVER: [
      { when: 'outcome', if: ['it is their card', 'in your box', 'it is not a penalty yet', 'their man is a forward'], do: { ch: 'penalty', op: 'award', on: 'mixed', why: 'a half win against {foil} in your box is a penalty to them' }, to: 'their team', brk: 'diver' },
      { when: 'option', if: ['it is their card', 'it is a penalty', 'the card is not ' + PEN_DIVE, 'the card is not ' + PEN_WAIT], do: { ch: 'card', op: 'remove', why: 'a penalty: only your keeper can stop it' }, to: 'their team' }
    ].concat(BREAK === 'penplus' ? [{ when: 'duel', if: ['it is their card', 'it is a penalty', 'their number is checked'], do: { ch: 'their stat', op: 'add', n: 3, why: 'a penalty is taken from 11 metres' }, to: 'their man in the duel' }] : []),
    /* "They start the match at -2 in every duel and get +1 at the start of each moment from the second one." */
    /* a15 (merge): a12 ENG8's strongcap ("+3 by the last moment"; past the six moments it is overtime and they stay at +3) written as
     * rules: the moment rule holds in normal time, and in overtime the number is the +3 the card promises. With strongcap off
     * (KM_R12_OFF=strongcap) the one a13 rule, uncapped. */
    OP_STRONG_BELIEF: R12P.on('strongcap') ? [
      { when: 'duel', if: ['their number is checked', 'in normal time'], do: { ch: 'their stat', op: 'add', n: { moment: -2 }, why: 'moment {m} of 6: they are {sn} in every duel' }, to: 'their man in the duel', brk: 'strong' },
      { when: 'duel', if: ['their number is checked', 'in overtime'], do: { ch: 'their stat', op: 'add', n: STRONG_MAX, why: 'overtime: they are +' + STRONG_MAX + ' in every duel (the most their belief gives)' }, to: 'their man in the duel', brk: 'strong' }
    ] : [
      { when: 'duel', if: ['their number is checked'], do: { ch: 'their stat', op: 'add', n: { moment: -2 }, why: 'moment {m} of 6: they are {sn} in every duel' }, to: 'their man in the duel', brk: 'strong' }
    ],
    /* "They are -2 in every duel until half-time, then +4 for the rest of the match." (the numbers are the switch's) */
    OP_CHECKED_OUT: [
      { when: 'duel', if: ['their number is checked', 'before half-time'], do: { ch: 'their stat', op: 'add', n: CO_NUM[0], why: 'they are ' + signed(CO_NUM[0]) + ' in every duel until half-time (first half)' }, to: 'their man in the duel', brk: 'checked' },
      { when: 'duel', if: ['their number is checked', 'from half-time'], do: { ch: 'their stat', op: 'add', n: CO_NUM[1], why: 'they are ' + signed(CO_NUM[1]) + ' in every duel after half-time (second half)' }, to: 'their man in the duel', brk: 'efxco' }
    ],
    /* "Each duel of your attack after which your team keeps the ball without moving forward gives them +1 in every duel." */
    OP_HATES_TIME_WASTING: [
      { when: 'decision_end', if: ['your team kept the ball without going forward'], do: { ch: 'wasted', op: 'add', n: 1, why: 'your team held the ball without going forward: they get +1 in every duel (+{c} now)' }, to: 'their team', brk: 'htw' },
      { when: 'duel', if: ['wasted above 0', 'their number is checked'], do: { ch: 'their stat', op: 'add', n: { counter: 'wasted' }, why: 'your team has kept the ball without going forward {c} time{s} (+{c} to them)' }, to: 'their man in the duel' }
    ],
    /* "Their best defender is -3 in the first 3 moments. A duel with him ends that at once. When it ends, your player is -1
     * in every duel of your attacks." (who he is is chosen at kickoff, by the extension below) */
    OP_SLEEPING_GIANT: [
      { when: 'duel', if: ['the sleeper is still asleep', 'their man is the sleeper', 'their number is checked'], do: { ch: 'their stat', op: 'add', n: -3, why: '{foil} is -3 until you have a duel with him (first 3 moments)' }, to: 'their man in the duel' },
      { when: 'duel', if: ['the sleeper has woken', 'it is your attack', 'the card has a stat'], do: { ch: 'your stat', op: 'add', n: -1, why: 'your player is -1 in your attacks now that {giant}\'s -3 has ended' }, to: 'your man in the duel', brk: 'giant' },
      { when: ['clean_win', 'half_win', 'loss'], if: ['the sleeper has not woken', 'the duel was with the sleeper'], do: { ch: 'sleeper', op: 'wake', why: 'you had a duel with him',
        say: '{giant}\'s -3 ends ({why}): from now on your player is -1 in every duel of your attacks' }, to: 'their team' },
      { when: 'moment_start', if: ['the sleeper has not woken', 'from the fourth moment'], do: { ch: 'sleeper', op: 'wake', why: 'the fourth moment starts',
        say: '{giant}\'s -3 ends ({why}): from now on your player is -1 in every duel of your attacks' }, to: 'their team' }
    ],
    /* "After your players win 3 duels cleanly, in your next attack they keep every player behind the ball: each duel you lose in
     * their box in that attack costs that line of yours 10 stamina." */
    OP_SHELL_UP: [
      { when: 'clean_win', do: { ch: 'wall', op: 'count', n: 3, why: 'a clean win ({c} of 3)',
        whyAt: 'you won 3 duels cleanly: in your next attack they keep every player behind the ball (a duel you lose in their box costs 10 stamina)' }, to: 'their team' },
      { when: 'loss', if: ['their wall is up this moment', 'your decision', 'in their box', 'the man has a line'], do: { ch: 'stamina', op: 'tire', n: 10, why: 'you lost a duel in their box while they keep every player behind the ball' }, to: 'your team', brk: 'shell' },
      { when: 'possession_start', if: ['a wall is pending', 'your decision'], do: { ch: 'wall', op: 'up', why: 'this attack: they keep every player behind the ball (a duel you lose in their box costs 10 stamina)' }, to: 'their team' }
    ],
    /* "Their defenders are +2 in every duel for the whole match." */
    OP_FORTRESS: [
      { when: 'duel', if: ['their number is checked', 'their man is a defender in their eleven'], do: { ch: 'their stat', op: 'add', n: 2, why: 'their defenders are +2 in every duel, and {foil} is a defender' }, to: 'their man in the duel', brk: 'fortress' }
    ],
    /* "All your player traits are switched off until your first substitution." (switched on at kickoff by the extension below;
     * with the Efx numbers, your players are also -n in every duel until then) */
    /* a15 (merge): a12 ENG8's nosub written as rules: the words say when it ends (COLD_UNTIL), and with KM_R12_COLD=half (default) it
     * ends at the first moment of the second half */
    OP_COLD_START: (COLD_N > 0 ? [{ when: 'duel', if: ['cold start is on', 'the card has a stat', 'their number is checked'], do: { ch: 'your stat', op: 'add', n: -COLD_N,
      why: 'your players are -' + COLD_N + ' in every duel ' + COLD_UNTIL }, to: 'your man in the duel', brk: 'efxcold' }] : []).concat([
      { when: 'sub_in', if: ['cold start is on', 'it is your substitution'], do: { ch: 'cold start', op: 'end', why: 'your first substitution: your player traits are switched on' }, to: 'their team' }])
      .concat(COLD_NOSUB === 'half' ? [
      { when: 'moment_start', if: ['cold start is on', 'from half-time'], do: { ch: 'cold start', op: 'end', why: 'half-time: your player traits are switched on' + (COLD_N ? ' and the -' + COLD_N + ' ends' : '') }, to: 'their team' }] : []),
    /* RULES4. "In each moment you can only shoot, or play a card that can score, from your 4th decision on. Until then those cards are greyed out."
     * (the number of decisions is the switch's: NQ_FROM; the two bookkeeping rules count your decisions in the moment, as the effect did) */
    OP_NO_QUICK_SHOTS: [
      { when: 'option', if: ['it is your attack', 'the card can score', 'decisions below ' + (BREAK === 'efxquick' ? 3 : NQ_FROM - 1)],
        do: { ch: 'card', op: 'grey', why: 'you can only try to score from your ' + ORD[NQ_FROM - 1] + ' decision of a moment (this is your {nth})' }, to: 'your team', brk: 'noquick' },
      { when: 'moment_start', quiet: true, do: { ch: 'decisions', op: 'reset' }, to: 'your team' },
      { when: 'decision_end', if: ['your decision'], quiet: true, do: { ch: 'decisions', op: 'add' }, to: 'your team' }
    ],
    /* "At the start of each moment, one of your player traits (chosen at random) is switched off for that moment, and the player who has it is -2 in
     * every duel of that moment." (the -2 is the switch's: MARK_N; the switch-off is the engine's gate, shared with Cold start) */
    OP_SHADOW_MARKER: (MARK_N > 0 ? [{ when: 'duel', if: ['the man in the duel is the one marked this moment', 'the card has a stat', 'their number is checked'],
      do: { ch: 'your stat', op: 'add', n: -MARK_N, why: '{actor} is marked this moment (his trait is switched off)' }, to: 'your man in the duel' }] : []).concat([
      { when: 'moment_start', do: { ch: 'trait', op: 'switch off', none: 'you have no player trait for them to switch off', why: '{trait} is switched off for this moment{marked}' }, to: 'one of your player traits at random' }])
  };

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
        apply: function (q) {
          var n = BREAK === 'strong' ? -2 : strongN(q.st);
          /* a12 ENG8 (strongcap; review/monday-rev3 finding 8: "moment 7 of 6: they are +4"): past the six moments it is
           * overtime, and they stay at the +3 the card promises */
          var ot = R12P.on('strongcap') && q.st.n >= 6;
          q.theirStat(n, (ot ? 'overtime' : 'moment ' + (q.st.n + 1) + ' of 6') + ': they are ' + (n > 0 ? '+' : '') + n + ' in every duel' + (ot ? ' (the most their belief gives)' : ''));
        } }
    ]
  });

  op({
    id: 'OP_CHECKED_OUT', name: 'Checked out, then all in', tier: 'elite',
    text: 'They are ' + signed(W_CO[0]) + ' in every duel until half-time, then ' + signed(W_CO[1]) + ' for the rest of the match.',
    playAround: 'Score heavily in the first half, and protect the lead after it.',
    effects: [
      { hook: 'stat', when: function (q) { return theirs(q); },
        apply: function (q) { var h = q.st.n < 3 || BREAK === 'checked'; q.theirStat(h ? CO_NUM[0] : BREAK === 'efxco' ? 4 : CO_NUM[1], h ? 'they are ' + signed(CO_NUM[0]) + ' in every duel until half-time (first half)' : 'they are ' + signed(CO_NUM[1]) + ' in every duel after half-time (second half)'); } }
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
    id: 'OP_GAME_MANAGER', name: '6th sense', tier: 'elite',   /* a11 (helper Q13): his new name (2026-10-02, "6th Sense"); the id stays */
    /* a11 TRT sense: the sentence says the exception match.js forceTheirs has always made (a goal either way) */
    text: FX.t11 && FX.t11('sense') ? 'Every 6th decision you make in the match, they take the ball and come one zone closer to your goal, unless that decision ends in a goal.'
      : 'Every 6th decision you make in the match, they take the ball and come one zone closer to your goal.',
    playAround: 'Keep your attacks short, and count your decisions.',
    effects: []   /* afterResolve (the extension below): match.js forceTheirs */
  });

  /* kmtree5 a11 (helper Q13; his note 19, 2026-10-02: "When Game Manager triggers, it should show on the cards (all)"):
   * the words every card of the menu carries on the decision after which the effect acts (options.js puts them on the
   * options, the page draws them). A display only: nothing here changes a menu, a number, a roll or a result.
   * What is true after that decision (match.js forceTheirs, read not edited): they have the ball at the next decision,
   * whatever is picked and whatever the dice say, except when the decision ends in a goal (either way), which is
   * left alone. On their own attack they already have the ball, so the line there says they keep it even when you
   * win the duel (q13_sense.js S4 checks both sentences against the next decision of 300 cup matches).
   * OPP_BREAK=sense: no card carries it; OPP_BREAK=senseearly: the decision before carries it too. */
  var SENSE_TAG = '6th sense', SENSE_LINE = '6th sense: they take the ball after this, unless you score',
    SENSE_LINE_THEIRS = '6th sense: they keep the ball even if you win this duel';
  function senseDue(O) { return !!O && BREAK !== 'sense' && (O.gm % 6 === 5 || (BREAK === 'senseearly' && O.gm % 6 === 4)); }

  /* kmtree5 a11 (helper G11; Eduardo's design of 2026-10-02, BRIEF-a11.md package G, DECISIONS-G11.md): "the rattled
   * card should be one random card of the ones offered, and it's red with 'rattled: you lose the duel'. The becoming
   * unrattled seems unnecessary. If a random card is rattled every first decision of a moment, that seems strong
   * enough of a debuff to the player." With the switch on (FX.g11('skin'); KM_G11_OFF=skin or ?g11off=skin gives a10's
   * rule back, everything below this comment as it was):
   *   - no player is rattled, nothing is cleared, and the two clog cards (OP_C_RATTLED, OP_C_RATTLED_D) are never built;
   *   - the card is chosen where the final menu is known (options.js g11Rattle), at the first decision of a moment
   *     (match.js next marks it), with its own seeded generator; choosing it loses the duel (match.js choose);
   *   - this file only says it: the sentence, how to play around it, the counter chip and the kick-off note.
   * OPP_BREAK=skinclog builds the old clog cards beside the new rule (archcheck O08d must fail). */
  var SKIN11 = !!(FX.g11 && FX.g11('skin'));
  var SKIN_TEXT = 'At the first decision of every moment, one card on your menu, chosen at random, is rattled. A rattled card is shown in red. If you choose it, you lose the duel.';
  var SKIN_AROUND = 'Choose another card. The rattled card can be your best one, so do not depend on one card at the first decision of a moment.';
  var SKIN_TAG = 'Rattled', SKIN_LINE = 'Rattled: you lose the duel';
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
    text: SKIN11 ? SKIN_TEXT : 'At the start of each moment one of your players (chosen at random) is rattled. While he is rattled, a card where he loses the ball takes one of the places on every menu he is in. Choosing that card loses the duel, and he is no longer rattled.',
    playAround: SKIN11 ? SKIN_AROUND : 'Plan attacks that do not need every place on the menu.',
    effects: [
      { on: 'moment_start', quiet: SKIN11, run: function (e) {
        var O = ops(e.st), st = e.st, fx = st.fx;
        if (SKIN11) return;   /* a11: nobody is rattled; the card is chosen on the menu (options.js), said by match.js */
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
      when: function (x, q) { if (SKIN11) return BREAK === 'skinclog' && q.st.squad.players.indexOf(x.actor) >= 0; return isRattled(q.st, x.actor) && q.st.squad.players.indexOf(x.actor) >= 0; },
      build: function (x, q) { return rattledCard(x, q, false); }
    }, {
      id: RATTLE_THEM, side: 'them', tzones: [0, 1], family: 'stop', tags: ['tackle'], clog: true,
      text: 'a rattled player lets his man past',
      when: function (x, q) { if (SKIN11) return BREAK === 'skinclog' && q.st.squad.players.indexOf(x.actor) >= 0 && !!x.foil; return isRattled(q.st, x.actor) && q.st.squad.players.indexOf(x.actor) >= 0 && !!x.foil; },
      build: function (x, q) { return rattledCard(x, q, true); }
    }]
  });
  /* your decisions already made in this moment, before the menu being built: a menu the engine builds
   * ahead while a decision is still being resolved (match.js nextLive) counts that decision too */
  function decisionsBefore(q) { var O = ops(q.st); return O ? O.youDecisions + (q.st.fx.inChoose ? 1 : 0) : 99; }
  function isRattled(st, p) { var O = ops(st); if (!O || !p) return false; return !!O.rattled[p.id] || AR.rattled(st, p); }
  /* a11 (helper G11): the rattled card of the menu that is open now (null when none is) */
  function rattledNow(st) {
    var p = st && st.pending, opts = p && p.moment && p.moment.options;
    return (opts || []).filter(function (o) { return o.rattled && !o.disabled; })[0] || null;
  }

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
    text: 'In each moment you can only shoot, or play a card that can score, from your ' + ORD[W_NQ - 1] + ' decision on. Until then those cards are greyed out.',
    playAround: 'Build up before you shoot.',
    effects: [
      { hook: 'option', when: function (q) { return decisionsBefore(q) < (BREAK === 'efxquick' ? 3 : NQ_FROM - 1) && yourAttack(q) && R.canScore('you', q.pays) && BREAK !== 'noquick'; },
        apply: function (q) { q.grey('you can only try to score from your ' + ORD[NQ_FROM - 1] + ' decision of a moment (this is your ' + ORD[decisionsBefore(q)] + ')'); } },
      { on: 'moment_start', quiet: true, run: function (e) { var O = ops(e.st); if (O) O.youDecisions = 0; } },
      { on: 'decision_end', quiet: true, when: function (e) { return e.side === 'you'; }, run: function (e) { var O = ops(e.st); if (O) O.youDecisions++; } }
    ]
  });

  op({
    id: 'OP_SHADOW_MARKER', name: 'Shadow marker', tier: 'boss',
    text: W_MARK ? 'At the start of each moment, one of your player traits (chosen at random) is switched off for that moment, and the player who has it is -' + W_MARK + ' in every duel of that moment.'
      : 'At the start of each moment, one of your player traits (chosen at random) is switched off for that moment.',
    playAround: W_MARK ? 'Do not depend on a single trait or a single player.' : 'Do not depend on a single trait.',
    effects: [
      /* EFFX marker: the man they mark is -MARK_N in every duel of the moment (attacking and defending) */
      { hook: 'stat', when: function (q) { var O = ops(q.st), m = markedMan(O); return MARK_N > 0 && !!m && (BREAK === 'efxmark' ? q.actor !== m : q.actor === m) && q.mineVal !== null && theirs(q); },
        apply: function (q) { q.stat(-MARK_N, first(q.actor) + ' is marked this moment (his trait is switched off)'); } },
      { on: 'moment_start', run: function (e) {
        var O = ops(e.st), st = e.st, fx = st.fx;
        if (!O) return;
        O.shadowOff = null;
        var cand = fx.inst.filter(function (x) { return yours(x) && x.def && x.def.kind === 'trait' && !x.def.hidden && fx.active(x); });
        if (!cand.length || BREAK === 'shadowmarker') { note(fx, e.inst.name, 'you have no player trait for them to switch off'); return; }
        var r = rng(((st.seed | 0) * 6151 + fx.scope.moment * 97 + 5) >>> 0);
        O.shadowOff = cand[Math.floor(r() * cand.length)];
        var mm = MARK_N ? markedMan(O) : null;
        note(fx, e.inst.name, O.shadowOff.name + ' is switched off for this moment' + (mm ? ', and ' + first(mm) + ' is -' + MARK_N + ' in every duel of it' : ''));
      } }
    ]
  });

  op({
    id: 'OP_COLD_START', name: 'Cold start', tier: 'boss',
    text: W_COLD ? COLD_UNTIL_CAP + ', all your player traits are switched off and your players are -' + W_COLD + ' in every duel.'
      : 'All your player traits are switched off ' + COLD_UNTIL + '.',
    /* a12 ENG8 (nosub): there is no substitution to plan any more */
    playAround: COLD_NOSUB === 'half' ? 'Keep it tight until half-time: your traits come back for the second half.'
      : COLD_NOSUB === 'match' ? 'Win it with your players\' own numbers: no trait will help.' : 'Plan an early substitution.',
    effects: [
      /* EFFX cold: your men are -COLD_N in every duel until your first substitution */
      { hook: 'stat', when: function (q) { var O = ops(q.st); return COLD_N > 0 && BREAK !== 'efxcold' && !!O && O.cold && q.mineVal !== null && theirs(q); },
        apply: function (q) { q.stat(-COLD_N, 'your players are -' + COLD_N + ' in every duel ' + COLD_UNTIL); } },
      { on: 'sub_in', when: function (e) { var O = ops(e.st); return !!O && O.cold && e.side !== 'them'; },
        run: function (e) { var O = ops(e.st); O.cold = false; note(e.st.fx, e.inst.name, 'your first substitution: your player traits are switched on'); } }
    ].concat(COLD_NOSUB === 'half' ? [
      /* a12 ENG8 (nosub, KM_R12_COLD=half): with no substitutions it ends at half-time (the first moment of the second half) */
      { on: 'moment_start', when: function (e) { var O = ops(e.st); return !!O && O.cold && e.st.n >= 3; },
        run: function (e) { var O = ops(e.st); O.cold = false; note(e.st.fx, e.inst.name, 'half-time: your player traits are switched on' + (COLD_N ? ' and the -' + COLD_N + ' ends' : '')); } }
    ] : [])
  });

  /* ============================================================ THE KICKOFF */
  FX.extensions.push(function (fx, st, build, oppBuild) {
    var mine = fx.inst.filter(function (x) { return x.side === 'them' && x.def && x.def.opEffect; });
    if (!mine.length) return;
    var has = function (id) { return mine.some(function (x) { return x.def.id === id; }); };
    var O = st.oparch = { htw: 0, awake: false, giant: null, shellWins: 0, shellAt: -1, gm: 0, rattled: {}, shadowOff: null, cold: false, youDecisions: 0,
      ids: mine.map(function (x) { return x.def.id; }) };
    /* EFFX quick: how many of your decisions in a moment come before you can try to score (a12: 3). options.js reads it
     * for TRT's short free kick only if RUL-E takes the change in HANDOVER-EFFX.md; until then it keeps its own 3. */
    if (efxOn('quick')) O.quickBefore = NQ_FROM - 1;
    if (has('OP_SLEEPING_GIANT')) {
      var defs = st.opp.players.filter(function (p) { return p.line === 0; });
      O.giant = defs.slice().sort(function (a, b) { return ((b.attr && b.attr.defending) || 0) - ((a.attr && a.attr.defending) || 0); })[0] || null;
      if (O.giant) note(fx, 'Sleeping giant (their team)', first(O.giant) + ', their best defender, is -3 in the first 3 moments, until you have a duel with him');
    }
    /* a11 (helper G11): the kick-off note says the new rule */
    if (SKIN11 && has('OP_UNDER_YOUR_SKIN')) note(fx, 'Gets under your skin (their team)', 'at the first decision of every moment, one card on your menu is rattled: if you choose it, you lose the duel');
    if (has('OP_COLD_START') && BREAK !== 'cold') {
      O.cold = true;
      note(fx, 'Cold start (their team)', COLD_N ? COLD_UNTIL + ', all your player traits are switched off and your players are -' + COLD_N + ' in every duel'
        : 'all your player traits are switched off ' + COLD_UNTIL);
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
    /* 6th sense (was Game manager): every 6th decision you make, they take the ball, one zone closer to your goal */
    if (has('OP_GAME_MANAGER')) {
      fx.q13Sense = function (who) { return senseDue(O) ? { tag: SENSE_TAG, line: who === 'them' ? SENSE_LINE_THEIRS : SENSE_LINE } : null; };   /* a11 (helper Q13): read by options.js offer() */
      fx.afterResolve = fx.afterResolve || [];
      fx.afterResolve.push(function (st2, p, o, ev) {
        O.gm++;
        var every = BREAK === 'gm' ? 999 : 6;
        if (O.gm % every !== 0) return;
        var ok = MX().forceTheirs(st2, p, ev, 'That was your ' + O.gm + 'th decision, so they take the ball.');
        fx.countFire(mine.filter(function (x) { return x.def.id === 'OP_GAME_MANAGER'; })[0]);
        /* a11 TRT sense: the log says why nothing changed (a11 said "a goal was scored" also when their attack was already
         * going into your box: forceTheirs leaves that alone too) */
        var goal0 = ev && (ev.kind === 'goal' || ev.kind === 'conceded');
        note(fx, '6th sense (their team)', ok ? 'your ' + O.gm + 'th decision: they take the ball and come one zone closer to your goal'
          : FX.t11 && FX.t11('sense') && !goal0 ? 'your ' + O.gm + 'th decision: their attack is already going into your box, so nothing changes'
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
      if (id === 'OP_STRONG_BELIEF') { n = strongN(st); t = 'Their belief: ' + (n > 0 ? '+' : '') + n + ' in every duel this moment.'; }   /* (a12 ENG8 strongcap) */
      else if (id === 'OP_CHECKED_OUT') { n = st.n < 3 ? CO_NUM[0] : CO_NUM[1]; t = st.n < 3 ? 'They are ' + signed(CO_NUM[0]) + ' in every duel until half-time.' : 'They are ' + signed(CO_NUM[1]) + ' in every duel now.'; }
      else if (id === 'OP_HATES_TIME_WASTING') { n = O.htw; t = O.htw ? 'They are +' + O.htw + ' in every duel: your team has kept the ball without going forward ' + O.htw + ' time' + (O.htw === 1 ? '' : 's') + '.' : 'Each time your team keeps the ball without going forward, they get +1 in every duel.'; }
      else if (id === 'OP_SLEEPING_GIANT') { n = O.awake ? -1 : -3; t = O.giant ? (O.awake ? 'Your player is -1 in every duel of your attacks (' + first(O.giant) + '\'s -3 has ended).' : first(O.giant) + ' is -3 until you have a duel with him or the fourth moment starts.') : 'No defender to wake.'; }
      else if (id === 'OP_SHELL_UP') { n = O.shellWins; t = O.shellAt === fx.scope.moment ? 'This attack they keep every player behind the ball: a duel you lose in their box costs 10 stamina.' : O.shellPending ? 'In your next attack they keep every player behind the ball.' : 'Clean wins: ' + O.shellWins + ' of 3.'; }
      else if (id === 'OP_GAME_MANAGER') { n = 6 - (O.gm % 6); t = 'They take the ball in ' + n + ' decision' + (n === 1 ? '' : 's') + '.'; }
      else if (id === 'OP_UNDER_YOUR_SKIN' && SKIN11) {
        /* a11 (helper G11): the chip reads the menu that is open (the card itself says which one: it is the red one) */
        var rc = rattledNow(st);
        n = rc ? 1 : 0;
        t = rc ? 'One card on this menu is rattled. If you choose it, you lose the duel.' : 'One card is rattled at the first decision of every moment. No card is rattled now.';
      }
      else if (id === 'OP_UNDER_YOUR_SKIN') { var rt = Object.keys(O.rattled).map(function (pid) { return st.squad.players.concat([st.squad.keeper]).concat(st.squad.bench || []).filter(function (p) { return p && p.id === pid; })[0]; }).filter(Boolean).map(first); n = rt.length; t = rt.length ? 'Rattled: ' + rt.join(', ') + '.' : 'Nobody is rattled.'; }
      else if (id === 'OP_SHADOW_MARKER') { var mk = MARK_N ? markedMan(O) : null; n = O.shadowOff ? 1 : 0; t = O.shadowOff ? O.shadowOff.name + ' is switched off this moment' + (mk ? ', and ' + first(mk) + ' is -' + MARK_N + ' in every duel.' : '.') : 'Nothing is switched off this moment.'; }
      else if (id === 'OP_COLD_START') { n = O.cold ? 1 : 0; t = O.cold ? (COLD_N ? 'Your player traits are off and your players are -' + COLD_N + ' in every duel ' + COLD_UNTIL + '.' : 'Your player traits are off ' + COLD_UNTIL + '.') : 'Your player traits are on.'; }
      else if (id === 'OP_NO_QUICK_SHOTS') { n = O.youDecisions; t = O.youDecisions >= NQ_FROM - 1 ? 'You can try to score now.' : 'You can try to score from your ' + ORD[NQ_FROM - 1] + ' decision of this moment (you have made ' + O.youDecisions + ').'; }
      else if (id === 'OP_FORTRESS') { n = 2; t = 'Their defenders are +2 in every duel.'; }
      else if (id === 'OP_DIVER') { n = null; t = 'A half win against one of their forwards in your box is a penalty.'; }
      out.push({ id: 'op:' + id, label: d.name, n: n, text: t, opponent: true });
    });
    return out;
  }

  var API = { IDS: LIST, list: list, counters: counters, isRattled: isRattled, BREAK: BREAK,
    EFFX: { pool: EFX_POOL, nqFrom: NQ_FROM, co: CO_NUM.slice(), cold: COLD_N, mark: MARK_N, markedMan: markedMan } /* kmtree5 a12 (stream EFFX) */,
    SKIN11: SKIN11, SKIN_TAG: SKIN_TAG, SKIN_LINE: SKIN_LINE, rattledNow: rattledNow /* a11 (helper G11) */,
    SENSE_TAG: SENSE_TAG, SENSE_LINE: SENSE_LINE, SENSE_LINE_THEIRS: SENSE_LINE_THEIRS /* a11 (helper Q13) */,
    ELITES: LIST.filter(function (id) { return FX.get(id).tier === 'elite'; }), BOSSES: LIST.filter(function (id) { return FX.get(id).tier === 'boss'; }) };
  root.KMOpponents = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
