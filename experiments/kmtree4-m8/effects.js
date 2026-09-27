/* THE EFFECTS LAYER (w0). The plumbing that lets many build systems combine.
 *
 * Eduardo's brief (Combinatorial Build Emergence.md): components that are
 * each easy to understand change one another's usefulness, so a strategy
 * belongs to the combination. This file holds no content of its own beyond
 * five test components (components.js). It gives every later component the
 * same four things:
 *
 *   1. A SHARED VOCABULARY. Action tags on every option (several per
 *      option: a short free kick is a set piece AND a short pass), states on
 *      players, lines, the ball and the opponent, with a duration and an
 *      owner. A component that rewards "short pass" works on anything tagged
 *      short pass, including options added later. No bespoke pairings.
 *   2. AN EVENT BUS. The match announces what happened (a clean win, a
 *      recovery, stamina spent, a shot...). Components subscribe, with
 *      activation limits, and say whether events made by other effects count.
 *   3. HOOKS on every part of a duel: the stat, the dice, the clean-win
 *      margin, the outcome tier, the consequences (edge, where the ball goes,
 *      who gets it), the cost, which options exist, extra decisions, and what
 *      the opponent learns.
 *   4. TRACEABILITY. Every change is made through a helper that records the
 *      component's name and a plain sentence. The card lists them before the
 *      pick; the match log has a line each time one fires.
 *
 * With no build loaded none of this runs: match.js never creates a runtime,
 * and every hook site in the engine is guarded by `if (fx)`. The scorecard
 * of w0 without a build is s0's, exactly (fxcheck.js proves it).
 *
 * Plain English everywhere, no em dashes. Browser: window.KMEffects.
 */
