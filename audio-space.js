(function () {
"use strict";
/* Chaque visite (navigation SPA incluse) ré-exécute ce script : on nettoie l'ancienne instance puis on relie la nouvelle page. */
if (typeof window.__auroreAudioCleanup === "function") { try { window.__auroreAudioCleanup(); } catch (_) {} }
if (!document.getElementById("audioLibraryList")) return;

var DB = "aurore-audio-library-v1", STORE = "blobs", MANIFEST_KEY = "aurore-audio-manifest-v1", CLOUD_MANIFEST = "audios/manifest.json";
var MAX_MS = 6 * 60 * 1000, MAX_BYTES = 10 * 1024 * 1024;
var PROFILES = [
  { id: "aurore", label: "Aurore · naturelle", gender: "f", pitch: 1, rate: 1 },
  { id: "claire", label: "Claire · claire et vive", gender: "f", pitch: 1.18, rate: 1.05 },
  { id: "lea", label: "Léa · douce et posée", gender: "f", pitch: 0.98, rate: 0.9 },
  { id: "marc", label: "Marc · voix grave", gender: "m", pitch: 0.82, rate: 1 },
  { id: "thomas", label: "Thomas · narrateur posé", gender: "m", pitch: 0.95, rate: 0.92 }
];
var FEMALE = /(amelie|amélie|audrey|marie|julie|denise|eloise|éloise|hortense|celine|céline|female|femme|thalita|vivienne|lea|léa)/i;
var MALE = /(thomas|daniel|henri|paul|claude|remy|rémy|mathieu|antoine|guillaume|homme)/i;

var $ = function (id) { return document.getElementById(id); };
var records = [], sequences = [], seqPick = [];
var recorder = null, stream = null, chunks = [], startedAt = 0, tickTimer = 0, stopTimer = 0;
var current = null, currentTrack = 0, playing = false, paused = false, playerAudio = null, playerUrl = null, token = 0, statusLine = "", activeSpeakEnd = null, sequenceRound = 1;

function uid() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : "au-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
function status(id, msg, error) { var el = $(id); if (el) { el.textContent = msg || ""; el.dataset.error = error ? "true" : "false"; } }
function bytes(n) { return n < 1024 ? n + " o" : n < 1048576 ? (n / 1024).toFixed(1) + " Ko" : (n / 1048576).toFixed(2) + " Mo"; }
function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function on(id, evt, fn) { var el = $(id); if (el) el.addEventListener(evt, fn); }

/* ---------- Stockage local (IndexedDB) + manifeste ---------- */
function openDb() { return new Promise(function (resolve, reject) { if (!window.indexedDB) return reject(Error("Le stockage hors ligne n’est pas disponible.")); var r = indexedDB.open(DB, 1); r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); }; r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error || Error("Ouverture du cache audio impossible.")); }; }); }
async function db(mode, fn) { var d = await openDb(); return new Promise(function (resolve, reject) { var tx = d.transaction(STORE, mode), r; try { r = fn(tx.objectStore(STORE)); } catch (e) { d.close(); reject(e); return; } tx.oncomplete = function () { d.close(); resolve(r && r.result); }; tx.onerror = tx.onabort = function () { d.close(); reject(tx.error || Error("Cache audio indisponible.")); }; }); }
function putBlob(id, blob) { return db("readwrite", function (s) { return s.put({ id: id, blob: blob, savedAt: Date.now() }); }); }
function getBlob(id) { return db("readonly", function (s) { return s.get(id); }); }
function delBlob(id) { return db("readwrite", function (s) { return s.delete(id); }); }
function readLocal() { try { var m = JSON.parse(localStorage.getItem(MANIFEST_KEY) || "{}"); return { records: Array.isArray(m.records) ? m.records : [], sequences: Array.isArray(m.sequences) ? m.sequences : [] }; } catch (_) { return { records: [], sequences: [] }; } }
function writeLocal() { try { localStorage.setItem(MANIFEST_KEY, JSON.stringify({ version: 1, records: records, sequences: sequences, updatedAt: new Date().toISOString() })); } catch (_) {} }

