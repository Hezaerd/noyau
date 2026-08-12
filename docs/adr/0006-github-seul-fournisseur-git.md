# GitHub comme unique fournisseur Git

---

Statut : accepté.

---

Les dépôts associés à un projet sont des dépôts GitHub. Le schéma `Repository.provider` est le
littéral `"github"` : pas d'adaptateur GitLab, Gitea ou Git générique en v1. Webhooks, pull requests
et le port `GitRuntime` parlent à GitHub. Un faux GitHub reste légitime dans les tests.
