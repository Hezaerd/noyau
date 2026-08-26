import { ConnectionSupervisor, type ConnectionState } from "@noyau/client-runtime/connection"
import { Cause, Effect, Exit, Option, Result, Stream, SubscriptionRef } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity"

export {
  emptyRemoteResourceState,
  withRemoteResourceError,
  withRemoteResourcePhase,
  withRemoteResourceValue,
  type RemoteResourceState,
} from "./remote-state.ts"

export type SettledAsyncResult<A, E> = AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>

export type AtomCommandResult<A, E> = SettledAsyncResult<A, E>

export type AtomCommandSuccess<R> = R extends AtomCommandResult<infer A, infer _E> ? A : never

export type AtomCommandFailure<R> = R extends AtomCommandResult<infer _A, infer E> ? E : never

export interface AtomCommandOptions {
  readonly label?: string
  readonly reportFailure?: boolean
  readonly reportDefect?: boolean
  readonly signal?: AbortSignal
}

export interface AtomCommandReporter {
  readonly warn: (message: string, cause: Cause.Cause<unknown>) => void
  readonly error: (message: string, cause: Cause.Cause<unknown>) => void
}

export interface AtomCommand<W, A, E> {
  readonly label: string
  readonly run: (
    registry: AtomRegistry.AtomRegistry,
    input: W,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<AtomCommandResult<A, E>>
}

export type AtomCommandConcurrency<W> =
  | { readonly mode: "parallel" }
  | {
      readonly mode: "serial" | "singleFlight" | "latest"
      readonly key: (input: W) => string
    }

interface AtomCommandSchedulerState {
  readonly serial: Map<string, Promise<unknown>>
  readonly singleFlight: Map<string, Promise<unknown>>
  readonly latest: Map<string, AtomCommandLatestLane>
}

interface AtomCommandLatestBatch {
  execute: () => Promise<AtomCommandResult<unknown, unknown>>
  readonly resolve: Array<(result: AtomCommandResult<unknown, unknown>) => void>
}

interface AtomCommandLatestLane {
  running: boolean
  pending: AtomCommandLatestBatch | undefined
}

export interface AtomCommandScheduler {
  readonly schedule: <W, A, E>(
    registry: AtomRegistry.AtomRegistry,
    concurrency: AtomCommandConcurrency<W>,
    input: W,
    execute: () => Promise<AtomCommandResult<A, E>>,
  ) => Promise<AtomCommandResult<A, E>>
}

export interface QueryAtomFamilyOptions<Input, A, E, R> {
  readonly label: string
  readonly execute: (input: Input) => Effect.Effect<A, E, R>
  readonly staleTimeMs?: number
  readonly idleTtlMs?: number
  readonly refreshIntervalMs?: number
}

export interface SubscriptionAtomFamilyOptions<Input, A, E, R> {
  readonly label: string
  readonly subscribe: (input: Input, generation: number) => Stream.Stream<A, E, R>
  readonly idleTtlMs?: number
}

const connectedGenerations = (
  state: SubscriptionRef.SubscriptionRef<ConnectionState>,
): Stream.Stream<number> =>
  SubscriptionRef.changes(state).pipe(
    Stream.filterMap((snapshot) =>
      snapshot.phase === "connected" ? Result.succeed(snapshot.generation) : Result.failVoid,
    ),
    Stream.changes,
  )

const publishIfCurrentGeneration = <A, E, R>(
  started: number,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ConnectionSupervisor> =>
  effect.pipe(
    Effect.exit,
    Effect.flatMap((exit) =>
      ConnectionSupervisor.pipe(
        Effect.flatMap((supervisor) => SubscriptionRef.get(supervisor.state)),
        Effect.flatMap((snapshot) => {
          if (snapshot.phase !== "connected" || snapshot.generation !== started) {
            return Effect.interrupt
          }
          return Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause)
        }),
      ),
    ),
  )

const applyQueryPolicies = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options: {
    readonly staleTimeMs?: number
    readonly idleTtlMs?: number
    readonly refreshIntervalMs?: number
  },
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
  let next = atom
  if (options.staleTimeMs !== undefined) {
    next = next.pipe(
      Atom.swr({
        staleTime: options.staleTimeMs,
        revalidateOnMount: true,
      }),
    )
  }
  if (options.idleTtlMs !== undefined) {
    next = next.pipe(Atom.setIdleTTL(options.idleTtlMs))
  }
  if (options.refreshIntervalMs !== undefined) {
    next = next.pipe(Atom.withRefresh(options.refreshIntervalMs))
  }
  return next
}

