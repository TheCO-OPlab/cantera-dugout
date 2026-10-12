/* w0b TEST COMPONENTS: the plumbing added in w0b (real substitutions, the
 * opponent's stamina, outcome helpers on defence, opponent builds, the
 * possession_start order), one small component per capability so
 * fxcheck.js can load each on its own and show it changes exactly what it
 * says. Like components.js's five, they are plain and NOT balanced: they
 * prove the plumbing, nobody should playtest them.
 *
 * Kept in their own file so the content waves (which add to components.js)
 * merge without touching this one. Loaded after effects.js, by play.html
 * and by fxcheck.js.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }

  /* THE BENCH: a trait for a bench player. It acts only once he is on the
   * pitch (effects.js active): +1 to everything he does (not to the card
   * that brings him on, where he is still on the bench), a note when his
   * team starts an attack, and a note when he goes off (his last event). */
  FX.define({
    id: 'TEST_BENCH', name: 'Test: Fresh finisher', kind: 'trait',
    text: 'On the pitch only: +1 to everything he does; says so when an attack of yours starts.',
    effects: [
      { name: 'stat', hook: 'stat', when: function (q) { return q.byOwner(); },
        apply: function (q) { q.stat(1, 'he came on fresh'); } },
      { name: 'poss', on: 'possession_start', when: function (e) { return e.side === 'you'; },
        run: function (e) { e.note(first(e.owner) + ' is on the pitch for this attack'); } },
      { name: 'leave', on: 'sub_out', when: function (e) { return e.player === e.owner; },
        run: function (e) { e.note(first(e.owner) + ' goes off'); } }
    ]
  });

  /* WEAR THEM DOWN: a pressing forward's clean wins tire their defence, and
   * his running option also costs them stamina (q.tire) */
  FX.define({
    id: 'TEST_WEAR', name: 'Test: Wears them down', kind: 'trait',
    text: 'Each of his clean wins costs their defence 12 stamina; his dribbles cost their defence 5 more when chosen.',
    effects: [
      { name: 'tire', on: 'clean_win', when: function (e) { return e.byOwner(); },
        run: function (e) { e.tire('def', 12, 'he keeps running at them'); } },
      { name: 'tireOpt', hook: 'cost', when: function (q) { return q.byOwner() && q.has('dribble'); },
        apply: function (q) { q.tire(5, 'def', 'their defence loses 5 stamina chasing him'); } }
    ]
  });

  /* THE DEFENCE: outcome helpers on defending decisions (their attack) */
  FX.define({
    id: 'TEST_DEF', name: 'Test: Counter start', kind: 'tactic',
    text: 'On defence: a clean win starts your attack in midfield, with your best passer on the ball, +2 to your next duel and one more decision; a stop that would only end their attack wins you the ball.',
    effects: [
      { name: 'move', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.setMove('good', 1, 'if you win it, your attack starts in midfield'); } },
      { name: 'to', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) {
          var mids = q.squad.players.filter(function (p) { return p.line === 1; })
            .sort(function (a, b) { return (b.attr.passing || 0) - (a.attr.passing || 0); });
          if (mids[0]) q.setTo('good', mids[0], first(mids[0]) + ' gets the ball when you win it');
        } },
      { name: 'edge', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.grant('good', { n: 2, why: 'you won it cleanly' }, 'you won it cleanly'); } },
      { name: 'branch', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.branch('good', { move: 0 }, 'your team keeps the ball, and your attack starts in your half'); } },
      { name: 'extra', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.extraDecision('good', 'the attack this starts gets one more decision'); } }
    ]
  });

  /* POSSESSION START: fires before the first menu of an attack, so what it
   * puts in place is on that first menu */
  FX.define({
    id: 'TEST_POSS', name: 'Test: Fast start', kind: 'tactic',
    text: 'When your attack starts, your team is in form for it: +1 to every duel in that attack.',
    effects: [
      { name: 'start', on: 'possession_start', when: function (e) { return e.side === 'you'; },
        run: function (e) { e.addState('in form', 'team', { duration: 'possession' }, 'your team starts this attack in form'); } },
      { name: 'stat', hook: 'stat', when: function (q) { return q.side === 'you' && q.hasState('in form', 'team'); },
        apply: function (q) { q.stat(1, 'your team is in form this attack'); } }
    ]
  });

  /* OPPONENT BUILDS: counters that tax or resist a route without shutting it */
  FX.define({
    id: 'TEST_AERIAL_KEEPER', name: 'Test: Aerial keeper', kind: 'trait',
    text: 'Their keeper comes for every high ball: +2 to them against your crosses and headers (the route is harder, not closed).',
    effects: [
      { name: 'resist', hook: 'stat', when: function (q) { return q.side === 'you' && (q.has('cross') || q.has('header')) && !q.has('low cross'); },
        apply: function (q) { q.theirStat(2, 'their keeper comes for every high ball'); } }
    ]
  });
  FX.define({
    id: 'TEST_PRESS_MID', name: 'Test: Pressing midfield', kind: 'tactic',
    text: 'Their midfield presses: your options in midfield cost 4 more stamina; when your man loses a duel in midfield, they get +1 in the next decision.',
    effects: [
      { name: 'tax', hook: 'cost', when: function (q) { return q.side === 'you' && q.zone === 1; },
        apply: function (q) { q.costBy(4, 'their midfield presses: 4 more stamina'); } },
      { name: 'edge', on: 'loss', when: function (e) { return e.side === 'you' && e.zone === 1; },
        run: function (e) { e.addEdge({ n: 1, why: 'they won it in midfield' }, 'they won it in midfield'); } }
    ]
  });
  /* an opponent's outcome helpers: on their attack they keep the ball
   * going; on yours they take a clean pass back to square one */
  FX.define({
    id: 'TEST_OPP_ROUTE', name: 'Test: Keep the ball', kind: 'tactic',
    text: 'On their attack: a stop that would end it keeps it going where it is, their best finisher gets the ball when they get past you, and they get +1 in the next decision. On yours: a clean carry goes no further than a half-won one.',
    effects: [
      { name: 'branch', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.branch('mixed', {}, 'they keep the ball and go again'); } },
      { name: 'to', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) {
          var f = q.opp.players.filter(function (p) { return p.line === 2; }).sort(function (a, b) { return (b.attr.finishing || 0) - (a.attr.finishing || 0); })[0];
          if (f) q.setTo('bad', f, first(f) + ' gets the ball');
        } },
      { name: 'edge', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.grant('bad', { n: 1, why: 'they got past you' }, 'they got past you'); } },
      { name: 'move', hook: 'outcome', when: function (q) { return q.side === 'you' && q.has('carry'); },
        apply: function (q) {
          var g = q.lines().filter(function (x) { return x.band === 'good' && typeof x.move === 'number' && x.move > 0; })[0];
          if (g) q.setMove('good', g.move - 1, 'their midfield drops off: the run goes one zone less far');
        } }
    ]
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = { loaded: true };
})(typeof window !== 'undefined' ? window : globalThis);
