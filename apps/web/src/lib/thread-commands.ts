import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode as RuntimeModeType } from "@noyau/protocol/entities/runtime-mode"
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
  ThreadRuntimeModeSetRequest,
  ThreadTurnInterruptRequest,
  ThreadTurnStartRequest,
  UserInputRespondRequest,
} from "@noyau/protocol/thread/commands"
import { DEFAULT_THREAD_TITLE, seedTitleFromPrompt } from "@noyau/protocol/thread/title"
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
}

type ThreadTurnStartPayload = {
  readonly threadId: ThreadId
  readonly text: string
  readonly titleSeed?: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection | null
}

type ThreadTurnInterruptPayload = {
  readonly threadId: ThreadId
  readonly turnId?: TurnId
}

export const makeThreadId = Effect.fnUntraced(function* () {
  return ThreadId.make(yield* uuid())
})

export const makeThreadCreateRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly runtimeMode?: RuntimeModeType
  readonly modelSelection?: ModelSelection | null
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
}) {
  let payload: ThreadTurnStartPayload = {
    threadId: input.threadId,
    text: input.text.trim(),
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

export const makeThreadMetaUpdateRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly title: string
}) {
  return ThreadMetaUpdateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: {
      threadId: input.threadId,
      title: input.title.trim(),
    },
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

export { DEFAULT_THREAD_TITLE, seedTitleFromPrompt }

export const makeThreadRuntimeModeSetRequest = Effect.fnUntraced(function* (input: {
  readonly threadId: ThreadId
  readonly runtimeMode: RuntimeModeType
}) {
  return ThreadRuntimeModeSetRequest.make({
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
  readonly answer: string
}) {
  return UserInputRespondRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: {
      threadId: input.threadId,
      requestId: input.requestId,
      answers: { answer: input.answer },
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
    description: "Laisse Cursor choisir automatiquement.",
  },
  {
    value: "full-access",
    label: "Accès complet",
    description: "Autorise automatiquement les actions Cursor.",
  },
] as const satisfies ReadonlyArray<{
  readonly value: RuntimeModeType
  readonly label: string
  readonly description: string
}>

export const isRuntimeMode = (value: string): value is RuntimeModeType =>
  runtimeModes.some((mode) => mode.value === value)
