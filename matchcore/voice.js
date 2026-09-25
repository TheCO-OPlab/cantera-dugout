/* voice.js: KMVoice, a spoken commentator (study vo1).
 *
 * Uses the browser's own speech synthesis (window.speechSynthesis) and only
 * voices that run on this machine (voice.localService !== false): no network
 * voices, no libraries. Off by default. Safe in node or in a browser without
 * speech: every call then does nothing and returns false.
 *
 * THE QUEUE NEVER LAGS BEHIND THE PICTURE. There is one line speaking and at
 * most one line waiting. A new line replaces the waiting one (keep only the
 * latest). A line that waited longer than its shelf life is dropped, never
 * spoken late. A headline (the result of a decision) cuts off a
 * play-by-play line that is still speaking. At 2x speed only headlines are
 * spoken.
 *
 *   KMVoice.setEnabled(b) / isEnabled()   off by default, remembered
 *   KMVoice.setSpeed(1|2)                 the page's play speed
 *   KMVoice.headline(ev, ctx)             the result of a decision (engine ev)
 *   KMVoice.beat(b, names, ctx)           a director beat; names = {from, to, past}
 *   KMVoice.moment(p, ctx)                a moment has opened (engine pending)
 *   KMVoice.fullTime(ctx)                 the final whistle
 *   KMVoice.say(text, kind, style)        any line (kind: headline|moment|pbp)
 *   KMVoice.clear()                       drop the waiting line (the picture moved on)
 *   KMVoice.stop()                        stop speaking now
 *   KMVoice.setDucker(fn)                 fn(true|false) while speaking; the default
 *                                         lowers the crowd (snd1) and the music (vo1)
 *   KMVoice.voiceName()                   the voice in use, or null
 *   KMVoice.create(env)                   a separate instance on a given synth and
 *                                         clock (the tests use a fake one)
 *   KMVoice.lines                         the line builders, pure (for tests and lists)
 *
 * ctx (all optional): { you: 'Spain', them: 'Argentina', score: {you, them},
 * proximity: 0..1 (how near a box the ball is) }.
 *
 * Lines are written FOR the voice: short, plain, literal, names as the page
 * shows them, no football idiom, no em dashes. */
