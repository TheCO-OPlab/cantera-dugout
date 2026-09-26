/* ob1 + ft2: FULL TIME, A SCREEN WORTH A SCREENSHOT.
 *
 * ft2 turns ob1's card into a one-glance story of the match, over the final
 * picture of the pitch:
 *   - the score, big, with both flags (or team dots) and who scored when;
 *   - one line from the momentum ribbon: "The ball was in Argentina's half
 *     for 68 of the 86 minutes shown, and Spain still lost 0-1." Its numbers
 *     are KMRibbon.story() and nothing else;
 *   - rib1's momentum ribbon, flat, across the card (0' to 90', a bar a
 *     minute, goals labelled, the moments as rings, the kit colours);
 *   - the six moments as tiles in a row under the ribbon, each under its
 *     minute (pushed apart only as far as they need to be, with a thin line
 *     up to its ring), how it ended as one icon and two or three words;
 *   - your decisions: how many were clean wins, half wins and losses (the
 *     same verdict the result box printed), the riskiest pick that paid off
 *     and the one that cost you, each with the chance its card printed;
 *   - the player of the match (yours: goals, then duels won);
 *   - "Watch the goals" (rp1's reel) as the main button when there were
 *     goals, "Play again" and "Another match" beside it; "Share image" draws
 *     a 1200x630 picture (sharecard.js) with a "Save image" download.
 * The match report's "why" lines stay one click away under "What decided it".
 *
 * KMObEnd.build(m) returns the numbers (tested in node), KMObEnd.html(m)
 * the markup, KMObEnd.show(host, m) draws and wires it. m:
 *   log: st.log, picks: [{ ev, o }] in order (the option chosen for each
 *   event, for its chances), score {you, them}, you/them {name, team,
 *   roster: [players]}, final, reportLines: [{good, head, why}],
 *   icon(id), nm(text), onAgain, onSheet, onFresh, goodBy (a clean win's
 *   margin, 4), seed, and ft2 (from ftglue.js, optional): { ribbon: {series,
 *   marks, story}, clips, reel(onDone), kits: {you, them} } */
