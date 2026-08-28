import { describe, expect, it } from "@effect/vitest"
import { decide } from "@noyau/server/orchestration/thread/decider"
import {
  emptyThreadState,
  evolve,
  latestTurn,
  settledTurnStateForSessionStatus,
  withAvailableProjects,
  type ThreadState,
} from "@noyau/server/orchestration/thread/projector"
import { BOOT_RECOVERY_LAST_ERROR, recoverAfterBoot } from "@noyau/server/orchestration/thread/recovery"
import {
  TranscriptItem,
  type TranscriptItem as TranscriptItemType,
} from "@noyau/protocol/entities/transcript"
import { ProjectId } from "@noyau/protocol/ids"
import {
  ThreadCommand,
  ThreadTranscriptAppend,
  ThreadTurnStart,
} from "@noyau/protocol/thread/commands"
import {
  ThreadTranscriptAppended,
  ThreadTurnDiffCompleted,
  type ThreadEvent,
} from "@noyau/protocol/thread/events"
import { DEFAULT_THREAD_TITLE } from "@noyau/protocol/thread/title"
import { Result, Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  thread: "20000000-0000-4000-8000-000000000001",
  otherThread: "20000000-0000-4000-8000-000000000002",
  turn1: "30000000-0000-4000-8000-000000000001",
  turn2: "30000000-0000-4000-8000-000000000002",
  command: "70000000-0000-4000-8000-000000000001",
  command2: "70000000-0000-4000-8000-000000000002",
  correlation: "80000000-0000-4000-8000-000000000001",
} as const

const issuedAt = "2026-08-20T02:00:00.000Z"
const later = "2026-08-20T02:00:01.000Z"
const resumeCursor = {
  schemaVersion: 1 as const,
  sessionId: "cursor-session-1",
}

const meta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt,
  schemaVersion: 1,
} as const

const command = Schema.decodeUnknownSync(ThreadCommand)
const transcriptAppendCommand = Schema.decodeUnknownSync(ThreadTranscriptAppend)
const transcriptItem = Schema.decodeUnknownSync(TranscriptItem)
const turnStartCommand = Schema.decodeUnknownSync(ThreadTurnStart)
const projectId = Schema.decodeSync(ProjectId)(ids.project)

const success = <A, E>(result: Result.Result<A, E>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  if (!Result.isSuccess(result)) {
    throw new Error(`Expected success, received ${String(result.failure)}`)
  }
  return result.success
}

const failure = <A, E>(result: Result.Result<A, E>): E => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) {
    throw new Error("Expected failure")
  }
  return result.failure
}

const apply = (state: ThreadState, events: ReadonlyArray<ThreadEvent>) =>
  events.reduce(evolve, state)

const available = () => withAvailableProjects(emptyThreadState, [projectId])

const createThread = (state: ThreadState = available(), runtimeMode?: string) => {
  const payload =
    runtimeMode === undefined
      ? {
          threadId: ids.thread,
          projectId: ids.project,
          title: DEFAULT_THREAD_TITLE,
        }
      : {
          threadId: ids.thread,
          projectId: ids.project,
          title: DEFAULT_THREAD_TITLE,
          runtimeMode,
        }
  return success(
    decide(
      state,
      command({
        _tag: "thread.create",
        ...meta,
        payload,
      }),
    ),
  )
}

const withThread = () => apply(available(), createThread())

const startTurn = (
  state: ThreadState,
  turnCommandId: string = ids.turn1,
  text = "Premier prompt",
) =>
  success(
    decide(
      state,
      command({
        _tag: "thread.turn.start",
        ...meta,
        commandId: turnCommandId,
        payload: { threadId: ids.thread, text },
      }),
    ),
  )

const withStartedTurn = () => {
  const state = withThread()
  return apply(state, startTurn(state))
}

