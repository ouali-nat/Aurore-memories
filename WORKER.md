# Aurore Mémoire — Cloudflare Worker

Ce Worker suit l'architecture déjà utilisée par Aurore Plume et Aurore Talents : un point d'entrée \`worker/index.js\`, une configuration \`wrangler.toml\`, un binding R2 \`MEMORIES_BUCKET\`, et les fichiers statiques servis par \`ASSETS\`.

## Configuration Cloudflare

Le Worker est nommé \`aurore-memoire\`. La configuration lie le bucket existant \`aurore-memories\` et le projet Supabase Aurore Mémoire (\`oegxxndiuovisustjstp\`). La clé publique Supabase ne figure volontairement pas dans GitHub.

Dans Cloudflare > Workers & Pages > aurore-memoire > Settings > Variables and Secrets, ajouter :
- \`SUPABASE_PUBLISHABLE_KEY\` : la clé publishable du projet Supabase Aurore Mémoire, enregistrée comme variable/secret de runtime.
- \`ALLOWED_ORIGINS\` (facultatif) : les origines de production supplémentaires séparées par des virgules.

La clé doit être celle du projet Supabase Mémoire, pas celle d'Archives, Plume, Talents ou Aurore ID.

## Git integration

Connecter le Worker au dépôt \`ouali-nat/Aurore-memories\`, branche \`main\`, répertoire racine \`/\`. Ne pas définir de commande de build Node : le site est constitué de fichiers statiques à la racine. Le fichier \`wrangler.toml\` configure la publication du Worker et des actifs.

Le Worker Cloudflare est distinct d'un déploiement Vercel. Un push GitHub ne créera pas un Worker Cloudflare si le Worker n'a pas d'abord été créé/lié au dépôt dans Workers & Pages. Le nom dans Cloudflare doit correspondre exactement à \`name = "aurore-memoire"\`.

## Routes de stockage

- \`GET /health\` : état de configuration, sans données privées.
- \`GET /api/storage/list\` : liste les fichiers de l'utilisateur connecté.
- \`POST /api/storage?key=nom-ou-chemin\` : téléverse le corps brut du fichier.
- \`GET /api/storage?key=nom-ou-chemin\` : télécharge un fichier de l'utilisateur.
- \`DELETE /api/storage?key=nom-ou-chemin\` : supprime un fichier de l'utilisateur.

Toutes les routes de stockage exigent \`Authorization: Bearer <jeton-de-session-Supabase>\`. Le Worker vérifie le jeton avec \`/auth/v1/user\` et isole les objets dans \`Aurore mémoires/<user-id>/\`. Limite : 10 Mo, comme les Workers Plume et Talents.

## Note sur le frontend et Aurore ID

Le Worker fournit l'infrastructure. Il ne modifie pas automatiquement l'authentification du site ni les mémorisations conservées dans \`localStorage\`. La prochaine étape sera de raccorder le client Mémoire à \`/api/storage\` et d'enregistrer Aurore ID comme fournisseur OIDC du projet Supabase Mémoire, après validation de la configuration du Worker.
