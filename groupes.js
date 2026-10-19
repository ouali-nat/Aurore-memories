(function () {
  "use strict";
  /* Aurore Mémoire — groupes d'étude, version rapide.
     - Affichage immédiat depuis le cache local (stale-while-revalidate).
     - Liste publique récupérée en REST, sans attendre supabase-js.
     - supabase-js chargé en parallèle, uniquement pour la session et les actions.
     - Groupes et adhésions interrogés en parallèle.
     - Navigation SPA sans rechargement (liens réels → préchargement au survol). */
  if (typeof window.__auroreGroupsCleanup === "function") { try { window.__auroreGroupsCleanup(); } catch (e) {} }

  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var SDK_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2.57.0/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://unpkg.com/@supabase/supabase-js@2"
  ];
  var COLS = "id,name,description,subject,level,visibility,join_policy,max_members,cover_url,created_by,created_at";
  var CACHE_KEY = "aurore:groups:public:v1", FRESH_MS = 20000;

  function $(id) { return document.getElementById(id); }
  var grid = $("groupsGrid"), search = $("groupSearch"), modal = $("createGroupModal"), form = $("createGroupForm");
  var status = $("createGroupStatus"), submit = $("submitCreateGroup"), loginButton = $("auroreIdSignInButton"), createButton = $("createGroupButton");
  if (!grid || !search || !modal || !form) return;

  var ac = new AbortController(), sig = { signal: ac.signal };
  window.__auroreGroupsCleanup = function () { ac.abort(); };

  var client = null, session = null, activeFilter = "public", groups = [], joined = Object.create(null);
  var personalLoaded = false, hasData = false;

  function toast(message) {
    if (window.auroreToast) window.auroreToast(message);
    else { var el = $("toast"); if (el) { el.textContent = message; el.classList.add("show"); setTimeout(function () { el.classList.remove("show"); }, 3200); } }
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; });
  }
  function signedIn() { return !!(session && session.user); }
  function go(url) { if (window.auroreNavigate) window.auroreNavigate(url); else window.location.href = url; }
  function groupUrl(id) { return "groupe.html?id=" + encodeURIComponent(id); }

  /* ---------- Cache local (groupes publics uniquement) ---------- */
  function readCache() {
    try { var d = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return d && Array.isArray(d.groups) ? d : null; } catch (e) { return null; }
  }
  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), groups: list.filter(function (g) { return g.visibility === "public"; }) })); } catch (e) {}
  }
  function dropCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  /* ---------- Réseau ---------- */
  function rest(path) {
    return fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" }, signal: ac.signal })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
    if (window.__auroreSdkPromise) return window.__auroreSdkPromise;
    window.__auroreSdkPromise = new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (window.supabase && window.supabase.createClient) return resolve(true);
        if (i >= SDK_SOURCES.length) return resolve(false);
        var s = document.createElement("script"), done = false, t;
        function end() { if (done) return; done = true; clearTimeout(t); next(); }
        s.src = SDK_SOURCES[i++]; s.async = true; s.onload = end; s.onerror = end;
        t = setTimeout(end, 8000);
        document.head.appendChild(s);
      })();
    }).then(function (ok) { if (!ok) window.__auroreSdkPromise = null; return ok; });
    return window.__auroreSdkPromise;
  }
  function ensureClient() {
    if (client) return Promise.resolve(client);
    return loadSdk().then(function (ok) {
      if (!ok) return null;
      client = window.__auroreGroupsClient || (window.__auroreGroupsClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
      if (!window.__auroreGroupsAuthBound) {
        window.__auroreGroupsAuthBound = true;
        client.auth.onAuthStateChange(function (_e, s) { if (window.__auroreGroupsAuthCb) window.__auroreGroupsAuthCb(s); });
      }
      return client;
    });
  }
  window.__auroreGroupsAuthCb = function (next) {
    session = next; updateAuthButtons();
    if (signedIn()) loadPersonal(); else { personalLoaded = false; joined = Object.create(null); renderGroups(); }
  };

  /* ---------- Authentification ---------- */
  function updateAuthButtons() {
    if (!loginButton) return;
    var meta = signedIn() && session.user.user_metadata || {};
    loginButton.textContent = signedIn() ? "Connecté · " + (meta.full_name || meta.name || session.user.email || "Compte") : "Connexion Aurore ID";
    loginButton.title = signedIn() ? "Compte connecté" : "Se connecter avec Aurore ID";
  }
  async function startAuroreIdSignIn() {
    var c = await ensureClient();
    if (!c) { toast("Le service de connexion n'est pas encore disponible. Réessaie plus tard."); return; }
    try {
      var result = await c.auth.signInWithOAuth({ provider: "custom:aurore-id", options: { redirectTo: window.location.origin + window.location.pathname, scopes: "openid email profile" } });
      if (result.error) throw result.error;
    } catch (error) {
      console.error("Aurore ID sign-in:", error);
      toast("La connexion Aurore ID a échoué. Vérifie la configuration du fournisseur dans Supabase Mémoire.");
    }
  }
  function initAuth() {
    return ensureClient().then(function (c) {
      if (!c) return null;
      return c.auth.getSession().then(function (r) { session = r && r.data ? r.data.session : null; updateAuthButtons(); return session; });
    }).catch(function (e) { console.error(e); return null; });
  }

  /* ---------- Chargement ---------- */
  function loadPublic() {
    return rest("study_groups?select=" + COLS + "&visibility=eq.public&order=created_at.desc&limit=100");
  }
  function loadPersonal() {
    if (!client || !signedIn()) return Promise.resolve(false);
    var uid = session.user.id;
    return Promise.all([
      client.from("study_groups").select(COLS).order("created_at", { ascending: false }).limit(100),
      client.from("study_group_members").select("group_id").eq("user_id", uid)
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      if (res[1].error) throw res[1].error;
      groups = res[0].data || [];
      joined = Object.create(null);
      (res[1].data || []).forEach(function (row) { joined[row.group_id] = true; });
      personalLoaded = true; hasData = true;
      writeCache(groups); renderGroups();
      return true;
    }).catch(function (e) { console.error("Loading personal groups:", e); return false; });
  }
  function showError() {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = '<div class="groups-error"><strong>Impossible de charger les groupes</strong><p>Vérifie ta connexion puis réessaie. Aucun groupe fictif n’est affiché.</p><button class="groups-btn" type="button" data-action="retry">Réessayer</button></div>';
  }
  function boot(force) {
    var cached = readCache();
    if (cached && !hasData) { groups = cached.groups; hasData = true; renderGroups(); }
    var fresh = !force && cached && Date.now() - cached.t < FRESH_MS;
    var pub = fresh ? Promise.resolve(null) : loadPublic().catch(function (e) { console.warn("REST groups:", e); return null; });
    var auth = initAuth().then(function () { return signedIn() ? loadPersonal() : false; });
    pub.then(function (list) {
      if (!list) return;
      writeCache(list);
      if (!personalLoaded) { groups = list; hasData = true; renderGroups(); }
    });
    Promise.all([pub, auth]).then(function (r) {
      if (hasData) return;
      // REST indisponible : dernière chance via supabase-js.
      return ensureClient().then(function (c) {
        if (!c) return showError();
        return c.from("study_groups").select(COLS).eq("visibility", "public").order("created_at", { ascending: false }).limit(100).then(function (res) {
          if (res.error) throw res.error;
          groups = res.data || []; hasData = true; writeCache(groups); renderGroups();
        });
      }).catch(function (e) { console.error("Loading study groups:", e); showError(); });
    });
  }

  /* ---------- Rendu ---------- */
  function renderGroups() {
    var term = (search.value || "").trim().toLocaleLowerCase("fr");
    var visible = groups.filter(function (g) {
      if (activeFilter === "mine" && (!signedIn() || (g.created_by !== session.user.id && !joined[g.id]))) return false;
      if (activeFilter === "public" && g.visibility !== "public") return false;
      var text = [g.name, g.description, g.subject, g.level].join(" ").toLocaleLowerCase("fr");
      return !term || text.indexOf(term) >= 0;
    });
    grid.setAttribute("aria-busy", "false");
    if (!visible.length) {
      var title = activeFilter === "mine" ? "Tes groupes apparaîtront ici" : (term ? "Aucun résultat" : "Aucun groupe public pour le moment");
      var desc = activeFilter === "mine"
        ? (signedIn() ? "Tu n’as pas encore créé de groupe. Tu peux en créer un avec le bouton ci-dessus." : "Connecte-toi avec Aurore ID pour retrouver et créer tes groupes.")
        : (term ? "Essaie un autre mot-clé ou crée le groupe qui te manque." : "La liste se remplira dès que des groupes publics auront été créés. Tu peux être le premier à en créer un après la connexion Aurore ID.");
      grid.innerHTML = '<div class="groups-empty"><strong>' + esc(title) + '</strong><p>' + esc(desc) + '</p><button class="groups-btn primary" type="button" data-action="create">＋ Créer un groupe</button></div>';
      return;
    }
    var uid = signedIn() ? session.user.id : null;
    grid.innerHTML = visible.map(function (g, i) {
      var meta = [];
      if (g.subject) meta.push("<span>" + esc(g.subject) + "</span>");
      if (g.level) meta.push("<span>" + esc(g.level) + "</span>");
      var isMember = !!joined[g.id] || (uid && g.created_by === uid), href = groupUrl(g.id);
      var joinLabel = signedIn() ? (g.join_policy === "open" ? "Rejoindre" : "Demander à rejoindre") : "Connexion Aurore ID";
      var action = isMember
        ? '<a class="groups-btn" href="' + esc(href) + '">Ouvrir le groupe ↗</a>'
        : '<div class="group-actions"><a class="groups-btn" href="' + esc(href) + '">Détails</a><button class="groups-btn primary" type="button" data-join-group="' + esc(g.id) + '">' + esc(joinLabel) + "</button></div>";
      var cover = g.cover_url
        ? '<a class="group-cover" href="' + esc(href) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(g.cover_url) + '" alt="" width="640" height="480" loading="' + (i < 2 ? "eager" : "lazy") + '" decoding="async"' + (i < 2 ? ' fetchpriority="high"' : "") + "></a>"
        : '<a class="group-cover group-cover-placeholder" href="' + esc(href) + '" tabindex="-1" aria-hidden="true"><span>AURORE · ÉTUDE</span><b>♧</b></a>';
      return '<article class="group-card">' + cover + '<div class="group-card-body"><div class="group-card-top"><span class="group-card-symbol" aria-hidden="true">♧</span><span class="group-visibility">' + (g.visibility === "private" ? "🔒 Privé" : "🌐 Public") + '</span></div><h2><a href="' + esc(href) + '">' + esc(g.name) + "</a></h2><p>" + esc(g.description || "Un espace d’étude pour apprendre et partager ses progrès.") + '</p><div class="group-meta">' + meta.join("") + "</div>" + action + "</div></article>";
    }).join("");
  }

  /* ---------- Actions ---------- */
  async function openModal() {
    if (!session) await initAuth();
    if (!signedIn()) { toast("Connecte-toi avec Aurore ID pour créer un groupe."); startAuroreIdSignIn(); return; }
    status.textContent = "";
    modal.hidden = false;
    var name = form.querySelector('[name="name"]'); if (name) name.focus();
  }
  function closeModal() { modal.hidden = true; }
  async function joinGroup(groupId, button) {
    if (!signedIn()) { startAuroreIdSignIn(); return; }
    if (joined[groupId]) { go(groupUrl(groupId)); return; }
    var group = groups.find(function (item) { return item.id === groupId; });
    if (!group || group.visibility !== "public") { toast("Ce groupe n’est pas accessible publiquement."); return; }
    var idle = button.textContent;
    button.disabled = true; button.textContent = "…";
    try {
      var c = await ensureClient();
      if (group.join_policy !== "open") {
        var request = await c.from("study_group_join_requests").insert({ group_id: groupId, user_id: session.user.id });
        if (request.error && request.error.code !== "23505") throw request.error;
        toast("Demande envoyée. Le propriétaire doit l’approuver.");
        button.textContent = "Demande envoyée";
        return;
      }
      var result = await c.rpc("join_open_study_group", { p_group_id: groupId });
      if (result.error) throw result.error;
      joined[groupId] = true;
      toast("Tu as rejoint le groupe.");
      renderGroups();
    } catch (error) {
      console.error("Joining public group:", error);
      toast(error && error.message && error.message.indexOf("GROUP_FULL") >= 0 ? "Ce groupe a atteint sa capacité maximale." : "Impossible de rejoindre ce groupe. Réessaie après t’être reconnecté.");
      button.disabled = false; button.textContent = idle;
    }
  }
  async function createGroup(event) {
    event.preventDefault();
    if (!signedIn()) { status.textContent = "Une connexion Aurore ID est nécessaire pour créer un groupe."; startAuroreIdSignIn(); return; }
    var data = new FormData(form);
    var payload = {
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim(),
      subject: String(data.get("subject") || "").trim(),
      level: String(data.get("level") || "").trim(),
      visibility: String(data.get("visibility") || "public"),
      join_policy: String(data.get("join_policy") || "approval"),
      max_members: Number(data.get("max_members") || 30),
      created_by: session.user.id
    };
    var coverFile = form.querySelector('[name="cover"]').files[0] || null;
    if (coverFile && (!/^image\/(jpeg|png|webp|avif)$/.test(coverFile.type) || coverFile.size > 5 * 1024 * 1024)) {
      status.textContent = "La couverture doit être une image JPG, PNG, WebP ou AVIF de 5 Mo maximum.";
      return;
    }
    if (payload.name.length < 3) { status.textContent = "Le nom doit contenir au moins 3 caractères."; return; }
    submit.disabled = true; status.textContent = "Création du groupe…";
    try {
      var c = await ensureClient();
      if (coverFile) {
        status.textContent = "Envoi de la couverture…";
        var extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[coverFile.type];
        var objectPath = session.user.id + "/" + crypto.randomUUID() + "." + extension;
        var upload = await c.storage.from("study-group-covers").upload(objectPath, coverFile, { upsert: false, contentType: coverFile.type, cacheControl: "3600" });
        if (upload.error) throw upload.error;
        payload.cover_url = c.storage.from("study-group-covers").getPublicUrl(objectPath).data.publicUrl;
      }
      status.textContent = "Création du groupe…";
      var result = await c.from("study_groups").insert(payload).select("id").single();
      if (result.error) throw result.error;
      dropCache(); closeModal(); form.reset(); toast("Groupe créé.");
      if (result.data && result.data.id) go(groupUrl(result.data.id)); else boot(true);
    } catch (error) {
      console.error("Creating study group:", error);
      var detail = [error && error.message, error && error.details, error && error.hint, error && error.code].filter(Boolean).join(" · ");
      status.textContent = detail ? "Échec : " + detail : "La création a échoué. Vérifie ta connexion et réessaie.";
    } finally { submit.disabled = false; }
  }
  function setFilter(value) {
    activeFilter = value;
    document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.filter === value ? "true" : "false"); });
    renderGroups();
  }

  /* ---------- Événements (délégués, nettoyés à chaque navigation) ---------- */
  grid.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-join-group],[data-action]") : null;
    if (!t) return;
    if (t.dataset.joinGroup) joinGroup(t.dataset.joinGroup, t);
    else if (t.dataset.action === "create") openModal();
    else if (t.dataset.action === "retry") { grid.innerHTML = skeleton(); boot(true); }
  }, sig);
  if (createButton) createButton.addEventListener("click", openModal, sig);
  if (loginButton) loginButton.addEventListener("click", function () { if (signedIn()) { toast("Tu es déjà connecté."); return; } startAuroreIdSignIn(); }, sig);
  document.querySelectorAll("[data-close-modal]").forEach(function (b) { b.addEventListener("click", closeModal, sig); });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); }, sig);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); }, sig);
  form.addEventListener("submit", createGroup, sig);
  var typing = 0;
  search.addEventListener("input", function () { clearTimeout(typing); typing = setTimeout(renderGroups, 110); }, sig);
  document.querySelectorAll("[data-filter]").forEach(function (b) { b.addEventListener("click", function () { setFilter(b.dataset.filter); }, sig); });

  function skeleton() {
    var card = '<div class="groups-skel-card" aria-hidden="true"><div class="sk-cover aurore-skel"></div><div class="sk-body aurore-skel"></div></div>';
    return card + card + card;
  }
  if (!readCache()) grid.innerHTML = skeleton();
  boot(false);

  /* Préchauffe le gabarit de la page de groupe pendant que le navigateur est au repos. */
  (window.requestIdleCallback || function (f) { return setTimeout(f, 1200); })(function () {
    try { fetch("groupe.html", { credentials: "same-origin", cache: "force-cache" }).catch(function () {}); } catch (e) {}
  });
})();
