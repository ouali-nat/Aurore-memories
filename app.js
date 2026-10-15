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
    var value = mode === "light" ? "light" : "dark";
    root.dataset.theme = value;
    if (themeToggle) {
      themeToggle.textContent = value === "light" ? "☾" : "☼";
      themeToggle.setAttribute("aria-label", value === "light" ? "Activer le thème sombre" : "Activer le thème clair");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", value === "light" ? "#F7F7FA" : "#111019");
    if (persist) {
      try { localStorage.setItem("aurore-memory-theme", value); } catch (e) {}
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

  try {
    setTheme(localStorage.getItem("aurore-memory-theme") || "dark", false);
    setColor(localStorage.getItem("aurore-memory-color-theme") || "violet", false);
  } catch (e) {
    setTheme("dark", false);
    setColor("violet", false);
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      setTheme(root.dataset.theme === "light" ? "dark" : "light", true);
    });
  }

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