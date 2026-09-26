/* CONTENT B (wave 1b of the kmtree3 build-emergence run).
 *
 * Components built on EVENT TRIGGERS, the RESOURCE ECONOMY (stamina,
 * decisions, limited uses), OUTCOME TIERS, AMPLIFICATION (captaincy) and
 * GROWTH WITHIN THE MATCH, for five archetypes from the catalogue:
 *
 *   Win it straight back   clean recoveries: a tier upgrade feeds an option
 *                          that exists only after a clean recovery
 *   The captain's engine   the captain repeats a teammate's refund, or lets a
 *                          once-a-moment trait work once more (bounded)
 *   The metronome          sequence and timing: variety, an unbroken run of
 *                          clean wins, a striker who must be untouched
 *   Grows into the match   growth owned by a player, a link or the team
 *   The foul factory       productive failure: fouls won become free kicks,
 *                          and the free-kick menu has routines
 *
 * Every component is a general rule read through tags, states and events:
 * no component names another, no option id outside its own. Each change goes
 * through an effects-layer helper, so it is named on the card before the pick
 * and in the log when it fires (w0 traceability). Every repeat, refund,
 * growth and extra decision has a cap (content-b-check.js proves each one).
 *
 * Memory that is not a match change (what happened earlier in this attack)
 * lives in MEM, keyed by the squad, and is only ever read by the hooks.
 * Plain English, no dashes.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  var LK = ['def', 'mid', 'att'];
  var LW = { def: 'defence', mid: 'midfield', att: 'attack' };
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function best(list, attr, low) {
    var s = list.filter(Boolean).slice().sort(function (a, b) {
      var d = ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0);
      return low ? -d : d;
    });
    return s[0] || null;
  }
  function lineOf(p) { return p && typeof p.line === 'number' ? LK[p.line] : null; }
  function has(tags, list) { return list.some(function (t) { return (tags || []).indexOf(t) >= 0; }); }
  var RUNS = ['dribble', 'carry'];
  var TACKLES = ['tackle', 'press', 'interception', 'double team'];

  /* ------------------------------------------------------ memory */
  var MEM = new WeakMap(), SQUAD_OF = new WeakMap();
  function mem(squad) {
    var m = MEM.get(squad);
    if (!m) {
      (squad.players || []).concat(squad.keeper ? [squad.keeper] : []).forEach(function (p) { SQUAD_OF.set(p, squad); });
      m = { mom: -1, at: -1, poss: [], streak: 0, conf: {}, chem: {}, drib: {}, tempo: 0, box: false,
        seen: {}, fouler: null, leads: 0, stdMom: -1, encore: {} };
      MEM.set(squad, m);
    }
    return m;
  }
  /* what kind of play a decision was (The metronome counts kinds) */
  function kindOf(t) {
    if (has(t, ['shot'])) return 'shot';
    if (has(t, ['cross', 'low cross', 'cut-back', 'pull-back'])) return 'wide';
    if (has(t, ['dribble', 'carry', 'overlap'])) return 'run';
    if (has(t, ['through ball', 'long ball', 'switch', 'run in behind', 'forward pass'])) return 'forward';
    if (has(t, ['back pass', 'recycle'])) return 'back';
    if (has(t, ['short pass', 'layoff', 'one-two', 'square ball', 'pass'])) return 'short';
    return null;
  }
  var KIND_WORD = { short: 'a short pass', forward: 'a ball forward', run: 'a run with the ball', wide: 'a cross or cut-back' };
  /* The tracker. Every component that reads the history of this attack
   * carries these two effects; their `when` records and never fires, so they
   * change nothing and write nothing. A new moment starts a new history
   * (each of your attacks is a moment: w0 EFFECTS.md). */
  var TRACK = [
    { name: 'track:moment', on: 'moment_start', when: function (e) {
      var m = mem(e.st.squad), sc = e.st.fx.scope.moment;
      if (m.mom !== sc) { m.mom = sc; m.poss = []; m.streak = 0; m.box = false; }
      return false;
    }, run: function () { } },
    { name: 'track:decision', on: 'decision_end', when: function (e) { record(e); return false; }, run: function () { } }
  ];
  function record(e) {
    var m = mem(e.st.squad), at = e.st.log.length;
    if (m.at === at) return m;
    m.at = at;
    if (e.side !== 'you') return m;
    var k = kindOf(e.tags);
    m.poss.push({ actor: e.actor, to: e.to, tags: e.tags, band: e.band, kind: k, zone: e.zone, id: e.id });
    m.streak = e.band === 'good' ? m.streak + 1 : 0;
    if (e.zone === 3 || k === 'shot') m.box = true;
    return m;
  }
  function kinds(m) {
    var k = {};
    m.poss.forEach(function (d) { if (d.kind && d.kind !== 'shot' && d.kind !== 'back' && d.band !== 'bad') k[d.kind] = 1; });
    return Object.keys(k);
  }
  function touchedEarlier(m, p) { return m.poss.some(function (d) { return d.actor === p && d.kind !== 'shot'; }); }
  function capInst(st, id) { return (st.fx.inst.filter(function (i) { return i.owner.kind === 'captain' && i.def.id === id; })[0]) || null; }
  function attackGoesOn(st) { return !!(st.chain && st.chain.next === 'zone'); }

  /* GROWTH. One function for every growth track, so its caps and the
   * captain's "Sets the standard" apply the same way to each. Growth is
   * owned by a player (confidence, the earned option), a link (chemistry)
   * or the team (tempo), and says so in the log. */
  function grow(e, track, key, by, cap, say) {
    var m = mem(e.st.squad), cur = m[track][key] || 0;
    if (track === 'tempo') cur = m.tempo;
    if (cur >= cap && by > 0) return cur;
    var nv = Math.max(0, Math.min(cap, cur + by));
    if (nv === cur) return cur;
    if (track === 'tempo') m.tempo = nv; else m[track][key] = nv;
    e.note(say(nv));
    var ci = by > 0 && track !== 'drib' ? capInst(e.st, 'CAP_STANDARD') : null;
    if (ci && nv < cap && m.stdMom !== e.st.fx.scope.moment) {
      m.stdMom = e.st.fx.scope.moment;
      nv = nv + 1;
      if (track === 'tempo') m.tempo = nv; else m[track][key] = nv;
      e.st.fx.write(ci.name, 'he sets the standard, so it grows by one more: ' + say(nv), 'event', 'growth');
    }
    return nv;
  }
  function level(squad, track, key) { var m = mem(squad); return track === 'tempo' ? m.tempo : (m[track][key] || 0); }
  function pairKey(a, b) { return [a.id, b.id].sort().join('+'); }

  /* ================================================ A. WIN IT STRAIGHT BACK */

  FX.define({
    id: 'WB_COUNTERPRESS', name: 'Win it straight back', kind: 'tactic',
    text: 'When you lose the ball going forward, the first decision of their counter offers a press by your presser (a player with that role in midfield or attack; otherwise your midfielder or attacker with the best Defending): his Defending against their man\'s Technique, with +3 because their man has not turned yet and two of yours close him down, costing that line 16 stamina. A clean win wins the ball back and your attack starts again; lose it and he is left behind.',
    effects: [
      { name: 'legs', hook: 'cost', when: function (q) { return q.id === 'FXB_COUNTERPRESS'; },
        apply: function (q) { q.costBy(11, 'pressing is running: 16 stamina in all'); } }
    ],
    pool: [{
      id: 'FXB_COUNTERPRESS', side: 'them', tzones: [0, 1], family: 'press', tags: ['press', 'tackle'],
      text: 'the attack presses straight away after losing the ball',
      when: function (x, q) {
        if (!x.counter || !x.foil) return false;
        x._fxbP = q.roles('presser').filter(function (p) { return p.line >= 1; })[0] ||
          best(q.squad.players.filter(function (p) { return p.line >= 1; }), 'defending');
        return !!x._fxbP;
      },
      build: function (x) {
        var h = x._fxbP, wz = x.tzone === 0 ? 2 : 1;
        return {
          test: { mine: h, mineAttr: 'defending', theirs: x.foil, theirsAttr: 'technique' },
          bonus: 3, because: first(x.foil) + ' has just won it, has not turned yet, and two of yours close him down',
          risk: 'even', to: h, pays: 'twin', winZone: wz, counterWin: true, unlock: 'Win it straight back: ' + first(h),
          does: { good: 'closes {foil} down at once and wins it back', mixed: 'closes {foil} down, and he has to go back', bad: 'goes in, and {foil} is past him' },
          label: first(h) + ' presses ' + first(x.foil) + ' the moment you lose it',
          read: first(h) + ' (Defending ' + h.attr.defending + ') against ' + first(x.foil) + ' (Technique ' + x.foil.attr.technique + '). Their players are just turning to run. A clean win wins the ball back and your attack starts again; lose it and ' + first(h) + ' is left behind.'
        };
      }
    }]
  });

  FX.define({
    id: 'WB_CLEAN_TACKLER', name: 'Clean tackler', kind: 'trait',
    text: 'On their attack, a half win on his tackle, press or interception counts as a clean win (at most once in each of their attacks).',
    effects: [
      { name: 'tier', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'them' && q.byOwner() && has(q.tags, TACKLES); },
        apply: function (q) { q.tier('mixed', 'good', 'he takes the ball cleanly: a half win counts as a clean win'); } }
    ]
  });

  FX.define({
    id: 'WB_BREATHES', name: 'Breathes again', kind: 'trait',
    text: 'When he wins the ball back cleanly, his line gets 10 stamina back (once in each of their attacks).',
    effects: [
      { name: 'refund', on: 'recovery', limit: { per: 'possession', n: 1 },
        when: function (e) { return e.byOwner() && e.band === 'good' && !!lineOf(e.owner); },
        run: function (e) { e.refund(lineOf(e.owner), 10, first(e.owner) + ' won it back cleanly and the ' + LW[lineOf(e.owner)] + ' can breathe again'); } }
    ]
  });

  FX.define({
    id: 'WB_GONE', name: 'Gone before they turn', kind: 'trait',
    text: 'When your team wins the ball back cleanly, their players are still going forward: in that attack he can be sent through at once (his Pace against their slowest defender; a clean win puts him through on goal in their box, a half win at the edge of it). The option exists only in that attack.',
    effects: [
      { name: 'caught', on: 'recovery', when: function (e) { return e.band === 'good'; },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'decision' }, 'their players were going forward when you won it cleanly: their defence is stretched for this attack'); } }
    ],
    pool: [{
      id: 'FXB_GONE', side: 'you', zones: [0, 1, 2], family: 'press', tags: ['run in behind', 'long ball', 'through ball', 'pass'],
      text: 'he runs the moment the ball is won back cleanly',
      when: function (x, q) {
        if (!q.owner || x.actor === q.owner || !q.hasState('stretched', 'opponent')) return false;
        x._fxbSlow = best(q.opp.players.filter(function (p) { return p.line === 0; }), 'pace', true);
        return !!x._fxbSlow && !!x.actor;
      },
      build: function (x, q) {
        var r = q.owner, d = x._fxbSlow;
        return {
          test: { mine: r, mineAttr: 'pace', theirs: d, theirsAttr: 'pace' },
          risk: 'high', to: r, pays: 'through', grants: { good: [{ id: 'through', man: r }] },
          unlock: 'Gone before they turn: ' + first(r), counterWin: true,
          table: {
            good: ' and your team has the ball in their box.', mixed: ', and your team has the ball at the edge of their box.',
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: 'ground', mixed: 'ground', bad: 'break' }, move: { good: 3 - x.zone, mixed: Math.max(0, 2 - x.zone) }
          },
          does: { good: 'is away from ' + first(d) + ' before their players turn', mixed: 'gets to it first but ' + first(d) + ' recovers', bad: 'is caught by {foil}' },
          label: first(x.actor) + ' plays it straight over the top for ' + first(r) + ' to chase',
          read: first(r) + ' (Pace ' + r.attr.pace + ') against ' + first(d) + ' (Pace ' + d.attr.pace + '), their slowest defender, while their players are still going forward. A clean win puts ' + first(r) + ' through on goal in their box (+2 to his shot); a half win still gets the ball to the edge of their box.'
        };
      }
    }]
  });

  /* ================================================== B. THE CAPTAIN'S ENGINE */

  FX.define({
    id: 'EC_PAY_WITH_LEGS', name: 'Pay with legs', kind: 'tactic',
    text: 'Twice in each of your attacks, a short pass by a midfielder or attacker whose line is not tired (40 stamina or more) does not use up one of the attack\'s decisions; it costs his line 10 more stamina instead.',
    effects: [
      { name: 'exchange', hook: 'cost', limit: { per: 'possession', n: 2 },
        when: function (q) { return q.side === 'you' && typeof q.zone === 'number' && q.actor && q.actor.line >= 1 && q.has('short pass') && !q.has('back pass') && !q.has('recycle') && !q.hasState('fatigued', q.actor); },
        apply: function (q) {
          q.freeDecision('he pays with his legs: this pass does not use up a decision');
          q.costBy(10, 'and it costs his line 10 more stamina');
        } }
    ]
  });

  FX.define({
    id: 'LK_COVERS', name: 'Covers for him', kind: 'relationship',
    text: 'When either of the pair spends stamina, the other one\'s line pays half of it. It only changes anything when they play in different lines.',
    effects: [
      { name: 'share', on: 'stamina_spent', limit: { per: 'decision', n: 1 },
        when: function (e) {
          if (!e.byPair() || e.amount < 2) return false;
          var other = e.actor === e.pair[0] ? e.pair[1] : e.pair[0];
          return lineOf(other) && lineOf(other) !== e.line;
        },
        run: function (e) {
          var other = e.actor === e.pair[0] ? e.pair[1] : e.pair[0], half = Math.floor(e.amount / 2), ol = lineOf(other);
          var got = e.refund(e.line, half, first(other) + ' covers for ' + first(e.actor));
          if (got) e.spend(ol, got, first(other) + '\'s ' + LW[ol] + ' pays half');
        } }
    ]
  });

  FX.define({
    id: 'TR_SECOND_WIND', name: 'Second wind', kind: 'trait',
    text: 'When his line is tiring (under 60 stamina), his first clean win in each moment gives his line 12 stamina back.',
    effects: [
      { name: 'refund', on: 'clean_win', limit: { per: 'moment', n: 1 },
        when: function (e) { return e.byOwner() && !!lineOf(e.owner) && e.st.fx.legs()[lineOf(e.owner)] < 60; },
        run: function (e) { e.refund(lineOf(e.owner), 12, first(e.owner) + ' finds a second wind'); } }
    ]
  });

  FX.define({
    id: 'CAP_LEADS', name: 'Leads by example', kind: 'captain',
    text: 'Once in each moment, and at most three times a match, when a teammate\'s trait or link gives a line stamina back, the captain gives that line the same again. He never repeats a duel, a shot or a tackle, nor his own refund.',
    effects: [
      { name: 'repeat', on: 'stamina_refunded', fromEffects: true, limit: { per: 'moment', n: 1 },
        when: function (e) {
          if (!e.fromEffect || !e.by || /\((tactic|captain )/.test(e.by)) return false;
          return mem(e.st.squad).leads < 3;
        },
        run: function (e) {
          var m = mem(e.st.squad);
          m.leads++;
          e.refund(e.line, e.amount, 'the captain leads by example and does that running again (' + m.leads + ' of 3 this match)');
        } }
    ]
  });

  FX.define({
    id: 'CAP_ENCORE', name: 'Once more', kind: 'captain',
    text: 'Once in each half, when a teammate\'s trait or link uses up an ability it has once a moment or once an attack, and the play goes on, the captain lets it work once more.',
    effects: [
      { name: 'encore', on: 'decision_end',
        when: function (e) {
          var st = e.st, fx = st.fx, m = mem(st.squad), half = st.n < 3 ? 1 : 2;
          e._fxbCand = null;
          if (m.encore[half] || !st.chain) return false;
          var at = st.log.length, srcs = {};
          fx.log.forEach(function (l) { if (l.at === at && l.kind !== 'expire' && l.kind !== 'limit') srcs[l.source] = 1; });
          fx.inst.forEach(function (inst) {
            if (e._fxbCand || !srcs[inst.name] || (inst.owner.kind !== 'player' && inst.owner.kind !== 'relationship')) return;
            (inst.def.effects || []).forEach(function (eff, k) {
              if (e._fxbCand || !eff.limit || (eff.limit.per !== 'moment' && eff.limit.per !== 'possession')) return;
              var key = inst.i + ':' + k + ':' + eff.limit.per + ':' + fx.scope[eff.limit.per];
              if ((fx.counts[key] || 0) >= eff.limit.n) e._fxbCand = { key: key, name: inst.name };
            });
          });
          return !!e._fxbCand;
        },
        run: function (e) {
          var st = e.st, m = mem(st.squad), half = st.n < 3 ? 1 : 2, c = e._fxbCand;
          m.encore[half] = 1;
          st.fx.counts[c.key] = Math.max(0, (st.fx.counts[c.key] || 1) - 1);
          e.note('the captain asks for it once more: ' + c.name + ' can work again (his once this half)');
        } }
    ]
  });

  /* ======================================================= C. THE METRONOME */

  FX.define({
    id: 'SE_VARIETY', name: 'Mix it up', kind: 'tactic',
    text: 'If your attack has already used two different kinds of play (a short pass, a ball forward, a run with the ball, a cross or cut-back) before a shot, the shot needs only 3, not 4, for a clean win. With three different kinds their keeper also learns nothing from it.',
    effects: TRACK.concat([
      { name: 'threshold', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.has('shot') && kinds(mem(q.squad)).length >= 2; },
        apply: function (q) { q.threshold(3, kinds(mem(q.squad)).length + ' different kinds of play before it (' + kinds(mem(q.squad)).map(function (k) { return KIND_WORD[k]; }).join(', ') + '): a clean win needs 3'); } },
      { name: 'learn', hook: 'learn',
        when: function (q) { var sq = q.actor && SQUAD_OF.get(q.actor); return !!sq && q.has('shot') && kinds(mem(sq)).length >= 3; },
        apply: function (q) { q.forget('three different kinds of play before it: their keeper did not see it coming and learns nothing from this shot'); } }
    ])
  });

  FX.define({
    id: 'SE_RHYTHM', name: 'Rhythm', kind: 'tactic',
    text: 'After two clean wins in a row in one attack, the attack gets one more decision (once an attack). A half win or a loss breaks the run.',
    effects: TRACK.concat([
      { name: 'extra', on: 'decision_end', limit: { per: 'possession', n: 1 },
        when: function (e) { return e.side === 'you' && record(e).streak >= 2 && attackGoesOn(e.st); },
        run: function (e) { e.extraDecision('two clean wins in a row: the attack has rhythm and gets one more decision'); } }
    ])
  });

  FX.define({
    id: 'SE_FRESH_FEET', name: 'Fresh feet', kind: 'trait',
    text: 'If he has not passed or run with the ball earlier in this attack, his shot needs only 3, not 4, for a clean win. If he has, his timing is gone: -1 to his shot.',
    effects: TRACK.concat([
      { name: 'fresh', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && !touchedEarlier(mem(q.squad), q.owner); },
        apply: function (q) { q.threshold(3, 'he has not touched the ball in this attack: a clean win on his shot needs 3'); } },
      { name: 'stale', hook: 'stat',
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && touchedEarlier(mem(q.squad), q.owner); },
        apply: function (q) { q.stat(-1, 'he has already been on the ball in this attack, so his timing is gone'); } }
    ])
  });

  FX.define({
    id: 'RO_SETS_PACE', name: 'Sets the pace', kind: 'trait',
    text: 'His first short pass in each attack does not use up one of the attack\'s decisions.',
    effects: [
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('short pass') && !q.has('back pass'); },
        apply: function (q) { q.freeDecision('he sets the pace: his first short pass in this attack does not use up a decision'); } }
    ]
  });

  FX.define({
    id: 'LK_KNOWS_RUN', name: 'Knows his run', kind: 'relationship',
    text: 'Once in each attack, a pass from one of the pair to the other cannot be lost: a loss counts as a half win. A half win still breaks Rhythm.',
    effects: [
      { name: 'safe', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) {
          if (q.side !== 'you' || !q.byPair() || !q.has('pass')) return false;
          var other = q.actor === q.pair[0] ? q.pair[1] : q.pair[0];
          return q.to === other;
        },
        apply: function (q) { q.tier('bad', 'mixed', 'they know each other\'s runs: a loss on this pass counts as a half win'); } }
    ]
  });

  /* ============================================== D. GROWS INTO THE MATCH */

  FX.define({
    id: 'GR_CONFIDENCE', name: 'Grows into it', kind: 'tactic',
    text: 'Each clean win gives that player 1 confidence (at most 3, his for the whole match); each loss takes 1 away. At 2 he is in form: twice a match (for the whole team), a half win on a run with the ball by a player in form counts as a clean win. At 3 he rolls two dice on his shots and keeps the higher.',
    effects: [
      { name: 'gain', on: 'clean_win', when: function (e) { return !!e.actor && lineOf(e.actor) !== null; },
        run: function (e) {
          var p = e.actor;
          var nv = grow(e, 'conf', p.id, 1, 3, function (v) { return first(p) + '\'s confidence is ' + v + ' of 3'; });
          if (nv >= 2 && !e.hasState('in form', p)) e.addState('in form', p, { duration: 'match' }, first(p) + ' is in form');
        } },
      { name: 'lose', on: 'loss', when: function (e) { return !!e.actor && (mem(e.st.squad).conf[e.actor.id] || 0) > 0; },
        run: function (e) {
          var p = e.actor;
          var nv = grow(e, 'conf', p.id, -1, 3, function (v) { return first(p) + ' lost that one: his confidence is ' + v + ' of 3'; });
          if (nv < 2 && e.hasState('in form', p)) e.removeState('in form', p, first(p) + ' is no longer in form');
        } },
      { name: 'form', hook: 'duel', limit: { per: 'match', n: 2 },
        when: function (q) { return q.side === 'you' && !!q.actor && !q.has('shot') && has(q.tags, RUNS) && q.hasState('in form', q.actor); },
        apply: function (q) { q.tier('mixed', 'good', first(q.actor) + ' is in form: a half win counts as a clean win'); } },
      { name: 'peak', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.has('shot') && !!q.actor && level(q.squad, 'conf', q.actor.id) >= 3; },
        apply: function (q) { q.dice(2, first(q.actor) + ' is at full confidence: he rolls two dice and keeps the higher'); } }
    ]
  });

  FX.define({
    id: 'LK_CHEMISTRY', name: 'Earned chemistry', kind: 'relationship',
    text: 'Each clean pass between the pair raises their link by 1 (at most 3, owned by the pair). At 2, a pass between them does not use up a decision (once an attack). At 3, the man who receives a clean pass between them arrives unmarked: +2 to him in this attack.',
    effects: [
      { name: 'grow', on: 'decision_end',
        when: function (e) {
          if (e.side !== 'you' || e.band !== 'good' || !e.byPair() || (e.tags || []).indexOf('pass') < 0) return false;
          var other = e.actor === e.pair[0] ? e.pair[1] : e.pair[0];
          return e.to === other && level(e.st.squad, 'chem', pairKey(e.pair[0], e.pair[1])) < 3;
        },
        run: function (e) {
          var a = e.pair[0], b = e.pair[1];
          grow(e, 'chem', pairKey(a, b), 1, 3, function (v) { return 'the link between ' + first(a) + ' and ' + first(b) + ' is at ' + v + ' of 3'; });
        } },
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) {
          if (q.side !== 'you' || !q.byPair() || !q.has('pass') || level(q.squad, 'chem', pairKey(q.pair[0], q.pair[1])) < 2) return false;
          return q.to === (q.actor === q.pair[0] ? q.pair[1] : q.pair[0]);
        },
        apply: function (q) { q.freeDecision('they know each other\'s game: this pass does not use up a decision'); } },
      { name: 'unmarked', hook: 'outcome',
        when: function (q) {
          if (q.side !== 'you' || !q.byPair() || !q.has('pass') || level(q.squad, 'chem', pairKey(q.pair[0], q.pair[1])) < 3) return false;
          return q.to === (q.actor === q.pair[0] ? q.pair[1] : q.pair[0]);
        },
        apply: function (q) { q.grant('good', { n: 2, man: q.to, why: first(q.to) + ' arrives unmarked' }, first(q.to) + ' arrives unmarked'); } }
    ]
  });

  FX.define({
    id: 'GR_EARNED_OPTION', name: 'Earned option', kind: 'trait',
    text: 'After he wins two runs with the ball cleanly, he can run at their whole defence from midfield: a new option, his Technique against their best defender, where a clean win takes the ball straight into their box (+2 to his shot) and a half win to the edge of it. The growth is his for the match.',
    effects: [
      { name: 'grow', on: 'clean_win', when: function (e) { return e.byOwner() && e.side === 'you' && has(e.tags, RUNS) && level(e.st.squad, 'drib', e.owner.id) < 2; },
        run: function (e) {
          var p = e.owner;
          grow(e, 'drib', p.id, 1, 2, function (v) { return v >= 2 ? first(p) + ' has beaten his man twice: he can now run at their whole defence' : first(p) + ' has beaten his man cleanly (' + v + ' of 2)'; });
        } }
    ],
    pool: [{
      id: 'FXB_RUNS_AT_ALL', side: 'you', zones: [1], family: 'press', tags: ['dribble', 'carry'],
      text: 'he has earned it: two clean runs this match',
      when: function (x, q) {
        if (!q.owner || level(q.squad, 'drib', q.owner.id) < 2) return false;
        x._fxbD = best(q.opp.players.filter(function (p) { return p.line === 0; }), 'defending');
        return !!x._fxbD;
      },
      build: function (x, q) {
        var h = q.owner, d = x._fxbD;
        return {
          test: { mine: h, mineAttr: 'technique', theirs: d, theirsAttr: 'defending' },
          risk: 'high', to: h, grants: { good: [{ id: 'through', man: h }] },
          table: {
            good: ' and your team has the ball in their box.', mixed: ', and your team has the ball at the edge of their box.',
            bad: '. {foil} takes the ball and their team attacks.',
            effect: { good: 'ground', mixed: 'ground', bad: 'break' }, move: { good: 2, mixed: 1 }
          },
          does: { good: 'runs through their midfield and past {foil}', mixed: 'runs through their midfield', bad: 'runs into {foil}' },
          label: (x.actor === h ? first(h) : first(x.actor) + ' gives it to ' + first(h) + ', who') + ' runs at their whole defence',
          read: first(h) + ' (Technique ' + h.attr.technique + ') against ' + first(d) + ' (Defending ' + d.attr.defending + '), their best defender. A clean win takes the ball straight into their box (+2 to his shot); a half win to the edge of it.'
        };
      }
    }]
  });

  FX.define({
    id: 'GR_TEMPO', name: 'Tempo builds', kind: 'tactic',
    text: 'Each of your attacks that reaches their box adds 1 tempo (at most 2, owned by the team, so it outlasts any player). Each point of tempo gives every later attack one more decision. Conceding a goal takes all the tempo away.',
    effects: TRACK.concat([
      { name: 'build', on: 'possession_end', when: function (e) { return e.side === 'you' && mem(e.st.squad).box && level(e.st.squad, 'tempo') < 2; },
        run: function (e) { grow(e, 'tempo', 'team', 1, 2, function (v) { return 'that attack reached their box: your tempo is ' + v + ' of 2'; }); } },
      { name: 'spend', on: 'decision_end', limit: { per: 'possession', n: 1 },
        when: function (e) { return e.side === 'you' && record(e).poss.length === 1 && level(e.st.squad, 'tempo') > 0 && attackGoesOn(e.st); },
        run: function (e) {
          var t = level(e.st.squad, 'tempo');
          for (var i = 0; i < t; i++) e.extraDecision('your tempo gives this attack one more decision');
        } },
      { name: 'reset', on: 'conceded', when: function (e) { return level(e.st.squad, 'tempo') > 0; },
        run: function (e) { mem(e.st.squad).tempo = 0; e.note('they scored: your tempo is gone'); } }
    ])
  });

  FX.define({
    id: 'CAP_STANDARD', name: 'Sets the standard', kind: 'captain',
    text: 'Once in each moment, when a teammate\'s confidence, a link or the team\'s tempo grows, it grows by one more (the caps still hold).',
    effects: []
  });

  /* ================================================== E. THE FOUL FACTORY */

  FX.define({
    id: 'PF_DRAWS_FOULS', name: 'Draws fouls', kind: 'trait',
    text: 'He goes looking for contact. His runs with the ball need 5, not 4, for a clean win. Once in each moment, when his run in midfield or at the edge of their box is lost, he is fouled instead: at the edge of their box it is a free kick there, in midfield you keep the ball; either way the man who fouled him is booked.',
    effects: [
      { name: 'contact', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.byOwner() && has(q.tags, RUNS); },
        apply: function (q) { q.threshold(5, 'he goes looking for contact: a clean win on his run needs 5'); } },
      { name: 'foul', hook: 'outcome', limit: { per: 'moment', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && has(q.tags, RUNS) && (q.zone === 1 || q.zone === 2) && !q.finishing && !!q.foil; },
        apply: function (q) { q.foul('bad', 'he draws the foul'); } }
    ]
  });

  FX.define({
    id: 'SP_ROUTINES', name: 'Rehearsed set pieces', kind: 'tactic',
    text: 'A free kick at the edge of their box offers two practised routines instead of the plain short free kick: the quick free kick (taken before their wall is set, a pass through to your quickest forward at +2 while the man who fouled is out of position; the low-risk choice, and it needs only 3 for a clean win) and the near-post flick (your best player in the air goes up at the near post, +3 because he knows where the ball is going, and flicks it on for the man at the far post, who arrives unmarked). Each routine they have seen is -2 the next time.',
    effects: [
      /* who fouled: the last of their men to be booked (the event's own
       * `by` field is overwritten by the effects layer with the effect that
       * made the event, so it is read from the bookings) */
      { name: 'fouler', on: 'foul_won', when: function (e) {
        var ob = e.st.oppBooked || {}, last = null;
        e.st.opp.players.forEach(function (p) { if (ob[p.id] !== undefined && (!last || ob[p.id] >= ob[last.id])) last = p; });
        mem(e.st.squad).fouler = last;
        return false;
      }, run: function () { } },
      { name: 'noshort', hook: 'option', when: function (q) { return q.id === 'FK_SHORT'; },
        apply: function (q) { q.remove('your free kicks are rehearsed: the quick free kick is played instead of the plain short one'); } },
      { name: 'quick', hook: 'duel', when: function (q) { return q.id === 'FXB_QUICK_FK'; },
        apply: function (q) { q.threshold(3, 'their wall is not set yet: a clean win needs 3'); } },
      { name: 'seen', hook: 'stat', when: function (q) { return /^FXB_(QUICK_FK|FLICK)$/.test(q.id) && (mem(q.squad).seen[q.id] || 0) > 0; },
        apply: function (q) { q.stat(-2 * Math.min(2, mem(q.squad).seen[q.id]), 'they have seen this routine before'); } },
      { name: 'learned', on: 'decision_end', when: function (e) { return /^FXB_(QUICK_FK|FLICK)$/.test(e.id); },
        run: function (e) {
          var m = mem(e.st.squad);
          m.seen[e.id] = (m.seen[e.id] || 0) + 1;
          e.note('they have now seen the ' + (e.id === 'FXB_FLICK' ? 'near-post flick' : 'quick free kick') + ': -2 to it next time');
        } }
    ],
    pool: [
      { id: 'FXB_QUICK_FK', side: 'you', zones: [2], modes: ['freekick'], family: 'press', tags: ['set piece', 'free kick', 'through ball', 'forward pass', 'pass'],
        text: 'a rehearsed quick free kick',
        when: function (x, q) {
          if (!x.actor) return false;
          var m = mem(q.squad);
          var f = m.fouler && q.opp.players.indexOf(m.fouler) >= 0 ? m.fouler : best(q.opp.players.filter(function (p) { return p.line === 0; }), 'intelligence');
          x._fxbQ = f;
          x._fxbR = best(q.squad.players.filter(function (p) { return p.line === 2 && p !== x.actor; }), 'pace');
          return !!f && !!x._fxbR;
        },
        build: function (x) {
          var r = x._fxbR, f = x._fxbQ;
          return {
            test: { mine: x.actor, mineAttr: 'passing', theirs: f, theirsAttr: 'intelligence' },
            risk: 'low', bonus: 2, because: first(f) + ' gave the foul away and is still out of position', to: r, pays: 'probe', grants: { good: [{ id: 'through', man: r }] },
            does: { good: 'takes it quickly and slides ' + first(r) + ' through', mixed: 'takes it quickly, but ' + first(r) + ' is picked up', bad: 'takes it quickly, straight to {foil}' },
            label: first(x.actor) + ' takes it before their wall is set, for ' + first(r),
            read: first(x.actor) + ' (Passing ' + x.actor.attr.passing + ') against ' + first(f) + ' (Intelligence ' + f.attr.intelligence + '), who gave the foul away. A clean win puts ' + first(r) + ' through on goal in their box (+2 to his shot).'
          };
        } },
      { id: 'FXB_FLICK', side: 'you', zones: [2], modes: ['freekick'], family: 'move', tags: ['set piece', 'free kick', 'header', 'aerial', 'layoff'],
        text: 'a rehearsed near-post flick',
        when: function (x, q) {
          var air = function (p) { return ((p.attr && p.attr.physical) || 0) + 10 * (p.heightM || 1.8); };
          var tm = q.squad.players.filter(function (p) { return p !== x.actor; }).sort(function (a, b) { return air(b) - air(a); })[0];
          if (!tm) return false;
          x._fxbT = tm;
          x._fxbF = best(q.squad.players.filter(function (p) { return p.line >= 1 && p !== tm && p !== x.actor; }), 'finishing');
          x._fxbH = best(q.opp.players.filter(function (p) { return p.line === 0; }), 'physical');
          return !!x._fxbF && !!x._fxbH;
        },
        build: function (x) {
          var tm = x._fxbT, f = x._fxbF, d = x._fxbH;
          return {
            test: { mine: tm, mineAttr: 'reach', theirs: d, theirsAttr: 'reach' },
            bonus: 3, because: 'it is rehearsed: ' + first(tm) + ' knows where the ball is going and ' + first(d) + ' does not',
            risk: 'even', to: f, mate: f, grants: { good: [{ id: 'unmarked', man: f }] }, unlock: 'Rehearsed set pieces: ' + first(tm),
            table: {
              good: ', and {mate} has it at the far post, unmarked.', mixed: ', but their defence clears it. The attack is over.',
              bad: '. Their keeper claims it, and the attack is over.',
              effect: { good: 'ground', mixed: 'nothing', bad: 'nothing' }, move: { good: 1 }
            },
            does: { good: 'flicks it on at the near post', mixed: 'gets a touch at the near post', bad: 'is beaten to it by {foil}' },
            label: first(x.actor) + ' drives it at the near post for ' + first(tm) + ' to flick on to ' + first(f),
            names: { mate: first(f) },
            read: 'In the air ' + first(tm) + ' against ' + first(d) + '. A clean win flicks it on to ' + first(f) + ' at the far post, unmarked (+2 to his shot).'
          };
        } }
    ]
  });

  FX.define({
    id: 'TR_TARGET_MAN', name: 'Target man', kind: 'trait',
    text: 'Once in each attack, when his header is a half win (it goes wide or is only half cleared), it drops to your best finisher in their box instead of the attack ending (not on the last decision of an attack).',
    effects: [
      { name: 'knockdown', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) {
          if (q.side !== 'you' || !q.byOwner() || !q.has('header') || typeof q.zone !== 'number' || q.finishing) return false;
          return q.lines().some(function (x) { return x.band === 'mixed' && x.effect === 'nothing' && typeof x.move !== 'number' && !x.caught; });
        },
        apply: function (q) {
          var f = best(q.squad.players.filter(function (p) { return p.line >= 1 && p !== q.owner; }), 'finishing');
          if (!f) return;
          q.branch('mixed', { effect: 'ground', move: Math.max(0, 3 - q.zone), to: f }, 'he wins it enough to knock it down, and ' + first(f) + ' has the ball in their box');
        } }
    ]
  });

  FX.define({
    id: 'TR_DEAD_BALL', name: 'Dead-ball specialist', kind: 'trait',
    text: 'His shots from free kicks need only 3, not 4, for a clean win, and once in each attack a free kick of his that hits the wall comes back to him at the edge of their box instead of being cleared (not on the last decision of an attack).',
    effects: [
      { name: 'threshold', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('free kick') && q.has('shot'); },
        apply: function (q) { q.threshold(3, 'he practises this: a clean win on his free kick needs 3'); } },
      { name: 'again', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('free kick') && q.has('shot') && typeof q.zone === 'number' && !q.finishing; },
        apply: function (q) { q.branch('bad', { effect: 'nothing', move: 0, to: q.owner }, 'it comes back off the wall to him, and your team keeps the ball at the edge of their box'); } }
    ]
  });

  FX.define({
    id: 'TA_BOOKED_MAN', name: 'Go at the booked man', kind: 'tactic',
    text: 'A booked defender cannot risk a tackle: your runs with the ball at a booked man are rolled with two dice, keeping the higher.',
    effects: [
      { name: 'dice', hook: 'duel',
        when: function (q) { return q.side === 'you' && has(q.tags, RUNS) && !!q.foil && q.hasState('booked', q.foil); },
        apply: function (q) { q.dice(2, first(q.foil) + ' is on a yellow card and cannot risk a tackle: two dice, keep the higher'); } }
    ]
  });

  var API = { mem: mem, kindOf: kindOf, kinds: kinds, IDS: ['WB_COUNTERPRESS', 'WB_CLEAN_TACKLER', 'WB_BREATHES', 'WB_GONE',
    'EC_PAY_WITH_LEGS', 'LK_COVERS', 'TR_SECOND_WIND', 'CAP_LEADS', 'CAP_ENCORE',
    'SE_VARIETY', 'SE_RHYTHM', 'SE_FRESH_FEET', 'RO_SETS_PACE', 'LK_KNOWS_RUN',
    'GR_CONFIDENCE', 'LK_CHEMISTRY', 'GR_EARNED_OPTION', 'GR_TEMPO', 'CAP_STANDARD',
    'PF_DRAWS_FOULS', 'SP_ROUTINES', 'TR_TARGET_MAN', 'TR_DEAD_BALL', 'TA_BOOKED_MAN'] };
  root.KMContentB = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
