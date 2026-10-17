(function () {
  "use strict";
  var LIMIT = 10 * 1024 * 1024;

  function byId(id) { return document.getElementById(id); }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return (bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Ko";
    return (bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
  }
  function formatDate(value) {
    if (!value) return "Date inconnue";
    var date = new Date(value);
    return isNaN(date.getTime()) ? "Date inconnue" : date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  }
  function setStatus(message, isError) {
    var box = byId("cloudFilesStatus");
    if (!box) return;
    box.textContent = message || "";
    box.setAttribute("role", isError ? "alert" : "status");
    box.style.color = isError ? "var(--danger, #ff9797)" : "";
  }
  function showSignedIn(session) {
    var state = byId("cloudFilesAccount");
    var upload = byId("cloudFilesUpload");
    var signIn = byId("cloudFilesSignIn");
    if (state) state.textContent = session && session.user
      ? "Connecté : " + (session.user.email || "compte Aurore") + ". Les fichiers ci-dessous sont privés."
      : "Connectez-vous avec Aurore ID pour gérer vos fichiers privés.";
    if (upload) upload.hidden = !(session && session.user);
    if (signIn) signIn.hidden = !!(session && session.user);
  }
  async function getSession() {
    if (!window.auroreAuth) throw new Error("Le module de connexion n’a pas été chargé. Rechargez la page.");
    return window.auroreAuth.getSession();
  }
  async function loadFiles() {
    var list = byId("cloudFilesList");
    if (!list) return;
    var session = await getSession();
    showSignedIn(session);
    if (!session) {
      list.innerHTML = '<div class="cloud-file-empty">Connectez-vous pour afficher la liste privée de vos fichiers.</div>';
      return;
    }
    list.innerHTML = '<div class="cloud-file-empty">Chargement des fichiers…</div>';
    try {
      var response = await window.auroreAuth.api("/api/storage/list", { method: "GET" });
      var data = await response.json();
      var objects = Array.isArray(data.objects) ? data.objects.slice() : [];
      objects.sort(function (a, b) { return new Date(b.uploaded || 0) - new Date(a.uploaded || 0); });
      list.textContent = "";
      if (!objects.length) {
        list.innerHTML = '<div class="cloud-file-empty">Aucun fichier dans votre espace cloud pour le moment.</div>';
      } else {
        objects.forEach(function (item) {
          var row = document.createElement("article");
          row.className = "cloud-file-item";
          var main = document.createElement("div");
          main.className = "cloud-file-main";
          var name = document.createElement("div");
          name.className = "cloud-file-name";
          name.textContent = item.key || "Fichier sans nom";
          var details = document.createElement("div");
          details.className = "cloud-file-sub";
          details.textContent = formatBytes(Number(item.size) || 0) + " · envoyé le " + formatDate(item.uploaded);
          main.appendChild(name);
          main.appendChild(details);
          var actions = document.createElement("div");
          actions.className = "cloud-file-actions";
          var download = document.createElement("button");
          download.className = "cloud-files-button";
          download.type = "button";
          download.textContent = "Télécharger";
          download.addEventListener("click", async function () {
            download.disabled = true;
            try {
              var response = await window.auroreAuth.api("/api/storage?key=" + encodeURIComponent(item.key), { method: "GET" });
              var blob = await response.blob();
              var href = URL.createObjectURL(blob);
              var link = document.createElement("a");
              link.href = href;
              link.download = String(item.key || "fichier").split("/").pop();
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(href);
            } catch (error) {
              setStatus(error.message || "Téléchargement impossible.", true);
            } finally {
              download.disabled = false;
            }
          });
          var remove = document.createElement("button");
          remove.className = "cloud-files-button";
          remove.type = "button";
          remove.textContent = "Supprimer";
          remove.addEventListener("click", async function () {
            if (!window.confirm("Supprimer définitivement « " + item.key + " » de votre espace cloud ?")) return;
            remove.disabled = true;
            try {
              await window.auroreAuth.api("/api/storage?key=" + encodeURIComponent(item.key), { method: "DELETE" });
              setStatus("Fichier supprimé.");
              await loadFiles();
            } catch (error) {
              setStatus(error.message || "Suppression impossible.", true);
              remove.disabled = false;
            }
          });
          actions.appendChild(download);
          actions.appendChild(remove);
          row.appendChild(main);
          row.appendChild(actions);
          list.appendChild(row);
        });
      }
      if (data.truncated) {
        var note = document.createElement("p");
        note.className = "cloud-files-warning";
        note.textContent = "La liste est limitée à 1 000 fichiers. Certains fichiers supplémentaires peuvent ne pas apparaître.";
        list.appendChild(note);
      }
      setStatus(objects.length ? objects.length + (objects.length > 1 ? " fichiers disponibles." : " fichier disponible.") : "Votre espace est prêt.");
    } catch (error) {
      list.innerHTML = '<div class="cloud-file-empty">La liste ne peut pas être chargée pour le moment.</div>';
      setStatus(error.message || "Impossible de joindre le stockage cloud.", true);
    }
  }
  async function uploadFiles(event) {
    event.preventDefault();
    var picker = byId("cloudFilesPicker");
    var button = byId("cloudFilesUploadButton");
    var files = picker && picker.files ? Array.from(picker.files) : [];
    if (!files.length) {
      setStatus("Choisissez au moins un fichier.");
      return;
    }
    if (files.some(function (file) { return file.size > LIMIT; })) {
      setStatus("Chaque fichier doit peser 10 Mo maximum. Aucun fichier n’a été envoyé.", true);
      return;
    }
    button.disabled = true;
    var sent = 0;
    try {
      var existingResponse = await window.auroreAuth.api("/api/storage/list", { method: "GET" });
      var existingData = await existingResponse.json();
      var knownKeys = new Set((Array.isArray(existingData.objects) ? existingData.objects : []).map(function (item) { return item.key; }));
      for (var i = 0; i < files.length; i += 1) {
        var file = files[i];
        if (knownKeys.has(file.name) && !window.confirm("Un fichier nommé « " + file.name + " » existe déjà. Le remplacer ?")) {
          continue;
        }
        setStatus("Envoi de " + file.name + " (" + (i + 1) + "/" + files.length + ")…");
        await window.auroreAuth.api("/api/storage?key=" + encodeURIComponent(file.name), {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        knownKeys.add(file.name);
        sent += 1;
      }
      picker.value = "";
      if (!sent) {
        setStatus("Aucun fichier envoyé : les fichiers déjà présents n’ont pas été remplacés.");
        return;
      }
      setStatus(sent > 1 ? sent + " fichiers envoyés avec succès." : "Fichier envoyé avec succès.");
      await loadFiles();
    } catch (error) {
      setStatus(error.message || "Envoi impossible.", true);
    } finally {
      button.disabled = false;
    }
  }
  function init() {
    if (!byId("cloudFilesPage") || !window.auroreAuth) return;
    var form = byId("cloudFilesUpload");
    if (form) form.addEventListener("submit", uploadFiles);
    var refresh = byId("cloudFilesRefresh");
    if (refresh) refresh.addEventListener("click", function () {
      setStatus("Actualisation…");
      loadFiles();
    });
    var signIn = byId("cloudFilesSignIn");
    if (signIn) signIn.addEventListener("click", async function () {
      signIn.disabled = true;
      setStatus("Redirection vers Aurore ID…");
      try {
        await window.auroreAuth.signIn("fichiers.html");
      } catch (error) {
        setStatus("La connexion n’est pas encore configurée : " + (error.message || "erreur inconnue") +
          ". Le fournisseur custom:aurore-id doit être activé dans Supabase Mémoire.", true);
        signIn.disabled = false;
      }
    });
    if (!window.__auroreCloudStorageAuthListenerBound) {
      window.__auroreCloudStorageAuthListenerBound = true;
      window.addEventListener("aurore:auth-changed", function (event) {
        showSignedIn(event.detail && event.detail.session);
        loadFiles();
      });
    }
    getSession().then(function (session) {
      showSignedIn(session);
      loadFiles();
    }).catch(function (error) { setStatus(error.message || "Lecture de session impossible.", true); });
  }
  init();
})();