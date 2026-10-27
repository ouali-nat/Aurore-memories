# Aurore Mémoire — application Android

Ce dossier prépare une application Capacitor dont les pages HTML, CSS et JavaScript sont embarquées dans l'APK. Le site web existant n'est pas remplacé.

## Compilation

Le workflow `.github/workflows/android-apk.yml` se lance manuellement depuis GitHub Actions ou après une modification du socle Android. Il dépose un APK dans les artefacts du workflow ; il ne publie pas automatiquement de release.

## Mises à jour web sans recompilation Android

Après installation d'une version de l'APK intégrant le module Live Update, les changements compatibles du site (HTML, CSS, JavaScript et ressources web) sont empaquetés automatiquement sur chaque mise à jour de main, puis publiés comme archive web versionnée. Au démarrage, l'application vérifie ce catalogue, télécharge la nouvelle archive si elle est plus récente et l'active au prochain démarrage. Une connexion et un redémarrage de l'application après le téléchargement sont nécessaires. Si la connexion est absente, la version locale installée continue de fonctionner.

Les changements du code natif Android, l'ajout ou la modification de plugins natifs, du manifeste Android, de la signature ou des permissions exigent toujours une nouvelle compilation de l'APK. Pour empêcher un bundle web d'exiger un plugin absent d'une ancienne application, toute rupture de compatibilité native doit aussi incrémenter nativeApiVersion dans android-app/live-update-compatibility.json. Le catalogue ne sert que le paquet du commit actuellement présent sur main : si sa publication n'est pas prête, l'application conserve son bundle installé au lieu de revenir à une release plus ancienne. Le module de mise à jour est auto-hébergé via les publications GitHub du dépôt : aucun service de mise à jour payant n'est requis.

## Fonctionnement hors ligne — état du socle

- Les pages et ressources web suivies par Git sont copiées dans l'application.
- KaTeX et le client navigateur Supabase sont embarqués localement afin de ne pas dépendre d'un CDN pour les charger.
- Les cartes et la progression sont conservées dans `localStorage` et recopiées dans une base IndexedDB persistante. Sur « Mes mémorisations », le panneau « Stockage sur cet appareil » indique les contenus locaux et permet de préparer une copie hors ligne ou de télécharger une sauvegarde JSON.
- À la première connexion sur une installation Android vide, si le compte connecté possède une sauvegarde R2 et que l'appareil ne contient aucune donnée, la sauvegarde cloud est restaurée automatiquement. Une copie locale non vide n'est jamais remplacée automatiquement.
- Les pages, KaTeX, le client Supabase et les moteurs d'export PDF/images sont embarqués dans l'APK. Les exports de cartes essaient les ressources locales en premier sur Android.
- Aurore ID, les groupes, les fichiers privés R2 et la synchronisation cloud exigent encore une connexion. Une sauvegarde JSON est une copie de secours exportable, pas un remplacement de la synchronisation.
- La compilation ne suffit pas à prouver le mode avion : il faut encore tester une nouvelle installation, la récupération cloud, la création/révision sans réseau, la fermeture/réouverture, les exports PDF/images hors ligne et la synchronisation après reconnexion.

## Signature Android

Pour produire des mises à jour installables par-dessus une version précédente, configurez une clé de signature stable dans les secrets GitHub : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Sans ces secrets, le workflow peut générer un APK de test avec une clé temporaire ; cet APK ne pourra pas être mis à jour par une compilation ultérieure signée différemment.
