const ROOT = "Aurore mémoires/";

// Sites autorisés à appeler l'API de stockage depuis un navigateur.
// - aurore9 : site principal Mémoire ; mu : ancien domaine (migration cloud).
// - aurore-section-archivescom / aurore-section-archives.com : sites Archives, dont l'application Android
//   (Capacitor) charge l'adresse ; https://localhost et capacitor://localhost : origines internes de la WebView.
// Chaque requête exige de toute façon un jeton Supabase valide (Authorization: Bearer).
const DEFAULT_ALLOWED_ORIGINS = [
  "https://aurore-memories-aurore9.vercel.app",
  "https://aurore-memories-mu.vercel.app",
  "https://aurore-section-archivescom.vercel.app",
  "https://aurore-section-archives.com",
  "https://localhost",
  "capacitor://localhost"
];

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = [...new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)
  ])];
  const sameOrigin = origin && new URL(request.url).origin === origin;
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "86400"
  });
  if (origin && (sameOrigin || allowed.includes(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(data, status, cors) {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers });
}

async function authenticatedUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase authentication is not configured on this Worker.");
  }

  const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), {
    headers: {
      "apikey": env.SUPABASE_PUBLISHABLE_KEY,
      "Authorization": authorization
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && typeof user.id === "string" ? user : null;
}

function normalizedEtag(value) {
  return String(value || "").replace(/^"|"$/g, "");
}

function relativeKey(value) {
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the existing static Aurore Mémoire site on the same Worker.
    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "aurore-memories",
        authConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
        storageConfigured: Boolean(env.MEMORIES_BUCKET),
        memorySyncVersion: "2026-10-21-cors-app-fix",
        conditionalWrites: true,
        aiConfigured: Boolean(env.AI),
        ttsVersion: "2026-10-22-cloudflare-dialog-v1"
      }, 200, corsHeaders(request, env));
    }

    // Neural TTS: accessible only to an authenticated Aurore ID user.
    if (url.pathname === "/api/tts") {
      const cors = corsHeaders(request, env);
      if (request.method === "OPTIONS") {
        if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) {
          return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
        }
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
      if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) {
        return json({ error: "Origin not allowed" }, 403, cors);
      }
      try {
        const user = await authenticatedUser(request, env);
        if (!user) return json({ error: "Authentication required" }, 401, cors);
        if (!env.AI) return json({ error: "Workers AI is not configured on this Worker." }, 503, cors);
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length > 24000) return json({ error: "Text payload too large." }, 413, cors);
        const input = await request.json();
        const prompt = typeof input.text === "string" ? input.text.trim() : "";
        const languageMap = { "fr-FR": "fr", fr: "fr", "en-US": "en", en: "en", "es-ES": "es", es: "es", "zh-CN": "zh", zh: "zh", "ja-JP": "jp", ja: "jp", "ko-KR": "kr", ko: "kr" };
        const lang = languageMap[input.language] || "fr";
        if (!prompt) return json({ error: "Text is required." }, 400, cors);
        if (prompt.length > 5000) return json({ error: "Maximum 5,000 characters per generated audio." }, 413, cors);
        const output = await env.AI.run("@cf/myshell-ai/melotts", { prompt, lang });
        if (!output || typeof output.audio !== "string" || !output.audio) {
          return json({ error: "Workers AI returned no audio." }, 502, cors);
        }
        const binary = atob(output.audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const headers = new Headers(cors);
        headers.set("Content-Type", "audio/mpeg");
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Length", String(bytes.byteLength));
        return new Response(bytes, { status: 200, headers });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Audio generation failed." }, 502, cors);
      }
    }

    if (!url.pathname.startsWith("/api/storage")) return env.ASSETS.fetch(request);

    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) {
        return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (!["GET", "POST", "DELETE"].includes(request.method)) {
        return json({ error: "Method not allowed" }, 405, cors);
      }
      if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) {
        return json({ error: "Origin not allowed" }, 403, cors);
      }

      const user = await authenticatedUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401, cors);

      const userPrefix = ROOT + user.id + "/";
      if (request.method === "GET" && url.pathname === "/api/storage/list") {
        const listed = await env.MEMORIES_BUCKET.list({ prefix: userPrefix, limit: 1000 });
        return json({
          objects: listed.objects.map((object) => ({
            key: object.key.slice(userPrefix.length),
            size: object.size,
            uploaded: object.uploaded,
            etag: object.etag
          })),
          truncated: listed.truncated,
          cursor: listed.truncated ? listed.cursor : null
        }, 200, cors);
      }

      const key = relativeKey(url.searchParams.get("key") || "");
      if (!key) return json({ error: "Invalid file key" }, 400, cors);
      const objectKey = userPrefix + key;

      if (request.method === "POST") {
        const declaredLength = Number(request.headers.get("Content-Length") || 0);
        if (declaredLength > 10 * 1024 * 1024) {
          return json({ error: "File exceeds 10 MB limit" }, 413, cors);
        }
        const ifMatch = request.headers.get("If-Match");
        const ifNoneMatch = request.headers.get("If-None-Match");
        const requiresCondition = key === "sauvegarde-memorisations.json" || key.startsWith("archives/");
        const current = await env.MEMORIES_BUCKET.head(objectKey);
        if (ifNoneMatch === "*" && current) {
          return json({ error: "Object already exists; no data was overwritten." }, 412, cors);
        }
        if (ifMatch && (!current || normalizedEtag(current.httpEtag) !== normalizedEtag(ifMatch))) {
          return json({ error: "Cloud object changed; retry after refreshing the remote version." }, 412, cors);
        }
        if (requiresCondition && ifNoneMatch !== "*" && !ifMatch) {
          return json({ error: "A conditional write is required to protect existing memorisations." }, 428, cors);
        }
        if (current && current.customMetadata?.ownerId !== user.id) {
          return json({ error: "Forbidden" }, 403, cors);
        }
        const body = await request.arrayBuffer();
        if (body.byteLength > 10 * 1024 * 1024) {
          return json({ error: "File exceeds 10 MB limit" }, 413, cors);
        }
        const contentType = request.headers.get("Content-Type") || "application/octet-stream";
        const stored = await env.MEMORIES_BUCKET.put(objectKey, body, {
          httpMetadata: {
            contentType,
            cacheControl: "private, no-store"
          },
          customMetadata: { ownerId: user.id }
        });
        return json({ ok: true, key, etag: stored.etag }, 201, cors);
      }

      if (request.method === "DELETE") {
        const object = await env.MEMORIES_BUCKET.head(objectKey);
        if (!object) return json({ error: "File not found" }, 404, cors);
        if (object.customMetadata?.ownerId !== user.id) {
          return json({ error: "Forbidden" }, 403, cors);
        }
        await env.MEMORIES_BUCKET.delete(objectKey);
        return json({ ok: true }, 200, cors);
      }

      const object = await env.MEMORIES_BUCKET.get(objectKey);
      if (!object) return json({ error: "File not found" }, 404, cors);
      if (object.customMetadata?.ownerId !== user.id) {
        return json({ error: "Forbidden" }, 403, cors);
      }
      const headers = new Headers(cors);
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(object.body, { status: 200, headers });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500, cors);
    }
  }
};