/* ---------- Cloud (facultatif, si Aurore ID est connecté) ---------- */
async function api(path, opts) { if (!window.auroreAuth || !window.auroreAuth.api) throw Error("Connecte-toi avec Aurore ID pour synchroniser le cloud."); return window.auroreAuth.api(path, opts || {}); }
async function uploadBlob(record, blob) { if (!navigator.onLine) throw Error("Hors ligne : audio conservé sur cet appareil."); var r = await api("/api/storage?key=" + encodeURIComponent(record.key), { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }); if (!r.ok) throw Error("Envoi impossible (" + r.status + ")."); record.synced = true; }
function publicMeta(r) { var c = Object.assign({}, r); delete c.localOnly; return c; }
async function syncManifest() {
  writeLocal();
  if (!navigator.onLine || !window.auroreAuth || !window.auroreAuth.api) return;
  try {
    var r = await api("/api/storage?key=" + encodeURIComponent(CLOUD_MANIFEST), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, records: records.map(publicMeta), sequences: sequences, updatedAt: new Date().toISOString() }) });
    if (!r.ok) throw Error("Synchronisation impossible (" + r.status + ").");
  } catch (e) { status("audioAccountStatus", "Conservé sur cet appareil. Synchronisation cloud en attente : " + e.message, true); }
}
async function loadCloud() {
  if (!navigator.onLine || !window.auroreAuth || !window.auroreAuth.getSession) return false;
  try {
    var session = await window.auroreAuth.getSession();
    if (!session || !session.user) return false;
    var res = await api("/api/storage?key=" + encodeURIComponent(CLOUD_MANIFEST), { method: "GET" });
    if (!res.ok) return false;
    var remote = await res.json();
    if (!remote || !Array.isArray(remote.records)) return false;
    var map = new Map(records.map(function (r) { return [r.id, r]; }));
    remote.records.forEach(function (r) { if (r && r.id && !map.has(r.id)) map.set(r.id, r); });
    records = Array.from(map.values());
    var seqMap = new Map(sequences.map(function (s) { return [s.id, s]; }));
    (remote.sequences || []).forEach(function (s) { if (s && s.id && !seqMap.has(s.id)) seqMap.set(s.id, s); });
    sequences = Array.from(seqMap.values());
    writeLocal();
    return true;
  } catch (_) { return false; }
}
/* Au chargement, auth.js peut encore être en train de restaurer la session.
   Quelques tentatives évitent de laisser la bibliothèque bloquée sur les seules données locales. */
async function loadCloudWithRetry() {
  for (var attempt = 0; attempt < 4; attempt++) {
    if (await loadCloud()) return true;
    if (attempt < 3) await sleep(700);
  }
  return false;
}
async function syncPending() {
  if (!navigator.onLine || !window.auroreAuth || !window.auroreAuth.api) return;
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.kind !== "recording" || r.synced || !r.key) continue;
    try { var b = await getBlob(r.id); if (b && b.blob) { await uploadBlob(r, b.blob); await syncManifest(); } } catch (_) {}
  }
}

