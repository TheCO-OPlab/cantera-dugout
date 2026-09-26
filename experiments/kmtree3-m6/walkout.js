/* intro1: THE PRE-MATCH WALK-OUT. About nine seconds between "Kick off" on
 * the title screen and the first five-second play, like the opening of a
 * match on television, drawn on the board:
 *
 *   0.0 s  the two teams walk out of the tunnel (the left touchline at the
 *          halfway line) in two lines and stand side by side on the halfway
 *          line; the crowd rises
 *   0.8 s  the line-up cards: each team's formation on a small pitch, every
 *          name and role code, your three key players ringed with one plain
 *          line each ("Yamal: your best dribbler (Technique 19)")
 *   3.4 s  everyone goes to his kick-off spot; the two captains go to the
 *          centre spot; a short whistle calls them
 *   5.0 s  the coin toss: the coin lands on the side that kicks off, which is
 *          the side the director already has kicking off (read, not decided)
 *   7.4 s  the captains go to their spots; the man taking the kick-off steps
 *          onto the ball
 *   8.9 s  hand-off: the first play starts from exactly this picture
 *
 * SHOW ONLY. Nothing here draws from the match RNG, Math.random or the
 * director: the timeline is fixed arithmetic on the roster and the kick-off
 * positions the page already has (introcheck.js proves it). Any key, any
 * click or the Skip button jumps to the last picture and hands off at once.
 *
 * Reusable parts (node and page):
 *   KMWalkout.plan(ctx) -> plan       ctx: { roster:[{id,team,keeper,p}], target:{pos,ball,holder,team},
 *                                         captains:{you:id,them:id}, reduced }
 *   KMWalkout.frameAt(plan, t)        { pos, ball, holder } at t seconds (1x)
 *   KMWalkout.captainOf(squad)        the man with the armband (see the note there)
 *   KMWalkout.keyPlayers(squad, 'you') the three highlighted men, with their line
 *   KMWalkout.run(plan, host)         the controller: plays the plan through host.draw,
 *                                     host.now/host.later (injectable clock), skip()
 *   KMWalkout.wanted(), markSeen(), pref(), setPref()   the once-a-session rule
 *   KMWalkout.BREAK.name              faults for introcheck.js --break
 * Plain English on screen, no em dashes, stats in parentheses. */
