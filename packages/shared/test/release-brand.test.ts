import {
  DEFAULT_RELEASE_CHANNEL,
  parseReleaseChannel,
  releaseBrand,
} from "@noyau/shared/release-brand"
import { describe, expect, it } from "vite-plus/test"

describe("release brand", () => {
  it("owns the full identity of each channel", () => {
    expect(releaseBrand("development")).toMatchObject({
      displayName: "Noyau (Dev)",
      iconDirectory: "dev",
      palette: { head: "#c45c26", eye: "#ffe7c2" },
      discord: { applicationId: "1540812507592265738" },
    })
    expect(releaseBrand("nightly")).toMatchObject({
      displayName: "Noyau (Nightly)",
      bundleId: "dev.noyau.desktop.nightly",
      iconDirectory: "nightly",
      palette: { head: "#302b4b", eye: "#e2ddff" },
      discord: { applicationId: "1540445560736321627" },
    })
    expect(releaseBrand("latest")).toMatchObject({
      displayName: "Noyau",
      bundleId: "dev.noyau.desktop",
      iconDirectory: "prod",
      palette: { head: "#6154e0", eye: "#f7f5ff" },
      discord: { applicationId: "1540464789850169484" },
    })
  })

  it("uses immutable channel-specific Discord application icons", () => {
    for (const channel of ["development", "latest", "nightly"] as const) {
      const brand = releaseBrand(channel)
      expect(brand.discord.largeImage).toContain(
        `https://cdn.discordapp.com/app-icons/${brand.discord.applicationId}/`,
      )
    }
  })

  it("parses only known channels and defaults the desktop brand to latest", () => {
    expect(parseReleaseChannel("development")).toBe("development")
    expect(parseReleaseChannel("latest")).toBe("latest")
    expect(parseReleaseChannel("nightly")).toBe("nightly")
    expect(parseReleaseChannel("beta")).toBeUndefined()
    expect(parseReleaseChannel(undefined)).toBeUndefined()
    expect(DEFAULT_RELEASE_CHANNEL).toBe("latest")
  })
})
