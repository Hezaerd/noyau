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

**Palette**:
Overlay clavier searchable de l'app. Elle propose navigation, verbes de la page et Récents, puis les Tickets du Tableau lorsqu'une recherche est saisie.
_À éviter_ : Command, Command palette, Spotlight, Menu

**Action**:
Entrée choisissable du catalogue UI de l'app. Ce n'est pas une Command.
_À éviter_ : Command, BoardCommand, commande

**BoardAction**:
Action dont la cible appartient au Tableau.
_À éviter_ : BoardCommand

**Contexte d'activation**:
Page courante, qui détermine les verbes proposés par la Palette.
_À éviter_ : context, focus, mode, intelligence, sélection

**Récent**:
Action déjà déclenchée, proposée si elle reste applicable dans le contexte d'activation courant.
_À éviter_ : history, shortcut, historique

**Catalogue**:
Union des Actions du socle de navigation, des verbes de la page courante et des résultats recherchables propres à cette page.
_À éviter_ : registry, command list

Le Tableau charge un `BoardSnapshot`, soumet des `TicketCommandRequest` et reprend le flux projet
sur Effect RPC WebSocket. L'identité courante appartient à la frontière serveur ; l'UI ne fournit
ni acteur sandbox ni métadonnée d'enrichissement de commande.
