// @vitest-environment happy-dom
// oxlint-disable anti-slop/no-module-mocking -- SAFETY: this focused harness counts the real collector invocation.

import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { cleanup, render } from "@testing-library/react"
import { Schema } from "effect"
import type * as ReactModule from "react"
import type { ReactNode } from "react"
import type * as StreamdownModule from "streamdown"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as ThreadMarkdownContextModule from "../src/components/thread/thread-markdown-context"
import type { ThreadMarkdownContextValue } from "../src/components/thread/thread-markdown-context"
import type * as MarkdownFileLinksModule from "../src/lib/markdown-file-links"

const collectorState = vi.hoisted(() => ({ value: 0 }))
const renderedTextState = vi.hoisted(() => {
  const values: Array<string> = []
  return { values }
})
const contextState = vi.hoisted(() => {
  const values: Array<ThreadMarkdownContextValue> = []
  return { values }
})

vi.mock("../src/lib/markdown-file-links", async () => {
  const actual = await vi.importActual<typeof MarkdownFileLinksModule>(
    "../src/lib/markdown-file-links",
  )
  return {
    ...actual,
    collectThreadMarkdownFileLinks: (text: string, workspaceRoot: string | undefined) => {
      collectorState.value += 1
      return actual.collectThreadMarkdownFileLinks(text, workspaceRoot)
    },
  }
})

vi.mock("streamdown", async () => {
  const React = await vi.importActual<typeof ReactModule>("react")
  const actual = await vi.importActual<typeof StreamdownModule>("streamdown")
  const { ThreadMarkdownContext } = await vi.importActual<typeof ThreadMarkdownContextModule>(
    "../src/components/thread/thread-markdown-context",
  )
  return {
    ...actual,
    Streamdown: ({ children }: { readonly children: ReactNode }) => {
      const value = React.useContext(ThreadMarkdownContext)
      contextState.values.push(value)
      renderedTextState.values.push(Schema.decodeUnknownSync(Schema.String)(children))
      return React.createElement("div", null, children)
    },
  }
})

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"

const firstProjectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const secondProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const firstThreadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const secondThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const firstTickets = [
  { ticketId: "first-ticket", title: "First ticket", columnName: "Todo", done: false },
]
const secondTickets = [
  { ticketId: "second-ticket", title: "Second ticket", columnName: "Done", done: true },
]
const firstOnOpenTicket = () => undefined
const secondOnOpenTicket = () => undefined

afterEach(() => {
  cleanup()
  collectorState.value = 0
  renderedTextState.values = []
  contextState.values = []
})

describe("ThreadMarkdown context memoization", () => {
  it("keeps file-link collection stable while context metadata changes", () => {
    const rendered = render(
      <ThreadMarkdown
        text="See [the file](src/example.ts)."
        workspaceRoot="/tmp/project"
        projectId={firstProjectId}
        threadId={firstThreadId}
        tickets={firstTickets}
        onOpenTicket={firstOnOpenTicket}
      />,
    )

    expect(collectorState.value).toBe(1)
    expect(contextState.values.at(-1)?.tickets).toBe(firstTickets)
    expect(contextState.values.at(-1)?.projectId).toBe(firstProjectId)
    expect(contextState.values.at(-1)?.threadId).toBe(firstThreadId)
    expect(contextState.values.at(-1)?.onOpenTicket).toBe(firstOnOpenTicket)

    rendered.rerender(
      <ThreadMarkdown
        text="See [the file](src/example.ts)."
        workspaceRoot="/tmp/project"
        projectId={secondProjectId}
        threadId={secondThreadId}
        tickets={secondTickets}
        onOpenTicket={secondOnOpenTicket}
      />,
    )

    expect(collectorState.value).toBe(1)
    expect(contextState.values.at(-1)?.tickets).toBe(secondTickets)
    expect(contextState.values.at(-1)?.projectId).toBe(secondProjectId)
    expect(contextState.values.at(-1)?.threadId).toBe(secondThreadId)
    expect(contextState.values.at(-1)?.onOpenTicket).toBe(secondOnOpenTicket)
    expect(contextState.values[0]?.tickets).toBe(firstTickets)
    expect(contextState.values[0]?.projectId).toBe(firstProjectId)
    expect(contextState.values[0]?.threadId).toBe(firstThreadId)
    expect(contextState.values[0]?.onOpenTicket).toBe(firstOnOpenTicket)
  })

  it("recollects links when source text, workspace, or expanded mentions change", () => {
    const rendered = render(
      <ThreadMarkdown text="See [the file](src/example.ts)." workspaceRoot="/tmp/project" />,
    )

    expect(collectorState.value).toBe(1)

    rendered.rerender(
      <ThreadMarkdown text="See [the other file](src/other.ts)." workspaceRoot="/tmp/project" />,
    )
    expect(collectorState.value).toBe(2)

    rendered.rerender(
      <ThreadMarkdown text="See [the other file](src/other.ts)." workspaceRoot="/tmp/other" />,
    )
    expect(collectorState.value).toBe(3)

    const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
    const mentionTicketsA = [{ ticketId, title: "Ticket A", columnName: "Todo", done: false }]
    const mentionTicketsB = [{ ticketId, title: "Ticket B", columnName: "Todo", done: false }]
    rendered.rerender(
      <ThreadMarkdown
        text={`Open @ticket:${ticketId}`}
        workspaceRoot="/tmp/other"
        streaming
        tickets={mentionTicketsA}
      />,
    )
    expect(collectorState.value).toBe(4)

    rendered.rerender(
      <ThreadMarkdown
        text={`Open @ticket:${ticketId}`}
        workspaceRoot="/tmp/other"
        tickets={mentionTicketsA}
      />,
    )
    expect(collectorState.value).toBe(5)
    expect(renderedTextState.values.at(-1)).toContain("Ticket A")

    rendered.rerender(
      <ThreadMarkdown
        text={`Open @ticket:${ticketId}`}
        workspaceRoot="/tmp/other"
        tickets={mentionTicketsB}
      />,
    )
    expect(collectorState.value).toBe(6)
    expect(renderedTextState.values.at(-1)).toContain("Ticket B")
  })

  it("removes optional context values without mutating the prior context", () => {
    const rendered = render(
      <ThreadMarkdown
        text="See [the file](src/example.ts)."
        workspaceRoot="/tmp/project"
        projectId={firstProjectId}
        threadId={firstThreadId}
        tickets={firstTickets}
        onOpenTicket={firstOnOpenTicket}
      />,
    )

    rendered.rerender(
      <ThreadMarkdown text="See [the file](src/example.ts)." workspaceRoot="/tmp/project" />,
    )

    expect(collectorState.value).toBe(1)
    expect(contextState.values.at(-1)?.projectId).toBeUndefined()
    expect(contextState.values.at(-1)?.threadId).toBeUndefined()
    expect(contextState.values.at(-1)?.tickets).toHaveLength(0)
    expect(contextState.values.at(-1)?.onOpenTicket).toBeUndefined()
    expect(contextState.values[0]?.projectId).toBe(firstProjectId)
    expect(contextState.values[0]?.threadId).toBe(firstThreadId)
    expect(contextState.values[0]?.tickets).toBe(firstTickets)
    expect(contextState.values[0]?.onOpenTicket).toBe(firstOnOpenTicket)
  })
})
