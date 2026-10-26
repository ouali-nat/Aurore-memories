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
    var queue = [value], seen = 0;
    while (queue.length && seen < 24) {
      var candidate = queue.shift();
      seen += 1;
      if (typeof candidate === "string") {
        var text = candidate.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {
          var match = text.match(/\{[\s\S]*\}/);
          if (match) { try { parsed = JSON.parse(match[0]); } catch (ignored) {} }
        }
        if (parsed !== null) queue.unshift(parsed);
        continue;
      }
      if (!candidate || typeof candidate !== "object") continue;
      var cards = Array.isArray(candidate.cards) ? candidate.cards : null;
      if (!cards && candidate.action && Array.isArray(candidate.action.cards)) cards = candidate.action.cards;
      if (cards) {
        cards = cards.map(function (card) {
          return { front: safeText(card && (card.front || card.question || card.recto), 5000), back: safeText(card && (card.back || card.answer || card.verso), 5000) };
        }).filter(function (card) { return card.front && card.back; }).slice(0, 20);
        if (cards.length) return { title: safeText(candidate.title || (candidate.action && candidate.action.title), 100), cards: cards };
      }
      ["action", "reply", "content", "response", "output_text", "result", "data"].forEach(function (key) {
        if (candidate[key] !== undefined && candidate[key] !== null) queue.push(candidate[key]);
      });
    }
    return null;
  }
  function formatScientificLatex(value) {
    var text = safeText(value, 5000).replace(/^```(?:latex|tex)?\s*/i, "").replace(/\s*```$/, "").trim();
    if (!text) return "";
    if (text.indexOf("\\(") >= 0 || text.indexOf("\\[") >= 0 || text.indexOf("$$") >= 0 || /(^|[^$])\$[^$\n]+\$(?!\$)/.test(text)) return text;
    return /\n|\\begin\{(?:aligned|cases|array|gathered|matrix)\}/.test(text) ? "\\[\n" + text + "\n\\]" : "\\(" + text + "\\)";
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
    if (window.renderAuroreMath) window.renderAuroreMath(results);
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
    if (window.renderAuroreMath) window.renderAuroreMath(list);
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
      var count = countInput.value === "auto" ? "un nombre adapté au contenu (maximum 20)" : countInput.value;
      var instructions = [
        "Tu es Aurora, l'assistante pédagogique d'Aurore Mémoire.",
        "Prépare des cartes recto-verso pour l'éditeur existant.",
        "Retourne un objet JSON valide, sans Markdown, conforme à cette enveloppe exacte : {\"reply\":\"Proposition prête à vérifier\",\"action\":{\"type\":\"create_flashcards\",\"title\":\"titre court\",\"cards\":[{\"front\":\"question ou notion au recto\",\"back\":\"réponse exacte et pédagogique au verso\"}]}}. Le tableau cards doit être dans action, pas à la racine. N’ajoute aucun texte hors JSON.",
        "Chaque carte doit être autonome, exacte, concise et utile pour le rappel actif. Le recto ET le verso de chaque carte doivent être distincts : ne répète pas la même paire question-réponse, ne reformule pas une carte déjà proposée et ne duplique pas un contenu d’une autre carte. Compare toutes les cartes avant de répondre et remplace chaque doublon par un concept réellement différent tiré du cours. N'invente pas de faits. Si le cours est insuffisant ou ambigu, précise les limites dans les réponses plutôt que de fabriquer des informations.",
        "Nombre demandé : " + count + ". Maximum 20 cartes. Titre maximum 100 caractères.",
        "Mode : " + (mode === "scientific" ? "SCIENTIFIQUE STRICT : le recto et le verso doivent être du LaTeX pur valide, sans Markdown, sans bloc de code et sans prose hors LaTeX. Utilise \\(...\\) pour les expressions en ligne et \\[...\\] pour les formules affichées. Toute phrase explicative doit être encapsulée dans \\text{...} en mode mathématique ; utilise \\[\\begin{aligned} ... \\end{aligned}\\] pour les développements sur plusieurs lignes. N’utilise pas les dollars comme délimiteurs. Échappe correctement chaque antislash dans les chaînes JSON." : "simple. Privilégie du texte clair et n’utilise pas de LaTeX sauf demande explicite."),
        "Demande et contenu de l'utilisateur :\n" + request
      ].join("\n\n");
      message("Aurora prépare les rectos et les versos…");
      var response = await auth.client.functions.invoke("aurore-grok", {
        body: { messages: [{ role: "user", content: instructions }], appContext: { purpose: "draft_flashcards_in_existing_editor", cardMode: mode } }
      });
      if (response.error) {
        var detail = response.data && (response.data.details || response.data.error);
        try {
          var context = response.error.context;
          if (!detail && context && typeof context.clone === "function") {
            var errorBody = await context.clone().json();
            detail = errorBody && (errorBody.details || errorBody.error);
          }
        } catch (_) {}
        var errorText = String(detail || response.error.message || "");
        if (/timeout|timed out|signal timed out|délai dépassé/i.test(errorText)) {
          throw new Error("Aurora a dépassé le délai de réponse. Aucune carte n’a été ajoutée. Réessaie avec moins de cartes ou une demande plus courte.");
        }
        throw new Error(detail || response.error.message || "Aurora n’a pas pu répondre.");
      }
      var payload = extractPayload(response.data || {});
      if (!payload) throw new Error("La réponse d’Aurora ne contient pas de cartes structurées exploitables. Réessaie en précisant davantage le sujet.");
      var prepared = mode === "scientific" ? payload.cards.map(function (card) { return { front: formatScientificLatex(card.front), back: formatScientificLatex(card.back) }; }) : payload.cards;
      function canonicalCardText(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\\[a-z]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
      var seen = new Set(), duplicates = 0;
      pending = prepared.filter(function (card) { var front = canonicalCardText(card.front), back = canonicalCardText(card.back), key = front + "\u241f" + back; if (!front || !back) return false; if (seen.has(key)) { duplicates += 1; return false; } seen.add(key); return true; });
      if (!pending.length) throw new Error("Aurora a proposé des cartes vides ou toutes identiques. Rien n’a été ajouté ; reformule le sujet et réessaie.");
      pendingTitle = payload.title || "";
      renderResults();
      message("Proposition prête : relis l’aperçu, puis ajoute les cartes à l’éditeur." + (duplicates ? " " + duplicates + " carte(s) strictement identique(s) ont été écartées." : ""));
    } catch (error) {
      message(error && error.message ? error.message : "Impossible de générer les cartes pour le moment.", true);
    } finally { setBusy(false); }
  });
  appendButton.addEventListener("click", function () { insertCards(false); });
  replaceButton.addEventListener("click", function () { insertCards(true); });
  discardButton.addEventListener("click", function () { pending = []; pendingTitle = ""; results.hidden = true; message("Proposition annulée. Le brouillon de la série reste inchangé."); });
  promptInput.addEventListener("keydown", function (event) { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generateButton.click(); });
})();