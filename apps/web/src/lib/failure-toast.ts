import { toastManager } from "@/components/ui/toast"

import type { FailurePresentation } from "./failure-presentation"

export const showFailureToast = (
  presentation: FailurePresentation,
  onRecovery?: () => void,
): void => {
  if (presentation.surface !== "toast") return
  const base = {
    title: presentation.title,
    type: presentation.tone === "critical" ? ("error" as const) : ("warning" as const),
  }
  const withDescription =
    presentation.description === undefined
      ? base
      : { ...base, description: presentation.description }
  const withId =
    presentation.dedupeKey === undefined
      ? withDescription
      : { ...withDescription, id: presentation.dedupeKey }
  toastManager.add(
    presentation.recovery === undefined || onRecovery === undefined
      ? withId
      : {
          ...withId,
          actionProps: {
            children: presentation.recovery.label,
            onClick: onRecovery,
          },
        },
  )
}
