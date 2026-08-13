# UX/UI du Tableau Kanban

## Statut et portée

Cette spécification traduit le modèle validé dans l'ADR-0008 en expérience desktop. Elle décrit le
Tableau, le Sheet Ticket, l'Inbox et leurs interactions avec le Channel. Elle ne redéfinit ni les
invariants du domaine ni les cycles de vie d'exécution.

La première version optimise le travail d'un humain qui supervise une flotte optionnelle d'agents.
Un projet peut aussi fonctionner sans agent. Aucun orchestrateur n'est natif : un profil comme
Marion appartient à la configuration de son utilisateur.

## Principes

1. **Attention avant activité** : l'Inbox montre d'abord ce qui nécessite une intervention, puis le
   Tableau donne la situation globale.
2. **Trello dans l'espace, Linear dans l'interaction** : colonnes et drag-and-drop restent
   intuitifs ; sélection, raccourcis et palette accélèrent le travail expert.
3. **Ticket léger, exécution explicite** : assigner un agent ne lance rien. Une exécution possède
   toujours son résultat attendu, son budget et sa politique d'outils.
4. **Optimisme par défaut** : toute commande réversible et applicable met l'interface à jour
   immédiatement, puis se réconcilie avec la projection serveur.
5. **Information progressive** : les cartes restent scannables ; le Sheet concentre le détail.
6. **Conversation et audit séparés** : le Workbench reste une conversation ; les faits système
   vivent dans une timeline distincte.
7. **Accessibilité équivalente** : toute opération de pointeur possède une voie clavier et un retour
   annoncé.

## Architecture de navigation

### Destinations principales

- `Inbox` : questions, approbations, échecs et blocages exigeant l'humain.
- `Tableau` : vue Kanban du projet.
- `Channel` : chat général du projet contenant ses Threads.

Le Tableau et le Channel sont complémentaires, mais ne sont pas deux vues des mêmes éléments. Un
Ticket possède un Workbench, c'est-à-dire un Thread ordinaire du Channel dédié au travail du Ticket.
Il peut aussi référencer un Thread source distinct et immuable.

### URL

Route du Tableau :

```text
/projects/:projectId/board
```

Le Sheet Ticket est un état partageable du Tableau :

```text
/projects/:projectId/board?ticket=:ticketId
```

La recherche et les filtres sont aussi encodés dans les search params :

```text
/projects/:projectId/board?ticket=:ticketId&q=:query&assignee=:id&priority=:value
```

TanStack Router doit valider les search params. Ouvrir un Ticket ajoute une entrée d'historique ;
Back ferme le Sheet, Forward le rouvre. Fermer le Sheet retire uniquement `ticket` et conserve les
filtres. Un lien direct charge le Tableau puis ouvre le Ticket demandé.

Le scroll et la carte active restent éphémères. Ils ne polluent pas l'URL.

## Tableau

### Structure

- Un header compact contient le titre `Tableau`, la recherche, les filtres actifs, `Cmd+K` et le
  menu global.
- Les colonnes ont une largeur stable de 288 à 320 px et occupent la hauteur disponible.
- Le Tableau défile horizontalement au trackpad, avec `Shift+molette` et au clavier.
- Les colonnes ne se replient pas et ne se compressent pas pour tenir à l'écran.
- Un nouveau projet reçoit `Backlog`, `En cours` et la colonne système `Done`.
- Une action `Ajouter une colonne` termine la rangée.

L'en-tête d'une colonne affiche son nom, sa couleur, son compteur et son menu. Sans filtre, le
compteur est simple. Avec un filtre actif, il devient `visible sur total`.

Le menu de colonne permet de renommer, colorer et supprimer. L'en-tête se déplace par drag-and-drop.
Supprimer une colonne non vide demande une destination conformément à l'invariant transactionnel.

### Cartes

Une carte affiche toujours :

- le titre ;
- le responsable, s'il existe ;
- la priorité ;
- l'échéance ;
- les étiquettes.

Elle ajoute seulement quand ils s'appliquent :

- un badge textuel `Bloqué`, `Question`, `Approbation` ou `Échec` ;
- l'identité du profil actif et un état synthétique (`En cours`, `Attend une réponse`,
  `Vérification`, `Échec`) ;
- la progression de checklist.

La couleur complète de la carte ne porte jamais un état. La priorité utilise une petite icône
colorée avec tooltip et texte accessible. L'échéance affiche une date locale compacte, puis des
états explicites `Bientôt` et `En retard`. Un Ticket terminé n'est jamais signalé en retard.

Les dépendances n'ajoutent aucune ligne entre les cartes. Un prérequis ouvert produit le badge
`Bloqué`; le détail vit dans le Sheet.

### Drag-and-drop

Le drag-and-drop est le geste principal de déplacement. Il commence après un seuil de mouvement afin
qu'un clic normal ouvre toujours le Ticket.

