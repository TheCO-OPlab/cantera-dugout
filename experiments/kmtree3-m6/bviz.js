/* cl1: MAKE THE BUILD VISIBLE AND FELT (builds-review-1.md).
 *
 * The engine already records, for every option, which component touched it
 * and how (effects.js OptionRec records: source, field, text, band, side),
 * which carried edges reached it (options.js uses, named "reason (Piece)"),
 * every firing in the match log (fx.log) and every live state (fx.states,
 * plus the engine's own derived states). None of that reached the screen in
 * a form a player could read at a glance. This file turns it into:
 *
 *   1. PIECE CHIPS on each card: one chip per piece that touched the card,
 *      credited to its real source (a carried +2 is Lays it off's, not Cool
 *      head's), with a short effect ("Arrives late: to Fabián, +2"), the
 *      full sentence on hover or tap. Penalties are their own chip style (a
 *      dashed red-orange outline and a minus), never inside a gold bonus.
 *   2. STATE BADGES: the states a build creates or reads (unmarked, marked,
 *      stretched, booked, their tired lines with the number, the keeper set
 *      for one kind of shot, in form, fresh, pressed), on the pitch beside
 *      the man or the line, and on the cards they help.
 *   3. THE BUILD PANEL beside the pitch: name, engine in one line, every
 *      piece with how often it has fired (a pulse when it fires), and the
 *      build's resources (their and your stamina where the build uses it,
 *      bookings where it fouls).
 *   4. COMBINATION MOMENTS: when two or more pieces act on one decision, the
 *      result says so in order ("Decoy: +1 to Cucurella; Arrives late: sends
 *      it to Fabián"), and the result box names the combination.
 *   5. FULL TIME: "Your build": what fired how often, the best combination
 *      moment, and one line on what the build changed.
 *
 * Only with YOUR build loaded (run.build). With no build none of it runs and
 * the page is byte-for-byte the old page (buildviewcheck.js proves it).
 * Everything here READS the match; nothing changes it.
 *
 * Node: require('./bviz.js') (pure model functions, for the checks).
 * Browser: window.KMBuildViz. */
