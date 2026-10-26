# Aurore Mémoire — checklist des modifications transversales

Avant toute modification d’une fonction partagée, vérifier les zones suivantes et leurs usages réels :

- **Rendu LaTeX central** : `math-render.js`, chargé directement ou depuis `app.js`. Toute modification de son comportement doit faire l’objet d’un test sur les pages statiques et sur le contenu injecté dynamiquement.
- **Cartes personnelles / publication** : `memoire.js`, `mes-memoires.html`, `cartes-publiques.html`. Vérifier le menu `•••`, les états Public/Privé, la publication, le retrait du public, les exports et les liens de partage.
- **Révisions de mémoires** : `practice.js` et les pages `mode-*.html`. Tester au minimum Choix multiple, Trous, Taper et Réordonner avec texte ordinaire et expressions LaTeX.
- **Révision de cartes recto-verso** : `reviser-cartes.js` et `reviser-cartes.html`. Tester le recto, le verso et les cartes scientifiques dont le mode n’est pas explicitement marqué.
- **QCM** : `qcm.js`, `qcm.html`, `qcm-study.html`, ainsi que l’aperçu QCM de `mes-memoires.html`. Tester question, propositions, correction et explication.
- **Cartes publiques / exports** : rendu de cartes publiques, PDF, images PNG et impression. Vérifier que les expressions ne sont ni dupliquées ni laissées sous forme de commandes brutes.
- **Clavier scientifique** : `science-keyboard.js`, aperçus des champs de création/édition et options de fonctions.

## Règles obligatoires

1. Travailler dans la copie dédiée `Aurore-memories-local`, vérifier branche, `git status`, `git diff --check` et les changements existants avant édition.
2. Une correction partagée doit être accompagnée d’une liste des pages consommatrices et d’une vérification des chemins dynamiques, pas seulement de la page où le défaut a été signalé.
3. Incrémenter les paramètres de cache des scripts/styles modifiés sur toutes les pages concernées.
4. Exécuter `node --check` sur les scripts modifiés et des tests ciblés pour texte ordinaire, LaTeX délimité, LaTeX sans délimiteurs, et expressions incomplètes.
5. Ne pas publier ni déployer sans autorisation explicite ; vérifier le commit GitHub et le statut Production Vercel après autorisation.
