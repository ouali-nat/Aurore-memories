import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const allowedOrigins = new Set(["https://aurore-memories-mu.vercel.app", "https://aurore-memories-aurore9.vercel.app"]);
function corsHeaders(origin: string | null) { const allowed = origin && allowedOrigins.has(origin) ? origin : "https://aurore-memories-mu.vercel.app"; return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }; }
function json(body: unknown, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" } }); }
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origine non autorisée." }, 403, origin);
  const apiKey = Deno.env.get("XAI_API_KEY"), supabaseUrl = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authHeader = req.headers.get("authorization") || "", token = authHeader.replace(/^Bearer\s+/i, "");
  if (!apiKey) return json({ error: "La clé XAI_API_KEY n’est pas configurée côté serveur." }, 503, origin);
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
  const latestUserMessage = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";
  // Réserver davantage de sortie aux formats structurés longs, tout en gardant les explications ordinaires légères.
  const outputTokenBudget = /\b(qcm|questionnaire|quiz)\b/i.test(latestUserMessage) ? 5200
    : /\b(cartes?|flashcards?)\b/i.test(latestUserMessage) ? 4200
    : /\b(mémoires?|mémorisation|passages)\b/i.test(latestUserMessage) ? 3400
    : /\b(audio|voix|lecture vocale)\b/i.test(latestUserMessage) ? 1800 : 2600;
  let xaiResp: Response;
  try {
    xaiResp = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "grok-4.7", messages: [system, ...messages], temperature: 0.4, max_tokens: outputTokenBudget, stream: false }), signal: AbortSignal.timeout(45000) });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "Erreur réseau inconnue";
    console.error("aurore-grok: échec de connexion au fournisseur xAI", detail);
    return json({ error: "Supabase n’a pas réussi à joindre le service Grok.", details: detail }, 502, origin);
  }
  const xaiData = await xaiResp.json().catch(() => ({}));
  if (!xaiResp.ok) {
    const detail = typeof xaiData?.error?.message === "string" ? xaiData.error.message.slice(0, 400) : `Réponse fournisseur HTTP ${xaiResp.status}`;
    console.error("aurore-grok: réponse xAI non valide", xaiResp.status, detail);
    return json({ error: "Le service Grok n’a pas répondu correctement.", provider_status: xaiResp.status, details: detail }, 502, origin);
  }
  const reply = xaiData?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) return json({ error: "Grok a renvoyé une réponse vide." }, 502, origin);
  return json({ reply, model: xaiData.model || "grok-4.7" }, 200, origin);
});