(function (root) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  /* m3: a word that is a name (a capital, and not a plain English opener) */
  var NAMEW = { test: function (w) { return ['The', 'Their', 'Your', 'A', 'An', 'He', 'His', 'It', 'This', 'That', 'You', 'Once', 'When', 'Every', 'Each'].indexOf(w) < 0; } };
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function unstop(s) { return String(s || '').replace(/\s*[.]\s*$/, ''); }
  /* "Decoy (Oyarzabal)" -> "Decoy"; "Guessing (tactic)" -> "Guessing" */
  function pieceName(src) { return String(src || '').replace(/ \([^()]*\)$/, ''); }
  function ownerOf(src) { var m = / \(([^()]*)\)$/.exec(String(src || '')); return m ? m[1] : ''; }
  var LW = { def: 'defence', mid: 'midfield', att: 'attack' };
  var LINES = ['def', 'mid', 'att'];
  var BAND_TOK = { good: 'clean win: ', mixed: 'half win: ', bad: 'lost: ' };
  var BAND_IF = { good: 'On a clean win', mixed: 'On a half win', bad: 'If it is lost' };
  var NAME_RE = /(?:^|\s)to ([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]+)/u;

  function FXL() { return root.KMEffects || null; }
  /* buildviewcheck.js --break <name> (node: KMBuildViz.setBreak; the page: ?bvbreak=<name>) shows each check fails */
  var BREAK = (function () { try { var m = /[?&]bvbreak=(\w+)/.exec((root.location && root.location.search) || ''); return m ? m[1] : null; } catch (e) { return null; } })();
  function active(st) { return !!(st && st.fx && st.fx.build); }

  /* ------------------------------------------------ 1. PIECE CHIPS */
  /* one record's short effect (a few words) and its polarity for you:
   * +1 helps you, -1 hurts you, 0 neither */
  function recShort(r, o) {
    var t = unstop(r.text), m;
    switch (r.field) {
      case 'stat':
        m = /^([+-]\d+) to /.exec(t);
        return m ? { tok: m[1], pol: +m[1] > 0 ? 1 : -1, n: +m[1] } : { tok: '', pol: 1 };
      case 'their stat':
        m = /^([+-]\d+) to (\S+)/.exec(t);
        return m ? { tok: first({ name: m[2] }) + ' ' + m[1], pol: +m[1] < 0 ? 1 : -1, n: -(+m[1]) } : { tok: '', pol: 1 };
      case 'recipient': {
        var who = o && (o.to || o.receiver) ? first(o.to || o.receiver) : ((m = NAME_RE.exec(t)) ? m[1] : '');
        var m2 = /so (\S+) arrives/.exec(t); if (m2) who = m2[1];
        return { tok: who ? 'to ' + who : 'new man', pol: 1, verb: who ? 'sends it to ' + who : 'changes who gets it' };
      }
      case 'to': m = NAME_RE.exec(t); return { tok: m ? 'to ' + m[1] : 'ball to you', pol: 1, verb: m ? 'the ball falls to ' + m[1] : 'your team gets the ball' };
      case 'edge': m = /([+-]\d+)(?= to | in |$)/.exec(t); return { tok: m ? 'then ' + m[1] : 'then an edge', pol: 1, verb: m ? 'then ' + m[1] + (/ in this attack/.test(t) ? ' in this attack' : ' next') : '' };
      case 'branch': return { tok: 'goes on', pol: 1, verb: 'the attack goes on' };
      case 'continuation': return { tok: '+1 decision', pol: 1, verb: 'one more decision' };
      case 'decision': return { tok: 'free decision', pol: 1, verb: 'costs no decision' };
      case 'threshold': m = /needs (?:only )?(\d+)/.exec(t); return { tok: m ? 'clean on ' + m[1] : 'easier clean win', pol: 1, verb: m ? 'a clean win needs only ' + m[1] : 'an easier clean win' };
      case 'dice': m = /rolls (\d+) dice/.exec(t); return { tok: (m ? m[1] : '2') + ' dice', pol: 1, verb: 'rolls ' + (m ? m[1] : '2') + ' dice, keeps the best' };
      case 'tier': {
        m = /(clean win|half win|loss)[^.]*? counts as an? (clean win|half win|loss)/.exec(t);
        var from = m ? m[1] : r.band === 'mixed' ? 'half win' : r.band === 'bad' ? 'loss' : null, to = m ? m[2] : null;
        return { tok: from && to ? from + ' = ' + to : from ? from + ' counts more' : 'better result', pol: 1, notier: true, verb: from && to ? 'a ' + from + ' counts as a ' + to : 'a better result' };
      }
      case 'cost': {
        /* costBy's sentence is the component's own: cheaper when it says so, dearer otherwise */
        /* m4: a saving says "5 less stamina", never "-5 stamina" (which read as a cost); a dearer run says "5 more stamina" */
        if (/no stamina|less|nothing/.test(t)) { m = /(\d+) less/.exec(t); return { tok: m ? m[1] + ' less stamina' : 'no stamina', pol: 1, verb: 'costs less stamina' }; }
        m = /(\d+) more/.exec(t) || /(\d+) stamina in all/.exec(t);
        return { tok: m ? (/in all/.test(m[0]) ? m[1] + ' stamina' : m[1] + ' more stamina') : 'costs stamina', pol: -1, verb: 'costs more stamina' };
      }
      case 'tags': m = /counts as (?:an? )?([\w -]+)$/.exec(t); return { tok: m ? 'a ' + m[1] : 'retagged', pol: 1, verb: m ? 'counts as a ' + m[1] : '' };
      case 'foul': return { tok: 'foul', pol: 1, verb: 'a foul instead' };
      case 'move': return { tok: /free kick/.test(t) ? 'free kick' : /further/.test(t) ? 'further' : 'moves it', pol: 1 };
      case 'tire': m = /loses (\d+) stamina/.exec(t); return { tok: m ? 'tires -' + m[1] : 'tires them', pol: 1, verb: m ? 'their legs -' + m[1] : 'tires them' };
      case 'counter': return { tok: 'they forget', pol: 1 };
      case 'create': return { tok: 'new move', pol: 1, verb: 'makes this move possible' };
      case 'availability': return { tok: 'removed', pol: 0 };
      default: return { tok: '', pol: 1 };
    }
  }
  /* a piece's full sentence for one record ("On a half win: the loose ball falls to Olmo.") */
  function recFull(r) {
    var t = String(r.text || '');
    return (r.band && BAND_IF[r.band] ? BAND_IF[r.band] + ': ' + t : cap(t));
  }
  /* the fx edges carried into this decision: "reason (Piece)" as options.js
   * CARRY.fx.why names them, so a use on the card maps back to its source */
  function carriedFx(st) {
    var fx = st && st.fx; if (!fx) return [];
    var out = [];
    (fx.carried() || []).forEach(function (c) {
      if (c.id !== 'fx' || c.theirs) return;
      out.push({ c: c, why: String(c.why || c.source) + ' (' + pieceName(c.source) + ')' });
    });
    return out;
  }
  /* the carried edge of theirs, and the system parts are never a piece of yours */
  function isYours(r) { return (r.side || 'you') === 'you' && !r.system; }

  /* the model of the chips for one option:
   *   [{ source, name, owner, kind: 'bonus'|'pen'|'them'|'sys', tok, full, carried, n }]
   * in the order the engine applied them (carried edges first: they came
   * from an earlier decision) */
  function pieces(o, st) {
    var out = [], by = {};
    if (!o) return out;
    function slot(src, kind) {
      var k = kind + '|' + src;
      if (!by[k]) { by[k] = { source: src, name: pieceName(src), owner: ownerOf(src), kind: kind, toks: [], full: [], pol: 0, n: 0, carried: false, fields: [] }; out.push(by[k]); }
      return by[k];
    }
    /* carried edges from a piece (credited to it, not to whoever is on the card) */
    var cf = carriedFx(st);
    try { Object.defineProperty(o, '_bvCarried', { value: cf, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    (o.uses || []).forEach(function (u) {
      if (u.part || !u.n) return;
      var hit = cf.filter(function (x) { return x.why === u.why; })[0];
      if (!hit) return;
      var s = slot(BREAK === 'credit' && (o.fx || []).length ? o.fx[0].source : hit.c.source, u.n > 0 ? 'bonus' : 'pen');
      s.carried = true; s.n += u.n; s.pol += u.n > 0 ? 1 : -1;
      s.num = (s.num || 0) + u.n;
      s.full.push('From earlier in this attack: ' + String(hit.c.why || '').replace(/^(\S)(\S*)/, function (all, c, rest) { return /^[A-Z]/.test(c) && NAMEW.test(c + rest) ? all : c.toLowerCase() + rest; })   /* m3: never lower-case a man's name ("yamal is unmarked") */ + ': ' + (u.n > 0 ? '+' : '') + u.n + (o.actor ? ' to ' + first(o.actor) : '') + ' here');
      s.fields.push('carried');
    });
    (o.fx || []).forEach(function (r) {
      if (r.idle) return;
      var sh = recShort(r, o);
      /* a piece's cost to you is its own penalty chip beside its bonus chip, never inside it */
      var kind = r.system ? 'sys' : r.side === 'them' ? 'them' : sh.pol < 0 && BREAK !== 'pen' ? 'pen' : 'bonus';
      var s = slot(r.source, kind);
      if (r.field === 'stat' && !r.band && sh.n) s.num = (s.num || 0) + sh.n;   /* your stat parts add up into one number */
      else {
        var tk = sh.tok && !sh.notier && r.band && BAND_TOK[r.band] && !s['b_' + r.band] ? (s['b_' + r.band] = 1, BAND_TOK[r.band] + sh.tok) : sh.tok;
        if (tk && s.toks.indexOf(tk) < 0) s.toks.push(tk);
      }
      s.full.push(recFull(r));
      s.pol += sh.pol; if (sh.n) s.n += sh.n; if (sh.pol < 0) s.neg = true;
      s.fields.push(r.field);
      if (r.system) { var m = /their (\w+) is tired \((\d+) of 100/.exec(r.text); if (m) { s.line = m[1]; s.legs = +m[2]; } }
    });
    out.forEach(function (s) {
      if (s.num) s.toks.unshift((s.num > 0 ? '+' : '') + s.num);
      if (s.kind === 'sys') { s.name = s.line ? 'Their ' + s.line : 'Their stamina'; s.toks = [s.legs != null ? s.legs + '/100' : ''].concat(s.n ? [String(-s.n > 0 ? '+' + (-s.n) : -s.n)] : []).filter(Boolean); }
      if (s.kind === 'them') { s.name = pieceName(s.source); var tn = s.toks.map(function (t) { return (/([+-]\d+)$/.exec(t) || [])[1]; }).filter(Boolean)[0]; s.toks = tn ? [tn] : []; }
      s.tok = s.toks.slice(0, 2).join(', ');
      s.title = (s.kind === 'them' ? 'Their build: ' : s.kind === 'sys' ? '' : s.kind === 'pen' ? 'Your build, a cost: ' : 'Your build: ') +
        s.source + '. ' + s.full.join(' ');
    });
    return out;
  }
  /* which chips are worth space on the lean card: every piece of yours and
   * of theirs; their tired line only when it matters (at least 2, or the line
   * at 60 or less; the rest stays in the details) */
  function shown(ps) {
    return ps.filter(function (s) { return s.kind !== 'sys' || Math.abs(s.n) >= 2 || (s.legs != null && s.legs <= 60); });
  }
  var MARK = { bonus: '', pen: '&#9660;&#8201;', them: '', sys: '' };
  function chipHTML(s, cls) {
    return '<span class="bvp ' + s.kind + (s.carried ? ' carried' : '') + (cls ? ' ' + cls : '') + '" data-src="' + esc(s.source) + '" title="' + esc(s.title) + '">' +
      MARK[s.kind] + (s.kind === 'them' ? '<i aria-label="Their build">&#9670;</i>' : '') + esc(s.name) + (s.tok ? (/^(\d+ (less|more) )?stamina$|^no stamina$|^\d+ (less|more) stamina/.test(s.tok) ? ':' : '') + '<span class="bvt">' + esc(s.tok) + '</span>' : '') + '</span>';   /* m4: "Run at him: 5 less stamina" */
  }

  /* ------------------------------------------------ 2. STATE BADGES */
  var SWORD = { unmarked: 'unmarked', 'out of position': 'out of position', fatigued: 'tired', booked: 'booked', marked: 'marked',
    adapted: 'set for', 'in form': 'in form', fresh: 'fresh legs', stretched: 'stretched', pressed: 'pressed' };
  var SGLYPH = { unmarked: '&#9675;', 'out of position': '&#8646;', fatigued: '&#9662;', booked: '&#9646;', marked: '&#9679;', adapted: '&#9673;',
    'in form': '&#9650;', fresh: '&#10038;', stretched: '&#8596;', pressed: '&#8680;', tired: '&#9662;' };
  /* every live state a build made or reads, from the engine:
   *   [{ state, word, value, target: 'player'|'line'|'team'|'opponent', p, side, line, source, dur, text }] */
  /* m4: the shared states wave F added are only worth a badge when a piece in
   * this match (yours or theirs) reads them. A piece that only makes, keeps or
   * ends a state (it checks "not already", or removes it) does not count. Seen
   * in Scramble: the Decoy leaves their full-back "on his own", but nothing in
   * that build reads it, so the badge sat on a man it said nothing about. */
  var SHARED = ['rattled', 'keeper down', 'scrambling', 'caught upfield', 'on his own', 'rhythm', 'banked edge'];
  function readStates(fx) {
    if (fx._bvReads && fx._bvReads.n === fx.inst.length) return fx._bvReads.set;
    var set = {};
    fx.inst.forEach(function (x) {
      (x.def && x.def.effects || []).forEach(function (e) {
        var src = String(e.when || '') + String(e.apply || '') + String(e.run || '');
        SHARED.forEach(function (n) {
          if (src.indexOf("hasState('" + n + "'") >= 0 && src.indexOf("addState('" + n + "'") < 0 && src.indexOf("removeState('" + n + "'") < 0) set[n] = 1;
        });
      });
    });
    try { Object.defineProperty(fx, '_bvReads', { value: { n: fx.inst.length, set: set }, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    return set;
  }
  function stateRead(st, name) { return SHARED.indexOf(name) < 0 || !!readStates(st.fx)[name]; }
  function badges(st) {
    var fx = st && st.fx, out = [], seen = {};
    if (!active(st)) return out;
    function add(b) { var k = b.state + '|' + (b.p ? 'p' + b.p.id : b.side + ':' + (b.line || b.target)) + '|' + (b.value || ''); if (seen[k]) { if (b.source && seen[k].sources.indexOf(b.source) < 0) seen[k].sources.push(b.source); return; } b.sources = b.source ? [b.source] : []; seen[k] = b; out.push(b); }
    var ours = function (p) { return fx.isOurs(p); };
    /* the stored states (a component made each) */
    fx.states.forEach(function (s) {
      if (BREAK === 'badge' && s.name === 'marked') return;
      if (BREAK !== 'unread' && !stateRead(st, s.name)) return;   /* m4: a state nothing here reads gets no badge */
      var on = s.on || {}, b = { state: s.name, word: SWORD[s.name] || s.name, value: s.value || null, source: s.source, dur: s.duration, stored: true };
      /* m3: a component's own booking (Takes one for the team: his tackles -1)
       * is not the referee's yellow card (the engine's, defending -2): its own
       * label, and never merged with the yellow card on the same man */
      if (s.name === 'booked') { b.word = 'booked: tackles -1'; b.value = 'piece'; }
      if (on.p) { b.target = 'player'; b.p = on.p; b.side = ours(on.p) ? 'you' : 'them'; }
      else if (/^them:/.test(on.id)) { b.target = 'line'; b.side = 'them'; b.line = on.id.split(':')[1]; }
      else if (/^you:/.test(on.id)) { b.target = 'line'; b.side = 'you'; b.line = on.id.split(':')[1]; }
      else if (on.kind === 'opponent') { b.target = 'opponent'; b.side = 'them'; }
      else if (on.kind === 'team') { b.target = 'team'; b.side = 'you'; }
      else if (on.kind === 'relationship') { b.target = 'pair'; b.side = 'you'; b.pair = on.pair; }
      else return;
      add(b);
    });
    /* the engine's own: their lines' stamina (only effects move it), bookings,
     * the keeper's read of the last shot, the man they set on you at half-time,
     * unmarked and beaten men carried from the last decision */
    LINES.forEach(function (l) {
      var L = fx.legsOf('them', l);
      if (L < 100) add({ state: L < 40 ? 'fatigued' : 'tired', word: L < 40 ? 'tired' : 'stamina', value: Math.round(L), target: 'line', side: 'them', line: l, source: null, derived: true });
    });
    var yl = fx.legs ? fx.legs() : null;
    if (yl) LINES.forEach(function (l) { if (yl[l] < 40) add({ state: 'fatigued', word: 'tired', value: Math.round(yl[l]), target: 'line', side: 'you', line: l, source: null, derived: true }); });
    var sq = st.squad, op = st.opp;
    /* m3: the engine's yellow card, named as one (yours cost defending 2) */
    [sq.keeper].concat(sq.players).forEach(function (p) { if (p && st.booked && st.booked[p.id]) add({ state: 'booked', word: 'yellow card: -2', target: 'player', p: p, side: 'you', derived: true, yellow: true }); });
    [op.keeper].concat(op.players).forEach(function (p) { if (p && st.oppBooked && st.oppBooked[p.id]) add({ state: 'booked', word: 'yellow card', target: 'player', p: p, side: 'them', derived: true, yellow: true }); });
    if (op.keeper) ['hard shot', 'placed shot'].forEach(function (v) {
      if (fx.hasState('adapted', op.keeper, v)) add({ state: 'adapted', word: 'set for ' + v + 's', value: v, target: 'player', p: op.keeper, side: 'them', derived: true });
    });
    (fx.carried() || []).forEach(function (c) {
      if (c.id === 'unmarked' && c.man) add({ state: 'unmarked', word: 'unmarked', target: 'player', p: c.man, side: 'you', derived: true });
      if (c.id === 'beaten' && c.man) add({ state: 'out of position', word: 'out of position', target: 'player', p: c.man, side: 'them', derived: true });
    });
    var ad = st.cmem && st.cmem.adapt && st.cmem.adapt.set;
    if (ad && ad.man) add({ state: 'marked', word: 'marked', target: 'player', p: ad.man, side: 'you', derived: true });
    out.forEach(function (b) { b.label = badgeLabel(b); });
    return out;
  }
  function badgeLabel(b) {
    var who = b.target === 'player' ? first(b.p) : b.target === 'line' ? (b.side === 'them' ? 'Their ' : 'Your ') + LW[b.line] :
      b.target === 'opponent' ? 'Their defence' : b.target === 'team' ? 'Your team' : b.pair ? first(b.pair[0]) + ' and ' + first(b.pair[1]) : '';
    var word = b.state === 'adapted' ? 'set for ' + (b.value || 'one kind of shot') + 's' : b.word;
    if ((b.state === 'tired' || b.state === 'fatigued') && b.value != null) return who + ' ' + b.value + '/100';
    return who + ' ' + word;
  }
  /* the badges that help (or hurt) one card: a state on the card's men (the
   * man on the ball, the man he gives it to, the man he faces) or on their
   * defence/your team, when a piece or reason on this card is about it */
  function cardBadges(o, st, bs, ps) {
    bs = bs || badges(st); ps = ps || pieces(o, st);
    var men = [o.actor, o.to, o.receiver, o.mate, o.foil].filter(Boolean);
    var txt = (o.fx || []).map(function (r) { return r.text; }).concat((o.uses || []).map(function (u) { return u.why; }))
      .concat((o.mods || []).map(function (m) { return m.why; })).concat((o.theirMods || []).map(function (m) { return m.why; })).join(' | ').toLowerCase();
    var srcs = ps.map(function (s) { return s.source; });
    var KEY = { unmarked: /unmarked|nobody (has )?picked up|free man/, stretched: /stretched|pulled|out of position/, booked: /yellow|booked/, marked: /marked|marker|watched|goes wherever/,
      adapted: /ready for|set for|faced a/, 'in form': /in form/, fresh: /fresh/, pressed: /press/, fatigued: /tired|stamina/, tired: /tired|stamina/, 'out of position': /beaten|out of position|left behind|past/ };
    return bs.filter(function (b) {
      /* a state their build made is context (the panel and the pitch show it), not a help to this card */
      if ((b.sources || []).length && b.sources.every(function (x) { return /\(their /.test(x); })) return false;
      /* their tired line is the card's own "Their defence 38/100" chip (the engine's part on their number), never twice */
      if (b.state === 'tired' || b.state === 'fatigued') return false;
      var onMan = b.target === 'player' ? men.indexOf(b.p) >= 0 : true;
      if (!onMan) return false;
      /* m6: ONE MODIFIER, SHOWN ONCE. A state that carries its own number
       * ("Rodri booked: tackles -1", Takes one for the team) is not a second
       * chip when the piece that made it already shows that number on this
       * card ("Takes one for the team -1"): the -1 is taken once, so it is
       * shown once, on the piece's chip, which names its source. */
      if (BREAK !== 'dupmod' && /[+-]\d/.test(b.word || '') && ps.some(function (s) { return s.num && (b.sources || []).indexOf(s.source) >= 0; })) return false;
      var about = (b.sources || []).some(function (x) { return srcs.indexOf(x) >= 0; }) || (KEY[b.state] && KEY[b.state].test(txt));
      return !!about;
    });
  }
  function badgeHTML(b, cls) {
    return '<span class="bvs ' + (b.side === 'them' ? 'th' : 'yo') + (cls ? ' ' + cls : '') + '" data-state="' + esc(b.state) + '" title="' + esc(badgeTitle(b)) + '">' +
      '<i aria-hidden="true">' + (SGLYPH[b.state] || '&#9675;') + '</i>' + esc(b.label) + '</span>';
  }
  function badgeTitle(b) {
    var d = b.dur === 'match' ? ' for the rest of the match' : b.dur === 'possession' ? ' for this attack' : b.dur === 'moment' ? ' for this moment' : b.dur === 'decision' ? ' for the next decision' : '';
    return b.label + (b.state === 'tired' || b.state === 'fatigued' ? ' stamina (under 40 is tired: every duel of theirs there is harder)' : '') +
      (b.yellow ? (b.side === 'you' ? ' from the referee: his Defending is 2 lower for the rest of the match' : ' from the referee') : b.state === 'booked' ? ' (booked by this piece, not the referee\'s -2: his tackles are 1 lower and he is not asked to take one again)' : '') + d + (b.sources && b.sources.length ? '. Made by ' + b.sources.join(' and ') + '.' : '.');
  }

  /* the chips on a card: pieces, then the states they help */
  function cardChipsHTML(o, st) {
    if (!active(st) || !o) return '';
    var ps = pieces(o, st), bs = cardBadges(o, st, null, ps);
    return shown(ps).map(function (s) { return chipHTML(s); }).join('') + bs.map(function (b) { return badgeHTML(b, 'onc'); }).join('');
  }
  /* the uses a piece chip already shows (their "+2" chip is not drawn twice) */
  function creditedUse(u, st) {
    if (!active(st) || !u || u.part) return false;
    return carriedFx(st).some(function (x) { return x.why === u.why; });
  }
  /* a mod line the build block already says in words (the lean details) */
  function creditedMod(m, o, st) {
    if (!active(st) || !m) return false;
    if (m.fx) return true;
    return carriedFx(st).some(function (x) { return x.why === m.why; });
  }
  /* the details (hover, or the first tap): each piece in words */
  function detailsHTML(o, st, nm) {
    if (!active(st) || !o) return '';
    nm = nm || esc;
    var ps = pieces(o, st), bs = cardBadges(o, st, null, ps);
    if (!ps.length && !bs.length) return '';
    return '<span class="bvd">' + ps.map(function (s) {
      return '<span class="bvdl ' + s.kind + '"><span class="bvn">' + (s.kind === 'pen' ? '&#9660; ' : '') + esc(s.kind === 'sys' ? s.name + ' stamina' : s.source) + '</span> ' + nm(s.full.join(' ')) + '</span>';
    }).join('') + (bs.length ? '<span class="bvdl st">' + bs.map(function (b) { return badgeHTML(b); }).join(' ') + '</span>' : '') + '</span>';
  }

  /* ------------------------------------------ 4. COMBINATION MOMENTS */
  /* what a piece did on the decision just played, in order, one phrase each:
   *   [{ source, name, phrase }]. From the chosen option's records on the band
   * that happened, its carried edges, and the log lines this decision wrote. */
  function combo(ev, o, st, from) {
    if (!active(st) || !ev) return { pieces: [], line: '', name: '' };
    var fx = st.fx, names = {}, order = [], by = {};
    fx.inst.forEach(function (x) { if ((x.side || 'you') === 'you') names[x.name] = 1; });
    function put(src, phrase, weight) {
      if (!names[src]) return;
      if (!by[src]) { by[src] = { source: src, name: pieceName(src), phrase: phrase, w: weight }; order.push(by[src]); }
      else if (weight > by[src].w && phrase) { by[src].phrase = phrase; by[src].w = weight; }
    }
    var W = { recipient: 9, to: 8, create: 8, threshold: 7, tier: 7, dice: 6, decision: 6, branch: 6, continuation: 5, foul: 5, tags: 5, edge: 4, stat: 3, tire: 3, move: 3, cost: 2 };
    /* carried: set up earlier, cashed now */
    if (o && o.uses) {
      var cf = o._bvCarried || [];
      (o.uses || []).forEach(function (u) {
        if (u.part || !u.n) return;
        var hit = cf.filter(function (x) { return x.why === u.why; })[0];
        if (hit) put(hit.c.source, (u.n > 0 ? '+' : '') + u.n + ' from earlier (' + unstop(hit.c.why) + ')', 4);
      });
    }
    (o && o.fx || []).forEach(function (r) {
      if (r.idle || !isYours(r) || (r.band && r.band !== ev.band)) return;
      var sh = recShort(r, o);
      var ph = sh.verb || (r.field === 'stat' ? (sh.tok + (o.actor ? ' to ' + first(o.actor) : '')) : unstop(r.text));
      put(r.source, ph, W[r.field] || 1);
    });
    /* the lines this decision wrote (from = fx.log's length just before the
     * pick, so the attack's own opening lines are not counted): a state, an
     * edge, a booking; not a state ending */
    var lines = typeof from === 'number' ? fx.log.slice(from).map(function (l) { return { source: l.source, text: l.text, kind: l.kind }; }) :
      (ev.fx || []).map(function (line) {
        var src = null;
        Object.keys(names).forEach(function (n) { if (line.indexOf(n + ': ') === 0 && (!src || n.length > src.length)) src = n; });
        return src ? { source: src, text: line.slice(src.length + 2), kind: 'event' } : null;
      }).filter(Boolean);
    lines.forEach(function (l) {
      if (l.kind === 'expire' || l.kind === 'limit' || !names[l.source]) return;
      var t = unstop(l.text);
      if (/\(it lasted this |is no longer |is over|stops: /.test(t)) return;
      put(l.source, shortPhrase(t), 2);
    });
    if (BREAK === 'combo') fx.inst.forEach(function (x) { if ((x.side || 'you') === 'you' && !by[x.name] && order.length === 1) put(x.name, 'did nothing', 0); });
    var ps = order;
    var line = ps.map(function (p) { return p.name + ': ' + p.phrase; }).join('; ');
    return { pieces: ps, line: line, name: ps.length >= 2 ? ps.map(function (p) { return p.name; }).join(' + ') : '' };
  }
  /* a log sentence cut to its first clause, at most about ten words */
  function shortPhrase(t) {
    t = String(t || '');
    var w = t.split(/\s+/);
    if (w.length <= 10) return t;
    var cut = t.search(/[:,;] /);
    if (cut > 0 && t.slice(0, cut).split(/\s+/).length >= 3) return t.slice(0, cut);
    return w.slice(0, 10).join(' ') + '...';
  }

  /* ------------------------------------------------ 3. THE PANEL */
  /* static: what a piece's code can touch (tire their lines, spend yours, foul) */
  function uses(st) {
    var fx = st.fx, u = { theirLegs: false, yourLegs: false, fouls: false };
    fx.inst.forEach(function (x) {
      if ((x.side || 'you') !== 'you') return;
      var src = (x.def.effects || []).map(function (e) { return String(e.apply || '') + String(e.run || '') + String(e.when || ''); }).join(' ');
      if (/\.tire\(|legsOf\('them'|fatigued/.test(src)) u.theirLegs = true;
      if (/\.spend\(|\.refund\(|costBy\(/.test(src)) u.yourLegs = true;
      if (/\.foul\(|bookThem|'booked'|booked/.test(src)) u.fouls = true;
    });
    return u;
  }
  /* how many decisions each piece of yours fired on (distinct log positions) */
  function fires(st) {
    var fx = st.fx, out = {}, at = {};
    fx.log.forEach(function (l) {
      if (l.kind === 'expire' || l.kind === 'limit') return;
      var k = l.source + '|' + l.at;
      if (at[k]) return; at[k] = 1;
      out[l.source] = (out[l.source] || 0) + 1;
    });
    return out;
  }
  function panelModel(st, build) {
    if (!active(st)) return null;
    var fx = st.fx, f = fires(st), u = uses(st), seen = {};
    var ps = [];
    fx.inst.forEach(function (x) {
      if ((x.side || 'you') !== 'you' || seen[x.name]) return; seen[x.name] = 1;
      ps.push({ source: x.name, name: pieceName(x.name), owner: ownerOf(x.name), n: f[x.name] || 0, text: x.def.text || '', live: fx.active(x) });
    });
    var res = [];
    /* a line's bar once it has moved from 100 (the words stay few at the start); until then one line says they are fresh */
    if (u.theirLegs || LINES.some(function (l) { return fx.legsOf('them', l) < 100; })) {
      var tl = LINES.filter(function (l) { return fx.legsOf('them', l) < 100; });
      if (tl.length) tl.forEach(function (l) { res.push({ kind: 'bar', who: 'them', label: 'Their ' + LW[l], v: Math.round(fx.legsOf('them', l)) }); });
      else res.push({ kind: 'count', label: 'Their stamina', text: 'all 100' });
    }
    if (u.yourLegs && fx.legs) { var L = fx.legs(); LINES.forEach(function (l) { if (L[l] < 100) res.push({ kind: 'bar', who: 'you', label: 'Your ' + LW[l], v: Math.round(L[l]) }); }); }
    if (u.fouls) {
      var ob = Object.keys(st.oppBooked || {}).length, yb = Object.keys(st.booked || {}).filter(function (k) { return st.booked[k]; }).length;
      if (ob || yb) res.push({ kind: 'count', label: 'Yellow cards', text: 'theirs ' + ob + ', yours ' + yb });
      /* m3: a component's own booking is counted apart from the referee's */
      var pb = fx.states.filter(function (q) { return q.name === 'booked'; });
      if (pb.length) res.push({ kind: 'count', label: 'Booked by ' + (pb[0].source || 'a piece'), text: pb.map(function (q) { return first(q.on && q.on.p); }).join(', ') + ' (tackles -1)' });
    }
    return { name: build.name || build.id, engine: build.engine || '', pieces: ps, res: res, badges: badges(st) };
  }
  function panelHTML(st, build, last) {
    var m = panelModel(st, build);
    if (!m) return '';
    var fired = {};
    (last && last.pieces || []).forEach(function (p) { fired[p.source] = 1; });
    /* the engine in one short line (its first clause; the whole sentence on hover): the words at a decision are counted */
    var eng = String(m.engine || ''), cut = eng.split(/[;:] |\. /)[0], ew = cut.split(/\s+/);
    if (ew.length > 12) cut = ew.slice(0, 12).join(' ') + '...';
    var idle = m.pieces.filter(function (p) { return !p.n; }), shownP = m.pieces.filter(function (p) { return p.n; });
    var h = '<div class="bvh"><span class="bvk">Your build</span><b>' + esc(m.name) + '</b></div>' +
      (m.engine ? '<p class="bve" title="' + esc(eng) + '">' + esc(cut.replace(/[.,]$/, '')) + (cut !== eng ? ' <i aria-hidden="true">&#8230;</i>' : '') + '</p>' : '') +
      '<div class="bvps">' + shownP.map(function (p) {
        return '<span class="bvpc' + (p.n ? '' : ' zero') + (fired[p.source] ? ' fired' : '') + (p.live ? '' : ' off') + '" data-src="' + esc(p.source) + '" title="' + esc(p.source + ': ' + p.text + ' Fired ' + p.n + (p.n === 1 ? ' time' : ' times') + ' so far.') + '">' +
          esc(p.name) + (p.n ? '<b>' + p.n + '</b>' : '') + '</span>';
      }).join('') + (idle.length ? '<span class="bvpc zero idle" data-idle="' + idle.length + '" title="' + esc('Not fired yet: ' + idle.map(function (p) { return p.source; }).join(', ') + '.') + '">' +
        (shownP.length ? '+' + idle.length + ' waiting' : idle.length + ' pieces, none fired yet') + '</span>' : '') + '</div>';
    var bars = m.res.filter(function (r) { return r.kind === 'bar'; });
    if (bars.length) h += '<div class="bvres">' + bars.map(function (r) {
      var lo = r.v < 40;
      return '<span class="bvbar ' + r.who + (lo ? ' lo' : '') + '" title="' + esc(r.label + ': ' + r.v + ' of 100 stamina' + (lo ? ' (tired: under 40)' : '')) + '"><em>' + esc(r.label) + '</em>' +
        '<i><u style="width:' + Math.max(0, Math.min(100, r.v)) + '%"></u><s></s></i><b>' + r.v + (lo ? ' tired' : '') + '</b></span>';
    }).join('') + '</div>';
    m.res.filter(function (r) { return r.kind === 'count'; }).forEach(function (r) { h += '<p class="bvcount"><em>' + esc(r.label) + '</em> ' + esc(r.text) + '</p>'; });
    var live = m.badges.filter(function (b) { return !(b.state === 'tired' && b.target === 'line' && bars.length); });
    if (live.length) h += '<div class="bvlive">' + live.map(function (b) { return badgeHTML(b); }).join('') + '</div>';
    if (last && last.line) h += '<p class="bvlast' + (last.pieces.length >= 2 ? ' combo' : '') + '" id="bvlastline"><em>' + (last.pieces.length >= 2 ? 'Combination' : 'Last') + '</em> ' + esc(last.line) + '</p>';
    return h;
  }

  /* ------------------------------------------------ on the pitch */
  /* badges drawn beside the man (or at the edge by the line), clear of the
   * dots, the ball and the name tags. dots: [{id, x, y}] in the SVG's
   * coordinates; tags: the page's placed tags ({x, y, w, h}); sc: metres
   * per pixel and the dot radius; fs: the tags' font size */
  function marks(st, roster, pos, tags, sc, fs, ball) {
    var bs = badges(st), out = [];
    if (!bs.length || !pos) return out;
    var dots = [];
    (roster || []).forEach(function (r) { var q = pos[r.id]; if (q) dots.push({ id: r.id, p: r.p || null, x: q.x, y: 105 - q.y }); });
    var boxes = (tags || []).map(function (t) { return { x0: t.x, y0: t.y, x1: t.x + t.w, y1: t.y + t.h }; });
    var r0 = sc.r || 1.3, f = fs * 0.78, hh = f * 1.35;
    function wOf(t) { return t.length * f * 0.56 + f * 1.6; }
    function hits(b) {
      if (b.x0 < -2.6 || b.x1 > 70.6 || b.y0 < -4.2 || b.y1 > 109.2) return true;
      if (boxes.some(function (o) { return b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1; })) return true;
      var pts = dots.concat(ball ? [{ x: ball.x, y: ball.y, r: 0.9 }] : []);
      return pts.some(function (d) { var rr = d.r || r0; var nx = Math.max(b.x0, Math.min(d.x, b.x1)), ny = Math.max(b.y0, Math.min(d.y, b.y1)); return (d.x - nx) * (d.x - nx) + (d.y - ny) * (d.y - ny) < rr * rr; });
    }
    function ring(w, g) {
      return [[g, -hh / 2], [-g - w, -hh / 2], [-w / 2, g], [-w / 2, -g - hh], [g, g * 0.45], [-g - w, g * 0.45], [g, -g * 0.45 - hh], [-g - w, -g * 0.45 - hh]];
    }
    function place(cx, cy, text, pref) {
      var w = wOf(text), cands = pref || ring(w, r0 * 1.1).concat(ring(w, r0 * 2.6)).concat(ring(w, r0 * 4.2));
      for (var k = 0; k < cands.length; k++) {
        var b = { x0: cx + cands[k][0], y0: cy + cands[k][1] }; b.x1 = b.x0 + w; b.y1 = b.y0 + hh;
        if (!hits(b)) { boxes.push(b); b.far = k >= 8; return b; }
      }
      return null;
    }
    /* the last resort: a small sign on the man's own dot (its shape says which state; the words are in the panel and the title) */
    function sign(cx, cy) {
      var rr = r0 * 0.62, spots = [[r0 * 0.8, -r0 * 0.8], [-r0 * 0.8, -r0 * 0.8], [r0 * 0.8, r0 * 0.8], [-r0 * 0.8, r0 * 0.8]];
      for (var k = 0; k < spots.length; k++) {
        var x = cx + spots[k][0], y = cy + spots[k][1], b = { x0: x - rr, y0: y - rr, x1: x + rr, y1: y + rr };
        if (!boxes.some(function (o) { return b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1; })) { boxes.push(b); b.sign = true; b.cx = x; b.cy = y; b.r = rr; return b; }
      }
      return null;
    }
    var idOf = {};
    (roster || []).forEach(function (r) { if (r.p) idOf[r.p.id] = r.id; });
    bs.forEach(function (b) {
      var text, spot = null;
      if (b.target === 'player') {
        var rid = idOf[b.p.id] != null ? idOf[b.p.id] : b.p.id;
        var d = dots.filter(function (q) { return String(q.id) === String(rid); })[0];
        if (!d) return;
        text = b.state === 'booked' ? b.word : b.state === 'adapted' ? 'set: ' + (b.value === 'hard shot' ? 'hard' : 'placed') : b.word;
        spot = place(d.x, d.y, text, ring(wOf(text), r0 * 1.1));
        if (!spot) { text = first(b.p) + ' ' + text; spot = place(d.x, d.y, text, ring(wOf(text), r0 * 2.6).concat(ring(wOf(text), r0 * 4.2)).concat(ring(wOf(text), r0 * 6)).concat(ring(wOf(text), r0 * 8))); if (spot) spot.far = true; }   /* m4: two wider rings, now that the arrows' labels are in the way too */
        if (!spot) { text = ''; spot = sign(d.x, d.y); }
        if (spot) { spot.dx = d.x; spot.dy = d.y; }
      } else {
        /* a line or a team: at the side of the pitch, level with that line's men;
         * their tired line only once it matters (60 or less), the panel has the bars */
        if (b.state === 'tired' && b.value > 60) return;
        var side = b.side, team = side === 'them' ? st.opp : st.squad;
        var li = b.line ? LINES.indexOf(b.line) : 0;
        var men = team.players.filter(function (p) { return p.line === li; });
        var ys = men.map(function (p) { var q = pos[idOf[p.id] != null ? idOf[p.id] : p.id]; return q ? 105 - q.y : null; }).filter(function (y) { return y !== null; });
        var y = ys.length ? ys.reduce(function (a, c) { return a + c; }, 0) / ys.length : (side === 'them' ? 20 : 85);
        text = b.label.replace(/^Their /, 'their ').replace(/^Your /, 'your ');
        if (b.state === 'stretched' || b.target === 'opponent') text = 'their defence stretched';
        var w = wOf(text);
        spot = place(0, y, text, [[0.4, -hh / 2], [67.6 - w, -hh / 2], [0.4, -hh * 1.6], [67.6 - w, -hh * 1.6], [0.4, hh * 0.7], [67.6 - w, hh * 0.7]]);
      }
      if (spot) out.push({ b: b, text: text, x: spot.x0, y: spot.y0, w: spot.x1 - spot.x0, h: hh, f: f, far: !!spot.far, sign: !!spot.sign, cx: spot.cx, cy: spot.cy, r: spot.r, dx: spot.dx, dy: spot.dy });
    });
    return out;
  }
  var SIGN = { unmarked: 'U', marked: 'M', booked: '', 'out of position': 'X', adapted: 'S', 'in form': '+', fresh: 'F', pressed: 'P', fatigued: 'T', tired: 'T', stretched: 'W' };
  function marksSVG(ms) {
    return ms.map(function (m) {
      var head = '<g class="bvm ' + (m.b.side === 'them' ? 'th' : 'yo') + ' s-' + m.b.state.replace(/ /g, '-') + (m.sign ? ' sign' : '') + '" data-state="' + esc(m.b.state) + '" data-who="' + esc(m.b.p ? m.b.p.id : (m.b.side + ':' + (m.b.line || m.b.target))) + '">' +
        '<title>' + esc(badgeTitle(m.b)) + '</title>';
      if (m.sign) {
        return head + (m.b.state === 'booked' ? '<rect x="' + (m.cx - m.r * 0.6).toFixed(2) + '" y="' + (m.cy - m.r * 0.85).toFixed(2) + '" width="' + (m.r * 1.2).toFixed(2) + '" height="' + (m.r * 1.7).toFixed(2) + '" rx="' + (m.r * 0.15).toFixed(2) + '" class="card"/>' :
          '<circle cx="' + m.cx.toFixed(2) + '" cy="' + m.cy.toFixed(2) + '" r="' + m.r.toFixed(2) + '" stroke-width="' + (m.r * 0.18).toFixed(3) + '"/><text x="' + m.cx.toFixed(2) + '" y="' + (m.cy + m.r * 0.08).toFixed(2) + '" text-anchor="middle" style="font-size:' + (m.r * 1.3).toFixed(2) + 'px">' + SIGN[m.b.state] + '</text>') + '</g>';
      }
      if (m.far && m.dx != null) {
        var ex = Math.max(m.x, Math.min(m.dx, m.x + m.w)), ey = Math.max(m.y, Math.min(m.dy, m.y + m.h));
        head += '<line x1="' + m.dx.toFixed(2) + '" y1="' + m.dy.toFixed(2) + '" x2="' + ex.toFixed(2) + '" y2="' + ey.toFixed(2) + '" stroke-width="' + (m.f * 0.07).toFixed(3) + '"/>';
      }
      return head +
        '<rect x="' + m.x.toFixed(2) + '" y="' + m.y.toFixed(2) + '" width="' + m.w.toFixed(2) + '" height="' + m.h.toFixed(2) + '" rx="' + (m.h / 2).toFixed(2) + '" stroke-width="' + (m.f * 0.08).toFixed(3) + '"/>' +
        '<text x="' + (m.x + m.w / 2).toFixed(2) + '" y="' + (m.y + m.h / 2 + m.f * 0.05).toFixed(2) + '" text-anchor="middle" style="font-size:' + m.f.toFixed(2) + 'px">' + esc(m.text) + '</text></g>';
    }).join('');
  }

  /* ------------------------------------------------ 5. FULL TIME */
  function ftModel(st, picks) {
    if (!active(st)) return null;
    var f = fires(st), fx = st.fx, rows = [], seen = {};
    fx.inst.forEach(function (x) {
      if ((x.side || 'you') !== 'you' || seen[x.name]) return; seen[x.name] = 1;
      rows.push({ source: x.name, name: pieceName(x.name), n: f[x.name] || 0 });
    });
    rows.sort(function (a, b) { return b.n - a.n; });
    var best = null, touched = 0, yours = 0, combos = 0;
    (picks || []).forEach(function (pk) {
      var c = pk.bv || combo(pk.ev, pk.o, st);
      if (pk.ev.sit && pk.ev.sit.who === 'you') yours++;
      if (c.pieces.length) touched++;
      if (c.pieces.length >= 2) combos++;
      var score = c.pieces.length * 10 + (pk.ev.kind === 'goal' ? 25 : 0) + (pk.ev.band === 'good' ? 4 : pk.ev.band === 'mixed' ? 2 : 0);
      if (c.pieces.length >= 2 && (!best || score > best.score)) best = { score: score, minute: pk.ev.minute, line: c.line, name: c.name, what: pk.ev.hd ? pk.ev.hd.text : (pk.ev.headline || pk.ev.short || ''), kind: pk.ev.kind };
    });
    /* goals in attacks where a piece of yours acted (the goal's decision, or one before it in the same attack) */
    var goals = 0, built = 0, attackHad = false;
    (picks || []).forEach(function (pk, i) {
      var c = pk.bv || combo(pk.ev, pk.o, st);
      var starts = i === 0 || !(pk.cont);
      if (starts) attackHad = false;
      if (c.pieces.length) attackHad = true;
      if (pk.ev.kind === 'goal') { goals++; if (attackHad) built++; }
    });
    var total = (picks || []).length;
    /* the resource it ran on, where it moved: their most tired line at the end */
    var low = null;
    LINES.forEach(function (l) { var L = fx.legsOf('them', l); if (L < 100 && (!low || L < low.v)) low = { l: l, v: Math.round(L) }; });
    var changed = 'Your pieces acted on ' + touched + ' of your ' + total + ' decisions' + (combos ? ', ' + combos + ' of them with two or more pieces at once' : '') +
      (goals ? '; ' + built + ' of your ' + goals + (goals === 1 ? ' goal' : ' goals') + ' came in an attack where a piece of yours acted' : '') + '.' +
      (low ? ' Their ' + LW[low.l] + ' finished on ' + low.v + ' of 100 stamina' + (low.v < 40 ? ' (tired)' : '') + '.' : '');
    return { rows: rows, best: best, changed: changed, touched: touched, total: total, combos: combos, goals: goals, built: built };
  }
  function ftHTML(st, picks, build, nm) {
    var m = ftModel(st, picks);
    if (!m) return '';
    nm = nm || esc;
    var rows = m.rows.filter(function (r) { return r.n > 0; }), idle = m.rows.filter(function (r) { return !r.n; });
    return '<div class="ft-build" id="bvft"><p class="obe-h">Your build: ' + esc(build.name || build.id) + '</p>' +
      '<p class="bvft-rows">' + rows.map(function (r) { return '<span class="bvpc"><em>' + esc(r.name) + '</em><b>' + r.n + '</b></span>'; }).join('') +
        (idle.length ? '<span class="bvft-idle">Never fired: ' + esc(idle.map(function (r) { return r.name; }).join(', ')) + '</span>' : '') + '</p>' +
      (m.best ? '<p class="bvft-best"><b>Best combination, ' + esc(m.best.minute) + '\'</b>' + nm(m.best.line) + (m.best.what ? ' <span class="bvft-what">(' + nm(unstop(m.best.what)) + ')</span>' : '') + '</p>'
        : '<p class="bvft-best"><b>Best combination</b>No decision had two pieces at once.</p>') +
      '<p class="bvft-chg">' + esc(m.changed) + '</p></div>';
  }

  /* ------------------------------------------------ the styles */
  var CSS = [
    ':root{--bv-state:#8fd0ff;--bv-pen:#ff9f5a}',
    ':root[data-theme="light"]{--bv-state:#1f6aa8;--bv-pen:#b3541e}',
    '@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bv-state:#1f6aa8;--bv-pen:#b3541e}}',
    /* the chips on a card */
    '.bvp{display:inline-flex;align-items:baseline;gap:4px;font:700 11px/1.25 ui-sans-serif,system-ui;padding:1px 7px;margin:2px 0 0 6px;border-radius:99px;vertical-align:1px;white-space:nowrap;',
    '  border:1px solid color-mix(in srgb,var(--gold) 60%,transparent);color:var(--gold);background:color-mix(in srgb,var(--gold) 8%,transparent);cursor:help}',
    '.bvp .bvt{font-weight:900;color:var(--ink)}',
    '.bvp.carried{border-style:solid;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 30%,transparent)}',
    '.bvp.pen{border:1px dashed var(--bv-pen);color:var(--bv-pen);background:color-mix(in srgb,var(--bv-pen) 9%,transparent)}',
    '.bvp.pen .bvt{color:var(--bv-pen)}',
    '.bvp.them{border-color:color-mix(in srgb,var(--warn) 60%,transparent);color:var(--warn);background:transparent}',
    '.bvp.them i{font-style:normal;font-size:9px}',
    '.bvp.sys{border:1px solid color-mix(in srgb,var(--bv-state) 55%,transparent);color:var(--bv-state);background:transparent}',
    '.bvs{display:inline-flex;align-items:center;gap:3px;font:700 10.5px/1.25 ui-sans-serif,system-ui;padding:1px 7px 1px 5px;margin:2px 0 0 6px;border-radius:5px;white-space:nowrap;',
    '  border:1px solid color-mix(in srgb,var(--bv-state) 60%,transparent);color:var(--bv-state);background:color-mix(in srgb,var(--bv-state) 8%,transparent);cursor:help}',
    '.bvs.th{border-style:dashed}',
    '.bvs i{font-style:normal;font-size:10px;line-height:1}',
    /* the lean card: the chips on their own line under the action */
    '.opt.lean .lact .bvp:first-of-type,.opt.lean .lact .bvs.onc:first-of-type{margin-left:6px}',
    /* the details: one line a piece */
    '.bvd{display:block;margin-top:6px;padding-top:5px;border-top:1px solid var(--line)}',
    '.bvdl{display:block;font-size:12.5px;line-height:1.4;color:var(--gold);margin:0 0 2px}',
    '.bvdl .bvn{font-weight:800}',
    '.bvdl.pen{color:var(--bv-pen)} .bvdl.them{color:var(--warn)} .bvdl.sys{color:var(--bv-state)} .bvdl.st .bvs{margin-left:0;margin-right:4px}',
    /* the panel */
    '#bvpanel{margin:10px 0 0;padding:9px 11px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--gold) 45%,transparent);',
    '  background:color-mix(in srgb,var(--gold) 6%,var(--surface,transparent));font-size:12.5px;line-height:1.4}',
    '#bvpanel:empty{display:none}',
    '#bvpanel .bvh{display:flex;align-items:baseline;gap:8px}',
    '#bvpanel .bvk{font:800 10.5px ui-sans-serif,system-ui;letter-spacing:.09em;text-transform:uppercase;color:var(--gold)}',
    '#bvpanel .bvh b{font-size:14px;color:var(--ink)}',
    '#bvpanel .bve{margin:2px 0 6px;color:var(--muted);font-size:12px;line-height:1.35;cursor:help}',
    '#bvpanel .bve i{font-style:normal}',
    '#bvpanel .bvps{display:flex;flex-wrap:wrap;gap:4px}',
    '.bvpc{display:inline-flex;align-items:center;gap:5px;font:700 11.5px/1.3 ui-sans-serif,system-ui;padding:2px 4px 2px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--gold) 55%,transparent);color:var(--ink);cursor:help}',
    '.bvpc b{display:inline-block;min-width:17px;text-align:center;padding:0 4px;border-radius:99px;background:color-mix(in srgb,var(--gold) 30%,transparent);font-weight:900}',
    '.bvpc em{font-style:normal}',
    '.bvpc.zero{opacity:.55;border-style:dashed} .bvpc.off{opacity:.4;text-decoration:line-through}',
    '.bvpc.fired{border-color:var(--gold);background:color-mix(in srgb,var(--gold) 18%,transparent);animation:bvpulse 1.4s ease-out 1}',
    '@keyframes bvpulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--gold) 75%,transparent)}100%{box-shadow:0 0 0 9px transparent}}',
    '@media (prefers-reduced-motion:reduce){.bvpc.fired{animation:none;outline:2px solid var(--gold)}}',
    'body.a11y-reduced .bvpc.fired{animation:none;outline:2px solid var(--gold)}',
    '#bvpanel .bvres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px 10px;margin:7px 0 0}',
    '.bvbar{display:grid;grid-template-columns:1fr auto;align-items:center;gap:0 6px;font-size:11px}',
    '.bvbar em{font-style:normal;color:var(--muted);grid-column:1 / 3;white-space:nowrap}',
    '.bvbar i{position:relative;height:6px;border-radius:3px;background:color-mix(in srgb,var(--ink) 14%,transparent);overflow:hidden}',
    '.bvbar i u{position:absolute;left:0;top:0;bottom:0;background:var(--bv-state);border-radius:3px}',
    '.bvbar.you i u{background:var(--accent)}',
    '.bvbar i s{position:absolute;left:40%;top:-1px;bottom:-1px;width:1px;background:var(--ink);opacity:.55}',
    '.bvbar b{font-weight:800;color:var(--ink);min-width:22px;text-align:right}',
    '.bvbar.lo i u{background:var(--gold)} .bvbar.lo b{color:var(--gold)}',
    '#bvpanel .bvcount{margin:5px 0 0;font-size:11.5px} #bvpanel .bvcount em{font-style:normal;color:var(--muted)}',
    '#bvpanel .bvlive{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0 0} #bvpanel .bvlive .bvs{margin:0}',
    '#bvpanel .bvlast{margin:7px 0 0;padding-top:6px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink)}',
    '#bvpanel .bvlast em{font:800 10.5px ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-style:normal;margin-right:4px}',
    '#bvpanel .bvlast.combo em{color:var(--gold)}',
    /* the result box: the combination named under the headline */
    '.duelbox .result .bvcombo{display:block;margin-top:3px;font:800 11.5px/1.3 ui-sans-serif,system-ui;color:var(--gold)}',
    '.duelbox .result .bvcombo.off{visibility:hidden}',
    /* the pitch */
    '#bvmarks .bvm rect{fill:rgba(8,14,24,.86);stroke:var(--bv-state)}',
    '#bvmarks .bvm.th rect{stroke-dasharray:.6 .35}',
    '#bvmarks .bvm text{fill:#cfeaff;font-weight:800;font-family:ui-sans-serif,system-ui,"Segoe UI",sans-serif;dominant-baseline:central}',
    '#bvmarks .bvm.s-booked rect{stroke:#f4d03f} #bvmarks .bvm.s-booked text{fill:#f4d03f}',
    '#bvmarks .bvm line{stroke:var(--bv-state);opacity:.8}',
    '#bvmarks .bvm.sign circle{fill:rgba(8,14,24,.92);stroke:var(--bv-state)} #bvmarks .bvm.sign text{fill:#cfeaff}',
    '#bvmarks .bvm.sign rect.card{fill:#f4d03f;stroke:rgba(0,0,0,.6);stroke-width:.12}',
    /* full time */
    '@media (min-width:641px){.obe.ft2 .ft-two.bv3{grid-template-columns:minmax(0,1.2fr) minmax(0,1.25fr) minmax(0,.7fr)}}',
    '.obe.ft2 .ft-build{min-width:0;border-radius:12px;padding:10px 14px;background:rgba(0,0,0,.24);border:1px solid color-mix(in srgb,#e0b000 45%,transparent);color:#fff}',
    '.obe.ft2 .ft-build .bvpc{color:#fff;border-color:rgba(224,176,0,.55)} .obe.ft2 .ft-build .bvpc b{background:rgba(224,176,0,.3)}',
    '.ft-build .bvft-rows{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 6px}',
    '.ft-build .bvft-idle{font-size:11.5px;color:var(--muted,#aab);align-self:center}',
    '.ft-build .bvft-best,.ft-build .bvft-chg{margin:0 0 5px;font-size:13px;line-height:1.35}',
    '.ft-build .bvft-best b{display:block;font:800 10.5px ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;color:var(--gold,#e0b000)}',
    '.ft-build .bvft-what{color:var(--muted,#aab)}',
    '.ft-build .bvft-chg{color:var(--muted,#aab);font-size:12.5px}'
  ].join('\n');
  var cssDone = false;
  function css() {
    if (cssDone || typeof document === 'undefined' || !document.head) return;
    var s = document.createElement('style'); s.id = 'bvcss'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
  }

  var API = { stateRead: stateRead, active: active, pieces: pieces, shown: shown, badges: badges, cardBadges: cardBadges, cardChipsHTML: cardChipsHTML, creditedUse: creditedUse,
    creditedMod: creditedMod, detailsHTML: detailsHTML, combo: combo, carriedFx: carriedFx, panelModel: panelModel, panelHTML: panelHTML, fires: fires,
    marks: marks, marksSVG: marksSVG, ftModel: ftModel, ftHTML: ftHTML, css: css, CSS: CSS, pieceName: pieceName, recShort: recShort,
    setBreak: function (b) { BREAK = b || null; }, get BREAK() { return BREAK; } };
  root.KMBuildViz = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
