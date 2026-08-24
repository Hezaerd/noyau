import { Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  DESKTOP_UPDATE_REPOSITORY,
  installerSuffixForHost,
  isAllowedInstallerDownloadUrl,
  isDesktopUpdateChannelSwitch,
  isNewerReleaseVersion,
  isPublishableInstallerName,
  matchesInstallerHost,
  openDesktopInstallerUrl,
  resolveDesktopUpdateCheckChannel,
  resolveDesktopUpdateHost,
  resolveDesktopUpdateOpen,
  resolveOpenableInstallerUrl,
  selectDesktopUpdate,
  type GitHubReleaseList,
} from "./desktop-update"

const macHost = { platform: "darwin", arch: "arm64" } as const
const winHost = { platform: "win32", arch: "x64" } as const
const latestInput = {
  channel: "latest" as const,
  installedChannel: "latest" as const,
  currentVersion: "0.1.0",
  host: macHost,
  repository: DESKTOP_UPDATE_REPOSITORY,
}

const asset = (name: string, repository = "hezaerd/noyau") => ({
  name,
  browser_download_url: `https://github.com/${repository}/releases/download/v0.2.0/${name}`,
})

const release = (
  tag: string,
  options: {
    readonly draft?: boolean
    readonly prerelease?: boolean
    readonly assets?: GitHubReleaseList[number]["assets"]
  } = {},
): GitHubReleaseList[number] => ({
  tag_name: tag,
  draft: options.draft ?? false,
  prerelease: options.prerelease ?? false,
  html_url: `https://github.com/hezaerd/noyau/releases/tag/${tag}`,
  assets: options.assets ?? [asset(`Noyau-${tag.slice(1)}-mac-arm64.dmg`)],
})

