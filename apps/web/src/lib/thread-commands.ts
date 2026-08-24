import type { ProviderUserInputAnswers } from "@noyau/protocol/entities/approvals"
import type { TurnImageUpload } from "@noyau/protocol/entities/attachment"
import type { ThreadBranch, ThreadWorktreePath } from "@noyau/protocol/entities/checkout"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode as RuntimeModeType } from "@noyau/protocol/entities/runtime-mode"
import type { TurnPresentation } from "@noyau/protocol/entities/transcript"
import type { PrepareWorktree } from "@noyau/protocol/git"
import {
  CommandId,
  type ApprovalRequestId,
  type ProjectId,
  ThreadId,
  type TurnId,
} from "@noyau/protocol/ids"
import {
  ApprovalRespondRequest,
  ThreadArchiveRequest,
  ThreadCreateRequest,
  ThreadMetaUpdateRequest,
  ThreadModelSelectionSetRequest,
  ThreadRuntimeModeSetRequest,
  ThreadTurnInterruptRequest,
  ThreadTurnStartRequest,
  UserInputRespondRequest,
} from "@noyau/protocol/thread/commands"
import {
  DEFAULT_THREAD_TITLE,
  seedTitleFromPrompt,
  seedTitleFromTurn,
} from "@noyau/protocol/thread/title"
import { Crypto, Effect } from "effect"

const uuid = Effect.fnUntraced(function* () {
  const crypto = yield* Crypto.Crypto
  return yield* crypto.randomUUIDv4
})

type ThreadCreatePayload = {
  readonly threadId: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection
  readonly branch?: ThreadBranch
  readonly worktreePath?: ThreadWorktreePath
}

type ThreadTurnStartPayload = {
  readonly threadId: ThreadId
  readonly text?: string
  readonly titleSeed?: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection | null
  readonly prepareWorktree?: PrepareWorktree
  readonly attachments?: ReadonlyArray<TurnImageUpload>
  readonly presentation?: TurnPresentation
}

type ThreadTurnInterruptPayload = {
  readonly threadId: ThreadId
  readonly turnId?: TurnId
}

export const makeThreadId = Effect.fnUntraced(function* () {
  return ThreadId.make(yield* uuid())
})

export const makeGitActionId = Effect.fnUntraced(function* () {
  return yield* uuid()
})

export const makeThreadCreateRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection | null
  readonly branch?: ThreadBranch
  readonly worktreePath?: ThreadWorktreePath
}) {
  let payload: ThreadCreatePayload = {
    threadId: input.threadId,
    projectId: input.projectId,
    title: input.title.trim(),
  }
  if (input.runtimeMode !== undefined) {
    payload = Object.assign(payload, { runtimeMode: input.runtimeMode })
  }
  if (input.modelSelection !== undefined && input.modelSelection !== null) {
    payload = Object.assign(payload, { modelSelection: input.modelSelection })
  }
  if (input.branch !== undefined) {
    payload = Object.assign(payload, { branch: input.branch })
  }
  if (input.worktreePath !== undefined) {
    payload = Object.assign(payload, { worktreePath: input.worktreePath })
  }
  return ThreadCreateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload,
  })
})

export const makeThreadTurnStartRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly text: string
  readonly titleSeed?: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection | null
  readonly prepareWorktree?: PrepareWorktree
  readonly attachments?: ReadonlyArray<TurnImageUpload>
  readonly presentation?: TurnPresentation
}) {
  const text = input.text.trim()
  let payload: ThreadTurnStartPayload = {
    threadId: input.threadId,
  }
  if (text.length > 0) {
    payload = Object.assign(payload, { text })
  }
  if (input.titleSeed !== undefined) {
    payload = Object.assign(payload, { titleSeed: input.titleSeed })
  }
  if (input.runtimeMode !== undefined) {
    payload = Object.assign(payload, { runtimeMode: input.runtimeMode })
  }
  if (input.modelSelection !== undefined) {
    payload = Object.assign(payload, { modelSelection: input.modelSelection })
  }
  if (input.prepareWorktree !== undefined) {
    payload = Object.assign(payload, { prepareWorktree: input.prepareWorktree })
  }
  if (input.attachments !== undefined && input.attachments.length > 0) {
    payload = Object.assign(payload, { attachments: input.attachments })
  }
  if (input.presentation !== undefined) {
    payload = Object.assign(payload, { presentation: input.presentation })
  }
  return ThreadTurnStartRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload,
  })
})

export const makeThreadTurnInterruptRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly turnId?: TurnId
}) {
  let payload: ThreadTurnInterruptPayload = {
    threadId: input.threadId,
  }
  if (input.turnId !== undefined) {
    payload = Object.assign(payload, { turnId: input.turnId })
  }
  return ThreadTurnInterruptRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload,
  })
})

type ThreadMetaUpdatePayload = {
  readonly threadId: ThreadId
  readonly title?: string
  readonly branch?: ThreadBranch
  readonly worktreePath?: ThreadWorktreePath
}

export const makeThreadMetaUpdateRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly title?: string
  readonly branch?: ThreadBranch
  readonly worktreePath?: ThreadWorktreePath
}) {
  let payload: ThreadMetaUpdatePayload = { threadId: input.threadId }
  if (input.title !== undefined) {
    payload = Object.assign(payload, { title: input.title.trim() })
  }
  if (input.branch !== undefined) {
    payload = Object.assign(payload, { branch: input.branch })
  }
  if (input.worktreePath !== undefined) {
    payload = Object.assign(payload, { worktreePath: input.worktreePath })
  }
  return ThreadMetaUpdateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload,
  })
})

export const makeThreadTitleRegenerateRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
}) {
  return ThreadMetaUpdateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: { threadId: input.threadId, regenerateTitle: true },
  })
})

export const makeThreadArchiveRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
}) {
  return ThreadArchiveRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: { threadId: input.threadId },
  })
})

export { DEFAULT_THREAD_TITLE, seedTitleFromPrompt, seedTitleFromTurn }

export const makeThreadRuntimeModeSetRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly runtimeMode: RuntimeModeType
}) {
  return ThreadRuntimeModeSetRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeThreadModelSelectionSetRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly modelSelection: ModelSelection | null
}) {
  return ThreadModelSelectionSetRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeApprovalRespondRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly requestId: ApprovalRequestId
  readonly decision: "accept" | "acceptForSession" | "decline" | "cancel"
}) {
  return ApprovalRespondRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeUserInputRespondRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly requestId: ApprovalRequestId
  readonly answers: ProviderUserInputAnswers
}) {
  return UserInputRespondRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: {
      threadId: input.threadId,
      requestId: input.requestId,
      answers: input.answers,
    },
  })
})

export const runtimeModes = [
  {
    value: "approval-required",
    label: "Approbation requise",
    description: "Demande une confirmation avant les actions.",
  },
  {
    value: "auto-accept-edits",
    label: "Accepter les éditions",
    description: "Accepte les éditions, demande les autres actions.",
  },
  {
    value: "auto",
    label: "Automatique",
    description: "Approuve les actions courantes quand le provider le permet.",
  },
  {
    value: "full-access",
    label: "Accès complet",
    description: "Autorise les commandes et les éditions sans confirmation.",
  },
] as const satisfies ReadonlyArray<{
  readonly value: RuntimeModeType
  readonly label: string
  readonly description: string
}>

export const isRuntimeMode = (value: string): value is RuntimeModeType =>
  runtimeModes.some((mode) => mode.value === value)
