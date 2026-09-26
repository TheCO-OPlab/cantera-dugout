/* ft2: THE FULL-TIME SCREEN'S RECORDINGS, glued to the match page.
 *
 * The page calls five hooks (all marked // ft2 in play.html) and this file
 * keeps two recordings of what the page already showed:
 *   - the momentum ribbon (rib1's ribbon.js): every play before a moment and
 *     every result, in match minutes;
 *   - the goal clips (rp1's replay.js): the last seconds before each goal,
 *     for "Watch the goals" at full time.
 * Show only: it reads segments the page's director already made and the
 * engine's results; it never calls the director, never touches the match
 * or its RNG, and never writes to a segment.
 *
 *   var FT = KMFt2.install(api)   api: closures from the page (see below)
 *   FT.reset()                    a new match
 *   FT.play(seg, p)               the director's play before moment p
 *   FT.result(rseg, ev)           a decision's result (and a goal's clip)
 *   FT.busy()                     a replay has the pitch canvas
 *   FT.data()                     what the full-time screen needs:
 *     { ribbon: {series, marks, story}, clips: n, reel(onDone), kits }
 *
 * The replay player is rp1's; only its full-time reel is used here (the
 * "Replay the goal" button after each goal stays in rp1, not merged).
 * m5: when the page has its own goal replays (m4's RP: a recorder and a
 * player, with "Replay the goal" after each goal), api.rp() hands them over
 * and this file records nothing twice: the reel plays the page's clips on
 * the page's player. The ribbon for the full-time card is still this
 * file's own recording (ft2's reading, which ftcheck.js rebuilds).
 * ?rp=off switches the replay off (no "Watch the goals"); ?ft2break=<name>
 * breaks one thing on purpose so ftcheck.js can show its check fails. */
