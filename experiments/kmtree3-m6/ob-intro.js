/* ob1: THE TITLE SCREEN BEFORE KICK-OFF (piece 2 of the first-time study).
 *
 * A first-time player opens the page and, in about five seconds, knows the
 * fixture, which dots are his, which way he attacks, and that the match
 * stops for him. One Start button. The team sheet (the eleven, the bench,
 * keywords, tactics) is one quiet link away instead of being the first
 * screen, because it is a wall of numbers for somebody who has never seen
 * a moment.
 *
 * Reusable: KMObIntro.html(ctx) returns the markup, KMObIntro.show(el, ctx)
 * draws it into a container and wires the buttons. ctx:
 *   you, them: { name, team (flag id or null), kit (m2: the colour word of the pieces) }
 *   final: true for the World Cup final
 *   onStart(), onSheet(), onBack(), onSwitch() (optional)
 * Everything the player reads is plain English, no em dashes. */
(function (root) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flag(id) { return id ? '<span class="flag ' + esc(id) + '" aria-hidden="true"></span>' : ''; }

  /* A small pitch standing up, the same way the match draws it: their goal
   * at the top, yours at the bottom, eleven blue dots in your half, eleven
   * purple in theirs, and one arrow up the middle. It is a picture of the
   * sentence "you attack up the screen". */
  var MINE = [[34, 5], [10, 22], [26, 19], [42, 19], [58, 22], [12, 38], [28, 35], [40, 35], [56, 38], [27, 48], [41, 48]];
  function miniPitch() {
    var s = '<svg class="obi-pitch" viewBox="-3 -6 74 117" role="img" aria-label="A pitch standing up. Your goal is at the bottom and theirs at the top. You attack up the screen.">' +
      '<rect class="t" x="-3" y="-6" width="74" height="117" rx="4"/>';
    for (var k = 0; k < 7; k++) s += '<rect class="s" x="0" y="' + (k * 15) + '" width="68" height="7.5"/>';
    s += '<g class="c"><rect x="0" y="0" width="68" height="105"/><line x1="0" y1="52.5" x2="68" y2="52.5"/>' +
      '<circle cx="34" cy="52.5" r="9.15"/><rect x="13.85" y="0" width="40.3" height="16.5"/><rect x="13.85" y="88.5" width="40.3" height="16.5"/>' +
      '<rect class="g" x="30.3" y="-2" width="7.4" height="2"/><rect class="g" x="30.3" y="105" width="7.4" height="2"/></g>';
    /* theirs mirrored into the top half */
    MINE.forEach(function (q) { s += '<circle class="d them" cx="' + (68 - q[0]) + '" cy="' + q[1] + '" r="2.1"/>'; });
    MINE.forEach(function (q) { s += '<circle class="d you" cx="' + q[0] + '" cy="' + (105 - q[1]) + '" r="2.1"/>'; });
    s += '<g class="arr"><path d="M34 84 L34 30"/><path d="M26.5 38 L34 28.5 L41.5 38"/></g>' +
      '<text class="lab" x="34" y="-3">THEIR GOAL</text><text class="lab" x="34" y="110.6">YOUR GOAL</text></svg>';  /* m2: clear of the goals */
    return s;
  }

  function html(ctx) {
    var you = ctx.you || {}, them = ctx.them || {};
    var kicker = ctx.final ? 'The 2026 World Cup final &middot; New York New Jersey' : 'A match between two made-up teams';
    return '<div class="obi" id="obintro">' +
      '<div class="obi-text">' +
        '<p class="obi-kick">' + kicker + '</p>' +
        '<div class="obi-teams">' +
          '<div class="obi-team you">' + flag(you.team) + '<b>' + esc(you.name) + '</b><span class="obi-who"><i class="obi-dot you"></i>You</span></div>' +
          '<div class="obi-vs">0<span>-</span>0</div>' +
          '<div class="obi-team them">' + flag(them.team) + '<b>' + esc(them.name) + '</b><span class="obi-who"><i class="obi-dot them"></i>Them</span></div>' +
        '</div>' +
        /* m2: the colour of your pieces on the pitch (ctx.you.kit, e.g. "red"), not ob1's "blue dots" */
        '<p class="obi-line">You are ' + esc(you.name) + ', the <b class="c-you">' + esc(you.kit ? you.kit + ' players' : 'blue dots') + '</b>. You attack <b>up the screen</b>.</p>' +
        /* lay1: the words match the counter ("Moment 2 of 6, decision 3"): a moment can take several decisions */
        '<p class="obi-line">The match plays itself, then stops for <b>six big moments</b>. Each one can take a few decisions, and each time you pick what your player does.</p>' +
        '<p class="obi-go"><button class="go obi-start" id="obstart">Kick off</button></p>' +
        '<p class="obi-links"><button class="obi-link" id="obsheet">Change the eleven or the tactics</button>' +
          (ctx.onSwitch ? '<span aria-hidden="true">&middot;</span><button class="obi-link" id="obswitch">Play as ' + esc(them.name) + '</button>' : '') +
          '<span aria-hidden="true">&middot;</span><button class="obi-link" id="obback">Other matches</button></p>' +
      '</div>' +
      '<div class="obi-art">' + miniPitch() + '</div>' +
    '</div>';
  }

  function show(el, ctx) {
    el.innerHTML = html(ctx);
    var g = function (id) { return document.getElementById(id); };
    if (g('obstart')) { g('obstart').onclick = function () { ctx.onStart && ctx.onStart(); }; try { g('obstart').focus({ preventScroll: true }); } catch (e) { } }
    if (g('obsheet')) g('obsheet').onclick = function () { ctx.onSheet && ctx.onSheet(); };
    if (g('obswitch')) g('obswitch').onclick = function () { ctx.onSwitch && ctx.onSwitch(); };
    if (g('obback')) g('obback').onclick = function () { ctx.onBack && ctx.onBack(); };
  }

  /* ?intro=0 turns the title screen off (straight to the team sheet, as p2) */
  function wanted() {
    try { return !/[?&]intro=0\b/.test(window.location.search || ''); } catch (e) { return true; }
  }

  var API = { html: html, show: show, wanted: wanted, miniPitch: miniPitch };
  root.KMObIntro = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
