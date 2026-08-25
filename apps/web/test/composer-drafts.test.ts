import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { composerDraftStoreKey } from "../src/lib/composer-drafts"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  promoteComposerDraft,
  readComposerDraft,
  resetComposerDrafts,
  writeComposerDraft,
} from "../src/state/composer-drafts"

const projectA = ProjectId.make("10000000-0000-4000-8000-000000000001")
const projectB = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

afterEach(() => {
  resetAppAtomRegistryForTests()
  resetComposerDrafts()
})

describe("composer drafts", () => {
  it("isolates drafts by Thread and by new-Thread Project", () => {
    writeComposerDraft(projectA, threadA, "from A")
    writeComposerDraft(projectA, threadB, "from B")
    writeComposerDraft(projectA, undefined, "new A")
    writeComposerDraft(projectB, undefined, "new B")

    expect(readComposerDraft(projectA, threadA)).toBe("from A")
    expect(readComposerDraft(projectA, threadB)).toBe("from B")
    expect(readComposerDraft(projectA, undefined)).toBe("new A")
    expect(readComposerDraft(projectB, undefined)).toBe("new B")
    expect(composerDraftStoreKey(projectA, undefined)).toBe(`new:${projectA}`)
    expect(composerDraftStoreKey(projectA, threadA)).toBe(`thread:${threadA}`)
  })

  it("drops an empty draft and resets the session store", () => {
    writeComposerDraft(projectA, threadA, "keep me")
    writeComposerDraft(projectA, threadA, "")
    expect(readComposerDraft(projectA, threadA)).toBe("")

    writeComposerDraft(projectA, threadA, "again")
    writeComposerDraft(projectA, undefined, "new")
    resetComposerDrafts()
    expect(readComposerDraft(projectA, threadA)).toBe("")
    expect(readComposerDraft(projectA, undefined)).toBe("")
  })

  it("promotes a leftover new-Thread Brouillon onto the created Thread", () => {
    writeComposerDraft(projectA, undefined, "continue here")
    promoteComposerDraft(projectA, threadA)

    expect(readComposerDraft(projectA, undefined)).toBe("")
    expect(readComposerDraft(projectA, threadA)).toBe("continue here")
  })

  it("does not overwrite an existing Thread Brouillon on promote", () => {
    writeComposerDraft(projectA, undefined, "new leftover")
    writeComposerDraft(projectA, threadA, "already there")
    promoteComposerDraft(projectA, threadA)

    expect(readComposerDraft(projectA, undefined)).toBe("new leftover")
    expect(readComposerDraft(projectA, threadA)).toBe("already there")
  })
})
