/* d1: THE DIRECTOR (the pitch run's contract, GOALS.md).
 *
 * The engine decides the moments; this file stages the football around them.
 * For the play BEFORE a moment it writes about five seconds of events that
 * BUILD THE SCENE the moment's text describes (SCENES.md): a foul and a
 * wall before a free kick, a ball played wide and carried to the byline
 * before a cross, a long ball over the back line before "the ball is in the
 * air", a won ball before a new attack. It ends with the ball exactly where
 * the moment starts, at the feet of the man the moment's text names. For a
 * decision's result it writes the events the result's text says, literally:
 * a man gone past is left behind the ball, a ball kicked out goes over the
 * line the text says, a keeper who catches it has it; and when the play
 * stops (a throw-in, a goal kick, a free kick, the keeper's ball) the next
 * play starts with that restart.
 *
 *   event: { t, kind, team, from, to, ball: {x, y}, note }
 *   kind:  pass | carry | dribble | tackle | interception | clearance | shot |
 *          save | out | foul | kickoff
 *   team:  who did it; for `out`, the team the restart goes to; for `foul`,
 *          the team that fouled (from = the fouler, to = the man fouled)
 *   note:  what kind of pass or stoppage ('throw-in', 'goal kick',
 *          'corner', 'corner kick', 'free kick', 'cross', 'long ball',
 *          'over the top', 'switch of play', 'one-two', 'back pass',
 *          'through ball', 'cut-back', 'header', 'keeper throw', 'blocked',
 *          'wide', 'over the bar', 'goal', 'catch', 'parried', 'offside',
 *          'out for a corner', 'past' ...)
 *
 * It is SHOW ONLY. It reads the match and never changes it, and it never
 * touches the match RNG: its own generator is seeded from the match's seed
 * plus the moment's index (and decision step), so the same match stages the
 * same football every time. pitchcheck.js proves both.
 *
 * A segment also carries KEY FRAMES: the ball, who has it, and all 22
 * positions at the start and end of every event. frameAt(seg, t) blends
 * them, so the page, the checks and anything later (stats, replays) read
 * one picture of the play. */
