(function () {
  "use strict";
  if (window.__auroreAudioCardsLoaded) return;
  window.__auroreAudioCardsLoaded = true;

  var DB_NAME = "aurore-memory-audio-v1";
  var STORE = "clips";
  var MAX_AUDIO_BYTES = 10 * 1024 * 1024;
  var form = document.getElementById("flashcardForm");
  var objectUrls = [];

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("Le stockage audio hors ligne n’est pas disponible sur ce navigateur."));
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Ouverture du stockage audio impossible.")); };
    });
  }
  async function dbRequest(mode, operation) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), request;
      try { request = operation(store); } catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = function () { db.close(); resolve(request ? request.result : true); };
      tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("Écriture audio impossible.")); };
    });
  }
  function cacheBlob(key, blob, name, mime) {
    return dbRequest("readwrite", function (store) { return store.put({ key: key, blob: blob, name: name || "audio", mime: mime || blob.type || "audio/webm", savedAt: Date.now() }); });
  }
  function getCached(key) {
    return dbRequest("readonly", function (store) { return store.get(key); });
  }
  function setMessage(row, message, error) {
    var status = row.querySelector(".aurore-audio-status");
    if (status) { status.textContent = message || ""; status.dataset.error = error ? "true" : "false"; }
  }
  function audioApi(path, options) {
    if (!window.auroreAuth || typeof window.auroreAuth.api !== "function") return Promise.reject(new Error("Connectez-vous avec Aurore ID pour synchroniser cet audio."));
    return window.auroreAuth.api(path, options || {});
  }
  async function upload(key, blob) {
    if (!navigator.onLine) throw new Error("Hors ligne : l’audio reste enregistré sur cet appareil et sera synchronisé au retour de la connexion.");
    var response = await audioApi("/api/storage?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob
    });
    if (!response.ok) {
      var message = "Envoi audio impossible (" + response.status + ").";
      try { var data = await response.json(); if (data && data.error) message = data.error; } catch (_) {}
      throw new Error(message);
    }
    return true;
  }
  async function ensureRemote(meta, blob) {
    if (!meta || !meta.key || !blob) return;
    try {
      await upload(meta.key, blob);
      meta.pending = false;
      await cacheBlob(meta.key, blob, meta.name, meta.mime);
    } catch (error) {
      meta.pending = true;
      await cacheBlob(meta.key, blob, meta.name, meta.mime).catch(function () {});
      throw error;
    }
  }
  async function getAudioBlob(meta) {
    if (!meta || !meta.key) throw new Error("Aucun audio n’est associé à cette carte.");
    var cached = await getCached(meta.key).catch(function () { return null; });
    if (cached && cached.blob) return cached.blob;
    if (!navigator.onLine) throw new Error("Cet audio n’a pas encore été téléchargé sur cet appareil. Connectez-vous une fois pour le rendre disponible hors ligne.");
    var response = await audioApi("/api/storage?key=" + encodeURIComponent(meta.key), { method: "GET" });
    if (!response.ok) throw new Error(response.status === 404 ? "Audio absent du stockage cloud." : "Téléchargement audio impossible.");
    var blob = await response.blob();
    await cacheBlob(meta.key, blob, meta.name, meta.mime);
    return blob;
  }
  function speak(text, lang) {
    if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
      window.auroreToast && window.auroreToast("La synthèse vocale n’est pas disponible sur cet appareil.");
      return;
    }
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = lang || "fr-FR";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }
  function makeButton(label, className, handler) {
    var button = document.createElement("button");
    button.type = "button"; button.className = className || "secondary-btn"; button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }
  function readMeta(row) {
    if (row._auroreAudioMeta) return row._auroreAudioMeta;
    var id = row.dataset.cardId;
    if (id) {
      try {
        var state = JSON.parse(localStorage.getItem("aurore-memory-cards-v1") || "{}");
        var card = (state.cards || []).find(function (item) { return String(item.id) === String(id); });
        if (card && card.audio) return card.audio;
      } catch (_) {}
    }
    return null;
  }
  function mountRow(row) {
    if (!row || row.dataset.audioUiMounted === "true") return;
    row.dataset.audioUiMounted = "true";
    var panel = document.createElement("section");
    panel.className = "aurore-audio-editor";
    panel.innerHTML = '<div class="aurore-audio-heading"><strong>Audio de la carte</strong><span>Facultatif</span></div><p>Ajoutez un enregistrement ou un fichier audio. Il sera conservé hors ligne sur cet appareil.</p><div class="aurore-audio-actions"></div><div class="aurore-audio-status" role="status" aria-live="polite"></div><label class="aurore-audio-language-label">Langue de lecture automatique<select class="aurore-audio-language"><option value="fr-FR">Français</option><option value="en-US">Anglais</option><option value="es-ES">Espagnol</option><option value="de-DE">Allemand</option><option value="pt-BR">Portugais</option><option value="ar">Arabe</option></select></label>';
    var actions = panel.querySelector(".aurore-audio-actions");
    var picker = document.createElement("input");
    picker.type = "file"; picker.accept = "audio/*"; picker.hidden = true; picker.className = "aurore-audio-file";
    var meta = readMeta(row);
    row._auroreAudioMeta = meta ? Object.assign({}, meta) : null;
    var pendingBlob = null;
    var recorder = null, stream = null, chunks = [];
    var choose = makeButton("＋ Importer un audio", "secondary-btn", function () { picker.click(); });
    var record = makeButton("● Enregistrer ma voix", "secondary-btn", async function () {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) throw new Error("L’enregistrement vocal n’est pas pris en charge ici. Importez un fichier audio à la place.");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
        recorder.onerror = function () { setMessage(row, "L’enregistrement a échoué.", true); };
        recorder.onstop = async function () {
          if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
          var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          await acceptBlob(blob, "enregistrement-" + Date.now() + ".webm");
          record.textContent = "● Enregistrer ma voix";
        };
        recorder.start();
        record.textContent = "■ Arrêter l’enregistrement";
        setMessage(row, "Enregistrement en cours… Appuyez de nouveau pour terminer.");
      } catch (error) { setMessage(row, error.message || "Microphone indisponible.", true); }
    });
    async function acceptBlob(blob, name) {
      if (!blob || !blob.size) { setMessage(row, "Le fichier audio est vide.", true); return; }
      if (blob.size > MAX_AUDIO_BYTES) { setMessage(row, "L’audio dépasse 10 Mo. Choisissez un fichier plus léger.", true); return; }
      pendingBlob = blob;
      row._auroreAudioPendingBlob = blob;
      var key = "audio/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) + "." + ((blob.type.split("/")[1] || "audio").split(";")[0].replace(/[^a-z0-9]/gi, "") || "audio");
      row._auroreAudioMeta = { type: "recording", key: key, name: name || "audio", mime: blob.type || "application/octet-stream", language: panel.querySelector(".aurore-audio-language").value, pending: true };
      await cacheBlob(key, blob, name, blob.type).catch(function (error) { setMessage(row, error.message || "Mise en cache hors ligne impossible.", true); });
      setMessage(row, "Audio prêt · " + Math.round(blob.size / 1024) + " Ko. Il sera synchronisé à l’enregistrement si une connexion est disponible.");
      refreshActions();
    }
    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (file) acceptBlob(file, file.name);
    });
    function refreshActions() {
      actions.textContent = "";
      actions.appendChild(choose);
      actions.appendChild(record);
      if (row._auroreAudioMeta && row._auroreAudioMeta.key) {
        actions.appendChild(makeButton("▶ Écouter", "secondary-btn", async function () {
          try {
            var blob = pendingBlob || await getAudioBlob(row._auroreAudioMeta);
            var url = URL.createObjectURL(blob); objectUrls.push(url);
            var audio = new Audio(url); audio.onended = function () { URL.revokeObjectURL(url); }; await audio.play();
            setMessage(row, "Lecture audio.");
          } catch (error) { setMessage(row, error.message || "Lecture impossible.", true); }
        }));
        actions.appendChild(makeButton("Retirer l’audio", "secondary-btn", function () {
          row._auroreAudioMeta = Object.assign({}, row._auroreAudioMeta || {}, { remove: true }); pendingBlob = null; setMessage(row, "L’audio sera retiré de cette carte à l’enregistrement."); refreshActions();
        }));
      }
    }
    panel.appendChild(picker);
    row.appendChild(panel);
    refreshActions();
  }
  var observer = null;
  function mountEditors() {
    if (!form) return;
    form.querySelectorAll("[data-flashcard-row]").forEach(mountRow);
    if (!observer && window.MutationObserver) {
      observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches("[data-flashcard-row]")) mountRow(node);
            if (node.querySelectorAll) node.querySelectorAll("[data-flashcard-row]").forEach(mountRow);
          });
        });
      });
      observer.observe(form, { childList: true, subtree: true });
    }
  }
  if (form) {
    mountEditors();
    var originalMetaForRow = function (row) { if (row._auroreAudioMeta && !row._auroreAudioMeta.remove) { var lang = row.querySelector(".aurore-audio-language"); if (lang) row._auroreAudioMeta.language = lang.value; } return row._auroreAudioMeta || null; };
    window.auroreAudioCardMeta = originalMetaForRow;
    var bypass = false;
    form.addEventListener("submit", function (event) {
      if (bypass) { bypass = false; return; }
      var rows = Array.prototype.slice.call(form.querySelectorAll("[data-flashcard-row]"));
      var uploads = rows.filter(function (row) { return row._auroreAudioMeta && row._auroreAudioMeta.key && row._auroreAudioMeta.pending && row._auroreAudioBlob; });
      // The selected Blob is kept on the row by the wrapped metadata accessor below.
      uploads = rows.filter(function (row) { return row._auroreAudioMeta && row._auroreAudioMeta.key && row._auroreAudioMeta.pending && row._auroreAudioPendingBlob; });
      if (!uploads.length) return;
      event.preventDefault(); event.stopImmediatePropagation();
      var button = document.getElementById("saveFlashcardSeries");
      if (button) button.disabled = true;
      (async function () {
        try {
          for (var i = 0; i < uploads.length; i += 1) {
            var row = uploads[i], meta = row._auroreAudioMeta;
            try {
              await ensureRemote(meta, row._auroreAudioPendingBlob);
              row._auroreAudioMeta = meta;
              setMessage(row, "Audio synchronisé dans votre espace privé.");
            } catch (error) {
              // Offline-first: never block saving the card locally just because cloud upload failed.
              meta.pending = true;
              setMessage(row, error.message || "Audio conservé sur cet appareil ; synchronisation en attente.");
            }
          }
          bypass = true;
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        } finally { if (button) button.disabled = false; }
      })();
    }, true);
  }

  // The review page uses the same card data; attach players without changing review scheduling.
  function mountReviewAudio() {
    var active = document.getElementById("activeFlashcard");
    if (!active) return;
    var oldControls = document.querySelector(".aurore-audio-review"); if (oldControls) oldControls.remove();
    if (active.dataset.audioMounted === "true") return;
    active.dataset.audioMounted = "true";
    var state;
    try { state = JSON.parse(localStorage.getItem("aurore-memory-cards-v1") || "{}"); } catch (_) { state = {}; }
    var params = new URLSearchParams(location.search), deck = params.get("deck") || "";
    var cards = (state.cards || []).filter(function (c) { return c && c.kind === "flashcard" && (!deck || c.deck === deck); });
    var counter = document.querySelector(".flashcard-count");
    var match = counter && counter.textContent.match(/Carte\s+(\d+)/);
    var card = cards[Math.max(0, (match ? Number(match[1]) : 1) - 1)];
    if (!card) return;
    var controls = document.createElement("div");
    controls.className = "aurore-audio-review";
    var lang = card.audio && card.audio.language || "fr-FR";
    if (card.audio && card.audio.key) controls.appendChild(makeButton("▶ Écouter l’audio", "secondary-btn", async function () {
      try { var blob = await getAudioBlob(card.audio); var url = URL.createObjectURL(blob); objectUrls.push(url); var player = new Audio(url); player.onended = function () { URL.revokeObjectURL(url); }; await player.play(); }
      catch (error) { window.auroreToast ? window.auroreToast(error.message) : alert(error.message); }
    }));
    controls.appendChild(makeButton("🔊 Écouter le recto", "secondary-btn", function () { speak(card.front, lang); }));
    controls.appendChild(makeButton("🔊 Écouter le verso", "secondary-btn", function () { speak(card.back, lang); }));
    var stage = document.querySelector(".flashcard-stage");
    if (stage) stage.insertAdjacentElement("afterend", controls);
  }
  if (!form) {
    var reviewObserver = new MutationObserver(function () { mountReviewAudio(); });
    reviewObserver.observe(document.body, { childList: true, subtree: true });
    mountReviewAudio();
  }
  window.addEventListener("pagehide", function () { objectUrls.forEach(function (url) { try { URL.revokeObjectURL(url); } catch (_) {} }); });
  window.addEventListener("online", function () { retryPendingUploads().catch(function () {}); });
  window.addEventListener("aurore:auth-changed", function () { retryPendingUploads().catch(function () {}); });
  async function retryPendingUploads() {
    var state;
    try { state = JSON.parse(localStorage.getItem("aurore-memory-cards-v1") || "{}"); } catch (_) { return; }
    if (!Array.isArray(state.cards)) return;
    var changed = false;
    for (var i = 0; i < state.cards.length; i += 1) {
      var card = state.cards[i], meta = card && card.audio;
      if (!meta || !meta.pending || !meta.key) continue;
      var cached = await getCached(meta.key).catch(function () { return null; });
      if (!cached || !cached.blob) continue;
      try {
        await upload(meta.key, cached.blob);
        meta.pending = false;
        await cacheBlob(meta.key, cached.blob, meta.name, meta.mime);
        changed = true;
      } catch (_) { /* keep local audio and retry on the next connection */ }
    }
    if (changed) {
      try { localStorage.setItem("aurore-memory-cards-v1", JSON.stringify(state)); } catch (_) {}
      window.dispatchEvent(new CustomEvent("aurore:audio-sync-complete"));
    }
  }
  var style = document.createElement("style");
  style.textContent = '.aurore-audio-editor{margin-top:14px;padding:14px;border:1px solid var(--border,rgba(150,140,190,.3));border-radius:16px;background:var(--surface-raised,rgba(24,21,35,.7))}.aurore-audio-heading{display:flex;justify-content:space-between;gap:10px;align-items:center}.aurore-audio-heading span{font-size:12px;color:var(--muted,#aaa)}.aurore-audio-editor p{color:var(--muted,#aaa);font-size:13px;line-height:1.5}.aurore-audio-actions,.aurore-audio-review{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.aurore-audio-status{font-size:12px;line-height:1.45;color:var(--muted,#aaa);margin:8px 0}.aurore-audio-status[data-error="true"]{color:var(--danger,#ff9797)}.aurore-audio-language-label{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted,#aaa)}.aurore-audio-language{background:var(--surface,#12101a);color:var(--text,#eee);border:1px solid var(--border,#2a2438);border-radius:8px;padding:7px}.aurore-audio-review{justify-content:center;padding:0 8px}.aurore-audio-file{display:none}';
  document.head.appendChild(style);
})();