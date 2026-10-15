(function () {
  "use strict";

  var STORAGE_KEY = "aurore-memory-cards-v1";
  var SELECTED_DECK_KEY = "aurore-memory-selected-deck";
  var DAY_MS = 86400000;
  var MODES = ["Rappel actif", "Texte à trous", "Premières lettres", "QCM", "Association", "Palais mental"];
  var $ = function (selector, scope) { return (scope || document).querySelector(selector); };
  var today = function () { return Math.floor(Date.now() / DAY_MS); };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }
  function notify(message) {
    if (typeof window.auroreToast === "function") window.auroreToast(message);
  }

  var state = null;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) {}
  if (!state || typeof state !== "object") state = { cards: [], log: {}, mode: "Rappel actif" };
  if (!Array.isArray(state.cards)) state.cards = [];
  if (!state.log || typeof state.log !== "object") state.log = {};
  if (MODES.indexOf(state.mode) < 0) state.mode = "Rappel actif";
  state.cards = state.cards.map(function (card, index) {
    card = card && typeof card === "object" ? card : {};
    if (card.id == null) card.id = Date.now() + index;
    if (typeof card.deck !== "string" || !card.deck.trim()) card.deck = "Ma mémoire";
    if (typeof card.front !== "string") card.front = String(card.front || "");
    if (typeof card.back !== "string") card.back = String(card.back || "");
    if (typeof card.due !== "number" || !isFinite(card.due)) card.due = today();
    if (typeof card.ease !== "number" || !isFinite(card.ease)) card.ease = 2.5;
    if (typeof card.interval !== "number" || !isFinite(card.interval)) card.interval = 0;
    if (typeof card.reps !== "number" || !isFinite(card.reps)) card.reps = 0;
    if (typeof card.lapses !== "number" || !isFinite(card.lapses)) card.lapses = 0;
    return card;
  });

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      notify("Le stockage de cet appareil est plein. Exporte tes mémorisations avant d’ajouter d’autres cartes.");
      return false;
    }
  }

  function deckNames(cards) {
    var seen = Object.create(null);
    cards.forEach(function (card) { seen[card.deck] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "fr"); });
  }

  function dueCards(cards) {
    return (cards || state.cards).filter(function (card) { return card.due <= today(); });
  }

  function streak() {
    var current = today();
    var days = 0;
    if (!state.log[current]) current -= 1;
    while (state.log[current]) {
      days += 1;
      current -= 1;
    }
    return days;
  }

  function parseContent(text, deck) {
    var pairs = [];
    String(text || "").split(/\r?\n+/).map(function (line) { return line.trim(); }).filter(Boolean).forEach(function (line) {
      var parts = line.split(/::|\t|;/);
      if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(" ").trim()) {
        pairs.push([parts[0].trim(), parts.slice(1).join(" ").trim()]);
        return;
      }
      line.split(/(?<=[.!?])\s+/).forEach(function (sentence) {
        sentence = sentence.trim();
        if (sentence.length < 22) return;
        var words = sentence.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]{5,}/g) || [];
        words.sort(function (a, b) { return b.length - a.length; });
        var keyword = words[0];
        if (!keyword) return;
        var index = sentence.indexOf(keyword);
        if (index < 0) return;
        pairs.push([sentence.slice(0, index) + "[…]" + sentence.slice(index + keyword.length), keyword]);
      });
    });
    return pairs.map(function (pair, index) {
      return {
        id: Date.now() + Math.random() + index / 1000,
        deck: deck,
        front: pair[0],
        back: pair[1],
        ease: 2.5,
        interval: 0,
        reps: 0,
        lapses: 0,
        due: today()
      };
    });
  }

  function registerReview(card, grade) {
    if (grade === 0) {
      card.lapses += 1;
      card.reps = 0;
      card.interval = 0;
      card.ease = Math.max(1.3, card.ease - 0.2);
      card.due = today();
    } else {
      if (grade === 1) {
        card.interval = Math.max(1, Math.round(card.interval * 1.2));
        card.ease = Math.max(1.3, card.ease - 0.15);
      } else if (grade === 2) {
        card.interval = card.reps === 0 ? 1 : card.reps === 1 ? 4 : Math.round(card.interval * card.ease);
      } else {
        card.interval = card.reps === 0 ? 3 : Math.round(Math.max(card.interval, 1) * card.ease * 1.3);
        card.ease += 0.15;
      }
      card.reps += 1;
      card.due = today() + card.interval;
    }
    var dateKey = String(today());
    state.log[dateKey] = (Number(state.log[dateKey]) || 0) + 1;
    save();
  }

  function updateHome() {
    if (document.body.dataset.page !== "home") return;
    var decks = deckNames(state.cards);
    var values = {
      "#homeMemoryCount": decks.length,
      "#homeCardCount": state.cards.length,
      "#homeDueCount": dueCards().length
    };
    Object.keys(values).forEach(function (selector) {
      var node = $(selector);
      if (node) node.textContent = String(values[selector]);
    });
  }

  function memoryGroups(cards) {
    var groups = Object.create(null);
    cards.forEach(function (card) {
      if (!groups[card.deck]) groups[card.deck] = [];
      groups[card.deck].push(card);
    });
    return groups;
  }

  function renderMemoryList() {
    var target = $("#memoryList");
    if (!target) return;
    var search = ($("#memorySearch") && $("#memorySearch").value.trim().toLocaleLowerCase()) || "";
    var filtered = state.cards.filter(function (card) {
      return !search || [card.deck, card.front, card.back].some(function (value) {
        return String(value).toLocaleLowerCase().indexOf(search) !== -1;
      });
    });
    var groups = memoryGroups(filtered);
    var names = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "fr"); });
    if (!state.cards.length) {
      target.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">▤</span><h2>Aucune mémoire pour le moment</h2><p>Crée ta première mémoire à partir d’un cours ou de questions-réponses.</p><a class="primary-btn" href="creer-memoire.html">Créer une mémoire</a></div>';
      return;
    }
    if (!names.length) {
      target.innerHTML = '<div class="empty-state compact-empty"><h2>Aucun résultat</h2><p>Essaie un autre mot ou efface la recherche.</p></div>';
      return;
    }
    target.innerHTML = '<div class="memory-list">' + names.map(function (name) {
      var cards = groups[name];
      var due = dueCards(cards).length;
      var preview = cards[0] ? cards[0].front : "";
      return '<article class="memory-row"><div class="memory-row-mark" aria-hidden="true">▤</div><div class="memory-row-main"><h2>' + escapeHtml(name) + '</h2><p>' + cards.length + ' carte(s) · ' + due + ' à réviser</p><small>' + escapeHtml(preview) + '</small></div><div class="memory-row-actions"><button class="secondary-btn" type="button" data-act="review-deck" data-deck="' + escapeHtml(name) + '">Réviser</button><button class="subtle-danger" type="button" data-act="delete-deck" data-deck="' + escapeHtml(name) + '">Supprimer</button></div></article>';
    }).join("") + '</div>';
  }

  function renderLibrary() {
    var root = $("#memoryLibrary");
    if (!root) return;
    root.innerHTML = '<div class="library-summary"><div><strong>' + deckNames(state.cards).length + '</strong><span>mémorisation(s)</span></div><div><strong>' + state.cards.length + '</strong><span>carte(s)</span></div><div><strong>' + dueCards().length + '</strong><span>à réviser</span></div></div>' +
      '<div class="library-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="memorySearch" type="search" placeholder="Rechercher un titre, une question…" aria-label="Rechercher dans mes mémorisations"></label><div class="toolbar-actions"><a class="primary-btn" href="creer-memoire.html">＋ Créer une mémoire</a><button class="secondary-btn" type="button" data-act="export">Exporter mes cartes</button></div></div>' +
      '<div id="memoryList" aria-live="polite"></div>';
    renderMemoryList();
  }

  function handleCreateForm() {
    var form = $("#memoryCreateForm");
    if (!form) return;
    var input = $("#memoryFile");
    if (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          $("#memoryText").value = String(reader.result || "");
          var feedback = $("#createFeedback");
          if (feedback) feedback.textContent = "Fichier chargé. Vérifie le contenu puis crée ta mémoire.";
          notify("Fichier chargé.");
        };
        reader.onerror = function () { notify("Le fichier n’a pas pu être lu."); };
        reader.readAsText(file);
      });
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var title = ($("#memoryTitle").value || "").trim();
      var content = ($("#memoryText").value || "").trim();
      var feedback = $("#createFeedback");
      if (!title || !content) {
        if (feedback) feedback.textContent = "Indique un nom et un contenu à mémoriser.";
        return;
      }
      var cards = parseContent(content, title);
      if (!cards.length) {
        if (feedback) feedback.textContent = "Aucune carte exploitable. Essaie le format « question :: réponse » ou colle des phrases complètes.";
        return;
      }
      state.cards = state.cards.concat(cards);
      save();
      try { localStorage.setItem("aurore-memory-last-created", title); } catch (error) {}
      window.location.href = "mes-memoires.html?created=1";
    });
  }

  var session = {
    queue: [],
    current: null,
    shown: false,
    options: null,
    picked: -1,
    qcmGraded: false,
    requestedDeck: "",
    hadDueCards: false,
    reviewed: 0,
    initialCount: 0
  };

  function prepareOptions(card) {
    var possible = [];
    var seen = Object.create(null);
    state.cards.forEach(function (item) {
      if (item.id === card.id || !item.back || item.back === card.back || seen[item.back]) return;
      seen[item.back] = true;
      possible.push(item.back);
    });
    possible.sort(function () { return Math.random() - 0.5; });
    if (possible.length < 3) return null;
    return possible.slice(0, 3).concat(card.back).sort(function () { return Math.random() - 0.5; });
  }

  function startSession(deck) {
    session.requestedDeck = deck || "";
    session.queue = dueCards().filter(function (card) { return !session.requestedDeck || card.deck === session.requestedDeck; });
    session.queue.sort(function () { return Math.random() - 0.5; });
    session.hadDueCards = session.queue.length > 0;
    session.initialCount = session.queue.length;
    session.reviewed = 0;
    nextCard();
  }

  function nextCard() {
    session.current = session.queue.shift() || null;
    session.shown = false;
    session.picked = -1;
    session.qcmGraded = false;
    session.options = session.current && state.mode === "QCM" ? prepareOptions(session.current) : null;
    renderReview();
  }

  function renderReview() {
    var root = $("#reviewApp");
    if (!root) return;
    var pending = session.queue.length + (session.current ? 1 : 0);
    var progress = session.initialCount ? Math.min(100, Math.round(session.reviewed / session.initialCount * 100)) : 0;
    var html = '<div class="review-summary"><span><strong>' + dueCards().length + '</strong> carte(s) à revoir au total</span><span><strong>' + (Number(state.log[String(today())]) || 0) + '</strong> révision(s) aujourd’hui</span><span><strong>' + streak() + '</strong> jour(s) de suite</span></div>';
    html += '<div class="mode-area"><p class="mode-label">Méthode de révision</p><div class="mode-list">' + MODES.map(function (mode) {
      return '<button type="button" class="mode-chip' + (state.mode === mode ? ' is-active' : '') + '" data-act="set-mode" data-mode="' + escapeHtml(mode) + '">' + escapeHtml(mode) + '</button>';
    }).join("") + '</div></div>';
    html += '<div class="review-progress"><div class="progress-track"><span style="width:' + progress + '%"></span></div><small>' + (session.current ? (session.reviewed + 1) + ' · ' + Math.max(session.initialCount, session.reviewed + pending) : session.reviewed + ' révision(s) effectuée(s)') + '</small></div>';

    if (!state.cards.length) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">↻</span><h2>Il te faut une première mémoire</h2><p>Crée quelques cartes avant de commencer tes révisions.</p><a class="primary-btn" href="creer-memoire.html">Créer une mémoire</a></div>';
    } else if (!session.current && !session.hadDueCards) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✓</span><h2>Rien à revoir pour le moment</h2><p>' + (session.requestedDeck ? 'Aucune carte de « ' + escapeHtml(session.requestedDeck) + ' » n’est due aujourd’hui.' : 'Tes prochaines révisions apparaîtront ici lorsqu’elles arriveront à échéance.') + '</p><div class="empty-actions"><button class="primary-btn" type="button" data-act="reload-session">Actualiser les révisions</button><a class="secondary-btn" href="mes-memoires.html">Mes mémorisations</a></div></div>';
    } else if (!session.current) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✓</span><h2>Séance terminée</h2><p>Tu as parcouru les cartes prévues. Les cartes difficiles peuvent revenir dans la même séance.</p><div class="empty-actions"><button class="primary-btn" type="button" data-act="reload-session">Recommencer les cartes dues</button><a class="secondary-btn" href="index.html">Accueil</a></div></div>';
    } else {
      var card = session.current;
      html += '<article class="study-card">';
      if (session.requestedDeck) html += '<p class="study-deck">' + escapeHtml(session.requestedDeck) + '</p>';
      html += '<p class="study-prompt">RETROUVE LA RÉPONSE DE MÉMOIRE</p><h2 class="study-question">' + escapeHtml(card.front).replace(/\n/g, "<br>") + '</h2>';
      if (state.mode === "Texte à trous") html += '<p class="study-tip">Essaie de compléter mentalement la phrase avant d’afficher la réponse.</p>';
      if (state.mode === "Association") html += '<p class="study-tip">Cherche un lien, une image ou une histoire qui relie la question à la réponse.</p>';
      if (state.mode === "Palais mental") html += '<p class="study-tip">Associe cette notion à un lieu familier ou à un objet précis dans ton imagination.</p>';
      if (state.mode === "Premières lettres" && !session.shown) {
        html += '<p class="letter-hint">' + escapeHtml(card.back.split(/\s+/).map(function (word) { return word ? word.charAt(0) + "…" : ""; }).join(" ")) + '</p>';
      }
      if (session.options && state.mode === "QCM") {
        html += '<div class="answer-options">' + session.options.map(function (option, index) {
          var classes = "answer-option";
          if (session.shown && option === card.back) classes += " is-correct";
          else if (session.shown && index === session.picked) classes += " is-wrong";
          return '<button type="button" class="' + classes + '" data-act="choose-option" data-index="' + index + '"' + (session.shown ? " disabled" : "") + '>' + escapeHtml(option) + '</button>';
        }).join("") + '</div>';
        if (session.shown) {
          html += '<p class="answer-feedback ' + (session.options[session.picked] === card.back ? 'feedback-good' : 'feedback-bad') + '">' + (session.options[session.picked] === card.back ? 'Bonne réponse.' : 'Pas tout à fait. La réponse attendue est :') + '</p>';
          if (session.options[session.picked] !== card.back) html += '<div class="study-answer">' + escapeHtml(card.back) + '</div>';
          html += '<button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
        } else {
          html += '<p class="study-footnote">Choisis la réponse qui correspond à la notion.</p>';
        }
      } else if (!session.shown) {
        html += '<button class="primary-btn reveal-btn" type="button" data-act="show-answer">Afficher la réponse</button>';
      } else {
        html += '<div class="study-answer-label">RÉPONSE</div><div class="study-answer">' + escapeHtml(card.back).replace(/\n/g, "<br>") + '</div><p class="grade-question">Comment as-tu retrouvé cette réponse&nbsp;?</p><div class="grade-buttons"><button type="button" data-act="grade" data-grade="0"><strong>À revoir</strong><small>Je ne l’ai pas retrouvée</small></button><button type="button" data-act="grade" data-grade="1"><strong>Difficile</strong><small>Avec beaucoup d’effort</small></button><button type="button" data-act="grade" data-grade="2"><strong>Bien</strong><small>Après réflexion</small></button><button type="button" data-act="grade" data-grade="3"><strong>Facile</strong><small>Sans hésiter</small></button></div>';
      }
      html += '</article>';
    }
    root.innerHTML = html;
  }

  function exportCards() {
    if (!state.cards.length) {
      notify("Il n’y a aucune carte à exporter.");
      return;
    }
    var text = state.cards.map(function (card) {
      return String(card.front).replace(/[\t\r\n]/g, " ") + "\t" + String(card.back).replace(/[\t\r\n]/g, " ");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + text], { type: "text/tab-separated-values;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "aurore-memorisations.tsv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    notify("Export prêt.");
  }

  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "memorySearch") renderMemoryList();
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-act]");
    if (!button) return;
    var action = button.dataset.act;

    if (action === "export") {
      exportCards();
    } else if (action === "review-deck") {
      try { localStorage.setItem(SELECTED_DECK_KEY, button.dataset.deck || ""); } catch (error) {}
      window.location.href = "revisions.html";
    } else if (action === "delete-deck") {
      var deck = button.dataset.deck || "";
      if (window.confirm('Supprimer la mémoire « ' + deck + ' » et toutes ses cartes ? Cette action est irréversible.')) {
        state.cards = state.cards.filter(function (card) { return card.deck !== deck; });
        save();
        renderLibrary();
        updateHome();
        notify("Mémoire supprimée.");
      }
    } else if (action === "set-mode") {
      state.mode = MODES.indexOf(button.dataset.mode) >= 0 ? button.dataset.mode : "Rappel actif";
      save();
      if (session.current) {
        session.shown = false;
        session.picked = -1;
        session.qcmGraded = false;
        session.options = state.mode === "QCM" ? prepareOptions(session.current) : null;
      }
      renderReview();
    } else if (action === "show-answer") {
      session.shown = true;
      renderReview();
    } else if (action === "choose-option") {
      if (!session.current || session.shown || !session.options) return;
      session.picked = Number(button.dataset.index);
      session.shown = true;
      session.qcmGraded = true;
      var correct = session.options[session.picked] === session.current.back;
      registerReview(session.current, correct ? 2 : 0);
      session.reviewed += 1;
      if (!correct) session.queue.push(session.current);
      renderReview();
    } else if (action === "grade") {
      if (!session.current) return;
      var score = Number(button.dataset.grade);
      if (![0, 1, 2, 3].includes(score)) return;
      registerReview(session.current, score);
      session.reviewed += 1;
      if (score === 0) session.queue.push(session.current);
      nextCard();
    } else if (action === "next-card") {
      nextCard();
    } else if (action === "reload-session") {
      startSession(session.requestedDeck);
    }
  });

  if (document.body.dataset.page === "home") {
    updateHome();
  } else if (document.body.dataset.page === "library") {
    renderLibrary();
    var params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") {
      var createdName = "";
      try { createdName = localStorage.getItem("aurore-memory-last-created") || ""; } catch (error) {}
      notify("Mémoire créée : " + createdName);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } else if (document.body.dataset.page === "create") {
    handleCreateForm();
  } else if (document.body.dataset.page === "reviews") {
    var requested = "";
    try {
      requested = localStorage.getItem(SELECTED_DECK_KEY) || "";
      localStorage.removeItem(SELECTED_DECK_KEY);
    } catch (error) {}
    startSession(requested);
  }
  window.auroreMemoryRender = function () {
    renderLibrary();
    renderReview();
    updateHome();
  };
})();