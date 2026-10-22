(function () {
"use strict";
/* Ajoute une carte « Mes audios » dans Ma bibliothèque, au même format que « Mes mémorisations » et « Mes cartes ». */
var KEY = "aurore-audio-manifest-v1";
function count() { try { var m = JSON.parse(localStorage.getItem(KEY) || "{}"); return Array.isArray(m.records) ? m.records.length : 0; } catch (_) { return 0; } }
function inject() {
  var host = document.getElementById("memoryLibrary");
  if (!host || host.querySelector("[data-audio-card]")) return;
  var tpl = host.querySelector(".library-choice-card");
  if (!tpl || !tpl.parentNode) return;
  var a = document.createElement("a");
  a.className = tpl.className.replace(/\bis-active\b/g, "").trim();
  a.href = "audio.html";
  a.setAttribute("data-audio-card", "1");
  a.innerHTML = tpl.innerHTML;
  var w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT), n, nodes = [];
  while ((n = w.nextNode())) { if (n.nodeValue.trim()) nodes.push(n); }
  var c = count();
  nodes.forEach(function (t) {
    var s = t.nodeValue.trim();
    if (/^[▤▧◎]$/.test(s)) t.nodeValue = "♫";
    else if (/^[↗→]$/.test(s)) return;
    else if (/\d/.test(s) && s.length < 30) t.nodeValue = c + (c > 1 ? " audios" : " audio");
    else if (s.length > 22) t.nodeValue = "Enregistrements, textes lus et séquences d’écoute.";
    else t.nodeValue = "Mes audios";
  });
  tpl.parentNode.appendChild(a);
}
var host = document.getElementById("memoryLibrary");
if (host && window.MutationObserver) {
  new MutationObserver(function () { inject(); }).observe(host, { childList: true, subtree: true });
}
inject();
})();
