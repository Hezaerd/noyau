import type { TranscriptTool, TranscriptToolAction } from "@noyau/contracts/entities/transcript"
import {
  BotIcon,
  ChevronDownIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { useId, useState, type KeyboardEvent, type ReactNode } from "react"

import { formatWorkspaceRelativePath } from "@/lib/markdown-file-links"
import {
  looksLikeToolPath,
  presentTranscriptTool,
  summarizeTranscriptToolGroup,
  transcriptToolDisplay,
  transcriptToolGroupKind,
  transcriptToolHeading,
  transcriptToolLiveLabel,
  transcriptToolPreview,
  type TranscriptToolGroupKind,
} from "@/lib/thread-transcript"
import { cn } from "@/lib/utils"

const toolActionIcon = (action: TranscriptToolAction | TranscriptToolGroupKind): ReactNode => {
  switch (action) {
    case "read":
      return <EyeIcon />
    case "file_change":
      return <SquarePenIcon />
    case "command":
      return <TerminalIcon />
    case "search":
      return <SearchIcon />
    case "fetch":
      return <GlobeIcon />
    case "think":
      return <BotIcon />
    case "mixed":
      return <HammerIcon />
    case "other":
      return <WrenchIcon />
  }
}

const formatToolPreview = (
  preview: string | undefined,
  workspaceRoot: string | undefined,
): string | undefined => {
  if (preview === undefined) {
    return undefined
  }
  return looksLikeToolPath(preview) ? formatWorkspaceRelativePath(preview, workspaceRoot) : preview
}

const StartTruncatedText = ({
  text,
  pathLike,
  className,
}: {
  readonly text: string
  readonly pathLike: boolean
  readonly className?: string
}) =>
  pathLike ? (
    <span className={cn("min-w-0 truncate text-left", className)} dir="rtl">
      <bdi>{text}</bdi>
    </span>
  ) : (
    <span className={cn("min-w-0 truncate", className)}>{text}</span>
  )

const ToolRowIcon = ({
  failed,
  children,
  hidden,
}: {
  readonly failed: boolean
  readonly children: ReactNode
  readonly hidden?: boolean
}) => (
  <span
    className={cn(
      "flex size-6 shrink-0 items-center justify-center text-muted-foreground",
      failed && "text-destructive",
      hidden && "invisible",
    )}
    role={failed ? "img" : undefined}
    aria-label={failed ? "Tool call failed" : undefined}
    aria-hidden={hidden === true || !failed}
  >
    <span className="flex size-4 items-center justify-center [&_svg]:size-4 [&_svg]:stroke-[1.8] [&_svg]:opacity-70">
      {failed ? <XIcon /> : children}
    </span>
  </span>
)

export function ThreadTranscriptTool({
  item,
  workspaceRoot,
  grouped = false,
}: {
  readonly item: TranscriptTool
  readonly workspaceRoot?: string | undefined
  readonly grouped?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const preview = formatToolPreview(transcriptToolPreview(item), workspaceRoot)
  const display = preview ?? transcriptToolHeading(item)
  const expandedBody = preview
  const canExpand = expandedBody !== undefined
  const failed = item.status === "error"
  const live = item.status === "in_progress"
  const pathLike = preview !== undefined && looksLikeToolPath(transcriptToolPreview(item) ?? "")
  const accessibleLabel = failed ? `${display}, tool call failed` : display

  const rowToggleProps = canExpand
    ? {
        role: "button" as const,
        tabIndex: 0 as const,
        "aria-label": accessibleLabel,
        "aria-expanded": expanded,
        onClick: () => {
          setExpanded((current) => !current)
        },
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setExpanded((current) => !current)
          }
        },
      }
    : {}

  return (
    <div
      className={cn(
        "flex flex-col rounded-md px-0.5 transition-colors",
        grouped ? "py-0" : "py-0.5",
        canExpand &&
          "cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
      {...rowToggleProps}
    >
      <div className="flex select-none items-center gap-1.5">
        <ToolRowIcon failed={failed} hidden={grouped && !failed}>
          {toolActionIcon(presentTranscriptTool(item).action)}
        </ToolRowIcon>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <p
            className={cn(
              "flex min-w-0 w-full items-baseline text-sm leading-relaxed",
              live && "shimmer",
            )}
          >
            <StartTruncatedText
              text={display}
              pathLike={pathLike}
              className={cn(
                "flex-1 text-muted-foreground",
                failed && "text-destructive",
                live && "text-foreground",
              )}
            />
          </p>
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center",
              !canExpand && "invisible",
            )}
            aria-hidden
          >
            <ChevronDownIcon
              className={cn(
                "size-3 text-muted-foreground opacity-70 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </span>
        </div>
      </div>
      {expanded && canExpand && expandedBody !== undefined ? (
        <div className="mt-1 ms-7 cursor-default border-s border-border/45 ps-3 pt-0.5">
          <pre className="max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words font-mono text-[length:var(--font-size-code,0.6875rem)] leading-relaxed text-muted-foreground select-text">
            {expandedBody}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export function ThreadTranscriptToolGroup({
  items,
  workspaceRoot,
}: {
  readonly items: ReadonlyArray<TranscriptTool>
  readonly workspaceRoot?: string | undefined
}) {
  const listId = useId()
  const [expanded, setExpanded] = useState(false)
  const liveItem = items.reduceRight<TranscriptTool | undefined>(
    (found, item) => found ?? (item.status === "in_progress" ? item : undefined),
    undefined,
  )
  const failed = items.some((item) => item.status === "error")
  const summary = summarizeTranscriptToolGroup(items)
  const kind = transcriptToolGroupKind(items)
  const liveLabel =
    liveItem === undefined
      ? undefined
      : (formatToolPreview(transcriptToolLiveLabel(liveItem), workspaceRoot) ??
        transcriptToolDisplay(liveItem))
  const label = liveLabel ?? summary
  const pathLike =
    liveItem !== undefined && looksLikeToolPath(transcriptToolPreview(liveItem) ?? "")

  return (
    <div>
      <button
        type="button"
        className="flex min-h-6 w-full cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-sm leading-relaxed transition-colors duration-150 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={failed ? `${label}, tool call failed` : label}
        onClick={() => {
          setExpanded((current) => !current)
        }}
      >
        <ToolRowIcon failed={failed && liveItem === undefined}>
          {liveItem === undefined
            ? toolActionIcon(kind)
            : toolActionIcon(presentTranscriptTool(liveItem).action)}
        </ToolRowIcon>
        <StartTruncatedText
          text={label}
          pathLike={pathLike}
          className={cn(
            "flex-1 text-muted-foreground",
            liveItem !== undefined && "shimmer text-foreground",
            failed && liveItem === undefined && "text-destructive",
          )}
        />
      </button>
      {expanded ? (
        <div id={listId} className="flex flex-col gap-px">
          {items.map((item) => (
            <ThreadTranscriptTool
              key={item.toolCallId}
              item={item}
              workspaceRoot={workspaceRoot}
              grouped
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
