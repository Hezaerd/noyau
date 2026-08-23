// @vitest-environment happy-dom

import { AttachmentId } from "@noyau/protocol/ids"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadTurnImages } from "../src/components/thread/ThreadTurnImages"

const previewAttachment = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        kind: "image" as const,
        mime: "image/png" as const,
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    }),
  ),
)

vi.mock("@/lib/control-plane", () => ({
  previewAttachment,
}))

afterEach(() => {
  cleanup()
  previewAttachment.mockClear()
})

const firstId = AttachmentId.make("10000000-0000-4000-8000-000000000001-0")
const secondId = AttachmentId.make("10000000-0000-4000-8000-000000000001-1")

describe("ThreadTurnImages", () => {
  it("expands a transcript attachment and pages through the gallery", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        render(
          <ThreadTurnImages
            attachments={[
              {
                type: "image",
                id: firstId,
                name: "shot.png",
                mimeType: "image/png",
                sizeBytes: 4,
              },
              {
                type: "image",
                id: secondId,
                name: "diagram.png",
                mimeType: "image/png",
                sizeBytes: 4,
              },
            ]}
          />,
        )

        const first = yield* Effect.promise(() =>
          screen.findByRole("button", { name: "Agrandir shot.png" }),
        )
        yield* Effect.promise(() => screen.findByRole("button", { name: "Agrandir diagram.png" }))
        fireEvent.click(first)

        expect(screen.getByRole("dialog", { name: "Aperçu agrandi" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "shot.png" })).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Image suivante" }))
        expect(screen.getByRole("img", { name: "diagram.png" })).toBeTruthy()
        expect(screen.getByText("diagram.png (2/2)")).toBeTruthy()

        fireEvent.keyDown(window, { key: "Escape" })
        expect(screen.queryByRole("dialog", { name: "Aperçu agrandi" })).toBeNull()
      }),
    ))
})