/* ---------- Voix : profils intégrés + voix installées ---------- */
function allVoices() { return window.speechSynthesis && speechSynthesis.getVoices ? (speechSynthesis.getVoices() || []) : []; }
function langPool(lang) { var base = String(lang || "fr-FR").split("-")[0].toLowerCase(); return allVoices().filter(function (v) { return String(v.lang || "").toLowerCase().replace("_", "-").indexOf(base) === 0; }); }
function resolveVoice(sel, lang) {
  sel = sel || "";
  var list = allVoices(), pool = langPool(lang);
  if (sel && sel.indexOf("profile:") !== 0 && sel.indexOf("voice:") !== 0) sel = "voice:" + sel;
  if (sel.indexOf("voice:") === 0) { var n = sel.slice(6), v = list.find(function (x) { return x.name === n; }); return { voice: v || pool[0] || null, pitch: 1, rate: 1 }; }
  if (sel.indexOf("profile:") === 0) {
    var idx = PROFILES.findIndex(function (p) { return p.id === sel.slice(8); });
    if (idx >= 0) {
      var p = PROFILES[idx], src = pool.length ? pool : list, pick = null;
      var matching = src.filter(function (v) { return p.gender === "f" ? FEMALE.test(v.name) : (!FEMALE.test(v.name) && MALE.test(v.name)); });
      if (matching.length) pick = matching[idx % matching.length];
      else if (src.length) pick = src[idx % src.length];
      return { voice: pick, pitch: p.pitch, rate: p.rate };
    }
  }
  return { voice: null, pitch: 1, rate: 1 };
}
function fillVoices() {
  var select=$("audioVoice"); if(!select)return;
  var previous=select.value, picker=$("audioVoicePickerOptions"), selectedLabel=$("audioVoiceSelectedLabel");
  select.textContent="";
  var options=[];
  PROFILES.forEach(function(p){options.push({value:"profile:"+p.id,label:p.label,group:"Voix Aurore"});});
  options.push({value:"",label:"Voix par défaut du téléphone",group:"Téléphone"});
  allVoices().forEach(function(v){options.push({value:"voice:"+v.name,label:v.name+" · "+v.lang+(v.localService?" · locale":" · réseau"),group:"Autres voix installées"});});
  options.forEach(function(item){var o=document.createElement("option");o.value=item.value;o.textContent=item.label;select.appendChild(o);});
  select.value=options.some(function(item){return item.value===previous;})?previous:"profile:aurore";
  if(selectedLabel)selectedLabel.textContent=(options.find(function(item){return item.value===select.value;})||options[0]).label;
  if(picker){
    picker.textContent="";
    var group="";
    options.forEach(function(item){
      if(item.group!==group){group=item.group;var heading=document.createElement("p");heading.className="audio-voice-picker-group";heading.textContent=group;picker.appendChild(heading);}
      var button=document.createElement("button");button.type="button";button.className="audio-voice-picker-option";button.textContent=item.label;button.dataset.voiceValue=item.value;button.setAttribute("aria-pressed",item.value===select.value?"true":"false");picker.appendChild(button);
    });
  }
  var note=$("audioVoiceNote");
  if(note)note.textContent=window.speechSynthesis?(allVoices().length?allVoices().length+" voix du téléphone détectée(s). Les profils Aurore ajustent le timbre et le rythme de la meilleure voix disponible.":"Aucune voix système détectée pour le moment : installe un moteur vocal dans les réglages Android (Synthèse vocale)."):"Synthèse vocale indisponible sur ce navigateur.";
}
function initVoicePicker(){
  var trigger=$("audioVoicePicker"),panel=$("audioVoicePickerPanel"),options=$("audioVoicePickerOptions"),select=$("audioVoice");
  if(!trigger||!panel||!options||!select)return;
  trigger.addEventListener("click",function(){var open=panel.hidden;panel.hidden=!open;trigger.setAttribute("aria-expanded",String(open));});
  options.addEventListener("click",function(event){
    var button=event.target.closest("[data-voice-value]");if(!button)return;
    select.value=button.dataset.voiceValue;select.dispatchEvent(new Event("change",{bubbles:true}));
    var label=$("audioVoiceSelectedLabel");if(label)label.textContent=button.textContent;
    options.querySelectorAll("[data-voice-value]").forEach(function(item){item.setAttribute("aria-pressed",item===button?"true":"false");});
    panel.hidden=true;trigger.setAttribute("aria-expanded","false");
  });
}
function splitText(text) {
  var parts = String(text || "").replace(/\s+/g, " ").trim().match(/[^.!?。！？;:]+[.!?。！？;:]*/g) || [], out = [], buf = "";
  parts.forEach(function (p) {
    p = p.trim(); if (!p) return;
    if (p.length > 200) { if (buf) { out.push(buf); buf = ""; } var line = ""; p.split(" ").forEach(function (w) { if ((line + " " + w).trim().length > 200) { out.push(line); line = w; } else line = (line + " " + w).trim(); }); if (line) out.push(line); return; }
    if ((buf + " " + p).trim().length > 180) { if (buf) out.push(buf); buf = p; } else buf = (buf + " " + p).trim();
  });
  if (buf) out.push(buf);
  return out;
}
function speak(text, sel, lang, rate) {
  return new Promise(function (resolve) {
    var synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) { resolve({ ok: false, reason: "unsupported" }); return; }
    var parts = splitText(text); if (!parts.length) { resolve({ ok: false, reason: "empty" }); return; }
    var cfg = resolveVoice(sel, lang), i = 0, done = false, wd = 0;
    function end(r) { if (done) return; done = true; clearTimeout(wd); activeSpeakEnd = null; resolve(r); }
    activeSpeakEnd = function () { end({ ok: false, reason: "canceled" }); };
    try { synth.cancel(); } catch (_) {}
    function next() {
      if (done) return;
      if (i >= parts.length) { end({ ok: true }); return; }
      var u = new SpeechSynthesisUtterance(parts[i++]), started = false;
      u.lang = lang || "fr-FR"; u.rate = Math.max(0.5, Math.min(4, (rate || 1) * cfg.rate)); u.pitch = cfg.pitch; if (cfg.voice) u.voice = cfg.voice;
      u.onstart = function () { started = true; clearTimeout(wd); };
      u.onend = function () { clearTimeout(wd); next(); };
      u.onerror = function (e) { clearTimeout(wd); var er = e && e.error; end({ ok: false, reason: (er === "canceled" || er === "interrupted") ? "canceled" : (er || "error") }); };
      wd = setTimeout(function () { if (!started && !done && !synth.speaking) end({ ok: false, reason: "silent" }); }, 8000);
      try { synth.speak(u); if (synth.resume) synth.resume(); } catch (e) { end({ ok: false, reason: "error" }); }
    }
    /* Démarrer immédiatement depuis le clic : certains navigateurs mobiles
       ignorent la synthèse si elle commence après un setTimeout. */
    next();
  });
}
function speakMessage(r) {
  var m = { unsupported: "La synthèse vocale n’est pas prise en charge par ce navigateur. Essaie Chrome à jour.", empty: "Il n’y a rien à lire.", silent: "Aucune voix n’a répondu. Active un moteur vocal dans les réglages du téléphone (Synthèse vocale) ou choisis une autre voix.", error: "La voix n’a pas pu lire le texte. Essaie une autre voix." };
  return m[r] || ("La voix n’a pas pu démarrer (" + r + ").");
}
function estimateDuration(text, rate) { return Math.ceil(String(text || "").trim().split(/\s+/).filter(Boolean).length / 2.5 / Math.max(0.6, rate || 1) * 60) * 1000; }

