# Audit des tests Noyau

Audit fichier par fichier de tout le monorepo hors `repos/`. Notation 1–5 selon
l’intérêt **réel** au scale actuel (orchestrateur d'agents local, local-first v0.1) : un test
vaut s’il protège un invariant facile à casser et coûteux, pas s’il photographie
un mapping, un libellé, une préférence booléenne ou un Schema déjà garanti par
TypeScript.

| | Avant | Après (notes 3–5) |
| --- | ---: | ---: |
| Fichiers | 153 (main) | 87 chemins distincts (11 note 5 + 33 note 4 + 43 note 3) |
| Lignes | ~21 900 | ~15 000 |
| Retirés (notes 1–2) | — | 66 fichiers |

Deux fichiers homonymes `undelivered-mandate.test.ts` sont conservés : un côté
Server (injection Provider) et un côté Web (retry Composer). Ce ne sont pas la
même entrée.

Méthode : six subagents de lecture (domain/database/protocol, acp/shared, server,
desktop, web chrome, web métier). Notes conflictuelles relues à la source avant
agrégation.

---

## Note 5 — nécessaires (11 fichiers)

Sans ces tests, une régression corrompt le journal, perd un Project/Ticket/Turn,
casse l’idempotence, ou ouvre une frontière d’auth.

| Fichier | Ce que fait le test | Pourquoi cette note |
| --- | --- | --- |
| `packages/domain/test/project/decider.test.ts` | Décide `project.create` / `rebind` / `meta.update` / `delete` : unicité du WorkspaceRoot, pas de doublon, delete libère le chemin. | Autorité Environment→Project. Un mauvais decider mappe le mauvais dossier. |
| `packages/domain/test/board/decider.test.ts` | Init Tableau (colonnes, identité Done), ranks Kanban, complete/reopen/archive, gate des dépendances ouvertes, DAG (cycle/self/dup), TicketThread, updates partielles. | Autorité Tableau. Ranks, Done, DAG et gardes destructives sont catastrophiques si cassés. |
| `packages/domain/test/thread/decider.test.ts` | Create/archive Thread, un seul Turn actif, settlement session→turn, merge transcript, recovery boot, images hors journal, title seed vs rename. | Invariants Turn/Session/transcript : le runtime agent. |
| `packages/database/test/command-worker.test.ts` | Idempotence des receipts, conflit de `commandId`, sérialisation par agrégat, rollback journal+receipt, TxQueue vide au boot. | Contrat de durabilité ADR-0012. |
| `packages/database/test/projections.test.ts` | Round-trip SQLite : snapshot board, recovery session vs turn terminal, cascade delete, lookup WorkspaceRoot après rebind. | Preuve que l’état survit à un restart. |
| `packages/acp/src/protocol.test.ts` | JSON-RPC/JSONL : ids (y compris `0`), races de terminaison, redaction des secrets, pending requests au exit process. | Fil de fer Cursor. Un bug d’id ou de terminaison bloque ou corrompt la Session. |
| `apps/server/test/control-plane.test.ts` | Dispatch + receipts, validation WorkspaceRoot, create atomique project+board, subscribe snapshot-then-events, persist Turn/Session/`resumeCursor`. | Intégration command→event→projection du Server. |
| `apps/server/test/cursor-acp.test.ts` | Handshake, mapping signaux ACP, `session/load` vs new, attachments/mentions, modes d’approval, cancel/interrupt. | Contrat adaptateur Cursor : reprise et cycle de vie du Turn. |
| `apps/server/test/mcp-session-registry.test.ts` | Bearer MCP scopé au Turn : rotation, TTL, revoke. | Frontière d’auth des tools agent sur le Tableau. |
| `apps/server/test/identity.test.ts` | Acteur configuré, bearer de lancement, refuse missing/malformed/wrong. | Auth loopback RPC. |
| `apps/desktop/src/supervisor.test.ts` | Spawn serveur, fd3 bootstrap, readiness health+RPC, chemin d’entrée packaged vs dev, backoff. | Sans ça le Desktop n’a plus d’autorité enfant, ou laisse un zombie. |

---

## Note 4 — importants (33 fichiers)

Frontières d’intégration ou gardes destructives. Pas le journal, mais un raté
coûte un cwd faux, une suppression non confirmée, ou une connexion perdue.

| Fichier | Ce que fait le test | Pourquoi cette note |
| --- | --- | --- |
| `packages/database/test/sqlite.test.ts` | Migrations (pas d’outbox), pragmas, WAL, rollback transactionnel probe+receipt. | Bootstrap store. Moins « métier » que le worker, mais cassage coûteux. |
| `packages/acp/src/client.test.ts` | Client ACP réel sur stdio : init→session→prompt, replay des notifications, batch Grok, pas de fuite de secrets. | Corrélation d’ids et routing de notifications que le Schema seul ne voit pas. |
| `packages/acp/src/errors.test.ts` | `callRpc` / handlers : cause privée hors message public, codes stables `-32603`. | Empêche de fuiter le fil de fer vers l’UI ou les logs. |
| `apps/server/test/server.test.ts` | Boot + 401/403, routes legacy 404, MCP POST exige token de Turn. | Surface HTTP/MCP. Un mega-case, mais c’est la porte d’entrée. |
| `apps/server/test/mcp-tools.test.ts` | Catalogue MCP + move/link Ticket avec acteur `agent:thread:`. | Mutation réelle du Tableau par les agents. |
| `apps/server/test/file-preview.test.ts` | Caps text/image, refuse binary/dir, jail `../` / symlink / sticky-prefix. | Lecture sandboxée sous WorkspaceRoot. |
| `apps/server/test/agent-skill-installer.test.ts` | Install/inspect/remove skill géré, refuse overwrite et symlink escape. | FS safety ADR-0016, ne pas écraser un skill humain. |
| `apps/server/test/worktree-branch-reactor.test.ts` | Rename de la branche temp `noyau/<hex>` au premier Turn, skip sinon. | Effet git réel, facile à rater. |
| `apps/server/test/thread-title-reactor.test.ts` | Auto-titre au premier Turn, skip si rename humain, régénération transcript. | Reactor qui mute le Thread hors Turn. |
| `apps/server/test/undelivered-mandate.test.ts` | Côté Server : sans `resumeCursor`, réinjecte le mandat (+ images) sur « Reprends », pas de double préfixe. | Sinon le Provider reçoit un prompt vide. Distinct du test Web homonyme. |
| `apps/server/test/git-runtime.test.ts` | Nommage branche temp, flatten worktree, refuse le checkout primaire, parse URL `gh`. | Helpers qui bornent des ops destructives. |
| `apps/server/test/attachments.test.ts` | Parse `data:` sans regex sur le payload ; persist hors journal. | Images hors SQLite, frontière dataUrl. |
| `apps/server/test/workspace-root.test.ts` | Decode + `isAvailable` seulement pour un dossier existant. | Gate avant bind de Project. |
| `apps/server/test/provider-session-reaper.test.ts` | Fauche les runtimes Cursor idle (session `ready` stale) ; épargne Turn `running` et sessions fraîches. | ADR-0018 : un reaper trop zélé tue une Session live. |
| `apps/desktop/src/renderer.test.ts` | URL renderer + **refuse `../` hors root packaged**. | Jail de fichiers servis à l’UI. |
| `apps/desktop/src/open-path.test.ts` | Accepte paths / `file://` ; refuse `https:`, `javascript:`, `data:`. | IPC open-in-finder depuis le renderer. |
| `apps/web/test/app-failure.test.ts` | Taxonomie `normalizeCause` ; defects → incidentId sans leak de cause. | Tous les surfaces d’échec passent par là. |
| `apps/web/test/failure-presentation.test.ts` | Failure → inline/toast/banner/page/silent + dédup + recovery rebind. | Politique UX globale, régression silencieuse. |
| `apps/web/test/project-deletion.test.ts` | Commande delete, prochain Project, route post-delete. | Mauvaise nav = mauvais Tableau après retrait. |
| `apps/web/test/project-delete-confirm.test.tsx` | Delete pas dispatché avant confirm ; copy 0/1/N threads. | Garde destructive. |
| `apps/web/test/ticket-archive-confirm.test.tsx` | Dialog bloque archive ; copy dépendances ; TicketDialog exige confirm. | Archive Ticket sans confirm casse le board. |
| `apps/web/test/thread-archive-confirm.test.tsx` | Même garde côté Thread (dialog + menu sidebar). | Symétrique, même coût. |
| `apps/web/test/worktree-cleanup.test.ts` | Auto-remove seulement si PR merged + idle + opt-in + worktree lié. | Empêche d’effacer un worktree en cours de Turn. |
| `apps/web/test/undelivered-mandate.test.ts` | Côté Web : Session en erreur sans `resumeCursor`, extrait le dernier prompt user pour le Composer. | Retry UI : ne pas perdre le mandat. Distinct du test Server homonyme. |
| `apps/web/test/control-plane-config.test.ts` | RPC/bearer dev ; persist bootstrap desktop ; JSON stale/invalid. | Perdre le bootstrap = plus de WS après strip de query. |
| `apps/web/test/control-plane.test.ts` | Dédup de séquence, snapshot-before-events, warm resume, resubscribe. | Curseur client : drop ou doublon d’événements. |
| `apps/web/test/git-actions.test.ts` | Matrice dirty/ahead/PR/no-remote ; confirm push default branch. | Empêche la mauvaise action git empilée. |
| `apps/web/test/vcs-status.test.ts` | Stream status, gate PR conflicting, match branche Thread↔HEAD. | Mauvais PR / « fix conflicts » sur le mauvais cwd. |
| `apps/web/test/thread-ticket-flow.test.ts` | Ordre `create→update→link` ; pas de link/nav si create échoue. | Orphelin ou TicketThread cassé. |
| `apps/web/test/thread-ticketthread-acceptance.test.ts` | Builders Thread + images + link/unlink + contrat `subscribeThread`. | Commandes qui corrompent Thread/Ticket si le tag est faux. |
| `apps/web/test/board-model.test.ts` | Preview locale : jamais créer dans Done, drag indexes, cycle DAG, open-deps archive. | Miroir client des invariants board, utile avant le round-trip. |
| `apps/web/test/checkout.test.ts` | Lock env après bind, geste delete worktree, `threadEnvMode`, pas de `main` en dur, reuse worktree. | Mauvais mode = mauvais cwd pour Cursor. |
| `apps/web/test/thread-settled.test.ts` | `canSettle` refuse session/turn live ; `effectiveSettled` (override, PR, inactivité) ; auto-settle merge. | Règles Settle : un Thread ne doit pas reculer pendant un Turn. |

---

## Note 3 — utiles, pas vitaux (43 fichiers)

Documentent une règle produit non évidente. On pourrait les amincir ; ils
restent moins chers à garder qu’à redécouvrir.

| Fichier | Ce que fait le test | Pourquoi cette note |
| --- | --- | --- |
| `packages/protocol/test/project-contracts.test.ts` | WorkspaceRoot absolu (POSIX/Win/UNC) vs relatif ; `initialBoard` seulement sur Command enrichie ; status Cursor sans email. | Frontières réelles au milieu de decodes Schema. |
| `packages/protocol/test/ticket-contracts.test.ts` | Request client strip des champs control-plane ; refuse self-dep ; strip legacy `sourceThreadId` / EventCursor ; cap activity. | Gardes de migration v0.1, même si beaucoup de noise union/decode. |
| `packages/protocol/test/thread-contracts.test.ts` | `resumeCursor` version ; unions client vs interne ; dataUrl rejeté sur turn.start enrichi ; mutex title/regenerate. | Sécurité API (leak dataUrl, commandes internes) sous du boilerplate. |
| `packages/acp/src/_internal/stdio.test.ts` | Exit 7 → `AcpProcessExitedError` ; échec status → `AcpTransportError` sans diag privé. | Forme d’erreur non évidente ; petit fichier. |
| `packages/shared/test/composer-trigger.test.ts` | Détection `@` `/` `$` au curseur, quoting path, `replaceTextRange`. | Grammaire Composer, pas un invariant de journal. |
| `packages/shared/test/composer-inline-tokens.test.ts` | Scan mentions/tickets/skills, `@ticket:<uuid>` vs draft, split prompt. | Grammaire mention/ticket ; trop d’asserts d’index mais règle réelle. |
| `packages/shared/test/resume-prompt.test.ts` | `isResumePrompt` vrai pour « Reprends » / « Resume », faux pour un vrai mandat. | Distingue reprise de session et prompt substantiel. |
| `apps/server/test/config.test.ts` | Parité JSON/fd3 ; refuse host bootstrap non-loopback. | Règle de sécu peu visible. |
| `apps/server/test/prompt-blocks.test.ts` | `@file` → resource_link ; `../` reste texte ; `@ticket` connu expansé. | Encodage mentions côté Provider. |
| `apps/server/test/workspace-path-search.test.ts` | Rank contexte, skip `node_modules`, surface `.agents/skills`. | Recherche mention Composer. |
| `apps/server/test/pull-request.test.ts` | Normalise state/mergeability `gh` ; préfère PR ouverte ; cache merged sur default branch. | Sélection PR live pour le badge. |
| `apps/server/test/worktree-home.test.ts` | Canal → `~/.noyau/<channel>/worktree`. | Convention d’emplacement worktree. |
| `apps/server/test/cursor-text-generation.test.ts` | Builders de prompt titre/branche + decode JSON via fake ACP. | Moitié string-check, moitié wiring reactor. |
| `apps/desktop/src/permissions.test.ts` | Allowlist : seulement `clipboard-sanitized-write`. | Gate permissions Electron, pas un test sandbox complet. |
| `apps/desktop/src/preload-bootstrap.test.ts` | Argv channel+version, fail-closed si args manquants. | Mauvais parse = mauvais canal au boot. |
| `apps/desktop/src/desktop-update.test.ts` | Allowlist URL GitHub installer, semver/nightly, refuse `javascript:`. | L’allowlist vaut ; le reste est sélection de release. |
| `apps/desktop/scripts/package-desktop.test.ts` | Artifacts requis, refuse cross-OS, lit `electron-builder.yml` (appId, extraResources). | Footgun de packager un bundle incomplet. |
| `apps/desktop/scripts/collect-release-assets.test.ts` | Filtre noms d’installeurs, copie sans unpacked/stray. | Évite de publier un exe nightly mal nommé. |
| `apps/desktop/scripts/desktop-pack-deps.test.ts` | `electron` jamais bundlé ; `@noyau/*` + `effect` toujours. | Bundler Electron dans main casse le runtime. |
| `apps/desktop/scripts/electron-launcher.test.ts` | displayName/bundleId distincts latest/nightly/dev. | Évite qu’un canal écrase l’install stable. |
| `apps/web/test/composer-tickets.test.ts` | Filtre tickets sans accents ; ouverts avant Done. | Règle picker Composer. |
| `apps/web/test/turn-presentation.test.ts` | Prompt fix-conflicts contient PR/refs ; escape backticks dans `baseRef`. | Évite d’injecter du markdown cassé dans le prompt agent. |
| `apps/web/test/shell-focus.test.ts` | Route → focus `{tableau, thread, sticky, idle}` ; `/` reprend le dernier Project. | Contrat ShellFocus, pas une Command. |
| `apps/web/test/open-path.test.ts` | `openFilesystemPath` passe par le bridge ; échoue sans Desktop. | Frontière hôte mince mais réelle. |
| `apps/web/test/composer-mention-editing.test.ts` | Backspace/flèche traitent `@path` et `@ticket:uuid` comme chips atomiques. | Édition Composer non évidente. |
| `apps/web/test/thread-visits.test.ts` | Parse ISO valides ; `lastVisitedAt` ne recule jamais. | Évite l’inondation de badges « non lus ». |
| `apps/web/test/delayed-subscription-failure.test.tsx` | Échec reconnect masqué 750 ms ; clear si `Connected`. | Debounce UX, évite flicker de bannière. |
| `apps/web/test/thread-transcript-catch-up.test.ts` | Catch-up seulement si snapshot du bon Thread, pas loading, pas draft. | Empêche d’afficher le mauvais transcript. |
| `apps/web/test/composer-drafts.test.ts` | Brouillons isolés par Thread / Project « nouveau Thread » ; parse/serialize local. | Chrome persisté, pas une Command. |
| `apps/web/test/code-fence.test.ts` | Parse fences + citations Cursor `line:line:path`. | Format provider facile à casser. |
| `apps/web/test/composer-prompt-field.test.ts` | contenteditable → `@source` plat ; copie et caret après mention. | Fidélité texte soumis au Provider. |
| `apps/web/test/composer-images.test.ts` | PNG→dataUrl ; refuse SVG ; cap 8 images. | Allowlist avant `thread.turn.start`. |
| `apps/web/test/project-switcher.test.tsx` | Pas d’entrée « Tous les projets » ; select dispatch l’id. | Shell per-Project, pas d’agrégat. |
| `apps/web/test/project-agent-integration-setup.test.tsx` | Install skill avant Terminer ; « Plus tard » skip. | Onboarding ADR-0016. |
| `apps/web/test/cursor-readiness.test.ts` | Ready = installed ∧ handshake ; headlines sans email. | Gate Composer ; le copy est secondaire. |
| `apps/web/test/thread-sidebar-sort.test.ts` | Tri `createdAt` desc, pins d’abord, tie-break pin time. | Ordre sidebar non évident (pas l’activité). |
| `apps/web/test/thread-snapshot.test.ts` | Atom snapshot Thread : replace / lecture. | Stale UI après nav, pas corruption. |
| `apps/web/test/thread-page-title.test.tsx` | Rename inline F2/dblclick ; draft non renommable ; Escape sans dispatch. | Empêche un `thread.meta.update` accidentel. |
| `apps/web/test/board-snapshot.test.ts` | Colonnes / positions / DAG dérivés du `BoardSnapshot`. | Vue dérivée, pas le decider. |
| `apps/web/test/ticket-activity-chip.test.tsx` | Chip Thread jumpable seulement si Thread vivant ; archivé/manquant non cliquable. | Guard de nav morte. |
| `apps/web/test/thread-activity.test.ts` | Working, unseen completion, drop send optimiste, labels transcript. | Présentation des états domain (running/error), pas du chrome. |
| `apps/web/test/markdown-file-links.test.ts` | Rewrite hrefs harden-safe, refuse hors WorkspaceRoot et routes app. | Empêche d’ouvrir le mauvais path. |
| `apps/web/test/thread-transcript.test.ts` | Projection transcript : deltas assistant, tools, permission, lastError vs interrupted. | États live du Turn dans l’UI. |

---

## Retirés (notes 1–2)

66 fichiers. Typologie :

- **Préférences booléennes / catalogues** : appearance, turn-cue-preference, pins, settings-catalog, keybindings, desktop-update-channel, discord-presence-preference, thread-env-mode-preference, auto-remove-merged-worktree-preference, editor-preferences.
- **Chrome / brand / CSS** : theme-wireframe, brand-blobatar, sidebar-brand-*, pierre-icons, page-titlebar, desktop-titlebar, window-chrome, application-menu, theme-schema, release-channel, app-icon, app-palette, thread-turn-minimap, thread-sidebar-item/popover.
- **Schema tautologiques** : `protocol` rpc/editor/git/exports (decode de fixtures construites avec le même Schema, inventaire d’exports v0).
- **Présentation / copy** : tool-call-presentation, ticket-activity (catalogue FR), thread-markdown (KaTeX/tables/Shiki), desktop-update UI, cursor-about, editor-open, discord-presence server, markdown-external-links, turn-cue son.
- **Bridges / helpers triviaux** : project-folder(+dialog), desktop-bridge, clipboard, now-ms, file-preview cache, file-preview-markdown, keyboard-shortcut, composer-path-menu, composer-draft-hook, failure-surfaces, expanded-image-preview, thread-turn-images, thread-transcript-follow-latest, ticket-commands (builders = payload in/out), tableau-first-acceptance (trim + `RPC_METHODS` strings).
- **DOM snapshot** : `thread-ui-rendered.test.tsx` (1537 lignes de « le bouton existe »).
- **Scripts release / PATH OS** : release-version, adhoc-sign-mac, restore-tty, host-path (33 cas de PATH login-shell), observability smoke, agent-skill-catalog snapshot markdown, vcs-status-broadcaster polish.

Ces fichiers ne protégeaient pas un invariant de journal, d’auth, de cwd ou de
garde destructive. Un smoke manuel ou le typechecker suffit au scale actuel.
