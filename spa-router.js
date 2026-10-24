(function(){
"use strict";
if(window.__auroreSpaRouterReady)return;window.__auroreSpaRouterReady=true;
var cache=new Map(),serial=0,activeHref=location.href,maxCache=16,warmed=new Set();
var SCROLL_KEY="aurore-spa-scroll-v1";
var PAGE_STYLE_ATTR="data-aurore-spa-page-style";
Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][href]'),function(link){link.setAttribute(PAGE_STYLE_ATTR,"true")});
var style=document.createElement("style");style.id="aurore-spa-motion-style";style.textContent="main.main-content,main.groups-main{transition:opacity .12s ease,transform .12s ease}main[aria-busy=true]{opacity:.82}main.aurore-spa-enter{animation:auroreSpaEnter .16s ease-out}@keyframes auroreSpaEnter{from{opacity:.72;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){main.main-content,main.groups-main{transition:none!important}main.aurore-spa-enter{animation:none!important}}";document.head.appendChild(style);
function urlOf(v){try{return new URL(v,location.href)}catch(e){return null}}
function pageName(u){return u?u.pathname.split("/").pop()||"index.html":""}
function eligible(u){return !!(u&&u.origin===location.origin&&/^https?:$/.test(u.protocol)&&/\.html?$/i.test(u.pathname)&&pageName(u)!=="404.html"&&pageName(u)!=="creer-memoire.html")}
function viewOnly(u){if(!u||u.pathname!==location.pathname||u.hash!==location.hash||document.body.dataset.page!=="library")return false;var a=new URLSearchParams(location.search),b=new URLSearchParams(u.search),keys=new Set(Array.from(a.keys()).concat(Array.from(b.keys())));keys.delete("view");for(var k of keys)if(a.getAll(k).join("|")!==b.getAll(k).join("|"))return false;return(a.get("view")||"all")!==(b.get("view")||"all")}
function key(u){return u.origin+u.pathname+(u.search||"")}
function routeKey(u){return (u.pathname||"")+(u.search||"")}
function readScrollMap(){try{var v=JSON.parse(sessionStorage.getItem(SCROLL_KEY)||"{}");return v&&typeof v==="object"?v:{}}catch(e){return{}}}
function writeScrollMap(map){try{var keys=Object.keys(map);if(keys.length>60)keys.slice(0,keys.length-60).forEach(function(k){delete map[k]});sessionStorage.setItem(SCROLL_KEY,JSON.stringify(map))}catch(e){}}
function saveScrollFor(url,y){if(!url)return;var map=readScrollMap();map[routeKey(url)]=Math.max(0,Math.round(y||0));writeScrollMap(map)}
function getSavedScroll(url){var map=readScrollMap(),y=url&&map[routeKey(url)];return Number.isFinite(y)?y:0}
function currentScroll(){return window.scrollY||window.pageYOffset||document.documentElement.scrollTop||0}
/* Préchauffe les scripts et feuilles de style d'une page dès que son HTML est connu :
   la navigation n'a plus qu'à les lire dans le cache HTTP. */
function warm(html,u){try{var d=new DOMParser().parseFromString(html,"text/html");[["script[src]","src","script"],['link[rel="stylesheet"][href]',"href","style"]].forEach(function(t){Array.prototype.forEach.call(d.querySelectorAll(t[0]),function(n){var x=urlOf(new URL(n.getAttribute(t[1]),u.href).href);if(!x||x.origin!==location.origin||warmed.has(x.href))return;warmed.add(x.href);if(Array.prototype.some.call(document.querySelectorAll("script[src],link[rel=stylesheet]"),function(e){return(e.src||e.href)===x.href}))return;var l=document.createElement("link");l.rel="prefetch";l.as=t[2];l.href=x.href;document.head.appendChild(l)})})}catch(e){}}
function getHtml(u){var k=key(u);var isGroupPage=/\/(?:groupes|groupe)\.html$/i.test(u.pathname);if(!isGroupPage&&cache.has(k))return cache.get(k);if(isGroupPage)cache.delete(k);var p=fetch(u.href,{credentials:"same-origin",headers:{Accept:"text/html"},cache:isGroupPage?"no-store":"force-cache"}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.text()}).then(function(t){warm(t,u);return t}).catch(function(e){cache.delete(k);throw e});cache.delete(k);cache.set(k,p);while(cache.size>maxCache)cache.delete(cache.keys().next().value);return p}
function prefetch(a){var u=urlOf(a&&a.href);if(!eligible(u)||u.pathname===location.pathname||viewOnly(u))return;getHtml(u).catch(function(){});}
document.addEventListener("pointerover",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(a&&(!e.relatedTarget||!a.contains(e.relatedTarget)))prefetch(a)},{passive:true});
document.addEventListener("touchstart",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(a)prefetch(a)},{passive:true});
document.addEventListener("focusin",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(a)prefetch(a)},{passive:true});
async function metadata(doc,u){
if(doc.title)document.title=doc.title;
["description","theme-color"].forEach(function(n){var inc=doc.querySelector('meta[name="'+n+'"]');if(!inc)return;var cur=document.querySelector('meta[name="'+n+'"]');if(!cur){cur=document.createElement("meta");cur.name=n;document.head.appendChild(cur)}cur.content=inc.content||""});
var pending=[];
var desiredStyles=new Set();
Array.prototype.forEach.call(doc.querySelectorAll('link[rel="stylesheet"][href]'),function(inc){
var href,desiredMedia;
try{href=new URL(inc.getAttribute("href"),u.href).href;desiredMedia=inc.media&&inc.media!=="all"&&inc.media!=="print"?inc.media:"all"}catch(e){return}
desiredStyles.add(href);
var link=null;
Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"][href]'),function(l){try{if(new URL(l.href,location.href).href===href){link=l;return true}}catch(e){}return false});
var created=false;
if(!link){link=document.createElement("link");link.rel="stylesheet";link.href=href;link.media="not all";created=true}
link.setAttribute(PAGE_STYLE_ATTR,"true");
var needsWait=created||!link.sheet;
if(needsWait){
var promise=new Promise(function(resolve){
var settled=false;
var done=function(){if(settled)return;settled=true;link.removeEventListener("load",done);link.removeEventListener("error",done);link.media=desiredMedia;resolve()};
link.addEventListener("load",done,{once:true});link.addEventListener("error",done,{once:true});
link.media=desiredMedia;
if(created)document.head.appendChild(link);
window.setTimeout(done,2500);
});
pending.push(promise);
}else{
/* A page may declare media="print" and switch it to "all" on load.
   During SPA navigation that lazy marker must never disable an already-loaded stylesheet. */
link.media=desiredMedia;
}
});
await Promise.all(pending);
/* Retire les feuilles de style de l’ancienne route seulement après chargement des nouvelles. */
Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][href]['+PAGE_STYLE_ATTR+']'),function(link){
var href;try{href=new URL(link.href,location.href).href}catch(e){return}
if(!desiredStyles.has(href))link.remove();
});
}
function bodyRoute(body,targetUrl){["data-page","data-mode-page"].forEach(function(n){if(body.hasAttribute(n))document.body.setAttribute(n,body.getAttribute(n));else document.body.removeAttribute(n)});if(body.className)document.body.className=body.className;else document.body.removeAttribute("class");var lock=document.getElementById("memoryAccessLock");if(lock){/* Use the destination URL: history is updated later in navigate(). */var page=pageName(targetUrl||urlOf(location.href));var visible=page==="index.html";lock.hidden=!visible;lock.setAttribute("aria-hidden",visible?"false":"true")}}
function header(doc){var a=document.querySelectorAll(".top-actions a"),b=doc.querySelectorAll(".top-actions a");for(var i=0;i<Math.min(a.length,b.length);i++){a[i].href=b[i].getAttribute("href")||b[i].href;a[i].textContent=b[i].textContent;a[i].className=b[i].className;Array.from(a[i].attributes).forEach(function(x){if(x.name.indexOf("data-")===0&&!b[i].hasAttribute(x.name))a[i].removeAttribute(x.name)});Array.from(b[i].attributes).forEach(function(x){if(x.name.indexOf("data-")===0)a[i].setAttribute(x.name,x.value)})}
var p=pageName(urlOf(location.href)),key=p==="index.html"?"home":((p==="revisions.html"||/^mode-.+\.html$/i.test(p)||p==="reviser-cartes.html")?"reviews":(p==="mes-memoires.html"||p==="choisir.html"||p==="cartes-publiques.html"?"library":(p==="groupes.html"||p==="groupe.html"?"groups":"")));
Array.prototype.forEach.call(document.querySelectorAll(".top-actions a"),function(x){var target=pageName(urlOf(x.href)),on=key&&((x.dataset.nav&&x.dataset.nav===key)||(!x.dataset.nav&&((key==="home"&&target==="index.html")||(key==="library"&&["choisir.html","mes-memoires.html","cartes-publiques.html"].indexOf(target)>=0)||(key==="reviews"&&["revisions.html","reviser-cartes.html"].indexOf(target)>=0)||(key==="groups"&&["groupes.html","groupe.html"].indexOf(target)>=0))));x.classList.toggle("active",!!on)})}
function cleanBody(main){Array.from(document.body.children).forEach(function(n){if(n===main||n.matches(".ambient-bg,header.topbar,footer.site-footer,.toast,script,.groups-modal-backdrop,.group-settings-backdrop,.memory-access-lock"))return;n.remove()})}
function loadScript(src,url){return new Promise(function(resolve,reject){var s=document.createElement("script");Array.from(src.attributes).forEach(function(a){if(a.name!=="src"&&a.name!=="async"&&a.name!=="defer")s.setAttribute(a.name,a.value)});s.async=false;s.src=new URL(src.getAttribute("src"),url.href).href;s.onload=function(){s.remove();resolve()};s.onerror=function(){s.remove();reject(Error("Échec du script "+src.getAttribute("src")))};document.body.appendChild(s)})}
function inlineScript(src){var type=(src.getAttribute("type")||"").toLowerCase();if(type&&["text/javascript","application/javascript","module"].indexOf(type)<0)return Promise.resolve();var s=document.createElement("script");Array.from(src.attributes).forEach(function(a){if(a.name!=="src")s.setAttribute(a.name,a.value)});s.textContent=src.textContent;document.body.appendChild(s);s.remove();return Promise.resolve()}
function kind(s,u){if(!s.hasAttribute("src"))return"inline";var n=pageName(urlOf(new URL(s.getAttribute("src"),u.href)));if(n==="app.js"||n==="spa-router.js")return"persistent";if(n==="math-render.js")return typeof window.renderAuroreMath==="function"?"persistent":"load";if(n==="memoire.js")return typeof window.auroreMemoryInitPage==="function"?"memory-init":"load";return"load"}
async function runScripts(doc,u){var scripts=Array.from(doc.body.querySelectorAll("script"));for(var i=0;i<scripts.length;i++){var s=scripts[i],k=kind(s,u);if(k==="persistent")continue;if(k==="memory-init"){window.auroreMemoryInitPage();continue}if(s.hasAttribute("src"))await loadScript(s,u);else await inlineScript(s)}}
function setHistory(push,u,state){try{var y=currentScroll(),old=history.state&&typeof history.state==="object"?history.state:{};saveScrollFor(urlOf(location.href),y);if(push){history.replaceState(Object.assign({},old,{__auroreSPA:true,__auroreScroll:y}),"",location.href);history.pushState({__auroreSPA:true,__auroreFrom:location.pathname+location.search+location.hash,__auroreScroll:0},"",u.href)}else history.replaceState(Object.assign({},state&&typeof state==="object"?state:{},{__auroreSPA:true}),"",u.href)}catch(e){location.assign(u.href)}}
function restoreScroll(y){var target=Math.max(0,Number(y)||0);window.scrollTo(0,target);requestAnimationFrame(function(){window.scrollTo(0,target)});setTimeout(function(){window.scrollTo(0,target)},80);setTimeout(function(){window.scrollTo(0,target)},220)}
async function navigate(value,opt){opt=opt||{};var u=urlOf(value);if(!eligible(u)){if(u)location.assign(u.href);return false}if(viewOnly(u))return false;var id=++serial,old=document.querySelector("main");if(!old){location.assign(u.href);return false}saveScrollFor(urlOf(location.href),currentScroll());old.setAttribute("aria-busy","true");var doc;try{doc=new DOMParser().parseFromString(await getHtml(u),"text/html");if(id!==serial)return false;if(!doc.querySelector("main")||doc.querySelector('meta[http-equiv="refresh" i]'))throw Error("Écran non compatible SPA")}catch(e){if(id===serial)location.assign(u.href);return false}
var main=document.importNode(doc.querySelector("main"),true);try{await metadata(doc,u)}catch(styleError){console.warn("Aurore SPA: stylesheets could not all be confirmed before navigation",styleError)}if(id!==serial)return false;old.replaceWith(main);bodyRoute(doc.body,u);header(doc);cleanBody(main);setHistory(opt.push!==false&&!opt.replace,u,opt.state);activeHref=u.href;
try{await runScripts(doc,u)}catch(e){location.assign(u.href);return false}if(id!==serial)return false;main.removeAttribute("aria-busy");main.classList.remove("aurore-spa-enter");void main.offsetWidth;main.classList.add("aurore-spa-enter");if(typeof window.auroreConfigureBackLink==="function")window.auroreConfigureBackLink();header(doc);var y=0;if(opt.push===false){if(opt.state&&Number.isFinite(opt.state.__auroreScroll))y=opt.state.__auroreScroll;else y=getSavedScroll(u)}else if(opt.replace&&opt.state&&Number.isFinite(opt.state.__auroreScroll))y=opt.state.__auroreScroll;restoreScroll(y);return true}
window.auroreNavigate=function(u,opt){opt=opt||{};return navigate(u,{push:opt.push!==false,replace:opt.replace===true,state:opt.state})};
function requiresDocumentNavigation(u){if(!u)return false;var p=pageName(u);if(p==="qcm.html"||p==="qcm-study.html"||p==="groupes.html"||p==="groupe.html")return true;if(p==="mes-memoires.html")return new URLSearchParams(u.search).get("view")==="qcm";return false}
document.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||a.hasAttribute("download")||(a.target&&a.target!=="_self")||a.hasAttribute("data-no-spa")||a.closest("[data-no-spa]"))return;var u=urlOf(a.href);if(!eligible(u))return;if(requiresDocumentNavigation(u))return;if(u.pathname===location.pathname&&u.search===location.search&&u.hash!==location.hash)return;if(viewOnly(u))return;var st=history.state;if(a.matches(".back-link")&&st&&st.__auroreSPA&&st.__auroreFrom){var from=urlOf(st.__auroreFrom);if(from&&from.pathname===u.pathname&&from.search===u.search){e.preventDefault();history.back();return}}if(a.matches(".back-link")&&history.state&&history.state.__auroreSPA&&history.state.__auroreFrom){var from=urlOf(history.state.__auroreFrom);if(from&&from.pathname===u.pathname&&from.search===u.search){e.preventDefault();history.back();return}}e.preventDefault();navigate(u,{push:true})});
window.addEventListener("popstate",function(e){var u=urlOf(location.href);if(!eligible(u)||viewOnly(u)||u.href===activeHref)return;navigate(u,{push:false,state:e.state})});
var scrollTimer=0;window.addEventListener("scroll",function(){if(scrollTimer)return;scrollTimer=window.setTimeout(function(){scrollTimer=0;try{var y=currentScroll();saveScrollFor(urlOf(location.href),y);var st=history.state&&typeof history.state==="object"?history.state:{};history.replaceState(Object.assign({},st,{__auroreSPA:true,__auroreScroll:y}),"",location.href)}catch(err){}},120)},{passive:true});
history.replaceState(Object.assign({},history.state&&typeof history.state==="object"?history.state:{},{__auroreSPA:true,__auroreScroll:currentScroll()}),"",location.href);
/* Au repos, précharge les destinations principales (sauf économie de données / 2G). */
function idle(f){(window.requestIdleCallback||function(g){return setTimeout(g,1200)})(f,{timeout:3000})}
idle(function(){var c=navigator.connection;if(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||"")))return;var seen={},n=0;Array.prototype.some.call(document.querySelectorAll(".top-actions a[href],.app-menu-panel a[href],.home-card[href],.home-action-card[href],.library-choice-card[href],.chooser-card[href]"),function(a){var u=urlOf(a.href);if(!u||!eligible(u)||u.pathname===location.pathname||viewOnly(u)||seen[key(u)])return false;seen[key(u)]=1;getHtml(u).catch(function(){});return++n>=6})});
})();


