import type { ProjectId, ThreadId } from "@noyau/protocol/ids"

export const composerDraftStoreKey = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): string => (threadId === undefined ? `new:${projectId}` : `thread:${threadId}`)
