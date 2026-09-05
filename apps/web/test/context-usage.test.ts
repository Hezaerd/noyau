import { describe, expect, it } from "vitest"

import {
  contextUsageRatio,
  contextUsageTone,
  formatContextUsage,
  formatTokenCount,
} from "../src/lib/context-usage"

describe("context usage formatting", () => {
  it("compacte les milliers et les millions", () => {
    expect(formatTokenCount(850)).toBe("850")
    expect(formatTokenCount(12400)).toBe("12.4k")
    expect(formatTokenCount(200000)).toBe("200k")
    expect(formatTokenCount(1_000_000)).toBe("1M")
  })

  it("borne le ratio et colore les seuils", () => {
    expect(contextUsageRatio({ used: 100, window: 200 })).toBe(0.5)
    expect(contextUsageRatio({ used: 250, window: 200 })).toBe(1)
    expect(contextUsageTone({ used: 79, window: 100 })).toBe("default")
    expect(contextUsageTone({ used: 80, window: 100 })).toBe("warning")
    expect(contextUsageTone({ used: 95, window: 100 })).toBe("critical")
    expect(formatContextUsage({ used: 12400, window: 200000 })).toBe("12.4k / 200k")
  })
})
