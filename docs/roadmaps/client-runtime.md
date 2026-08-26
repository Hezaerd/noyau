# Roadmap — Client Runtime hybride

> **Statut global : prêt à implémenter.** Dernière mise à jour : 2026-08-26.
>
> Décision : [ADR-0021](../adr/0021-client-runtime-hybride.md). Référence étudiée : subtree
> `repos/t3code` importé par le commit Noyau `34fcc6b22337dbe512f38ccd39a128b584cfd2c6`, depuis le
> commit t3code `84e9b152c2e1edf14333254c1928277d967509c8`.

Ce document est la source de continuité du chantier. Il fixe la cible, l'ordre, les invariants,
les décisions encore ouvertes, les critères de sortie et la manière de reprendre le travail après
une interruption. Il ne remplace ni les ADR, qui expliquent les décisions durables, ni les issues
GitHub, qui découpent le travail exécutable.

## 1. Résultat recherché

Le renderer doit avoir deux propriétaires d'état aux responsabilités disjointes :

```text
Noyau Server
    │
    │ Effect RPC : query / command / subscription
    ▼
packages/client-runtime
    ├── Session RPC et génération de transport
    ├── Effect Atom : ressources et Projections distantes
    ├── reducers de frames snapshot / event / synchronized / live
    └── politiques de rétention, reprise et concurrence
                │
                ▼ hooks React étroits
apps/web        ├── rendu des Projections distantes
                └── Zustand : États client et actions locales
```

Le résultat n'est pas « Zustand pour les données simples, Atom pour les données complexes ».
L'allocation dépend de l'autorité :

- une **Projection distante** est une vue en mémoire d'un état dont Noyau Server est l'autorité ;
- un **État client** est possédé par l'interface et ne reçoit pas de snapshot autoritatif du Server ;
- une **Ressource distante** possède un Effect ou un Stream, son résultat, son erreur et son cycle
  de vie ;
- un **État de vue React** qui ne survit pas au composant reste dans `useState` ou `useReducer`.

## 2. Allocation cible des états

| État actuel | Propriétaire cible | Forme cible | Remarque |
| --- | --- | --- | --- |
| Shell, Projects, ThreadShells, Cursor | Client Runtime | subscription Atom unique | Projection Shell autoritative |
| Tableau par Project | Client Runtime | family de subscription Atoms | Une ressource retenue par Project actif |
| ThreadSnapshot par Thread | Client Runtime | family avec idle TTL | Garde un Thread récemment visité chaud |
| Assistant live non durable | Client Runtime | projection volatile séparée | Ne modifie pas le transcript durable |
| Statut VCS et Pull Requests | Client Runtime | subscription/query Atoms | Indexation par `VcsScope` canonique |
| Recherches, previews, TurnDiff | Client Runtime | query Atoms ou commandes de stream | `latest` pour les recherches interactives |
| Dispatch des CommandRequest | Client Runtime | Command runner | `commandId` stable sur retry ambigu |
| Dernier Project choisi | Zustand ou Router | store local minimal | Le Router reste propriétaire de l'URL |
| Brouillons Composer | Zustand | store mémoire indexé | Pas de `localStorage` selon le glossaire actuel |
| Pins et visites | Zustand | store persisté | Décodage et migration explicites |
| Préférences renderer | Zustand | store persisté | `partialize`, version et migration |
| Préférences de Settle | Zustand | store persisté | État client, malgré leur effet sur une vue distante |
| Keybindings renderer | Zustand | store persisté | Recorder éphémère dans le même domaine ou séparé |
| Mise à jour Desktop | Zustand | store/actions locales | La bridge Electron reste un adaptateur |
| Hauteur Composer, follow key, dialogs | React local ou Zustand | au plus petit scope utile | Ne pas globaliser par réflexe |
| Queue Classés, unread, activité | Hook de composition | fonction pure + Atom + Zustand | Pas de bridge entre runtimes |

Cette table doit être mise à jour dès qu'un état change de propriétaire. Un état non listé doit être
classé avant son déplacement.

## 3. Invariants non négociables

### Autorité et cohérence

1. SQLite, le journal, les receipts et les projections Server restent l'unique source de vérité
   métier. Un Atom distant est un cache, jamais une seconde autorité.
2. Une subscription accepte d'abord un snapshot, puis les événements strictement postérieurs à son
   `snapshotSequence`. Un événement dupliqué ou plus ancien est ignoré.
3. `synchronized` signifie que le flux a rattrapé le head connu au début de la souscription. Recevoir
   une frame quelconque ne suffit pas à déclarer la Projection `live`.
4. Une ancienne session, requête ou subscription ne peut jamais écraser une valeur issue d'une
   génération RPC plus récente.
5. Une reconnexion conserve une Projection utilisable et expose séparément son état de
   synchronisation et son erreur. La présence de données en cache ne signifie pas que le transport
   est sain.
6. Le contenu `live` du Thread reste volatil. Seuls les événements durables modifient le
   `ThreadSnapshot` et son transcript.

