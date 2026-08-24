# @noyau/web

Langage de l'interface humaine : Tableau-first, Threads provider et Dialog Ticket.

## Langage

**Tableau**:
Vue Kanban unique d'un Project, composée de colonnes ordonnées et de Tickets. Destination au
restart.
_À éviter_ : Kanban, liste de tâches

**Ticket**:
Élément de travail durable affiché comme une carte dans le Tableau et détaillé dans un Dialog.
_À éviter_ : tâche, carte, exécution

**Responsable**:
Acteur durable optionnel d'un Ticket, volontairement absent de l'interface v0.1.
_À éviter_ : exécutant, participant

**Dépendance**:
Relation orientée entre deux Tickets, présentée comme `Bloqué par` ou `Bloque`.
_À éviter_ : sous-ticket, checklist, todolist

**Activité système**:
Historique autoritatif des faits d'un Ticket, affiché séparément du transcript d'un Thread.
_À éviter_ : commentaire, Channel, historique local

**Thread**:
Conversation provider titrée, listée dans la sidebar du Project.
_À éviter_ : Channel, Message, forum, Workbench

**lastError**:
Diagnostic visible d'une Session en `error`. Remplace tout badge `lost`.
_À éviter_ : lost, failed, requested

**Échec**:
Résultat attendu d'une opération qui n'a pas abouti et dont l'humain peut comprendre la cause ou
la correction.
_À éviter_ : exception, crash, erreur globale

**Indisponibilité**:
État temporaire ou durable dans lequel une capacité nécessaire ne peut plus être utilisée. Elle
reste visible tant que la capacité n'est pas rétablie.
_À éviter_ : échec ponctuel, notification

**Défaut**:
Comportement inattendu qui ne fait pas partie des rejets prévus du domaine. Il est identifié pour
le diagnostic sans exposer ses détails techniques dans l'interface.
_À éviter_ : rejet, validation

**Présentation d'échec**:
Expression locale d'un Échec selon son contexte et sa récupérabilité : inline, toast, bannière,
état de page ou silencieuse.
_À éviter_ : erreur serveur, message brut

**runtimeMode**:
Politique d'outils t3code du Thread (quatre valeurs). Portée par le Thread et envoyée à la
création / au tour ; plus exposée dans l'en-tête Thread.
_À éviter_ : permissionMode

**Checkout**:
Barre du Composer. `threadEnvMode` est une intention de draft : `Nouveau worktree` isole au
premier envoi, `Checkout courant` travaille dans le `WorkspaceRoot`. Tant que `worktreePath`
est `null`, le trigger affiche `Depuis {base}` et ne checkout pas. `startFromOrigin` part de
`origin/{base}` par défaut. Après bind, `Worktree` ou `Checkout local`.
_À éviter_ : dériver le mode de `worktreePath === null`, héritage de checkout

**Défaut threadEnvMode**:
Préférence renderer du `threadEnvMode` initial d'un nouveau Thread (`local` | `worktree`).
Le Composer peut encore la changer avant le premier Turn.
_À éviter_ : champ du Thread, héritage du Thread vu

**Header actions**:
Cluster droite du Header de page d'un Thread : Open in et Git actions. Chrome, pas une entité.
_À éviter_ : Thread actions, toolbar, command bar

**Open in**:
Contrôle qui ouvre le cwd du Checkout dans un Éditeur hôte.
_À éviter_ : Open IDE, openPath, FilePreview

**Éditeur hôte**:
Application locale découverte sur le PATH (`cursor | vscode | zed | file-manager`) pour Open in.
`file-manager` ouvre le cwd dans Finder, Explorer ou Files selon l'hôte.
_À éviter_ : Provider, IDE générique

**Git actions**:
Contrôle qui lance une action empilée live (`commit | push | create_pr | …`) ou un Publish.
_À éviter_ : git commands, bouton commit, VCS toolbar

**Pull request live**:
Badge `#n` du HEAD du Checkout, alimenté par `vcs.subscribeStatus`. Pas un settle, pas un
identifiant du journal.
_À éviter_ : inbox PR, archive auto, lien Ticket

**Cleanup worktree**:
Suppression live d'un worktree lié (`vcs.removeWorktree`) puis déliaison du Checkout
(`worktreePath: null`). Auto opt-in (Préférence, off par défaut) quand la PR live passe à
`merged` ; manuel via ⌘⇧ clic dans le sélecteur de branche. Jamais le WorkspaceRoot.
_À éviter_ : archive Thread, settle, suppression de branche

**Présentation de Turn**:
Comment le prompt utilisateur d'un Turn est montré dans le transcript : même Message / Bubble
que les autres messages utilisateur, avec le libellé de présentation. Le texte soumis au
Provider reste plat. v0.1 : `fix-merge-conflicts`.
_À éviter_ : Action, message custom, chip comme entité, CTA coloré

**Fix merge conflicts**:
Message suggéré au-dessus du Composer, visible si la Pull request live est ouverte et
`conflicting`. Envoie un Turn avec Présentation de Turn.
_À éviter_ : merge automatique, commande Git, inbox PR, chip d'alerte

**Créer le repo**:
Libellé UI du Publish GitHub quand le cwd n'a pas de remote `origin`.
_À éviter_ : Publish wizard, sourceControl

**Draft Git**:
Message de commit ou texte de PR généré, éditable avant une action empilée
(`commit | push | create_pr | commit_push | commit_push_pr`).
_À éviter_ : revue, diff viewer

