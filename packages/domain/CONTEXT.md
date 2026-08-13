# @noyau/domain

Langage métier du tracker Kanban humains-agents et de ses exécutions isolées.

## Langage

**Tableau**:
Projection Kanban unique d'un projet, composée de colonnes librement ordonnées entre lesquelles les
tickets sont déplacés.
_À éviter_ : Board multiple, workflow d'exécution

**Colonne Done**:
Colonne terminale unique d'un tableau. Son identité est native et protégée, tandis que son nom, sa
couleur et sa position sont configurables.
_À éviter_ : colonne ordinaire, statut d'exécution

**Ticket**:
Élément de travail durable organisé sur un tableau, qu'il soit non assigné ou confié à un humain,
Marion ou un profil d'agent.
_À éviter_ : Task, Mission, unité d'exécution

**Execution**:
Intention durable de faire contribuer un ou plusieurs agents à un ticket avec un résultat attendu,
un budget et une politique d'outils.
_À éviter_ : Ticket, tâche, AgentRun

**Attempt**:
Tentative isolée de réaliser une exécution. Chaque retry crée un nouvel Attempt avec son propre
environnement de travail.
_À éviter_ : Execution, AgentRun, retry mutable

**AgentRun**:
Invocation concrète d'un agent au sein d'un Attempt, comme run principal ou auxiliaire.
_À éviter_ : Execution, Attempt

**Étiquette**:
Classification configurable dans le périmètre d'un projet et attachable à un ticket. L'étiquette
native `need-human` signale visuellement un besoin humain sans déclencher de comportement métier.
_À éviter_ : statut, type de ticket

**Responsable**:
Acteur unique qui porte la responsabilité principale d'un ticket.
_À éviter_ : participant, exécutant

**Participant**:
Acteur associé explicitement à un ticket sans en porter la responsabilité principale.
_À éviter_ : responsable, abonné implicite

**Ticket archivé**:
Ticket retiré du tableau actif tout en conservant son contenu, ses relations et son historique.
_À éviter_ : ticket supprimé, ticket terminé
