(function () {
  "use strict";
  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var client = null, publicClient = null, session = null, activeFilter = "public", groups = [], joinedGroupIds = Object.create(null), loadToken = 0;
  var grid = document.getElementById("groupsGrid");
  var search = document.getElementById("groupSearch");
  var modal = document.getElementById("createGroupModal");
  var form = document.getElementById("createGroupForm");
  var status = document.getElementById("createGroupStatus");
  var submit = document.getElementById("submitCreateGroup");
  var loginButton = document.getElementById("auroreIdSignInButton");
  var createButton = document.getElementById("createGroupButton");

  function toast(message) {
    if (window.auroreToast) window.auroreToast(message);
    else { var el=document.getElementById("toast"); if(el){el.textContent=message;el.classList.add("show");} }
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});
  }
  function signedIn() { return !!(session && session.user); }
  function withTimeout(promise, milliseconds, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error(message)); }, milliseconds);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer); resolve(value);
      }, function (error) {
        clearTimeout(timer); reject(error);
      });
    });
  }
  function openModal() {
    if (!signedIn()) { toast("Connecte-toi avec Aurore ID pour créer un groupe."); startAuroreIdSignIn(); return; }
    status.textContent = "";
    modal.hidden = false;
    var name = form.querySelector('[name="name"]'); if(name) name.focus();
  }
  function closeModal() { modal.hidden = true; }
  async function startAuroreIdSignIn() {
    if (!client) { toast("Le service de connexion n'est pas encore disponible. Réessaie plus tard."); return; }
    try {
      var result = await client.auth.signInWithOAuth({
        provider: "custom:aurore-id",
        options: { redirectTo: window.location.origin + window.location.pathname, scopes: "openid email profile" }
      });
      if (result.error) throw result.error;
    } catch (error) {
      console.error("Aurore ID sign-in:", error);
      toast("La connexion Aurore ID a échoué. Vérifie la configuration du fournisseur dans Supabase Mémoire.");
    }
  }
  async function loadSession() {
    if (!client) return;
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    if (window.__auroreGroupsAuthSubscription && window.__auroreGroupsAuthSubscription.data && window.__auroreGroupsAuthSubscription.data.subscription) { window.__auroreGroupsAuthSubscription.data.subscription.unsubscribe(); }
    window.__auroreGroupsAuthSubscription = client.auth.onAuthStateChange(function (_event, nextSession) {
      session = nextSession;
      updateAuthButtons();
      loadGroups();
    });
    updateAuthButtons();
  }
  function updateAuthButtons() {
    loginButton.textContent = signedIn() ? "Connecté · " + (session.user.user_metadata && (session.user.user_metadata.full_name || session.user.user_metadata.name) || session.user.email || "Compte") : "Connexion Aurore ID";
    loginButton.title = signedIn() ? "Compte connecté" : "Se connecter avec Aurore ID";
    createButton.textContent = signedIn() ? "＋ Créer un groupe" : "＋ Créer un groupe";
  }
  var PUBLIC_CACHE_KEY = "aurore-groups-public-cache-v1";
  var GROUP_COLUMNS = "id,name,description,subject,level,visibility,join_policy,max_members,cover_url,created_by,created_at";
  function readPublicCache() {
    try { var raw = JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || "null"); return raw && Array.isArray(raw.groups) ? raw.groups : null; } catch (_) { return null; }
  }
  function writePublicCache(list) {
    try { localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({ at: Date.now(), groups: list })); } catch (_) {}
  }
  // Lecture du catalogue public par simple requête HTTP : aucune dépendance à la
  // bibliothèque Supabase chargée depuis un CDN, donc plus d'attente infinie.
  async function fetchPublicGroups() {
    var lastError = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 10000);
      try {
        var response = await fetch(SUPABASE_URL + "/rest/v1/study_groups?select=" + GROUP_COLUMNS + "&visibility=eq.public&order=created_at.desc&limit=100", {
          headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, Accept: "application/json" },
          cache: "no-store",
          signal: controller ? controller.signal : undefined
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        var data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        lastError = error;
        await new Promise(function (resolve) { setTimeout(resolve, 600); });
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error("Catalogue indisponible");
  }
  async function loadGroups() {
    var requestId = ++loadToken;
    var needsClient = activeFilter !== "public" && signedIn();
    if (needsClient && !client) {
      grid.setAttribute("aria-busy","true");
      grid.innerHTML='<div class="groups-loading"><strong>Connexion au service…</strong><p>Vos groupes s’afficheront dans un instant.</p></div>';
      return;
    }
    grid.setAttribute("aria-busy","true");
    var cached = activeFilter === "public" || !signedIn() ? readPublicCache() : null;
    if (cached && cached.length) { groups = cached; renderGroups(); }
    else grid.innerHTML='<div class="groups-loading"><strong>Chargement des groupes…</strong><p>Un instant.</p></div>';
    try {
      var usePublicRead = activeFilter === "public" || !signedIn();
      var result;
      if (usePublicRead || !client) {
        result = { data: await fetchPublicGroups() };
        if (requestId !== loadToken) return;
        writePublicCache(result.data);
      } else {
        var query = client.from("study_groups").select(GROUP_COLUMNS).order("created_at",{ascending:false}).limit(100);
        result = await withTimeout(query, 12000, "La récupération des groupes prend trop de temps.");
        if (result.error) throw result.error;
        if (requestId !== loadToken) return;
      }
      groups = result.data || [];
      joinedGroupIds = Object.create(null);
      // Afficher le catalogue public immédiatement : une requête de session ou
      // d'adhésions lente ne doit jamais laisser la page bloquée sur le chargement.
      renderGroups();
      if (signedIn() && client) {
        var membershipUserId = session.user.id;
        try {
          var memberships = await withTimeout(
            client.from("study_group_members").select("group_id").eq("user_id", membershipUserId),
            7000,
            "Le chargement des adhésions prend trop de temps."
          );
          if (requestId !== loadToken || !signedIn() || session.user.id !== membershipUserId) return;
          if (memberships.error) {
            console.warn("Les adhésions aux groupes n’ont pas pu être chargées.", memberships.error);
          } else {
            (memberships.data || []).forEach(function (row) { joinedGroupIds[row.group_id] = true; });
            renderGroups();
          }
        } catch (membershipError) {
          // Le catalogue public reste visible même si la requête des adhésions échoue.
          console.warn("Adhésions indisponibles ; catalogue public conservé.", membershipError);
        }
      }
    } catch (error) {
      if (requestId !== loadToken) return;
      console.error("Loading study groups:",error);
      grid.innerHTML='<div class="groups-error"><strong>Les groupes ne sont pas disponibles pour le moment</strong><p>Vérifiez votre connexion, puis réessayez.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
      var retry=document.getElementById("retryGroups"); if(retry)retry.addEventListener("click",loadGroups);
    } finally { if (requestId === loadToken) grid.setAttribute("aria-busy","false"); }
  }
  function renderGroups() {
    var term=(search.value||"").trim().toLocaleLowerCase("fr");
    var visible=groups.filter(function(g){
      if(activeFilter==="mine" && (!signedIn() || (g.created_by!==session.user.id && !joinedGroupIds[g.id]))) return false;
      if(activeFilter==="public" && g.visibility!=="public") return false;
      var text=[g.name,g.description,g.subject,g.level].join(" ").toLocaleLowerCase("fr");
      return !term || text.includes(term);
    });
    if(!visible.length) {
      var title=activeFilter==="mine"?"Aucun groupe à afficher":"Aucun groupe public pour le moment";
      var desc=activeFilter==="mine"?(signedIn()?"Créez un groupe pour commencer à apprendre à plusieurs.":"Connectez-vous avec Aurore ID pour retrouver vos groupes."):"Les groupes publics apparaîtront ici dès leur publication.";
      grid.innerHTML='<div class="groups-empty"><strong>'+escapeHtml(title)+'</strong><p>'+escapeHtml(desc)+'</p><button class="groups-btn primary" type="button" id="emptyCreateGroup">＋ Créer un groupe</button></div>';
      var create=document.getElementById("emptyCreateGroup"); if(create)create.addEventListener("click",openModal);
      return;
    }
    grid.innerHTML=visible.map(function(g){
      var meta=[];
      if(g.subject)meta.push('<span>'+escapeHtml(g.subject)+'</span>');
      if(g.level)meta.push('<span>'+escapeHtml(g.level)+'</span>');
      var isOwner=signedIn()&&g.created_by===session.user.id, isMember=!!joinedGroupIds[g.id]||isOwner;
      var visibilityLabel=g.visibility==="private"?"🔒 Privé":"🌐 Public";
      var action=isMember?'<button class="groups-btn" type="button" data-open-group="'+escapeHtml(g.id)+'">Ouvrir le groupe ↗</button>':'<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button class="groups-btn" type="button" data-open-group="'+escapeHtml(g.id)+'">Détails</button><button class="groups-btn primary" type="button" data-join-group="'+escapeHtml(g.id)+'">'+(signedIn()?(g.join_policy==="open"?"Rejoindre":"Demander à rejoindre"):"Connexion Aurore ID")+'</button></div>';
      var cover = g.cover_url
        ? '<div class="group-cover"><img src="' + escapeHtml(g.cover_url) + '" alt="Couverture du groupe ' + escapeHtml(g.name) + '" loading="lazy"></div>'
        : '<div class="group-cover group-cover-placeholder" aria-hidden="true"><span>AURORE · ÉTUDE</span><b>♧</b></div>';
      return '<article class="group-card">' + cover + '<div class="group-card-body"><div class="group-card-top"><span class="group-card-symbol" aria-hidden="true">♧</span><span class="group-visibility">' + visibilityLabel + '</span></div><h2>'+escapeHtml(g.name)+'</h2><p>'+escapeHtml(g.description||"Un espace d’étude pour apprendre et partager ses progrès.")+'</p><div class="group-meta">'+meta.join("")+'</div>'+action+'</div></article>';
    }).join("");
    grid.querySelectorAll("[data-open-group]").forEach(function(button){button.addEventListener("click",function(){window.location.href="groupe.html?id="+encodeURIComponent(button.dataset.openGroup);});});
    grid.querySelectorAll("[data-join-group]").forEach(function(button){button.addEventListener("click",function(){joinGroup(button.dataset.joinGroup,button);});});
  }
  async function joinGroup(groupId, button) {
    if (!signedIn()) { startAuroreIdSignIn(); return; }
    if (joinedGroupIds[groupId]) { window.location.href="groupe.html?id="+encodeURIComponent(groupId); return; }
    var group = groups.find(function (item) { return item.id === groupId; });
    if (!group || group.visibility !== "public") { toast("Ce groupe n’est pas accessible publiquement."); return; }
    button.disabled=true; button.textContent="…";
    try {
      if (group.join_policy !== "open") {
        var request = await client.from("study_group_join_requests").insert({group_id:groupId,user_id:session.user.id});
        if (request.error && request.error.code !== "23505") throw request.error;
        toast("Votre demande a été envoyée.");
        button.textContent="Demande envoyée";
        return;
      }
      var result=await client.rpc("join_open_study_group",{p_group_id:groupId});
      if(result.error) throw result.error;
      joinedGroupIds[groupId]=true;
      toast("Vous avez rejoint le groupe.");
      renderGroups();
    } catch(error) {
      console.error("Joining public group:",error);
      toast(error && error.message && error.message.includes("GROUP_FULL")?"Ce groupe a atteint sa capacité maximale.":"Impossible de rejoindre ce groupe. Réessaie après t’être reconnecté.");
      button.disabled=false; button.textContent=group.join_policy==="open"?"Rejoindre":"Demander à rejoindre";
    }
  }
  async function createGroup(event) {
    event.preventDefault();
    if(!signedIn()){status.textContent="Une connexion Aurore ID est nécessaire pour créer un groupe.";startAuroreIdSignIn();return;}
    var data=new FormData(form);
    var payload={
      name:String(data.get("name")||"").trim(),
      description:String(data.get("description")||"").trim(),
      subject:String(data.get("subject")||"").trim(),
      level:String(data.get("level")||"").trim(),
      visibility:String(data.get("visibility")||"public"),
      join_policy:String(data.get("join_policy")||"approval"),
      max_members:Number(data.get("max_members")||30),
      created_by:session.user.id
    };
    var coverFile = form.querySelector('[name="cover"]').files[0] || null;
    if (coverFile && (!/^image\/(jpeg|png|webp|avif)$/.test(coverFile.type) || coverFile.size > 5 * 1024 * 1024)) {
      status.textContent = "La couverture doit être une image JPG, PNG, WebP ou AVIF de 5 Mo maximum.";
      return;
    }
    if(payload.name.length<3){status.textContent="Le nom doit contenir au moins 3 caractères.";return;}
    submit.disabled=true; status.textContent="Création du groupe…";
    try{
      if (coverFile) {
        status.textContent = "Envoi de la couverture…";
        var extension = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/avif":"avif" })[coverFile.type];
        var objectPath = session.user.id + "/" + crypto.randomUUID() + "." + extension;
        var upload = await client.storage.from("study-group-covers").upload(objectPath, coverFile, { upsert:false, contentType:coverFile.type, cacheControl:"3600" });
        if (upload.error) throw upload.error;
        payload.cover_url = client.storage.from("study-group-covers").getPublicUrl(objectPath).data.publicUrl;
      }
      status.textContent = "Création du groupe…";
      var result=await client.from("study_groups").insert(payload).select("id").single();
      if(result.error)throw result.error;
      closeModal();form.reset();toast("Groupe créé.");await loadGroups();
      if(result.data && result.data.id)window.location.href="groupe.html?id="+encodeURIComponent(result.data.id);
    }catch(error){
      console.error("Creating study group:",error);
      var detail = [error && error.message, error && error.details, error && error.hint, error && error.code].filter(Boolean).join(" · ");
      status.textContent = "La création du groupe a échoué. Vérifiez votre connexion et réessayez.";
    }finally{submit.disabled=false;}
  }
  function setFilter(value) {
    activeFilter=value;
    document.querySelectorAll("[data-filter]").forEach(function(button){var selected=button.dataset.filter===value;button.setAttribute("aria-selected",selected?"true":"false");});
    renderGroups();
  }
  createButton.addEventListener("click",openModal);
  loginButton.addEventListener("click",function(){if(signedIn()){toast("Tu es déjà connecté.");return;}startAuroreIdSignIn();});
  document.querySelectorAll("[data-close-modal]").forEach(function(button){button.addEventListener("click",closeModal);});
  modal.addEventListener("click",function(event){if(event.target===modal)closeModal();});
  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&!modal.hidden)closeModal();});
  form.addEventListener("submit",createGroup);
  search.addEventListener("input",renderGroups);
  document.querySelectorAll("[data-filter]").forEach(function(button){button.addEventListener("click",function(){setFilter(button.dataset.filter);});});

  function initClients() {
    if (client || !(window.supabase && window.supabase.createClient)) return;
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    loadSession().then(function(){
      updateAuthButtons();
      if (signedIn() || activeFilter !== "public") loadGroups();
    }).catch(function(error){
      console.warn("Restauration de session indisponible ; les groupes publics restent consultables.",error);
      session = null;
      updateAuthButtons();
    });
  }
  window.__auroreGroupsSupabaseReady = initClients;
  // Le catalogue public s'affiche tout de suite, sans attendre la bibliothèque Supabase.
  loadGroups();
  initClients();
})();