Pendant le drag :

- la carte conserve une représentation lisible ;
- un placeholder montre précisément sa future position ;
- les cibles possibles restent nettes pendant le scroll horizontal ;
- la colonne survolée fournit un retour visuel sans animation continue.

Au drop, la carte adopte immédiatement sa nouvelle position. Le serveur reste autoritaire. En cas de
rejet ou conflit, seuls les éléments concernés rejoignent la projection serveur et un message
explique le changement.

Déposer dans `Done` clôt immédiatement le Ticket. Des dépendances ouvertes provoquent un
avertissement non bloquant avant le drop final. Une exécution active exige une confirmation
bloquante et son interruption. Sortir de `Done` rouvre le Ticket.

### Création rapide

Chaque colonne termine sa liste par `Ajouter un ticket`. La création inline exige seulement un
titre. `c` déclenche le même flux dans la colonne active ou demande une colonne si rien n'est actif.
Après création optimiste, le Sheet peut être ouvert pour enrichir le Ticket.

Un premier Tableau vide n'utilise aucun faux Ticket. Il montre les CTA inline et un court rappel de
`c`, `Cmd+K` et du drag-and-drop, retiré après la première création.

### Recherche et filtres

Une barre compacte au-dessus du Tableau expose la recherche et les filtres actifs. `Cmd+K` permet
d'activer les mêmes commandes.

Les Tickets qui ne correspondent pas disparaissent. Chaque colonne garde un compteur
`visible sur total` et l'interface propose clairement `Effacer les filtres`. Les URLs suffisent pour
partager une vue ; les vues filtrées nommées sont hors v1.

### Sélection et clavier

Le Tableau maintient une seule carte active, avec focus visible :

| Action | Raccourci |
| --- | --- |
| Naviguer dans une colonne | `↑` / `↓` |
| Naviguer entre colonnes | `←` / `→` |
| Ouvrir le Ticket | `Enter` |
| Créer un Ticket | `c` |
| Ouvrir « Déplacer vers… » | `m` |
| Réordonner | `Cmd/Ctrl+↑` / `Cmd/Ctrl+↓` |
| Changer de colonne | `Cmd/Ctrl+←` / `Cmd/Ctrl+→` |
| Rechercher | `/` |
| Ouvrir la palette | `Cmd/Ctrl+K` |
| Annuler le dernier déplacement | `Cmd/Ctrl+Z` |

TanStack Hotkeys centralise les bindings, leurs scopes et leur présentation. La palette couvre en v1
les commandes et Tickets du projet courant, puis pourra accueillir une navigation globale.

Le Sheet prend le contexte clavier lorsqu'il est ouvert. Seul `Cmd/Ctrl+K` reste global. `Escape`
ferme le Sheet et restitue le focus à la carte d'origine.

La sélection multiple est hors v1.

## Sheet Ticket

### Comportement

Le composant shadcn `Sheet` s'ouvre à droite et reste contrôlé par `ticket` dans l'URL. Sa largeur
desktop dépasse le défaut `sm:max-w-sm` afin d'accueillir le détail sans masquer inutilement le
Tableau. Radix conserve le focus trap, `Escape`, le titre accessible et la restitution du focus.

Le contenu suit cet ordre :

1. détails et métadonnées ;
2. exécutions ;
3. Workbench ;
4. activité système.

Les sections secondaires sont repliables, mais aucune information exigeant l'humain ne doit être
cachée par défaut.

### Édition

- Titre et champs courts : édition inline, sauvegarde optimiste au blur ou avec `Enter`.
- Description : GitHub Flavored Markdown, rendu par défaut, édition explicite et sauvegarde avec
  `Cmd/Ctrl+Enter`.
- Responsable, participants, labels et priorité : sauvegarde immédiate à la sélection.
- Checklist : interactions optimistes ; un item peut être converti en Ticket via une action dédiée.

Le sélecteur de responsable regroupe `Humains` et `Agents`, avec recherche. Le responsable est
unique. Le sélecteur de participants réutilise ces groupes en choix multiple. Responsable et
participants sont abonnés par défaut avec opt-out.

Les profils affichent avatar, nom et rôle, par exemple `Marion · Orchestratrice`. Le rôle est une
configuration visuelle, jamais une permission implicite.

### Dépendances

Le Sheet distingue `Bloqué par` et `Bloque`. Une recherche de Tickets permet d'ajouter une relation.
La création d'un cycle est rejetée avec une explication locale.

`Convertir en ticket` sur un item de checklist crée un Ticket lié, marque l'item comme converti et
ouvre le nouveau Ticket.

### Exécutions

Assigner un profil d'agent ne lance pas d'exécution. Le CTA `Lancer une exécution` ouvre un Dialog
au-dessus du Sheet avec :

- résultat attendu obligatoire ;
- profil d'agent ;
- budget hérité ;
- politique d'outils héritée ;
- section `Paramètres avancés` pour inspecter ou modifier les valeurs héritées.

