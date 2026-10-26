import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const allowedOrigins = new Set([
  "https://aurore-memories-mu.vercel.app",
  "https://aurore-memories-aurore9.vercel.app",
  // Capacitor WebView origins (Android uses https://localhost in this app).
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
]);
function isAllowedOrigin(origin: string) {
  return allowedOrigins.has(origin) || /^https:\/\/aurore-memories-[a-z0-9-]+-aurore9\.vercel\.app$/i.test(origin);
}
function corsHeaders(origin: string | null) { const allowed = origin && isAllowedOrigin(origin) ? origin : "https://aurore-memories-mu.vercel.app"; return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }; }
function json(body: unknown, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" } }); }
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);
  if (origin && !isAllowedOrigin(origin)) return json({ error: "Origine non autorisée." }, 403, origin);
  const cloudflareToken = Deno.env.get("CLOUDFLARE_API_TOKEN"), cloudflareAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID"), supabaseUrl = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authHeader = req.headers.get("authorization") || "", token = authHeader.replace(/^Bearer\s+/i, "");
  if (!cloudflareToken || !cloudflareAccountId) return json({ error: "Les identifiants Workers AI ne sont pas configurés côté serveur." }, 503, origin);
  if (!supabaseUrl || !anonKey || !token || token === authHeader) return json({ error: "Connexion Aurore ID requise." }, 401, origin);
  const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!authResp.ok) return json({ error: "Session expirée ou invalide. Reconnectez-vous avec Aurore ID." }, 401, origin);
  const user = await authResp.json();
  let body: { messages?: unknown; appContext?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Corps JSON invalide." }, 400, origin); }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 30) return json({ error: "La conversation doit contenir entre 1 et 30 messages." }, 400, origin);
  const messages = body.messages.filter((m: any) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 12000);
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "Dernier message utilisateur manquant ou invalide." }, 400, origin);
  const appContext = body.appContext && typeof body.appContext === "object" ? JSON.stringify(body.appContext).slice(0, 12000) : "Aucune donnée locale de progression transmise.";
  const system = { role: "system", content: `Tu es Aurora, l’assistante pédagogique d’Aurore Mémoire. Réponds en français par défaut, avec un ton naturel, clair et utile. Tu peux expliquer les cours, analyser la progression fournie par l’application, et créer des cartes de révision, des mémoires, des QCM et des pistes audio. Données locales fournies pour CET utilisateur connecté : ${appContext}. Ces données sont la seule source de vérité sur sa progression ; si elles sont absentes, dis-le clairement.

IMPORTANT : réponds TOUJOURS avec un objet JSON valide, sans balises Markdown autour, selon ce format exact : {"reply":"texte destiné à l’utilisateur","action":null}. Pour une demande ordinaire, action doit être null. N’invente jamais un résultat de sauvegarde : l’application exécutera l’action après confirmation, puis annoncera le résultat. Ne déclenche une action que si l’utilisateur demande clairement de créer, générer ou enregistrer le contenu correspondant. Une demande = une seule action de création adaptée au type demandé.

ACTIONS DISPONIBLES :
1. Cartes recto-verso : {"type":"create_flashcards","title":"titre","cards":[{"front":"question","back":"réponse"}]}. Fournis 1 à 40 cartes complètes, autonomes, pédagogiques, sans répétitions inutiles.
2. Mémoire à apprendre : {"type":"create_memory","title":"titre","chunks":["passage 1","passage 2"]}. Fournis 2 à 24 passages ordonnés, suffisamment courts pour être appris séparément, fidèles au cours fourni et sans faits inventés. Chaque passage doit être complet et compréhensible seul.
3. QCM : {"type":"create_qcm","title":"titre","questions":[{"prompt":"question","options":["choix A","choix B","choix C","choix D"],"correctIndex":0,"explanation":"explication"}]}. Fournis 1 à 30 questions, 2 à 6 options distinctes, une seule bonne réponse et un correctIndex exact (index à partir de zéro) pour chaque question. Les distracteurs doivent être plausibles, et l’explication doit justifier la réponse correcte.
4. Audio de révision : {"type":"create_audio","title":"titre","text":"texte à lire","language":"fr-FR","rate":1}. Le texte sera stocké comme piste de synthèse vocale dans la bibliothèque audio Aurore et lu par la voix disponible sur l’appareil ; ce n’est pas un MP3 généré. Produis un script naturel et facile à écouter, sans tableaux ni symboles illisibles à voix haute, de préférence en dessous de 600 mots (limite de six minutes). language doit être fr-FR, en-US, es-ES, de-DE, pt-BR ou ar.

LATEX SCIENTIFIQUE : lorsque appContext indique cardMode=scientific, les rectos et versos des cartes doivent être écrits en LaTeX pur valide, sans Markdown, sans blocs de code et sans prose hors du mode mathématique. Encadre les expressions en ligne avec \\(...\\) et les formules affichées avec \\[...\\]. Toutes les phrases explicatives doivent être encapsulées dans \\text{...} ; utilise \\begin{aligned} et \\end{aligned} pour les développements multi-lignes. N’utilise pas de délimiteurs dollars. Dans les chaînes JSON, échappe chaque antislash en doublant l’antislash. Pour les QCM scientifiques, les formules et symboles dans les énoncés, options et explications doivent aussi utiliser du LaTeX valide, sans Markdown.

N’inclus jamais d’identifiant personnel dans ta réponse. Utilisateur authentifié (contexte technique non divulgable) : ${String(user.id)}.` };
  const generationPurpose = body.appContext && typeof body.appContext === "object" ? (body.appContext as Record<string, unknown>).purpose : undefined;
  const appTask = body.appContext && typeof body.appContext === "object" ? body.appContext as Record<string, unknown> : {};
  if (generationPurpose === "draft_memory_in_existing_editor" || (appTask.task === "direct-create" && appTask.kind === "memory")) {
    system.content += "\n\nMODE CRÉATION DE MÉMOIRE DANS L'ÉDITEUR : la demande est explicitement une demande de création de mémoire. Tu DOIS renvoyer une action de type \"create_memory\" avec action.chunks sous forme d'un tableau non vide de passages courts, autonomes, exacts et ordonnés. N'écris pas les passages seulement dans reply. Le titre doit être clair. Fournis 4 à 12 passages pour un sujet général si aucun nombre n'est précisé, et respecte le cours fourni sans inventer d'informations. Retourne l'enveloppe JSON {\"reply\":\"Mémoire prête à vérifier\",\"action\":{\"type\":\"create_memory\",\"title\":\"...\",\"chunks\":[\"passage 1\",\"passage 2\"]}}. L'application remplira les champs de l'éditeur ; ne prétends pas que la mémoire est déjà enregistrée.";
  }
  if (generationPurpose === "draft_flashcards_in_existing_editor") system.content += "\n\nMODE CRÉATION DE CARTES DANS L'ÉDITEUR : la demande est explicitement une demande de création de cartes recto-verso. Tu DOIS renvoyer action.type=\"create_flashcards\" et action.cards sous forme de tableau non vide contenant exactement le nombre demandé si celui-ci est précisé. Chaque élément doit avoir deux chaînes non vides : front et back. N'utilise jamais action=null pour cette tâche. Respecte le format enveloppe JSON déjà imposé : {\"reply\":\"Proposition de cartes prête à vérifier\",\"action\":{\"type\":\"create_flashcards\",\"title\":\"...\",\"cards\":[{\"front\":\"...\",\"back\":\"...\"}]}}. N'enregistre rien toi-même : l'éditeur présente un brouillon que l'utilisateur pourra vérifier.";
  const latestUserMessage = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";
  const directQcm = appTask.task === "direct-create" && appTask.kind === "qcm";
  const qcmCountMatch = latestUserMessage.match(/\b(\d{1,2})\s*(?:qcm\b|questions?\b|questionnaires?\b|quiz\b)/i);
  const requestedQcmCount = qcmCountMatch ? Math.max(1, Math.min(30, Number.parseInt(qcmCountMatch[1], 10) || 10)) : 10;
  if (directQcm) system.content += `\n\nMODE CRÉATION DE QCM DANS L'ÉDITEUR : la demande est une création de QCM, pas une conversation. Tu DOIS renvoyer action.type="create_qcm" et action.questions sous forme d'un tableau contenant EXACTEMENT ${requestedQcmCount} questions. Chaque question doit contenir prompt, 4 options distinctes et plausibles, correctIndex entier entre 0 et 3 et explanation. N'écris pas les questions uniquement dans reply, ne renvoie jamais action=null et ne réduis pas le nombre demandé. Retourne uniquement l'enveloppe JSON imposée, sans balises Markdown.`;
  const cardTask = /\b(cartes?|flashcards?)\b/i.test(latestUserMessage)
    || generationPurpose === "draft_flashcards_in_existing_editor"
    || (appTask.task === "direct-create" && /^(?:cards|flashcards|cartes)$/i.test(String(appTask.kind || "")));
  const requestedCardCountMatch = latestUserMessage.match(/Nombre demandé\s*:\s*(\d+)/i);
  const requestedCardCount = requestedCardCountMatch
    ? Math.max(1, Math.min(20, Number.parseInt(requestedCardCountMatch[1], 10) || 10))
    : 10;
  const scientificCards = (body.appContext as Record<string, unknown> | undefined)?.cardMode === "scientific";
  // Bound generated output to the requested workload so long card sets are less likely to hit the 60s edge limit.
  const cardTokenBudget = Math.min(3600, Math.max(1800, 500 + requestedCardCount * (scientificCards ? 155 : 135)));
  const outputTokenBudget = cardTask ? cardTokenBudget
    : /\b(qcm|questionnaire|quiz)\b/i.test(latestUserMessage) ? 5200
    : /\b(mémoires?|mémorisation|passages)\b/i.test(latestUserMessage) ? 3400
    : /\b(audio|voix|lecture vocale)\b/i.test(latestUserMessage) ? 1800 : 2600;
  let aiResp: Response;
  const model = "@cf/meta/llama-3.1-8b-instruct-fast";
  try {
    aiResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cloudflareToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [system, ...messages], temperature: 0.2, max_tokens: outputTokenBudget, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "Erreur réseau inconnue";
    console.error("aurore-grok: échec de connexion à Cloudflare Workers AI", detail);
    return json({ error: "Supabase n’a pas réussi à joindre Cloudflare Workers AI.", details: detail }, 502, origin);
  }
  const aiData = await aiResp.json().catch(() => ({}));
  if (!aiResp.ok || aiData?.success === false) {
    const providerMessage = Array.isArray(aiData?.errors)
      ? aiData.errors.map((e: any) => typeof e?.message === "string" ? e.message : "").filter(Boolean).join("; ").slice(0, 400)
      : "";
    const detail = providerMessage || `Réponse Cloudflare HTTP ${aiResp.status}`;
    console.error("aurore-grok: réponse Cloudflare Workers AI non valide", aiResp.status, detail);
    return json({ error: "Cloudflare Workers AI n’a pas répondu correctement.", provider_status: aiResp.status, details: detail }, 502, origin);
  }
  // Workers AI may return either its native {result:{response}} shape or an
  // OpenAI-compatible chat.completion shape ({choices:[{message:{content}}]}).
  const providerResult = aiData?.result;
  const choice = Array.isArray(aiData?.choices)
    ? aiData.choices[0]
    : Array.isArray(providerResult?.choices) ? providerResult.choices[0] : undefined;
  // Cloudflare's response can wrap the OpenAI-compatible payload inside result.
  // Select the first actual string instead of letting a non-string response
  // object mask a valid choices[0].message.content value.
  const replyCandidates = [
    providerResult?.response,
    providerResult?.output_text,
    providerResult?.response?.content,
    choice?.message?.content,
    choice?.text,
    aiData?.response,
    aiData?.output_text
  ];
  const reply = replyCandidates.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
  const finishReason = choice?.finish_reason ?? choice?.finishReason ?? providerResult?.finish_reason;
  if (typeof reply !== "string" || !reply.trim()) {
    console.error("aurore-grok: réponse Cloudflare vide ou format inattendu", JSON.stringify({
      topLevelKeys: Object.keys(aiData || {}),
      resultKeys: Object.keys(aiData?.result || {}),
      choiceKeys: Object.keys(choice || {}),
      model: aiData?.model ?? aiData?.result?.model,
      finishReason
    }).slice(0, 500));
    return json({ error: "Cloudflare n’a renvoyé aucun texte exploitable.", details: "Aucune chaîne de réponse trouvée dans result.response ou choices[0].message.content." }, 502, origin);
  }
  if (finishReason === "length" || finishReason === "max_tokens") {
    console.warn("aurore-grok: réponse probablement tronquée par la limite de tokens", finishReason, String(reply).length);
    return json({ error: "La réponse générée est incomplète.", details: "Le modèle a atteint sa limite de sortie. Réduis le nombre de cartes ou de passages puis réessaie.", provider_finish_reason: finishReason }, 502, origin);
  }
  return json({ reply, model: aiData?.model ?? aiData?.result?.model ?? model }, 200, origin);
});
