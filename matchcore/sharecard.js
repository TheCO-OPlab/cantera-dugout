/* ft2: THE SHARE CARD. A fixed 1200x630 picture of a finished match (the
 * size link previews use): the fixture, the score, who scored when, the
 * momentum ribbon across the middle with the goals and the six moments, and
 * the ribbon's one-line story. Drawn on a canvas with no images and no
 * network, so the canvas is never tainted and toDataURL always works.
 *
 *   KMShareCard.W, KMShareCard.H             1200, 630
 *   KMShareCard.draw(canvas, d)              draws; returns the canvas
 *   KMShareCard.fileName(d)                  'cantera-spain-2-1-argentina.png'
 *   KMShareCard.geometry()                   the ribbon's box (for the checks)
 *
 * d: { kicker, you: {name, kit}, them: {name, kit}, score: {you, them},
 *      scorers: {you: 'Yamal 41\', Oyarzabal 58\'', them: ''}, story,
 *      series: KMRibbon.series(R), marks: KMRibbon.marks(R), minutes }
 * kit: { primary, secondary?, stripes? } as the page's kitsNow() gives it.
 * Vanilla canvas 2D; nothing here reads the match. */
(function (root) {
  'use strict';
  var W = 1200, H = 630, L = 105;
  var FONT = 'ui-sans-serif,system-ui,"Segoe UI",Roboto,Arial,sans-serif';
  var RIB = { x0: 150, x1: 1140, top: 318, th: 164 };
  /* ?ft2break=share: the card draws nothing (ftcheck shows its check fails) */
  function broken() { try { return /[?&]ft2break=share\b/.test(root.location.search || ''); } catch (e) { return false; } }

  function font(w, px) { return w + ' ' + px + 'px ' + FONT; }
  function kitCol(k, dflt) { return (k && k.primary) || dflt; }
  function chip(g, x, y, w, h, kit, dflt) {
    g.save();
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.min(6, h / 2)); else g.rect(x, y, w, h); g.clip();
    g.fillStyle = kitCol(kit, dflt); g.fillRect(x, y, w, h);
    if (kit && kit.stripes) {
      g.fillStyle = kit.secondary || '#fff';
      for (var i = 1; i < 5; i += 2) g.fillRect(x + (w * i) / 5, y, w / 5, h);
    }
    g.restore();
    
  }
  /* fit a line to a width by shrinking the font, down to a floor */
  function fitFont(g, s, w, px, min, weight) {
    var f = px;
    g.font = font(weight, f);
    while (f > min && g.measureText(s).width > w) { f -= 1; g.font = font(weight, f); }
    return f;
  }
  /* split a sentence into at most two lines that fit */
  function wrap2(g, s, w) {
    if (g.measureText(s).width <= w) return [s];
    var words = s.split(' '), a = '', k;
    for (k = 0; k < words.length; k++) {
      var t = a ? a + ' ' + words[k] : words[k];
      if (g.measureText(t).width > w) break;
      a = t;
    }
    return [a, words.slice(k).join(' ')];
  }

  function draw(cv, d) {
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    if (broken()) return cv;
    d = d || {};
    var you = d.you || {}, them = d.them || {}, sc = d.score || { you: 0, them: 0 };
    var cy = kitCol(you.kit, '#1f5fbf'), ct = kitCol(them.kit, '#f0a030');

    /* the ground: a dark pitch green with mown stripes */
    var bg = g.createRadialGradient(W / 2, -40, 60, W / 2, 120, 900);
    bg.addColorStop(0, '#2a7a47'); bg.addColorStop(0.55, '#17492b'); bg.addColorStop(1, '#0f321d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.028)';
    for (var sx = 0; sx < W; sx += 120) g.fillRect(sx, 0, 60, H);
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2;
    g.strokeRect(18, 18, W - 36, H - 36);

    g.textBaseline = 'alphabetic';
    /* the kicker */
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.72)';
    g.font = font(800, 17);
    var kick = String(d.kicker || 'Full time').toUpperCase().split('').join(String.fromCharCode(8202));
    g.fillText(kick, W / 2, 66);

    /* the score: the numbers in the middle, a team either side */
    g.fillStyle = '#fff'; g.font = font(900, 112);
    var mid = W / 2;
    g.fillText(String(sc.you), mid - 70, 176);
    g.fillText(String(sc.them), mid + 70, 176);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.font = font(700, 70); g.fillText('-', mid, 160);
    var nameW = 330;
    [['you', -1], ['them', 1]].forEach(function (s) {
      var t = s[0] === 'you' ? you : them, dir = s[1], x = mid + dir * 150;
      g.textAlign = dir < 0 ? 'right' : 'left';
      g.fillStyle = '#fff';
      fitFont(g, t.name || '', nameW, 46, 26, 800);
      g.fillText(t.name || '', x, 128);
      /* the kit under the name, as a band */
      var nw = Math.max(60, g.measureText(t.name || '').width);
      chip(g, dir < 0 ? x - nw : x, 140, nw, 9, t.kit, s[0] === 'you' ? '#1f5fbf' : '#f0a030');
      var sco = (d.scorers && d.scorers[s[0]]) || '';
      if (sco) {
        g.fillStyle = 'rgba(255,255,255,.82)';
        fitFont(g, sco, nameW, 20, 13, 600);
        g.fillText(sco, x, 178);
      }
    });

    /* the story, one or two lines */
    if (d.story) {
      g.textAlign = 'center'; g.fillStyle = '#fff';
      g.font = font(600, 23);
      var lines = wrap2(g, d.story, 1000);
      lines.forEach(function (ln, i) { g.fillText(ln, W / 2, 238 + i * 30 - (lines.length - 1) * 8); });
    }

    /* the ribbon: a bar a minute from the halfway line to where the ball
     * was, in the colour of the team that had it (pale in its own half) */
    var n = d.minutes || 90, x0 = RIB.x0, x1 = RIB.x1, top = RIB.top, th = RIB.th, step = (x1 - x0) / n;
    function T(m) { return x0 + m * step; }
    function A(y) { return top + (1 - y / L) * th; }
    g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(x0, top, x1 - x0, th);
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fillRect(x0, A(L), x1 - x0, A(88.5) - A(L)); g.fillRect(x0, A(16.5), x1 - x0, A(0) - A(16.5));
    var midY = A(L / 2), gap = 2;
    (d.series || []).forEach(function (r) {
      if (r.y === null || r.m >= n) return;
      var tm = r.team === 'them' ? 'them' : 'you';
      var attacking = tm === 'you' ? r.y >= L / 2 : r.y < L / 2;
      var a = A(r.y); if (Math.abs(a - midY) < 1.5) a = midY + (r.y >= L / 2 ? -1.5 : 1.5);
      g.globalAlpha = attacking ? 1 : 0.42;
      g.fillStyle = tm === 'you' ? cy : ct;
      g.fillRect(T(r.m), Math.min(a, midY), Math.max(1, step - gap) * Math.min(1, r.cover || 1), Math.abs(a - midY));
    });
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, midY); g.lineTo(x1, midY); g.stroke();
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.moveTo(T(45), top); g.lineTo(T(45), top + th); g.stroke(); g.setLineDash([]);
    /* the moments: a ring where the play stopped, a line to where it ended */
    var goals = [];
    (d.marks || []).forEach(function (k) {
      if (k.y === null || k.minute >= n + 0.001) return;
      var x = T(k.minute + 0.5);
      if (typeof k.endY === 'number' && Math.abs(k.endY - k.y) > 2) {
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, A(k.y)); g.lineTo(x, A(k.endY)); g.stroke();
      }
      g.fillStyle = '#17492b'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, A(k.y), 6.5, 0, Math.PI * 2); g.fill(); g.stroke();
      if (k.goal) goals.push(k);
    });
    /* a goal: a filled dot on the goal line, the scorer and the minute beside it */
    var lastX = { you: -1e9, them: -1e9 }, row = { you: 0, them: 0 };
    goals.forEach(function (k) {
      var x = T(k.minute + 0.5), gy = k.goal === 'you' ? A(L) : A(0);
      g.fillStyle = k.goal === 'you' ? cy : ct; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, gy, 9, 0, Math.PI * 2); g.fill(); g.stroke();
      var s = (k.scorer ? k.scorer + ' ' : 'Goal ') + k.minute + "'";
      g.font = font(800, 18); g.textAlign = 'center'; g.fillStyle = '#fff';
      var w = g.measureText(s).width;
      row[k.goal] = x - w / 2 < lastX[k.goal] + 8 ? row[k.goal] + 1 : 0;
      lastX[k.goal] = x + w / 2;
      g.fillText(s, x, k.goal === 'you' ? top - 14 - row.you * 20 : top + th + 26 + row.them * 20);
    });
    /* which way is which, and the clock */
    g.textAlign = 'right'; g.font = font(700, 13); g.fillStyle = 'rgba(255,255,255,.72)';
    g.fillText((them.name || 'Their') + "'s goal", x0 - 10, top + 14);
    g.fillText((you.name || 'Your') + "'s goal", x0 - 10, top + th - 4);
    g.textAlign = 'center'; g.font = font(600, 14); g.fillStyle = 'rgba(255,255,255,.6)';
    [0, 15, 30, 45, 60, 75, 90].forEach(function (m) { if (m <= n) g.fillText(m + "'", T(m), top + th + 52); });

    /* the footer */
    g.textAlign = 'left'; g.font = font(900, 18); g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText('CANTERA', 40, H - 40);
    g.font = font(600, 14); g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillText('Where the ball was, minute by minute. Rings are the six moments you played.', 140, H - 41);
    if (d.seed != null) { g.textAlign = 'right'; g.fillText('Seed ' + d.seed, W - 40, H - 41); }
    return cv;
  }
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function fileName(d) {
    var sc = (d && d.score) || { you: 0, them: 0 };
    return 'cantera-' + slug(d && d.you && d.you.name) + '-' + sc.you + '-' + sc.them + '-' + slug(d && d.them && d.them.name) + '.png';
  }
  var API = { W: W, H: H, draw: draw, fileName: fileName, geometry: function () { return { x0: RIB.x0, x1: RIB.x1, top: RIB.top, th: RIB.th }; } };
  root.KMShareCard = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
