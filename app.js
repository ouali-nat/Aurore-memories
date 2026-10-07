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