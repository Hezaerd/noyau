"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import type * as React from "react"

import { cn } from "@/lib/utils"

const alertVariants = cva("relative rounded-xl border px-3.5 py-3 text-sm", {
  defaultVariants: { variant: "default" },
  variants: {
    variant: {
      default: "bg-transparent text-foreground dark:bg-input/32 [&_svg]:text-muted-foreground",
      error:
        "border-destructive/32 bg-destructive/8 text-foreground [&_[data-slot=alert-description]]:text-muted-foreground [&_svg]:text-destructive",
      warning:
        "border-warning/32 bg-warning/8 text-foreground [&_[data-slot=alert-description]]:text-muted-foreground [&_svg]:text-warning",
    },
  },
})

const alertChildSlot = (child: ReactElement): string | undefined => {
  const propsSlot = (child.props as Record<string, string | undefined>)["data-slot"]
  if (propsSlot !== undefined) return propsSlot
  const type = child.type as { displayName?: string; name?: string }
  switch (type.displayName ?? type.name) {
    case "AlertAction":
      return "alert-action"
    case "AlertTitle":
      return "alert-title"
    case "AlertDescription":
      return "alert-description"
    default:
      return undefined
  }
}

export function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & { readonly children?: ReactNode }): ReactElement {
  const icon: ReactNode[] = []
  const content: ReactNode[] = []
  const action: ReactNode[] = []

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      content.push(child)
      return
    }
    const slot = alertChildSlot(child)
    if (slot === "alert-action") action.push(child)
    else if (slot === "alert-title" || slot === "alert-description") content.push(child)
    else icon.push(child)
  })

  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    >
      <div className="flex items-center gap-2">
        {icon.length === 0 ? null : (
          <div className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-full">
            {icon}
          </div>
        )}
        {content.length === 0 ? null : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">{content}</div>
        )}
        {action.length === 0 ? null : (
          <div className="flex shrink-0 items-center self-center">{action}</div>
        )}
      </div>
    </div>
  )
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"div">): ReactElement {
  return <div className={cn("font-medium", className)} data-slot="alert-title" {...props} />
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">): ReactElement {
  return (
    <div
      className={cn("flex flex-col gap-2.5 text-muted-foreground", className)}
      data-slot="alert-description"
      {...props}
    />
  )
}

export function AlertAction({ className, ...props }: React.ComponentProps<"div">): ReactElement {
  return <div className={cn("flex gap-1", className)} data-slot="alert-action" {...props} />
}

AlertTitle.displayName = "AlertTitle"
AlertDescription.displayName = "AlertDescription"
AlertAction.displayName = "AlertAction"
