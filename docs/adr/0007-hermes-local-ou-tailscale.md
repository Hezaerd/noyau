# Hermes local ou distant via Tailscale

---

Statut : accepté.

---

Une instance Hermes tourne soit sur la même machine que Noyau, soit sur une machine joignable par
Tailscale. Noyau n'orchestre pas de cluster de containers (Kubernetes, fleet cloud). L'isolation du
run (container, worktree) reste du ressort d'Hermes sur l'hôte où il s'exécute ; Noyau l'adresse via
le port `AgentRuntime` et l'API HTTP publique streamée d'Hermes.
