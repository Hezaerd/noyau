import { describe, expect, it } from "vite-plus/test"

import {
  appendComposerImages,
  composerImageFromBytes,
  composerImageFromFile,
  filesFromFileList,
  revokeComposerImages,
} from "../src/lib/composer-images"

const pngFile = (name = "shot.png", size = 4) =>
  new File([new Uint8Array(size).fill(1)], name, { type: "image/png" })

describe("composer-images", () => {
  it("convertit un PNG en upload dataUrl", async () => {
    const result = await composerImageFromFile(pngFile())
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.image.upload).toMatchObject({
      type: "image",
      name: "shot.png",
      mimeType: "image/png",
      sizeBytes: 4,
    })
    expect(result.image.upload.dataUrl.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("refuse un mime hors allowlist et respecte la limite", async () => {
    expect(
      await composerImageFromFile(
        new File([new Uint8Array(4)], "x.svg", { type: "image/svg+xml" }),
      ),
    ).toEqual({
      ok: false,
      reason: "unsupported",
    })

    const filled = await appendComposerImages(
      [],
      Array.from({ length: 9 }, (_, index) => pngFile(`shot-${index}.png`)),
    )
    expect(filled.ok).toBe(false)
    if (filled.ok) {
      return
    }
    expect(filled.reason).toBe("limit")
    expect(filled.images).toHaveLength(8)
    expect(filesFromFileList(null)).toEqual([])
  })

  it("reconstruit un upload depuis les octets persistés", () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const image = composerImageFromBytes({
      name: "shot.png",
      mimeType: "image/png",
      bytes,
    })
    expect(image?.upload).toMatchObject({
      type: "image",
      name: "shot.png",
      mimeType: "image/png",
      sizeBytes: 4,
    })
    if (image !== undefined) {
      revokeComposerImages([image])
    }
  })
})
