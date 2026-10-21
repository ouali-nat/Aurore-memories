(function(){
"use strict";
var URL_BASE="https://oegxxndiuovisustjstp.supabase.co";
var KEY="sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
var title=document.getElementById("groupTitle"),description=document.getElementById("groupDescription"),status=document.getElementById("groupStatus");
var seriesGrid=document.getElementById("sharedSeriesGrid"),joinButton=document.getElementById("joinCurrentGroup");
var ownerTools=document.getElementById("groupOwnerTools"),inviteStatus=document.getElementById("inviteStatus"),inviteActions=document.getElementById("inviteActions");
var id=new URLSearchParams(window.location.search).get("id"),inviteToken=new URLSearchParams(window.location.search).get("invite"),client=null,publicClient=null,session=null,currentGroup=null,createdInviteUrl="";
function escapeHtml(value){return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});}
function message(t){status.textContent=t;}
function toast(t){if(window.auroreToast)window.auroreToast(t);else message(t);}
async function signIn(){try{var r=await client.auth.signInWithOAuth({provider:"custom:aurore-id",options:{redirectTo:window.location.origin+window.location.pathname+window.location.search,scopes:"openid email profile"}});if(r.error)throw r.error;}catch(e){console.error(e);toast("Connexion Aurore ID impossible. Vérifie le fournisseur configuré dans Supabase Mémoire.");}}
async function hashToken(token){var bytes=new TextEncoder().encode(token);var digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
async function redeemInvitation(){
if(!inviteToken||!session)return false;
message("Vérification du lien d’invitation…");
var result=await client.rpc("redeem_study_group_invitation",{p_token:inviteToken});
if(result.error){console.error("Redeem invitation:",result.error);message("Ce lien d’invitation est invalide, expiré, révoqué ou le groupe est complet.");return false;}
id=result.data;
var url=new URL(window.location.href);url.searchParams.delete("invite");url.searchParams.set("id",id);history.replaceState({},"",url.toString());inviteToken=null;
toast("Invitation acceptée. Bienvenue dans le groupe !");
return true;
}
async function loadSeries(){
var reader=currentGroup&&currentGroup.visibility==="public"?(publicClient||client):client;
var result=await reader.from("study_group_shared_series").select("id,title,description,subject,cards,shared_by,created_at").eq("group_id",id).order("created_at",{ascending:false}).limit(100);
if(result.error)throw result.error;
var rows=result.data||[];
if(!rows.length){seriesGrid.innerHTML='<div class="groups-empty"><strong>Pas encore de cartes partagées</strong><p>Les séries de révision partagées avec le groupe apparaîtront ici.</p></div>';return;}
seriesGrid.innerHTML=rows.map(function(s){var count=Array.isArray(s.cards)?s.cards.length:0;return '<article class="group-card"><div class="group-card-top"><span class="group-card-symbol" aria-hidden="true">▤</span><span class="group-visibility">'+count+' carte'+(count>1?"s":"")+'</span></div><h2>'+escapeHtml(s.title)+'</h2><p>'+escapeHtml(s.description||"Série de révision partagée avec le groupe.")+'</p><div class="group-meta">'+(s.subject?'<span>'+escapeHtml(s.subject)+'</span>':"")+'</div></article>';}).join("");
}
async function loadOwnerTools(){
if(!session||!currentGroup||session.user.id!==currentGroup.created_by){ownerTools.hidden=true;return;}
ownerTools.hidden=false;
var inviteControls=document.getElementById("createInviteButton");
if(currentGroup.visibility!=="private"){inviteControls.disabled=true;inviteControls.textContent="Les invitations WhatsApp sont réservées aux groupes privés";inviteStatus.textContent="Pour contrôler la confidentialité, crée un groupe privé si tu souhaites inviter des personnes via un lien."; }
var reqBox=document.getElementById("joinRequestsList"),memberBox=document.getElementById("groupMembersList");
var req=await client.from("study_group_join_requests").select("id,user_id,status,created_at").eq("group_id",id).eq("status","pending").order("created_at",{ascending:true});
if(req.error)throw req.error;
reqBox.innerHTML=(req.data||[]).length?(req.data||[]).map(function(r){return '<article class="group-card"><h3>Demande de membre</h3><p>Identifiant : '+escapeHtml(r.user_id.slice(0,8))+'…</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="groups-btn primary" data-approve-request="'+escapeHtml(r.id)+'">Accepter</button><button class="groups-btn" data-reject-request="'+escapeHtml(r.id)+'">Refuser</button></div></article>';}).join(""):'<div class="groups-empty"><p>Aucune demande en attente.</p></div>';
reqBox.querySelectorAll("[data-approve-request]").forEach(function(b){b.addEventListener("click",async function(){b.disabled=true;var a=await client.rpc("approve_study_group_join_request",{p_request_id:b.dataset.approveRequest});if(a.error){console.error(a.error);toast(a.error.message&&a.error.message.includes("GROUP_FULL")?"Le groupe a atteint sa capacité maximale.":"Impossible d’accepter cette demande.");b.disabled=false;return;}toast("Demande acceptée.");await loadOwnerTools();});});
reqBox.querySelectorAll("[data-reject-request]").forEach(function(b){b.addEventListener("click",async function(){b.disabled=true;var a=await client.rpc("reject_study_group_join_request",{p_request_id:b.dataset.rejectRequest});if(a.error){console.error(a.error);toast("Impossible de refuser cette demande.");b.disabled=false;return;}toast("Demande refusée.");await loadOwnerTools();});});
var members=await client.from("study_group_members").select("user_id,role,joined_at").eq("group_id",id).order("joined_at",{ascending:true});
if(members.error)throw members.error;
memberBox.innerHTML=(members.data||[]).length?(members.data||[]).map(function(m){return '<article class="group-card"><h3>'+(m.user_id===currentGroup.created_by?"Propriétaire · modérateur":m.role==="moderator"?"Modérateur":"Membre")+'</h3><p>Identifiant : '+escapeHtml(m.user_id.slice(0,8))+'…</p></article>';}).join(""):'<div class="groups-empty"><p>Aucun membre affichable.</p></div>';
}

/* Menu compact du groupe : les outils du propriétaire restent dans Infos du groupe. */
(function(){
 var modal=document.getElementById("groupSettingsModal"),open=document.getElementById("groupMenuButton"),close=document.getElementById("closeGroupSettings");
 if(!modal||!open||!close)return;
 function showPanel(name){
  document.querySelectorAll("[data-group-panel]").forEach(function(btn){var active=btn.getAttribute("data-group-panel")===name;btn.setAttribute("aria-selected",active?"true":"false");});
  document.getElementById("groupInfoPanel").hidden=name!=="info";
  document.getElementById("groupSettingsPanel").hidden=name!=="settings";
 }
 open.addEventListener("click",function(){modal.hidden=false;open.setAttribute("aria-expanded","true");showPanel("info");});
 close.addEventListener("click",function(){modal.hidden=true;open.setAttribute("aria-expanded","false");});
 modal.addEventListener("click",function(e){if(e.target===modal){modal.hidden=true;open.setAttribute("aria-expanded","false");}});
 document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!modal.hidden){modal.hidden=true;open.setAttribute("aria-expanded","false");}});
 document.querySelectorAll("[data-group-panel]").forEach(function(btn){btn.addEventListener("click",function(){showPanel(btn.getAttribute("data-group-panel"));});});
 var observer=new MutationObserver(function(){var tools=document.getElementById("groupOwnerTools"),empty=document.getElementById("groupInfoEmpty");if(tools&&!tools.hidden&&empty)empty.hidden=true;});
 var tools=document.getElementById("groupOwnerTools");if(tools)observer.observe(tools,{attributes:true,attributeFilter:["hidden"]});
})();

