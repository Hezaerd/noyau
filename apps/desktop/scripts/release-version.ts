import { Schema } from "effect"

export const STABLE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/
export const RELEASE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$/
export const NIGHTLY_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-nightly\.\d{8}\.\d+$/
export const STABLE_TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+$/

export const RELEASE_CHANNEL_ENV = "NOYAU_RELEASE_CHANNEL"

export type ReleaseChannel = "latest" | "nightly"
export type DesktopReleaseChannel = "development" | ReleaseChannel

export const releaseChannelFromVersion = (version: string | undefined): ReleaseChannel =>
  version !== undefined && NIGHTLY_VERSION_PATTERN.test(version) ? "nightly" : "latest"

export const resolveReleaseBrand = (channel: ReleaseChannel) => {
  if (channel === "nightly") {
    return {
      displayName: "Noyau (Nightly)",
      bundleId: "dev.noyau.desktop.nightly",
      iconDirectory: "nightly",
      macIcon: "assets/nightly/app-icon.icns",
      winIcon: "assets/nightly/app-icon.png",
    }
  }
  return {
    displayName: "Noyau",
    bundleId: "dev.noyau.desktop",
    iconDirectory: "prod",
    macIcon: "assets/prod/app-icon.icns",
    winIcon: "assets/prod/app-icon.png",
  }
}

export const formatPackagedReleaseChannel = (channel: ReleaseChannel): string =>
  `${JSON.stringify({ channel })}\n`

export interface ReleaseMeta {
  readonly channel: ReleaseChannel
  readonly version: string
  readonly tag: string
  readonly name: string
  readonly isPrerelease: boolean
  readonly makeLatest: boolean
}

export class ReleaseVersionError extends Schema.TaggedError<ReleaseVersionError>()(
  "ReleaseVersionError",
  { message: Schema.String },
) {}

const fail = (message: string): never => {
  throw new ReleaseVersionError({ message })
}

export const stripVersionPrefix = (raw: string): string => raw.replace(/^v/, "")

export const assertReleaseVersion = (raw: string): string => {
  const version = stripVersionPrefix(raw)
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    return fail(`Invalid release version: ${raw}`)
  }
  return version
}

export const nextPatchVersion = (version: string): string => {
  const stable = version.split("-")[0] ?? version
  if (!STABLE_VERSION_PATTERN.test(stable)) {
    return fail(`Cannot bump non-stable version: ${version}`)
  }
  const [major, minor, patch] = stable.split(".").map((part) => Number(part))
  if (major === undefined || minor === undefined || patch === undefined) {
    return fail(`Cannot bump version: ${version}`)
  }
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`
}

export const latestStableVersion = (
  tags: ReadonlyArray<string>,
  packageVersion: string,
): string => {
  const stables = tags
    .filter((tag) => STABLE_TAG_PATTERN.test(tag))
    .map((tag) => stripVersionPrefix(tag))
    .toSorted((left, right) => left.localeCompare(right, "en", { numeric: true }))
  const lastTag = stables.at(-1)
  if (lastTag !== undefined) {
    return lastTag
  }
  return assertReleaseVersion(packageVersion).split("-")[0] ?? packageVersion
}

export const formatNightlyVersion = (
  baseVersion: string,
  date: string,
  runNumber: number,
): string => {
  if (!/^\d{8}$/.test(date)) {
    return fail(`Invalid nightly date: ${date}`)
  }
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    return fail(`Invalid nightly run number: ${String(runNumber)}`)
  }
  return `${nextPatchVersion(baseVersion)}-nightly.${date}.${String(runNumber)}`
}

export const githubReleaseFlags = (version: string) => {
  if (STABLE_VERSION_PATTERN.test(version)) {
    return { isPrerelease: false, makeLatest: true }
  }
  return { isPrerelease: true, makeLatest: false }
}

export const resolveReleaseMeta = (
  eventName: string,
  dispatchChannel: string,
  dispatchVersion: string,
  tagName: string,
  packageVersion: string,
  tags: ReadonlyArray<string>,
  nightlyDate: string,
  runNumber: number,
): ReleaseMeta => {
  const channel =
    eventName === "workflow_dispatch" && dispatchChannel === "nightly" ? "nightly" : "latest"

  if (channel === "nightly") {
    const version = formatNightlyVersion(
      latestStableVersion(tags, packageVersion),
      nightlyDate,
      runNumber,
    )
    return {
      channel,
      version,
      tag: `v${version}`,
      name: `Noyau v${version}`,
      isPrerelease: true,
      makeLatest: false,
    }
  }

  const raw =
    eventName === "workflow_dispatch" ? dispatchVersion : eventName === "push" ? tagName : ""
  if (raw.trim() === "") {
    return fail("latest releases require a vX.Y.Z tag or the version input")
  }

  const version = assertReleaseVersion(raw)
  if (NIGHTLY_VERSION_PATTERN.test(version)) {
    return fail(`Refusing to publish nightly version ${version} on the latest channel`)
  }

  const flags = githubReleaseFlags(version)
  return {
    channel,
    version,
    tag: `v${version}`,
    name: `Noyau v${version}`,
    ...flags,
  }
}

export const formatGitHubOutput = (meta: ReleaseMeta): string =>
  [
    `release_channel=${meta.channel}`,
    `version=${meta.version}`,
    `tag=${meta.tag}`,
    `name=${meta.name}`,
    `is_prerelease=${String(meta.isPrerelease)}`,
    `make_latest=${String(meta.makeLatest)}`,
  ].join("\n")

const readFlag = (argv: ReadonlyArray<string>, flag: string): string => {
  const index = argv.indexOf(flag)
  if (index === -1) {
    return ""
  }
  return argv[index + 1] ?? ""
}

export const splitReleaseCliArgs = (argv: ReadonlyArray<string>) => {
  const separator = argv.indexOf("--")
  if (separator === -1) {
    return { flags: argv, tags: [] }
  }
  return { flags: argv.slice(0, separator), tags: argv.slice(separator + 1) }
}

const isCli = (process.argv[1] ?? "").replaceAll("\\", "/").endsWith("/release-version.ts")

if (isCli) {
  const { flags, tags } = splitReleaseCliArgs(process.argv.slice(2))
  const meta = resolveReleaseMeta(
    readFlag(flags, "--event"),
    readFlag(flags, "--dispatch-channel") || "latest",
    readFlag(flags, "--dispatch-version"),
    readFlag(flags, "--tag-name"),
    readFlag(flags, "--package-version"),
    tags,
    readFlag(flags, "--date"),
    Number(readFlag(flags, "--run-number")),
  )
  process.stdout.write(`${formatGitHubOutput(meta)}\n`)
}
