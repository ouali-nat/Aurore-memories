(function () {
  "use strict";
  if (window.__auroreMemoryCloudSyncLoaded) return;
  window.__auroreMemoryCloudSyncLoaded = true;

  var DATA_KEY = "aurore-memory-cards-v1";
  var BASE_ETAG_KEY = "aurore-memory-cloud-etag-v1";
  var CLOUD_KEY = "sauvegarde-memorisations.json";
  var LIMIT = 10 * 1024 * 1024;
  var active = false;
  var busy = false;
  var syncAgain = false;
  var timer = null;
  var conflict = null;
  var lastMessage = "";
  var savedSetItem = Storage.prototype.setItem;

  function readLocal() {
    try {
      var value = localStorage.getItem(DATA_KEY);
      var data = value ? JSON.parse(value) : {};
      return data && typeof data === "object" ? data : {};
    } catch (error) { return {}; }
  }
  function normalizeData(value) {
    if (value && value.data && value.app === "aurore-memory") return value.data;
    return value && typeof value === "object" ? value : {};
  }
  function dataOf(value) {
    var data = normalizeData(value);
    return {
      cards: Array.isArray(data.cards) ? data.cards : [],
      log: data.log && typeof data.log === "object" ? data.log : {},
      performance: Array.isArray(data.performance) ? data.performance : [],
      cardPerformance: Array.isArray(data.cardPerformance) ? data.cardPerformance : [],
      deckSettings: data.deckSettings && typeof data.deckSettings === "object" ? data.deckSettings : {},
      deckStyles: data.deckStyles && typeof data.deckStyles === "object" ? data.deckStyles : {},
      rest: data
    };
  }
  function hasData(value) {
    var d = dataOf(value);
    return d.cards.length > 0 || Object.keys(d.log).length > 0 ||
      d.performance.length > 0 || d.cardPerformance.length > 0 ||
      Object.keys(d.deckSettings).length > 0 || Object.keys(d.deckStyles).length > 0;
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stable(value[key]);
    }).join(",") + "}";
  }
  function sameData(a, b) { return stable(normalizeData(a)) === stable(normalizeData(b)); }
  function envelope(data) {
    return {
      app: "aurore-memory",
      schema: 1,
      updatedAt: new Date().toISOString(),
      data: data
    };
  }
  function byteSize(text) { return new Blob([text]).size; }
  function stamp() { return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8); }

  function mountPanel() {
    if (document.getElementById("auroreMemoryCloudPanel")) return;
    var header = document.querySelector(".topbar");
    if (!header) return;
    var panel = document.createElement("section");
    panel.id = "auroreMemoryCloudPanel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML =
      '<div id="auroreMemoryCloudStatus">Sauvegarde des mémorisations : initialisation…</div>' +
      '<div id="auroreMemoryCloudActions" hidden>' +
      '<button type="button" data-cloud-action="merge">Fusionner les deux sauvegardes</button>' +
      '<button type="button" data-cloud-action="local">Garder cet appareil</button>' +
      '<button type="button" data-cloud-action="remote">Restaurer le cloud</button>' +
      '</div>';
    var style = document.createElement("style");
    style.textContent =
      '#auroreMemoryCloudPanel{box-sizing:border-box;position:relative;z-index:3;width:calc(100% - 28px);max-width:1120px;margin:10px auto 0;padding:10px 13px;border:1px solid var(--border,rgba(150,140,190,.28));border-radius:12px;background:var(--surface,rgba(24,22,36,.94));color:var(--text,#eee);font:500 13px/1.5 system-ui,sans-serif}' +
      '#auroreMemoryCloudActions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}' +
      '#auroreMemoryCloudActions[hidden]{display:none}' +
      '#auroreMemoryCloudActions button{border:1px solid var(--border,rgba(150,140,190,.4));border-radius:8px;padding:7px 10px;background:transparent;color:inherit;font:inherit;cursor:pointer}' +
      '#auroreMemoryCloudActions button:disabled{opacity:.55;cursor:wait}' +
      '#auroreMemoryCloudPanel[data-state="ok"]{border-color:rgba(65,170,120,.55)}' +
      '#auroreMemoryCloudPanel[data-state="warn"]{border-color:rgba(220,165,65,.65)}';
    document.head.appendChild(style);
    header.insertAdjacentElement("afterend", panel);
    panel.querySelectorAll("[data-cloud-action]").forEach(function (button) {
      button.addEventListener("click", function () { resolveConflict(button.dataset.cloudAction); });
    });
  }
  function status(message, kind, actions) {
    mountPanel();
    var panel = document.getElementById("auroreMemoryCloudPanel");
    var text = document.getElementById("auroreMemoryCloudStatus");
    var buttons = document.getElementById("auroreMemoryCloudActions");
    if (text) text.textContent = message;
    if (panel) panel.dataset.state = kind || "info";
    if (buttons) buttons.hidden = !actions;
    lastMessage = message;
  }
  function setButtonsDisabled(disabled) {
    var panel = document.getElementById("auroreMemoryCloudPanel");
    if (panel) panel.querySelectorAll("button").forEach(function (button) { button.disabled = disabled; });
  }
  async function api(path, options) {
    if (!window.auroreAuth) throw new Error("Connexion Aurore ID pas encore initialisée.");
    return window.auroreAuth.api(path, options || {});
  }
  async function listCloud() {
    var response = await api("/api/storage/list", { method: "GET" });
    var json = await response.json();
    return (Array.isArray(json.objects) ? json.objects : []).find(function (item) {
      return item.key === CLOUD_KEY;
    }) || null;
  }
  async function readCloud() {
    var response = await api("/api/storage?key=" + encodeURIComponent(CLOUD_KEY), { method: "GET" });
    var raw = await response.json();
    if (!raw || typeof raw !== "object" || !raw.data || raw.app !== "aurore-memory") {
      throw new Error("La sauvegarde cloud existe, mais son format est inattendu. Aucune donnée n’a été modifiée.");
    }
    return raw;
  }
  async function putObject(key, data, condition) {
    var body = typeof data === "string" ? data : JSON.stringify(data);
    if (byteSize(body) > LIMIT) throw new Error("La sauvegarde dépasse la limite de 10 Mo du Worker.");
    var headers = { "Content-Type": "application/json; charset=utf-8" };
    if (condition && condition.type === "match") headers["If-Match"] = condition.etag;
    else if (condition && condition.type === "none") headers["If-None-Match"] = "*";
    var response = await api("/api/storage?key=" + encodeURIComponent(key), {
      method: "POST", headers: headers, body: body
    });
    return response.json();
  }

  // Vérifie réellement la sauvegarde dans R2 après chaque écriture principale.
  // Un succès HTTP seul ne suffit pas à afficher « sauvegardé ».
  async function writeMainVerified(data, condition) {
    var result = await putObject(CLOUD_KEY, envelope(data), condition);
    var remote = await readCloud();
    if (!sameData(data, remote.data)) {
      throw new Error("La vérification après envoi ne correspond pas aux données locales. Les données locales sont conservées.");
    }
    return result;
  }
  async function archiveSnapshot(data, label) {
    var key = "archives/" + label + "-" + stamp() + ".json";
    await putObject(key, envelope(data), { type: "none" });
    return key;
  }
  function saveBase(etag) {
    if (etag) localStorage.setItem(BASE_ETAG_KEY, String(etag).replace(/^"|"$/g, ""));
  }
  function readBase() {
    try { return String(localStorage.getItem(BASE_ETAG_KEY) || "").replace(/^"|"$/g, ""); }
    catch (error) { return ""; }
  }
  async function freshSession() {
    if (!window.auroreAuth) return null;
    return window.auroreAuth.getSession();
  }
  async function runSync() {
    if (busy) { syncAgain = true; return; }
    var session;
    try { session = await freshSession(); }
    catch (error) { status("Connexion au stockage indisponible. Tes données restent sur cet appareil.", "warn"); return; }
    if (!session || !session.user) {
      active = false;
      conflict = null;
      status("Tes cartes et mémoires sont conservées sur cet appareil. Connecte-toi avec Aurore ID pour les sauvegarder dans R2.", "info");
      return;
    }
    active = true;
    busy = true;
    try {
      var local = readLocal();
      var remoteMeta = await listCloud();
      if (!remoteMeta) {
        if (!hasData(local)) {
          status("Aurore ID est connecté. La sauvegarde cloud sera créée dès que tu ajoutes ou modifies une carte ou une mémoire.", "info");
          return;
        }
        status("Première sauvegarde des cartes et mémoires vers ton espace privé…", "info");
        try {
          var created = await writeMainVerified(local, { type: "none" });
          saveBase(created.etag);
          conflict = null;
          status("Cartes et mémoires sauvegardées dans ton espace privé R2.", "ok");
        } catch (error) {
          if (error.status === 412) {
            await findConflict(local);
          } else throw error;
        }
        return;
      }

      var base = readBase();
      var remote = await readCloud();
      var remoteEtag = String(remoteMeta.etag || "").replace(/^"|"$/g, "");

      // Nouvel appareil / nouveau navigateur : si aucune donnée locale n'existe,
      // restaurer automatiquement la sauvegarde du compte connecté. Ne jamais
      // présenter une bibliothèque vide comme une divergence à résoudre manuellement.
      if (!hasData(local) && hasData(remote.data)) {
        savedSetItem.call(localStorage, DATA_KEY, JSON.stringify(normalizeData(remote.data)));
        saveBase(remoteEtag);
        conflict = null;
        status("Tes cartes, mémorisations et ta progression ont été récupérées depuis ton compte Aurore ID.", "ok");
        window.setTimeout(function () { window.location.reload(); }, 250);
        return;
      }

      if (sameData(local, remote.data)) {
        saveBase(remoteEtag);
        conflict = null;
        status("Cartes et mémoires synchronisées avec R2.", "ok");
        return;
      }

      if (base && remoteEtag && base === remoteEtag) {
        status("Enregistrement des dernières modifications dans R2…", "info");
        try {
          var updated = await writeMainVerified(local, { type: "match", etag: remoteEtag });
          saveBase(updated.etag);
          conflict = null;
          status("Modifications des cartes et mémoires sauvegardées dans R2.", "ok");
        } catch (error) {
          if (error.status === 412) await findConflict(local);
          else throw error;
        }
        return;
      }

      await showConflict(local, remote.data, remoteEtag);
    } catch (error) {
      if (error.status === 401) status("La session a expiré. Reconnecte-toi avec Aurore ID ; les données locales sont intactes.", "warn");
      else status("Sauvegarde cloud non confirmée : " + (error.message || "erreur inconnue") + ". Les données locales restent intactes.", "warn");
    } finally {
      busy = false;
      if (syncAgain) {
        syncAgain = false;
        window.setTimeout(runSync, 350);
      }
    }
  }
  async function findConflict(local) {
    var meta = await listCloud();
    if (!meta) throw new Error("La sauvegarde cloud a changé pendant la synchronisation. Réessaie.");
    var remote = await readCloud();
    await showConflict(local, remote.data, String(meta.etag || "").replace(/^"|"$/g, ""));
  }
  async function showConflict(local, remote, etag) {
    conflict = { local: local, remote: remote, etag: etag };
    status("Une sauvegarde cloud existe et diffère de cet appareil. Choisis une action : aucune version ne sera écrasée sans confirmation.", "warn", true);
  }
  function newCardId() { return Date.now() + Math.random(); }
  function mergeData(localValue, remoteValue) {
    var local = normalizeData(localValue) || {};
    var remote = normalizeData(remoteValue) || {};
    var merged = Object.assign({}, remote, local);
    var localCards = Array.isArray(local.cards) ? local.cards : [];
    var remoteCards = Array.isArray(remote.cards) ? remote.cards : [];
    var cards = localCards.map(function (card) { return Object.assign({}, card); });
    var localById = Object.create(null);
    cards.forEach(function (card) { localById[String(card.id)] = card; });
    var remap = Object.create(null);
    remoteCards.forEach(function (remoteCard) {
      var id = String(remoteCard && remoteCard.id);
      var existing = localById[id];
      if (!existing) {
        var newCopy = Object.assign({}, remoteCard);
        cards.push(newCopy);
        localById[id] = newCopy;
        return;
      }
      if (stable(existing) === stable(remoteCard)) return;
      var sameContent = existing.front === remoteCard.front && existing.back === remoteCard.back &&
        existing.deck === remoteCard.deck && existing.kind === remoteCard.kind;
      if (sameContent) {
        ["reps", "lapses", "interval", "ease", "due"].forEach(function (key) {
          if (typeof remoteCard[key] === "number" && typeof existing[key] === "number") {
            existing[key] = key === "ease" ? Math.max(existing[key], remoteCard[key]) : Math.max(existing[key], remoteCard[key]);
          }
        });
        return;
      }
      var copy = Object.assign({}, remoteCard, { id: newCardId(), syncConflictCopy: true });
      remap[id] = copy.id;
      cards.push(copy);
      localById[String(copy.id)] = copy;
    });
    merged.cards = cards;
    var log = Object.assign({}, remote.log || {});
    Object.keys(local.log || {}).forEach(function (day) {
      log[day] = Math.max(Number(log[day]) || 0, Number((local.log || {})[day]) || 0);
    });
    merged.log = log;
    ["performance", "cardPerformance"].forEach(function (name) {
      var items = [];
      var seen = Object.create(null);
      (Array.isArray(remote[name]) ? remote[name] : []).forEach(function (item) {
        var copy = Object.assign({}, item);
        if (name === "cardPerformance" && remap[String(copy.cardId)]) copy.cardId = String(remap[String(copy.cardId)]);
        var key = stable(copy);
        if (!seen[key]) { seen[key] = true; items.push(copy); }
      });
      (Array.isArray(local[name]) ? local[name] : []).forEach(function (item) {
        var copy = Object.assign({}, item);
        var key = stable(copy);
        if (!seen[key]) { seen[key] = true; items.push(copy); }
      });
      merged[name] = items;
    });
    merged.deckSettings = Object.assign({}, remote.deckSettings || {}, local.deckSettings || {});
    merged.deckStyles = Object.assign({}, remote.deckStyles || {}, local.deckStyles || {});
    return merged;
  }
  async function resolveConflict(action) {
    if (!conflict || busy) return;
    busy = true;
    setButtonsDisabled(true);
    var selected = conflict;
    try {
      if (action === "merge") {
        await archiveSnapshot(selected.local, "avant-fusion-locale");
        await archiveSnapshot(selected.remote, "avant-fusion-cloud");
        var merged = mergeData(selected.local, selected.remote);
        var result = await writeMainVerified(merged, { type: "match", etag: selected.etag });
        savedSetItem.call(localStorage, DATA_KEY, JSON.stringify(merged));
        saveBase(result.etag);
        conflict = null;
        status("Fusion terminée : les cartes, mémoires et historiques des deux sauvegardes ont été conservés. La version locale précédente est archivée dans R2.", "ok");
      } else if (action === "local") {
        if (!window.confirm("Conserver les données de cet appareil dans la sauvegarde principale ? La version cloud actuelle sera d’abord archivée dans R2.")) return;
        await archiveSnapshot(selected.remote, "avant-remplacement-cloud");
        var resultLocal = await writeMainVerified(selected.local, { type: "match", etag: selected.etag });
        saveBase(resultLocal.etag);
        conflict = null;
        status("Sauvegarde de cet appareil devenue la version principale. L’ancienne version cloud est conservée dans les archives R2.", "ok");
      } else if (action === "remote") {
        if (!window.confirm("Restaurer la sauvegarde cloud sur cet appareil ? Les données locales seront archivées dans R2 avant remplacement.")) return;
        await archiveSnapshot(selected.local, "avant-restauration-locale");
        savedSetItem.call(localStorage, DATA_KEY, JSON.stringify(normalizeData(selected.remote)));
        saveBase(selected.etag);
        conflict = null;
        status("Sauvegarde cloud restaurée. La page va se recharger pour afficher les mémorisations récupérées.", "ok");
        window.setTimeout(function () { window.location.reload(); }, 700);
      }
    } catch (error) {
      if (error.status === 412) {
        conflict = null;
        status("La sauvegarde cloud a changé pendant cette opération. Actualise la page pour comparer à nouveau ; aucune écriture concurrente n’a été acceptée.", "warn");
      } else status("Opération inachevée : " + (error.message || "erreur inconnue") + ". Les données locales n’ont pas été supprimées.", "warn", true);
    } finally {
      busy = false;
      setButtonsDisabled(false);
    }
  }
  function queueSave() {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      timer = null;
      if (!active) {
        freshSession().then(function (session) {
          if (session && session.user) runSync();
          else status("Modifications conservées sur cet appareil. Connecte-toi avec Aurore ID pour la sauvegarde cloud.", "info");
        }).catch(function () {});
        return;
      }
      if (!conflict) runSync();
    }, 1600);
  }

  try {
    Storage.prototype.setItem = function (key, value) {
      var result = savedSetItem.call(this, key, value);
      if (this === localStorage && key === DATA_KEY) queueSave();
      return result;
    };
  } catch (error) {
    console.warn("Aurore Mémoire : suivi automatique des sauvegardes locales indisponible.", error);
  }

  window.auroreMemoryCloudSync = {
    syncNow: runSync,
    getStatus: function () { return lastMessage; }
  };
  mountPanel();
  window.addEventListener("aurore:auth-changed", function (event) {
    if (event.detail && event.detail.session && event.detail.session.user) runSync();
    else {
      active = false;
      status("Déconnecté : cartes et mémoires restent sur cet appareil ; rien n’a été supprimé du cloud.", "info");
    }
  });
  window.addEventListener("storage", function (event) {
    if (event.key === DATA_KEY) queueSave();
  });
  freshSession().then(function (session) {
    if (session && session.user) runSync();
    else status("Connecte-toi avec Aurore ID pour sauvegarder automatiquement cartes, mémoires et progression dans R2.", "info");
  }).catch(function () {
    status("La connexion Aurore ID sera vérifiée à l’ouverture de session. Tes données locales restent intactes.", "warn");
  });
})();
