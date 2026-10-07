/* Match-core playtest telemetry.
 *
 * Records what a player is shown and what they decide, so a match can be read
 * back move by move afterwards (tel_read.py). Same Supabase table and the same
 * client behaviour as the public Dugout build (docs/playtest-telemetry.md):
 * anonymous random session id, one run id per match, batched POSTs, a
 * keepalive flush when the tab hides or closes, and every failure silent.
 *
 * It needs no edits to play.html beyond loading this file LAST: it wraps
 * window.KMMatch.newMatch / next / choose in place. play.html calls them as
 * X.newMatch(...) on the same object, so the wrappers are what it runs.
 *
 * Sends nothing when: the URL has notel=1, the browser is automated
 * (navigator.webdriver), fetch is missing, or KMMatch is not on the page.
 * Under node (the tests) it does nothing at all.
 *
 * ?teltest=1 tags every event with build "matchcore-test" (and allows an
 * automated browser), so verification runs are kept out of real data.
 *
 * The URL and anon key below are public by design: the anon key can only
 * INSERT into tel_events (row level security); reading needs the service key,
 * which never goes in this repo.
 */
(function () {
  'use strict';
  /* kmtree5 a6 (stream X): THE SWITCHES IN THE ADDRESS. match_start did not say which switches the page was opened
   * with, so a playtest could not show whether a prototype (?a5def=on, ?a5recv=on) or a fix (?xhead=a5, ?move=a5)
   * was on. flagsOf reads the page's query string into a small object, names and values exactly as typed:
   * "?cup&seed=16800&a5recv=on" gives { cup: true, seed: "16800", a5recv: "on" }. Nothing but what is in the
   * address: at most 24 switches, a name of letters, digits, "_", "." or "-" (24 at most), a value cut at 40
   * characters. speedOf is the play speed the match is watched at when it starts (1, or 2 for 2X): the page's own
   * number (play.html window.__pace1().speed), else what it stored (localStorage cantera-pitch-speed). Both are pure
   * and exported for node (x_telcheck.js); under node nothing else in this file runs, as before. */
  function flagsOf(search) {
    var out = {}, n = 0;
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv || n >= 24) return;
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? true : kv.slice(i + 1);
      try { k = decodeURIComponent(k); if (v !== true) v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { }
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,23}$/.test(k)) return;
      if (!Object.prototype.hasOwnProperty.call(out, k)) n++;
      out[k] = v === true ? true : String(v).slice(0, 40);
    });
    return out;
  }
  function speedOf(w) {
    try { var pc = w && typeof w.__pace1 === 'function' ? w.__pace1() : null; if (pc && (pc.speed === 1 || pc.speed === 2)) return pc.speed; } catch (e) { }
    try { return w.localStorage.getItem('cantera-pitch-speed') === '2' ? 2 : 1; } catch (e) { return null; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { flagsOf: flagsOf, speedOf: speedOf };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  /* playcheck.js runs the real page under node with a DOM shim, window set to
   * global and node's own fetch available: without this line every test run
   * would post a fake match to the live table. */
  if (typeof process !== 'undefined' && process.versions && process.versions.node) return;

  var CFG = {
    url: 'https://zirfwbjwvnjuzrqmfsbs.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppcmZ3Ymp3dm5qdXpycW1mc2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNTU2MTQsImV4cCI6MjEwMzgzMTYxNH0.htae7NLTMV7NF7dsJHrSxK2b0Eem-eQ5tS_43iCgLRA',
    build: (function () { try { return /[?&]sim=(off|none|0)\b/.test((window.location && window.location.search) || '') ? 'matchcore-kmtree6-b9-simoff' : 'matchcore-kmtree6-b9'; } catch (e) { return 'matchcore-kmtree6-b9'; } })()   /* kmtree6 b1 (stream PLAY): a16 + the sim mode (?sim=on, the default; ?sim=off is a16's match, label -simoff). Before:  a16 = a15 + his rulings of 10-06 (M-1 never certain with the critical roll, M-2 a check per step, M-3 the man in the way, M-5 the drop back holds, M-6 three won balls a moment, modals centred, the dice bar); a15 = a12 + pieces as rules (a13), D-3, D-4, the wide-pass fix; a12 = a11 + cup1 (the 7-match Cup, the overtime rest), abc36 on */
  };

  try {
    var q = String((window.location && window.location.search) || '');
    var test = /[?&]teltest=1(&|$)/.test(q);
    if (/[?&]notel=1(&|$)/.test(q)) return;
    if (!test && window.navigator && window.navigator.webdriver) return;
    if (typeof window.fetch !== 'function') return;
    var X = window.KMMatch;
    if (!X || X.__tel) return;
    if (test) CFG.build = 'matchcore-test';
  } catch (e) { return; }

  var sid;
  try {
    sid = window.localStorage.getItem('cantera-mc-sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 12);
      window.localStorage.setItem('cantera-mc-sid', sid);
    }
  } catch (e) { sid = 's' + Math.random().toString(36).slice(2, 10); }

  var runId = null, seq = 0, t0 = 0, buf = [], timer = null;
  var now = function () {
    try { return window.performance.now(); } catch (e) { return Date.now(); }
  };

  function post(rows, keepalive) {
    try {
      window.fetch(CFG.url + '/rest/v1/tel_events', {
        method: 'POST', keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', apikey: CFG.key,
                   Authorization: 'Bearer ' + CFG.key,
                   Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      }).catch(function () {});
    } catch (e) {}
  }
  function flush(keepalive) {
    try {
      if (!buf.length) return;
      var rows = buf; buf = [];
      clearTimeout(timer); timer = null;
      post(rows, keepalive);
    } catch (e) {}
  }
  function log(type, data) {
    try {
      if (!runId) return;
      var d = data || {};
      d.t = Date.now() - t0;
      buf.push({ session_id: sid, run_id: runId, build: CFG.build,
                 seq: seq++, type: type, data: d });
      if (buf.length >= 5) flush();
      else if (!timer) timer = setTimeout(function () { flush(); }, 3000);
    } catch (e) {}
  }

  /* ---- compact snapshots ------------------------------------------- */

  function num(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
  function nm(p) { return p ? (p.name || p.id || null) : null; }

  function player(p, bench) {
    var r = { id: p.id, name: p.name, role: p.role };
    if (p.pos !== undefined) r.pos = p.pos;
    if (p.short !== undefined) r.short = p.short;
    if (p.line !== undefined) r.line = p.line;
    if (p.slot !== undefined) r.slot = p.slot;
    if (p.attr) r.attr = p.attr;
    if (p.heightM !== undefined) r.heightM = p.heightM;
    if (p.height !== undefined) r.height = p.height;
    if (p.isKeeper) r.keeper = true;
    if (bench) r.bench = true;
    return r;
  }
  function squad(s) {
    if (!s) return null;
    var out = { club: s.club && (s.club.name || s.club), formation: s.formation, players: [] };
    try {
      if (s.keeper) out.players.push(player(s.keeper));
      (s.players || []).forEach(function (p) { out.players.push(player(p)); });
      (s.bench || []).forEach(function (p) { out.players.push(player(p, true)); });
    } catch (e) {}
    return out;
  }
  /* st3 (Codex review of st3, item 2): what the card said beyond its odds, so a match can be read back */
  function first(p) { return p ? String(p.name || '').split(' ')[0] : null; }
  function recs(o) {
    return (o.fx || []).filter(function (r) { return !r.idle; }).map(function (r) { return { source: r.source, field: r.field, band: r.band || null, text: r.text }; });
  }
  function guessOf(o, st, p) {
    var g = o.guess; if (!g) return null;
    var you = !p || !p.moment || p.moment.sit.who !== 'them';
    var att = you ? o.actor : (p.theirMove && p.theirMove.att) || null, def = you ? o.foil : o.actor;
    return { n: g.n, kind: g.kind, same: !!g.same, why: g.why, defender: first(def), attacker: first(att) };
  }
  function rules(st) {
    var CA = window.KMContentA;
    var RS = window.KMResolve || {};
    return { dice: RS.DICE || 6, cleanBy: RS.GOOD_BY || 4,   /* kmtree5: the dice switch (ruling 6) */
      guess: st && st.guess ? st.guess.mode : null, counter: st ? st.counter || null : null,
      learn: st && st.counter === 'learn' ? 'old' : 'off', show: CA && CA.SHOW_MODE ? CA.SHOW_MODE : null };
  }
  /* the rattled, booked and watched (marked) badges on screen, from bviz.js (the page's own reading) */
  function badges(st) {
    try {
      var BV = window.KMBuildViz; if (!BV || !st) return [];
      return BV.badges(st).filter(function (b) { return /^(rattled|booked|marked)$/.test(b.state); })
        .map(function (b) { return { state: b.state, who: first(b.p), side: b.side, label: b.label, sources: b.sources || [] }; });
    } catch (e) { return []; }
  }
  function option(o, i, st, p) {
    var c = o.chances || {};
    var r = {
      pos: i, id: o.id, label: o.label, disabled: !!o.disabled,
      odds: { good: num(c.good), mixed: num(c.mixed), bad: num(c.bad) },
      certain: !!(o.certain || c.certain),
      mineVal: o.mineVal, themVal: o.themVal,
      mineAttr: o.mineAttr, themAttr: o.themAttr,
      bonus: o.bonus || 0, actor: nm(o.actor), foil: nm(o.foil)
    };
    if (o.because) r.because = o.because;
    if (o.family) r.family = o.family;
    /* st3 */
    if (o.showSafe) r.showSafe = true;
    /* kmtree5 a11 (helper G11): the rattled card of "Gets under your skin" (one a menu, the first decision of a moment):
     * the card keeps its own id and label, and this one field says it was the rattled one. Only on that card. */
    if (o.rattled) r.rattled = true;
    var g = guessOf(o, st, p); if (g) r.guess = g;
    var fx = recs(o); if (fx.length) r.fx = fx;
    r.outcomes = (o.outcomes || []).map(function (x) { return { effect: x.effect, text: x.text, p: num(x.p) }; });
    return r;
  }

  /* ---- the wrappers ------------------------------------------------ */

  var shown = null;          // the pending object last logged as a moment
  var shownAt = 0;           // when it was logged (the render follows at once)
  var stepNo = 0;            // decisions shown this match, follow-ups included
  var ended = false;

  function logMoment(p, st, why) {
    try {
      if (!p || (p === shown && !why)) return;
      shown = p; shownAt = now(); stepNo++;
      var mo = p.moment || {}, sit = mo.sit || {};
      var d = {
        step: stepNo, index: p.index, minute: p.minute,
        sit: sit.id, sitName: sit.name, who: sit.who,
        text: mo.text,
        options: (mo.options || []).map(function (o, i) { return option(o, i, st, p); })
      };
      /* st3: the attack for show, the rule switches, the badges on screen, and why this was logged again */
      d.showing = !!p.showing; if (p.shownBy) d.shownBy = p.shownBy;
      d.canShow = !!(st && X.canShowNow && orig.canShowNow ? orig.canShowNow.call(X, st) : false);
      d.rules = rules(st); d.badges = badges(st);
      /* kmtree5: the counters on screen (Belief, Build-up, pockets, streaks, their effects), as the engine gives them */
      try { if (X.counters) { var kc = X.counters(st); if (kc && kc.length) d.counters = JSON.parse(JSON.stringify(kc)); } } catch (e) { }
      if (why) d.relogged = why;
      if (p.lead !== undefined) d.lead = p.lead;
      if (p.continues !== undefined) d.continues = p.continues;
      if (p.broke) d.broke = p.broke;
      if (p.share !== undefined) d.share = num(p.share);
      if (p.legs) d.legs = { def: Math.round(p.legs.def), mid: Math.round(p.legs.mid), att: Math.round(p.legs.att) };
      log('moment', d);
    } catch (e) {}
  }

  var orig = { newMatch: X.newMatch, next: X.next, choose: X.choose, report: X.report, isOver: X.isOver, showAttack: X.showAttack, canShowNow: X.canShowNow };

  X.newMatch = function (sq, opp, seed, style, mopts) {
    var st = orig.newMatch.apply(this, arguments);
    try {
      flush();
      runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      seq = 0; t0 = Date.now(); shown = null; stepNo = 0; ended = false;
      /* m6: which build was loaded (yours and theirs), and the x1 and payoff
       * switches, so a match can be told apart without guessing from the
       * pieces that fired */
      var b = (mopts && mopts.build) || null, ob = (mopts && mopts.oppBuild) || null;
      var fxm = window.KMEffects;
      log('match_start', {
        seed: seed, style: st && st.style, moments: X.MOMENTS,
        page: String(window.location && window.location.pathname || '').split('/').pop(),
        /* a6 (stream X): the switches in the address, and the play speed (1, or 2 for 2X) as the match starts */
        flags: flagsOf(window.location && window.location.search), speed: speedOf(window),
        you: squad(sq), them: squad(opp),
        buildId: b ? (b.id || null) : null, buildName: b ? (b.name || null) : null,
        oppBuildId: ob ? (ob.id || null) : null,
        x1: st && st.x1 ? st.x1 : null,
        rules: rules(st),   /* st3 */
        payoff: fxm && typeof fxm.payoffOn === 'function' ? !!fxm.payoffOn() : null,
        /* bx1: how the build was played: 'full' (s0's way), 'guided' or
         * 'journey', the journey's match (1-based) of how many, its pace, the
         * piece keys loaded and the ones new this match; null with no build */
        bxMode: window.__bxNow ? window.__bxNow.mode : null,
        bxStep: window.__bxNow ? window.__bxNow.step : null,
        bxOf: window.__bxNow ? window.__bxNow.of : null,
        bxPace: window.__bxNow ? window.__bxNow.pace : null,
        bxPieces: window.__bxNow ? window.__bxNow.pieces : null,
        bxAdded: window.__bxNow ? window.__bxNow.added || null : null,
        /* st4: the cup: its run id, the match number, the opponent, and the pieces and upgrades owned */
        cup: window.__cupNow || null
      });
      flush();
    } catch (e) {}
    return st;
  };

  X.next = function (st) {
    var p = orig.next.apply(this, arguments);
    logMoment(p, st);
    return p;
  };
  /* st3: pressing Show them one side rebuilds the menu without next(): log the press and the new menu */
  /* _edge/st1edge.js --break telshow (?stbreak=telshow): st3's first version (no wrap) */
  if (orig.showAttack && !/[?&]stbreak=telshow/.test(String(window.location.search || ''))) X.showAttack = function (st, by) {
    var ok = orig.showAttack.apply(this, arguments);
    try { if (ok && st && st.pending) { log('show_pressed', { step: stepNo, index: st.pending.index, by: by || 'you' }); logMoment(st.pending, st, 'show'); } } catch (e) {}
    return ok;
  };

  X.choose = function (st, index) {
    var p = st && st.pending, ms = null, pos = null, o = null;
    try {
      ms = p === shown ? Math.round(now() - shownAt) : null;
      if (p) {
        var live = p.moment.options.filter(function (x) { return !x.disabled; });
        o = live[index] || null;
        pos = o ? p.moment.options.indexOf(o) : null;
      }
    } catch (e) {}
    var ev = orig.choose.apply(this, arguments);
    try {
      if (ev) {
        var d = {
          step: stepNo, index: ev.index, minute: ev.minute,
          sit: ev.sit && ev.sit.id,
          option: o ? o.id : null, label: ev.label, pos: pos, liveIndex: index,
          ms: ms, dice: ev.dice ? {
            mine: ev.dice.mine, theirs: ev.dice.theirs, mineTotal: ev.dice.mineTotal,
            themTotal: ev.dice.themTotal, diff: ev.dice.diff, line: ev.dice.line
          } : null,
          certain: !!ev.certain, band: ev.band, effect: ev.effect, kind: ev.kind,
          text: ev.text, score: st && st.score ? { you: st.score.you, them: st.score.them } : null
        };
        /* st3: the chosen card's pieces and Guessing, and whether it was a card for show */
        if (o) { var cf = recs(o); if (cf.length) d.fx = cf; var cg = guessOf(o, st, p); if (cg) d.guess = cg; if (o.showSafe) d.showSafe = true; }
        d.shot = !!ev.shot;
        if (ev.fx && ev.fx.length) d.fxLines = ev.fx;
        if (ev.headline !== undefined) d.headline = ev.headline;
        if (ev.chains) d.chains = ev.chains;
        log('choice', d);
      }
      /* a play that continues sets the follow-up decision without next() */
      if (st && st.pending && st.pending !== p) logMoment(st.pending, st);
      if (st && !ended && orig.isOver.call(X, st)) {
        ended = true;
        var r = orig.report.call(X, st);
        log('match_end', {
          score: r.score ? { you: r.score.you, them: r.score.them } : null,
          won: r.won, drew: r.drew, counts: r.counts,
          lines: (r.lines || []).map(function (l) { return { good: l.good, head: l.head, why: l.why }; }),
          run: (function () { try { return X.runReport ? X.runReport(st) : null; } catch (e) { return null; } })()   /* kmtree5 */
        });
        flush();
      }
    } catch (e) {}
    return ev;
  };

  /* st4: the cup's own events between matches (cup_result, cup_offer, cup_pick, cup_end; kmtree5: cup_belief, cup_order,
   * cup_release, cup_keepgoing), under the last match's run id */
  function event(type, data) {
    if (/[?&]stbreak=cuptel/.test(String(window.location.search || ''))) return;
    if (!runId) { runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); seq = 0; t0 = Date.now(); }   /* a reload between matches */
    log(type, data); flush();
  }
  X.__tel = { build: CFG.build, flush: flush, runId: function () { return runId; }, event: event,
    quietNewMatch: orig.newMatch /* kmtree5: the cup's team sheet previews kickoff on a copy; that is not a match */ };

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { log('visibility', { state: 'hidden' }); flush(true); }
      else log('visibility', { state: 'visible' });
    });
    window.addEventListener('pagehide', function () { log('visibility', { state: 'leave' }); flush(true); });
  } catch (e) {}
})();
