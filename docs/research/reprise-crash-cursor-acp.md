# Reprise / crash : Cursor ACP et Agent Client Protocol

Date de l'étude : 19 août 2026.

> Statut : note factuelle pour un ticket de prototype. Pas une spec Noyau. Aucune
> décision produit.

## Question

Quand une session Cursor ACP (`cursor-agent acp` / `agent acp`) ou son processus
parent est interrompu proprement (`session/cancel`) ou brutalement (kill /
rupture stdio), que deviennent :

- le `session/prompt` / stream en vol
- le session ID
- un `tool_call` actif
- un `session/request_permission` pending
- le transcript / l'historique
- un `session/load` ultérieur sur un **nouveau** subprocess avec le même session ID

## Légende

| Marque | Sens |
| ------ | ---- |
| **SPEC** | Dit par ACP v1 officiel ou par les docs Cursor CLI. |
| **OBSERVED-IN-T3CODE** | Comportement de l'adapter t3code (référence adjacente, pas une spec). |
| **UNKNOWN** | Absent des sources primaires consultées. |

## Sources

### SPEC

- [ACP v1 Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)
- [ACP v1 Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- [ACP v1 Schema](https://agentclientprotocol.com/protocol/v1/schema)
- [ACP v1 Tool Calls](https://agentclientprotocol.com/protocol/v1/tool-calls)
- [ACP v1 Transports](https://agentclientprotocol.com/protocol/v1/transports)
- [ACP v1 Overview](https://agentclientprotocol.com/protocol/v1/overview)
- [Announcement : session/resume stabilized](https://agentclientprotocol.com/announcements/session-resume-stabilized) (22 avril 2026)
- [RFD Session Resume](https://agentclientprotocol.com/rfds/session-resume)
- [Cursor CLI ACP](https://cursor.com/docs/cli/acp)
- [Cursor CLI using](https://cursor.com/docs/cli/using)
- [Cursor CLI parameters](https://cursor.com/docs/cli/reference/parameters)

### Schema snapshot dans le repo (SPEC figé, plus vieux que le site v1)

- `repos/t3code/packages/effect-acp/src/_generated/schema.gen.ts` — header :
  `Current ACP schema release: v0.11.3`
- Généré depuis
  `https://github.com/agentclientprotocol/agent-client-protocol/releases/download/v0.11.3/schema.unstable.json`
  (`repos/t3code/packages/effect-acp/scripts/generate.ts`)

### OBSERVED-IN-T3CODE

- `repos/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts`
- `repos/t3code/apps/server/src/provider/acp/AcpRuntimeModel.ts`
- `repos/t3code/apps/server/src/provider/Layers/CursorAdapter.ts`
- `repos/t3code/apps/server/src/provider/acp/CursorAcpSupport.ts`
- `repos/t3code/apps/server/src/provider/acp/AcpJsonRpcConnection.test.ts`
- `repos/t3code/apps/server/src/provider/Layers/CursorAdapter.test.ts`
- `repos/t3code/apps/server/src/provider/Layers/GrokAdapter.test.ts` (même runtime ACP, filtre replay)

---

## Drift de schema (à lire avant le reste)

Le site ACP v1 (consulté le 19 août 2026) et le snapshot t3code **v0.11.3**
ne sont pas alignés.

| Sujet | ACP v1 site (SPEC actuelle) | schema.gen.ts v0.11.3 |
| ----- | --------------------------- | --------------------- |
| `session/resume` | Stabilisé le 22 avril 2026 | Annoté `**UNSTABLE**` |
| `session/close` | Capabilité `sessionCapabilities.close` | Annoté `**UNSTABLE**` |
| `LoadSessionRequest.additionalDirectories` | Documenté, optionnel si capabilité | Absent |
| `ResumeSessionRequest.mcpServers` | Optionnel dans le schema v1 | `optionalKey` |
| `ToolCallStatus` | 4 valeurs (voir §7) | `"pending" \| "in_progress" \| "completed" \| "failed"` |

Les citations « SPEC » ci-dessous précisent quelle surface.

Cursor documente `agent acp`. t3code spawn `cursor-agent acp`
(`CursorAcpSupport.ts`). Les deux sont des entrypoints CLI Cursor ; les docs
officielles n'expliquent pas la différence.

---

## 1. `session/load` vs `session/resume`

### SPEC — `session/load`

Capability top-level : `agentCapabilities.loadSession` (pas
`sessionCapabilities`). Si `false` ou absent, le client **MUST NOT** appeler
`session/load`
([session-setup § Loading Sessions](https://agentclientprotocol.com/protocol/v1/session-setup#loading-sessions)).

Le schema v1 : « Loads an existing session to resume a previous conversation.
[…] The agent should: Restore the session context and conversation history ;
Connect to the specified MCP servers ; Stream the entire conversation history
back to the client via notifications »
([schema § session/load](https://agentclientprotocol.com/protocol/v1/schema)).

Le texte session-setup : « This feature enables persistence across restarts and
sharing sessions between different Client instances. »

Après replay : « The Client can then continue sending prompts as if the session
was never interrupted. »

### SPEC — `session/resume`

Capability : `agentCapabilities.sessionCapabilities.resume`. Si absente, le
client **MUST NOT** appeler `session/resume`
([session-setup § Resuming Sessions](https://agentclientprotocol.com/protocol/v1/session-setup#resuming-sessions)).

« Unlike `session/load`, the Agent **MUST NOT** replay the conversation history
via `session/update` notifications before responding. Instead, it restores the
session context, reconnects to the requested MCP servers, and returns once the
session is ready to continue. »

Annonce du 22 avril 2026 : « a simpler primitive for agents that can restore
context but don't implement full history replay » ; les proxies peuvent
reconstruire `session/load` par-dessus
([session-resume-stabilized](https://agentclientprotocol.com/announcements/session-resume-stabilized)).

RFD : « similar to session/load, except it does not return previous messages »
([RFD](https://agentclientprotocol.com/rfds/session-resume)).

### SPEC — Cursor

Cursor documente uniquement `session/load` : « Create a session with
`session/new` » / « Resume an existing conversation with `session/load` »
([docs CLI ACP](https://cursor.com/docs/cli/acp)).

Cursor ne mentionne pas `session/resume`, `loadSession`, ni
`sessionCapabilities.resume`.

Le CLI interactif a `agent --resume [chatId]`, `agent resume`, `agent ls`
([using](https://cursor.com/docs/cli/using),
[parameters](https://cursor.com/docs/cli/reference/parameters)). Ce n'est pas
documenté comme l'équivalent ACP. **UNKNOWN** si un `sessionId` ACP = un
`chatId` CLI.

### OBSERVED-IN-T3CODE

`AcpSessionRuntime` n'appelle **jamais** `session/resume`. Si
`resumeSessionId` est fourni, il envoie `session/load` avec
`{ sessionId, cwd, mcpServers }`
(`AcpSessionRuntime.ts`, `startOnce`).

`CursorAdapter` persiste `{ schemaVersion: 1, sessionId }` dans
`resumeCursor` et le rejoue au `startSession` suivant via `resumeSessionId`
(`CursorAdapter.ts` `parseCursorResume` / `startSession`).

---

## 2. Ce que `session/load` est spécifié à rejouer

### SPEC

Le replay **MUST** arriver sous forme de notifications `session/update`, « like
`session/prompt` »
([session-setup](https://agentclientprotocol.com/protocol/v1/session-setup#loading-sessions)).

Exemples officiels uniquement :

- `sessionUpdate: "user_message_chunk"`
- `sessionUpdate: "agent_message_chunk"`

Quand **toutes** les « conversation entries » ont été streamées, l'Agent
**MUST** répondre au `session/load` (exemple de result : `null` dans
session-setup ; le schema v1 autorise aussi `configOptions` / `modes`).

Le schema : « Stream the entire conversation history back to the client via
notifications » — pas de liste exhaustive des `sessionUpdate`.

`session/prompt` en live émet aussi `plan`, `tool_call`, `tool_call_update`,
`usage_update` ([prompt-turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)).
« like `session/prompt` » **implique** les mêmes types, mais le spec **ne dit
pas** explicitement que les tool results ou les `session/request_permission`
sont rejoués.

`session/request_permission` est une **request** JSON-RPC bloquante, pas une
notification. Rien dans session-setup / schema ne dit que le load la
réémet.

### OBSERVED-IN-T3CODE

Pendant le gate `session/load`, **toutes** les `session/update` sont
avalées (pas projetées) :

```370:386:repos/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts
    yield* acp.handleSessionUpdate((notification) =>
      Effect.gen(function* () {
        const gate = yield* Ref.get(sessionLoadGateRef);
        if (Option.isSome(gate) && gate.value.active) {
          // ...
          return;
        }
        if (sessionUpdateIsReplay(notification)) {
          return;
        }
```

Après le gate, un `_meta.isReplay === true` est encore ignoré
(`AcpRuntimeModel.ts` `sessionUpdateIsReplay`).

Si le RPC `session/load` reste pending mais le replay devient idle (défaut
2 s, timeout 90 s), t3code **invente** une `LoadSessionResponse` avec
`_meta.t3SessionLoadReady: "replay_idle"`
(`waitForSessionLoadReplayIdle`).

Tests : `AcpJsonRpcConnection.test.ts`
« ignores session/update replay notifications during session/load »,
« completes session/load after replay becomes idle while its RPC stays pending ».
Même filtre côté Grok adapter (`GrokAdapter.test.ts`). **Pas** de test
CursorAdapter dédié au replay `session/load`.

---

## 3. Un tour en vol peut-il être résumé ?

### SPEC

**Non documenté** comme primitive.

- `session/cancel` **termine** le tour : l'Agent **MUST** répondre au
  `session/prompt` avec `stopReason: "cancelled"`. Ensuite : « the Client may
  send another `session/prompt` »
  ([prompt-turn § Cancellation](https://agentclientprotocol.com/protocol/v1/prompt-turn#cancellation)).
- `session/load` / `session/resume` reconnectent une **conversation**, pas un
  tour inachevé. Après load : « continue **sending prompts** ».
- Le RFD vise « once you close your editor […] you can't resume the
  conversation » — pas un prompt RPC en vol.

Ni ACP ni Cursor ne disent qu'un `session/prompt` inachevé reprend après
`session/cancel`, kill, ou `session/load`.

### UNKNOWN

- Si un tour tué à mi-chemin est persisté dans l'historique agent.
- Si `session/load` rejoue un tour partiel (chunks sans `PromptResponse`).
- Si Cursor ACP implémente `loadSession`, et avec quelle durabilité.

---

## 4. Champs publics requis pour `session/load`

### SPEC — session-setup v1

Le client **MUST** envoyer :

1. `sessionId`
2. `mcpServers`
3. `cwd` (chemin absolu)

Exemple officiel :

```json
{
  "method": "session/load",
  "params": {
    "sessionId": "sess_789xyz",
    "cwd": "/home/user/project",
    "mcpServers": []
  }
}
```

`cwd` **MUST** être absolu et **MUST** être le cwd de la session même si le
subprocess est spawn ailleurs
([session-setup § Working Directory](https://agentclientprotocol.com/protocol/v1/session-setup#working-directory)).

### SPEC — schema v1

`LoadSessionRequest` : `sessionId` required, `mcpServers` required, `cwd`
présent (« Must be an absolute path »). `additionalDirectories` optionnel
si `sessionCapabilities.additionalDirectories` ; omis ou `[]` = aucun root
supplémentaire, **pas** une restauration implicite des roots stockés.

`_meta` optionnel.

`LoadSessionResponse` : `_meta`, `configOptions`, `modes` optionnels. Le
texte session-setup montre `result: null`.

### SPEC — schema t3code v0.11.3

```ts
type LoadSessionRequest = {
  readonly _meta?: { readonly [x: string]: unknown } | null;
  readonly cwd: string;
  readonly mcpServers: ReadonlyArray<McpServer>;
  readonly sessionId: string;
};
```

Pas de `additionalDirectories`. `ResumeSessionRequest` : `cwd` + `sessionId`
requis, `mcpServers` optionnel.

### SPEC — Cursor

L'exemple `session/new` envoie `{ cwd, mcpServers: [] }`. Aucun exemple
`session/load`. Aucune liste de champs.

### OBSERVED-IN-T3CODE

Payload réel : `{ sessionId, cwd, mcpServers: options.mcpServers ?? [] }`.
MCP t3 n'est ajouté que si une `McpProviderSession` existe
(`CursorAdapter.ts`).

Préalable : `initialize` (`protocolVersion: 1`) puis `authenticate`
`methodId: "cursor_login"`. t3code ne vérifie **pas**
`agentCapabilities.loadSession` avant d'appeler `session/load`.

---

## 5. `stopReason`

### SPEC — union (schema v1 + schema.gen.ts v0.11.3)

`PromptResponse.stopReason` est **required**.

| Valeur | Sens officiel ([prompt-turn](https://agentclientprotocol.com/protocol/v1/prompt-turn#stop-reasons), [schema § StopReason](https://agentclientprotocol.com/protocol/v1/schema)) |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `end_turn` | « The turn ended successfully » / le modèle finit sans demander d'autres tools. |
| `max_tokens` | Limite de tokens atteinte. |
| `max_turn_requests` | Nombre max de requêtes modèle dans un tour dépassé. |
| `refusal` | L'Agent refuse de continuer. « The user prompt and everything that comes after it won't be included in the next prompt, so this should be reflected in the UI. » |
| `cancelled` | Annulé par `session/cancel`. **MUST** être renvoyé même si l'abort lève une exception interne. |

Pas d'autre `stopReason` dans le schema. Pas de valeur « killed » /
« disconnected » / « crashed ».

### SPEC — Cursor

L'exemple minimal log `result.stopReason`. Pas de liste.

### OBSERVED-IN-T3CODE

`turn.completed.state` = `"cancelled"` ssi `stopReason === "cancelled"`,
sinon `"completed"` (`CursorAdapter.ts`). Un interrupt de la fiber prompt
sans réponse agent est **synthétisé** en `{ stopReason: "cancelled" }`
(`AcpSessionRuntime.ts` `Cause.hasInterruptsOnly`).

---

## 6. Matrice interrupt / crash

Transport : JSON-RPC 2.0, newline-delimited, client → stdin, agent → stdout
([Cursor ACP](https://cursor.com/docs/cli/acp),
[ACP transports](https://agentclientprotocol.com/protocol/v1/transports)).
Le diagramme stdio se termine par « Close stdin, terminate subprocess ».
**Rien** sur un kill, une rupture stdio, ou le sort d'un RPC in-flight.

### 6.1 `session/cancel` (propre, connexion vivante)

| Objet | SPEC | OBSERVED-IN-T3CODE | UNKNOWN |
| ----- | ---- | ------------------ | ------- |
| `session/prompt` / stream | Notification, pas de response. Agent **SHOULD** stopper LLM + tools, envoyer les `session/update` pending, puis **MUST** répondre au prompt avec `cancelled`. Updates **MAY** arriver après cancel, **MUST** avant la `PromptResponse`. | `cancel` interrompt la fiber prompt **et** envoie `session/cancel` (fire-and-forget). Fiber interrompue → `{ stopReason: "cancelled" }` même si l'agent ne répond pas. Test : « releases a fully silent prompt when session/cancel is requested ». | Si Cursor envoie toujours `cancelled` vs une error JSON-RPC. |
| Session ID | Inchangé. Le cancel cible `sessionId`. La session reste utilisable pour un autre `session/prompt`. | Conservé sur `ctx.session.resumeCursor`. | — |
| `tool_call` actif | Agent **SHOULD** abort. Client **SHOULD** marquer les tool calls non finis du tour comme `cancelled`. | Pas de statut `cancelled` projeté : `ToolCallStatus` n'a pas `cancelled` (schema v0.11.3 **et** ToolCallStatus v1 : 4 valeurs pending / in_progress / completed / failed). Le runtime droppe le tool call de sa map seulement si `completed` ou `failed`. | Comment Cursor ACP marque un tool aborté. Incohérence spec : prompt-turn dit `cancelled`, l'enum ToolCallStatus n'a pas cette valeur. |
| `session/request_permission` | Client **MUST** répondre `outcome: "cancelled"` à **toutes** les requests pending. | `interruptTurn` et `stopSessionInternal` font `settlePendingApprovalsAsCancelled` → decision `"cancel"` → `{ outcome: { outcome: "cancelled" } }`. Test CursorAdapter : « cancels pending ACP approvals and marks the turn cancelled ». | — |
| Transcript | Le spec ne dit pas si le tour cancelled entre dans l'historique persisté. | t3code pousse `turn.completed` cancelled. Ne reconstruit pas le transcript agent. | Si Cursor persiste le tour cancelled. |
| `session/load` ensuite | Reconnecte la conversation (si `loadSession`). Pas un resume du tour cancelled. | Nouveau subprocess + `session/load` si `resumeCursor.sessionId` est fourni. Replay ignoré. | Ce que Cursor rejoue après un cancel. |

### 6.2 Kill / rupture stdio (brutal)

| Objet | SPEC | OBSERVED-IN-T3CODE | UNKNOWN |
| ----- | ---- | ------------------ | ------- |
| `session/prompt` / stream | Non défini. La connexion meurt ; aucune `PromptResponse` n'est garantie. Pas de `stopReason` « crashed ». | Scope close → child `SIGTERM` (test « closes the ACP child process when a session stops »). `session.exited` est émis avec `exitKind: "graceful"` même sur stop. Pas de handler dédié « child died mid-prompt » dans `CursorAdapter`. | Si Cursor flush l'état avant SIGKILL / broken pipe. |
| Session ID | L'ID identifie le contexte conversation. `session/load` est le mécanisme « across restarts ». L'ID n'est pas invalidé par la mort du subprocess **dans le texte spec**. | Persisté côté t3 (`resumeCursor.sessionId`). Réutilisé au prochain spawn. | Si Cursor invalide l'ID à la mort du process. Où Cursor stocke l'état (disque local ? compte ?). |
| `tool_call` actif | Non défini. Plus de canal pour `tool_call_update`. | Scope close tue le child ; tools agent meurent avec lui. | Si un tool côté Cursor (shell, edit) survit au process ACP. |
| `session/request_permission` | Request JSON-RPC orpheline. Le spec ne dit que le cas `session/cancel`. | `stopSessionInternal` settle localement en `"cancel"` / answers vides (`cursor/ask_question`) **avant** de fermer le scope. Sur kill externe du child, ces Deferred peuvent rester pendants jusqu'au teardown du scope. | Si Cursor réémet la permission au prochain `session/load`. |
| Transcript | `session/load` « restore […] conversation history » suppose une persistance **côté Agent**, indépendante du stdio. Cursor ne le documente pas pour ACP. | t3code ne persiste pas le transcript ACP ; il ignore le replay et s'appuie sur son propre event log. | Contenu exact persisté par Cursor après un kill mid-turn. |
| `session/load` sur **nouveau** subprocess, même ID | SPEC : initialize → (auth) → `session/load` `{ sessionId, cwd, mcpServers }`. L'agent restaure le contexte, reconnecte les MCP, rejoue l'historique via `session/update`, puis répond. Ensuite : nouveaux `session/prompt`. | Exactement ce flux si `resumeSessionId` est passé. Replay droppé. Si `session/load` error → startup fail (`AcpRequestError`). | Si Cursor ACP advertise `loadSession`. Si un ID issu d'un process tué est loadable. Si le tour inachevé apparaît dans le replay. |

### 6.3 `session/close` (si supporté)

SPEC : équivalent cancel puis free des ressources
([session-setup § Closing](https://agentclientprotocol.com/protocol/v1/session-setup),
[schema § session/close](https://agentclientprotocol.com/protocol/v1/schema)).
Cursor : non documenté. t3code : non appelé par `CursorAdapter`.

---

## 7. Tool calls et permissions (détail)

### SPEC — cycle live

`tool_call` (souvent `pending`) → optionnellement `session/request_permission`
→ `tool_call_update` `in_progress` → `completed` / failed
([prompt-turn](https://agentclientprotocol.com/protocol/v1/prompt-turn),
[tool-calls](https://agentclientprotocol.com/protocol/v1/tool-calls)).

`ToolCallStatus` v1 (4 descriptions) = pending / in_progress / completed /
failed. Identique à schema.gen.ts v0.11.3. Le mot `cancelled` n'est **pas**
dans cette union, malgré l'instruction client de « mark […] as `cancelled` ».

Permission options ACP : `allow_once`, `allow_always`, `reject_once`,
`reject_always`. Outcome : `selected` + `optionId`, ou `cancelled`.

### SPEC — Cursor

Si le client ne répond pas : « tool execution can block »
([docs CLI ACP](https://cursor.com/docs/cli/acp)).

Options documentées par Cursor : `allow-once`, `allow-always`, `reject-once`.
Pas `reject-always`. L'exemple répond
`{ outcome: { outcome: "selected", optionId: "allow-once" } }`.

Extensions Cursor bloquantes : `cursor/ask_question`, `cursor/create_plan`
(l'agent attend une response). Notifications : `cursor/update_todos`,
`cursor/task`, `cursor/generate_image`.

### OBSERVED-IN-T3CODE

`full-access` auto-sélectionne une option allow. Sinon event
`request.opened` + Deferred. `interruptTurn` cancel toutes les approvals
pending **et** les user-input `cursor/ask_question` (answers `{}`).

---

## 8. Ce que fait réellement t3code (pas une spec)

Flux Cursor :

```text
spawn cursor-agent acp
 → initialize + authenticate cursor_login
 → session/load(sessionId, cwd, mcpServers)  si resumeCursor
 → sinon session/new(cwd, mcpServers)
 → session/prompt … session/update …
 → interrupt = session/cancel + settle permissions cancelled
 → stop = Scope.close → SIGTERM child + session.exited graceful
```

Points durs :

1. **Cancel** : interrupt fiber locale **plus** notification agent. Un agent
   silencieux est quand même vu `cancelled`.
2. **Mort process** : teardown = SIGTERM du child. Pas de proto « crash
   resume » au-delà de re-spawn + `session/load`.
3. **Replay `session/load`** : volontairement jeté (gate + `_meta.isReplay`).
   t3code ne reconstruisit pas l'UI depuis le replay ACP.
4. **`session/resume`** : exposé dans `effect-acp` / schema, **non utilisé**
   par `AcpSessionRuntime` / `CursorAdapter`.
5. **Capability `loadSession`** : non lue. Un agent sans load fera échouer
   le start si `resumeSessionId` est posé.
6. **CursorAdapter** n'a pas de test « resume after kill + session/load ».
   Les tests load/replay sont sur le runtime partagé et Grok.

---

## 9. UNKNOWN restants (bloquants pour un proto)

1. Cursor ACP advertise-t-il `loadSession` ? `sessionCapabilities.resume` ?
2. Un `sessionId` survit-il à un kill du process `agent acp` / `cursor-agent acp` ?
3. Où Cursor persiste cet état ? Le `chatId` du CLI interactif est-il le même ID ?
4. `session/load` Cursor rejoue-t-il tool calls / results, ou seulement des
   message chunks ?
5. Un tour inachevé (cancel ou kill) est-il dans ce replay ? Reprend-il ?
6. Un `session/request_permission` pending survit-il à un nouveau subprocess ?
7. Que répond Cursor si `session/load` vise un ID inconnu / d'un autre cwd ?
8. `cwd` différent au load : le spec exige que le cwd du request « matches
   the session's cwd » pour `additionalDirectories` ; comportement Cursor
   si on change de cwd : **UNKNOWN**.
9. Comportement réel de Cursor sur `session/cancel` mid-stream (conforme
   `cancelled` vs error JSON-RPC).
10. Alignement Cursor sur ACP v1 post-v0.11.3 (`session/resume` stable,
    `additionalDirectories`).

Le probe optionnel `CursorAcpCliProbe.test.ts` (`T3_CURSOR_ACP_PROBE=1`)
teste `initialize` / `session/new` sur un binaire réel, **pas** cancel,
kill, ni `session/load`.

---

## 10. OBSERVED — probe Noyau du 19 août 2026

Probe throwaway `/tmp/noyau-acp-crash-probe/probe.mjs` contre `cursor-agent`
`2026.08.11-e8db854` (même build que
[Prototyper l’adaptateur Cursor ACP local](https://github.com/Hezaerd/noyau/issues/67)),
macOS arm64, modèle `composer-2.5[fast=true]`. JSON-RPC ndjson, auth
`cursor_login`. Traces :
`/tmp/noyau-acp-crash-probe/results/run-1787168651548.json` (baseline) et
`/tmp/noyau-acp-crash-probe/results/run-1787168811503.json` (mid-tool).

### Handshake

`initialize` a négocié ACP `protocolVersion: 1` avec
`agentCapabilities.loadSession: true`, `sessionCapabilities: { list: {} }`.
**Pas** de `sessionCapabilities.resume`, **pas** de
`sessionCapabilities.close`. Modes observés : `agent` / `plan` / `ask`.

### Clé publique de reprise

`session/load` a réussi sur un **nouveau** subprocess avec uniquement
`{ sessionId, cwd, mcpServers: [] }`. Réponse observée : `modes`, `models`,
`configOptions` — pas `null`. Le `sessionId` (UUID opaque) a survécu à
`SIGTERM` (exit 143) et à `SIGKILL`.

### Turn complété puis mort du process

Après `stopReason: end_turn`, `SIGTERM`, nouveau subprocess + `session/load` :
replay de `user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`.
Un nouveau `session/prompt` a terminé en `end_turn`.

### `session/cancel` pendant un tool `in_progress`

Prompt `sleep 25` en mode `agent`. Après `tool_call` + `tool_call_update`
`in_progress`, `session/cancel` → `stopReason: cancelled`. Aucun
`tool_call_update` `completed` / `failed`. `session/load` a rejoué le
`user_message_chunk` et les thoughts, **pas** le `tool_call`. Un prompt
suivant a fonctionné (`end_turn`) ; Cursor se souvenait encore de la
requête utilisateur.

### `SIGTERM` / `SIGKILL` pendant un tool `in_progress`

Le `session/prompt` n'a **jamais** reçu de `stopReason` : rupture
(`process exited`). `session/load` a quand même réussi. Replay typique :
user + thoughts, **pas** le tool. Un edit `in_progress` n'a pas écrit le
fichier. Un prompt suivant a fonctionné.

Un premier `SIGKILL` au statut `pending` (avant `in_progress`) n'a rejoué
**aucun** message du tour — seulement `current_mode_update`. La persistance
Cursor d'un tour inachevé est **racey**. Noyau ne peut pas s'appuyer sur le
replay pour reconstruire le Turn interrompu.

### Stream mid-text

`composer-2.5[fast=true]` a souvent fini le texte avant cancel/kill. Ce
scénario n'est pas une preuve d'interruption mid-token. La preuve utile
est le tool `in_progress`.

### UNKNOWN encore ouverts

- `session/load` avec un `cwd` différent ou un ID inconnu.
- Réémission d'un `session/request_permission` au load (non observé en live
  sur ces runs : les tools `sleep` / edit sont passés sans permission
  visible, politique locale Cursor déjà ouverte).
- Équivalence `sessionId` ACP ↔ `chatId` du CLI interactif.
- `session/list` (capabilité annoncée, non exercée).

---

## Ce que cette note n'est pas

Pas une décision Noyau sur outbox, receipts, projections, ou « on wrappe
Cursor comment ». Le flux Noyau reste Command → Decider → SQL ; ACP est un
effet externe. Cette note dit seulement ce que le protocole et Cursor
documentent, et ce que t3code observe côté adapter.
