# @noyau/web

Langage de l'interface humaine des projets et Tickets Noyau.

## Langage

**Tableau**:
Vue Kanban unique d'un projet, composée de colonnes ordonnées et de Tickets.
_À éviter_ : Kanban, liste de tâches

**Ticket**:
Élément de travail durable affiché comme une carte dans le Tableau et détaillé dans un Dialog.
_À éviter_ : tâche, carte, exécution

**Responsable**:
Acteur durable optionnel d'un Ticket, volontairement absent de l'interface v1.
_À éviter_ : exécutant, participant

**Dépendance**:
Relation orientée entre deux Tickets, présentée comme `Bloqué par` ou `Bloque`.
_À éviter_ : sous-ticket, checklist, todolist

**Activité système**:
Historique autoritatif des faits d'un Ticket, affiché séparément des conversations.
_À éviter_ : commentaire, Channel, historique local

**Channel**:
Canal de discussion générique d'un projet.
_À éviter_ : activité système, espace de Ticket

**Thread**:
Discussion isolée au sein d'un Channel, éventuellement référencée comme source d'un Ticket.
_À éviter_ : Channel, commentaire de Ticket

**Palette**:
Overlay clavier searchable de l'app qui propose navigation, Actions et résultats contextuels.
_À éviter_ : Command, Command palette, Spotlight, Menu

**Action**:
Entrée choisissable du catalogue UI de l'app. Ce n'est pas une Command du control plane.
_À éviter_ : Command, BoardCommand, commande

**BoardAction**:
Action dont la cible appartient au Tableau.
_À éviter_ : BoardCommand

**Contexte d'activation**:
Page courante qui détermine les verbes proposés par la Palette.
_À éviter_ : context, focus, mode, intelligence, sélection

**Récent**:
Action déjà déclenchée, proposée si elle reste applicable au contexte d'activation courant.
_À éviter_ : history, shortcut, historique

**Catalogue**:
Union des Actions de navigation, des verbes de la page courante et de ses résultats recherchables.
_À éviter_ : registry, command list