const applyIdleTtl = <A>(atom: Atom.Atom<A>, idleTtlMs: number | undefined): Atom.Atom<A> =>
  idleTtlMs === undefined ? atom : atom.pipe(Atom.setIdleTTL(idleTtlMs))

const effectLogReporter: AtomCommandReporter = {
  warn: (message, cause) => {
    Effect.runFork(Effect.logWarning(message, Cause.pretty(cause)))
  },
  error: (message, cause) => {
    Effect.runFork(Effect.logError(message, Cause.pretty(cause)))
  },
}

async function settleAtomCommandResult<A, E>(
  execute: () => Promise<AtomCommandResult<A, E>>,
): Promise<AtomCommandResult<A, E>> {
  try {
    return await execute()
  } catch (defect) {
    return AsyncResult.failure(Cause.die(defect))
  }
}

export const createAtomCommandScheduler = (): AtomCommandScheduler => {
  const registryStates = new WeakMap<AtomRegistry.AtomRegistry, AtomCommandSchedulerState>()

  const stateFor = (registry: AtomRegistry.AtomRegistry): AtomCommandSchedulerState => {
    const existing = registryStates.get(registry)
    if (existing !== undefined) {
      return existing
    }
    const state: AtomCommandSchedulerState = {
      serial: new Map(),
      singleFlight: new Map(),
      latest: new Map(),
    }
    registryStates.set(registry, state)
    return state
  }

  return {
    schedule: <W, A, E>(
      registry: AtomRegistry.AtomRegistry,
      concurrency: AtomCommandConcurrency<W>,
      input: W,
      execute: () => Promise<AtomCommandResult<A, E>>,
    ): Promise<AtomCommandResult<A, E>> => {
      if (concurrency.mode === "parallel") {
        return execute()
      }

      const key = concurrency.key(input)
      const state = stateFor(registry)
      if (concurrency.mode === "singleFlight") {
        const existing = state.singleFlight.get(key)
        if (existing !== undefined) {
          // SAFETY: this map only stores promises created by `schedule` for this key's A/E.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          return existing as Promise<AtomCommandResult<A, E>>
        }
        const current = execute()
        state.singleFlight.set(key, current)
        void current.finally(() => {
          if (state.singleFlight.get(key) === current) {
            state.singleFlight.delete(key)
          }
        })
        return current
      }

      if (concurrency.mode === "serial") {
        const previous = state.serial.get(key)
        const current = previous === undefined ? execute() : previous.then(execute, execute)
        state.serial.set(key, current)
        void current.finally(() => {
          if (state.serial.get(key) === current) {
            state.serial.delete(key)
          }
        })
        return current
      }

      let lane = state.latest.get(key)
      if (lane === undefined) {
        lane = { running: false, pending: undefined }
        state.latest.set(key, lane)
      }
      const activeLane = lane

      const result = new Promise<AtomCommandResult<A, E>>((resolve) => {
        const accept = (batchResult: AtomCommandResult<unknown, unknown>): void => {
          // SAFETY: this lane only executes commands scheduled with the same A/E.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          resolve(batchResult as AtomCommandResult<A, E>)
        }
        if (activeLane.pending === undefined) {
          activeLane.pending = {
            execute,
            resolve: [accept],
          }
          return
        }
        activeLane.pending.execute = execute
        activeLane.pending.resolve.push(accept)
      })

      if (!activeLane.running) {
        activeLane.running = true
        void (async () => {
          while (activeLane.pending !== undefined) {
            const batch = activeLane.pending
            activeLane.pending = undefined
            let batchResult: AtomCommandResult<unknown, unknown>
            try {
              // FIFO latest-lane: each coalesced batch must finish before the next starts.
              // oxlint-disable-next-line eslint/no-await-in-loop
              batchResult = await batch.execute()
            } catch (defect) {
              batchResult = AsyncResult.failure(Cause.die(defect))
            }
            for (const resolveBatch of batch.resolve) {
              resolveBatch(batchResult)
            }
          }
          activeLane.running = false
          if (state.latest.get(key) === activeLane) {
            state.latest.delete(key)
          }
        })()
      }

      return result
    },
  }
}