const setSession = (
  state: ThreadState,
  status: "idle" | "starting" | "running" | "ready" | "interrupted" | "stopped" | "error",
  activeTurnId: string | null = ids.turn1,
  at = issuedAt,
) =>
  success(
    decide(
      state,
      command({
        _tag: "thread.session.set",
        ...meta,
        commandId: ids.command2,
        issuedAt: at,
        payload: {
          threadId: ids.thread,
          session: {
            threadId: ids.thread,
            status,
            lastError: status === "error" ? "provider rupture" : null,
            activeTurnId,
            runtimeMode: "full-access",
            resumeCursor,
            updatedAt: at,
          },
        },
      }),
    ),
  )

const withRunningTurn = () => {
  const started = withStartedTurn()
  return apply(started, setSession(started, "running"))
}

describe("Thread lifecycle", () => {
  it("crée un Thread titré avec provider cursor immuable et runtimeMode full-access par défaut", () => {
    const events = createThread()
    const state = apply(available(), events)

    expect(events).toEqual([
      {
        _tag: "thread.created",
        threadId: ids.thread,
        projectId: ids.project,
        title: DEFAULT_THREAD_TITLE,
        provider: "cursor",
        runtimeMode: "full-access",
      },
    ])
    expect(state.threads[0]).toMatchObject({
      provider: "cursor",
      runtimeMode: "full-access",
      modelSelection: null,
      status: "active",
    })
  })

  it("crée un Thread avec provider Codex immuable", () => {
    const events = success(
      decide(
        available(),
        command({
          _tag: "thread.create",
          ...meta,
          payload: {
            threadId: ids.thread,
            projectId: ids.project,
            title: DEFAULT_THREAD_TITLE,
            provider: "codex",
          },
        }),
      ),
    )

    expect(events).toEqual([
      {
        _tag: "thread.created",
        threadId: ids.thread,
        projectId: ids.project,
        title: DEFAULT_THREAD_TITLE,
        provider: "codex",
        runtimeMode: "full-access",
      },
    ])
    expect(apply(available(), events).threads[0]?.provider).toBe("codex")
  })

  it("crée un Thread avec provider Claude immuable", () => {
    const events = success(
      decide(
        available(),
        command({
          _tag: "thread.create",
          ...meta,
          payload: {
            threadId: ids.thread,
            projectId: ids.project,
            title: DEFAULT_THREAD_TITLE,
            provider: "claude",
          },
        }),
      ),
    )

    expect(events).toEqual([
      {
        _tag: "thread.created",
        threadId: ids.thread,
        projectId: ids.project,
        title: DEFAULT_THREAD_TITLE,
        provider: "claude",
        runtimeMode: "full-access",
      },
    ])
    expect(apply(available(), events).threads[0]?.provider).toBe("claude")
  })

  it.each(["approval-required", "auto-accept-edits", "auto", "full-access"] as const)(
    "projette le runtimeMode %s",
    (runtimeMode) => {
      const state = apply(available(), createThread(available(), runtimeMode))

      expect(state.threads[0]?.runtimeMode).toBe(runtimeMode)
    },
  )

  it("persiste la modelSelection du Turn et permet de revenir en automatique", () => {
    const state = withThread()
    const selected = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn1,
            payload: {
              threadId: ids.thread,
              text: "Analyse",
              modelSelection: { modelId: "composer-2.5", reasoningEffort: "high" },
            },
          }),
        ),
      ),
    )
    expect(selected.threads[0]?.modelSelection).toEqual({
      modelId: "composer-2.5",
      reasoningEffort: "high",
    })

    const settled = apply(selected, setSession(selected, "ready", null, later))
    const automatic = apply(
      settled,
      success(
        decide(
          settled,
          command({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn2,
            payload: { threadId: ids.thread, text: "Continue", modelSelection: null },
          }),
        ),
      ),
    )
    expect(automatic.threads[0]?.modelSelection).toBeNull()
  })

  it("mémorise immédiatement la modelSelection choisie pour le Thread", () => {
    const state = withThread()
    const selected = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "thread.model-selection.set",
            ...meta,
            payload: {
              threadId: ids.thread,
              modelSelection: {
                modelId: "composer-2.5",
                reasoningEffort: "high",
                serviceTier: "fast",
                thinking: true,
              },
            },
          }),
        ),
      ),
    )

    expect(selected.threads[0]?.modelSelection).toEqual({
      modelId: "composer-2.5",
      reasoningEffort: "high",
      serviceTier: "fast",
      thinking: true,
    })

    const automatic = apply(
      selected,
      success(
        decide(
          selected,
          command({
            _tag: "thread.model-selection.set",
            ...meta,
            commandId: ids.command2,
            payload: { threadId: ids.thread, modelSelection: null },
          }),
        ),
      ),
    )
    expect(automatic.threads[0]?.modelSelection).toBeNull()
  })

  it("seed le titre avec le premier prompt et garde le provider hors des mutations", () => {
    const state = withThread()
    const started = apply(state, startTurn(state, ids.turn1, "Inspecte le projet"))
    const renamed = apply(
      started,
      success(
        decide(
          started,
          command({
            _tag: "thread.meta.update",
            ...meta,
            payload: { threadId: ids.thread, title: "Titre régénéré" },
          }),
        ),
      ),
    )

    expect(started.threads[0]?.title).toBe("Inspecte le projet")
    expect(renamed.threads[0]).toMatchObject({
      title: "Titre régénéré",
      provider: "cursor",
    })
  })

  it("persiste le Checkout sans muter le titre", () => {
    const state = withThread()
    const events = success(
      decide(
        state,
        command({
          _tag: "thread.meta.update",
          ...meta,
          payload: {
            threadId: ids.thread,
            branch: "noyau/abcd1234",
            worktreePath: "/tmp/worktrees/repo/noyau-abcd1234",
          },
        }),
      ),
    )
    const next = apply(state, events)

    expect(next.threads[0]).toMatchObject({
      title: DEFAULT_THREAD_TITLE,
      branch: "noyau/abcd1234",
      worktreePath: "/tmp/worktrees/repo/noyau-abcd1234",
    })
  })

  it("demande une régénération de titre sans muter le titre courant", () => {
    const state = withThread()
    const events = success(
      decide(
        state,
        command({
          _tag: "thread.meta.update",
          ...meta,
          payload: { threadId: ids.thread, regenerateTitle: true },
        }),
      ),
    )
    const next = apply(state, events)

    expect(events).toEqual([
      {
        _tag: "thread.meta-updated",
        threadId: ids.thread,
        regenerateTitle: true,
      },
    ])
    expect(next.threads[0]?.title).toBe(DEFAULT_THREAD_TITLE)
  })

  it("applique un Titre généré via thread.title.seeded", () => {
    const state = withThread()
    const next = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "thread.title.seeded",
            ...meta,
            payload: { threadId: ids.thread, title: "Reprendre la Session" },
          }),
        ),
      ),
    )

    expect(next.threads[0]?.title).toBe("Reprendre la Session")
  })

  it("supprime le Thread et refuse tout nouveau Turn", () => {
    const state = withThread()
    const deleted = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "thread.delete",
            ...meta,
            payload: { threadId: ids.thread },
          }),
        ),
      ),
    )

    expect(deleted.threads).toHaveLength(0)
    expect(
      failure(
        decide(
          deleted,
          command({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn1,
            payload: { threadId: ids.thread, text: "Ne doit pas partir" },
          }),
        ),
      )._tag,
    ).toBe("ThreadNotFound")
    expect(
      failure(
        decide(
          deleted,
          command({
            _tag: "thread.delete",
            ...meta,
            commandId: ids.command2,
            payload: { threadId: ids.thread },
          }),
        ),
      )._tag,
    ).toBe("ThreadNotFound")
  })

  it("refuse la création et un nouveau Turn lorsque le Project est indisponible", () => {
    const unavailable = withAvailableProjects(emptyThreadState, [])

    expect(
      failure(
        decide(
          unavailable,
          command({
            _tag: "thread.create",
            ...meta,
            payload: {
              threadId: ids.otherThread,
              projectId: ids.project,
              title: "Impossible",
            },
          }),
        ),
      ),
    ).toMatchObject({ _tag: "ProjectUnavailable", projectId: ids.project })

    const state = withAvailableProjects(withThread(), [])
    expect(
      failure(
        decide(
          state,
          command({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn1,
            payload: { threadId: ids.thread, text: "Impossible" },
          }),
        ),
      ),
    ).toMatchObject({ _tag: "ProjectUnavailable", projectId: ids.project })
  })
})

