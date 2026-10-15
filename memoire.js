(function () {
  "use strict";

  var STORAGE_KEY = "aurore-memory-cards-v1";
  var SELECTED_DECK_KEY = "aurore-memory-selected-deck";
  var DAY_MS = 86400000;
  var MODES = ["Toucher pour révéler", "Curseur", "Écouter", "Première lettre", "Trous", "Réordonner", "Taper", "Choix multiple", "Parler"];
  var MODE_PAGES = {"Toucher pour révéler":{"url":"mode-revelation.html","title":"Révélation","description":"Découvre la réponse après avoir essayé de la retrouver mentalement. La qualité de ton rappel nourrit la progression de chaque tranche."},"Curseur":{"url":"mode-curseur.html","title":"Curseur de confiance","description":"Indique ton niveau de confiance avant de révéler la réponse, puis note honnêtement la facilité du rappel."},"Écouter":{"url":"mode-ecouter.html","title":"Écoute active","description":"Écoute la question et la réponse avec la synthèse vocale du navigateur pour renforcer la familiarité avec les notions."},"Première lettre":{"url":"mode-premiere-lettre.html","title":"Première lettre","description":"Utilise les initiales comme indices graduels, puis restitue la réponse entière sans regarder."},"Trous":{"url":"mode-trous.html","title":"Texte à trous","description":"Récupère les mots importants à partir de la question et compare ta réponse avec le contenu attendu."},"Réordonner":{"url":"mode-reordonner.html","title":"Réordonner","description":"Reconstruis la réponse mot par mot. Cette méthode est utile pour les définitions, les étapes et les formulations précises."},"Taper":{"url":"mode-taper.html","title":"Réponse écrite","description":"Écris la réponse de mémoire. La vérification compare la réponse normalisée et enregistre le résultat de la tranche."},"Choix multiple":{"url":"mode-choix-multiple.html","title":"Choix multiple","description":"Distingue la bonne réponse parmi plusieurs propositions. Les distracteurs proviennent des autres cartes disponibles."},"Parler":{"url":"mode-parler.html","title":"Réponse vocale","description":"Prononce la réponse quand la reconnaissance vocale est disponible, ou utilise le champ écrit de secours."}};
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
  function cardKind(card) {
    if (card && card.kind === "memory") return "memory";
    if (card && card.kind === "flashcard") return "flashcard";
    return card && /(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(card.front || "")) ? "memory" : "flashcard";
  }
  function isMemoryCard(card) { return cardKind(card) === "memory"; }
  function isFlashcard(card) { return cardKind(card) === "flashcard"; }

  var state = null;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) {}
  if (!state || typeof state !== "object") state = { cards: [], log: {}, mode: "Rappel actif" };
  if (!Array.isArray(state.cards)) state.cards = [];
  if (!state.log || typeof state.log !== "object") state.log = {};
  if (!Array.isArray(state.performance)) state.performance = [];
  if (!Array.isArray(state.cardPerformance)) state.cardPerformance = [];
  if (["courbe", "diagramme", "batonnets"].indexOf(state.chartType) < 0) state.chartType = "courbe";
  var legacyModes = { "Rappel actif": "Toucher pour révéler", "Texte à trous": "Trous", "Premières lettres": "Première lettre", "QCM": "Choix multiple", "Association": "Toucher pour révéler", "Palais mental": "Toucher pour révéler" };
  if (legacyModes[state.mode]) state.mode = legacyModes[state.mode];
  if (MODES.indexOf(state.mode) < 0) state.mode = "Toucher pour révéler";
  state.cards = state.cards.map(function (card, index) {
    card = card && typeof card === "object" ? card : {};
    if (card.id == null) card.id = Date.now() + index;
    if (typeof card.deck !== "string" || !card.deck.trim()) card.deck = "Ma mémoire";
    if (typeof card.front !== "string") card.front = String(card.front || "");
    if (typeof card.back !== "string") card.back = String(card.back || "");
    if (card.kind !== "memory" && card.kind !== "flashcard") card.kind = /(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(card.front) ? "memory" : "flashcard";
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

  function makeCard(front, back, deck, index) {
    return {
      id: Date.now() + Math.random() + (index || 0) / 1000,
      deck: deck,
      kind: "flashcard",
      front: String(front || "").trim(),
      back: String(back || "").trim(),
      ease: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: today()
    };
  }

  function parseContent(text, deck) {
    var pairs = [];
    var input = String(text || "").replace(/\r/g, "").trim();
    if (!input) return [];

    input.split(/\n+/).forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) return;
      var front = "";
      var back = "";
      var delimiter = line.indexOf("::");
      if (delimiter >= 0) {
        front = line.slice(0, delimiter).trim();
        back = line.slice(delimiter + 2).trim();
      } else if (line.indexOf("\t") >= 0) {
        var columns = line.split("\t");
        front = (columns.shift() || "").trim();
        back = columns.join(" ").trim();
      } else {
        var qa = line.match(/^(?:Q|Question)\s*[:：]\s*(.+?)\s+(?:R|Réponse|Reponse)\s*[:：]\s*(.+)$/i);
        if (qa) { front = qa[1].trim(); back = qa[2].trim(); }
      }
      if (front && back) {
        pairs.push([front, back]);
        return;
      }

      // A line with a separator but only one side filled is not silently converted to a cloze.
      if (delimiter >= 0 || line.indexOf("\t") >= 0 || /^(?:Q|Question)\s*[:：]/i.test(line)) return;

      // For ordinary course text, make a cloze card from each complete sentence.
      line.split(/(?<=[.!?。！？])\s+/).forEach(function (sentence) {
        sentence = sentence.trim().replace(/^[-*•\d.)\s]+/, "");
        if (sentence.length < 12) return;
        var words = sentence.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]{4,}/g) || [];
        words = words.filter(function (word) { return !/^(alors|ainsi|aussi|cette|celui|celle|dans|donc|elle|elles|entre|être|faire|leurs|mais|même|notre|parce|plus|pour|quand|sans|sont|sous|tout|tous|très|vous|avec|comme|comment|cette|leurs)$/i.test(word); });
        if (!words.length) return;
        words.sort(function (a, b) { return b.length - a.length; });
        var keyword = words[0];
        var index = sentence.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
        if (index < 0) return;
        pairs.push([sentence.slice(0, index) + "_____" + sentence.slice(index + keyword.length), sentence.slice(index, index + keyword.length)]);
      });
    });

    var seen = Object.create(null);
    return pairs.filter(function (pair) {
      var key = pair[0].toLocaleLowerCase() + "\u0000" + pair[1].toLocaleLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return Boolean(pair[0] && pair[1]);
    }).map(function (pair, index) {
      return makeCard(pair[0], pair[1], deck, index);
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
    var daily = state.performance.filter(function (entry) { return entry && entry.day === dateKey; })[0];
    if (!daily) {
      daily = { day: dateKey, total: 0, remembered: 0, difficult: 0, missed: 0 };
      state.performance.push(daily);
    }
    daily.total += 1;
    if (grade >= 2) daily.remembered += 1;
    else if (grade === 1) daily.difficult += 1;
    else daily.missed += 1;
    if (state.performance.length > 120) state.performance = state.performance.slice(-120);
    state.cardPerformance.push({
      day: dateKey,
      timestamp: Date.now(),
      cardId: String(card.id),
      deck: card.deck,
      mode: state.mode,
      grade: grade,
      confidence: state.mode === "Curseur" ? Number(session.confidence) || 0 : null
    });
    if (state.cardPerformance.length > 5000) state.cardPerformance = state.cardPerformance.slice(-5000);
    save();
  }

  function updateHome() {
    if (document.body.dataset.page !== "home") return;
    var memoryItems = state.cards.filter(isMemoryCard), flashItems = state.cards.filter(isFlashcard);
    var values = {
      "#homeMemoryCount": Object.keys(memoryGroups(memoryItems)).length,
      "#homeCardCount": flashItems.length,
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
    var searched = state.cards.filter(function (card) {
      return !search || [card.deck, card.front, card.back].some(function (value) {
        return String(value).toLocaleLowerCase().indexOf(search) !== -1;
      });
    });
    var memoryGroupsByDeck = memoryGroups(searched.filter(isMemoryCard));
    var flashGroupsByDeck = memoryGroups(searched.filter(isFlashcard));
    var memoryNames = Object.keys(memoryGroupsByDeck).sort(function (a, b) { return a.localeCompare(b, "fr"); });
    var flashNames = Object.keys(flashGroupsByDeck).sort(function (a, b) { return a.localeCompare(b, "fr"); });

    function rows(names, groups, kind) {
      if (!names.length) return '<div class="empty-state compact-empty"><h3>' + (kind === "memory" ? "Aucune mémoire enregistrée" : "Aucune série de cartes enregistrée") + '</h3><p>' + (kind === "memory" ? "Crée un texte puis découpe-le en petits blocs à apprendre." : "Crée une série avec un titre, des questions et leurs réponses.") + '</p></div>';
      return '<div class="memory-list">' + names.map(function (name) {
        var items = groups[name], due = dueCards(items).length;
        var preview = items[0] ? (kind === "memory" ? items[0].back : items[0].front) : "";
        var main = '<div class="memory-row-main"><h3>' + escapeHtml(name) + '</h3><p>' + items.length + (kind === "memory" ? ' bloc(s) · ' : ' carte(s) · ') + due + ' à réviser</p><small>' + escapeHtml(preview) + '</small></div>';
        if (kind === "memory") return '<article class="memory-row"><div class="memory-row-mark" aria-hidden="true">▤</div>' + main + '<div class="memory-row-actions"><a class="secondary-btn" href="memoire-blocs.html?deck=' + encodeURIComponent(name) + '">Voir les blocs</a><a class="secondary-btn" href="editer-memoire.html?deck=' + encodeURIComponent(name) + '">Éditer</a><button class="subtle-danger" type="button" data-act="delete-deck" data-kind="memory" data-deck="' + escapeHtml(name) + '">Supprimer</button></div></article>';
        return '<article class="memory-row"><div class="memory-row-mark card-series-mark" aria-hidden="true">▧</div>' + main + '<div class="memory-row-actions"><a class="primary-btn" href="reviser-cartes.html?deck=' + encodeURIComponent(name) + '">Réviser</a><button class="subtle-danger" type="button" data-act="delete-deck" data-kind="flashcard" data-deck="' + escapeHtml(name) + '">Supprimer</button></div></article>';
      }).join("") + '</div>';
    }

    target.innerHTML = '<section class="library-section"><div class="library-section-head"><div><p class="section-kicker">TEXTES À APPRENDRE</p><h2>Mes mémoires</h2><p>Des passages de cours découpés en petits blocs, avec une méthode pour chacun.</p></div><a class="primary-btn" href="editer-memoire.html">＋ Créer une mémoire</a></div>' + rows(memoryNames, memoryGroupsByDeck, "memory") + '</section>' +
      '<section class="library-section"><div class="library-section-head"><div><p class="section-kicker">QUESTIONS / RÉPONSES</p><h2>Mes cartes</h2><p>Des cartes recto-verso à retourner, classées en séries nommées.</p></div><a class="primary-btn" href="creer-cartes.html">＋ Créer une série</a></div>' + rows(flashNames, flashGroupsByDeck, "flashcard") + '</section>';
  }

  function renderLibrary() {
    var root = $("#memoryLibrary");
    if (!root) return;
    var memories = state.cards.filter(isMemoryCard), flashcards = state.cards.filter(isFlashcard);
    root.innerHTML = '<div class="library-summary"><div><strong>' + Object.keys(memoryGroups(memories)).length + '</strong><span>mémoire(s)</span></div><div><strong>' + Object.keys(memoryGroups(flashcards)).length + '</strong><span>série(s) de cartes</span></div><div><strong>' + state.cards.length + '</strong><span>élément(s) enregistrés</span></div></div>' +
      '<div class="library-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="memorySearch" type="search" placeholder="Rechercher un titre, un passage ou une question…" aria-label="Rechercher dans mes mémorisations"></label><div class="toolbar-actions"><a class="primary-btn" href="editer-memoire.html">＋ Créer une mémoire</a><a class="secondary-btn" href="creer-cartes.html">＋ Créer des cartes</a><a class="secondary-btn" href="progression.html">Ma progression</a><button class="secondary-btn" type="button" data-act="export">Exporter</button></div></div>' +
      '<div id="memoryList" aria-live="polite"></div>';
    renderMemoryList();
  }

  function handleCreateForm() {
    var form = $("#memoryCreateForm");
    if (!form) return;
    var input = $("#memoryFile");
    var mode = "manual";
    var bulkPrepared = false;
    var cardCounter = 2;
    var draftCards = $("#draftCards");
    var feedback = $("#createFeedback");
    var bulkPreview = $("#bulkPreview");
    var originalBulkText = null;
    var lastSegmentedText = null;

    function setFeedback(message, isError) {
      if (!feedback) return;
      feedback.textContent = message || "";
      feedback.classList.toggle("is-error", Boolean(isError));
    }

    function updateDraftLabels() {
      var rows = draftCards ? Array.prototype.slice.call(draftCards.querySelectorAll("[data-draft-card]")) : [];
      rows.forEach(function (row, index) {
        var number = index + 1;
        var title = row.querySelector(".draft-card-top strong");
        var q = row.querySelector(".card-question");
        var a = row.querySelector(".card-answer");
        var qLabel = row.querySelector(".question-label");
        var aLabel = row.querySelector(".answer-label");
        if (title) title.textContent = "Carte " + number;
        if (q) { q.id = "draft-q-" + number; q.setAttribute("aria-label", "Question de la carte " + number); }
        if (a) { a.id = "draft-a-" + number; a.setAttribute("aria-label", "Réponse de la carte " + number); }
        if (qLabel) qLabel.htmlFor = "draft-q-" + number;
        if (aLabel) aLabel.htmlFor = "draft-a-" + number;
      });
      var counter = $("#draftCardCount");
      if (counter) counter.textContent = rows.length + (rows.length > 1 ? " cartes" : " carte");
    }

    function addDraftCard(front, back) {
      if (!draftCards) return;
      cardCounter += 1;
      var row = document.createElement("article");
      row.className = "draft-card";
      row.setAttribute("data-draft-card", "");
      row.innerHTML = '<div class="draft-card-top"><strong>Nouvelle carte</strong><button class="remove-draft-card" type="button" data-remove-card aria-label="Supprimer cette carte" title="Supprimer cette carte">×</button></div>' +
        '<label class="field-label question-label">Question</label><textarea class="text-area card-question" rows="2" placeholder="Écris une question claire…"></textarea>' +
        '<label class="field-label answer-label">Réponse</label><textarea class="text-area card-answer" rows="2" placeholder="Écris la réponse attendue…"></textarea>';
      draftCards.appendChild(row);
      row.querySelector(".card-question").value = front || "";
      row.querySelector(".card-answer").value = back || "";
      updateDraftLabels();
      return row;
    }

    function chooseMode(nextMode) {
      mode = nextMode === "bulk" ? "bulk" : "manual";
      Array.prototype.forEach.call(form.querySelectorAll("[data-create-mode]"), function (button) {
        var active = button.dataset.createMode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      Array.prototype.forEach.call(form.querySelectorAll("[data-editor]"), function (panel) {
        panel.hidden = panel.dataset.editor !== mode;
      });
      setFeedback("");
    }

    function getManualCards(title) {
      var rows = draftCards ? Array.prototype.slice.call(draftCards.querySelectorAll("[data-draft-card]")) : [];
      var cards = [];
      var invalid = false;
      rows.forEach(function (row) {
        var front = (row.querySelector(".card-question").value || "").trim();
        var back = (row.querySelector(".card-answer").value || "").trim();
        if (!front && !back) return;
        if (!front || !back) {
          invalid = true;
          row.classList.add("has-error");
          return;
        }
        row.classList.remove("has-error");
        cards.push(makeCard(front, back, title, cards.length));
      });
      return { cards: cards, invalid: invalid };
    }

    function previewBulk() {
      var title = ($("#memoryTitle").value || "").trim() || "Nouvelle mémoire";
      var content = ($("#memoryText").value || "").trim();
      var cards = parseContent(content, title);
      if (!bulkPreview) return cards;
      if (!content) {
        bulkPreview.innerHTML = '<p class="preview-empty">Colle un cours ou une liste de questions-réponses pour préparer les cartes.</p>';
        bulkPrepared = false;
        return cards;
      }
      if (!cards.length) {
        bulkPreview.innerHTML = '<p class="preview-error">Aucune carte reconnue. Essaie une carte par ligne : question :: réponse. Vérifie aussi que chaque ligne contient bien une question et une réponse.</p>';
        bulkPrepared = false;
        return cards;
      }
      bulkPreview.innerHTML = '<div class="preview-head"><strong>' + cards.length + (cards.length > 1 ? " cartes préparées" : " carte préparée") + '</strong><span>Vérifie les exemples avant d’enregistrer.</span></div><div class="preview-list">' +
        cards.slice(0, 4).map(function (card, index) {
          return '<article class="preview-card"><span>Carte ' + (index + 1) + '</span><strong>' + escapeHtml(card.front) + '</strong><p>' + escapeHtml(card.back) + '</p></article>';
        }).join("") + '</div>' + (cards.length > 4 ? '<p class="preview-more">et ' + (cards.length - 4) + ' autre(s) carte(s)…</p>' : "");
      bulkPrepared = true;
      return cards;
    }

    if (draftCards) {
      draftCards.addEventListener("click", function (event) {
        var remove = event.target.closest("[data-remove-card]");
        if (!remove) return;
        var rows = draftCards.querySelectorAll("[data-draft-card]");
        if (rows.length <= 1) {
          var q = rows[0].querySelector(".card-question");
          var a = rows[0].querySelector(".card-answer");
          q.value = "";
          a.value = "";
          rows[0].classList.remove("has-error");
        } else {
          remove.closest("[data-draft-card]").remove();
        }
        updateDraftLabels();
      });
    }
    var addButton = $("#addDraftCard");
    if (addButton) addButton.addEventListener("click", function () {
      var row = addDraftCard();
      if (row) row.querySelector(".card-question").focus();
      setFeedback("");
    });

    Array.prototype.forEach.call(form.querySelectorAll("[data-create-mode]"), function (button) {
      button.addEventListener("click", function () { chooseMode(button.dataset.createMode); });
    });

    var segmentButton = $("#segmentCourseButton");
    var restoreButton = $("#restoreCourseButton");
    var segmentFeedback = $("#segmentFeedback");
    var segmentModeSelect = $("#segmentSelectionMode");
    var segmentRangeFields = $("#segmentRangeFields");
    var segmentStartInput = $("#segmentStart");
    var segmentEndInput = $("#segmentEnd");
    var segmentRangeNote = $("#segmentRangeNote");

    function updateSegmentRangeUI() {
      var rangeMode = Boolean(segmentModeSelect && segmentModeSelect.value === "range");
      if (segmentRangeFields) segmentRangeFields.hidden = !rangeMode;
      if (segmentRangeNote) segmentRangeNote.textContent = rangeMode
        ? "Le découpage reste gratuit : saisis le numéro du premier et du dernier segment, puis touche « Découper gratuitement »."
        : "Le mode Individuel prépare tous les segments séparément. Le mode Plage permet de choisir gratuitement le début et la fin.";
    }
    if (segmentModeSelect) segmentModeSelect.addEventListener("change", updateSegmentRangeUI);
    updateSegmentRangeUI();

    if (segmentButton) segmentButton.addEventListener("click", function () {
      var currentText = ($("#memoryText").value || "").trim();
      var source = originalBulkText !== null && currentText === lastSegmentedText ? originalBulkText : currentText;
      if (!source) {
        if (segmentFeedback) segmentFeedback.textContent = "Colle d’abord le cours à découper.";
        return;
      }
      var size = $("#segmentSize").value;
      var chunks = [];
      if (size === "paragraph") {
        chunks = source.split(/\n\s*\n+/).map(function (part) { return part.replace(/\s+/g, " ").trim(); }).filter(Boolean);
        if (chunks.length === 1) chunks = chunks[0].split(/(?<=[.!?。！？])\s+/).map(function (part) { return part.trim(); }).filter(Boolean);
      } else {
        var sentences = source.replace(/\r/g, " ").split(/(?<=[.!?。！？])\s+/).map(function (part) { return part.trim(); }).filter(function (part) { return part.length > 0; });
        var groupSize = Math.max(1, Number(size) || 2);
        for (var i = 0; i < sentences.length; i += groupSize) chunks.push(sentences.slice(i, i + groupSize).join(" "));
      }
      if (!chunks.length) {
        if (segmentFeedback) segmentFeedback.textContent = "Je n’ai pas trouvé de passage à découper. Vérifie le texte.";
        return;
      }

      if (segmentStartInput) segmentStartInput.max = String(chunks.length);
      if (segmentEndInput) segmentEndInput.max = String(chunks.length);
      var selectedFrom = 1;
      var selectedTo = chunks.length;
      if (segmentModeSelect && segmentModeSelect.value === "range") {
        var enteredFrom = parseInt(segmentStartInput && segmentStartInput.value || "1", 10);
        var enteredTo = parseInt(segmentEndInput && segmentEndInput.value || String(chunks.length), 10);
        if (!isFinite(enteredFrom) || !isFinite(enteredTo) || enteredFrom < 1 || enteredFrom > chunks.length || enteredTo < enteredFrom) {
          if (segmentFeedback) segmentFeedback.textContent = "Plage invalide. Choisis un début entre 1 et " + chunks.length + " et une fin supérieure ou égale au début.";
          return;
        }
        selectedFrom = enteredFrom;
        selectedTo = Math.min(chunks.length, enteredTo);
        if (segmentEndInput) segmentEndInput.value = String(selectedTo);
      }
      var selectedChunks = chunks.slice(selectedFrom - 1, selectedTo);
      if (!selectedChunks.length) {
        if (segmentFeedback) segmentFeedback.textContent = "Aucun segment dans cette plage. Vérifie les numéros choisis.";
        return;
      }

      if (originalBulkText === null || currentText !== lastSegmentedText) originalBulkText = source;
      var segmentedText = selectedChunks.map(function (chunk, index) {
        return "Récite le segment " + (selectedFrom + index) + " du cours :: " + chunk;
      }).join("\n");
      $("#memoryText").value = segmentedText;
      lastSegmentedText = segmentedText;
      if (restoreButton) restoreButton.hidden = false;
      chooseMode("bulk");
      var cards = previewBulk();
      if (segmentFeedback) segmentFeedback.textContent = segmentModeSelect && segmentModeSelect.value === "range"
        ? selectedChunks.length + " segment(s) choisi(s) sur " + chunks.length + " ; plage " + selectedFrom + " à " + selectedTo + ". Tout est gratuit. Vérifie l’aperçu avant d’enregistrer."
        : chunks.length + " segment(s) préparé(s), gratuitement. Tu peux modifier les segments, vérifier l’aperçu ou restaurer le texte original.";
      setFeedback(cards.length + " segment(s) prêts à être enregistrés.", false);
    });
    if (restoreButton) restoreButton.addEventListener("click", function () {
      if (originalBulkText !== null) $("#memoryText").value = originalBulkText;
      originalBulkText = null;
      lastSegmentedText = null;
      restoreButton.hidden = true;
      if (segmentFeedback) segmentFeedback.textContent = "Le cours original a été restauré.";
      if (segmentStartInput) segmentStartInput.max = "";
      if (segmentEndInput) segmentEndInput.max = "";
      previewBulk();
    });

    var prepareButton = $("#prepareBulkCards");
    if (prepareButton) prepareButton.addEventListener("click", function () {
      var cards = previewBulk();
      setFeedback(cards.length ? "Aperçu prêt : " + cards.length + " carte(s) détectée(s)." : "Aucune carte prête pour le moment.", !cards.length);
    });

    function csvCells(line) {
      var cells = [], value = "", quoted = false;
      for (var i = 0; i < line.length; i += 1) {
        var ch = line.charAt(i);
        if (ch === '"' && quoted && line.charAt(i + 1) === '"') { value += '"'; i += 1; }
        else if (ch === '"') { quoted = !quoted; }
        else if (ch === "," && !quoted) { cells.push(value.trim()); value = ""; }
        else { value += ch; }
      }
      cells.push(value.trim());
      return cells;
    }

    if (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var loadedText = String(reader.result || "");
          if (/\.csv$/i.test(file.name)) {
            loadedText = loadedText.split(/\r?\n/).map(function (line) {
              if (!line.trim()) return "";
              var cells = csvCells(line);
              if (cells.length < 2) return line;
              if (/^(question|front|recto|terme)$/i.test(cells[0]) && /^(réponse|reponse|answer|back|verso|définition|definition)$/i.test(cells[1])) return "";
              return cells[0] + " :: " + cells.slice(1).join(", ");
            }).join("\n");
          }
          $("#memoryText").value = loadedText;
          chooseMode("bulk");
          var cards = previewBulk();
          setFeedback(file.name + " chargé : " + cards.length + " carte(s) préparée(s). Vérifie l’aperçu puis enregistre.", !cards.length);
        };
        reader.onerror = function () { setFeedback("Le fichier n’a pas pu être lu. Essaie un fichier texte, CSV ou TSV.", true); };
        reader.readAsText(file);
      });
    }

    if (bulkPreview) bulkPreview.innerHTML = '<p class="preview-empty">L’aperçu des cartes préparées apparaîtra ici.</p>';
    updateDraftLabels();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var title = ($("#memoryTitle").value || "").trim();
      if (!title) {
        setFeedback("Donne un nom à cette mémoire.", true);
        $("#memoryTitle").focus();
        return;
      }
      var result;
      if (mode === "manual") {
        result = getManualCards(title);
        if (result.invalid) {
          setFeedback("Complète la question et la réponse de chaque carte commencée, ou vide entièrement cette carte.", true);
          return;
        }
      } else {
        result = { cards: previewBulk(), invalid: false };
      }
      if (!result.cards.length) {
        setFeedback(mode === "manual" ? "Ajoute au moins une carte avec une question et une réponse." : "Aucune carte n’a été préparée. Vérifie le texte et utilise « Préparer les cartes ».", true);
        return;
      }
      var previous = state.cards.slice();
      state.cards = state.cards.concat(result.cards);
      if (!save()) {
        state.cards = previous;
        setFeedback("L’enregistrement a échoué : le stockage de cet appareil est peut-être plein. Exporte tes mémorisations puis réessaie.", true);
        return;
      }
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
    ["Je ne m’en souviens pas", "Aucune de ces réponses", "Je dois revoir cette notion"].forEach(function (fallback) {
      if (fallback !== card.back && possible.indexOf(fallback) < 0) possible.push(fallback);
    });
    possible.sort(function () { return Math.random() - 0.5; });
    return possible.slice(0, 3).concat(card.back).sort(function () { return Math.random() - 0.5; });
  }

  function startSession(deck, includeAllCards) {
    session.requestedDeck = deck || "";
    var params = new URLSearchParams(window.location.search);
    var requestedCard = params.get("card") || "";
    var availableCards = (includeAllCards || requestedCard) ? state.cards.filter(isMemoryCard) : dueCards(state.cards.filter(isMemoryCard));
    session.queue = availableCards.filter(function (card) {
      return isMemoryCard(card) && (!session.requestedDeck || card.deck === session.requestedDeck) && (!requestedCard || String(card.id) === requestedCard);
    });
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
    session.options = session.current && state.mode === "Choix multiple" ? prepareOptions(session.current) : null;
    session.typedValue = "";
    session.typedCorrect = false;
    session.confidence = 50;
    session.shuffledWords = session.current ? session.current.back.trim().split(/\s+/).filter(Boolean).sort(function () { return Math.random() - 0.5; }) : [];
    session.reorderUsed = [];
    renderReview();
  }


  function renderProgressChart() {
    var now = today();
    var points = [];
    for (var i = 6; i >= 0; i -= 1) {
      var day = String(now - i);
      var entry = state.performance.filter(function (item) { return item && item.day === day; })[0];
      points.push({ day: day, total: entry ? Number(entry.total) || 0 : 0, remembered: entry ? Number(entry.remembered) || 0 : 0, missed: entry ? Number(entry.missed) || 0 : 0 });
    }
    var total = points.reduce(function (sum, point) { return sum + point.total; }, 0);
    var remembered = points.reduce(function (sum, point) { return sum + point.remembered; }, 0);
    var missed = points.reduce(function (sum, point) { return sum + point.missed; }, 0);
    var max = Math.max(1, points.reduce(function (value, point) { return Math.max(value, point.total); }, 0));
    var labels = points.map(function (point) {
      var date = new Date(Number(point.day) * DAY_MS);
      return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
    });
    var graphic = "";
    if (state.chartType === "batonnets") {
      graphic = '<svg class="progress-chart-svg" viewBox="0 0 330 120" role="img" aria-label="Nombre de révisions par jour en bâtonnets">' +
        points.map(function (point, i) {
          var height = point.total / max * 76;
          var x = 13 + i * 45;
          return '<rect x="' + x + '" y="' + (91 - height) + '" width="24" height="' + Math.max(2, height) + '" rx="4" fill="var(--accent-light)"><title>' + labels[i] + ' : ' + point.total + ' révision(s)</title></rect><text x="' + (x + 12) + '" y="107" text-anchor="middle">' + labels[i] + '</text>';
        }).join("") + '</svg>';
    } else if (state.chartType === "diagramme") {
      var circumference = 2 * Math.PI * 34;
      var good = total ? remembered / total * circumference : 0;
      var bad = total ? missed / total * circumference : 0;
      graphic = '<div class="progress-donut-wrap"><svg class="progress-donut" viewBox="0 0 100 100" role="img" aria-label="Répartition des réponses mémorisées et à revoir"><circle cx="50" cy="50" r="34" fill="none" stroke="var(--border)" stroke-width="12"/><circle cx="50" cy="50" r="34" fill="none" stroke="var(--accent-light)" stroke-width="12" stroke-dasharray="' + good + ' ' + circumference + '" transform="rotate(-90 50 50)"/><circle cx="50" cy="50" r="34" fill="none" stroke="#e17d87" stroke-width="12" stroke-dasharray="' + bad + ' ' + circumference + '" stroke-dashoffset="-' + good + '" transform="rotate(-90 50 50)"/><text x="50" y="47" text-anchor="middle" class="donut-total">' + total + '</text><text x="50" y="59" text-anchor="middle" class="donut-caption">révisions</text></svg><div class="progress-legend"><span><i class="legend-good"></i>Bien ou facile <strong>' + remembered + '</strong></span><span><i class="legend-bad"></i>À revoir <strong>' + missed + '</strong></span><span><i class="legend-neutral"></i>Difficile <strong>' + (total - remembered - missed) + '</strong></span></div></div>';
    } else {
      var coords = points.map(function (point, i) { return (18 + i * 49) + "," + (88 - point.total / max * 67); }).join(" ");
      graphic = '<svg class="progress-chart-svg" viewBox="0 0 330 120" role="img" aria-label="Courbe du nombre de révisions par jour"><line x1="12" y1="89" x2="320" y2="89" stroke="var(--border)" stroke-width="1"/><polyline points="' + coords + '" fill="none" stroke="var(--accent-light)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        points.map(function (point, i) {
          var x = 18 + i * 49, y = 88 - point.total / max * 67;
          return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="var(--accent-light)"><title>' + labels[i] + ' : ' + point.total + ' révision(s)</title></circle><text x="' + x + '" y="107" text-anchor="middle">' + labels[i] + '</text>';
        }).join("") + '</svg>';
    }
    return '<section class="progress-panel" aria-label="Progression des révisions"><div class="progress-panel-head"><div><p class="section-kicker">TON ÉVOLUTION</p><h2>Ma progression</h2><p>Activité des 7 derniers jours · ' + total + ' révision(s)</p></div><label class="chart-select-label"><span>Affichage</span><select id="progressChartType" aria-label="Type de graphique"><option value="courbe"' + (state.chartType === "courbe" ? " selected" : "") + '>Courbe</option><option value="diagramme"' + (state.chartType === "diagramme" ? " selected" : "") + '>Diagramme</option><option value="batonnets"' + (state.chartType === "batonnets" ? " selected" : "") + '>Bâtonnets</option></select></label></div>' +
      (total ? graphic : '<p class="chart-empty">Tes graphiques apparaîtront ici après tes premières révisions. Les anciennes révisions sont conservées, mais leur résultat détaillé n’est pas disponible rétroactivement.</p>') +
      '<div class="chart-footer"><span><strong>' + remembered + '</strong> réponses bien retrouvées</span><span><strong>' + missed + '</strong> à revoir</span></div></section>';
  }

  function normalizeAnswer(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  }

  function gradeTypedAnswer(value) {
    if (!session.current || session.shown) return;
    session.typedValue = String(value || "").trim();
    session.typedCorrect = normalizeAnswer(session.typedValue) === normalizeAnswer(session.current.back);
    session.shown = true;
    registerReview(session.current, session.typedCorrect ? 2 : 0);
    session.reviewed += 1;
    if (!session.typedCorrect) session.queue.push(session.current);
    renderReview();
  }

  function renderModeNavigation(dedicated) {
    var groups = [
      { title: "Se familiariser", modes: ["Toucher pour révéler", "Curseur", "Écouter"] },
      { title: "Consolider", modes: ["Première lettre", "Trous", "Réordonner"] },
      { title: "Évaluer", modes: ["Taper", "Choix multiple", "Parler"] }
    ];
    var html = '<section class="mode-area mode-navigation"><div class="mode-navigation-head"><div><p class="mode-label">' + (dedicated ? "Changer de méthode" : "Choisis librement ta méthode") + '</p><p class="mode-subtitle">' + (dedicated ? "Chaque méthode a sa propre page et conserve le suivi des tranches." : "Neuf méthodes gratuites, chacune avec sa page de travail et ses statistiques.") + '</p></div></div>';
    groups.forEach(function (group) {
      html += '<div class="method-group"><strong>' + group.title + '</strong><div class="mode-list">';
      group.modes.forEach(function (mode) {
        var info = MODE_PAGES[mode];
        var deckParam = session.requestedDeck ? "?deck=" + encodeURIComponent(session.requestedDeck) : "";
        html += '<a class="mode-chip mode-link' + (state.mode === mode ? ' is-active' : '') + '" href="' + info.url + deckParam + '"><strong>' + escapeHtml(mode) + '</strong><small>' + escapeHtml(info.title) + '</small></a>';
      });
      html += '</div></div>';
    });
    html += '</section>';
    return html;
  }

  function clozeText(text) {
    var index = 0;
    return String(text || "").replace(/[^\s]+/g, function (word) {
      var bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      var current = index++;
      if (bare.length >= 4 && current % 2 === 0) {
        var punctuation = word.match(/[^\p{L}\p{N}]+$/u);
        return "＿".repeat(Math.min(8, Math.max(3, bare.length))) + (punctuation ? punctuation[0] : "");
      }
      return word;
    });
  }

  function renderChunkProgress(mode) {
    var cards = state.cards.filter(function (card) { return isMemoryCard(card) && (!session.requestedDeck || card.deck === session.requestedDeck); });
    var events = state.cardPerformance || [];
    var perCard = cards.map(function (card, index) {
      var all = events.filter(function (entry) { return entry && entry.cardId === String(card.id); });
      var specific = all.filter(function (entry) { return entry.mode === mode; });
      var confidenceEvents = all.filter(function (entry) { return entry.mode === "Curseur" && typeof entry.confidence === "number"; });
      var confidenceAverage = confidenceEvents.length ? Math.round(confidenceEvents.reduce(function (sum, entry) { return sum + entry.confidence; }, 0) / confidenceEvents.length) : null;
      function score(items) {
        return items.length ? Math.round(items.reduce(function (sum, item) { return sum + Math.max(0, Math.min(3, Number(item.grade) || 0)); }, 0) / (items.length * 3) * 100) : 0;
      }
      return { card: card, index: index + 1, all: all, specific: specific, allScore: score(all), modeScore: score(specific), confidenceAverage: confidenceAverage, last: all.length ? all[all.length - 1] : null };
    });
    var reviewed = perCard.filter(function (item) { return item.all.length > 0; });
    var practiced = perCard.filter(function (item) { return item.specific.length > 0; });
    var mastered = perCard.filter(function (item) { return item.all.length >= 2 && item.allScore >= 75; });
    var average = reviewed.length ? Math.round(reviewed.reduce(function (sum, item) { return sum + item.allScore; }, 0) / reviewed.length) : 0;
    var maxLabel = Math.max(1, perCard.length);
    var chartWidth = Math.max(620, perCard.length * 62);
    var chartHeight = 252, left = 42, right = 20, top = 18, bottom = 54;
    var plotWidth = chartWidth - left - right, plotHeight = chartHeight - top - bottom;
    var slot = plotWidth / maxLabel;
    var grid = "";
    for (var g = 0; g <= 4; g += 1) {
      var gy = top + plotHeight * g / 4;
      grid += '<line class="chunk-grid" x1="' + left + '" y1="' + gy + '" x2="' + (chartWidth - right) + '" y2="' + gy + '"></line><text x="' + (left - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + (100 - g * 25) + '%</text>';
    }
    var bars = perCard.map(function (item, i) {
      var x = left + i * slot + slot * .12;
      var w = Math.max(5, slot * .32);
      var allH = item.allScore / 100 * plotHeight;
      var modeH = item.modeScore / 100 * plotHeight;
      var label = "Tranche " + item.index + " — " + item.card.front;
      return '<rect class="chunk-bar-all" x="' + x + '" y="' + (top + plotHeight - allH) + '" width="' + w + '" height="' + Math.max(2, allH) + '" rx="3"><title>' + escapeHtml(label) + ' · toutes méthodes : ' + item.allScore + '%</title></rect><rect class="chunk-bar-mode" x="' + (x + w + 2) + '" y="' + (top + plotHeight - modeH) + '" width="' + w + '" height="' + Math.max(2, modeH) + '" rx="3"><title>' + escapeHtml(label) + ' · ' + escapeHtml(mode) + ' : ' + item.modeScore + '%</title></rect><text x="' + (x + w + 1) + '" y="' + (chartHeight - 31) + '" text-anchor="middle">' + item.index + '</text>';
    }).join("");
    var rows = perCard.map(function (item) {
      var status = !item.all.length ? "À découvrir" : item.all.length >= 2 && item.allScore >= 75 ? "Consolidée" : item.allScore >= 55 ? "En progrès" : "À retravailler";
      var latest = item.last ? new Date(item.last.timestamp).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "Pas encore";
      return '<article class="chunk-progress-row"><div class="chunk-progress-copy"><span class="chunk-index">TRANCHE ' + item.index + '</span><strong>' + escapeHtml(item.card.front) + '</strong><small>' + item.all.length + ' révision(s) · ' + item.specific.length + ' avec cette méthode · dernière : ' + latest + (item.confidenceAverage == null ? "" : " · confiance moyenne : " + item.confidenceAverage + "%") + '</small></div><div class="chunk-progress-scores"><div class="chunk-score-line"><span>Global</span><div class="chunk-score-track"><i style="width:' + item.allScore + '%"></i></div><b>' + item.allScore + '%</b></div><div class="chunk-score-line"><span>' + escapeHtml(mode) + '</span><div class="chunk-score-track method-score"><i style="width:' + item.modeScore + '%"></i></div><b>' + item.modeScore + '%</b></div><small class="chunk-status">' + status + '</small></div></article>';
    }).join("");
    if (!cards.length) return '<section class="chunk-dashboard"><div class="empty-state compact-empty"><h2>Aucune tranche à suivre pour le moment</h2><p>Crée une mémoire ou découpe un cours en petits segments. Chaque segment disposera de son propre suivi.</p><a class="primary-btn" href="creer-memoire.html">Créer ou découper un cours</a></div></section>';
    return '<section class="chunk-dashboard"><div class="chunk-dashboard-head"><div><p class="section-kicker">SUIVI PAR TRANCHE</p><h2>La progression de chaque information</h2><p>Chaque carte ou segment garde son propre historique. Le score global combine les méthodes ; le second score isole la méthode actuelle.</p></div><span class="chunk-total-pill">' + cards.length + ' tranche(s)</span></div><div class="chunk-kpis"><div><span>Tranches travaillées</span><strong>' + reviewed.length + '/' + cards.length + '</strong></div><div><span>Maîtrise moyenne</span><strong>' + average + '%</strong></div><div><span>Consolidées</span><strong>' + mastered.length + '</strong></div><div><span>Avec cette méthode</span><strong>' + practiced.length + '</strong></div></div><div class="chunk-chart-card"><div class="chunk-chart-title"><div><h3>Carte de maîtrise par tranche</h3><p>Survole une barre pour voir le détail. Fais défiler horizontalement si le cours est long.</p></div></div><div class="chunk-chart-scroll"><svg class="chunk-chart-svg" viewBox="0 0 ' + chartWidth + ' ' + chartHeight + '" role="img" aria-label="Comparaison de la maîtrise de chaque tranche pour toutes les méthodes et pour la méthode actuelle">' + grid + bars + '<text x="' + left + '" y="' + (chartHeight - 9) + '">Numéro de tranche</text></svg></div><div class="chunk-chart-legend"><span><i class="all-key"></i>Maîtrise globale</span><span><i class="mode-key"></i>' + escapeHtml(mode) + '</span></div></div><div class="chunk-list-head"><h3>Détail de chaque tranche</h3><span>Actualisé après chaque réponse notée</span></div><div class="chunk-progress-list">' + rows + '</div><p class="chunk-disclaimer">Les pourcentages représentent la moyenne des réponses notées (de 0 à 3), et non une mesure scientifique absolue de la mémoire. Les anciennes révisions sans détail par carte restent dans les statistiques générales mais ne sont pas inventées dans ce tableau.</p></section>';
  }

  function renderReview() {
    var root = $("#reviewApp");
    if (!root) return;
    var pending = session.queue.length + (session.current ? 1 : 0);
    var progress = session.initialCount ? Math.min(100, Math.round(session.reviewed / session.initialCount * 100)) : 0;
    var dedicatedMode = document.body.dataset.modePage || "";
    var html = "";
    if (!dedicatedMode) {
      html += '<div class="review-workspace-links"><a class="secondary-btn" href="editer-memoire.html">Éditer et morceler une mémoire</a><a class="secondary-btn" href="progression.html">Ma progression</a></div>';
      html += renderModeNavigation(false);
      root.innerHTML = html;
      return;
    }

    if (!state.cards.some(isMemoryCard)) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">↻</span><h2>Il te faut une première mémoire</h2><p>Crée un texte puis découpe-le en petits blocs pour commencer avec les méthodes de mémorisation.</p><a class="primary-btn" href="editer-memoire.html">Créer une mémoire</a></div>';
    } else if (!session.current && !session.hadDueCards) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✓</span><h2>Rien à revoir pour le moment</h2><p>' + (session.requestedDeck ? 'Aucune carte de « ' + escapeHtml(session.requestedDeck) + ' » n’est due aujourd’hui.' : 'Tes prochaines révisions apparaîtront ici lorsqu’elles arriveront à échéance.') + '</p><div class="empty-actions"><button class="primary-btn" type="button" data-act="reload-session">Actualiser les révisions</button><a class="secondary-btn" href="mes-memoires.html">Mes mémorisations</a></div></div>';
    } else if (!session.current) {
      html += '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✓</span><h2>Séance terminée</h2><p>Tu as parcouru les cartes prévues. Les cartes difficiles peuvent revenir dans la même séance.</p><div class="empty-actions"><button class="primary-btn" type="button" data-act="reload-session">Recommencer les cartes dues</button><a class="secondary-btn" href="index.html">Accueil</a></div></div>';
    } else {
      var card = session.current;
      html += '<article class="study-card">';
      if (session.requestedDeck) html += '<p class="study-deck">' + escapeHtml(session.requestedDeck) + '</p>';
      html += '<p class="study-prompt">RETROUVE LA RÉPONSE DE MÉMOIRE</p><h2 class="study-question">' + escapeHtml(card.front).replace(/\n/g, "<br>") + '</h2>';
      if (state.mode === "Trous" && !session.shown) html += '<p class="study-tip">Complète les mots manquants mentalement avant de révéler le passage.</p><div class="cloze-preview" aria-label="Texte à trous">' + escapeHtml(clozeText(card.back)) + '</div>';
      if (state.mode === "Trous" && session.shown) html += '<p class="study-tip">Compare les mots que tu as retrouvés avec la réponse complète.</p>';
      if (state.mode === "Association") html += '<p class="study-tip">Cherche un lien, une image ou une histoire qui relie la question à la réponse.</p>';
      if (state.mode === "Palais mental") html += '<p class="study-tip">Associe cette notion à un lieu familier ou à un objet précis dans ton imagination.</p>';
      if (state.mode === "Première lettre" && !session.shown) {
        html += '<p class="study-tip">Complète chaque mot à partir de sa première lettre. Aurore vérifiera l’ensemble à la fin.</p><div class="first-letter-words" aria-label="Complète les mots">';
        html += card.back.split(/\s+/).map(function (word, index) {
          var first = word ? word.charAt(0) : "";
          var rest = word ? word.slice(1) : "";
          var width = Math.min(180, Math.max(34, rest.length * 9 + 18));
          return '<label class="first-letter-word" style="--word-width:' + width + 'px"><span class="first-letter-initial">' + escapeHtml(first) + '</span><input data-first-rest="' + index + '" aria-label="Mot ' + (index + 1) + '" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:' + width + 'px" value="' + escapeHtml(rest ? "" : "") + '" placeholder="' + (rest ? "…" : "") + '"></label>';
        }).join("") + '</div><button class="primary-btn next-card-btn" type="button" data-act="check-first-letter">Vérifier mes réponses</button>';
      }
      if (state.mode === "Écouter") html += '<button type="button" class="secondary-btn listen-question-btn" data-act="speak-question">▶ Écouter la question</button>';
      if (state.mode === "Curseur" && !session.shown) html += '<div class="confidence-control"><label for="confidenceSlider">À quel point penses-tu connaître la réponse ? <strong id="confidenceValue">' + session.confidence + '%</strong></label><input id="confidenceSlider" type="range" min="0" max="100" step="5" value="' + session.confidence + '"><div class="confidence-labels"><span>Pas du tout</span><span>Très bien</span></div></div>';
      if (state.mode === "Réordonner" && !session.shown) {
        html += '<p class="study-tip">Touchez les mots dans le bon ordre pour reconstituer la réponse.</p><div class="reorder-bank">' + session.shuffledWords.map(function (word, index) {
          return '<button type="button" class="answer-option reorder-word' + (session.reorderUsed.indexOf(index) >= 0 ? ' is-used' : '') + '" data-act="append-word" data-word-index="' + index + '"' + (session.reorderUsed.indexOf(index) >= 0 ? ' disabled' : '') + '>' + escapeHtml(word) + '</button>';
        }).join("") + '</div><div class="study-answer reorder-answer">' + escapeHtml(session.reorderUsed.map(function (index) { return session.shuffledWords[index]; }).join(" ")) + '</div><div class="reorder-actions"><button class="secondary-btn" type="button" data-act="reset-reorder">Effacer</button><button class="primary-btn" type="button" data-act="check-reorder">Vérifier l’ordre</button></div>';
      } else if (state.mode === "Réordonner" && session.shown) {
        html += '<p class="answer-feedback ' + (session.typedCorrect ? 'feedback-good' : 'feedback-bad') + '">' + (session.typedCorrect ? 'Bonne réponse, les mots sont dans le bon ordre.' : 'L’ordre ne correspond pas encore à la réponse attendue.') + '</p><div class="study-answer">' + escapeHtml(card.back) + '</div><button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
      } else if (state.mode === "Taper" && !session.shown) {
        html += '<label class="field-label" for="typedAnswer">Ta réponse</label><textarea class="text-area typed-answer" id="typedAnswer" rows="3" placeholder="Écris ce dont tu te souviens…">' + escapeHtml(session.typedValue) + '</textarea><button class="primary-btn next-card-btn" type="button" data-act="check-typed">Vérifier ma réponse</button>';
      } else if (state.mode === "Taper" && session.shown) {
        html += '<p class="answer-feedback ' + (session.typedCorrect ? 'feedback-good' : 'feedback-bad') + '">' + (session.typedCorrect ? 'Bonne réponse !' : 'Compare ta réponse avec la réponse attendue.') + '</p><div class="study-answer">' + escapeHtml(card.back) + '</div><button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
      } else if (state.mode === "Parler" && !session.shown) {
        html += '<p class="study-tip">Prononce ta réponse à voix haute. La reconnaissance vocale dépend du navigateur et de la langue disponible.</p><button class="primary-btn next-card-btn" type="button" data-act="start-speaking">🎙 Répondre à voix haute</button><label class="field-label" for="spokenFallback">Ou écris ta réponse</label><textarea class="text-area typed-answer" id="spokenFallback" rows="2" placeholder="Réponse de secours si la voix n’est pas disponible…">' + escapeHtml(session.typedValue) + '</textarea><button class="secondary-btn next-card-btn" type="button" data-act="check-spoken">Vérifier le texte</button>';
      } else if (state.mode === "Parler" && session.shown) {
        html += '<p class="answer-feedback ' + (session.typedCorrect ? 'feedback-good' : 'feedback-bad') + '">' + (session.typedCorrect ? 'Réponse reconnue comme correcte.' : 'La réponse reconnue diffère de la réponse attendue.') + '</p><div class="study-answer">' + escapeHtml(card.back) + '</div><button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
      } else if (session.options && state.mode === "Choix multiple") {
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
      } else if (state.mode === "Première lettre" && !session.shown) {
        // Les champs de rappel ont été rendus au-dessus de cette branche.
      } else if (state.mode === "Première lettre" && session.shown) {
        html += '<p class="answer-feedback ' + (session.typedCorrect ? 'feedback-good' : 'feedback-bad') + '">' + (session.typedCorrect ? 'Tous les mots correspondent à la réponse attendue.' : 'Certaines réponses diffèrent. Compare avec le texte complet.') + '</p><div class="study-answer-label">RÉPONSE ATTENDUE</div><div class="study-answer">' + escapeHtml(card.back).replace(/\n/g, "<br>") + '</div><button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
      } else if (!session.shown) {
        html += '<button class="primary-btn reveal-btn" type="button" data-act="show-answer">Afficher la réponse</button>';
      } else {
        html += '<div class="study-answer-label">RÉPONSE</div><div class="study-answer">' + escapeHtml(card.back).replace(/\n/g, "<br>") + '</div>';
        if (state.mode === "Écouter") html += '<button type="button" class="secondary-btn listen-question-btn" data-act="speak-answer">▶ Écouter la réponse</button>';
        html += '<p class="grade-question">Comment as-tu retrouvé cette réponse&nbsp;?</p><div class="grade-buttons"><button type="button" data-act="grade" data-grade="0"><strong>À revoir</strong><small>Je ne l’ai pas retrouvée</small></button><button type="button" data-act="grade" data-grade="1"><strong>Difficile</strong><small>Avec beaucoup d’effort</small></button><button type="button" data-act="grade" data-grade="2"><strong>Bien</strong><small>Après réflexion</small></button><button type="button" data-act="grade" data-grade="3"><strong>Facile</strong><small>Sans hésiter</small></button></div>';
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

  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "confidenceSlider") {
      session.confidence = Number(event.target.value) || 0;
      var value = $("#confidenceValue");
      if (value) value.textContent = session.confidence + "%";
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "progressChartType") {
      state.chartType = ["courbe", "diagramme", "batonnets"].indexOf(event.target.value) >= 0 ? event.target.value : "courbe";
      save();
      renderReview();
    }
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-act]");
    if (!button) return;
    var action = button.dataset.act;

    if (action === "export") {
      exportCards();
    } else if (action === "review-deck") {
      var reviewDeck = button.dataset.deck || "";
      if (button.dataset.kind === "flashcard") window.location.href = "reviser-cartes.html?deck=" + encodeURIComponent(reviewDeck);
      else window.location.href = "memoire-blocs.html?deck=" + encodeURIComponent(reviewDeck);
    } else if (action === "delete-deck") {
      var deck = button.dataset.deck || "";
      var kind = button.dataset.kind === "memory" ? "memory" : "flashcard";
      if (window.confirm('Supprimer la ' + (kind === "memory" ? "mémoire" : "série de cartes") + ' « ' + deck + ' » et tous ses éléments ? Cette action est irréversible.')) {
        state.cards = state.cards.filter(function (card) { return !(card.deck === deck && cardKind(card) === kind); });
        if (kind === "flashcard" && state.deckStyles) delete state.deckStyles["flashcard:" + deck];
        save(); renderLibrary(); updateHome();
        notify(kind === "memory" ? "Mémoire supprimée." : "Série de cartes supprimée.");
      }
    } else if (action === "set-mode") {
      state.mode = MODES.indexOf(button.dataset.mode) >= 0 ? button.dataset.mode : "Rappel actif";
      save();
      if (session.current) {
        session.shown = false;
        session.picked = -1;
        session.qcmGraded = false;
        session.options = state.mode === "Choix multiple" ? prepareOptions(session.current) : null;
        session.typedValue = "";
        session.reorderUsed = [];
        session.shuffledWords = session.current.back.trim().split(/\s+/).filter(Boolean).sort(function () { return Math.random() - 0.5; });
      }
      renderReview();
    } else if (action === "speak-question" || action === "speak-answer") {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        notify("La lecture vocale n’est pas disponible dans ce navigateur.");
        return;
      }
      window.speechSynthesis.cancel();
      var spokenText = session.current ? (action === "speak-answer" ? session.current.back : session.current.front) : "";
      var utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = "fr-FR";
      window.speechSynthesis.speak(utterance);
    } else if (action === "append-word") {
      if (!session.current || session.shown) return;
      var wordIndex = Number(button.dataset.wordIndex);
      if (session.shuffledWords && wordIndex >= 0 && wordIndex < session.shuffledWords.length && session.reorderUsed.indexOf(wordIndex) < 0) {
        session.reorderUsed.push(wordIndex);
        renderReview();
      }
    } else if (action === "reset-reorder") {
      session.reorderUsed = [];
      renderReview();
    } else if (action === "check-reorder") {
      gradeTypedAnswer((session.reorderUsed || []).map(function (index) { return session.shuffledWords[index]; }).join(" "));
    } else if (action === "check-first-letter") {
      if (!session.current || session.shown) return;
      var expectedWords = session.current.back.split(/\s+/);
      var enteredWords = Array.prototype.map.call($("#reviewApp").querySelectorAll("[data-first-rest]"), function (input, index) {
        return (expectedWords[index] || "").charAt(0) + input.value;
      });
      gradeTypedAnswer(enteredWords.join(" "));
    } else if (action === "check-typed") {
      gradeTypedAnswer($("#typedAnswer") ? $("#typedAnswer").value : "");
    } else if (action === "check-spoken") {
      gradeTypedAnswer($("#spokenFallback") ? $("#spokenFallback").value : "");
    } else if (action === "start-speaking") {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        notify("La reconnaissance vocale n’est pas disponible ici. Utilise le champ de réponse écrite.");
        return;
      }
      var recognition = new SpeechRecognition();
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = function (resultEvent) {
        var spoken = resultEvent.results && resultEvent.results[0] && resultEvent.results[0][0] ? resultEvent.results[0][0].transcript : "";
        gradeTypedAnswer(spoken);
      };
      recognition.onerror = function () { notify("La reconnaissance vocale a échoué. Tu peux écrire ta réponse à la place."); };
      try { recognition.start(); } catch (error) { notify("Impossible de démarrer le microphone. Vérifie l’autorisation du navigateur."); }
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
    if (params.get("created") === "1" || params.get("created") === "cards") {
      var createdName = "";
      try { createdName = localStorage.getItem("aurore-memory-last-created") || ""; } catch (error) {}
      notify(params.get("created") === "cards" ? "Série de cartes créée : " + createdName : "Mémoire créée : " + createdName);
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
    var query = new URLSearchParams(window.location.search);
    requested = query.get("deck") || requested;
    var dedicatedMode = document.body.dataset.modePage || "";
    if (MODE_PAGES[dedicatedMode]) {
      state.mode = dedicatedMode;
      save();
      startSession(requested, true);
    } else {
      startSession(requested, false);
    }
  }
  window.auroreMemoryRender = function () {
    renderLibrary();
    renderReview();
    updateHome();
  };
})();