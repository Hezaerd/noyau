import { describe, expect, it } from "vite-plus/test"

import { createComposerToolbarStore } from "../src/lib/composer-toolbar"

const definition = (id: string, placement: "top" | "bottom") => ({
  id,
  placement,
  render: () => id,
})

describe("composer toolbar store", () => {
  it("allows one owner in each placement", () => {
    const store = createComposerToolbarStore()
    const owner = Symbol("owner")

    expect(store.open(owner, definition("top-toolbar", "top")).ok).toBe(true)
    expect(store.open(owner, definition("bottom-toolbar", "bottom")).ok).toBe(true)
    expect(store.getSnapshot().top?.id).toBe("top-toolbar")
    expect(store.getSnapshot().bottom?.id).toBe("bottom-toolbar")
  })

  it("returns a typed occupied failure without replacing the incumbent", () => {
    const store = createComposerToolbarStore()
    const incumbent = Symbol("incumbent")
    const challenger = Symbol("challenger")

    expect(store.open(incumbent, definition("git", "bottom")).ok).toBe(true)
    const result = store.open(challenger, definition("plan", "bottom"))

    expect(result).toEqual({
      ok: false,
      failure: {
        _tag: "ToolbarAreaOccupied",
        placement: "bottom",
        requestedId: "plan",
        occupantId: "git",
      },
    })
    expect(store.getSnapshot().bottom?.id).toBe("git")
  })

  it("updates a same-owner reopen without creating a second occupant", () => {
    const store = createComposerToolbarStore()
    const owner = Symbol("owner")
    const first = store.open(owner, definition("first", "top"))
    const second = store.open(owner, definition("second", "top"))

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(store.getSnapshot().top?.id).toBe("second")

    if (first.ok) {
      first.close()
    }
    expect(store.getSnapshot().top?.id).toBe("second")

    if (second.ok) {
      second.close()
    }
    expect(store.getSnapshot().top).toBeUndefined()
  })

  it("makes close idempotent and owner-token safe", () => {
    const store = createComposerToolbarStore()
    const owner = Symbol("owner")
    const otherOwner = Symbol("other-owner")
    const first = store.open(owner, definition("first", "top"))

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }
    first.close()
    first.close()
    expect(store.getSnapshot().top).toBeUndefined()

    const current = store.open(otherOwner, definition("current", "top"))
    first.close()
    expect(store.getSnapshot().top?.id).toBe("current")
    if (current.ok) {
      current.close()
    }
  })
})
