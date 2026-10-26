(function () {
  "use strict";
  var panel = document.getElementById("auroraPagePromptPanel");
  if (!panel) return;
  var input = document.getElementById("auroraPagePrompt"), button = document.getElementById("auroraPagePromptSubmit"), status = document.getElementById("auroraPagePromptStatus"), kind = panel.getAttribute("data-aurora-kind") || "study";
  var STORE = "aurore-memory-cards-v1";
  function say(message, error) { status.textContent = message; status.setAttribute("data-state", error ? "error" : "ok"); }
  function uid(prefix) { return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
  function parseAction(raw) {
    var value = String(raw || "").trim();
    try { var parsed = JSON.parse(value); if (parsed && typeof parsed === "object") return parsed; } catch (_) {}
    var match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match) { try { return JSON.parse(match[1]); } catch (_) {} }
    throw new Error("Aurora a répondu, mais le contenu généré n’est pas structuré correctement. Réessaie avec une demande plus courte.");
  }
  function state() { var d; try { d = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (_) { d = {}; } if (!d || typeof d !== "object") d = {}; if (!Array.isArray(d.cards)) d.cards = []; if (!Array.isArray(d.qcms)) d.qcms = []; return d; }
  function persist(d) { localStorage.setItem(STORE, JSON.stringify(d)); if (window.auroreMemoryCloudSync && typeof window.auroreMemoryCloudSync.schedule === "function") window.auroreMemoryCloudSync.schedule(d); }
  function makeMemory(action) {
    var title = String(action.title || "Mémoire Aurora").trim().slice(0, 120) || "Mémoire Aurora";
    var chunks = (Array.isArray(action.chunks) ? action.chunks : Array.isArray(action.passages) ? action.passages : []).map(function (c) { return String(typeof c === "string" ? c : c && (c.text || c.content || c.back) || "").trim(); }).filter(Boolean).slice(0, 30);
    if (!chunks.length) throw new Error("Aurora n’a généré aucun paragraphe exploitable.");
    var draft = { version: 1, deck: "", title: title, source: chunks.join("\n\n"), chunks: chunks.map(function (back) { return { id: null, back: back, mode: "Première lettre", extracted: false }; }), selectionCutUsed: false, pendingSelection: null, updatedAt: Date.now() };
    localStorage.setItem("aurore-memory-workspace-draft-v1:__nouvelle_memoire__", JSON.stringify(draft));
    try { sessionStorage.setItem("aurore-aurora-created-notice-v1", "Mémoire préparée : " + chunks.length + " paragraphes sont déjà remplis. Vérifie-les puis appuie sur « Enregistrer la mémoire »."); } catch (_) {}
    location.reload();
  }
  function makeQcm(action, requestText) {
    var countMatch = String(requestText || "").match(/\b(\d{1,2})\s*(?:qcm\b|questions?\b|questionnaires?\b|quiz\b)/i), desiredCount = countMatch ? Math.min(30, Math.max(1, Number(countMatch[1]) || 1)) : 0;
    var generated = Array.isArray(action.questions) ? action.questions : [];
    if (desiredCount && generated.length < desiredCount) throw new Error("Aurora n’a généré que " + generated.length + " questions sur les " + desiredCount + " demandées. Réessaie avec un sujet plus précis.");
    var questions = generated.slice(0, desiredCount || 30);
    if (!questions.length) throw new Error("Aurora n’a généré aucune question de QCM.");
    var q = { id: uid("qcm"), title: String(action.title || "QCM Aurora").trim().slice(0, 120) || "QCM Aurora", questions: [], attempts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    questions.forEach(function (item) {
      var opts = (Array.isArray(item.options) ? item.options : []).map(function (option) { return String(typeof option === "string" ? option : option && (option.text || option.label) || "").trim(); }).filter(Boolean).slice(0, 6);
      var correct = Number(item.correctIndex);
      if (opts.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= opts.length) throw new Error("Une question générée ne contient pas de bonne réponse valide. Relance la création pour éviter un QCM incomplet.");
      q.questions.push({ id: uid("question"), prompt: String(item.prompt || item.question || "").trim(), options: opts.map(function (text) { return { id: uid("option"), text: text }; }), correctOptionId: "", explanation: String(item.explanation || "").trim() });
      q.questions[q.questions.length - 1].correctOptionId = q.questions[q.questions.length - 1].options[correct].id;
      if (!q.questions[q.questions.length - 1].prompt) throw new Error("Une question générée est vide. Relance la création.");
    });
    localStorage.setItem("aurore-qcm-editor-draft-v1", JSON.stringify({ deckId: null, q: q, at: 0, updatedAt: Date.now() }));
    try { sessionStorage.setItem("aurore-aurora-created-notice-v1", "QCM préparé : " + q.questions.length + " questions, réponses et explications sont remplies. Vérifie-les puis enregistre le QCM."); } catch (_) {}
    window.location.href = location.pathname + "?fromAurora=" + encodeURIComponent(q.id) + location.hash;
  }
  function makeAudio(action) {
    var title = String(action.title || action.name || "Audio Aurora").trim().slice(0, 100) || "Audio Aurora", text = String(action.text || action.content || "").trim();
    if (!text) throw new Error("Aurora n’a généré aucun texte à lire.");
    var words = text.split(/\s+/).filter(Boolean).length;
    if (words > 1500) throw new Error("Le texte généré dépasse la durée prévue. Demande à Aurora une version de dix minutes maximum.");
    var nameField = document.getElementById("audioTextName"), textField = document.getElementById("audioText"), saveButton = document.getElementById("audioTextSave");
    if (!nameField || !textField || !saveButton) throw new Error("Le créateur audio n’est pas prêt sur cette page.");
    nameField.value = title; textField.value = text; textField.dispatchEvent(new Event("input", { bubbles: true }));
    say("Le texte est prêt dans le champ. Relis-le, règle la voix et la vitesse, puis appuie toi-même sur « Ajouter » pour enregistrer la piste.");
    textField.focus();
    textField.scrollIntoView({ behavior: "smooth", block: "center" });
    saveButton.removeAttribute("aria-busy");
  }
  function apply(action) {
    if (!action || typeof action !== "object") throw new Error("Aurora n’a pas renvoyé d’action de création. Vérifie la demande puis réessaie.");
    if (kind === "memory" && action.type === "create_memory") return makeMemory(action);
    if (kind === "qcm" && action.type === "create_qcm") return makeQcm(action, input.value);
    if (kind === "audio" && action.type === "create_audio") return makeAudio(action);
    throw new Error("Aurora a renvoyé un format différent de celui attendu pour cette page. Aucune donnée n’a été enregistrée.");
  }
  button.addEventListener("click", async function () {
    var value = String(input.value || "").trim();
    if (!value) { say("Écris ta demande ou colle ton cours avant de continuer.", true); input.focus(); return; }
    button.disabled = true; var oldLabel = button.textContent; button.textContent = "Génération en cours…";
    say("Aurora génère le contenu directement dans ce créateur. Ne ferme pas cette page…");
    try {
      if (!window.auroreAuthReady) throw new Error("Le service Aurore ID n’est pas prêt. Actualise la page puis réessaie.");
      var auth = await window.auroreAuthReady, session = await auth.getSession();
      if (!session) throw new Error("Connecte-toi avec Aurore ID avant de créer du contenu.");
      var qcmCountMatch = value.match(/\b(\d{1,2})\s*(?:qcm\b|questions?\b|questionnaires?\b|quiz\b)/i), requestedQcmCount = qcmCountMatch ? Math.min(30, Math.max(1, Number(qcmCountMatch[1]) || 1)) : 10;
      var instruction = kind === "memory"
        ? "Tu dois créer une mémoire pour l’éditeur Aurore Mémoire. Génère un titre et entre 4 et 16 passages courts, exacts et ordonnés. Retourne uniquement un JSON {\"reply\":\"Mémoire prête\",\"action\":{\"type\":\"create_memory\",\"title\":\"...\",\"chunks\":[\"passage 1\",\"passage 2\"]}}. Ne demande aucune confirmation et ne renvoie pas une discussion. Demande/cours :\n"
        : kind === "qcm"
          ? "Tu dois remplir le créateur de QCM Aurore Mémoire. Génère EXACTEMENT " + requestedQcmCount + " questions sur le sujet demandé, chacune avec quatre choix distincts et plausibles, une seule bonne réponse et une explication utile. correctIndex est un entier commençant à zéro. Le tableau questions doit contenir exactement " + requestedQcmCount + " éléments, ni plus ni moins. Retourne uniquement un JSON {\"reply\":\"QCM prêt à vérifier\",\"action\":{\"type\":\"create_qcm\",\"title\":\"...\",\"questions\":[{\"prompt\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctIndex\":0,\"explanation\":\"...\"}]}}. Ne demande aucune confirmation et ne renvoie pas une discussion. Demande/cours :\n"
          : "Tu dois remplir le créateur audio Aurore Mémoire. Prépare un script oral naturel en français, fidèle au cours, sans tableaux, sous 600 mots. Retourne uniquement un JSON {\"reply\":\"Audio prêt\",\"action\":{\"type\":\"create_audio\",\"title\":\"...\",\"text\":\"...\",\"language\":\"fr-FR\",\"rate\":1}}. Ne demande aucune confirmation et ne renvoie pas une discussion. Demande/cours :\n";
      var response = await auth.client.functions.invoke("aurore-grok", { body: { messages: [{ role: "user", content: instruction + value }], appContext: { task: "direct-create", kind: kind } } });
      if (response.error) {
        var detail = response.data && (response.data.details || response.data.error);
        try { var context = response.error.context; if (!detail && context && typeof context.clone === "function") { var errorBody = await context.clone().json(); detail = errorBody && (errorBody.details || errorBody.error); } } catch (_) {}
        throw new Error(detail || response.error.message || "Le service Aurora a échoué.");
      }
      var envelope = response.data || {}, parsed = parseAction(envelope.reply || ""), action = parsed.action || parsed;
      apply(action, value);
    } catch (error) {
      var message = error && error.message ? String(error.message) : "La création a échoué. Aucun contenu n’a été enregistré.";
      if (/failed to send a request to the edge function|failed to fetch|networkerror|load failed/i.test(message)) message = "Connexion à Aurora impossible depuis cette origine. Vérifie la connexion Internet et utilise le site officiel ou une version à jour de l’application. Le serveur doit autoriser l’origine de ce navigateur ou de l’application Android.";
      say(message, true);
      button.disabled = false; button.textContent = oldLabel;
    }
  });
  try { var notice = sessionStorage.getItem("aurore-aurora-created-notice-v1"); if (notice) { sessionStorage.removeItem("aurore-aurora-created-notice-v1"); say(notice); } } catch (_) {}
})();
