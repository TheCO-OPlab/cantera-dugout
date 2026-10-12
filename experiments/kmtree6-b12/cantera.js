/* Cantera night experiments: shared kit.
 *
 * Deliberately small. Seeded RNG, a squad generator, one keyword catalogue,
 * the synergy resolver (because "synergies visible on the pitch" is a hard
 * requirement in every prototype), pitch drawing, and the post-match report.
 *
 * Each prototype owns its own match resolution. Nothing here decides how a
 * match plays. That is the point of the night.
 *
 * Runs in a browser as a classic script and under node via the export guard
 * at the bottom. No modules, no fetch, no build step.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- RNG */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = seed >>> 0;
    this._f = mulberry32(this.seed);
  }
  RNG.prototype.next = function () { return this._f(); };
  RNG.prototype.int = function (n) { return Math.floor(this._f() * n); };
  RNG.prototype.range = function (a, b) { return a + Math.floor(this._f() * (b - a + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this._f() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this._f() < p; };
  RNG.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this._f() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* -------------------------------------------------------------- names */

  var FIRST = ['Juba', 'Korr', 'Skarn', 'Piek', 'Tarn', 'Rumen', 'Vesh', 'Ombra', 'Ffion',
    'Dask', 'Nim', 'Perro', 'Halk', 'Brix', 'Onu', 'Yarel', 'Gull', 'Semp', 'Torv',
    'Aldo', 'Miren', 'Ceb', 'Wix', 'Rask', 'Pell', 'Uma', 'Gorm', 'Isca', 'Bru', 'Vant'];
  var LAST = ['Longclaw', 'Stonepelt', 'Silverquill', 'Websson', 'Emberback', 'Thornfoot',
    'Mossgrove', 'Ironhoof', 'Ashmantle', 'Brinesong', 'Dunwhistle', 'Keelrun',
    'Pinebark', 'Saltmarrow', 'Redfern', 'Glasswing', 'Hollowreed', 'Tallow',
    'Grimsdale', 'Coldharbour', 'Nettlefold', 'Oxhide', 'Rookvale', 'Slatecap'];

  var CLUBS = ['Fennbridge', 'Dunmoor Rangers', 'Brackwater', 'Holm Athletic', 'Ostergard',
    'Calder Vale', 'Thistledown', 'Marrowgate', 'Pellhaven', 'Vord United',
    'Saltcombe', 'Ninefields'];

  /* Every sentence in the match calls a man by his first name, so two men
   * sharing one is not a cosmetic problem: "Uma goes to tackle Uma" is not a
   * sentence anybody can act on. Names are drawn independently per player, and
   * with 30 of them across two squads a collision is closer to likely than
   * rare. This renames the later duplicates, across every squad passed in, so
   * a first name identifies exactly one man on the pitch. */
  function dedupeNames(squads, rng) {
    var taken = {}, pool = FIRST.slice();
    squads.forEach(function (sq) {
      var all = sq.players.slice();
      if (sq.keeper) all.push(sq.keeper);
      all.forEach(function (p) {
        var parts = String(p.name).split(' ');
        if (!taken[parts[0]]) { taken[parts[0]] = 1; return; }
        var free = pool.filter(function (n) { return !taken[n]; });
        if (!free.length) {
          /* more players than names: fall back to the surname, which is
           * still a name he can say out loud */
          parts[0] = parts[1] || parts[0];
          if (taken[parts[0]]) return;
        } else {
          parts[0] = rng ? rng.pick(free) : free[0];
        }
        taken[parts[0]] = 1;
        p.name = parts.join(' ');
      });
    });
    return squads;
  }

  /* -------------------------------------------------------------- roles */
  /* Three stats, chosen because they are the three sentences a manager should
   * be able to say after a loss:
   *   WIN      "I could not win the ball back"
   *   PROGRESS "I could not get it forward"
   *   FINISH   "I got there and could not score"
   * Everything else is flavour. */

  var ROLES = {
    'keeper':               { line: 0, w: 7, p: 2, f: 0, short: 'GK' },
    'centre-back':          { line: 0, w: 8, p: 3, f: 2, short: 'CB' },
    'ball-playing-defender':{ line: 0, w: 6, p: 6, f: 2, short: 'BPD' },
    'full-back':            { line: 0, w: 6, p: 5, f: 2, short: 'FB' },
    'wing-back':            { line: 0, w: 5, p: 7, f: 3, short: 'WB' },
    'ball-winner':          { line: 1, w: 8, p: 4, f: 2, short: 'BW' },
    'deep-lying-playmaker': { line: 1, w: 5, p: 8, f: 3, short: 'DLP' },
    'box-to-box':           { line: 1, w: 6, p: 6, f: 5, short: 'B2B' },
    'advanced-playmaker':   { line: 1, w: 3, p: 8, f: 6, short: 'AP' },
    'winger':               { line: 2, w: 3, p: 7, f: 6, short: 'W' },
    'inside-forward':       { line: 2, w: 3, p: 6, f: 8, short: 'IF' },
    'target-forward':       { line: 2, w: 6, p: 4, f: 8, short: 'TF' },
    'poacher':              { line: 2, w: 2, p: 3, f: 9, short: 'PO' }
  };

  var ROLES_BY_LINE = [[], [], []];
  Object.keys(ROLES).forEach(function (k) {
    if (k !== 'keeper') ROLES_BY_LINE[ROLES[k].line].push(k);
  });

  /* ----------------------------------------------------------- keywords */
  /* Every keyword here either reads a position or writes a state another
   * keyword can read. That is on purpose: the harness measured twice that the
   * shipped keywords "mostly read a number and add to a total, and a total
   * cannot compose" (docs/harness-pricing-report.md 3.3).
   *
   * scope tells the UI where to draw the link:
   *   'adjacent' | 'line' | 'channel' | 'self' | 'behind'
   */

  var KEYWORDS = {
    TWIN_ENGINE: {
      name: 'Twin Engine', scope: 'adjacent', colour: '#2f7fd0',
      text: '+3 PROGRESS for each adjacent teammate who also has Twin Engine.'
    },
    OVERLAP: {
      name: 'Overlap', scope: 'behind', colour: '#2f7fd0',
      text: '+4 PROGRESS while a teammate stands directly behind him.'
    },
    PRESS_TRIGGER: {
      name: 'Press Trigger', scope: 'line', colour: '#c8552f',
      text: 'Every teammate in his line gains +2 WIN.'
    },
    TARGET_MAN: {
      name: 'Target Man', scope: 'line', colour: '#b8860b',
      text: 'Every teammate in his line gains +2 FINISH.'
    },
    SWEEPER: {
      name: 'Sweeper', scope: 'self', colour: '#c8552f',
      text: '+5 WIN when the contest is in your own defence.'
    },
    METRONOME: {
      name: 'Metronome', scope: 'self', colour: '#6a4fb0',
      text: '+1 PROGRESS for every phase already played.'
    },
    BALL_WINNER: {
      name: 'Ball Winner', scope: 'self', colour: '#c8552f',
      text: 'When his line wins the ball, the line ahead gains +4 PROGRESS next phase.'
    },
    LIVEWIRE: {
      name: 'Livewire', scope: 'self', colour: '#1f9d55',
      text: '+5 to every stat on a counter-attack.'
    },
    ANCHOR: {
      name: 'Anchor', scope: 'adjacent', colour: '#c8552f',
      text: 'Adjacent teammates are never caught upfield on a counter.'
    },
    UNDERSTUDY: {
      name: 'Understudy', scope: 'adjacent', colour: '#6a4fb0',
      text: '+3 to every stat while an adjacent teammate is rated higher than him.'
    },
    TALISMAN: {
      name: 'Talisman', scope: 'channel', colour: '#b8860b',
      text: 'Every teammate in his channel gains +1 to every stat.'
    },
    WALL: {
      name: 'Wall', scope: 'self', colour: '#c8552f',
      text: '+4 WIN inside your own box.'
    }
  };

  var KEYWORD_IDS = Object.keys(KEYWORDS);

  /* ------------------------------------------------------------ players */

  var nextId = 1;

  function makePlayer(rng, role, opts) {
    opts = opts || {};
    var base = ROLES[role];
    /* lift may be fractional: the whole part is added, the fraction is the
     * chance of one more. That gives half-step opponent bands without
     * fractional stats on screen. */
    var lift = opts.lift || 0;
    var whole = Math.floor(lift), frac = lift - whole;
    var jitter = function (v) {
      return Math.max(1, v + rng.range(-1, 1) + whole + (rng.next() < frac ? 1 : 0));
    };
    var p = {
      id: 'p' + (nextId++),
      name: rng.pick(FIRST) + ' ' + rng.pick(LAST),
      role: role,
      short: base.short,
      homeLine: base.line,
      win: jitter(base.w),
      prog: jitter(base.p),
      fin: jitter(base.f),
      keywords: []
    };
    var kwChance = opts.kwChance === undefined ? 0.45 : opts.kwChance;
    if (rng.chance(kwChance)) p.keywords.push(pickKeywordFor(rng, p));
    return p;
  }

  /* Keywords are drawn from a pool that suits the role, so a poacher does not
   * get Sweeper. Dead rewards are recurring issue 6 and they are avoidable. */
  function pickKeywordFor(rng, p) {
    var pool;
    if (p.homeLine === 0) pool = ['SWEEPER', 'ANCHOR', 'OVERLAP', 'PRESS_TRIGGER', 'TWIN_ENGINE', 'UNDERSTUDY'];
    else if (p.homeLine === 1) pool = ['BALL_WINNER', 'TWIN_ENGINE', 'METRONOME', 'PRESS_TRIGGER', 'TALISMAN', 'UNDERSTUDY'];
    else pool = ['TARGET_MAN', 'LIVEWIRE', 'TWIN_ENGINE', 'METRONOME', 'TALISMAN', 'OVERLAP'];
    var k = rng.pick(pool);
    return p.keywords.indexOf(k) >= 0 ? null : k;
  }

  function rating(p) { return p.win + p.prog + p.fin; }

  /* --------------------------------------------------------- formations */
  /* The pitch is 3 lines x 5 slots. Slots 0-1 are the LEFT channel, 2 the
   * CENTRE, 3-4 the RIGHT. Ten outfield players; the keeper sits apart.
   * Adjacency: same line and neighbouring slot, or neighbouring line and the
   * same or a neighbouring slot. That is the Backpack Battles mechanism with
   * a formation sheet on top of it. */

  var FORMATIONS = {
    '4-4-2': [[0, 0], [0, 1], [0, 3], [0, 4], [1, 0], [1, 1], [1, 3], [1, 4], [2, 1], [2, 3]],
    '4-3-3': [[0, 0], [0, 1], [0, 3], [0, 4], [1, 1], [1, 2], [1, 3], [2, 0], [2, 2], [2, 4]],
    '3-5-2': [[0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 1], [2, 3]],
    '5-3-2': [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 1], [1, 2], [1, 3], [2, 1], [2, 3]]
  };

  var LINE_NAMES = ['DEFENCE', 'MIDFIELD', 'ATTACK'];
  var LINE_SHORT = ['DEF', 'MID', 'ATT'];
  /* Five slots across the pitch map to three lanes. Slot 0 is the left
   * touchline and slot 4 the right; everything between is central, because a
   * back four sits at slots 0,1,3,4 and slots 1 and 3 are its centre-backs.
   * The first version put 1 and 3 in the wide lanes, which left 4-4-2 with
   * nobody at all in the middle lane. */
  var CHANNEL_OF = [0, 1, 1, 1, 2];
  var CHANNEL_NAMES = ['the left', 'the middle', 'the right'];

  function adjacent(a, b) {
    var dl = Math.abs(a.line - b.line), ds = Math.abs(a.slot - b.slot);
    if (dl === 0 && ds === 1) return true;
    if (dl === 1 && ds <= 1) return true;
    return false;
  }

  /* ------------------------------------------------------------- squads */

  function makeSquad(seedOrRng, opts) {
    opts = opts || {};
    var rng = (typeof seedOrRng === 'number') ? new RNG(seedOrRng) : seedOrRng;
    var formation = opts.formation || '4-4-2';
    var slots = FORMATIONS[formation];
    var keeper = makePlayer(rng, 'keeper', { lift: opts.lift, kwChance: 0.4 });
    if (rng.chance(0.5)) keeper.keywords = ['WALL'];
    var players = [];
    for (var i = 0; i < slots.length; i++) {
      var line = slots[i][0];
      var role = rng.pick(ROLES_BY_LINE[line]);
      var p = makePlayer(rng, role, opts);
      p.line = line; p.slot = slots[i][1];
      players.push(p);
    }
    // a small bench so "recruit" and "release" mean something
    var bench = [];
    var benchCount = opts.bench === undefined ? 3 : opts.bench;
    for (var b = 0; b < benchCount; b++) {
      var ln = rng.int(3);
      var bp = makePlayer(rng, rng.pick(ROLES_BY_LINE[ln]), opts);
      bp.line = null; bp.slot = null;
      bench.push(bp);
    }
    return {
      club: opts.club || 'Ironhoof',
      formation: formation,
      keeper: keeper,
      players: players,
      bench: bench
    };
  }

  /* Reseat everyone into the formation's slots, keeping line preference where
   * possible. Used after a recruit or a release. */
  function reseat(squad) {
    var slots = FORMATIONS[squad.formation];
    var pool = squad.players.concat(squad.bench);
    var seated = [], benched = [];
    var used = {};
    slots.forEach(function (s) {
      var line = s[0], best = -1, bestScore = -1;
      for (var i = 0; i < pool.length; i++) {
        if (used[i]) continue;
        var p = pool[i];
        var score = rating(p) + (p.homeLine === line ? 14 : 0) - Math.abs(p.homeLine - line) * 3;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) {
        used[best] = true;
        var q = pool[best];
        q.line = line; q.slot = s[1];
        seated.push(q);
      }
    });
    for (var i = 0; i < pool.length; i++) {
      if (!used[i]) { pool[i].line = null; pool[i].slot = null; benched.push(pool[i]); }
    }
    squad.players = seated;
    squad.bench = benched;
    return squad;
  }

  /* ------------------------------------------------- the synergy resolver */
  /* Returns, for every player on the pitch, his effective stats and the list
   * of buffs with their source, so the pitch can draw the link and the token
   * can grow. Requirement 5 of the brief lives here.
   *
   * ctx: { line: 0|1|2 (where the ball is), counter: bool, phase: int,
   *        ownBox: bool, carried: {playerId: {stat, amount, why}} } */

  function resolveSynergies(squad, ctx) {
    ctx = ctx || {};
    var out = {};
    squad.players.forEach(function (p) {
      out[p.id] = {
        player: p, win: p.win, prog: p.prog, fin: p.fin,
        buffs: [], debuffs: []
      };
    });

    function add(target, stat, amount, sourcePlayer, label) {
      var e = out[target.id];
      if (!e) return;
      e[stat] += amount;
      (amount >= 0 ? e.buffs : e.debuffs).push({
        stat: stat, amount: amount, from: sourcePlayer ? sourcePlayer.id : null,
        fromName: sourcePlayer ? sourcePlayer.name : null, label: label
      });
    }

    squad.players.forEach(function (p) {
      p.keywords.forEach(function (k) {
        if (!k) return;
        var kw = KEYWORDS[k];
        if (!kw) return;
        switch (k) {
          case 'TWIN_ENGINE': {
            squad.players.forEach(function (q) {
              if (q !== p && q.keywords.indexOf('TWIN_ENGINE') >= 0 && adjacent(p, q)) {
                add(p, 'prog', 3, q, 'Twin Engine');
              }
            });
            break;
          }
          case 'OVERLAP': {
            var behind = squad.players.filter(function (q) {
              return q !== p && q.line === p.line - 1 && Math.abs(q.slot - p.slot) <= 1;
            })[0];
            if (behind) add(p, 'prog', 4, behind, 'Overlap');
            break;
          }
          case 'PRESS_TRIGGER':
            squad.players.forEach(function (q) {
              if (q.line === p.line) add(q, 'win', 2, p, 'Press Trigger');
            });
            break;
          case 'TARGET_MAN':
            squad.players.forEach(function (q) {
              if (q.line === p.line) add(q, 'fin', 2, p, 'Target Man');
            });
            break;
          case 'SWEEPER':
            if (ctx.line === 0) add(p, 'win', 5, p, 'Sweeper');
            break;
          case 'METRONOME':
            if (ctx.phase) add(p, 'prog', Math.min(8, ctx.phase), p, 'Metronome');
            break;
          case 'LIVEWIRE':
            if (ctx.counter) {
              add(p, 'win', 5, p, 'Livewire'); add(p, 'prog', 5, p, 'Livewire');
              add(p, 'fin', 5, p, 'Livewire');
            }
            break;
          case 'UNDERSTUDY': {
            var better = squad.players.filter(function (q) {
              return q !== p && adjacent(p, q) && rating(q) > rating(p);
            }).sort(function (a, b) { return rating(b) - rating(a); })[0];
            if (better) {
              add(p, 'win', 3, better, 'Understudy'); add(p, 'prog', 3, better, 'Understudy');
              add(p, 'fin', 3, better, 'Understudy');
            }
            break;
          }
          case 'TALISMAN':
            squad.players.forEach(function (q) {
              if (CHANNEL_OF[q.slot] === CHANNEL_OF[p.slot]) {
                add(q, 'win', 1, p, 'Talisman'); add(q, 'prog', 1, p, 'Talisman');
                add(q, 'fin', 1, p, 'Talisman');
              }
            });
            break;
          default: break;
        }
      });
    });

    // carried state written by a previous phase (Ball Winner and friends)
    if (ctx.carried) {
      Object.keys(ctx.carried).forEach(function (pid) {
        var c = ctx.carried[pid];
        if (out[pid]) add(out[pid].player, c.stat, c.amount, null, c.why);
      });
    }
    return out;
  }

  function keeperWin(squad, ctx) {
    var k = squad.keeper, v = k.win;
    var why = [];
    if (k.keywords.indexOf('WALL') >= 0 && ctx && ctx.ownBox) { v += 4; why.push('Wall'); }
    return { value: v, why: why };
  }

  /* ------------------------------------------------------------ styling */

  var CSS = `
:root{--ground:#f7f8f5;--surface:#fff;--ink:#171b14;--ink2:#585e52;--muted:#8a9083;
  --line:#dfe3d8;--accent:#1a7a3e;--pitch:#1d6b3c;--pitchline:rgba(255,255,255,.5);
  --warn:#b3402f;--gold:#b8860b;--blue:#2f7fd0;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#141610;--surface:#1b1e17;--ink:#e9ece3;--ink2:#aab2a0;--muted:#7c826f;
  --line:#2c3026;--accent:#4cb371;--pitch:#17492b;--warn:#d96a58;--gold:#d9a93c;--blue:#5aa0e0;}}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);margin:0;
  font:15px/1.5 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:14px 14px 60px}
h1{font-size:21px;margin:0 0 2px}
h2{font-size:15px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2)}
.sub{color:var(--muted);font-size:13px;margin:0 0 14px}
button{font:inherit;font-weight:600;padding:8px 14px;border-radius:7px;cursor:pointer;
  border:1px solid var(--line);background:var(--surface);color:var(--ink)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
button:disabled{opacity:.45;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:10px}
.pitch{position:relative;background:var(--pitch);border-radius:10px;overflow:hidden;
  aspect-ratio:5/4;min-height:290px;color:#f2f6ee}
.pitch .band{position:absolute;left:0;right:0;border-top:1px dashed var(--pitchline)}
.pitch .bandlabel{position:absolute;left:7px;font-size:10px;letter-spacing:.14em;
  color:var(--pitchline);text-transform:uppercase;pointer-events:none}
.tok{position:absolute;transform:translate(-50%,-50%);border-radius:50%;
  display:flex;align-items:center;justify-content:center;flex-direction:column;
  background:#f4f7f1;color:#171b14;border:2px solid #0e3a20;font-weight:700;
  transition:width .25s,height .25s,box-shadow .2s;cursor:pointer;z-index:3}
.tok.away{background:#31353a;color:#f0f2ee;border-color:#0c0e10}
.tok .nm{font-size:9px;font-weight:600;line-height:1.05;text-align:center}
.tok .rl{font-size:9px;opacity:.7}
.tok.buffed{box-shadow:0 0 0 3px rgba(26,122,62,.85),0 0 14px rgba(26,122,62,.6)}
.tok.ball{box-shadow:0 0 0 3px #f7d154,0 0 16px rgba(247,209,84,.7)}
.tok.sel{box-shadow:0 0 0 3px #f7d154}
.link{position:absolute;height:2px;transform-origin:0 50%;opacity:.85;z-index:2;pointer-events:none}
.feed{font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
  background:var(--surface);border:1px solid var(--line);border-radius:10px;
  padding:10px;height:220px;overflow-y:auto}
.feed div{padding:2px 0;border-bottom:1px solid var(--line)}
.feed .goal{color:var(--accent);font-weight:700}
.feed .bad{color:var(--warn)}
.feed .min{color:var(--muted);display:inline-block;width:34px}
.score{font-size:30px;font-weight:800;letter-spacing:.02em}
.pill{display:inline-block;padding:2px 8px;border-radius:99px;background:var(--line);
  font-size:11px;font-weight:700;letter-spacing:.04em}
.kw{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;
  background:rgba(47,127,208,.16);color:var(--blue);margin:1px 2px 1px 0}
.stat{font:12px ui-monospace,monospace;color:var(--ink2)}
.reason{border-left:3px solid var(--accent);padding:4px 0 4px 10px;margin:8px 0}
.reason.bad{border-color:var(--warn)}
.reason b{display:block;font-size:14px}
.reason span{color:var(--ink2);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{text-align:left;padding:3px 7px 3px 0;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.choice{cursor:pointer;transition:border-color .15s}
.choice:hover{border-color:var(--accent)}
.bar{height:7px;background:var(--line);border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
a{color:var(--accent)}
.small{font-size:12px;color:var(--muted)}
`;

  function injectCSS() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('cantera-css')) return;
    var s = document.createElement('style');
    s.id = 'cantera-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* --------------------------------------------------------- pitch draw */
  /* Home attacks upward: DEF at the bottom, ATT at the top. The away side is
   * mirrored into the same picture so one pitch shows the whole match. */

  function Pitch(el) {
    this.el = el;
    this.el.classList.add('pitch');
    this.tokens = {};
    this._built = false;
  }

  Pitch.prototype.bands = function () {
    if (this._built) return;
    var rows = [0.12, 0.28, 0.44, 0.60, 0.76, 0.92];
    var labels = [
      { y: 0.06, t: 'THEIR GOAL' }, { y: 0.50, t: 'HALFWAY' }, { y: 0.965, t: 'YOUR GOAL' }
    ];
    var self = this;
    [0.25, 0.5, 0.75].forEach(function (y) {
      var d = document.createElement('div');
      d.className = 'band'; d.style.top = (y * 100) + '%';
      self.el.appendChild(d);
    });
    labels.forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'bandlabel'; d.style.top = (l.y * 100) + '%'; d.textContent = l.t;
      self.el.appendChild(d);
    });
    this._built = true;
  };

  // y position per (side, line). home: DEF .82 MID .60 ATT .38 ; away mirrored
  function yFor(side, line) {
    var homeY = [0.84, 0.62, 0.40];
    return side === 'home' ? homeY[line] : 1 - homeY[line];
  }
  function xFor(slot) { return 0.12 + slot * 0.19; }

  Pitch.prototype.clear = function () {
    this.el.innerHTML = ''; this.tokens = {}; this._built = false; this.bands();
  };

  Pitch.prototype.draw = function (squad, side, eff, opts) {
    opts = opts || {};
    this.bands();
    var self = this;
    squad.players.forEach(function (p) {
      if (p.line === null) return;
      var e = eff ? eff[p.id] : null;
      var total = e ? (e.win + e.prog + e.fin) : rating(p);
      var base = rating(p);
      var size = 30 + Math.min(22, Math.max(0, total - 9) * 1.15);
      var id = side + '-' + p.id;
      var t = self.tokens[id];
      if (!t) {
        t = document.createElement('div');
        t.className = 'tok' + (side === 'away' ? ' away' : '');
        t.innerHTML = '<div class="nm"></div><div class="rl"></div>';
        self.el.appendChild(t);
        self.tokens[id] = t;
      }
      t.style.width = size + 'px'; t.style.height = size + 'px';
      t.style.left = (xFor(p.slot) * 100) + '%';
      t.style.top = (yFor(side, p.line) * 100) + '%';
      t.querySelector('.nm').textContent = p.name.split(' ')[0];
      t.querySelector('.rl').textContent = p.short;
      t.classList.toggle('buffed', !!(e && total > base));
      t.classList.toggle('ball', opts.ballLine === p.line && !!opts.ballSide && opts.ballSide === side);
      var tip = p.name + ' (' + p.role + ')  W' + p.win + ' P' + p.prog + ' F' + p.fin;
      if (e && e.buffs.length) {
        tip += '\n' + e.buffs.map(function (b) {
          return '  +' + b.amount + ' ' + b.stat.toUpperCase() + '  ' + b.label +
            (b.fromName && b.fromName !== p.name ? ' (' + b.fromName + ')' : '');
        }).join('\n');
      }
      if (p.keywords.filter(Boolean).length) {
        tip += '\n' + p.keywords.filter(Boolean).map(function (k) {
          return KEYWORDS[k].name + ': ' + KEYWORDS[k].text;
        }).join('\n');
      }
      t.title = tip;
      if (opts.onClick) t.onclick = function () { opts.onClick(p, t); };
    });
  };

  /* Draw the synergy links between home tokens. Called after draw(). */
  Pitch.prototype.links = function (squad, eff) {
    var self = this;
    Array.prototype.slice.call(this.el.querySelectorAll('.link')).forEach(function (l) { l.remove(); });
    if (!eff) return;
    var W = this.el.clientWidth, H = this.el.clientHeight;
    squad.players.forEach(function (p) {
      var e = eff[p.id]; if (!e) return;
      var drawn = {};
      e.buffs.forEach(function (b) {
        if (!b.from || b.from === p.id) return;
        if (drawn[b.from]) return;
        drawn[b.from] = 1;
        var src = squad.players.filter(function (q) { return q.id === b.from; })[0];
        if (!src || src.line === null) return;
        var x1 = xFor(src.slot) * W, y1 = yFor('home', src.line) * H;
        var x2 = xFor(p.slot) * W, y2 = yFor('home', p.line) * H;
        var dx = x2 - x1, dy = y2 - y1;
        var len = Math.sqrt(dx * dx + dy * dy);
        var d = document.createElement('div');
        d.className = 'link';
        d.style.left = x1 + 'px'; d.style.top = y1 + 'px';
        d.style.width = len + 'px';
        d.style.background = (KEYWORDS[keyIdByLabel(b.label)] || { colour: '#2f7fd0' }).colour;
        d.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
        self.el.appendChild(d);
      });
    });
  };

  function keyIdByLabel(label) {
    for (var i = 0; i < KEYWORD_IDS.length; i++) {
      if (label && label.indexOf(KEYWORDS[KEYWORD_IDS[i]].name) === 0) return KEYWORD_IDS[i];
    }
    return null;
  }

  /* ---------------------------------------------------------- the feed */

  function Feed(el) { this.el = el; this.el.classList.add('feed'); }
  Feed.prototype.clear = function () { this.el.innerHTML = ''; };
  Feed.prototype.say = function (minute, text, cls) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    d.innerHTML = '<span class="min">' + (minute === null ? '' : minute + "'") + '</span>' + escapeHTML(text);
    this.el.appendChild(d);
    this.el.scrollTop = this.el.scrollHeight;
  };

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --------------------------------------------- post-match explanation */
  /* The brief's requirement 1 and 2 in one function. It takes a tally of what
   * happened and turns it into at most three sentences plus one instruction.
   *
   * tally shape:
   *  { contests: {win:{for,against}, prog:{for,against}, fin:{for,against}},
   *    channels: [{for,against} x3],   // left / middle / right
   *    lines:    [{for,against} x3],   // def / mid / att
   *    goalsFor, goalsAgainst, countersConceded, countersScored,
   *    topContributor: {name, why}, worstLine: n, extras: [{text, good}] } */

  function explain(t) {
    var reasons = [];
    var won = t.goalsFor > t.goalsAgainst;
    var drew = t.goalsFor === t.goalsAgainst;

    function pct(o) { var n = o.for + o.against; return n ? o.for / n : 0.5; }

    var phases = [
      { key: 'win', label: 'winning the ball back', stat: 'WIN', buy: 'a ball-winner' },
      { key: 'prog', label: 'getting the ball forward', stat: 'PROGRESS', buy: 'a midfielder who carries' },
      { key: 'fin', label: 'finishing in their box', stat: 'FINISH', buy: 'a finisher' }
    ];
    phases.forEach(function (ph) {
      var o = t.contests[ph.key]; if (!o || (o.for + o.against) < 2) return;
      var p = pct(o);
      if (p >= 0.62) reasons.push({
        good: true, weight: (p - 0.5) * (o.for + o.against),
        head: 'You won ' + ph.label + ', ' + o.for + ' to ' + o.against + '.',
        note: 'Your ' + ph.stat + ' beat theirs in ' + Math.round(p * 100) + ' percent of those contests.'
      });
      if (p <= 0.38) reasons.push({
        good: false, weight: (0.5 - p) * (o.for + o.against),
        head: 'You lost ' + ph.label + ', ' + o.for + ' to ' + o.against + '.',
        note: 'Go and get ' + ph.buy + '. ' + ph.stat + ' is the number to look at.'
      });
    });

    if (t.channels) {
      t.channels.forEach(function (c, i) {
        var n = c.for + c.against; if (n < 3) return;
        var p = c.for / n;
        if (p <= 0.30) reasons.push({
          good: false, weight: (0.5 - p) * n * 1.3,
          head: 'They owned ' + CHANNEL_NAMES[i] + '.',
          note: 'You lost ' + c.against + ' of ' + n + ' contests there. You need someone who can win the ball back on ' + CHANNEL_NAMES[i].replace('the ', 'the ') + '.'
        });
        if (p >= 0.75) reasons.push({
          good: true, weight: (p - 0.5) * n,
          head: 'You owned ' + CHANNEL_NAMES[i] + '.',
          note: 'You won ' + c.for + ' of ' + n + ' contests there.'
        });
      });
    }

    if (t.countersConceded >= 2) reasons.push({
      good: false, weight: t.countersConceded * 1.6,
      head: 'They countered you ' + t.countersConceded + ' times.',
      note: 'You were caught with too many players forward. Recruit cover, or push up less often.'
    });
    if (t.countersScored >= 1) reasons.push({
      good: true, weight: t.countersScored * 1.5,
      head: 'Your counters hurt them ' + t.countersScored + ' times.',
      note: 'Pace in the front line is paying. More of it.'
    });
    if (t.topContributor) reasons.push({
      good: true, weight: 1.2,
      head: t.topContributor.name + ' was the match.',
      note: t.topContributor.why
    });
    (t.extras || []).forEach(function (e) {
      reasons.push({ good: !!e.good, weight: e.weight || 1.4, head: e.text, note: e.note || '' });
    });

    // rank: reasons that agree with the result first, then by weight
    reasons.forEach(function (r) { r.score = r.weight * ((r.good === won && !drew) ? 1.5 : 1); });
    reasons.sort(function (a, b) { return b.score - a.score; });

    var top = reasons.slice(0, 3);
    var next = nextThing(t, reasons);
    return { reasons: top, next: next, won: won, drew: drew };
  }

  function nextThing(t, reasons) {
    var bad = reasons.filter(function (r) { return !r.good; });
    if (!bad.length) return 'Nothing broke. Take the reward that raises your ceiling, not your floor.';
    var worst = bad[0];
    if (worst.head.indexOf('winning the ball back') >= 0)
      return 'Next pick: take WIN. A high WIN player anywhere in your own half is worth more to you right now than a forward.';
    if (worst.head.indexOf('getting the ball forward') >= 0)
      return 'Next pick: take PROGRESS. You are defending fine and dying on the way up the pitch.';
    if (worst.head.indexOf('finishing') >= 0)
      return 'Next pick: take FINISH. You are arriving in their box and leaving with nothing.';
    if (worst.head.indexOf('owned') >= 0)
      return 'Next pick: reinforce ' + (worst.head.match(/the \w+/) || ['that side'])[0] + '. One player there changes the whole match.';
    if (worst.head.indexOf('countered') >= 0)
      return 'Next pick: cover behind your attack, or an Anchor keyword, before you buy another forward.';
    return 'Next pick: fix the first line of the report.';
  }

  function renderReport(el, t) {
    var r = explain(t);
    var html = '<h2>' + (r.won ? 'Why you won' : r.drew ? 'Why it finished level' : 'Why you lost') + '</h2>';
    r.reasons.forEach(function (x) {
      html += '<div class="reason' + (x.good ? '' : ' bad') + '"><b>' + escapeHTML(x.head) + '</b>' +
        '<span>' + escapeHTML(x.note) + '</span></div>';
    });
    html += '<div class="reason"><b>What to look for next</b><span>' + escapeHTML(r.next) + '</span></div>';
    el.innerHTML = html;
    return r;
  }

  /* ------------------------------------------------------- cup + rewards */

  /* The mini cup. Lifts are relative to the manager's starting squad, and the
   * ramp is deliberately gentle: the run design's own rule is that the first
   * round is winnable and the run dies late. */
  var CUP_ROUNDS = [
    { name: 'Round of 16', lift: -1 },
    { name: 'Quarter-final', lift: -0.4 },
    { name: 'FINAL', lift: 0.3 }
  ];

  /* Knockout ties need a winner. Five kicks each, the taker's FINISH against
   * the keeper's WIN, then sudden death. Football, and one line of report. */
  function shootout(home, away, rng) {
    function taker(sq) {
      return sq.players.slice().sort(function (a, b) { return b.fin - a.fin; });
    }
    var hT = taker(home), aT = taker(away), h = 0, a = 0, i = 0;
    var log = [];
    while (true) {
      var hp = hT[i % hT.length], ap = aT[i % aT.length];
      var hs = (hp.fin + rng.range(0, 8)) > (away.keeper.win + rng.range(0, 6));
      var as = (ap.fin + rng.range(0, 8)) > (home.keeper.win + rng.range(0, 6));
      if (hs) h++; if (as) a++;
      log.push({ i: i, home: hs, away: as, homeName: hp.name, awayName: ap.name });
      i++;
      if (i >= 5 && h !== a) break;
      if (i >= 12) { if (h === a) { h += rng.chance(0.5) ? 1 : 0; if (h === a) a++; } break; }
    }
    return { home: h, away: a, log: log, winner: h > a ? 'home' : 'away' };
  }

  /* Three offers, one of each kind, exactly as the brief asks:
   * recruit a player / add a keyword to a player / release a player. */
  function makeRewards(rng, squad, round) {
    var offers = [];
    var line = rng.int(3);
    var rec = makePlayer(rng, rng.pick(ROLES_BY_LINE[line]), { lift: round + 1, kwChance: 0.75 });
    offers.push({
      kind: 'recruit', player: rec,
      title: 'Recruit ' + rec.name,
      body: rec.role + '  W' + rec.win + ' P' + rec.prog + ' F' + rec.fin +
        (rec.keywords.filter(Boolean).length ? '  [' + rec.keywords.filter(Boolean).map(function (k) { return KEYWORDS[k].name; }).join(', ') + ']' : ''),
      apply: function (sq) { sq.bench.push(rec); reseat(sq); }
    });

    var eligible = squad.players.filter(function (p) { return p.keywords.filter(Boolean).length < 2; });
    if (eligible.length) {
      var who = rng.pick(eligible);
      var pool = who.homeLine === 0 ? ['SWEEPER', 'ANCHOR', 'PRESS_TRIGGER', 'OVERLAP', 'TWIN_ENGINE'] :
        who.homeLine === 1 ? ['BALL_WINNER', 'TWIN_ENGINE', 'METRONOME', 'TALISMAN', 'PRESS_TRIGGER'] :
          ['TARGET_MAN', 'LIVEWIRE', 'TWIN_ENGINE', 'TALISMAN'];
      var kw = rng.pick(pool.filter(function (k) { return who.keywords.indexOf(k) < 0; }) || pool);
      if (kw) offers.push({
        kind: 'keyword', player: who, keyword: kw,
        title: 'Train ' + who.name,
        body: KEYWORDS[kw].name + ': ' + KEYWORDS[kw].text,
        apply: function () { who.keywords.push(kw); }
      });
    }

    var all = squad.players.concat(squad.bench);
    if (all.length > 11) {
      var worst = all.slice().sort(function (a, b) { return rating(a) - rating(b); })[0];
      offers.push({
        kind: 'release', player: worst,
        title: 'Release ' + worst.name,
        body: 'Thin the squad. ' + worst.role + '  W' + worst.win + ' P' + worst.prog + ' F' + worst.fin +
          '. Everyone behind him moves up a place.',
        apply: function (sq) {
          sq.players = sq.players.filter(function (p) { return p !== worst; });
          sq.bench = sq.bench.filter(function (p) { return p !== worst; });
          reseat(sq);
        }
      });
    }
    // always exactly three, padded with a second recruit if a kind is missing
    while (offers.length < 3) {
      var l2 = rng.int(3);
      var r2 = makePlayer(rng, rng.pick(ROLES_BY_LINE[l2]), { lift: round, kwChance: 0.6 });
      offers.push({
        kind: 'recruit', player: r2, title: 'Recruit ' + r2.name,
        body: r2.role + '  W' + r2.win + ' P' + r2.prog + ' F' + r2.fin,
        apply: function (sq) { sq.bench.push(r2); reseat(sq); }
      });
    }
    return offers.slice(0, 3);
  }

  function renderRewards(el, offers, squad, onPick) {
    var html = '<h2>Between matches: take one</h2><div class="grid3">';
    offers.forEach(function (o, i) {
      html += '<div class="card choice" data-i="' + i + '">' +
        '<span class="pill">' + o.kind.toUpperCase() + '</span>' +
        '<b style="display:block;margin:6px 0 3px">' + escapeHTML(o.title) + '</b>' +
        '<span class="small">' + escapeHTML(o.body) + '</span></div>';
    });
    html += '</div><p class="small">Or take nothing and keep the squad as it is.</p>' +
      '<button id="skipreward">Take nothing</button>';
    el.innerHTML = html;
    Array.prototype.slice.call(el.querySelectorAll('.choice')).forEach(function (c) {
      c.onclick = function () {
        var o = offers[+c.getAttribute('data-i')];
        o.apply(squad);
        onPick(o);
      };
    });
    el.querySelector('#skipreward').onclick = function () { onPick(null); };
  }

  /* --------------------------------------------------------- squad list */

  function renderSquad(el, squad, title) {
    var rows = squad.players.slice().sort(function (a, b) {
      return (a.line - b.line) || (a.slot - b.slot);
    });
    var html = '<h2>' + (title || 'Your eleven') + '</h2><table><tr><th>Line</th><th>Name</th><th>Role</th>' +
      '<th>W</th><th>P</th><th>F</th><th>Keywords</th></tr>';
    html += '<tr><td>GK</td><td>' + escapeHTML(squad.keeper.name) + '</td><td>keeper</td><td>' +
      squad.keeper.win + '</td><td>-</td><td>-</td><td>' +
      squad.keeper.keywords.filter(Boolean).map(function (k) { return '<span class="kw">' + KEYWORDS[k].name + '</span>'; }).join('') + '</td></tr>';
    rows.forEach(function (p) {
      html += '<tr><td>' + LINE_SHORT[p.line] + ' ' + CHANNEL_NAMES[CHANNEL_OF[p.slot]].replace('the ', '') +
        '</td><td>' + escapeHTML(p.name) + '</td><td>' + p.role + '</td><td>' + p.win + '</td><td>' +
        p.prog + '</td><td>' + p.fin + '</td><td>' +
        p.keywords.filter(Boolean).map(function (k) {
          return '<span class="kw" title="' + escapeHTML(KEYWORDS[k].text) + '">' + KEYWORDS[k].name + '</span>';
        }).join('') + '</td></tr>';
    });
    html += '</table>';
    if (squad.bench.length) {
      html += '<p class="small">Bench: ' + squad.bench.map(function (p) {
        return escapeHTML(p.name) + ' (' + p.short + ')';
      }).join(', ') + '</p>';
    }
    el.innerHTML = html;
  }

  /* ------------------------------------------------------------- export */

  var API = {
    dedupeNames: dedupeNames,
    RNG: RNG, mulberry32: mulberry32,
    ROLES: ROLES, ROLES_BY_LINE: ROLES_BY_LINE, KEYWORDS: KEYWORDS, KEYWORD_IDS: KEYWORD_IDS,
    FORMATIONS: FORMATIONS, LINE_NAMES: LINE_NAMES, LINE_SHORT: LINE_SHORT,
    CHANNEL_OF: CHANNEL_OF, CHANNEL_NAMES: CHANNEL_NAMES, CLUBS: CLUBS,
    makePlayer: makePlayer, makeSquad: makeSquad, reseat: reseat, rating: rating,
    adjacent: adjacent, resolveSynergies: resolveSynergies, keeperWin: keeperWin,
    CUP_ROUNDS: CUP_ROUNDS, makeRewards: makeRewards, shootout: shootout,
    // browser only
    injectCSS: injectCSS, Pitch: Pitch, Feed: Feed, escapeHTML: escapeHTML,
    explain: explain, renderReport: renderReport, renderRewards: renderRewards,
    renderSquad: renderSquad
  };

  root.Cantera = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
