/* THE CUP (kmtree5 a1: the run for the build archetypes; st4's cup underneath).
 *
 * The designer's spec (SPEC-eduardo-2026-09-29.txt) and his rulings of that day (kmtree5/BRIEF.md) change the
 * run st4 built:
 *   - The cup is 4 matches. After each win: three offers, pick one. After winning the cup, an optional ENDLESS
 *     mode ("Keep going"): more matches, more drafting, opponents keep scaling, it stops at the first loss.
 *     A draw ends the run, as in st4 (?cupdraw=through lets it go through, for testing).
 *   - The pool: the 29 archetype pieces (archetypes.js, Helper E), the redirect family (Decoy, Arrives late,
 *     Nominated receiver, No striker, Runs the channels), st4's plain upgrades, and SIGNINGS (a generated player
 *     who joins the bench, visible numbers, sometimes with a trait). A trait is only offered on a player who
 *     can hold it (striker, midfielder, winger, defender, keeper, or anyone).
 *   - Belief adds to ONE stat: the first time a piece that makes or reads Belief is picked, the cup asks
 *     "Belief adds to which stat?"; the answer is fixed for the run (build.beliefStat).
 *   - The roster order (the eleven, top first) is edited on the team sheet and passed as build.order; a bench
 *     man can be put in the eleven (same line); with Sold for a fee a bench man can be released (the captain
 *     gets +1 to all his numbers for the rest of the run); Competitive spirit gives every player +1 to one
 *     random number each time a player is signed.
 *   - The run state (matches without a loss, Confidence and Momentum per player, the stat growth) is kept from
 *     X.runReport after each match and passed as build.run; the growth is written into the squad.
 *   - Opponents: +1 to all their numbers each round, and effects: round 1 none, the middle rounds one elite
 *     effect each, the final one boss effect; endless: +1 a match, one more effect every 2 matches. Passed as
 *     oppBuild.effects; each shown on the team sheet with its sentence and how to play around it.
 *
 * Pure logic, no DOM, no Math.random: everything comes from the run's seed and the match number, so a reload
 * shows the same offers. Browser: window.KMCup. Node: require('./cup.js').
 * The page (play.html) draws the screens and keeps the run in localStorage; cupsim.js plays whole runs with
 * the draft bots; cupcheck.js checks both.
 *
 * CUP_BREAK (env) / ?cupbreak= shows each cupcheck check fails: repeat, family, slots, tel, novalidate, noguard
 * (st4's), and anyholder, nosign, norelease, belief, order, noeffects, noscale, runstate, spirit, endless (new).
 */
