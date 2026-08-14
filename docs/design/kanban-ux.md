# UX/UI du Tableau

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
4. **Optimisme par défaut** : toute commande réversible et applicable rejoint une file ordonnée
   corrélée par `commandId`. L'état affiché est toujours recalculé depuis la projection serveur
   confirmée, sur laquelle l'interface rejoue les commandes encore en attente.
5. **Information progressive** : les cartes restent scannables ; le Sheet concentre le détail.
6. **Conversation et audit séparés** : le Workbench reste une conversation ; les faits système
   vivent dans une timeline distincte.
7. **Accessibilité équivalente** : toute opération de pointeur possède une voie clavier et un retour
   annoncé.

## Architecture de navigation

### Destinations principales

- `Inbox` : questions, approbations, échecs et blocages exigeant l'humain.
- `Tableau` : vue en colonnes du projet.
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

TanStack Router doit valider les search params. Ouvrir un Ticket depuis le Tableau sans Sheet fait
un `push` depuis l'URL courante. L'application n'utilise Back pour fermer le Sheet que si l'entrée
précédente est le même Tableau, avec les mêmes filtres et sans `ticket` ; Forward peut alors rouvrir
le Sheet. Dans tous les autres cas, notamment un lien direct ou une arrivée depuis l'Inbox, fermer
le Sheet fait un `replace` qui retire uniquement `ticket` et conserve les filtres. Un `replace` ne
crée aucune entrée que Forward pourrait rouvrir, et le bouton Back natif reste fidèle à l'historique
réel au lieu d'être détourné pour fermer un deep link.

Le scroll, la carte active et l'origine d'ouverture restent éphémères. Ils ne polluent pas l'URL. À
la fermeture, le focus revient :

1. à la carte d'origine si elle est encore présente dans la vue ;
2. sinon à la première carte visible de la colonne du Ticket ;
3. sinon au titre `Tableau`.

Cette règle couvre une ouverture depuis l'Inbox ou un deep link, ainsi qu'un Ticket supprimé,
archivé ou masqué par la recherche ou les filtres.

## Tableau

### Structure

- Un header compact contient le titre `Tableau`, la recherche, les filtres actifs, `Cmd/Ctrl+K` et
  le menu global.
- Les colonnes ont une largeur stable de 288 à 320 px et occupent la hauteur disponible.
- Le Tableau défile horizontalement au trackpad, avec `Shift+molette` et au clavier.
- Les colonnes ne se replient pas et ne se compressent pas pour tenir à l'écran.
- Un nouveau projet reçoit `Backlog`, `En cours` et la colonne système `Done`.
- Une action `Ajouter une colonne` termine la rangée.

L'en-tête d'une colonne affiche son nom, sa couleur, son compteur et son menu. Sans filtre, le
compteur est simple. Avec un filtre actif, il devient `visible sur total`.

Le menu d'une colonne ordinaire permet de renommer, colorer et supprimer. Dans le menu de `Done`,
l'action `Supprimer` est absente, et non grisée ; renommer, colorer et déplacer son en-tête restent
permis. Supprimer une colonne non vide demande une destination non terminale. Le sélecteur n'inclut
jamais `Done`, conformément à la couche domaine qui rejette aussi cette destination.

### Cartes

Une carte affiche toujours :

- le titre ;
- le responsable, s'il existe ;
- la priorité ;
- l'échéance ;
- les étiquettes.

Elle ajoute seulement quand ils s'appliquent :

- un badge textuel `Bloqué`, `Question`, `Approbation` ou `Échec` ;
- l'agrégat des exécutions actives : leur nombre, les profils concernés et le statut qui demande le
  plus d'attention ;
- la progression de checklist.

La priorité d'attention des états existants est déterministe :
`Échec` > `Attend une réponse` > `Vérification` > `En cours`. Cet ordre constitue seulement un
agrégat d'affichage ; il ne crée aucun nouvel état métier. Avec plusieurs exécutions actives, la
carte affiche par exemple `3 exécutions · Attend une réponse`, même si une autre est `En cours`. Le
compteur reste explicite lorsqu'une seule exécution est active.

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
- sans filtre, un placeholder montre précisément sa future position ;
- les cibles possibles restent nettes pendant le scroll horizontal ;
- la colonne survolée fournit un retour visuel sans animation continue.

Au drop, la carte adopte immédiatement sa nouvelle position par replay de la commande en attente.
Le serveur reste autoritaire. Une projection ou un rejet recalcule l'affichage selon la règle
générale de réconciliation, sans effacer les commandes plus récentes, et un message explique tout
changement visible.

