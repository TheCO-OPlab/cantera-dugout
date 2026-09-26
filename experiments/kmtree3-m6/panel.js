/* m1: FOLDED BY DEFAULT to one row (possession as a bar with both shares,
 * and the shots, yours first like the score), which opens into the whole
 * panel below. opts.folded (default true), opts.onFold(open) so the page can
 * make room. Otherwise st1's panel as it was.
 *
 * st1: THE STATS PANEL. A small block that sits under the pitch (about 400 px
 * wide) and grows as the match advances. Browser only.
 *
 *   var P = KMStatsPanel.create(hostEl, { names: {you:'Spain', them:'Argentina'},
 *                                         onHeat: function (team|null) {} });
 *   P.update(KMStats.summary(stats));   // numbers count up to their new values
 *   P.setHeat('you' | 'them' | null);   // the heatmap toggle, from outside
 *   KMStatsPanel.drawHeat(canvas, summary.heat.you, '#1f5fbf');
 *   KMStatsPanel.heatLegendHTML('Spain')
 *
 * Shown by default: possession as one thin bar, three numbers for each team
 * (shots, on target, passes completed), and a strip along the 90 minutes with
 * one icon per moment (yours above the line, theirs below) plus the latest
 * one in words. On demand: "More" (the parts behind every number: minutes of
 * possession, passes completed of attempted, corners, fouls, ball won) and
 * the heatmap, which is drawn ON the pitch rather than as another chart.
 *
 * Colours: one hue per team (blue for you, orange for them, both checked for
 * colour-blind separation), numbers and words always in ink; the icons keep
 * call3's meaning colours (green good for you, red bad, grey neither) and
 * their shapes, so nothing depends on colour alone.
 */
