/* art2: THE LOOKS. A theme layer over m2's page: one CSS file per look
 * (theme-<id>.css) that restyles m2's own classes and tokens, never its
 * markup or its layout, so any look can be laid over lay1's layout later.
 *
 *   ?look=programme | cards | broadcast | chalk   (or ?look=none for m2 as it was)
 *   Settings > Look switches it live and remembers it.
 *
 * Each look also names the pitch renderer it wants (art1's Tabletop,
 * Broadcast or Tactics board); an explicit ?style= still wins.
 *
 * The one thing a look adds that CSS cannot do alone: the Trading cards
 * look gives every option card a portrait of the man who plays it (a small
 * creature drawn from his initials and his kit, as an SVG background) and a
 * data-kind for the kind of move (shot, pass, run, defend), which sets the
 * card's rarity edge. Both are attributes and a CSS variable: no text is
 * added to the page, so the word count is m2's. The portrait is drawn for
 * every look, and only the Trading cards CSS shows it. */
(function (root) {
  'use strict';
  var doc = root.document;
  var LOOKS = {
    none: { name: 'Plain (m2 as it was)', pitch: null },
    programme: { name: 'Matchday programme', pitch: 'tabletop' },
    cards: { name: 'Trading cards', pitch: 'tabletop' },
    broadcast: { name: 'Night broadcast', pitch: 'broadcast' },
    chalk: { name: 'Dugout chalkboard', pitch: 'tactics' }
  };
  var KEY = 'cantera-art2-look';
  var DEFAULT = 'broadcast';

  function fromUrl() {
    var m = /[?&]look=([a-z]+)/.exec((root.location && root.location.search) || '');
    return m && LOOKS[m[1]] ? m[1] : null;
  }
  var look = fromUrl(), saved = null;
  try { saved = root.localStorage.getItem(KEY); } catch (e) { }
  if (!look) look = LOOKS[saved] ? saved : DEFAULT;
  else { try { root.localStorage.setItem(KEY, look); } catch (e) { } }

  /* light or dark, as one attribute the themes can key on: ?theme= wins
   * (the page sets data-theme from it too), else the system setting */
  var MODE = (function () { var m = /[?&]theme=(light|dark)\b/.exec((root.location && root.location.search) || ''); return m ? m[1] : null; })();
  /* the node DOM shim the page checks use has no <html> or <head>: then the
   * looks stay off and only the API below exists */
  var HTML = doc && doc.documentElement && doc.documentElement.setAttribute ? doc.documentElement : null;
  var HEAD = doc && doc.head && doc.head.appendChild ? doc.head : null;
  function setMode() {
    if (!HTML) return;
    var dark = MODE ? MODE === 'dark' : !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    HTML.setAttribute('data-mode', dark ? 'dark' : 'light');
  }
  setMode();
  try { root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setMode); } catch (e) { }

  /* two stylesheets: theme-base.css (routes m2's fonts to the look's
   * variables) and theme-<look>.css; both inert without data-look */
  var link = null;
  function apply(id) {
    look = LOOKS[id] ? id : DEFAULT;
    var html = HTML;
    if (!html || !HEAD) return;
    if (look === 'none') html.removeAttribute('data-look'); else html.setAttribute('data-look', look);
    if (!link) {
      var base = doc.createElement('link'); base.rel = 'stylesheet'; base.id = 'art2-base'; base.href = './theme-base.css'; HEAD.appendChild(base);
      link = doc.createElement('link'); link.rel = 'stylesheet'; link.id = 'art2-theme'; HEAD.appendChild(link);
    }
    if (look === 'none') link.removeAttribute('href'); else link.setAttribute('href', './theme-' + look + '.css');
  }
  apply(look);

  /* ------------------------------------------------ the portraits */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function initials(name) {
    var w = String(name).replace(/[^\p{L} '-]/gu, '').trim().split(/[\s-]+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0][0]).toUpperCase();
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function cssVar(n) { try { return getComputedStyle(doc.body).getPropertyValue(n).trim(); } catch (e) { return ''; } }
  /* a small creature in the kit: fur, ears and eyes vary by name, the shirt
   * is the kit (Argentina's has its white stripes), the initials sit on a
   * badge on the chest. Drawn as an SVG data URI, never as page text. */
  function portrait(name, side) {
    var b = doc.body, team = b.classList.contains(side + '-argentina') ? 'argentina' : b.classList.contains(side + '-spain') ? 'spain' : 'rnd';
    var kit = cssVar('--kit-' + side) || (side === 'you' ? '#1f5fbf' : '#f0a030');
    var h = hash(name), FUR = ['#e8b98a', '#c98a5a', '#8a6248', '#d9d2c5', '#5b4a42', '#f1dcc0', '#b7a79a', '#e2a25f'];
    var fur = FUR[h % FUR.length], fur2 = FUR[(h >>> 3) % FUR.length], ear = (h >>> 6) % 3, eye = (h >>> 8) % 3, bg = (h >>> 10) % 4;
    var BG = [['#fff4d6', '#ffd98a'], ['#e3f1ff', '#a9cff5'], ['#f4e6ff', '#cfa8f0'], ['#e4f7e8', '#9fdcae']][bg];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 72">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + BG[0] + '"/><stop offset="1" stop-color="' + BG[1] + '"/></linearGradient>' +
      '<pattern id="st" width="8" height="72" patternUnits="userSpaceOnUse"><rect width="8" height="72" fill="' + kit + '"/><rect x="4" width="3" height="72" fill="#fff"/></pattern></defs>' +
      '<rect width="60" height="72" fill="url(#g)"/>' +
      '<circle cx="30" cy="30" r="26" fill="#fff" opacity=".35"/>';
    /* ears */
    if (ear === 0) s += '<path d="M13 22 L16 5 L27 16Z M47 22 L44 5 L33 16Z" fill="' + fur + '" stroke="#2a2217" stroke-width="1.6" stroke-linejoin="round"/>';
    else if (ear === 1) s += '<ellipse cx="15" cy="15" rx="7" ry="9" fill="' + fur + '" stroke="#2a2217" stroke-width="1.6"/><ellipse cx="45" cy="15" rx="7" ry="9" fill="' + fur + '" stroke="#2a2217" stroke-width="1.6"/>';
    else s += '<path d="M12 26 Q6 10 22 14Z M48 26 Q54 10 38 14Z" fill="' + fur + '" stroke="#2a2217" stroke-width="1.6" stroke-linejoin="round"/>';
    /* shirt */
    s += '<path d="M6 72 Q8 52 30 50 Q52 52 54 72Z" fill="' + (team === 'argentina' ? 'url(#st)' : kit) + '" stroke="#2a2217" stroke-width="1.6"/>';
    /* head */
    s += '<ellipse cx="30" cy="31" rx="17" ry="16" fill="' + fur + '" stroke="#2a2217" stroke-width="1.6"/>' +
      '<ellipse cx="30" cy="38" rx="8" ry="5.5" fill="' + fur2 + '" opacity=".75"/>';
    /* eyes */
    if (eye === 0) s += '<circle cx="23.5" cy="29" r="2.6" fill="#2a2217"/><circle cx="36.5" cy="29" r="2.6" fill="#2a2217"/><circle cx="24.3" cy="28.2" r=".9" fill="#fff"/><circle cx="37.3" cy="28.2" r=".9" fill="#fff"/>';
    else if (eye === 1) s += '<path d="M20.5 29.5 Q23.5 26 26.5 29.5 M33.5 29.5 Q36.5 26 39.5 29.5" fill="none" stroke="#2a2217" stroke-width="2" stroke-linecap="round"/>';
    else s += '<ellipse cx="23.5" cy="29" rx="2" ry="3" fill="#2a2217"/><ellipse cx="36.5" cy="29" rx="2" ry="3" fill="#2a2217"/>';
    s += '<path d="M28 35 L32 35 L30 37.5Z" fill="#2a2217"/><path d="M26.5 39.5 Q30 42 33.5 39.5" fill="none" stroke="#2a2217" stroke-width="1.4" stroke-linecap="round"/>';
    /* the badge with the initials */
    s += '<circle cx="30" cy="61" r="7.2" fill="#fff" stroke="#2a2217" stroke-width="1.4"/>' +
      '<text x="30" y="64.2" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="800" font-size="' + (initials(name).length > 1 ? 7.4 : 9) + '" fill="#2a2217">' + esc(initials(name)) + '</text></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  }
  /* the kind of move, from the words on the card (the first verb after the
   * man's name); rarity edge: shot gold, run purple, pass blue, defend steel */
  function kindOf(label) {
    var t = ' ' + label.toLowerCase() + ' ';
    if (/ (tackl|block|blocks|press|presses|closes|fouls|foul|drops|marks|intercept|clears|stays|holds his|comes off|comes out|jockey|stands|tracks|slides|goes to ground|keeps his line|on his line|dives|punches|catches|saves)/.test(t)) return 'defend';
    if (/ (shoot|shoots|shot|heads|header|volley|volleys|curls|chips|lobs|places|hits it|goes for goal|smashes|penalty|side-foots)/.test(t)) return 'shot';
    if (/ (runs|run |dribbl|takes on|beats|carries|goes past|skips|drives|turns|spins|cuts inside|goes round|sprints)/.test(t)) return 'run';
    if (/ (pass|passes|cross|crosses|cuts it|switch|plays|gives|lays|finds|through|long ball|one-two|chips it|squares|slips|knocks|clips|feeds|backheel|hooks)/.test(t)) return 'pass';
    return 'plain';
  }
  function decorate(box) {
    if (!box || !box.querySelectorAll) return;
    Array.prototype.slice.call(box.querySelectorAll('.opt')).forEach(function (el) {
      if (el.getAttribute('data-kind')) return;
      var head = el.querySelector('b, .lact') || el, pl = head.querySelector('.pl');
      el.setAttribute('data-kind', kindOf(head.textContent || ''));
      if (pl) {
        var side = pl.classList.contains('them') ? 'them' : 'you';
        el.style.setProperty('--portrait', portrait(pl.textContent, side));
        el.setAttribute('data-side', side);
      }
    });
  }
  function watch() {
    var cards = doc.getElementById('cards');
    decorate(cards);
  }
  if (root.MutationObserver && HTML) {
    var mo = new root.MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.closest && (t.id === 'cards' || t.closest('#cards'))) { watch(); return; }
        if (t && t.id === 'stage') { watch(); return; }
      }
    });
    var start = function () { mo.observe(doc.body, { childList: true, subtree: true }); watch(); };
    if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
  }

  /* ------------------------------------------------ Settings > Look */
  function wireSettings() {
    var grp = doc.getElementById('lookpick');
    if (!grp) return;
    Array.prototype.slice.call(grp.querySelectorAll('input')).forEach(function (el) {
      el.checked = el.value === look;
      el.onchange = function () {
        if (!el.checked) return;
        apply(el.value);
        try { root.localStorage.setItem(KEY, look); } catch (e) { }
        var p = LOOKS[look].pitch || 'tabletop';
        if (root.__art2Pitch) root.__art2Pitch(p);
        watch();
      };
    });
  }
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wireSettings); else if (doc && doc.getElementById) wireSettings();

  root.Art2Looks = {
    look: function () { return look; },
    pitch: function () { return LOOKS[look] ? LOOKS[look].pitch : null; },
    list: LOOKS, portrait: portrait, kindOf: kindOf, apply: apply
  };
})(typeof window !== 'undefined' ? window : globalThis);
