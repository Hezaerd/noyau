// @vitest-environment node

import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { useMediaQuery } from "../src/hooks/use-media-query"

function ServerProbe() {
  return <output>{String(useMediaQuery("md"))}</output>
}

describe("useMediaQuery SSR", () => {
  it("returns false without a window", () => {
    expect(renderToString(<ServerProbe />)).toContain(">false<")
  })
})
