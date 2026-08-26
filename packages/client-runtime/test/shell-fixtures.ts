import { EnvironmentId, ProjectId, Sequence, ThreadId } from "@noyau/protocol/ids"
import type { ShellStreamItem } from "@noyau/protocol/rpc"
import { ShellSnapshot, ThreadShell, type ShellLiveEvent } from "@noyau/protocol/shell"
import { Schema } from "effect"

export const PROJECT_ID = ProjectId.make("10000000-0000-4000-8000-000000000001")
export const THREAD_ID = ThreadId.make("20000000-0000-4000-8000-000000000001")

export const makeShellSnapshot = (
  sequence: number,
  threads: ReadonlyArray<ThreadShell> = [],
): ShellSnapshot => ({
  ...Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: sequence,
    environment: {
      id: EnvironmentId.make("30000000-0000-4000-8000-000000000001"),
      cursor: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models: [],
      },
      createdAt: "2026-08-25T12:00:00.000Z",
    },
    projects: [],
    threads: [],
  }),
  threads,
})

export const makeThreadShell = (id: ThreadId = THREAD_ID): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId: PROJECT_ID,
    title: "Nouveau Thread",
    provider: "cursor",
    modelSelection: null,
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  })

export const snapshotFrame = (sequence: number, threads: ReadonlyArray<ThreadShell> = []) =>
  ({
    kind: "snapshot" as const,
    snapshot: makeShellSnapshot(sequence, threads),
  }) satisfies ShellStreamItem

export const synchronizedFrame: ShellStreamItem = { kind: "synchronized" }

export const threadUpsertedFrame = (sequence: number, thread: ThreadShell): ShellStreamItem => ({
  kind: "event",
  event: {
    _tag: "thread-upserted",
    sequence: Sequence.make(sequence),
    thread,
  } satisfies ShellLiveEvent,
})
