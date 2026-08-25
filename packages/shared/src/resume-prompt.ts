const RESUME_TOKENS = new Set(["reprends", "reprendre", "resume", "continue", "continuer", "go"])

/** Prompt vide de mandat : un mot de reprise, pas une nouvelle instruction. */
export const isResumePrompt = (text: string): boolean => {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/u, "")
    .trim()
  return RESUME_TOKENS.has(normalized)
}
