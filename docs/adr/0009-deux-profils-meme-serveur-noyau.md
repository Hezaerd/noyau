# Deux profils de déploiement pour un même serveur Noyau

---

Statut : remplacé par [l'ADR-0011](0011-noyau-local-first-v0.1.md) pour la v0.1 (Environment
local unique, pas de profil VPS). Conservé comme historique des deux profils envisagés.

---

> **Historique.** La v0.1 n'a qu'un Environment local SQLite. PostgreSQL, PGlite, Tailscale et
> Hermes ne sont pas des cibles actives.

Noyau adopte un seul modèle client/serveur et deux profils de déploiement. `Noyau Desktop` est le
client Electron qui réutilise le renderer React ; il ne possède jamais l'état métier. `Noyau Server`
est le modular monolith lancé par `noyau serve` et reste l'unique autorité durable : commandes,
événements, receipts, projections, outbox, reactors et scheduler. Le client utilise toujours le même
Effect RPC sur WebSocket, y compris en local ; aucun raccourci IPC ne contourne cette frontière.

- **Profil distant** : `Noyau Desktop` se connecte directement à `noyau serve` sur un VPS. Le serveur
  utilise PostgreSQL et adresse Hermes sur le même hôte. Tailscale Serve est le premier mécanisme
  d'accès privé ; un relay propriétaire est différé.
- **Profil local géré** : Electron supervise sur loopback le même `noyau serve` comme processus
  enfant, avec une PGlite persistée sur le filesystem et un Hermes local. Le processus serveur est
  l'unique propriétaire de PGlite. Bootstrap, session, autorisation RPC, snapshots et reprise par
  curseur restent identiques au profil distant.

Une instance locale et une instance distante sont deux autorités indépendantes, chacune identifiée
de façon stable et propriétaire de sa base. Noyau ne synchronise, ne fédère et ne chaîne pas deux
control planes ; en particulier, le profil distant ne lance pas un serveur Noyau local intermédiaire.
Le profil « Noyau local avec Hermes distant », SSH, Cloudflare Tunnel et un relay restent hors du
périmètre initial.

Conséquences :

- `apps/server` reçoit ses implémentations de stockage et Hermes par configuration/`Layer` :
  PGlite + Hermes géré localement, ou PostgreSQL + Hermes colocalisé ;
- `apps/desktop` reste un shell et un superviseur ; `apps/web` fournit le renderer partagé ;
- PGlite s'exécute avec durabilité stricte et une seule instance propriétaire ; PostgreSQL reste la
  cible des tests de contention multi-connexion et du déploiement VPS ;
- le client et le serveur annoncent une version de protocole et des capacités compatibles, car leurs
  mises à jour peuvent être indépendantes dans le profil distant.
