const methods=[
{name:"Rappel actif",icon:"↗",color:"#8B5CF6",desc:"Cache la réponse et retrouve l'idée avec tes propres mots."},
{name:"Texte à trous",icon:"□",color:"#C084FC",desc:"Complète les passages essentiels d'un cours progressivement."},
{name:"Premières lettres",icon:"A",color:"#7C9CE0",desc:"Utilise les initiales comme tremplin pour reconstruire une notion."},
{name:"QCM",icon:"✓",color:"#E7B4A8",desc:"Teste rapidement ta reconnaissance et repère tes hésitations."},
{name:"Association",icon:"∞",color:"#7FBF9E",desc:"Relie une notion à une image, une idée ou une autre connaissance."},
{name:"Palais mental",icon:"⌂",color:"#A78BFA",desc:"Organise les connaissances dans un espace mental structuré."}];
const grid=document.querySelector("#methodGrid");
grid.innerHTML=methods.map(function(m){return '<button class="method-card" style="--method-color:'+m.color+'" data-method="'+m.name+'"><span class="method-icon">'+m.icon+'</span><h3>'+m.name+'</h3><p>'+m.desc+'</p><span class="method-arrow">→</span></button>';}).join("");
function toast(message){const t=document.querySelector("#toast");t.textContent=message;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(function(){t.classList.remove("show")},2400)}
function showView(name){document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});document.querySelector("#"+name+"View").classList.add("active");document.querySelectorAll(".nav-link").forEach(function(b){b.classList.toggle("active",b.dataset.view===name)});window.scrollTo({top:0,behavior:"smooth"})}
document.addEventListener("click",function(e){const view=e.target.closest("[data-view]");if(view){showView(view.dataset.view);return}const method=e.target.closest("[data-method]");if(method){toast("Méthode « "+method.dataset.method+" » — prête pour la prochaine étape.");return}});
document.querySelector("#themeToggle").addEventListener("click",function(){const html=document.documentElement,light=html.dataset.theme==="light";html.dataset.theme=light?"dark":"light";document.querySelector("#themeToggle").textContent=light?"☼":"☾";localStorage.setItem("aurore-memory-theme",html.dataset.theme)});
const saved=localStorage.getItem("aurore-memory-theme");if(saved){document.documentElement.dataset.theme=saved;document.querySelector("#themeToggle").textContent=saved==="light"?"☾":"☼"}
document.querySelector("#searchBtn").addEventListener("click",function(){const q=document.querySelector("#searchInput").value.trim();toast(q?"Recherche : "+q:"Choisis une notion à mémoriser.")});
document.querySelector("#searchInput").addEventListener("keydown",function(e){if(e.key==="Enter")document.querySelector("#searchBtn").click()});

/* Palette Aurore — même logique de mémorisation locale que le mode clair/sombre. */
const colorThemeNames=[
  "violet","rouge","vert","bleu","orange","rose","indigo","emeraude","lime",
  "corail","bordeaux","azur","petrole-cuivre","nuit-peche","prune-rouge",
  "terre-orange","rose-sable","sarcelle-creme"
];
const colorToggle=document.querySelector("#colorThemeToggle");
const colorPanel=document.querySelector("#colorThemePanel");

function applyColorTheme(name){
  const value=colorThemeNames.includes(name)?name:"violet";
  document.documentElement.dataset.colorTheme=value;
  localStorage.setItem("aurore-memory-color-theme",value);
  document.querySelectorAll(".color-theme-choice").forEach(function(b){
    b.setAttribute("aria-pressed",b.dataset.colorChoice===value?"true":"false");
  });
}

if(colorToggle&&colorPanel){
  colorToggle.addEventListener("click",function(e){
    e.stopPropagation();
    const open=colorToggle.getAttribute("aria-expanded")==="true";
    colorToggle.setAttribute("aria-expanded",open?"false":"true");
    colorPanel.hidden=open;
  });
  colorPanel.addEventListener("click",function(e){
    const choice=e.target.closest("[data-color-choice]");
    if(!choice)return;
    applyColorTheme(choice.dataset.colorChoice);
    colorPanel.hidden=true;
    colorToggle.setAttribute("aria-expanded","false");
  });
  document.addEventListener("click",function(e){
    if(!e.target.closest(".color-theme-wrap")){
      colorPanel.hidden=true;
      colorToggle.setAttribute("aria-expanded","false");
    }
  });
}
applyColorTheme(localStorage.getItem("aurore-memory-color-theme")||"violet");

