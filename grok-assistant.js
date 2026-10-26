(function(){
"use strict";
var form=document.getElementById("grokForm"),input=document.getElementById("grokInput"),send=document.getElementById("grokSend"),messagesNode=document.getElementById("grokMessages"),statusNode=document.getElementById("grokStatus");
var history=[];
function status(s){statusNode.textContent=s}
function add(role,text){var el=document.createElement("div");el.className="grok-message "+role;el.textContent=text;messagesNode.appendChild(el);messagesNode.scrollTop=messagesNode.scrollHeight}
function getHistory(){return history.slice(-20).map(function(m){return {role:m.role,content:m.content}})}
async function submit(text){
text=String(text||"").trim();if(!text||send.disabled)return;
send.disabled=true;input.disabled=true;add("user",text);history.push({role:"user",content:text});status("Grok prépare une réponse…");
try{
var auth=await window.auroreAuthReady;
var session=await auth.getSession();
if(!session){history.pop();status("Connecte-toi avec Aurore ID pour utiliser l’assistant.");add("assistant","Pour continuer, connecte-toi avec Aurore ID puis reviens ici.");return}
var result=await auth.client.functions.invoke("aurore-grok",{body:{messages:getHistory()}});
if(result.error){var detail=result.data&&result.data.error;throw new Error(detail||result.error.message||"Appel de Grok impossible.")}
var reply=result.data&&result.data.reply;
if(typeof reply!=="string"||!reply.trim())throw new Error("Grok n’a pas renvoyé de réponse exploitable.");
history.push({role:"assistant",content:reply});add("assistant",reply);status("Réponse reçue de Grok.");
}catch(e){history.pop();status(e&&e.message?e.message:"Impossible de joindre Grok. Réessaie.");}
finally{send.disabled=false;input.disabled=false;input.focus()}
}
form.addEventListener("submit",function(e){e.preventDefault();var value=input.value;input.value="";submit(value)});
document.querySelectorAll("[data-prompt]").forEach(function(b){b.addEventListener("click",function(){input.value=b.dataset.prompt;input.focus()})});
window.addEventListener("aurore:auth-changed",function(e){status(e.detail&&e.detail.session?"Connecté avec Aurore ID.":"Connexion Aurore ID requise.")});
window.auroreAuthReady.then(async function(auth){var session=await auth.getSession();status(session?"Connecté avec Aurore ID.":"Connecte-toi avec Aurore ID pour utiliser l’assistant.");}).catch(function(){status("Le service de connexion n’a pas pu être initialisé.")});
})();