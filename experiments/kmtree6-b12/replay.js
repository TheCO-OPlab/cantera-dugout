/* rp1: GOAL REPLAY (GOALS.md backlog item 6, "replay of goals"). A component
 * study: this file plus a short list of hooks in the match page.
 *
 * WHAT IT DOES. The page already builds every picture of the match from the
 * director's segments (the five seconds of play before a moment, and each
 * decision's result). The RECORDER keeps the segments of the play in front
 * of you; when a result is a goal it cuts a CLIP: the last 4 to 6 seconds
 * before the ball crossed the line (the end of the director's play plus the
 * results of the decisions in it), sampled at 30 frames a second and copied,
 * with the scorer, the man who passed to him, and the decisive duel's dice
 * at the moment they were rolled. The PLAYER shows a clip on the page's own
 * pitch canvas at half speed: a wipe in and out, a REPLAY tag, the ball's
 * path as a fading line, the scorer and the passer labelled, the dice at the
 * moment of the duel, and two cameras: Wide (the whole pitch) or Follow the
 * ball (a zoom that keeps the ball, the scorer and the goal in view).
 *
 * PURE RECORDING. The recorder only reads segments the page has already
 * made; it never calls the director, never touches the match or its RNG,
 * never uses Math.random and never writes to a segment (test.js proves the
 * match log and every director output are identical with replays on and
 * off, and that the segments are unchanged by a cut).
 *
 *   var R = CanteraReplay;
 *   var rec = new R.Recorder({ frameAt: KMDirector.frameAt });
 *   rec.play(seg)                     the play before a moment (a new play)
 *   rec.result(rseg, ev)              a decision's result (same play)
 *   var clip = rec.goal(ev, people)   after a result that is a goal
 *     people = { teamOf(id) -> 'you'|'them', isKeeper(id), nameOf(id),
 *                verdict: 'Yamal won by 4' (optional) }
 *   rec.clips()                       every goal of the match, in order
 *   var pl = new R.Player(adapter)    the page's pitch (see Player below)
 *   pl.offer(clip)  pl.play([clips], { reel, onDone })  pl.busy()  pl.stop()
 *   R.settings()  R.setSetting('auto'|'camera', v)  R.shouldAuto(...)
 *   R.follow(clip, geo, safe) -> the Follow camera for every frame (pure)
 *
 * Reduced motion (the system setting): no wipe, no Follow camera, never an
 * automatic replay, and "Replay" opens a still picture of the goal (the whole
 * path of the ball, the labels, the dice) with a button to play it anyway.
 *
 * Vanilla JS, no libraries, no network; runs in node for the checks. */