### Ownership et dépendances

7. `packages/client-runtime` ne dépend que des contrats nécessaires (`@noyau/protocol`, Effect et
   utilitaires purs justifiés). Il ne dépend ni de React, ni du DOM, ni d'Electron, ni de Zustand,
   ni de `apps/web`, ni de `packages/domain`.
8. `apps/web` fournit les capacités de plateforme : URL/token bootstrap, constructeur WebSocket,
   visibilité/focus si nécessaire, journalisation de présentation et stockage local.
9. Les composants ne construisent ni client RPC, ni transport, ni boucle de retry, ni subscription.
10. Les stores Zustand ne contiennent pas de snapshot métier autoritatif et ne déclenchent pas de
    réplication RPC implicite.
11. Aucun abonnement ne synchronise un store Zustand vers un Atom ou inversement. Une vue mixte lit
    les deux via un hook puis appelle une fonction pure.

### Effets, erreurs et commandes

12. Les données RPC restent décodées par les Schemas du protocol. Les erreurs attendues restent dans
    le canal d'erreur Effect jusqu'à la frontière de présentation.
13. Le bridge Promise existe seulement aux frontières React ou impératives explicitement nommées.
    Le Runtime ne reconstruit pas une API Promise autour de chaque Effect.
14. Un seul superviseur possède la Session RPC et la politique de reconnexion. Une subscription
    individuelle ne remplace pas elle-même le transport global.
15. Une Command séparée de sa confirmation de projection ne réalise pas de mise à jour optimiste par
    défaut. Chaque optimisation éventuelle est décidée et testée par domaine.
16. En cas de résultat de transport ambigu, le retry d'une Command réutilise le même
    `ClientCommandRequest` et donc le même `commandId`; une nouvelle intention crée un nouvel ID.

### Qualité et structure

17. Les reducers snapshot/event sont purs et testés sans React, Registry global ou transport réel.
18. Les factories de stores et de runtimes sont testables avec des Layers et horloges déterministes.
19. Les exports de `packages/client-runtime` sont des subpaths ciblés ; aucun barrel racine.
20. Aucun fichier n'est copié aveuglément depuis `repos/t3code`. Chaque dépendance multi-Environment,
    remote ou mobile est supprimée ou justifiée.

## 4. Point de départ Noyau

Le chantier part d'un système fonctionnel, mais dont les responsabilités sont dispersées :

| Zone actuelle | Responsabilités à reprendre | Dette à ne pas transporter telle quelle |
| --- | --- | --- |
| `apps/web/src/lib/control-plane.ts` | client RPC, queries, Commands, streams, cursor | Session globale mutable, retries possédés par chaque subscription, façade Promise générale |
| `apps/web/src/state/atom-registry.ts` | Registry React et accès impératif | singleton de module et reset global de test |
| `apps/web/src/state/shell.ts` | snapshot Shell, reducers, index et selectors | writers publics et hydratation mêlée à la projection |
| `apps/web/src/state/board.ts` | partage de subscription Project | `writers`, ref-count, génération et reload manuel |
| `apps/web/src/state/thread-snapshot.ts` | cache chaud par Thread | subscription encore possédée par `ThreadPage` |
| `apps/web/src/pages/ThreadPage.tsx` | orchestration du stream Thread | lifecycle RPC mêlé à l'état du Composer et au rendu |
| `apps/web/src/state/sidebar.ts` | activité, unread et Queue Classés | jointure directe entre atoms distants et locaux |
| `apps/web/src/state/preferences.ts` | préférences et effets locaux | persistance et flags `once` reconstruits à la main |
| `apps/web/src/state/composer-drafts.ts` | Brouillons indexés | API de store réimplémentée sur Registry |
| hooks `use-vcs-*` | subscriptions VCS | doublons de ressources selon les composants montés |

Les tests actuels de `control-plane.test.ts`, `control-plane-state.test.ts`,
`thread-snapshot.test.ts` et `chrome-atoms.test.ts` sont une base de caractérisation, pas une
spécification suffisante. En particulier, le marqueur `synchronized` existe déjà dans le protocol
mais le consumer actuel considère toute frame comme `Connected` et ne lui donne aucun rôle de phase.

## 5. Carte de référence t3code

Le port doit commencer par le comportement et les tests de ces sources, dans cet ordre :

