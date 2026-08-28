import type { TurnDiff } from "@noyau/contracts/entities/turn"
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FileDiffIcon,
  FolderClosedIcon,
  FolderIcon,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"

import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import { TurnDiffStatLabel } from "@/components/thread/TurnDiffStatLabel"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import {
  changedFileName,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileScopes,
} from "@/lib/turn-diff-presentation"
import {
  buildTurnDiffTree,
  hasNonZeroStat,
  summarizeTurnDiffStats,
  type TurnDiffTreeNode,
} from "@/lib/turn-diff-tree"
import { cn } from "@/lib/utils"

const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {}

const collectDirectoryPaths = (nodes: ReadonlyArray<TurnDiffTreeNode>): string[] => {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.kind !== "directory") {
      continue
    }
    paths.push(node.path)
    paths.push(...collectDirectoryPaths(node.children))
  }
  return paths
}

const ThreadTurnDiffTree = memo(function ThreadTurnDiffTree({
  files,
  allDirectoriesExpanded,
  onOpen,
}: {
  readonly files: TurnDiff["files"]
  readonly allDirectoriesExpanded: boolean
  readonly onOpen?: (filePath?: string) => void
}) {
  const treeNodes = useMemo(() => buildTurnDiffTree(files), [files])
  const directoryPathsKey = useMemo(
    () => collectDirectoryPaths(treeNodes).join("\u0000"),
    [treeNodes],
  )
  const hasDirectoryNodes = directoryPathsKey.length > 0
  const expansionStateKey = `${allDirectoriesExpanded ? "expanded" : "collapsed"}\u0000${directoryPathsKey}`
  const [directoryExpansionState, setDirectoryExpansionState] = useState<{
    key: string
    overrides: Record<string, boolean>
  }>(() => ({
    key: expansionStateKey,
    overrides: {},
  }))
  const expandedDirectories =
    directoryExpansionState.key === expansionStateKey
      ? directoryExpansionState.overrides
      : EMPTY_DIRECTORY_OVERRIDES

  const toggleDirectory = useCallback(
    (pathValue: string) => {
      setDirectoryExpansionState((current) => {
        const nextOverrides = current.key === expansionStateKey ? current.overrides : {}
        return {
          key: expansionStateKey,
          overrides: {
            ...nextOverrides,
            [pathValue]: !(nextOverrides[pathValue] ?? allDirectoriesExpanded),
          },
        }
      })
    },
    [allDirectoriesExpanded, expansionStateKey],
  )

  const renderTreeNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 14
    if (node.kind === "directory") {
      const isExpanded = expandedDirectories[node.path] ?? allDirectoriesExpanded
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 rounded-xl py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            style={{ paddingLeft: `${leftPadding}px` }}
            onClick={() => toggleDirectory(node.path)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
            ) : (
              <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
            )}
            <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
              {node.name}
            </span>
            {hasNonZeroStat(node.stat) ? (
              <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
                <TurnDiffStatLabel
                  additions={node.stat.additions}
                  deletions={node.stat.deletions}
                />
              </span>
            ) : null}
          </button>
          {isExpanded ? (
            <div className="flex flex-col gap-0.5">
              {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
            </div>
          ) : null}
        </div>
      )
    }

    const fileRowClassName =
      "group flex w-full items-center gap-1.5 rounded-xl py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    const fileRow = (
      <>
        {hasDirectoryNodes || depth > 0 ? (
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        <PierreEntryIcon
          pathValue={node.path}
          kind="file"
          className="size-3.5 text-muted-foreground/70"
        />
        <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
          {node.name}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
          <TurnDiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
        </span>
      </>
    )

    if (onOpen === undefined) {
      return (
        <div
          key={`file:${node.path}`}
          className={fileRowClassName}
          style={{ paddingLeft: `${leftPadding}px` }}
        >
          {fileRow}
        </div>
      )
    }

    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className={fileRowClassName}
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => onOpen(node.path)}
      >
        {fileRow}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">{treeNodes.map((node) => renderTreeNode(node, 0))}</div>
  )
})

