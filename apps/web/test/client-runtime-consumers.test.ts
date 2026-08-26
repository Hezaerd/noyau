/// <reference types="node" />

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vite-plus/test"

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const WEB_SRC_ROOT = join(TEST_DIRECTORY, "../src")
const REPO_ROOT = join(TEST_DIRECTORY, "../../..")
const CONTROL_PLANE_LIB = "apps/web/src/lib/control-plane.ts"

const sortedStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const result: Array<string> = []
  for (const value of values) {
    const index = result.findIndex((candidate) => value.localeCompare(candidate) <= 0)
    if (index === -1) {
      result.push(value)
    } else {
      result.splice(index, 0, value)
    }
  }
  return result
}

/** Propriétaire cible d'un consommateur inventoried (ADR-0021, roadmap §2). */
export type FutureOwner =
  | "client-runtime"
  | "zustand"
  | "react-local"
  | "composition-hook"
  | "web-adapter"
  | "retire"

export type ClientRuntimeConsumerEntry = {
  readonly path: `apps/web/src/${string}`
  readonly currentRole: string
  readonly futureOwner: FutureOwner
  readonly futureForm: string
}

/**
 * Inventaire Phase 0 — 58 consommateurs applicatifs de control-plane, state/* ou Effect Atom.
 * Autorité d'allocation : docs/roadmaps/client-runtime.md §2 et §4.
 */
