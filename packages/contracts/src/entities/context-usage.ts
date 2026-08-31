import { Schema } from "effect"

/** Last-known fill of a Thread's model context window. */
export const ContextUsage = Schema.Struct({
  used: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  window: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ContextUsage = (typeof ContextUsage)["Type"]

/** Normalizes a provider fill. Returns null when either side is unusable. */
export const contextUsageOf = (used: number, window: number): ContextUsage | null => {
  if (!Number.isInteger(used) || !Number.isInteger(window) || used < 0 || window <= 0) {
    return null
  }
  return { used, window }
}
