import { TerminalSpawnError } from "@noyau/contracts/terminal"
import { Context, Effect, Schema } from "effect"

export interface PtyExitEvent {
  readonly exitCode: number
  readonly signal: number | null
}

export interface PtyProcess {
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(callback: (data: string) => void): () => void
  onExit(callback: (event: PtyExitEvent) => void): () => void
}

export interface PtySpawnInput {
  readonly shell: string
  readonly args?: ReadonlyArray<string>
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: Record<string, string>
}

export class PtyAdapter extends Context.Service<
  PtyAdapter,
  {
    readonly spawn: (input: PtySpawnInput) => Effect.Effect<PtyProcess, TerminalSpawnError>
  }
>()("@noyau/server/terminal/PtyAdapter") {}

export class PtyAdapterUnavailableError extends Schema.TaggedError<PtyAdapterUnavailableError>()(
  "PtyAdapterUnavailableError",
  {
    adapter: Schema.NonEmptyString,
    detail: Schema.NonEmptyString,
  },
) {}
