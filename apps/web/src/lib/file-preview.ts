import type { FilePreview } from "@noyau/contracts/file-preview"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"

import { previewFile as requestFilePreview } from "@/lib/control-plane"

const cache = new Map<string, FilePreview>()

const cacheKey = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  path: string,
  mtimeMs?: number,
): string => {
  const scope = threadId ?? "project"
  return mtimeMs === undefined
    ? `${projectId}\0${scope}\0${path}`
    : `${projectId}\0${scope}\0${path}\0${String(mtimeMs)}`
}

export const peekFilePreview = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  path: string,
): FilePreview | undefined => cache.get(cacheKey(projectId, threadId, path))

export const rememberFilePreview = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  path: string,
  preview: FilePreview,
): FilePreview => {
  cache.set(cacheKey(projectId, threadId, path), preview)
  cache.set(cacheKey(projectId, threadId, path, preview.mtimeMs), preview)
  return preview
}

export const clearFilePreviewCache = (): void => {
  cache.clear()
}

export const loadFilePreview = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  path: string,
): Promise<FilePreview | undefined> => {
  const cached = peekFilePreview(projectId, threadId, path)
  if (cached !== undefined) {
    return Promise.resolve(cached)
  }
  const input = threadId === undefined ? { projectId, path } : { projectId, threadId, path }
  return requestFilePreview(input).then((result) =>
    result.ok ? rememberFilePreview(projectId, threadId, path, result.value) : undefined,
  )
}