// Une reconnexion invalide les préchargements HTML mémorisés en RAM.
window.addEventListener("aurore:network-online", function () {
  try { if (cache && typeof cache.clear === "function") cache.clear(); } catch (_) {}
});

// Aurore Mémoire — notifications réseau, adaptées du composant Aurore Archives.
(function initAuroreNetworkStatus() {
  "use strict";
  if (window.__auroreNetworkStatusInstalled) return;
  window.__auroreNetworkStatusInstalled = true;

  function mount() {
    if (document.getElementById("auroreNetworkStatus")) return;
    var toast = document.createElement("div");
    toast.id = "auroreNetworkStatus";
    toast.className = "aurore-network-status";
    toast.dataset.state = "online";
    toast.hidden = true;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.innerHTML = '<span aria-hidden="true" class="aurore-network-status-icon">' +
      '<svg class="aurore-network-icon-offline" fill="none" viewBox="0 0 24 24"><path d="M3 8.5A13.7 13.7 0 0 1 12 5a13.7 13.7 0 0 1 9 3.5"/><path d="M5.5 12A9.7 9.7 0 0 1 12 9.5a9.7 9.7 0 0 1 6.5 2.5"/><path d="M8.5 15.5A5.6 5.6 0 0 1 12 14a5.6 5.6 0 0 1 3.5 1.5"/><path d="M12 19h.01"/><path d="M4 4l16 16"/></svg>' +
      '<svg class="aurore-network-icon-online" fill="none" viewBox="0 0 24 24"><path d="M3 8.5A13.7 13.7 0 0 1 12 5a13.7 13.7 0 0 1 9 3.5"/><path d="M5.5 12A9.7 9.7 0 0 1 12 9.5a9.7 9.7 0 0 1 6.5 2.5"/><path d="M8.5 15.5A5.6 5.6 0 0 1 12 14a5.6 5.6 0 0 1 3.5 1.5"/><path d="M12 19h.01"/></svg>' +
      '</span><span class="aurore-network-status-copy"><strong id="auroreNetworkStatusTitle">Connexion interrompue</strong><span id="auroreNetworkStatusText"></span></span>' +
      '<button aria-label="Fermer" class="aurore-network-status-close" id="auroreNetworkStatusClose" type="button">×</button>';
    document.body.appendChild(toast);
    initMonitor(toast);
  }

  function initMonitor(toast) {
    var title = toast.querySelector("#auroreNetworkStatusTitle");
    var text = toast.querySelector("#auroreNetworkStatusText");
    var close = toast.querySelector("#auroreNetworkStatusClose");
    var hideTimer = null, probeTimer = null, lastState = "unknown", checking = false, generation = 0;

    function show(state, heading, message, autoHide) {
      clearTimeout(hideTimer);
      toast.dataset.state = state;
      toast.classList.toggle("is-offline", state === "offline");
      toast.classList.toggle("is-online", state === "online");
      title.textContent = heading;
      text.textContent = message;
      toast.hidden = false;
      if (autoHide) hideTimer = setTimeout(function () { toast.hidden = true; }, 4200);
    }
    function hide() {
      clearTimeout(hideTimer);
      toast.hidden = true;
    }
    window.auroreAfficherNotificationReseau = function (state, message) {
      if (state === "offline") {
        document.documentElement.classList.add("aurore-offline");
        show("offline", "Connexion interrompue", message || "Internet est indisponible. Les données déjà disponibles restent consultables.", false);
      } else {
        show("online", "Connexion rétablie", message || "La connexion Internet est de nouveau disponible.", true);
      }
    };
    close.addEventListener("click", hide);

    async function probeInternet() {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (_) {} }, 4500) : null;
      try {
        var response = await fetch("/", {
          method: "HEAD",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller ? controller.signal : undefined
        });
        return !!(response && response.ok);
      } catch (_) {
        return false;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    function stopProbe() {
      if (probeTimer) clearInterval(probeTimer);
      probeTimer = null;
    }
    function scheduleProbe() {
      stopProbe();
      probeTimer = setInterval(function () {
        if (document.visibilityState !== "visible" || checking) return;
        handleNetworkChange("online", "probe");
      }, lastState === "offline" ? 15000 : 45000);
    }
    async function handleNetworkChange(state, source) {
      if (state === "offline") {
        generation++;
        checking = false;
        if (lastState === "offline") return;
        lastState = "offline";
        document.documentElement.classList.add("aurore-offline");
        show("offline", "Connexion interrompue", "Internet est indisponible ou instable. Les pages et documents déjà disponibles restent consultables.", false);
        window.dispatchEvent(new CustomEvent("aurore:network-offline", { detail: { source: source } }));
        scheduleProbe();
        return;
      }
      if (checking) return;
      checking = true;
      var current = ++generation, previous = lastState;
      var accessible = await probeInternet();
      if (current !== generation) return;
      checking = false;
      if (!accessible) {
        handleNetworkChange("offline", source + ":probe");
        return;
      }
      if (lastState === "online") return;
      lastState = "online";
      document.documentElement.classList.remove("aurore-offline");
      scheduleProbe();
      if (previous === "offline") {
        show("online", "Connexion rétablie", "Internet est de nouveau disponible. Aurore peut reprendre la synchronisation de votre espace.", true);
      } else if (previous === "unknown") {
        hide();
      } else {
        show("online", "Connexion rétablie", "Internet est de nouveau disponible.", true);
      }
      if (previous !== "unknown") {
        window.dispatchEvent(new CustomEvent("aurore:network-online", { detail: { source: source } }));
        // En ligne, demander au navigateur de vérifier les workers existants sans
        // supprimer les caches hors ligne ni toucher aux données utilisateur.
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function (registrations) {
            registrations.forEach(function (registration) {
              if (registration && typeof registration.update === "function") registration.update().catch(function () {});
            });
          }).catch(function () {});
        }
      }
    }

    window.addEventListener("online", function () {
      setTimeout(function () { handleNetworkChange("online", "event"); }, 900);
    }, { passive: true });
    window.addEventListener("offline", function () { handleNetworkChange("offline", "event"); }, { passive: true });
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      handleNetworkChange(navigator.onLine === false ? "offline" : "online", "visibility");
      if (lastState !== "unknown") scheduleProbe();
    });
    window.addEventListener("pagehide", stopProbe, { once: true });
    if (navigator.onLine === false) handleNetworkChange("offline", "initial");
    else handleNetworkChange("online", "initial");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();

