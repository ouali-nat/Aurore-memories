(function () {
  "use strict";
  if (window.__auroreMemoryCloudSyncInitialized) return;
  window.__auroreMemoryCloudSyncInitialized = true;

  var LOCAL_KEY = "aurore-memory-cards-v1";
  var CLOUD_KEY = "sauvegarde-automatique/memoires-et-cartes.json";
  var timer = null;
  var phase = "checking";
  var latestState = null;
  var busy = false;
  var queued = false;
  var statusNode, signInButton, mergeButton;

  function readLocal() {
    try {
      var value = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      return value && typeof value === "object" ? value : { cards: [], log: {}, performance: [], cardPerformance: [] };
    } catch (error) {
      return { cards: [], log: {}, performance: [], cardPerformance: [] };
    }
  }
  function show(message, error) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.style.color = error ? "var(--danger, #b42318)" : "";
  }
  function mountPanel() {
    if (document.getElementById("auroreMemoryCloudPanel")) return;
    var panel = document.createElement("section");
    panel.id = "auroreMemoryCloudPanel";
    panel.setAttribute("aria-label", "Sauvegarde privée des cartes et mémoires");
    panel.style.cssText = "margin:16px auto;padding:14px 16px;max-width:1100px;border:1px solid var(--border,rgba(150,150,170,.3));border-radius:16px;background:var(--surface,rgba(120,120,140,.07));display:flex;flex-wrap:wrap;align-items:center;gap:10px;";
    var copy = document.createElement("div");
    copy.style.cssText = "flex:1 1 240px;min-width:0;";
    var title = document.createElement("strong");
    title.textContent = "Sauvegarde privée · Cartes et mémoires";
    title.style.display = "block";
    var description = document.createElement("p");
    description.textContent = "Les contenus restent enregistrés sur cet appareil et sont sauvegardés dans votre espace privé après connexion.";
    description.style.cssText = "margin:4px 0 0;font-size:.9em;opacity:.8;";
    statusNode = document.createElement("p");
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.style.cssText = "margin:6px 0 0;font-size:.9em;";
    statusNode.textContent = "Vérification de la sauvegarde cloud…";
    copy.appendChild(title); copy.appendChild(description); copy.appendChild(statusNode);
    signInButton = document.createElement("button");
    signInButton.type = "button";
    signInButton.textContent = "Se connecter avec Aurore ID";
    signInButton.style.cssText = "padding:9px 12px;border-radius:10px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;";
    signInButton.addEventListener("click", async function () {
      signInButton.disabled = true;
      try { await window.auroreAuth.signIn("fichiers.html"); }
      catch (error) { show("Connexion non disponible : " + (error.message || "vérifiez la configuration Aurore ID."), true); signInButton.disabled = false; }
    });
    mergeButton = document.createElement("button");
    mergeButton.type = "button";
    mergeButton.textContent = "Fusionner sans perdre de données";
    mergeButton.hidden = true;
    mergeButton.style.cssText = "padding:9px 12px;border-radius:10px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;";
    mergeButton.addEventListener("click", mergeCloudAndLocal);
    panel.appendChild(copy); panel.appendChild(signInButton); panel.appendChild(mergeButton);
    var main = document.querySelector("main.main-content") || document.querySelector("main") || document.querySelector(".main-content");
    if (main) main.insertBefore(panel, main.firstChild);
    else if (document.body) document.body.insertBefore(panel, document.body.firstChild);
  }
  function unpack(raw) {
    if (!raw || typeof raw !== "object") throw new Error("La sauvegarde cloud n’a pas un format reconnu.");
    if (raw.schema === "aurore-memory-backup-v1" && raw.payload && typeof raw.payload === "object") return raw.payload;
    if (Array.isArray(raw.cards)) return raw;
    throw new Error("Le fichier cloud existe mais son format est inconnu. Il n’a pas été modifié.");
  }
  function envelope(state) {
    return JSON.stringify({ schema: "aurore-memory-backup-v1", savedAt: new Date().toISOString(), payload: state });
  }
  async function api(path, options) {
    if (!window.auroreAuth) throw new Error("Le module Aurore ID n’est pas chargé.");
    return window.auroreAuth.api(path, options || {});
  }
  async function readCloud() {
    try {
      var response = await api("/api/storage?key=" + encodeURIComponent(CLOUD_KEY), { method: "GET" });
      return { exists: true, payload: unpack(await response.json()) };
    } catch (error) {
      if (error && error.status === 404) return { exists: false, payload: null };
      throw error;
    }
  }
  async function writeCloud(state) {
    var body = envelope(state);
    if (new Blob([body]).size > 10 * 1024 * 1024) throw new Error("La sauvegarde dépasse la limite de 10 Mo. Les données locales sont conservées.");
    await api("/api/storage?key=" + encodeURIComponent(CLOUD_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: body
    });
  }
  function mergeArrays(localItems, cloudItems, keyFn) {
    var result = [], positions = Object.create(null);
    (Array.isArray(cloudItems) ? cloudItems : []).concat(Array.isArray(localItems) ? localItems : []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      var key = keyFn(item);
      if (positions[key] !== undefined) result[positions[key]] = item;
      else { positions[key] = result.length; result.push(item); }
    });
    return result;
  }
  function mergeStates(localState, cloudState) {
    var merged = Object.assign({}, cloudState, localState);
    merged.cards = mergeArrays(localState.cards, cloudState.cards, function (item) { return String(item.id == null ? JSON.stringify(item) : item.id); });
    merged.performance = mergeArrays(localState.performance, cloudState.performance, function (item) { return String(item.day || "") + "|" + String(item.timestamp || "") + "|" + String(item.total || "") + "|" + String(item.remembered || ""); });
    merged.cardPerformance = mergeArrays(localState.cardPerformance, cloudState.cardPerformance, function (item) { return String(item.timestamp || "") + "|" + String(item.cardId || "") + "|" + String(item.grade || ""); });
    merged.log = Object.assign({}, cloudState.log || {}, localState.log || {});
    Object.keys(cloudState.log || {}).forEach(function (day) {
      merged.log[day] = Math.max(Number((cloudState.log || {})[day]) || 0, Number((localState.log || {})[day]) || 0);
    });
    merged.deckSettings = Object.assign({}, cloudState.deckSettings || {}, localState.deckSettings || {});
    return merged;
  }
  async function initialize() {
    if (!window.auroreAuth) { show("Connexion cloud indisponible. Les données locales restent intactes.", true); return; }
    var session = await window.auroreAuth.getSession();
    signInButton.hidden = !!(session && session.user);
    if (!session || !session.user) {
      phase = "signed-out";
      show("Non connecté : cartes et mémoires conservées sur cet appareil. Connectez-vous pour activer la sauvegarde privée.");
      return;
    }
    latestState = readLocal();
    show("Recherche de la sauvegarde privée…");
    var remote = await readCloud();
    if (!remote.exists) {
      await writeCloud(latestState);
      phase = "ready";
      show("Sauvegarde cloud créée. " + (latestState.cards || []).length + " éléments (cartes et morceaux de mémoire) sauvegardés.");
      return;
    }
    var localCards = Array.isArray(latestState.cards) ? latestState.cards.length : 0;
    var remoteCards = Array.isArray(remote.payload.cards) ? remote.payload.cards.length : 0;
    var localText = JSON.stringify(latestState);
    var remoteText = JSON.stringify(remote.payload);
    if (localText === remoteText) {
      phase = "ready";
      show("Synchronisé : cartes, mémoires et progression sont sauvegardées dans votre espace privé.");
    } else {
      phase = "conflict";
      mergeButton.hidden = false;
      show("Une sauvegarde cloud existe déjà (" + remoteCards + " éléments), et cet appareil contient " + localCards + ". Rien n’a été écrasé. Utilisez « Fusionner sans perdre de données » pour réunir les deux versions.");
    }
  }
  async function mergeCloudAndLocal() {
    if (busy) return;
    busy = true;
    mergeButton.disabled = true;
    try {
      show("Fusion sécurisée des cartes, mémoires et historiques…");
      var remote = await readCloud();
      if (!remote.exists) {
        await writeCloud(readLocal());
      } else {
        var merged = mergeStates(readLocal(), remote.payload);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
        await writeCloud(merged);
      }
      phase = "ready";
      mergeButton.hidden = true;
      show("Fusion terminée. Les éléments des deux versions sont réunis. Rechargement de l’application…");
      window.setTimeout(function () { window.location.reload(); }, 900);
    } catch (error) {
      show("Fusion interrompue sans supprimer les données locales : " + (error.message || "erreur inconnue"), true);
    } finally {
      busy = false;
      mergeButton.disabled = false;
    }
  }
  function schedule(state) {
    latestState = state;
    if (phase === "checking") { queued = true; return; }
    if (phase !== "ready") return;
    if (busy) { queued = true; return; }
    window.clearTimeout(timer);
    timer = window.setTimeout(async function () {
      if (busy) { queued = true; return; }
      if (phase !== "ready") return;
      busy = true;
      try {
        await writeCloud(latestState || readLocal());
        show("Sauvegarde cloud mise à jour à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ".");
      } catch (error) {
        phase = "conflict";
        mergeButton.hidden = false;
        show("Sauvegarde locale conservée, mais envoi cloud impossible : " + (error.message || "erreur inconnue") + ". Réessayez après vérification de la connexion.", true);
      } finally {
        busy = false;
        if (queued) { queued = false; schedule(latestState); }
      }
    }, 1400);
  }
  window.auroreMemoryCloudSync = { schedule: schedule, refresh: initialize };
  mountPanel();
  if (window.auroreAuth) {
    window.addEventListener("aurore:auth-changed", function () { initialize().catch(function (error) { show("Cloud non disponible : " + error.message, true); }); });
    initialize().catch(function (error) { show("Cloud non disponible : " + (error.message || "erreur inconnue"), true); });
  } else {
    show("Le module Aurore ID n’est pas disponible. Les données locales restent intactes.", true);
  }
})();