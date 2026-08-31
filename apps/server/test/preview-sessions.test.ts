import { assert, layer } from "@effect/vitest"
import { PreviewTabId, ThreadId } from "@noyau/contracts/ids"
import { PreviewSessions, previewSessionsLayer } from "@noyau/server/preview/preview-sessions"
import { Effect } from "effect"

const thread = (n: number) =>
  ThreadId.make(`10000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const missingTab = PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001")

layer(previewSessionsLayer)("PreviewSessions", (it) => {
  it.effect("opens an idle tab when the URL is omitted", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(1)
      const opened = yield* preview.open({ threadId })
      assert.strictEqual(opened.threadId, threadId)
      assert.strictEqual(opened.navStatus._tag, "Idle")
      const listed = yield* preview.list({ threadId })
      assert.strictEqual(listed.activeTabId, opened.tabId)
      assert.strictEqual(listed.sessions.length, 1)
    }),
  )

  it.effect("opens a Success snapshot for a host:port URL", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(2)
      const opened = yield* preview.open({ threadId, url: "localhost:5173" })
      assert.deepStrictEqual(opened.navStatus, {
        _tag: "Success",
        url: "http://localhost:5173/",
        title: "localhost",
      })
    }),
  )

  it.effect("rejects a non-page scheme on open and navigate", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(3)
      const openError = yield* preview
        .open({ threadId, url: "javascript:alert(1)" })
        .pipe(Effect.flip)
      assert.strictEqual(openError._tag, "PreviewUrlInvalid")
      const opened = yield* preview.open({ threadId })
      const navigateError = yield* preview
        .navigate({ threadId, tabId: opened.tabId, url: "file:///etc/passwd" })
        .pipe(Effect.flip)
      assert.strictEqual(navigateError._tag, "PreviewUrlInvalid")
    }),
  )

  it.effect("navigates a tab and makes it active", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(4)
      const first = yield* preview.open({ threadId, url: "https://a.example" })
      const second = yield* preview.open({ threadId })
      const navigated = yield* preview.navigate({
        threadId,
        tabId: first.tabId,
        url: "https://b.example/path",
      })
      assert.deepStrictEqual(navigated.navStatus, {
        _tag: "Success",
        url: "https://b.example/path",
        title: "b.example",
      })
      const listed = yield* preview.list({ threadId })
      assert.strictEqual(listed.activeTabId, first.tabId)
      assert.strictEqual(listed.sessions.length, 2)
      assert.strictEqual(second.navStatus._tag, "Idle")
    }),
  )

  it.effect("lists an unknown thread as empty", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const listed = yield* preview.list({ threadId: thread(5) })
      assert.strictEqual(listed.activeTabId, null)
      assert.strictEqual(listed.sessions.length, 0)
    }),
  )

  it.effect("keeps threads isolated", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const first = thread(6)
      const second = thread(7)
      yield* preview.open({ threadId: first, url: "https://first.example" })
      const listed = yield* preview.list({ threadId: second })
      assert.strictEqual(listed.sessions.length, 0)
    }),
  )

  it.effect("fails navigate and close when the tab is missing", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(8)
      yield* preview.open({ threadId })
      const navigateError = yield* preview
        .navigate({ threadId, tabId: missingTab, url: "https://noyau.example" })
        .pipe(Effect.flip)
      assert.strictEqual(navigateError._tag, "PreviewTabNotFound")
      const closeError = yield* preview.close({ threadId, tabId: missingTab }).pipe(Effect.flip)
      assert.strictEqual(closeError._tag, "PreviewTabNotFound")
    }),
  )

  it.effect("closes a tab and activates a neighbor when it was active", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(9)
      const first = yield* preview.open({ threadId, url: "https://a.example" })
      const second = yield* preview.open({ threadId, url: "https://b.example" })
      const closed = yield* preview.close({ threadId, tabId: second.tabId })
      assert.strictEqual(closed.activeTabId, first.tabId)
      const listed = yield* preview.list({ threadId })
      assert.strictEqual(listed.sessions.length, 1)
      assert.strictEqual(listed.sessions[0]?.tabId, first.tabId)
    }),
  )

  it.effect("keeps the active tab when closing another", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(10)
      const first = yield* preview.open({ threadId, url: "https://a.example" })
      const second = yield* preview.open({ threadId, url: "https://b.example" })
      const closed = yield* preview.close({ threadId, tabId: first.tabId })
      assert.strictEqual(closed.activeTabId, second.tabId)
    }),
  )

  it.effect("clears the thread when the last tab closes", () =>
    Effect.gen(function* () {
      const preview = yield* PreviewSessions
      const threadId = thread(11)
      const opened = yield* preview.open({ threadId })
      const closed = yield* preview.close({ threadId, tabId: opened.tabId })
      assert.strictEqual(closed.activeTabId, null)
      const listed = yield* preview.list({ threadId })
      assert.strictEqual(listed.sessions.length, 0)
    }),
  )
})