describe("Turn invariants", () => {
  it("garde un seul Turn actif et crée un nouveau Turn à la reprise sans rejouer le prompt", () => {
    const running = withRunningTurn()
    const conflict = failure(
      decide(
        running,
        command({
          _tag: "thread.turn.start",
          ...meta,
          commandId: ids.turn2,
          payload: { threadId: ids.thread, text: "Concurrent" },
        }),
      ),
    )
    expect(conflict).toMatchObject({
      _tag: "TurnAlreadyActive",
      threadId: ids.thread,
      turnId: ids.turn1,
    })

    const ready = apply(running, setSession(running, "ready", null, later))
    const resumed = apply(ready, startTurn(ready, ids.turn2, "Nouveau prompt"))
    const thread = resumed.threads[0]

    expect(thread?.turns).toEqual([
      { turnId: ids.turn1, ordinal: 1, state: "completed" },
      { turnId: ids.turn2, ordinal: 2, state: "running" },
    ])
    expect(
      thread?.transcript.filter((item) => item._tag === "transcript.user").map((item) => item.text),
    ).toEqual(["Premier prompt", "Nouveau prompt"])
  })

  it("accepte une pièce jointe persistée et rejette un dataUrl qui fuit vers le decider", () => {
    const state = withThread()
    const accepted = apply(
      state,
      success(
        decide(
          state,
          turnStartCommand({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn1,
            payload: {
              threadId: ids.thread,
              text: "Capture",
              attachments: [
                {
                  type: "image",
                  id: `${ids.turn1}-0`,
                  name: "shot.png",
                  mimeType: "image/png",
                  sizeBytes: 3,
                },
              ],
            },
          }),
        ),
      ),
    )
    const user = accepted.threads[0]?.transcript.find((item) => item._tag === "transcript.user")
    expect(user).toMatchObject({
      text: "Capture",
      attachments: [{ id: `${ids.turn1}-0`, name: "shot.png" }],
    })

    const valid = turnStartCommand({
      _tag: "thread.turn.start",
      ...meta,
      commandId: ids.turn1,
      payload: { threadId: ids.thread, text: "Capture" },
    })
    const error = failure(
      decide(state, {
        ...valid,
        payload: {
          ...valid.payload,
          image: { dataUrl: "data:image/png;base64,AAAA" },
        },
      }),
    )

    expect(error).toMatchObject({ _tag: "ImageAttachmentRejected", threadId: ids.thread })
  })

  it("porte la présentation de Turn jusqu'au transcript", () => {
    const state = withThread()
    const accepted = apply(
      state,
      success(
        decide(
          state,
          turnStartCommand({
            _tag: "thread.turn.start",
            ...meta,
            commandId: ids.turn1,
            payload: {
              threadId: ids.thread,
              text: "PR #12 conflicts with main.",
              presentation: "fix-merge-conflicts",
              titleSeed: "Fix merge conflicts",
            },
          }),
        ),
      ),
    )
    const user = accepted.threads[0]?.transcript.find((item) => item._tag === "transcript.user")
    expect(user).toMatchObject({
      text: "PR #12 conflicts with main.",
      presentation: "fix-merge-conflicts",
    })
    expect(accepted.threads[0]?.title).toBe("Fix merge conflicts")
  })

  it("ne réécrit ni transcript ni état d'un Turn terminal", () => {
    const running = withRunningTurn()
    const terminal = apply(running, setSession(running, "ready", null, later))
    const validItemCommand = transcriptAppendCommand({
      _tag: "thread.transcript.append",
      ...meta,
      payload: {
        item: {
          _tag: "transcript.assistant",
          threadId: ids.thread,
          turnId: ids.turn1,
          text: "Tardif",
        },
      },
    })

    expect(failure(decide(terminal, validItemCommand))._tag).toBe("SessionNotRunning")
    const directReplay = evolve(
      terminal,
      ThreadTranscriptAppended.make({
        item: validItemCommand.payload.item,
      }),
    )
    expect(directReplay).toEqual(terminal)
    expect(latestTurn(directReplay.threads[0] ?? terminal.threads[0]!)?.state).toBe("completed")
  })
})