(function (root) {
  'use strict';
  var L = 105, W = 68;
  var OPT = { fps: 30, len: 4.5, min: 4, max: 6, lead: 1.1, rate: 0.5, wipe: 0.55, hold: 0.9, endHold: 1.0, zmax: 1.8 };
  /* test.js switches one fault on to show the check that guards it fails */
  var BREAK = { name: null };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function copyPos(pos) { var o = {}; for (var k in pos) o[k] = { x: pos[k].x, y: pos[k].y }; return o; }

  /* ============================================================ RECORDER */
  function Recorder(o) {
    o = o || {};
    this.frameAt = o.frameAt;
    this.o = {};
    for (var k in OPT) this.o[k] = o[k] != null ? o[k] : OPT[k];
    this.buf = []; this.list = [];
  }
  /* a new play: the director's segment before a moment */
  Recorder.prototype.play = function (seg, meta) { this.buf = seg ? [{ seg: seg, kind: 'play', meta: meta || null }] : []; };
  /* a decision's result: the same play goes on */
  Recorder.prototype.result = function (seg, ev, meta) { if (seg) this.buf.push({ seg: seg, kind: 'result', ev: ev || null, meta: meta || null }); };
  /* the result just recorded is a goal: cut its clip */
  Recorder.prototype.goal = function (ev, people) {
    if (BREAK.name === 'rng' && people && people.st && people.st.rng) people.st.rng.next();   // a fault: a recorder that rolls the match's dice
    var clip = cut(this.buf, ev, people || {}, this.o, this.frameAt, people && people.D);
    if (clip) { clip.n = this.list.length + 1; this.list.push(clip); }
    return clip;
  };
  Recorder.prototype.clips = function () { return this.list.slice(); };
  Recorder.prototype.reset = function () { this.buf = []; this.list = []; };

  /* the beats of a list of segments on one clock */
  function beatsOf(buf) {
    var out = [], off = 0;
    buf.forEach(function (e, k) {
      var s = e.seg;
      for (var j = 0; j < s.beats.length; j++) {
        var b = s.beats[j], a = s.keys[j], z = s.keys[j + 1] || a;
        out.push({ k: k, j: j, kind: b.kind, note: b.note || null, team: b.team, from: b.from || null, to: b.to || null,
          t0: off + a.t, t1: off + z.t, a: { x: a.ball.x, y: a.ball.y }, b: { x: z.ball.x, y: z.ball.y } });
      }
      off += s.duration;
    });
    return out;
  }
  /* the picture at time T on the play's clock */
  function frameOn(buf, offs, T, frameAt) {
    var k = 0;
    while (k < buf.length - 1 && T > offs[k] + buf[k].seg.duration) k++;
    return { k: k, fr: frameAt(buf[k].seg, clamp(T - offs[k], 0, buf[k].seg.duration)) };
  }

  /* THE CUT. The clip ends when the ball is in the net (the end of the
   * goal's result) and starts 4.5 s before, between 4 and 6 s, at least a
   * second before the decisive duel, on the start of a beat when one is
   * near, and never before the play began. */
  function cut(buf, ev, people, o, frameAt, D) {
    if (!buf.length || !frameAt) return null;
    var last = buf[buf.length - 1];
    if (last.kind !== 'result') return null;
    var side = ev && ev.kind === 'conceded' ? 'them' : 'you';
    var offs = [], off = 0;
    buf.forEach(function (e) { offs.push(off); off += e.seg.duration; });
    var end = off, tJ = offs[buf.length - 1];
    var beats = beatsOf(buf);
    /* the scorer: the man of the scoring side who shot, in the goal's result */
    var shot = null, i;
    for (i = beats.length - 1; i >= 0 && !shot; i--) if (beats[i].k === buf.length - 1 && beats[i].kind === 'shot' && beats[i].team === side) shot = beats[i];
    for (i = beats.length - 1; i >= 0 && !shot; i--) if (beats[i].k === buf.length - 1 && beats[i].kind === 'shot') shot = beats[i];
    var teamOf = people.teamOf || function () { return null; }, isKeeper = people.isKeeper || function () { return false; };
    var scorer = shot ? shot.from : null;
    if (!scorer || teamOf(scorer) !== side || isKeeper(scorer)) {
      /* the director stages a goal from your own man's mistake as his shot:
       * then the scorer is the scoring side's outfield man nearest the ball */
      var at = shot ? shot.a : last.seg.keys[last.seg.keys.length - 1].ball, f0 = frameOn(buf, offs, shot ? shot.t0 : end, frameAt).fr, bd = 1e9;
      scorer = null;
      for (var id in f0.pos) if (teamOf(id) === side && !isKeeper(id)) { var d = dist(f0.pos[id], at); if (d < bd) { bd = d; scorer = id; } }
    }
    /* the engine's words are the authority on who scored: when they name
     * another man of the scoring side than the one the director has shoot
     * (d1 stages a header and a cut-back as the deliverer's own shot), the
     * words win, and the director's shooter is the man who gave it to him */
    var named = people.byName && BREAK.name !== 'words' ? textScorer(ev && ev.text) : null, nid = named ? people.byName(named, side) : null, disagree = null;
    if (nid && nid !== scorer && teamOf(nid) === side && !isKeeper(nid)) { disagree = { director: scorer, words: nid }; scorer = nid; }
    /* the passer: walking back from the shot past the scorer's own runs, the
     * team-mate whose pass reached him; nobody when anything else got it to him */
    var passer = null, passB = null;
    var si = shot ? beats.indexOf(shot) : beats.length;
    for (i = si - 1; i >= 0; i--) {
      var b = beats[i];
      if ((b.kind === 'carry' || b.kind === 'dribble') && b.from === scorer) continue;
      if ((b.kind === 'pass' || b.kind === 'kickoff') && b.to === scorer && b.from && b.from !== scorer && teamOf(b.from) === side) { passer = b.from; passB = b; }
      break;
    }
    if (disagree && shot && disagree.director && teamOf(disagree.director) === side) { passer = disagree.director; passB = shot; }
    /* where the clip starts */
    var lo = Math.max(0, end - o.max), hi = Math.max(lo, Math.min(end - o.min, tJ - o.lead));
    var s = clamp(end - o.len, lo, hi);
    if (BREAK.name === 'short') s = tJ;   // a fault: only the goal's own result
    else {
      var best = null, bdt = 0.61;
      beats.forEach(function (b) { if (b.t0 >= lo - 1e-9 && b.t0 <= hi + 1e-9 && Math.abs(b.t0 - s) < bdt) { bdt = Math.abs(b.t0 - s); best = b.t0; } });
      if (best !== null) s = best;
    }
    /* the frames: copies, so nothing the page does later can change a clip */
    var dt = 1 / o.fps, n = Math.max(2, Math.ceil((end - s) / dt - 1e-9) + 1), frames = [], times = [];
    if (BREAK.name === 'resim' && D && people.st) D.segment(people.st, people.p, D.kickoffState(people.st));   // a fault: re-running the director
    /* every 1/30 s, plus the exact moment each decision's result began (the frozen picture) */
    for (i = 0; i < n; i++) times.push(i === n - 1 ? end : s + i * dt);
    offs.forEach(function (t) { if (t > s + 1e-6 && t < end - 1e-6 && times.indexOf(t) < 0) times.push(t); });
    times.sort(function (a, b) { return a - b; });
    for (i = 0; i < times.length; i++) {
      var T = times[i], fo = frameOn(buf, offs, T, frameAt), fr = fo.fr;
      frames.push({ t: T - s, ball: { x: fr.ball.x, y: fr.ball.y, z: fr.ball.z || 0 }, holder: fr.holder || null,
        pos: BREAK.name === 'alias' ? fr.pos : copyPos(fr.pos), kind: fr.beat ? fr.beat.kind : null, seg: fo.k });
    }
    var names = {};
    [scorer, passer].concat(beats.map(function (b) { return b.from; })).forEach(function (id) { if (id && people.nameOf && !(id in names)) names[id] = people.nameOf(id); });
    var d = ev && ev.dice ? ev.dice : null;
    var clip = {
      side: side, minute: ev ? ev.minute : null, label: ev ? ev.label || '' : '', text: ev ? ev.headline || '' : '',
      goalEnd: side === 'you' ? 'top' : 'bottom', disagree: disagree,
      frames: frames, dt: dt, duration: end - s, start: s,
      scorer: scorer, passer: passer, names: names,
      shotT: shot ? Math.max(0, shot.t0 - s) : null,
      passT: passB ? { t0: passB.t0 - s, t1: passB.t1 - s } : null,
      junction: Math.max(0, tJ - s),
      junctions: offs.filter(function (t, k) { return buf[k].kind === 'result' && t > s && k < buf.length - 1; }).map(function (t) { return t - s; }),
      beats: beats.filter(function (b) { return b.t1 > s; }).map(function (b) {
        return { kind: b.kind, note: b.note, team: b.team, from: b.from, to: b.to, t0: b.t0 - s, t1: b.t1 - s };
      }),
      dice: d ? { mine: d.mine, theirs: d.theirs, mineTotal: d.mineTotal, themTotal: d.themTotal, diff: d.diff,
        me: (ev && ev.actorName) || 'You', them: (ev && ev.foilName) || 'Them',
        meStat: (ev && ev.mineStat) || '', themStat: (ev && ev.themStat) || '', verdict: people.verdict || null } : null
    };
    return clip;
  }

  /* who scored, in the engine's words: "..., and Oyarzabal scores", "Álvarez
   * rises above Cubarsí to meet it and scores", "Álvarez gets to the ball
   * first and scores into an empty net" */
  function textScorer(t) {
    t = String(t || '').replace(/^(GOAL|THEY SCORE)\. /, '');
    var s = t.split(/\.\s+/).filter(function (x) { return /\bscores\b/.test(x); })[0];
    if (!s) return null;
    var m = /(?:,|\band) ([A-ZÀ-Þ][^ .,]*) (?:[a-z][a-z ]* )?scores\b/.exec(s);
    if (m) return m[1];
    var f = /^([A-ZÀ-Þ][^ .,]*)/.exec(s);
    return f ? f[1] : null;
  }

  /* the picture at clip time t (frames are 1/30 s apart; positions blend) */
  function frameAtClip(clip, t) {
    var F = clip.frames, n = F.length;
    if (t <= 0) return F[0];
    if (t >= clip.duration) return F[n - 1];
    var i = Math.min(n - 2, Math.max(0, Math.floor(t / clip.dt) - 2));
    while (i < n - 2 && F[i + 1].t <= t) i++;
    var a = F[i], b = F[i + 1];
    var u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1), pos = {};
    for (var id in b.pos) { var p = a.pos[id] || b.pos[id], q = b.pos[id]; pos[id] = { x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u) }; }
    return { t: t, ball: { x: lerp(a.ball.x, b.ball.x, u), y: lerp(a.ball.y, b.ball.y, u), z: lerp(a.ball.z, b.ball.z, u) },
      holder: u < 0.5 ? a.holder : b.holder, pos: pos, kind: u < 0.5 ? a.kind : b.kind };
  }

  /* ============================================================ TIMELINE
   * Real seconds against clip seconds: half speed, a hold on the decisive
   * duel while its dice show, a hold on the ball in the net. The wipes are
   * the player's (they sit between clips). */
  function timeline(clip, o) {
    o = o || {};
    var rate = o.rate || OPT.rate, hold = o.hold != null ? o.hold : OPT.hold, endHold = o.endHold != null ? o.endHold : OPT.endHold;
    var J = clamp(clip.junction, 0, clip.duration), D = clip.duration;
    var parts = [{ ph: 'run', a: 0, b: J, dur: J / rate }, { ph: 'hold', a: J, b: J, dur: hold },
      { ph: 'run', a: J, b: D, dur: (D - J) / rate }, { ph: 'end', a: D, b: D, dur: endHold }];
    var total = 0; parts.forEach(function (p) { p.s = total; total += p.dur; });
    return {
      total: total, parts: parts,
      at: function (r) {
        r = clamp(r, 0, total);
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          if (r <= p.s + p.dur || i === parts.length - 1) {
            var u = p.dur > 0 ? clamp((r - p.s) / p.dur, 0, 1) : 1;
            return { ph: p.ph, t: lerp(p.a, p.b, u), u: u, r: r, since: r - p.s };
          }
        }
      }
    };
  }

  /* ============================================================ CAMERAS
   * geo: the pitch canvas (w, h, px, py, s; metres to CSS px as the page's
   * renderer: X = px + x s, Y = py + (105 - y) s). A camera {z, tx, ty}
   * puts canvas point p on the screen at z p + t. Wide is {1, 0, 0}.
   * FOLLOW: for every frame, the smallest view that holds the ball (and
   * where it goes in the next 0.6 s), the scorer, the passer until his pass
   * has arrived, and the whole goal being attacked; the zoom is the lowest
   * needed over the next and last 0.6 s, smoothed, so it zooms out before
   * it has to; then every frame is checked and corrected so nothing it
   * must keep is ever outside the view, nor under the caption (`safe`). */
  function keepOf(clip, i) {
    var f = clip.frames[i], t = f.t, pts = [f.ball], gy = clip.goalEnd === 'top' ? L : 0, back = clip.goalEnd === 'top' ? L + 2 : -2;
    pts.push({ x: 30.34, y: gy }, { x: 37.66, y: gy }, { x: 30.34, y: back }, { x: 37.66, y: back });
    if (clip.scorer && f.pos[clip.scorer]) pts.push(f.pos[clip.scorer]);
    if (clip.passer && f.pos[clip.passer] && clip.passT && t <= clip.passT.t1 + 0.5) pts.push(f.pos[clip.passer]);
    return pts;
  }
  function follow(clip, g, safe, o) {
    o = o || {};
    var zmax = o.zmax || OPT.zmax, n = clip.frames.length, dt = clip.dt, i, j;
    var mx = (o.margin != null ? o.margin : 4) * g.s, lab = (o.label != null ? o.label : 7) * g.s;
    var sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0;
    function X(x) { return g.px + x * g.s; }
    function Y(y) { return g.py + (L - y) * g.s; }
    var need = [], cx = [], cy = [], boxes = [];
    for (i = 0; i < n; i++) {
      var pts = keepOf(clip, i).slice();
      for (j = i; j < n && clip.frames[j].t <= clip.frames[i].t + 0.6; j++) pts.push(clip.frames[j].ball);
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach(function (p, k) {
        var px = X(p.x), py = Y(p.y), ex = mx + (clip.scorer && p === clip.frames[i].pos[clip.scorer] ? lab : 0);
        x0 = Math.min(x0, px - ex); x1 = Math.max(x1, px + ex); y0 = Math.min(y0, py - mx); y1 = Math.max(y1, py + mx);
      });
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(g.w, x1); y1 = Math.min(g.h, y1);
      boxes.push([x0, y0, x1, y1]);
      need.push(clamp(Math.min(sw / Math.max(1, x1 - x0), sh / Math.max(1, y1 - y0)), 1, zmax));
      cx.push((x0 + x1) / 2); cy.push((y0 + y1) / 2);
    }
    var w1 = Math.round(0.6 / dt), w2 = Math.round(0.4 / dt), w3 = Math.round(0.5 / dt);
    var ero = need.map(function (v, k) { var m = v; for (var q = Math.max(0, k - w1); q <= Math.min(n - 1, k + w1); q++) m = Math.min(m, need[q]); return m; });
    function blur(a, w) { return a.map(function (v, k) { var s = 0, c = 0; for (var q = Math.max(0, k - w); q <= Math.min(n - 1, k + w); q++) { s += a[q]; c++; } return s / c; }); }
    var zs = blur(ero, w2), bx = blur(cx, w3), by = blur(cy, w3);
    var cams = [];
    for (i = 0; i < n; i++) {
      var z = BREAK.name === 'crop' ? zmax : zs[i], cam = null;
      /* the must-keep points in canvas px */
      var must = keepOf(clip, i).map(function (p) { return { x: X(p.x), y: Y(p.y) }; });
      for (var tries = 0; tries < 40; tries++) {
        cam = place(z, bx[i], by[i], must, g, safe);
        if (cam.ok || z <= 1) break;
        z = Math.max(1, z * 0.97);
      }
      if (BREAK.name === 'crop') cam = { z: zmax, tx: clamp((safe.x0 + safe.x1) / 2 - zmax * bx[i], g.w - zmax * g.w, 0), ty: clamp((safe.y0 + safe.y1) / 2 - zmax * by[i], g.h - zmax * g.h, 0) };
      cams.push({ z: cam.z, tx: cam.tx, ty: cam.ty });
    }
    return cams;
  }
  /* a camera at zoom z centred on (cx, cy) inside the safe rect, moved as
   * little as it takes to hold every must-keep point, never showing past
   * the edge of the board */
  function place(z, cx, cy, must, g, safe) {
    var lox = g.w - z * g.w, hix = 0, loy = g.h - z * g.h, hiy = 0;
    var tx = (safe.x0 + safe.x1) / 2 - z * cx, ty = (safe.y0 + safe.y1) / 2 - z * cy;
    var mxa = -1e9, mxb = 1e9, mya = -1e9, myb = 1e9, pad = 2;
    must.forEach(function (p) {
      mxa = Math.max(mxa, safe.x0 + pad - z * p.x); mxb = Math.min(mxb, safe.x1 - pad - z * p.x);
      mya = Math.max(mya, safe.y0 + pad - z * p.y); myb = Math.min(myb, safe.y1 - pad - z * p.y);
    });
    var ax = Math.max(lox, mxa), bxx = Math.min(hix, mxb), ay = Math.max(loy, mya), byy = Math.min(hiy, myb);
    var ok = ax <= bxx && ay <= byy;
    if (ok) { tx = clamp(tx, ax, bxx); ty = clamp(ty, ay, byy); }
    else { tx = clamp(tx, lox, hix); ty = clamp(ty, loy, hiy); }
    return { z: z, tx: tx, ty: ty, ok: ok || z <= 1 };
  }
  /* where the caption sits: at the end away from the goal, so it never
   * covers the goal; the rest is the safe rect the Follow camera keeps to */
  function safeRect(clip, g, hud) {
    hud = hud || {};
    var cap = hud.cap != null ? hud.cap : 70, row = hud.row != null ? hud.row : 34;
    return clip.goalEnd === 'top' ? { x0: 0, y0: 0, x1: g.w, y1: g.h - cap } : { x0: 0, y0: row + cap, x1: g.w, y1: g.h };
  }
  function camAt(cams, clip, t) {
    if (!cams) return { z: 1, tx: 0, ty: 0 };
    var n = cams.length, F = clip.frames;
    if (n < 2) return cams[0];
    var i = Math.min(n - 2, Math.max(0, Math.floor(t / clip.dt) - 2));
    while (i < n - 2 && F[i + 1].t <= t) i++;
    var u = clamp((t - F[i].t) / Math.max(1e-6, F[i + 1].t - F[i].t), 0, 1), a = cams[i], b = cams[i + 1];
    return { z: lerp(a.z, b.z, u), tx: lerp(a.tx, b.tx, u), ty: lerp(a.ty, b.ty, u) };
  }

  /* ============================================================ SETTINGS */
  function store(k, v) { try { if (v === undefined) return root.localStorage ? root.localStorage.getItem(k) : null; root.localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function param(k) {
    try { var m = new RegExp('[?&]' + k + '=([^&]*)').exec((root.location && root.location.search) || ''); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  }
  function settings() {
    var auto = store('cantera-replay-auto') === 'on', cam = store('cantera-replay-cam') === 'wide' ? 'wide' : 'follow';
    if (param('rpauto') === '1') auto = true; if (param('rpauto') === '0') auto = false;
    if (param('rpcam') === 'follow' || param('rpcam') === 'wide') cam = param('rpcam');
    if (BREAK.name === 'auto') auto = true;   // a fault: replays on by default
    if (BREAK.name === 'wide') cam = 'wide';   // a fault: the camera starts Wide
    return { auto: auto, camera: cam };
  }
  function setSetting(k, v) {
    if (k === 'auto') store('cantera-replay-auto', v ? 'on' : 'off');
    if (k === 'camera') store('cantera-replay-cam', v === 'follow' ? 'follow' : 'wide');
  }
  /* never automatic, unless Auto replay is on; never under reduced motion,
   * and not when the result was skipped with a click */
  function shouldAuto(s, reduced, skipped) { return !!(s && s.auto) && !reduced && !skipped; }
  function reducedMotion() {
    if (api.forceReduced) return true;
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  /* ============================================================ WORDS
   * Plain English (Eduardo's rules): name the man, the numbers with their parts. */
  function nameIn(clip, id) { return (id && clip.names[id]) || ''; }
  function captionOf(clip, total) {
    var sc = nameIn(clip, clip.scorer), ps = nameIn(clip, clip.passer);
    var head = (clip.minute != null ? clip.minute + "' " : '') + (sc ? sc + ' scores' : clip.side === 'you' ? 'You score' : 'They score');
    return { head: head, sub: ps ? ps + ' made the pass.' : '', n: total > 1 ? 'Goal ' + clip.n + ' of ' + total : '' };
  }
  function duelOf(clip) {
    var d = clip.dice;
    if (!d) return null;
    var won = d.diff > 0 ? d.me : d.diff < 0 ? d.them : null;
    return {
      mine: { name: d.me, stat: d.meStat, base: d.mineTotal - d.mine, die: d.mine, total: d.mineTotal },
      theirs: { name: d.them, stat: d.themStat, base: d.themTotal - d.theirs, die: d.theirs, total: d.themTotal },
      verdict: d.verdict || (won ? won + ' won by ' + Math.abs(d.diff) : 'Level')
    };
  }

  /* ============================================================ PLAYER
   * adapter (the page gives it):
   *   host()      the element round the pitch canvas (m2: #pbox)
   *   canvas()    the pitch canvas (m2: #pcanvas); the camera is a canvas
   *               transform on its context while the pitch is drawn
   *   geometry()  the renderer's geometry {w, h, px, py, s, r}
   *   drawPitch(frame, clip)  draws the pitch for one recorded frame
   *   take()      the replay takes the pitch (the page stops its camera push)
   *   restore()   the replay gives it back (the page draws the live picture)
   *   kit(side)   {primary, ink} for the wipe's colour
   *   reduced()   reduced motion (the page's own test)
   *   hide        CSS selector of the page's layers to hide during a replay */
  var CSS = '' +
    '.rp-on .rp-hide{visibility:hidden}' +
    'canvas.rp-fx{position:absolute;left:0;top:0;pointer-events:none;z-index:6}' +
    '.rp-hud{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:7;line-height:1.3;font:13px/1.3 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;color:#fff}' +
    '.rp-hud *{box-sizing:border-box}' +
    '.rp-row{position:absolute;left:8px;right:8px;top:7px;display:flex;justify-content:space-between;align-items:flex-start;gap:6px}' +
    '.rp-tag{display:inline-flex;align-items:center;gap:7px;padding:4px 9px 4px 8px;border-radius:5px;background:rgba(8,10,8,.82);' +
      'font:800 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;box-shadow:0 1px 0 rgba(0,0,0,.4)}' +
    '.rp-tag i{width:8px;height:8px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 2px rgba(255,59,48,.28)}' +
    '.rp-tag small{font:700 11px/1 ui-monospace,monospace;letter-spacing:0;color:#cfd6c8}' +
    '.rp-btns{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}' +
    '.rp-hud button{pointer-events:auto;cursor:pointer;font:700 11.5px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;' +
      'background:rgba(8,10,8,.78);border:1px solid rgba(255,255,255,.28);border-radius:5px;padding:5px 8px}' +
    '.rp-hud button:hover{border-color:#fff}' +
    '.rp-hud button.on{background:#fff;color:#111;border-color:#fff}' +
    '.rp-hud button:disabled{opacity:.45;cursor:default}' +
    '.rp-cap{position:absolute;left:8px;right:8px;padding:6px 10px 7px;border-radius:8px;background:rgba(8,10,8,.8);' +
      'box-shadow:0 2px 0 rgba(0,0,0,.35)}' +
    '.rp-cap.bottom{bottom:8px}.rp-cap.top{top:40px}' +
    /* m5: on a phone the caption is one short line at the very edge (the pill already says who made the pass), so it keeps off midfield */
    '@media (max-width:700px){.rp-cap{left:4px;right:4px;padding:4px 8px 5px;border-radius:6px}.rp-cap.bottom{bottom:4px}.rp-cap.top{top:34px}' +
      '.rp-l1 b{font-size:13px}.rp-l1 span{display:none}.rp-l1 em{font-size:9.5px}.rp-duel{margin-top:3px;font-size:11px;gap:5px}.rp-duel[style*="hidden"]{display:none}.rp-die{width:16px;height:16px}.rp-bar{margin-top:4px}}' +
    '.rp-l1{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
    '.rp-l1 b{font:800 15px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.005em}' +
    '.rp-l1 span{font-size:12.5px;color:#d5dccd}' +
    '.rp-l1 em{font-style:normal;margin-left:auto;font:700 10.5px/1 ui-sans-serif,system-ui;letter-spacing:.1em;text-transform:uppercase;color:#aeb7a4}' +
    '.rp-duel{display:flex;align-items:center;gap:7px;margin-top:5px;font-size:12px;color:#e8eee0;flex-wrap:wrap;transform-origin:0 50%}' +
    '.rp-duel .rp-v{font-weight:800;color:#ffd96a}' +
    '.rp-die{display:inline-grid;grid-template:repeat(3,1fr)/repeat(3,1fr);width:19px;height:19px;padding:2px;border-radius:4px;background:#fff;vertical-align:middle;flex:none}' +
    '.rp-die i{width:3.6px;height:3.6px;border-radius:50%;background:#111;place-self:center}' +
    '.rp-bar{position:relative;height:3px;margin-top:6px;border-radius:2px;background:rgba(255,255,255,.18)}' +
    '.rp-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:#fff}' +
    '.rp-bar s{position:absolute;top:-3px;width:3px;height:9px;margin-left:-1.5px;border-radius:1px;background:#ffcd3c;text-decoration:none}' +
    '.rp-offer{position:absolute;right:8px;bottom:8px;z-index:8;pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:7px;' +
      'font:700 12.5px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;background:rgba(8,10,8,.84);border:1px solid rgba(255,255,255,.35);' +
      'border-radius:99px;padding:7px 12px 7px 10px;box-shadow:0 2px 0 rgba(0,0,0,.35)}' +
    '.rp-offer:hover{border-color:#fff}' +
    '.rp-offer::before{content:"";width:0;height:0;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent #fff}' +
    '.rp-still{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto}';
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(n) {
    var h = '', on = PIPS[n] || [];
    for (var c = 0; c < 9; c++) if (on.indexOf(c) >= 0) h += '<i style="grid-area:' + (Math.floor(c / 3) + 1) + '/' + (c % 3 + 1) + '"></i>';
    return '<span class="rp-die" aria-label="' + n + '">' + h + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nowMs() { try { return root.performance.now(); } catch (e) { return Date.now(); } }

  function Player(ad) {
    this.ad = ad || {};
    this.s = null;          // the running show: { list, sched, ... }
    this.offered = null;
    this.camBlend = null;
    var self = this;
    if (root.document && root.addEventListener) {
      /* registered before the page's own listeners (this file loads first),
       * so a click or a key during a replay is the replay's alone */
      root.addEventListener('click', function (e) { self.onClick(e); }, true);
      root.addEventListener('keydown', function (e) { self.onKey(e); }, true);
    }
  }
  Player.prototype.busy = function () { return !!(this.s && this.s.own); };
  Player.prototype.active = function () { return !!this.s; };
  Player.prototype.style = function () {
    var d = root.document;
    if (!d || d.getElementById('rp-style')) return;
    var el = d.createElement('style'); el.id = 'rp-style'; el.textContent = CSS; d.head.appendChild(el);
  };
  /* "Replay the goal" on the pitch, until the next decision (null takes it away) */
  Player.prototype.offer = function (clip) {
    this.offered = clip || null;
    var d = root.document, host = this.ad.host && this.ad.host();
    var old = d && d.getElementById('rp-offer');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!clip || !host) return;
    this.style();
    var b = d.createElement('button');
    b.id = 'rp-offer'; b.className = 'rp-offer'; b.type = 'button';
    b.textContent = clip.side === 'you' ? 'Replay the goal' : 'Replay their goal';
    host.appendChild(b);
  };
  Player.prototype.onClick = function (e) {
    var t = e.target, self = this;
    function stop() { try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (er) { } }
    if (!this.s) {
      if (t && t.id === 'rp-offer' && this.offered) { stop(); this.play([this.offered], this.ad.playOpts ? this.ad.playOpts({}) : {}); }
      return;
    }
    stop();
    var act = t && t.getAttribute ? t.getAttribute('data-rp') : null;
    if (act === 'wide' || act === 'follow') return this.setCamera(act);
    if (act === 'close') return this.skip(true);
    if (act === 'playstill') return this.fromStill();
    self.skip(false);
  };
  Player.prototype.onKey = function (e) {
    if (!this.s) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (er) { }
      this.skip(true);
    }
  };
  Player.prototype.setCamera = function (m) {
    if (this.s && this.s.reduced && m === 'follow') return;
    var from = this.s ? this.curCam : null;
    setSetting('camera', m);
    if (this.s) { this.s.cam = m; this.camBlend = from ? { from: from, t0: nowMs() } : null; this.hudButtons(); }
    if (this.ad.onSetting) this.ad.onSetting('camera', m);
  };

  /* PLAY: one clip, or the reel of every goal (opts.reel). opts.seek (for
   * the checks and screenshots): jump to that many real seconds and stay. */
  Player.prototype.play = function (clips, opts) {
    opts = opts || {};
    clips = (clips || []).filter(Boolean);
    if (!clips.length || this.s) return false;
    var g = this.ad.geometry && this.ad.geometry(), cv = this.ad.canvas && this.ad.canvas();
    if (!g || !cv) return false;
    this.style();
    var reduced = !!(this.ad.reduced ? this.ad.reduced() : reducedMotion());
    var S = this.s = { list: clips, opts: opts, reduced: reduced, cam: reduced ? 'wide' : settings().camera, own: true,
      wipe: reduced ? 0 : OPT.wipe, still: reduced && !opts.motion, t0: nowMs(), seek: opts.seek != null && !isNaN(+opts.seek) ? +opts.seek : null, raf: 0, to: 0 };
    S.tls = clips.map(function (c) { return timeline(c); });
    this.build(S);
    S.cur = -1;
    if (typeof opts.seek === 'string' && isNaN(+opts.seek)) S.seek = this.seekPoint(opts.seek);
    if (this.ad.take) this.ad.take();
    var host = this.ad.host();
    if (host && host.classList) host.classList.add('rp-on');
    this.offerEl(false);
    this.mount();
    this.hud(true);
    if (S.still) { this.drawStill(); return true; }
    this.loop();
    return true;
  };
  /* a named point of the show, for the checks and screenshots: '[n:]in',
   * 'start', 'mid', 'pass', 'hold', 'shot', 'end', 'out' (n: the nth goal of a reel) */
  Player.prototype.seekPoint = function (name) {
    var S = this.s, m = /^(?:(\d+):)?(\w+)$/.exec(name) || [], k = Math.max(1, Math.min(S.list.length, +(m[1] || 1))) - 1, w = m[2] || 'start';
    var play = S.sched.filter(function (x) { return x.st === 'play' && x.i === k; })[0], out = S.sched.filter(function (x) { return x.st === 'out' && x.i === k; })[0];
    var c = S.list[k], tl = S.tls[k], J = c.junction, rate = OPT.rate, hold = OPT.hold;
    if (w === 'in') return k === 0 ? S.sched[0].s + S.sched[0].dur / 2 : S.sched.filter(function (x) { return x.st === 'out' && x.i === k - 1; })[0].s + S.wipe / 2;
    if (w === 'out') return out.s + out.dur / 2;
    if (w === 'mid') return play.s + J / 2 / rate;
    if (w === 'pass' && c.passT) return play.s + (c.passT.t0 + c.passT.t1) / 2 / rate + (c.passT.t0 >= J ? hold : 0);
    if (w === 'hold') return play.s + J / rate + hold * 0.4;
    if (w === 'shot' && c.shotT != null) return play.s + J / rate + hold + Math.max(0, c.shotT - J + 0.12) / rate;
    if (w === 'end') return play.s + tl.total - 0.35;
    return play.s + 0.05;
  };
  Player.prototype.offerEl = function (show) { var d = root.document, o = d && d.getElementById('rp-offer'); if (o) o.style.display = show ? '' : 'none'; };
  /* the schedule: [in], then for each clip play and out */
  Player.prototype.build = function (S) {
    S.sched = [];
    var w = S.wipe;
    S.sched.push({ st: 'in', i: 0, dur: w });
    S.list.forEach(function (c, i) {
      S.sched.push({ st: 'play', i: i, dur: S.tls[i].total });
      S.sched.push({ st: 'out', i: i, dur: w, next: i + 1 < S.list.length ? i + 1 : null });
    });
    var t = 0; S.sched.forEach(function (x) { x.s = t; t += x.dur; });
    S.total = t;
  };
  /* skip: the clip on screen leaves now (a click: to the next goal of a
   * reel; Esc or Close: out of the replay) */
  Player.prototype.skip = function (all) {
    var S = this.s;
    if (!S) return;
    if (S.still) return this.finish();
    var r = this.realT(), k = this.segAt(r), x = S.sched[k];
    if (x.st === 'out' && !all) return;
    var i = x.i, next = !all && i + 1 < S.list.length ? i + 1 : null;
    /* the rest of the schedule from now: out, then what is left */
    var rest = [{ st: 'out', i: i, dur: S.wipe, next: next }];
    if (next !== null) for (var j = next; j < S.list.length; j++) {
      rest.push({ st: 'play', i: j, dur: S.tls[j].total });
      rest.push({ st: 'out', i: j, dur: S.wipe, next: j + 1 < S.list.length ? j + 1 : null });
    }
    S.sched = S.sched.slice(0, k).concat(rest);
    var t = r; rest.forEach(function (y) { y.s = t; t += y.dur; });
    S.total = t;
    if (S.seek !== null) S.seek = r;
    S.cur = -1;
    this.tick();
  };
  Player.prototype.realT = function () { var S = this.s; return S.seek !== null ? S.seek : (nowMs() - S.t0) / 1000; };
  Player.prototype.segAt = function (r) {
    var S = this.s;
    for (var k = 0; k < S.sched.length; k++) if (r < S.sched[k].s + S.sched[k].dur) return k;
    return S.sched.length - 1;
  };
  Player.prototype.loop = function () {
    var self = this, S = this.s;
    if (!S) return;
    function go() {
      if (self.s !== S) return;
      clearTimeout(S.to);
      if (!self.tick()) return;
      if (S.seek !== null) return;   // a still for a screenshot: drawn once, held
      S.raf = root.requestAnimationFrame ? root.requestAnimationFrame(go) : 0;
      /* a timer stands in when no frame comes (a background tab, headless virtual time) */
      S.to = setTimeout(function () { if (self.s === S) { try { root.cancelAnimationFrame(S.raf); } catch (e) { } go(); } }, 50);
    }
    go();
  };
  /* one frame; false when the show is over */
  Player.prototype.tick = function () {
    var S = this.s;
    if (!S) return false;
    var r = this.realT();
    if (r >= S.total && S.seek === null) { this.finish(); return false; }
    var k = this.segAt(r), x = S.sched[k], u = x.dur > 0 ? clamp((r - x.s) / x.dur, 0, 1) : 1;
    var entering = k !== S.cur;
    S.cur = k;
    var clip = S.list[x.i], g = this.ad.geometry();
    if (!g) return true;
    if (x.st === 'in') {
      if (entering) { S.snap = this.snapshot(); S.clipI = 0; }
      this.show(clip, 0, g, 'in', u, x);
    } else if (x.st === 'play') {
      if (entering) { S.clipI = x.i; S.cams = null; S.own = true; this.hud(true); }
      var st = S.tls[x.i].at(r - x.s);
      this.show(clip, st.t, g, 'play', u, x, st);
    } else {
      if (entering) {
        S.snap = this.snapshot();
        if (x.next === null) this.release();
      }
      if (x.next !== null) this.show(S.list[x.next], 0, g, 'out', u, x);
      else this.overlayOut(g, u, clip);
    }
    return true;
  };

  /* ---------------------------------------------------------- drawing */
  Player.prototype.mount = function () {
    var d = root.document, host = this.ad.host(), g = this.ad.geometry();
    if (!host || !g) return;
    var c = d.getElementById('rp-fx');
    if (!c) { c = d.createElement('canvas'); c.id = 'rp-fx'; c.className = 'rp-fx'; c.setAttribute('aria-hidden', 'true'); }
    if (c.parentNode !== host) host.appendChild(c);
    var hud = d.getElementById('rp-hud');
    if (!hud) { hud = d.createElement('div'); hud.id = 'rp-hud'; hud.className = 'rp-hud'; hud.setAttribute('role', 'region'); hud.setAttribute('aria-label', 'Goal replay'); }
    if (hud.parentNode !== host) host.appendChild(hud);
    if (this.ad.hide) Array.prototype.slice.call(host.querySelectorAll(this.ad.hide)).forEach(function (el) { el.classList.add('rp-hide'); });
    this.fx = c; this.hudEl = hud;
  };
  Player.prototype.fxCtx = function (g) {
    var c = this.fx, dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    var W2 = Math.round(g.w * dpr), H2 = Math.round(g.h * dpr);
    if (c.width !== W2 || c.height !== H2) { c.width = W2; c.height = H2; c.style.width = g.w + 'px'; c.style.height = g.h + 'px'; }
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
  };
  /* a copy of what the pitch canvas shows now (for the wipes) */
  Player.prototype.snapshot = function () {
    var cv = this.ad.canvas(), d = root.document;
    if (!cv || !d) return null;
    try { var c = d.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; } catch (e) { return null; }
  };
  /* the camera of this frame: Wide, or Follow (worked out once a clip and size) */
  Player.prototype.camFor = function (clip, t, g) {
    var S = this.s, cam = { z: 1, tx: 0, ty: 0 };
    if (S.cam === 'follow' && !S.reduced) {
      var key = g.w + 'x' + g.h;
      if (!clip._cams || clip._cams.key !== key) clip._cams = { key: key, cams: follow(clip, g, safeRect(clip, g, this.hudSize())) };
      cam = camAt(clip._cams.cams, clip, t);
    }
    if (this.camBlend) {
      var b = clamp((nowMs() - this.camBlend.t0) / 350, 0, 1), e = b * b * (3 - 2 * b), f = this.camBlend.from;
      if (b >= 1 || S.seek !== null) this.camBlend = null;
      else cam = { z: lerp(f.z, cam.z, e), tx: lerp(f.tx, cam.tx, e), ty: lerp(f.ty, cam.ty, e) };
    }
    this.curCam = cam;
    return cam;
  };
  Player.prototype.hudSize = function () {
    var cap = this.hudEl && this.hudEl.querySelector('.rp-cap');
    return { cap: cap ? cap.offsetHeight + 12 : 70, row: 34 };
  };
  /* draw the pitch for clip time t through the camera: the renderer's own
   * setTransform calls are composed with the camera while it draws */
  Player.prototype.pitch = function (clip, t, g, cam) {
    var cv = this.ad.canvas(), ctx = cv && cv.getContext ? cv.getContext('2d') : null, ad = this.ad;
    if (!ctx) return;
    var fr = frameAtClip(clip, t), dpr = cv.width / Math.max(1, g.w);
    withCamera(ctx, dpr, cam, function () { ad.drawPitch(fr, clip, t); });
    return fr;
  };
  Player.prototype.show = function (clip, t, g, st, u, x, tl) {
    var S = this.s, cam = this.camFor(clip, t, g);
    this.pitch(clip, t, g, cam);
    var fx = this.fxCtx(g);
    if (st === 'play') {
      this.overlay(fx, clip, t, g, cam, tl);
      this.hudUpdate(clip, t, tl);
    } else {
      /* a wipe: the new picture is behind the band, the old one ahead of it */
      this.hudUpdate(clip, st === 'out' ? 0 : 0, null, true);
      wipe(fx, g, S.snap, u, this.bandColour(clip), this.bandText(clip), this.fx);
    }
  };
  Player.prototype.overlayOut = function (g, u, clip) {
    var fx = this.fxCtx(g);
    this.hudUpdate(clip, 0, null, true);
    wipe(fx, g, this.s.snap, u, this.bandColour(clip), 'REPLAY', this.fx);
  };
  Player.prototype.bandColour = function (clip) {
    var k = this.ad.kit ? this.ad.kit(clip.side) : null;
    return (k && k.primary) || (clip.side === 'you' ? '#c8102e' : '#6cace4');
  };
  Player.prototype.bandText = function (clip) {
    var S = this.s;
    return S.list.length > 1 ? 'GOAL ' + clip.n + ' OF ' + S.list.length : 'REPLAY';
  };
  /* the path of the ball, the duel's spot, the scorer and the passer */
  Player.prototype.overlay = function (x, clip, t, g, cam, tl) {
    function SX(xm) { return cam.z * (g.px + xm * g.s) + cam.tx; }
    function SY(ym) { return cam.z * (g.py + (L - ym) * g.s) + cam.ty; }
    var F = clip.frames, fr = frameAtClip(clip, t), zs = Math.sqrt(cam.z), still = this.s.still;
    /* the path: every frame so far; older parts fade; the shot in gold */
    var pts = [];
    for (var i = 0; i < F.length && F[i].t <= t; i++) pts.push(F[i]);
    pts.push({ t: t, ball: fr.ball });
    /* one stroke per run of about 0.2 s (a stroke per frame overlapped its
     * round ends into a dashed look); older runs fainter; the shot in gold */
    var runs = [], cur = null;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], gold = clip.shotT != null && a.t >= clip.shotT - 1e-6;
      var al = still ? 0.9 : 0.22 + 0.78 * Math.max(0, 1 - (t - b.t) / 2.4);
      if (!cur || cur.gold !== gold || b.t - cur.t0 > 0.2) { cur = { gold: gold, t0: a.t, pts: [a.ball], al: al }; runs.push(cur); }
      cur.pts.push(b.ball); cur.al = al;
    }
    x.save(); x.lineCap = 'butt'; x.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) runs.forEach(function (rn, k) {
      x.globalAlpha = rn.al * (pass ? 1 : 0.5);
      x.strokeStyle = pass ? (rn.gold ? '#ffcd3c' : '#ffffff') : 'rgba(0,0,0,0.75)';
      x.lineWidth = (pass ? 2.6 : 5.4) * zs;
      if (k === 0 || k === runs.length - 1) x.lineCap = 'round'; else x.lineCap = 'butt';
      x.beginPath(); x.moveTo(SX(rn.pts[0].x), SY(rn.pts[0].y));
      for (var q = 1; q < rn.pts.length; q++) x.lineTo(SX(rn.pts[q].x), SY(rn.pts[q].y));
      x.stroke();
    });
    x.restore();
    /* where the decisive duel was: a gold ring at the ball, from that moment */
    if (clip.dice && t >= clip.junction - 1e-6) {
      var jf = frameAtClip(clip, clip.junction), jx = SX(jf.ball.x), jy = SY(jf.ball.y);
      var pop = tl && tl.ph === 'hold' && !still ? tl.since : 9;
      var rr = (g.r * 0.9 + 3) * zs * (1 + 0.6 * Math.exp(-pop * 5));
      x.save(); x.strokeStyle = '#ffcd3c'; x.lineWidth = 2.2; x.globalAlpha = 0.95;
      x.beginPath(); x.arc(jx, jy, rr, 0, Math.PI * 2); x.stroke(); x.restore();
    }
    /* the labels: the passer until a second after his pass, the scorer throughout */
    var tags = [];
    if (clip.passer && fr.pos[clip.passer] && (!clip.passT || t <= clip.passT.t1 + 1.2 || still)) tags.push({ id: clip.passer, text: nameIn(clip, clip.passer) + ' made the pass', main: false });
    if (clip.scorer && fr.pos[clip.scorer]) tags.push({ id: clip.scorer, text: nameIn(clip, clip.scorer) + (t >= clip.duration - 1e-6 ? ' scores' : ''), main: true });
    /* m5: each pill placed as the hover preview's labels are (tags.js): the
     * cheapest spot round its man that covers no piece, not the ball and not
     * the other pill, inside the pitch and clear of the replay's own bar and
     * caption; the spot it had the frame before is tried first, so a pill
     * does not jump from side to side as the men move. A pill that had to go
     * further out gets a thin line back to its man. Without tags.js: rp1's
     * four sides. */
    var rS = g.r * cam.z, placed = [], self = this, TG = BREAK.name === 'rplabs' ? null : root.KMTags || null, d0 = root.document;   // (replaycheck --break rplabs: rp1's four sides)
    var dots = [], ids = Object.keys(fr.pos);
    for (var di = 0; di < ids.length; di++) { var dp = fr.pos[ids[di]]; dots.push({ id: ids[di], x: SX(dp.x), y: SY(dp.y) }); }
    var capEl = d0 && d0.getElementById('rp-cap'), rowEl = d0 && d0.querySelector('#rp-hud .rp-row'), hostEl = this.hudEl;
    var B = { x0: 3, y0: 3, x1: g.w - 3, y1: g.h - 3 };
    if (hostEl && hostEl.getBoundingClientRect) {
      var hb = hostEl.getBoundingClientRect();
      if (rowEl) { var rb = rowEl.getBoundingClientRect(); if (rb.height) B.y0 = Math.max(B.y0, rb.bottom - hb.top + 3); }
      if (capEl) { var cb = capEl.getBoundingClientRect(); if (cb.height) { if (/bottom/.test(capEl.className)) B.y1 = Math.min(B.y1, cb.top - hb.top - 3); else B.y0 = Math.max(B.y0, cb.bottom - hb.top + 3); } }
    }
    var prev = this.s && this.s.tagPrev || {}, nextPrev = {};
    var want = tags.map(function (tg) {
      x.save(); x.font = (tg.main ? '800 13px ' : '700 12px ') + 'ui-sans-serif,system-ui,"Segoe UI",sans-serif';
      var w = x.measureText(tg.text).width + 16, h = tg.main ? 22 : 20; x.restore();
      var p = fr.pos[tg.id], cx = SX(p.x), cy = SY(p.y), pv = prev[tg.id];
      return { id: tg.id, text: tg.text, main: tg.main, w: w, h: h, cx: cx, cy: cy, pref: pv ? { x: cx + pv.dx, y: cy + pv.dy } : null };
    });
    var spots = null;
    if (TG && TG.place) {
      /* the scorer first: he gets the best place */
      var order = want.slice().sort(function (a, b) { return (b.main ? 1 : 0) - (a.main ? 1 : 0); });
      var got = TG.place({ fine: true, dots: dots, want: order.map(function (u) { return { id: u.id, text: u.text, w: u.w, h: u.h, pref: u.pref }; }), r: rS, fs: 12,   // m6: fine
        ball: { x: SX(fr.ball.x), y: SY(fr.ball.y) }, bounds: B.y1 - B.y0 > 60 ? B : { x0: 3, y0: 3, x1: g.w - 3, y1: g.h - 3 } });
      spots = {}; got.forEach(function (t) { spots[t.id] = t; });
      /* m6: in a crowd at the edge of a zoomed replay a pill can find no clear
       * spot (replaycheck E5, 1 of 1,714); then it says the name alone (the
       * bar and the caption already say who made the pass and who scored) and
       * is placed again */
      var onMan = function (b) { return dots.some(function (d) { var nx = Math.max(b.x, Math.min(d.x, b.x + b.w)), ny = Math.max(b.y, Math.min(d.y, b.y + b.h)); return (d.x - nx) * (d.x - nx) + (d.y - ny) * (d.y - ny) < rS * rS * 0.81; }); };
      order.forEach(function (u) {
        var sp0 = spots[u.id];
        if (!sp0 || !onMan(sp0)) return;
        var short = nameIn(clip, u.id);
        x.save(); x.font = (u.main ? '800 13px ' : '700 12px ') + 'ui-sans-serif,system-ui,"Segoe UI",sans-serif'; var w2 = x.measureText(short).width + 16; x.restore();
        var others = got.filter(function (t) { return t.id !== u.id; }).map(function (t) { return { x: t.x, y: t.y, w: t.w, h: t.h }; });
        var re = TG.place({ fine: true, dots: dots, want: [{ id: u.id, text: short, w: w2, h: u.h }], r: rS, fs: 12, avoid: others,
          ball: { x: SX(fr.ball.x), y: SY(fr.ball.y) }, bounds: B.y1 - B.y0 > 60 ? B : { x0: 3, y0: 3, x1: g.w - 3, y1: g.h - 3 } })[0];
        if (re && !onMan(re)) { spots[u.id] = re; want.forEach(function (tg) { if (tg.id === u.id) { tg.text = short; tg.w = w2; } }); }
      });
    }
    want.forEach(function (tg) {
      var lx, ly, w = tg.w, h = tg.h, far = false, sp = spots && spots[tg.id];
      if (sp) { lx = sp.x; ly = sp.y; far = sp.lead; }
      else {
        var best = null;
        [[tg.cx + rS + 6, tg.cy - h / 2], [tg.cx - rS - 6 - w, tg.cy - h / 2], [tg.cx - w / 2, tg.cy - rS - 6 - h], [tg.cx - w / 2, tg.cy + rS + 6]].some(function (c) {
          var cx2 = clamp(c[0], 3, g.w - w - 3), cy2 = clamp(c[1], 3, g.h - h - 3);
          var hit = placed.some(function (q) { return cx2 < q[0] + q[2] + 3 && cx2 + w + 3 > q[0] && cy2 < q[1] + q[3] + 3 && cy2 + h + 3 > q[1]; });
          if (!best) best = [cx2, cy2];
          if (!hit) { best = [cx2, cy2]; return true; }
          return false;
        });
        lx = best[0]; ly = best[1];
      }
      placed.push([lx, ly, w, h]);
      nextPrev[tg.id] = { dx: lx - tg.cx, dy: ly - tg.cy };
      x.save();
      if (far) {
        var ex = clamp(tg.cx, lx, lx + w), ey = clamp(tg.cy, ly, ly + h);
        x.globalAlpha = 0.85; x.strokeStyle = '#ffffff'; x.lineWidth = 1.2; x.setLineDash([3, 2]);
        x.beginPath(); x.moveTo(tg.cx, tg.cy); x.lineTo(ex, ey); x.stroke(); x.setLineDash([]);
      }
      x.font = (tg.main ? '800 13px ' : '700 12px ') + 'ui-sans-serif,system-ui,"Segoe UI",sans-serif';
      x.globalAlpha = 0.92; x.fillStyle = '#0b0d0a';
      roundRect(x, lx, ly, w, h, 5); x.fill();
      if (tg.main) { x.fillStyle = '#ffcd3c'; x.fillRect(lx, ly + 3, 3, h - 6); }
      x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.textBaseline = 'middle';
      x.fillText(tg.text, lx + (tg.main ? 10 : 8), ly + h / 2 + 0.5);
      x.restore();
    });
    if (this.s) this.s.tagPrev = nextPrev;
    /* for the checks: where the pills are, in the canvas's pixels */
    if (this.s) this.s.tagBoxes = placed.map(function (q, i) { return { id: want[i] && want[i].id, x: q[0], y: q[1], w: q[2], h: q[3] }; }), this.s.tagDots = dots, this.s.tagR = rS;
  };
  function roundRect(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r); x.lineTo(a + w, b + h - r);
    x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r);
    x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  /* THE WIPE: a slanted band in the scoring team's colour crosses the
   * pitch left to right; behind it the new picture, ahead of it the old */
  function wipe(x, g, snap, u, col, text) {
    var W2 = g.w, H2 = g.h, bw = Math.max(70, W2 * 0.3), sk = H2 * 0.18;
    var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    var lead = lerp(-sk, W2 + bw + sk, e);             // the band's front edge at the top
    function front(y) { return lead + sk * (y / H2); }
    x.save();
    if (snap) {
      x.beginPath(); x.moveTo(front(0), 0); x.lineTo(W2, 0); x.lineTo(W2, H2); x.lineTo(front(H2), H2); x.closePath(); x.clip();
      x.drawImage(snap, 0, 0, W2, H2);
    }
    x.restore();
    x.save();
    x.beginPath(); x.moveTo(front(0) - bw, 0); x.lineTo(front(0), 0); x.lineTo(front(H2), H2); x.lineTo(front(H2) - bw, H2); x.closePath();
    x.fillStyle = col; x.globalAlpha = 0.96; x.fill();
    x.globalAlpha = 1; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(front(0), 0); x.lineTo(front(H2), H2); x.stroke();
    x.beginPath(); x.moveTo(front(0) - bw, 0); x.lineTo(front(H2) - bw, H2); x.stroke();
    x.fillStyle = '#ffffff'; x.font = 'italic 900 ' + Math.round(clamp(bw * 0.15, 14, 24)) + 'px ui-sans-serif,system-ui,sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(front(H2 / 2) - bw / 2, H2 / 2);
    x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 4;
    x.fillText(text, 0, 0);
    x.restore();
  }
  /* compose a camera with the renderer's own transforms while it draws */
  function withCamera(ctx, dpr, cam, fn) {
    if (!cam || (Math.abs(cam.z - 1) < 1e-6 && Math.abs(cam.tx) < 1e-6 && Math.abs(cam.ty) < 1e-6)) return fn();
    var own = Object.prototype.hasOwnProperty.call(ctx, 'setTransform'), orig = ctx.setTransform;
    ctx.setTransform = function (a, b, c, d, e, f) {
      if (typeof a !== 'number') return orig.apply(ctx, arguments);
      return orig.call(ctx, a * cam.z, b * cam.z, c * cam.z, d * cam.z, e * cam.z + dpr * cam.tx, f * cam.z + dpr * cam.ty);
    };
    try { fn(); } finally { if (own) ctx.setTransform = orig; else delete ctx.setTransform; }
  }

  /* ---------------------------------------------------------- the HUD */
  Player.prototype.hud = function (fresh) {
    var S = this.s, el = this.hudEl;
    if (!el || !S) return;
    var clip = S.list[S.clipI || 0], cap = captionOf(clip, S.list.length), du = duelOf(clip);
    var pos = clip.goalEnd === 'top' ? 'bottom' : 'top';
    el.innerHTML = '<div class="rp-row"><span class="rp-tag"><i></i>REPLAY<small>' + (S.still ? 'still' : '0.5x') + '</small></span>' +
      '<span class="rp-btns" id="rp-btns"></span></div>' +
      '<div class="rp-cap ' + pos + '" id="rp-cap"><div class="rp-l1"><b>' + esc(cap.head) + '</b>' + (cap.sub ? '<span>' + esc(cap.sub) + '</span>' : '') +
        (cap.n ? '<em>' + esc(cap.n) + '</em>' : '') + '</div>' +
      (du ? '<div class="rp-duel" id="rp-duel">' +
        dieHTML(du.mine.die) + '<span>' + esc(du.mine.name) + ' ' + du.mine.base + ' + ' + du.mine.die + ' = <b>' + du.mine.total + '</b></span>' +
        dieHTML(du.theirs.die) + '<span>' + esc(du.theirs.name) + ' ' + du.theirs.base + ' + ' + du.theirs.die + ' = <b>' + du.theirs.total + '</b></span>' +
        '<span class="rp-v">' + esc(du.verdict) + '</span></div>' : '') +
      (S.still ? '' : '<div class="rp-bar"><i id="rp-prog"></i>' + (du ? '<s style="left:' + (100 * clip.junction / clip.duration).toFixed(1) + '%"></s>' : '') + '</div>') +
      '</div>' +
      (S.still ? '<button class="rp-still" data-rp="playstill">Play the replay</button>' : '');
    this.hudButtons();
    this.hudUpdate(clip, S.still ? clip.duration : 0, null, false);
  };
  Player.prototype.hudButtons = function () {
    var S = this.s, b = root.document && root.document.getElementById('rp-btns');
    if (!b || !S) return;
    var g = this.ad.geometry && this.ad.geometry(), narrow = g && g.w < 440;
    b.innerHTML = '<button data-rp="wide" class="' + (S.cam === 'wide' ? 'on' : '') + '" aria-pressed="' + (S.cam === 'wide') + '">Wide</button>' +
      '<button data-rp="follow" class="' + (S.cam === 'follow' ? 'on' : '') + '" aria-pressed="' + (S.cam === 'follow') + '"' + (S.reduced ? ' disabled title="Off while your system asks for reduced motion"' : '') + '>' + (narrow ? 'Follow' : 'Follow the ball') + '</button>' +
      '<button data-rp="close" aria-label="Close the replay (Esc)" title="Close the replay (Esc)">' + (narrow ? 'Close' : 'Close (Esc)') + '</button>';
  };
  Player.prototype.hudUpdate = function (clip, t, tl, wiping) {
    var S = this.s, d = root.document;
    if (!S || !d) return;
    if (S.hudClip !== clip && !wiping) { S.hudClip = clip; S.clipI = S.list.indexOf(clip); this.hud(); }
    if (this.hudEl) this.hudEl.style.opacity = wiping ? '0' : '1';
    var pr = d.getElementById('rp-prog'); if (pr) pr.style.width = (100 * clamp(t / clip.duration, 0, 1)).toFixed(1) + '%';
    var du = d.getElementById('rp-duel');
    if (du) {
      var on = S.still || t >= clip.junction - 1e-6;
      du.style.visibility = on ? 'visible' : 'hidden';
      var k = tl && tl.ph === 'hold' && !S.reduced ? 1 + 0.12 * Math.exp(-tl.since * 6) * Math.cos(tl.since * 18) : 1;
      du.style.transform = k !== 1 ? 'scale(' + k.toFixed(3) + ')' : '';
    }
  };

  /* reduced motion: one picture of the goal (the moment of the shot, the
   * whole path, the labels and the dice) with a button to play it anyway */
  Player.prototype.drawStill = function () {
    var S = this.s, clip = S.list[0], g = this.ad.geometry(), t = clip.shotT != null ? clip.shotT : clip.duration;
    var cam = { z: 1, tx: 0, ty: 0 };
    this.curCam = cam;
    this.pitch(clip, t, g, cam);
    var fx = this.fxCtx(g);
    /* the whole path: the still draws every frame's ball */
    var full = { frames: clip.frames, shotT: clip.shotT, junction: clip.junction, dice: clip.dice, scorer: clip.scorer, passer: clip.passer, passT: clip.passT, names: clip.names, duration: clip.duration, dt: clip.dt };
    this.overlay(fx, full, clip.duration, g, cam, null);
  };
  Player.prototype.fromStill = function () {
    var S = this.s;
    if (!S) return;
    S.still = false; S.t0 = nowMs(); S.cur = -1; S.wipe = 0;
    this.build(S);
    this.hud(true);
    this.loop();
  };
  /* the live picture is back under the wipe */
  Player.prototype.release = function () {
    var S = this.s;
    if (!S || !S.own) return;
    S.own = false;
    var host = this.ad.host();
    if (host && host.classList) host.classList.remove('rp-on');
    if (host && this.ad.hide) Array.prototype.slice.call(host.querySelectorAll('.rp-hide')).forEach(function (el) { el.classList.remove('rp-hide'); });
    if (this.ad.restore) this.ad.restore();
  };
  Player.prototype.finish = function () {
    var S = this.s;
    if (!S) return;
    try { if (S.raf) root.cancelAnimationFrame(S.raf); clearTimeout(S.to); } catch (e) { }
    this.release();
    this.s = null;
    this.shown = (this.shown || 0) + 1;
    if (this.fx) { var c = this.fx.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.fx.width, this.fx.height); }
    if (this.hudEl) this.hudEl.innerHTML = '';
    this.offerEl(true);
    var done = S.opts.onDone;
    if (done) done();
  };
  Player.prototype.stop = function () { if (this.s) this.finish(); };

  var api = {
    Recorder: Recorder, Player: Player, cut: cut, frameAtClip: frameAtClip, timeline: timeline,
    follow: follow, safeRect: safeRect, textScorer: textScorer, keepOf: keepOf, camAt: camAt, withCamera: withCamera,
    settings: settings, setSetting: setSetting, shouldAuto: shouldAuto, reducedMotion: reducedMotion,
    captionOf: captionOf, duelOf: duelOf, OPT: OPT, BREAK: BREAK, forceReduced: false
  };
  root.CanteraReplay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