(function (root) {
  'use strict';

  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function stop(s) { s = String(s || '').trim(); return /[.!?]$/.test(s) ? s : s + '.'; }

  /* ================================================== 1. VOCABULARY */

  /* ACTION TAGS. What an option IS, in football words. An option carries
   * several; an effect may add, remove or reinterpret one (hook 'tags'),
   * which changes what other effects think the option is. */
  var ACTION_TAGS = [
    'pass', 'short pass', 'forward pass', 'long ball', 'through ball', 'switch', 'cross', 'low cross',
    'cut-back', 'pull-back', 'square ball', 'layoff', 'one-two', 'overlap', 'back pass', 'recycle', 'late run',
    'dribble', 'carry', 'run in behind',
    'shot', 'hard shot', 'placed shot', 'long shot', 'chip', 'rebound',
    'header', 'aerial',
    'set piece', 'free kick', 'corner',
    'tackle', 'press', 'double team', 'interception', 'block', 'foul', 'offside trap', 'cover', 'marking',
    'drop back', 'race', 'wall', 'clearance',
    'keeper action', 'save', 'claim', 'distribution',
    'time wasting', 'substitution', 'all out attack'
  ];
  var TAG_OK = {};
  ACTION_TAGS.forEach(function (t) { TAG_OK[t] = 1; });

  /* Every option in options.js POOL, tagged. fxcheck.js fails if an option
   * in the pool has no row here, so a new option cannot slip in untagged. */
  var TAGS_OF = {
    KEEPER_SHORT: ['keeper action', 'distribution', 'short pass', 'pass'],
    KEEPER_WIDE: ['keeper action', 'distribution', 'pass', 'carry'],
    KEEPER_OUT: ['keeper action', 'clearance'],
    KEEPER_LONG: ['keeper action', 'distribution', 'long ball', 'pass'],
    ATTACK_BALL: [], MEET_IT: ['tackle', 'marking'],
    STAY_GOALSIDE: ['cover', 'marking'],
    HOLD: ['short pass', 'pass', 'recycle'],
    SWITCH: ['switch', 'pass', 'long ball'],
    KEEPER_SWEEPS: ['keeper action', 'clearance'],
    LONG_TO_TARGET: ['cross', 'header', 'aerial', 'long ball'],
    RUN_IN_BEHIND: ['long ball', 'run in behind', 'pass'],
    DRIBBLE: ['dribble', 'carry'],
    SHOOT_LONG: ['shot', 'long shot'],
    OVERLAP_RUN: ['overlap', 'carry'],
    DROP_OFF: ['cover', 'drop back'],
    DOUBLE_UP: ['double team', 'tackle'],
    FOUL: ['foul', 'tackle'],
    HEAD_CLEAR: ['header', 'aerial', 'clearance'],
    OFFSIDE_TRAP: ['offside trap', 'keeper action'],
    WASTE_TIME: ['time wasting', 'recycle'],
    KEEPER_UP: ['all out attack', 'keeper action', 'aerial'],
    THROW_EVERYONE: ['all out attack', 'late run'],
    FRESH_LEGS: ['substitution', 'time wasting'],
    Z_PASS_MID: ['pass', 'short pass', 'forward pass'],
    Z_CARRY_OUT: ['carry', 'dribble'],
    Z_LONG_UP: ['long ball', 'aerial', 'header', 'pass'],
    Z_KEEP_BACK: ['short pass', 'pass', 'recycle'],
    Z_RUN_BEHIND: ['long ball', 'run in behind', 'through ball', 'pass'],
    Z_CARRY: ['carry', 'dribble'],
    Z_THROUGH: ['through ball', 'forward pass', 'pass'],
    Z_SWITCH: ['switch', 'pass', 'long ball'],
    Z_SHOOT_FAR: ['shot', 'long shot', 'hard shot'],
    Z_CROSS: ['cross', 'header', 'aerial'],
    Z_WIDE: ['pass', 'short pass'],
    Z_CUTBACK: ['cut-back', 'short pass', 'pass'],
    Z_TAKE_ON: ['dribble', 'carry'],
    Z_OVERLAP: ['overlap', 'pass'],
    Z_LAYOFF: ['layoff', 'short pass', 'pass'],
    Z_RECYCLE: ['back pass', 'recycle', 'pass'],
    Z_SHOOT: ['shot', 'hard shot'],
    Z_PLACE: ['shot', 'placed shot'],
    Z_PULLBACK: ['pull-back', 'short pass', 'pass'],
    Z_CHIP: ['shot', 'chip'],
    Z_SQUARE: ['square ball', 'short pass', 'pass'],
    M_PRESS: ['press', 'tackle'],
    M_CUT: ['interception', 'cover'],
    M_DROP: ['drop back', 'cover'],
    M_FOUL: ['foul', 'tackle'],
    E_TACKLE: ['tackle', 'press'],
    E_WIDE: ['cover', 'marking'],
    E_OFFSIDE: ['offside trap', 'marking'],
    E_DOUBLE: ['double team', 'tackle'],
    E_RACE: ['race', 'cover'],
    E_COVER: ['cover', 'drop back'],
    E_BLOCK: ['block', 'marking'],
    E_FOUL: ['foul', 'tackle'],
    T_RETREAT: ['drop back', 'cover'],
    BOX_MARK: ['marking', 'cover'],
    BOX_WALL: ['wall', 'set piece', 'keeper action'],
    BOX_FK_SAVE: ['keeper action', 'save', 'set piece'],
    BOX_CHARGE: ['block', 'set piece'],
    BOX_CLEAR: ['clearance', 'tackle'],
    BOX_SAVE: ['keeper action', 'save'],
    BOX_BLOCK: ['block', 'cover'],
    BOX_RUSH: ['keeper action', 'save'],
    BOX_HEADER: ['header', 'aerial', 'clearance'],
    BOX_CLAIM: ['keeper action', 'claim', 'aerial'],
    BOX_NARROW: ['keeper action', 'save'],
    BOX_COVER: ['cover', 'tackle'],
    KW_Z_THROUGH_DEEP: ['through ball', 'long ball', 'forward pass', 'pass'],
    KW_Z_DRIBBLE_TWO: ['dribble', 'carry'],
    KW_Z_DRIBBLE_BOX: ['dribble', 'carry'],
    KW_Z_HEAD_DOWN: ['long ball', 'header', 'aerial', 'layoff'],
    KW_Z_EARLY_CROSS: ['cross', 'header', 'aerial'],
    KW_Z_LOW_CROSS: ['cross', 'low cross', 'pass'],
    KW_Z_LATE_RUN: ['late run', 'short pass', 'pass'],
    KW_Z_FREE_KICK_WIDE: ['set piece', 'free kick', 'shot'],
    FK_SHOT: ['set piece', 'free kick', 'shot', 'placed shot'],
    FK_POWER: ['set piece', 'free kick', 'shot', 'hard shot'],
    FK_CROSS: ['set piece', 'free kick', 'cross', 'header', 'aerial'],
    FK_SHORT: ['set piece', 'free kick', 'short pass', 'pass'],
    REB_SHOOT: ['shot', 'hard shot', 'rebound'],
    PAIR_ONE_TWO: ['one-two', 'short pass', 'pass'],
    OT_RETURN: ['one-two', 'short pass', 'pass'],
    PAIR_OVERLAP: ['overlap', 'carry'],
    PAIR_FLICK: ['long ball', 'header', 'aerial', 'layoff'],
    PAIR_ROUTINE: ['set piece', 'cross', 'header', 'aerial'],
    KW_STEAL: ['tackle', 'interception'],
    PAIR_PRESS: ['press', 'tackle', 'double team'],
    KW_FREE_FOUL: ['foul', 'tackle'],
    KW_KEEPER_START: ['keeper action', 'interception'],
    KW_KEEPER_CARRY: ['keeper action', 'carry'],
    PAIR_PLAY_OUT: ['keeper action', 'distribution', 'short pass', 'pass'],
    KW_BLOCK_BACK: ['block', 'cover'],
    KW_CLAIM: ['keeper action', 'claim', 'aerial'],
    TD_SHOW_WIDE: ['cover', 'marking'],
    TD_DOUBLE: ['double team', 'tackle'],
    TD_FOUL: ['foul', 'tackle'],
    TD_DROP: ['drop back', 'cover'],
    TP_DEEP: ['drop back', 'cover'],
    TP_PRESS: ['press', 'tackle'],
    TP_CUT: ['interception', 'cover'],
    TP_OFFSIDE: ['offside trap', 'marking'],
    BOX_KEEP_REACT: ['keeper action', 'save'],
    BOX_KEEP_CATCH: ['keeper action', 'claim', 'save'],
    BOX_SLIDE: ['block', 'tackle'],
    BOX_DIVE: ['keeper action', 'save']
  };
  /* the few generic options take tags from the stat they test and what
   * they pay: "goes up for it" is a header, "shoots" is a shot */
  /* w1f: every option carries two or more tags (the tag audit): the
   * attribute rows of the generic "goes for the ball" option get a second tag */
  var ATTR_TAGS = { reach: ['aerial', 'header'], finishing: ['shot', 'hard shot'], technique: ['dribble', 'carry'], pace: ['run in behind', 'race'] };
  var PAYS_TAGS = { shot: ['shot'], shotreb: ['shot', 'hard shot'], placed: ['shot', 'placed shot'], longshot: ['shot', 'long shot'],
    header: ['header', 'aerial'], rebshot: ['shot', 'rebound'], fkshot: ['shot', 'set piece', 'free kick'] };
  function tagsFor(id, mineAttr, pays, mode) {
    var out = (TAGS_OF[id] || []).slice();
    function add(list) { (list || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); }
    if (!out.length) add(ATTR_TAGS[mineAttr]);
    add(PAYS_TAGS[pays]);
    if (mode === 'freekick') add(['set piece', 'free kick']);
    return out;
  }

  /* STATES: a named condition on something, with a duration and an owner.
   * Some are also READ from the engine's own memory (DERIVED below), so a
   * component can pay off a condition the base game already produces. */
  var STATES = {
    'unmarked': 'no defender is close to him',
    'out of position': 'a defender has been pulled out of his place',
    'fatigued': 'tired: his line has less than 40 stamina, or an effect says so',
    'booked': 'on a yellow card',
    'marked': 'a defender has been told to stay with him',
    'adapted': 'ready for one kind of action (value: which, such as "hard shot")',
    'in form': 'playing well in this match',
    'fresh': 'just came on, or had stamina back',
    'stretched': 'a defence pulled wide',
    'pressed': 'under pressure on the ball',
    /* w1f: seven shared states from the catalogue (content-f.js produces and
     * reads each one in two or more systems). Five are held by the opponent. */
    'rattled': 'one of theirs beaten cleanly or fouling: he stays rattled until he wins a duel against you',
    'keeper down': 'their keeper is on the ground after a save, for the rest of the attack',
    'scrambling': 'their defence is scrambling after a loose ball, for the rest of the attack',
    'caught upfield': 'their players were going forward when you won the ball: the attack that starts from it',
    'on his own': 'one of their defenders has no cover beside him, for the rest of the attack',
    'rhythm': 'your attack has strung clean wins together; a half win or a loss breaks it',
    'banked edge': 'an edge your team kept for later, spent by the component that uses it'
  };
  var DURATIONS = ['decision', 'possession', 'moment', 'match'];
  var OWNERS = ['player', 'line', 'relationship', 'opponent', 'team', 'ball'];

  /* EVENTS the match announces. `side` in the payload is whose decision it
   * was ('you' on your attack, 'them' on theirs); actor is always one of
   * your players (you choose for them in both). */
  var EVENTS = {
    moment_start: 'one of the six moments starts (before its first menu is built)',
    moment_end: 'the moment is over',
    possession_start: 'a new attack by one side starts, before its first menu is built (w0b; in w0 it fired after), so what it changes applies to that first menu',
    possession_end: 'that attack is over',
    decision_end: 'after every decision, when everything else has happened',
    clean_win: 'your player won his duel by the clean-win margin or more',
    half_win: 'your player won his duel by less than the clean-win margin, or tied it',
    loss: 'your player lost his duel',
    recovery: 'you won the ball back (their attack ended with your team on the ball)',
    stamina_spent: 'a line paid stamina for a decision (amount, line)',
    stamina_refunded: 'a line got stamina back from an effect (amount, line)',
    sub_in: 'a substitute came on (player, line; w0b: off, the man he replaced, with real substitutions; side, whose)',
    sub_out: 'a player went off. With real substitutions (w0b, a build\'s "subs") player is the man who left and on the man who came on; in the s0 default a substitution refreshes a line and nobody leaves, so player is null',
    set_piece_awarded: 'a free kick or corner was given (side says to whom)',
    foul_won: 'one of their players fouled one of yours (w1f: fouler, the man who fouled, when the result names him)',
    shot: 'one of your players shot (actor)',
    goal: 'you scored',
    conceded: 'they scored',
    state_added: 'an effect put a state on something',
    state_removed: 'a state was removed or ran out',
    edge_granted: 'an effect gave your next decision an edge',
    extra_decision: 'an effect gave the current attack one more decision',
    /* w0b: the stamina of the team you play against (st.oppSpent). Their
     * legs do not run down with the clock (they never did in s0); only
     * effects and their substitutions move them. */
    their_stamina_spent: 'a line of the team you play against lost stamina to an effect (line, amount)',
    their_stamina_refunded: 'a line of the team you play against got stamina back (line, amount): an effect, or one of their substitutions',
    /* x1 (b): only with the "between" switch on (match.js betweenPlay) */
    between_play: 'x1: the play between two moments (kind: pass, carry, shot, tackle or foul; side: whose ball it is), before the next moment is drawn; the between helpers change how that moment opens'
  };

  /* HOOKS: the places in a decision a component can change, in the order the
   * engine applies them to one option. Groups are what the five test
   * components exercise (one component per group). */
  var HOOKS = {
    tags: { group: 'menu', where: 'options.js offer, first', can: 'add, remove or reinterpret the option\'s action tags' },
    option: { group: 'menu', where: 'options.js offer, after the option is built', can: 'remove the option, or change who receives the ball' },
    stat: { group: 'duel', where: 'options.js offer, with the other parts of the numbers', can: 'add a named part to your number or theirs; let carried edges stack' },
    duel: { group: 'duel', where: 'options.js offer (odds) and match.js choose (the roll)', can: 'roll several dice and keep the best, change the clean-win margin, turn one result tier into another' },
    cost: { group: 'economy', where: 'options.js offer, where the stamina cost is set', can: 'change the stamina cost; make the decision free (it does not use up one of the attack\'s decisions)' },
    outcome: { group: 'consequence', where: 'options.js offer, on each result line', can: 'change where the ball goes and who gets it, carry an edge to the next decision, turn an ending into a continuation, give the attack one more decision' },
    counter: { group: 'opponent', where: 'match.js counterFor', can: 'cancel or add to what the opponent has learned against this option' },
    learn: { group: 'opponent', where: 'match.js counterRecord, after your decision', can: 'stop the opponent learning from this decision' }
  };
  /* creating options is not a per-option hook: a component lists `pool`
   * entries in the same shape as options.js POOL (group: menu) */
  var GROUPS = {
    menu: ['tags', 'option', 'pool'],
    duel: ['stat', 'duel'],
    consequence: ['outcome'],
    economy: ['cost', 'events: stamina_refunded, stamina_spent'],
    opponent: ['counter', 'learn', 'states on the opponent']
  };
  var KINDS = ['tactic', 'trait', 'specialisation', 'relationship', 'captain'];
  /* roles a build may give a player: a vocabulary components can count
   * ("with two runners in the eleven...") without the engine knowing them */
  var ROLES = ['target man', 'runner', 'playmaker', 'winger', 'finisher', 'ball winner', 'carrier', 'crosser',
    'link player', 'set-piece taker', 'defender', 'keeper', 'presser', 'outlet'];

  /* ======================================================== LIMITS */
  /* Bounded amplification is engine-enforced as well as per component:
   *   MAX_DEPTH  an effect may trigger an effect that triggers an effect,
   *              and no deeper
   *   MAX_FIRES  no more effect firings than this in one decision
   *   EXTRA_MAX  extra decisions one attack may get from effects
   *   FREE_MAX   free decisions one attack may get from effects */
  var LIMIT = { MAX_DEPTH: 3, MAX_FIRES: 60, EXTRA_MAX: 2, FREE_MAX: 2, PROLONG_MAX: 2 };
  /* w0b: PROLONG_MAX  times one attack of theirs may be kept going or pushed
   *                   back by effects (a defending setMove or an opponent's
   *                   branch), so a defence and an attack cannot see-saw */
  /* switches for fxcheck --prove: each turns one piece of the plumbing off,
   * to show the check that guards it fails */
  var GUARD = { tags: true, option: true, stat: true, dice: true, threshold: true, tier: true, cost: true, free: true,
    move: true, to: true, edge: true, branch: true, extra: true, foul: true /* m1 from w1b */, counter: true, learn: true, pool: true,
    depth: true, limits: true, audit: true,
    /* w0b */
    subs: true, subStates: true, dormant: true, oppLegs: true, oppEdge: true, tire: true,
    defMove: true, defTo: true, defEdge: true, defBranch: true, defExtra: true, possFirst: true, oppBuild: true,
    /* m2 from w1d */
    yourPlan: true,
    /* m3: a hook that only adds an extra decision uses up its limit */
    extraLimit: true };
  /* m3: THE PAYOFF SWITCH (cl1/PAYOFFS.md), a design call, OFF by default.
   * On: a card a piece of yours created (a setup card: the hold-up, the wall
   * pass, the third man, the free man...) in your attack counts a half win
   * as a clean win; the card names it on the piece that made it. Node:
   * KM_PAYOFF=1; page: ?payoff=1; in a process: KMEffects.setPayoff(true). */
  var PAYOFF = { on: !!((typeof process !== 'undefined' && process.env && process.env.KM_PAYOFF === '1') ||
    (root.location && /[?&]payoff=1(&|$)/.test(root.location.search || ''))) };
  function payoffOn() { return PAYOFF.on; }
  function setPayoff(v) { PAYOFF.on = !!v; }
  /* w0b: log sources that are the engine, not a component */
  var SYSTEM_SOURCES = ['The effects engine', 'Substitution', 'Their stamina'];

  /* =================================================== THE REGISTRY */
  var REG = {};
  function fail(msg) { throw new Error('effects: ' + msg); }
  /* define(component). The shape later waves fill (EFFECTS.md has it in full):
   *   { id, name, kind, text,
   *     effects: [ { hook, when(q), apply(q), limit } | { on, when(e), run(e), limit, fromEffects } ],
   *     pool: [ { id, side, zones, family, tags, when(x, q), build(x, q) } ] } */
  function define(def) {
    if (!def || !def.id) fail('a component needs an id');
    if (!def.name) fail(def.id + ' needs a name');
    if (KINDS.indexOf(def.kind) < 0) fail(def.id + ': kind must be one of ' + KINDS.join(', '));
    (def.effects || []).forEach(function (e, i) {
      var at = def.id + ' effect ' + i;
      if (e.hook) {
        if (!HOOKS[e.hook]) fail(at + ': unknown hook ' + e.hook);
        if (typeof e.apply !== 'function') fail(at + ': a hook effect needs apply(q)');
      } else if (e.on) {
        if (!EVENTS[e.on]) fail(at + ': unknown event ' + e.on);
        if (typeof e.run !== 'function') fail(at + ': an event effect needs run(e)');
      } else fail(at + ': needs a hook or an event (on)');
      if (e.limit) {
        if (DURATIONS.indexOf(e.limit.per) < 0) fail(at + ': limit.per must be one of ' + DURATIONS.join(', '));
        if (!(e.limit.n >= 1)) fail(at + ': limit.n must be 1 or more');
      }
    });
    (def.pool || []).forEach(function (p) {
      if (!p.id || typeof p.build !== 'function') fail(def.id + ': a pool entry needs an id and build(x, q)');
      (p.tags || []).forEach(function (t) { if (!TAG_OK[t]) fail(def.id + ': unknown tag ' + t); });
    });
    REG[def.id] = def;
    return def;
  }
  function get(id) {
    if (!REG[id] && typeof require === 'function') { try { require('./components.js'); } catch (e) { } }
    return REG[id] || null;
  }

  /* ================================================ THE BUILD FORMAT */
  /* A build is JSON (EFFECTS.md "Build format"):
   *   { id, name, about, base: "spain" | "argentina" | "random", opponent,
   *     slots: 3 to 5, tactics: [component ids, at most `slots`],
   *     players: [ { name, roles: [], traits: [ids], specialisations: [ids], kw: [keyword ids] } ],
   *     relationships: [ { component, a, b } ], captain: name | { name, component },
   *     bench: [names] }
   * Players are named from the base squad (first name, as the match says it). */
  function norm(s) { return String(s || '').replace(/ /g, ' ').toLowerCase(); }
  function findPlayer(squad, name, bench) {
    var n = norm(name);
    var all = squad.players.concat(squad.keeper ? [squad.keeper] : []).concat(bench ? (squad.bench || []) : []);
    return all.filter(function (p) { return norm(p.name) === n || norm(first(p)) === n || norm(p.fullName) === n; })[0] || null;
  }
  function validateBuild(b, squad) {
    var bad = [];
    if (!b || typeof b !== 'object') return ['a build must be an object'];
    var slots = b.slots === undefined ? 3 : b.slots;
    if (!(slots >= 3 && slots <= 5)) bad.push('slots must be 3 to 5 (it is ' + slots + ')');
    var tac = b.tactics || [];
    if (tac.length > slots) bad.push(tac.length + ' tactics in ' + slots + ' slots');
    tac.forEach(function (id) {
      var d = get(id);
      if (!d) bad.push('no component called ' + id);
      else if (d.kind !== 'tactic') bad.push(id + ' is a ' + d.kind + ', not a tactic');
    });
    (b.players || []).forEach(function (pl) {
      var p = squad ? findPlayer(squad, pl.name, true) : true;
      if (!p) bad.push('no player called ' + pl.name + ' in the squad');
      (pl.traits || []).concat(pl.specialisations || []).forEach(function (id) {
        var d = get(id);
        if (!d) bad.push('no component called ' + id);
        else if (d.kind !== 'trait' && d.kind !== 'specialisation') bad.push(id + ' is a ' + d.kind + ', not a trait or specialisation');
      });
      (pl.roles || []).forEach(function (r) { if (ROLES.indexOf(r) < 0) bad.push('unknown role ' + r + ' (roles: ' + ROLES.join(', ') + ')'); });
    });
    (b.relationships || []).forEach(function (r) {
      var d = get(r.component);
      if (!d) bad.push('no component called ' + r.component);
      else if (d.kind !== 'relationship') bad.push(r.component + ' is a ' + d.kind + ', not a relationship');
      if (squad && (!findPlayer(squad, r.a) || !findPlayer(squad, r.b))) bad.push('a relationship names a player not in the eleven: ' + r.a + ', ' + r.b);
    });
    if (b.captain) {
      var cn = typeof b.captain === 'string' ? b.captain : b.captain.name;
      if (squad && !findPlayer(squad, cn)) bad.push('the captain ' + cn + ' is not in the eleven');
      if (b.captain.component) {
        var cd = get(b.captain.component);
        if (!cd) bad.push('no component called ' + b.captain.component);
        else if (cd.kind !== 'captain') bad.push(b.captain.component + ' is a ' + cd.kind + ', not a captain component');
      }
    }
    /* w0b: substitutions. "subs": "real", or { mode: "real", plan: [ { off,
     * on, minute } ], below, from }. Without it a substitution is s0's (a
     * line gets its stamina back and nobody goes off). */
    if (b.subs !== undefined && b.subs !== null) {
      var sb = b.subs === 'real' ? { mode: 'real' } : b.subs;
      if (typeof sb !== 'object' || (sb.mode !== 'real' && sb.mode !== 'refresh')) bad.push('subs must be "real", or { mode: "real" | "refresh", plan, below, from }');
      else {
        if (sb.below !== undefined && !(sb.below >= 0 && sb.below <= 100)) bad.push('subs.below must be 0 to 100 (the stamina a line is offered a change at)');
        if (sb.from !== undefined && !(sb.from >= 0 && sb.from <= 90)) bad.push('subs.from must be a minute, 0 to 90');
        (sb.plan || []).forEach(function (e) {
          var on = squad && findPlayer(squad, e.on, true), off = squad && findPlayer(squad, e.off);
          if (squad && (!off || squad.players.indexOf(off) < 0)) bad.push('a planned substitution takes off ' + e.off + ', who is not in the outfield eleven');
          if (squad && (!on || (squad.bench || []).indexOf(on) < 0)) bad.push('a planned substitution brings on ' + e.on + ', who is not on the bench');
          if (e.minute !== undefined && !(e.minute >= 1 && e.minute <= 90)) bad.push('a planned substitution\'s minute must be 1 to 90');
        });
      }
    }
    if (b.against !== undefined && typeof b.against !== 'string') bad.push('against must be the name of the opponent\'s build');
    return bad;
  }
  /* w0b: a build's substitutions, read once (never mutated: one build object
   * is shared by many matches) */
  function subsOf(b) {
    var s = b && b.subs;
    if (!s) return null;
    if (s === 'real') s = { mode: 'real' };
    if (s.mode !== 'real') return null;
    return { mode: 'real', plan: (s.plan || []).slice(), below: typeof s.below === 'number' ? s.below : 45,
      from: typeof s.from === 'number' ? s.from : null };
  }
  /* put the build's players, keywords, roles and bench onto the squad (once) */
  function applyBuild(squad, b) {
    if (!b || squad._build === b) return squad;
    var bad = validateBuild(b, squad);
    if (bad.length) fail('the build "' + (b.name || b.id) + '" is not valid: ' + bad.join('; '));
    (b.players || []).forEach(function (pl) {
      var p = findPlayer(squad, pl.name, true);
      if (pl.kw) p.kw = pl.kw.slice();
      if (pl.roles) p.roles = pl.roles.slice();
    });
    if (b.bench && squad.bench) {
      var keep = b.bench.map(function (n) { return findPlayer(squad, n, true); }).filter(Boolean);
      squad.bench = keep;
    }
    if (b.captain) squad.captain = findPlayer(squad, typeof b.captain === 'string' ? b.captain : b.captain.name);
    squad._build = b;
    return squad;
  }

  /* ================================================= THE RUNTIME */
  function Runtime(st, build) {
    this.st = st; this.build = build;
    this.inst = []; this.log = []; this.states = [];
    this.counts = {}; this.scope = { decision: 0, possession: 0, moment: 0, match: 0 };
    this.depth = 0; this.fires = 0; this.capBonus = 0; this.freeUsed = 0;
    this.suspended = false; this.current = null; this.violations = []; this.runaway = false;
    this.removed = []; this.side = null; this.chooseAt = 0; this.evLines = [];
    /* w0b */
    this.oppBuild = null; this.subs = null; this.oppSubsCfg = null; this.oppPlanDone = {};
    this.oppEdges = []; this.pendingExtra = 0; this.prolonged = 0; this.subLog = [];
  }
  function ownerName(def, owner) {
    /* w0b: an opponent's component says so: "Aerial keeper (their Martínez)" */
    var th = owner.side === 'them' ? 'their ' : '';
    if (owner.kind === 'player') return def.name + ' (' + th + first(owner.player) + ')';
    if (owner.kind === 'relationship') return def.name + ' (' + th + first(owner.a) + ' and ' + first(owner.b) + ')';
    if (owner.kind === 'captain') return def.name + ' (' + th + 'captain ' + first(owner.player) + ')';
    return def.name + ' (' + th + 'tactic)';
  }
  /* load a build into a match: the squad first, then one instance per
   * component, in a fixed order (tactic slots, relationships, captain,
   * players in squad order), which is the order effects apply in */
  /* w0b: attach(st, build, oppBuild). Either may be null; the opponent's
   * build (w0b) is loaded onto st.opp the same way, its instances marked
   * side 'them' and applied after yours. */
  function attach(st, build, oppBuild) {
    if (!GUARD.oppBuild) oppBuild = null;
    if (build) applyBuild(st.squad, build);
    if (oppBuild) applyBuild(st.opp, oppBuild);
    var fx = new Runtime(st, build || null);
    fx.oppBuild = oppBuild || null;
    fx.subs = subsOf(build); fx.oppSubsCfg = subsOf(oppBuild);
    /* w0b: the opponent's stamina, per line, spent by effects only */
    st.oppSpent = { def: 0, mid: 0, att: 0 };
    function addSide(b, sq, side) {
      if (!b) return;
      function add(id, owner) {
        var def = get(id);
        owner.side = side;
        fx.inst.push({ def: def, owner: owner, name: ownerName(def, owner), i: fx.inst.length, side: side });
      }
      (b.tactics || []).forEach(function (id) { add(id, { kind: 'team' }); });
      (b.relationships || []).forEach(function (r) {
        add(r.component, { kind: 'relationship', a: findPlayer(sq, r.a), b: findPlayer(sq, r.b) });
      });
      if (b.captain && b.captain.component) add(b.captain.component, { kind: 'captain', player: sq.captain });
      var byName = {};
      (b.players || []).forEach(function (pl) { byName[norm(findPlayer(sq, pl.name, true).name)] = pl; });
      sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).forEach(function (p) {
        var pl = byName[norm(p.name)];
        if (!pl) return;
        (pl.traits || []).concat(pl.specialisations || []).forEach(function (id) { add(id, { kind: 'player', player: p }); });
      });
    }
    addSide(build, st.squad, 'you');
    addSide(oppBuild, st.opp, 'them');
    st.fx = fx;
    return fx;
  }

  /* ---------------------------------------------------- the log */
  /* one line: { at (decision number), minute, source, text, kind } */
  Runtime.prototype.write = function (source, text, kind, field) {
    var line = { at: this.st.log.length, minute: this.minute ? this.minute() : null, source: source,
      text: stop(text), kind: kind || 'event', field: field || null };
    line.line = source + ': ' + line.text;
    this.log.push(line);
    this.evLines.push(line);
    if (this._run) this._run.wrote++;
    return line;
  };

  /* ------------------------------------------------- limits */
  function effKey(inst, k) { return inst.i + ':' + k; }
  Runtime.prototype.usable = function (inst, k, eff) {
    if (!eff.limit || !GUARD.limits) return true;
    var key = effKey(inst, k) + ':' + eff.limit.per + ':' + this.scope[eff.limit.per];
    return (this.counts[key] || 0) < eff.limit.n;
  };
  /* m3: spend the limit of the effect a record came from ("inst:k") */
  Runtime.prototype.spendKey = function (key) {
    var ik = String(key).split(':'), inst = this.inst[+ik[0]], eff = inst && inst.def.effects && inst.def.effects[+ik[1]];
    if (eff) this.spend1(inst, +ik[1], eff);
  };
  Runtime.prototype.spend1 = function (inst, k, eff) {
    if (!eff.limit) return;
    var key = effKey(inst, k) + ':' + eff.limit.per + ':' + this.scope[eff.limit.per];
    this.counts[key] = (this.counts[key] || 0) + 1;
  };

  /* ------------------------------------------------- states */
  Runtime.prototype.isOurs = function (p) {
    var sq = this.st.squad;
    return sq.players.indexOf(p) >= 0 || p === sq.keeper || (sq.bench || []).indexOf(p) >= 0 || (sq.off || []).indexOf(p) >= 0;
  };
  /* w0b: the squad of a side, and whether a man is on the pitch now (in
   * the eleven or in goal: not on the bench, not substituted off) */
  Runtime.prototype.squadOf = function (side) { return side === 'them' ? this.st.opp : this.st.squad; };
  Runtime.prototype.onPitch = function (p) {
    if (!p) return false;
    var a = this.st.squad, b = this.st.opp;
    return a.players.indexOf(p) >= 0 || p === a.keeper || b.players.indexOf(p) >= 0 || p === b.keeper;
  };
  /* w0b: OWNERSHIP ON THE PITCH. A component owned by a player (a trait, a
   * specialisation, the captain's) acts only while he is on the pitch; a
   * relationship only while both are. A bench player's trait therefore
   * waits on the bench and starts when he comes on; the man who goes off
   * takes his with him (his own sub_out is the last event he hears).
   * Tactics belong to the team and always act. */
  Runtime.prototype.active = function (inst, evName, e0) {
    if (!GUARD.dormant) return true;
    var o = inst.owner, leaving = evName === 'sub_out' && e0 && e0.player;
    if (o.kind === 'player' || o.kind === 'captain') return this.onPitch(o.player) || (!!leaving && e0.player === o.player);
    if (o.kind === 'relationship') return (this.onPitch(o.a) && this.onPitch(o.b)) || (!!leaving && (e0.player === o.a || e0.player === o.b));
    return true;
  };
  /* a target is a player, { line: 'def'|'mid'|'att', side: 'you'|'them' },
   * 'ball', 'team', 'opponent', or { pair: [a, b] } */
  Runtime.prototype.target = function (t) {
    if (t === 'ball') return { kind: 'ball', id: 'ball', label: 'the ball' };
    if (t === 'team') return { kind: 'team', id: 'team', label: 'your team' };
    if (t === 'opponent') return { kind: 'opponent', id: 'opponent', label: 'their team' };
    if (t && t.pair) return { kind: 'relationship', id: 'pair:' + t.pair.map(function (p) { return p.id; }).sort().join('+'), label: first(t.pair[0]) + ' and ' + first(t.pair[1]), pair: t.pair.slice() };
    /* w0b: a line is { line: 'def' | 'mid' | 'att' }. w0 tested only t.line,
     * so a midfielder or forward (a player has a numeric .line of 1 or 2)
     * was taken for a line: a state put on him landed on "you:1" */
    if (t && typeof t.line === 'string' && !t.name) {
      var them = t.side === 'them';
      return { kind: them ? 'opponent' : 'line', id: (them ? 'them:' : 'you:') + t.line,
        label: (them ? 'their ' : 'your ') + { def: 'defence', mid: 'midfield', att: 'attack' }[t.line] };
    }
    if (t && t.name) return { kind: this.isOurs(t) ? 'player' : 'opponent', id: 'p:' + t.id, label: first(t), p: t };
    fail('unknown state target');
  };
  Runtime.prototype.addState = function (source, name, target, opts, text) {
    if (!STATES[name]) fail('unknown state ' + name + ' (states: ' + Object.keys(STATES).join(', ') + ')');
    opts = opts || {};
    var dur = opts.duration || 'possession';
    if (DURATIONS.indexOf(dur) < 0) fail('unknown duration ' + dur);
    /* x1 (c): with the "long" switch, a state set for one decision lasts
     * the rest of the attack. m2: x1 made it an attack-long state at once,
     * which ended a state set as their attack ends (a ball won back) before
     * your attack could read it (wave B's Gone before they turn was never
     * offered). Now it stays a decision state, marked: when a decision of
     * YOUR attack ends with it alive, it becomes attack-long (expire below) */
    var lengthen = dur === 'decision' && lasts(this.st);
    var tg = this.target(target);
    var s = { name: name, value: opts.value || null, on: tg, duration: dur, source: source, born: this.stamp(), n: opts.n || null };
    if (lengthen) s.lengthen = true;
    this.states.push(s);
    this.write(source, text || (tg.label + ' is ' + name + (s.value ? ' (' + s.value + ')' : '') + ' for this ' + dur), 'state', 'state');
    this.emit('state_added', { state: name, value: s.value, target: target, owner: tg.kind });
    return s;
  };
  Runtime.prototype.removeState = function (source, name, target, text) {
    var tg = this.target(target), n = 0;
    this.states = this.states.filter(function (s) {
      if (s.name === name && s.on.id === tg.id) { n++; return false; }
      return true;
    });
    if (n) {
      this.write(source, text || (tg.label + ' is no longer ' + name), 'state', 'state');
      this.emit('state_removed', { state: name, target: target, owner: tg.kind });
    }
    return n;
  };
  /* stored states first, then the engine's own memory (DERIVED) */
  Runtime.prototype.hasState = function (name, target, value) {
    var tg = this.target(target);
    var hit = this.states.some(function (s) { return s.name === name && s.on.id === tg.id && (!value || s.value === value); });
    if (hit) return true;
    var d = DERIVED[name];
    return !!(d && d(this, tg, value));
  };
  var LINE_KEY = ['def', 'mid', 'att'];
  var DERIVED = {
    booked: function (fx, tg) {
      if (!tg.p) return false;
      return tg.kind === 'player' ? !!fx.st.booked[tg.p.id] : !!fx.st.oppBooked[tg.p.id];
    },
    fatigued: function (fx, tg) {
      /* w0b: theirs too, from their stamina (st.oppSpent) */
      if (tg.kind === 'opponent') {
        if (tg.p && typeof tg.p.line === 'number') return fx.legsOf('them', LINE_KEY[tg.p.line]) < 40;
        if (/^them:/.test(tg.id)) return fx.legsOf('them', tg.id.split(':')[1]) < 40;
        return false;
      }
      if (!fx.legs) return false;
      var L = fx.legs();
      if (tg.kind === 'player' && typeof tg.p.line === 'number') return L[LINE_KEY[tg.p.line]] < 40;
      if (tg.kind === 'line') return L[tg.id.split(':')[1]] < 40;
      return false;
    },
    /* their keeper reads the last shot (match.js, f2): "adapted" to it */
    adapted: function (fx, tg, value) {
      var st = fx.st;
      if (!tg.p || tg.p !== st.opp.keeper || st.counter !== 'learn' || !st.cmem.keeper) return false;
      var v = st.cmem.keeper === 'hard' ? 'hard shot' : 'placed shot';
      return !value || value === v;
    },
    'out of position': function (fx, tg) {
      return !!(tg.p && fx.carried().some(function (c) { return c.id === 'beaten' && c.man === tg.p; }));
    },
    unmarked: function (fx, tg) {
      return !!(tg.p && fx.carried().some(function (c) { return c.id === 'unmarked' && c.man === tg.p; }));
    },
    marked: function (fx, tg) {
      var a = fx.st.cmem && fx.st.cmem.adapt && fx.st.cmem.adapt.set;
      return !!(tg.p && a && a.man === tg.p);
    }
  };
  /* what the decision being built carries from the last one */
  Runtime.prototype.carried = function () {
    var p = this.st.pending, ch = this.st.chain;
    if (p && p.carriedRaw) return p.carriedRaw;
    return (ch && ch.carried) || [];
  };
  Runtime.prototype.stamp = function () { return this.st.log.length * 2 + (this.inChoose ? 1 : 0); };
  /* a state of duration d ends at the end of its scope */
  Runtime.prototype.expire = function (dur) {
    var self = this, gone = [];
    this.states = this.states.filter(function (s) {
      if (s.duration !== dur) return true;
      /* a 'decision' state lives until the end of the next decision it saw
       * start: one added during this decision's own events survives it */
      if (dur === 'decision' && s.born >= self.chooseAt) return true;
      /* m2 (x1 variant c): it saw a decision of your attack; it lasts the attack */
      if (dur === 'decision' && s.lengthen && self.side === 'you') { s.duration = 'possession'; return true; }
      gone.push(s); return false;
    });
    gone.forEach(function (s) {
      self.write(s.source, s.on.label + ' is no longer ' + s.name + ' (it lasted this ' + s.duration + ')', 'expire', 'state');
    });
  };

  /* ------------------------------------------------ the event bus */
  /* emit(name, payload): every event effect subscribed to `name` runs, in
   * instance order, unless its limit is used up, it does not take events
   * made by effects and this one was, or the chain is MAX_DEPTH deep. */
  Runtime.prototype.emit = function (name, payload) {
    if (this.suspended) return 0;
    if (!EVENTS[name]) fail('unknown event ' + name);
    var e0 = payload || {};
    e0.name = name;
    e0.fromEffect = this.depth > 0;
    e0.by = this.current;
    if (GUARD.depth && this.depth >= LIMIT.MAX_DEPTH) return 0;
    var self = this, fired = 0;
    this.inst.forEach(function (inst) {
      (inst.def.effects || []).forEach(function (eff, k) {
        if (eff.on !== name) return;
        if (!self.active(inst, name, e0)) return;
        if (e0.fromEffect && !eff.fromEffects && GUARD.limits) return;
        if (!self.usable(inst, k, eff)) return;
        var e = self.eventView(inst, e0);
        if (eff.when && !eff.when(e)) return;
        if (++self.fires > LIMIT.MAX_FIRES) {
          if (!self.runaway) self.write('The effects engine', 'stopped effects for this decision: more than ' + LIMIT.MAX_FIRES + ' fired', 'limit');
          self.runaway = true;
          return;
        }
        self.spend1(inst, k, eff);
        var was = self.current, snap = GUARD.audit ? self.snapshot() : null;
        self.current = inst.name; self.depth++;
        var run = self._run = { wrote: 0, prev: self._run };
        try { eff.run(e); } finally {
          self.depth--; self.current = was; self._run = run.prev;
          if (self._run) self._run.wrote += run.wrote;
        }
        if (snap && self.snapshot() !== snap && !run.wrote) {
          self.violations.push(inst.name + ' changed the match on ' + name + ' and wrote no log line');
        }
        fired++;
      });
    });
    return fired;
  };
  /* what an event handler could change, for the audit (not the log) */
  Runtime.prototype.snapshot = function () {
    var st = this.st, ch = st.chain || st.handoff;
    return JSON.stringify([st.spent, st.score, ch ? [ch.cap || 0, (ch.carried || []).length] : null, this.capBonus, this.freeUsed,
      this.states.length, st.subsLeft, st.oppSpent || null, this.oppEdges.length, this.pendingExtra,
      st.squad.players.map(function (p) { return p.id; }), st.opp.players.map(function (p) { return p.id; })]);
  };
  /* the object an event handler gets: the payload, its owner, and the
   * actions it may take, each writing its own log line */
  Runtime.prototype.eventView = function (inst, e0) {
    var fx = this, src = inst.name, owner = inst.owner, side = inst.side || 'you', them = side === 'them';
    var e = Object.create(e0);
    e.owner = owner.player || null; e.pair = owner.kind === 'relationship' ? [owner.a, owner.b] : null;
    e.st = fx.st;
    /* w0b: whose component this is ('you' or 'them'). Payloads stay as the
     * match sees them (actor is your man, foil theirs), so an opponent's
     * component asks againstOwner() where yours asks byOwner(). */
    e.ownerSide = side;
    e.has = function (t) { return (e0.tags || []).indexOf(t) >= 0; };
    e.byOwner = function () { return !!owner.player && e0.actor === owner.player; };
    e.byPair = function () { return !!e.pair && (e0.actor === owner.a || e0.actor === owner.b); };
    e.againstOwner = function () { return (!!owner.player && e0.foil === owner.player) || (!!e.pair && (e0.foil === owner.a || e0.foil === owner.b)); };
    e.isCaptain = function (p) { return !!p && p === fx.squadOf(side).captain; };
    /* stamina: refund and spend act on the OWNER's team, tire on the other */
    e.refund = function (line, n, text) { return them ? fx.refundThem(src, line, n, text) : fx.refund(src, line, n, text); };
    e.spend = function (line, n, text) { return them ? fx.tireThem(src, line, n, text) : fx.spend(src, line, n, text); };
    e.tire = function (line, n, text) { return them ? fx.spend(src, line, n, text) : fx.tireThem(src, line, n, text); };
    e.legsOf = function (s2, line) { return fx.legsOf(s2, line); };
    e.onPitch = function (p) { return fx.onPitch(p); };
    e.addState = function (name, target, opts, text) { return fx.addState(src, name, target, opts, text); };
    e.removeState = function (name, target, text) { return fx.removeState(src, name, target, text); };
    e.hasState = function (name, target, value) { return fx.hasState(name, target, value); };
    /* an edge for the owner's side in the next decision */
    e.addEdge = function (edge, text) { return them ? fx.addOppEdge(src, edge, text) : fx.addEdge(src, edge, text); };
    e.extraDecision = function (text) {
      if (them) { fx.write(src, 'no extra decision: only your attacks get extra decisions', 'limit'); return false; }
      return fx.extraDecision(src, text);
    };
    e.note = function (text) { return fx.write(src, text, 'event'); };
    e.roles = function (role, s2) { return fx.withRole(role, s2 || side); };
    /* x1 (b): the between helpers. They act only during the play between
     * moments (match.js betweenPlay) and only for your components; each
     * changes how the NEXT moment opens, through the engine, with a line */
    e.nextIsYours = function (text) { return !them && fx.x1Yours(src, text); };
    e.startHigher = function (text) { return !them && fx.x1Up(src, text); };
    e.openEdge = function (edge, text) { return !them && fx.x1Open(src, edge, text); };
    e.bookThem = function (p, text) { return !them && fx.x1Book(src, p, text); };
    return e;
  };
  /* w0b: players with a role, on the pitch, of a side (yours by default) */
  Runtime.prototype.withRole = function (role, side) {
    return this.squadOf(side || 'you').players.filter(function (p) { return (p.roles || []).indexOf(role) >= 0; });
  };

  /* ---------------------------------------- actions for event effects */
  Runtime.prototype.refund = function (src, line, n, text) {
    var st = this.st;
    if (LINE_KEY.indexOf(line) < 0) fail('refund: line must be def, mid or att');
    var got = Math.max(0, Math.min(n, st.spent[line] || 0));
    if (!got) return 0;
    st.spent[line] -= got;
    this.write(src, text ? text + ' (+' + got + ' stamina to your ' + LW[line] + ')' : 'your ' + LW[line] + ' gets ' + got + ' stamina back', 'event', 'stamina');
    this.emit('stamina_refunded', { line: line, amount: got, side: 'you' });
    return got;
  };
  var LW = { def: 'defence', mid: 'midfield', att: 'attack' };
  Runtime.prototype.spend = function (src, line, n, text) {
    var st = this.st;
    if (LINE_KEY.indexOf(line) < 0) fail('spend: line must be def, mid or att');
    st.spent[line] += n;
    this.write(src, text ? text + ' (-' + n + ' stamina from your ' + LW[line] + ')' : 'your ' + LW[line] + ' spends ' + n + ' stamina', 'event', 'stamina');
    this.emit('stamina_spent', { line: line, amount: n, side: 'you' });
    return n;
  };
  /* an edge for the next decision of this attack: +n to options with one
   * of `tags` (all if none), by `man` if named. It is a carried edge like
   * the engine's own, so edges still do not stack unless an effect says so. */
  Runtime.prototype.addEdge = function (src, edge, text) {
    var st = this.st, ch = st.chain && st.chain.next === 'zone' ? st.chain : st.handoff;
    if (!ch) return false;
    var c = fxEdge(src, edge, text, false, lasts(st));   /* m2: this chain is always an attack of yours (yours, or the ball you just won) */
    ch.carried = (ch.carried || []).concat([c]);
    this.write(src, c.text, 'event', 'edge');
    this.emit('edge_granted', { edge: c, side: 'you' });
    return true;
  };
  function fxEdge(src, edge, text, them, lasting) {
    (edge.tags || []).forEach(function (t) { if (!TAG_OK[t]) fail('unknown tag ' + t); });
    /* m2 (x1 variant c, on by default): an edge of yours that goes into
     * your attack lasts the rest of that attack (match.js), so the card
     * says "in this attack", not "next" */
    var longWords =
      '+' + edge.n + (edge.man || (edge.tags && edge.tags.length) ? ' to ' : '') +
        (edge.man ? first(edge.man) + (edge.tags && edge.tags.length ? '\'s ' : '') : edge.tags && edge.tags.length ? 'your ' : '') +
        (edge.tags && edge.tags.length ? edge.tags.map(plural).join(' and ') : '') + ' in this attack';
    var nextWords = '+' + edge.n + ' to ' + (edge.man ? first(edge.man) + '\'s ' : them ? 'them in their ' : 'your ') + 'next ' + (edge.tags && edge.tags.length ? edge.tags.join(' or ') : 'duel');
    var head = cap(text || edge.why || src) + ': ';
    var c = { id: 'fx', n: edge.n, tags: edge.tags || null, man: edge.man || null, source: src, theirs: !!them, lasting: !!(lasting && !them),
      why: edge.why || src, text: head + (lasting && !them ? longWords : nextWords) };
    /* m2: both wordings, so match.js can say the right one when it knows
     * where the edge lands (lastingText) */
    if (!them) { c.textNext = head + nextWords; c.textLong = head + longWords; }
    return c;
  }
  /* m2: "cross" as "crosses", "run in behind" as "runs in behind" */
  function plural(t) {
    var w = String(t).split(' ');
    if (w[0] === 'run' || w[0] === 'pass' && w.length > 1) { w[0] = w[0] === 'run' ? 'runs' : 'passes'; return w.join(' '); }
    var l = w.length - 1;
    w[l] = /(ss|sh|ch|x)$/.test(w[l]) ? w[l] + 'es' : w[l] + 's';
    return w.join(' ');
  }
  /* m2: does a firing last the whole attack in this match (x1 variant c)? */
  function lasts(st) { return !!(st && st.x1 && st.x1.long); }
  /* m2: an edge of yours that lands in an attack of yours (on) or in a
   * decision of your defence (off) says so */
  function lastingText(c, on) {
    if (!c || c.id !== 'fx' || c.theirs || !c.textLong) return c;
    c.lasting = !!on; c.text = on ? c.textLong : c.textNext;
    return c;
  }
  /* w0b: THEIR STAMINA. st.oppSpent per line, moved only by effects and
   * their substitutions; legs are 100 minus it. The engine turns tired legs
   * into lower Pace and Physical exactly as it does for yours (oppParts). */
  Runtime.prototype.legsOf = function (side, line) {
    if (LINE_KEY.indexOf(line) < 0) fail('legsOf: line must be def, mid or att');
    if (side === 'them') return GUARD.oppLegs ? Math.max(0, 100 - ((this.st.oppSpent && this.st.oppSpent[line]) || 0)) : 100;
    return this.legs ? this.legs()[line] : 100;
  };
  Runtime.prototype.tireThem = function (src, line, n, text) {
    var st = this.st;
    if (LINE_KEY.indexOf(line) < 0) fail('tire: line must be def, mid or att');
    if (!(n > 0) || !GUARD.tire) return 0;
    st.oppSpent[line] += n;
    this.write(src, text ? text + ' (-' + n + ' stamina from their ' + LW[line] + ')' : 'their ' + LW[line] + ' loses ' + n + ' stamina', 'event', 'their stamina');
    this.emit('their_stamina_spent', { line: line, amount: n, side: 'them' });
    return n;
  };
  Runtime.prototype.refundThem = function (src, line, n, text) {
    var st = this.st;
    if (LINE_KEY.indexOf(line) < 0) fail('refund: line must be def, mid or att');
    var got = Math.max(0, Math.min(n, st.oppSpent[line] || 0));
    if (!got) return 0;
    st.oppSpent[line] -= got;
    this.write(src, text ? text + ' (+' + got + ' stamina to their ' + LW[line] + ')' : 'their ' + LW[line] + ' gets ' + got + ' stamina back', 'event', 'their stamina');
    this.emit('their_stamina_refunded', { line: line, amount: got, side: 'them' });
    return got;
  };
  /* w0b: an edge for THEM in the next decision (an opponent's component):
   * +n to their man's number on the next decision's options that match its
   * tags (all if none) and man (anyone of theirs if none). Named on the
   * card like every part; gone at the end of that decision. */
  Runtime.prototype.addOppEdge = function (src, edge, text) {
    if (!GUARD.oppEdge) return false;
    var c = fxEdge(src, edge, text, true);
    c.until = this.scope.decision + (this.inChoose ? 1 : 0);
    this.oppEdges.push(c);
    this.write(src, c.text, 'event', 'edge');
    this.emit('edge_granted', { edge: c, side: 'them' });
    return true;
  };
  Runtime.prototype.extraDecision = function (src, text) {
    var st = this.st;
    if (!(st.chain && st.chain.next === 'zone') && !st.handoff) return false;
    if (this.capBonus >= LIMIT.EXTRA_MAX) {
      this.write(src, 'no extra decision: this attack already has ' + LIMIT.EXTRA_MAX + ' from effects', 'limit');
      return false;
    }
    this.capBonus++;
    this.write(src, text || 'this attack gets one more decision', 'event', 'continuation');
    this.emit('extra_decision', { side: 'you' });
    return true;
  };

  var X1_BREAK = (typeof process !== 'undefined' && process.env && process.env.KM_X1_BREAK) || '';   /* x1check.js --prove */
  /* x1 (b): THE BETWEEN HELPERS (see match.js betweenPlay). st.x1Next is
   * there only while the play between moments is being played. */
  Runtime.prototype.x1Yours = function (src, text) {
    var st = this.st, nx = st.x1Next;
    if (!nx || st.forcedTheirs) return false;
    /* EXPERIMENT.md's decomposition: KM_X1_NOBALL=1 keeps every between
     * clause except the ones that hand you the ball */
    if (typeof process !== 'undefined' && process.env && process.env.KM_X1_NOBALL) return false;
    if (nx.yours) return true;
    nx.yours = true; if (X1_BREAK !== 'noforce') st.forcedYours = true;
    nx.lines.push(this.write(src, text || 'you have the ball when the next moment starts', 'event', 'between').line);
    return true;
  };
  Runtime.prototype.x1Up = function (src, text) {
    var nx = this.st.x1Next;
    if (!nx || !nx.yours || nx.up >= 1) return false;
    if (X1_BREAK !== 'noup') nx.up = 1;
    nx.lines.push(this.write(src, text || 'your attack starts one zone higher', 'event', 'between').line);
    return true;
  };
  Runtime.prototype.x1Open = function (src, edge, text) {
    var nx = this.st.x1Next;
    if (!nx || !nx.yours) return false;
    var c = fxEdge(src, edge, text, false, lasts(this.st));
    nx.open.push(c);
    nx.lines.push(this.write(src, c.text, 'event', 'edge').line);
    return true;
  };
  Runtime.prototype.x1Book = function (src, p, text) {
    var st = this.st;
    if (!st.x1Next || !p || this.isOurs(p) || p === st.opp.keeper || st.oppBooked[p.id]) return false;
    if (X1_BREAK !== 'nobook') st.oppBooked[p.id] = this.minute ? this.minute() : 1;
    st.x1Next.lines.push(this.write(src, text || (first(p) + ' is booked: +2 to your players running at him for the rest of the match'), 'event', 'between').line);
    return true;
  };

  /* ------------------------------------------------ scope boundaries */
  Runtime.prototype.momentStart = function () {
    this.scope.moment++;
    /* w0b: their planned substitutions whose minute has come */
    this.oppSubsDue(this.minute ? this.minute() : 0);
    /* m2 from w1d: and yours (a plan entry of your build with a minute) */
    this.yourSubsDue(this.minute ? this.minute() : 0);
    this.emit('moment_start', { minute: this.minute ? this.minute() : null });
  };
  Runtime.prototype.possessionStart = function (side) {
    this.scope.possession++; this.capBonus = 0; this.freeUsed = 0; this.side = side; this.prolonged = 0;
    /* w0b: an extra decision won on defence belongs to the attack it starts */
    if (side === 'you' && this.pendingExtra) { this.capBonus = this.pendingExtra; this.pendingExtra = 0; }
    this.emit('possession_start', { side: side });
  };
  /* w0b: a defending result that wins the ball gives the attack it starts
   * one more decision (bounded like any extra decision) */
  Runtime.prototype.grantExtraNext = function (src, text, rec) {
    if (this.pendingExtra >= LIMIT.EXTRA_MAX) {
      this.write(src, 'no extra decision: the attack already has ' + LIMIT.EXTRA_MAX + ' from effects', 'limit');
      return false;
    }
    this.pendingExtra++;
    /* m3: counts against its effect's limit (once, even if another record
     * of the same effect already did in fired()) */
    if (GUARD.extraLimit && rec && rec.key && !(this.firedSeen || {})[rec.key]) { (this.firedSeen = this.firedSeen || {})[rec.key] = 1; this.spendKey(rec.key); }
    this.write(src, text || 'the attack this starts gets one more decision', 'option', 'continuation');
    this.emit('extra_decision', { side: 'you' });
    return true;
  };

  /* ================================================ SUBSTITUTIONS (w0b) */
  /* REAL SUBSTITUTIONS are a build's choice ("subs": "real"). Without it a
   * substitution is s0's: the line gets its stamina back and nobody goes
   * off. With it a named bench player takes a named man's place: his slot
   * and line, with his own role, numbers, keywords and components.
   *
   * OWNERSHIP when a man goes off: states HELD BY HIM (on him, or on a pair
   * he is in) leave with him; states held by a line, the team, the ball or
   * the opponent stay, whoever made them. His own components stop (Runtime
   * active); the new man's start. The pressing forward's fatigue on their
   * defence therefore survives his substitution, but nothing adds to it. */
  Runtime.prototype.realSubs = function (side) { return GUARD.subs && !!(side === 'them' ? this.oppSubsCfg : this.subs); };
  function homeLine(p) { return typeof p.homeLine === 'number' ? p.homeLine : typeof p.line === 'number' ? p.line : null; }
  function sumAttr(p) { var a = p.attr || {}, t = 0; for (var k in a) t += a[k] || 0; return t; }
  /* who would come on for line `line` ('def', 'mid', 'att') and who goes
   * off: the build's plan first (the first unused pair whose man going off
   * is in that line), else the first unused bench player for that line
   * (or any), for the man in the line with his role (or the weakest) */
  Runtime.prototype.pickSub = function (side, line, used) {
    var cfg = side === 'them' ? this.oppSubsCfg : this.subs, sq = this.squadOf(side);
    if (!cfg) return null;
    used = used || {};
    var li = LINE_KEY.indexOf(line);
    var bench = (sq.bench || []).filter(function (p) { return p.attr && !used[p.id]; });
    var inLine = sq.players.filter(function (p) { return p.line === li; });
    if (!bench.length || !inLine.length) return null;
    for (var k = 0; k < cfg.plan.length; k++) {
      var e = cfg.plan[k];
      /* m2 from w1d: a plan entry with a minute is made at that minute (oppSubsDue,
       * yourSubsDue), never offered as a card */
      if (typeof e.minute === 'number' && (side === 'them' || GUARD.yourPlan)) continue;
      var on = findPlayer(sq, e.on, true), off = findPlayer(sq, e.off);
      if (on && off && bench.indexOf(on) >= 0 && inLine.indexOf(off) >= 0) return { on: on, off: off, plan: true };
    }
    var onP = bench.filter(function (p) { return homeLine(p) === li; })[0] || bench[0];
    var offP = inLine.filter(function (p) { return p.role === onP.role; })[0] ||
      inLine.slice().sort(function (a, b) { return sumAttr(a) - sumAttr(b); })[0];
    return { on: onP, off: offP, plan: false };
  };
  /* the swap itself; the caller emits sub_in and sub_out */
  Runtime.prototype.substitute = function (side, off, on, minute, why) {
    var sq = this.squadOf(side), i = sq.players.indexOf(off), bi = (sq.bench || []).indexOf(on);
    if (!GUARD.subs || i < 0 || bi < 0) return false;
    var fx = this, src = 'Substitution', whose = side === 'them' ? 'their ' : '';
    var before = this.inst.filter(function (x) { return fx.active(x); });
    on.line = off.line; on.slot = off.slot;
    on.subAt = minute; off.offAt = minute;
    sq.players[i] = on;
    sq.bench.splice(bi, 1);
    (sq.off = sq.off || []).push(off);
    this.subLog.push({ side: side, off: off, on: on, minute: minute, at: this.st.log.length, bench: bi, onLine: typeof on.line === 'number' ? on.line : null, onSlot: typeof on.slot === 'number' ? on.slot : null });
    this.write(src, cap(whose) + first(on) + ' comes on for ' + first(off) + (why ? ', ' + why : ''), 'event', 'sub');
    /* what he held leaves with him */
    if (GUARD.subStates) {
      var gone = this.states.filter(function (s) { return s.on.p === off || (s.on.pair && s.on.pair.indexOf(off) >= 0); });
      this.states = this.states.filter(function (s) { return gone.indexOf(s) < 0; });
      gone.forEach(function (s) {
        fx.write(src, s.on.label + ' is no longer ' + s.name + ': ' + first(off) + ' went off', 'state', 'state');
        fx.emit('state_removed', { state: s.name, target: s.on.p || (s.on.pair ? { pair: s.on.pair } : null), owner: s.on.kind });
      });
    }
    /* whose components stop and start */
    this.inst.forEach(function (x) {
      var was = before.indexOf(x) >= 0, now = fx.active(x);
      if (was && !now) fx.write(src, x.name + ' stops: ' + first(off) + ' went off', 'event', 'sub');
      if (!was && now) fx.write(src, x.name + ' is in play: ' + first(on) + ' came on', 'event', 'sub');
    });
    return true;
  };
  /* their plan's substitutions with a minute, made when a moment starts at
   * or after it; the line he joins gets its stamina back (their fresh legs) */
  Runtime.prototype.oppSubsDue = function (minute) {
    var cfg = this.oppSubsCfg, fx = this, st = this.st;
    if (!cfg || !GUARD.subs) return;
    cfg.plan.forEach(function (e, k) {
      if (fx.oppPlanDone[k] || typeof e.minute !== 'number' || minute < e.minute) return;
      fx.oppPlanDone[k] = true;
      var on = findPlayer(st.opp, e.on, true), off = findPlayer(st.opp, e.off);
      /* a bench player with no numbers (random squads' opponents) cannot come on */
      if (!on || !off || !on.attr || !fx.substitute('them', off, on, minute, 'as their plan says')) return;
      var line = LINE_KEY[on.line];
      var tired = (st.oppSpent && st.oppSpent[line]) || 0;
      if (tired) fx.refundThem('Substitution', line, tired, first(on) + ' brings fresh legs');
      fx.emit('sub_in', { side: 'them', player: on, off: off, line: line, minute: minute });
      fx.emit('sub_out', { side: 'them', player: off, on: on, line: line, minute: minute });
    });
  };
  /* m2 from w1d: YOUR build's planned substitutions with a minute (EFFECTS.md
   * "Substitutions": plan entries with a minute were only the opponent's).
   * The manager decided the change before the match; it is made at the
   * first stoppage from that minute (a moment starting), like theirs: it
   * uses one of your three changes, and the line he joins gets its stamina
   * back as s0's clean substitution does. Entries without a minute stay
   * what they were (the pair the substitution card offers). */
  Runtime.prototype.yourSubsDue = function (minute) {
    var cfg = this.subs, fx = this, st = this.st;
    if (!cfg || !GUARD.subs || !GUARD.yourPlan) return;
    this.yourPlanDone = this.yourPlanDone || {};
    cfg.plan.forEach(function (e, k) {
      if (fx.yourPlanDone[k] || typeof e.minute !== 'number' || minute < e.minute) return;
      fx.yourPlanDone[k] = true;
      if (!(st.subsLeft > 0)) return;
      var on = findPlayer(st.squad, e.on, true), off = findPlayer(st.squad, e.off);
      if (!on || !off || !on.attr || (st.usedSubs && st.usedSubs[on.id]) || !fx.substitute('you', off, on, minute, 'as your plan says')) return;
      st.usedSubs[on.id] = 1; st.subsLeft = Math.max(0, st.subsLeft - 1);
      var line = LINE_KEY[on.line];
      st.rested[line] = minute; st.spent[line] = 0;
      fx.write('Substitution', 'your ' + LW[line] + ' gets fresh legs', 'event', 'stamina');
      fx.emit('sub_in', { side: 'you', player: on, off: off, line: line, minute: minute });
      fx.emit('sub_out', { side: 'you', player: off, on: on, line: line, minute: minute });
    });
  };
  /* m2 from w1d: put the squads back as they were before this match's real
   * substitutions (the page's "play again" reuses the same squad objects;
   * after a real substitution the man who went off was no longer in the
   * eleven or on the bench, so the next match could not load the build) */
  function undoSubs(st) {
    var fx = st && st.fx;
    if (!fx || !fx.subLog || !fx.subLog.length) return 0;
    fx.subLog.slice().reverse().forEach(function (e) {
      var sq = e.side === 'them' ? st.opp : st.squad, i = sq.players.indexOf(e.on);
      if (i < 0) return;
      sq.players[i] = e.off;
      e.on.line = e.onLine; e.on.slot = e.onSlot; delete e.on.subAt; delete e.off.offAt;
      sq.bench = sq.bench || [];
      sq.bench.splice(Math.min(e.bench, sq.bench.length), 0, e.on);
      sq.off = (sq.off || []).filter(function (p) { return p !== e.off; });
    });
    var n = fx.subLog.length;
    fx.subLog = [];
    return n;
  }
  Runtime.prototype.possessionEnd = function () {
    if (!this.side) return;
    var side = this.side; this.side = null;
    this.emit('possession_end', { side: side });
    this.expire('possession');
  };
  Runtime.prototype.momentEnd = function () {
    this.possessionEnd();
    this.emit('moment_end', {});
    this.expire('moment');
  };

  /* ============================================= OPTION HOOKS (views) */
  /* The engine makes one Option record per option it builds (options.js
   * offer1: fx.option(...)) and asks each hook in turn. A component sees a
   * view `q` and can only change the option through q's helpers, each of
   * which records { source, field, text }: that record is the line on the
   * card before the pick, and the log line when it fires. */
  function OptionRec(fx, data) {
    this.fx = fx; this.d = data; this.records = [];
    this.tags = data.tags.slice();
    this.mine = []; this.theirs = []; this.stack = null;
    this.goodBy = null; this.dice = 1; this.tier = {};
    this.costDelta = 0; this.free = null;
    this.removedBy = null; this.to = undefined;
    this.lineOps = [];
    this.tires = [];   /* w0b: q.tire */
  }
  OptionRec.prototype.rec = function (inst, field, text, extra) {
    var r = { source: inst.name, field: field, text: stop(text), key: inst.i + ':' + inst.k, side: inst.side || 'you' };
    if (inst.system) r.system = true;   /* w0b: the engine's own part (their stamina) */
    if (extra) for (var k in extra) r[k] = extra[k];
    r.line = r.source + ': ' + r.text;
    this.records.push(r);
    return r;
  };
  /* run every effect of hook `name` on this option */
  Runtime.prototype.hook = function (name, rec) {
    if (this.suspended) return;
    var fx = this;
    this.inst.forEach(function (inst) {
      if (!fx.active(inst)) return;
      (inst.def.effects || []).forEach(function (eff, k) {
        if (eff.hook !== name) return;
        if (!fx.usable(inst, k, eff)) return;
        var q = fx.view(inst, k, rec);
        if (eff.when && !eff.when(q)) return;
        eff.apply(q);
      });
    });
  };
  Runtime.prototype.view = function (inst, k, R) {
    var fx = this, d = R.d, owner = inst.owner, oside = inst.side || 'you';
    var at = { name: inst.name, i: inst.i, k: k, side: oside };
    var q = {
      /* w0b: ownerSide ('you' or 'them': whose component this is). The view
       * is the same for both: actor is your man, foil theirs, stat() your
       * number, theirStat() theirs. An opponent's component resists a route
       * with theirStat(+n) and taxes it with costBy(+n) or stat(-n). */
      ownerSide: oside,
      againstOwner: function () { return (!!owner.player && d.foil === owner.player) || (owner.kind === 'relationship' && (d.foil === owner.a || d.foil === owner.b)); },
      legsOf: function (s2, line) { return fx.legsOf(s2, line); },
      onPitch: function (p) { return fx.onPitch(p); },
      /* w0b: when this option is chosen, the OTHER side's line loses n
       * stamina (default: the line of the man on the other side of the duel) */
      tire: function (n, line, text) {
        if (!(n > 0)) return;
        var p = oside === 'them' ? d.actor : d.foil;
        var ln = line || (p && typeof p.line === 'number' ? LINE_KEY[p.line] : null);
        if (!ln) return;
        R.tires.push({ n: n, line: ln, side: oside === 'them' ? 'you' : 'them',
          rec: R.rec(at, 'tire', text || ((oside === 'them' ? 'your ' : 'their ') + LW[ln] + ' loses ' + n + ' stamina if you choose this')) });
      },
      id: d.id, side: d.side, zone: d.zone, tzone: d.tzone, pays: d.pays, sit: d.sit,
      mode: d.mode || null, finishing: !!d.finishing,   /* m1 from w1b: the free-kick mode, and whether this is the attack's last decision */
      carrier: d.carrier || null,   /* m1 from w1e: your man on the ball (your attack only) */
      actor: d.actor, foil: d.foil, to: R.to !== undefined ? R.to : d.to, mineAttr: d.mineAttr, theirsAttr: d.theirsAttr,
      owner: owner.player || null, pair: owner.kind === 'relationship' ? [owner.a, owner.b] : null,
      squad: fx.st.squad, opp: fx.st.opp, captain: fx.st.squad.captain || null,
      tags: R.tags.slice(),
      has: function (t) { return R.tags.indexOf(t) >= 0; },
      byOwner: function () { return !!owner.player && d.actor === owner.player; },
      toOwner: function () { return !!owner.player && q.to === owner.player; },
      byPair: function () { return !!q.pair && (d.actor === owner.a || d.actor === owner.b); },
      hasState: function (name, target, value) { return fx.hasState(name, target, value); },
      roles: function (role, s2) { return fx.withRole(role, s2 || 'you'); },
      /* tags */
      addTag: function (t, text) { need(t); if (R.tags.indexOf(t) < 0) { R.tags.push(t); R.rec(at, 'tags', text || 'this counts as ' + t); } },
      removeTag: function (t, text) { need(t); var i = R.tags.indexOf(t); if (i >= 0) { R.tags.splice(i, 1); R.rec(at, 'tags', text || 'this no longer counts as ' + t); } },
      retag: function (from, to, text) { need(from); need(to); var i = R.tags.indexOf(from); if (i < 0) return;
        R.tags.splice(i, 1); if (R.tags.indexOf(to) < 0) R.tags.push(to); R.rec(at, 'tags', text || 'the ' + from + ' counts as a ' + to); },
      /* availability and recipient */
      remove: function (text) { R.removedBy = R.rec(at, 'availability', text || 'this option is not offered'); },
      setRecipient: function (p, text) { if (!p || p === q.to) return; R.to = p; q.to = p; R.rec(at, 'recipient', text || 'the ball goes to ' + first(p) + ' instead'); },
      /* numbers */
      stat: function (n, why) { if (!n) return; R.mine.push({ n: n, why: inst.name + ': ' + why, fx: true }); R.rec(at, 'stat', (n > 0 ? '+' : '') + n + ' to ' + (d.actor ? first(d.actor) : 'your player') + ', ' + why); },
      theirStat: function (n, why) { if (!n) return; R.theirs.push({ n: n, why: inst.name + ': ' + why, fx: true }); R.rec(at, 'their stat', (n > 0 ? '+' : '') + n + ' to ' + (d.foil ? first(d.foil) : 'their player') + ', ' + why); },
      stackEdges: function (text) { R.stack = R.rec(at, 'stat', text || 'edges from earlier decisions add up here instead of only the biggest counting'); },
      /* the duel itself */
      dice: function (k, text) { if (!(k > 1)) return; R.dice = Math.max(R.dice, Math.min(3, k)); R.rec(at, 'dice', text || first(d.actor) + ' rolls ' + R.dice + ' dice and keeps the higher'); },
      threshold: function (n, text) {
        if (!(n >= 1)) return;
        /* m3 from fix1: a threshold another one replaced no longer shows (idle) */
        if (R.goodBy && R.goodBy !== n) R.records.forEach(function (r) { if (r.field === 'threshold') r.idle = true; });
        R.goodBy = n; R.rec(at, 'threshold', text || 'a clean win needs ' + n + ' or more instead of 4');
      },
      tier: function (from, to, text) {
        var B = ['bad', 'mixed', 'good'];
        if (B.indexOf(from) < 0 || B.indexOf(to) < 0 || from === to) fail('tier: from and to are good, mixed or bad');
        R.tier[from] = to; R.rec(at, 'tier', text || 'a ' + BAND_WORD[from] + ' counts as a ' + BAND_WORD[to], { band: from });
      },
      /* costs */
      costBy: function (n, text) { if (!n) return; R.costDelta += n; R.rec(at, 'cost', text || (n < 0 ? 'costs ' + (-n) + ' less stamina' : 'costs ' + n + ' more stamina')); },
      freeDecision: function (text) {
        if (fx.freeUsed >= LIMIT.FREE_MAX && GUARD.limits) return;
        R.free = R.rec(at, 'decision', text || 'does not use up one of this attack\'s decisions');
      },
      /* consequences, on the result lines */
      lines: function () { return R.lines ? R.lines.slice() : []; },
      /* w0b: on your attack as in w0; on a defending decision (their
       * attack) and for an opponent's component, see EFFECTS.md "Outcome
       * helpers on defence and for the opponent" */
      setMove: function (band, n, text) { R.lineOps.push({ op: 'move', band: band, n: n, side: oside, rec: R.rec(at, 'move', text || (d.side === 'them' ? moveWords(n) : 'the ball goes ' + n + ' zone' + (n === 1 ? '' : 's') + ' further'), { band: band }) }); },
      /* m3 from fix1 (item 1): the result becomes their free kick where it was */
      setTheirFreeKick: function (band, text) { R.lineOps.push({ op: 'theirFreeKick', band: band, side: oside, rec: R.rec(at, 'move', text || 'they get a free kick where it was', { band: band }) }); },
      setTo: function (band, p, text) { R.lineOps.push({ op: 'to', band: band, p: p, side: oside, rec: R.rec(at, 'to', text || first(p) + ' gets the ball', { band: band }) }); },
      grant: function (band, edge, text) { var c = fxEdge(inst.name, edge, text, oside === 'them', lasts(fx.st) && (d.side === 'you' || band === 'good'));   /* m2: lasts when it goes into an attack of yours */ R.lineOps.push({ op: 'edge', band: band, c: c, side: oside, rec: R.rec(at, 'edge', c.text, { band: band }) }); },
      branch: function (band, spec, text) { R.lineOps.push({ op: 'branch', band: band, spec: spec, side: oside, rec: R.rec(at, 'branch', text || (d.side === 'them' ? (oside === 'them' ? 'their attack goes on instead of ending' : 'your team keeps the ball and your attack starts') : 'the attack goes on instead of ending'), { band: band }) }); },
      extraDecision: function (band, text) { R.lineOps.push({ op: 'extra', band: band, side: oside, rec: R.rec(at, 'continuation', text || (d.side === 'them' ? 'the attack this starts gets one more decision' : 'this attack gets one more decision'), { band: band }) }); },
      /* m1 from w1b: productive failure. This result becomes a foul by the man he
       * faced: at the edge of their box a free kick there, in midfield the
       * ball is kept where it is; either way their man is booked. Idle on the
       * last decision of an attack, in their box, on a result that is already a
       * free kick, on defence, and for an opponent's component. */
      foul: function (band, text) { R.lineOps.push({ op: 'foul', band: band, side: oside, rec: R.rec(at, 'foul', text || 'this is a foul instead, and ' + first(d.foil) + ' is booked', { band: band }) }); },
      /* only for fxcheck --break silent: a change with no record */
      _unsafe: R
    };
    function need(t) { if (!TAG_OK[t]) fail('unknown tag ' + t + ' (tags: ' + ACTION_TAGS.join(', ') + ')'); }
    return q;
  };
  var BAND_WORD = { good: 'clean win', mixed: 'half win', bad: 'loss' };
  var ZONE_WORD = ['in your half', 'in midfield', 'at the edge of their box'];
  /* the default sentence for setMove on a defending decision */
  function moveWords(n) { return typeof n === 'number' && n >= 0 && n <= 2 ? 'if you win the ball, your attack starts ' + ZONE_WORD[n] : 'their attack moves ' + n + ' zone' + (Math.abs(n) === 1 ? '' : 's'); }

  /* the engine opens a record for one option being built */
  Runtime.prototype.option = function (data) {
    return new OptionRec(this, data);
  };
  /* w0b: THE ENGINE'S OWN PARTS ON THEIR NUMBER, after the 'stat' hook:
   * their tired line (Pace and Physical drop as yours do: valueFn is
   * options.js's value(), the same attribute model), and the edges an
   * opponent's component gave them for this decision. Each is a named part
   * with a record, like every other change. */
  var SYS_LEGS = { name: 'Their stamina', i: -1, k: 0, side: 'them', system: true };
  Runtime.prototype.oppParts = function (R, valueFn) {
    if (this.suspended) return;
    var d = R.d, fx = this;
    if (!(d.actor && d.foil && d.mineAttr && d.theirsAttr)) return;
    if (GUARD.oppLegs && typeof d.foil.line === 'number' && this.st.opp.players.indexOf(d.foil) >= 0) {
      var line = LINE_KEY[d.foil.line], L = this.legsOf('them', line);
      if (L < 100) {
        var loss = valueFn(d.foil, d.theirsAttr, L) - valueFn(d.foil, d.theirsAttr, 100);
        if (loss) {
          var why = 'their ' + LW[line] + ' is tired (' + Math.round(L) + ' of 100 stamina)';
          R.theirs.push({ n: loss, why: why, fx: true });
          R.rec(SYS_LEGS, 'their stat', loss + ' to ' + first(d.foil) + ', ' + why);
        }
      }
    }
    if (GUARD.oppEdge) this.oppEdges.forEach(function (c) {
      if (c.man && c.man !== d.foil) return;
      if (c.tags && c.tags.length && !c.tags.some(function (t) { return R.tags.indexOf(t) >= 0; })) return;
      R.theirs.push({ n: c.n, why: c.source + ': ' + c.why, fx: true });
      R.rec({ name: c.source, i: -1, k: 0, side: 'them' }, 'their stat', '+' + c.n + ' to ' + first(d.foil) + ', ' + c.why);
    });
  };
  /* w0b: at the end of a decision, their edges for it are used up */
  Runtime.prototype.oppEdgesEnd = function () {
    var now = this.scope.decision;
    this.oppEdges = this.oppEdges.filter(function (c) { return c.until > now; });
  };
  /* the duel rule this option's roll follows, or null for the plain one */
  OptionRec.prototype.duelRule = function () {
    var r = { dice: 1, goodBy: null, tier: null }, any = false;
    if (GUARD.dice && this.dice > 1) { r.dice = this.dice; any = true; }
    if (GUARD.threshold && this.goodBy) { r.goodBy = this.goodBy; any = true; }
    if (GUARD.tier && Object.keys(this.tier).length) { r.tier = this.tier; any = true; }
    return any ? r : null;
  };
  /* what the card lists: every record that touches this option */
  OptionRec.prototype.visible = function () {
    return this.records.filter(function (r) { return !r.idle; });
  };

  /* NEW OPTIONS. A component's `pool` entries join options.js POOL for the
   * menus of a match with that component in it. They are built by the same
   * code as every other option (odds, cost, results, the menu cut), so a
   * new option is never a special case downstream. */
  Runtime.prototype.poolEntries = function () {
    var out = [], fx = this;
    if (this.suspended) return out;
    this.inst.forEach(function (inst) {
      if (!fx.active(inst)) return;
      (inst.def.pool || []).forEach(function (p) {
        var owner = inst.owner;
        var q = { owner: owner.player || null, pair: owner.kind === 'relationship' ? [owner.a, owner.b] : null,
          captain: fx.st.squad.captain || null, squad: fx.st.squad, opp: fx.st.opp, first: first,
          lasts: lasts(fx.st) && (p.side || 'you') === 'you',   /* m2: an edge this option grants lasts your attack (x1 variant c) */
          hasState: function (name, target, value) { return fx.hasState(name, target, value); },
          roles: function (role) { return fx.withRole(role); } };
        out.push({ id: p.id, family: p.family || 'move', side: p.side || 'you', zones: p.zones, tzones: p.tzones, box: p.box,
          modes: p.modes, inModes: p.inModes, air: p.air, ground: p.ground,
          fxSource: inst.name, fxText: p.text || 'this option exists because of ' + inst.name, fxTags: p.tags || [],
          when: function (x) { return p.when ? !!p.when(x, q) : true; },
          build: function (x) { return p.build(x, q); } });
      });
    });
    return out;
  };

  /* THE OPPONENT (hook 'counter'): what they have learned against this
   * option (match.js counterFor's parts). A component may cancel parts or
   * add one; each change is a record on the card. */
  Runtime.prototype.counterHook = function (o, out) {
    if (this.suspended || !GUARD.counter) return out;
    var fx = this, recs = [];
    this.inst.forEach(function (inst) {
      (inst.def.effects || []).forEach(function (eff, k) {
        if (eff.hook !== 'counter' || !fx.usable(inst, k, eff) || !fx.active(inst)) return;
        var owner = inst.owner, tags = o.tags || tagsFor(o.id, null, o.pays, null);
        function rec(field, text) { var r = { source: inst.name, field: field, text: stop(text), key: inst.i + ':' + k }; r.line = r.source + ': ' + r.text; recs.push(r); }
        var q = { id: o.id, actor: o.actor, foil: o.foil, to: o.to, tags: tags, owner: owner.player || null, ownerSide: inst.side || 'you',
          has: function (t) { return tags.indexOf(t) >= 0; },
          byOwner: function () { return !!owner.player && o.actor === owner.player; },
          againstOwner: function () { return !!owner.player && o.foil === owner.player; },
          hasState: function (name, target, value) { return fx.hasState(name, target, value); },
          parts: function () { return out.theirs.concat(out.mine).map(function (m) { return { n: m.n, why: m.why }; }); },
          cancel: function (match, text) {
            var hit = function (m) { return !match || String(m.why).indexOf(match) >= 0; };
            var gone = out.theirs.filter(hit).concat(out.mine.filter(hit));
            if (!gone.length) return 0;
            out.theirs = out.theirs.filter(function (m) { return !hit(m); });
            out.mine = out.mine.filter(function (m) { return !hit(m); });
            out.notes = out.notes.filter(function (t) { return !gone.some(function (m) { return t.indexOf(m.why) === 0 || t.indexOf(m.why) >= 0; }); });
            rec('counter', text || 'what they learned does not count here: ' + gone.map(function (m) { return m.why; }).join('; '));
            return gone.length;
          },
          theirStat: function (n, why) { if (!n) return; out.theirs.push({ n: n, why: inst.name + ': ' + why }); rec('counter', (n > 0 ? '+' : '') + n + ' to them, ' + why); } };
        if (eff.when && !eff.when(q)) return;
        eff.apply(q);
      });
    });
    out.fx = (out.fx || []).concat(recs);
    return out;
  };
  /* hook 'learn': return true when a component stops the opponent learning
   * from this decision (it fires, so it is logged now) */
  Runtime.prototype.learnHook = function (o) {
    if (this.suspended || !GUARD.learn) return false;
    var fx = this, stopBy = null;
    this.inst.forEach(function (inst) {
      (inst.def.effects || []).forEach(function (eff, k) {
        if (stopBy || eff.hook !== 'learn' || !fx.usable(inst, k, eff) || !fx.active(inst)) return;
        var owner = inst.owner, tags = o.tags || [];
        var said = null;
        var q = { id: o.id, actor: o.actor, foil: o.foil, tags: tags, owner: owner.player || null,
          has: function (t) { return tags.indexOf(t) >= 0; },
          byOwner: function () { return !!owner.player && o.actor === owner.player; },
          forget: function (text) { said = text || 'they learn nothing from this'; } };
        if (eff.when && !eff.when(q)) return;
        eff.apply(q);
        if (said) { stopBy = inst.name; fx.spend1(inst, k, eff); fx.write(inst.name, said, 'option', 'learn'); }
      });
    });
    return !!stopBy;
  };
  /* one more decision for this attack, from a result line (continuation) */
  Runtime.prototype.grantExtra = function (src, text, rec) {
    if (this.capBonus >= LIMIT.EXTRA_MAX) {
      this.write(src, 'no extra decision: this attack already has ' + LIMIT.EXTRA_MAX + ' from effects', 'limit');
      return false;
    }
    this.capBonus++;
    /* m3: the record that gave it counts against its effect's limit when
     * fired() runs for this decision (w1f found a continuation-only record
     * never used up a once-an-attack limit) */
    if (GUARD.extraLimit && rec && rec.key) this.extraKey = rec.key;
    this.write(src, text || 'this attack gets one more decision', 'option', 'continuation');
    this.emit('extra_decision', { side: 'you' });
    return true;
  };
  /* at the pick: every record on the chosen option that happened is written
   * to the log, and counts against its effect's limit. A record tied to a
   * result (band) fires only if that result happened; the tier record only
   * if the roll landed on the tier it changes. */
  Runtime.prototype.fired = function (o, rolled, bands) {
    var fx = this, R = o.fxRec;
    if (!R) return;
    var seen = {}, xkey = fx.extraKey;
    fx.extraKey = null;
    fx.firedSeen = seen;
    R.visible().forEach(function (r) {
      if (r.field === 'continuation') {                /* grantExtra wrote it */
        /* m3: but the extra decision it gave uses up its effect's limit */
        if (xkey && r.key === xkey && !seen[r.key]) { seen[r.key] = 1; fx.spendKey(r.key); }
        return;
      }
      if (r.field === 'decision' && !o.fxFreeUsed) return;
      if (r.field === 'tier' && rolled !== r.band) return;
      if (r.band && r.field !== 'tier' && bands.indexOf(r.band) < 0) return;
      fx.write(r.source, r.text, 'option', r.field);
      /* w0b: q.tire happens when it is chosen */
      if (r.field === 'tire') (R.tires || []).forEach(function (t) {
        if (t.rec !== r || !GUARD.tire) return;
        if (t.side === 'them') { fx.st.oppSpent[t.line] += t.n; fx.emit('their_stamina_spent', { line: t.line, amount: t.n, side: 'them' }); }
        else { fx.st.spent[t.line] += t.n; fx.emit('stamina_spent', { line: t.line, amount: t.n, side: 'you' }); }
      });
      if (r.key && !seen[r.key]) {
        seen[r.key] = 1;
        var ik = r.key.split(':'), inst = fx.inst[+ik[0]], eff = inst && inst.def.effects && inst.def.effects[+ik[1]];
        if (eff) fx.spend1(inst, +ik[1], eff);
      }
    });
  };

  /* THE ODDS WITH A DUEL RULE. Your stat + your die against their stat +
   * their die; `dice` > 1 means you roll that many and keep the highest;
   * goodBy is the clean-win margin; tier maps a result to another. Exact:
   * every combination of dice is counted. With no rule this is resolve.js's
   * odds to the last digit (fxcheck proves it for margins -12 to 12). */
  function odds(margin, rule, R) {
    rule = rule || {};
    var m = Math.round(margin), gb = rule.goodBy || R.GOOD_BY, k = rule.dice || 1;
    var mine = [0, 0, 0, 0, 0, 0, 0], tot = Math.pow(6, k);
    for (var d = 1; d <= 6; d++) mine[d] = (Math.pow(d, k) - Math.pow(d - 1, k)) / tot;
    var p = { good: 0, mixed: 0, bad: 0 };
    for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) {
      var diff = m + a - b, band = diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad';
      if (rule.tier && rule.tier[band]) band = rule.tier[band];
      p[band] += mine[a] / 6;
    }
    var out = { good: p.good, mixed: p.mixed, bad: p.bad, margin: m,
      certain: p.good >= 1 - 1e-12, impossible: p.bad >= 1 - 1e-12 };
    return out;
  }
  /* the roll, as choose does it: the same rule, the match's own dice */
  function band(diff, rule, R) {
    var gb = (rule && rule.goodBy) || R.GOOD_BY;
    return diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad';
  }

  var API = {
    ACTION_TAGS: ACTION_TAGS, TAGS_OF: TAGS_OF, STATES: STATES, DURATIONS: DURATIONS, OWNERS: OWNERS,
    EVENTS: EVENTS, HOOKS: HOOKS, GROUPS: GROUPS, KINDS: KINDS, ROLES: ROLES, LIMIT: LIMIT, GUARD: GUARD,
    BAND_WORD: BAND_WORD, DERIVED: DERIVED, SYSTEM_SOURCES: SYSTEM_SOURCES, subsOf: subsOf,
    tagsFor: tagsFor, define: define, get: get, REG: REG, lasts: lasts, lastingText: lastingText /* m2 */,
    payoffOn: payoffOn, setPayoff: setPayoff /* m3 */,
    validateBuild: validateBuild, applyBuild: applyBuild, attach: attach, findPlayer: findPlayer,
    odds: odds, band: band, first: first, Runtime: Runtime,
    undoSubs: undoSubs   /* m2 from w1d */
  };
  root.KMEffects = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
