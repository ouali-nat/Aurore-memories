# Worker R2 — Aurore Mémoire

Ce Worker expose une API privée de fichiers pour Aurore Mémoire. Le bucket reste privé : aucun domaine public ni accès anonyme au contenu R2 n'est nécessaire.

## Fichiers

- \`index.js\` : API Worker.
- \`wrangler.jsonc\` : configuration Wrangler, projet Supabase Mémoire et binding R2.

## Déploiement sur Cloudflare

1. Dans Cloudflare, ouvrez **Workers & Pages** puis créez un Worker connecté au dépôt GitHub \`ouali-nat/Aurore-memories\`.
2. Choisissez la branche \`main\` et définissez le répertoire racine du Worker sur \`workers/memoire-r2\`.
3. Vérifiez que le déploiement lit bien le fichier \`wrangler.jsonc\` et configure le binding R2 \`MEMORIES_BUCKET\` vers le bucket existant \`aurore-memories\`.
4. Déployez le Worker. Ne rendez pas le bucket public.

Si la connexion Git demande une commande de build, aucune compilation n'est nécessaire : le point d'entrée est \`index.js\`.

## Vérification après le premier déploiement

Remplacez \`https://VOTRE-WORKER.workers.dev\` par l'adresse réellement attribuée par Cloudflare.

- \`GET /health\` : doit répondre \`200\` avec \`ok: true\`, \`authConfigured: true\` et \`storageConfigured: true\`.
- \`GET /api/me\` sans jeton : doit répondre \`401\`.
- \`GET /api/files\` sans jeton : doit répondre \`401\`.

Les routes privées exigent un jeton Bearer valide de la session Supabase Aurore Mémoire. Le Worker vérifie ce jeton auprès de Supabase avant chaque opération ; le navigateur ne reçoit jamais de secret R2.

## API

- \`GET /health\` — statut sans données privées.
- \`GET /api/me\` — identité validée du compte.
- \`GET /api/files\` — liste les fichiers de l'utilisateur connecté.
- \`POST /api/files\` — téléverse un fichier via \`multipart/form-data\`, champ \`file\`.
- \`GET /api/files?key=...\` — télécharge un fichier appartenant à l'utilisateur.
- \`DELETE /api/files?key=...\` — supprime un fichier appartenant à l'utilisateur.

Les fichiers sont rangés sous le préfixe privé \`Aurore mémoires/<identifiant Supabase>/<identifiant du fichier>/<nom>\`. Les noms et chemins fournis par le navigateur ne peuvent pas accéder au dossier d'un autre utilisateur. La taille maximale est de 25 Mo ; HTML, SVG et scripts ne sont pas acceptés.

## Origines autorisées

Le fichier de configuration autorise le domaine de production actuel \`https://aurore-memories-aurore9.vercel.app\`. Si le domaine de production change, mettez à jour \`ALLOWED_ORIGINS\` dans \`wrangler.jsonc\` puis redéployez.

## Étape suivante : Aurore ID

Le Worker est le stockage, pas le fournisseur de connexion. Pour que la session Aurore Mémoire soit ouverte avec Aurore ID, il faudra ensuite enregistrer l'application OAuth Mémoire dans Aurore ID, puis configurer le fournisseur OIDC personnalisé côté Supabase Aurore Mémoire avec l'émetteur \`https://woyzakzpqtzwjiyysuum.supabase.co/auth/v1\`. La callback Supabase à enregistrer est :

\`https://oegxxndiuovisustjstp.supabase.co/auth/v1/callback\`

Le client ID et le secret OAuth seront configurés dans les paramètres d'authentification Supabase ; ils ne doivent pas être inscrits dans GitHub ni dans le navigateur. Gardez les connexions locales actuelles jusqu'à validation complète du parcours SSO.
