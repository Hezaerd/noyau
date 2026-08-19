# @noyau/domain

Langage métier du tracker Kanban Ticket v1.

## Langage

**Tableau**:
Projection Kanban unique d'un projet, composée de colonnes librement ordonnées entre lesquelles les
tickets sont déplacés.
_À éviter_ : Board multiple, liste de tâches

**Colonne Done**:
Colonne terminale unique d'un tableau. Son identité est native et protégée, tandis que son nom, sa
couleur et sa position sont configurables.
_À éviter_ : colonne ordinaire, statut de Ticket

**Ticket**:
Élément de travail durable et plat organisé sur un Tableau.
_À éviter_ : Task, Mission, checklist, unité d'exécution

**Dépendance Ticket**:
Relation orientée dans laquelle un Ticket dépend d'un autre Ticket ; l'ensemble forme un DAG.
_À éviter_ : sous-ticket, checklist, ordre de colonne

**Étiquette**:
Classification configurable dans le périmètre d'un projet et attachable à un ticket. L'étiquette
native `need-human` signale visuellement un besoin humain sans déclencher de comportement métier.
_À éviter_ : statut, type de ticket

**Responsable**:
Acteur unique et optionnel qui porte la responsabilité principale d'un Ticket.
_À éviter_ : participant, exécutant

**Participant**:
Acteur associé explicitement à un Ticket sans en porter la responsabilité principale.
_À éviter_ : responsable, abonné implicite

**Ticket archivé**:
Ticket retiré du tableau actif tout en conservant son contenu, ses relations et son historique.
_À éviter_ : ticket supprimé, ticket terminé
