(function () {
  "use strict";
  function bindMenu() {
    var toggle = document.getElementById("appMenuToggle");
    var panel = document.getElementById("appMenuPanel");
    var signIn = document.getElementById("appMenuSignIn");
    var gate = document.getElementById("memoryAccessLock");
    if (!toggle || !panel || toggle.dataset.auroreMenuReady === "1") return;
    toggle.dataset.auroreMenuReady = "1";

    var activeSession = null;
    function closeMenu() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
    function updateAuthMenu(session) {
      activeSession = session && session.user ? session : null;
      if (!signIn) return;
      signIn.textContent = activeSession ? "Se déconnecter" : "Se connecter";
      signIn.dataset.action = activeSession ? "signout" : "signin";
      signIn.setAttribute("aria-label", activeSession
        ? "Se déconnecter de Aurore Mémoire"
        : "Se connecter avec Aurore ID");
    }
    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var opening = panel.hidden;
      panel.hidden = !opening;
      toggle.setAttribute("aria-expanded", opening ? "true" : "false");
    });
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".app-menu-wrap")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
    if (signIn) signIn.addEventListener("click", async function (event) {
      event.preventDefault();
      closeMenu();
      var auth = window.auroreAuth;
      try {
        if (window.auroreAuthReady) auth = await window.auroreAuthReady;
        if (signIn.dataset.action === "signout" || (activeSession && activeSession.user)) {
          signIn.disabled = true;
          if (!auth || typeof auth.signOut !== "function") throw new Error("Le service de déconnexion n’est pas disponible.");
          var result = await auth.signOut();
          if (result && result.error) throw result.error;
          updateAuthMenu(null);
          if (typeof window.auroreToast === "function") window.auroreToast("Vous êtes déconnecté d’Aurore Mémoire.");
          return;
        }
        if (typeof window.auroreShowAccessGate === "function") {
          window.auroreShowAccessGate();
        } else if (gate) {
          gate.hidden = false;
          document.body.classList.add("memory-access-open");
        }
      } catch (error) {
        if (typeof window.auroreToast === "function") {
          window.auroreToast(error && error.message ? error.message : "L’action sur votre compte a échoué.");
        }
      } finally {
        if (signIn) signIn.disabled = false;
      }
    });

    window.addEventListener("aurore:auth-changed", function (event) {
      updateAuthMenu(event && event.detail ? event.detail.session : null);
    });
    (async function restoreMenuSession() {
      try {
        var auth = window.auroreAuth;
        if (window.auroreAuthReady) auth = await window.auroreAuthReady;
        if (auth && typeof auth.getSession === "function") updateAuthMenu(await auth.getSession());
        else updateAuthMenu(null);
      } catch (error) {
        updateAuthMenu(null);
        console.warn("Aurore Mémoire : état du menu de compte indisponible.", error);
      }
    })();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMenu, { once: true });
  } else {
    bindMenu();
  }
})();
