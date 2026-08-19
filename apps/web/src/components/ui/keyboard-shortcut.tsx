import { useMemo } from "react"
import type * as React from "react"

import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { getShortcutSegments } from "@/lib/keyboard-shortcut"
import { cn } from "@/lib/utils"

export function KeyboardShortcut({
  hotkey,
  className,
  kbdClassName,
}: {
  readonly hotkey: string
  readonly className?: string
  readonly kbdClassName?: string
}): React.ReactElement {
  const segments = useMemo(() => getShortcutSegments(hotkey), [hotkey])

  if (segments.length === 1) {
    return <Kbd className={cn(className, kbdClassName)}>{segments[0]}</Kbd>
  }

  return (
    <KbdGroup className={className}>
      {segments.map((segment, index) => (
        <Kbd key={`${segment}-${index}`} className={kbdClassName}>
          {segment}
        </Kbd>
      ))}
    </KbdGroup>
  )
}
