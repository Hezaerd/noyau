// @vitest-environment happy-dom

import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { useComposerDraft } from "../src/hooks/use-composer-draft"
import { resetComposerDrafts } from "../src/lib/composer-drafts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

interface HookProps {
  readonly threadId: ThreadId | undefined
}

afterEach(() => {
  cleanup()
  resetComposerDrafts()
})

describe("useComposerDraft", () => {
  it("survives remount and isolates keys when the Thread changes", () => {
    const first = renderHook<ReturnType<typeof useComposerDraft>, HookProps>(
      ({ threadId }) => useComposerDraft(projectId, threadId),
      { initialProps: { threadId: threadA } },
    )

    act(() => {
      first.result.current.setText("draft A")
    })
    expect(first.result.current.text).toBe("draft A")
    first.unmount()

    const second = renderHook<ReturnType<typeof useComposerDraft>, HookProps>(
      ({ threadId }) => useComposerDraft(projectId, threadId),
      { initialProps: { threadId: threadA } },
    )
    expect(second.result.current.text).toBe("draft A")

    second.rerender({ threadId: threadB })
    expect(second.result.current.text).toBe("")
    act(() => {
      second.result.current.setText("draft B")
    })
    expect(second.result.current.text).toBe("draft B")

    second.rerender({ threadId: threadA })
    expect(second.result.current.text).toBe("draft A")

    second.rerender({ threadId: undefined })
    expect(second.result.current.text).toBe("")
    act(() => {
      second.result.current.setText("new thread")
    })
    second.rerender({ threadId: threadA })
    expect(second.result.current.text).toBe("draft A")
    second.rerender({ threadId: undefined })
    expect(second.result.current.text).toBe("new thread")
  })
})
