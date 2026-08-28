import type { TurnSettlementState } from "@noyau/contracts/entities/turn"
import { play, type SoundName } from "cuelume"

export const TURN_CUE_SOUNDS = [
  "chime",
  "sparkle",
  "bloom",
  "success",
  "ready",
  "scan",
  "arrival",
] as const satisfies ReadonlyArray<SoundName>

export type TurnCueSound = (typeof TURN_CUE_SOUNDS)[number]

export const DEFAULT_TURN_CUE_SOUND = "arrival" satisfies TurnCueSound

export const TURN_CUE_SOUND_ITEMS: ReadonlyArray<{
  readonly value: TurnCueSound
  readonly label: string
}> = [
  { value: "chime", label: "Chime" },
  { value: "sparkle", label: "Sparkle" },
  { value: "bloom", label: "Bloom" },
  { value: "success", label: "Success" },
  { value: "ready", label: "Ready" },
  { value: "scan", label: "Scan" },
  { value: "arrival", label: "Arrival" },
]

export const isTurnCueSound = (value: string): value is TurnCueSound =>
  TURN_CUE_SOUNDS.some((sound) => sound === value)

export const playTurnCue = (sound: TurnCueSound): void => {
  play(sound, { volume: 1 })
}

export interface TurnCueThread {
  readonly id: string
  readonly latestTurn: {
    readonly turnId: string
    readonly state: string
  } | null
}

export interface TurnSettlement {
  readonly threadId: string
  readonly turnId: string
  readonly state: TurnSettlementState
}

const isSettlementState = (state: string): state is TurnSettlementState =>
  state === "completed" || state === "interrupted" || state === "error"

export const settledTurns = (
  previous: ReadonlyArray<TurnCueThread>,
  next: ReadonlyArray<TurnCueThread>,
): ReadonlyArray<TurnSettlement> => {
  const previousById = new Map(previous.map((thread) => [thread.id, thread.latestTurn]))
  const settlements: TurnSettlement[] = []

  for (const thread of next) {
    const latest = thread.latestTurn
    if (latest === null || !isSettlementState(latest.state)) {
      continue
    }
    const prior = previousById.get(thread.id)
    if (prior === undefined || prior === null) {
      continue
    }
    if (prior.turnId !== latest.turnId || prior.state !== "running") {
      continue
    }
    settlements.push({
      threadId: thread.id,
      turnId: latest.turnId,
      state: latest.state,
    })
  }

  return settlements
}
