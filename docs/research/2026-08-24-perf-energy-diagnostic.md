# Diagnostic performances & énergie — Noyau (Nightly)

Date : 2026-08-24  
Contexte : macOS classe **Noyau (Nightly)** en « Haute consommation d'énergie » (batterie branchée, mode Économie d'énergie).  
Méthode : audit code (`apps/`, `packages/`), React Doctor `0.9.12` sur `apps/web`, lecture Electron/server.

Artefacts :

- Rapport React Doctor JSON : [`react-doctor-apps-web.json`](./react-doctor-apps-web.json)
- Note outil React Doctor : [`2026-08-24-react-doctor.md`](./2026-08-24-react-doctor.md)

## Verdict

La cause **idle** la plus crédible pour le badge macOS est le **suivi de regard du Blobatar** : boucle `requestAnimationFrame` permanente + **IPC Electron à chaque frame** (`getCursorPoint`). C’est monté en permanence dans la sidebar.

Les coûts **actifs** (turn Cursor en cours) sont dominés par le pipeline **chunk ACP → commande SQLite → event → WS → setState → Streamdown**, sans batching ni virtualisation réelle du transcript.

React Doctor confirme des smells React (15 Performance, 30 Bugs, 4 errors) mais **ne détecte pas** la boucle rAF/IPC — c’est hors de son modèle « anti-pattern React ».

Score React Doctor (sans télémetrie / score API) : **190 diagnostics** sur 63 fichiers — 4 errors, 186 warnings.

| Catégorie | Count |
| --------- | ----: |
| Maintainability | 140 |
| Bugs | 30 |
| Performance | 15 |
| Accessibility | 4 |
| Security | 1 |

## P0 — Impact énergie idle (corriger en premier)

### 1. Brand gaze : rAF 60 Hz + IPC main process

**Preuve**

```37:70:apps/web/src/hooks/use-brand-gaze.ts
    const tick = () => {
      // ...
      if (pollDesktop && !inFlight) {
        inFlight = true
        void desktop
          .getCursorPoint()
          .then(/* ... */)
          .finally(() => {
            inFlight = false
          })
      }
      current = lerpGaze(current, target, GAZE_LERP)
      applyGazeToEyes(eyes(), current)
      raf = requestAnimationFrame(tick)
    }
    // ...
    raf = requestAnimationFrame(tick)
```

- Monté via `SidebarBrandTitlebar` → `AppSidebar` / `SettingsSidebar` (toujours présent dans `RootLayout`).
- Desktop expose `ipcRenderer.invoke(GET_CURSOR_POINT_CHANNEL)` → main lit `screen.getCursorScreenPoint()` + bounds fenêtre.
- **Aucune pause** sur `document.hidden`, fenêtre blur, pointeur au repos, ou distance gaze ≈ rest.
- `querySelectorAll(".mo-eye")` à **chaque frame**.

**Pourquoi macOS flag** : wakeups CPU + IPC cross-process continus, même app idle / écran allumé.

**Fix recommandé**

1. Event-driven : `pointermove` côté renderer (déjà le path non-desktop) ; côté desktop, listener main throttlé (~30–60 ms) ou `setInterval` 50–100 ms **seulement** si fenêtre focused.
2. Stopper le rAF quand `|current - target|` < epsilon **et** pas de mouvement récent.
3. Pause sur `visibilitychange` / `blur` / `prefers-reduced-motion` (déjà partiel).
4. Cache des nœuds `.mo-eye` hors de la boucle.

**Effort** : S · **Gain énergie** : très élevé (idle).

---

## P1 — Coûts actifs / structurels

### 2. Chaque chunk assistant = write path complet + re-render Streamdown

**Preuve**

```787:798:apps/server/src/provider/cursor-acp.ts
      case "agent_message_chunk": {
        if (update.content.type === "text" && update.content.text.length > 0) {
          yield* control.emit({
            _tag: "transcript",
            item: {
              _tag: "transcript.assistant",
              // ...
              text: update.content.text,
            },
          })
        }
```

→ `thread.transcript.append` (reactor) → journal SQLite → projection → stream client → `ThreadPage` `setSnapshot` + `writeThreadSnapshotCache` **à chaque chunk** → `ThreadMarkdown` / Streamdown en `mode="streaming"`.

Pas de batching / coalescing côté provider. Pas de virtualisation liste (seulement `content-visibility: auto` sur items).

**Fix recommandé**

- Coalesce chunks (ex. 32–50 ms ou N caractères) avant `dispatchInternal`.
- Isoler le dernier message assistant (`memo` + state local streaming) pour ne pas re-render tout le transcript.
- Évaluer virtualisation réelle pour longs threads (ticket « Ameliorer performances changement thread »).

**Effort** : M–L · **Gain** : élevé pendant turns.

### 3. Context shell monolithique → fan-out de re-renders

`ControlPlaneProvider` met `shell` entier + `threads` + `projects` dans un seul context. Tout `thread-upserted` (fréquent pendant un turn : status session, latestTurn…) re-render **tous** les `useControlPlane()` :

- `AppSidebar`, `RootLayout` (plusieurs hooks), `AppPalette`, `HomePage`, `ThreadPage`, settings, etc.

**Fix** : splitter context (projects / threads / cursor / status) ou store externe avec sélecteurs ; au minimum `useSyncExternalStore` + slices.

### 4. Double `subscribeProject`

- `BoardPage` : `subscribeProject` pour le kanban.
- `useProjectComposerTickets` (ThreadPage) : **deuxième** `subscribeProject` + `loadBoardSnapshot` sur **chaque** event.

Sur Thread, chaque mutation board (ou bruit stream) refetch snapshot board entier pour les mentions composer.