| Besoin Noyau | Référence t3code | Ce qu'il faut en retenir |
| --- | --- | --- |
| Vue d'ensemble | `docs/internals/connection-runtime.md` | ownership unique, séparation transport/sync, règles d'erreur |
| Contrat du package | `packages/client-runtime/README.md` | subpaths étroits et dépendance plateforme → runtime |
| Une tentative RPC | `packages/client-runtime/src/rpc/session.ts` | Session sans retry, readiness et fermeture explicites |
| Supervision | `packages/client-runtime/src/connection/supervisor.ts` | remplacement de lease, backoff et wakeups ; simplifier au local |
| Primitives Atom | `packages/client-runtime/src/state/runtime.ts` | query, subscription, command, génération et scheduler |
| Shell synchronisé | `packages/client-runtime/src/state/shell.ts` | snapshot conservé, phases et protection de session autoritative |
| Détail Thread | `packages/client-runtime/src/state/threadDetail.ts` | family, états dérivés et rétention |
| Entités stables | `packages/client-runtime/src/state/threadShell.ts` et `projectEntities.ts` | index et stabilité référentielle |
| Zustand local simple | `apps/web/src/threadSelectionStore.ts` | état/actions/selectors sans couche artificielle |
| Zustand persisté | `apps/web/src/composerDraftStore.ts` et `uiStateStore.ts` | version, validation, migrations, debounce et flush |

`connection/registry.ts`, les platform registrations et les caches Environment servent à comprendre
les frontières, pas à être copiés. Toute divergence voulue par rapport à ces références est notée
dans le journal de session avec son motif.

## 6. Cible de structure

La structure exacte peut évoluer, mais les responsabilités doivent rester reconnaissables :

```text
packages/client-runtime/
  CONTEXT.md
  package.json
  src/
    rpc/
      client.ts              # appels typés query / command / stream
      session.ts             # une tentative de transport, sans retry
    connection/
      supervisor.ts          # désir de connexion, génération et retry unique
      model.ts               # état transport distinct de l'état des projections
    state/
      runtime.ts             # factories query/subscription/command + scheduler
      stream-reducer.ts      # discipline snapshot/sequence/synchronized
      shell.ts
      board.ts
      thread.ts
      vcs.ts
    platform/
      services.ts            # capacités fournies par apps/web
    testing/
      layers.ts

apps/web/src/
  client-runtime/
    layer.ts                 # composition navigateur Noyau
    registry.ts              # Registry React possédé par l'app
    hooks/                   # hooks de lecture/commande étroits
  stores/
    preferences-store.ts
    composer-draft-store.ts
    thread-chrome-store.ts
    keybindings-store.ts
    desktop-ui-store.ts
  hooks/
    use-sidebar-queues.ts     # composition distante + locale
```

Créer le package est justifié par une frontière testable et non visuelle, même avec un seul client.
Il ne faut cependant pas pré-construire une API mobile ou remote.

## 7. Ordre d'implémentation

Chaque phase doit être intégrable seule et laisser l'application fonctionnelle. Une phase ne
commence que lorsque les critères de sortie de ses bloqueurs sont satisfaits.

### Phase 0 — Baseline et contrat de migration

**Objectif :** figer les comportements à préserver avant de déplacer leurs propriétaires.

Travaux :

- accepter l'ADR-0021 et garder ADR-0020 comme décision supersédée ;
- enregistrer cette roadmap comme source de continuité ;
- dresser dans les tests une matrice des streams Shell, Project et Thread : snapshot initial,
  reprise par `afterSequence`, événements dupliqués, marqueur `synchronized`, fin de stream,
  erreur attendue et rupture transport ;
- caractériser la reconnexion actuelle et les états visibles au boot ;
- inventorier tous les imports de `apps/web/src/lib/control-plane.ts`, `apps/web/src/state/` et
  `@effect/atom-react` ;
- décider des seuils mesurables : une subscription Shell, au plus une subscription par Project ou
  Thread retenu, zéro write après disposal, zéro régression de rendu ciblée.

Critères de sortie :

- les scénarios critiques échoueraient si l'ordre snapshot/event était cassé ;
- chaque module actuel possède une destination dans la table d'allocation ;
- aucune modification fonctionnelle n'est mélangée à cette baseline.

### Phase 1 — Squelette de `@noyau/client-runtime`

**Objectif :** créer la frontière de package sans migrer encore une feature utilisateur.

Travaux :

- créer le workspace, son `CONTEXT.md`, ses exports subpath et sa configuration Vite Task ;
- ajouter `effect: catalog:` et `@noyau/protocol`; n'ajouter React ou Zustand sous aucun prétexte ;
- définir les services de plateforme minimaux : configuration RPC, WebSocket et reporter technique ;
- déplacer ou réécrire les primitives pures de séquence dans le package ;
- fournir les Layers de test et un Registry neuf par test ;
- documenter la correspondance entre chaque primitive portée et sa source t3code.

Critères de sortie :

- le package est importable uniquement par subpath ;
- ses tests passent sans DOM ni serveur réel ;
- `apps/web` fonctionne encore sur l'ancien chemin.

### Phase 2 — Session RPC et superviseur mono-Environment

**Objectif :** établir un propriétaire unique du transport et de la reconnexion.

Travaux :

- séparer `RpcSessionFactory` — une seule tentative, aucun retry — du `ConnectionSupervisor` ;
- déplacer hors de `control-plane.ts` la création du `ManagedRuntime`, du client Effect RPC et de
  la session WebSocket ;
