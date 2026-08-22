// Probe sync + timeout : le login shell peut pendre ; ChildProcess async ne convient pas au boot.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import * as NodeChildProcess from "node:child_process"
import * as NodeOs from "node:os"

import { Effect } from "effect"

const WINDOWS_PATH_DELIMITER = ";"
const POSIX_PATH_DELIMITER = ":"
const LOGIN_SHELL_TIMEOUT_MS = 5_000
const LAUNCHCTL_TIMEOUT_MS = 2_000
const SHELL_ENV_NAME_PATTERN = /^[A-Z0-9_]+$/
const WINDOWS_SHELL_CANDIDATES = ["pwsh.exe", "powershell.exe"] as const

export type ExecFileSyncLike = (
  file: string,
  args: ReadonlyArray<string>,
  options: { encoding: "utf8"; timeout: number },
) => string

const defaultExecFile: ExecFileSyncLike = NodeChildProcess.execFileSync

const trimNonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined
}

const readUserLoginShell = (): string | undefined => {
  try {
    return trimNonEmpty(NodeOs.userInfo().shell)
  } catch {
    return undefined
  }
}

const envCaptureStart = (name: string): string => `__NOYAU_ENV_${name}_START__`

const envCaptureEnd = (name: string): string => `__NOYAU_ENV_${name}_END__`

const pathDelimiter = (platform: NodeJS.Platform): string =>
  platform === "win32" ? WINDOWS_PATH_DELIMITER : POSIX_PATH_DELIMITER

const normalizePathEntry = (entry: string, platform: NodeJS.Platform): string => {
  const normalized = entry.trim().replace(/^"+|"+$/g, "")
  return platform === "win32" ? normalized.toLowerCase() : normalized
}

const logPathHydrationWarning = (message: string, cause?: unknown): void => {
  const detail = cause instanceof Error ? cause.message : ""
  process.stderr.write(`[noyau-server] ${message}${detail.length > 0 ? ` ${detail}` : ""}\n`)
}

export const extractEnvironmentValue = (output: string, name: string): string | undefined => {
  const startMarker = envCaptureStart(name)
  const endMarker = envCaptureEnd(name)
  const startIndex = output.indexOf(startMarker)
  if (startIndex === -1) {
    return undefined
  }
  const valueStartIndex = startIndex + startMarker.length
  const endIndex = output.indexOf(endMarker, valueStartIndex)
  if (endIndex === -1) {
    return undefined
  }
  const value = output
    .slice(valueStartIndex, endIndex)
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "")
  return value.length > 0 ? value : undefined
}

const buildPosixCaptureCommand = (names: ReadonlyArray<string>): string =>
  names
    .map((name) => {
      if (!SHELL_ENV_NAME_PATTERN.test(name)) {
        throw new Error(`Unsupported environment variable name: ${name}`)
      }
      return [
        `printf '%s\\n' '${envCaptureStart(name)}'`,
        `printenv ${name} || true`,
        `printf '%s\\n' '${envCaptureEnd(name)}'`,
      ].join("; ")
    })
    .join("; ")

const buildWindowsUserPathCaptureCommand = (): string =>
  [
    "$ErrorActionPreference = 'Stop'",
    `Write-Output '${envCaptureStart("PATH")}'`,
    "$machine = [Environment]::GetEnvironmentVariable('PATH', 'Machine')",
    "$user = [Environment]::GetEnvironmentVariable('PATH', 'User')",
    "$parts = @($machine, $user) | Where-Object { $_ -and $_.Length -gt 0 }",
    "if ($parts.Count -gt 0) { Write-Output ($parts -join ';') }",
    `Write-Output '${envCaptureEnd("PATH")}'`,
  ].join("; ")

export const listLoginShellCandidates = (
  platform: NodeJS.Platform,
  shell: string | undefined,
  userShell = readUserLoginShell(),
): ReadonlyArray<string> => {
  const fallbackShell =
    platform === "darwin" ? "/bin/zsh" : platform === "linux" ? "/bin/bash" : undefined
  const seen = new Set<string>()
  const candidates: Array<string> = []
  for (const candidate of [trimNonEmpty(shell), trimNonEmpty(userShell), fallbackShell]) {
    if (candidate === undefined || seen.has(candidate)) {
      continue
    }
    seen.add(candidate)
    candidates.push(candidate)
  }
  return candidates
}

export const mergePathEntries = (
  preferredPath: string | undefined,
  inheritedPath: string | undefined,
  platform: NodeJS.Platform,
): string | undefined => {
  const delimiter = pathDelimiter(platform)
  const merged: Array<string> = []
  const seen = new Set<string>()
  for (const pathValue of [preferredPath, inheritedPath]) {
    if (pathValue === undefined || pathValue.length === 0) {
      continue
    }
    for (const entry of pathValue.split(delimiter)) {
      const trimmed = entry.trim()
      if (trimmed.length === 0) {
        continue
      }
      const normalized = normalizePathEntry(trimmed, platform)
      if (normalized.length === 0 || seen.has(normalized)) {
        continue
      }
      seen.add(normalized)
      merged.push(trimmed)
    }
  }
  return merged.length > 0 ? merged.join(delimiter) : undefined
}