async function loadGroup(){
if(!id){
 title.textContent="Invitation ou groupe introuvable";
 message("Aucun groupe n’a été sélectionné.");
 if(inviteToken&&!session){message("Connectez-vous avec Aurore ID pour accepter cette invitation privée.");joinButton.hidden=false;joinButton.textContent="Connexion Aurore ID";}
 return;
}
if(!client){title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");return;}
try{
 // Les invitations privées exigent une session avant de révéler le groupe ou de consommer le lien.
 if(inviteToken){
  try{
   var invitationSession=await client.auth.getSession();
   session=invitationSession.data&&invitationSession.data.session||null;
  }catch(authError){session=null;}
  if(!session){
   title.textContent="Invitation à un groupe privé";
   message("Connectez-vous avec Aurore ID pour accepter cette invitation et accéder au groupe.");
   joinButton.hidden=false;
   joinButton.textContent="Connexion Aurore ID";
   return;
  }
  await redeemInvitation();
 }
 // Étape 1 : tentative anonyme isolée. Une ancienne session expirée ne peut pas bloquer la lecture publique.
 var publicRead=await (publicClient||client).from("study_groups").select("id,name,description,subject,level,visibility,join_policy,max_members,created_by,cover_url").eq("id",id).maybeSingle();
 var result=publicRead;
 // Si le groupe n'est pas public, la lecture privée n'est tentée qu'après restauration de la session.
 if((publicRead.error||!publicRead.data)&&!session){
  try{
   var sessionResult=await client.auth.getSession();
   if(sessionResult.error)throw sessionResult.error;
   session=sessionResult.data.session||null;
  }catch(sessionError){session=null;console.warn("Session indisponible pendant la vérification d'un groupe privé.",sessionError);}
 }
 if((publicRead.error||!publicRead.data)&&session){
  var authenticatedRead=await client.from("study_groups").select("id,name,description,subject,level,visibility,join_policy,max_members,created_by,cover_url").eq("id",id).maybeSingle();
  if(!authenticatedRead.error&&authenticatedRead.data)result=authenticatedRead;
  else if(publicRead.error)result=authenticatedRead;
 }
 if(result.error||!result.data){
  title.textContent="Groupe inaccessible";
  message("Ce groupe n’existe pas, est privé, ou nécessite une connexion Aurore ID.");
  joinButton.hidden=true;
  return;
 }
 currentGroup=result.data;
 title.textContent=currentGroup.name;
 description.textContent=[currentGroup.description,currentGroup.subject,currentGroup.level].filter(Boolean).join(" · ")||"Un espace pour apprendre ensemble.";
 var cover=document.getElementById("groupCover");
 if(currentGroup.cover_url){cover.innerHTML='<img src="'+escapeHtml(currentGroup.cover_url)+'" alt="Couverture de '+escapeHtml(currentGroup.name)+'">';cover.hidden=false;}
 else{cover.hidden=true;cover.innerHTML="";}
 // État visiteur immédiatement exploitable, avant la lecture facultative de la session.
 if(currentGroup.visibility==="public"){
  joinButton.hidden=false;
  joinButton.disabled=false;
  joinButton.textContent="Connexion Aurore ID";
  message("Groupe public · connectez-vous pour rejoindre le groupe ou envoyer une demande.");
 }else{
  joinButton.hidden=true;
  message("Groupe privé · accès réservé à son propriétaire et aux membres autorisés.");
 }
 // Les cartes d'un groupe public utilisent le client anonyme indépendant.
 loadSeries().catch(function(seriesError){
  console.error("Loading shared study series:",seriesError);
  seriesGrid.innerHTML='<div class="groups-empty"><strong>Les cartes partagées ne sont pas disponibles</strong><p>Les informations du groupe restent consultables. Réessayez pour afficher les séries partagées.</p></div>';
 });
 // La lecture de session affine les actions mais ne conditionne jamais l'affichage public.
 try{
  var sr=await client.auth.getSession();
  if(sr.error)throw sr.error;
  session=sr.data.session||null;
 }catch(sessionError){
  session=null;
  console.warn("Session Aurore ID indisponible ; affichage du groupe public en mode visiteur.",sessionError);
 }
 var isOwner=!!(session&&session.user&&session.user.id===currentGroup.created_by),isMember=false;
 if(session&&session.user){
  try{
   var membership=await client.from("study_group_members").select("group_id").eq("group_id",id).eq("user_id",session.user.id).maybeSingle();
   if(membership.error)throw membership.error;
   isMember=!!membership.data||isOwner;
  }catch(membershipError){
   console.warn("Statut de membre indisponible ; les informations publiques restent visibles.",membershipError);
   isMember=isOwner;
  }
 }
 if(currentGroup.visibility==="public"){
  if(isMember){
   joinButton.hidden=true;
   message("Vous faites partie de ce groupe.");
  }else{
   joinButton.hidden=false;
   joinButton.disabled=false;
   joinButton.textContent=!session?"Connexion Aurore ID":currentGroup.join_policy==="open"?"Rejoindre le groupe":"Demander à rejoindre";
   message(!session?"Groupe public · connectez-vous avec Aurore ID pour participer.":currentGroup.join_policy==="open"?"Groupe public · adhésion libre jusqu’à la capacité maximale.":"Groupe public · l’adhésion nécessite l’approbation du propriétaire.");
  }
 }else{
  joinButton.hidden=true;
  message("Groupe privé · accès réservé à son propriétaire et aux membres autorisés.");
 }
 await loadOwnerTools();
}catch(error){
 console.error("Loading group space:",error);
 if(!currentGroup){title.textContent="Impossible de charger ce groupe";message("Le service est momentanément indisponible. Les groupes publics restent visibles depuis la liste. Réessayez.");}
 else message("Les informations du groupe sont affichées, mais certaines données complémentaires n’ont pas pu être chargées.");
}
}
async function joinGroup(){
if(!client||!currentGroup)return;if(!session){await signIn();return;}
joinButton.disabled=true;joinButton.textContent="…";
try{
if(currentGroup.visibility!=="public"){toast("Ce groupe est privé. Utilise un lien d’invitation valide.");return;}
if(currentGroup.join_policy==="open"){var result=await client.rpc("join_open_study_group",{p_group_id:id});if(result.error)throw result.error;toast("Tu as rejoint le groupe.");joinButton.hidden=true;message("Tu fais partie de ce groupe.");}
else{var req=await client.from("study_group_join_requests").insert({group_id:id,user_id:session.user.id});if(req.error&&req.error.code!=="23505")throw req.error;toast("Demande envoyée au propriétaire.");joinButton.textContent="Demande envoyée";joinButton.disabled=true;}
}catch(error){console.error(error);toast(error&&error.message&&error.message.includes("GROUP_FULL")?"Ce groupe a atteint sa capacité maximale.":"Impossible de rejoindre le groupe. Vérifie les paramètres d’adhésion et réessaie.");joinButton.disabled=false;joinButton.textContent=currentGroup.join_policy==="open"?"Rejoindre le groupe":"Demander à rejoindre";}
}
async function createInvite(){
if(!session||!currentGroup||session.user.id!==currentGroup.created_by){toast("Seul le propriétaire peut créer une invitation.");return;}
if(currentGroup.visibility!=="private"){toast("Les invitations WhatsApp sont disponibles pour les groupes privés.");return;}
var button=document.getElementById("createInviteButton");button.disabled=true;inviteStatus.textContent="Création du lien sécurisé…";
try{
var bytes=new Uint8Array(32);crypto.getRandomValues(bytes);var token=Array.from(bytes).map(function(b){return b.toString(16).padStart(2,"0");}).join("");
var tokenHash=await hashToken(token),hours=Number(document.getElementById("inviteExpiry").value),maxUses=Number(document.getElementById("inviteMaxUses").value);
var expiry=hours?new Date(Date.now()+hours*3600000).toISOString():null;
var saved=await client.from("study_group_invitations").insert({group_id:id,created_by:session.user.id,token_hash:tokenHash,max_uses:maxUses,expires_at:expiry});
if(saved.error)throw saved.error;
var u=new URL("groupe.html",window.location.href);u.searchParams.set("id",id);u.searchParams.set("invite",token);createdInviteUrl=u.toString();
inviteStatus.textContent="Lien créé"+(expiry?" · expiration le "+new Date(expiry).toLocaleString("fr-FR"):" · sans expiration")+" · "+maxUses+" utilisation(s). Garde-le privé.";
inviteActions.hidden=false;
}catch(error){console.error("Create invite:",error);inviteStatus.textContent="Impossible de créer le lien. Vérifie que ce groupe t’appartient et réessaie.";}
finally{button.disabled=false;}
}
document.getElementById("createInviteButton").addEventListener("click",createInvite);
document.getElementById("copyInviteButton").addEventListener("click",async function(){if(!createdInviteUrl)return;try{await navigator.clipboard.writeText(createdInviteUrl);toast("Lien copié.");}catch(e){inviteStatus.textContent=createdInviteUrl;toast("Copie automatique indisponible : sélectionne le lien affiché.");}});
document.getElementById("shareInviteButton").addEventListener("click",function(){if(!createdInviteUrl)return;var text="Je t’invite à rejoindre le groupe privé « "+currentGroup.name+" » sur Aurore Mémoire : "+createdInviteUrl;if(navigator.share){navigator.share({title:"Invitation au groupe "+currentGroup.name,text:text,url:createdInviteUrl}).catch(function(e){if(e&&e.name!=="AbortError")window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener,noreferrer");});}else{window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener,noreferrer");}});
joinButton.addEventListener("click",function(){if(inviteToken&&!session){signIn();return;}joinGroup();});
if(window.supabase&&window.supabase.createClient){
 client=window.supabase.createClient(URL_BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 publicClient=window.supabase.createClient(URL_BASE,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:"aurore-public-groups-read-v1"}});
 client.auth.onAuthStateChange(function(event,next){
  session=next||null;
  if(event==="SIGNED_IN"||event==="SIGNED_OUT"||event==="USER_UPDATED")window.setTimeout(loadGroup,0);
 });
 loadGroup();
}
else{title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");}
})();