export const CLIENT_RUNTIME_CONSUMER_INVENTORY: ReadonlyArray<ClientRuntimeConsumerEntry> = [
  {
    path: "apps/web/src/components/sidebar/ThreadSidebarItem.tsx",
    currentRole: "Row Thread sidebar ; dispatch Command et toggle pin",
    futureOwner: "composition-hook",
    futureForm: "hook de composition (runtime Shell/VCS + Zustand pins)",
  },
  {
    path: "apps/web/src/state/thread-visits.ts",
    currentRole: "Atom persisté des visites Thread",
    futureOwner: "zustand",
    futureForm: "Zustand persisté (visites, phase 9)",
  },
  {
    path: "apps/web/src/state/thread-snapshot.ts",
    currentRole: "Cache Atom ThreadSnapshot par Thread (idle TTL)",
    futureOwner: "client-runtime",
    futureForm: "family subscription Atom (ThreadSnapshot + idle TTL)",
  },
  {
    path: "apps/web/src/state/thread-settle.ts",
    currentRole: "Atom persisté des préférences Settle",
    futureOwner: "zustand",
    futureForm: "Zustand persisté (préférences Settle)",
  },
  {
    path: "apps/web/src/state/thread-pins.ts",
    currentRole: "Atom persisté des pins Thread",
    futureOwner: "zustand",
    futureForm: "Zustand persisté (pins, phase 9)",
  },
  {
    path: "apps/web/src/state/sidebar.ts",
    currentRole: "Atoms dérivés activité, unread, queues et PR sidebar",
    futureOwner: "composition-hook",
    futureForm: "fonction pure + Atom distant + Zustand local",
  },
  {
    path: "apps/web/src/state/shell.ts",
    currentRole: "Projection Shell writable (appliedShell, index, selectors)",
    futureOwner: "client-runtime",
    futureForm: "subscription Atom unique (Shell)",
  },
  {
    path: "apps/web/src/state/preferences.ts",
    currentRole: "Atoms persistés des préférences renderer",
    futureOwner: "zustand",
    futureForm: "Zustand persisté (préférences)",
  },
  {
    path: "apps/web/src/state/persist.ts",
    currentRole: "Helper persistWritableAtom sur Registry",
    futureOwner: "retire",
    futureForm: "remplacé par Zustand persist",
  },
  {
    path: "apps/web/src/state/now.ts",
    currentRole: "Horloge minute keepAlive pour activité sidebar",
    futureOwner: "react-local",
    futureForm: "horloge React locale (plus petit scope utile)",
  },
  {
    path: "apps/web/src/state/keybindings.ts",
    currentRole: "Atoms persistés keybindings et recorder",
    futureOwner: "zustand",
    futureForm: "Zustand persisté (keybindings)",
  },
  {
    path: "apps/web/src/state/desktop-update.ts",
    currentRole: "Atom état mise à jour Desktop et actions bridge",
    futureOwner: "zustand",
    futureForm: "Zustand (actions locales Desktop)",
  },
  {
    path: "apps/web/src/state/composer-drafts.ts",
    currentRole: "Store Atom mémoire des brouillons Composer",
    futureOwner: "zustand",
    futureForm: "Zustand mémoire (brouillons Composer)",
  },
  {
    path: "apps/web/src/state/board.ts",
    currentRole: "Subscription Project ref-countée et writers Tableau",
    futureOwner: "client-runtime",
    futureForm: "family subscription Atom (Tableau par Project)",
  },
  {
    path: "apps/web/src/state/atom-registry.ts",
    currentRole: "Registry React singleton et reset test",
    futureOwner: "web-adapter",
    futureForm: "Registry React possédé par l'app",
  },
  {
    path: "apps/web/src/pages/ThreadPage.tsx",
    currentRole: "Orchestration subscribeThread, live paint et rendu Thread",
    futureOwner: "client-runtime",
    futureForm: "family Thread + projection volatile live",
  },
  {
    path: "apps/web/src/main.tsx",
    currentRole: "Boot : Registry provider et initializers state/*",
    futureOwner: "web-adapter",
    futureForm: "composition web-adapter + init Zustand",
  },
  {
    path: "apps/web/src/lib/thread-settle-actions.ts",
    currentRole: "Dispatch Command settle/unsettle Thread",
    futureOwner: "client-runtime",
    futureForm: "Command runner",
  },
  {
    path: "apps/web/src/lib/file-preview.ts",
    currentRole: "Cache module previewFile (control-plane query)",
    futureOwner: "client-runtime",
    futureForm: "query Atom (preview fichier)",
  },
  {
    path: "apps/web/src/hooks/use-vcs-status.ts",
    currentRole: "Subscription VCS par scope (useEffect + useState)",
    futureOwner: "client-runtime",
    futureForm: "subscription Atom (VCS par VcsScope)",
  },
  {
    path: "apps/web/src/hooks/use-turn-cue.ts",
    currentRole: "Lecture préférence turn cue via Atom",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-transcript-paint-preference.ts",
    currentRole: "Lecture mode peinture transcript via Atom",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-thread-visits.ts",
    currentRole: "Lecture visites Thread via Atom family",
    futureOwner: "zustand",
    futureForm: "selector Zustand (visites, phase 9)",
  },
  {
    path: "apps/web/src/hooks/use-thread-snapshot.ts",
    currentRole: "Lecture ThreadSnapshot via Atom family",
    futureOwner: "client-runtime",
    futureForm: "hook runtime (ThreadSnapshot family)",
  },
  {
    path: "apps/web/src/hooks/use-thread-settle-preference.ts",
    currentRole: "Lecture préférences Settle via Atom",
    futureOwner: "zustand",
    futureForm: "selector Zustand (Settle prefs)",
  },
  {
    path: "apps/web/src/hooks/use-thread-pins.ts",
    currentRole: "Lecture pins Thread via Atom family",
    futureOwner: "zustand",
    futureForm: "selector Zustand (pins, phase 9)",
  },
  {
    path: "apps/web/src/hooks/use-thread-env-mode-preference.ts",
    currentRole: "Lecture préférence threadEnvMode via Atom",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-thread-change-requests.ts",
    currentRole: "Subscription VCS multi-scope et écriture PR sidebar",
    futureOwner: "client-runtime",
    futureForm: "subscription Atom (VCS) ; sidebar PR via composition",
  },
  {
    path: "apps/web/src/hooks/use-sidebar-queues.ts",
    currentRole: "Lecture queues Classés / unread dérivées sidebar",
    futureOwner: "composition-hook",
    futureForm: "hook de composition (queues)",
  },
  {
    path: "apps/web/src/hooks/use-shell-focus-reporter.ts",
    currentRole: "Report focus Shell via setShellFocus",
    futureOwner: "client-runtime",
    futureForm: "Command runner (setShellFocus)",
  },
  {
    path: "apps/web/src/hooks/use-settings-tab-restore.ts",
    currentRole: "Restauration onglet Settings depuis atoms persistés",
    futureOwner: "zustand",
    futureForm: "selectors Zustand (préférences + keybindings)",
  },
  {
    path: "apps/web/src/hooks/use-settings-escape.ts",
    currentRole: "Escape Settings bloqué si recorder actif",
    futureOwner: "zustand",
    futureForm: "selector Zustand (keybindings recorder)",
  },
  {
    path: "apps/web/src/hooks/use-project-folder-start-directory.ts",
    currentRole: "Lecture répertoire départ dossier Project",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-project-board.ts",
    currentRole: "retainProjectBoard + lecture snapshot/status Tableau",
    futureOwner: "client-runtime",
    futureForm: "hook runtime (family Tableau Project)",
  },
  {
    path: "apps/web/src/hooks/use-now-minute.ts",
    currentRole: "Lecture horloge minute via Atom",
    futureOwner: "react-local",
    futureForm: "hook React local (horloge minute)",
  },
  {
    path: "apps/web/src/hooks/use-keybindings.ts",
    currentRole: "Lecture/écriture keybindings via Atoms",
    futureOwner: "zustand",
    futureForm: "store Zustand (keybindings)",
  },
  {
    path: "apps/web/src/hooks/use-control-plane.ts",
    currentRole: "Hooks lecture Shell (projects, threads, cursor, status)",
    futureOwner: "client-runtime",
    futureForm: "hooks runtime (Shell subscription)",
  },
  {
    path: "apps/web/src/hooks/use-discord-presence-enabled.ts",
    currentRole: "Lecture préférence Discord presence",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-composer-draft.ts",
    currentRole: "Lecture/écriture brouillon Composer via Atom",
    futureOwner: "zustand",
    futureForm: "store Zustand mémoire (brouillon)",
  },
  {
    path: "apps/web/src/hooks/use-desktop-update.ts",
    currentRole: "Lecture état mise à jour Desktop via Atom",
    futureOwner: "zustand",
    futureForm: "store Zustand (Desktop UI)",
  },
  {
    path: "apps/web/src/hooks/use-auto-remove-merged-worktree.ts",
    currentRole: "Lecture préférence auto-remove worktree fusionné",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-desktop-update-channel.ts",
    currentRole: "Lecture/écriture canal mise à jour Desktop",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/hooks/use-delayed-subscription-failure.ts",
    currentRole: "Présentation retardée échec subscription Reconnecting",
    futureOwner: "web-adapter",
    futureForm: "hook web sur statut runtime (phase sync)",
  },
  {
    path: "apps/web/src/hooks/use-appearance.ts",
    currentRole: "Lecture/écriture préférence appearance",
    futureOwner: "zustand",
    futureForm: "selector Zustand (préférences)",
  },
  {
    path: "apps/web/src/components/thread/ThreadTurnImages.tsx",
    currentRole: "Preview attachments images via previewAttachment",
    futureOwner: "client-runtime",
    futureForm: "query Atom (preview attachment)",
  },
  {
    path: "apps/web/src/components/thread/ThreadTurnDiffPanel.tsx",
    currentRole: "Affichage TurnDiff via getTurnDiff",
    futureOwner: "client-runtime",
    futureForm: "query Atom (TurnDiff)",
  },
  {
    path: "apps/web/src/components/thread/ThreadHeaderActions.tsx",
    currentRole: "Actions header Thread ; keybindings matches",
    futureOwner: "zustand",
    futureForm: "consommateur Zustand keybindings (composant React)",
  },
  {
    path: "apps/web/src/components/thread/ThreadCheckoutBar.tsx",
    currentRole: "Barre checkout ; dispatch Command et VCS",
    futureOwner: "client-runtime",
    futureForm: "Command runner + subscription VCS",
  },
  {
    path: "apps/web/src/components/thread/OpenInPicker.tsx",
    currentRole: "listEditors / openInEditor",
    futureOwner: "client-runtime",
    futureForm: "query Atom + Command runner (éditeurs)",
  },
  {
    path: "apps/web/src/components/thread/GitActionsControl.tsx",
    currentRole: "Actions Git stacked (commit, push, PR)",
    futureOwner: "client-runtime",
    futureForm: "Command runner (Git)",
  },
  {
    path: "apps/web/src/components/settings/ProjectAgentIntegrationSettings.tsx",
    currentRole: "Inspection et installation intégration agent Project",
    futureOwner: "client-runtime",
    futureForm: "query Atom + Command runner (agent integration)",
  },
  {
    path: "apps/web/src/components/settings/GeneralSettingsPanel.tsx",
    currentRole: "Panneau Settings généraux (préférences + Settle)",
    futureOwner: "zustand",
    futureForm: "actions/selectors Zustand (préférences + Settle)",
  },
  {
    path: "apps/web/src/components/settings/AppearanceSettingsPanel.tsx",
    currentRole: "Panneau appearance et transcript paint",
    futureOwner: "zustand",
    futureForm: "actions Zustand (préférences appearance)",
  },
  {
    path: "apps/web/src/components/control-plane-context.tsx",
    currentRole: "Provider unique subscribeShell et boot splash",
    futureOwner: "client-runtime",
    futureForm: "subscription Atom unique (Shell)",
  },
  {
    path: "apps/web/src/components/ProjectAgentIntegrationSetup.tsx",
    currentRole: "Installation intégration agent (installProjectAgentIntegration)",
    futureOwner: "client-runtime",
    futureForm: "Command runner (agent integration)",
  },
  {
    path: "apps/web/src/components/WorkspaceBreadcrumb.tsx",
    currentRole: "Fil d'Ariane ; dispatch Command, pins et keybindings",
    futureOwner: "composition-hook",
    futureForm: "hook de composition (runtime + Zustand)",
  },
  {
    path: "apps/web/src/components/AppSidebar.tsx",
    currentRole: "Sidebar principale ; Shell hooks et dispatch Project",
    futureOwner: "composition-hook",
    futureForm: "hook de composition (Shell runtime + Command)",
  },
  {
    path: "apps/web/src/components/AppPalette.tsx",
    currentRole: "Palette commandes ; matches keybindings",
    futureOwner: "zustand",
    futureForm: "consommateur Zustand keybindings (composant React)",
  },
] as const

