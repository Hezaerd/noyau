# UX/UI du Tableau

## Statut et portée

Cette spécification décrit le Tableau et le Dialog Ticket de la v0.1
([ADR-0011](../adr/0011-noyau-local-first-v0.1.md)). Le serveur reste autoritaire pour les
invariants, l'ordre, le DAG de dépendances et l'activité système.

Le Tableau reste Trello-like. L'état agent vit sur le Thread / la Session, pas sur la carte.
Le responsable reste dans le modèle durable mais est volontairement absent de l'interface.

## Principes

1. **Ticket léger** : le titre suffit à créer ; priorité, échéance et description sont ajoutées au
   besoin.
2. **Information progressive** : la carte reste scannable ; le Dialog concentre les détails.
3. **Dépendances explicites** : les liens entre Tickets remplacent checklists et todolists.
4. **Serveur autoritaire** : l'optimisme masque la latence sans devenir une seconde source de
   vérité.
5. **Conversation et audit séparés** : le Thread porte le transcript provider ; l'activité du
   Ticket expose les faits système autoritatifs.
6. **Accessibilité équivalente** : toute opération de pointeur possède une voie clavier et un
   retour annoncé.

## Navigation

### Destinations

- `Tableau` : vue en colonnes des Tickets du projet ; destination au restart.
- Sidebar : Threads titrés du Project.

Un Ticket et un Thread se lient par `TicketThread` (plusieurs-à-plusieurs, optionnel). Aucun
Thread n'est créé automatiquement. Aucun Workbench, Channel ou Message.

### URL

Le Tableau utilise :

```text
/projects/:projectId/board
```

Le Dialog Ticket, la recherche et le filtre de priorité sont partageables :

```text
/projects/:projectId/board?ticket=:ticketId&q=:query&priority=:value
```

TanStack Router valide les search params. Le responsable n'est pas un filtre v0.1.

Ouvrir une carte ajoute `ticket` à l'URL. Fermer le Dialog retire uniquement ce paramètre et
conserve recherche et priorité. Le scroll, la carte active et l'origine d'ouverture restent
éphémères.

À la fermeture, le focus revient :

1. à la carte d'origine si elle reste visible ;
2. à une carte visible de sa colonne ;
3. au titre `Tableau`.

## Tableau

### Structure

- Un header compact contient le titre, la recherche, le filtre de priorité et les actions du
  Tableau.
- Les colonnes ont une largeur stable et défilent horizontalement.
- Un nouveau projet reçoit `Backlog`, `En cours` et la colonne système `Done`.
- Les colonnes ordinaires peuvent être créées, renommées, colorées et supprimées.
- `Done` peut être renommée et colorée, mais pas supprimée.
- Supprimer une colonne référencée demande une destination non terminale ; `Done` n'est jamais
  proposée.
- Le compteur d'une colonne indique le total, ou `visible/total` avec un filtre actif.

### Cartes

Une carte affiche :

- la priorité par une icône discrète ;
- le titre ;
- l'échéance lorsqu'elle existe ;
- le badge `Bloqué` lorsqu'au moins un prérequis n'est pas terminé.

L'échéance utilise une date locale compacte. Une carte non terminée ajoute `Bientôt` à trois jours
ou moins et `En retard` après la date. Une carte dans `Done` n'est jamais marquée en retard.

La carte n'affiche pas :

- le responsable ;
- de checklist ou de progression ;
- d'exécution, de run ou d'état agent ;
- de Workbench ;
- de pourcentage de progression inventé.

Les dépendances ne dessinent aucune ligne entre les cartes. Leur détail et leur édition vivent dans
le Dialog.

### Création rapide

Chaque colonne non terminale termine sa liste par `Ajouter un ticket`. La création inline exige un
titre non vide. `Done` ne propose pas ce CTA et le serveur refuse aussi toute création qui la cible.

Après création, le Ticket peut être ouvert immédiatement pour ajouter sa description, sa priorité,
son échéance et ses dépendances.

### Déplacement et ordre

Le drag-and-drop est le geste principal. Un clic normal ouvre le Ticket ; le drag commence après un
seuil de mouvement.