**Fix** : cache / store board partagé, ou endpoint léger « tickets pour composer », ou réutiliser snapshot déjà en mémoire.

### 5. Polling VCS × scopes worktrees

`VcsStatusBroadcaster` : `Effect.forever` + sleep **30 s**, `git.status(..., { includePr: true })` (gh).

`useThreadChangeRequests` ouvre **un** `subscribeVcsStatus` **par scope** (workspace + chaque worktree distinct) pour le projet sélectionné.

Coût idle modéré (30 s), mais spikes CPU/IO + réseau gh ; multiplié par worktrees.

**Fix** : `includePr` moins souvent ; fs watch / `git` léger entre refreshes PR ; partager un poller côté client.

### 6. Electron : pas de `backgroundThrottling` explicite

`BrowserWindow` dans `apps/desktop/src/main.ts` ne configure ni `backgroundThrottling` ni `powerSaveBlocker`. Avec le rAF gaze, le renderer reste « chaud ». Après fix gaze, vérifier le throttle quand la fenêtre est occluse.

Process tree Nightly = Desktop + Server Node (supervisor) : Activity Monitor / batterie attribuent souvent le tout au parent « Noyau (Nightly) ».

---

## P2 — Timers UI / micro-perf React Doctor

### Timers 1 Hz

| Site | Comportement |
| ---- | ------------ |
| `ThreadSidebarStatus` / `ThreadWorkingDuration` | `setInterval` + `setState` **chaque seconde** par thread « working » → re-render item sidebar |
| `ThreadTurnProgress` / `WorkingTimer` | `setInterval` mais mute `textContent` (meilleur) |

**Fix** : même pattern DOM-only que `WorkingTimer` dans la sidebar.

### React Doctor — Performance (15)

| Rule | Fichiers notables | Sévérité énergie |
| ---- | ----------------- | ---------------- |
| `no-flush-sync` | `paint-composer-prompt.tsx` | Moyenne (jank input) |
| `no-permanent-will-change` | `switch.tsx`, `menu.tsx`, `context-menu.tsx` | Faible (GPU) |
| `rerender-state-only-in-handlers` | `AppSidebar`, `ThreadTurnImages` | Faible |
| `rerender-lazy-ref-init` | `use-shell-focus-reporter.ts` | Faible |
| `js-combine-iterations` | Board / composer | Négligeable |
| `no-create-object-url-without-revoke` | composer images | Mémoire (pas CPU idle) |
| `js-hoist-intl` | `ticket-activity.ts` | Négligeable |

### React Doctor — Bugs à traiter (qualité / re-renders)

- **4× error** `no-ref-current-in-render` : `ComposerPromptField.tsx`, `use-turn-settlement-cue.ts`
- `prefer-use-effect-event` : `AppPalette`, `TicketDialog` (re-subscribe inutiles)
- `no-pass-*-to-parent` : extra render `ThreadCheckoutBar`
- Giant components (warn) : `BoardPage` ~1542 LOC, `TicketDialog` ~749, `ThreadPage` ~728, `AppPalette` ~389

### Maintainability (140)

Surtout `unused-export` (111) + `only-export-components` — bruit pour l’énergie, utile pour hygiène.

---

## Cartographie « qui brûle quoi »

```text
IDLE (badge batterie macOS)
├── [P0] useBrandGaze rAF + IPC ─────────── wakeups continus
├── [P1] Server Node (supervisor) ───────── présent tant que Desktop tourne
├── [P1] VCS poll 30s / scope ───────────── spikes périodiques
└── [P2] Timers 1s threads working ─────── seulement si turns actifs

ACTIF (turn Cursor)
├── [P1] chunk → SQLite → WS → React
├── [P1] Streamdown streaming reparse
├── [P1] shell thread-upserted → sidebar fan-out
└── [P2] flushSync composer / markdown plugins
```

## Plan d’attaque proposé

| Ordre | Ticket / chantier | Objectif |
| ----: | ----------------- | -------- |
| 1 | Fix brand gaze (pause + throttle IPC) | Faire disparaître « Haute conso » idle |
| 2 | Batch transcript append + isolat streaming bubble | Couper CPU pendant turns |
| 3 | Split control-plane context / sélecteurs | Moins de rerenders sidebar |
| 4 | Dédup `subscribeProject` / board store | Moins de IO board sur Thread |
| 5 | Sidebar timers DOM-only + VCS refresh PR découplé | Polish idle |
| 6 | React Doctor errors + `flushSync` | Qualité / jank |
| 7 | Virtualisation / perf switch thread | Tickets backlog existants |

Tickets Noyau déjà proches : « React Doctor pour analyser les performances », « Ameliorer performances demarage », « Ameliorer performances changement thread ».

## Comment rejouer

```bash
# Scan statique
bunx --bun react-doctor@latest ./apps/web -y --no-telemetry --no-supply-chain \
  --json --json-out docs/research/react-doctor-apps-web.json

# Trace runtime (app web/desktop joignable)
bunx --bun react-doctor@latest scan http://127.0.0.1:<port> --no-telemetry
```

Mesure manuelle post-fix gaze : Activity Monitor → Énergie / wakeups sur « Noyau (Nightly) » fenêtre au premier plan **sans** turn actif — doit chuter nettement.

## Limites de ce diagnostic

- Pas de sample Instruments / `powermetrics` live sur ta machine.
- Pas de trace React Doctor `scan` interactive (nécessite app up + Chrome).
- Les sous-processus `cursor-agent` peuvent aussi peser ; macOS les rattache parfois au parent Nightly — à confirmer dans Activity Monitor (enfants vs renderer).
