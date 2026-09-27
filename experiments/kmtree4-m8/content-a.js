/* CONTENT A (wave w1a): components that CREATE, CONVERT and PAY OFF
 * advantages, for four build families and the bridges between them:
 *   the layoff engine, the loaded flank, stretch and thread, bait and switch.
 *
 * Every rule here reads action TAGS and shared STATES (unmarked, out of
 * position, stretched, marked), never an option id or a named player, so a
 * producer written later feeds a payoff written now. Each component names
 * itself on the card (the helpers' records) and in the log when it fires.
 * Nothing here runs unless a build names it (effects.js).
 *
 * Load after effects.js (and components.js). In node: require('./content-a.js').
 * Plain English, no dashes in any sentence a player reads.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function O() { return root.KMOptions || require('./options.js'); }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function lane(p) { return O().lane(p); }
  var SIDE = ['left', 'middle', 'right'];
  var LINE = ['def', 'mid', 'att'];

  /* ------------------------------------------------ match memory */
  /* Hooks see the option, not the match, so each component carries three
   * silent bookkeeping effects (track*) that remember, per match, who has
   * touched the ball in this attack, which flank it has been on, and where
   * space was made. They change nothing in the match and write no log line;
   * idempotent, so several components carrying them count once. */
  var STS = new WeakMap(), STP = new WeakMap(), MEM = new WeakMap();
  function mem(st) {
    var m = MEM.get(st);
    if (!m) {
      m = { dec: -1, poss: -1, mom: -1, touched: {}, lanes: [], space: {}, yourDone: 0, rehearsed: 0,
        third: false, passOn: null, swapped: null };
      MEM.set(st, m);
    }
    return m;
  }
  function remember(st) {
    STS.set(st.squad, st);
    st.squad.players.concat(st.squad.keeper ? [st.squad.keeper] : []).concat(st.squad.bench || []).forEach(function (p) { STP.set(p, st); });
  }
  function stOf(q) { return (q.squad && STS.get(q.squad)) || (q.actor && STP.get(q.actor)) || (q.owner && STP.get(q.owner)) || null; }
  /* who has the ball on the decision being built, and on the one decided */
  function carrierNow(st) { return st && st.chain && st.chain.next === 'zone' ? st.chain.carrier : null; }
  function passerOf(e) { return e.st.pending && e.st.pending.carrier ? e.st.pending.carrier : e.actor; }
  function onPitch(st, p) { return !!p && st.squad.players.indexOf(p) >= 0; }
  var TRACK = [
    { name: 'track', on: 'moment_start', run: function (e) {
      remember(e.st);
      var m = mem(e.st);
      if (m.mom === e.st.fx.scope.moment) return;
      m.mom = e.st.fx.scope.moment;
    } },
    { name: 'track', on: 'decision_end', run: function (e) {
      var st = e.st, m = mem(st);
      remember(st);
      if (m.dec === st.fx.scope.decision) return;
      m.dec = st.fx.scope.decision;
      if (e.side !== 'you') return;
      var pas = passerOf(e);
      if (!m.lanes.length && pas) m.lanes.push(lane(pas));
      if (pas) m.touched[pas.id] = 1;
      if (e.actor && e.actor !== e.to) m.touched[e.actor.id] = 1;
      var nc = carrierNow(st);
      if (nc) m.lanes.push(lane(nc));
      ((st.chain && st.chain.next === 'zone' && st.chain.carried) || []).forEach(function (c) {
        if (c.id === 'space' && typeof c.lane === 'number') m.space[c.lane] = 1;
      });
    } },
    { name: 'track', on: 'possession_end', run: function (e) {
      var st = e.st, m = mem(st);
      if (m.poss === st.fx.scope.possession) return;
      m.poss = st.fx.scope.possession;
      if (e.side === 'you') m.yourDone++;
      m.touched = {}; m.lanes = []; m.space = {}; m.third = false; m.passOn = null;
    } }
  ];
  function define(d) {
    /* first, so every effect of the component sees this decision's memory */
    d.effects = TRACK.concat(d.effects || []);
    return FX.define(d);
  }

  /* ------------------------------------------------ shared readings */
  function learnOf(st) { return (st && st.cmem && st.cmem.learn) || {}; }
  /* a player of yours is WATCHED: they put a man on him at half-time
   * (state marked), or a defender has learned a move of his */
  function watched(st, p) {
    if (!st || !p) return false;
    if (st.fx.hasState('marked', p)) return true;
    var L = learnOf(st), B = (st.cmem && st.cmem.beat) || {};
    return Object.keys(L).some(function (k) { return L[k] >= 1 && B[k] === p; });
  }
  /* their defence is stretched: a stored state (any producer) or the
   * engine's own edge from a switch this decision carries */
  function stretchedNow(st) {
    if (!st) return false;
    if (st.fx.hasState('stretched', 'opponent')) return true;
    return st.fx.carried().some(function (c) { return c.id === 'stretched'; });
  }
  /* the flank a build loads: the side with more wingers, crossers and
   * runners among your outfield players (ties: more players; then right) */
  var WIDE_ROLES = ['winger', 'crosser', 'runner'];
  function wideCount(sq, L) {
    return sq.players.filter(function (p) {
      return lane(p) === L && (p.roles || []).some(function (r) { return WIDE_ROLES.indexOf(r) >= 0; });
    }).length;
  }
  function loadedFlank(sq) {
    var a = wideCount(sq, 0), b = wideCount(sq, 2);
    if (a !== b) return a > b ? 0 : 2;
    var n0 = sq.players.filter(function (p) { return lane(p) === 0; }).length, n2 = sq.players.filter(function (p) { return lane(p) === 2; }).length;
    return n0 > n2 ? 0 : 2;
  }
  function bestBy(list, attr) {
    return list.slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null;
  }
  function withRole(sq, role) { return sq.players.filter(function (p) { return (p.roles || []).indexOf(role) >= 0; }); }
  function finisherOf(sq, not) {
    var f = withRole(sq, 'finisher').filter(function (p) { return not.indexOf(p) < 0; });
    return f[0] || bestBy(sq.players.filter(function (p) { return p.line >= 1 && not.indexOf(p) < 0; }), 'finishing');
  }
  function runnerOf(sq, not) {
    var r = withRole(sq, 'runner').filter(function (p) { return not.indexOf(p) < 0; });
    return r[0] || bestBy(sq.players.filter(function (p) { return p.line >= 1 && not.indexOf(p) < 0; }), 'pace');
  }
  /* an edge for a pool option's result, in effects.js's own shape */
  function edgeFor(src, n, man, tags, why, q) {
    var head = why.charAt(0).toUpperCase() + why.slice(1) + ': ';
    var next = '+' + n + ' to ' + (man ? first(man) + '\'s ' : 'your ') + 'next ' + (tags && tags.length ? tags.join(' or ') : 'duel');
    /* m2 (x1 variant c, on by default): the edge lasts your attack, and says so */
    var long = '+' + n + (man ? ' to ' + first(man) : '') + (tags && tags.length ? (man ? '\'s ' : ' to your ') + tags.join(' and ') : '') + ' in this attack';
    var lasting = !!(q && q.lasts);
    return { id: 'fx', n: n, tags: tags || null, man: man || null, source: src, why: why, lasting: lasting,
      text: head + (lasting ? long : next), textNext: head + next, textLong: head + long };
  }
  var FWD = ['through ball', 'forward pass', 'long ball', 'run in behind'];
  function forwardBall(q) { return FWD.some(function (t) { return q.has(t); }); }
  function realPass(q) { return q.has('pass') && !q.has('back pass') && !q.has('recycle'); }
  /* a stored stretched state keeps its +2 on every decision of the attack:
   * re-granted as an edge (edges do not stack, so two producers give one) */
  var STRETCH_TAGS = ['through ball', 'run in behind', 'cut-back', 'pull-back', 'square ball'];
  function keepStretched() {
    return { name: 'keep', on: 'decision_end', fromEffects: false,
      when: function (e) { return e.side === 'you' && e.st.chain && e.st.chain.next === 'zone' && e.st.fx.states.some(function (s) { return s.name === 'stretched' && s.on.id === 'opponent'; }); },
      run: function (e) {
        var has = (e.st.chain.carried || []).some(function (c) { return (c.id === 'fx' && /defence is still stretched/.test(c.why)) || c.id === 'stretched'; });
        if (!has) e.addEdge({ n: 2, tags: STRETCH_TAGS, why: 'their defence is still stretched' }, 'their defence is still stretched');
      } };
  }

  /* ============================================ THE LAYOFF ENGINE */

  /* the man a layoff goes to: your finisher (not your runner, who is the
   * third man, and not the target man himself) */
  function layoffTarget(sq, not) {
    var skip = not.concat(withRole(sq, 'target man'), withRole(sq, 'runner'));
    return finisherOf(sq, skip) || finisherOf(sq, not);
  }
  function layoffUnmarked(e) {
    e.addState('unmarked', e.to, { duration: 'possession' }, first(e.to) + ' is unmarked after the layoff');
  }
  define({
    id: 'TR_WALL', name: 'Lays it off', kind: 'trait',
    text: 'In midfield or at the edge of their box, a teammate can play the ball into his feet and he lays it off first time to your finisher, who is unmarked (+2 to him in this attack). A half win: he holds it up and keeps it. When he has the ball himself at the edge of their box or in it, he can lay it off the same way. Both count as layoffs.',
    effects: [
      { name: 'unmarked', on: 'clean_win', when: function (e) { return e.side === 'you' && e.has('layoff') && (e.byOwner() || e.id === 'FXA_WALL') && e.to && e.to !== e.owner && e.effect === 'ground'; },
        run: layoffUnmarked },
      { name: 'unmarked', on: 'half_win', when: function (e) { return e.side === 'you' && e.has('layoff') && e.byOwner() && e.id === 'FXA_LAYOFF' && e.to && e.to !== e.owner; },
        run: layoffUnmarked }
    ],
    pool: [{
      /* the ball into his feet and straight off again */
      id: 'FXA_WALL', side: 'you', zones: [1, 2], family: 'move', tags: ['layoff', 'forward pass', 'short pass', 'pass'],
      text: 'the ball can be played into his feet for him to lay off',
      when: function (x, q) {
        var me = q.owner;
        if (!me || x.actor === me || x.squad.players.indexOf(me) < 0 || !x.actor || typeof x.actor.line !== 'number') return false;
        x._fxWr = layoffTarget(x.squad, [me, x.actor]);
        x._fxWm = O().markerOf(x.opp, me, 0);
        return !!x._fxWr && !!x._fxWm;
      },
      build: function (x, q) {
        var me = q.owner, r = x._fxWr, m = x._fxWm, src = 'Lays it off (' + first(me) + ')';
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: m, theirsAttr: 'defending' },
          risk: 'even', bonus: 2, because: 'a pass into his feet is a short, simple ball', to: r, tos: { mixed: me },
          grants: { good: [edgeFor(src, 2, r, null, first(r) + ' is unmarked after the layoff', q)] },
          does: {
            good: 'plays it into ' + first(me) + ', who lays it off first time to ' + first(r) + ',',
            mixed: 'plays it into ' + first(me) + ', who holds off {foil} but cannot turn,',
            bad: 'plays it into ' + first(me) + ', and {foil} gets in front of him'
          },
          pays: 'probe',
          label: first(x.actor) + ' plays it into ' + first(me) + ' to lay off for ' + first(r),
          read: O().tag(x.actor, 'passing', x.legs) + ' against ' + O().tag(m, 'defending', 100) + ', who is marking ' + first(me) + '. If it comes off, ' +
            first(r) + ' has the ball ' + O().ZONE_AT[Math.min(3, x.zone + 1)] + ' with nobody on him (+2 to him in this attack).'
        };
      }
    }, {
      /* he has it himself: hold it up and set a teammate */
      id: 'FXA_LAYOFF', side: 'you', zones: [2, 3], family: 'hold', tags: ['layoff', 'short pass', 'pass'],
      text: 'he can hold the ball up and lay it off',
      when: function (x, q) {
        if (x.actor !== q.owner || !x.foil) return false;
        x._fxLay = layoffTarget(x.squad, [q.owner, x.prev].filter(Boolean));
        return !!x._fxLay;
      },
      build: function (x, q) {
        var r = x._fxLay, me = q.owner, src = 'Lays it off (' + first(me) + ')';
        var ed = edgeFor(src, 2, r, null, first(r) + ' is unmarked after the layoff', q);
        return {
          test: { mine: me, mineAttr: 'physical', theirs: x.foil, theirsAttr: 'physical' },
          risk: 'low', because: first(me) + ' only has to hold off ' + first(x.foil) + ' and play it short', to: r,
          grants: { good: [ed], mixed: [ed] },
          does: {
            good: 'holds off {foil} and lays it off to ' + first(r) + ',',
            mixed: 'lays it off to ' + first(r) + ' with {foil} on his back,',
            bad: 'loses it to {foil}'
          },
          pays: 'hold',
          label: first(me) + ' holds it up and lays it off to ' + first(r),
          read: O().tag(me, 'physical', x.legs) + ' against ' + O().tag(x.foil, 'physical', 100) + '. ' + first(r) +
            ' gets the ball ' + O().ZONE_AT[x.zone] + ' with nobody on him (+2 to him in this attack).'
        };
      }
    }]
  });

  /* BRIDGE: the layoff family into stretch and thread */
  define({
    id: 'TR_DRAG', name: 'Drops deep', kind: 'trait',
    text: 'He comes short for the ball and a centre-back follows him. When a layoff of his comes off (a half win is enough), their defence is stretched for the rest of the attack (+2 to a pass through, a cut-back, a pull-back or a pass across the goal).',
    effects: [
      { name: 'stretch', on: 'clean_win',
        when: function (e) { return e.side === 'you' && e.has('layoff') && (e.byOwner() || e.id === 'FXA_WALL') && e.st.chain && e.st.chain.next === 'zone' && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, first(e.owner) + ' dropped deep and a centre-back went with him: their defence is stretched for the rest of the attack'); } },
      { name: 'stretch', on: 'half_win',
        when: function (e) { return e.side === 'you' && e.has('layoff') && (e.byOwner() || e.id === 'FXA_WALL') && e.st.chain && e.st.chain.next === 'zone' && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, first(e.owner) + ' dropped deep and a centre-back went with him: their defence is stretched for the rest of the attack'); } },
      keepStretched()
    ]
  });

  define({
    id: 'TA_THIRD_MAN', name: 'Third man runs', kind: 'tactic',
    text: 'After a layoff comes off (any pass that counts as a layoff, a half win is enough), your runner is already moving: in midfield or at the edge of their box, the man on the ball can slide it through for him (if it comes off he is in their box, running at their goal: +2 to him in this attack), or in their box square it to him (a clean pass is a goal). Once an attack.',
    effects: [
      { name: 'arm', on: 'clean_win', when: function (e) { return e.side === 'you' && e.has('layoff') && !mem(e.st).third && e.st.chain && e.st.chain.next === 'zone'; },
        run: function (e) { mem(e.st).third = true; var r = runnerOf(e.st.squad, [carrierNow(e.st)]); e.note('a layoff came off: ' + first(r) + ', the third man, is running'); } },
      { name: 'arm', on: 'half_win', when: function (e) { return e.side === 'you' && e.has('layoff') && !mem(e.st).third && e.st.chain && e.st.chain.next === 'zone'; },
        run: function (e) { mem(e.st).third = true; var r = runnerOf(e.st.squad, [carrierNow(e.st)]); e.note('a layoff came off: ' + first(r) + ', the third man, is running'); } },
      { name: 'used', on: 'decision_end', when: function (e) { return e.side === 'you' && (e.id === 'FXA_THIRD' || e.id === 'FXA_THIRD_BOX'); },
        run: function (e) { mem(e.st).thirdUsed = e.st.fx.scope.possession; mem(e.st).third = false; } }
    ],
    pool: [{
      id: 'FXA_THIRD', side: 'you', zones: [1, 2], family: 'press', tags: ['through ball', 'forward pass', 'pass'],
      text: 'after a layoff the third man is running',
      when: function (x, q) {
        var st = STS.get(x.squad);
        if (!st || !mem(st).third || mem(st).thirdUsed === st.fx.scope.possession) return false;
        var r = runnerOf(x.squad, [x.actor]);
        if (!r || r === x.actor) return false;
        x._fxTr = r; x._fxTd = O().markerOf(x.opp, r, 0);
        return !!x._fxTd;
      },
      build: function (x, q) {
        var r = x._fxTr, d = x._fxTd, src = 'Third man runs (tactic)';
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', bonus: 1, because: first(r) + ' started running when the layoff came off, before ' + first(d) + ' saw him', to: r,
          grants: { good: [edgeFor(src, 2, r, null, first(r) + ' is running at their goal', q)] },
          does: { good: 'slides it through to ' + first(r) + ', the third man, past {foil}', mixed: 'slides it through, a little too far ahead of ' + first(r), bad: 'slides it straight to {foil}' },
          pays: 'through',
          label: first(x.actor) + ' slides it through for ' + first(r) + ', the third man running',
          read: O().tag(x.actor, 'passing', x.legs) + ' against ' + O().tag(d, 'intelligence', 100) + ', who is marking ' + first(r) + '. If it comes off, ' + first(r) +
            ' has the ball in their box, running at their goal (+2).'
        };
      }
    }, {
      id: 'FXA_THIRD_BOX', side: 'you', zones: [3], family: 'move', tags: ['square ball', 'short pass', 'pass'],
      text: 'after a layoff the third man is arriving in their box',
      when: function (x, q) {
        var st = STS.get(x.squad);
        if (!st || !mem(st).third || mem(st).thirdUsed === st.fx.scope.possession) return false;
        var r = runnerOf(x.squad, [x.actor]);
        if (!r || r === x.actor) return false;
        x._fxTr = r; x._fxTd = O().markerOf(x.opp, r, 0);
        return !!x._fxTd;
      },
      build: function (x, q) {
        var r = x._fxTr, d = x._fxTd;
        return {
          test: { mine: x.actor, mineAttr: 'passing', theirs: d, theirsAttr: 'intelligence' },
          risk: 'even', bonus: 1, because: first(r) + ' started running when the layoff came off, before ' + first(d) + ' saw him', mate: r,
          does: { good: 'squares it past {foil} to ' + first(r) + ', the third man arriving', mixed: 'squares it towards ' + first(r), bad: 'squares it straight to {foil}' },
          pays: 'square',
          label: first(x.actor) + ' squares it for ' + first(r) + ', the third man arriving',
          read: O().tag(x.actor, 'passing', x.legs) + ' against ' + O().tag(d, 'intelligence', 100) + ', who should be marking ' + first(r) + '. If the pass gets past him cleanly, ' +
            first(r) + ' scores from close in.'
        };
      }
    }]
  });

  define({
    id: 'GR_REHEARSED', name: 'Rehearsed layoff', kind: 'tactic',
    text: 'Counts the layoffs that come off in the match (a half win is enough). After the first, no layoff uses up one of the attack\'s decisions (at most two free decisions an attack, as for every effect).',
    effects: [
      { name: 'count', on: 'clean_win', when: function (e) { return e.side === 'you' && e.has('layoff'); },
        run: function (e) { var m = mem(e.st); m.rehearsed++; e.note('layoff number ' + m.rehearsed + ' of the match' + (m.rehearsed === 1 ? ': from now on a layoff does not use up a decision' : '')); } },
      { name: 'count', on: 'half_win', when: function (e) { return e.side === 'you' && e.has('layoff'); },
        run: function (e) { var m = mem(e.st); m.rehearsed++; e.note('layoff number ' + m.rehearsed + ' of the match' + (m.rehearsed === 1 ? ': from now on a layoff does not use up a decision' : '')); } },
      { name: 'free', hook: 'cost',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && q.has('layoff') && mem(st).rehearsed >= 1; },
        apply: function (q) { q.freeDecision('rehearsed: ' + mem(stOf(q)).rehearsed + ' layoff' + (mem(stOf(q)).rehearsed === 1 ? ' has' : 's have') + ' come off in this match, so this one does not use up a decision'); } }
    ]
  });

  define({
    id: 'SE_UNTOUCHED', name: 'Fresh feet', kind: 'trait',
    text: 'If he has not had the ball earlier in this attack, a clean win on his shot needs 3, not 4. If he has, his shot is -1.',
    effects: [
      { name: 'fresh', hook: 'duel',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && q.byOwner() && q.has('shot') && !mem(st).touched[q.owner.id]; },
        apply: function (q) { q.threshold(3, first(q.owner) + ' has not touched the ball in this attack: a clean win on his shot needs 3, not 4'); } },
      { name: 'touched', hook: 'stat',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && q.byOwner() && q.has('shot') && !!mem(st).touched[q.owner.id]; },
        apply: function (q) { q.stat(-1, first(q.owner) + ' has already had the ball in this attack'); } }
    ]
  });

  /* a layoff that ends with one of the pair, set by the other, a target man */
  function wallPass(q) {
    if (q.side !== 'you' || !q.pair || !q.has('layoff') || !q.to || q.pair.indexOf(q.to) < 0) return false;
    var other = q.pair[0] === q.to ? q.pair[1] : q.pair[0];
    return (other.roles || []).indexOf('target man') >= 0 && q.to !== q.actor;
  }
  define({
    id: 'LK_WALL_PASS', name: 'Understanding', kind: 'relationship',
    text: 'A target man and the man he looks for. A layoff from the target man to the other does not use up a decision (once an attack), and the man who gets it is already running at their goal (+2 to him in this attack).',
    effects: [
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) { return wallPass(q); },
        apply: function (q) { q.freeDecision(first(q.pair[0]) + ' and ' + first(q.pair[1]) + ' know each other: the layoff does not use up a decision'); } },
      { name: 'run', hook: 'outcome',
        when: function (q) { return wallPass(q); },
        apply: function (q) { q.grant('good', { n: 2, man: q.to, why: first(q.to) + ' is already running onto the layoff' }, first(q.to) + ' is already running onto the layoff'); } }
    ]
  });

  /* BRIDGE: the loaded flank into the layoff family */
  function intoHim(q) { return (q.has('cut-back') || q.has('cross') || q.has('low cross')) && (q.to === q.owner || (q.has('header') && q.byOwner())); }
  define({
    id: 'TR_FLICK', name: 'Sets it', kind: 'trait',
    text: 'A cut-back or cross to him counts as a layoff too: he is setting it for the man arriving. His header from a cross that is only a half win is knocked down to your finisher in their box, unmarked (+2 to him in this attack).',
    effects: [
      { name: 'tag', hook: 'tags',
        when: function (q) { return q.side === 'you' && intoHim(q); },
        apply: function (q) { q.addTag('layoff', 'a ball into ' + first(q.owner) + ' counts as a layoff: he sets it for the man arriving'); } },
      { name: 'flick', hook: 'outcome',
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('header') && q.has('cross') && typeof q.zone === 'number' && q.zone < 3; },
        apply: function (q) {
          var s = q.lines().filter(function (x) { return x.band === 'mixed' && x.effect === 'nothing'; })[0];
          var f = layoffTarget(q.squad, [q.owner]);
          if (!s || !f) return;
          q.branch('mixed', { effect: 'ground', move: 3 - q.zone, to: f }, 'a half win: ' + first(q.owner) + ' knocks it down to ' + first(f) + ' in their box');
          q.grant('mixed', { n: 2, man: f, why: first(f) + ' is unmarked after the knock-down' }, first(f) + ' is unmarked after the knock-down');
        } }
    ]
  });

  /* ============================================== THE LOADED FLANK */

  define({
    id: 'TA_OVERLOAD', name: 'Overload one flank', kind: 'tactic',
    text: 'Your loaded flank is the side with more wingers, crossers and runners. A pass to a player on that flank that is a clean win leaves him unmarked (+2 to him in this attack), once an attack. Your players on the other flank are -1 in their duels: nobody is helping them.',
    effects: [
      { name: 'unmark', on: 'clean_win', limit: { per: 'possession', n: 1 },
        when: function (e) { return e.side === 'you' && e.has('pass') && !e.has('back pass') && !e.has('recycle') && e.to && e.effect === 'ground' && lane(e.to) === loadedFlank(e.st.squad); },
        run: function (e) {
          e.addState('unmarked', e.to, { duration: 'possession' }, first(e.to) + ' is unmarked on the ' + SIDE[lane(e.to)] + ', the loaded flank');
          e.addEdge({ n: 2, man: e.to, why: first(e.to) + ' is unmarked on the loaded flank' }, first(e.to) + ' is unmarked on the loaded flank');
        } },
      { name: 'alone', hook: 'stat',
        when: function (q) { return q.side === 'you' && q.actor && typeof q.actor.line === 'number' && lane(q.actor) === 2 - loadedFlank(q.squad) && q.actor.line >= 0; },
        apply: function (q) { q.stat(-1, first(q.actor) + ' is on the other flank, where nobody is helping him'); } }
    ]
  });

  define({
    id: 'LN_FLANK_STACK', name: 'Loaded flank', kind: 'tactic',
    text: 'On a flank where two or more of your players are wingers, crossers or runners, space made there lasts the whole attack: a cross, cut-back or run down that side keeps its +2 after the next decision.',
    effects: [
      { name: 'last', hook: 'stat',
        when: function (q) {
          var st = stOf(q);
          if (!st || q.side !== 'you' || typeof q.zone !== 'number' || q.zone < 1) return false;
          if (!(q.has('cross') || q.has('low cross') || q.has('cut-back') || q.has('dribble') || q.has('overlap'))) return false;
          var c = carrierNow(st) || q.actor, L = lane(c);
          if (L === 1 || wideCount(q.squad, L) < 2 || !mem(st).space[L]) return false;
          return !st.fx.carried().some(function (e) { return e.id === 'space' && e.lane === L; });
        },
        apply: function (q) { var st = stOf(q), L = lane(carrierNow(st) || q.actor); q.stat(2, 'the space on the ' + SIDE[L] + ' is still there (a loaded flank)'); } }
    ]
  });

  define({
    id: 'RO_OVERLAPPER', name: 'Overlaps', kind: 'trait',
    text: 'His overlap does not use up one of the attack\'s decisions (once an attack). When it comes off cleanly, the man who went with him has left a gap: +2 in this attack.',
    effects: [
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.has('overlap') && (q.byOwner() || q.to === q.owner); },
        apply: function (q) { q.freeDecision(first(q.owner) + '\'s overlap does not use up a decision'); } },
      { name: 'drag', hook: 'outcome',
        when: function (q) { return q.side === 'you' && q.has('overlap') && (q.byOwner() || q.to === q.owner) && !!q.foil && typeof q.foil.line === 'number'; },
        apply: function (q) {
          var have = q.lines().some(function (x) { return x.band === 'good' && typeof x.move === 'number'; });
          if (have) q.grant('good', { n: 2, man: null, tags: null, why: first(q.foil) + ' went with ' + first(q.owner) + ' and left a gap' }, first(q.foil) + ' went with ' + first(q.owner) + ' and left a gap');
        } }
    ]
  });

  define({
    id: 'RT_NOMINATE', name: 'Nominated receiver', kind: 'trait',
    text: 'Your cut-backs and low crosses go to him, wherever the menu would have sent them.',
    effects: [
      { name: 'to', hook: 'option',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && (q.has('cut-back') || q.has('low cross')) && q.to && q.to !== q.owner && q.actor !== q.owner && onPitch(st, q.owner); },
        apply: function (q) { q.setRecipient(q.owner, 'the ball goes to ' + first(q.owner) + ', the nominated receiver'); } }
    ]
  });

  define({
    id: 'TR_COOL_HEAD', name: 'Cool head', kind: 'specialisation',
    text: 'When he shoots while unmarked, a clean win needs only 2, not 4. Once an attack, and it uses up his unmarked state.',
    effects: [
      { name: 'calm', hook: 'duel', limit: { per: 'possession', n: 1 },
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && q.hasState('unmarked', q.owner); },
        apply: function (q) { q.threshold(2, first(q.owner) + ' is unmarked and keeps calm: a clean win on his shot needs only 2'); } },
      { name: 'spend', on: 'shot', when: function (e) { return e.actor === e.owner && e.st.fx.states.some(function (s) { return s.name === 'unmarked' && s.on.p === e.owner; }); },
        run: function (e) { e.removeState('unmarked', e.owner, first(e.owner) + ' has used his unmarked chance'); } }
    ]
  });

  define({
    id: 'LK_FLANK_PAIR', name: 'Flank partners', kind: 'relationship',
    text: 'When either of the two wins a duel cleanly in your attack, there is space on their flank: +2 to your crosses, cut-backs and runs in this attack (once an attack).',
    effects: [
      { name: 'space', on: 'clean_win', limit: { per: 'possession', n: 1 },
        when: function (e) { return e.side === 'you' && e.byPair() && e.st.chain && e.st.chain.next === 'zone' && lane(e.pair[0]) !== 1; },
        run: function (e) {
          var L = lane(e.pair[0]);
          mem(e.st).space[L] = 1;
          e.addEdge({ n: 2, tags: ['cross', 'low cross', 'cut-back', 'dribble', 'overlap'], why: 'there is space on the ' + SIDE[L] }, 'there is space on the ' + SIDE[L]);
        } }
    ]
  });

  /* ============================================ STRETCH AND THREAD */

  define({
    id: 'TR_SWITCHER', name: 'Long diagonal', kind: 'trait',
    text: 'When his switch of play comes off (a half win is enough), their defence is stretched for the rest of the attack: +2 to a pass through, a cut-back, a pull-back or a pass across the goal, on every decision, not only the next one.',
    effects: [
      { name: 'stretch', on: 'clean_win',
        when: function (e) { return e.side === 'you' && e.has('switch') && passerOf(e) === e.owner && !e.hasState('stretched', 'opponent') && e.st.chain && e.st.chain.next === 'zone'; },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'their defence is stretched by ' + first(e.owner) + '\'s long diagonal, for the rest of the attack'); } },
      { name: 'stretch', on: 'half_win',
        when: function (e) { return e.side === 'you' && e.has('switch') && passerOf(e) === e.owner && !e.hasState('stretched', 'opponent') && e.st.chain && e.st.chain.next === 'zone'; },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'their defence is stretched by ' + first(e.owner) + '\'s long diagonal, for the rest of the attack'); } },
      keepStretched()
    ]
  });

  define({
    id: 'SE_ALTERNATE', name: 'Switching sides', kind: 'tactic',
    text: 'When the ball goes from one flank to the other on consecutive decisions of an attack, their defence is stretched for the rest of the attack (+2 to a pass through, a cut-back, a pull-back or a pass across the goal, on every decision).',
    effects: [
      { name: 'stretch', on: 'decision_end', limit: { per: 'possession', n: 1 },
        when: function (e) {
          if (e.side !== 'you' || !e.st.chain || e.st.chain.next !== 'zone') return false;
          var L = mem(e.st).lanes, n = L.length;
          return n >= 2 && L[n - 1] !== 1 && L[n - 2] !== 1 && L[n - 1] !== L[n - 2] && !e.hasState('stretched', 'opponent');
        },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'the ball went from one flank to the other: their defence is stretched for the rest of the attack'); } },
      keepStretched()
    ]
  });

  function threadPass(q) { return q.has('through ball') || q.has('cut-back'); }
  define({
    id: 'TR_THREADER', name: 'Threads it', kind: 'specialisation',
    text: 'When their defence is stretched, his pass through or cut-back that is only a half win still gets through to the man it was meant for, a zone further on. A clean one leaves that man unmarked (+2 to him in this attack).',
    effects: [
      { name: 'thread', hook: 'outcome',
        when: function (q) { return q.side === 'you' && q.byOwner() && threadPass(q) && q.to && q.to !== q.owner && typeof q.zone === 'number' && q.zone < 3 && stretchedNow(stOf(q)); },
        apply: function (q) {
          var to = q.to, L = q.lines(), why = 'their defence is stretched, so the half win still gets through to ' + first(to);
          var s = L.filter(function (x) { return x.band === 'mixed' && x.effect === 'nothing' && typeof x.move !== 'number'; })[0];
          var h = L.filter(function (x) { return x.band === 'mixed' && typeof x.move === 'number' && x.move === 0; })[0];
          if (s) q.branch('mixed', { effect: 'ground', move: 1, to: to }, why);
          else if (h) { q.setMove('mixed', 1, why); q.setTo('mixed', to, first(to) + ' has it'); }
          q.grant('good', { n: 2, man: to, why: first(to) + ' is unmarked after the pass' }, first(to) + ' is unmarked after the pass');
        } },
      { name: 'unmarked', on: 'clean_win', when: function (e) { return e.side === 'you' && e.byOwner() && (e.has('through ball') || e.has('cut-back')) && e.to && e.to !== e.owner && e.effect === 'ground' && e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('unmarked', e.to, { duration: 'possession' }, first(e.to) + ' is unmarked after the pass'); } }
    ]
  });

  define({
    id: 'RO_INSIDE_FORWARD', name: 'Cuts inside', kind: 'trait',
    text: 'From the wing, in midfield or at the edge of their box, he can cut inside onto his stronger foot. If he gets past, he is running at their goal (+2 in his next duel) and there is space on the flank he left (+2 to a cross, cut-back or run down it).',
    pool: [{
      id: 'FXA_CUT_IN', side: 'you', zones: [1, 2], family: 'move', tags: ['carry', 'dribble'],
      text: 'he can cut inside from the wing',
      when: function (x, q) { return x.actor === q.owner && lane(q.owner) !== 1 && !!x.foil; },
      build: function (x, q) {
        var me = q.owner;
        return {
          test: { mine: me, mineAttr: 'technique', theirs: x.foil, theirsAttr: 'intelligence' },
          risk: 'even', bonus: 1, because: first(me) + ' comes inside onto his stronger foot, where ' + first(x.foil) + ' does not want him', to: me,
          grants: { good: [{ id: 'running', man: me }, { id: 'space', lane: lane(me) }] },
          does: { good: 'cuts inside past {foil}', mixed: 'cuts inside, with {foil} still next to him', bad: 'cuts inside and loses it to {foil}' },
          pays: 'advance',
          label: first(me) + ' cuts inside from the ' + SIDE[lane(me)] + ' past ' + first(x.foil),
          read: O().tag(me, 'technique', x.legs) + ' against ' + O().tag(x.foil, 'intelligence', 100) + '. If he gets past, he is running at their goal, and the ' +
            SIDE[lane(me)] + ' is open behind him.'
        };
      }
    }]
  });

  define({
    id: 'TR_CHANNEL_RUNNER', name: 'Runs the channels', kind: 'trait',
    text: 'When their defence is stretched, your passes through and cut-backs go to him, and a clean one leaves him unmarked (+2 to him in this attack).',
    effects: [
      { name: 'to', hook: 'option',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && (q.has('through ball') || q.has('cut-back')) && q.to && q.to !== q.owner && q.actor !== q.owner && q.actor !== q.to && onPitch(st, q.owner) && stretchedNow(st); },
        apply: function (q) { q.setRecipient(q.owner, 'their defence is stretched, so the ball goes to ' + first(q.owner) + ' in the gap'); } },
      { name: 'unmarked', on: 'clean_win', when: function (e) { return e.side === 'you' && (e.has('through ball') || e.has('cut-back')) && e.to === e.owner && e.actor !== e.owner && e.effect === 'ground' && e.hasState('stretched', 'opponent'); },
        run: function (e) {
          e.addState('unmarked', e.owner, { duration: 'possession' }, first(e.owner) + ' got into the gap unseen');
          e.addEdge({ n: 2, man: e.owner, why: first(e.owner) + ' got into the gap unseen' }, first(e.owner) + ' got into the gap unseen');
        } }
    ]
  });

  /* movement edges and player edges (EX_STACK_EDGES) */
  var MOVE_EDGE = { space: 1, stretched: 1, drawn: 1, backing: 1, through: 1, running: 1, wide: 1, caught: 1, short: 1, upfield: 1, twoBeaten: 1 };
  var MAN_EDGE = { unmarked: 1, beaten: 1, loose: 1 };
  /* the best carried edge of each kind that helps this option */
  function edgeTops(q) {
    var st = stOf(q);
    if (!st || !q.actor) return null;
    var C = O().CARRY, probe = { id: q.id, actor: q.actor, foil: q.foil, tags: q.tags }, x = { actor: carrierNow(st) || q.actor };
    var t = { mv: null, mn: null };
    st.fx.carried().forEach(function (c) {
      var d = C[c.id];
      if (!d || !d.applies(c, probe, x)) return;
      var k = c.id === 'fx' ? (!c.man || /running|stretched|space|gap/.test(c.why) ? 'mv' : 'mn') : MOVE_EDGE[c.id] ? 'mv' : MAN_EDGE[c.id] ? 'mn' : null;
      if (!k) return;
      var n = typeof d.amount === 'function' ? d.amount(c) : d.amount;
      if (!t[k] || n > t[k].n) t[k] = { n: n, why: d.why(c) };
    });
    return t;
  }
  define({
    id: 'EX_STACK_EDGES', name: 'Two edges at once', kind: 'tactic',
    text: 'Normally only the biggest edge counts. With this, the best edge from movement (space, a stretched defence, a man running at goal) and the best edge from a player (unmarked, a defender out of position) both count on the same pass or shot: two edges, never more.',
    effects: [
      { name: 'stack', hook: 'stat',
        when: function (q) { if (q.side !== 'you') return false; var t = edgeTops(q); return !!(t && t.mv && t.mn); },
        apply: function (q) {
          var t = edgeTops(q), lo = t.mv.n <= t.mn.n ? t.mv : t.mn;
          q.stat(lo.n, 'two edges at once: ' + lo.why + ' counts as well');
        } }
    ]
  });

  /* ============================================== BAIT AND SWITCH */

  function maxLearn(st) { var L = learnOf(st), b = 0; Object.keys(L).forEach(function (k) { if (L[k] > b) b = L[k]; }); return b; }
  define({
    id: 'AD_BAIT', name: 'Bait', kind: 'tactic',
    text: 'When one of their defenders has learned one of your moves, the room he leaves is bigger: the +1 on the other option the card points to becomes +3.',
    effects: [
      { name: 'room', hook: 'counter',
        when: function (q) {
          var st = q.actor && STP.get(q.actor);
          return !!st && maxLearn(st) >= 1 && q.parts().some(function (p) { return / is staying close to /.test(p.why) && p.n > 0; });
        },
        apply: function (q) { q.theirStat(-2, 'the defender who learned your move is out of the play: more room here'); } }
    ]
  });

  define({
    id: 'AD_OVERCOMMIT', name: 'Guessing', kind: 'trait',
    text: 'A defender who has learned one of his moves is guessing: against any other move he makes, that defender is -2.',
    effects: [
      { name: 'guess', hook: 'counter',
        when: function (q) {
          var st = q.actor && STP.get(q.actor);
          if (!st || !q.byOwner() || !q.foil) return false;
          var L = learnOf(st), B = (st.cmem && st.cmem.beat) || {}, pre = q.foil.id + '|';
          return Object.keys(L).some(function (k) { return k.indexOf(pre) === 0 && k !== pre + q.id && L[k] >= 1 && B[k] === q.owner; });
        },
        apply: function (q) { q.theirStat(-2, first(q.foil) + ' is guessing that ' + first(q.owner) + ' will do the same again'); } }
    ]
  });

  define({
    id: 'RO_SHADOW_STRIKER', name: 'Arrives late', kind: 'trait',
    text: 'When the man a pass is meant for is being watched (a defender has learned a move of his, or they put a man on him), he takes that man\'s place and arrives late, unmarked (+2 to him in this attack). Once an attack.',
    effects: [
      { name: 'to', hook: 'option', limit: { per: 'possession', n: 1 },
        when: function (q) {
          var st = stOf(q);
          return !!st && q.side === 'you' && realPass(q) && q.to && q.to !== q.owner && q.actor !== q.owner && q.actor !== q.to && onPitch(st, q.owner) && watched(st, q.to);
        },
        apply: function (q) { q.setRecipient(q.owner, first(q.to) + ' is being watched, so ' + first(q.owner) + ' arrives late instead'); } },
      { name: 'late', hook: 'outcome', limit: { per: 'possession', n: 1 },
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && realPass(q) && q.to === q.owner && q.actor !== q.owner && st.squad.players.some(function (p) { return p !== q.owner && watched(st, p); }); },
        apply: function (q) { q.grant('good', { n: 2, man: q.owner, why: first(q.owner) + ' arrives late, unmarked' }, first(q.owner) + ' arrives late, unmarked'); } },
      { name: 'unmarked', on: 'clean_win', when: function (e) { return e.side === 'you' && e.to === e.owner && e.actor !== e.owner && e.has('pass') && e.effect === 'ground' && e.st.squad.players.some(function (p) { return p !== e.owner && watched(e.st, p); }); },
        run: function (e) { e.addState('unmarked', e.owner, { duration: 'possession' }, first(e.owner) + ' arrives late, unmarked'); } }
    ]
  });

  define({
    id: 'LN_SWAP_FLANKS', name: 'Change the runs', kind: 'tactic',
    text: 'Once a match: when one of their defenders has learned a move by one of your wide forwards, your wide forwards change their runs at the start of the next moment. What their defenders learned against those two no longer counts, until they learn it again.',
    effects: [
      { name: 'swap', on: 'moment_start',
        when: function (e) {
          var m = mem(e.st);
          if (m.swapped) return false;
          var L = learnOf(e.st), B = (e.st.cmem && e.st.cmem.beat) || {};
          return Object.keys(L).some(function (k) { var p = B[k]; return L[k] >= 1 && p && p.line === 2 && lane(p) !== 1; });
        },
        run: function (e) {
          var L = learnOf(e.st), snap = {};
          Object.keys(L).forEach(function (k) { snap[k] = L[k]; });
          mem(e.st).swapped = snap;
          e.note('your wide forwards change their runs: what their defenders learned against them no longer counts');
        } },
      { name: 'forget', hook: 'counter',
        when: function (q) {
          var st = q.actor && STP.get(q.actor), m = st && mem(st);
          if (!m || !m.swapped || !q.actor || q.actor.line !== 2 || lane(q.actor) === 1 || !q.foil) return false;
          var k = q.foil.id + '|' + q.id;
          return (learnOf(st)[k] || 0) > 0 && (learnOf(st)[k] || 0) <= (m.swapped[k] || 0);
        },
        apply: function (q) { q.cancel('has seen this', first(q.actor) + ' changed his run: what ' + first(q.foil) + ' learned does not count'); } }
    ]
  });

  define({
    id: 'AD_DECOY_ROUTE', name: 'Show them one side', kind: 'tactic',
    text: 'Your first attack is for show: it costs no stamina, but no shot is offered in it. Every attack after that has their defence stretched from its second decision (+2 to a pass through, a cut-back, a pull-back or a pass across the goal).',
    effects: [
      { name: 'noshot', hook: 'option',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && typeof q.zone === 'number' && mem(st).yourDone < 1 && q.has('shot'); },
        apply: function (q) { q.remove('the first attack is for show: no shot'); } },
      { name: 'free', hook: 'cost',
        when: function (q) { var st = stOf(q); return !!st && q.side === 'you' && typeof q.zone === 'number' && mem(st).yourDone < 1; },
        apply: function (q) { q.costBy(-40, 'the first attack is for show: this costs no stamina'); } },
      { name: 'stretch', on: 'possession_start',
        when: function (e) { return e.side === 'you' && mem(e.st).yourDone >= 1 && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'they are still set for the side you showed them: their defence is stretched in this attack'); } },
      keepStretched()
    ]
  });

  /* ================================================ THE CAPTAIN */

  define({
    id: 'CP_PASS_IT_ON', name: 'Pass it on', kind: 'captain',
    text: 'Once an attack, when one of your components leaves a player unmarked, the captain spreads it: the next teammate to get the ball in that attack is unmarked too (+2 to him in this attack).',
    effects: [
      { name: 'hear', on: 'state_added', fromEffects: true,
        when: function (e) { return e.state === 'unmarked' && !!e.target && !!e.target.name && onPitch(e.st, e.target) && !mem(e.st).passOn; },
        run: function (e) { mem(e.st).passOn = { from: e.target }; } },
      { name: 'spread', on: 'decision_end', limit: { per: 'possession', n: 1 },
        when: function (e) {
          var m = mem(e.st), nc = carrierNow(e.st);
          return e.side === 'you' && !!m.passOn && !!nc && nc !== m.passOn.from && onPitch(e.st, e.st.squad.captain) && !e.hasState('unmarked', nc);
        },
        run: function (e) {
          var nc = carrierNow(e.st);
          e.addState('unmarked', nc, { duration: 'possession' }, 'the captain passes it on: ' + first(nc) + ' is unmarked too');
          e.addEdge({ n: 2, man: nc, why: first(nc) + ' is unmarked (the captain passed it on)' }, first(nc) + ' is unmarked (the captain passed it on)');
        } }
    ]
  });

  /* the ids this file defines, for the checks and the harness */
  var IDS = ['TR_WALL', 'TR_DRAG', 'TA_THIRD_MAN', 'GR_REHEARSED', 'SE_UNTOUCHED', 'LK_WALL_PASS', 'TR_FLICK',
    'TA_OVERLOAD', 'LN_FLANK_STACK', 'RO_OVERLAPPER', 'RT_NOMINATE', 'TR_COOL_HEAD', 'LK_FLANK_PAIR',
    'TR_SWITCHER', 'SE_ALTERNATE', 'TR_THREADER', 'RO_INSIDE_FORWARD', 'TR_CHANNEL_RUNNER', 'EX_STACK_EDGES',
    'AD_BAIT', 'AD_OVERCOMMIT', 'RO_SHADOW_STRIKER', 'LN_SWAP_FLANKS', 'AD_DECOY_ROUTE', 'CP_PASS_IT_ON'];
  var API = { IDS: IDS, mem: mem, loadedFlank: loadedFlank, watched: watched, stretchedNow: stretchedNow };
  root.KMContentA = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
