/* THE CUP (st4, designer ruling 5 of 2026-09-29).
 *
 * His words: "give me three upgrade options at the end of each match, and I need to pick one. Don't tell
 * me which one is part of the build. I would need to be able to identify that myself and see the
 * opportunity."
 *
 * A run: Spain start with the plain squad and no pieces. Five matches, rising strength: four made-up clubs
 * (the random squads, each a little stronger, three of them playing an opponent build) and the final
 * against Argentina. Win and you go on; a draw or a loss ends the run (the match core has no extra time
 * and no penalties; ?cupdraw=through / KM_CUPDRAW=through lets a draw go through, for testing only).
 * After each won match (not after the final): three offers, pick one. An offer is a piece of the starter
 * set or a plain upgrade (+1 to one player's number, or one more substitution). Each offer says its name,
 * the player it goes on, and one plain sentence of what it does: never a family, a build name, or a hint
 * that two pieces go together.
 *
 * Limits: 3 tactic slots (a fourth tactic says which of yours it replaces: the oldest); one captain
 * piece (the other captain piece says it replaces the one you have). An owned piece is never offered.
 *
 * Pure logic, no DOM, no Math.random: every offer comes from the run's seed and the match number, so a
 * reload shows the same three. Browser: window.KMCup. Node: require('./cup.js').
 * The page (play.html) draws the screens and keeps the run in localStorage; cupsim.js plays whole runs
 * with the draft bots; cupcheck.js checks both.
 *
 * CUP_BREAK (env) / ?cupbreak= shows each cupcheck check fails: repeat (an owned piece is offered again),
 * family (an offer carries its family label), slots (a fourth tactic is added without replacing), tel (the
 * offer's telemetry drops the three options).
 */
