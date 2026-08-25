/** t3code buffered default: keep assistant text off the journal until a boundary or this cap. */
export const MAX_BUFFERED_ASSISTANT_CHARS = 24_000

export const takeBufferedAssistantSpill = (pending: string, delta: string) => {
  const next = `${pending}${delta}`
  if (next.length <= MAX_BUFFERED_ASSISTANT_CHARS) {
    return { pending: next, spill: "" as const }
  }
  return { pending: "" as const, spill: next }
}
