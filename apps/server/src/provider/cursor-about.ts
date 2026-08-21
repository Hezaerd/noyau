import { Option, Schema } from "effect"

export interface CursorAboutResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
}

export interface CursorAboutProbe {
  readonly version: string | null
  readonly plan: string | null
}

const CursorAboutJson = Schema.Struct({
  cliVersion: Schema.optionalKey(Schema.String),
  subscriptionTier: Schema.optionalKey(Schema.String),
})

const decodeAboutJson = Schema.decodeUnknownOption(Schema.fromJsonString(CursorAboutJson))

const emptyAboutProbe: CursorAboutProbe = {
  version: null,
  plan: null,
}

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]|${String.fromCharCode(27)}\\].*?${String.fromCharCode(7)}`,
  "g",
)

const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "")

const trimOrNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

const extractAboutField = (plain: string, key: string): string | null => {
  const match = new RegExp(`^${key}\\s{2,}(.+)$`, "mi").exec(plain)
  return trimOrNull(match?.[1])
}

const titleCaseWords = (value: string): string =>
  value
    .split(/[\s_-]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")

export const cursorPlanLabel = (subscriptionType: string | null | undefined): string | null => {
  const trimmed = subscriptionType?.trim()
  if (trimmed === undefined || trimmed.length === 0) {
    return null
  }
  switch (trimmed.toLowerCase().replace(/[\s_-]+/g, "")) {
    case "team":
      return "Team"
    case "pro":
      return "Pro"
    case "free":
      return "Free"
    case "business":
      return "Business"
    case "enterprise":
      return "Enterprise"
    default:
      return titleCaseWords(trimmed)
  }
}

export const isCursorAboutJsonFormatUnsupported = (result: CursorAboutResult): boolean => {
  const lowerOutput = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return (
    lowerOutput.includes("unknown option '--format'") ||
    lowerOutput.includes("unexpected argument '--format'") ||
    lowerOutput.includes("unrecognized option '--format'") ||
    lowerOutput.includes("unknown argument '--format'")
  )
}

/** Parse `agent about` stdout. Ignore email — Noyau n'affiche pas le compte. */
export const parseCursorAboutOutput = (result: CursorAboutResult): CursorAboutProbe => {
  const jsonPayload = decodeAboutJson(result.stdout.trim())
  if (Option.isSome(jsonPayload)) {
    return {
      version: trimOrNull(jsonPayload.value.cliVersion),
      plan: cursorPlanLabel(jsonPayload.value.subscriptionTier),
    }
  }

  const combined = `${result.stdout}\n${result.stderr}`
  const lowerOutput = combined.toLowerCase()
  if (
    lowerOutput.includes("unknown command") ||
    lowerOutput.includes("unrecognized command") ||
    lowerOutput.includes("unexpected argument")
  ) {
    return emptyAboutProbe
  }

  const plain = stripAnsi(combined)
  return {
    version: extractAboutField(plain, "CLI Version"),
    plan: cursorPlanLabel(extractAboutField(plain, "Subscription")),
  }
}
