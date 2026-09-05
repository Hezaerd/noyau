// @vitest-environment happy-dom

import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { afterEach, describe, expect, it } from "vitest"

import { LAST_PROJECT_STORAGE_KEY } from "../src/lib/control-plane-state"
import {
  LAST_SCREEN_STORAGE_KEY,
  lastScreenFromLegacyProjectId,
  lastScreenFromPathname,
  lastScreensEqual,
  parseLastScreen,
  readLastScreen,
  reconcileLastScreen,
  resolveStartupDestination,
  serializeLastScreen,
  shouldHoldBootSplash,
  startupNavigateTarget,
  writeLastScreen,
} from "../src/lib/last-screen"
import { appAtomRegistry, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  lastProjectIdAtom,
  lastScreenAtom,
  rememberLastScreen,
  resetAppliedShell,
  selectProject,
} from "../src/state/shell"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const otherProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const draftId = "30000000-0000-4000-8000-000000000001"

const board = { _tag: "board" as const, projectId }
const newThread = { _tag: "new-thread" as const, projectId }
const thread = { _tag: "thread" as const, projectId, threadId }

afterEach(() => {
  window.localStorage.removeItem(LAST_SCREEN_STORAGE_KEY)
  window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
  resetAppAtomRegistryForTests()
  resetAppliedShell()
})

describe("last screen", () => {
  it("round-trips a Board, new Thread, or Thread record", () => {
    expect(parseLastScreen(serializeLastScreen(board))).toEqual(board)
    expect(parseLastScreen(serializeLastScreen(newThread))).toEqual(newThread)
    expect(parseLastScreen(serializeLastScreen(thread))).toEqual(thread)
    expect(parseLastScreen(null)).toBeUndefined()
    expect(parseLastScreen("{")).toBeUndefined()
  })

  it("reads a legacy last-project id as that Project's Board", () => {
    expect(lastScreenFromLegacyProjectId(projectId)).toEqual(board)
    expect(lastScreenFromLegacyProjectId("not-an-id")).toBeUndefined()
  })

  it("records Board, Thread, and new-Thread routes", () => {
    expect(lastScreenFromPathname(`/projects/${projectId}/board`)).toEqual(board)
    expect(lastScreenFromPathname(`/projects/${projectId}/thread/${threadId}`)).toEqual(thread)
    expect(lastScreenFromPathname(`/projects/${projectId}/thread/new`)).toEqual(newThread)
    expect(
      lastScreenFromPathname(`/projects/${projectId}/thread/new`, `?draft=${draftId}`),
    ).toEqual({ ...newThread, draftId })
    expect(lastScreenFromPathname(`/projects/${projectId}/thread/not-a-thread-id`)).toBeUndefined()
    expect(lastScreenFromPathname("/")).toBeUndefined()
    expect(lastScreenFromPathname("/settings/general")).toBeUndefined()
  })

  it("drops a gone Project and downgrades a gone Thread to that Project's Board", () => {
    expect(reconcileLastScreen(thread, [{ id: projectId }], [{ id: threadId, projectId }])).toEqual(
      thread,
    )
    expect(reconcileLastScreen(thread, [{ id: projectId }], [])).toEqual(board)
    expect(
      reconcileLastScreen(
        thread,
        [{ id: projectId }],
        [{ id: threadId, projectId: otherProjectId }],
      ),
    ).toEqual(board)
    expect(reconcileLastScreen(newThread, [{ id: projectId }], [])).toEqual(newThread)
    expect(reconcileLastScreen(newThread, [{ id: otherProjectId }], [])).toBeUndefined()
    expect(reconcileLastScreen(board, [{ id: otherProjectId }], [])).toBeUndefined()
    expect(reconcileLastScreen(undefined, [{ id: projectId }], [])).toBeUndefined()
  })

  it("restores the last screen, or Home when nothing valid remains", () => {
    expect(
      resolveStartupDestination(thread, [{ id: projectId }], [{ id: threadId, projectId }]),
    ).toEqual(thread)
    expect(resolveStartupDestination(newThread, [{ id: projectId }], [])).toEqual(newThread)
    expect(resolveStartupDestination(thread, [{ id: projectId }], [])).toEqual(board)
    expect(resolveStartupDestination(board, [{ id: otherProjectId }], [])).toEqual({ _tag: "home" })
    expect(resolveStartupDestination(undefined, [{ id: projectId }], [])).toEqual({ _tag: "home" })
  })

  it("navigates a remembered new Thread to /thread/new", () => {
    expect(startupNavigateTarget(newThread)).toEqual({
      to: "/projects/$projectId/thread/$threadId",
      params: { projectId, threadId: "new" },
    })
    expect(startupNavigateTarget(thread)).toEqual({
      to: "/projects/$projectId/thread/$threadId",
      params: { projectId, threadId },
    })
    expect(startupNavigateTarget(board)).toEqual({
      to: "/projects/$projectId/board",
      params: { projectId },
    })
    expect(startupNavigateTarget({ ...newThread, draftId })).toEqual({
      to: "/projects/$projectId/thread/$threadId",
      params: { projectId, threadId: "new" },
      search: { draft: draftId },
    })
  })

  it("holds the boot splash on / until a Board or Thread restore can navigate", () => {
    expect(
      shouldHoldBootSplash({
        pathname: "/",
        shellReady: false,
        subscriptionFailed: false,
        destination: undefined,
      }),
    ).toBe(true)
    expect(
      shouldHoldBootSplash({
        pathname: "/",
        shellReady: true,
        subscriptionFailed: false,
        destination: newThread,
      }),
    ).toBe(true)
    expect(
      shouldHoldBootSplash({
        pathname: "/",
        shellReady: true,
        subscriptionFailed: false,
        destination: { _tag: "home" },
      }),
    ).toBe(false)
    expect(
      shouldHoldBootSplash({
        pathname: `/projects/${projectId}/thread/${threadId}`,
        shellReady: true,
        subscriptionFailed: false,
        destination: thread,
      }),
    ).toBe(false)
    expect(
      shouldHoldBootSplash({
        pathname: "/",
        shellReady: false,
        subscriptionFailed: true,
        destination: undefined,
      }),
    ).toBe(false)
  })

  it("does not treat equal last screens as a change", () => {
    expect(lastScreensEqual(thread, { ...thread })).toBe(true)
    expect(lastScreensEqual(newThread, { ...newThread })).toBe(true)
    expect(lastScreensEqual(board, newThread)).toBe(false)
    expect(lastScreensEqual(board, thread)).toBe(false)
    expect(lastScreensEqual(undefined, undefined)).toBe(true)
  })

  it("migrates the legacy last-project key on read and clears it on write", () => {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId)

    expect(readLastScreen()).toEqual(board)

    writeLastScreen(thread)

    expect(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBeNull()
    expect(readLastScreen()).toEqual(thread)
  })

  it("keeps a Thread or new Thread when selectProject stays on the same Project", () => {
    rememberLastScreen(thread)
    selectProject(projectId)
    expect(appAtomRegistry.get(lastScreenAtom)).toEqual(thread)

    rememberLastScreen(newThread)
    selectProject(projectId)
    expect(appAtomRegistry.get(lastScreenAtom)).toEqual(newThread)
    expect(appAtomRegistry.get(lastProjectIdAtom)).toBe(projectId)
  })

  it("stores the other Project's Board when selectProject switches Project", () => {
    rememberLastScreen(thread)
    selectProject(otherProjectId)

    expect(appAtomRegistry.get(lastScreenAtom)).toEqual({
      _tag: "board",
      projectId: otherProjectId,
    })
  })
})
