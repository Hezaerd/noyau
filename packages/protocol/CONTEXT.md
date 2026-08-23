# @noyau/protocol

Contrat de communication du control plane : schémas Effect des identités, commandes, événements
et RPC. Aucune logique, aucune IO — uniquement des `Schema` décodables aux frontières.

## Langage

**CommandRequest**:
Intention soumise par le renderer avec son `commandId`, sa commande, son payload et une causalité
éventuelle, avant ajout des métadonnées possédées par Noyau.
_À éviter_ : Command, requête CRUD

**Command**:
`CommandRequest` enrichie par Noyau avec le projet, l'acteur (hors payload), l'horodatage, la
version de schéma et une corrélation vérifiée.
_À éviter_ : action, mutation

**Receipt**:
Résultat durable d'une commande décodable, accepté ou rejeté, rendu à l'identique pour chaque retry
du même `CommandRequest` dans le même scope.
_À éviter_ : réponse HTTP, accusé réseau

**afterSequence**:
Curseur numérique global depuis lequel un client reprend un stream. Un gap hors `[0, 1000]`
demande un snapshot frais.
_À éviter_ : EventCursor, offset SQL, position WebSocket

**resumeCursor**:
`{ schemaVersion: 1, sessionId }` opaque pour `session/load`. La Session n'a pas d'id métier.
_À éviter_ : cwdLastBound, ProviderBinding

**modelSelection**:
Préférence durable d'un Thread pour un modèle Provider, son `reasoningEffort` et, si disponibles,
son `serviceTier` et son option `thinking`. Sa modification est durable indépendamment du
démarrage d'un Turn ; `null` demande le choix automatique du Provider.
_À éviter_ : modèle actif garanti, catalogue de modèles

**TicketThread**:
Lien optionnel plusieurs-à-plusieurs entre un Ticket et un Thread du même Project.
_À éviter_ : sourceThreadId, Thread dédié

**EventEnvelope**:
Fait de domaine accompagné de son identité, son acteur, sa causalité, sa corrélation et son instant.
_À éviter_ : événement brut, message réseau

**BoardSnapshot**:
Vue cohérente d'un Tableau, de ses Tickets et de leur DAG à une `sequence`.
_À éviter_ : liste de tâches, cache client

**ThreadSnapshot**:
Vue cohérente d'un Thread, de ses Turns, de sa Session projetée et du transcript à une `sequence`.
_À éviter_ : Channel, historique de Message

**TicketActivity**:
Suite bornée des faits autoritatifs liés à un Ticket, distincte du transcript d'un Thread.
_À éviter_ : Thread, commentaire

**ShellFocus**:
Vue UI volatile du renderer (Tableau ou Thread d'un Project). Elle traverse le RPC et n'entre
pas dans le journal.
_À éviter_ : Command, présence, current route

**FilePreview**:
Aperçu borné d'un fichier sous le WorkspaceRoot d'un Project (`text` | `image` | `unsupported`).
Lecture RPC, pas une Command, pas un fait du journal.
_À éviter_ : pièce jointe, FilePreviewPanel, lecture hors sandbox

**ProjectAgentIntegration**:
Constat RPC de l’Intégration agent présente dans le WorkspaceRoot d’un Project. Il décrit un état
opérationnel recalculé et non une projection durable.
_À éviter_ : Event, préférence, propriété du Project

**TurnImageUpload**:
Octets d'une image qui traversent `thread.turn.start` une seule fois (`dataUrl`).
_À éviter_ : pièce jointe persistée, événement, blob du journal

**TurnImageAttachment**:
Meta durable d'une image jointe à un Turn (`id`, `name`, `mimeType`, `sizeBytes`). Les octets
restent hors journal.
_À éviter_ : dataUrl, FilePreview, BLOB SQLite

**AttachmentPreview**:
Aperçu borné d'une TurnImageAttachment persistée. Lecture RPC, pas une Command.
_À éviter_ : FilePreview, snapshot, pièce jointe inline

**Checkout**:
Liaison durable d'un Thread à un cwd Git : `branch` (dernière ref Noyau) et `worktreePath`
(`null` = `WorkspaceRoot`).
_À éviter_ : threadEnvMode persisté, cwd de Session

**threadEnvMode**:
Intention de draft `local | worktree` pour le prochain Turn. Pas un champ du Thread.
_À éviter_ : mode durable, politique de lock Git

**GitRuntime**:
Capacité live du Server (`vcs.*`, `git.*`) hors journal. L'idempotence client passe par `actionId`.
_À éviter_ : agrégat Commit, événement Push, outbox Git

**Publish**:
Opération live GitHub : `gh repo create`, remote `origin`, push HEAD s'il existe. Pas une Command.
_À éviter_ : sourceControl, wizard multi-forge, `gh repo create --source`

**Open in**:
RPC `workspace.openInEditor` / `workspace.listEditors`. Pas une Command, pas un fait du journal.
_À éviter_ : openPath, FilePreview, Command

**Éditeur hôte**:
Identifiant `cursor | vscode | zed | file-manager` pour Open in. `file-manager` est le
gestionnaire de fichiers de l'hôte (Finder, Explorer ou Files).
_À éviter_ : Provider, EditorId libre
