(function(){"use strict";
const KEY="aurore-memory-cards-v1",MODES=["Rappel actif","Texte à trous","Premières lettres","QCM","Association","Palais mental"];
const day=()=>Math.floor(Date.now()/864e5),$=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}
S=S||{cards:[],log:{},mode:"Rappel actif"};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
let queue=[],cur=null,shown=false,opts=null,picked=-1;
function streak(){let n=0,d=day();if(!S.log[d])d--;while(S.log[d]){n++;d--}return n}
function parse(text,deck){const out=[];
 text.split(/\n+/).map(l=>l.trim()).filter(Boolean).forEach(l=>{
  const m=l.split(/::|\t|;/);
  if(m.length>=2&&m[0].trim()&&m[1].trim())out.push([m[0].trim(),m.slice(1).join(" ").trim()]);
  else l.split(/(?<=[.!?])\s+/).forEach(s=>{
   const w=(s.match(/[\p{L}\d'-]{5,}/gu)||[]).sort((a,b)=>b.length-a.length)[0];
   if(w&&s.length>20)out.push([s.replace(w,"[…]"),w]);
  });
 });
 return out.map(p=>({id:Date.now()+Math.random(),deck:deck,front:p[0],back:p[1],ease:2.5,interval:0,reps:0,lapses:0,due:day()}));
}
function grade(c,g){
 if(g===0){c.lapses++;c.reps=0;c.interval=0;c.ease=Math.max(1.3,c.ease-.2);c.due=day()}
 else{
  if(g===1){c.interval=Math.max(1,Math.round(c.interval*1.2));c.ease=Math.max(1.3,c.ease-.15)}
  else if(g===2){c.interval=c.reps===0?1:c.reps===1?4:Math.round(c.interval*c.ease)}
  else{c.interval=c.reps===0?3:Math.round(Math.max(c.interval,1)*c.ease*1.3);c.ease+=.15}
  c.reps++;c.due=day()+c.interval;
 }
 S.log[day()]=(S.log[day()]||0)+1;save();
}
function startSession(deck){queue=S.cards.filter(c=>c.due<=day()&&(!deck||c.deck===deck)).sort(()=>Math.random()-.5);next()}
function next(){cur=queue.shift()||null;shown=false;picked=-1;opts=null;
 if(cur&&S.mode==="QCM"){const o=[...new Set(S.cards.filter(c=>c.id!==cur.id&&c.back!==cur.back).map(c=>c.back))].sort(()=>Math.random()-.5).slice(0,3);if(o.length===3)opts=o.concat(cur.back).sort(()=>Math.random()-.5)}
 renderSession();
}
function stats(){return '<div class="mm-stats"><span>🔥 Série : '+streak()+' j</span><span>✓ Aujourd’hui : '+(S.log[day()]||0)+'</span><span>⏰ À réviser : '+S.cards.filter(c=>c.due<=day()).length+'</span></div>'}
function renderLibrary(){
 const term=(window.auroreMemorySearch||"").trim().toLocaleLowerCase();
 const visibleCards=term?S.cards.filter(c=>[c.deck,c.front,c.back].some(v=>String(v).toLocaleLowerCase().includes(term))):S.cards;
 const d={};visibleCards.forEach(c=>{const x=d[c.deck]=d[c.deck]||{n:0,d:0};x.n++;if(c.due<=day())x.d++});
 const list=Object.keys(d).map(k=>'<div class="mm-deck"><div><strong>'+esc(k)+'</strong><small>'+d[k].n+' cartes · '+d[k].d+' à réviser</small></div><div class="mm-row"><button class="primary-btn" data-act="review" data-deck="'+esc(k)+'">Réviser</button><button class="outline-btn" data-act="del" data-deck="'+esc(k)+'">Supprimer</button></div></div>').join("")||(term?'<p class="mm-muted">Aucun résultat pour « '+esc(term)+' ».</p>':'<p class="mm-muted">Aucune mémoire pour le moment.</p>');
 $("#libraryView").innerHTML='<div class="mm"><div class="page-title"><p class="kicker">PERSONNEL</p><h2>Ma mémoire</h2><p>100 % gratuit. Tes données restent sur ton appareil.</p></div>'+stats()+(term?'<div class="mm-search-status" role="status">Résultats pour <strong>'+esc(term)+'</strong><button class="outline-btn" data-act="clear-search">Effacer la recherche</button></div>':'')+
 '<div class="mm-box"><strong>Nouvelle mémoire</strong><input id="mmTitle" placeholder="Titre (ex : Biologie chap. 3)"><textarea id="mmText" placeholder="Une carte par ligne : question :: réponse\nOu colle un cours : Aurore crée des textes à trous automatiquement."></textarea><div class="mm-row"><button class="primary-btn" data-act="create">Créer les cartes</button><label class="outline-btn" style="cursor:pointer">Importer (Anki .txt/.csv)<input type="file" id="mmFile" accept=".txt,.csv,.tsv" hidden></label></div></div>'+
 '<div class="mm-box"><strong>Mes mémoires</strong>'+list+'<div class="mm-row" style="margin-top:12px"><button class="outline-btn" data-act="export">Exporter (compatible Anki)</button></div></div></div>';
 const f=$("#mmFile");if(f)f.onchange=function(){const r=new FileReader();r.onload=()=>{$("#mmText").value=r.result;toast("Fichier chargé, clique sur Créer.")};if(f.files[0])r.readAsText(f.files[0])};
}
function renderSession(){
 const left=queue.length+(cur?1:0),done=S.log[day()]||0,pct=done+left?Math.round(done/(done+left)*100):0;
 let h='<div class="mm"><div class="page-title"><p class="kicker">ENTRAÎNEMENT</p><h2>Ma séance</h2></div>'+stats()+'<div class="mm-row">'+MODES.map(m=>'<button class="mm-chip'+(S.mode===m?' on':'')+'" data-act="mode" data-m="'+m+'">'+m+'</button>').join("")+'</div><div class="mm-bar"><i style="width:'+pct+'%"></i></div><div class="mm-box">';
 if(!S.cards.length)h+='<h3>Ta séance est vide</h3><p>Crée d’abord une mémoire.</p><button class="primary-btn" data-view="library">Ouvrir ma mémoire</button>';
 else if(!cur)h+='<h3>Séance terminée 🎉</h3><p>Rien à réviser pour le moment. Aurore te rappellera chaque carte au bon moment.</p><button class="outline-btn" data-act="review" data-deck="">Recharger</button>';
 else{
  h+='<div class="mm-q">'+esc(cur.front)+'</div>';
  if(S.mode==="Premières lettres"&&!shown)h+='<div class="mm-hint">'+esc(cur.back.split(/\s+/).map(w=>w[0]+"…").join(" "))+'</div>';
  if(opts&&S.mode==="QCM"){
   h+=opts.map((o,i)=>'<button class="mm-opt'+(shown?(o===cur.back?' ok':(i===picked?' ko':'')):'')+'" data-act="opt" data-i="'+i+'"'+(shown?' disabled':'')+'>'+esc(o)+'</button>').join("");
   if(shown)h+='<button class="primary-btn" data-act="next">Suivant</button>';
  }else if(!shown)h+='<button class="primary-btn" data-act="show">Voir la réponse</button>';
  else h+='<div class="mm-a">'+esc(cur.back)+'</div><div class="mm-grades"><button data-act="g" data-g="0">À revoir</button><button data-act="g" data-g="1">Difficile</button><button data-act="g" data-g="2">Bien</button><button data-act="g" data-g="3">Facile</button></div>';
 }
 $("#sessionView").innerHTML=h+'</div></div>';
}
function render(){renderLibrary();renderSession()}
document.addEventListener("click",function(e){
 const a=e.target.closest("[data-act]"),m=e.target.closest("[data-method]"),v=e.target.closest("[data-view]");
 if(m&&!a){e.stopPropagation();S.mode=MODES.indexOf(m.dataset.method)>-1?m.dataset.method:"Rappel actif";save();
  if(MODES.indexOf(m.dataset.method)<0)toast("« "+m.dataset.method+" » arrive bientôt. Mode Rappel actif activé.");
  if(!S.cards.length){showView("library");toast("Crée d’abord ta première mémoire.")}else{showView("session");startSession()}return}
 if(v&&!a){setTimeout(function(){if(v.dataset.view==="session"&&!cur&&!queue.length)startSession();else render()},0);return}
 if(!a)return;const t=a.dataset.act;
 if(t==="create"){const title=($("#mmTitle").value.trim()||"Ma mémoire"),c=parse($("#mmText").value,title);
  if(!c.length){toast("Rien à créer : écris « question :: réponse » ou colle un texte.");return}
  S.cards=S.cards.concat(c);save();render();toast(c.length+" cartes créées ✓")}
 else if(t==="review"){showView("session");startSession(a.dataset.deck)}
 else if(t==="del"){if(confirm("Supprimer « "+a.dataset.deck+" » ?")){S.cards=S.cards.filter(c=>c.deck!==a.dataset.deck);save();render()}}
 else if(t==="export"){const b=new Blob([S.cards.map(c=>c.front.replace(/\t/g," ")+"\t"+c.back.replace(/\t/g," ")).join("\n")],{type:"text/plain"}),l=document.createElement("a");l.href=URL.createObjectURL(b);l.download="aurore-memoire.txt";l.click()}
 else if(t==="mode"){S.mode=a.dataset.m;save();if(cur)queue.unshift(cur);next()}
 else if(t==="show"){shown=true;renderSession()}
 else if(t==="opt"){picked=+a.dataset.i;shown=true;const ok=opts[picked]===cur.back;grade(cur,ok?2:0);if(!ok)queue.push(cur);renderSession()}
 else if(t==="g"){const g=+a.dataset.g;grade(cur,g);if(g===0)queue.push(cur);next()}
 else if(t==="next")next();
},true);
window.auroreMemoryRender=render;
render();
})();
