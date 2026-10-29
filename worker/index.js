const ROOT = "Aurore mémoires/";

// Same public publishable key as auth.js; never a secret.
const SUPABASE_PUBLISHABLE_KEY_FALLBACK = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";

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
  const supabaseUrl = env.SUPABASE_URL || "https://oegxxndiuovisustjstp.supabase.co";
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY_FALLBACK;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase authentication is not configured on this Worker.");
  }

  const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
    headers: {
      "apikey": publishableKey,
      "Authorization": authorization
    }
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return null;
    throw new Error("Supabase n’a pas pu vérifier la session (HTTP " + response.status + ").");
  }
  const user = await response.json();
  return user && typeof user.id === "string" ? user : null;
}

function normalizedEtag(value) {
  // Cloudflare may expose large streamed objects with a weak HTTP ETag:
  // W/"hash". Compare the underlying R2 entity tag, not the HTTP wrapper.
  return String(value || "").trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
}

function relativeKey(value) {
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return value;
}

const TTS_LIMIT_SECONDS = 180;
const TTS_LOCK_STALE_MS = 5 * 60 * 1000;

function ttsDay() {
  // Le fuseau Africa/Ouagadougou est UTC+0 : le compteur repart à minuit local.
  return new Date().toISOString().slice(0, 10);
}
function ttsLedgerKey(userId, day) {
  // Préfixe interne distinct des fichiers privés affichés dans la bibliothèque.
  return "Aurore quota audio/" + userId + "/" + day + ".json";
}
async function readTtsLedger(env, key) {
  const object = await env.MEMORIES_BUCKET.get(key);
  if (!object) return { object: null, state: { usedSeconds: 0, inFlight: null } };
  let state;
  try { state = await object.json(); }
  catch (_) { throw new Error("Le compteur vocal est temporairement illisible. Réessaie plus tard."); }
  if (!state || !Number.isFinite(Number(state.usedSeconds)) || Number(state.usedSeconds) < 0) {
    throw new Error("Le compteur vocal nécessite une vérification. Aucune génération n’a été lancée.");
  }
  return { object, state: { usedSeconds: Math.min(TTS_LIMIT_SECONDS, Math.floor(Number(state.usedSeconds))), inFlight: state.inFlight || null } };
}
async function writeTtsLedger(env, key, current, state) {
  const onlyIf = current && current.object
    ? { etagMatches: current.object.etag }
    : { etagDoesNotMatch: "*" };
  return env.MEMORIES_BUCKET.put(key, JSON.stringify(state), {
    onlyIf,
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" }
  });
}
function quotaSummary(day, state) {
  const usedSeconds = Math.min(TTS_LIMIT_SECONDS, Math.max(0, Math.floor(Number(state.usedSeconds) || 0)));
  const remainingSeconds = Math.max(0, TTS_LIMIT_SECONDS - usedSeconds);
  const resetsAt = new Date(Date.parse(day + "T00:00:00.000Z") + 86400000).toISOString();
  const lockAge = state.inFlight ? Date.now() - Number(state.inFlight.startedAt || 0) : Infinity;
  return {
    ok: true,
    day,
    limitSeconds: TTS_LIMIT_SECONDS,
    usedSeconds,
    remainingSeconds,
    inProgress: Boolean(state.inFlight && lockAge < TTS_LOCK_STALE_MS),
    resetsAt
  };
}
async function getTtsQuota(env, userId) {
  const day = ttsDay();
  const current = await readTtsLedger(env, ttsLedgerKey(userId, day));
  return quotaSummary(day, current.state);
}
async function reserveTtsQuota(env, userId, day) {
  const key = ttsLedgerKey(userId, day);
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readTtsLedger(env, key);
    const state = current.state;
    const lockAge = state.inFlight ? Date.now() - Number(state.inFlight.startedAt || 0) : Infinity;
    if (state.usedSeconds >= TTS_LIMIT_SECONDS) {
      return { error: "quota", quota: quotaSummary(day, state) };
    }
    if (state.inFlight && lockAge < TTS_LOCK_STALE_MS) {
      return { error: "busy", quota: quotaSummary(day, state) };
    }
    const next = {
      version: 1,
      day,
      limitSeconds: TTS_LIMIT_SECONDS,
      usedSeconds: state.usedSeconds,
      inFlight: { id: token, startedAt: Date.now() }
    };
    const written = await writeTtsLedger(env, key, current, next);
    if (written) return { token, key, day, userId };
  }
  return { error: "busy", quota: await getTtsQuota(env, userId) };
}
async function settleTtsQuota(env, reservation, audioSeconds) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readTtsLedger(env, reservation.key);
    const state = current.state;
    if (!state.inFlight || state.inFlight.id !== reservation.token) {
      return { ok: false, conflict: true, quota: quotaSummary(reservation.day, state) };
    }
    const duration = Math.max(1, Math.ceil(audioSeconds));
    const remaining = Math.max(0, TTS_LIMIT_SECONDS - state.usedSeconds);
    if (duration > remaining) {
      const next = { version: 1, day: reservation.day, limitSeconds: TTS_LIMIT_SECONDS, usedSeconds: state.usedSeconds, inFlight: null };
      const written = await writeTtsLedger(env, reservation.key, current, next);
      if (written) return { ok: false, overLimit: true, durationSeconds: duration, quota: quotaSummary(reservation.day, next) };
      continue;
    }
    const next = { version: 1, day: reservation.day, limitSeconds: TTS_LIMIT_SECONDS, usedSeconds: state.usedSeconds + duration, inFlight: null };
    const written = await writeTtsLedger(env, reservation.key, current, next);
    if (written) return { ok: true, durationSeconds: duration, quota: quotaSummary(reservation.day, next) };
  }
  return { ok: false, conflict: true, quota: await getTtsQuota(env, reservation.userId) };
}
async function releaseTtsQuota(env, reservation) {
  if (!reservation) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readTtsLedger(env, reservation.key);
    const state = current.state;
    if (!state.inFlight || state.inFlight.id !== reservation.token) return;
    const next = { version: 1, day: reservation.day, limitSeconds: TTS_LIMIT_SECONDS, usedSeconds: state.usedSeconds, inFlight: null };
    if (await writeTtsLedger(env, reservation.key, current, next)) return;
  }
}
function mp3DurationSeconds(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  let offset = 0;
  if (data.length >= 10 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const tagSize = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
    offset = 10 + tagSize + ((data[5] & 0x10) ? 10 : 0);
  }
  const mpeg1Layer3Bitrate = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const mpeg2Layer3Bitrate = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
  const baseSampleRates = [44100, 48000, 32000];
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff || (data[offset + 1] & 0xe0) !== 0xe0) { offset++; continue; }
    const version = (data[offset + 1] >> 3) & 3;
    const layer = (data[offset + 1] >> 1) & 3;
    const bitrateIndex = (data[offset + 2] >> 4) & 15;
    const sampleRateIndex = (data[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) { offset++; continue; }
    const mpeg1 = version === 3;
    const bitrate = (mpeg1 ? mpeg1Layer3Bitrate : mpeg2Layer3Bitrate)[bitrateIndex] * 1000;
    let sampleRate = baseSampleRates[sampleRateIndex];
    if (version === 2) sampleRate /= 2;
    if (version === 0) sampleRate /= 4;
    const padding = (data[offset + 2] >> 1) & 1;
    const frameLength = Math.floor((mpeg1 ? 144 : 72) * bitrate / sampleRate) + padding;
    if (!Number.isFinite(frameLength) || frameLength < 24 || offset + frameLength > data.length) { offset++; continue; }
    seconds += (mpeg1 ? 1152 : 576) / sampleRate;
    frames++;
    offset += frameLength;
  }
  return frames >= 2 && seconds > 0 ? seconds : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the existing static Aurore Mémoire site on the same Worker.
    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "aurore-memories",
        authConfigured: Boolean((env.SUPABASE_URL || "https://oegxxndiuovisustjstp.supabase.co") && (env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY_FALLBACK)),
        storageConfigured: Boolean(env.MEMORIES_BUCKET),
        memorySyncVersion: "2026-10-29-atomic-backup-writes-v3-weak-etag-normalization",
        conditionalWrites: true,
        aiConfigured: Boolean(env.AI),
        ttsVersion: "2026-10-22-daily-audio-quota-v2"
      }, 200, corsHeaders(request, env));
    }

    // Compteur vocal quotidien : authentification obligatoire, un compte = un quota.
    if (url.pathname === "/api/tts/quota") {
      const cors = corsHeaders(request, env);
      if (request.method === "OPTIONS") {
        if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);
      if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) return json({ error: "Origin not allowed" }, 403, cors);
      try {
        const user = await authenticatedUser(request, env);
        if (!user) return json({ error: "Authentication required" }, 401, cors);
        if (!env.MEMORIES_BUCKET) return json({ error: "Le compteur vocal est indisponible." }, 503, cors);
        return json(await getTtsQuota(env, user.id), 200, cors);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Impossible de lire le quota vocal." }, 503, cors);
      }
    }

    // Voix alternatives : le quota est vérifié côté serveur et décompté sur la durée réelle du MP3.
    if (url.pathname === "/api/tts") {
      const cors = corsHeaders(request, env);
      if (request.method === "OPTIONS") {
        if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) return new Response("Origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
      if (request.headers.get("Origin") && !cors.has("Access-Control-Allow-Origin")) return json({ error: "Origin not allowed" }, 403, cors);
      let reservation = null;
      try {
        const user = await authenticatedUser(request, env);
        if (!user) return json({ error: "Authentication required" }, 401, cors);
        if (!env.AI) return json({ error: "Le service de voix est momentanément indisponible." }, 503, cors);
        if (!env.MEMORIES_BUCKET) return json({ error: "Le compteur vocal est indisponible." }, 503, cors);
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length > 24000) return json({ error: "Text payload too large." }, 413, cors);
        const input = await request.json();
        const prompt = typeof input.text === "string" ? input.text.trim() : "";
        const languageMap = { "fr-FR": "fr", fr: "fr", "en-US": "en", en: "en", "es-ES": "es", es: "es", "zh-CN": "zh", zh: "zh", "ja-JP": "jp", ja: "jp", "ko-KR": "kr", ko: "kr" };
        const lang = languageMap[input.language] || "fr";
        if (!prompt) return json({ error: "Écris un texte avant de générer la voix." }, 400, cors);
        if (prompt.length > 5000) return json({ error: "Le texte ne doit pas dépasser 5 000 caractères." }, 413, cors);
        const models = {
          melotts: { id: "@cf/myshell-ai/melotts", kind: "multi" },
          "aura-1": { id: "@cf/deepgram/aura-1", kind: "en", speakers: ["angus","asteria","arcas","orion","orpheus","athena","luna","zeus","perseus","helios","hera","stella"] },
          "aura-2-en": { id: "@cf/deepgram/aura-2-en", kind: "en", speakers: ["amalthea","andromeda","apollo","arcas","aries","asteria","athena","atlas","aurora","callista","cora","cordelia","delia","draco","electra","harmonia","helena","hera","hermes","hyperion","iris","janus","juno","jupiter","luna","mars","minerva","neptune","odysseus","ophelia","orion","orpheus","pandora","phoebe","pluto","saturn","thalia","theia","vesta","zeus"] },
          "aura-2-es": { id: "@cf/deepgram/aura-2-es", kind: "es", speakers: ["sirio","nestor","carina","celeste","alvaro","diana","aquila","selena","estrella","javier"] }
        };
        if (!models[input.model]) return json({ error: "Choisis un style de voix disponible." }, 400, cors);
        const selected = models[input.model];
        const voice = typeof input.voice === "string" ? input.voice.toLowerCase() : "";
        if (selected.speakers && voice && !selected.speakers.includes(voice)) return json({ error: "Cette voix n’est pas disponible pour ce style." }, 400, cors);
        if (selected.kind === "en" && !["en","en-US"].includes(input.language)) return json({ error: "Ce style de voix est disponible en anglais uniquement." }, 400, cors);
        if (selected.kind === "es" && !["es","es-ES"].includes(input.language)) return json({ error: "Ce style de voix est disponible en espagnol uniquement." }, 400, cors);
        // Préfiltre prudent pour ne pas lancer un texte manifestement plus long que le quota restant.
        const words = prompt.split(/\s+/).filter(Boolean).length;
        const minimumEstimate = Math.ceil(words / 3);
        const day = ttsDay();
        const currentQuota = await getTtsQuota(env, user.id);
        if (currentQuota.inProgress) return json({ error: "Une génération est déjà en cours sur ce compte. Attends sa fin puis réessaie.", quota: currentQuota }, 429, cors);
        if (minimumEstimate > currentQuota.remainingSeconds) return json({ error: "Ce texte semble trop long pour le temps vocal restant. Raccourcis-le puis réessaie.", quota: currentQuota }, 429, cors);
        reservation = await reserveTtsQuota(env, user.id, day);
        if (reservation.error === "quota") return json({ error: "Tu as atteint les 3 minutes de voix disponibles aujourd’hui. Le compteur sera renouvelé à minuit.", quota: reservation.quota }, 429, cors);
        if (reservation.error === "busy") return json({ error: "Une génération est déjà en cours sur ce compte. Attends sa fin puis réessaie.", quota: reservation.quota }, 429, cors);
        const modelInput = selected.kind === "multi" ? { prompt, lang } : { text: prompt, speaker: voice || (selected.kind === "es" ? "aquila" : "luna"), encoding: "mp3" };
        let audioBytes;
        if (selected.kind === "multi") {
          const output = await env.AI.run(selected.id, modelInput);
          if (!output || typeof output.audio !== "string" || !output.audio) throw new Error("La voix n’a renvoyé aucun fichier audio. Aucun temps n’a été décompté.");
          const binary = atob(output.audio);
          audioBytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) audioBytes[i] = binary.charCodeAt(i);
        } else {
          const raw = await env.AI.run(selected.id, modelInput, { returnRawResponse: true });
          if (!(raw instanceof Response) || !raw.ok) {
            const detail = raw instanceof Response ? await raw.text() : "";
            throw new Error("La génération a échoué." + (detail ? " " + detail.slice(0, 200) : ""));
          }
          audioBytes = new Uint8Array(await raw.arrayBuffer());
        }
        if (!audioBytes || !audioBytes.byteLength) throw new Error("Le fichier audio obtenu est vide.");
        const actualSeconds = mp3DurationSeconds(audioBytes);
        if (!actualSeconds) throw new Error("La durée du fichier audio n’a pas pu être vérifiée. Réessaie avec un texte plus court ; aucun temps n’a été décompté.");
        const settled = await settleTtsQuota(env, reservation, actualSeconds);
        reservation = null;
        if (settled.overLimit) {
          return json({ error: "Ce fichier dépasserait le temps vocal restant. Aucun audio n’a été envoyé ; raccourcis le texte puis réessaie.", quota: settled.quota }, 429, cors);
        }
        if (!settled.ok) {
          return json({ error: "Le compteur a changé pendant la génération. Par sécurité, aucun audio n’a été envoyé. Actualise le compteur puis réessaie.", quota: settled.quota }, 409, cors);
        }
        const headers = new Headers(cors);
        headers.set("Content-Type", "audio/mpeg");
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Length", String(audioBytes.byteLength));
        headers.set("X-Aurore-Audio-Seconds", String(settled.durationSeconds));
        headers.set("X-Aurore-Quota-Remaining", String(settled.quota.remainingSeconds));
        return new Response(audioBytes, { status: 200, headers });
      } catch (error) {
        try { await releaseTtsQuota(env, reservation); } catch (_) {}
        return json({ error: error instanceof Error ? error.message : "Impossible de générer la voix." }, 502, cors);
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
        const requiresCondition =
          key === "sauvegarde-memorisations.json" ||
          key === "sauvegarde-automatique/memoires-et-cartes.json" ||
          key.startsWith("archives/");
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
        // Make the comparison atomic with the R2 write itself. A HEAD check alone
        // has a race window: another save can commit after HEAD and before PUT.
        // R2 evaluates onlyIf at commit time and returns null on a conflict.
        const onlyIf = ifMatch
          ? { etagMatches: current.etag }
          : ifNoneMatch === "*"
            ? { etagDoesNotMatch: "*" }
            : undefined;
        const stored = await env.MEMORIES_BUCKET.put(objectKey, body, {
          ...(onlyIf ? { onlyIf } : {}),
          httpMetadata: {
            contentType,
            cacheControl: "private, no-store"
          },
          customMetadata: { ownerId: user.id }
        });
        if (!stored) {
          return json({ error: "Cloud object changed during the write; refresh and retry. No data was overwritten." }, 412, cors);
        }
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
