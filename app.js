(function () {
  "use strict";
  if (document.querySelector('script[src*="math-render.js"]')) return;
  var script = document.createElement("script");
  script.src = "math-render.js?v=20261024-global-math-normalizer-v1";
  script.defer = true;
  document.head.appendChild(script);
})();
// Aurore Mémoire — design « pilule flottante » : feuille de style chargée sur toutes les pages, en dernier.
(function () {
  if (document.querySelector('link[data-aurore-pill]')) return;
  var pill = document.createElement("link");
  pill.rel = "stylesheet";
  pill.href = "aurore-pill.css?v=20261026-navigation-spacing-v2";
  pill.setAttribute("data-aurore-pill", "1");
  document.head.appendChild(pill);
})();

(function () {
  "use strict";

  // Keep every Aurore Mémoire page on the stable production domain.
  // Deployment-specific Vercel URLs are temporary and must never become navigation/share origins.
  var AURORE_CANONICAL_HOST = "aurore-memories-mu.vercel.app";
  var currentHost = String(window.location.hostname || "").toLowerCase();
  var legacyCardsPresent = false;
  try {
    var legacyStore = JSON.parse(localStorage.getItem("aurore-memory-cards-v1") || "{}");
    legacyCardsPresent = !!(legacyStore && Array.isArray(legacyStore.cards) && legacyStore.cards.length);
  } catch (_) {}
  var isLegacyMuHost = currentHost === "aurore-memories-mu.vercel.app";
  if (currentHost !== AURORE_CANONICAL_HOST &&
      /^aurore-memories(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(currentHost) &&
      !(isLegacyMuHost && legacyCardsPresent)) {
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
    var value = themes.indexOf(name) !== -1 ? name : "rose";
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
    setColor(localStorage.getItem("aurore-memory-color-theme") || "rose", false);
  } catch (e) {
    setTheme("system", false);
    setColor("rose", false);
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
  // Navigation hiérarchique : toujours utiliser l'URL active, même après une transition SPA.
  (function installHierarchicalNavigation() {
    var PARENT_KEY = "aurore-memory-navigation-parents-v1";
    function currentRoute(){try{return new URL(window.location.href)}catch(e){return null}}
    function routeKey(url){return url.pathname+url.search}
    function readParents(){try{var v=JSON.parse(sessionStorage.getItem(PARENT_KEY)||"{}");return v&&typeof v==="object"?v:{}}catch(e){return {}}}
    function writeParents(v){try{var k=Object.keys(v);if(k.length>80)k.slice(0,k.length-80).forEach(function(x){delete v[x]});sessionStorage.setItem(PARENT_KEY,JSON.stringify(v))}catch(e){}}
    function internal(url){return !!(url&&url.origin===location.origin&&/\.html?$/i.test(url.pathname)&&!url.pathname.endsWith("/404.html"))}
    function fallbackParent(url){
      var p=url.pathname.split("/").pop()||"index.html",v=url.searchParams.get("view")||"all",d=url.searchParams.get("deck");
      if(p==="index.html")return null;if(p==="choisir.html")return "index.html";
      if(p==="mes-memoires.html")return v==="memories"||v==="cards"?"choisir.html":"index.html";
      if(p==="cartes-publiques.html")return "choisir.html";if(p==="revisions.html")return "index.html";
      if(p==="creer.html")return "choisir.html";if(p==="editer-memoire.html")return "mes-memoires.html?view=memories";
      if(p==="creer-cartes.html")return "mes-memoires.html?view=cards";if(p==="memoire-blocs.html")return "mes-memoires.html?view=memories";
      if(p==="reviser-cartes.html")return "mes-memoires.html?view=cards";if(p==="progression.html")return "mes-memoires.html";
      if(/^mode-.+\.html$/i.test(p))return "reviser-cartes.html"+(d?"?deck="+encodeURIComponent(d):"");return "index.html";
    }
    function label(url){var p=url.pathname.split("/").pop()||"index.html",v=url.searchParams.get("view")||"all";
      if(p==="index.html")return "← Accueil";if(p==="choisir.html")return "← Choisir un espace";
      if(p==="mes-memoires.html")return v==="memories"?"← Mes mémoires":v==="cards"?"← Mes cartes":"← Bibliothèque";
      if(p==="cartes-publiques.html")return "← Bibliothèque communautaire";if(p==="revisions.html")return "← Révisions";
      if(p==="reviser-cartes.html")return "← Étude des cartes";if(p==="memoire-blocs.html")return "← Passages à mémoriser";
      if(p==="creer-cartes.html")return "← Mes cartes";if(p==="editer-memoire.html")return "← Mes mémoires";return "← Retour";
    }
    function configureBackLink(){
      var current=currentRoute(),back=document.querySelector(".page-heading .back-link");if(!current||!back)return;
      var parents=readParents(),parent=null,value=parents[routeKey(current)];
      if(typeof value==="string"){try{parent=new URL(value,location.origin)}catch(e){}}
      if(!internal(parent)||routeKey(parent)===routeKey(current)){
        var fb=fallbackParent(current);if(!fb){back.hidden=true;return}
        try{parent=new URL(fb,location.origin+current.pathname.replace(/[^/]*$/,""))}catch(e){parent=new URL(fb,location.origin)}
      }
      back.hidden=false;var href=parent.pathname+parent.search+parent.hash,txt=label(parent);
      if(back.getAttribute("href")!==href)back.setAttribute("href",href);
      if(back.textContent!==txt)back.textContent=txt;
      var aria=txt.replace(/^←\s*/,"Revenir à ");if(back.getAttribute("aria-label")!==aria)back.setAttribute("aria-label",aria);
    }
    window.auroreConfigureBackLink=configureBackLink;
    document.addEventListener("click",function(event){
      var a=event.target&&event.target.closest?event.target.closest("a[href]"):null,c=currentRoute();
      if(!c||!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.hasAttribute("download")||(a.target&&a.target!=="_self")||a.matches(".back-link, .brand, .top-actions a, [data-nav-ignore]"))return;
      var dest;try{dest=new URL(a.href,c.href)}catch(e){return}if(!internal(dest)||routeKey(dest)===routeKey(c))return;
      var parents=readParents();parents[routeKey(dest)]=c.pathname+c.search+c.hash;writeParents(parents);
    },true);
    configureBackLink();
    if(window.MutationObserver&&document.body){var obs=new MutationObserver(function(records){if(records.some(function(r){return r.type==="childList"||(r.type==="attributes"&&r.attributeName==="href")}))configureBackLink()});obs.observe(document.body,{attributes:true,attributeFilter:["href"],childList:true,subtree:true})}
  })();

})();

// Aurore Mémoire: load private cloud backup only on pages that work with personal memorisations.
(function () {
  "use strict";
  var page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (!/^(?:index|choisir|mes-memoires|revisions|memoire-blocs|editer-memoire|reviser-cartes|creer-cartes|creer|cartes-publiques|mode-[a-z-]+)\.html$/.test(page)) return;
  if (window.__auroreMemoryCloudBootstrap) return;
  window.__auroreMemoryCloudBootstrap = true;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Impossible de charger " + src)); };
      document.head.appendChild(script);
    });
  }

  window.auroreMemoryCloudBootstrapPromise = (async function () {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      }
      if (!window.auroreAuth) {
        await loadScript("auth.js?v=20261018-r2-verified-sync");
      }
      // Wait until Supabase has created the client and restored the saved session.
      // Otherwise sync can start too early and miss the initial sync for a signed-in user.
      if (window.auroreAuthReady) await window.auroreAuthReady;
      if (!window.__auroreMemoryCloudSyncLoaded) {
        await loadScript("memory-cloud-sync.js?v=20261021-private-copy-polish");
      }
    } catch (error) {
      console.warn("Aurore Mémoire : la sauvegarde cloud n’est pas initialisée. Les données locales restent disponibles.", error);
    }
  })();
})();


