(function(){
"use strict";
var URL_BASE="https://oegxxndiuovisustjstp.supabase.co";
var KEY="sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
var title=document.getElementById("groupTitle"),description=document.getElementById("groupDescription"),status=document.getElementById("groupStatus");
var seriesGrid=document.getElementById("sharedSeriesGrid"),joinButton=document.getElementById("joinCurrentGroup");
var ownerTools=document.getElementById("groupOwnerTools"),inviteStatus=document.getElementById("inviteStatus"),inviteActions=document.getElementById("inviteActions");
var id=new URLSearchParams(window.location.search).get("id"),inviteToken=new URLSearchParams(window.location.search).get("invite"),client=null,session=null,currentGroup=null,createdInviteUrl="";
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
var result=await client.from("study_group_shared_series").select("id,title,description,subject,cards,shared_by,created_at").eq("group_id",id).order("created_at",{ascending:false}).limit(100);
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
async function loadGroup(){
if(!id){title.textContent="Invitation ou groupe introuvable";message("Aucun groupe n’a été sélectionné.");if(inviteToken&&!session){message("Connecte-toi avec Aurore ID pour accepter cette invitation privée.");joinButton.hidden=false;joinButton.textContent="Connexion Aurore ID";}return;}
if(!client){title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");return;}
try{
var sr=await client.auth.getSession();session=sr.data.session;
if(inviteToken){if(!session){title.textContent="Invitation à un groupe privé";message("Connecte-toi avec Aurore ID pour accepter l’invitation et accéder au groupe.");joinButton.hidden=false;joinButton.textContent="Connexion Aurore ID";return;}await redeemInvitation();}
var result=await client.from("study_groups").select("id,name,description,subject,level,visibility,join_policy,max_members,created_by").eq("id",id).maybeSingle();
if(result.error||!result.data){title.textContent="Groupe inaccessible";message("Ce groupe n’existe pas ou tu n’as pas l’autorisation d’y accéder.");return;}
currentGroup=result.data;title.textContent=currentGroup.name;description.textContent=[currentGroup.description,currentGroup.subject,currentGroup.level].filter(Boolean).join(" · ")||"Un espace pour apprendre ensemble.";
var isOwner=!!(session&&session.user.id===currentGroup.created_by),isMember=false;
if(session){var membership=await client.from("study_group_members").select("group_id").eq("group_id",id).eq("user_id",session.user.id).maybeSingle();isMember=!!membership.data||isOwner;}
if(currentGroup.visibility==="public"&&!isMember){joinButton.hidden=false;joinButton.textContent=!session?"Connexion Aurore ID":currentGroup.join_policy==="open"?"Rejoindre le groupe":"Demander à rejoindre";}
else{joinButton.hidden=true;}
message(currentGroup.visibility==="private"?"Groupe privé · accès réservé à son propriétaire et aux membres autorisés.":(isMember?"Tu fais partie de ce groupe.":currentGroup.join_policy==="open"?"Groupe public · adhésion libre jusqu’à la capacité maximale.":"Groupe public · l’adhésion nécessite l’approbation du propriétaire."));
await loadSeries();await loadOwnerTools();
}catch(error){console.error("Loading group space:",error);message("Impossible de charger les informations du groupe. Réessaie.");}
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
document.getElementById("shareInviteButton").addEventListener("click",function(){if(!createdInviteUrl)return;var text="Je t’invite à rejoindre le groupe privé « "+currentGroup.name+" » sur Aurore Mémoire : "+createdInviteUrl;window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank","noopener,noreferrer");});
joinButton.addEventListener("click",function(){if(inviteToken&&!session){signIn();return;}joinGroup();});
if(window.supabase&&window.supabase.createClient){client=window.supabase.createClient(URL_BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});loadGroup();client.auth.onAuthStateChange(function(_event,next){session=next;if(next)loadGroup();});}
else{title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");}
})();