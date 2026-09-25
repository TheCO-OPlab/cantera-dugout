/* p1: THE PITCH (the pitch run's contract, GOALS.md).
 *
 * Coordinates in metres. The pitch is 68 wide (x: 0 = the left touchline as
 * the user sees it, 68 = the right) and 105 long (y: 0 = the user's own goal
 * line, 105 = the opponent's). It is drawn vertically, the user's goal at the
 * bottom. The engine's zones are y bands; its lanes (CHANNEL_OF) are x bands.
 *
 * This file only reads the engine's objects. It never changes them and never
 * touches the match RNG: everything random here comes from a hash of the
 * match seed and the moment, so the same match draws the same way.
 *
 * Runs in a browser as a classic script and under node. */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');

  var W = 68, L = 105, CENTRE = { x: 34, y: 52.5 };
  /* the zone bands, attacking up the screen for the user */
  var BAND = { yourBox: [0, 16.5], yourHalf: [16.5, 40], midfield: [40, 70], edge: [70, 88.5], theirBox: [88.5, 105] };
  /* the user's attack: engine zoneIndex 0..3 */
  var YOU_BANDS = [BAND.yourHalf, BAND.midfield, BAND.edge, BAND.theirBox];
  /* where inside a band the ball usually is when a moment starts there */
  var YOU_Y = [[21, 36], [45, 65], [74, 86], [92, 99]];
  /* the lanes, from the user's view: left, centre, right */
  var LANES = [[0, 22], [22, 46], [46, 68]];
  /* a slot's x for the user's team (slot 0 = the left touchline); the
   * opponent's are mirrored, because their left is the user's right. Slots
   * 1 and 3 are central (CHANNEL_OF), so they sit inside 22..46. */
  var SLOT_X = [9, 25.5, 34, 42.5, 59];
  /* how far from its own goal line each line stands with the ball at the
   * centre spot: keeper, defence, midfield, attack */
  var LINE_U = { k: 4, 0: 27, 1: 43, 2: 57 };
  var R = 1.3;              // a player dot's radius, metres
  var MIN_GAP = 2.9;        // no two dots closer than this in a drawn frame
  var FREEZE_GAP = 3.5;     // and a little more room in a frozen moment
  var CLEAR = 4.6;          // nobody but the named men this close to the man on the ball when play stops
  var BALL_OFF = 1.6;       // the ball sits this far in front of the man on it

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* a small deterministic hash to [0, 1): the same inputs, the same number */
  function hash01() {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i]);
      for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; }
      h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /* ------------------------------------------------------------ who is who */
  function isKeeper(p, sq) { return !!(p && sq && p === sq.keeper); }
  /* the 22, keepers first: { p, id, team, keeper, num } */
  function roster(st) {
    var out = [];
    [['you', st.squad], ['them', st.opp]].forEach(function (pair) {
      var sq = pair[1];
      if (sq.keeper) out.push({ p: sq.keeper, id: sq.keeper.id, team: pair[0], keeper: true, num: sq.keeper.number || 1 });
      sq.players.forEach(function (p, i) {
        out.push({ p: p, id: p.id, team: pair[0], keeper: false, num: p.number || i + 2 });
      });
    });
    return out;
  }
  function teamOf(st, p) {
    if (!p) return null;
    if (p === st.squad.keeper || st.squad.players.indexOf(p) >= 0) return 'you';
    if (p === st.opp.keeper || st.opp.players.indexOf(p) >= 0) return 'them';
    return null;
  }
  function onPitch(st, p) { return teamOf(st, p) !== null; }
  function byId(st, id) {
    var r = roster(st);
    for (var i = 0; i < r.length; i++) if (r[i].id === id) return r[i].p;
    return null;
  }

  /* ------------------------------------------------------------ lanes, bands */
  /* the engine's lane for a player, from the user's view: CHANNEL_OF for the
   * user's men, mirrored for theirs. A keeper is central. */
  function laneOf(p, team) {
    if (!p || typeof p.slot !== 'number') return 1;
    return C.CHANNEL_OF[team === 'them' ? 4 - p.slot : p.slot];
  }
  function laneOfX(x) { return x < 22 ? 0 : x < 46 ? 1 : 2; }
  function bandFor(attacking, zoneIndex) {
    if (attacking === 'them') return zoneIndex === -1 ? BAND.yourBox : zoneIndex === 0 ? BAND.yourHalf : BAND.midfield;
    return YOU_BANDS[clamp(zoneIndex, 0, 3)];
  }

  /* ------------------------------------------------------------ home, shape */
  /* a player's home from his line and slot, in his team's own terms: u is
   * metres from his own goal line, x is the user's x. A few formation
   * details: a lone holding midfielder (slot 2 of a three) sits deeper, a
   * lone striker higher, wide men wider, full-backs a little higher. */
  function homeOf(p, team, formation) {
    var u, x;
    if (!p) return { x: CENTRE.x, y: CENTRE.y, u: 52.5 };
    if (typeof p.line !== 'number' || typeof p.slot !== 'number') { u = LINE_U.k; x = 34; }
    else {
      u = LINE_U[p.line];
      x = SLOT_X[p.slot];
      var f = formation || '4-4-2';
      if (p.line === 0 && (p.slot === 0 || p.slot === 4) && f !== '5-3-2') u += 3;         // full-backs
      if (p.line === 1 && p.slot === 2 && (f === '4-3-3' || f === '5-3-2')) u -= 5;       // holding midfielder
      if (p.line === 1 && (p.slot === 0 || p.slot === 4)) { x += p.slot === 0 ? -2 : 2; u += 1; }  // wide midfielders
      if (p.line === 2 && p.slot === 2) u += 3;                                            // centre-forward
      if (p.line === 2 && (p.slot === 0 || p.slot === 4)) { x += p.slot === 0 ? 1 : -1; u -= 2; } // wingers
    }
    if (team === 'them') x = W - x;
    return { x: x, u: u, y: team === 'them' ? L - u : u };
  }

  /* THE TEAM SHAPE. The eleven slide with the ball and with who has it:
   * the block moves up and down the pitch after the ball, shifts across
   * towards it, spreads out when it has the ball and squeezes up (shorter
   * and narrower) when it does not. Returns { id: {x, y} } for one team. */
  function shape(team, sq, ball, poss) {
    var out = {};
    var bu = team === 'you' ? ball.y : L - ball.y;          // the ball, in this team's own terms
    var mine = poss === team;
    var shiftU = (bu - 52.5) * (mine ? 0.6 : 0.55);
    var spreadU = mine ? 1.12 : 0.74;
    var spreadX = mine ? 1.1 : 0.7;
    var towards = (ball.x - 34) * (mine ? 0.22 : 0.42);
    var f = sq.formation;
    sq.players.forEach(function (p) {
      var h = homeOf(p, team, f);
      var u = 43 + (h.u - 43) * spreadU + shiftU;
      var x = 34 + (h.x - 34) * spreadX + towards;
      if (p.line === 0) u = clamp(u, 6.5, mine ? 58 : 50);
      if (p.line === 2 && mine && bu > 72) u += (bu - 72) * 0.45;      // forwards get into the box
      if (!mine && p.line === 2) u = Math.max(u, 36);                  // forwards stay up the pitch a little
      if (!mine && bu < 30 && p.line >= 1) u = Math.max(u, p.line === 1 ? 14 : 30);
      u = clamp(u, 3, 100);
      out[p.id] = { x: clamp(x, 2, W - 2), y: team === 'you' ? u : L - u };
    });
    if (sq.keeper) {
      var ku = clamp(3.5 + Math.max(0, bu - 30) * 0.16, 2.5, 17);
      var kx = 34 + (ball.x - 34) * 0.14;
      out[sq.keeper.id] = { x: kx, y: team === 'you' ? ku : L - ku };
    }
    return out;
  }
  /* both teams */
  function shapeAll(st, ball, poss) {
    var a = shape('you', st.squad, ball, poss), b = shape('them', st.opp, ball, poss);
    for (var k in b) a[k] = b[k];
    return a;
  }
  /* the kick-off: everyone in his own half */
  function kickoffShape(st) {
    var pos = shapeAll(st, CENTRE, null);
    roster(st).forEach(function (r) {
      var q = pos[r.id];
      if (r.team === 'you') q.y = Math.min(q.y, 50.5); else q.y = Math.max(q.y, 54.5);
      if (!r.keeper && Math.abs(q.x - 34) < 9.5 && Math.abs(q.y - 52.5) < 9.5) q.y = r.team === 'you' ? 42.5 : 62.5;
    });
    return pos;
  }

  /* keep everyone on the pitch, and push apart dots that touch. `fixed` men
   * do not move (the man on the ball, the man named next to him). */
  function tidy(pos, fixed, gap) {
    fixed = fixed || {};
    var G = gap || MIN_GAP;
    var ids = Object.keys(pos);
    for (var it = 0; it < 8; it++) {
      var moved = false;
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var a = pos[ids[i]], b = pos[ids[j]];
          var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d >= G) continue;
          var fa = !!fixed[ids[i]], fb = !!fixed[ids[j]];
          if (fa && fb) continue;
          if (d < 1e-6) { dx = (hash01(ids[i], ids[j]) - 0.5) || 0.3; dy = 0.5; d = Math.sqrt(dx * dx + dy * dy); }
          var push = (G - d) + 0.05, ux = dx / d, uy = dy / d;
          if (fa) { b.x += ux * push; b.y += uy * push; }
          else if (fb) { a.x -= ux * push; a.y -= uy * push; }
          else { a.x -= ux * push / 2; a.y -= uy * push / 2; b.x += ux * push / 2; b.y += uy * push / 2; }
          moved = true;
        }
      }
      ids.forEach(function (id) { if (!fixed[id]) { pos[id].x = clamp(pos[id].x, 0.9, W - 0.9); pos[id].y = clamp(pos[id].y, 0.9, L - 0.9); } });
      if (!moved) break;
    }
    return pos;
  }

  /* ------------------------------------------------------------ the moment */
  /* who has the ball when a decision starts: the state of play's man, the
   * crosser at a cross or a set piece, the man running onto a ball in the
   * air, or (with the chain switched off) the man the situation is about */
  function holderOf(st, p) {
    var mo = p.moment || {}, cast = mo.cast || {}, pl = p.play || null;
    var via = (pl && pl.via) || p.via || mo.via || null;
    if (mo.zone === -1 && cast.crosser && (via === 'cross' || via === 'lowcross' || via === 'corner' || via === 'fkcross')) {
      /* d1: when the text names the man waiting in the box and the engine's
       * crosser is that same man, the ball is with a team-mate out wide */
      if (cast.crosser === cast.foil && (via === 'cross' || via === 'lowcross')) return wideMate(st, cast.foil, p.index) || cast.crosser;
      return cast.crosser;
    }
    if (via === 'header' && cast.foil) return cast.foil;
    if (pl && pl.ball && onPitch(st, pl.ball)) return pl.ball;
    if (pl && pl.target && onPitch(st, pl.target)) return pl.target;
    if (p.carrier && onPitch(st, p.carrier)) return p.carrier;
    var who = p.attacking || (mo.sit && mo.sit.who);
    var h = who === 'them' ? (cast.foil || cast.actor) : (cast.actor || cast.foil);
    if (h && onPitch(st, h)) return h;
    return who === 'them' ? st.opp.players[st.opp.players.length - 1] : st.squad.players[st.squad.players.length - 1];
  }
  /* a wide team-mate of `p` (not him), for a cross */
  function wideMate(st, p, salt) {
    var t = teamOf(st, p), sq = t === 'you' ? st.squad : st.opp;
    var l = sq.players.filter(function (q) { return q !== p && q.line >= 1 && C.CHANNEL_OF[q.slot] !== 1; });
    if (!l.length) l = sq.players.filter(function (q) { return q !== p && q.line >= 1; });
    return l.length ? l[Math.floor(hash01(st.seed, salt, 'wide') * l.length)] : null;
  }
  /* the man the scene names next to him ("X is the nearest of their players
   * to him"), when there is one */
  function nearOf(st, p, holder) {
    var mo = p.moment || {}, cast = mo.cast || {}, pl = p.play || null;
    var ht = teamOf(st, holder), c = [];
    if (pl && pl.near) c.push(pl.near);
    c.push(cast.foil, cast.actor);
    for (var i = 0; i < c.length; i++) {
      var q = c[i];
      if (q && q !== holder && onPitch(st, q) && teamOf(st, q) !== ht && !isKeeper(q, st.squad) && !isKeeper(q, st.opp)) return q;
    }
    return null;
  }

  /* ------------------------------------------------------------ d1: scenes */
  /* d1: WHAT THE PITCH MUST SHOW. Every moment the engine can start belongs
   * to one scene class (SCENES.md has the table). The class comes from the
   * engine's own fields (who attacks, the zone, how the ball got there,
   * the situation); the men the scene names beyond the man on the ball (the
   * runner, the full-back in front of him) are read off the scene's text,
   * because the text is what the user reads and the pitch has to agree with
   * it. The director stages the play INTO the scene; freeze() draws its
   * last picture. */
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }
  /* the man with this first name, on this team (either team when null).
   * Names can hold a no-break space ("De Paul"): a name is anything up to an
   * ordinary space, a full stop or a comma. */
  function byFirst(st, nm, team) {
    if (!nm) return null;
    var r = roster(st);
    for (var i = 0; i < r.length; i++) if ((!team || r[i].team === team) && first(r[i].p) === nm) return r[i].p;
    return null;
  }
  var NM = '([^ .,:]+)';
  function grab(text, re) { var m = re.exec(text); return m ? m[1] : null; }
  var SIT_SCENE = {
    press_trap: 'won_high', second_ball: 'second_ball', third_man: 'third_man', overlap: 'overlap',
    counter_from_corner: 'break_from_corner', dead_ball_wide: 'freekick_wide', caught_square: 'caught_square',
    keeper_to_feet: 'keeper_pressed', over_the_top: 'over_top', their_dribbler: 'dribbler',
    their_playmaker: 'playmaker', their_winger: 'winger', tired_gap: 'tired_gap'
  };
  function sceneOf(st, p, holder, via, special) {
    var mo = p.moment || {}, sit = mo.sit || {}, text = String(mo.text || ''), threat = String(p.threat || mo.threat || '');
    var att = p.attacking || sit.who || 'you', zi = p.zoneIndex;
    var sc = { id: 'on_ball', roles: {} };
    var you = 'you', them = 'them';
    if (special === 'keeper') sc.id = sit.id === 'keeper_to_feet' ? 'keeper_pressed' : 'keeper_ball';
    else if (att === 'them' && zi === -1) {
      sc.id = via === 'corner' ? 'corner' : via === 'cross' ? 'cross_high' : via === 'lowcross' ? 'cross_low'
        : via === 'fkcross' ? 'freekick_cross' : via === 'freekick' ? 'freekick_them' : via === 'header' ? 'header'
        : via === 'alone' ? 'alone' : via === 'open' ? 'keeper_out' : 'in_box';
      if (sit.id === 'siege' && !p.continues) sc.siege = true;
    } else if (att === 'you' && p.mode === 'freekick') sc.id = 'freekick_you';
    else if (!p.continues && p.handoff) sc.id = 'your_new_attack';
    else if (!p.continues && SIT_SCENE[sit.id]) sc.id = SIT_SCENE[sit.id];
    else if (att === 'them') sc.id = p.isCounter ? 'counter' : 'their_on_ball';
    else sc.id = zi === 3 ? 'in_their_box' : 'on_ball';
    /* the scene names more men than the man on the ball */
    var R = sc.roles;
    if (sc.id === 'overlap') {
      var a1 = grab(text, new RegExp(NM + ' has run past ' + NM + ' on the outside'));
      var a2 = new RegExp(NM + ' has run past ' + NM + ' on the outside').exec(text);
      if (a2) { R.runner = byFirst(st, a2[1], you); R.winger = byFirst(st, a2[2], you); }
      else if (/he has run past your own winger/.test(text)) R.fullback = holder;
      else { var a3 = grab(text, new RegExp(NM + ' is running up the (?:left|right) wing')); if (a3) R.runner = byFirst(st, a3, you); }
      if (a1 && !R.runner) R.runner = byFirst(st, a1, you);
    }
    if (sc.id === 'playmaker') R.runner = byFirst(st, grab(text, new RegExp(NM + ' is starting to run between your defenders')), them);
    if (sc.id === 'winger') R.front = byFirst(st, grab(text, new RegExp(NM + ', your (?:full-back|wide midfielder|player), is the only one')), you);
    if (sc.id === 'dribbler') {
      R.front = byFirst(st, grab(text, new RegExp(NM + ' is the defender in front of')), you);
      var pr = new RegExp('Because ' + NM + ' and ' + NM + ' play one-twos, ' + NM + ' is there to give').exec(threat);
      if (pr) R.mate = byFirst(st, pr[3], them);
    }
    if (sc.id === 'cross_low') R.target = byFirst(st, grab(text, new RegExp('and ' + NM + ' is running in')), them);
    if (sc.id === 'cross_high') R.target = byFirst(st, grab(text, new RegExp(NM + ' is waiting in your box for the cross')), them);
    if (sc.id === 'corner' || sc.id === 'freekick_cross') R.target = byFirst(st, grab(text, new RegExp(NM + ' is their best player in the air')), them);
    if (sc.id === 'counter' || /took the ball and passed it to/.test(text)) R.taker = byFirst(st, grab(text, new RegExp(NM + ' took the ball and passed it to')), them);
    if (sc.id === 'third_man') {
      /* "one of your players is running past their defence": a forward */
      var fw = st.squad.players.filter(function (q) { return q.line === 2 && q !== holder; });
      if (!fw.length) fw = st.squad.players.filter(function (q) { return q.line === 1 && q !== holder; });
      R.runner = fw.length ? fw[Math.floor(hash01(st.seed, p.index, 'run') * fw.length)] : null;
    }
    if (sc.id === 'break_from_corner') {
      var fw2 = st.squad.players.filter(function (q) { return q.line >= 1 && q !== holder; })
        .sort(function (a, b) { return b.line - a.line || a.slot - b.slot; });
      R.runner = fw2.length ? fw2[Math.floor(hash01(st.seed, p.index, 'brk') * Math.min(3, fw2.length))] : null;
    }
    return sc;
  }

  /* WHERE A MOMENT STARTS: the ball's position (its zone band and lane), the
   * man on it, and the men the scene names. `special` says when the scene
   * puts the ball somewhere its zone alone does not (a corner flag, a free
   * kick outside the box, a ball by the touchline). Deterministic: jitter
   * comes from the match seed and the moment. */
  var BOX_X = [13.84, 54.16], BOX_D = 16.5;
  function startOf(st, p) {
    var mo = p.moment || {}, sit = mo.sit || {}, pl = p.play || null;
    var attacking = p.attacking || sit.who || 'you';
    var holder = API.holderOf(st, p), team = teamOf(st, holder) || attacking;
    var zi = typeof p.zoneIndex === 'number' ? p.zoneIndex : (attacking === 'them' ? 0 : 2);
    var via = (pl && pl.via) || p.via || mo.via || null;
    var j1 = hash01(st.seed, p.index, p.step || 1, 'x'), j2 = hash01(st.seed, p.index, p.step || 1, 'y');
    var band = bandFor(attacking, zi), lane = laneOf(holder, team), special = null, air = false, target = null;
    var yr;
    if (attacking === 'them') yr = zi === -1 ? [5, 13] : zi === 0 ? [21, 35] : [44, 64];
    else yr = YOU_Y[clamp(zi, 0, 3)];
    var home = homeOf(holder, team, (team === 'you' ? st.squad : st.opp).formation);
    var lb = LANES[lane];
    var x = clamp(home.x + (j1 - 0.5) * 6, lb[0] + 2.5, lb[1] - 2.5);
    var y = lerp(yr[0], yr[1], j2);
    var side = lane === 1 ? (j1 < 0.5 ? 0 : 2) : lane;          // which wing, for wide set pieces
    if (isKeeper(holder, st.squad) || isKeeper(holder, st.opp)) {
      special = 'keeper'; lane = 1;
      band = team === 'you' ? BAND.yourBox : BAND.theirBox;
      x = 34 + (j1 - 0.5) * 8; y = team === 'you' ? 8 + j2 * 4 : L - 8 - j2 * 4;
    } else if (attacking === 'them' && zi === -1 && via === 'corner') {
      special = 'corner'; lane = side; x = side === 0 ? 0.8 : W - 0.8; y = 0.8;
    } else if (attacking === 'them' && zi === -1 && (via === 'cross' || via === 'lowcross')) {
      special = 'cross'; lane = side; x = side === 0 ? 4 + j1 * 5 : W - 4 - j1 * 5; y = 5 + j2 * 9;
    } else if (attacking === 'them' && zi === -1 && via === 'fkcross') {
      special = 'setpiece'; lane = side; band = [16.5, 30]; x = side === 0 ? 11 + j1 * 6 : W - 11 - j1 * 6; y = 19 + j2 * 7;
    } else if (attacking === 'them' && zi === -1 && via === 'freekick') {
      special = 'setpiece'; band = [16.5, 30]; y = 19 + j2 * 6;
      x = clamp(x, 18, 50);
    } else if (attacking === 'them' && zi === -1 && via === 'header') {
      special = 'air'; air = true; x = 28 + j1 * 12; y = 6 + j2 * 4; lane = laneOfX(x);
    } else if (attacking === 'you' && sit.id === 'dead_ball_wide' && (p.step || 1) === 1) {
      special = 'setpiece'; lane = side; x = side === 0 ? 2.5 + j1 * 3 : W - 2.5 - j1 * 3; y = 84 + j2 * 3.5;
    } else if (attacking === 'you' && p.mode === 'freekick') {
      special = 'setpiece'; y = 79 + j2 * 5; x = clamp(x, 18, 50);
    }
    /* d1: "in your box" / "in their box" means inside the drawn box, not only
     * the depth of it: the ball is kept inside the box's width, still in the
     * man's lane (the box's width overlaps every lane) */
    if (!special && ((attacking === 'them' && zi === -1) || (attacking === 'you' && zi === 3))) x = clamp(x, BOX_X[0] + 2.2, BOX_X[1] - 2.2);
    if (pl && pl.air && !pl.ball && pl.target) { air = true; target = pl.target; }
    if (via === 'header') air = true;
    /* the man the ball is crossed to, when the scene names him */
    var crossTo = null;
    if (special === 'corner' || special === 'cross' || (special === 'setpiece' && via === 'fkcross')) {
      var f = mo.cast && mo.cast.foil;
      if (f && f !== holder && onPitch(st, f)) crossTo = f;
    }
    var S = {
      x: clamp(x, 0.5, W - 0.5), y: clamp(y, 0.5, L - 0.5), band: band, lane: lane, zoneIndex: zi,
      holder: holder, holderId: holder ? holder.id : null, team: team, attacking: attacking,
      near: nearOf(st, p, holder), crossTo: crossTo, special: special, air: air, via: via
    };
    S.scene = sceneOf(st, p, holder, via, special);
    S.seed = st.seed; S.index = p.index; S.step = p.step || 1;
    return S;
  }

  /* ------------------------------------------------------------ freeze */
  function dirOf(team) { return team === 'you' ? 1 : -1; }
  function otherTeam(t) { return t === 'you' ? 'them' : 'you'; }
  function squadOf(st, team) { return team === 'you' ? st.squad : st.opp; }
  /* the goal a team attacks */
  function goalOf(team) { return { x: 34, y: team === 'you' ? L : 0 }; }
  /* q stands between the ball and the goal `team` attacks, by more than `by` metres */
  function goalSide(q, ball, team, by) { return (q.y - ball.y) * dirOf(team) > (by || 0); }
  /* a point `d` metres into the pitch from the goal line `team` attacks, at x */
  function boxPt(team, x, d) { return { x: x, y: team === 'you' ? L - d : d }; }
  function inBox(pt, team) {           // inside the drawn box of the goal `team` attacks
    return pt.x >= BOX_X[0] && pt.x <= BOX_X[1] && (team === 'you' ? pt.y >= L - BOX_D : pt.y <= BOX_D);
  }
  function freeMen(st, team, fixed, pos, near, lines) {
    var l = squadOf(st, team).players.filter(function (q) { return !fixed[q.id] && (!lines || lines.indexOf(q.line) >= 0); });
    if (near) l.sort(function (a, b) { return dist(pos[a.id], near) - dist(pos[b.id], near); });
    return l;
  }
  function put(pos, fixed, q, pt) {
    if (!q) return;
    pos[q.id] = { x: clamp(pt.x, 0.9, W - 0.9), y: clamp(pt.y, 0.9, L - 0.9) };
    fixed[q.id] = 1;
  }
  /* A WALL: n of the defending side 9.15 m from the ball, across the line
   * from the ball to the goal, shoulder to shoulder (dots 2.2 m apart) */
  var WALL_D = 9.15, WALL_GAP = 2.2;
  function wall(st, S, pos, fixed, n, first0) {
    var g = goalOf(S.team), dx = g.x - S.x, dy = g.y - S.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d, px = -uy, py = ux;
    var c = { x: S.x + ux * WALL_D, y: S.y + uy * WALL_D };
    /* the man the scene names beside the taker is in the wall: nobody is
     * nearer the ball than 9.15 m at a free kick */
    if (first0) delete fixed[first0.id];
    var men = freeMen(st, otherTeam(S.team), fixed, pos, c).filter(function (q) { return q !== first0; });
    if (first0) men.unshift(first0);
    men = men.slice(0, n);
    men.forEach(function (q, i) {
      var o = (i - (men.length - 1) / 2) * WALL_GAP;
      put(pos, fixed, q, { x: c.x + px * o, y: c.y + py * o });
    });
    return men;
  }
  /* THE BOX FOR A BALL COMING IN: `n` of the attacking side on the spots
   * (their best in the air first, when the scene names him), each with a
   * marker of the defending side a stride goal-side of him */
  var SPOTS = [[34, 10.5], [29.5, 7], [39, 7.5], [25, 12.5], [43, 12.5], [34, 15], [21.5, 9], [47, 9]];
  function packBox(st, S, pos, fixed, n, first0) {
    var att = S.team, def = otherTeam(att), placed = 0;
    var cand = squadOf(st, att).players.filter(function (q) { return !fixed[q.id]; })
      .sort(function (a, b) { return b.line - a.line || hash01(S.seed, S.index, a.line, a.slot) - hash01(S.seed, S.index, b.line, b.slot); });
    var men = [];
    if (first0) men.push(first0);
    cand.forEach(function (q) { if (q !== first0 && men.length < n) men.push(q); });
    var spots = SPOTS.map(function (s) { return boxPt(att, att === 'you' ? W - s[0] : s[0], s[1]); });
    men.forEach(function (q) {
      var at = fixed[q.id] ? pos[q.id] : null;
      if (!at) {
        for (var i = 0; i < spots.length; i++) {
          var s = spots[i], clash = false;
          for (var id in fixed) if (dist(pos[id], s) < 3.6) { clash = true; break; }
          if (!clash) { at = s; spots.splice(i, 1); break; }
        }
      }
      if (!at) return;
      put(pos, fixed, q, at);
      placed++;
      var mk = freeMen(st, def, fixed, pos, at)[0];
      if (mk) put(pos, fixed, mk, { x: at.x + (at.x < 34 ? 1.1 : -1.1), y: at.y + dirOf(att) * 1.7 });
    });
    return placed;
  }
  function keeperOnLine(st, team, S, pos, fixed, out) {
    var k = squadOf(st, team).keeper;               // `team` defends its own goal
    if (!k) return;
    var gy = team === 'you' ? 0 : L, s = team === 'you' ? 1 : -1;
    put(pos, fixed, k, { x: 34 + clamp((S.x - 34) * 0.1, -2.5, 2.5), y: gy + s * (out || 1.3) });
  }

  /* the frozen frame of a moment: the man on the ball at the ball, the man
   * the scene names next to him on the goal side, the cross's target in the
   * box, everyone else as the shape puts them, nobody touching. d1: then the
   * scene's own picture (a wall, a packed box, a flat back line, a clear run
   * to goal ...). `pos` is changed and returned; `opts.beaten` is a man the
   * result says was beaten, who ends behind the ball. */
  function freeze(st, S, pos, opts) {
    opts = opts || {};
    var fixed = {};
    var T = S.team, O = otherTeam(T), dir = dirOf(T);    // the way the man on the ball is attacking
    var sc = (S.scene && S.scene.id) || 'on_ball', R = (S.scene && S.scene.roles) || {};
    var hp = { x: S.x, y: S.y - dir * BALL_OFF };
    if (S.special === 'corner') hp = { x: S.x < 34 ? S.x - 0.2 : S.x + 0.2, y: S.y + 1.2 };
    /* a ball in the air is drawn raised, towards the top of the screen: the
     * man running onto it (or who headed it) stands off to one side of where
     * it drops, so the ball and his dot do not sit on each other */
    var airSide = airSideOf(S);
    if (S.air) hp = sc === 'over_top' ? { x: S.x + airSide * 2.6, y: S.y - dir * 3.3 } : { x: S.x + airSide * 1.2, y: S.y - dir * 3.2 };
    hp.x = clamp(hp.x, 0.6, W - 0.6); hp.y = clamp(hp.y, 0.6, L - 0.6);
    pos[S.holderId] = hp; fixed[S.holderId] = 1;
    var ball = { x: S.x, y: S.y };
    if (S.near) {
      var ny = S.y + dir * 3.3, nx = S.x + (34 - S.x) * 0.08 + (S.x < 34 ? 0.9 : -0.9);
      /* racing him for a ball in the air: level with him, a stride away */
      if (S.air) { ny = hp.y - dir * 2.6; nx = hp.x - airSide * 2.2; }
      if (S.special === 'corner') { ny = 6.5; nx = S.x < 34 ? 7 : W - 7; }
      /* d1: the gap in front of your defence is a gap: the nearest man is
       * level with him, a stride to the side, not in front of him */
      if (sc === 'tired_gap') { ny = hp.y + dir * 0.6; nx = hp.x + (hp.x < 34 ? 3.6 : -3.6); }
      /* nobody has gone with the full-back on the overlap: the nearest of
       * theirs is a few strides off, inside him */
      if (sc === 'overlap') { ny = S.y + dir * 5.5; nx = S.x + (S.x < 34 ? 5.5 : -5.5); }
      pos[S.near.id] = { x: clamp(nx, 0.9, W - 0.9), y: clamp(ny, 0.9, L - 0.9) };
      fixed[S.near.id] = 1;
    }
    if (S.crossTo) {
      var ty = S.team === 'them' ? 9 : L - 9;
      pos[S.crossTo.id] = { x: 34 + (S.x < 34 ? -2 : 2), y: ty };
      fixed[S.crossTo.id] = 1;
    }
    var cons = [];
    stage(st, S, sc, R, pos, fixed, hp, ball, T, O, dir, cons);
    /* a man the result says was beaten is behind the ball, whatever else the
     * scene wanted of him */
    if (opts.beaten && pos[opts.beaten.id]) {
      var bq = pos[opts.beaten.id];
      if (goalSide(bq, ball, T, -1) || dist(bq, hp) < 2.8) put(pos, fixed, opts.beaten, { x: hp.x + (bq.x < hp.x ? -2.4 : 2.4), y: hp.y - dir * 1.6 });
      else put(pos, fixed, opts.beaten, bq);
    }
    /* room round the man on the ball, so he and the ball read at a glance;
     * nobody touching; and the scene's rules for the men it moved, again
     * after each pushing apart */
    for (var it = 0; it < 6; it++) {
      Object.keys(pos).forEach(function (id) {
        if (fixed[id]) return;
        var q = pos[id], dx = q.x - hp.x, dy = q.y - hp.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= CLEAR) return;
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        pos[id] = { x: clamp(hp.x + dx / d * CLEAR, 0.9, W - 0.9), y: clamp(hp.y + dy / d * CLEAR, 0.9, L - 0.9) };
      });
      tidy(pos, fixed, FREEZE_GAP);
      if (!cons.length) break;
      cons.forEach(function (f) { f(pos); });
    }
    /* the scene's rules hold after the pushing apart too */
    after(st, S, sc, R, pos, fixed, hp, ball, T, O, dir);
    return pos;
  }

  /* each scene's picture, on top of the team shape */
  /* a man moved by a scene without pinning him: `rule` keeps him where the
   * scene needs him after every pushing apart */
  function soft(pos, cons, q, at, rule) {
    pos[q.id] = { x: clamp(at.x, 0.9, W - 0.9), y: clamp(at.y, 0.9, L - 0.9) };
    if (rule) cons.push(function (ps) { var r = rule(ps[q.id]); if (r) ps[q.id] = { x: clamp(r.x, 0.9, W - 0.9), y: clamp(r.y, 0.9, L - 0.9) }; });
  }
  function stage(st, S, sc, R, pos, fixed, hp, ball, T, O, dir, cons) {
    var k, men, i;
    switch (sc) {
      case 'freekick_you': case 'freekick_them': case 'freekick_wide': case 'freekick_cross': {
        var gd = dist(ball, goalOf(T)), wide = sc === 'freekick_wide' || sc === 'freekick_cross';
        wall(st, S, pos, fixed, wide ? 3 : gd < 24 ? 5 : 4, S.near);
        keeperOnLine(st, O, S, pos, fixed, 1.2);
        packBox(st, S, pos, fixed, wide ? 4 : 3, R.target || S.crossTo || null);
        break;
      }
      case 'corner': {
        keeperOnLine(st, O, S, pos, fixed, 1.0);
        packBox(st, S, pos, fixed, 5, R.target || S.crossTo || null);
        /* a defender on the near post, and one at the edge of the six-yard box */
        var np = boxPt(T, S.x < 34 ? 30.2 : 37.8, 1.6), sy = boxPt(T, S.x < 34 ? 27 : 41, 5.5);
        men = freeMen(st, O, fixed, pos, np);
        put(pos, fixed, men[0], np);
        men = freeMen(st, O, fixed, pos, sy);
        put(pos, fixed, men[0], sy);
        /* two of theirs on the edge of the box for the ball knocked out */
        men = freeMen(st, T, fixed, pos, boxPt(T, 34, 21));
        for (i = 0; i < Math.min(2, men.length); i++) put(pos, fixed, men[i], boxPt(T, 26 + i * 16, 21 + i));
        break;
      }
      case 'cross_high': case 'cross_low': {
        var tgt = R.target || S.crossTo;
        if (tgt && sc === 'cross_low') put(pos, fixed, tgt, boxPt(T, S.x < 34 ? 30 : 38, 12.5));
        keeperOnLine(st, O, S, pos, fixed, sc === 'cross_low' ? 1.6 : 2.4);
        packBox(st, S, pos, fixed, 3, tgt || null);
        /* one of the defending side goes out to the man about to cross it,
         * between him and the goal */
        if (!S.near) {
          men = freeMen(st, O, fixed, pos, hp, [0, 1]);
          if (men[0]) put(pos, fixed, men[0], { x: hp.x + (hp.x < 34 ? 3.2 : -3.2), y: hp.y - dir * 2.6 });
        }
        break;
      }
      case 'header': {
        keeperOnLine(st, O, S, pos, fixed, 1.4);
        packBox(st, S, pos, fixed, 3, null);
        break;
      }
      case 'alone': case 'keeper_out': case 'in_box': {
        keeperOnLine(st, O, S, pos, fixed, sc === 'keeper_out' ? 7.5 : 1.6);
        if (sc === 'keeper_out') {
          k = squadOf(st, O).keeper;
          /* off his line towards him: 5.5 m or more out, still between him and the goal */
          var kd = Math.max(5.5, Math.abs(hp.y - (T === 'you' ? L : 0)) * 0.6);
          if (k) put(pos, fixed, k, { x: lerp(34, hp.x, 0.55), y: T === 'you' ? L - kd : kd });
        }
        break;
      }
      case 'over_top': {
        /* the ball has gone over the back line: the defenders are turning,
         * level with him or behind him, never between him and the ball's
         * landing and the goal */
        squadOf(st, O).players.forEach(function (q) {
          if (fixed[q.id]) return;
          var p0 = pos[q.id];
          if (q.line !== 0 && (p0.y - hp.y) * dir <= -1.2) return;
          soft(pos, cons, q, { x: p0.x, y: hp.y - dir * (1.5 + hash01(S.seed, S.index, q.line, q.slot) * 4) },
            function (c) { return (c.y - hp.y) * dir > -1.2 ? { x: c.x, y: hp.y - dir * 1.2 } : null; });
        });
        keeperOnLine(st, O, S, pos, fixed, 4.5);
        break;
      }
      case 'caught_square': {
        /* the back line flat, all at one depth, a few metres goal-side of
         * the ball; the named man is the one in front of him */
        var ly = S.y + dir * 5.2, backs = squadOf(st, O).players.filter(function (q) { return q.line === 0; })
          .sort(function (a, b) { return pos[a.id].x - pos[b.id].x; });
        var ni = S.near ? backs.indexOf(S.near) : -1, gap = backs.length > 4 ? 9 : 10.4;
        var base = ni >= 0 ? hp.x + (hp.x < 34 ? 1.2 : -1.2) - ni * gap : 34 - (backs.length - 1) * gap / 2;
        base = clamp(base, 3, W - 3 - (backs.length - 1) * gap);
        backs.forEach(function (q, j) { put(pos, fixed, q, { x: base + j * gap, y: ly }); });
        keeperOnLine(st, O, S, pos, fixed, 3);
        break;
      }
      case 'keeper_pressed': {
        /* their forwards on your keeper and on each of your defenders: every
         * short pass is marked */
        var kp = hp, press = freeMen(st, O, fixed, pos, kp, [2, 1]);
        if (press[0] && !S.near) put(pos, fixed, press[0], { x: kp.x + (kp.x < 34 ? 3.5 : -3.5), y: kp.y + dir * 6.5 });
        var mine = squadOf(st, T).players.filter(function (q) { return !fixed[q.id] && (q.line === 0 || dist(pos[q.id], kp) < 27); });
        var placedK = [];
        mine.forEach(function (q) {
          var p0 = pos[q.id], d0 = dist(p0, kp) || 1;
          /* each of yours at least 9 m from him, and a man of theirs on him */
          var at = d0 < 9 ? { x: kp.x + (p0.x - kp.x) / d0 * 9, y: kp.y + Math.abs(p0.y - kp.y) / d0 * 9 * dir } : { x: p0.x, y: p0.y };
          at.y = T === 'you' ? Math.min(at.y, 26) : Math.max(at.y, L - 26);
          at.x = clamp(at.x, 2, W - 2);
          /* not on top of a team-mate already placed (each with his marker) */
          for (var tries = 0; tries < 8 && placedK.some(function (o) { return dist(o, at) < 4.5; }); tries++) {
            at = { x: clamp(at.x + (tries % 2 ? -1 : 1) * (5 + tries * 2), 2, W - 2), y: at.y };
          }
          placedK.push(at);
          put(pos, fixed, q, at);
          var mk = freeMen(st, O, fixed, pos, at)[0];
          var dk = dist(at, kp) || 1;
          var ux = (kp.x - at.x) / dk, uy = (kp.y - at.y) / dk;
          var spots = [{ x: at.x + ux * 1.9, y: at.y + uy * 1.9 }, { x: at.x - uy * 1.9, y: at.y + ux * 1.9 }, { x: at.x + uy * 1.9, y: at.y - ux * 1.9 }, { x: at.x - ux * 1.9, y: at.y - uy * 1.9 }];
          var spot = spots.filter(function (c) { return !Object.keys(fixed).some(function (id) { return id !== q.id && dist(pos[id], c) < 2.6; }); })[0] || spots[0];
          if (mk) put(pos, fixed, mk, spot);
          else put(pos, fixed, q, { x: at.x, y: T === 'you' ? 30 : L - 30 });
        });
        break;
      }
      case 'dribbler': {
        /* his back line flat behind the defender in front of him */
        var fr = R.front || S.near;
        if (fr && !fixed[fr.id]) put(pos, fixed, fr, { x: S.x + (34 - S.x) * 0.08, y: S.y + dir * 3.3 });
        var line = squadOf(st, O).players.filter(function (q) { return q.line === 0 && !fixed[q.id]; });
        var fy = pos[fr ? fr.id : S.holderId].y + dir * 4.5;
        line.forEach(function (q) {
          var dx = pos[q.id].x - S.x;
          soft(pos, cons, q, { x: S.x + (Math.abs(dx) < 7 ? (dx < 0 ? -7 : 7) : dx) + (hash01(S.seed, q.slot) - 0.5) * 3, y: fy },
            function (c) { return { x: Math.abs(c.x - S.x) < 6 ? S.x + (c.x < S.x ? -6 : 6) : c.x, y: fy }; });
        });
        if (R.mate) put(pos, fixed, R.mate, { x: hp.x + (hp.x < 34 ? 7 : -7), y: hp.y + dir * 1.5 });
        break;
      }
      case 'playmaker': {
        /* the runner is at your back line, between two of your defenders */
        var cbs = squadOf(st, O).players.filter(function (q) { return q.line === 0; })
          .sort(function (a, b) { return pos[a.id].x - pos[b.id].x; });
        if (R.runner && cbs.length >= 2) {
          var mid = Math.floor(cbs.length / 2), a = cbs[mid - 1], b = cbs[mid];
          var by = (pos[a.id].y + pos[b.id].y) / 2;
          var ax = Math.min(pos[a.id].x, pos[b.id].x - 8), bx = Math.max(pos[b.id].x, ax + 8);
          put(pos, fixed, a, { x: ax, y: by }); put(pos, fixed, b, { x: bx, y: by });
          put(pos, fixed, R.runner, { x: (ax + bx) / 2, y: by - dir * 0.8 });
        }
        break;
      }
      case 'winger': {
        /* the named man is in front of him; nobody else of yours is */
        var fm = R.front || S.near;
        if (fm) put(pos, fixed, fm, { x: S.x + (34 - S.x) * 0.1, y: S.y + dir * 3.6 });
        squadOf(st, O).players.forEach(function (q) {
          if (fixed[q.id]) return;
          var p0 = pos[q.id];
          var away = function (c) {
            return goalSide(c, hp, T, -1) && Math.abs(c.x - hp.x) < 13 && Math.abs(c.y - hp.y) < 28
              ? { x: hp.x < 34 ? hp.x + 13.5 + hash01(S.seed, q.slot) * 3 : hp.x - 13.5 - hash01(S.seed, q.slot) * 3, y: c.y } : null;
          };
          soft(pos, cons, q, away(p0) || p0, away);
        });
        break;
      }
      case 'tired_gap': {
        /* your midfield has not got back: behind the ball; your defence deep */
        squadOf(st, O).players.forEach(function (q) {
          if (fixed[q.id]) return;
          var rule = q.line >= 1
            ? function (c) { var lim = hp.y + dir * -1 * 0 + (T === 'them' ? 1 : -1) * (4 + (q.line - 1) * 6); return (T === 'them' ? c.y < lim : c.y > lim) ? { x: c.x, y: lim } : null; }
            : function (c) { var lim = T === 'them' ? hp.y - 16 : hp.y + 16; return (T === 'them' ? c.y > lim : c.y < lim) ? { x: c.x, y: lim } : null; };
          var p0 = pos[q.id];
          soft(pos, cons, q, rule(p0) || p0, rule);
        });
        break;
      }
      case 'third_man': {
        /* one of yours is past their defence */
        var theirs = squadOf(st, O).players.filter(function (q) { return q.line === 0; });
        if (R.runner && theirs.length) {
          var last = theirs.reduce(function (m, q) { return (pos[q.id].y - pos[m.id].y) * dir > 0 ? q : m; }, theirs[0]);
          var ry = pos[last.id].y + dir * 2.5, rx = clamp(pos[R.runner.id].x, 20, 48);
          put(pos, fixed, R.runner, { x: rx, y: ry });
        }
        break;
      }
      case 'overlap': {
        var wing = hp.x < 34 ? -1 : 1;
        if (R.runner) put(pos, fixed, R.runner, { x: clamp(hp.x + wing * 5, 2, W - 2), y: hp.y + dir * 6 });
        if (R.fullback && !R.runner) {
          /* he has run past your own winger: the winger is inside him and behind */
          var wg = squadOf(st, T).players.filter(function (q) { return q.line >= 1 && laneOf(q, T) === laneOfX(hp.x) && !fixed[q.id]; })[0];
          if (wg) put(pos, fixed, wg, { x: hp.x - wing * 6, y: hp.y - dir * 5 });
        }
        /* nobody of theirs close to the runner */
        if (R.runner) squadOf(st, O).players.forEach(function (q) {
          if (fixed[q.id]) return;
          var rp = pos[R.runner.id];
          var off = function (c) { var d = dist(c, rp); return d < 7 ? { x: rp.x - wing * 7.5, y: c.y } : null; };
          soft(pos, cons, q, off(pos[q.id]) || pos[q.id], off);
        });
        break;
      }
      case 'break_from_corner': {
        /* their team was up for the corner: two defenders goal-side, the rest behind the ball */
        var two = squadOf(st, O).players.filter(function (q) { return q.line === 0 && !fixed[q.id]; })
          .sort(function (a, b) { return Math.abs(pos[a.id].x - 34) - Math.abs(pos[b.id].x - 34); }).slice(0, S.near ? 1 : 2);
        two.forEach(function (q, j) { put(pos, fixed, q, { x: hp.x < 34 ? 40 - j * 12 : 28 + j * 12, y: hp.y + dir * (14 + j * 2) }); });
        squadOf(st, O).players.forEach(function (q) {
          if (fixed[q.id]) return;
          var p0 = pos[q.id], lim = hp.y - dir * (3 + hash01(S.seed, q.line, q.slot) * 12);
          var behind = function (c) { return (c.y - (hp.y - dir * 2)) * dir > 0 ? { x: c.x, y: hp.y - dir * 2 } : null; };
          soft(pos, cons, q, { x: p0.x, y: T === 'you' ? Math.min(p0.y, lim) : Math.max(p0.y, lim) }, behind);
        });
        if (R.runner) put(pos, fixed, R.runner, { x: hp.x + (hp.x < 34 ? 10 : -10), y: hp.y + dir * 3 });
        break;
      }
      case 'won_high': case 'second_ball': case 'counter': case 'their_on_ball': case 'on_ball': case 'in_their_box':
      case 'your_new_attack': case 'keeper_ball': default:
        break;
    }
  }
  /* after the pushing apart: the rules a scene cannot give up */
  function after(st, S, sc, R, pos, fixed, hp, ball, T, O, dir) {
    if (S.air) {
      /* the ball drops to him: nobody else nearer where it lands */
      var dh = dist(hp, ball) + 0.9, moved = {};
      for (var it = 0; it < 5; it++) {
        Object.keys(pos).forEach(function (id) {
          if (id === S.holderId) return;
          var p0 = pos[id], d = dist(p0, ball);
          if (d < dh) {
            var ux = (p0.x - ball.x) / (d || 1), uy = (p0.y - ball.y) / (d || 1);
            if (!d) { ux = -airSideOf(S); uy = 0; }
            pos[id] = { x: clamp(ball.x + ux * dh, 0.9, W - 0.9), y: clamp(ball.y + uy * dh, 0.9, L - 0.9) };
            moved[id] = 1;
          }
        });
        var fx = {};
        Object.keys(pos).forEach(function (id) { if (!moved[id]) fx[id] = 1; });
        tidy(pos, fx, FREEZE_GAP);
      }
    }
    if (/^freekick/.test(sc)) {
      /* nobody of the side defending it nearer the ball than 9.15 m */
      squadOf(st, O).players.forEach(function (q) {
        var p0 = pos[q.id], d = dist(p0, ball);
        if (d < WALL_D - 0.6) pos[q.id] = { x: clamp(ball.x + (p0.x - ball.x) / (d || 1) * (WALL_D + 0.4), 0.9, W - 0.9), y: clamp(ball.y + (p0.y - ball.y) / (d || 1) * (WALL_D + 0.4), 0.9, L - 0.9) };
      });
    }
    if (sc === 'alone') {
      if (!GUARD.chase) {
        /* m4's staging (pitchcheck --break chase): the goal-side men put
         * 2.5 to 6.3 m behind him and 3.8 m or more to each side, which drew
         * four or five of them packed round him */
        squadOf(st, O).players.forEach(function (q, j) {
          var p0 = pos[q.id];
          if (goalSide(p0, hp, T, -1.5)) {
            var side = p0.x < hp.x ? -1 : 1;
            pos[q.id] = { x: clamp(hp.x + side * (3.8 + j * 0.9), 0.9, W - 0.9), y: clamp(hp.y - dir * (2.5 + (j % 3) * 1.9), 0.9, L - 0.9) };
          }
        });
        tidyKeep(pos, st, S, O, hp, T);
        return;
      }
      chase(st, S, pos, hp, T, O, dir);
    }
  }
  /* m5: "X is through on his own": the defenders he has got past are
   * CHASING him, a trail behind him (the nearest 5 m back, each next one
   * about 3.4 m further back and a little wider, sides alternating), never
   * level with him or round him. Anyone of the defending side ahead of or
   * level with him (up to 3 m behind) within 24 m, or within 8 m of him,
   * joins the trail, nearest first; one man always chases. */
  var CHASE = { level: 3, near: 8, reach: 24, first: 5, step: 3.4, dx: 2.2 };   // first: past the carrier's lifted piece on the Tabletop board
  function chaseSlot(hp, k, side, jit, dir) {
    return { x: clamp(hp.x + side * (CHASE.dx + 1.7 * k + jit), 0.9, W - 0.9), y: clamp(hp.y - dir * (CHASE.first + CHASE.step * k + jit * 0.6), 0.9, L - 0.9) };
  }
  function chase(st, S, pos, hp, T, O, dir) {
    var men = squadOf(st, O).players.filter(function (q) { return pos[q.id]; });
    function wrong(p0) { var d = dist(p0, hp); return (goalSide(p0, hp, T, -CHASE.level) && d < CHASE.reach) || d < CHASE.near; }
    var move = men.filter(function (q) { return wrong(pos[q.id]); }).sort(function (a, b) { return dist(pos[a.id], hp) - dist(pos[b.id], hp); });
    /* one man always chases: with nobody to move, the nearest behind him within 20 m, else the nearest */
    var trailing = men.filter(function (q) { var p0 = pos[q.id], by = (hp.y - p0.y) * dir; return by >= CHASE.level && dist(p0, hp) < 20; });
    if (!move.length && !trailing.length && men.length) move = [men.slice().sort(function (a, b) { return dist(pos[a.id], hp) - dist(pos[b.id], hp); })[0]];
    /* the men already chasing keep their places; the trail starts after the nearest of them */
    var k0 = 0;
    var slots = {};
    var sideNext = hp.x < 34 ? 1 : -1;   // the first chaser on the side with more pitch
    move.forEach(function (q, j) {
      var p0 = pos[q.id], side = Math.abs(p0.x - hp.x) > 3 ? (p0.x < hp.x ? -1 : 1) : sideNext;
      sideNext = -side;
      var jit = hash01(S.seed, S.index, 'chase', q.line, q.slot) * 0.8;
      slots[q.id] = chaseSlot(hp, k0 + j, side, jit, dir);
      pos[q.id] = slots[q.id];
    });
    tidyKeep(pos, st, S, O, hp, T);
    /* the pushing apart must not bring anyone back level or round him */
    men.forEach(function (q) { if (slots[q.id] && wrong(pos[q.id])) pos[q.id] = slots[q.id]; });
  }
  var GUARD = { chase: true };   // m5: pitchcheck --break chase turns it off
  /* the side of a dropping ball the man running onto it stands: the side his
   * name is written on (the page writes it to the right when x < 50), so
   * neither the name nor his dot covers the ball */
  function airSideOf(S) { return S.x < 50 ? 1 : -1; }
  /* push apart again without letting anyone of `O` back goal-side */
  function tidyKeep(pos, st, S, O, hp, T) {
    var fx = {};
    Object.keys(pos).forEach(function (id) { fx[id] = 1; });
    squadOf(st, O).players.forEach(function (q) { delete fx[q.id]; });
    tidy(pos, fx, FREEZE_GAP);
    squadOf(st, O).players.forEach(function (q) {
      var p0 = pos[q.id];
      if (goalSide(p0, hp, T, -1.5)) pos[q.id] = { x: p0.x, y: clamp(hp.y - dirOf(T) * 2, 0.9, L - 0.9) };
    });
  }

  /* d1: THE LINE OVER THE PITCH, from the picture: where the ball is drawn,
   * and whose it is. "Box" only when the ball is inside the drawn box; the
   * team named is the team of the man on the ball. `ball` and `holderId` are
   * the frozen picture's. */
  var ZONE_WORD = ['Your box', 'Your half', 'Midfield', 'Edge of their box', 'Their box'];
  /* m6: how far from the goal line "the edge of the box" may be said (m) */
  var EDGE_M = 25;
  /* m6: the same honesty for the words: a sentence that puts the ball "at the
   * edge of your box" while the picture has it more than EDGE_M from your goal
   * line says "outside your box" instead ("to the edge of" becomes "into the
   * space outside"). `ball` is the frozen picture's ball (pitch metres). Only
   * the half of the pitch the ball is in is rewritten. */
  function bandWords(text, ball) {
    if (!text || !ball || GUARD.band === false) return text;
    var t = String(text);
    function side(which, far) {
      if (!far) return;
      var re1 = new RegExp('\\bat the edge of ' + which + ' box', 'g'), re2 = new RegExp('\\bto the edge of ' + which + ' box', 'g');
      var re3 = new RegExp('\\bthe edge of ' + which + ' box', 'g');
      t = t.replace(re1, 'outside ' + which + ' box').replace(re2, 'into the space outside ' + which + ' box').replace(re3, 'the space outside ' + which + ' box');
    }
    side('your', ball.y < L / 2 && ball.y > EDGE_M);
    side('their', ball.y > L / 2 && L - ball.y > EDGE_M);
    return t;
  }
  function zoneLabel(st, p, S, ball, holderId) {
    var b = ball || { x: S.x, y: S.y };
    var theirs = S.attacking === 'them';
    var z = typeof p.zoneIndex === 'number' ? p.zoneIndex : (theirs ? 0 : 2);
    var lab = ZONE_WORD[z + 1];
    if (theirs && z === 0) lab = 'Edge of your box';
    var inYour = b.x >= BOX_X[0] && b.x <= BOX_X[1] && b.y <= BOX_D, inTheir = b.x >= BOX_X[0] && b.x <= BOX_X[1] && b.y >= L - BOX_D;
    if (inYour) lab = 'Your box';
    else if (inTheir) lab = 'Their box';
    else if (S.special === 'corner') lab = b.y < 52.5 ? 'Corner flag, by your goal' : 'Corner flag, by their goal';
    else if (/box/.test(lab) && !/Edge/.test(lab)) {
      var deep = b.y < 52.5 ? b.y <= BOX_D : b.y >= L - BOX_D;
      lab = deep ? (b.y < 52.5 ? 'Wide of your box' : 'Wide of their box') : (b.y < 52.5 ? 'Edge of your box' : 'Edge of their box');
    }
    /* m6 (review round 3): the zone next to your box runs 16.5 to 40 m, so
     * "edge of your box" said of a man 29 to 35 m out was not true; beyond
     * EDGE_M from the goal line the band is named "Outside your box" (and the
     * same at their end, 16.5 to 35 m) */
    if (GUARD.band !== false) {
      if (lab === 'Edge of your box' && b.y > EDGE_M) lab = 'Outside your box';
      else if (lab === 'Edge of their box' && L - b.y > EDGE_M) lab = 'Outside their box';
    }
    var h = holderId ? byId(st, holderId) : S.holder, ht = teamOf(st, h);
    var poss = ht === 'you' ? 'your ball' : ht === 'them' ? 'their ball' : '';
    if (S.air && theirs) poss = 'their attack, the ball in the air';
    if (ht === 'you' && theirs && isKeeper(h, st.squad)) poss = 'your keeper\'s ball, their players pressing';
    return { label: lab, poss: poss, inBox: inYour || inTheir };
  }

  var API = {
    W: W, L: L, CENTRE: CENTRE, BAND: BAND, YOU_BANDS: YOU_BANDS, LANES: LANES, SLOT_X: SLOT_X, LINE_U: LINE_U,
    R: R, MIN_GAP: MIN_GAP, FREEZE_GAP: FREEZE_GAP, BALL_OFF: BALL_OFF,
    clamp: clamp, lerp: lerp, dist: dist, hash01: hash01,
    roster: roster, teamOf: teamOf, onPitch: onPitch, byId: byId, isKeeper: isKeeper,
    laneOf: laneOf, laneOfX: laneOfX, bandFor: bandFor,
    homeOf: homeOf, shape: shape, shapeAll: shapeAll, kickoffShape: kickoffShape, tidy: tidy,
    holderOf: holderOf, nearOf: nearOf, startOf: startOf, freeze: freeze,
    /* d1 */
    sceneOf: sceneOf, byFirst: byFirst, first: first, zoneLabel: zoneLabel, goalSide: goalSide, goalOf: goalOf,
    inBox: inBox, dirOf: dirOf, otherTeam: otherTeam, BOX_X: BOX_X, BOX_D: BOX_D, WALL_D: WALL_D, CLEAR: CLEAR,
    GUARD: GUARD, CHASE: CHASE,   // m5
    EDGE_M: EDGE_M, bandWords: bandWords   // m6
  };
  root.KMPitch = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
