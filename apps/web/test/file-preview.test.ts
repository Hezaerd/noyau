import type { FilePreview } from "@noyau/contracts/file-preview"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ControlPlaneResult } from "../src/lib/control-plane"
import { clearFilePreviewCache, loadFilePreview, peekFilePreview } from "../src/lib/file-preview"

const previewFile = vi.hoisted(() => vi.fn())

// SAFETY: this test replaces the one control-plane RPC seam with a deferred fake to exercise request ownership.
// oxlint-disable-next-line anti-slop/no-module-mocking -- The RPC seam is the focused test boundary.
vi.mock("@/lib/control-plane", () => ({ previewFile }))

const projectA = ProjectId.make("10000000-0000-4000-8000-000000000001")
const projectB = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

const textPreview = (mtimeMs: number): FilePreview => ({
  kind: "text",
  text: `preview-${String(mtimeMs)}`,
  truncated: false,
  mtimeMs,
})

const success = (value: FilePreview): ControlPlaneResult<FilePreview> => ({ ok: true, value })
const noopResolve = <A>(_value: A | PromiseLike<A>): void => undefined

const deferred = <A>() => {
  let resolve: (value: A | PromiseLike<A>) => void = noopResolve
  // SAFETY: this local test helper intentionally exposes the resolver for a deferred RPC response.
  // oxlint-disable-next-line effecttsgo/new-promise -- Deferred control-plane test seam.
  const promise = new Promise<A>((resolvePromise, _rejectPromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(() => {
  clearFilePreviewCache()
  vi.clearAllMocks()
})

describe("file preview loading", () => {
  it("coalesces concurrent requests and keeps the completed cache", async () => {
    const request = deferred<ControlPlaneResult<FilePreview>>()
    const value = textPreview(1)
    previewFile.mockReturnValue(request.promise)

    const first = loadFilePreview(projectA, threadA, "/src/example.ts")
    const second = loadFilePreview(projectA, threadA, "/src/example.ts")

    expect(first).toBe(second)
    expect(previewFile).toHaveBeenCalledTimes(1)
    expect(previewFile).toHaveBeenCalledWith({
      projectId: projectA,
      threadId: threadA,
      path: "/src/example.ts",
    })

    request.resolve(success(value))
    await expect(first).resolves.toBe(value)
    expect(peekFilePreview(projectA, threadA, "/src/example.ts")).toBe(value)
    await expect(loadFilePreview(projectA, threadA, "/src/example.ts")).resolves.toBe(value)
    expect(previewFile).toHaveBeenCalledTimes(1)
  })

  it("keeps project, thread, and path scopes independent", async () => {
    const value = textPreview(2)
    previewFile.mockResolvedValue(success(value))

    const requests = [
      loadFilePreview(projectA, undefined, "/src/example.ts"),
      loadFilePreview(projectB, undefined, "/src/example.ts"),
      loadFilePreview(projectA, threadA, "/src/example.ts"),
      loadFilePreview(projectA, threadB, "/src/example.ts"),
      loadFilePreview(projectA, threadA, "/src/other.ts"),
    ]
    await Promise.all(requests)

    expect(previewFile).toHaveBeenCalledTimes(5)
    expect(previewFile).toHaveBeenNthCalledWith(1, {
      projectId: projectA,
      path: "/src/example.ts",
    })
    expect(previewFile).toHaveBeenNthCalledWith(2, {
      projectId: projectB,
      path: "/src/example.ts",
    })
    expect(previewFile).toHaveBeenNthCalledWith(3, {
      projectId: projectA,
      threadId: threadA,
      path: "/src/example.ts",
    })
    expect(previewFile).toHaveBeenNthCalledWith(4, {
      projectId: projectA,
      threadId: threadB,
      path: "/src/example.ts",
    })
    expect(previewFile).toHaveBeenNthCalledWith(5, {
      projectId: projectA,
      threadId: threadA,
      path: "/src/other.ts",
    })
  })

  it("keeps failure results undefined and retries rejected requests", async () => {
    const value = textPreview(3)
    previewFile
      .mockResolvedValueOnce({
        ok: false,
        failure: { _tag: "Unavailable", service: "preview" },
      })
      .mockResolvedValueOnce(success(value))
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce(success(value))

    await expect(loadFilePreview(projectA, threadA, "/src/failure.ts")).resolves.toBeUndefined()
    await expect(loadFilePreview(projectA, threadA, "/src/failure.ts")).resolves.toBe(value)
    await expect(loadFilePreview(projectA, threadA, "/src/retry.ts")).rejects.toThrow(
      "preview failed",
    )
    await expect(loadFilePreview(projectA, threadA, "/src/retry.ts")).resolves.toBe(value)
    expect(previewFile).toHaveBeenCalledTimes(4)
  })

  it("prevents a cleared request from owning a newer request or cache", async () => {
    const older = deferred<ControlPlaneResult<FilePreview>>()
    const newer = deferred<ControlPlaneResult<FilePreview>>()
    const oldValue = textPreview(4)
    const newValue = textPreview(5)
    previewFile.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

    const first = loadFilePreview(projectA, threadA, "/src/race.ts")
    clearFilePreviewCache()
    const second = loadFilePreview(projectA, threadA, "/src/race.ts")

    expect(first).not.toBe(second)
    expect(previewFile).toHaveBeenCalledTimes(2)

    older.resolve(success(oldValue))
    await expect(first).resolves.toBe(oldValue)
    expect(peekFilePreview(projectA, threadA, "/src/race.ts")).toBeUndefined()
    const joined = loadFilePreview(projectA, threadA, "/src/race.ts")
    expect(joined).toBe(second)
    expect(previewFile).toHaveBeenCalledTimes(2)

    newer.resolve(success(newValue))
    await expect(second).resolves.toBe(newValue)
    await expect(joined).resolves.toBe(newValue)
    expect(peekFilePreview(projectA, threadA, "/src/race.ts")).toBe(newValue)
  })

  it("keeps a newer result when the cleared request finishes afterward", async () => {
    const older = deferred<ControlPlaneResult<FilePreview>>()
    const newer = deferred<ControlPlaneResult<FilePreview>>()
    const oldValue = textPreview(6)
    const newValue = textPreview(7)
    previewFile.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

    const first = loadFilePreview(projectA, threadA, "/src/race-late.ts")
    clearFilePreviewCache()
    const second = loadFilePreview(projectA, threadA, "/src/race-late.ts")

    newer.resolve(success(newValue))
    await expect(second).resolves.toBe(newValue)
    expect(peekFilePreview(projectA, threadA, "/src/race-late.ts")).toBe(newValue)

    older.resolve(success(oldValue))
    await expect(first).resolves.toBe(oldValue)
    expect(peekFilePreview(projectA, threadA, "/src/race-late.ts")).toBe(newValue)
  })
})