- représenter explicitement la génération de session et les états `connecting`, `connected`,
  `reconnecting`, `unavailable` ;
- centraliser backoff, cancellation et disposal ;
- faire attendre les subscriptions sur la prochaine session au lieu de se battre pour remplacer
  `activeTransportSession` ;
- distinguer une erreur RPC métier d'une rupture de transport ; seule la seconde remplace la session ;
- conserver le token de bootstrap et le transport loopback comme capacités injectées depuis Web.

À ne pas porter de t3code : catalogue d'Environments, resolver multi-endpoints, relay, SSH,
credentials distants, état réseau mobile et cache offline.

Critères de sortie :

- dix subscriptions qui observent une même rupture ne créent qu'une session de remplacement ;
- une subscription arrêtée n'est jamais ressuscitée ;
- une session remplacée est disposée exactement une fois ;
- les timers de retry sont testés avec une horloge déterministe ;
- le transport courant expose une génération monotone.

### Phase 3 — Primitives de ressources Atom

**Objectif :** porter le noyau réutilisable qui rend Atom préférable à des writables impératifs.

Travaux :

- adapter `createEnvironmentQueryAtomFamily` en `createQueryAtomFamily` mono-Environment ;
- adapter `createEnvironmentSubscriptionAtomFamily` en `createSubscriptionAtomFamily` ;
- adapter le Command runner et son scheduler `parallel | serial | singleFlight | latest` ;
- définir un état distant commun conservant valeur précédente, phase de synchronisation et erreur ;
- invalider ou revalider les queries lorsque la génération RPC change ;
- faire suivre les subscriptions vers une nouvelle session sans perdre leur ownership Atom ;
- intégrer `staleTime`, `idleTTL` et refresh seulement quand un consommateur concret les réclame ;
- normaliser logs et Causes sans convertir prématurément en texte d'interface.

Critères de sortie :

- acquisition, partage, release et réacquisition d'une family sont testés ;
- une réponse d'une ancienne génération est ignorée ;
- chaque mode de concurrence du scheduler possède un test déterministe ;
- aucun `Map` de ref-counting n'est requis dans une feature consommatrice.

### Phase 4 — Première tranche verticale : Shell

**Objectif :** prouver toute l'architecture sur la Projection la plus globale.

Travaux :

- déplacer `applyShellEvent`, l'index stable des ThreadShells et la réduction du flux à la frontière
  appropriée du Client Runtime ;
- construire la ressource Shell : `empty → synchronizing → live`, avec valeur précédente et erreur
  séparées ;
- respecter `snapshotSequence`, `afterSequence` et `synchronized` ;
- exposer des atoms dérivés étroits : Projects, ThreadShell par ID, Threads par Project, statut Cursor ;
- remplacer `ControlPlaneProvider` et les hooks Shell par les hooks du nouveau runtime ;
- conserver la sélection du dernier Project hors de la Projection distante ;
- retirer `appliedShellAtom`, les writers correspondants et leur initialisation globale.

Critères de sortie :

- une seule subscription Shell existe pour l'application ;
- la sidebar ne disparaît pas pendant une reconnexion ;
- une suppression ou création de Thread est reflétée sans write impératif depuis un composant ;
- les tests d'indexation conservent la stabilité référentielle utile aux rows React.

Cette phase est le point de décision. Si le runtime ne réduit pas nettement le code impératif et
n'améliore pas les tests de lifecycle, ne pas multiplier le pattern avant d'en comprendre la cause.

### Phase 5 — Projection Tableau par Project

**Objectif :** remplacer le ref-counting manuel de `state/board.ts`.

Travaux :

- construire une family retenue par `ProjectId` ;
- appliquer les EventEnvelopes au snapshot via un reducer pur, ou justifier explicitement un reload
  autoritatif si le contrat ne permet pas une réduction sûre ;
- utiliser `synchronized` comme passage à `live` ;
- partager la même ressource entre Tableau et Composer ;
- choisir un idle TTL à partir de l'usage réel, pas par copie du chiffre t3code ;
- migrer les commandes de Tableau sans les coupler à la subscription ;
- supprimer `writers`, `generation`, `retainProjectBoard` et les reloads déclenchés depuis React.

Critères de sortie :

- plusieurs consommateurs d'un Project partagent une subscription ;
- le dernier release déclenche le cleanup selon la politique de rétention ;
- changer rapidement de Project ne permet pas au précédent de remplacer le nouveau ;
- les mutations sont confirmées par la projection Server.

### Phase 6 — Projection Thread et canal live

**Objectif :** migrer le flux le plus sensible sans confondre durable et volatil.

Travaux :

- construire une family de `ThreadSnapshot` avec le TTL chaud existant comme baseline ;
- réduire les EventEnvelopes durables dans la Projection Thread ;
- isoler `ThreadAssistantLive` dans une projection volatile de peinture ;
- déplacer hors de `ThreadPage` le démarrage, la reprise, le statut et le cleanup du stream ;
- dériver runtimeMode et modelSelection du snapshot dès qu'ils sont autoritatifs ; garder seulement
  l'intention de draft locale avant le premier Turn ;