/** Runs one effect inside an existing command scheduler lane. */
export const scheduleAtomCommandEffect = <W, A, E, R>(
  registry: AtomRegistry.AtomRegistry,
  scheduler: AtomCommandScheduler,
  concurrency: AtomCommandConcurrency<W>,
  input: W,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<R>()
    const result = yield* Effect.promise((signal) =>
      scheduler.schedule<W, A, E>(registry, concurrency, input, async () => {
        const exit = await Effect.runPromiseExitWith(context)(effect, { signal })
        return Exit.isSuccess(exit)
          ? AsyncResult.success(exit.value)
          : AsyncResult.failure(exit.cause)
      }),
    )
    return result._tag === "Success" ? result.value : yield* Effect.failCause(result.cause)
  })

export const runAtomCommand = async <W, A, E>(
  registry: AtomRegistry.AtomRegistry,
  command: AtomCommand<W, A, E>,
  input: W,
  options: AtomCommandOptions = {},
  reporter: AtomCommandReporter = effectLogReporter,
): Promise<AtomCommandResult<A, E>> => {
  const result = await settleAtomCommandResult(() =>
    command.run(
      registry,
      input,
      options.signal === undefined ? undefined : { signal: options.signal },
    ),
  )
  reportAtomCommandResult(result, { ...options, label: options.label ?? command.label }, reporter)
  return result
}

export const mapAtomCommandResult = <A, E, B>(
  result: AtomCommandResult<A, E>,
  map: (value: A) => B,
): AtomCommandResult<B, E> =>
  result._tag === "Success"
    ? AsyncResult.success(map(result.value))
    : AsyncResult.failure(result.cause)

export const isAtomCommandInterrupted = (result: AtomCommandResult<unknown, unknown>): boolean =>
  result._tag === "Failure" && Cause.hasInterruptsOnly(result.cause)

export const squashAtomCommandFailure = (result: { readonly cause: Cause.Cause<unknown> }) =>
  Cause.squash(result.cause)

export const settleAsyncResult = async <A, E>(
  execute: () => Promise<Exit.Exit<A, E>>,
): Promise<SettledAsyncResult<A, E>> => {
  try {
    return AsyncResult.fromExit(await execute())
  } catch (defect) {
    return AsyncResult.failure(Cause.die(defect))
  }
}

export const executeAtomCommand = async <A, E>(
  execute: () => Promise<Exit.Exit<A, E>>,
  options: AtomCommandOptions = {},
  reporter: AtomCommandReporter = effectLogReporter,
): Promise<AtomCommandResult<A, E>> => {
  const result = await settleAsyncResult(execute)
  reportAtomCommandResult(result, options, reporter)
  return result
}

export const executeAtomQueryEffect = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* AtomRegistry.mount(registry, atom)
      return yield* AtomRegistry.getResult(registry, atom, {
        suspendOnWaiting: true,
      })
    }),
  )

export const executeAtomQuery = async <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options: AtomCommandOptions = {},
  reporter: AtomCommandReporter = effectLogReporter,
): Promise<AtomCommandResult<A, E>> => {
  const query = executeAtomQueryEffect(registry, atom)
  return executeAtomCommand(
    () => Effect.runPromiseExit(query, { signal: options.signal }),
    options,
    reporter,
  )
}

export const createRuntimeCommand = <R, ER, W, A, E>(
  runtime: Atom.AtomRuntime<R, ER>,
  options: {
    readonly label: string
    readonly execute: (input: W, registry: AtomRegistry.AtomRegistry) => Effect.Effect<A, E, R>
    readonly scheduler?: AtomCommandScheduler
    readonly concurrency?: AtomCommandConcurrency<W>
  },
): AtomCommand<W, A, E | ER> => {
  const scheduler = options.scheduler ?? createAtomCommandScheduler()
  const concurrency = options.concurrency ?? { mode: "parallel" as const }
  return {
    label: options.label,
    run: (registry, input, runOptions) =>
      settleAtomCommandResult(() =>
        scheduler.schedule(registry, concurrency, input, () => {
          const atom = runtime
            .atom(options.execute(input, registry))
            .pipe(Atom.withLabel(options.label))
          const queryOptions: AtomCommandOptions =
            runOptions?.signal === undefined
              ? { reportDefect: false, reportFailure: false }
              : { reportDefect: false, reportFailure: false, signal: runOptions.signal }
          return executeAtomQuery(registry, atom, queryOptions)
        }),
      ),
  }
}

