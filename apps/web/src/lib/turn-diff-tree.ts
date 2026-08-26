export type TurnDiffTreeFile = {
  readonly path: string
  readonly additions: number
  readonly deletions: number
}

export type TurnDiffStat = {
  readonly additions: number
  readonly deletions: number
}

export type TurnDiffTreeDirectoryNode = {
  readonly kind: "directory"
  readonly name: string
  readonly path: string
  readonly stat: TurnDiffStat
  readonly children: ReadonlyArray<TurnDiffTreeNode>
}

export type TurnDiffTreeFileNode = {
  readonly kind: "file"
  readonly name: string
  readonly path: string
  readonly stat: TurnDiffStat
}

export type TurnDiffTreeNode = TurnDiffTreeDirectoryNode | TurnDiffTreeFileNode

type MutableDirectoryNode = {
  name: string
  path: string
  stat: { additions: number; deletions: number }
  directories: Map<string, MutableDirectoryNode>
  files: TurnDiffTreeFileNode[]
}

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" }

const normalizePathSegments = (pathValue: string): string[] =>
  pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0)

const compareByName = (left: { name: string }, right: { name: string }): number =>
  left.name.localeCompare(right.name, undefined, SORT_LOCALE_OPTIONS)

const compactDirectoryNode = (node: TurnDiffTreeDirectoryNode): TurnDiffTreeDirectoryNode => {
  const compactedChildren = node.children.map((child) =>
    child.kind === "directory" ? compactDirectoryNode(child) : child,
  )

  let compactedNode: TurnDiffTreeDirectoryNode = {
    ...node,
    children: compactedChildren,
  }

  while (compactedNode.children.length === 1 && compactedNode.children[0]?.kind === "directory") {
    const onlyChild = compactedNode.children[0]
    compactedNode = {
      kind: "directory",
      name: `${compactedNode.name}/${onlyChild.name}`,
      path: onlyChild.path,
      stat: onlyChild.stat,
      children: onlyChild.children,
    }
  }

  return compactedNode
}

const toTreeNodes = (directory: MutableDirectoryNode): ReadonlyArray<TurnDiffTreeNode> => {
  const subdirectories = Array.from(directory.directories.values())
    .toSorted(compareByName)
    .map((subdirectory): TurnDiffTreeDirectoryNode => ({
      kind: "directory",
      name: subdirectory.name,
      path: subdirectory.path,
      stat: {
        additions: subdirectory.stat.additions,
        deletions: subdirectory.stat.deletions,
      },
      children: toTreeNodes(subdirectory),
    }))
    .map((subdirectory) => compactDirectoryNode(subdirectory))

  const files = directory.files.toSorted(compareByName)
  return [...subdirectories, ...files]
}

export const hasNonZeroStat = (stat: TurnDiffStat): boolean =>
  stat.additions > 0 || stat.deletions > 0

export const summarizeTurnDiffStats = (files: ReadonlyArray<TurnDiffTreeFile>): TurnDiffStat =>
  files.reduce(
    (acc, file) => ({
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  )

export const buildTurnDiffTree = (
  files: ReadonlyArray<TurnDiffTreeFile>,
): ReadonlyArray<TurnDiffTreeNode> => {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    stat: { additions: 0, deletions: 0 },
    directories: new Map(),
    files: [],
  }

  for (const file of files) {
    const segments = normalizePathSegments(file.path)
    if (segments.length === 0) {
      continue
    }

    const filePath = segments.join("/")
    const fileName = segments.at(-1)
    if (fileName === undefined) {
      continue
    }

    const ancestors: MutableDirectoryNode[] = [root]
    let currentDirectory = root

    for (const segment of segments.slice(0, -1)) {
      const nextPath =
        currentDirectory.path === "" ? segment : `${currentDirectory.path}/${segment}`
      const existing = currentDirectory.directories.get(segment)
      if (existing !== undefined) {
        currentDirectory = existing
      } else {
        const created: MutableDirectoryNode = {
          name: segment,
          path: nextPath,
          stat: { additions: 0, deletions: 0 },
          directories: new Map(),
          files: [],
        }
        currentDirectory.directories.set(segment, created)
        currentDirectory = created
      }
      ancestors.push(currentDirectory)
    }

    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: filePath,
      stat: {
        additions: file.additions,
        deletions: file.deletions,
      },
    })

    for (const ancestor of ancestors) {
      ancestor.stat.additions += file.additions
      ancestor.stat.deletions += file.deletions
    }
  }

  return toTreeNodes(root)
}
