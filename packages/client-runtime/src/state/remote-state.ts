import type { SyncPhase } from "./stream-reducer.ts"

/**
 * État distant commun. Une reconnexion ou une erreur métier change `phase` /
 * `error` sans effacer `value`. La présence d'une valeur n'est pas « transport
 * sain ».
 */
export interface RemoteResourceState<A, E = unknown> {
  readonly value: A | undefined
  readonly phase: SyncPhase
  readonly error: E | undefined
}

export const emptyRemoteResourceState = <A, E = unknown>(): RemoteResourceState<A, E> => ({
  value: undefined,
  phase: "empty",
  error: undefined,
})

export const withRemoteResourceValue = <A, E>(
  state: RemoteResourceState<A, E>,
  value: A,
  phase: SyncPhase = "live",
): RemoteResourceState<A, E> => ({
  value,
  phase,
  error: undefined,
})

export const withRemoteResourcePhase = <A, E>(
  state: RemoteResourceState<A, E>,
  phase: SyncPhase,
): RemoteResourceState<A, E> => ({
  value: state.value,
  phase,
  error: state.error,
})

export const withRemoteResourceError = <A, E>(
  state: RemoteResourceState<A, E>,
  error: E,
  phase: SyncPhase = "synchronizing",
): RemoteResourceState<A, E> => ({
  value: state.value,
  phase,
  error,
})
