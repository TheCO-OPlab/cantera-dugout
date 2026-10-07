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
  /* kmtree5 a11 (helper G13, DECISIONS-G13.md): CONFIDENCE COUNTS FROM MATCH 1 OF THE RUN. The trait says "+1 to all
   * his stats for each full match he has played in this run", and a10 counted only from the match it was held. With
   * `conf` on (the default) the full matches in a row are counted for every man of the squad from match 1
   * (season.full), and a man who is given Confidence has his count at once. One more item of a11's gameplay switch
   * (effects.js reads skin and drop; this file is the only one that asks for conf, so it reads it here, by the same
   * rules): node KM_G11=none, KM_G11=skin,drop (only those, so conf off), KM_G11_OFF=conf; page ?g11=none,
   * ?g11off=conf. Off: a10's count, exactly. */
  var CONF = (function () {
    var on = true;
    function only(v) { if (typeof v !== 'string' || v === '') return; on = v.split(',').indexOf('conf') >= 0; }
    function off(v) { if (String(v || '').split(',').indexOf('conf') >= 0) on = false; }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_G11); off(process.env.KM_G11_OFF); } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]g11=([\w,]+)/.exec(qs), m2 = /[?&]g11off=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    return on;
  })();
  /* kmtree5 a11 (stream TRT, HANDOVER-TRT.md): the trait fixes this file makes, read by effects.js's rules for its
   * switch t11 (node KM_T11, KM_T11_OFF; page ?t11, ?t11off), all on by default:
   *   unbeaten  Unbeaten run counts every match of the run (a10/a11: only the matches it was held)
   *   shadow    Captain's shadow doubles Competitive spirit only when he is in the eleven (a11: on the bench too)
   *   shadow2   two shadows still make it twice (a11: one more roll for each shadow)
   *   sold      Sold for a fee releases a man of the eleven too (never the captain or the keeper); a bench man of his
   *             line takes his place (a11: bench men only) */
  var T11 = (function () {
    var items = ['unbeaten', 'shadow', 'shadow2', 'slalom', 'sold', 'join', 'encore', 'sense', 'skin1', 'noquick', 'understudy', 'circ'], on = {};
    items.forEach(function (k) { on[k] = true; });
    function only(v) { if (typeof v !== 'string' || v === '') return; items.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
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

  /* ---- K1 (cup1, 2026-10-05): THE 7-MATCH CUP, his rulings of 10-02 (codex-cup/PLAN-cup-v1.md, MONDAY-10-05.md D):
   * three group matches on points, then round of 16, quarter-final, semi-final, final; an offer after every recorded
   * match; a drawn knockout match goes to overtime (one chance each) and then penalties. ON by default. Switch: node
   * KM_CUPFMT=4, page ?cupfmt=4: a11's 4-match cup exactly (k1_same.js proves it cup for cup). The code of the 7-match
   * Cup is the block "K1: THE 7-MATCH CUP" below; the old functions only hand over to it when FMT is 7.
   * KM_CUPLAST / ?cuplast=skip: no offer after the match that ends the run (default: an offer after EVERY match, his
   * words; DECISIONS-K1.md item 3). */
  var FMT = param('KM_CUPFMT', 'cupfmt', '7') === '4' ? 4 : 7;
  /* kmtree5 a12 (stream GAME3b, HANDOVER-G3B.md): EDUARDO'S CUP RULINGS OF 10-05 (MONDAY J6, J8, J11), read by
   * effects.js's rules for its switch g3b (node KM_G3B, KM_G3B_OFF; page ?g3b, ?g3boff), all ON by default and all OFF
   * in a11's 4-match cup (FMT 4), so KM_CUPFMT=4 still plays a11's cup exactly:
   *   nolast     no pick after the match that ends the run; after winning the final the pick comes with "Keep going"
   *              (this is K1's ?cuplast=skip made the default; KM_CUPLAST=offer / ?cuplast=offer still asks for a11's way)
   *   soldcap    Sold for a fee is a captain piece (the captain's slot, not a tactic slot); the +1s are his, and Captain's
   *              shadow in the eleven makes them +2 (KM_G3B_SOLDX2=off / ?g3bsoldx2=off: always +1)
   *   plain5     a plain upgrade is +5 to its number, never taking it past 20 (a number already at 20 or more: the upgrade
   *              is not offered); KM_G3B_CAP=all / ?g3bcap=all also holds every number of your squad at 20 (growth too)
   *   signtrait  every signing comes with a trait he can hold
   *   signavg    a signing's seven numbers average at least your average player's (the ten outfield men of your eleven,
   *              as they would start the next match); KM_G3B_SIGNAVG=line / ?g3bsignavg=line: the average of your
   *              eleven's men of his line instead
   * KM_G3B=none: a12 before GAME3b exactly (g3b_same.js proves it cup for cup). */
  var G3B = (function () {
    var items = ['nolast', 'soldcap', 'plain5', 'signtrait', 'signavg'], on = {};
    items.forEach(function (k) { on[k] = FMT === 7; });
    if (FMT !== 7) return on;
    function only(v) { if (typeof v !== 'string' || v === '') return; items.forEach(function (k) { on[k] = false; }); v.split(',').forEach(function (k) { if (k in on) on[k] = true; }); }
    function off(v) { String(v || '').split(',').forEach(function (k) { if (k in on) on[k] = false; }); }
    try { if (typeof process !== 'undefined' && process.env) { only(process.env.KM_G3B); off(process.env.KM_G3B_OFF); } } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]g3b=([\w,]+)/.exec(qs), m2 = /[?&]g3boff=([\w,]+)/.exec(qs);
      if (m1) only(m1[1]);
      if (m2) off(m2[1]);
    } catch (e) { }
    return on;
  })();
  var G3B_SOLDX2 = param('KM_G3B_SOLDX2', 'g3bsoldx2', 'on') !== 'off';
  var G3B_CAP = param('KM_G3B_CAP', 'g3bcap', 'plain') === 'all' ? 'all' : 'plain';
  var G3B_SIGNAVG = param('KM_G3B_SIGNAVG', 'g3bsignavg', 'team') === 'line' ? 'line' : 'team';
  var PLAIN_STEP = G3B.plain5 ? 5 : 1, STAT_CAP = 20;
  /* kmtree5 a12 (stream BAL2, HANDOVER-BAL2.md): THE ROUND'S STRENGTH UNDER abc36. abc36 (options.js B11) counts the
   * gap between the two men at half, held to +-2, so the +1 a round adds to every number of theirs (the shift below)
   * reaches the roll only about a third of the time. Sub-switches of the same switch (node KM_B11, page ?b11; all OFF,
   * Eduardo rules): rfull, rflat, rwide (options.js reads them) need to know the round of the man in front of you, so
   * with one of them on this file marks every man of their squad with his round (_k5r: the match, the knockout step,
   * the shift, the team) and the number each stat actually moved (_k5d). rx2 (data only): every round's shift is
   * doubled. With none of them on nothing here runs (the squads are as before, byte for byte). */
  var B11R = (function () {
    var ask = (typeof process !== 'undefined' && process.env && process.env.KM_B11) || 'abc36';
    try { var bq = /[?&]b11=([\w,]+)/.exec((root.location && root.location.search) || ''); if (bq) ask = bq[1]; } catch (e) { }
    var l = ask.split(',');
    return { tag: l.indexOf('rfull') >= 0 || l.indexOf('rflat') >= 0 || l.indexOf('rwide') >= 0, x2: l.indexOf('rx2') >= 0 };
  })();
  function roundShift(v) { return B11R.x2 ? 2 * v : v; }
  var LASTOFFER = param('KM_CUPLAST', 'cuplast', G3B.nolast && BREAK !== 'g3bdefault' ? 'skip' : 'offer') === 'skip' ? 'skip' : 'offer';   /* a12 GAME3b nolast: skip by default */
  /* OT (cup1, 2026-10-05): REST AT THE OVERTIME BREAK, Eduardo's ruling of 10-05. KM_OT / ?ot=rest (default): at the
   * break before overtime your men get back the first half's tiredness (each line's legs as if rested at 45 minutes;
   * the opponent's men never tire in the engine). KM_OT=off / ?ot=off: cup1's overtime exactly (ot_same.js proves it).
   * The two hunks are marked "OT REST" in otStep and otNote. */
  var OT_REST = param('KM_OT', 'ot', 'rest') === 'rest';
  /* a12 EFFX (OT-3): the overtime line says what the rest gave back, line by line (default); KM_OT3=off / ?ot3=off: the
   * line of before ("have had a rest and get back some of their legs") */
  var OT3 = param('KM_OT3', 'ot3', 'on') !== 'off';
  /* a12 ENG7: options.js's KM_R12 switch (one place reads it: KMOptions._r12) */
  function r12c(k) {
    try { var OX = root.KMOptions || (typeof require === 'function' ? require('./options.js') : null); var g = OX && OX._r12 ? OX._r12() : null; return !!(g && g[k] && g.brk !== k); } catch (e) { return false; }
  }
  /* a12 ENG8 (nosub): how Cold start ends without substitutions (options.js R12.coldMode: half | match | out) */
  function r12cold() {
    try { var OX = root.KMOptions || (typeof require === 'function' ? require('./options.js') : null); var g = OX && OX._r12 ? OX._r12() : null; return g && g.coldMode ? g.coldMode : 'half'; } catch (e) { return 'half'; }
  }
  function MXlib() { try { return root.KMMatch || (typeof require === 'function' ? require('./match.js') : null); } catch (e) { return null; } }

  var MATCHES = FMT === 4 ? 4 : 7;          /* the cup; endless goes on after it (K1: 7 matches; a11: 4) */
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
  ].map(function (a) {
    if (a[0] === 'AR_SOLD_FOR_A_FEE' && G3B.soldcap) a = [a[0], 'captain', null, a[3]];   /* a12 GAME3b soldcap: a captain piece */
    return { id: a[0], kind: a[1], holder: a[2], on: a[1] === 'captain' ? CAPTAIN : null, fam: a[3] };
  });
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
    { id: 'TR_CHANNEL_RUNNER', kind: 'trait', holder: 'forward', on: null, fam: 'redirect', needs: 'stretched' }   /* a15 D-4: acts only when their defence is stretched */
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
    if (FMT === 7) return k1RoundOf(i);   /* K1 */
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
    if (it && it.kind === 'plain') return G3B.plain5 && it.attr ? '+' + PLAIN_STEP + ' ' + STAT_NAME[it.attr] : it.name;   /* a12 GAME3b plain5 */
    if (d && d.name) return String(d.name);
    return it && it.name ? it.name : String(id).replace(/^[A-Z]+_/, '').toLowerCase().replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function cutPieces() {
    var out = PIECES.filter(function (p) { var d = fxDef(p.id); return d && d.cut; }).map(function (p) { return p.id; });
    /* a15 D-4 (effects.js part 'channels'; KM_A15_OFF=channels / ?a15off=channels: offered as in a12): a piece that needs a state on their team
     * (Runs the channels: their defence stretched) leaves the Cup's offers while no other piece in the Cup's pool can put that state on them.
     * What can is read from the pieces themselves (a rule `state add` to their team, or a hand-written effect that adds the state to the
     * opponent), so a piece that stretches them, once it joins the pool, brings it back with no change here. */
    if (a15c('channels')) PIECES.forEach(function (p) {
      if (!p.needs || out.indexOf(p.id) >= 0) return;
      if (!PIECES.some(function (q) { return q.id !== p.id && makesState(fxDef(q.id), p.needs); })) out.push(p.id);
    });
    return out;
  }
  function a15c(k) { try { var FX = FXlib(); return !!(FX && FX.a15 && FX.a15(k)); } catch (e) { return false; } }
  /* a15 D-4: can this piece put the state on their team? */
  function makesState(d, name) {
    if (!d || (typeof process !== 'undefined' && process.env && process.env.A15_BREAK === 'stretchread')) return false;   /* A15_BREAK=stretchread: checks only (a15_check C2) */
    var byRule = (d.rules || []).some(function (r) {
      return r.to === 'their team' && [].concat(r.do || []).some(function (x) { return x && x.ch === 'state' && x.op === 'add' && x.name === name; });
    });
    if (byRule) return true;
    var re = new RegExp('addState\\(\\s*[\'"]' + name + '[\'"]\\s*,\\s*[\'"]opponent[\'"]');
    return (d.effects || []).some(function (e) { return ['run', 'apply'].some(function (k) { return typeof e[k] === 'function' && re.test(String(e[k])); }); });
  }
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
    if (it.attr && G3B.plain5) {   /* a12 GAME3b plain5: +5, never past 20, and what it makes of his number now */
      var pn = run ? plainNow(run, it) : null;
      /* a12 ENG8 (plainreal): when the cap leaves less than the step, the sentence leads with what it adds */
      if (pn && pn.now - pn.was !== PLAIN_STEP && r12c('plainreal'))
        return it.on + '\'s ' + STAT_NAME[it.attr] + ' goes up by ' + (pn.now - pn.was) + ' for the rest of the run: from ' + pn.was + ' to ' + pn.now +
          ', because a number never goes past ' + STAT_CAP + ' (a plain upgrade is +' + PLAIN_STEP + ' up to ' + STAT_CAP + ').';
      return it.on + '\'s ' + STAT_NAME[it.attr] + ' goes up by ' + PLAIN_STEP + ' for the rest of the run, but never past ' + STAT_CAP +
        (pn ? ': from ' + pn.was + ' to ' + pn.now + '.' : '.');
    }
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
    var run = {
      v: 2, id: 'cup-' + seed.toString(36) + '-' + (opts.stamp || 0).toString(36), seed: seed,
      match: 1, over: false, champion: false, endless: false,
      clubs: shuffle(CLUBS, r), owned: [], picks: [], results: [], offers: null, acted: {},
      slots: opts.slots || TACTIC_SLOTS, draw: opts.draw || DRAW,
      order: null, swaps: [], signings: [], released: [], releases: [], growth: {}, beliefStat: null, needBelief: false,
      season: { unbeaten: 0, conf: {}, mom: {}, held: {} }, orderLog: []
    };
    if (FMT === 7) k1Init(run, opts);   /* K1: v 3, fmt, fate, group, lastOffer */
    return run;
  }
  function matchSeed(run, i) { return mix(run.seed, 1000 + (i || run.match)) % 100000 + 1; }
  function clubName(run, i) { if (FMT === 7) return k1ClubName(run, i); var k = i < MATCHES ? i - 1 : i - 2; return run.clubs[((k % run.clubs.length) + run.clubs.length) % run.clubs.length]; }
  function effectsOf(run, i) {
    var R = roundOf(i);
    if (BREAK === 'noeffects') return [];
    if (FMT === 7 && !R.endless) return k1EffectsOf(run, i);   /* K1 */
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
    var R = roundOf(i), o = { match: i, round: R.round, shift: BREAK === 'noscale' ? 0 : roundShift(R.shift), effects: effectsOf(run, i), endless: !!R.endless };
    if (R.team) { o.team = R.team; o.name = 'Argentina'; }
    else { o.name = clubName(run, i); o.clubSeed = mix(run.seed, 500 + i) % 100000 + 1; }
    if (R.stage) o.stage = R.stage;   /* K1: 'group' or 'knockout' (a11's rounds have none) */
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
    if (r() < 0.5 || (G3B.signtrait && BREAK !== 'g3bnotrait')) {   /* a12 GAME3b signtrait: always (the draw above is still made) */
      var can = AR.filter(function (p) { return p.kind === 'trait' && p.holder !== 'keeper' && canHold(p.holder, { role: role }); });
      if (can.length) trait = can[Math.floor(r() * can.length)].id;
    }
    var h = 1.70 + Math.floor(r() * 26) / 100;
    if (G3B.signavg && BREAK !== 'g3bnoavg') atLeast(attr, teamAverage(run, G3B_SIGNAVG === 'line' ? ROLE_LINE[role] : null));
    return { name: last, fullName: firstN + ' ' + last, role: role, attr: attr, heightM: h, trait: trait, match: m };
  }
  /* a12 GAME3b signavg (his rule, PLAN-cup-v1 7: "players should always have a trait and be at least as good as your
   * average player"): the average of the seven numbers of the ten outfield men of your eleven as they would start the
   * next match (upgrades and growth in), or (KM_G3B_SIGNAVG=line) of your eleven's men of one line. null: unknown. */
  function teamAverage(run, line) {
    var sq = nowSquad(run); if (!sq) return null;
    var t = 0, n = 0;
    sq.players.forEach(function (p) {
      if (line !== null && line !== undefined && ROLE_LINE[p.role] !== line) return;
      STATS.forEach(function (k) { if (typeof p.attr[k] === 'number') { t += p.attr[k]; n++; } });
    });
    return n ? t / n : null;
  }
  function avgOf(attr) { return STATS.reduce(function (t, k) { return t + attr[k]; }, 0) / STATS.length; }
  /* raise his numbers (the role's shape kept) until their average is at least the target: +1 to every number under 20,
   * then +1 to his lowest ones, never past 20 */
  function atLeast(attr, target) {
    if (typeof target !== 'number') return;
    var g = 0;
    while (avgOf(attr) + 1 <= target && g++ < 20) STATS.forEach(function (k) { if (attr[k] < STAT_CAP) attr[k]++; });
    g = 0;
    while (avgOf(attr) < target - 1e-9 && g++ < 200) {
      var low = STATS.filter(function (k) { return attr[k] < STAT_CAP; }).sort(function (a, b) { return attr[a] - attr[b] || STATS.indexOf(a) - STATS.indexOf(b); })[0];
      if (!low) break;
      attr[low]++;
    }
  }
  function signingFor(run, key) { var k = parseKey(key); return k.sign ? signingOf(run, k.match, k.k) : null; }

  /* ---------------------------------------------------------------- the squads for match i */
  /* libs: { W, C, M, NM }. Spain with the signings on the bench, the released men gone, the bench men put in the
   * eleven, the plain upgrades and the growth; the opponent scaled for its round. */
  function squads(run, libs, i) {
    i = i || run.match;
    var seed = matchSeed(run, i), o = opponentOf(run, i);
    var you = yourSquad(run, libs, seed), them;
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
    tagRound(them, o);   /* BAL2 (off unless rfull, rflat or rwide) */
    return { you: you, them: them, seed: seed, opp: o };
  }
  /* your side before the upgrades (a12 GAME3b: taken out of squads() unchanged, so the signings can read your numbers) */
  function yourSquad(run, libs, seed) {
    var you = libs.W.build('spain', seed);
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
    return you;
  }
  /* a12 GAME3b: your squad as the next match would start it (numbers with the upgrades and the growth), from worldcup.js
   * alone (Spain's numbers do not depend on the match seed); null without it */
  function nowSquad(run) {
    var W = Wlib(); if (!W || !W.build) return null;
    var you = yourSquad(run, { W: W }, matchSeed(run, run.match));
    upgrade(you, run);
    return you;
  }
  /* +shift to every number of their eleven and keeper, 1 to 20 (the scale of a club's numbers; st4's rule) */
  function shiftSquad(sq, shift) {
    sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).forEach(function (p) {
      if (B11R.tag) p._k5d = {};   /* BAL2: the number each stat really moved (20 stays 20) */
      Object.keys(p.attr || {}).forEach(function (k) { if (typeof p.attr[k] === 'number') { var was = p.attr[k]; p.attr[k] = Math.max(1, Math.min(20, p.attr[k] + shift)); if (B11R.tag) p._k5d[k] = p.attr[k] - was; } });
    });
  }
  /* BAL2: every man of their squad carries his round (options.js b11Round reads it; only with rfull, rflat or rwide) */
  function tagRound(sq, o) {
    if (!B11R.tag) return;
    var ko = o.stage === 'group' ? 0 : o.stage === 'knockout' ? o.match - 3 : (FMT === 4 ? o.match : 0);
    if (o.endless) ko = 4 + (o.match - MATCHES);
    sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).forEach(function (p) {
      p._k5r = { match: o.match, ko: ko, shift: o.shift || 0, team: o.team || null };
      if (!p._k5d) p._k5d = {};
    });
  }
  function findMan(sq, name) {
    var all = sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []);
    return all.filter(function (p) { return p.name === name; })[0] || all.filter(function (p) { return first(p.name) === name; })[0] || null;
  }
  /* the plain upgrades (+1, up to 20 as st4) and the growth of the run (Competitive spirit, Sold for a fee: no cap,
   * ruling 1; DECISIONS-R 12) */
  function upgrade(sq, run, gains) {
    if (G3B.plain5) return upgrade5(sq, run, gains);
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
  /* a12 GAME3b plain5 (his words: "much bigger, like +5 up to a max of 20 (unless the player has the trait to go above
   * it)"; no such trait exists yet): the growth first, then each plain upgrade +5 but never past 20, so an upgrade never
   * takes a number over 20 whatever else raised it. gains (optional): "name|stat" -> what the upgrades added.
   * KM_G3B_CAP=all: every number of your squad is then held at 20 (the growth too). */
  function upgrade5(sq, run, gains) {
    Object.keys(run.growth || {}).forEach(function (name) {
      var p = findMan(sq, name), g = run.growth[name];
      if (!p || !p.attr) return;
      Object.keys(g).forEach(function (k) { if (typeof p.attr[k] === 'number') p.attr[k] += g[k]; });
    });
    run.owned.forEach(function (key) {
      var u = pieceOf(key);
      if (!u || u.kind !== 'plain' || !u.attr) return;
      var p = findMan(sq, u.on);
      if (!p || !p.attr || typeof p.attr[u.attr] !== 'number') return;
      var was = p.attr[u.attr], now = BREAK === 'g3bcap' ? was + PLAIN_STEP : Math.max(was, Math.min(STAT_CAP, was + PLAIN_STEP));
      p.attr[u.attr] = now;
      if (gains) gains[p.name + '|' + u.attr] = (gains[p.name + '|' + u.attr] || 0) + now - was;
    });
    if (G3B_CAP === 'all') sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []).forEach(function (p) {
      Object.keys(p.attr || {}).forEach(function (k) { if (typeof p.attr[k] === 'number' && p.attr[k] > STAT_CAP) p.attr[k] = STAT_CAP; });
    });
  }
  /* what a plain upgrade would add now (for the offer's words and for leaving out one that adds nothing) */
  function plainNow(run, u) {
    if (run.owned.indexOf(u.id) >= 0) run = Object.assign({}, run, { owned: run.owned.filter(function (k) { return k !== u.id; }) });   /* an owned one: what it did */
    var sq = nowSquad(run), p = sq ? findMan(sq, u.on) : null;
    if (!p || !p.attr || typeof p.attr[u.attr] !== 'number') return null;
    var was = p.attr[u.attr];
    return { was: was, now: Math.max(was, Math.min(STAT_CAP, was + PLAIN_STEP)) };
  }
  /* for the page's team sheet: what the plain upgrades add to each number ("name|stat" -> n), as upgrade() does */
  function plainGains(run, libs, i) {
    var g = {};
    if (!G3B.plain5) return null;
    var you = yourSquad(run, libs || { W: Wlib() }, matchSeed(run, i || run.match));
    upgrade5(you, run, g);
    return g;
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
      else if (p.kind === 'captain') {
        /* a12 GAME3b soldcap: a run saved before it may own Sold for a fee and another captain piece; the other one is
         * the captain's piece in the match (Sold for a fee does nothing in a match) */
        if (G3B.soldcap && k.id === 'AR_SOLD_FOR_A_FEE' && b.captain && b.captain.component) return;
        b.captain = { name: CAPTAIN, component: k.id };
      }
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
    var plain = shuffle(PLAIN.filter(function (p) { return run.owned.indexOf(p.id) < 0 && (!p.on || manOf(run, p.on)) && (!G3B.plain5 || !p.attr || plainAdds(run, p)) &&
      !(p.subs && r12c('nosub')); }), r).map(function (p) { return p.id; });   /* a12 ENG8 (nosub): no substitutions, so no "one more substitution" */
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
  /* a12 GAME3b plain5: an upgrade that would add nothing (his number is already 20 or more) is not offered */
  function plainAdds(run, p) { var pn = plainNow(run, p); return !pn || pn.now > pn.was; }
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
    /* a12 ENG8 (plainreal; review/monday-rev3 finding 18, "+5 Finishing on Oyarzabal ... never past 20: from 19 to 20"): the
     * name says what the upgrade adds now (for an owned one: what it added), never more than that */
    if (it.kind === 'plain' && it.attr && G3B.plain5 && r12c('plainreal')) {
      var pr = plainNow(run, it);
      if (pr && pr.now - pr.was !== PLAIN_STEP) { v.name = '+' + (pr.now - pr.was) + ' ' + STAT_NAME[it.attr]; v.r12Real = { was: pr.was, now: pr.now, step: PLAIN_STEP }; }
    }
    v.where = it.kind === 'tactic' ? 'A tactic' : it.kind === 'captain' ? 'Captain ' + it.on : on ? 'On ' + on : 'The whole team';
    var rep = replaces(run, key);
    if (rep) v.replaces = { id: rep, name: nameOf(parseKey(rep).id), why: it.kind === 'captain' ? 'you can have one captain piece' : 'you have ' + run.slots + ' tactic slots' };
    /* a11 (G13): what Confidence would give this man in the next match, for the offer screen (the page does not draw
     * it yet: DECISIONS-G13.md, proposal 1). Not in `text`: an offer's sentence is the piece's own. */
    if (CONF && k.id === 'AR_CONFIDENCE' && on) { v.startsAt = confAt(run, on); v.startsLine = confLine(run, on); }
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
  /* how many times the captain's piece works between matches: 1, and one more for each Captain's shadow owned (a11).
   * a11 TRT: `shadow` counts only a shadow on a man of the eleven ("while he is on the pitch"); `shadow2` makes it
   * twice however many shadows ("works twice"). */
  function RULES_CUP() { var RF = FXlib() && FXlib().rules; return !!(RF && RF.on); }
  function shadowTimes(run) {
    /* kmtree5 a13 (stream RULES1): pieces as rules. Captain's shadow is a "fires again" rule with "while he is on the
     * pitch" (between matches: in the eleven), stacked by the one stacking rule (effects.js rules.timesWith) */
    var RF = FXlib() && FXlib().rules;
    if (RF && RF.on) {
      var el = rosterOf(run).eleven.map(function (p) { return p.name; });
      return RF.timesWith(run.owned.filter(function (x) { var k = parseKey(x); return k.id === 'AR_CAPTAINS_SHADOW' && el.indexOf(k.on) >= 0; }).length);
    }
    var eleven = T11.shadow ? rosterOf(run).eleven.map(function (p) { return p.name; }) : null;
    var n = run.owned.filter(function (x) { var k = parseKey(x); return k.id === 'AR_CAPTAINS_SHADOW' && (!eleven || eleven.indexOf(k.on) >= 0); }).length;
    return 1 + (T11.shadow2 ? Math.min(1, n) : n);
  }
  /* kmtree5 a13 (stream RULES3): the cup's own events (a signing, a release) as WHEN of a piece's rules. The run is described
   * to the engine (the pieces it owns, the eleven, the squad's stats); the engine reads the rules, including "fires again" by the
   * one stacking rule, and says whose number goes up by how much. Returns [{ id, times, picks: [{name, stat}], n }]. */
  function cupRules(run, name, opts) {
    var RF = FXlib().rules, FXL = FXlib();
    var cap = base().players.filter(function (p) { return p.name === CAPTAIN; })[0];
    return RF.cupFire(name, {
      owned: run.owned.map(function (key) { var k = parseKey(key); return { def: FXL.get(k.id), on: k.on || null }; }),
      eleven: rosterOf(run).eleven.map(function (p) { return p.name; }),
      squad: allNames(run).map(function (p) { return { name: p.name, keys: p.attrKeys && p.attrKeys.length ? p.attrKeys : STATS }; }),
      captain: { name: CAPTAIN, keys: cap && cap.attrKeys.length ? cap.attrKeys : STATS },
      rng: function () { return Rng(mix(run.seed, 9000 + run.match)); },
      repeat: !opts || opts.repeat !== false
    });
  }
  function grow(run, name, stat, n) { var g = run.growth[name] || (run.growth[name] = {}); g[stat] = (g[stat] || 0) + n; }
  function pick(run, key) {
    if (G3B.nolast && run.over && BREAK !== 'g3blast') throw new Error('cup: the run is over, there is no pick');   /* a12 GAME3b nolast */
    var list = drawOffers(run);
    if (list.indexOf(key) < 0) throw new Error('cup: ' + key + ' was not offered');
    var k = parseKey(key), rec = { match: run.match, id: key, name: offerView(run, key).name, on: null, replaced: null, offered: list.slice() };
    if (k.sign) {
      var s = signingFor(run, key);
      run.signings.push(s);
      rec.on = s.name; rec.signing = { name: s.name, fullName: s.fullName, role: s.role, attr: s.attr, trait: s.trait };
      if (s.trait) run.owned.push(s.trait + '@' + s.name);
      /* Competitive spirit: every player +1 to a random number of his, for the rest of the run */
      if (RULES_CUP() && BREAK !== 'spirit') {
        /* a13 RULES3: a rule WHEN signing (archetypes.js PIECE_RULES); the engine rolls and says how many times it works */
        cupRules(run, 'signing').forEach(function (res) {
          rec.spiritTimes = res.times; rec.spirit = res.picks;
          res.picks.forEach(function (x) { grow(run, x.name, x.stat, res.n); });
        });
      } else if (!RULES_CUP() && owns(run, 'AR_COMPETITIVE_SPIRIT') && BREAK !== 'spirit') {
        /* Captain's shadow doubles the captain's effect: one more roll for each (archetypes.js captainTimes) */
        var times = shadowTimes(run), rs = Rng(mix(run.seed, 9000 + run.match));
        rec.spiritTimes = times; rec.spirit = [];
        for (var tt = 0; tt < times; tt++) rec.spirit = rec.spirit.concat(spiritRoll(run, rs));
        rec.spirit.forEach(function (x) { grow(run, x.name, x.stat, 1); });
      }
    } else {
      var rep = replaces(run, key);
      if (rep) run.owned = run.owned.filter(function (x) { return x !== rep; });
      run.owned.push(key);
      rec.on = k.on || byId(k.id).on || null; rec.replaced = rep || null;
      /* a11 (G13): Confidence is given to a man who has already played full matches in this run: he has them at once */
      if (CONF && k.id === 'AR_CONFIDENCE' && rec.on && confAt(run, rec.on) > 0) { run.season.conf[rec.on] = confAt(run, rec.on); rec.confidence = run.season.conf[rec.on]; }
      if (isBeliefPiece(k.id) && !run.beliefStat) run.needBelief = true;
    }
    if (rec.signing && rec.signing.trait && isBeliefPiece(rec.signing.trait) && !run.beliefStat) run.needBelief = true;
    if (FMT === 7) k1AfterPick(run, rec);   /* K1: the run's fate is decided here, after the pick */
    run.picks.push(rec);
    run.offers = null;
    run.match++;
    var out = { replaced: rec.replaced, needBelief: run.needBelief, spirit: rec.spirit || null };
    if (FMT === 7) out.fate = run.fate;
    return out;
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
  /* a11 TRT `sold` ("When you release a player between matches"): a man of the eleven can be released too. A bench man
   * of his line takes his place: the one named (inName), else the first of that line on the bench. Never the captain
   * (he gets the +1s and stays in the eleven, as swapIn says) and never the keeper (there is no keeper on the bench).
   * Off: a11's rule, bench men only. */
  function releaseStandIn(run, name, inName) {
    var R = rosterOf(run), o = R.eleven.filter(function (p) { return p.name === name; })[0];
    if (!o) return null;
    var cands = R.bench.filter(function (p) { return ROLE_LINE[p.role] === ROLE_LINE[o.role]; });
    if (inName) cands = cands.filter(function (p) { return p.name === inName; });
    return cands[0] ? cands[0].name : null;
  }
  function releaseRefusal(run, name, inName) {
    if (!canRelease(run)) return 'Releasing a player needs Sold for a fee' + (SELLCAP === '1' ? ', once between matches' : '') + '.';
    var R = rosterOf(run);
    if (T11.sold && R.eleven.some(function (p) { return p.name === name; })) {
      var o = R.eleven.filter(function (p) { return p.name === name; })[0];
      if (o.keeper) return name + ' is the keeper, and there is no keeper on the bench to take his place.';
      if (o.name === CAPTAIN) return CAPTAIN + ' is the captain and stays in the eleven.';
      if (!releaseStandIn(run, name, inName)) return inName ? inName + ' cannot take ' + name + '\'s place: he is not on the bench or plays in another line.'
        : 'Nobody on the bench plays in ' + ['defence', 'midfield', 'attack'][ROLE_LINE[o.role]] + ' to take ' + name + '\'s place.';
      return null;
    }
    if (!R.bench.some(function (p) { return p.name === name; })) return name + ' is not on the bench: only a man on the bench can be released.';
    return null;
  }
  /* Sold for a fee: the man leaves the squad (his traits go with him); the captain gets +1 to all his numbers */
  function release(run, name, inName) {
    var why = releaseRefusal(run, name, inName);
    if (why) return why;
    var standIn = null;
    if (T11.sold && rosterOf(run).eleven.some(function (p) { return p.name === name; })) {
      standIn = releaseStandIn(run, name, inName);
      var sw = swapIn(run, name, standIn);
      if (sw) return sw;
    }
    run.released.push(name);
    var gone = run.owned.filter(function (key) { return parseKey(key).on === name; });
    run.owned = run.owned.filter(function (key) { return parseKey(key).on !== name; });
    var cap = base().players.filter(function (p) { return p.name === CAPTAIN; })[0];
    /* a12 GAME3b soldcap: a captain piece, so Captain's shadow in the eleven makes it work twice (+2), as his words say */
    var plus;
    if (RULES_CUP()) {
      /* a13 RULES3: a rule WHEN release; the captain's piece works again unless the old switch says always +1 */
      var rr = cupRules(run, 'release', { repeat: !!(G3B.soldcap && G3B_SOLDX2 && BREAK !== 'g3bsoldx1') })[0];
      plus = rr ? rr.times : 1;
      if (rr) rr.picks.forEach(function (x) { grow(run, x.name, x.stat, rr.n); });
    } else {
      plus = G3B.soldcap && G3B_SOLDX2 && BREAK !== 'g3bsoldx1' ? shadowTimes(run) : 1;
      (cap && cap.attrKeys.length ? cap.attrKeys : STATS).forEach(function (s) { grow(run, CAPTAIN, s, plus); });
    }
    run.releases.push(standIn ? { match: run.match, name: name, traitsLost: gone, standIn: standIn } : { match: run.match, name: name, traitsLost: gone });
    if (G3B.soldcap) run.releases[run.releases.length - 1].plus = plus;   /* a12 GAME3b: what this release gave the captain */
    return null;
  }
  /* after winning the cup: "Keep going" */
  function keepGoing(run) {
    if (FMT === 7) return k1KeepGoing(run);   /* K1 */
    if (!run.over || !run.champion || run.endless) throw new Error('cup: endless starts only after winning the cup');
    if (BREAK === 'endless') return false;
    run.endless = true; run.over = false;
    return true;
  }

  /* ---------------------------------------------------------------- after a match */
  /* score, acted (piece name -> decisions it acted on), report (X.runReport(match): players' starts, full matches,
   * substitutions off, Momentum; lost; pieces fired). Returns 'next' (offers), 'champion' or 'out'. */
  function record(run, score, acted, report, extra) {
    if (FMT === 7) return k1Record(run, score, acted, report, extra);   /* K1 (extra: { ot, at90 } from otInfo) */
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
  /* a11 (G13): the full matches in a row a man has played in this run, as the next match would count them: 0 for a
   * man the run has no count for (a signing who has not played, a run saved before a11) */
  function confAt(run, name) { var F = (run.season && run.season.full) || {}; return CONF && typeof F[name] === 'number' ? F[name] : 0; }
  function confLine(run, name) {
    var n = confAt(run, name);
    return n > 0 ? name + ' has played ' + n + ' full match' + (n === 1 ? '' : 'es') + ' in a row in this run: he would start the next match at +' + n + ' to all his stats.'
      : name + ' has no full match in a row in this run yet: he would start the next match at +0.';
  }
  /* Unbeaten run: matches in a row without a loss while it is held (or every match: ?seasoncount=all); a loss
   * resets it. Confidence: +1 for a full match, all of it lost if he does not start or is taken off; counted for the
   * man who holds it (season.conf, a10's rule, unchanged) and, in a11 (G13, switch conf), for every man of the squad
   * from match 1 (season.full), so that a man who is given the trait later has the matches he has already played.
   * Momentum (held): what the match left him with (the engine carries it through the match). */
  function seasonAfter(run, report, lost) {
    var S = run.season;
    if (BREAK === 'runstate') return;
    if (CONF) {
      var F = S.full || (S.full = {});
      allNames(run).forEach(function (p) {
        var rq = repFor(report, p.name);
        if (!rq || !rq.started || rq.subbedOff) F[p.name] = 0;
        else if (rq.fullMatch) F[p.name] = (F[p.name] || 0) + 1;
      });
    }
    if (lost) S.unbeaten = 0;
    else if (SEASON === 'all' || T11.unbeaten || owns(run, 'AR_UNBEATEN_RUN')) S.unbeaten = (S.unbeaten || 0) + 1;   /* a11 TRT unbeaten: every match of the run, as the words say */
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
    /* the holder's own counter is the one the match is given: the squad's count never disagrees with it (a run saved
     * before a11 has a holder's counter and no squad count) */
    if (CONF) run.owned.forEach(function (key) { var k = parseKey(key); if (k.id === 'AR_CONFIDENCE' && k.on && typeof S.conf[k.on] === 'number') S.full[k.on] = S.conf[k.on]; });
  }
  /* decisions each piece acted on in one match: the engine's own count (X.runReport pieces) when there is one,
   * else a line of its own in the match log, as the build panel counts */
  function actedIn(st, report) {
    var out = {};
    /* a12 CHK9 (REVIEW finding 6, "No striker: acted 32 times" on the end screen while full time said "never fired"): count what full time
     * counts (bviz.js fires(): the match log's lines, one a piece and decision, never an 'expire' or 'limit' line), not report.pieces
     * (effects.js firesYou: every time the piece was evaluated and fired). KM_R12_OFF=actedfull / ?r12off=actedfull: today's count. */
    if (r12c('actedfull') && st && st.fx && st.fx.build && Array.isArray(st.fx.log)) {
      var namesF = PIECES.map(function (p) { return nameOf(p.id); }), seenF = {};
      st.fx.log.forEach(function (l) {
        if (!l || !l.source || l.kind === 'expire' || l.kind === 'limit' || (l.side && l.side === 'them')) return;
        var nm = String(l.source).replace(/ \([^()]*\)$/, '');
        if (namesF.indexOf(nm) < 0) return;
        var kF = String(l.source) + '|' + l.at;
        if (seenF[kF]) return; seenF[kF] = 1;
        out[nm] = (out[nm] || 0) + 1;
      });
      return out;
    }
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
    var out = { champion: run.champion, endless: run.endless, reached: run.results.length, of: MATCHES, last: last, results: run.results.slice(),
      picks: run.picks.map(function (p) { return { match: p.match, name: p.name, on: p.on, replaced: p.replaced ? nameOf(parseKey(p.replaced).id) : null }; }),
      mostActed: mostActed, beliefStat: run.beliefStat, signings: run.signings.map(function (s) { return s.fullName; }), released: run.released.slice(),
      neverActed: ownedPieces(run).map(function (key) { return nameOf(parseKey(key).id); }).filter(function (n, i, a) { return a.indexOf(n) === i && !run.acted[n]; }) };
    if (FMT === 7) k1Summary(run, out);   /* K1: the fate, the group table, the path */
    return out;
  }

  /* ---------------------------------------------------------------- telemetry */
  function telStart(run) {
    var o = opponentOf(run), R = rosterOf(run);
    var t = { cupRun: run.id, match: run.match, of: MATCHES, endless: run.endless, round: o.round, opp: o.name, oppShift: o.shift, oppEffects: o.effects.slice(),
      owned: run.owned.slice(), pieces: ownedPieces(run), upgrades: run.owned.filter(function (x) { var p = pieceOf(x); return p && p.kind === 'plain'; }), draw: run.draw,
      order: R.order.slice(), bench: R.bench.map(function (p) { return p.name; }), beliefStat: run.beliefStat, run: runStateOf(run),
      signings: run.signings.map(function (s) { return s.name; }), released: run.released.slice(), growth: JSON.parse(JSON.stringify(run.growth)) };
    if (FMT === 7) { t.fmt = 7; t.stage = o.stage || null; }   /* K1 */
    return t;
  }
  function telOffer(run) {
    var list = drawOffers(run);
    return { cupRun: run.id, match: run.match - 0, owned: run.owned.slice(),
      offers: BREAK === 'tel' ? [] : list.map(function (id) { var v = offerView(run, id); var r = { id: id, name: v.name, on: v.on, kind: v.kind, piece: v.piece || null, replaces: v.replaces ? v.replaces.id : null }; if (v.signing) r.signing = v.signing; return r; }) };
  }
  function telPick(run, id, before) {
    var p = run.picks[run.picks.length - 1] || {};
    var t = { cupRun: run.id, match: before, pick: id, offered: p.offered || [], replaced: p.replaced || null, owned: run.owned.slice(),
      signing: p.signing || null, spirit: p.spirit || null, askBelief: !!run.needBelief };
    if (FMT === 7) { t.fate = p.fate || null; t.over = run.over; t.champion = run.champion; }   /* K1: the fate, decided at this pick */
    return t;
  }
  function telResult(run) {
    var r = run.results[run.results.length - 1];
    var t = { cupRun: run.id, match: r.match, you: r.you, them: r.them, result: r.result, through: r.through, over: run.over, champion: run.champion, endless: run.endless,
      owned: r.owned, oppEffects: r.effects, run: runStateOf(run) };
    if (FMT === 7) k1TelResult(run, r, t);   /* K1: stage, overtime, penalties, the group table */
    return t;
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
    if (FMT === 7) return k1Valid(r);   /* K1: a v 3 run (an older save is refused: saveAge says why) */
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
      /* a11 (G13): the squad's count of full matches; a run saved before a11 has none and is still a run */
      if (S.full !== undefined && (!isObj(S.full) || Object.keys(S.full).some(function (k) { return !isInt(S.full[k], 0, MAX_MATCH); }))) return false;
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

  /* ================================================================ K1: THE 7-MATCH CUP (cup1, 2026-10-05)
   * Everything the 7-match Cup adds is in this block; the old functions hand over to it only when FMT is 7, so with
   * KM_CUPFMT=4 / ?cupfmt=4 nothing here runs and the cup is a11's (k1_same.js).
   *
   * THE ROUNDS (DECISIONS-K1.md item 1, numbers for K2 to tune): group match 1 (their numbers -1, no effect), group
   * match 2 (-1, one elite effect), group match 3 (+0, one elite), round of 16 (+0, one elite), quarter-final (+1, one
   * elite), semi-final (+1, one boss effect), final (Argentina as they are, one boss and one elite). No effect is met
   * twice in a run. Endless after winning the Cup is a11's (their numbers +3, +4, ...; more effects).
   * THE GROUP: Spain and the first three clubs of the run's draw. The other match of each matchday is rolled from the
   * two squads' strength (the average of their outfield numbers), never played (the project's rule: the world is
   * rosters). 3 points a win, 1 a draw; ordered by points, goal difference, goals scored, then a draw fixed by the
   * Cup's seed; the top two go through.
   * THE SAVED RUN (v 3): phases sheet (before a match), offer (after ANY recorded match), belief (once, optional), then
   * the next sheet or over. The run's FATE ('on', 'out-group', 'out-knockout', 'champion') is decided only at the pick
   * after a match (with ?cuplast=skip, at the result of a match that ends the run). A save of another version is
   * refused (saveAge), never half loaded.
   * A DRAWN KNOCKOUT MATCH: overtime is two more moments, one attack of yours (a situation of your attack) and then
   * one of theirs (their counter-attack, which is in your half) (otStep: the page and cupsim call it before they ask
   * whether the match is over); still level: penalties, Finishing against Reflexes, rolled from the Cup's seed. */
  var K1_ROUNDS = [null,
    { round: 'Group match 1', stage: 'group', shift: -1, elites: 0, bosses: 0 },
    { round: 'Group match 2', stage: 'group', shift: -1, elites: 1, bosses: 0 },
    { round: 'Group match 3', stage: 'group', shift: 0, elites: 1, bosses: 0 },
    { round: 'Round of 16', stage: 'knockout', shift: 0, elites: 1, bosses: 0 },
    { round: 'Quarter-final', stage: 'knockout', shift: 1, elites: 1, bosses: 0 },
    { round: 'Semi-final', stage: 'knockout', shift: 1, elites: 0, bosses: 1 },
    { round: 'Final', stage: 'knockout', team: 'argentina', shift: 0, elites: 1, bosses: 1 }];
  /* kmtree5 a12 (stream CURVE, HANDOVER-CURVE.md; his ruling J13: keep the defending split, retune the round strength
   * so a good player wins the Cup about 25 to 29 times in 100 again). OTHER ROUND STRENGTH CURVES behind node KM_CURVE /
   * page ?curve= (default since 10-05: wall2, his wall shape re-tuned; ?curve=k1 / KM_CURVE=k1 gives the rounds above, unchanged). Each curve gives, for the 7 matches in order, the shift
   * added to their numbers and the elite and boss effects; the effects are dealt from the run's shuffled lists exactly
   * as above, so no effect is met twice. KM_CURVE_SPEC (node only, measurement): 'shifts/elites/bosses', e.g.
   * '-1,-1,0,0,1,1,0/0,1,1,1,1,0,1/0,0,0,0,0,1,1' (the k1 rounds). Break CUP_BREAK=curvenone ignores the switch. */
  var CURVES = {
    k1: null,
    /* wall: an easier road (group -2, -1, -1; round of 16 -1; quarter and semi +0), the final as k1 (the hardest) */
    wall: { shift: [-2, -1, -1, -1, 0, 0, 0], elites: [0, 1, 1, 1, 1, 0, 1], bosses: [0, 0, 0, 0, 0, 1, 1] },
    /* even: the group as k1; every knockout about as hard (+1, +1, +1, Argentina -1); effects as k1 */
    even: { shift: [-1, -1, 0, 1, 1, 1, -1], elites: [0, 1, 1, 1, 1, 0, 1], bosses: [0, 0, 0, 0, 0, 1, 1] },
    /* soft: k1's road; Argentina -1 in the final, which brings one boss and two elite effects */
    soft: { shift: [-1, -1, 0, 0, 1, 1, -1], elites: [0, 1, 1, 1, 1, 0, 2], bosses: [0, 0, 0, 0, 0, 1, 1] },
    /* a12 EFFX (lead, 10-05): wall re-tuned on today's a12 (RUL-E's rules and EFFX's effects took wall from 28.6 to 37.7
     * Cups won in 100 for the planner): the same shape, an easy road and the final the hardest match: group -2, -1, -1,
     * every knockout before the final -1, Argentina +1; effects as wall. Planner 26.8 in 100 (HANDOVER-EFFX.md). */
    wall2: { shift: [-2, -1, -1, -1, -1, -1, 1], elites: [0, 1, 1, 1, 1, 0, 1], bosses: [0, 0, 0, 0, 0, 1, 1] },
    /* a12 CURVE2 (10-05, his ruling J15, HANDOVER-CURVE2.md): 'road', every knockout before the final a real match (a
     * careful player through each about 85 to 90 in 100), the final about 45, Cups won about 28. Group -2, -1, -1 (as
     * wall2); round of 16, quarter and semi +0 with two elite effects in the round of 16 and the quarter-final and a
     * boss and an elite in the semi-final; Argentina as they are with a boss and an elite. All eight elites are met once a
     * run (2,000 planner Cups: 29.1 won, through 86.8 / 88.5 / 88.0 / 43.2). */
    road: { shift: [-2, -1, -1, 0, 0, 0, 0], elites: [0, 1, 1, 2, 2, 1, 1], bosses: [0, 0, 0, 0, 0, 1, 1] }
  };
  var CURVE = (function () {
    var spec = null;
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_CURVE_SPEC) spec = String(process.env.KM_CURVE_SPEC); } catch (e) { }
    if (BREAK === 'curvenone') return 'k1';
    if (spec) {
      var parts = spec.split('/').map(function (s) { return s.split(',').map(Number); });
      if (parts.length === 3 && parts.every(function (a) { return a.length === 7 && a.every(function (v) { return v === Math.round(v); }); })) {
        CURVES.spec = { shift: parts[0], elites: parts[1], bosses: parts[2] }; return 'spec';
      }
    }
    /* a12 EFFX (lead, Eduardo's ruling of 10-05): his 'wall' shape is the default; KM_CURVE=k1 / ?curve=k1 gives K1's back.
     * a12 FIX4 (lead, 10-05): the default is 'wall2' (wall's shape re-tuned to his 25 to 29 target on today's rules;
     * wall itself lands 37.7). KM_CURVE=wall / ?curve=wall keeps wall. Break CUP_BREAK=curvewall: the default is wall again. */
    /* a12 CURVE2 (10-05, his ruling J15): the default is 'road'; KM_CURVE=wall2 / ?curve=wall2 keeps wall2. Break
     * CUP_BREAK=curvewall2: the default is wall2 again (the state before CURVE2). */
    var dflt = BREAK === 'curvewall' ? 'wall' : BREAK === 'curvewall2' ? 'wall2' : 'road';   /* break curvewall: before FIX4 */
    var c = param('KM_CURVE', 'curve', dflt);
    return CURVES.hasOwnProperty(c) ? c : dflt;
  })();
  if (CURVES[CURVE]) for (var kc = 1; kc <= 7; kc++) {
    K1_ROUNDS[kc].shift = CURVES[CURVE].shift[kc - 1]; K1_ROUNDS[kc].elites = CURVES[CURVE].elites[kc - 1]; K1_ROUNDS[kc].bosses = CURVES[CURVE].bosses[kc - 1];
  }
  /* kmtree5 a12 (stream EFFX, HANDOVER-EFFX.md; his ruling K2-7: "some of these super powerful ones should only be for
   * the final"): THE FINAL'S POOL, the part 'pool' of effects.js's switch efx, OFF by default (node KM_EFX_ON=pool or
   * KM_EFX=...,pool; page ?efxon=pool). On: No quick shots and Checked out (at their a12 strength, opponents.js) leave the
   * elite and boss lists of the seven rounds, and the final's first boss is one of them (its own draw from the Cup's
   * seed); every other effect is dealt from the shorter lists as before. Endless after the Cup is unchanged. Off: the
   * effects are dealt exactly as before (efx_check.js E7). Break CUP_BREAK=efxpool ignores the part. */
  var FINAL_POOL = ['OP_NO_QUICK_SHOTS', 'OP_CHECKED_OUT'];
  /* node-only knob for measuring (opponents.js reads the same): KM_EFX_POOLIDS=quick (No quick shots alone), or with
   * sense (6th sense, which has no other strength) */
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_EFX_POOLIDS) FINAL_POOL = String(process.env.KM_EFX_POOLIDS).split(',').map(function (k) { return { quick: 'OP_NO_QUICK_SHOTS', checked: 'OP_CHECKED_OUT', sense: 'OP_GAME_MANAGER' }[k]; }).filter(Boolean); } catch (e) { }
  var EFX_POOL = (function () {
    var on = false;
    function has(v, k) { return String(v || '').split(',').indexOf(k) >= 0; }
    try {
      if (typeof process !== 'undefined' && process.env) {
        if (typeof process.env.KM_EFX === 'string' && process.env.KM_EFX !== '') on = has(process.env.KM_EFX, 'pool');
        if (has(process.env.KM_EFX_ON, 'pool')) on = true;
        if (has(process.env.KM_EFX_OFF, 'pool')) on = false;
      }
    } catch (e) { }
    try {
      var qs = (root.location && root.location.search) || '';
      var m1 = /[?&]efx=([\w,]+)/.exec(qs), m3 = /[?&]efxon=([\w,]+)/.exec(qs), m2 = /[?&]efxoff=([\w,]+)/.exec(qs);
      if (m1) on = has(m1[1], 'pool');
      if (m3 && has(m3[1], 'pool')) on = true;
      if (m2 && has(m2[1], 'pool')) on = false;
    } catch (e) { }
    return on && BREAK !== 'efxpool';
  })();
  function notPooled(id) { return FINAL_POOL.indexOf(id) < 0; }
  var K1_SHORT = [null, 'Group 1', 'Group 2', 'Group 3', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
  /* the other match of each group matchday: club a against club b (Spain plays club md-1) */
  var K1_PAIRS = [[1, 2], [0, 2], [0, 1]];
  var K1_FATES = ['on', 'out-group', 'out-knockout', 'champion'];
  var OT_MIN = [104, 116];         /* the minutes of the two overtime moments (one in each half of overtime) */
  var PEN_BASE = 0.75, PEN_STEP = 0.03, PEN_MIN = 0.4, PEN_MAX = 0.95;   /* a kick: 75 in 100 at equal stats, 3 more a point of Finishing over Reflexes */
  var K1LIBS = null;
  function k1RoundOf(i) {
    if (i >= 1 && i <= MATCHES) { var R = K1_ROUNDS[i], o = {}; for (var k in R) o[k] = R[k]; return o; }
    var k2 = i - MATCHES, n = 1 + Math.floor(k2 / 2);
    return { round: 'Endless, match ' + k2, stage: 'knockout', shift: 2 + k2, effects: n, endless: true };
  }
  function k1Init(run, opts) {
    run.v = 3; run.fmt = 7; run.fate = null; run.group = { games: [] };
    run.lastOffer = (opts && opts.lastOffer) || LASTOFFER;
  }
  /* the clubs: the group's three (match 1 to 3), then the round of 16, the quarter-final and the semi-final; endless
   * goes on through the other six */
  function k1ClubName(run, i) {
    var k = i <= 6 ? i - 1 : 6 + ((i - MATCHES - 1) % 6 + 6) % 6;
    return run.clubs[((k % run.clubs.length) + run.clubs.length) % run.clubs.length];
  }
  function k1EffectsOf(run, i) {
    var EL = EFX_POOL ? ELITES.filter(notPooled) : ELITES, BO = EFX_POOL ? BOSSES.filter(notPooled) : BOSSES;   /* a12 EFFX pool */
    if (r12c('nosub') && r12cold() === 'out') BO = BO.filter(function (id) { return id !== 'OP_COLD_START'; });   /* a12 ENG8 (nosub, KM_R12_COLD=out) */
    var r = Rng(mix(run.seed, 5000)), el = shuffle(EL, r), bo = shuffle(BO, r), ne = 0, nb = 0, out = [];
    for (var j = 1; j < i; j++) { ne += K1_ROUNDS[j].elites; nb += K1_ROUNDS[j].bosses; }
    var R = K1_ROUNDS[i], b0 = 0;
    if (EFX_POOL && i === MATCHES && R.bosses > 0) { out.push(shuffle(FINAL_POOL, Rng(mix(run.seed, 5077)))[0]); b0 = 1; }
    for (var b = b0; b < R.bosses; b++) out.push(bo[(nb + b - b0) % bo.length]);
    for (var e = 0; e < R.elites; e++) {
      /* a12 CURVE2: 'road' deals all eight elites in the 7 matches; with the final's pool on (7 elites left) the eighth
       * would be a repeat, so in the 7 matches an elite past the end of the list is not dealt (no other curve reaches it) */
      if (i <= MATCHES && ne + e >= el.length && BREAK !== 'curve2wrap') continue;
      out.push(el[(ne + e) % el.length]);
    }
    return out;
  }
  function isStage(i, s) { return k1RoundOf(i).stage === s; }
  /* the libraries the group's rolls and the penalties read (the squads): the page and cupsim hand them over */
  function setLibs(libs) { K1LIBS = libs || null; }
  function avgNumbers(sq) {
    var n = 0, t = 0;
    (sq.players || []).forEach(function (p) { Object.keys(p.attr || {}).forEach(function (k) { if (typeof p.attr[k] === 'number') { t += p.attr[k]; n++; } }); });
    return n ? t / n : 0;
  }
  /* a group club's strength: the average of its outfield numbers as it plays Spain (the club j is the opponent of
   * match j+1, with that round's shift). Without the libraries: a made-up club's average (11.9) plus the shift. */
  function k1Strength(run, j) {
    var shift = roundShift(K1_ROUNDS[j + 1].shift), L = K1LIBS;   /* BAL2: rx2 doubles it here too */
    if (!L || !L.C || !L.M || !L.C.makeSquad) return 11.9 + shift;
    var cs = mix(run.seed, 500 + j + 1) % 100000 + 1;
    var sq = L.M.attach(L.C.makeSquad(new L.C.RNG(cs * 7 + 11), { club: run.clubs[j] }), cs * 7 + 11);
    if (shift) shiftSquad(sq, shift);
    return Math.round(avgNumbers(sq) * 10) / 10;
  }
  function poisson(lam, r) { var L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; }
  /* goals each side expects in a rolled match: 1.3, and 0.45 more (or fewer) a point of average over the other side */
  function rollGoals(sa, sb, r) {
    var la = Math.max(0.25, Math.min(3.5, 1.3 + 0.45 * (sa - sb))), lb = Math.max(0.25, Math.min(3.5, 1.3 + 0.45 * (sb - sa)));
    return [poisson(la, r), poisson(lb, r)];
  }
  function k1RollGroup(run, md) {
    if (BREAK === 'k1noroll') return;
    var pr = K1_PAIRS[md - 1], sa = k1Strength(run, pr[0]), sb = k1Strength(run, pr[1]);
    var g = rollGoals(sa, sb, Rng(mix(run.seed, 4100 + md)));
    run.group.games.push({ md: md, a: pr[0], b: pr[1], ga: g[0], gb: g[1], sa: sa, sb: sb });
  }
  /* the group table after `upto` of Spain's matches (default: every one recorded) */
  function k1Table(run, upto) {
    var md = Math.min(upto === undefined ? run.results.length : upto, 3);
    var names = ['Spain'].concat((run.clubs || []).slice(0, 3));
    var rows = names.map(function (n, k) { return { team: n, you: k === 0, k: k, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; });
    function add(x, y, gx, gy) {
      [[x, gx, gy], [y, gy, gx]].forEach(function (t) {
        var w = rows[t[0]]; w.p++; w.gf += t[1]; w.ga += t[2]; w.gd = w.gf - w.ga;
        if (t[1] > t[2]) { w.w++; w.pts += 3; } else if (t[1] === t[2]) { w.d++; w.pts += 1; } else w.l++;
      });
    }
    (run.results || []).slice(0, md).forEach(function (r, j) { add(0, j + 1, r.you, r.them); });
    ((run.group && run.group.games) || []).forEach(function (g) { if (g.md <= md) add(g.a + 1, g.b + 1, g.ga, g.gb); });
    var tie = shuffle([0, 1, 2, 3], Rng(mix(run.seed, 4200)));
    var order = rows.slice().sort(function (a, b) { return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || tie.indexOf(a.k) - tie.indexOf(b.k); });
    if (BREAK === 'k1table') order.reverse();
    order.forEach(function (r, i) { r.pos = i + 1; });
    var me = order.filter(function (r) { return r.you; })[0];
    var games = ((run.group && run.group.games) || []).filter(function (g) { return g.md <= md; }).map(function (g) {
      return { md: g.md, a: names[g.a + 1], b: names[g.b + 1], ga: g.ga, gb: g.gb, sa: g.sa, sb: g.sb };
    });
    return { rows: order, pos: me.pos, played: md, done: md >= 3, games: games };
  }
  /* the fate after Spain's match j, from the results alone (rawFate) and as the run's pick j gets it (fateAt: with
   * ?cuplast=skip the final's pick comes after "Keep going", when the Cup is already won) */
  function rawFate(run, j) {
    var last = run.results[j - 1];
    if (!last) return null;
    if (j <= 3) return j < 3 ? 'on' : (k1Table(run, 3).pos <= 2 ? 'on' : 'out-group');
    if (!last.through) return 'out-knockout';
    if (j === MATCHES) return 'champion';
    return 'on';
  }
  function fateAt(run, j) {
    var f = rawFate(run, j);
    return j === MATCHES && f === 'champion' && run.lastOffer === 'skip' && run.endless ? 'on' : f;
  }
  function terminal(f) { return !!f && f !== 'on'; }
  /* what the pick after the match just recorded will decide (the offer screen says it before the pick) */
  function fateIf(run) { return run.results.length === run.match ? fateAt(run, run.match) : null; }
  function k1AfterPick(run, rec) {
    var f = fateAt(run, run.results.length);
    if (BREAK === 'k1fate') f = 'on';
    rec.fate = f; run.fate = f;
    if (terminal(f)) { run.over = true; if (f === 'champion') run.champion = true; run.needBelief = false; }
  }
  function k1KeepGoing(run) {
    if (!run.over || !run.champion || run.endless) throw new Error('cup: endless starts only after winning the cup');
    if (BREAK === 'endless') return false;
    run.endless = true; run.over = false;
    if (run.lastOffer === 'skip') run.fate = 'on';
    if (!run.beliefStat && run.owned.some(function (k) { return isBeliefPiece(parseKey(k).id); })) run.needBelief = true;
    return true;
  }
  /* PENALTIES: five each, then one each until one side misses and the other scores. A kick: the taker's Finishing
   * against the other keeper's Reflexes, 75 in 100 at equal numbers, 3 more for each point he is above (3 fewer
   * below), between 40 and 95. The takers: the eleven's outfield men, best Finishing first, round again after the
   * eleventh. Who kicks first: a coin. All from the Cup's seed. At equal numbers both sides have the same chance. */
  function k1Penalties(run, i) {
    var sq = null;
    try { if (K1LIBS && K1LIBS.W) sq = squads(run, K1LIBS, i); } catch (e) { sq = null; }
    function takers(side) {
      var ps = sq ? side.players.slice() : [];
      ps = ps.map(function (p, k) { return { name: first(p.name), fin: (p.attr && p.attr.finishing) || 10, k: k }; })
        .sort(function (a, b) { return b.fin - a.fin || a.k - b.k; });
      return ps.length ? ps : [{ name: 'Your taker', fin: 12, k: 0 }];
    }
    function keeper(side, dflt) { var k = sq && side.keeper; return { name: k ? first(k.name) : dflt, ref: (k && k.attr && k.attr.reflexes) || 12 }; }
    var T = { you: takers(sq ? sq.you : null), them: takers(sq ? sq.them : null) };
    if (!sq) T.them = [{ name: 'Their taker', fin: 12, k: 0 }];
    var K = { you: keeper(sq ? sq.you : null, 'Your keeper'), them: keeper(sq ? sq.them : null, 'Their keeper') };
    var r = Rng(mix(run.seed, 6000 + i)), firstSide = r() < 0.5 ? 'you' : 'them', other = firstSide === 'you' ? 'them' : 'you';
    var goals = { you: 0, them: 0 }, taken = { you: 0, them: 0 }, kicks = [];
    function kick(side) {
      var t = T[side][taken[side] % T[side].length], k = K[side === 'you' ? 'them' : 'you'];
      var p = Math.max(PEN_MIN, Math.min(PEN_MAX, PEN_BASE + PEN_STEP * (t.fin - k.ref)));
      if (BREAK === 'k1pens' && side === 'you') p = 0;
      var scored = r() < p;
      taken[side]++; if (scored) goals[side]++;
      kicks.push({ side: side, taker: t.name, fin: t.fin, keeper: k.name, ref: k.ref, p: Math.round(p * 100), scored: scored });
    }
    function decided() {
      var leftY = Math.max(0, 5 - taken.you), leftT = Math.max(0, 5 - taken.them);
      if (taken.you < 5 || taken.them < 5) return goals.you > goals.them + leftT || goals.them > goals.you + leftY;
      return taken.you === taken.them && goals.you !== goals.them;
    }
    for (var round = 0; round < 40 && !decided(); round++) {
      kick(firstSide); if (decided()) break;
      kick(other);
    }
    if (goals.you === goals.them) { if (r() < 0.5) goals.you++; else goals.them++; }   /* (40 rounds level: never seen; a coin) */
    return { you: goals.you, them: goals.them, first: firstSide, kicks: kicks };
  }
  /* OVERTIME, on the match itself (st): the page and cupsim call otStep(st, run, i) each time before they ask the
   * engine whether the match is over. In a knockout match that is level after the six moments it adds two: the
   * seventh is an attack of yours (the engine's own "force your side" switch), the eighth one of theirs (their
   * counter-attack, in your half). The engine's x1 m8 setting (eight moments) gives the room; it changes nothing else
   * of the match. Returns true when it changed something. */
  function otStep(st, run, i) {
    if (FMT !== 7 || !run || !st || st.pending || BREAK === 'k1noot') return false;
    i = i || run.match;
    if (!isStage(i, 'knockout')) return false;
    var O = st.cupOT;
    if (!O) {
      if (st.x1 && st.x1.m8) return false;   /* the match already has eight moments (an x1 test): straight to penalties */
      if (st.n < 6 || st.score.you !== st.score.them) return false;
      st.cupOT = { at: st.n, at90: { you: st.score.you, them: st.score.them }, phase: 1 };
      st.x1 = Object.assign({}, st.x1 || {}, { m8: true });
      st.forcedYours = true; st.forcedTheirs = false; st.handoff = null; st.minuteNow = OT_MIN[0];
      /* OT REST (cup1 2026-10-05): the break gives back what the clock burned in the first half (legs() in match.js adds
       * back 100 - legsAt(45) for a line rested at 45; a line already rested later, by a substitution, keeps it) */
      var restedBefore = st.rested ? Object.assign({}, st.rested) : null;   /* a12 EFFX OT-3 */
      var spentBefore = null;
      if (OT_REST && BREAK !== 'otnorest' && st.rested) ['def', 'mid', 'att'].forEach(function (k) { if (st.rested[k] === null || st.rested[k] < 45) st.rested[k] = 45; });
      /* a12 ENG8 (otrest; review/monday-rev3 finding 13; his J2: "at the overtime break the user's men get back the first
       * half's tiredness"): the first half's tiredness is what the clock burned AND what your own choices spent (a carry,
       * a sprint, a safe pass): the rest above gives back the clock's; this gives back the choices' (match.js st.r12Half,
       * each line's spending when the first half ended), except on a line rested later in the match (a substitution or a
       * planned change wiped its spending then). st.cupOT.r12Back: what came back this way. */
      if (OT_REST && BREAK !== 'otnorest' && r12c('otrest') && st.r12Half && st.spent) {
        spentBefore = Object.assign({}, st.spent); st.cupOT.r12Back = { def: 0, mid: 0, att: 0 };
        ['def', 'mid', 'att'].forEach(function (k) {
          if (restedBefore && restedBefore[k] !== null && restedBefore[k] > 45) return;
          var back = Math.max(0, Math.min(st.spent[k] || 0, st.r12Half[k] || 0));
          if (back > 0) { st.spent[k] -= back; st.cupOT.r12Back[k] = back; }
        });
      }
      if (OT_REST) st.cupOT.rest = true;
      /* a12 EFFX (OT-3, his words: "Just say what actually happens: your players recovered X amount of stamina"): what the
       * rest gave back to each line, from the engine (KMMatch.otRestGain, RUL-E), kept for the overtime line. Read only:
       * nothing in the match changes. KM_OT3=off / ?ot3=off: the line of before; CUP_BREAK=otnogain: no number kept. */
      if (OT_REST && OT3 && restedBefore && BREAK !== 'otnogain') { var MXL = MXlib(); if (MXL && MXL.otRestGain) st.cupOT.gain = spentBefore ? MXL.otRestGain(st, restedBefore, spentBefore) : MXL.otRestGain(st, restedBefore); }
      /* a12 ENG7 (otline; review/monday-rev2 item 8, "It never says how much came back"): the same numbers as one sentence
       * for the overtime break screen (play.html p3Break reads st.cupOT.gainText; his words, OT-3: "your players
       * recovered X amount of stamina"). Words only. KM_R12_OFF=otline / ?r12off=otline: not set. */
      if (st.cupOT.gain && r12c('otline')) {
        var G7 = st.cupOT.gain, sg = function (n) { return (n >= 0 ? '+' : '') + n; };
        st.cupOT.gainText = 'Your players recovered stamina at the break (out of 100): defence ' + sg(G7.def) + ', midfield ' + sg(G7.mid) + ', attack ' + sg(G7.att) + '.';
      }
      return true;
    }
    if (O.phase === 1 && st.n >= O.at + 1) {
      O.phase = 2;
      if (st.handoff) {
        /* you won the ball back in their counter in your own overtime attack: the next moment is still theirs */
        st.handoff = null;
        var ev = st.log[st.log.length - 1];
        if (ev) { ev.handoff = false; ev.goesOn = false; ev.chains = null; ev.otCut = true; }
      }
      st.forcedTheirs = true; st.forcedYours = false; st.minuteNow = OT_MIN[1];
      return true;
    }
    return false;
  }
  /* what the page shows above the first decision of each overtime moment (null otherwise) */
  function otNote(st, p) {
    var O = st && st.cupOT;
    if (!O || !p || p.continues) return null;
    var G = O.gain;   /* a12 EFFX OT-3 */
    if (p.index === O.at + 1 && O.rest && G && BREAK !== 'otnoword') return 'Level after 90 minutes (' + O.at90.you + '-' + O.at90.them + '). Overtime: your players recovered stamina at the break (defence ' + G.def + ', midfield ' + G.mid + ', attack ' + G.att + '). One chance for you in their half, then one for them in your half. Still level after that: penalties.';
    if (p.index === O.at + 1 && O.rest && BREAK !== 'otnoword') return 'Level after 90 minutes (' + O.at90.you + '-' + O.at90.them + '). Overtime: your players have had a rest and get back some of their legs. One chance for you in their half, then one for them in your half. Still level after that: penalties.';   /* OT REST */
    if (p.index === O.at + 1) return 'Level after 90 minutes (' + O.at90.you + '-' + O.at90.them + '). Overtime: one chance for you in their half, then one for them in your half. Still level after that: penalties.';
    if (p.index === O.at + 2) return 'Overtime, the second half: their chance, in your half. Still level after it: penalties.';
    return null;
  }
  function otInfo(st) { return st && st.cupOT ? { ot: true, at90: { you: st.cupOT.at90.you, them: st.cupOT.at90.them } } : null; }
  function k1Record(run, score, acted, report, extra) {
    var i = run.match, o = opponentOf(run, i), ko = isStage(i, 'knockout');
    var won = score.you > score.them, drew = score.you === score.them;
    var pens = ko && drew ? k1Penalties(run, i) : null;
    var through = ko ? (won || !!(pens && pens.you > pens.them)) : true;
    run.results.push({ match: i, round: o.round, stage: o.stage, opp: o.name, effects: o.effects.slice(), shift: o.shift, you: score.you, them: score.them,
      result: won ? 'won' : drew ? 'drew' : 'lost', through: through, ot: !!(extra && extra.ot), at90: extra && extra.at90 ? { you: extra.at90.you, them: extra.at90.them } : null,
      pens: pens, owned: run.owned.slice() });
    Object.keys(acted || {}).forEach(function (k) { run.acted[k] = (run.acted[k] || 0) + acted[k]; });
    seasonAfter(run, report, !won && !drew);
    if (o.stage === 'group') k1RollGroup(run, i);
    if (BREAK === 'k1early') { run.fate = fateAt(run, i); if (terminal(run.fate)) run.over = true; }   /* (a break for k1_reload.js: the fate decided at the result) */
    if (run.lastOffer === 'skip') {
      var f = fateAt(run, i);
      if (terminal(f)) { run.fate = f; run.over = true; if (f === 'champion') run.champion = true; run.needBelief = false; return f === 'champion' ? 'champion' : 'out'; }
    }
    return 'next';
  }
  function k1Summary(run, out) {
    out.fmt = 7; out.fate = run.fate; out.table = k1Table(run, 3);
    out.path = run.results.map(function (r) { return { match: r.match, round: r.round, opp: r.opp, you: r.you, them: r.them, result: r.result, ot: r.ot, pens: r.pens ? { you: r.pens.you, them: r.pens.them } : null }; });
  }
  function k1TelResult(run, r, t) {
    t.fmt = 7; t.stage = r.stage; t.ot = r.ot; t.at90 = r.at90; t.pens = r.pens ? { you: r.pens.you, them: r.pens.them, kicks: r.pens.kicks.length } : null;
    if (r.stage === 'group') { var T = k1Table(run); t.group = { pos: T.pos, pts: T.rows.filter(function (x) { return x.you; })[0].pts, games: T.games.filter(function (g) { return g.md === r.match; }) }; }
    t.fateIf = fateIf(run);
  }
  /* a saved run of this version is 'ok'; one of another version 'older' or 'newer' (the page says so and starts a
   * new Cup); anything else 'bad' (put aside) */
  var SAVE_V = FMT === 7 ? 3 : 2;
  function saveAge(r) {
    if (validRun(r)) return 'ok';
    if (isObj(r) && typeof r.v === 'number' && r.v !== SAVE_V && (r.v === 2 || r.v === 3 || r.v < SAVE_V)) return r.v < SAVE_V ? 'older' : 'newer';
    return 'bad';
  }
  function k1Valid(r) {
    try {
      if (BREAK === 'novalidate') return !!r && r.v === 3 && !!r.seed;
      if (!isObj(r) || r.v !== 3 || r.fmt !== 7) return false;
      if (!isInt(r.seed, 1, 4294967295) || typeof r.id !== 'string' || !r.id) return false;
      if (!isInt(r.match, 1, MAX_MATCH) || typeof r.over !== 'boolean' || typeof r.champion !== 'boolean' || typeof r.endless !== 'boolean') return false;
      if (!r.endless && r.match > MATCHES + 1) return false;
      if (!isInt(r.slots, 1, 5) || (r.draw !== 'out' && r.draw !== 'through')) return false;
      if (r.lastOffer !== 'offer' && r.lastOffer !== 'skip') return false;
      if (r.fate !== null && K1_FATES.indexOf(r.fate) < 0) return false;
      if (!Array.isArray(r.clubs) || r.clubs.length !== CLUBS.length || r.clubs.some(function (c) { return CLUBS.indexOf(c) < 0; })) return false;
      if (!Array.isArray(r.owned) || r.owned.some(function (id, i) { return typeof id !== 'string' || !validKey(id) || r.owned.indexOf(id) !== i; })) return false;
      if (!isObj(r.acted) || Object.keys(r.acted).some(function (k) { return !isInt(r.acted[k], 0, 1e6); })) return false;
      if (!Array.isArray(r.results) || r.results.length > MAX_MATCH) return false;
      var badRes = r.results.some(function (x, i) {
        if (!isObj(x) || x.match !== i + 1 || !isInt(x.you, 0, 99) || !isInt(x.them, 0, 99) || ['won', 'drew', 'lost'].indexOf(x.result) < 0 ||
          typeof x.through !== 'boolean' || typeof x.opp !== 'string' || typeof x.round !== 'string' || typeof x.ot !== 'boolean') return true;
        var st = k1RoundOf(i + 1).stage;
        if (x.stage !== st) return true;
        if (x.result !== (x.you > x.them ? 'won' : x.you === x.them ? 'drew' : 'lost')) return true;
        var pensOk = x.pens === null || (isObj(x.pens) && isInt(x.pens.you, 0, 60) && isInt(x.pens.them, 0, 60) && x.pens.you !== x.pens.them && Array.isArray(x.pens.kicks));
        if (!pensOk || (x.pens !== null) !== (st === 'knockout' && x.result === 'drew')) return true;
        if (x.ot && (st !== 'knockout' || !isObj(x.at90) || x.at90.you !== x.at90.them)) return true;
        return x.through !== (st === 'group' ? true : x.result === 'won' || (!!x.pens && x.pens.you > x.pens.them));
      });
      if (badRes) return false;
      if (!Array.isArray(r.picks) || r.picks.some(function (p, i) { return !isObj(p) || !validKey(p.id) || p.match !== i + 1 || !Array.isArray(p.offered) || K1_FATES.indexOf(p.fate) < 0; })) return false;
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
      if (S.full !== undefined && (!isObj(S.full) || Object.keys(S.full).some(function (k) { return !isInt(S.full[k], 0, MAX_MATCH); }))) return false;
      var n = r.results.length, k = r.picks.length;
      /* the group's rolled matches: one for each group matchday recorded, the right pair, sensible numbers */
      if (!isObj(r.group) || !Array.isArray(r.group.games) || r.group.games.length !== Math.min(n, 3)) return false;
      if (r.group.games.some(function (g, j) { return !isObj(g) || g.md !== j + 1 || g.a !== K1_PAIRS[j][0] || g.b !== K1_PAIRS[j][1] || !isInt(g.ga, 0, 20) || !isInt(g.gb, 0, 20) || typeof g.sa !== 'number' || typeof g.sb !== 'number'; })) return false;
      /* the parts agree: before match m there are m-1 results and m-1 picks; after it (the offer) m results */
      if (k !== r.match - 1) return false;
      if (n !== r.match - 1 && n !== r.match) return false;
      /* every pick's fate is what the results make it; only the last can end the run (or the final's, before endless) */
      for (var j = 1; j <= k; j++) {
        var f = r.picks[j - 1].fate;
        if (f !== fateAt(r, j)) return false;
        if (j < k && f !== 'on' && !(j === MATCHES && f === 'champion' && r.endless)) return false;
        if (r.lastOffer === 'skip' && f !== 'on') return false;
      }
      var lastFate = k ? r.picks[k - 1].fate : null;
      if (r.lastOffer === 'skip') {
        var pend = n === r.match ? fateAt(r, n) : null;
        if (terminal(pend)) { if (r.fate !== pend || !r.over) return false; }
        else if (r.fate !== lastFate || r.over) return false;
        if (r.champion !== (n >= MATCHES && rawFate(r, MATCHES) === 'champion')) return false;
      } else {
        if (r.fate !== lastFate) return false;
        if (r.over !== (terminal(r.fate) && !(r.fate === 'champion' && r.endless))) return false;
        if (r.over && n !== r.match - 1) return false;
        if (r.champion !== (k >= MATCHES && r.picks[MATCHES - 1].fate === 'champion')) return false;
      }
      if (r.endless && (!r.champion || n < MATCHES)) return false;
      if (r.needBelief && (n === r.match || r.over)) return false;
      if (r.offers !== null && r.offers !== undefined && (!isObj(r.offers) || r.offers.match !== r.match || !Array.isArray(r.offers.list) ||
        r.offers.list.length !== 3 || r.offers.list.some(function (id) { return !validKey(id); }))) return false;
      return true;
    } catch (e) { return false; }
  }
  /* ================================================================ end of K1 */

  var API = { EFFX_POOL: function () { return { on: EFX_POOL, pool: FINAL_POOL.slice() }; } /* kmtree5 a12 (stream EFFX) */,
    validRun: validRun, phaseOf: phaseOf, guard: guard, PIECES: PIECES, PLAIN: PLAIN, AR: AR, REDIRECT: REDIRECT, ELITES: ELITES, BOSSES: BOSSES,
    MATCHES: MATCHES, TACTIC_SLOTS: TACTIC_SLOTS, DRAW: DRAW, BREAK: BREAK, SEASON: SEASON, SELLCAP: SELLCAP, CONF: CONF, confAt: confAt, confLine: confLine, STATS: STATS, STAT_LINES: STAT_LINES, STAT_NAME: STAT_NAME,
    CAPTAIN: CAPTAIN, BELIEF_IDS: BELIEF_IDS, CAT_WORD: CAT_WORD, ROLE_LINE: ROLE_LINE, ROLE_WORD: ROLE_WORD,
    newRun: newRun, roundOf: roundOf, opponentOf: opponentOf, effectsOf: effectsOf, effectView: effectView, matchSeed: matchSeed, squads: squads, buildOf: buildOf,
    oppBuildOf: oppBuildOf, runStateOf: runStateOf, rosterOf: rosterOf, orderOf: orderOf, catOf: catOf, canHold: canHold, signingOf: signingOf, signingFor: signingFor,
    extraSubs: extraSubs, drawOffers: drawOffers, offerView: offerView, replaces: replaces, pick: pick, chooseBelief: chooseBelief, isBeliefPiece: isBeliefPiece,
    moveOrder: moveOrder, swapIn: swapIn, shadowTimes: shadowTimes, releaseStandIn: releaseStandIn, T11: T11, swapRefusal: swapRefusal, canRelease: canRelease, releaseRefusal: releaseRefusal, release: release, keepGoing: keepGoing,
    record: record, actedIn: actedIn, summary: summary, byId: byId, isPiece: isPiece, parseKey: parseKey, pieceOf: pieceOf, nameOf: nameOf, owns: owns,
    ownedPieces: ownedPieces, sentence: sentence, cutPieces: cutPieces, makesState: makesState /* a15 D-4 */, statLine: statLine,
    telStart: telStart, telOffer: telOffer, telPick: telPick, telResult: telResult, telBelief: telBelief, telOrder: telOrder, telRelease: telRelease, telKeepGoing: telKeepGoing,
    setFX: function (FX) { FXREG = FX; },
    /* K1 */
    FMT: FMT, LASTOFFER: LASTOFFER, OT_REST: OT_REST, SAVE_V: SAVE_V, K1_SHORT: K1_SHORT, OT_MIN: OT_MIN, setLibs: setLibs, saveAge: saveAge, table: k1Table, fateAt: fateAt, fateIf: fateIf,
    penalties: k1Penalties, otStep: otStep, otNote: otNote, otInfo: otInfo, isStage: isStage,
    /* a12 CURVE */
    CURVE: CURVE, CURVES: CURVES,
    /* a12 GAME3b */
    G3B: G3B, G3B_CAP: G3B_CAP, G3B_SIGNAVG: G3B_SIGNAVG, G3B_SOLDX2: G3B_SOLDX2, PLAIN_STEP: PLAIN_STEP, STAT_CAP: STAT_CAP,
    plainGains: plainGains, plainNow: plainNow, teamAverage: teamAverage, nowSquad: nowSquad };
  root.KMCup = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
