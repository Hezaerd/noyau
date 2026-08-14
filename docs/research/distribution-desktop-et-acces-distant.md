# Distribution desktop et accès distant

Date de l'étude : 14 août 2026.

## Question

Peut-on distribuer Noyau comme une application desktop Electron qui se connecte à une instance
headless lancée sur un VPS avec une commande telle que `noyau serve`, tout en gardant Hermes comme
premier runtime d'agents et en sécurisant le lien avec Tailscale ou un relay ?

## Conclusion

**Oui, c'est réalisable sans remettre en cause le cœur de Noyau.** Le découpage actuel est même déjà
adapté : `apps/server` possède l'état et les effets, tandis que le client consomme un contrat Effect
RPC sur WebSocket. Remplacer la PWA installée par un shell Electron change la distribution et les
capacités locales du client, pas la frontière de confiance.

Deux nuances sont importantes :

1. Noyau restera une architecture client/serveur. Electron supprime l'expérience de « site
   internet », mais pas le serveur durable, indispensable pour PostgreSQL, les reactors, le
   scheduler et les runs autonomes.
2. L'adaptateur Hermes doit rester **côté serveur**, derrière `AgentRuntime`. L'application desktop
   ne doit pas parler directement à Hermes, sinon elle contournerait les commandes, permissions,
   receipts, événements et approbations de Noyau.

La trajectoire recommandée est :

- un serveur headless `noyau serve` sur Bun, supervisé sur le VPS ;
- une application Electron qui réutilise le renderer React et ne contient aucun état autoritatif ;
- une connexion directe privée par Tailscale en premier ;
- une authentification Noyau par appairage et sessions d'appareil, même sur Tailscale ;
- Cloudflare Tunnel + Access comme option gérée si Tailscale n'est pas souhaité ;
- aucun relay propriétaire avant qu'un vrai besoin de découverte, NAT ou notifications ne
  l'impose.

