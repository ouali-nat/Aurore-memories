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
  const system = { role: "system", content: `Tu es Aurora, l’assistante pédagogique d’Aurore Mémoire. Réponds en français par défaut, avec un ton naturel, clair et utile. Tu peux expliquer les cours, concevoir des cartes et des QCM, et analyser la progression fournie par l’application. Données locales fournies pour CET utilisateur connecté : ${appContext}. Ces données sont la seule source de vérité sur sa progression; si elles sont absentes, dis-le clairement. IMPORTANT : réponds TOUJOURS avec un objet JSON valide, sans balises Markdown autour, selon ce format exact : {"reply":"texte destiné à l’utilisateur","action":null}. Pour une demande ordinaire, action doit être null. Pour une demande explicite de création/enregistrement de cartes mémoire, action doit être {"type":"create_flashcards","title":"titre","cards":[{"front":"question","back":"réponse"}]}. Fournis 1 à 40 cartes complètes. Pour une demande explicite de création/enregistrement d’un QCM, action doit être {"type":"create_qcm","title":"titre","questions":[{"prompt":"question","options":["choix A","choix B","choix C","choix D"],"correctIndex":0,"explanation":"explication"}]}. Fournis 1 à 30 questions, 2 à 6 options et un correctIndex exact (index à partir de zéro) pour chaque question. Ne déclenche une action que si l’utilisateur demande clairement de créer/enregistrer/générer les cartes ou le QCM; sinon propose le contenu sans action. N’invente jamais un résultat de sauvegarde : l’application exécutera l’action puis confirmera. Ne fournis pas d’action pour analyser la progression. N’inclus pas d’identifiant personnel dans ta réponse. Utilisateur authentifié (contexte technique non divulgable) : ${String(user.id)}.` };
  const xaiResp = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "grok-4.7", messages: [system, ...messages], temperature: 0.4, max_tokens: 2600, stream: false }), signal: AbortSignal.timeout(45000) });
  const xaiData = await xaiResp.json().catch(() => ({}));
  if (!xaiResp.ok) return json({ error: "Le service Grok n’a pas répondu correctement.", provider_status: xaiResp.status, details: typeof xaiData?.error?.message === "string" ? xaiData.error.message.slice(0, 400) : undefined }, 502, origin);
  const reply = xaiData?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) return json({ error: "Grok a renvoyé une réponse vide." }, 502, origin);
  return json({ reply, model: xaiData.model || "grok-4.7" }, 200, origin);
});