/** Contrat cible — une seule subscription Shell vivante pour toute l'application. */
export const SHELL_SUBSCRIPTION_BUDGET = 1

/**
 * Contrat cible — au plus une subscription Project retenue par Project actif.
 * Actuel : `retainProjectBoard` ref-count dans state/board.ts (conforme au budget).
 */
export const ONE_SUBSCRIPTION_PER_RETAINED_PROJECT = 1

/**
 * Contrat cible — au plus une subscription Thread retenue par Thread chaud.
 * Dette actuelle : ThreadPage possède subscribeThread directement ; future family idle TTL.
 */
export const ONE_SUBSCRIPTION_PER_RETAINED_THREAD = 1

/**
 * Contrat cible — zéro écriture Atom/projection après disposal d'une ressource.
 * Actuel : board.ts garde applyBoardSnapshotIfCurrent (conforme) ;
 * ThreadPage écrit encore depuis callbacks stream (dette documentée).
 */
export const WRITES_AFTER_DISPOSAL = 0

const CONSUMER_IMPORT_PATTERN =
  /@\/lib\/control-plane|@\/state\/|effect\/unstable\/reactivity|@effect\/atom-react/

const listSourceFiles = (directory: string): ReadonlyArray<string> => {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: Array<string> = []
  for (const entry of entries) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolute))
      continue
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(absolute)
    }
  }
  return files
}

