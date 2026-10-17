(function () {
  "use strict";
  if (window.auroreAuth) return;

  var SUPABASE_URL = "https://oegxxndiuovisustjstp.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YOvZs7MeadvbCCK93sp7jQ_NcBDcmGI";
  var WORKER_URL = "https://aurore-memories.oualikevin6.workers.dev";
  var OIDC_PROVIDER = "custom:aurore-id";
  var client;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Aurore Mémoire : la bibliothèque Supabase JS n'a pas été chargée.");
    return;
  }

  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });

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

  function mountHeader() {
    var header = document.querySelector(".header-right");
    if (!header || document.getElementById("auroreAuthControls")) return;
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
        var redirectTo = new URL("fichiers.html", window.location.origin).toString();
        var result = await client.auth.signInWithOAuth({
          provider: OIDC_PROVIDER,
          options: {
            redirectTo: redirectTo,
            scopes: "openid email profile"
          }
        });
        if (result.error) throw result.error;
        if (!result.data || !result.data.url) {
          throw new Error("Le fournisseur Aurore ID n'a pas renvoyé d'adresse de connexion.");
        }
      } catch (error) {
        button.disabled = false;
        button.textContent = "Connexion Aurore ID";
        toast("Connexion non configurée ou refusée : " + (error.message || "erreur inconnue") +
          ". Vérifiez le fournisseur custom:aurore-id dans Supabase Mémoire.");
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
      button.disabled = false;
    } else {
      user.textContent = "Non connecté";
      user.title = "Connexion nécessaire pour le stockage privé";
      button.textContent = "Connexion Aurore ID";
      button.dataset.action = "signin";
      button.disabled = false;
    }
  }

  window.auroreAuth = {
    client: client,
    workerUrl: WORKER_URL,
    provider: OIDC_PROVIDER,
    getSession: currentSession,
    api: api,
    signIn: async function (redirectPath) {
      var result = await client.auth.signInWithOAuth({
        provider: OIDC_PROVIDER,
        options: {
          redirectTo: new URL(redirectPath || "fichiers.html", window.location.origin).toString(),
          scopes: "openid email profile"
        }
      });
      if (result.error) throw result.error;
      return result.data;
    },
    signOut: function () { return client.auth.signOut(); }
  };

  mountHeader();
  client.auth.onAuthStateChange(function (_event, session) {
    updateHeader(session);
    window.dispatchEvent(new CustomEvent("aurore:auth-changed", { detail: { session: session || null } }));
  });
  currentSession().then(updateHeader).catch(function (error) {
    console.warn("Aurore Mémoire : lecture de la session impossible.", error);
    updateHeader(null);
  });
})();