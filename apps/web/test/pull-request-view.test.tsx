// @vitest-environment happy-dom

import type { GitPullRequest } from "@noyau/contracts/git"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PullRequestView,
  type PullRequestTabPayload,
} from "../src/components/workspace-panel/PullRequestView"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"
import { replaceProjectPullRequests } from "../src/state/sidebar"
import { encodedTestEnvironment } from "./encoded-environment"

const mocks = vi.hoisted(() => ({
  gitGetPullRequest: vi.fn(),
  gitSubmitPullRequestReview: vi.fn(),
}))

// oxlint-disable-next-line anti-slop/no-module-mocking -- The control-plane boundary is the component's fetch dependency.
vi.mock("../src/lib/control-plane", () => ({
  gitGetPullRequest: mocks.gitGetPullRequest,
  gitSubmitPullRequestReview: mocks.gitSubmitPullRequestReview,
}))

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const otherProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const otherThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const commitOid = "a".repeat(40)

const makeSnapshot = (threads: ReadonlyArray<ThreadShell>) => ({
  ...Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: 1,
    environment: encodedTestEnvironment(),
    projects: [
      {
        id: projectId,
        name: "Noyau",
        workspaceRoot: "/tmp/noyau",
        defaultModelSelection: null,
        available: true,
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: otherProjectId,
        name: "Other project",
        workspaceRoot: "/tmp/other",
        defaultModelSelection: null,
        available: true,
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    threads: [],
  }),
  threads,
})

const makeThread = (extra: Partial<(typeof ThreadShell)["Encoded"]> = {}): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Review pull request",
    provider: "cursor",
    runtimeMode: "full-access",
    modelSelection: null,
    status: "active",
    latestTurn: null,
    sessionStatus: "ready",
    lastError: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    listedAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    worktreePath: "C:/worktrees/review",
    ...extra,
  })

const makePullRequest = (number: number): GitPullRequest => ({
  number,
  title: "Review pull request",
  url: `https://github.com/hezaerd/noyau/pull/${number}`,
  body: "",
  author: null,
  state: "open",
  baseRef: "main",
  headRef: "feature/review",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  additions: 0,
  deletions: 0,
  mergeability: "mergeable",
  ciStatus: "passing",
  failedChecks: [],
  reviews: [],
  comments: [],
  commits: [
    {
      oid: commitOid,
      messageHeadline: "Initial commit",
      committedAt: "2026-09-01T12:00:00.000Z",
    },
  ],
  files: [],
  patch: "",
})

const makeTab = (number: number): PullRequestViewTab => ({
  id: "pr-tab",
  kind: "pr",
  payload: {
    number,
    url: `https://github.com/hezaerd/noyau/pull/${number}`,
  },
})

type PullRequestViewTab = {
  readonly id: string
  readonly kind: "pr"
  readonly payload: PullRequestTabPayload
}

const renderView = (tab = makeTab(5), renderThreadId = threadId) =>
  render(
    <AppAtomRegistryProvider>
      <PullRequestView isActive isVisible tab={tab} threadId={renderThreadId} />
    </AppAtomRegistryProvider>,
  )

beforeEach(() => {
  resetAppAtomRegistryForTests()
  resetAppliedShell()
  replaceAppliedShell(makeSnapshot([makeThread()]))
  replaceProjectPullRequests(projectId, new Map())
  replaceProjectPullRequests(otherProjectId, new Map())
  mocks.gitGetPullRequest.mockReset()
  mocks.gitGetPullRequest.mockResolvedValue({ ok: true, value: makePullRequest(5) })
  mocks.gitSubmitPullRequestReview.mockReset()
})

afterEach(() => {
  cleanup()
  resetAppliedShell()
  resetAppAtomRegistryForTests()
})

describe("PullRequestView fetch lifecycle", () => {
  it("ignores metadata changes but reloads for scope, PR, commit, and explicit refresh changes", async () => {
    const user = userEvent.setup()
    const view = renderView()
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(1))

    replaceAppliedShell(
      makeSnapshot([
        makeThread({
          title: "Renamed pull request",
          runtimeMode: "auto",
          status: "archived",
          updatedAt: "2026-09-01T12:05:00.000Z",
        }),
      ]),
    )
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(1))

    replaceAppliedShell(makeSnapshot([makeThread({ worktreePath: "C:/worktrees/review-next" })]))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(2))

    replaceAppliedShell(makeSnapshot([makeThread({ worktreePath: null })]))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(3))

    view.rerender(
      <AppAtomRegistryProvider>
        <PullRequestView isActive isVisible tab={makeTab(6)} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(4))

    await user.click(screen.getByRole("button", { name: "Reload pull request" }))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(5))

    await user.click(screen.getByRole("button", { name: "Code" }))
    await user.click(screen.getByRole("combobox", { name: "Diff scope" }))
    await user.click(screen.getByRole("option", { name: /Initial commit/ }))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(6))

    replaceAppliedShell(
      makeSnapshot([
        makeThread({
          id: otherThreadId,
          projectId: otherProjectId,
          worktreePath: null,
        }),
      ]),
    )
    view.rerender(
      <AppAtomRegistryProvider>
        <PullRequestView isActive isVisible tab={makeTab(6)} threadId={otherThreadId} />
      </AppAtomRegistryProvider>,
    )
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(7))

    expect(mocks.gitGetPullRequest).toHaveBeenLastCalledWith({
      projectId: otherProjectId,
      number: 6,
      commitOid,
    })
  })

  it("waits for a missing Thread and refetches when it returns", async () => {
    resetAppliedShell()
    const view = renderView()
    expect(mocks.gitGetPullRequest).not.toHaveBeenCalled()

    replaceAppliedShell(makeSnapshot([makeThread()]))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(1))

    resetAppliedShell()
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(1))

    replaceAppliedShell(makeSnapshot([makeThread()]))
    await waitFor(() => expect(mocks.gitGetPullRequest).toHaveBeenCalledTimes(2))

    expect(view.container.querySelector("[data-slot=workspace-pr]")).toBeTruthy()
  })
})