Déposer dans `Done` clôt immédiatement le Ticket lorsqu'aucune exécution n'est active. Des
dépendances ouvertes provoquent un avertissement non bloquant avant le drop final. Si des exécutions
sont actives, une confirmation bloquante nomme leur nombre avant d'appliquer la clôture, puis
l'opération demande l'interruption de chacune d'elles. Sortir de `Done` rouvre le Ticket.

Une vue passe en mode filtré dès qu'un filtre est actif ou qu'une recherche masque au moins un
Ticket. Dans ce mode :

- le réordonnancement intra-colonne est désactivé, par drag comme au clavier ;
- le déplacement inter-colonnes reste permis et insère le Ticket en fin de la colonne cible
  complète, pas à une position relative aux seules cartes visibles ;
- la cible montre la colonne, sans placeholder de position précise.

Si le déplacement fait sortir le Ticket de la vue, l'annonce devient par exemple
`Ticket déplacé vers En cours, en fin de colonne ; il n'est plus visible dans la vue filtrée`.
Le focus passe à la carte visible suivante dans la colonne source, à la précédente s'il n'y en a
pas, puis à l'en-tête de la colonne cible si la source ne contient plus de carte visible.

### Création rapide

Chaque colonne non terminale termine sa liste par `Ajouter un ticket` ; `Done` n'affiche jamais ce
CTA. La création inline exige seulement un titre. `c` déclenche le même flux dans une colonne
non terminale active. Si `Done` est active ou si aucune colonne ne l'est, le raccourci demande une
colonne non terminale. Après création optimiste, le Sheet peut être ouvert pour enrichir le Ticket.
La palette exclut `Done` des destinations de création. Ce masquage UI ne remplace pas l'invariant
métier : le serveur refuse toute création qui cible `Done`.

Un premier Tableau vide n'utilise aucun faux Ticket. Il montre les CTA inline des colonnes
non terminales et un court rappel de `c`, `Cmd/Ctrl+K` et du drag-and-drop, retiré après la première
création.

### Recherche et filtres

Une barre compacte au-dessus du Tableau expose la recherche et les filtres actifs. `Cmd/Ctrl+K`
permet d'activer les mêmes commandes.

Les Tickets qui ne correspondent pas disparaissent. Chaque colonne garde un compteur
`visible sur total` et l'interface propose clairement `Effacer les filtres`. Les URLs suffisent pour
partager une vue ; les vues filtrées nommées sont hors v1. Dès que la vue est en mode filtré, l'ordre
des seules cartes visibles est ambigu : le réordonnancement intra-colonne est donc indisponible,
tandis qu'un déplacement inter-colonnes insère en fin de la colonne cible complète.

### Sélection et clavier

Le Tableau maintient une seule carte active, avec focus visible :

| Action | Raccourci |
| --- | --- |
| Naviguer dans une colonne | `↑` / `↓` |
| Naviguer entre colonnes | `←` / `→` |
| Ouvrir le Ticket | `Enter` |
| Créer un Ticket | `c` |
| Ouvrir « Déplacer vers… » | `m` |
| Réordonner | `Alt+Shift+↑` / `Alt+Shift+↓` |
| Changer de colonne | `Alt+Shift+←` / `Alt+Shift+→` |
| Rechercher | `/` |
| Ouvrir la palette | `Cmd/Ctrl+K` |
| Annuler le dernier déplacement en attente | `Cmd/Ctrl+Z` |

TanStack Hotkeys centralise les bindings, leurs scopes et leur présentation. La palette couvre en v1
les commandes et Tickets du projet courant, puis pourra accueillir une navigation globale. Ses
commandes de création ne proposent que les colonnes non terminales.

Les raccourcis du Tableau ne sont actifs que lorsque le focus est dans sa zone, hors `input`,
`textarea`, contenu `contenteditable`, contrôle interactif et overlay. Le Sheet et les Dialogs
prennent leur propre contexte clavier et neutralisent tous les raccourcis du Tableau. `Escape` ferme
le Sheet selon la règle d'historique et restitue le focus selon la chaîne de fallback définie pour
la navigation. Le réordonnancement par `Alt+Shift+↑` / `Alt+Shift+↓` est désactivé en mode filtré ;
le changement de colonne reste permis et insère alors en fin de colonne.

La sélection multiple est hors v1.

## Sheet Ticket

### Comportement

