import type {
  GitPullRequest,
  GitPullRequestReviewCommentDraft,
  GitPullRequestReviewVerdict,
} from "@noyau/contracts/git"
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs"
import { FileDiff, PatchDiff } from "@pierre/diffs/react"
import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  Columns2Icon,
  MessageSquareIcon,
  Rows3Icon,
  WrapTextIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode, type UIEventHandler } from "react"

import { TurnDiffStatLabel } from "@/components/thread/TurnDiffStatLabel"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { canSubmitPullRequestReview, pullRequestLinePosition } from "@/lib/pull-request-view"
import { fileDiffPath, parseTurnDiffPatch, type DiffThemeName } from "@/lib/turn-diff-patch"
import { cn } from "@/lib/utils"

type PendingReviewComment = GitPullRequestReviewCommentDraft & { readonly id: number }

type ReviewAnnotation =
  | { readonly kind: "draft"; readonly path: string }
  | { readonly kind: "pending"; readonly comment: PendingReviewComment }

export function PullRequestCode({
  pr,
  commitOid,
  loading,
  theme,
  onCommitChange,
  onScroll,
  onSubmitReview,
}: {
  readonly pr: GitPullRequest
  readonly commitOid: string | null
  readonly loading: boolean
  readonly theme: DiffThemeName
  readonly onCommitChange: (commitOid: string | null) => void
  readonly onScroll: UIEventHandler<HTMLDivElement>
  readonly onSubmitReview: (
    verdict: GitPullRequestReviewVerdict,
    body: string,
    comments: ReadonlyArray<GitPullRequestReviewCommentDraft>,
  ) => Promise<boolean>
}) {
  const files = useMemo(() => parseTurnDiffPatch(pr.patch), [pr.patch])
  const paths = useMemo(() => files.map(fileDiffPath), [files])
  const scopedFileStats = useMemo(
    () =>
      new Map(
        files.map((file) => [
          fileDiffPath(file),
          file.hunks.reduce(
            (total, hunk) => ({
              additions: total.additions + hunk.additionLines,
              deletions: total.deletions + hunk.deletionLines,
            }),
            { additions: 0, deletions: 0 },
          ),
        ]),
      ),
    [files],
  )
  const scopedStats = useMemo(
    () =>
      Array.from(scopedFileStats.values()).reduce(
        (total, stat) => ({
          additions: total.additions + stat.additions,
          deletions: total.deletions + stat.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [scopedFileStats],
  )
  const displayedStats = commitOid === null ? pr : scopedStats
  const [renderMode, setRenderMode] = useState<"unified" | "split">("unified")
  const [wordWrap, setWordWrap] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(paths))
  const [draft, setDraft] = useState<{
    readonly path: string
    readonly range: SelectedLineRange
  } | null>(null)
  const [pendingComments, setPendingComments] = useState<ReadonlyArray<PendingReviewComment>>([])
  const [nextCommentId, setNextCommentId] = useState(1)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewBody, setReviewBody] = useState("")
  const [reviewPending, setReviewPending] = useState(false)

  useEffect(() => {
    setCollapsed(new Set(paths))
    setDraft(null)
  }, [commitOid, paths])

  useEffect(() => {
    setPendingComments([])
    setReviewBody("")
    setReviewOpen(false)
  }, [pr.number])

  const selectedCommit =
    commitOid === null ? null : (pr.commits.find((commit) => commit.oid === commitOid) ?? null)
  const allCollapsed = paths.length > 0 && paths.every((path) => collapsed.has(path))

  const togglePath = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const beginComment = (path: string, range: SelectedLineRange | null) => {
    if (range === null || commitOid !== null) {
      return
    }
    setDraft({ path, range })
  }

  const submitReview = async (verdict: GitPullRequestReviewVerdict) => {
    if (reviewPending || !canSubmitPullRequestReview(verdict, reviewBody, pendingComments.length)) {
      return
    }
    const submittedBody = reviewBody
    const submittedComments = pendingComments
    setReviewPending(true)
    const submitted = await onSubmitReview(verdict, submittedBody, submittedComments)
    setReviewPending(false)
    if (!submitted) {
      return
    }
    const submittedIds = new Set(submittedComments.map((comment) => comment.id))
    setPendingComments((current) => current.filter((comment) => !submittedIds.has(comment.id)))
    setReviewBody((current) => (current === submittedBody ? "" : current))
    setReviewOpen(false)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-slot="workspace-pr-code">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <div className="min-w-0 flex-1">
          <Select
            value={commitOid ?? "all"}
            onValueChange={(value) =>
              onCommitChange(value === null || value === "all" ? null : value)
            }
          >
            <SelectTrigger aria-label="Diff scope" className="w-full max-w-72 min-w-0" size="sm">
              <SelectValue>
                <span className="truncate">
                  {selectedCommit?.messageHeadline ||
                    (commitOid === null ? "All commits" : commitOid)}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false} className="w-80">
              <SelectItem value="all">All commits</SelectItem>
              {pr.commits.map((commit) => (
                <SelectItem key={commit.oid} value={commit.oid}>
                  <span className="min-w-0 flex-1 truncate">
                    {commit.messageHeadline || "Commit"}
                  </span>
                  <code className="ml-auto text-muted-foreground text-xs">
                    {commit.oid.slice(0, 7)}
                  </code>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
          {pr.files.length} {pr.files.length === 1 ? "file" : "files"}
        </span>
        <TurnDiffStatLabel
          additions={displayedStats.additions}
          className="hidden shrink-0 text-xs md:inline-flex"
          deletions={displayedStats.deletions}
          layout="inline"
        />
        <ToolbarButton
          label={allCollapsed ? "Expand all files" : "Collapse all files"}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(paths))}
        >
          {allCollapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
        </ToolbarButton>
        <ToolbarButton
          active={renderMode === "unified"}
          label="Unified diff"
          onClick={() => setRenderMode("unified")}
        >
          <Rows3Icon />
        </ToolbarButton>
        <ToolbarButton
          active={renderMode === "split"}
          label="Split diff"
          onClick={() => setRenderMode("split")}
        >
          <Columns2Icon />
        </ToolbarButton>
        <ToolbarButton
          active={wordWrap}
          label="Wrap long lines"
          onClick={() => setWordWrap((v) => !v)}
        >
          <WrapTextIcon />
        </ToolbarButton>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-3"
        data-slot="workspace-pr-code-scroller"
        onScroll={onScroll}
      >
        {loading ? (
          <div className="mb-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
            Loading {selectedCommit === null ? "pull request" : "commit"} diff…
          </div>
        ) : null}
        {commitOid === null ? null : (
          <p className="mb-3 text-muted-foreground text-xs">
            Line comments are anchored to the whole pull request. Switch to All commits to add one.
          </p>
        )}
        {files.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-2">
            {files.map((file) => {
              const path = fileDiffPath(file)
              const fileStat =
                commitOid === null
                  ? pr.files.find((entry) => entry.path === path)
                  : scopedFileStats.get(path)
              const isCollapsed = collapsed.has(path)
              const annotations = reviewAnnotations(path, draft, pendingComments)
              return (
                <section
                  key={path}
                  className="min-w-0 overflow-hidden rounded-lg border border-border/70"
                >
                  <button
                    aria-expanded={!isCollapsed}
                    className="flex h-9 w-full min-w-0 items-center gap-2 bg-muted/25 px-3 text-start text-xs hover:bg-muted/50"
                    type="button"
                    onClick={() => togglePath(path)}
                  >
                    <span className="text-muted-foreground">{isCollapsed ? "›" : "⌄"}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{path}</span>
                    {fileStat === undefined ? null : (
                      <TurnDiffStatLabel
                        additions={fileStat.additions}
                        deletions={fileStat.deletions}
                        layout="inline"
                      />
                    )}
                  </button>
                  {isCollapsed ? null : (
                    <FileDiff<ReviewAnnotation>
                      disableWorkerPool
                      fileDiff={file}
                      lineAnnotations={annotations}
                      options={{
                        diffStyle: renderMode,
                        disableFileHeader: true,
                        enableGutterUtility: commitOid === null && draft === null,
                        enableLineSelection: commitOid === null && draft === null,
                        lineDiffType: "word",
                        overflow: wordWrap ? "wrap" : "scroll",
                        theme,
                        onGutterUtilityClick: (range) => beginComment(path, range),
                        onLineSelectionEnd: (range) => beginComment(path, range),
                      }}
                      selectedLines={draft?.path === path ? draft.range : null}
                      renderAnnotation={(annotation) => (
                        <ReviewAnnotationView
                          annotation={annotation}
                          onAdd={(body) => {
                            const position = pullRequestLinePosition(
                              draft?.range ?? {
                                start: annotation.lineNumber,
                                end: annotation.lineNumber,
                                side: annotation.side,
                              },
                            )
                            setPendingComments((current) => [
                              ...current,
                              { id: nextCommentId, path, ...position, body },
                            ])
                            setNextCommentId((value) => value + 1)
                            setDraft(null)
                          }}
                          onCancel={() => setDraft(null)}
                          onRemove={(id) =>
                            setPendingComments((current) =>
                              current.filter((comment) => comment.id !== id),
                            )
                          }
                        />
                      )}
                    />
                  )}
                </section>
              )
            })}
          </div>
        ) : pr.patch.trim() === "" ? (
          <p className="text-muted-foreground text-sm">No files changed in this scope.</p>
        ) : (
          <PatchDiff
            disableWorkerPool
            options={{
              diffStyle: renderMode,
              lineDiffType: "word",
              overflow: wordWrap ? "wrap" : "scroll",
              theme,
            }}
            patch={pr.patch}
          />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        {reviewOpen ? (
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur-xl">
            <Button
              aria-label="Close review"
              className="absolute right-2 top-2"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={() => setReviewOpen(false)}
            >
              <XIcon />
            </Button>
            <p className="pr-8 text-muted-foreground text-xs">
              {pendingComments.length === 0
                ? "No line comments yet"
                : `${pendingComments.length} ${pendingComments.length === 1 ? "comment" : "comments"} pending`}
            </p>
            <Textarea
              aria-label="Review summary"
              className="mt-2"
              disabled={reviewPending}
              placeholder="Summarize your review (optional)"
              size="sm"
              value={reviewBody}
              onChange={(event) => setReviewBody(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <ReviewButton
                disabled={
                  !canSubmitPullRequestReview("comment", reviewBody, pendingComments.length)
                }
                loading={reviewPending}
                onClick={() => void submitReview("comment")}
              >
                <MessageSquareIcon /> Comment
              </ReviewButton>
              <ReviewButton loading={reviewPending} onClick={() => void submitReview("approve")}>
                <CheckIcon /> Approve
              </ReviewButton>
              <ReviewButton
                disabled={
                  !canSubmitPullRequestReview("request_changes", reviewBody, pendingComments.length)
                }
                loading={reviewPending}
                onClick={() => void submitReview("request_changes")}
              >
                <XCircleIcon /> Request changes
              </ReviewButton>
            </div>
          </div>
        ) : (
          <Button
            className="pointer-events-auto absolute bottom-3 right-4 rounded-full shadow-lg"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setReviewOpen(true)}
          >
            <MessageSquareIcon />
            Review
            {pendingComments.length === 0 ? null : (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {pendingComments.length}
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

function reviewAnnotations(
  path: string,
  draft: { readonly path: string; readonly range: SelectedLineRange } | null,
  pending: ReadonlyArray<PendingReviewComment>,
): Array<DiffLineAnnotation<ReviewAnnotation>> {
  const annotations: Array<DiffLineAnnotation<ReviewAnnotation>> = pending
    .filter((comment) => comment.path === path)
    .map((comment) => ({
      lineNumber: comment.line,
      side: comment.side === "left" ? "deletions" : "additions",
      metadata: { kind: "pending", comment },
    }))
  if (draft?.path !== path) {
    return annotations
  }
  const position = pullRequestLinePosition(draft.range)
  return [
    ...annotations,
    {
      lineNumber: position.line,
      side: position.side === "left" ? "deletions" : "additions",
      metadata: { kind: "draft", path },
    },
  ]
}

function ReviewAnnotationView({
  annotation,
  onAdd,
  onCancel,
  onRemove,
}: {
  readonly annotation: DiffLineAnnotation<ReviewAnnotation>
  readonly onAdd: (body: string) => void
  readonly onCancel: () => void
  readonly onRemove: (id: number) => void
}) {
  const [body, setBody] = useState("")
  if (annotation.metadata.kind === "pending") {
    const comment = annotation.metadata.comment
    return (
      <div className="m-2 flex items-start gap-2 rounded-md border border-border/70 bg-background p-2 font-sans text-xs text-foreground">
        <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 whitespace-pre-wrap">{comment.body}</p>
        <Button
          aria-label="Remove pending comment"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => onRemove(comment.id)}
        >
          <XIcon />
        </Button>
      </div>
    )
  }
  return (
    <div className="m-2 rounded-md border border-border/70 bg-background p-2 font-sans text-foreground shadow-sm">
      <Textarea
        autoFocus
        aria-label={`Comment on line ${annotation.lineNumber}`}
        placeholder={`Comment on line ${annotation.lineNumber}`}
        size="sm"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="xs" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={body.trim() === ""}
          size="xs"
          type="button"
          onClick={() => onAdd(body.trim())}
        >
          Add to review
        </Button>
      </div>
    </div>
  )
}

function ToolbarButton({
  active = false,
  label,
  children,
  onClick,
}: {
  readonly active?: boolean
  readonly label: string
  readonly children: ReactNode
  readonly onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(active && "bg-accent")}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  )
}

function ReviewButton({
  children,
  disabled = false,
  loading,
  onClick,
}: {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly loading: boolean
  readonly onClick: () => void
}) {
  return (
    <Button
      disabled={disabled}
      loading={loading}
      size="xs"
      type="button"
      variant="outline"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
