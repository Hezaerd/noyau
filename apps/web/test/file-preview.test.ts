import { ProjectId } from "@noyau/protocol/ids"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  clearFilePreviewCache,
  loadFilePreview,
  peekFilePreview,
  rememberFilePreview,
} from "../src/lib/file-preview"

const previewFile = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: { kind: "text" as const, text: "ok", truncated: false, mtimeMs: 42 },
    }),
  ),
)

vi.mock("@/lib/control-plane", () => ({
  previewFile,
}))

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

afterEach(() => {
  clearFilePreviewCache()
  previewFile.mockClear()
})

describe("file preview cache", () => {
  it("remembers a preview by path and mtime", () => {
    const preview = rememberFilePreview(projectId, "/tmp/a.ts", {
      kind: "text",
      text: "cached",
      truncated: false,
      mtimeMs: 7,
    })
    expect(peekFilePreview(projectId, "/tmp/a.ts")).toEqual(preview)
  })

  it("hits the cache on the second load", async () => {
    const first = await loadFilePreview(projectId, "/tmp/a.ts")
    const second = await loadFilePreview(projectId, "/tmp/a.ts")
    expect(first?.kind).toBe("text")
    expect(second).toEqual(first)
    expect(previewFile).toHaveBeenCalledTimes(1)
  })
})
