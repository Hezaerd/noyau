import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import {
  NEW_THREAD_PALETTE_THREAD_ID,
  paletteNewThreadDraftItem,
  paletteThreadItems,
} from "../src/lib/app-palette"
import { emptyComposerDraft } from "../src/lib/composer-drafts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

describe("paletteThreadItems", () => {
  it("omits an empty /thread/new draft and prepends a typed one", () => {
    const persisted = [
      {
        id: threadId,
        title: "Inbox thread",
        projectId,
        status: "active",
      },
    ]

    expect(paletteThreadItems(persisted, projectId, emptyComposerDraft)).toEqual([
      {
        id: `thread.open.${threadId}`,
        threadId,
        label: "Inbox thread",
        searchValue: "Inbox thread",
      },
    ])
    expect(
      paletteThreadItems(persisted, projectId, { text: "Fix the sidebar draft", images: [] }),
    ).toEqual([
      {
        id: `thread.open.new.${projectId}`,
        threadId: NEW_THREAD_PALETTE_THREAD_ID,
        label: "Fix the sidebar draft",
        searchValue: "Fix the sidebar draft draft new thread",
      },
      {
        id: `thread.open.${threadId}`,
        threadId,
        label: "Inbox thread",
        searchValue: "Inbox thread",
      },
    ])
  })
})

describe("paletteNewThreadDraftItem", () => {
  it("is absent without a Project or composer content", () => {
    expect(
      paletteNewThreadDraftItem(undefined, { text: "Fix the sidebar draft", images: [] }),
    ).toBeUndefined()
    expect(paletteNewThreadDraftItem(projectId, emptyComposerDraft)).toBeUndefined()
  })
})