Au drop, le client affiche immédiatement la position demandée puis soumet une commande par ancres.
Le serveur calcule le rang canonique. Après acceptation ou rejet, le client recharge le snapshot
autoritatif.

Déposer un Ticket sans prérequis ouvert dans `Done` le termine. Si des dépendances restent ouvertes,
le serveur rejette le déplacement sans acquittement explicite et le snapshot remet la carte à sa
place autoritative. La surface de confirmation permettant de forcer cette clôture n'appartient pas
à la première UI. Sortir un Ticket de `Done` le rouvre.

Une vue est filtrée lorsqu'une recherche ou un filtre de priorité masque des Tickets. Dans ce mode :

- le réordonnancement intra-colonne est désactivé ;
- le déplacement inter-colonnes reste possible et insère en fin de la colonne complète ;
- aucune position relative aux seules cartes visibles n'est annoncée.

### Recherche et filtre

La recherche porte sur le titre et la description. Le filtre porte sur la priorité. Les Tickets non
correspondants disparaissent sans modifier l'ordre durable.

L'interface expose `Effacer les filtres`. Les vues filtrées nommées et les filtres par responsable
sont hors v0.1.

### Clavier

| Action | Raccourci |
| --- | --- |
| Naviguer dans une colonne | `↑` / `↓` |
| Naviguer entre colonnes | `←` / `→` |
| Ouvrir le Ticket | `Enter` |
| Créer un Ticket | `c` |
| Réordonner | `Alt+Shift+↑` / `Alt+Shift+↓` |
| Changer de colonne | `Alt+Shift+←` / `Alt+Shift+→` |
| Rechercher | `/` |
| Ouvrir la Palette | `Cmd/Ctrl+K` |

Les raccourcis du Tableau sont inactifs depuis un champ, un contrôle interactif ou un overlay. Le
Dialog possède son propre contexte clavier. La sélection multiple est hors v0.1.

## Dialog Ticket

### Structure

Le Dialog est contrôlé par le paramètre `ticket` de l'URL. Son contenu suit strictement cet ordre :

1. **Détails**
2. **Dépendances**
3. **Threads liés**
4. **Activité système**

Aucune section Responsable, Checklist, Exécution ou Workbench n'existe en v0.1.

### Détails

Le titre est toujours visible, requis et éditable inline. Une valeur vide est refusée avec le
message `Le titre est requis`.

La section Détails contient :

- **Priorité** : `Aucune`, `Basse`, `Normale`, `Haute`, `Urgente` ;
- **Échéance** : date optionnelle, sélectionnable et effaçable ;
- **Description** : texte optionnel édité explicitement puis rendu en GitHub Flavored Markdown.

Le rendu GFMD accepte notamment titres, listes, liens, tableaux, citations et blocs de code. Le HTML
brut n'est pas interprété. `Cmd/Ctrl+Enter` enregistre la description.

La priorité et l'échéance sont enregistrées à la sélection. Le titre est enregistré au blur ou avec
`Enter`.

### Dépendances

La section distingue :

- `Bloqué par` : prérequis du Ticket courant ;
- `Bloque` : Tickets qui dépendent du Ticket courant.

Chaque côté permet d'ajouter et retirer une relation. Les sélecteurs montrent les Tickets du projet
et désactivent les choix invalides avec une raison :

- `Ticket courant` pour une auto-dépendance ;
- `Déjà lié` pour un doublon ;
- `Créerait un cycle` pour une relation qui violerait le DAG.

Le client prévient les erreurs évidentes, mais le domaine valide à nouveau l'absence
d'auto-dépendance, de doublon et de cycle. Toute modification réussie rejoint l'activité système.

### Activité système

L'activité est chargée depuis la lecture serveur bornée du Ticket et ordonnée du plus récent au plus
ancien. Chaque entrée affiche l'acteur, le fait lisible et l'horodatage.

Elle couvre notamment :

- création et modification des détails ;
- déplacement, terminaison et réouverture ;
- archivage et restauration ;
- changement durable de responsable, même si le champ est masqué de l'UI ;
- ajout ou retrait d'une dépendance ;

L'activité est autoritative : elle provient des événements persistés. Elle reste distincte du
transcript d'un Thread. Un état de chargement, une erreur explicite et un état vide sont prévus.

