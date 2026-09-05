import { describe, expect, it } from "vitest"

import type { ExecutableBoardAction } from "../src/lib/board-actions"
import { groupBoardActions } from "../src/lib/board-actions"

const ticketAction = (
  id: string,
  groupId: string,
  target: ExecutableBoardAction["target"],
  surfaces: ReadonlyArray<ExecutableBoardAction["surfaces"][number]> = ["context-menu"],
  options: { readonly disabled?: boolean; readonly groupLabel?: string } = {},
): ExecutableBoardAction => {
  const action = {
    id,
    label: id,
    searchValue: id,
    groupId,
    groupLabel: options.groupLabel ?? groupId,
    surfaces,
    target,
    appearance: { kind: "rename" as const },
    execute: () => undefined,
  }
  return options.disabled === undefined ? action : { ...action, disabled: options.disabled }
}

const actions: ReadonlyArray<ExecutableBoardAction> = [
  ticketAction("ticket-open", "tickets", { kind: "ticket", id: "ticket-1" }),
  ticketAction("ticket-rename", "tickets", { kind: "ticket", id: "ticket-1" }),
  ticketAction("column-rename", "columns", { kind: "column", id: "column-1" }),
  ticketAction("palette-action", "actions", undefined, ["palette"]),
]

const semanticActions: ReadonlyArray<ExecutableBoardAction> = [
  ticketAction("board-action", "board", { kind: "board" }),
  ticketAction("ticket-same-id", "ticket", { kind: "ticket", id: "same-id" }, [
    "context-menu",
    "context-menu",
  ]),
  ticketAction("column-same-id", "column", { kind: "column", id: "same-id" }),
  ticketAction("first-action", "first", { kind: "ticket", id: "interleaved" }, ["context-menu"], {
    groupLabel: "First initial",
  }),
  ticketAction("second-action", "second", { kind: "ticket", id: "interleaved" }),
  ticketAction(
    "first-action-latest",
    "first",
    { kind: "ticket", id: "interleaved" },
    ["context-menu"],
    { disabled: true, groupLabel: "First latest" },
  ),
]

describe("groupBoardActions", () => {
  it("preserves target grouping and ignores targets for palette actions", () => {
    expect(
      groupBoardActions(actions, "context-menu", { kind: "ticket", id: "ticket-1" }).map(
        (group) => ({ id: group.id, actions: group.actions.map((action) => action.id) }),
      ),
    ).toEqual([{ id: "tickets", actions: ["ticket-open", "ticket-rename"] }])
    expect(groupBoardActions(actions, "context-menu", { kind: "ticket", id: "ticket-2" })).toEqual(
      [],
    )
    expect(groupBoardActions(actions, "context-menu")).toEqual([])
    expect(groupBoardActions(actions, "palette", { kind: "ticket", id: "ticket-1" })).toEqual([
      {
        id: "actions",
        label: "actions",
        actions: [actions[3]],
      },
    ])
  })

  it("preserves target kinds, group order, labels, duplicate surfaces, and disabled actions", () => {
    expect(groupBoardActions(semanticActions, "context-menu", { kind: "board" })).toEqual([
      {
        id: "board",
        label: "board",
        actions: [semanticActions[0]],
      },
    ])
    expect(
      groupBoardActions(semanticActions, "context-menu", { kind: "ticket", id: "same-id" }),
    ).toEqual([
      {
        id: "ticket",
        label: "ticket",
        actions: [semanticActions[1]],
      },
    ])
    expect(
      groupBoardActions(semanticActions, "context-menu", { kind: "column", id: "same-id" }),
    ).toEqual([
      {
        id: "column",
        label: "column",
        actions: [semanticActions[2]],
      },
    ])
    expect(
      groupBoardActions(semanticActions, "context-menu", {
        kind: "ticket",
        id: "interleaved",
      }),
    ).toEqual([
      {
        id: "first",
        label: "First latest",
        actions: [semanticActions[3], semanticActions[5]],
      },
      {
        id: "second",
        label: "second",
        actions: [semanticActions[4]],
      },
    ])
    expect(semanticActions[5]).toMatchObject({ disabled: true })
  })

  it("reindexes a new action-list identity and retains action references", () => {
    const originalAction = ticketAction("original", "tickets", {
      kind: "ticket",
      id: "ticket-1",
    })
    const originalActions = [originalAction]
    const originalGroup = groupBoardActions(originalActions, "context-menu", {
      kind: "ticket",
      id: "ticket-1",
    })
    const replacementAction = { ...originalAction, execute: () => undefined }
    const replacementGroup = groupBoardActions([replacementAction], "context-menu", {
      kind: "ticket",
      id: "ticket-1",
    })

    expect(originalGroup[0]?.actions[0]).toBe(originalAction)
    expect(replacementGroup[0]?.actions[0]).toBe(replacementAction)
    expect(replacementGroup[0]?.actions[0]?.execute).not.toBe(originalAction.execute)
  })

  it("indexes an action array once across repeated target lookups", () => {
    let fullScans = 0
    const observed = [...actions]
    Object.defineProperty(observed, Symbol.iterator, {
      value: function* () {
        fullScans += 1
        yield* actions
      },
    })

    groupBoardActions(observed, "context-menu", { kind: "ticket", id: "ticket-1" })
    groupBoardActions(observed, "context-menu", { kind: "column", id: "column-1" })
    groupBoardActions(observed, "palette")

    expect(fullScans).toBe(1)
  })
})
