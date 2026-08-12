# Serveur unique sur VPS, sans relay ni clients natifs en v1

---

Statut : accepté.

---

Le split `apps/control-plane` + `apps/worker` prévu initialement est abandonné au profit d'un seul
`apps/server` : frontière RPC, engine de commandes, reactors et scheduler dans le même processus,
comme le `apps/server` de T3 Code. Le split de déploiement redeviendra une option quand une charge
réelle le justifiera ; rien dans le code ne doit l'empêcher (reactors derrière l'outbox, pas de
couplage mémoire).

Le serveur est déployé durable sur un VPS avec PostgreSQL : les clients s'y connectent en direct.
Un relay façon T3 Connect (découverte, credentials courte durée, notifications) ne se justifie que
si des instances Noyau tournent un jour sur des machines personnelles derrière NAT — scénario de
distribution, pas de v1. Même raisonnement pour les clients natifs : `apps/web` en PWA couvre
desktop et mobile ; Electron et mobile natif sont différés jusqu'à un besoin réel (bundling d'un
serveur local, notifications push natives).
