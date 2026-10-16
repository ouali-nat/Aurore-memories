(function(){
"use strict";
var URL_BASE="https://oegxxndiuovisustjstp.supabase.co";
var KEY="sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
var title=document.getElementById("groupTitle"),description=document.getElementById("groupDescription"),status=document.getElementById("groupStatus");
var seriesGrid=document.getElementById("sharedSeriesGrid"),joinButton=document.getElementById("joinCurrentGroup");
var id=new URLSearchParams(window.location.search).get("id"),client=null,session=null,currentGroup=null;
function escapeHtml(value){return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});}
function message(t){status.textContent=t;}
function toast(t){if(window.auroreToast)window.auroreToast(t);else message(t);}
async function loadSeries(){
var result=await client.from("study_group_shared_series").select("id,title,description,subject,cards,shared_by,created_at").eq("group_id",id).order("created_at",{ascending:false}).limit(100);
if(result.error)throw result.error;
var rows=result.data||[];
if(!rows.length){seriesGrid.innerHTML='<div class="groups-empty"><strong>Pas encore de cartes partagées</strong><p>Les membres pourront bientôt partager ici leurs séries de questions et de réponses.</p></div>';return;}
seriesGrid.innerHTML=rows.map(function(s){
var count=Array.isArray(s.cards)?s.cards.length:0;
return '<article class="group-card"><div class="group-card-top"><span class="group-card-symbol" aria-hidden="true">▤</span><span class="group-visibility">'+count+' carte'+(count>1?"s":"")+'</span></div><h2>'+escapeHtml(s.title)+'</h2><p>'+escapeHtml(s.description||"Série de révision partagée avec le groupe.")+'</p><div class="group-meta">'+(s.subject?'<span>'+escapeHtml(s.subject)+'</span>':"")+'</div></article>';
}).join("");
}
async function loadGroup(){
if(!id){title.textContent="Groupe introuvable";message("Aucun groupe n’a été sélectionné. Retourne à la liste des groupes.");return;}
if(!client){title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");return;}
try{
var sessionResult=await client.auth.getSession();session=sessionResult.data.session;
var result=await client.from("study_groups").select("id,name,description,subject,level,visibility,created_by").eq("id",id).maybeSingle();
if(result.error||!result.data){title.textContent="Groupe inaccessible";message("Ce groupe n’existe pas ou tu n’as pas l’autorisation d’y accéder.");return;}
currentGroup=result.data;title.textContent=currentGroup.name;description.textContent=currentGroup.description||"Un espace pour apprendre ensemble.";
var isOwner=!!(session&&session.user.id===currentGroup.created_by),isMember=false;
if(session){
var membership=await client.from("study_group_members").select("group_id").eq("group_id",id).eq("user_id",session.user.id).maybeSingle();
isMember=!!membership.data||isOwner;
}
if(currentGroup.visibility==="public"&&!isMember){joinButton.hidden=false;joinButton.textContent=session?"Rejoindre le groupe":"Se connecter pour rejoindre";}
else{joinButton.hidden=true;}
message(currentGroup.visibility==="private"?"Groupe privé · accès réservé à son propriétaire et à ses membres autorisés.":(isMember?"Tu fais partie de ce groupe.":"Groupe public · tu peux consulter les séries et rejoindre le groupe pour participer."));
await loadSeries();
}catch(error){console.error("Loading group space:",error);message("Impossible de charger les informations du groupe. Réessaie.");}
}
async function joinGroup(){
if(!client||!currentGroup)return;
if(!session){
try{var auth=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.href,queryParams:{prompt:"select_account"}}});if(auth.error)throw auth.error;}
catch(error){console.error(error);toast("La connexion Google sera disponible après sa configuration dans Supabase.");}
return;
}
joinButton.disabled=true;joinButton.textContent="…";
try{
var result=await client.from("study_group_members").insert({group_id:id,user_id:session.user.id});
if(result.error&&result.error.code!=="23505")throw result.error;
toast("Tu as rejoint le groupe.");joinButton.hidden=true;message("Tu fais partie de ce groupe.");
}catch(error){console.error(error);toast("Impossible de rejoindre le groupe. Vérifie ta connexion puis réessaie.");joinButton.disabled=false;joinButton.textContent="Rejoindre le groupe";}
}
joinButton.addEventListener("click",joinGroup);
if(window.supabase&&window.supabase.createClient){client=window.supabase.createClient(URL_BASE,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});loadGroup();}
else{title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");}
})();