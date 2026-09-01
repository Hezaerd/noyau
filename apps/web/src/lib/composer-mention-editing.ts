import type { ComposerInlineToken } from "@noyau/shared/composer-inline-tokens"
import { collectComposerInlineTokens } from "@noyau/shared/composer-inline-tokens"
import { replaceTextRange } from "@noyau/shared/composer-trigger"

const EMPTY_SKILL_NAMES: ReadonlySet<string> = new Set()

const isAtomicMention = (token: ComposerInlineToken, skillNames: ReadonlySet<string>): boolean =>
  token.type !== "skill" || skillNames.has(token.value)

const mentionTouchingCursor = (
  text: string,
  cursor: number,
  skillNames: ReadonlySet<string>,
): ComposerInlineToken | undefined =>
  collectComposerInlineTokens(text).find(
    (token) => isAtomicMention(token, skillNames) && cursor > token.start && cursor <= token.end,
  )

const mentionStartingAtCursor = (
  text: string,
  cursor: number,
  skillNames: ReadonlySet<string>,
): ComposerInlineToken | undefined =>
  collectComposerInlineTokens(text).find(
    (token) => isAtomicMention(token, skillNames) && cursor === token.start,
  )

export const applyComposerMentionKey = ({
  key,
  text,
  cursor,
  skillNames = EMPTY_SKILL_NAMES,
}: {
  readonly key: string
  readonly text: string
  readonly cursor: number
  readonly skillNames?: ReadonlySet<string> | undefined
}): { readonly text: string; readonly cursor: number } | null => {
  const touching = mentionTouchingCursor(text, cursor, skillNames)
  const starting = mentionStartingAtCursor(text, cursor, skillNames)

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