Le CTA final porte le même libellé explicite. Les exécutions actives ou passées restent consultables
dans le Sheet avec leurs Attempts, rapports et artefacts en détail progressif.

### Workbench

Le Workbench affiche la conversation complète de son Thread et permet de répondre sans quitter le
Ticket. `Ouvrir dans le Channel` affiche ce même Thread dans le contexte du chat général.

L'identité conversationnelle d'un agent est son profil (`avatar + nom + rôle`), jamais son
AgentRun. Le Thread source éventuel est présenté séparément comme origine immuable.

### Activité

La timeline système est séparée et repliée par défaut. Elle contient déplacements, assignations,
changements de priorité, exécutions, approbations, archivage et restauration. Elle ne se mélange
jamais aux messages du Workbench.

### Archivage et suppression

Archiver retire le Ticket du Tableau actif et propose brièvement `Annuler`. Les archives sont une
vue compacte et recherchable accessible depuis le menu global du Tableau. Elles permettent
restauration et suppression définitive.

La suppression définitive n'est disponible que depuis les archives et exige une confirmation
renforcée expliquant son effet sur les relations conservées.

## Channel et création liée

Le menu d'un message ou d'un Thread propose `Créer un ticket`; la même commande est accessible par
la palette. Le flux :

1. préremplit titre et description ;
2. conserve le Thread d'origine comme source immuable ;
3. crée un Workbench distinct pour le nouveau Ticket ;
4. ouvre le Ticket dans le Tableau.

Les commandes conversationnelles et slash commands sont hors périmètre.

## Inbox

L'Inbox agrège seulement les éléments demandant une action :

- question explicite ;
- approbation ;
- échec nécessitant une décision ;
- blocage nécessitant l'humain ;
- mention ou notification issue d'un abonnement.

L'étiquette `need-human` reste un signal manuel, visuel et filtrable ; elle n'alimente pas l'Inbox à
elle seule.

Cliquer une attention navigue vers le Tableau avec le Sheet ouvert et place le focus sur la section
concernée.

## Optimisme, temps réel et erreurs

### Règle générale

Pour toute action applicable :

1. mettre à jour l'état local immédiatement ;
2. soumettre une commande idempotente ;
3. recevoir la projection serveur autoritaire ;
4. réconcilier seulement les entités concernées.

Les succès ordinaires restent silencieux. Une action anormalement lente affiche
`Synchronisation…` près de l'élément. Un échec reste visible jusqu'à compréhension ou résolution.

Les changements distants apparaissent immédiatement avec une transition brève et l'identité de leur
auteur. Ils ne génèrent pas de toast systématique.

En reconnexion ou mode dégradé, un bandeau discret explique l'état. Les mutations optimistes non
confirmées restent marquées en attente.

### Annulation

`Cmd/Ctrl+Z` annule le dernier déplacement de Ticket. L'archivage propose une action temporaire
`Annuler`. Les autres commandes métier utilisent leurs commandes inverses explicites ; il n'existe
pas d'undo générique.

## Accessibilité

- Toute carte, colonne, cible de drop et commande possède un nom accessible.
- Le drag-and-drop dispose des mêmes opérations au clavier.
- Les annonces décrivent cible et résultat, par exemple
  `Ticket déplacé vers En cours, position 2`.
- Un rejet serveur produit une annonce équivalente et restitue un focus cohérent.
- Couleur, animation et position ne portent jamais seules une information.
- Les badges utilisent une icône et un libellé explicite.
- Le focus reste visible et revient à la carte d'origine après fermeture du Sheet.
- Les raccourcis sont découvrables dans les menus, tooltips et la palette.

## Hors périmètre de la première version

- expérience mobile complète ;
- sélection multiple et actions groupées ;
- colonnes repliables ou redimensionnables ;
- vue graphe des dépendances ;
- vues filtrées sauvegardées ;
- raccourcis personnalisables ;
- slash commands dans le Channel ;
- pourcentage de progression agent inventé ;
- agent ou orchestrateur intégré à Noyau.

## Critères d'acceptation UX

1. Un utilisateur peut créer, ouvrir, déplacer, réordonner, clôturer et rouvrir un Ticket au
   pointeur comme au clavier.
2. L'URL partage Tableau, Ticket ouvert, recherche et filtres ; Back ferme le Sheet.
3. Un drop accepté paraît immédiat ; un rejet restaure la projection serveur et explique pourquoi.
4. Une attention Inbox ouvre directement la bonne section du Ticket.
5. Le Workbench montre le même Thread que le Channel sans fusionner conversation et activité.
6. Assigner un agent ne lance rien ; le lancement exige un résultat attendu dans un Dialog.
7. Un projet sans agent ne présente aucune dépendance UX à un orchestrateur.
8. Les opérations DnD sont annoncées et entièrement réalisables au clavier.
