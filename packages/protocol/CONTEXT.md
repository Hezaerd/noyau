# @noyau/protocol

Contrat de communication du control plane : schémas Effect des identités, entités, commandes et
événements. Aucune logique, aucune IO — uniquement des `Schema` décodables aux frontières.

## Langage

**CommandRequest**:
Intention soumise par un client avec son `commandId`, sa commande, son payload et une causalité
éventuelle, avant ajout des métadonnées possédées par Noyau.
_À éviter_ : Command, requête CRUD

**Command**:
`CommandRequest` enrichie par Noyau avec le projet, l'acteur, l'horodatage, la version de schéma et
une corrélation vérifiée.
_À éviter_ : action, mutation

**Receipt**:
Résultat durable d'une commande décodable, accepté ou rejeté, rendu à l'identique pour chaque retry
du même `CommandRequest` dans le même scope.
_À éviter_ : réponse HTTP, accusé réseau

**EventCursor**:
Position opaque, versionnée et liée à un projet, depuis laquelle un client peut reprendre son flux
d'événements.
_À éviter_ : sequence, offset SQL

**EventEnvelope**:
Fait de domaine accompagné de son identité, son acteur, sa causalité, sa corrélation et son instant.
_À éviter_ : événement brut, message réseau

**BoardSnapshot**:
Vue cohérente d'un Tableau, de ses Tickets et de leur DAG à la position d'un `EventCursor`.
_À éviter_ : liste de tâches, cache client

**TicketActivity**:
Suite bornée des `EventEnvelope` autoritatifs liés à un Ticket.
_À éviter_ : Thread, historique du Channel
