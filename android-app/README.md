# Aurore Mémoire — application Android

Ce dossier prépare une application Capacitor dont les pages HTML, CSS et JavaScript sont embarquées dans l'APK. Le site web existant n'est pas remplacé.

## Compilation

Le workflow `.github/workflows/android-apk.yml` se lance manuellement depuis GitHub Actions ou après une modification du socle Android. Il dépose un APK dans les artefacts du workflow ; il ne publie pas automatiquement de release.

## Fonctionnement hors ligne — état du socle

- Les pages et ressources web suivies par Git sont copiées dans l'application.
- KaTeX et le client navigateur Supabase sont embarqués localement afin de ne pas dépendre d'un CDN pour les charger.
- Les cartes et la progression existantes utilisent déjà `localStorage`, ce qui permet une conservation sur l'appareil.
- Aurore ID, les groupes, les fichiers R2 et la synchronisation cloud exigent encore une connexion.
- Cette première étape ne constitue pas encore une validation complète du mode avion. Il reste à tester les parcours réels, la sauvegarde locale, les mémoires longues, les formules et la reprise de synchronisation avant toute diffusion.

## Signature Android

Pour produire des mises à jour installables par-dessus une version précédente, configurez une clé de signature stable dans les secrets GitHub : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Sans ces secrets, le workflow peut générer un APK de test avec une clé temporaire ; cet APK ne pourra pas être mis à jour par une compilation ultérieure signée différemment.