(function (root) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flag(id) { return id ? '<span class="flag ' + esc(id) + '" aria-hidden="true"></span>' : ''; }
  var TONE = { fwd: 'g', back: 'r', backKeep: 'n', stay: 'n', goal: 'g', conceded: 'r', lost: 'r', won: 'g', dead: 'n' };
  /* ?ft2break=<name> breaks one thing on purpose (ftcheck.js shows its check fails) */
  function brk(name) { try { return new RegExp('[?&]ft2break=' + name + '\\b').test((root.location && root.location.search) || ''); } catch (e) { return false; } }

  /* how a moment ended, in two or three words, from its last event */
  function endWord(ev) {
    var mine = ev.sit && ev.sit.who === 'you';
    switch (ev.kind) {
      case 'goal': return { word: (scorerOf(ev) || 'You') + ' scores', icon: 'goal', tone: 'g' };
      case 'conceded': return { word: (scorerOf(ev) || 'They') + ' scores', icon: 'conceded', tone: 'r' };
      case 'lost': return { word: 'Ball lost', icon: 'lost', tone: 'r' };
      case 'stopped': case 'escaped': return { word: 'Stopped', icon: 'won', tone: 'g' };
      default: {
        var s = String(ev.short || '').replace(/, then .*$/, '');
        return { word: s || (mine ? 'Play stops' : 'Stopped'), icon: ev.icon || 'dead', tone: TONE[ev.icon] || 'n' };
      }
    }
  }

  /* col: the tile's colour by the severity scale (icons.js): red only for a
   * goal against, a lost ball orange, their attack coming closer amber */
  function sevWord(e, ev) {
    var I = root.KMIcons;
    if (!I || !I.kindOf) return e;
    var who = ev.sit && ev.sit.who === 'them' ? 'them' : 'you';
    var kind = I.kindOf(e.icon, who, ev), sv = I.sevOf(kind);
    e.icon = kind; e.sev = sv;
    e.tone = sv === 'conceded' ? 'r' : sv === 'goal' || sv === 'good' ? 'g' : 'n';
    return e;
  }

  /* the chance of what actually happened, from the option that was chosen */
  function chanceOf(pk) {
    if (!pk || !pk.o || !pk.o.outcomes) return null;
    var ev = pk.ev, list = pk.o.outcomes;
    if (ev.kind === 'goal' || ev.kind === 'conceded') {
      var g = 0; list.forEach(function (x) { if (x.icon === ev.kind || x.effect === ev.kind) g += x.p; });
      if (g > 0) return g;
    }
    var p = 0; list.forEach(function (x) { if (x.band === ev.band || (x.bands && x.bands.indexOf(ev.band) >= 0)) p += x.p; });
    return p > 0 ? Math.min(1, p) : null;
  }

  /* ft2: the chance the card printed beside the result that happened. The
   * card (lean, the default, and the playtester card alike) rounds each
   * result with wholePercents (the largest remainder, so a card adds to
   * 100) and shows results that read the same in a few words (the same icon
   * and short words) as one entry, their percents added (ob-lean.js rows).
   * The engine's result is the last line whose bands hold the band it
   * rolled (match.js choose). A card with one entry says "Certain": 100. */
  function wholePercents(ps) {
    var raw = ps.map(function (p) { return p * 100; });
    var out = raw.map(Math.floor);
    var left = 100 - out.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.frac - a.frac; });
    for (var k = 0; k < left && k < order.length; k++) out[order[k].i]++;
    return out;
  }
  function rowKey(x) { return (x.icon || '') + '|' + (x.short || x.text); }
  function printedChance(pk) {
    var list = (pk && pk.o && pk.o.outcomes) || [];
    if (!list.length) return null;
    var shown = wholePercents(list.map(function (x) { return x.p; })), at = -1;
    list.forEach(function (x, i) { if ((x.bands || [x.band]).indexOf(pk.ev.band) >= 0) at = i; });
    if (at < 0) return null;
    var key = rowKey(list[at]), keys = {}, sum = 0;
    list.forEach(function (x, i) { keys[rowKey(x)] = 1; if (rowKey(x) === key) sum += shown[i]; });
    return Object.keys(keys).length === 1 ? 100 : sum;
  }
  /* the verdict the result box printed for a decision (play.html verdictOf):
   * won (a clean win), half, lost, or none (nothing to roll) */
  function verdictClass(ev, goodBy) {
    var d = ev && ev.dice, good = goodBy || 4;
    if (!d) return 'none';
    if (d.diff >= good || (d.halfSame && d.diff > 0)) return 'won';
    if (d.diff >= 0) return 'half';
    return 'lost';
  }
  function article(pc) { return pc === 8 || pc === 11 || pc === 18 || (pc >= 80 && pc <= 89) ? 'an ' : 'a '; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* ft2: who scored, from the words the user read (rib1's reading): the
   * engine's actor is the man who made the choice, and a cross or a
   * cut-back is scored by someone else ("Porro crosses it low ... for
   * Oyarzabal"; ob1 credited Porro). The actor or foil when the words name
   * nobody. */
  var RIBREQ = null;
  try { if (!root.KMRibbon && typeof require === 'function') RIBREQ = require('./ribbon.js'); } catch (e) { }
  function scorerOf(ev) {
    var R = root.KMRibbon || RIBREQ, dflt = ev.kind === 'conceded' ? ev.foilName : ev.actorName;
    var s = R && R.scorerFromText ? R.scorerFromText(String(ev.text || '').replace(/^(GOAL|THEY SCORE)\.\s*/, '')) : null;
    return s || dflt || '';
  }

  /* ft2: your decisions, counted, and the two that stand out */
  var RISK = 50;
  function decisions(m) {
    var picks = m.picks || [], them = (m.them && m.them.name) || 'They';
    var c = { total: picks.length, won: 0, half: 0, lost: 0, none: 0 };
    var paid = null, cost = null;
    picks.forEach(function (pk, i) {
      var ev = pk.ev; if (!ev) return;
      var vc = verdictClass(ev, m.goodBy);
      c[brk('count') && vc === 'half' ? 'won' : vc]++;
      var pc = printedChance(pk);
      if (pc === null) return;
      var good = ev.kind === 'goal' || ev.band === 'good';
      var bad = ev.kind === 'conceded' || ev.kind === 'lost' || ev.band === 'bad';
      /* the riskiest pick that paid off: the good result its card gave the
       * smallest chance, and only a real risk (50% or less: at best even
       * odds); a goal wins a tie */
      if (good && pc <= RISK && (!paid || pc < paid.pc || (pc === paid.pc && ev.kind === 'goal' && paid.ev.kind !== 'goal')))
        paid = { i: i, ev: ev, pc: pc, label: pk.o.label };
      /* the one that cost you: the worst result (a goal against you, then
       * losing the ball, then anything else that went against you), and of
       * those the one its card made least likely */
      var w = ev.kind === 'conceded' ? 3 : ev.kind === 'lost' ? 2 : 1;
      if (bad && (!cost || w > cost.w || (w === cost.w && pc < cost.pc))) cost = { i: i, ev: ev, pc: pc, w: w, label: pk.o.label };
    });
    if (paid) {
      var e1 = paid.ev;
      paid.line = e1.minute + "': " + String(paid.label).replace(/\.$/, '') + '. It had ' + article(paid.pc) + (paid.pc + (brk('pct') ? 1 : 0)) + '% chance, and ' +
        (e1.kind === 'goal' ? (scorerOf(e1) || 'you') + ' scored.' : 'it worked.');
    }
    if (cost) {
      var e2 = cost.ev, tail = e2.kind === 'conceded' ? them + ' scored from it.' : e2.kind === 'lost' ? 'It failed and ' + them + ' took the ball.' : 'It went against you.';
      cost.line = e2.minute + "': " + String(cost.label).replace(/\.$/, '') + '. ' + tail +
        (cost.pc >= 100 ? ' The card said that was certain.' : ' That had ' + article(cost.pc) + cost.pc + '% chance.');
    }
    return { counts: c, paid: paid, cost: cost };
  }

  /* ft2: the ribbon's story in one line; every number in it is story()'s */
  function storyLine(story, youName, themName, score) {
    if (!story || !(story.shown > 0)) return null;
    var you = youName || 'You', them = themName || 'They', s = score || { you: 0, them: 0 };
    var mine = story.theirHalf >= story.yourHalf;
    var n = (mine ? story.theirHalf : story.yourHalf) + (brk('story') ? 1 : 0), half = (mine ? them : you) + "'s half";
    var sc = s.you + '-' + s.them, tail;
    if (s.you > s.them) tail = mine ? ', and ' + you + ' won ' + sc + '.' : ', and ' + you + ' still won ' + sc + '.';
    else if (s.you < s.them) tail = mine ? ', and ' + you + ' still lost ' + sc + '.' : ', and ' + you + ' lost ' + sc + '.';
    else tail = s.you === 0 ? ', and nobody scored.' : ', and it finished ' + sc + '.';
    return { text: 'The ball was in ' + half + ' for ' + n + ' of the ' + story.shown + ' minutes shown' + tail, n: n, shown: story.shown, half: mine ? 'theirs' : 'yours' };
  }

  /* ft2: the tiles under the ribbon. Each wants its centre under its
   * minute; tiles that would overlap are pushed apart as a block, as little
   * as possible, and the row stays inside [0, width]. Pure. */
  function layoutTiles(minutes, axis, width, tileW, gap) {
    var n = axis.minutes || 90, want = minutes.map(function (mm) { return axis.side + (mm + 0.5) * axis.length / n; });
    var step = tileW + gap, lo = tileW / 2, hi = width - tileW / 2, blocks = [];
    function place(b) {
      var sum = 0;
      for (var j = 0; j < b.n; j++) sum += want[b.first + j] - j * step;
      return Math.max(lo, Math.min(hi - (b.n - 1) * step, sum / b.n));
    }
    want.forEach(function (c, i) {
      blocks.push({ first: i, n: 1 });
      while (blocks.length > 1) {
        var prev = blocks[blocks.length - 2], cur = blocks[blocks.length - 1];
        if (place(prev) + prev.n * step <= place(cur) + 1e-9) break;
        prev.n += cur.n; blocks.pop();
      }
    });
    var out = [];
    blocks.forEach(function (b) { var p = place(b); for (var j = 0; j < b.n; j++) out.push({ want: want[b.first + j], cx: p + j * step }); });
    if (brk('order') && out.length > 2) { var t = out[0].cx; out[0].cx = out[1].cx; out[1].cx = t; }
    return out;
  }

  function build(m) {
    var log = m.log || [];
    /* the six moments, in order, each from its events */
    var byIdx = {}, order = [];
    log.forEach(function (ev) {
      if (!byIdx[ev.index]) { byIdx[ev.index] = []; order.push(ev.index); }
      byIdx[ev.index].push(ev);
    });
    var moments = order.map(function (k) {
      var evs = byIdx[k], a = evs[0], z = evs[evs.length - 1];
      var e = sevWord(endWord(z), z);  // col
      /* m5: a moment that ended in a goal is tagged by who scored ("You scored",
       * "They scored"), never by whose attack it was when it began: a tile read
       * "Your attack" over "Messi scores" when their counter came from your
       * lost ball. Otherwise whose attack it was, in plain words. */
      var gk = brk('tag') ? null : z.kind;   // (?ft2break=tag: m4's tagging, by whose attack it began as)
      var who = gk === 'goal' ? 'you' : gk === 'conceded' ? 'them' : a.sit && a.sit.who === 'you' ? 'you' : 'them';
      var tag = gk === 'goal' ? 'You scored' : gk === 'conceded' ? 'They scored' : who === 'you' ? 'Your attack' : 'Their attack';
      return { index: k, minute: a.minute, who: who, tag: tag, decisions: evs.length,
        word: e.word, icon: e.icon, tone: e.tone, sev: e.sev };  // col
    });
    /* who scored */
    var goals = { you: [], them: [] };
    log.forEach(function (ev) {
      if (ev.kind === 'goal') goals.you.push({ name: scorerOf(ev), minute: ev.minute });
      if (ev.kind === 'conceded') goals.them.push({ name: scorerOf(ev), minute: ev.minute });
    });
    /* player of the match: yours; a goal is worth three, a clean win two,
     * a half win one, a lost duel minus one; ties go to more duels won */
    var pl = {};
    function man(n) { return pl[n] || (pl[n] = { name: n, score: 0, goals: 0, won: 0, duels: 0, stops: 0 }); }
    log.forEach(function (ev) {
      var n = ev.actorName;
      /* ft2: the goal goes to the man who scored it (the words), the duel to the man who played it */
      if (ev.kind === 'goal') { var g = man(scorerOf(ev) || n); g.goals++; g.score += 3; }
      if (!n) return;
      var r = man(n);
      if (ev.dice) { r.duels++; if (ev.dice.diff >= 0) r.won++; }
      r.score += ev.band === 'good' ? 2 : ev.band === 'mixed' ? 1 : ev.band === 'bad' ? -1 : 0;
      if (ev.kind === 'stopped' || ev.kind === 'escaped') { r.stops++; r.score += 1; }
    });
    var potm = Object.keys(pl).map(function (k) { return pl[k]; })
      .sort(function (a, b) { return (b.score - a.score) || (b.won - a.won) || (b.duels - a.duels); })[0] || null;
    if (potm) {
      var bits = [];
      if (potm.goals) bits.push(potm.goals === 1 ? 'scored' : 'scored ' + potm.goals);
      if (potm.stops) bits.push('stopped ' + potm.stops + (potm.stops === 1 ? ' attack' : ' attacks'));
      if (potm.duels || !bits.length) bits.push('won ' + potm.won + ' of ' + potm.duels + (potm.duels === 1 ? ' duel' : ' duels'));
      potm.line = bits.join(', ');
      var who = (m.you && m.you.roster || []).filter(function (p) { return String(p.name || '').split(' ')[0] === potm.name; })[0];
      potm.number = who ? who.number : null;
      potm.role = who ? who.short || who.role || '' : '';
    }
    /* the key decision (ob1; kept for the numbers, the screen shows ft2's
     * "Paid off" and "Cost you" instead): a goal either way counts three,
     * losing the ball two, anything else one; times how unlikely it was */
    var key = null;
    (m.picks || []).forEach(function (pk) {
      var p = chanceOf(pk); if (p === null) return;
      var ev = pk.ev, w = ev.kind === 'goal' || ev.kind === 'conceded' ? 3 : ev.kind === 'lost' ? 2 : 1;
      var sc = w * (1 - p) + (ev.kind === 'goal' ? 0.01 : 0);
      if (!key || sc > key.sc) key = { sc: sc, ev: ev, p: p, label: pk.o.label };
    });
    if (key) {
      var pc = Math.max(1, Math.min(99, Math.round(key.p * 100))), ev = key.ev;
      var an = article(pc);
      var tail = ev.kind === 'goal' ? 'It had ' + an + pc + '% chance of a goal, and ' + (scorerOf(ev) || 'he') + ' scored.'
        : ev.kind === 'conceded' ? 'They scored from it. That had ' + an + pc + '% chance.'
        : ev.kind === 'lost' ? 'It failed and they took the ball. That had ' + an + pc + '% chance.'
        : ev.band === 'bad' ? 'It went against you. That had ' + an + pc + '% chance.'
        : 'It worked. That had ' + an + pc + '% chance.';
      key.line = ev.minute + "': " + String(key.label).replace(/\.$/, '') + '. ' + tail;
      key.tone = ev.kind === 'goal' || ev.band === 'good' ? 'g' : ev.band === 'mixed' ? 'n' : 'r';
      if (root.KMIcons && root.KMIcons.kindOf) { key.sev = sevWord({ icon: ev.kind === 'goal' ? 'goal' : ev.kind === 'conceded' ? 'conceded' : ev.icon || 'dead' }, ev).sev; key.tone = key.sev === 'conceded' ? 'r' : key.tone === 'r' ? 'n' : key.tone; }  // col
    }
    var s = m.score || { you: 0, them: 0 };
    var ft = m.ft2 || {}, rib = ft.ribbon || null;
    var story = rib ? storyLine(rib.story, m.you && m.you.name, m.them && m.them.name, s) : null;
    var nGoals = goals.you.length + goals.them.length;
    return { moments: moments, goals: goals, potm: potm, key: key, score: s,
      verdict: s.you > s.them ? 'You won' : s.you < s.them ? 'You lost' : 'It finished level',
      decisions: decisions(m), story: story, ribbon: rib,
      reel: nGoals > 0 && ft.clips > 0 && typeof ft.reel === 'function' ? { n: ft.clips } : null };
  }

  function scorers(list) {
    var by = {};
    var order = [];
    list.forEach(function (g) { if (!by[g.name]) { by[g.name] = []; order.push(g.name); } by[g.name].push(g.minute + "'"); });
    return order.map(function (n) { return n + ' ' + by[n].join(', '); }).join(', ');
  }

  /* the ribbon and the tiles, for a card this wide (px inside its padding) */
  var AX = { side: 66, right: 10, thick: 54, minutes: 90 };
  function tileSize(width) { return { w: Math.max(84, Math.min(118, Math.floor((width - 5 * 8) / 6))), gap: 8 }; }
  function ribHTML(m, b, width) {
    var icon = m.icon || function () { return ''; };
    width = Math.max(300, Math.round(width || 840));
    var RV = root.KMRibbonView, len = width - AX.side - AX.right;
    var axis = { side: AX.side, length: len, minutes: AX.minutes };
    /* taller where the window has room (a 1080 p screen), lower on a 768 p laptop */
    var vh = root.innerHeight || 0, thick = vh >= 900 ? 76 : vh >= 720 ? AX.thick : 44;
    var svg = b.ribbon && RV ? RV.svg(b.ribbon.series, b.ribbon.marks, { orient: 'h', length: len, side: AX.side, thick: thick, gutter: 22, now: null }) : '';
    var ts = tileSize(width), lay = layoutTiles(b.moments.map(function (x) { return x.minute; }), axis, width, ts.w, ts.gap);
    var lead = '<svg class="ft-lead" width="' + width + '" height="16" viewBox="0 0 ' + width + ' 16" aria-hidden="true">' +
      lay.map(function (q) { return '<path d="M' + q.want.toFixed(1) + ' 0 C' + q.want.toFixed(1) + ' 9 ' + q.cx.toFixed(1) + ' 7 ' + q.cx.toFixed(1) + ' 16"/>'; }).join('') + '</svg>';
    var tiles = b.moments.map(function (x, k) {
      var q = lay[k];
      return '<li class="obe-m ' + x.tone + ' ' + x.who + (x.sev ? ' sv-' + x.sev : '') + '" data-min="' + x.minute + '" data-cx="' + q.cx.toFixed(1) + '" style="left:' + (q.cx - ts.w / 2).toFixed(1) + 'px;width:' + ts.w + 'px;animation-delay:' + (0.15 + k * 0.08).toFixed(2) + 's">' +
        '<span class="obe-top"><span class="obe-min">' + x.minute + "'</span>" + '<span class="obe-ic">' + icon(x.icon) + '</span></span>' +
        '<span class="obe-w"><span>' + esc(x.word) + '</span></span>' +
        '<span class="obe-who">' + (x.who === 'you' ? '&#8593; ' : '&#8595; ') + esc(x.tag) + '</span></li>';   // m5: x.tag
    }).join('');
    return (svg ? '<div class="ft-svg">' + svg + '</div>' : '') +
      '<div class="ft-row" style="width:' + width + 'px">' + (svg ? lead : '') + '<ol class="obe-strip ft-tiles"' + (brk('clip') ? ' style="height:70px"' : '') + ' aria-label="The six moments">' + tiles + '</ol></div>';
  }

  /* bare: the card without the backdrop around it */
  function html(m, bare, width) {
    var b = build(m), nm = m.nm || esc;
    var you = m.you || {}, them = m.them || {}, d = b.decisions, c = d.counts;
    var res = b.score.you > b.score.them ? 'won' : b.score.you < b.score.them ? 'lost' : 'drew';
    var storyText = b.story ? b.story.text : '';
    var decH = '<div class="ft-dec"><p class="obe-h">Your decisions</p>' +
      '<p class="ft-count" id="ftcount"><b>' + c.total + '</b> decisions: <span class="g">' + c.won + ' clean ' + (c.won === 1 ? 'win' : 'wins') + '</span>, ' +
        '<span class="n">' + c.half + ' half ' + (c.half === 1 ? 'win' : 'wins') + '</span>, <span class="r">' + c.lost + ' ' + (c.lost === 1 ? 'loss' : 'losses') + '</span>' +
        (c.none ? ', ' + c.none + ' with nothing to roll' : '') + '</p>' +
      (c.total ? '<p class="ft-bar" aria-hidden="true">' + ['won', 'half', 'lost', 'none'].map(function (k) {
        return c[k] ? '<i class="' + k + '" style="flex:' + c[k] + '"></i>' : '';
      }).join('') + '</p>' : '') +
      (d.paid ? '<p class="ft-pick g" id="ftpaid"><b>Riskiest that paid off</b>' + nm(d.paid.line) + '</p>'
        : '<p class="ft-pick n" id="ftpaid"><b>Riskiest that paid off</b>None: nothing with a 50% chance or less worked.</p>') +
      (d.cost ? '<p class="ft-pick r" id="ftcost"><b>The one that cost you</b>' + nm(d.cost.line) + '</p>'
        : '<p class="ft-pick g" id="ftcost"><b>The one that cost you</b>None: no decision went against you.</p>') +
      '</div>';
    var potmH = b.potm ? '<div class="obe-potm"><p class="obe-h">Player of the match</p>' +
      '<p class="obe-pn"><span class="obe-num">' + (b.potm.number != null ? esc(b.potm.number) : '') + '</span>' + esc(b.potm.name) + '</p>' +
      '<p class="obe-pl">' + esc(cap(b.potm.line)) + '.</p></div>' : '';
    var reel = b.reel ? '<button class="go" id="ftreel">' + (b.reel.n === 1 ? 'Watch the goal' : 'Watch all ' + b.reel.n + ' goals') + '</button>' : '';
    return (bare ? '' : '<div class="obe-back" id="obend" role="dialog" aria-label="Full time">') +
      '<div class="obe ft2 ' + res + '"' + (brk('fit') ? ' style="min-height:1400px"' : '') + '>' +
        '<p class="obe-kick">Full time' + (m.final ? ' &middot; The 2026 World Cup final' : '') + '</p>' +
        '<div class="obe-score">' +
          '<div class="obe-t you">' + (you.team ? flag(you.team) : '<i class="obi-dot you"></i>') + '<b>' + esc(you.name) + '</b>' +
            '<span class="obe-sc">' + (b.goals.you.length ? esc(scorers(b.goals.you)) : '&nbsp;') + '</span></div>' +
          '<div class="obe-n"><span>' + b.score.you + '</span><i>-</i><span>' + b.score.them + '</span></div>' +
          '<div class="obe-t them">' + (them.team ? flag(them.team) : '<i class="obi-dot them"></i>') + '<b>' + esc(them.name) + '</b>' +
            '<span class="obe-sc">' + (b.goals.them.length ? esc(scorers(b.goals.them)) : '&nbsp;') + '</span></div>' +
        '</div>' +
        '<p class="obe-verdict">' + b.verdict + '</p>' +
        (storyText ? '<p class="ft-story" id="ftstory">' + esc(storyText) + '</p>' : '') +
        '<div class="ft-rib" id="ftrib">' + ribHTML(m, b, width) + '</div>' +
        '<div class="ft-two' + (m.buildHTML ? ' bv3' : '') + '">' + decH + (m.buildHTML || '') + potmH + '</div>' +   // cl1: "Your build" between the decisions and the player of the match
        '<div class="obe-btns ft-btns">' + reel +
          '<button class="' + (reel && !brk('btn') ? 'ghost' : 'go') + '" id="again">Play again</button>' +
          '<button class="ghost" id="fresh">Another match</button>' +
          '<span class="ft-links">' +
            '<button class="obe-more" id="ftshare">Share image</button>' +
            '<button class="obe-more" id="sheet">Change the eleven</button>' +
            (m.reportLines && m.reportLines.length ? '<button class="obe-more" id="obemore" aria-expanded="false">What decided it</button>' : '') +
          '</span></div>' +
        (m.reportLines && m.reportLines.length ? '<div class="obe-report" id="obereport" hidden>' + m.reportLines.map(function (l) {
          return '<div class="reason' + (l.good ? '' : ' bad') + '"><b>' + esc(l.head) + '</b><span>' + esc(l.why) + '</span></div>';
        }).join('') + '</div>' : '') +
        '<div class="ft-share" id="ftsharebox" hidden><div class="ft-share-in">' +
          '<p class="obe-h">Share image (1200 x 630)</p><div class="ft-share-img" id="ftshareimg"></div>' +
          '<p class="ft-share-btns"><a class="go" id="ftsave" download="cantera.png" href="#">Save image</a>' +
          '<button class="ghost" id="ftshareclose">Close</button></p></div></div>' +
      '</div>' + (bare ? '' : '</div>');
  }

  /* what the share card draws, from the same numbers as the screen */
  function shareData(m, b) {
    var k = (m.ft2 && m.ft2.kits) || {};
    return { kicker: 'Full time' + (m.final ? ' · The 2026 World Cup final' : ''),
      you: { name: (m.you && m.you.name) || 'You', kit: k.you }, them: { name: (m.them && m.them.name) || 'Them', kit: k.them },
      score: b.score, scorers: { you: scorers(b.goals.you), them: scorers(b.goals.them) },
      story: b.story ? b.story.text : '', series: b.ribbon ? b.ribbon.series : [], marks: b.ribbon ? b.ribbon.marks : [], seed: m.seed };
  }

  var CSS_DONE = false;
  function drop(el) { if (el.remove) el.remove(); else if (el.parentNode) el.parentNode.removeChild(el); }
  function show(host, m) {
    var old = document.getElementById('obend'); if (old && old.parentNode) drop(old);
    if (!CSS_DONE && root.KMRibbonView && document.head) {
      var st = document.createElement('style'); st.textContent = root.KMRibbonView.CSS; document.head.appendChild(st); CSS_DONE = true;
    }
    var el = document.createElement('div');
    el.className = 'obe-back';
    el.id = 'obend';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Full time');
    el.innerHTML = html(m, true);
    host.appendChild(el);
    var g = function (id) { return document.getElementById(id); };
    var b = build(m);
    /* the ribbon and the tiles at the card's real width, again on a resize */
    function fit() {
      var box = g('ftrib'), w = box && box.clientWidth;
      if (!w || !box) return;
      if (Math.abs(w - (box._w || 0)) < 2) return;
      box._w = w; box.innerHTML = ribHTML(m, b, w);
    }
    fit();
    var onResize = function () { fit(); };
    if (root.addEventListener) root.addEventListener('resize', onResize);
    function gone() { if (root.removeEventListener) root.removeEventListener('resize', onResize); if (el.parentNode) drop(el); }
    g('again').onclick = function () { gone(); m.onAgain && m.onAgain(); };
    g('sheet').onclick = function () { gone(); m.onSheet && m.onSheet(); };
    g('fresh').onclick = function () { gone(); m.onFresh && m.onFresh(); };
    if (g('ftreel')) g('ftreel').onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      el.style.display = 'none';
      var ok = m.ft2.reel(function () { el.style.display = ''; });
      if (!ok) el.style.display = '';
    };
    if (g('obemore')) g('obemore').onclick = function () {
      var r = g('obereport'), open = !r.hidden;
      r.hidden = open; this.setAttribute('aria-expanded', open ? 'false' : 'true');
      this.textContent = open ? 'What decided it' : 'Hide';
    };
    /* the share card: drawn now (so it is ready), shown on "Share image" */
    var SC = root.KMShareCard, cv = null;
    if (SC && document.createElement) {
      try {
        cv = document.createElement('canvas'); cv.id = 'ftcanvas';
        if (cv.getContext) {
          var sd = shareData(m, b);
          SC.draw(cv, sd);
          g('ftshareimg').appendChild(cv);
          var a = g('ftsave'); a.setAttribute('download', SC.fileName(sd));
          a.onclick = function () { try { a.href = cv.toDataURL('image/png'); } catch (e) { } };
          try { a.href = cv.toDataURL('image/png'); } catch (e) { }
        } else cv = null;
      } catch (e) { cv = null; }
    }
    if (!cv && g('ftshare')) g('ftshare').style.display = 'none';
    g('ftshare').onclick = function () { g('ftsharebox').hidden = false; try { g('ftsave').focus({ preventScroll: true }); } catch (e) { } };
    g('ftshareclose').onclick = function () { g('ftsharebox').hidden = true; };
    try { (g('ftreel') || g('again')).focus({ preventScroll: true }); } catch (e) { }
    return el;
  }

  var API = { build: build, html: html, show: show, chanceOf: chanceOf, endWord: endWord, storyLine: storyLine, layoutTiles: layoutTiles,
    decisions: decisions, printedChance: printedChance, verdictClass: verdictClass, wholePercents: wholePercents, shareData: shareData, tileSize: tileSize, AX: AX };
  root.KMObEnd = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
