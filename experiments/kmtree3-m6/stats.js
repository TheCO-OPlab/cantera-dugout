/* st1: MATCH STATS. Counts what the pitch shows, as the match advances.
 *
 * It reads two things and nothing else:
 *   1. the director's events between moments (GOALS.md, the pitch contract):
 *      {t, kind, team, from, to, ball:{x,y}, note}, t in seconds from the start
 *      of a segment, kind one of pass carry dribble tackle interception
 *      clearance shot save out foul kickoff, team 'you' or 'them'.
 *   2. the moment results, exactly as match.js choose() returns them
 *      (ev.minute, ev.index, ev.sit.who, ev.kind, ev.icon, ev.short, ev.text,
 *      ev.shot).
 * It never touches the engine or any RNG: same input, same numbers.
 *
 * HOW THE DIRECTOR'S EVENTS ARE READ (written down so p1 can match it):
 *   - `team` is the team that does the action. For a foul it is the team that
 *     commits it; for `out` it is the team that put the ball out.
 *   - Who has the ball after an event: `poss` if the event carries it,
 *     otherwise the acting team, except after a foul or an out, where the
 *     other team restarts (or `restart`'s team for an out: a corner goes to
 *     the attacking team, `note` or `restart` containing "corner").
 *   - A pass is completed when the next event is by the same team (and is
 *     not an out or a foul by them), or is a foul by the other team on the
 *     receiver. A pass that is the last event of a segment is completed (the
 *     segment ends with the named player holding the ball). `ok:true/false`
 *     on the pass overrides this.
 *   - A shot is on target when the next event is a save, or `onTarget` is set.
 *   - Time: a segment maps its seconds onto match minutes (beginSegment's
 *     fromMinute..toMinute). Between two events the ball travels in a straight
 *     line and the team holding it gets that time, both for possession and in
 *     its heatmap.
 *
 * HOW A MOMENT RESULT IS READ: goals from ev.kind (goal, conceded); your shots
 * from ev.shot; their shots, saves, corners and fouls from the result's words
 * (ev.short and ev.text), because the engine does not yet say them as data.
 * If a result carries `ev.stat = {shot, onTarget, corner, foul, won}` (team
 * names), that wins. Recommended: the engine adds ev.stat, then the regexes
 * below can go.
 */
