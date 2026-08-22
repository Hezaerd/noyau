import { describe, expect, it } from "@effect/vitest"

import {
  desktopBrandName,
  desktopIconDirectory,
  isDesktopDevelopmentChannel,
  parseDesktopReleaseChannel,
  resolveDesktopReleaseChannel,
} from "./release-channel.ts"

describe("desktop release channel", () => {
  it("parses the env values and ignores junk", () => {
    expect(parseDesktopReleaseChannel("nightly")).toBe("nightly")
    expect(parseDesktopReleaseChannel("latest")).toBe("latest")
    expect(parseDesktopReleaseChannel("development")).toBe("development")
    expect(parseDesktopReleaseChannel("beta")).toBeUndefined()
    expect(parseDesktopReleaseChannel(undefined)).toBeUndefined()
  })

  it("lets the env win over packaged metadata, including development", () => {
    expect(resolveDesktopReleaseChannel("development", "nightly", "0.1.0-nightly.20260822.1")).toBe(
      "development",
    )
    expect(isDesktopDevelopmentChannel("development")).toBe(true)
    expect(isDesktopDevelopmentChannel("nightly")).toBe(false)
    expect(desktopBrandName("development")).toBe("Noyau (Dev)")
    expect(desktopIconDirectory("development")).toBe("dev")
  })

  it("prefers the env, then the packaged file, then the version suffix", () => {
    expect(resolveDesktopReleaseChannel("nightly", "latest", "0.1.0")).toBe("nightly")
    expect(resolveDesktopReleaseChannel(undefined, "nightly", "0.1.0")).toBe("nightly")
    expect(resolveDesktopReleaseChannel(undefined, undefined, "0.1.1-nightly.20260822.3")).toBe(
      "nightly",
    )
    expect(resolveDesktopReleaseChannel(undefined, undefined, "0.1.0")).toBe("latest")
    expect(desktopBrandName("nightly")).toBe("Noyau (Nightly)")
    expect(desktopIconDirectory("nightly")).toBe("nightly")
    expect(desktopBrandName("latest")).toBe("Noyau")
  })
})
