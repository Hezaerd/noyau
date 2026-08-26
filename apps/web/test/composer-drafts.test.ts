import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  composerDraftStoreKey,
  parseComposerDrafts,
  serializeComposerDrafts,
  sessionDraftsFromStoredTexts,
  storedTextsFromSessionDrafts,
} from "../src/lib/composer-drafts"
import type { ComposerImage } from "../src/lib/composer-images"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  promoteComposerDraft,
  readComposerDraft,
  readComposerDraftImages,
  removeComposerDraftImage,
  replaceComposerDraft,
  resetComposerDrafts,
  writeComposerDraft,
  writeComposerDraftImages,
} from "../src/state/composer-drafts"

const projectA = ProjectId.make("10000000-0000-4000-8000-000000000001")
const projectB = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

afterEach(() => {
  resetComposerDrafts()
  resetAppAtomRegistryForTests()
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

  it("keeps session images isolated by Thread and drops them from persist", () => {
    const imageA = draftImage("a")
    const imageB = draftImage("b")
    writeComposerDraft(projectA, threadA, "caption A")
    writeComposerDraftImages(projectA, threadA, [imageA])
    writeComposerDraftImages(projectA, threadB, [imageB])

    expect(readComposerDraftImages(projectA, threadA)).toEqual([imageA])
    expect(readComposerDraftImages(projectA, threadB)).toEqual([imageB])
    expect(readComposerDraftImages(projectA, undefined)).toEqual([])

    writeComposerDraft(projectA, threadA, "")
    expect(readComposerDraft(projectA, threadA)).toBe("")
    expect(readComposerDraftImages(projectA, threadA)).toEqual([imageA])

    const session = new Map([
      [composerDraftStoreKey(projectA, threadA), { text: "caption A", images: [imageA] }],
    ])
    expect(storedTextsFromSessionDrafts(session)).toEqual(
      new Map([[composerDraftStoreKey(projectA, threadA), "caption A"]]),
    )
    expect(sessionDraftsFromStoredTexts(storedTextsFromSessionDrafts(session))).toEqual(
      new Map([[composerDraftStoreKey(projectA, threadA), { text: "caption A", images: [] }]]),
    )
  })

  it("replaces text and images in a single draft write", () => {
    writeComposerDraft(projectA, threadA, "old")
    writeComposerDraftImages(projectA, threadA, [draftImage("old")])
    const image = draftImage("next")
    replaceComposerDraft({
      projectId: projectA,
      threadId: threadA,
      text: "restored",
      images: [image],
    })

    expect(readComposerDraft(projectA, threadA)).toBe("restored")
    expect(readComposerDraftImages(projectA, threadA)).toEqual([image])
  })

  it("removes a draft image from the current session store", () => {
    const imageA = draftImage("a")
    const imageB = draftImage("b")
    writeComposerDraft(projectA, threadA, "keep")
    writeComposerDraftImages(projectA, threadA, [imageA, imageB])

    removeComposerDraftImage({ projectId: projectA, threadId: threadA, localId: imageA.localId })
    removeComposerDraftImage({ projectId: projectA, threadId: threadA, localId: imageA.localId })
    expect(readComposerDraft(projectA, threadA)).toBe("keep")
    expect(readComposerDraftImages(projectA, threadA)).toEqual([imageB])

    removeComposerDraftImage({ projectId: projectA, threadId: threadA, localId: imageB.localId })
    expect(readComposerDraftImages(projectA, threadA)).toEqual([])
  })

  it("promotes leftover new-Thread images onto the created Thread", () => {
    const image = draftImage("new")
    writeComposerDraftImages(projectA, undefined, [image])
    promoteComposerDraft(projectA, threadA)

    expect(readComposerDraftImages(projectA, undefined)).toEqual([])
    expect(readComposerDraftImages(projectA, threadA)).toEqual([image])
  })

  it("does not overwrite existing Thread images on promote", () => {
    const leftover = draftImage("leftover")
    const existing = draftImage("existing")
    writeComposerDraftImages(projectA, undefined, [leftover])
    writeComposerDraftImages(projectA, threadA, [existing])
    promoteComposerDraft(projectA, threadA)

    expect(readComposerDraftImages(projectA, undefined)).toEqual([leftover])
    expect(readComposerDraftImages(projectA, threadA)).toEqual([existing])
  })
})

const draftImage = (localId: string): ComposerImage => ({
  localId,
  previewUrl: `blob:${localId}`,
  upload: {
    type: "image",
    name: `${localId}.png`,
    mimeType: "image/png",
    sizeBytes: 4,
    dataUrl: "data:image/png;base64,AAAA",
  },
})
