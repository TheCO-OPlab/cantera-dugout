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
    Z_SHOOT_EDGE: ['shot', 'long shot', 'hard shot'],   /* kmtree5 a3 (helper C): the edge-of-the-box shot, split from Z_SHOOT_FAR */
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
    /* kmtree5 a13 (RULES3): a card that keeps a lost ball (a retain, Second chance) happened: source is the piece that kept it. Announced only with rules on. */
    ball_won_back: 'a lost ball was kept: the result line that wins it straight back happened (source: the piece that kept it)',
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
  /* kmtree5: archcheck.js --prove breaks the engine side one thing at a time (KM5_BREAK) */
  var KM5_BREAK = (typeof process !== 'undefined' && process.env && process.env.KM5_BREAK) || '';
  var PAYOFF = { on: !!((typeof process !== 'undefined' && process.env && process.env.KM_PAYOFF === '1') ||
    (root.location && /[?&]payoff=1(&|$)/.test(root.location.search || ''))) };
  function payoffOn() { return PAYOFF.on; }
  function setPayoff(v) { PAYOFF.on = !!v; }
  /* w0b: log sources that are the engine, not a component */
  var SYSTEM_SOURCES = ['The effects engine', 'Substitution', 'Their stamina'];

  /* =================================================== THE REGISTRY */
  var REG = {};
  /* kmtree5: EXTENSIONS. A file of content (archetypes.js, opponents.js) may register a function that
   * runs once when a build is attached to a match: attach(fx, st, build, oppBuild). It is how the pieces
   * of 2026-09-29 set up what they need at kickoff (the roster order, the Understudy copies, the
   * Benchwarmer rolls, the run's streaks). It runs only when a build is loaded, so a match without one is
   * untouched. */
  var EXTENSIONS = [];
  function fail(msg) { throw new Error('effects: ' + msg); }
  /* define(component). The shape later waves fill (EFFECTS.md has it in full):
   *   { id, name, kind, text,
   *     effects: [ { hook, when(q), apply(q), limit } | { on, when(e), run(e), limit, fromEffects } ],
   *     pool: [ { id, side, zones, family, tags, when(x, q), build(x, q) } ] } */
  function define(def) {
    if (!def || !def.id) fail('a component needs an id');
    if (!def.name) fail(def.id + ' needs a name');
    if (KINDS.indexOf(def.kind) < 0) fail(def.id + ': kind must be one of ' + KINDS.join(', '));
    if (def.rules) rulesCompile(def);   /* kmtree5 a13 (stream RULES1): a piece written as rules (section RULES below) */
    /* a15 (stream A15): a piece written `rules: RULES_ON ? [...] : undefined` keeps no `rules` key when the rules are off, so its definition is
     * a12's to the last key (t_cmp.js --ref a12: the wider fingerprint read the key as null in 98 of 520 matches; nothing reads the key's presence) */
    if ('rules' in def && def.rules === undefined) delete def.rules;
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
    /* kmtree5: the run's fields (EFFECTS.md "kmtree5") */
    if (b.order !== undefined) {
      if (!Array.isArray(b.order)) bad.push('order must be a list of the starters\' names, top first');
      /* (review 2026-09-29) a name not in the eleven is ignored and logged at kickoff (attach), not refused */
      else if (KM5_BREAK === 'ordercrash') b.order.forEach(function (n) { if (squad && !findPlayer(squad, n)) bad.push('the roster order names ' + n + ', who is not in the eleven'); });
    }
    if (b.beliefStat !== undefined && b.beliefStat !== null && ['pace', 'physical', 'technique', 'passing', 'finishing', 'defending', 'intelligence'].indexOf(b.beliefStat) < 0) bad.push('beliefStat must be one of the seven stats');
    (b.effects || []).forEach(function (id) {
      var d = get(id);
      if (!d) bad.push('no opponent effect called ' + id);
      else if (!d.opEffect) bad.push(id + ' is not an opponent effect');
    });
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
    if (def.opEffect) return def.name + ' (their team)';   /* kmtree5: an opponent effect (opponents.js) */
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
    /* kmtree5: the opponent's EFFECTS (opponents.js), picked by the cup per round: one instance each,
     * the team's, after their build's own pieces */
    if (oppBuild && oppBuild.effects) oppBuild.effects.forEach(function (id) {
      var def = get(id), owner = { kind: 'team', side: 'them' };
      fx.inst.push({ def: def, owner: owner, name: ownerName(def, owner), i: fx.inst.length, side: 'them' });
    });
    st.fx = fx;
    if (build && Array.isArray(build.order)) build.order.forEach(function (n) {
      var p = findPlayer(st.squad, n);
      if (!p || (st.squad.players.indexOf(p) < 0 && p !== st.squad.keeper)) fx.write('Your build', 'the team sheet order names ' + n + ', who is not in the eleven, so that name is left out', 'event', 'order');
    });
    EXTENSIONS.forEach(function (f) { f(fx, st, build || null, oppBuild || null); });
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
  /* kmtree5: a copied trait (Understudy) shares its limits with the original (shareI) */
  function effKey(inst, k) { return (inst.shareI !== undefined ? inst.shareI : inst.i) + ':' + k; }
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
    /* kmtree5: gates a piece of 2026-09-29 adds (a trait switched off by an opponent effect, a copied
     * trait that needs its original on the pitch, a trait that works from the bench). None without them. */
    if (this.gates) {
      for (var gi = 0; gi < this.gates.length; gi++) {
        var gv = this.gates[gi](inst, evName, e0);
        if (gv === false) return false;
        if (gv === true) return true;
      }
    }
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
        if (!eff.quiet) self.countFire(inst);   /* kmtree5: X.runReport's pieces (bookkeeping effects are quiet) */
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
  /* kmtree5: how many times each piece fired this match (an event effect ran, or a record of it on the
   * chosen card happened), by component id, yours and theirs apart */
  Runtime.prototype.countFire = function (inst) {
    if (!inst || !inst.def || inst.def.hidden || KM5_BREAK === 'nocount') return;
    var bag = (inst.side || 'you') === 'them' ? (this.firesThem = this.firesThem || {}) : (this.firesYou = this.firesYou || {});
    bag[inst.def.id] = (bag[inst.def.id] || 0) + 1;
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
    e.inst = inst;   /* kmtree5: the instance (archetypes.js reads its owner and copies) */
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
    this.greyBy = null;   /* kmtree5: q.grey */
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
      /* kmtree5: the match (read only), this instance, and your man's number as the card will show it
       * before any part (options.js passes it), for pieces that halve a stat */
      st: fx.st, inst: inst, mineVal: d.mineVal === undefined ? null : d.mineVal, theirVal: d.theirVal === undefined ? null : d.theirVal,
      via: d.via || null, card: R.memo || (R.memo = {}),   /* card: a small memory per card, shared by every piece building it */
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
      /* kmtree5: opts { fn, encore, label }: fn runs when the card is chosen (the part happened); label
       * replaces "Name (owner)" as the part's name on the card (the counters: "Belief", "Build-up") */
      stat: function (n, why, opts) { if (!n) return; opts = opts || {}; R.mine.push({ n: n, why: (opts.label || inst.name) + ': ' + why, fx: true }); R.rec(at, 'stat', (n > 0 ? '+' : '') + n + ' to ' + (d.actor ? first(d.actor) : 'your player') + ', ' + why, opts.fn || opts.encore ? { fn: opts.fn || null, encore: !!opts.encore } : null); },
      theirStat: function (n, why, opts) { if (!n) return; opts = opts || {}; R.theirs.push({ n: n, why: (opts.label || inst.name) + ': ' + why, fx: true }); R.rec(at, 'their stat', (n > 0 ? '+' : '') + n + ' to ' + (d.foil ? first(d.foil) : 'their player') + ', ' + why, opts.fn || opts.encore ? { fn: opts.fn || null, encore: !!opts.encore } : null); },
      /* kmtree5: a record that does something when the card is chosen and `band` happens (any band if
       * null): the card says it before the pick, fn runs after it */
      onFire: function (band, text, fn, once) { R.rec(at, 'promise', text, once ? { band: band || null, fn: fn, once: once } : { band: band || null, fn: fn }); },   /* a15: `once` (a name): of the records with that name and source, only the first that happens is written and done (one result can be two result lines, a good and a half win merged) */
      /* kmtree5 (Second chance): on your attack, a lost ball on this result is kept where it is */
      retain: function (band, text, fn) { R.lineOps.push({ op: 'retain', band: band, side: oside, rec: R.rec(at, 'retain', text || 'if it is lost, your team keeps the ball', { band: band, fn: fn || null }) }); },
      /* kmtree5 (Diver): on their attack in your box, this result becomes a penalty to them */
      penalty: function (band, text) { R.lineOps.push({ op: 'penalty', band: band, side: oside, rec: R.rec(at, 'penalty', text || 'this is a penalty to them instead', { band: band }) }); },
      /* kmtree5 (No quick shots): the card is shown greyed out, with the reason, and cannot be chosen */
      grey: function (text) { R.greyBy = R.rec(at, 'availability', text || 'this card cannot be chosen now'); },
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
          roles: function (role) { return fx.withRole(role); },
          st: fx.st, inst: inst };   /* kmtree5 */
        out.push({ id: p.id, family: p.family || 'move', side: p.side || 'you', zones: p.zones, tzones: p.tzones, box: p.box,
          /* kmtree5: a created card of yours is never cut (must); an opponent's clog takes one of the three places */
          fxMust: (inst.side || 'you') === 'you' || !!p.clog, fxClog: !!p.clog, fxSide: inst.side || 'you',
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
    fx.lastFired = [];   /* kmtree5: the records of the chosen card that happened */
    R.visible().forEach(function (r) {
      if (r.field === 'continuation') {                /* grantExtra wrote it */
        /* m3: but the extra decision it gave uses up its effect's limit */
        if (xkey && r.key === xkey && !seen[r.key]) { seen[r.key] = 1; fx.spendKey(r.key); }
        return;
      }
      if (r.field === 'decision' && !o.fxFreeUsed) return;
      if (r.field === 'tier' && rolled !== r.band) return;
      if (r.band && r.field !== 'tier' && bands.indexOf(r.band) < 0) return;
      /* kmtree5: a retained ball happened only if the line was the lost one */
      if (r.field === 'retain' && !o.fxRetainedNow) return;
      if (r.once) { var onceK = r.source + '|' + r.once; if (seen['once:' + onceK]) return; seen['once:' + onceK] = 1; }   /* a15 (widefix): once a result */
      fx.write(r.source, r.text, 'option', r.field);
      fx.lastFired.push(r);
      /* kmtree5: a card a piece made was chosen: that piece fired */
      if (r.field === 'create') { var ci = fx.inst.filter(function (x) { return x.name === r.source; })[0]; if (ci) fx.countFire(ci); }
      if (r.encore && fx.onEncore) fx.onEncore(r);
      if (typeof r.fn === 'function') r.fn(r);
      /* kmtree5 a13 (RULES3): the ball was won back is an event, so what follows from it is a rule of its own */
      if (r.field === 'retain' && RULES.on && RULES_BREAK !== 'wonback') fx.emit('ball_won_back', { source: r.source, band: r.band || null, side: 'you' });
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
        if (inst) fx.countFire(inst);
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
    /* kmtree5: on the die the match rolls (resolve.js DICE: 6, or 20 with the d20 switch) */
    var m = Math.round(margin), gb = rule.goodBy || R.GOOD_BY, k = rule.dice || 1, F = KM5_BREAK === 'd20odds' ? 6 : R.DICE || 6;
    var mine = [0], tot = Math.pow(F, k);
    for (var d = 1; d <= F; d++) mine[d] = (Math.pow(d, k) - Math.pow(d - 1, k)) / tot;
    var p = { good: 0, mixed: 0, bad: 0 };
    for (var a = 1; a <= F; a++) for (var b = 1; b <= F; b++) {
      var diff = m + a - b, band = diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad';
      if (rule.tier && rule.tier[band]) band = rule.tier[band];
      p[band] += mine[a] / F;
    }
    var out = { good: p.good, mixed: p.mixed, bad: p.bad, margin: m,
      certain: p.good >= 1 - 1e-12, impossible: p.bad >= 1 - 1e-12 };
    return out;
  }
  /* kmtree5: A DUEL OF SEVERAL CHECKS (Slalom): one check per defender, in a row. All clean: good; any
   * lost: bad; otherwise (all at least half won): mixed. Exact, from each check's own odds (the checks are
   * independent rolls), so the card and match.js's roll follow the same rule. margins: one per check. */
  function multiOdds(margins, rule, R) {
    var allGood = 1, noBad = 1;
    (KM5_BREAK === 'multiodds' ? margins.slice(0, 1) : margins).forEach(function (mg) { var o = odds(mg, rule, R); allGood *= o.good; noBad *= (1 - o.bad); });
    var good = allGood, bad = 1 - noBad, mixed = Math.max(0, noBad - allGood);
    return { good: good, mixed: mixed, bad: bad, margin: Math.round(margins[0] || 0), multi: margins.length,
      certain: good >= 1 - 1e-12, impossible: bad >= 1 - 1e-12 };
  }
  /* kmtree5 a16 (stream A16, M-1 'floor'; his ruling of 10-06: "Never certain: at least 5 in 100 either way", and of the best roll:
   * "if you get a 6 and they get a 1, you win the duel even if your stats are off. It feels kind of like a critical roll"). THE CRITICAL
   * ROLLS, read off the two dice the page shows (your kept die a, theirs b), whatever the margin:
   *   your top face against their lowest K faces: it works (a clean win)
   *   your 1 against their highest K faces: it goes wrong (a loss)
   * K is the fewest faces that give at least 5 in 100: on the six-sided die K = 2 (a 6 against a 1 or 2; a 1 against a 5 or 6: 2 in 36
   * each, 5.6 in 100); on the d20 switch K = 20 (a 20 always works, a 1 always goes wrong: 5 in 100). Before a build's tier, as the best
   * roll was. With several dice kept highest (a build), "your 1" is the die kept, so the build's extra dice make the loss rarer: earned. */
  var A16_FLOOR = 0.05;
  function a16K(F) { return Math.min(F, Math.ceil(A16_FLOOR * F * F - 1e-9)); }
  function a16Crit(a, b, F) {
    var K = a16K(F);
    if (a === F && b <= K) return 'good';
    if (a === 1 && b >= F - K + 1) return 'bad';
    return null;
  }
  /* the card's three chances under the critical rolls (exact, the same rule match.js rolls; effects.js odds() with the crit before the tier) */
  function a16Odds(margin, rule, R) {
    rule = rule || {};
    var m = Math.round(margin), gb = rule.goodBy || R.GOOD_BY, k = rule.dice || 1, F = R.DICE || 6;
    var mine = [0], tot = Math.pow(F, k), p = { good: 0, mixed: 0, bad: 0 };
    for (var d = 1; d <= F; d++) mine[d] = (Math.pow(d, k) - Math.pow(d - 1, k)) / tot;
    for (var a = 1; a <= F; a++) for (var b = 1; b <= F; b++) {
      var diff = m + a - b, band0 = diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad', cr = A16.brk === 'critodds' ? null : a16Crit(a, b, F);
      var bd = cr || band0;
      if (rule.tier && rule.tier[bd]) bd = rule.tier[bd];
      p[bd] += mine[a] / F;
    }
    return { good: p.good, mixed: p.mixed, bad: p.bad, margin: m, certain: p.good >= 1 - 1e-12, impossible: p.bad >= 1 - 1e-12, a16Floor: true };
  }
  /* Slalom under the critical rolls: each take-on is its own roll with them */
  function a16MultiOdds(margins, rule, R) {
    var allGood = 1, noBad = 1;
    margins.forEach(function (mg) { var o = a16Odds(mg, rule, R); allGood *= o.good; noBad *= (1 - o.bad); });
    var good = allGood, bad = 1 - noBad, mixed = Math.max(0, noBad - allGood);
    return { good: good, mixed: mixed, bad: bad, margin: Math.round(margins[0] || 0), multi: margins.length, certain: good >= 1 - 1e-12, impossible: bad >= 1 - 1e-12, a16Floor: true };
  }
  /* the roll, as choose does it: the same rule, the match's own dice */
  function band(diff, rule, R) {
    var gb = (rule && rule.goodBy) || R.GOOD_BY;
    return diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad';
  }

  /* kmtree5 a11 (helper G11; BRIEF-a11.md package G, DECISIONS-G11.md): THE SWITCHES OF THE TWO GAMEPLAY RULINGS OF
   * 2026-10-02. Both are ON by default; with both off the match replays a10 exactly (t_cmp.js --ref a4 --strict-only).
   *   skin  "Gets under your skin", his design: one random offered card is rattled at the first decision of a moment
   *         (opponents.js the words, options.js the card, match.js the result)
   *   drop  "Drops back must matter": a won M_DROP changes the next duel (options.js, match.js)
   * Node: KM_G11=skin,drop (the default), KM_G11=none, KM_G11=skin (only that one), KM_G11_OFF=skin or drop or both.
   * Page: ?g11=none, ?g11=skin, ?g11off=skin, ?g11off=drop, ?g11off=skin,drop. Read once, here, so the three files
   * that ask (FX.g11('skin')) can never disagree. */
  var G11 = (function () {
    var on = { skin: true, drop: true };
    function only(v) { if (typeof v !== 'string' || v === '') return; on.skin = on.drop = false; v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_G11); off(process.env.KM_G11_OFF); } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]g11=([\w,]+)/.exec(qs), m2 = /[?&]g11off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    return on;
  })();
  function g11(k) { return !!G11[k]; }

  /* kmtree5 a11 (stream TRT, MONDAY-10-05 A6, HANDOVER-TRT.md): THE TRAIT FIXES. Each card that did not do what its
   * words say gets its action fixed (his standing rule), one item each, all ON by default; off, each replays a11 as it
   * was before the fix (trt_same.js). Its own switch, so a list of KM_G11 never turns these off by accident.
   *   unbeaten   Unbeaten run counts every match of the run, not only those it was held (cup.js)
   *   shadow     Captain's shadow counts between matches only when he is in the eleven (cup.js)
   *   shadow2    Captain's shadow: the captain's piece works twice, however many shadows (archetypes.js, cup.js);
   *              off: each shadow adds one more time (3 times with two), a11's rule
   *   slalom     Slalom's pool sentence says two duels (words only)
   *   sold       Sold for a fee releases any player but the captain and the keeper; a man of the eleven is replaced
   *              by a bench man of his line (cup.js)
   *   join       Join the attack: the keeper is -2 too while the defender is forward (archetypes.js)
   *   encore     Encore doubles Slalom's +2 (archetypes.js)
   *   sense      6th sense's sentence says "unless that decision ends in a goal" (words only)
   *   skin1      Gets under your skin rattles a card on a menu with one live card too (options.js)
   *   noquick    No quick shots: a free kick at the last decision of an attack offers the short free kick, which
   *              keeps the ball, instead of a greyed shot made playable (options.js)
   *   understudy Understudy below the keeper copies his Physical (a keeper's is called physique); the Understudy
   *              sentence no longer says "or rattled" while Gets under your skin rattles cards, not men (archetypes.js)
   *   circ       Circulator's sideways pass names its receiver (mate, receiver) in the card's data (archetypes.js)
   * Node: KM_T11=none, KM_T11=a,b (only those), KM_T11_OFF=a,b. Page: ?t11=none, ?t11=a,b, ?t11off=a,b. */
  var T11_ITEMS = ['unbeaten', 'shadow', 'shadow2', 'slalom', 'sold', 'join', 'encore', 'sense', 'skin1', 'noquick', 'understudy', 'circ'];
  var T11 = (function () {
    var on = {}; T11_ITEMS.forEach(function (k) { on[k] = true; });
    function only(v) { if (typeof v !== 'string' || v === '') return; T11_ITEMS.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_T11); off(process.env.KM_T11_OFF); } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]t11=([\w,]+)/.exec(qs), m2 = /[?&]t11off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    return on;
  })();
  function t11(k) { return !!T11[k]; }
  /* kmtree5 a12 (stream GAME3b, HANDOVER-G3B.md): Eduardo's Cup rulings of 10-05 (MONDAY J6, J8, J11), parts ON by
   * default, all of them about the 7-match Cup (with KM_CUPFMT=4 / ?cupfmt=4 every part is off: a11's cup stays a11's):
   *   nolast     no pick after the match that ends the run (out of the group, a lost knockout, a lost endless match);
   *              after winning the final there is still a pick, once "Keep going" starts endless (cup.js)
   *   soldcap    Sold for a fee is a captain trait, not a tactic: it takes the captain's slot, its +1s go to the
   *              captain who holds it, and Captain's shadow makes them +2 (archetypes.js, cup.js)
   *   plain5     plain upgrades are +5, never taking a number past 20 (cup.js)
   *   signtrait  every signing comes with a trait (cup.js)
   *   signavg    every signing's numbers average at least your average player's (cup.js)
   * Node: KM_G3B=none, KM_G3B=a,b (only those), KM_G3B_OFF=a,b. Page: ?g3b=none, ?g3b=a,b, ?g3boff=a,b. cup.js reads
   * the same switch by the same rules (CUP.G3B). */
  var G3B_ITEMS = ['nolast', 'soldcap', 'plain5', 'signtrait', 'signavg'];
  var G3B = (function () {
    var on = {}; G3B_ITEMS.forEach(function (k) { on[k] = true; });
    function only(v) { if (typeof v !== 'string' || v === '') return; G3B_ITEMS.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    var fmt4 = false;
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_G3B); off(process.env.KM_G3B_OFF); if (process.env.KM_CUPFMT === '4') fmt4 = true; } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]g3b=([\w,]+)/.exec(qs), m2 = /[?&]g3boff=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
      if (/[?&]cupfmt=4(?!\w)/.test(qs)) fmt4 = true;
    } catch (e) { }
    if (fmt4) G3B_ITEMS.forEach(function (k) { on[k] = false; });
    return on;
  })();
  function g3b(k) { return !!G3B[k]; }
  /* kmtree5 a12 (stream EFFX, HANDOVER-EFFX.md): Eduardo's ruling K2-7 (ANSWERS-10-05.md), the four opponent effects
   * rebalanced to within about 10 points of match win of the round average (opponents.js), parts ON by default:
   *   quick    No quick shots: you can try to score from your 3rd decision of a moment (a12: the 4th, which an attack
   *            reaches only at its last decision, and never after winning the ball)
   *   checked  Checked out, then all in: -2 until half-time, +3 after it (a12: +4)
   *   cold     Cold start: until your first substitution your traits are off AND your players are -1 in every duel
   *   marker   Shadow marker: the man whose trait is switched off for the moment is also -2 in every duel that moment
   * and one part OFF by default (his "only for the final", proposed; cup.js reads the same switch):
   *   pool     the final's pool: No quick shots and Checked out at their a12 strength are met only in the final, as
   *            its boss (cup.js EFX_POOL; opponents.js gives them a12's numbers while it is on)
   * Node: KM_EFX=none, KM_EFX=a,b (only those), KM_EFX_OFF=a,b, KM_EFX_ON=pool. Page: ?efx=none, ?efx=a,b,
   * ?efxoff=a,b, ?efxon=pool. Everything off (KM_EFX=none) plays a12 before EFFX exactly (efx_check.js E1). */
  var EFX_ITEMS = ['quick', 'checked', 'cold', 'marker', 'pool'], EFX_DEFAULT_OFF = ['pool'];
  var EFX = (function () {
    var on = {}; EFX_ITEMS.forEach(function (k) { on[k] = EFX_DEFAULT_OFF.indexOf(k) < 0; });
    function only(v) { if (typeof v !== 'string' || v === '') return; EFX_ITEMS.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    function add(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_EFX); add(process.env.KM_EFX_ON); off(process.env.KM_EFX_OFF); } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]efx=([\w,]+)/.exec(qs), m3 = /[?&]efxon=([\w,]+)/.exec(qs), m2 = /[?&]efxoff=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m3) add(m3[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    return on;
  })();
  function efx(k) { return !!EFX[k]; }

  /* ======================================================== RULES
   * kmtree5 a13 (stream RULES1, a13/RULES-DESIGN.md; Eduardo's ruling RULES of 10-05): PIECES AS RULES. A piece may
   * be written as data, `rules: [ { when, if, do, to, from } ]`, instead of code. The parts each rule names (triggers,
   * conditions, channels, targets) are written once, here; define() compiles a piece's rules into the same hooks every
   * other piece uses, so the engine runs it exactly like a hand-written one (same order, same named parts on the card,
   * same log lines). Package 1 moves the Understudy family (Understudy, Captain's shadow, Encore, Benchwarmer, All for
   * One) and Slalom's +2 (so Encore doubles it with no code of its own).
   * Switch: node KM_RULES=off, page ?rules=off: archetypes.js defines a12's hand-written pieces instead (a12 exactly).
   *   KM_RULES_STACK=add|max2 (?rulesstack=): THE STACKING RULE for "fires again" (a decision for Eduardo; add is his
   *     TRT-1 ruling "three times"). KM_RULES_TABLE=own|map|skip (?rulestable=): the stat table's option (own default;
   *     KM_T11_UNDERSTUDY / ?t11und= are read too, as in a12).
   *   RULES_BREAK=table|stack|order|repeat|printed|copy|roll (rules_check.js --prove): breaks one part. */
  /* ======================================================== a15 (stream A15, 2026-10-06): THE a15 PARTS, one switch, ON by default
   *   general   D-3 of the morning report 10-06: where the general rules differ from three earlier one-off answers (Encore on Decoy, Arrives
   *             late and No striker; an Understudy below an Understudy; Speculative shot's Belief), the general rule wins: KM_RULES_PROPOSE
   *             defaults to redirect,takes,chain (a13 built them, off). KM_RULES_PROPOSE=none / ?rulespropose=none still goes back alone.
   *   channels  D-4: a piece that acts only when their defence is stretched (Runs the channels) leaves the Cup's offers while no piece in the
   *             Cup's pool can stretch it (cup.js cutPieces)
   *   widefix   the wide-pass bug RULES4 found (a13/DIFF-RULES4.md Part B): a pass to the man out wide gave +6 where the card says +3 (the
   *             release was added once for each result line of the band); the release now happens once a result (archetypes.js)
   * Node: KM_A15=none (all off), KM_A15=a,b (only those), KM_A15_OFF=a,b; A15_BREAK=<part> (checks only: that part off). Page: ?a15=none,
   * ?a15=a,b, ?a15off=a,b. With KM_A15=none and KM_RULES=off a15 plays a12 (rules_same.js --mode off, t_cmp.js --ref a12). */
  var A15_ITEMS = ['general', 'channels', 'widefix'];
  var A15 = (function () {
    var on = {}, brk = ''; A15_ITEMS.forEach(function (k) { on[k] = true; });
    function only(v) { if (typeof v !== 'string' || v === '') return; A15_ITEMS.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_A15); off(process.env.KM_A15_OFF); brk = process.env.A15_BREAK || ''; } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]a15=([\w,]+)/.exec(qs), m2 = /[?&]a15off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    if (brk && brk in on) on[brk] = false;
    return on;
  })();
  function a15(k) { return !!A15[k]; }
  /* ======================================================== a16 (stream A16, 2026-10-06): HIS RULINGS OF THE MORNING REPORT 10-06, one switch,
   * ON by default (ANSWERS-10-05.md "Morning report 10-06"; DECISIONS-A16.md has every call made in building them)
   *   floor     M-1: no card is certain or hopeless, at least 5 in 100 either way, and the best roll stays (a critical roll): your 6 against their
   *             1 or 2 always works, your 1 against their 5 or 6 always goes wrong (2 in 36 each, 5.6 in 100), on every roll (options.js a16Odds,
   *             match.js a16Band). Replaces ENG8's bestroll (a 6 against a 1) while on.
   *   steps     M-2: a card that names several actions gets a check per step: the pass to the man who does it, the cross before a header, and
   *             the keeper after every result that would be a goal without facing him (options.js a16Plan, match.js a16Steps). The card shows
   *             the combined chance.
   *   way       M-3: the man nearest the line of a pass along the ground is the man in the duel, priced by how close he is (ODDS option E), read
   *             from where the picture has the men at the decision (manway.js; node only with the picture runner mw_lib.js)
   *   drophold  M-5: a clean win of "midfield drops back" holds their man in midfield (once in their attack)
   *   cont3     M-6: a won ball continues the moment up to 3 times in a moment (match.js R12_CONT_MAX 3; KM_R12_CONTMAX still wins)
   *   center    page: every modal is centred on a PC screen
   *   dicebar   page: the dice result shows the win / half / loss bar with where the roll landed, and one line under it
   * Node: KM_A16=none (all off), KM_A16=a,b (only those), KM_A16_OFF=a,b; A16_BREAK=<part> (checks only: that part off). Page: ?a16=none,
   * ?a16=a,b, ?a16off=a,b. With KM_A16=none a16 plays a15 (t_cmp.js --ref a15, a16_same.js). */
  var A16_ITEMS = ['floor', 'steps', 'way', 'drophold', 'cont3', 'center', 'dicebar'];
  var A16 = (function () {
    var on = {}, brk = ''; A16_ITEMS.forEach(function (k) { on[k] = true; });
    function only(v) { if (typeof v !== 'string' || v === '') return; A16_ITEMS.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_A16); off(process.env.KM_A16_OFF); brk = process.env.A16_BREAK || ''; } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]a16=([\w,]+)/.exec(qs), m2 = /[?&]a16off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    if (brk && brk in on) on[brk] = false;
    on.brk = brk;
    return on;
  })();
  function a16(k) { return !!A16[k] && k !== 'brk'; }

  var RULES = (function () {
    var c = { on: true, stack: 'add', table: 'own', held: 'general', propose: a15('general') ? ['redirect', 'takes', 'chain'] : [] };   /* a15 D-3 (part general) */
    try {
      if (typeof process !== 'undefined' && process.env) {
        if (/^(off|none|0)$/.test(process.env.KM_RULES || '')) c.on = false;
        if (/^(add|max2)$/.test(process.env.KM_RULES_STACK || '')) c.stack = process.env.KM_RULES_STACK;
        var tb = process.env.KM_RULES_TABLE || process.env.KM_T11_UNDERSTUDY || '';
        if (/^(own|map|skip)$/.test(tb)) c.table = tb;
        /* RULES4: KM_RULES_HELD=general|a12 (the held positions, written as rules: the general rules, or a12's per-piece choices);
         * KM_RULES_PROPOSE=redirect,takes,chain (the general-rule readings of three per-piece choices of packages 1 to 3, off by default) */
        if (/^(general|a12)$/.test(process.env.KM_RULES_HELD || '')) c.held = process.env.KM_RULES_HELD;
        if (process.env.KM_RULES_PROPOSE) c.propose = String(process.env.KM_RULES_PROPOSE).split(',').filter(function (x) { return /^(redirect|takes|chain)$/.test(x); });
      }
    } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]rules=(on|off)\b/.exec(qs), m2 = /[?&]rulesstack=(add|max2)\b/.exec(qs), m3 = /[?&](?:t11und|rulestable)=(own|map|skip)\b/.exec(qs);
      if (m1) c.on = m1[1] === 'on';
      if (m2) c.stack = m2[1];
      if (m3) c.table = m3[1];
      var m4 = /[?&]rulesheld=(general|a12)\b/.exec(qs), m5 = /[?&]rulespropose=([\w,]+)/.exec(qs);
      if (m4) c.held = m4[1];
      if (m5) c.propose = m5[1].split(',').filter(function (x) { return /^(redirect|takes|chain)$/.test(x); });
    } catch (e) { }
    return c;
  })();
  var RULES_BREAK = (typeof process !== 'undefined' && process.env && process.env.RULES_BREAK) || '';
  /* RULES_ONEWAY=1 (rules_same.js mode oneway only): read the stat table one way, as a12 did (the holder's own number
   * under the canonical name only), to show it is the one cause of the keeper-Understudy differences */
  var RULES_ONEWAY = !!(typeof process !== 'undefined' && process.env && process.env.RULES_ONEWAY === '1');
  var RULES_USE = { statWord: function (a) { return a; }, brk: '', brk2: '' };   /* archetypes.js gives its words and ARCH_BREAK */

  /* ---- THE STAT TABLE: [keeper stat, outfield stat, option]. A header ("in the air") is Physical. When no row fits,
   * there is no number to use, so he keeps his own. */
  var STAT_TABLE = [['intelligence', 'intelligence'], ['physique', 'physical'], ['distribution', 'passing', 'map'], ['reflexes', null], ['communication', null]];
  function tableRows() { return RULES_BREAK === 'table' ? [] : STAT_TABLE.filter(function (r) { return !r[2] || r[2] === RULES.table; }); }
  /* the stat a card checks, as one name for both kinds of player */
  function statCanon(a) {
    if (a === 'reach') return 'physical';
    var row = tableRows().filter(function (r) { return r[0] === a && r[1]; })[0];
    return row ? row[1] : a;
  }
  /* a man's number for that stat: his own name for it, or the table's other name; undefined when none fits */
  function statValue(p, c) {
    var a = p && p.attr;
    if (!a) return undefined;
    if (typeof a[c] === 'number') return a[c];
    var row = tableRows().filter(function (r) { return r[1] === c && r[0] !== c; })[0];
    return row && typeof a[row[0]] === 'number' ? a[row[0]] : undefined;
  }

  /* ---- the vocabulary (a typo in a piece's rules fails at define time) */
  var R_WHEN = ['kickoff', 'duel', 'change'];
  /* package 2 (RULES2): the match's events as WHEN parts (clean_win ... conceded), the result lines of a card
   * (outcome), and the gain of a counter (gain buildup, fired by the counter's own channel) */
  var EV_WHEN = ['clean_win', 'half_win', 'loss', 'decision_end', 'moment_start', 'possession_start', 'conceded', 'sub_in', 'ball_won_back', 'outcome', 'option', 'gain buildup'];
  /* package 3 (RULES3): two more hooks as WHEN (`learn`: what the opponent learns from a decision; `roll`: the dice and the
   * clean-win margin of a card), the cup's own events (a signing, a release: between matches, fired by cup.js), and the
   * DO parts that need a cup, a chooser of a man (R_PICK) or the states and edges of an attack */
  var R_HOOKS = { duel: 'stat', outcome: 'outcome', option: 'option', learn: 'learn', roll: 'duel' };
  var R_CUPWHEN = ['signing', 'release'];
  var R_CUP = {};     /* DO parts a cup event does: op -> function (W, inst, rule, times) -> { id, times, picks, n } */
  var R_PICK = {};    /* a chooser of a man for a rule's TO: name -> function (q) -> man or null (a content file registers it) */
  var R_DO = ['stat add', 'stat use', 'stat half', 'traits copy', 'again'];
  var R_DOX = {};       /* DO parts a content file registers: op -> { event(e, r), duel(q, r), outcome(q, r), adds: true when it adds to a number } */
  var R_COUNTERS = {};
  /* WHO GETS THE PASS (RULES2, the first new shared part): the ball goes to the holder, wherever the card would have sent
   * it. Written on the menu's option hook; the sentence template is "the ball goes to {man}, ..." with the reason in the rule. */
  R_DOX['ball to'] = { option: function (q, r) {
    /* RULES3: the TO may name a chooser (D_NO_STRIKER: the best finisher coming from midfield); {to} is the man the card meant it for.
     * Returning false stops the rest of the rule (no man to give it to, so nothing else in the rule happens). */
    var p = !r.to || r.to === 'self' || RULES_BREAK === 'pick' ? q.owner : R_PICK[r.to] ? R_PICK[r.to](q) : q.owner;
    if (!p) return false;
    q.setRecipient(p, rTpl(r.do.why, { man: first(p), to: first(q.to) }));
  } };
  /* RULES3: the plain shift of a number on a card (never repeated by Encore: a12's content pieces were not), a state and an edge
   * of an attack, a clean-win margin, and what the opponent learns */
  function shiftNow(q, r) { if (RULES_BREAK === 'shift') return; q.stat(r.do.n, rTpl(r.do.why, { man: first(q.owner), actor: first(q.actor) })); }
  R_DOX['stat shift'] = { duel: shiftNow, option: shiftNow };
  /* RULES4: their number in a duel: a number, "the moment number plus n", or a counter ({m} the moment, {sn} the number with its sign, {c} the
   * counter). `add` is the change that adds to a number, so a piece of yours that does it can be repeated (Encore) by the one rule; `shift` is
   * the plain number, never repeated. An opponent's effect is never repeated (a repeat comes from your side only). */
  function theirNumber(q, r) {
    var sp = r.do.n, c = null, n;
    if (sp && typeof sp === 'object') {
      if (sp.moment !== undefined) n = q.st.n + sp.moment;
      else { c = (R_COUNTERS[sp.counter] || function () { return 0; })(q.st, null) || 0; n = c * (sp.times || 1); }
    } else n = sp;
    return { n: n, why: rTpl(r.do.why, { m: q.st.n + 1, sn: (n > 0 ? '+' : '') + n, n: n, c: c, s: c === 1 ? '' : 's', foil: first(q.foil), man: first(q.owner) }) };
  }
  R_DOX['their stat add'] = { adds: true, duel: function (q, r) {
    var t = theirNumber(q, r);
    if (!t.n) return;
    var g = again(q.st.fx, q.inst, { op: 'add', when: 'duel' }, { card: q.card });
    if (g.limited) q.card.encoreGiven = true;
    q.theirStat(g.times * t.n, t.why + (g.extra ? ' (' + reasons(g) + ')' : ''), { encore: g.limited });
  } };
  R_DOX['their stat shift'] = { duel: function (q, r) { var t = theirNumber(q, r); q.theirStat(t.n, t.why); } };
  function grantNow(q, r) {
    if (RULES_BREAK === 'edgegrant') return;
    var man = r.to === 'the man the ball goes to' ? q.to : q.owner, why = rTpl(r.do.why, { man: first(man) });
    q.grant(r.do.band || 'good', { n: r.do.n, tags: r.do.tags, man: man, why: why }, why);
  }
  R_DOX['edge grant'] = { option: grantNow, outcome: grantNow };
  R_DOX['edge add'] = { event: function (e, r) { if (RULES_BREAK === 'edgeadd') return; var why = rTpl(r.do.why, { man: first(e.owner) }); e.addEdge({ n: r.do.n, man: e.owner, why: why }, why); } };
  R_DOX['state add'] = { event: function (e, r) {
    if (RULES_BREAK === 'stateadd') return;
    e.addState(r.do.name, r.to === 'their team' ? 'opponent' : e.owner, { duration: r.do.duration }, rTpl(r.do.why, { man: first(e.owner) }));
  } };
  R_DOX['state remove'] = { event: function (e, r) { if (RULES_BREAK === 'stateremove') return; e.removeState(r.do.name, r.to === 'their team' ? 'opponent' : e.owner, rTpl(r.do.why, { man: first(e.owner) })); } };
  R_DOX['win margin'] = { roll: function (q, r) { if (RULES_BREAK === 'margin') return; q.threshold(r.do.n, rTpl(r.do.why, { actor: first(q.actor) })); } };
  R_DOX['learn forget'] = { learn: function (q, r) { if (RULES_BREAK === 'forget') return; q.forget(rTpl(r.do.why, { actor: first(q.actor) })); } };  /* the counters (Belief, Build-up, a streak): name -> function (st, man) */
  var R_TO = ['every man in the squad', 'the captain', 'the man the ball goes to', 'self', 'every man on the pitch', 'the captain\'s piece', 'the first player trait this moment', 'the team', 'their team', 'your team', 'their man in the duel', 'your man in the duel', 'every man who can take up a position', 'one of your player traits at random'];
  function rWhens(r) { return Array.isArray(r.when) ? r.when : [r.when]; }
  function rTpl(s, o) { return String(s === undefined ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined ? m : o[k]; }); }
  function rLimit(r) { return r.limit === 'once a moment' ? { per: 'moment', n: 1 } : r.limit === 'once a match' ? { per: 'match', n: 1 } : undefined; }
  var R_FROM = ['the man above'];
  function rState(fx) { return fx.ruleState || (fx.ruleState = { from: {}, fromMan: {}, rolls: [], spent: {}, halves: {} }); }
  function rOwner(inst) { return inst && inst.owner ? inst.owner.player || null : null; }
  function rSide(inst) { return (inst && inst.side) || 'you'; }
  function rBench(st, p) { return !!p && (st.squad.bench || []).indexOf(p) >= 0; }
  function rTimes(t) { return t === 2 ? 'twice' : t + ' times'; }
  function rRng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  /* RULES_SKIP=<piece id> (rules_same.js --each): that piece's rules do nothing, to show the replay guard sees each piece */
  var RULES_SKIP = (typeof process !== 'undefined' && process.env && process.env.RULES_SKIP) || '';
  function rBroken(rule) { return (!!rule.brk && (rule.brk === RULES_USE.brk || rule.brk === RULES_USE.brk2)) || (!!RULES_SKIP && rule.pid === RULES_SKIP); }

  /* ---- IF: the conditions. In a duel they read the card being built (q); at kickoff and for "fires again" the
   * holder (p) and the match (fx). */
  var R_IF = {
    'his own stat is checked': { duel: function (q) { return q.actor === q.owner && q.mineVal !== null; } },
    'a stat of your man is checked': { duel: function (q) { return !!q.actor && q.mineVal !== null; } },
    'the card has a stat': { duel: function (q) { return q.mineVal !== null; } },
    'by the holder': { duel: function (q) { return q.byOwner(); } },
    'he is on the pitch': { duel: function (q) { return q.st.fx.onPitch(q.owner); }, event: function (e) { return e.st.fx.onPitch(e.owner); }, man: function (fx, p) { return fx.onPitch(p); } },
    'he is on the bench': { duel: function (q) { return rBench(q.st, q.owner); }, man: function (fx, p) { return rBench(fx.st, p); } },
    'the man he plays as is on the pitch': { duel: function (q) { var o = rState(q.st.fx).from[q.owner.id]; return !!o && q.st.fx.onPitch(o); } },
    /* package 2: the events' and cards' conditions, the same words in a duel (q) and on an event (e) */
    'your decision': { event: function (e) { return e.side === 'you'; } },
    'the ball is meant for another man': { duel: function (q) { return !!q.to && q.to !== q.owner; } },
    'the man with the ball is not him': { duel: function (q) { return q.actor !== q.owner; } },
    'he is an outfield man on the pitch': { duel: function (q) { return q.st.squad.players.indexOf(q.owner) >= 0; } },
    'it is your card': { duel: function (q) { return q.side === 'you'; } },
    'it is their card': { duel: function (q) { return q.side === 'them'; } },
    'before half-time': { duel: function (q) { return q.st.n < 3; } },
    'from the fourth moment': { event: function (e) { return e.st.n >= 3; } },
    'it is your attack': { duel: function (q) { return q.side === 'you' && typeof q.zone === 'number'; } },
    'his own duel': { event: function (e) { return e.actor === e.owner; } },
    'from the second moment': { event: function (e) { return e.st.n >= 1; } },
    'from half-time': { event: function (e) { return e.st.n >= 3; }, duel: function (q) { return q.st.n >= 3; } },
    'it did not come from a rule of this kind': { event: function (e) { return !e.byRule; } },
    /* package 3 (RULES3): who the ball is meant for, where it is, how a duel ended (the same words on a card and on an event) */
    'the passer is not the receiver': { duel: function (q) { return q.actor !== q.to; } },
    'at the edge of their box or in it': { duel: function (q) { return q.zone >= 2; } },
    'at the edge of their box': { duel: function (q) { return q.zone === 2; } },
    'in their box': { duel: function (q) { return q.zone === 3; } },
    'the ball is meant for a forward': { duel: function (q) { return !!q.to && q.to.line === 2; } },
    'the man in the duel is a midfielder': { duel: function (q) { return !!q.actor && q.actor.line === 1; }, learn: function (q) { return !!q.actor && q.actor.line === 1; } },
    'the ball went to him': { event: function (e) { return e.to === e.owner; } },
    'the duel is not his': { event: function (e) { return e.actor !== e.owner; } },
    'the result is ground': { event: function (e) { return e.effect === 'ground'; } },
    'it was kept by this piece': { event: function (e) { return e.source === e.inst.name; } },
    /* package 4 (RULES4): their number in a duel (the opponent's own effects and a trait that works on their side of a duel read it) */
    'their number is checked': { duel: function (q) { return q.theirVal !== null && !!q.foil; } }
  };
  R_IF['the man with the ball is not him'].event = function (e) { return e.actor !== e.owner; };
  R_IF['by the holder'].event = function (e) { return e.byOwner(); };
  function rIf(name) {
    var m = /^the card is (\S+)$/.exec(name);
    if (m) return { duel: function (q) { return q.id === m[1]; }, event: function (e) { return e.id === m[1]; } };
    m = /^the card is not (\S+)$/.exec(name);
    if (m) return { duel: function (q) { return q.id !== m[1]; }, event: function (e) { return e.id !== m[1]; } };
    m = /^the card has the tag (.+)$/.exec(name);
    if (m) { var tg = m[1].split(' or '); return { duel: function (q) { return tg.some(function (t) { return q.has(t); }); }, event: function (e) { return tg.some(function (t) { return e.has(t); }); } }; }
    m = /^the card has no tag (.+)$/.exec(name);
    if (m) { var nt = m[1].split(' or '); return { duel: function (q) { return !nt.some(function (t) { return q.has(t); }); }, event: function (e) { return !nt.some(function (t) { return e.has(t); }); } }; }
    m = /^the card checks (\w+)$/.exec(name);
    if (m) return { duel: function (q) { return q.mineAttr === m[1]; } };
    m = /^(his )?(\w+) (above|below) (\d+)$/.exec(name);   /* a counter: "belief above 0", "his momentum above 0" */
    if (m && R_COUNTERS[m[2]]) {
      var get = R_COUNTERS[m[2]], above = m[3] === 'above', k = +m[4], mine = !!m[1];
      var test = function (st, owner) { var v = get(st, mine ? owner : null) || 0; return above ? v > k : v < k; };
      return { duel: function (q) { return test(q.st, q.owner); }, event: function (e) { return test(e.st, e.owner); } };
    }
    if (R_IF[name]) return R_IF[name];
    /* a state of the holder ("he is marked") or of the opponent ("their team is stretched"): read from the engine's states */
    m = /^he is (.+)$/.exec(name);
    if (m && STATES[m[1]]) { var sn = m[1]; return { duel: function (q) { return RULES_BREAK !== 'ifstate' && q.hasState(sn, q.owner); }, event: function (e) { return RULES_BREAK !== 'ifstate' && e.hasState(sn, e.owner); } }; }
    m = /^their team is (.+)$/.exec(name);
    if (m && STATES[m[1]]) { var tn = m[1]; return { duel: function (q) { return RULES_BREAK !== 'ifstate' && q.hasState(tn, 'opponent'); }, event: function (e) { return RULES_BREAK !== 'ifstate' && e.hasState(tn, 'opponent'); } }; }
    return null;
  }

  /* ---- define(): check a piece's rules and compile them into hooks and event effects, in the order the rules are
   * written (a hand-written piece's list order is the order its effects run in) */
  function rulesCompile(def) {
    var at = def.id + ' rules', out = [];
    def.rules.forEach(function (r, i) {
      var w = at + ' ' + i;
      /* RULES3: one cause, several changes: `do` may be a list (read once, in order; a part that returns false stops the rest) */
      if (!r.dos) { var dl = Array.isArray(r.do) ? r.do : [r.do]; r.do = dl[0]; Object.defineProperty(r, 'dos', { value: dl, enumerable: false }); }
      Object.defineProperty(r, 'ops', { value: r.dos.map(function (d) { return d && d.ch + (d.op ? ' ' + d.op : ''); }), enumerable: false, configurable: true });
      r.op = r.ops[0];
      var cupRule = rWhens(r).some(function (wn) { return R_CUPWHEN.indexOf(wn) >= 0; });
      rWhens(r).forEach(function (wn) { if (R_WHEN.indexOf(wn) < 0 && EV_WHEN.indexOf(wn) < 0 && !R_HOOKS[wn] && R_CUPWHEN.indexOf(wn) < 0) fail(w + ': unknown WHEN ' + wn); });
      r.dos.forEach(function (d, j) {
        if (!d) fail(w + ': no DO');
        var op = r.ops[j], to = d.to || r.to;
        if (R_DO.indexOf(op) < 0 && !R_DOX[op] && !(cupRule && R_CUP[op])) fail(w + ': unknown DO ' + op);
        if (!(R_TO.indexOf(to) >= 0 || R_PICK[to] || /^piece AR_\w+$/.test(to || ''))) fail(w + ': unknown TO ' + to);
      });
      if (r.from && R_FROM.indexOf(r.from) < 0) fail(w + ': unknown FROM ' + r.from);
      if (cupRule && (r.if || []).length) fail(w + ': a cup event has no IF yet');
      (r.if || []).forEach(function (c) { if (!rIf(c)) fail(w + ': unknown IF ' + c); });
      r.pid = def.id;
      /* each DO as its own rule view (the rule itself when there is one) */
      Object.defineProperty(r, 'views', { enumerable: false, configurable: true, value: r.dos.map(function (d, j) {
        if (r.dos.length === 1) return r;
        var v = Object.create(r); v.do = d; v.op = r.ops[j]; v.to = d.to || r.to; return v;
      }) });
    });
    /* a duel rule is a stat hook; a kickoff roll that lasts the match ("stat add random") also needs one, which puts
     * the rolls on the cards: in the rule's place in the list, with its own IF read on the card, while a stat of your
     * man is checked. An event rule is an event effect; a rule on a card's result lines is an outcome hook. */
    def.rules.forEach(function (r) {
      var lim = rLimit(r);
      rWhens(r).forEach(function (wn) {
        var w = def.id + ' rule ' + r.ops.join('+') + ' on ' + wn;
        if (R_CUPWHEN.indexOf(wn) >= 0) return;   /* fired by cup.js between matches (cupFire below) */
        if (R_HOOKS[wn] || (wn === 'kickoff' && r.op === 'stat add' && r.do.stat === 'random')) {
          var kind = wn === 'learn' ? 'learn' : 'duel';
          var names = wn === 'kickoff' ? ['a stat of your man is checked'].concat(r.if || []) : (r.if || []);
          names.forEach(function (c) { if (!rIf(c)[kind]) fail(w + ': IF ' + c + ' cannot be read in a ' + (kind === 'learn' ? 'learn hook' : 'duel')); });
          var conds = names.map(function (c) { return rIf(c)[kind]; });
          var impls = r.views.map(function (v) {
            var o = R_DOX[v.op], im = wn === 'kickoff' ? R_DUEL[v.op] : wn === 'duel' ? R_DUEL[v.op] || (o && o.duel) : (o && o[wn]) || (wn === 'option' && v.op === 'stat add' ? R_DUEL[v.op] : null);   /* RULES4: a number added on a menu's option (Arrives late's +2 as "stat add") */
            if (!im) fail(w + ': DO ' + v.op + ' cannot be done in ' + wn);
            return im;
          });
          out.push({ hook: R_HOOKS[wn] || 'stat', rule: r, limit: lim,
            when: function (q) { if (rBroken(r) || (wn === 'outcome' && RULES_BREAK === 'outcome') || (wn === 'option' && RULES_BREAK === 'ballto')) return false; for (var i = 0; i < conds.length; i++) if (!conds[i](q)) return false; return true; },
            apply: function (q) { for (var i = 0; i < (RULES_BREAK === 'multido' ? 1 : impls.length); i++) if (impls[i](q, r.views[i]) === false) return; } });
        } else if (wn !== 'kickoff' && wn !== 'change') {
          (r.if || []).forEach(function (c) { if (!rIf(c).event) fail(w + ': IF ' + c + ' cannot be read on an event'); });
          var econds = (r.if || []).map(function (c) { return rIf(c).event; });
          r.views.forEach(function (v) { if (!R_DOX[v.op] || !R_DOX[v.op].event) fail(w + ': DO ' + v.op + ' cannot be done on an event'); });
          if (wn === 'gain buildup') return;   /* fired by the counter's own channel (fire below), not an event of the match */
          /* RULES4: "once a half" (the engine's limits are a moment or a match): the half the moment is in, for this holder */
          var halfKey = function (e) { return e.inst.i + ':' + (e.st.n >= 3 ? 2 : 1); }, onceHalf = r.limit === 'once a half';
          out.push({ on: wn, rule: r, limit: lim, quiet: !!r.quiet && RULES_BREAK !== 'quiet',
            when: function (e) { if (rBroken(r) || RULES_BREAK === 'events') return false; if (onceHalf && RULES_BREAK !== 'half' && rState(e.st.fx).halves[halfKey(e)]) return false; for (var i = 0; i < econds.length; i++) if (!econds[i](e)) return false; return true; },
            run: function (e) { if (onceHalf) rState(e.st.fx).halves[halfKey(e)] = 1; for (var i = 0; i < (RULES_BREAK === 'multido' ? 1 : r.views.length); i++) if (R_DOX[r.views[i].op].event(e, r.views[i]) === false) return; } });
        }
      });
    });
    def.effects = (def.effects || []).concat(out);
    /* what the engine reads off the rules instead of flags: a piece with a rule that needs him on the bench works from
     * there; a trait whose rules add to a number can be repeated (Encore's hover sentence). A cup event is not a duel: nothing
     * repeats it that way. */
    if (def.rules.some(function (r) { return (r.if || []).indexOf('he is on the bench') >= 0; })) def.benchActive = true;
    def.repeatable = def.rules.some(function (r) {
      if (rWhens(r).every(function (wn) { return R_CUPWHEN.indexOf(wn) >= 0; })) return false;
      return r.ops.some(function (op, j) {
        var a = R_DOX[op] && R_DOX[op].adds;   /* RULES4: `adds` may be a function of the DO (a piece can say it is not repeated: the a12 reading of the held positions) */
        return (op === 'stat add' && r.when !== 'kickoff') || (typeof a === 'function' ? !!a(r.dos[j]) : !!a);
      });
    });
  }
  /* a counter's own gain announces itself to every piece with a rule on it (WHEN gain buildup): in piece order, the
   * same pieces an event would reach */
  function fire(fx, name, ctx) {
    if (RULES_BREAK === 'gain') return;
    fx.inst.slice().forEach(function (inst) {
      var rules = inst.def && inst.def.rules;
      if (!rules || rSide(inst) !== 'you' || !fx.active(inst)) return;
      rules.forEach(function (r) {
        if (rWhens(r).indexOf(name) < 0 || rBroken(r)) return;
        var e = { inst: inst, st: fx.st, fx: fx, n: ctx.n, byRule: !!ctx.byRule, owner: rOwner(inst), name: inst.name };
        if (!(r.if || []).every(function (c) { return rIf(c).event(e); })) return;
        fx.countFire(inst);
        for (var i = 0; i < r.views.length; i++) if (R_DOX[r.views[i].op].event(e, r.views[i]) === false) return;
      });
    });
  }

  /* ---- DO in a duel (the part each writes on the card is its sentence template) */
  var R_DUEL = {
    /* use the FROM man's number for the stat the card checks: "he plays as {from} ({Stat} {his} instead of {mine})" */
    'stat use': function (q) {
      var o = rState(q.st.fx).from[q.owner.id], c = statCanon(q.mineAttr);
      /* RULES4, KM_RULES_PROPOSE=chain: an Understudy below an Understudy plays with what the man above PLAYS with: the chain is followed to the
       * first man who plays as nobody (a12 and the default: the man above's own stats) */
      if (RULES.propose.indexOf('chain') >= 0) { var S0 = rState(q.st.fx), hops = 0; while (S0.from[o.id] && q.st.fx.onPitch(S0.from[o.id]) && hops++ < 12) o = S0.from[o.id]; }
      var mine = RULES_ONEWAY ? (q.owner.attr || {})[c] : statValue(q.owner, c), his = statValue(o, c);
      if (typeof mine !== 'number' || typeof his !== 'number' || his === mine) return;
      q.stat(his - mine, 'he plays as ' + first(o) + ' (' + RULES_USE.statWord(c) + ' ' + his + ' instead of ' + mine + ')');
    },
    /* "he plays at half his stats on the pitch ({v} to {h})" */
    'stat half': function (q, r) {
      var v = q.mineVal, h = Math.floor(v / 2);
      if (h !== v) q.stat(h - v, r.do.why ? rTpl(r.do.why, { v: v, h: h }) : 'he plays at half his stats on the pitch (' + v + ' to ' + h + ')');
    },
    'stat add': function (q, r) {
      if (r.do.stat === 'random') return addRolled(q, r);
      if (r.do.printed) return addPrinted(q, r);
      if (r.do.n && typeof r.do.n === 'object') return addCounted(q, r);
      if (RULES_BREAK === 'plainadd') return;   /* a15: checks only (rules3_check T4 to T6: the redirect numbers are a plain add under D-3) */
      addPart(q, r.do.n, rTpl(r.do.why || '', { man: first(q.owner), actor: first(q.actor) }));
    }
  };
  /* the kickoff rolls of this holder for this man and this stat: "{holder} is on the bench: +{n} {Stat} for {man}
   * (rolled at kickoff, {k} of them from {again source})". A roll another piece repeated counts while its cause holds. */
  function addRolled(q) {
    var fx = q.st.fx, S = rState(fx), c = statCanon(q.mineAttr), h = q.owner;
    var hit = S.rolls.filter(function (b) { return b.from === h && b.player === q.actor && statCanon(b.stat) === c && (!b.via || rBench(q.st, b.via)); });
    if (!hit.length) return;
    var byV = hit.filter(function (b) { return !!b.via; }), srcs = [];
    byV.forEach(function (b) { if (srcs.indexOf(b.by) < 0) srcs.push(b.by); });
    q.stat(hit.length, first(h) + ' is on the bench: +' + hit.length + ' ' + RULES_USE.statWord(c) + ' for ' + first(q.actor) + ' (rolled at kickoff' +
      (byV.length ? ', ' + byV.length + ' of them from ' + srcs.map(function (x) { return x.def.name; }).join(' and ') : '') + ')',
      { fn: byV.length ? function () { srcs.forEach(function (x) { fx.countFire(x); }); } : null });
  }
  /* a number already printed on the card the piece makes: it adds nothing itself; a repeat adds "his +{n} counts
   * twice ({source}: ...)" */
  function addPrinted(q, r) {
    if (RULES_BREAK === 'printed') return;
    var n = r.do.n, g = again(q.st.fx, q.inst, { op: 'add', when: 'duel' }, { card: q.card });
    if (!g.extra) return;
    if (g.limited) q.card.encoreGiven = true;
    q.stat(g.extra * n, 'his +' + n + ' counts ' + rTimes(g.times) + ' (' + reasons(g) + ')', { encore: g.limited });
  }
  /* a number a piece adds in a duel (archetypes.js part() in rules mode): repeated when a rule says so,
   * "{why} ({source}: the first player trait this moment counts twice)" */
  function addPart(q, n, why, fn) {
    if (!n) return;
    var g = again(q.st.fx, q.inst, { op: 'add', when: 'duel' }, { card: q.card });
    if (g.limited) q.card.encoreGiven = true;
    q.stat(g.times * n, why + (g.extra ? ' (' + reasons(g) + ')' : ''), { encore: g.limited, fn: fn || null });
  }
  /* +n where n is a counter (times a number): "{counter} {c} counts {times} times on his shots", "{c} full match{es} in
   * this run". {c} the counter, {n} what is added, {s} and {es} the plural endings of {c}. */
  function addCounted(q, r) {
    var sp = r.do.n, c = (R_COUNTERS[sp.counter] || function () { return 0; })(q.st, q.owner) || 0, n = c * (RULES_BREAK === 'times' ? 1 : sp.times || 1);
    if (RULES_BREAK === 'counter') n = 0;
    addPart(q, n, rTpl(r.do.why, { c: c, n: n, s: c === 1 ? '' : 's', es: c === 1 ? '' : 'es' }));
  }
  function reasons(g) {
    var out = [];
    g.used.forEach(function (c) { var t = AGAIN_TO[c.rule.to]; var s = t && t.why ? t.why(c, g) : c.src.def.name + ': it works ' + rTimes(g.times); if (out.indexOf(s) < 0) out.push(s); });
    return out.join('; ');
  }

  /* ---- AGAIN: "fires again". again(fx, inst, change) asks every piece with an `again` rule whether this change of
   * piece `inst` happens more times. change = { op: 'add' | ..., when: 'duel' | 'event' | 'kickoff' }. Only a change
   * that adds to a number can be repeated (a use, a half, a copy, a ball or position change, another again: never).
   * THE STACKING RULE: add (each source one more) or max2 (at most twice). */
  var AGAIN_TO = {
    'the captain\'s piece': { test: function (inst) { return !!inst.owner && inst.owner.kind === 'captain'; },
      why: function (c, g) { return 'his piece works ' + g.times + ' times'; } },
    'the first player trait this moment': { test: function (inst, ch) { return !!inst.def && inst.def.kind === 'trait' && ch.when !== 'kickoff'; },
      why: function (c, g) { return c.src.def.name + ': the first player trait this moment counts ' + rTimes(g.times); } }
  };
  function againTest(to, inst, ch) {
    var m = /^piece (AR_\w+)$/.exec(to);
    if (m) return !!inst.def && inst.def.id === m[1];
    return !!AGAIN_TO[to] && AGAIN_TO[to].test(inst, ch);
  }
  /* how many more times a source adds: a number, or "one for every other holder of the target piece on the bench"
   * (each tied to that man: it counts while he stays on the bench) */
  function againCount(r, src, inst, fx) {
    if (r.do.n === 'one for every other holder on the bench') {
      var hs = [];
      fx.inst.forEach(function (x) { var p = rOwner(x); if (x.def === inst.def && rSide(x) === rSide(inst) && !x.copyOf && rBench(fx.st, p) && hs.indexOf(p) < 0) hs.push(p); });
      return hs.filter(function (p) { return p !== rOwner(inst); });
    }
    var out = []; for (var i = 0; i < (r.do.n || 1); i++) out.push(null);
    return out;
  }
  function again(fx, inst, ch, opts) {
    opts = opts || {};
    var g = { times: 1, extra: 0, used: [], all: [], sources: [], limited: false };
    if (!inst || !inst.def || !ch || ch.op !== 'add' || RULES_BREAK === 'repeat') return g;
    var S = rState(fx);
    fx.inst.forEach(function (src) {
      var rules = src.def && src.def.rules;
      if (!rules || rSide(src) !== rSide(inst) || !fx.active(src)) return;
      rules.forEach(function (r) {
        if (r.when !== 'change' || r.op !== 'again' || rBroken(r)) return;
        if (!againTest(r.to, inst, ch)) return;
        if (r.limit === 'once a moment' && (S.spent[src.i] === fx.scope.moment || (opts.card && opts.card.encoreGiven))) return;
        var ok = (r.if || []).every(function (c) { var f = rIf(c); return f && f.man ? f.man(fx, rOwner(src)) : true; });
        if (!ok) return;
        againCount(r, src, inst, fx).forEach(function (v) { g.all.push({ src: src, rule: r, via: v }); });
        if (g.sources.indexOf(src) < 0) g.sources.push(src);
      });
    });
    var k = stack(g.all.length);
    g.used = g.all.slice(0, k); g.extra = k; g.times = 1 + k;
    g.limited = g.used.some(function (c) { return !!c.rule.limit; });
    return g;
  }
  function stack(n) { return RULES.stack === 'max2' && RULES_BREAK !== 'stack' ? Math.min(1, n) : n; }
  /* the change happened now (an event, not a card): a once-a-moment source is used up, and says so:
   * "{piece} is the first player trait to do something in this moment, so it does it twice" */
  function againTake(fx, g, inst) {
    var S = rState(fx);
    g.used.forEach(function (c) {
      if (!c.rule.limit || S.spent[c.src.i] === fx.scope.moment) return;
      S.spent[c.src.i] = fx.scope.moment;
      fx.countFire(c.src);
      fx.write(c.src.name, inst.name + ' is the first player trait to do something in this moment, so it does it ' + rTimes(g.times), 'event', 'counter');
    });
  }
  /* a card that showed a once-a-moment repeat was chosen: that source is used up (effects.js fired, r.encore) */
  function againSpendShown(fx) {
    var S = rState(fx);
    fx.inst.forEach(function (src) {
      if (!src.def || !src.def.rules || !fx.active(src)) return;
      if (!src.def.rules.some(function (r) { return r.op === 'again' && r.limit === 'once a moment'; })) return;
      S.spent[src.i] = fx.scope.moment;
      fx.countFire(src);
    });
  }
  function spentNow(fx, id) {
    var S = rState(fx);
    return fx.inst.some(function (x) { return x.def && x.def.id === id && S.spent[x.i] === fx.scope.moment; });
  }

  /* ---- KICKOFF: man by man, the eleven in team sheet order (top first), then the bench in squad order; a man who holds
   * the same piece twice gets it once. order: the eleven as the team sheet orders them. */
  function kickoff(fx, st, order) {
    var S = rState(fx), done = {}, dice = null;
    var bench = (st.squad.bench || []).filter(function (p) { return order.indexOf(p) < 0; });
    var men = RULES_BREAK === 'order' ? order.slice().reverse().concat(bench) : order.concat(bench);
    function roll() { return (dice || (dice = rRng(((st.seed | 0) * 2654435761 + 97) >>> 0)))(); }
    men.forEach(function (p) {
      var mine = fx.inst.filter(function (x) { return x.def && x.def.rules && !x.copyOf && rSide(x) === 'you' && rOwner(x) === p; });
      mine.forEach(function (inst) {
        var key = p.id + '|' + inst.def.id;
        if (done[key]) return;
        done[key] = 1;
        inst.def.rules.forEach(function (r) {
          if (r.when !== 'kickoff' || rBroken(r)) return;
          var ok = (r.if || []).every(function (c) { var f = rIf(c); return f && f.man ? f.man(fx, p) : true; });
          if (!ok) return;
          R_KICK[r.op](fx, st, inst, p, r, order, roll);
        });
      });
    });
    /* RULES4: a piece of the team (a tactic, a captain's piece) has no man to be read for: its kickoff rules run once, after the men, with a
     * DO part that has a `kickoff` (Patience: the length of an attack) */
    fx.inst.forEach(function (inst) {
      if (!inst.def || !inst.def.rules || inst.copyOf || rSide(inst) !== 'you' || rOwner(inst)) return;
      inst.def.rules.forEach(function (r) {
        if (!rWhens(r).some(function (w) { return w === 'kickoff'; }) || rBroken(r)) return;
        r.views.forEach(function (v) { if (R_DOX[v.op] && R_DOX[v.op].kickoff) R_DOX[v.op].kickoff(fx, st, inst, v); });
      });
    });
  }
  function fromMan(r, p, order, st) {
    if (r.from !== 'the man above') return null;
    var idx = order.indexOf(p);
    if (idx <= 0) return null;
    var o = order[idx - 1];
    if (RULES.table === 'skip' && (o === st.squad.keeper || o.role === 'keeper' || o.pos === 'GK')) return null;   /* option skip */
    return o;
  }
  var R_KICK = {
    /* "{man} plays as {from}, the man above him on the team sheet, with his traits ({list})" */
    'traits copy': function (fx, st, inst, p, r, order) {
      var o = fromMan(r, p, order, st), S = rState(fx);
      if (!o) return;
      S.from[p.id] = o; S.fromMan[p.id] = p;
      var theirs = RULES_BREAK === 'copy' ? [] : fx.inst.filter(function (x) { return rSide(x) === 'you' && x.def.kind === 'trait' && rOwner(x) === o && x.def.id !== inst.def.id && x.owner.kind === 'player'; });
      theirs.forEach(function (x) {
        fx.inst.push({ def: x.def, owner: { kind: 'player', player: p, side: 'you' }, name: x.def.name + ' (' + first(p) + ', copied from ' + first(o) + ')', i: fx.inst.length, side: 'you',
          copyOf: x, copyFrom: o, shareI: x.shareI !== undefined ? x.shareI : x.i });
      });
      fx.write(inst.name, first(p) + ' plays as ' + first(o) + ', the man above him on the team sheet' + (theirs.length ? ', with his traits (' + theirs.map(function (x) { return x.def.name; }).join(', ') + ')' : ''), 'event', 'counter');
    },
    /* +1 to a random stat of every man on the pitch, rolled now, repeated by any `again` rule on it:
     * "{holder} is on the bench: {man} +1 {Stat}, +1 {Stat}; ..." */
    'stat add': function (fx, st, inst, p, r, order, roll) {
      if (r.do.stat !== 'random' || r.to !== 'every man on the pitch') fail(inst.def.id + ': at kickoff only "stat add random to every man on the pitch" is built');
      var S = rState(fx), g = again(fx, inst, { op: 'add', when: 'kickoff' });
      var reps = [{ via: null, by: null }].concat(g.used.map(function (c) { return { via: c.via, by: c.src }; }));
      if (RULES_BREAK === 'roll') reps = reps.slice(0, 1);
      var onNow = [st.squad.keeper].concat(st.squad.players).filter(Boolean);
      onNow.forEach(function (m) {
        var stats = Object.keys(m.attr || {}).filter(function (k) { return typeof m.attr[k] === 'number'; });
        reps.forEach(function (x) { S.rolls.push({ from: p, via: x.via, by: x.by, player: m, stat: stats[Math.floor(roll() * stats.length)] }); });
      });
      fx.write(inst.name, first(p) + ' is on the bench: ' + onNow.map(function (m) {
        return first(m) + ' +1 ' + S.rolls.filter(function (b) { return b.from === p && b.player === m; }).map(function (b) { return RULES_USE.statWord(b.stat); }).join(', +1 ');
      }).join('; '), 'event', 'counter');
    }
  };
  /* ---- THE CUP'S EVENTS (RULES3): a signing and a release, between matches. cup.js describes the run in W and applies what
   * the rules return; the rules are read exactly as in a match: the pieces the run owns, "fires again" (Captain's shadow in the
   * eleven) by the one stacking rule. W = { owned: [{ def, on }], eleven: [names], squad: [{ name, keys }], captain: { name, keys },
   * rng: function () -> random function, repeat: false stops a captain's piece working again (an old switch) }.
   * Returns [{ id, times, picks: [{ name, stat }], n }]: every pick gets +n for the rest of the run. */
  R_CUP['stat add'] = function (W, inst, r, times) {
    var d = r.do, res = { id: inst.def.id, times: times, picks: [], n: d.n };
    if (d.stat === 'random') {
      /* "every man in the squad gets +n to a random stat of his own": one roll for each man, once for each time the piece works */
      var rs = RULES_BREAK === 'cuprng' ? Math.random.bind(Math) : W.rng();
      for (var t = 0; t < times; t++) W.squad.forEach(function (p) { res.picks.push({ name: p.name, stat: p.keys[Math.floor(rs() * p.keys.length)] }); });
    } else if (d.stat === 'all') {
      /* "+n to all of the captain's stats", n for each time the piece works */
      W.captain.keys.forEach(function (s) { res.picks.push({ name: W.captain.name, stat: s }); });
      res.n = d.n * times;
    } else fail(inst.def.id + ': a cup event does "stat add" with random or all');
    return res;
  };
  function cupFire(name, W) {
    if (RULES_BREAK === 'cup') return [];
    var fx = { inst: [], active: function () { return true; }, onPitch: function (p) { return W.eleven.indexOf(p.name) >= 0; }, scope: { moment: 0 } }, out = [];
    W.owned.forEach(function (o, i) {
      if (!o.def) return;
      fx.inst.push({ def: o.def, owner: { kind: o.def.kind === 'captain' ? 'captain' : o.def.kind === 'tactic' ? 'team' : 'player', player: o.on ? { name: o.on } : null },
        side: 'you', i: i, name: o.def.name });
    });
    fx.inst.forEach(function (inst) {
      (inst.def.rules || []).forEach(function (r) {
        if (rWhens(r).indexOf(name) < 0 || rBroken(r)) return;
        var times = W.repeat === false || RULES_BREAK === 'cuptimes' ? 1 : again(fx, inst, { op: 'add', when: 'cup' }).times;
        r.views.forEach(function (v) { out.push(R_CUP[v.op](W, inst, v, times)); });
      });
    });
    return out;
  }
  /* between matches (cup.js): how many times a piece works with n sources of "fires again" */
  function timesWith(n) { return RULES_BREAK === 'repeat' ? 1 : 1 + stack(n); }
  var RULES_API = {
    on: RULES.on, cfg: RULES, TABLE: STAT_TABLE, statCanon: statCanon, statValue: statValue,
    use: function (o) { for (var k in o) RULES_USE[k] = o[k]; },
    again: again, againTake: againTake, againSpendShown: againSpendShown, spentNow: spentNow, addPart: addPart, reasons: reasons,
    kickoff: kickoff, state: rState, timesWith: timesWith, stack: stack, fire: fire, tpl: rTpl, cupFire: cupFire,
    /* a content file registers its parts once: { ifs: {name: {duel, event}}, dos: {op: {event, duel, outcome, adds}}, counters: {name: fn(st, man)} } */
    part: function (o) {
      Object.keys(o.ifs || {}).forEach(function (k) { R_IF[k] = o.ifs[k]; });
      Object.keys(o.dos || {}).forEach(function (k) { R_DOX[k] = o.dos[k]; });
      Object.keys(o.counters || {}).forEach(function (k) { R_COUNTERS[k] = o.counters[k]; });
      Object.keys(o.picks || {}).forEach(function (k) { R_PICK[k] = o.picks[k]; });
    },
    broken: function (n) { return RULES_BREAK === n; },
    counter: function (name, st, man) { return R_COUNTERS[name] ? R_COUNTERS[name](st, man) : undefined; },
    repeatable: function (d) { return !!d && (d.rules ? !!d.repeatable : d.encore === true); },
    WHEN: R_WHEN.concat(EV_WHEN), DO: R_DO.concat(Object.keys(R_DOX)), TO: R_TO, FROM: R_FROM, IF: Object.keys(R_IF).concat(['the card is <id>'])
  };

  var API = {
    rules: RULES_API /* kmtree5 a13 (stream RULES1) */,
    a15: a15, A15_ITEMS: A15_ITEMS /* kmtree5 a15 (stream A15) */,
    a16: a16, A16_ITEMS: A16_ITEMS, a16brk: function () { return A16.brk || ''; }, a16Crit: a16Crit, a16K: a16K, a16Odds: a16Odds, a16MultiOdds: a16MultiOdds, A16_FLOOR: A16_FLOOR /* kmtree5 a16 (stream A16) */,
    g3b: g3b, G3B_ITEMS: G3B_ITEMS /* kmtree5 a12 (stream GAME3b) */,
    efx: efx, EFX_ITEMS: EFX_ITEMS /* kmtree5 a12 (stream EFFX) */,
    g11: g11 /* kmtree5 a11 (helper G11) */,
    t11: t11, T11_ITEMS: T11_ITEMS /* kmtree5 a11 (stream TRT) */,
    ACTION_TAGS: ACTION_TAGS, TAGS_OF: TAGS_OF, STATES: STATES, DURATIONS: DURATIONS, OWNERS: OWNERS,
    EVENTS: EVENTS, HOOKS: HOOKS, GROUPS: GROUPS, KINDS: KINDS, ROLES: ROLES, LIMIT: LIMIT, GUARD: GUARD,
    BAND_WORD: BAND_WORD, DERIVED: DERIVED, SYSTEM_SOURCES: SYSTEM_SOURCES, subsOf: subsOf,
    tagsFor: tagsFor, define: define, get: get, REG: REG, lasts: lasts, lastingText: lastingText /* m2 */,
    payoffOn: payoffOn, setPayoff: setPayoff /* m3 */,
    validateBuild: validateBuild, applyBuild: applyBuild, attach: attach, findPlayer: findPlayer,
    odds: odds, band: band, first: first, Runtime: Runtime, multiOdds: multiOdds /* kmtree5 */,
    extensions: EXTENSIONS /* kmtree5 */, isAR: function (id) { return /^(AR|OP)_/.test(String(id || '')); },
    undoSubs: undoSubs   /* m2 from w1d */
  };
  root.KMEffects = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