/* Archives — morphing du héros : mêmes formes et même rythme de transformation. */
(function(){
  "use strict";
  function init(){
    const hero=document.querySelector(".hero");
    if(!hero||hero.dataset.auroreHeroMorphReady==="1")return;
    hero.dataset.auroreHeroMorphReady="1";
    hero.classList.add("aurore-hero-morph");
    function p(x,y){return Math.max(2,Math.min(98,x)).toFixed(2)+"% "+Math.max(2,Math.min(98,y)).toFixed(2)+"%"}
    function poly(sides,round,rotation){
      const r=47,rad=rotation*Math.PI/180,v=[];
      for(let i=0;i<sides;i++){const a=rad+2*Math.PI*i/sides;v.push({x:50+r*Math.cos(a),y:50+r*Math.sin(a)})}
      const n=Math.max(1,Math.round(24/sides)),pts=[];
      for(let i=0;i<sides;i++){
        const a=v[(i+sides-1)%sides],cc=v[i],b=v[(i+1)%sides];
        const q={x:cc.x+(a.x-cc.x)*round,y:cc.y+(a.y-cc.y)*round};
        const z={x:cc.x+(b.x-cc.x)*round,y:cc.y+(b.y-cc.y)*round};
        for(let j=0;j<n;j++){const t=j/n,m=1-t;pts.push(p(m*m*q.x+2*m*t*cc.x+t*t*z.x,m*m*q.y+2*m*t*cc.y+t*t*z.y))}
      }
      while(pts.length<24)pts.push(pts[pts.length-1]);
      return pts.slice(0,24).join(",");
    }
    function bubbles(lobes,baseR,amp,width,rotation){
      const pts=[];
      for(let i=0;i<24;i++){
        const theta=rotation+i*(360/24),rad=theta*Math.PI/180;let bump=0;
        for(let L=0;L<lobes;L++){
          const lobeAngle=rotation+L*(360/lobes);
          let diff=((theta-lobeAngle+540)%360)-180;
          bump+=Math.exp(-(diff*diff)/(2*width*width));
        }
        const rr=baseR+amp*bump;
        pts.push(p(50+rr*Math.cos(rad),50+rr*Math.sin(rad)));
      }
      return pts.join(",");
    }
    const shapes=[
      {name:"circle",gen:()=>poly(24,0,-90)},
      {name:"triangle",gen:()=>poly(3,.24,-90)},
      {name:"square",gen:()=>poly(4,.22,-45)},
      {name:"cube",gen:()=>poly(4,.12,-45)},
      {name:"hexagon",gen:()=>poly(6,.18,-90)},
      {name:"octagon",gen:()=>poly(8,.15,-90)},
      {name:"dodecagon",gen:()=>poly(12,.11,-90)},
      {name:"polygon24",gen:()=>poly(24,0,-90)},
      {name:"drop",gen:()=>poly(3,.28,-90)},
      {name:"leaf",gen:()=>poly(4,.42,-18)},
      {name:"bubbles3",gen:()=>bubbles(3,30,17,26,-90)},
      {name:"bubbles5",gen:()=>bubbles(5,32,13,20,-90)},
      {name:"bubbles7",gen:()=>bubbles(7,34,10,15,0)}
    ];
    let index=0,timer=0,cycles=0;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
    const motif=hero.querySelector(".hero-motif");
    if(motif&&!motif.querySelector(".hero-split-blob")){
      [1,2,3].forEach(function(n){
        const wrap=document.createElement("div");
        wrap.className="hero-split-blob";wrap.dataset.b=String(n);
        const core=document.createElement("div");core.className="hero-split-blob-core";
        wrap.appendChild(core);motif.appendChild(wrap);
      });
    }
    let splitTimerA=0,splitTimerB=0;
    function apply(){const s=shapes[index];hero.dataset.shape=s.name;hero.style.setProperty("--hero-clip","polygon("+s.gen()+")");index=(index+1)%shapes.length}
    function splitAndMerge(){
      if(reduce.matches||document.hidden||!motif)return;
      hero.classList.add("is-split");
      clearTimeout(splitTimerA);
      splitTimerA=setTimeout(()=>hero.classList.add("is-floating"),1000);
      clearTimeout(splitTimerB);
      splitTimerB=setTimeout(()=>{hero.classList.remove("is-floating");hero.classList.remove("is-split")},3200);
    }
    function schedule(){
      clearTimeout(timer);
      if(reduce.matches||document.hidden)return;
      timer=setTimeout(function(){apply();cycles++;if(cycles%4===0)splitAndMerge();schedule()},1300);
    }
    apply();index=0;cycles=0;schedule();
    document.addEventListener("visibilitychange",schedule);
    if(reduce.addEventListener)reduce.addEventListener("change",schedule);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
