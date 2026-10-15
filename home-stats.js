(function () {
  "use strict";

  // The home page only needs these three counts; do not load the full
  // 100+ KB library/review application just to display its dashboard badges.
  var DAY_MS = 86400000;
  var today = Math.floor(Date.now() / DAY_MS);
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
    var type = kind(card);
    (type === "memory" ? memoryDecks : flashcardDecks)[deckName(card)] = true;
    var due = typeof card.due === "number" && isFinite(card.due) ? card.due : today;
    if (due <= today) dueCount += 1;
  });

  var values = {
    homeMemoryCount: Object.keys(memoryDecks).length + (Object.keys(memoryDecks).length === 1 ? " mémoire" : " mémoires"),
    homeCardCount: Object.keys(flashcardDecks).length + (Object.keys(flashcardDecks).length === 1 ? " carte" : " cartes"),
    homeDueCount: dueCount + (dueCount === 1 ? " carte à réviser aujourd’hui" : " cartes à réviser aujourd’hui")
  };
  Object.keys(values).forEach(function (id) {
    var node = document.getElementById(id);
    if (node) node.textContent = values[id];
  });
})();
