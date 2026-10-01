/* COMPONENTS: the content the effects layer runs (effects.js). Later waves
 * add their tactics, traits, specialisations, relationships and captains
 * here (or in files like it) with KMEffects.define. Nothing here runs unless
 * a build names it.
 *
 * w0 ships only TEST components: five that between them use every hook, one
 * per hook group (effects.js GROUPS), and one amplifier for the recursion
 * test. They are deliberately plain and are not balanced for play: they
 * exist so fxcheck.js can show each hook changes exactly what it says.
 * Each effect has a `name` so a test can load it on its own.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function best(list, attr) {
    return list.slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null;
  }

  /* 1. DUEL group (hooks 'stat' and 'duel'): a trait on a forward */
  FX.define({
    id: 'TEST_DUEL', name: 'Test: Sharp finisher', kind: 'trait',
    text: 'His shots are +1 and a clean win needs only 3; he rolls two dice on a dribble; a half win on his passes counts as a clean win; their keeper is -1 against his placed shot.',
    effects: [
      { name: 'stat', hook: 'stat', when: function (q) { return q.byOwner() && q.has('shot'); },
        apply: function (q) { q.stat(1, 'he is sharp today'); } },
      { name: 'theirStat', hook: 'stat', when: function (q) { return q.byOwner() && q.has('placed shot'); },
        apply: function (q) { q.theirStat(-1, 'the keeper cannot read where he aims'); } },
      { name: 'stack', hook: 'stat', when: function (q) { return q.byOwner() && q.has('shot'); },
        apply: function (q) { q.stackEdges('edges from earlier decisions add up on his shots'); } },
      { name: 'dice', hook: 'duel', when: function (q) { return q.byOwner() && q.has('dribble'); },
        apply: function (q) { q.dice(2, first(q.actor) + ' rolls two dice on a dribble and keeps the higher'); } },
      { name: 'threshold', hook: 'duel', when: function (q) { return q.byOwner() && q.has('shot'); },
        apply: function (q) { q.threshold(3, 'a clean win on his shot needs 3 or more, not 4'); } },
      { name: 'tier', hook: 'duel', when: function (q) { return q.byOwner() && q.has('pass') && !q.has('back pass'); },
        apply: function (q) { q.tier('mixed', 'good', 'a half win on his pass counts as a clean win'); } }
    ]
  });

  /* 2. CONSEQUENCE group (hook 'outcome'): a tactic */
  FX.define({
    id: 'TEST_ROUTE', name: 'Test: Direct route', kind: 'tactic',
    text: 'A clean forward pass leaves the receiver unmarked for his next shot; a clean run with the ball goes a zone further; a clean layoff goes to your best finisher; one saved shot an attack stays with the shooter; a clean one-two or layoff gives the attack one more decision.',
    effects: [
      { name: 'edge', hook: 'outcome', when: function (q) { return q.side === 'you' && q.has('pass') && !q.has('back pass') && !q.has('recycle'); },
        apply: function (q) {
          var g = q.lines().filter(function (x) { return x.band === 'good' && typeof x.move === 'number' && x.move >= 1; })[0];
          if (!g) return;
          var man = g.to || q.to || q.actor;
          q.grant('good', { n: 2, tags: ['shot'], man: man, why: first(man) + ' arrives unmarked' }, first(man) + ' arrives unmarked');
        } },
      { name: 'move', hook: 'outcome', when: function (q) { return q.side === 'you' && q.has('carry'); },
        apply: function (q) {
          var g = q.lines().filter(function (x) { return x.band === 'good' && typeof x.move === 'number'; })[0];
          if (!g || q.zone + g.move + 1 > 3) return;
          q.setMove('good', g.move + 1, 'the run takes the ball one zone further');
        } },
      { name: 'to', hook: 'outcome', when: function (q) { return q.side === 'you' && q.has('layoff'); },
        apply: function (q) {
          var f = best(q.squad.players.filter(function (p) { return p.line === 2 && p !== q.actor && p !== q.to; }), 'finishing');
          if (f) q.setTo('good', f, first(f) + ' gets the ball instead');
        } },
      { name: 'branch', hook: 'outcome', limit: { per: 'possession', n: 1 }, when: function (q) { return q.side === 'you' && q.has('shot') && q.zone === 3; },
        apply: function (q) {
          var s = q.lines().filter(function (x) { return x.band === 'mixed' && x.effect === 'nothing'; })[0];
          if (!s) return;
          q.branch('mixed', { effect: 'ground', move: 0, to: q.actor }, 'the save falls back to ' + first(q.actor) + ' in their box');
        } },
      { name: 'extra', hook: 'outcome', when: function (q) { return q.side === 'you' && (q.has('one-two') || q.has('layoff')); },
        apply: function (q) { q.extraDecision('good', 'a clean ' + (q.has('one-two') ? 'one-two' : 'layoff') + ' gives this attack one more decision'); } }
    ]
  });

  /* 3. ECONOMY group (hook 'cost' and the stamina events): a relationship */
  FX.define({
    id: 'TEST_ENGINE', name: 'Test: Engine room', kind: 'relationship',
    text: 'Their running costs 8 less stamina; the first short pass either makes in an attack does not use up a decision; winning the ball back gives midfield 10 stamina (once an attack); a clean win by either gives midfield 5 (once a moment).',
    effects: [
      { name: 'cost', hook: 'cost', when: function (q) { return q.byPair(); },
        apply: function (q) { q.costBy(-8, 'costs 8 less stamina: ' + first(q.pair[0]) + ' and ' + first(q.pair[1]) + ' cover for each other'); } },
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 }, when: function (q) { return q.byPair() && q.has('short pass') && q.side === 'you'; },
        apply: function (q) { q.freeDecision('the first short pass between them in an attack does not use up a decision'); } },
      { name: 'refund', on: 'recovery', limit: { per: 'possession', n: 1 }, when: function (e) { return e.byPair(); },
        run: function (e) { e.refund('mid', 10, 'winning the ball back gives the midfield a breather'); } },
      { name: 'cleanRefund', on: 'clean_win', limit: { per: 'moment', n: 1 }, when: function (e) { return e.byPair(); },
        run: function (e) { e.refund('mid', 5, 'a clean win by the pair'); } }
    ]
  });

  /* 4. MENU group (hooks 'tags', 'option' and pool): a tactic */
  FX.define({
    id: 'TEST_MENU', name: 'Test: Short game', kind: 'tactic',
    text: 'A cut-back also counts as a layoff; a switch no longer counts as a long ball; no long ball from the back is offered; the pass into midfield goes to your captain; your captain can call for the ball in midfield.',
    effects: [
      { name: 'addTag', hook: 'tags', when: function (q) { return q.has('cut-back'); },
        apply: function (q) { q.addTag('layoff', 'a cut-back counts as a layoff too'); } },
      { name: 'removeTag', hook: 'tags', when: function (q) { return q.has('switch'); },
        apply: function (q) { q.removeTag('long ball', 'a switch here is played short and low, not as a long ball'); } },
      { name: 'remove', hook: 'option', when: function (q) { return q.id === 'Z_LONG_UP'; },
        apply: function (q) { q.remove('no long ball from the back in this team'); } },
      { name: 'recipient', hook: 'option', when: function (q) { return q.id === 'Z_PASS_MID' && q.captain && q.captain.line === 1 && q.captain !== q.actor && q.to !== q.captain; },
        apply: function (q) { q.setRecipient(q.captain, 'the pass into midfield goes to the captain, ' + first(q.captain)); } }
    ],
    pool: [
      { id: 'FXT_CAPTAIN_CALLS', side: 'you', zones: [1], family: 'hold', tags: ['short pass', 'pass'],
        text: 'the captain calls for the ball',
        when: function (x, q) { return !!q.captain && q.captain.line === 1 && q.captain !== x.actor && !!x.foil; },
        build: function (x, q) {
          var c = q.captain;
          return {
            test: { mine: x.actor, mineAttr: 'passing', theirs: x.foil, theirsAttr: 'intelligence' },
            risk: 'even',
            does: { good: 'plays it to ' + first(c) + ', who called for it', mixed: 'gets it to ' + first(c) + ', just', bad: 'plays it towards ' + first(c) + ', but {foil} cuts it out' },
            pays: 'hold', to: c,
            label: first(x.actor) + ' plays it to ' + first(c) + ', who is calling for it',
            read: first(c) + ' is your captain and calls for the ball. ' + q.first(x.actor) + ' passes to him in midfield.'
          };
        } }
    ]
  });

  /* 5. OPPONENT group (hooks 'counter', 'learn', and states on them): a trait */
  FX.define({
    id: 'TEST_READ', name: 'Test: Reads the keeper', kind: 'trait',
    text: 'After his hard shot their keeper is adapted to hard shots for the match; his placed shot is +2 against a keeper adapted to hard shots; defenders who learned his dribble get nothing for it; they learn nothing from his passes.',
    effects: [
      { name: 'adapt', on: 'shot', when: function (e) { return e.byOwner() && e.has('hard shot'); },
        run: function (e) { if (!e.hasState('adapted', e.st.opp.keeper, 'hard shot')) e.addState('adapted', e.st.opp.keeper, { value: 'hard shot', duration: 'match' }, 'their keeper is now set for hard shots'); } },
      { name: 'payoff', hook: 'stat', when: function (q) { return q.byOwner() && q.has('placed shot') && q.hasState('adapted', q.opp.keeper, 'hard shot'); },
        apply: function (q) { q.stat(2, 'their keeper is set for a hard shot'); } },
      { name: 'counter', hook: 'counter', when: function (q) { return q.byOwner() && q.has('dribble'); },
        apply: function (q) { q.cancel('has seen this', 'he never does the same trick twice: what they learned does not count'); } },
      { name: 'learn', hook: 'learn', when: function (q) { return q.byOwner() && q.has('pass'); },
        apply: function (q) { q.forget('his passes are disguised: they learn nothing from this one'); } }
    ]
  });

  /* the amplifier (captain): repeats a stamina refund once an attack.
   * fromEffects: a refund made by another effect counts, which is the
   * point; the limit is what stops it hearing its own refund */
  FX.define({
    id: 'TEST_ECHO', name: 'Test: Echo', kind: 'captain',
    text: 'Once an attack, the captain repeats a stamina refund.',
    effects: [
      { name: 'echo', on: 'stamina_refunded', fromEffects: true, limit: { per: 'possession', n: 1 },
        run: function (e) { e.refund(e.line, e.amount, 'the captain repeats the refund'); } }
    ]
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = { loaded: true };
})(typeof window !== 'undefined' ? window : globalThis);
