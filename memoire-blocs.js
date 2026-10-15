(function(){
"use strict";
var KEY="aurore-memory-cards-v1",params=new URLSearchParams(location.search),deck=params.get("deck")||"",root=document.getElementById("memoryBlocks");
var modes={"Toucher pour révéler":"mode-revelation.html","Curseur":"mode-curseur.html","Écouter":"mode-ecouter.html","Première lettre":"mode-premiere-lettre.html","Trous":"mode-trous.html","Réordonner":"mode-reordonner.html","Taper":"mode-taper.html","Choix multiple":"mode-choix-multiple.html","Parler":"mode-parler.html"};
function read(){try{var s=JSON.parse(localStorage.getItem(KEY)||"{}");return Array.isArray(s.cards)?s.cards:[]}catch(e){return []}}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function isMemory(c){return c&&(c.kind==="memory"||/(?:·|—|-)\\s*Morceau\\s+\\d+\\s*$/i.test(String(c.front||"")))}
var cards=read().filter(function(c){return isMemory(c)&&c.deck===deck});
document.getElementById("memoryBlocksTitle").textContent=deck||"Blocs de mémoire";
document.getElementById("editMemoryLink").href="editer-memoire.html?deck="+encodeURIComponent(deck);
if(!cards.length){root.innerHTML='<div class="empty-state"><h2>Aucun bloc enregistré</h2><p>Découpe le texte pour créer les passages à mémoriser.</p><a class="primary-btn" href="editer-memoire.html?deck='+encodeURIComponent(deck)+'">Éditer la mémoire</a></div>';return}
root.innerHTML=cards.map(function(c,i){var mode=c.preferredMode||"Première lettre",href=(modes[mode]||modes["Première lettre"])+"?deck="+encodeURIComponent(deck)+"&card="+encodeURIComponent(c.id);return '<a class="memory-block-link" href="'+href+'"><span class="memory-block-number">BLOC '+(i+1)+'</span><p>'+esc(c.back).replace(/\n/g,"<br>")+'</p><span class="memory-block-method">Méthode : '+esc(mode)+'</span><span class="memory-block-action">Mémoriser ce bloc →</span></a>'}).join("");
})();