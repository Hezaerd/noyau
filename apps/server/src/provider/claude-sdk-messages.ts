import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { UserInputQuestion } from "@noyau/protocol/entities/approvals"
import { Schema } from "effect"

const SessionCarrier = Schema.Struct({
  session_id: Schema.optionalKey(Schema.String),
})

const TextBlock = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
})

const ToolUseBlock = Schema.Struct({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
})

const ToolResultBlock = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  is_error: Schema.optionalKey(Schema.Boolean),
})

const AssistantMessageText = Schema.Struct({
  type: Schema.Literal("assistant"),
  session_id: Schema.optionalKey(Schema.String),
  message: Schema.Struct({
    content: Schema.String,
  }),
})

const AssistantMessageBlocks = Schema.Struct({
  type: Schema.Literal("assistant"),
  session_id: Schema.optionalKey(Schema.String),
  message: Schema.Struct({
    content: Schema.Array(Schema.Unknown),
  }),
})

const StreamEvent = Schema.Struct({
  type: Schema.Literal("stream_event"),
  session_id: Schema.optionalKey(Schema.String),
  event: Schema.Struct({
    type: Schema.String,
    delta: Schema.optionalKey(
      Schema.Struct({
        type: Schema.String,
        text: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
})

const UserMessage = Schema.Struct({
  type: Schema.Literal("user"),
  session_id: Schema.optionalKey(Schema.String),
  message: Schema.Struct({
    content: Schema.Array(Schema.Unknown),
  }),
})

const ResultMessage = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  session_id: Schema.optionalKey(Schema.String),
  is_error: Schema.optionalKey(Schema.Boolean),
  result: Schema.optionalKey(Schema.String),
  errors: Schema.optionalKey(Schema.Array(Schema.String)),
})

const AskOption = Schema.Struct({
  label: Schema.String,
})

const AskQuestion = Schema.Struct({
  question: Schema.String,
  options: Schema.Array(AskOption),
  multiSelect: Schema.optionalKey(Schema.Boolean),
})

const ToolInput = Schema.Struct({
  plan: Schema.optionalKey(Schema.String),
  questions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})

const decodeSession = Schema.decodeUnknownOption(SessionCarrier)
const decodeAssistantText = Schema.decodeUnknownOption(AssistantMessageText)
const decodeAssistantBlocks = Schema.decodeUnknownOption(AssistantMessageBlocks)
const decodeStream = Schema.decodeUnknownOption(StreamEvent)
const decodeUser = Schema.decodeUnknownOption(UserMessage)
const decodeResult = Schema.decodeUnknownOption(ResultMessage)
const decodeTextBlock = Schema.decodeUnknownOption(TextBlock)
const decodeToolUse = Schema.decodeUnknownOption(ToolUseBlock)
const decodeToolResult = Schema.decodeUnknownOption(ToolResultBlock)
const decodeAskQuestion = Schema.decodeUnknownOption(AskQuestion)
const decodeToolInput = Schema.decodeUnknownOption(ToolInput)

export interface ClaudeResultMessage {
  readonly subtype: string
  readonly isError: boolean
  readonly result: string | undefined
  readonly errors: ReadonlyArray<string>
}

export const sessionIdOf = (message: SDKMessage): string | undefined => {
  const decoded = decodeSession(message)
  if (decoded._tag !== "Some") {
    return undefined
  }
  const sessionId = decoded.value.session_id
  return sessionId !== undefined && sessionId.length > 0 ? sessionId : undefined
}

export const extractAssistantText = (message: SDKMessage): string => {
  const asText = decodeAssistantText(message)
  if (asText._tag === "Some") {
    return asText.value.message.content
  }
  const asBlocks = decodeAssistantBlocks(message)
  if (asBlocks._tag !== "Some") {
    return ""
  }
  return asBlocks.value.message.content
    .flatMap((block) => {
      const text = decodeTextBlock(block)
      return text._tag === "Some" ? [text.value.text] : []
    })
    .join("")
}

export const extractStreamText = (message: SDKMessage): string => {
  const decoded = decodeStream(message)
  if (decoded._tag !== "Some") {
    return ""
  }
  const event = decoded.value.event
  if (event.type !== "content_block_delta" || event.delta?.type !== "text_delta") {
    return ""
  }
  return event.delta.text ?? ""
}

export const extractToolUses = (
  message: SDKMessage,
): ReadonlyArray<{ readonly id: string; readonly name: string }> => {
  const decoded = decodeAssistantBlocks(message)
  if (decoded._tag !== "Some") {
    return []
  }
  return decoded.value.message.content.flatMap((block) => {
    const tool = decodeToolUse(block)
    return tool._tag === "Some" ? [{ id: tool.value.id, name: tool.value.name }] : []
  })
}

export const extractToolResults = (
  message: SDKMessage,
): ReadonlyArray<{ readonly id: string; readonly isError: boolean }> => {
  const decoded = decodeUser(message)
  if (decoded._tag !== "Some") {
    return []
  }
  return decoded.value.message.content.flatMap((block) => {
    const result = decodeToolResult(block)
    return result._tag === "Some"
      ? [{ id: result.value.tool_use_id, isError: result.value.is_error === true }]
      : []
  })
}

export const extractResultMessage = (message: SDKMessage): ClaudeResultMessage | undefined => {
  const decoded = decodeResult(message)
  if (decoded._tag !== "Some") {
    return undefined
  }
  return {
    subtype: decoded.value.subtype,
    isError: decoded.value.is_error === true,
    result: decoded.value.result,
    errors: decoded.value.errors ?? [],
  }
}

export const extractPlanMarkdown = (toolInput: unknown): string | undefined => {
  const decoded = decodeToolInput(toolInput)
  if (decoded._tag !== "Some") {
    return undefined
  }
  const plan = decoded.value.plan?.trim()
  return plan !== undefined && plan.length > 0 ? plan : undefined
}

export const mapAskUserQuestions = (toolInput: unknown): ReadonlyArray<UserInputQuestion> => {
  const decoded = decodeToolInput(toolInput)
  if (decoded._tag !== "Some") {
    return []
  }
  return (decoded.value.questions ?? []).flatMap((raw, index) => {
    const question = decodeAskQuestion(raw)
    if (question._tag !== "Some") {
      return []
    }
    const prompt = question.value.question
    const options = question.value.options.flatMap((option) =>
      option.label.length > 0 ? [{ id: option.label, label: option.label }] : [],
    )
    if (prompt.length === 0 || options.length < 2) {
      return []
    }
    const mapped: UserInputQuestion = {
      id: prompt.length > 0 ? prompt : `q-${index}`,
      prompt,
      options,
    }
    return question.value.multiSelect === true
      ? [Object.assign(mapped, { allowMultiple: true })]
      : [mapped]
  })
}

export const parseClaudeCliVersion = (output: string): string | null => {
  const match = /\b(\d+\.\d+\.\d+)\b/.exec(output)
  return match?.[1] ?? null
}
