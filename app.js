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

  // Share the three small home counters without parsing the full card store on every return.
  window.auroreUpdateMemoryHomeStats = function (cards) {
    try {
      var today = Math.floor(Date.now() / 86400000);
      var memoryDecks = Object.create(null), flashcardDecks = Object.create(null), due = 0;
      (Array.isArray(cards) ? cards : []).forEach(function (card) {
        card = card && typeof card === "object" ? card : {};
        var kind = card.kind === "memory" ? "memory" : card.kind === "flashcard" ? "flashcard" :
          (/(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(card.front || "")) ? "memory" : "flashcard");
        var deck = typeof card.deck === "string" && card.deck.trim() ? card.deck : "Ma mémoire";
        (kind === "memory" ? memoryDecks : flashcardDecks)[deck] = true;
        var dueDate = typeof card.due === "number" && isFinite(card.due) ? card.due : today;
        if (dueDate <= today) due += 1;
      });
      localStorage.setItem("aurore-memory-home-stats-v1", JSON.stringify({
        memories: Object.keys(memoryDecks).length,
        series: Object.keys(flashcardDecks).length,
        due: due
      }));
      return true;
    } catch (error) {
      try { localStorage.removeItem("aurore-memory-home-stats-v1"); } catch (cacheError) {}
      return false;
    }
  };

  // Règles précompilées une seule fois : ne pas trier ni créer des RegExp par mot.
  var formalizePhraseReplacements = [
    [/\bque souhaites-tu\b/gi, "quel espace souhaitez-vous"],
    [/\bpar où veux-tu\b/gi, "par où souhaitez-vous"],
    [/\btu peux\b/gi, "vous pouvez"],
    [/\btes\b/gi, "vos"], [/\bton\b/gi, "votre"], [/\bta\b/gi, "votre"],
    [/\btoi\b/gi, "vous"], [/\btu\b/gi, "vous"]
  ];
  var formalizeVerbs = {
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
  var formalizeVerbPattern = new RegExp(
    "\\b(" + Object.keys(formalizeVerbs).sort(function (a, b) { return b.length - a.length; }).join("|") + ")\\b",
    "g"
  );
  function formalizeText(value) {
    var text = String(value == null ? "" : value);
    for (var i = 0; i < formalizePhraseReplacements.length; i += 1) {
      text = text.replace(formalizePhraseReplacements[i][0], formalizePhraseReplacements[i][1]);
    }
    return text.replace(formalizeVerbPattern, function (word) {
      return formalizeVerbs[word] || word;
    });
  }

  var protectedInterfaceSelector = "script,style,textarea,input,select,option,code,pre,.katex,.katex-display,.memory-row-main,.workspace-chunk,#reviewApp,.practice-answer-final,.memory-block,.public-flashcard,.public-card-user-content";
  function formalizeInterface(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) {
      if (!rootNode.parentElement || rootNode.parentElement.closest(protectedInterfaceSelector)) return;
      var nextText = formalizeText(rootNode.nodeValue);
      if (nextText !== rootNode.nodeValue) rootNode.nodeValue = nextText;
      return;
    }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9) return;
    if (rootNode.nodeType === 1 &&
        (rootNode.matches(protectedInterfaceSelector) ||
         (rootNode.parentElement && rootNode.parentElement.closest(protectedInterfaceSelector)))) return;

    // Un parcours en flux évite un grand tableau de nœuds; les sous-arbres
    // lourds ou générés sont rejetés avant que leurs descendants soient parcourus.
    var walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (node.nodeType === 1) {
            if (node.matches(protectedInterfaceSelector)) return NodeFilter.FILTER_REJECT;
            return node.hasAttribute("title") || node.hasAttribute("aria-label") || node.hasAttribute("placeholder")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        var nextText = formalizeText(node.nodeValue);
        if (nextText !== node.nodeValue) node.nodeValue = nextText;
        continue;
      }
      ["title", "aria-label", "placeholder"].forEach(function (attr) {
        if (!node.hasAttribute(attr) || node.matches("input,textarea,select")) return;
        var oldValue = node.getAttribute(attr), nextValue = formalizeText(oldValue);
        if (nextValue !== oldValue) node.setAttribute(attr, nextValue);
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
      if (!target || (target.closest && target.closest(protectedInterfaceSelector))) return;
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