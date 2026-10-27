(function () {
  "use strict";
  var $ = function (selector) { return document.querySelector(selector); };
  var form = $("#flashcardForm"), title = $("#seriesTitle");
  if (!form || !title || !$("#flashcardDrafts")) return;
  var style = document.createElement("style");
  style.textContent = [
    ".bulk-card-import{margin:20px 0;padding:18px;border:1px solid var(--line,rgba(148,163,184,.24));border-radius:18px;background:rgba(148,163,184,.055)}",
    ".bulk-card-import h2{margin:3px 0 7px;font-size:1.12rem}.bulk-card-import p{line-height:1.5}",
    ".bulk-card-import .bulk-help{margin:0 0 14px;color:var(--muted,#8f91a3);font-size:.9rem}",
    ".bulk-card-import textarea{display:block;box-sizing:border-box;width:100%;min-height:190px;resize:vertical;font-family:inherit;line-height:1.55}",
    ".bulk-import-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}",
    ".bulk-import-status{margin:12px 0 0;font-size:.9rem;line-height:1.5}.bulk-import-status.is-error{color:#d96d78}",
    ".bulk-import-preview{margin-top:16px;border-top:1px solid var(--line,rgba(148,163,184,.2));padding-top:14px}",
    ".bulk-import-list{display:grid;gap:9px;margin:12px 0;padding:0;list-style:none;max-height:380px;overflow:auto}",
    ".bulk-import-item{padding:12px;border:1px solid var(--line,rgba(148,163,184,.2));border-radius:12px;min-width:0;overflow-wrap:anywhere}",
    ".bulk-import-item strong{display:block;font-size:.9rem}.bulk-import-item p{margin:6px 0 0;white-space:pre-wrap;font-size:.9rem}",
    ".bulk-import-count{font-size:.86rem;color:var(--muted,#8f91a3)}",
    "@media(max-width:600px){.bulk-card-import{padding:14px}.bulk-import-actions{flex-direction:column}.bulk-import-actions button{width:100%}}"
  ].join("");
  document.head.appendChild(style);
  var panel = document.createElement("section");
  panel.className = "bulk-card-import";
  panel.setAttribute("aria-labelledby", "bulkCardImportTitle");
  panel.innerHTML =
    '<p class="section-kicker">IMPORTATION EN LOT</p>' +
    '<h2 id="bulkCardImportTitle">Créer plusieurs cartes depuis un texte</h2>' +
    '<p class="bulk-help">Colle ici le texte complet d’une IA ou de tes notes. Aurore reconnaît les titres « Carte 1 », « Recto : » et « Verso : », puis prépare les cartes sans les enregistrer automatiquement.</p>' +
    '<label class="field-label" for="bulkCardImportText">Texte à importer</label>' +
    '<textarea class="text-area" id="bulkCardImportText" maxlength="100000" placeholder="Carte 1&#10;Recto : formule ou question&#10;Verso : explication&#10;&#10;Carte 2&#10;Recto : …&#10;Verso : …"></textarea>' +
    '<div class="bulk-import-actions"><button class="secondary-btn" type="button" id="bulkCardAnalyze">Analyser le texte</button></div>' +
    '<p class="bulk-import-status" id="bulkCardImportStatus" role="status" aria-live="polite"></p>' +
    '<div class="bulk-import-preview" id="bulkCardImportPreview" hidden>' +
      '<div><strong>Vérification avant transfert</strong> <span class="bulk-import-count" id="bulkCardImportCount"></span></div>' +
      '<ol class="bulk-import-list" id="bulkCardImportList"></ol>' +
      '<div class="bulk-import-actions"><button class="primary-btn" type="button" id="bulkCardTransfer">Transférer dans l’éditeur</button><button class="secondary-btn" type="button" id="bulkCardCancel">Effacer l’aperçu</button></div>' +
      '<p class="bulk-help">Les cartes seront ajoutées aux blocs ci-dessous. Vérifie les formules et les réponses, puis clique sur « Enregistrer la série ».</p>' +
    '</div>';
  title.insertAdjacentElement("afterend", panel);
  var input = $("#bulkCardImportText"), status = $("#bulkCardImportStatus");
  var preview = $("#bulkCardImportPreview"), previewList = $("#bulkCardImportList");
  var analyze = $("#bulkCardAnalyze"), transfer = $("#bulkCardTransfer"), cancel = $("#bulkCardCancel");
  var pending = [], pendingTitle = "";
  function message(text, error) {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!error);
  }
  function cleanField(value) {
    return String(value || "").trim()
      .replace(/^\s*\x60{1,3}(?:latex|tex|text)?\s*/i, "")
      .replace(/\s*\x60{1,3}\s*$/, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/^\s*[-–—]\s*/, "")
      .trim();
  }
  function extractTitle(text) {
    var before = text.split(/^\s*(?:\*\*)?Carte\s+\d+/im)[0].trim();
    var match = before.match(/\(([^()\n]{3,100})\)/);
    if (match) return cleanField(match[1]).replace(/[.!?]+$/, "").slice(0, 100);
    var line = before.split(/\r?\n/).map(function (s) { return s.trim(); }).find(function (s) {
      return s && !/^voici une première série\b/i.test(s) && !/^chaque carte\b/i.test(s);
    });
    return line ? cleanField(line.replace(/^#+\s*/, "")).slice(0, 100) : "";
  }
  function normalizeFront(value) {
    var text = cleanField(value);
    if (!text || /\\\(|\\\[|\$\$|(^|[^$])\$[^$\n]+\$(?!\$)/.test(text)) return text;
    if (/\\[a-zA-Z]+|[_^]=?|[=<>≤≥∑∫√]/.test(text)) {
      return /\r?\n/.test(text) ? "\\[\n" + text + "\n\\]" : "\\(" + text + "\\)";
    }
    return text;
  }
  function parseText(raw) {
    var text = String(raw || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return { cards: [], incomplete: [], title: "", found: 0 };
    var header = /^\s*(?:\*\*\s*)?Carte\s+\d+\s*(?:\*\*)?\s*$/gim;
    var matches = [], match;
    while ((match = header.exec(text)) !== null) matches.push({ index: match.index, end: header.lastIndex, label: match[0] });
    if (!matches.length) {
      var loose = /^\s*(?:\*\*)?(?:Carte\s+)?(?:n°?\s*)?\d+\s*[.)-]\s*(?:\*\*)?\s*$/gim;
      while ((match = loose.exec(text)) !== null) matches.push({ index: match.index, end: loose.lastIndex, label: match[0] });
    }
    var cards = [], incomplete = [];
    for (var i = 0; i < matches.length; i++) {
      var chunk = text.slice(matches[i].end, i + 1 < matches.length ? matches[i + 1].index : text.length);
      var frontMatch = chunk.match(/(?:^|\n)\s*(?:\*\*)?Recto(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:\*\*)?Verso(?:\*\*)?\s*:)|$)/i);
      var backMatch = chunk.match(/(?:^|\n)\s*(?:\*\*)?Verso(?:\*\*)?\s*:\s*([\s\S]*?)$/i);
      var front = frontMatch ? cleanField(frontMatch[1]) : "";
      var back = backMatch ? cleanField(backMatch[1]) : "";
      if (front && back) cards.push({ front: normalizeFront(front), back: back });
      else incomplete.push({ number: i + 1, missing: !front && !back ? "recto et verso" : (!front ? "recto" : "verso") });
    }
    return { cards: cards.slice(0, 100), incomplete: incomplete, title: extractTitle(text), found: matches.length };
  }
  function renderPreview() {
    previewList.replaceChildren();
    pending.forEach(function (card, index) {
      var item = document.createElement("li");
      item.className = "bulk-import-item";
      var heading = document.createElement("strong");
      heading.textContent = "Carte " + (index + 1) + " — Recto";
      var front = document.createElement("p");
      front.textContent = card.front;
      var backHeading = document.createElement("strong");
      backHeading.style.marginTop = "10px";
      backHeading.textContent = "Verso";
      var back = document.createElement("p");
      back.textContent = card.back;
      item.append(heading, front, backHeading, back);
      previewList.appendChild(item);
    });
    $("#bulkCardImportCount").textContent = pending.length + (pending.length > 1 ? " cartes reconnues" : " carte reconnue");
    preview.hidden = !pending.length;
    if (window.renderAuroreMath && pending.length) window.renderAuroreMath(previewList);
  }
  analyze.addEventListener("click", function () {
    var result = parseText(input.value);
    pending = result.cards;
    pendingTitle = result.title;
    renderPreview();
    transfer.disabled = false;
    if (!result.found) {
      message("Aucune carte reconnue. Utilise des blocs « Carte 1 », « Recto : » et « Verso : ».", true);
      return;
    }
    if (result.incomplete.length) {
      var details = result.incomplete.map(function (item) { return "Carte " + item.number + " : " + item.missing; }).join(" ; ");
      message(result.cards.length + " carte(s) complète(s), mais certaines cartes sont incomplètes (" + details + "). Corrige le texte avant de transférer.", true);
      transfer.disabled = true;
      return;
    }
    if (result.found > 100) {
      message("Plus de 100 cartes détectées. Sépare le texte en plusieurs lots pour éviter un import trop volumineux.", true);
      transfer.disabled = true;
      return;
    }
    transfer.disabled = !pending.length;
    message(pending.length + " carte(s) reconnue(s). Vérifie l’aperçu avant le transfert.");
  });
  transfer.addEventListener("click", function () {
    if (!pending.length || transfer.disabled) return;
    var rows = Array.prototype.slice.call($("#flashcardDrafts").querySelectorAll("[data-flashcard-row]"));
    var index = 0;
    if (pendingTitle && !title.value.trim()) title.value = pendingTitle;
    pending.forEach(function (card) {
      var row = rows.find(function (candidate) {
        return !candidate.querySelector(".card-question").value.trim() &&
               !candidate.querySelector(".card-answer").value.trim();
      });
      if (!row) {
        $("#addFlashcard").click();
        row = $("#flashcardDrafts").lastElementChild;
        rows.push(row);
      }
      if (!row) return;
      row.querySelector(".card-question").value = card.front;
      row.querySelector(".card-answer").value = card.back;
      row.querySelector(".card-question").dispatchEvent(new Event("input", { bubbles: true }));
      row.querySelector(".card-answer").dispatchEvent(new Event("input", { bubbles: true }));
      index++;
    });
    if (window.renderAuroreMath) window.renderAuroreMath($("#flashcardDrafts"));
    message(index + " carte(s) transférée(s) dans l’éditeur. Rien n’a encore été enregistré.");
    preview.hidden = true;
    pending = [];
    input.value = "";
    var first = $("#flashcardDrafts .card-question");
    if (first) first.focus();
  });
  cancel.addEventListener("click", function () {
    pending = [];
    preview.hidden = true;
    previewList.replaceChildren();
    message("Aperçu effacé. Les cartes déjà présentes dans l’éditeur n’ont pas été modifiées.");
  });
})();