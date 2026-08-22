import { Effect, Schema } from "effect"

export class InvalidFilesystemPath extends Schema.TaggedError<InvalidFilesystemPath>()(
  "InvalidFilesystemPath",
  {
    path: Schema.String,
  },
) {}

export class OpenFilesystemPathFailed extends Schema.TaggedError<OpenFilesystemPathFailed>()(
  "OpenFilesystemPathFailed",
  {
    path: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const FILE_URL_PREFIX_PATTERN = /^file:\/\//i
const BLOCKED_SCHEME_PATTERN = /^(https?|mailto|javascript|data|vscode):/i

export const OpenPathInputSchema = Schema.String

export const decodeOpenPathInput = Schema.decodeUnknownEffect(OpenPathInputSchema)

const unwrapFileUrl = (value: string): string => {
  if (!FILE_URL_PREFIX_PATTERN.test(value)) {
    return value
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol.toLowerCase() !== "file:") {
      return value
    }
    const pathname = decodeURIComponent(parsed.pathname)
    return /^\/[A-Za-z]:[\\/]/.test(pathname) ? pathname.slice(1) : pathname
  } catch {
    return value
  }
}

/** Accepts a local filesystem path and rejects web or script URLs. */
export const resolveOpenableFilesystemPath = (input: string): string | null => {
  const trimmed = unwrapFileUrl(input.trim())
  if (trimmed.length === 0 || trimmed.includes("\0")) {
    return null
  }
  if (WINDOWS_DRIVE_PATH_PATTERN.test(trimmed)) {
    return trimmed
  }
  if (BLOCKED_SCHEME_PATTERN.test(trimmed)) {
    return null
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith("/")) {
    return null
  }
  return trimmed
}

export const openFilesystemPathOnHost = Effect.fn("openFilesystemPathOnHost")(function* (
  path: string,
  openPath: (resolved: string) => Promise<string>,
) {
  const resolved = resolveOpenableFilesystemPath(path)
  if (resolved === null) {
    return yield* new InvalidFilesystemPath({ path })
  }

  const error = yield* Effect.tryPromise({
    try: () => openPath(resolved),
    catch: (cause) =>
      new OpenFilesystemPathFailed({
        path: resolved,
        message: "Unable to open filesystem path",
        cause,
      }),
  })
  if (error.length > 0) {
    return yield* new OpenFilesystemPathFailed({ path: resolved, message: error })
  }
})
