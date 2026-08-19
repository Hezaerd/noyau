# Distribution desktop et accès distant

Date de l'étude : 14 août 2026.

> **Statut : historique.** La v0.1 a remplacé cette topologie par un Environment local unique
> ([ADR-0011](../adr/0011-noyau-local-first-v0.1.md)). PostgreSQL, PGlite, Hermes, VPS et
> Tailscale ne sont plus des cibles actives. Ne pas implémenter depuis cette note.

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

La décision retenue conserve le même contrat client/serveur dans deux profils :

- distant : Electron se connecte directement via Tailscale à `noyau serve`, PostgreSQL et Hermes sur
  le VPS ;
- local géré : Electron supervise sur loopback le même `noyau serve`, seul propriétaire d'une
  PGlite persistante, ainsi qu'un Hermes local.

Cloudflare Tunnel, relay, SSH et Hermes distant restent hors du périmètre initial. Cette décision
remplace la topologie de distribution de
[l'ADR-0004](../adr/0004-serveur-unique-sur-vps-sans-relay.md), sans remettre en cause son serveur
modular monolith.

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
- T3 Connect ne relaie pas lui-même les frames dans un Durable Object : son Worker porte la
  découverte et les credentials, puis le trafic passe par un hostname Cloudflare Tunnel
  ([architecture T3 Connect au commit étudié](https://github.com/pingdotgg/t3code/blob/5304f3e9d4c912bfa0eb2f5f41fa109b3646236b/docs/internals/t3-connect.md)).

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

Effect RPC v4 vit encore sous `effect/unstable/*`. La distribution indépendante du desktop et du
serveur exige donc un handshake annonçant version de protocole et capacités, une fenêtre de
compatibilité explicite et des schémas Noyau versionnés ; le format interne Effect ne doit pas
devenir par accident un engagement wire public
([source Effect correspondant à la version étudiée](https://github.com/Effect-TS/effect/blob/3c495ae7c96d43bfc3b8020250562a194c2c895e/packages/effect/src/unstable/rpc/RpcServer.ts)).

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
- supervision de l'instance locale et possibilité ultérieure d'un tunnel SSH.

Le desktop doit supporter les deux profils sans bifurquer le renderer : soit il ne lance aucun
backend et se connecte au VPS, soit son main process supervise `noyau serve` et Hermes localement.
Même dans ce second cas, Electron ne possède ni la base, ni l'outbox, ni le scheduler.

Le « coffre OS » doit être vérifié par plateforme : `safeStorage` utilise Keychain sur macOS et
DPAPI sur Windows, mais peut tomber sous Linux sur le backend `basic_text`, que l'application doit
refuser au lieu de considérer le credential comme protégé
([documentation Electron](https://www.electronjs.org/docs/latest/api/safe-storage)).

Le renderer doit charger des assets locaux packagés et rester traité comme du contenu web non
fiable : `nodeIntegration: false`, `contextIsolation: true`, sandbox activée, CSP restrictive, IPC
minimal avec validation de l'émetteur, navigation externe bloquée et protocole local dédié. Ce sont
des recommandations explicites de la
[checklist de sécurité Electron](https://www.electronjs.org/docs/latest/tutorial/security).
L'application ajoute aussi une chaîne de signature, publication et mises à jour ; Electron fournit
`autoUpdater` sur macOS et Windows, tandis que Linux repose normalement sur son gestionnaire de
paquets
([documentation officielle](https://www.electronjs.org/docs/latest/api/auto-updater)).

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
- Serve retire les éventuels headers d'identité fournis par le client puis injecte
  `Tailscale-User-Login`, `Tailscale-User-Name` et `Tailscale-User-Profile-Pic` pour le trafic du
  tailnet ; ces headers ne sont pas renseignés pour un appareil taggé
  ([même documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers));
- les Grants permettent de limiter une identité ou un groupe au seul tag/port Noyau, avec une
  politique deny-by-default
  ([documentation Grants](https://tailscale.com/docs/features/access-control/grants)).

Topologie initiale :

```text
noyau serve --host 127.0.0.1 --port 3001
tailscale serve --bg 3001
Electron -> wss://noyau.<tailnet>.ts.net/ws
```

Cette commande est illustrative ; la syntaxe de Serve a changé avec Tailscale 1.52, donc
l'installateur serveur doit afficher la commande correspondant à la version réellement supportée
([documentation Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)).

Tailscale ne remplace pas l'authentification applicative. Ses règles disent quel appareil peut
atteindre le port ; Noyau doit encore connaître l'`actorId`, révoquer un appareil, auditer ses
commandes et appliquer les scopes RPC. Il faut donc cumuler identité réseau et session Noyau.
Dans un mode personnel strictement Tailscale, Noyau peut utiliser `Tailscale-User-Login` comme preuve
d'identité initiale uniquement si le serveur écoute sur loopback derrière Serve. L'appairage Noyau
reste utile pour une révocation par appareil, pour les autres transports et pour ne pas faire varier
le modèle d'autorisation selon le chemin réseau.

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
Un vrai rendez-vous peut donc utiliser un Durable Object par `instanceId`, avec **deux connexions
sortantes vers Cloudflare** — une ouverte par `noyau serve`, l'autre par Electron. Du point de vue du
Durable Object, les deux sockets sont entrants et peuvent utiliser l'API d'hibernation. En revanche,
une variante où le Worker ouvre lui-même un WebSocket sortant vers le VPS ne peut pas hiberner
pendant cette connexion. Les déploiements de code déconnectent dans tous les cas les sockets
([cycle de vie officiel](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)).

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
- utiliser un profil/processus Hermes isolé par `Attempt`, plutôt qu'une instance globale dont les
  sessions, sous-agents ou containers pourraient partager un état implicite ;
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

### 3. Valider les deux profils sans Electron

- tester le même Effect RPC sur PostgreSQL via Tailscale Serve et sur PGlite via loopback ;
- vérifier reconnexion, reprise par curseur, expiration de ticket et révocation d'appareil ;
- vérifier le handshake de version et la compatibilité entre deux versions desktop/serveur ;
- mesurer le comportement après redémarrage serveur et coupure réseau.

Cette étape sépare les risques de stockage et de protocole des risques de packaging desktop.

### 4. Ajouter le shell Electron

- créer `apps/desktop` seulement quand la frontière précédente est réelle et testée ;
- packager le renderer existant localement ;
- implémenter coffre OS, deep link, sélection d'instance et mises à jour ;
- connecter directement le profil VPS ou superviser le profil local sans raccourci IPC métier.

### 5. Brancher Hermes colocalisé

- prototyper `HermesAgentRuntime` contre la Runs API sur loopback ;
- tester interruption, approbation, perte de stream et reprise ;
- utiliser le même adaptateur quand Noyau et Hermes tournent sur le laptop ou sur le VPS ;
- différer Hermes sur un hôte distinct.

### 6. Réévaluer un relay

Ne lancer cette phase que si au moins un besoin mesuré apparaît :

- instances personnelles derrière NAT sans client VPN ;
- découverte multi-instance ;
- notifications quand aucun client n'est connecté ;
- distribution à des utilisateurs qui ne gèrent ni DNS, ni Tailscale, ni Tunnel.

## Décisions à prendre avant l'implémentation

L'ADR-0009 a résolu la topologie : desktop distant et local géré sont tous deux supportés, Tailscale
sert le profil VPS initial et Hermes est colocalisé. Restent à décider :

1. Un même utilisateur peut-il appairer plusieurs appareils et les révoquer séparément ?
2. Les projets d'une instance partagent-ils tous une identité de session, avec scopes par projet, ou
   faut-il des appareils limités à certains projets ?
3. La CLI est-elle distribuée comme binaire Bun, package Bun ou image OCI en premier ?
4. Le profil local s'arrête-t-il avec la fenêtre, reste-t-il dans le tray ou installe-t-il un daemon
   utilisateur ?

## Recommandation finale

Adopter le modèle **desktop client + même serveur local ou distant**, sans présenter Electron comme
un remplacement du backend :

```text
Profil distant                    Profil local géré
Noyau Desktop                    Noyau Desktop
  │ WSS / Tailscale                │ WS / loopback
  v                                v
noyau serve sur VPS              noyau serve supervisé
  ├─ PostgreSQL                     ├─ PGlite persistante
  `─ Hermes                         `─ Hermes
```

Les deux profils utilisent le même protocole, les mêmes règles d'authentification et le même
parcours fonctionnel. Ils ne synchronisent pas leurs bases et ne chaînent pas deux control planes.
