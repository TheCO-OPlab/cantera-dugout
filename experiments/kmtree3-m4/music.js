/* music.js: KMMusic, adaptive match music (study vo1).
 *
 * Web Audio, synthesised, no samples, no network. Off by default. Safe in
 * node or without Web Audio: every call then does nothing and returns false.
 *
 * One steady loop at 104 beats a minute, 4 beats a bar (a bar is 2.31 s),
 * four chords (I vi IV V, or i VI iv v in the minor), with layers that follow
 * the match. Layers change only ON A BAR LINE, fading over one beat, so the
 * music never jumps mid-phrase:
 *   bed     a soft pad and a bass note: always, a little lower while frozen
 *   pulse   plucked eighth notes: grows as the ball nears either box
 *   drone   a low held fifth with a slow filter sweep: only while a moment is
 *           frozen, waiting for the choice
 *   sting   one-shots, on the next BEAT (not bar): a rising figure after a goal
 *           for you, a falling one after a goal against
 * Harmony follows the score: level = the home key (D major); each goal of
 * lead moves the key up a whole tone (at most two); a goal against turns the
 * music minor (for 4 bars if you still lead, until you draw level if not).
 * Full time: the loop fades on the next bar and a two-chord close plays.
 *
 *   KMMusic.init()                  from a user gesture; idempotent
 *   KMMusic.setEnabled(b) / isEnabled()   off by default, remembered
 *   KMMusic.state({zone, ballY, frozen, scoreDiff, minute, over})
 *        zone: an engine zone name ('midfield', 'their box', 'edge of your
 *        box', ...) or ballY in metres (0 = your goal line, 105 = theirs).
 *        Any field left out keeps its last value.
 *   KMMusic.duck(on)                the commentator is speaking: 6 dB down
 *   KMMusic.setVolume(v)            0..1, the gain is its square; when snd1's
 *                                   KMSound is present its volume and mute are followed
 *   KMMusic.plan(state, prev)       pure: the layer levels and key for a state
 *   KMMusic.render(timeline, opts)  offline render (OfflineAudioContext) of
 *        [{t, state}] calls, with the same scheduler as live play
 *   KMMusic.info()                  bar, key, layer targets (for a display)
 *
 * Variation uses its own generator, never Math.random and never the match
 * RNG, so an offline render repeats exactly and music can never change a match. */
