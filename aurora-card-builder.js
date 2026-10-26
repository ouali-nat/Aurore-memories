(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var promptInput = $("#auroraCardPrompt"), countInput = $("#auroraCardCount");
  var generateButton = $("#auroraCardGenerate"), status = $("#auroraCardStatus");
  var results = $("#auroraCardResults"), resultList = $("#auroraCardResultList");
  var appendButton = $("#auroraCardAppend"), replaceButton = $("#auroraCardReplace"), discardButton = $("#auroraCardDiscard");
  var pending = [], pendingTitle = "", busy = false;
  if (!generateButton || !promptInput) return;

  function message(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
  }
  function setBusy(value) {
    busy = value;
    generateButton.disabled = value;
    generateButton.textContent = value ? "Aurora prépare les cartes…" : "Préparer les cartes";
    promptInput.disabled = value;
    countInput.disabled = value;
  }
  function safeText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max || 5000);
  }
  function extractPayload(value) {
    var candidates = [value];
    if (value && typeof value.reply === "string") candidates.push(value.reply);
    if (value && value.action) candidates.push(value.action);
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (typeof candidate === "string") {
        var text = candidate.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
        try { candidate = JSON.parse(text); } catch (_) {
          var match = text.match(/\{[\s\S]*\}/);
          if (match) { try { candidate = JSON.parse(match[0]); } catch (ignored) { continue; } }
          else continue;
        }
      }
      if (!candidate || typeof candidate !== "object") continue;
      var cards = Array.isArray(candidate.cards) ? candidate.cards :
        (candidate.type === "create_flashcards" && Array.isArray(candidate.cards) ? candidate.cards : null);
      if (!cards && candidate.action && Array.isArray(candidate.action.cards)) cards = candidate.action.cards;
      if (!cards) continue;
      cards = cards.map(function (card) {
        return { front: safeText(card && (card.front || card.question), 5000), back: safeText(card && (card.back || card.answer), 5000) };
      }).filter(function (card) { return card.front && card.back; }).slice(0, 40);
      if (cards.length) return { title: safeText(candidate.title || (candidate.action && candidate.action.title), 100), cards: cards };
    }
    return null;
  }
  function renderResults() {
    resultList.replaceChildren();
    pending.forEach(function (card, index) {
      var item = document.createElement("li");
      item.className = "aurora-card-result";
      var number = document.createElement("span");
      number.className = "aurora-card-result-number";
      number.textContent = String(index + 1);
      var body = document.createElement("div");
      body.className = "aurora-card-result-copy";
      var front = document.createElement("strong");
      front.textContent = card.front;
      var back = document.createElement("p");
      back.textContent = card.back;
      body.append(front, back);
      item.append(number, body);
      resultList.appendChild(item);
    });
    $("#auroraCardResultsTitle").textContent = pendingTitle || "Cartes proposées";
    $("#auroraCardResultsCount").textContent = pending.length + (pending.length > 1 ? " cartes" : " carte");
    results.hidden = false;
  }
  function currentRows() {
    return Array.prototype.slice.call(document.querySelectorAll("#flashcardDrafts [data-flashcard-row]"));
  }
  function insertCards(replace) {
    if (!pending.length) return;
    var list = $("#flashcardDrafts");
    var add = $("#addFlashcard");
    var rows = currentRows();
    if (replace) {
      if (rows.some(function (row) { return row.querySelector(".card-question").value.trim() || row.querySelector(".card-answer").value.trim(); }) &&
          !window.confirm("Remplacer les questions actuellement présentes dans l’éditeur ? Cette action ne touche pas encore aux séries enregistrées.")) return;
      while (list.querySelectorAll("[data-flashcard-row]").length > 1) {
        var last = list.querySelector("[data-flashcard-row]:last-of-type");
        if (!last) break;
        last.remove();
      }
      rows = currentRows();
      rows.forEach(function (row) {
        row.querySelector(".card-question").value = "";
        row.querySelector(".card-answer").value = "";
        delete row.dataset.cardId;
      });
    }
    var available = currentRows();
    var index = 0;
    available.forEach(function (row) {
      if (index >= pending.length) return;
      var front = row.querySelector(".card-question"), back = row.querySelector(".card-answer");
      if (!front.value.trim() && !back.value.trim()) {
        front.value = pending[index].front;
        back.value = pending[index].back;
        front.dispatchEvent(new Event("input", { bubbles: true }));
        back.dispatchEvent(new Event("input", { bubbles: true }));
        index += 1;
      }
    });
    while (index < pending.length) {
      add.click();
      var row = currentRows().slice(-1)[0];
      if (!row) break;
      row.querySelector(".card-question").value = pending[index].front;
      row.querySelector(".card-answer").value = pending[index].back;
      row.querySelector(".card-question").dispatchEvent(new Event("input", { bubbles: true }));
      row.querySelector(".card-answer").dispatchEvent(new Event("input", { bubbles: true }));
      index += 1;
    }
    var title = $("#seriesTitle");
    if (pendingTitle && title && !title.value.trim()) title.value = pendingTitle.slice(0, 100);
    if (typeof window.auroreToast === "function") window.auroreToast(index + " carte(s) ajoutée(s) à l’éditeur. Relis-les avant d’enregistrer.");
    message(index + " carte(s) transférée(s) dans l’éditeur. Rien n’a encore été enregistré.");
    results.hidden = true;
    promptInput.value = "";
    pending = [];
    document.querySelector("#flashcardDrafts .card-question")?.focus();
  }
  generateButton.addEventListener("click", async function () {
    var request = promptInput.value.trim();
    if (!request || busy) { if (!request) message("Décris le sujet ou colle les éléments du cours à transformer.", true); return; }
    setBusy(true); message("Connexion à Aurora…");
    try {
      if (!window.auroreAuthReady) throw new Error("Le service Aurore ID n’est pas prêt. Recharge la page puis réessaie.");
      var auth = await window.auroreAuthReady;
      var session = await auth.getSession();
      if (!session || !session.access_token) throw new Error("Connecte-toi avec Aurore ID pour demander à Aurora de créer tes cartes.");
      var mode = document.querySelector('input[name="cardMode"]:checked')?.value || "simple";
      var count = countInput.value === "auto" ? "un nombre adapté au contenu (maximum 30)" : countInput.value;
      var instructions = [
        "Tu es Aurora, l'assistante pédagogique d'Aurore Mémoire.",
        "Prépare des cartes recto-verso pour l'éditeur existant.",
        "Retourne UNIQUEMENT un objet JSON valide, sans Markdown ni commentaire, de la forme {\"title\":\"titre court\",\"cards\":[{\"front\":\"question ou notion au recto\",\"back\":\"réponse exacte et pédagogique au verso\"}]} .",
        "Chaque carte doit être autonome, exacte, concise et utile pour le rappel actif. N'invente pas de faits. Si le cours est insuffisant ou ambigu, précise les limites dans les réponses plutôt que de fabriquer des informations.",
        "Nombre demandé : " + count + ". Maximum 30 cartes. Titre maximum 100 caractères.",
        "Mode : " + (mode === "scientific" ? "scientifique. Utilise des formules LaTeX quand nécessaire, avec \( ... \) pour les formules en ligne et \\[ ... \\] pour les formules en affichage." : "simple. Privilégie du texte clair et n'utilise pas de LaTeX sauf demande explicite."),
        "Demande et contenu de l'utilisateur :\n" + request
      ].join("\n\n");
      message("Aurora prépare les rectos et les versos…");
      var response = await auth.client.functions.invoke("aurore-grok", {
        body: { messages: [{ role: "user", content: instructions }], appContext: { purpose: "draft_flashcards_in_existing_editor", cardMode: mode } }
      });
      if (response.error) {
        var detail = response.data && response.data.error;
        throw new Error(detail || response.error.message || "Aurora n’a pas pu répondre.");
      }
      var payload = extractPayload(response.data || {});
      if (!payload) throw new Error("La réponse d’Aurora ne contient pas de cartes structurées exploitables. Réessaie en précisant davantage le sujet.");
      pending = payload.cards;
      pendingTitle = payload.title || "";
      renderResults();
      message("Proposition prête : relis l’aperçu, puis ajoute les cartes à l’éditeur.");
    } catch (error) {
      message(error && error.message ? error.message : "Impossible de générer les cartes pour le moment.", true);
    } finally { setBusy(false); }
  });
  appendButton.addEventListener("click", function () { insertCards(false); });
  replaceButton.addEventListener("click", function () { insertCards(true); });
  discardButton.addEventListener("click", function () { pending = []; pendingTitle = ""; results.hidden = true; message("Proposition annulée. Le brouillon de la série reste inchangé."); });
  promptInput.addEventListener("keydown", function (event) { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generateButton.click(); });
})();