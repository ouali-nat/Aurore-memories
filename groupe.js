(function(){
"use strict";
var URL_BASE="https://oegxxndiuovisustjstp.supabase.co";
var KEY="sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
var title=document.getElementById("groupTitle"),description=document.getElementById("groupDescription"),status=document.getElementById("groupStatus");
var id=new URLSearchParams(window.location.search).get("id");
function message(t){status.textContent=t;}
if(!id){title.textContent="Groupe introuvable";message("Aucun groupe n’a été sélectionné. Retourne à la liste des groupes.");}
else if(window.supabase&&window.supabase.createClient){
var client=window.supabase.createClient(URL_BASE,KEY);
client.from("study_groups").select("id,name,description,subject,level,visibility,created_by").eq("id",id).maybeSingle().then(function(result){
if(result.error||!result.data){title.textContent="Groupe inaccessible";message("Ce groupe n’existe pas ou tu n’as pas l’autorisation d’y accéder.");return;}
var g=result.data;title.textContent=g.name;description.textContent=g.description||"Un espace pour apprendre ensemble.";
message(g.visibility==="private"?"Ce groupe est privé. Seuls son propriétaire et ses membres autorisés peuvent accéder à son contenu.":"Ce groupe est public. L’espace de partage des cartes sera activé dans la prochaine étape.");
}).catch(function(){title.textContent="Chargement impossible";message("Vérifie ta connexion puis retourne à la liste des groupes.");});
}else{title.textContent="Service indisponible";message("Le service des groupes n’a pas pu être initialisé.");}
})();