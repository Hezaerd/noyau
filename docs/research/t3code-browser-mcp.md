# MCP browser de t3code : architecture et enseignements pour Noyau

Date de l'étude : 21 août 2026.

> **Statut : note factuelle.** Sources primaires : snapshot vendored de t3code et code Noyau.
> Cette note éclaire [ADR-0015](../adr/0015-tableau-accessible-aux-agents-par-mcp.md), sans le
> modifier. Le snapshot t3code étudié utilise Effect `4.0.0-beta.103`; Noyau épingle
> `4.0.0-beta.107`.

## Conclusion

t3code ne lance pas un subprocess MCP stdio pour son browser tool. Il monte un serveur MCP HTTP
stateful à `/mcp` **dans le même processus et sur le même listener que T3 Server**, avec
`McpServer.layerHttp` d'Effect. Une capacité bearer aléatoire est créée avant le démarrage ou la
reprise d'une session provider, puis injectée selon le transport natif de chaque provider. Cursor
et Grok la reçoivent dans les `mcpServers` HTTP de `session/new` et `session/load`; Codex, Claude et
OpenCode ont leurs propres adaptateurs.

Le pattern directement transposable à Noyau est donc plus petit que le bridge stdio envisagé dans
l'ADR-0015 : route MCP HTTP dans `apps/server`, registre de capacités en mémoire, contexte
d'invocation fourni par middleware, outils Effect branchés sur les services autoritatifs, et
injection ACP à la création **comme** à la reprise. Pour Cursor, le schema ACP déjà généré dans
Noyau accepte le transport HTTP. Noyau devrait toutefois vérifier
`initialize.agentCapabilities.mcpCapabilities.http` avant de choisir cette voie, car HTTP reste
une capacité ACP annoncée, tandis que stdio est le dénominateur commun.

## Vue d'ensemble du flux t3code

```text
ProviderService.startSession / recover
  -> McpSessionRegistry.issue(threadId, providerInstanceId)
  -> mémorise hash(token) -> scope
  -> McpProviderSession mémorise endpoint + bearer pour le thread
  -> adapter provider démarre/reprend la session avec le MCP "t3-code"

Agent provider
  -> HTTP POST /mcp + Authorization: Bearer <token>
  -> middleware résout le scope et fournit McpInvocationContext
  -> Tool handler vérifie capability "preview"
  -> PreviewAutomationBroker route vers un host Electron du même Environment
  -> host exécute dans la webview et répond par Effect RPC WebSocket
```

