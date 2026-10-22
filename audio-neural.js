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
  if (Math.ceil(words / 2.5 / rate * 60) * 1000 > MAX_MS) throw Error("Le texte dépasse environ six minutes. Raccourcis-le ou crée plusieurs pistes.");
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
  if (typeof window.auroreAudioRefresh === "function") window.auroreAudioRefresh();
  const refresh = $("audioRefresh");
  if (refresh) refresh.click();
  status("Voix HD créée. " + cloudMessage, false);
  return record;
}
function addControls() {
  const panel = $("audioTextSave") && $("audioTextSave").closest(".audio-panel");
  if (!panel || $("audioNeuralGenerate")) return;
  const row = document.createElement("div");
  row.className = "audio-button-row";
  row.style.marginTop = "10px";
  const button = document.createElement("button");
  button.type = "button"; button.id = "audioNeuralGenerate"; button.className = "primary-btn";
  button.textContent = "✦ Générer et enregistrer la voix HD";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await generate(); }
    catch (error) { status(error.message || "Génération de la voix HD impossible.", true); }
    finally { button.disabled = false; }
  });
  row.appendChild(button);
  const help = document.createElement("p");
  help.className = "form-help";
  help.textContent = "Voix neuronale Cloudflare · nécessite Internet pour la génération · MP3 conservé localement pour les relectures hors ligne. Connexion Aurore ID requise.";
  panel.insertBefore(row, $("audioTextSave").parentElement.nextSibling);
  panel.insertBefore(help, row.nextSibling);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addControls); else addControls();
})();