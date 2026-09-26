/* rib1: THE MOMENTUM RIBBON, the numbers behind it. Browser and node.
 *
 * A narrow strip beside the pitch that draws, one row per match minute,
 * where the ball was and whose ball it was, as the fast forward plays the
 * minutes between moments. Over the match it becomes a picture of the whole
 * game, with the six moments and the goals marked on it.
 *
 * It reads the same two things as stats.js (st1) and nothing else:
 *   1. the director's play before each moment (director.js segment, the
 *      pitch contract in GOALS.md): {t, kind, team, from, to, ball:{x,y}}.
 *      Its seconds stand for the match minutes since the last moment
 *      (fromMinute..toMinute), exactly as m2's statsfeed.js maps them.
 *   2. each decision: the director's second of play for the result
 *      (director.js resolve) and the engine's result (match.js choose).
 *      These take no match time; they give the moment's marks.
 * It never touches the engine, the match RNG or its inputs. Pure and
 * deterministic: the same segments and results give the same series.
 *
 * HOW THE BALL'S PATH IS READ (the director's own semantics, build() in
 * d1/director.js): event i starts at t_i and lasts until the next event
 * starts (the last one until the segment's duration); `ball` is where the
 * ball is when the event ENDS. So during event i the ball travels in a
 * straight line from where the previous event left it (for the first
 * event: the segment's start, seg.keys[0].ball when present, else the
 * first event's own ball) to event i's ball. The team with the ball during
 * event i is event i's team, except a foul (the team fouled has it). This
 * is a closer reading than stats.js's, which puts the ball at `ball` from
 * t_i on; the difference is a fraction of a second of play.
 *
 * WHAT IT GIVES BACK
 *   series(R, upTo) -> one row per minute 0..minutes-1:
 *     {m, y, x, team, you, cover}
 *     y     the ball's mean distance up the pitch in that minute, in the
 *           user's frame (0 = your goal line, 105 = theirs); null if no
 *           play was shown in that minute (yet)
 *     team  whose ball it was for most of the minute ('you' | 'them' | null)
 *     you   the share of the shown time the ball was yours (0..1)
 *     cover the share of the minute shown so far (1 = complete)
 *   Rows after `upTo` (a match minute, fractional allowed) are empty: the
 *   ribbon only draws what already happened.
 *   marks(R, upTo) -> the moments reached by `upTo`:
 *     {index, minute, team, y, x, endY, outcome, goal, scorer, label, steps}
 *     team: the side attacking in the moment (sit.who); y: where the ball
 *     was when the play froze; endY: where the result left it; goal:
 *     'you' | 'them' | null; scorer: a first name or null.
 *   head(R, upTo) -> {m, y, x, team} where the ball is at `upTo`.
 *   story(R) -> plain counts for a caption: minutes shown, minutes with
 *     the ball in their half and in yours, minutes each side had it.
 */
