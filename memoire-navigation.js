/* Navigation hiérarchique de la bibliothèque : revenir au choix des espaces. */
(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  var view = params.get("view") || "all";
  var back = document.querySelector(".page-heading .back-link");
  if (!back) return;

  if (view === "memories" || view === "cards") {
    back.href = "mes-memoires.html";
    back.textContent = "← Choisir un espace";
    back.setAttribute("aria-label", "Revenir au choix entre mémoires et séries de cartes");
  } else {
    back.href = "index.html";
    back.textContent = "← Accueil";
    back.setAttribute("aria-label", "Revenir à l’accueil Aurore Mémoire");
  }
})();