/* ---------- Enregistrement ---------- */
function mimeType() { if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return ""; var t = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"]; for (var i = 0; i < t.length; i++) if (MediaRecorder.isTypeSupported(t[i])) return t[i]; return ""; }
function setRecordingUi(on) {
  var a = $("audioRecordStart"), b = $("audioRecordStop"), panel = $("recordPanel");
  if (a) a.disabled = on; if (b) b.disabled = !on;
  if (panel) panel.classList.toggle("is-recording", !!on);
}
function tick() {
  var elapsed = Date.now() - startedAt, t = $("audioRecordTimer"), m = $("audioRecordMeter");
  if (t) t.textContent = clock(elapsed) + " / 6:00";
  if (m) m.style.width = Math.min(100, elapsed / MAX_MS * 100) + "%";
}
function releaseStream() { if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} }); stream = null; } clearInterval(tickTimer); clearTimeout(stopTimer); }
function micError(e) {
  var n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "Micro refusé. Autorise le micro pour Aurore dans les réglages du navigateur (ou de l’application), puis réessaie.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "Aucun micro détecté sur cet appareil.";
  if (n === "NotReadableError" || n === "AbortError") return "Le micro est utilisé par une autre application. Ferme-la puis réessaie.";
  return (e && e.message) || "Impossible de démarrer l’enregistrement.";
}
async function startRecording() {
  if (recorder && recorder.state === "recording") return;
  try {
    if (window.isSecureContext === false) throw Error("Le micro nécessite une connexion sécurisée (https).");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Error("Ce navigateur ne donne pas accès au micro.");
    if (!window.MediaRecorder) throw Error("L’enregistrement audio n’est pas pris en charge ici. Essaie Chrome à jour.");
    stopPlayback();
    status("audioRecordStatus", "Autorise le micro si le navigateur le demande…");
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    var type = mimeType(), opts = { audioBitsPerSecond: /opus/.test(type) ? 12000 : 24000 };
    if (type) opts.mimeType = type;
    try { recorder = new MediaRecorder(stream, opts); } catch (_) { recorder = new MediaRecorder(stream); }
    chunks = [];
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onerror = function (e) { releaseStream(); setRecordingUi(false); status("audioRecordStatus", "Erreur d’enregistrement" + (e && e.error && e.error.message ? " : " + e.error.message : "") + ".", true); };
    recorder.onstop = finishRecording;
    startedAt = Date.now();
    recorder.start(1000);
    setRecordingUi(true); tick();
    tickTimer = setInterval(tick, 250);
    stopTimer = setTimeout(function () { if (recorder && recorder.state === "recording") recorder.stop(); }, MAX_MS);
    status("audioRecordStatus", "● Enregistrement en cours… arrêt automatique à 6 minutes.");
  } catch (e) { releaseStream(); setRecordingUi(false); status("audioRecordStatus", micError(e), true); }
}
function stopRecording() { if (recorder && recorder.state === "recording") { try { recorder.stop(); } catch (e) { status("audioRecordStatus", e.message, true); } } }
async function finishRecording() {
  var duration = Date.now() - startedAt, type = (recorder && recorder.mimeType) || "audio/webm";
  releaseStream(); setRecordingUi(false);
  var m = $("audioRecordMeter"); if (m) m.style.width = "0%";
  if (!chunks.length) { status("audioRecordStatus", "Aucun son enregistré. Vérifie le micro et réessaie.", true); return; }
  var blob = new Blob(chunks, { type: type }); chunks = [];
  try { await acceptBlob(blob, ($("audioRecordingName") && $("audioRecordingName").value.trim()) || "Enregistrement vocal", Math.min(duration, MAX_MS)); if ($("audioRecordingName")) $("audioRecordingName").value = ""; }
  catch (e) { status("audioRecordStatus", e.message, true); }
}
async function acceptBlob(blob, name, durationMs) {
  if (!blob || !blob.size) throw Error("Fichier audio vide.");
  if (blob.size > MAX_BYTES) throw Error("Le fichier dépasse la limite de 10 Mo.");
  var id = uid(), ext = ((blob.type || "audio/webm").split("/")[1] || "webm").split(";")[0].replace(/[^a-z0-9]/gi, "") || "audio";
  var rec = { id: id, kind: "recording", name: String(name || "Mon audio").slice(0, 100), key: "audios/" + id + "." + ext, mime: blob.type || "audio/webm", size: blob.size, durationMs: durationMs || null, createdAt: new Date().toISOString(), public: false, repeat: 1, synced: false };
  await putBlob(id, blob);
  records.unshift(rec);
  writeLocal(); render();
  status("audioRecordStatus", "Audio enregistré · " + bytes(blob.size) + (durationMs ? " · " + clock(durationMs) : "") + ".");
  if (navigator.onLine && window.auroreAuth && window.auroreAuth.api) { try { await uploadBlob(rec, blob); } catch (_) {} }
  await syncManifest(); render();
}
function importFile() {
  var input = $("audioImport"), f = input && input.files && input.files[0]; if (!f) return;
  if (f.size > MAX_BYTES) { status("audioRecordStatus", "Fichier supérieur à 10 Mo.", true); input.value = ""; return; }
  var url = URL.createObjectURL(f), a = new Audio();
  a.preload = "metadata";
  a.onloadedmetadata = async function () {
    URL.revokeObjectURL(url);
    if (isFinite(a.duration) && a.duration > 360) { status("audioRecordStatus", "Durée maximale dépassée : 6 minutes.", true); return; }
    try { await acceptBlob(f, f.name.replace(/\.[^.]+$/, ""), isFinite(a.duration) ? a.duration * 1000 : null); } catch (e) { status("audioRecordStatus", e.message, true); }
  };
  a.onerror = function () { URL.revokeObjectURL(url); status("audioRecordStatus", "Impossible de lire ce fichier audio.", true); };
  a.src = url; input.value = "";
}

