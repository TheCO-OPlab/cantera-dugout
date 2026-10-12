/* Replay the 2026 World Cup final: Spain against Argentina.
 *
 * THE FACTS (checked 2026-09-23, not from memory):
 *   Played 19 July 2026, MetLife Stadium, East Rutherford. Spain 1, Argentina 0
 *   after extra time. Ferran Torres scored in the 106th minute, having come on
 *   in the 62nd. Enzo Fernandez was sent off in the 93rd minute (90+3) for a
 *   second yellow card (first in the 82nd).
 *
 * Sources:
 *   Starting elevens, formations, substitutes and minutes:
 *     https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_final   (position codes, shirt numbers, sub minutes, cards)
 *     https://www.espn.com/soccer/match/_/gameId/760517/argentina-spain   (formations 4-2-3-1 and 4-4-2, subs)
 *     https://www.si.com/soccer/spain-vs-argentina-confirmed-lineups-2026-world-cup-final   (confirmed elevens, formations)
 *     https://www.beinsports.com/en-us/soccer/fifa-world-cup-2026/articles/confirmed-lineups-for-spain-and-argentina-in-the-fifa-world-cup-final-2026-07-19
 *     https://www.espn.com/soccer/story/_/id/49400794/argentina-spain-fifa-2026-world-cup-final-starting-lineups
 *   Heights: FIFA's official squad list, version dated 19 July 2026, height in cm:
 *     https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf
 *   cross-checked against each player's English Wikipedia infobox.
 *
 * WHERE THE SOURCES DISAGREE OR COULD NOT BE CHECKED:
 *   - The olympics.com live page
 *     (https://www.olympics.com/en/news/fifa-world-cup-2026-spain-argentina-final-score-lineups-live-updates)
 *     timed out on every attempt, so it is NOT one of the sources above.
 *   - The four lineup sources agree on all 22 starters. They disagree on the
 *     ORDER of Argentina's midfield (beIN lists Mac Allister, De Paul, Enzo,
 *     Gonzalez; Wikipedia and SI list De Paul, Enzo, Mac Allister, Gonzalez)
 *     and beIN writes Spain as a 4-3-3 rather than 4-2-3-1. Left and right
 *     below follow Wikipedia's position codes (RB, CB, CB, LB; RM ... LM;
 *     RF, CF, LF).
 *   - Argentina substitution minutes: Wikipedia gives Otamendi 44, Paredes 46,
 *     Molina 58, Medina 70, Simeone 70, Senesi 102. ESPN's page, as read,
 *     gave the same six players but shifted minutes (45, 52, 58, 70, 70).
 *     Wikipedia's minutes are used. Spain's six and their minutes agree.
 *   - Heights: FIFA and Wikipedia differ by 1 to 5 cm for twelve players
 *     (largest: Yamal 1.83 FIFA / 1.78 Wikipedia, Molina 1.79 / 1.75,
 *     Olmo 1.79 / 1.82, Eric Garcia 1.83 / 1.80). FIFA's figure is used.
 *   - One search summary said Emiliano Martinez was replaced by Otamendi.
 *     That is wrong: Wikipedia and ESPN both say Otamendi replaced LISANDRO
 *     Martinez in the 44th minute. The keeper played the whole match.
 *
 * THE STATS ARE INVENTED for this non-commercial prototype. Nobody rated
 * these players; the numbers are a football fan's impression, calibrated to
 * the engine's 1 to 20 range (random squads average about 12 and show a 20
 * on 0.3 percent of attributes). These two squads average about 14, the one
 * 20 on the sheet is Messi's Intelligence.
 *
 * FORMATIONS. The engine has 4-4-2, 4-3-3, 3-5-2 and 5-3-2 only.
 *   Spain played 4-2-3-1 (ESPN, SI). Wikipedia's codes for the same eleven are
 *   DM, CM, CM, RF, CF, LF, which IS a 4-3-3, so Spain are a 4-3-3 here:
 *   Rodri in the middle of three, Olmo right of him, Fabian left; Yamal,
 *   Oyarzabal and Baena across the front. What is lost: Olmo played further
 *   forward than Fabian, and the engine's midfield line is flat.
 *   Argentina played 4-4-2 and the engine has it exactly.
 *
 * NAMES. Every match sentence calls a man by the FIRST space-separated token
 * of p.name (attributes.js shape, match.js first(), options.js first(), the
 * team sheet in play.html). So `name` here is the single name a commentator
 * uses ("Messi", "Rodri", "Yamal", "Enzo"), and the full name lives in
 * `fullName`, which the engine never reads. Two-word surnames are joined with
 * a NO-BREAK SPACE (U+00A0) so they stay one token: "De Paul", "Mac Allister".
 * Where two men share a surname the given name is used: the keeper is
 * "Martinez", the defender is "Lisandro". Sentence names are unique across
 * both squads (worldcup_check.js asserts it).
 *
 * Classic script for the browser (window.KMWorldCup) and a module for node,
 * like the other v2 files.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  function namesLib() {
    if (root.KMNames) return root.KMNames;
    if (typeof require !== 'function') return null;
    try { return require('./names.js'); } catch (e) { return null; }
  }

  var NB = String.fromCharCode(160);   // no-break space: joins a two-word surname into one sentence token
  var OUTFIELD = ['pace', 'physical', 'technique', 'passing', 'finishing', 'defending', 'intelligence'];
  var KEEPER = ['reflexes', 'communication', 'distribution', 'physique', 'intelligence'];

  /* One player per call. Outfield: the seven in ATTRS order
   * (pace, physical, technique, passing, finishing, defending, intelligence).
   * Keeper: his own five (reflexes, communication, distribution, physique,
   * intelligence). line/slot are null on the bench. Slots: 0-1 left, 2 centre,
   * 3-4 right. pos is the code names.js prints for this role in this slot;
   * worldcup_check.js asserts the two agree. */
  function P(name, fullName, number, role, line, slot, pos, heightM, stats) {
    var ids = role === 'keeper' ? KEEPER : OUTFIELD, attr = {};
    ids.forEach(function (id, i) { attr[id] = stats[i]; });
    return { name: name, fullName: fullName, number: number, role: role,
      line: line, slot: slot, pos: pos, heightM: heightM, attr: attr };
  }

  /*                name          full name               no. role                     line slot pos    height   PAC PHY TEC PAS FIN DEF INT */
  var SPAIN = {
    id: 'spain', name: 'Spain', flag: '🇪🇸',
    formation: '4-3-3', realFormation: '4-2-3-1',
    keeper:       P('Simón',   'Unai Simón',        23, 'keeper',                null, null, 'GK',  1.90, [14, 15, 16, 15, 15]),
    players: [
      P('Cucurella',  'Marc Cucurella',        24, 'full-back',             0, 0, 'LB',  1.73, [15, 14, 12, 12,  6, 16, 14]),
      P('Laporte',    'Aymeric Laporte',       14, 'centre-back',           0, 1, 'CB',  1.91, [11, 16, 13, 15,  7, 16, 15]),
      P('Cubarsí', 'Pau Cubarsí',     22, 'ball-playing-defender', 0, 3, 'BPD', 1.83, [13, 13, 15, 16,  4, 16, 16]),
      P('Porro',      'Pedro Porro',           12, 'full-back',             0, 4, 'RB',  1.73, [16, 12, 14, 15,  9, 13, 13]),
      P('Fabián', 'Fabián Ruiz',      8, 'box-to-box',            1, 1, 'CM',  1.88, [12, 15, 16, 16, 13, 13, 16]),
      P('Rodri',      'Rodri',                 16, 'deep-lying-playmaker',  1, 2, 'DLP', 1.90, [10, 16, 16, 18, 12, 16, 19]),
      P('Olmo',       'Dani Olmo',             10, 'advanced-playmaker',    1, 3, 'AM',  1.79, [14, 11, 17, 16, 15,  8, 17]),
      P('Baena',      'Álex Baena',       15, 'winger',                2, 0, 'LW',  1.72, [14, 10, 16, 17, 13,  8, 15]),
      P('Oyarzabal',  'Mikel Oyarzabal',       21, 'poacher',               2, 2, 'ST',  1.81, [13, 13, 15, 13, 17,  8, 16]),
      P('Yamal',      'Lamine Yamal',          19, 'winger',                2, 4, 'RW',  1.83, [17, 10, 17, 17, 15,  5, 16])
    ],
    /* the six who came on, in the order they came on */
    bench: [
      P('Torres',     'Ferran Torres',          7, 'inside-forward',        null, null, 'IF',  1.83, [15, 12, 14, 12, 16,  7, 14]),
      P('Pedri',      'Pedri',                 20, 'advanced-playmaker',    null, null, 'AM',  1.74, [13, 11, 18, 18, 12, 10, 18]),
      P('Merino',     'Mikel Merino',           6, 'box-to-box',            null, null, 'CM',  1.88, [11, 17, 14, 14, 14, 14, 15]),
      P('Williams',   'Nico Williams',         17, 'winger',                null, null, 'W',   1.81, [19, 11, 16, 13, 14,  6, 13]),
      P('Zubimendi',  'Martín Zubimendi', 18, 'deep-lying-playmaker',  null, null, 'DLP', 1.81, [11, 14, 15, 16,  9, 16, 17]),
      P('García', 'Eric García',      4, 'ball-playing-defender', null, null, 'BPD', 1.83, [11, 13, 14, 16,  5, 14, 15])
    ],
    subs: [
      { minute: 62, off: 'Oyarzabal', on: 'Torres' },
      { minute: 62, off: 'Fabián', on: 'Pedri' },
      { minute: 75, off: 'Baena', on: 'Merino' },
      { minute: 75, off: 'Olmo', on: 'Williams' },
      { minute: 99, off: 'Rodri', on: 'Zubimendi' },
      { minute: 99, off: 'Laporte', on: 'García' }
    ]
  };

  var ARGENTINA = {
    id: 'argentina', name: 'Argentina', flag: '🇦🇷',
    formation: '4-4-2', realFormation: '4-4-2',
    keeper:       P('Martínez', 'Emiliano Martínez', 23, 'keeper',          null, null, 'GK',  1.95, [15, 17, 13, 17, 16]),
    players: [
      P('Tagliafico', 'Nicolás Tagliafico', 3, 'full-back',            0, 0, 'LB',  1.72, [13, 14, 12, 12,  7, 15, 15]),
      P('Lisandro',   'Lisandro Martínez',  6, 'ball-playing-defender', 0, 1, 'BPD', 1.75, [13, 15, 13, 15,  5, 16, 16]),
      P('Romero',     'Cristian Romero',       13, 'centre-back',           0, 3, 'CB',  1.85, [13, 17, 12, 12,  8, 18, 14]),
      P('Montiel',    'Gonzalo Montiel',        4, 'full-back',             0, 4, 'RB',  1.75, [13, 13, 12, 12,  7, 14, 13]),
      P('González', 'Nico González',  15, 'box-to-box',            1, 0, 'LM',  1.80, [16, 14, 14, 13, 13, 11, 13]),
      P('Mac' + NB + 'Allister', 'Alexis Mac Allister', 20, 'box-to-box',   1, 1, 'CM',  1.76, [12, 14, 16, 16, 14, 14, 17]),
      P('Enzo',       'Enzo Fernández',    24, 'deep-lying-playmaker',  1, 3, 'DLP', 1.78, [12, 14, 16, 17, 13, 13, 16]),
      P('De' + NB + 'Paul', 'Rodrigo De Paul',  7, 'box-to-box',            1, 4, 'RM',  1.78, [14, 16, 14, 15, 10, 14, 15]),
      P('Álvarez', 'Julián Álvarez', 9, 'poacher',           2, 1, 'ST',  1.70, [15, 15, 15, 13, 17,  9, 16]),
      P('Messi',      'Lionel Messi',          10, 'inside-forward',        2, 3, 'IF',  1.70, [ 9,  8, 19, 19, 17,  4, 20])
    ],
    bench: [
      P('Otamendi',   'Nicolás Otamendi',  19, 'centre-back',          null, null, 'CB',  1.82, [ 8, 15, 11, 12,  6, 16, 16]),
      P('Paredes',    'Leandro Paredes',         5, 'deep-lying-playmaker', null, null, 'DLP', 1.82, [ 9, 14, 14, 17, 10, 13, 16]),
      P('Molina',     'Nahuel Molina',          26, 'full-back',            null, null, 'FB',  1.79, [16, 12, 13, 13,  8, 12, 12]),
      P('Medina',     'Facundo Medina',         25, 'centre-back',          null, null, 'CB',  1.84, [12, 14, 12, 13,  5, 15, 13]),
      P('Simeone',    'Giuliano Simeone',       17, 'winger',               null, null, 'W',   1.74, [17, 14, 12, 11, 12,  9, 12]),
      P('Senesi',     'Marcos Senesi',           2, 'ball-playing-defender', null, null, 'BPD', 1.85, [11, 15, 13, 15,  6, 15, 14])
    ],
    subs: [
      { minute: 44, off: 'Lisandro', on: 'Otamendi' },
      { minute: 46, off: 'González', on: 'Paredes' },
      { minute: 58, off: 'Montiel', on: 'Molina' },
      { minute: 70, off: 'Romero', on: 'Medina' },
      { minute: 70, off: 'De' + NB + 'Paul', on: 'Simeone' },
      { minute: 102, off: 'Álvarez', on: 'Senesi' }
    ]
  };

  /* ATTACK LIFT. Eduardo, 2026-09-23, after playing the final: "it's
   * impossible to score goals currently even with relatively lucky dice
   * rolls ... increase the finishing and technique of the attackers by 1 to
   * 2." Two strong defences left the final at about 0.45 goals a side. Applied
   * here, on top of the numbers above, so the originals stay readable and the
   * dose is one line to change. Attackers = the front line on the pitch plus
   * the forwards on the bench (winger, inside-forward, poacher, target). */
  var ATTACK_LIFT = { finishing: 2, technique: 2 };
  var ATTACKING_ROLES = { winger: 1, 'inside-forward': 1, poacher: 1, 'target-forward': 1 };
  [SPAIN, ARGENTINA].forEach(function (T) {
    T.players.concat(T.bench).forEach(function (p) {
      if (!(p.line === 2 || (p.line === null && ATTACKING_ROLES[p.role]))) return;
      for (var k in ATTACK_LIFT) p.attr[k] = Math.min(20, p.attr[k] + ATTACK_LIFT[k]);
    });
  });

  var MATCH = {
    date: '2026-07-19', venue: 'MetLife Stadium, East Rutherford', attendance: 80663,
    score: { spain: 1, argentina: 0 }, afterExtraTime: true,
    goals: [{ team: 'spain', minute: 106, name: 'Torres' }],
    cards: [
      { team: 'argentina', minute: 82, name: 'Enzo', card: 'yellow' },
      { team: 'argentina', minute: 93, name: 'Enzo', card: 'red',
        text: 'Second yellow card, in the third minute of added time.' }
    ]
  };

  var TEAMS = { spain: SPAIN, argentina: ARGENTINA };

  /* KEYWORDS (kmtree b1, keywords.js). A football fan's reading of what each
   * man is known for, not a rating: Messi and Yamal run at defenders, Rodri
   * pass through lines, Oyarzabal and Torres are first to a loose ball,
   * Merino wins headers, Baena and Messi take free kicks. Invented for
   * this prototype like the numbers. Some of the best keywords are on the
   * bench on purpose (Merino's header, Torres at the loose ball, Pedri), so
   * picking the eleven changes which options exist. */
  var KEYWORDS = {
    spain: {
      'Simón': ['SWEEPER_KEEPER'],
      Cucurella: ['CROSSER'], Laporte: ['BLOCKER'], 'Cubarsí': ['PLAYMAKER'], Porro: ['CROSSER'],
      'Fabián': ['LATE_RUN'], Rodri: ['PLAYMAKER', 'BALL_WINNER'], Olmo: ['DRIBBLER'],
      Baena: ['FREEKICK'], Oyarzabal: ['POACHER'], Yamal: ['DRIBBLER'],
      Torres: ['POACHER'], Pedri: ['PLAYMAKER', 'DRIBBLER'], Merino: ['TARGET', 'LATE_RUN'],
      Williams: ['DRIBBLER', 'CROSSER'], Zubimendi: ['BALL_WINNER'], 'García': []
    },
    argentina: {
      'Martínez': ['CATCHER'],
      Tagliafico: [], Lisandro: [], Romero: ['DESTROYER'], Montiel: [],
      'González': ['CROSSER'], Enzo: ['PLAYMAKER'],
      'Álvarez': ['POACHER'], Messi: ['DRIBBLER', 'FREEKICK'],
      Otamendi: ['BLOCKER'], Paredes: ['PLAYMAKER', 'FREEKICK'], Molina: ['CROSSER'], Medina: [],
      Simeone: ['DRIBBLER'], Senesi: []
    }
  };
  KEYWORDS.argentina['Mac' + NB + 'Allister'] = ['LATE_RUN'];
  KEYWORDS.argentina['De' + NB + 'Paul'] = ['BALL_WINNER'];

  var PERSON = {
    nerve: ['big-game', 'steady', 'nervous'],
    drive: ['driven', 'steady', 'coasting'],
    loyalty: ['loyal', 'neutral', 'restless']
  };
  function heightWord(m) { return m < 1.75 ? 'short' : m < 1.85 ? 'average' : 'tall'; }

  /* The fields attach() gives a player, in its order, plus fullName and
   * number, which the engine never reads. */
  function toPlayer(d, teamId, rng, where) {
    var base = C.ROLES[d.role];
    var p = {
      id: 'wc-' + teamId + '-' + d.number,
      name: d.name, fullName: d.fullName, number: d.number,
      role: d.role, short: base.short, homeLine: base.line,
      /* the older shared kit's three numbers, from the role with no jitter;
       * the v2 engine never reads them */
      win: base.w, prog: base.p, fin: base.f,
      keywords: []
    };
    if (where !== 'keeper') { p.line = d.line; p.slot = d.slot; }
    p.attr = {};
    for (var k in d.attr) p.attr[k] = d.attr[k];
    if (where === 'keeper') p.isKeeper = true;
    p.heightM = d.heightM;
    p.height = heightWord(d.heightM);
    p.limb = 'human';          // attach picks a creature part here; these are people
    p.form = 0;
    /* hidden personality, seeded so ?seed= replays it; it never touches a contest */
    p.person = { nerve: rng.pick(PERSON.nerve), drive: rng.pick(PERSON.drive), loyalty: rng.pick(PERSON.loyalty) };
    p.pos = d.pos;
    p.kw = ((KEYWORDS[teamId] || {})[d.name] || []).slice();
    return p;
  }

  /* A squad shaped like M.attach(C.makeSquad(...), seed): club, formation,
   * keeper, players, bench, named. Fresh objects on every call, so one match
   * cannot leak state into the next. named = true, so names.js never renames
   * anyone; pos is then set by names.js itself when it is loaded.
   *
   * One deliberate difference: attach leaves bench players WITHOUT attr or
   * height. These have both, because they are real players and a sheet should
   * be able to show them. That makes the FRESH_LEGS option in options.js
   * possible (it needs a bench player with attr), which never happens with a
   * random squad. Pass { benchStats: false } to match attach exactly. */
  function build(teamId, seed, opts) {
    opts = opts || {};
    var T = TEAMS[teamId];
    if (!T) throw new Error('worldcup: no team called ' + teamId);
    var rng = new C.RNG(((seed || 1) ^ 0x57432026) >>> 0);
    var squad = {
      club: T.name,
      formation: T.formation,
      keeper: toPlayer(T.keeper, T.id, rng, 'keeper'),
      players: T.players.map(function (d) { return toPlayer(d, T.id, rng, 'pitch'); }),
      bench: T.bench.map(function (d) {
        var p = toPlayer(d, T.id, rng, 'bench');
        if (opts.benchStats === false) {
          ['attr', 'heightM', 'height', 'limb', 'form', 'person'].forEach(function (k) { delete p[k]; });
        }
        return p;
      }),
      named: true, kwDone: true,
      team: T.id, flag: T.flag, realFormation: T.realFormation
    };
    var N = namesLib();
    if (N) N.setPos(squad);
    return squad;
  }

  var API = { TEAMS: TEAMS, MATCH: MATCH, build: build, NBSP: NB, KEYWORDS: KEYWORDS };
  root.KMWorldCup = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