export const readPathFromLoginShell = (
  shell: string,
  execFile: ExecFileSyncLike = defaultExecFile,
): string | undefined => {
  const output = execFile(shell, ["-ilc", buildPosixCaptureCommand(["PATH"])], {
    encoding: "utf8",
    timeout: LOGIN_SHELL_TIMEOUT_MS,
  })
  return extractEnvironmentValue(output, "PATH")
}

export const readPathFromLaunchctl = (
  execFile: ExecFileSyncLike = defaultExecFile,
): string | undefined => {
  try {
    return trimNonEmpty(
      execFile("/bin/launchctl", ["getenv", "PATH"], {
        encoding: "utf8",
        timeout: LAUNCHCTL_TIMEOUT_MS,
      }),
    )
  } catch {
    return undefined
  }
}

export const readPathFromWindowsUserEnvironment = (
  execFile: ExecFileSyncLike = defaultExecFile,
): string | undefined => {
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    buildWindowsUserPathCaptureCommand(),
  ]
  for (const shell of WINDOWS_SHELL_CANDIDATES) {
    try {
      const output = execFile(shell, args, {
        encoding: "utf8",
        timeout: LOGIN_SHELL_TIMEOUT_MS,
      })
      return extractEnvironmentValue(output, "PATH")
    } catch {
      continue
    }
  }
  return undefined
}

export const resolveKnownWindowsCliDirs = (env: NodeJS.ProcessEnv): ReadonlyArray<string> => {
  const appData = env.APPDATA?.trim()
  const localAppData = env.LOCALAPPDATA?.trim()
  const userProfile = env.USERPROFILE?.trim()
  return [
    ...(appData === undefined || appData.length === 0 ? [] : [`${appData}\\npm`]),
    ...(localAppData === undefined || localAppData.length === 0
      ? []
      : [
          `${localAppData}\\Programs\\nodejs`,
          `${localAppData}\\Volta\\bin`,
          `${localAppData}\\pnpm`,
        ]),
    ...(userProfile === undefined || userProfile.length === 0
      ? []
      : [
          `${userProfile}\\.local\\bin`,
          `${userProfile}\\.bun\\bin`,
          `${userProfile}\\scoop\\shims`,
        ]),
  ]
}

export const hydratePosixHome = (
  env: NodeJS.ProcessEnv,
  resolveHomeDir = () => NodeOs.userInfo().homedir,
): void => {
  if ((env.HOME?.trim() ?? "").length > 0) {
    return
  }
  const homeDir = resolveHomeDir()
  if (homeDir.length > 0) {
    env.HOME = homeDir
  }
}

export const hydratePosixPath = (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  execFile: ExecFileSyncLike = defaultExecFile,
): void => {
  let shellPath: string | undefined
  for (const shell of listLoginShellCandidates(platform, env.SHELL)) {
    try {
      shellPath = readPathFromLoginShell(shell, execFile)
    } catch (error) {
      logPathHydrationWarning(`Failed to read PATH from login shell ${shell}.`, error)
    }
    if (shellPath !== undefined) {
      break
    }
  }
  const launchctlPath =
    platform === "darwin" && shellPath === undefined ? readPathFromLaunchctl(execFile) : undefined
  const mergedPath = mergePathEntries(shellPath ?? launchctlPath, env.PATH, platform)
  if (mergedPath !== undefined) {
    env.PATH = mergedPath
  }
}

export const hydrateWindowsPath = (
  env: NodeJS.ProcessEnv,
  execFile: ExecFileSyncLike = defaultExecFile,
): void => {
  let userPath: string | undefined
  try {
    userPath = readPathFromWindowsUserEnvironment(execFile)
  } catch (error) {
    logPathHydrationWarning("Failed to read PATH from the Windows user environment.", error)
  }
  const inheritedPath = env.PATH ?? env.Path
  const knownCliPath = resolveKnownWindowsCliDirs(env).join(WINDOWS_PATH_DELIMITER)
  const mergedPath = mergePathEntries(
    knownCliPath,
    mergePathEntries(userPath, inheritedPath, "win32"),
    "win32",
  )
  if (mergedPath !== undefined) {
    env.PATH = mergedPath
  }
}

/** Hydrates `process.env.PATH` from the login shell before Cursor / Git probes. */
export const hydrateHostPath = Effect.fn("HostPath.hydrate")(function* () {
  const platform = process.platform
  const env = process.env
  if (platform === "win32") {
    yield* Effect.sync(() => hydrateWindowsPath(env)).pipe(
      Effect.catchDefect((defect) =>
        Effect.sync(() => {
          logPathHydrationWarning("Failed to hydrate PATH from the user environment.", defect)
        }),
      ),
    )
    return
  }
  if (platform !== "darwin" && platform !== "linux") {
    return
  }
  yield* Effect.sync(() => hydratePosixHome(env)).pipe(
    Effect.catchDefect((defect) =>
      Effect.sync(() => {
        logPathHydrationWarning("Failed to hydrate HOME from the user account.", defect)
      }),
    ),
  )
  yield* Effect.sync(() => hydratePosixPath(env, platform)).pipe(
    Effect.catchDefect((defect) =>
      Effect.sync(() => {
        logPathHydrationWarning("Failed to hydrate PATH from the user environment.", defect)
      }),
    ),
  )
})
