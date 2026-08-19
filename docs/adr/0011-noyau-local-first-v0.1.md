# Prioriser Noyau local-first v0.1

> **Statut : accepté.** Supersède [ADR-0009](0009-deux-profils-meme-serveur-noyau.md) et
> [ADR-0010](0010-prioriser-la-boucle-ticket-v1.md) pour cette coupe. Source :
> [Spécifier Noyau local-first v0.1](https://github.com/Hezaerd/noyau/issues/54).

Noyau v0.1 est une application desktop locale : un Environment unique par installation, un
`Noyau Server` Node enfant, SQLite, les dossiers projet et Cursor sur la même machine. Electron
supervise le serveur et n'a aucun état métier. Le renderer ne parle métier que par Effect RPC
WebSocket loopback. VPS, PGlite, connexion distante, catalogue d'Environments et collaboration
multi-utilisateur sont hors coupe.

Le produit reste Tableau-first : Board et Ticket inchangés. Les Threads sont des conversations
provider (`Project → Thread → Turn`), liées optionnellement aux Tickets par `TicketThread`. Cursor
installé localement est le seul provider réel. La boucle durable à prouver va de l'ouverture d'un
dossier existant jusqu'à la reprise d'un Thread après redémarrage.

Les données PostgreSQL/PGlite actuelles n'imposent aucune migration : un reset est accepté.
