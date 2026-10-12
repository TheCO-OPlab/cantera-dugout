/* glossary.js (kmtree5 a4, helper P, note 17): ONE GLOSSARY AND ONE POPUP FOR EVERY WORD THE GAME USES AS A TERM.
 *
 * Eduardo (playtest of a3): "Tooltips for Build-up, Belief, the 7 stats, Captain, Captain's shadow". The words were
 * defined in four places and shown in none: archetypes.js COUNTER_WORDS (Belief, Build-up) was exported and never
 * used, cup.js STAT_LINES appeared only on the Belief question, and a `title` works with a mouse only.
 *
 * The terms (built once from the game's own sources, so a new piece or effect is in the glossary without an edit here):
 *   Belief, Build-up                      archetypes.js COUNTER_WORDS
 *   the seven stats                       cup.js STAT_LINES
 *   the keeper's stats                    written here (attributes.js has flavour, not a definition)
 *   Captain (and "captain")               written here, from cup.js (CAPTAIN, swapRefusal, the captain pieces)
 *   every piece and trait                 cup.js PIECES and PLAIN: its name (nameOf) and its own sentence (sentence)
 *   the opponent effects                  opponents.js list(): name and sentence
 * Counter chips (#k5counters .k5c) carry their live sentence (data-gdef, set by the page) and use the same popup.
 *
 * On the page: every text node under <body> is read (and every one added later, by a MutationObserver), and each
 * term in it is wrapped in <span class="gterm" data-g="key" tabindex="0">. The popup (#gpop) opens on hover with a
 * mouse, on keyboard focus, and on a tap on a touch screen (the tap does not play the card it is on; a second tap
 * elsewhere on the card does). Never inside <select>, <option>, <textarea>, <input>, <script>, <style>, SVG, or an
 * element marked data-noterm. KMGlossary.wordsHTML() is the "Words" list the "?" legend shows.
 *
 * Matching: whole words, case as written (a name is a name: "Belief" is the counter, "belief" in "Their belief" is
 * not), longest first ("Captain's shadow" before "Captain"); "captain" in lower case is the Captain too.
 * ?pbreak=noglossary: nothing is wrapped (p_glosscheck.js must fail). ?pbreak=glosscards: nothing inside #cards is.
 * Words only: it reads the game, it changes nothing in it. */
