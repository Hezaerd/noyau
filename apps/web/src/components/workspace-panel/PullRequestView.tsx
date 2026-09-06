import type {
  GitPullRequest,
  GitPullRequestReviewCommentDraft,
  GitPullRequestReviewVerdict,
} from "@noyau/contracts/git"
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type RefObject, type UIEventHandler } from "react"

import { TurnDiffStatLabel } from "@/components/thread/TurnDiffStatLabel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toastManager } from "@/components/ui/toast"
import type { WorkspaceTabRenderContext } from "@/components/workspace-panel/define-workspace-tab"
import { PullRequestCode } from "@/components/workspace-panel/PullRequestCode"
import { PullRequestSummary } from "@/components/workspace-panel/PullRequestSummary"
import { PullRequestTimeline } from "@/components/workspace-panel/PullRequestTimeline"
import { useAppearance } from "@/hooks/use-appearance"
import { useThreadShell } from "@/hooks/use-control-plane"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useProjectPullRequests } from "@/hooks/use-sidebar-queues"
import { resolveAppearance } from "@/lib/appearance"
import { gitGetPullRequest, gitSubmitPullRequestReview } from "@/lib/control-plane"
import { formatDateTime } from "@/lib/format-date-time"
import {
  pullRequestRepositoryLabel,
  pullRequestTabTitle,
  resolvedPullRequestNumber,
  resolvedPullRequestUrl,
} from "@/lib/pull-request-view"
import { resolveDiffThemeName } from "@/lib/turn-diff-patch"
import { cn } from "@/lib/utils"
import { pullRequestStateLabel, vcsScopeForThread } from "@/lib/vcs-status"
import { patchWorkspaceTabPayload } from "@/state/workspace-panel"

export type PullRequestTabPayload = {
  readonly number: number | null
  readonly url: string | null
}

type PullRequestSection = "summary" | "timeline" | "code"

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
  const [section, setSection] = useState<PullRequestSection>("summary")
  const [pr, setPr] = useState<GitPullRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [commitOid, setCommitOid] = useState<string | null>(null)
  const [condensed, setCondensed] = useState(false)
  const expandedHeaderRef = useRef<HTMLDivElement | null>(null)
  const threadIdFromShell = thread?.id
  const projectIdFromShell = thread?.projectId
  const worktreePathFromShell = thread?.worktreePath

  useEffect(() => {
    if (thread === undefined || livePr === null) return
    if (tab.payload.number === livePr.number && tab.payload.url === livePr.url) return
    if (tab.payload.number !== null && tab.payload.number !== livePr.number) return
    patchWorkspaceTabPayload(threadId, tab.id, { number: livePr.number, url: livePr.url })
  }, [livePr, tab.id, tab.payload.number, tab.payload.url, thread, threadId])

  useEffect(() => {
    setPr(null)
    setError(null)
    setCommitOid(null)
    setCondensed(false)
  }, [number])

  useEffect(() => {
    if (threadIdFromShell === undefined || projectIdFromShell === undefined || number === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const scope = vcsScopeForThread(
        projectIdFromShell,
        worktreePathFromShell === undefined
          ? { id: threadIdFromShell }
          : { id: threadIdFromShell, worktreePath: worktreePathFromShell },
      )
      const input = commitOid === null ? { ...scope, number } : { ...scope, number, commitOid }
      const result = await gitGetPullRequest(input)
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setPr(result.value)
        return
      }
      setError("Unable to load this pull request. Check that GitHub CLI can access it.")
    })()
    return () => {
      cancelled = true
    }
  }, [commitOid, generation, number, projectIdFromShell, threadIdFromShell, worktreePathFromShell])

  useEffect(() => setCondensed(false), [section])

  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const top = event.currentTarget.scrollTop
    if (condensed) {
      if (top < 4) setCondensed(false)
      return
    }
    const foldHeight = expandedHeaderRef.current?.scrollHeight ?? 0
    if (foldHeight > 0 && top > foldHeight + 24) {
      event.currentTarget.scrollTop = Math.max(0, top - foldHeight)
      setCondensed(true)
    }
  }

  const submitReview = async (
    verdict: GitPullRequestReviewVerdict,
    body: string,
    comments: ReadonlyArray<GitPullRequestReviewCommentDraft>,
  ): Promise<boolean> => {
    if (thread === undefined || number === null) return false
    const result = await gitSubmitPullRequestReview({
      ...vcsScopeForThread(thread.projectId, thread),
      number,
      verdict,
      body,
      comments,
    })
    if (!result.ok) {
      toastManager.add({ type: "error", title: "The review could not be submitted" })
      return false
    }
    toastManager.add({
      type: "success",
      title:
        verdict === "approve"
          ? "Pull request approved"
          : verdict === "request_changes"
            ? "Changes requested"
            : "Review submitted",
    })
    setGeneration((current) => current + 1)
    return true
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-slot="workspace-pr">
      <PullRequestHeader
        condensed={condensed}
        expandedHeaderRef={expandedHeaderRef}
        loading={loading}
        number={number}
        pr={pr}
        tab={tab.payload}
        url={url}
        onReload={() => setGeneration((current) => current + 1)}
      />
      <nav className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
        <div className="flex rounded-lg bg-muted/50 p-0.5">
          <SectionButton
            active={section === "summary"}
            label="Summary"
            onSelect={() => setSection("summary")}
          />
          <SectionButton
            active={section === "timeline"}
            label="Timeline"
            onSelect={() => setSection("timeline")}
          />
          <SectionButton
            active={section === "code"}
            label="Code"
            onSelect={() => setSection("code")}
          />
        </div>
        {pr === null ? null : (
          <span className="hidden items-center gap-1.5 text-muted-foreground text-xs sm:flex">
            <FileDiffIcon className="size-3.5" />
            {pr.files.length}
            <TurnDiffStatLabel additions={pr.additions} deletions={pr.deletions} layout="inline" />
          </span>
        )}
      </nav>

      {number === null ? (
        <EmptyState />
      ) : pr === null && loading ? (
        <PullRequestSkeleton />
      ) : pr === null ? (
        <ErrorState error={error} url={url} onRetry={() => setGeneration((value) => value + 1)} />
      ) : section === "code" ? (
        <div className="min-h-0 flex-1">
          <PullRequestCode
            commitOid={commitOid}
            loading={loading}
            pr={pr}
            theme={theme}
            onCommitChange={setCommitOid}
            onScroll={handleScroll}
            onSubmitReview={submitReview}
          />
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          data-slot="workspace-pr-body"
          onScroll={handleScroll}
        >
          {error === null ? null : (
            <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-destructive text-xs">
              {error}
            </div>
          )}
          {section === "summary" ? <PullRequestSummary pr={pr} /> : <PullRequestTimeline pr={pr} />}
        </div>
      )}
    </div>
  )
}

