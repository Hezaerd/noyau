import type { FilePreview } from "@noyau/contracts/file-preview"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"

import { previewFile as requestFilePreview } from "@/lib/control-plane"

const cache = new Map<string, FilePreview>()
type PendingPreview = {
  readonly token: symbol
  readonly promise: Promise<FilePreview | undefined>
}

const pending = new Map<string, PendingPreview>()

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
  pending.clear()
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
  const key = cacheKey(projectId, threadId, path)
  const existing = pending.get(key)
  if (existing !== undefined) {
    return existing.promise
  }
  const input = threadId === undefined ? { projectId, path } : { projectId, threadId, path }
  const token = Symbol()
  const promise = requestFilePreview(input)
    .then((result) => {
      if (!result.ok) {
        return undefined
      }
      return pending.get(key)?.token === token
        ? rememberFilePreview(projectId, threadId, path, result.value)
        : result.value
    })
    .finally(() => {
      if (pending.get(key)?.token === token) {
        pending.delete(key)
      }
    })
  pending.set(key, { token, promise })
  return promise
}