export function ThreadTurnDiffCard({
  turnDiff,
  onOpen,
  isLatestTurn = false,
}: {
  readonly turnDiff: TurnDiff
  readonly onOpen?: (filePath?: string) => void
  readonly isLatestTurn?: boolean
}) {
  const files = turnDiff.files
  const [autoExpanded] = useState(() => shouldAutoExpandChangedFiles(files, isLatestTurn))
  const [expanded, setExpanded] = useState(autoExpanded)
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(autoExpanded)
  useEffect(() => {
    if (!isLatestTurn) {
      setExpanded(false)
    }
  }, [isLatestTurn])
  const summaryStat = useMemo(() => summarizeTurnDiffStats(files), [files])
  const scopeSummary = useMemo(() => summarizeChangedFileScopes(files), [files])
  const previewFiles = useMemo(() => selectChangedFilePreview(files), [files])
  const compactPreviewVisible = isLatestTurn && !expanded

  if (files.length === 0) {
    return null
  }

  return (
    <div
      className="@container/changed-files mt-3 rounded-2xl border border-border/70 bg-secondary p-2 dark:border-transparent dark:bg-input/32"
      data-changed-files-state={
        expanded ? "expanded" : compactPreviewVisible ? "preview" : "collapsed"
      }
    >
      <div
        data-changed-files-header=""
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl",
          expanded &&
            "sticky top-2 z-10 mb-2 bg-secondary dark:bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))]",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 items-center rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90",
              )}
            />
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-foreground text-xs leading-4">
              <span>
                {files.length} fichier{files.length === 1 ? "" : "s"} modifié
                {files.length === 1 ? "" : "s"}
              </span>
              {hasNonZeroStat(summaryStat) ? (
                <TurnDiffStatLabel
                  additions={summaryStat.additions}
                  deletions={summaryStat.deletions}
                  className="text-xs leading-4"
                  layout="inline"
                />
              ) : null}
            </span>
            <span className="ml-1 hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground group-hover:text-foreground/80 @[24rem]/changed-files:inline">
              {expanded ? "Masquer les fichiers" : "Afficher les fichiers"}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          {expanded ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="!size-[22px]"
                    aria-label={
                      allDirectoriesExpanded ? "Réduire les dossiers" : "Déplier les dossiers"
                    }
                    onClick={() => setAllDirectoriesExpanded((current) => !current)}
                  />
                }
              >
                {allDirectoriesExpanded ? (
                  <ChevronsDownUpIcon className="size-3" />
                ) : (
                  <ChevronsUpDownIcon className="size-3" />
                )}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {allDirectoriesExpanded ? "Réduire les dossiers" : "Déplier les dossiers"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {onOpen === undefined ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    aria-label="Ouvrir le patch"
                    onClick={() => onOpen(files[0]?.path)}
                  />
                }
              >
                <FileDiffIcon className="size-3" />
                <span className="hidden @[24rem]/changed-files:inline">Ouvrir le patch</span>
              </TooltipTrigger>
              <TooltipPopup side="top">Ouvrir le patch complet</TooltipPopup>
            </Tooltip>
          )}
        </div>
      </div>
      {expanded ? (
        <ThreadTurnDiffTree
          files={files}
          allDirectoriesExpanded={allDirectoriesExpanded}
          {...(onOpen === undefined ? {} : { onOpen })}
        />
      ) : compactPreviewVisible ? (
        <div className="px-2 pt-1 pb-1.5">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {scopeSummary.map((scope, index) => (
              <span key={scope.label} className="inline-flex items-center gap-1">
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <span className="font-mono text-foreground/75">{scope.label}</span>
                <span>
                  {scope.fileCount} fichier{scope.fileCount === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {previewFiles.map((file) => {
              const chip = (
                <>
                  <PierreEntryIcon
                    pathValue={file.path}
                    kind="file"
                    className="size-3 shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">{changedFileName(file.path)}</span>
                </>
              )
              return onOpen === undefined ? (
                <span
                  key={file.path}
                  title={file.path}
                  className="inline-flex max-w-48 items-center gap-1 rounded-md border border-border/70 bg-background/45 px-1.5 py-1 font-mono text-[10px] text-muted-foreground"
                >
                  {chip}
                </span>
              ) : (
                <button
                  key={file.path}
                  type="button"
                  title={file.path}
                  className="inline-flex max-w-48 items-center gap-1 rounded-md border border-border/70 bg-background/45 px-1.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpen(file.path)}
                >
                  {chip}
                </button>
              )
            })}
            <button
              type="button"
              className="rounded-md px-1.5 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded(true)}
            >
              Afficher les {files.length} fichiers
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
