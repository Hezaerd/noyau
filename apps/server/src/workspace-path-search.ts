import type { WorkspacePathEntry } from "@noyau/protocol/entities/workspace-path"
import { Effect, FileSystem, Path } from "effect"

export const SEARCH_WORKSPACE_PATHS_LIMIT = 50
export const SEARCH_WORKSPACE_SCAN_LIMIT = 4000

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

const matchesQuery = (relativePath: string, query: string): boolean => {
  if (query.length === 0) {
    return true
  }
  const normalizedPath = relativePath.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  return (
    basenameOfPath(normalizedPath).includes(normalizedQuery) ||
    normalizedPath.includes(normalizedQuery)
  )
}

const scoreEntry = (relativePath: string, query: string): number => {
  if (query.length === 0) {
    return -relativePath.split("/").length
  }
  const basename = basenameOfPath(relativePath).toLowerCase()
  const normalizedQuery = query.toLowerCase()
  if (basename.startsWith(normalizedQuery)) {
    return 2
  }
  if (basename.includes(normalizedQuery)) {
    return 1
  }
  return 0
}

const compareEntries = (
  left: WorkspacePathEntry,
  right: WorkspacePathEntry,
  query: string,
): number => {
  const scoreDelta = scoreEntry(right.path, query) - scoreEntry(left.path, query)
  if (scoreDelta !== 0) {
    return scoreDelta
  }
  const depthDelta = left.path.split("/").length - right.path.split("/").length
  if (depthDelta !== 0) {
    return depthDelta
  }
  return left.path.localeCompare(right.path)
}

export const searchWorkspacePathsInRoot = Effect.fn("searchWorkspacePathsInRoot")(function* (
  workspaceRoot: string,
  query: string,
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(workspaceRoot)
  const trimmedQuery = query.trim()
  const candidates: WorkspacePathEntry[] = []
  const queue = [root]
  let scanned = 0

  while (queue.length > 0 && scanned < SEARCH_WORKSPACE_SCAN_LIMIT) {
    const directory = queue.shift()
    if (directory === undefined) {
      break
    }
    const names = yield* fileSystem.readDirectory(directory).pipe(Effect.orElseSucceed(() => []))
    for (const name of names) {
      if (scanned >= SEARCH_WORKSPACE_SCAN_LIMIT) {
        break
      }
      scanned += 1
      const absolute = path.join(directory, name)
      const info = yield* fileSystem.stat(absolute).pipe(Effect.orElseSucceed(() => undefined))
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
          if (matchesQuery(relative, trimmedQuery)) {
            candidates.push({ path: relative, kind: "directory" })
          }
        }
        continue
      }
      if (info.type === "File" && matchesQuery(relative, trimmedQuery)) {
        candidates.push({ path: relative, kind: "file" })
      }
    }
  }

  return {
    entries: candidates
      .toSorted((left, right) => compareEntries(left, right, trimmedQuery))
      .slice(0, SEARCH_WORKSPACE_PATHS_LIMIT),
  }
})
