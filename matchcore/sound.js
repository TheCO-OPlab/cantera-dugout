/* sound.js: KMSound, the synthesised sound of the pitch (component study snd1).
 *
 * Vanilla Web Audio. No samples, no network: every sound is built from
 * oscillators and noise at the moment it plays. Safe to load in node or in a
 * browser without Web Audio: then every call does nothing and returns false.
 *
 *   KMSound.init()               call from a user gesture (click, key); idempotent
 *   KMSound.unlockOn(el)         or: init on the first pointerdown/keydown on el
 *   KMSound.event(ev, opts)      a director event {kind, team, ball:{x,y}}: pass,
 *                                carry, dribble, tackle, interception, clearance,
 *                                shot, save, out, foul, kickoff (also "goal" = the net).
 *                                The ball's x pans it left/right; opts.speed (the
 *                                fast-forward rate) makes repeats quieter.
 *   KMSound.cue(name)            dice, good, mixed, bad, whistle, halftime, fulltime,
 *                                goal, conceded, ooh, select
 *   KMSound.verdict(cls)         'won' | 'half' | 'lost' (play.html's verdict classes)
 *   KMSound.crowd(on)            the crowd bed, on or off (on by default after init)
 *   KMSound.setTension(v)        0..1: how loud and bright the crowd is
 *   KMSound.tensionFor(ball)     0..1 from where the ball is (near a box = high)
 *   KMSound.duck(on)             m5 (vo1's request): while the commentator speaks,
 *                                the crowd bus 5 dB down and snd1's music bus 6 dB
 *                                down, over about a tenth of a second each way
 *   KMSound.music(name|null)     optional loop: 'moment' (a tense pulse) or 'menu';
 *                                only plays when the music setting is on (off by default)
 *   KMSound.setMusicEnabled(b)
 *   KMSound.setMuted(b) / toggleMute() / isMuted()
 *   KMSound.setVolume(v) / getVolume()      master, 0..1 (default 0.7; the gain is its square)
 *   KMSound.render(spec, opts)   offline render to an AudioBuffer (for level checks)
 *   KMSound.play(spec)           play any spec live: 'event:pass', 'cue:goal', ...
 *   KMSound.LIST                 every event and cue name, for a sound board
 *
 * Settings (muted, volume, music) are remembered in localStorage under
 * "kmsound.v1"; every access is wrapped, so a blocked storage just forgets.
 *
 * Variation uses its own small generator, never Math.random and never the
 * match RNG, so sound can never change a match, and an offline render is
 * repeatable (the level measurements in LEVELS.md are exact).
 */