/** Parcourt apps/web/src et retourne les chemins relatifs repo des consommateurs Atom/control-plane. */
export const scanClientRuntimeConsumers = (): ReadonlyArray<string> => {
  const files = listSourceFiles(WEB_SRC_ROOT)
  const matches: Array<string> = []
  for (const absolute of files) {
    const source = readFileSync(absolute, "utf8")
    if (!CONSUMER_IMPORT_PATTERN.test(source)) {
      continue
    }
    matches.push(relative(REPO_ROOT, absolute).replaceAll("\\", "/"))
  }
  return sortedStrings(matches)
}

const countCallSites = (
  call: "subscribeShell(" | "subscribeProject(" | "subscribeThread(",
  excludePath: string,
): ReadonlyArray<string> => {
  const files = listSourceFiles(WEB_SRC_ROOT)
  const hits: Array<string> = []
  for (const absolute of files) {
    const relativePath = relative(REPO_ROOT, absolute).replaceAll("\\", "/")
    if (relativePath === excludePath) {
      continue
    }
    const source = readFileSync(absolute, "utf8")
    const count = source.split(call).length - 1
    if (count > 0) {
      hits.push(relativePath)
    }
  }
  return sortedStrings(hits)
}

describe("client-runtime consumer inventory (phase 0)", () => {
  it("lists exactly 58 unique consumer paths", () => {
    const paths = CLIENT_RUNTIME_CONSUMER_INVENTORY.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(58)
    expect(paths).toHaveLength(58)
  })

  it("maps every inventoried path to an existing file", () => {
    for (const entry of CLIENT_RUNTIME_CONSUMER_INVENTORY) {
      expect(existsSync(join(REPO_ROOT, entry.path)), entry.path).toBe(true)
    }
  })

  it("matches the filesystem scan of apps/web/src consumers", () => {
    const scanned = scanClientRuntimeConsumers()
    const inventoried = sortedStrings(CLIENT_RUNTIME_CONSUMER_INVENTORY.map((entry) => entry.path))
    expect(scanned).toEqual(inventoried)
    expect(scanned).toHaveLength(58)
  })

  it("assigns a future owner to every entry", () => {
    for (const entry of CLIENT_RUNTIME_CONSUMER_INVENTORY) {
      expect(entry.currentRole.length).toBeGreaterThan(0)
      expect(entry.futureForm.length).toBeGreaterThan(0)
      expect([
        "client-runtime",
        "zustand",
        "react-local",
        "composition-hook",
        "web-adapter",
        "retire",
      ] as const).toContain(entry.futureOwner)
    }
  })
})

