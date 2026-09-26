/* juice.js: CanteraJuice, game feel for the vertical pitch (study juice1; m2
 * adopts it unchanged apart from the crowd's palettes, marked m2).
 *
 * Small, separate pieces that sit around an art1 renderer (pitchstyles.js).
 * Nothing here changes a match: no engine state, no match RNG, no
 * Math.random. Everything takes PITCH CONTRACT metres (x 0..68 left to right
 * as the user sees it, y 0 = the user's goal line, 105 = theirs) or the CSS
 * pixels of the renderer's geometry (pitch.geometry(): g.X, g.Y, g.s, g.r).
 * Every effect is under a second except the goal celebration (under 3 s).
 *
 * SCENE FILTERS (change the scene before pitch.draw):
 *   var m = new CanteraJuice.Motion();       players ease: arrive and settle,
 *   players = m.step(players, dt, {exact, ball})   a short wind-up before a sprint;
 *                                            exact 0..1 pins them to the targets
 *                                            (use the freeze amount: a frozen
 *                                            moment is always exactly where the
 *                                            engine put it)
 *   CanteraJuice.flight(kind, a, b, u, h)    ball on a pass | lob | shot at
 *                                            progress u: {x, y, z}; z is height
 *   var tr = new CanteraJuice.Trail();       tr.push(t, ball); ball.trail = tr.get(t)
 *   var sp = new CanteraJuice.Spin();        ball.spin = sp.step(ball, dt)
 *   var cel = new CanteraJuice.Celebration(o)  scorer to the corner, team-mates
 *   players = cel.apply(players, age)        converge; o.deflated for a quiet one
 *
 * TIME:
 *   var clock = new CanteraJuice.Clock();    game time that brakes to a stop
 *   clock.stopAt(gameT, 0.4); clock.tick(dt) over 0.4 s and lands EXACTLY on
 *   clock.resume(0.25)                        gameT (so the ball ends where the
 *                                            moment starts)
 *
 * CAMERA (canvas transform, no layout change):
 *   var cam = new CanteraJuice.Camera();
 *   cam.update(dt, g, {zoom: 1.1, focus: {x, y}, keep: players})  never crops a player
 *   cam.shake(0.8)                           decays in about 0.35 s
 *   cam.apply(ctx, dpr)                      then draw the pitch canvas and world overlays
 *
 * OVERLAYS (drawn on the page canvas after the pitch):
 *   CanteraJuice.ringPulse(ctx, g, p, age, color)     world space
 *   CanteraJuice.netRipple(ctx, g, end, x, age, strength, ink)
 *   var fx = new CanteraJuice.Particles(); fx.confetti(x, y, colors, n, dir); fx.step(dt); fx.draw(ctx)
 *   CanteraJuice.vignette(ctx, w, h, sx, sy, amount, dark)  screen space
 *   CanteraJuice.edgeGlow(ctx, w, h, color, amount)
 *   var crowd = new CanteraJuice.Crowd(); crowd.draw(ctx, g, t, tension, cheer, reduced)
 *   CanteraJuice.tensionFor(ball)            the same curve as snd1's KMSound.tensionFor
 *
 * DOM (driven by time, so a still at any time is exact):
 *   CanteraJuice.diceView(els, st, age)      tumble, land pop, winner glow
 *   CanteraJuice.verdictView(el, box, cls, age)   scale pop and colour flash
 *   CanteraJuice.scoreView(el, from, to, age, kind)  'goal' pops, 'conceded' drops
 *
 * CanteraJuice.reducedMotion() is true under prefers-reduced-motion (or
 * CanteraJuice.forceReduced = true): then there is no shake, no zoom, no
 * confetti (a short flash instead), no crowd sway and no dice tumble.
 */
