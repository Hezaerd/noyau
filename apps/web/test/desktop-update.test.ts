import { describe, expect, it } from "vite-plus/test"

import {
  desktopUpdateDescription,
  desktopUpdateVersionLine,
  type DesktopUpdateState,
} from "../src/lib/desktop-update"

const idle = (result: DesktopUpdateState["result"]): DesktopUpdateState => ({
  phase: "idle",
  result,
})

describe("desktop update version line", () => {
  it("shows the full nightly version instead of the channel name", () => {
    expect(desktopUpdateVersionLine("0.2.1-nightly.20260828.1")).toBe("0.2.1-nightly.20260828.1")
    expect(desktopUpdateVersionLine("0.2.0")).toBe("0.2.0")
  })

  it("hides placeholder local versions so they are not mistaken for a channel", () => {
    expect(desktopUpdateVersionLine("")).toBe("")
    expect(desktopUpdateVersionLine("0.0.0")).toBe("")
    expect(desktopUpdateVersionLine("0.0.0+local build")).toBe("")
  })
})

describe("desktop update description", () => {
  it("leads with the nightly version and the update status", () => {
    expect(
      desktopUpdateDescription(
        idle({
          _tag: "current",
          currentVersion: "0.2.1-nightly.20260828.1",
          channel: "nightly",
        }),
        desktopUpdateVersionLine("0.2.1-nightly.20260828.1"),
        "nightly",
      ),
    ).toBe("0.2.1-nightly.20260828.1 — Up to date.")
  })

  it("does not substitute the nightly channel for a missing version", () => {
    expect(
      desktopUpdateDescription(
        idle({ _tag: "unsupported", currentVersion: "0.0.0" }),
        desktopUpdateVersionLine("0.0.0"),
        "nightly",
      ),
    ).toBe("Local build — no updates.")
  })
})