function PullRequestHeader({
  condensed,
  expandedHeaderRef,
  loading,
  number,
  pr,
  tab,
  url,
  onReload,
}: {
  readonly condensed: boolean
  readonly expandedHeaderRef: RefObject<HTMLDivElement | null>
  readonly loading: boolean
  readonly number: number | null
  readonly pr: GitPullRequest | null
  readonly tab: PullRequestTabPayload
  readonly url: string | null
  readonly onReload: () => void
}) {
  return (
    <header className="shrink-0 border-b border-border/70" data-slot="workspace-pr-chrome">
      <div className="flex h-9 min-w-0 items-center gap-1 px-3">
        <GitPullRequestIcon className="size-3.5 shrink-0 text-success" />
        <p className="min-w-0 flex-1 truncate text-sm">
          {pr === null
            ? pullRequestTabTitle(tab)
            : condensed
              ? `#${pr.number} ${pr.title}`
              : `${pullRequestRepositoryLabel(pr.url)} #${pr.number}`}
        </p>
        <Button
          aria-label="Reload pull request"
          className="text-muted-foreground"
          disabled={number === null}
          loading={loading}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={onReload}
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
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-150 motion-reduce:transition-none",
          condensed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div ref={expandedHeaderRef} className="min-h-0 overflow-hidden">
          {pr === null ? (
            <div className="space-y-3 px-4 pb-4 pt-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ) : (
            <div className="px-4 pb-4 pt-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 flex-1 text-base font-semibold leading-snug">{pr.title}</h1>
                <Badge
                  size="sm"
                  variant={
                    pr.state === "open" ? "success" : pr.state === "merged" ? "info" : "outline"
                  }
                >
                  {pullRequestStateLabel(pr.state)}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {pr.author?.login ?? "Unknown author"} · updated {formatDateTime(pr.updatedAt)}
              </p>
              <div className="mt-3 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
                <code className="max-w-[40%] truncate">{pr.baseRef}</code>
                <ArrowLeftIcon className="size-3 shrink-0" />
                <code className="min-w-0 flex-1 truncate">{pr.headRef}</code>
                <span className="shrink-0">{pr.files.length} files</span>
                <TurnDiffStatLabel
                  additions={pr.additions}
                  deletions={pr.deletions}
                  layout="inline"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
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
      className={cn("h-7 rounded-md px-3", !active && "text-muted-foreground")}
      size="xs"
      type="button"
      variant={active ? "secondary" : "ghost"}
      onClick={onSelect}
    >
      {label}
    </Button>
  )
}

function PullRequestSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-5" aria-label="Loading pull request">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <GitPullRequestIcon className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">No pull request yet</p>
      <p className="max-w-sm text-muted-foreground text-xs">
        Open this tab again after the Thread has a pull request.
      </p>
    </div>
  )
}

function ErrorState({
  error,
  url,
  onRetry,
}: {
  readonly error: string | null
  readonly url: string | null
  readonly onRetry: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium">Pull request unavailable</p>
      <p className="max-w-sm text-muted-foreground text-xs">
        {error ?? "Unable to load this pull request."}
      </p>
      <div className="flex gap-2">
        <Button size="xs" type="button" variant="outline" onClick={onRetry}>
          <RefreshCwIcon /> Retry
        </Button>
        {url === null ? null : (
          <Button
            render={<a href={url} rel="noopener noreferrer" target="_blank" />}
            size="xs"
            variant="outline"
          >
            <ExternalLinkIcon /> Open on GitHub
          </Button>
        )}
      </div>
    </div>
  )
}
