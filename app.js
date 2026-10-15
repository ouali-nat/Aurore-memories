(function () {
  "use strict";

  var themes = [
    "violet", "rouge", "vert", "bleu", "orange", "rose", "indigo", "emeraude", "lime",
    "corail", "bordeaux", "azur", "petrole-cuivre", "nuit-peche", "prune-rouge",
    "terre-orange", "rose-sable", "sarcelle-creme"
  ];
  var root = document.documentElement;
  var themeToggle = document.getElementById("themeToggle");
  var colorToggle = document.getElementById("colorThemeToggle");
  var colorPanel = document.getElementById("colorThemePanel");
  var toastTimer = null;
  var systemPreference = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  var appearancePreference = "system";

  function toast(message) {
    var box = document.getElementById("toast");
    if (!box) return;
    box.textContent = String(message);
    box.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      box.classList.remove("show");
    }, 2800);
  }
  window.auroreToast = toast;

  function setTheme(mode, persist) {
    appearancePreference = ["system", "light", "dark"].indexOf(mode) !== -1 ? mode : "system";
    var value = appearancePreference === "system"
      ? (systemPreference && systemPreference.matches ? "light" : "dark")
      : appearancePreference;
    root.dataset.theme = value;
    if (themeToggle) {
      var label = appearancePreference === "system" ? "automatique" : (value === "light" ? "clair" : "sombre");
      themeToggle.textContent = appearancePreference === "system" ? "◐" : (value === "light" ? "☾" : "☼");
      themeToggle.setAttribute("aria-label", "Apparence " + label + ". Cliquer pour passer au mode suivant.");
      themeToggle.title = "Apparence : " + label + " — cliquer pour modifier";
      themeToggle.dataset.appearanceMode = appearancePreference;
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) { button.setAttribute("aria-pressed", button.dataset.themeChoice === appearancePreference ? "true" : "false"); });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", value === "light" ? "#F7F7FA" : "#111019");
    if (persist) {
      try { localStorage.setItem("aurore-memory-theme", appearancePreference); } catch (e) {}
    }
  }

  function setColor(name, persist) {
    var value = themes.indexOf(name) !== -1 ? name : "violet";
    root.dataset.colorTheme = value;
    document.querySelectorAll("[data-color-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.colorChoice === value ? "true" : "false");
    });
    if (persist) {
      try { localStorage.setItem("aurore-memory-color-theme", value); } catch (e) {}
    }
  }

  if (themeToggle && themeToggle.parentElement && !document.querySelector(".theme-mode-choices")) {
    var themeChoices = document.createElement("div");
    themeChoices.className = "theme-mode-choices";
    themeChoices.setAttribute("role", "group");
    themeChoices.setAttribute("aria-label", "Choisir le thème d’affichage");
    themeChoices.innerHTML = '<button type="button" data-theme-choice="light" aria-pressed="false">Clair</button><button type="button" data-theme-choice="dark" aria-pressed="false">Sombre</button><button type="button" data-theme-choice="system" aria-pressed="false">Auto</button>';
    themeToggle.parentElement.insertBefore(themeChoices, themeToggle);
    themeToggle.hidden = true;
    themeChoices.addEventListener("click", function (event) { var choice = event.target.closest("[data-theme-choice]"); if (choice) setTheme(choice.dataset.themeChoice, true); });
  }

  document.querySelectorAll(".top-actions a[href=\"mes-memoires.html\"]").forEach(function (link) { link.href = "choisir.html"; link.textContent = "Bibliothèque"; });

  try {
    setTheme(localStorage.getItem("aurore-memory-theme") || "system", false);
    setColor(localStorage.getItem("aurore-memory-color-theme") || "violet", false);
  } catch (e) {
    setTheme("system", false);
    setColor("violet", false);
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var modes = ["system", "light", "dark"];
      setTheme(modes[(modes.indexOf(appearancePreference) + 1) % modes.length], true);
    });
  }

  if (systemPreference) {
    var systemChanged = function () { if (appearancePreference === "system") setTheme("system", false); };
    if (systemPreference.addEventListener) systemPreference.addEventListener("change", systemChanged);
    else if (systemPreference.addListener) systemPreference.addListener(systemChanged);
  }

  document.querySelectorAll(".site-footer .footer-inner small").forEach(function (node) {
    node.textContent = "Un espace dédié à l’apprentissage et à la mémorisation.";
  });

  if (colorToggle && colorPanel) {
    colorToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var opening = colorToggle.getAttribute("aria-expanded") !== "true";
      colorToggle.setAttribute("aria-expanded", opening ? "true" : "false");
      colorPanel.hidden = !opening;
    });

    colorPanel.addEventListener("click", function (event) {
      var choice = event.target.closest("[data-color-choice]");
      if (!choice) return;
      setColor(choice.dataset.colorChoice, true);
      colorPanel.hidden = true;
      colorToggle.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", function (event) {
      if (!event.target.closest(".color-theme-wrap")) {
        colorPanel.hidden = true;
        colorToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        colorPanel.hidden = true;
        colorToggle.setAttribute("aria-expanded", "false");
      }
    });
  }
})();