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
