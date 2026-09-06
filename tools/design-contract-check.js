import { execFileSync } from "node:child_process"

import { findDesignViolations, parseAddedLines } from "./design-contract.ts"

const gitAddedLines = (file) => {
  const diff = execFileSync("git", ["diff", "--cached", "--unified=0", "--no-color", "--", file], {
    encoding: "utf8",
  })
  return parseAddedLines(diff)
}

const normalizeSourceFile = (file) => {
  const normalized = file.replace(/^\.\//u, "")
  const sourceMarkers = ["apps/web/src/", "apps/desktop/src/"]
  const sourceMarker = sourceMarkers.find((marker) => normalized.includes(marker))
  const sourceIndex = sourceMarker === undefined ? -1 : normalized.indexOf(sourceMarker)
  return sourceIndex === -1 ? normalized : normalized.slice(sourceIndex)
}

const files = process.argv
  .slice(2)
  .map(normalizeSourceFile)
  .filter(
    (file) =>
      (file.startsWith("apps/web/src/") || file.startsWith("apps/desktop/src/")) &&
      !/\.test\.[jt]sx?$/u.test(file),
  )
const definedStateClasses = new Set(["state-working"])
const violations = files.flatMap((file) =>
  findDesignViolations(file, gitAddedLines(file), definedStateClasses),
)

for (const violation of violations) {
  process.stderr.write(`${violation.file}:${String(violation.line)}: ${violation.message}\n`)
}
if (violations.length > 0) {
  process.exitCode = 1
}
