import { Effect, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"

import type { DesktopUpdateCheckResult } from "./desktop-update-contract"
import {
  type DesktopUpdateOpenResult,
  type DesktopUpdatePackagedChannel,
} from "./desktop-update-contract"
import { type DesktopReleaseChannel } from "./release-channel"

export const DESKTOP_UPDATE_REPOSITORY = "hezaerd/noyau"
export const DESKTOP_UPDATE_USER_AGENT = "Noyau-Desktop"
const STABLE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/
const NIGHTLY_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-nightly\.\d{8}\.\d+$/
const PUBLISHABLE_INSTALLER_PATTERN = /^Noyau-.+-(mac|win)-(arm64|x64)\.(dmg|exe)$/

export class DesktopUpdateCheckFailed extends Schema.TaggedError<DesktopUpdateCheckFailed>()(
  "DesktopUpdateCheckFailed",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class InvalidDesktopInstallerUrl extends Schema.TaggedError<InvalidDesktopInstallerUrl>()(
  "InvalidDesktopInstallerUrl",
  {
    url: Schema.String,
  },
) {}

export class DesktopInstallerOpenFailed extends Schema.TaggedError<DesktopInstallerOpenFailed>()(
  "DesktopInstallerOpenFailed",
  {
    url: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const GitHubReleaseAsset = Schema.Struct({
  name: Schema.String,
  browser_download_url: Schema.String,
})

const GitHubRelease = Schema.Struct({
  tag_name: Schema.String,
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  html_url: Schema.String,
  assets: Schema.Array(GitHubReleaseAsset),
})

const GitHubReleases = Schema.Array(GitHubRelease)
const decodeGitHubReleases = Schema.decodeUnknownEffect(GitHubReleases)

export type GitHubReleaseList = typeof GitHubReleases.Type

export interface DesktopUpdateHost {
  readonly platform: "darwin" | "win32"
  readonly arch: "arm64" | "x64"
}

export interface DesktopUpdateCheckInput {
  readonly channel: DesktopReleaseChannel
  readonly installedChannel: DesktopReleaseChannel
  readonly currentVersion: string
  readonly host: DesktopUpdateHost | undefined
  readonly repository?: string
}

export interface DesktopUpdateSelectionInput {
  readonly channel: DesktopUpdatePackagedChannel
  readonly installedChannel: DesktopUpdatePackagedChannel
  readonly currentVersion: string
  readonly host: DesktopUpdateHost | undefined
  readonly repository: string
}

export const resolveDesktopUpdateCheckChannel = (
  packaged: DesktopReleaseChannel,
  requested: DesktopUpdatePackagedChannel | undefined,
): DesktopReleaseChannel => {
  if (packaged === "development") {
    return "development"
  }
  return requested ?? packaged
}

export const isDesktopUpdateChannelSwitch = (
  installedChannel: DesktopUpdatePackagedChannel,
  checkChannel: DesktopUpdatePackagedChannel,
): boolean => installedChannel !== checkChannel

export const stripReleaseVersionPrefix = (raw: string): string => raw.replace(/^v/, "")

export const isNewerReleaseVersion = (candidate: string, current: string): boolean =>
  candidate.localeCompare(current, "en", { numeric: true }) > 0

export const resolveDesktopUpdateHost = (
  platform: string,
  arch: string,
): DesktopUpdateHost | undefined => {
  if ((platform !== "darwin" && platform !== "win32") || (arch !== "arm64" && arch !== "x64")) {
    return undefined
  }
  return { platform, arch }
}

export const installerSuffixForHost = (host: DesktopUpdateHost): string =>
  host.platform === "darwin" ? `mac-${host.arch}.dmg` : `win-${host.arch}.exe`

export const isPublishableInstallerName = (name: string): boolean =>
  PUBLISHABLE_INSTALLER_PATTERN.test(name)

export const matchesInstallerHost = (name: string, host: DesktopUpdateHost): boolean =>
  isPublishableInstallerName(name) && name.endsWith(`-${installerSuffixForHost(host)}`)

export const githubReleasesUrl = (repository = DESKTOP_UPDATE_REPOSITORY): string =>
  `https://api.github.com/repos/${repository}/releases?per_page=30`

const releaseMatchesChannel = (
  release: GitHubReleaseList[number],
  channel: DesktopUpdatePackagedChannel,
): boolean => {
  if (release.draft) {
    return false
  }
  const version = stripReleaseVersionPrefix(release.tag_name)
  if (channel === "latest") {
    return !release.prerelease && STABLE_VERSION_PATTERN.test(version)
  }
  return release.prerelease && NIGHTLY_VERSION_PATTERN.test(version)
}

export const isAllowedInstallerDownloadUrl = (
  url: string,
  repository = DESKTOP_UPDATE_REPOSITORY,
): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    return false
  }
  if (parsed.hostname !== "github.com") {
    return false
  }
  const [owner, repo] = repository.split("/")
  const segments = parsed.pathname.split("/")
  const installerName = segments[6]
  return (
    segments.length === 7 &&
    segments[1] === owner &&
    segments[2] === repo &&
    segments[3] === "releases" &&
    segments[4] === "download" &&
    (segments[5] ?? "").startsWith("v") &&
    installerName !== undefined &&
    isPublishableInstallerName(installerName)
  )
}

export const resolveOpenableInstallerUrl = (
  url: string,
  repository = DESKTOP_UPDATE_REPOSITORY,
): string | null => (isAllowedInstallerDownloadUrl(url, repository) ? url : null)

const pickInstallerAsset = (
  assets: GitHubReleaseList[number]["assets"],
  host: DesktopUpdateHost,
  repository: string,
): { readonly name: string; readonly url: string } | undefined => {
  for (const asset of assets) {
    if (
      matchesInstallerHost(asset.name, host) &&
      isAllowedInstallerDownloadUrl(asset.browser_download_url, repository)
    ) {
      return { name: asset.name, url: asset.browser_download_url }
    }
  }
  return undefined
}

export const selectDesktopUpdate = (
  releases: GitHubReleaseList,
  input: DesktopUpdateSelectionInput,
): Exclude<DesktopUpdateCheckResult, { readonly _tag: "unsupported" | "failed" }> => {
  const channel = input.channel
  const repository = input.repository
  const matching = releases
    .filter((release) => releaseMatchesChannel(release, channel))
    .map((release) => ({
      version: stripReleaseVersionPrefix(release.tag_name),
      releaseUrl: release.html_url,
      assets: release.assets,
    }))
    .toSorted((left, right) => right.version.localeCompare(left.version, "en", { numeric: true }))
  const newest = matching[0]
  if (newest === undefined) {
    return {
      _tag: "missing",
      currentVersion: input.currentVersion,
      channel,
      reason: "no-release",
    }
  }
  if (
    !isDesktopUpdateChannelSwitch(input.installedChannel, channel) &&
    !isNewerReleaseVersion(newest.version, input.currentVersion)
  ) {
    return {
      _tag: "current",
      currentVersion: input.currentVersion,
      channel,
    }
  }
  if (input.host === undefined) {
    return {
      _tag: "missing",
      currentVersion: input.currentVersion,
      channel,
      reason: "no-installer",
    }
  }
  const installer = pickInstallerAsset(newest.assets, input.host, repository)
  if (installer === undefined) {
    return {
      _tag: "missing",
      currentVersion: input.currentVersion,
      channel,
      reason: "no-installer",
    }
  }
  return {
    _tag: "available",
    currentVersion: input.currentVersion,
    availableVersion: newest.version,
    installerName: installer.name,
    installerUrl: installer.url,
    releaseUrl: newest.releaseUrl,
    channel,
  }
}

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": DESKTOP_UPDATE_USER_AGENT,
  "X-GitHub-Api-Version": "2022-11-28",
} as const

export const checkDesktopUpdate = Effect.fn("checkDesktopUpdate")(function* (
  input: DesktopUpdateCheckInput,
) {
  if (input.channel === "development") {
    return {
      _tag: "unsupported",
      currentVersion: input.currentVersion,
    } satisfies DesktopUpdateCheckResult
  }

  const client = yield* HttpClient.HttpClient
  const response = yield* client
    .get(githubReleasesUrl(input.repository), { headers: githubHeaders })
    .pipe(
      Effect.timeout("10 seconds"),
      Effect.mapError(
        (cause) =>
          new DesktopUpdateCheckFailed({
            message: "Impossible de vérifier les mises à jour.",
            cause,
          }),
      ),
    )
  const ok = yield* HttpClientResponse.filterStatusOk(response).pipe(
    Effect.mapError(
      (cause) =>
        new DesktopUpdateCheckFailed({
          message: "Impossible de vérifier les mises à jour.",
          cause,
        }),
    ),
  )
  const body = yield* ok.json.pipe(
    Effect.mapError(
      (cause) =>
        new DesktopUpdateCheckFailed({
          message: "Impossible de vérifier les mises à jour.",
          cause,
        }),
    ),
  )
  const releases = yield* decodeGitHubReleases(body).pipe(
    Effect.mapError(
      (cause) =>
        new DesktopUpdateCheckFailed({
          message: "Impossible de vérifier les mises à jour.",
          cause,
        }),
    ),
  )
  return selectDesktopUpdate(releases, {
    channel: input.channel,
    installedChannel:
      input.installedChannel === "latest" || input.installedChannel === "nightly"
        ? input.installedChannel
        : input.channel,
    currentVersion: input.currentVersion,
    host: input.host,
    repository: input.repository ?? DESKTOP_UPDATE_REPOSITORY,
  })
})

export const settleDesktopUpdateCheck = Effect.fn("settleDesktopUpdateCheck")(function* (
  input: DesktopUpdateCheckInput,
) {
  return yield* checkDesktopUpdate(input).pipe(
    Effect.catch((cause) =>
      Effect.succeed({
        _tag: "failed" as const,
        currentVersion: input.currentVersion,
        message: Schema.is(DesktopUpdateCheckFailed)(cause)
          ? cause.message
          : "Impossible de vérifier les mises à jour.",
      } satisfies DesktopUpdateCheckResult),
    ),
  )
})

export const resolveDesktopUpdateOpen = (
  result: DesktopUpdateCheckResult,
):
  | { readonly _tag: "open"; readonly url: string }
  | Extract<DesktopUpdateOpenResult, { readonly _tag: "unavailable" }> => {
  if (result._tag === "available") {
    return { _tag: "open", url: result.installerUrl }
  }
  if (result._tag === "failed") {
    return { _tag: "unavailable", reason: "failed", message: result.message }
  }
  return { _tag: "unavailable", reason: result._tag }
}

export const openCheckedDesktopInstaller = Effect.fn("openCheckedDesktopInstaller")(function* (
  input: DesktopUpdateCheckInput,
  openExternal: (resolved: string) => Promise<void>,
) {
  const result = yield* settleDesktopUpdateCheck(input)
  const resolved = resolveDesktopUpdateOpen(result)
  if (resolved._tag !== "open") {
    return resolved
  }
  return yield* openDesktopInstallerUrl(resolved.url, openExternal).pipe(
    Effect.as({ _tag: "opened" as const } satisfies DesktopUpdateOpenResult),
    Effect.orElseSucceed((): DesktopUpdateOpenResult => ({
      _tag: "failed",
      message: "Impossible d’ouvrir l’installeur.",
    })),
  )
})

export const openDesktopInstallerUrl = Effect.fn("openDesktopInstallerUrl")(function* (
  url: string,
  openExternal: (resolved: string) => Promise<void>,
  repository = DESKTOP_UPDATE_REPOSITORY,
) {
  const resolved = resolveOpenableInstallerUrl(url, repository)
  if (resolved === null) {
    return yield* new InvalidDesktopInstallerUrl({ url })
  }
  yield* Effect.tryPromise({
    try: () => openExternal(resolved),
    catch: (cause) =>
      new DesktopInstallerOpenFailed({
        url: resolved,
        message: "Impossible d’ouvrir l’installeur.",
        cause,
      }),
  })
})
