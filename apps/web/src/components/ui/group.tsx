"use client"

import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const groupVariants = cva(
  "flex w-fit *:focus-visible:z-1 has-[>[data-slot=group]]:gap-2 *:has-focus-visible:z-1",
  {
    defaultVariants: {
      orientation: "horizontal",
    },
    variants: {
      orientation: {
        horizontal:
          "*:data-slot:has-[~[data-slot]]:rounded-e-none *:data-slot:has-[~[data-slot]]:border-e-0 *:data-slot:has-[~[data-slot]]:before:rounded-e-none *:[[data-slot]~[data-slot]]:rounded-s-none *:[[data-slot]~[data-slot]]:border-s-0 *:[[data-slot]~[data-slot]]:before:rounded-s-none",
        vertical:
          "flex-col *:data-slot:has-[~[data-slot]]:rounded-b-none *:data-slot:has-[~[data-slot]]:border-b-0 *:data-slot:has-[~[data-slot]]:before:rounded-b-none *:[[data-slot]~[data-slot]]:rounded-t-none *:[[data-slot]~[data-slot]]:border-t-0 *:[[data-slot]~[data-slot]]:before:rounded-t-none",
      },
    },
  },
)

export function Group({
  className,
  orientation = "horizontal",
  children,
  ...props
}: {
  className?: string
  orientation?: VariantProps<typeof groupVariants>["orientation"]
  children: React.ReactNode
} & React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(groupVariants({ orientation }), className)}
      data-orientation={orientation}
      data-slot="group"
      role="group"
      {...props}
    >
      {children}
    </div>
  )
}

export function GroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: {
  className?: string
} & React.ComponentProps<typeof Separator>): React.ReactElement {
  return (
    <Separator
      className={cn("pointer-events-none relative z-2 bg-input", className)}
      orientation={orientation}
      {...props}
    />
  )
}
