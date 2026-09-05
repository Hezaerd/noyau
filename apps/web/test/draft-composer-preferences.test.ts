import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { afterEach, describe, expect, it } from "vitest"

import {
  clearDraftComposerPreferences,
  peekDraftComposerPreferences,
  promoteDraftComposerPreferences,
  rememberDraftComposerPreferences,
  resetDraftComposerPreferences,
} from "../src/lib/draft-composer-preferences"

const projectA = ProjectId.make("10000000-0000-4000-8000-000000000001")
const projectB = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

const preferences = {
  provider: ProviderInstanceId.make("codex"),
  modelSelection: {
    modelId: "gpt-5.4",
    reasoningEffort: "high",
    serviceTier: "priority",
    thinking: true,
  },
  runtimeMode: "approval-required",
} as const

afterEach(resetDraftComposerPreferences)

describe("draft composer preferences", () => {
  it("keeps model traits and access level isolated by draft", () => {
    rememberDraftComposerPreferences({ projectId: projectA, threadId: undefined, preferences })
    rememberDraftComposerPreferences({
      projectId: projectA,
      threadId: threadA,
      preferences: { ...preferences, runtimeMode: "full-access" },
    })

    expect(peekDraftComposerPreferences(projectA, undefined)).toEqual(preferences)
    expect(peekDraftComposerPreferences(projectA, threadA)?.runtimeMode).toBe("full-access")
    expect(peekDraftComposerPreferences(projectA, threadB)).toBeUndefined()
    expect(peekDraftComposerPreferences(projectB, undefined)).toBeUndefined()
  })

  it("promotes a new-Thread selection until the created Thread has a snapshot", () => {
    rememberDraftComposerPreferences({ projectId: projectA, threadId: undefined, preferences })
    promoteDraftComposerPreferences(projectA, threadA)

    expect(peekDraftComposerPreferences(projectA, undefined)).toBeUndefined()
    expect(peekDraftComposerPreferences(projectA, threadA)).toEqual(preferences)
  })

  it("does not overwrite existing Thread preferences during promotion", () => {
    const existing = { ...preferences, runtimeMode: "full-access" } as const
    rememberDraftComposerPreferences({ projectId: projectA, threadId: undefined, preferences })
    rememberDraftComposerPreferences({
      projectId: projectA,
      threadId: threadA,
      preferences: existing,
    })
    promoteDraftComposerPreferences(projectA, threadA)

    expect(peekDraftComposerPreferences(projectA, undefined)).toEqual(preferences)
    expect(peekDraftComposerPreferences(projectA, threadA)).toEqual(existing)
  })

  it("clears a remembered draft", () => {
    rememberDraftComposerPreferences({ projectId: projectA, threadId: threadA, preferences })
    clearDraftComposerPreferences(projectA, threadA)
    expect(peekDraftComposerPreferences(projectA, threadA)).toBeUndefined()
  })
})
