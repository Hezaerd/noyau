// @vitest-environment happy-dom

import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import type * as CheckoutModule from "../src/lib/checkout"

const state = vi.hoisted(() => ({
  continueUserInput: vi.fn(),
  snapshot: {
    thread: {
      id: "20000000-0000-4000-8000-000000000001",
      provider: "codex",
      runtimeMode: "full-access",
      modelSelection: null,
      worktreePath: null,
      branch: null,
      latestTurn: {
        turnId: "40000000-0000-4000-8000-000000000001",
        state: "failed",
      },
    },
    session: null,
    transcript: [
      {
        _tag: "transcript.user-input",
        threadId: "20000000-0000-4000-8000-000000000001",
        turnId: "40000000-0000-4000-8000-000000000001",
        requestId: "request-detached",
        title: "Choose",
        questions: [
          {
            id: "choice",
            prompt: "Choose",
            options: [
              { id: "keep", label: "Keep the current approach" },
              { id: "change", label: "Change the approach" },
            ],
          },
        ],
        status: "detached",
      },
    ],
    turns: [],
  },
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@effect/atom-react", () => ({ useAtomSet: () => vi.fn() }))
vi.mock("@/hooks/use-control-plane", () => ({
  useProjects: () => [
    {
      id: state.snapshot.thread.id,
      name: "Project",
      workspaceRoot: "/workspace",
      available: true,
      defaultModelSelection: null,
    },
  ],
  useProjectThreads: () => [],
  useProviders: () => ({
    codex: {
      instanceId: "codex",
      driver: "codex",
      enabled: true,
      handshakeOk: true,
      models: [],
    },
  }),
  useThreadShell: () => state.snapshot.thread,
}))
vi.mock("@/hooks/use-thread-snapshot", () => ({ useThreadSnapshot: () => state.snapshot }))
vi.mock("@/hooks/use-composer-draft", () => ({
  useComposerDraft: () => ({
    text: "",
    images: [],
    setText: vi.fn(),
    setImages: vi.fn(),
    clear: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-ask-question-draft", () => ({
  useAskQuestionDraft: () => ({
    value: {
      answers: { choice: { optionIds: ["keep"], freeform: "Answer" } },
      legacyFreeform: "",
      currentQuestionIndex: 0,
    },
    setAnswers: vi.fn(),
    setLegacyFreeform: vi.fn(),
    setCurrentQuestionIndex: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-app-atom", () => ({
  useAppAtomValue: () => new Map([[state.snapshot.thread.id, true]]),
}))
vi.mock("@/hooks/use-project-composer-tickets", () => ({
  useProjectComposerTickets: () => [],
}))
vi.mock("@/hooks/use-thread-visit-tracking", () => ({ useThreadVisitTracking: vi.fn() }))
vi.mock("@/hooks/use-delayed-subscription-failure", () => ({
  useDelayedSubscriptionFailure: () => undefined,
}))
vi.mock("@/lib/control-plane", () => ({
  listAgentSkills: () => Promise.resolve({ ok: true, value: { entries: [] } }),
  searchWorkspacePaths: () => Promise.resolve({ ok: true, value: { entries: [] } }),
  buildAndDispatchCommand: vi.fn(),
}))
vi.mock("@/state/thread-snapshot", () => ({
  getThreadSnapshot: () => state.snapshot,
  threadSnapshotNeedsLoad: () => false,
}))
vi.mock("@/state/thread-snapshot-subscriptions", () => ({
  retainThreadSnapshotSubscription: () => vi.fn(),
}))
vi.mock("@/lib/thread-page-actions", () => ({
  continueUserInput: state.continueUserInput,
  forkThread: vi.fn(),
  interruptTurn: vi.fn(),
  respondToApproval: vi.fn(),
  respondToUserInput: vi.fn(),
  setThreadModelSelection: vi.fn(),
  submitTurn: vi.fn(),
}))
vi.mock("@/lib/checkout", async (importOriginal) => {
  const original = await importOriginal<typeof CheckoutModule>()
  return {
    ...original,
    peekCreatedCheckout: () => ({
      threadId: state.snapshot.thread.id,
      envMode: "worktree",
      baseBranch: null,
      startFromOrigin: true,
    }),
  }
})
vi.mock("@/components/thread/ThreadTranscript", () => ({ ThreadTranscript: () => null }))
vi.mock("@/components/thread/ThreadTurnDiffPanel", () => ({
  ThreadTurnDiffPanel: () => null,
}))
vi.mock("@/components/thread/ThreadStatusNotices", () => ({
  ThreadStatusNotices: () => null,
}))
vi.mock("@/components/thread/AskQuestionToolbar", () => ({
  AskQuestionToolbar: ({ onSubmit }: { readonly onSubmit: (requestId: string) => void }) => (
    <button type="button" onClick={() => onSubmit("request-detached")}>
      Continue with answers
    </button>
  ),
}))
vi.mock("@/components/thread/ComposerGitToolbar", () => ({
  ComposerGitToolbar: ({
    onBaseBranchChange,
  }: {
    readonly onBaseBranchChange: (branch: string) => void
  }) => (
    <button type="button" onClick={() => onBaseBranchChange("main")}>
      Select main branch
    </button>
  ),
}))
vi.mock("@/components/thread/ThreadComposer", () => ({
  ThreadComposer: ({
    error,
    toolbars,
  }: {
    readonly error?: ReactNode
    readonly toolbars: ReadonlyArray<{ readonly id: string; readonly content: ReactNode }>
  }) => (
    <div>
      {error}
      {toolbars.map((toolbar) => (
        <div key={toolbar.id}>{toolbar.content}</div>
      ))}
    </div>
  ),
}))

import { ThreadPage } from "../src/pages/ThreadPage"

const projectId = ProjectId.make("20000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

beforeEach(() => {
  state.continueUserInput.mockReset()
  state.continueUserInput.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
})

describe("ThreadPage detached AskQuestion continuation", () => {
  it("clears stale branch validation before dispatching a successful retry", async () => {
    const user = userEvent.setup()
    render(
      <ThreadPage
        projectId={projectId}
        threadId={threadId}
        onCreated={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Continue with answers" }))
    expect(screen.getByText("Choose a base branch before continuing.")).toBeTruthy()
    expect(state.continueUserInput).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Select main branch" }))
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))

    expect(state.continueUserInput).toHaveBeenCalledTimes(1)
    expect(state.continueUserInput).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        requestId: "request-detached",
        baseBranch: "main",
        answers: { choice: { optionIds: ["keep"], freeform: "Answer" } },
      }),
    )
    await waitFor(() => {
      expect(screen.queryByText("Choose a base branch before continuing.")).toBeNull()
    })
  })
})
