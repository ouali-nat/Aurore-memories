const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function withCors(request, env, response) {
  const origin = allowedOrigin(request, env);
  if (origin === null) return json({ error: "Origin non autorisée." }, 403);
  const headers = new Headers(response.headers);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function bearer(request) {
  const value = request.headers.get("Authorization") || "";
  return /^Bearer\s+\S+$/i.test(value) ? value.replace(/^Bearer\s+/i, "") : "";
}
async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const response = await fetch(env.AURORE_ID_SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: {
      apikey: env.AURORE_ID_SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + token
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && UUID_RE.test(String(user.id || "")) ? { id: user.id, token } : null;
}
function serviceHeaders(env, extra = {}) {
  const key = env.AURORE_ID_SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: key,
    "content-type": "application/json",
    ...extra
  };
  // Modern sb_secret_ keys are opaque API keys, not JWTs. Only legacy
  // service_role JWTs belong in Authorization; never send sb_secret_ as a bearer JWT.
  if (key && !key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  return headers;
}
async function dbRequest(env, path, options = {}) {
  const base = env.AURORE_ID_SUPABASE_URL.replace(/\/$/, "");
  return fetch(base + "/rest/v1/" + path, {
    ...options,
    headers: serviceHeaders(env, options.headers || {})
  });
}
function safeName(value) {
  const raw = String(value || "fichier").split(/[\\/]/).pop().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 100);
  return raw || "fichier";
}
function contentAllowed(service, type) {
  if (service === "profiles") return ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type);
  return ["image/jpeg", "image/png", "image/webp", "image/avif", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "application/pdf"].includes(type);
}
async function findObject(env, id) {
  const query = "r2_objects?id=eq." + encodeURIComponent(id) +
    "&select=id,owner_id,service,object_key,file_name,content_type,size_bytes,created_at&limit=1";
  const response = await dbRequest(env, query);
  if (!response.ok) throw new Error("metadata_lookup_failed");
  const rows = await response.json();
  return rows[0] || null;
}
async function isPublicProfile(env, ownerId) {
  const query = "aurore_profiles?user_id=eq." + encodeURIComponent(ownerId) +
    "&visibility=eq.public&select=user_id&limit=1";
  const response = await dbRequest(env, query);
  if (!response.ok) return false;
  return (await response.json()).length > 0;
}
async function upload(request, env, user) {
  if (!user) return json({ error: "Connexion Aurore ID requise." }, 401);
  const form = await request.formData();
  const file = form.get("file");
  const service = String(form.get("service") || "");
  if (!["memories", "profiles"].includes(service)) return json({ error: "Service invalide." }, 400);
  if (!(file instanceof File) || file.size < 1) return json({ error: "Fichier manquant ou vide." }, 400);
  const maxBytes = service === "profiles" ? 8 * 1024 * 1024 : 25 * 1024 * 1024;
  const type = String(file.type || "application/octet-stream").toLowerCase();
  if (file.size > maxBytes) return json({ error: "Fichier trop volumineux pour ce service." }, 413);
  if (!contentAllowed(service, type)) return json({ error: "Type de fichier non autorisé." }, 415);
  const id = crypto.randomUUID();
  const name = safeName(file.name);
  const key = service + "/" + user.id + "/" + id + "-" + name;
  await env.AURORE_R2.put(key, file.stream(), {
    httpMetadata: { contentType: type, cacheControl: service === "profiles" ? "public, max-age=300" : "private, no-store" },
    customMetadata: { ownerId: user.id, service, originalName: name }
  });
  const insert = await dbRequest(env, "r2_objects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      owner_id: user.id,
      service,
      object_key: key,
      file_name: name,
      content_type: type,
      size_bytes: file.size
    })
  });
  if (!insert.ok) {
    await env.AURORE_R2.delete(key);
    return json({ error: "Enregistrement des métadonnées impossible." }, 502);
  }
  const rows = await insert.json();
  return json({ id: rows[0].id, service, file_name: name, content_type: type, size_bytes: file.size });
}
async function download(request, env, id, user) {
  if (!UUID_RE.test(id)) return json({ error: "Identifiant invalide." }, 400);
  const row = await findObject(env, id);
  if (!row) return json({ error: "Fichier introuvable." }, 404);
  let permitted = Boolean(user && user.id === row.owner_id);
  if (!permitted && row.service === "profiles") permitted = await isPublicProfile(env, row.owner_id);
  if (!permitted) return json({ error: "Accès refusé." }, user ? 403 : 401);
  const object = await env.AURORE_R2.get(row.object_key);
  if (!object) return json({ error: "Fichier absent du stockage." }, 404);
  const headers = new Headers({
    "Content-Type": row.content_type,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline; filename=\"" + safeName(row.file_name) + "\"; filename*=UTF-8''" + encodeURIComponent(row.file_name),
    "Cache-Control": row.service === "profiles" ? "public, max-age=300" : "private, no-store"
  });
  if (object.httpMetadata && object.httpMetadata.contentLanguage) headers.set("Content-Language", object.httpMetadata.contentLanguage);
  return new Response(object.body, { status: 200, headers });
}
async function remove(request, env, id, user) {
  if (!user) return json({ error: "Connexion Aurore ID requise." }, 401);
  if (!UUID_RE.test(id)) return json({ error: "Identifiant invalide." }, 400);
  const row = await findObject(env, id);
  if (!row) return json({ error: "Fichier introuvable." }, 404);
  if (row.owner_id !== user.id) return json({ error: "Accès refusé." }, 403);
  await env.AURORE_R2.delete(row.object_key);
  const response = await dbRequest(env, "r2_objects?id=eq." + encodeURIComponent(id), { method: "DELETE" });
  if (!response.ok) return json({ error: "Fichier supprimé du stockage, mais métadonnées à réconcilier." }, 502);
  return json({ deleted: true });
}
export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === null) return json({ error: "Origin non autorisée." }, 403);
    if (request.method === "OPTIONS") {
      if (origin === null) return json({ error: "Origin non autorisée." }, 403);
      return withCors(request, env, new Response(null, { status: 204 }));
    }
    const url = new URL(request.url);
    try {
      let response;
      if (url.pathname === "/health" && request.method === "GET") {
        response = json({ ok: true, service: "aurore-r2-gateway" });
      } else if (url.pathname === "/api/r2/upload" && request.method === "POST") {
        const user = await authenticate(request, env);
        response = await upload(request, env, user);
      } else {
        const match = url.pathname.match(/^\/api\/r2\/objects\/([0-9a-f-]+)$/i);
        if (!match) response = json({ error: "Route introuvable." }, 404);
        else if (request.method === "GET") {
          const user = await authenticate(request, env);
          response = await download(request, env, match[1], user);
        } else if (request.method === "DELETE") {
          const user = await authenticate(request, env);
          response = await remove(request, env, match[1], user);
        } else response = json({ error: "Méthode non autorisée." }, 405);
      }
      return withCors(request, env, response);
    } catch (error) {
      return withCors(request, env, json({ error: "Erreur interne du service de fichiers." }, 500));
    }
  }
};
