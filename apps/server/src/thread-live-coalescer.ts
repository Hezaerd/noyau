import type { DomainEvent } from "@noyau/contracts/events"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { Duration, Effect, Fiber, Queue, Semaphore, Stream } from "effect"

const THREAD_TOOL_COALESCE_WINDOW = Duration.millis(50)
const THREAD_TOOL_COALESCE_MAX_PENDING = 512

export type ThreadLiveInput =
  | { readonly kind: "event"; readonly event: PersistedEvent<DomainEvent> }
  | { readonly kind: "synchronized" }

const isToolUpdate = (event: DomainEvent): boolean =>
  event._tag === "thread.transcript-appended" &&
  event.item._tag === "transcript.tool" &&
  event.item.status === "in_progress"

const toolUpdateKey = (event: DomainEvent): string | undefined => {
  if (
    event._tag !== "thread.transcript-appended" ||
    event.item._tag !== "transcript.tool" ||
    event.item.status !== "in_progress"
  ) {
    return undefined
  }
  return `${event.item.turnId}\u0000${event.item.toolCallId}`
}

/** Keep only the latest state for each tool call within a contiguous live update run. */
export const coalescePersistedForThread = <
  Event extends { readonly sequence: number; readonly event: DomainEvent },
>(
  events: ReadonlyArray<Event>,
): ReadonlyArray<Event> => {
  const survivors: Array<Event> = []
  let pending: Array<Event> = []

  const flushPending = () => {
    const seen = new Set<string>()
    const latest: Array<Event> = []
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const event = pending[index]!
      const key = toolUpdateKey(event.event)
      if (key !== undefined && seen.has(key)) {
        continue
      }
      if (key !== undefined) {
        seen.add(key)
      }
      latest.push(event)
    }
    latest.reverse()
    survivors.push(...latest)
    pending = []
  }

  for (const event of events) {
    if (isToolUpdate(event.event)) {
      pending.push(event)
      continue
    }
    flushPending()
    survivors.push(event)
  }
  flushPending()
  return survivors
}

export const makeThreadLiveEventCoalescer = Effect.fn("makeThreadLiveEventCoalescer")(
  function* (options?: {
    readonly coalesceWindow?: Duration.Input
    readonly beforeWindowSleep?: Effect.Effect<void>
  }) {
    const output = yield* Queue.unbounded<ThreadLiveInput>()
    const mutex = yield* Semaphore.make(1)
    const coalesceWindow = options?.coalesceWindow ?? THREAD_TOOL_COALESCE_WINDOW
    let pending: Array<PersistedEvent<DomainEvent>> = []
    let windowGeneration = 0
    let windowFiber: Fiber.Fiber<void> | undefined

    const cancelWindow = Effect.fn("ThreadLiveEventCoalescer.cancelWindow")(function* () {
      const fiber = windowFiber
      if (fiber === undefined) {
        return
      }
      windowFiber = undefined
      yield* Fiber.interrupt(fiber)
    })

    const flushPending = Effect.fn("ThreadLiveEventCoalescer.flushPending")(function* () {
      const events = pending
      pending = []
      if (events.length === 0) {
        return
      }
      yield* Queue.offerAll(
        output,
        coalescePersistedForThread(events).map((event) => ({
          kind: "event" as const,
          event,
        })),
      )
    })

    const flushWindow = (generation: number) =>
      (options?.beforeWindowSleep ?? Effect.void).pipe(
        Effect.andThen(Effect.sleep(coalesceWindow)),
        Effect.andThen(
          mutex.withPermits(1)(
            Effect.suspend(() => (generation === windowGeneration ? flushPending() : Effect.void)),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (generation === windowGeneration) {
              windowFiber = undefined
            }
          }),
        ),
      )

    const offer = Effect.fn("ThreadLiveEventCoalescer.offer")(function* (input: ThreadLiveInput) {
      yield* mutex.withPermits(1)(
        Effect.gen(function* () {
          if (input.kind === "event" && isToolUpdate(input.event.event)) {
            pending.push(input.event)
            if (pending.length === 1) {
              const generation = ++windowGeneration
              windowFiber = yield* Effect.forkScoped(flushWindow(generation))
            }
            if (pending.length >= THREAD_TOOL_COALESCE_MAX_PENDING) {
              yield* cancelWindow()
              windowGeneration += 1
              yield* flushPending()
            }
            return
          }

          yield* cancelWindow()
          windowGeneration += 1
          yield* flushPending()
          yield* Queue.offer(output, input)
        }),
      )
    })

    return {
      offer,
      stream: Stream.fromQueue(output),
    } as const
  },
)
