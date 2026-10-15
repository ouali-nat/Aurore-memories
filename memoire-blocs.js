(function(){
"use strict";
var KEY="aurore-memory-cards-v1",params=new URLSearchParams(location.search),deck=params.get("deck")||"",root=document.getElementById("memoryBlocks");
function read(){try{var s=JSON.parse(localStorage.getItem(KEY)||"{}");return Array.isArray(s.cards)?s.cards:[]}catch(e){return []}}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function isMemory(c){return c&&(c.kind==="memory"||/(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(c.front||"")))}
var cards=read().filter(function(c){return isMemory(c)&&c.deck===deck});
document.getElementById("memoryBlocksTitle").textContent=deck||"Mes blocs de mémoire";
document.getElementById("editMemoryLink").href="editer-memoire.html?deck="+encodeURIComponent(deck);
if(!cards.length){root.innerHTML='<div class="empty-state"><h2>Aucun bloc enregistré</h2><p>Découpe ton texte pour créer les passages à mémoriser.</p><a class="primary-btn" href="editer-memoire.html?deck='+encodeURIComponent(deck)+'">Éditer la mémoire</a></div>';return}
root.innerHTML=cards.map(function(c,i){
var href="revisions.html?deck="+encodeURIComponent(deck)+"&card="+encodeURIComponent(c.id);
return '<article class="memory-block-card"><div class="memory-block-card-head"><span class="memory-block-number">BLOC '+(i+1)+'</span><span class="memory-block-method">'+esc(c.preferredMode||"Première lettre")+'</span></div><p class="memory-block-text">'+esc(c.back).replace(/\n/g,"<br>")+'</p><div class="memory-block-actions"><a class="primary-btn" href="'+href+'">Ouvrir la méthode <span aria-hidden="true">→</span></a><a class="secondary-btn" href="editer-memoire.html?deck='+encodeURIComponent(deck)+'">Modifier</a></div></article>'
}).join("");
})();