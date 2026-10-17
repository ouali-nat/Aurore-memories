/**
 * Aurore Mémoire — R2 private storage gateway.
 * Every request except /health must present a valid Aurore Mémoire Supabase access token.
 * R2 objects are private and isolated by Supabase user ID.
 */

const PREFIX = "Aurore mémoires/";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_ORIGIN = "https://aurore-memories-aurore9.vercel.app";

const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};
const ALLOWED_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

function allowedOrigins(env) {
  const fromEnv = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(fromEnv);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400"
  });
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(data, status, request, env, extraHeaders) {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

function errorResponse(message, status, request, env) {
  return json({ error: message }, status, request, env);
}

function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).has(origin);
}

function sanitizedName(value) {
  let name = String(value || "fichier")
    .normalize("NFKC")
    .replace(/[\/\\\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 150);
  if (!name || name === "." || name === "..") name = "fichier";
  return name;
}

function extensionOf(name) {
  const point = name.lastIndexOf(".");
  return point >= 0 ? name.slice(point).toLowerCase() : "";
}

function safeContentType(file) {
  const extension = extensionOf(file.name);
  const inferred = MIME_BY_EXTENSION[extension];
  const declared = String(file.type || "").toLowerCase().split(";")[0].trim();
  if (!inferred || !ALLOWED_TYPES.has(inferred)) return null;
  if (declared && declared !== "application/octet-stream" && declared !== inferred) return null;
  return inferred;
}

function safeAttachmentName(name) {
  // Download as an attachment: user content is never rendered as active HTML/SVG.
  const fallback = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "fichier";
  return "attachment; filename=\"" + fallback.replace(/["\\]/g, "_") +
    "\"; filename*=UTF-8''" + encodeURIComponent(name);
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Connectez-vous avec Aurore ID pour continuer.", status: 401 };
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { error: "Le service d’authentification n’est pas encore configuré.", status: 503 };
  }

  let response;
  try {
    response = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + match[1]
      }
    });
  } catch (_) {
    return { error: "Le service d’authentification est temporairement indisponible.", status: 503 };
  }
  if (!response.ok) return { error: "Votre session n’est pas valide. Reconnectez-vous.", status: 401 };

  let user;
  try { user = await response.json(); } catch (_) { user = null; }
  if (!user || typeof user.id !== "string" || !user.id) {
    return { error: "Impossible de vérifier votre compte.", status: 401 };
  }
  return { user: { id: user.id, email: typeof user.email === "string" ? user.email : "" } };
}

function ownedPrefix(user) {
  return PREFIX + user.id + "/";
}

function ownedKey(rawKey, user) {
  const key = String(rawKey || "");
  // The caller cannot select a bucket path belonging to another user.
  if (!key.startsWith(ownedPrefix(user)) || key.includes("\u0000") || key.includes("\\") ||
      key.split("/").some((part) => part === "." || part === "..")) return null;
  return key;
}

function publicObject(object) {
  const metadata = object.customMetadata || {};
  return {
    key: object.key,
    name: metadata.originalName || object.key.split("/").pop() || "fichier",
    contentType: metadata.contentType || object.httpMetadata?.contentType || "application/octet-stream",
    size: object.size,
    uploadedAt: metadata.uploadedAt || object.uploaded || null,
    etag: object.httpEtag || null
  };
}

async function listFiles(request, env, user, url) {
  const cursor = url.searchParams.get("cursor") || undefined;
  const rawLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 100;
  const result = await env.MEMORIES_BUCKET.list({
    prefix: ownedPrefix(user),
    limit: limit,
    cursor: cursor
  });
  return json({
    files: (result.objects || []).map(publicObject),
    hasMore: Boolean(result.truncated),
    cursor: result.truncated ? result.cursor : null
  }, 200, request, env);
}

