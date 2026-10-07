/* simpage.js (kmtree6 b1, stream PLAY): the sim mode on the page. Loaded after match.js, pitch.js, director.js, pm.js, the pinned world
 * (simpin.js) and simplay.js. With ?sim=off it does nothing at all (a16's page). With the sim on (the default):
 *   - KMMatch.choose: the world starts from the picture of the decision (KMSimPage.picture(), the page's run.pitch: what is drawn), and
 *     after the engine settled the card it plays the card's result and the play after it (simplay.after; ev.sim holds the record)
 *   - KMMatch.next: a decision the world made (a stop, or your attack from a ball your team won) gets its menu from the picture (pm.js)
 *   - KMDirector.frameAt / stopEnd: a segment of the world's film (seg.sim) is read from the world's frames, so the page's player, the
 *     replay, the ribbon and the timing helpers draw it like any director segment
 *   - b4 (helper PLAY-PAGE, world stops only, ?simstops=world, the default): KMMatch.next runs SIMP.drive: an open-play moment's decision
 *     is not offered; the page's own director segment for that moment (D.segment + WhyStage + R3Stage from the picture the page will
 *     start it from, as between() makes it) is kept on the lead (rec.dirSeg) and the world starts from its last frame; the world plays to
 *     its first chance (a stop: the next decision) or the moment passes with no decision (rec.ended, rec.endLine). The leads go on the
 *     decision shown (p.simLeads, not enumerable); play.html plays them in order before its menu. ?simstops=engine: b3's page.
 * window.__sim: counters and the last records, for the Edge check. */
