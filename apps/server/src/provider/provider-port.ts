import type { AgentSkillEntry } from "@noyau/contracts/entities/agent-skill"
import type {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/contracts/entities/approvals"
import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import type {
  Provider,
  ProviderInstanceView,
  ProviderInstanceViewMap,
} from "@noyau/contracts/entities/environment"
import { emptyEnvironmentProviders } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { ResumeCursor, SessionStatus } from "@noyau/contracts/entities/session"
import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { ProviderForkPoint } from "@noyau/contracts/entities/turn"
import type { TurnSettlementState } from "@noyau/contracts/entities/turn"
import type { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Context, Data, Effect, Layer } from "effect"

import type { PromptTicket } from "./prompt-blocks.ts"

export interface ProviderTurnAttachment extends TurnImageAttachment {
  readonly data: Uint8Array
}

export type ProviderStatuses = ProviderInstanceViewMap

export const emptyProviderStatuses: ProviderStatuses = emptyEnvironmentProviders()

export const singleInstanceStatuses = (view: ProviderInstanceView): ProviderStatuses => ({
  [view.instanceId]: view,
})

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

export interface ProviderForkInput {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly sourceThreadId: ThreadId
  readonly sourceTurnId: TurnId
  readonly provider: Provider
  readonly workspaceRoot: string
  readonly sourceResumeCursor: ResumeCursor
  readonly sourceForkPoint: ProviderForkPoint
}

export class ProviderForkUnavailable extends Data.TaggedError("ProviderForkUnavailable")<{
  readonly message: string
}> {}

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
      readonly forkPoint?: ProviderForkPoint
    }
  | {
      readonly _tag: "context-usage"
      readonly threadId: ThreadId
      readonly used: number
      readonly window: number
    }

export type ProviderEmit = (signal: ProviderSignal) => Effect.Effect<void>

export interface ProviderPortService {
  readonly status: Effect.Effect<ProviderStatuses>
  readonly listSkills: (
    provider: Provider,
    workspaceRoot: string,
  ) => Effect.Effect<ReadonlyArray<AgentSkillEntry>>
  /** Starts a Turn, reusing the live provider Session for its Thread when one exists. */
  readonly startTurn: (input: ProviderTurnInput, emit: ProviderEmit) => Effect.Effect<void>
  /** Creates an independent native provider session; never reconstructs a prompt. */
  readonly fork?: (input: ProviderForkInput) => Effect.Effect<ResumeCursor, ProviderForkUnavailable>
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
  listSkills: (_provider, _workspaceRoot) => Effect.succeed([]),
  startTurn: (_input, _emit) => Effect.void,
  interrupt: (_threadId) => Effect.void,
  stop: (_threadId) => Effect.void,
  reapIdle: (_threadId) => Effect.succeed(false),
  stopAll: Effect.void,
  respondApproval: (_threadId, _requestId, _decision) => Effect.void,
  respondUserInput: (_threadId, _requestId, _answers) => Effect.void,
  drain: Effect.void,
})
