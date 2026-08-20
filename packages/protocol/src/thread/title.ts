export const DEFAULT_THREAD_TITLE = "Nouveau thread"

const MAX_THREAD_TITLE_LENGTH = 50

/** Compacte un titre brut en une ligne sûre pour la sidebar. */
export const sanitizeThreadTitle = (raw: string): string => {
  const normalized = raw
    .trim()
    .split(/\r?\n/g)[0]
    ?.trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .trim()
    .replace(/\s+/g, " ")

  if (normalized === undefined || normalized.length === 0) {
    return DEFAULT_THREAD_TITLE
  }

  if (normalized.length <= MAX_THREAD_TITLE_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, MAX_THREAD_TITLE_LENGTH - 3).trimEnd()}...`
}

/** Titre provisoire semé depuis le premier prompt. */
export const seedTitleFromPrompt = (prompt: string): string => sanitizeThreadTitle(prompt)

/** Vrai tant que le titre est encore le placeholder ou le seed du premier Turn. */
export const canReplaceThreadTitle = (currentTitle: string, titleSeed?: string): boolean => {
  const trimmedCurrentTitle = currentTitle.trim()
  if (trimmedCurrentTitle === DEFAULT_THREAD_TITLE) {
    return true
  }

  const trimmedTitleSeed = titleSeed?.trim()
  return trimmedTitleSeed !== undefined && trimmedTitleSeed.length > 0
    ? trimmedCurrentTitle === trimmedTitleSeed
    : false
}
