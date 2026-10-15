(function () {
  "use strict";

  // Keep every Aurore Mémoire page on the stable production domain.
  // Deployment-specific Vercel URLs are temporary and must never become navigation/share origins.
  var AURORE_CANONICAL_HOST = "aurore-memories-aurore9.vercel.app";
  var currentHost = String(window.location.hostname || "").toLowerCase();
  if (currentHost !== AURORE_CANONICAL_HOST &&
      /^aurore-memories(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(currentHost)) {
    var canonicalUrl = new URL(window.location.href);
    canonicalUrl.hostname = AURORE_CANONICAL_HOST;
    window.location.replace(canonicalUrl.toString());
    return;
  }

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

  function formalizeText(value) {
    var text = String(value == null ? "" : value);
    [
      [/\bque souhaites-tu\b/gi, "quel espace souhaitez-vous"],
      [/\bpar où veux-tu\b/gi, "par où souhaitez-vous"],
      [/\btu peux\b/gi, "vous pouvez"],
      [/\btes\b/gi, "vos"], [/\bton\b/gi, "votre"], [/\bta\b/gi, "votre"],
      [/\btoi\b/gi, "vous"], [/\btu\b/gi, "vous"]
    ].forEach(function (entry) { text = text.replace(entry[0], entry[1]); });
    var verbs = {
      "Apprends":"Apprenez","apprends":"apprenez","Retiens":"Retenez","retiens":"retenez",
      "Retrouve":"Retrouvez","retrouve":"retrouvez","Organise":"Organisez","organise":"organisez",
      "Accède":"Accédez","accède":"accédez","Révise":"Révisez","révise":"révisez",
      "Ajoute":"Ajoutez","ajoute":"ajoutez","Découvre":"Découvrez","découvre":"découvrez",
      "Indique":"Indiquez","indique":"indiquez","Écoute":"Écoutez","écoute":"écoutez",
      "Utilise":"Utilisez","utilise":"utilisez","Récupère":"Récupérez","récupère":"récupérez",
      "Reconstruis":"Reconstruisez","reconstruis":"reconstruisez","Écris":"Écrivez","écris":"écrivez",
      "Distingue":"Distinguez","distingue":"distinguez","Prononce":"Prononcez","prononce":"prononcez",
      "Entraîne":"Entraînez","entraîne":"entraînez","Rassemble":"Rassemblez","rassemble":"rassemblez",
      "Prépare":"Préparez","prépare":"préparez","Consulte":"Consultez","consulte":"consultez",
      "Choisis":"Choisissez","choisis":"choisissez","Sélectionne":"Sélectionnez","sélectionne":"sélectionnez",
      "Clique":"Cliquez","clique":"cliquez","Valide":"Validez","valide":"validez",
      "Annule":"Annulez","annule":"annulez","Supprime":"Supprimez","supprime":"supprimez",
      "Modifie":"Modifiez","modifie":"modifiez","Ouvre":"Ouvrez","ouvre":"ouvrez",
      "Ferme":"Fermez","ferme":"fermez","Recommence":"Recommencez","recommence":"recommencez",
      "Essaie":"Essayez","essaie":"essayez","Vérifie":"Vérifiez","vérifie":"vérifiez",
      "Regarde":"Regardez","regarde":"regardez","Réponds":"Répondez","réponds":"répondez",
      "Tape":"Tapez","tape":"tapez","Déplace":"Déplacez","déplace":"déplacez",
      "Exporte":"Exportez","exporte":"exportez","Importe":"Importez","importe":"importez",
      "Télécharge":"Téléchargez","télécharge":"téléchargez","Parle":"Parlez","parle":"parlez",
      "Active":"Activez","active":"activez","Désactive":"Désactivez","désactive":"désactivez",
      "Laisse":"Laissez","laisse":"laissez","Donne":"Donnez","donne":"donnez",
      "Fais":"Faites","fais":"faites","Souhaites":"Souhaitez","souhaites":"souhaitez",
      "Crée":"Créez","crée":"créez"
    };
    Object.keys(verbs).sort(function (a,b) { return b.length-a.length; }).forEach(function (word) {
      text = text.replace(new RegExp("\\b" + word + "\\b", "g"), verbs[word]);
    });
    return text;
  }
  function formalizeInterface(rootNode) {
    if (!rootNode) return;
    var protectedSelector = "script,style,textarea,input,select,option,code,pre,.katex,.katex-display,.memory-row-main,.workspace-chunk,#reviewApp,.practice-answer-final,.memory-block,.public-flashcard,.public-card-user-content";
    if (rootNode.nodeType === 3) {
      if (!rootNode.parentElement || rootNode.parentElement.closest(protectedSelector)) return;
      var nextText = formalizeText(rootNode.nodeValue);
      if (nextText !== rootNode.nodeValue) rootNode.nodeValue = nextText;
      return;
    }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9) return;
    if (rootNode.nodeType === 1 && rootNode.matches(protectedSelector)) return;
    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.parentElement || node.parentElement.closest(protectedSelector)) return;
      var nextText = formalizeText(node.nodeValue);
      if (nextText !== node.nodeValue) node.nodeValue = nextText;
    });
    if (rootNode.querySelectorAll) {
      rootNode.querySelectorAll("[title],[aria-label],[placeholder]").forEach(function (element) {
        ["title","aria-label","placeholder"].forEach(function (attr) {
          if (!element.hasAttribute(attr) || element.matches("input,textarea,select")) return;
          var oldValue = element.getAttribute(attr), nextValue = formalizeText(oldValue);
          if (nextValue !== oldValue) element.setAttribute(attr,nextValue);
        });
      });
    }
  }
  formalizeInterface(document.body);
  if (window.MutationObserver && document.body) {
    var interfaceMutationRoots = [];
    var interfaceMutationFrame = 0;
    function queueInterfaceMutation(node) {
      if (!node) return;
      var target = node.nodeType === 3 ? node.parentElement : node;
      if (!target || (target.closest && target.closest(".katex,.katex-display"))) return;
      for (var i = interfaceMutationRoots.length - 1; i >= 0; i--) {
        var previous = interfaceMutationRoots[i];
        if (previous === target || (previous.contains && previous.contains(target))) return;
        if (target.contains && target.contains(previous)) interfaceMutationRoots.splice(i, 1);
      }
      interfaceMutationRoots.push(target);
      if (interfaceMutationFrame) return;
      var schedule = window.requestAnimationFrame || function (callback) {
        return window.setTimeout(callback, 16);
      };
      interfaceMutationFrame = schedule(function () {
        interfaceMutationFrame = 0;
        var roots = interfaceMutationRoots.splice(0);
        roots.forEach(function (rootNode) { formalizeInterface(rootNode); });
      }) || 1;
    }
    var interfaceObserver = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(queueInterfaceMutation);
      });
    });
    interfaceObserver.observe(document.body, {childList:true,subtree:true});
  }

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