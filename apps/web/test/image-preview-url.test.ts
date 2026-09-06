import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createImagePreviewUrl } from "../src/lib/image-preview-url"

const NativeBlob = Blob
const createObjectURL = vi.fn((_blob: Blob) => "blob:test")
let capturedBlobParts: BlobPart[] = []

class CapturingBlob extends NativeBlob {
  constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
    capturedBlobParts = parts
    super(parts, options)
  }
}

beforeEach(() => {
  capturedBlobParts = []
  vi.stubGlobal("Blob", CapturingBlob)
  vi.stubGlobal("URL", { createObjectURL })
})

afterEach(() => {
  createObjectURL.mockClear()
  vi.unstubAllGlobals()
})

const lastBlob = (): Blob => {
  const blob = createObjectURL.mock.lastCall?.[0]
  if (blob === undefined) {
    throw new Error("Expected createObjectURL to receive a Blob")
  }
  return blob
}

describe("image preview URLs", () => {
  it("preserves a typed array subview in the Blob", async () => {
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5])

    createImagePreviewUrl(backing.subarray(2, 5), "image/png")

    const part = capturedBlobParts[0]
    expect(part).toBeInstanceOf(Uint8Array)
    if (!(part instanceof Uint8Array)) {
      throw new Error("Expected Blob to receive a typed array view")
    }
    expect(part.buffer).toBe(backing.buffer)
    expect(part.byteOffset).toBe(2)
    expect(part.byteLength).toBe(3)
    expect([...new Uint8Array(await lastBlob().arrayBuffer())]).toEqual([2, 3, 4])
    expect(lastBlob().type).toBe("image/png")
  })

  it("lets Blob snapshot the source before later mutation", async () => {
    const bytes = new Uint8Array([7, 8, 9])

    createImagePreviewUrl(bytes, "image/png")
    bytes[0] = 99

    expect([...new Uint8Array(await lastBlob().arrayBuffer())]).toEqual([7, 8, 9])
  })

  it("copies a SharedArrayBuffer view when the runtime supports it", async () => {
    let backing: SharedArrayBuffer
    try {
      backing = new SharedArrayBuffer(5)
    } catch {
      return
    }
    const bytes = new Uint8Array(backing)
    bytes.set([0, 1, 2, 3, 4])

    createImagePreviewUrl(bytes.subarray(1, 4), "image/png")

    const part = capturedBlobParts[0]
    expect(part).toBeInstanceOf(Uint8Array)
    if (!(part instanceof Uint8Array)) {
      throw new Error("Expected Blob to receive a copied typed array")
    }
    expect(part.buffer).not.toBe(backing)
    expect([...new Uint8Array(await lastBlob().arrayBuffer())]).toEqual([1, 2, 3])
  })
})