/* ---------- Synthèse vocale : aperçu / ajout ---------- */
async function previewText() {
  var textField = $("audioText");
  var text = textField ? textField.value.trim() : "";
  if (!text) return status("audioTextStatus", "Écris d’abord un texte à lire.", true);
  var rate = Number(($("audioRate") || {}).value) || 1;
  if (estimateDuration(text, rate) > MAX_MS) return status("audioTextStatus", "Le texte dépasse environ six minutes.", true);
  status("audioTextStatus", "Démarrage de la voix du navigateur…");
  /* Annuler la lecture précédente, puis lancer la nouvelle depuis le geste utilisateur. */
  if (window.speechSynthesis) { try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (_) {} }
  stopPlayback();
  var voiceField = $("audioVoice"), languageField = $("audioLanguage");
  var language = languageField ? languageField.value : "fr-FR";
  var r = await speak(text, voiceField ? voiceField.value : "", language, rate);
  /* Certains moteurs Android refusent le profil vocal choisi. Réessayer avec la voix système par défaut. */
  if (!r.ok && r.reason !== "canceled" && voiceField && voiceField.value) {
    status("audioTextStatus", "Le profil vocal a échoué ; nouvel essai avec la voix système…");
    r = await speak(text, "", language, rate);
  }
  if (r.ok) status("audioTextStatus", "Aperçu terminé.");
  else if (r.reason === "canceled") status("audioTextStatus", "Lecture arrêtée.");
  else status("audioTextStatus", speakMessage(r.reason), true);
}
function stopPreview() { if (window.speechSynthesis) speechSynthesis.cancel(); if (activeSpeakEnd) activeSpeakEnd(); status("audioTextStatus", "Lecture arrêtée."); }
async function addText() {
  var text = $("audioText").value.trim(), name = $("audioTextName").value.trim();
  if (!text) return status("audioTextStatus", "Écris d’abord le texte à lire.", true);
  var rate = Number($("audioRate").value) || 1, d = estimateDuration(text, rate);
  if (d > MAX_MS) return status("audioTextStatus", "Le texte dépasse environ six minutes. Raccourcis-le ou crée plusieurs pistes.", true);
  records.unshift({ id: uid(), kind: "speech", name: (name || text.slice(0, 45)).slice(0, 100), text: text, language: $("audioLanguage").value, voice: $("audioVoice").value, rate: rate, durationMs: d, createdAt: new Date().toISOString(), public: false, repeat: 1 });
  writeLocal(); render();
  $("audioText").value = ""; $("audioTextName").value = "";
  status("audioTextStatus", "Texte ajouté à ta bibliothèque audio.");
  await syncManifest();
}