- traiter Thread supprimé, stream interrompu, retry et changement rapide de Thread ;
- préserver la révocation des URLs d'images et autres ressources strictement UI dans React/Zustand.

Critères de sortie :

- `ThreadPage` ne connaît plus `subscribeThread`, les cursors ou le Registry ;
- les deltas live disparaissent au cleanup sans altérer le transcript durable ;
- revisiter un Thread avant le TTL restitue immédiatement son snapshot puis le resynchronise ;
- une frame tardive du Thread précédent est sans effet.

### Phase 7 — Queries, VCS et Command runner

**Objectif :** supprimer la façade Promise monolithique restante.

Travaux :

- classer chaque méthode actuelle en query, command ou subscription ;
- migrer VCS status et Pull Requests vers des families de subscription ;
- migrer Preview, TurnDiff, recherche de paths et inspection agent vers des query atoms ;
- appliquer `latest` aux recherches et actions où seule la dernière intention compte ;
- appliquer `singleFlight` aux lectures identiques coûteuses ;
- garder `parallel` par défaut pour les opérations indépendantes ;
- router les CommandRequest par le Command runner avec reporting et retry idempotent ;
- remplacer progressivement les imports directs de `control-plane.ts` ;
- conserver une API impérative étroite pour les workflows non React qui en ont réellement besoin.

Critères de sortie :

- aucun composant ne crée ou ne supervise un Stream RPC ;
- les doublons VCS entre sidebar et header partagent la même ressource ;
- les recherches ne publient jamais un résultat obsolète ;
- `control-plane.ts` ne possède plus de session globale ni de boucle de reconnexion.

### Phase 8 — Stores Zustand pour l'État client

**Objectif :** remplacer les atoms qui recréent des stores locaux.

Travaux :

- ajouter Zustand au workspace Web uniquement ;
- créer des factories de stores testables, puis les instances d'application ;
- migrer les domaines sans dérivation distante : préférences, keybindings, desktop UI et Brouillons ;
- laisser temporairement Pins, Visites et préférences de Settle dans Atom : leur migration appartient
  aux tranches verticales de la phase 9 afin de ne jamais casser leurs vues dérivées ;
- pour les données persistées, décoder le stockage, versionner le format, définir `partialize` et une
  migration ; ne pas persister `Map`, `Set`, fonctions ou objets non sérialisables tels quels ;
- conserver le Brouillon en mémoire tant que la décision produit ne change pas ;
- remplacer `persistWritableAtom`, les flags d'initialisation module-global et les getters/setters
  du Registry par des actions de store ;
- utiliser des selectors étroits et `useShallow` seulement lorsqu'une sélection composite le requiert.

Critères de sortie :

- chaque store possède un propriétaire fonctionnel clair, pas un `useAppStore` global ;
- hydratation, corruption du stockage, migration et erreurs de quota sont testées ;
- les actions sont utilisables hors React via l'API vanilla du store ;
- aucun État client autonome ne reste dans Atom ; seuls les inputs locaux des vues mixtes attendent
  leur tranche verticale de phase 9.

### Phase 9 — Vues mixtes et suppression des bridges implicites

**Objectif :** composer proprement les deux systèmes réactifs.

Travaux :

- extraire ou conserver en fonctions pures `partitionThreadsForSidebar`, `resolveThreadActivity` et
  les autres calculs mêlant données distantes et locales ;
- migrer Pins, Visites et préférences de Settle vers Zustand dans la même tranche que les hooks qui
  composent leurs vues distantes ;
- faire lire aux hooks de composition les atoms distants et les selectors Zustand nécessaires ;
- mémoïser uniquement les calculs mesurés comme coûteux ;
- vérifier la stabilité référentielle des listes de sidebar et du Tableau ;
- utiliser `Atom.batch` seulement à l'intérieur du monde Atom et une action Zustand unique pour une
  transaction locale ; ne pas prétendre rendre les deux atomiques ensemble ;
- définir pour toute intention transverse un ordre explicite et idempotent.

Critères de sortie :

- aucun Atom ne lit Zustand et aucun store Zustand ne lit le Registry Atom ;
- aucun Atom restant ne représente exclusivement un État client ;
- les vues mixtes ont des tests unitaires sur leurs fonctions pures ;
- création de Thread, promotion du Brouillon, Pin et Settle conservent leur comportement observable ;
- les rows non concernées ne rerendent pas lors d'une modification locale ciblée.

### Phase 10 — Nettoyage et durcissement

**Objectif :** faire de la nouvelle architecture l'unique chemin supporté.

Travaux :

- supprimer l'ancien superviseur, les writers, atoms chrome et hooks devenus morts ;
- interdire par lint ou règles de dépendance les imports RPC directs depuis composants/pages ;
- interdire Zustand dans `packages/client-runtime` et Effect Atom dans les stores Web ;
- mettre à jour `CONTEXT-MAP.md`, les `CONTEXT.md`, l'architecture et les diagrammes avec les chemins
  réellement livrés ;