(function (root) {
  'use strict';
  var BREAK = (function () {
    try { if (typeof process !== 'undefined' && process.env && process.env.CUP_BREAK) return process.env.CUP_BREAK; } catch (e) { }
    try { var m = /[?&]cupbreak=(\w+)/.exec((root.location && root.location.search) || ''); return m ? m[1] : ''; } catch (e) { return ''; }
  })();
  function param(envName, q, dflt) {
    try { if (typeof process !== 'undefined' && process.env && process.env[envName]) return process.env[envName]; } catch (e) { }
    try { var m = new RegExp('[?&]' + q + '=(\\w+)').exec((root.location && root.location.search) || ''); return m ? m[1] : dflt; } catch (e) { return dflt; }
  }
  var DRAW = param('KM_CUPDRAW', 'cupdraw', 'out'); if (DRAW !== 'through') DRAW = 'out';
  /* Season counters count from the match the piece is held (default), or every match of the run (switch) */
  var SEASON = param('KM_SEASONCOUNT', 'seasoncount', 'held'); if (SEASON !== 'all') SEASON = 'held';
  /* Sold for a fee: any number of releases between matches (default, ruling 1: no caps), or one (switch) */
  var SELLCAP = param('KM_SELLCAP', 'sellcap', 'none'); if (SELLCAP !== '1') SELLCAP = 'none';

  var MATCHES = 4;          /* the cup; endless goes on after it */
  var MAX_MATCH = 99;       /* a saved run's bound, not a rule of play */
  var TACTIC_SLOTS = 3;
  var CAPTAIN = 'Rodri';
  var STATS = ['pace', 'physical', 'technique', 'passing', 'finishing', 'defending', 'intelligence'];
  /* the Belief question: one plain line for each of the seven */
  var STAT_LINES = {
    pace: 'Pace: getting to the ball first, running past a man, and chasing back.',
    physical: 'Physical: holding a man off, winning the ball in the air, and lasting the match.',
    technique: 'Technique: controlling the ball and beating a man with it.',
    passing: 'Passing: how often a pass reaches the man it was meant for.',
    finishing: 'Finishing: shots at goal.',
    defending: 'Defending: tackles, blocks and marking.',
    intelligence: 'Intelligence: being in the right place, and reading what the other team will do.'
  };
  var STAT_NAME = { pace: 'Pace', physical: 'Physical', technique: 'Technique', passing: 'Passing', finishing: 'Finishing', defending: 'Defending', intelligence: 'Intelligence',
    reflexes: 'Reflexes', communication: 'Communication', distribution: 'Distribution', physique: 'Physique' };

  /* THE PIECES. kind: the slot it takes. holder (traits): who can hold it: striker, midfielder, winger, defender,
   * keeper, forward (any of the front three), any (any outfield player), bench (any outfield player, offered on a
   * man on the bench). on: a fixed man (st4's redirect pieces). Names and sentences come from the component
   * (archetypes.js, Helper E); `text` here overrides it only where st4 wrote the cup's own sentence. fam is kept
   * ONLY for the draft study and is never put on an offer (cupcheck C4). */
  var AR = [
    ['AR_SUPERB_EFFORT', 'trait', 'striker', 'belief'], ['AR_BRILLIANT_PASS', 'trait', 'midfielder', 'belief'], ['AR_STEADY', 'tactic', null, 'belief'],
    ['AR_GROWING_BELIEF', 'tactic', null, 'belief'], ['AR_SLALOM', 'trait', 'winger', 'belief'], ['AR_SPECULATIVE_SHOT', 'trait', 'striker', 'belief'],
    ['AR_HALFTIME_RANT', 'captain', null, 'belief'], ['AR_FEEDS_OFF_IT', 'trait', 'defender', 'belief'],
    ['AR_TIKI_TAKA', 'tactic', null, 'buildup'], ['AR_CIRCULATOR', 'trait', 'midfielder', 'buildup'], ['AR_SECOND_CHANCE', 'tactic', null, 'buildup'],
    ['AR_METRONOME', 'captain', null, 'buildup'], ['AR_THE_OPENING', 'tactic', null, 'buildup'], ['AR_FINAL_BALL', 'trait', 'striker', 'buildup'],
    ['AR_PATIENCE', 'tactic', null, 'buildup'],
    ['AR_STAY_WIDE', 'trait', 'winger', 'pockets'], ['AR_CONDUCTOR', 'captain', null, 'pockets'], ['AR_STEP_FORWARD', 'trait', 'keeper', 'pockets'],
    ['AR_JOIN_THE_ATTACK', 'trait', 'defender', 'pockets'],
    ['AR_UNBEATEN_RUN', 'tactic', null, 'season'], ['AR_COMPETITIVE_SPIRIT', 'captain', null, 'season'], ['AR_CONFIDENCE', 'trait', 'any', 'season'],
    ['AR_MOMENTUM', 'trait', 'any', 'season'], ['AR_SOLD_FOR_A_FEE', 'tactic', null, 'season'],
    ['AR_UNDERSTUDY', 'trait', 'any', 'understudies'], ['AR_CAPTAINS_SHADOW', 'trait', 'any', 'understudies'], ['AR_ENCORE', 'tactic', null, 'understudies'],
    ['AR_BENCHWARMER', 'trait', 'bench', 'understudies'], ['AR_ALL_FOR_ONE', 'tactic', null, 'understudies']
  ].map(function (a) { return { id: a[0], kind: a[1], holder: a[2], on: a[1] === 'captain' ? CAPTAIN : null, fam: a[3] }; });
  /* the cup's own sentence where the piece's sentence names another piece (an offer never does: st4's rule, cupcheck
   * C4). All for One's rule is about Benchwarmers, so its offer says what they do instead of their name
   * (DECISIONS-R 20). */
  AR.forEach(function (p) {
    if (p.id === 'AR_ALL_FOR_ONE') p.text = 'For every player on your bench who gives the players on the pitch a random +1 from there, each other such player on the bench gives one more random +1 to each player on the pitch.';
  });
  var REDIRECT = [
    { id: 'WE_DECOY', kind: 'trait', on: 'Oyarzabal', fam: 'redirect',
      text: 'At the start of each of your attacks one of their centre-backs marks Oyarzabal: until he touches the ball, passes to him and his own moves in their half are -2, and anyone else\'s move against one of their defenders there is +1.' },
    { id: 'WE_ARRIVES_LATE', kind: 'trait', on: 'Fabián', fam: 'redirect',
      text: 'In their half, a pass meant for a man their defence is marking goes to Fabián instead, at +2 (a pull-back or a ball across the goal stays with its man).' },
    { id: 'RT_NOMINATE', kind: 'trait', on: 'Olmo', fam: 'redirect',
      text: 'Your cut-backs and low crosses go to Olmo, whoever the card would have sent them to.' },
    { id: 'D_NO_STRIKER', kind: 'tactic', on: null, fam: 'redirect',
      text: 'Only while nobody in your eleven is a striker (Oyarzabal and Torres are): a cut-back meant for a forward goes to your best finisher coming from midfield, and a midfielder\'s shot in their box is +2 and needs a margin of only 3 for a clean win, not 4. With a striker in your eleven it does nothing.' },
    { id: 'TR_CHANNEL_RUNNER', kind: 'trait', holder: 'forward', on: null, fam: 'redirect' }
  ];
  var PIECES = AR.concat(REDIRECT);
  /* st4's other pieces LEFT THE POOL (BRIEF.md: only the redirect family stays). Kept here, never offered and never
   * valid in a saved run, so st4's checks that read their cup sentence (startercheck S18) still run. */
  var RETIRED = [
    { id: 'AD_DECOY_ROUTE', name: 'Show them one side', kind: 'tactic', on: null, fam: 'B',
      text: null /* read from the component (its rule is set by _show/SHOW.md); see sentence() */ },
    { id: 'TA_RUN_AT_HIM', name: 'Run at him', kind: 'tactic', on: null, fam: 'C',
      text: 'When a run or carry of yours in midfield or their half wins against one of their outfield men (a half win is enough), he is rattled until he wins a duel against you, and your later runs and carries at him are +1.' },
    { id: 'CAP_KEEP_AT_HIM', name: 'Keep at him', kind: 'captain', on: 'Rodri', fam: 'C',
      text: 'Once in each attack, yours or theirs, a half win against a rattled man counts as a clean win.' },
    { id: 'WC_SIT_DEEP', name: 'Sit deep', kind: 'tactic', on: null, fam: 'D',
      text: 'On their attacks, covering, dropping back, blocking and marking are +1 and tackling and pressing -1; a stop near your box wins you the ball, and their team is stretched in the attack that follows.' },
    { id: 'WC_DEFENCE_TO_ATTACK', name: 'Defence into attack', kind: 'captain', on: 'Rodri', fam: 'D',
      text: 'A clean win on defence gives the attack it starts +1, and in that attack the edges you earn add up instead of only the biggest counting.' },
    { id: 'WS_TACTICAL_FOULER', name: 'Tactical fouler', kind: 'trait', on: 'Rodri', fam: 'D',
      text: 'When their attack is in midfield or at the edge of your box, Rodri can pull their man down: their attack stops and he is booked; after that he cannot do it again, and his tackles, presses, interceptions and double teams are -1.' }
  ];
  var BELIEF_IDS = ['AR_SUPERB_EFFORT', 'AR_BRILLIANT_PASS', 'AR_STEADY', 'AR_GROWING_BELIEF', 'AR_SPECULATIVE_SHOT', 'AR_HALFTIME_RANT', 'AR_FEEDS_OFF_IT'];
  /* THE PLAIN UPGRADES (st4's): strength without a new decision */
  var PLAIN = [
    { id: 'UP_YAMAL_PACE', name: '+1 Pace', kind: 'plain', on: 'Yamal', attr: 'pace' },
    { id: 'UP_OYARZABAL_FIN', name: '+1 Finishing', kind: 'plain', on: 'Oyarzabal', attr: 'finishing' },
    { id: 'UP_OLMO_TECH', name: '+1 Technique', kind: 'plain', on: 'Olmo', attr: 'technique' },
    { id: 'UP_RODRI_PASS', name: '+1 Passing', kind: 'plain', on: 'Rodri', attr: 'passing' },
    { id: 'UP_LAPORTE_DEF', name: '+1 Defending', kind: 'plain', on: 'Laporte', attr: 'defending' },
    { id: 'UP_BAENA_PACE', name: '+1 Pace', kind: 'plain', on: 'Baena', attr: 'pace' },
    { id: 'UP_FRESH_LEGS', name: 'Fresh legs', kind: 'plain', on: null, subs: 1,
      text: 'One more substitution in every match (4 instead of 3): each one gives a tired line its stamina back.' }
  ];
  /* st4's roles for these men (read by the redirect pieces' clauses). Olmo's "finisher" is dropped while No striker
   * is owned, or it could never work with him on the pitch (DECISIONS-R 9). */
  var ROLES = { Oyarzabal: ['link player'], 'Fabián': ['runner'], Olmo: ['finisher', 'carrier'], Yamal: ['winger'], Baena: ['winger'], Rodri: ['ball winner'] };

  /* THE OPPONENT EFFECTS: the tiers are the ruling's (the three "proposed in the feedback" and the Slay the Spire
   * list are elites, the Balatro list bosses; Trash town is parked). Names, sentences and how to play around each
   * come from opponents.js (KMOpponents.list(), Helper E). */
  var ELITES = ['OP_DIVER', 'OP_STRONG_BELIEF', 'OP_CHECKED_OUT', 'OP_HATES_TIME_WASTING', 'OP_SLEEPING_GIANT', 'OP_SHELL_UP', 'OP_GAME_MANAGER', 'OP_UNDER_YOUR_SKIN'];
  var BOSSES = ['OP_FORTRESS', 'OP_NO_QUICK_SHOTS', 'OP_SHADOW_MARKER', 'OP_COLD_START'];

  /* THE ROUNDS. shift: added to every number of a made-up club (1 to 20 before it). A made-up club averages about
   * 11.9 a number and Argentina 13.7, so Argentina as they are is about a club +2: the four matches climb one step
   * a round (-1, 0, +1, about +2), and endless goes on from there (+3, +4, ...). */
  function roundOf(i) {
    if (i === 1) return { round: 'Round 1', shift: -1, elites: 0, bosses: 0 };
    if (i === 2) return { round: 'Quarter-final', shift: 0, elites: 1, bosses: 0 };
    if (i === 3) return { round: 'Semi-final', shift: 1, elites: 1, bosses: 0 };
    if (i === 4) return { round: 'Final', team: 'argentina', shift: 0, elites: 0, bosses: 1 };
    var k = i - MATCHES, n = 1 + Math.floor(k / 2);
    return { round: 'Endless, match ' + k, shift: 2 + k, effects: n, endless: true };
  }
  var CLUBS = ['Fennbridge', 'Dunmoor Rangers', 'Brackwater', 'Holm Athletic', 'Ostergard', 'Calder Vale', 'Thistledown', 'Marrowgate', 'Pellhaven', 'Vord United', 'Saltcombe', 'Ninefields'];

  /* a small seeded generator of our own (the match core's RNG is not needed for this) */
  function mix(a, b) { var h = (a | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (b | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
  function Rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  function shuffle(list, r) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function first(n) { return String(n || '').split(' ')[0]; }

  /* ---------------------------------------------------------------- the libraries this file reads */
  var FXREG = null;
  function FXlib() { try { return FXREG || root.KMEffects || (typeof require === 'function' ? require('./effects.js') : null); } catch (e) { return null; } }
  function fxDef(id) { try { var FX = FXlib(); return FX && FX.get ? FX.get(id) : null; } catch (e) { return null; } }
  function Wlib() { try { return root.KMWorldCup || (typeof require === 'function' ? require('./worldcup.js') : null); } catch (e) { return null; } }
  function Alib() { try { return root.KMAttr || (typeof require === 'function' ? require('./attributes.js') : null); } catch (e) { return null; } }
  function OPlib() { try { return root.KMOpponents || (typeof require === 'function' ? require('./opponents.js') : null); } catch (e) { return null; } }
  var ROLE_LINE = { 'keeper': -1, 'centre-back': 0, 'ball-playing-defender': 0, 'full-back': 0, 'wing-back': 0, 'ball-winner': 1, 'deep-lying-playmaker': 1,
    'box-to-box': 1, 'advanced-playmaker': 1, 'winger': 2, 'inside-forward': 2, 'target-forward': 2, 'poacher': 2 };
  var ROLE_SHORT = { 'centre-back': 'CB', 'ball-playing-defender': 'BPD', 'full-back': 'FB', 'wing-back': 'WB', 'ball-winner': 'BW', 'deep-lying-playmaker': 'DLP',
    'box-to-box': 'B2B', 'advanced-playmaker': 'AP', 'winger': 'W', 'inside-forward': 'IF', 'target-forward': 'TF', 'poacher': 'PO' };
  var ROLE_WPF = { 'centre-back': [8, 3, 2], 'ball-playing-defender': [6, 6, 2], 'full-back': [6, 5, 2], 'wing-back': [5, 7, 3], 'ball-winner': [8, 4, 2],
    'deep-lying-playmaker': [5, 8, 3], 'box-to-box': [6, 6, 5], 'advanced-playmaker': [3, 8, 6], 'winger': [3, 7, 6], 'inside-forward': [3, 6, 8],
    'target-forward': [6, 4, 8], 'poacher': [2, 3, 9] };
  /* who a man is, for the holders: from his role */
  function catOf(role) {
    var l = ROLE_LINE[role];
    if (l === -1) return 'keeper';
    if (l === 0) return 'defender';
    if (l === 1) return 'midfielder';
    if (l === 2) return role === 'winger' || role === 'inside-forward' ? 'winger' : 'striker';   /* archetypes.js's own reading (isWinger) */
    return 'any';
  }
  function canHold(holder, man, where) {
    if (BREAK === 'anyholder') return true;
    if (!man) return false;
    var c = catOf(man.role);
    if (holder === 'any') return c !== 'keeper';
    if (holder === 'bench') return c !== 'keeper';
    if (holder === 'forward') return c === 'winger' || c === 'striker';
    return c === holder;
  }
  var CAT_WORD = { striker: 'strikers', midfielder: 'midfielders', winger: 'wingers', defender: 'defenders', keeper: 'the keeper', forward: 'the front three', any: 'any outfield player', bench: 'any outfield player' };

  function byId(id) { return PIECES.filter(function (p) { return p.id === id; })[0] || PLAIN.filter(function (p) { return p.id === id; })[0] || RETIRED.filter(function (p) { return p.id === id; })[0] || null; }
  function inPool(id) { return PIECES.some(function (p) { return p.id === id; }) || PLAIN.some(function (p) { return p.id === id; }); }
  function isPiece(id) { return PIECES.some(function (p) { return p.id === id; }); }
  /* OFFER KEYS: "AR_STEADY" (a tactic or captain piece), "AR_SLALOM@Yamal" (a trait on a man), "UP_YAMAL_PACE" (a plain
   * upgrade), "SIGN@3.1" (a signing: the match it was offered after and its place) */
  function parseKey(key) {
    key = String(key || '');
    if (/^SIGN@\d+\.\d+$/.test(key)) { var m = /^SIGN@(\d+)\.(\d+)$/.exec(key); return { key: key, sign: true, match: +m[1], k: +m[2] }; }
    var at = key.indexOf('@');
    return at > 0 ? { key: key, id: key.slice(0, at), on: key.slice(at + 1) } : { key: key, id: key, on: null };
  }
  function pieceOf(key) { var k = parseKey(key); return k.sign ? null : byId(k.id); }
  function nameOf(id) {
    var d = fxDef(id), it = byId(id);
    if (it && it.kind === 'plain') return it.name;
    if (d && d.name) return String(d.name);
    return it && it.name ? it.name : String(id).replace(/^[A-Z]+_/, '').toLowerCase().replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function cutPieces() { return PIECES.filter(function (p) { var d = fxDef(p.id); return d && d.cut; }).map(function (p) { return p.id; }); }
  /* the plain sentence an offer and the team sheet show */
  function ARlib() { try { return root.KMArchetypes || null; } catch (e) { return null; } }
  function sentence(it, run) {
    if (!it) return '';
    if (it.text) return it.text;
    /* archetypes.js's hover sentence: with Encore owned, a trait it cannot repeat says so */
    var AL = ARlib();
    if (AL && AL.hoverText && /^AR_/.test(it.id) && fxDef(it.id)) {
      var tac = run ? (run.owned || []).filter(function (k) { var p = pieceOf(k); return p && p.kind === 'tactic'; }).map(function (k) { return parseKey(k).id; }) : [];
      var t = AL.hoverText(it.id, { tactics: tac });
      if (t) return String(t);
    }
    if (it.text) return it.text;
    if (it.attr) return it.on + '\'s ' + STAT_NAME[it.attr] + ' goes up by 1 for the rest of the run.';
    var d = fxDef(it.id);
    return d ? String(d.cupText || d.text || nameOf(it.id)) : nameOf(it.id);
  }
  /* archetypes.js marks the pieces that make or read Belief (belief: 'makes' | 'reads'); my list when it is missing */
  function isBeliefPiece(id) { var d = fxDef(id); if (d && /^AR_/.test(id) && d.name) return !!d.belief; return BELIEF_IDS.indexOf(id) >= 0; }

  /* ---------------------------------------------------------------- the squad of the run, without the engine */
  var BASE = null;
  function base() {
    if (BASE) return BASE;
    var W = Wlib(), sq = W ? W.build('spain', 1) : null;
    function m(p, isK) { return { name: p.name, fullName: p.fullName || p.name, role: isK ? 'keeper' : p.role, keeper: !!isK, attrKeys: Object.keys(p.attr || {}) }; }
    BASE = sq ? { keeper: m(sq.keeper, true), players: sq.players.map(function (p) { return m(p); }), bench: sq.bench.map(function (p) { return m(p); }) }
      : { keeper: { name: 'Simón', role: 'keeper', keeper: true, attrKeys: ['reflexes', 'communication', 'distribution', 'physique', 'intelligence'] }, players: [], bench: [] };
    return BASE;
  }
  /* the eleven (in the positions' order, keeper first), the bench, and the run's roster order */
  function rosterOf(run) {
    var B = base();
    var eleven = [B.keeper].concat(B.players).map(function (p) { return { name: p.name, fullName: p.fullName, role: p.role, keeper: p.keeper, attrKeys: p.attrKeys }; });
    var bench = B.bench.map(function (p) { return { name: p.name, fullName: p.fullName, role: p.role, keeper: false, attrKeys: p.attrKeys }; });
    (run.signings || []).forEach(function (s) { bench.push({ name: s.name, fullName: s.fullName, role: s.role, keeper: false, signed: true, attrKeys: STATS.slice() }); });
    (run.swaps || []).forEach(function (sw) {
      var oi = eleven.map(function (p) { return p.name; }).indexOf(sw[0]), bi = bench.map(function (p) { return p.name; }).indexOf(sw[1]);
      if (oi < 0 || bi < 0) return;
      var o = eleven[oi]; eleven[oi] = bench[bi]; bench[bi] = o;
    });
    bench = bench.filter(function (p) { return (run.released || []).indexOf(p.name) < 0; });
    return { eleven: eleven, bench: bench, order: orderOf(run, eleven) };
  }
  /* the roster order: the run's, checked against the eleven (a man no longer in it drops out, a new one goes where
   * the man he replaced was, which swap() already did), else the eleven keeper first, as the team sheet lists them */
  function orderOf(run, eleven) {
    eleven = eleven || rosterOf(run).eleven;
    var names = eleven.map(function (p) { return p.name; });
    var o = (run.order || []).filter(function (n) { return names.indexOf(n) >= 0; });
    names.forEach(function (n) { if (o.indexOf(n) < 0) o.push(n); });
    return o;
  }
  function allNames(run) { var R = rosterOf(run); return R.eleven.concat(R.bench); }
  function manOf(run, name) { return allNames(run).filter(function (p) { return p.name === name; })[0] || null; }

  /* ---------------------------------------------------------------- a new run */
  function newRun(seed, opts) {
    opts = opts || {};
    seed = (seed >>> 0) || 1;
    var r = Rng(mix(seed, 77));
    return {
      v: 2, id: 'cup-' + seed.toString(36) + '-' + (opts.stamp || 0).toString(36), seed: seed,
      match: 1, over: false, champion: false, endless: false,
      clubs: shuffle(CLUBS, r), owned: [], picks: [], results: [], offers: null, acted: {},
      slots: opts.slots || TACTIC_SLOTS, draw: opts.draw || DRAW,
      order: null, swaps: [], signings: [], released: [], releases: [], growth: {}, beliefStat: null, needBelief: false,
      season: { unbeaten: 0, conf: {}, mom: {}, held: {} }, orderLog: []
    };
  }
  function matchSeed(run, i) { return mix(run.seed, 1000 + (i || run.match)) % 100000 + 1; }
  function clubName(run, i) { var k = i < MATCHES ? i - 1 : i - 2; return run.clubs[((k % run.clubs.length) + run.clubs.length) % run.clubs.length]; }
  function effectsOf(run, i) {
    var R = roundOf(i);
    if (BREAK === 'noeffects') return [];
    var r = Rng(mix(run.seed, 5000)), el = shuffle(ELITES, r), bo = shuffle(BOSSES, r);
    if (!R.endless) {
      if (R.elites) return [el[i - 2]];
      if (R.bosses) return [bo[0]];
      return [];
    }
    var r2 = Rng(mix(run.seed, 5000 + i)), e2 = shuffle(ELITES, r2), b2 = shuffle(BOSSES, r2), out = [];
    for (var k = 0; out.length < R.effects && (e2.length || b2.length); k++) {
      var from = (k % 2 === 0 ? b2 : e2).length ? (k % 2 === 0 ? b2 : e2) : (k % 2 === 0 ? e2 : b2);
      out.push(from.shift());
    }
    return out;
  }
  function opponentOf(run, i) {
    i = i || run.match;
    var R = roundOf(i), o = { match: i, round: R.round, shift: BREAK === 'noscale' ? 0 : R.shift, effects: effectsOf(run, i), endless: !!R.endless };
    if (R.team) { o.team = R.team; o.name = 'Argentina'; }
    else { o.name = clubName(run, i); o.clubSeed = mix(run.seed, 500 + i) % 100000 + 1; }
    return o;
  }
  /* an effect's words (opponents.js); a missing one says so rather than showing nothing */
  function effectView(id) {
    var OP = OPlib(), list = [];
    try { list = OP && OP.list ? OP.list() : []; } catch (e) { list = []; }
    var e = list.filter(function (x) { return x.id === id; })[0];
    var tier = ELITES.indexOf(id) >= 0 ? 'elite' : BOSSES.indexOf(id) >= 0 ? 'boss' : null;
    if (!e) return { id: id, name: id, tier: tier, text: '', playAround: '', missing: true };
    return { id: id, name: String(e.name || id), tier: e.tier || tier, text: String(e.text || ''), playAround: String(e.playAround || '') };
  }

  /* ---------------------------------------------------------------- the signings */
  var FIRSTS = ['Adam', 'Bruno', 'Carlos', 'Dani', 'Emil', 'Felix', 'Gabriel', 'Hugo', 'Iker', 'Jonas', 'Kofi', 'Leo', 'Mateo', 'Nico', 'Omar', 'Pablo', 'Rafa', 'Sami', 'Tomás', 'Victor', 'Wesley', 'Yusuf', 'Álex', 'Marco'];
  var LASTS = ['Abbott', 'Barros', 'Calloway', 'Dunne', 'Ekwueme', 'Fenwick', 'Garrido', 'Hale', 'Ibarra', 'Jonsson', 'Kovac', 'Lindqvist', 'Moreau', 'Nkemelu',
    'Okafor', 'Quinlan', 'Rask', 'Salas', 'Thorne', 'Ulloa', 'Varga', 'Whitlock', 'Yilmaz', 'Beltrán', 'Cordero', 'Duarte', 'Esteve', 'Iglesias', 'Montes', 'Prieto'];
  var OUTFIELD = Object.keys(ROLE_SHORT);
  var FALLBACK_PROFILE = { pace: 13, physical: 12, technique: 13, passing: 13, finishing: 10, defending: 10, intelligence: 13 };
  /* the signing offered after match m, place k: a role, the seven numbers (the role's usual numbers, +-2, a step up
   * every two matches), a name nobody in the squad has, and half the time a trait he can hold */
  function signingOf(run, m, k) {
    var r = Rng(mix(run.seed, 7000 + m * 10 + k));
    var role = OUTFIELD[Math.floor(r() * OUTFIELD.length)];
    var A = Alib(), prof = (A && A.PROFILES && A.PROFILES[role]) || FALLBACK_PROFILE, lvl = -1 + Math.floor((m - 1) / 2), attr = {};
    STATS.forEach(function (s) { attr[s] = Math.max(1, Math.min(20, Math.round(prof[s] + lvl + Math.floor(r() * 5) - 2))); });
    var taken = allNames(run).map(function (p) { return p.name; }).concat(base().keeper ? [base().keeper.name] : []);
    var last = shuffle(LASTS, r).filter(function (n) { return taken.indexOf(n) < 0; })[0] || ('Nuevo' + m + k);
    var firstN = FIRSTS[Math.floor(r() * FIRSTS.length)];
    var trait = null;
    if (r() < 0.5) {
      var can = AR.filter(function (p) { return p.kind === 'trait' && p.holder !== 'keeper' && canHold(p.holder, { role: role }); });
      if (can.length) trait = can[Math.floor(r() * can.length)].id;
    }
    var h = 1.70 + Math.floor(r() * 26) / 100;
    return { name: last, fullName: firstN + ' ' + last, role: role, attr: attr, heightM: h, trait: trait, match: m };
  }
  function signingFor(run, key) { var k = parseKey(key); return k.sign ? signingOf(run, k.match, k.k) : null; }

  /* ---------------------------------------------------------------- the squads for match i */
  /* libs: { W, C, M, NM }. Spain with the signings on the bench, the released men gone, the bench men put in the
   * eleven, the plain upgrades and the growth; the opponent scaled for its round. */
  function squads(run, libs, i) {
    i = i || run.match;
    var seed = matchSeed(run, i), o = opponentOf(run, i);
    var you = libs.W.build('spain', seed), them;
    var RL = (libs.C && libs.C.ROLES) || {};
    (run.signings || []).forEach(function (s, n) {
      if (BREAK === 'nosign') return;
      var wpf = ROLE_WPF[s.role] || [5, 5, 5];
      you.bench.push({ id: 'k5-sign-' + (n + 1), name: s.name, fullName: s.fullName, number: 30 + n, role: s.role, short: ROLE_SHORT[s.role] || '',
        homeLine: ROLE_LINE[s.role], win: (RL[s.role] || {}).w || wpf[0], prog: (RL[s.role] || {}).p || wpf[1], fin: (RL[s.role] || {}).f || wpf[2],
        keywords: [], line: null, slot: null, attr: JSON.parse(JSON.stringify(s.attr)), heightM: s.heightM,
        height: s.heightM >= 1.88 ? 'tall' : s.heightM <= 1.75 ? 'short' : 'average', limb: 'human', form: 0,
        person: { nerve: 'steady', drive: 'steady', loyalty: 'neutral' }, pos: ROLE_SHORT[s.role] || '', kw: [], signed: true });
    });
    (run.swaps || []).forEach(function (sw) {
      var oi = you.players.map(function (p) { return p.name; }).indexOf(sw[0]), bi = you.bench.map(function (p) { return p.name; }).indexOf(sw[1]);
      if (oi < 0 || bi < 0) return;
      var s = you.players[oi], b = you.bench[bi];
      b.line = s.line; b.slot = s.slot; s.line = null; s.slot = null;
      you.players[oi] = b; you.bench[bi] = s;
    });
    if (BREAK !== 'norelease') you.bench = you.bench.filter(function (p) { return (run.released || []).indexOf(p.name) < 0; });
    if (libs.NM && libs.NM.setPos) libs.NM.setPos(you);
    if (o.team) {
      them = libs.W.build(o.team, seed);
      if (o.shift) shiftSquad(them, o.shift);
    } else {
      var C = libs.C, cs = o.clubSeed;
      them = libs.M.attach(C.makeSquad(new C.RNG(cs * 7 + 11), { club: o.name }), cs * 7 + 11);
      if (o.shift) shiftSquad(them, o.shift);
      var dd = libs.NM && libs.NM.dedupe ? libs.NM.dedupe : C.dedupeNames;
      if (dd) dd([you, them], new C.RNG(seed + 1));
    }
    upgrade(you, run);
    return { you: you, them: them, seed: seed, opp: o };
  }
  /* +shift to every number of their eleven and keeper, 1 to 20 (the scale of a club's numbers; st4's rule) */
  function shiftSquad(sq, shift) {
    sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).forEach(function (p) {
      Object.keys(p.attr || {}).forEach(function (k) { if (typeof p.attr[k] === 'number') p.attr[k] = Math.max(1, Math.min(20, p.attr[k] + shift)); });
    });
  }
  function findMan(sq, name) {
    var all = sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []);
    return all.filter(function (p) { return p.name === name; })[0] || all.filter(function (p) { return first(p.name) === name; })[0] || null;
  }
  /* the plain upgrades (+1, up to 20 as st4) and the growth of the run (Competitive spirit, Sold for a fee: no cap,
   * ruling 1; DECISIONS-R 12) */
  function upgrade(sq, run) {
    run.owned.forEach(function (key) {
      var u = pieceOf(key);
      if (!u || u.kind !== 'plain' || !u.attr) return;
      var p = findMan(sq, u.on);
      if (p && p.attr && typeof p.attr[u.attr] === 'number') p.attr[u.attr] = Math.min(20, p.attr[u.attr] + 1);
    });
    Object.keys(run.growth || {}).forEach(function (name) {
      var p = findMan(sq, name), g = run.growth[name];
      if (!p || !p.attr) return;
      Object.keys(g).forEach(function (k) { if (typeof p.attr[k] === 'number') p.attr[k] += g[k]; });
    });
  }
  function extraSubs(run) { return run.owned.filter(function (key) { var u = pieceOf(key); return u && u.subs; }).length; }
  function owns(run, id) { return run.owned.some(function (key) { return parseKey(key).id === id; }); }
  function ownedPieces(run) { return run.owned.filter(function (key) { var k = parseKey(key); return !k.sign && isPiece(k.id); }); }

  /* the engine build for the pieces owned (null with none: the plain squad, exactly as st4). you: the squad of
   * this match (squads().you), for the bench names; without it the run's own roster is used. */
  function buildOf(run, you) {
    var own = ownedPieces(run);
    if (!own.length) return null;
    var b = { id: 'cup-run', name: 'Your cup team', engine: '', base: 'spain', slots: Math.max(3, run.slots), tactics: [], players: [], captain: CAPTAIN };
    var men = {};
    Object.keys(ROLES).forEach(function (n) {
      var roles = ROLES[n].slice();
      if (n === 'Olmo' && owns(run, 'D_NO_STRIKER')) roles = roles.filter(function (r) { return r !== 'finisher'; });
      men[n] = { name: n, roles: roles, traits: [] };
    });
    own.forEach(function (key) {
      var k = parseKey(key), p = byId(k.id);
      if (p.kind === 'tactic') b.tactics.push(k.id);
      else if (p.kind === 'captain') b.captain = { name: CAPTAIN, component: k.id };
      else { var on = k.on || p.on; if (!men[on]) men[on] = { name: on, roles: [], traits: [] }; men[on].traits.push(k.id); }
    });
    var R = rosterOf(run), present = R.eleven.concat(R.bench).map(function (p) { return p.name; });
    Object.keys(men).forEach(function (n) {
      var m = men[n];
      if (present.indexOf(n) < 0) return;          /* a released man's roles and traits go with him */
      if (!m.traits.length) delete m.traits;
      b.players.push(m);
    });
    if (BREAK !== 'order') b.order = R.order.slice();
    if (run.beliefStat && BREAK !== 'belief') b.beliefStat = run.beliefStat;
    if (BREAK !== 'runstate') b.run = runStateOf(run);
    b.bench = you ? you.bench.map(function (p) { return p.name; }) : R.bench.map(function (p) { return p.name; });
    return b;
  }
  /* build.run: { match, unbeaten, players: { name: { confidence, momentum } } } (the contract with Helper E) */
  function runStateOf(run) {
    var S = run.season || { unbeaten: 0, conf: {}, mom: {} }, players = {};
    Object.keys(S.conf || {}).concat(Object.keys(S.mom || {})).forEach(function (n) {
      players[n] = { confidence: (S.conf || {})[n] || 0, momentum: (S.mom || {})[n] || 0 };
    });
    return { match: run.match, unbeaten: S.unbeaten || 0, players: players };
  }
  /* the opponent's build: only its effects (null in round 1) */
  function oppBuildOf(run, builds, i) {
    var o = opponentOf(run, i);
    if (!o.effects.length) return null;
    return { id: 'cup-opp', name: o.name, engine: '', effects: o.effects.slice() };
  }

  /* ---------------------------------------------------------------- the offers */
  /* three distinct offers nobody owns: two pieces, and a third that is a signing 40% of the time, a plain upgrade
   * 30%, a piece 30%; plain upgrades and signings fill in when the pieces run out. A trait goes on a man who can hold
   * it (the eleven; Benchwarmer on a bench man), chosen from the run's seed. */
  function holderFor(run, p, r) {
    if (p.on) return manOf(run, p.on) ? p.on : null;
    var R = rosterOf(run), pool = p.holder === 'bench' ? R.bench : R.eleven;
    if (p.holder === 'bench' && !pool.length) pool = R.eleven;
    var can = pool.filter(function (m) { return (p.holder === 'bench' || BREAK === 'anyholder' || canHold(p.holder, m)) && run.owned.indexOf(p.id + '@' + m.name) < 0; });
    if (BREAK === 'anyholder') can = R.eleven.filter(function (m) { return run.owned.indexOf(p.id + '@' + m.name) < 0; });
    if (!can.length) return null;
    return can[Math.floor(r() * can.length)].name;
  }
  function drawOffers(run) {
    if (run.offers && run.offers.match === run.match) return run.offers.list;
    var r = Rng(mix(run.seed, 3000 + run.match));
    var cut = cutPieces();
    var pieces = [];
    shuffle(PIECES, r).forEach(function (p) {
      if (cut.indexOf(p.id) >= 0) return;
      if (p.kind === 'trait') {
        var on = holderFor(run, p, r);
        if (!on) return;
        var key = p.id + '@' + on;
        if (BREAK !== 'repeat' && run.owned.indexOf(key) >= 0) return;
        pieces.push(key);
      } else if (BREAK === 'repeat' || run.owned.indexOf(p.id) < 0) pieces.push(p.id);
    });
    var plain = shuffle(PLAIN.filter(function (p) { return run.owned.indexOf(p.id) < 0 && (!p.on || manOf(run, p.on)); }), r).map(function (p) { return p.id; });
    var list = pieces.slice(0, 2), x = r(), sign = 'SIGN@' + run.match + '.' + 1;
    if (x < 0.4) list.push(sign);
    else if (x < 0.7 && plain.length) list.push(plain.shift());
    else if (pieces.length > 2) list.push(pieces[2]);
    var n = 3;
    while (list.length < 3 && plain.length) list.push(plain.shift());
    while (list.length < 3 && pieces.length > n - 1) { if (list.indexOf(pieces[n - 1]) < 0) list.push(pieces[n - 1]); n++; }
    while (list.length < 3) list.push('SIGN@' + run.match + '.' + (list.length + 2));
    list = shuffle(list, r);
    run.offers = { match: run.match, list: list };
    return list;
  }
  var ROLE_WORD = { 'centre-back': 'Centre-back', 'ball-playing-defender': 'Centre-back who passes it out', 'full-back': 'Full-back', 'wing-back': 'Wing-back',
    'ball-winner': 'Midfielder who wins the ball', 'deep-lying-playmaker': 'Midfielder who passes from deep', 'box-to-box': 'Midfielder who covers both boxes',
    'advanced-playmaker': 'Attacking midfielder', 'winger': 'Winger', 'inside-forward': 'Forward who cuts inside', 'target-forward': 'Tall striker', 'poacher': 'Striker' };
  function statLine(attr) { return STATS.map(function (s) { return STAT_NAME[s] + ' ' + attr[s]; }).join(', '); }
  /* what an offer says: its name, who it goes on, one sentence, and what it replaces. Nothing else. */
  function offerView(run, key) {
    var k = parseKey(key);
    if (k.sign) {
      var s = signingFor(run, key), line = ['a defender', 'a midfielder', 'a forward'][ROLE_LINE[s.role]] || 'a player';
      var t = ROLE_WORD[s.role] + ' (' + line + '). ' + statLine(s.attr) + '. He joins your bench.';
      if (s.trait) t += ' He comes with a trait, ' + nameOf(s.trait) + ': ' + sentence(byId(s.trait));
      return { id: key, piece: null, name: 'Sign ' + s.fullName, kind: 'signing', on: s.name, where: 'A new player', text: t,
        signing: { name: s.name, fullName: s.fullName, role: s.role, attr: s.attr, trait: s.trait } };
    }
    var it = byId(k.id);
    var on = k.on || it.on || null;
    var v = { id: key, piece: k.id, name: nameOf(k.id), kind: it.kind === 'plain' ? 'upgrade' : it.kind, on: on, text: sentence(it, run) };
    v.where = it.kind === 'tactic' ? 'A tactic' : it.kind === 'captain' ? 'Captain ' + it.on : on ? 'On ' + on : 'The whole team';
    var rep = replaces(run, key);
    if (rep) v.replaces = { id: rep, name: nameOf(parseKey(rep).id), why: it.kind === 'captain' ? 'you can have one captain piece' : 'you have ' + run.slots + ' tactic slots' };
    if (BREAK === 'family' && it.fam) v.family = 'Family ' + it.fam;
    return v;
  }
  function replaces(run, key) {
    var it = pieceOf(key); if (!it) return null;
    if (it.kind === 'captain') return run.owned.filter(function (x) { var p = pieceOf(x); return p && p.kind === 'captain'; })[0] || null;
    if (it.kind === 'tactic') {
      var tac = run.owned.filter(function (x) { var p = pieceOf(x); return p && p.kind === 'tactic'; });
      return tac.length >= run.slots && BREAK !== 'slots' ? tac[0] : null;
    }
    return null;
  }
  /* a random number of each of the man's own (the keeper's five, an outfield man's seven) */
  function spiritRoll(run, r) {
    var out = [];
    allNames(run).forEach(function (p) {
      var keys = p.attrKeys && p.attrKeys.length ? p.attrKeys : STATS;
      var s = keys[Math.floor(r() * keys.length)];
      out.push({ name: p.name, stat: s });
    });
    return out;
  }
  function grow(run, name, stat, n) { var g = run.growth[name] || (run.growth[name] = {}); g[stat] = (g[stat] || 0) + n; }
  function pick(run, key) {
    var list = drawOffers(run);
    if (list.indexOf(key) < 0) throw new Error('cup: ' + key + ' was not offered');
    var k = parseKey(key), rec = { match: run.match, id: key, name: offerView(run, key).name, on: null, replaced: null, offered: list.slice() };
    if (k.sign) {
      var s = signingFor(run, key);
      run.signings.push(s);
      rec.on = s.name; rec.signing = { name: s.name, fullName: s.fullName, role: s.role, attr: s.attr, trait: s.trait };
      if (s.trait) run.owned.push(s.trait + '@' + s.name);
      /* Competitive spirit: every player +1 to a random number of his, for the rest of the run */
      if (owns(run, 'AR_COMPETITIVE_SPIRIT') && BREAK !== 'spirit') {
        /* Captain's shadow doubles the captain's effect: one more roll for each (archetypes.js captainTimes) */
        var times = 1 + run.owned.filter(function (x) { return parseKey(x).id === 'AR_CAPTAINS_SHADOW'; }).length, rs = Rng(mix(run.seed, 9000 + run.match));
        rec.spiritTimes = times; rec.spirit = [];
        for (var tt = 0; tt < times; tt++) rec.spirit = rec.spirit.concat(spiritRoll(run, rs));
        rec.spirit.forEach(function (x) { grow(run, x.name, x.stat, 1); });
      }
    } else {
      var rep = replaces(run, key);
      if (rep) run.owned = run.owned.filter(function (x) { return x !== rep; });
      run.owned.push(key);
      rec.on = k.on || byId(k.id).on || null; rec.replaced = rep || null;
      if (isBeliefPiece(k.id) && !run.beliefStat) run.needBelief = true;
    }
    if (rec.signing && rec.signing.trait && isBeliefPiece(rec.signing.trait) && !run.beliefStat) run.needBelief = true;
    run.picks.push(rec);
    run.offers = null;
    run.match++;
    return { replaced: rec.replaced, needBelief: run.needBelief, spirit: rec.spirit || null };
  }
  /* the Belief question: asked once, the first time a piece that makes or reads Belief is picked */
  function chooseBelief(run, stat) {
    if (STATS.indexOf(stat) < 0) throw new Error('cup: no stat called ' + stat);
    if (!run.needBelief && BREAK !== 'belief') throw new Error('cup: Belief was not asked for');
    run.beliefStat = stat; run.needBelief = false;
    return stat;
  }

  /* ---------------------------------------------------------------- between matches: the team sheet */
  function moveOrder(run, name, dir) {
    var o = orderOf(run), i = o.indexOf(name), j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= o.length) return false;
    var t = o[i]; o[i] = o[j]; o[j] = t;
    run.order = o;
    run.orderLog.push({ match: run.match, name: name, dir: dir < 0 ? 'up' : 'down' });
    return true;
  }
  /* a bench man into the eleven, in a starter's place in the same line (st4's rule on the team sheet); never the
   * captain, never the keeper (there is no keeper on the bench) */
  function swapRefusal(run, outName, inName) {
    var R = rosterOf(run), o = R.eleven.filter(function (p) { return p.name === outName; })[0], b = R.bench.filter(function (p) { return p.name === inName; })[0];
    if (!o) return outName + ' is not in the eleven.';
    if (!b) return inName + ' is not on the bench.';
    if (o.keeper) return 'Only a keeper can replace the keeper, and there is none on the bench.';
    if (o.name === CAPTAIN) return CAPTAIN + ' is the captain and stays in the eleven.';
    if (ROLE_LINE[o.role] !== ROLE_LINE[b.role]) return inName + ' plays in ' + ['defence', 'midfield', 'attack'][ROLE_LINE[b.role]] + ', and ' + outName + '\'s place is in ' + ['defence', 'midfield', 'attack'][ROLE_LINE[o.role]] + '.';
    return null;
  }
  function swapIn(run, outName, inName) {
    var why = swapRefusal(run, outName, inName);
    if (why) return why;
    var o = orderOf(run);
    run.swaps.push([outName, inName]);
    o[o.indexOf(outName)] = inName;
    run.order = o;
    return null;
  }
  function canRelease(run) {
    if (!owns(run, 'AR_SOLD_FOR_A_FEE')) return false;
    if (SELLCAP === '1' && run.releases.some(function (x) { return x.match === run.match; })) return false;
    return true;
  }
  function releaseRefusal(run, name) {
    if (!canRelease(run)) return 'Releasing a player needs Sold for a fee' + (SELLCAP === '1' ? ', once between matches' : '') + '.';
    var R = rosterOf(run);
    if (!R.bench.some(function (p) { return p.name === name; })) return name + ' is not on the bench: only a man on the bench can be released.';
    return null;
  }
  /* Sold for a fee: the man leaves the squad (his traits go with him); the captain gets +1 to all his numbers */
  function release(run, name) {
    var why = releaseRefusal(run, name);
    if (why) return why;
    run.released.push(name);
    var gone = run.owned.filter(function (key) { return parseKey(key).on === name; });
    run.owned = run.owned.filter(function (key) { return parseKey(key).on !== name; });
    var cap = base().players.filter(function (p) { return p.name === CAPTAIN; })[0];
    (cap && cap.attrKeys.length ? cap.attrKeys : STATS).forEach(function (s) { grow(run, CAPTAIN, s, 1); });
    run.releases.push({ match: run.match, name: name, traitsLost: gone });
    return null;
  }
  /* after winning the cup: "Keep going" */
  function keepGoing(run) {
    if (!run.over || !run.champion || run.endless) throw new Error('cup: endless starts only after winning the cup');
    if (BREAK === 'endless') return false;
    run.endless = true; run.over = false;
    return true;
  }

  /* ---------------------------------------------------------------- after a match */
  /* score, acted (piece name -> decisions it acted on), report (X.runReport(match): players' starts, full matches,
   * substitutions off, Momentum; lost; pieces fired). Returns 'next' (offers), 'champion' or 'out'. */
  function record(run, score, acted, report) {
    var i = run.match, won = score.you > score.them, drew = score.you === score.them;
    var through = won || (drew && run.draw === 'through');
    var o = opponentOf(run, i);
    run.results.push({ match: i, round: o.round, opp: o.name, effects: o.effects.slice(), shift: o.shift, you: score.you, them: score.them,
      result: won ? 'won' : drew ? 'drew' : 'lost', through: through, owned: run.owned.slice() });
    Object.keys(acted || {}).forEach(function (k) { run.acted[k] = (run.acted[k] || 0) + acted[k]; });
    seasonAfter(run, report, !won && !drew);
    if (!through) { run.over = true; return 'out'; }
    if (!run.endless && i >= MATCHES) { run.over = true; run.champion = true; return 'champion'; }
    return 'next';
  }
  function repFor(report, name) {
    var P = (report && report.players) || {};
    return P[name] || P[first(name)] || Object.keys(P).filter(function (k) { return first(k) === first(name); }).map(function (k) { return P[k]; })[0] || null;
  }
  /* Unbeaten run: matches in a row without a loss while it is held (or every match: ?seasoncount=all); a loss
   * resets it. Confidence (held): +1 for a full match, all of it lost if he does not start or is taken off.
   * Momentum (held): what the match left him with (the engine carries it through the match). */
  function seasonAfter(run, report, lost) {
    var S = run.season;
    if (BREAK === 'runstate') return;
    if (lost) S.unbeaten = 0;
    else if (SEASON === 'all' || owns(run, 'AR_UNBEATEN_RUN')) S.unbeaten = (S.unbeaten || 0) + 1;
    run.owned.forEach(function (key) {
      var k = parseKey(key);
      if (!k.on) return;
      var rp = repFor(report, k.on);
      if (k.id === 'AR_CONFIDENCE') {
        if (!rp || !rp.started || rp.subbedOff) S.conf[k.on] = 0;
        else if (rp.fullMatch) S.conf[k.on] = (S.conf[k.on] || 0) + 1;
      }
      if (k.id === 'AR_MOMENTUM') S.mom[k.on] = rp && typeof rp.momentum === 'number' ? rp.momentum : (S.mom[k.on] || 0);
    });
  }
  /* decisions each piece acted on in one match: the engine's own count (X.runReport pieces) when there is one,
   * else a line of its own in the match log, as the build panel counts */
  function actedIn(st, report) {
    var out = {};
    if (report && report.pieces) {
      Object.keys(report.pieces).forEach(function (id) { if (isPiece(id) && report.pieces[id] > 0) out[nameOf(id)] = (out[nameOf(id)] || 0) + report.pieces[id]; });
      return out;
    }
    if (!st || !st.fx) return out;
    var names = PIECES.map(function (p) { return nameOf(p.id); }), seen = {};
    (st.fx.log || []).forEach(function (l) {
      if (!l || !l.source || (l.side && l.side === 'them')) return;
      var name = String(l.source).replace(/ \([^()]*\)$/, '');
      if (names.indexOf(name) < 0) return;
      var k = name + '@' + l.at;
      if (seen[k]) return; seen[k] = 1;
      out[name] = (out[name] || 0) + 1;
    });
    return out;
  }
  function summary(run) {
    var mostActed = Object.keys(run.acted).map(function (k) { return { name: k, n: run.acted[k] }; })
      .sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    var last = run.results[run.results.length - 1] || null;
    return { champion: run.champion, endless: run.endless, reached: run.results.length, of: MATCHES, last: last, results: run.results.slice(),
      picks: run.picks.map(function (p) { return { match: p.match, name: p.name, on: p.on, replaced: p.replaced ? nameOf(parseKey(p.replaced).id) : null }; }),
      mostActed: mostActed, beliefStat: run.beliefStat, signings: run.signings.map(function (s) { return s.fullName; }), released: run.released.slice(),
      neverActed: ownedPieces(run).map(function (key) { return nameOf(parseKey(key).id); }).filter(function (n, i, a) { return a.indexOf(n) === i && !run.acted[n]; }) };
  }

  /* ---------------------------------------------------------------- telemetry */
  function telStart(run) {
    var o = opponentOf(run), R = rosterOf(run);
    return { cupRun: run.id, match: run.match, of: MATCHES, endless: run.endless, round: o.round, opp: o.name, oppShift: o.shift, oppEffects: o.effects.slice(),
      owned: run.owned.slice(), pieces: ownedPieces(run), upgrades: run.owned.filter(function (x) { var p = pieceOf(x); return p && p.kind === 'plain'; }), draw: run.draw,
      order: R.order.slice(), bench: R.bench.map(function (p) { return p.name; }), beliefStat: run.beliefStat, run: runStateOf(run),
      signings: run.signings.map(function (s) { return s.name; }), released: run.released.slice(), growth: JSON.parse(JSON.stringify(run.growth)) };
  }
  function telOffer(run) {
    var list = drawOffers(run);
    return { cupRun: run.id, match: run.match - 0, owned: run.owned.slice(),
      offers: BREAK === 'tel' ? [] : list.map(function (id) { var v = offerView(run, id); var r = { id: id, name: v.name, on: v.on, kind: v.kind, piece: v.piece || null, replaces: v.replaces ? v.replaces.id : null }; if (v.signing) r.signing = v.signing; return r; }) };
  }
  function telPick(run, id, before) {
    var p = run.picks[run.picks.length - 1] || {};
    return { cupRun: run.id, match: before, pick: id, offered: p.offered || [], replaced: p.replaced || null, owned: run.owned.slice(),
      signing: p.signing || null, spirit: p.spirit || null, askBelief: !!run.needBelief };
  }
  function telResult(run) {
    var r = run.results[run.results.length - 1];
    return { cupRun: run.id, match: r.match, you: r.you, them: r.them, result: r.result, through: r.through, over: run.over, champion: run.champion, endless: run.endless,
      owned: r.owned, oppEffects: r.effects, run: runStateOf(run) };
  }
  function telBelief(run) { return { cupRun: run.id, match: run.match, stat: run.beliefStat }; }
  function telOrder(run, what) { return { cupRun: run.id, match: run.match, what: what || null, order: orderOf(run) }; }
  function telRelease(run) { var x = run.releases[run.releases.length - 1] || {}; return { cupRun: run.id, match: run.match, name: x.name || null, traitsLost: x.traitsLost || [], captain: CAPTAIN, growth: JSON.parse(JSON.stringify(run.growth[CAPTAIN] || {})) }; }
  function telKeepGoing(run) { return { cupRun: run.id, match: run.match, endless: run.endless }; }

  /* ---------------------------------------------------------------- the saved run */
  /* st4 (Codex review of st4, item 3): A SAVED RUN IS CHECKED BEFORE IT IS USED. Every field the screens read, with
   * its type and range, and that the parts agree. Anything else is not a run: the page puts it aside. */
  function isInt(n, a, b) { return typeof n === 'number' && n === Math.floor(n) && n >= a && n <= b; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function validKey(key) { var k = parseKey(key); return k.sign ? true : inPool(k.id) && (!k.on || typeof k.on === 'string'); }
  function validRun(r) {
    try {
      if (BREAK === 'novalidate') return !!r && r.v === 2 && !!r.seed;
      if (!isObj(r) || r.v !== 2) return false;
      if (!isInt(r.seed, 1, 4294967295) || typeof r.id !== 'string' || !r.id) return false;
      if (!isInt(r.match, 1, MAX_MATCH) || typeof r.over !== 'boolean' || typeof r.champion !== 'boolean' || typeof r.endless !== 'boolean') return false;
      if (!r.endless && r.match > MATCHES) return false;
      if (!isInt(r.slots, 1, 5) || (r.draw !== 'out' && r.draw !== 'through')) return false;
      if (!Array.isArray(r.clubs) || r.clubs.length !== CLUBS.length || r.clubs.some(function (c) { return CLUBS.indexOf(c) < 0; })) return false;
      if (!Array.isArray(r.owned) || r.owned.some(function (id, i) { return typeof id !== 'string' || !validKey(id) || r.owned.indexOf(id) !== i; })) return false;
      if (!isObj(r.acted) || Object.keys(r.acted).some(function (k) { return !isInt(r.acted[k], 0, 1e6); })) return false;
      if (!Array.isArray(r.results) || r.results.length > MAX_MATCH) return false;
      var badRes = r.results.some(function (x, i) {
        return !isObj(x) || x.match !== i + 1 || !isInt(x.you, 0, 99) || !isInt(x.them, 0, 99) || ['won', 'drew', 'lost'].indexOf(x.result) < 0 ||
          typeof x.through !== 'boolean' || typeof x.opp !== 'string' || typeof x.round !== 'string';
      });
      if (badRes) return false;
      if (!Array.isArray(r.picks) || r.picks.some(function (p, i) { return !isObj(p) || !validKey(p.id) || p.match !== i + 1 || !Array.isArray(p.offered); })) return false;
      if (!Array.isArray(r.swaps) || r.swaps.some(function (s) { return !Array.isArray(s) || s.length !== 2 || typeof s[0] !== 'string' || typeof s[1] !== 'string'; })) return false;
      if (!Array.isArray(r.signings) || r.signings.some(function (s) { return !isObj(s) || typeof s.name !== 'string' || !s.name || !ROLE_SHORT[s.role] || !isObj(s.attr) || STATS.some(function (k) { return !isInt(s.attr[k], 1, 20); }); })) return false;
      if (!Array.isArray(r.released) || r.released.some(function (n) { return typeof n !== 'string'; })) return false;
      if (!Array.isArray(r.releases) || !Array.isArray(r.orderLog)) return false;
      if (r.order !== null && (!Array.isArray(r.order) || r.order.some(function (n) { return typeof n !== 'string'; }))) return false;
      if (!isObj(r.growth) || Object.keys(r.growth).some(function (n) { return !isObj(r.growth[n]) || Object.keys(r.growth[n]).some(function (k) { return !isInt(r.growth[n][k], 0, 999); }); })) return false;
      if (r.beliefStat !== null && STATS.indexOf(r.beliefStat) < 0) return false;
      if (typeof r.needBelief !== 'boolean' || (r.needBelief && r.beliefStat !== null)) return false;
      var S = r.season;
      if (!isObj(S) || !isInt(S.unbeaten, 0, MAX_MATCH) || !isObj(S.conf) || !isObj(S.mom)) return false;
      if (Object.keys(S.conf).some(function (k) { return !isInt(S.conf[k], 0, MAX_MATCH); }) || Object.keys(S.mom).some(function (k) { return !isInt(S.mom[k], 0, 1e5); })) return false;
      /* the parts agree: before match m there are m-1 results and m-1 picks; after it (the offer) m results */
      var n = r.results.length;
      if (r.picks.length !== r.match - 1) return false;
      if (n !== r.match - 1 && n !== r.match) return false;
      if (r.results.slice(0, r.match - 1).some(function (x) { return !x.through; })) return false;
      var last = r.results[n - 1];
      var endedCup = n === MATCHES && last && last.through && !r.endless;
      if (r.over !== (n === r.match && (!last.through || endedCup))) return false;
      if (r.champion !== (n >= MATCHES && r.results.slice(0, MATCHES).every(function (x) { return x.through; }))) return false;
      if (r.endless && !r.champion) return false;
      if (r.needBelief && n === r.match) return false;
      if (r.offers !== null && r.offers !== undefined && (!isObj(r.offers) || r.offers.match !== r.match || !Array.isArray(r.offers.list) ||
        r.offers.list.length !== 3 || r.offers.list.some(function (id) { return !validKey(id); }))) return false;
      return true;
    } catch (e) { return false; }
  }
  /* where a run stands: 'sheet' (the next match to play), 'belief' (the Belief question), 'offer' (a win not yet
   * paid out) or 'over' */
  function phaseOf(r) { return r.over ? 'over' : r.results.length >= r.match ? 'offer' : r.needBelief ? 'belief' : 'sheet'; }
  /* before a result, a pick or a sheet change is saved: the run in storage must still be this run, at this match, in
   * this phase (another tab may have played on). stored: what storage holds now (null when empty or unreadable). */
  function guard(stored, run) {
    if (BREAK === 'noguard' || !stored) return 'ok';
    return stored.id === run.id && stored.match === run.match && phaseOf(stored) === phaseOf(run) && stored.endless === run.endless ? 'ok' : 'conflict';
  }

  var API = { validRun: validRun, phaseOf: phaseOf, guard: guard, PIECES: PIECES, PLAIN: PLAIN, AR: AR, REDIRECT: REDIRECT, ELITES: ELITES, BOSSES: BOSSES,
    MATCHES: MATCHES, TACTIC_SLOTS: TACTIC_SLOTS, DRAW: DRAW, BREAK: BREAK, SEASON: SEASON, SELLCAP: SELLCAP, STATS: STATS, STAT_LINES: STAT_LINES, STAT_NAME: STAT_NAME,
    CAPTAIN: CAPTAIN, BELIEF_IDS: BELIEF_IDS, CAT_WORD: CAT_WORD, ROLE_LINE: ROLE_LINE, ROLE_WORD: ROLE_WORD,
    newRun: newRun, roundOf: roundOf, opponentOf: opponentOf, effectsOf: effectsOf, effectView: effectView, matchSeed: matchSeed, squads: squads, buildOf: buildOf,
    oppBuildOf: oppBuildOf, runStateOf: runStateOf, rosterOf: rosterOf, orderOf: orderOf, catOf: catOf, canHold: canHold, signingOf: signingOf, signingFor: signingFor,
    extraSubs: extraSubs, drawOffers: drawOffers, offerView: offerView, replaces: replaces, pick: pick, chooseBelief: chooseBelief, isBeliefPiece: isBeliefPiece,
    moveOrder: moveOrder, swapIn: swapIn, swapRefusal: swapRefusal, canRelease: canRelease, releaseRefusal: releaseRefusal, release: release, keepGoing: keepGoing,
    record: record, actedIn: actedIn, summary: summary, byId: byId, isPiece: isPiece, parseKey: parseKey, pieceOf: pieceOf, nameOf: nameOf, owns: owns,
    ownedPieces: ownedPieces, sentence: sentence, cutPieces: cutPieces, statLine: statLine,
    telStart: telStart, telOffer: telOffer, telPick: telPick, telResult: telResult, telBelief: telBelief, telOrder: telOrder, telRelease: telRelease, telKeepGoing: telKeepGoing,
    setFX: function (FX) { FXREG = FX; } };
  root.KMCup = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