(function (root) {
  'use strict';
  var BREAK = (function () {
    try { if (typeof process !== 'undefined' && process.env && process.env.CUP_BREAK) return process.env.CUP_BREAK; } catch (e) { }
    try { var m = /[?&]cupbreak=(\w+)/.exec((root.location && root.location.search) || ''); return m ? m[1] : ''; } catch (e) { return ''; }
  })();
  var DRAW = (function () {
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_CUPDRAW) return process.env.KM_CUPDRAW; } catch (e) { }
    try { var m = /[?&]cupdraw=(\w+)/.exec((root.location && root.location.search) || ''); return m ? m[1] : 'out'; } catch (e) { return 'out'; }
  })();
  if (DRAW !== 'through') DRAW = 'out';

  var MATCHES = 5;
  var TACTIC_SLOTS = 3;

  /* THE PIECES. Each: the component, what kind of slot it takes, the man it goes on, and one plain
   * sentence written from the rule as the engine plays it (st1 BUILD.md section 2, st3 changes). The
   * family letters of the starter set are kept here ONLY for the draft study (cupsim.js) and are never
   * put on an offer (cupcheck.js C4). */
  var PIECES = [
    { id: 'WE_DECOY', name: 'Decoy', kind: 'trait', on: 'Oyarzabal', fam: 'A',
      text: 'At the start of each of your attacks one of their centre-backs marks Oyarzabal: until he touches the ball, passes to him and his own moves in their half are -2, and anyone else\'s move against one of their defenders there is +1.' },
    { id: 'WE_ARRIVES_LATE', name: 'Arrives late', kind: 'trait', on: 'Fabián', fam: 'A',
      text: 'In their half, a pass meant for a man their defence is marking goes to Fabián instead, at +2 (a pull-back or a ball across the goal stays with its man).' },
    { id: 'RT_NOMINATE', name: 'Nominated receiver', kind: 'trait', on: 'Olmo', fam: 'A',
      text: 'Your cut-backs and low crosses go to Olmo, whoever the card would have sent them to.' },
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
  /* THE PLAIN UPGRADES: strength without a new decision, so not every offer is a piece */
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
  /* the roles the starter builds gave these men (the pieces read them: Run at him rattles on a half win
   * for a winger or carrier, and so on). Inert without pieces; put on the squad only once a piece is owned. */
  var ROLES = { Oyarzabal: ['link player'], 'Fabián': ['runner'], Olmo: ['finisher', 'carrier'], Yamal: ['winger'], Baena: ['winger'], Rodri: ['ball winner'] };

  /* THE FIVE OPPONENTS, rising strength. shift: added to every number of the club's eleven and keeper
   * (1 to 20). Measured with the planner as plain Spain, 300 matches each (BUILD.md): club -1 wins 94%,
   * club +0 with Deep block 86%, +1 with Pressing midfield 74%, +1 with the Counter-attacking side 78%,
   * Argentina 61% (a draw is 4 to 22% of these, and a draw ends the run). */
  var RAMPS = {
    /* the default: early rounds forgive, so a run usually sees two or three offers */
    gentle: [
      { round: 'Round 1', shift: -1, build: null },
      { round: 'Round 2', shift: 0, build: 'opp-deep-block' },
      { round: 'Quarter-final', shift: 1, build: 'opp-press-mid' },
      { round: 'Semi-final', shift: 1, build: 'opp-counter' },
      { round: 'Final', team: 'argentina', build: null }
    ],
    /* ?cupramp=hard / KM_CUPRAMP=hard: the first ramp tried (the planner won the cup about 1 run in 5) */
    hard: [
      { round: 'Round 1', shift: 0, build: null },
      { round: 'Round 2', shift: 1, build: 'opp-deep-block' },
      { round: 'Quarter-final', shift: 1, build: 'opp-press-mid' },
      { round: 'Semi-final', shift: 2, build: 'opp-counter' },
      { round: 'Final', team: 'argentina', build: null }
    ]
  };
  var RAMP = (function () {
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_CUPRAMP) return process.env.KM_CUPRAMP; } catch (e) { }
    try { var m = /[?&]cupramp=(\w+)/.exec((root.location && root.location.search) || ''); return m ? m[1] : 'gentle'; } catch (e) { return 'gentle'; }
  })();
  if (!RAMPS[RAMP]) RAMP = 'gentle';
  var ROUNDS = RAMPS[RAMP];
  var CLUBS = ['Fennbridge', 'Dunmoor Rangers', 'Brackwater', 'Holm Athletic', 'Ostergard', 'Calder Vale', 'Thistledown', 'Marrowgate', 'Pellhaven', 'Vord United', 'Saltcombe', 'Ninefields'];

  /* a small seeded generator of our own (the match core's RNG is not needed for this) */
  function mix(a, b) { var h = (a | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (b | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
  function Rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  function shuffle(list, r) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function byId(id) { return PIECES.filter(function (p) { return p.id === id; })[0] || PLAIN.filter(function (p) { return p.id === id; })[0] || null; }
  function isPiece(id) { return PIECES.some(function (p) { return p.id === id; }); }

  /* the component's own words for a piece whose rule another stream decides (Show them one side) */
  var FXREG = null;
  function fxDef(id) {
    try { var FX = FXREG || root.KMEffects || (typeof require === 'function' ? require('./effects.js') : null); return FX && FX.get ? FX.get(id) : null; } catch (e) { return null; }
  }
  function cutPieces() { var d = fxDef('AD_DECOY_ROUTE'); return d && d.cut ? ['AD_DECOY_ROUTE'] : []; }
  function sentence(it) {
    if (it.text) return it.text;
    if (it.attr) return it.on + '\'s ' + it.attr.charAt(0).toUpperCase() + it.attr.slice(1) + ' goes up by 1 for the rest of the cup.';
    var d = fxDef(it.id);
    return d ? String(d.cupText || d.text) : it.name;
  }

  function newRun(seed, opts) {
    opts = opts || {};
    seed = (seed >>> 0) || 1;
    var r = Rng(mix(seed, 77));
    var clubs = shuffle(CLUBS, r).slice(0, 4);
    return {
      v: 1, id: 'cup-' + seed.toString(36) + '-' + (opts.stamp || 0).toString(36), seed: seed,
      match: 1, over: false, champion: false,
      clubs: clubs, owned: [], picks: [], results: [], offers: null, acted: {},
      slots: opts.slots || TACTIC_SLOTS, draw: opts.draw || DRAW
    };
  }
  function roundOf(i) { return ROUNDS[i - 1]; }
  function matchSeed(run, i) { return mix(run.seed, 1000 + (i || run.match)) % 100000 + 1; }
  function opponentOf(run, i) {
    i = i || run.match;
    var R = roundOf(i), o = { match: i, round: R.round, build: R.build || null, shift: R.shift || 0 };
    if (R.team) { o.team = R.team; o.name = 'Argentina'; }
    else { o.name = run.clubs[i - 1]; o.clubSeed = mix(run.seed, 500 + i) % 100000 + 1; }
    return o;
  }

  /* the squads for match i: Spain with the plain upgrades, and the opponent. libs: { W, C, M, NM } */
  function squads(run, libs, i) {
    i = i || run.match;
    var seed = matchSeed(run, i), o = opponentOf(run, i);
    var you = libs.W.build('spain', seed), them;
    if (o.team) them = libs.W.build(o.team, seed);
    else {
      var C = libs.C, cs = o.clubSeed;
      them = libs.M.attach(C.makeSquad(new C.RNG(cs * 7 + 11), { club: o.name }), cs * 7 + 11);
      if (o.shift) them.players.concat(them.keeper ? [them.keeper] : []).forEach(function (p) {
        Object.keys(p.attr || {}).forEach(function (k) { if (typeof p.attr[k] === 'number') p.attr[k] = Math.max(1, Math.min(20, p.attr[k] + o.shift)); });
      });
      var dd = libs.NM && libs.NM.dedupe ? libs.NM.dedupe : C.dedupeNames;
      if (dd) dd([you, them], new C.RNG(seed + 1));
    }
    upgrade(you, run);
    return { you: you, them: them, seed: seed, opp: o };
  }
  function findMan(sq, name) {
    var all = sq.players.concat(sq.keeper ? [sq.keeper] : []).concat(sq.bench || []);
    return all.filter(function (p) { return String(p.name).split(' ')[0] === name; })[0] || null;
  }
  function upgrade(sq, run) {
    run.owned.forEach(function (id) {
      var u = byId(id);
      if (!u || u.kind !== 'plain' || !u.attr) return;
      var p = findMan(sq, u.on);
      if (p && p.attr && typeof p.attr[u.attr] === 'number') p.attr[u.attr] = Math.min(20, p.attr[u.attr] + 1);
    });
  }
  function extraSubs(run) { return run.owned.filter(function (id) { var u = byId(id); return u && u.subs; }).length; }

  /* the engine build for the pieces owned (null with none: the plain squad, exactly) */
  function buildOf(run) {
    var own = run.owned.filter(isPiece);
    if (!own.length) return null;
    var b = { id: 'cup-run', name: 'Your cup team', engine: '', base: 'spain', slots: Math.max(3, run.slots), tactics: [], players: [], captain: 'Rodri' };
    var men = {};
    Object.keys(ROLES).forEach(function (n) { men[n] = { name: n, roles: ROLES[n].slice(), traits: [] }; });
    own.forEach(function (id) {
      var p = byId(id);
      if (p.kind === 'tactic') b.tactics.push(id);
      else if (p.kind === 'captain') b.captain = { name: p.on, component: id };
      else { if (!men[p.on]) men[p.on] = { name: p.on, roles: [], traits: [] }; men[p.on].traits.push(id); }
    });
    Object.keys(men).forEach(function (n) { var m = men[n]; if (!m.traits.length) delete m.traits; b.players.push(m); });
    return b;
  }
  function oppBuildOf(run, builds, i) {
    var o = opponentOf(run, i);
    return o.build && builds ? builds[o.build] || null : null;
  }

  /* THE OFFERS after a won match: three distinct items nobody owns. Two pieces and a third that is a
   * plain upgrade half the time (a piece otherwise); plain upgrades fill in when the pieces run out. */
  function drawOffers(run) {
    if (run.offers && run.offers.match === run.match) return run.offers.list;
    var r = Rng(mix(run.seed, 3000 + run.match));
    var cut = cutPieces();
    var pieces = shuffle(PIECES.filter(function (p) { return (BREAK === 'repeat' || run.owned.indexOf(p.id) < 0) && cut.indexOf(p.id) < 0; }), r);
    var plain = shuffle(PLAIN.filter(function (p) { return run.owned.indexOf(p.id) < 0; }), r);
    var list = pieces.slice(0, 2);
    if (r() < 0.5 && plain.length) list.push(plain.shift()); else if (pieces.length > 2) list.push(pieces[2]);
    while (list.length < 3 && plain.length) list.push(plain.shift());
    while (list.length < 3 && pieces.length > list.length) list.push(pieces[list.length]);
    list = shuffle(list, r).map(function (it) { return it.id; });
    run.offers = { match: run.match, list: list };
    return list;
  }
  /* what an offer says: its name, who it goes on, one sentence, and what it replaces. Nothing else. */
  function offerView(run, id) {
    var it = byId(id);
    var v = { id: id, name: it.name, kind: it.kind === 'plain' ? 'upgrade' : it.kind, on: it.on || null, text: sentence(it) };
    v.where = it.kind === 'tactic' ? 'A tactic' : it.kind === 'captain' ? 'Captain ' + it.on : it.on ? 'On ' + it.on : 'The whole team';
    var rep = replaces(run, id);
    if (rep) v.replaces = { id: rep, name: byId(rep).name, why: it.kind === 'captain' ? 'you can have one captain piece' : 'you have ' + run.slots + ' tactic slots' };
    if (BREAK === 'family' && it.fam) v.family = 'Family ' + it.fam;
    return v;
  }
  function replaces(run, id) {
    var it = byId(id); if (!it) return null;
    if (it.kind === 'captain') return run.owned.filter(function (x) { var p = byId(x); return p && p.kind === 'captain'; })[0] || null;
    if (it.kind === 'tactic') {
      var tac = run.owned.filter(function (x) { var p = byId(x); return p && p.kind === 'tactic'; });
      return tac.length >= run.slots && BREAK !== 'slots' ? tac[0] : null;
    }
    return null;
  }
  function pick(run, id) {
    var list = drawOffers(run);
    if (list.indexOf(id) < 0) throw new Error('cup: ' + id + ' was not offered');
    var rep = replaces(run, id);
    if (rep) run.owned = run.owned.filter(function (x) { return x !== rep; });
    run.owned.push(id);
    run.picks.push({ match: run.match, id: id, name: byId(id).name, on: byId(id).on || null, replaced: rep || null, offered: list.slice() });
    run.offers = null;
    run.match++;
    return { replaced: rep };
  }
  /* a match's result; returns 'next' (offers), 'champion' or 'out' */
  function record(run, score, acted) {
    var i = run.match, won = score.you > score.them, drew = score.you === score.them;
    var through = won || (drew && run.draw === 'through');
    var o = opponentOf(run, i);
    run.results.push({ match: i, round: o.round, opp: o.name, oppBuild: o.build, you: score.you, them: score.them,
      result: won ? 'won' : drew ? 'drew' : 'lost', through: through, owned: run.owned.slice() });
    Object.keys(acted || {}).forEach(function (k) { run.acted[k] = (run.acted[k] || 0) + acted[k]; });
    if (!through) { run.over = true; return 'out'; }
    if (i >= MATCHES) { run.over = true; run.champion = true; return 'champion'; }
    return 'next';
  }
  /* decisions each piece acted on in one match (a line of its own in the match log, as the build panel counts) */
  function actedIn(st) {
    var out = {};
    if (!st || !st.fx) return out;
    var seen = {};
    (st.fx.log || []).forEach(function (l) {
      if (!l || !l.source || (l.side && l.side === 'them')) return;
      var name = String(l.source).replace(/ \([^()]*\)$/, '');
      if (!PIECES.some(function (p) { return p.name === name; })) return;
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
    return { champion: run.champion, reached: run.results.length, of: MATCHES, last: last, results: run.results.slice(),
      picks: run.picks.map(function (p) { return { match: p.match, name: p.name, on: p.on, replaced: p.replaced ? byId(p.replaced).name : null }; }),
      mostActed: mostActed,
      neverActed: run.owned.filter(isPiece).map(function (id) { return byId(id).name; }).filter(function (n) { return !run.acted[n]; }) };
  }

  /* THE TELEMETRY each step sends (the page logs these through telemetry.js; cupsim.js keeps them, and
   * cupcheck.js checks them). */
  function telStart(run) {
    var o = opponentOf(run);
    return { cupRun: run.id, match: run.match, of: MATCHES, round: o.round, opp: o.name, oppBuild: o.build,
      owned: run.owned.slice(), pieces: run.owned.filter(isPiece), upgrades: run.owned.filter(function (x) { return !isPiece(x); }), draw: run.draw };
  }
  function telOffer(run) {
    var list = drawOffers(run);
    return { cupRun: run.id, match: run.match - 0, owned: run.owned.slice(),
      offers: BREAK === 'tel' ? [] : list.map(function (id) { var v = offerView(run, id); return { id: id, name: v.name, on: v.on, kind: v.kind, replaces: v.replaces ? v.replaces.id : null }; }) };
  }
  function telPick(run, id, before) {
    return { cupRun: run.id, match: before, pick: id, offered: (run.picks[run.picks.length - 1] || {}).offered || [], replaced: (run.picks[run.picks.length - 1] || {}).replaced || null, owned: run.owned.slice() };
  }
  function telResult(run) {
    var r = run.results[run.results.length - 1];
    return { cupRun: run.id, match: r.match, you: r.you, them: r.them, result: r.result, through: r.through, over: run.over, champion: run.champion, owned: r.owned };
  }

  /* st4 (Codex review of st4, item 3): A SAVED RUN IS CHECKED BEFORE IT IS USED. Every field the screens read,
   * with its type and range, and that the parts agree (the results against the match number, the picks
   * against the results). Anything else is not a cup: the page puts it aside and offers a new one. */
  function isInt(n, a, b) { return typeof n === 'number' && n === Math.floor(n) && n >= a && n <= b; }
  function validRun(r) {
    try {
      if (BREAK === 'novalidate') return !!r && r.v === 1 && !!r.seed;
      if (!r || typeof r !== 'object' || Array.isArray(r) || r.v !== 1) return false;
      if (!isInt(r.seed, 1, 4294967295) || typeof r.id !== 'string' || !r.id) return false;
      if (!isInt(r.match, 1, MATCHES) || typeof r.over !== 'boolean' || typeof r.champion !== 'boolean') return false;
      if (!isInt(r.slots, 1, 5) || (r.draw !== 'out' && r.draw !== 'through')) return false;
      if (!Array.isArray(r.clubs) || r.clubs.length !== 4 || r.clubs.some(function (c) { return CLUBS.indexOf(c) < 0; })) return false;
      if (!Array.isArray(r.owned) || r.owned.some(function (id, i) { return typeof id !== 'string' || !byId(id) || r.owned.indexOf(id) !== i; })) return false;
      if (!r.acted || typeof r.acted !== 'object' || Object.keys(r.acted).some(function (k) { return !isInt(r.acted[k], 0, 1e6); })) return false;
      if (!Array.isArray(r.results) || r.results.length > MATCHES) return false;
      var badRes = r.results.some(function (x, i) {
        return !x || typeof x !== 'object' || x.match !== i + 1 || !isInt(x.you, 0, 99) || !isInt(x.them, 0, 99) || ['won', 'drew', 'lost'].indexOf(x.result) < 0 ||
          typeof x.through !== 'boolean' || typeof x.opp !== 'string' || typeof x.round !== 'string';
      });
      if (badRes) return false;
      if (!Array.isArray(r.picks) || r.picks.some(function (p, i) { return !p || typeof p !== 'object' || !byId(p.id) || p.match !== i + 1 || !Array.isArray(p.offered); })) return false;
      /* the parts agree: before match m there are m-1 results and m-1 picks; after it (the offer) m results */
      var n = r.results.length;
      if (r.picks.length !== r.match - 1) return false;
      if (n !== r.match - 1 && n !== r.match) return false;
      if (r.results.slice(0, r.match - 1).some(function (x) { return !x.through; })) return false;
      var last = r.results[n - 1];
      if (r.over !== (n === r.match && (!last.through || n === MATCHES))) return false;
      if (r.champion !== (r.over && n === MATCHES && last.through)) return false;
      if (r.offers !== null && r.offers !== undefined && (typeof r.offers !== 'object' || r.offers.match !== r.match || !Array.isArray(r.offers.list) ||
        r.offers.list.length !== 3 || r.offers.list.some(function (id) { return !byId(id); }))) return false;
      return true;
    } catch (e) { return false; }
  }
  /* where a run stands: 'sheet' (the next match to play), 'offer' (a win not yet paid out) or 'over' */
  function phaseOf(r) { return r.over ? 'over' : r.results.length >= r.match ? 'offer' : 'sheet'; }
  /* before a result or a pick is saved: the run in storage must still be this run, at this match, in this
   * phase (another tab may have played on). stored: what storage holds now (null when empty or unreadable). */
  function guard(stored, run) {
    if (BREAK === 'noguard' || !stored) return 'ok';
    return stored.id === run.id && stored.match === run.match && phaseOf(stored) === phaseOf(run) ? 'ok' : 'conflict';
  }

  var API = { validRun: validRun, phaseOf: phaseOf, guard: guard, PIECES: PIECES, PLAIN: PLAIN, ROUNDS: ROUNDS, RAMP: RAMP, MATCHES: MATCHES, TACTIC_SLOTS: TACTIC_SLOTS, DRAW: DRAW, BREAK: BREAK,
    newRun: newRun, opponentOf: opponentOf, matchSeed: matchSeed, squads: squads, buildOf: buildOf, oppBuildOf: oppBuildOf,
    extraSubs: extraSubs, drawOffers: drawOffers, offerView: offerView, replaces: replaces, pick: pick, record: record,
    actedIn: actedIn, summary: summary, byId: byId, isPiece: isPiece, sentence: sentence, cutPieces: cutPieces,
    telStart: telStart, telOffer: telOffer, telPick: telPick, telResult: telResult,
    setFX: function (FX) { FXREG = FX; } };
  root.KMCup = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
