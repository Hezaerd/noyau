import type { ComposerInlineToken } from "@noyau/shared/composer-inline-tokens"
import { collectComposerInlineTokens } from "@noyau/shared/composer-inline-tokens"
import { replaceTextRange } from "@noyau/shared/composer-trigger"

const mentionTouchingCursor = (text: string, cursor: number): ComposerInlineToken | undefined =>
  collectComposerInlineTokens(text).find(
    (token) => token.type === "mention" && cursor > token.start && cursor <= token.end,
  )

const mentionStartingAtCursor = (text: string, cursor: number): ComposerInlineToken | undefined =>
  collectComposerInlineTokens(text).find(
    (token) => token.type === "mention" && cursor === token.start,
  )

export const applyComposerMentionKey = ({
  key,
  text,
  cursor,
}: {
  readonly key: string
  readonly text: string
  readonly cursor: number
}): { readonly text: string; readonly cursor: number } | null => {
  const touching = mentionTouchingCursor(text, cursor)
  const starting = mentionStartingAtCursor(text, cursor)

  if (key === "Backspace" && touching !== undefined) {
    return replaceTextRange(text, touching.start, touching.end, "")
  }
  if (key === "Delete" && (touching ?? starting) !== undefined) {
    const target = touching ?? starting
    if (target === undefined) {
      return null
    }
    return replaceTextRange(text, target.start, target.end, "")
  }
  if (key === "ArrowLeft" && touching !== undefined) {
    return { text, cursor: touching.start }
  }
  if (key === "ArrowRight" && starting !== undefined) {
    return { text, cursor: starting.end }
  }
  return null
}
