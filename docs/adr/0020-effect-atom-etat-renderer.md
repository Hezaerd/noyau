# Effect Atom pour l’état renderer

> **Statut : accepté.** Complète [ADR-0003](0003-frontiere-client-effect-rpc-websocket.md).
> La frontière RPC ne change pas : Atom est le cache client, pas le transport.

Le renderer tient son état dans un `AtomRegistry` unique (`@effect/atom-react` +
`effect/unstable/reactivity`). Les projections `subscribeShell` / `subscribeProject` /
`subscribeThread` et le chrome (Pin, lastVisitedAt, Brouillon, Préférences) sont des atoms.
Les composants ne lisent que via `useAtomValue` / `useAtomSet` / `useAtom`.

Zustand a été écarté : Noyau joint déjà shell et chrome dans les mêmes écrans (Queue Classés,
unread, create Thread). Deux librairies interdisent les atoms dérivés et `Atom.batch`.

`Atom.make(stream | effect)` reste interdit hors frontière RPC. Le superviseur WS
(`subscribe*` + curseur) écrit des writables `keepAlive`. Les imports
`effect/unstable/reactivity` restent dans `apps/web/src/state/`. Effect.gen / `run*` restent
hors du render.
