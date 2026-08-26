# `@noyau/client-runtime`

Runtime renderer mono-Environment : capacités de plateforme, discipline
snapshot / sequence / `synchronized`. Aucun export racine — importer un subpath.

`apps/web` n'est pas encore câblé. Le chemin live reste
`apps/web/src/lib/control-plane.ts`.

## Subpaths publics

| Subpath                              | Module                        | Rôle                                                     |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------- |
| `@noyau/client-runtime/platform`     | `src/platform/services.ts`    | Tags Effect : bootstrap RPC, WebSocket, reporter         |
| `@noyau/client-runtime/state/stream` | `src/state/stream-reducer.ts` | Reducer séquencé et phase `empty → synchronizing → live` |
| `@noyau/client-runtime/testing`      | `src/testing/layers.ts`       | Layers mémoire et Registry Atom de test                  |

Il n'y a pas d'export `"."`. Un import `@noyau/client-runtime` est une erreur de lint.

## Correspondance t3code

Aucune source t3code n'est copiée. Référence lue seulement.

| Noyau                   | t3code                                              | Status                  |
| ----------------------- | --------------------------------------------------- | ----------------------- |
| `platform/services`     | `platform`                                          | Phase 1 minimal tags    |
| `state/stream`          | (Noyau-specific ; web `makeSequencedFrameConsumer`) | Phase 1 target contract |
| `rpc/session`           | `rpc/session.ts`                                    | Phase 2                 |
| `connection/supervisor` | `connection/supervisor.ts`                          | Phase 2                 |
| `state/runtime`         | `state/runtime.ts`                                  | Phase 3                 |
| `state/shell`           | `state/shell.ts`                                    | Phase 4                 |

## Contrat `synchronized`

Dans Web aujourd'hui, toute frame (y compris `synchronized`) publie `Connected` et
le marqueur est ignoré. Ici, `synchronized` avant snapshot laisse la phase `empty` ;
après snapshot ou cursor chaud (`afterSequence`) elle devient `live` sans muter
value ni cursor. Aucun statut `Connected` / `Reconnecting` dans ce reducer.
