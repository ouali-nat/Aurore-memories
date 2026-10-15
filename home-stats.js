(function () {
  "use strict";
  var DAY_MS = 86400000;
  var today = Math.floor(Date.now() / DAY_MS);
  var SUMMARY_KEY = "aurore-memory-home-stats-v1";

  function render(summary) {
    var memoryCount = Number(summary.memories) || 0;
    var cardCount = Number(summary.series) || 0;
    var dueCount = Number(summary.due) || 0;
    var values = {
      homeMemoryCount: memoryCount + (memoryCount === 1 ? " mémoire" : " mémoires"),
      homeCardCount: cardCount + (cardCount === 1 ? " carte" : " cartes"),
      homeDueCount: dueCount + (dueCount === 1 ? " carte à réviser aujourd’hui" : " cartes à réviser aujourd’hui")
    };
    Object.keys(values).forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.textContent = values[id];
    });
  }

  // Usually this tiny snapshot is enough; do not parse image-heavy card data on each visit.
  try {
    var cached = JSON.parse(localStorage.getItem(SUMMARY_KEY) || "null");
    if (cached && Number.isFinite(cached.memories) && Number.isFinite(cached.series) && Number.isFinite(cached.due)) {
      render(cached);
      return;
    }
  } catch (error) {}

  var cards = [];
  try {
    var stored = JSON.parse(localStorage.getItem("aurore-memory-cards-v1") || "null");
    if (stored && Array.isArray(stored.cards)) cards = stored.cards;
  } catch (error) {
    cards = [];
  }

  function kind(card) {
    if (card && card.kind === "memory") return "memory";
    if (card && card.kind === "flashcard") return "flashcard";
    return card && /(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(card.front || "")) ? "memory" : "flashcard";
  }
  function deckName(card) {
    return card && typeof card.deck === "string" && card.deck.trim() ? card.deck : "Ma mémoire";
  }

  var memoryDecks = Object.create(null);
  var flashcardDecks = Object.create(null);
  var dueCount = 0;
  cards.forEach(function (card) {
    card = card && typeof card === "object" ? card : {};
    (kind(card) === "memory" ? memoryDecks : flashcardDecks)[deckName(card)] = true;
    var due = typeof card.due === "number" && isFinite(card.due) ? card.due : today;
    if (due <= today) dueCount += 1;
  });

  var summary = {
    memories: Object.keys(memoryDecks).length,
    series: Object.keys(flashcardDecks).length,
    due: dueCount
  };
  render(summary);
  try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary)); } catch (error) {}
})();