(function (root) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : null;
  var AC = W && (W.AudioContext || W.webkitAudioContext);
  var OAC = W && (W.OfflineAudioContext || W.webkitOfflineAudioContext);

  var EVENTS = ['pass', 'carry', 'dribble', 'tackle', 'interception', 'clearance',
    'shot', 'save', 'out', 'foul', 'kickoff', 'goal'];
  var CUES = ['dice', 'good', 'mixed', 'bad', 'whistle', 'halftime', 'fulltime',
    'goal', 'conceded', 'ooh', 'select'];
  var MUSIC = ['moment', 'menu'];

  /* ------------------------------------------------------------ settings */
  var LS_KEY = 'kmsound.v1';
  var settings = { muted: false, volume: 0.7, music: false };
  function loadSettings() {
    try {
      var s = W && W.localStorage && W.localStorage.getItem(LS_KEY);
      if (!s) return;
      var o = JSON.parse(s);
      if (typeof o.muted === 'boolean') settings.muted = o.muted;
      if (typeof o.volume === 'number' && o.volume >= 0 && o.volume <= 1) settings.volume = o.volume;
      if (typeof o.music === 'boolean') settings.music = o.music;
    } catch (e) { }
  }
  function saveSettings() {
    try { if (W && W.localStorage) W.localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { }
  }
  loadSettings();

  /* ------------------------------------------------ variation generator */
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
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function db(x) { return Math.pow(10, x / 20); }

  /* ================================================================ ENGINE
   * One engine per audio context (the live one, or an offline one for a
   * measurement). Every voice takes an explicit start time t, so the same
   * code schedules a live sound or a whole offline sequence. */
  function Engine(ctx, out, seed) {
    this.ctx = ctx;
    this.rnd = makeRng(seed || 20260924);
    this.sfx = ctx.createGain(); this.sfx.connect(out);
    this.crowdBus = ctx.createGain(); this.crowdBus.connect(out);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(out);
    this.noise = makeNoise(ctx, 2, 'white', this.rnd);
    this.pink = makeNoise(ctx, 4, 'pink', this.rnd);
    this.bed = null;
    this.tension = 0.25;
    this.mus = null;
  }

  function makeNoise(ctx, seconds, kind, rnd) {
    var sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    var buf = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (var i = 0; i < n; i++) {
        var w = rnd() * 2 - 1;
        if (kind === 'pink') {
          /* Paul Kellet's pink filter */
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else d[i] = w;
      }
      /* a short crossfade so the loop point does not click */
      var fade = Math.floor(sr * 0.05);
      for (var j = 0; j < fade; j++) {
        var g = j / fade;
        d[n - fade + j] = d[n - fade + j] * (1 - g) + d[j] * g;
      }
    }
    return buf;
  }

  var P = Engine.prototype;
  P.vary = function (c) { return 1 + (this.rnd() * 2 - 1) * c; };

  /* a gain node with an attack and an exponential decay, starting at t */
  P.env = function (dest, t, attack, decay, peak, hold) {
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + (hold || 0) + decay);
    g.connect(dest);
    return g;
  };
  P.panner = function (dest, pan) {
    if (!pan || !this.ctx.createStereoPanner) return dest;
    var p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(dest);
    return p;
  };
  /* an oscillator gliding from f0 to f1 */
  P.tone = function (dest, o) {
    var ctx = this.ctx, t = o.t;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || o.dur));
    var end = t + (o.attack || 0.002) + (o.hold || 0) + o.dur;
    var g = this.env(dest, t, o.attack || 0.002, o.dur, o.gain, o.hold);
    osc.connect(g);
    osc.start(t); osc.stop(end + 0.05);
    return osc;
  };
  /* a burst of noise through a filter (which can sweep from f to f1) */
  P.noiseBurst = function (dest, o) {
    var ctx = this.ctx, t = o.t;
    var src = ctx.createBufferSource();
    src.buffer = o.pink ? this.pink : this.noise;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || o.dur));
    f.Q.value = o.Q == null ? 1 : o.Q;
    var g = this.env(dest, t, o.attack || 0.002, o.dur, o.gain, o.hold);
    src.connect(f); f.connect(g);
    var off = this.rnd() * (src.buffer.duration - 1);
    var end = t + (o.attack || 0.002) + (o.hold || 0) + o.dur + 0.05;
    src.start(t, off); src.stop(end);
    return src;
  };

  /* ------------------------------------------------------------ the kick
   * A kick is a short pitched thump (the body), a second partial an octave up
   * (so a laptop speaker, which cannot play 60 Hz, still hears it) and a
   * click of filtered noise (the boot meeting the ball). */
  P.kick = function (dest, t, o) {
    var v = this.vary(0.06), gv = this.vary(0.12);
    this.tone(dest, { t: t, f0: o.f0 * v, f1: o.f1 * v, dur: o.dur, gain: o.gain * gv, attack: 0.003 });
    this.tone(dest, { t: t, type: 'triangle', f0: o.f0 * 2 * v, f1: o.f1 * 2 * v, dur: o.dur * 0.7, gain: o.gain * 0.6 * gv, attack: 0.002 });
    if (o.click) this.noiseBurst(dest, { t: t, f: (o.clickF || 2400) * this.vary(0.1), Q: 0.9, dur: 0.02, gain: o.click * 1.5 * gv, attack: 0.001 });
  };
  /* air: the ball travelling, a falling band of noise */
  P.whoosh = function (dest, t, o) {
    this.noiseBurst(dest, { t: t, f: o.f * this.vary(0.08), f1: o.f1, sweep: o.dur, Q: 1.4, dur: o.dur, gain: o.gain, attack: o.dur * 0.35 });
  };

  /* ------------------------------------------------------------ whistle
   * A pea whistle: a tone near 2.9 kHz warbled by the pea (fast amplitude
   * and pitch wobble) with a little breath noise. Kept quiet: this band is
   * where the ear is most sensitive. */
  P.whistle = function (dest, t, len, gain) {
    var ctx = this.ctx, f = 2750 * this.vary(0.015), g = gain || 0.1;
    var osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 26 * this.vary(0.1);
    var lfoF = ctx.createGain(); lfoF.gain.value = 55;
    lfo.connect(lfoF); lfoF.connect(osc.frequency);
    var trem = ctx.createGain(); trem.gain.value = 0.6;
    var lfoA = ctx.createGain(); lfoA.gain.value = 0.35;
    lfo.connect(lfoA); lfoA.connect(trem.gain);
    var e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(g, t + 0.025);
    e.gain.setValueAtTime(g, t + len - 0.05);
    e.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(trem); trem.connect(e); e.connect(dest);
    osc.start(t); lfo.start(t); osc.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
    this.noiseBurst(dest, { t: t, f: f, Q: 5, dur: 0.06, hold: Math.max(0, len - 0.1), gain: g * 0.5, attack: 0.02 });
  };

  /* ------------------------------------------------------------ mallet
   * A soft struck note for the verdict stings: a sine with a quiet upper
   * partial, through a low-pass so nothing is sharp. */
  P.mallet = function (dest, t, f, gain, dur, type) {
    var lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(dest);
    this.tone(lp, { t: t, type: type || 'sine', f0: f, dur: dur, gain: gain, attack: 0.004 });
    this.tone(lp, { t: t, type: 'sine', f0: f * 2.01, dur: dur * 0.45, gain: gain * 0.22, attack: 0.003 });
    this.tone(lp, { t: t, type: 'sine', f0: f * 3.98, dur: dur * 0.18, gain: gain * 0.07, attack: 0.002 });
  };

  /* ------------------------------------------------------------ crowd voices
   * A crowd shout is pink noise through three vowel-like bands whose centres
   * move, under an envelope, with a fast random flutter (many voices). */
  P.crowdVoice = function (dest, t, o) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource(); src.buffer = this.pink; src.loop = true;
    var sum = ctx.createGain(); sum.gain.value = 1;
    var bands = o.bands || [[520, 1.2, 1], [1150, 1.6, 0.7], [2500, 2.2, 0.35]];
    bands.forEach(function (b) {
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = b[1];
      f.frequency.setValueAtTime(b[0] * (o.from || 1), t);
      f.frequency.linearRampToValueAtTime(b[0] * (o.peakAt || 1), t + o.attack);
      f.frequency.linearRampToValueAtTime(b[0] * (o.to || 1), t + o.attack + o.hold + o.release);
      var g = ctx.createGain(); g.gain.value = b[2];
      src.connect(f); f.connect(g); g.connect(sum);
    });
    var e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(o.gain, t + o.attack);
    /* flutter: many voices do not rise together */
    var step = 0.09, n = Math.floor(o.hold / step);
    for (var i = 1; i <= n; i++) e.gain.linearRampToValueAtTime(o.gain * (0.82 + this.rnd() * 0.3), t + o.attack + i * step);
    e.gain.linearRampToValueAtTime(o.gain * 0.9, t + o.attack + o.hold);
    e.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.hold + o.release);
    sum.connect(e); e.connect(dest);
    src.start(t, this.rnd() * 2); src.stop(t + o.attack + o.hold + o.release + 0.1);
  };

  /* ================================================================ EVENTS */
  P.playEvent = function (kind, t, o) {
    o = o || {};
    var sp = o.speed && o.speed > 1 ? 1 / Math.sqrt(o.speed) : 1;
    var d = this.panner(this.sfx, o.pan || 0);
    var g = sp, note = o.note || '';
    /* m3: d1's events carry notes; a few change the sound. A throw (a
     * throw-in, the keeper's throw) is no kick; a header is a duller knock;
     * a long ball, a cross, a corner or a goal kick is a fuller strike with
     * the air after it; a shot wide or over the bar gets the crowd's "ooh" */
    if ((kind === 'pass' || kind === 'clearance' || kind === 'shot' || kind === 'interception') && (note === 'header' || o.head)) {
      this.kick(d, t, { f0: 140, f1: 80, dur: 0.08, gain: 0.26 * g, click: 0.03 * g, clickF: 1200 });
      if (kind === 'shot' && sp > 0.6) this.surge(t + 0.05, 0.4, 1.0);
      return true;
    }
    switch (kind) {
      case 'pass':
        if (note === 'throw-in' || note === 'keeper throw') {
          this.whoosh(d, t, { f: 1800, f1: 900, dur: 0.3, gain: 0.05 * g });
          break;
        }
        if (/^(cross|long ball|corner kick|goal kick|free kick|switch of play|over the top)$/.test(note)) {
          this.kick(d, t, { f0: 165, f1: 70, dur: 0.16, gain: 0.36 * g, click: 0.13 * g, clickF: 2300 });
          if (sp > 0.6) this.whoosh(d, t + 0.03, { f: 2600, f1: 800, dur: 0.38, gain: 0.045 * g });
          break;
        }
        this.kick(d, t, { f0: 175, f1: 95, dur: 0.11, gain: 0.30 * g, click: 0.10 * g, clickF: 2600 });
        break;
      case 'carry':
        /* two light touches: running with the ball */
        this.kick(d, t, { f0: 230, f1: 140, dur: 0.06, gain: 0.14 * g, click: 0.04 * g, clickF: 3000 });
        this.kick(d, t + 0.19 * this.vary(0.1), { f0: 230, f1: 140, dur: 0.06, gain: 0.12 * g, click: 0.035 * g, clickF: 3000 });
        break;
      case 'dribble':
        /* three quick touches and a scuff of studs on grass */
        for (var i = 0; i < 3; i++) this.kick(d, t + i * 0.1 * this.vary(0.15), { f0: 240 + i * 15, f1: 150, dur: 0.05, gain: 0.14 * g, click: 0.045 * g, clickF: 3200 });
        this.noiseBurst(d, { t: t + 0.12, f: 4200, Q: 0.7, dur: 0.12, gain: 0.035 * g, attack: 0.02 });
        break;
      case 'tackle':
        /* a scuff (studs through grass) with a low body thump inside it */
        this.noiseBurst(d, { t: t, f: 1300 * this.vary(0.1), f1: 450, sweep: 0.2, Q: 0.8, dur: 0.22, gain: 0.26 * g, attack: 0.012 });
        this.kick(d, t + 0.025, { f0: 130, f1: 65, dur: 0.14, gain: 0.30 * g, click: 0.05 * g, clickF: 1400 });
        break;
      case 'interception':
        /* a stab of a foot: short, higher, with a snap */
        this.kick(d, t, { f0: 210, f1: 110, dur: 0.09, gain: 0.30 * g, click: 0.12 * g, clickF: 3300 });
        this.noiseBurst(d, { t: t + 0.01, f: 900, f1: 500, Q: 1, dur: 0.07, gain: 0.08 * g });
        break;
      case 'clearance':
        /* a big boot and the ball flying off */
        this.kick(d, t, { f0: 150, f1: 55, dur: 0.2, gain: 0.40 * g, click: 0.15 * g, clickF: 1900 });
        if (sp > 0.6) this.whoosh(d, t + 0.03, { f: 2400, f1: 700, dur: 0.45, gain: 0.05 * g });
        break;
      case 'shot':
        /* the firmest kick, the air, and the crowd drawing breath */
        this.kick(d, t, { f0: 165, f1: 50, dur: 0.22, gain: 0.48 * g, click: 0.20 * g, clickF: 2200 });
        this.whoosh(d, t + 0.02, { f: 3000, f1: 900, dur: 0.32, gain: 0.07 * g });
        this.surge(t + 0.05, 0.5, 1.2);
        if ((note === 'wide' || note === 'over the bar') && sp > 0.6) this.reaction('ooh', t + 0.35, 0.7);   /* m3 */
        break;
      case 'save':
        /* gloves on the ball (a slap), the ball's thud, and an "ooh" */
        this.noiseBurst(d, { t: t, f: 1700 * this.vary(0.08), Q: 1.1, dur: 0.07, gain: 0.43 * g, attack: 0.001 });
        this.kick(d, t + 0.004, { f0: 250, f1: 120, dur: 0.09, gain: 0.28 * g });
        if (sp > 0.6) this.reaction('ooh', t + 0.12, 0.6);
        break;
      case 'out':
        /* the ball bouncing away off the pitch, twice, dying */
        this.kick(d, t, { f0: 170, f1: 100, dur: 0.1, gain: 0.18 * g, click: 0.03 * g });
        this.kick(d, t + 0.34 * this.vary(0.08), { f0: 180, f1: 110, dur: 0.08, gain: 0.09 * g });
        this.kick(d, t + 0.56 * this.vary(0.08), { f0: 190, f1: 120, dur: 0.06, gain: 0.045 * g });
        break;
      case 'foul':
        this.whistle(d, t, 0.26, 0.076 * Math.max(g, 0.7));
        break;
      case 'kickoff':
        this.whistle(this.sfx, t, 0.55, 0.076);
        this.kick(d, t + 0.62, { f0: 175, f1: 95, dur: 0.11, gain: 0.26, click: 0.08 });
        break;
      case 'goal':
        /* the net: the ball's thud and a soft rustle of rope */
        this.kick(d, t, { f0: 120, f1: 60, dur: 0.12, gain: 0.26 });
        this.noiseBurst(d, { t: t + 0.01, f: 1500, f1: 700, sweep: 0.5, Q: 0.6, dur: 0.55, gain: 0.16, attack: 0.03 });
        this.noiseBurst(d, { t: t + 0.02, f: 5200, Q: 0.8, dur: 0.35, gain: 0.05, attack: 0.04 });
        break;
      default: return false;
    }
    return true;
  };

  /* ================================================================ CUES */
  P.playCue = function (name, t) {
    var s = this.sfx, i;
    switch (name) {
      case 'dice': {
        /* two dice in a cup: clicks crowded at first, spreading out, then two
         * landing knocks. About 0.6 s, inside play.html's 650 ms tumble. */
        var at = 0;
        for (i = 0; i < 10; i++) {
          at += 0.028 + i * 0.006 + this.rnd() * 0.02;
          var gg = 0.38 * (1 - i * 0.05) * this.vary(0.25);
          this.noiseBurst(s, { t: t + at, f: 2600 + this.rnd() * 2400, Q: 7, dur: 0.018, gain: gg * 1.6, attack: 0.001 });
          this.tone(s, { t: t + at, f0: 1100 + this.rnd() * 700, dur: 0.025, gain: gg * 0.6, attack: 0.001 });
        }
        this.tone(s, { t: t + at + 0.07, f0: 620 * this.vary(0.05), f1: 560, dur: 0.06, gain: 0.38, attack: 0.001 });
        this.noiseBurst(s, { t: t + at + 0.07, f: 1800, Q: 2, dur: 0.02, gain: 0.38 });
        this.tone(s, { t: t + at + 0.13, f0: 700 * this.vary(0.05), f1: 620, dur: 0.05, gain: 0.28, attack: 0.001 });
        break;
      }
      case 'good':
        /* up a fifth, bright: E5 then B5 */
        this.mallet(s, t, 659.3, 0.16, 0.5);
        this.mallet(s, t + 0.076, 987.8, 0.135, 0.7);
        break;
      case 'mixed':
        /* up a tone, unresolved: A4 then B4, softer */
        this.mallet(s, t, 440, 0.19, 0.4);
        this.mallet(s, t + 0.11, 493.9, 0.16, 0.5);
        break;
      case 'bad':
        /* down a major third, darker (triangle, low): G4 then E flat 4 */
        this.mallet(s, t, 392, 0.22, 0.35, 'triangle');
        this.mallet(s, t + 0.13, 311.1, 0.22, 0.6, 'triangle');
        break;
      case 'whistle':
        this.whistle(s, t, 0.55, 0.076);
        break;
      case 'halftime':
        this.whistle(s, t, 0.32, 0.076);
        this.whistle(s, t + 0.45, 0.55, 0.076);
        break;
      case 'fulltime':
        /* peep, peep, peeeep */
        this.whistle(s, t, 0.28, 0.076);
        this.whistle(s, t + 0.38, 0.28, 0.076);
        this.whistle(s, t + 0.76, 0.95, 0.076);
        break;
      case 'goal':
        /* the net, then the roar */
        this.playEvent('goal', t, {});
        this.reaction('roar', t + 0.08, 1);
        break;
      case 'conceded':
        this.playEvent('goal', t, { pan: 0 });
        this.reaction('groan', t + 0.15, 1);
        break;
      case 'ooh':
        this.reaction('ooh', t, 1);
        break;
      case 'select':
        /* a quiet tick for choosing a card */
        this.tone(s, { t: t, f0: 1250, f1: 1050, dur: 0.035, gain: 0.2, attack: 0.001 });
        this.tone(s, { t: t, type: 'triangle', f0: 420, dur: 0.04, gain: 0.12, attack: 0.001 });
        break;
      /* intro: the walk-out's sounds (walkout.js); not in CUES, so the sound board and its checks are unchanged */
      case 'peep':      // intro: the referee calls the captains
        this.whistle(s, t, 0.24, 0.07);
        break;
      case 'coin':      // intro: a thumb flicks the coin, and it rings as it spins
        this.noiseBurst(s, { t: t, f: 3200, Q: 3, dur: 0.02, gain: 0.3, attack: 0.001 });
        for (i = 0; i < 6; i++) this.tone(s, { t: t + 0.03 + i * 0.16, f0: 5200 - i * 180, dur: 0.05, gain: 0.05 * (1 - i * 0.12), attack: 0.002 });
        break;
      case 'coinland':  // intro: the coin lands in a palm
        this.noiseBurst(s, { t: t, f: 900, Q: 1.2, dur: 0.05, gain: 0.35, attack: 0.001 });
        this.tone(s, { t: t, f0: 2600, f1: 2500, dur: 0.12, gain: 0.08, attack: 0.001 });
        break;
      default: return false;
    }
    return true;
  };

  /* crowd reactions, on the crowd bus (under the effects) */
  P.reaction = function (kind, t, amt) {
    var c = this.crowdBus;
    if (kind === 'roar') {
      this.crowdVoice(c, t, { gain: 0.66 * amt, attack: 0.35, hold: 1.5, release: 2.6, from: 0.85, peakAt: 1.15, to: 0.9 });
      /* a lower body under it: the stand, not just the voices */
      this.noiseBurst(c, { t: t, pink: true, filter: 'lowpass', f: 380, Q: 0.5, dur: 2.8, hold: 1.2, gain: 0.45 * amt, attack: 0.4 });
      this.surge(t, 1, 4);
    } else if (kind === 'ooh') {
      this.crowdVoice(c, t, { gain: 0.38 * amt, attack: 0.25, hold: 0.35, release: 0.9, from: 0.7, peakAt: 1.05, to: 0.75,
        bands: [[450, 2.5, 1], [800, 2.5, 0.6], [2300, 3, 0.15]] });
    } else if (kind === 'groan') {
      this.crowdVoice(c, t, { gain: 0.14 * amt, attack: 0.2, hold: 0.5, release: 1.4, from: 1.0, peakAt: 0.9, to: 0.6,
        bands: [[380, 2.2, 1], [700, 2.2, 0.55], [2100, 3, 0.1]] });
      this.surge(t, -0.6, 3);
    }
  };

  /* ================================================================ THE BED
   * Stereo pink noise through three bands: a low body (the stand), a murmur
   * (voices far away) and chatter (voices near). Tension raises the level
   * and opens the bands; slow random swells keep it alive. */
  P.bedStart = function (t) {
    if (this.bed) return;
    var ctx = this.ctx, b = {};
    b.src = ctx.createBufferSource(); b.src.buffer = this.pink; b.src.loop = true;
    b.out = ctx.createGain(); b.out.gain.setValueAtTime(0.0001, t);
    b.swell = ctx.createGain(); b.swell.gain.value = 1;
    b.react = ctx.createGain(); b.react.gain.value = 1;
    b.body = ctx.createBiquadFilter(); b.body.type = 'lowpass'; b.body.frequency.value = 420; b.body.Q.value = 0.4;
    b.mur = ctx.createBiquadFilter(); b.mur.type = 'bandpass'; b.mur.frequency.value = 800; b.mur.Q.value = 0.8;
    b.chat = ctx.createBiquadFilter(); b.chat.type = 'bandpass'; b.chat.frequency.value = 1900; b.chat.Q.value = 1.1;
    b.gBody = ctx.createGain(); b.gMur = ctx.createGain(); b.gChat = ctx.createGain();
    b.src.connect(b.body); b.body.connect(b.gBody);
    b.src.connect(b.mur); b.mur.connect(b.gMur);
    b.src.connect(b.chat); b.chat.connect(b.gChat);
    b.gBody.connect(b.swell); b.gMur.connect(b.swell); b.gChat.connect(b.swell);
    b.swell.connect(b.react); b.react.connect(b.out); b.out.connect(this.crowdBus);
    b.src.start(t);
    b.until = t;
    this.bed = b;
    this.applyTension(t, 1.2);
    this.bedSchedule(t + 4);
  };
  P.bedStop = function (t) {
    var b = this.bed; if (!b) return;
    b.out.gain.cancelScheduledValues(t);
    b.out.gain.setTargetAtTime(0.0001, t, 0.4);
    try { b.src.stop(t + 2.5); } catch (e) { }
    this.bed = null;
  };
  /* tension 0: -40 dBFS-ish murmur; tension 1: about 11 dB up and brighter */
  P.applyTension = function (t, tc) {
    var b = this.bed; if (!b) return;
    var v = this.tension, k = tc || 0.6;
    b.out.gain.setTargetAtTime(db(-9 + 8 * v) * 0.16, t, k);
    b.gBody.gain.setTargetAtTime(0.9 - 0.2 * v, t, k);
    b.gMur.gain.setTargetAtTime(0.55 + 0.25 * v, t, k);
    b.gChat.gain.setTargetAtTime(0.10 + 0.40 * v, t, k);
    b.body.frequency.setTargetAtTime(380 + 260 * v, t, k);
    b.mur.frequency.setTargetAtTime(720 + 260 * v, t, k);
  };
  /* slow random swells scheduled ahead up to time `until` */
  P.bedSchedule = function (until) {
    var b = this.bed; if (!b) return;
    while (b.until < until) {
      var len = 1.2 + this.rnd() * 2.8;
      var depth = 0.12 + 0.25 * this.tension;
      var target = 1 + (this.rnd() * 2 - 1) * depth;
      b.swell.gain.setTargetAtTime(target, b.until, len / 3);
      b.until += len;
    }
  };
  /* a temporary rise (amt > 0) or dip (amt < 0) of the bed */
  P.surge = function (t, amt, len) {
    var b = this.bed; if (!b) return;
    var g = b.react.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.2, 1 + amt), t, 0.12);
    g.setTargetAtTime(1, t + len * 0.4, len / 3);
  };
  P.setTension = function (v, t) {
    this.tension = clamp(+v || 0, 0, 1);
    this.applyTension(t == null ? this.ctx.currentTime : t);
  };

  /* ================================================================ MUSIC
   * Optional, off by default. Two short loops, scheduled bar by bar:
   * 'moment': a tense pulse for the frozen moment (D minor, 112 bpm: a low
   *   plucked eighth-note pulse, a held fifth, a quiet tick on the off-beats).
   * 'menu': a light plucked arpeggio (C major, 92 bpm). */
  var SONGS = {
    moment: { bpm: 112, bars: [[73.42, 110.0], [73.42, 110.0], [58.27, 87.31], [65.41, 98.0]] },
    menu: { bpm: 92, bars: [[261.6, 329.6, 392.0, 523.3], [220.0, 261.6, 329.6, 440.0], [174.6, 220.0, 261.6, 349.2], [196.0, 246.9, 293.7, 392.0]] }
  };
  P.musicStart = function (name, t) {
    this.musicStop(t);
    if (!SONGS[name]) return false;
    var ctx = this.ctx;
    var out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.setTargetAtTime(1, t, 0.4); out.connect(this.musicBus);
    this.mus = { name: name, out: out, next: t + 0.05, bar: 0 };
    this.musicSchedule(t + 0.5);
    return true;
  };
  P.musicStop = function (t) {
    var m = this.mus; if (!m) return;
    m.out.gain.cancelScheduledValues(t); m.out.gain.setTargetAtTime(0.0001, t, 0.25);
    m.stopped = true;
    this.mus = null;
  };
  P.musicSchedule = function (until) {
    var m = this.mus; if (!m) return;
    var song = SONGS[m.name], beat = 60 / song.bpm;
    while (m.next < until) {
      var bar = song.bars[m.bar % song.bars.length], t = m.next, i;
      if (m.name === 'moment') {
        var root = bar[0];
        for (i = 0; i < 8; i++) {
          var acc = i === 0 ? 1 : i % 2 === 0 ? 0.75 : 0.55;
          this.pluck(m.out, t + i * beat / 2, root * (i === 6 ? 1.5 : 1), 0.16 * acc, beat * 0.45, 'sawtooth', 500 + 300 * acc);
          if (i % 2 === 1) this.noiseBurst(m.out, { t: t + i * beat / 2, filter: 'highpass', f: 7000, Q: 0.7, dur: 0.03, gain: 0.018 });
        }
        this.pad(m.out, t, [bar[0] * 2, bar[1] * 2], 0.035, beat * 4);
      } else {
        for (i = 0; i < 8; i++) {
          var f = bar[[0, 1, 2, 3, 2, 1, 2, 3][i]];
          this.pluck(m.out, t + i * beat / 2, f * 2, 0.068 * (i === 0 ? 1 : 0.8), beat * 0.9, 'triangle', 2400);
        }
        this.pluck(m.out, t, bar[0] / 2, 0.09, beat * 3.5, 'sine', 800);
      }
      m.next += beat * 4;
      m.bar++;
    }
  };
  P.pluck = function (dest, t, f, gain, dur, type, cut) {
    var lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut * 2, t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.5), t + dur);
    lp.connect(dest);
    this.tone(lp, { t: t, type: type, f0: f, dur: dur, gain: gain, attack: 0.004 });
  };
  P.pad = function (dest, t, fs, gain, len) {
    var ctx = this.ctx, self = this;
    fs.forEach(function (f) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (self.rnd() - 0.5) * 8;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + len * 0.3);
      g.gain.linearRampToValueAtTime(gain * 0.8, t + len * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.1);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + 0.15);
    });
  };

  /* ================================================================ LIVE */
  var live = null;      /* { ctx, eng, master, limiter, timer } */
  var wantCrowd = false, wantMusic = null;

  function masterLevel() { return settings.muted ? 0 : settings.volume * settings.volume; }

  function init() {
    if (!AC) return false;
    if (live) { try { if (live.ctx.state === 'suspended') live.ctx.resume(); } catch (e) { } return true; }
    try {
      var ctx = new AC();
      var master = ctx.createGain(); master.gain.value = masterLevel();
      /* a safety limiter: nothing should reach it, but a pile-up of sounds
       * at 4x fast forward must not clip */
      var lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12;
      lim.attack.value = 0.003; lim.release.value = 0.2;
      master.connect(lim); lim.connect(ctx.destination);
      var eng = new Engine(ctx, master, (Date.now() & 0xffffff) + 1);
      live = { ctx: ctx, eng: eng, master: master, limiter: lim };
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
      if (wantCrowd) eng.bedStart(ctx.currentTime + 0.05);
      if (wantMusic && settings.music) eng.musicStart(wantMusic, ctx.currentTime + 0.05);
      /* the look-ahead: keeps the crowd swells and the music scheduled */
      live.timer = setInterval(function () {
        var now = ctx.currentTime;
        eng.bedSchedule(now + 4);
        eng.musicSchedule(now + 0.6);
      }, 250);
      return true;
    } catch (e) { live = null; return false; }
  }
  function unlockOn(el) {
    el = el || (W && W.document);
    if (!el || !el.addEventListener) return false;
    var go = function () { init(); el.removeEventListener('pointerdown', go, true); el.removeEventListener('keydown', go, true); };
    el.addEventListener('pointerdown', go, true);
    el.addEventListener('keydown', go, true);
    return true;
  }
  function now() { return live.ctx.currentTime + 0.005; }

  /* the ball's x (0..68) as a stereo position, kept narrow */
  function panOf(ball) { return ball && typeof ball.x === 'number' ? clamp((ball.x - 34) / 34, -1, 1) * 0.45 : 0; }
  /* 0..1: high near either box, low in midfield */
  function tensionFor(ball) {
    if (!ball || typeof ball.y !== 'number') return 0.3;
    var d = Math.min(ball.y, 105 - ball.y);           /* metres from the nearer goal line */
    return clamp(1 - (d - 8) / 38, 0.12, 1);
  }

  var autoTension = true, lastAt = {};
  function tooSoon(key) {
    var w = Date.now();
    if (lastAt[key] && w - lastAt[key] < 70) return true;
    lastAt[key] = w;
    return false;
  }
  function event(ev, opts) {
    if (!live || !ev) return false;
    var kind = typeof ev === 'string' ? ev : ev.kind;
    var t = now(), e = live.eng;
    opts = opts || {};
    /* the same sound twice within 70 ms is one sound (4x fast forward);
     * timed on the wall clock, which moves even while the audio clock waits */
    if (tooSoon(kind)) return false;
    if (autoTension && ev.ball && opts.tension !== false) e.setTension(tensionFor(ev.ball), t);
    return e.playEvent(kind, t, { pan: panOf(ev.ball), speed: opts.speed, note: ev.note || '', head: !!ev.head });   /* m3: the note too */
  }
  function cue(name) {
    if (!live) return false;
    var t = now(), e = live.eng;
    if (tooSoon('cue:' + name)) return false;
    return e.playCue(name, t);
  }
  function verdict(cls) { return cue(cls === 'won' ? 'good' : cls === 'lost' ? 'bad' : 'mixed'); }
  function crowd(on) {
    wantCrowd = !!on;
    if (!live) return false;
    if (on) live.eng.bedStart(now()); else live.eng.bedStop(now());
    return true;
  }
  function setTension(v) { if (!live) return false; live.eng.setTension(v); return true; }
  /* m5: the voice's duck (vo1): crowd -5 dB, music -6 dB, the effects untouched */
  var ducked = false;
  function duck(on) {
    ducked = !!on;
    if (!live) return false;
    var t = now(), e = live.eng;
    try {
      e.crowdBus.gain.cancelScheduledValues(t); e.crowdBus.gain.setTargetAtTime(ducked ? db(-5) : 1, t, 0.04);
      e.musicBus.gain.cancelScheduledValues(t); e.musicBus.gain.setTargetAtTime(0.55 * (ducked ? db(-6) : 1), t, 0.04);
    } catch (x) { return false; }
    return true;
  }
  /* intro: a rise of the crowd bed (amt > 0) for len seconds, for the walk-out */
  function swell(amt, len) { if (!live) return false; live.eng.surge(now(), +amt || 0, +len || 2); return true; }  // intro
  function music(name) {
    wantMusic = name || null;
    if (!live) return false;
    if (!name || !settings.music) { live.eng.musicStop(now()); return false; }
    if (live.eng.mus && live.eng.mus.name === name) return true;
    return live.eng.musicStart(name, now());
  }
  function applyMaster() {
    if (!live) return;
    live.master.gain.setTargetAtTime(masterLevel(), live.ctx.currentTime, 0.05);
  }
  function setMuted(b) { settings.muted = !!b; saveSettings(); applyMaster(); return settings.muted; }
  function toggleMute() { return setMuted(!settings.muted); }
  function setVolume(v) { settings.volume = clamp(+v || 0, 0, 1); saveSettings(); applyMaster(); return settings.volume; }
  function setMusicEnabled(b) {
    settings.music = !!b; saveSettings();
    if (live) { if (settings.music && wantMusic) live.eng.musicStart(wantMusic, now()); else live.eng.musicStop(now()); }
    return settings.music;
  }
  /* play any spec live: 'event:pass', 'cue:goal', 'music:moment' */
  function play(spec, opts) {
    var p = String(spec).split(':');
    if (p[0] === 'event') return event({ kind: p[1], ball: opts && opts.ball }, opts);
    if (p[0] === 'cue') return cue(p[1]);
    if (p[0] === 'music') return music(p[1]);
    return false;
  }

  /* ================================================================ OFFLINE
   * render(spec, opts) -> Promise<AudioBuffer>, at master volume 1 with no
   * limiter, so the numbers are the worst case the page can produce.
   * spec: 'event:<kind>', 'cue:<name>', 'crowd' (opts.tension), 'music:<name>',
   * or 'sequence' with opts.steps = [{t, event:{...}} | {t, cue} | {t, tension}
   * | {t, verdict}], the crowd bed running under it. */
  function render(spec, opts) {
    opts = opts || {};
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    var sr = opts.sampleRate || 44100, dur = opts.duration || 3;
    var ctx = new OAC(2, Math.ceil(sr * dur), sr);
    var out = ctx.createGain(); out.gain.value = opts.volume == null ? 1 : opts.volume; out.connect(ctx.destination);
    var e = new Engine(ctx, out, opts.seed || 12345);
    var p = String(spec).split(':'), t0 = 0.02;
    if (p[0] === 'event') e.playEvent(p[1], t0, { pan: opts.pan || 0, speed: opts.speed, note: opts.note, head: opts.head });   /* m3: with a note */
    else if (p[0] === 'cue') e.playCue(p[1], t0);
    else if (p[0] === 'crowd') {
      e.tension = clamp(opts.tension == null ? 0.25 : opts.tension, 0, 1);
      e.bedStart(0); e.bedSchedule(dur);
    } else if (p[0] === 'music') {
      e.musicStart(p[1], 0); e.musicSchedule(dur);
    } else if (p[0] === 'sequence') {
      e.tension = 0.2; e.bedStart(0); e.bedSchedule(dur);
      if (opts.music) { e.musicStart(opts.music, 0); e.musicSchedule(dur); }
      (opts.steps || []).forEach(function (s) {
        var t = s.t + t0;
        if (s.event) {
          if (s.event.ball && opts.autoTension !== false) e.setTension(tensionFor(s.event.ball), t);
          e.playEvent(s.event.kind, t, { pan: panOf(s.event.ball), speed: s.speed });
        }
        if (s.cue) e.playCue(s.cue, t);
        if (s.verdict) e.playCue(s.verdict === 'won' ? 'good' : s.verdict === 'lost' ? 'bad' : 'mixed', t);
        if (s.tension != null) e.setTension(s.tension, t);
      });
    } else return Promise.reject(new Error('unknown spec ' + spec));
    return ctx.startRendering();
  }

  var KMSound = {
    LIST: { events: EVENTS.slice(), cues: CUES.slice(), music: MUSIC.slice() },
    available: !!AC,
    init: init, unlockOn: unlockOn,
    event: event, cue: cue, verdict: verdict, play: play,
    crowd: crowd, setTension: setTension, tensionFor: tensionFor,
    getTension: function () { return live ? live.eng.tension : 0; },
    setAutoTension: function (b) { autoTension = !!b; return autoTension; },
    duck: duck, isDucked: function () { return ducked; },   // m5
    swell: swell,   // intro
    music: music, setMusicEnabled: setMusicEnabled, musicEnabled: function () { return settings.music; },
    setMuted: setMuted, toggleMute: toggleMute, isMuted: function () { return settings.muted; },
    setVolume: setVolume, getVolume: function () { return settings.volume; },
    isReady: function () { return !!live; },
    render: render
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = KMSound;
  if (W) W.KMSound = KMSound;
})(this);