(function (root) {
  'use strict';
  var BREAK = { name: null };

  /* ------------------------------------------------------------ timeline */
  var T = {
    walk0: 0, walk1: 2.9,        /* out of the tunnel into two lines */
    cards: 0.8,                  /* the line-up cards come in */
    spread0: 3.4, spread1: 4.9,  /* to the kick-off spots, captains to the centre */
    call: 4.7,                   /* the short whistle that calls the captains */
    coin0: 5.0, flip0: 5.3, land: 6.5, coin1: 7.5,
    back0: 7.4, back1: 8.3,      /* captains to their spots, the taker onto the ball */
    ring: 8.3,                   /* the man on the ball is ringed: the first play's picture */
    out: 8.4,                    /* the cards go */
    end: 8.9
  };
  var TUNNEL = { x: -2.2, y: 52.5 };
  var LINE_Y = { you: 49.3, them: 55.7 };
  var MEET = { you: { x: 31.3, y: 52.5 }, them: { x: 36.7, y: 52.5 } };
  var WALK_SPEED = 23;           /* metres a second on the board (the board plays in fast forward) */
  var STAGGER = 0.13;            /* seconds between two men leaving the tunnel */
  var HOLD_BACK = 6;             /* the kick-off taker waits this far behind the ball during the toss */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function lerp(a, b, u) { return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }

  /* THE CAPTAIN. The squads carry no armband, so the prototype gives it to
   * the outfield man with the highest Intelligence (ties: the first in the
   * squad's order). For the final that is Messi (Intelligence 20), who is
   * Argentina's captain, and Rodri (19) for Spain, which is a guess. */
  function captainOf(sq) {
    var best = null;
    (sq && sq.players || []).forEach(function (p) {
      var v = p && p.attr ? +p.attr.intelligence || 0 : 0;
      if (!best || v > best.v) best = { p: p, v: v };
    });
    return best ? best.p : null;
  }

  /* YOUR THREE KEY PLAYERS: the best man at three different things, three
   * different men, outfield only. A Dribbler (the keyword) who leads
   * Technique is "your best dribbler"; the stat is always the one that put
   * him there, in parentheses. */
  var KEYS = [
    { a: 'technique', name: 'Technique', text: function (p) { return (p.kw || []).indexOf('DRIBBLER') >= 0 ? 'best dribbler' : 'most skilful player on the ball'; } },
    { a: 'finishing', name: 'Finishing', text: function () { return 'best finisher'; } },
    { a: 'passing', name: 'Passing', text: function () { return 'best passer'; } },
    { a: 'pace', name: 'Pace', text: function () { return 'fastest player'; } },
    { a: 'defending', name: 'Defending', text: function () { return 'best defender'; } }
  ];
  function keyPlayers(sq, side) {
    var out = [], used = {};
    var list = (sq && sq.players || []).filter(function (p) { return p && p.attr; });
    for (var k = 0; k < KEYS.length && out.length < 3; k++) {
      var K = KEYS[k], best = null;
      list.forEach(function (p) {
        if (used[p.id || p.name]) return;
        var v = +p.attr[K.a] || 0;
        if (!best || v > best.v) best = { p: p, v: v };
      });
      if (!best) continue;
      used[best.p.id || best.p.name] = 1;
      var who = side === 'them' ? 'their ' : 'your ';
      out.push({ p: best.p, id: best.p.id, attr: K.a, value: best.v,
        line: first(best.p) + ': ' + who + K.text(best.p) + ' (' + K.name + ' ' + (BREAK.name === 'keys' ? best.v + 1 : best.v) + ')' });   // (--break keys: a number that is not his)
    }
    return out;
  }

  /* ------------------------------------------------------------ the plan */
  function plan(ctx) {
    if (BREAK.name === 'rng' && ctx.st && ctx.st.rng) ctx.st.rng.next();   // a fault: the intro rolls the match's dice
    var ros = ctx.roster || [], tg = ctx.target || {}, caps = ctx.captains || {};
    var scale = BREAK.name === 'long' ? 1.45 : 1;
    var tm = {}; for (var k in T) tm[k] = T[k] * scale;
    var men = {}, order = { you: [], them: [] };
    ros.forEach(function (r) { if (order[r.team]) order[r.team].push(r); });
    /* the line: the captain leads out (and so stands furthest along), then
     * the rest in the order of where they will stand across the pitch, right
     * to left, so that breaking to the kick-off spots nobody crosses anybody */
    function finX(r) { return tg.pos && tg.pos[r.id] ? tg.pos[r.id].x : 34; }
    ['you', 'them'].forEach(function (side) {
      var L = order[side].slice().sort(function (a, b) {
        var ca = a.id === caps[side] ? 0 : 1, cb = b.id === caps[side] ? 0 : 1;
        return ca - cb || finX(b) - finX(a) || (+a.num || 0) - (+b.num || 0) || String(a.id).localeCompare(String(b.id));
      });
      var n = L.length, gap = n > 1 ? Math.min(5.3, 54 / (n - 1)) : 0;
      L.forEach(function (r, i) {
        var spot = { x: 8 + gap * (n - 1) - gap * i, y: LINE_Y[side] };
        var leave = tm.walk0 + i * STAGGER * scale;
        var arrive = Math.min(tm.walk1, leave + dist(TUNNEL, spot) / WALK_SPEED * scale);
        var fin = tg.pos && tg.pos[r.id] ? { x: tg.pos[r.id].x, y: tg.pos[r.id].y } : spot;
        if (BREAK.name === 'pos' && r.team === 'them' && i === 3) fin = { x: fin.x + 0.8, y: fin.y };   // a fault: one man ends off his spot
        var isCap = r.id === caps[side], isTaker = r.id === tg.holder;
        var mid = isCap ? MEET[side] : isTaker ? { x: fin.x, y: fin.y + (side === 'you' ? -HOLD_BACK : HOLD_BACK) } : fin;
        men[r.id] = { id: r.id, team: side, spot: spot, leave: leave, arrive: arrive, mid: mid, fin: fin, cap: isCap, taker: isTaker };
      });
    });
    var toss = tg.team || 'you';
    if (BREAK.name === 'coin') toss = toss === 'you' ? 'them' : 'you';   // a fault: the coin picks its own side
    return {
      T: tm, dur: tm.end, men: men, ids: ros.map(function (r) { return r.id; }),
      ball: tg.ball ? { x: tg.ball.x, y: tg.ball.y } : { x: 34, y: 52.5 }, holder: tg.holder || null,
      toss: toss, captains: { you: caps.you || null, them: caps.them || null }, reduced: !!ctx.reduced
    };
  }

  function posAt(m, t, T) {
    if (t <= m.leave) return { x: TUNNEL.x, y: TUNNEL.y };
    if (t < m.arrive) {
      /* out of the tunnel onto the line, then along it */
      return lerp(TUNNEL, m.spot, easeOut((t - m.leave) / Math.max(1e-6, m.arrive - m.leave)));
    }
    if (t < T.spread0) return { x: m.spot.x, y: m.spot.y };
    if (t < T.spread1) return lerp(m.spot, m.mid, smooth((t - T.spread0) / (T.spread1 - T.spread0)));
    if (t < T.back0 || m.mid === m.fin) return { x: m.mid.x, y: m.mid.y };
    if (t < T.back1) return lerp(m.mid, m.fin, smooth((t - T.back0) / (T.back1 - T.back0)));
    return { x: m.fin.x, y: m.fin.y };
  }
  /* the picture at t seconds (1x). Reduced motion: always the last picture. */
  function frameAt(pl, t) {
    var T = pl.T, pos = {};
    if (pl.reduced) t = pl.dur;
    for (var i = 0; i < pl.ids.length; i++) {
      var m = pl.men[pl.ids[i]];
      if (m) pos[m.id] = t >= pl.dur ? { x: m.fin.x, y: m.fin.y } : posAt(m, t, T);
    }
    return { pos: pos, ball: { x: pl.ball.x, y: pl.ball.y, z: 0 }, holder: t >= T.ring ? pl.holder : null, intro: true };
  }
  /* the coin, from the clock (not a CSS transition, so a still picture is
   * exactly the moment it claims): up and over five and a half turns or five,
   * landing face up on the side that kicks off (front = you, back = them) */
  function coinAngle(pl, t) {
    var T = pl.T, full = 1800 + (pl.toss === 'them' ? 180 : 0);
    if (t <= T.flip0) return 0;
    if (t >= T.land) return full;
    return full * easeOut((t - T.flip0) / (T.land - T.flip0));
  }
  function coinPose(pl, t) {
    var T = pl.T, u = clamp((t - T.flip0) / (T.land - T.flip0), 0, 1), h = Math.sin(Math.PI * u) * 46;
    return 'translateY(' + (-h).toFixed(1) + 'px) rotateX(' + coinAngle(pl, t).toFixed(1) + 'deg)';
  }
  /* which face is up at t: 'you' (front) or 'them' (back) */
  function coinFace(pl, t) { var a = ((coinAngle(pl, t) % 360) + 360) % 360; return a > 90 && a < 270 ? 'them' : 'you'; }
  function phaseAt(pl, t) {
    var T = pl.T;
    return t < T.walk1 ? 'walk' : t < T.spread0 ? 'lined' : t < T.coin0 ? 'spread' : t < T.coin1 ? 'coin' : t < T.end ? 'kickoff' : 'done';
  }

  /* ------------------------------------------------------------ once a session */
  var PREF_KEY = 'cantera-walkout', SEEN_KEY = 'cantera-walkout-seen';
  function urlSays() {
    try { var m = /[?&]walkout=(0|1)\b/.exec((root.location && root.location.search) || ''); return m ? m[1] === '1' : null; } catch (e) { return null; }
  }
  function pref() { try { var v = root.localStorage.getItem(PREF_KEY); return v === 'on' || v === 'off' ? v : null; } catch (e) { return null; } }
  function setPref(v) { try { root.localStorage.setItem(PREF_KEY, v ? 'on' : 'off'); } catch (e) { } }
  function seen() { try { return root.sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { root.sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { } }
  /* on for the first match of a session, off after, unless the Settings
   * switch (or ?walkout=0/1) says otherwise */
  function wanted() {
    var u = urlSays(); if (u !== null) return u;
    var p = pref(); if (p) return p === 'on';
    if (BREAK.name === 'once') return true;   // a fault: every match
    return !seen();
  }

  /* ------------------------------------------------------------ markup */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* the formation on a small pitch standing up (the team attacks up the
   * card): a line of men per row, spread evenly, name and role code under
   * each; the captain wears a C; key men are ringed and numbered */
  var ROW_Y = [53.5, 34, 14.5];   /* defence, midfield, attack */
  function miniPitchSVG(sq, side, keys, capId, nums) {
    var rows = [[], [], []];
    (sq.players || []).forEach(function (p) { if (typeof p.line === 'number' && rows[p.line]) rows[p.line].push(p); });
    var kIdx = {}; (keys || []).forEach(function (k, i) { kIdx[k.id] = i + 1; });
    var s = '<svg class="wo-mp" viewBox="-2 -2 72 90" role="img" aria-label="' + esc(sq.club + ' line-up') + '">' +
      '<rect class="wo-turf" x="-2" y="-2" width="72" height="90" rx="3"/>' +
      '<g class="wo-chalk"><rect x="0" y="0" width="68" height="86"/><path d="M0 5 H68"/><path d="M24.85 5 A9.15 9.15 0 0 0 43.15 5"/>' +
      '<rect x="13.85" y="69.5" width="40.3" height="16.5"/></g>';
    function man(p, x, y, gk) {
      var k = kIdx[p.id], cap = p.id === capId;
      var code = p.pos || (gk ? 'GK' : '');
      s += '<g class="wo-man' + (k ? ' key' : '') + '" transform="translate(' + x.toFixed(2) + ',' + y.toFixed(2) + ')">' +
        (k ? '<circle class="wo-kr" r="4.1"/>' : '') +
        '<circle class="wo-d ' + side + (gk ? ' gk' : '') + '" r="2.9"/>' +
        '<text class="wo-n' + (gk ? ' gk' : '') + '" y="1.05">' + esc(p.number != null ? p.number : nums && nums[p.id] != null ? nums[p.id] : '') + '</text>' +
        (cap ? '<g class="wo-cap"><circle cx="2.7" cy="-2.6" r="1.55"/><text x="2.7" y="-2.05">C</text></g>' : '') +
        (k ? '<g class="wo-kb"><circle cx="-3" cy="-2.7" r="1.7"/><text x="-3" y="-2.08">' + k + '</text></g>' : '') +
        '<text class="wo-nm" y="6.1">' + esc(first(p)) + '</text>' +
        '<text class="wo-rc" y="8.9">' + esc(code) + '</text></g>';
    }
    rows.forEach(function (row, li) {
      row.sort(function (a, b) { return a.slot - b.slot; });
      var n = row.length;
      row.forEach(function (p, i) { man(p, 68 * (i + 0.5) / n, ROW_Y[li], false); });
    });
    if (sq.keeper) man(sq.keeper, 34, 74.5, true);
    return s + '</svg>';
  }
  /* m7: THE PHONE'S LINE-UP. In the phone's sheet the small pitch drew the
   * names at about 8 to 10 px; there the card shows the same formation as
   * rows of names instead (attack at the top, the keeper at the bottom),
   * names at 13 px and role codes at 11 px. On a PC the small pitch stays. */
  function listHTML(sq, keys, capId) {
    var rows = [[], [], []];
    (sq.players || []).forEach(function (p) { if (typeof p.line === 'number' && rows[p.line]) rows[p.line].push(p); });
    var kIdx = {}; (keys || []).forEach(function (k, i) { kIdx[k.id] = i + 1; });
    function cell(p, gk) {
      var k = kIdx[p.id], cap = p.id === capId;
      return '<span class="wo-lc' + (k ? ' key' : '') + '">' +
        '<b class="wo-lnm">' + (k ? '<span class="wo-lk">' + k + '</span>' : '') + esc(first(p)) + (cap ? ' <span class="wo-lcap">C</span>' : '') + '</b>' +
        '<span class="wo-lrc">' + esc(p.pos || (gk ? 'GK' : '')) + '</span></span>';
    }
    var h = '<div class="wo-list">';
    [2, 1, 0].forEach(function (li) {
      var row = rows[li].slice().sort(function (a, b) { return a.slot - b.slot; });
      if (row.length) h += '<div class="wo-lrow">' + row.map(function (p) { return cell(p, false); }).join('') + '</div>';
    });
    if (sq.keeper) h += '<div class="wo-lrow">' + cell(sq.keeper, true) + '</div>';
    return h + '</div>';
  }
  function flagHTML(team) { return team ? '<span class="flag ' + esc(team) + '" aria-hidden="true"></span>' : '<span class="wo-kitdot" aria-hidden="true"></span>'; }
  function cardHTML(o) {
    /* o: { side, sq, keys, capId, you (bool) } */
    var sq = o.sq, keys = o.keys || [];
    var h = '<div class="wo-card ' + o.side + (BREAK.name === 'phonesmall' ? ' wo-nolist' : '') + '" data-side="' + o.side + '">' +
      '<div class="wo-head">' + flagHTML(sq.team) + '<b>' + esc(sq.club) + '</b>' +
        '<span class="wo-who">' + (o.side === 'you' ? 'You' : 'Them') + '</span>' +
        '<span class="wo-form">' + esc(sq.formation || '') + '</span></div>' +
      miniPitchSVG(sq, o.side, keys, o.capId, o.nums) +
      (BREAK.name === 'phonesmall' ? '' : listHTML(sq, keys, o.capId));   // m7 (--break phonesmall: the phone keeps the small pitch)
    if (keys.length) {
      h += '<ol class="wo-keys">' + keys.map(function (k, i) {
        return '<li><span class="wo-kn">' + (i + 1) + '</span>' + esc(k.line) + '</li>';
      }).join('') + '</ol>';
    }
    var cap = null; (sq.players || []).forEach(function (p) { if (p.id === o.capId) cap = p; });
    if (cap) h += '<p class="wo-capline"><span class="wo-cbadge">C</span>Captain: ' + esc(first(cap)) + '</p>';
    return h + '</div>';
  }

  var CSS = [
    '.wo-card{--wo-bg:#0f1a2b;--wo-ink:#f3f6fb;--wo-ink2:#b9c4d6;--wo-gold:#f2c14e;background:var(--wo-bg);color:var(--wo-ink);border-radius:14px;padding:12px 14px 12px;',
    '  box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);position:relative;overflow:hidden;opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1)}',
    '.wo-card::before{content:"";position:absolute;left:0;top:0;right:0;height:5px;background:var(--kit-you,#c8102e)}',
    '.wo-card.them::before{background:var(--kit-them,#6cace4)}',
    '.wo-card.on{opacity:1;transform:none}',
    '.wo-card.gone{opacity:0;transform:translateY(-8px);transition:opacity .3s ease,transform .3s ease}',
    '.wo-head{display:flex;align-items:center;gap:8px;margin:2px 0 6px;font:800 19px/1.2 ui-sans-serif,system-ui,"Segoe UI",sans-serif;letter-spacing:.01em}',
    '.wo-head .flag{width:27px;height:18px;border-radius:2px;flex:none}',
    '.wo-kitdot{width:16px;height:16px;border-radius:50%;background:var(--kit-you,#1f5fbf);flex:none}',
    '.wo-card.them .wo-kitdot{background:var(--kit-them,#f0a030)}',
    '.wo-who{font:700 10px ui-sans-serif,system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--wo-bg);background:var(--wo-ink);border-radius:99px;padding:2px 8px}',
    '.wo-form{margin-left:auto;font:700 14px ui-monospace,monospace;color:var(--wo-gold)}',
    '.wo-mp{display:block;width:100%;height:auto;max-height:46vh}',
    '.wo-turf{fill:#1d5a33}.wo-chalk rect,.wo-chalk path{fill:none;stroke:rgba(255,255,255,.55);stroke-width:.45}',
    '.wo-d{stroke:#0b1220;stroke-width:.5}.wo-d.you{fill:var(--kit-you,#c8102e)}.wo-d.them{fill:var(--kit-them,#6cace4)}.wo-d.gk{fill:#d9dcd6}',
    '.wo-card.them .wo-d.gk,body.you-argentina .wo-card.you .wo-d.gk{fill:#e9b308}body.them-spain .wo-card.them .wo-d.gk{fill:#d9dcd6}',
    '.wo-n{font:800 2.9px ui-sans-serif,system-ui;text-anchor:middle;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:.5}',
    '.wo-card.them .wo-n{fill:#0b1f3a;stroke:none}.wo-d.gk + .wo-n{fill:#1a1a1a;stroke:none}',
    'body.you-spain .wo-card.you .wo-n,body.them-spain .wo-card.them .wo-n{fill:#ffd23f;stroke:rgba(0,0,0,.45)}',
    'body.you-argentina .wo-card.you .wo-n{fill:#0b1f3a;stroke:none}',
    '.wo-n.gk{fill:#1a1a1a!important;stroke:none!important}',
    '.wo-nm{font:700 3.05px ui-sans-serif,system-ui,"Segoe UI",sans-serif;text-anchor:middle;fill:#fff;paint-order:stroke;stroke:#10321d;stroke-width:.9px;stroke-linejoin:round}',
    '.wo-rc{font:700 2.3px ui-monospace,monospace;text-anchor:middle;fill:#cfe3d4;letter-spacing:.12px}',
    '.wo-kr{fill:none;stroke:var(--wo-gold);stroke-width:.8}',
    '.wo-kb circle{fill:var(--wo-gold)}.wo-kb text{font:800 2.3px ui-sans-serif,system-ui;text-anchor:middle;fill:#1a1300}',
    '.wo-cap circle{fill:#fff;stroke:#0b1220;stroke-width:.3}.wo-cap text{font:900 2px ui-sans-serif,system-ui;text-anchor:middle;fill:#0b1220}',
    '.wo-keys{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:5px}',
    '.wo-keys li{display:flex;gap:8px;align-items:flex-start;font:600 14px/1.3 ui-sans-serif,system-ui,"Segoe UI",sans-serif;color:var(--wo-ink)}',
    '.wo-kn{flex:none;width:19px;height:19px;border-radius:50%;background:var(--wo-gold);color:#1a1300;font:800 12px/19px ui-sans-serif,system-ui;text-align:center}',
    '.wo-capline{margin:7px 0 0;font:600 13px ui-sans-serif,system-ui;color:var(--wo-ink2);display:flex;align-items:center;gap:7px}',
    '.wo-cbadge{width:17px;height:17px;border-radius:50%;background:#fff;color:#0b1220;font:900 10px/17px ui-sans-serif,system-ui;text-align:center}',
    /* the overlay on the pitch: the tunnel, the caption strip, the coin, Skip */
    '.wo-layer{position:absolute;inset:0;pointer-events:none;z-index:30}',
    '.wo-tunnel{position:absolute;width:26px;height:44px;margin:-22px 0 0 -20px;border-radius:6px 12px 12px 6px;background:linear-gradient(90deg,#05080d,#1b2230);box-shadow:0 0 0 2px rgba(255,255,255,.18),0 4px 12px rgba(0,0,0,.5);transition:opacity .6s ease}',
    '.wo-strip{position:absolute;left:50%;top:14px;transform:translate(-50%,-6px);opacity:0;white-space:nowrap;background:#0f1a2b;color:#f3f6fb;border-left:4px solid #f2c14e;',
    '  border-radius:4px;padding:6px 14px 7px 12px;font:700 15px/1.2 ui-sans-serif,system-ui,"Segoe UI",sans-serif;letter-spacing:.01em;box-shadow:0 6px 18px rgba(0,0,0,.4);transition:opacity .3s ease,transform .3s ease}',
    '.wo-strip small{display:block;font:700 10px ui-sans-serif,system-ui;letter-spacing:.12em;text-transform:uppercase;color:#f2c14e;margin-bottom:2px}',
    '.wo-strip.on{opacity:1;transform:translate(-50%,0)}',
    '.wo-coinbox{position:absolute;width:0;height:0;perspective:420px;opacity:0}',
    '.wo-coinbox.on{opacity:1}',
    '.wo-coin{position:absolute;left:-28px;top:-70px;width:56px;height:56px;transform-style:preserve-3d}',
    '.wo-face{position:absolute;inset:0;border-radius:50%;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;',
    '  background:radial-gradient(circle at 35% 30%,#fff3c4,#e1b34a 55%,#a57818);box-shadow:inset 0 0 0 3px #8a6212,0 6px 14px rgba(0,0,0,.45)}',
    '.wo-face.back{transform:rotateX(180deg)}',
    '.wo-face .flag{width:34px;height:23px;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.35)}',
    '.wo-face .wo-kitdot{width:34px;height:34px;display:flex;align-items:center;justify-content:center;font:900 18px ui-sans-serif,system-ui;color:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.35)}',
    '.wo-coincap{position:absolute;left:0;top:-108px;transform:translate(-50%,0);white-space:nowrap;background:#0f1a2b;color:#f3f6fb;border-radius:6px;',
    '  padding:5px 11px;font:700 14px/1.2 ui-sans-serif,system-ui,"Segoe UI",sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.4);opacity:0}',
    '.wo-coincap.on{opacity:1}',
    '.wo-skip{position:absolute;right:12px;bottom:12px;pointer-events:auto;background:rgba(15,26,43,.92);color:#f3f6fb;border:1px solid rgba(255,255,255,.35);',
    '  border-radius:99px;padding:6px 16px;font:700 14px ui-sans-serif,system-ui,"Segoe UI",sans-serif;cursor:pointer}',
    '.wo-skip:hover,.wo-skip:focus-visible{background:#f2c14e;color:#1a1300;outline:none}',
    '.wo-skip small{font-weight:600;opacity:.75;margin-left:6px}',
    /* where the cards go: the two side columns on a PC, a sheet on a phone */
    '.wo-col{margin:6px 0 0}',
    '.wo-sheet{position:fixed;left:8px;right:8px;bottom:8px;z-index:60;pointer-events:none}',
    '.wo-sheet .wo-card{max-width:520px;margin:0 auto;padding:10px 12px}',
    '.wo-sheet .wo-mp{max-height:36vh}',
    /* m7: the phone's line-up as rows of names (listHTML) */
    '.wo-list{display:none}',
    '.wo-sheet .wo-card:not(.wo-nolist) .wo-mp{display:none}',
    '.wo-sheet .wo-list{display:grid;gap:3px;margin:4px 0 0;padding:6px 4px;border-radius:8px;background:#1d5a33}',
    '.wo-lrow{display:flex;justify-content:space-around;gap:2px}',
    '.wo-lc{position:relative;display:flex;flex-direction:column;align-items:center;min-width:0;flex:1 1 0;padding:1px 0}',
    '.wo-lnm{font:700 13px/1.2 ui-sans-serif,system-ui,"Segoe UI",sans-serif;color:#fff;white-space:nowrap}',
    '.wo-lrc{font:700 11px/1.1 ui-monospace,monospace;color:#cfe3d4}',
    '.wo-lc.key .wo-lnm{color:var(--wo-gold)}',
    '.wo-lk{display:inline-block;margin-right:4px;vertical-align:1px;width:15px;height:15px;border-radius:50%;background:var(--wo-gold);color:#1a1300;font:800 11px/15px ui-sans-serif,system-ui;text-align:center}',
    '.wo-lcap{display:inline-block;width:14px;height:14px;border-radius:50%;background:#fff;color:#0b1220;font:900 10px/14px ui-sans-serif,system-ui;text-align:center;vertical-align:1px}',
    '.wo-sheet .wo-skip{position:absolute;right:6px;top:-44px;bottom:auto}',
    '.wo-sheet .wo-keys li{font-size:13px}',
    '.wo-sheet .wo-card.hidden{display:none}',
    '.wo-still .wo-card{transition:none}',
    '@media (prefers-reduced-motion:reduce){.wo-card,.wo-strip,.wo-coin,.wo-coinbox,.wo-tunnel{transition:none!important}}'
  ].join('\n');
  function injectCSS(doc) {
    if (!doc || doc.getElementById('wo-css')) return;
    var st = doc.createElement('style'); st.id = 'wo-css'; st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------ the controller
   * host: {
   *   draw(frame)            draws one picture on the page's pitch
   *   now()                  ms (performance.now by default)
   *   later(fn, ms)          one tick (requestAnimationFrame with a timer behind it by default)
   *   speed()                the page's play speed (1 or 2)
   *   done(info)             called once, when the first play may start
   *   doc, box (the pitch's box element), px(x, y) -> {x, y} in the box,
   *   cols: { you: el, them: el } or sheet: el (a phone), cards: { you: html, them: html }
   *   strip: { kicker, title }, coin: { you: html, them: html, names: { you, them } }
   *   sound: { swell(amt, len), tension(v), cue(name) }   (all optional)
   * } */
  function run(pl, host) {
    host = host || {};
    var doc = host.doc || null, win = doc ? (host.win || root) : null, born = null, t = 0, last = null, over = false, fired = {}, els = {}, drawn = 0;
    var nowF = host.now || function () { try { return root.performance.now(); } catch (e) { return Date.now(); } };
    var later = host.later || function (fn) {
      var r = 0, to = 0;
      var go = function () { try { root.cancelAnimationFrame(r); } catch (e) { } clearTimeout(to); fn(); };
      try { r = root.requestAnimationFrame(go); } catch (e) { }
      to = setTimeout(go, 50);
    };
    var snd = host.sound || {};
    function S(k) { try { if (snd[k]) snd[k].apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { } }
    var T2 = pl.T;
    var stillCard = !!pl.reduced;

    /* ---- the overlay */
    function mk(tag, cls, html, parent) {
      var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html;
      if (parent) parent.appendChild(e); return e;
    }
    if (doc) {
      injectCSS(doc);
      if (host.box) {
        els.layer = mk('div', 'wo-layer' + (stillCard ? ' wo-still' : ''), null, host.box);
        els.layer.id = 'wolayer';
        /* the tunnel and the coin sit on the board itself (host.world moves with a phone's crop) */
        els.wlayer = host.world ? mk('div', 'wo-layer', null, host.world) : els.layer;
        if (!stillCard && host.px) {
          var tp = host.px(0, TUNNEL.y);
          els.tunnel = mk('div', 'wo-tunnel', null, els.wlayer);
          els.tunnel.style.left = tp.x + 'px'; els.tunnel.style.top = tp.y + 'px';
        }
        els.strip = mk('div', 'wo-strip', '<small>' + esc(host.strip && host.strip.kicker || '') + '</small><span id="wostrip">' + esc(host.strip && host.strip.title || '') + '</span>', els.layer);
        if (host.px && host.coin) {
          var cp = host.px(pl.ball.x, pl.ball.y);
          els.coinbox = mk('div', 'wo-coinbox', '<div class="wo-coincap" id="wocoincap"></div><div class="wo-coin" id="wocoin">' +
            '<div class="wo-face front">' + (host.coin.you || '') + '</div><div class="wo-face back">' + (host.coin.them || '') + '</div></div>', els.wlayer);
          els.coinbox.style.left = cp.x + 'px'; els.coinbox.style.top = cp.y + 'px';
        }
        els.skip = mk('button', 'wo-skip', 'Skip<small>any key</small>', els.layer);   /* (moved onto the sheet on a phone, below) */
        els.skip.id = 'woskip'; els.skip.type = 'button';
        els.skip.setAttribute('aria-label', 'Skip the walk-out and start the match');
      }
      els.cards = [];
      if (host.sheet) {
        els.sheetEl = mk('div', 'wo-sheet' + (stillCard ? ' wo-still' : ''), null, host.sheet);
        els.sheetEl.id = 'wosheet';
        ['you', 'them'].forEach(function (s) { if (host.cards && host.cards[s]) { var w = mk('div', null, host.cards[s], els.sheetEl); els.cards.push(w); } });
        if (els.skip) { els.skip.innerHTML = 'Skip'; els.sheetEl.appendChild(els.skip); }   /* a phone: Skip sits on the sheet, over the pitch */
      } else if (host.cols) {
        ['you', 'them'].forEach(function (s) {
          if (host.cols[s] && host.cards && host.cards[s]) { var w = mk('div', 'wo-col', host.cards[s], host.cols[s]); w.id = 'wocol-' + s; els.cards.push(w); }
        });
      }
      els.cardEls = els.cards.map(function (w) { return w.querySelector('.wo-card'); });
      /* a phone shows one card at a time: theirs waits hidden from the start */
      if (host.sheet && els.cardEls[1] && els.cardEls[1].classList) els.cardEls[1].classList.add('hidden');
    }
    function cardOn(i, on) { var c = els.cardEls && els.cardEls[i]; if (c && c.classList) c.classList.toggle('on', !!on); }
    function cardHidden(i, on) { var c = els.cardEls && els.cardEls[i]; if (c && c.classList) c.classList.toggle('hidden', !!on); }
    function strip(text, on) {
      if (!els.strip) return;
      if (text != null) { var s = doc.getElementById('wostrip'); if (s) s.textContent = text; }
      els.strip.classList.toggle('on', on !== false);
    }

    /* the moments on the timeline, each fired once (a skip fires none) */
    var CUES = [
      [0.0, function () {
        strip(null, true); S('tension', 0.45); S('swell', 0.9, 3.4);
        if (host.onStart) host.onStart();
      }],
      [T2.cards, function () {
        if (host.sheet) { cardOn(0, true); cardHidden(1, true); }
        else { cardOn(0, true); setTimeout(function () { if (!over) cardOn(1, true); }, 160); }
      }],
      [T2.walk1 - 0.4, function () { S('tension', 0.7); S('swell', 0.6, 2.5); if (els.tunnel) els.tunnel.style.opacity = '0.35'; }],
      [T2.spread0, function () { strip(host.strip && host.strip.spread || '', true); }],
      [T2.call, function () { S('cue', 'peep'); }],
      [T2.coin0, function () {
        if (host.sheet) { cardOn(0, false); cardHidden(0, true); cardHidden(1, false); setTimeout(function () { if (!over) cardOn(1, true); }, 30); }
        if (els.coinbox) els.coinbox.classList.add('on');
        strip(host.strip && host.strip.coin || '', true);
      }],
      [T2.flip0, function () {
        /* 5 whole turns and a half if it must land on the back ("them") */
        S('cue', 'coin');
      }],
      [T2.land, function () {
        var cc = doc && doc.getElementById('wocoincap');
        var nm = host.coin && host.coin.names ? host.coin.names[pl.toss] : pl.toss;
        if (cc) { cc.textContent = nm + ' win the toss and kick off'; cc.classList.add('on'); }
        if (els.coinbox) els.coinbox.setAttribute('data-toss', pl.toss);
        S('cue', 'coinland'); S('swell', 0.5, 1.8);
      }],
      [T2.coin1, function () { if (els.coinbox) els.coinbox.classList.remove('on'); strip(host.strip && host.strip.kick || '', true); S('tension', 0.55); }],
      [T2.out, function () { (els.cardEls || []).forEach(function (c) { if (c && c.classList) { c.classList.remove('on'); c.classList.add('gone'); } }); }]
    ];
    if (stillCard) {
      /* reduced motion: the last picture at once, the cards still, the coin's answer as words */
      CUES = [[0, function () {
        (els.cardEls || []).forEach(function (c, i) { if (c && c.classList) { c.classList.add('on'); } });
        if (host.sheet && els.cardEls && els.cardEls[1]) cardHidden(1, true);
        var nm = host.coin && host.coin.names ? host.coin.names[pl.toss] : pl.toss;
        strip(nm + ' win the toss and kick off', true);
        if (els.coinbox) els.coinbox.setAttribute('data-toss', pl.toss);
        if (host.onStart) host.onStart();
      }], [3.6, function () {
        if (host.sheet && els.cardEls && els.cardEls[1]) { cardHidden(0, true); cardHidden(1, false); }
      }]];
    }
    var total = stillCard ? 7 : pl.dur;
    els.coinEl = doc ? doc.getElementById('wocoin') : null;

    function cleanup() {
      if (els.layer && els.layer.parentNode) els.layer.parentNode.removeChild(els.layer);
      if (els.wlayer && els.wlayer.parentNode) els.wlayer.parentNode.removeChild(els.wlayer);
      if (els.sheetEl && els.sheetEl.parentNode) els.sheetEl.parentNode.removeChild(els.sheetEl);
      (els.cards || []).forEach(function (w) { if (w && w.parentNode) w.parentNode.removeChild(w); });
      if (win && win.removeEventListener) { win.removeEventListener('keydown', onKey, true); win.removeEventListener('click', onClick, true); }
    }
    function finish(skipped) {
      if (over) return;
      over = true;
      var fr = frameAt(pl, pl.dur);
      if (host.draw) host.draw(fr); drawn++;
      cleanup();
      if (host.done) host.done({ skipped: !!skipped, t: t, frame: fr, toss: pl.toss });
    }
    function skip() {
      if (over) return false;
      if (BREAK.name === 'skip' && t >= T2.coin0 && t < T2.coin1) return false;   // a fault: the toss cannot be skipped
      finish(true);
      return true;
    }
    /* the click or key that started the match is not a skip */
    function young() { return born !== null && nowF() - born < 120; }
    function onKey(e) {
      if (over || young()) return;
      /* modifier keys alone are not a request */
      if (e && /^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key || '')) return;
      if (e) { try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (x) { } }
      skip();
    }
    function onClick() { if (!over && !young()) skip(); }   /* the click still does its own job (Settings opens) */
    /* on the window, in the capture phase, so the page's own keys (the
     * keyboard play) never see a key that skips the walk-out */
    if (win && win.addEventListener) { win.addEventListener('keydown', onKey, true); win.addEventListener('click', onClick, true); }
    if (els.skip) els.skip.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); skip(); };

    function tick() {
      if (over) return;
      var n = nowF();
      if (last === null) last = n;
      var dt = Math.min(0.1, Math.max(0, (n - last) / 1000));
      last = n;
      var sp = host.speed ? +host.speed() : 1;
      t += dt * (sp >= 0 ? sp : 1);
      for (var i = 0; i < CUES.length; i++) if (!fired[i] && t >= CUES[i][0]) { fired[i] = 1; CUES[i][1](); }
      if (!stillCard || drawn === 0) { if (host.draw) host.draw(frameAt(pl, stillCard ? pl.dur : t)); drawn++; }
      if (els.coinEl) els.coinEl.style.transform = coinPose(pl, t);
      if (t >= total) { finish(false); return; }
      later(tick, 16);
    }
    born = nowF();
    tick();
    return {
      skip: skip, over: function () { return over; },
      /* ends it with no hand-off (the page is starting another match) */
      cancel: function () { if (over) return; over = true; cleanup(); }, t: function () { return t; },
      phase: function () { return over ? 'done' : stillCard ? 'still' : phaseAt(pl, t); }, total: total
    };
  }

  var API = {
    T: T, TUNNEL: TUNNEL, BREAK: BREAK,
    plan: plan, frameAt: frameAt, phaseAt: phaseAt, coinAngle: coinAngle, coinFace: coinFace, captainOf: captainOf, keyPlayers: keyPlayers,
    cardHTML: cardHTML, miniPitchSVG: miniPitchSVG, injectCSS: injectCSS, run: run,
    wanted: wanted, markSeen: markSeen, pref: pref, setPref: setPref, seen: seen
  };
  root.KMWalkout = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