(function (root) {
  'use strict';
  var SIMP = root.KMSimPlay, D = root.KMDirector, X = root.KMMatch, WR = root.KMSimWorld;
  var PG = root.KMSimPage = { on: false, picture: null, recs: [], menus: [], errs: [], pin: root.KMSimPin || null };
  if (!SIMP || !SIMP.SW.on) return;
  if (!D || !X || !WR || !root.KMPM || !root.KMPitch) { PG.errs.push('missing: ' + ['KMDirector', 'KMMatch', 'KMSimWorld', 'KMPM', 'KMPitch'].filter(function (k) { return !root[k]; }).join(', ')); return; }
  PG.on = true;
  SIMP.install({ World: WR.World, P: root.KMPitch, M: root.KMModel, PM: root.KMPM, O: root.KMOptions, PH: root.KMPhrases || null, X: X });
  var fa0 = D.frameAt; D.frameAt = function (seg, t) { return seg && seg.sim ? SIMP.frameAt(seg, t) : fa0.apply(D, arguments); };
  if (D.stopEnd) { var se0 = D.stopEnd; D.stopEnd = function (seg) { return seg && seg.sim ? false : se0.apply(D, arguments); }; }
  var next0 = X.next, choose0 = X.choose, broken = new WeakMap(), PS = new WeakMap();
  /* b4: where the page will start the next fresh moment's play from: m.from (the end of what the world drew last, set by X.choose), or
   * m.last (a card the world did not play: the page resolves it with the director, here first, and play.html draws that same segment) */
  PG.leads = 0; PG.leadsNone = 0; PG.leadsFrom = { engine: 0, handoff: 0 }; PG.leadRecs = []; PG.nextMs = [];
  function ps(st) { var m = PS.get(st); if (!m) { m = { from: null, last: null, dir: null }; PS.set(st, m); } return m; }
  function hide(o, k, v) { try { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); } catch (e) { } }
  function picOf(st, p) {
    var m = ps(st), from = m.from || (PG.picture ? PG.picture() : null), res = null;
    if (m.last) { res = D.resolve(st, m.last.p, m.last.o, m.last.ev, p, m.last.from); D.frameAt(res, res.duration); from = res.end; m.last = null; }
    var seg = D.segment(st, p, from);
    if (root.KMWhyStage) root.KMWhyStage.apply(st, p, seg);   /* as between() does */
    if (root.KMR3Stage) root.KMR3Stage.apply(st, p, seg);
    var f = D.frameAt(seg, seg.duration);   /* the last frame the page draws of it: where the world starts */
    m.dir = { p: p, seg: seg, res: res };
    return { pos: f.pos, ball: f.ball, holder: f.holder || null };
  }
  function endOf(rec) { return SIMP.segment(rec, rec.seg.play.j1 > rec.seg.play.j0 ? 'play' : 'result').end; }   /* what play.html sets run.pitch to */
  X.next = function (st) {
    var p = next0.apply(X, arguments);
    if (p && !broken.get(st) && SIMP.SW.first === 'world') {
      var m = ps(st), t0 = Date.now();
      try {
        var dv = SIMP.drive(st, p, { next0: function (s2) { return next0.call(X, s2); }, picOf: picOf,
          onLead: function (rec, p2) {
            if (m.dir && m.dir.p === p2 && rec.from === 'engine') { hide(rec, 'dirSeg', m.dir.seg); hide(rec, 'dirRes', m.dir.res); }
            m.dir = null; hide(rec, 'mo', p2);
            m.from = rec.ended ? endOf(rec) : null; m.last = null;
            PG.leads++; if (rec.ended) PG.leadsNone++; PG.leadsFrom[rec.from] = (PG.leadsFrom[rec.from] || 0) + 1;
            var F = rec.frames, s0 = F[rec.seg.play.j0], s1 = F[rec.seg.play.j1];
            PG.leadRecs.push({ index: p2.index, minute: p2.minute, sit: rec.sit, from: rec.from, stop: rec.stop ? (rec.stop.kinds || rec.stop.kind || true) : null, ended: !!rec.ended, endedBy: rec.endedBy || null,
              endLine: rec.endLine || null, secs: rec.secs, dir: rec.dirSeg ? rec.dirSeg.duration : null, b0: { x: s0.ball.x, y: s0.ball.y }, b1: { x: s1.ball.x, y: s1.ball.y } });
            if (PG.leadRecs.length > 80) PG.leadRecs.shift();
          } });
        p = dv.p;
        if (p && dv.leads.length) hide(p, 'simLeads', dv.leads);
        PG.tail = !p && dv.leads.length ? { st: st, leads: dv.leads } : null;   /* moments the world played to full time with no chance: play.html draws them before the final whistle */
      } catch (e) { broken.set(st, true); SIMP.drop(st); PG.errs.push('drive: ' + (e && e.message)); try { console.log('sim drive: ' + (e && e.stack)); } catch (e2) { } }
      m.from = null; m.last = null; m.dir = null;
      PG.nextMs.push(Date.now() - t0); if (PG.nextMs.length > 200) PG.nextMs.shift();
    }
    if (p && !broken.get(st) && SIMP.pending(st, p)) {
      try { var r = SIMP.menu(st, p); PG.menus.push({ index: p.index, rule: r && r.rule, pm: r && r.pm }); if (PG.menus.length > 60) PG.menus.shift(); }
      catch (e) { broken.set(st, true); SIMP.drop(st); PG.errs.push('menu: ' + (e && e.message)); }
    }
    return p;
  };
  X.choose = function (st, i) {
    var p = st.pending, live = p && p.moment ? p.moment.options.filter(function (o) { return !o.disabled; }) : [], o = live[i];
    var simOn = !!(p && o && !broken.get(st)), pre = st.score ? { you: st.score.you, them: st.score.them } : null;
    var pic0 = PG.picture ? PG.picture() : null;
    if (simOn) { try { var pic = pic0; if (!SIMP.begin(st, p, pic)) simOn = false; } catch (e) { simOn = false; PG.errs.push('begin: ' + (e && e.message)); } }
    var ev = choose0.apply(X, arguments);
    if (simOn && ev) {
      try { var rec = SIMP.after(st, p, o, ev, pre); var m4 = ps(st); m4.last = rec ? null : { p: p, o: o, ev: ev, from: pic0 }; m4.from = rec && rec.ended ? endOf(rec) : null; if (rec) { PG.recs.push({ index: p.index, card: o.id, rule: rec.rule || null, ended: rec.ended, endedBy: rec.endedBy, stop: rec.stop ? rec.stop.kind : null, fix: rec.fix, text: rec.text, endLine: rec.endLine || null, steps: rec.plan.steps.map(function (s) { return s.do; }) }); if (PG.recs.length > 60) PG.recs.shift(); } }
      catch (e) { broken.set(st, true); SIMP.drop(st); PG.errs.push('after: ' + (e && e.message)); try { console.log('sim after: ' + (e && e.stack)); } catch (e2) { } }
    }
    else if (ev && p && o && !broken.get(st)) { var m5 = ps(st); m5.from = null; m5.last = { p: p, o: o, ev: ev, from: pic0 }; }   /* b4: the world did not play this card */
    return ev;
  };
  root.__sim = PG;
})(typeof window !== 'undefined' ? window : globalThis);
