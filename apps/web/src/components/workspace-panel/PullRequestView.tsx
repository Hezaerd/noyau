import type { GitPullRequest } from "@noyau/contracts/git"
import { FileDiff, PatchDiff } from "@pierre/diffs/react"
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"

import { ThreadPreviewMarkdown } from "@/components/thread/ThreadPreviewMarkdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { WorkspaceTabRenderContext } from "@/components/workspace-panel/define-workspace-tab"
import { useAppearance } from "@/hooks/use-appearance"
import { useThreadShell } from "@/hooks/use-control-plane"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useProjectPullRequests } from "@/hooks/use-sidebar-queues"
import { resolveAppearance } from "@/lib/appearance"
import { gitGetPullRequest } from "@/lib/control-plane"
import {
  pullRequestReviewStateLabel,
  pullRequestTabTitle,
  pullRequestTimeline,
  resolvedPullRequestNumber,
  resolvedPullRequestUrl,
} from "@/lib/pull-request-view"
import { fileDiffPath, parseTurnDiffPatch, resolveDiffThemeName } from "@/lib/turn-diff-patch"
import { cn } from "@/lib/utils"
import { pullRequestStateLabel, vcsScopeForThread } from "@/lib/vcs-status"
import { patchWorkspaceTabPayload } from "@/state/workspace-panel"

export type PullRequestTabPayload = {
  readonly number: number | null
  readonly url: string | null
}

type PullRequestSection = "conversation" | "files"

export function PullRequestView({
  threadId,
  tab,
}: WorkspaceTabRenderContext<"pr", PullRequestTabPayload>) {
  const thread = useThreadShell(threadId)
  const pullRequests = useProjectPullRequests(thread?.projectId)
  const livePr = thread === undefined ? null : (pullRequests.get(thread.id) ?? null)
  const number = resolvedPullRequestNumber(tab.payload, livePr)
  const url = resolvedPullRequestUrl(tab.payload, livePr)
  const { preference } = useAppearance()
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const theme = resolveDiffThemeName(resolveAppearance(preference, systemDark))
  const [section, setSection] = useState<PullRequestSection>("conversation")
  const [pr, setPr] = useState<GitPullRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const selectedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (thread === undefined || livePr === null) {
      return
    }
    if (tab.payload.number === livePr.number && tab.payload.url === livePr.url) {
      return
    }
    if (tab.payload.number !== null && tab.payload.number !== livePr.number) {
      return
    }
    patchWorkspaceTabPayload(threadId, tab.id, { number: livePr.number, url: livePr.url })
  }, [livePr, tab.id, tab.payload.number, tab.payload.url, thread, threadId])

  useEffect(() => {
    if (thread === undefined || number === null) {
      setPr(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const result = await gitGetPullRequest({
        ...vcsScopeForThread(thread.projectId, thread),
        number,
      })
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.ok) {
        setPr(result.value)
        return
      }
      setPr(null)
      setError(
        result.failure._tag === "InvalidInput" && result.failure.message !== undefined
          ? result.failure.message
          : "Unable to load this pull request.",
      )
    })()
    return () => {
      cancelled = true
    }
  }, [generation, number, thread])

  const files = useMemo(() => (pr === null ? [] : parseTurnDiffPatch(pr.patch)), [pr])

  useEffect(() => {
    if (selectedPath === null || files.length === 0) {
      return
    }
    selectedRef.current?.scrollIntoView({ block: "start" })
  }, [files, selectedPath])

  const timeline = useMemo(() => (pr === null ? [] : pullRequestTimeline(pr)), [pr])

  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="workspace-pr">
      <header
        className="flex shrink-0 items-center gap-1 border-b border-border/70 px-1.5 py-1"
        data-slot="workspace-pr-chrome"
      >
        <p className="min-w-0 flex-1 truncate text-sm">
          {pr === null
            ? pullRequestTabTitle(tab.payload)
            : `${pullRequestTabTitle(pr)} · ${pr.title}`}
        </p>
        <Button
          aria-label="Reload pull request"
          className="text-muted-foreground"
          disabled={number === null || loading}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => setGeneration((current) => current + 1)}
        >
          <RefreshCwIcon />
        </Button>
        {url === null ? null : (
          <Button
            aria-label="Open on GitHub"
            className="text-muted-foreground"
            render={<a href={url} rel="noopener noreferrer" target="_blank" />}
            size="icon-xs"
            variant="ghost"
          >
            <ExternalLinkIcon />
          </Button>
        )}
      </header>
      <div className="flex shrink-0 gap-1 border-b border-border/70 px-1.5 py-1">
        <SectionButton
          active={section === "conversation"}
          label="Conversation"
          onSelect={() => setSection("conversation")}
        />
        <SectionButton
          active={section === "files"}
          label={pr === null ? "Files" : `Files · ${pr.files.length}`}
          onSelect={() => setSection("files")}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-slot="workspace-pr-body">
        {number === null ? (
          <p className="text-muted-foreground text-sm">This Thread has no pull request yet.</p>
        ) : null}
        {loading ? <p className="text-muted-foreground text-sm">Loading pull request…</p> : null}
        {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
        {pr === null || loading ? null : section === "conversation" ? (
          <ConversationSection pr={pr} timeline={timeline} />
        ) : (
          <FilesSection
            files={files}
            listed={pr.files}
            patch={pr.patch}
            selectedPath={selectedPath}
            selectedRef={selectedRef}
            theme={theme}
            onSelectPath={setSelectedPath}
          />
        )}
      </div>
    </div>
  )
}

