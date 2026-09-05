// @vitest-environment happy-dom

import { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import {
  ASK_QUESTION_DRAFTS_STORAGE_KEY,
  askQuestionFingerprint,
  clearTerminalAskQuestionDrafts,
  parseAskQuestionDrafts,
  readAskQuestionDraft,
  writeAskQuestionDraft,
} from "../src/lib/ask-question-drafts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")

const makeRequest = (
  prompt = "First choice",
  status: "pending" | "resolved" | "detached" | "cancelled" | "consumed" = "pending",
) =>
  Schema.decodeSync(TranscriptUserInput)({
    _tag: "transcript.user-input",
    threadId,
    turnId,
    requestId: ApprovalRequestId.make("request-1"),
    questions: [
      {
        id: "one",
        prompt,
        options: [
          { id: "one-a", label: "A" },
          { id: "one-b", label: "B" },
        ],
      },
      {
        id: "two",
        prompt: "Second choice",
        options: [
          { id: "two-a", label: "A" },
          { id: "two-b", label: "B" },
        ],
      },
    ],
    status,
  })

afterEach(() => window.localStorage.clear())

describe("AskQuestion draft storage", () => {
  it("rejects malformed and unknown-version storage", () => {
    expect(parseAskQuestionDrafts("not-json").size).toBe(0)
    expect(parseAskQuestionDrafts(JSON.stringify({ version: 2, drafts: [] })).size).toBe(0)
    expect(parseAskQuestionDrafts(JSON.stringify({ version: 1, drafts: [{}] })).size).toBe(0)
  })

  it("bounds orphan cleanup by age and most-recent count", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z")
    const drafts = Array.from({ length: 52 }, (_, index) => ({
      projectId,
      threadId,
      requestId: ApprovalRequestId.make(`request-${index}`),
      fingerprint: "fingerprint",
      answers: {},
      legacyFreeform: "",
      currentQuestionIndex: 0,
      updatedAt: index === 51 ? now - 31 * 24 * 60 * 60 * 1_000 : now - index,
    }))

    const parsed = parseAskQuestionDrafts(JSON.stringify({ version: 1, drafts }), now)
    expect(parsed.size).toBe(50)
    expect([...parsed.values()].some((draft) => draft.requestId === "request-51")).toBe(false)
  })

  it("drops a stored draft when the request fingerprint changes", () => {
    const request = makeRequest()
    writeAskQuestionDraft({
      projectId,
      threadId,
      request,
      value: {
        answers: { one: { optionIds: ["one-a"] } },
        legacyFreeform: "",
        currentQuestionIndex: 1,
      },
    })

    expect(askQuestionFingerprint(makeRequest("Changed choice"))).not.toBe(
      askQuestionFingerprint(request),
    )
    expect(
      readAskQuestionDraft({ projectId, threadId, request: makeRequest("Changed choice") }),
    ).toEqual({
      answers: {},
      legacyFreeform: "",
      currentQuestionIndex: 0,
    })
  })

  it("restores a partial draft and discards unknown questions and options", () => {
    const request = makeRequest()
    writeAskQuestionDraft({
      projectId,
      threadId,
      request,
      value: {
        answers: {
          one: { optionIds: ["missing", "one-b", "one-a"] },
          ghost: { optionIds: ["ghost-a"] },
        },
        legacyFreeform: "not used for structured questions",
        currentQuestionIndex: 1,
      },
    })

    expect(readAskQuestionDraft({ projectId, threadId, request })).toEqual({
      answers: { one: { optionIds: ["one-b"] } },
      legacyFreeform: "",
      currentQuestionIndex: 1,
    })
  })

  it("clears only after a durable terminal transcript item is observed", () => {
    const pending = makeRequest()
    writeAskQuestionDraft({
      projectId,
      threadId,
      request: pending,
      value: {
        answers: { one: { optionIds: ["one-a"] } },
        legacyFreeform: "",
        currentQuestionIndex: 1,
      },
    })
    clearTerminalAskQuestionDrafts({ projectId, threadId, transcript: [pending] })
    expect(window.localStorage.getItem(ASK_QUESTION_DRAFTS_STORAGE_KEY)).not.toBeNull()
    clearTerminalAskQuestionDrafts({
      projectId,
      threadId,
      transcript: [makeRequest("First choice", "detached")],
    })
    expect(window.localStorage.getItem(ASK_QUESTION_DRAFTS_STORAGE_KEY)).not.toBeNull()

    clearTerminalAskQuestionDrafts({
      projectId,
      threadId,
      transcript: [makeRequest("First choice", "consumed")],
    })
    expect(window.localStorage.getItem(ASK_QUESTION_DRAFTS_STORAGE_KEY)).toBeNull()
  })
})
