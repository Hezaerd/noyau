import { summarizeTurnDiffStats, type TurnDiffTreeFile } from "@/lib/turn-diff-tree"

export const CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT = 5
export const CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT = 200
export const CHANGED_FILES_PREVIEW_FILE_LIMIT = 3
export const CHANGED_FILES_PREVIEW_SCOPE_LIMIT = 4

export type ChangedFilesScopeSummary = {
  readonly label: string
  readonly fileCount: number
}

const pathSegments = (pathValue: string): string[] =>
  pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0)

const ROOT_SCOPE_KEY = ""
const ROOT_SCOPE_LABEL = "root"

type ChangedFileScope = {
  readonly key: string
  readonly label: string
}

export const changedFileName = (pathValue: string): string =>
  pathSegments(pathValue).at(-1) ?? pathValue

const changedFileScope = (pathValue: string): ChangedFileScope => {
  const segments = pathSegments(pathValue)
  if (segments.length > 1) {
    const label = segments[0] ?? ROOT_SCOPE_LABEL
    return { key: label, label }
  }
  return { key: ROOT_SCOPE_KEY, label: ROOT_SCOPE_LABEL }
}

export const shouldAutoExpandChangedFiles = (
  files: ReadonlyArray<TurnDiffTreeFile>,
  isLatestTurn: boolean,
): boolean => {
  if (!isLatestTurn || files.length > CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT) {
    return false
  }
  const stat = summarizeTurnDiffStats(files)
  return stat.additions + stat.deletions <= CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT
}

export const summarizeChangedFileScopes = (
  files: ReadonlyArray<TurnDiffTreeFile>,
  limit = CHANGED_FILES_PREVIEW_SCOPE_LIMIT,
): ReadonlyArray<ChangedFilesScopeSummary> => {
  const scopes = new Map<string, { label: string; fileCount: number; firstIndex: number }>()
  files.forEach((file, index) => {
    const scope = changedFileScope(file.path)
    const current = scopes.get(scope.key)
    scopes.set(scope.key, {
      label: scope.label,
      fileCount: (current?.fileCount ?? 0) + 1,
      firstIndex: current?.firstIndex ?? index,
    })
  })

  return Array.from(scopes, ([, scope]) => ({
    label: scope.label,
    fileCount: scope.fileCount,
    firstIndex: scope.firstIndex,
  }))
    .toSorted(
      (left, right) =>
        right.fileCount - left.fileCount ||
        left.firstIndex - right.firstIndex ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit)
    .map(({ label, fileCount }) => ({ label, fileCount }))
}

export const selectChangedFilePreview = (
  files: ReadonlyArray<TurnDiffTreeFile>,
  limit = CHANGED_FILES_PREVIEW_FILE_LIMIT,
): ReadonlyArray<TurnDiffTreeFile> => {
  const selected: TurnDiffTreeFile[] = []
  const selectedPaths = new Set<string>()
  const selectedScopes = new Set<string>()

  for (const file of files) {
    const scope = changedFileScope(file.path)
    if (selectedScopes.has(scope.key)) {
      continue
    }
    selected.push(file)
    selectedPaths.add(file.path)
    selectedScopes.add(scope.key)
    if (selected.length === limit) {
      return selected
    }
  }

  for (const file of files) {
    if (selectedPaths.has(file.path)) {
      continue
    }
    selected.push(file)
    if (selected.length === limit) {
      break
    }
  }

  return selected
}
