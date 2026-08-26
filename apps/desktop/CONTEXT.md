# @noyau/desktop

Langage de l'enveloppe Electron : superviseur du serveur enfant et conventions du système hôte.
Aucun état métier.

## Langage

**Environment**:
Installation locale unique partagée par toutes les fenêtres de ce profil Electron.
_À éviter_ : catalogue d'Environments, instance distante, VPS

**Serveur enfant**:
Processus Node (`ELECTRON_RUN_AS_NODE`) qui possède SQLite, Cursor et le métier.
_À éviter_ : renderer, preload, worker de fenêtre

**fd3**:
Canal de bootstrap : répertoire de données OS, port loopback, token de lancement, version.
_À éviter_ : argv métier, IPC, variables d'environnement libres

**Token de lancement**:
Bearer propre à un start du serveur enfant. Accorde les scopes RPC locaux. Meurt avec le process.
_À éviter_ : compte utilisateur, session distante, cookie

**degraded**:
État du superviseur après échecs répétés de restart du serveur enfant.
_À éviter_ : error métier, lastError de Session

**forceKillAfter**:
Plafond d'arrêt du PID serveur après l'endpoint interne : 2 s.
_À éviter_ : sweep cursor-agent, SIGTERM portable Windows

**Icône d'app**:
Marque Dock du bundle brandé, dérivée du blobatar sidebar. Ember en Dev, dark en nightly,
light en latest.
_À éviter_ : favicon web, icône Electron stock

**Badge d'attente**:
Compteur Dock / barre des tâches du nombre de Threads en attente. Chrome hôte, poussé
par le renderer. Zéro retire le badge.
_À éviter_ : badge lost, Notification de Turn, mention Discord

**Chrome de fenêtre**:
Enveloppe visuelle qui relie la surface Noyau aux contrôles de fenêtre du système.
_À éviter_ : header desktop, barre de titre

**Header de page**:
Rangée contextuelle qui porte la navigation et l'identité de la page courante.
_À éviter_ : chrome de fenêtre, barre de titre

**Menu natif**:
Template mince installé avant `ready` : menu App (darwin) + `editMenu` + `windowMenu`.
Les rôles Edit câblent Cmd/Ctrl+A/C/V/X/Z ; `autoHideMenuBar` masque la barre in-window.
_À éviter_ : `Menu.setApplicationMenu(null)`, menu défaut Electron (File/View/Help)

**Canal de release**:
Piste unique de marque et de lancement desktop : `development` en local, `latest` ou
`nightly` packagé. `NOYAU_RELEASE_CHANNEL` est injecté au lancement dev ou au packaging CI ; le
packager le fige dans l’artefact. Electron le propage au serveur enfant et l’expose au renderer
par `window.noyauDesktop.releaseChannel` (argv `additionalArguments` du preload, pas d’IPC sync).
La fenêtre se crée dès le spawn serveur (avant ready RPC).
latest = tag `vX.Y.Z` ; nightly = dispatch Actions.
_À éviter_ : `NOYAU_DESKTOP_DEV`, second flag « desktop env », canal beta, dist-tag npm,
updater Electron, réutiliser `NOYAU_ENV`, déduire le canal depuis la version

**Marque nightly**:
Nom `Noyau (Nightly)`, bundle id `dev.noyau.desktop.nightly`, icône dark.
_À éviter_ : même bundle id que latest, icône light latest, titre « Noyau » seul

**Release unsigned**:
GitHub Release avec DMG arm64 et NSIS x64, sans Developer ID ni auto-update. Le .app
macOS est signé ad-hoc après pack pour sceller les ressources.
_À éviter_ : notarization, `electron-updater`, laisser la signature linker d’Electron,
SmartScreen comme preuve de confiance

**Mise à jour desktop**:
Check GitHub Release du Canal de mise à jour, puis ouverture de l'installeur unsigned
correspondant. L'humain installe à la main.
_À éviter_ : `electron-updater`, `quitAndInstall`, manifests yml, remplacement du .app

**Canal de mise à jour**:
Piste GitHub `latest` ou `nightly` à vérifier. Défaut = Canal de release packagé. Changer
de piste n'altère pas la marque ni le bundle id de l'app en cours.
_À éviter_ : changer `NOYAU_RELEASE_CHANNEL` à chaud, confondre avec le Canal de release