async function uploadFile(request, env, user) {
  let form;
  try { form = await request.formData(); }
  catch (_) { return errorResponse("Le formulaire de fichier est illisible.", 400, request, env); }

  const file = form.get("file");
  if (!file || typeof file.stream !== "function" || typeof file.size !== "number") {
    return errorResponse("Ajoutez un fichier dans le champ « file ».", 400, request, env);
  }
  if (file.size < 1) return errorResponse("Le fichier est vide.", 400, request, env);
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse("Le fichier dépasse la limite de 25 Mo.", 413, request, env);
  }

  const name = sanitizedName(file.name);
  const contentType = safeContentType({ name: name, type: file.type });
  if (!contentType) {
    return errorResponse("Format non accepté. Utilisez un PDF, document, tableur, image, fichier audio ou vidéo autorisé.", 415, request, env);
  }

  const key = ownedPrefix(user) + crypto.randomUUID() + "/" + name;
  try {
    await env.MEMORIES_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: contentType,
        contentDisposition: safeAttachmentName(name),
        cacheControl: "private, no-store"
      },
      customMetadata: {
        ownerId: user.id,
        originalName: name,
        contentType: contentType,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (_) {
    return errorResponse("Le stockage du fichier a échoué. Réessayez.", 502, request, env);
  }
  return json({ file: { key: key, name: name, contentType: contentType, size: file.size } }, 201, request, env);
}

async function downloadFile(request, env, user, url) {
  const key = ownedKey(url.searchParams.get("key"), user);
  if (!key) return errorResponse("Fichier introuvable.", 404, request, env);

  const object = await env.MEMORIES_BUCKET.get(key);
  if (!object) return errorResponse("Fichier introuvable.", 404, request, env);

  const metadata = object.customMetadata || {};
  const name = sanitizedName(metadata.originalName || key.split("/").pop() || "fichier");
  const headers = corsHeaders(request, env);
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", metadata.contentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Content-Disposition", safeAttachmentName(name));
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

async function deleteFile(request, env, user, url) {
  const key = ownedKey(url.searchParams.get("key"), user);
  if (!key) return errorResponse("Fichier introuvable.", 404, request, env);
  const object = await env.MEMORIES_BUCKET.head(key);
  if (!object) return errorResponse("Fichier introuvable.", 404, request, env);
  await env.MEMORIES_BUCKET.delete(key);
  return json({ deleted: true }, 200, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";

    if (!isAllowedOrigin(origin, env)) {
      return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "aurore-memoire-r2",
        authConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
        storageConfigured: Boolean(env.MEMORIES_BUCKET)
      }, 200, request, env);
    }

    if (path !== "/api/me" && path !== "/api/files") {
      return errorResponse("Route inconnue.", 404, request, env);
    }
    if (!["GET", "POST", "DELETE"].includes(request.method)) {
      return errorResponse("Méthode non autorisée.", 405, request, env, { "Allow": "GET,POST,DELETE,OPTIONS" });
    }
    if (path === "/api/files" && request.method === "POST" &&
        !(request.headers.get("Content-Type") || "").toLowerCase().includes("multipart/form-data")) {
      return errorResponse("Envoyez le fichier avec un formulaire multipart/form-data.", 415, request, env);
    }

    const auth = await authenticate(request, env);
    if (auth.error) return errorResponse(auth.error, auth.status, request, env);
    const user = auth.user;

    if (path === "/api/me") {
      if (request.method !== "GET") return errorResponse("Méthode non autorisée.", 405, request, env, { "Allow": "GET,OPTIONS" });
      return json({ user: user }, 200, request, env);
    }

    try {
      if (request.method === "GET") {
        if (url.searchParams.has("key")) return await downloadFile(request, env, user, url);
        return await listFiles(request, env, user, url);
      }
      if (request.method === "POST") return await uploadFile(request, env, user);
      if (request.method === "DELETE") return await deleteFile(request, env, user, url);
      return errorResponse("Méthode non autorisée.", 405, request, env);
    } catch (_) {
      return errorResponse("Le stockage est temporairement indisponible.", 502, request, env);
    }
  }
};