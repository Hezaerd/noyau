import { assert, it } from "@effect/vitest"
import { ThreadId, TurnId } from "@noyau/protocol/ids"
import { ThreadLive, threadLiveLayer } from "@noyau/server/thread-live"
import { Effect, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

it.layer(threadLiveLayer)("thread live", (scoped) => {
  scoped.effect("coalesces publishes to the latest snapshot", () =>
    Effect.gen(function* () {
      const live = yield* ThreadLive
      const collected = yield* Ref.make<ReadonlyArray<string>>([])
      yield* live.subscribe(threadId).pipe(
        Stream.runForEach((item) => Ref.update(collected, (current) => [...current, item.text])),
        Effect.forkChild,
      )
      yield* live.publish({ threadId, turnId, text: "B" })
      yield* live.publish({ threadId, turnId, text: "Bonjour" })
      yield* TestClock.adjust("8 millis")
      yield* Effect.yieldNow
      const items = yield* Ref.get(collected)
      assert.ok(items.length > 0)
      assert.strictEqual(items.at(-1), "Bonjour")
      assert.ok(!items.includes("B"))
    }),
  )
})
