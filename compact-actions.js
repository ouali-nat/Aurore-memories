(function () {
  "use strict";
  if (window.__auroreCompactActionsInstalled) return;
  window.__auroreCompactActionsInstalled = true;
  var IMPORTS_KEY = "aurore-learning-imported-resources-v1";
  var DATA_KEY = "aurore-memory-cards-v1";
  var dialog = null, activeItem = null, activeActions = null, actionsMarker = null;
  var ITEM_SELECTOR = ".memory-row, .audio-sequence-card, .public-learning-card, .community-imported-item, .group-card, .memory-block-card";
  var ACTION_SELECTOR = ".memory-row-actions, .audio-item-actions, .public-learning-actions, .group-card-actions, .memory-block-actions";
  function read(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (_) { return fallback; } }
  function safeName(value) { return String(value || "aurore-contenu").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "aurore-contenu"; }
  function saveFile(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = safeName(name); document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
  }
  function saveJson(name, data) { saveFile(name, JSON.stringify(data, null, 2), "application/json;charset=utf-8"); }
  function triggerAppAction(action, deck) {
    var b = document.createElement("button"); b.type = "button"; b.hidden = true; b.dataset.act = action; if (deck != null) b.dataset.deck = deck;
    document.body.appendChild(b); b.click(); b.remove();
  }
  function itemTitle(item) {
    var h = item.querySelector(".memory-row-main h3, .memory-row-main h2, .audio-item-main strong, .public-learning-card h2, .community-imported-item h3, .community-imported-item h4, .group-card h4, .memory-block-text, .memory-block-number");
    return (h && h.textContent || "Contenu Aurore").trim();
  }
  function importedItem(item) {
    var type = item.dataset.communityType, id = item.dataset.communityId;
    if (!type || !id) return null;
    var imports = read(IMPORTS_KEY, {}), list = imports[type];
    return Array.isArray(list) ? list.find(function (x) { return String(x.id) === String(id); }) || null : null;
  }
  async function downloadItem(item) {
    var imported = importedItem(item), title = itemTitle(item), currentActions = activeActions;
    var deleteDeck = item.querySelector('[data-act="delete-deck"]') || currentActions && currentActions.querySelector('[data-act="delete-deck"]');
    var deleteQcm = item.querySelector('[data-act="delete-qcm"]') || currentActions && currentActions.querySelector('[data-act="delete-qcm"]');
    var existingDownloader = currentActions && currentActions.querySelector("[data-download-resource], [data-download-series]");
    if (existingDownloader) { existingDownloader.click(); return; }
    if (imported) {
      if (imported.resource_type === "audio") {
        var tracks = imported.payload && imported.payload.tracks || [];
        if (!tracks.length) { saveJson(title + "-audio.json", imported); return; }
        for (var ti = 0; ti < tracks.length; ti++) {
          var track = tracks[ti], trackName = track.name || title + "-piste-" + (ti + 1);
          if (track.url) {
            try {
              var response = await fetch(track.url);
              if (!response.ok) throw new Error("Récupération du fichier audio impossible.");
              var audioBlob = await response.blob(), audioType = track.mime || audioBlob.type || "";
              var audioExt = /ogg/i.test(audioType) ? ".ogg" : /mp4/i.test(audioType) ? ".m4a" : /mpeg|mp3/i.test(audioType) ? ".mp3" : ".webm";
              saveFile(trackName + audioExt, audioBlob, audioType || "application/octet-stream");
            } catch (_) { saveJson(trackName + ".json", { name: trackName, text: track.text || "", language: track.language || "fr-FR", voice: track.voice || "", rate: track.rate || 1, source: track.url || null }); }
          } else saveJson(trackName + ".json", { format: "Aurore audio text", name: trackName, text: track.text || "", language: track.language || "fr-FR", voice: track.voice || "", rate: track.rate || 1 });
          if (ti < tracks.length - 1) await new Promise(function (resolve) { window.setTimeout(resolve, 260); });
        }
        return;
      }
      if (imported.resource_type === "memory" || imported.payload && imported.payload.format === "aurore-memory-v1") {
        var parts = imported.payload && imported.payload.cards || [];
        var text = parts.map(function (c, i) { return "PASSAGE " + (i + 1) + "\n" + String(c.front || "") + (c.back && c.back !== c.front ? "\n\n" + String(c.back) : ""); }).join("\n\n────────────────────\n\n");
        saveFile(title + ".txt", (title + "\n\n" + text).trim() + "\n");
      } else saveJson(title + (imported.resource_type === "qcm" ? "-qcm.json" : "-contenu.json"), imported);
      return;
    }
    if (deleteDeck) {
      var deck = deleteDeck.dataset.deck || title, kind = deleteDeck.dataset.kind || "flashcard";
      if (kind !== "memory") { triggerAppAction("export-series-pdf", deck); return; }
      var state = read(DATA_KEY, {}), cards = (state.cards || []).filter(function (c) { return String(c.deck) === String(deck) && (c.kind === "memory" || /(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(c.front || ""))); });
      if (!cards.length) { saveFile(deck + ".txt", deck + "\n\nAucun passage lisible n’a été trouvé dans les données locales.\n"); return; }
      var content = cards.map(function (c, i) { return "PASSAGE " + (i + 1) + "\n" + String(c.back || c.front || "") + (c.front && c.back && c.front !== c.back ? "\n\nTitre / repère : " + c.front : ""); }).join("\n\n────────────────────\n\n");
      saveFile(deck + ".txt", deck + "\n\n" + content + "\n"); return;
    }
    if (deleteQcm) {
      var data = read(DATA_KEY, {}), qcm = (data.qcms || []).find(function (q) { return String(q.id) === String(deleteQcm.dataset.qcmId); });
      if (qcm) saveJson((qcm.title || title) + "-qcm.json", qcm); else saveJson(title + "-qcm.json", { title: title });
      return;
    }
    if (item.classList.contains("audio-sequence-card")) {
      var shareButton = item.querySelector("[data-share-audio-sequence]") || currentActions && currentActions.querySelector("[data-share-audio-sequence]"), id = shareButton && shareButton.getAttribute("data-share-audio-sequence"), api = window.auroreAudioShare;
      if (!api || !id) throw new Error("Recharge la bibliothèque audio puis réessaie.");
      var collection = api.list(), seq = (collection.sequences || []).find(function (s) { return String(s.id) === String(id); });
      if (!seq) throw new Error("Cette séquence audio n’est plus disponible.");
      if (!seq.tracks || !seq.tracks.length) { saveJson(title + "-sequence.json", seq); return; }
      for (var i = 0; i < seq.tracks.length; i++) {
        var got = await api.getBlob(seq.tracks[i].id), rec = got.record || {}, filename = (rec.name || title + "-piste-" + (i + 1));
        if (got.blob) {
          var mime = rec.mime || got.blob.type || "", ext = /ogg/i.test(mime) ? ".ogg" : /mp4/i.test(mime) ? ".m4a" : /mpeg|mp3/i.test(mime) ? ".mp3" : ".webm";
          saveFile(filename + ext, got.blob, mime || "application/octet-stream");
        } else saveJson(filename + ".json", { format: "Aurore audio text", name: rec.name || filename, text: rec.text || "", language: rec.language || "fr-FR", voice: rec.voice || "", rate: rec.rate || 1, createdAt: rec.createdAt || null });
        if (i < seq.tracks.length - 1) await new Promise(function (resolve) { window.setTimeout(resolve, 260); });
      }
      return;
    }
    if (item.classList.contains("public-learning-card")) {
      var detail = Array.from(item.querySelectorAll("h2,h3,p,small")).map(function (n) { return (n.textContent || "").trim(); }).filter(Boolean).join("\n\n");
      saveFile(title + ".txt", detail + "\n"); return;
    }
    var summary = Array.from(item.querySelectorAll("h2,h3,h4,strong,p,small")).map(function (n) { return (n.textContent || "").trim(); }).filter(Boolean).join("\n\n");
    saveFile(title + ".txt", summary + "\n");
  }
  function createButton(text, cls, handler) {
    var b = document.createElement("button"); b.type = "button"; b.className = cls || "secondary-btn"; b.textContent = text; b.addEventListener("click", handler); return b;
  }
  function closeDialog() {
    if (!dialog) return;
    var d = dialog, item = activeItem, actions = activeActions, marker = actionsMarker;
    d.close(); d.remove();
    if (item && actions && marker && marker.parentNode === item) item.insertBefore(actions, marker.nextSibling);
    if (marker && marker.parentNode) marker.remove();
    if (item) item.classList.remove("compact-actions-open");
    dialog = activeItem = activeActions = actionsMarker = null;
  }
  function openDialog(item, actions) {
    closeDialog();
    activeItem = item; activeActions = actions; item.classList.add("compact-actions-open");
    actionsMarker = document.createComment("actions moved into compact menu");
    actions.parentNode.insertBefore(actionsMarker, actions);
    dialog = document.createElement("dialog"); dialog.className = "compact-action-dialog"; dialog.setAttribute("aria-label", "Options de " + itemTitle(item));
    var header = document.createElement("header"); header.className = "compact-action-header";
    var heading = document.createElement("div"); heading.className = "compact-action-heading";
    var kicker = document.createElement("p"); kicker.className = "section-kicker"; kicker.textContent = "OPTIONS";
    var title = document.createElement("h2"); title.textContent = itemTitle(item); heading.append(kicker, title);
    var close = createButton("×", "compact-action-close", closeDialog); close.setAttribute("aria-label", "Fermer les options"); header.append(heading, close);
    var content = document.createElement("div"); content.className = "compact-action-content";
    var hasExistingDownload = !!actions.querySelector("[data-download-resource], [data-download-series]");
    if (!hasExistingDownload) {
      var downloadLabel = item.classList.contains("memory-series-card") ? "Télécharger le PDF" : item.classList.contains("audio-sequence-card") ? "Télécharger les audios" : "Télécharger";
      var downloadButton = createButton(downloadLabel, "primary-btn compact-action-download", async function () {
        downloadButton.disabled = true; downloadButton.textContent = "Préparation du téléchargement…";
        try { await downloadItem(item); closeDialog(); }
        catch (e) { downloadButton.disabled = false; downloadButton.textContent = "Réessayer le téléchargement"; var msg = content.querySelector(".compact-action-error"); if (!msg) { msg = document.createElement("p"); msg.className = "compact-action-error"; content.appendChild(msg); } msg.textContent = e && e.message || "Téléchargement impossible. Réessaie."; }
      });
      content.appendChild(downloadButton);
    }
    if (item.classList.contains("memory-series-card")) {
      var extras = document.createElement("div"); extras.className = "compact-action-extra";
      var deck = (item.querySelector('[data-act="delete-deck"]') || {}).dataset;
      var deckName = deck && deck.deck || itemTitle(item);
      extras.appendChild(createButton("Télécharger les images", "secondary-btn", function () { triggerAppAction("export-series-images", deckName); closeDialog(); }));
      extras.appendChild(createButton("Imprimer les cartes", "secondary-btn", function () { triggerAppAction("print-series", deckName); closeDialog(); }));
      extras.appendChild(createButton("Partager avec un groupe", "secondary-btn", function () { triggerAppAction("group-deck", deckName); closeDialog(); }));
      extras.appendChild(createButton("Autres options de partage", "secondary-btn", function () { triggerAppAction("series-share-options", deckName); closeDialog(); }));
      content.appendChild(extras);
    }
    actions.classList.add("compact-action-list");
    content.appendChild(actions); dialog.append(header, content); document.body.appendChild(dialog);
    dialog.addEventListener("click", function (e) { if (e.target === dialog) closeDialog(); });
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(); });
    if (actions.dataset.compactCloseBound !== "true") {
      actions.dataset.compactCloseBound = "true";
      actions.addEventListener("click", function (e) {
        if (e.target.closest("a,button")) window.setTimeout(function () { if (dialog && dialog.isConnected) closeDialog(); }, 0);
      });
    }
    try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", "open"); }
  }
  function decorate(item) {
    if (!item || item.nodeType !== 1 || item.dataset.compactMenuReady === "true") return;
    var actions = item.querySelector(ACTION_SELECTOR);
    if (!actions) return;
    if (actions.closest("dialog,.compact-action-dialog")) return;
    item.dataset.compactMenuReady = "true"; item.classList.add("has-compact-actions");
    var button = item.querySelector(":scope > .series-menu-trigger");
    if (!button) {
      button = document.createElement("button"); button.type = "button"; button.className = "compact-action-trigger"; button.textContent = "•••"; button.setAttribute("aria-label", "Ouvrir les options de " + itemTitle(item)); button.setAttribute("aria-haspopup", "dialog");
      item.insertBefore(button, item.firstChild);
    } else {
      button.classList.add("compact-action-trigger"); button.setAttribute("aria-label", "Ouvrir les options de " + itemTitle(item));
    }
    button.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openDialog(item, actions); });
  }
  function scan(root) {
    if (!root) return;
    if (root.matches && root.matches(ITEM_SELECTOR)) decorate(root);
    if (root.querySelectorAll) root.querySelectorAll(ITEM_SELECTOR).forEach(decorate);
  }
  function boot() {
    scan(document);
    if (window.MutationObserver && document.body) {
      var observer = new MutationObserver(function (records) { records.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dialog) closeDialog(); });
    window.addEventListener("pagehide", closeDialog);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
