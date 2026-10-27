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
  function isBalancedMath(value) {
    var text = String(value || ""), braces = 0, escaped = false, stack = [], matches = text.match(/\\\(|\\\)|\\\[|\\\]/g) || [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "{" && !escaped) braces++;
      if (ch === "}" && !escaped && --braces < 0) return false;
      escaped = ch === "\\" && !escaped;
      if (ch !== "\\") escaped = false;
    }
    if (braces !== 0) return false;
    for (var j = 0; j < matches.length; j++) {
      if (matches[j] === "\\(" || matches[j] === "\\[") stack.push(matches[j] === "\\(" ? "\\)" : "\\]");
      else if (stack.pop() !== matches[j]) return false;
    }
    return stack.length === 0;
  }
  function normalizeQcmMath(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text || /\\\(|\\\[|\$\$|(^|[^$])\$[^$\n]+\$(?!\$)/.test(text)) return text;
    if (/\b(?:quelle|quel|calculer|déterminer|soit|résoudre|pourquoi|combien|choisir|parmi|fonction|dérivée|donner|estimer|vaut|est égale|est égal|la valeur|la dérivée|on considère)\b/i.test(text)) return text;
    if (!/\\[a-zA-Z]+|[_^{}=<>≤≥∑∫√±×÷]/.test(text)) return text;
    return /\n|\\begin\s*\{(?:aligned|cases|matrix|pmatrix|bmatrix|array|gathered)\}/.test(text) ? "\\[\n" + text + "\n\\]" : "\\(" + text + "\\)";
  }
  function makeQcm(action, requestText) {
    var countMatch = String(requestText || "").match(/\b(\d{1,2})\s*(?:qcm\b|questions?\b|questionnaires?\b|quiz\b)/i), desiredCount = countMatch ? Math.min(30, Math.max(1, Number(countMatch[1]) || 1)) : 0;
    var generated = Array.isArray(action.questions) ? action.questions : [];
    if (desiredCount && generated.length !== desiredCount) throw new Error("Aurora a généré " + generated.length + " question(s) sur les " + desiredCount + " demandées. Aucune question n’a été transférée : réessaie avec moins de questions ou un cours plus précis.");
    var questions = generated.slice(0, desiredCount || 30);
    if (!questions.length) throw new Error("Aurora n’a généré aucune question de QCM.");
    var q = { id: uid("qcm"), title: String(action.title || "QCM Aurora").trim().slice(0, 120) || "QCM Aurora", questions: [], attempts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    function optionText(option) { return String(typeof option === "string" ? option : option && (option.text || option.label || option.value) || "").trim(); }
    function correctIndex(item, options) {
      var marked = [];
      (Array.isArray(item.options) ? item.options : []).forEach(function (option, index) { if (option && typeof option === "object" && (option.isCorrect === true || option.correct === true || option.is_correct === true)) marked.push(index); });
      if (marked.length === 1) return marked[0];
      if (marked.length > 1) return -1;
      var candidate = item.correctIndex;
      if (candidate == null) candidate = item.answerIndex;
      if (candidate == null) candidate = item.correctAnswerIndex;
      if (candidate == null) candidate = item.correctOptionIndex;
      if (candidate == null) candidate = item.correctAnswer;
      if (candidate == null) candidate = item.correctOption;
      if (candidate == null) candidate = item.answer;
      if (candidate == null) candidate = item.correct;
      if (typeof candidate === "string") {
        var value = candidate.trim(), letter = value.match(/^(?:option|choix)?\s*([A-F])(?:\s*[).:\-]|\s*$)/i), number = value.match(/^(?:option|choix)?\s*([1-6])(?:\s*[).:\-]|\s*$)/i);
        if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
        if (number) return Number(number[1]) - 1;
        var normalizedAnswer = normalizeQcmMath(value).toLocaleLowerCase();
        var exact = options.findIndex(function (option) { return option.toLocaleLowerCase() === normalizedAnswer || option.toLocaleLowerCase() === value.toLocaleLowerCase(); });
        if (exact >= 0) return exact;
      }
      if (candidate === true && options.length === 2) return 0;
      return Number(candidate);
    }
    questions.forEach(function (item, index) {
      item = item && typeof item === "object" ? item : {};
      var rawOptions = Array.isArray(item.options) ? item.options : [];
      var opts = rawOptions.map(optionText).map(normalizeQcmMath);
      var correct = correctIndex(item, opts);
      var prompt = normalizeQcmMath(item.prompt || item.question || item.statement || "");
      var explanation = normalizeQcmMath(item.explanation || item.rationale || item.justification || "");
      if (!prompt) throw new Error("La question " + (index + 1) + " est vide. Aurora doit fournir un énoncé pour chaque question.");
      if (opts.length < 2 || opts.length > 6 || opts.some(function (option) { return !option; })) throw new Error("La question " + (index + 1) + " doit avoir au moins deux choix non vides.");
      if (new Set(opts.map(function (option) { return option.toLocaleLowerCase(); })).size !== opts.length) throw new Error("La question " + (index + 1) + " contient des choix répétés. Relance la génération pour éviter un QCM ambigu.");
      if (!Number.isInteger(correct) || correct < 0 || correct >= opts.length) throw new Error("La question " + (index + 1) + " n’a pas de bonne réponse clairement identifiable. Rien n’a été transféré : relance la génération.");
      if (!explanation) throw new Error("Il manque l’explication de la question " + (index + 1) + ". Demande à Aurora de générer des explications pour toutes les réponses.");
      if (![prompt].concat(opts, [explanation]).every(isBalancedMath)) throw new Error("Une formule LaTeX de la question " + (index + 1) + " a des accolades ou des délimiteurs incomplets. Aucune donnée n’a été transférée ; relance la génération.");
      var builtOptions = opts.map(function (text) { return { id: uid("option"), text: text }; });
      q.questions.push({ id: uid("question"), prompt: prompt, options: builtOptions, correctOptionId: builtOptions[correct].id, explanation: explanation });
    });
    localStorage.setItem("aurore-qcm-editor-draft-v1", JSON.stringify({ deckId: null, q: q, at: 0, updatedAt: Date.now() }));
    try { sessionStorage.setItem("aurore-aurora-created-notice-v1", "QCM préparé : " + q.questions.length + " questions avec une bonne réponse et une explication chacune. Vérifie-les puis enregistre le QCM."); } catch (_) {}
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
    say("Texte généré. Ajout de la piste à la bibliothèque audio…"); saveButton.click();
    window.setTimeout(function () { var result = document.getElementById("audioTextStatus"); if (result && result.textContent) say(result.textContent, /impossible|erreur|échec/i.test(result.textContent)); else say("Le texte est rempli. Vérifie le statut du bouton « Ajouter » dans le créateur audio."); }, 900);
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
          ? "Tu dois remplir le créateur de QCM Aurore Mémoire. Génère EXACTEMENT " + requestedQcmCount + " questions sur le sujet demandé, chacune avec quatre choix distincts, non vides, sans doublons, une seule bonne réponse et une explication pédagogique non vide. Le champ correctIndex est OBLIGATOIRE, entier de 0 à 3, indexé à partir de zéro ; il doit désigner précisément l’unique bonne option. Vérifie mentalement chaque réponse avant de produire le JSON. N’utilise jamais une réponse absente, plusieurs réponses correctes, un index hors limites ou un champ réponse placé seulement dans reply. Pour les mathématiques, écris chaque expression dans \\( ... \\) et chaque formule sur plusieurs lignes dans \\[ ... \\]. Utilise uniquement une syntaxe LaTeX compatible KaTeX, équilibre toutes les accolades et les délimiteurs, n’écris jamais de LaTeX brut sans délimiteur, n’utilise pas de blocs Markdown ou de dollars. Les commandes LaTeX dans les chaînes JSON doivent avoir leurs antislashs échappés (\\). Ne mets pas tout un énoncé en mode math si une phrase française le précède : délimite seulement la formule. Retourne exactement " + requestedQcmCount + " questions, ni plus ni moins. Retourne uniquement un JSON {\"reply\":\"QCM prêt à vérifier\",\"action\":{\"type\":\"create_qcm\",\"title\":\"...\",\"questions\":[{\"prompt\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctIndex\":0,\"explanation\":\"...\"}]}}. Ne demande aucune confirmation et ne renvoie pas une discussion. Demande/cours :\n"
          : "Tu dois remplir le créateur audio Aurore Mémoire. Prépare un script oral naturel en français, fidèle au cours, sans tableaux, sous 600 mots. Retourne uniquement un JSON {\"reply\":\"Audio prêt\",\"action\":{\"type\":\"create_audio\",\"title\":\"...\",\"text\":\"...\",\"language\":\"fr-FR\",\"rate\":1}}. Ne demande aucune confirmation et ne renvoie pas une discussion. Demande/cours :\n";
      var response = await auth.client.functions.invoke("aurore-grok", { body: { messages: [{ role: "user", content: instruction + value }], appContext: { task: "direct-create", kind: kind, requestedQcmCount: kind === "qcm" ? requestedQcmCount : undefined, mathQcm: kind === "qcm" ? /\b(math[eé]matiques?|maths?|alg[eè]bre|d[eé]riv[eé]es?|int[eé]grales?|[eé]quations?|fonctions?|g[eé]om[eé]trie|trigonom[eé]trie|limites?|probabilit[eé]s?|matrices?|vecteurs?|calcul diff[eé]rentiel)\b/i.test(value) : undefined } } });
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
