(function () {
"use strict";
if (window.__auroreCloudflareVoiceTestLoaded) return;
window.__auroreCloudflareVoiceTestLoaded = true;

const DB = "aurore-audio-library-v1", STORE = "blobs", MANIFEST = "aurore-audio-manifest-v1";
const MAX_MS = 6 * 60 * 1000, MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_WORKER_URL = "https://aurore-memories.oualikevin6.workers.dev";
const $ = id => document.getElementById(id);
let healthReady = false;

function uid() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() :
    "cf-voice-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(Error("Le stockage hors ligne n’est pas disponible sur cet appareil."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, {keyPath:"id"});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error("Ouverture du stockage audio impossible."));
  });
}
async function cacheBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({id, blob, savedAt:Date.now()});
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => {
      db.close(); reject(tx.error || Error("Impossible de conserver l’audio."));
    };
  });
}
function readManifest() {
  try {
    const m = JSON.parse(localStorage.getItem(MANIFEST) || "{}");
    return {records:Array.isArray(m.records)?m.records:[], sequences:Array.isArray(m.sequences)?m.sequences:[]};
  } catch (_) { return {records:[],sequences:[]}; }
}
function workerUrl() {
  return window.auroreAuth && window.auroreAuth.workerUrl || DEFAULT_WORKER_URL;
}
async function authApi(path, options) {
  // auth.js expose une promesse dès son chargement. Attendre celle-ci même si
  // le client Supabase n'a pas encore fini de s'initialiser.
  if (window.auroreAuthReady && typeof window.auroreAuthReady.then === "function") {
    try { await window.auroreAuthReady; } catch (error) {
      throw Error("Initialisation Aurore ID impossible : " + (error && error.message ? error.message : "vérifie la connexion puis actualise la page."));
    }
  }
  if (!window.auroreAuth && typeof window.auroreAuthReady !== "undefined") {
    throw Error("Aurore ID n’a pas pu initialiser la session. Actualise la page ; si le problème persiste, reconnecte-toi à Aurore ID.");
  }
  if (!window.auroreAuth || typeof window.auroreAuth.api !== "function") {
    throw Error("Le module Aurore ID n’est pas chargé sur cette page. Actualise la page pour charger la version corrigée.");
  }
  return window.auroreAuth.api(path, options || {});
}
function setStatus(message, error) {
  const el = $("audioCloudflareStatus");
  if (!el) return;
  el.textContent = message;
  el.dataset.error = error ? "true" : "false";
}
async function checkHealth() {
  const button = $("audioCloudflareGenerate");
  if (button) button.disabled = true;
  healthReady = false;
  setStatus("Vérification du service Cloudflare…");
  try {
    const response = await fetch(new URL("/health", workerUrl()).toString(), {cache:"no-store"});
    if (!response.ok) throw Error("Le Worker Cloudflare répond avec le statut " + response.status + ".");
    const health = await response.json();
    if (!health || health.ok !== true) throw Error("La réponse du Worker Cloudflare est inattendue.");
    if (health.authConfigured !== true) throw Error("Le Worker répond, mais sa configuration d’authentification Supabase est incomplète.");
    if (health.aiConfigured !== true) throw Error("Le Worker répond, mais la version Cloudflare AI nécessaire à la voix HD n’est pas encore déployée.");
    healthReady = true;
    if (button) button.disabled = false;
    setStatus("Service Cloudflare opérationnel. Connecte-toi avec Aurore ID pour générer une piste de test.");
  } catch (error) {
    setStatus(error.message || "Le service Cloudflare est inaccessible.", true);
  }
}
function cloudflareDialog() {
  let dialog = $("audioCloudflareDialog");
  if (dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    checkHealth();
    return;
  }
  dialog = document.createElement("dialog");
  dialog.id = "audioCloudflareDialog";
  dialog.className = "cloudflare-test-dialog form-panel";
  dialog.setAttribute("aria-labelledby", "audioCloudflareTitle");
  dialog.innerHTML =
    '<div class="cloudflare-dialog-head"><div><p class="section-kicker">LABORATOIRE VOCAL</p><h2 id="audioCloudflareTitle">Expérimenter la voix Cloudflare</h2></div><button type="button" class="secondary-btn cloudflare-close" aria-label="Fermer la fenêtre">✕</button></div>' +
    '<p class="cloudflare-intro">Teste une voix neuronale générée dans le cloud, sans modifier la voix déjà intégrée à ton téléphone.</p>' +
    '<label class="field-label" for="audioCloudflareName">Nom de la piste</label><input class="text-field" id="audioCloudflareName" maxlength="100" value="Essai voix Cloudflare" placeholder="Ex. : Révision de biologie">' +
    '<label class="field-label" for="audioCloudflareText">Texte d’essai</label><textarea class="text-area" id="audioCloudflareText" rows="5" maxlength="5000">Bonjour et bienvenue dans Aurore Mémoire. Apprendre, répéter et mémoriser devient plus simple avec une voix claire et naturelle.</textarea>' +
    '<div class="cloudflare-options"><div><label class="field-label" for="audioCloudflareLanguage">Langue de la voix</label><select class="text-field" id="audioCloudflareLanguage"><option value="fr">Français</option><option value="en">Anglais</option><option value="es">Espagnol</option><option value="zh">Chinois</option><option value="jp">Japonais</option><option value="kr">Coréen</option></select></div>' +
    '<div><label class="field-label" for="audioCloudflareRate">Vitesse de lecture <span id="audioCloudflareRateLabel">1×</span></label><input id="audioCloudflareRate" type="range" min="0.7" max="1.3" step="0.1" value="1"></div></div>' +
    '<div class="cloudflare-actions"><button type="button" class="primary-btn" id="audioCloudflareGenerate" disabled>▶ Générer et écouter</button><button type="button" class="secondary-btn" id="audioCloudflareRetry">↻ Vérifier le service</button><button type="button" class="secondary-btn" id="audioCloudflareStop" disabled>■ Arrêter</button></div>' +
    '<audio id="audioCloudflarePlayer" controls hidden></audio><p id="audioCloudflareStatus" class="audio-status" role="status" aria-live="polite">Prêt à tester la voix Cloudflare.</p>' +
    '<div class="cloudflare-dialog-foot"><span class="form-help">L’essai reste privé. Il n’est pas ajouté automatiquement à ta bibliothèque.</span><button type="button" class="secondary-btn" id="audioCloudflareSave" disabled>＋ Ajouter à ma bibliothèque</button></div>';
  document.body.appendChild(dialog);

  const player = $("audioCloudflarePlayer");
  const generateButton = $("audioCloudflareGenerate");
  const saveButton = $("audioCloudflareSave");
  $("audioCloudflareRetry").addEventListener("click", checkHealth);
  dialog.querySelector(".cloudflare-close").addEventListener("click", () => { player.pause(); dialog.close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) { player.pause(); dialog.close(); } });
  $("audioCloudflareRate").addEventListener("input", () => {
    $("audioCloudflareRateLabel").textContent = Number($("audioCloudflareRate").value).toFixed(1).replace(".0","") + "×";
    if (player) player.playbackRate = Number($("audioCloudflareRate").value);
  });
  $("audioCloudflareStop").addEventListener("click", () => { player.pause(); $("audioCloudflareStop").disabled = true; });

  generateButton.addEventListener("click", async () => {
    const prompt = $("audioCloudflareText").value.trim();
    const rate = Number($("audioCloudflareRate").value) || 1;
    const words = prompt.split(/\s+/).filter(Boolean).length;
    if (!prompt) return setStatus("Écris un texte avant de lancer le test.", true);
    if (prompt.length > 5000) return setStatus("Le texte ne doit pas dépasser 5 000 caractères.", true);
    if (Math.ceil(words / 2.5 / rate) * 1000 > MAX_MS) {
      return setStatus("Le texte dépasse environ six minutes à cette vitesse. Raccourcis-le pour tester.", true);
    }
    if (!healthReady) {
      await checkHealth();
      if (!healthReady) return;
    }
    generateButton.disabled = true;
    saveButton.disabled = true;
    setStatus("Cloudflare génère la voix…");
    try {
      if (!navigator.onLine) throw Error("Une connexion Internet est nécessaire pour générer une voix Cloudflare.");
      const response = await authApi("/api/tts", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text:prompt, language:$("audioCloudflareLanguage").value})
      });
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_BYTES) throw Error("Le fichier audio est vide ou dépasse 10 Mo.");
      if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
      const objectUrl = URL.createObjectURL(blob);
      player.dataset.objectUrl = objectUrl;
      player.src = objectUrl;
      player.hidden = false;
      player.playbackRate = rate;
      saveButton.disabled = false;
      setStatus("Voix Cloudflare générée. Écoute le résultat, puis ajoute-le à ta bibliothèque si tu le souhaites.");
      try { await player.play(); $("audioCloudflareStop").disabled = false; } catch (_) {}
    } catch (error) {
      setStatus(error.message || "Impossible de générer la voix Cloudflare.", true);
    } finally {
      generateButton.disabled = false;
    }
  });

  saveButton.addEventListener("click", async () => {
    if (!player.dataset.objectUrl || saveButton.disabled) return;
    saveButton.disabled = true;
    setStatus("Enregistrement de la piste…");
    try {
      const blob = await (await fetch(player.dataset.objectUrl)).blob();
      if (!blob.size || blob.size > MAX_BYTES) throw Error("Le fichier audio est vide ou dépasse 10 Mo.");
      const id = uid(), name = ($("audioCloudflareName").value.trim() || "Essai voix Cloudflare").slice(0,100);
      const record = {
        id, kind:"recording", name, key:"audios/" + id + ".mp3", mime:"audio/mpeg",
        size:blob.size, durationMs:Number.isFinite(player.duration) ? Math.round(player.duration * 1000) : null,
        createdAt:new Date().toISOString(), public:false, repeat:1, synced:false, neural:true, cloudflare:true
      };
      await cacheBlob(id, blob);
      const manifest = readManifest();
      manifest.records = manifest.records.filter(item => item && item.id !== id);
      manifest.records.unshift(record);
      localStorage.setItem(MANIFEST, JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()}));
      let cloudMessage = "Audio enregistré sur cet appareil, disponible hors ligne.";
      try {
        await authApi("/api/storage?key=" + encodeURIComponent(record.key), {method:"POST",headers:{"Content-Type":"audio/mpeg"},body:blob});
        record.synced = true;
        localStorage.setItem(MANIFEST, JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()}));
        await authApi("/api/storage?key=" + encodeURIComponent("audios/manifest.json"), {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()})
        });
        cloudMessage = "Audio enregistré et synchronisé dans ton espace privé.";
      } catch (error) {
        cloudMessage += " Synchronisation cloud à vérifier : " + error.message;
      }
      window.dispatchEvent(new CustomEvent("aurore-neural-audio-created", {detail:{record}}));
      setStatus(cloudMessage);
    } catch (error) {
      setStatus(error.message || "Impossible d’enregistrer cette piste.", true);
      saveButton.disabled = false;
    }
  });

  dialog.addEventListener("close", () => {
    if (!player) return;
    player.pause();
    if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
    delete player.dataset.objectUrl;
    player.removeAttribute("src");
    player.hidden = true;
  });
  dialog.showModal();
  checkHealth();
}
function addControls() {
  const save = $("audioTextSave");
  const panel = save && save.closest(".form-panel");
  if (!panel || $("audioNeuralGenerate")) return;
  const row = document.createElement("div");
  row.className = "audio-button-row cloudflare-entry";
  row.style.marginTop = "9px";
  const button = document.createElement("button");
  button.type = "button"; button.id = "audioNeuralGenerate"; button.className = "secondary-btn";
  button.textContent = "✦ Expérimenter la voix Cloudflare";
  button.addEventListener("click", cloudflareDialog);
  row.appendChild(button);
  const help = document.createElement("p");
  help.className = "form-help";
  help.textContent = "Teste la génération cloud séparément ; l’aperçu vocal du téléphone reste disponible ci-dessus.";
  const status = $("audioTextStatus");
  if (status) { panel.insertBefore(row, status); panel.insertBefore(help, status); }
  else panel.append(row, help);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addControls, {once:true});
else addControls();
})();