(function () {
  "use strict";

  var STORAGE_KEY = "aurore-memory-cards-v1";
  var SELECTED_DECK_KEY = "aurore-memory-selected-deck";
  var DAY_MS = 86400000;
  var MODE_GROUPS = [
    { title: "Se familiariser", modes: [
      { id: "Toucher pour révéler", label: "Toucher pour révéler", description: "Affiche la réponse quand tu es prêt." },
      { id: "Curseur", label: "Curseur", description: "Indique ton niveau de confiance avant de révéler." },
      { id: "Écouter", label: "Écouter", description: "Écoute la question puis la réponse." }
    ]},
    { title: "Consolider", modes: [
      { id: "Premières lettres", label: "Première lettre", description: "Un indice pour retrouver chaque mot." },
      { id: "Trous", label: "Trous", description: "Complète mentalement la phrase." },
      { id: "Réordonner", label: "Réordonner", description: "Reconstitue la réponse dans le bon ordre." }
    ]},
    { title: "Évaluer", modes: [
      { id: "Taper", label: "Taper", description: "Saisis ta réponse avant de vérifier." },
      { id: "Choix multiple", label: "Choix multiple", description: "Choisis la bonne réponse parmi quatre." },
      { id: "Parler", label: "Parler", description: "Réponds à voix haute si le navigateur le permet." }
    ]}
  ];
  var MODES = MODE_GROUPS.reduce(function (all, group) { return all.concat(group.modes.map(function (mode) { return mode.id; })); }, []);
  var LEGACY_MODES = { "Rappel actif": "Toucher pour révéler", "Texte à trous": "Trous", "QCM": "Choix multiple", "Association": "Toucher pour révéler", "Palais mental": "Toucher pour révéler" };
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
  if (LEGACY_MODES[state.mode]) state.mode = LEGACY_MODES[state.mode];
  if (MODES.indexOf(state.mode) < 0) state.mode = "Toucher pour révéler";
  if (!Array.isArray(state.history)) state.history = [];
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

  function makeCard(front, back, deck, index) {
    return {
      id: Date.now() + Math.random() + (index || 0) / 1000,
      deck: deck,
      front: String(front || "").trim(),
      back: String(back || "").trim(),
      ease: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: today()
    };
  }

  function parseSegments(text, deck, mode, size) {
    var input = String(text || "").replace(/\r/g, "").trim();
    if (!input) return [];
    var units = input.split(/\n\s*\n+/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (units.length === 1) {
      units = units[0].split(/(?<=[.!?。！？])\s+/).map(function (part) { return part.trim(); }).filter(Boolean);
    } else {
      units = units.map(function (part) { return part.replace(/\s+/g, " ").trim(); });
    }
    var groupSize = mode === "range" ? Math.max(2, Math.min(5, Number(size) || 2)) : 1;
    var cards = [];
    for (var i = 0; i < units.length; i += groupSize) {
      var chunk = units.slice(i, i + groupSize).join("\n\n").trim();
      if (!chunk) continue;
      var excerpt = chunk.replace(/\s+/g, " ");
      if (excerpt.length > 95) excerpt = excerpt.slice(0, 92) + "…";
      var label = mode === "range" ? "Plage " + (Math.floor(i / groupSize) + 1) : "Partie " + (i + 1);
      cards.push(makeCard(label + " — restitue le passage : " + excerpt, chunk, deck, cards.length));
    }
    return cards;
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

  function normalizeAnswer(value) {
    return String(value || "").toLocaleLowerCase("fr")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function speakLine(text) {
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance === "undefined") {
      notify("La lecture audio n’est pas disponible dans ce navigateur.");
      return;
    }
    window.speechSynthesis.cancel();
    var utterance = new window.SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = "fr-FR";
    window.speechSynthesis.speak(utterance);
  }

  function holePrompt(card) {
    var front = String(card.front || "");
    var back = String(card.back || "");
    if (/_{3,}|[…]{2,}/.test(front)) return front;
    var pos = back ? front.toLocaleLowerCase().indexOf(back.toLocaleLowerCase()) : -1;
    if (pos >= 0) return front.slice(0, pos) + "________" + front.slice(pos + back.length);
    return front;
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
    state.history.push({ date: dateKey, cardId: card.id, deck: card.deck, grade: grade, mode: state.mode });
    if (state.history.length > 3000) state.history = state.history.slice(-3000);
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
    var mode = "manual";
    var bulkPrepared = false;
    var cardCounter = 2;
    var draftCards = $("#draftCards");
    var feedback = $("#createFeedback");
    var bulkPreview = $("#bulkPreview");

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
      var segmentToggle = $("#useSegments");
      var cards = segmentToggle && segmentToggle.checked
        ? parseSegments(content, title, ($("#segmentMode") || {}).value || "individual", ($("#segmentSize") || {}).value || "2")
        : parseContent(content, title);
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
    var segmentToggle = $("#useSegments");
    var segmentSettings = $("#segmentSettings");
    function refreshSegmentPreview() {
      if (segmentSettings) segmentSettings.hidden = !(segmentToggle && segmentToggle.checked);
      var memoryText = $("#memoryText");
      if (memoryText && memoryText.value.trim()) previewBulk();
    }
    if (segmentToggle) segmentToggle.addEventListener("change", refreshSegmentPreview);
    var segmentMode = $("#segmentMode");
    var segmentSize = $("#segmentSize");
    if (segmentMode) segmentMode.addEventListener("change", refreshSegmentPreview);
    if (segmentSize) segmentSize.addEventListener("change", refreshSegmentPreview);
    refreshSegmentPreview();

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
    checkResult: null,
    confidence: 50,
    speechText: "",
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
    session.options = session.current && state.mode === "Choix multiple" ? prepareOptions(session.current) : null;
    session.checkResult = null;
    session.speechText = "";
    session.confidence = 50;
    renderReview();
  }

  function renderReview() {
    var root = $("#reviewApp");
    if (!root) return;
    var pending = session.queue.length + (session.current ? 1 : 0);
    var progress = session.initialCount ? Math.min(100, Math.round(session.reviewed / session.initialCount * 100)) : 0;
    var html = '<div class="review-summary"><span><strong>' + dueCards().length + '</strong> carte(s) à revoir au total</span><span><strong>' + (Number(state.log[String(today())]) || 0) + '</strong> révision(s) aujourd’hui</span><span><strong>' + streak() + '</strong> jour(s) de suite</span></div>';
    html += '<div class="mode-area"><p class="mode-label">Choisis comment tu veux mémoriser · toutes les méthodes sont gratuites</p><div class="mode-groups">' + MODE_GROUPS.map(function (group) {
      return '<section class="mode-group"><h3>' + escapeHtml(group.title) + '</h3><div class="mode-list">' + group.modes.map(function (mode) {
        return '<button type="button" class="mode-chip' + (state.mode === mode.id ? ' is-active' : '') + '" data-act="set-mode" data-mode="' + escapeHtml(mode.id) + '" aria-pressed="' + (state.mode === mode.id ? 'true' : 'false') + '"><strong>' + escapeHtml(mode.label) + '</strong><small>' + escapeHtml(mode.description) + '</small></button>';
      }).join("") + '</div></section>';
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
      var prompt = state.mode === "Trous" ? holePrompt(card) : card.front;
      html += '<p class="study-prompt">' + (state.mode === "Trous" ? 'COMPLÈTE MENTALEMENT' : state.mode === "Parler" ? 'RÉPONDS À VOIX HAUTE' : 'RETROUVE LA RÉPONSE DE MÉMOIRE') + '</p><h2 class="study-question">' + escapeHtml(prompt).replace(/\n/g, "<br>") + '</h2>';
      if (state.mode === "Trous") html += '<p class="study-tip">Complète les blancs ou retrouve la notion avant de révéler la réponse.</p>';
      if (state.mode === "Réordonner") {
        var shuffledWords = card.back.split(/\s+/).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
        html += '<p class="study-tip"><strong>À remettre en ordre :</strong> ' + escapeHtml(shuffledWords.join(" · ")) + '</p>';
      }
      if (state.mode === "Curseur") {
        html += '<label class="confidence-label" for="confidenceSlider">À quel point es-tu sûr de ta réponse ? <strong id="confidenceValue">50 %</strong></label><input id="confidenceSlider" class="confidence-slider" type="range" min="0" max="100" step="10" value="' + session.confidence + '">';
      }
      if (state.mode === "Écouter") html += '<button class="secondary-btn listen-btn" type="button" data-act="speak-question">🔊 Écouter la question</button>';
      if (state.mode === "Association") html += '<p class="study-tip">Cherche un lien ou une image mentale reliant la question à la réponse.</p>';
      if (state.mode === "Palais mental") html += '<p class="study-tip">Associe cette notion à un lieu familier ou un objet précis.</p>';
      if (state.mode === "Premières lettres" && !session.shown) {
        html += '<p class="letter-hint">' + escapeHtml(card.back.split(/\s+/).map(function (word) { return word ? word.charAt(0) + "…" : ""; }).join(" ")) + '</p>';
      }
      if (session.checkResult) {
        html += '<p class="answer-feedback ' + (session.checkResult.correct ? 'feedback-good' : 'feedback-bad') + '">' + (session.checkResult.correct ? 'Bonne réponse !' : 'À retravailler : ta réponse ne correspond pas tout à fait.') + '</p>';
        html += '<div class="study-answer-label">RÉPONSE ATTENDUE</div><div class="study-answer">' + escapeHtml(card.back).replace(/\n/g, "<br>") + '</div>';
        html += '<button class="primary-btn next-card-btn" type="button" data-act="next-card">Continuer</button>';
      } else if ((state.mode === "Taper" || state.mode === "Réordonner") && !session.shown) {
        html += '<label class="field-label typed-answer-label" for="typedAnswer">' + (state.mode === "Réordonner" ? 'Reconstitue la réponse dans le bon ordre' : 'Ta réponse') + '</label><textarea class="text-area typed-answer" id="typedAnswer" rows="3" placeholder="Écris ta réponse de mémoire…"></textarea><button class="primary-btn next-card-btn" type="button" data-act="check-typed-answer">Vérifier ma réponse</button>';
      } else if (state.mode === "Parler" && !session.shown) {
        html += '<button class="primary-btn reveal-btn" type="button" data-act="start-speaking">🎙️ Répondre à voix haute</button><p class="study-footnote">Le navigateur peut demander l’autorisation du microphone. La reconnaissance vocale dépend de sa prise en charge.</p>';
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
      } else if (!session.shown) {
        html += '<button class="primary-btn reveal-btn" type="button" data-act="show-answer">' + (state.mode === "Écouter" ? 'Afficher la réponse' : 'Toucher pour révéler la réponse') + '</button>';
      } else {
        if (state.mode === "Écouter") html += '<button class="secondary-btn listen-btn" type="button" data-act="speak-answer">🔊 Écouter la réponse</button>';
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
    if (event.target && event.target.id === "confidenceSlider") {
      session.confidence = Number(event.target.value);
      var value = $("#confidenceValue");
      if (value) value.textContent = String(session.confidence) + " %";
    }
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
      state.mode = MODES.indexOf(button.dataset.mode) >= 0 ? button.dataset.mode : "Toucher pour révéler";
      save();
      if (session.current) {
        session.shown = false;
        session.picked = -1;
        session.qcmGraded = false;
        session.checkResult = null;
        session.options = state.mode === "Choix multiple" ? prepareOptions(session.current) : null;
      }
      renderReview();
    } else if (action === "show-answer") {
      session.shown = true;
      renderReview();
    } else if (action === "speak-question") {
      if (session.current) speakLine(session.current.front);
    } else if (action === "speak-answer") {
      if (session.current) speakLine(session.current.back);
    } else if (action === "check-typed-answer") {
      if (!session.current || session.checkResult) return;
      var typedNode = $("#typedAnswer");
      var typedValue = typedNode ? typedNode.value : "";
      if (!typedValue.trim()) { notify("Écris d’abord une réponse."); if (typedNode) typedNode.focus(); return; }
      var isCorrect = normalizeAnswer(typedValue) === normalizeAnswer(session.current.back);
      session.checkResult = { correct: isCorrect, entered: typedValue };
      session.shown = true;
      registerReview(session.current, isCorrect ? 2 : 0);
      session.reviewed += 1;
      if (!isCorrect) session.queue.push(session.current);
      renderReview();
    } else if (action === "start-speaking") {
      if (!session.current || session.checkResult) return;
      var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) { notify("La reconnaissance vocale n’est pas prise en charge ici. Choisis « Taper » ou « Toucher pour révéler »."); return; }
      var recognition = new Recognition();
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      button.disabled = true;
      button.textContent = "Écoute en cours…";
      recognition.onresult = function (resultEvent) {
        var spoken = resultEvent.results && resultEvent.results[0] && resultEvent.results[0][0] ? resultEvent.results[0][0].transcript : "";
        var spokenCorrect = normalizeAnswer(spoken) === normalizeAnswer(session.current.back);
        session.speechText = spoken;
        session.checkResult = { correct: spokenCorrect, entered: spoken };
        session.shown = true;
        registerReview(session.current, spokenCorrect ? 2 : 0);
        session.reviewed += 1;
        if (!spokenCorrect) session.queue.push(session.current);
        renderReview();
      };
      recognition.onerror = function () { notify("Le micro n’a pas pu reconnaître ta réponse. Vérifie l’autorisation du micro ou utilise « Taper »."); if (button.isConnected) { button.disabled = false; button.textContent = "🎙️ Répondre à voix haute"; } };
      recognition.onend = function () { if (button.isConnected) { button.disabled = false; button.textContent = "🎙️ Répondre à voix haute"; } };
      try { recognition.start(); } catch (error) { notify("Impossible de démarrer le micro. Essaie « Taper »."); button.disabled = false; }
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