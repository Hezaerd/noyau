# Séparer le ticket Kanban de l'exécution agent

> **Statut : différé pour la v1, supersédé par [ADR-0010](0010-prioriser-la-boucle-ticket-v1.md).**
> Cet ADR conserve l'historique du modèle envisagé, mais `Execution`, `Attempt` et `AgentRun` ne
> font pas partie du contrat actif Ticket v1.

Noyau adopte un tracker humains-agents avec exactement un tableau Kanban par projet et abandonne
`Mission` comme conteneur de travail. Un `Ticket` organise le travail durable sans imposer de
critères d'acceptation ni d'état technique d'agent ; une `Execution` distincte porte le résultat
attendu, le budget et la politique d'outils, puis crée des `Attempt` isolés contenant les
`AgentRun`. Cette séparation préserve l'usage léger façon Trello pour les humains tout en empêchant
les retries, attentes et runs de déformer le cycle de vie visible des tickets.
