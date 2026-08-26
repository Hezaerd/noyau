# Client Runtime hybride : Effect Atom distant, Zustand local

> **Statut : accepté.** Supersède [ADR-0020](0020-effect-atom-etat-renderer.md) et complète
> [ADR-0003](0003-frontiere-client-effect-rpc-websocket.md).

Noyau porte dans `packages/client-runtime` une version mono-Environment du Client Runtime t3code :
Effect Atom possède les ressources RPC, les Projections distantes, leur synchronisation et leur
rétention ; Zustand possède dans `apps/web` les États client contrôlés par l'interface et leur
persistance locale. Le Server reste la seule autorité métier. Cette séparation remplace les atoms
writables alimentés impérativement et évite de reconstruire autour d'Atom des stores, une
persistance et des lifecycles maison.

Le port reprend les invariants et les tests du subtree t3code, pas ses capacités hors périmètre :
pas de catalogue multi-Environment, relay, SSH, pairing, auth distante, mobile ou cache offline en
v0.1. Les vues qui joignent Projection distante et État client composent des valeurs via des
fonctions pures au niveau des hooks React ; aucun bridge bidirectionnel Atom ↔ Zustand n'est créé.
