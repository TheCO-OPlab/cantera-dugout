/* Names, and the position code printed next to each one.
 *
 * Eduardo, 2026-09-23: "Change the names to more recognizable English names. I
 * don't like the names in the game because they can't be recognized as names
 * quite often. Pick 50 to 100 unique common football or first names and roll
 * with those." And: "Each player, just for clarity, should have their role
 * next to them. We can use roles similar to FM: TF for target forward, LWB for
 * left wing-back, CB for centre-back, etc."
 *
 * Every match sentence calls a man by his FIRST name ("Jack goes for the
 * ball"), so a first name must read as a name and nothing else. Left out on
 * purpose, because each is also an ordinary word in a match sentence: Will,
 * Mark, Bill, Chase, Frank, Grant, Rich, Guy, Miles, Hunter, Glen, Rob, Nick,
 * Pat, Ray, Drew, Wade, Max, Art. Only one spelling per stem (Tom, not also
 * Tommy; David, not also Dave), so no two men sound alike. Surnames avoid
 * match words (Ball, Cross, Hill, Long, Wood...), never repeat a first name,
 * and avoid the most famous England pairings (Walker, Shaw, Cole, Henderson,
 * Wright, Pearce) so the sheet never prints Kyle Walker.
 *
 * Countries. Pools are keyed by country so adding one is adding a pool. The
 * intended ten: england, brazil, spain, italy, france, germany, netherlands,
 * portugal, argentina, nigeria. What a country FEATURE would need beyond the
 * pools (not built): a picker before the run, an opponent drawn from the other
 * nine, a label or flag on the sheet and the scoreline, and the club name per
 * country. The match engine reads no name, so it needs nothing.
 *
 * Runs in a browser as a classic script and under node, like the other v2
 * files.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');

  var POOLS = {
    england: {
      first: [
        'Jack', 'Harry', 'Tom', 'James', 'Danny', 'Luke', 'Sam', 'Ben', 'Joe', 'Josh',
        'Jake', 'Liam', 'Ryan', 'Kyle', 'Callum', 'Connor', 'Declan', 'Jordan', 'Mason', 'Jamie',
        'Scott', 'Alan', 'Aaron', 'Adam', 'Alex', 'Andy', 'Ashley', 'Billy', 'Bobby', 'Charlie',
        'Craig', 'Darren', 'David', 'Dexter', 'Eddie', 'Elliot', 'Ethan', 'Freddie', 'Gareth', 'George',
        'Gordon', 'Harvey', 'Henry', 'Jason', 'Joel', 'John', 'Keith', 'Kenny', 'Kieran', 'Lewis',
        'Louie', 'Marcus', 'Matt', 'Nathan', 'Neil', 'Ollie', 'Owen', 'Peter', 'Reggie', 'Robbie',
        'Ronnie', 'Ross', 'Shane', 'Simon', 'Stuart', 'Terry', 'Theo', 'Toby', 'Tony', 'Trevor',
        'Vince', 'Warren', 'Zach', 'Paul', 'Phil', 'Steve', 'Kevin', 'Gary', 'Wayne', 'Chris',
        'Ian', 'Lee', 'Dean', 'Sean', 'Tyler', 'Reece', 'Michael', 'Carl', 'Leon', 'Dylan',
        'Oscar', 'Alfie', 'Archie', 'Arthur', 'Ricky'
      ],
      last: [
        'Smith', 'Jones', 'Taylor', 'Johnson', 'Wilson', 'Davies', 'Robinson', 'Thompson', 'Evans', 'Roberts',
        'Edwards', 'Hughes', 'Harris', 'Clarke', 'Jackson', 'Turner', 'Cooper', 'Ward', 'Morris', 'Moore',
        'Harrison', 'Martin', 'Baker', 'Morgan', 'Allen', 'Mitchell', 'Kelly', 'Parker', 'Bennett', 'Carter',
        'Watson', 'Phillips', 'Chapman', 'Collins', 'Richards', 'Webb', 'Lloyd', 'Barnes', 'Holmes', 'Dixon',
        'Palmer', 'Fletcher', 'Gibson', 'Ellis', 'Rogers', 'Stevens', 'Pearson', 'Hudson', 'Butler', 'Barker',
        'Lucas', 'Foster', 'Graham', 'Russell', 'Murray', 'Hayes', 'Kennedy', 'Marshall', 'Spencer', 'Stewart',
        'Simpson', 'Cox', 'Payne', 'Lambert', 'Ferguson', 'Walsh', 'Doyle', 'Burton', 'Chambers', 'Fisher',
        'Newton', 'Hopkins', 'Lawrence', 'Bailey', 'Price', 'Reid', 'Saunders', 'Holt', 'Fowler', 'Barton',
        'Dawson', 'Hodgson', 'Atkinson', 'Ashton', 'Barrett', 'Booth', 'Brennan', 'Bradley', 'Dunn', 'Nolan',
        'Pritchard', 'Quinn', 'Riley', 'Sutton', 'Tucker', 'Whitaker', 'Wilkinson', 'Yates', 'Kemp', 'Bowen'
      ]
    }
  };
  var DEFAULT = 'england';

  function pool(country) { return POOLS[country] || POOLS[DEFAULT]; }

  /* Everyone the club owns: the ten, the keeper, and the bench, because a sub
   * who comes on is named in sentences too. */
  function everyone(squad) {
    var all = [];
    if (squad.keeper) all.push(squad.keeper);
    return all.concat(squad.players || [], squad.bench || []);
  }

  /* A fresh first and last name for every man, first names AND surnames
   * unique inside the squad (a few sentences use the surname: "This is not
   * Chapman's game" cannot mean two men). The rng is the caller's, so a seed
   * replays exactly. */
  function rename(squad, rng, country) {
    var P = pool(country);
    var firsts = rng.shuffle(P.first), lasts = rng.shuffle(P.last);
    everyone(squad).forEach(function (p, i) {
      p.name = firsts[i % firsts.length] + ' ' + lasts[i % lasts.length];
    });
    return squad;
  }

  /* No first name (and no surname) shared across ALL squads passed. Later duplicates are
   * renamed from the same pool, the way C.dedupeNames does it with the old
   * pool; if the pool ran dry (it cannot at two squads of fourteen) the
   * surname stands in, which is still a name you can say. */
  function dedupe(squads, rng, country) {
    var P = pool(country), taken = {}, takenLast = {};
    squads.forEach(function (sq) {
      everyone(sq).forEach(function (p) {
        var parts = String(p.name).split(' '), changed = false;
        if (taken[parts[0]]) {
          var free = P.first.filter(function (n) { return !taken[n]; });
          if (free.length) { parts[0] = rng ? rng.pick(free) : free[0]; changed = true; }
          else if (parts[1] && !taken[parts[1]]) { parts[0] = parts[1]; changed = true; }
        }
        taken[parts[0]] = 1;
        /* surnames too, best effort: a clash here is only ever a surname */
        if (parts[1] && takenLast[parts[1]]) {
          var freeL = P.last.filter(function (n) { return !takenLast[n]; });
          if (freeL.length) { parts[1] = rng ? rng.pick(freeL) : freeL[0]; changed = true; }
        }
        if (parts[1]) takenLast[parts[1]] = 1;
        if (changed) p.name = parts.join(' ');
      });
    });
    return squads;
  }

  /* ------------------------------------------------------ position codes */
  /* FM-shaped: the code says where he stands AND what he does, in 2-3
   * letters. Side comes from the slot: 0-1 left, 2 centre, 3-4 right. A back
   * four uses slots 0,1,3,4, so 1 and 3 are its centre-backs; a 4-4-2 front
   * two stands at 1 and 3.
   *
   *   role                   wide (slot 0/4)   central (1-3)       bench
   *   keeper                 GK                GK                  GK
   *   centre-back            LB / RB           CB                  CB
   *   ball-playing-defender  LB / RB           BPD                 BPD
   *   full-back              LB / RB           LB / RB (CB at 2)   FB
   *   wing-back              LWB / RWB         LWB / RWB (CB at 2) WB
   *   ball-winner            LM / RM           DM                  DM
   *   deep-lying-playmaker   LM / RM           DLP                 DLP
   *   box-to-box             LM / RM           CM                  CM
   *   advanced-playmaker     LM / RM           AM                  AM
   *   winger                 LW / RW           LW / RW (ST at 2)   W
   *   inside-forward         IF                IF                  IF
   *   target-forward         TF                TF                  TF
   *   poacher                ST                ST                  ST
   *
   * Why a full-back in a centre-back's slot still reads LB: the roles are
   * drawn per line, so a back four can hold two full-backs at 1 and 3, and
   * "CB" would promise a man who does not play like one. The side is still
   * true. Wingers the same: in a 4-4-2 front two he is still the one who
   * goes wide. A wide-slot midfielder reads LM/RM whatever his role, because
   * which touchline he runs is the thing the sheet needs to say. */
  function side(slot) { return slot < 2 ? 'L' : slot > 2 ? 'R' : ''; }

  function posCode(p) {
    if (!p) return '';
    if (p.isKeeper || p.role === 'keeper') return 'GK';
    var r = p.role, s = p.slot;
    var placed = typeof s === 'number';
    var wide = placed && (s === 0 || s === 4);
    var sd = placed ? side(s) : '';
    switch (r) {
      case 'centre-back': return wide ? sd + 'B' : 'CB';
      case 'ball-playing-defender': return wide ? sd + 'B' : 'BPD';
      case 'full-back': return !placed ? 'FB' : sd ? sd + 'B' : 'CB';
      case 'wing-back': return !placed ? 'WB' : sd ? sd + 'WB' : 'CB';
      case 'ball-winner': return wide ? sd + 'M' : 'DM';
      case 'deep-lying-playmaker': return wide ? sd + 'M' : 'DLP';
      case 'box-to-box': return wide ? sd + 'M' : 'CM';
      case 'advanced-playmaker': return wide ? sd + 'M' : 'AM';
      case 'winger': return !placed ? 'W' : sd ? sd + 'W' : 'ST';
      case 'inside-forward': return 'IF';
      case 'target-forward': return 'TF';
      case 'poacher': return 'ST';
    }
    return (C.ROLES[r] && C.ROLES[r].short) || '';
  }

  function setPos(squad) {
    everyone(squad).forEach(function (p) { p.pos = posCode(p); });
    return squad;
  }

  var API = { POOLS: POOLS, DEFAULT: DEFAULT, pool: pool, rename: rename, dedupe: dedupe,
    posCode: posCode, setPos: setPos };
  root.KMNames = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
