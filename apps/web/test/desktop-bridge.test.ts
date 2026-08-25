import { describe, expect, it } from "vite-plus/test"

import { resolveDesktopReleaseChannel } from "../src/lib/desktop-bridge"

describe("desktop release channel", () => {
  it("préfère le channel exposé par le preload", () => {
    expect(
      resolveDesktopReleaseChannel({
        bridgeChannel: "nightly",
        search: "?channel=development",
        isDesktopRuntime: true,
      }),
    ).toBe("nightly")
  })

  it("reprend le channel du bootstrap URL si le bridge est absent", () => {
    expect(
      resolveDesktopReleaseChannel({
        search: "?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&channel=development",
        isDesktopRuntime: true,
      }),
    ).toBe("development")
  })

  it("ignore le query branding hors du runtime desktop", () => {
    expect(
      resolveDesktopReleaseChannel({ search: "?channel=nightly", isDesktopRuntime: false }),
    ).toBe("latest")
  })

  it("retombe sur latest pour des valeurs inconnues", () => {
    expect(
      resolveDesktopReleaseChannel({
        bridgeChannel: "beta",
        search: "?channel=canary",
        isDesktopRuntime: true,
      }),
    ).toBe("latest")
  })
})
