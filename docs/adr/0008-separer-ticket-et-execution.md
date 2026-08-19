# Séparer le ticket Kanban de l'exécution agent

> **Statut : remplacé.** [ADR-0010](0010-prioriser-la-boucle-ticket-v1.md) a retiré
> `Execution` / `Attempt` / `AgentRun`. [ADR-0013](0013-session-projetee-et-cursor.md) fixe le
> modèle actif : Thread, Session projetée et Turn. Cet ADR reste un historique.

Noyau adopte un tracker humains-agents avec exactement un tableau Kanban par projet et abandonne
`Mission` comme conteneur de travail. Un `Ticket` organise le travail durable sans imposer de
critères d'acceptation ni d'état technique d'agent ; une `Execution` distincte porte le résultat
attendu, le budget et la politique d'outils, puis crée des `Attempt` isolés contenant les
`AgentRun`. Cette séparation préserve l'usage léger façon Trello pour les humains tout en empêchant
les retries, attentes et runs de déformer le cycle de vie visible des tickets.
