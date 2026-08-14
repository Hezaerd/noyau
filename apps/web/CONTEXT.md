# @noyau/web

Langage de l'interface de collaboration et de supervision des projets Noyau.

## Langage

**Tableau**:
Vue Kanban unique d'un projet, composée de colonnes ordonnées et de tickets.
_À éviter_ : Kanban, liste de tâches

**Ticket**:
Élément de travail affiché comme une carte dans le Tableau.
_À éviter_ : tâche, carte, exécution

**Channel**:
Canal de discussion général d'un projet.
_À éviter_ : forum, Workbench

**Thread**:
Discussion isolée au sein d'un Channel.
_À éviter_ : Channel, commentaire de ticket

**Workbench**:
Nom affiché du Thread dédié à la collaboration opérationnelle sur un Ticket.
_À éviter_ : nouvelle entité de conversation, espace d'exécution

Le Tableau charge un `BoardSnapshot`, soumet des `TicketCommandRequest` et reprend le flux projet
sur Effect RPC WebSocket. L'identité courante appartient à la frontière serveur ; l'UI ne fournit
ni acteur sandbox ni métadonnée d'enrichissement de commande.