(function (root) {
  'use strict';
  var PW = 68, PL = 105, TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  var Ease = {
    smooth: function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); },
    outQuad: function (u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); },
    outCubic: function (u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); },
    inOutCubic: function (u) { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    outBack: function (u, s) { u = clamp(u, 0, 1); s = s == null ? 1.70158 : s; u -= 1; return u * u * ((s + 1) * u + s) + 1; }
  };
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { var c = hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  /* a tiny seeded generator (never Math.random, never the match RNG) */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var api = { forceReduced: false, Ease: Ease };
  function reducedMotion() {
    if (api.forceReduced) return true;
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  /* ================================================== 1. PLAYER MOTION
   * Each dot follows its target on a slightly under-damped spring: it lags a
   * touch while running, overshoots its spot by a few centimetres and
   * settles (arrive and settle). When a target suddenly accelerates, the dot
   * first leans back for 0.13 s, then goes (anticipation). The man on the
   * ball and anyone within 2.5 m of it follow a stiff, critically damped
   * spring and never wind up, so the ball never leaves his feet. */
  function Motion(o) {
    o = o || {};
    this.freq = o.freq || 2.6;          /* Hz, the ordinary player */
    this.damp = o.damp == null ? 0.62 : o.damp;
    this.tightFreq = o.tightFreq || 7;  /* Hz, near the ball */
    this.antic = o.antic == null ? 0.45 : o.antic;   /* metres, the most a wind-up leans back */
    this.anticT = 0.13;
    this.kick = o.kick || 6;            /* m/s faster than his team's shape: a sprint */
    this.s = {};
    this.winds = 0;                     /* how many wind-ups so far (for checks) */
  }
  Motion.prototype.reset = function () { this.s = {}; this.budget = 2; };
  Motion.prototype.step = function (players, dt, o) {
    o = o || {};
    var exact = clamp(o.exact || 0, 0, 1), ball = o.ball, out = [], i, p, s;
    dt = clamp(dt, 0, 0.1);
    /* at most two wind-ups at once, then one every 0.15 s: a resume must
     * not make the whole team twitch together */
    this.budget = Math.min(2, (this.budget == null ? 2 : this.budget) + dt / 0.15);
    /* pass 1: each target's velocity and acceleration, and each side's mean
     * acceleration (the whole shape sliding with the ball is not a sprint) */
    var info = [], mean = {};
    for (i = 0; i < players.length; i++) {
      p = players[i]; s = this.s[p.id];
      if (!s || Math.abs(p.x - s.tx) + Math.abs(p.y - s.ty) > 14) {
        s = this.s[p.id] = { x: p.x, y: p.y, vx: 0, vy: 0, tx: p.x, ty: p.y, tvx: 0, tvy: 0, wind: 0, calm: 0, since: 9, armed: false, rvx: 0, rvy: 0, dx: 0, dy: 0, amp: 0 };
      }
      var tvx = dt > 0 ? (p.x - s.tx) / dt : 0, tvy = dt > 0 ? (p.y - s.ty) / dt : 0;
      var ax = dt > 0 ? (tvx - s.tvx) / dt : 0, ay = dt > 0 ? (tvy - s.tvy) / dt : 0;
      info.push({ p: p, s: s, tvx: tvx, tvy: tvy, ax: ax, ay: ay });
      (mean[p.side] = mean[p.side] || []).push(info[info.length - 1]);
    }
    /* the median, not the mean: one man snapping to the ball must not make
     * his ten team-mates look like they sprint */
    function med(a, k) { var v = a.map(function (x) { return x[k]; }).sort(function (x, y) { return x - y; }); return v[v.length >> 1]; }
    for (var k0 in mean) { var L0 = mean[k0]; mean[k0] = { ax: med(L0, 'ax'), ay: med(L0, 'ay'), vx: med(L0, 'tvx'), vy: med(L0, 'tvy') }; }
    for (i = 0; i < info.length; i++) {
      var I = info[i], M2 = mean[I.p.side]; p = I.p; s = I.s;
      var tx = p.x, ty = p.y;
      var rvx = I.tvx - M2.vx, rvy = I.tvy - M2.vy;
      var kf = Math.min(1, dt / 0.08);
      s.rvx += (rvx - s.rvx) * kf; s.rvy += (rvy - s.rvy) * kf;
      var rsp = Math.sqrt(s.rvx * s.rvx + s.rvy * s.rvy);
      var tight = p.state === 'carrier' || (ball && (ball.z || 0) < 1.5 && Math.abs(ball.x - tx) < 2.5 && Math.abs(ball.y - ty) < 2.5);
      /* a sprint start: a man who has held his place in the team's shape
       * for 0.4 s suddenly runs out of it */
      if (rsp < this.kick * 0.45) { s.calm += dt; s.since = 0; s.armed = s.calm > 0.4; }
      else { if (s.calm > 0) s.since = 0; s.calm = 0; s.since += dt; }
      /* m3: no wind-up while play is stopped (d1 walks both teams into a
       * corner, a free kick or a throw-in: nobody sprints there) */
      if (!o.stopped && !tight && this.antic > 0 && exact < 0.5 && s.armed && s.since < 0.3 && rsp > this.kick && this.budget >= 1) {
        this.budget -= 1;
        s.wind = this.anticT; s.dx = -s.rvx / rsp; s.dy = -s.rvy / rsp; s.armed = false;
        s.amp = Math.min(this.antic, 0.03 * rsp + 0.12); this.winds++;
      }
      var w = TAU * (tight ? this.tightFreq : this.freq), z = tight ? 1 : this.damp;
      var hold = s.wind > 0 ? 0.2 : 1;  /* during the wind-up the spring barely pulls */
      var n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (var k = 0; k < n; k++) {
        var fx = w * w * hold * (tx - s.x) - 2 * z * w * s.vx, fy = w * w * hold * (ty - s.y) - 2 * z * w * s.vy;
        s.vx += fx * h; s.vy += fy * h; s.x += s.vx * h; s.y += s.vy * h;
      }
      var ox = 0, oy = 0;
      if (s.wind > 0) {
        var e = Math.sin(Math.PI * (1 - s.wind / this.anticT));
        ox = s.dx * s.amp * e; oy = s.dy * s.amp * e; s.wind -= dt;
      }
      s.tx = tx; s.ty = ty; s.tvx = I.tvx; s.tvy = I.tvy;
      var q = {}; for (var key in p) q[key] = p[key];
      q.x = lerp(s.x + ox, tx, exact); q.y = lerp(s.y + oy, ty, exact);
      out.push(q);
    }
    return out;
  };

  /* ================================================== 2. BALL FLIGHT
   * a and b are [x, y] metres, u is 0..1 through the flight.
   *   pass: the kicked ball slows as it rolls (fast off the foot); a pass
   *         over 10 m is clipped and leaves the ground a little (up to 1.2 m)
   *   lob:  a long ball: steady across the ground, rising to h (default from
   *         the distance, 4 to 9 m) and dropping at the receiver
   *   shot: fast from the boot and flat (under 1 m), still quick at the end */
  function flight(kind, a, b, u, h) {
    u = clamp(u, 0, 1);
    var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy), e, z;
    if (kind === 'lob' || kind === 'long' || kind === 'clearance') {
      e = u; z = (h || clamp(d * 0.3, 4, 9)) * 4 * u * (1 - u);
    } else if (kind === 'shot') {
      e = 1 - Math.pow(1 - u, 1.35);
      z = Math.min(h == null ? 0.9 : h, 1) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.8;
    } else {
      e = Ease.outQuad(u);
      z = clamp((d - 10) / 18, 0, 1) * 1.2 * Math.sin(Math.PI * u);
    }
    return { x: a[0] + dx * e, y: a[1] + dy * e, z: Math.max(0, z) };
  }

  /* the ball's recent path, resampled every 20 ms so it looks the same at
   * any frame rate; empty while the ball rolls slower than minSpeed m/s */
  function Trail(o) { o = o || {}; this.h = []; this.len = o.len || 0.16; this.minSpeed = o.minSpeed || 9; this.step = 0.02; }
  Trail.prototype.reset = function () { this.h = []; };
  Trail.prototype.push = function (t, b) {
    var H = this.h;
    if (H.length && t < H[0].t) H.length = 0;
    H.unshift({ t: t, x: b.x, y: b.y, z: b.z || 0 });
    while (H.length > 2 && t - H[H.length - 1].t > this.len + 0.1) H.pop();
  };
  Trail.prototype.get = function (t) {
    var H = this.h; if (H.length < 2) return [];
    var a = H[0], b = H[1], dtt = a.t - b.t;
    var sp = dtt > 0 ? Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)) / dtt : 0;
    if (sp < this.minSpeed) return [];
    var out = [], j = 0;
    for (var age = this.step; age <= this.len + 1e-6; age += this.step) {
      var tt = t - age;
      while (j < H.length - 1 && H[j + 1].t > tt) j++;
      if (j >= H.length - 1) break;
      var p = H[j], q = H[j + 1], f = p.t === q.t ? 0 : (p.t - tt) / (p.t - q.t);
      out.push({ x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), z: lerp(p.z, q.z, f) });
    }
    return out;
  };

  /* spin that follows the distance the ball actually travels (0.9 rad a metre) */
  function Spin() { this.a = 0; this.last = null; }
  Spin.prototype.step = function (b) {
    if (this.last) {
      var d = Math.sqrt((b.x - this.last.x) * (b.x - this.last.x) + (b.y - this.last.y) * (b.y - this.last.y));
      if (d < 8) this.a += d * 0.9;
    }
    this.last = { x: b.x, y: b.y };
    return this.a;
  };

  /* ================================================== 3. THE CLOCK
   * Game time that brakes to a stop instead of stopping dead: over D seconds
   * of real time the speed falls as (1 - u)^2, which covers D/3 of game
   * time, so braking starts D/3 before the stop and lands exactly on it.
   * resume(Ds) speeds back up as u^2 over Ds. rate is the fast-forward. */
  function Clock(g) { this.g = g || 0; this.rate = 1; this.mode = 'run'; this.stopT = null; this.D = 0; this.r = 0; this.g0 = 0; this.Ds = 0; }
  Clock.prototype.stopAt = function (t, D) { this.stopT = t; this.D = D || 0; };
  Clock.prototype.resume = function (Ds, fromT) {
    if (fromT != null) this.g = fromT;
    this.stopT = null; this.Ds = Ds || 0; this.r = 0; this.mode = this.Ds > 0 ? 'starting' : 'run';
  };
  Clock.prototype.speed = function () {
    if (this.mode === 'stopped') return 0;
    if (this.mode === 'braking') { var u = clamp(this.r / this.D, 0, 1); return (1 - u) * (1 - u); }
    if (this.mode === 'starting') { var v = clamp(this.r / this.Ds, 0, 1); return v * v; }
    return 1;
  };
  Clock.prototype.tick = function (dt) {
    var k = this.rate;
    if (this.mode === 'stopped') return this.g;
    if (this.mode === 'braking') {
      this.r += dt;
      var u = clamp(this.r / this.D, 0, 1);
      this.g = this.g0 + k * this.D / 3 * (1 - Math.pow(1 - u, 3));
      if (u >= 1) { this.g = this.stopT; this.mode = 'stopped'; }
      return this.g;
    }
    if (this.mode === 'starting') {
      this.r += dt; var v = clamp(this.r / this.Ds, 0, 1);
      this.g += dt * k * v * v;
      if (v >= 1) this.mode = 'run';
    } else this.g += dt * k;
    if (this.stopT != null) {
      var brake = this.D > 0 ? k * this.D / 3 : 0;
      if (this.g >= this.stopT - brake) {
        if (this.D > 0) { this.mode = 'braking'; this.r = 0; this.g0 = this.stopT - brake; this.g = this.g0; }
        else { this.g = this.stopT; this.mode = 'stopped'; }
      }
    }
    return this.g;
  };

  /* ================================================== 4. CAMERA
   * A zoom about a focus point, eased (time constant 0.15 s), that never
   * shows anything outside the board and never crops a point in `keep`
   * (all 22 players): when they do not all fit at the asked zoom, the zoom
   * is reduced until they do. Shake is "trauma": its square scales a few
   * pixels of smooth noise, decaying in about 0.35 s. */
  function Camera() { this.z = 1; this.cx = null; this.cy = null; this.trauma = 0; this.t = 0; this.sx = 0; this.sy = 0; this.lastZt = 1; }
  Camera.prototype.shake = function (amount) { if (!reducedMotion()) this.trauma = Math.min(1, this.trauma + amount); };
  Camera.prototype.reset = function () { this.z = 1; this.cx = null; this.cy = null; this.trauma = 0; };
  Camera.prototype.target = function (g, o) {
    var Z = reducedMotion() ? 1 : Math.max(1, o.zoom || 1), fx = g.w / 2, fy = g.h / 2, m = o.margin == null ? g.r + 10 : o.margin;
    if (o.focus) { fx = g.X(o.focus.x); fy = g.Y(o.focus.y); }
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    (o.keep || []).forEach(function (p) {
      var X = g.X(p.x), Y = g.Y(p.y);
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    });
    if (x1 >= x0) {
      x0 -= m; x1 += m; y0 -= m; y1 += m;
      Z = Math.min(Z, g.w / Math.max(1, x1 - x0), g.h / Math.max(1, y1 - y0));
      Z = Math.max(1, Z);
    }
    var vw = g.w / Z, vh = g.h / Z;
    /* pan toward the focus, but only part of the way: a push, not a jump */
    var pull = o.pull == null ? 0.7 : o.pull;
    var cx = lerp(g.w / 2, fx, pull), cy = lerp(g.h / 2, fy, pull);
    function fit(c, lo, hi, v, W) {
      var a = v / 2, b = W - v / 2;               /* the board */
      if (hi >= lo) { a = Math.max(a, hi - v / 2); b = Math.min(b, lo + v / 2); }  /* the players */
      return a <= b ? clamp(c, a, b) : (a + b) / 2;
    }
    cx = fit(cx, x0, x1, vw, g.w); cy = fit(cy, y0, y1, vh, g.h);
    return { z: Z, cx: cx, cy: cy };
  };
  Camera.prototype.update = function (dt, g, o) {
    var T = this.target(g, o || {}), k = 1 - Math.exp(-dt / 0.15);
    if (this.cx == null) { this.cx = g.w / 2; this.cy = g.h / 2; }
    this.z += (T.z - this.z) * k; this.cx += (T.cx - this.cx) * k; this.cy += (T.cy - this.cy) * k;
    /* a reached target stays exact (no drifting sub-pixel) */
    if (Math.abs(T.z - this.z) < 1e-4) this.z = T.z;
    this.lastZt = T.z;
    /* the eased view is re-fitted inside the board every frame */
    var vw = g.w / this.z, vh = g.h / this.z;
    this.cx = clamp(this.cx, vw / 2, g.w - vw / 2); this.cy = clamp(this.cy, vh / 2, g.h - vh / 2);
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
    var a = this.trauma * this.trauma * 4.5, t = this.t;
    this.sx = a * (0.6 * Math.sin(t * 53 + 1.3) + 0.4 * Math.sin(t * 97 + 0.4));
    this.sy = a * (0.6 * Math.sin(t * 61 + 2.1) + 0.4 * Math.sin(t * 89 + 5.2));
    this.g = g;
  };
  /* ctx transform: CSS px of the pitch -> device px of the page canvas */
  Camera.prototype.matrix = function (dpr) {
    var g = this.g, z = this.z;
    return [dpr * z, 0, 0, dpr * z, dpr * (g.w / 2 - this.cx * z + this.sx), dpr * (g.h / 2 - this.cy * z + this.sy)];
  };
  Camera.prototype.apply = function (ctx, dpr) { var m = this.matrix(dpr); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); };
  Camera.prototype.toScreen = function (px, py) {
    var g = this.g, z = this.z;
    return { x: g.w / 2 + (px - this.cx) * z + this.sx, y: g.h / 2 + (py - this.cy) * z + this.sy };
  };

  /* ================================================== 5. FREEZE OVERLAYS */
  /* a soft spotlight: the frame darkens away from the moment (screen space) */
  function vignette(ctx, w, h, sx, sy, amount, dark, R) {
    if (!(amount > 0.001)) return;
    R = R || Math.max(w, h);
    var gr = ctx.createRadialGradient(sx, sy, R * 0.16, sx, sy, R * 0.78);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.55, 'rgba(8,6,2,' + (0.07 * amount) + ')');
    gr.addColorStop(1, 'rgba(8,6,2,' + ((dark ? 0.26 : 0.2) * amount) + ')');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    /* a faint warm pool of light on the moment itself */
    var pl = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.16);
    pl.addColorStop(0, 'rgba(255,240,200,' + (0.10 * amount) + ')'); pl.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = pl; ctx.fillRect(sx - R * 0.16, sy - R * 0.16, R * 0.32, R * 0.32);
  }
  /* two rings leave the carrier when play stops (0.75 s), world space;
   * age < 0 draws nothing. p: {x, y} in CSS px. */
  function ringPulse(ctx, p, r, age, color) {
    if (age < 0 || age > 0.8) return;
    for (var i = 0; i < 2; i++) {
      var a = age - i * 0.14; if (a < 0 || a > 0.62) continue;
      var u = a / 0.62, e = Ease.outCubic(u);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.15 + 2.3 * e), 0, TAU);
      ctx.lineWidth = (i ? 1.6 : 2.6) * (1 - u) + 0.5;
      ctx.strokeStyle = rgba(color, (i ? 0.55 : 0.9) * (1 - u));
      ctx.stroke();
    }
  }
  /* a thin coloured glow inside the canvas edge (the verdict's colour) */
  function edgeGlow(ctx, w, h, color, amount) {
    if (!(amount > 0.001)) return;
    var b = Math.min(w, h) * 0.07;
    var sides = [[0, 0, w, b, 0, 0, 0, b], [0, h - b, w, b, 0, h, 0, h - b], [0, 0, b, h, 0, 0, b, 0], [w - b, 0, b, h, w, 0, w - b, 0]];
    sides.forEach(function (s) {
      var gr = ctx.createLinearGradient(s[4], s[5], s[6], s[7]);
      gr.addColorStop(0, rgba(color, 0.55 * amount)); gr.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gr; ctx.fillRect(s[0], s[1], s[2], s[3]);
    });
  }

  /* ================================================== 6. THE GOAL */
  /* The net: a mesh behind the goal line that bulges out where the ball hit
   * and wobbles back (0.9 s). end: 'top' (their goal) or 'bottom' (yours);
   * x: where the ball crossed, metres; strength in metres of bulge. */
  function netRipple(ctx, g, end, x, age, strength, ink) {
    if (age < 0 || age > 0.95) return;
    var top = end !== 'bottom', y0 = top ? PL : 0, d = top ? 1 : -1, depth = 2.2, x0 = 30.34, x1 = 37.66;
    var env = (1 - Math.exp(-age * 30)) * Math.exp(-age * 3.6) * Math.cos(age * 11);
    var fade = age > 0.7 ? 1 - (age - 0.7) / 0.25 : 1;
    function pt(mx, md) {       /* mx metres across, md 0..1 into the net */
      var fx = (mx - x0) / (x1 - x0), gs = Math.exp(-((mx - x) * (mx - x)) / 9);
      var push = strength * env * gs * Math.sin(Math.PI * clamp(fx, 0, 1)) * md;
      return [g.X(mx), g.Y(y0 + d * (md * depth + push))];
    }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 1.1; ctx.strokeStyle = ink || 'rgba(255,255,255,0.8)'; ctx.lineCap = 'round';
    /* the stretched net, filled faintly so the bulge reads as a shape */
    ctx.beginPath(); var pp = pt(x0, 0); ctx.moveTo(pp[0], pp[1]);
    for (var fi = 0; fi <= 24; fi++) { pp = pt(lerp(x0, x1, fi / 24), 1); ctx.lineTo(pp[0], pp[1]); }
    pp = pt(x1, 0); ctx.lineTo(pp[0], pp[1]); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    var cols = 12, rows = 4, i, j, p;
    for (i = 0; i <= cols; i++) {      /* lines running back from the goal line */
      var mx = lerp(x0, x1, i / cols); ctx.beginPath();
      for (j = 0; j <= 8; j++) { p = pt(mx, j / 8); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }
    for (j = 1; j <= rows; j++) {      /* lines across */
      ctx.beginPath();
      for (i = 0; i <= 24; i++) { p = pt(lerp(x0, x1, i / 24), j / rows); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.lineWidth = j === rows ? 2 : 1.1; ctx.stroke();
    }
    ctx.restore();
  }
  /* how far the net (and a ball resting in it) is pushed back, metres */
  function netPush(x, age, strength) {
    if (age < 0 || age > 0.95) return 0;
    var env = (1 - Math.exp(-age * 30)) * Math.exp(-age * 3.6) * Math.cos(age * 11);
    return strength * env * Math.exp(-((x - 34) * (x - 34)) / 30);
  }

  /* Confetti on a board seen from above: a burst that spreads, flutters
   * (each piece flips as it turns), slows and settles, fading in 1.4 s.
   * Positions in CSS px of the pitch (world space). */
  function Particles(seed) { this.p = []; this.R = rng(seed || 99); }
  Particles.prototype.reset = function () { this.p = []; };
  Particles.prototype.confetti = function (x, y, colors, n, dir) {
    var R = this.R; dir = dir == null ? Math.PI / 2 : dir;
    for (var i = 0; i < n; i++) {
      var a = dir + (R() - 0.5) * Math.PI * 1.25, v = 90 + R() * 210;
      this.p.push({ x: x + (R() - 0.5) * 16, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: R() * TAU, vr: (R() - 0.5) * 16,
        flip: R() * TAU, vf: 6 + R() * 10, life: 1.0 + R() * 0.45, age: 0, c: colors[i % colors.length], w: 3 + R() * 2.4, h: 1.8 + R() * 1.2 });
    }
  };
  Particles.prototype.step = function (dt) {
    var keep = [];
    for (var i = 0; i < this.p.length; i++) {
      var q = this.p[i]; q.age += dt; if (q.age >= q.life) continue;
      var drag = Math.exp(-dt * 3.2);
      q.vx *= drag; q.vy *= drag; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.flip += q.vf * dt;
      keep.push(q);
    }
    this.p = keep;
  };
  Particles.prototype.draw = function (ctx) {
    for (var i = 0; i < this.p.length; i++) {
      var q = this.p[i], u = q.age / q.life;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(q.flip))));
      ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      ctx.restore();
    }
  };
  Particles.prototype.count = function () { return this.p.length; };

  /* The celebration: the scorer runs to the nearer corner flag of the end he
   * scored at, team-mates within 45 m join him one after another and
   * gather round him; the other side's keeper is left beaten. Deflated
   * (a goal against the user seen from the user's side): the scorer runs only
   * part of the way, two team-mates join, and it is over sooner.
   * o: {scorer: id, side: 'you'|'them', deflated, from: players at the goal} */
  function Celebration(o) {
    this.o = o; this.len = o.deflated ? 1.8 : 2.6;
    var from = {}, sc = null;
    o.from.forEach(function (p) { from[p.id] = { x: p.x, y: p.y }; if (p.id === o.scorer) sc = p; });
    this.from = from;
    var up = o.side === 'you';
    var cx = sc.x < 34 ? 2.2 : PW - 2.2, cy = up ? PL - 2.6 : 2.6;
    if (o.deflated) { cx = lerp(sc.x, cx, 0.55); cy = lerp(sc.y, cy, 0.55); }
    this.corner = { x: cx, y: cy };
    /* who joins, nearest first */
    var mates = o.from.filter(function (p) { return p.side === o.side && p.id !== o.scorer && !p.keeper; })
      .map(function (p) { return { id: p.id, d: Math.hypot(p.x - sc.x, p.y - sc.y) }; })
      .filter(function (m) { return m.d < 45; }).sort(function (a, b) { return a.d - b.d; });
    if (o.deflated) mates = mates.slice(0, 2); else mates = mates.slice(0, 5);
    var inward = Math.atan2((up ? -1 : 1), cx < 34 ? 1 : -1);   /* from the corner into the pitch */
    this.join = {};
    var self = this;
    mates.forEach(function (m, i) {
      var a = inward + (i - (mates.length - 1) / 2) * 0.55, r = 3.6 + (i % 2) * 1.2;
      self.join[m.id] = { delay: 0.25 + i * 0.13, x: clamp(cx + Math.cos(a) * r, 1.2, PW - 1.2), y: clamp(cy + Math.sin(a) * r, 1.2, PL - 1.2) };
    });
  }
  Celebration.prototype.apply = function (players, age) {
    var o = this.o, self = this, run = o.deflated ? 1.2 : 1.05;
    return players.map(function (p) {
      var q = {}; for (var k in p) q[k] = p[k];
      var f = self.from[p.id] || p;
      if (p.id === o.scorer) {
        var u = Ease.inOutCubic(age / run);
        q.x = lerp(f.x, self.corner.x, u); q.y = lerp(f.y, self.corner.y, u); q.state = 'carrier';
        if (!o.deflated && age > run) {   /* a little jump on arrival */
          var j = Math.max(0, Math.sin((age - run) * 9)) * 0.5 * Math.exp(-(age - run) * 2);
          q.y += (o.side === 'you' ? -1 : 1) * j;
        }
      } else if (self.join[p.id]) {
        var J = self.join[p.id], v = Ease.inOutCubic((age - J.delay) / 1.2);
        q.x = lerp(f.x, J.x, v); q.y = lerp(f.y, J.y, v); q.state = null;
      } else {
        q.x = f.x; q.y = f.y; q.state = null;
        if (p.keeper && p.side !== o.side && age > 0.15) q.state = 'beaten';
      }
      return q;
    });
  };

  /* ================================================== 7. THE CROWD
   * Two thin rows of heads round the edge of the canvas (screen space, so
   * the camera never pushes them onto the pitch): home colours along the
   * user's half, away colours along theirs. They sway more and faster as
   * the tension rises; the scoring side jumps after a goal. */
  function tensionFor(ball) {
    if (!ball || typeof ball.y !== 'number') return 0.3;
    var d = Math.min(ball.y, PL - ball.y);
    return clamp(1 - (d - 8) / 38, 0.12, 1);
  }
  var HOME = ['#c8102e', '#c8102e', '#ffd23f', '#8a1020', '#f2e6d0'];
  var AWAY = ['#6cace4', '#ffffff', '#6cace4', '#2a6fb5', '#f2e6d0'];
  function Crowd(o) { o = o || {}; this.home = o.home || HOME; this.away = o.away || AWAY; this.key = null; }
  Crowd.prototype.layout = function (g, w, h) {
    var key = w + 'x' + h + ':' + g.px, R = rng(4242), heads = [];
    if (this.key === key) return;
    var self = this;   /* m2: the palettes passed in (juice1 always used HOME and AWAY) */
    var band = Math.max(4.5, g.px * 0.42), r = clamp(band * 0.2, 1.05, 1.75), gap = r * 2.5;
    [band * 0.28, band * 0.72].forEach(function (inset, row) {
      /* walk the rectangle's perimeter */
      var per = 2 * (w + h - 4 * inset), n = Math.floor(per / gap);
      for (var i = 0; i < n; i++) {
        var s = i * gap + (row ? gap / 2 : 0) + (R() - 0.5) * gap * 0.35, x, y, nx, ny;
        var W2 = w - 2 * inset, H2 = h - 2 * inset;
        if (s < W2) { x = inset + s; y = inset; nx = 0; ny = 1; }
        else if (s < W2 + H2) { x = w - inset; y = inset + s - W2; nx = -1; ny = 0; }
        else if (s < 2 * W2 + H2) { x = w - inset - (s - W2 - H2); y = h - inset; nx = 0; ny = -1; }
        else { x = inset; y = h - inset - (s - 2 * W2 - H2); nx = 1; ny = 0; }
        var home = y > h / 2;
        var pal = home ? self.home : self.away;
        heads.push({ x: x, y: y, nx: nx, ny: ny, home: home, c: pal[Math.floor(R() * pal.length)], ph: R() * TAU, f: 0.8 + R() * 0.5 });
      }
    });
    var groups = {};
    heads.forEach(function (hd) { (groups[hd.c] = groups[hd.c] || []).push(hd); });
    this.groups = Object.keys(groups).map(function (c) { return { c: c, heads: groups[c] }; });
    this.r = r; this.band = band; this.key = key; this.n = heads.length;
  };
  /* cheer: {side: 'home'|'away', amount 0..1} */
  Crowd.prototype.draw = function (ctx, g, w, h, t, tension, cheer, dark, reduced) {
    this.layout(g, w, h);
    var r = this.r, amp = reduced ? 0 : r * (0.35 + 1.5 * tension), fr = 1.1 + 2.2 * tension;
    ctx.save();
    /* the stand: a dark strip the heads sit in, so they read as people */
    var b = this.band;
    ctx.fillStyle = dark ? 'rgba(10,8,6,0.85)' : 'rgba(38,30,22,0.82)';
    ctx.fillRect(0, 0, w, b); ctx.fillRect(0, h - b, w, b); ctx.fillRect(0, b, b, h - 2 * b); ctx.fillRect(w - b, b, b, h - 2 * b);
    ctx.globalAlpha = dark ? 0.62 + 0.3 * tension : 0.7 + 0.25 * tension;
    for (var gi = 0; gi < this.groups.length; gi++) {
      var G = this.groups[gi];
      ctx.beginPath();
      for (var i = 0; i < G.heads.length; i++) {
        var hd = G.heads[i], sway = amp * Math.sin(t * fr * hd.f * 2.2 + hd.ph);
        var jump = 0;
        if (cheer && cheer.amount > 0 && !reduced && (cheer.side === 'home') === hd.home) jump = cheer.amount * r * 1.6 * Math.abs(Math.sin(t * 9 + hd.ph));
        /* sway along the edge, jump in toward the pitch */
        var x = hd.x + hd.ny * sway + hd.nx * jump, y = hd.y + hd.nx * sway + hd.ny * jump;
        ctx.rect(x - r, y - r, r * 2, r * 2);
      }
      ctx.fillStyle = G.c; ctx.fill();
    }
    ctx.restore();
  };

  /* ================================================== 8. DICE, VERDICT, SCORE (DOM)
   * All three are pure functions of an age in seconds, so the page can
   * draw any instant exactly (and a still screenshot shows the real thing). */
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function faceHTML(n) {
    var s = ''; for (var i = 0; i < 9; i++) s += PIPS[n].indexOf(i) >= 0 ? '<i></i>' : '<b></b>';
    return s;
  }
  /* st: {mine, theirs, winner: 'mine'|'theirs'|null, color, rollFor: seconds}
   * age < 0: hidden; 0..rollFor: tumbling; then landed with a pop; the
   * winner's die glows from landing + 0.26 s (the verdict) */
  function diceView(els, st, age, reduced) {
    var roll = st.rollFor == null ? 0.65 : st.rollFor;
    els.forEach(function (el, i) {
      var final = i === 0 ? st.mine : st.theirs, face, tf = '', glow = '';
      if (age < 0) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      if (age < roll && !reduced) {
        var k = Math.floor(age / 0.08), R = rng(k * 7 + i * 131 + 5);
        face = 1 + Math.floor(R() * 6);
        var ph = age * 11 + i * 1.7;
        tf = 'translateY(' + (-Math.abs(Math.sin(ph)) * 6).toFixed(1) + 'px) rotate(' + (Math.sin(ph * 1.3) * 24).toFixed(1) + 'deg)';
      } else {
        face = final;
        var a = age - roll;
        if (!reduced && a < 0.3) tf = 'scale(' + (1 + 0.38 * (1 - Ease.outBack(a / 0.3, 2.4))).toFixed(3) + ')';
        if (st.winner && ((st.winner === 'mine') === (i === 0)) && a > 0.26) {
          var gl = Math.min(1, (a - 0.26) / 0.15);
          glow = '0 0 0 ' + (3 * gl).toFixed(1) + 'px ' + rgba(st.color, 0.85) + ', 0 0 ' + (14 * gl).toFixed(1) + 'px ' + rgba(st.color, 0.6);
        }
      }
      if (el._face !== face) { el.innerHTML = faceHTML(face); el._face = face; }
      el.style.transform = tf; el.style.boxShadow = glow;
    });
  }
  /* the verdict line pops in (1.35 to 1, overshooting) and the banner
   * flashes in the verdict's colour, settling to a light tint */
  function verdictView(el, box, cls, color, age, reduced) {
    if (age < 0) { el.style.opacity = '0'; el.style.transform = ''; if (box) { box.style.backgroundColor = ''; box.style.borderColor = ''; } return; }
    el.style.opacity = String(Math.min(1, age / 0.08));
    el.style.transform = reduced ? '' : 'scale(' + (1 + 0.35 * (1 - Ease.outBack(age / 0.32, 2.2))).toFixed(3) + ')';
    if (box) {
      var fl = reduced ? 0.12 : 0.12 + 0.3 * Math.exp(-age * 5);
      box.style.backgroundColor = rgba(color, fl);
      box.style.borderColor = rgba(color, 0.75);
    }
  }
  /* the score: the old number slides up and out, the new one comes up from
   * below; 'goal' pops it to 1.7x with a wobble and a flash of the team
   * colour, 'conceded' drops it in quietly with a red tint that fades */
  function scoreView(el, from, to, age, kind, color, reduced) {
    var oldEl = el.querySelector('.jz-old'), newEl = el.querySelector('.jz-new');
    if (!oldEl) { el.innerHTML = '<span class="jz-old"></span><span class="jz-new"></span>'; oldEl = el.querySelector('.jz-old'); newEl = el.querySelector('.jz-new'); }
    if (age < 0 || from === to) { oldEl.textContent = ''; newEl.textContent = String(age < 0 ? from : to); newEl.style.transform = ''; el.style.transform = ''; el.style.backgroundColor = ''; el.style.color = ''; return; }
    oldEl.textContent = String(from); newEl.textContent = String(to);
    var u = reduced ? 1 : Ease.outCubic(age / 0.12);
    oldEl.style.transform = 'translateY(' + (-100 * u).toFixed(1) + '%)'; oldEl.style.opacity = String(1 - u);
    newEl.style.transform = 'translateY(' + (100 * (1 - u)).toFixed(1) + '%)'; newEl.style.opacity = String(u);
    if (kind === 'goal') {
      var pa = age - 0.08, s = reduced || pa < 0 ? 1 : 1 + 0.7 * Math.exp(-pa * 6) * Math.cos(pa * 13) * Math.min(1, pa / 0.04);
      el.style.transform = 'scale(' + s.toFixed(3) + ')';
      el.style.backgroundColor = rgba(color, Math.max(0, 0.9 * Math.exp(-age * 2.2)));
      el.style.color = age < 0.9 ? '#fff' : '';
    } else {
      el.style.transform = reduced ? '' : 'translateY(' + (3 * Math.exp(-age * 5)).toFixed(2) + 'px)';
      el.style.backgroundColor = '';
      el.style.color = age < 1.4 ? color : '';
    }
  }

  var CSS = '.jz-die{display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);width:40px;height:40px;padding:5px;box-sizing:border-box;' +
    'background:var(--die,#fbf7ee);border:2px solid var(--die-pip,#2a2217);border-radius:9px;box-shadow:0 2px 0 var(--die-pip,#2a2217);will-change:transform}' +
    '.jz-die i{width:7px;height:7px;border-radius:50%;background:var(--die-pip,#2a2217);place-self:center}.jz-die b{display:block}' +
    '.jz-score{position:relative;display:inline-block;overflow:hidden;min-width:1.2em;text-align:center;border-radius:6px;vertical-align:bottom;will-change:transform}' +
    '.jz-score .jz-old{position:absolute;left:0;right:0;top:0}.jz-score .jz-new{display:block}';
  function injectCSS(doc) {
    doc = doc || (root.document);
    if (!doc || doc.getElementById('jz-css')) return;
    var s = doc.createElement('style'); s.id = 'jz-css'; s.textContent = CSS; doc.head.appendChild(s);
  }

  api.reducedMotion = reducedMotion;
  api.Motion = Motion; api.flight = flight; api.Trail = Trail; api.Spin = Spin;
  api.Clock = Clock; api.Camera = Camera;
  api.vignette = vignette; api.ringPulse = ringPulse; api.edgeGlow = edgeGlow;
  api.netRipple = netRipple; api.netPush = netPush; api.Particles = Particles; api.Celebration = Celebration;
  api.Crowd = Crowd; api.tensionFor = tensionFor;
  api.diceView = diceView; api.verdictView = verdictView; api.scoreView = scoreView; api.faceHTML = faceHTML; api.injectCSS = injectCSS;
  api.rgba = rgba; api.rng = rng;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CanteraJuice = api;
})(typeof window !== 'undefined' ? window : globalThis);