describe("client-runtime migration thresholds (target contract)", () => {
  it("fixes the Shell subscription budget at one", () => {
    expect(SHELL_SUBSCRIPTION_BUDGET).toBe(1)
  })

  it("fixes one subscription per retained Project", () => {
    expect(ONE_SUBSCRIPTION_PER_RETAINED_PROJECT).toBe(1)
  })

  it("fixes one subscription per retained Thread", () => {
    expect(ONE_SUBSCRIPTION_PER_RETAINED_THREAD).toBe(1)
  })

  it("requires zero writes after resource disposal", () => {
    expect(WRITES_AFTER_DISPOSAL).toBe(0)
  })

  it("documents board generation guard as current WRITES_AFTER_DISPOSAL protection", () => {
    const boardSource = readFileSync(join(REPO_ROOT, "apps/web/src/state/board.ts"), "utf8")
    expect(boardSource).toContain("applyBoardSnapshotIfCurrent")
    expect(boardSource).toContain("writer.generation !== generation")
  })

  it("documents ThreadPage stream callbacks as current WRITES_AFTER_DISPOSAL debt", () => {
    const threadPageSource = readFileSync(
      join(REPO_ROOT, "apps/web/src/pages/ThreadPage.tsx"),
      "utf8",
    )
    expect(threadPageSource).toContain("subscribeThread(")
    expect(threadPageSource).toContain("reduceThreadSnapshotEnvelope")
  })
})

describe("client-runtime subscription call sites (current baseline)", () => {
  it("calls subscribeShell in exactly one production file besides control-plane.ts", () => {
    expect(countCallSites("subscribeShell(", CONTROL_PLANE_LIB)).toEqual([
      "apps/web/src/components/control-plane-context.tsx",
    ])
  })

  it("calls subscribeProject in exactly one production file besides control-plane.ts", () => {
    expect(countCallSites("subscribeProject(", CONTROL_PLANE_LIB)).toEqual([
      "apps/web/src/state/board.ts",
    ])
  })

  it("calls subscribeThread in exactly one production file besides control-plane.ts", () => {
    expect(countCallSites("subscribeThread(", CONTROL_PLANE_LIB)).toEqual([
      "apps/web/src/pages/ThreadPage.tsx",
    ])
  })
})