- documenter les subpaths publics du package et leurs propriétaires ;
- comparer le poids bundle, le nombre de subscriptions et les rerenders aux baselines ;
- lancer la suite complète `bun run check`, `bun run test`, `bun run build` avant la PR finale.

Critères de sortie :

- un seul chemin de transport, de query, de command et de subscription reste dans le repo ;
- `apps/web/src/state/` est supprimé ou ne contient plus d'ambiguïté d'ownership ;
- les diagnostics et tests de lifecycle couvrent reconnect, disposal, stale generation et retry ;
- la documentation ne contient plus l'ancien principe « tout l'état renderer dans Atom ».

## 8. Dépendances entre phases et stratégie de livraison

```text
Phase 0
   ↓
Phase 1 → Phase 2 → Phase 3
                    ↓
                 Phase 4 (Shell)
                    ├──→ Phase 5 (Tableau)
                    ├──→ Phase 6 (Thread)
                    └──→ Phase 7 (queries/commands/VCS)
                                  ↓
                         Phase 8 (Zustand local)
                                  ↓
                         Phase 9 (vues mixtes)
                                  ↓
                         Phase 10 (cleanup)
```

Les phases 5, 6 et 7 peuvent former des branches empilées au-dessus du runtime stabilisé si elles
touchent des surfaces indépendantes. Les phases 8 et 9 doivent rester ordonnées : migrer Zustand
avant d'avoir une stratégie pour les vues mixtes créerait des bridges temporaires difficiles à
supprimer. Une PR ne doit pas combiner une primitive de runtime non prouvée et plusieurs migrations
de features.

Ordre recommandé des couches d'une stack éventuelle :

1. package et primitives testées ;
2. superviseur/session ;
3. ressource Shell ;
4. une Projection spécialisée ;
5. hooks Web et suppression de l'ancien chemin de cette Projection.

## 9. Décisions à prendre au moment opportun

Ces questions ne doivent pas bloquer les premières phases, mais aucune ne doit être tranchée
implicitement :

| Question | Phase limite | Critère de décision |
| --- | --- | --- |
| Persister des Projections distantes pour un démarrage offline ? | 4 | Besoin produit réel ; Noyau local peut probablement recharger vite |
| Réduire les événements Tableau côté client ou recharger ? | 5 | Exhaustivité du reducer et coût des snapshots |
| TTL exact du Tableau et des Threads | 5–6 | Mesures de navigation et mémoire |
| Requête Atom ou commande impérative pour Preview/TurnDiff ? | 7 | Besoin de cache, partage et refresh |
| Une ou plusieurs stores de préférences ? | 8 | Cohésion des actions et fréquence de lecture, pas taille du fichier |
| `persist` Zustand standard ou storage adapter maison ? | 8 | Validation Schema, debounce, flush et migrations nécessaires |
| Où vit `lastProjectId` si le Router devient suffisant ? | 8 | Source canonique de navigation au boot |
| Optimisme pour création/déplacement de Ticket ? | après 9 | Latence mesurée et capacité de rollback explicite |

Toute réponse durable doit mettre à jour cette table et, si elle satisfait les critères du skill
domain-modeling, produire un ADR court.

## 10. Pièges spécifiques à éviter

- Copier les 79 modules `state` de t3code alors que Noyau n'a qu'un Environment.
- Garder `EnvironmentId` partout « pour plus tard » : le mono-Environment doit être visible dans les
  types et pourra être généralisé si le produit change.
- Déclarer la connexion saine parce qu'un snapshot en cache existe.
- Relancer le transport pour une erreur métier attendue.
- Convertir toutes les erreurs en `AppFailure` dans le package ; la présentation appartient à Web.
- Appeler `registry.get` dans des composants ou des stores Zustand.
- Introduire un store global qui mélange préférences, Composer, navigation et chrome.
- Persister un état distant en localStorage sans protocole de version et d'invalidation.
- Répliquer une valeur Server dans Zustand « pour faciliter un formulaire » sans distinguer draft et
  valeur autoritative.
- Faire dépendre un reducer client de `packages/domain`; partager une fonction pure seulement via une
  frontière réellement neutre.
- Modifier `repos/t3code`; le subtree est une référence en lecture seule.
- Copier les durées, politiques de retry et caches de t3code sans vérifier le contexte local Noyau.

## 11. Matrice de vérification minimale

Chaque ressource distante doit couvrir :

