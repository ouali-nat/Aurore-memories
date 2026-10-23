(function () {
  "use strict";

  if (window.auroreAuth) {
    window.auroreAuthReady = Promise.resolve(window.auroreAuth);
    return;
  }

  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var WORKER_URL = "https://aurore-memories.oualikevin6.workers.dev";
  var OIDC_PROVIDER = "custom:aurore-id";
  var client = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Chargement impossible : " + src)); };
      document.head.appendChild(script);
    });
  }

  async function ensureSupabaseLibrary() {
    if (window.supabase && typeof window.supabase.createClient === "function") return;
    var sources = [
      // Prefer the bundled browser client in the Android APK so startup does not depend on a CDN.
      "vendor/supabase.js",
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js"
    ];
    var lastError = null;
    for (var i = 0; i < sources.length; i += 1) {
      try {
        await loadScript(sources[i]);
        if (window.supabase && typeof window.supabase.createClient === "function") return;
        lastError = new Error("La bibliothèque chargée n’expose pas Supabase JS.");
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error("Impossible de charger le service d’authentification. Vérifiez votre connexion Internet puis réessayez." +
      (lastError && lastError.message ? " (" + lastError.message + ")" : ""));
  }

  function isNativeApp() {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform());
  }

  function authRedirectUrl(path) {
    // Android : revenir dans l'application installée, pas sur le site public.
    if (isNativeApp()) return "app.aurore.memoire://auth/callback";
    // Always return OAuth to the canonical production origin, not a deployment alias.
    return new URL(path || "index.html", "https://aurore-memories-mu.vercel.app").toString();
  }

  function installNativeAuthCallback() {
    if (!isNativeApp() || window.__auroreNativeAuthCallbackInstalled) return;
    window.__auroreNativeAuthCallbackInstalled = true;
    loadScript("vendor/capacitor-app-bridge.js").then(function () {
      var nativeApp = window.auroreNativeApp;
      if (!nativeApp || typeof nativeApp.addListener !== "function") {
        throw new Error("Le gestionnaire de liens profonds Android est indisponible.");
      }
      nativeApp.addListener("appUrlOpen", async function (event) {
        var rawUrl = event && event.url;
        if (!rawUrl) return;
        var callback;
        try { callback = new URL(rawUrl); } catch (_) { return; }
        if (callback.protocol !== "app.aurore.memoire:" ||
            callback.hostname !== "auth" ||
            callback.pathname !== "/callback") return;

        var providerError = callback.searchParams.get("error_description") ||
          callback.searchParams.get("error");
        if (providerError) {
          toast("La connexion Aurore ID a échoué : " + providerError);
          return;
        }
        var code = callback.searchParams.get("code");
        if (!code) {
          toast("Aurore ID est revenu dans l’application sans code de connexion.");
          return;
        }
        try {
          var result = await client.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          updateHeader(result.data && result.data.session ? result.data.session : await currentSession());
          // Efface tout paramètre d'authentification de l'adresse affichée dans la WebView.
          try { history.replaceState(history.state, document.title, window.location.pathname + window.location.search); } catch (_) {}
        } catch (error) {
          toast(error && error.message ? error.message : "Impossible de terminer la connexion Aurore ID dans l’application.");
        }
      });
    }).catch(function (error) {
      console.error("Aurore Mémoire : gestion du retour Aurore ID indisponible.", error);
    });
  }

  function currentSession() {
    return client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      return result.data.session || null;
    });
  }

  async function api(path, options) {
    var session = await currentSession();
    if (!session || !session.access_token) {
      var authError = new Error("Connectez-vous avec Aurore ID pour accéder à vos fichiers privés.");
      authError.status = 401;
      throw authError;
    }
    var headers = new Headers(options && options.headers ? options.headers : {});
    headers.set("Authorization", "Bearer " + session.access_token);
    var response = await fetch(new URL(path, WORKER_URL).toString(), Object.assign({}, options || {}, {
      headers: headers,
      cache: "no-store"
    }));
    if (!response.ok) {
      var message = "Erreur du stockage (" + response.status + ").";
      try {
        var body = await response.clone().json();
        if (body && body.error) message = body.error;
      } catch (ignored) {}
      var requestError = new Error(message);
      requestError.status = response.status;
      throw requestError;
    }
    return response;
  }

  function toast(message) {
    if (typeof window.auroreToast === "function") window.auroreToast(message);
    else {
      var status = document.getElementById("auroreAuthMessage");
      if (status) status.textContent = message;
    }
  }

  function isHomePage() {
    var page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    return !page || page === "index.html";
  }

  function mountHeader() {
    var header = document.querySelector(".header-right");
    if (!header || isHomePage() || document.getElementById("auroreAuthControls")) return;
    var box = document.createElement("div");
    box.id = "auroreAuthControls";
    box.className = "aurore-auth-controls";
    box.innerHTML =
      '<a class="aurore-cloud-link" href="fichiers.html">Fichiers privés</a>' +
      '<span class="aurore-auth-user" id="auroreAuthUser" aria-live="polite"></span>' +
      '<button class="aurore-auth-button" id="auroreAuthButton" type="button">Connexion Aurore ID</button>';
    header.insertBefore(box, header.firstChild || null);

    var button = document.getElementById("auroreAuthButton");
    button.addEventListener("click", async function () {
      if (button.dataset.action === "signout") {
        button.disabled = true;
        try {
          var result = await client.auth.signOut();
          if (result.error) throw result.error;
          toast("Vous êtes déconnecté d’Aurore Mémoire.");
        } catch (error) {
          toast(error.message || "La déconnexion a échoué.");
        } finally {
          button.disabled = false;
        }
        return;
      }
      button.disabled = true;
      button.textContent = "Connexion…";
      try {
        var redirectTo = authRedirectUrl("fichiers.html");
        var result = await client.auth.signInWithOAuth({
          provider: OIDC_PROVIDER,
          options: {
            redirectTo: redirectTo,
            scopes: "openid email profile"
          }
        });
        if (result.error) throw result.error;
        if (!result.data || !result.data.url) {
          throw new Error("Aurore ID n’a pas pu démarrer la connexion. Réessayez dans quelques instants.");
        }
      } catch (error) {
        button.disabled = false;
        button.textContent = "Connexion Aurore ID";
        toast("Connexion impossible. Vérifiez votre connexion et réessayez.");
      }
    });
  }

  function updateHeader(session) {
    mountHeader();
    var user = document.getElementById("auroreAuthUser");
    var button = document.getElementById("auroreAuthButton");
    if (!user || !button) return;
    if (session && session.user) {
      user.textContent = session.user.email || "Compte connecté";
      user.title = "Session Aurore Mémoire active";
      button.textContent = "Se déconnecter";
      button.dataset.action = "signout";
      button.hidden = true;
      button.disabled = false;
    } else {
      user.textContent = "Non connecté";
      user.title = "Connexion nécessaire pour le stockage privé";
      button.textContent = "Connexion Aurore ID";
      button.dataset.action = "signin";
      button.hidden = true;
      button.disabled = false;
    }
  }

  async function initializeAuth() {
    await ensureSupabaseLibrary();
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });

    var authApi = {
      client: client,
      workerUrl: WORKER_URL,
      provider: OIDC_PROVIDER,
      getSession: currentSession,
      api: api,
      signIn: async function (redirectPath) {
        var result = await client.auth.signInWithOAuth({
          provider: OIDC_PROVIDER,
          options: {
            redirectTo: authRedirectUrl(redirectPath || "fichiers.html"),
            scopes: "openid email profile"
          }
        });
        if (result.error) throw result.error;
        if (!result.data || !result.data.url) {
          throw new Error("Aurore ID n’a pas renvoyé d’adresse de connexion. Vérifiez le fournisseur custom:aurore-id dans Supabase Mémoire.");
        }
        return result.data;
      },
      signOut: function () { return client.auth.signOut(); }
    };
    window.auroreAuth = authApi;
    installNativeAuthCallback();

    client.auth.onAuthStateChange(function (_event, session) {
      updateHeader(session);
      window.dispatchEvent(new CustomEvent("aurore:auth-changed", { detail: { session: session || null } }));
    });
    try {
      updateHeader(await currentSession());
    } catch (error) {
      console.warn("Aurore Mémoire : lecture de la session impossible.", error);
      updateHeader(null);
    }
    return authApi;
  }

  window.auroreAuthReady = initializeAuth();
  window.auroreAuthReady.catch(function (error) {
    window.auroreAuthInitError = error;
    console.error("Aurore Mémoire : initialisation de l’authentification impossible.", error);
  });
})();