/* ---------- Lecteur ---------- */
function cleanupAudio() { if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = null; } playerAudio = null; }
function stopPlayback() {
  token++;
  if (playerAudio) { try { playerAudio.pause(); } catch (_) {} playerAudio.onended = null; playerAudio.onerror = null; }
  cleanupAudio();
  if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (_) {} }
  if (activeSpeakEnd) activeSpeakEnd();
  playing = false; paused = false;
}
function selectedTracks() {
  if (!current) return [];
  if (current.type === "sequence") return current.item.tracks.map(function (t) { return { record: records.find(function (r) { return r.id === t.id; }), repeat: Math.max(1, Math.min(20, Number(t.repeat) || 1)), rate: Math.max(0.6, Math.min(4, Number(t.rate) || 1)) }; }).filter(function (t) { return t.record; });
  return [{ record: current.item, repeat: Math.max(1, Math.min(20, Number(current.item.repeat) || 1)) }];
}
function showPlayer() {
  var p = $("audioPlayerPanel"); if (!p || !current) return;
  p.hidden = false;
  var tracks = selectedTracks(), track = tracks[currentTrack];
  $("playerKind").textContent = current.type === "sequence" ? "SÉQUENCE AUDIO" : "LECTEUR AUDIO";
  $("playerTitle").textContent = current.item.name;
  $("playerTrackLabel").textContent = "Piste " + (Math.min(currentTrack, tracks.length - 1) + 1) + " / " + tracks.length + (current.type === "sequence" ? " · Séquence " + sequenceRound + "/" + (Number($("playerSequenceRepeat").value)||1) : "") + (statusLine ? " · " + statusLine : "");
  var box = $("playerTrackContent"); box.textContent = "";
  if (track) {
    var main = document.createElement("div"); main.className = "audio-item-main";
    var t = document.createElement("strong"); t.textContent = track.record.name;
    var s = document.createElement("small"); s.textContent = (track.record.kind === "speech" ? "Texte lu" : "Enregistrement") + " · " + track.repeat + " lecture(s)";
    main.append(t, s); box.append(main);
    $("playerRepeat").value = String(track.repeat || 1);
  }
  $("playerRepeat").disabled = false;
  $("playerRate").value = String(track && track.rate || current.rate || 1);
  $("playerSequenceRepeat").value = String(current.sequenceRepeat || 1);
  $("playerRateLabel").textContent = Number($("playerRate").value).toFixed(1) + "×";
  $("playerToggle").textContent = playing ? (paused ? "▶ Reprendre" : "Ⅱ Pause") : "▶ Lire";
}
async function loadBlob(rec) {
  var c = await getBlob(rec.id), b = c && c.blob;
  if (!b && navigator.onLine && rec.key) { var r = await api("/api/storage?key=" + encodeURIComponent(rec.key), { method: "GET" }); if (!r.ok) throw Error("Audio cloud indisponible (" + r.status + ")."); b = await r.blob(); await putBlob(rec.id, b); }
  if (!b) throw Error("Audio introuvable sur cet appareil. Connecte-toi pour le télécharger.");
  return b;
}
async function playBlob(rec, rate, my) {
  try {
    var blob = await loadBlob(rec);
    if (my !== token) return false;
    return await new Promise(function (resolve) {
      playerUrl = URL.createObjectURL(blob);
      var a = new Audio(playerUrl); playerAudio = a; a.playbackRate = rate;
      a.onended = function () { cleanupAudio(); resolve(true); };
      a.onerror = function () { cleanupAudio(); status("audioAccountStatus", "Lecture impossible : format audio non pris en charge.", true); resolve(false); };
      var p = a.play(); if (p && p.catch) p.catch(function (e) { cleanupAudio(); status("audioAccountStatus", "Lecture bloquée : " + (e && e.message ? e.message : "autorisation requise") + ". Appuie de nouveau sur Lire.", true); resolve(false); });
    });
  } catch (e) { status("audioAccountStatus", e.message, true); return false; }
}
async function playOnce(rec, rate, my) {
  if (rec.kind === "speech") {
    var r = await speak(rec.text, rec.voice, rec.language, rate * (rec.rate || 1));
    if (my !== token) return false;
    if (!r.ok && r.reason !== "canceled") status("audioAccountStatus", speakMessage(r.reason), true);
    return r.ok;
  }
  return playBlob(rec, rate, my);
}
async function playTrack() {
  var tracks = selectedTracks(); if (!tracks.length) return;
  if (currentTrack >= tracks.length) currentTrack = 0;
  var t = tracks[currentTrack], my = ++token;
  playing = true; paused = false; statusLine = ""; showPlayer();
  for (var i = 0; i < t.repeat; i++) {
    if (my !== token) return;
    statusLine = "lecture " + (i + 1) + " / " + t.repeat; showPlayer();
    var rate = Number($("playerRate").value) || t.rate || 1;
    var ok = await playOnce(t.record, rate, my);
    if (my !== token) return;
    if (!ok) { playing = false; paused = false; statusLine = ""; showPlayer(); return; }
    if (i < t.repeat - 1) await sleep(400);
  }
  if (my !== token) return;
  if (currentTrack < tracks.length - 1) { currentTrack++; playTrack(); }
  else if (current.type === "sequence" && sequenceRound < Math.max(1, Math.min(20, Number(current.sequenceRepeat) || 1))) { sequenceRound++; currentTrack = 0; playTrack(); }
  else { playing = false; paused = false; currentTrack = 0; sequenceRound = 1; statusLine = "terminé"; showPlayer(); }
}
function openPlayer(type, item) { stopPlayback(); current = { type: type, item: item, rate: 1, sequenceRepeat: Math.max(1, Math.min(20, Number(item.sequenceRepeat) || 1)) }; currentTrack = 0; sequenceRound = 1; statusLine = "Prêt à lire"; showPlayer(); }
function togglePlay() {
  if (playing && !paused) { paused = true; if (playerAudio) playerAudio.pause(); if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.pause(); showPlayer(); return; }
  if (playing && paused) { paused = false; if (playerAudio) playerAudio.play(); if (window.speechSynthesis && speechSynthesis.paused) speechSynthesis.resume(); showPlayer(); return; }
  playTrack();
}

