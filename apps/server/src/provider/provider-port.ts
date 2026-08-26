import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import type { TurnImageAttachment } from "@noyau/protocol/entities/attachment"
import type { Provider } from "@noyau/protocol/entities/environment"
import {
  emptyCodexProviderStatus,
  emptyCursorProviderStatus,
  type CodexProviderStatus,
  type CursorProviderStatus,
} from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ResumeCursor, SessionStatus } from "@noyau/protocol/entities/session"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { TurnSettlementState } from "@noyau/protocol/entities/turn"
import type { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { Context, Effect, Layer } from "effect"

import type { PromptTicket } from "./prompt-blocks.ts"

export interface ProviderTurnAttachment extends TurnImageAttachment {
  readonly data: Uint8Array
}

export interface ProviderStatuses {
  readonly cursor: CursorProviderStatus
  readonly codex: CodexProviderStatus
}

export const emptyProviderStatuses: ProviderStatuses = {
  cursor: emptyCursorProviderStatus,
  codex: emptyCodexProviderStatus,
}

export interface ProviderTurnInput {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly provider: Provider
  readonly text: string
  readonly workspaceRoot: string
  readonly runtimeMode: RuntimeMode
  readonly modelSelection: ModelSelection | null
  readonly resumeCursor: ResumeCursor | null
  readonly attachments?: ReadonlyArray<ProviderTurnAttachment> | undefined
  readonly tickets?: ReadonlyArray<PromptTicket> | undefined
}

export type ProviderSignal =
  | {
      readonly _tag: "session"
      readonly threadId: ThreadId
      readonly turnId: TurnId
      readonly status: SessionStatus
      readonly resumeCursor: ResumeCursor | null
      readonly lastError?: string
    }
  | {
      readonly _tag: "transcript"
      readonly item: TranscriptItem
    }
  | {
      readonly _tag: "turn-ended"
      readonly threadId: ThreadId
      readonly turnId: TurnId
      readonly state: TurnSettlementState
      readonly lastError?: string
    }

export type ProviderEmit = (signal: ProviderSignal) => Effect.Effect<void>

export interface ProviderPortService {
  readonly status: Effect.Effect<ProviderStatuses>
  /** Starts a Turn, reusing the live provider Session for its Thread when one exists. */
  readonly startTurn: (input: ProviderTurnInput, emit: ProviderEmit) => Effect.Effect<void>
  readonly interrupt: (threadId: ThreadId) => Effect.Effect<void>
  /** Stops the provider Session, including when it is idle between Turns. */
  readonly stop: (threadId: ThreadId) => Effect.Effect<void>
  /** Atomically closes an idle runtime; returns false when no idle runtime was owned. */
  readonly reapIdle: (threadId: ThreadId) => Effect.Effect<boolean>
  /** Closes every live provider Session during Server shutdown. */
  readonly stopAll: Effect.Effect<void>
  readonly respondApproval: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void>
  readonly respondUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void>
  /** Waits for the Turn fibers owned by this port; it does not stop idle Sessions. */
  readonly drain: Effect.Effect<void>
}

export class ProviderPort extends Context.Service<ProviderPort, ProviderPortService>()(
  "@noyau/server/provider/ProviderPort",
) {}

export const unavailableProviderLayer = Layer.succeed(ProviderPort)({
  status: Effect.succeed(emptyProviderStatuses),
  startTurn: (_input, _emit) => Effect.void,
  interrupt: (_threadId) => Effect.void,
  stop: (_threadId) => Effect.void,
  reapIdle: (_threadId) => Effect.succeed(false),
  stopAll: Effect.void,
  respondApproval: (_threadId, _requestId, _decision) => Effect.void,
  respondUserInput: (_threadId, _requestId, _answers) => Effect.void,
  drain: Effect.void,
})
