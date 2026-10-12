/* CONTENT C (wave w1c): components built on the OPPOSITION.
 *
 *   Wear them down            your pressing tires their lines; their tired
 *                             lines are a state other pieces read; a fresh
 *                             finisher exploits it; the fatigue survives the
 *                             man who made it.
 *   Defend deep, break fast   a defence whose stops win the ball, catch their
 *                             men upfield, and feed a short, fast counter.
 *   The keeper's guessing     their keeper's read of your last shot is a
 *   game                      resource: one man shows him the hard shot,
 *                             another places it where he is not.
 *   Matchups                  four OPPONENT tactics (a deep block, a pressing
 *                             midfield, a commanding keeper, a counter-
 *                             attacking side), each TAXING a route, never
 *                             closing it, and one bridge per build that lets
 *                             the build adapt to its counter.
 *
 * The opponent-held states these read and write: their line's stamina and
 * "fatigued" (under 40), "adapted" on their keeper (what he is set for),
 * "stretched" on their team (men caught upfield), "out of position" on one
 * of their men, and what their defenders have learned (the engine's own
 * memory). Your midfield can be "pressed" by their build.
 *
 * Every rule reads action TAGS, STATES, roles and the engine's own memory
 * (read only), never an option id or a named player. Every change goes
 * through the effects helpers, so it is named on the card before the pick
 * and in the log when it fires. Nothing runs unless a build names it.
 *
 * Load after effects.js. In node: require('./content-c.js').
 * Plain English; no dashes in any sentence a player reads.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  var LINE = ['def', 'mid', 'att'];
  var LW = { def: 'defence', mid: 'midfield', att: 'attack' };
  var WIN_CAP = 3;   /* match.js: an attack started by a won ball has 3 decisions */

  /* ------------------------------------------------ reading the match */
  /* Hooks see the option, not the match. Every component remembers the
   * match it is in on its first event (moment_start fires before any menu),
   * silently: this writes nothing and changes nothing. */
  var STS = new WeakMap(), MEM = new WeakMap();
  function remember(st) { if (st && st.squad) STS.set(st.squad, st); }
  function stOf(q) { return (q && q.squad && STS.get(q.squad)) || null; }
  function mem(st) {
    var m = MEM.get(st);
    if (!m) { m = { shotSeen: -1, shotPoss: -1, lastKind: null, alt: 0, pairWin: null, invited: -1 }; MEM.set(st, m); }
    return m;
  }
  var SEE = { name: 'track', on: 'moment_start', run: function (e) { remember(e.st); } };
  function define(d) {
    d.effects = [SEE].concat(d.effects || []);
    return FX.define(d);
  }
  function lineOf(p) { return p && typeof p.line === 'number' ? LINE[p.line] : null; }
  function isKeeper(q, p) { return !!p && !!q.opp && p === q.opp.keeper; }
  /* the first decision of an attack of yours that started from a ball you
   * won: match.js hands the attack over with cap WIN_CAP and step 0; the
   * step counts every decision after it, free ones included */
  /* x1: match.js's switches. "cap" gives a won-ball attack one more
   * decision (WIN_CAP + 1); "long" makes the first-decision window cover
   * the whole break (a firing that lasts the attack) */
  function winCap(st) { return WIN_CAP + (st && st.x1 && st.x1.cap ? 1 : 0); }
  function fromWin(st) {
    if (st && st.x1 && st.x1.long) return !!(st.chain && st.chain.next === 'zone' && st.chain.cap === winCap(st));
    return !!(st && st.chain && st.chain.next === 'zone' && st.chain.cap === winCap(st) && !st.chain.youSteps && !st.chain.step);
  }
  /* x1 (b): the play between moments (match.js betweenPlay; only with the
   * "between" switch, so none of these clauses ever runs by default) */
  function between(kind, team) { return function (e) { return e.kind === kind && e.side === team; }; }
  /* how many times the defender facing this option has seen this move */
  function learned(st, q) {
    if (!st || !st.cmem || !q.foil) return 0;
    return st.cmem.learn[q.foil.id + '|' + q.id] || 0;
  }
  function legsLost(q, p) { var l = lineOf(p); return l ? 100 - q.legsOf('them', l) : 0; }
  function bestBy(list, attr) {
    return list.slice().sort(function (a, b) { return ((b.attr && b.attr[attr]) || 0) - ((a.attr && a.attr[attr]) || 0); })[0] || null;
  }
  function forwards(sq) { return sq.players.filter(function (p) { return p.line === 2; }); }
  function shotKind(x) { return x.has('placed shot') ? 'placed shot' : x.has('hard shot') ? 'hard shot' : null; }
  var RUN_TAGS = ['carry', 'dribble', 'run in behind', 'overlap'];
  var FORWARD_TAGS = ['forward pass', 'through ball', 'long ball', 'run in behind', 'carry'];
  var BOX_PASS = ['square ball', 'cut-back', 'pull-back'];
  function any(q, list) { return list.some(function (t) { return q.has(t); }); }

  /* ================================================== WEAR THEM DOWN */

  /* A pressing forward whose work is front-loaded: while his own legs are
   * good he costs the man he runs at stamina on every duel, and a clean win
   * leaves that man out of position. As your attack tires (the clock), his
   * tax stops, so taking him off for the finisher is a real decision. */
  define({
    id: 'WC_HARRIER', name: 'Harrier', kind: 'trait', system: 'Footballer traits', archetypes: ['B06'],
    text: 'While your attack has 50 stamina or more: each attack of theirs starts with him pressing their back line (10 stamina), and every duel he takes costs the line he runs at 8. A clean win of his leaves that man out of position for the rest of your attack.',
    effects: [
      { name: 'front', on: 'possession_start', when: function (e) { return e.side === 'them' && e.legsOf('you', 'att') >= 50; },
        run: function (e) { e.tire('def', 10, first(e.owner) + ' presses their back line as they try to play out'); } },
      { name: 'tax', hook: 'cost', when: function (q) { return q.side === 'you' && q.byOwner() && !!q.foil && !isKeeper(q, q.foil) && q.legsOf('you', 'att') >= 50; },
        apply: function (q) { q.tire(8, null, first(q.foil) + ' has to chase ' + first(q.actor) + ': their ' + LW[lineOf(q.foil)] + ' loses 8 stamina'); } },
      { name: 'beaten', on: 'clean_win', when: function (e) { return e.side === 'you' && e.byOwner() && !!e.foil && e.foil !== e.st.opp.keeper; },
        run: function (e) { e.addState('out of position', e.foil, { duration: 'decision' }, first(e.foil) + ' is out of position after ' + first(e.owner) + ' went past him'); } },
      /* x1 (b): between moments he chases their ball at the back; once their
       * defence is fatigued, they give it away to him high up */
      { name: 'x1hound', on: 'between_play', when: function (e) { return between('pass', 'them')(e) && e.legsOf('you', 'att') >= 50; },
        run: function (e) {
          e.tire('def', 6, first(e.owner) + ' chases them as they knock it about at the back');
          if (e.hasState('fatigued', { line: 'def', side: 'them' }) && e.nextIsYours(first(e.foil) + ' is out on his feet and gives it away to ' + first(e.owner) + ': the next moment is yours')) {
            e.startHigher('you won it high: your attack starts one zone higher');
          }
        } }
    ]
  });

  /* A tactic that makes every run with the ball a stamina trade. */
  define({
    id: 'WC_RUN_RAGGED', name: 'Run them ragged', kind: 'tactic', system: 'Resource economy', archetypes: ['B06'],
    text: 'Your runs with the ball (carries, dribbles, runs in behind, overlaps) outside your half cost the line they go at 6 stamina, and cost your line 3 more.',
    effects: [
      { name: 'trade', hook: 'cost', when: function (q) { return q.side === 'you' && q.zone >= 1 && !!q.foil && !isKeeper(q, q.foil) && any(q, RUN_TAGS); },
        apply: function (q) {
          q.tire(6, null, 'they have to turn and run: their ' + LW[lineOf(q.foil)] + ' loses 6 stamina');
          q.costBy(3, 'running at them costs your line 3 more stamina');
        } },
      /* x1 (b): between moments your men keep running at them */
      { name: 'x1run', on: 'between_play', when: between('pass', 'you'),
        run: function (e) { e.tire('mid', 5, 'your men keep running at them as you move it around'); } }
    ]
  });

  /* The payoff of the opponent-held state: a fatigued line concedes clean
   * wins more easily. An outcome tier change, not a bonus to the sum. */
  define({
    id: 'WC_LEGS_GOING', name: 'Their legs are going', kind: 'tactic', system: 'Outcome tiers', archetypes: ['B06', 'B16'],
    text: 'Against a man whose line is fatigued (under 40 stamina), your clean win needs a margin of 3 instead of 4.',
    effects: [
      { name: 'margin', hook: 'duel', when: function (q) { return q.side === 'you' && !!q.foil && !isKeeper(q, q.foil) && q.hasState('fatigued', q.foil); },
        apply: function (q) { q.threshold(3, first(q.foil) + '\'s legs are going (their ' + LW[lineOf(q.foil)] + ' has ' + q.legsOf('them', lineOf(q.foil)) + ' stamina): a clean win needs 3, not 4'); } }
    ]
  });

  /* The bench payoff: acts only once he is on. Scales with what their line
   * has lost, so it is worth more the later he comes on and the more the
   * starters have run. Once a match, his first shot at a fatigued defence
   * rolls two dice. */
  define({
    id: 'WC_FRESH_FINISHER', name: 'Fresh against tired', kind: 'trait', system: 'The bench and substitutions', archetypes: ['B06', 'B16'],
    text: 'On the pitch only: +1 against a line of theirs for every 20 stamina it has lost (at most +3). A shot of his while he is fresh (the moment he comes on) or their defence is fatigued rolls two dice and keeps the higher.',
    effects: [
      { name: 'legs', hook: 'stat', when: function (q) { return q.side === 'you' && q.byOwner() && !!q.foil && !isKeeper(q, q.foil) && legsLost(q, q.foil) >= 20; },
        apply: function (q) { var n = Math.min(3, Math.floor(legsLost(q, q.foil) / 20)); q.stat(n, 'he is fresh and their ' + LW[lineOf(q.foil)] + ' has lost ' + legsLost(q, q.foil) + ' stamina'); } },
      { name: 'twodice', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.byOwner() && q.has('shot') && (q.hasState('fresh', q.actor) || q.hasState('fatigued', { line: 'def', side: 'them' })); },
        apply: function (q) { q.dice(2, (q.hasState('fresh', q.actor) ? first(q.actor) + ' has fresh legs' : 'their defence is out on its feet') + ': he rolls two dice and keeps the higher'); } }
    ]
  });

  /* What a substitution adds: every man you bring on runs at their tired
   * line. The fatigue the starters made is held by their line, so it stays
   * when the starter who made it goes off (effects.js ownership). */
  define({
    id: 'WC_ROLLING', name: 'Rolling changes', kind: 'tactic', system: 'The bench and substitutions', archetypes: ['B06'],
    text: 'Each man you bring on is fresh for that moment and costs the line of theirs he will face 10 stamina (fresh legs run at them). The fatigue already made stays whoever goes off.',
    effects: [
      { name: 'fresh', on: 'sub_in', when: function (e) { return (e.side === 'you' || !e.side) && !!e.player; },
        run: function (e) {
          var facing = e.player.line === 2 ? 'def' : e.player.line === 1 ? 'mid' : 'att';
          e.tire(facing, 10, first(e.player) + ' comes on with fresh legs and runs at their ' + LW[facing]);
          e.addState('fresh', e.player, { duration: 'moment' }, first(e.player) + ' is fresh for this moment');
        } }
    ]
  });

  /* OPPONENT ADAPTATION AS A RESOURCE: a defender who has learned your
   * winger's move is +2 or more against it (the engine's counterplay), but
   * chasing it again costs his line, and once his line is fatigued what he
   * learned stops counting. Repeating the move becomes a way to tire him. */
  define({
    id: 'WC_KEEPS_GOING', name: 'Keeps going at him', kind: 'trait', system: 'Opponent adaptation and exploits', archetypes: ['B06', 'B09'],
    text: 'When he takes on a defender who has seen that move before, the defender\'s line loses 8 stamina; if that line is fatigued, what the defender learned does not count.',
    effects: [
      { name: 'tax', hook: 'cost', when: function (q) { return q.side === 'you' && q.byOwner() && learned(stOf(q), q) > 0; },
        apply: function (q) { q.tire(8, null, first(q.foil) + ' has seen it before but still has to stop it again: their ' + LW[lineOf(q.foil)] + ' loses 8 stamina'); } },
      { name: 'noLegs', hook: 'counter', when: function (q) { return q.byOwner() && !!q.foil && q.hasState('fatigued', q.foil); },
        apply: function (q) { q.cancel('has seen this', first(q.foil) + ' has seen it, but his legs are gone: what he learned does not count'); } },
      /* x1 (b): between moments he keeps taking his man on, and gets fouled:
       * their man is booked (the engine's own rule: +2 to your players
       * running at him for the rest of the match) */
      { name: 'x1foul', on: 'between_play', when: function (e) { return (e.kind === 'foul' && e.side === 'them') || (e.kind === 'carry' && e.side === 'them' && e.hasState('fatigued', { line: 'mid', side: 'them' })); },
        run: function (e) { e.bookThem(e.foil, first(e.foil) + ' can only stop ' + first(e.owner) + ' with a foul and is booked: +2 to your players running at him for the rest of the match'); } }
    ]
  });

  /* A link: two forwards hunting together. One's win sets up the other,
   * more so against a man out of position or a fatigued line. */
  define({
    id: 'WC_HUNT_PAIRS', name: 'Hunt in pairs', kind: 'relationship', system: 'Links and partnerships', archetypes: ['B06', 'B04'],
    text: 'When one of the pair wins a duel and the attack goes on, the other gets +1 in this attack, or +2 while their defence is fatigued.',
    effects: [
      { name: 'follow', on: 'decision_end',
        when: function (e) { return e.side === 'you' && e.byPair() && (e.band === 'good' || e.band === 'mixed') && !!e.st.chain && e.st.chain.next === 'zone'; },
        run: function (e) {
          var mate = e.pair[0] === e.actor ? e.pair[1] : e.pair[0];
          var n = e.hasState('fatigued', { line: 'def', side: 'them' }) ? 2 : 1;
          e.addEdge({ n: n, man: mate, why: first(e.actor) + ' won his duel' }, first(e.actor) + ' won his duel, ' + first(mate) + ' goes with him');
        } }
    ]
  });

  /* An amplifier whose value is its targets: once a moment, the captain
   * repeats a stamina tax another component made. Never repeats a duel. */
  define({
    id: 'WC_LEADS_CHASE', name: 'Leads the chase', kind: 'captain', system: 'Captaincy', archetypes: ['B06', 'B10'],
    text: 'Once a moment, when one of your components tires a line of theirs, the captain drives the chase: that line loses the same again (at most 6).',
    effects: [
      { name: 'echo', on: 'their_stamina_spent', fromEffects: true, limit: { per: 'moment', n: 1 },
        /* only what your side made: not their own pressing, not their substitutions */
        when: function (e) { return e.ownerSide === 'you' && e.amount > 0 && e.by !== 'Substitution' && !/\(their /.test(String(e.by || '')); },
        run: function (e) { e.tire(e.line, Math.min(6, e.amount), 'captain ' + first(e.owner) + ' drives the chase'); } }
    ]
  });

  /* BRIDGE (against a deep block, which resists runs): the same fatigue
   * from a route the block does not resist. Switches and long balls make
   * their shape shift across; a switch that comes off stretches them. */
  define({
    id: 'WC_SHUTTLE', name: 'Make them shuttle', kind: 'tactic', system: 'Lines and flanks (the shape)', archetypes: ['B06', 'B05', 'B17'],
    text: 'Your switches and long balls cost their defence 8 stamina (their shape has to shift across); a switch that comes off leaves their team stretched for the rest of that attack.',
    effects: [
      { name: 'shift', hook: 'cost', when: function (q) { return q.side === 'you' && (q.has('switch') || q.has('long ball')); },
        apply: function (q) { q.tire(8, 'def', 'their back four has to shift across: their defence loses 8 stamina'); } },
      { name: 'stretch', on: 'decision_end', when: function (e) { return e.side === 'you' && e.has('switch') && (e.band === 'good' || e.band === 'mixed') && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'the switch has pulled their team across: they are stretched for the rest of this attack'); } },
      /* x1 (b): between moments you switch it about and their back four shifts */
      { name: 'x1shift', on: 'between_play', when: between('pass', 'you'),
        run: function (e) { e.tire('def', 5, 'you switch it about between moments and their back four has to shift'); } }
    ]
  });

  /* ========================================== DEFEND DEEP, BREAK FAST */

  /* The defensive engine: sitting deep turns stops into won balls, and
   * every ball won catches their men upfield (a state the break reads).
   * The drawback: you do not win it high (tackles and presses are -1). */
  define({
    id: 'WC_SIT_DEEP', name: 'Sit deep', kind: 'tactic', system: 'Team tactics (three slots)', archetypes: ['B05'],
    text: 'On their attack: covering, dropping back, blocking and marking are +1, tackling and pressing -1; a stop near your box wins you the ball; when you win it, their team is stretched for your whole attack.',
    effects: [
      { name: 'shape', hook: 'stat', when: function (q) { return q.side === 'them' && (q.has('cover') || q.has('drop back') || q.has('block') || q.has('marking')); },
        apply: function (q) { q.stat(1, 'you have men behind the ball'); } },
      { name: 'noPress', hook: 'stat', when: function (q) { return q.side === 'them' && (q.has('tackle') || q.has('press')) && !(q.has('cover') || q.has('drop back') || q.has('block')); },
        apply: function (q) { q.stat(-1, 'you are sitting deep, not going to win it high'); } },
      { name: 'win', hook: 'outcome', limit: { per: 'possession', n: 1 }, when: function (q) { return q.side === 'them' && q.tzone === 0 && (q.has('cover') || q.has('drop back') || q.has('block') || q.has('marking')); },
        apply: function (q) { q.branch('good', { move: 1 }, 'the stop is clean and you keep the ball: your attack starts in midfield'); } },
      { name: 'caught', on: 'possession_start', when: function (e) { return e.side === 'you' && fromWin(e.st) && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.addState('stretched', 'opponent', { duration: 'possession' }, 'their players came forward and are caught upfield: they are stretched for this attack'); } },
      /* x1 (b): between moments their midfielder runs into your block and
       * loses it: the next moment is yours, with their men caught upfield */
      { name: 'x1block', on: 'between_play', when: between('carry', 'them'),
        run: function (e) {
          if (e.nextIsYours(first(e.foil) + ' runs into your block and loses it: the next moment is yours')) {
            e.addState('stretched', 'opponent', { duration: 'moment' }, 'their men had come forward: they are stretched for this moment');
          }
        } }
    ]
  });

  /* The timing window: the first decision after a won ball. Forward play
   * is +1 and free; wait and the window is gone. */
  define({
    id: 'WC_BREAK', name: 'Break at once', kind: 'tactic', system: 'Sequence and timing windows', archetypes: ['B05', 'B04'],
    text: 'In an attack that starts from a ball you won: forward passes, long balls and runs need a margin of 3 for a clean win, not 4, for the whole attack, and the first of them does not use up one of the attack\'s decisions.',
    effects: [
      { name: 'go', hook: 'duel', when: function (q) { return q.side === 'you' && fromWin(stOf(q)) && any(q, FORWARD_TAGS); },
        apply: function (q) { q.threshold(3, 'you break before they are set: a clean win needs 3, not 4'); } },
      { name: 'free', hook: 'cost', limit: { per: 'possession', n: 1 }, when: function (q) { return q.side === 'you' && fromWin(stOf(q)) && any(q, FORWARD_TAGS); },
        apply: function (q) { q.freeDecision('a first-time ball on the break does not use up one of the attack\'s decisions'); } }
    ]
  });

  /* Routing: a ball your defence wins goes to your quickest forward. */
  function quickRunner(q) { return bestBy(q.roles('runner').filter(function (p) { return p.line >= 1; }), 'pace') || bestBy(forwards(q.squad), 'pace'); }
  define({
    id: 'WC_OUTLET', name: 'Looks for the runner', kind: 'trait', system: 'Routing', archetypes: ['B05', 'B01'],
    text: 'While he is on the pitch, a ball your defence wins goes straight to your quickest runner (a player with the runner role; if none, your quickest forward), who is unmarked for your attack.',
    effects: [
      { name: 'to', hook: 'outcome', when: function (q) { return q.side === 'them' && !!q.actor && q.actor.line === 0; },
        apply: function (q) {
          var f = quickRunner(q);
          if (!f) return;
          q.setTo('good', f, first(q.owner) + ' looks for ' + first(f) + ' at once');
          q.setTo('mixed', f, first(q.owner) + ' looks for ' + first(f) + ' at once');
        } },
      { name: 'free', on: 'recovery', when: function (e) { return !!e.actor && e.actor.line === 0; },
        run: function (e) {
          var f = bestBy(e.roles('runner').filter(function (p) { return p.line >= 1; }), 'pace') || bestBy(forwards(e.st.squad), 'pace');
          if (f) e.addState('unmarked', f, { duration: 'decision' }, first(f) + ' is away before anyone picks him up: he is unmarked');
        } },
      /* x1 (b): between moments a loose ball your defence or midfield wins
       * goes straight to the runner: the next moment is yours, he is
       * unmarked for it and +1 on its first decision */
      { name: 'x1loose', on: 'between_play', when: between('tackle', 'you'),
        run: function (e) {
          var f = bestBy(e.roles('runner').filter(function (p) { return p.line >= 1; }), 'pace') || bestBy(forwards(e.st.squad), 'pace');
          if (!f || !e.nextIsYours(first(e.actor) + ' wins the loose ball and ' + first(e.owner) + ' looks for ' + first(f) + ': the next moment is yours')) return;
          e.addState('unmarked', f, { duration: 'moment' }, first(f) + ' is away before anyone picks him up: he is unmarked this moment');
          e.openEdge({ n: 1, man: f, why: first(f) + ' is away' }, first(f) + ' is away before anyone picks him up');
        } }
    ]
  });

  /* The payoff of "stretched": a runner whose half win against a stretched
   * team is a clean one. Once an attack. */
  define({
    id: 'WC_CAUGHT_UPFIELD', name: 'Goes when they commit', kind: 'trait', system: 'Outcome tiers', archetypes: ['B05', 'B17'],
    text: 'When their team is stretched or he is unmarked, his half win on a run, carry or pass through counts as a clean win.',
    effects: [
      { name: 'tier', hook: 'duel',
        when: function (q) { return q.side === 'you' && q.byOwner() && (q.hasState('stretched', 'opponent') || q.hasState('unmarked', q.actor)) && (any(q, RUN_TAGS) || q.has('through ball')); },
        apply: function (q) { q.tier('mixed', 'good', (q.hasState('stretched', 'opponent') ? 'their team is stretched' : first(q.actor) + ' is unmarked') + ': his half win counts as a clean win'); } }
    ]
  });

  /* Productive failure: dropping off lets them come forward, and the men
   * they commit are the ones your break goes past. */
  define({
    id: 'WC_LETS_THEM_COME', name: 'Lets them come', kind: 'trait', system: 'Drawbacks and productive failure', archetypes: ['B05'],
    text: 'When he drops off or covers instead of going to win it, they push men forward: if you win the ball later in that attack of theirs, your break gets one more decision.',
    effects: [
      { name: 'invite', on: 'decision_end', when: function (e) { return e.side === 'them' && e.byOwner() && (e.has('drop back') || e.has('cover')); },
        run: function (e) { mem(e.st).invited = e.st.fx.scope.possession; } },
      { name: 'more', on: 'possession_start',
        when: function (e) { return e.side === 'you' && fromWin(e.st) && mem(e.st).invited === e.st.fx.scope.possession - 1; },
        run: function (e) { e.extraDecision('they pushed men forward when ' + first(e.owner) + ' let them come: your break gets one more decision'); } }
    ]
  });

  /* Rule exception on the captain: the edges the defence earns and the
   * break's own add up on the first decision after a won ball. */
  define({
    id: 'WC_DEFENCE_TO_ATTACK', name: 'Defence into attack', kind: 'captain', system: 'Rule exceptions', archetypes: ['B05', 'B04'],
    text: 'A clean win on defence gives the attack it starts +1 in that attack, and in that attack edges from earlier decisions add up instead of only the biggest counting.',
    effects: [
      { name: 'edge', hook: 'outcome', when: function (q) { return q.side === 'them'; },
        apply: function (q) { q.grant('good', { n: 1, why: 'you won it cleanly' }, 'a clean win starts your attack with it'); } },
      { name: 'stack', hook: 'stat', when: function (q) { return q.side === 'you' && fromWin(stOf(q)); },
        apply: function (q) { q.stackEdges('the captain carries the defence into the attack: edges add up here'); } }
    ]
  });

  /* Squad composition: runners in numbers turn a clean stop into a longer
   * break. The count is the rule: with one runner it does nothing. */
  define({
    id: 'WC_PACE_IN_NUMBERS', name: 'Pace in numbers', kind: 'tactic', system: 'Squad composition', archetypes: ['B05'],
    text: 'With two or more runners on the pitch, a clean win on defence gives the attack it starts one more decision.',
    effects: [
      { name: 'more', hook: 'outcome', when: function (q) { return q.side === 'them' && q.roles('runner').length >= 2; },
        apply: function (q) { q.extraDecision('good', q.roles('runner').length + ' runners go with it: the attack this starts gets one more decision'); } }
    ]
  });

  /* BRIDGE (against a pressing midfield): when your midfield is pressed or
   * spent, a ball you win goes over it, long to your best header, and your
   * attack starts at the edge of their box. It skips the press, and with it
   * the midfield decision the break would have had. */
  define({
    id: 'WC_OVER_PRESS', name: 'Over the press', kind: 'trait', system: 'Routing', archetypes: ['B05', 'B02'],
    text: 'While your midfield is pressed, or has under 50 stamina, a ball your defence wins goes long over it to your target man (or your strongest forward): your attack starts at the edge of their box.',
    effects: [
      { name: 'long', hook: 'outcome',
        when: function (q) { return q.side === 'them' && (q.hasState('pressed', { line: 'mid' }) || q.legsOf('you', 'mid') < 50); },
        apply: function (q) {
          var t = bestBy(q.roles('target man'), 'physical') || bestBy(forwards(q.squad), 'physical');
          var why = q.hasState('pressed', { line: 'mid' }) ? 'their midfield is pressing yours' : 'your midfield is spent';
          q.setMove('good', 2, why + ': if you win it, ' + first(q.owner) + ' goes long and your attack starts at the edge of their box');
          if (t) q.setTo('good', t, first(t) + ' gets the long ball');
        } }
    ]
  });

  /* ======================================== THE KEEPER'S GUESSING GAME */

  /* The producer: hard shots, +1 while the keeper is not set for one, and a
   * parried one gives the next shot in the attack +1. Every hard shot sets
   * their keeper for another (the engine's read: +2 to him on the next). */
  define({
    id: 'WC_HITS_IT_HARD', name: 'Hits it hard', kind: 'trait', system: 'Footballer traits', archetypes: ['B07', 'B12'],
    text: 'While their keeper is not set for a hard shot, his hard shot needs a margin of 3 for a clean win, not 4; when one is parried, every shot after it in that attack is +2. Each one sets their keeper for a hard shot.',
    effects: [
      { name: 'power', hook: 'duel', when: function (q) { return q.side === 'you' && q.byOwner() && q.has('hard shot') && !q.hasState('adapted', q.opp.keeper, 'hard shot'); },
        apply: function (q) { q.threshold(3, 'he hits it hard and the keeper is not set for it: a clean win needs 3, not 4'); } },
      { name: 'parry', hook: 'outcome', when: function (q) { return q.side === 'you' && q.byOwner() && q.has('hard shot'); },
        apply: function (q) { q.grant('mixed', { n: 2, tags: ['shot'], why: 'the keeper could only parry it' }, 'if the keeper parries it'); } }
    ]
  });

  /* A second producer that does not shoot: in the box he shapes to shoot
   * and passes, and their keeper sets himself for his hard shot. */
  define({
    id: 'WC_SHAPES_TO_SHOOT', name: 'Shapes to shoot', kind: 'trait', system: 'Opponent adaptation and exploits', archetypes: ['B07'],
    text: 'When he has the ball at the edge of their box or in it and does not shoot, but gets it forward (a pass or a run that comes off), their keeper had set himself for his shot: he is set for a hard shot for the rest of that attack.',
    effects: [
      { name: 'dummy', on: 'decision_end',
        when: function (e) { return e.side === 'you' && e.byOwner() && e.zone >= 2 && !e.has('shot') && !e.has('recycle') && !e.has('back pass') && e.effect === 'ground' && (e.band === 'good' || e.band === 'mixed') && !e.hasState('adapted', e.st.opp.keeper, 'hard shot'); },
        run: function (e) { e.addState('adapted', e.st.opp.keeper, { value: 'hard shot', duration: 'possession' }, first(e.st.opp.keeper) + ' set himself for ' + first(e.owner) + '\'s shot: he is ready for a hard shot'); } }
    ]
  });

  /* The payoff: placed shots against a keeper set for the hard one. */
  define({
    id: 'WC_PLACES_IT', name: 'Places it where he is not', kind: 'trait', system: 'Opponent adaptation and exploits', archetypes: ['B07', 'B09'],
    text: 'When their keeper is set for a hard shot, his placed shots and chips are +3.',
    effects: [
      { name: 'wrong', hook: 'stat', when: function (q) { return q.side === 'you' && q.byOwner() && (q.has('placed shot') || q.has('chip')) && q.hasState('adapted', q.opp.keeper, 'hard shot'); },
        apply: function (q) { q.stat(3, first(q.opp.keeper) + ' is set for a hard shot and ' + first(q.actor) + ' puts it where he is not'); } }
    ]
  });

  /* Growth with a reset: alternating shot types builds a bonus for the
   * next alternate, up to +3; the same type twice in a row wipes it. */
  define({
    id: 'WC_KEEP_GUESSING', name: 'Keep the keeper guessing', kind: 'tactic', system: 'Growth within the match', archetypes: ['B07', 'B11'],
    text: 'Each time one of your finishers shoots the other kind from your finishers\' last shot (hard after placed, placed after hard), their next shot of the other kind again is +1 more, up to +3. The same kind twice in a row sets it back to nothing.',
    effects: [
      { name: 'read', on: 'shot', when: function (e) { return e.side === 'you' && !!shotKind(e) && e.roles('finisher').indexOf(e.actor) >= 0 && mem(e.st).shotSeen !== e.st.fx.scope.decision; },
        run: function (e) {
          var m = mem(e.st), k = shotKind(e), prev = m.lastKind;
          m.shotSeen = e.st.fx.scope.decision;
          m.lastKind = k;
          if (!prev) return;
          if (k !== prev) {
            m.alt = Math.min(3, m.alt + 1);
            var said = first(e.st.opp.keeper) + ' is guessing: your next ' + (k === 'hard shot' ? 'placed shot' : 'hard shot') + ' is +' + m.alt;
            e.removeState('in form', 'team', 'your shooting pattern moves on');
            e.addState('in form', 'team', { duration: 'match', value: '+' + m.alt }, said);
          } else if (m.alt) {
            m.alt = 0;
            e.removeState('in form', 'team', 'the same shot twice: ' + first(e.st.opp.keeper) + ' has stopped guessing, back to nothing');
          }
        } },
      { name: 'other', hook: 'stat', when: function (q) {
          var st = stOf(q), m = st && mem(st), k = shotKind(q);
          return q.side === 'you' && !!m && m.alt > 0 && !!k && !!m.lastKind && k !== m.lastKind && q.roles('finisher').indexOf(q.actor) >= 0;
        },
        apply: function (q) { var m = mem(stOf(q)); q.stat(m.alt, 'you keep ' + first(q.opp.keeper) + ' guessing: the other kind of shot again'); } }
    ]
  });

  /* Productive failure: the shot from outside the box (offered by the
   * engine to a good finisher at the edge of their box) is usually saved,
   * but saved or not it sets their keeper for a hard shot for the rest of
   * the match, which the placed-shot man wants. A first version created a
   * new long-shot option; the menu's spread rule never showed it (14 built,
   * 0 shown in 20 matches), so it now works on the engine's own long shot. */
  define({
    id: 'WC_SHOOT_ON_SIGHT', name: 'Shoot on sight', kind: 'tactic', system: 'Drawbacks and productive failure', archetypes: ['B07', 'B12'],
    text: 'Your finishers\' shots from outside the box are +2. Saved or not, a shot from distance sets their keeper for a hard shot until he faces a placed one.',
    effects: [
      { name: 'far', hook: 'stat', when: function (q) { return q.side === 'you' && q.has('long shot') && !!q.actor && q.roles('finisher').indexOf(q.actor) >= 0; },
        apply: function (q) { q.stat(2, 'he shoots on sight'); } },
      { name: 'set', on: 'shot', when: function (e) { return e.side === 'you' && e.has('long shot') && !e.hasState('adapted', e.st.opp.keeper, 'hard shot'); },
        run: function (e) { e.addState('adapted', e.st.opp.keeper, { value: 'hard shot', duration: 'match' }, first(e.st.opp.keeper) + ' has seen one from distance: he is set for a hard shot'); } },
      { name: 'unset', on: 'shot', when: function (e) { return e.side === 'you' && e.has('placed shot'); },
        run: function (e) { e.removeState('adapted', e.st.opp.keeper, first(e.st.opp.keeper) + ' faced a placed shot: he is no longer set for the hard one'); } },
      /* x1 (b): between moments your finishers try one from distance
       * whenever they get a sight of goal: their keeper sets for the hard one */
      { name: 'x1pot', on: 'between_play', when: function (e) { return (e.kind === 'shot' || e.kind === 'pass') && e.side === 'you' && !e.hasState('adapted', e.st.opp.keeper, 'hard shot'); },
        run: function (e) { e.addState('adapted', e.st.opp.keeper, { value: 'hard shot', duration: 'match' }, 'one of yours tries one from distance between moments: ' + first(e.st.opp.keeper) + ' is set for a hard shot'); } }
    ]
  });

  /* BRIDGE (against a commanding keeper, who taxes crosses and placed
   * shots): a keeper set for the hard shot comes off his line to meet it,
   * and a pass across the goal goes past him to a man with an open net. */
  define({
    id: 'WC_SQUARES_IT', name: 'Draws him and squares it', kind: 'trait', system: 'Routing', archetypes: ['B07', 'B12'],
    text: 'When their keeper is set for a hard shot, a pass across the goal (a square ball, cut-back or pull-back) by him or to him is +2.',
    effects: [
      { name: 'square', hook: 'stat',
        when: function (q) { return q.side === 'you' && (q.byOwner() || q.toOwner()) && any(q, BOX_PASS) && q.hasState('adapted', q.opp.keeper, 'hard shot'); },
        apply: function (q) { q.stat(2, first(q.opp.keeper) + ' comes to meet the hard shot and the ball goes across him'); } }
    ]
  });

  /* ===================================================== OPPONENT BUILDS */
  /* Tactics for the team you play against (builds/opp-*.json). Each TAXES
   * one route (a cost, a resisted number, a slower recovery), never removes
   * an option. They use the same helpers; their records are "Their build". */

  /* Against Wear them down: they do not chase, and rest in shape. */
  define({
    id: 'WCO_DEEP_BLOCK', name: 'Deep block', kind: 'tactic', system: 'Matchups and counters', archetypes: ['B06'],
    text: 'They sit deep and do not chase: your runs with the ball and passes through at the edge of their box and in it are resisted (+1 to them), and after each attack of yours their defence rests in its shape and gets 15 stamina back, unless their team is stretched when the attack ends.',
    effects: [
      { name: 'bodies', hook: 'stat', when: function (q) { return q.ownerSide === 'them' && q.side === 'you' && q.zone >= 2 && !!q.foil && !isKeeper(q, q.foil) && (any(q, RUN_TAGS) || q.has('through ball')); },
        apply: function (q) { q.theirStat(1, 'they have bodies behind the ball'); } },
      { name: 'rest', on: 'possession_end', limit: { per: 'possession', n: 1 }, when: function (e) { return e.side === 'you' && !e.hasState('stretched', 'opponent'); },
        run: function (e) { e.refund('def', 15, 'their block gets back into its shape and rests'); } }
    ]
  });

  /* Against Defend deep, break fast: a press that fades as their midfield
   * tires. While it is on, your midfield is pressed. */
  define({
    id: 'WCO_PRESS_MID', name: 'Pressing midfield', kind: 'tactic', system: 'Matchups and counters', archetypes: ['B05', 'B08'],
    text: 'While their midfield has 50 stamina or more, it presses yours each moment (4 stamina a moment to them): your options in your half and in midfield cost 4 more stamina and are resisted (+1 to them), the first decision after you win the ball there is resisted +3, and a duel you lose in midfield gives them +1 next.',
    effects: [
      { name: 'on', on: 'moment_start', when: function (e) { return e.legsOf('them', 'mid') >= 50; },
        run: function (e) {
          e.addState('pressed', { line: 'mid' }, { duration: 'moment' }, 'their midfield presses yours this moment');
          e.spend('mid', 4, 'pressing costs them');
        } },
      { name: 'tax', hook: 'cost', when: function (q) { return q.ownerSide === 'them' && q.side === 'you' && q.zone <= 1 && q.hasState('pressed', { line: 'mid' }); },
        apply: function (q) { q.costBy(4, 'their midfield presses: 4 more stamina'); } },
      { name: 'counterpress', hook: 'stat', when: function (q) { return q.ownerSide === 'them' && q.side === 'you' && q.zone <= 1 && q.hasState('pressed', { line: 'mid' }) && !!q.foil && !isKeeper(q, q.foil); },
        apply: function (q) { var w = fromWin(stOf(q)); q.theirStat(w ? 3 : 1, w ? 'they press straight away when they lose it' : 'their midfield is on you'); } },
      { name: 'won', on: 'loss', when: function (e) { return e.side === 'you' && e.zone === 1 && e.hasState('pressed', { line: 'mid' }); },
        run: function (e) { e.addEdge({ n: 1, why: 'they won it in midfield' }, 'they won it in midfield'); } }
    ]
  });

  /* Against The keeper's guessing game: a keeper who dominates his box.
   * Crosses and headers +2 to him, placed shots +1 (he stands big). Hard
   * shots, low crosses and passes across the goal are untouched. */
  define({
    id: 'WCO_BIG_KEEPER', name: 'Commanding keeper', kind: 'tactic', system: 'Matchups and counters', archetypes: ['B07', 'B01'],
    text: 'Their keeper dominates his box: +2 to them against your high crosses and headers, +2 to their keeper against your placed shots and chips (he stands big). Low crosses, hard shots and passes across the goal are untouched.',
    effects: [
      { name: 'air', hook: 'stat', when: function (q) { return q.ownerSide === 'them' && q.side === 'you' && (q.has('cross') || q.has('header')) && !q.has('low cross'); },
        apply: function (q) { q.theirStat(2, 'their keeper comes for every high ball'); } },
      { name: 'big', hook: 'stat', when: function (q) { return q.ownerSide === 'them' && q.side === 'you' && (q.has('placed shot') || q.has('chip')) && isKeeper(q, q.foil); },
        apply: function (q) { q.theirStat(2, first(q.foil) + ' stands big and waits'); } }
    ]
  });

  /* A general test: they punish what you lose going forward. */
  define({
    id: 'WCO_COUNTER', name: 'Counter-attacking side', kind: 'tactic', system: 'Matchups and counters', archetypes: ['B05', 'B04'],
    text: 'They keep men back and wait: a ball you win from them starts your attack in your own half; when you lose a run with the ball or a shot at the edge of their box or in it, they break at once: +2 to them in the next decision.',
    effects: [
      { name: 'back', hook: 'outcome', when: function (q) { return q.ownerSide === 'them' && q.side === 'them'; },
        apply: function (q) {
          q.setMove('good', 0, 'they kept men back: if you win it, your attack starts in your half');
          q.setMove('mixed', 0, 'they kept men back: if you win it, your attack starts in your half');
        } },
      { name: 'break', on: 'loss', when: function (e) { return e.side === 'you' && e.zone >= 2 && (e.has('shot') || e.has('carry') || e.has('dribble')); },
        run: function (e) { e.addEdge({ n: 2, why: 'they break at once' }, 'they break at once'); } }
    ]
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = { loaded: true, fromWin: fromWin };
})(typeof window !== 'undefined' ? window : globalThis);