/* ---------- Séquences ---------- */
function refreshBadges() {
  var box = $("sequenceBuilder"); if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll("[data-order-for]"), function (b) { var i = seqPick.indexOf(b.getAttribute("data-order-for")); b.textContent = i >= 0 ? String(i + 1) : ""; b.hidden = i < 0; });
}
function renderSequenceBuilder() {
  var box = $("sequenceBuilder"); if (!box) return; box.textContent = "";
  var list = records.filter(function (r) { return r.kind === "recording" || r.kind === "speech"; });
  seqPick = seqPick.filter(function (id) { return list.some(function (r) { return r.id === id; }); });
  if (!list.length) { var e = document.createElement("p"); e.className = "audio-empty"; e.textContent = "Ajoute d’abord des audios à ta bibliothèque."; box.append(e); return; }
  list.forEach(function (r) {
    var row = document.createElement("label"); row.className = "draft-card audio-sequence-track";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.value = r.id; cb.checked = seqPick.indexOf(r.id) >= 0; cb.setAttribute("aria-label", "Ajouter " + r.name);
    cb.addEventListener("change", function () { var i = seqPick.indexOf(r.id); if (cb.checked && i < 0) seqPick.push(r.id); if (!cb.checked && i >= 0) seqPick.splice(i, 1); refreshBadges(); });
    var badge = document.createElement("span"); badge.className = "audio-order"; badge.setAttribute("data-order-for", r.id); badge.hidden = true;
    var main = document.createElement("span"); main.className = "audio-item-main";
    var strong = document.createElement("strong"); strong.textContent = r.name;
    var small = document.createElement("small"); small.textContent = r.kind === "speech" ? "Texte lu" : "Enregistrement" + (r.size ? " · " + bytes(r.size) : "");
    main.append(strong, small);
    var settings = document.createElement("span"); settings.className = "audio-track-settings";
    var label = document.createElement("span"); label.textContent = "Répétitions";
    var input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "20"; input.value = "1"; input.setAttribute("data-repeat-for", r.id); input.setAttribute("aria-label", "Nombre de répétitions pour " + r.name);
    settings.append(label, input);
    row.append(cb, badge, main, settings); box.append(row);
  });
  refreshBadges();
}
async function saveSequence() {
  var name = $("sequenceName").value.trim();
  if (!name) return status("sequenceStatus", "Donne un nom à la séquence.", true);
  if (!seqPick.length) return status("sequenceStatus", "Coche au moins un audio (l’ordre des coches = l’ordre de lecture).", true);
  var tracks = seqPick.map(function (id) { var inp = $("sequenceBuilder").querySelector('[data-repeat-for="' + id + '"]'); return { id: id, repeat: Math.max(1, Math.min(20, Number(inp && inp.value) || 1)) }; });
  sequences.unshift({ id: uid(), name: name.slice(0, 100), tracks: tracks.map(function(t){return {id:t.id,repeat:t.repeat,rate:1};}), createdAt: new Date().toISOString(), public: false });
  seqPick = []; $("sequenceName").value = "";
  writeLocal(); render();
  status("sequenceStatus", "Séquence enregistrée.");
  await syncManifest();
}

