# `@noyau/client-runtime`

Runtime renderer mono-Environment : capacités de plateforme, Session RPC, superviseur
de connexion, discipline snapshot / sequence / `synchronized`. Aucun export racine —
importer un subpath.

`apps/web/src/lib/control-plane.ts` attend le `ConnectionSupervisor` pour le
transport. Les primitives Atom (Phase 3) et la Projection Shell (Phase 4)
sont portées. Tableau / Thread restent sur le consommateur web.

## Subpaths publics

| Subpath                                  | Module                         | Rôle                                                      |
| ---------------------------------------- | ------------------------------ | --------------------------------------------------------- |
| `@noyau/client-runtime/platform`         | `src/platform/services.ts`     | Tags Effect : bootstrap RPC, WebSocket, reporter          |
| `@noyau/client-runtime/rpc`              | `src/rpc/session.ts`           | Une tentative de transport, `retryTransientErrors: false` |
| `@noyau/client-runtime/connection`       | `src/connection/supervisor.ts` | Propriétaire unique de la reconnexion et de la génération |
| `@noyau/client-runtime/connection/model` | `src/connection/model.ts`      | Phases, `TransportRupture`, classification d'erreurs      |
| `@noyau/client-runtime/state/stream`     | `src/state/stream-reducer.ts`  | Reducer séquencé et phase `empty → synchronizing → live`  |
| `@noyau/client-runtime/state/runtime`    | `src/state/runtime.ts`         | Families Atom, scheduler de commandes, état distant       |
| `@noyau/client-runtime/state/shell`      | `src/state/shell.ts`           | Projection Shell, reducer, index stable, ressource Atom   |
| `@noyau/client-runtime/testing`          | `src/testing/layers.ts`        | Layers mémoire et Registry Atom de test                   |

Il n'y a pas d'export `"."`. Un import `@noyau/client-runtime` est une erreur de lint.

## Correspondance t3code

Aucune source t3code n'est copiée. Référence lue seulement.

| Noyau                   | t3code                                              | Status               |
| ----------------------- | --------------------------------------------------- | -------------------- |
| `platform/services`     | `platform`                                          | Phase 1 minimal tags |
| `state/stream`          | (Noyau-specific ; web `makeSequencedFrameConsumer`) | Phase 1 done         |
| `rpc/session`           | `rpc/session.ts`                                    | Phase 2 done         |
| `connection/supervisor` | `connection/supervisor.ts`                          | Phase 2 done         |
| `state/runtime`         | `state/runtime.ts`                                  | Phase 3 done         |
| `state/shell`           | `state/shell.ts`                                    | Phase 4 done         |

## Primitives Atom (`./state/runtime`)

`createQueryAtomFamily` et `createSubscriptionAtomFamily` reçoivent un
`Atom.runtime(layer)` qui fournit `ConnectionSupervisor`. La clé de family est
une sérialisation JSON stable de l'input, dont l'instance originale est conservée ;
pas d'`EnvironmentId`. Une query attend
`phase === "connected"`, se revalide quand la génération change, et ignore un
résultat plus ancien. Une subscription commute via `Stream.switchMap` sur la
nouvelle génération. `staleTime`, `idleTTL` et refresh ne s'appliquent que s'ils
sont passés. Le scheduler de commandes expose `parallel | serial | singleFlight |
latest`. `RemoteResourceState` conserve `value` quand `phase` ou `error` change.

## Contrat `synchronized`

Dans Web aujourd'hui, toute frame (y compris `synchronized`) publie `Connected` et
le marqueur est ignoré. Ici, `synchronized` avant snapshot laisse la phase `empty` ;
après snapshot ou cursor chaud (`afterSequence`) elle devient `live` sans muter
value ni cursor. Aucun statut `Connected` / `Reconnecting` dans ce reducer.
`synchronized` n'est pas un état de transport.

## Projection Shell (`./state/shell`)

`createShellResourceAtom` construit la ressource unique (`empty → synchronizing
→ live`). `synchronized` après snapshot ou cursor chaud passe à `live` sans
muter value ni cursor, et sans publier un statut de transport `Connected`.
Une nouvelle génération RPC resouscrit avec `afterSequence` et conserve la
valeur précédente. `upsertOptimisticThread` fusionne un Thread sans avancer
la séquence. `indexThreadShells` réutilise les tableaux précédents.
