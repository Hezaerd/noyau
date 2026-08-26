import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  composerDraftStoreKey,
  parseComposerDrafts,
  serializeComposerDrafts,
} from "../src/lib/composer-drafts"
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

  it("round-trips valid drafts and drops empty or unknown keys", () => {
    const drafts = new Map([
      [composerDraftStoreKey(projectA, threadA), "from A"],
      [composerDraftStoreKey(projectA, undefined), "new A"],
    ])

    expect(parseComposerDrafts(serializeComposerDrafts(drafts))).toEqual(drafts)
    expect(parseComposerDrafts(null)).toEqual(new Map())
    expect(parseComposerDrafts("")).toEqual(new Map())
    expect(parseComposerDrafts("{")).toEqual(new Map())
    expect(
      parseComposerDrafts(
        JSON.stringify({
          [composerDraftStoreKey(projectA, threadA)]: "keep",
          [composerDraftStoreKey(projectA, threadB)]: "",
          "thread:not-a-uuid": "nope",
          leftover: "nope",
        }),
      ),
    ).toEqual(new Map([[composerDraftStoreKey(projectA, threadA), "keep"]]))
  })
})
