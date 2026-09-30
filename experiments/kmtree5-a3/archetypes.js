/* ARCHETYPES (kmtree5, Helper E, 2026-09-29): the 29 pieces of Eduardo's doc "Cantera: build archetypes
 * and opponent effects" (SPEC-eduardo-2026-09-29.txt), with his rulings of that day (BRIEF.md). Five
 * families, never named to the player: Belief, Build-up, Pockets, the Season, Understudies. Birthplace is
 * parked. His numbers exactly: nothing here is capped or tuned down (DECISIONS-E.md has the WATCH notes).
 *
 * What this file adds to a match (st.arch, created only when a build is loaded and it holds one of these
 * pieces, so a match without one is st4's):
 *   Belief     a team number for the whole match; each point is +1 to ONE stat (build.beliefStat, chosen
 *              per run) on every duel of yours where that stat is checked
 *   Build-up   a team number for one moment; each point is +1 to every card of yours that can score, for
 *              the rest of the moment; back to 0 when a moment starts
 *   pockets    a player's position (out wide, pushed forward), with what it does while held and a payoff
 *              when it is released
 *   boosts     "+n in his next duel" for one man, from a release; they add up (unlike carried edges) and
 *              end with the attack
 *   the season streaks from build.run (Confidence, Momentum, Unbeaten run), applied at kickoff
 *   roster order (build.order), the Understudy copies, the Benchwarmer rolls, Encore, Captain's shadow
 * Every change writes a line in the match log (st.fx.log) with the piece's name and the number in
 * parentheses; every number on a card is a named part. KMArchetypes.counters(st) lists what the page
 * shows; KMArchetypes.teamSheet(st) what the team sheet shows.
 *
 * Plain English in every sentence a player sees; no dashes. Browser: window.KMArchetypes (load after
 * effects.js; options.js and match.js are read when a match runs). Node: require('./archetypes.js').
 * ARCH_BREAK (env) breaks one thing for archcheck.js --prove.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  var R = root.KMResolve || require('./resolve.js');
  function OPT() { return root.KMOptions || require('./options.js'); }
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.ARCH_BREAK) || '';

  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  var STATS = ['pace', 'physical', 'technique', 'passing', 'finishing', 'defending', 'intelligence'];
  var STAT_WORD = { pace: 'Pace', physical: 'Physical', technique: 'Technique', passing: 'Passing', finishing: 'Finishing',
    defending: 'Defending', intelligence: 'Intelligence', reflexes: 'Reflexes', communication: 'Communication',
    distribution: 'Distribution', physique: 'Physical', reach: 'in the air' };
  function statWord(a) { return STAT_WORD[a] || a; }
  /* the stat a card checks, as a stat a player owns: a header ("in the air") is Physical */
  function baseStat(a) { return a === 'reach' || a === 'physique' ? 'physical' : a; }   /* a keeper's Physical is "physique" */

  /* ============================================================ who can hold a piece */
  function lineOf(p) { return p && typeof p.homeLine === 'number' ? p.homeLine : p && typeof p.line === 'number' ? p.line : null; }
  function isKeeper(p, sq) { return !!p && ((sq && p === sq.keeper) || p.role === 'keeper' || p.pos === 'GK'); }
  function isWinger(p) { return !!p && (['winger', 'inside-forward'].indexOf(p.role) >= 0 || ['LW', 'RW', 'W', 'IF'].indexOf(p.pos) >= 0); }
  function isStriker(p) { return !!p && !isWinger(p) && (['poacher', 'target-forward'].indexOf(p.role) >= 0 || ['ST', 'CF'].indexOf(p.pos) >= 0 || lineOf(p) === 2); }
  function isMid(p, sq) { return !!p && !isKeeper(p, sq) && lineOf(p) === 1; }
  function isDef(p, sq) { return !!p && !isKeeper(p, sq) && lineOf(p) === 0; }
  var WHO = {
    striker: { word: 'a striker', test: function (p) { return isStriker(p); } },
    winger: { word: 'a winger', test: function (p) { return isWinger(p); } },
    midfielder: { word: 'a midfielder', test: function (p, sq) { return isMid(p, sq); } },
    defender: { word: 'a defender', test: function (p, sq) { return isDef(p, sq); } },
    keeper: { word: 'the keeper', test: function (p, sq) { return isKeeper(p, sq); } },
    any: { word: 'any player', test: function () { return true; } }
  };

  /* ============================================================ the match's own state */
  function arch(st) { return st && st.arch ? st.arch : null; }
  function mkArch(fx, st, build) {
    return {
      belief: 0, beliefStat: build && build.beliefStat ? build.beliefStat : null,
      buildup: 0, momentClean: 0, youDecisions: 0,
      pockets: {}, boosts: [], momentum: {}, confidence: {}, unbeaten: 0,
      encoreHeld: false, encoreAt: -1, capTo: 0, halfDone: {},
      rattled: {}, copies: {}, order: [], bench: [], history: [],
      has: {}
    };
  }
  function src(inst) { return inst ? inst.name : 'Your build'; }
  function note(fx, source, text) { return fx.write(source, text, 'event', 'counter'); }
  function yours(inst) { return (inst.side || 'you') === 'you'; }
  function instsOf(fx, id) { return fx.inst.filter(function (x) { return x.def && x.def.id === id && yours(x) && fx.active(x); }); }
  function holds(fx, id) { return instsOf(fx, id).length > 0; }
  function ownerOf(inst) { return inst && inst.owner ? inst.owner.player || null : null; }
  /* a piece on the captain works (1 + Captain's shadows on the pitch) times */
  function captainTimes(fx) { return 1 + (BREAK === 'shadow' ? 0 : instsOf(fx, 'AR_CAPTAINS_SHADOW').length); }
  /* a captain's piece worked more than once: each shadow fired */
  function shadowsFire(fx) { if (BREAK !== 'shadow') instsOf(fx, 'AR_CAPTAINS_SHADOW').forEach(function (x) { fx.countFire(x); }); }

  /* ---- ENCORE: the first player trait of yours that does something in a moment does it twice. A trait
   * that only moves the ball, switches a position or works once a match is skipped (def.encore false). */
  function encoreFree(fx, inst) {
    var A = arch(fx.st);
    if (!A || !A.encoreHeld || BREAK === 'encore' || !inst || !inst.def || inst.def.kind !== 'trait' || !yours(inst)) return false;
    if (inst.def.encore !== true) return false;   /* only the traits that say they can repeat */
    return A.encoreAt !== fx.scope.moment;
  }
  function encoreTake(fx, inst) {
    if (!encoreFree(fx, inst)) return 1;
    var A = arch(fx.st);
    A.encoreAt = fx.scope.moment;
    instsOf(fx, 'AR_ENCORE').forEach(function (x) { fx.countFire(x); });
    note(fx, 'Encore (tactic)', inst.name + ' is the first player trait to do something in this moment, so it does it twice');
    return 2;
  }
  /* a numbered part from a trait on a card: doubled by Encore when it is still free this moment (only the
   * first such part on each card); choosing the card uses Encore up (effects.js fired, r.encore) */
  function part(q, n, why, fn) {
    if (!n) return;
    var twice = encoreFree(q.st.fx, q.inst) && !q.card.encoreGiven;
    if (twice) q.card.encoreGiven = true;
    q.stat(twice ? 2 * n : n, why + (twice ? ' (Encore: the first player trait this moment counts twice)' : ''), { encore: twice, fn: fn || null });
  }

  /* ---- BELIEF */
  function addBelief(fx, source, n, why) {
    var A = arch(fx.st);
    if (!A || !(n > 0)) return 0;
    if (BREAK === 'belief') return 0;
    A.belief += n;
    note(fx, source, (why ? why + ': ' : '') + '+' + n + ' Belief (Belief ' + A.belief + (A.beliefStat ? ', +' + A.belief + ' ' + statWord(A.beliefStat) : ', but it is on no stat yet') + ')');
    return n;
  }
  function setBelief(fx, source, v, why) {
    var A = arch(fx.st);
    if (!A || v === A.belief) return;
    A.belief = Math.max(0, v);
    note(fx, source, why + ' (Belief ' + A.belief + ')');
  }
  /* ---- BUILD-UP (Metronome: each gain brings one more, times the captain's shadows) */
  function addBuildup(fx, source, n, why, fromMetronome) {
    var A = arch(fx.st);
    if (!A || !(n > 0) || BREAK === 'buildup') return 0;
    A.buildup += n;
    note(fx, source, (why ? why + ': ' : '') + '+' + n + ' Build-up (Build-up ' + A.buildup + ' this moment)');
    if (!fromMetronome && BREAK !== 'metronome') {
      instsOf(fx, 'AR_METRONOME').filter(function (x) { return x.owner.kind === 'captain'; }).forEach(function (m) {
        fx.countFire(m);
        if (captainTimes(fx) > 1) shadowsFire(fx);
        addBuildup(fx, m.name, captainTimes(fx), 'your team gained Build-up, so it gains ' + (captainTimes(fx) > 1 ? captainTimes(fx) + ' more (his piece works ' + captainTimes(fx) + ' times)' : '1 more'), true);
      });
    }
    return n;
  }
  function resetBuildup(fx, source, why) {
    var A = arch(fx.st);
    if (!A || !A.buildup) return;
    A.buildup = 0;
    note(fx, source, why + ' (Build-up 0)');
  }
  /* ---- POCKETS */
  function pocketOf(fx, p) { var A = arch(fx.st); return A && p ? A.pockets[p.id] || null : null; }
  function pocketIn(fx, p, kind, source, why) {
    var A = arch(fx.st);
    if (!A || !p || A.pockets[p.id]) return false;
    A.pockets[p.id] = { kind: kind, store: 0, man: p };
    note(fx, source, why || (first(p) + (kind === 'wide' ? ' goes out wide' : ' is pushed forward')));
    return true;
  }
  function pocketOut(fx, p, source, why) {
    var A = arch(fx.st);
    if (!A || !p || !A.pockets[p.id]) return false;
    delete A.pockets[p.id];
    note(fx, source, why || (first(p) + ' is back in his place'));
    return true;
  }
  /* ---- BOOSTS: "+n in his next duel in this attack", from a release; they add up, and end with the attack */
  function addBoost(fx, source, man, n, why) {
    var A = arch(fx.st);
    if (!A || !man || !(n > 0)) return;
    A.boosts.push({ man: man, n: n, why: why, source: source });
    note(fx, source, why + ': +' + n + ' to ' + first(man) + ' in his next duel in this attack');
  }
  /* ---- RATTLED (an opponent effect, opponents.js): an Understudy is rattled when the man he copies is */
  function rattled(st, p) {
    var A = arch(st);
    if (!A || !p) return false;
    return !!(A.rattled[p.id] || (A.copies[p.id] && A.rattled[A.copies[p.id].id]));
  }

  /* ---- the cards a piece makes: helpers */
  function onPitch(fx, p) { return fx.onPitch(p); }
  function inLine(sq, n) { return sq.players.filter(function (p) { return p.line === n; }); }
  function bestBy(list, attr) { return list.slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null; }
  function tag(p, a, legs) { return OPT().tag(p, a, legs); }
  function strikerOf(sq, not) {
    var fw = inLine(sq, 2).filter(function (p) { return p !== not; });
    return fw.filter(isStriker)[0] || bestBy(fw, 'finishing') || null;
  }
  /* can this card score (Build-up, Final ball, No quick shots read it) */
  function canScore(q) { return R.canScore(q.side === 'them' ? 'them' : 'you', q.pays); }
  function yourAttack(q) { return q.side === 'you' && typeof q.zone === 'number'; }

  /* ============================================================ SYSTEM PIECES (never offered) */
  /* The counters' own parts on the cards, and the engine's bookkeeping. Added to a match by the extension
   * below when a piece that needs them is in the build; named "Belief", "Build-up" and "Your build" on
   * the card and in the log. */
  FX.define({
    id: 'AR_SYS_BELIEF', name: 'Belief', kind: 'tactic', hidden: true,
    text: 'Belief: +1 per point to the chosen stat on every duel where it is checked.',
    effects: [
      { hook: 'stat', when: function (q) {
        var A = arch(q.st);
        if (!A || !(A.belief > 0) || !A.beliefStat || q.mineVal === null || baseStat(q.mineAttr) !== A.beliefStat) return false;
        /* Speculative shot puts all of it (three times) on his shots itself */
        if (q.has('shot') && q.side === 'you' && instsOf(q.st.fx, 'AR_SPECULATIVE_SHOT').some(function (x) { return ownerOf(x) === q.actor; })) return false;
        return true;
      },
        apply: function (q) { var A = arch(q.st); q.stat(A.belief, 'your team\'s Belief is ' + A.belief + ' (+1 ' + statWord(A.beliefStat) + ' a point)', { label: 'Belief' }); } }
    ]
  });
  FX.define({
    id: 'AR_SYS_BUILDUP', name: 'Build-up', kind: 'tactic', hidden: true,
    text: 'Build-up: +1 per point to every card that can score, for the rest of the moment.',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.buildup > 0 && yourAttack(q) && q.mineVal !== null && canScore(q) && (!buildupFinishingOnly() || q.mineAttr === 'finishing'); },
        apply: function (q) { var A = arch(q.st); q.stat(A.buildup, 'Build-up ' + A.buildup + ' this moment (+1 a point on every card that can score)', { label: 'Build-up' }); } }
    ]
  });
  FX.define({
    id: 'AR_SYS_ENGINE', name: 'Your build', kind: 'tactic', hidden: true,
    text: 'The bookkeeping of the pieces: a new moment, the end of an attack, the boosts.',
    effects: [
      /* a new moment: Build-up and the per-moment counts start again */
      { on: 'moment_start', quiet: true, run: function (e) {
        var fx = e.st.fx, A = arch(e.st);
        if (!A) return;
        if (A.buildup) resetBuildup(fx, 'Build-up', 'a new moment starts, so Build-up goes back to 0');
        A.momentClean = 0; A.youDecisions = 0;
      } },
      /* your decisions in this moment (No quick shots counts them) */
      { on: 'decision_end', quiet: true, when: function (e) { return e.side === 'you'; }, run: function (e) {
        var A = arch(e.st); if (A) A.youDecisions++; patience(e);
        if (BREAK === 'crash' && e.st.seed % 7 === 3 && e.st.n === 2) throw new Error('archcheck --break crash');
      } },
      { on: 'possession_start', quiet: true, run: function (e) {
        var A = arch(e.st), st = e.st;
        if (!A) return;
        A.steps = 0;
        /* the cap this attack had without Patience: after a ball won back 3, otherwise 4 (plus the x1 switch) */
        var M5 = root.KMMatch || require('./match.js');
        /* the cap this attack would have without Patience: 3 after a ball won back (a handoff chain carries a cap), else 4 */
        A.stepBase = (st.chain && st.chain.cap ? M5.WIN_CAP : M5.CHAIN_CAP) + (st.x1 && st.x1.cap ? 1 : 0);
      } },
      /* an Understudy is booked when the man he copies is */
      { on: 'decision_end', run: function (e) {
        var A = arch(e.st), st = e.st;
        if (!A) return;
        Object.keys(A.copies).forEach(function (pid) {
          var orig = A.copies[pid], man = A.copyMan[pid];
          if (!man || !orig || !st.booked[orig.id] || st.booked[man.id]) return;
          if (!onPitch(st.fx, man)) return;
          st.booked[man.id] = true;
          note(st.fx, 'Understudy (' + first(man) + ')', first(man) + ' is on a yellow card too: he copies ' + first(orig));
        });
      } },
      /* the boosts end with the attack */
      { on: 'possession_end', run: function (e) {
        var A = arch(e.st);
        if (!A || !A.boosts.length) return;
        A.boosts.forEach(function (b) { note(e.st.fx, b.source, first(b.man) + ' did not have another duel in that attack, so his +' + b.n + ' is gone'); });
        A.boosts = [];
      } },
      /* a boost on your man's number, used up when the card is chosen */
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.boosts.length > 0 && q.side === 'you' && q.mineVal !== null && !!q.actor; },
        apply: function (q) {
          var A = arch(q.st);
          A.boosts.filter(function (b) { return b.man === q.actor; }).forEach(function (b) {
            q.stat(b.n, b.why, { label: b.source, fn: function () { A.boosts = A.boosts.filter(function (x) { return x !== b; }); } });
          });
        } }
    ]
  });

  /* ============================================================ 1. BELIEF */
  var SUPERB = 'AR_C_SUPERB';
  FX.define({
    id: 'AR_SUPERB_EFFORT', name: 'Superb effort', kind: 'trait', who: 'striker', fam: 'belief', belief: 'makes', encore: true,
    text: 'When he could shoot, he can also go for a shot that will not score. Choosing it always gives your team +1 Belief. If he wins the duel cleanly your team keeps the ball; otherwise the attack ends, as after a saved shot.',
    effects: [
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === SUPERB && e.byOwner(); },
        run: function (e) {
          var fx = e.st.fx, k = encoreTake(fx, e.inst);
          for (var i = 0; i < k; i++) addBelief(fx, e.inst.name, 1, first(e.owner) + ' took the shot that cannot score');
        } }
    ],
    pool: [{
      id: SUPERB, side: 'you', zones: [2, 3], family: 'press', tags: ['shot', 'long shot'],
      text: 'a shot that cannot score, for +1 Belief',
      when: function (x, q) { return !!q.owner && x.actor === q.owner && !!x.keeper; },
      build: function (x, q) {
        var inBox = x.zone >= 3;
        /* (review item 1) on the last decision of an attack a clean win keeps the ball, and the attack ends: the
         * card, the result and the headline say so */
        var last = !!(x.state && x.state.finishOnly) && BREAK !== 'superbend';
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'even', bonus: inBox ? 3 : -5, because: inBox ? 'he is inside the box, close to goal' : 'he is shooting from outside the box',
          pays: last ? 'superbend' : 'superb', to: x.actor, pairShot: true,
          does: { good: 'hits it as hard as he can', mixed: 'hits it as hard as he can', bad: 'hits it as hard as he can' },
          label: first(x.actor) + ' shoots, but it cannot go in: your team gets +1 Belief',
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + '. This shot cannot score. Choosing it gives your team +1 Belief whatever happens. ' +
            (last ? 'This is the last decision of the attack: a clean win keeps the ball, but the attack ends there. Otherwise the attack ends too.'
              : 'A clean win keeps the ball ' + (inBox ? 'in their box' : 'at the edge of their box') + ', and the attack goes on. Otherwise the attack ends.') + ' They do not get the ball from it.'
        };
      }
    }]
  });

  var BRILLIANT = 'AR_C_BRILLIANT';
  FX.define({
    id: 'AR_BRILLIANT_PASS', name: 'Brilliant pass', kind: 'trait', who: 'midfielder', fam: 'belief', belief: 'makes', encore: true,
    text: 'When he has the ball in midfield, he can try an ambitious pass through to your fastest forward. Choosing it always gives your team +1 Belief, whether it works or not. If it works, it is a normal pass through.',
    effects: [
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === BRILLIANT && e.byOwner(); },
        run: function (e) {
          var fx = e.st.fx, k = encoreTake(fx, e.inst);
          for (var i = 0; i < k; i++) addBelief(fx, e.inst.name, 1, first(e.owner) + ' tried the brilliant pass');
        } }
    ],
    pool: [{
      id: BRILLIANT, side: 'you', zones: [1], family: 'press', tags: ['through ball', 'forward pass', 'pass'],
      text: 'an ambitious pass through, for +1 Belief',
      when: function (x, q) {
        if (!q.owner || x.actor !== q.owner) return false;
        var fw = inLine(x.squad, 2).filter(function (p) { return p !== x.actor; });
        x._arRun = bestBy(fw, 'pace');
        return !!x._arRun;
      },
      build: function (x) {
        var a = x._arRun, d = OPT().markerOf(x.opp, a, 0);
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'high', to: a, grants: { good: [{ id: 'through', man: a }] }, pays: 'through',
          does: { good: 'puts ' + first(a) + ' through past {foil} with a brilliant pass', mixed: 'tries the brilliant pass, but it runs a little too far ahead of ' + first(a), bad: 'tries the brilliant pass, and it goes straight to {foil}' },
          label: first(x.actor) + ' tries a brilliant pass through to ' + first(a) + ' (+1 Belief whatever happens)',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(d, 'intelligence', 100) + ', who is marking ' + first(a) +
            '. Choosing it gives your team +1 Belief whether it works or not. If it comes off, ' + first(a) + ' has the ball in their box.'
        };
      }
    }]
  });

  FX.define({
    id: 'AR_STEADY', name: 'Steady', kind: 'tactic', fam: 'belief', belief: 'makes',
    text: 'Every second clean win your players have in a moment gives your team +1 Belief. Half wins do not count, and the count starts again each moment.',
    effects: [
      { on: 'clean_win', run: function (e) {
        var A = arch(e.st);
        if (!A) return;
        A.momentClean++;
        if (A.momentClean % 2 === 0) addBelief(e.st.fx, e.inst.name, 1, 'another second clean win this moment (' + A.momentClean + ' clean wins this moment)');
        else note(e.st.fx, e.inst.name, 'a clean win (' + A.momentClean + ' this moment): the next one gives +1 Belief');
      } }
    ]
  });

  FX.define({
    id: 'AR_GROWING_BELIEF', name: 'Growing belief', kind: 'tactic', fam: 'belief', belief: 'makes',
    text: 'Your team gets +1 Belief at the start of each moment from the second one. But while you have this, every goal you concede halves your Belief (rounded down).',
    effects: [
      { on: 'moment_start', when: function (e) { return e.st.n >= 1; }, run: function (e) { addBelief(e.st.fx, e.inst.name, 1, 'a new moment starts'); } },
      { on: 'conceded', run: function (e) {
        var A = arch(e.st);
        if (!A || !A.belief) return;
        setBelief(e.st.fx, e.inst.name, BREAK === 'growinghalf' ? A.belief : Math.floor(A.belief / 2), 'they scored, so your Belief is halved');
      } }
    ]
  });

  var SLALOM = 'AR_C_SLALOM';
  FX.define({
    id: 'AR_SLALOM', name: 'Slalom', kind: 'trait', who: 'winger', fam: 'belief', encore: false,
    text: 'When he has the ball in midfield or at the edge of their box, he can take on three of their players in a row: three duels in one. He keeps the ball only if he wins all three (a half win is enough); three clean wins take him through, unmarked (+2 to his shot).',
    pool: [{
      id: SLALOM, side: 'you', zones: [1, 2], family: 'press', tags: ['dribble', 'carry'],
      text: 'three duels in a row with the ball',
      when: function (x, q) {
        if (!q.owner || x.actor !== q.owner || !x.foil) return false;
        var f = x.foil, lines = [typeof f.line === 'number' ? f.line : 0, 0, 1];
        var pool = [];
        lines.forEach(function (l) { inLine(x.opp, l).forEach(function (p) { if (p !== f && pool.indexOf(p) < 0) pool.push(p); }); });
        var want = typeof f.slot === 'number' ? f.slot : 2;
        pool.sort(function (a, b) {
          var la = a.line === f.line ? 0 : 1, lb = b.line === f.line ? 0 : 1;
          return la - lb || Math.abs((typeof a.slot === 'number' ? a.slot : 2) - want) - Math.abs((typeof b.slot === 'number' ? b.slot : 2) - want);
        });
        x._arThree = pool.slice(0, 2);
        return x._arThree.length === 2;
      },
      build: function (x) {
        var two = x._arThree, all = [x.foil].concat(two);
        var nums = all.map(function (p) { return first(p) + ' ' + Math.round(p.attr.defending); }).join(', ');
        return {
          test: { mine: x.actor, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'defending' },
          risk: 'high', to: x.actor, multi: two, pays: 'slalom', grants: { good: [{ id: 'unmarked', man: x.actor }] },
          does: { good: 'goes past ' + all.map(first).join(', ') + ', one after the other', mixed: 'gets past all three, just', bad: 'loses it to {foil}' },
          label: first(x.actor) + ' takes on three of them in a row: ' + first(all[0]) + ', ' + first(all[1]) + ' and ' + first(all[2]),
          read: tag(x.actor, 'technique', x.legs) + ' against their Defending (' + nums + '), one after the other: three duels in one. He keeps the ball only if he wins all three (a half win is enough). Three clean wins take him ' +
            (x.zone === 1 ? 'to the edge of their box' : 'into their box') + ', unmarked (+2 to his shot). Lose one and they have the ball.'
        };
      }
    }]
  });

  FX.define({
    id: 'AR_SPECULATIVE_SHOT', name: 'Speculative shot', kind: 'trait', who: 'striker', fam: 'belief', belief: 'reads', encore: true,
    text: 'Your team\'s Belief counts three times on his shots.',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.belief > 0 && q.byOwner() && q.side === 'you' && q.has('shot') && q.mineVal !== null; },
        apply: function (q) {
          var A = arch(q.st), n = (BREAK === 'spec' ? 1 : 3) * A.belief;
          part(q, n, 'Belief ' + A.belief + ' counts three times on his shots');
        } }
    ],
    /* the doc's "maybe from midfield too": off unless KM_SPECMID=1 / ?specmid=1 (DECISIONS-E.md) */
    pool: [{
      id: 'AR_C_SPECMID', side: 'you', zones: [1], family: 'press', tags: ['shot', 'long shot'],
      text: 'a shot from midfield',
      when: function (x, q) { return specMid() && !!q.owner && x.actor === q.owner && !!x.keeper; },
      build: function (x) {
        return {
          test: { mine: x.actor, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'high', bonus: -7, because: 'he is shooting from 35 metres', pays: 'longshot',
          does: { good: 'shoots from 35 metres, past {foil}', mixed: 'shoots from 35 metres, on target', bad: 'shoots from 35 metres' },
          label: first(x.actor) + ' shoots from 35 metres',
          read: tag(x.actor, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + ', from the middle of the pitch.'
        };
      }
    }]
  });
  /* the literal reading of "+1 Finishing": Build-up only on cards that check Finishing (KM_BUILDUP=finishing,
   * ?buildup=finishing); the default puts it on every card that can score, whatever it checks */
  function buildupFinishingOnly() {
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_BUILDUP === 'finishing') return true; } catch (e) { }
    try { return /[?&]buildup=finishing(&|$)/.test((root.location && root.location.search) || ''); } catch (e) { return false; }
  }
  function specMid() {
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_SPECMID === '1') return true; } catch (e) { }
    try { return /[?&]specmid=1(&|$)/.test((root.location && root.location.search) || ''); } catch (e) { return false; }
  }

  FX.define({
    id: 'AR_HALFTIME_RANT', name: 'Half-time rant', kind: 'captain', fam: 'belief', belief: 'reads',
    text: 'At half-time your team\'s Belief doubles. Once a match.',
    effects: [
      { on: 'moment_start', limit: { per: 'match', n: 1 }, when: function (e) { return e.st.n >= 3; },
        run: function (e) {
          var A = arch(e.st), fx = e.st.fx, t = captainTimes(fx);
          if (!A) return;
          if (!A.belief) { note(fx, e.inst.name, 'half-time: your Belief is 0, so there is nothing to double'); return; }
          if (t > 1) shadowsFire(fx);
          for (var i = 0; i < t; i++) addBelief(fx, e.inst.name, BREAK === 'rant' ? 0 : A.belief, 'half-time: your Belief doubles' + (t > 1 ? ' (his piece works ' + t + ' times)' : ''));
        } }
    ]
  });

  FX.define({
    id: 'AR_FEEDS_OFF_IT', name: 'Feeds off it', kind: 'trait', who: 'defender', fam: 'belief', belief: 'makes', encore: true,
    text: 'Each time he wins a tackle cleanly, your team gets +1 Belief.',
    effects: [
      { on: 'clean_win', when: function (e) { return e.byOwner() && e.has('tackle') && !e.has('foul'); },
        run: function (e) { var fx = e.st.fx, k = encoreTake(fx, e.inst); for (var i = 0; i < k; i++) addBelief(fx, e.inst.name, 1, first(e.owner) + ' won his tackle cleanly'); } }
    ]
  });

  /* ============================================================ 2. BUILD-UP */
  FX.define({
    id: 'AR_TIKI_TAKA', name: 'Tiki-taka', kind: 'tactic', fam: 'buildup', buildup: true,
    text: 'Every duel your players win (a half win is enough) gives +1 Build-up.',
    effects: [
      { on: 'clean_win', run: function (e) { addBuildup(e.st.fx, e.inst.name, 1, first(e.actor) + ' won his duel'); } },
      { on: 'half_win', run: function (e) { addBuildup(e.st.fx, e.inst.name, 1, first(e.actor) + ' won his duel'); } }
    ]
  });

  var SIDEWAYS = 'AR_C_SIDEWAYS';
  FX.define({
    id: 'AR_CIRCULATOR', name: 'Circulator', kind: 'trait', who: 'midfielder', fam: 'buildup', buildup: true, encore: true,
    text: 'When he has the ball, he can play a sideways pass and get it straight back. It always works (it counts as a clean win), gives +1 Build-up, and does not move the ball forward.',
    effects: [
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === SIDEWAYS && e.byOwner(); },
        run: function (e) { var fx = e.st.fx, k = encoreTake(fx, e.inst); for (var i = 0; i < k; i++) addBuildup(fx, e.inst.name, 1, first(e.owner) + ' played the sideways pass'); } }
    ],
    pool: [{
      id: SIDEWAYS, side: 'you', zones: [0, 1, 2, 3], family: 'hold', tags: ['short pass', 'pass'],
      text: 'a sideways pass that always works, for +1 Build-up',
      when: function (x, q) {
        if (!q.owner || x.actor !== q.owner) return false;
        var l = typeof x.actor.line === 'number' ? x.actor.line : 1;
        var mates = x.squad.players.filter(function (p) { return p !== x.actor && (p.line === l || p.line === Math.min(2, l + 1)); });
        x._arMate = bestBy(mates, 'technique');
        return !!x._arMate;
      },
      build: function (x) {
        var m = x._arMate;
        return {
          test: {}, actorMan: x.actor, fixedOdds: { good: 1 }, sureDuel: 'clean_win', risk: 'low', pays: 'hold', to: x.actor,
          checkText: 'No duel: it always works, and it counts as a clean win.',
          does: { good: 'plays it sideways to ' + first(m) + ' and gets it back', mixed: 'plays it sideways to ' + first(m) + ' and gets it back', bad: 'plays it sideways to ' + first(m) },
          label: first(x.actor) + ' plays it sideways to ' + first(m) + ' and gets it back (+1 Build-up)',
          read: 'No duel: it always works, and it counts as a clean win. The ball does not move forward, and ' + first(x.actor) + ' still has it for the next decision. It gives +1 Build-up.'
        };
      }
    }]
  });

  FX.define({
    id: 'AR_SECOND_CHANCE', name: 'Second chance', kind: 'tactic', fam: 'buildup', buildup: true,
    text: 'Once a moment, when one of your players loses the ball in a duel that is not a shot, your team wins it straight back where it was, but your Build-up goes back to 0.',
    effects: [
      { hook: 'outcome', limit: { per: 'moment', n: 1 }, when: function (q) { return yourAttack(q) && !q.has('shot') && BREAK !== 'second'; },
        apply: function (q) {
          var st = q.st;
          q.retain('bad', 'once a moment, a lost ball is won straight back, and Build-up goes back to 0', function () {
            resetBuildup(st.fx, 'Second chance (tactic)', 'the ball was won straight back');
          });
        } }
    ]
  });

  FX.define({
    id: 'AR_METRONOME', name: 'Metronome', kind: 'captain', fam: 'buildup', buildup: true,
    text: 'Each time your team gains Build-up, it gains 1 more.',
    effects: []   /* in addBuildup: every gain that is not its own brings +1 (times the captain's shadows) */
  });

  FX.define({
    id: 'AR_THE_OPENING', name: 'The opening', kind: 'tactic', fam: 'buildup', buildup: true,
    text: 'When your Build-up is 3 or more, your next pass forward that arrives leaves the man who gets it unmarked: +2 in his next duel. Once a moment.',
    effects: [
      { hook: 'outcome', limit: { per: 'moment', n: 1 },
        when: function (q) { var A = arch(q.st); return !!A && A.buildup >= (BREAK === 'opening' ? 99 : 3) && yourAttack(q) && q.has('pass') && !q.has('back pass') && !q.has('recycle'); },
        apply: function (q) {
          var st = q.st, fx = st.fx, src0 = q.inst.name;
          q.lines().forEach(function (x) {
            if (typeof x.move !== 'number' || x.move < 1 || x.effect === 'goal') return;
            var man = x.to || q.to || q.actor;
            if (!man) return;
            q.onFire(x.band, 'Build-up is 3 or more: if the pass arrives, ' + first(man) + ' is unmarked (+2 in his next duel)', function () {
              addBoost(fx, src0, man, 2, 'Build-up was 3 or more when the pass arrived, so ' + first(man) + ' is unmarked');
            });
          });
        } }
    ]
  });

  FX.define({
    id: 'AR_FINAL_BALL', name: 'Final ball', kind: 'trait', who: 'striker', fam: 'buildup', buildup: true, encore: true,
    text: 'Build-up counts twice on his shots. But while your Build-up is below 2, his Finishing is halved (rounded down).',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.buildup > 0 && q.byOwner() && yourAttack(q) && q.has('shot') && canScore(q) && q.mineVal !== null; },
        apply: function (q) { var A = arch(q.st); part(q, A.buildup, 'Build-up ' + A.buildup + ' counts twice on his shots'); } },
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.buildup < 2 && q.byOwner() && q.mineAttr === 'finishing' && q.mineVal !== null && BREAK !== 'finalhalf'; },
        apply: function (q) { var v = q.mineVal, h = Math.floor(v / 2); if (h !== v) q.stat(h - v, 'Build-up is below 2, so his Finishing is halved (' + v + ' to ' + h + ')'); } }
    ]
  });

  FX.define({
    id: 'AR_PATIENCE', name: 'Patience', kind: 'tactic', fam: 'buildup',
    text: 'Each of your attacks can have up to 6 decisions (instead of 4, or 3 after you win the ball back).',
    effects: []   /* st.arch.capTo = 6 (match.js chainCapOf, winCapOf) */
  });

  /* ============================================================ 3. POCKETS */
  var WIDE_CARD = 'AR_C_WIDE';
  function wideMen(fx) {
    return instsOf(fx, 'AR_STAY_WIDE').map(ownerOf).filter(function (p) { var pk = pocketOf(fx, p); return pk && pk.kind === 'wide'; })
      .filter(function (p, i, a) { return a.indexOf(p) === i; });
  }
  FX.define({
    id: 'AR_STAY_WIDE', name: 'Stay wide', kind: 'trait', who: 'winger', fam: 'pockets', pocket: 'wide', encore: false,
    text: 'When he has the ball in midfield or at the edge of their box, he can play a safe pass inside and go out wide. While he is wide, every pass through by your team is +1. A pass to him while he is wide gives him +3 in his next duel, and he is no longer wide. With two players wide, passes through are +2, a pass to either gives +6, and both stop being wide.',
    effects: [
      /* he goes wide when the pass inside works */
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === WIDE_CARD && e.byOwner() && e.band !== 'bad'; },
        run: function (e) { pocketIn(e.st.fx, e.owner, 'wide', e.inst.name, first(e.owner) + ' goes out wide: every pass through by your team is +1 while he is there'); } },
      /* while he is wide: every pass through is +1 */
      { hook: 'stat', when: function (q) { var pk = pocketOf(q.st.fx, q.owner); return !!pk && pk.kind === 'wide' && q.side === 'you' && q.has('through ball') && q.mineVal !== null; },
        apply: function (q) { q.stat(1, first(q.owner) + ' is out wide (+1 to passes through)'); } },
      /* a pass to him while he is wide: +3 for every man wide, and every wide man comes back in */
      { hook: 'outcome', when: function (q) { var pk = pocketOf(q.st.fx, q.owner); return !!pk && pk.kind === 'wide' && yourAttack(q) && q.has('pass') && q.to === q.owner; },
        apply: function (q) {
          var fx = q.st.fx, man = q.owner, src0 = q.inst.name, wide = wideMen(fx), n = (BREAK === 'widerelease' ? 1 : 3) * wide.length;
          q.lines().forEach(function (x) {
            if (x.effect === 'break' || x.effect === 'goal' || typeof x.move !== 'number') return;
            if (x.to && x.to !== man) return;
            q.onFire(x.band, 'the pass finds ' + first(man) + ' out wide: +' + n + ' in his next duel' + (wide.length > 1 ? ' (' + wide.length + ' players wide)' : '') + ', and ' + (wide.length > 1 ? 'they come' : 'he comes') + ' back in', function () {
              wide.forEach(function (p) { pocketOut(fx, p, src0, first(p) + ' is no longer wide'); });
              addBoost(fx, src0, man, n, first(man) + ' got the ball out wide');
            });
          });
        } }
    ],
    pool: [{
      /* (review item 4) the release is always reachable: while he is wide, every decision of your attack where
       * someone else has the ball offers the pass out to him */
      id: 'AR_C_TOWIDE', side: 'you', zones: [0, 1, 2, 3], family: 'hold', tags: ['short pass', 'pass'],
      text: 'a pass out to the man who is wide',
      when: function (x, q) {
        var pk = pocketOf(q.st.fx, q.owner);
        return BREAK !== 'widerel' && !!pk && pk.kind === 'wide' && !!q.owner && x.actor !== q.owner && x.squad.players.indexOf(q.owner) >= 0 && !!x.foil;
      },
      build: function (x, q) {
        var w = q.owner, n = wideMen(q.st.fx).length;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'low', because: 'nobody is near him out wide', pays: 'hold', to: w,
          does: { good: 'passes it out wide to ' + first(w), mixed: 'passes it out wide to ' + first(w) + ', a little behind him', bad: 'plays it straight to {foil}' },
          label: first(x.actor) + ' passes it out wide to ' + first(w),
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'intelligence', 100) + '. If it arrives, ' + first(w) + ' has the ball, +' + (3 * n) + ' in his next duel, and ' +
            (n > 1 ? 'every man who is wide comes back in.' : 'he is no longer wide.')
        };
      }
    }, {
      id: WIDE_CARD, side: 'you', zones: [1, 2], family: 'hold', tags: ['short pass', 'pass'],
      text: 'a safe pass inside, and he goes out wide',
      when: function (x, q) {
        if (!q.owner || x.actor !== q.owner || !x.foil) return false;
        if (pocketOf(q.st.fx, q.owner)) return false;
        var mates = x.squad.players.filter(function (p) { return p !== x.actor && (p.line === 1 || p.line === 2) && !pocketOf(q.st.fx, p); });
        x._arIn = bestBy(mates, 'technique');
        return !!x._arIn;
      },
      build: function (x) {
        var m = x._arIn;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'pace' },
          risk: 'low', because: 'a short pass inside is an easy ball', pays: 'hold', to: m,
          does: { good: 'plays it inside to ' + first(m) + ' and runs out wide', mixed: 'plays it inside to ' + first(m) + ', a little behind him, and runs out wide', bad: 'plays it straight to {foil}' },
          label: first(x.actor) + ' plays it inside to ' + first(m) + ' and goes out wide',
          read: tag(x.actor, 'passing', x.legs) + ' against ' + tag(x.foil, 'pace', 100) + '. If the pass arrives, ' + first(x.actor) + ' is out wide: every pass through by your team is +1, and a pass to him gives him +3 in his next duel.'
        };
      }
    }]
  });

  FX.define({
    id: 'AR_CONDUCTOR', name: 'Conductor', kind: 'captain', fam: 'pockets', encore: false,
    text: 'At the start of each half, every player of yours who can take up a position (out wide, or pushed forward) starts in it, without spending a decision.',
    effects: [
      { on: 'moment_start', when: function (e) { return e.st.n === 0 || e.st.n === 3; },
        run: function (e) {
          var fx = e.st.fx, A = arch(e.st), half = e.st.n === 0 ? 'first' : 'second';
          if (!A || A.halfDone[half] || BREAK === 'conductor') return;
          A.halfDone[half] = true;
          var any = 0;
          fx.inst.forEach(function (x) {
            if (!yours(x) || !x.def.pocket || !fx.active(x)) return;
            var p = ownerOf(x);
            if (p && pocketIn(fx, p, x.def.pocket, e.inst.name, 'the ' + half + ' half starts: ' + first(p) + (x.def.pocket === 'wide' ? ' starts out wide' : ' starts pushed forward'))) any++;
          });
          if (!any) note(fx, e.inst.name, 'the ' + half + ' half starts: nobody who can take up a position is on the pitch');
        } }
    ]
  });

  var STEPUP = 'AR_C_STEPUP', LAUNCH = 'AR_C_LAUNCH';
  var THEIR_THROUGH = { ppass: 1, pdeep: 1, poff: 1, poffstop: 1 };
  FX.define({
    id: 'AR_STEP_FORWARD', name: 'Step forward', kind: 'trait', who: 'keeper', fam: 'pockets', pocket: 'forward', encore: false,
    text: 'When your team has the ball in your half or midfield, he can step up to the edge of his box (it always works). While he is up, their passes through are -1, but their shots from outside your box are +1. While he is up, he can launch a long ball over midfield to your striker in their box: it arrives 1 time in 2, and then your striker is unmarked (+2 to his shot). Either way he goes back to his goal.',
    effects: [
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === STEPUP && e.byOwner(); },
        run: function (e) { pocketIn(e.st.fx, e.owner, 'forward', e.inst.name, first(e.owner) + ' steps up to the edge of his box: their passes through are -1, their shots from outside your box +1'); } },
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === LAUNCH && e.byOwner(); },
        run: function (e) { pocketOut(e.st.fx, e.owner, e.inst.name, first(e.owner) + ' goes back to his goal'); } },
      /* while he is up: their passes through are -1 */
      { hook: 'stat', when: function (q) {
        var pk = pocketOf(q.st.fx, q.owner);
        if (!pk || q.side !== 'them' || q.theirVal === null) return false;
        var mv = q.st.theirMoveNow;
        return (mv && mv.kind === 'ball in behind') || !!THEIR_THROUGH[q.pays];
      },
        apply: function (q) { q.theirStat(-1, first(q.owner) + ' is up at the edge of his box, so there is less space behind your defence'); } },
      /* while he is up: their shots from outside your box are +1 */
      { hook: 'stat', when: function (q) {
        var pk = pocketOf(q.st.fx, q.owner);
        return !!pk && q.side === 'them' && q.tzone === 1 && q.theirVal !== null && (q.has('block') || q.pays === 'tdrop' || q.pays === 'tblock');
      },
        apply: function (q) { q.theirStat(1, first(q.owner) + ' is off his line, so a shot from outside your box is easier'); } }
    ],
    pool: [{
      id: STEPUP, side: 'you', zones: [0, 1], family: 'hold', tags: ['keeper action'],
      text: 'the keeper steps up',
      when: function (x, q) { return !!q.owner && q.owner === x.squad.keeper && !pocketOf(q.st.fx, q.owner) && x.actor !== q.owner; },
      build: function (x, q) {
        var k = q.owner;
        return {
          test: {}, actorMan: k, subject: x.actor, fixedOdds: { good: 1 }, risk: 'low', pays: 'hold', to: x.actor,
          checkText: 'No duel: it always works.',
          does: { good: 'holds on to it while ' + first(k) + ' steps up to the edge of his box', mixed: 'holds on to it while ' + first(k) + ' steps up to the edge of his box', bad: 'holds on to it' },
          label: first(k) + ' steps up to the edge of his box',
          read: 'No duel: it always works. The ball stays with ' + first(x.actor) + '. While ' + first(k) + ' is up, their passes through are -1 and their shots from outside your box are +1, and he can launch a long ball to your striker in their box.'
        };
      }
    }, {
      id: LAUNCH, side: 'you', zones: [0, 1], family: 'press', tags: ['long ball', 'keeper action', 'distribution', 'pass'],
      text: 'a long ball from the keeper to your striker in their box',
      when: function (x, q) {
        var pk = pocketOf(q.st.fx, q.owner);
        if (!pk || q.owner !== x.squad.keeper) return false;
        x._arSt = strikerOf(x.squad, x.actor);
        return !!x._arSt;
      },
      build: function (x, q) {
        var k = q.owner, s = x._arSt;
        return {
          test: {}, actorMan: k, subject: x.actor, fixedOdds: BREAK === 'launch' ? { good: 1 } : { good: 0.5, bad: 0.5 }, risk: 'high', pays: 'launch', to: s, mate: s,
          grants: { good: [{ id: 'unmarked', man: s }] },
          checkText: 'No duel: the long ball arrives 1 time in 2.',
          does: { good: 'plays it back to ' + first(k) + ', who launches it over midfield', mixed: 'plays it back to ' + first(k) + ', who launches it over midfield', bad: 'plays it back to ' + first(k) + ', who launches it over midfield' },
          label: first(k) + ' launches it over midfield to ' + first(s) + ' in their box',
          read: 'No duel: it arrives 1 time in 2. If it does, ' + first(s) + ' has the ball in their box, unmarked (+2 to his shot). If not, their keeper collects it and the attack is over. Either way ' + first(k) + ' goes back to his goal.'
        };
      }
    }]
  });

  var JOIN = 'AR_C_JOIN', JOINSHOT = 'AR_C_JOINSHOT';
  FX.define({
    id: 'AR_JOIN_THE_ATTACK', name: 'Join the attack', kind: 'trait', who: 'defender', fam: 'pockets', pocket: 'forward', encore: true,
    text: 'When your team has the ball in your half or midfield, he can push forward to join the attack (it always works). While he is forward, your players are -2 in every duel when they defend, and each of those duels stores +2 for him. His next duel in attack gets everything stored, and then he drops back. In their box he always has a shot of his own.',
    effects: [
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.id === JOIN && e.byOwner(); },
        run: function (e) { pocketIn(e.st.fx, e.owner, 'forward', e.inst.name, first(e.owner) + ' pushes forward: your players are -2 when they defend, and each of those duels stores +2 for him'); } },
      /* while he is forward: -2 on every defending duel of your outfield men, and each stores +2 */
      { hook: 'stat', when: function (q) { var pk = pocketOf(q.st.fx, q.owner); return !!pk && pk.kind === 'forward' && q.side === 'them' && q.mineVal !== null && !!q.actor && q.actor !== q.squad.keeper; },
        apply: function (q) {
          var fx = q.st.fx, man = q.owner, inst = q.inst;
          q.stat(-2, first(man) + ' is up the pitch (-2 to your players when they defend, +2 stored for him)', { fn: function () {
            var pk = pocketOf(fx, man);
            if (!pk) return;
            var k = encoreTake(fx, inst), add = (BREAK === 'joinstore' ? 0 : 2) * k;
            pk.store += add;
            note(fx, inst.name, 'your team defended at -2 while ' + first(man) + ' is forward: +' + add + ' stored for him (stored ' + pk.store + ')');
          } });
        } },
      /* his next duel in attack gets it all, and he drops back */
      { hook: 'stat', when: function (q) { var pk = pocketOf(q.st.fx, q.owner); return !!pk && pk.kind === 'forward' && pk.store > 0 && q.byOwner() && q.side === 'you' && q.mineVal !== null; },
        apply: function (q) {
          var fx = q.st.fx, man = q.owner, pk = pocketOf(fx, man), src0 = q.inst.name;
          q.stat(pk.store, 'everything stored while he was forward (' + pk.store + ')', { fn: function () { pocketOut(fx, man, src0, first(man) + ' used what he stored (+' + pk.store + ') and drops back'); } });
        } },
      { on: 'decision_end', when: function (e) { return e.side === 'you' && e.byOwner() && e.id !== JOIN && !!pocketOf(e.st.fx, e.owner); },
        run: function (e) { pocketOut(e.st.fx, e.owner, e.inst.name, first(e.owner) + ' had his duel in attack and drops back'); } }
    ],
    pool: [{
      /* (review item 4) cash in now: while he is forward, every decision of your attack outside their box where
       * someone else has the ball offers the ball to him for a duel of his own, with everything stored on it */
      id: 'AR_C_JOINREL', side: 'you', zones: [0, 1, 2], family: 'press', tags: ['carry', 'dribble'],
      text: 'the ball to the defender who joined the attack, for a duel of his own',
      when: function (x, q) {
        var pk = pocketOf(q.st.fx, q.owner);
        return BREAK !== 'joinrel' && !!pk && pk.kind === 'forward' && x.actor !== q.owner && x.squad.players.indexOf(q.owner) >= 0;
      },
      build: function (x, q) {
        var d = q.owner, pk = pocketOf(q.st.fx, d), last = !!(x.state && x.state.finishOnly);
        var m = OPT().markerOf(x.opp, d, x.zone >= 2 ? 0 : 1);
        var quick = (d.attr.pace || 0) > (d.attr.technique || 0);
        var shot = last && x.zone === 2 && !!x.keeper;
        var t = shot ? { mine: d, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' }
          : quick ? { mine: d, mineAttr: 'pace', theirs: m, theirsAttr: 'pace' } : { mine: d, mineAttr: 'technique', theirs: m, theirsAttr: 'defending' };
        var stored = pk.store ? ' Everything he stored goes on it (+' + pk.store + '), and then he drops back.' : ' Nothing is stored yet; he drops back after it.';
        return {
          test: t, risk: shot ? 'high' : 'even', to: d,
          bonus: shot ? -5 : undefined, because: shot ? 'he is shooting from outside the box' : undefined,
          pays: shot ? 'longshot' : last ? 'keep' : 'advance',
          does: shot ? { good: 'gets the ball from ' + first(x.actor) + ' and shoots past {foil}', mixed: 'gets the ball from ' + first(x.actor) + ' and shoots at {foil}', bad: 'gets the ball from ' + first(x.actor) + ' and shoots over' }
            : { good: 'gets the ball from ' + first(x.actor) + ' and goes past {foil}', mixed: 'gets the ball from ' + first(x.actor) + ' and gets half a metre on {foil}', bad: 'gets the ball from ' + first(x.actor) + ' and loses it to {foil}' },
          label: first(x.actor) + ' gives it to ' + first(d) + ', who has come forward, and ' + (shot ? 'he shoots' : 'he runs at ' + first(m)) + (pk.store ? ' (+' + pk.store + ' stored)' : ''),
          read: tag(d, t.mineAttr, x.legs) + ' against ' + tag(t.theirs, t.theirsAttr, 100) + '.' + stored
        };
      }
    }, {
      id: JOIN, side: 'you', zones: [0, 1], family: 'hold', tags: ['overlap', 'late run'],
      text: 'the defender pushes forward',
      when: function (x, q) { return !!q.owner && x.squad.players.indexOf(q.owner) >= 0 && !pocketOf(q.st.fx, q.owner); },
      build: function (x, q) {
        var d = q.owner;
        return {
          test: {}, actorMan: d, subject: x.actor, fixedOdds: { good: 1 }, risk: 'low', pays: 'hold', to: x.actor,
          checkText: 'No duel: it always works.',
          does: { good: 'holds on to it while ' + first(d) + ' pushes forward', mixed: 'holds on to it while ' + first(d) + ' pushes forward', bad: 'holds on to it' },
          label: first(d) + ' pushes forward to join the attack',
          read: 'No duel: it always works. The ball stays with ' + first(x.actor) + '. While ' + first(d) + ' is forward, your players are -2 when they defend, and each of those duels stores +2 for his next duel in attack.'
        };
      }
    }, {
      id: JOINSHOT, side: 'you', zones: [3], family: 'press', tags: ['shot', 'hard shot'],
      text: 'the defender who joined the attack shoots',
      when: function (x, q) { var pk = pocketOf(q.st.fx, q.owner); return !!pk && pk.kind === 'forward' && x.actor !== q.owner && !!x.keeper && x.squad.players.indexOf(q.owner) >= 0; },
      build: function (x, q) {
        var d = q.owner;
        return {
          test: { mine: d, mineAttr: 'finishing', theirs: x.keeper, theirsAttr: 'reflexes' },
          risk: 'even', bonus: 3, because: 'he is inside the box, close to goal', pays: 'shot',
          does: { good: 'gets the ball from ' + first(x.actor) + ' and shoots past {foil}', mixed: 'gets the ball from ' + first(x.actor) + ' and shoots at {foil}', bad: 'gets the ball from ' + first(x.actor) + ' and shoots straight at {foil}' },
          label: first(x.actor) + ' finds ' + first(d) + ', who has come up into their box, and he shoots',
          read: tag(d, 'finishing', x.legs) + ' against ' + tag(x.keeper, 'reflexes', 100) + '. ' + first(d) + ' joined the attack; what he stored goes on this shot, and then he drops back.'
        };
      }
    }]
  });

  /* ============================================================ 4. THE SEASON */
  FX.define({
    id: 'AR_UNBEATEN_RUN', name: 'Unbeaten run', kind: 'tactic', fam: 'season', season: true,
    text: '+1 to every duel of yours for each match in a row you have not lost. A loss sets it back to 0.',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && A.unbeaten > 0 && q.mineVal !== null && BREAK !== 'unbeaten'; },
        apply: function (q) { var A = arch(q.st); q.stat(A.unbeaten, A.unbeaten + ' match' + (A.unbeaten === 1 ? '' : 'es') + ' in a row without a loss'); } }
    ]
  });
  FX.define({
    id: 'AR_COMPETITIVE_SPIRIT', name: 'Competitive spirit', kind: 'captain', fam: 'season', season: true, encore: false, runOnly: BREAK !== 'runonly',
    text: 'Each time you sign a new player, every player in your squad gets +1 to a random stat for the rest of the run.',
    effects: []   /* between matches (the cup, Helper R); Captain's shadow makes it two random stats */
  });
  FX.define({
    id: 'AR_CONFIDENCE', name: 'Confidence', kind: 'trait', who: 'any', fam: 'season', season: true, encore: true,
    text: '+1 to all his stats for each full match he has played in this run. He loses all of it if he does not start a match or is substituted off.',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && q.actor === q.owner && q.mineVal !== null && (A.confidence[first(q.owner)] || 0) > 0; },
        apply: function (q) { var A = arch(q.st), n = A.confidence[first(q.owner)] + (BREAK === 'confidence' ? -1 : 0); part(q, n, n + ' full match' + (n === 1 ? '' : 'es') + ' in this run'); } }
    ]
  });
  FX.define({
    id: 'AR_MOMENTUM', name: 'Momentum', kind: 'trait', who: 'any', fam: 'season', season: true, encore: true,
    text: '+1 to all his stats for each duel he wins where his own stat is checked (a half win is enough). It goes back to 0 when he loses a duel. It carries over from match to match.',
    effects: [
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && q.actor === q.owner && q.mineVal !== null && (A.momentum[first(q.owner)] || 0) > 0; },
        apply: function (q) { var A = arch(q.st), n = A.momentum[first(q.owner)]; part(q, n, n + ' duel' + (n === 1 ? '' : 's') + ' won in a row'); } },
      /* only a duel where his stat is checked: never a card with no dice (review item 7) */
      { on: 'clean_win', when: function (e) { return e.actor === e.owner && (!e.sure || BREAK === 'momsure'); }, run: function (e) { momentumWin(e); } },
      { on: 'half_win', when: function (e) { return e.actor === e.owner && (!e.sure || BREAK === 'momsure'); }, run: function (e) { momentumWin(e); } },
      { on: 'loss', when: function (e) { return e.actor === e.owner && !e.sure; },
        run: function (e) {
          var A = arch(e.st), n = first(e.owner);
          if (!A || !A.momentum[n] || BREAK === 'momentumkeep') return;
          A.momentum[n] = 0;
          note(e.st.fx, e.inst.name, n + ' lost a duel, so his Momentum goes back to 0');
        } }
    ]
  });
  function momentumWin(e) {
    var A = arch(e.st), fx = e.st.fx, n = first(e.owner);
    if (!A) return;
    var k = encoreTake(fx, e.inst);
    A.momentum[n] = (A.momentum[n] || 0) + k;
    note(fx, e.inst.name, n + ' won his duel: +' + k + ' Momentum (Momentum ' + A.momentum[n] + ', +' + A.momentum[n] + ' to all his stats)');
  }
  FX.define({
    id: 'AR_SOLD_FOR_A_FEE', name: 'Sold for a fee', kind: 'tactic', fam: 'season', season: true, runOnly: true,
    text: 'When you release a player between matches, your captain gets +1 to all his stats for the rest of the run.',
    effects: []   /* between matches (the cup, Helper R) */
  });

  /* ============================================================ 5. UNDERSTUDIES */
  FX.define({
    id: 'AR_UNDERSTUDY', name: 'Understudy', kind: 'trait', who: 'any', fam: 'understudies', encore: false,
    text: 'He plays with the stats and the player traits of the man directly above him in your team sheet order, while that man is on the pitch. If that man is booked or rattled, so is he.',
    effects: [
      { hook: 'stat', when: function (q) {
        var A = arch(q.st);
        if (!A || q.actor !== q.owner || q.mineVal === null || BREAK === 'understudy') return false;
        var o = A.copies[q.owner.id];
        return !!o && q.st.fx.onPitch(o);
      },
        apply: function (q) {
          var A = arch(q.st), o = A.copies[q.owner.id], a = baseStat(q.mineAttr);
          var mine = q.owner.attr && q.owner.attr[a], his = o.attr && o.attr[a];
          if (typeof mine !== 'number' || typeof his !== 'number' || his === mine) return;
          q.stat(his - mine, 'he plays as ' + first(o) + ' (' + statWord(a) + ' ' + his + ' instead of ' + mine + ')');
        } }
    ]
  });
  FX.define({
    id: 'AR_CAPTAINS_SHADOW', name: 'Captain\'s shadow', kind: 'trait', who: 'any', fam: 'understudies', encore: false,
    text: 'While he is on the pitch, your captain\'s piece works twice.',
    effects: []   /* captainTimes(): the captain's pieces read it */
  });
  FX.define({
    id: 'AR_ENCORE', name: 'Encore', kind: 'tactic', fam: 'understudies',
    text: 'In each moment, the first player trait of yours that does something does it twice. Traits that only move the ball to a player, switch a position on or off, or work once a match are skipped.',
    effects: []   /* encoreTake, part: the traits read it */
  });
  FX.define({
    id: 'AR_BENCHWARMER', name: 'Benchwarmer', kind: 'trait', who: 'any', fam: 'understudies', encore: false, benchActive: true,
    text: 'On the bench, he gives every player on the pitch +1 to one random stat (rolled at kickoff and shown on the team sheet). On the pitch, he plays at half his stats (rounded down).',
    effects: [
      /* on the pitch: half his stats */
      { hook: 'stat', when: function (q) { return q.actor === q.owner && q.mineVal !== null && q.st.fx.onPitch(q.owner) && BREAK !== 'benchhalf'; },
        apply: function (q) { var v = q.mineVal, h = Math.floor(v / 2); if (h !== v) q.stat(h - v, 'he plays at half his stats on the pitch (' + v + ' to ' + h + ')'); } },
      /* on the bench: the rolled +1s of the men on the pitch */
      { hook: 'stat', when: function (q) { var A = arch(q.st); return !!A && !!q.actor && q.mineVal !== null && benchOn(q.st, q.owner); },
        apply: function (q) {
          var A = arch(q.st), a = baseStat(q.mineAttr), bw = q.owner;
          var hit = A.bench.filter(function (b) { return b.from === bw && b.player === q.actor && baseStat(b.stat) === a && (!b.via || benchOn(q.st, b.via)); });
          var fx = q.st.fx, viaN = hit.filter(function (b) { return !!b.via; }).length;
          if (hit.length) q.stat(hit.length, first(bw) + ' is on the bench: +' + hit.length + ' ' + statWord(a) + ' for ' + first(q.actor) + ' (rolled at kickoff' + (viaN ? ', ' + viaN + ' of them from All for One' : '') + ')',
            { fn: viaN ? function () { instsOf(fx, 'AR_ALL_FOR_ONE').forEach(function (x) { fx.countFire(x); }); } : null });
        } }
    ]
  });
  /* Patience fired: a decision of your attack that only its two extra decisions allow */
  function patience(e) {
    var A = arch(e.st), fx = e.st.fx;
    A.steps = (A.steps || 0) + 1;
    if (!A.capTo || !A.stepBase || A.steps <= A.stepBase) return;
    instsOf(fx, 'AR_PATIENCE').forEach(function (x) { fx.countFire(x); note(fx, x.name, 'decision ' + A.steps + ' of this attack: only Patience allows more than ' + A.stepBase); });
  }
  function benchOn(st, p) { return !!p && (st.squad.bench || []).indexOf(p) >= 0; }
  FX.define({
    id: 'AR_ALL_FOR_ONE', name: 'All for One', kind: 'tactic', fam: 'understudies',
    text: 'Each Benchwarmer on the bench gives one more random +1 to each player on the pitch for every other Benchwarmer on the bench.',
    effects: []   /* rolled at kickoff with the Benchwarmers' own +1s */
  });

  /* ============================================================ THE KICKOFF (an extension of attach) */
  var IDS = ['AR_SUPERB_EFFORT', 'AR_BRILLIANT_PASS', 'AR_STEADY', 'AR_GROWING_BELIEF', 'AR_SLALOM', 'AR_SPECULATIVE_SHOT', 'AR_HALFTIME_RANT', 'AR_FEEDS_OFF_IT',
    'AR_TIKI_TAKA', 'AR_CIRCULATOR', 'AR_SECOND_CHANCE', 'AR_METRONOME', 'AR_THE_OPENING', 'AR_FINAL_BALL', 'AR_PATIENCE',
    'AR_STAY_WIDE', 'AR_CONDUCTOR', 'AR_STEP_FORWARD', 'AR_JOIN_THE_ATTACK',
    'AR_UNBEATEN_RUN', 'AR_COMPETITIVE_SPIRIT', 'AR_CONFIDENCE', 'AR_MOMENTUM', 'AR_SOLD_FOR_A_FEE',
    'AR_UNDERSTUDY', 'AR_CAPTAINS_SHADOW', 'AR_ENCORE', 'AR_BENCHWARMER', 'AR_ALL_FOR_ONE'];
  /* a seeded generator of our own, so the match's dice are never touched by a roll made here */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  function sysInst(fx, id, name) {
    var def = FX.get(id);
    fx.inst.push({ def: def, owner: { kind: 'team', side: 'you' }, name: name, i: fx.inst.length, side: 'you', system: true });
  }
  function rosterOrder(st, build) {
    var sq = st.squad, eleven = [sq.keeper].concat(sq.players).filter(Boolean);
    if (!build || !build.order || !build.order.length) return eleven;
    var out = [];
    build.order.forEach(function (n) { var p = FX.findPlayer(sq, n); if (p && eleven.indexOf(p) >= 0 && out.indexOf(p) < 0) out.push(p); });
    eleven.forEach(function (p) { if (out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  FX.extensions.push(function (fx, st, build) {
    var mine = fx.inst.filter(function (x) { return yours(x) && x.def && /^AR_/.test(x.def.id); });
    if (!mine.length) return;
    var A = st.arch = mkArch(fx, st, build);
    A.copyMan = {};
    var has = function (id) { return mine.some(function (x) { return x.def.id === id; }); };
    mine.forEach(function (x) { A.has[x.def.id] = (A.has[x.def.id] || 0) + 1; });
    /* the counters' parts and the bookkeeping, after every piece */
    if (mine.some(function (x) { return x.def.belief; })) sysInst(fx, 'AR_SYS_BELIEF', 'Belief');
    if (mine.some(function (x) { return x.def.buildup; })) sysInst(fx, 'AR_SYS_BUILDUP', 'Build-up');
    sysInst(fx, 'AR_SYS_ENGINE', 'Your build');
    A.encoreHeld = has('AR_ENCORE');
    if (has('AR_PATIENCE') && BREAK !== 'patience') A.capTo = BREAK === 'patiencewin' ? 0 : 6;
    fx.onEncore = function (r) { A.encoreAt = fx.scope.moment; instsOf(fx, 'AR_ENCORE').forEach(function (x) { fx.countFire(x); }); };
    /* THE RUN (build.run, from the cup): the streaks, at kickoff */
    var run = (build && build.run) || {};
    var pl = run.players || {};
    if (has('AR_UNBEATEN_RUN')) A.unbeaten = Math.max(0, run.unbeaten || 0);
    Object.keys(pl).forEach(function (n) {
      if (typeof pl[n].confidence === 'number') A.confidence[n] = pl[n].confidence;
      if (typeof pl[n].momentum === 'number') A.momentum[n] = pl[n].momentum;
    });
    /* only a man who holds the trait uses it: the others' numbers are kept for the run report */
    fx.inst.forEach(function (x) {
      if (!yours(x) || !x.def) return;
      var p = ownerOf(x);
      if (x.def.id === 'AR_CONFIDENCE' && p && A.confidence[first(p)]) note(fx, x.name, first(p) + ' starts with +' + A.confidence[first(p)] + ' to all his stats');
      if (x.def.id === 'AR_MOMENTUM' && p && A.momentum[first(p)]) note(fx, x.name, first(p) + ' starts with Momentum ' + A.momentum[first(p)] + ' (+' + A.momentum[first(p)] + ' to all his stats)');
    });
    if (A.unbeaten) note(fx, 'Unbeaten run (tactic)', 'your team starts with +' + A.unbeaten + ' to every duel');
    /* ROSTER ORDER and the UNDERSTUDY copies, top first */
    A.order = rosterOrder(st, build);
    A.order.forEach(function (p, idx) {
      var us = fx.inst.filter(function (x) { return yours(x) && x.def.id === 'AR_UNDERSTUDY' && ownerOf(x) === p && !x.copyOf; });
      if (!us.length || idx === 0) return;
      var orig = A.order[idx - 1];
      A.copies[p.id] = orig; A.copyMan[p.id] = p;
      var theirs = fx.inst.filter(function (x) { return yours(x) && x.def.kind === 'trait' && ownerOf(x) === orig && x.def.id !== 'AR_UNDERSTUDY' && x.owner.kind === 'player'; });
      theirs.forEach(function (o) {
        var owner = { kind: 'player', player: p, side: 'you' };
        fx.inst.push({ def: o.def, owner: owner, name: o.def.name + ' (' + first(p) + ', copied from ' + first(orig) + ')', i: fx.inst.length, side: 'you',
          copyOf: o, copyFrom: orig, shareI: o.shareI !== undefined ? o.shareI : o.i });
      });
      note(fx, us[0].name, first(p) + ' plays as ' + first(orig) + ', the man above him on the team sheet' + (theirs.length ? ', with his traits (' + theirs.map(function (o) { return o.def.name; }).join(', ') + ')' : ''));
    });
    /* BENCHWARMERS: each on the bench gives every man on the pitch +1 to a random stat (All for One: one
     * more for every other Benchwarmer on the bench), rolled now from the match's seed */
    var bws = fx.inst.filter(function (x) { return yours(x) && x.def.id === 'AR_BENCHWARMER' && !x.copyOf && benchOn(st, ownerOf(x)); }).map(ownerOf)
      .filter(function (p, i, a) { return a.indexOf(p) === i; });
    if (bws.length) {
      var r = rng(((st.seed | 0) * 2654435761 + 97) >>> 0), afo = has('AR_ALL_FOR_ONE') && BREAK !== 'allforone';
      var onPitchNow = [st.squad.keeper].concat(st.squad.players).filter(Boolean);
      bws.forEach(function (bw) {
        var others = afo ? bws.filter(function (o) { return o !== bw; }) : [];
        onPitchNow.forEach(function (p) {
          var stats = Object.keys(p.attr || {}).filter(function (k) { return typeof p.attr[k] === 'number'; });
          [null].concat(others).forEach(function (via) {
            var s = stats[Math.floor(r() * stats.length)];
            A.bench.push({ from: bw, via: via, player: p, stat: s });
          });
        });
        note(fx, 'Benchwarmer (' + first(bw) + ')', first(bw) + ' is on the bench: ' + onPitchNow.map(function (p) {
          return first(p) + ' +1 ' + A.bench.filter(function (b) { return b.from === bw && b.player === p; }).map(function (b) { return statWord(b.stat); }).join(', +1 ');
        }).join('; '));
      });
    }
    /* WHEN A TRAIT WORKS: a copied trait needs its original on the pitch; a Benchwarmer works from the
     * bench too. (Gates run before the engine's own rule, effects.js active.) */
    fx.gates = fx.gates || [];
    fx.gates.push(function (inst) {
      if (inst.copyOf) return fx.onPitch(ownerOf(inst)) && fx.onPitch(inst.copyFrom) && fx.active(inst.copyOf) ? true : false;
      if (inst.def && inst.def.benchActive && yours(inst)) { var p = ownerOf(inst); return fx.onPitch(p) || benchOn(st, p) ? true : false; }
      return undefined;
    });
  });

  /* ============================================================ WHAT THE PAGE SHOWS */
  /* counters(st): every counter that matters now, with its number: [{ id, label, n, text }] */
  var COUNTER_WORDS = {
    belief: 'Belief: your team\'s belief in this match. Each point is +1 to the stat you chose for it, on every duel where that stat is checked. It starts every match at 0.',
    buildup: 'Build-up: what your team has built in this moment. Each point is +1 on every card that can score, for the rest of the moment. It goes back to 0 when a new moment starts.'
  };
  function counters(st) {
    var A = arch(st), fx = st && st.fx, out = [];
    if (!A || !fx) return out;
    var anyB = fx.inst.some(function (x) { return yours(x) && x.def && x.def.belief; });
    var anyU = fx.inst.some(function (x) { return yours(x) && x.def && x.def.buildup; });
    if (anyB) out.push({ id: 'belief', label: 'Belief', n: A.belief + (BREAK === 'counters' ? 1 : 0), stat: A.beliefStat,
      text: A.beliefStat ? 'Belief ' + A.belief + ': +' + A.belief + ' ' + statWord(A.beliefStat) + ' on every duel where it is checked.' : 'Belief ' + A.belief + ': it adds to no stat yet. Choose one for it.' });
    if (anyU) out.push({ id: 'buildup', label: 'Build-up', n: A.buildup, text: 'Build-up ' + A.buildup + ' this moment: +' + A.buildup + ' on every card that can score.' });
    Object.keys(A.pockets).forEach(function (pid) {
      var pk = A.pockets[pid];
      out.push({ id: 'pocket:' + first(pk.man), label: first(pk.man) + (pk.kind === 'wide' ? ' is wide' : ' is up'), n: pk.store || 0, man: first(pk.man), kind: pk.kind,
        text: pk.kind === 'wide' ? first(pk.man) + ' is out wide: passes through are +1.' : (pk.man === st.squad.keeper ? first(pk.man) + ' is up at the edge of his box.' : first(pk.man) + ' is forward: stored +' + (pk.store || 0) + '.') });
    });
    A.boosts.forEach(function (b) { out.push({ id: 'boost:' + first(b.man), label: first(b.man) + ' next duel', n: b.n, text: '+' + b.n + ' to ' + first(b.man) + ' in his next duel: ' + b.why + '.' }); });
    fx.inst.forEach(function (x) {
      if (!yours(x) || !x.def || x.copyOf) return;
      var p = ownerOf(x);
      if (x.def.id === 'AR_MOMENTUM' && p) out.push({ id: 'momentum:' + first(p), label: 'Momentum (' + first(p) + ')', n: A.momentum[first(p)] || 0, text: first(p) + ': Momentum ' + (A.momentum[first(p)] || 0) + ' (+' + (A.momentum[first(p)] || 0) + ' to all his stats).' });
      if (x.def.id === 'AR_CONFIDENCE' && p) out.push({ id: 'confidence:' + first(p), label: 'Confidence (' + first(p) + ')', n: A.confidence[first(p)] || 0, text: first(p) + ': +' + (A.confidence[first(p)] || 0) + ' to all his stats from full matches in this run.' });
      if (x.def.id === 'AR_UNBEATEN_RUN') out.push({ id: 'unbeaten', label: 'Unbeaten run', n: A.unbeaten, text: A.unbeaten + ' match' + (A.unbeaten === 1 ? '' : 'es') + ' without a loss: +' + A.unbeaten + ' to every duel.' });
    });
    if (A.encoreHeld) out.push({ id: 'encore', label: 'Encore', n: A.encoreAt === fx.scope.moment ? 0 : 1, text: A.encoreAt === fx.scope.moment ? 'Encore is used in this moment.' : 'Encore is ready: the next player trait to do something does it twice.' });
    return out;
  }
  /* teamSheet(st): what the team sheet shows before kickoff: the roster order, who copies whom, and the
   * Benchwarmers' rolled +1s */
  function teamSheet(st) {
    var A = arch(st);
    if (!A) return null;
    return {
      order: A.order.map(first),
      copies: Object.keys(A.copies).map(function (pid) { return { man: first(A.copyMan[pid]), copies: first(A.copies[pid]) }; }),
      bench: A.bench.map(function (b) { return { from: first(b.from), via: b.via ? first(b.via) : null, player: first(b.player), stat: b.stat, statName: statWord(b.stat) }; })
    };
  }
  /* who may hold a piece (the cup offers a trait only on an eligible player) */
  function eligible(id, p, sq) {
    var d = FX.get(id);
    if (!d || !p) return false;
    if (d.kind !== 'trait') return true;
    var w = WHO[d.who || 'any'];
    return !!w && w.test(p, sq);
  }
  /* does the piece make or read Belief (the cup asks "Belief adds to which stat?" the first time) */
  function usesBelief(id) { var d = FX.get(id); return !!(d && d.belief); }
  /* the sentence the offer and the hover show; with Encore in the build, a trait it skips says so */
  function hoverText(id, build) {
    var d = FX.get(id);
    if (!d) return '';
    var t = d.text;
    var enc = build && (build.tactics || []).indexOf('AR_ENCORE') >= 0;
    if (enc && d.kind === 'trait' && d.encore !== true) t += ' Encore cannot repeat this.';
    return t;
  }
  function list() {
    return (BREAK === 'catalogue' ? IDS.slice(1) : IDS).map(function (id) {
      var d = FX.get(id);
      return { id: id, name: d.name, kind: d.kind, who: d.kind === 'trait' ? d.who || 'any' : d.kind === 'captain' ? 'captain' : null,
        whoWord: d.kind === 'trait' ? WHO[d.who || 'any'].word : d.kind === 'captain' ? 'your captain' : 'the team',
        text: d.text, belief: !!d.belief, runOnly: !!d.runOnly, encore: d.kind === 'trait' ? d.encore === true : null };
    });
  }

  var API = { IDS: IDS, STATS: STATS, list: list, counters: counters, teamSheet: teamSheet, eligible: eligible, usesBelief: usesBelief, hoverText: hoverText,
    COUNTER_WORDS: COUNTER_WORDS, WHO: WHO, isStriker: isStriker, isWinger: isWinger, rattled: rattled, statWord: statWord,
    /* for opponents.js and the checks */
    arch: arch, addBelief: addBelief, addBuildup: addBuildup, pocketOf: pocketOf, captainTimes: captainTimes, encoreFree: encoreFree, BREAK: BREAK };
  root.KMArchetypes = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
