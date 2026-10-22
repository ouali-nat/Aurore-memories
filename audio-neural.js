(function () {
"use strict";
if (window.__auroreNeuralAudioLoaded) return;
window.__auroreNeuralAudioLoaded = true;
const $ = id => document.getElementById(id);
const DB = "aurore-audio-library-v1", STORE = "blobs", MANIFEST = "aurore-audio-manifest-v1", MAX_MS = 6 * 60 * 1000;
function status(message, error) {
  const el = $("audioRecordStatus");
  if (el) { el.textContent = message; el.dataset.error = error ? "true" : "false"; }
}
function uid() { return crypto && crypto.randomUUID ? crypto.randomUUID() : "tts-" + Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error("Cache audio indisponible."));
  });
}
async function cacheBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, blob, savedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || Error("Impossible de conserver l’audio.")); };
  });
}
async function api(path, options) {
  if (!window.auroreAuth || !window.auroreAuth.api) throw Error("Connecte-toi avec Aurore ID pour générer une voix HD.");
  return window.auroreAuth.api(path, options || {});
}
function readManifest() {
  try { const m = JSON.parse(localStorage.getItem(MANIFEST) || "{}"); return { records: Array.isArray(m.records) ? m.records : [], sequences: Array.isArray(m.sequences) ? m.sequences : [] }; }
  catch (_) { return { records: [], sequences: [] }; }
}
async function generate() {
  const text = $("audioText").value.trim();
  if (!text) throw Error("Écris d’abord le texte à lire.");
  const rate = Number($("audioRate").value) || 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (Math.ceil(words / 2.5 / rate) * 1000 > MAX_MS) throw Error("Le texte dépasse environ six minutes. Raccourcis-le ou crée plusieurs pistes.");
  if (!navigator.onLine) throw Error("La génération HD nécessite Internet. Une fois enregistrée, la piste pourra être relue hors ligne.");
  status("Génération de la voix HD en cours…", false);
  const response = await api("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: $("audioLanguage").value }) });
  if (!response.ok) {
    let message = "Génération HD impossible (" + response.status + ").";
    try { const detail = await response.json(); if (detail && detail.error) message = detail.error; } catch (_) {}
    throw Error(message);
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > 10 * 1024 * 1024) throw Error("Le fichier généré est vide ou dépasse 10 Mo.");
  const id = uid(), key = "audios/" + id + ".mp3", name = ($("audioTextName").value.trim() || text.slice(0, 45)).slice(0, 100);
  await cacheBlob(id, blob);
  const manifest = readManifest();
  const record = { id, kind: "recording", name, key, mime: "audio/mpeg", size: blob.size, durationMs: null, createdAt: new Date().toISOString(), public: false, repeat: 1, synced: false, neural: true };
  manifest.records.unshift(record);
  localStorage.setItem(MANIFEST, JSON.stringify({ version: 1, records: manifest.records, sequences: manifest.sequences, updatedAt: new Date().toISOString() }));
  let cloudMessage = "Conservé sur cet appareil, disponible hors ligne.";
  try {
    const upload = await api("/api/storage?key=" + encodeURIComponent(key), { method: "POST", headers: { "Content-Type": "audio/mpeg" }, body: blob });
    if (!upload.ok) throw Error("Envoi cloud refusé (" + upload.status + ").");
    record.synced = true;
    const saved = await api("/api/storage?key=" + encodeURIComponent("audios/manifest.json"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, records: manifest.records, sequences: manifest.sequences, updatedAt: new Date().toISOString() }) });
    if (!saved.ok) throw Error("Audio envoyé, mais métadonnées cloud non synchronisées (" + saved.status + ").");
    localStorage.setItem(MANIFEST, JSON.stringify({ version: 1, records: manifest.records, sequences: manifest.sequences, updatedAt: new Date().toISOString() }));
    cloudMessage = "Audio enregistré sur l’appareil et synchronisé dans ton espace privé.";
  } catch (error) {
    localStorage.setItem(MANIFEST, JSON.stringify({ version: 1, records: manifest.records, sequences: manifest.sequences, updatedAt: new Date().toISOString() }));
    cloudMessage += " Synchronisation cloud à vérifier : " + error.message;
  }
  const player = new Audio(URL.createObjectURL(blob));
  player.playbackRate = rate;
  try { await player.play(); } catch (_) {}
  window.dispatchEvent(new CustomEvent("aurore-neural-audio-created", { detail: { record } }));
  status("Voix HD créée. " + cloudMessage, false);
  return record;
}
function cloudflareDialog() {
  let dialog = $("audioCloudflareDialog");
  if (dialog) { dialog.showModal(); return; }
  dialog = document.createElement("dialog");
  dialog.id = "audioCloudflareDialog";
  dialog.className = "cloudflare-test-dialog";
  dialog.setAttribute("aria-labelledby", "audioCloudflareTitle");
  dialog.innerHTML =
    '<div class="cloudflare-dialog-head"><div><p class="section-kicker">LABORATOIRE VOCAL</p><h2 id="audioCloudflareTitle">Expérimenter la voix Cloudflare</h2></div><button type="button" class="secondary-btn cloudflare-close" aria-label="Fermer la fenêtre">✕</button></div>' +
    '<p class="cloudflare-intro">Teste une voix neuronale générée dans le cloud, sans modifier la synthèse vocale déjà intégrée à ton téléphone. La génération nécessite une connexion et Aurore ID.</p>' +
    '<label class="field-label" for="audioCloudflareText">Texte d’essai</label><textarea class="text-area" id="audioCloudflareText" rows="5" maxlength="5000">Bonjour et bienvenue dans Aurore Mémoire. Apprendre, répéter et mémoriser devient plus simple avec une voix claire et naturelle.</textarea>' +
    '<div class="cloudflare-options"><div><label class="field-label" for="audioCloudflareLanguage">Langue de la voix</label><select class="text-field" id="audioCloudflareLanguage"><option value="fr">Français</option><option value="en">Anglais</option><option value="es">Espagnol</option><option value="zh">Chinois</option><option value="jp">Japonais</option><option value="kr">Coréen</option></select></div>' +
    '<div><label class="field-label" for="audioCloudflareRate">Vitesse de lecture <span id="audioCloudflareRateLabel">1×</span></label><input id="audioCloudflareRate" type="range" min="0.7" max="1.3" step="0.1" value="1"></div></div>' +
    '<div class="cloudflare-actions"><button type="button" class="primary-btn" id="audioCloudflareGenerate">▶ Générer et écouter</button><button type="button" class="secondary-btn" id="audioCloudflareStop" disabled>■ Arrêter</button></div>' +
    '<audio id="audioCloudflarePlayer" controls hidden></audio><p id="audioCloudflareStatus" class="audio-status" role="status" aria-live="polite">Prêt à tester la voix Cloudflare.</p>' +
    '<div class="cloudflare-dialog-foot"><span class="form-help">L’audio d’essai n’est pas enregistré automatiquement.</span><button type="button" class="secondary-btn" id="audioCloudflareSave" disabled>＋ Ajouter à ma bibliothèque</button></div>';
  document.body.appendChild(dialog);
  const close = () => { const player = $("audioCloudflarePlayer"); if (player) player.pause(); dialog.close(); };
  dialog.querySelector(".cloudflare-close").addEventListener("click", close);
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  $("audioCloudflareRate").addEventListener("input", () => {
    $("audioCloudflareRateLabel").textContent = Number($("audioCloudflareRate").value).toFixed(1).replace(".0","") + "×";
    const player = $("audioCloudflarePlayer"); if (player) player.playbackRate = Number($("audioCloudflareRate").value);
  });
  $("audioCloudflareStop").addEventListener("click", () => { $("audioCloudflarePlayer").pause(); $("audioCloudflareStop").disabled = true; });
  $("audioCloudflareGenerate").addEventListener("click", async () => {
    const button = $("audioCloudflareGenerate"), player = $("audioCloudflarePlayer"), save = $("audioCloudflareSave"), statusEl = $("audioCloudflareStatus");
    const prompt = $("audioCloudflareText").value.trim();
    if (!prompt) { statusEl.textContent = "Écris un texte avant de lancer le test."; return; }
    button.disabled = true; save.disabled = true; statusEl.textContent = "Cloudflare génère la voix…";
    try {
      if (!navigator.onLine) throw Error("Une connexion Internet est nécessaire pour générer la voix Cloudflare.");
      const response = await api("/api/tts", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,language:$("audioCloudflareLanguage").value})});
      if (!response.ok) {
        let message = "La génération Cloudflare a échoué (" + response.status + ").";
        try { const detail = await response.json(); if (detail && detail.error) message = detail.error; } catch (_) {}
        throw Error(message);
      }
      const blob = await response.blob();
      if (!blob.size || blob.size > 10 * 1024 * 1024) throw Error("Le fichier audio est vide ou dépasse 10 Mo.");
      if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
      const objectUrl = URL.createObjectURL(blob);
      player.dataset.objectUrl = objectUrl; player.src = objectUrl; player.hidden = false;
      player.playbackRate = Number($("audioCloudflareRate").value) || 1;
      save.disabled = false;
      statusEl.textContent = "Voix Cloudflare générée. Écoute le résultat, puis ajoute-le à ta bibliothèque si tu le souhaites.";
      try { await player.play(); $("audioCloudflareStop").disabled = false; } catch (_) {}
    } catch (error) {
      statusEl.textContent = error.message || "Impossible de générer la voix Cloudflare.";
    } finally { button.disabled = false; }
  });
  $("audioCloudflareSave").addEventListener("click", async () => {
    const player = $("audioCloudflarePlayer"), save = $("audioCloudflareSave"), statusEl = $("audioCloudflareStatus");
    if (!player.dataset.objectUrl || save.disabled) return;
    save.disabled = true; statusEl.textContent = "Enregistrement de la piste…";
    try {
      const response = await fetch(player.dataset.objectUrl), blob = await response.blob();
      const id = uid(), prompt = $("audioCloudflareText").value.trim();
      const name = ($("audioTextName").value.trim() || prompt.slice(0,45) || "Voix Cloudflare").slice(0,100);
      await cacheBlob(id, blob);
      const manifest = readManifest();
      const record = {id,kind:"recording",name,key:"audios/"+id+".mp3",mime:"audio/mpeg",size:blob.size,durationMs:null,createdAt:new Date().toISOString(),public:false,repeat:1,synced:false,neural:true,cloudflare:true};
      manifest.records.unshift(record);
      localStorage.setItem(MANIFEST,JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()}));
      let message = "Piste enregistrée sur cet appareil.";
      try {
        const upload = await api("/api/storage?key="+encodeURIComponent(record.key),{method:"POST",headers:{"Content-Type":"audio/mpeg"},body:blob});
        if (!upload.ok) throw Error("Envoi cloud refusé ("+upload.status+").");
        record.synced = true;
        const saved = await api("/api/storage?key="+encodeURIComponent("audios/manifest.json"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()})});
        if (!saved.ok) throw Error("Métadonnées cloud non synchronisées ("+saved.status+").");
        message = "Piste enregistrée et synchronisée dans ton espace privé.";
      } catch (error) { message += " Synchronisation cloud à vérifier : "+error.message; }
      localStorage.setItem(MANIFEST,JSON.stringify({version:1,records:manifest.records,sequences:manifest.sequences,updatedAt:new Date().toISOString()}));
      window.dispatchEvent(new CustomEvent("aurore-neural-audio-created",{detail:{record}}));
      statusEl.textContent = message;
    } catch (error) { statusEl.textContent = error.message || "Impossible d’enregistrer cette piste."; save.disabled = false; }
  });
  dialog.addEventListener("close", () => {
    const player = $("audioCloudflarePlayer");
    if (player) { player.pause(); if (player.dataset.objectUrl) { URL.revokeObjectURL(player.dataset.objectUrl); delete player.dataset.objectUrl; } player.removeAttribute("src"); player.hidden = true; }
  });
  dialog.showModal();
}
function addControls() {
  const panel = $("audioTextSave") && $("audioTextSave").closest(".audio-panel");
  if (!panel || $("audioNeuralGenerate")) return;
  const row = document.createElement("div");
  row.className = "audio-button-row";
  row.style.marginTop = "10px";
  const button = document.createElement("button");
  button.type = "button"; button.id = "audioNeuralGenerate"; button.className = "secondary-btn";
  button.textContent = "✦ Expérimenter la voix Cloudflare";
  button.addEventListener("click", cloudflareDialog);
  row.appendChild(button);
  const help = document.createElement("p");
  help.className = "form-help";
  help.textContent = "Cette fenêtre teste la voix Cloudflare séparément. L’aperçu vocal du téléphone reste disponible ci-dessus.";
  panel.insertBefore(row, $("audioTextSave").parentElement.nextSibling);
  panel.insertBefore(help, row.nextSibling);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addControls); else addControls();
})();