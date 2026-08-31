import type { PreviewTabId, ThreadId } from "@noyau/contracts/ids"
import type { PreviewNavStatus, PreviewSessionSnapshot } from "@noyau/contracts/preview"

import { isMissingPreviewTab } from "@/lib/app-failure"
import { browserTabUrl } from "@/lib/browser-url"
import {
  previewClose,
  previewNavigate,
  previewOpen,
  type ControlPlaneResult,
} from "@/lib/control-plane"
import type { WorkspaceTab } from "@/lib/workspace-panel"
import { getWorkspacePanel, patchWorkspaceTabPayload } from "@/state/workspace-panel"

const BROWSER_KIND = "browser"

const bindingKey = (threadId: ThreadId, tabId: string): string => `${threadId}:${tabId}`

const bindings = new Map<string, PreviewTabId>()
const tails = new Map<string, Promise<unknown>>()

const enqueue = <A>(key: string, task: () => Promise<A>): Promise<A> => {
  const run = (tails.get(key) ?? Promise.resolve()).then(task, task)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  tails.set(key, tail)
  return run.finally(() => {
    if (tails.get(key) === tail) {
      tails.delete(key)
    }
  })
}

export const previewCommittedUrl = (status: PreviewNavStatus): string | null =>
  status._tag === "Idle" ? null : status.url

const applySnapshot = async (
  threadId: ThreadId,
  tabId: string,
  snapshot: PreviewSessionSnapshot,
): Promise<ControlPlaneResult<PreviewSessionSnapshot>> => {
  const key = bindingKey(threadId, tabId)
  if (!getWorkspacePanel(threadId).tabs.some((tab) => tab.id === tabId)) {
    bindings.delete(key)
    await previewClose({ threadId, tabId: snapshot.tabId })
    return { ok: false, failure: { _tag: "Interrupted" } }
  }
  bindings.set(key, snapshot.tabId)
  const url = previewCommittedUrl(snapshot.navStatus)
  const current = getWorkspacePanel(threadId).tabs.find((tab) => tab.id === tabId)
  if (current !== undefined && current.payload.url !== url) {
    patchWorkspaceTabPayload(threadId, tabId, { url })
  }
  return { ok: true, value: snapshot }
}

/** Lie l’onglet client à une session serveur. Relier deux fois réutilise le binding. */
export const ensureWorkspaceBrowserSession = (
  threadId: ThreadId,
  tabId: string,
): Promise<ControlPlaneResult<PreviewTabId>> =>
  enqueue(bindingKey(threadId, tabId), async () => {
    const existing = bindings.get(bindingKey(threadId, tabId))
    if (existing !== undefined) {
      return { ok: true, value: existing }
    }
    const tab = getWorkspacePanel(threadId).tabs.find((entry) => entry.id === tabId)
    const cached = tab === undefined ? null : browserTabUrl(tab.payload)
    const result = await previewOpen(cached === null ? { threadId } : { threadId, url: cached })
    if (!result.ok) {
      return result
    }
    const applied = await applySnapshot(threadId, tabId, result.value)
    return applied.ok ? { ok: true, value: applied.value.tabId } : applied
  })

/** Navigue via la session serveur. Un onglet perdu est rouvert. */
export const navigateWorkspaceBrowser = (
  threadId: ThreadId,
  tabId: string,
  url: string,
): Promise<ControlPlaneResult<PreviewSessionSnapshot>> =>
  enqueue(bindingKey(threadId, tabId), async () => {
    const bound = bindings.get(bindingKey(threadId, tabId))
    if (bound !== undefined) {
      const result = await previewNavigate({ threadId, tabId: bound, url })
      if (result.ok) {
        return applySnapshot(threadId, tabId, result.value)
      }
      if (!isMissingPreviewTab(result.failure)) {
        return result
      }
      bindings.delete(bindingKey(threadId, tabId))
    }
    const opened = await previewOpen({ threadId, url })
    if (!opened.ok) {
      return opened
    }
    return applySnapshot(threadId, tabId, opened.value)
  })

export const releaseWorkspaceBrowserSession = (threadId: ThreadId, tabId: string): Promise<void> =>
  enqueue(bindingKey(threadId, tabId), async () => {
    const previewTabId = bindings.get(bindingKey(threadId, tabId))
    bindings.delete(bindingKey(threadId, tabId))
    if (previewTabId === undefined) {
      return
    }
    await previewClose({ threadId, tabId: previewTabId })
  })

/** Ferme les sessions des onglets browser qui ne sont plus dans le panneau. */
export const releaseRemovedWorkspaceBrowserSessions = (
  threadId: ThreadId,
  previousTabs: readonly WorkspaceTab[],
  nextTabs: readonly WorkspaceTab[],
): Promise<void> => {
  const remaining = new Set(nextTabs.map((tab) => tab.id))
  return Promise.all(
    previousTabs
      .filter((tab) => tab.kind === BROWSER_KIND && !remaining.has(tab.id))
      .map((tab) => releaseWorkspaceBrowserSession(threadId, tab.id)),
  ).then(() => undefined)
}

export const resetWorkspaceBrowserBindingsForTests = (): void => {
  bindings.clear()
  tails.clear()
}

export const workspaceBrowserQueueDepthForTests = (): number => tails.size
