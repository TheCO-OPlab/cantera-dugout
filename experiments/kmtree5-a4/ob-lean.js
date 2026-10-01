/* ob1: THE LEAN CARD (piece 3 of the first-time study), behind ?cards=lean.
 *
 * A first-timer reads one line and three icons. The card is:
 *   - one line: what your player does ("Rodri runs at Lisandro to get into
 *     the box"), with his flag;
 *   - the results as icons with their chances, in the order of the roll:
 *     clean win, half win, loss. The arrows point UP the screen for toward
 *     their goal, the way the pitch is drawn;
 *   - a thin bar under them, the same chances as lengths: green good for
 *     you, grey neither, red bad.
 * Details (each result in a few words, the two numbers in the duel, the
 * edges) open on hover with a mouse, or on the first tap on a phone (the
 * second tap plays the card).
 *
 * KMObLean.card(o, i, h) returns the markup for one option; h gives the
 * page's helpers: nm (names with flags), nmReset, icon(id), pct(list of
 * p) -> whole percents adding to 100, tone(icon id) -> 'g'|'n'|'r'.
 * KMObLean.wire(box, choose) makes the hover and tap behaviour. */
(function (root) {
  'use strict';
  /* col: the severity scale lives in icons.js */
  function IC() { return root.KMIcons || null; }
  function sevRank(sv) { var L = IC() ? IC().SEVS : []; var i = L.indexOf(sv); return i < 0 ? 2 : i; }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }
  var ATTR = { technique: 'Technique', passing: 'Passing', pace: 'Pace', physical: 'Physical', finishing: 'Finishing',
    defending: 'Defending', intelligence: 'Intelligence', reflexes: 'Reflexes', command: 'Command', distribution: 'Distribution', heading: 'Heading' };
  function attrName(a) { return ATTR[a] || (a ? String(a).charAt(0).toUpperCase() + String(a).slice(1) : ''); }

  /* results that read the same in a few words are one entry, chances added */
  function rows(o, h) {
    var list = o.outcomes || [];
    var shown = h.pct(list.map(function (x) { return x.p; }));
    var out = [];
    list.forEach(function (x, k) {
      /* col: the display kind (the engine icon with its side) and its severity */
      var kind = IC() ? IC().kindOf(x.icon, h.who, x) : x.icon, sev = IC() ? IC().sevOf(kind) : null;
      var key = (kind || '') + '|' + (x.short || x.text);
      var same = out.filter(function (r) { return r.key === key; })[0];
      if (same) { same.pct += shown[k]; if (x.effect === 'break' || x.effect === 'concede') same.bad = true; return; }
      /* the edge a result carries, as a number: "+2" (to you next) or "-2" (to them) */
      var edge = null, em = /([+-]\d+) to (you|them) next/.exec(x.edgeShort || x.short || '');
      if (em) edge = { n: em[1], them: em[2] === 'them' };
      out.push({ key: key, icon: x.icon, kind: kind, sev: sev, tone: h.tone(x.icon), short: x.short || x.shortBase || x.text, band: x.band, pct: shown[k], edge: edge,
        bad: x.effect === 'break' || x.effect === 'concede' });   // m6: a result that loses it (the risk line's colour)
    });
    return out;
  }

  function card(o, i, h) {
    h.nmReset();
    var rs = rows(o, h);
    /* m6 (designer ruling 2026-09-26): a risky starred card is live and says
     * so: its losing chances in the page's warning colour and one line */
    var risky = !!(o.riskStar && !o.disabled);
    var chips = rs.map(function (r) {
      /* col: coloured by severity (sv-*), the icon by display kind */
      return '<span class="lo sv-' + r.sev + (risky && r.bad ? ' risk' : '') + '" data-sev="' + r.sev + '" title="' + String(r.short).replace(/"/g, '&quot;') + '">' + h.icon(r.kind || r.icon) +
        '<span class="lp">' + (rs.length === 1 ? certainWord(o, r) : r.pct + '%') + '</span>' +
        /* lay1: the edge says what it means, as a tooltip; col: and "next" on the chip */
        (r.edge ? '<sup class="ledge' + (r.edge.them ? ' them' : '') + '" title="Then: ' + (r.edge.them ? 'their' : 'your') + ' player adds ' + String(r.edge.n).replace(/^[+-]/, '') +
          ' to his number in the next duel">' + (r.edge.them ? 'them ' : '') + r.edge.n + '<span class="lnx"> next</span></sup>' : '') + '</span>';   // m6: "next" in its own span (a phone held sideways drops it)
    }).join('');
    /* col: the bar is split by the severity scale, best for you on the left,
     * one segment per step (results on the same step are added) */
    var steps = [];
    rs.forEach(function (r) {
      var s = steps.filter(function (q) { return q.sev === r.sev; })[0];
      if (s) s.pct += r.pct; else steps.push({ sev: r.sev, pct: r.pct });
    });
    steps.sort(function (a, b) { return sevRank(a.sev) - sevRank(b.sev); });
    /* kmtree5 a4 (helper P, note 4): a certain card gets a full bar too: green when its one result is not a loss,
     * the loss colour when it is (a green bar on a certain loss would be false). ?pbreak=nobar: no bar (pgcheck G4) */
    var bar = rs.length > 1 ? '<span class="lbar" aria-hidden="true">' + steps.map(function (r) {
      return '<i class="sv-' + r.sev + '" data-sev="' + r.sev + '" style="flex:' + Math.max(1, r.pct) + ' 1 0"></i>';
    }).join('') + '</span>' : rs.length === 1 && PBRK() !== 'nobar' ? '<span class="lbar full" aria-hidden="true"><i class="sv-' + fullSev(rs[0]) + '" data-sev="' + fullSev(rs[0]) + '" data-full="1" style="flex:1 1 0"></i></span>' : '';
    h.nmReset();
    var label = h.nm(o.label);
    return '<div class="optw lean-w" id="optw-' + i + '">' +
      '<button class="opt lean' + (o.disabled ? ' dead' : '') + (o.unlockNote ? ' kw' : '') + '" data-i="' + i + '"' + (o.disabled ? ' disabled' : '') +
        ' aria-describedby="ldet-' + i + '">' +
        '<span class="lact">' + (h.pre ? h.pre(o) : '') + (o.unlockNote ? '<span class="lstar" title="Only with this player">&#9733;</span>' : '') + label + (h.chips ? h.chips(o) : '') + '</span>' +
        /* lay1: a greyed card's reason is in its details (point at it), not a line on the card */
        (rs.length ? '<span class="louts">' + chips + '</span>' + bar : '') +
        /* kmtree5 a4 (helper P, note 5): every greyed card says why on its face, in one line (phrases.js greyLine) */
        (o.disabled && greyText(o) ? '<span class="lwhy0">' + h.nm(greyText(o)) + '</span>' : '') +
        (risky ? '<span class="lrisk">' + riskText(o) + '</span>' : '') +
      '</button>' +
      '<div class="ldet" id="ldet-' + i + '">' + details(o, rs, h) + '</div></div>';
  }

  function PBRK() {
    try { if (typeof process !== 'undefined' && process.env && process.env.P_BREAK) return process.env.P_BREAK; } catch (e) { }
    try { return (/[?&]pbreak=(\w+)/.exec((root.location && root.location.search) || '') || [])[1] || ''; } catch (e) { return ''; }
  }
  function PH() { return root.KMPhrases || null; }
  function greyText(o) { if (PBRK() === 'nogrey') return null; var P = PH(); return P && P.greyLine ? P.greyLine(o) : (o.greyWhy || null); }
  /* a loss: the ball lost or a goal against (or their man into your box); anything else is green */
  function isLoss(r) { return !!r.bad || r.sev === 'lost' || r.sev === 'danger' || r.sev === 'conceded'; }
  function fullSev(r) {
    if (isLoss(r)) return r.sev === 'lost' || r.sev === 'danger' || r.sev === 'conceded' ? r.sev : 'lost';
    return r.sev === 'goal' ? 'goal' : 'good';
  }
  /* note 20: a greyed card is never "Certain": its one row, if played, is what happens every time */
  function certainWord(o, r) { return o.disabled && PBRK() !== 'greycertain' ? 'Every time' : 'Certain'; }
  function riskText(o) { return 'Goes wrong ' + o.riskStar + ' times in ' + (o.riskOutOf || (root.KMResolve && root.KMResolve.OUTOF) || 36) + '.'; }
  function details(o, rs, h) {
    h.nmReset();
    var s = (o.disabled && o.greyWhy ? '<span class="lwhy">' + h.nm(o.greyWhy) + '</span>' : '') + '<span class="ld-rows">' + rs.map(function (r) {
      return '<span class="ld-row sv-' + r.sev + '">' + h.icon(r.kind || r.icon) + '<span class="ld-t">' + h.nm(r.short) + '</span><span class="ld-p">' +
        (rs.length === 1 ? certainWord(o, r).toLowerCase() : r.pct + '%') + '</span></span>';
    }).join('') + '</span>';
    if (o.actor && o.foil && o.mineVal != null && o.themVal != null) {
      h.nmReset();
      /* m6 (text audit item 4): the stat as the full card and the working print it, then the edges and the total,
       * so an edge is never counted twice ("Technique 14, +2 = 16", was "Technique 16" over "+2: ...") */
      var sumOf = function (ms) { return (ms || []).reduce(function (a, m) { return a + (m.n || 0); }, 0); };
      var statTxt = function (attr, val, ms) { var e = sumOf(ms); return attrName(attr) + ' ' + (e ? (val - e) + ', ' + (e > 0 ? '+' : '') + e + ' = ' + val : val); };
      s += '<span class="ld-duel">' + h.nm(first(o.actor) + ' (' + statTxt(o.mineAttr || o.attr, o.mineVal, o.mods) + ') against ' +
        first(o.foil) + ' (' + statTxt(o.themAttr, o.themVal, o.theirMods) + '). Each adds one die.') + '</span>';
    }
    /* cl1: with your build, the pieces say what they do in words (bviz.js), so their number lines are not listed twice */
    var skip = h.bvSkipMod ? function (m) { return h.bvSkipMod(m, o); } : function () { return false; };
    var myMods = (o.mods || []).filter(function (m) { return !skip(m); }), thMods = (o.theirMods || []).filter(function (m) { return !skip(m); });
    var mods = myMods.concat(thMods);
    if (mods.length) {
      h.nmReset();
      /* m6 (text audit item 5): every edge names whose it is, as the result box's edges line does ("Martínez +3: ...", never an unnamed "+3" that reads as yours) */
      var me = o.actor ? first(o.actor) : null, them = o.foil ? first(o.foil) : null;
      var strip = function (who, t) { t = String(t || ''); return who && t.indexOf(who + ' ') === 0 && !/^\S+ (is|was|has|had) /.test(t) ? t.slice(who.length + 1) : t; };
      var line = function (who, m) { return (who ? who + ' ' : '') + (m.n > 0 ? '+' : '') + m.n + ': ' + strip(who, m.why); };
      s += '<span class="ld-mods">' + myMods.map(function (m) { return h.nm(line(me, m)); }).concat(thMods.map(function (m) { return h.nm(line(them, m)); })).join('<br>') + '</span>';
    } else if (o.bonus && !(o.mods || []).length) {
      s += '<span class="ld-mods">' + h.nm((o.bonus > 0 ? '+' : '') + o.bonus + ': ' + (o.because || 'the safer option')) + '</span>';
    }
    if (o.unlockNote) { h.nmReset(); s += '<span class="ld-unl">&#9733; ' + h.nm(o.unlockNote) + '</span>'; }
    if (h.bvDetails) { h.nmReset(); s += h.bvDetails(o); }  // cl1
    return s;
  }

  function canHover() {
    try { return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { return true; }
  }
  /* mouse: hover opens the details, a click plays the card. Touch: the
   * first tap opens the details and says so, the second tap plays it. */
  function wire(box, choose) {
    var hover = canHover();
    box.classList.toggle('lean-touch', !hover);
    /* one class per selector, so the page's DOM shim can run it too */
    Array.prototype.slice.call(box.querySelectorAll('.lean')).forEach(function (el) {
      var w = (el.closest && el.closest('.lean-w')) || el.parentNode;
      el.onclick = function (e) {
        if (el.disabled || el.classList.contains('dead')) return;
        if (!hover && !w.classList.contains('open')) {
          Array.prototype.slice.call(box.querySelectorAll('.lean-w')).forEach(function (x) { x.classList.remove('open'); });
          w.classList.add('open');
          if (e && e.stopPropagation) e.stopPropagation();
          return;
        }
        choose(el, e);
      };
    });
  }

  var API = { card: card, wire: wire, rows: rows, canHover: canHover, sevRank: sevRank, greyText: greyText, fullSev: fullSev, isLoss: isLoss };
  root.KMObLean = API;
})(typeof window !== 'undefined' ? window : globalThis);