function SectionButton({
  active,
  label,
  onSelect,
}: {
  readonly active: boolean
  readonly label: string
  readonly onSelect: () => void
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn(!active && "text-muted-foreground")}
      size="sm"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onSelect}
    >
      {label}
    </Button>
  )
}

function ConversationSection({
  pr,
  timeline,
}: {
  readonly pr: GitPullRequest
  readonly timeline: ReturnType<typeof pullRequestTimeline>
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge
          size="sm"
          variant={pr.state === "open" ? "success" : pr.state === "merged" ? "info" : "outline"}
        >
          {pullRequestStateLabel(pr.state)}
        </Badge>
        <p className="min-w-0 truncate text-muted-foreground text-xs">
          {pr.baseRef} ← {pr.headRef}
          {pr.author === null ? "" : ` · ${pr.author.login}`}
        </p>
      </div>
      {pr.body.trim() === "" ? (
        <p className="text-muted-foreground text-sm">No description.</p>
      ) : (
        <ThreadPreviewMarkdown text={pr.body} />
      )}
      {timeline.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reviews yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {timeline.map((item) =>
            item.kind === "review" ? (
              <li
                key={`review:${item.review.submittedAt ?? item.review.state}:${item.review.author?.login ?? "unknown"}`}
              >
                <p className="text-xs font-medium">
                  {item.review.author?.login ?? "Unknown"} ·{" "}
                  {pullRequestReviewStateLabel(item.review.state)}
                </p>
                {item.review.body.trim() === "" ? null : (
                  <ThreadPreviewMarkdown className="mt-1" text={item.review.body} />
                )}
              </li>
            ) : (
              <li
                key={`comment:${item.comment.createdAt}:${item.comment.author?.login ?? "unknown"}`}
              >
                <p className="text-xs font-medium">
                  {item.comment.author?.login ?? "Unknown"} · Commented
                </p>
                {item.comment.body.trim() === "" ? null : (
                  <ThreadPreviewMarkdown className="mt-1" text={item.comment.body} />
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}

function FilesSection({
  files,
  listed,
  patch,
  selectedPath,
  selectedRef,
  theme,
  onSelectPath,
}: {
  readonly files: ReturnType<typeof parseTurnDiffPatch>
  readonly listed: GitPullRequest["files"]
  readonly patch: string
  readonly selectedPath: string | null
  readonly selectedRef: RefObject<HTMLDivElement | null>
  readonly theme: ReturnType<typeof resolveDiffThemeName>
  readonly onSelectPath: (path: string) => void
}) {
  const paths =
    listed.length > 0
      ? listed
      : files.map((file) => ({
          path: fileDiffPath(file),
          additions: 0,
          deletions: 0,
        }))
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {paths.length === 0 ? (
        <p className="text-muted-foreground text-sm">No files changed.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {paths.map((file) => (
            <li key={file.path}>
              <button
                className={cn(
                  "flex w-full min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-start text-xs hover:bg-accent/60",
                  selectedPath === file.path && "bg-accent text-accent-foreground",
                )}
                type="button"
                onClick={() => onSelectPath(file.path)}
              >
                <span className="min-w-0 flex-1 truncate">{file.path}</span>
                {file.additions === 0 && file.deletions === 0 ? null : (
                  <span className="shrink-0 text-muted-foreground">
                    +{file.additions} −{file.deletions}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 ? (
        files.map((file) => {
          const path = fileDiffPath(file)
          const selected = selectedPath === path
          return (
            <div key={path} ref={selected ? selectedRef : undefined} className="min-w-0">
              <FileDiff
                disableWorkerPool
                fileDiff={file}
                options={{
                  collapsed: false,
                  diffStyle: "unified",
                  theme,
                }}
              />
            </div>
          )
        })
      ) : patch.trim() === "" ? null : (
        <PatchDiff
          disableWorkerPool
          options={{
            collapsed: false,
            diffStyle: "unified",
            theme,
          }}
          patch={patch}
        />
      )}
    </div>
  )
}
