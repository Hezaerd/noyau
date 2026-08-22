import { describe, expect, it } from "@effect/vitest"

import { decodeReleaseChannelFromMain } from "./release-channel-bridge.ts"
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
    expect(resolveDesktopReleaseChannel("development", "nightly")).toBe("development")
    expect(isDesktopDevelopmentChannel("development")).toBe(true)
    expect(isDesktopDevelopmentChannel("nightly")).toBe(false)
    expect(desktopBrandName("development")).toBe("Noyau (Dev)")
    expect(desktopIconDirectory("development")).toBe("dev")
  })

  it("decodes the channel returned by the main process to the sandboxed preload", () => {
    expect(decodeReleaseChannelFromMain("development")).toBe("development")
    expect(decodeReleaseChannelFromMain("nightly")).toBe("nightly")
    expect(() => decodeReleaseChannelFromMain("beta")).toThrow()
  })

  it("prefers the startup env, then the channel embedded by packaging", () => {
    expect(resolveDesktopReleaseChannel("nightly", "latest")).toBe("nightly")
    expect(resolveDesktopReleaseChannel(undefined, "nightly")).toBe("nightly")
    expect(resolveDesktopReleaseChannel(undefined, undefined)).toBe("latest")
    expect(desktopBrandName("nightly")).toBe("Noyau (Nightly)")
    expect(desktopIconDirectory("nightly")).toBe("nightly")
    expect(desktopBrandName("latest")).toBe("Noyau")
  })
})
