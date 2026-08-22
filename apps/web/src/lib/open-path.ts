import { Effect, Schema } from "effect"

class DesktopOpenPathUnavailable extends Schema.TaggedError<DesktopOpenPathUnavailable>()(
  "DesktopOpenPathUnavailable",
  {
    message: Schema.String,
  },
) {}

class DesktopOpenPathFailed extends Schema.TaggedError<DesktopOpenPathFailed>()(
  "DesktopOpenPathFailed",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export const openFilesystemPathEffect = Effect.fn("openFilesystemPath")(function* (path: string) {
  const openPath = globalThis.window?.noyauDesktop?.openPath
  if (openPath === undefined) {
    return yield* new DesktopOpenPathUnavailable({
      message: "Desktop bridge is unavailable",
    })
  }

  yield* Effect.tryPromise({
    try: () => openPath(path),
    catch: (cause) =>
      new DesktopOpenPathFailed({ message: "Unable to open filesystem path", cause }),
  })
})

export const openFilesystemPath = (path: string) =>
  Effect.runPromise(openFilesystemPathEffect(path))
