// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  InlineFailure,
  ResourceErrorState,
  ScopeBanner,
} from "../src/components/failure/FailureSurfaces"
import type { FailurePresentation } from "../src/lib/failure-presentation"

afterEach(cleanup)

const presentation: FailurePresentation = {
  surface: "banner",
  tone: "warning",
  title: "Reconnexion au control plane…",
  description: "Les données affichées restent disponibles.",
  persistence: "until-recovered",
  recovery: { action: "retry", label: "Réessayer" },
}

describe("failure surfaces", () => {
  it("announces an inline failure", () => {
    render(<InlineFailure id="field-error" presentation={{ ...presentation, surface: "inline" }} />)

    expect(screen.getByRole("alert").id).toBe("field-error")
  })

  it("renders a persistent scoped alert with local recovery", () => {
    const onRecovery = vi.fn()
    render(<ScopeBanner presentation={presentation} onRecovery={onRecovery} />)

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    expect(onRecovery).toHaveBeenCalledOnce()
  })

  it("renders a blocking resource state without involving the Router", () => {
    render(<ResourceErrorState presentation={{ ...presentation, surface: "page" }} />)

    expect(screen.getByRole("heading", { name: "Reconnexion au control plane…" })).toBeTruthy()
  })
})
