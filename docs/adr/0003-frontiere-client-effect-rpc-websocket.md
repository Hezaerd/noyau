# Frontière client en Effect RPC sur WebSocket

---

Statut : accepté — remplace la partie transport de l'ADR-0002.

---

La frontière client/serveur passe d'un couple HTTP + SSE à un unique WebSocket Effect RPC
(`effect/unstable/rpc`), sur le modèle validé par T3 Code : un `RpcGroup` dans
`packages/protocol` comme contrat unique, méthodes unaires pour les commandes et snapshots,
server streams pour les flux d'événements, autorisation par scope au niveau de chaque méthode
(alignée sur les capability grants).

Les invariants de l'ADR-0002 restent en vigueur : endpoint générique de commandes plutôt que
mutations CRUD, snapshot cohérent d'abord puis flux ordonné livré au moins une fois, reprise par
`EventCursor` opaque dérivé d'une position transactionnelle par projet. Le WebSocket est un
transport, jamais la source du curseur ni de la durabilité : une reconnexion reprend du dernier
curseur persisté côté client.
