import type { FilePreview } from "@noyau/contracts/file-preview"
import type { ProjectId } from "@noyau/contracts/ids"

import { previewFile as requestFilePreview } from "@/lib/control-plane"

const cache = new Map<string, FilePreview>()

const cacheKey = (projectId: ProjectId, path: string, mtimeMs?: number): string =>
  mtimeMs === undefined ? `${projectId}\0${path}` : `${projectId}\0${path}\0${String(mtimeMs)}`

export const peekFilePreview = (projectId: ProjectId, path: string): FilePreview | undefined =>
  cache.get(cacheKey(projectId, path))

export const rememberFilePreview = (
  projectId: ProjectId,
  path: string,
  preview: FilePreview,
): FilePreview => {
  cache.set(cacheKey(projectId, path), preview)
  cache.set(cacheKey(projectId, path, preview.mtimeMs), preview)
  return preview
}

export const clearFilePreviewCache = (): void => {
  cache.clear()
}

export const loadFilePreview = (
  projectId: ProjectId,
  path: string,
): Promise<FilePreview | undefined> => {
  const cached = peekFilePreview(projectId, path)
  if (cached !== undefined) {
    return Promise.resolve(cached)
  }
  return requestFilePreview({ projectId, path }).then((result) =>
    result.ok ? rememberFilePreview(projectId, path, result.value) : undefined,
  )
}
