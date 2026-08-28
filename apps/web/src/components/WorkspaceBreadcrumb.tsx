import type { ThreadId } from "@noyau/contracts/ids"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { makeThreadMetaUpdateRequest } from "@/lib/thread-commands"
import { cn } from "@/lib/utils"
import { toggleThreadPinned } from "@/state/thread-pins"

export function WorkspaceBreadcrumb({
  ariaLabel,
  children,
  className,
}: {
  readonly ariaLabel: string
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("min-w-0", className)}>
      <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-sm">{children}</ol>
    </nav>
  )
}

export function WorkspaceBreadcrumbItem({
  children,
  className,
  current = false,
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly current?: boolean
}) {
  return (
    <li
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center font-medium tracking-[-0.015em]",
        current ? "text-foreground" : "shrink-0 text-muted-foreground",
        className,
      )}
    >
      {children}
    </li>
  )
}

export function WorkspaceBreadcrumbSeparator() {
  return (
    <li aria-hidden="true" className="flex shrink-0 items-center text-muted-foreground/50">
      /
    </li>
  )
}

export function SettingsPageTitle({ tabLabel }: { readonly tabLabel: string }) {
  return (
    <WorkspaceBreadcrumb ariaLabel="Breadcrumb">
      <WorkspaceBreadcrumbItem>Settings</WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current className="min-w-0">
        <h1 className="min-w-0 truncate">{tabLabel}</h1>
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  )
}

function EditableThreadTitle({
  headingClassName,
  threadId,
  threadTitle,
}: {
  readonly headingClassName: string
  readonly threadId: ThreadId | undefined
  readonly threadTitle: string
}) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(threadTitle)

  useEffect(() => {
    setTitle(threadTitle)
  }, [threadTitle])

  useEffect(() => {
    setRenaming(false)
  }, [threadId])

  useEffect(() => {
    if (!renaming) {
      return
    }
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [renaming])

  useKeybindingHandler(
    "thread.rename",
    () => setRenaming(true),
    threadId !== undefined && !renaming,
  )
  useKeybindingHandler(
    "thread.pin",
    () => {
      if (threadId !== undefined) {
        toggleThreadPinned(threadId)
      }
    },
    threadId !== undefined && !renaming,
  )

  const commitRename = () => {
    const nextTitle = title.trim()
    setRenaming(false)
    if (threadId === undefined || nextTitle === "" || nextTitle === threadTitle) {
      setTitle(threadTitle)
      return
    }
    void buildAndDispatchCommand(makeThreadMetaUpdateRequest({ threadId, title: nextTitle })).then(
      (result) => {
        if (!result.ok) {
          setTitle(threadTitle)
          showFailureToast(
            presentFailure(result.failure, {
              operation: "thread.rename",
              scope: "project",
              initiatedByUser: true,
              hasUsableData: true,
            }),
          )
        }
        return undefined
      },
    )
  }

  if (renaming && threadId !== undefined) {
    return (
      <Input
        ref={titleInputRef}
        size="sm"
        value={title}
        aria-label="Thread title"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            setTitle(threadTitle)
            setRenaming(false)
          }
        }}
        className="no-drag h-7 min-w-0 border-transparent bg-transparent px-1 text-sm font-medium shadow-none tracking-[-0.015em]"
      />
    )
  }

  return (
    <h1
      className={cn(headingClassName, threadId !== undefined && "no-drag cursor-text select-none")}
      onDoubleClick={(event) => {
        if (threadId === undefined) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        setRenaming(true)
      }}
    >
      {threadTitle}
    </h1>
  )
}

export function ThreadPageTitle({
  projectName,
  threadId,
  threadTitle,
}: {
  readonly projectName: string | undefined
  readonly threadId?: ThreadId | undefined
  readonly threadTitle: string
}) {
  const title = (
    <EditableThreadTitle
      headingClassName={
        projectName === undefined ? "truncate font-medium tracking-[-0.015em]" : "min-w-0 truncate"
      }
      threadId={threadId}
      threadTitle={threadTitle}
    />
  )

  if (projectName === undefined) {
    return title
  }

  return (
    <WorkspaceBreadcrumb ariaLabel="Thread breadcrumb">
      <WorkspaceBreadcrumbItem>
        <span className="max-w-40 truncate">{projectName}</span>
      </WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current className="min-w-0">
        {title}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  )
}
