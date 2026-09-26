/* CONTENT D (wave w1d): components built on the SHAPE OF THE SQUAD.
 *
 * Who is picked, what job each man has, who is linked to whom, who wears
 * the armband, and who comes off the bench. Four build families and the
 * bridges between them:
 *
 *   NO STRIKER       no specialist finisher; several midfielders arrive late
 *                    instead. A striker on the pitch switches it off, so the
 *                    strongest single forward makes this team WORSE.
 *   CHAOS IN THE BOX counts of bodies and tall men turn half-won shots and
 *                    headers into loose balls; one specialist who is first
 *                    to them, or two of them (the lone specialist trade-off).
 *   TWO HALVES       a starting forward who wears their defence down, a
 *                    substitute who feeds on it; what the leaving man built
 *                    stays or goes by ownership.
 *   THE PARTNERSHIP  links between named pairs: a return pass, an overlap on
 *                    the pair's own flank, a man who always looks for his
 *                    partner, and a captain who doubles his own link.
 *
 * Composition is read LIVE from the eleven on the pitch (squad.players), so
 * a substitution changes every count at once. Each player's FIRST role in
 * the build is his job for these counts (one role each: a runner is not
 * also a playmaker). Every change goes through the effects layer's helpers,
 * so it is named on the card before the pick and in the log when it fires.
 * Nothing here runs unless a build names it (effects.js).
 *
 * Load after effects.js (and components.js). In node: require('./content-d.js').
 * Plain English, no dashes in any sentence a player reads.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function O() { return root.KMOptions || require('./options.js'); }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function lane(p) { return O().lane(p); }
  var LINE = ['def', 'mid', 'att'];
  var SIDE = ['left', 'middle', 'right'];

  /* ================================================ match memory */
  /* Hooks see the option, not the match. Every component here carries the
   * same silent bookkeeping effects (TRACK): they remember the match for
   * each squad and each player, the last decision of the attack, and how
   * many times each component has been used in this attack. They change
   * nothing in the match and write no log line; they are idempotent, so
   * several components carrying them count once. */
  var STS = new WeakMap(), STP = new WeakMap(), MEM = new WeakMap();
  function mem(st) {
    var m = MEM.get(st);
    if (!m) {
      m = { dec: -1, poss: -1, last: null, uses: {}, notes: [], shot: false, cleanOn: {}, plan: 'before',
        as: {}, removed: {}, loose: null, counted: -1 };
      MEM.set(st, m);
    }
    return m;
  }
  function remember(st) {
    STS.set(st.squad, st); STS.set(st.opp, st);
    [st.squad, st.opp].forEach(function (sq) {
      sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).concat(sq.off || []).forEach(function (p) { STP.set(p, st); });
    });
  }
  function stOf(q) {
    return (q.squad && STS.get(q.squad)) || (q.actor && STP.get(q.actor)) || (q.owner && STP.get(q.owner)) ||
      (q.foil && STP.get(q.foil)) || (q.pair && STP.get(q.pair[0])) || null;
  }
  /* the component's name as the engine writes it (effects.js ownerName) */
  function nameOf(def, owner, pair) {
    if (def.kind === 'trait' || def.kind === 'specialisation') return def.name + ' (' + first(owner) + ')';
    if (def.kind === 'relationship') return def.name + ' (' + first(pair[0]) + ' and ' + first(pair[1]) + ')';
    if (def.kind === 'captain') return def.name + ' (captain ' + first(owner) + ')';
    return def.name + ' (tactic)';
  }
  var MINE = {};   /* ids defined in this file */
  /* bookkeeping only (did this attack end in a finish?), not a component's reading */
  var FINISH_TAGS = { shot: 1, header: 1 };
  /* switches for content-d-check.js --prove: each breaks one rule */
  var BREAK = { limits: false, lone: false, striker: false, flank: false };
  /* m6: FIX.ggShot, the give and go reads a pass, not a shot (see D_GIVE_GO_BACK) */
  var FIX = { ggShot: !(typeof process !== 'undefined' && process.env && process.env.KM_RISKSTAR === 'off') };
  try { if (/[?&]riskstar=off\b/.test((root.location && root.location.search) || '')) FIX.ggShot = false; } catch (e) { }
  var TRACK = [
    { name: 'track', on: 'moment_start', run: function (e) { remember(e.st); } },
    { name: 'track', on: 'possession_start', run: function (e) {
      remember(e.st);
      var m = mem(e.st);
      if (m.poss === e.st.fx.scope.possession) return;
      m.poss = e.st.fx.scope.possession;
      m.uses = {}; m.last = null; m.shot = false; m.deep = false; m.cleanOn = {}; m.loose = null; m.notes = [];
    } },
    /* what a substitution took off a man: states he held (effects.js
     * substitute removes them before sub_in), for Takes over */
    { name: 'track', on: 'state_removed', run: function (e) {
      var m = mem(e.st), t = e.target;
      if (!t || !t.name || !t.id) return;
      if (e.st.fx.onPitch(t)) return;
      var list = m.removed[t.id] = m.removed[t.id] || [];
      if (!list.some(function (s) { return s.state === e.state; })) list.push({ state: e.state });
    } },
    { name: 'track', on: 'decision_end', run: function (e) {
      var st = e.st, m = mem(st);
      remember(st);
      if (m.dec === st.fx.scope.decision) return;
      m.dec = st.fx.scope.decision;
      /* hook uses: a record of one of this file's components on the chosen
       * option is written to the log at the pick (effects.js fired) */
      var seen = {};
      st.fx.evLines.forEach(function (l) {
        if (l.kind !== 'option' || seen[l.source]) return;
        var inst = st.fx.inst.filter(function (i) { return i.name === l.source && MINE[i.def.id]; })[0];
        if (!inst || !inst.def.capFields || inst.def.capFields.indexOf(l.field) < 0) return;
        seen[l.source] = 1;
        m.uses[l.source] = (m.uses[l.source] || 0) + 1;
        if (m.uses[l.source] === 2) m.notes.push({ name: l.source, inst: inst });
      });
      if (e.side === 'you') {
        if (typeof e.zone === 'number' && e.zone >= 2) m.deep = true;
        if ((e.tags || []).some(function (t) { return FINISH_TAGS[t]; })) m.shot = true;
        if (e.band === 'good' && e.actor) m.cleanOn[e.actor.id] = 1;
        var car = st.pending && st.pending.carrier ? st.pending.carrier : e.actor;
        m.last = { side: e.side, id: e.id, actor: e.actor, carrier: car, to: e.to, tags: e.tags, zone: e.zone, band: e.band, effect: e.effect, poss: st.fx.scope.possession };
      } else m.last = null;
    } }
  ];
  function define(d) {
    MINE[d.id] = 1;
    d.wave = 'w1d';
    d.effects = TRACK.concat(d.effects || []);
    return FX.define(d);
  }

  /* ================================================ composition */
  function roleOf(p) { return p && p.roles && p.roles.length ? p.roles[0] : null; }
  function kwOf(p) { return (p && p.kw) || []; }
  /* my instances of a component id that are acting now (owner on the pitch) */
  function actives(st, id) {
    return st.fx.inst.filter(function (i) { return i.def.id === id && (i.side || 'you') === 'you' && st.fx.active(i); });
  }
  function holds(st, p, id) {
    return actives(st, id).some(function (i) { return i.owner.player === p; });
  }
  function holders(st, id) {
    return actives(st, id).filter(function (i) { return i.owner.kind === 'player'; }).map(function (i) { return i.owner.player; });
  }
  function tacticOn(st, id) { return actives(st, id).some(function (i) { return i.owner.kind === 'team'; }); }
  /* Takes over: the man who came on counts as the man he replaced */
  function asOf(st, p) { var m = mem(st); return (m.as[p.id]) || p; }
  function outfield(st) { return st.squad.players.slice(); }
  /* a STRIKER: a Poacher or Target man keyword, or the finisher or target
   * man role */
  function isStriker(st, p) {
    var a = asOf(st, p), k = kwOf(a), r = roleOf(a);
    return k.indexOf('POACHER') >= 0 || k.indexOf('TARGET') >= 0 || r === 'finisher' || r === 'target man';
  }
  /* a RUNNER: a midfielder whose job is to arrive in their box (the runner
   * role, the Late run keyword, or Box to box) */
  function isRunner(st, p) {
    var a = asOf(st, p);
    return p.line === 1 && (roleOf(a) === 'runner' || kwOf(a).indexOf('LATE_RUN') >= 0 || holds(st, p, 'D_BOX_TO_BOX'));
  }
  /* a BODY in their box: a runner, a finisher or target man (role or
   * keyword), or Box to box. Wingers and playmakers stay out of it. */
  function isBody(st, p) {
    var a = asOf(st, p), r = roleOf(a), k = kwOf(a);
    return isRunner(st, p) || r === 'finisher' || r === 'target man' || k.indexOf('POACHER') >= 0 || k.indexOf('TARGET') >= 0 ||
      holds(st, p, 'D_BOX_TO_BOX');
  }
  /* an AERIAL threat: a midfielder or forward 1.85 metres or taller, the
   * target man role, or Box to box */
  function isAerial(st, p) {
    return p.line >= 1 && ((p.heightM || 0) >= 1.85 || roleOf(asOf(st, p)) === 'target man' || holds(st, p, 'D_BOX_TO_BOX'));
  }
  function count(st, f) { return outfield(st).filter(function (p) { return f(st, p); }).length; }
  function noStriker(st) { return BREAK.striker || !outfield(st).some(function (p) { return isStriker(st, p); }); }
  function bestBy(list, attr) {
    return list.slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null;
  }
  function names(list) {
    var n = list.map(first);
    return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }

  /* ================================================ limits */
  /* NO BALANCE CAPS (the designer's steer, 2026-09-25: make a strong thing
   * rare, never trim its numbers). Nothing here is once an attack: each
   * effect acts every time its condition holds, and the condition is what
   * makes it rare or common. What bounds a chain is the engine (an attack's
   * decisions, MAX_DEPTH, MAX_FIRES, EXTRA_MAX, FREE_MAX) and the football
   * (a loose ball needs a half-won finish; an attack ends). Kept: the
   * counting below, which the log and the check use; a cap only for a
   * safety test (content-d-check --break limits sets one to show it is
   * not needed). */
  function capOf(st, def, owner, pair) { return BREAK.limits ? 1 : Infinity; }
  function usedOf(st, def, owner, pair) { return mem(st).uses[nameOf(def, owner, pair)] || 0; }
  function canUse(st, def, owner, pair) { return usedOf(st, def, owner, pair) < capOf(st, def, owner, pair); }
  /* a second use this attack says why it was allowed */
  function why2() { return ''; }
  /* an event effect's use */
  function useEv(e, def) {
    var m = mem(e.st), nm = nameOf(def, e.owner, e.pair);
    m.uses[nm] = (m.uses[nm] || 0) + 1;
    if (m.uses[nm] === 2) m.notes.push({ name: nm, inst: null, def: def });
  }
  function canEv(e, def) { return canUse(e.st, def, e.owner, e.pair); }
  /* whose attack is being built: their counter's first decision */
  function counterNow(st) { return !!(st.chain && st.chain.next === 'counter'); }
  function zoneNow(st) { return st.pending && typeof st.pending.zoneIndex === 'number' ? st.pending.zoneIndex : null; }
  /* an edge for the next decision is "unmarked": +2 to his shot, the engine's
   * own size for unmarked (options.js CARRY) */
  function unmark(e, p, why, dur) {
    if (!e.hasState('unmarked', p)) e.addState('unmarked', p, { duration: dur || 'possession' }, why);
    e.addEdge({ n: 2, tags: ['shot'], man: p, why: first(p) + ' is unmarked' }, first(p) + ' is unmarked');
  }
  function isOurs(st, p) { return !!p && st.squad.players.indexOf(p) >= 0; }

  /* ============================================================ NO STRIKER */

  /* a midfielder's shot in their box, with no striker on the pitch */
  function nsShot(q) {
    var st = stOf(q);
    return !!st && q.side === 'you' && q.zone === 3 && q.has('shot') && !!q.actor && q.actor.line === 1 && noStriker(st);
  }
  var NO_STRIKER = define({
    id: 'D_NO_STRIKER', name: 'No striker', kind: 'tactic', system: 'S07 Squad composition',
    archetypes: ['No striker'], changes: ['opponent_state', 'recipient', 'outcome_tier'], reads: ['composition', 'role', 'keyword'],
    text: 'Only while nobody in your eleven is a striker (a Poacher or Target man, or the finisher or target man role). Their defenders learn nothing from your midfielders at the edge of their box or in it; a cut-back meant for a forward goes to your best finisher arriving from midfield; and a midfielder\'s shot in their box is unmarked (+2) and needs only 3 for a clean win, not 4. With a striker on the pitch it does nothing.',
    effects: [
      { name: 'learn', hook: 'learn', when: function (q) {
          var st = q.actor && STP.get(q.actor);
          return !!st && q.actor.line === 1 && zoneNow(st) >= 2 && noStriker(st);
        },
        apply: function (q) { q.forget('nobody is marking a midfielder who arrives late: they learn nothing from ' + first(q.actor) + '\'s move'); } },
      { name: 'route', hook: 'option', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && q.zone === 2 && q.has('cut-back') && !!q.to && q.to.line === 2 && noStriker(st);
        },
        apply: function (q) {
          var st = stOf(q);
          var mids = outfield(st).filter(function (p) { return p.line === 1 && p !== q.actor; });
          var r = bestBy(mids.filter(function (p) { return isRunner(st, p); }), 'finishing') || bestBy(mids, 'finishing');
          if (!r) return;
          q.setRecipient(r, 'with no striker their centre-backs stay with your forwards, so the cut-back goes to ' + first(r) + ', arriving from midfield');
          q.grant('good', { n: 2, tags: ['shot'], man: r, why: first(r) + ' arrives unmarked' }, first(r) + ' arrives unmarked');
        } },
      { name: 'free', hook: 'stat', when: function (q) { return nsShot(q); },
        apply: function (q) { q.stat(2, 'unmarked: with no striker their centre-backs have nobody to pick up'); } },
      { name: 'finish', hook: 'duel', when: function (q) { return nsShot(q); },
        apply: function (q) { q.threshold(3, 'nobody picked up ' + first(q.actor) + '\'s run from midfield: a clean win needs 3, not 4'); } }
    ]
  });

  var RUNNERS = define({
    id: 'D_RUNNERS', name: 'Runners from deep', kind: 'tactic', system: 'S07 Squad composition',
    archetypes: ['No striker', 'Chaos in the box'], changes: ['option_availability', 'outcome_tier', 'odds'], reads: ['composition', 'role'],
    text: 'Counts your runners (midfielders with the runner role, the Late run keyword or Box to box). With two or more: at the edge of their box you can wait for one of them to arrive late (a new option), but their midfield has room when they attack (+1 to their man in midfield). With three or more: they cannot track them all, so a half win on a late run counts as a clean one.',
    effects: [
      { name: 'three', hook: 'duel', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && q.has('late run') && count(st, isRunner) >= 3;
        },
        apply: function (q) { q.tier('mixed', 'good', 'three runners from midfield: they cannot track them all, so a half win on the run still gets him the ball'); } },
      { name: 'room', hook: 'stat', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'them' && q.tzone === 0 && count(st, isRunner) >= 2;
        },
        apply: function (q) { q.theirStat(1, 'your runners are up the pitch, so their midfielder has room'); } }
    ],
    pool: [{ id: 'D_LATE_ARRIVAL', side: 'you', zones: [2], family: 'move', tags: ['late run', 'short pass', 'pass'],
      text: 'a runner from midfield arrives late',
      when: function (x, q) {
        var st = STS.get(q.squad);
        if (!st || count(st, isRunner) < 2) return false;
        var rs = outfield(st).filter(function (p) { return p !== x.actor && isRunner(st, p) && kwOf(p).indexOf('LATE_RUN') < 0; });
        var h = bestBy(rs, 'intelligence');
        var mids = x.opp.players.filter(function (p) { return p.line === 1; });
        var d = mids.slice().sort(function (a, b) { return (a.attr.intelligence || 0) - (b.attr.intelligence || 0); })[0];
        x._dh = h; x._dd = d;
        return !!h && !!d;
      },
      build: function (x, q) {
        var h = x._dh, d = x._dd;
        return {
          test: { mine: h, mineAttr: 'intelligence', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', to: h, tos: { mixed: x.actor }, grants: { good: [{ id: 'unmarked', man: h }] },
          does: {
            good: 'arrives late past {foil} and takes the pass from ' + first(x.actor) + ',',
            mixed: 'arrives with {foil} still next to him, so ' + first(x.actor) + ' keeps it',
            bad: 'is picked up by {foil}'
          },
          pays: 'probe',
          label: first(x.actor) + ' waits for ' + first(h) + ' to arrive late from midfield',
          read: first(h) + ' (Intelligence ' + h.attr.intelligence + ') against ' + first(d) + ' (Intelligence ' + d.attr.intelligence + '), the midfielder who should follow him. If ' +
            first(h) + ' gets away, he has the ball in their box, unmarked (+2 to his shot).'
        };
      } }]
  });

  var FALSE_NINE = define({
    id: 'D_FALSE_NINE', name: 'False nine', kind: 'trait', system: 'S02 Roles', specialist: true,
    archetypes: ['No striker'], changes: ['opponent_state'], reads: ['line', 'zone', 'recipient'],
    text: 'A forward who comes short, and a centre-back follows him out of their box. While he is on the pitch, each of your midfielders to get the ball at the edge of their box or in it (a pass to him, or his own late run; a half win is enough) finds the gap: he is unmarked for the rest of the attack (+2 to his shots in this attack). He is not a striker (give him the link player role).',
    effects: [
      { name: 'gap', on: 'decision_end',
        when: function (e) {
          return e.side === 'you' && (e.band === 'good' || e.band === 'mixed') && (e.zone === 2 || e.zone === 3) && e.effect !== 'goal' &&
            !e.has('shot') && !!e.to && e.to !== e.owner && e.to.line === 1 && isOurs(e.st, e.to) && canEv(e, FALSE_NINE);
        },
        run: function (e) {
          var w = why2(e.st, FALSE_NINE, e.owner, null);
          useEv(e, FALSE_NINE);
          unmark(e, e.to, 'the centre-back followed ' + first(e.owner) + ' short, so ' + first(e.to) + ' has space in front of him' + w);
        } }
    ]
  });

  var GHOST = define({
    id: 'D_GHOST', name: 'Ghost', kind: 'trait', system: 'S02 Roles',
    archetypes: ['No striker', 'The partnership'], changes: ['outcome_tier', 'consequence'], reads: ['state:unmarked'],
    text: 'A midfielder who is never where they look. When he is unmarked (from any source: a cut-back, a late run, a decoy, a false nine), his shot needs only 3 for a clean win, and a miss is a save, never a catch that starts their attack.',
    effects: [
      { name: 'clean', hook: 'duel', when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && q.hasState('unmarked', q.owner); },
        apply: function (q) {
          q.threshold(3, first(q.owner) + ' is unmarked and has time: a clean win needs 3, not 4');
          q.tier('bad', 'mixed', 'nobody is on him, so his worst shot is a save, not a catch');
        } }
    ]
  });

  var DECOY = define({
    id: 'D_DECOY', name: 'Decoy', kind: 'trait', system: 'S02 Roles', specialist: true,
    archetypes: ['No striker', 'Chaos in the box'], changes: ['opponent_state'], reads: ['zone', 'recipient'],
    text: 'His value is in NOT getting the ball. Every time a pass at the edge of their box or in it goes to someone else (a half win is enough), their centre-back was busy with him: the man who got it is unmarked for the rest of the attack (+2 to his shot).',
    effects: [
      { name: 'draw', on: 'decision_end',
        when: function (e) {
          return e.side === 'you' && (e.zone === 2 || e.zone === 3) && (e.band === 'good' || e.band === 'mixed') && e.effect !== 'goal' &&
            !!e.to && e.to !== e.owner && e.actor !== e.owner && e.to !== e.actor && isOurs(e.st, e.to) && e.has('pass') && canEv(e, DECOY);
        },
        run: function (e) {
          var w = why2(e.st, DECOY, e.owner, null);
          useEv(e, DECOY);
          unmark(e, e.to, 'their centre-back went with ' + first(e.owner) + ', so ' + first(e.to) + ' is on his own' + w);
        } }
    ]
  });

  var BOX_TO_BOX = define({
    id: 'D_BOX_TO_BOX', name: 'Box to box', kind: 'trait', system: 'S02 Roles',
    archetypes: ['No striker', 'Chaos in the box'], changes: ['cost', 'rule_exception'], reads: ['composition'],
    text: 'He does two jobs. He counts as a runner, a body in their box and a tall man in every count (Runners from deep, Bodies in the box, Height in numbers), whatever his role or height, and his runs into their half cost 6 less stamina.',
    effects: [
      { name: 'legs', hook: 'cost', when: function (q) {
          return q.side === 'you' && q.byOwner() && q.zone >= 1 && (q.has('late run') || q.has('carry') || q.has('dribble') || q.has('run in behind'));
        },
        apply: function (q) { q.costBy(-6, first(q.owner) + ' is box to box: this run costs 6 less stamina'); } },
      /* a bridge: every count reads it (isRunner, isBody, isAerial); it says
       * so on the first attack of each half, when a count uses it */
      { name: 'counts', on: 'possession_start', limit: { per: 'match', n: 2 },
        when: function (e) {
          var st = e.st;
          return e.side === 'you' && (tacticOn(st, 'D_RUNNERS') || tacticOn(st, 'D_BODIES') || tacticOn(st, 'D_HEIGHT')) &&
            (mem(st).b2b || 0) < (st.n >= 3 ? 2 : 1);
        },
        run: function (e) {
          var m = mem(e.st); m.b2b = (m.b2b || 0) + 1;
          e.note(first(e.owner) + ' counts as a runner, a body in their box and a tall man');
        } }
    ]
  });

  /* ======================================================= CHAOS IN THE BOX */

  /* who is first to a loose ball: a First to it man who can still use it,
   * otherwise the quickest body in their box */
  function looseTaker(st, not) {
    var h = holders(st, 'D_FIRST_TO_IT').filter(function (p) { return p !== not && canUse(st, FIRST_TO_IT, p, null); })[0];
    return h ? { p: h, named: false } : { p: bodyFor(st, not), named: true };
  }
  function bodyFor(st, not) {
    var list = outfield(st).filter(function (p) { return p !== not && isBody(st, p); });
    return bestBy(list, 'pace') || null;
  }
  var BODIES_NAME = 'Bodies in the box (tactic)';
  var BODIES = define({
    id: 'D_BODIES', name: 'Bodies in the box', kind: 'tactic', system: 'S06 Lines and flanks', capFields: ['branch'],
    archetypes: ['Chaos in the box'], changes: ['continuation', 'recipient', 'odds'], reads: ['composition', 'zone'],
    text: 'Counts your bodies in their box (runners, finishers, target men, Poachers, Box to box). With three: every shot or header that is only half won (saved, or wide) drops loose in their box and one of yours is first to it: the attack goes on, and his shots are +2 for the rest of the attack (the scramble). With four: a lost header drops loose too, but four men forward leave you short: their counter-attack starts with +1 against you.',
    effects: [
      { name: 'loose', hook: 'outcome',
        when: function (q) {
          var st = stOf(q);
          if (!st || q.side !== 'you' || !(q.has('shot') || q.has('header')) || !(q.zone === 3 || (q.zone === 2 && q.has('header')))) return false;
          var n = count(st, isBody);
          return n >= 3 && (!BREAK.limits || (mem(st).uses[BODIES_NAME] || 0) < 1);
        },
        apply: function (q) {
          var st = stOf(q), n = count(st, isBody), lt = looseTaker(st, q.actor), who = lt.p;
          if (!who) return;
          var mv = q.zone === 2 ? 1 : 0;
          ['mixed'].concat(n >= 4 && q.has('header') ? ['bad'] : []).forEach(function (band) {
            var ln = q.lines().filter(function (x) { return x.band === band && x.effect === 'nothing' && typeof x.move !== 'number'; })[0];
            /* a ball their keeper caught is not loose (their Cross catcher) */
            if (!ln || q.lines().some(function (x) { return x.band === band && x.caught; })) return;
            if (!ln) return;
            q.branch(band, { effect: 'ground', move: mv, to: who }, n + ' of yours in their box: the ball drops loose and your team keeps it' + (lt.named ? ', ' + first(who) + ' is first to it' : ''));
            q.grant(band, { n: 2, tags: ['shot'], man: who, why: 'a scramble in their box, their keeper is down' }, 'a scramble in their box');
          });
        } },
      { name: 'short', hook: 'stat', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'them' && counterNow(st) && count(st, isBody) >= 4;
        },
        apply: function (q) { q.theirStat(1, 'four of your men were in their box, so their counter has a man over'); } }
    ]
  });

  var HEIGHT = define({
    id: 'D_HEIGHT', name: 'Height in numbers', kind: 'tactic', system: 'S07 Squad composition',
    archetypes: ['Chaos in the box'], changes: ['outcome_tier'], reads: ['composition', 'height'],
    text: 'Counts your tall men in midfield and attack (1.85 metres or taller, the target man role, or Box to box). With two: a lost header counts as a half win (a second head gets to it). With three: a header needs only 3 for a clean win, not 4, since they cannot mark all three.',
    effects: [
      { name: 'air', hook: 'duel', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && q.has('header') && count(st, isAerial) >= 2;
        },
        apply: function (q) {
          var st = stOf(q), n = count(st, isAerial);
          q.tier('bad', 'mixed', n + ' tall men go up: a second head gets to it, so a lost header counts as a half win');
          if (n >= 3) q.threshold(3, 'they cannot mark ' + n + ' tall men: a clean win on the header needs 3, not 4');
        } }
    ]
  });

  var FIRST_TO_IT = define({
    id: 'D_FIRST_TO_IT', name: 'First to it', kind: 'trait', system: 'S02 Roles', specialist: true, capFields: ['to'],
    archetypes: ['Chaos in the box', 'Two halves'], changes: ['recipient', 'outcome_tier'], reads: ['continuation'],
    text: 'Every time a teammate\'s shot or header in their box leaves a loose ball that your team keeps (a rebound, or Bodies in the box), the ball falls to him, and his first shot after it needs only 3 for a clean win (their keeper is still on the ground). He needs someone else to make the loose ball.',
    effects: [
      { name: 'to', hook: 'outcome',
        when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && (q.has('shot') || q.has('header')) && q.actor !== q.owner && canUse(st, FIRST_TO_IT, q.owner, null);
        },
        apply: function (q) {
          var st = stOf(q), w = why2(st, FIRST_TO_IT, q.owner, null);
          ['mixed', 'bad'].forEach(function (band) {
            q.setTo(band, q.owner, first(q.owner) + ' is first to the loose ball' + w);
          });
        } },
      { name: 'mark', on: 'decision_end', when: function (e) {
          return e.side === 'you' && e.to === e.owner && e.actor !== e.owner && (e.has('shot') || e.has('header')) && e.effect === 'ground';
        },
        run: function (e) { mem(e.st).loose = e.owner; e.note(first(e.owner) + ' has the loose ball and their keeper is still down'); } },
      { name: 'finish', hook: 'duel', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && q.byOwner() && q.has('shot') && mem(st).loose === q.owner;
        },
        apply: function (q) { q.threshold(3, 'their keeper is still on the ground: a clean win needs 3, not 4'); } }
    ]
  });

  var SPECIALISTS = ['D_FALSE_NINE', 'D_DECOY', 'D_FIRST_TO_IT', 'D_FRESH_VS_TIRED'];
  function loneSpecialist(st, p) {
    return SPECIALISTS.some(function (id) {
      var hs = holders(st, id);
      return hs.indexOf(p) >= 0 && (hs.length === 1 || BREAK.lone);
    });
  }
  var LONE = define({
    id: 'D_LONE', name: 'Only one of him', kind: 'tactic', system: 'S07 Squad composition',
    archetypes: ['Chaos in the box', 'No striker'], changes: ['opponent_state'], reads: ['composition', 'component'],
    text: 'A man who is the ONLY one on the pitch with his specialist trait (False nine, Decoy, First to it, Fresh against tired) is the one they cannot plan for: their defenders learn nothing from any move of his. Give two men the same trait and neither gets it: one specialist they cannot read, or two of them and cover when one goes off.',
    effects: [
      { name: 'unread', hook: 'learn', when: function (q) {
          var st = q.actor && STP.get(q.actor);
          return !!st && loneSpecialist(st, q.actor);
        },
        apply: function (q) { q.forget(first(q.actor) + ' is the only one with his trait: they cannot plan for him, so they learn nothing from this'); } }
    ]
  });

  /* ============================================================ TWO HALVES */

  var WEAR = define({
    id: 'D_WEAR_DOWN', name: 'Wears them down', kind: 'trait', system: 'S08 The bench',
    archetypes: ['Two halves'], changes: ['opponent_state'], reads: ['zone', 'possession'],
    text: 'A forward who never stops running across their back line. While he is on the pitch, each attack of yours that reaches the edge of their box costs their defence 12 stamina, whoever has the ball ; a duel he wins cleanly costs them 5 more. A defence under 40 plays below its numbers, as yours does. The tiredness is THEIRS: it stays when he goes off, but nothing adds to it after that.',
    effects: [
      { name: 'runs', on: 'possession_end',
        when: function (e) { return e.side === 'you' && !!mem(e.st).deep; },
        run: function (e) { e.tire('def', 12, first(e.owner) + ' kept running across their back line all attack'); } },
      { name: 'duel', on: 'clean_win', when: function (e) { return e.side === 'you' && e.byOwner(); },
        run: function (e) { e.tire('def', 5, first(e.owner) + ' beat his man'); } }
    ]
  });

  var FRESH_POOL = [{ id: 'D_FRESH_RUN', side: 'you', zones: [1, 2], family: 'press', tags: ['through ball', 'run in behind', 'pass'],
    text: 'the ball in behind for the fresh man against a tired defence',
    when: function (x, q) {
      var st = STS.get(q.squad), me = q.owner;
      if (!st || !me || typeof me.subAt !== 'number' || me === x.actor || !st.fx.onPitch(me)) return false;
      if (st.fx.legsOf('them', 'def') >= 80) return false;
      var d = O().markerOf(x.opp, me, 0);
      x._fr = d;
      return !!d;
    },
    build: function (x, q) {
      var me = q.owner, d = x._fr, st = STS.get(q.squad), L = Math.round(st.fx.legsOf('them', 'def'));
      return {
        test: { mine: me, mineAttr: 'pace', theirs: d, theirsAttr: 'pace', fresh: true },
        risk: 'high', to: me, grants: { good: [{ id: 'unmarked', man: me }] },
        does: {
          good: 'runs away from {foil} and takes it from ' + first(x.actor) + ',',
          mixed: 'gets to it level with {foil},',
          bad: 'is beaten to it by {foil}'
        },
        pays: x.zone === 1 ? 'through' : 'advance', unlock: 'Fresh against tired: ' + first(me),
        label: first(x.actor) + ' plays it in behind for ' + first(me) + ', fresh against a tired defence',
        read: first(me) + ' came on at ' + me.subAt + ' minutes with fresh legs; their defence is down to ' + L +
          ' of 100 stamina, which slows ' + first(d) + '. If he gets away, he is through, unmarked.'
      };
    } }];

  var FRESH = define({
    id: 'D_FRESH_VS_TIRED', name: 'Fresh against tired', kind: 'trait', system: 'S08 The bench', specialist: true, capFields: ['tier'],
    archetypes: ['Two halves'], changes: ['outcome_tier'], reads: ['opponent_state:fatigued', 'substitution'],
    text: 'Only after he comes on. While their defence is under 80 stamina, the ball in behind for him is a new option (his fresh Pace against their tired legs; a clean one leaves him through and unmarked). While their defence is under 75 stamina, a half win by any of your players against their defence or their keeper counts as a clean win: they cannot cover his runs. On a fresh team he does nothing, so someone has to tire them first.',
    effects: [
      { name: 'fresh', hook: 'duel',
        when: function (q) {
          var st = stOf(q), me = q.owner;
          if (!st || q.side !== 'you' || !me || typeof me.subAt !== 'number' || !q.foil || !q.actor) return false;
          var ln = typeof q.foil.line === 'number' ? LINE[q.foil.line] : 'def';
          if (ln !== 'def') return false;
          return q.legsOf('them', 'def') < 75 && canUse(st, FRESH, me, null);
        },
        apply: function (q) {
          var st = stOf(q), me = q.owner;
          q.tier('mixed', 'good', first(me) + ' came on fresh and their defence is down to ' + Math.round(q.legsOf('them', 'def')) +
            ': they cannot cover his runs, so a half win against them counts as a clean win' + why2(st, FRESH, me, null));
        } }
    ],
    pool: FRESH_POOL
  });

  var TAKES_OVER = define({
    id: 'D_TAKES_OVER', name: 'Takes over', kind: 'trait', system: 'S08 The bench',
    archetypes: ['Two halves', 'No striker'], changes: ['rule_exception', 'timing'], reads: ['substitution', 'composition', 'state'],
    text: 'When he comes on, he takes over the job of the man he replaces: for every count (strikers, runners, bodies in the box) he counts as that man\'s role and keywords, so a Poacher coming on for a False nine does not switch No striker off. He also keeps what that man held when he went off (unmarked, in form).',
    effects: [
      { name: 'take', on: 'sub_in', when: function (e) { return e.player === e.owner && !!e.off && e.side !== 'them'; },
        run: function (e) {
          var m = mem(e.st), off = e.off;
          m.as[e.owner.id] = { roles: (off.roles || []).slice(), kw: (off.kw || []).slice(), name: off.name, id: off.id };
          var kept = (m.removed[off.id] || []).filter(function (s) { return s.state === 'unmarked' || s.state === 'in form'; });
          e.note(first(e.owner) + ' takes over ' + first(off) + '\'s job' + (roleOf(off) ? ' (' + roleOf(off) + ')' : '') + ' in every count');
          kept.forEach(function (s) { e.addState(s.state, e.owner, { duration: s.state === 'unmarked' ? 'possession' : 'match' }, first(e.owner) + ' keeps what ' + first(off) + ' had: ' + s.state); });
        } }
    ]
  });

  var PLAN = define({
    id: 'D_CHANGE_OF_PLAN', name: 'Change of plan', kind: 'tactic', system: 'S08 The bench',
    archetypes: ['Two halves'], changes: ['opponent_state', 'cost', 'timing'], reads: ['substitution', 'possession'],
    text: 'Two plans, and your first substitution switches from one to the other. Before it: an attack of yours that ends without a shot or header still costs their defence 8 stamina (they chased the ball). After it, while their defence is under 70 stamina: the first decision of each of your attacks does not use up one of its decisions. Switch too early and the second plan has nothing to feed on.',
    effects: [
      { name: 'switch', on: 'sub_in', when: function (e) { return e.side !== 'them' && !!e.off && mem(e.st).plan === 'before'; },
        run: function (e) { mem(e.st).plan = 'after'; e.note('the plan changes with ' + first(e.player) + ' on: from now on, while their defence is under 70, the first decision of each attack does not use up a decision'); } },
      { name: 'chase', on: 'possession_end',
        when: function (e) { return e.side === 'you' && mem(e.st).plan === 'before' && !mem(e.st).shot; },
        run: function (e) { e.tire('def', 8, 'the first plan: they chased the ball for a whole attack'); } },
      { name: 'quick', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && mem(st).plan === 'after' && mem(st).last === null && !q.has('substitution') && q.legsOf('them', 'def') < 70;
        },
        apply: function (q) { q.freeDecision('the second plan: their defence is down to ' + Math.round(q.legsOf('them', 'def')) + ', so the first decision of this attack does not use up one of its decisions'); } }
    ]
  });

  var EXIT = define({
    id: 'D_EXIT_GIFT', name: 'Leaves it all out there', kind: 'trait', system: 'S08 The bench',
    archetypes: ['Two halves'], changes: ['cost', 'opponent_state'], reads: ['substitution'],
    text: 'A departure effect. When he is substituted, his line gets 20 stamina back and their defence loses 8 more (he made them run to the end). Worth nothing if he stays on.',
    effects: [
      { name: 'exit', on: 'sub_out', limit: { per: 'match', n: 1 }, when: function (e) { return e.player === e.owner && e.side !== 'them'; },
        run: function (e) {
          var ln = typeof e.owner.line === 'number' ? LINE[e.owner.line] : (e.line || 'att');
          e.refund(ln, 20, first(e.owner) + ' leaves it all out there');
          e.tire('def', 8, first(e.owner) + ' made them run to the end');
        } }
    ]
  });

  /* ========================================================= THE PARTNERSHIP */

  function partnerOf(pair, p) { return pair[0] === p ? pair[1] : pair[1] === p ? pair[0] : null; }
  /* ONE LINK A MAN. A partnership is exclusive: a player already in one of
   * this file's links (earlier in the build's list) makes a later link that
   * names him do nothing. Which pairs to link, and with which kind of link,
   * is the choice. */
  function linkBlockedBy(st, def, pair) {
    var mine = st.fx.inst.filter(function (i) { return i.owner.kind === 'relationship' && MINE[i.def.id] && (i.side || 'you') === 'you'; });
    for (var k = 0; k < mine.length; k++) {
      var i = mine[k];
      if (i.def === def && ((i.owner.a === pair[0] && i.owner.b === pair[1]) || (i.owner.a === pair[1] && i.owner.b === pair[0]))) return null;
      if ([i.owner.a, i.owner.b].some(function (p) { return p === pair[0] || p === pair[1]; })) return i;
    }
    return null;
  }
  /* said once a match, at the first moment, so the build's choice is traceable */
  function linkNote(def) {
    return { name: 'blocked', on: 'moment_start', limit: { per: 'match', n: 1 },
      when: function (e) { return !!e.pair && !!linkBlockedBy(e.st, def, e.pair); },
      run: function (e) {
        var b = linkBlockedBy(e.st, def, e.pair), p = [b.owner.a, b.owner.b].filter(function (x) { return x === e.pair[0] || x === e.pair[1]; })[0];
        e.note(first(p) + ' is already in a link (' + b.name + '), and a man has one partner: this link does nothing');
      } };
  }
  var GIVE_GO = define({
    id: 'D_GIVE_AND_GO', name: 'Give and go', kind: 'relationship', system: 'S05 Links', capFields: ['create'],
    archetypes: ['The partnership'], changes: ['option_availability', 'state'], reads: ['sequence', 'link'],
    text: 'Right after one of the pair passes to the other (a half win is enough), the pass straight back is on the menu, as a pair option: the first man is already running past his man (+2), and a clean one leaves him unmarked.',
    effects: [],
    pool: [{ id: 'D_GIVE_GO_BACK', side: 'you', zones: [1, 2, 3], family: 'press', tags: ['one-two', 'short pass', 'pass'],
      text: 'the pass straight back to the man who gave it',
      when: function (x, q) {
        var st = STS.get(q.squad), pair = q.pair;
        if (!st || !pair || linkBlockedBy(st, GIVE_GO, pair)) return false;
        var m = mem(st), L = m.last, mate = partnerOf(pair, x.actor);
        if (!mate || !L || L.poss !== st.fx.scope.possession || L.carrier !== mate || L.to !== x.actor || !(L.band === 'good' || L.band === 'mixed')) return false;
        /* m6: a shot the keeper parries to the partner is not a pass to him
         * (content-d-check's "only right after a pass between the pair"
         * caught it once m6 left this card live: before, it was greyed for
         * risk in exactly that spot, after a placed shot) */
        var afterShot = (L.tags || []).some(function (t) { return FINISH_TAGS[t]; });
        if (FIX.ggShot && afterShot) return false;
        x._ggShot = afterShot;
        if (!x.foil || !st.fx.onPitch(mate) || !canUse(st, GIVE_GO, null, pair)) return false;
        x._gg = mate;
        return true;
      },
      build: function (x, q) {
        var mate = x._gg, st = STS.get(q.squad);
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'even', bonus: 2, because: first(mate) + ' is already running past his man', to: mate, ggAfterShot: !!x._ggShot,
          grants: { good: [{ id: 'unmarked', man: mate }] },
          does: {
            good: 'plays it straight back to ' + first(mate) + ', who is past {foil},',
            mixed: 'plays it back to ' + first(mate) + ', level with {foil},',
            bad: 'plays it back, and {foil} cuts it out'
          },
          pays: x.zone >= 3 ? 'hold' : 'advance', unlock: 'Give and go: ' + first(q.pair[0]) + ' and ' + first(q.pair[1]),
          label: first(x.actor) + ' gives it straight back to ' + first(mate) + why2(st, GIVE_GO, null, q.pair),
          read: first(x.actor) + ' (Passing ' + x.actor.attr.passing + ') against ' + first(x.foil) + ' (Intelligence ' + x.foil.attr.intelligence + '). ' +
            first(mate) + ' gave it and kept running: the return pass finds him ' + (x.zone >= 3 ? 'in their box, unmarked.' : 'a zone further on.')
        };
      } }]
  });

  /* when each link acts on an option (the captain reads the same rules) */
  function sameSideOn(st, q, pr) {
    if (!pr || q.side !== 'you' || !(q.actor === pr[0] || q.actor === pr[1]) || linkBlockedBy(st, SAME_SIDE, pr)) return false;
    var L = lane(q.actor);
    if (!BREAK.flank && (L === 1 || lane(pr[0]) !== L || lane(pr[1]) !== L)) return false;
    if (!(q.has('dribble') || q.has('carry') || q.has('overlap'))) return false;
    var mate = partnerOf(pr, q.actor);
    return !!mate && st.fx.onPitch(mate);
  }
  function looksForOn(st, q, pr) {
    if (!pr || q.side !== 'you' || !(q.actor === pr[0] || q.actor === pr[1]) || !q.to || q.zone === null || q.zone < 1 || linkBlockedBy(st, LOOKS_FOR, pr)) return false;
    if (!(q.has('cut-back') || q.has('through ball') || q.has('forward pass') || q.has('layoff') || q.has('low cross')) || q.to === q.actor) return false;
    var mate = partnerOf(pr, q.actor);
    return !!mate && mate !== q.to && st.fx.onPitch(mate) && mate.line >= q.actor.line;
  }
  var SAME_SIDE = define({
    id: 'D_SAME_SIDE', name: 'Same side', kind: 'relationship', system: 'S05 Links', capFields: ['tier'],
    archetypes: ['The partnership'], changes: ['outcome_tier'], reads: ['flank', 'link'],
    text: 'Only when the pair play on the same flank. Their man on that flank is two against one: when either of the pair runs at him or goes round him on that flank (a dribble, a run with the ball or an overlap), a half win counts as a clean win. Link a different pair and the flank it works on changes with it; link two men from different flanks and it does nothing.',
    effects: [
      { name: 'twoOnOne', hook: 'duel',
        when: function (q) { var st = stOf(q); return !!st && sameSideOn(st, q, q.pair) && canUse(st, SAME_SIDE, null, q.pair); },
        apply: function (q) {
          var st = stOf(q), mate = partnerOf(q.pair, q.actor);
          q.tier('mixed', 'good', first(mate) + ' is on the same flank, so ' + first(q.foil) + ' is two against one: a half win counts as a clean win' + why2(st, SAME_SIDE, null, q.pair));
        } }
    ]
  });

  var LOOKS_FOR = define({
    id: 'D_LOOKS_FOR', name: 'Looks for him', kind: 'relationship', system: 'S05 Links', capFields: ['recipient'],
    archetypes: ['The partnership', 'No striker'], changes: ['recipient'], reads: ['link'],
    text: 'When one of the pair plays a cut-back, a pass through, a forward pass, a layoff or a low cross to someone else, it goes to his partner instead if the partner is in the same line or ahead of him (a cut-back leaves him unmarked, +2 to his shots in this attack). It changes WHO gets the ball, not the odds of the pass: link him to a finisher and the ball finds the finisher.',
    effects: [
      { name: 'find', hook: 'option',
        when: function (q) { var st = stOf(q); return !!st && looksForOn(st, q, q.pair) && canUse(st, LOOKS_FOR, null, q.pair); },
        apply: function (q) {
          var st = stOf(q), mate = partnerOf(q.pair, q.actor);
          q.setRecipient(mate, first(q.actor) + ' looks for ' + first(mate) + ' first' + why2(st, LOOKS_FOR, null, q.pair));
          /* a cut-back leaves its man unmarked: the new man, not the old one */
          if (q.has('cut-back')) q.grant('good', { n: 2, tags: ['shot'], man: mate, why: first(mate) + ' arrives unmarked' }, first(mate) + ' arrives unmarked');
        } }
    ]
  });

  /* the captain's own links (his, not blocked) */
  function capLinks(st, c) {
    return st.fx.inst.filter(function (i) {
      return i.owner.kind === 'relationship' && MINE[i.def.id] && (i.side || 'you') === 'you' && (i.owner.a === c || i.owner.b === c) &&
        st.fx.active(i) && !linkBlockedBy(st, i.def, [i.owner.a, i.owner.b]);
    });
  }
  var LINK_CAPTAIN = define({
    id: 'D_LINK_CAPTAIN', name: 'Captain of the partnership', kind: 'captain', system: 'S04 Captaincy',
    archetypes: ['The partnership'], changes: ['repeat'], reads: ['link', 'captain'],
    text: 'Only if the captain is in one of your links: when his link acts on a duel of his own (Same side, Looks for him, Give and go), a loss counts as a half win (his partner is with him). Which pair he is linked to decides what gets doubled; a captain in no link does nothing. He never repeats a duel.',
    effects: [
      { name: 'cover', hook: 'duel', when: function (q) {
          var st = stOf(q), c = q.owner;
          if (!st || q.side !== 'you' || !c || q.actor !== c) return false;
          return capLinks(st, c).some(function (i) {
            var pr = [i.owner.a, i.owner.b];
            if (i.def === SAME_SIDE) return sameSideOn(st, q, pr) && canUse(st, SAME_SIDE, null, pr);
            if (i.def === LOOKS_FOR) return looksForOn(st, q, pr) && canUse(st, LOOKS_FOR, null, pr);
            return false;
          }) || (q.id === 'D_GIVE_GO_BACK' && capLinks(st, c).some(function (i) { return i.def === GIVE_GO && (q.actor === i.owner.a || q.actor === i.owner.b); }));
        },
        apply: function (q) { q.tier('bad', 'mixed', 'the captain leads the partnership: when he goes, his partner is with him, so a loss counts as a half win'); } }
    ]
  });

  /* the one-link-a-man note on each link (added after define: it needs the
   * component itself; moment_start is a known event) */
  [GIVE_GO, SAME_SIDE, LOOKS_FOR].forEach(function (d) { d.effects.push(linkNote(d)); });

  /* ========================================================= REST DEFENCE */

  var REST = define({
    id: 'D_REST_DEFENCE', name: 'Rest defence', kind: 'tactic', system: 'S06 Lines and flanks',
    archetypes: ['Hard to play against'], changes: ['outcome_tier'], reads: ['composition', 'counter'],
    text: 'Only with two or fewer bodies in their box (runners, finishers, target men, Poachers, Box to box). On the first decision of their counter-attack your men are already back: a lost duel counts as a half win. The opposite of Bodies in the box: the more men you send, the less it does.',
    effects: [
      { name: 'back', hook: 'duel', when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'them' && counterNow(st) && count(st, isBody) <= 2;
        },
        apply: function (q) {
          var st = stOf(q);
          q.tier('bad', 'mixed', 'only ' + count(st, isBody) + ' of yours went forward, so your men are back in time: a lost duel counts as a half win');
        } }
    ]
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loaded: true, isStriker: isStriker, isRunner: isRunner, isBody: isBody, isAerial: isAerial, count: count,
      noStriker: noStriker, mem: mem, capOf: capOf, MINE: MINE, _break: BREAK, _fix: FIX };
  }
})(typeof window !== 'undefined' ? window : globalThis);
