import type { SetShellFocusInput } from "@noyau/contracts/shell"
import { Context, Effect, Layer, Ref } from "effect"

import {
  activityFromFocus,
  presenceIdentity,
  type PresenceActivity,
  type PresenceProject,
  type PresenceThread,
} from "./activity.ts"

export interface DiscordPresenceService {
  readonly publish: (activity: PresenceActivity | null) => Effect.Effect<void>
}

export class DiscordPresence extends Context.Service<DiscordPresence, DiscordPresenceService>()(
  "@noyau/server/DiscordPresence",
) {}

export const noopDiscordPresenceLayer = Layer.succeed(DiscordPresence)({
  publish: () => Effect.void,
})

export interface PresenceIntent {
  readonly enabled: boolean
  readonly focus: SetShellFocusInput["focus"]
}

const idleIntent: PresenceIntent = {
  enabled: true,
  focus: { _tag: "idle" },
}

export interface PresenceSnapshot {
  readonly projects: ReadonlyArray<PresenceProject>
  readonly threads: ReadonlyArray<PresenceThread>
}

export interface PresenceController {
  readonly setIntent: (intent: PresenceIntent) => Effect.Effect<void>
  readonly sync: (snapshot: PresenceSnapshot) => Effect.Effect<void>
}

export const makePresenceController = Effect.fn("DiscordPresence.makeController")(function* () {
  const discord = yield* DiscordPresence
  const intent = yield* Ref.make<PresenceIntent>(idleIntent)
  const lastIdentity = yield* Ref.make<string | undefined>(undefined)

  const setIntent: PresenceController["setIntent"] = (next) => Ref.set(intent, next)

  const sync: PresenceController["sync"] = (snapshot) =>
    Effect.gen(function* () {
      const current = yield* Ref.get(intent)
      const activity = current.enabled
        ? activityFromFocus(current.focus, snapshot.projects, snapshot.threads)
        : null
      const identity = presenceIdentity(activity)
      const previous = yield* Ref.get(lastIdentity)
      if (previous === identity) {
        return
      }
      yield* Ref.set(lastIdentity, identity)
      yield* discord.publish(activity)
    })

  return { setIntent, sync } satisfies PresenceController
})