## Threads liés

La section liste les `TicketThread` du Ticket et permet d'ajouter ou retirer un lien vers un
Thread du même Project. Un flux inverse depuis un Thread peut créer un Ticket en préremplissant
titre et description, puis ouvrir le Tableau. Aucun Thread n'est créé pour autant. Les faits
système restent dans l'activité du Ticket.

## Optimisme, temps réel et erreurs

Le client applique immédiatement les éditions et déplacements simples, puis soumet la commande avec
son `commandId`. Les créations et relations attendent le snapshot suivant. Une acceptation ou un
rejet déclenche un rechargement du `BoardSnapshot` ; le snapshot redevient alors l'état affiché
autoritatif. Un événement du flux projet déclenche aussi le rechargement du Tableau et, si le Dialog
est ouvert, de son activité.

Une reconnexion charge un snapshot cohérent puis reprend le flux depuis son curseur. Le WebSocket
n'est jamais une source de vérité.

La file durable hors ligne, le replay de plusieurs commandes locales concurrentes et l'undo
générique sont hors de cette première UI. Un rejet affiche son motif métier, recharge le snapshot
et restitue un focus cohérent.

## Accessibilité

- Toute carte, colonne, cible de drop et commande possède un nom accessible.
- Le drag-and-drop dispose d'opérations clavier équivalentes.
- Sans filtre, les annonces décrivent la colonne et la position.
- En mode filtré, elles annoncent la fin de colonne sans position ambiguë.
- Couleur, icône, animation et position ne portent jamais seules une information.
- Le badge `Bloqué` possède un libellé explicite.
- Le focus reste visible et suit le fallback documenté après fermeture du Dialog.
- Les raccourcis sont découvrables dans les menus et la Palette.

## Hors périmètre v0.1

- responsable visible ou éditable ;
- checklist, todolist et conversion d'un item ;
- Workbench, Channel, Message ou Thread dédié automatique ;
- `Execution`, `Attempt`, Hermes ;
- état agent sur la carte Ticket (il vit sur le Thread) ;
- sélection multiple et actions groupées ;
- vue graphe des dépendances ;
- vues filtrées sauvegardées ;
- filtres par responsable ou label ;
- réordonnancement des colonnes ;
- file hors ligne et replay de commandes concurrentes ;
- undo générique ;
- expérience mobile complète ;
- slash commands dans un Thread ;
- surfaces d'archives et suppression définitive.

Les commandes durables d'archivage et de restauration peuvent exister sans imposer leur surface à la
première UI.

## Critères d'acceptation UX

1. Un Ticket peut être créé avec son seul titre dans toute colonne non terminale ; ni l'UI ni le
   domaine n'acceptent une création dans `Done`.
2. Une carte affiche le titre, la priorité, l'échéance éventuelle et `Bloqué` si un prérequis est
   ouvert, sans responsable, checklist ni état agent.
3. Le Dialog présente Détails, Dépendances, Threads liés, puis Activité système.
4. Le titre vide est refusé ; la description est éditable et rendue en GFMD sans HTML brut.
5. Priorité et échéance peuvent être définies puis effacées sans perdre les autres détails.
6. `Bloqué par` et `Bloque` permettent d'ajouter et retirer des relations ; auto-dépendances,
   doublons et cycles sont empêchés côté client puis rejetés côté domaine.
7. Déplacer vers `Done` avec une dépendance ouverte est rejeté sans acquittement explicite, recharge
   l'état autoritatif et ne modifie pas le DAG.
8. L'activité affiche les faits Ticket persistés et reste distincte du transcript d'un Thread.
9. L'URL partage le Ticket ouvert, la recherche et le filtre de priorité ; fermer le Dialog
   conserve les autres paramètres et restitue le focus.
10. En vue complète, le réordonnancement fonctionne au pointeur et au clavier. En vue filtrée, il
    est désactivé, mais le déplacement inter-colonnes reste possible en fin de colonne.
11. Une commande rejetée recharge le snapshot et annule l'état optimiste correspondant.
12. Une reconnexion recharge le snapshot puis reprend le flux ordonné depuis son curseur.
