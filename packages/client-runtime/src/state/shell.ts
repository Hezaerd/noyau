import {
  classifyControlPlaneError,
  ConnectionSupervisor,
  TransportRupture,
  type ClassifyableControlPlaneError,
} from "@noyau/client-runtime/connection"
import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import type { ProjectId, Sequence, ThreadId } from "@noyau/protocol/ids"
import { RPC_METHODS, type ShellStreamItem } from "@noyau/protocol/rpc"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import { Cause, Effect, Option, Stream } from "effect"
import type { Atom } from "effect/unstable/reactivity"

import {
  createSubscriptionAtomFamily,
  emptyRemoteResourceState,
  withRemoteResourceError,
  type RemoteResourceState,
} from "./runtime.ts"
import { applyShellEvent, upsertOptimisticThread } from "./shell-reducer.ts"
import {
  makeSequencedProjection,
  type SequencedFrame,
  type SequencedProjection,
} from "./stream-reducer.ts"
import {
  EMPTY_THREAD_IDS,
  EMPTY_THREAD_SHELLS,
  EMPTY_THREAD_SHELL_INDEX,
  indexThreadShells,
  type ThreadShellIndex,
} from "./thread-shell-index.ts"

export { applyShellEvent, upsertOptimisticThread } from "./shell-reducer.ts"
export {
  EMPTY_THREAD_IDS,
  EMPTY_THREAD_IDS_BY_PROJECT,
  EMPTY_THREAD_SHELL_INDEX,
  EMPTY_THREAD_SHELLS,
  EMPTY_THREADS_BY_ID,
  EMPTY_THREADS_BY_PROJECT,
  indexThreadShells,
  type ThreadShellIndex,
} from "./thread-shell-index.ts"
export {
  emptyRemoteResourceState,
  withRemoteResourceError,
  withRemoteResourcePhase,
  withRemoteResourceValue,
  type RemoteResourceState,
} from "./remote-state.ts"

export const EMPTY_PROJECTS: ReadonlyArray<ProjectShell> = Object.freeze([])

/** Singleton input: one Shell subscription for the whole app. */
export type ShellResourceInput = Record<PropertyKey, never>

export const SHELL_RESOURCE_INPUT: ShellResourceInput = {}

export type ShellResourceError = ClassifyableControlPlaneError

export type ShellResourceState = RemoteResourceState<ShellSnapshot, ShellResourceError>

export const classifyShellResourceError = classifyControlPlaneError

const frameFromItem = (item: ShellStreamItem): SequencedFrame<ShellSnapshot, ShellLiveEvent> =>
  item.kind === "synchronized"
    ? { kind: "synchronized" }
    : item.kind === "snapshot"
      ? { kind: "snapshot", snapshot: item.snapshot }
      : { kind: "event", event: item.event }

/**
 * Fold one sequenced frame into a RemoteResourceState. Reuses the projection
 * cursor; when the projection has no value yet (warm reconnect), events apply
 * onto the previous resource value.
 */
export const applyShellResourceFrame = <E>(
  resource: RemoteResourceState<ShellSnapshot, E>,
  projection: SequencedProjection<ShellSnapshot, ShellLiveEvent>,
  frame: SequencedFrame<ShellSnapshot, ShellLiveEvent>,
): RemoteResourceState<ShellSnapshot, E> => {
  const result = projection.consume(frame)
  if (result.accepted === "ignored") {
    return resource
  }
  if (result.accepted === "snapshot") {
    return {
      value: result.snapshot ?? result.state.value,
      phase: result.state.phase,
      error: undefined,
    }
  }
  if (result.accepted === "event") {
    const value =
      result.state.value !== undefined
        ? result.state.value
        : resource.value !== undefined && result.event !== undefined
          ? applyShellEvent(resource.value, result.event)
          : undefined
    return {
      value,
      phase: result.state.phase,
      error: undefined,
    }
  }
  return {
    value: resource.value ?? result.state.value,
    phase: result.state.phase,
    error: undefined,
  }
}

const errorFromCause = (cause: Cause.Cause<ShellResourceError>): ShellResourceError =>
  Option.getOrElse(Cause.findErrorOption(cause), () => new TransportRupture({ reason: "failed" }))

