import { composerPromptSegments } from "@noyau/shared/composer-inline-tokens"
import type { ComposerTrigger } from "@noyau/shared/composer-trigger"

import { ComposerFileChip } from "@/components/thread/ComposerFileChip"
import { COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME } from "@/lib/file-chip"

const rangesOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd && rightStart < leftEnd

export function ComposerPromptHighlight({
  text,
  trigger,
}: {
  readonly text: string
  readonly trigger: ComposerTrigger | null
}) {
  const segments = composerPromptSegments(text)
  let offset = 0

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          offset += segment.text.length
          return <span key={`text-${String(index)}`}>{segment.text}</span>
        }

        const start = offset
        const end = start + segment.source.length
        offset = end
        const drafting =
          trigger?.kind === "path" &&
          rangesOverlap(start, end, trigger.rangeStart, trigger.rangeEnd)
        if (drafting) {
          return <span key={`draft-${String(index)}`}>{segment.source}</span>
        }

        return (
          <span
            key={`mention-${String(index)}`}
            contentEditable={false}
            data-composer-mention="true"
            data-mention-source={segment.source}
            className={COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME}
          >
            <ComposerFileChip path={segment.path} />
          </span>
        )
      })}
    </>
  )
}
