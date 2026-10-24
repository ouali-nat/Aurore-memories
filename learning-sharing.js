(function () {
  "use strict";
  var URL_BASE = "https://oegxxndiuovisustjstp.supabase.co";
  var KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var DATA_KEY = "aurore-memory-cards-v1";
  var PUBLIC_MAP_KEY = "aurore-learning-public-shares-v1";
  var clientPromise;
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>\"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function readState() { try { return JSON.parse(localStorage.getItem(DATA_KEY) || "{}"); } catch (_) { return {}; } }
  function readPublicMap() { try { return JSON.parse(localStorage.getItem(PUBLIC_MAP_KEY) || "{}"); } catch (_) { return {}; } }
  function writePublicMap(v) { try { localStorage.setItem(PUBLIC_MAP_KEY, JSON.stringify(v)); } catch (_) {} }
  async function client() {
    if (clientPromise) return clientPromise;
    clientPromise = (async function () {
      if (window.auroreAuthReady) { try { await window.auroreAuthReady; } catch (_) {} }
      if (window.auroreAuth && window.auroreAuth.client) return window.auroreAuth.client;
      if (!window.supabase || !window.supabase.createClient) {
        await new Promise(function (resolve, reject) { var s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.js"; s.onload=resolve; s.onerror=function(){reject(Error("Service de partage indisponible."));}; document.head.appendChild(s); });
      }
      return window.supabase.createClient(URL_BASE, KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});
    })();
    return clientPromise;
  }
  function toast(t) { if (window.auroreToast) window.auroreToast(t); else { var n=document.getElementById("toast"); if(n)n.textContent=t; } }
  function safeName(s) { return String(s || "contenu").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90) || "contenu"; }
  function download(name, content, type) { var blob=content instanceof Blob?content:new Blob([typeof content==="string"?content:JSON.stringify(content,null,2)],{type:type||"application/json;charset=utf-8"}); var u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=safeName(name);document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},2000); }
  function resource(type, id) {
    var data=readState();
    if(type==="memory") { var cards=(data.cards||[]).filter(function(c){return (c.kind==="memory"||/(?:·|—|-)\s*Morceau\s+\d+\s*$/i.test(String(c.front||"")))&&String(c.deck)===String(id);}); return cards.length?{resource_type:type,title:String(id),description:"Mémoire organisée en passages.",subject:"",payload:{format:"aurore-memory-v1",cards:cards.map(function(c){return {front:c.front,back:c.back,kind:c.kind};})}}:null; }
    if(type==="qcm") { var q=(data.qcms||[]).find(function(x){return String(x.id)===String(id);}); return q?{resource_type:type,title:q.title||"QCM",description:"Séquence de questions à choix multiples.",subject:"",payload:{format:"aurore-qcm-v1",qcm:{id:q.id,title:q.title,questions:q.questions||[],createdAt:q.createdAt||null,updatedAt:q.updatedAt||null}}}:null; }
    if(type==="audio") {
      var api=window.auroreAudioShare,all=api&&api.list(); if(!all)return null;
      var seq=(all.sequences||[]).find(function(x){return String(x.id)===String(id);}); if(!seq)return null;
      return {resource_type:type,title:seq.name||"Séquence audio",description:"Séquence audio partagée depuis Aurore Mémoire.",subject:"",payload:{format:"aurore-audio-v1",sequence:seq,tracks:[]},audioSequence:seq};
    }
    return null;
  }
  async function groupsForUser(c, session) {
    var m=await c.from("study_group_members").select("group_id").eq("user_id",session.user.id); if(m.error)throw m.error;
    var o=await c.from("study_groups").select("id,name,subject,level,visibility").eq("created_by",session.user.id); if(o.error)throw o.error;
    var ids=(m.data||[]).map(function(x){return x.group_id;});(o.data||[]).forEach(function(x){ids.push(x.id);});ids=ids.filter(function(x,i,a){return a.indexOf(x)===i;});
    if(!ids.length)return [];
    var r=await c.from("study_groups").select("id,name,subject,level,visibility").in("id",ids).order("name");if(r.error)throw r.error;return r.data||[];
  }
  function openDialog(title, body) {
    var old=document.getElementById("learningShareModal");if(old)old.remove();
    var root=document.createElement("div");root.id="learningShareModal";root.className="sharing-modal-backdrop";
    root.innerHTML='<section class="sharing-modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header class="sharing-modal-head"><h2>'+esc(title)+'</h2><button class="sharing-modal-close" type="button" data-ls-close aria-label="Fermer">×</button></header><div class="sharing-modal-content">'+body+'</div></section>';
    document.body.appendChild(root);root.addEventListener("click",function(e){if(e.target===root||e.target.closest("[data-ls-close]"))root.remove();});return root;
  }
  async function preparePayload(c, session, groupId, item, isPublic, groupVisibility) {
    var payload=JSON.parse(JSON.stringify(item.payload||{}));
    if(item.resource_type!=="audio")return payload;
    var api=window.auroreAudioShare;if(!api)throw Error("Recharge la bibliothèque audio, puis réessaie.");
    var seq=item.audioSequence,manifest=api.list(),records=manifest.records||[];
    var trackIds=(seq.tracks||[]).map(function(t){return t.id;});
    if(!trackIds.length)throw Error("Cette séquence ne contient aucune piste.");
    var tracks=[];
    for(var i=0;i<trackIds.length;i++){
      var got=await api.getBlob(trackIds[i]),rec=got.record,track={name:rec.name||"Piste audio",kind:rec.kind||"recording",text:rec.text||"",language:rec.language||"fr-FR",voice:rec.voice||"",rate:rec.rate||1,repeat:(seq.tracks[i]&&seq.tracks[i].repeat)||1,mime:rec.mime||got.blob&&got.blob.type||""};
      if(got.blob){
        var ext=/ogg/i.test(track.mime)?"ogg":/mp4/i.test(track.mime)?"m4a":/mpeg|mp3/i.test(track.mime)?"mp3":"webm";
        var publicAsset=isPublic||groupVisibility==="public";
        var folder=publicAsset?session.user.id:groupId;
        var path=folder+"/"+crypto.randomUUID()+"/"+safeName(rec.name)+"."+ext;
        var bucket=publicAsset?"aurore-public-learning-audio":"aurore-group-learning-audio";
        var up=await c.storage.from(bucket).upload(path,got.blob,{contentType:track.mime||"application/octet-stream",upsert:false});if(up.error)throw up.error;
        track.bucket=bucket;track.path=path;
        if(publicAsset){var pub=c.storage.from(bucket).getPublicUrl(path);track.url=pub.data.publicUrl;}
      }
      tracks.push(track);
    }
    payload.tracks=tracks;return payload;
  }
  async function shareWithGroups(type,id) {
    var item=resource(type,id);if(!item){toast("Ce contenu n’est pas disponible pour le partage.");return;}
    var modal=openDialog("Partager « "+item.title+" » avec un groupe",'<p class="sharing-modal-intro">Choisis les groupes dans lesquels placer une copie de ce contenu.</p><div id="lsGroups" class="series-groups-list"><p class="sharing-modal-note">Chargement des groupes…</p></div><p id="lsStatus" class="sharing-modal-note" role="status"></p><div class="sharing-modal-actions"><button class="secondary-btn" data-ls-close type="button">Annuler</button><button class="primary-btn" id="lsConfirm" type="button">Partager</button></div>');
    var box=modal.querySelector("#lsGroups"),status=modal.querySelector("#lsStatus"),button=modal.querySelector("#lsConfirm");
    try{var c=await client(),a=await c.auth.getSession(),session=a.data&&a.data.session;if(!session)throw Error("Connecte-toi avec Aurore ID pour partager dans un groupe.");var groups=await groupsForUser(c,session);if(!groups.length){box.innerHTML='<p>Aucun groupe disponible. <a href="groupes.html">Créer ou rejoindre un groupe</a>.</p>';button.disabled=true;return;}
      box.innerHTML=groups.map(function(g){return '<label class="series-group-choice"><input type="checkbox" value="'+esc(g.id)+'"><span><strong>'+esc(g.name)+'</strong><small>'+esc([g.subject,g.level,g.visibility==="private"?"Privé":"Public"].filter(Boolean).join(" · "))+'</small></span></label>';}).join("");
      button.onclick=async function(){var ids=Array.prototype.slice.call(box.querySelectorAll("input:checked")).map(function(x){return x.value;});if(!ids.length){status.textContent="Sélectionne au moins un groupe.";return;}button.disabled=true;button.textContent="Partage…";
        try{for(var i=0;i<ids.length;i++){var group=groups.find(function(g){return String(g.id)===String(ids[i]);});var payload=await preparePayload(c,session,ids[i],item,false,group&&group.visibility);var r=await c.from("study_group_shared_resources").insert({group_id:ids[i],shared_by:session.user.id,resource_type:type,title:item.title,description:item.description,subject:item.subject||"",payload:payload});if(r.error)throw r.error;}modal.remove();toast("Contenu partagé dans "+ids.length+" groupe(s).");}
        catch(e){console.error(e);status.textContent="Le partage a échoué : "+(e.message||"vérifie les droits et la connexion.");button.disabled=false;button.textContent="Réessayer";}
      };
    }catch(e){box.innerHTML='<p>'+esc(e.message||"Impossible de charger les groupes.")+'</p>';button.disabled=true;}
  }
  async function unpublish(type,id) {
    var map=readPublicMap(),key=type+":"+id,publicId=map[key];if(!publicId){toast("Aucune publication à retirer.");return;}
    try{var c=await client(),a=await c.auth.getSession(),session=a.data&&a.data.session;if(!session)throw Error("Connecte-toi avec Aurore ID pour gérer la publication.");
      var found=await c.from("public_learning_resources").select("id,payload").eq("id",publicId).eq("author_id",session.user.id).maybeSingle();if(found.error)throw found.error;if(!found.data)throw Error("Publication introuvable ou non autorisée.");
      var tracks=(found.data.payload&&found.data.payload.tracks)||[];var paths=tracks.filter(function(t){return t.bucket==="aurore-public-learning-audio"&&t.path;}).map(function(t){return t.path;});if(paths.length){var removed=await c.storage.from("aurore-public-learning-audio").remove(paths);if(removed.error)throw removed.error;}
      var del=await c.from("public_learning_resources").delete().eq("id",publicId).eq("author_id",session.user.id);if(del.error)throw del.error;delete map[key];writePublicMap(map);toast("Contenu retiré de la page publique.");
    }catch(e){console.error(e);toast("Retrait impossible : "+(e.message||"réessaie."));}
  }
  async function publish(type,id) {
    var existing=readPublicMap()[type+":"+id];if(existing){await unpublish(type,id);return;}
    var item=resource(type,id);if(!item){toast("Ce contenu n’est pas disponible pour la publication.");return;}
    var modal=openDialog("Publier « "+item.title+" »",'<p class="sharing-modal-intro">Cette copie sera visible par toute personne qui ouvre la page publique. Ne publie pas de contenu privé ou soumis à restriction.</p><div class="sharing-form"><label for="lsAuthor">Auteur affiché<input id="lsAuthor" maxlength="120" required placeholder="Nom à afficher"></label><label for="lsSubject">Matière<input id="lsSubject" maxlength="100" placeholder="Ex. : Biologie"></label><div class="sharing-modal-actions"><button class="secondary-btn" data-ls-close type="button">Annuler</button><button class="primary-btn" id="lsPublish" type="button">Publier</button></div><p id="lsPublishStatus" class="sharing-modal-note" role="status"></p></div>');
    var btn=modal.querySelector("#lsPublish"),status=modal.querySelector("#lsPublishStatus");
    btn.onclick=async function(){var author=modal.querySelector("#lsAuthor").value.trim(),subject=modal.querySelector("#lsSubject").value.trim();if(!author){status.textContent="Indique le nom d’auteur à afficher.";return;}btn.disabled=true;btn.textContent="Publication…";
      try{var c=await client(),a=await c.auth.getSession(),session=a.data&&a.data.session;if(!session)throw Error("Connecte-toi avec Aurore ID pour publier.");item.subject=subject;var payload=await preparePayload(c,session,null,item,true);var row={resource_type:type,title:item.title,description:item.description,subject:subject,author_id:session.user.id,author_name:author,payload:payload,visibility:"public"};var saved=await c.from("public_learning_resources").insert(row).select("id").single();if(saved.error)throw saved.error;var map=readPublicMap();map[type+":"+id]=saved.data.id;writePublicMap(map);modal.remove();toast("Publication réussie dans la rubrique publique "+({memory:"Mémoires",audio:"Audios",qcm:"QCM"}[type])+".");}
      catch(e){console.error(e);status.textContent="Publication impossible : "+(e.message||"vérifie la connexion.");btn.disabled=false;btn.textContent="Réessayer";}
    };
  }
  function addLibraryActions() {
    document.querySelectorAll("#memoryList .memory-row").forEach(function(row){
      if(row.querySelector("[data-learning-share]"))return;
      var name=row.querySelector(".memory-row-main h3");if(!name)return;
      var actions=row.querySelector(".memory-row-actions");if(!actions)return;
      var kind=row.querySelector("[data-act='delete-deck']")&&row.querySelector("[data-act='delete-deck']").dataset.kind;
      var deck=row.querySelector("[data-act='delete-deck']")&&row.querySelector("[data-act='delete-deck']").dataset.deck;
      if(kind==="memory"&&deck){actions.insertAdjacentHTML("beforeend",'<button type="button" class="secondary-btn" data-learning-share data-type="memory" data-id="'+esc(deck)+'">Partager au groupe</button><button type="button" class="secondary-btn" data-learning-publish data-type="memory" data-id="'+esc(deck)+'">'+(readPublicMap()['memory:'+deck]?'Retirer du public':'Publier')+'</button>');return;}
      var qcmDelete=row.querySelector("[data-act='delete-qcm']");if(qcmDelete){var qid=qcmDelete.dataset.qcmId;actions.insertAdjacentHTML("beforeend",'<button type="button" class="secondary-btn" data-learning-share data-type="qcm" data-id="'+esc(qid)+'">Partager au groupe</button><button type="button" class="secondary-btn" data-learning-publish data-type="qcm" data-id="'+esc(qid)+'">'+(readPublicMap()['qcm:'+qid]?'Retirer du public':'Publier')+'</button>');}
    });
  }
  document.addEventListener("click",async function(e){var b=e.target.closest("[data-learning-share],[data-share-audio-sequence]");if(b){e.preventDefault();if(b.hasAttribute("data-share-audio-sequence"))await shareWithGroups("audio",b.getAttribute("data-share-audio-sequence"));else await shareWithGroups(b.dataset.type,b.dataset.id);return;}var p=e.target.closest("[data-learning-publish],[data-publish-audio-sequence]");if(p){e.preventDefault();if(p.hasAttribute("data-publish-audio-sequence")){await publish("audio",p.getAttribute("data-publish-audio-sequence"));p.textContent=readPublicMap()['audio:'+p.getAttribute("data-publish-audio-sequence")]?"Retirer du public":"Publier";}else{await publish(p.dataset.type,p.dataset.id);p.textContent=readPublicMap()[p.dataset.type+":"+p.dataset.id]?"Retirer du public":"Publier";}return;}});
  if(document.getElementById("memoryLibrary")){var target=document.getElementById("memoryLibrary");new MutationObserver(addLibraryActions).observe(target,{childList:true,subtree:true});addLibraryActions();}
  if(document.body.dataset.page==="public-cards")initPublicCatalog();
  function initPublicCatalog(){
    var oldFeed=document.getElementById("publicCardFeed");if(!oldFeed)return;
    var toolbar=document.querySelector(".public-cards-toolbar");if(!toolbar)return;
    var nav=document.createElement("nav");nav.className="public-resource-tabs";nav.setAttribute("aria-label","Catégories publiques");nav.innerHTML='<button type="button" data-public-category="cards" aria-pressed="true">Cartes</button><button type="button" data-public-category="memory" aria-pressed="false">Mémoires</button><button type="button" data-public-category="audio" aria-pressed="false">Audios</button><button type="button" data-public-category="qcm" aria-pressed="false">QCM</button>';
    var feed=document.createElement("section");feed.id="publicLearningFeed";feed.className="public-learning-feed";feed.hidden=true;feed.setAttribute("aria-live","polite");feed.innerHTML='<div class="empty-state compact-empty"><h3>Chargement des contenus publics…</h3></div>';
    toolbar.insertAdjacentElement("afterend",nav);oldFeed.insertAdjacentElement("afterend",feed);
    var active="cards",items=[];
    nav.addEventListener("click",function(e){var b=e.target.closest("[data-public-category]");if(!b)return;active=b.dataset.publicCategory;nav.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b));});oldFeed.hidden=active!=="cards";feed.hidden=active==="cards";var search=document.getElementById("publicCardSearch");if(search)search.placeholder=active==="cards"?"Rechercher une question, une réponse ou un domaine…":"Rechercher un titre, une matière ou un contenu…";if(active!=="cards")load();});
    var search=document.getElementById("publicCardSearch");if(search)search.addEventListener("input",render);
    async function load(){feed.innerHTML='<div class="empty-state compact-empty"><h3>Chargement…</h3></div>';try{var c=await client(),r=await c.from("public_learning_resources").select("id,resource_type,title,description,subject,author_name,payload,created_at").eq("visibility","public").eq("resource_type",active).order("created_at",{ascending:false}).limit(100);if(r.error)throw r.error;items=r.data||[];render();}catch(e){feed.innerHTML='<div class="empty-state compact-empty"><h3>Impossible de charger cette rubrique</h3><p>Vérifie la connexion puis réessaie.</p><button class="secondary-btn" type="button" data-public-retry>Réessayer</button></div>';}}
    function render(){if(active==="cards")return;var q=String(search&&search.value||"").toLocaleLowerCase("fr").trim();var filtered=items.filter(function(x){return !q||[x.title,x.description,x.subject,x.author_name,JSON.stringify(x.payload||{})].join(" ").toLocaleLowerCase("fr").indexOf(q)>=0;});if(!filtered.length){feed.innerHTML='<div class="empty-state compact-empty"><h3>Aucun contenu trouvé</h3><p>Cette rubrique ne contient pas encore de publication correspondant à la recherche.</p></div>';return;}feed.innerHTML='<div class="public-learning-grid">'+filtered.map(function(x){var preview=x.resource_type==="memory"?(x.payload.cards||[]).slice(0,2).map(function(c){return c.back||c.front||""}).join(" · "):x.resource_type==="qcm"?((x.payload.qcm&&x.payload.qcm.questions||[]).length+" question(s)"):((x.payload.tracks||[]).length+" piste(s) audio");return '<article class="public-learning-card"><p class="section-kicker">'+({memory:"MÉMOIRE",audio:"AUDIO",qcm:"QCM"}[x.resource_type]||"CONTENU")+'</p><h2>'+esc(x.title)+'</h2><p>'+esc(x.description||"")+'</p><small>'+esc([x.subject,x.author_name].filter(Boolean).join(" · "))+'</small><p class="public-learning-preview">'+esc(preview)+'</p><div class="public-learning-actions"><button type="button" class="primary-btn" data-public-download="'+esc(x.id)+'">Télécharger</button>'+(x.resource_type==="audio"?'<button type="button" class="secondary-btn" data-public-play="'+esc(x.id)+'">Écouter</button>':x.resource_type==="qcm"?'<button type="button" class="secondary-btn" data-public-practice="'+esc(x.id)+'">S’entraîner</button>':"")+'</div></article>';}).join("")+'</div>';}
    function practiceQcm(item){var q=item.payload&&item.payload.qcm,questions=q&&q.questions||[];if(!questions.length){toast("Ce QCM ne contient aucune question.");return;}var modal=openDialog("S’entraîner · "+item.title,'<div id="publicPracticeBody"></div>');var index=0,score=0,answered=false;function paint(){var root=modal.querySelector("#publicPracticeBody");if(index>=questions.length){root.innerHTML='<h3>Résultat : '+score+' / '+questions.length+'</h3><p>Score : '+Math.round(score/questions.length*100)+' %</p><button class="primary-btn" data-practice-retry type="button">Recommencer</button>';return;}var x=questions[index],opts=x.options||[];root.innerHTML='<p class="section-kicker">QUESTION '+(index+1)+' / '+questions.length+'</p><h3>'+esc(x.prompt||"")+'</h3><div class="shared-qcm-options">'+opts.map(function(o,i){return '<button class="secondary-btn" type="button" data-practice-answer="'+esc(o.id)+'">'+String.fromCharCode(65+i)+'. '+esc(o.text||"")+'</button>';}).join("")+'</div><div id="publicPracticeFeedback" role="status"></div><button class="primary-btn" data-practice-next type="button" disabled>'+(index===questions.length-1?"Voir le résultat":"Question suivante →")+'</button>';answered=false;root.querySelectorAll("[data-practice-answer]").forEach(function(b){b.onclick=function(){if(answered)return;answered=true;var ok=b.dataset.practiceAnswer===x.correctOptionId;if(ok)score++;root.querySelectorAll("[data-practice-answer]").forEach(function(z){z.disabled=true;if(z.dataset.practiceAnswer===x.correctOptionId)z.classList.add("is-correct");else if(z===b)z.classList.add("is-wrong")});var good=opts.find(function(o){return o.id===x.correctOptionId});root.querySelector("#publicPracticeFeedback").innerHTML='<p><strong>'+(ok?"Bonne réponse !":"Réponse incorrecte.")+'</strong></p><p>Réponse attendue : '+esc(good&&good.text||"")+'</p>'+(x.explanation?'<p>'+esc(x.explanation)+'</p>':"");root.querySelector("[data-practice-next]").disabled=false;if(window.renderAuroreMath)window.renderAuroreMath(root);};});root.querySelector("[data-practice-next]").onclick=function(){index++;paint();};if(window.renderAuroreMath)window.renderAuroreMath(root);}modal.addEventListener("click",function(e){if(e.target.closest("[data-practice-retry]")){index=0;score=0;paint();}});paint();}
    feed.addEventListener("click",async function(e){var retry=e.target.closest("[data-public-retry]");if(retry){load();return;}var practice=e.target.closest("[data-public-practice]");if(practice){var pi=items.find(function(x){return x.id===practice.dataset.publicPractice;});if(pi)practiceQcm(pi);return;}var b=e.target.closest("[data-public-download],[data-public-play]");if(!b)return;var item=items.find(function(x){return x.id===b.dataset.publicDownload||x.id===b.dataset.publicPlay;});if(!item)return;try{if(item.resource_type==="audio"){var tracks=item.payload.tracks||[];if(!tracks.length)throw Error("Aucun fichier audio disponible.");if(b.hasAttribute("data-public-play")){var t=tracks[0];if(t.url){var a=new Audio(t.url);a.controls=true;var box=b.closest(".public-learning-card");var existing=box.querySelector("audio");if(existing)existing.remove();a.controls=true;box.appendChild(a);await a.play();}else if(t.text){var u=new SpeechSynthesisUtterance(t.text);u.lang=t.language||"fr-FR";speechSynthesis.speak(u);}else throw Error("Piste indisponible.");}else{for(var i=0;i<tracks.length;i++){var t=tracks[i];if(t.url){var r=await fetch(t.url);if(!r.ok)throw Error("Téléchargement audio impossible.");var blob=await r.blob();download((item.title||"audio")+"-"+(i+1)+(blob.type.indexOf("ogg")>=0?".ogg":blob.type.indexOf("mp4")>=0?".m4a":".webm"),blob);}else if(t.text)download((item.title||"audio")+"-"+(i+1)+".json",{name:t.name,text:t.text,language:t.language,voice:t.voice,rate:t.rate});}}}else download(item.title+ (item.resource_type==="qcm"?"-qcm.json":"-memoire.json"),item.payload);toast("Téléchargement préparé.");}catch(err){toast(err.message||"Action impossible.");}});
  }
})();
