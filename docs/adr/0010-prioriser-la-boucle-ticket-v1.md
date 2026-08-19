# Prioriser la boucle Ticket v1

> **Statut : accepté.** Supersède l'ADR-0008 pour la v1.

Noyau livre d'abord une boucle logique Trello-like centrée sur le Ticket : titre requis,
description GFMD, échéance et priorité optionnelles, audit système et dépendances entre Tickets
formant un DAG. Le responsable reste dans le modèle durable mais n'est pas exposé dans l'UI v1 ;
les checklists sont remplacées par des Tickets liés, et aucun Workbench dédié n'est créé :
`Channel`, `Thread` et `Message` restent génériques, avec un `sourceThreadId` optionnel sur le
Ticket.

`Execution`, `Attempt` et les surfaces agent sont retirés des couches actives et des données
pré-v1. La vision agents/Hermes est différée après la v1 sans engager son futur modèle ; un
reset/purge des données pré-v1 est accepté plutôt qu'une migration de compatibilité.