describe("Session settlement", () => {
  it.each([
    ["idle", "completed"],
    ["starting", "running"],
    ["running", "running"],
    ["ready", "completed"],
    ["interrupted", "interrupted"],
    ["stopped", "interrupted"],
    ["error", "error"],
  ] as const)("mappe exhaustivement %s vers %s", (status, expected) => {
    const running = withRunningTurn()
    const next = apply(
      running,
      setSession(running, status, status === "running" ? ids.turn1 : null, later),
    )

    expect(latestTurn(next.threads[0]!)?.state).toBe(expected)
  })

  it.each([
    ["idle", "completed"],
    ["starting", null],
    ["running", null],
    ["ready", "completed"],
    ["interrupted", "interrupted"],
    ["stopped", "interrupted"],
    ["error", "error"],
  ] as const)("expose la table pure %s → %s", (status, expected) => {
    expect(settledTurnStateForSessionStatus(status)).toBe(expected)
  })

  it.each([
    ["completed", "ready", null],
    ["interrupted", "interrupted", null],
    ["error", "error", "échec provider"],
  ] as const)("settle thread.turn.ended=%s via une sortie Session %s", (state, status, error) => {
    const running = withRunningTurn()
    const payload =
      error === null
        ? {
            threadId: ids.thread,
            turnId: ids.turn1,
            state,
          }
        : {
            threadId: ids.thread,
            turnId: ids.turn1,
            state,
            lastError: error,
          }
    const events = success(
      decide(
        running,
        command({
          _tag: "thread.turn.ended",
          ...meta,
          issuedAt: later,
          payload,
        }),
      ),
    )
    const next = apply(running, events)

    expect(events.map((event) => event._tag)).toEqual(["thread.turn.ended", "thread.session-set"])
    expect(next.threads[0]?.session).toMatchObject({ status, lastError: error })
    expect(latestTurn(next.threads[0]!)?.state).toBe(state)
  })
})

