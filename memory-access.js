(function(){
  "use strict";
  var gate=document.getElementById("memoryAccessLock");
  if(!gate) return;
  var button=document.getElementById("memoryAccessAuroreId");
  var visitor=document.getElementById("memoryAccessVisitor");
  var message=document.getElementById("memoryAccessMessage");
  var menuToggle=document.getElementById("appMenuToggle");
  var menuPanel=document.getElementById("appMenuPanel");
  var menuSignIn=document.getElementById("appMenuSignIn");
  var busy=false;

  function showMessage(text){
    if(!message) return;
    message.textContent=text;
    message.classList.add("is-visible");
  }
  function closeMenu(){
    if(menuPanel) menuPanel.hidden=true;
    if(menuToggle) menuToggle.setAttribute("aria-expanded","false");
  }
  function hideGate(){
    gate.hidden=true;
    document.body.classList.remove("memory-access-open");
  }
  function showGate(){
    closeMenu();
    if(message){message.textContent="";message.classList.remove("is-visible");}
    gate.hidden=false;
    document.body.classList.add("memory-access-open");
    if(button) button.focus();
  }
  window.auroreShowAccessGate=showGate;

  if(menuToggle && menuPanel){
    menuToggle.addEventListener("click",function(event){
      event.stopPropagation();
      var opening=menuPanel.hidden;
      menuPanel.hidden=!opening;
      menuToggle.setAttribute("aria-expanded",opening?"true":"false");
    });
    document.addEventListener("click",function(event){
      if(!event.target.closest(".app-menu-wrap")) closeMenu();
    });
    document.addEventListener("keydown",function(event){
      if(event.key==="Escape") closeMenu();
    });
  }
  if(menuSignIn){
    menuSignIn.addEventListener("click",showGate);
  }
  if(visitor){
    visitor.addEventListener("click",hideGate);
  }
  if(button){
    button.addEventListener("click",async function(){
      if(busy) return;
      busy=true;
      button.disabled=true;
      var label=button.querySelector("strong");
      if(label) label.textContent="Connexion en cours…";
      if(message){message.textContent="";message.classList.remove("is-visible");}
      try{
        var auth=window.auroreAuth;
        if(window.auroreAuthReady) auth=await window.auroreAuthReady;
        if(!auth || typeof auth.signIn!=="function"){
          throw window.auroreAuthInitError || new Error("Le service de connexion n’est pas disponible. Vérifiez la connexion Internet puis réessayez.");
        }
        await auth.signIn("index.html");
      }catch(error){
        showMessage("Impossible de démarrer la connexion Aurore ID : "+(error && error.message ? error.message : "erreur inconnue"));
        if(label) label.textContent="Continuer avec Aurore ID";
        button.disabled=false;
        busy=false;
      }
    });
  }

  function handleSession(session){
    if(session && session.user) hideGate();
  }
  window.addEventListener("aurore:auth-changed",function(event){
    handleSession(event && event.detail ? event.detail.session : null);
  });
  (async function restoreExistingSession(){
    try{
      var auth=window.auroreAuth;
      if(window.auroreAuthReady) auth=await window.auroreAuthReady;
      if(auth && typeof auth.getSession==="function") handleSession(await auth.getSession());
    }catch(error){
      console.warn("Aurore Mémoire : la vérification de session n’a pas abouti. L’accueil reste accessible.",error);
    }
  })();
})();