(function (root) {
  'use strict';
  var W = 68, L = 105;
  var TEAMS = ['you', 'them'];
  var KINDS = ['pass', 'carry', 'dribble', 'tackle', 'interception', 'clearance', 'shot', 'save', 'out', 'foul', 'kickoff'];

  function other(t) { return t === 'you' ? 'them' : 'you'; }
  function pair(v) { return { you: v, them: v }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function create(opts) {
    opts = opts || {};
    var cols = opts.cols || 17, rows = opts.rows || 21;
    return {
      cols: cols, rows: rows,
      minute: 0,
      poss: pair(0),            // minutes each team held the ball
      passAtt: pair(0), passDone: pair(0),
      shots: pair(0), onTarget: pair(0), goals: pair(0),
      corners: pair(0), fouls: pair(0),
      tackles: pair(0), interceptions: pair(0), won: pair(0),
      heat: { you: new Array(cols * rows).fill(0), them: new Array(cols * rows).fill(0) },
      keyMoments: [],
      seg: null,                // {from, to, dur}
      last: null,               // {minute, ball, holder}
      pendPass: null, pendShot: null,
      events: 0, results: 0
    };
  }

  /* ---------- time and space ---------- */
  function minuteOf(s, ev) {
    if (typeof ev.minute === 'number') return ev.minute;
    var g = s.seg;
    if (!g) return s.minute;
    var f = g.dur > 0 ? clamp(ev.t / g.dur, 0, 1) : 1;
    return g.from + f * (g.to - g.from);
  }
  function cellOf(s, x, y) {
    var c = clamp(Math.floor(x / W * s.cols), 0, s.cols - 1);
    var r = clamp(Math.floor(y / L * s.rows), 0, s.rows - 1);
    return r * s.cols + c;
  }
  /* the ball travels a straight line from a to b over `mins`, held by `team`:
   * spread the minutes along the line, about one sample a metre */
  function spend(s, team, a, b, mins) {
    if (!(mins > 0) || !team || !s.heat[team]) return;
    s.poss[team] += mins;
    var d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    var n = Math.max(1, Math.ceil(d));
    var w = mins / n, h = s.heat[team];
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n;
      h[cellOf(s, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)] += w;
    }
  }

  /* ---------- the director's events ---------- */
  function beginSegment(s, o) {
    o = o || {};
    endSegment(s);
    var from = typeof o.fromMinute === 'number' ? o.fromMinute : s.minute;
    var to = typeof o.toMinute === 'number' ? o.toMinute : from;
    s.seg = { from: from, to: to, dur: typeof o.duration === 'number' ? o.duration : 5 };
    s.last = null;
    return s;
  }
  function holderAfter(ev) {
    if (ev.poss === 'you' || ev.poss === 'them') return ev.poss;
    if (ev.kind === 'foul') return other(ev.team);
    if (ev.kind === 'out') {
      var r = ev.restart || '';
      if (r === 'you' || r === 'them') return r;
      if (/corner/i.test(r + ' ' + (ev.note || ''))) return other(ev.team);
      return other(ev.team);
    }
    return ev.team;
  }
  function isCorner(ev) { return ev.kind === 'out' && /corner/i.test((ev.restart || '') + ' ' + (ev.note || '')); }

  function resolvePass(s, next) {
    var p = s.pendPass; if (!p) return;
    s.pendPass = null;
    var ok;
    if (typeof p.ok === 'boolean') ok = p.ok;
    else if (!next) ok = true;
    else if (next.team === p.team) ok = next.kind !== 'out' && next.kind !== 'foul';
    else ok = next.kind === 'foul';
    if (ok) s.passDone[p.team]++;
  }
  function resolveShot(s, next) {
    var p = s.pendShot; if (!p) return;
    s.pendShot = null;
    var on = typeof p.onTarget === 'boolean' ? p.onTarget : !!(next && next.kind === 'save');
    if (on) s.onTarget[p.team]++;
  }

  function event(s, ev) {
    if (!ev || KINDS.indexOf(ev.kind) < 0) return s;
    var team = ev.team === 'them' ? 'them' : 'you';
    var m = minuteOf(s, ev);
    var ball = ev.ball || (s.last && s.last.ball) || { x: W / 2, y: L / 2 };
    var e = { kind: ev.kind, team: team };
    if (s.last) spend(s, s.last.holder, s.last.ball, ball, m - s.last.minute);
    /* the time before a segment's first event goes to the team that makes it */
    else if (s.seg) spend(s, team, ball, ball, m - s.seg.from);
    resolvePass(s, e); resolveShot(s, e);
    switch (ev.kind) {
      case 'pass':
        s.passAtt[team]++;
        s.pendPass = { team: team, ok: typeof ev.ok === 'boolean' ? ev.ok : null };
        break;
      case 'shot':
        s.shots[team]++;
        s.pendShot = { team: team, onTarget: typeof ev.onTarget === 'boolean' ? ev.onTarget : null };
        if (ev.goal) { s.goals[team]++; }
        break;
      case 'tackle': s.tackles[team]++; s.won[team]++; break;
      case 'interception': s.interceptions[team]++; s.won[team]++; break;
      case 'foul': if (ev.note !== 'offside') s.fouls[team]++; break;   /* m3: an offside is not a foul */
      case 'out': if (isCorner(ev)) s.corners[holderAfter(ev)]++; break;
    }
    s.last = { minute: m, ball: { x: ball.x, y: ball.y }, holder: holderAfter(ev) };
    s.minute = Math.max(s.minute, m);
    s.events++;
    return s;
  }
  /* the time from the last event to the end of the segment: the ball stays
   * where it is, with the team that has it */
  function endSegment(s) {
    if (!s.seg) return s;
    if (s.last) spend(s, s.last.holder, s.last.ball, s.last.ball, s.seg.to - s.last.minute);
    resolvePass(s, null); resolveShot(s, null);
    s.minute = Math.max(s.minute, s.seg.to);
    s.seg = null; s.last = null;
    return s;
  }
  function segment(s, events, o) {
    beginSegment(s, o);
    (events || []).forEach(function (ev) { event(s, ev); });
    return endSegment(s);
  }

  /* ---------- moment results ---------- */
  var RX = {
    save: /\bsaves?\b|pushes the shot|pushes it (out|round)|round the post|hits it straight at|too close to|keeper saves/i,
    theirShot: /\bshot\b|\bshoots\b|\bsaves?\b|round the post|heads it (over|wide)|cannot head it cleanly|over the bar|\bheader\b/i,   /* txt2: + 'cannot head it cleanly' (was 'heads it over') */
    corner: /corner to (them|you|your team)|out for (their|your) corner|for a corner/i,
    fkYou: /free kick to (your team|you)\b/i,
    fkThem: /free kick to them\b/i,
    offside: /offside/i
  };
  function classify(ev) {
    if (ev.stat) return ev.stat;
    var who = ev.sit && ev.sit.who === 'them' ? 'them' : 'you';
    var words = (ev.short || '') + ' | ' + (ev.text || '');
    var o = { shot: null, onTarget: false, goal: null, corner: null, foul: null, won: null };
    if (ev.kind === 'goal') { o.shot = 'you'; o.onTarget = true; o.goal = 'you'; }
    else if (ev.kind === 'conceded') { o.shot = 'them'; o.onTarget = true; o.goal = 'them'; }
    else if (who === 'you' && ev.shot) { o.shot = 'you'; o.onTarget = RX.save.test(words); }
    else if (who === 'them' && RX.theirShot.test(words)) { o.shot = 'them'; o.onTarget = RX.save.test(words); }
    var c = words.match(RX.corner);
    if (c) o.corner = /them|their/i.test(c[0]) ? 'them' : 'you';
    if (!RX.offside.test(words)) {
      if (RX.fkYou.test(words)) o.foul = 'them';
      else if (RX.fkThem.test(words)) o.foul = 'you';
    }
    if (who === 'you' && ev.kind === 'lost') o.won = 'them';
    if (who === 'them' && (ev.kind === 'escaped' || (ev.kind === 'stopped' && ev.icon === 'won'))) o.won = 'you';
    return o;
  }
  /* "Into their box, then +2 to you next" -> "Into their box" */
  function labelOf(ev) {
    var t = ev.text || '';
    if (ev.kind === 'goal' || ev.kind === 'conceded') {
      var g = t.match(/([A-ZÀ-Ý][\wÀ-ÿ'’-]+(?: [A-ZÀ-Ý][\wÀ-ÿ'’-]+)?) scores/);
      if (g) return g[1] + ' scores';
      return ev.kind === 'goal' ? 'You score' : 'They score';
    }
    var sh = ev.short || ev.headline || t;
    sh = String(sh).replace(/, then [+-]?\d.*$/i, '').replace(/\s+$/, '');
    return sh.length > 60 ? sh.slice(0, 57).replace(/\s+\S*$/, '') + '...' : sh;
  }

  function moment(s, ev) {
    if (!ev) return s;
    var o = classify(ev);
    if (o.shot) { s.shots[o.shot]++; if (o.onTarget) s.onTarget[o.shot]++; }
    if (o.goal) s.goals[o.goal]++;
    if (o.corner) s.corners[o.corner]++;
    if (o.foul) s.fouls[o.foul]++;
    if (o.won) s.won[o.won]++;
    var team = ev.sit && ev.sit.who === 'them' ? 'them' : 'you';
    var km = s.keyMoments[s.keyMoments.length - 1];
    var step = { icon: ev.icon || null, label: labelOf(ev), kind: ev.kind || null, team: team };
    if (km && km.index === ev.index && typeof ev.index === 'number') {
      km.chain.push(step);
      km.icon = step.icon; km.label = step.label; km.kind = step.kind; km.team = team;
    } else {
      s.keyMoments.push({ index: typeof ev.index === 'number' ? ev.index : s.keyMoments.length + 1,
        minute: ev.minute, team: team, icon: step.icon, label: step.label, kind: step.kind, chain: [step] });
    }
    if (typeof ev.minute === 'number') s.minute = Math.max(s.minute, ev.minute);
    s.results++;
    return s;
  }

  /* ---------- reading it ---------- */
  function share(a, b) { var t = a + b; return t > 0 ? { you: a / t, them: b / t } : { you: 0.5, them: 0.5 }; }
  function copyPair(p) { return { you: p.you, them: p.them }; }
  function heat(s, team) {
    var h = s.heat[team] || [], max = 0, total = 0;
    for (var i = 0; i < h.length; i++) { if (h[i] > max) max = h[i]; total += h[i]; }
    return { team: team, cols: s.cols, rows: s.rows, cellW: W / s.cols, cellH: L / s.rows, cells: h.slice(), max: max, total: total };
  }
  function summary(s) {
    return {
      minute: s.minute,
      possession: share(s.poss.you, s.poss.them),
      possMinutes: copyPair(s.poss),
      possessionByPasses: share(s.passAtt.you, s.passAtt.them),
      passes: { you: { done: s.passDone.you, att: s.passAtt.you }, them: { done: s.passDone.them, att: s.passAtt.them } },
      shots: copyPair(s.shots), onTarget: copyPair(s.onTarget), goals: copyPair(s.goals),
      corners: copyPair(s.corners), fouls: copyPair(s.fouls),
      tackles: copyPair(s.tackles), interceptions: copyPair(s.interceptions), won: copyPair(s.won),
      keyMoments: s.keyMoments.map(function (k) {
        return { index: k.index, minute: k.minute, team: k.team, icon: k.icon, label: k.label, kind: k.kind,
          chain: k.chain.map(function (c) { return { icon: c.icon, label: c.label, kind: c.kind, team: c.team }; }) };
      }),
      heat: { you: heat(s, 'you'), them: heat(s, 'them') }
    };
  }
  /* replay: [{fromMinute, toMinute, duration, events}] and results, in order
   * of minute; a segment runs before the results at or after its toMinute */
  function run(segments, results, opts) {
    var s = create(opts), ri = 0;
    results = results || [];
    (segments || []).forEach(function (g) {
      while (ri < results.length && results[ri].minute < g.toMinute) moment(s, results[ri++]);
      segment(s, g.events, g);
    });
    while (ri < results.length) moment(s, results[ri++]);
    return s;
  }

  var API = { W: W, L: L, KINDS: KINDS, TEAMS: TEAMS, create: create, beginSegment: beginSegment, event: event,
    endSegment: endSegment, segment: segment, moment: moment, classify: classify, labelOf: labelOf,
    summary: summary, heat: heat, run: run, cellOf: cellOf };
  root.KMStats = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
