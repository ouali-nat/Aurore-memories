/* Aurore Mémoire — navigation fiable par document complet.
   Le routeur SPA précédent remplaçait seulement <main>, chargeait les scripts
   séquentiellement et pouvait laisser l'interface dans un état partiellement
   initialisé sur les connexions mobiles lentes. On conserve l'API appelée par
   les pages, mais on confie désormais la navigation au navigateur.
   Aucun stockage local, IndexedDB, cache ou donnée utilisateur n'est supprimé. */
(function () {
  "use strict";
  if (window.__auroreReliableNavigationReady) return;
  window.__auroreReliableNavigationReady = true;
  window.auroreNavigate = function (value, options) {
    var target;
    try { target = new URL(value, window.location.href); }
    catch (_) { window.location.assign(String(value)); return false; }
    if (target.origin !== window.location.origin || !/^https?:$/.test(target.protocol)) {
      window.location.assign(target.href);
      return false;
    }
    options = options || {};
    if (options.replace) window.location.replace(target.href);
    else window.location.assign(target.href);
    return true;
  };
})();
