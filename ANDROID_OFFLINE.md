# Aurore Mémoire — application Android hors ligne

## Première étape : socle de compilation

Le projet Android est construit avec Capacitor dans `android-app/`. Le workflow GitHub Actions `.github/workflows/android-apk.yml` prépare un bundle local à partir des fichiers suivis par Git, embarque KaTeX et compile un APK de test.

L’application n’est pas un simple raccourci vers le site web : le HTML, le CSS, les scripts, les pages et les ressources suivies par Git sont copiés dans le bundle Capacitor. Le rendu mathématique KaTeX est fourni localement.

## Ce qui fonctionne déjà comme fondation

- Les cartes sont d’abord enregistrées dans `localStorage` par le code existant de Mémoire.
- Les opérations de synchronisation cloud sont secondaires à l’enregistrement local.
- Le build Android embarque les fichiers statiques du site et KaTeX.
- L’APK est fourni comme artefact GitHub Actions pour test ; aucune publication automatique dans une release publique n’est effectuée à ce stade.

## Vérifications et étapes avant de déclarer le mode hors ligne complet

Le premier APK doit être testé en mode avion sur Android. La disponibilité hors ligne doit être confirmée page par page, en particulier les pages de création, de révision et les mémorisations, ainsi que la conservation après fermeture/réouverture.

Certaines fonctions restent naturellement connectées : connexion Aurore ID, partage communautaire, groupes et fichiers privés R2. Elles devront afficher un état hors ligne explicite et reprendre la synchronisation quand le réseau revient.

La préparation du bundle ne remplace pas encore un audit complet de toutes les requêtes réseau ni un test de synchronisation avec conflits. Ne pas distribuer cette première compilation comme version stable avant les essais.

## Signature Android

Pour que les mises à jour s’installent par-dessus la même application, les secrets GitHub `ANDROID_KEYSTORE_BASE64` et `ANDROID_KEYSTORE_PASSWORD` doivent contenir une clé de signature conservée durablement. Sans clé stable, l’APK de test est signé temporairement et devra être désinstallé avant d’installer une compilation ultérieure.
