import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import {
  emptyCursorProviderStatus,
  type CursorProviderStatus,
} from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ResumeCursor, SessionStatus } from "@noyau/protocol/entities/session"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { TurnSettlementState } from "@noyau/protocol/entities/turn"
import type { ApprovalRequestId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { Context, Effect, Layer } from "effect"

export interface ProviderTurnInput {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly text: string
  readonly workspaceRoot: string
  readonly runtimeMode: RuntimeMode
  readonly modelSelection: ModelSelection | null
  readonly resumeCursor: ResumeCursor | null
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
  readonly status: Effect.Effect<CursorProviderStatus>
  readonly startTurn: (input: ProviderTurnInput, emit: ProviderEmit) => Effect.Effect<void>
  readonly interrupt: (threadId: ThreadId) => Effect.Effect<void>
  readonly stop: (threadId: ThreadId) => Effect.Effect<void>
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
  readonly drain: Effect.Effect<void>
}

export class ProviderPort extends Context.Service<ProviderPort, ProviderPortService>()(
  "@noyau/server/provider/ProviderPort",
) {}

export const unavailableProviderLayer = Layer.succeed(ProviderPort)({
  status: Effect.succeed(emptyCursorProviderStatus),
  startTurn: (_input, _emit) => Effect.void,
  interrupt: (_threadId) => Effect.void,
  stop: (_threadId) => Effect.void,
  respondApproval: (_threadId, _requestId, _decision) => Effect.void,
  respondUserInput: (_threadId, _requestId, _answers) => Effect.void,
  drain: Effect.void,
})
