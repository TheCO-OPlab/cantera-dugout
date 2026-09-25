/* call3: THE OUTCOME ICONS, drawn. One small inline SVG per icon (16 px,
 * coloured from the page's tokens through currentColor, so light and dark
 * mode both work), each with its meaning in words as its label and title:
 * the shape carries the meaning, never the colour alone. Which icon a
 * result gets is decided in options.js iconOf, from the result's data;
 * this file only draws them. Used by play.html and how-it-works.html.
 *
 * col: THE SEVERITY SCALE. m4 coloured a result green, grey or red by its
 * ICON, so "their attack comes one zone closer" (the engine's `back` icon in
 * their attack) was the same red as "they score". col1 colours every result
 * by what it MEANS for you, on one six-step scale, used everywhere a result
 * is coloured (the card's chips and bar, the hover arrows on the pitch, the
 * verdict flash, the headline, the log, the stats timeline):
 *   goal      goal for you                           strong green
 *   good      forward, into their box, their attack
 *             is over, you win the ball                 green
 *   keep      the ball stays, a pass back you keep,
 *             play stops                                grey
 *   ground    their attack comes a zone closer, their
 *             man gets past or into your box            amber
 *   lost      you lose the ball (your attack ends, or
 *             they win it and attack)                   orange
 *   danger    (m6) their man gets into your box, or has
 *             only your keeper in front of him          purple
 *   conceded  goal against (the ONLY red)               red
 * The engine's icon id is kept (data-icon, options.js, the checks); the
 * page draws a DISPLAY KIND (data-kind), which is the engine icon with its
 * side: `back` is `closer` in their attack and `counter` in yours, and a
 * forward result that carries an edge to you is `fwdPlus` (the round-3
 * review's "two green up arrows that look the same"). Every kind has one
 * severity (SEV) and its own shape; no shape is shared by two severities
 * (colcheck.js proves both).
 *
 * m6: THE SEVENTH STEP col1 recommended (DECISIONS item 29). "They reach
 * the edge of your box" and "Ben through on goal" were both the amber down
 * arrow, though one is much worse. A result of their attack that ends in
 * your box, or with their man through with only your keeper to beat (or
 * round him), is now its own kind, `inbox`, on its own step, `danger`,
 * between losing the ball and a goal against: purple (red stays for a goal
 * against only), and its own shape: the arrow down INTO a box. */