Cette conclusion modifie le motif de report formulé dans
[l'ADR-0004](../adr/0004-serveur-unique-sur-vps-sans-relay.md) : Electron est utile ici comme
produit desktop et gestionnaire d'environnements distants, pas seulement pour embarquer un serveur
local. Elle ne justifie toutefois pas encore d'implémenter un relay.

## Ce que montre réellement T3 Code

La comparaison est pertinente, mais T3 Code ne supprime pas non plus son backend :

- T3 Code se décrit comme un **server runtime** qui possède sessions d'agents, workspaces et Git,
  avec des clients web, desktop et mobile reliés par un WebSocket Effect RPC authentifié
  ([vue interne officielle](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).
- Le serveur est la frontière d'exécution : processus provider, terminaux, opérations Git et accès
  filesystem ne s'exécutent jamais dans le client
  ([même source](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).
- Son application desktop peut gérer un backend local, mais aussi des environnements distants. Le
  mode SSH démarre ou réutilise le serveur distant, crée un port-forward local, puis le renderer
  utilise le même modèle de connexion que pour LAN, Tailscale ou HTTPS
  ([documentation d'accès distant](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)).
- T3 Code appaire un appareil avec un token à usage unique, crée ensuite une session révocable et
  émet un ticket court pour l'upgrade WebSocket
  ([documentation d'accès distant](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md),
  [implémentation du client](https://github.com/pingdotgg/t3code/blob/main/packages/client-runtime/src/authorization/remote.ts)).
- Détenir un socket authentifié ne suffit pas : le serveur associe aussi chaque méthode RPC à un
  scope
  ([vue interne officielle](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).

Le modèle transposable à Noyau n'est donc pas « Electron remplace le serveur », mais « plusieurs
clients utilisent une même runtime distante authentifiée ».

## Architecture cible

```text
┌─────────────────────────────────────────────────────────────┐
│ Application Electron                                       │
│ ┌─────────────────────┐  ┌───────────────────────────────┐ │
│ │ main process        │  │ renderer React               │ │
│ │ coffre OS, updates, │  │ Tableau, Channel, approvals  │ │
│ │ deep links, réseau  │  │ aucun accès Node/Electron    │ │
│ └──────────┬──────────┘  └──────────────┬────────────────┘ │
│            └──── preload IPC minimal ───┘                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ Effect RPC / WSS
                   Tailscale│direct (recommandé)
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ VPS : noyau serve                                          │
│ auth + commandes + projections + outbox + scheduler        │
│                 │                         │                 │
│            PostgreSQL             AgentRuntime registry    │
│                                           │                 │
│                                  adaptateur Hermes          │
└───────────────────────────────────────────┬─────────────────┘
                                            │ HTTP + SSE
                                  local ou Tailscale
                                            │
                                      Hermes Agent
```

Le transport client existant reste celui de
[l'ADR-0003](../adr/0003-frontiere-client-effect-rpc-websocket.md) : snapshot cohérent, puis flux
ordonné repris depuis un `EventCursor`. Le superviseur de connexion desktop doit reconnecter avec
backoff et reprendre depuis le curseur durable ; il ne doit jamais traiter la durée de vie du socket
comme la durée de vie de l'état.

### Frontières à conserver

| Frontière | Responsabilité |
| --- | --- |
| `NoyauClient` | Contrat RPC commun aux renderers web et desktop |
| `EnvironmentConnection` | URL, découverte, appairage, session, reconnexion |
| `AgentRuntime` | Lancer, interrompre et suivre un runtime d'agent depuis le serveur |
| `HermesAgentRuntime` | Traduire `AgentRuntime` vers l'API publique Hermes |

Un éventuel « adaptateur Tailscale », « adaptateur SSH » ou « adaptateur relay » ne doit pas
réimplémenter le protocole métier. Il ne fait que produire un endpoint WSS joignable pour
`EnvironmentConnection`.

## Serveur headless

`noyau serve` est une façade naturelle pour le modular monolith existant :

```text
noyau serve
  ├─ charge et valide la configuration
  ├─ vérifie/migre PostgreSQL selon une politique explicite
  ├─ démarre RPC, reactors et scheduler
  ├─ publie readiness/health
  └─ s'arrête proprement sur SIGTERM
```

Pour le premier déploiement, le processus devrait écouter sur `127.0.0.1` et être exposé par
Tailscale Serve, un tunnel ou un reverse proxy. Il devrait être supervisé par `systemd` ou un
container, sans dépendre de l'ouverture de l'application Electron.

Bun sait produire un exécutable autonome avec `bun build --compile`, inclut le runtime et permet la
cross-compilation par cible
([documentation Bun](https://bun.sh/docs/bundler/executables)). Cela rend un binaire `noyau`
possible, mais il faudra valider les migrations, assets, drivers natifs et outils externes dans
l'artefact final. Une image OCI ou un package Bun reste un premier mode de livraison acceptable si
le binaire autonome complique ces dépendances.

## Application Electron

Le renderer peut réutiliser `apps/web`, à condition d'extraire seulement le runtime de connexion et
les composants réellement partagés. Electron apporte alors :

- stockage des credentials dans le coffre de l'OS ;
- protocol handler/deep links pour l'appairage ;
- notifications et intégration desktop ;
- gestion de plusieurs instances Noyau ;
- possibilité ultérieure de lancer une instance locale ou un tunnel SSH.

Il n'est pas nécessaire d'embarquer `noyau serve` dans la première version desktop. Commencer par un
client distant évite de mélanger cycle de vie desktop, PostgreSQL local, migrations et supervision
des agents.

Le renderer doit charger des assets locaux packagés et rester traité comme du contenu web non
fiable : `nodeIntegration: false`, `contextIsolation: true`, sandbox activée, CSP restrictive, IPC
minimal avec validation de l'émetteur, navigation externe bloquée et protocole local dédié. Ce sont
des recommandations explicites de la
[checklist de sécurité Electron](https://www.electronjs.org/docs/latest/tutorial/security).
L'application ajoute aussi une chaîne de signature, publication et mises à jour ; Electron fournit
`autoUpdater`, mais les mécanismes varient selon la plateforme
([documentation officielle](https://www.electronjs.org/docs/latest/tutorial/updates)).

Electron est donc faisable, mais ce n'est pas une optimisation gratuite. Il faut l'adopter pour
l'expérience desktop, le coffre OS et les intégrations locales, pas parce qu'il rendrait la
frontière réseau plus simple.

## Connexion distante

### Option A — Tailscale direct : recommandée

Tailscale convient exactement au scénario personnel « desktop connu vers VPS connu » :

- le trafic entre appareils est chiffré de bout en bout et les clés privées restent sur les
  appareils
  ([documentation Tailscale](https://tailscale.com/kb/1093/can-tailscale-decrypt-my-traffic));
- Tailscale Serve reverse-proxy un service local vers le tailnet, provisionne HTTPS et applique les
  règles d'accès du tailnet
  ([documentation Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve));
- les Grants permettent de limiter une identité ou un groupe au seul tag/port Noyau, avec une
  politique deny-by-default
  ([documentation Grants](https://tailscale.com/docs/features/access-control/grants)).

Topologie initiale :

```text
noyau serve --host 127.0.0.1 --port 3001
tailscale serve --bg / http://127.0.0.1:3001
Electron -> wss://noyau.<tailnet>.ts.net/ws
```

Cette commande est illustrative ; l'installateur serveur doit afficher la commande correspondant à
la version de Tailscale réellement supportée.

Tailscale ne remplace pas l'authentification applicative. Ses règles disent quel appareil peut
atteindre le port ; Noyau doit encore connaître l'`actorId`, révoquer un appareil, auditer ses
commandes et appliquer les scopes RPC. Il faut donc cumuler identité réseau et session Noyau.

### Option B — tunnel SSH géré par Electron : bon fallback

Electron peut lancer `ssh -L`, vérifier ou démarrer `noyau serve` à distance et connecter le
renderer à un port loopback. C'est le mode documenté par
[T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md).

Avantages : aucun port public, aucune dépendance Tailscale et réutilisation des clés SSH existantes.
Coûts : gestion des hosts, clés, known hosts, chemins non interactifs, reconnexion et processus
orphelins. Ce mode est utile après le direct Tailscale, pas nécessaire à la première tranche.

### Option C — Cloudflare Tunnel + Access : alternative gérée

Pour un VPS, Cloudflare Tunnel évite déjà de construire un relay :

- `cloudflared` ouvre la connexion sortante et peut garder l'origine sur loopback ;
- Tunnel supporte les WebSockets
  ([FAQ officielle](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/));
- Access peut protéger une application self-hosted et `cloudflared` peut valider le JWT avant de
  transmettre la requête
  ([documentation officielle](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)).

Noyau doit malgré tout valider l'identité qu'il accepte et conserver son appairage. Cloudflare
recommande de valider le JWT `Cf-Access-Jwt-Assertion` à l'origine pour empêcher un bypass
([documentation de validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)).
Le flux d'authentification Access dans Electron demande aussi un navigateur système ou une session
web dédiée, ce qui est plus complexe que Tailscale déjà installé.

### Option D — relay propriétaire sur Workers : réalisable, non recommandé maintenant

Un relay devient utile lorsque le serveur Noyau se trouve derrière NAT sans Tailscale/Tunnel, ou
quand un service de distribution doit fournir découverte, présence, credentials courts et
notifications. Un VPS adressable n'a pas ce problème.

Cloudflare Durable Objects sait terminer des WebSockets entrants et les laisser hiberner
([documentation officielle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)).
Cependant, un relay bidirectionnel nécessiterait aussi une connexion sortante persistante du relay
vers chaque serveur Noyau. Les WebSockets sortants ne peuvent pas hiberner et gardent le Durable
Object actif ; un déploiement de code déconnecte les sockets
([même source](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)).

Il faudrait en plus concevoir :

- l'enregistrement et la découverte d'instances ;
- l'authentification mutuelle client/serveur ;
- le routage et la reprise après reconnexion des deux côtés ;
- le backpressure, les quotas et la protection anti-abus ;
- un chiffrement applicatif de bout en bout si le relay ne doit pas voir les commandes et artefacts ;
- la rotation/révocation des clés et une stratégie de mise à jour sans perte durable.

Utiliser un Worker comme simple reverse proxy vers un VPS public apporte peu par rapport à
Cloudflare Tunnel. Construire un vrai relay est donc une phase de produit distincte, pas un
prérequis de l'application Electron.

## Authentification et appairage recommandés

Le transport privé ne suffit pas. Le minimum sûr est :

1. `noyau serve` crée une clé d'instance persistante et n'expose jamais de secret long dans les
   logs.
2. `noyau pair` émet un token aléatoire, court, à usage unique, avec expiration et QR/deep link.
3. Electron échange ce token sur HTTPS contre une session d'appareil révocable.
4. Le secret de session est stocké par le main process dans le coffre OS ; le renderer ne reçoit
   qu'une API IPC étroite.
5. Avant l'upgrade, le client demande par HTTP authentifié un ticket WebSocket à durée très courte
   et usage unique. Seul ce ticket apparaît dans l'URL du WebSocket.
6. Le serveur authentifie l'upgrade, puis autorise chaque méthode RPC selon l'acteur, le projet et
   les capability grants.
7. `noyau auth list/revoke` permet d'inspecter et de révoquer appareils, sessions et tokens
   d'appairage.

Ce modèle suit le retour d'expérience public de
[T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md) sans reprendre
son stockage ou son domaine. Pour une distribution multi-utilisateur, une preuve de possession par
clé d'appareil peut ensuite limiter le vol/rejeu d'un bearer token.

À éviter :

- bearer permanent dans l'URL WebSocket ;
- token Tailscale ou Cloudflare utilisé comme `actorId` implicite ;
- secret Noyau accessible au renderer ou à `localStorage` ;
- confiance dans `Origin` comme mécanisme d'authentification ;
- endpoint Hermes exposé au client ;
- CORS permissif pour compenser un appairage mal conçu.

## Intégration Hermes

Hermes fournit désormais plusieurs surfaces officielles : ACP ou gateway TUI en JSON-RPC, et un
serveur HTTP avec SSE. Son Runs API permet de démarrer, observer, approuver et arrêter des runs
longs, avec un flux `GET /v1/runs/{id}/events`
([guide d'intégration officiel](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md),
[documentation API](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)).

Cela rend l'adaptateur prévu par
[l'ADR-0007](../adr/0007-hermes-local-ou-tailscale.md) réalisable. Le serveur Noyau doit :

- créer l'`Attempt` et son worktree avant de lancer Hermes ;
- traduire le `ContextPack`, les budgets et capacités vers l'entrée Hermes ;
- persister les événements Hermes pertinents via commandes/outbox ;
- traiter les flux SSE comme une source d'observation reprenable, pas comme la durabilité de Noyau ;
- router approbations et interruptions par les commandes Noyau ;
- garder l'API Hermes sur loopback ou Tailscale, jamais derrière le WebSocket client.

Il faut prototyper l'API Runs avant de figer le port : la documentation indique que l'API HTTP ne
supporte pas toutes les livraisons asynchrones de certaines intégrations Hermes
([code officiel de l'adaptateur API](https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py)).

## Plan incrémental

### 1. Préserver la frontière pendant la feature-todo

- garder `apps/web` indépendant d'Electron ;
- centraliser le client Effect RPC, les curseurs et la reconnexion dans une frontière testable ;
- ne jamais importer Electron dans les composants de domaine ou d'UI ;
- conserver toutes les mutations derrière les commandes Noyau.

### 2. Rendre le serveur distribuable

- introduire la CLI `noyau serve`, la configuration Schema, health/readiness et l'arrêt propre ;
- documenter un service `systemd` ou une image OCI avec PostgreSQL ;
- exposer d'abord sur loopback ;
- ajouter `noyau pair` et `noyau auth`.

### 3. Valider l'accès distant sans Electron

- tester le WebSocket Effect RPC via Tailscale Serve ;
- vérifier reconnexion, reprise par curseur, expiration de ticket et révocation d'appareil ;
- mesurer le comportement après redémarrage serveur et coupure réseau.

Cette étape sépare les risques de protocole des risques de packaging desktop.

### 4. Ajouter le shell Electron

- créer `apps/desktop` seulement quand la frontière précédente est réelle et testée ;
- packager le renderer existant localement ;
- implémenter coffre OS, deep link, sélection d'instance et mises à jour ;
- commencer par un seul transport direct WSS ; ajouter SSH/Tunnel comme stratégies d'accès, pas
  comme protocoles métier.

### 5. Brancher Hermes

- prototyper `HermesAgentRuntime` contre la Runs API sur loopback ;
- tester interruption, approbation, perte de stream et reprise ;
- étendre à une instance Hermes distante via Tailscale seulement après le chemin local.

### 6. Réévaluer un relay

Ne lancer cette phase que si au moins un besoin mesuré apparaît :

- instances personnelles derrière NAT sans client VPN ;
- découverte multi-instance ;
- notifications quand aucun client n'est connecté ;
- distribution à des utilisateurs qui ne gèrent ni DNS, ni Tailscale, ni Tunnel.

## Décisions à prendre avant l'implémentation

1. L'application desktop doit-elle supporter uniquement une instance distante, ou aussi lancer un
   Noyau local à terme ?
2. Tailscale peut-il être un prérequis assumé pour la première distribution personnelle ?
3. Un même utilisateur peut-il appairer plusieurs appareils et les révoquer séparément ?
4. Les projets d'une instance partagent-ils tous une identité de session, avec scopes par projet, ou
   faut-il des appareils limités à certains projets ?
5. La CLI est-elle distribuée comme binaire Bun, package Bun ou image OCI en premier ?
6. Hermes sera-t-il toujours colocalisé au début, ou le premier prototype doit-il couvrir aussi un
   hôte Tailscale distinct ?

## Recommandation finale

Adopter le modèle **desktop client + serveur headless**, sans présenter Electron comme un
remplacement du backend. Le premier produit distribuable devrait être :

```text
VPS
  PostgreSQL
  noyau serve (loopback, service supervisé)
  Hermes (loopback)
  Tailscale Serve

Desktop
  Tailscale
  Noyau Electron
  appairage Noyau révocable
  Effect RPC sur WSS
```

Cette topologie satisfait le besoin d'usage, reste cohérente avec le control plane durable et
conserve une migration propre vers SSH, Cloudflare Tunnel ou un relay futur. La seule décision
d'architecture à réviser immédiatement est l'idée qu'Electron n'aurait de valeur que pour bundler
un serveur local ; le report du relay, lui, reste justifié.