export const reportAtomCommandResult = (
  result: AtomCommandResult<unknown, unknown>,
  options: AtomCommandOptions = {},
  reporter: AtomCommandReporter = effectLogReporter,
): void => {
  if (AsyncResult.isSuccess(result) || Cause.hasInterruptsOnly(result.cause)) {
    return
  }

  const label = options.label ?? "atom command"
  if (Cause.hasDies(result.cause)) {
    if (options.reportDefect ?? true) {
      reporter.error(`[atom-command] ${label} defected`, result.cause)
    }
  } else if (options.reportFailure ?? true) {
    reporter.warn(`[atom-command] ${label} failed`, result.cause)
  }
}

export const settlePromise = async <A>(
  execute: () => Promise<A>,
): Promise<AtomCommandResult<A, never>> => {
  try {
    return AsyncResult.success(await execute())
  } catch (defect) {
    return AsyncResult.failure(Cause.die(defect))
  }
}

type JsonReplacerValue =
  | { readonly [key: string]: JsonReplacerValue }
  | ReadonlyArray<JsonReplacerValue>
  | string
  | number
  | boolean
  | null

const createKeyedAtomFamily = <Input, A extends object>(
  create: (input: Input, key: string) => A,
): ((input: Input) => A) => {
  const pendingInputs = new Map<string, { readonly input: Input }>()
  const stableInputKey = (input: Input): string =>
    JSON.stringify(input, (_key, value: JsonReplacerValue) => {
      if (!(value instanceof Object) || Array.isArray(value)) {
        return value
      }
      return Object.fromEntries(
        Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
      )
    }) ?? "null"
  const family = Atom.family((key: string) => {
    const pending = pendingInputs.get(key)
    if (pending === undefined) {
      throw new Error(`Missing Atom family input for key ${key}`)
    }
    pendingInputs.delete(key)
    return create(pending.input, key)
  })

  return (input) => {
    const key = stableInputKey(input)
    pendingInputs.set(key, { input })
    try {
      return family(key)
    } finally {
      pendingInputs.delete(key)
    }
  }
}

/**
 * Family de query mono-Environment. La clé est une sérialisation JSON stable de l'input.
 * `staleTime`, `idleTTL` et refresh ne s'appliquent que s'ils sont demandés.
 */
export const createQueryAtomFamily = <R, ER, Input, A, E>(
  runtime: Atom.AtomRuntime<ConnectionSupervisor | R, ER>,
  options: QueryAtomFamilyOptions<Input, A, E, ConnectionSupervisor | R>,
): ((input: Input) => Atom.Atom<AsyncResult.AsyncResult<A, E | ER>>) => {
  const generationAtom = runtime.atom(
    Stream.unwrap(
      ConnectionSupervisor.pipe(
        Effect.map((supervisor) =>
          connectedGenerations(supervisor.state).pipe(
            Stream.map<number, number | null>((generation) => generation),
          ),
        ),
      ),
    ),
    { initialValue: null },
  )

  const family = createKeyedAtomFamily<Input, Atom.Atom<AsyncResult.AsyncResult<A, E | ER>>>(
    (input, key) => {
      const queryAtom = runtime.atom((get) => {
        const generation = Option.getOrNull(AsyncResult.value(get(generationAtom)))
        if (generation === null) {
          return Effect.never
        }
        return publishIfCurrentGeneration(generation, options.execute(input))
      })
      return applyQueryPolicies(queryAtom, options).pipe(Atom.withLabel(`${options.label}:${key}`))
    },
  )

  return family
}

/**
 * Family de subscription mono-Environment. L'ownership reste sur l'Atom
 * (`mount` / `unmount` / `idleTTL`). Un changement de génération commute le
 * Stream via `switchMap`.
 */
export const createSubscriptionAtomFamily = <R, ER, Input, A, E>(
  runtime: Atom.AtomRuntime<ConnectionSupervisor | R, ER>,
  options: SubscriptionAtomFamilyOptions<Input, A, E, ConnectionSupervisor | R>,
): ((input: Input) => Atom.Atom<AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>>) => {
  const family = createKeyedAtomFamily<
    Input,
    Atom.Atom<AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>>
  >((input, key) => {
    const atom = runtime.atom(
      Stream.unwrap(
        ConnectionSupervisor.pipe(
          Effect.map((supervisor) =>
            connectedGenerations(supervisor.state).pipe(
              Stream.switchMap((generation) => options.subscribe(input, generation)),
            ),
          ),
        ),
      ),
    )
    return applyIdleTtl(atom, options.idleTtlMs).pipe(Atom.withLabel(`${options.label}:${key}`))
  })

  return family
}
