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
