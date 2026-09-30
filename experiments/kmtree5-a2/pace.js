/* pace.js (m6, from pace1): the rhythm switch m6 keeps, ON by default.
 *
 *   micro (default on; ?micro=0 turns it off): a decision that goes on in
 *        the same play, when the ball has not reached the next spot by the
 *        time the sequence ends, plays the rest of its move in at most
 *        MICRO seconds (eased, landing on its last frame) instead of a jump.
 *
 * pace1's breather is not here: hd1's 0.6 s breather after the headline
 * (headline.js PACE.breather) already gives every result its still beat, so
 * adding pace1's would double it. pace1's ramp, seglen and quick stay in
 * pace1 as experiments (RHYTHM.md recommends ramp off and play length 5 s).
 *
 * Show only: nothing here reads or writes the match. */
(function (root) {
  'use strict';
  var MICRO = 1.0;          // seconds for the rest of a result's move
  function flags(search) {
    search = search || '';
    var f = { micro: true, breather: 0, ramp: false, seglen: null, quick: false };
    var m = /[?&]micro=([01])\b/.exec(search);
    if (m) f.micro = m[1] === '1';
    f.any = f.micro;
    return f;
  }
  var API = { MICRO: MICRO, flags: flags, QUICK: { speed: 2, seq: 0.5 } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.KMPace = API;
})(typeof window !== 'undefined' ? window : this);
