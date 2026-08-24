/** True when the Thread transcript is ready to jump to the live edge. */
export function shouldCatchUpTranscriptOnOpen(input: {
  readonly threadId: string | undefined
  readonly loading: boolean
  readonly snapshotThreadId: string | undefined
}): boolean {
  return (
    input.threadId !== undefined &&
    !input.loading &&
    input.snapshotThreadId !== undefined &&
    input.snapshotThreadId === input.threadId
  )
}
