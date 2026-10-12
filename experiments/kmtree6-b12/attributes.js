/* The seven. Ruled by Eduardo 2026-09-21.
 *
 * His words: "not sold on the 7 stats fully. But let's commit because
 * otherwise we end with FM levels of stats."
 *
 * So the count is the design. SEVEN, and height is not one of them because it
 * is a fact about the body you can see rather than a number you rate. An
 * eighth attribute is not forbidden, it is EXPENSIVE: tests/seven.test asserts
 * the count, so adding one breaks a check and has to be argued in a commit
 * message rather than drifting in.
 *
 * Why these seven and not the six he first picked: FIFA's own headline set
 * keeps PACE separate from PHYSICAL, and it is right to. Merged, Giroud and
 * Aguero both score 15 and become the same player, which is the exact collapse
 * he asked about. Intelligence is his addition and it is the one FIFA lacks.
 *
 * Scale is 1 to 20, FM-shaped, because the fusion doctrine already moves a
 * stat by plus or minus one and that has to mean something.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  /* Names and position codes. Optional: without names.js the squad keeps the
   * shared generator's names and no pos. Looked up at attach time, not load
   * time, because play.html loads names.js AFTER this file. */
  function namesLib() {
    if (root.KMNames) return root.KMNames;
    if (typeof require !== 'function') return null;
    try { return require('./names.js'); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------- the seven */

  var ATTRS = [
    { id: 'pace', name: 'Pace', short: 'PAC',
      text: 'Ground covered and ground won. The difference between Cannavaro and Van Dijk, and between Aguero and Giroud.' },
    { id: 'physical', name: 'Physical', short: 'PHY',
      text: 'Strength, stamina, the will to go again. Holds off a man, and still running at eighty minutes.' },
    { id: 'technique', name: 'Technique', short: 'TEC',
      text: 'First touch and what he can do with it within a metre.' },
    { id: 'passing', name: 'Passing', short: 'PAS',
      text: 'Weight, range and whether the ball arrives where it was meant to.' },
    { id: 'finishing', name: 'Finishing', short: 'FIN',
      text: 'What happens when the chance falls to him.' },
    { id: 'defending', name: 'Defending', short: 'DEF',
      text: 'Tackling, marking, and getting a foot in.' },
    { id: 'intelligence', name: 'Intelligence', short: 'INT',
      text: 'Reading it early, being in the right place, and knowing which pass is on. The one FIFA does not have and FM is built on.' }
  ];
  var ATTR_IDS = ATTRS.map(function (a) { return a.id; });

  /* Keepers are rated on their own five, ruled by Eduardo 2026-09-21:
   * "they'll need a different set of traits, like Reflexes, Communication,
   * Distribution, Physique, Intelligence". Rating a keeper on the outfield
   * seven was wrong and known to be wrong; it became load-bearing the moment
   * a sweeper-keeper had to be able to unlock an option. */
  var KEEPER_ATTRS = [
    { id: 'reflexes', name: 'Reflexes', short: 'REF', text: 'The save he has no right to make.' },
    { id: 'communication', name: 'Communication', short: 'COM', text: 'Organises the line in front of him. Fewer things go wrong.' },
    { id: 'distribution', name: 'Distribution', short: 'DIS', text: 'What happens once he has it. A sweeper-keeper lives here.' },
    { id: 'physique', name: 'Physical', short: 'PHY', text: 'Claims crosses, holds his ground in a crowd.' },
    { id: 'intelligence', name: 'Intelligence', short: 'INT', text: 'When to come, and when to stay.' }
  ];
  var KEEPER_IDS = KEEPER_ATTRS.map(function (a) { return a.id; });
  var KEEPER_PROFILE = { reflexes: 13, communication: 12, distribution: 10, physique: 13, intelligence: 13 };

  /* Height is a BODY FACT, not an attribute. You can see it on the creature,
   * and the parts doctrine says the body and the sheet never disagree. */
  /* Height is a real measurement in metres, printed on the player card, not a
   * word and not a rating. His instruction: "a Heading stat that is nowhere
   * for the player to find on a player while deciding a lineup is
   * unacceptable", and his formula: "physical + 10*height. if height is in
   * meters (1.98) that becomes physical+19.8". */
  var HEIGHTS = {
    short:   { name: 'Short',   note: 'Gets under it in a crowded box.' },
    average: { name: 'Average', note: '' },
    tall:    { name: 'Tall',    note: 'Wins the ball in both boxes.' }
  };
  var HEIGHT_RANGE = { short: [1.65, 1.75], average: [1.75, 1.85], tall: [1.85, 2.01] };
  function heightWord(m) { return m < 1.75 ? 'short' : m < 1.85 ? 'average' : 'tall'; }

  /* Personality is hidden and never touches a contest directly: it moves FORM,
   * and form is read into the attributes at match time. That is the rule from
   * docs/dna-mentality-traits-draft.md section 3, kept rather than reinvented. */
  var PERSONALITY = {
    nerve: { name: 'Nerve', values: ['big-game', 'steady', 'nervous'],
      text: 'What a big tie does to him. Moves form, never a contest.' },
    drive: { name: 'Drive', values: ['driven', 'steady', 'coasting'],
      text: 'How fast he develops from playing.' },
    loyalty: { name: 'Loyalty', values: ['loyal', 'neutral', 'restless'],
      text: 'What he does when somebody comes for him in the off-season.' }
  };

  /* --------------------------------------------------------- role profiles */
  /* Means on the 1 to 20 scale. The pair that had to come out right is
   * target-forward against poacher: that IS Giroud against Aguero, and if the
   * seven cannot tell them apart the seven are wrong. */

  var PROFILES = {
    'keeper':                { pace: 8,  physical: 13, technique: 10, passing: 10, finishing: 2,  defending: 14, intelligence: 13, tall: 0.6 },
    'centre-back':           { pace: 10, physical: 16, technique: 9,  passing: 9,  finishing: 5,  defending: 17, intelligence: 14, tall: 0.7 },
    'ball-playing-defender': { pace: 11, physical: 13, technique: 13, passing: 15, finishing: 5,  defending: 14, intelligence: 15, tall: 0.5 },
    'full-back':             { pace: 15, physical: 11, technique: 12, passing: 12, finishing: 5,  defending: 13, intelligence: 12, tall: 0.2 },
    'wing-back':             { pace: 17, physical: 11, technique: 13, passing: 12, finishing: 7,  defending: 11, intelligence: 11, tall: 0.15 },
    'ball-winner':           { pace: 13, physical: 15, technique: 10, passing: 10, finishing: 5,  defending: 16, intelligence: 13, tall: 0.35 },
    'deep-lying-playmaker':  { pace: 9,  physical: 11, technique: 16, passing: 18, finishing: 7,  defending: 9,  intelligence: 17, tall: 0.3 },
    'box-to-box':            { pace: 14, physical: 15, technique: 13, passing: 13, finishing: 11, defending: 12, intelligence: 13, tall: 0.35 },
    'advanced-playmaker':    { pace: 12, physical: 9,  technique: 17, passing: 17, finishing: 12, defending: 6,  intelligence: 16, tall: 0.15 },
    'winger':                { pace: 17, physical: 9,  technique: 16, passing: 13, finishing: 12, defending: 6,  intelligence: 11, tall: 0.1 },
    'inside-forward':        { pace: 16, physical: 11, technique: 16, passing: 12, finishing: 16, defending: 5,  intelligence: 13, tall: 0.15 },
    'target-forward':        { pace: 8,  physical: 17, technique: 12, passing: 12, finishing: 15, defending: 6,  intelligence: 13, tall: 0.85 },
    'poacher':               { pace: 15, physical: 11, technique: 13, passing: 8,  finishing: 18, defending: 4,  intelligence: 15, tall: 0.1 }
  };

  /* Where a number came from, so the card and the body agree. Placeholder
   * until the parts rig feeds it: the rig is not dogma (his words) and this is
   * the hook it will plug into. */
  var LIMBS = {
    tall: ['elephant legs', 'heron neck', 'giraffe frame', 'bear shoulders'],
    average: ['wolf frame', 'lion build', 'badger shoulders', 'boar chest'],
    short: ['hare legs', 'cat frame', 'otter build', 'fox legs']
  };

  /* One outfield player's seven, height, limb, form and personality, drawn
   * from his role profile with the rng passed in. */
  function rollOutfield(p, rng) {
    var prof = PROFILES[p.role] || PROFILES['box-to-box'];
    p.attr = {};
    ATTR_IDS.forEach(function (id) {
      p.attr[id] = Math.max(1, Math.min(20, prof[id] + rng.range(-2, 2)));
    });
    var r = rng.next();
    var band = r < prof.tall ? 'tall' : (r > 1 - prof.tall * 0.55 + 0.25 ? 'short' : 'average');
    var rg = HEIGHT_RANGE[band];
    p.heightM = Math.round((rg[0] + rng.next() * (rg[1] - rg[0])) * 100) / 100;
    p.height = heightWord(p.heightM);
    p.limb = rng.pick(LIMBS[p.height]);
    p.form = 0;
    p.person = {
      nerve: rng.pick(PERSONALITY.nerve.values),
      drive: rng.pick(PERSONALITY.drive.values),
      loyalty: rng.pick(PERSONALITY.loyalty.values)
    };
  }

  /* opts.benchStats: give the bench the same numbers the eleven have, so the
   * team sheet can show them and a bench player can be picked to start
   * (Eduardo, 2026-09-23: pick the eleven knowing the opponent). Off by
   * default, so every existing caller gets exactly the squad it got before.
   * The bench has its OWN rng, seeded from the same seed, and is drawn after
   * the eleven: no number on the pitch moves for any seed. */
  function attach(squad, seed, opts) {
    opts = opts || {};
    var rng = new C.RNG(seed || 1);
    if (squad.keeper && !squad.keeper.attr) {
      var k = squad.keeper;
      k.attr = {}; k.isKeeper = true;
      KEEPER_IDS.forEach(function (id) {
        k.attr[id] = Math.max(1, Math.min(20, KEEPER_PROFILE[id] + rng.range(-3, 3)));
      });
      var kb = rng.next() < 0.6 ? 'tall' : 'average';
      var krg = HEIGHT_RANGE[kb];
      k.heightM = Math.round((krg[0] + rng.next() * (krg[1] - krg[0])) * 100) / 100;
      k.height = heightWord(k.heightM);
      k.limb = rng.pick(LIMBS[k.height]);
      k.form = 0;
      k.person = {
        nerve: rng.pick(PERSONALITY.nerve.values),
        drive: rng.pick(PERSONALITY.drive.values),
        loyalty: rng.pick(PERSONALITY.loyalty.values)
      };
    }
    var all = squad.players;
    all.forEach(function (p) {
      if (p.attr) return;
      rollOutfield(p, rng);
    });
    if (opts.benchStats) {
      var brng = new C.RNG(((seed || 1) ^ 0x42454e43) >>> 0);
      (squad.bench || []).forEach(function (p) {
        if (p.attr || p.role === 'keeper') return;
        rollOutfield(p, brng);
      });
    }
    /* English names and FM-style position codes (names.js). Their own rng,
     * seeded from the same seed, so every number above is exactly what it was
     * before names existed and ?seed= still replays the whole sheet. Done
     * once per squad: a second attach must not rename anyone. */
    var N = namesLib();
    if (N && !squad.named) {
      N.rename(squad, new C.RNG(((seed || 1) ^ 0x4e414d45) >>> 0), 'england');
      squad.named = true;
    }
    if (N) N.setPos(squad);
    return squad;
  }

  /* The attribute as it plays right now: base, plus form, minus tired legs.
   * Nothing else may touch it, which is what keeps personality out of a
   * contest. */
  /* How much each attribute suffers when the legs go. Pace and Physical
   * collapse; Intelligence barely moves, because reading the game is not
   * something you get tired at. That asymmetry is not decoration: it means a
   * clever side is relatively BETTER at eighty minutes than a fast one, which
   * is a real football statement falling out of one table. */
  var FATIGUE = {
    pace: 13, physical: 13, technique: 8, defending: 8,
    passing: 6, finishing: 6, intelligence: 2,
    /* a keeper barely runs, so he barely tires */
    reflexes: 2, communication: 1, distribution: 3, physique: 3
  };

  /* EACH MAN TIRES WITH HIS OWN LINE. A moment used to pass one stamina
   * number, the line the moment is about, and every man in it played on that
   * number: in a press trap your forward headed at Physical 13 instead of 18
   * because the MIDFIELD was tired, while the attack still had 85 of 100.
   * While a moment is being built, model.js sets the stamina of all three of
   * your lines here, and any of your men is read on his own line's number.
   * Their men are always passed 100 and are not in the map. */
  var LINE_KEY = ['def', 'mid', 'att'];
  var lineLegs = null, ours = null;
  function setLineLegs(legs, squad) {
    if (!legs || !squad) { lineLegs = null; ours = null; return; }
    lineLegs = legs; ours = {};
    squad.players.concat(squad.bench || []).forEach(function (p) { ours[p.id] = 1; });
  }
  function legsOf(p, legs) {
    if (lineLegs && p && ours[p.id] && typeof p.line === 'number' && LINE_KEY[p.line]) {
      return lineLegs[LINE_KEY[p.line]];
    }
    return legs;
  }
  function eff(p, id, legs) {
    legs = legsOf(p, legs);
    var base = (p.attr && p.attr[id]) || 8;
    var tired = legs === undefined ? 0 : (1 - Math.max(0, Math.min(100, legs)) / 100);
    return Math.max(1, base + (p.form || 0) - tired * (FATIGUE[id] || 6));
  }
  /* An aerial duel is PHYSICAL, plus how tall he is. It is NOT a stat and it
   * must never be printed as one.
   *
   * It was "Reach" and then "Heading", and he caught it: "you invented an 8th
   * stat?" In the data, no: nothing is stored and the seven are untouched. On
   * screen, yes, because it printed as "Pell (Heading 20)" which is
   * indistinguishable from an attribute. If it looks like a stat and carries a
   * number, it is one to whoever is reading it.
   *
   * So the check is Physical against Physical, height moves the margin, and
   * the screen says "Pell (Physical 15, tall)". */
  /* HIS FORMULA, exactly: Physical plus ten times the height in metres. One
   * addition, both halves printed on the card, nothing hidden. */
  function aerial(p, legs) { return eff(p, 'physical', legs) + 10 * (p.heightM || 1.80); }
  function aerialSum(p, legs) {
    var phys = Math.round(eff(p, 'physical', legs));
    var h = (p.heightM || 1.80);
    return { physical: phys, heightM: h, fromHeight: Math.round(h * 10 * 10) / 10,
      total: Math.round((phys + h * 10) * 10) / 10 };
  }
  var reach = aerial;

  /* --------------------------------------------------------- the risk read */
  /* Shape is DERIVED, never a tag. A high attribute with a low head is the
   * maverick: he can do it and he tries it when it is not on. A high head with
   * a low attribute knows exactly what to do and cannot do it. That is Codex's
   * correction built in: the same man is narrow at one action and wild at
   * another, so risk is actor x action x marker x pressure. */
  function shape(p, id, legs, marker, markerAttr) {
    if (!p) return { band: 'none', text: 'Nobody is there.' };
    var a = eff(p, id, legs), iq = eff(p, 'intelligence', legs);
    var first = p.name.split(' ')[0], surname = p.name.split(' ')[1] || p.name;
    var beat = (marker && markerAttr) ? a - eff(marker, markerAttr, 100) : 0;

    if (legs !== undefined && legs < 32 && (id === 'pace' || id === 'physical')) {
      return { band: 'poor', text: first + ' has nothing left in his legs. It is hope more than a plan.' };
    }
    if (a >= 14 && iq >= 14) return { band: 'narrow', text: first + ' does this well and he picks his moment. It will not be a disaster.' };
    if (a >= 14 && iq <= 10) return { band: 'wide', text: first + ' can absolutely do it. He also tries it when it is not on.' };
    if (a >= 14) return { band: 'good', text: beat > 3
      ? first + ' is good at this, and better at it than the man in front of him.'
      : first + ' is good at this. The man in front of him is no mug either.' };
    if (a <= 9 && iq >= 14) return { band: 'narrow-low', text: first + ' knows exactly what to do here. He cannot quite do it.' };
    if (a <= 9) return { band: 'poor', text: 'This is not ' + surname + "'s game." };
    if (beat < -3) return { band: 'poor', text: marker.name.split(' ')[1] + ' will get there first.' };
    return { band: 'even', text: 'Even money, and nobody is covering if it breaks down.' };
  }

  /* --------------------------------------------------------- squad totals */

  function lineAvg(squad, line, id, legs) {
    var n = 0, t = 0;
    squad.players.forEach(function (p) { if (p.line === line) { t += eff(p, id, legs); n++; } });
    return n ? t / n : 0;
  }
  function lineSum(squad, line, id, legs) {
    var t = 0;
    squad.players.forEach(function (p) { if (p.line === line) t += eff(p, id, legs); });
    return t;
  }
  function laneSum(squad, lane, id, legs) {
    var t = 0;
    squad.players.forEach(function (p) { if (C.CHANNEL_OF[p.slot] === lane) t += eff(p, id, legs); });
    return t;
  }
  function lineReach(squad, line, legs) {
    var t = 0, n = 0;
    squad.players.forEach(function (p) { if (p.line === line) { t += aerial(p, legs); n++; } });
    return n ? t / n : 0;
  }

  var API = {
    setLineLegs: setLineLegs, legsOf: legsOf,
    ATTRS: ATTRS, ATTR_IDS: ATTR_IDS, FATIGUE: FATIGUE,
    KEEPER_ATTRS: KEEPER_ATTRS, KEEPER_IDS: KEEPER_IDS, HEIGHTS: HEIGHTS, PERSONALITY: PERSONALITY,
    PROFILES: PROFILES, attach: attach, eff: eff, reach: reach, aerial: aerial, aerialSum: aerialSum,
    HEIGHT_RANGE: HEIGHT_RANGE, heightWord: heightWord, shape: shape,
    lineAvg: lineAvg, lineSum: lineSum, laneSum: laneSum, lineReach: lineReach
  };
  root.KMAttr = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
