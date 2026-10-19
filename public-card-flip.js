(function(){
"use strict";
var IMG=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/i;
var blobCache=new Map();
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
/* Une même image de série est partagée par toutes ses cartes : on ne la décode qu'une fois. */
function imageUrl(src){if(blobCache.has(src))return blobCache.get(src);var out=src;try{var mime=src.slice(5,src.indexOf(";")),bin=atob(src.slice(src.indexOf(",")+1)),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);out=URL.createObjectURL(new Blob([arr],{type:mime}))}catch(e){out=src}blobCache.set(src,out);return out}
function btn(act,glyph,label,idx){var b=el("button","pf-btn"+(act==="public-add"?" pf-add":""));b.type="button";b.setAttribute("data-act",act);b.setAttribute("data-index",idx);b.setAttribute("aria-label",label);b.title=label;var s=el("span","",glyph);s.setAttribute("aria-hidden","true");b.appendChild(s);return b}
function actions(idx){var d=el("div","pf-actions");d.appendChild(btn("public-info","i","Informations sur la carte",idx));d.appendChild(btn("public-add","＋","Ajouter cette carte à ma bibliothèque",idx));return d}
function meta(series,domain){var d=el("div","pf-meta");d.appendChild(el("span","pf-chip pf-series",series));d.appendChild(el("span","pf-chip pf-domain",domain));return d}

var io=null;
if("IntersectionObserver" in window){io=new IntersectionObserver(function(entries){entries.forEach(function(e){e.target.classList.toggle("pf-live",e.isIntersecting)})},{rootMargin:"120px"})}

function enhance(card,n){
if(card.classList.contains("pf-ready"))return;
var q=card.querySelector("h2"),ans=card.querySelector(".public-card-answer"),info=card.querySelector('[data-act="public-info"]');
if(!q||!ans||!info)return;
var idx=info.getAttribute("data-index")||"0";
var s=card.querySelector(".public-series-name"),d=card.querySelector(".public-domain-chip"),hint=card.querySelector(".public-card-hint"),img=card.querySelector(".public-flashcard-art img"),ap=ans.querySelector("p:not(.public-card-eyebrow)");
var series=s?s.textContent:"",domain=d?d.textContent:"",src=img?(img.getAttribute("src")||""):"";
var qBox=el("div","pf-q"),aBox=el("div","pf-a");
Array.prototype.slice.call(q.childNodes).forEach(function(x){qBox.appendChild(x)});
if(ap)Array.prototype.slice.call(ap.childNodes).forEach(function(x){aBox.appendChild(x)});
while(ans.firstChild)ans.removeChild(ans.firstChild);
ans.classList.add("pf-body");ans.appendChild(el("p","pf-eyebrow","RÉPONSE"));ans.appendChild(aBox);
if(!hint)hint=el("span","public-card-hint","Toucher pour révéler");
hint.classList.add("pf-hint");
while(card.firstChild)card.removeChild(card.firstChild);
var flt=el("div","pf-float"),tilt=el("div","pf-tilt"),flip=el("div","pf-flip"),front=el("div","pf-face pf-front"),back=el("div","pf-face pf-back");
front.appendChild(meta(series,domain));
var fb=el("div","pf-body");fb.appendChild(el("p","pf-eyebrow","QUESTION"));fb.appendChild(qBox);front.appendChild(fb);
var ff=el("div","pf-foot");ff.appendChild(hint);ff.appendChild(actions(idx));front.appendChild(ff);
back.appendChild(meta(series,domain));back.appendChild(ans);
var bf=el("div","pf-foot");bf.appendChild(el("span","pf-hint","Toucher pour revenir"));bf.appendChild(actions(idx));back.appendChild(bf);
flip.appendChild(front);flip.appendChild(back);tilt.appendChild(flip);flt.appendChild(tilt);card.appendChild(flt);
if(IMG.test(src)){card.style.setProperty("--pf-image",'url("'+imageUrl(src)+'")');card.classList.add("pf-has-image")}
card.style.setProperty("--pf-i",String(n%7));
card.setAttribute("aria-roledescription","carte retournable");
card.classList.add("pf-ready");
if(io)io.observe(card);else card.classList.add("pf-live");
}

var queued=false;
function scan(){queued=false;var list=document.querySelectorAll(".public-flashcard:not(.pf-ready)");for(var i=0;i<list.length;i++)enhance(list[i],i);if(list.length&&typeof window.renderAuroreMath==="function"){try{window.renderAuroreMath(document.getElementById("publicCardFeed")||document.body)}catch(e){}}}
function queue(){if(queued)return;queued=true;requestAnimationFrame(scan)}

if(!window.__auroreFlipObserver){
window.__auroreFlipObserver=new MutationObserver(queue);
window.__auroreFlipObserver.observe(document.body,{childList:true,subtree:true});
document.addEventListener("pointermove",function(e){if(e.pointerType!=="mouse")return;var c=e.target.closest?e.target.closest(".public-flashcard.pf-ready"):null;if(!c)return;var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.setProperty("--ry",(x*10).toFixed(2)+"deg");c.style.setProperty("--rx",(-y*8).toFixed(2)+"deg")},{passive:true});
document.addEventListener("pointerout",function(e){var c=e.target.closest?e.target.closest(".public-flashcard.pf-ready"):null;if(!c)return;if(e.relatedTarget&&c.contains(e.relatedTarget))return;c.style.removeProperty("--rx");c.style.removeProperty("--ry")},true);
}
scan();
})();