// Aurore Mémoire — action explicite pour actualiser la version installée sans toucher aux données.
(function installAuroreRefreshAction() {
  "use strict";
  if (window.__auroreRefreshActionInstalled) return;
  window.__auroreRefreshActionInstalled = true;

  function announce(message) {
    if (typeof window.auroreToast === "function") window.auroreToast(message);
    else {
      var toast = document.getElementById("toast");
      if (toast) { toast.textContent = message; toast.classList.add("show"); }
    }
  }

  function mountButton() {
    var nav = document.querySelector(".top-actions");
    if (!nav || document.getElementById("auroreRefreshApp")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.id = "auroreRefreshApp";
    button.className = "nav-link aurore-refresh-app";
    button.textContent = "↻ Actualiser";
    button.setAttribute("aria-label", "Actualiser Aurore Mémoire et charger la version la plus récente");
    button.title = "Actualiser l’application sans effacer vos cartes ni vos mémorisations";
    button.addEventListener("click", async function () {
      if (!navigator.onLine) {
        announce("Connexion nécessaire pour actualiser. Vos données locales sont conservées.");
        return;
      }
      button.disabled = true;
      button.textContent = "Actualisation…";
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          var registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(function (registration) {
            return registration.update().catch(function () {});
          }));
        }
        // Nettoyer uniquement le Cache Storage du navigateur, jamais localStorage ni IndexedDB.
        // L’action est volontaire et uniquement proposée en ligne pour reconstituer ensuite le cache hors ligne.
        if (window.caches && typeof window.caches.keys === "function") {
          var keys = await window.caches.keys();
          await Promise.all(keys.map(function (key) { return window.caches.delete(key); }));
        }
        var url = new URL(window.location.href);
        url.searchParams.set("__aurore_refresh", String(Date.now()));
        announce("Actualisation en cours… vos cartes et mémorisations ne sont pas effacées.");
        window.location.replace(url.toString());
      } catch (error) {
        console.warn("Actualisation Aurore Mémoire :", error);
        button.disabled = false;
        button.textContent = "↻ Actualiser";
        announce("L’actualisation automatique a échoué. Réessayez avec une connexion active.");
      }
    });
    nav.appendChild(button);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountButton, { once: true });
  else mountButton();
  if (window.MutationObserver && document.documentElement) {
    var observer = new MutationObserver(function () { mountButton(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();


// Aurore Mémoire — notifications réseau, adaptées du composant Aurore Archives.
(function initAuroreNetworkStatus() {
  "use strict";
  if (window.__auroreNetworkStatusInstalled) return;
  window.__auroreNetworkStatusInstalled = true;

  function mount() {
    if (document.getElementById("auroreNetworkStatus")) return;
    var toast = document.createElement("div");
    toast.id = "auroreNetworkStatus";
    toast.className = "aurore-network-status";
    toast.dataset.state = "online";
    toast.hidden = true;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.innerHTML = '<span aria-hidden="true" class="aurore-network-status-icon">' +
      '<svg class="aurore-network-icon-offline" fill="none" viewBox="0 0 24 24"><path d="M3 8.5A13.7 13.7 0 0 1 12 5a13.7 13.7 0 0 1 9 3.5"/><path d="M5.5 12A9.7 9.7 0 0 1 12 9.5a9.7 9.7 0 0 1 6.5 2.5"/><path d="M8.5 15.5A5.6 5.6 0 0 1 12 14a5.6 5.6 0 0 1 3.5 1.5"/><path d="M12 19h.01"/><path d="M4 4l16 16"/></svg>' +
      '<svg class="aurore-network-icon-online" fill="none" viewBox="0 0 24 24"><path d="M3 8.5A13.7 13.7 0 0 1 12 5a13.7 13.7 0 0 1 9 3.5"/><path d="M5.5 12A9.7 9.7 0 0 1 12 9.5a9.7 9.7 0 0 1 6.5 2.5"/><path d="M8.5 15.5A5.6 5.6 0 0 1 12 14a5.6 5.6 0 0 1 3.5 1.5"/><path d="M12 19h.01"/></svg>' +
      '</span><span class="aurore-network-status-copy"><strong id="auroreNetworkStatusTitle">Connexion interrompue</strong><span id="auroreNetworkStatusText"></span></span>' +
      '<button aria-label="Fermer" class="aurore-network-status-close" id="auroreNetworkStatusClose" type="button">×</button>';
    document.body.appendChild(toast);
    initMonitor(toast);
  }

  function initMonitor(toast) {
    var title = toast.querySelector("#auroreNetworkStatusTitle");
    var text = toast.querySelector("#auroreNetworkStatusText");
    var close = toast.querySelector("#auroreNetworkStatusClose");
    var hideTimer = null, probeTimer = null, lastState = "unknown", checking = false, generation = 0;

    function show(state, heading, message, autoHide) {
      clearTimeout(hideTimer);
      toast.dataset.state = state;
      toast.classList.toggle("is-offline", state === "offline");
      toast.classList.toggle("is-online", state === "online");
      title.textContent = heading;
      text.textContent = message;
      toast.hidden = false;
      if (autoHide) hideTimer = setTimeout(function () { toast.hidden = true; }, 4200);
    }
    function hide() {
      clearTimeout(hideTimer);
      toast.hidden = true;
    }
    window.auroreAfficherNotificationReseau = function (state, message) {
      if (state === "offline") {
        document.documentElement.classList.add("aurore-offline");
        show("offline", "Connexion interrompue", message || "Internet est indisponible. Les données déjà disponibles restent consultables.", false);
      } else {
        show("online", "Connexion rétablie", message || "La connexion Internet est de nouveau disponible.", true);
      }
    };
    close.addEventListener("click", hide);

    async function probeInternet() {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (_) {} }, 4500) : null;
      try {
        var response = await fetch("/", {
          method: "HEAD",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller ? controller.signal : undefined
        });
        return !!(response && response.ok);
      } catch (_) {
        return false;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    function stopProbe() {
      if (probeTimer) clearInterval(probeTimer);
      probeTimer = null;
    }
    function scheduleProbe() {
      stopProbe();
      probeTimer = setInterval(function () {
        if (document.visibilityState !== "visible" || checking) return;
        handleNetworkChange("online", "probe");
      }, lastState === "offline" ? 15000 : 45000);
    }
    async function handleNetworkChange(state, source) {
      if (state === "offline") {
        generation++;
        checking = false;
        if (lastState === "offline") return;
        lastState = "offline";
        document.documentElement.classList.add("aurore-offline");
        show("offline", "Connexion interrompue", "Internet est indisponible ou instable. Les pages et documents déjà disponibles restent consultables.", false);
        window.dispatchEvent(new CustomEvent("aurore:network-offline", { detail: { source: source } }));
        scheduleProbe();
        return;
      }
      if (checking) return;
      checking = true;
      var current = ++generation, previous = lastState;
      var accessible = await probeInternet();
      if (current !== generation) return;
      checking = false;
      if (!accessible) {
        handleNetworkChange("offline", source + ":probe");
        return;
      }
      if (lastState === "online") return;
      lastState = "online";
      document.documentElement.classList.remove("aurore-offline");
      scheduleProbe();
      if (previous === "offline") {
        show("online", "Connexion rétablie", "Internet est de nouveau disponible. Aurore peut reprendre la synchronisation de votre espace.", true);
      } else if (previous === "unknown") {
        hide();
      } else {
        show("online", "Connexion rétablie", "Internet est de nouveau disponible.", true);
      }
      if (previous !== "unknown") {
        window.dispatchEvent(new CustomEvent("aurore:network-online", { detail: { source: source } }));
        // En ligne, demander au navigateur de vérifier les workers existants sans
        // supprimer les caches hors ligne ni toucher aux données utilisateur.
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function (registrations) {
            registrations.forEach(function (registration) {
              if (registration && typeof registration.update === "function") registration.update().catch(function () {});
            });
          }).catch(function () {});
        }
      }
    }

    window.addEventListener("online", function () {
      setTimeout(function () { handleNetworkChange("online", "event"); }, 900);
    }, { passive: true });
    window.addEventListener("offline", function () { handleNetworkChange("offline", "event"); }, { passive: true });
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      handleNetworkChange(navigator.onLine === false ? "offline" : "online", "visibility");
      if (lastState !== "unknown") scheduleProbe();
    });
    window.addEventListener("pagehide", stopProbe, { once: true });
    if (navigator.onLine === false) handleNetworkChange("offline", "initial");
    else handleNetworkChange("online", "initial");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
