// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { Bubble, BubbleContent } from "../src/components/ui/bubble"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

describe("ThreadMarkdown inline code", () => {
  it("keeps a CSS hook so user-bubble chips can tint --primary instead of --code", () => {
    render(
      <AppAtomRegistryProvider>
        <Bubble variant="default" align="end">
          <BubbleContent>
            <ThreadMarkdown text={"store data in a `.t3/userData` directory"} />
          </BubbleContent>
        </Bubble>
      </AppAtomRegistryProvider>,
    )

    const code = document.querySelector(
      "[data-slot='bubble'][data-variant='default'] [data-streamdown='inline-code']",
    )
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe(".t3/userData")
    expect(code?.className).not.toMatch(/\bbg-muted\b/)
    expect(code?.className).not.toMatch(/\btext-foreground\b/)
  })
})
