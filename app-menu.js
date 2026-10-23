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
    function positionMenu() {
      if (panel.hidden) return;
      var margin = 10;
      var gap = 8;
      var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      var rect = toggle.getBoundingClientRect();
      var width = Math.min(270, Math.max(180, vw - margin * 2));
      panel.style.setProperty("position", "fixed", "important");
      panel.style.setProperty("width", width + "px", "important");
      panel.style.setProperty("max-width", (vw - margin * 2) + "px", "important");
      panel.style.setProperty("max-height", (vh - margin * 2) + "px", "important");
      panel.style.setProperty("overflow-x", "hidden", "important");
      panel.style.setProperty("overflow-y", "auto", "important");
      panel.style.setProperty("z-index", "1000", "important");

      // Measure after making the panel visible, then choose the side with room.
      var measured = panel.getBoundingClientRect();
      var panelWidth = Math.min(width, measured.width || width);
      var rightSpace = vw - rect.right - gap - margin;
      var leftSpace = rect.left - gap - margin;
      var left;
      if (rightSpace >= panelWidth) left = rect.right + gap;
      else if (leftSpace >= panelWidth) left = rect.left - gap - panelWidth;
      else left = Math.max(margin, Math.min(rect.left, vw - panelWidth - margin));

      var panelHeight = Math.min(panel.scrollHeight || measured.height || 220, vh - margin * 2);
      var top = rect.top;
      if (top + panelHeight > vh - margin) top = vh - panelHeight - margin;
      top = Math.max(margin, top);

      panel.style.setProperty("left", Math.round(left) + "px", "important");
      panel.style.setProperty("right", "auto", "important");
      panel.style.setProperty("top", Math.round(top) + "px", "important");
      panel.style.setProperty("bottom", "auto", "important");
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
      if (opening) {
        positionMenu();
        requestAnimationFrame(positionMenu);
      }
    });
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".app-menu-wrap")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", positionMenu, { passive: true });
    window.addEventListener("orientationchange", function () {
      requestAnimationFrame(positionMenu);
    }, { passive: true });
    window.addEventListener("scroll", positionMenu, { passive: true, capture: true });
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
