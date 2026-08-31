import type { ThreadId } from "@noyau/contracts/ids"

import { browserWorkspaceTab } from "@/components/workspace-panel/browser-tab"
import { normalizeBrowserUrl } from "@/lib/browser-url"
import { openWorkspaceTabWith, patchWorkspaceTabPayload } from "@/state/workspace-panel"

export {
  ensureWorkspaceBrowserSession,
  navigateWorkspaceBrowser,
  previewCommittedUrl,
  releaseRemovedWorkspaceBrowserSessions,
  releaseWorkspaceBrowserSession,
  resetWorkspaceBrowserBindingsForTests,
} from "@/lib/workspace-browser-session"

/** Ouvre un onglet Browser. `url` est normalisée ; une valeur invalide laisse l’onglet vide. */
export const openWorkspaceBrowser = (threadId: ThreadId, url?: string): string => {
  const tabId = openWorkspaceTabWith(threadId, browserWorkspaceTab, undefined)
  if (url === undefined) {
    return tabId
  }
  const normalized = normalizeBrowserUrl(url)
  if (normalized !== null) {
    patchWorkspaceTabPayload(threadId, tabId, { url: normalized })
  }
  return tabId
}