(function (root) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : null;
  var AC = W && (W.AudioContext || W.webkitAudioContext);
  var OAC = W && (W.OfflineAudioContext || W.webkitOfflineAudioContext);

  var BPM = 104, BEAT = 60 / BPM, BAR = BEAT * 4, FADE = BEAT;
  var HOME = 50;             /* D3 as a MIDI note */
  var OUT_GAIN = 0.135;        /* the whole music bus, tuned in LEVELS.md: at least 8 dB under the cues */
  var DUCK_DB = -6;
  var LAYERS = ['bed', 'pulse', 'drone', 'sting'];
  /* chords as semitones from the key's root */
  var PROG = {
    major: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    minor: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -2, 2]]
  };
  /* for testing the click check: switch layers instantly instead of fading */
  var BREAK = { hardSwitch: false, immediate: false };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function db(x) { return Math.pow(10, x / 20); }
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================================================================ PLAN
   * Pure: what the layers and the key should be for a match state. */
  var ZONE_Y = {
    'your box': 8, 'edge of your box': 20, 'your half': 28, 'midfield': 52.5,
    'their half': 77, 'edge of their box': 80, 'their box': 97
  };
  function proximityOf(s) {
    var y = typeof s.ballY === 'number' ? s.ballY : (s.zone != null && ZONE_Y[String(s.zone).toLowerCase()] != null ? ZONE_Y[String(s.zone).toLowerCase()] : 52.5);
    var d = Math.min(y, 105 - y);                 /* metres from the nearer goal line */
    /* 0 in midfield (35 m or more out), 1 inside a box (16.5 m) */
    return clamp((35 - d) / (35 - 16.5), 0, 1);
  }
  function plan(s, prev) {
    s = s || {};
    var prox = proximityOf(s);
    var diff = s.scoreDiff | 0;
    var lead = clamp(diff, 0, 2);
    var minor = diff < 0 || !!s.recentConcede;
    /* the pulse in three steps, so small moves of the ball do not keep
     * changing it: off, half, full */
    var pulse = prox < 0.2 ? 0 : prox < 0.65 ? 0.55 : 1;
    return {
      over: !!s.over,
      frozen: !!s.frozen,
      prox: prox,
      key: HOME + 2 * lead,
      mode: minor ? 'minor' : 'major',
      levels: {
        bed: s.frozen ? 0.6 : 1,
        pulse: s.frozen ? pulse * 0.45 : pulse,
        drone: s.frozen ? 1 : 0,
        sting: 1
      }
    };
  }

  /* ================================================================ ENGINE
   * One per audio context (the live one or an offline one). All times are
   * explicit, so the same code plays live or renders a whole timeline. */
  function Engine(ctx, dest, seed) {
    this.ctx = ctx;
    this.rnd = makeRng(seed || 104);
    this.out = ctx.createGain(); this.out.gain.value = OUT_GAIN; this.out.connect(dest);
    this.duckG = ctx.createGain(); this.duckG.gain.value = 1; this.duckG.connect(this.out);
    this.bus = {}; this.level = {};
    var self = this;
    LAYERS.forEach(function (n) {
      var g = ctx.createGain(); g.gain.value = 0; g.connect(self.duckG);
      self.bus[n] = g; self.level[n] = 0;
    });
    this.bus.sting.gain.value = 1; this.level.sting = 1;
    this.t0 = null;            /* time of bar 0 */
    this.nextBar = null;       /* start time of the next bar to schedule */
    this.bar = 0;
    this.want = { scoreDiff: 0 };   /* the latest state asked for */
    this.cur = null;                /* the plan in force */
    this.concedeBars = 0;
    this.lastDiff = 0;
    this.ended = false;
    this.drone = null;
    this.events = [];         /* [{bar, at, what}] for the checks */
    this.solo = null;
  }
  var E = Engine.prototype;

  E.startAt = function (t) {
    this.t0 = t; this.nextBar = t; this.bar = 0; this.ended = false;
    this.cur = plan(this.want);
    this.key = this.cur.key; this.mode = this.cur.mode;
  };
  /* a fade of one layer, starting exactly on bar line T */
  E.fadeTo = function (name, target, T) {
    if (this.solo && this.solo !== name) target = 0;
    var g = this.bus[name].gain, from = this.level[name];
    if (Math.abs(from - target) < 1e-4) return;
    g.cancelScheduledValues(T);
    if (BREAK.hardSwitch) g.setValueAtTime(target, T);
    else { g.setValueAtTime(from, T); g.linearRampToValueAtTime(target, T + FADE); }
    this.level[name] = target;
    this.events.push({ bar: this.bar, at: T, what: 'fade ' + name + ' ' + from.toFixed(2) + '>' + target.toFixed(2) });
  };
  /* the new state asked for; returns stings to play on the next beat */
  E.request = function (s, t) {
    var w = this.want, k;
    for (k in s) if (s[k] !== undefined) w[k] = s[k];
    var diff = w.scoreDiff | 0, out = null;
    if (BREAK.immediate && this.t0 != null) {
      var bp = plan(w), self = this;
      LAYERS.forEach(function (n) { if (n !== 'sting') self.fadeTo(n, bp.levels[n], t); });
    }
    if (this.t0 != null && diff !== this.lastDiff) {
      out = diff > this.lastDiff ? 'goal' : 'conceded';
      if (out === 'conceded') this.concedeBars = diff >= 0 ? 4 : 0;
      else this.concedeBars = 0;
      this.lastDiff = diff;
      this.playSting(out, this.nextBeat(t));
    }
    return out;
  };
  E.nextBeat = function (t) {
    if (this.t0 == null) return t;
    var n = Math.ceil((t + 0.03 - this.t0) / BEAT - 1e-9);
    return this.t0 + n * BEAT;
  };
  /* schedule every bar that starts before `until` */
  E.schedule = function (until) {
    if (this.t0 == null || this.ended) return;
    while (this.nextBar < until) {
      var T = this.nextBar;
      var ws = {}; for (var k in this.want) ws[k] = this.want[k];
      if (this.concedeBars > 0) { ws.recentConcede = true; this.concedeBars--; }
      var p = plan(ws, this.cur);
      if (p.over) { this.finale(T); this.ended = true; return; }
      /* a key or mode change also lands on the bar line */
      if (p.key !== this.key || p.mode !== this.mode) {
        this.events.push({ bar: this.bar, at: T, what: 'key ' + this.key + ' ' + this.mode + ' > ' + p.key + ' ' + p.mode });
        this.key = p.key; this.mode = p.mode;
      }
      this.prev = {}; for (var q in this.level) this.prev[q] = this.level[q];
      for (var i = 0; i < LAYERS.length; i++) {
        var n = LAYERS[i];
        if (n !== 'sting') this.fadeTo(n, p.levels[n], T);
      }
      this.cur = p;
      this.playBar(T);
      this.bar++;
      this.nextBar = this.t0 + this.bar * BAR;
    }
  };
  E.chord = function () { return PROG[this.mode][this.bar % 4]; };

  /* ---------------------------------------------------------- voices */
  E.note = function (dest, t, f, o) {
    var ctx = this.ctx;
    var osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    var g = ctx.createGain();
    var a = o.attack || 0.01, len = o.len, rel = o.release || 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + a);
    if (o.decayTo != null) g.gain.linearRampToValueAtTime(o.gain * o.decayTo, t + a + (o.decay || len * 0.5));
    g.gain.setValueAtTime(o.gain * (o.decayTo != null ? o.decayTo : 1), t + len);
    g.gain.linearRampToValueAtTime(0, t + len + rel);
    var node = osc;
    if (o.cut) {
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 0.7;
      lp.frequency.setValueAtTime(o.cut, t);
      if (o.cut1) lp.frequency.exponentialRampToValueAtTime(o.cut1, t + len);
      osc.connect(lp); node = lp;
    }
    node.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + len + rel + 0.02);
  };
  E.playBar = function (T) {
    var ch = this.chord(), root = this.key, i, self = this;
    /* bed: a pad of the chord (two detuned triangles a voice, soft attack,
     * overlapping the next bar a little so bars join smoothly), and a bass */
    if (this.level.bed > 0 || this.prev.bed > 0) {
      ch.forEach(function (s, j) {
        var f = mtof(root + 12 + s);
        [-6, 6].forEach(function (dt) {
          self.note(self.bus.bed, T, f, { type: 'triangle', gain: 0.05, attack: 0.35, len: BAR - 0.1, release: 0.45, detune: dt + j, cut: 1400, q: 0.5 });
        });
      });
      this.note(this.bus.bed, T, mtof(root - 12 + ch[0] + (ch[0] < -4 ? 12 : 0)), { type: 'sine', gain: 0.22, attack: 0.02, len: BEAT * 1.6, decayTo: 0.6, decay: 0.3, release: 0.2 });
      this.note(this.bus.bed, T + 2 * BEAT, mtof(root - 12 + ch[0] + (ch[0] < -4 ? 12 : 0) + 7), { type: 'sine', gain: 0.14, attack: 0.02, len: BEAT * 1.4, decayTo: 0.6, decay: 0.3, release: 0.2 });
    }
    /* pulse: eighth notes, root and fifth an octave up, accented on the beat */
    if (this.level.pulse > 0 || this.prev.pulse > 0) {
      var pat = [0, 12, 7, 12, 0, 12, 7, 14];
      for (i = 0; i < 8; i++) {
        var acc = i % 2 === 0 ? 1 : 0.6;
        var f = mtof(root + ch[0] + (ch[0] < -4 ? 12 : 0) + pat[i]);
        this.note(this.bus.pulse, T + i * BEAT / 2, f, { type: 'sawtooth', gain: 0.16 * acc * this.vary(0.08), attack: 0.006, len: BEAT * 0.28, release: 0.06, cut: 2200, cut1: 500, q: 1.2 });
      }
    }
    /* drone: continuous oscillators, retuned on the bar line with a glide,
     * so the key can change under it without a restart */
    this.droneTo(T, mtof(root - 12 + ch[0] + (ch[0] < -4 ? 12 : 0)));
  };
  E.vary = function (c) { return 1 + (this.rnd() * 2 - 1) * c; };
  E.droneTo = function (T, f) {
    var ctx = this.ctx;
    if (!this.drone) {
      var d = this.drone = { oscs: [] };
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2.5;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 1 / (BAR * 2);
      var lfoG = ctx.createGain(); lfoG.gain.value = 220;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(T);
      /* a quiet high tremolo sine: the held breath */
      var hi = ctx.createOscillator(); hi.type = 'sine';
      var hiG = ctx.createGain(); hiG.gain.value = 0.012;
      var trem = ctx.createOscillator(); trem.frequency.value = BPM / 60 * 2;   /* eighth notes */
      var tremG = ctx.createGain(); tremG.gain.value = 0.008;
      trem.connect(tremG); tremG.connect(hiG.gain); hi.connect(hiG); hiG.connect(this.bus.drone);
      trem.start(T); hi.start(T);
      d.hi = hi;
      [[1, -7, 'sawtooth', 0.045], [1, 5, 'sawtooth', 0.045], [1.5, 0, 'sawtooth', 0.03], [0.5, 0, 'sine', 0.12]].forEach(function (v) {
        var o = ctx.createOscillator(); o.type = v[2]; o.detune.value = v[1];
        var g = ctx.createGain(); g.gain.value = v[3];
        o.connect(g); g.connect(lp); o.start(T);
        d.oscs.push({ o: o, mul: v[0] });
      });
      lp.connect(this.bus.drone);
      d.f = f;
      d.oscs.forEach(function (x) { x.o.frequency.setValueAtTime(f * x.mul, T); });
      hi.frequency.setValueAtTime(f * 8 * 1.5, T);
      return;
    }
    if (Math.abs(this.drone.f - f) < 0.01) return;
    this.drone.oscs.forEach(function (x) {
      x.o.frequency.setValueAtTime(this.drone.f * x.mul, T);
      x.o.frequency.exponentialRampToValueAtTime(f * x.mul, T + 0.25);
    }, this);
    this.drone.hi.frequency.setValueAtTime(this.drone.f * 12, T);
    this.drone.hi.frequency.exponentialRampToValueAtTime(f * 12, T + 0.25);
    this.drone.f = f;
  };
  /* a bright bell-like note for the stings */
  E.bell = function (t, m, gain, len) {
    var f = mtof(m), dest = this.bus.sting;
    this.note(dest, t, f, { type: 'triangle', gain: gain, attack: 0.005, len: len, decayTo: 0.35, decay: 0.12, release: 0.3, cut: 3200 });
    this.note(dest, t, f * 2.005, { type: 'sine', gain: gain * 0.3, attack: 0.004, len: len * 0.5, decayTo: 0.2, decay: 0.08, release: 0.2 });
  };
  E.playSting = function (kind, t) {
    this.events.push({ bar: this.bar, at: t, what: 'sting ' + kind });
    if (this.solo && this.solo !== 'sting') return;
    var r = HOME + 12 + 2 * clamp(this.want.scoreDiff | 0, 0, 2), s = BEAT / 3, self = this;
    if (kind === 'goal') {
      /* up through the new key's chord, and a held top note */
      [0, 4, 7, 12].forEach(function (x, i) { self.bell(t + i * s, r + x, 0.19, i === 3 ? BEAT * 1.8 : s * 1.1); });
      this.bell(t + 3 * s, r + 16, 0.09, BEAT * 1.8);
    } else {
      /* down, minor, slower */
      var m = HOME + 12;
      [7, 3, 0].forEach(function (x, i) { self.note(self.bus.sting, t + i * BEAT / 2, mtof(m + x), { type: 'triangle', gain: 0.12, attack: 0.02, len: i === 2 ? BEAT * 1.5 : BEAT * 0.45, release: 0.35, cut: 1500 }); });
    }
  };
  /* full time: every layer out over a beat, then a close: IV then I (or iv
   * then i when you lost), held and faded */
  E.finale = function (T) {
    var self = this;
    LAYERS.forEach(function (n) { if (n !== 'sting') self.fadeTo(n, 0, T); });
    this.events.push({ bar: this.bar, at: T, what: 'finale' });
    var lost = (this.want.scoreDiff | 0) < 0, r = this.key;
    var c1 = lost ? [5, 8, 12] : [5, 9, 12], c2 = lost ? [0, 3, 7] : [0, 4, 7];
    var dest = this.bus.sting;
    [[T + BEAT, c1, BAR * 0.75], [T + BEAT + BAR * 0.75, c2, BAR * 1.6]].forEach(function (c) {
      c[1].forEach(function (s, j) {
        self.note(dest, c[0], mtof(r + 12 + s), { type: 'triangle', gain: 0.05, attack: 0.08, len: c[2], release: c === c2 ? 1.6 : 0.3, detune: j * 3, cut: 1800 });
      });
      self.note(dest, c[0], mtof(r - 12 + c[1][0] - (c[1][0] >= 5 ? 12 : 0)), { type: 'sine', gain: 0.14, attack: 0.05, len: c[2], release: 1.2 });
    });
    this.endsAt = T + BEAT + BAR * 0.75 + BAR * 1.6 + 1.7;
    if (this.drone) {
      var d = this.drone, stopAt = T + FADE + 0.1;
      d.oscs.forEach(function (x) { try { x.o.stop(stopAt); } catch (e) { } });
      try { d.hi.stop(stopAt); } catch (e) { }
    }
  };
  E.duck = function (on, t) {
    var g = this.duckG.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(on ? db(DUCK_DB) : 1, t, on ? 0.08 : 0.3);
  };
  E.stopAll = function (t) {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.25);
    this.ended = true;
    if (this.drone) { var d = this.drone; d.oscs.forEach(function (x) { try { x.o.stop(t + 2); } catch (e) { } }); try { d.hi.stop(t + 2); } catch (e) { } }
  };

  /* ================================================================ LIVE */
  var LS_KEY = 'kmmusic.v1';
  var settings = { enabled: false, volume: 0.7 };
  try {
    var sv = W && W.localStorage && JSON.parse(W.localStorage.getItem(LS_KEY) || 'null');
    if (sv && typeof sv.enabled === 'boolean') settings.enabled = sv.enabled;
    if (sv && typeof sv.volume === 'number') settings.volume = clamp(sv.volume, 0, 1);
  } catch (e) { }
  function save() { try { if (W && W.localStorage) W.localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { } }

  var live = null, want = {}, ducked = false;
  function masterLevel() {
    var S = W && W.KMSound;
    if (S && S.isMuted && S.isMuted()) return 0;
    var v = S && S.getVolume ? S.getVolume() : settings.volume;
    return v * v;
  }
  function init() {
    if (!AC) return false;
    if (live) { try { if (live.ctx.state === 'suspended') live.ctx.resume(); } catch (e) { } return true; }
    try {
      var ctx = new AC();
      var master = ctx.createGain(); master.gain.value = masterLevel(); master.connect(ctx.destination);
      live = { ctx: ctx, master: master, eng: null };
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      live.timer = setInterval(tick, 100);
      if (settings.enabled) begin();
      return true;
    } catch (e) { live = null; return false; }
  }
  function begin() {
    if (!live || live.eng) return;
    var e = live.eng = new Engine(live.ctx, live.master, (Date.now() & 0xffff) + 1);
    for (var k in want) e.want[k] = want[k];
    e.lastDiff = want.scoreDiff | 0;
    e.startAt(live.ctx.currentTime + 0.1);
    e.out.gain.setValueAtTime(0, live.ctx.currentTime); e.out.gain.linearRampToValueAtTime(OUT_GAIN, live.ctx.currentTime + 1);
    if (ducked) e.duck(true, live.ctx.currentTime);
    e.schedule(live.ctx.currentTime + 0.35);
  }
  function end() {
    if (!live || !live.eng) return;
    live.eng.stopAll(live.ctx.currentTime);
    live.eng = null;
  }
  function tick() {
    if (!live) return;
    var lv = masterLevel();
    if (Math.abs(lv - (live.lastLv == null ? -1 : live.lastLv)) > 1e-3) { live.master.gain.setTargetAtTime(lv, live.ctx.currentTime, 0.05); live.lastLv = lv; }
    if (live.eng) live.eng.schedule(live.ctx.currentTime + 0.35);
  }
  function state(s) {
    if (!s) return false;
    var changed = false;
    for (var k in s) if (s[k] !== undefined && want[k] !== s[k]) { want[k] = s[k]; changed = true; }
    if (!live || !live.eng) return false;
    if (!changed) return true;
    /* a new match (score back to level at minute 0 after full time) restarts the loop */
    if (live.eng.ended && !want.over) { end(); begin(); return true; }
    live.eng.request(s, live.ctx.currentTime);
    return true;
  }
  function setEnabled(b) {
    settings.enabled = !!b; save();
    if (!live) return settings.enabled;
    if (settings.enabled) begin(); else end();
    return settings.enabled;
  }
  function duck(on) {
    ducked = !!on;
    if (live && live.eng) live.eng.duck(ducked, live.ctx.currentTime);
    return ducked;
  }
  function info() {
    var e = live && live.eng;
    if (!e) return null;
    var now = live.ctx.currentTime;
    return {
      bar: Math.floor((now - e.t0) / BAR), beat: Math.floor(((now - e.t0) % BAR) / BEAT) + 1,
      key: e.key, mode: e.mode, levels: Object.assign({}, e.level), ended: e.ended,
      nextBarIn: e.t0 + Math.ceil((now - e.t0) / BAR) * BAR - now
    };
  }

  /* ================================================================ OFFLINE
   * render(timeline, opts) -> Promise<{buffer, events, bar}>. timeline:
   * [{t, state}] calls at those seconds. The scheduler steps a virtual clock
   * in 25 ms ticks with the live look-ahead, so a render is what live play
   * would do. opts: duration, sampleRate, solo (one layer), seed, hardSwitch,
   * immediate (tests only: change at the call, not on the bar), duck: [{t, on}]. Master volume 1 (the worst case). */
  function render(timeline, opts) {
    opts = opts || {};
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    var sr = opts.sampleRate || 48000, dur = opts.duration || 10;
    var ctx = new OAC(2, Math.ceil(sr * dur), sr);
    BREAK.hardSwitch = !!opts.hardSwitch; BREAK.immediate = !!opts.immediate;
    var e = new Engine(ctx, ctx.destination, opts.seed || 104);
    e.solo = opts.solo || null;
    if (e.solo && e.solo !== 'sting') e.bus.sting.gain.value = 0;
    var tl = (timeline || []).slice().sort(function (a, b) { return a.t - b.t; });
    var dk = (opts.duck || []).slice();
    var i = 0, first = tl.length && tl[0].t <= 0 ? tl[i++].state : {};
    for (var k in first) e.want[k] = first[k];
    e.lastDiff = e.want.scoreDiff | 0;
    e.startAt(opts.start || 0.05);
    for (var t = 0; t <= dur; t += 0.025) {
      while (i < tl.length && tl[i].t <= t) { e.request(tl[i].state, tl[i].t); i++; }
      while (dk.length && dk[0].t <= t) { e.duck(dk[0].on, dk[0].t); dk.shift(); }
      e.schedule(t + 0.35);
    }
    return ctx.startRendering().then(function (buf) {
      BREAK.hardSwitch = false; BREAK.immediate = false;
      return { buffer: buf, events: e.events, t0: e.t0 };
    });
  }

  var KMMusic = {
    available: !!AC,
    BPM: BPM, BEAT: BEAT, BAR: BAR, FADE: FADE, OUT_GAIN: OUT_GAIN, DUCK_DB: DUCK_DB, LAYERS: LAYERS.slice(),
    init: init, state: state, duck: duck, info: info,
    setEnabled: setEnabled, isEnabled: function () { return settings.enabled; },
    toggle: function () { return setEnabled(!settings.enabled); },
    setVolume: function (v) { settings.volume = clamp(+v || 0, 0, 1); save(); return settings.volume; },
    isReady: function () { return !!live; },
    plan: plan, proximityOf: proximityOf, render: render
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = KMMusic;
  if (W) W.KMMusic = KMMusic;
})(this);