(function (root) {
  'use strict';
  function param(k) { var m = new RegExp('[?&]' + k + '=([^&#]*)').exec((root.location && root.location.search) || ''); return m ? decodeURIComponent(m[1]) : null; }

  /* api: { D, P, $, PIT, run(), kitsNow(), jzReduced(), firstName(p),
   *        verdictOf(ev), nowMs(), JS, canvasFrame(fr), jzPump(), real } */
  function install(api) {
    var RB = root.KMRibbon || null, RPL = param('rp') === 'off' ? null : root.CanteraReplay || null;
    var BRK = param('ft2break');
    var SH = typeof api.rp === 'function' ? api.rp : null;   // m5: the page's own replay (RP), when it has one
    var S = { R: null, rec: !SH && RPL && api.real ? new RPL.Recorder({ frameAt: api.D.frameAt }) : null, player: null };
    function shared() { var r = SH ? SH() : null; return r && r.rec && r.player ? r : null; }
    function newRibbon() {
      return RB ? RB.create({ nameOf: function (id) { var r = entry(id); return r ? r.p : null; } }) : null;
    }
    function roster() { var run = api.run(); return api.PIT.roster || (run && run.st ? api.P.roster(run.st) : []); }
    function entry(id) { var ros = roster(); for (var i = 0; i < ros.length; i++) if (ros[i].id === id) return ros[i]; return null; }
    function people(ev) {
      var run = api.run();
      return {
        teamOf: function (id) { var r = entry(id); return r ? r.team : null; },
        isKeeper: function (id) { var r = entry(id); return !!(r && r.keeper); },
        nameOf: function (id) { var r = entry(id); return r ? api.firstName(r.p) : ''; },
        byName: function (name, side) { var ros = roster(); for (var i = 0; i < ros.length; i++) if (ros[i].team === side && api.firstName(ros[i].p) === name) return ros[i].id; return null; },
        verdict: ev && ev.dice ? api.verdictOf(ev).text.replace(/: half a win \(\d+ or more is a clean win\)$/, '') : null,
        st: run && run.st
      };
    }
    function goalish(ev) { return !!ev && (ev.kind === 'goal' || ev.kind === 'conceded'); }
    function scene(fr) {
      var ros = api.PIT.roster || [], K = api.PIT.kits || (api.PIT.kits = api.kitsNow()), players = [];
      for (var i = 0; i < ros.length; i++) {
        var r = ros[i], q = fr.pos[r.id];
        if (!q) continue;
        players.push({ id: r.id, side: r.team, num: r.num, keeper: r.keeper, kit: K[r.team + (r.keeper ? 'GK' : '')], x: q.x, y: q.y, state: r.id === fr.holder ? 'carrier' : null });
      }
      var sc = { players: players, t: api.nowMs() / 1000, passes: [], ball: { x: fr.ball.x, y: fr.ball.y, z: (fr.ball.z || 0) * 2.6, spin: 0, trail: [] } };
      if (fr.ball.y > api.P.L || fr.ball.y < 0) { sc.goal = 1; sc.goalEnd = fr.ball.y > api.P.L ? 'you' : 'them'; }
      return sc;
    }
    if (S.rec) S.player = new RPL.Player({
      host: function () { return api.$('pbox'); },
      canvas: function () { return api.PIT.cv ? api.$('pcanvas') : null; },
      geometry: function () { return api.PIT.cv ? api.PIT.cv.geometry() : null; },
      drawPitch: function (fr) { if (api.PIT.cv) api.PIT.cv.draw(scene(fr)); },
      take: function () { var w = api.$('pworld'); if (w) w.style.transform = ''; },
      restore: function () {
        var w = api.$('pworld'); if (w) w.style.transform = api.JS.tf || '';
        api.JS.wDirty = api.JS.sDirty = true;
        if (api.PIT.frame) api.canvasFrame(api.PIT.frame);
        api.jzPump();
      },
      kit: function (side) { var K = api.PIT.kits || (api.PIT.kits = api.kitsNow()); return K[side]; },
      reduced: function () { return api.jzReduced(); },
      hide: '.pwfx,.psfx,.pfield,.pheat,.hlegend,#resultbox,#ltags',
      playOpts: function (o) { return seekOpts(o); }
    });
    function seekOpts(o) { var sk = param('rpseek'); if (sk !== null && sk !== '') o.seek = isNaN(+sk) ? sk : +sk; return o; }

    var FT = {
      reset: function () {
        S.R = newRibbon();
        if (S.rec) { S.player.stop(); S.rec.reset(); }   // (m5: with the page's replay, the page resets it)
      },
      play: function (seg, p) {
        if (!S.R) S.R = newRibbon();
        if (S.R && seg && p && !(BRK === 'miss' && p.index === 3)) RB.play(S.R, seg, p.minute);
        if (S.rec && seg) S.rec.play(seg, { minute: p && p.minute });
      },
      result: function (rseg, ev) {
        if (!S.R) S.R = newRibbon();
        if (S.R && ev) RB.result(S.R, rseg, ev);
        if (S.rec && rseg) { S.rec.result(rseg, ev); if (goalish(ev)) S.rec.goal(ev, people(ev)); }
      },
      busy: function () { var r = shared(); return r ? r.player.busy() : !!(S.player && S.player.busy()); },
      data: function () {
        var rib = S.R ? { series: RB.series(S.R), marks: RB.marks(S.R), story: RB.story(S.R) } : null;
        var sh = shared(), rec = sh ? sh.rec : S.rec, player = sh ? sh.player : S.player;   // m5
        var clips = rec ? rec.clips() : [];
        var K = api.kitsNow();
        return {
          ribbon: rib,
          clips: BRK === 'reel' ? 0 : clips.length,
          reel: clips.length && player ? function (onDone) {
            if (player.offer) player.offer(null);   // m5: the last goal's "Replay the goal" button goes
            return player.play(rec.clips(), seekOpts({ reel: true, onDone: onDone }));
          } : null,
          kits: { you: K.you, them: K.them }
        };
      },
      recording: function () { return S.R; }
    };
    FT.reset();
    return FT;
  }
  var API = { install: install };
  root.KMFt2 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