(function (root) {
  'use strict';
  var L = 105, W = 68;
  /* test switches: test.js turns one on to show the check guarding it fails */
  var BREAK = {};

  function other(t) { return t === 'you' ? 'them' : 'you'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function create(opts) {
    opts = opts || {};
    return {
      minutes: opts.minutes || 90,
      pieces: [],          // {m0, m1, a:{x,y}, b:{x,y}, team}
      moments: [],         // one per moment index, in order
      lastMin: 0,          // where the next play starts, in match minutes
      nameOf: typeof opts.nameOf === 'function' ? opts.nameOf : null
    };
  }

  /* ------------------------------------------------ the play before a moment */
  function holderDuring(e) {
    if (BREAK.team) return other(e.team === 'them' ? 'them' : 'you');
    var t = e.team === 'them' ? 'them' : 'you';
    return e.kind === 'foul' ? other(t) : t;
  }
  /* The ball's path through one director segment, as pieces in match time.
   * seg = {events, duration, keys?}; the segment's seconds map onto
   * fromMinute..toMinute. Returns the pieces (also stored on R). */
  function play(R, seg, toMinute, fromMinute) {
    var from = num(fromMinute, R.lastMin);
    var to = Math.max(num(toMinute, from), from);
    var ev = (seg && seg.events) || [];
    var dur = num(seg && seg.duration, 0);
    if (!(dur > 0) && ev.length) dur = ev[ev.length - 1].t + 1;
    var out = [];
    if (ev.length && to > from && dur > 0) {
      var k0 = seg.keys && seg.keys[0] && seg.keys[0].ball;
      var prev = k0 ? { x: k0.x, y: k0.y } : { x: ev[0].ball.x, y: ev[0].ball.y };
      var scale = (to - from) / dur;
      /* before the first event (normally none): the ball waits where it is */
      if (ev[0].t > 0) out.push({ m0: from, m1: from + ev[0].t * scale, a: prev, b: prev, team: holderDuring(ev[0]) });
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        var t0 = clamp(num(e.t, 0), 0, dur);
        var t1 = i + 1 < ev.length ? clamp(num(ev[i + 1].t, dur), t0, dur) : dur;
        var b = { x: clamp(num(e.ball && e.ball.x, prev.x), 0, W), y: clamp(num(e.ball && e.ball.y, prev.y), 0, L) };
        if (BREAK.endpoint) prev = b;
        if (BREAK.random) b.y = clamp(b.y + (Math.random() - 0.5) * 6, 0, L);
        if (BREAK.mutate && e.ball) e.ball.y = clamp(e.ball.y + 1, 0, L);
        if (t1 > t0) out.push({ m0: from + t0 * scale, m1: from + t1 * scale, a: prev, b: b, team: holderDuring(e) });
        prev = b;
      }
    }
    for (var j = 0; j < out.length; j++) R.pieces.push(out[j]);
    R.lastMin = to;
    return out;
  }

  /* ------------------------------------------------ a decision and its result */
  function firstName(p) { return p ? String(p.name || p.fullName || p).split(' ')[0] : null; }
  /* "Martínez comes out too late, and Yamal scores." -> Yamal;
   * "Oyarzabal gets to it first, and scores." -> Oyarzabal;
   * "Álvarez places it past Simón and scores." -> Álvarez */
  var NAME = /(^|[\s(])([A-ZÀ-Ý][a-zà-ÿ'’-]+(?:[\s ][A-ZÀ-Ý][a-zà-ÿ'’-]+)?)/;
  function scorerFromText(text) {
    var sents = String(text || '').split(/(?<=[.!?])\s+/);
    for (var i = 0; i < sents.length; i++) {
      if (!/\bscores\b/.test(sents[i])) continue;
      var clauses = sents[i].split(/,\s*/), c = clauses.length - 1;
      while (c >= 0 && !/\bscores\b/.test(clauses[c])) c--;
      for (; c >= 0; c--) { var m = clauses[c].match(NAME); if (m) return m[2]; }
    }
    return null;
  }
  function shortLabel(ev) {
    var s = String(ev.short || ev.headline || ev.text || '').replace(/, then [+-]?\d.*$/i, '').trim();
    return s.length > 40 ? s.slice(0, 38).replace(/\s+\S*$/, '') + '...' : s;
  }
  /* `seg` is the director's second of play for the result (its first key
   * frame is where the play froze), `ev` the engine's result; `frozenAt`
   * ({x, y}) overrides the freeze point. Call it once per decision, in order. */
  function result(R, seg, ev, frozenAt) {
    if (!ev) return R;
    var m = num(ev.minute, R.lastMin);
    var idx = typeof ev.index === 'number' ? ev.index : R.moments.length + 1;
    var team = ev.sit && ev.sit.who === 'them' ? 'them' : 'you';
    var mk = R.moments.length ? R.moments[R.moments.length - 1] : null;
    var evs = (seg && seg.events) || [];
    var k0 = seg && seg.keys && seg.keys[0] && seg.keys[0].ball;
    var startBall = frozenAt || k0 || (evs[0] && evs[0].ball) || null;
    if (!mk || mk.index !== idx) {
      mk = { index: idx, minute: m, team: team, y: startBall ? clamp(startBall.y, 0, L) : null,
        x: startBall ? clamp(startBall.x, 0, W) : null, endY: null, outcome: null, goal: null, scorer: null, label: '', steps: 0 };
      R.moments.push(mk);
    }
    mk.steps++;
    mk.outcome = ev.kind || null;
    mk.label = shortLabel(ev);
    var last = evs.length ? evs[evs.length - 1].ball : null;
    if (last) mk.endY = clamp(last.y, 0, L);
    var goal = ev.kind === 'goal' ? 'you' : ev.kind === 'conceded' ? 'them' : null;
    if (BREAK.goals && ev.kind === 'conceded') goal = null;
    if (goal) {
      mk.goal = goal;
      mk.endY = goal === 'you' ? L : 0;
      var shooter = null;
      for (var i = evs.length - 1; i >= 0; i--) if (evs[i].kind === 'shot' && evs[i].from) { shooter = evs[i].from; break; }
      /* the words first: they are what the user reads (the director has
       * been seen to stage a cut-back goal as the crosser's own shot) */
      mk.scorer = scorerFromText(ev.text) || (shooter && R.nameOf && firstName(R.nameOf(shooter))) || null;
    }
    if (m > R.lastMin) R.lastMin = m;
    return R;
  }

  /* ------------------------------------------------ reading it */
  function series(R, upTo) {
    var lim = typeof upTo === 'number' ? upTo : Infinity;
    if (BREAK.future) lim = Infinity;
    var n = R.minutes, rows = new Array(n);
    var sy = new Float64Array(n), sx = new Float64Array(n), ty = new Float64Array(n), tt = new Float64Array(n);
    for (var p = 0; p < R.pieces.length; p++) {
      var q = R.pieces[p], d = q.m1 - q.m0;
      if (!(d > 0) || q.m0 >= lim) continue;
      var end = Math.min(q.m1, lim);
      var mA = Math.max(0, Math.floor(q.m0)), mB = Math.min(n - 1, Math.ceil(end) - 1);
      for (var m = mA; m <= mB; m++) {
        var s = Math.max(q.m0, m), e = Math.min(end, m + 1);
        if (!(e > s)) continue;
        /* the straight line's mean over [s, e] is its value at the middle */
        var f = ((s + e) / 2 - q.m0) / d, w = e - s;
        sy[m] += w * (q.a.y + (q.b.y - q.a.y) * f);
        sx[m] += w * (q.a.x + (q.b.x - q.a.x) * f);
        tt[m] += w;
        if (q.team === 'you') ty[m] += w;
      }
    }
    for (var i = 0; i < n; i++) {
      var has = tt[i] > 1e-9;
      var you = has ? ty[i] / tt[i] : null;
      rows[i] = { m: i, y: has ? sy[i] / tt[i] : null, x: has ? sx[i] / tt[i] : null,
        team: has ? (you >= 0.5 ? 'you' : 'them') : null, you: you, cover: Math.min(1, tt[i]) };
    }
    return rows;
  }
  function copyMark(k) {
    return { index: k.index, minute: k.minute, team: k.team, y: k.y, x: k.x, endY: k.endY, outcome: k.outcome,
      goal: k.goal, scorer: k.scorer, label: k.label, steps: k.steps };
  }
  function marks(R, upTo) {
    var lim = typeof upTo === 'number' ? upTo : Infinity;
    return R.moments.filter(function (k) { return k.minute <= lim; }).map(copyMark);
  }
  function head(R, upTo) {
    var lim = typeof upTo === 'number' ? upTo : Infinity, best = null;
    for (var p = 0; p < R.pieces.length; p++) {
      var q = R.pieces[p];
      if (q.m0 > lim) continue;
      var f = q.m1 > q.m0 ? clamp((Math.min(lim, q.m1) - q.m0) / (q.m1 - q.m0), 0, 1) : 1;
      best = { m: Math.min(lim, q.m1), y: q.a.y + (q.b.y - q.a.y) * f, x: q.a.x + (q.b.x - q.a.x) * f, team: q.team };
    }
    return best;
  }
  function story(R, upTo) {
    var rows = series(R, upTo), o = { shown: 0, theirHalf: 0, yourHalf: 0, you: 0, them: 0 };
    rows.forEach(function (r) {
      if (r.y === null) return;
      o.shown++;
      if (r.y >= L / 2) o.theirHalf++; else o.yourHalf++;
      o[r.team]++;
    });
    return o;
  }

  /* one whole match from records, in order: [{kind:'play', seg, toMinute}
   * | {kind:'result', seg, ev, frozenAt}] */
  function run(steps, opts) {
    var R = create(opts);
    (steps || []).forEach(function (s) {
      if (s.kind === 'play') play(R, s.seg, s.toMinute);
      else result(R, s.seg, s.ev, s.frozenAt);
    });
    return R;
  }

  var API = { L: L, W: W, BREAK: BREAK, create: create, play: play, result: result, series: series, marks: marks,
    head: head, story: story, run: run, scorerFromText: scorerFromText };
  root.KMRibbon = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