| Scénario | Preuve attendue |
| --- | --- |
| Premier mount | Une acquisition et une seule subscription |
| Deux consommateurs | Subscription partagée |
| Snapshot puis événements | Séquence strictement croissante |
| Événement avant snapshot sans cursor chaud | Événement refusé |
| Reprise avec cursor chaud | Catch-up accepté sans attendre un snapshot |
| `synchronized` | Phase `live`, sans mutation du snapshot |
| Doublon ou ancien événement | Aucune mutation ni rerender associé |
| Rupture transport | Valeur conservée, reconnexion exposée |
| Erreur métier | Erreur exposée sans remplacement injustifié du transport |
| Nouvelle génération | Ancien writer neutralisé |
| Dernier release | Fiber interrompue ou TTL engagé |
| Réacquisition avant TTL | Valeur immédiate et resynchronisation correcte |
| Disposal du runtime | Zéro timer, fiber ou socket survivant |

Chaque store Zustand persisté doit couvrir valeur par défaut, hydratation valide, payload corrompu,
migration de version, écriture partielle, échec de stockage et reset de test.

## 12. Protocole de reprise entre sessions

Au début de chaque session consacrée à ce chantier :

1. lire `AGENTS.md`, `docs/ARCHITECTURE.md`, ADR-0021 et ce document ;
2. lire `CONTEXT-MAP.md` puis le `CONTEXT.md` des contextes touchés ;
3. consulter la table de progression ci-dessous et le dernier journal de session ;
4. vérifier `git status --short` et préserver les changements non liés ;
5. relire uniquement les modules t3code cités par la phase active ;
6. confirmer le plus petit critère de sortie encore non satisfait ;
7. exécuter les tests de caractérisation concernés avant de modifier le code.

Avant de terminer une session :

1. mettre à jour le statut de la phase et ses critères effectivement prouvés ;
2. ajouter une entrée concise au journal : décisions, fichiers, tests, prochain pas, risques ;
3. mettre à jour les questions ouvertes, sans transformer une hypothèse en décision ;
4. exécuter `vp check` sur les fichiers touchés et les tests ciblés ;
5. laisser le workspace dans un état où la prochaine session peut déterminer ce qui fonctionne sans
   relire la conversation précédente.

Les conversations ne sont jamais une source de vérité du chantier. Toute décision ou découverte
nécessaire à la suite doit finir ici, dans un ADR, un `CONTEXT.md`, un test ou une issue GitHub.

## 13. Progression

| Phase | Statut | Issue/PR | Dernière preuve | Prochain pas |
| --- | --- | --- | --- | --- |
| 0 — Baseline | Terminé | #272 | tests streams + inventaire 58 | Phase 1 : squelette `@noyau/client-runtime` |
| 1 — Package | Terminé | #272 / #273 | 16 tests package + 46 tests Phase 0 Web verts | Phase 2 : Session RPC / superviseur |
| 2 — Session/superviseur | Terminé | #273 | 29 tests package + 61 tests Phase 0 Web verts | Phase 3 : primitives Atom |
| 3 — Primitives Atom | Terminé | #273 | families + scheduler package verts | Phase 4 : tranche Shell |
| 4 — Shell | Terminé | #273 | ressource Shell + hooks Web verts | Phase 5 hors scope de cette PR |
| 5 — Tableau | À faire | — | — | Bloqué par phase 4 |
| 6 — Thread | À faire | — | — | Bloqué par phase 4 |
| 7 — Queries/commands/VCS | À faire | — | — | Bloqué par phase 4 |
| 8 — Zustand local | À faire | — | — | Bloqué par phases 5–7 |
| 9 — Vues mixtes | À faire | — | — | Bloqué par phase 8 |
| 10 — Nettoyage | À faire | — | — | Bloqué par phase 9 |

Valeurs de statut autorisées : `À faire`, `En cours`, `Bloqué`, `Terminé`. `Terminé` exige tous les
critères de sortie de la phase, pas seulement du code présent.

## 14. Journal des sessions

Ajouter les entrées les plus récentes en premier.

### 2026-08-26 — Phase 4 terminée (tranche verticale Shell)