Le composant shadcn `Sheet` s'ouvre à droite et reste contrôlé par `ticket` dans l'URL. Sa largeur
desktop dépasse le défaut `sm:max-w-sm` afin d'accueillir le détail sans masquer inutilement le
Tableau. Base UI conserve le focus trap, `Escape` et le titre accessible. La restitution du focus est
pilotée par le Tableau pour appliquer son fallback, sans tenter de cibler un élément supprimé,
archivé ou filtré.

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

Le CTA final porte le même libellé explicite. Toutes les exécutions actives ou passées restent
consultables dans le Sheet avec leurs Attempts, rapports et artefacts en détail progressif. Quand
plusieurs exécutions sont actives, le Sheet les liste séparément et reprend en tête le compteur et
le statut agrégé de la carte selon la priorité d'attention déterministe.

### Workbench

Le Workbench affiche la conversation complète de son Thread et permet de répondre sans quitter le
Ticket. `Ouvrir dans le Channel` affiche ce même Thread dans le contexte du chat général.

L'identité conversationnelle d'un agent est son profil (`avatar + nom + rôle`), jamais son
AgentRun. Le Thread source éventuel est présenté séparément comme origine immuable.

### Activité

La timeline système est séparée et repliée par défaut. Elle contient déplacements, assignations,
changements de priorité, exécutions, approbations, archivage et restauration. Elle détaille aussi le
résultat d'une interruption groupée : exécutions interrompues, exécutions encore actives et motif de
l'échec. En cas de résultat partiel, cette entrée reste visible sans déplier manuellement la section.
La timeline ne se mélange jamais aux messages du Workbench.

### Archivage et suppression

Archiver retire le Ticket du Tableau actif et propose brièvement `Annuler`. Comme la clôture,
l'archivage avec des exécutions actives exige d'abord une confirmation qui en indique le nombre.
Après confirmation, il retire le Ticket puis tente de toutes les interrompre. La clôture ou
l'archivage reste effectif si certaines interruptions échouent : la timeline distingue les
exécutions interrompues de celles encore actives, l'Inbox signale l'échec, et les deux surfaces
proposent `Réessayer d'interrompre` pour les seules exécutions restantes. Les archives sont une vue
compacte et recherchable accessible depuis le menu global du Tableau. Elles permettent restauration
et suppression définitive.

La suppression définitive n'est disponible que depuis les archives et exige une confirmation
renforcée expliquant son effet sur les relations conservées.

## Channel et création liée

Le menu d'un message ou d'un Thread propose `Créer un ticket`; la même commande est accessible par
la palette. Le flux :

1. préremplit titre et description ;
2. conserve le Thread d'origine comme source immuable ;
3. demande une colonne non terminale, sans proposer `Done` ;
4. crée un Workbench distinct pour le nouveau Ticket ;
5. ouvre le Ticket dans le Tableau.

Le serveur applique la même interdiction de création dans `Done` que pour les flux du Tableau.

Les commandes conversationnelles et slash commands sont hors périmètre.

## Inbox

L'Inbox agrège seulement les éléments demandant une action :