(function (root) {
  'use strict';
  var BRK = (function () { try { return (/[?&]pbreak=(\w+)/.exec((root.location && root.location.search) || '') || [])[1] || ''; } catch (e) { return ''; } })();
  var KEEPER = {
    reflexes: 'Reflexes (a keeper\'s stat): stopping shots. Your keeper\'s Reflexes are his number when he tries to save.',
    communication: 'Communication (a keeper\'s stat): organising the defenders in front of him, and coming for crosses.',
    distribution: 'Distribution (a keeper\'s stat): his passes and kicks when he has the ball.',
    physique: 'Physique (a keeper\'s stat): his strength and reach, in the air and against a man.'
  };
  var CAPTAIN_DEF = function (cap) {
    return 'Captain: your captain (' + cap + '). He always stays in the eleven. A Captain piece works through him, and you hold one at a time; Captain\'s shadow makes it work twice.';
  };
  var E = null, RE = null, BYKEY = {};
  function A() { return root.KMArchetypes || null; }
  function CUP() { return root.KMCup || null; }
  function OPS() { return root.KMOpponents || null; }
  function add(list, key, term, def, kind, extra) {
    if (!term || !def || BYKEY[key]) return;
    def = String(def); def = def.charAt(0).toUpperCase() + def.slice(1);
    var e = { key: key, term: String(term), def: def, kind: kind };
    BYKEY[key] = e; list.push(e);
    (extra || []).forEach(function (t) { list.push({ key: key, term: t, def: e.def, kind: kind, alias: true }); });
  }
  /* the definition without its own name in front ("Belief: your team's ..." -> shown under the name) */
  function body(term, def) { var d = String(def || ''); return d.indexOf(term + ': ') === 0 ? d.slice(term.length + 2) : d; }
  function build() {
    if (E) return E;
    var L = [], AR = A(), C = CUP(), O = OPS();
    var cw = (AR && AR.COUNTER_WORDS) || {};
    add(L, 'belief', 'Belief', body('Belief', cw.belief || 'Belief: your team\'s belief in this match. Each point is +1 to the stat you chose for it.'), 'counter');
    add(L, 'buildup', 'Build-up', body('Build-up', cw.buildup || 'Build-up: what your team has built in this moment. Each point is +1 on every card that can score.'), 'counter');
    var SL = (C && C.STAT_LINES) || {}, SN = (C && C.STAT_NAME) || {};
    Object.keys(SL).forEach(function (k) { add(L, 'stat:' + k, SN[k] || k, body(SN[k] || k, SL[k]), 'stat'); });
    Object.keys(KEEPER).forEach(function (k) { add(L, 'stat:' + k, (SN[k] || (k.charAt(0).toUpperCase() + k.slice(1))), body(SN[k] || k, KEEPER[k]).replace(/^[A-Z][a-z]+ \(a keeper's stat\): /, 'A keeper\'s stat: '), 'stat'); });
    var cap = (C && C.CAPTAIN) || 'Rodri';
    add(L, 'captain', 'Captain', body('Captain', CAPTAIN_DEF(cap)), 'captain', ['captain']);
    if (C && C.PIECES) {
      C.PIECES.concat(C.PLAIN || []).forEach(function (p) {
        var nm = C.nameOf ? C.nameOf(p.id) : p.name;
        if (!nm || /^[+-]\d/.test(nm)) return;   /* "+1 Pace" is a sentence, not a name */
        var s = C.sentence ? C.sentence(p) : p.text;
        var kind = p.kind === 'trait' ? 'player trait' : p.kind === 'captain' ? 'Captain piece' : p.kind === 'tactic' ? 'tactic' : 'piece';
        add(L, 'piece:' + p.id, nm, s, kind);
      });
    }
    if (O && O.list) O.list().forEach(function (o) { add(L, 'op:' + o.id, o.name, o.text, 'their effect'); });
    /* longest first, so "Captain's shadow" is found before "Captain" */
    L.sort(function (a, b) { return b.term.length - a.term.length; });
    E = L;
    var esc = function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    RE = new RegExp('(^|[^A-Za-zÀ-ɏ0-9\'’-])(' + L.map(function (e) { return esc(e.term); }).join('|') + ')(?![A-Za-zÀ-ɏ0-9’-]|\'(?!s\\b)[A-Za-z])', 'g');
    return E;
  }
  function entries() { return build().filter(function (e) { return !e.alias; }); }
  function termsAll() { return build().map(function (e) { return { key: e.key, term: e.term }; }); }
  function lookup(t) { build(); for (var i = 0; i < E.length; i++) if (E[i].term === t) return E[i]; return null; }
  function byKey(k) { build(); return BYKEY[k] || null; }

  /* ------------------------------------------------------------ wrapping */
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1, TITLE: 1, svg: 1, SVG: 1, CANVAS: 1 };
  function skipEl(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP[n.nodeName] || n.namespaceURI === 'http://www.w3.org/2000/svg') return true;
      if (n.classList && (n.classList.contains('gterm') || n.id === 'gpop')) return true;
      if (n.getAttribute && n.getAttribute('data-noterm') != null) return true;
      if (n.isContentEditable) return true;
      if (BRK === 'glosscards' && n.id === 'cards') return true;
    }
    return false;
  }
  function wrapText(tn) {
    var s = tn.nodeValue;
    if (!s || s.length < 4) return;
    RE.lastIndex = 0;
    if (!RE.test(s)) return;
    if (!tn.parentNode || skipEl(tn.parentNode)) return;
    RE.lastIndex = 0;
    var doc = tn.ownerDocument, frag = doc.createDocumentFragment(), last = 0, m;
    while ((m = RE.exec(s))) {
      var at = m.index + m[1].length, e = lookup(m[2]);
      if (!e) continue;
      if (at > last) frag.appendChild(doc.createTextNode(s.slice(last, at)));
      var sp = doc.createElement('span');
      sp.className = 'gterm'; sp.setAttribute('data-g', e.key); sp.setAttribute('tabindex', '0'); sp.setAttribute('role', 'button');
      sp.setAttribute('aria-label', e.term + ': what it means');
      sp.textContent = m[2];
      frag.appendChild(sp);
      last = at + m[2].length;
      RE.lastIndex = last;
    }
    if (last === 0) return;
    if (last < s.length) frag.appendChild(doc.createTextNode(s.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  }
  function apply(el) {
    if (BRK === 'noglossary' || !el) return;
    build();
    if (!E.length) return;
    if (el.nodeType === 3) { wrapText(el); return; }
    if (el.nodeType !== 1 || skipEl(el)) return;
    var doc = el.ownerDocument || root.document, tw = doc.createTreeWalker(el, 4, null, false), list = [], n;
    while ((n = tw.nextNode())) list.push(n);
    list.forEach(wrapText);
    /* the counter chips: their own live sentence in the popup */
    if (el.querySelectorAll) Array.prototype.forEach.call(el.querySelectorAll('.k5c[title]:not([data-gdef])'), chipDef);
    if (el.classList && el.classList.contains('k5c') && !el.getAttribute('data-gdef')) chipDef(el);
  }
  function chipDef(c) {
    var t = c.getAttribute('title'); if (!t || BRK === 'nochips') return;
    c.setAttribute('data-gdef', t); c.setAttribute('tabindex', '0'); c.classList.add('gchipdef');
  }

  /* ------------------------------------------------------------ the popup */
  var POP = null, lastType = 'mouse', openFor = null;
  function pop() {
    if (POP) return POP;
    var d = root.document;
    POP = d.createElement('div'); POP.id = 'gpop'; POP.setAttribute('role', 'tooltip'); POP.setAttribute('data-noterm', '');
    d.body.appendChild(POP);
    return POP;
  }
  function defOf(el) {
    if (el.getAttribute('data-gdef')) return { term: (el.querySelector && el.querySelector('.gterm') ? '' : ''), head: null, def: el.getAttribute('data-gdef') };
    var e = byKey(el.getAttribute('data-g'));
    return e ? { head: e.term + (e.kind === 'counter' || e.kind === 'stat' || e.kind === 'captain' ? '' : ' (' + e.kind + ')'), def: e.def } : null;
  }
  var openedAt = 0, openedBy = null;
  function show(el, how) {
    openedAt = Date.now(); openedBy = how || 'other';
    var d = defOf(el); if (!d) return;
    var p = pop();
    p.innerHTML = '';
    if (d.head) { var b = root.document.createElement('b'); b.textContent = d.head; p.appendChild(b); }
    var s = root.document.createElement('span'); s.textContent = d.def; p.appendChild(s);
    p.className = 'on';
    openFor = el;
    var r = el.getBoundingClientRect(), vw = root.innerWidth || 1024, vh = root.innerHeight || 768;
    p.style.left = '0px'; p.style.top = '0px';
    var w = Math.min(320, vw - 16); p.style.maxWidth = w + 'px';
    var pw = p.offsetWidth || w, ph = p.offsetHeight || 60;
    var x = Math.max(8, Math.min(vw - pw - 8, r.left + r.width / 2 - pw / 2));
    var y = r.bottom + 6; if (y + ph > vh - 4) y = Math.max(4, r.top - ph - 6);
    p.style.left = Math.round(x + (root.scrollX || 0)) + 'px'; p.style.top = Math.round(y + (root.scrollY || 0)) + 'px';
  }
  function hide() { if (POP) POP.className = ''; openFor = null; }
  function termOf(t) { for (var n = t; n && n.nodeType === 1; n = n.parentNode) { if (n.classList && (n.classList.contains('gterm') || n.classList.contains('gchipdef'))) return n; } return null; }
  function wire() {
    var d = root.document;
    d.addEventListener('pointerdown', function (e) { lastType = e.pointerType || 'mouse'; }, true);
    d.addEventListener('mouseover', function (e) { if (lastType !== 'mouse') return; var t = termOf(e.target); if (t) show(t); }, true);
    d.addEventListener('mouseout', function (e) { if (lastType !== 'mouse') return; var t = termOf(e.target); if (t && openFor === t && !(e.relatedTarget && t.contains(e.relatedTarget))) hide(); }, true);
    d.addEventListener('focusin', function (e) { var t = termOf(e.target); if (t && openFor !== t) show(t, 'focus'); }, true);
    d.addEventListener('focusout', function (e) { var t = termOf(e.target); if (t && openFor === t) hide(); }, true);
    /* a tap on a term (touch or pen) opens its popup and goes no further: it never plays the card it is on */
    d.addEventListener('click', function (e) {
      var t = termOf(e.target);
      if (!t) { if (openFor && lastType !== 'mouse') hide(); return; }
      if (lastType === 'mouse') return;
      e.stopPropagation(); e.preventDefault();
      /* a4 (the a4 review's blocker): a tap focuses the word first, and focus opens it; that same tap's click must
       * not then close it. A click within 600 ms of a focus-open of the same word keeps it open; a later tap on the
       * open word closes it. ?pbreak=taptoggle brings a3-a4's toggle back (p_glosscheck G5 must fail). */
      if (openFor === t && (BRK === 'taptoggle' || !(openedBy === 'focus' && Date.now() - openedAt < 600))) hide();
      else if (openFor !== t) show(t, 'tap');
      else openedBy = 'tap';
    }, true);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); }, true);
    root.addEventListener('scroll', function () { if (openFor) hide(); }, true);
  }
  /* ------------------------------------------------------------ the "Words" list for "?" */
  function wordsHTML() {
    var L = entries().slice().sort(function (a, b) { return a.term.localeCompare(b.term); });
    var ORDER = ['counter', 'stat', 'captain', 'tactic', 'Captain piece', 'player trait', 'piece', 'their effect'];
    var HEAD = { counter: 'Counters', stat: 'Stats', captain: 'Captain', tactic: 'Tactics', 'Captain piece': 'Captain pieces', 'player trait': 'Player traits', piece: 'Other pieces', 'their effect': 'Their effects' };
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    return '<div class="gwords" data-noterm=""><p class="gwh">Words</p>' + ORDER.map(function (k) {
      var g = L.filter(function (e) { return e.kind === k; });
      if (!g.length) return '';
      return '<p class="gwk">' + HEAD[k] + '</p><dl>' + g.map(function (e) { return '<dt>' + esc(e.term) + '</dt><dd>' + esc(e.def) + '</dd>'; }).join('') + '</dl>';
    }).join('') + '</div>';
  }
  function css() {
    var d = root.document; if (d.getElementById('gcss')) return;
    var el = d.createElement('style'); el.id = 'gcss';
    el.textContent = '.gterm{text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:2px;cursor:help}' +
      '.gchipdef{cursor:help}' +
      '#gpop{position:absolute;z-index:9999;display:none;max-width:320px;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#8886);' +
      'background:var(--surface,#fff);color:var(--ink,#111);font:400 13px/1.4 ui-sans-serif,system-ui;box-shadow:0 6px 20px #0003;text-transform:none;letter-spacing:0;pointer-events:none}' +
      '#gpop.on{display:block} #gpop b{display:block;margin-bottom:2px;font-weight:700}' +
      '.gwords{margin-top:10px;border-top:1px solid var(--line,#8886);padding-top:6px;font-size:13px;line-height:1.4;max-height:50vh;overflow:auto}' +
      '.gwords .gwh{font-weight:800;margin:0 0 4px} .gwords .gwk{font-weight:700;margin:8px 0 2px;color:var(--muted,#666)}' +
      '.gwords dl{margin:0} .gwords dt{font-weight:700;margin-top:4px} .gwords dd{margin:0 0 2px}';
    d.head.appendChild(el);
  }
  var started = false, queue = [], raf = 0;
  function flush() { raf = 0; var q = queue; queue = []; q.forEach(function (n) { if (n.isConnected !== false) apply(n); }); }
  function start() {
    if (started || !root.document || !root.document.body) return;
    /* a page shim (the node checks' DOM stand-in) has no events or tree walker: nothing to do there */
    if (typeof root.document.addEventListener !== 'function' || typeof root.document.createTreeWalker !== 'function' || typeof root.addEventListener !== 'function') return;
    started = true;
    css(); wire();
    apply(root.document.body);
    if (root.MutationObserver) {
      new root.MutationObserver(function (ms) {
        ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes || [], function (n) { if (n.nodeType === 1 || n.nodeType === 3) queue.push(n); }); });
        if (queue.length && !raf) raf = (root.requestAnimationFrame || setTimeout)(flush);
      }).observe(root.document.body, { childList: true, subtree: true });
    }
  }
  if (root.document && root.addEventListener) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  }
  var API = { build: build, entries: entries, termsAll: termsAll, lookup: lookup, byKey: byKey, apply: apply, wordsHTML: wordsHTML, start: start, show: show, hide: hide, BRK: BRK };
  root.KMGlossary = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
