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
  function playLength(natural) { return natural > LONG_PLAN ? Math.min(natural, MAX_PLAY) : TARGET; }
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
  function carryDur(d) { return Math.max(0.5, d / 10.5); }
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
  function keyPos(st, ball, holderId, poss, extra, salt, still) {
    var pos = P.shapeAll(st, ball, poss), fixed = {};
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
        pos[ds[0].id] = { x: P.clamp(ball.x + (34 - ball.x) * 0.06 + (P.hash01(salt, ds[0].line, ds[0].slot) - 0.5) * 2, 0.9, P.W - 0.9), y: P.clamp(ball.y + dir * 3.0, 0.9, P.L - 0.9) };
        fixed[ds[0].id] = 1;
      }
      /* the cover: further back, towards the middle */
      if (ds[1] && P.dist(pos[ds[1].id], ball) < 30) {
        var cq = pos[ds[1].id];
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
            pos[rn.id] = { x: P.lerp(rq.x, 34, 0.15), y: P.clamp(lastY - dir * 0.8, 3, P.L - 3) };
          }
        }
      }
      /* the overlap: the full-back on the ball's side runs past it, outside */
      var lane = P.laneOfX(ball.x);
      if (lane !== 1 && bu > 38 && bu < 88 && P.hash01(salt, 'ovl') < 0.45) {
        var fb = outfield(st, ht).filter(function (p) { return p.line === 0 && P.laneOf(p, ht) === lane && !fixed[p.id]; })[0];
        if (fb) pos[fb.id] = { x: P.clamp(ball.x + (lane === 0 ? -4 : 4), 2, P.W - 2), y: ball.y + dir * 4 };
      }
    }
    return P.tidy(pos, fixed);
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
    var keys = [{ t: 0, ball: { x: start.ball.x, y: start.ball.y }, holder: start.holder, poss: start.team, pos: startPos }];
    var t = 0;
    beats.forEach(function (b, i) {
      t += b.dur;
      var last = i === beats.length - 1;
      var pos = last && endPos ? endPos : (b.pos || keyPos(st, b.ball, b.holder, b.poss, b.pin || null, salt + ':' + i, b.kind === 'out' || b.kind === 'foul'));
      var bz = last && endBall ? (endBall.z || 0) : (b.ball.z || 0);
      keys.push({ t: t, ball: last && endBall ? { x: endBall.x, y: endBall.y, z: bz } : { x: b.ball.x, y: b.ball.y, z: bz }, holder: b.holder, poss: b.poss, pos: pos });
    });
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
    var budget = TARGET - (lead ? lead.est : 0);
    bridge(pl, pre, budget);
    if (lead) lead.run(pl);
    /* whatever the plan did, the ball ends with the man the moment names */
    if (pl.cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x, S.y), S.air ? 'in the air' : null);
    else if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y));
    runIn(st, pl, S);
    /* the last picture: the moment's own */
    var endPos = P.freeze(st, S, P.shapeAll(st, { x: S.x, y: S.y }, S.team));
    var endBall = { x: S.x, y: S.y, z: S.air ? (S.scene.id === 'over_top' ? 1.0 : 0.6) : 0 };
    return build(st, start, startPos, pl.beats, endPos, endBall, seedOf(st, pending.index, 3, 0));
  }
  /* the man the moment is about makes his run: he is already moving into
   * the space when the last pass is played */
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

    if (kind === 'rest') {
      /* a substitution: the ball does not move */
    } else if (kind === 'goal' || kind === 'conceded') {
      var scorer = kind === 'goal' ? 'you' : 'them';
      var sn = /(?:and|,) ([^ .,]+) scores/.exec(text) || /^(?:GOAL|THEY SCORE)\. ([^ .,]+) /.exec(text);
      var sman = sn ? man(sn[1], scorer) : null;
      /* m3: the real scorer, wherever the text names him (d1 missed "X rises above Y to meet it and scores", "X gets to the ball first and scores") */
      var sm3 = GUARD.scorer ? scorerIn(st, text, scorer) : null;
      if (sm3) sman = sm3;
      var crossed = /cross|across the goal|across the (?:six-yard|5\.5-metre)/.test(text);
      /* their goal from a ball your man lost: the man who scores takes it first */
      var hTeam = P.teamOf(st, P.byId(st, pl.cur.holder));
      if (sman && hTeam && hTeam !== scorer && !isKeeperP(st, sman) && GUARD.scorer) {
        if (/loses (?:it|the ball) to|takes it from/.test(text)) pl.win(sman, 'tackle', pl.cur.ball);
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
      shotTo(g, /rises above|header|heads/.test(text) ? 'header' : 'goal');
      pl.last().note = 'goal';
      /* the keeper dives, and does not get there */
      var kx = g.x + (g.x < 34 ? 2.6 : -2.6);
      var pin = {}; pin[kpr.id] = { x: kx, y: scorer === 'you' ? P.L - 1.6 : 1.6 };
      pl.last().pin = pin;
      result.kickoff = other(scorer);
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
          shotTo({ x: keeperSpot(Tdef).x, y: keeperSpot(Tdef).y }, 'saved', 0.4);
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
      if (oc === 'rebound' || (ev && ev.dice && /saves it, but|pushes/.test(text))) {
        /* a shot, pushed out, and the man the text names gets there first */
        var kp = keeperOf(st, Tdef), kpos = keeperSpot(Tdef);
        shotTo({ x: kpos.x, y: kpos.y + dirOf(T) * -0.8 }, 'saved', 0.45);
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
        if (lw.kind === 'save') {
          if (/shoots|hits it|places|lifts|header|heads/.test(text)) shotTo({ x: keeperSpot(T).x, y: keeperSpot(T).y }, 'saved', 0.45);
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
          if (/cross/.test(text) && who === 'them') {
            var tgt2 = S0.crossTo || foil;
            if (tgt2 && tgt2.id !== pl.cur.holder) pl.pass(tgt2, { x: saveAt.x + (R() - 0.5) * 3, y: saveAt.y + dirOf(keepT) * 3 }, 'pass', 'cross', { holder: null });
            else shotTo(saveAt, 'cross');
          } else if (pl.cur.holder !== kk2.id) shotTo(saveAt, /head/.test(text) ? 'header' : 'saved');
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
      endPos = P.freeze(st, S, P.shapeAll(st, { x: S.x, y: S.y }, S.team), { beaten: bmen[0] || null });
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
    var seg = build(st, start, startPos, pl.beats, endPos, endBall, seedOf(st, p.index, (p.step || 1) + 50, 9));
    seg.kind = 'result'; seg.start = S; seg.index = p.index; seg.outcome = oc;
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
    return seg;
  }

  /* ------------------------------------------------------------ playback */
  function cr(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  /* the picture at time t: the ball, who has it, and all 22 */
  function frameAt(seg, t) {
    var K = seg.keys, n = K.length;
    if (n === 1 || t >= seg.duration) {
      var e = K[n - 1];
      return { t: seg.duration, ball: { x: e.ball.x, y: e.ball.y, z: e.ball.z || 0 }, holder: e.holder, poss: e.poss, pos: e.pos, beat: null, done: true };
    }
    if (t <= 0) return { t: 0, ball: { x: K[0].ball.x, y: K[0].ball.y, z: K[0].ball.z || 0 }, holder: K[0].holder, poss: K[0].poss, pos: K[0].pos, beat: null, done: false };
    var k = 0;
    while (k < n - 2 && K[k + 1].t <= t) k++;
    var a = K[k], b = K[k + 1], beat = seg.beats[k];
    var u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    u = Math.max(0, Math.min(1, u));
    var flying = PASSY[beat.kind];
    var ub = flying ? 1 - Math.pow(1 - u, 1.6) : u;
    var ball = { x: P.lerp(a.ball.x, b.ball.x, ub), y: P.lerp(a.ball.y, b.ball.y, ub), z: 0 };
    var len = P.dist(a.ball, b.ball);
    if (flying && (len > 26 || AIRY[beat.note])) ball.z = Math.sin(Math.PI * u) * Math.min(2.2, 0.6 + len / 28);
    var za = a.ball.z || 0, zb = b.ball.z || 0;
    if (za || zb) ball.z = Math.max(ball.z, P.lerp(za, zb, u));
    var K0 = K[Math.max(0, k - 1)], K3 = K[Math.min(n - 1, k + 2)];
    var pos = {};
    var us = u * u * (3 - 2 * u);
    for (var id in b.pos) {
      var p1 = a.pos[id] || b.pos[id], p2 = b.pos[id], p0 = K0.pos[id] || p1, p3 = K3.pos[id] || p2;
      /* a smooth path through the key frames, eased at the ends of a segment */
      var w = (k === 0 || k === n - 2) ? us : u;
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

  /* ------------------------------------------------------------ words */
  /* d1: one plain line for each event, for the commentator during play */
  function lineOf(st, b) {
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
    kickoffState: kickoffState, segment: segment, resolve: resolve, frameAt: frameAt, keyPos: keyPos,
    /* d1 */
    lineOf: lineOf, outcomeOf: outcomeOf, beatenIn: beatenIn, LEADS: LEADS, GUARD: GUARD,
    /* m3 */
    lostWin: lostWin
  };
  root.KMDirector = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
