import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://aurore-memories-mu.vercel.app",
  "https://aurore-memories-aurore9.vercel.app",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin)
    ? origin
    : "https://aurore-memories-mu.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origine non autorisée.", code: "ORIGIN_NOT_ALLOWED" }, 403, origin);

  const apiKey = (Deno.env.get("XAI_API_KEY") || "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    return json({ error: "La clé XAI_API_KEY n’est pas configurée dans les secrets du serveur.", code: "XAI_API_KEY_MISSING" }, 503, origin);
  }
  if (!supabaseUrl || !anonKey || !token || token === authHeader) {
    return json({ error: "Connexion Aurore ID requise.", code: "AURORE_AUTH_REQUIRED" }, 401, origin);
  }

  let authResp: Response;
  try {
    authResp = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: anonKey, Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("aurore-grok auth verification failed", err instanceof Error ? err.name : "AuthNetworkError");
    return json({ error: "Impossible de vérifier la session Aurore ID. Réessaie dans un instant.", code: "AUTH_SERVICE_UNAVAILABLE" }, 502, origin);
  }
  if (!authResp.ok) {
    return json({ error: "Session expirée ou invalide. Reconnecte-toi avec Aurore ID.", code: "AURORE_SESSION_INVALID" }, 401, origin);
  }
  const user = await authResp.json();

  let body: { messages?: unknown; appContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps JSON invalide.", code: "INVALID_JSON" }, 400, origin);
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 30) {
    return json({ error: "La conversation doit contenir entre 1 et 30 messages.", code: "INVALID_MESSAGES" }, 400, origin);
  }
  const messages = body.messages.filter((m: any) =>
    m && ["user", "assistant"].includes(m.role) &&
    typeof m.content === "string" && m.content.length <= 12000
  );
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Dernier message utilisateur manquant ou invalide.", code: "INVALID_LAST_MESSAGE" }, 400, origin);
  }

  let appContext = "Aucune donnée locale de progression transmise.";
  if (body.appContext && typeof body.appContext === "object") {
    try { appContext = JSON.stringify(body.appContext).slice(0, 12000); } catch { /* keep safe fallback */ }
  }
  const systemContent = [
    "Tu es Aurora, l’assistante pédagogique d’Aurore Mémoire. Réponds en français par défaut, avec un ton naturel, clair et utile. Tu peux expliquer les cours, concevoir des cartes et des QCM, et analyser la progression fournie par l’application.",
    "Données locales fournies pour cet utilisateur connecté : " + appContext + ". Ces données sont la seule source de vérité sur sa progression ; si elles sont absentes, dis-le clairement.",
    "IMPORTANT : réponds toujours avec un objet JSON valide, sans balises Markdown autour, selon ce format exact : {\"reply\":\"texte destiné à l’utilisateur\",\"action\":null}. Pour une demande ordinaire, action doit être null.",
    "Pour une demande explicite de création/enregistrement de cartes mémoire, action doit être {\"type\":\"create_flashcards\",\"title\":\"titre\",\"cards\":[{\"front\":\"question\",\"back\":\"réponse\"}]}. Fournis 1 à 40 cartes complètes.",
    "Pour une demande explicite de création/enregistrement d’un QCM, action doit être {\"type\":\"create_qcm\",\"title\":\"titre\",\"questions\":[{\"prompt\":\"question\",\"options\":[\"choix A\",\"choix B\",\"choix C\",\"choix D\"],\"correctIndex\":0,\"explanation\":\"explication\"}]}. Fournis 1 à 30 questions, 2 à 6 options et un correctIndex exact (index à partir de zéro) pour chaque question.",
    "Ne déclenche une action que si l’utilisateur demande clairement de créer/enregistrer/générer les cartes ou le QCM ; sinon propose le contenu sans action. N’invente jamais un résultat de sauvegarde : l’application exécutera l’action puis confirmera. Ne fournis pas d’action pour analyser la progression. N’inclus pas d’identifiant personnel dans ta réponse.",
    "Utilisateur authentifié (contexte technique non divulgable) : " + String(user.id) + ".",
  ].join("\n\n");

  let xaiResp: Response;
  try {
    xaiResp = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-4.7",
        messages: [{ role: "system", content: systemContent }, ...messages],
        temperature: 0.4,
        max_tokens: 2600,
        stream: false,
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.error("aurore-grok provider request failed", err instanceof Error ? err.name : "ProviderNetworkError");
    return json({
      error: isTimeout ? "Le service Grok met trop de temps à répondre. Réessaie." : "Impossible de joindre le service Grok. Vérifie la connexion et réessaie.",
      code: isTimeout ? "XAI_TIMEOUT" : "XAI_NETWORK_ERROR",
    }, 502, origin);
  }

  const xaiRaw = await xaiResp.text();
  let xaiData: any = {};
  try { xaiData = JSON.parse(xaiRaw); } catch { /* provider response was not JSON */ }

  if (!xaiResp.ok) {
    const providerError = xaiData?.error;
    const details = (
      typeof providerError === "string" ? providerError :
      typeof providerError?.message === "string" ? providerError.message :
      typeof xaiData?.message === "string" ? xaiData.message :
      xaiRaw || "Le fournisseur n’a pas précisé la cause."
    ).slice(0, 500);
    const invalidKey = /incorrect api key provided|invalid api key|api key.{0,30}(invalid|incorrect|refused)|unauthorized.{0,30}(api key|key)/i.test(details);

    if (invalidKey) {
      console.error("aurore-grok rejected XAI_API_KEY", xaiResp.status);
      return json({
        error: "La clé API xAI configurée pour Aurora est refusée. Remplace XAI_API_KEY dans les secrets Supabase par une clé valide créée sur console.x.ai.",
        code: "XAI_API_KEY_INVALID",
        provider_status: xaiResp.status,
      }, 503, origin);
    }

    console.error("aurore-grok provider returned error", xaiResp.status, details);
    return json({
      error: "Grok a refusé la requête (HTTP " + xaiResp.status + ").",
      code: "XAI_PROVIDER_ERROR",
      provider_status: xaiResp.status,
      details,
    }, 502, origin);
  }

  const reply = xaiData?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    console.error("aurore-grok provider returned an empty response", xaiData?.model || "unknown model");
    return json({ error: "Grok a renvoyé une réponse vide.", code: "XAI_EMPTY_RESPONSE" }, 502, origin);
  }

  return json({ reply, model: xaiData.model || "grok-4.7" }, 200, origin);
});
