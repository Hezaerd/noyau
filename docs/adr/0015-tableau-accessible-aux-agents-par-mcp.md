# Tableau accessible aux agents par MCP HTTP

> **Statut : accepté.** Complète le modèle Session de [ADR-0013](0013-session-projetee-et-cursor.md)
> et le runtime de [ADR-0018](0018-runtime-cursor-porte-par-la-session.md), ainsi que
> [ADR-0014](0014-fil-de-fer-acp.md). Le choix du transport reprend le pattern documenté dans
> [le MCP browser de t3code](../research/t3code-browser-mcp.md).

Les agents Cursor doivent pouvoir consulter et faire évoluer le Tableau du Project pendant un
Turn. Noyau expose pour cela un serveur MCP local nommé `noyau`. MCP est une façade agent du
control plane, pas une nouvelle `TodoList`, une nouvelle source de vérité ni un modèle
d'exécution : le Tableau et ses Tickets restent les concepts autoritatifs.

Le serveur MCP est un endpoint HTTP `/mcp` embarqué dans Noyau Server avec
`McpServer.layerHttp` d'Effect. Il partage le processus, le listener loopback et les services du
control plane. L'adaptateur Cursor exige `agentCapabilities.mcpCapabilities.http === true` au
handshake, puis injecte l'URL et le header d'autorisation dans `session/new` et `session/load`, y
compris le `session/new` de repli après un load en échec. Une version Cursor sans cette capacité
est inactive. Noyau ne fournit aucun fallback MCP stdio, second entrypoint ou bridge RPC interne.

Avant de démarrer ou reprendre une Session provider, Noyau émet une capacité MCP éphémère
distincte du bearer Electron. Le registre mémoire ne conserve que son hash et l'associe à
l'Environment, au Project, au Thread, à la Session provider et à l'ensemble d'opérations
autorisées. Le bearer survit entre les Turns, mais `McpSessionRegistry.resolve` exige un
`activeTurnId` : le middleware `/mcp` refuse HTTP 401 hors Turn actif. Ce Turn complète le
contexte d'invocation pour l'audit et les limites de mutation. Le secret brut n'est transmis
qu'à Cursor. Le trafic et chaque nouveau Turn renouvellent sa vivacité ; le finalizer du
runtime provider de la Session le révoque et une expiration bornée couvre les arrêts anormaux.
Le registre est vide au boot et n'est jamais une source de vérité.

Le middleware `/mcp` résout cette capacité et fournit un contexte d'invocation aux handlers. Les
outils ne laissent jamais l'agent choisir un autre `projectId`, se faire passer pour un autre
acteur ou lier un autre `threadId`. Leurs droits de mutation restent distincts du `runtimeMode`,
qui continue de décrire la politique d'outils du Provider.

Les lectures MCP interrogent les projections cohérentes dans le même processus. Toute écriture
MCP est décodée avec `Schema`, traduite en `CommandRequest` publique existante et remise au même
`CommandGateway` que `dispatchCommand`. Elle porte un `operationId` stable transformé en
`commandId` pour les retries et retourne le receipt autoritatif. Le serveur MCP ne lit ni n'écrit
SQLite directement, n'appelle pas les deciders directement et ne peut pas soumettre les commandes
internes d'ingestion provider.

La première surface expose la lecture du Tableau, le détail et les Tickets actionnables, puis les
commandes Ticket nécessaires pour créer, modifier, déplacer, terminer, rouvrir, relier le Thread
courant et gérer les dépendances. Terminer malgré des prérequis ouverts conserve la confirmation
explicite du domaine. Le transcript du Thread lié reste la trace du travail agent : MCP
n'introduit ni commentaires de progression, ni checklist dans un Ticket.

## Options écartées

- Un fichier de todo ou un store propre aux agents dupliquerait le Tableau et créerait des
  divergences au redémarrage.
- Un accès SQLite ou un appel direct aux deciders contournerait receipts, audit, idempotence,
  projections et publication des événements.
- Un MCP stdio serait compatible avec davantage d'agents ACP, mais ajouterait un bundle, un
  subprocess, un client RPC interne et un second cycle de vie pour une compatibilité hors du
  provider Cursor v0.1.
- Un fallback stdio maintiendrait deux transports et deux chemins de test. Noyau préfère rendre
  HTTP obligatoire et signaler une version Cursor incompatible au handshake.
- Exposer `dispatchCommand` brut comme unique outil donnerait à l'agent un contrat trop large,
  peu descriptif et difficile à borner par capacité.

## Conséquences

Noyau Server possède la route `/mcp`, le registre de capacités, le contexte d'invocation et les
toolkits Effect. Aucun artefact MCP séparé n'est packagé. L'adaptateur Cursor conserve la réponse
du handshake, construit une configuration MCP HTTP et la transmet symétriquement aux trois
branches de création et reprise de Session.

Les tests couvrent le transport HTTP, l'authentification, le scope Project / Thread, l'expiration
et la révocation, les annotations et Schemas des outils, l'idempotence des mutations et les trois
branches ACP. Le protocole MCP peut évoluer en ajoutant des outils, mais chaque mutation reste un
adaptateur d'une commande publique du domaine.

Cette décision n'ajoute pas encore de réservation atomique de Ticket. Plusieurs agents peuvent
donc observer simultanément le même Ticket actionnable ; une politique de claim ou d'assignation
conditionnelle devra faire l'objet d'une décision séparée si Noyau orchestre plusieurs agents en
concurrence.