describe("desktop update selection", () => {
  it("resolves published installer hosts and rejects the rest", () => {
    expect(resolveDesktopUpdateHost("darwin", "arm64")).toEqual(macHost)
    expect(resolveDesktopUpdateHost("win32", "x64")).toEqual(winHost)
    expect(resolveDesktopUpdateHost("linux", "x64")).toBeUndefined()
    expect(installerSuffixForHost(macHost)).toBe("mac-arm64.dmg")
    expect(installerSuffixForHost(winHost)).toBe("win-x64.exe")
    expect(isPublishableInstallerName("Noyau-0.2.0-mac-arm64.dmg")).toBe(true)
    expect(matchesInstallerHost("Noyau-0.2.0-mac-arm64.dmg", macHost)).toBe(true)
    expect(matchesInstallerHost("Noyau-0.2.0-win-x64.exe", macHost)).toBe(false)
  })

  it("compares nightly versions numerically", () => {
    expect(isNewerReleaseVersion("0.2.0", "0.1.0")).toBe(true)
    expect(isNewerReleaseVersion("0.1.0", "0.1.0")).toBe(false)
    expect(isNewerReleaseVersion("0.1.1-nightly.20260824.2", "0.1.1-nightly.20260824.1")).toBe(true)
  })

  it("allows only GitHub installer download URLs for the Noyau repo", () => {
    expect(
      isAllowedInstallerDownloadUrl(
        "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
      ),
    ).toBe(true)
    expect(
      isAllowedInstallerDownloadUrl(
        "https://github.com/evil/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
      ),
    ).toBe(false)
    expect(isAllowedInstallerDownloadUrl("https://example.com/Noyau-0.2.0-mac-arm64.dmg")).toBe(
      false,
    )
    expect(resolveOpenableInstallerUrl("javascript:alert(1)")).toBeNull()
  })

  it("picks the newest matching latest installer and ignores drafts", () => {
    const result = selectDesktopUpdate(
      [
        release("v0.1.0"),
        release("v0.3.0-rc.1", { prerelease: true }),
        release("v0.2.0", {
          assets: [asset("Noyau-0.2.0-mac-arm64.dmg"), asset("Noyau-0.2.0-win-x64.exe")],
        }),
        release("v0.4.0", { draft: true }),
      ],
      latestInput,
    )

    expect(result).toEqual({
      _tag: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      installerName: "Noyau-0.2.0-mac-arm64.dmg",
      installerUrl:
        "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
      releaseUrl: "https://github.com/hezaerd/noyau/releases/tag/v0.2.0",
      channel: "latest",
    })
  })

  it("stays on the nightly channel and reports a current install", () => {
    expect(
      selectDesktopUpdate(
        [
          release("v0.2.0"),
          release("v0.2.1-nightly.20260824.3", {
            prerelease: true,
            assets: [asset("Noyau-0.2.1-nightly.20260824.3-mac-arm64.dmg")],
          }),
        ],
        {
          channel: "nightly",
          installedChannel: "nightly",
          currentVersion: "0.2.1-nightly.20260824.3",
          host: macHost,
          repository: DESKTOP_UPDATE_REPOSITORY,
        },
      ),
    ).toMatchObject({ _tag: "current", channel: "nightly" })
  })

  it("opens only an available check", () => {
    expect(
      resolveDesktopUpdateOpen({
        _tag: "available",
        currentVersion: "0.1.0",
        availableVersion: "0.2.0",
        installerName: "Noyau-0.2.0-mac-arm64.dmg",
        installerUrl:
          "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
        releaseUrl: "https://github.com/hezaerd/noyau/releases/tag/v0.2.0",
        channel: "latest",
      }),
    ).toEqual({
      _tag: "open",
      url: "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
    })
    expect(
      resolveDesktopUpdateOpen({ _tag: "current", currentVersion: "0.2.0", channel: "latest" }),
    ).toEqual({
      _tag: "unavailable",
      reason: "current",
    })
  })

  it("reports a missing installer for the newest channel release", () => {
    expect(
      selectDesktopUpdate(
        [release("v0.2.0", { assets: [asset("Noyau-0.2.0-win-x64.exe")] })],
        latestInput,
      ),
    ).toMatchObject({ _tag: "missing", reason: "no-installer" })
    expect(
      selectDesktopUpdate([release("v0.2.0")], {
        channel: "nightly",
        installedChannel: "nightly",
        currentVersion: "0.1.0",
        host: macHost,
        repository: DESKTOP_UPDATE_REPOSITORY,
      }),
    ).toMatchObject({ _tag: "missing", reason: "no-release" })
  })

  it("keeps the packaged channel unless a check channel is requested", () => {
    expect(resolveDesktopUpdateCheckChannel("latest", undefined)).toBe("latest")
    expect(resolveDesktopUpdateCheckChannel("latest", "nightly")).toBe("nightly")
    expect(resolveDesktopUpdateCheckChannel("development", "nightly")).toBe("development")
    expect(isDesktopUpdateChannelSwitch("latest", "nightly")).toBe(true)
    expect(isDesktopUpdateChannelSwitch("latest", "latest")).toBe(false)
  })

  it("offers the other channel's installer even when the version looks older", () => {
    expect(
      selectDesktopUpdate([release("v0.2.0")], {
        channel: "latest",
        installedChannel: "nightly",
        currentVersion: "0.2.1-nightly.20260824.3",
        host: macHost,
        repository: DESKTOP_UPDATE_REPOSITORY,
      }),
    ).toMatchObject({
      _tag: "available",
      availableVersion: "0.2.0",
      channel: "latest",
    })
  })
})

describe("desktop update effects", () => {
  it("opens only an allowed installer URL", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const opened: string[] = []
        yield* openDesktopInstallerUrl(
          "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
          (url) => {
            opened.push(url)
            return Promise.resolve()
          },
        )
        expect(opened).toEqual([
          "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
        ])

        const denied = yield* Effect.result(
          openDesktopInstallerUrl("https://evil.test/Noyau-0.2.0-mac-arm64.dmg", () =>
            Promise.resolve(),
          ),
        )
        expect(denied._tag).toBe("Failure")
      }),
    ))
})