(function (root) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* m7: the page passes ctx.band (pitch.js bandWords with the frozen
   * picture's ball), so the voice says "outside your box" where the screen
   * does; KMVoice.BREAK.name = 'band' turns it off (r3check --break voiceband) */
  var VBREAK = { name: null };
  function band(t, ctx) { return VBREAK.name !== 'band' && ctx && typeof ctx.band === 'function' && t ? ctx.band(t) : t; }
  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function sentences(s) { return (clean(s).match(/[^.!?]+[.!?]+/g) || (clean(s) ? [clean(s)] : [])).map(function (x) { return x.trim(); }); }

  /* ================================================================ LINES */
  /* the style of each kind of line: rate, pitch, volume (0..1), and how long
   * it may wait before it is stale (seconds). */
  var STYLE = {
    pbp: { rate: 1.15, pitch: 1.0, volume: 0.85, ttl: 1.2, prio: 1 },
    shot: { rate: 1.22, pitch: 1.12, volume: 0.95, ttl: 1.0, prio: 1 },
    moment: { rate: 1.08, pitch: 1.0, volume: 0.9, ttl: 3.0, prio: 2 },
    headline: { rate: 1.05, pitch: 1.0, volume: 1.0, ttl: 4.0, prio: 3 },
    good: { rate: 1.1, pitch: 1.1, volume: 1.0, ttl: 4.0, prio: 3 },
    bad: { rate: 0.98, pitch: 0.92, volume: 1.0, ttl: 4.0, prio: 3 },
    goal: { rate: 1.24, pitch: 1.3, volume: 1.0, ttl: 5.0, prio: 3 },
    conceded: { rate: 0.95, pitch: 0.86, volume: 1.0, ttl: 5.0, prio: 3 },
    fulltime: { rate: 1.0, pitch: 1.0, volume: 1.0, ttl: 6.0, prio: 3 }
  };
  function scoreLine(ctx) {
    if (!ctx || !ctx.score) return '';
    var y = ctx.you || 'Your team', t = ctx.them || 'Them';
    return y + ' ' + ctx.score.you + ', ' + t + ' ' + ctx.score.them + '.';
  }
  /* the scorer of a goal: the engine says "... and Messi scores" */
  function scorerOf(ev) {
    var m = /(?:^|[,.] ?|and )([A-ZÀ-Þ][^\s,.]*(?:[  ][A-ZÀ-Þ][^\s,.]*)?) scores\b/.exec(String(ev.text || ''));
    if (m && !/^(GOAL|THEY)$/.test(m[1])) return clean(m[1]);
    return clean(ev.kind === 'goal' ? ev.actorName : ev.foilName) || null;
  }
  /* A headline for the ear. The screen's headline, with the instruction to
   * the player taken off ("Choose what happens next."), at most two short
   * sentences; a goal says who scored and the score. */
  function headlineLine(ev, ctx) {
    if (!ev) return null;
    ctx = ctx || {};
    var k = ev.kind, y = ctx.you || 'your team', t = ctx.them || 'them';
    if (k === 'goal') {
      var s = scorerOf(ev);
      return { text: 'Goal for ' + y + '. ' + (s ? s + ' scores. ' : '') + scoreLine(ctx), style: 'goal' };
    }
    if (k === 'conceded') {
      var c = scorerOf(ev);
      return { text: 'Goal for ' + t + '. ' + (c ? c + ' scores. ' : '') + scoreLine(ctx), style: 'conceded' };
    }
    var h = clean(band(ev.headline || '', ctx));  // m7: the band as the screen names it
    /* "Your attack starts in midfield: choose what happens next." */
    h = h.replace(/: choose [^.]*\./gi, '.');
    var parts = sentences(h).filter(function (x) { return !/^Choose\b/i.test(x.trim()); });
    if (k === 'lost') parts = ['You lost the ball.', 'They are attacking.'];
    /* "Álvarez is in your box. One last chance to stop Álvarez." is kept whole;
     * anything longer keeps its first sentence */
    var text = clean(parts.join(' '));
    if (text.length > 72 && parts.length > 1) text = parts[0].trim();
    if (!text) return null;
    var style = (k === 'stopped' || k === 'escaped' || k === 'ground') ? 'good'
      : (k === 'lost' || k === 'theyadvance' || k === 'inbox') ? 'bad' : 'headline';
    return { text: text, style: style };
  }
  /* A director beat, spoken sparingly: only the beats a listener needs.
   * Passes and carries are never spoken (there are too many). */
  function beatLine(b, n, ctx) {
    if (!b) return null;
    n = n || {}; ctx = ctx || {};
    var a = clean(n.from), to = clean(n.to), past = clean(n.past);
    var side = function (team) { return team === 'you' ? 'your team' : 'them'; };
    switch (b.kind) {
      case 'kickoff': return { text: 'Kick-off.', style: 'pbp', w: 3 };
      case 'foul':
        if (b.note === 'offside') return a ? { text: a + ' is offside.', style: 'pbp', w: 3 } : null;
        /* team = the side that fouled; the free kick is the other side's */
        return to ? { text: 'Foul on ' + to + '. Free kick.', style: 'pbp', w: 3 } : { text: 'Foul. Free kick.', style: 'pbp', w: 3 };
      case 'shot':
        if (!a) return { text: 'A shot.', style: 'shot', w: 4 };
        if (b.note === 'header') return { text: a + ' heads it at goal.', style: 'shot', w: 4 };
        return { text: a + ' shoots.', style: 'shot', w: 4 };
      case 'save':
        if (b.note === 'parried') return a ? { text: a + ' pushes it away.', style: 'shot', w: 4 } : null;
        if (to) return { text: to + ' catches it.', style: 'pbp', w: 4 };
        return null;
      case 'tackle': return to ? { text: a ? to + ' takes the ball from ' + a + '.' : to + ' wins the ball.', style: 'pbp', w: 2 } : null;
      case 'interception': return to ? { text: to + (b.note === 'header' ? ' wins the header.' : ' cuts out the pass.'), style: 'pbp', w: 2 } : null;
      case 'dribble': return a && past ? { text: a + ' goes past ' + past + '.', style: 'pbp', w: 2 } : null;
      case 'out':
        if (b.note === 'corner') return { text: 'Corner to ' + side(b.team) + '.', style: 'pbp', w: 3 };
        return null;
      case 'pass':
        if (b.note === 'cross' && a) return { text: a + ' crosses it.', style: 'pbp', w: 2 };
        if ((b.note === 'through ball' || b.note === 'over the top') && a && to) return { text: a + ', through to ' + to + '.', style: 'pbp', w: 2 };
        if (b.note === 'corner kick' && a) return { text: a + ' takes the corner.', style: 'pbp', w: 2 };
        if (b.note === 'free kick' && a) return { text: a + ' takes the free kick.', style: 'pbp', w: 2 };
        return null;
      case 'clearance': return a && b.note === 'out for a corner' ? { text: a + ' puts it out for a corner.', style: 'pbp', w: 2 } : null;
      default: return null;
    }
  }
  /* A moment has opened: who has the ball and where, in one sentence, taken
   * from the moment's own text ("Baena has the ball at the edge of their box."). */
  function momentLine(p, ctx) {
    if (!p || !p.moment) return null;
    var ss = sentences(band(p.moment.text || '', ctx));  // m7
    var pick = null;
    for (var i = 0; i < ss.length && !pick; i++) if (/ has the ball\b| is going to | has a (free kick|corner)| is through\b/.test(ss[i])) pick = ss[i];
    if (!pick) pick = ss[0];
    pick = clean(pick);
    if (!pick || pick.length > 80) return null;
    return { text: pick, style: 'moment' };
  }
  function fullTimeLine(ctx) {
    ctx = ctx || {};
    return { text: 'Full time. ' + (scoreLine(ctx) || ''), style: 'fulltime' };
  }

  /* ================================================================ VOICE PICK
   * English, on this machine, with a British voice first (the page speaks
   * British English: "metres"), then American, then any English. With no
   * local English voice the browser's default is used with lang en-GB. */
  function pickVoice(list) {
    var best = null, bestScore = -1;
    (list || []).forEach(function (v) {
      if (!v || v.localService === false) return;          /* network voice: never */
      var lang = String(v.lang || '').toLowerCase().replace('_', '-');
      if (lang.indexOf('en') !== 0) return;
      var s = 10;
      if (lang === 'en-gb') s += 6; else if (lang === 'en-us') s += 4; else if (lang === 'en-ie' || lang === 'en-au') s += 3;
      if (/george|ryan|daniel|arthur|oliver/i.test(v.name)) s += 2;   /* calmer male UK voices, where present */
      if (v['default']) s += 1;
      if (s > bestScore) { best = v; bestScore = s; }
    });
    return best;
  }

  /* ================================================================ ENGINE */
  function create(env) {
    env = env || {};
    var synth = env.synth || null;
    var Utt = env.Utterance || null;
    var nowFn = env.now || function () { return Date.now() / 1000; };
    var setT = env.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
    var clearT = env.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);
    var store = env.storage === undefined ? (W ? safeStorage() : null) : env.storage;
    var LS_KEY = 'kmvoice.v1';
    var st = { enabled: false, speed: 1, voice: null, speaking: null, waiting: null, watchdog: null, lastPbp: -99, gen: 0, ducked: false };
    var log = [];      /* what happened to each line: spoken | dropped-stale | replaced | cut | skipped-2x */
    var ducker = env.ducker || defaultDucker;
    try { var sv = store && JSON.parse(store.getItem(LS_KEY) || 'null'); if (sv && typeof sv.enabled === 'boolean') st.enabled = sv.enabled; } catch (e) { }
    function save() { try { if (store) store.setItem(LS_KEY, JSON.stringify({ enabled: st.enabled })); } catch (e) { } }
    var available = !!(synth && Utt);

    function loadVoices() {
      if (!available) return;
      try { st.voice = pickVoice(synth.getVoices()); } catch (e) { st.voice = null; }
    }
    if (available) {
      loadVoices();
      try {
        if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
        else synth.onvoiceschanged = loadVoices;
      } catch (e) { }
    }
    function note(line, what) { log.push({ at: nowFn(), text: line.text, kind: line.kind, what: what }); if (log.length > 400) log.shift(); }
    function duck(on) {
      if (st.ducked === on) return;
      st.ducked = on;
      try { if (ducker) ducker(on); } catch (e) { }
    }

    /* speak `line` now */
    function start(line) {
      var style = STYLE[line.style] || STYLE.headline;
      var u;
      try { u = new Utt(line.text); } catch (e) { return false; }
      var fast = st.speed >= 2 ? 0.12 : 0;
      u.rate = clamp(style.rate + fast + (line.boost || 0) * 0.1, 0.5, 2);
      u.pitch = clamp(style.pitch + (line.boost || 0) * 0.1, 0.1, 2);
      u.volume = style.volume;
      u.lang = st.voice ? st.voice.lang : 'en-GB';
      if (st.voice) u.voice = st.voice;
      var gen = ++st.gen;
      line.startedAt = nowFn();
      st.speaking = line;
      var done = function (how) {
        if (gen !== st.gen) return;       /* an old line's late end event */
        if (st.watchdog && clearT) { clearT(st.watchdog); st.watchdog = null; }
        st.speaking = null;
        note(line, how || 'spoken');
        pump();
      };
      u.onend = function () { done('spoken'); };
      u.onerror = function (e) { done(e && e.error === 'interrupted' || e && e.error === 'canceled' ? 'cut' : 'error'); };
      /* some browsers never fire onend: release the lock after a generous
       * estimate of the line's length (about 14 characters a second at rate 1) */
      if (setT) st.watchdog = setT(function () { if (gen === st.gen) { try { synth.cancel(); } catch (e) { } done('timeout'); } }, (line.text.length / (14 * u.rate) + 2.5) * 1000);
      duck(true);
      try { synth.speak(u); } catch (e) { done('error'); return false; }
      return true;
    }
    /* the waiting line, if it is still fresh */
    function pump() {
      var w = st.waiting;
      st.waiting = null;
      if (w) {
        var style = STYLE[w.style] || STYLE.headline;
        if (nowFn() - w.at > style.ttl) { note(w, 'dropped-stale'); w = null; }
      }
      if (w) { start(w); return; }
      duck(false);
    }
    function offer(line) {
      if (!available || !st.enabled || !line || !line.text) return false;
      line.at = nowFn();
      var style = STYLE[line.style] || STYLE.headline;
      line.prio = style.prio;
      if (st.speed >= 2 && line.prio < 3) { note(line, 'skipped-2x'); return false; }
      var cur = st.speaking;
      if (!cur) { start(line); return true; }
      if (line.prio === 3) {
        /* a result always speaks now: cut whatever is speaking */
        if (st.waiting) note(st.waiting, 'replaced');
        st.waiting = null;
        st.gen++;                         /* ignore the cut line's end event */
        if (st.watchdog && clearT) { clearT(st.watchdog); st.watchdog = null; }
        note(cur, 'cut');
        st.speaking = null;
        try { synth.cancel(); } catch (e) { }
        start(line);
        return true;
      }
      /* keep only the latest, and never let a small line push out a result */
      if (st.waiting && st.waiting.prio > line.prio && nowFn() - st.waiting.at <= (STYLE[st.waiting.style] || STYLE.headline).ttl) { note(line, 'replaced'); return false; }
      if (st.waiting) note(st.waiting, 'replaced');
      st.waiting = line;
      return true;
    }

    var api = {
      available: available,
      STYLE: STYLE,
      isEnabled: function () { return st.enabled; },
      setEnabled: function (b) { st.enabled = !!b; save(); if (!st.enabled) api.stop(); return st.enabled; },
      toggle: function () { return api.setEnabled(!st.enabled); },
      setSpeed: function (v) { st.speed = v >= 2 ? 2 : 1; if (st.speed >= 2 && st.waiting && st.waiting.prio < 3) { note(st.waiting, 'skipped-2x'); st.waiting = null; } return st.speed; },
      setDucker: function (fn) { ducker = fn || null; },
      voiceName: function () { return st.voice ? st.voice.name + ' (' + st.voice.lang + ')' : null; },
      say: function (text, style, extra) {
        var l = { text: clean(text), style: style || 'headline', kind: style || 'headline' };
        if (extra) for (var k in extra) l[k] = extra[k];
        return offer(l);
      },
      headline: function (ev, ctx) { var l = headlineLine(ev, ctx); if (!l) return false; l.kind = 'headline'; return offer(l); },
      beat: function (b, names, ctx) {
        var l = beatLine(b, names, ctx);
        if (!l) return false;
        l.kind = 'pbp';
        /* sparingly: at least 1.8 s between play-by-play lines, unless it
         * is a shot or a save, and never over a line that is speaking */
        var t = nowFn();
        if ((l.w || 0) < 4 && t - st.lastPbp < 1.8) { note(l, 'throttled'); return false; }
        if (st.speaking && (l.w || 0) < 4) { note(l, 'busy'); return false; }
        var ok = offer(l);
        if (ok) st.lastPbp = t;
        return ok;
      },
      moment: function (p, ctx) {
        var l = momentLine(p, ctx);
        if (!l) return false;
        l.kind = 'moment';
        l.boost = ctx && ctx.proximity ? clamp(ctx.proximity, 0, 1) : 0;
        return offer(l);
      },
      fullTime: function (ctx) { var l = fullTimeLine(ctx); l.kind = 'headline'; return offer(l); },
      clear: function () { if (st.waiting) note(st.waiting, 'replaced'); st.waiting = null; },
      stop: function () {
        if (st.waiting) note(st.waiting, 'replaced');
        st.waiting = null;
        if (st.speaking) { note(st.speaking, 'cut'); st.speaking = null; }
        st.gen++;
        if (st.watchdog && clearT) { clearT(st.watchdog); st.watchdog = null; }
        try { if (synth) synth.cancel(); } catch (e) { }
        duck(false);
        return true;
      },
      speaking: function () { return st.speaking ? st.speaking.text : null; },
      waiting: function () { return st.waiting ? st.waiting.text : null; },
      log: function () { return log.slice(); }
    };
    return api;
  }

  function safeStorage() { try { return W.localStorage || null; } catch (e) { return null; } }

  /* While the voice speaks: the crowd bed about 5 dB down and the music
   * 6 dB down. snd1 has no duck of its own, so the crowd is lowered through
   * its public tension (tension -0.6 is -4.8 dB and takes the chatter band,
   * which sits where speech sits, down with it); a KMSound.duck, if a merge
   * adds one, is used instead. */
  var savedTension = null;
  function defaultDucker(on) {
    var S = W && W.KMSound, M = W && W.KMMusic;
    if (M && M.duck) M.duck(on);
    if (!S) return;
    if (S.duck) { S.duck(on); return; }
    if (!S.isReady || !S.isReady()) return;
    if (on) {
      savedTension = S.getTension();
      S.setAutoTension(false);
      S.setTension(Math.max(0, savedTension - 0.6));
    } else if (savedTension != null) {
      S.setAutoTension(true);
      S.setTension(savedTension);
      savedTension = null;
    }
  }

  var defaultEnv = {};
  if (W && W.speechSynthesis && (W.SpeechSynthesisUtterance)) { defaultEnv.synth = W.speechSynthesis; defaultEnv.Utterance = W.SpeechSynthesisUtterance; }
  var KMVoice = create(defaultEnv);
  KMVoice.create = create;
  KMVoice.BREAK = VBREAK;  // m7
  KMVoice.lines = { headline: headlineLine, beat: beatLine, moment: momentLine, fullTime: fullTimeLine, pickVoice: pickVoice, scorerOf: scorerOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = KMVoice;
  if (W) W.KMVoice = KMVoice;
})(this);
