# Hermes local ou distant via Tailscale

---

Statut : accepté.

---

Une instance Hermes tourne soit sur la même machine que Noyau, soit sur une machine joignable par
Tailscale. Noyau n'orchestre pas de cluster de containers (Kubernetes, fleet cloud). Chaque
`Attempt` possède exactement une branche et un worktree, partagés par tous ses `AgentRun`. Hermes
peut isoler leurs processus ou containers sur l'hôte où ils s'exécutent, mais ne doit pas créer un
espace de travail par `AgentRun`. Deux `Attempt` distincts ne doivent jamais partager une branche
ou un worktree. Noyau l'adresse via le port `AgentRuntime` et l'API HTTP publique streamée d'Hermes.