**Effort**:
Libellé UI du `reasoningEffort` porté par la `modelSelection` du Thread. Les valeurs proposées
proviennent des capacités du modèle Cursor sélectionné.
_À éviter_ : niveau statique, enum Noyau

**Vitesse**:
Libellé UI du `serviceTier` optionnel, présenté dans le même menu que l'Effort quand Cursor
l'annonce pour le modèle sélectionné.
_À éviter_ : fast mode global, option toujours disponible

**Réflexion**:
Option booléenne Cursor distincte de l'Effort. Elle est présentée comme activée ou désactivée dans
le menu de configuration du modèle et reste mémorisée dans la `modelSelection` du Thread.

**Sélection de modèle**:
Choix durable du Composer attaché au Thread : modèle, Effort, Vitesse et Réflexion. Chaque Thread
retrouve son dernier choix indépendamment des autres Threads.
_À éviter_ : choix global, modèle de Session

**Mention**:
Référence `@path` ou `@ticket:<id>` insérée depuis le Composer, affichée comme chip
fichier (Pierre + basename) ou chip Ticket (titre). Le texte soumis reste plat ; Noyau
Server encode le fichier en `resource_link` ACP et le Ticket en contexte prompt.
L'envoi lie aussi le Ticket au Thread.
_À éviter_ : attachment, Resource, Command

**Brouillon**:
Texte du Composer gardé en mémoire renderer pendant la session, isolé par Thread — ou par Project
tant que le Thread n'est pas créé. Perdu au restart. Ce n'est pas une Préférence.
_À éviter_ : draft persisté, localStorage, état de page

**Palette**:
Overlay clavier searchable de l'app qui propose navigation, Actions et résultats contextuels.
_À éviter_ : Command, Command palette, Spotlight, Menu

**Action**:
Entrée choisissable du catalogue UI de l'app. Ce n'est pas une Command du control plane.
_À éviter_ : Command, BoardCommand, commande

**BoardAction**:
Action dont la cible appartient au Tableau.
_À éviter_ : BoardCommand

**Contexte d'activation**:
Page courante qui détermine les verbes proposés par la Palette.
_À éviter_ : context, focus, mode, intelligence, sélection

**Récent**:
Action déjà déclenchée, proposée si elle reste applicable au contexte d'activation courant.
_À éviter_ : history, shortcut, historique

**Catalogue**:
Union des Actions de navigation, des verbes de la page courante et de ses résultats recherchables.
_À éviter_ : registry, command list

**Paramètres**:
Surface dédiée des préférences persistées de l'app, adressable par `/settings`.
_À éviter_ : options, réglages, preferences, page de config

**Tab Paramètres**:
Catégorie adressable du catalogue Paramètres (`/settings/$tab`).
_À éviter_ : section Settings, page d'options, onglet générique

**Provider**:
Runtime agent branché à Noyau. Cursor est le seul Provider réel de la v0.1 ; Claude Code et Codex
sont listés dans les Paramètres comme hors v0.1.
_À éviter_ : modèle, LLM, backend, harnais

**Intégration agent**:
Configuration facultative d’un Project qui installe le skill Noyau pour aider les agents à
utiliser son Tableau. Elle reste distincte du Provider et du MCP qui fournit les tools.
_À éviter_ : Provider, extension, plugin, état du Project

**Préférence**:
Valeur persistée d'un item du catalogue Paramètres, distincte d'une Command du control plane.
_À éviter_ : option, config, setting

**Son de Turn**:
Cue Cuelume joué quand un Turn passe de `running` à un état terminal. Préférence renderer
(toggle + son). Pas une notification OS.
_À éviter_ : notification système, événement de journal, fichier audio embarqué

**Activité de Turn**:
Indicateur UI dérivé (`En cours`, `Terminé`, `Interrompu`, `Erreur`) depuis `sessionStatus` et
`latestTurn`. La durée live part de `startedAt` / `requestedAt`. Pas une Command.
_À éviter_ : badge lost, notification OS, champ du journal

**lastVisitedAt**:
Horloge locale renderer de la dernière visite d'un Thread. Un Terminé n'apparaît que si
`completedAt` est postérieur. Jamais visité = déjà lu, pour ne pas inonder les Threads
historiques. Pas une Préférence du catalogue.
_À éviter_ : présence, ShellFocus, événement de journal

**ShellFocus**:
Vue UI volatile poussée au serveur (Tableau ou Thread). Les Paramètres restent sticky sur le
dernier Project ouvert.
_À éviter_ : présence, route, Command

**FilePreview**:
Aperçu hover d'un fichier mentionné dans le transcript (`text` | `image` | `unsupported`).
Chargé via `previewFile` au moment où la carte s'ouvre. Le clic ouvre le fichier sur l'hôte.
_À éviter_ : FilePreviewPanel, Tooltip de chemin, lecture Desktop

**Pièce jointe**:
Image jointe à un Turn depuis le Composer (paste, drop ou fichier). Le snapshot ne porte que la
meta ; l'aperçu passe par `previewAttachment`.
_À éviter_ : FilePreview, dataUrl dans le transcript, brouillon persisté

**Keybinding**:
Association persistée entre une Action et un Raccourci, surchargeable depuis les Paramètres.
_À éviter_ : shortcut, hotkey, binding

**Raccourci**:
Combinaison de touches au format tanstack (`Mod+K`).
_À éviter_ : shortcut, hotkey