const subscribeShellStream = (
  generation: number,
  cursor: Sequence | undefined,
): Stream.Stream<ShellStreamItem, ShellResourceError, ConnectionSupervisor> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const supervisor = yield* ConnectionSupervisor
      const session = yield* supervisor.currentSession
      if (session.generation !== generation) {
        return Stream.empty
      }
      return session.client[RPC_METHODS.subscribeShell](
        cursor === undefined ? {} : { afterSequence: cursor },
      )
    }),
  )

interface ShellResourceCursor {
  cursor: Sequence | undefined
  last: ShellResourceState
}

const makeShellGenerationStream = (
  generation: number,
  state: ShellResourceCursor,
): Stream.Stream<ShellResourceState, never, ConnectionSupervisor> => {
  const projection = makeSequencedProjection<ShellSnapshot, ShellLiveEvent>(state.cursor, {
    applyEvent: applyShellEvent,
  })
  const starting: ShellResourceState =
    state.last.value !== undefined
      ? { value: state.last.value, phase: "synchronizing", error: undefined }
      : emptyRemoteResourceState()
  state.last = starting

  const frames = subscribeShellStream(generation, state.cursor).pipe(
    Stream.map((item) => {
      state.last = applyShellResourceFrame(state.last, projection, frameFromItem(item))
      state.cursor = projection.afterSequence()
      return state.last
    }),
    Stream.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Stream.empty
      }
      state.last = withRemoteResourceError(state.last, errorFromCause(cause))
      return Stream.make(state.last)
    }),
  )

  return Stream.concat(Stream.make(starting), frames)
}

/**
 * Family Atom of the Shell Projection. Input is a singleton (`{}`) so Atom
 * owns share / release: one subscribeShell for the application.
 *
 * Cursor and previous RemoteResourceState live in the factory closure so a
 * generation switch resubscribes with `afterSequence` and keeps `value`.
 * The stream never calls `notifyTransportRupture` / replace.
 */
export const createShellResourceAtom = <R, ER>(
  runtime: Atom.AtomRuntime<ConnectionSupervisor | R, ER>,
) => {
  const state: ShellResourceCursor = {
    cursor: undefined,
    last: emptyRemoteResourceState(),
  }

  const family = createSubscriptionAtomFamily(runtime, {
    label: "shell",
    subscribe: (_input: ShellResourceInput, generation) =>
      makeShellGenerationStream(generation, state),
  })

  return family(SHELL_RESOURCE_INPUT)
}

export const selectShellProjects = (
  snapshot: ShellSnapshot | undefined,
): ReadonlyArray<ProjectShell> => snapshot?.projects ?? EMPTY_PROJECTS

export const selectShellThreads = (
  snapshot: ShellSnapshot | undefined,
): ReadonlyArray<ThreadShell> => snapshot?.threads ?? EMPTY_THREAD_SHELLS

export const selectShellCursor = (
  snapshot: ShellSnapshot | undefined,
): CursorProviderStatus | undefined => snapshot?.environment.cursor

export const selectThreadShellById = (
  index: ThreadShellIndex,
  threadId: ThreadId,
): ThreadShell | undefined => index.threadsById.get(threadId)

export const selectProjectThreadIds = (
  index: ThreadShellIndex,
  projectId: ProjectId,
): ReadonlyArray<ThreadId> => index.threadIdsByProjectId.get(projectId) ?? EMPTY_THREAD_IDS

export const selectProjectThreads = (
  index: ThreadShellIndex,
  projectId: ProjectId,
): ReadonlyArray<ThreadShell> => index.threadsByProjectId.get(projectId) ?? EMPTY_THREAD_SHELLS

export const mergeOptimisticThreads = (
  snapshot: ShellSnapshot,
  optimistic: ReadonlyArray<ThreadShell>,
): ShellSnapshot => {
  let next = snapshot
  for (const thread of optimistic) {
    next = upsertOptimisticThread(next, thread)
  }
  return next
}

export const remainingOptimisticThreads = (
  snapshot: ShellSnapshot,
  optimistic: ReadonlyArray<ThreadShell>,
): ReadonlyArray<ThreadShell> =>
  optimistic.filter((thread) => !snapshot.threads.some((candidate) => candidate.id === thread.id))

export const indexThreadShellsFromSnapshot = (
  snapshot: ShellSnapshot | undefined,
  previous: ThreadShellIndex = EMPTY_THREAD_SHELL_INDEX,
): ThreadShellIndex => indexThreadShells(snapshot?.threads ?? EMPTY_THREAD_SHELLS, previous)
