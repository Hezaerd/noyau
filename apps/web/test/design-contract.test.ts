import { describe, expect, it } from "vitest"

import { findDesignViolations, parseAddedLines } from "../../../tools/design-contract"

describe("design contract validator", () => {
  it("rejects new raw palette, theme branches, local material, elevation, and motion", () => {
    const violations = findDesignViolations("apps/web/src/components/feature/Example.tsx", [
      {
        line: 1,
        text: '<div className="bg-emerald-500 dark:text-white backdrop-blur-md shadow-[0_10px_20px_rgb(0_0_0/20%)] duration-500" />',
      },
      { line: 2, text: '<div className="transition-all" />' },
    ])

    expect(violations.map(({ rule }) => rule)).toEqual([
      "raw-palette",
      "theme-branch",
      "local-material",
      "arbitrary-elevation",
      "off-scale-motion",
      "off-scale-motion",
    ])
  })

  it("accepts semantic tokens, approved motion, defined state classes, and explicit exceptions", () => {
    const violations = findDesignViolations(
      "apps/web/src/components/feature/Example.tsx",
      [
        {
          line: 1,
          text: '<div className="bg-primary text-primary-foreground duration-200 state-working" />',
        },
        {
          line: 2,
          text: '<span className="text-emerald-500">user data</span> /* design-contract: allow data */',
        },
      ],
      new Set(["state-working"]),
    )

    expect(violations).toEqual([])
  })

  it("reports undefined state classes while allowing shared primitive recipes", () => {
    const stateViolations = findDesignViolations("apps/web/src/components/feature/Example.tsx", [
      { line: 4, text: '<span className={cn("shimmer", live && "state-working")} />' },
    ])
    const primitiveViolations = findDesignViolations("apps/web/src/components/ui/Example.tsx", [
      { line: 1, text: '<div className="backdrop-blur-md shadow-[0_1px_2px_rgb(0_0_0/20%)]" />' },
    ])

    expect(stateViolations.map(({ rule }) => rule)).toEqual(["undefined-state"])
    expect(primitiveViolations).toEqual([])
  })

  it("reports state classes when the class expression starts on an earlier line", () => {
    const violations = findDesignViolations("apps/web/src/components/feature/Example.tsx", [
      { line: 1, text: "<div className={cn(" },
      { line: 2, text: '  active && "state-pending",' },
    ])

    expect(violations.map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: "undefined-state", line: 2 },
    ])
  })

  it("treats native desktop titlebar colors as shared design tokens", () => {
    const violations = findDesignViolations("apps/desktop/src/window-chrome.ts", [
      { line: 1, text: 'const WINDOW_LIGHT_BACKGROUND = "#f5f4fb"' },
    ])

    expect(violations).toEqual([])
  })

  it("parses only added lines from a zero-context git diff", () => {
    const lines = parseAddedLines("@@ -2,0 +3,2 @@\n+first\n+second\n")
    expect(lines).toEqual([
      { line: 3, text: "first" },
      { line: 4, text: "second" },
    ])
  })
})
