(function () {
  "use strict";
  function bindMenu() {
    var toggle = document.getElementById("appMenuToggle");
    var panel = document.getElementById("appMenuPanel");
    var signIn = document.getElementById("appMenuSignIn");
    var gate = document.getElementById("memoryAccessLock");
    if (!toggle || !panel || toggle.dataset.auroreMenuReady === "1") return;
    toggle.dataset.auroreMenuReady = "1";

    function closeMenu() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
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
    if (signIn) signIn.addEventListener("click", function (event) {
      event.preventDefault();
      closeMenu();
      if (typeof window.auroreShowAccessGate === "function") {
        window.auroreShowAccessGate();
      } else if (gate) {
        gate.hidden = false;
        document.body.classList.add("memory-access-open");
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMenu, { once: true });
  } else {
    bindMenu();
  }
})();
