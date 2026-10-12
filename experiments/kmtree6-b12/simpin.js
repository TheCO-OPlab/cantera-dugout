/* simpin.js (kmtree6 b1, stream PLAY): THE ONE PINNED PATH to the world release the sim mode plays. A new release of stream SIM
 * (kmtree6/sim/rel/vN/) drops in by changing this file only (path, name, md5), in a new build folder (bN). The page loads it with
 * document.write right after this file; node requires it (sim_lib.js). The release file must define window.KMSimWorld / module.exports
 * { World } speaking the brief's world API (BRIEF-night-10-07.md); simrel/make_standin.js shows how a plain sd_world-style module is wrapped. */
(function (root) {
  var PIN = { name: 'sim v4', path: 'simrel/sim-v4/world.js', md5: '12a8941fd21ea24d47e2cf1a2248d312', rel: '../sim/rel/v4/sim_world.js', relMd5: '419b6e85988d8860201382ecd9dd40f3' };
  root.KMSimPin = PIN;
  if (typeof module !== 'undefined' && module.exports) module.exports = PIN;
})(typeof window !== 'undefined' ? window : globalThis);