- Issue / PR de continuité : [#272](https://github.com/Hezaerd/noyau/issues/272) /
  [#273](https://github.com/Hezaerd/noyau/pull/273).
- Subpath `@noyau/client-runtime/state/shell` : `applyShellEvent`,
  `indexThreadShells`, `createShellResourceAtom`. Phases
  `empty → synchronizing → live`. `synchronized` = live, pas Connected.
- Web : `ControlPlaneProvider` monte l'atom Shell. Un seul
  `ManagedRuntime` partagé (`apps/web/src/client-runtime/runtime.ts`).
  `lastProjectId` reste local. Overlay optimiste pour create Thread ;
  prune quand le snapshot distant contient l'id.
- `subscribeShell` web reste pour la caractérisation Project/Thread
  (`Connected` sur toute frame). Le chemin Shell ne l'utilise plus.
- Preuves : package Shell + Phase 0 Web (streams, inventaire 59,
  control-plane-state, chrome-atoms). Sidebar conservée à la
  reconnexion (value + phase synchronizing).
- Prochain pas hors PR : Phase 5 Tableau.

### 2026-08-26 — Phase 3 terminée (primitives Atom)

- Issue / PR de continuité : [#272](https://github.com/Hezaerd/noyau/issues/272) /
  [#273](https://github.com/Hezaerd/noyau/pull/273).
- Subpath `@noyau/client-runtime/state/runtime` : `createQueryAtomFamily`,
  `createSubscriptionAtomFamily`, scheduler `parallel | serial | singleFlight |
  latest`, `RemoteResourceState`. Pas d'`EnvironmentId`. `staleTime` / `idleTTL`
  / refresh seulement à la demande.
- Query : attend `phase === "connected"`, se revalide sur génération, ignore un
  résultat plus ancien (`publishIfCurrentGeneration`). Subscription : `switchMap`
  sur la génération connected. Ownership Atom (`mount` / `unmount` / idleTTL).
- Preuves : `vp test run packages/client-runtime` (53) ; `vp check --fix
  packages/client-runtime`. Share/release/reacquire, génération 1 ignorée,
  quatre modes de scheduler, valeur conservée sur erreur.
- Web / Shell inchangés. Prochain pas : Phase 4 tranche verticale Shell.

### 2026-08-26 — Phase 2 terminée (Session RPC + ConnectionSupervisor)

- Issue / PR de continuité : [#272](https://github.com/Hezaerd/noyau/issues/272) /
  [#273](https://github.com/Hezaerd/noyau/pull/273).
- `RpcSessionFactory` : une tentative, `retryTransientErrors: false`, URL
  `rpcUrl` + `token`. `ConnectionSupervisor` : coalesce des ruptures, backoff
  `min(100 * 2^(attempt-1), 2000)` via `Effect.sleep` / TestClock, génération
  monotone, `stop` tue les retries.
- Web : `control-plane.ts` attend `currentSession` et notifie le superviseur.
  Une erreur métier publie `SubscriptionStatus.Failed` sans remplacer le
  transport. `makeSequencedFrameConsumer` inchangé (`synchronized` = Connected).
- Preuves : `vp test run packages/client-runtime` (29) ; `vp check --fix
  packages/client-runtime` ; Phase 0 Web `control-plane` + `client-runtime-streams`
  + `client-runtime-consumers` + `control-plane-state` + `chrome-atoms` (61).
  10 ruptures → 1 replace ; stop → 0 connect ; dispose une fois ; TestClock
  100 ms ; génération 1 puis 2 ; métier ignore.
- Prochain pas : Phase 3 primitives Atom query/subscription.

### 2026-08-26 — Phase 1 terminée (squelette `@noyau/client-runtime`)

- Issue / PR de continuité : [#272](https://github.com/Hezaerd/noyau/issues/272) /
  [#273](https://github.com/Hezaerd/noyau/pull/273).
- Package `packages/client-runtime` : subpaths `platform`, `state/stream`, `testing`. Pas
  d'export racine. Dépendances : `@noyau/protocol`, `effect`.
- Reducer cible : `synchronized` avant snapshot reste `empty` ; après snapshot ou cursor
  chaud → `live` sans muter value/cursor. Web inchangé (`control-plane.ts`).
- Preuves : `vp test run packages/client-runtime` (16) ; `vp check --fix packages/client-runtime` ;
  Phase 0 Web `client-runtime-streams` + `client-runtime-consumers` + `control-plane` (46).
- `bun install` a lié le workspace et mis à jour `bun.lock`.
- Prochain pas : Phase 2 Session RPC et superviseur mono-Environment.

### 2026-08-26 — Phase 0 terminée (caractérisation + inventaire)

- Issue : [#272](https://github.com/Hezaerd/noyau/issues/272).
- Streams : `apps/web/test/client-runtime-streams.test.ts` + fixtures. Matrice Shell / Project /
  Thread : snapshot initial, reprise chaude, anciens/doublons, `synchronized`, fin de stream,
  erreur métier et rupture transport. Boot/reconnexion : snapshot conservé, statut séparé.
- `synchronized` actuel verrouillé : toute frame publie `Connected` ; le marqueur n'avance pas le
  curseur, n'active pas le live et ne mute pas le snapshot. Ambiguïté transport vs Projection live
  à éliminer en Phase 3–4 — pas corrigée ici.
- Inventaire : `apps/web/test/client-runtime-consumers.test.ts` — 58 fichiers `apps/web/src`,
  scan filesystem = table. Seuils : 1 Shell, 1 Project/Thread retenu, 0 write après disposal.
- Aucune modification fonctionnelle. Phase 1 peut créer `@noyau/client-runtime`.

### 2026-08-25 — Cadrage initial

- Décision : adopter le partage t3code entre Effect Atom distant et Zustand local.
- Portée : version mono-Environment ; pas de remote, relay, SSH, mobile ou cache offline par défaut.
- Documentation : ADR-0021 supersède ADR-0020 ; roadmap détaillée créée.
- État du code : aucune migration fonctionnelle commencée.
- Prochain pas : phase 0, compléter les tests de caractérisation des trois subscriptions et
  l'inventaire d'imports avant de créer le package.
