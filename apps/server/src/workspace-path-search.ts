import type { WorkspacePathEntry } from "@noyau/contracts/entities/workspace-path"
import { Effect, FileSystem, Path } from "effect"

export const SEARCH_WORKSPACE_PATHS_LIMIT = 50
export const SEARCH_WORKSPACE_SCAN_LIMIT = 4000
export const SEARCH_WORKSPACE_STAT_CONCURRENCY = 16

const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".t3",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "out",
  "target",
  "vendor",
])

const shouldSkipDirectory = (name: string): boolean => {
  if (SKIP_DIRECTORY_NAMES.has(name)) {
    return true
  }
  if (name === ".agents" || name === ".cursor") {
    return false
  }
  return name.startsWith(".")
}

const toPosixPath = (value: string): string => value.split("\\").join("/")

const basenameOfPath = (relativePath: string): string => {
  const separatorIndex = Math.max(relativePath.lastIndexOf("/"), relativePath.lastIndexOf("\\"))
  return separatorIndex >= 0 ? relativePath.slice(separatorIndex + 1) : relativePath
}

type RankedWorkspacePathEntry = {
  entry: WorkspacePathEntry
  score: number
  depth: number
}

const rankPath = (
  relativePath: string,
  normalizedQuery: string,
): Pick<RankedWorkspacePathEntry, "score" | "depth"> | undefined => {
  if (normalizedQuery.length === 0) {
    const depth = relativePath.split("/").length
    return { score: -depth, depth }
  }

  const normalizedPath = relativePath.toLowerCase()
  const basename = basenameOfPath(normalizedPath)
  if (!basename.includes(normalizedQuery) && !normalizedPath.includes(normalizedQuery)) {
    return undefined
  }
  const depth = relativePath.split("/").length
  const score = basename.startsWith(normalizedQuery)
    ? 2
    : basename.includes(normalizedQuery)
      ? 1
      : 0
  return { score, depth }
}

const compareEntries = (
  left: RankedWorkspacePathEntry,
  right: RankedWorkspacePathEntry,
): number => {
  const scoreDelta = right.score - left.score
  if (scoreDelta !== 0) {
    return scoreDelta
  }
  const depthDelta = left.depth - right.depth
  if (depthDelta !== 0) {
    return depthDelta
  }
  return left.entry.path.localeCompare(right.entry.path)
}

export const searchWorkspacePathsInRoot = Effect.fn("searchWorkspacePathsInRoot")(function* (
  workspaceRoot: string,
  query: string,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(workspaceRoot)
  const normalizedQuery = query.trim().toLowerCase()
  const candidates: RankedWorkspacePathEntry[] = []
  const queue = [root]
  let scanned = 0

  while (queue.length > 0 && scanned < SEARCH_WORKSPACE_SCAN_LIMIT) {
    const directory = queue.shift()
    if (directory === undefined) {
      break
    }
    const names = yield* fileSystem.readDirectory(directory).pipe(Effect.orElseSucceed(() => []))
    const namesToScan = names.slice(0, SEARCH_WORKSPACE_SCAN_LIMIT - scanned)
    scanned += namesToScan.length
    const entries = yield* Effect.forEach(
      namesToScan,
      (name) => {
        const absolute = path.join(directory, name)
        return fileSystem.stat(absolute).pipe(
          Effect.orElseSucceed(() => undefined),
          Effect.map((info) => ({ name, absolute, info })),
        )
      },
      { concurrency: SEARCH_WORKSPACE_STAT_CONCURRENCY },
    )
    for (const { name, absolute, info } of entries) {
      if (info === undefined) {
        continue
      }
      const relative = toPosixPath(path.relative(root, absolute))
      if (relative === "" || relative.startsWith("../") || path.isAbsolute(relative)) {
        continue
      }
      if (info.type === "Directory") {
        if (!shouldSkipDirectory(name)) {
          queue.push(absolute)
          const ranking = rankPath(relative, normalizedQuery)
          if (ranking !== undefined) {
            candidates.push({
              entry: { path: relative, kind: "directory" },
              ...ranking,
            })
          }
        }
        continue
      }
      if (info.type === "File") {
        const ranking = rankPath(relative, normalizedQuery)
        if (ranking !== undefined) {
          candidates.push({
            entry: { path: relative, kind: "file" },
            ...ranking,
          })
        }
      }
    }
  }

  return {
    entries: candidates
      .toSorted(compareEntries)
      .slice(0, SEARCH_WORKSPACE_PATHS_LIMIT)
      .map(({ entry }) => entry),
  }
})
