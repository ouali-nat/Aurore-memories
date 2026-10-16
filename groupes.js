(function () {
  "use strict";
  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var client = null, session = null, activeFilter = "public", groups = [];
  var grid = document.getElementById("groupsGrid");
  var search = document.getElementById("groupSearch");
  var modal = document.getElementById("createGroupModal");
  var form = document.getElementById("createGroupForm");
  var status = document.getElementById("createGroupStatus");
  var submit = document.getElementById("submitCreateGroup");
  var loginButton = document.getElementById("googleSignInButton");
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
    if (!signedIn()) { toast("Connecte-toi avec Google pour créer un groupe."); startGoogleSignIn(); return; }
    status.textContent = "";
    modal.hidden = false;
    var name = form.querySelector('[name="name"]'); if(name) name.focus();
  }
  function closeModal() { modal.hidden = true; }
  async function startGoogleSignIn() {
    if (!client) { toast("Le service de connexion n'est pas encore disponible. Réessaie plus tard."); return; }
    try {
      var result = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { access_type: "offline", prompt: "select_account" } }
      });
      if (result.error) throw result.error;
    } catch (error) {
      console.error("Google sign-in:", error);
      toast("La connexion Google n'est pas encore configurée. Elle sera activée après le réglage du fournisseur dans Supabase.");
    }
  }
  async function loadSession() {
    if (!client) return;
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    client.auth.onAuthStateChange(function (_event, nextSession) {
      session = nextSession;
      updateAuthButtons();
      loadGroups();
    });
    updateAuthButtons();
  }
  function updateAuthButtons() {
    loginButton.textContent = signedIn() ? "Connecté · " + (session.user.user_metadata && (session.user.user_metadata.full_name || session.user.user_metadata.name) || session.user.email || "Compte") : "Continuer avec Google";
    loginButton.title = signedIn() ? "Compte connecté" : "Se connecter avec Google";
    createButton.textContent = signedIn() ? "＋ Créer un groupe" : "＋ Créer un groupe";
  }
  async function loadGroups() {
    if (!client) {
      grid.setAttribute("aria-busy","false");
      grid.innerHTML='<div class="groups-error"><strong>Connexion aux groupes indisponible</strong><p>Le service de données n’a pas pu être initialisé. Recharge la page dans quelques instants.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
      var retry=document.getElementById("retryGroups"); if(retry)retry.addEventListener("click",loadGroups);
      return;
    }
    grid.setAttribute("aria-busy","true");
    grid.innerHTML='<div class="groups-loading"><strong>Chargement des groupes…</strong><p>Un instant.</p></div>';
    try {
      var result = await client.from("study_groups").select("id,name,description,subject,level,visibility,created_by,created_at").order("created_at",{ascending:false}).limit(100);
      if (result.error) throw result.error;
      groups = result.data || [];
      renderGroups();
    } catch (error) {
      console.error("Loading study groups:",error);
      grid.innerHTML='<div class="groups-error"><strong>Impossible de charger les groupes</strong><p>Vérifie ta connexion puis réessaie. Aucun groupe fictif n’est affiché.</p><button class="groups-btn" type="button" id="retryGroups">Réessayer</button></div>';
      var retry=document.getElementById("retryGroups"); if(retry)retry.addEventListener("click",loadGroups);
    } finally { grid.setAttribute("aria-busy","false"); }
  }
  function renderGroups() {
    var term=(search.value||"").trim().toLocaleLowerCase("fr");
    var visible=groups.filter(function(g){
      if(activeFilter==="mine" && (!signedIn() || g.created_by!==session.user.id)) return false;
      if(activeFilter==="public" && g.visibility!=="public") return false;
      var text=[g.name,g.description,g.subject,g.level].join(" ").toLocaleLowerCase("fr");
      return !term || text.includes(term);
    });
    if(!visible.length) {
      var title=activeFilter==="mine"?"Tes groupes apparaîtront ici":"Aucun groupe public pour le moment";
      var desc=activeFilter==="mine"?(signedIn()?"Tu n’as pas encore créé de groupe. Tu peux en créer un avec le bouton ci-dessus.":"Connecte-toi avec Google pour retrouver et créer tes groupes."):"La liste se remplira dès que des groupes publics auront été créés. Tu peux être le premier à en créer un après la connexion Google.";
      grid.innerHTML='<div class="groups-empty"><strong>'+escapeHtml(title)+'</strong><p>'+escapeHtml(desc)+'</p><button class="groups-btn primary" type="button" id="emptyCreateGroup">＋ Créer un groupe</button></div>';
      var create=document.getElementById("emptyCreateGroup"); if(create)create.addEventListener("click",openModal);
      return;
    }
    grid.innerHTML=visible.map(function(g){
      var meta=[];
      if(g.subject)meta.push('<span>'+escapeHtml(g.subject)+'</span>');
      if(g.level)meta.push('<span>'+escapeHtml(g.level)+'</span>');
      return '<article class="group-card"><div class="group-card-top"><span class="group-card-symbol" aria-hidden="true">♧</span><span class="group-visibility">'+(g.visibility==="public"?"🌐 Public":"🔒 Privé")+'</span></div><h2>'+escapeHtml(g.name)+'</h2><p>'+escapeHtml(g.description||"Un espace d’étude pour apprendre et partager ses progrès.")+'</p><div class="group-meta">'+meta.join("")+'</div><button class="groups-btn" type="button" data-open-group="'+escapeHtml(g.id)+'">Voir le groupe ↗</button></article>';
    }).join("");
    grid.querySelectorAll("[data-open-group]").forEach(function(button){button.addEventListener("click",function(){window.location.href="groupe.html?id="+encodeURIComponent(button.dataset.openGroup);});});
  }
  async function createGroup(event) {
    event.preventDefault();
    if(!signedIn()){status.textContent="Une connexion Google est nécessaire pour créer un groupe.";startGoogleSignIn();return;}
    var data=new FormData(form);
    var payload={
      name:String(data.get("name")||"").trim(),
      description:String(data.get("description")||"").trim(),
      subject:String(data.get("subject")||"").trim(),
      level:String(data.get("level")||"").trim(),
      visibility:String(data.get("visibility")||"public"),
      created_by:session.user.id
    };
    if(payload.name.length<3){status.textContent="Le nom doit contenir au moins 3 caractères.";return;}
    submit.disabled=true; status.textContent="Création du groupe…";
    try{
      var result=await client.from("study_groups").insert(payload).select("id").single();
      if(result.error)throw result.error;
      closeModal();form.reset();toast("Groupe créé.");await loadGroups();
      if(result.data && result.data.id)window.location.href="groupe.html?id="+encodeURIComponent(result.data.id);
    }catch(error){
      console.error("Creating study group:",error);
      status.textContent=error && error.code==="42501"?"Tu n’as pas l’autorisation de créer ce groupe. Reconnecte-toi.":"La création a échoué. Vérifie ta connexion et réessaie.";
    }finally{submit.disabled=false;}
  }
  function setFilter(value) {
    activeFilter=value;
    document.querySelectorAll("[data-filter]").forEach(function(button){var selected=button.dataset.filter===value;button.setAttribute("aria-selected",selected?"true":"false");});
    renderGroups();
  }
  createButton.addEventListener("click",openModal);
  loginButton.addEventListener("click",function(){if(signedIn()){toast("Tu es déjà connecté.");return;}startGoogleSignIn();});
  document.querySelectorAll("[data-close-modal]").forEach(function(button){button.addEventListener("click",closeModal);});
  modal.addEventListener("click",function(event){if(event.target===modal)closeModal();});
  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&!modal.hidden)closeModal();});
  form.addEventListener("submit",createGroup);
  search.addEventListener("input",renderGroups);
  document.querySelectorAll("[data-filter]").forEach(function(button){button.addEventListener("click",function(){setFilter(button.dataset.filter);});});

  if(window.supabase && window.supabase.createClient){
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    loadSession().then(loadGroups).catch(function(error){console.error(error);loadGroups();});
  } else { loadGroups(); }
})();