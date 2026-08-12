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

## Contenu

| Module            | Rôle                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `./ids`           | IDs brandés (UUID sauf `ActorId`) + `SchemaVersion` du protocole.                               |
| `./entities/*`    | `Project`, `Repository`, `Channel`, `Thread`, `Message`, `Mission`, `Task` (avec `TaskStatus`). |
| `./commands`      | Commandes enrichies + `TaskCommandRequest` publique limitée à `task.create` et `task.assign`.   |
| `./events`        | Faits (`task.created`, …, `message.sent`) + `EventEnvelope` persisté.                           |
| `./task/errors`   | Rejets métier task partagés entre domaine, persistance et frontière HTTP.                       |
| `./receipts`      | `Receipt` public stable, accepté ou rejeté.                                                     |
| `./control-plane` | Contrat `HttpApi`, erreurs HTTP, identité, snapshot, curseur et événement SSE du control plane. |

## Décisions structurantes

- **Faits sans enveloppe** : un decider pur produit des faits (`DomainEvent`) sans `eventId` ni
  horodatage. Le control plane construit l'`EventEnvelope` (UUID, horloge, corrélation) au moment
  de la persistance, dans la même transaction PostgreSQL.
- **Causation typée** : `causationId` d'une commande est un `EventId` (réaction d'un reactor) ;
  celui d'un événement est un `CommandId` (commande décidée). Pas de type `CausationId` fourre-tout.
- **Métadonnées possédées par Noyau** : un client choisit le `commandId` et peut citer un
  `causationId`, mais ne fournit ni `projectId`, ni `actorId`, ni horodatage, ni version de schéma.
  Sans causalité, `correlationId = commandId` ; avec causalité, Noyau vérifie l'événement dans le
  même projet et hérite de sa corrélation.
- **Receipts au protocole** : le receipt est un contrat public, même si PostgreSQL en porte la
  durabilité. Une réutilisation de `commandId` avec une autre request ou un autre scope est un
  conflit, pas un retry.
- **Curseur opaque et scopé** : un `EventCursor` encode sa version, son projet et une position
  logique sans exposer la séquence SQL interne.
- **`ActorId` non-UUID** : format libre (`human:hezaerd`, `agent:marion`, `system`) pour rester
  lisible dans le journal et le forum.
- **Exports subpath uniquement**, pas de barrel — voir AGENTS.md.

## Extension

Ajouter une commande = TaggedStruct avec `...commandMeta` + payload, puis l'ajouter à l'union
`Command`. Même mécanique pour les événements. Toute évolution incompatible incrémente
`SchemaVersion`.