- question explicite ;
- approbation ;
- échec nécessitant une décision ;
- interruption partielle après clôture ou archivage, avec la liste des exécutions encore actives et
  l'action `Réessayer d'interrompre` ;
- blocage nécessitant l'humain ;
- mention ou notification issue d'un abonnement.

L'étiquette `need-human` reste un signal manuel, visuel et filtrable ; elle n'alimente pas l'Inbox à
elle seule.

Cliquer une attention navigue vers le Tableau avec le Sheet ouvert et place le focus sur la section
concernée. Cette arrivée ne prétend pas avoir une entrée précédente du même Tableau : fermer le
Sheet utilise `replace`, puis applique le fallback de focus.

## Optimisme, temps réel et erreurs

### Règle générale

Le client maintient trois notions distinctes :

- l'état confirmé, issu de la dernière projection serveur autoritaire ;
- une file ordonnée de commandes optimistes en attente, chacune corrélée par son `commandId` ;
- l'état affiché, obtenu uniquement en rejouant cette file sur l'état confirmé.

Pour toute action applicable :

1. ajouter la commande idempotente à la fin de la file pending et la soumettre ;
2. rejouer dans l'ordre toutes les commandes pending sur l'état confirmé, puis afficher le résultat ;
3. à chaque projection serveur, y compris après reconnexion, remplacer l'état confirmé ;
4. retirer seulement les commandes explicitement acquittées ou rejetées d'après leur `commandId` ;
5. rejouer dans l'ordre les commandes restantes sur la nouvelle base et recalculer l'affichage.

Ainsi, après deux déplacements pending `M1` puis `M2`, une projection qui confirme `M1` retire
uniquement `M1` et rejoue `M2` : la carte ne régresse jamais visuellement vers la destination de
`M1`. Si `M1` est rejetée, le client retire uniquement `M1`, adopte la nouvelle projection confirmée
et réapplique `M2` sur cette base. Une projection ne remplace donc jamais directement l'état affiché
et ne vide jamais toute la file par simple correspondance d'entité.

Les succès ordinaires restent silencieux. Une action anormalement lente affiche
`Synchronisation…` près de l'élément. Un échec reste visible jusqu'à compréhension ou résolution.

Les changements distants rejoignent immédiatement l'état confirmé avec une transition brève et
l'identité de leur auteur. L'état affiché les montre après replay ; une commande pending plus récente
peut donc continuer à prévaloir localement. Ils ne génèrent pas de toast systématique.

En reconnexion ou mode dégradé, un bandeau discret explique l'état. Les mutations optimistes non
confirmées restent marquées en attente. Le snapshot de reprise devient la nouvelle base confirmée ;
seules les commandes dont le `commandId` est acquitté ou rejeté en sont retirées avant le replay.

### Annulation

`Cmd/Ctrl+Z` est disponible seulement dans la zone du Tableau, hors contrôle éditable ou interactif,
et cible le dernier déplacement encore présent dans la file pending. Il ajoute à la suite une
commande de déplacement inverse avec son propre `commandId`, afin que la réconciliation conserve
l'ordre des faits déjà soumis. Il ne rembobine ni la projection confirmée ni un changement distant.
Sans déplacement pending, il ne fait rien et annonce `Aucun déplacement en attente à annuler`.
L'archivage propose une action temporaire `Annuler`. Les autres commandes métier utilisent leurs
commandes inverses explicites ; il n'existe pas d'undo générique.

## Accessibilité

- Toute carte, colonne, cible de drop et commande possède un nom accessible.
- Le drag-and-drop dispose des mêmes opérations au clavier, sous les mêmes restrictions de filtre.
- Sans filtre, les annonces décrivent cible et position, par exemple
  `Ticket déplacé vers En cours, position 2`.
- En mode filtré, elles omettent toute position ambiguë et annoncent
  `Ticket déplacé vers En cours, en fin de colonne`.
- Si le Ticket sort de la vue filtrée, l'annonce le précise et le focus suit la règle déterministe
  carte suivante, carte précédente, puis en-tête de la colonne cible.
- Un rejet serveur produit une annonce équivalente et restitue un focus cohérent.
- Couleur, animation et position ne portent jamais seules une information.
- Les badges utilisent une icône et un libellé explicite.
- Le focus reste visible et suit le fallback carte d'origine, première carte visible de sa colonne,
  puis titre `Tableau` après fermeture du Sheet.
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

1. Un utilisateur peut créer, ouvrir, déplacer, clôturer et rouvrir un Ticket au pointeur comme au
   clavier ; la création ne propose jamais `Done` et le serveur la refuse si elle le cible.
2. `Done` ne propose pas `Supprimer`, et ni l'UI ni le domaine n'acceptent `Done` comme destination
   lors de la suppression d'une autre colonne.
3. En vue complète, un utilisateur peut réordonner un Ticket au pointeur comme au clavier. En mode
   filtré, ce réordonnancement est désactivé, mais un déplacement inter-colonnes reste possible en
   fin de colonne et reçoit une annonce sans position ambiguë.
4. L'URL partage Tableau, Ticket ouvert, recherche et filtres. Back ne ferme le Sheet que depuis un
   vrai `push` du même Tableau ; les autres fermetures utilisent `replace`, et le focus suit le
   fallback documenté.
5. Confirmer ou rejeter `M1` alors que `M2` reste pending conserve l'effet affiché de `M2` après
   replay sur la nouvelle projection confirmée, y compris après reconnexion.
6. Une clôture ou un archivage confirme puis interrompt toutes les exécutions actives. Un résultat
   partiel distingue les exécutions interrompues et encore actives dans la timeline et l'Inbox, avec
   une action pour réessayer.
7. Une attention Inbox ouvre directement la bonne section du Ticket.
8. Le Workbench montre le même Thread que le Channel sans fusionner conversation et activité.
9. Assigner un agent ne lance rien ; le lancement exige un résultat attendu dans un Dialog.
10. Un projet sans agent ne présente aucune dépendance UX à un orchestrateur.
11. Les opérations DnD sont annoncées et réalisables au clavier sous les mêmes règles de filtre, et
    les raccourcis du Tableau ne s'activent jamais depuis un champ, un contrôle ou un overlay.