(function (root) {
  'use strict';
  var ORDER = ['fwd', 'back', 'backKeep', 'stay', 'goal', 'conceded', 'lost', 'won', 'dead'];
  /* [short name for the one-line key, the meaning in words] (engine icons) */
  var WORDS = {
    fwd: ['Forward', 'the ball moves up the pitch, toward their goal'],
    back: ['Back', 'the ball moves down the pitch, toward your goal, with them'],
    backKeep: ['Back, kept', 'you pass it back down the pitch, toward your goal, and keep it'],
    stay: ['Stays', 'the ball stays where it is'],
    goal: ['Goal', 'you score'],
    conceded: ['They score', 'a goal for them'],
    lost: ['They win it', 'your attack ends because they win the ball'],
    won: ['Stopped', 'their attack ends because you win or clear the ball'],
    dead: ['Play stops', 'out of play, a save, a miss, a corner or a free kick']
  };
  /* m4's three tones, by engine icon (kept for older readers such as
   * analysis/spread.js; nothing in col1's page colours by it any more) */
  var TONE = { fwd: 'g', back: 'r', backKeep: 'n', stay: 'n', goal: 'g', conceded: 'r', lost: 'r', won: 'g', dead: 'n' };

  /* col: the scale, best for you first */
  var SEVS = ['goal', 'good', 'keep', 'ground', 'lost', 'danger', 'conceded'];   // m6: + danger
  var SEV_WORDS = {
    goal: 'Goal for you', good: 'Good for you', keep: 'Neither', ground: 'They get closer',
    lost: 'You lose the ball', danger: 'They get into your box', conceded: 'Goal against'
  };
  /* col: the display kinds, in the key's order, each with ONE severity */
  var KINDS = ['goal', 'fwd', 'fwdPlus', 'won', 'stay', 'backKeep', 'dead', 'closer', 'lost', 'counter', 'inbox', 'conceded'];   // m6: + inbox
  var SEV = {
    goal: 'goal',
    fwd: 'good', fwdPlus: 'good', won: 'good',
    stay: 'keep', backKeep: 'keep', dead: 'keep',
    closer: 'ground',
    lost: 'lost', counter: 'lost',
    inbox: 'danger',   // m6
    conceded: 'conceded'
  };
  /* the engine icon each kind comes from (data-icon keeps the engine's id) */
  var ENGINE = { goal: 'goal', fwd: 'fwd', fwdPlus: 'fwd', won: 'won', stay: 'stay', backKeep: 'backKeep', dead: 'dead',
    closer: 'back', lost: 'lost', counter: 'back', inbox: 'back', conceded: 'conceded' };
  var KWORDS = {
    goal: ['Goal', 'you score'],
    fwd: ['Forward', 'the ball moves up the pitch, toward their goal'],
    fwdPlus: ['Forward, and +', 'forward, and your next player adds the number shown to his roll'],
    won: ['Stopped', 'their attack ends because you win or clear the ball'],
    stay: ['Stays', 'the ball stays where it is'],
    backKeep: ['Back, kept', 'you pass it back down the pitch, toward your goal, and keep it'],
    dead: ['Play stops', 'out of play, a save, a miss, a corner or a free kick'],
    closer: ['Closer', 'their attack comes closer to your goal (the ball moves down the pitch, toward your goal, with them)'],
    lost: ['They win it', 'your attack ends because they win the ball'],
    counter: ['They win it and attack', 'they take the ball and attack toward your goal'],
    inbox: ['Into your box', 'their attack gets into your box, or their man has only your keeper in front of him'],   // m6
    conceded: ['They score', 'a goal for them']
  };
  /* col: the colours, one source for the page (tokens injected below) and
   * for colcheck.js, which runs validate_palette.js on them in both modes.
   * card: icon and bar colour on the card surface; ink: the same step for
   * text (the verdict), dark enough to read; pitch: the hover arrows on the
   * green turf (light tints, with the dark casing the arrows already have;
   * pitch.surface is the dark disc under each arrow's icon and chance).
   * `keep` is a grey on purpose (neither good nor bad), so it is outside the
   * validator's chroma rule; colcheck checks its distance separately. */
  var PALETTE = {
    light: {
      surface: '#ffffff',
      card: { goal: '#006b2d', good: '#2fa24d', keep: '#999f91', ground: '#e0ab22', lost: '#de6200', danger: '#8e2fa8', conceded: '#b7191c' },
      ink: { goal: '#006b2d', good: '#1d7a37', keep: '#4d5347', ground: '#8a5d00', lost: '#a84800', danger: '#8e2fa8', conceded: '#b7191c' }
    },
    dark: {
      surface: '#1a1d16',
      card: { goal: '#20ae30', good: '#02783d', keep: '#b0b5a8', ground: '#b78d00', lost: '#a3520a', danger: '#a855c8', conceded: '#e84360' },
      ink: { goal: '#5fd46c', good: '#4cb371', keep: '#b6bdaa', ground: '#e0b04a', lost: '#f08a3c', danger: '#d38cf0', conceded: '#ff7488' }
    },
    pitch: { surface: '#0b1a10', goal: '#2ee860', good: '#9fe8b3', keep: '#f1f1ea', ground: '#ffd23f', lost: '#ff9a3c', danger: '#e39bff', conceded: '#ff5a5a' }
  };

  var GOAL = '<path d="M1.6 14V2.6h12.8V14"/><path d="M1.6 5.6h12.8" stroke-width="1" opacity=".55"/>' +
    '<circle cx="8" cy="10.4" r="2.7" fill="currentColor" stroke="none"/>';
  var PATH = {
    /* m1: the pitch is vertical, your goal at the bottom, so forward is UP
     * and back is DOWN, on the cards, the key, the stats timeline and the
     * hover preview alike (they all draw from here) */
    fwd: '<path d="M8 13.8v-11M3.6 6.8 8 2.4l4.4 4.4"/>',
    /* col: forward and an edge: the arrow with a second head (the review's
     * two up arrows that looked the same) */
    fwdPlus: '<path d="M8 14v-11.4M3.6 6.8 8 2.4l4.4 4.4M3.6 11.2 8 6.8l4.4 4.4"/>',
    /* their attack comes closer: the arrow down, open */
    back: '<path d="M8 2.2v11M3.6 9.2 8 13.6l4.4-4.4"/>',
    /* col: they win it and attack: an X where you lost it, then the arrow down */
    counter: '<path d="M8 7v6.6M4.6 10.2 8 13.6l3.4-3.4M5.8 1.4l4.4 4.4M10.2 1.4l-4.4 4.4"/>',
    /* the arrow down with the ball still at its tail: yours */
    backKeep: '<path d="M8 5.4v7.8M3.6 9.2 8 13.6l4.4-4.4"/><circle cx="8" cy="2.8" r="2" fill="currentColor" stroke="none"/>',
    /* col: the ball on a flat line (m4 had an empty circle, next to the
     * grey square of "play stops": the review could not tell them apart) */
    stay: '<path d="M1.4 8h3.2M11.4 8h3.2"/><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>',
    goal: GOAL,
    /* col: YOUR goal is at the bottom: the frame opens upward, the ball in it,
     * and a cross bar through (m4 drew both goals the same) */
    conceded: '<path d="M1.6 2v11.4h12.8V2"/><path d="M1.6 10.4h12.8" stroke-width="1" opacity=".55"/>' +
      '<circle cx="8" cy="6" r="2.7" fill="currentColor" stroke="none"/>',
    lost: '<path d="M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/>',
    /* m6: into your box: the arrow down, landing inside a box drawn at the
     * bottom (your end); not the amber open arrow of "closer" */
    inbox: '<path d="M8 1.4v9M4.6 7.2 8 10.6l3.4-3.4"/><path d="M1.8 8.4v6h12.4v-6" stroke-width="1.6"/>',
    won: '<path d="M2.6 8.4l3.8 3.8 7-7.6"/>',
    /* col: play stops: two bars, the sign for a pause (m4: a grey square) */
    dead: '<path d="M5.4 3v10M10.6 3v10" stroke-width="2.8"/>'
  };
  /* display kind -> the path it draws (closer draws the engine's back arrow) */
  var KPATH = {};
  KINDS.forEach(function (k) { KPATH[k] = PATH[k] || PATH[ENGINE[k]]; });

  /* col: the display kind of a result: the engine icon, its side ('you' when
   * you have the ball, 'them' when they attack) and, for a forward result,
   * whether it carries an edge to you ("then +2 to you next") */
  function kindOf(icon, who, x) {
    if (!icon) return null;
    if (KINDS.indexOf(icon) >= 0 && ENGINE[icon] !== icon) return icon;       /* already a kind */
    if (icon === 'back') return who === 'you' ? 'counter' : inBox(x) ? 'inbox' : 'closer';   // m6: inbox
    if (icon === 'fwd' && x && /\+\d+ to you next/.test(String(x.edgeShort || x.short || ''))) return 'fwdPlus';
    return icon;
  }
  /* m6: does their attack end in your box, or with their man through with
   * only your keeper to beat? Read from the result's short line (the card's
   * row name), or its text when it has none */
  var INBOX = /\binto your box\b|\bin your box\b|\bthrough on (?:your )?goal\b|\bround your keeper\b/i;
  function inBox(x) {
    if (!x) return false;
    var t = x.shortBase || x.name || (x.short && !/^,? ?then /.test(x.short) ? x.short : '') || x.text || '';
    return INBOX.test(String(t));
  }
  function sevOf(kind) { return SEV[kind] || (kind === 'back' ? 'ground' : 'keep'); }

  function label(id) {
    var w = KWORDS[id] || WORDS[id];
    return w ? w[0] + ': ' + w[1] : '';
  }
  /* svg(id): id is a display kind or an engine icon (an engine `back` with no
   * side draws as `closer`, their attack coming closer) */
  function svg(id, extra) {
    var kind = id === 'back' ? 'closer' : id;
    if (!KPATH[kind]) return '';
    var l = label(kind), sv = sevOf(kind);
    return '<svg class="oi ' + (TONE[ENGINE[kind]] || 'n') + ' sv-' + sv + (extra ? ' ' + extra : '') + '" data-icon="' + ENGINE[kind] +
      '" data-kind="' + kind + '" data-sev="' + sv + '" viewBox="0 0 16 16" role="img" aria-label="' +
      l + '" focusable="false"><title>' + l + '</title>' + KPATH[kind] + '</svg>';
  }
  /* the key: one line of icon and short name (compact), or the scale, one
   * row per step, each kind under it with its meaning */
  function keyHTML(compact) {
    if (compact) {
      return KINDS.map(function (id) { return '<span class="ik">' + svg(id) + KWORDS[id][0] + '</span>'; }).join('');
    }
    return '<ul class="ikey-list sv-key">' + SEVS.map(function (s) {
      return '<li class="sv-row"><span class="sv-sw sv-' + s + '" aria-hidden="true"></span><b class="sv-t sv-' + s + '">' + SEV_WORDS[s] + '</b>' +
        KINDS.filter(function (k) { return SEV[k] === s; }).map(function (k) {
          return '<span class="sv-k">' + svg(k) + '<b>' + KWORDS[k][0] + '</b>: ' + KWORDS[k][1] + '</span>';
        }).join('') + '</li>';
    }).join('') + '</ul>';
  }
  /* col: the colour tokens, from PALETTE, for the page (both modes) */
  function tokensCSS() {
    function set(p) {
      return SEVS.map(function (s) { return '--sv-' + s + ':' + p.card[s] + ';--svi-' + s + ':' + p.ink[s]; }).join(';');
    }
    var pitch = SEVS.map(function (s) { return '--svp-' + s + ':' + PALETTE.pitch[s]; }).join(';');
    return ':root{' + set(PALETTE.light) + ';' + pitch + '}' +
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){' + set(PALETTE.dark) + '}}' +
      ':root[data-theme="dark"]{' + set(PALETTE.dark) + '}';
  }
  function injectCSS(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.createElement || (doc.getElementById && doc.getElementById('sv-tokens'))) return;
    var st = doc.createElement('style');
    st.id = 'sv-tokens';
    st.textContent = tokensCSS();
    (doc.head || doc.documentElement || doc.body).appendChild(st);
  }
  if (typeof document !== 'undefined') { try { injectCSS(document); } catch (e) { } }

  var API = { ORDER: ORDER, WORDS: WORDS, TONE: TONE, svg: svg, label: label, keyHTML: keyHTML,
    SEVS: SEVS, SEV_WORDS: SEV_WORDS, KINDS: KINDS, SEV: SEV, ENGINE: ENGINE, KWORDS: KWORDS, PALETTE: PALETTE, PATH: KPATH,
    kindOf: kindOf, sevOf: sevOf, inBox: inBox, INBOX: INBOX, tokensCSS: tokensCSS, injectCSS: injectCSS };
  root.KMIcons = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