describe("Transcript projection", () => {
  it("persiste chaque fait et projette bursts, outils, permissions et plan sans doublons", () => {
    let state = withRunningTurn()
    const append = (item: TranscriptItemType) => {
      const events = success(
        decide(
          state,
          command({
            _tag: "thread.transcript.append",
            ...meta,
            payload: { item },
          }),
        ),
      )
      state = apply(state, events)
    }

    append(
      transcriptItem({
        _tag: "transcript.assistant",
        threadId: ids.thread,
        turnId: ids.turn1,
        text: "Bon",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.assistant",
        threadId: ids.thread,
        turnId: ids.turn1,
        text: "jour",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.tool",
        threadId: ids.thread,
        turnId: ids.turn1,
        toolCallId: "tool-1",
        name: "Read",
        status: "in_progress",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.tool",
        threadId: ids.thread,
        turnId: ids.turn1,
        toolCallId: "tool-1",
        name: "Read",
        status: "completed",
        outputSummary: "ok",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.permission",
        threadId: ids.thread,
        turnId: ids.turn1,
        requestId: "permission-1",
        status: "pending",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.plan",
        threadId: ids.thread,
        turnId: ids.turn1,
        markdown: "1. Lire",
      }),
    )
    append(
      transcriptItem({
        _tag: "transcript.plan",
        threadId: ids.thread,
        turnId: ids.turn1,
        markdown: "1. Lire\n2. Écrire",
      }),
    )

    const thread = state.threads[0]!
    expect(thread.transcript).toHaveLength(5)
    expect(thread.transcript[1]).toMatchObject({
      _tag: "transcript.assistant",
      text: "Bonjour",
    })
    expect(thread.transcript[2]).toMatchObject({
      _tag: "transcript.tool",
      status: "completed",
      outputSummary: "ok",
    })
    expect(thread.transcript[4]).toMatchObject({
      _tag: "transcript.plan",
      markdown: "1. Lire\n2. Écrire",
    })

    const responded = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "approval.respond",
            ...meta,
            payload: {
              threadId: ids.thread,
              requestId: "permission-1",
              decision: "accept",
            },
          }),
        ),
      ),
    )
    expect(responded.threads[0]?.transcript[3]).toMatchObject({ status: "resolved" })
  })
})

