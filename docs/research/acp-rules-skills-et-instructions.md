# Rules, skills et instructions autour d’ACP

Date de l’étude : 22 août 2026.

> **Statut : note factuelle.** Sources primaires : ACP v1 vendored par Noyau, snapshots vendored
> de t3code et Effect, spécifications ACP/MCP et documentation officielle Cursor/skills.sh.

## Conclusion

ACP sait attacher un serveur MCP à une Session, mais il ne standardise pas l’injection de
`rules`, de `skills`, d’un system prompt ou de developer instructions. Dans le contrat v1 de
Noyau, `session/new` transporte seulement `cwd` et `mcpServers`; `session/load` ajoute
`sessionId`. `session/prompt` transporte une succession de blocs de contenu qui constitue le
message utilisateur, pas un message d’instructions privilégié
([schema ACP, lignes 3086-3121](../../packages/acp/src/_generated/schema.gen.ts#L3086-L3121),
[lignes 3141-3195](../../packages/acp/src/_generated/schema.gen.ts#L3141-L3195)).

La bonne séparation pour Noyau est donc :

1. **MCP autonome et auto-documenté** pour que les outils restent utilisables sans installation ;
2. **Agent Skill installable** pour enseigner les workflows riches et progressifs ;
3. éventuellement une **rule/`AGENTS.md` du projet** pour les rares obligations qui doivent être
   présentes dans chaque conversation.

Le skill n’est pas transporté « via ACP ». Cursor le découvre sur disque à partir du `cwd` que
Noyau lui fournit. ACP ne fait que démarrer la Session dans le bon WorkspaceRoot et lui attacher
le MCP Noyau.

## Ce que permet réellement ACP

Le schéma vendored est généré depuis ACP `v0.11.3`. Un `McpServer` HTTP contient un nom, une URL et
des headers, puis est passé à `session/new` et `session/load`
([schema ACP, lignes 2774-2837](../../packages/acp/src/_generated/schema.gen.ts#L2774-L2837)). C’est
exactement la surface que Noyau utilise aujourd’hui.

ACP offre trois mécanismes voisins, mais aucun n’est une solution portable d’instructions :

- `session/prompt` peut inclure du texte et du contexte embarqué quand l’Agent annonce cette
  capacité. Cela reste le **message utilisateur** et non un system/developer prompt
  ([schema ACP, lignes 49-86](../../packages/acp/src/_generated/schema.gen.ts#L49-L86)). Préfixer
  chaque Turn polluerait le transcript et donnerait une sémantique erronée aux instructions.
- `_meta` accepte des données d’extension, mais ACP exige que les implémentations ne fassent pas
  d’hypothèse sur leurs clés. Une clé Noyau ne serait utile que si Cursor implémentait explicitement
  la même extension
  ([schema ACP, lignes 3147-3153](../../packages/acp/src/_generated/schema.gen.ts#L3147-L3153),
  [extensibilité ACP officielle](https://agentclientprotocol.com/protocol/v1/extensibility)).
- les extensions JSON-RPC ACP sont possibles et `@noyau/acp` sait les router
  ([client.ts, lignes 235-265](../../packages/acp/src/client.ts#L235-L265)), mais elles nécessitent
  elles aussi un accord bilatéral. Rien dans Cursor ACP ne documente actuellement une extension
  `instructions` ou `skills`.

Les modes ACP ne changent pas ce constat : ils sont annoncés et possédés par l’Agent; le Client
peut sélectionner un mode existant, pas en définir le prompt système
([modes ACP officiels](https://agentclientprotocol.com/protocol/v1/session-modes)).

ACP v2 reste en draft. Sa Session transporte encore principalement `cwd` et les serveurs MCP
([session setup v2](https://agentclientprotocol.com/protocol/v2/session-setup)). Un RFD draft
propose des proxies ACP capables d’intercepter et de préfixer les prompts, précisément parce que
les MCP actuels ne peuvent pas injecter du contexte global persistant. Ce n’est donc ni une
capacité stable ni une fondation adaptée à Noyau v0.1
([RFD « Agent Extensions via ACP Proxies »](https://agentclientprotocol.com/rfds/proxy-chains)).

## Ce que fait t3code

Le chemin Cursor de t3code ne cache aucune couche d’instructions. Il construit seulement la
configuration MCP HTTP avec son bearer
([CursorAdapter.ts, lignes 534-558](../../repos/t3code/apps/server/src/provider/Layers/CursorAdapter.ts#L534-L558)),
puis son runtime la transmet à `session/load` ou `session/new`
([AcpSessionRuntime.ts, lignes 559-564](../../repos/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts#L559-L564),
[lignes 633-642](../../repos/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts#L633-L642)).
Les Turns Cursor restent constitués du texte utilisateur et des pièces jointes
([CursorAdapter.ts, lignes 969-1016](../../repos/t3code/apps/server/src/provider/Layers/CursorAdapter.ts#L969-L1016)).

Quand t3code veut enseigner l’usage de son browser, il le fait uniquement pour Codex par une API
**propre au provider** : il construit des developer instructions qui disent de commencer par
`preview_status`
([CodexDeveloperInstructions.ts, lignes 3-12](../../repos/t3code/apps/server/src/provider/CodexDeveloperInstructions.ts#L3-L12))
et les passe dans `developer_instructions` du Codex app-server
([CodexSessionRuntime.ts, lignes 347-359](../../repos/t3code/apps/server/src/provider/Layers/CodexSessionRuntime.ts#L347-L359)).
Ce mécanisme ne passe pas par ACP et n’a pas d’équivalent utilisé dans l’adaptateur Cursor.

La découverte des skills est elle aussi provider-native : t3code interroge directement
`skills/list` sur le Codex app-server
([CodexProvider.ts, lignes 398-415](../../repos/t3code/apps/server/src/provider/Layers/CodexProvider.ts#L398-L415))
et scanne les répertoires de skills de Claude sur le filesystem
([ClaudeSkills.ts, lignes 87-154](../../repos/t3code/apps/server/src/provider/Drivers/ClaudeSkills.ts#L87-L154)).

## Ce que MCP peut apporter

MCP distingue trois primitives : prompts contrôlés par l’utilisateur, resources contrôlées par
l’application et tools contrôlés par le modèle
([vue d’ensemble MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/index)).
Un prompt ou une resource MCP peut contenir un guide Noyau, mais le protocole ne force pas le
client à l’insérer automatiquement dans le contexte. Ce ne sont donc pas des rules implicites.

La réponse d’initialisation MCP possède aussi un champ standard `instructions`, décrit comme un
indice que le client **peut** ajouter au system prompt
([McpSchema.ts, lignes 685-703](../../repos/effect/packages/effect/src/unstable/ai/McpSchema.ts#L685-L703)).
C’est un bon complément futur, pas une garantie d’application. De plus, l’API Effect actuellement
vendored par Noyau ne permet pas de le configurer dans `McpServer.layerHttp` et son handler
d’initialisation ne le renvoie pas
([McpServer.ts, lignes 1060-1067](../../repos/effect/packages/effect/src/unstable/ai/McpServer.ts#L1060-L1067),
[lignes 1917-1982](../../repos/effect/packages/effect/src/unstable/ai/McpServer.ts#L1917-L1982)).

La base universelle reste donc le contrat des tools eux-mêmes : noms clairs, descriptions
prescriptives, paramètres documentés et résultats qui donnent la prochaine action pertinente.
`noyau_ticket_list` commence déjà dans cette direction
([tools.ts, lignes 48-63](../../apps/server/src/mcp/tools.ts#L48-L63)).

## Skills et rules Cursor

Cursor découvre automatiquement les skills projet dans `.agents/skills/` et `.cursor/skills/`,
ainsi que les skills utilisateur dans `~/.agents/skills/` et `~/.cursor/skills/`. Le frontmatter
`name`/`description` sert à décider quand charger le contenu détaillé; le modèle progressif évite
de remplir chaque contexte avec tout le manuel
([documentation officielle Cursor Skills](https://cursor.com/docs/skills)).

Le CLI open source de skills.sh cible explicitement Cursor et installe par défaut ses skills
projet dans `.agents/skills/`; `-g -a cursor` cible le répertoire utilisateur Cursor. Il accepte
un repository GitHub, un chemin local ou un pack, et sait mettre à jour les installations
([README officiel du CLI](https://github.com/vercel-labs/skills#readme),
[documentation skills.sh](https://skills.sh/docs/cli)).

Pour des consignes toujours présentes, Cursor prend en charge les rules `.cursor/rules/*.mdc` et
les `AGENTS.md` racine ou imbriqués. Les rules peuvent être permanentes, attachées par glob,
sélectionnées par pertinence ou invoquées manuellement
([documentation officielle Cursor Rules](https://cursor.com/docs/rules)). Elles sont adaptées aux
invariants du projet, moins à un tutoriel détaillé sur chaque outil Noyau.

## Recommandation concrète pour Noyau

### Maintenant

- Garder chaque tool utilisable sans prérequis externe. Sa description doit expliquer **quand**
  l’utiliser, les invariants métier et, si nécessaire, l’ordre avec les autres tools.
- Publier d’abord un seul skill `noyau-board`, plutôt qu’une suite prématurée. Il doit enseigner le
  cycle : lire le Tableau, choisir un Ticket actionnable, lier le Thread, mettre à jour le Ticket
  et respecter les dépendances. Il référence les tools MCP par leur nom sans embarquer de token ni
  de configuration d’endpoint.
- Distribuer ce skill depuis un repository/version dédiés via `npx skills add <owner>/<repo>
  --skill noyau-board -a cursor`. Installation projet par défaut; proposer `-g` seulement à
  l’utilisateur qui veut le comportement dans tous ses Projects.
- Ne jamais écrire silencieusement `.agents/skills`, `.cursor/rules` ou `AGENTS.md` dans un
  WorkspaceRoot relié. Une installation depuis Noyau devra être explicite, prévisualisée et
  réversible, car elle modifie le repository de l’utilisateur.

### Ensuite

- Ajouter éventuellement une courte resource ou un tool readonly `noyau_board_guide` pour rendre
  le guide consultable sans installation. Cela améliore la découverte, mais ne remplace pas le
  skill puisque rien ne garantit son chargement automatique.
- Exposer `instructions` dans la couche MCP lorsque l’API Effect le permettra ou après une
  contribution upstream ciblée; tester explicitement si `cursor-agent acp` les place réellement
  dans le contexte avant d’en dépendre.
- Si Noyau ajoute d’autres providers, garder le contenu canonique du skill portable dans
  `.agents/skills` et réserver les adaptateurs d’instructions directes aux providers qui offrent
  une API documentée, comme le fait t3code pour Codex.

### À éviter

- inventer une clé `_meta` ou une extension ACP que Cursor ne comprend pas ;
- préfixer chaque prompt utilisateur avec le manuel Noyau ;
- supposer qu’un prompt/resource MCP est automatiquement chargé ;
- faire des rules Cursor la seule documentation, ce qui enfermerait Noyau dans un provider.
