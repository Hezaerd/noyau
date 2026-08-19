# Hermes local ou distant via Tailscale

---

Statut : remplacé par [l'ADR-0013](0013-session-projetee-et-cursor.md) — Cursor ACP local, pas
Hermes. Conservé comme historique d'exploration.

---

> **Historique.** Hermes, `Attempt` et Tailscale ne font pas partie de la v0.1. Le runtime actif
> est l'adaptateur Cursor.

Une instance Hermes tourne soit sur la même machine que Noyau, soit sur une machine joignable par
Tailscale. Noyau n'orchestre pas de cluster de containers (Kubernetes, fleet cloud). Chaque
`Attempt` possède exactement une branche et un worktree, partagés par tous ses `AgentRun`. Hermes
peut isoler leurs processus ou containers sur l'hôte où ils s'exécutent, mais ne doit pas créer un
espace de travail par `AgentRun`. Deux `Attempt` distincts ne doivent jamais partager une branche
ou un worktree. Noyau l'adresse via le port `AgentRuntime` et l'API HTTP publique streamée d'Hermes.

L'ADR-0009 réduit le périmètre initial à Hermes colocalisé : avec Noyau sur le VPS dans le profil
distant, ou avec Noyau sur le laptop dans le profil local géré. L'endpoint Hermes distant reste une
capacité future de l'adaptateur, pas un troisième profil à construire maintenant.