describe("Thread settle", () => {
  it("classe un Thread inactif et refuse une Session en cours", () => {
    const idle = withThread()
    const settled = success(
      decide(
        idle,
        command({
          _tag: "thread.settle",
          ...meta,
          payload: { threadId: ids.thread },
        }),
      ),
    )
    expect(settled[0]?._tag).toBe("thread.settled")
    const next = apply(idle, settled)
    expect(next.threads[0]?.settledOverride).toBe("settled")

    const running = withRunningTurn()
    expect(
      failure(
        decide(
          running,
          command({
            _tag: "thread.settle",
            ...meta,
            payload: { threadId: ids.thread },
          }),
        ),
      )._tag,
    ).toBe("ThreadNotSettleable")
  })

  it("re-émet le même settledAt et pin active via unsettle", () => {
    const idle = withThread()
    const first = apply(
      idle,
      success(
        decide(
          idle,
          command({
            _tag: "thread.settle",
            ...meta,
            payload: { threadId: ids.thread },
          }),
        ),
      ),
    )
    const settledAt = first.threads[0]?.settledAt
    const reemit = success(
      decide(
        first,
        command({
          _tag: "thread.settle",
          ...meta,
          commandId: ids.command2,
          issuedAt: later,
          payload: { threadId: ids.thread },
        }),
      ),
    )
    expect(reemit[0]).toMatchObject({ _tag: "thread.settled", settledAt })

    const unsettled = apply(
      first,
      success(
        decide(
          first,
          command({
            _tag: "thread.unsettle",
            ...meta,
            payload: { threadId: ids.thread, reason: "user" },
          }),
        ),
      ),
    )
    expect(unsettled.threads[0]?.settledOverride).toBe("active")
    expect(unsettled.threads[0]?.settledAt).toBeNull()
  })

  it("annule l'override à l'activité d'un Turn ou d'une Session", () => {
    const idle = withThread()
    const settled = apply(
      idle,
      success(
        decide(
          idle,
          command({
            _tag: "thread.settle",
            ...meta,
            payload: { threadId: ids.thread },
          }),
        ),
      ),
    )
    const started = success(
      decide(
        settled,
        command({
          _tag: "thread.turn.start",
          ...meta,
          commandId: ids.turn1,
          payload: { threadId: ids.thread, text: "Reprise" },
        }),
      ),
    )
    expect(started.map((event) => event._tag)).toEqual(["thread.unsettled", "thread.turn.started"])
    expect(apply(settled, started).threads[0]?.settledOverride).toBeNull()

    const sessionEvents = success(
      decide(
        settled,
        command({
          _tag: "thread.session.set",
          ...meta,
          payload: {
            threadId: ids.thread,
            session: {
              threadId: ids.thread,
              status: "starting",
              lastError: null,
              activeTurnId: null,
              runtimeMode: "full-access",
              resumeCursor,
              updatedAt: later,
            },
          },
        }),
      ),
    )
    expect(sessionEvents[0]?._tag).toBe("thread.unsettled")
    expect(apply(settled, sessionEvents).threads[0]?.settledOverride).toBeNull()
  })
})

