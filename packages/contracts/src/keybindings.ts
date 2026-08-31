import { Effect, Schema } from "effect"

export const KEYBINDINGS_FILE_NAME = "keybindings.json"
export const MAX_KEYBINDINGS_COUNT = 256

export const KeybindingRule = Schema.Struct({
  key: Schema.String,
  command: Schema.NonEmptyString,
  when: Schema.optionalKey(Schema.String),
})
export type KeybindingRule = (typeof KeybindingRule)["Type"]

export const KeybindingsFile = Schema.Array(KeybindingRule)
export type KeybindingsFile = (typeof KeybindingsFile)["Type"]

export const KeybindingsSnapshot = Schema.Struct({
  rules: KeybindingsFile,
})
export type KeybindingsSnapshot = (typeof KeybindingsSnapshot)["Type"]

export const DEFAULT_KEYBINDINGS_SNAPSHOT: KeybindingsSnapshot = { rules: [] }

export const KeybindingsFileJson = Schema.fromJsonString(KeybindingsFile, { space: 2 })

export const KeybindingsOperation = Schema.Literals(["read-file", "write-file", "decode"])
export type KeybindingsOperation = (typeof KeybindingsOperation)["Type"]

export class KeybindingsError extends Schema.TaggedError<KeybindingsError>()("KeybindingsError", {
  keybindingsPath: Schema.String,
  operation: KeybindingsOperation,
  cause: Schema.Defect(),
}) {}

const takeKeybindingsRules = (rules: KeybindingsFile): KeybindingsFile =>
  rules.length <= MAX_KEYBINDINGS_COUNT ? rules : rules.slice(0, MAX_KEYBINDINGS_COUNT)

export const decodeKeybindingsFile = (
  encoded: string,
): Effect.Effect<KeybindingsFile, Schema.SchemaError> =>
  Schema.decodeEffect(KeybindingsFileJson)(encoded).pipe(Effect.map(takeKeybindingsRules))

export const encodeKeybindingsFile = (
  rules: ReadonlyArray<KeybindingRule>,
): Effect.Effect<string, Schema.SchemaError> =>
  Schema.encodeEffect(KeybindingsFileJson)(takeKeybindingsRules([...rules]))

export const serializeKeybindingsFile = (rules: ReadonlyArray<KeybindingRule>): string =>
  `${JSON.stringify(takeKeybindingsRules([...rules]), null, 2)}\n`

export const sameKeybindingsRules = (
  left: ReadonlyArray<KeybindingRule>,
  right: ReadonlyArray<KeybindingRule>,
): boolean => {
  if (left.length !== right.length) {
    return false
  }
  return left.every((rule, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      rule.key === other.key &&
      rule.command === other.command &&
      rule.when === other.when
    )
  })
}
