# Aurore Mémoire — Cloudflare Worker

## Configuration déclarée dans le dépôt

- Worker : `aurore-memories` (le nom doit être identique dans Cloudflare et `wrangler.toml`).
- Entrée JavaScript : `worker/index.js`.
- Site statique : fichiers à la racine, servis via le binding `ASSETS`.
- Bucket R2 existant : `aurore-memories`, binding `MEMORIES_BUCKET`.
- Supabase Mémoire : `https://oegxxndiuovisustjstp.supabase.co`.
- Dépôt : `ouali-nat/Aurore-memories`, branche `main`, répertoire racine `/`.

Le fichier `wrangler.toml` est la source de vérité pour le nom, l'entrée JavaScript, les actifs et le binding R2. Le déploiement Cloudflare doit exécuter `npx wrangler deploy` à la racine du dépôt. Il ne suffit pas que GitHub/Vercel publie le site statique.

## Diagnostic du mode « static assets only »

Si Cloudflare affiche « Variables cannot be added to a Worker that only has static assets » ou « Bindings cannot be added… », la version actuellement active n'a pas été déployée comme Worker avec script. La configuration du dépôt déclare pourtant `main = "worker/index.js"` et un binding `ASSETS`; la configuration inclut aussi `MEMORIES_BUCKET`.

Après un déploiement du commit courant, vérifier `GET /health`. La réponse attendue contient :
- `ok: true`
- `service: "aurore-memories"`
- `storageConfigured: true`
- `authConfigured: false` tant que la clé runtime n'a pas été configurée, puis `true`.

Si Cloudflare affiche toujours le mode « static assets only » après le déploiement, le build Git intégré n'a pas appliqué `wrangler.toml`/le script. Vérifier le détail du déploiement et que la commande exacte est `npx wrangler deploy`, le répertoire racine `/`, la branche `main`, et que les builds ne sont pas désactivés. Ne pas essayer d'ajouter les bindings dans l'écran tant que le Worker n'est pas déployé avec son script.

## Secrets runtime à ajouter après activation du script

Dans Cloudflare > Workers & Pages > `aurore-memories` > Settings > Variables and Secrets :
- `SUPABASE_PUBLISHABLE_KEY` : clé publishable du projet Supabase Mémoire (pas celle d'Archives, Plume, Talents ou Aurore ID). La conserver comme secret runtime et ne jamais la committer dans GitHub.
- `ALLOWED_ORIGINS` (facultatif) : origines de production additionnelles, séparées par des virgules.

Le binding R2 `MEMORIES_BUCKET` est déclaré dans `wrangler.toml`. Une fois le déploiement Wrangler appliqué, vérifier qu'il pointe bien vers le bucket `aurore-memories`.

## API privée de stockage

Toutes les routes de stockage exigent `Authorization: Bearer <jeton-de-session-Supabase>`. Le Worker vérifie le jeton via `/auth/v1/user` et isole les objets sous `Aurore mémoires/<user-id>/`. Taille maximale d'un fichier : 10 Mo.

- `GET /health` : état de configuration non sensible.
- `GET /api/storage/list` : liste les fichiers de l'utilisateur connecté.
- `POST /api/storage?key=nom-ou-chemin` : téléverse le corps brut du fichier.
- `GET /api/storage?key=nom-ou-chemin` : télécharge un fichier de l'utilisateur.
- `DELETE /api/storage?key=nom-ou-chemin` : supprime un fichier de l'utilisateur.

## Liaison du frontend au stockage R2

Le frontend contient maintenant :
- `auth.js` : client Supabase Auth, session persistante et connexion Aurore ID par le fournisseur `custom:aurore-id`.
- `fichiers.html` + `cloud-storage.js` : page de fichiers privés pour lister, envoyer, télécharger et supprimer des objets du Worker.
- `cloud-files.css` : présentation mobile et bureau.
- Un accès « Mes fichiers privés » depuis l'accueil.

Les cartes et mémorisations existantes continuent d'utiliser leur stockage local ; aucune migration de ces données n'a été effectuée. La page de fichiers ne peut pas réussir la connexion ou un upload tant que le fournisseur OIDC et son client n'ont pas été enregistrés.

### Réglages OIDC indispensables pour finaliser la liaison

Dans le projet **Aurore Mémoire** (`oegxxndiuovisustjstp`) :
1. Ouvrir **Authentication / Auth Providers** et créer un fournisseur personnalisé en mode **Auto-discovery (OIDC)**.
2. Utiliser l'identifiant exact `custom:aurore-id` et l'émetteur `https://woyzakzpqtzwjiyysuum.supabase.co/auth/v1`.
3. Copier l'URL de rappel (Callback URL) affichée par Supabase.

Dans le projet **Aurore ID** (`woyzakzpqtzwjiyysuum`) :
4. Dans le serveur OAuth, enregistrer un client/application nommé **Aurore Mémoire** et mettre comme URL de redirection la Callback URL copiée à l'étape 3. Récupérer son Client ID et son Client Secret.

Revenir dans **Aurore Mémoire** :
5. Renseigner ces deux valeurs dans le fournisseur `custom:aurore-id`, garder les scopes `openid email profile`, puis créer/activer le fournisseur.
6. Dans **Authentication / URL Configuration / Redirect URLs**, autoriser exactement `https://aurore-memories-aurore9.vercel.app/fichiers.html`.

Ne jamais committer le Client Secret dans GitHub ni dans le JavaScript. Il appartient au réglage du fournisseur d'authentification dans Supabase.

### Test de validation

1. Ouvrir `https://aurore-memories-aurore9.vercel.app/fichiers.html` et se connecter avec Aurore ID.
2. Envoyer un fichier de moins de 10 Mo.
3. Vérifier dans R2 que l'objet apparaît sous `Aurore mémoires/<identifiant-utilisateur-Mémoire>/<nom-du-fichier>`.
4. Télécharger puis supprimer ce fichier depuis la page. Tester aussi qu'une session déconnectée ne peut ni lister ni modifier les fichiers.

La validation HTTP de la page publiée est faite (réponse 200). La connexion OIDC, l'envoi, le téléchargement et la suppression restent à valider une fois les réglages ci-dessus enregistrés.