describe("TurnDiff", () => {
  const checkpointRef = `refs/noyau/checkpoint/${ids.thread}/1`
  const files = [{ path: "src/app.ts", kind: "modified", additions: 2, deletions: 1 }]

  it("attache un TurnDiff au Turn existant", () => {
    const running = withStartedTurn()
    const events = success(
      decide(
        running,
        command({
          _tag: "thread.turn.diff.complete",
          ...meta,
          payload: {
            threadId: ids.thread,
            turnId: ids.turn1,
            checkpointRef,
            status: "ready",
            files,
          },
        }),
      ),
    )
    expect(events).toHaveLength(1)
    expect(events[0]?._tag).toBe("thread.turn-diff-completed")
    expect(apply(running, events).threads[0]?.turns[0]?.turnDiff).toEqual({
      checkpointRef,
      status: "ready",
      files,
    })
  })

  it("refuse un Turn inconnu et n'écrase pas ready par missing", () => {
    const running = withStartedTurn()
    expect(
      failure(
        decide(
          running,
          command({
            _tag: "thread.turn.diff.complete",
            ...meta,
            payload: {
              threadId: ids.thread,
              turnId: ids.turn2,
              checkpointRef,
              status: "ready",
              files,
            },
          }),
        ),
      )._tag,
    ).toBe("TurnNotFound")

    const ready = apply(
      running,
      success(
        decide(
          running,
          command({
            _tag: "thread.turn.diff.complete",
            ...meta,
            payload: {
              threadId: ids.thread,
              turnId: ids.turn1,
              checkpointRef,
              status: "ready",
              files,
            },
          }),
        ),
      ),
    )
    expect(
      success(
        decide(
          ready,
          command({
            _tag: "thread.turn.diff.complete",
            ...meta,
            commandId: ids.command2,
            payload: {
              threadId: ids.thread,
              turnId: ids.turn1,
              checkpointRef,
              status: "missing",
              files: [],
            },
          }),
        ),
      ),
    ).toEqual([])
    expect(ready.threads[0]?.turns[0]?.turnDiff?.status).toBe("ready")
  })

  it("n'écrase pas un TurnDiff ready par error, ready ou replay", () => {
    const running = withStartedTurn()
    const ready = apply(
      running,
      success(
        decide(
          running,
          command({
            _tag: "thread.turn.diff.complete",
            ...meta,
            payload: {
              threadId: ids.thread,
              turnId: ids.turn1,
              checkpointRef,
              status: "ready",
              files,
            },
          }),
        ),
      ),
    )
    for (const status of ["error", "ready"] as const) {
      expect(
        success(
          decide(
            ready,
            command({
              _tag: "thread.turn.diff.complete",
              ...meta,
              commandId: ids.command2,
              payload: {
                threadId: ids.thread,
                turnId: ids.turn1,
                checkpointRef: `refs/noyau/checkpoint/${ids.thread}/99`,
                status,
                files: [],
              },
            }),
          ),
        ),
      ).toEqual([])
    }
    expect(
      evolve(
        ready,
        Schema.decodeSync(ThreadTurnDiffCompleted)({
          _tag: "thread.turn-diff-completed",
          threadId: ids.thread,
          turnId: ids.turn1,
          checkpointRef: `refs/noyau/checkpoint/${ids.thread}/99`,
          status: "error",
          files: [],
        }),
      ).threads[0]?.turns[0]?.turnDiff,
    ).toEqual({
      checkpointRef,
      status: "ready",
      files,
    })
  })
})

describe("boot recovery", () => {
  it.each(["starting", "running"] as const)(
    "convertit une Session %s en error, settle le Turn et conserve resumeCursor",
    (status) => {
      const started = withStartedTurn()
      const active = apply(started, setSession(started, status))
      const recoveredEvents = recoverAfterBoot(
        active,
        Schema.decodeSync(Schema.DateTimeUtcFromString)(later),
      )
      const recovered = apply(active, recoveredEvents)

      expect(recoveredEvents).toHaveLength(1)
      expect(recovered.threads[0]?.session).toMatchObject({
        status: "error",
        lastError: BOOT_RECOVERY_LAST_ERROR,
        resumeCursor,
      })
      expect(latestTurn(recovered.threads[0]!)?.state).toBe("error")
    },
  )

  it("ignore les Sessions déjà stables et reste idempotente", () => {
    const running = withRunningTurn()
    const ready = apply(running, setSession(running, "ready", null, later))
    const recoveredAt = Schema.decodeSync(Schema.DateTimeUtcFromString)(later)

    expect(recoverAfterBoot(ready, recoveredAt)).toEqual([])
    const first = apply(running, recoverAfterBoot(running, recoveredAt))
    expect(recoverAfterBoot(first, recoveredAt)).toEqual([])
  })
})