/* ---------- Bibliothèque ---------- */
function render() {
  var box = $("audioLibraryList"); if (!box) return; box.textContent = "";
  if (!sequences.length) {
    var e = document.createElement("p"); e.className = "audio-empty";
    e.textContent = document.body.dataset.page === "audio-sequences" ? "Aucune séquence enregistrée pour le moment. Appuie sur « Ajouter un audio » pour créer tes pistes, puis compose une séquence." : "Aucune séquence enregistrée pour le moment. Crée une séquence à partir de tes audios ci-dessus.";
    box.append(e); renderSequenceBuilder(); return;
  }
  sequences.forEach(function (seq) {
    var row = document.createElement("article"); row.className = "draft-card audio-library-item audio-sequence-card";
    var main = document.createElement("div"); main.className = "audio-item-main";
    var title = document.createElement("strong"); title.textContent = seq.name;
    var meta = document.createElement("small"); meta.textContent = seq.tracks.length + " piste(s) · séquence de révision · " + new Date(seq.createdAt).toLocaleDateString("fr-FR");
    main.append(title, meta);
    var actions = document.createElement("div"); actions.className = "audio-item-actions";
    var open = document.createElement("button"); open.className = "primary-btn"; open.type = "button"; open.textContent = "Ouvrir la séquence"; open.addEventListener("click", function () { openPlayer("sequence", seq); });
    actions.append(open);
    var share = document.createElement("button"); share.className = "secondary-btn"; share.type = "button"; share.textContent = "Partager au groupe"; share.setAttribute("data-share-audio-sequence", seq.id); share.setAttribute("data-share-audio-title", seq.name); actions.append(share);
    var publish = document.createElement("button"); publish.className = "secondary-btn"; publish.type = "button"; publish.textContent = "Publier"; publish.setAttribute("data-publish-audio-sequence", seq.id); actions.append(publish);
    row.append(main, actions); box.append(row);
  });
  renderSequenceBuilder();
}
async function downloadAudio(r) {
  try {
    var blob, ext = ".webm";
    if (r.kind === "speech") { blob = new Blob([JSON.stringify({ format: "Aurore audio text", id: r.id, name: r.name, text: r.text, language: r.language, voice: r.voice || "", rate: r.rate || 1, createdAt: r.createdAt }, null, 2)], { type: "application/json;charset=utf-8" }); ext = ".json"; }
    else { blob = await loadBlob(r); var mt = r.mime || blob.type || ""; ext = mt.indexOf("ogg") >= 0 ? ".ogg" : mt.indexOf("mp4") >= 0 ? ".m4a" : mt.indexOf("mpeg") >= 0 ? ".mp3" : ".webm"; }
    var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = r.name.replace(/[\\\/:*?"<>|]/g, "-") + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  } catch (e) { status("audioAccountStatus", e.message, true); }
}
function summary() { return records.length + " audio(s) · " + sequences.length + " séquence(s). Tout reste accessible hors ligne sur cet appareil."; }
// Interface limitée au partage : les blobs restent dans IndexedDB et ne sont jamais copiés en base64 dans le manifeste.
window.auroreAudioShare = {
  list: function () { return { records: records.map(publicMeta), sequences: sequences.map(function (s) { return JSON.parse(JSON.stringify(s)); }) }; },
  getBlob: async function (recordId) { var record = records.find(function (r) { return String(r.id) === String(recordId); }); if (!record) throw Error("Piste audio introuvable."); return { record: publicMeta(record), blob: record.kind === "speech" ? null : await loadBlob(record) }; }
};

/* ---------- Initialisation ---------- */
function onOnline() { syncPending().then(loadCloudWithRetry).then(function () { render(); }).catch(function () {}); }
function bind() {
  on("audioRecordStart", "click", startRecording);
  on("audioRecordStop", "click", stopRecording);
  on("audioImport", "change", importFile);
  on("audioRate", "input", function () { $("audioRateLabel").textContent = Number(this.value).toFixed(1) + "×"; });
  on("audioTextPreview", "click", previewText);
  on("audioTextStop", "click", stopPreview);
  on("audioTextSave", "click", addText);
  on("playerToggle", "click", togglePlay);
  on("playerNext", "click", function () { var n = selectedTracks().length; stopPlayback(); if (currentTrack < n - 1) currentTrack++; statusLine = ""; showPlayer(); playTrack(); });
  on("playerPrevious", "click", function () { stopPlayback(); currentTrack = Math.max(0, currentTrack - 1); statusLine = ""; showPlayer(); playTrack(); });
  on("playerClose", "click", function () { stopPlayback(); $("audioPlayerPanel").hidden = true; });
  on("playerRate", "input", function () { var v = Number(this.value); $("playerRateLabel").textContent = v.toFixed(1) + "×"; if (current) { current.rate = v; var t=current.item.tracks && current.item.tracks[currentTrack]; if(current.type==="sequence" && t) { t.rate=Math.max(0.6,Math.min(4,v)); writeLocal(); } } if (playerAudio) playerAudio.playbackRate = v; });
  on("playerRepeat", "change", function () { if (!current) return; var value=Math.max(1,Math.min(20,Number(this.value)||1)); if(current.type==="sequence" && current.item.tracks[currentTrack]) current.item.tracks[currentTrack].repeat=value; else if(current.type==="audio") current.item.repeat=value; writeLocal(); showPlayer(); });
  on("playerSequenceRepeat", "change", function () { if (!current || current.type!=="sequence") return; current.sequenceRepeat=Math.max(1,Math.min(20,Number(this.value)||1)); if(current.item) current.item.sequenceRepeat=current.sequenceRepeat; sequenceRound=1; showPlayer(); writeLocal(); });
  on("sequenceSave", "click", saveSequence);
  on("audioRefresh", "click", async function () { await loadCloudWithRetry(); render(); status("audioAccountStatus", "Bibliothèque actualisée · " + (document.body.dataset.page === "audio-sequences" ? sequences.length + " séquence(s) enregistrée(s)." : summary())); });
  window.addEventListener("online", onOnline);
  if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = fillVoices; }
}
window.__auroreAudioCleanup = function () {
  stopPlayback();
  if (recorder && recorder.state === "recording") { recorder.onstop = null; try { recorder.stop(); } catch (_) {} }
  releaseStream();
  window.removeEventListener("online", onOnline);
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged === fillVoices) speechSynthesis.onvoiceschanged = null;
};

/* Les pistes MP3 créées dans la fenêtre Cloudflare rejoignent la bibliothèque native. */
window.addEventListener("aurore-neural-audio-created", function (event) {
  var record = event && event.detail && event.detail.record;
  if (!record || !record.id || records.some(function (item) { return item.id === record.id; })) return;
  records.unshift(record);
  writeLocal();
  render();
  status("audioTextStatus", "Voix alternative ajoutée à ta bibliothèque audio.");
  syncManifest().then(render).catch(function () {
    status("audioAccountStatus", "Audio conservé sur cet appareil ; synchronisation cloud à réessayer.", true);
  });
});
function init() {
  var local = readLocal(); records = local.records; sequences = local.sequences;
  $("audioPlayerPanel").hidden = true;
  fillVoices(); initVoicePicker(); setTimeout(fillVoices, 600); setTimeout(fillVoices, 2000);
  bind(); render();
  var accountSummary = document.body.dataset.page === "audio-sequences" ? sequences.length + " séquence(s) enregistrée(s)." : summary();
  status("audioAccountStatus", accountSummary);
  loadCloudWithRetry().then(function () { render(); var updatedSummary = document.body.dataset.page === "audio-sequences" ? sequences.length + " séquence(s) enregistrée(s)." : summary(); status("audioAccountStatus", updatedSummary); }).catch(function () {});
  syncPending();
}
try { init(); } catch (e) { status("audioAccountStatus", "Erreur d’initialisation : " + e.message, true); }
})();
