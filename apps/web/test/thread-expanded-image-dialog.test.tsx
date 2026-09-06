// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ExpandedImageDialog } from "../src/components/thread/ExpandedImageDialog"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

function ImageDialogHarness({ onClose }: { readonly onClose: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open image
      </button>
      {open ? (
        <ExpandedImageDialog
          preview={{ images: [{ src: "image.png", name: "Screenshot" }], index: 0 }}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

describe("ExpandedImageDialog", () => {
  it("uses dialog semantics and restores focus when closed", () => {
    const onClose = vi.fn()
    render(<ImageDialogHarness onClose={onClose} />)

    const trigger = screen.getByRole("button", { name: "Open image" })
    trigger.focus()
    fireEvent.click(trigger)

    expect(screen.getByRole("dialog", { name: "Enlarged preview: Screenshot" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)
  })
})
