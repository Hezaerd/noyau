# @noyau/domain

Deciders et projectors purs du control plane. Aucune IO, aucun UUID, aucune horloge : ces
fonctions sont appelées par le control plane à l'intérieur d'une transaction PostgreSQL.

## Contenu

| Module             | Rôle                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `./task/decider`   | `decide(state, command) → Result<TaskEvent[], TaskDecisionError>` |
| `./task/projector` | `evolve(state, event) → state` et `replay(events)`                |

## Décisions structurantes

- **Decider pur** : commande + état minimal (`TaskState`) → faits ou erreur taguée
  (`TaskAlreadyExists`, `TaskNotFound`, `InvalidTaskTransition`). Le `Result` d'Effect porte
  l'erreur ; jamais d'exception pour un cas métier.
- **`TaskState` n'est pas la projection lecture** : c'est le strict nécessaire pour décider
  (statut, assignation). Les projections riches (forum, vues tâches) viendront séparément.
- **Transitions** : `task.assign` depuis `proposed`/`ready` ; `task.complete` depuis
  `running`/`verifying` ; `task.fail` depuis `leased`/`running`/`waiting_*`/`verifying`. Les
  statuts `leased`/`running` seront atteints par les commandes du scheduler et des workers
  (étapes 3+ de l'ordre d'implémentation) — le decider les accepte déjà en entrée.
- **Projector total** : un événement sur un état absent est ignoré plutôt que de jeter — le
  journal fait foi.

## Tests

`bun run test` (vitest + `@effect/vitest`). Les états de test sont construits directement
(`stateWith("running")`) sans passer par le replay, car toutes les transitions n'ont pas encore
leurs commandes.
