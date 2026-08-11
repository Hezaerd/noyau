# @noyau/protocol

Contrat de communication du control plane : schémas Effect des identités, entités, commandes et
événements. Aucune logique, aucune IO — uniquement des `Schema` décodables aux frontières.

## Contenu

| Module         | Rôle                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `./ids`        | IDs brandés (UUID sauf `ActorId`) + `SchemaVersion` du protocole.                                   |
| `./entities/*` | `Project`, `Repository`, `Channel`, `Thread`, `Message`, `Mission`, `Task` (avec `TaskStatus`).     |
| `./commands`   | Enveloppe de commande + `task.create`, `task.assign`, `task.complete`, `task.fail`, `message.send`. |
| `./events`     | Faits (`task.created`, …, `message.sent`) + `EventEnvelope` persisté.                               |

## Décisions structurantes

- **Faits sans enveloppe** : un decider pur produit des faits (`DomainEvent`) sans `eventId` ni
  horodatage. Le control plane construit l'`EventEnvelope` (UUID, horloge, corrélation) au moment
  de la persistance, dans la même transaction PostgreSQL.
- **Causation typée** : `causationId` d'une commande est un `EventId` (réaction d'un reactor) ;
  celui d'un événement est un `CommandId` (commande décidée). Pas de type `CausationId` fourre-tout.
- **`ActorId` non-UUID** : format libre (`human:hezaerd`, `agent:marion`, `system`) pour rester
  lisible dans le journal et le forum.
- **Exports subpath uniquement**, pas de barrel — voir AGENTS.md.

## Extension

Ajouter une commande = TaggedStruct avec `...commandMeta` + payload, puis l'ajouter à l'union
`Command`. Même mécanique pour les événements. Toute évolution incompatible incrémente
`SchemaVersion`.
