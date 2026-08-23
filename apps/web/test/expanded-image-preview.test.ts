import { describe, expect, it } from "vite-plus/test"

import { buildExpandedImagePreview } from "../src/lib/expanded-image-preview"

describe("buildExpandedImagePreview", () => {
  it("keeps gallery order and drops images without a preview URL", () => {
    expect(
      buildExpandedImagePreview(
        [
          { id: "a", name: "a.png" },
          { id: "b", name: "b.png", previewUrl: "blob:b" },
          { id: "c", name: "c.png", previewUrl: "blob:c" },
        ],
        "c",
      ),
    ).toEqual({
      images: [
        { src: "blob:b", name: "b.png" },
        { src: "blob:c", name: "c.png" },
      ],
      index: 1,
    })
  })

  it("returns null when the selected image is not previewable", () => {
    expect(
      buildExpandedImagePreview([{ id: "a", name: "a.png", previewUrl: "blob:a" }], "missing"),
    ).toBeNull()
    expect(buildExpandedImagePreview([{ id: "a", name: "a.png" }], "a")).toBeNull()
  })
})