(function (root) {
  'use strict';
  var CSS = [
    '.sp{--st-you:#1f5fbf;--st-them:#c26a12;font:13px/1.4 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;color:var(--ink,#12160f);',
    '  background:var(--surface,#fff);border:1px solid var(--line,#dbe0d3);border-radius:13px;padding:10px 12px 10px}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .sp{--st-you:#4c86e0;--st-them:#d07a30}}',
    ':root[data-theme="dark"] .sp{--st-you:#4c86e0;--st-them:#d07a30}',
    '.sp *{box-sizing:border-box}',
    '.sp-head{display:flex;align-items:center;gap:8px;margin:0 0 8px}',
    '.sp-head h2{margin:0;font:700 11px ui-sans-serif,system-ui;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2,#4d5347)}',
    '.sp-min{font:600 12px ui-monospace,monospace;color:var(--muted,#868c7c);font-variant-numeric:tabular-nums}',
    '.sp-btn{font:600 12px ui-sans-serif,system-ui;padding:3px 9px;border-radius:7px;cursor:pointer;border:1px solid var(--line,#dbe0d3);',
    '  background:var(--surface-2,#eef1ea);color:var(--ink-2,#4d5347)}',
    '.sp-btn:hover{border-color:var(--ink-2,#4d5347)}',
    '.sp-btn[aria-pressed="true"]{background:var(--ink,#12160f);color:var(--surface,#fff);border-color:var(--ink,#12160f)}',
    '.sp-head .sp-btn{margin-left:auto}',
    /* possession */
    '.sp-noposs .sp-bar i,.sp-noposs .sp-mini i{opacity:.28}',
    '.sp-poss{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px}',
    '.sp-poss .v{font:700 13px ui-sans-serif,system-ui;font-variant-numeric:tabular-nums;min-width:34px}',
    '.sp-poss .v.r{text-align:right}',
    '.sp-bar{display:flex;height:8px;gap:2px}',
    '.sp-bar i{display:block;height:100%;transition:flex-grow .6s cubic-bezier(.3,.1,.2,1)}',
    '.sp-bar i.y{background:var(--st-you);border-radius:4px 0 0 4px}',
    '.sp-bar i.t{background:var(--st-them);border-radius:0 4px 4px 0}',
    '.sp-cap{display:flex;justify-content:space-between;font-size:11px;color:var(--muted,#868c7c);margin:1px 0 0}',
    /* the three numbers */
    '.sp-nums{width:100%;border-collapse:collapse;margin:8px 0 2px;table-layout:fixed}',
    '.sp-nums th{font:600 11px ui-sans-serif,system-ui;color:var(--muted,#868c7c);text-align:right;padding:0 0 2px;border:0;letter-spacing:0;text-transform:none}',
    '.sp-nums th:first-child{text-align:left;width:38%}',
    '.sp-nums td{padding:2px 0;text-align:right;font:600 15px ui-sans-serif,system-ui;font-variant-numeric:tabular-nums;border:0}',
    '.sp-nums td:first-child{text-align:left;font:600 13px ui-sans-serif,system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sp-nums td b{font-weight:800}',
    '.sp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:0}',
    '.sp-dot.y{background:var(--st-you)} .sp-dot.t{background:var(--st-them)}',
    '.sp-n{display:inline-block;border-radius:5px;padding:0 3px}',
    '.sp-n.bump{animation:sp-bump .9s ease-out}',
    '@keyframes sp-bump{0%{background:color-mix(in srgb,var(--gold,#b8860b) 38%,transparent)}100%{background:transparent}}',
    /* the timeline */
    '.sp-tl{position:relative;height:64px;margin:8px 0 0 14px}',
    '.sp-tl .ax{position:absolute;left:0;right:0;top:22px;height:2px;background:var(--line,#dbe0d3);border-radius:1px}',
    '.sp-tl .done{position:absolute;left:0;top:22px;height:2px;background:var(--ink-2,#4d5347);border-radius:1px;transition:width .4s linear}',
    '.sp-tl .tk{position:absolute;top:4px;width:1px;height:40px;background:var(--line,#dbe0d3)}',
    '.sp-tl .lane{position:absolute;left:-14px;width:7px;height:7px;border-radius:50%}',
    '.sp-tl .lane.y{top:7px;background:var(--st-you)} .sp-tl .lane.t{top:32px;background:var(--st-them)}',
    '.sp-tl .mk{position:absolute;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;',
    '  width:20px;height:20px;border-radius:50%;background:var(--surface,#fff);cursor:default;padding:0;border:0;color:inherit}',
    '.sp-tl .mk.y{top:0} .sp-tl .mk.t{top:26px}',
    '.sp-tl .mk .oi{width:14px;height:14px;stroke-width:2.2;vertical-align:0}',
    '.sp-tl .mk.goal{box-shadow:0 0 0 2px var(--surface,#fff),0 0 0 3.5px currentColor}',
    '.sp-tl .mk.goal .oi{width:15px;height:15px}',
    '.sp-tl .mk.new{animation:sp-pop .45s cubic-bezier(.3,1.6,.5,1)}',
    '.sp-tl .mk:focus-visible{outline:2px solid var(--ink,#12160f);outline-offset:1px}',
    '@keyframes sp-pop{0%{transform:translateX(-50%) scale(.2)}100%{transform:translateX(-50%) scale(1)}}',
    '.sp-tl .lb{position:absolute;top:51px;font:600 10px ui-monospace,monospace;color:var(--muted,#868c7c);transform:translateX(-50%)}',
    '.sp-tl .lb.s{transform:none} .sp-tl .lb.e{transform:translateX(-100%)}',
    '.sp-last{display:flex;align-items:center;gap:6px;min-height:20px;margin:4px 0 0;font-size:13px;color:var(--ink,#12160f)}',
    '.sp-last .m{font:600 12px ui-monospace,monospace;color:var(--muted,#868c7c)}',
    '.sp-last .oi{width:15px;height:15px}',
    '.sp-last .w{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sp-last .ch{color:var(--ink-2,#4d5347)}',
    /* footer */
    '.sp-foot{display:flex;align-items:center;gap:5px;margin-top:9px;padding-top:8px;border-top:1px solid var(--line,#dbe0d3);flex-wrap:wrap}',
    '.sp-foot .lbl{font-size:12px;color:var(--ink-2,#4d5347);margin-right:2px}',
    '.sp-foot .sp-more-btn{margin-left:auto}',
    '.sp-more{margin-top:8px}',
    '.sp-more table{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}',
    '.sp-more th{font:600 11px ui-sans-serif,system-ui;color:var(--muted,#868c7c);text-align:right;padding:0 0 3px;border-bottom:1px solid var(--line,#dbe0d3);text-transform:none;letter-spacing:0}',
    '.sp-more th:first-child{text-align:left;width:44%}',
    '.sp-more td{padding:3px 0;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--line,#dbe0d3);color:var(--ink,#12160f)}',
    '.sp-more td:first-child{text-align:left;color:var(--ink-2,#4d5347)}',
    '.sp-more .note{font-size:11.5px;color:var(--muted,#868c7c);margin:6px 0 0}',
    '.sp.collapsed .sp-body{display:none}',
    '.sp.collapsed .sp-head{margin:0}',
    '.sp.collapsed{padding:6px 10px}',
    '.sp.collapsed .sp-head h2,.sp.collapsed .sp-min{display:none}',
    '.sp-sum{display:none;flex:1 1 auto;min-width:0;align-items:center;gap:6px;font:600 12px ui-sans-serif,system-ui;color:var(--ink-2,#4d5347);white-space:nowrap}',
    '.sp.collapsed .sp-sum{display:flex}',
    '.sp-sum b{font:700 12.5px ui-sans-serif,system-ui;color:var(--ink,#12160f);font-variant-numeric:tabular-nums}',
    '.sp-sum .sp-sh{margin-left:6px;padding-left:8px;border-left:1px solid var(--line,#dbe0d3)}',
    '.sp-mini{display:none;flex:1 1 40px;min-width:14px;height:7px;gap:2px;max-width:150px}',
    /* m3: the possession group of the one-line row (label, two shares, the
     * small bar). On a phone the full label does not fit, so it says "Ball"
     * (m1 hid the label, and before both teams had the ball the row read as
     * two dashes and an even bar with no name); until both teams have had
     * the ball the group is not shown there at all. */
    '.sp-pg{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0}',
    '.sp-lab2{display:none}',
    '@media (max-width:420px){.sp-lab{display:none}.sp-lab2{display:inline}.sp.sp-noposs .sp-pg{display:none}.sp.sp-noposs .sp-sum .sp-sh{margin-left:0;padding-left:0;border-left:0}}',
    /* lay1: the folded row never runs under its button (at 1366x768 "Shots 0 - 0" was cut off by "More stats"):
     * the bar shrinks first, then the word "Possession" goes */
    '.sp{container-type:inline-size}',
    '.sp.collapsed .sp-sum{overflow:hidden}',
    '.sp-sum .sp-sh{flex:none}',
    '.sp.sp-noshots .sp-sum .sp-sh{visibility:hidden}',   // m6: kept in the row (nothing jumps when the first shot comes)
    '@container (max-width:330px){.sp-sum .sp-lab{display:none}}',
    '.sp.collapsed .sp-mini{display:flex}',
    /* m4: THE MOMENTUM RIBBON in the row (rib1, DECISIONS item 20): with opts.ribbon the row's possession group gives
     * its place to the ribbon the page draws into [data-r="rib"]; the shares stay in "More stats" */
    '.sp.sp-hasrib .sp-sum .sp-pg{display:none}',
    '.sp-rib{display:none;flex:1 1 auto;min-width:0;line-height:0;overflow:hidden;height:50px}',
    '@media (max-width:1500px){.sp-rib{height:46px}}',
    '.sp.sp-hasrib .sp-btn[data-r="fold"]{white-space:nowrap}',
    '.sp.sp-hasrib .sp-rib{display:block}',
    '.sp.sp-hasrib .sp-sum .sp-sh{align-self:center;margin-left:6px;padding-left:8px;border-left:1px solid var(--line,#dbe0d3)}',
    '.sp-mini i{display:block;height:100%} .sp-mini i.y{background:var(--st-you);border-radius:3px 0 0 3px} .sp-mini i.t{background:var(--st-them);border-radius:0 3px 3px 0}',
    '@media (prefers-reduced-motion:reduce){.sp-bar i,.sp-tl .done{transition:none}.sp-tl .mk.new{animation:none}}',
    /* the heatmap legend, drawn on the pitch by the page */
    '.sp-hl{display:inline-flex;align-items:center;gap:7px;font:600 11.5px ui-sans-serif,system-ui;color:#fff;',
    '  background:rgba(8,20,12,.72);border-radius:8px;padding:4px 8px}',
    '.sp-hl .ramp{width:54px;height:8px;border-radius:2px}',
    '.sp-hl small{font-weight:500;opacity:.85}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('sp-css')) return;
    var s = document.createElement('style'); s.id = 'sp-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(v) { return Math.round(v * 100); }
  var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* a number that counts to its new value and flashes once when it changes */
  function Num(el) { this.el = el; this.v = 0; this.shown = 0; this.raf = 0; }
  /* m2: a dash in place of a number (possession before both teams have had the ball) */
  Num.prototype.dash = function () {
    try { cancelAnimationFrame(this.raf); } catch (e) { }
    clearTimeout(this.tmr);
    this.v = null; this.shown = 50; this.el.textContent = '\u2013';
  };
  Num.prototype.set = function (v, fmt) {
    fmt = fmt || function (n) { return String(Math.round(n)); };
    if (v === this.v) { this.el.textContent = fmt(v); return; }
    var from = this.shown, to = v, self = this, t0 = null, dur = 450;
    this.v = v;
    if (reduce || typeof requestAnimationFrame !== 'function') { this.shown = v; this.el.textContent = fmt(v); return; }
    cancelAnimationFrame(this.raf);
    this.el.classList.remove('bump'); void this.el.offsetWidth; this.el.classList.add('bump');
    if (!this.hooked) { this.hooked = true; this.el.addEventListener('animationend', function () { self.el.classList.remove('bump'); }); }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var f = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - f, 3);
      self.shown = from + (to - from) * e;
      self.el.textContent = fmt(self.shown);
      if (f < 1) self.raf = requestAnimationFrame(step); else self.shown = to;
    }
    this.raf = requestAnimationFrame(step);
    /* if frames are not running (a hidden tab), still land on the value */
    clearTimeout(this.tmr);
    this.tmr = setTimeout(function () {
      if (self.v === to && self.shown !== to) { cancelAnimationFrame(self.raf); self.shown = to; self.el.textContent = fmt(to); }
    }, dur + 120);
  };

  function iconHTML(id, team) {
    var I = root.KMIcons;
    if (I && I.kindOf && team) id = I.kindOf(id, team) || id;  // col: the display kind (their attack or yours)
    if (I && I.svg) return I.svg(id) || I.svg('dead');
    return '<span>' + esc(id) + '</span>';
  }

  function create(host, opts) {
    injectCSS();
    opts = opts || {};
    var names = opts.names || { you: 'You', them: 'Them' };
    var heatTeam = null, keyShown = 0, lastSel = null;
    var el = document.createElement('section');
    el.className = 'sp sp-noposs sp-noshots' + (opts.ribbon ? ' sp-hasrib' : '');   /* m3: nobody has had the ball before kick-off; m4: the ribbon */
    el.setAttribute('aria-label', 'Match stats');
    el.innerHTML =
      '<div class="sp-head"><h2>Match stats</h2><span class="sp-min" data-r="min"></span>' +
      '<span class="sp-sum" data-r="sum"><span class="sp-rib" data-r="rib"></span><span class="sp-pg"><span class="sp-lab">Possession</span><span class="sp-lab2">Ball</span><b data-r="fY">\u2013</b>' +
      '<span class="sp-mini" aria-hidden="true"><i class="y" style="flex-grow:1"></i><i class="t" style="flex-grow:1"></i></span>' +
      '<b data-r="fT">\u2013</b></span><span class="sp-sh">Shots <b data-r="fsY">0</b> - <b data-r="fsT">0</b></span></span>' +
      '<button class="sp-btn" data-r="fold" aria-expanded="true">Hide</button></div>' +
      '<div class="sp-body">' +
      '<div class="sp-poss" title=""><span class="v" data-r="pY">\u2013</span>' +
      '<span class="sp-bar" role="img" data-r="bar"><i class="y" style="flex-grow:1"></i><i class="t" style="flex-grow:1"></i></span>' +
      '<span class="v r" data-r="pT">\u2013</span></div>' +
      '<div class="sp-cap"><span>' + esc(names.you) + '</span><span>Possession</span><span>' + esc(names.them) + '</span></div>' +
      '<table class="sp-nums"><thead><tr><th></th><th>Shots</th><th>On target</th><th>Passes</th></tr></thead><tbody>' +
      '<tr><td><span class="sp-dot y"></span>' + esc(names.you) + '</td><td><span class="sp-n" data-r="sY">0</span></td><td><span class="sp-n" data-r="oY">0</span></td><td><span class="sp-n" data-r="aY">0</span></td></tr>' +
      '<tr><td><span class="sp-dot t"></span>' + esc(names.them) + '</td><td><span class="sp-n" data-r="sT">0</span></td><td><span class="sp-n" data-r="oT">0</span></td><td><span class="sp-n" data-r="aT">0</span></td></tr>' +
      '</tbody></table>' +
      '<div class="sp-tl" data-r="tl" aria-label="Key moments, minute 0 to 90. ' + esc(names.you) + ' above the line, ' + esc(names.them) + ' below.">' +
      '<span class="lane y" title="' + esc(names.you) + '"></span><span class="lane t" title="' + esc(names.them) + '"></span>' +
      '<span class="ax"></span><span class="done" data-r="done" style="width:0"></span>' +
      '<span class="tk" style="left:50%"></span>' +
      '<span class="lb s" style="left:0">0\'</span><span class="lb" style="left:50%">Half time</span><span class="lb e" style="left:100%">90\'</span>' +
      '</div>' +
      '<div class="sp-last" data-r="last" aria-live="polite"></div>' +
      '<div class="sp-foot"><span class="lbl">Heatmap</span>' +
      '<button class="sp-btn" data-heat="" aria-pressed="true">Off</button>' +
      '<button class="sp-btn" data-heat="you" aria-pressed="false">' + esc(names.you) + '</button>' +
      '<button class="sp-btn" data-heat="them" aria-pressed="false">' + esc(names.them) + '</button>' +
      '<button class="sp-btn sp-more-btn" data-r="more" aria-expanded="false">More</button></div>' +
      '<div class="sp-more" data-r="moreBox" hidden></div>' +
      '</div>';
    host.appendChild(el);
    function R(k) { return el.querySelector('[data-r="' + k + '"]'); }
    var nums = { sY: new Num(R('sY')), sT: new Num(R('sT')), oY: new Num(R('oY')), oT: new Num(R('oT')), aY: new Num(R('aY')), aT: new Num(R('aT')), pY: new Num(R('pY')), pT: new Num(R('pT')) };
    nums.pY.v = nums.pY.shown = 50; nums.pT.v = nums.pT.shown = 50;
    var last = null;

    function setFold(c, fire) {
      el.classList.toggle('collapsed', c);
      R('fold').setAttribute('aria-expanded', c ? 'false' : 'true');
      R('fold').textContent = c ? 'More stats' : 'Fewer';
      if (fire && opts.onFold) opts.onFold(!c);
    }
    R('fold').addEventListener('click', function () { setFold(!el.classList.contains('collapsed'), true); });
    setFold(opts.folded !== false, false);
    R('more').addEventListener('click', function () {
      var open = R('moreBox').hidden;
      R('moreBox').hidden = !open;
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = open ? 'Less' : 'More';
      if (open && last) renderMore(last);
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-heat]'), function (b) {
      b.addEventListener('click', function () { setHeat(b.getAttribute('data-heat') || null, true); });
    });
    function setHeat(t, fire) {
      heatTeam = t;
      Array.prototype.forEach.call(el.querySelectorAll('[data-heat]'), function (b) {
        b.setAttribute('aria-pressed', (b.getAttribute('data-heat') || null) === t ? 'true' : 'false');
      });
      if (fire && opts.onHeat) opts.onHeat(t);
    }

    function renderMore(m) {
      var row = function (label, a, b) { return '<tr><td>' + label + '</td><td>' + a + '</td><td>' + b + '</td></tr>'; };
      var pm = function (v) { return Math.round(v) + ' min'; };
      var of = function (p) { return p.done + ' of ' + p.att; };
      R('moreBox').innerHTML = '<table><thead><tr><th></th><th>' + esc(names.you) + '</th><th>' + esc(names.them) + '</th></tr></thead><tbody>' +
        row('Had the ball', pm(m.possMinutes.you), pm(m.possMinutes.them)) +
        row('Passes completed', of(m.passes.you), of(m.passes.them)) +
        row('Corners', m.corners.you, m.corners.them) +
        row('Fouls', m.fouls.you, m.fouls.them) +
        row('Won the ball', m.won.you, m.won.them) +
        '</tbody></table><p class="note">Possession is the share of the ' + Math.round(m.possMinutes.you + m.possMinutes.them) +
        ' minutes of open play so far that each team had the ball. Won the ball counts tackles, interceptions and moments where the other team lost it.</p>';
    }
    function showLast(k) {
      if (!k) { R('last').innerHTML = ''; return; }
      var more = '';
      R('last').innerHTML = iconHTML(k.icon, k.team) + '<span class="m">' + k.minute + '\'</span><span class="w">' +
        esc(names[k.team]) + ': ' + esc(k.label) + '</span>' + more;
    }

    function update(m) {
      last = m;
      var py = pct(m.possession.you), pt = 100 - py;
      /* m2 (DECISIONS item 13): until both teams have had the ball, a share
       * of possession means nothing (it read 100% to 0% after the first
       * play): a dash on both sides and an even bar, until both have */
      var both = !!(m.possMinutes && m.possMinutes.you > 0 && m.possMinutes.them > 0);
      el.classList.toggle('sp-noposs', !both);
      nums.pY.set(py, function (n) { return Math.round(n) + '%'; });
      nums.pT.set(pt, function (n) { return Math.round(n) + '%'; });
      var bar = R('bar').children;
      bar[0].style.flexGrow = Math.max(0.001, m.possession.you); bar[1].style.flexGrow = Math.max(0.001, m.possession.them);
      var mini = el.querySelector('.sp-mini').children;
      mini[0].style.flexGrow = Math.max(0.001, m.possession.you); mini[1].style.flexGrow = Math.max(0.001, m.possession.them);
      R('fY').textContent = py + '%'; R('fT').textContent = pt + '%';
      R('fsY').textContent = m.shots.you; R('fsT').textContent = m.shots.them;
      el.classList.toggle('sp-noshots', !((m.shots.you || 0) + (m.shots.them || 0)));   // m6: "Shots 0 - 0" waits for the first shot (the word ceiling)
      R('sum').setAttribute('aria-label', 'Possession ' + names.you + ' ' + py + ' percent, ' + names.them + ' ' + pt + ' percent. Shots ' +
        names.you + ' ' + m.shots.you + ', ' + names.them + ' ' + m.shots.them);
      R('bar').setAttribute('aria-label', 'Possession: ' + names.you + ' ' + py + ' percent, ' + names.them + ' ' + pt + ' percent');
      el.querySelector('.sp-poss').title = names.you + ' had the ball ' + Math.round(m.possMinutes.you) + ' minutes, ' +
        names.them + ' ' + Math.round(m.possMinutes.them) + ' minutes';
      if (!both) {
        nums.pY.dash(); nums.pT.dash();
        [bar, mini].forEach(function (b) { b[0].style.flexGrow = 1; b[1].style.flexGrow = 1; });
        R('fY').textContent = '\u2013'; R('fT').textContent = '\u2013';
        R('sum').setAttribute('aria-label', 'Possession: shown once both teams have had the ball. Shots ' +
          names.you + ' ' + m.shots.you + ', ' + names.them + ' ' + m.shots.them);
        R('bar').setAttribute('aria-label', 'Possession: shown once both teams have had the ball');
        el.querySelector('.sp-poss').title = 'Possession is shown once both teams have had the ball';
      }
      nums.sY.set(m.shots.you); nums.sT.set(m.shots.them);
      nums.oY.set(m.onTarget.you); nums.oT.set(m.onTarget.them);
      nums.aY.set(m.passes.you.done); nums.aT.set(m.passes.them.done);
      R('aY').title = m.passes.you.done + ' of ' + m.passes.you.att + ' passes completed';
      R('aT').title = m.passes.them.done + ' of ' + m.passes.them.att + ' passes completed';
      /* bold the bigger number of each pair, so the leader reads at a glance */
      [['sY', 'sT', m.shots], ['oY', 'oT', m.onTarget]].forEach(function (q) {
        R(q[0]).style.fontWeight = q[2].you > q[2].them ? 800 : 600;
        R(q[1]).style.fontWeight = q[2].them > q[2].you ? 800 : 600;
      });
      R('aY').style.fontWeight = m.passes.you.done > m.passes.them.done ? 800 : 600;
      R('aT').style.fontWeight = m.passes.them.done > m.passes.you.done ? 800 : 600;
      var minute = Math.min(90, Math.round(m.minute));
      R('min').textContent = minute + '\'';
      R('done').style.width = (Math.min(90, m.minute) / 90 * 100) + '%';
      /* key moments: add the new ones, refresh the last one (a chain grows) */
      var tl = R('tl'), ks = m.keyMoments;
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i], id = 'k' + k.index, mk = tl.querySelector('[data-k="' + id + '"]');
        var goal = k.kind === 'goal' || k.kind === 'conceded';
        var tip = k.minute + '\' ' + names[k.team] + ': ' + k.chain.map(function (c) { return c.label; }).join(', then ');
        if (!mk) {
          mk = document.createElement('button');
          mk.type = 'button';
          mk.setAttribute('data-k', id);
          mk.className = 'mk new';
          mk.style.left = (Math.min(90, k.minute) / 90 * 100) + '%';
          tl.appendChild(mk);
          (function (kk, node) {
            node.addEventListener('mouseenter', function () { showLast(kk()); });
            node.addEventListener('focus', function () { showLast(kk()); });
            node.addEventListener('mouseleave', function () { showLast(lastSel); });
            node.addEventListener('blur', function () { showLast(lastSel); });
          })((function (ix) { return function () { return last.keyMoments.filter(function (q) { return q.index === ix; })[0]; }; })(k.index), mk);
        }
        mk.className = 'mk ' + (k.team === 'you' ? 'y' : 't') + (goal ? ' goal' : '') + (i >= keyShown ? ' new' : '');
        mk.innerHTML = iconHTML(k.icon, k.team);  // col
        mk.setAttribute('aria-label', tip);
        mk.title = tip;
      }
      keyShown = ks.length;
      lastSel = ks[ks.length - 1] || null;
      showLast(lastSel);
      if (!R('moreBox').hidden) renderMore(m);
    }
    return { el: el, update: update, setHeat: function (t) { setHeat(t, false); }, heat: function () { return heatTeam; },
      setFold: function (c) { setFold(c, false); }, folded: function () { return el.classList.contains('collapsed'); },
      ribHost: function () { return R('rib'); } };   // m4: where the page draws the ribbon
  }

  /* the heatmap, drawn onto a canvas that covers the pitch (vertical: the
   * user's goal at the bottom). One hue, more time = more opaque, smoothed. */
  function hexRGB(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function drawHeat(canvas, heat, colour) {
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!heat || !(heat.max > 0)) return;
    var off = document.createElement('canvas');
    off.width = heat.cols; off.height = heat.rows;
    var o = off.getContext('2d'), img = o.createImageData(heat.cols, heat.rows), rgb = hexRGB(colour).map(function (c) { return Math.round(c + (255 - c) * 0.3); });
    /* scale to the 90th percentile of the visited cells, not the single
     * hottest one: a ball standing still at a restart makes one spike that
     * would wash the rest of the map out */
    var nz = heat.cells.filter(function (v) { return v > 0; }).sort(function (x, y) { return x - y; });
    var top = nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.9))] : heat.max;
    for (var r = 0; r < heat.rows; r++) {
      for (var c = 0; c < heat.cols; c++) {
        var v = Math.min(1, heat.cells[r * heat.cols + c] / top);
        var a = v > 0 ? 0.08 + 0.92 * Math.pow(v, 0.75) : 0;
        var p = ((heat.rows - 1 - r) * heat.cols + c) * 4;   // y grows up the screen
        img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2];
        img.data[p + 3] = Math.round(a * 235);
      }
    }
    o.putImageData(img, 0, 0);
    ctx.save();
    /* dim the grass a little first, so any team colour reads on it */
    ctx.fillStyle = 'rgba(4,14,8,.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('filter' in ctx) ctx.filter = 'blur(' + Math.round(w / heat.cols * 0.3) + 'px)';
    ctx.drawImage(off, 0, 0, w, h);
    ctx.restore();
  }
  function heatLegendHTML(name, colour) {
    return '<span class="sp-hl">Where ' + esc(name) + ' had the ball <small>less</small>' +
      '<span class="ramp" style="background:linear-gradient(90deg,transparent,' + colour + ')"></span><small>more</small></span>';
  }

  var API = { create: create, drawHeat: drawHeat, heatLegendHTML: heatLegendHTML, CSS: CSS };
  root.KMStatsPanel = API;
})(typeof window !== 'undefined' ? window : globalThis);
