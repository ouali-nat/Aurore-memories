(function () {
  "use strict";

  var MANIFEST_URL = "https://raw.githubusercontent.com/ouali-nat/Aurore-memories/aurore-app-updates/live-update-manifest.json";
  var MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  var lastCheckAt = 0;
  var activeCheck = null;
  var readyPromise = null;

  function confirmCurrentBundleReady() {
    if (!window.auroreLiveUpdate || typeof window.auroreLiveUpdate.ready !== "function") {
      return Promise.resolve(null);
    }
    if (!readyPromise) {
      readyPromise = window.auroreLiveUpdate.ready().catch(function (error) {
        console.warn("Aurore Mémoire: confirmation du bundle impossible.", error);
        return null;
      });
    }
    return readyPromise;
  }

  function isNativeAndroid() {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform() &&
      typeof window.Capacitor.getPlatform === "function" &&
      window.Capacitor.getPlatform() === "android");
  }

  async function readBuildInfo() {
    var response = await fetch("/aurore-build-info.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Version locale inaccessible.");
    var info = await response.json();
    if (!info || !/^[a-f0-9]{40}$/i.test(info.commitSha || "") ||
        !Number.isFinite(Date.parse(info.commitDate || "")) ||
        !Number.isFinite(Date.parse(info.builtAt || "")) ||
        !Number.isSafeInteger(info.nativeApiVersion) || info.nativeApiVersion < 1) {
      throw new Error("Version locale invalide.");
    }
    return info;
  }

  function isTrustedBundle(update) {
    if (!update || typeof update !== "object" || update.schemaVersion !== 1) return false;
    if (!/^ota-[a-f0-9]{40}$/i.test(update.bundleId || "")) return false;
    if (String(update.commitSha || "").toLowerCase() !== update.bundleId.slice(4).toLowerCase()) return false;
    if (!Number.isFinite(Date.parse(update.commitDate || "")) ||
        !Number.isFinite(Date.parse(update.publishedAt || "")) ||
        !Number.isSafeInteger(update.nativeApiVersion) || update.nativeApiVersion < 1) return false;

    try {
      var url = new URL(update.url);
      var expectedPath = "/ouali-nat/Aurore-memories/releases/download/" +
        update.bundleId + "/Aurore-Memoire-Web.zip";
      return url.protocol === "https:" &&
        url.hostname === "github.com" &&
        url.pathname === expectedPath;
    } catch (_) {
      return false;
    }
  }

  function announceReadyBundle() {
    var message = "Mise à jour prête. Fermez puis rouvrez Aurore Mémoire pour l’appliquer.";
    if (typeof window.auroreToast === "function") {
      window.auroreToast(message);
    } else {
      window.dispatchEvent(new CustomEvent("aurore:live-update-ready", {
        detail: { message: message }
      }));
    }
  }

  async function checkForLiveUpdate() {
    if (!isNativeAndroid() || !window.auroreLiveUpdate) return;
    if (activeCheck) return activeCheck;
    if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;

    lastCheckAt = Date.now();
    activeCheck = (async function () {
      var liveUpdate = window.auroreLiveUpdate;
      try {
        await confirmCurrentBundleReady();

        var results = await Promise.all([
          readBuildInfo(),
          liveUpdate.getCurrentBundle(),
          liveUpdate.getNextBundle(),
          fetch(MANIFEST_URL + "?t=" + Date.now(), {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store"
          })
        ]);

        var buildInfo = results[0];
        var current = results[1] || {};
        var next = results[2] || {};
        var response = results[3];
        if (!response.ok) throw new Error("Catalogue des mises à jour indisponible.");
        var latest = await response.json();
        if (!isTrustedBundle(latest)) throw new Error("Mise à jour refusée : archive non reconnue.");

        if (latest.nativeApiVersion !== buildInfo.nativeApiVersion) {
          console.warn("Aurore Mémoire: mise à jour réservée à une autre version native.");
          return;
        }
        if (latest.bundleId === current.bundleId) return;
        // Never replace a different bundle already waiting for the next restart.
        // Applying it first is safe; the following launch can then fetch a newer one.
        if (next.bundleId) {
          if (next.bundleId !== latest.bundleId) {
            console.warn("Aurore Mémoire: une autre mise à jour attend déjà le redémarrage.");
          }
          return;
        }

        // Reject an old manifest or a release generated before this APK was built.
        if (latest.commitSha.toLowerCase() === buildInfo.commitSha.toLowerCase() ||
            Date.parse(latest.publishedAt) <= Date.parse(buildInfo.builtAt)) return;

        await liveUpdate.downloadBundle({
          url: latest.url,
          bundleId: latest.bundleId
        });
        await liveUpdate.setNextBundle({ bundleId: latest.bundleId });
        announceReadyBundle();
      } catch (error) {
        // Updating is optional. A connection, CDN, or release API issue must never
        // block the already installed app or remove its offline bundle.
        console.warn("Aurore Mémoire: mise à jour web différée.", error);
      }
    })();

    try {
      await activeCheck;
    } finally {
      activeCheck = null;
    }
  }

  if (isNativeAndroid()) {
    function onPageDomReady() {
      // Call ready as soon as the DOM is usable, before any update request.
      // This keeps the rollback timer for a faulty bundle short and predictable.
      confirmCurrentBundleReady();
      // Let the current page become usable first; apply the staged bundle on a
      // later app start so unsaved forms and card drafts are never interrupted.
      window.setTimeout(checkForLiveUpdate, 1200);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onPageDomReady, { once: true });
    } else {
      onPageDomReady();
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) window.setTimeout(checkForLiveUpdate, 400);
    });
  }
})();
