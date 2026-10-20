(function () {
  "use strict";
  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var client = null, session = null, activeFilter = "public", groups = [], joinedGroupIds = Object.create(null), loadToken = 0;
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
  async function loadGroups() {
    var requestId = ++loadToken;
    if (!client) {
      grid.setAttribute("aria-busy","false");
      grid.innerHTML='<div class="groups-error"><strong>Connexion aux groupes indisponible</strong><p>Le service de données n’a pas pu être initialisé. Recharge la page dans quelques instants.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
      var retry=document.getElementById("retryGroups"); if(retry)retry.addEventListener("click",loadGroups);
      return;
    }
    grid.setAttribute("aria-busy","true");
    grid.innerHTML='<div class="groups-loading"><strong>Chargement des groupes…</strong><p>Un instant.</p></div>';
    try {
      var result = await client.from("study_groups").select("id,name,description,subject,level,visibility,join_policy,max_members,cover_url,created_by,created_at").order("created_at",{ascending:false}).limit(100);
      if (result.error) throw result.error;
      if (requestId !== loadToken) return;
      groups = result.data || [];
      joinedGroupIds = Object.create(null);
      if (signedIn()) {
        var memberships = await client.from("study_group_members").select("group_id").eq("user_id", session.user.id);
        if (memberships.error) throw memberships.error;
        if (requestId !== loadToken) return;
        (memberships.data || []).forEach(function (row) { joinedGroupIds[row.group_id] = true; });
      }
      renderGroups();
    } catch (error) {
      if (requestId !== loadToken) return;
      console.error("Loading study groups:",error);
      grid.innerHTML='<div class="groups-error"><strong>Impossible de charger les groupes</strong><p>Vérifie ta connexion puis réessaie. Aucun groupe fictif n’est affiché.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
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
      var title=activeFilter==="mine"?"Tes groupes apparaîtront ici":"Aucun groupe public pour le moment";
      var desc=activeFilter==="mine"?(signedIn()?"Tu n’as pas encore créé de groupe. Tu peux en créer un avec le bouton ci-dessus.":"Connecte-toi avec Aurore ID pour retrouver et créer tes groupes."):"La liste se remplira dès que des groupes publics auront été créés. Tu peux être le premier à en créer un après la connexion Aurore ID.";
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
        toast("Demande envoyée. Le propriétaire doit l’approuver.");
        button.textContent="Demande envoyée";
        return;
      }
      var result=await client.rpc("join_open_study_group",{p_group_id:groupId});
      if(result.error) throw result.error;
      joinedGroupIds[groupId]=true;
      toast("Tu as rejoint le groupe.");
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
      status.textContent = detail ? "Échec : " + detail : "La création a échoué. Vérifie ta connexion et réessaie.";
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

  (async function initializeGroups(){
    try {
      if (window.auroreAuthReady) await window.auroreAuthReady;
      if (!window.auroreAuth || !window.auroreAuth.client) throw new Error("Le client Aurore ID n’est pas initialisé.");
      client = window.auroreAuth.client;
      await loadSession();
      await loadGroups();
    } catch (error) {
      console.error("Initialisation des groupes:", error);
      grid.setAttribute("aria-busy","false");
      grid.innerHTML='<div class="groups-error"><strong>Connexion aux groupes indisponible</strong><p>La session Aurore ID n’a pas pu être restaurée. Vérifie ta connexion puis réessaie ; aucun groupe ni compte n’a été modifié.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
      var retry=document.getElementById("retryGroups");
      if(retry) retry.addEventListener("click", function(){ window.location.reload(); });
    }
  })();
})();