import type { Sequence } from "@noyau/protocol/ids"

/**
 * Phase d'une Projection distante. `synchronized` passe à `live` ; ce n'est pas
 * un statut de transport (`Connected` / `Reconnecting`).
 */
export type SyncPhase = "empty" | "synchronizing" | "live"

export interface SequencedSnapshot {
  readonly snapshotSequence: Sequence
}

export interface SequencedEvent {
  readonly sequence: Sequence
}

export type SequencedFrame<S extends SequencedSnapshot, E extends SequencedEvent> =
  | { readonly kind: "snapshot"; readonly snapshot: S }
  | { readonly kind: "event"; readonly event: E }
  | { readonly kind: "synchronized" }

export interface ProjectionState<S> {
  readonly value: S | undefined
  readonly phase: SyncPhase
  readonly cursor: Sequence | undefined
}

export type AcceptedFrame = "snapshot" | "event" | "synchronized" | "ignored"

export interface ReduceResult<S extends SequencedSnapshot, E extends SequencedEvent> {
  readonly state: ProjectionState<S>
  readonly accepted: AcceptedFrame
  readonly snapshot?: S
  readonly event?: E
}

export interface ReduceSequencedFrameOptions<S, E> {
  readonly applyEvent?: (value: S, event: E) => S
}

export const acceptsSequence = (
  lastSequence: Sequence | undefined,
  nextSequence: Sequence,
): boolean => lastSequence === undefined || nextSequence > lastSequence

const initialState = <S>(initialCursor: Sequence | undefined): ProjectionState<S> =>
  initialCursor === undefined
    ? { value: undefined, phase: "empty", cursor: undefined }
    : { value: undefined, phase: "synchronizing", cursor: initialCursor }

const unchanged = <S extends SequencedSnapshot, E extends SequencedEvent>(
  state: ProjectionState<S>,
): ReduceResult<S, E> => ({ state, accepted: "ignored" })

/**
 * Consommateur de frames séquencé. Contrairement à `makeSequencedFrameConsumer`
 * dans `apps/web` (qui publie `Connected` sur toute frame, y compris
 * `synchronized`), ce reducer n'a aucun statut de transport : `synchronized`
 * avant snapshot reste `empty`, après snapshot ou cursor chaud passe à `live`.
 */
export const reduceSequencedFrame = <S extends SequencedSnapshot, E extends SequencedEvent>(
  state: ProjectionState<S>,
  frame: SequencedFrame<S, E>,
  options?: ReduceSequencedFrameOptions<S, E>,
): ReduceResult<S, E> => {
  if (frame.kind === "synchronized") {
    if (state.cursor === undefined) {
      return unchanged(state)
    }
    if (state.phase === "live") {
      return { state, accepted: "synchronized" }
    }
    return {
      state: { value: state.value, phase: "live", cursor: state.cursor },
      accepted: "synchronized",
    }
  }

  if (frame.kind === "snapshot") {
    if (!acceptsSequence(state.cursor, frame.snapshot.snapshotSequence)) {
      return unchanged(state)
    }
    return {
      state: {
        value: frame.snapshot,
        phase: "synchronizing",
        cursor: frame.snapshot.snapshotSequence,
      },
      accepted: "snapshot",
      snapshot: frame.snapshot,
    }
  }

  if (state.cursor === undefined || !acceptsSequence(state.cursor, frame.event.sequence)) {
    return unchanged(state)
  }

  const applyEvent = options?.applyEvent
  const nextValue =
    applyEvent !== undefined && state.value !== undefined
      ? applyEvent(state.value, frame.event)
      : state.value

  return {
    state: {
      value: nextValue,
      phase: state.phase,
      cursor: frame.event.sequence,
    },
    accepted: "event",
    event: frame.event,
  }
}

export interface SequencedProjection<S extends SequencedSnapshot, E extends SequencedEvent> {
  readonly afterSequence: () => Sequence | undefined
  readonly phase: () => SyncPhase
  readonly value: () => S | undefined
  readonly consume: (frame: SequencedFrame<S, E>) => ReduceResult<S, E>
}

export const makeSequencedProjection = <S extends SequencedSnapshot, E extends SequencedEvent>(
  initialCursor: Sequence | undefined,
  options?: ReduceSequencedFrameOptions<S, E>,
): SequencedProjection<S, E> => {
  let state = initialState<S>(initialCursor)
  return {
    afterSequence: () => state.cursor,
    phase: () => state.phase,
    value: () => state.value,
    consume: (frame) => {
      const result = reduceSequencedFrame(state, frame, options)
      state = result.state
      return result
    },
  }
}
