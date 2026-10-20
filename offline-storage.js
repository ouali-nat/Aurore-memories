(function () {
  "use strict";
  if (window.__auroreOfflineStorageLoaded) return;
  window.__auroreOfflineStorageLoaded = true;

  var DATA_KEY = "aurore-memory-cards-v1";
  var DB_NAME = "aurore-memoire-offline";
  var DB_VERSION = 1;
  var STORE = "snapshots";
  var SNAPSHOT_ID = "personal-library";
  var originalSetItem = Storage.prototype.setItem;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("Le stockage local avancé n’est pas disponible sur cet appareil.")); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Ouverture du stockage local impossible.")); };
    });
    return dbPromise;
  }
  function readLocal() {
    try {
      var raw = localStorage.getItem(DATA_KEY);
      var data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? data : null;
    } catch (error) { return null; }
  }
  function hasData(data) {
    return !!(data && (
      (Array.isArray(data.cards) && data.cards.length) ||
      (data.log && Object.keys(data.log).length) ||
      (Array.isArray(data.performance) && data.performance.length) ||
      (Array.isArray(data.cardPerformance) && data.cardPerformance.length)
    ));
  }
  function counts(data) {
    var cards = Array.isArray(data && data.cards) ? data.cards : [];
    var memories = 0, flashcards = 0;
    cards.forEach(function (item) {
      if (item && (item.kind === "memory" || item.kind !== "flashcard" && /(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(item.front || "")))) memories++;
      else flashcards++;
    });
    return { memories: memories, cards: flashcards, total: cards.length };
  }
  function writeSnapshot(data) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ id: SNAPSHOT_ID, savedAt: new Date().toISOString(), data: data });
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error("Écriture du stockage local impossible.")); };
        tx.onabort = function () { reject(tx.error || new Error("Écriture locale interrompue.")); };
      });
    });
  }
  function readSnapshot() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var request = tx.objectStore(STORE).get(SNAPSHOT_ID);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error || new Error("Lecture du stockage local impossible.")); };
      });
    });
  }
  function status(message, error) {
    var node = document.getElementById("auroreOfflineStorageStatus");
    if (node) { node.textContent = message; node.dataset.state = error ? "warn" : "ok"; }
  }
  function refreshCounts(data) {
    var node = document.getElementById("auroreOfflineStorageCounts");
    if (!node) return;
    var c = counts(data || {});
    node.textContent = c.cards + " série(s) de cartes · " + c.memories + " mémorisation(s) · stockage local privé";
  }
  function mountPanel() {
    var library = document.getElementById("memoryLibrary");
    if (!library || document.getElementById("auroreOfflineStoragePanel")) return;
    var panel = document.createElement("section");
    panel.id = "auroreOfflineStoragePanel";
    panel.setAttribute("aria-label", "Stockage hors ligne sur cet appareil");
    panel.innerHTML =
      '<div class="aurore-offline-head"><span aria-hidden="true">▣</span><div><strong>Stockage sur cet appareil</strong><p id="auroreOfflineStorageCounts">Vérification du stockage local…</p></div></div>' +
      '<p class="aurore-offline-description">Tes cartes, mémorisations et ta progression sont conservées dans le stockage privé de cette application. La copie locale reste disponible sans Internet ; la synchronisation entre appareils nécessite une connexion.</p>' +
      '<div class="aurore-offline-actions"><button type="button" id="auroreOfflineSave">Préparer pour le mode hors ligne</button><button type="button" id="auroreOfflineExport">Télécharger une sauvegarde</button></div>' +
      '<p id="auroreOfflineStorageStatus" role="status" aria-live="polite">Initialisation du stockage local…</p>';
    var style = document.createElement("style");
    style.textContent =
      '#auroreOfflineStoragePanel{margin:0 0 16px;padding:16px;border:1px solid var(--border,rgba(140,130,180,.3));border-radius:16px;background:var(--surface,rgba(25,23,38,.72));color:var(--text,inherit)}' +
      '#auroreOfflineStoragePanel .aurore-offline-head{display:flex;align-items:center;gap:11px}' +
      '#auroreOfflineStoragePanel .aurore-offline-head>span{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--surface-strong,rgba(130,110,200,.15));font-size:22px}' +
      '#auroreOfflineStoragePanel strong{font-size:1rem}#auroreOfflineStoragePanel p{margin:6px 0 0;font-size:.88rem;line-height:1.5;opacity:.86}' +
      '#auroreOfflineStoragePanel .aurore-offline-description{margin-top:12px}' +
      '#auroreOfflineStoragePanel .aurore-offline-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
      '#auroreOfflineStoragePanel button{border:1px solid var(--border,rgba(140,130,180,.35));border-radius:10px;padding:10px 12px;background:var(--surface-strong,rgba(130,110,200,.12));color:inherit;font:inherit;cursor:pointer}' +
      '#auroreOfflineStoragePanel button:disabled{opacity:.55;cursor:wait}' +
      '#auroreOfflineStorageStatus[data-state="warn"]{color:#d69b42}';
    document.head.appendChild(style);
    library.parentNode.insertBefore(panel, library);
    panel.querySelector("#auroreOfflineSave").addEventListener("click", function () {
      var button = this; button.disabled = true;
      var data = readLocal() || {};
      writeSnapshot(data).then(function () {
        refreshCounts(data);
        status("Copie locale enregistrée. Tu peux rouvrir tes cartes et mémorisations sans connexion dans cette application.", false);
      }).catch(function (error) { status(error.message || "Impossible d’enregistrer la copie locale.", true); })
        .finally(function () { button.disabled = false; });
    });
    panel.querySelector("#auroreOfflineExport").addEventListener("click", function () {
      var data = readLocal() || {};
      var blob = new Blob([JSON.stringify({ app: "aurore-memoire-offline-backup", version: 1, exportedAt: new Date().toISOString(), data: data }, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "aurore-memoire-sauvegarde.json";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      status("Sauvegarde téléchargée. Conserve ce fichier pour pouvoir récupérer tes données.", false);
    });
    refreshCounts(readLocal() || {});
  }
  try {
    Storage.prototype.setItem = function (key, value) {
      var result = originalSetItem.call(this, key, value);
      if (this === localStorage && key === DATA_KEY) {
        try { var parsed = JSON.parse(value); writeSnapshot(parsed).catch(function () {}); } catch (error) {}
        refreshCounts(readLocal() || {});
      }
      return result;
    };
  } catch (error) {}

  function initialize() {
    mountPanel();
    var local = readLocal();
    if (hasData(local)) {
      writeSnapshot(local).then(function () { status("Stockage local prêt. Les données sont conservées sur cet appareil.", false); })
        .catch(function (error) { status(error.message || "Stockage local indisponible.", true); });
      refreshCounts(local);
      return;
    }
    readSnapshot().then(function (snapshot) {
      if (snapshot && hasData(snapshot.data)) {
        // Only recover a local snapshot when this installation has no useful local data.
        var current = readLocal();
        if (!hasData(current)) {
          originalSetItem.call(localStorage, DATA_KEY, JSON.stringify(snapshot.data));
          refreshCounts(snapshot.data);
          status("Copie locale récupérée. Réouverture de la bibliothèque…", false);
          window.setTimeout(function () { window.location.reload(); }, 250);
          return;
        }
      }
      status("Stockage local prêt. Les cartes créées ici seront conservées sur cet appareil.", false);
    }).catch(function (error) { status(error.message || "Stockage local indisponible.", true); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();