Le serveur MCP est composé dans les routes HTTP du serveur principal, à côté de l'API et du RPC
WebSocket, et partage le `PreviewAutomationBroker` de durée de vie serveur
([server.ts, lignes 445-466](../../repos/t3code/apps/server/src/server.ts#L445-L466)). Il n'existe
donc ni entrypoint MCP séparé, ni protocole RPC interne MCP → serveur, ni processus à superviser.

## Emplacement, transport et protocole MCP

L'implémentation est concentrée dans
[`apps/server/src/mcp`](../../repos/t3code/apps/server/src/mcp) :

- `McpHttpServer.ts` compose transport, authentification et enregistrement des toolkits ;
- `McpSessionRegistry.ts` émet, résout, rafraîchit et révoque les capacités ;
- `McpInvocationContext.ts` porte le scope authentifié dans les handlers ;
- `McpProviderSession.ts` met la configuration injectée à disposition des adaptateurs ;
- `toolkits/preview/{tools,handlers}.ts` sépare contrats et implémentations ;
- `PreviewAutomationBroker.ts` route les appels vers le navigateur Electron.

Le transport est `McpServer.layerHttp`, chemin `/mcp`, protocole MCP `2025-06-18`
([McpHttpServer.ts, lignes 219-226](../../repos/t3code/apps/server/src/mcp/McpHttpServer.ts#L219-L226)).
Le test d'intégration du transport vérifie l'initialisation HTTP stateful, le header
`mcp-session-id`, la terminaison par `DELETE` et le rejet d'une session ensuite réutilisée
([McpHttpServer.test.ts, lignes 100-150](../../repos/t3code/apps/server/src/mcp/McpHttpServer.test.ts#L100-L150)).

Le choix HTTP n'ajoute pas le SDK MCP officiel : t3code importe `McpProtocol`, `McpServer`, `Tool`
et `Toolkit` depuis `effect/unstable/ai`
([McpHttpServer.ts, lignes 1-24](../../repos/t3code/apps/server/src/mcp/McpHttpServer.ts#L1-L24)).
Le package serveur ne dépend que d'Effect pour cette surface, sans
`@modelcontextprotocol/sdk`
([apps/server/package.json, lignes 24-48](../../repos/t3code/apps/server/package.json#L24-L48)).

## Schémas et outils

Les entrées, sorties et erreurs métier vivent dans `packages/contracts/src/previewAutomation.ts`.
Les contraintes sont exprimées avec `Schema` : URL bornée à 2 048 caractères, timeout positif
plafonné à 60 secondes, sélection optionnelle d'un `tabId`, et validation croisée « exactement un
de `url` ou `target` » pour la navigation
([previewAutomation.ts, lignes 14-23](../../repos/t3code/packages/contracts/src/previewAutomation.ts#L14-L23),
[lignes 51-64](../../repos/t3code/packages/contracts/src/previewAutomation.ts#L51-L64),
[lignes 147-183](../../repos/t3code/packages/contracts/src/previewAutomation.ts#L147-L183)).

`Tool.make` réutilise directement ces Schemas. Chaque outil déclare description, parameters,
success, failure et dépendances Effect. Les annotations MCP sont explicites : les lectures sont
readonly et idempotentes; les interactions avec une page sont `openWorld`; clic, saisie,
pression de touche et évaluation sont destructifs, tandis que navigation et redimensionnement ne
le sont pas
([tools.ts, lignes 27-56](../../repos/t3code/apps/server/src/mcp/toolkits/preview/tools.ts#L27-L56),
[lignes 71-117](../../repos/t3code/apps/server/src/mcp/toolkits/preview/tools.ts#L71-L117),
[lignes 119-182](../../repos/t3code/apps/server/src/mcp/toolkits/preview/tools.ts#L119-L182)).

La surface actuelle contient quatorze outils : status, open, navigate, resize, appearance,
snapshot, click, type, press, scroll, evaluate, wait, recording start et recording stop. Ils sont
assemblés en `Toolkit`, avec `preview_snapshot` isolé parce que sa réponse MCP contient à la fois
du contenu structuré et une image PNG binaire
([tools.ts, lignes 185-240](../../repos/t3code/apps/server/src/mcp/toolkits/preview/tools.ts#L185-L240),
[McpHttpServer.ts, lignes 130-203](../../repos/t3code/apps/server/src/mcp/McpHttpServer.ts#L130-L203)).

Les handlers sont minces : ils exigent la capability `preview`, retirent `tabId` des arguments
métier, appellent le broker et normalisent seulement quelques résultats
([handlers.ts, lignes 30-95](../../repos/t3code/apps/server/src/mcp/toolkits/preview/handlers.ts#L30-L95)).
Le test des contrats vérifie que chaque entrée exporte un schema JSON racine de type `object`, que
chaque champ est décrit et que les actions sans résultat ont un objet fermé exact
([tools.test.ts, lignes 28-73](../../repos/t3code/apps/server/src/mcp/toolkits/preview/tools.test.ts#L28-L73)).

## Authentification et scoping

La route `/mcp` n'utilise pas la session utilisateur normale de l'Environment. Son middleware
exige `Authorization: Bearer`, résout le token dans `McpSessionRegistry`, répond `401` si celui-ci
est absent/inconnu/expiré, puis fournit le scope comme service `McpInvocationContext`
([McpHttpServer.ts, lignes 26-38](../../repos/t3code/apps/server/src/mcp/McpHttpServer.ts#L26-L38),
[lignes 66-97](../../repos/t3code/apps/server/src/mcp/McpHttpServer.ts#L66-L97)).

À l'émission, le registre génère un `providerSessionId` UUID et 32 octets aléatoires, ne conserve
que le SHA-256 du bearer et lui associe :

- `environmentId` ;
- `threadId` ;
- `providerSessionId` ;
- `providerInstanceId` ;
- `capabilities`, actuellement `{ "preview" }` ;
- `issuedAt`.

La valeur brute n'est rendue qu'une fois dans la configuration à injecter
([McpSessionRegistry.ts, lignes 91-149](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L91-L149)).
Le handler ne reçoit donc jamais ces identités depuis les arguments du modèle; il les lit dans le
contexte authentifié, et `requireMcpCapability` produit une erreur typée si la capability manque
([McpInvocationContext.ts, lignes 10-40](../../repos/t3code/apps/server/src/mcp/McpInvocationContext.ts#L10-L40)).

Le registre est volontairement volatile. Sa fenêtre de liveness vaut 24 heures; chaque trafic MCP
rafraîchit le token et chaque Turn provider appelle aussi `touch(threadId)`. L'objectif est de ne
pas perdre les outils pendant une longue session silencieuse, tout en bornant les credentials des
processus morts sans arrêt propre
([McpSessionRegistry.ts, lignes 59-73](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L59-L73),
[lignes 152-181](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L152-L181),
[ProviderService.ts, lignes 729-735](../../repos/t3code/apps/server/src/provider/Layers/ProviderService.ts#L729-L735)).
Un arrêt de session révoque par Thread; `stopAll` révoque tout
([ProviderService.ts, lignes 900-920](../../repos/t3code/apps/server/src/provider/Layers/ProviderService.ts#L900-L920),
[lignes 1068-1092](../../repos/t3code/apps/server/src/provider/Layers/ProviderService.ts#L1068-L1092)).

La route MCP est exposée sur le listener du serveur et peut donc être distante. Le bearer dédié
est sa seule protection; le code le signale explicitement
([McpSessionRegistry.ts, lignes 63-71](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L63-L71)).
L'endpoint injecté reprend l'adresse réellement bindée et remplace une wildcard IPv4/IPv6 par
`127.0.0.1`
([McpSessionRegistry.ts, lignes 80-104](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L80-L104)).

## Cycle de vie et injection provider

`ProviderService` émet une nouvelle capacité avant `adapter.startSession`, aussi bien au démarrage
normal qu'à la reprise d'un binding. Une erreur de démarrage ou un mismatch provider nettoie la
capacité immédiatement
([ProviderService.ts, lignes 400-419](../../repos/t3code/apps/server/src/provider/Layers/ProviderService.ts#L400-L419),
[lignes 598-615](../../repos/t3code/apps/server/src/provider/Layers/ProviderService.ts#L598-L615)).
L'émission révoque d'abord toute capacité précédente du même Thread
([McpSessionRegistry.ts, lignes 225-232](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.ts#L225-L232)).

La configuration est ensuite injectée différemment selon le provider :

| Provider | Injection t3code |
| --- | --- |
| Cursor | MCP HTTP dans les options ACP, donc dans `session/new` et `session/load`, avec header Authorization ([CursorAdapter.ts, lignes 534-558](../../repos/t3code/apps/server/src/provider/Layers/CursorAdapter.ts#L534-L558), [AcpSessionRuntime.ts, lignes 559-637](../../repos/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts#L559-L637)). |
| Grok | Même runtime ACP et même configuration HTTP ([GrokAdapter.ts, lignes 572-596](../../repos/t3code/apps/server/src/provider/Layers/GrokAdapter.ts#L572-L596)). |
| Codex | Arguments `-c mcp_servers.t3-code.url=…`, bearer fourni par variable d'environnement dédiée; reload du catalogue MCP avant chaque Turn ([CodexAdapter.ts, lignes 1665-1695](../../repos/t3code/apps/server/src/provider/Layers/CodexAdapter.ts#L1665-L1695), [CodexSessionRuntime.ts, lignes 1801-1811](../../repos/t3code/apps/server/src/provider/Layers/CodexSessionRuntime.ts#L1801-L1811)). |
| Claude | `queryOptions.mcpServers`, type HTTP et header Authorization ([ClaudeAdapter.ts, lignes 4145-4191](../../repos/t3code/apps/server/src/provider/Layers/ClaudeAdapter.ts#L4145-L4191)). |
| OpenCode | Appel SDK `mcp.add` pour le serveur local géré; désactivé pour un serveur OpenCode externe ([OpenCodeAdapter.ts, lignes 1217-1249](../../repos/t3code/apps/server/src/provider/Layers/OpenCodeAdapter.ts#L1217-L1249)). |

t3code complète la découverte des outils par des developer instructions spécifiques à Codex :
commencer par `preview_status`, ouvrir avec `preview_open`, préférer snapshot et locators, et ne
basculer vers un autre navigateur que si la surface t3code est réellement absente ou indisponible
([CodexDeveloperInstructions.ts, lignes 3-12](../../repos/t3code/apps/server/src/provider/CodexDeveloperInstructions.ts#L3-L12)).

## Pourquoi le browser nécessite un broker, et pourquoi le Tableau non

Le MCP s'exécute dans T3 Server mais le navigateur automatisable vit dans Electron. Les clients
desktop ouvrent donc un stream Effect RPC `previewAutomation.connect`, reçoivent les demandes et
renvoient les réponses; ces trois RPC exigent `orchestration:operate`
([rpc.ts, lignes 826-841](../../repos/t3code/packages/contracts/src/rpc.ts#L826-L841),
[RpcAuthorization.ts, lignes 110-120](../../repos/t3code/apps/server/src/auth/RpcAuthorization.ts#L110-L120)).

Le broker maintient les hosts connectés et les requêtes pending dans un `SynchronizedRef`, avec
une queue par connexion et des `Deferred` pour corréler les réponses
([PreviewAutomationBroker.ts, lignes 61-114](../../repos/t3code/apps/server/src/mcp/PreviewAutomationBroker.ts#L61-L114),
[lignes 288-370](../../repos/t3code/apps/server/src/mcp/PreviewAutomationBroker.ts#L288-L370)).
Il borne le routage à l'Environment du credential et épingle une provider session au même runtime
desktop afin qu'une séquence d'interactions conserve cookies et DOM. Il ne bascule vers un autre
host qu'après déconnexion
([PreviewAutomationBroker.ts, lignes 426-518](../../repos/t3code/apps/server/src/mcp/PreviewAutomationBroker.ts#L426-L518)).

Noyau n'a pas besoin de reproduire ce broker pour le Tableau : projections, moteur de commandes et
base autoritative sont déjà dans Noyau Server. Les handlers MCP peuvent appeler directement des
services de lecture et `dispatchCommand` dans le même Layer, sans WebSocket interne ni client
Electron intermédiaire.

## Packaging et tests

Le MCP fait partie du bundle serveur unique `src/bin.ts`; le build ne produit aucun artefact MCP
distinct
([vite.config.ts, lignes 26-56](../../repos/t3code/apps/server/vite.config.ts#L26-L56),
[package.json, lignes 10-22](../../repos/t3code/apps/server/package.json#L10-L22)).

La couverture est divisée par frontière :

- registre : token hashé, endpoint selon l'adresse bindée, expiration, touch par Thread
  ([McpSessionRegistry.test.ts, lignes 34-128](../../repos/t3code/apps/server/src/mcp/McpSessionRegistry.test.ts#L34-L128)) ;
- transport/toolkit : sémantique HTTP, annotations, validation des paramètres, contenu structuré et
  image snapshot
  ([McpHttpServer.test.ts, lignes 154-287](../../repos/t3code/apps/server/src/mcp/McpHttpServer.test.ts#L154-L287)) ;
- broker : corrélation, plusieurs tabs, absence de host, isolation Environment, pinning et failover;
  la liste des scénarios est visible dans
  [PreviewAutomationBroker.test.ts](../../repos/t3code/apps/server/src/mcp/PreviewAutomationBroker.test.ts) ;
- adapters : détection/reload MCP Codex et présentation des appels MCP dans le transcript
  ([CodexSessionRuntime.test.ts, lignes 304-319](../../repos/t3code/apps/server/src/provider/Layers/CodexSessionRuntime.test.ts#L304-L319),
  [CodexAdapter.test.ts, lignes 559-607](../../repos/t3code/apps/server/src/provider/Layers/CodexAdapter.test.ts#L559-L607)).

## Ce qui est réutilisable pour Noyau

### À reprendre

1. **Serveur MCP dans `apps/server`.** `McpServer.layerHttp` et les services métier partagent le
   même runtime Effect. Cela supprime le second bundle, le subprocess et le client RPC interne
   proposés initialement.
2. **Registre de capacités éphémères.** Token aléatoire, hash seul en mémoire, scope construit côté
   serveur et révocation sur fin de Turn/Session. Ajouter `projectId`, `turnId`, acteur d'audit et
   un ensemble d'opérations Tableau.
3. **Contexte injecté par middleware.** Aucun `projectId`, `threadId` ou acteur libre dans les
   arguments des outils.
4. **Contrats et handlers séparés.** `Tool.make` + Schemas partagés, handlers minces qui lisent les
   projections ou soumettent une commande publique.
5. **Injection symétrique.** Fournir exactement le même MCP à `session/new`, `session/load` et au
   fallback new après échec du load.
6. **Tests par frontière.** JSON Schemas compatibles provider, auth/scope, transport HTTP,
   idempotence des mutations, et test adapter prouvant les trois chemins ACP.
7. **Instructions agent courtes.** Expliquer l'ordre d'usage du Tableau (`list_actionable`, lien au
   Thread, move, travail, complete) complète les descriptions de tools sans les dupliquer.

### À adapter

- Le scope t3code est `Environment + Thread + provider session`; celui de Noyau doit être
  `Environment + Project + Thread + Turn/provider session + acteur + opérations`.
- Les tools Tableau ne sont pas `openWorld`. Les lectures sont readonly; les mutations sont
  fermées au control plane et doivent porter un `operationId` converti en `commandId` stable.
- Une capability Noyau ne doit pas survivre 24 heures par copie aveugle. Sa durée doit suivre le
  vrai cycle de vie Cursor de Noyau, actuellement ouvert dans le scope d'un Turn. La révocation
  explicite reste principale; une fenêtre de liveness ne sert que de filet de sécurité.
- Les erreurs attendues doivent rester structurées pour l'agent, sans divulguer détails internes,
  payloads ou contenu de Tickets hors scope.

### À ne pas reprendre

- `McpProviderSession`, map globale impérative utilisée comme pont vers cinq adapters. Noyau n'a
  qu'un adaptateur Cursor en v0.1 : passer une valeur de configuration scopée explicitement est
  plus simple et plus testable.
- `PreviewAutomationBroker`, ses queues, ses hosts et son pinning : ils répondent à la frontière
  serveur/Electron du browser, absente pour le Tableau.
- Les trois RPC preview et le scope `orchestration:operate` global : le MCP Tableau appelle déjà le
  control plane local et doit disposer de droits plus fins.
- La configuration provider spécifique à Codex, Claude, Grok et OpenCode tant que Noyau ne les
  supporte pas.

## Conséquence retenue dans ADR-0015

Le motif initial « HTTP/SSE est optionnel dans ACP, donc stdio obligatoire » décrit le
dénominateur commun du protocole, mais ne justifie pas le transport retenu pour **Cursor**. Le
schema ACP de Noyau contient déjà `McpServerHttp` avec URL et headers
([schema ACP Noyau, lignes 2775-2809](../../packages/acp/src/_generated/schema.gen.ts#L2775-L2809)),
et `initialize` renvoie les MCP capabilities de l'agent. L'adaptateur Noyau vérifie aujourd'hui
seulement protocol v1 et `loadSession`
([cursor-acp.ts, lignes 376-389](../../apps/server/src/provider/cursor-acp.ts#L376-L389)).

La décision retenue est **HTTP requis en v0.1, sans fallback stdio**. Cursor sans capability HTTP
est inactif. La configuration est construite après `initialize`, puis transmise aux trois branches
présentes de Noyau : load, new après échec du load, et new initial
([cursor-acp.ts, lignes 655-693](../../apps/server/src/provider/cursor-acp.ts#L655-L693)).
