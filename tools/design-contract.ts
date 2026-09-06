export type DesignContractRule =
  | "raw-palette"
  | "theme-branch"
  | "local-material"
  | "arbitrary-elevation"
  | "off-scale-motion"
  | "undefined-state"

export type DesignContractViolation = {
  readonly file: string
  readonly line: number
  readonly rule: DesignContractRule
  readonly message: string
}

type SourceLine = {
  readonly line: number
  readonly text: string
}

const rawPalettePattern =
  /(?:^|[\s"'`])(?:[a-z-]+:)*(?:bg|text|border|from|via|to|ring|shadow|fill|stroke|decoration|divide|outline|caret|placeholder|ring-offset)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d{1,3})?(?=$|[\s"'`])|(?:^|[\s"'`])(?:[a-z-]+:)*(?:bg|text|border|from|via|to|ring|shadow|fill|stroke|decoration|divide|outline|caret|placeholder|ring-offset)-(?:black|white)(?:\/\d{1,3})?(?=$|[\s"'`])/
const rawCssColorPattern = /#[\da-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/u
const themeBranchPattern = /(?:^|[\s"'`])(?:dark|not-dark):/u
const localGlassPattern = /(?:backdrop-(?:blur|filter)|backdrop-filter|--(?:glass|material)-)/u
const arbitraryMaterialPattern =
  /(?:bg|border|from|via|to)-\[(?:[^\]]*\b(?:color-mix|rgb|hsl)|[^\]]*--(?:glass|material)-)/u
const arbitraryElevationPattern = /(?:shadow-\[|box-shadow\s*:)/u
const offScaleMotionPattern = /(?:transition-all|duration-\[(?:[^\]]+)\]|duration-(\d+))/u
// `has-*` is a Tailwind relational variant (`has-disabled`, `has-focus-visible`, …),
// not a custom visual state class. Custom states use an explicit state/status prefix.
const customStatePattern = /^(?:is|state|status)-[a-z0-9-]+$/u
const explicitExceptionPattern = /design-contract:\s*allow\s+(?:brand|data|generated)/u
const allowedDurations = new Set(["0", "120", "200", "320"])

const isPrimitiveFile = (file: string): boolean =>
  file.startsWith("apps/web/src/components/ui/") ||
  file === "apps/web/src/index.css" ||
  file.startsWith("apps/web/src/styles/") ||
  // Native titlebar colors are the desktop equivalent of web design tokens.
  file === "apps/desktop/src/window-chrome.ts"

const isExplicitlyExcepted = (text: string): boolean => explicitExceptionPattern.test(text)

const isRawColorException = (text: string): boolean =>
  isExplicitlyExcepted(text) ||
  /(?:backgroundColor|borderColor|color)\s*:\s*[a-zA-Z_$][\w$]*/u.test(text)

const findUndefinedState = (
  text: string,
  definedStateClasses: ReadonlySet<string>,
): string | undefined => {
  const candidates = text.match(/[a-z][a-z0-9-]*/gu) ?? []
  return candidates.find(
    (candidate) =>
      (candidate === "shimmer" || customStatePattern.test(candidate)) &&
      !definedStateClasses.has(candidate),
  )
}

export function findDesignViolations(
  file: string,
  lines: readonly SourceLine[],
  definedStateClasses: ReadonlySet<string> = new Set(),
): readonly DesignContractViolation[] {
  const primitive = isPrimitiveFile(file)
  const violations: DesignContractViolation[] = []

  for (const sourceLine of lines) {
    const { line, text } = sourceLine
    if (isExplicitlyExcepted(text)) {
      continue
    }

    if (
      !primitive &&
      (rawPalettePattern.test(text) ||
        (rawCssColorPattern.test(text) && !isRawColorException(text)))
    ) {
      violations.push({
        file,
        line,
        rule: "raw-palette",
        message:
          "Use a semantic design token; raw palette/theme colors belong in token or explicit exception code.",
      })
    }

    if (!primitive && themeBranchPattern.test(text)) {
      violations.push({
        file,
        line,
        rule: "theme-branch",
        message: "Use semantic tokens instead of a feature-local light or dark theme branch.",
      })
    }

    if (!primitive && (localGlassPattern.test(text) || arbitraryMaterialPattern.test(text))) {
      violations.push({
        file,
        line,
        rule: "local-material",
        message:
          "Compose a shared material recipe (`surface-*`) instead of defining local glass treatment.",
      })
    }

    if (!primitive && arbitraryElevationPattern.test(text)) {
      violations.push({
        file,
        line,
        rule: "arbitrary-elevation",
        message: "Use a shared elevation recipe; component-local shadow values are not allowed.",
      })
    }

    const duration = text.match(offScaleMotionPattern)
    if (duration !== null && (duration[1] === undefined || !allowedDurations.has(duration[1]))) {
      violations.push({
        file,
        line,
        rule: "off-scale-motion",
        message:
          "Use a design-system motion token or one of the approved durations: 0, 120, 200, 320ms.",
      })
    }

    const undefinedState = findUndefinedState(text, definedStateClasses)
    if (undefinedState !== undefined) {
      violations.push({
        file,
        line,
        rule: "undefined-state",
        message: `State class \\"${undefinedState}\\" has no design-system definition.`,
      })
    }
  }

  return violations
}

export function parseAddedLines(diff: string): readonly SourceLine[] {
  const lines: SourceLine[] = []
  let nextLine = 0

  for (const diffLine of diff.split("\n")) {
    const hunk = diffLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/u)
    if (hunk !== null) {
      nextLine = Number(hunk[1])
      continue
    }
    if (nextLine === 0 || diffLine.startsWith("---") || diffLine.startsWith("+++")) {
      continue
    }
    if (diffLine.startsWith("+")) {
      lines.push({ line: nextLine, text: diffLine.slice(1) })
      nextLine += 1
    } else if (!diffLine.startsWith("-")) {
      nextLine += 1
    }
  }

  return lines
}
