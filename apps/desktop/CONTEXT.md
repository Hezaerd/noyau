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

**Chrome de fenêtre**:
Enveloppe visuelle qui relie la surface Noyau aux contrôles de fenêtre du système.
_À éviter_ : header desktop, barre de titre

**Header de page**:
Rangée contextuelle qui porte la navigation et l'identité de la page courante.
_À éviter_ : chrome de fenêtre, barre de titre
