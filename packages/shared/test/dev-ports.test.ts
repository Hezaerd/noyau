import {
  BASE_SERVER_PORT,
  BASE_WEB_PORT,
  findFirstAvailableOffset,
  hashPortOffset,
  isBrowserAllowedPort,
  parseDevPort,
  portPairForOffset,
  readDevPort,
  resolveOffset,
} from "@noyau/shared/dev-ports"
import { describe, expect, it } from "vite-plus/test"

describe("dev ports", () => {
  it("keeps the documented pair on offset 0", () => {
    expect(portPairForOffset(0)).toEqual({
      serverPort: BASE_SERVER_PORT,
      webPort: BASE_WEB_PORT,
    })
    expect(portPairForOffset(0)).toEqual({ serverPort: 3001, webPort: 5173 })
  })

  it("shifts both ports by the same offset", () => {
    expect(portPairForOffset(10)).toEqual({ serverPort: 3011, webPort: 5183 })
  })

  it("prefers an explicit offset over instance and worktree", () => {
    expect(resolveOffset(4, "feature", "/tmp/wt")).toEqual({
      _tag: "ok",
      offset: 4,
      source: "NOYAU_PORT_OFFSET=4",
    })
  })

  it("rejects a negative explicit offset", () => {
    expect(resolveOffset(-1, undefined, undefined)).toEqual({
      _tag: "invalid",
      portOffset: -1,
    })
  })

  it("treats a numeric instance as an offset", () => {
    expect(resolveOffset(undefined, "12", "/tmp/wt")).toEqual({
      _tag: "ok",
      offset: 12,
      source: "numeric NOYAU_DEV_INSTANCE=12",
    })
  })

  it("hashes a named instance into a stable non-zero offset", () => {
    const first = resolveOffset(undefined, "feature-a", undefined)
    const second = resolveOffset(undefined, "feature-a", undefined)
    const other = resolveOffset(undefined, "feature-b", undefined)

    expect(first).toEqual({
      _tag: "ok",
      offset: hashPortOffset("feature-a"),
      source: "hashed NOYAU_DEV_INSTANCE=feature-a",
    })
    expect(first).toEqual(second)
    expect(first._tag === "ok" && first.offset > 0).toBe(true)
    expect(other._tag === "ok" && first._tag === "ok" && other.offset !== first.offset).toBe(true)
  })

  it("hashes a worktree path when no instance is set", () => {
    expect(resolveOffset(undefined, undefined, "/tmp/noyau/wt-a")).toEqual({
      _tag: "ok",
      offset: hashPortOffset("/tmp/noyau/wt-a"),
      source: "worktree /tmp/noyau/wt-a",
    })
  })

  it("keeps the main checkout on the documented ports", () => {
    expect(resolveOffset(undefined, undefined, undefined)).toEqual({
      _tag: "ok",
      offset: 0,
      source: "default ports",
    })
  })

  it("rejects Fetch-blocked browser ports", () => {
    expect(isBrowserAllowedPort(5173)).toBe(true)
    expect(isBrowserAllowedPort(6000)).toBe(false)
    expect(isBrowserAllowedPort(22)).toBe(false)
  })

  it("walks past a busy pair and a blocked web port", () => {
    const busy = new Set([3001, 5173, 3002])
    expect(findFirstAvailableOffset(0, true, true, (port) => !busy.has(port))).toEqual({
      _tag: "ok",
      offset: 2,
    })
    expect(portPairForOffset(2)).toEqual({ serverPort: 3003, webPort: 5175 })
  })

  it("parses only integers in 1–65535", () => {
    expect(parseDevPort(undefined)).toEqual({ _tag: "empty" })
    expect(parseDevPort("")).toEqual({ _tag: "empty" })
    expect(parseDevPort(" 5173 ")).toEqual({ _tag: "ok", port: 5173 })
    expect(parseDevPort("5173abc")).toEqual({ _tag: "invalid" })
    expect(parseDevPort("-1")).toEqual({ _tag: "invalid" })
    expect(parseDevPort("0")).toEqual({ _tag: "invalid" })
    expect(parseDevPort("65536")).toEqual({ _tag: "invalid" })
    expect(parseDevPort("65535")).toEqual({ _tag: "ok", port: 65_535 })
    expect(readDevPort("5173abc", 5173)).toBe(5173)
    expect(readDevPort("", 3001)).toBe(3001)
  })

  it("skips a web port the browser would refuse", () => {
    const selected = findFirstAvailableOffset(827, false, true, () => true)
    expect(selected._tag).toBe("ok")
    if (selected._tag !== "ok") {
      return
    }
    expect(portPairForOffset(selected.offset).webPort).not.toBe(6000)
    expect(isBrowserAllowedPort(portPairForOffset(selected.offset).webPort)).toBe(true)
  })

  it("skips a server port the browser would refuse to fetch", () => {
    const selected = findFirstAvailableOffset(2999, true, false, () => true)
    expect(selected._tag).toBe("ok")
    if (selected._tag !== "ok") {
      return
    }
    expect(portPairForOffset(selected.offset).serverPort).not.toBe(6000)
    expect(isBrowserAllowedPort(portPairForOffset(selected.offset).serverPort)).toBe(true)
  })

  it("reports exhaustion when no port remains in range", () => {
    expect(findFirstAvailableOffset(70_000, true, true, () => true)).toEqual({
      _tag: "exhausted",
      startOffset: 70_000,
    })
  })
})
