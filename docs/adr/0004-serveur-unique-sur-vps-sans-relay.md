# Serveur unique sur VPS, sans relay ni clients natifs en v1

---

Statut : accepté pour le modular monolith — topologie de distribution remplacée par l'ADR-0009,
puis par [l'ADR-0011](0011-noyau-local-first-v0.1.md) (Environment local unique, VPS hors v0.1).

---

Le split `apps/control-plane` + `apps/worker` prévu initialement est abandonné au profit d'un seul
`apps/server` : frontière RPC, engine de commandes, reactors et scheduler dans le même processus,
comme le `apps/server` de T3 Code. Le split de déploiement redeviendra une option quand une charge
réelle le justifiera ; rien dans le code ne doit l'empêcher (reactors derrière l'outbox, pas de
couplage mémoire).

La décision initiale limitait le déploiement à un VPS PostgreSQL servi directement à une PWA.
L'ADR-0009 remplace cette topologie par deux profils utilisant le même `apps/server` : serveur
PostgreSQL sur VPS avec client Electron distant, ou serveur local supervisé par Electron avec
PGlite. Le relay reste différé tant qu'un besoin de découverte ou de traversée de NAT n'est pas
constaté.