(function (root) {
  'use strict';
  var P = root.KMPitch || require('./pitch.js');
  var TARGET = 5.0;        // seconds of play between moments, at 1x
  /* m3 (DECISIONS item 16): a plan the director could only get longer than
   * LONG_PLAN seconds (the cleared corner into a break) is no longer squeezed
   * into 5 s: it runs at its own length, up to MAX_PLAY. Every other play is
   * still exactly 5 s. */
  var LONG_PLAN = 6.0, MAX_PLAY = 7.0;
  /* a2 (helper M): THE BREAK SWITCHES of the movement checks (mvcheck2.js --break <what>, node only):
   * gap (a1's drawing: no legs, the end picture run in after the play), fast (no top speed), jerk (no
   * acceleration limit), rest (every picture starts from rest) */
  var BRK = {};
  try { var brk0 = typeof process !== 'undefined' && process.env && process.env.KM_MVBREAK; if (brk0) BRK[brk0] = true; } catch (e) { }
  var A2 = !BRK.gap;
  /* kmtree5 a3 (helper C): the six cards' pictures (positions and timing only). KM_C_ACTION=a2 or ?caction=a2: a2's. */
  var C3 = !(typeof process !== 'undefined' && process.env && process.env.KM_C_ACTION === 'a2');
  try { if (/[?&]caction=a2\b/.test((root.location && root.location.search) || '')) C3 = false; } catch (e) { }
  var C3BRK = (typeof process !== 'undefined' && process.env && process.env.KM_C_BREAK) || '';
  /* a2: a play is never squeezed (m3 fitted every plan up to 6 s into 5, so everyone ran up to 1.2 times faster
   * than planned: a carry at 12.6 m/s): a short plan is still stretched to 5 s, a longer one runs at its own
   * length (the planner aims shorter, MV.legBudget, so it lands near 5 s) */
  function playLength(natural) {
    if (A2) return natural < TARGET ? TARGET : natural;
    return natural > LONG_PLAN ? Math.min(natural, MAX_PLAY) : TARGET;
  }
  /* d1: switches for pitchcheck.js, which shows each check fails without
   * the behaviour it guards (--break) */
  var GUARD = { press: true, run: true, opening: true, variety: true, pingpong: true, scorer: true, taker: true };   /* m4: taker */
  var PASSY = { pass: 1, interception: 1, clearance: 1, shot: 1, out: 1, kickoff: 1, save: 1 };
  /* passes that travel in the air */
  var AIRY = { cross: 1, 'in the air': 1, 'long ball': 1, 'over the top': 1, 'goal kick': 1, 'corner kick': 1, 'switch of play': 1, 'header': 1, 'out for a corner': 1, 'over the bar': 1, 'keeper throw': 0 };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* the match's own seed plus the moment, never the match RNG */
  function seedOf(st, index, step, salt) {
    return (Math.imul(((st.seed | 0) ^ 0x2c1b3c6d) >>> 0, 2654435761) + (index | 0) * 7919 + (step | 0) * 104729 + (salt | 0) * 1013) >>> 0;
  }
  function passDur(d) { return 0.3 + d / 32; }
  /* a2: how long a man starting from a standstill takes to run d metres (MV.legA, MV.legRecv) */
  function legTime(d) { var a = MV.legA, v = MV.legRecv, dd = v * v / (2 * a); return d <= dd ? Math.sqrt(2 * d / a) : v / a + (d - dd) / v; }
  function legReach(T) { var a = MV.legA, v = MV.legV, ta = v / a; return T <= ta ? a * T * T / 2 : v * v / (2 * a) + v * (T - ta); }
  /* a2: the same, for a man already running (velocity v): he may first have to turn round (a small simulation of his
   * legs, 1/40 s steps, straight for the spot) */
  function legTimeFrom(a, b, v) {
    var x = a.x, y = a.y, vx = v.x || 0, vy = v.y || 0, h = 0.025, A = MV.legA, V = MV.legRecv;
    for (var t = 0; t < 8; t += h) {
      var dx = b.x - x, dy = b.y - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.8) return t;
      var wx = dx / d * V - vx, wy = dy / d * V - vy, w = Math.sqrt(wx * wx + wy * wy), lim = A * h;
      if (w > lim) { wx *= lim / w; wy *= lim / w; }
      vx += wx; vy += wy; x += vx * h; y += vy * h;
    }
    return 8;
  }
  function carryDur(d) { return Math.max(0.5, d / (A2 ? 7.5 : 10.5)); }   /* a2: a man runs with the ball at 7.5 m/s on average (a1: 10.5, up to 16 at the peak of an eased beat) */
  function copyPos(pos) { var o = {}; for (var k in pos) o[k] = { x: pos[k].x, y: pos[k].y }; return o; }
  function dirOf(team) { return team === 'you' ? 1 : -1; }
  function other(team) { return team === 'you' ? 'them' : 'you'; }
  function clampPt(pt) { return { x: P.clamp(pt.x, 2, P.W - 2), y: P.clamp(pt.y, 2, P.L - 2) }; }
  function pt(x, y) { return { x: x, y: y }; }
  /* the far end a team attacks, and its own goal line */
  function attackPt(team) { return { x: 34, y: team === 'you' ? 100 : 5 }; }
  function ownY(team, d) { return team === 'you' ? d : P.L - d; }
  /* metres up the pitch for a team: `d` metres from its own goal line */
  function upY(team, d) { return team === 'you' ? d : P.L - d; }
  function isKeeperP(st, p) { return P.isKeeper(p, st.squad) || P.isKeeper(p, st.opp); }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }

  /* ------------------------------------------------------------ positions */
  function outfield(st, team) { return (team === 'you' ? st.squad : st.opp).players; }
  function keeperOf(st, team) { return (team === 'you' ? st.squad : st.opp).keeper; }
  /* the man of `team` nearest a point, in the shape the point puts them in */
  function nearestTo(st, team, at, poss, skip) {
    var sh = P.shapeAll(st, at, poss), best = null, bd = 1e9;
    outfield(st, team).forEach(function (p) {
      if (skip && skip[p.id]) return;
      var d = P.dist(sh[p.id], at);
      if (d < bd) { bd = d; best = p; }
    });
    return best ? { p: best, pt: sh[best.id], d: bd } : null;
  }
  /* the man of `team` nearest a point among some lines */
  function pickNear(st, team, at, lines, skip) {
    var sh = P.shapeAll(st, at, team), best = null, bd = 1e9;
    outfield(st, team).forEach(function (p) {
      if ((skip && skip[p.id]) || (lines && lines.indexOf(p.line) < 0)) return;
      var d = P.dist(sh[p.id], at);
      if (d < bd) { bd = d; best = p; }
    });
    if (!best && lines) return pickNear(st, team, at, null, skip);
    return best;
  }
  function skipOf() { var s = {}; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; if (a) s[a.id || a] = 1; } return s; }

  /* KEY-FRAME POSITIONS: the teams move like teams. Both shapes slide with
   * the ball; the man on the ball is at it; the nearest of the other side
   * presses him from the goal side and the next nearest covers behind that;
   * in the other half one forward of the side on the ball runs on the last
   * defender's shoulder; now and then a full-back runs up the outside of
   * the man on the ball. `extra` pins men where a beat needs them. */
  var STAGED = {};   /* mv1: the men the last keyPos call placed on purpose (the presser, the cover, the runner, the overlap) */
  function keyPos(st, ball, holderId, poss, extra, salt, still) {
    var pos = P.shapeAll(st, ball, poss), fixed = {};
    STAGED = {};
    var hp = holderId ? P.byId(st, holderId) : null;
    var ht = hp ? P.teamOf(st, hp) : poss;
    var hq = null;
    if (holderId && pos[holderId]) {
      hq = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dirOf(ht) * P.BALL_OFF, 0.6, P.L - 0.6) };
      pos[holderId] = hq;
      fixed[holderId] = 1;
    }
    if (extra) for (var k in extra) { pos[k] = extra[k]; fixed[k] = 1; }
    if (ht && hq && !isKeeperP(st, hp) && !still && GUARD.press) {
      var def = other(ht), dir = dirOf(ht);
      var ds = outfield(st, def).filter(function (p) { return !fixed[p.id]; })
        .sort(function (a, b) { return P.dist(pos[a.id], ball) - P.dist(pos[b.id], ball); });
      /* the presser: on the goal side of the ball, close */
      if (ds[0] && P.dist(pos[ds[0].id], ball) < 26) {
        STAGED[ds[0].id] = 1;
        pos[ds[0].id] = { x: P.clamp(ball.x + (34 - ball.x) * 0.06 + (P.hash01(salt, ds[0].line, ds[0].slot) - 0.5) * 2, 0.9, P.W - 0.9), y: P.clamp(ball.y + dir * 3.0, 0.9, P.L - 0.9) };
        fixed[ds[0].id] = 1;
      }
      /* the cover: further back, towards the middle */
      if (ds[1] && P.dist(pos[ds[1].id], ball) < 30) {
        var cq = pos[ds[1].id];
        STAGED[ds[1].id] = 1;
        pos[ds[1].id] = { x: P.lerp(cq.x, ball.x + (34 - ball.x) * 0.35, 0.55), y: P.lerp(cq.y, ball.y + dir * 9, 0.6) };
      }
      var bu = ht === 'you' ? ball.y : P.L - ball.y;
      /* a forward run on the last defender's shoulder */
      if (bu > 42 && GUARD.run) {
        var backs = outfield(st, def).filter(function (p) { return p.line === 0; });
        if (backs.length) {
          var lastY = backs.reduce(function (m, p) { return dir > 0 ? Math.max(m, pos[p.id].y) : Math.min(m, pos[p.id].y); }, dir > 0 ? -1 : 999);
          var fws = outfield(st, ht).filter(function (p) { return p.line === 2 && !fixed[p.id]; });
          if (fws.length) {
            var rn = fws[Math.floor(P.hash01(salt, 'run') * fws.length)], rq = pos[rn.id];
            STAGED[rn.id] = 1;
            pos[rn.id] = { x: P.lerp(rq.x, 34, 0.15), y: P.clamp(lastY - dir * 0.8, 3, P.L - 3) };
          }
        }
      }
      /* the overlap: the full-back on the ball's side runs past it, outside */
      var lane = P.laneOfX(ball.x);
      if (lane !== 1 && bu > 38 && bu < 88 && P.hash01(salt, 'ovl') < 0.45) {
        var fb = outfield(st, ht).filter(function (p) { return p.line === 0 && P.laneOf(p, ht) === lane && !fixed[p.id]; })[0];
        if (fb) { pos[fb.id] = { x: P.clamp(ball.x + (lane === 0 ? -4 : 4), 2, P.W - 2), y: ball.y + dir * 4 }; STAGED[fb.id] = 1; }
      }
    }
    return P.tidy(pos, fixed);
  }

  /* mv1: THE REACH LIMIT. A man away from the ball ends a key frame no
   * further from where he was at the start of the segment than he can run
   * in `secs` from a standing start (MV.reach, 4.5 m/s on average at most,
   * and no more than speeding up at 6 m/s/s and slowing down again allows,
   * plus a metre); men in
   * `keep` and anyone within 7 m of the ball are left where the director
   * put them. s0 moved the whole team to the ball's new shape in a 1.4 s
   * result (8 m/s median, 37 m/s at the top). Returns a new map. */
  function reachLimit(st, pos, from, secs, keep, ball, fast) {
    if (!from) return pos;
    var out = {}, frac = {}, group = {};
    for (var id in pos) {
      var q = pos[id], a = from[id];
      out[id] = q;
      if (!a || (keep && keep[id]) || (ball && P.dist(q, ball) < 7)) continue;
      var man = P.byId(st, id);
      /* in the next moment's picture the forwards of the side on the ball are
       * where the moment needs them (in the box for a cross): they make the run */
      if (fast && fast !== true && man && man.line === 2 && P.teamOf(st, man) === fast && !(P.MOVE && P.MOVE.m8 && (q.y - a.y) * dirOf(fast) < 0)) continue;   /* (m8: not when the run is back toward his own goal) */
      var kp = isKeeperP(st, man), max = (fast ? MV.reachPic * secs + 2 : Math.min((kp ? MV.reachK : MV.reach) * secs, MV.reachA * secs * secs / 4) + 1), d = P.dist(q, a);
      frac[id] = d > max ? max / d : 1;
      /* a back line and a midfield line move as a line: every man of it
       * goes the same share of the way (the share of the man with furthest to go) */
      if (man && !kp && !MV.noLine && (man.line === 0 || man.line === 1)) { var gk = P.teamOf(st, man) + man.line; (group[gk] = group[gk] || []).push(id); }
    }
    for (var g in group) {
      var fmin = 1; group[g].forEach(function (k) { fmin = Math.min(fmin, frac[k]); });
      group[g].forEach(function (k) { frac[k] = fmin; });
    }
    for (var id2 in frac) {
      if (frac[id2] >= 1) continue;
      var q2 = pos[id2], a2 = from[id2];
      out[id2] = { x: a2.x + (q2.x - a2.x) * frac[id2], y: a2.y + (q2.y - a2.y) * frac[id2] };
    }
    /* and a back line stands at one depth: each of its men steps up to 3 m
     * toward the line's middle depth (full-backs a stride higher, as the shape has them) */
    for (var g2 in group) {
      if (MV.noLine || g2.slice(-1) !== '0' || group[g2].length < 3) continue;
      var tm = g2.slice(0, -1), dir = tm === 'you' ? 1 : -1, my = 0, L2 = group[g2];
      L2.forEach(function (k) { my += out[k].y; }); my /= L2.length;
      L2.forEach(function (k) {
        var dy = my - out[k].y;
        out[k] = { x: out[k].x, y: out[k].y + Math.max(-3, Math.min(3, dy)) };
      });
    }
    return out;
  }

  /* ------------------------------------------------------------ the plan */
  /* A plan is a list of beats; each ends somewhere: { kind, team, from, to,
   * ball (where the ball is when it ends), dur, holder (after), poss (after),
   * note, pin (men whose position this beat pins) }. */
  function Planner(st, R, start) {
    this.st = st; this.R = R;
    this.cur = { ball: { x: start.ball.x, y: start.ball.y }, holder: start.holder, team: start.team };
    this.beats = [];
    this.backs = 0;
  }
  Planner.prototype.time = function () { return this.beats.reduce(function (a, b) { return a + b.dur; }, 0); };
  Planner.prototype.push = function (b) {
    if (A2 && b.kind === 'out') b.dur = Math.max(b.dur, MV.legDead);   /* a2: the ball goes out, and the men pull up and walk to the restart before the picture cuts to it */
    this.beats.push(b);
    this.cur = { ball: { x: b.ball.x, y: b.ball.y, z: b.ball.z || 0 }, holder: b.holder, team: b.poss };
    return b;
  };
  Planner.prototype.last = function () { return this.beats[this.beats.length - 1] || null; };
  Planner.prototype.pass = function (toP, at, kind, note, o) {
    o = o || {};
    var c = this.cur, d = P.dist(c.ball, at), tm = P.teamOf(this.st, toP);
    var b = { kind: kind || 'pass', team: o.team || c.team, from: c.holder, to: toP.id, ball: o.noClamp ? { x: at.x, y: at.y } : clampPt(at),
      dur: o.dur || passDur(d) * (o.slow || 1), holder: o.holder !== undefined ? o.holder : toP.id, poss: o.poss || tm,
      note: note || (d > 30 ? 'long ball' : null) };
    if (o.pin) b.pin = o.pin;
    return this.push(b);
  };
  Planner.prototype.carry = function (at, kind, note, past) {
    var c = this.cur, d = P.dist(c.ball, at);
    var b = { kind: kind || 'carry', team: c.team, from: c.holder, to: c.holder, ball: clampPt(at), dur: carryDur(d), holder: c.holder, poss: c.team, note: note || null };
    if (past) { b.past = past.id; b.pin = {}; }
    return this.push(b);
  };
  /* the ball is won by `winner`: a tackle where it is, or a pass cut out */
  Planner.prototype.win = function (winner, kind, at, note) {
    var c = this.cur, R = this.R, tm = P.teamOf(this.st, winner);
    if (kind === 'interception') {
      var ahead = at || clampPt({ x: c.ball.x + (R() - 0.5) * 10, y: c.ball.y + dirOf(c.team) * (7 + R() * 6) });
      return this.push({ kind: 'interception', team: tm, from: c.holder, to: winner.id, ball: clampPt(ahead), dur: passDur(P.dist(c.ball, ahead)) * 0.85,
        holder: winner.id, poss: tm, note: note || null });
    }
    var spot = at || clampPt({ x: c.ball.x + (R() - 0.5) * 2, y: c.ball.y - dirOf(c.team) * 1.2 });
    return this.push({ kind: 'tackle', team: tm, from: c.holder, to: winner.id, ball: clampPt(spot), dur: 0.5, holder: winner.id, poss: tm, note: note || null });
  };

  /* ------------------------------------------------------------ choosing a man */
  /* a team-mate to pass to, towards `toward`: each team-mate a few metres on
   * from his place in the shape, scored for how far forward it takes the
   * ball, how long the pass is, how free he is; one of the best three,
   * weighted, so the same situation does not always pick the same man.
   * Never straight back to the man who just passed it (no ping-pong). */
  function pickMate(pl, toward, o) {
    o = o || {};
    var c = pl.cur, R = pl.R, st = pl.st;
    var sh = P.shapeAll(st, c.ball, c.team), opp = outfield(st, other(c.team));
    var tdx = toward.x - c.ball.x, tdy = toward.y - c.ball.y, td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    var lb = pl.last(), lastFrom = lb && (lb.kind === 'pass' || lb.kind === 'kickoff') ? lb.from : null;
    var list = [];
    outfield(st, c.team).forEach(function (p) {
      if (p.id === c.holder || (p.id === lastFrom && GUARD.pingpong) || (o.skip && o.skip[p.id])) return;
      var q = sh[p.id], rdx = toward.x - q.x, rdy = toward.y - q.y, rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      var step = Math.min(o.run || 6, rd);
      var rp = clampPt({ x: q.x + rdx / rd * step, y: q.y + rdy / rd * step });
      var dx = rp.x - c.ball.x, dy = rp.y - c.ball.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < (o.min || 8) || d > (o.max || 26)) return;
      var gain = (dx * tdx + dy * tdy) / td;
      if (o.lateral) gain = Math.abs(dx) - Math.max(0, -dy * dirOf(c.team)) * 1.5;
      if (o.back) gain = -gain;
      if (!o.back && !o.lateral && gain > td - 6) return;       // never past the place the play is going to
      var marked = 99;
      opp.forEach(function (x) { marked = Math.min(marked, P.dist(sh[x.id], rp)); });
      var score = gain - Math.max(0, d - 20) * 0.6 - (marked < 3.5 ? 5 : 0);
      list.push({ p: p, pt: rp, gain: gain, score: score, d: d });
    });
    list.sort(function (a, b) { return b.score - a.score; });
    if (!list.length) return null;
    var top = list.slice(0, 3), w = [3, 2, 1.2], tot = 0, i;
    for (i = 0; i < top.length; i++) tot += w[i];
    var r = R() * tot;
    for (i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) return top[i]; }
    return top[0];
  }

  /* ------------------------------------------------------------ open play */
  /* VARIETY: one move of the side on the ball towards `to`. Short passes
   * forward, a switch of play, a one-two, a run with the ball, a man gone
   * past, a pass back, a long ball: picked by weight from what makes sense
   * where the ball is. Returns false when nothing fits. */
  function move(pl, to, o) {
    o = o || {};
    var st = pl.st, R = pl.R, c = pl.cur, team = c.team, dir = dirOf(team);
    var d = P.dist(c.ball, to);
    var wide = Math.abs(c.ball.x - 34) > 14;
    var opts = [
      ['forward', 4.2], ['carry', 1.4], ['dribble', 0.9], ['onetwo', d > 22 ? 1.0 : 0],
      ['switch', (Math.abs(to.x - c.ball.x) > 22 || !wide) && d > 20 ? 1.1 : 0.3],
      ['back', pl.backs < 1 && pl.beats.length > 0 ? 0.7 : 0], ['long', d > 38 ? 0.9 : 0]
    ];
    if (o.noBall) opts = opts.filter(function (x) { return x[0] === 'forward' || x[0] === 'carry'; });
    if (!GUARD.variety) opts = [['forward', 1]];
    var tot = opts.reduce(function (a, x) { return a + x[1]; }, 0), r = R() * tot, kind = 'forward';
    for (var i = 0; i < opts.length; i++) { r -= opts[i][1]; if (r <= 0) { kind = opts[i][0]; break; } }
    var h = P.byId(st, c.holder);
    if (isKeeperP(st, h) && (kind === 'carry' || kind === 'dribble' || kind === 'onetwo')) kind = 'forward';
    var m;
    switch (kind) {
      case 'carry': {
        var cu = Math.min(1, (7 + R() * 6) / Math.max(1, d));
        pl.carry({ x: P.lerp(c.ball.x, to.x, cu) + (R() - 0.5) * 5, y: P.lerp(c.ball.y, to.y, cu) });
        return true;
      }
      case 'dribble': {
        /* past the nearest of theirs: he is left where he was, behind */
        var sh = P.shapeAll(st, c.ball, team), foe = null, fd = 1e9;
        outfield(st, other(team)).forEach(function (p) {
          var q = sh[p.id]; if ((q.y - c.ball.y) * dir < -1) return;
          var dd = P.dist(q, c.ball); if (dd < fd) { fd = dd; foe = p; }
        });
        if (!foe || fd > 16) { pl.carry({ x: P.lerp(c.ball.x, to.x, 0.3), y: P.lerp(c.ball.y, to.y, 0.3) }); return true; }
        var fq = sh[foe.id];
        var beyond = clampPt({ x: fq.x + (fq.x < c.ball.x ? 2.5 : -2.5), y: fq.y + dir * 4 });
        var b = pl.carry(beyond, 'dribble', 'past', foe);
        b.pin[foe.id] = { x: fq.x, y: fq.y - dir * 0.5 };
        return true;
      }
      case 'onetwo': {
        m = pickMate(pl, to, { max: 16, min: 7 });
        if (!m) break;
        var passer = P.byId(st, c.holder), start = { x: c.ball.x, y: c.ball.y };
        var runTo = clampPt({ x: P.lerp(start.x, to.x, 0.25) + (R() - 0.5) * 4, y: start.y + dir * (9 + R() * 4) });
        var pin1 = {}; pin1[passer.id] = { x: P.lerp(start.x, runTo.x, 0.5), y: P.lerp(start.y, runTo.y, 0.5) };
        pl.pass(m.p, m.pt, 'pass', 'one-two', { pin: pin1 });
        pl.pass(passer, runTo, 'pass', 'one-two');
        return true;
      }
      case 'switch': {
        var far = null, fbest = -1, sh2 = P.shapeAll(st, c.ball, team);
        var lb2 = pl.last(), lf2 = lb2 && (lb2.kind === 'pass' || lb2.kind === 'kickoff') && GUARD.pingpong ? lb2.from : null;
        outfield(st, team).forEach(function (p) {
          if (p.id === c.holder || p.id === lf2) return;
          var q = sh2[p.id], lat = Math.abs(q.x - c.ball.x), back = (c.ball.y - q.y) * dir;
          if (lat < 22 || back > 6 || P.dist(q, c.ball) > 48) return;
          var s = lat + R() * 8;
          if (s > fbest) { fbest = s; far = { p: p, pt: clampPt({ x: q.x, y: q.y + dir * 3 }) }; }
        });
        if (!far) break;
        pl.pass(far.p, far.pt, 'pass', 'switch of play');
        return true;
      }
      case 'back': {
        m = pickMate(pl, to, { back: true, max: 20, min: 7 });
        if (!m) break;
        pl.backs++;
        pl.pass(m.p, m.pt, 'pass', 'back pass');
        return true;
      }
      case 'long': {
        m = pickMate(pl, to, { min: 28, max: 50, run: 9 });
        if (!m) break;
        pl.pass(m.p, m.pt, 'pass', 'long ball');
        return true;
      }
    }
    m = pickMate(pl, to, {});
    if (m && m.gain > 2) { pl.pass(m.p, m.pt); return true; }
    var cu2 = Math.min(1, 9 / Math.max(1, d));
    pl.carry({ x: P.lerp(c.ball.x, to.x, cu2), y: P.lerp(c.ball.y, to.y, cu2) });
    return true;
  }

  /* THE BALL CHANGES SIDES, shown: a tackle, a pass cut out, a pass that
   * goes out for a throw-in, or a ball headed away to a team-mate */
  function turnover(pl, wins, near) {
    var st = pl.st, R = pl.R, c = pl.cur, loses = c.team;
    var r = R(), w = nearestTo(st, wins, near || c.ball, loses, {});
    if (!w) return;
    var nearLine = Math.min(Math.abs(c.ball.x), Math.abs(P.W - c.ball.x)) < 18;
    if (r < 0.18 && nearLine) {
      /* the pass goes out: their throw-in */
      var side = c.ball.x < 34 ? -0.9 : P.W + 0.9, outAt = { x: side, y: P.clamp(c.ball.y + dirOf(loses) * (6 + R() * 6), 6, P.L - 6) };
      var lbt = pl.last(), tgt = nearestTo(st, loses, { x: P.clamp(outAt.x, 2, P.W - 2), y: outAt.y }, loses, skipOf(c.holder, lbt && lbt.kind === 'pass' ? lbt.from : null));
      pl.pass(tgt ? tgt.p : w.p, outAt, 'pass', null, { noClamp: true, holder: null, poss: loses, dur: passDur(P.dist(c.ball, outAt)) });
      var thrower = nearestTo(st, wins, { x: P.clamp(outAt.x, 2, P.W - 2), y: outAt.y }, wins, {});
      var th = thrower ? thrower.p : w.p;
      var pin = {}; pin[th.id] = { x: P.clamp(outAt.x, 0.6, P.W - 0.6), y: outAt.y };
      pl.push({ kind: 'out', team: wins, from: null, to: th.id, ball: { x: outAt.x, y: outAt.y }, dur: 0.6, holder: th.id, poss: wins, note: 'throw-in', pin: pin });
      var mate = pickMate(pl, attackPt(wins), { max: 18, min: 7 });
      if (mate) pl.pass(mate.p, mate.pt, 'pass', 'throw-in');
      return;
    }
    if (r < 0.3) {
      /* a pass forward, headed away by one of theirs to a team-mate */
      var fwd = pickMate(pl, attackPt(loses), { min: 12, max: 30 });
      if (fwd) {
        var header = nearestTo(st, wins, fwd.pt, loses, {});
        if (header) {
          var hpt = clampPt({ x: fwd.pt.x, y: fwd.pt.y });
          pl.pass(fwd.p, hpt, 'pass', null, { holder: header.p.id, poss: wins });
          pl.beats[pl.beats.length - 1].kind = 'interception';
          pl.beats[pl.beats.length - 1].team = wins;
          pl.beats[pl.beats.length - 1].to = header.p.id;
          pl.beats[pl.beats.length - 1].note = 'header';
          return;
        }
      }
    }
    if (r < 0.62) pl.win(w.p, 'interception');
    else pl.win(w.p, 'tackle');
  }

  /* move the ball to `pre` (a team, a man, a place), with `budget` seconds
   * of varied play on the way */
  function bridge(pl, pre, budget) {
    var st = pl.st, R = pl.R, guard = 0;
    if (pl.cur.team !== pre.team) {
      var n = pl.time() + 1.2 < budget ? 1 + (R() < 0.45 ? 1 : 0) : 0;
      for (var i = 0; i < n; i++) move(pl, attackPt(pl.cur.team), { noBall: false });
      turnover(pl, pre.team, pre.pt);
    }
    while (guard++ < 8 && pl.time() < budget - 0.7) {
      var d = P.dist(pl.cur.ball, pre.pt);
      if (d < 16 && pl.cur.holder !== pre.holder.id) break;
      if (d < 6) break;
      move(pl, pre.pt, {});
      if (pl.cur.team !== pre.team) turnover(pl, pre.team, pre.pt);
    }
    deliver(pl, pre.holder, pre.pt, pre.note);
  }
  /* the ball to a man at a place: he carries it if he has it, or it is
   * passed to him; never a pass straight back to the man who just passed */
  function deliver(pl, man, at, note) {
    var c = pl.cur, lb = pl.last();
    if (c.holder === man.id) { if (P.dist(c.ball, at) > 0.6) pl.carry(at, P.dist(c.ball, at) > 6 && pl.R() < 0.4 ? 'dribble' : 'carry'); return; }
    if (lb && lb.kind === 'pass' && lb.from === man.id && GUARD.pingpong) {
      /* a third man first */
      var third = pickMate(pl, at, { skip: skipOf(man), min: 6, max: 22 });
      if (third) pl.pass(third.p, third.pt);
      else pl.carry({ x: P.lerp(c.ball.x, at.x, 0.4), y: P.lerp(c.ball.y, at.y, 0.4) });
    }
    if (pl.cur.team !== P.teamOf(pl.st, man)) turnover(pl, P.teamOf(pl.st, man), at);
    if (pl.cur.holder === man.id) { if (P.dist(pl.cur.ball, at) > 0.6) pl.carry(at); return; }
    var d = P.dist(pl.cur.ball, at);
    pl.pass(man, at, 'pass', note || (d > 30 ? 'long ball' : null));
  }

  /* a pass to `man`, but never straight back to the man who just passed
   * it: a third man first (no ping-pong) */
  function safePass(pl, man, at, note, o) {
    var lb = pl.last();
    if (GUARD.pingpong && lb && (lb.kind === 'pass' || lb.kind === 'kickoff') && lb.from === man.id && lb.to === pl.cur.holder) {
      var third = pickMate(pl, at, { skip: skipOf(man), min: 6, max: 24 });
      if (third) pl.pass(third.p, third.pt);
      else pl.carry(clampPt({ x: pl.cur.ball.x + (pl.R() - 0.5) * 8, y: pl.cur.ball.y + dirOf(pl.cur.team) * 4 }));
    }
    return pl.pass(man, at, 'pass', note, o);
  }

  /* the man a lead wants to play it to, unless he is the man who just
   * passed it: then another of those lines near there */
  function notBack(pl, man, at, lines, skip) {
    var lb = pl.last();
    if (!man || !GUARD.pingpong || !lb || !(lb.kind === 'pass' || lb.kind === 'kickoff') || lb.from !== man.id) return man;
    var sk = skipOf(man, pl.cur.holder); if (skip) for (var k in skip) sk[k] = 1;
    return pickNear(pl.st, P.teamOf(pl.st, man), at, lines, sk) || man;
  }

  /* ------------------------------------------------------------ restarts */
  /* the play starts with the restart the last result left: a kick-off, a
   * throw-in, a goal kick, a free kick, the keeper's ball */
  function restart(pl, start, startPos) {
    var st = pl.st, R = pl.R, c = pl.cur, team = c.team, m;
    var rs = start.kickoff ? 'kickoff' : start.restart ? start.restart.type : null;
    var h = c.holder ? P.byId(st, c.holder) : null;
    if (!rs && h && isKeeperP(st, h)) rs = 'keeper';
    if (rs === 'kickoff') {
      var mids = outfield(st, team).filter(function (p) { return p.line === 1; }), bm = null, bd = 1e9;
      mids.forEach(function (p) { var d = P.dist(startPos[p.id], c.ball); var s = d + R() * 12; if (s < bd) { bd = s; bm = p; } });
      if (bm) pl.pass(bm, { x: startPos[bm.id].x, y: startPos[bm.id].y + dirOf(team) * 1.5 }, 'kickoff', 'kick-off');
    } else if (rs === 'throw-in') {
      m = pickMate(pl, attackPt(team), { max: 17, min: 6, run: 4 });
      if (m) pl.pass(m.p, m.pt, 'pass', 'throw-in', { slow: 1.3 });
    } else if (rs === 'goal kick') {
      if (R() < 0.55) { m = pickMate(pl, attackPt(team), { min: 30, max: 55, run: 5 }); if (m) pl.pass(m.p, m.pt, 'pass', 'goal kick'); }
      else { m = pickMate(pl, { x: c.ball.x < 34 ? 10 : 58, y: upY(team, 18) }, { min: 8, max: 26, lateral: true }); if (m) pl.pass(m.p, m.pt, 'pass', 'goal kick'); }
    } else if (rs === 'free kick') {
      m = pickMate(pl, attackPt(team), { max: 24, min: 7 });
      if (m) pl.pass(m.p, m.pt, 'pass', 'free kick');
    } else if (rs === 'keeper') {
      if (R() < 0.6) {
        var wideT = { x: R() < 0.5 ? 10 : 58, y: upY(team, 24 + R() * 10) };
        var fb = nearestTo(st, team, wideT, team, {});
        if (fb) pl.pass(fb.p, { x: P.lerp(fb.pt.x, wideT.x, 0.5), y: P.lerp(fb.pt.y, wideT.y, 0.5) }, 'pass', 'keeper throw');
      } else {
        m = pickMate(pl, attackPt(team), { min: 30, max: 55, run: 6 });
        if (m) pl.pass(m.p, m.pt, 'pass', 'long ball');
      }
    }
    return rs;
  }

  /* ------------------------------------------------------------ key frames */
  function build(st, start, startPos, beats, endPos, endBall, salt) {
    var seg0 = build0(st, start, startPos, beats, endPos, endBall, salt);
    /* mv1: the movement layer needs to know who is who, as it is NOW (a
     * substitution later must not change how this segment is drawn) */
    if (SEGST) { var who0 = {}; P.roster(st).forEach(function (r) { who0[r.id] = { team: r.team, keeper: r.keeper, line: r.p ? r.p.line : null }; }); SEGST.set(seg0, who0); }
    if (FROMV && start) FROMV.set(seg0, start);   /* a2: the picture it starts from (its men's velocities, when the last segment left them running) */
    return seg0;
  }
  function build0(st, start, startPos, beats, endPos, endBall, salt) {
    var keys = [{ t: 0, ball: { x: start.ball.x, y: start.ball.y }, holder: start.holder, poss: start.team, pos: startPos }];
    var t = 0;
    beats.forEach(function (b, i) {
      t += b.dur;
      var last = i === beats.length - 1;
      var pos = last && endPos ? endPos : (b.pos || keyPos(st, b.ball, b.holder, b.poss, b.pin || null, salt + ':' + i, b.kind === 'out' || b.kind === 'foul'));
      /* mv1: a man not in this beat's play cannot be further from where he
       * was at the last key frame than he could run in the time */
      if (!(last && endPos) && !b.pos && P.MOVE && P.MOVE.on && b.kind !== 'out' && b.kind !== 'foul') {   /* (while play is stopped, men walk to the restart's places: no limit) */
        var keep = {}; [b.holder, b.from, b.to, b.past].forEach(function (k) { if (k) keep[k] = 1; });
        if (b.pin) for (var pk in b.pin) keep[pk] = 1;
        if (!b.pos) for (var sk in STAGED) keep[sk] = 1;
        pos = reachLimit(st, pos, keys[keys.length - 1].pos, b.dur, keep, b.ball);
      }
      var bz = last && endBall ? (endBall.z || 0) : (b.ball.z || 0);
      keys.push({ t: t, ball: last && endBall ? { x: endBall.x, y: endBall.y, z: bz } : { x: b.ball.x, y: b.ball.y, z: bz }, holder: b.holder, poss: b.poss, pos: pos });
    });
    /* m8: THE MAN A BALL IS PLAYED TO STARTS HIS RUN EARLIER. When the plan
     * has him further from where the ball arrives than he can run in the
     * beat (MV.capRecv), his place at the key frames before is moved toward
     * it, as far back as needed (never the start picture): he reads the pass
     * and goes, instead of running 20 to 40 m/s at the end (review 1). */
    if (P.MOVE && P.MOVE.m8) for (var k8 = 1; k8 < keys.length; k8++) {
      var b8 = beats[k8 - 1], r8 = b8 && b8.to;
      if (!r8 || !(PASSY[b8.kind] || b8.kind === 'interception' || b8.kind === 'tackle') || b8.kind === 'out' || !keys[k8].pos[r8]) continue;
      var tgt8 = keys[k8].pos[r8];
      for (var j8 = k8 - 1; j8 >= 1; j8--) {
        var q8 = keys[j8].pos[r8]; if (!q8) break;
        if (keys[j8].holder === r8 || (beats[j8 - 1] && (beats[j8 - 1].to === r8 || beats[j8 - 1].from === r8 || (beats[j8 - 1].pin && beats[j8 - 1].pin[r8])))) break;   /* (never where the play needs him at that moment) */
        var allow8 = (j8 === k8 - 1 ? (A2 ? MV.legRecv : MV.capRecv) : (A2 ? MV.legRecv : MV.capOut)) * Math.max(0.05, keys[j8 + 1].t - keys[j8].t), d8 = P.dist(q8, tgt8);   /* (a2: planned at a speed his legs can run) */
        if (d8 <= allow8) break;
        if (keys[j8].pos === keys[j8 - 1].pos || keys[j8].pos === endPos) break;
        keys[j8].pos = copyPos(keys[j8].pos);
        keys[j8].pos[r8] = { x: tgt8.x + (q8.x - tgt8.x) * allow8 / d8, y: tgt8.y + (q8.y - tgt8.y) * allow8 / d8 };
        tgt8 = keys[j8].pos[r8];
      }
    }
    /* a2: A PASS WAITS FOR ITS MAN. When the man a pass (or a pass cut out) is played to still cannot get from
     * where he is to where it arrives at his legs' speed, the ball takes longer to get there (up to MV.legWait s
     * more): it is played into the space he is running into, and the rest of the play moves on by as much. a1
     * had him run 20 to 30 m/s to be on time. */
    if (A2) {
      var shift9 = 0;
      for (var k9 = 1; k9 < keys.length; k9++) {
        keys[k9].t += shift9;
        var b9 = beats[k9 - 1], r9 = b9 && b9.to;
        if (!r9 || !(b9.kind === 'pass' || b9.kind === 'kickoff' || b9.kind === 'interception') || b9.holder !== r9) continue;
        var a9 = keys[k9 - 1].pos[r9], e9 = keys[k9].pos[r9]; if (!a9 || !e9) continue;
        var v9 = k9 === 1 && start && start.vel ? start.vel[r9] : null;   /* (in the first beat, the way he is running when the picture starts; later, the way the plan has him running into the pass) */
        if (k9 > 1 && keys[k9 - 2].pos[r9] && keys[k9 - 1].t - keys[k9 - 2].t > 0.05) { var pa9 = keys[k9 - 2].pos[r9], dt9 = keys[k9 - 1].t - keys[k9 - 2].t; v9 = { x: (a9.x - pa9.x) / dt9, y: (a9.y - pa9.y) / dt9 }; var vs9 = Math.sqrt(v9.x * v9.x + v9.y * v9.y); if (vs9 > MV.legV) { v9.x *= MV.legV / vs9; v9.y *= MV.legV / vs9; } }
        var need9 = (v9 ? legTimeFrom(a9, e9, v9) : legTime(P.dist(a9, e9))) + 0.25, dur9 = keys[k9].t - keys[k9 - 1].t;
        if (need9 > dur9 && (k9 === keys.length - 1 || MV.legWait > 0)) { var add9 = k9 === keys.length - 1 && endPos ? need9 - dur9 : Math.min(need9 - dur9, MV.legWait); b9.dur += add9; keys[k9].t += add9; shift9 += add9; }   /* (into the next decision's picture he must get there: the ball waits as long as it takes) */
      }
      t += shift9;
    }
    var events = [];
    var t0 = 0;
    beats.forEach(function (b, i) {
      var e = { t: +t0.toFixed(3), kind: b.kind, team: b.team, from: b.from || null, to: b.to || null,
        ball: { x: +keys[i + 1].ball.x.toFixed(2), y: +keys[i + 1].ball.y.toFixed(2) }, note: b.note || null };
      if (b.past) e.past = b.past;
      if (b.head) e.head = true;
      if (b.poss) e.poss = b.poss;   /* m3: the team with the ball after it (stats.js reads it; a clearance or a parried shot can land with either side) */
      events.push(e);
      t0 += b.dur;
    });
    return { keys: keys, beats: beats, events: events, duration: t };
  }
  function scaleTo(seg, target) {
    if (!seg.duration) return seg;
    var k = target / seg.duration;
    seg.keys.forEach(function (key) { key.t *= k; });
    seg.beats.forEach(function (b) { b.dur *= k; });
    seg.events.forEach(function (e) { e.t = +(e.t * k).toFixed(3); });
    seg.duration = target;
    seg.scale = k;
    return seg;
  }

  /* ------------------------------------------------------------ states */
  /* the match before kick-off: the user's team kicks off, from the centre spot */
  function kickoffState(st, team) {
    team = team || 'you';
    var fw = outfield(st, team).filter(function (p) { return p.line === 2; });
    if (!fw.length) fw = outfield(st, team);
    fw = fw.slice().sort(function (a, b) { return Math.abs(a.slot - 2) - Math.abs(b.slot - 2) || a.slot - b.slot; });
    var pos = P.kickoffShape(st);
    pos[fw[0].id] = { x: 34, y: team === 'you' ? 51.6 : 53.4 };
    if (A2) { var fx0 = {}; fx0[fw[0].id] = 1; P.tidy(pos, fx0, 3.0); }   /* a2: nobody half on the man kicking off */
    return { ball: { x: 34, y: 52.5 }, holder: fw[0].id, team: team, pos: pos, kickoff: true };
  }

  /* ------------------------------------------------------------ scene lead-ins */
  /* THE LAST EVENTS OF THE PLAY BUILD THE SCENE (SCENES.md). Each lead says
   * where the ball has to be first (`pre`: a team, a man, a place) and then
   * plays the beats that make the scene, ending exactly at S with the man
   * the text names. `est` is roughly how long those beats take. */
  function wing(S) { return S.x < 34 ? -1 : 1; }
  var LEADS = {
    /* you win it back high up: their defenders pass it about, one of yours takes it */
    won_high: function (st, S, R) {
      var them = 'them', a = pickNear(st, them, pt(S.x + (34 - S.x) * 0.4, S.y + 9), [0], skipOf(S.holder));
      var b = pickNear(st, them, pt(S.x, S.y + 2), [0, 1], skipOf(a, S.holder));
      return { est: 2.2, pre: { team: them, holder: a, pt: clampPt(pt(S.x + (34 - S.x) * 0.4 + (R() - 0.5) * 8, S.y + 10)) },
        run: function (pl) {
          var cut = clampPt(pt(S.x + (R() - 0.5) * 3, S.y + 3.5));
          if (b && R() < 0.5) {
            safePass(pl, b, cut, null);
            pl.win(S.holder, 'tackle', cut);
          } else {
            pl.pass(notBack(pl, b || a, pt(S.x, S.y), [0, 1], skipOf(S.holder)), clampPt(pt(S.x + (R() - 0.5) * 6, S.y - 2)), 'pass', null, { holder: S.holderId, poss: 'you' });
            var lb = pl.last(); lb.kind = 'interception'; lb.team = 'you'; lb.to = S.holderId; lb.ball = cut; lb.dur = passDur(8);
            pl.cur.ball = { x: cut.x, y: cut.y };
          }
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* a long ball, headed clear by their defender, drops to your man */
    second_ball: function (st, S, R) {
      var sender = pickNear(st, 'you', pt(34, 48), [0, 1], skipOf(S.holder));
      var fw = pickNear(st, 'you', pt(S.x, 94), [2], skipOf(S.holder, sender));
      var cb = pickNear(st, 'them', pt(S.x, 93), [0], {});
      return { est: 3.2, pre: { team: 'you', holder: sender, pt: clampPt(pt(34 + (R() - 0.5) * 20, 44 + R() * 10)) },
        run: function (pl) {
          var hpt = clampPt(pt(P.clamp(S.x + (R() - 0.5) * 10, 18, 50), 93 + R() * 3));
          var pin = {}; if (fw) pin[fw.id] = { x: hpt.x + 1.5, y: hpt.y - 1.5 };
          var fw2 = notBack(pl, fw, hpt, [2, 1], skipOf(S.holder));
          if (fw2 !== fw && fw2) { pin = {}; pin[fw2.id] = { x: hpt.x + 1.5, y: hpt.y - 1.5 }; }
          pl.pass(fw2 || S.holder, hpt, 'pass', 'long ball', { holder: null, pin: pin });
          if (cb) { var h = {}; h[cb.id] = { x: hpt.x, y: hpt.y + 1 }; pl.last().pin = Object.assign(pin, h); }
          pl.push({ kind: 'clearance', team: 'them', from: cb ? cb.id : null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(hpt, S)) * 1.1,
            holder: S.holderId, poss: 'you', note: 'header' });
        } };
    },
    /* your midfield keeps it: short passes, then the pass to the man on the ball; a forward runs past their line */
    third_man: function (st, S, R) {
      var a = pickNear(st, 'you', pt(S.x + (R() - 0.5) * 14, S.y - 14), [1, 0], skipOf(S.holder));
      return { est: 1.8, pre: { team: 'you', holder: a, pt: clampPt(pt(S.x + (R() - 0.5) * 14, S.y - 14)) },
        run: function (pl) {
          var b = pickMate(pl, pt(S.x, S.y), { skip: skipOf(S.holder), max: 16, min: 6 });
          if (b) pl.pass(b.p, b.pt, 'pass');
          deliver(pl, S.holder, pt(S.x, S.y));
        } };
    },
    /* the ball goes wide to the man on the ball as the full-back runs round him */
    overlap: function (st, S, R) {
      var rl = S.scene.roles, hold = S.holder;
      var from = rl.fullback ? (rl.winger || pickNear(st, 'you', pt(S.x - wing(S) * 7, S.y - 4), [1, 2], skipOf(hold)))
        : pickNear(st, 'you', pt(34 + (S.x - 34) * 0.3, S.y - 7), [1], skipOf(hold, rl.runner));
      return { est: 1.4, pre: { team: 'you', holder: from, pt: clampPt(rl.fullback ? pt(S.x - wing(S) * 7, S.y - 3) : pt(34 + (S.x - 34) * 0.3, S.y - 8)) },
        run: function (pl) {
          var pin = {};
          if (rl.runner) pin[rl.runner.id] = { x: P.clamp(S.x + wing(S) * 3.5, 1.5, P.W - 1.5), y: S.y - 5 };
          if (pl.cur.holder === hold.id) pl.carry(pt(S.x, S.y));
          else safePass(pl, hold, pt(S.x, S.y), null, { pin: pin });
        } };
    },
    /* their corner, headed clear by one of yours to the man on the ball */
    break_from_corner: function (st, S, R) {
      var side = R() < 0.5 ? 0 : 1, fx = side ? P.W - 0.8 : 0.8;
      var taker = pickNear(st, 'them', pt(side ? 58 : 10, 20), [1, 2], {});
      var def1 = pickNear(st, 'you', pt(side ? 40 : 28, 5), [0], skipOf(S.holder));
      var def2 = pickNear(st, 'you', pt(34, 9), [0, 1], skipOf(S.holder, def1));
      var tgt = pickNear(st, 'them', pt(34, 8), [0, 2], skipOf(taker));
      return { est: 4.4, pre: { team: 'them', holder: taker, pt: pt(side ? 56 : 12, 17 + R() * 4) },
        run: function (pl) {
          /* the cross, headed behind by your defender */
          var lb0 = pl.last();
          if (lb0 && tgt && lb0.from === tgt.id) tgt = pickNear(st, 'them', pt(34, 8), [2, 1], skipOf(taker, tgt)) || tgt;
          var hp1 = pt(side ? 40 : 28, 5 + R() * 2);
          pl.pass(tgt || taker, hp1, 'pass', 'cross', { holder: null });
          var outAt = pt(side ? 44 + R() * 8 : 16 + R() * 8, -0.9);
          pl.push({ kind: 'clearance', team: 'you', from: def1 ? def1.id : null, to: null, ball: outAt, dur: 0.5, holder: null, poss: 'them', note: 'out for a corner' });
          var tp = {}; tp[taker.id] = { x: side ? P.W - 0.6 : 0.6, y: 1.8 };
          pl.push({ kind: 'out', team: 'them', from: null, to: taker.id, ball: pt(fx, 0.8), dur: 0.9, holder: taker.id, poss: 'them', note: 'corner', pin: tp });
          var hp2 = pt(34 + (R() - 0.5) * 8, 8 + R() * 3);
          pl.pass(tgt || taker, hp2, 'pass', 'corner kick', { holder: null });
          var land = clampPt(pt(S.x + (R() - 0.5) * 4, S.y - 5));
          pl.push({ kind: 'clearance', team: 'you', from: def2 ? def2.id : null, to: S.holderId, ball: land, dur: passDur(P.dist(hp2, land)), holder: S.holderId, poss: 'you', note: 'header' });
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* you foul-free kick near the touchline: your man runs at them and is fouled */
    freekick_wide: function (st, S, R) {
      var at = clampPt(pt(S.x - wing(S) * (5 + R() * 5), S.y - 9 - R() * 5));
      return { est: 2.3, pre: { team: 'you', holder: S.holder, pt: at },
        run: function (pl) { foulAt(pl, S, S.holder, pl.R); } };
    },
    /* your defenders pass it square along the back, and theirs cuts it out */
    caught_square: function (st, S, R) {
      var backs = outfield(st, 'you').filter(function (p) { return p.line === 0; });
      var a = pickNear(st, 'you', pt(S.x < 34 ? 48 : 20, 17), [0], {});
      var b = pickNear(st, 'you', pt(S.x, 18), [0], skipOf(a));
      return { est: 2.0, pre: { team: 'you', holder: a, pt: pt(S.x < 34 ? 46 + R() * 6 : 16 + R() * 6, 15 + R() * 5) },
        run: function (pl) {
          var ya = pl.cur.ball.y;
          b = notBack(pl, b, pt(S.x, ya), [0], skipOf(S.holder));
          if (b) pl.pass(b, clampPt(pt(P.lerp(pl.cur.ball.x, S.x, 0.55), ya + (R() - 0.5) * 2)), 'pass');
          var cut = clampPt(pt(S.x + (R() - 0.5) * 3, S.y + 3));
          var c2 = pickNear(st, 'you', pt(S.x < 34 ? 6 : 62, ya), [0], skipOf(a, b));
          pl.pass(notBack(pl, c2 || a, cut, [0, 1], skipOf(S.holder)), cut, 'pass', null, { holder: S.holderId, poss: 'them' });
          var lb = pl.last(); lb.kind = 'interception'; lb.team = 'them'; lb.to = S.holderId; lb.dur = passDur(9);
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* their players up the pitch; the ball comes back to your keeper */
    keeper_pressed: function (st, S, R) {
      var mid = pickNear(st, 'them', pt(34, 45), [1], {});
      return { est: 2.4, pre: { team: 'them', holder: mid, pt: clampPt(pt(34 + (R() - 0.5) * 24, 40 + R() * 10)) },
        run: function (pl) {
          var k = S.holder, fw = pickNear(st, 'them', pt(S.x, S.y + 8), [2], {});
          if (R() < 0.5) {
            var drop = pt(S.x + (R() - 0.5) * 3, S.y + 1);
            pl.pass(notBack(pl, fw || mid, drop, [2, 1]), drop, 'pass', 'long ball', { holder: k.id, poss: 'you' });
            var lb = pl.last(); lb.kind = 'save'; lb.team = 'you'; lb.to = k.id; lb.note = 'catch';
            pl.cur.ball = drop;
            pl.carry(pt(S.x, S.y));
          } else {
            var d1 = pickNear(st, 'you', pt(S.x + (R() - 0.5) * 20, 22), [0], {});
            var there = clampPt(pt(d1 ? P.clamp(S.x + (R() - 0.5) * 24, 10, 58) : S.x, 20 + R() * 4));
            pl.pass(notBack(pl, fw || mid, there, [2, 1]), there, 'pass');
            if (d1) pl.win(d1, 'tackle', there);
            pl.pass(k, pt(S.x, S.y), 'pass', 'back pass');
          }
        } };
    },
    /* a long ball over your back line, and their man runs onto it */
    over_top: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34 + (R() - 0.5) * 30, 66), [0, 1], skipOf(S.holder));
      return { est: 1.9, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 30, 60 + R() * 12)) },
        run: function (pl) {
          for (var g = 0; g < 3 && (P.dist(pl.cur.ball, S) < 27 || (pl.last() && pl.last().kind === 'pass' && pl.last().from === S.holderId)); g++) {
            var bk = pickMate(pl, pt(34, 80), { skip: skipOf(S.holder), min: 6, max: 26, back: true });
            if (bk) pl.pass(bk.p, bk.pt, 'pass', 'back pass'); else break;
          }
          safePass(pl, S.holder, pt(S.x, S.y), 'over the top');
        } };
    },
    /* the ball to their dribbler, who runs at your back line */
    dribbler: function (st, S, R) {
      return { est: 1.5, pre: { team: 'them', holder: S.holder, pt: clampPt(pt(S.x + (R() - 0.5) * 8, S.y + 13 + R() * 4)) },
        run: function (pl) { pl.carry(pt(S.x, S.y), 'dribble'); } };
    },
    /* the ball comes to their playmaker in midfield as their runner sets off */
    playmaker: function (st, S, R) {
      var from = pickNear(st, 'them', pt(S.x + (R() - 0.5) * 20, S.y + 12), [0, 1], skipOf(S.holder));
      return { est: 1.2, pre: { team: 'them', holder: from, pt: clampPt(pt(S.x + (R() - 0.5) * 20, S.y + 11 + R() * 4)) },
        run: function (pl) { safePass(pl, S.holder, pt(S.x, S.y), null); } };
    },
    /* the ball out to their winger, who runs down the wing at your full-back */
    winger: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34, S.y + 18), [1, 0], skipOf(S.holder));
      var w0 = clampPt(pt(S.x + (S.x < 34 ? 1 : -1) * 2, S.y + 10 + R() * 4));
      return { est: 2.4, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 12, S.y + 20)) },
        run: function (pl) {
          safePass(pl, S.holder, w0, P.dist(pl.cur.ball, w0) > 24 ? 'switch of play' : null);
          pl.carry(pt(S.x, S.y), 'dribble');
        } };
    },
    /* your attack breaks down in their half; they win it and go at your
     * midfield, who are still up the pitch */
    tired_gap: function (st, S, R) {
      var a = pickNear(st, 'you', pt(34 + (R() - 0.5) * 20, 74), [1, 2], {});
      return { est: 2.2, pre: { team: 'you', holder: a, pt: clampPt(pt(34 + (R() - 0.5) * 20, 72 + R() * 6)) },
        run: function (pl) {
          var fw = pickMate(pl, attackPt('you'), { min: 8, max: 20 });
          var cutter = pickNear(st, 'them', pt(pl.cur.ball.x, pl.cur.ball.y + 8), [0, 1], skipOf(S.holder));
          var cut = clampPt(pt(pl.cur.ball.x + (R() - 0.5) * 6, pl.cur.ball.y + 7));
          if (fw && cutter) {
            pl.pass(fw.p, cut, 'pass', null, { holder: cutter.id, poss: 'them' });
            var lb = pl.last(); lb.kind = 'interception'; lb.team = 'them'; lb.to = cutter.id; lb.dur = passDur(8);
          } else if (cutter) pl.win(cutter, 'tackle');
          deliver(pl, S.holder, pt(S.x, S.y));
        } };
    },
    /* their ball wide, carried to the byline; for a siege, a shot blocked
     * and won back first */
    cross: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34, 30), [1, 2], skipOf(S.holder, S.crossTo));
      var c0 = clampPt(pt(S.x + (S.x < 34 ? 3 : -3), S.y + 13 + R() * 5));
      var siege = S.scene.siege;
      return { est: siege ? 3.4 : 2.1, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 16, siege ? 22 + R() * 4 : 30 + R() * 8)) },
        run: function (pl) {
          if (siege) {
            var blk = pickNear(st, 'you', pt(pl.cur.ball.x, pl.cur.ball.y - 7), [0], {});
            var bpt = clampPt(pt(pl.cur.ball.x + (R() - 0.5) * 4, pl.cur.ball.y - 6));
            pl.push({ kind: 'shot', team: 'them', from: pl.cur.holder, to: null, ball: bpt, dur: 0.35, holder: blk ? blk.id : null, poss: 'you', note: 'blocked' });
            var back = pickNear(st, 'them', pt(34 + (R() - 0.5) * 20, 31), [1], skipOf(S.holder, from));
            var land = clampPt(pt(34 + (R() - 0.5) * 20, 30 + R() * 4));
            pl.push({ kind: 'clearance', team: 'you', from: blk ? blk.id : null, to: back ? back.id : null, ball: land, dur: passDur(P.dist(bpt, land)),
              holder: back ? back.id : null, poss: 'them', note: null });
          }
          var crossTo = S.crossTo || S.scene.roles.target;
          var pin = {}; if (crossTo) pin[crossTo.id] = { x: 34 + (R() - 0.5) * 8, y: 17 };
          safePass(pl, S.holder, c0, P.dist(pl.cur.ball, c0) > 24 ? 'switch of play' : null, { pin: pin });
          pl.carry(pt(S.x, S.y), 'dribble');
        } };
    }
  };
  LEADS.cross_high = LEADS.cross; LEADS.cross_low = LEADS.cross;
  /* the man on the ball runs at them and is fouled where the free kick is:
   * the foul is the last event, and while the referee's whistle stops play
   * everyone gets into place (the wall, the box) */
  function foulAt(pl, S, fouled, R) {
    var st = pl.st, ft = P.teamOf(st, fouled), def = other(ft);
    if (pl.cur.holder !== fouled.id) deliver(pl, fouled, pt(S.x - dirOf(ft) * 3, S.y - dirOf(ft) * 6));
    if (P.dist(pl.cur.ball, S) > 1.5) pl.carry(pt(S.x, S.y), 'dribble');
    var fouler = S.near && P.teamOf(st, S.near) === def ? S.near : pickNear(st, def, pt(S.x, S.y), null, {});
    pl.push({ kind: 'foul', team: def, from: fouler ? fouler.id : null, to: fouled.id, ball: { x: S.x, y: S.y }, dur: 1.5,
      holder: S.holderId, poss: ft, note: 'free kick' });
  }

  /* ------------------------------------------------------------ a segment */
  /* d1: each match remembers how its plays opened, so the same opening is
   * not staged twice (keyed on the match object, never written onto it) */
  var OPEN = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function openingKey(seg) {
    return seg.events.slice(0, 3).map(function (e) { return e.kind + ':' + e.from + '>' + e.to; }).join('|');
  }
  /* THE PLAY BEFORE A MOMENT. `from` is where the last thing left off (the
   * kick-off, or the end of the last result). Ends at startOf(pending). */
  function segment(st, pending, from) {
    var S = P.startOf(st, pending);
    var seen = OPEN && GUARD.opening ? OPEN.get(st) : null;
    if (OPEN && !seen) { seen = {}; OPEN.set(st, seen); }
    var used = {};
    if (seen) for (var ix in seen) if (+ix < pending.index) used[seen[ix]] = 1;
    var best = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      var R = mulberry(seedOf(st, pending.index, pending.step || 1, attempt));
      var seg = planSegment(st, pending, from, S, R);
      var err = Math.abs(seg.duration - TARGET), dup = !!used[openingKey(seg)];
      var score = err + (dup ? 100 : 0) + (seg.duration < 3.6 || seg.duration > 7 ? 5 : 0);
      if (!best || score < best.score) best = { seg: seg, score: score };
      if (!dup && seg.duration >= 4.3 && seg.duration <= 6.0) break;
    }
    var planned = best.seg.duration;
    var out = scaleTo(best.seg, playLength(planned));
    out.planned = planned;   /* m3: the plan's own length, before it was fitted */
    out.kind = 'play'; out.start = S; out.index = pending.index; out.scene = S.scene.id;
    out.end = endState(out, S.team);
    if (seen) seen[pending.index] = openingKey(out);
    if (A2) prepClaims(st, pending, out);
    if (A2) settle(out);   /* a2: the end picture is where the men's legs get them (see track) */
    return out;
  }
  function planSegment(st, pending, from, S, R) {
    var start = from && from.ball ? from : kickoffState(st);
    var pl = new Planner(st, R, start);
    if (!pl.cur.holder) {
      var kp = keeperOf(st, pl.cur.team || S.team);
      pl.cur.holder = kp.id; pl.cur.team = P.teamOf(st, kp);
    }
    var startPos = start.pos ? copyPos(start.pos) : keyPos(st, start.ball, start.holder, start.team);
    P.roster(st).forEach(function (r) { if (!startPos[r.id]) startPos[r.id] = P.shapeAll(st, start.ball, start.team)[r.id]; });
    restart(pl, start, startPos);
    var lf = LEADS[S.scene.id];
    var lead = lf ? lf(st, S, R) : null;
    if (lead && !lead.pre.holder) lead = null;
    var pre = lead ? lead.pre : { team: S.team, holder: S.holder, pt: pt(S.x, S.y) };
    var budget = TARGET - (A2 ? MV.legBudget : 0) - (lead ? lead.est : 0);   /* (a2: the legs' passes wait for their men and carries are at a runner's speed, so the plan is made a little shorter to land near 5 s) */
    bridge(pl, pre, budget);
    if (lead) lead.run(pl);
    /* whatever the plan did, the ball ends with the man the moment names */
    if (pl.cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x, S.y), S.air ? 'in the air' : null);
    else if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y));
    runIn(st, pl, S);
    /* the last picture: the moment's own */
    var base0 = P.shapeAll(st, { x: S.x, y: S.y }, S.team);
    if (P.MOVE && P.MOVE.on) base0 = reachLimit(st, base0, startPos, Math.max(0.3, playLength(pl.time())), null, S, S.team);   /* mv1 */
    var endPos = P.freeze(st, S, base0);
    var cardMen = A2 ? cardStage(st, pending, S, endPos, startPos) : [];
    var endBall = { x: S.x, y: S.y, z: S.air ? (S.scene.id === 'over_top' ? 1.0 : 0.6) : 0 };
    var segB = build(st, start, startPos, pl.beats, endPos, endBall, seedOf(st, pending.index, 3, 0));
    if (cardMen.length) segB.keys[segB.keys.length - 1].cardMen = cardMen;
    return segB;
  }
  /* the man the moment is about makes his run: he is already moving into
   * the space when the last pass is played */
  /* a2: THE MEN THE CARDS NAME ARE WHERE THE CARD'S ACTION CAN HAPPEN (review of the night, item 3: "Porro
   * crosses it low" with Porro drawn in his own half, 35 m behind the ball). For the decision this picture
   * stops at, a man a live card has crossing the ball goes wide in the final third, on his side of the pitch,
   * and a man a card sends round the outside goes wide, a little ahead of the ball; his legs run there during
   * the play and get as far as they can in the time (the end picture is where they get him; see track, endRun).
   * The man on the ball and the man the scene names next to him keep their places. Returns the ids moved. */
  var CARDMEN = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function cardStage(st, pend, S, endPos, startPos) {
    if (!pend || !pend.moment || !endPos) return [];
    var T = S.team, dir = dirOf(T), moved = [], keep = {};
    [S.holderId, S.near && S.near.id, S.crossTo && S.crossTo.id].forEach(function (x) { if (x) keep[x] = 1; });
    var RX = [[/(?:^|[ ,])([A-Z][^ .,:;]*),? who crosses it|(?:^|[ ,])([A-Z][^ .,:;]*) crosses it/, 'cross'],
      [/passes it out to ([A-Z][^ .,:;]*), who is running (?:free )?round the outside|Send ([A-Z][^ .,:;]*) running outside|([A-Z][^ .,:;]*) overlaps/, 'outside']];
    (pend.moment.options || []).forEach(function (o) {
      if (o.disabled) return;
      var t = String(o.label || '');
      RX.forEach(function (rx) {
        var m = rx[0].exec(t); if (!m) return;
        var nm = m[1] || m[2] || m[3], man = nm ? P.byFirst(st, nm, T) : null;
        if (!man || keep[man.id] || !endPos[man.id] || isKeeperP(st, man) || moved.indexOf(man.id) >= 0) return;
        var q = endPos[man.id], side = q.x < 34 ? -1 : 1;
        var tx = side < 0 ? 6 : P.W - 6, ty;
        if (rx[1] === 'cross') ty = upY(T, 78);
        else ty = P.clamp(S.y + dir * 6, 4, P.L - 4);
        if (rx[1] === 'cross' && (S.y - ty) * dir > 0) ty = S.y;   /* (never behind the ball the cross is played from) */
        endPos[man.id] = clampPt({ x: tx, y: ty });
        moved.push(man.id);
      });
    });
    /* a3 (lead: cohcheck, a low cross "for Harvey" with Harvey left at y 68): THE MAN A CROSS OR A CUT-BACK IS FOR is
     * in the attacking area, in the box between the posts' width and a little more, greyed cards too (their words are
     * on the screen) */
    (pend.moment.options || []).forEach(function (o) {
      var rec = o.receiver || o.to, t = String(o.label || '');
      if (!rec || !rec.id || !/\b(cut[s ]?back|cross(?:es)? it|low cross)\b/i.test(t) || t.indexOf('for ' + first(rec)) < 0) return;
      if (BRK.nocrossto || keep[rec.id] || !endPos[rec.id] || isKeeperP(st, rec) || P.teamOf(st, rec) !== T || moved.indexOf(rec.id) >= 0) return;   /* (KM_MVBREAK=nocrossto: off, for the check's break) */
      var q = endPos[rec.id], up = T === 'you' ? q.y : P.L - q.y;
      if (up > 82) return;   /* (the legs may leave him short of the plan: a man planned under 82 m up is sent to 90) */
      endPos[rec.id] = clampPt({ x: P.clamp(q.x, 24, 44), y: upY(T, 90) });
      moved.push(rec.id);
    });
    if (C3) cStage(st, pend, S, endPos, keep, moved, startPos);
    if (moved.length) P.tidy(endPos, (function () { var f = {}; for (var id in endPos) if (moved.indexOf(id) < 0) f[id] = 1; return f; })(), 3.0);
    return moved;
  }
  /* kmtree5 a3 (helper C): WHERE C'S CARDS NEED THEIR MEN, for the decision this picture stops at (live cards only):
   *   FK_SHORT: the man the short free kick goes to stands 7 m from the ball, toward the middle and a little back
   *     (pitch.js startOf: the next decision starts there), and the man marking him (the card's foil) 2 m from him,
   *     goal-side;
   *   Z_RUN_BEHIND (the through ball): the runner on the shoulder of the defender with him, 1.5 m behind him and 2.5 m
   *     to his side (not yet past him: offside), so the ball can be played into the space behind;
   *   Z_RECYCLE with its +3: the receiver behind the man on the ball (the pass goes back on this picture too);
   *   Z_CUTBACK: the man it is for at the D of their box, on his way in;
   *   Z_SHOOT_FAR with their Sweeper keeper off his line: the keeper 20 m out, outside his box (3.5 m clear of it). */
  function cStage(st, pend, S, endPos, keep, moved, startPos) {
    var T = S.team, dir = dirOf(T);
    /* KEEPER_SHORT: the man of theirs drawn at the card's gap from its receiver (pitch.js keeper_pressed) is the one
     * who can get there: of their outfield men, the nearest to that spot where this play starts; he and the man
     * pitch.js put there change places in the end picture */
    if (S.ksGap && startPos && C3BRK !== 'gap') {
      var rq = endPos[S.ksGap.id], O = other(T), onG = null, gd = 99;
      if (rq) outfield(st, O).forEach(function (q) { if (endPos[q.id]) { var dq = P.dist(endPos[q.id], rq); if (dq < gd) { gd = dq; onG = q; } } });
      if (onG) {
        var spot = endPos[onG.id], best9 = null, bd9 = 1e9;
        outfield(st, O).forEach(function (q) { var sp = startPos[q.id], ep = endPos[q.id]; if (!sp || !ep || keep[q.id]) return; if (q !== onG && P.dist(ep, S) < 8) return; var dq = P.dist(sp, spot); if (dq < bd9) { bd9 = dq; best9 = q; } });
        if (best9 && best9 !== onG) { var tmp = endPos[best9.id]; endPos[best9.id] = spot; endPos[onG.id] = tmp; moved.push(best9.id); }
      }
    }
    function place(man, at) { if (!man || !endPos[man.id] || keep[man.id] || moved.indexOf(man.id) >= 0) return; endPos[man.id] = clampPt(at); moved.push(man.id); }
    (pend.moment.options || []).forEach(function (o) {
      if (o.hide) return;   /* (a greyed card is shown too: what its words say must be drawn) */
      if (o.id === 'FK_SHORT' && o.to && pend.mode === 'freekick' && C3BRK !== 'fkman') {
        var side = S.x < 34 ? 1 : -1, r0 = { x: S.x + side * 6, y: S.y - dir * 3.5 };
        place(o.to, r0);
        if (o.foil) place(o.foil, { x: r0.x + side * 0.8, y: r0.y + dir * 1.9 });
      }
      if (o.id === 'Z_RECYCLE' && o.to && o.cStage && o.cStage.back && C3BRK !== 'backalways') {
        /* the pass back with its +3 goes back on the picture it is read over: the receiver at least 6 m behind the man
         * on the ball and more behind him than to his side (he drops in to take it) */
        var rb0 = endPos[o.to.id], hb = { x: S.x, y: S.y };
        if (rb0) {
          var gb = (rb0.y - hb.y) * dir, sb = Math.abs(rb0.x - hb.x);
          if (!(gb <= -6 && -gb >= sb + 1)) { var sx = P.clamp(rb0.x - hb.x, -9, 9); place(o.to, { x: hb.x + sx, y: hb.y - dir * Math.max(6, Math.abs(sx) + 2) }); }
        }
      }
      if (o.id === 'Z_CUTBACK' && o.to && C3BRK !== 'nobyline') {
        /* the cut-back's man is on his way into the box: at the D of their box, in the middle (he arrives around the
         * penalty spot while the ball is carried to the byline) */
        place(o.to, { x: 34 + (S.x < 34 ? 3 : -3), y: upY(T, 84) });
      }
      if (o.id === 'Z_RUN_BEHIND' && o.cStage && o.cStage.through && C3BRK !== 'runner') {
        var q = P.byId(st, o.cStage.through), d = P.byId(st, o.cStage.past), dp = d && endPos[d.id];
        if (q && dp) place(q, { x: dp.x + (dp.x < 34 ? 2.5 : -2.5), y: dp.y - dir * 1.5 });
      }
      if (o.id === 'Z_SHOOT_FAR' && o.cStage && o.cStage.keeperOut && C3BRK !== 'keeperin') {
        var k = P.byId(st, o.cStage.keeperOut);
        if (k && endPos[k.id]) { endPos[k.id] = clampPt({ x: 34 + (endPos[k.id].x - 34) * 0.5, y: upY(T, 85) }); moved.push(k.id); }
      }
    });
  }
  function runIn(st, pl, S) {
    var nb = pl.beats.length;
    if (nb >= 2 && pl.beats[nb - 1].to === S.holderId && pl.beats[nb - 1].kind === 'pass') {
      var prev = pl.beats[nb - 2], shp = P.shapeAll(st, prev.ball, S.team)[S.holderId];
      if (shp && prev.holder !== S.holderId) {
        var aim = { x: S.x, y: S.y - dirOf(S.team) * 3 };
        prev.pin = prev.pin || {};
        prev.pin[S.holderId] = clampPt({ x: P.lerp(shp.x, aim.x, 0.6), y: P.lerp(shp.y, aim.y, 0.6) });
      }
    }
  }
  function endState(seg, team) {
    var k = seg.keys[seg.keys.length - 1];
    return { ball: { x: k.ball.x, y: k.ball.y, z: k.ball.z || 0 }, holder: k.holder, team: k.poss || team, pos: copyPos(k.pos) };
  }

  /* ------------------------------------------------------------ a result */
  /* WHAT THE RESULT'S TEXT SAYS HAPPENS, in a few words: how the ball
   * moves, and where the play stops. Read from the engine's text, the one
   * the user reads, so the dots and the words cannot disagree. */
  var NMX = '([^ .,:]+)';
  function findAll(text, re) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(text))) out.push(m[1]); return out; }
  /* the men the text says were gone past */
  function beatenIn(st, text, defTeam) {
    var t = String(text || '');
    if (/half a (?:yard|metre) on/.test(t)) return [];
    var names = findAll(t, new RegExp('(?:goes|dribbles|gets|cuts inside|runs|plays it|passes it|puts [^ ]+ through) past ' + NMX, 'g'))
      .concat(findAll(t, new RegExp('runs clear of ' + NMX, 'g')));
    var out = [];
    names.forEach(function (n) { var q = P.byFirst(st, n, defTeam); if (q && !isKeeperP(st, q) && out.indexOf(q) < 0) out.push(q); });
    return out;
  }
  function outcomeOf(text) {
    var t = String(text || '');
    if (/^GOAL\.|^THEY SCORE\./.test(t)) return 'goal';
    if (/comes on\./.test(t)) return 'sub';
    if (/for (?:their|your) corner|out for a corner/.test(t)) return 'corner';
    if (/offside/.test(t)) return 'offside';
    if (/throw-in|touchline/.test(t)) return 'throw';
    if (/goes wide|go wide|over the bar|clears the bar|round the post|heads it over|header goes wide|and it goes wide|shoots wide/.test(t)) return 'wide';
    if (/out of play/.test(t)) return /across the goal|go wide|makes [^ ]+ go wide/.test(t) ? 'byline' : 'throw';
    if (/hits the wall|the free kick hits it/.test(t)) return 'wall';
    if (/pulls [^ ]+ down|trips|Free kick to/.test(t)) return 'foul';
    if (/cannot hold it|pushes the shot out|pushes it out, and|gets to the loose ball|gets to it first/.test(t)) return 'rebound';
    if (/catches it|catches the|holds on to it|throws it|Their keeper catches/.test(t)) return 'catch';
    if (/saves it|pushes it round/.test(t)) return 'save';
    if (/runs through to their keeper/.test(t)) return 'tokeeper';
    if (/kick it clear|kicks it clear|heads it as far as|pushes it away|lands outside your box|headed clear|kicks it long|only kicks it a few (?:yards|metres)/.test(t)) return 'clear';
    if (/pass it back to their own defence|has to pass it back|pass it back into/.test(t)) return 'theyback';
    if (/keeps the ball in the corner/.test(t)) return 'corner_flag';
    if (/blocks/.test(t)) return 'block';
    return 'play';
  }
  /* where the ball goes out over a touchline, near where it is */
  function touchPt(ball, R, far) {
    var x = ball.x < 34 ? -0.9 : P.W + 0.9;
    return { x: x, y: P.clamp(ball.y + (R() - 0.5) * 10 + (far || 0), 3, P.L - 3) };
  }

  /* m3: THE BALL CHANGES HANDS, where and how (d1's staging, moved here so
   * preview.js can ask the same question and its arrow ends on the spot):
   * the keeper takes it where he stands; a lost dribble is a tackle where the
   * man is (a stride ahead when it runs under his foot); a pass played
   * straight to them is cut out most of the way to the man who takes it;
   * anything else is a tackle at the ball. `ball` is the ball when it is
   * lost, `lostTeam` the team losing it, `pos` the frozen picture. Pure: it
   * draws no random number. */
  /* m3: THE MAN WHO SCORES, read from the goal's text: in the sentence
   * that says "scores", the clause just before it names him ("..., and Yamal
   * scores", "Charlie rises above Lewis to meet the cross from Vince and
   * scores" is Charlie, "Alvarez gets to the ball first and scores"); when
   * that clause names nobody ("Nathan plays it into the box, where ..., and
   * scores"), the clause before it. The first man of the scoring side in the
   * clause; never a keeper. */
  function scorerIn(st, text, team) {
    var sents = String(text || '').split(/\. /);
    for (var i = 0; i < sents.length; i++) {
      var at = sents[i].search(/\bscores\b/);
      if (at < 0) continue;
      var cl = sents[i].slice(0, at).split(/, /);
      for (var c = cl.length - 1; c >= 0; c--) {
        var toks = cl[c].match(/[^ .,]+/g) || [];
        for (var j = 0; j < toks.length; j++) {
          var q = P.byFirst(st, toks[j], team);
          if (q && P.onPitch(st, q) && !isKeeperP(st, q)) return q;
        }
      }
    }
    return null;
  }
  function lostWin(st, text, o, ball, lostTeam, pos, taker) {
    text = String(text || '');
    if (isKeeperP(st, taker)) {
      var kt = P.teamOf(st, taker), ks = pos[taker.id] || { x: 34, y: kt === 'you' ? 3 : P.L - 3 };
      return { kind: 'save', ball: { x: ks.x, y: ks.y } };
    }
    if (/loses (?:it|the ball) to|is caught by [^ .,]+\. |lets it run under his foot/.test(text)) {
      var ahead = /run under his foot/.test(text) ? 1.5 : 0;
      return { kind: 'tackle', ball: clampPt({ x: ball.x, y: ball.y + dirOf(lostTeam) * ahead }) };
    }
    if (/plays it straight to|gives it straight to|passes it across the goal, straight to|pulls it back straight to|hits the cross against|before the ball arrives|is beaten in the air/.test(text) || (o && (o.to || o.receiver) && !/loses/.test(text))) {
      var tq = pos[taker.id] || ball;
      return { kind: 'interception', ball: clampPt({ x: P.lerp(ball.x, tq.x, 0.8), y: P.lerp(ball.y, tq.y, 0.8) }), note: /beaten in the air/.test(text) ? 'header' : null };
    }
    return { kind: 'tackle', ball: clampPt({ x: ball.x, y: ball.y }) };
  }

  /* THE RESULT OF A DECISION, played out: about a second or two. `p` is the
   * moment that was decided, `o` the option, `ev` what happened, `nx` the
   * next moment (or null), `from` the frozen picture of `p`. When the same
   * play goes on, it ends exactly where `nx` starts; when the play stops, it
   * ends with the restart in place for the next play. */
  function resolve(st, p, o, ev, nx, from) {
    var R = mulberry(seedOf(st, p.index, (p.step || 1) + 50, 7));
    var start = from && from.ball ? from : kickoffState(st);
    var pl = new Planner(st, R, start);
    var startPos = start.pos ? copyPos(start.pos) : keyPos(st, start.ball, start.holder, start.team);
    var S0 = P.startOf(st, p);
    var who = p.attacking || p.moment.sit.who;
    var actor = o && o.actor && P.onPitch(st, o.actor) ? o.actor : null;
    var foil = o && o.foil && P.onPitch(st, o.foil) ? o.foil : null;
    var goesOn = !!(nx && nx.continues);
    var S = goesOn ? P.startOf(st, nx) : null;
    var text = String((ev && ev.text) || ''), kind = ev ? ev.kind : 'nothing';
    var oc = outcomeOf(text);
    var endPos = null, endBall = null, result = { kickoff: null, restart: null }, beaten = [];
    var seg8late = [];   /* m8: the defenders the text names as late, who run toward the play */
    var att = who, def = other(who);
    var cur0 = pl.cur;
    if (!cur0.holder) { cur0.holder = S0.holderId; cur0.team = S0.team; }

    function man(nm, team) { return P.byFirst(st, nm, team); }
    function goalAt(team) {         // team = who scores
      var gx = 34 + (R() - 0.5) * 5;
      return { x: gx, y: team === 'you' ? P.L + 0.9 : -0.9 };
    }
    /* a shot, cross or header from the man on the ball towards `team`'s goal */
    function shotTo(to, note, dur) {
      pl.push({ kind: 'shot', team: pl.cur.team, from: pl.cur.holder, to: null, ball: to, dur: dur || passDur(P.dist(pl.cur.ball, to)) * 0.7, holder: null, poss: pl.cur.team, note: note });
    }
    function crossIn(tgt) {
      var sp = startPos[tgt.id] || { x: 34, y: 9 };
      if (A2) {   /* a2: a cross is played into the box, where the man it is for heads it (he runs there; the ball waits for him: settle) */
        var tT = P.teamOf(st, tgt), bx = { x: P.clamp(sp.x, 22, 46), y: tT === 'you' ? P.clamp(sp.y, P.L - 14, P.L - 6) : P.clamp(sp.y, 6, 14) };
        pl.pass(tgt, bx, 'pass', 'cross');
        return;
      }
      pl.pass(tgt, { x: sp.x, y: sp.y + dirOf(P.teamOf(st, tgt)) * -0.8 }, 'pass', 'cross');
    }
    function keeperSpot(team) { var k = keeperOf(st, team); return startPos[k.id] || { x: 34, y: team === 'you' ? 3 : P.L - 3 }; }
    /* the restart at the end of a result: the man taking it at the ball */
    function stopFor(type, team, ball, taker) {
      result.restart = { type: type, team: team };
      var tk = taker || (type === 'goal kick' ? keeperOf(st, team) : nearestTo(st, team, { x: P.clamp(ball.x, 2, P.W - 2), y: ball.y }, team, {}).p);
      var tpos = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dirOf(team) * (type === 'throw-in' ? 0 : 1.2), 0.6, P.L - 0.6) };
      var pin = {}; pin[tk.id] = tpos;
      pl.push({ kind: 'out', team: team, from: null, to: tk.id, ball: { x: ball.x, y: ball.y }, dur: type === 'throw-in' ? 0.6 : 0.9,
        holder: tk.id, poss: team, note: type, pin: pin });
    }
    /* the goal kick: the ball placed on the six-yard line */
    function goalKick(team, side) {
      var b = { x: side < 34 ? 28 : 40, y: team === 'you' ? 5.5 : P.L - 5.5 };
      stopFor('goal kick', team, b);
    }
    var shooter = (o && o.shotBy && P.onPitch(st, o.shotBy)) ? o.shotBy : null;
    /* mv1: A SHOT THE KEEPER GETS TO meets him 1.4 to 3 m to one side of
     * where he stood (inside his posts), and he dives across to it: the
     * shot beat pins him there (his hands at the ball, as the save beat
     * that follows has him). s0 aimed these shots at his feet, and the
     * shape pulled him back to the middle while the ball flew. `prefer`
     * forces the side (-1 left, 1 right). No random draw: a hash of the
     * match seed and the moment, so the rest of the staging is untouched. */
    var mvOn = !!(P.MOVE && P.MOVE.on);
    /* where the keeper is when the shot is struck: where he started, or,
     * after a pass or two in this result, where the last key frame's shape
     * has him */
    function keeperNow(team) {
      var k = keeperOf(st, team);
      if (!pl.beats.length || !k) return keeperSpot(team);
      /* the key frames build() will make, the same way */
      var prev = startPos, salt = seedOf(st, p.index, (p.step || 1) + 50, 9);
      pl.beats.forEach(function (lb, i) {
        var kp = keyPos(st, lb.ball, lb.holder, lb.poss, lb.pin || null, salt + ':' + i, lb.kind === 'out' || lb.kind === 'foul');
        var keep = {}; [lb.holder, lb.from, lb.to, lb.past].forEach(function (x) { if (x) keep[x] = 1; });
        if (lb.pin) for (var pk in lb.pin) keep[pk] = 1;
        for (var sk in STAGED) keep[sk] = 1;
        prev = lb.kind === 'out' || lb.kind === 'foul' ? kp : reachLimit(st, kp, prev, lb.dur, keep, lb.ball);
      });
      return prev[k.id] || keeperSpot(team);
    }
    /* m8: HOW FAR THE KEEPER GOES FOR IT, from the words: a shot straight at
     * him, one he sees all the way, a cross he comes for: a step (0.2 to 0.7 m);
     * a shot he pushes out, cannot hold, tips round: a full dive (1.6 to 2.8 m);
     * any other save: between (0.8 to 1.4 m). mv1 drew every save as a dive. */
    var DIVE = { small: [0.2, 0.5], mid: [0.8, 0.6], big: [1.6, 1.2] };
    function diveOf(t) {
      t = String(t || '');
      if (/straight at|too close to|catches it easily|sees it all the way|holds the shot|catches the (?:low )?cross|comes for the cross|catches the header|catches the ball before|takes the ball from|runs through to/.test(t)) return 'small';
      if (/pushes (?:the shot|it) (?:out|round)|cannot hold it|tips it|full stretch|at full length/.test(t)) return 'big';
      return 'mid';
    }
    function diveSpot(defTeam, salt, prefer) {
      var ks = keeperNow(defTeam), side = prefer || (P.hash01(st.seed, p.index, p.step || 1, salt) < 0.5 ? -1 : 1);
      if (ks.x + side * 3 > 37.3 || ks.x + side * 3 < 30.7) side = -side;
      var reach = 1.4 + P.hash01(st.seed, p.index, p.step || 1, salt, 'r') * 1.6;
      if (m8On()) { var dv = DIVE[diveOf(text) === 'small' ? 'small' : salt === 'parry' || salt === 'post' ? 'big' : diveOf(text)]; reach = dv[0] + P.hash01(st.seed, p.index, p.step || 1, salt, 'r') * dv[1]; }
      return { x: P.clamp(ks.x + side * reach, 30.8, 37.2), y: ks.y + dirOf(defTeam) * 0.5 };
    }
    function divePin(defTeam, at) {
      var k = keeperOf(st, defTeam), pin = {};
      if (k) pin[k.id] = { x: at.x, y: P.clamp(at.y - dirOf(defTeam) * P.BALL_OFF, 0.6, P.L - 0.6) };
      return pin;
    }
    function keeperShot(defTeam, note, dur, salt, prefer) {
      var at = diveSpot(defTeam, salt, prefer);
      shotTo(at, note, dur);
      pl.last().pin = divePin(defTeam, at);
      return at;
    }

    /* kmtree5 a3 (helper C; Eduardo 2026-09-30: the cut-back "should 'feel' like a real cut back play"): THE CUT-BACK.
     * The man on the ball first runs to the byline, 2.5 m from it at the corner of their box on his wing, and the pass
     * goes back from there along the ground (pitch.js startOf puts the man it is for around the penalty spot when it
     * comes off). */
    var cutMixed = false;
    if (C3 && o && o.id === 'Z_CUTBACK' && actor && pl.cur.holder === actor.id && kind !== 'goal' && kind !== 'conceded' && C3BRK !== 'nobyline') {
      var cbSide = pl.cur.ball.x < 34 ? -1 : 1;
      var cbB = pl.carry(pt(cbSide < 0 ? 16 : P.W - 16, upY(att, P.L - 2.5)), 'dribble');
      if (cbB && A2) cbB.dur = Math.max(cbB.dur, legTime(P.dist(start.ball, cbB.ball)) + 0.7);   /* (time for his legs, from where he stands, to get there with the ball) */
      /* the man it is for makes his run while the ball is carried to the byline, so the pass (a ball along the ground, over
       * 15 m/s) meets him as he arrives: when it comes off, 1.5 m short of where he takes it; otherwise the penalty spot */
      var cbM = o.to && P.onPitch(st, o.to) ? o.to : null;
      if (cbB && cbM && startPos[cbM.id]) {
        var cbTo = ev && ev.band === 'good' && S && S.holderId === cbM.id ? { x: S.x, y: S.y - dirOf(att) * 1.5 } : { x: 34, y: upY(att, P.L - 11) };
        cbB.pin = cbB.pin || {}; cbB.pin[cbM.id] = clampPt(cbTo);
      }
      cutMixed = !!(ev && ev.band === 'mixed' && goesOn && S && S.team === att && foil && startPos[foil.id]);
    }
    if (kind === 'rest') {
      /* a substitution: the ball does not move */
    } else if (kind === 'goal' || kind === 'conceded') {
      var scorer = kind === 'goal' ? 'you' : 'them';
      var sn = /(?:and|,) ([^ .,]+) scores/.exec(text) || /^(?:GOAL|THEY SCORE)\. ([^ .,]+) /.exec(text);
      var sman = sn ? man(sn[1], scorer) : null;
      /* m3: the real scorer, wherever the text names him (d1 missed "X rises above Y to meet it and scores", "X gets to the ball first and scores") */
      var sm3 = GUARD.scorer ? scorerIn(st, text, scorer) : null;
      if (sm3) sman = sm3;
      var crossed = /cross|across the goal|across the (?:six-yard|5\.5-metre)|across the front of/.test(text);
      /* their goal from a ball your man lost: the man who scores takes it first */
      var hTeam = P.teamOf(st, P.byId(st, pl.cur.holder));
      if (sman && hTeam && hTeam !== scorer && !isKeeperP(st, sman) && GUARD.scorer) {
        if (/loses (?:it|the ball) to|takes it from/.test(text)) pl.win(sman, 'tackle', pl.cur.ball);
        else if (C3 && o && o.id === 'KEEPER_SHORT' && o.to && startPos[o.to.id] && isKeeperP(st, P.byId(st, pl.cur.holder))) {
          /* kmtree5 a3 (helper C): the keeper's short pass cut out: on its way to the defender, 60% of the way (a pass
           * of about 10 m), so the keeper is back in his goal and set when the shot comes and can dive for it */
          var rq9 = startPos[o.to.id], kb9 = pl.cur.ball;
          pl.win(sman, 'interception', clampPt({ x: P.lerp(kb9.x, rq9.x, 0.6), y: P.lerp(kb9.y, rq9.y, 0.6) }));
          if (pl.last()) pl.last().dur = Math.max(pl.last().dur, 0.8);
          if (pl.last()) { var kid9 = pl.cur && keeperOf(st, hTeam); if (kid9 && startPos[kid9.id]) { pl.last().pin = pl.last().pin || {}; pl.last().pin[kid9.id] = { x: 34, y: hTeam === 'you' ? 2.2 : P.L - 2.2 }; } }
        }
        else pl.win(sman, 'interception', clampPt({ x: pl.cur.ball.x + (R() - 0.5) * 6, y: pl.cur.ball.y + dirOf(hTeam) * 5 }));
      }
      if (sman && sman.id !== pl.cur.holder && P.teamOf(st, sman) === scorer && crossed && P.teamOf(st, P.byId(st, pl.cur.holder)) === scorer) {
        var sp0 = startPos[sman.id] || { x: 34, y: scorer === 'you' ? P.L - 8 : 8 };
        var inSix = { x: P.clamp(sp0.x, 26, 42), y: scorer === 'you' ? P.L - 6 : 6 };
        pl.pass(sman, inSix, 'pass', /across the goal/.test(text) ? null : 'cross');
      } else if (who === 'them' && S0.crossTo && pl.cur.holder !== S0.crossTo.id && /cross|header|heads|rises|in the air/.test(text + ' ' + (S0.via || ''))) crossIn(S0.crossTo);
      /* m3: the man who scores takes the shot himself. A team-mate on the
       * ball gives it to him first: a cross for a header ("rises above X to
       * meet it"), a pull-back from the byline, a pass into the box. m2 found
       * goals shot by the wrong man; the celebration follows the shot. */
      if (GUARD.scorer && sman && pl.cur.holder !== sman.id && P.teamOf(st, P.byId(st, pl.cur.holder)) === scorer) {
        var sp1 = startPos[sman.id] || { x: 34, y: scorer === 'you' ? P.L - 10 : 10 };
        var head1 = /rises above|header|heads|to meet it/.test(text);
        var box1 = { x: P.clamp(sp1.x, 22, 46), y: scorer === 'you' ? P.clamp(sp1.y, P.L - 14, P.L - 6) : P.clamp(sp1.y, 6, 14) };
        pl.pass(sman, box1, 'pass', head1 || crossed ? 'cross' : /pulls it back|cuts it back/.test(text) ? 'cut-back' : null);
      }
      var g = goalAt(scorer);
      var kpr = keeperOf(st, other(scorer));
      /* mv1: the shot goes past him on one side, at least 3 m from where
       * he stands (inside the posts), and he dives that way, his hands
       * 0.8 m short of it (s0 put him 2.6 m from the ball on the side AWAY from it:
       * he dived the wrong way in every goal where the ball was in the middle) */
      var ksG = mvOn ? keeperNow(other(scorer)) : keeperSpot(other(scorer));
      /* the ball's line where it passes the keeper (at his distance from
       * the goal line), for a shot from `from` into the goal at x = gx */
      var from0 = { x: pl.cur.ball.x, y: pl.cur.ball.y }, tK = (ksG.y - from0.y) / ((g.y) - from0.y);
      function xAtK(gx) { return from0.x + (gx - from0.x) * tK; }
      var angled = mvOn && tK > 0.05 && tK < 1;
      if (angled) {
        var bestG = g.x, bestD = -1;
        [1, -1].forEach(function (sg0) {
          var cand = g.x, xa = xAtK(cand);
          if ((xa - ksG.x) * sg0 < 2.2) cand = (ksG.x + sg0 * 2.2 - from0.x * (1 - tK)) / tK;
          cand = P.clamp(cand, 30.9, 37.1);
          var dd = (xAtK(cand) - ksG.x) * sg0;
          /* the side the shot was going anyway first, the other side only if that side has no room */
          if (dd > bestD + (sg0 === (xAtK(g.x) >= ksG.x ? 1 : -1) ? -0.8 : 0.8)) { bestD = dd; bestG = cand; }
        });
        g.x = bestG;
      }
      shotTo(g, /rises above|header|heads/.test(text) ? 'header' : 'goal');
      pl.last().note = 'goal';
      /* the keeper dives, and does not get there */
      var xk = angled ? xAtK(g.x) : g.x;
      var dK = Math.abs(xk - ksG.x), sK = xk >= ksG.x ? 1 : -1;
      var kx = mvOn ? (dK > 1.2 ? xk - sK * Math.min(0.8, Math.max(0.2, dK - (A2 ? 1.15 : 1.05))) : ksG.x + sK * 0.5) : g.x + (g.x < 34 ? 2.6 : -2.6);   /* (a2: a dive of at least 1.15 m, so his legs' last centimetres still leave it over a metre) */
      if (m8On() && dK > 1.2) kx = ksG.x + sK * Math.min(Math.abs(kx - ksG.x), 2.8);   /* m8: a dive is at most 2.8 m: a ball far from him beats him by more */
      var pin = {}; pin[kpr.id] = { x: kx, y: mvOn ? ksG.y : scorer === 'you' ? P.L - 1.6 : 1.6 };   /* mv1: he dives across where he stands (s0 sent a keeper who had come out back to his line) */
      pl.last().pin = pin;
      result.kickoff = other(scorer);
    } else if (cutMixed) {
      /* kmtree5 a3 (helper C): a cut-back half won ("passes it, but X touches the ball away"): the pass goes back from the
       * byline toward the penalty spot, the defender gets a touch to it 6 m out, and it runs loose to the man the next
       * decision is about */
      var cbFrom = pl.cur.ball, cbAim = { x: 34, y: upY(att, P.L - 11) }, cbU = Math.min(1, 6 / (P.dist(cbFrom, cbAim) || 1));
      var cbTouch = clampPt({ x: cbFrom.x + (cbAim.x - cbFrom.x) * cbU, y: cbFrom.y + (cbAim.y - cbFrom.y) * cbU });
      var cbPin = {}; cbPin[foil.id] = { x: cbTouch.x + (cbTouch.x < 34 ? -0.8 : 0.8), y: cbTouch.y + dirOf(att) * 0.6 };
      pl.push({ kind: 'pass', team: att, from: pl.cur.holder, to: null, ball: cbTouch, dur: passDur(P.dist(cbFrom, cbTouch)), holder: null, poss: att, note: 'cut-back', pin: cbPin });
      pl.push({ kind: 'clearance', team: def, from: foil.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(cbTouch, S)), holder: S.holderId, poss: att, note: null });
    } else if (goesOn) {
      resolveOn();
    } else {
      resolveEnd();
    }

    /* ---------- the same play goes on: into the next scene */
    function resolveOn() {
      var sc = S.scene.id, T = S.team, Tdef = other(T);
      beaten = beatenIn(st, text, Tdef);
      var sameTeam = pl.cur.team === T;
      if (sc === 'corner') {
        /* a touch or a block, and the ball goes behind for the corner */
        var gl = { x: S.x < 34 ? 18 + R() * 9 : 41 + R() * 9, y: T === 'them' ? -0.9 : P.L + 0.9 };
        var toGoal = { x: 34 + (R() - 0.5) * 8, y: T === 'them' ? 5 : P.L - 5 };
        if (/pushes the shot out|keeper|round the post/.test(text) && /pushes|saves/.test(text)) {
          if (mvOn) keeperShot(Tdef, 'saved', 0.4, 'post', gl.x >= keeperSpot(Tdef).x ? 1 : -1);
          else shotTo({ x: keeperSpot(Tdef).x, y: keeperSpot(Tdef).y }, 'saved', 0.4);
          var kk = keeperOf(st, Tdef);
          pl.push({ kind: 'save', team: Tdef, from: kk.id, to: null, ball: gl, dur: 0.45, holder: null, poss: T, note: 'parried' });
        } else {
          var blk = actor && P.teamOf(st, actor) === Tdef && !isKeeperP(st, actor) ? actor : pickNear(st, Tdef, toGoal, [0], {});
          var bp = blk ? (startPos[blk.id] || toGoal) : toGoal;
          /* the cross was aimed at the man the last scene named, not at the next corner's target */
          var aimed = S0.crossTo || (S0.scene && S0.scene.roles && S0.scene.roles.target) || S.crossTo || P.byId(st, pl.cur.holder);
          if (aimed && aimed.id === pl.cur.holder) aimed = S.crossTo || aimed;
          if (/cross/.test(text)) pl.pass(aimed, { x: bp.x, y: bp.y }, 'pass', 'cross', { holder: null });
          else shotTo({ x: bp.x, y: bp.y }, 'blocked', 0.35);
          pl.push({ kind: 'clearance', team: Tdef, from: blk ? blk.id : null, to: null, ball: gl, dur: 0.5, holder: null, poss: T, note: 'out for a corner' });
        }
        var tp = {}; tp[S.holderId] = { x: S.x < 34 ? 0.6 : P.W - 0.6, y: T === 'them' ? 2 : P.L - 2 };
        pl.push({ kind: 'out', team: T, from: null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: 0.9, holder: S.holderId, poss: T, note: 'corner', pin: tp });
        return;
      }
      if (sc === 'freekick_them' || sc === 'freekick_cross' || sc === 'freekick_you') {
        /* the foul the text names, where the free kick is */
        var fouled = null;
        var fm = /pulls ([^ .,]+) down/.exec(text) || /trips ([^ .,]+)/.exec(text);
        if (fm) fouled = man(fm[1], T);
        if (!fouled) fouled = P.teamOf(st, P.byId(st, pl.cur.holder)) === T ? P.byId(st, pl.cur.holder) : S.holder;
        if (pl.cur.team !== T) turnover(pl, T, S);
        foulAt(pl, S, fouled, R);
        var fl = pl.last();
        var fr = /^([^ .,]+) (?:pulls|trips)/.exec(text) || /, and ([^ .,]+) trips/.exec(text);
        var frm = fr ? man(fr[1], Tdef) : null;
        if (frm) fl.from = frm.id;
        return;
      }
      var blk8 = m8On() && /([^ .,]+) pushes the shot from [^ .,]+ away/.exec(text), blkM8 = blk8 ? man(blk8[1], Tdef) : null;
      if (blkM8 && pl.cur.team === T && startPos[blkM8.id]) {
        /* m8: a defender blocks the shot and the ball runs loose to the man the text names (m7 drew a keeper's parry) */
        var bq8 = startPos[blkM8.id];
        shotTo({ x: bq8.x, y: bq8.y + dirOf(T) * -0.8 }, 'blocked', 0.35);
        pl.last().holder = null; pl.last().to = blkM8.id;
        pl.push({ kind: 'clearance', team: Tdef, from: blkM8.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(bq8, S)), holder: S.holderId, poss: T, note: null });
        return;
      }
      if (oc === 'rebound' || (ev && ev.dice && (m8On() ? /saves it, but|pushes (?:the shot|it) (?:out|round)/ : /saves it, but|pushes/).test(text))) {   /* m8: "Cubarsí pushes Álvarez out wide" is not a save (review 1: a cross drawn as a shot and a parry) */
        /* a shot, pushed out, and the man the text names gets there first */
        var kp = keeperOf(st, Tdef), kpos = keeperSpot(Tdef);
        if (mvOn) keeperShot(Tdef, 'saved', 0.45, 'parry');
        else shotTo({ x: kpos.x, y: kpos.y + dirOf(T) * -0.8 }, 'saved', 0.45);
        pl.push({ kind: 'save', team: Tdef, from: kp.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: 0.5, holder: S.holderId, poss: T, note: 'parried' });
        return;
      }
      if (sc === 'header') {
        var hdr = S.holder;
        if (pl.cur.holder !== hdr.id) {
          var hp = { x: S.x, y: S.y - dirOf(T) * 1.3 };
          if (pl.cur.team !== T) turnover(pl, T, S);
          if (pl.cur.holder !== hdr.id) pl.pass(hdr, hp, 'pass', 'cross');
        }
        pl.push({ kind: 'shot', team: T, from: hdr.id, to: null, ball: { x: S.x, y: S.y }, dur: 0.3, holder: hdr.id, poss: T, note: 'header' });
        return;
      }
      if (!sameTeam) {
        /* the ball changes hands: the man the text names takes it */
        var tk = /([^ .,]+) (?:takes the ball|catches it)/.exec(text);
        var taker = (tk && man(tk[1], T)) || (S.scene.roles && S.scene.roles.taker) || (foil && P.teamOf(st, foil) === T ? foil : null) || nearestTo(st, T, pl.cur.ball, pl.cur.team, {}).p;
        /* m3: where and how is lostWin's, shared with preview.js so the hover arrow ends where the ball is won */
        var lw = lostWin(st, text, o, pl.cur.ball, pl.cur.team, startPos, taker);
        /* kmtree5 a3 (helper C): a through ball their defender gets to first is still played into the space behind him:
         * he wins it there, 6 m goal-side of where he stood */
        if (C3 && o && o.id === 'Z_RUN_BEHIND' && o.cStage && startPos[o.cStage.past] && lw.kind !== 'save') {
          var dq9 = startPos[o.cStage.past]; lw.kind = 'interception'; lw.ball = clampPt({ x: dq9.x, y: dq9.y + dirOf(att) * 6 });
          var tk9 = P.byId(st, o.cStage.past); if (tk9) taker = tk9;
        }
        if (lw.kind === 'save') {
          if (m8On() && /shoots|hits it|places|lifts|header|heads/.test(text)) {
            /* m8: a shot straight at him: at where he is when it is struck, and he stays there (mv1 aimed it where he started, and the shape moved him 2 m) */
            var kn8 = keeperNow(T); lw.ball = { x: kn8.x, y: kn8.y };
            shotTo({ x: kn8.x, y: kn8.y }, 'saved', 0.45); pl.last().pin = divePin(T, kn8);
          } else if (/shoots|hits it|places|lifts|header|heads/.test(text)) shotTo({ x: keeperSpot(T).x, y: keeperSpot(T).y }, 'saved', 0.45);
          pl.push({ kind: 'save', team: T, from: pl.cur.holder, to: taker.id, ball: lw.ball, dur: 0.35, holder: taker.id, poss: T, note: 'catch' });
          if (pl.cur.ball.z) pl.cur.ball.z = 0;
        } else pl.win(taker, lw.kind, lw.ball, lw.note);
        if (pl.cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x, S.y));
        else if (P.dist(pl.cur.ball, S) > 0.5) pl.carry(pt(S.x, S.y));
        return;
      }
      /* the same team keeps it: pass, run, cross, as the text says */
      var cur = pl.cur;
      if (sc === 'cross_high' || sc === 'cross_low') {
        if (cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x + (S.x < 34 ? 2 : -2), S.y + dirOf(T) * -12));
        pl.carry(pt(S.x, S.y), 'dribble');
        return;
      }
      if (S.scene.id === 'their_on_ball' && /only kicks it a few (?:yards|metres)|drops at the edge/.test(text)) {
        var kicker = actor && P.teamOf(st, actor) === Tdef ? actor : pickNear(st, Tdef, cur.ball, [0], {});
        pl.push({ kind: 'clearance', team: Tdef, from: kicker ? kicker.id : null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(cur.ball, S)), holder: S.holderId, poss: T, note: 'header' });
        return;
      }
      if (/wins the header above ([^ .,]+), heads it down to/.test(text) && cur.holder !== S.holderId) {
        var hm = /([^ .,]+) wins the header above/.exec(text), hman = hm ? man(hm[1], T) : null;
        if (hman && hman.id !== cur.holder) {
          var hpt = startPos[hman.id] || S;
          pl.pass(hman, hpt, 'pass', 'long ball');
        }
        pl.pass(S.holder, pt(S.x, S.y), 'pass', 'header');
        return;
      }
      if (cur.holder === S.holderId) {
        var past = beaten[0] || null;
        var d = P.dist(cur.ball, S);
        if (past && startPos[past.id]) {
          /* past him: the run goes round the man, who stays where he was */
          var fq = startPos[past.id];
          var b = pl.carry(pt(S.x, S.y), 'dribble', 'past', past);
          b.pin[past.id] = { x: fq.x, y: fq.y };
        } else pl.carry(pt(S.x, S.y), d > 5 ? 'dribble' : 'carry');
        return;
      }
      var note = /cuts it back/.test(text) ? 'cut-back' : /long pass|long ball/.test(text) ? 'long ball' : /passes it back|plays it back/.test(text) ? 'back pass'
        : /through|plays it past|passes it past|puts [^ ]+ through/.test(text) ? 'through ball' : /one-two|first time/.test(text) ? 'one-two' : S.air ? 'in the air' : null;
      if (sc === 'alone' && !note) note = 'through ball';
      if (C3 && o && o.id === 'Z_RUN_BEHIND') note = 'through ball';   /* kmtree5 a3 (helper C): the through ball, into the space behind */
      if (m8On() && /crosses it|pulls it back across/.test(text) && (!note || note === 'in the air')) note = 'cross';   /* m8: the words say a cross: draw a cross */
      pl.pass(S.holder, pt(S.x, S.y), 'pass', note);
    }

    /* ---------- the play stops, or changes sides for good */
    function resolveEnd() {
      var cur = pl.cur, curMan = P.byId(st, cur.holder), T = cur.team, D = other(T);
      /* who the text says did it */
      var n1 = /^([^ .,]+) /.exec(text), subj = n1 ? P.byFirst(st, n1[1], null) : null;
      var youMan = actor && P.teamOf(st, actor) === 'you' ? actor : null;
      switch (oc) {
        case 'throw': {
          /* over the touchline, where the text says; the throw-in to the team it names */
          var far = /well away from goal/.test(text) ? dirOf(T) * (30 + R() * 12) : 0;
          var at = touchPt(cur.ball, R, far);
          if (/pushes [^ ]+ out to the touchline/.test(text)) {
            var runTo = { x: at.x < 0 ? 1.2 : P.W - 1.2, y: cur.ball.y + dirOf(T) * -3 };
            pl.carry(runTo, 'carry');
            at = { x: at.x, y: runTo.y };
          }
          var thr = /their throw-in/.test(text) ? 'them' : /your throw-in/.test(text) ? 'you' : /The pass goes out/.test(text) ? D : (who === 'them' ? 'you' : 'them');
          var kickBy = /kicks it out|kicks it clear|kick it clear|takes the short pass and kicks it out/.test(text) && subj ? subj : null;
          if (kickBy && kickBy.id !== cur.holder) {
            var kq = startPos[kickBy.id] || cur.ball;
            if (P.teamOf(st, kickBy) === T) pl.pass(kickBy, kq, 'pass');
            else pl.win(kickBy, /gets to the pass first|gets to the ball first/.test(text) ? 'interception' : 'tackle', kq);
          }
          pl.push({ kind: kickBy ? 'clearance' : 'pass', team: pl.cur.team, from: pl.cur.holder, to: null, ball: at, dur: passDur(P.dist(pl.cur.ball, at)), holder: null, poss: pl.cur.team, note: null });
          stopFor('throw-in', thr, at);
          return;
        }
        case 'byline': case 'wide': {
          /* over the goal line, wide of the posts (or over the bar): a goal kick */
          var shootT = who === 'you' ? 'you' : 'them', gkT = other(shootT);
          var gy = shootT === 'you' ? P.L + 0.9 : -0.9;
          var gx = 34 + (R() < 0.5 ? -1 : 1) * (5.5 + R() * 7);
          if (/over the bar|clears the bar|heads it over/.test(text)) gx = 34 + (R() - 0.5) * 6;
          if (/makes [^ ]+ go wide/.test(text)) {
            var wideAt = { x: cur.ball.x < 34 ? 12 : 56, y: shootT === 'you' ? P.L - 4 : 4 };
            pl.carry(wideAt, 'carry');
            gx = wideAt.x + (wideAt.x < 34 ? -3 : 3);
          }
          var sh = shooter;
          var wm = /([^ .,]+) (?:heads it over|who heads it over|who cannot head it cleanly|gets his head to|still gets a shot away|shoots)/.exec(text);   /* txt2: + 'who cannot head it cleanly' (BOX_MARK's half-won header, was 'who heads it over. The ball goes wide') */
          if (!sh && wm) sh = man(wm[1], shootT);
          if (/who heads it over|heads it over|who cannot head it cleanly|gets his head to/.test(text) && sh && sh.id !== pl.cur.holder && P.teamOf(st, P.byId(st, pl.cur.holder)) === shootT) {
            var hp2 = startPos[sh.id] || { x: 34, y: shootT === 'you' ? P.L - 9 : 9 };
            if (A2) hp2 = { x: P.clamp(hp2.x, 22, 46), y: shootT === 'you' ? P.clamp(hp2.y, P.L - 14, P.L - 6) : P.clamp(hp2.y, 6, 14) };   /* a2: the header is in the box (he runs there; the cross waits for him) */
            pl.pass(sh, hp2, 'pass', 'cross');
          } else if (/kicks it long/.test(text) && sh) {
            var mid = startPos[sh.id] || { x: 34, y: 55 };
            pl.push({ kind: 'clearance', team: gkT, from: pl.cur.holder, to: sh.id, ball: mid, dur: passDur(P.dist(pl.cur.ball, mid)), holder: sh.id, poss: shootT, note: 'long ball' });
          }
          var over = /over the bar|clears the bar|heads it over/.test(text);
          var wb = { x: gx, y: gy, z: over ? 1.2 : 0 };
          pl.push({ kind: 'shot', team: shootT, from: pl.cur.holder, to: null, ball: wb, dur: passDur(P.dist(pl.cur.ball, wb)) * 0.7, holder: null, poss: gkT,
            note: over ? 'over the bar' : /header|heads|head/.test(text) ? 'header' : /makes [^ ]+ go wide|out of play/.test(text) ? null : 'wide', head: /header|heads|head/.test(text) });
          goalKick(gkT, gx);
          return;
        }
        case 'wall': {
          var wT = T, gw = P.goalOf(wT), dw = P.dist(cur.ball, gw) || 1;
          var wp = { x: cur.ball.x + (gw.x - cur.ball.x) / dw * 9.15, y: cur.ball.y + (gw.y - cur.ball.y) / dw * 9.15 };
          var wallMan = pickNear(st, other(wT), wp, null, {});
          shotTo(wp, 'blocked', 0.35);
          pl.last().holder = wallMan ? wallMan.id : null; pl.last().to = wallMan ? wallMan.id : null; pl.last().poss = other(wT);
          var cl = clampPt({ x: 34 + (R() - 0.5) * 30, y: upY(other(wT), 45 + R() * 10) });
          pl.push({ kind: 'clearance', team: other(wT), from: wallMan ? wallMan.id : null, to: null, ball: cl, dur: passDur(P.dist(wp, cl)), holder: null, poss: other(wT), note: null });
          var pick = nearestTo(st, other(wT), cl, other(wT), {});
          if (pick) { pl.last().to = pick.p.id; pl.last().holder = pick.p.id; }
          return;
        }
        case 'foul': {
          /* a foul where the ball is: a free kick to the side fouled */
          var fouledT = who === 'them' ? 'them' : 'you', fT = other(fouledT);
          var fm2 = /([^ .,]+) pulls ([^ .,]+) down/.exec(text) || /([^ .,]+) catches ([^ .,]+) late/.exec(text) || /([^ .,]+) trips ([^ .,]+)/.exec(text);
          var fouler = fm2 ? man(fm2[1], fT) : youMan, vict = fm2 ? man(fm2[2], fouledT) : curMan;
          if (vict && vict.id !== pl.cur.holder && P.teamOf(st, vict) === fouledT) pl.pass(vict, startPos[vict.id] || cur.ball, 'pass');
          pl.push({ kind: 'foul', team: fT, from: fouler ? fouler.id : null, to: vict ? vict.id : null, ball: { x: pl.cur.ball.x, y: pl.cur.ball.y }, dur: 0.8, holder: vict ? vict.id : pl.cur.holder, poss: fouledT, note: 'free kick' });
          result.restart = { type: 'free kick', team: fouledT };
          return;
        }
        case 'offside': {
          var om = /([^ .,]+) is offside when ([^ .,]+) passes to him/.exec(text);
          var runner = om ? man(om[1], 'them') : null, passer = om ? man(om[2], 'them') : null;
          if (passer && passer.id !== pl.cur.holder && pl.cur.team === 'them') pl.pass(passer, startPos[passer.id] || cur.ball, 'pass');
          var rp = runner ? (startPos[runner.id] || cur.ball) : { x: cur.ball.x, y: cur.ball.y - 15 };
          if (runner) pl.pass(runner, { x: rp.x, y: rp.y - 3 }, 'pass', 'through ball');
          var yk = youMan || pickNear(st, 'you', pl.cur.ball, [0], {});
          pl.push({ kind: 'foul', team: 'them', from: runner ? runner.id : pl.cur.holder, to: null, ball: { x: pl.cur.ball.x, y: pl.cur.ball.y }, dur: 0.8,
            holder: yk ? yk.id : null, poss: 'you', note: 'offside' });
          var op = {}; if (yk) op[yk.id] = { x: pl.cur.ball.x, y: pl.cur.ball.y - 1.2 };
          pl.last().pin = op;
          result.restart = { type: 'free kick', team: 'you' };
          return;
        }
        case 'catch': case 'save': {
          /* on target, and the keeper has it; he may throw it straight out */
          var keepT = who === 'you' ? 'them' : 'you', kk2 = keeperOf(st, keepT), ks = keeperSpot(keepT);
          var saveAt = { x: ks.x + (R() - 0.5) * 2, y: ks.y + dirOf(keepT) * 0.8 };
          if (mvOn && !(/cross/.test(text) && who === 'them') && pl.cur.holder !== kk2.id) saveAt = diveSpot(keepT, 'catch');
          if (/cross/.test(text) && who === 'them') {
            var tgt2 = S0.crossTo || foil;
            if (tgt2 && tgt2.id !== pl.cur.holder) pl.pass(tgt2, { x: saveAt.x + (R() - 0.5) * 3, y: saveAt.y + dirOf(keepT) * 3 }, 'pass', 'cross', { holder: null });
            else shotTo(saveAt, 'cross');
          } else if (pl.cur.holder !== kk2.id) { shotTo(saveAt, /head/.test(text) ? 'header' : 'saved'); if (mvOn) pl.last().pin = divePin(keepT, saveAt); }
          pl.push({ kind: 'save', team: keepT, from: pl.cur.holder || (pl.last() && pl.last().from) || null, to: kk2.id, ball: saveAt, dur: 0.35, holder: kk2.id, poss: keepT, note: 'catch' });
          if (/throws it/.test(text)) {
            var tm = /throws it (?:out quickly|to) ?([^ .,]+)?/.exec(text);
            var rcv = (tm && tm[1] && man(tm[1], keepT)) || pickNear(st, keepT, { x: 34 + (R() - 0.5) * 30, y: upY(keepT, 42) }, [1], {});
            if (rcv) pl.pass(rcv, clampPt({ x: 34 + (R() - 0.5) * 34, y: upY(keepT, 38 + R() * 8) }), 'pass', 'keeper throw');
          }
          return;
        }
        case 'tokeeper': {
          /* the pass is too long and runs through to their keeper */
          var kt = who === 'you' ? 'them' : 'you', kk3 = keeperOf(st, kt), ks3 = keeperSpot(kt);
          var rcv2 = o && o.to && P.onPitch(st, o.to) ? o.to : null;
          var at3 = { x: ks3.x, y: ks3.y + dirOf(kt) * 1.5 };
          pl.push({ kind: 'pass', team: T, from: pl.cur.holder, to: rcv2 ? rcv2.id : null, ball: at3, dur: passDur(P.dist(cur.ball, at3)), holder: null, poss: T, note: /head/.test(text) ? 'header' : null });
          pl.push({ kind: 'save', team: kt, from: null, to: kk3.id, ball: { x: at3.x, y: at3.y - dirOf(kt) * 0.4 }, dur: 0.4, holder: kk3.id, poss: kt, note: 'collects' });
          return;
        }
        case 'clear': {
          /* headed or kicked away, as far as the text says */
          var clT = who === 'them' ? 'you' : 'them';
          var clr = youMan && clT === 'you' ? youMan : (subj && P.teamOf(st, subj) === clT ? subj : pickNear(st, clT, cur.ball, [0], {}));
          if (clr && isKeeperP(st, clr) && /cross/.test(text) && who === 'them') {
            var t3 = S0.crossTo || foil;
            var kq3 = keeperSpot(clT);
            if (t3 && t3.id !== pl.cur.holder) pl.pass(t3, { x: kq3.x, y: kq3.y + dirOf(clT) * 3 }, 'pass', 'cross', { holder: null });
          } else if (/cross/.test(text) && who === 'them' && S0.crossTo && pl.cur.holder !== S0.crossTo.id) {
            var cq = clr ? (startPos[clr.id] || cur.ball) : cur.ball;
            pl.pass(S0.crossTo, cq, 'pass', 'cross', { holder: null });
          }
          var toY = /as far as their midfield/.test(text) ? upY(clT, 52 + R() * 8) : /outside your box/.test(text) ? upY(clT, 22 + R() * 6) : upY(clT, 40 + R() * 16);
          var landC = clampPt({ x: P.clamp(pl.cur.ball.x + (R() - 0.5) * 30, 8, 60), y: toY });
          var getT = /Their players have to start again|their players kick it clear/.test(text) ? (who === 'them' ? 'them' : 'them') : /lands outside your box/.test(text) ? (R() < 0.5 ? 'you' : 'them') : clT;
          var getter = nearestTo(st, getT, landC, getT, {});
          pl.push({ kind: 'clearance', team: clT, from: clr ? clr.id : pl.cur.holder, to: getter ? getter.p.id : null, ball: landC, dur: passDur(P.dist(pl.cur.ball, landC)),
            holder: getter ? getter.p.id : null, poss: getT, note: /heads|head|header/.test(text) ? 'header' : null });
          return;
        }
        case 'theyback': {
          var bk = pickNear(st, 'them', { x: 34 + (R() - 0.5) * 24, y: upY('them', 22 + R() * 10) }, [0], {});
          if (bk && pl.cur.team === 'them') pl.pass(bk, clampPt({ x: 34 + (R() - 0.5) * 24, y: upY('them', 22 + R() * 10) }), 'pass', 'back pass');
          return;
        }
        case 'corner_flag': {
          var flag = { x: cur.ball.x < 34 ? 3 : P.W - 3, y: P.L - 3 };
          pl.carry(flag, 'carry');
          return;
        }
        case 'block': {
          var bT = who === 'you' ? 'them' : 'you';
          var bl = actor && P.teamOf(st, actor) === bT ? actor : (foil && P.teamOf(st, foil) === bT ? foil : pickNear(st, bT, cur.ball, [0], {}));
          var bq = bl ? (startPos[bl.id] || cur.ball) : cur.ball;
          shotTo({ x: bq.x, y: bq.y }, 'blocked', 0.35);
          pl.last().holder = bl ? bl.id : null; pl.last().to = bl ? bl.id : null; pl.last().poss = bT;
          return;
        }
        default: {
          /* the ball is won, kept or given away, as the text says */
          if (who === 'them') {
            if (kind === 'stopped' || kind === 'escaped' || kind === 'nothing') {
              var wn = youMan || nearestTo(st, 'you', cur.ball, 'them', {}).p;
              if (isKeeperP(st, wn)) {
                var kq4 = keeperSpot('you');
                pl.push({ kind: 'save', team: 'you', from: pl.cur.holder, to: wn.id, ball: { x: kq4.x, y: kq4.y + 0.8 }, dur: 0.55, holder: wn.id, poss: 'you', note: 'catch' });
              } else if (/steps into the path|gets to the pass first|reads|cuts out|in front of/.test(text)) pl.win(wn, 'interception');
              else pl.win(wn, 'tackle', cur.ball);
              var thr2 = /throws it to ([^ .,]+)/.exec(text);
              if (thr2) { var r2 = man(thr2[1], 'you'); if (r2) pl.pass(r2, startPos[r2.id] || { x: 34, y: 35 }, 'pass', 'keeper throw'); }
            }
          } else {
            /* your attack: kept (a short pass, or across), or it runs out */
            var kept = /keeps the ball|keeps it|your team keeps|starts again/.test(text);
            if (kept) {
              var rm = /(?:to|across to|back to|short to|out to) ([^ .,]+)/.exec(text), rc = rm ? man(rm[1], 'you') : null;
              if (rc && rc.id !== pl.cur.holder) pl.pass(rc, clampPt(startPos[rc.id] || { x: cur.ball.x + 10, y: cur.ball.y - 5 }), 'pass', /back to/.test(text) ? 'back pass' : null);
              else pl.carry(clampPt({ x: cur.ball.x + (cur.ball.x < 34 ? 8 : -8), y: cur.ball.y - 3 }), 'carry');
            } else {
              var tk2 = foil && P.teamOf(st, foil) === 'them' && !isKeeperP(st, foil) ? foil : nearestTo(st, 'them', cur.ball, 'you', {}).p;
              pl.win(tk2, o && (o.to || o.receiver) ? 'interception' : 'tackle');
            }
          }
        }
      }
    }

    if (goesOn) {
      var bmen = beaten.filter(function (q) { return P.teamOf(st, q) !== S.team; });
      var base = P.shapeAll(st, { x: S.x, y: S.y }, S.team);
      if (P.MOVE && P.MOVE.on) base = reachLimit(st, base, startPos, Math.max(0.3, pl.time()), null, S, S.team);   /* mv1: the next moment's picture: a looser limit (7 m/s), so the shape the decision is read from is still there */
      endPos = P.freeze(st, S, base, { beaten: bmen[0] || null });
      var cardMenR = A2 ? cardStage(st, nx, S, endPos, startPos) : [];
      endBall = { x: S.x, y: S.y, z: S.air ? (S.scene.id === 'over_top' ? 1.0 : 0.6) : 0 };
      /* the man gone past stays behind in every picture of the result */
      if (bmen[0]) {
        var bp0 = endPos[bmen[0].id];
        pl.beats.forEach(function (b, i) { if (i === pl.beats.length - 1) return; b.pin = b.pin || {}; if (!b.pin[bmen[0].id]) b.pin[bmen[0].id] = { x: P.lerp((startPos[bmen[0].id] || bp0).x, bp0.x, 0.5), y: P.lerp((startPos[bmen[0].id] || bp0).y, bp0.y, 0.5) }; });
      }
    }
    /* m4: a free kick from a foul in the result: the man who takes it (the
     * next decision's man on the ball) is at the ball when the whistle goes.
     * He runs in support over the beats before the foul (m3 had him walk up
     * from 9 to 14 m away during the stoppage, while the wall formed). When
     * the man fouled takes it himself he is on the ball already. */
    var lbf = pl.beats[pl.beats.length - 1], tkr = goesOn && S.holderId;
    if (GUARD.taker && endPos && tkr && endPos[tkr] && lbf && lbf.kind === 'foul' && lbf.note === 'free kick' && lbf.to !== tkr && pl.beats.length > 1) {
      var tq0 = startPos[tkr] || endPos[tkr], tq1 = endPos[tkr], nbf = pl.beats.length - 1;
      pl.beats.forEach(function (b, i) {
        if (i >= nbf || (b.from === tkr && (b.kind === 'carry' || b.kind === 'dribble'))) return;   // (a man running with the ball stays on it)
        b.pin = b.pin || {};
        if (!b.pin[tkr]) { var f = (i + 1) / nbf; b.pin[tkr] = { x: P.lerp(tq0.x, tq1.x, f), y: P.lerp(tq0.y, tq1.y, f) }; }
      });
    }
    /* m8: A DEFENDER THE TEXT NAMES AS LATE ("gets back too late", "cannot
     * get back to", "is too late to block it") runs toward the man on the
     * ball: at the shot (or the end) he is as far toward him as 7.5 m/s allows,
     * never closer than 2 m. mv1 left him standing 20 m away. */
    if (m8On()) {
      var LATE = /([^ .,]+) (?:gets back too late|cannot get back to|is too late to block it|gets there too late|is too late|is a step behind|is too slow)/g, lm;
      var used = {}; pl.beats.forEach(function (b) { [b.from, b.to, b.past].forEach(function (x) { if (x) used[x] = 1; }); if (b.pin) for (var k2 in b.pin) used[k2] = 1; });
      beaten.forEach(function (q) { used[q.id] = 1; });
      var bi8 = -1; pl.beats.forEach(function (b, i) { if (bi8 < 0 && b.kind === 'shot') bi8 = i; });
      if (bi8 < 0) bi8 = pl.beats.length - 1;
      while (bi8 >= 0 && (lm = LATE.exec(text))) {
        var lman = P.byFirst(st, lm[1], null);
        if (!lman || isKeeperP(st, lman) || used[lman.id] || !startPos[lman.id]) continue;
        var tb = pl.beats[bi8], at8 = bi8 > 0 ? pl.beats[bi8 - 1].ball : start.ball, sp8 = startPos[lman.id], T8 = 0;
        for (var j8 = 0; j8 <= bi8; j8++) T8 += pl.beats[j8].dur;
        var d8 = P.dist(sp8, at8), mv8 = Math.min(Math.max(0, d8 - 2), 7.5 * T8);   /* (a2: the plan's place; his legs get him as far toward it as they can: see track, lateRun) */
        if (mv8 < 0.5) continue;
        var q8 = { x: sp8.x + (at8.x - sp8.x) / d8 * mv8, y: sp8.y + (at8.y - sp8.y) / d8 * mv8 };
        tb.pin = tb.pin || {}; tb.pin[lman.id] = q8; used[lman.id] = 1;
        if (bi8 === pl.beats.length - 1 && endPos && endPos[lman.id]) endPos[lman.id] = q8;
        seg8late.push(lman.id);
      }
    }
    /* a2 (review of the movement, item 4): A KEEPER THE CARD SENDS OUT OF HIS GOAL comes out: through every beat he
     * runs toward where the ball is at its end (a stride short of it; for a shot, where it is struck: he came out and
     * is beaten), as far as his legs take him, and he is still out
     * there in the picture the play goes on from (a1 and a2 drew a 1 m step) */
    if (A2 && !BRK.nokeeperout && o && (o.id === 'KEEPER_SWEEPS' || /(?:runs|comes|rushes) out of his goal|leaves his goal/.test(String(o.label || '') + ' ' + String(o.read || '')))) {
      var kOut = isKeeperP(st, o.actor) ? o.actor : keeperOf(st, P.teamOf(st, o.actor) || def);
      var k0 = kOut && startPos[kOut.id];
      /* (when the next thing is the shot that beats him, the man on the ball first runs on toward goal for a second,
       * while the keeper comes out to meet him) */
      var b00 = pl.beats[0], hq0 = start.holder && P.byId(st, start.holder);
      if (k0 && b00 && b00.kind === 'shot' && hq0 && !isKeeperP(st, hq0) && b00.from === start.holder) {
        var tmA = P.teamOf(st, hq0), ap = attackPt(tmA), ux0 = ap.x - start.ball.x, uy0 = ap.y - start.ball.y, ud0 = Math.sqrt(ux0 * ux0 + uy0 * uy0) || 1, run0 = Math.min(7.5, Math.max(0, ud0 - 9));
        if (run0 > 2) pl.beats.unshift({ kind: 'carry', team: tmA, from: start.holder, to: start.holder, ball: clampPt({ x: start.ball.x + ux0 / ud0 * run0, y: start.ball.y + uy0 / ud0 * run0 }), dur: 1.6, holder: start.holder, poss: tmA, note: null });
      }
      /* a3 (lead, V9 misses: the result was one long carry, or the keeper's own clearance from where the ball was, and
       * he ran toward where that beat ends): he comes out TO THE BALL. The first time his legs can meet it (a stride
       * short) is found along the ball's path; a carry is split there (he stays where he met the man, who goes on past
       * him), and before his own clearance the man on the ball runs on toward goal until they meet. */
      var kMeet = null;
      if (k0 && b00 && b00.kind !== 'shot' && b00.kind !== 'out' && b00.kind !== 'foul') {
        var mA = start.ball, mCarry = (b00.kind === 'dribble' || b00.kind === 'carry') && b00.from !== kOut.id, mOwn = b00.from === kOut.id && hq0 && !isKeeperP(st, hq0) && P.teamOf(st, hq0) !== P.teamOf(st, kOut);
        var mB = null, mDur = b00.dur;
        if (mCarry) mB = b00.ball;
        else if (mOwn) { var tmM = P.teamOf(st, hq0), apM = attackPt(tmM), uxM = apM.x - mA.x, uyM = apM.y - mA.y, udM = Math.sqrt(uxM * uxM + uyM * uyM) || 1, runM = Math.max(0, udM - 6); mDur = runM / 6.5; mB = { x: mA.x + uxM / udM * runM, y: mA.y + uyM / udM * runM }; }
        if (mB && mDur > 0.4 && P.dist(k0, mA) > 3) for (var tM = 0.2; tM <= mDur + 1e-6; tM += 0.1) {
          var fM = tM / mDur, qM = { x: mA.x + (mB.x - mA.x) * fM, y: mA.y + (mB.y - mA.y) * fM };
          if (P.dist(k0, qM) - 1.2 <= legReach(tM) * 0.9) { kMeet = { t: tM, ball: clampPt(qM) }; break; }
        }
        if (kMeet && mCarry && kMeet.t < b00.dur - 0.3) {
          var bM1 = {}; for (var kyM in b00) bM1[kyM] = b00[kyM];
          bM1.ball = kMeet.ball; bM1.dur = kMeet.t; bM1.past = null; b00.dur = b00.dur - kMeet.t; b00.kMet = kOut.id;
          pl.beats.unshift(bM1);
        } else if (kMeet && mOwn && kMeet.t > 0.4) {
          pl.beats.unshift({ kind: 'carry', team: P.teamOf(st, hq0), from: start.holder, to: start.holder, ball: kMeet.ball, dur: kMeet.t, holder: start.holder, poss: P.teamOf(st, hq0), note: null });
        } else kMeet = null;
      }
      if (k0) {
        var tK9 = 0, prevK = k0;
        pl.beats.forEach(function (b) {
          tK9 += b.dur;
          if (b.kind === 'out' || b.kind === 'foul' || (b.from === kOut.id && b.kind === 'save')) return;
          if (b.kMet || (kMeet && b.from === kOut.id && prevK !== k0)) { b.pin = b.pin || {}; b.pin[kOut.id] = prevK; return; }   /* (a3: after meeting the ball he stays there: beaten by the man, or clearing it from there) */
          var bb = b.kind === 'shot' ? (b === pl.beats[0] ? start.ball : pl.beats[pl.beats.indexOf(b) - 1].ball) : b.ball, dx = bb.x - k0.x, dy = bb.y - k0.y, dd = Math.sqrt(dx * dx + dy * dy), go = Math.min(Math.max(0, dd - 1.5), legReach(tK9) * 0.9);
          if (go < 1) return;
          var outK = prevK;
          prevK = { x: k0.x + dx / dd * go, y: k0.y + dy / dd * go };
          if (b.kind === 'shot' && outK !== k0) prevK = outK;   /* (once the shot is struck he stops coming out) */
          if (b.kind === 'shot' && kMeet && (prevK.y - bb.y) * (b.ball.y - bb.y) <= 0) {   /* (a3: the man he came out to went past him and shoots from behind him: he turns and runs back toward his goal, as far as his legs take him) */
            var rbx = b.ball.x - prevK.x, rby = b.ball.y - prevK.y, rbd = Math.sqrt(rbx * rbx + rby * rby) || 1, rgo = Math.min(Math.max(0, rbd - 1), legReach(b.dur) * 0.9);
            prevK = { x: prevK.x + rbx / rbd * rgo, y: prevK.y + rby / rbd * rgo };
          } else if (b.kind === 'shot' && Math.abs(b.ball.y - bb.y) > 1e-6) {   /* (and at the shot he dives across, toward where it passes him) */
            var lx = bb.x + (b.ball.x - bb.x) * (prevK.y - bb.y) / (b.ball.y - bb.y), dl = lx - prevK.x;
            if (Math.abs(dl) > 0.6) prevK = { x: prevK.x + (dl > 0 ? 1 : -1) * Math.min(Math.abs(dl) - 0.5, 2.0), y: prevK.y };
          }
          b.pin = b.pin || {}; b.pin[kOut.id] = prevK;
        });
        if (endPos && endPos[kOut.id] && prevK !== k0) endPos[kOut.id] = { x: prevK.x, y: prevK.y };
      }
    }
    var seg = build(st, start, startPos, pl.beats, endPos, endBall, seedOf(st, p.index, (p.step || 1) + 50, 9));
    if (typeof cardMenR !== 'undefined' && cardMenR.length) seg.keys[seg.keys.length - 1].cardMen = cardMenR;
    seg.kind = 'result'; seg.late = seg8late; seg.start = S; seg.index = p.index; seg.outcome = oc;
    seg.beaten = beaten.length && goesOn ? beaten[0].id : null;
    seg.beatenAll = beaten.map(function (q) { return q.id; });
    var last = seg.keys[seg.keys.length - 1];
    seg.end = { ball: { x: last.ball.x, y: last.ball.y, z: last.ball.z || 0 }, holder: last.holder, team: last.poss || start.team, pos: copyPos(last.pos) };
    if (result.restart) seg.end.restart = result.restart;
    if (!seg.end.holder) {
      /* nobody has it: the nearest man of the side it goes to picks it up */
      var nt = seg.end.team || start.team, nn = null, nd = 1e9;
      P.roster(st).forEach(function (r) { if (r.team !== nt) return; var d = P.dist(last.pos[r.id], last.ball); if (d < nd) { nd = d; nn = r.id; } });
      seg.end.holder = nn;
    }
    if (result.kickoff) seg.end = kickoffState(st, result.kickoff);
    if (A2 && goesOn) prepClaims(st, nx, seg);
    if (A2) settle(seg);   /* a2 */
    return seg;
  }

  /* ------------------------------------------------------------ playback */
  function cr(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  /* the picture at time t: the ball, who has it, and all 22 (s0's picture:
   * every man on the director's own curve through the key frames) */
  var USE0 = false;   /* a2: track() reads the director's own ball (ball0), before the legs moved it */
  function kb(k) { return USE0 && k.ball0 ? k.ball0 : k.ball; }
  function rawFrameAt(seg, t) {
    var K = seg.keys, n = K.length;
    if (n === 1 || t >= seg.duration) {
      var e = K[n - 1], eb = kb(e);
      return { t: seg.duration, ball: { x: eb.x, y: eb.y, z: eb.z || 0 }, holder: e.holder, poss: e.poss, pos: e.pos, beat: null, done: true };
    }
    if (t <= 0) return { t: 0, ball: { x: kb(K[0]).x, y: kb(K[0]).y, z: kb(K[0]).z || 0 }, holder: K[0].holder, poss: K[0].poss, pos: K[0].pos, beat: null, done: false };
    var k = 0;
    while (k < n - 2 && K[k + 1].t <= t) k++;
    var a = K[k], b = K[k + 1], beat = seg.beats[k];
    var u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    u = Math.max(0, Math.min(1, u));
    var flying = PASSY[beat.kind];
    var ub = flying ? 1 - Math.pow(1 - u, 1.6) : u;
    var ab = kb(a), bb = kb(b);
    var ball = { x: P.lerp(ab.x, bb.x, ub), y: P.lerp(ab.y, bb.y, ub), z: 0 };
    var len = P.dist(ab, bb);
    if (flying && (len > 26 || AIRY[beat.note])) ball.z = Math.sin(Math.PI * u) * Math.min(2.2, 0.6 + len / 28);
    var za = ab.z || 0, zb = bb.z || 0;
    if (za || zb) ball.z = Math.max(ball.z, P.lerp(za, zb, u));
    var K0 = K[Math.max(0, k - 1)], K3 = K[Math.min(n - 1, k + 2)];
    var pos = {};
    var us = u * u * (3 - 2 * u);
    for (var id in b.pos) {
      var p1 = a.pos[id] || b.pos[id], p2 = b.pos[id], p0 = K0.pos[id] || p1, p3 = K3.pos[id] || p2;
      /* a smooth path through the key frames, eased at the ends of a segment */
      var w = (k === 0 || k === n - 2) && !A2 ? us : u;   /* (a2: not eased to a stop at the ends: the legs make the starts and stops, and a man running when the picture changes keeps running) */
      /* (a curve can overshoot a key frame: never past the lines) */
      pos[id] = { x: P.clamp(cr(p0.x, p1.x, p2.x, p3.x, w), 0.6, P.W - 0.6), y: P.clamp(cr(p0.y, p1.y, p2.y, p3.y, w), 0.6, P.L - 0.6) };
      /* m4: play is stopped for a foul: a man with the same place at both ends of the stoppage stands still (the curve through the key before made him overshoot and run back) */
      if (GUARD.taker && beat.kind === 'foul' && p1.x === p2.x && p1.y === p2.y) pos[id] = { x: p1.x, y: p1.y };
    }
    /* the man running with the ball stays on it */
    var holder = null;
    if (!flying && beat.from && pos[beat.from] && (beat.kind === 'carry' || beat.kind === 'dribble')) {
      var dy = beat.poss === 'you' ? 1 : -1;
      pos[beat.from] = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dy * P.BALL_OFF, 0.6, P.L - 0.6) };
      holder = beat.from;
    } else if (flying) holder = u < 0.1 ? a.holder : null;
    else holder = u < 0.5 ? a.holder : b.holder;
    return { t: t, ball: ball, holder: holder, poss: u < 0.5 ? a.poss : b.poss, pos: pos, beat: beat, to: beat.to || null, done: false };
  }

  /* ------------------------------------------------------------ mv1: movement */
  /* mv1: THE MOVEMENT LAYER (show only). s0 drew every man on a curve
   * through the director's key frames: all 22 re-aimed at every beat, so
   * everyone sped up and slowed down together, the whole team followed
   * every pass back and forth at a sprint (median 8.6 m/s, a man's jog is
   * 2 to 4), curves overshot and came back, and dots ran through each other.
   * Now the men IN the play (the man on the ball, the passer, the man it is
   * played to, the man gone past, a man the beat places, the keeper on a
   * shot, anyone within 7 m of the ball) still follow the director's curve
   * exactly; everyone else is a follower: he reacts a moment later the
   * farther he is from the ball (a back line reacts as one), runs toward
   * where the director wants him at a speed his role allows, speeds up and
   * slows down at a footballer's rate, keeps a stride from the others, and
   * is back exactly on the director's picture when the segment ends. The
   * key frames, the end picture and every event are untouched: only the
   * paths between them change. Precomputed once per segment (40 a second)
   * and remembered beside it, never written onto it. */
  var SEGST = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var TRACK = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var FROMV = typeof WeakMap !== 'undefined' ? new WeakMap() : null;   /* a2: segment -> the state it started from */
  var SETTLED = typeof WeakMap !== 'undefined' ? new WeakMap() : null;   /* a2: segment -> its end picture as the legs last left it */
  var MV = { h: 1 / 40, look: 1.2, arrive: 0.55, settle: 0.4, reach: 4.5, reachK: 4.5, reachA: 6, reachPic: 7, actR: 7, ramp: 0.45, gap: 2.7, pushMax: 0.2,
    vKeeper: 7, vNear: 8.0, vMid: 7.0, vFar: 5.8, vBack: 7.0, acc: 5.5, dec: 8.5,
    /* m8: top speeds a drawn man may never pass (m/s): outfield, keeper, the
     * man who has just won the ball; dropping back toward his own goal
     * (forwards, midfielders, defenders); walking to a restart after the ball
     * is dead; jogging to a restart in the middle of a play */
    capOut: 9.5, capKeeper: 8.0, capHolder: 11.0, backFw: 7.0, backMid: 7.5, backDef: 8.5, vWalk: 2.2, vJog: 4.5, cutFar: 12, cutFar1: 20, capRecv: 11, capRun: 30, endRush: 1.0,
    /* a2: THE LEGS (see track): top speeds (m/s) of a man off the ball, a man with the ball at his feet, a keeper,
     * a keeper diving at a shot; how fast any of them may change his velocity (m/s per s; the keeper's dive
     * apart); how quickly a man closes the gap to where the play wants him (s); the speed the plan gives a man
     * a ball is played to when it has him start his run early */
    legV: 9.2, legBall: 8.6, legKeeper: 7.5, legDiveV: 9.0, legA: 6.0, legDiveA: 25, legTau: 0.22, legRecv: 8.0, legGap: 3.6, legRep: 14, legLook: 0.5, legHard: 2.1, legWait: 0, legDead: 1.4, legDeadA: 7.5, legLine: 2.5, legLineW: 0, legLineSpan: 99, legKeeperA: 12, legBudget: 2.0, legLagOk: 1.0, legWaitEnd: 2.5, legKeepT: 2.0, legKeepM: 1.0, legWaitClaims: 1.2, legWaitShot: 4.0, legWaitFoul: 6.0, legWaitOver: 1.5 };
  if (A2) { MV.cutFar = Infinity; MV.cutFar1 = Infinity; }   /* a2: no picture is out of reach (the legs place it): only a dead ball is a cut */
  if (BRK.fast) { MV.legV = MV.legBall = MV.legKeeper = MV.legDiveV = 40; }
  if (BRK.jerk) { MV.legA = MV.legDiveA = MV.legKeeperA = MV.legDeadA = 400; }
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_MVWANT) MV.keepWant = true; } catch (e) { }
  if (typeof process !== 'undefined' && process.env && process.env.KM_MVTRACK === '0') MV.noTrack = true;
  /* m8: ?cut=far-off in the page: no cut for distance (men run every picture in, however far); the cut for a dead ball stays */
  try { if (/[?&]cut=far-off\b/.test((root.location && root.location.search) || '')) { MV.cutFar = 1e9; MV.cutFar1 = 1e9; } } catch (e) { }   /* checks: the key frames of mv1 without the paths */
  function moveOn() { return !!(P.MOVE && P.MOVE.on && SEGST && TRACK && !MV.noTrack); }
  function sigOf(seg) {
    var K = seg.keys, a = K[K.length - 1], s = seg.duration * 1000 + K.length;
    for (var id in a.pos) s += a.pos[id].x * 1.3 + a.pos[id].y * 0.7;
    s += a.ball.x + a.ball.y * 3;
    return s.toFixed(4);
  }
  function smooth01(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  function m8On() { return !!(P.MOVE && P.MOVE.m8); }
  /* m8: a segment that ends with the ball dead (out of play, a foul): the page
   * cuts to the restart picture when it ends, instead of running everyone there */
  /* m8: a play or result that ends with a foul cuts to the free-kick picture
   * at the whistle (the start of the foul), and everyone stands in it while
   * play is stopped: the taker is over the ball from the whistle (m4's rule),
   * nobody runs into the wall. Returns that time, or null. */
  function cutAt(seg) {
    if (!m8On() || !seg || !seg.beats || !seg.beats.length) return null;
    var k = seg.beats.length - 1;
    if (seg.beats[k].kind === 'foul' && k > 0) return seg.keys[k].t;
    var mk = midCut(seg); return mk ? seg.keys[mk].t : null;
  }
  /* a2: THE BALL GOES DEAD IN THE MIDDLE OF A PLAY (out for a corner or a throw-in, and the play goes on from the
   * restart): the page cuts to the restart picture when the ball is dead (the key after the stoppage), as it does
   * at the end of a play; a1 had the taker sprint 20 to 40 m to the flag. Returns that key's index, or 0. */
  function midCut(seg) {
    if (!A2 || !seg || !seg.beats) return 0;
    for (var k = 0; k < seg.beats.length - 1; k++) if (seg.beats[k].kind === 'out' || seg.beats[k].kind === 'foul') return k + 1;
    return 0;
  }
  function stopEnd(seg) {
    if (!m8On() || !seg || !seg.beats || !seg.beats.length) return false;
    var b = seg.beats[seg.beats.length - 1];
    if (b.kind === 'foul' && cutAt(seg) != null) return false;   /* (cut at the whistle instead) */
    if (b.kind === 'out' || b.kind === 'foul') return true;
    /* and a picture the men cannot run into in about a second (a keeper's
     * throw that moves the play 40 m upfield): three men more than MV.cutFar
     * away from it when the play ends, or one more than MV.cutFar1 */
    var tr = track(seg);
    if (!tr) return false;
    if (tr.buf) return false;   /* (a2: the legs' end picture is the end picture: nothing is out of reach) */
    var a = tr.frames[tr.n], e = seg.keys[seg.keys.length - 1].pos, far = 0, far1 = 0;
    for (var id in e) if (a[id]) { var d = P.dist(a[id], e[id]); if (d > MV.cutFar) far++; if (d > MV.cutFar1) far1++; }
    return far >= 3 || far1 >= 1;
  }
  function track(seg) {
    if (!moveOn() || !seg || !seg.keys || seg.keys.length < 2 || !(seg.duration > 0.2)) return null;
    var who0 = SEGST.get(seg);
    if (!who0) return null;
    var sig = sigOf(seg), c = TRACK.get(seg), oldC = c;
    if (c && c.sig === sig) return c;
    var h = MV.h, n = Math.max(1, Math.ceil(seg.duration / h)), dur = seg.duration, i, k;
    var K = seg.keys, B = seg.beats;
    var RF = [];
    USE0 = true;
    for (i = 0; i <= n; i++) RF.push(rawFrameAt(seg, Math.min(dur, i * h)));
    USE0 = false;
    var FR0 = A2 && FROMV ? FROMV.get(seg) : null, V0 = FR0 && FR0.vel && !BRK.rest ? FR0.vel : null;   /* a2: how the men were running when this picture began */
    /* m8: THE BALL IS DEAD from the start of the first stoppage beat (out of
     * play, a foul) to its end: nobody runs for the restart places before it,
     * and during it men walk (or jog, when play goes on after it in this
     * segment); what is left when the segment ends is a cut (stopEnd) */
    var M8 = m8On(), deadA = Infinity, deadB = Infinity, deadLast = false;
    if (M8) for (k = 0; k < B.length; k++) if (B[k].kind === 'out' || B[k].kind === 'foul') { deadA = K[k].t; deadB = K[k + 1] ? K[k + 1].t : dur; deadLast = k === B.length - 1; break; }
    var ids = Object.keys(RF[n].pos).filter(function (q) { return RF[0].pos[q]; });
    var who = {};
    ids.forEach(function (q) { who[q] = who0[q] || { team: null, keeper: false, line: null }; });
    /* LOCKED: the man with the ball at his feet is on the director's curve
     * exactly (the ball never leaves him) */
    var lock = {}, feet = [];   /* m8: feet[i] = the man running with the ball at his feet (never slowed: the ball stays on him) */
    ids.forEach(function (q) { lock[q] = new Array(n + 1); });
    for (i = 0; i <= n; i++) {
      var fr = RF[i], b = fr.beat || null, on = {};
      if (b && (b.kind === 'carry' || b.kind === 'dribble') && b.from) { on[b.from] = 1; feet[i] = b.from; }
      if (b && !PASSY[b.kind] && fr.holder) on[fr.holder] = 1;
      /* a keeper with the ball near his goal is on the director's curve exactly (his dive is timed to the shot) */
      var dead8 = M8 && fr.t >= deadA - 1e-6 && fr.t <= deadB + 1e-6;
      if (!dead8) ids.forEach(function (q) { if (who[q].keeper && Math.abs(fr.ball.y - (who[q].team === 'you' ? 0 : P.L)) < 35) on[q] = 1; });
      /* while play is stopped the man who takes the restart is at the ball from the whistle (m8: he walks there like the rest) */
      if (b && (b.kind === 'foul' || (!M8 && b.kind === 'out'))) { if (b.holder) on[b.holder] = 1; if (b.to) on[b.to] = 1; if (M8 && b.kind === 'foul' && K[K.length - 1].holder) on[K[K.length - 1].holder] = 1; }   /* (m8: a free kick's taker is at the ball from the whistle, as m4 ruled; a throw-in or corner taker walks) */
      /* (m8: nobody is pulled onto the end picture in the last frame: what is left is blended in by the page, or cut to) */
      if (i === 0 || (i === n && !M8)) ids.forEach(function (q) { on[q] = 1; });
      ids.forEach(function (q) { lock[q][i] = on[q] ? 1 : 0; });
    }
    /* ANCHORS: where the play needs a man at a key frame: the man a pass is
     * played to where it arrives, the man who has the ball, a man the beat
     * places (the man gone past, a runner, the wall), the keeper at the end
     * of a shot; and everyone at the end */
    var anch = {};
    ids.forEach(function (q) { anch[q] = []; });
    for (var kk = 1; kk < K.length; kk++) {
      var bt = B[kk - 1] || {}, need = {};
      if (bt.to) need[bt.to] = 1; if (K[kk].holder) need[K[kk].holder] = 1; if (bt.past) need[bt.past] = 1;
      if (bt.pin) for (var pk in bt.pin) need[pk] = 1;
      if (bt.kind === 'shot' || bt.kind === 'save') ids.forEach(function (q) { if (who[q].keeper) need[q] = 1; });
      /* the end, and the restart after a stoppage (everyone in place for the corner, the free kick) */
      var must = {}; for (var qm in need) must[qm] = 1;   /* m8: the places the play itself needs (not just "everyone at the end") */
      if (kk === K.length - 1 || bt.kind === 'out' || bt.kind === 'foul') ids.forEach(function (q) { need[q] = 1; });
      for (var q0 in need) if (anch[q0] && K[kk].pos[q0]) anch[q0].push({ t: Math.min(dur, K[kk].t), p: K[kk].pos[q0], must: !!must[q0] });
    }
    /* a follower heads for where the play will want him over the next
     * moment (the mean of the director's places over a window ahead), not
     * for every twitch of the curve: prefix sums for the window */
    var CS = {};
    ids.forEach(function (q) {
      var sx = [0], sy = [0];
      for (var j = 0; j <= n; j++) { sx.push(sx[j] + RF[j].pos[q].x); sy.push(sy[j] + RF[j].pos[q].y); }
      CS[q] = { x: sx, y: sy };
    });
    function windowAt(q, t0, t1) {
      if (t0 < deadA - 1e-6) { t1 = Math.min(t1, deadA); t0 = Math.min(t0, deadA); }   /* m8: live play does not look past the whistle */
      var a = Math.max(0, Math.min(n, Math.round(t0 / h))), b = Math.max(a, Math.min(n, Math.round(t1 / h)));
      var cc = CS[q], m = b - a + 1;
      return { x: (cc.x[b + 1] - cc.x[a]) / m, y: (cc.y[b + 1] - cc.y[a]) / m };
    }
    function hermite(A, t) {
      var s1 = Math.max(0, Math.min(1, (t - A.t0) / A.T)), s2 = s1 * s1, s3 = s2 * s1;
      var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s1, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      return { x: h00 * A.p.x + h10 * A.T * A.v.x + h01 * A.e.x + h11 * A.T * A.ve.x, y: h00 * A.p.y + h10 * A.T * A.v.y + h01 * A.e.y + h11 * A.T * A.ve.y };
    }
    var p = {}, v = {}, out = [], arr = {}, nextA = {}, off = {}, run8 = {}, recvFast8 = 0, cutT8 = cutAt(seg), lateRun = {}, midK = midCut(seg), midDone = false;
    var KE = K[K.length - 1], lbE = B[B.length - 1], liveEnd = A2 && lbE && lbE.kind !== 'out' && lbE.kind !== 'foul', endRun = {}, endRunOn = {};
    /* the men the next decision's words are about: the man on the ball, and the man the scene names next to him
     * (the nearest of the other side, the man a cross is for), whose places the words rely on */
    if (liveEnd && KE.holder && !(lbE.kind === 'shot' && !KE.holder)) endRun[KE.holder] = 1;
    if (liveEnd && seg.start && seg.start.near && KE.pos[seg.start.near.id]) endRun[seg.start.near.id] = 1;
    if (liveEnd && seg.start && seg.start.crossTo && KE.pos[seg.start.crossTo.id]) endRun[seg.start.crossTo.id] = 1;
    if (liveEnd && KE.cardMen) KE.cardMen.forEach(function (q) { if (KE.pos[q]) endRun[q] = 1; });   /* (the men the cards name) */
    /* a2: men why1's or r3's staging moved in the end picture after it was settled (the man the words name as the
     * nearest, a defender put behind the man past the line): they run for the place the words need, in time */
    var settled = SETTLED && SETTLED.get(seg), staged = {};
    var stagedAt = {};
    if (liveEnd && settled) for (var qs in KE.pos) if (settled[qs] && P.dist(settled[qs], KE.pos[qs]) > 0.3) { staged[qs] = 1; endRun[qs] = 1; stagedAt[qs] = { x: KE.pos[qs].x, y: KE.pos[qs].y }; }
    if (A2 && seg.late) seg.late.forEach(function (q) {
      for (var kL = 1; kL < K.length; kL++) { var bL = B[kL - 1]; if (bL && bL.pin && bL.pin[q] && K[kL].pos[q] && K[0].pos[q]) { lateRun[q] = { a: K[0].pos[q], b: K[kL].pos[q], t: K[kL].t }; break; } }
    });
    ids.forEach(function (q) { p[q] = { x: RF[0].pos[q].x, y: RF[0].pos[q].y }; v[q] = V0 && V0[q] ? { x: V0[q].x, y: V0[q].y } : { x: 0, y: 0 }; nextA[q] = 0; off[q] = { x: 0, y: 0 }; });
    out.push(copyPos(p));
    for (i = 1; i <= n; i++) {
      var t = Math.min(dur, i * h), ball = RF[i].ball, raw = RF[i].pos;
      if (midK && cutT8 != null && t >= cutT8 - 1e-6 && !midDone) {
        /* a2: the cut to the restart in the middle of the play: everyone is placed in the restart picture, still */
        midDone = true; var rp9 = K[midK].pos, sh9 = {};
        ids.forEach(function (q) { var r9 = rp9[q] || p[q]; p[q] = { x: r9.x, y: r9.y }; v[q] = { x: 0, y: 0 }; off[q] = { x: 0, y: 0 }; sh9[q] = { x: r9.x, y: r9.y }; });
        out.push(sh9);
        continue;
      }
      if (!midK && cutT8 != null && t >= cutT8 - 1e-6) {
        /* m8: after the cut at the whistle everyone stands in the free-kick picture */
        var endP = K[K.length - 1].pos, sh8 = {};
        ids.forEach(function (q) { p[q] = { x: endP[q].x, y: endP[q].y }; v[q] = { x: 0, y: 0 }; off[q] = { x: 0, y: 0 }; sh8[q] = { x: endP[q].x, y: endP[q].y }; lock[q][i] = 0; });
        out.push(sh8);
        continue;
      }
      var bto8 = RF[i].beat && RF[i].beat.to;   /* m8: the man the ball is played to runs as the plan needs (review 1: a pass to nobody is worse than a fast run) */
      /* m8: and in the last beat, the man who has the ball in the next picture gets to it: the decision is about him */
      var endH8 = M8 && RF[i].beat && B.indexOf(RF[i].beat) === B.length - 1 && !deadLast ? K[K.length - 1].holder : null;
      if (endH8 && feet[i] !== endH8 && !bto8) bto8 = endH8;
      /* a back line reacts as one: its delay from its mean distance to the ball */
      var lineD = {};
      ids.forEach(function (q) {
        if (who[q].line !== 0) return;
        var L0 = lineD[who[q].team] = lineD[who[q].team] || { s: 0, n: 0 };
        L0.s += P.dist(p[q], ball); L0.n++;
      });
      /* the back line of the side without the ball keeps one depth: each
       * free defender's target depth is the line's mean (the one nearest
       * the ball may step out to him) */
      var possT = RF[i].poss, lineY = {}, lineOut = {};
      ['you', 'them'].forEach(function (tm) {
        if (tm === possT) return;
        var L1 = ids.filter(function (q) { return who[q].team === tm && who[q].line === 0; });
        if (L1.length < 3) return;
        L1.sort(function (a, b) { return P.dist(p[a], ball) - P.dist(p[b], ball); });
        lineOut[L1[0]] = 1;
        var sy = 0; L1.slice(1).forEach(function (q) { sy += windowAt(q, t, t + MV.look).y; });
        lineY[tm] = sy / (L1.length - 1);
      });
      var np = {}, cv = {};
      ids.forEach(function (q) {
        var r = raw[q], A = anch[q];
        while (nextA[q] < A.length && A[nextA[q]].t < t - 1e-6) nextA[q]++;
        if (lock[q][i]) { np[q] = { x: r.x, y: r.y }; delete arr[q]; return; }
        /* a2: a defender the words call late runs for his place by the ball from the start, flat out (not drifting
         * with the shape and pulled onto it in the last 0.4 s, which no legs can follow) */
        /* a2: the man the next decision is about makes his run for his place in time: once what is left of the
         * play is about what his legs need to get there, he goes straight for it (and waits there if early) */
        if (endRun[q] && (!lock[q][i] || (feet[i] === q && q === KE.holder && RF[i].beat === B[B.length - 1])) && (feet[i] !== q || q === KE.holder)) {   /* (a2: the man the decision is about stops on his place even when he runs there with the ball) */
          var tg9 = staged[q] ? KE.pos[q] : (KE.pos0 && KE.pos0[q]) || KE.pos[q];
          if (tg9 && (endRunOn[q] || dur - t < legTimeFrom(p[q], tg9, v[q]) + 0.5)) { endRunOn[q] = true; np[q] = { x: tg9.x, y: tg9.y }; cv[q] = { x: 0, y: 0 }; arr[q] = 1; return; }
        }
        if (lateRun[q] && t <= lateRun[q].t + 1e-6) {
          np[q] = { x: lateRun[q].b.x, y: lateRun[q].b.y }; cv[q] = { x: 0, y: 0 }; arr[q] = 1;   /* (his legs run for it as hard as they can) */
          return;
        }
        /* m8: the man a pass is played to runs onto it in a straight line at an
         * even speed, from where he is when it is played to where it arrives
         * (mv1 eased him onto it in the last 0.4 s: a jump when he was far) */
        if (M8 && bto8 === q && RF[i].beat && (PASSY[RF[i].beat.kind] || q === endH8) && RF[i].beat.kind !== 'out') {
          var bk8 = B.indexOf(RF[i].beat), kb8 = K[bk8 + 1];
          if (kb8 && kb8.pos[q]) {
            if (!run8[q] || run8[q].k !== bk8) run8[q] = { k: bk8, p: { x: p[q].x, y: p[q].y }, t: t - h };
            var uu8 = Math.max(0, Math.min(1, (t - run8[q].t) / Math.max(h, kb8.t - run8[q].t)));
            uu8 = uu8 < 0.75 ? uu8 / 0.875 : (0.75 + (uu8 - 0.75) - (uu8 - 0.75) * (uu8 - 0.75) * 2) / 0.875;   /* an even run, slowing onto the ball in the last quarter (not through it) */
            np[q] = { x: run8[q].p.x + (kb8.pos[q].x - run8[q].p.x) * uu8, y: run8[q].p.y + (kb8.pos[q].y - run8[q].p.y) * uu8 };
            var rx8 = np[q].x - p[q].x, ry8 = np[q].y - p[q].y, rd8 = Math.sqrt(rx8 * rx8 + ry8 * ry8);
            if (rd8 > MV.capRun * h) np[q] = { x: p[q].x + rx8 * MV.capRun * h / rd8, y: p[q].y + ry8 * MV.capRun * h / rd8 };   /* (a plan that needs more than MV.capRun: he arrives late) */
            if (rd8 > 12 * h) recvFast8++;
            cv[q] = { x: (np[q].x - p[q].x) / h, y: (np[q].y - p[q].y) / h };
            arr[q] = 1;
            return;
          }
        }
        var wk = who[q], db = P.dist(p[q], ball);
        if (wk.line === 0 && lineD[wk.team]) db = lineD[wk.team].s / lineD[wk.team].n;
        var fd = Math.min(1, db / 45);
        var vmax = wk.keeper ? MV.vKeeper : wk.line === 0 ? MV.vBack : db < 15 ? MV.vNear : db < 30 ? MV.vMid : MV.vFar;
        var delay = wk.keeper ? 0 : 0.08 + 0.25 * fd;
        var tg = windowAt(q, t - delay, t - delay + (wk.keeper ? 0.1 : MV.look));   /* a keeper does not guess early */
        if (wk.line === 0 && lineY[wk.team] != null && !lineOut[q] && !MV.noLine) tg = { x: tg.x, y: lineY[wk.team] };
        if (MV.still) tg = p[q];   /* mvcheck --break still: nobody off the ball moves until he must */
        var tau = wk.keeper ? 0.12 : 0.3 + 0.25 * fd;
        var dx = (tg.x - p[q].x) / tau, dy = (tg.y - p[q].y) / tau, ds = Math.sqrt(dx * dx + dy * dy);
        if (ds > vmax) { dx *= vmax / ds; dy *= vmax / ds; }
        /* THE PLACES THE PLAY NEEDS HIM: the more getting to the next one on
         * time asks of him (or any later one), the more he runs for it
         * instead of drifting with the shape; in the last half second before
         * it he runs straight for it. He may go faster than his role's top
         * speed only when the director's picture asks for it. */
        var na = A[nextA[q]], alpha = 0, cap = vmax;
        var live8 = M8 && t < deadA - 1e-6, dead8 = M8 && !live8 && t <= deadB + 1e-6;
        if (live8 && na && na.t > deadA + 1e-6) na = null;   /* m8: the restart places are not run for while the ball is live */
        if (dead8) {
          /* m8: the ball is dead: walk (jog, if the play goes on after it) to the restart place */
          var nd = na || { p: RF[n].pos[q] }, wv = deadLast ? MV.vWalk : MV.vJog;
          var wx = nd.p.x - p[q].x, wy = nd.p.y - p[q].y, wd = Math.sqrt(wx * wx + wy * wy);
          dx = wd > 0.05 ? wx / wd * Math.min(wv, wd / h) : 0; dy = wd > 0.05 ? wy / wd * Math.min(wv, wd / h) : 0; ds = Math.sqrt(dx * dx + dy * dy);
          na = null;
        }
        if (na && !MV.still) {
          var left = Math.max(h, na.t - t), rx = (na.p.x - p[q].x) / left, ry = (na.p.y - p[q].y) / left, need = Math.sqrt(rx * rx + ry * ry), needMax = need;
          for (var jA = nextA[q] + 1; jA < A.length; jA++) { if (live8 && A[jA].t > deadA + 1e-6) break; needMax = Math.max(needMax, P.dist(p[q], A[jA].p) / Math.max(h, A[jA].t - t)); }
          alpha = Math.max(Math.min(1, Math.max(0, (needMax / vmax - 0.2) / 0.5)), Math.min(1, Math.max(0, 1 - left / 0.5)));
          dx = dx + (rx - dx) * alpha; dy = dy + (ry - dy) * alpha;
          cap = Math.max(vmax, need * 1.15);
          if (M8 && na.t >= dur - 1e-6 && !na.must) cap = Math.min(cap, vmax + MV.endRush);   /* m8: for the next decision's picture he runs at his role's speed, not flat out: what is left is run in after the play */
          ds = Math.sqrt(dx * dx + dy * dy);
          if (ds > cap) { dx *= cap / ds; dy *= cap / ds; }
        }
        if (alpha > 0.6) arr[q] = 1; else delete arr[q];
        var ax = dx - v[q].x, ay = dy - v[q].y, as = Math.sqrt(ax * ax + ay * ay);
        var cur = Math.sqrt(v[q].x * v[q].x + v[q].y * v[q].y), am = (ds < cur ? (dead8 ? MV.dec * 1.6 : MV.dec) : MV.acc) * h * (1 + 2 * alpha);   /* (m8: at the whistle they stop running quickly) */
        if (as > am) { ax *= am / as; ay *= am / as; }
        var fx = p[q].x + (v[q].x + ax) * h, fy = p[q].y + (v[q].y + ay) * h;
        cv[q] = { x: v[q].x + ax, y: v[q].y + ay };   /* his running speed, kept apart from the easing below */
        /* and in the last 0.4 s before it he is eased onto the place, so that
         * at the moment the play needs him there, he is there */
        if (na && !(M8 && na.t >= dur - 1e-6 && !na.must)) {   /* (m8: not onto the end picture: that is run in after the play, at a footballer's speed) */
          var wA = smooth01(1 - (na.t - t) / MV.settle);
          fx += (na.p.x - fx) * wA; fy += (na.p.y - fy) * wA;
        }
        np[q] = { x: fx, y: fy };
      });
      /* a stride between men: everyone but the man on the ball steps aside
       * a little (an offset on his path that fades again, and is gone by the
       * time he has to be somewhere) */
      var shown = {};
      ids.forEach(function (q) {
        if (lock[q][i]) { off[q] = { x: 0, y: 0 }; shown[q] = { x: np[q].x, y: np[q].y }; return; }
        var na2 = anch[q][nextA[q]], fade = na2 ? Math.min(1, Math.max(0, (na2.t - t) / 0.35)) : 1;
        if (M8 && na2 && na2.t >= dur - 1e-6 && !na2.must && !who[q].keeper) fade = 1;   /* m8: the end picture is blended in after the end, so men keep a stride apart up to it */
        off[q] = { x: off[q].x * 0.94 * fade, y: off[q].y * 0.94 * fade };
        shown[q] = { x: np[q].x + off[q].x, y: np[q].y + off[q].y };
      });
      for (var it2 = 0; it2 < 3; it2++) for (var a1 = 0; a1 < ids.length; a1++) for (var b1 = a1 + 1; b1 < ids.length; b1++) {
        var qa = ids[a1], qb = ids[b1], pa = shown[qa], pb = shown[qb];
        var ddx = pb.x - pa.x, ddy = pb.y - pa.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd >= MV.gap) continue;
        var fa = lock[qa][i] ? 0 : arr[qa] ? 0.5 : 1, fb = lock[qb][i] ? 0 : arr[qb] ? 0.5 : 1;
        if (!fa && !fb) continue;
        if (dd < 1e-6) { ddx = 1; ddy = 0; dd = 1; }
        var push = Math.min(MV.pushMax, MV.gap - dd), ux = ddx / dd, uy = ddy / dd;
        var sa = fa / (fa + fb), sb = fb / (fa + fb);
        off[qa].x -= ux * push * sa; off[qa].y -= uy * push * sa; off[qb].x += ux * push * sb; off[qb].y += uy * push * sb;
        pa.x -= ux * push * sa; pa.y -= uy * push * sa; pb.x += ux * push * sb; pb.y += uy * push * sb;
      }
      /* m8: THE TOP SPEED. Nobody but the man with the ball at his feet moves
       * faster than a footballer can between two samples, the picture's wishes
       * or not (review 1: single-frame jumps into the next picture); a man
       * running back toward his own goal is slower still (a forward jogs back).
       * What he does not reach by the end, the page blends in after it. */
      if (M8) ids.forEach(function (q) {
        if (feet[i] === q || bto8 === q) return;
        var wk = who[q], dir0 = wk.team === 'you' ? 1 : -1, qq0 = np[q], mx = qq0.x - p[q].x, my = qq0.y - p[q].y, md = Math.sqrt(mx * mx + my * my);
        if (md < 1e-9) return;
        var top = wk.keeper ? (Math.abs(ball.y - (wk.team === 'you' ? 0 : P.L)) < 20 ? MV.capKeeper + 2 : MV.capKeeper) : RF[i].holder === q ? MV.capHolder : MV.capOut;
        if (!wk.keeper && my * dir0 < -0.5 * md) top = Math.min(top, wk.line === 2 ? MV.backFw : wk.line === 1 ? MV.backMid : MV.backDef);
        if (md > top * h) {
          np[q] = { x: p[q].x + mx * top * h / md, y: p[q].y + my * top * h / md };
          if (cv[q]) { var cs0 = Math.sqrt(cv[q].x * cv[q].x + cv[q].y * cv[q].y); if (cs0 > top) cv[q] = { x: cv[q].x * top / cs0, y: cv[q].y * top / cs0 }; }
          if (lock[q][i]) { lock[q][i] = 0; shown[q] = { x: np[q].x, y: np[q].y }; }
          else shown[q] = { x: np[q].x + off[q].x, y: np[q].y + off[q].y };
        }
      });
      ids.forEach(function (q) {
        var qq = np[q];
        qq.x = P.clamp(qq.x, 0.6, P.W - 0.6); qq.y = P.clamp(qq.y, 0.6, P.L - 0.6);
        v[q] = cv[q] || { x: (qq.x - p[q].x) / h, y: (qq.y - p[q].y) / h };
        p[q] = qq;
        if (i === n && !M8) shown[q] = { x: qq.x, y: qq.y };   /* (m8: the last sample keeps its stride apart too: it is no longer the end picture) */
        else shown[q] = { x: P.clamp(shown[q].x, 0.6, P.W - 0.6), y: P.clamp(shown[q].y, 0.6, P.L - 0.6) };
        /* m8: the drawn dot (with its stride offset) keeps the top speed too */
        if (M8 && feet[i] !== q && !(lock[q][i] && !who[q].keeper && RF[i].holder === q)) {
          var ps = out[i - 1][q], sx = shown[q].x - ps.x, sy = shown[q].y - ps.y, sd = Math.sqrt(sx * sx + sy * sy), lim = (bto8 === q ? MV.capRun + 1 : who[q].keeper ? MV.capKeeper + 2 : MV.capHolder) * h;
          if (sd > lim) { shown[q] = { x: ps.x + sx * lim / sd, y: ps.y + sy * lim / sd }; if (lock[q][i]) lock[q][i] = 0; }
        }
      });
      out.push(shown);
    }
    c = { sig: sig, h: h, n: n, frames: out, act: lock, recvFast: recvFast8 * h };
    if (A2) legs(seg, c, RF, out, ids, who, feet, cutT8, V0);
    /* a2: a later re-run (the staging moved men in a settled end picture) changes those men only: everyone else
     * keeps the paths and the end places the words were fitted to */
    if (A2 && settled && oldC && oldC.buf && oldC.n === c.n && c.buf && Object.keys(staged).length) {
      var KL9 = K[K.length - 1];
      ids.forEach(function (q) {
        if (oldC.idx[q] == null || c.idx[q] == null) return;
        /* a man the staging moved keeps his path too, and eases from it onto the staged place over the end of the
         * play (never faster than about 5 m/s/s more than he was running) */
        var dS = staged[q] && settled[q] && stagedAt[q] ? { x: stagedAt[q].x - settled[q].x, y: stagedAt[q].y - settled[q].y } : null, dd9 = dS ? Math.sqrt(dS.x * dS.x + dS.y * dS.y) : 0;
        var Tb = Math.min(dur, Math.max(1.2, Math.sqrt(1.2 * dd9)));
        for (var i9 = 0; i9 <= c.n; i9++) {
          var o1 = (i9 * c.m + c.idx[q]) * 2, o0 = (i9 * oldC.m + oldC.idx[q]) * 2, bx9 = oldC.buf[o0], by9 = oldC.buf[o0 + 1];
          if (dS) { var t9 = Math.min(dur, i9 * c.h), u9 = Math.max(0, Math.min(1, (t9 - (dur - Tb)) / Tb)); u9 = u9 * u9 * (3 - 2 * u9); bx9 += dS.x * u9; by9 += dS.y * u9; }
          if (dS && i9 > 0) {   /* (and never faster than his legs: what is left, he is short of) */
            var o9 = ((i9 - 1) * c.m + c.idx[q]) * 2, px9 = c.buf[o9], py9 = c.buf[o9 + 1], sx9 = bx9 - px9, sy9 = by9 - py9, sd9 = Math.sqrt(sx9 * sx9 + sy9 * sy9), hh9 = Math.min(dur, i9 * c.h) - Math.min(dur, (i9 - 1) * c.h), lim9 = MV.legV * hh9;
            if (sd9 > lim9 && sd9 > 1e-9) { bx9 = px9 + sx9 * lim9 / sd9; by9 = py9 + sy9 * lim9 / sd9; }
          }
          c.buf[o1] = bx9; c.buf[o1 + 1] = by9;
        }
        if (staged[q] && stagedAt[q]) { var eo9 = (c.n * c.m + c.idx[q]) * 2; stagedAt[q] = { x: c.buf[eo9], y: c.buf[eo9 + 1] }; KL9.pos[q] = { x: stagedAt[q].x, y: stagedAt[q].y }; if (seg.end && seg.end.pos && !seg.end.kickoff) seg.end.pos[q] = { x: stagedAt[q].x, y: stagedAt[q].y }; if (oldC.vel && seg.end && seg.end.vel && oldC.vel[q]) seg.end.vel[q] = oldC.vel[q]; return; }
        if (settled[q]) { KL9.pos[q] = { x: settled[q].x, y: settled[q].y }; if (seg.end && seg.end.pos && !seg.end.kickoff) seg.end.pos[q] = { x: settled[q].x, y: settled[q].y }; }
        if (oldC.vel && seg.end && seg.end.vel && oldC.vel[q]) seg.end.vel[q] = oldC.vel[q];
      });
      K.forEach(function (k9, j9) { if (oldC.kball && oldC.kball[j9]) k9.ball = oldC.kball[j9]; });
      if (seg.end && seg.end.ball && oldC.endBall) seg.end.ball = oldC.endBall;
      c.sig = sigOf(seg);
      if (SETTLED) SETTLED.set(seg, copyPos(KL9.pos));
    }
    TRACK.set(seg, c);
    return c;
  }

  /* a2 (helper M): THE LEGS. Everything above makes the picture the play WANTS at every 1/40 s: the man on the
   * ball on the director's curve, the man a pass is played to running onto it, everyone else drifting with the
   * shape. Here every man, all 22, runs it with a body: from where he is and at the velocity he has (carried
   * over from the last picture, so a man running when a picture changes keeps running), he chases where the
   * play wants him, never faster than his top speed (MV.legV off the ball, legBall with the ball at his feet,
   * legKeeper, legDiveV for a keeper diving at a shot) and never changing his velocity by more than MV.legA
   * m/s per second (a keeper's dive legDiveA). What a man cannot reach, he reaches late. The ball goes with
   * the men: at the feet of the man running with it, and a pass flies to where its man really is when it
   * arrives (the key frames' ball is moved by his lag, so the page's own flight draws the same). And the
   * picture the segment ENDS on is where the legs got everyone (unless the ball goes dead: the page cuts to the
   * restart), written back into the last key and seg.end, with the velocities (seg.end.vel), so the next
   * picture starts from exactly what was on the screen: nobody is left with a gap to run in after the play. */
  function legs(seg, c, RF, out, ids, who, feet, cutT8, V0) {
    var midK = midCut(seg), midDone = false;
    var K = seg.keys, B = seg.beats, h = c.h, n = c.n, dur = seg.duration, i;
    var bp = {}, bv = {}, body = [], carryOff = {}, diveFrom = {};
    /* the words name the nearest man of the other side to the man on the ball: in the last MV.legKeepT s nobody
     * else of that side comes within that distance (plus MV.legKeepM) of where the man on the ball ends, so the
     * picture the decision is read from keeps the man the words name the nearest */
    var KE2 = K[K.length - 1], lb2 = B[B.length - 1], keep = null;
    if (seg.start && seg.start.near && KE2.holder && lb2 && lb2.kind !== 'out' && lb2.kind !== 'foul') {
      var pl0 = KE2.pos0 || KE2.pos, cN = pl0[KE2.holder], nN = pl0[seg.start.near.id], tmN = who[seg.start.near.id] && who[seg.start.near.id].team;
      if (cN && nN && tmN) keep = { c: cN, r: P.dist(cN, nN) + MV.legKeepM, team: tmN, near: seg.start.near.id };
    }
    var clW = CLAIMS && CLAIMS.get(seg), liveW = lb2 && lb2.kind !== 'out' && lb2.kind !== 'foul';
    if (!liveW) clW = null;
    if (clW && clW.near) { var pl1 = KE2.pos0 || KE2.pos; if (pl1[clW.near.T] && pl1[clW.near.N]) keep = { c: pl1[clW.near.T], tgt: clW.near.T, r: P.dist(pl1[clW.near.T], pl1[clW.near.N]) + MV.legKeepM, team: clW.near.team, near: clW.near.N }; }
    /* the back line of the side without the ball wants one depth: in the wanted picture, each of its men (but the
     * one nearest the ball and the men the beat names) is kept within MV.legLineSpan/2 of the line's middle depth */
    if (!MV.noLine) for (i = 0; i <= n; i++) {
      var btw = RF[i].beat || {}, inPw = {}; [btw.from, btw.to, btw.past].forEach(function (x) { if (x) inPw[x] = 1; }); if (btw.pin) for (var pkw in btw.pin) inPw[pkw] = 1;
      if (btw.kind === 'out' || btw.kind === 'foul') continue;
      ['you', 'them'].forEach(function (tmw) {
        if (tmw === RF[i].poss) return;
        var Lw = ids.filter(function (q) { return who[q].team === tmw && who[q].line === 0 && !who[q].keeper && !inPw[q]; });
        if (Lw.length < 3) return;
        var blw = RF[i].ball; Lw.sort(function (a, b) { return P.dist(out[i][a], blw) - P.dist(out[i][b], blw); });
        Lw = Lw.slice(1); var ys = Lw.map(function (q) { return out[i][q].y; }).sort(function (a, b) { return a - b; }), mid = (ys[0] + ys[ys.length - 1]) / 2, hw = MV.legLineSpan / 2;
        if (ys[ys.length - 1] - ys[0] <= MV.legLineSpan) return;
        Lw.forEach(function (q) { var y0 = out[i][q].y; if (y0 < mid - hw || y0 > mid + hw) { out[i][q] = { x: out[i][q].x, y: Math.max(mid - hw, Math.min(mid + hw, y0)) }; } });
      });
    }
    ids.forEach(function (q) { bp[q] = { x: out[0][q].x, y: out[0][q].y }; bv[q] = V0 && V0[q] ? { x: V0[q].x, y: V0[q].y } : { x: 0, y: 0 }; });
    body.push(copyPos(bp));
    for (i = 1; i <= n; i++) {
      var t = Math.min(dur, i * h), hh = t - Math.min(dur, (i - 1) * h);   /* (the last sample can be short) */
      if (hh < 1e-6) { body.push(copyPos(bp)); continue; }
      if (midK && cutT8 != null && t >= cutT8 - 1e-6 && !midDone) {   /* the cut to a restart in the middle of the play: placed, still */
        midDone = true; body.push(out[i]); ids.forEach(function (q) { bp[q] = { x: out[i][q].x, y: out[i][q].y }; bv[q] = { x: 0, y: 0 }; });
        continue;
      }
      if (!midK && cutT8 != null && t >= cutT8 - 1e-6) {   /* the cut at the whistle: everyone stands in the free-kick picture */
        body.push(out[i]); ids.forEach(function (q) { bp[q] = { x: out[i][q].x, y: out[i][q].y }; bv[q] = { x: 0, y: 0 }; });
        continue;
      }
      var bt = RF[i].beat || null, dive = bt && (bt.kind === 'shot' || bt.kind === 'save');
      var row = {};
      /* a stride apart: men closer than MV.legGap step away from each other (not the men in a tackle, a foul, a
       * pass cut out, a save or a man gone past, nor the man on the ball with them) */
      var inC = {}, rep = {};
      if (bt && (bt.kind === 'tackle' || bt.kind === 'foul' || bt.kind === 'interception' || bt.kind === 'save')) [bt.from, bt.to, bt.past, RF[i].holder].forEach(function (x) { if (x) inC[x] = 1; });
      if (bt && bt.kMet) [bt.from, bt.kMet].forEach(function (x) { if (x) inC[x] = 1; });   /* (a3: the keeper who came out to meet the man on the ball holds his spot as the man goes past him) */
      var bi9n = bt ? B.indexOf(bt) : -1, shotSoon = bi9n >= 0 && B[bi9n + 1] && B[bi9n + 1].kind === 'shot' && K[bi9n + 1].t - t < 0.45 || false;
      function keepSet(x) { return !!(who[x].keeper && (shotSoon || (dive && !diveTo[x])) && Math.abs(RF[i].ball.y - (who[x].team === 'you' ? 0 : P.L)) < 35); }
      var pastTo = null;
      if (bt && bt.kind === 'dribble' && bt.past) { var kP = K[B.indexOf(bt) + 1]; pastTo = kP && ((kP.pos0 && kP.pos0[bt.past]) || kP.pos[bt.past]) || null; }
      var free = {}, diveTo = {};   /* a keeper diving at a shot goes where the ball is, whoever is there */
      if (dive) { var kD = K[B.indexOf(bt) + 1]; ids.forEach(function (q) { if (who[q].keeper) { free[q] = 1; var pD = kD && ((kD.pos0 && kD.pos0[q]) || kD.pos[q]); if (pD && bt.kind === 'shot') diveTo[q] = pD; } }); }
      /* a defender the words call late closes on the man on the ball (m8's rule): he is not held off him */
      var lateTo = {}; if (seg.late && seg.late.length) seg.late.forEach(function (q) { lateTo[q] = 1; });
      var onBall = feet[i] || RF[i].holder || (bt && bt.from);
      function held(x, y) { return (lateTo[x] && y === onBall) || (lateTo[y] && x === onBall); }
      var toMan = bt && bt.to && bt.holder === bt.to && PASSY[bt.kind] ? bt.to : null, endMan = i > n - Math.round(0.8 / h) ? K[K.length - 1].holder : null;
      function ballMan(x) { return feet[i] === x || RF[i].holder === x || x === toMan || x === endMan; }
      var deadB = !!(bt && (bt.kind === 'out' || bt.kind === 'foul'));
      ids.forEach(function (q) { rep[q] = { x: 0, y: 0 }; });
      var cmd = {};
      /* the back line of the side without the ball holds one depth (the one nearest the ball, and any man the
       * beat names, apart): each of its men is drawn toward the line's mean depth */
      var possL = RF[i].poss, inPlayL = {}, lineM = {};
      if (bt) { [bt.from, bt.to, bt.past].forEach(function (x) { if (x) inPlayL[x] = 1; }); if (bt.pin) for (var pkL in bt.pin) inPlayL[pkL] = 1; }
      if (!MV.noLine) ['you', 'them'].forEach(function (tmL) {
        if (tmL === possL) return;
        var L = ids.filter(function (q) { return who[q].team === tmL && who[q].line === 0 && !who[q].keeper && !inPlayL[q]; });
        if (L.length < 3) return;
        var bl = RF[i].ball; L.sort(function (a, b) { return P.dist(bp[a], bl) - P.dist(bp[b], bl); });
        L = L.slice(1); var my = 0; L.forEach(function (q) { my += bp[q].y; }); my /= L.length;
        L.forEach(function (q) { lineM[q] = my; });
      });
      for (var a1 = 0; a1 < ids.length; a1++) for (var b1 = a1 + 1; b1 < ids.length; b1++) {
        var qa = ids[a1], qb = ids[b1], pa = bp[qa], pb = bp[qb], ddx = pb.x - pa.x, ddy = pb.y - pa.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > 12 || (inC[qa] && inC[qb]) || free[qa] || free[qb] || held(qa, qb)) continue;
        /* where the two will be in MV.legLook s if they keep running: a man sees the other coming and steps aside in time */
        var fx = ddx + (bv[qb].x - bv[qa].x) * MV.legLook, fy = ddy + (bv[qb].y - bv[qa].y) * MV.legLook, fd = Math.sqrt(fx * fx + fy * fy);
        if (fd < dd && fd < MV.legGap) { ddx = (ddx + fx) / 2; ddy = (ddy + fy) / 2; dd = Math.min(dd, Math.max(fd, Math.sqrt(ddx * ddx + ddy * ddy))); }
        if (dd >= MV.legGap) continue;
        if (dd < 1e-6) { ddx = 1; ddy = 0; dd = 1; }
        var f1 = MV.legRep * (MV.legGap - dd) / MV.legGap, ux = ddx / dd, uy = ddy / dd;
        var ha = ballMan(qa) || keepSet(qa) || !!lateTo[qa], hb = ballMan(qb) || keepSet(qb) || !!lateTo[qb];   /* (and a man the words call late keeps his run: the other steps aside) */   /* (a keeper set for a shot holds his spot too) */   /* (the man on the ball, or the man it is on its way to, holds his line; the other steps aside) */
        var sa = ha ? 0 : hb ? 1 : 0.5, sb = hb ? 0 : ha ? 1 : 0.5;
        rep[qa].x -= ux * f1 * sa * 2; rep[qa].y -= uy * f1 * sa * 2; rep[qb].x += ux * f1 * sb * 2; rep[qb].y += uy * f1 * sb * 2;
      }
      ids.forEach(function (q) {
        var D1 = out[i][q], D0 = out[i - 1][q], w = who[q];
        /* the man running with the ball runs from where he really got it: the plan's run is shifted by how far he was
         * from its start, and the shift fades out over the run, so he ends it where the plan does if he can */
        if (feet[i] === q && bt) {
          var cf = carryOff[q];
          if (!cf || cf.b !== bt) { var bi9 = B.indexOf(bt); cf = carryOff[q] = { b: bt, x: bp[q].x - D0.x, y: bp[q].y - D0.y, t0: K[bi9].t, t1: K[bi9 + 1].t }; }
          var f0 = 1 - Math.max(0, Math.min(1, (t - hh - cf.t0) / Math.max(0.05, cf.t1 - cf.t0))), f1 = 1 - Math.max(0, Math.min(1, (t - cf.t0) / Math.max(0.05, cf.t1 - cf.t0)));
          D0 = { x: D0.x + cf.x * f0, y: D0.y + cf.y * f0 }; D1 = { x: D1.x + cf.x * f1, y: D1.y + cf.y * f1 };
        }
        var fvx = (D1.x - D0.x) / hh, fvy = (D1.y - D0.y) / hh;
        if (w.keeper && dive && diveTo[q]) {
          var dx9 = diveTo[q].x;
          /* a goal: from where he is when it is struck, he dives toward where the ball really passes him (the ball goes
           * with the men, so the plan's line may have moved): over a metre when it is further than that, and he ends a
           * little short of it */
          if (bt.kind === 'shot' && bt.note === 'goal') {
            var ia = B.indexOf(bt);
            if (!diveFrom[q] || diveFrom[q].b !== bt) {
              /* (the ball is struck where the shooter's legs got him, not where the plan had him: the ball goes with the men) */
              var sh9 = bt.from, pk9 = sh9 && K[ia].pos[sh9], ox9 = pk9 && bp[sh9] ? bp[sh9].x - pk9.x : 0, oy9 = pk9 && bp[sh9] ? bp[sh9].y - pk9.y : 0;
              diveFrom[q] = { b: bt, x: bp[q].x, y: bp[q].y, ox: ox9, oy: oy9 };
            }
            var f9 = diveFrom[q], A9 = K[ia].ball && { x: K[ia].ball.x + f9.ox, y: K[ia].ball.y + f9.oy }, Bb9 = K[ia + 1].ball;
            if (A9 && Bb9 && Math.abs(Bb9.y - A9.y) > 1e-6) {
              var lx9 = A9.x + (Bb9.x - A9.x) * (f9.y - A9.y) / (Bb9.y - A9.y), dl9 = lx9 - f9.x, ad9 = Math.abs(dl9);
              if (ad9 > 1.0) dx9 = lx9 - (dl9 > 0 ? 1 : -1) * Math.max(0.2, Math.min(0.8, ad9 - 1.1));
            }
          }
          D0 = { x: dx9, y: bp[q].y + Math.max(-0.5, Math.min(0.5, diveTo[q].y - bp[q].y)) }; fvx = 0; fvy = 0;   /* (a dive is across his line, where he is) */
          /* a3: a keeper left behind the man who shoots (he came out and was gone past) does not dive across a line
           * the ball never crosses: he turns and runs back toward his goal, after the ball */
          var fB = diveFrom[q], iaB = B.indexOf(bt), AB = K[iaB] && K[iaB].ball, BB = K[iaB + 1] && K[iaB + 1].ball;
          if (bt.kind === 'shot' && fB && AB && BB && Math.abs(BB.y - AB.y) > 1e-6 && (fB.y - AB.y - (fB.oy || 0)) * (BB.y - AB.y > 0 ? 1 : -1) < -2) D0 = { x: BB.x, y: BB.y };   /* (more than 2 m behind where it is struck) */
        }   /* (a keeper diving goes straight for the spot the shot needs him at) */
        else if (bt && bt.kind === 'dribble' && bt.past === q && pastTo) { D0 = pastTo; fvx = 0; fvy = 0; }   /* (the man gone past is left where the plan leaves him, behind the ball: he does not keep running goal-side of it) */
        else if (w.keeper && !dive && t > dur - 0.6 && Math.abs(RF[i].ball.y - (w.team === 'you' ? 0 : P.L)) < 30) { D0 = bp[q]; fvx = 0; fvy = 0; }
        else if (w.keeper && !dive && shotSoon && Math.abs(RF[i].ball.y - (w.team === 'you' ? 0 : P.L)) < 35) { D0 = bp[q]; fvx = 0; fvy = 0; }   /* (a keeper sets his feet just before a shot is struck, then dives) */   /* (with the ball near his goal a keeper is set, still, when the picture stops for a decision) */
        if (lineM[q] != null && !deadB) { D0 = { x: D0.x, y: D0.y + (lineM[q] - D0.y) * MV.legLineW }; }   /* (the line waits for its slowest man: its men aim part of the way to where the line really is) */
        var ex = D0.x - bp[q].x, ey = D0.y - bp[q].y, ed = Math.sqrt(ex * ex + ey * ey);
        var kd = w.keeper && dive, am = kd ? MV.legDiveA : deadB ? MV.legDeadA : w.keeper ? MV.legKeeperA : MV.legA;   /* (a keeper steps across his goal quicker than a man runs) */   /* (the ball dead: they pull up hard) */
        /* close the gap in about legTau, but never faster than he could still stop on the spot */
        var cm = ed > 1e-9 ? Math.min(ed / (kd ? MV.legTau / 3 : MV.legTau), Math.sqrt(2 * am * ed)) / ed : 0;   /* (a keeper's dive goes straight for its spot) */
        var vx = fvx + ex * cm + rep[q].x, vy = fvy + ey * cm + rep[q].y + (lineM[q] != null && !deadB ? (lineM[q] - bp[q].y) * MV.legLine : 0), vs = Math.sqrt(vx * vx + vy * vy);
        var top = w.keeper ? (kd ? MV.legDiveV : MV.legKeeper) : (feet[i] === q || RF[i].holder === q) ? MV.legBall : MV.legV;
        /* running back toward his own goal, a man off the ball is slower (m8's rule: a forward jogs back) */
        if (!w.keeper && !(feet[i] === q || RF[i].holder === q) && vs > 1e-6 && vy * (w.team === 'you' ? 1 : -1) < -0.5 * vs) top = Math.min(top, w.line === 2 ? MV.backFw : w.line === 1 ? MV.backMid : MV.backDef);
        if (vs > top) { vx *= top / vs; vy *= top / vs; }
        cmd[q] = { x: vx, y: vy, am: am, top: top };
      });
      /* two men never run into each other: they close the gap between them no faster than they could still stop
       * MV.legHard apart (braking at most of their legs' rate); the rest of the closing is taken out, shared (the
       * man on the ball keeps his line) */
      for (var a2 = 0; a2 < ids.length; a2++) for (var b2 = a2 + 1; b2 < ids.length; b2++) {
        var qa2 = ids[a2], qb2 = ids[b2], ux2 = bp[qb2].x - bp[qa2].x, uy2 = bp[qb2].y - bp[qa2].y, d22 = Math.sqrt(ux2 * ux2 + uy2 * uy2);
        if (d22 >= 14 || d22 < 1e-6 || (inC[qa2] && inC[qb2]) || free[qa2] || free[qb2] || held(qa2, qb2)) continue;
        ux2 /= d22; uy2 /= d22;
        var cmax = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, d22 - MV.legHard));
        var close = (cmd[qb2].x - cmd[qa2].x) * ux2 + (cmd[qb2].y - cmd[qa2].y) * uy2 + cmax;
        if (close >= 0) continue;
        var ha2 = ballMan(qa2) || !!lateTo[qa2], hb2 = ballMan(qb2) || !!lateTo[qb2];
        var sa2 = ha2 ? 0 : hb2 ? 1 : 0.5, sb2 = hb2 ? 0 : ha2 ? 1 : 0.5;
        cmd[qa2].x += ux2 * close * sa2; cmd[qa2].y += uy2 * close * sa2; cmd[qb2].x -= ux2 * close * sb2; cmd[qb2].y -= uy2 * close * sb2;
      }
      if (keep && keep.tgt && bp[keep.tgt]) keep.c = bp[keep.tgt];   /* (the ring goes with the man it is round) */
      if (keep && t > dur - MV.legKeepT) { var rK = Math.max(keep.r, bp[keep.near] ? P.dist(bp[keep.near], keep.c) + MV.legKeepM : 0); ids.forEach(function (q) {
        if (q === keep.near || q === keep.tgt || who[q].keeper || who[q].team !== keep.team) return;
        var kx = bp[q].x - keep.c.x, ky = bp[q].y - keep.c.y, kd = Math.sqrt(kx * kx + ky * ky);
        if (kd < 1e-6 || kd > keep.r + 12) return;
        kx /= kd; ky /= kd;
        var inw = -(cmd[q].x * kx + cmd[q].y * ky), allow = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, kd - rK));
        if (kd < rK) { cmd[q].x += kx * (rK - kd) * 2; cmd[q].y += ky * (rK - kd) * 2; }   /* (inside it: out, at once) */
        else if (inw > allow) { cmd[q].x += kx * (inw - allow); cmd[q].y += ky * (inw - allow); }
      }); }
      /* "the only one of your players on that wing in front of him": the others keep off that wing ahead of him */
      if (clW && clW.wing && bp[clW.wing.H] && t > dur - MV.legKeepT) {
        var hW = bp[clW.wing.H], lnW = P.laneOfX(hW.x);
        if (lnW !== 1) ids.forEach(function (q) {
          var w9 = who[q]; if (w9.team !== 'you' || w9.keeper || q === clW.wing.F || q === clW.wing.H) return;
          var e9 = bp[q]; if ((e9.y - hW.y) * clW.wing.dir <= -1 || P.dist(e9, hW) > 36) return;
          var bx = lnW === 0 ? 22 : 46, out9 = lnW === 0 ? 1 : -1, dx9 = (e9.x - bx) * out9;   /* dx9 > 0: off the wing */
          var need = 1.2 - dx9;
          if (need > 0) cmd[q].x += out9 * need * 2.5;
          else { var towards = -cmd[q].x * out9, allow9 = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, dx9 - 1.2)); if (towards > allow9) cmd[q].x += out9 * (towards - allow9); }
        });
      }
      /* "X is unmarked / free / alone": nobody of the other side within a stride and a half of him */
      if (clW && clW.free.length && t > dur - MV.legKeepT) clW.free.forEach(function (fr9) {
        var a9 = bp[fr9.id]; if (!a9) return;
        ids.forEach(function (q) {
          if (who[q].team === fr9.team) return;
          var ux = bp[q].x - a9.x, uy = bp[q].y - a9.y, ud = Math.sqrt(ux * ux + uy * uy), R9 = 4.5;
          if (ud < 1e-6 || ud > R9 + 12) return;
          ux /= ud; uy /= ud;
          var inw9 = -(cmd[q].x * ux + cmd[q].y * uy), allow8 = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, ud - R9));
          if (ud < R9) { cmd[q].x += ux * (R9 - ud) * 2; cmd[q].y += uy * (R9 - ud) * 2; }
          else if (inw9 > allow8) { cmd[q].x += ux * (inw9 - allow8); cmd[q].y += uy * (inw9 - allow8); }
        });
      });
      ids.forEach(function (q) {
        var vx = cmd[q].x, vy = cmd[q].y, am = cmd[q].am, vs2 = Math.sqrt(vx * vx + vy * vy);
        if (vs2 > cmd[q].top) { vx *= cmd[q].top / vs2; vy *= cmd[q].top / vs2; }   /* (the stepping aside never makes him faster than his legs) */
        /* the lines: he slows before a touchline or a goal line rather than hitting it */
        var wx0 = bp[q].x - 0.6, wx1 = P.W - 0.6 - bp[q].x, wy0 = bp[q].y - 0.6, wy1 = P.L - 0.6 - bp[q].y;
        if (vx < 0) vx = -Math.min(-vx, Math.sqrt(am * Math.max(0, wx0))); else vx = Math.min(vx, Math.sqrt(am * Math.max(0, wx1)));
        if (vy < 0) vy = -Math.min(-vy, Math.sqrt(am * Math.max(0, wy0))); else vy = Math.min(vy, Math.sqrt(am * Math.max(0, wy1)));
        var ax = vx - bv[q].x, ay = vy - bv[q].y, as = Math.sqrt(ax * ax + ay * ay), lim = am * hh;
        if (as > lim) { ax *= lim / as; ay *= lim / as; }
        bv[q] = { x: bv[q].x + ax, y: bv[q].y + ay };
        var nx = P.clamp(bp[q].x + bv[q].x * hh, 0.6, P.W - 0.6), ny = P.clamp(bp[q].y + bv[q].y * hh, 0.6, P.L - 0.6);
        if (nx !== bp[q].x + bv[q].x * hh) bv[q].x = (nx - bp[q].x) / hh;   /* (a touchline stops him) */
        if (ny !== bp[q].y + bv[q].y * hh) bv[q].y = (ny - bp[q].y) / hh;
        bp[q] = { x: nx, y: ny };
        row[q] = bp[q];
      });
      body.push(row);
    }
    /* the ball goes with the men: at each key frame, the man who has it is where his legs got him */
    K.forEach(function (k) { if (!k.pos0) k.pos0 = k.pos; });   /* (the plan's places, kept: the last key's are replaced below) */
    var offK = K.map(function (k, j) {
      if (j === 0) return { x: 0, y: 0 };
      var ix = Math.max(0, Math.min(n, Math.round(k.t / h))), hq = k.holder, pq = hq && k.pos0[hq];
      if (!hq || !body[ix][hq] || !pq) return { x: 0, y: 0 };
      if (!midK && cutT8 != null && k.t >= cutT8 - 1e-6) return { x: 0, y: 0 };
      if (midK && j === midK) return { x: 0, y: 0 };
      return { x: body[ix][hq].x - pq.x, y: body[ix][hq].y - pq.y };
    });
    var lb = B[B.length - 1], dead = !!(lb && (lb.kind === 'out' || lb.kind === 'foul'));
    if (dead) offK[K.length - 1] = { x: 0, y: 0 };   /* (the restart's ball is placed, by the cut) */
    K.forEach(function (k, j) {
      if (!k.ball0) k.ball0 = { x: k.ball.x, y: k.ball.y, z: k.ball.z || 0 };
      k.ball = { x: k.ball0.x + offK[j].x, y: k.ball0.y + offK[j].y, z: k.ball0.z || 0 };
    });
    /* kept small: one Float32Array for the whole segment (the page and the checks keep many segments alive) */
    var m9 = ids.length, buf = new Float32Array((n + 1) * m9 * 2), idx = {};
    ids.forEach(function (q, j) { idx[q] = j; });
    for (i = 0; i <= n; i++) { var row9 = body[i]; for (var j9 = 0; j9 < m9; j9++) { var r9 = row9[ids[j9]]; buf[(i * m9 + j9) * 2] = r9.x; buf[(i * m9 + j9) * 2 + 1] = r9.y; } }
    c.buf = buf; c.idx = idx; c.m = m9; c.frames = null; c.act = null; c.legs = true;
    if (MV.keepWant) { c.frames = body; c.feet = feet; }
    if (MV.keepWant) c.want = out;   /* (checks and probes only: the wanted picture, beside the legs') */
    c.lag = offK.reduce(function (a, o) { return Math.max(a, Math.sqrt(o.x * o.x + o.y * o.y)); }, 0);
    /* the end picture is the one on the screen (a dead ball's restart picture stays: the page cuts to it) */
    if (!dead && (cutT8 == null || midK)) {
      var KL = K[K.length - 1], np = copyPos(KL.pos), vel = {};
      ids.forEach(function (q) { np[q] = { x: bp[q].x, y: bp[q].y }; vel[q] = { x: bv[q].x, y: bv[q].y }; });
      KL.pos = np;
      if (SETTLED) SETTLED.set(seg, copyPos(np));
      if (seg.end && seg.end.pos && !seg.end.kickoff) {
        ids.forEach(function (q) { seg.end.pos[q] = { x: bp[q].x, y: bp[q].y }; });
        seg.end.vel = vel;
        if (seg.end.ball) seg.end.ball = { x: KL.ball.x, y: KL.ball.y, z: seg.end.ball.z || 0 };
      }
    }
    c.kball = K.map(function (k) { return k.ball; }); c.endBall = seg.end && seg.end.ball; c.vel = seg.end && seg.end.vel;
    c.sig = sigOf(seg);
  }
  /* a2 (helper M): THE WORDS' CLAIMS ON THE PICTURE. The scene the decision is read from says things the picture
   * must show: "X is the nearest of their players to him", "X, your full-back, is the only one of your players on
   * that wing in front of him", "X is unmarked / free / alone". why1's and r3's staging make the PLANNED end
   * picture say them (called here, before the legs), and the legs keep them: the men they concern run for their
   * places in time, everyone else of the side stays out of the ring or the wing the words forbid in the last
   * MV.legKeepT s, and the play waits (settle) while a claim does not hold. The page's own staging afterwards then
   * finds nothing to move. */
  var CLAIMS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function stageLibs() {
    var ws = root.KMWhyStage, r3 = root.KMR3Stage;
    try { if (!ws && typeof require === 'function') ws = require('./whystage.js'); if (!r3 && typeof require === 'function') r3 = require('./r3stage.js'); } catch (e) { }
    return { WS: ws || null, R3: r3 || null };
  }
  var FREE_RE = /([A-Z][^ .,:;]*) (?:is unmarked|is free\b|is alone|is on his own|has the ball, and nobody has gone with)|nobody has gone with ([A-Z][^ .,:;]*)/g;
  function prepClaims(st, pend, seg) {
    if (!CLAIMS || !pend || !seg || !seg.end || !seg.end.pos) return;
    var L = stageLibs(), cl = { near: null, wing: null, free: [] };
    try { if (L.WS) L.WS.apply(st, pend, seg); if (L.R3) L.R3.apply(st, pend, seg); } catch (e) { }
    if (L.R3) {
      var nc = L.R3.nearClaim(st, pend), wc = L.R3.wingClaim(st, pend);
      if (nc && seg.end.pos[nc.N.id] && seg.end.pos[nc.target.id]) cl.near = { N: nc.N.id, T: nc.target.id, team: nc.team };
      if (wc && seg.end.pos[wc.front.id] && seg.end.pos[wc.holderId]) cl.wing = { F: wc.front.id, H: wc.holderId, dir: P.teamOf(st, P.byId(st, wc.holderId)) === 'them' ? -1 : 1 };
    }
    var txt = String((pend.moment && pend.moment.text) || ''), m;
    if (!/\bfree kick\b/i.test(txt)) { FREE_RE.lastIndex = 0; while ((m = FREE_RE.exec(txt))) { var man = P.byFirst(st, m[1] || m[2], null); if (man && seg.end.pos[man.id]) cl.free.push({ id: man.id, team: P.teamOf(st, man) }); } }
    /* kmtree5 a3 (helper C): the keeper's short pass says how far their nearest man stands from its receiver: the play
     * waits (within MV.legWaitClaims) until he is there */
    if (C3 && C3BRK !== 'gap') (pend.moment.options || []).forEach(function (o) { if (o.id === 'KEEPER_SHORT' && o.pressGap != null && o.to && seg.end.pos[o.to.id]) cl.gap = { R: o.to.id, gap: o.pressGap, team: P.teamOf(st, o.to) === 'you' ? 'them' : 'you' }; });
    /* and their Sweeper keeper is out of his box before the long shot is read (Z_SHOOT_FAR's +3) */
    if (C3 && C3BRK !== 'keeperin') (pend.moment.options || []).forEach(function (o) { if (o.id === 'Z_SHOOT_FAR' && !o.hide && o.cStage && o.cStage.keeperOut && seg.end.pos[o.cStage.keeperOut]) cl.kout = { K: o.cStage.keeperOut, dir: P.teamOf(st, P.byId(st, o.cStage.keeperOut)) === 'them' ? 1 : -1 }; });
    /* and a long shot on the menu is read with the shooter where its card says (within 4 m of its metres) */
    if (C3 && C3BRK !== 'shotspot') (pend.moment.options || []).forEach(function (o) { if ((o.id === 'Z_SHOOT_FAR' || o.id === 'Z_SHOOT_EDGE') && !o.hide && o.actor && o.cStage && o.cStage.shotMetres && seg.end.pos[o.actor.id] && !cl.shot) cl.shot = { H: o.actor.id, m: o.cStage.shotMetres, g: P.teamOf(st, o.actor) === 'them' ? { x: 34, y: 0 } : { x: 34, y: P.L } }; });
    /* and the pass back with its +3 has its receiver behind the man on the ball */
    if (C3 && C3BRK !== 'backalways') (pend.moment.options || []).forEach(function (o) { if (o.id === 'Z_RECYCLE' && !o.hide && o.to && o.actor && o.cStage && o.cStage.back && seg.end.pos[o.to.id] && seg.end.pos[o.actor.id]) cl.back = { R: o.to.id, H: o.actor.id, dir: P.teamOf(st, o.actor) === 'them' ? -1 : 1 }; });
    /* and the through ball's runner waits on his defender's shoulder, not past him */
    if (C3 && C3BRK !== 'runner') (pend.moment.options || []).forEach(function (o) { if (o.id === 'Z_RUN_BEHIND' && !o.disabled && o.cStage && seg.end.pos[o.cStage.through] && seg.end.pos[o.cStage.past]) cl.onside = { R: o.cStage.through, D: o.cStage.past, dir: P.teamOf(st, P.byId(st, o.cStage.through)) === 'them' ? -1 : 1 }; });
    cl.st = st; cl.pend = pend;
    CLAIMS.set(seg, cl);
  }
  /* the zone words use for where the ball is: in either box, within 25 m of either goal line, or neither */
  function zoneOf(b) { var inX = b.x >= 13.84 && b.x <= 54.16; if (b.y >= P.L - 16.5 && inX) return 'boxT'; if (b.y <= 16.5 && inX) return 'boxB'; if (b.y >= P.L - 25) return 'edgeT'; if (b.y <= 25) return 'edgeB'; return 'out'; }
  /* the stagers' own judgement, on a copy: would why1 or r3 move anyone in this end picture? */
  function stagersQuiet(cl, E, ball) {
    var L = stageLibs(); if (!cl || !cl.st || !cl.pend) return true;
    var pos = {}, kp = {}; for (var q in E) if (E[q]) { pos[q] = { x: E[q].x, y: E[q].y }; kp[q] = pos[q]; }
    var fake = { end: { pos: pos, ball: ball }, keys: [{ pos: kp }] }, moved = false;
    try {
      var w = L.WS ? L.WS.apply(cl.st, cl.pend, fake) : null, r = L.R3 ? L.R3.apply(cl.st, cl.pend, fake) : null;
      if (w && w.moved && w.moved.length) moved = true;
      if (r && (r.near === 'moved' || r.wing === 'moved')) moved = true;
    } catch (e) { }
    return !moved;
  }
  /* does the picture E (id -> {x, y}) keep the words' claims? who[] gives the teams */
  function claimsHold(cl, E, who) {
    if (!cl) return true;
    if (cl.near && E[cl.N] && E[cl.T]) {
      var dN = P.dist(E[cl.N], E[cl.T]);
      for (var q in E) { var w = who[q]; if (!w || q === cl.N || q === cl.T || w.team !== cl.near.team) continue; if (P.dist(E[q], E[cl.T]) < dN + 0.8) return false; }   /* (0.8: r3's own margin, 0.6, and a little: so the page's staging then finds nothing to move) */
    }
    if (cl.wing && E[cl.wing.H]) {
      var hq = E[cl.wing.H], ln = P.laneOfX(hq.x);
      if (ln !== 1) for (var q2 in E) { var w2 = who[q2]; if (!w2 || w2.team !== 'you' || w2.keeper || q2 === cl.wing.F) continue; var e2 = E[q2]; if (P.laneOfX(e2.x) === ln && (e2.y - hq.y) * cl.wing.dir > 0 && P.dist(e2, hq) < 30) return false; }
    }
    if (cl.shot && E[cl.shot.H] && Math.abs(P.dist(E[cl.shot.H], cl.shot.g) - cl.shot.m) > 4) return false;
    if (cl.back && E[cl.back.R] && E[cl.back.H] && (E[cl.back.R].y - E[cl.back.H].y) * cl.back.dir > -2) return false;
    if (cl.kout && E[cl.kout.K] && (cl.kout.dir > 0 ? E[cl.kout.K].y > P.L - 17 : E[cl.kout.K].y < 17)) return false;
    if (cl.onside && E[cl.onside.R] && E[cl.onside.D] && (E[cl.onside.R].y - E[cl.onside.D].y) * cl.onside.dir > 0.5) return false;
    if (cl.gap && E[cl.gap.R]) { var ng = 99; for (var qg in E) { var wg = who[qg]; if (wg && wg.team === cl.gap.team && !wg.keeper && E[qg]) ng = Math.min(ng, P.dist(E[qg], E[cl.gap.R])); } if (ng > cl.gap.gap + 1.5 || ng < cl.gap.gap - 1) return false; }
    for (var f = 0; f < cl.free.length; f++) { var fr = cl.free[f], a = E[fr.id]; if (!a) continue; for (var q3 in E) { var w3 = who[q3]; if (w3 && w3.team !== fr.team && P.dist(E[q3], a) < 3.2) return false; } }
    return true;
  }
  /* a2: where the legs have a man at sample i of a track ({x, y}, or null) */
  function posAt(c, i, id) {
    if (!c.buf) return c.frames && c.frames[i] ? c.frames[i][id] || null : null;
    var j = c.idx[id]; if (j == null) return null;
    var o = (i * c.m + j) * 2; return { x: c.buf[o], y: c.buf[o + 1] };
  }
  /* a2: make a segment's pictures final (the legs' end picture): the page and the words can read seg.end at once.
   * AND THE PLAY WAITS FOR THE MAN THE NEXT DECISION IS ABOUT: when he is not on the ball's spot on his legs at
   * the end (more than MV.legLagOk from the plan's place), the last beat takes longer, by about what his legs
   * need (MV.legWaitEnd s at most in all), and the legs are run again (up to 6 times). Earlier in the play the
   * ball simply goes where its men are (legs(): the key frames' ball follows the man who has it). Only here, when the segment is made: a later
   * re-run (why1's or r3's staging moving a man in the end picture) never changes a time the page has read. */
  function settle(seg) {
    if (!moveOn()) return seg;
    for (var it = 0; it < 16; it++) {
      var c = track(seg); if (!c || !c.legs) break;
      var K = seg.keys, B = seg.beats, fix = -1, add = 0;
      /* A SHOT OR A HEADER IS STRUCK WHERE THE CARD AND ITS ARROW PUT IT (review of the movement, item 3: "Leon
       * crosses it for Ross to head" drawn as a header 22 m out, because the cross flew to where Ross's legs had got
       * him): the man who strikes it is on the plan's spot when the ball reaches him; the ball waits for him
       * (MV.legWaitShot s at most in a segment) */
      if (!BRK.noshotwait) for (var ks = 1; ks < K.length - 1 && fix < 0; ks++) {
        var bS9 = B[ks], hS = K[ks].holder;
        if (!bS9 || bS9.kind !== 'shot' || !hS || bS9.from !== hS || (seg.waitedShot || 0) >= MV.legWaitShot) continue;
        var ixS9 = Math.min(c.n, Math.round(K[ks].t / c.h)), bq9 = posAt(c, ixS9, hS), pq9 = K[ks].pos0 && K[ks].pos0[hS];
        if (!bq9 || !pq9) continue;
        var lagS = P.dist(bq9, pq9);
        if (lagS > MV.legLagOk) { fix = ks; add = Math.min(MV.legWaitShot - (seg.waitedShot || 0), legTime(lagS) * 0.8 + 0.1); seg.waitedShot = (seg.waitedShot || 0) + add; }
      }
      /* A FREE KICK IS TAKEN WHERE THE FOUL IS DRAWN (review of the movement, item 7): when the play ends with a foul
       * (the page cuts to the free-kick picture at the whistle), the man fouled is on the plan's spot when it happens:
       * the beat that brings him there waits for his legs (within the same MV.legWaitEnd) */
      var lbF = B[B.length - 1], kc = B.length - 1;
      if (fix < 0 && !BRK.nowait && !BRK.nowait2 && lbF && lbF.kind === 'foul' && lbF.note !== 'offside' && kc >= 1 && K[kc].holder && (seg.waitedFoul || 0) < MV.legWaitFoul) {
        var kW = kc, hF = K[kc].holder, cB = B[kc - 1];
        /* (a run with the ball before the foul: first the pass that gave it to him waits, so he starts the run on the plan) */
        if (cB && (cB.kind === 'carry' || cB.kind === 'dribble') && cB.from === hF && kc >= 2 && K[kc - 1].holder === hF && B[kc - 2] && PASSY[B[kc - 2].kind]) {
          var ixP = Math.min(c.n, Math.round(K[kc - 1].t / c.h)), bP = posAt(c, ixP, hF), pP = K[kc - 1].pos0 && K[kc - 1].pos0[hF];
          if (bP && pP && P.dist(bP, pP) > MV.legLagOk) kW = kc - 1;
        }
        var ixF = Math.min(c.n, Math.round(K[kW].t / c.h)) - (kW === kc ? 1 : 0), bF = posAt(c, Math.max(0, ixF), hF), pF = K[kW].pos0 && K[kW].pos0[hF];
        if (bF && pF && P.dist(bF, pF) > MV.legLagOk) { fix = kW; add = Math.min(MV.legWaitFoul - (seg.waitedFoul || 0), legTime(P.dist(bF, pF)) * 0.8 + 0.1); seg.waitedFoul = (seg.waitedFoul || 0) + add; }
      }
      if (fix >= 0) { shiftFrom(fix, add); continue; }
      /* (when the play ends with him running with the ball, it is the pass that gave it to him that waits: he then
       * runs his carry from the plan's spot) */
      var kFirst = K.length - 1, lbS = B[B.length - 1];
      if (lbS && (lbS.kind === 'carry' || lbS.kind === 'dribble') && K.length > 2 && K[K.length - 2].holder === lbS.from && B[B.length - 2] && PASSY[B[B.length - 2].kind]) {
        var ixS = Math.min(c.n, Math.round(K[K.length - 2].t / c.h)), bS = posAt(c, ixS, lbS.from), pS = K[K.length - 2].pos0 && K[K.length - 2].pos0[lbS.from];
        if (bS && pS && P.dist(bS, pS) > MV.legLagOk) kFirst = K.length - 2;
      }
      for (var k = kFirst; k < K.length; k++) {   /* (only at the end: the man the next decision is about must be on the ball the engine names; before that, the ball goes where its men are) */
        var b = B[k - 1], hq = K[k].holder;
        if (!hq || !b || b.kind === 'out' || b.kind === 'foul') continue;   /* (a shot with a man on it at the end: a header knocked down to him) */
        var ix = Math.min(c.n, Math.round(K[k].t / c.h)), bq = posAt(c, ix, hq), pq = K[k].pos0 && K[k].pos0[hq];
        if (!bq || !pq) continue;
        /* he ran past his place, toward the goal he attacks, with the ball at his feet: the run takes a little longer, so
         * he can pull up and come back to it (MV.legWaitOver s at most; a1 would have drawn him there at once) */
        var wH = SEGST.get(seg) && SEGST.get(seg)[hq], dirH = wH && wH.team === 'them' ? -1 : 1;
        if (k === K.length - 1 && (b.kind === 'carry' || b.kind === 'dribble') && (bq.y - pq.y) * dirH > MV.legLagOk && (seg.waitedOver || 0) < MV.legWaitOver) {
          fix = k; add = Math.min(MV.legWaitOver - (seg.waitedOver || 0), 0.5); seg.waitedOver = (seg.waitedOver || 0) + add; break;
        }
        if ((seg.waited || 0) - (seg.waitedClaims || 0) >= MV.legWaitEnd) continue;
        var lag = P.dist(bq, pq);
        /* and nobody of the other side nearer the man on the ball than the man the words name as the nearest */
        var Sx = seg.start, nm = Sx && Sx.near ? Sx.near.id : null, cx9 = Sx && Sx.crossTo ? Sx.crossTo.id : null;
        if (nm && bq && k === K.length - 1) {
          var dn = posAt(c, ix, nm), tmn = SEGST.get(seg) && SEGST.get(seg)[nm] ? SEGST.get(seg)[nm].team : null;
          if (dn && tmn) { var dN = P.dist(dn, bq); for (var qq in c.idx) { var wq = SEGST.get(seg)[qq]; if (!wq || qq === nm || wq.keeper || wq.team !== tmn) continue; var bo = posAt(c, ix, qq); if (bo && P.dist(bo, bq) < dN + 0.5) lag = Math.max(lag, 2 * MV.legLagOk); } }
        }
        var cl9 = CLAIMS && CLAIMS.get(seg), E9 = {}, W9 = SEGST.get(seg) || {}, forClaim = false;
        var wcl9 = MV.legWaitClaims + (cl9 && (cl9.onside || cl9.back) ? 1.3 : 0);   /* (kmtree5 a3, helper C: a through ball's runner, or a pass back's receiver, may take 1.3 s more to get where the card needs him) */
        if (k === K.length - 1 && lag <= MV.legLagOk && cl9 && (seg.waitedClaims || 0) < wcl9) { for (var q9 in c.idx) E9[q9] = posAt(c, ix, q9); if (!claimsHold(cl9, E9, W9) || !stagersQuiet(cl9, E9, K[k].ball)) { lag = 2 * MV.legLagOk; forClaim = true; } }
        if (lag > MV.legLagOk) { fix = k; add = Math.min(MV.legWaitEnd - ((seg.waited || 0) - (seg.waitedClaims || 0)), forClaim ? wcl9 - (seg.waitedClaims || 0) : 9, legTime(lag) * 0.8 + 0.1); if (forClaim) seg.waitedClaims = (seg.waitedClaims || 0) + add; break; }
      }
      if (typeof process !== 'undefined' && process.env && process.env.KM_CLAIMDBG && it >= 0) {
        var clD = CLAIMS && CLAIMS.get(seg); if (clD && clD.near) { var ixD = c.n, ED = {}; for (var qD in c.idx) ED[qD] = posAt(c, ixD, qD);
          if (!claimsHold(clD, ED, SEGST.get(seg))) console.log('CLAIMDBG it', it, 'fix', fix, 'waited', (seg.waited || 0).toFixed(2), 'N', clD.near.N, 'dN', P.dist(ED[clD.near.N], ED[clD.near.T]).toFixed(1), 'plan dN', P.dist(K[K.length-1].pos0[clD.near.N], K[K.length-1].pos0[clD.near.T]).toFixed(1), Object.keys(ED).filter(function (q) { var w = SEGST.get(seg)[q]; return w && w.team === clD.near.team && !w.keeper && q !== clD.near.N; }).map(function (q) { return q + ' ' + P.dist(ED[q], ED[clD.near.T]).toFixed(1) + ' plan ' + P.dist(K[K.length-1].pos0[q], K[K.length-1].pos0[clD.near.T]).toFixed(1); }).filter(function (x) { return +x.split(' ')[1] < 14; }).join(', ')); }
      }
      if (fix < 0 || BRK.nowait) break;
      shiftFrom(fix, add);
      seg.waited = (seg.waited || 0) + add;
    }
    function shiftFrom(fx, ad) {
      var K2 = seg.keys;
      seg.beats[fx - 1].dur += ad;
      for (var j = fx; j < K2.length; j++) K2[j].t += ad;
      seg.duration += ad;
      if (seg.events) seg.events.forEach(function (e, i) { if (i >= fx) e.t = +(e.t + ad).toFixed(3); });
      var KL = K2[K2.length - 1]; if (KL.pos0) KL.pos = KL.pos0;   /* (the plan's end picture again: the legs make the new one) */
      TRACK.delete(seg); if (SETTLED) SETTLED.delete(seg);
    }
    return seg;
  }

  /* the picture at time t, with the movement layer */
  function frameAt(seg, t) {
    if (m8On() && seg && t < seg.duration && t > seg.duration - 1e-9) t = seg.duration;   /* m8: the end is the end (a clock a hair short of it must not read the track's last sample) */
    if (A2 && moveOn() && seg && seg.keys && seg.keys.length > 1) track(seg);   /* a2: settled first, so even the end picture is the legs' */
    var fr = rawFrameAt(seg, t);
    if (fr.done || t <= 0 || !moveOn()) return fr;
    var tr = track(seg);
    if (!tr) return fr;
    var cT = cutAt(seg);
    var mK = midCut(seg);
    if (cT != null && t >= cT && !mK) { fr.pos = seg.keys[seg.keys.length - 1].pos; fr.cut = true; return fr; }   /* m8: after the cut at the whistle, the free-kick picture */
    if (cT != null && t >= cT && mK) fr.cut = true;   /* a2: the cut to a restart in the middle of the play (the page cuts once) */
    /* sample i is at time min(duration, i * h): the last one is AT the end */
    var i0 = Math.min(tr.n - 1, Math.floor(t / tr.h)), i1 = i0 + 1, ta = i0 * tr.h, tb = Math.min(seg.duration, i1 * tr.h);
    var u = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 1;
    if (cT != null && tb >= cT - 1e-9 && !(mK && t >= cT)) u = 0;   /* (m8: never blend toward the sample after the cut) */
    if (mK && cT != null && t >= cT && ta < cT - 1e-9) u = 1;   /* (a2: past a cut in the middle of a play: the restart picture, never a blend across it) */
    var A = tr.buf ? null : tr.frames[i0], B = tr.buf ? null : tr.frames[i1], pos = {};
    for (var id in fr.pos) {
      var a = tr.buf ? posAt(tr, i0, id) : A[id], b = tr.buf ? posAt(tr, i1, id) : B[id];
      if (!a || !b) { pos[id] = fr.pos[id]; continue; }
      /* the men fully in the play stay on the director's exact curve (the ball at the carrier's feet) */
      var w = tr.legs ? 0 : Math.min(tr.act[id] ? tr.act[id][i0] : 0, tr.act[id] ? tr.act[id][i1] : 0);   /* (a2: everyone on his legs) */
      pos[id] = w >= 0.999 ? fr.pos[id] : { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    fr.pos = pos;
    /* a2: the ball at the feet of the man running with it, where his legs have him */
    var bt2 = fr.beat;
    if (tr.legs && bt2 && (bt2.kind === 'carry' || bt2.kind === 'dribble') && bt2.from && pos[bt2.from]) {
      var dy2 = bt2.poss === 'you' ? 1 : -1;
      fr.ball = { x: pos[bt2.from].x, y: pos[bt2.from].y + dy2 * P.BALL_OFF, z: 0 };
    }
    return fr;
  }

  /* ------------------------------------------------------------ words */
  /* d1: one plain line for each event, for the commentator during play */
  /* a2 (helper T): THE WORDS FOLLOW THE PICTURE. The page and the checks call segment and resolve through these
   * two (the API exports them): they call the director's own, unchanged, then (1) note for every event of the
   * segment where its frames are, so lineOf can say what the event looks like (a "back pass" that the picture
   * draws going forward is said as the pass it is), and (2) fit the words of the menu read over the picture
   * that segment ends on (phrases.js fitMenu: a "short" pass to a man 21 m away is not called short). They read
   * the picture and change words only: no position, no time, nothing in the match. */
  var WORDS = typeof WeakMap === 'function' ? new WeakMap() : null;
  function PHS() { return root.KMPhrases || (typeof require === 'function' ? require('./phrases.js') : null); }
  function noteBeats(seg) { if (WORDS && seg && seg.beats) seg.beats.forEach(function (b, i) { if (b && typeof b === 'object') WORDS.set(b, { seg: seg, i: i }); }); }
  function endPic(seg) { var k = seg && seg.keys && seg.keys[seg.keys.length - 1]; return k ? { ball: k.ball, holder: k.holder, pos: k.pos, poss: k.poss } : null; }
  function wordsSegment(st, pending, from) {
    var seg = segment(st, pending, from);
    noteBeats(seg);
    if (PHS() && PHS().fitMenu) PHS().fitMenu(st, pending, endPic(seg));
    return seg;
  }
  function wordsResolve(st, p, o, ev, nx, from) {
    /* the director stages a result from its own words (outcomeOf, beatenIn, lostWin, scorerIn): when phrases.js
     * put a card's result in plain words, it is handed the words the engine wrote (kept on the outcome as _orig) */
    var ev0 = ev;
    if (ev && o && o.outcomes) {
      var tx = String(ev.text || ''), pre = (/^(GOAL\. |THEY SCORE\. )/.exec(tx) || [''])[0], body = tx.slice(pre.length);
      o.outcomes.forEach(function (x) { if (x && x._orig && x.text === body && x._orig !== body) ev0 = Object.assign({}, ev, { text: pre + x._orig }); });
    }
    var rs = resolve(st, p, o, ev0, nx, from);
    noteBeats(rs);
    if (PHS() && PHS().fitResult) PHS().fitResult(st, ev, rs, nx);
    if (nx && nx.continues && PHS() && PHS().fitMenu) PHS().fitMenu(st, nx, endPic(rs));
    return rs;
  }
  /* where an event's ball starts and ends on the picture (null when the event was not made here) */
  function evGeo(b) {
    var w = WORDS && WORDS.get(b);
    if (!w || !w.seg.keys || !w.seg.keys[w.i + 1]) return null;
    var k0 = w.seg.keys[w.i], k1 = w.seg.keys[w.i + 1], ph = PHS();
    if (!ph) return null;
    var ds = ph.describe(k0.ball, k1.ball, b.team === 'them' ? 'them' : 'you');
    ds.k0 = k0; ds.k1 = k1;
    return ds;
  }
  function lineOf(st, b) {
    /* a2 (helper T): the words of an event follow what the picture draws (lineOf0 is the sentence by kind) */
    var g = evGeo(b), t = lineOf0(st, b);
    if (!g || PHRASE_OFF()) return t;
    var a = b.from ? P.byId(st, b.from) : null, r = b.to ? P.byId(st, b.to) : null, an = first(a), rn = first(r);
    if (b.kind === 'pass' && r) {
      var ph = PHS(), note = b.note;
      /* the one way a pass is named (phrases.js geoVerb), for every pass that is not a restart, a cross, a header,
       * a pass and return, or a ball over their defence (second pass: the review of night a2) */
      var KEEP = { 'throw-in': 1, 'goal kick': 1, 'free kick': 1, 'keeper throw': 1, 'corner kick': 1, 'header': 1, 'over the top': 1, 'cross': 1 };
      if (note === 'over the top' && g.gain < 10) KEEP['over the top'] = 0;   /* "over their defence" only for a ball that goes 10 m or more forward */
      /* a cross comes from a wing; from the middle it is a ball into the box when it lands inside the box's width */
      var inW = g.k1.ball.x >= 13.84 && g.k1.ball.x <= 54.16;
      if (note === 'cross' && g.laneA === 1) return inW ? an + ' plays it into the box towards ' + rn + '.' : an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      if (note === 'cross' && !inW) return an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      if (!KEEP[note]) return g.d < 3 ? an + ' gives it to ' + rn + '.' : an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      return t;
    }
    if (b.kind === 'carry' && g.d < PHS().T.CARRY) return an + ' keeps the ball.';
    /* "goes past Y": at the end Y is no longer between the ball and the goal; otherwise he runs at Y */
    if (b.kind === 'dribble' && b.past && g.k1.pos && g.k1.pos[b.past] && (g.k1.pos[b.past].y - g.k1.ball.y) * (b.team === 'them' ? -1 : 1) > 0.5) return an + ' runs at ' + first(P.byId(st, b.past)) + ' with the ball.';
    if (b.kind === 'dribble' && !b.past && (g.d < PHS().T.CARRY || g.gain <= 0)) return g.d < PHS().T.CARRY ? an + ' keeps the ball.' : an + ' runs with the ball.';
    return t;
  }
  function PHRASE_OFF() { var b = typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK; return b === 'nofit' || b === 'noline'; }
  function lineOf0(st, b) {
    var a = b.from ? P.byId(st, b.from) : null, t = b.to ? P.byId(st, b.to) : null;
    var an = first(a), tn = first(t);
    var side = function (tm) { return tm === 'you' ? 'your' : 'their'; };
    var opp = function (tm) { return tm === 'you' ? 'their' : 'your'; };
    switch (b.kind) {
      case 'kickoff': return 'Kick-off. ' + an + ' plays it to ' + tn + '.';
      case 'pass':
        if (!t) return an + ' kicks it towards ' + (b.poss === b.team ? 'a team-mate' : 'nobody') + '.';
        switch (b.note) {
          case 'throw-in': return an + ' takes the throw-in, to ' + tn + '.';
          case 'goal kick': return an + ' takes the goal kick, to ' + tn + '.';
          case 'free kick': return an + ' takes the free kick, to ' + tn + '.';
          case 'keeper throw': return an + ' throws it out to ' + tn + '.';
          case 'corner kick': return an + ' takes the corner.';
          case 'cross': return an + ' crosses it towards ' + tn + '.';
          case 'over the top': return an + ' plays it over ' + opp(b.team) + ' defence for ' + tn + '.';
          case 'switch of play': return an + ' hits it across the pitch to ' + tn + '.';
          case 'one-two': return an + ' and ' + tn + ' play a one-two.';
          case 'back pass': return an + ' passes it back to ' + tn + '.';
          case 'through ball': return an + ' passes it through to ' + tn + '.';
          case 'cut-back': return an + ' pulls it back to ' + tn + '.';
          case 'header': return an + ' heads it down to ' + tn + '.';
          case 'long ball': case 'in the air': return an + ' plays a long ball to ' + tn + '.';
          default: return an + ' passes to ' + tn + '.';
        }
      case 'carry': return an + ' runs with the ball.';
      case 'dribble': {
        var pm = b.past ? first(P.byId(st, b.past)) : null;
        return pm ? an + ' goes past ' + pm + ' with the ball.' : an + ' runs at ' + (P.teamOf(st, a) === 'them' ? 'your' : 'their') + ' defence with the ball.';
      }
      case 'tackle': return tn + ' takes the ball from ' + an + '.';
      case 'interception': return b.note === 'header' ? tn + ' wins the header.' : tn + ' cuts out the pass from ' + an + '.';
      case 'clearance':
        if (b.note === 'out for a corner') return an + ' puts it behind his own goal line.';
        return an + (b.note === 'header' ? ' heads it away.' : ' kicks it away.');
      case 'shot':
        if (b.note === 'blocked') return an + ' shoots, and it is blocked.';
        if (b.note === 'header') return an + ' heads it at goal.';
        if (b.note === 'wide') return an + ' shoots wide.';
        if (b.note === 'over the bar') return an + (b.head ? ' heads it over the bar.' : ' shoots over the bar.');
        if (b.note === 'goal') return an + ' shoots.';
        return an + ' shoots.';
      case 'save':
        if (b.note === 'parried') return an + ' pushes it out.';
        if (b.note === 'catch' || b.note === 'collects') return tn + ' catches it.';
        return tn + ' has the ball.';
      case 'out':
        if (b.note === 'corner') return 'Corner to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        if (b.note === 'throw-in') return 'Out of play: a throw-in to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        if (b.note === 'goal kick') return 'Out of play: a goal kick to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        return 'The ball goes out of play.';
      case 'foul':
        if (b.note === 'offside') return an + ' is offside. Free kick to ' + (b.team === 'you' ? 'them' : 'your team') + '.';
        return an + ' fouls ' + tn + '. Free kick to ' + (b.team === 'you' ? 'them' : 'your team') + '.';
      default: return '';
    }
  }

  var API = {
    TARGET: TARGET, LONG_PLAN: LONG_PLAN, MAX_PLAY: MAX_PLAY, playLength: playLength, mulberry: mulberry, seedOf: seedOf,
    kickoffState: kickoffState, segment: wordsSegment, resolve: wordsResolve, frameAt: frameAt, keyPos: keyPos,   /* a2 (helper T): the words follow the picture, see WORDS below */
    /* d1 */
    lineOf: lineOf, outcomeOf: outcomeOf, beatenIn: beatenIn, LEADS: LEADS, GUARD: GUARD,
    /* m3 */
    lostWin: lostWin,
    /* mv1 */
    rawFrameAt: rawFrameAt, track: track, MV: MV, posAt: posAt,
    /* m8 */
    stopEnd: stopEnd, cutAt: cutAt,
    /* a2 */
    settle: settle, BRK: BRK, legReach: legReach
  };
  root.KMDirector = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
