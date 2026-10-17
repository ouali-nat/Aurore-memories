(function(){
  "use strict";
  var gate=document.getElementById("memoryAccessLock");
  if(!gate) return;
  var button=document.getElementById("memoryAccessAuroreId");
  var visitor=document.getElementById("memoryAccessVisitor");
  var message=document.getElementById("memoryAccessMessage");
  var key="aurore-memory-access-dismissed";
  var busy=false;

  function showMessage(text){
    if(!message) return;
    message.textContent=text;
    message.classList.add("is-visible");
  }
  function hideGate(){
    gate.hidden=true;
    document.body.classList.remove("memory-access-open");
  }
  function showGate(){
    try{if(sessionStorage.getItem(key)==="1") return;}catch(_){}
    gate.hidden=false;
    document.body.classList.add("memory-access-open");
  }
  function authenticated(session){
    if(session && session.user){
      try{sessionStorage.removeItem(key);}catch(_){}
      hideGate();
      return true;
    }
    return false;
  }
  if(visitor){
    visitor.addEventListener("click",function(){
      try{sessionStorage.setItem(key,"1");}catch(_){}
      hideGate();
    });
  }
  if(button){
    button.addEventListener("click",async function(){
      if(busy) return;
      busy=true;
      button.disabled=true;
      button.querySelector("strong").textContent="Connexion en cours…";
      if(message){message.textContent="";message.classList.remove("is-visible");}
      try{
        if(!window.auroreAuth || typeof window.auroreAuth.signIn!=="function"){
          throw new Error("Le service de connexion n'est pas encore prêt. Actualisez la page puis réessayez.");
        }
        await window.auroreAuth.signIn("index.html");
      }catch(error){
        showMessage("Impossible de démarrer la connexion Aurore ID : "+(error && error.message ? error.message : "erreur inconnue"));
        button.querySelector("strong").textContent="Continuer avec Aurore ID";
        button.disabled=false;
        busy=false;
      }
    });
  }
  window.addEventListener("aurore:auth-changed",function(event){
    authenticated(event && event.detail ? event.detail.session : null);
  });
  if(window.auroreAuth && typeof window.auroreAuth.getSession==="function"){
    window.auroreAuth.getSession().then(function(session){
      if(!authenticated(session)) showGate();
    }).catch(function(){showGate();});
  }else{
    window.setTimeout(function(){
      if(window.auroreAuth && typeof window.auroreAuth.getSession==="function"){
        window.auroreAuth.getSession().then(function(session){if(!authenticated(session))showGate();}).catch(showGate);
      }else showGate();
    },800);
  }
})();