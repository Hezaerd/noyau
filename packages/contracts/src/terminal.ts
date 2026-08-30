import { Schema } from "effect"

import { ProjectId, ThreadId } from "./ids.ts"

const TrimmedNonEmpty = Schema.NonEmptyString
const TerminalCols = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(1000),
)
const TerminalRows = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(500),
)

/**
 * Id choisi par le client (l’id d’onglet du workspace panel).
 * Le serveur n’alloue jamais.
 */
export const TerminalId = TrimmedNonEmpty.check(Schema.isMaxLength(128))
export type TerminalId = typeof TerminalId.Type

/** Portée d’une session PTY. Le cwd est résolu côté serveur, jamais fourni par le client. */
export const TerminalScope = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  terminalId: TerminalId,
})
export type TerminalScope = typeof TerminalScope.Type

export const TerminalSize = Schema.Struct({
  cols: Schema.optionalKey(TerminalCols),
  rows: Schema.optionalKey(TerminalRows),
})
export type TerminalSize = typeof TerminalSize.Type

export const TerminalAttachInput = Schema.Struct({
  ...TerminalScope.fields,
  ...TerminalSize.fields,
})
export type TerminalAttachInput = typeof TerminalAttachInput.Type

export const TerminalWriteInput = Schema.Struct({
  ...TerminalScope.fields,
  data: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(65_536)),
})
export type TerminalWriteInput = typeof TerminalWriteInput.Type

export const TerminalResizeInput = Schema.Struct({
  ...TerminalScope.fields,
  cols: TerminalCols,
  rows: TerminalRows,
})
export type TerminalResizeInput = typeof TerminalResizeInput.Type

export const TerminalClearInput = TerminalScope
export type TerminalClearInput = typeof TerminalClearInput.Type

export const TerminalRestartInput = Schema.Struct({
  ...TerminalScope.fields,
  cols: TerminalCols,
  rows: TerminalRows,
})
export type TerminalRestartInput = typeof TerminalRestartInput.Type

export const TerminalCloseInput = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  terminalId: Schema.optionalKey(TerminalId),
})
export type TerminalCloseInput = typeof TerminalCloseInput.Type

export const TerminalSessionStatus = Schema.Literals(["starting", "running", "exited", "error"])
export type TerminalSessionStatus = typeof TerminalSessionStatus.Type

export const TerminalSessionSnapshot = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  terminalId: TerminalId,
  cwd: TrimmedNonEmpty,
  status: TerminalSessionStatus,
  pid: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  history: Schema.String,
  exitCode: Schema.NullOr(Schema.Int),
  exitSignal: Schema.NullOr(Schema.Int),
  label: Schema.String.check(Schema.isMaxLength(128)),
  updatedAt: Schema.DateTimeUtcFromString,
})
export type TerminalSessionSnapshot = typeof TerminalSessionSnapshot.Type

export const TerminalAttachStreamEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    snapshot: TerminalSessionSnapshot,
  }),
  Schema.TaggedStruct("output", {
    ...TerminalScope.fields,
    data: Schema.String,
  }),
  Schema.TaggedStruct("exited", {
    ...TerminalScope.fields,
    exitCode: Schema.NullOr(Schema.Int),
    exitSignal: Schema.NullOr(Schema.Int),
  }),
  Schema.TaggedStruct("closed", {
    ...TerminalScope.fields,
  }),
  Schema.TaggedStruct("cleared", {
    ...TerminalScope.fields,
  }),
  Schema.TaggedStruct("restarted", {
    snapshot: TerminalSessionSnapshot,
  }),
  Schema.TaggedStruct("error", {
    ...TerminalScope.fields,
    message: TrimmedNonEmpty,
  }),
])
export type TerminalAttachStreamEvent = typeof TerminalAttachStreamEvent.Type

export class TerminalCwdNotFoundError extends Schema.TaggedError<TerminalCwdNotFoundError>()(
  "TerminalCwdNotFoundError",
  { cwd: Schema.String },
) {}

export class TerminalCwdNotDirectoryError extends Schema.TaggedError<TerminalCwdNotDirectoryError>()(
  "TerminalCwdNotDirectoryError",
  { cwd: Schema.String },
) {}

export const TerminalCwdError = Schema.Union([
  TerminalCwdNotFoundError,
  TerminalCwdNotDirectoryError,
])
export type TerminalCwdError = typeof TerminalCwdError.Type

export class TerminalSessionLookupError extends Schema.TaggedError<TerminalSessionLookupError>()(
  "TerminalSessionLookupError",
  {
    threadId: ThreadId,
    terminalId: TerminalId,
  },
) {}

export class TerminalNotRunningError extends Schema.TaggedError<TerminalNotRunningError>()(
  "TerminalNotRunningError",
  {
    threadId: ThreadId,
    terminalId: TerminalId,
  },
) {}

export class TerminalWriteError extends Schema.TaggedError<TerminalWriteError>()(
  "TerminalWriteError",
  {
    threadId: ThreadId,
    terminalId: TerminalId,
    cause: Schema.Defect(),
  },
) {}

export class TerminalResizeError extends Schema.TaggedError<TerminalResizeError>()(
  "TerminalResizeError",
  {
    threadId: ThreadId,
    terminalId: TerminalId,
    cols: TerminalCols,
    rows: TerminalRows,
    cause: Schema.Defect(),
  },
) {}

export class TerminalSpawnError extends Schema.TaggedError<TerminalSpawnError>()(
  "TerminalSpawnError",
  {
    adapter: Schema.NonEmptyString,
    cwd: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export const TerminalError = Schema.Union([
  TerminalCwdError,
  TerminalSessionLookupError,
  TerminalNotRunningError,
  TerminalWriteError,
  TerminalResizeError,
  TerminalSpawnError,
])
export type TerminalError = typeof TerminalError.Type
