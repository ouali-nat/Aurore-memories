(function () {
"use strict";
if (typeof window.__auroreCloudflareVoiceCleanup === "function") {
  try { window.__auroreCloudflareVoiceCleanup(); } catch (_) {}
}
if (!document.getElementById("audioTextSave")) {
  window.__auroreCloudflareVoiceCleanup = null;
  return;
}
const controlsCleanup = [];
window.__auroreCloudflareVoiceCleanup = function () {
  controlsCleanup.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
  const dialog = document.getElementById("audioCloudflareDialog");
  if (dialog) { try { if (dialog.open) dialog.close(); } catch (_) {} dialog.remove(); }
};

const DB = "aurore-audio-library-v1", STORE = "blobs", MANIFEST = "aurore-audio-manifest-v1";
const MAX_MS = 6 * 60 * 1000, MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_WORKER_URL = "https://aurore-memories.oualikevin6.workers.dev";
const $ = id => document.getElementById(id);
let healthReady = false;
let quotaSnapshot = null;
let quotaRequiresLogin = false;
let generationInProgress = false;

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
function quotaTime(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(value / 60), rest = value % 60;
  if (minutes && rest) return minutes + " min " + rest + " s";
  if (minutes) return minutes + " min";
  return rest + " s";
}
function updateQuotaView(data, message, requiresLogin) {
  quotaSnapshot = data && data.ok ? data : null;
  quotaRequiresLogin = !!requiresLogin;
  const views = [
    { text: $("audioVoiceQuotaText"), bar: $("audioVoiceQuotaBar") },
    { text: $("audioCloudflareQuotaText"), bar: $("audioCloudflareQuotaBar") }
  ];
  views.forEach(view => {
    if (view.text) {
      if (quotaSnapshot) {
        if (quotaSnapshot.remainingSeconds <= 0) view.text.textContent = "Quota atteint · renouvellement à minuit";
        else if (quotaSnapshot.inProgress) view.text.textContent = quotaTime(quotaSnapshot.remainingSeconds) + " disponibles · génération en cours";
        else view.text.textContent = quotaTime(quotaSnapshot.remainingSeconds) + " disponibles · " + quotaTime(quotaSnapshot.usedSeconds) + " utilisés";
      } else {
        view.text.textContent = message || (quotaRequiresLogin ? "Connexion requise pour afficher le compteur." : "Compteur temporairement indisponible.");
      }
    }
    if (view.bar) {
      const used = quotaSnapshot ? Math.min(180, Math.max(0, quotaSnapshot.usedSeconds)) : 0;
      view.bar.style.width = (used / 180 * 100) + "%";
      const progress = view.bar.closest('[role="progressbar"]');
      if (progress) progress.setAttribute("aria-valuenow", String(used));
    }
  });
  ["audioVoiceQuotaConnect", "audioCloudflareQuotaConnect"].forEach(id => {
    const button = $(id);
    if (button) button.hidden = !quotaRequiresLogin;
  });
  const generate = $("audioCloudflareGenerate");
  if (generate) {
    generate.disabled = !healthReady || generationInProgress || !quotaSnapshot ||
      quotaSnapshot.remainingSeconds <= 0 || quotaSnapshot.inProgress;
  }
}
async function refreshVoiceQuota() {
  try {
    if (window.auroreAuthReady && typeof window.auroreAuthReady.then === "function") {
      try { await window.auroreAuthReady; } catch (_) {}
    }
    if (!window.auroreAuth || typeof window.auroreAuth.getSession !== "function") {
      updateQuotaView(null, "Connecte-toi avec Aurore ID pour afficher le compteur.", true);
      return null;
    }
    const session = await window.auroreAuth.getSession();
    if (!session || !session.user) {
      updateQuotaView(null, "Connecte-toi avec Aurore ID pour afficher le compteur.", true);
      return null;
    }
    const response = await authApi("/api/tts/quota", { method: "GET" });
    const data = await response.json();
    if (!data || data.ok !== true) throw Error("Le compteur vocal n’a pas renvoyé une réponse valide.");
    updateQuotaView(data);
    return data;
  } catch (error) {
    const requiresLogin = Number(error && error.status) === 401 ||
      /connecte|session|authentification/i.test(error && error.message || "");
    updateQuotaView(null,
      requiresLogin ? "Connecte-toi avec Aurore ID pour afficher le compteur." :
        "Le compteur est momentanément indisponible. Réessaie avant de générer une voix.",
      requiresLogin);
    return null;
  }
}
async function connectVoiceAccount(button) {
  if (button) button.disabled = true;
  try {
    if (window.auroreAuthReady && typeof window.auroreAuthReady.then === "function") await window.auroreAuthReady;
    if (!window.auroreAuth || typeof window.auroreAuth.signIn !== "function") {
      throw Error("La connexion Aurore ID n’est pas disponible sur cette page. Actualise puis réessaie.");
    }
    await window.auroreAuth.signIn("audio.html");
  } catch (error) {
    const target = $("audioCloudflareStatus");
    if (target) {
      target.textContent = error.message || "Connexion impossible. Réessaie.";
      target.dataset.error = "true";
    }
    if (button) button.disabled = false;
  }
}
async function checkHealth() {
  const button = $("audioCloudflareGenerate");
  if (button) button.disabled = true;
  healthReady = false;
  setStatus("Vérification de la disponibilité des voix…");
  try {
    const response = await fetch(new URL("/health", workerUrl()).toString(), {cache:"no-store"});
    if (!response.ok) throw Error("Le service vocal est momentanément indisponible.");
    const health = await response.json();
    if (!health || health.ok !== true || health.authConfigured !== true || health.aiConfigured !== true) {
      throw Error("La génération de voix est momentanément indisponible. Réessaie plus tard.");
    }
    healthReady = true;
    setStatus("Service vocal prêt. Ton compteur quotidien est affiché avant chaque génération.");
    updateQuotaView(quotaSnapshot);
  } catch (error) {
    healthReady = false;
    updateQuotaView(quotaSnapshot);
    setStatus(error.message || "Le service vocal est momentanément indisponible.", true);
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
    '<div class="cloudflare-dialog-head"><div><p class="section-kicker">CHOIX DE LA VOIX</p><h2 id="audioCloudflareTitle">Utiliser une autre voix</h2></div><button type="button" class="secondary-btn cloudflare-close" aria-label="Fermer la fenêtre">✕</button></div>' +
    '<p class="cloudflare-intro">Choisis une voix complémentaire à celle de ton téléphone. Tu vois le temps disponible avant chaque génération.</p>' +
    '<label class="field-label" for="audioCloudflareName">Nom de la piste</label><input class="text-field" id="audioCloudflareName" maxlength="100" value="Voix alternative" placeholder="Ex. : Révision de biologie">' +
    '<label class="field-label" for="audioCloudflareText">Texte d’essai</label><textarea class="text-area" id="audioCloudflareText" rows="5" maxlength="5000">Bonjour et bienvenue dans Aurore Mémoire. Apprendre, répéter et mémoriser devient plus simple avec une voix claire et naturelle.</textarea>' +
    '<div class="voice-choice-section"><p class="voice-choice-title">Style de voix</p><div id="audioCloudflareModelChoices" class="voice-choice-grid" role="group" aria-label="Choisir un style de voix">' +
    '<button type="button" class="voice-choice-card" data-voice-model="melotts" aria-pressed="true"><strong>Voix multilingue</strong><small>Français, anglais et plusieurs langues</small></button>' +
    '<button type="button" class="voice-choice-card" data-voice-model="aura-1" aria-pressed="false"><strong>Voix anglaise expressive</strong><small>Pour les textes en anglais</small></button>' +
    '<button type="button" class="voice-choice-card" data-voice-model="aura-2-en" aria-pressed="false"><strong>Narration anglaise</strong><small>Une seconde possibilité en anglais</small></button>' +
    '<button type="button" class="voice-choice-card" data-voice-model="aura-2-es" aria-pressed="false"><strong>Voix espagnole expressive</strong><small>Pour les textes en espagnol</small></button></div>' +
    '<select class="voice-hidden-select" id="audioCloudflareModel" aria-hidden="true" tabindex="-1"><option value="melotts">Voix multilingue</option><option value="aura-1">Voix anglaise expressive</option><option value="aura-2-en">Narration anglaise</option><option value="aura-2-es">Voix espagnole expressive</option></select></div>' +
    '<div id="audioCloudflareLanguageWrap" class="voice-choice-section"><p class="voice-choice-title">Langue</p><div id="audioCloudflareLanguageChoices" class="voice-choice-chips" role="group" aria-label="Choisir la langue">' +
    '<button type="button" class="voice-choice-chip" data-voice-language="fr" aria-pressed="true">Français</button><button type="button" class="voice-choice-chip" data-voice-language="en" aria-pressed="false">Anglais</button><button type="button" class="voice-choice-chip" data-voice-language="es" aria-pressed="false">Espagnol</button><button type="button" class="voice-choice-chip" data-voice-language="zh" aria-pressed="false">Chinois</button><button type="button" class="voice-choice-chip" data-voice-language="jp" aria-pressed="false">Japonais</button><button type="button" class="voice-choice-chip" data-voice-language="kr" aria-pressed="false">Coréen</button></div>' +
    '<p id="audioCloudflareLanguageFixed" class="form-help" hidden></p><select class="voice-hidden-select" id="audioCloudflareLanguage" aria-hidden="true" tabindex="-1"><option value="fr">Français</option><option value="en">Anglais</option><option value="es">Espagnol</option><option value="zh">Chinois</option><option value="jp">Japonais</option><option value="kr">Coréen</option></select></div>' +
    '<div id="audioCloudflareSpeakerWrap" class="voice-choice-section" hidden><p class="voice-choice-title">Choix de la voix</p><div id="audioCloudflareSpeakerChoices" class="voice-speaker-grid" role="group" aria-label="Choisir une voix"></div><select class="voice-hidden-select" id="audioCloudflareSpeaker" aria-hidden="true" tabindex="-1"></select></div>' +
    '<div class="voice-rate-control"><label class="field-label" for="audioCloudflareRate">Vitesse de lecture <span id="audioCloudflareRateLabel">1×</span></label><input id="audioCloudflareRate" type="range" min="0.7" max="1.3" step="0.1" value="1"></div>' +
    '<section class="voice-quota-card" aria-label="Quota quotidien de voix"><div class="voice-quota-head"><strong>Temps vocal disponible aujourd’hui</strong><span id="audioCloudflareQuotaText">Chargement du compteur…</span></div><div class="voice-quota-track" role="progressbar" aria-label="Temps vocal utilisé" aria-valuemin="0" aria-valuemax="180" aria-valuenow="0"><span id="audioCloudflareQuotaBar"></span></div><p class="form-help">Limite stricte : 3 minutes d’audio par jour. Le temps est décompté dès que la piste est générée, même si tu ne l’ajoutes pas à la bibliothèque.</p><button type="button" class="secondary-btn voice-quota-connect" id="audioCloudflareQuotaConnect" hidden>Se connecter avec Aurore ID</button></section>' +
    '<p class="form-help" id="audioCloudflareVoiceNote">La voix multilingue est celle à choisir pour le français.</p>' +
    '<div class="cloudflare-actions"><button type="button" class="secondary-btn" id="audioCloudflareBrowserPreview">▶ Écouter avec le téléphone</button><button type="button" class="primary-btn" id="audioCloudflareGenerate" disabled>Générer la voix</button><button type="button" class="secondary-btn" id="audioCloudflareRetry">↻ Actualiser le compteur</button><button type="button" class="secondary-btn" id="audioCloudflareStop" disabled>■ Arrêter</button></div>' +
    '<audio id="audioCloudflarePlayer" controls hidden></audio><p id="audioCloudflareStatus" class="audio-status" role="status" aria-live="polite">Prêt à générer une voix.</p>' +
    '<div class="cloudflare-dialog-foot"><span class="form-help">L’essai reste privé. Il n’est pas ajouté automatiquement à ta bibliothèque.</span><button type="button" class="secondary-btn" id="audioCloudflareSave" disabled>＋ Ajouter à ma bibliothèque</button></div>';
  document.body.appendChild(dialog);

  const player = $("audioCloudflarePlayer");
  const generateButton = $("audioCloudflareGenerate");
  const browserPreviewButton = $("audioCloudflareBrowserPreview");
  const saveButton = $("audioCloudflareSave");
  const modelSelect = $("audioCloudflareModel");
  const speakerSelect = $("audioCloudflareSpeaker");
  const languageSelect = $("audioCloudflareLanguage");
  const pitchSelect = $("audioCloudflarePitch");
  const voiceNote = $("audioCloudflareVoiceNote");
  function applyPlaybackEffects() {
    const speed = Number($("audioCloudflareRate").value) || 1;
    const pitch = Number(pitchSelect && pitchSelect.value) || 1;
    if (player) player.playbackRate = Math.max(0.6, Math.min(1.6, speed * pitch));
  }
  const speakers = {
    "melotts": [],
    "aura-1": ["angus","asteria","arcas","orion","orpheus","athena","luna","zeus","perseus","helios","hera","stella"],
    "aura-2-en": ["amalthea","andromeda","apollo","arcas","aries","asteria","athena","atlas","aurora","callista","cora","cordelia","delia","draco","electra","harmonia","helena","hera","hermes","hyperion","iris","janus","juno","jupiter","luna","mars","minerva","neptune","odysseus","ophelia","orion","orpheus","pandora","phoebe","pluto","saturn","thalia","theia","vesta","zeus"],
    "aura-2-es": ["sirio","nestor","carina","celeste","alvaro","diana","aquila","selena","estrella","javier"]
  };
  function refreshCloudflareVoices() {
    const model = modelSelect.value;
    speakerSelect.textContent = "";
    (speakers[model] || []).forEach(name => {
      const option = document.createElement("option");
      option.value = name; option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      speakerSelect.appendChild(option);
    });
    const hasSpeaker = (speakers[model] || []).length > 0;
    $("audioCloudflareSpeakerWrap").hidden = !hasSpeaker;
    if (model === "aura-1" || model === "aura-2-en") languageSelect.value = "en";
    if (model === "aura-2-es") languageSelect.value = "es";
    languageSelect.disabled = model !== "melotts";
    voiceNote.textContent = model === "melotts"
      ? "Pour le français, utilise MeloTTS : c’est le seul moteur proposé ici qui prend en charge cette langue. Il ne permet pas de choisir un timbre précis."
      : "Ce moteur Deepgram ne propose pas de voix française. La langue est verrouillée sur " + (model === "aura-2-es" ? "l’espagnol." : "l’anglais.") + " Pour lire en français, sélectionne MeloTTS.";
  }
  browserPreviewButton.addEventListener("click", () => {
    const text = $("audioCloudflareText").value.trim();
    if (!text) { setStatus("Écris d’abord un texte à lire.", true); return; }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setStatus("La synthèse vocale du navigateur n’est pas disponible. Sur Android, active ou installe Speech Services by Google, puis télécharge une voix française.", true);
      return;
    }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const language = ({fr:"fr-FR",en:"en-US",es:"es-ES",zh:"zh-CN",jp:"ja-JP",kr:"ko-KR"})[languageSelect.value] || "fr-FR";
      const voices = synth.getVoices ? synth.getVoices() : [];
      const matching = voices.filter(v => (v.lang || "").toLowerCase().replace("_","-") === language.toLowerCase() ||
        (v.lang || "").toLowerCase().startsWith(language.slice(0,2).toLowerCase()+"-"));
      if (language.startsWith("fr") && voices.length && !matching.length) {
        setStatus("Aucune voix française n’est installée ou exposée au navigateur. Dans Android, ouvre Synthèse vocale, choisis Speech Services by Google et télécharge le français, puis réessaie.", true);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = Number($("audioCloudflareRate").value) || 1;
      if (matching.length) utterance.voice = matching.find(v => v.default) || matching[0];
      let started = false;
      utterance.onstart = () => { started = true; setStatus("Lecture du navigateur en cours…"); };
      utterance.onend = () => setStatus("Aperçu du navigateur terminé.");
      utterance.onerror = event => {
        const code = event.error || "erreur inconnue";
        const detail = code === "synthesis-failed" || code === "voice-unavailable"
          ? " Le moteur vocal Android a refusé la lecture. Vérifie Speech Services by Google et la voix française téléchargée."
          : code === "not-allowed" ? " Appuie de nouveau sur Aperçu après avoir touché l’écran." : "";
        setStatus("La lecture du navigateur a échoué (" + code + ")." + detail, true);
      };
      synth.speak(utterance);
      if (synth.resume) synth.resume();
      window.setTimeout(() => {
        if (!started && synth.speaking) setStatus("Le moteur vocal n’a pas encore démarré. Patiente un instant ou vérifie la voix Android.", true);
      }, 3500);
    } catch (error) {
      setStatus("Impossible de démarrer la lecture du navigateur : " + (error.message || "erreur inconnue"), true);
    }
  });
  modelSelect.addEventListener("change", refreshCloudflareVoices);
  refreshCloudflareVoices();
  $("audioCloudflareRetry").addEventListener("click", checkHealth);
  dialog.querySelector(".cloudflare-close").addEventListener("click", () => { player.pause(); dialog.close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) { player.pause(); dialog.close(); } });
  $("audioCloudflareRate").addEventListener("input", () => {
    $("audioCloudflareRateLabel").textContent = Number($("audioCloudflareRate").value).toFixed(1).replace(".0","") + "×";
    applyPlaybackEffects();
  });
  if (pitchSelect) pitchSelect.addEventListener("change", applyPlaybackEffects);
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
        body:JSON.stringify({text:prompt, language:$("audioCloudflareLanguage").value, model:modelSelect.value, voice:speakerSelect.value})
      });
      if (!response.ok) {
        let message = "Échec de la génération Cloudflare (HTTP " + response.status + ").";
        try { const detail = await response.json(); if (detail && detail.error) message = detail.error; } catch (_) {}
        throw Error(message);
      }
      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.startsWith("audio/")) {
        let message = "Le serveur n’a pas renvoyé un fichier audio valide.";
        try { const detail = await response.json(); if (detail && detail.error) message = detail.error; } catch (_) {}
        throw Error(message);
      }
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_BYTES) throw Error("Le fichier audio est vide ou dépasse 10 Mo.");
      if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
      const objectUrl = URL.createObjectURL(blob);
      player.dataset.objectUrl = objectUrl;
      player.src = objectUrl;
      player.hidden = false;
      applyPlaybackEffects();
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
  const staticButton = $("audioCloudflareEntry");
  if (staticButton) {
    staticButton.addEventListener("click", cloudflareDialog);
    controlsCleanup.push(() => staticButton.removeEventListener("click", cloudflareDialog));
    return;
  }
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
  controlsCleanup.push(() => button.removeEventListener("click", cloudflareDialog));
  controlsCleanup.push(() => { row.remove(); help.remove(); });
  row.appendChild(button);
  const help = document.createElement("p");
  help.className = "form-help";
  help.textContent = "Teste la génération cloud séparément ; l’aperçu vocal du téléphone reste disponible ci-dessus.";
  const status = $("audioTextStatus");
  if (status) { panel.insertBefore(row, status); panel.insertBefore(help, status); }
  else panel.append(row, help);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addControls, {once:true});
} else {
  addControls();
}
})();