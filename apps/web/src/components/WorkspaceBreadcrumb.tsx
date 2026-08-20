import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

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
    <WorkspaceBreadcrumb ariaLabel="Fil d’Ariane">
      <WorkspaceBreadcrumbItem>Paramètres</WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current className="min-w-0">
        <h1 className="min-w-0 truncate">{tabLabel}</h1>
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  )
}

export function ThreadPageTitle({
  projectName,
  threadTitle,
}: {
  readonly projectName: string | undefined
  readonly threadTitle: string
}) {
  if (projectName === undefined) {
    return <h1 className="truncate font-medium tracking-[-0.015em]">{threadTitle}</h1>
  }

  return (
    <WorkspaceBreadcrumb ariaLabel="Fil d’Ariane du Thread">
      <WorkspaceBreadcrumbItem>
        <span className="max-w-40 truncate">{projectName}</span>
      </WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current className="min-w-0">
        <h1 className="min-w-0 truncate">{threadTitle}</h1>
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  )
}
