import { KanbanRank } from "@noyau/contracts/entities/kanban-column"
import { KanbanColumnId, TicketId } from "@noyau/contracts/ids"
import type { TicketEvent } from "@noyau/contracts/ticket/events"
import {
  emptyBoardState,
  evolve,
  type BoardState,
  type TicketState,
} from "@noyau/server/orchestration/board/projector"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

const columnId = Schema.decodeSync(KanbanColumnId)("60000000-0000-4000-8000-000000000001")
const rank = Schema.decodeSync(KanbanRank)("a0")

const makeTicketId = (value: string): TicketId =>
  Schema.decodeSync(TicketId)(`70000000-0000-4000-8000-${value.padStart(12, "0")}`)

const makeTicket = (
  id: TicketId,
  options: { readonly done?: boolean; readonly archived?: boolean } = {},
): TicketState => ({
  ticketId: id,
  columnId,
  rank,
  title: id,
  priority: "none",
  done: options.done ?? false,
  archived: options.archived ?? false,
  openDependencyIds: [],
})

const boardWith = (
  tickets: ReadonlyArray<TicketState>,
  dependencies: BoardState["dependencies"],
): BoardState => ({
  ...emptyBoardState,
  tickets,
  dependencies,
})

const dependencyAdded = (sourceId: TicketId, targetId: TicketId): TicketEvent => ({
  _tag: "ticket.dependency.added",
  ticketId: sourceId,
  dependsOnTicketId: targetId,
})

const dependencyRemoved = (sourceId: TicketId, targetId: TicketId): TicketEvent => ({
  _tag: "ticket.dependency.removed",
  ticketId: sourceId,
  dependsOnTicketId: targetId,
})

describe("board projector open dependencies", () => {
  it("preserves dependency order, duplicates, missing targets, and archived target semantics", () => {
    const source = makeTicketId("1")
    const openTarget = makeTicketId("2")
    const archivedTarget = makeTicketId("3")
    const doneTarget = makeTicketId("4")
    const missingTarget = makeTicketId("5")
    const state = boardWith(
      [
        makeTicket(source),
        makeTicket(openTarget),
        makeTicket(archivedTarget, { archived: true }),
        makeTicket(doneTarget, { done: true }),
        // The first matching ticket controls the historical find() semantics.
        makeTicket(openTarget, { done: true }),
      ],
      [
        { ticketId: source, dependsOnTicketId: archivedTarget },
        { ticketId: source, dependsOnTicketId: doneTarget },
        { ticketId: source, dependsOnTicketId: missingTarget },
        { ticketId: source, dependsOnTicketId: openTarget },
        { ticketId: source, dependsOnTicketId: openTarget },
      ],
    )

    const projected = evolve(state, dependencyAdded(source, openTarget))

    expect(projected.tickets[0]?.openDependencyIds).toEqual([
      archivedTarget,
      openTarget,
      openTarget,
      openTarget,
    ])
  })

  it("updates every dependent ticket when dependency events add and remove duplicate edges", () => {
    const source = makeTicketId("10")
    const secondSource = makeTicketId("11")
    const target = makeTicketId("12")
    const state = boardWith(
      [makeTicket(source), makeTicket(secondSource), makeTicket(target)],
      [{ ticketId: source, dependsOnTicketId: target }],
    )

    const added = evolve(state, dependencyAdded(secondSource, target))
    expect(added.tickets.map((ticket) => ticket.openDependencyIds)).toEqual([
      [target],
      [target],
      [],
    ])

    const removed = evolve(added, dependencyRemoved(source, target))
    expect(removed.tickets.map((ticket) => ticket.openDependencyIds)).toEqual([[], [target], []])
    expect(removed.dependencies).toEqual([{ ticketId: secondSource, dependsOnTicketId: target }])
  })

  it("recomputes dependent tickets when a prerequisite is completed and reopened", () => {
    const source = makeTicketId("20")
    const target = makeTicketId("21")
    const state = boardWith(
      [makeTicket(source), makeTicket(target)],
      [{ ticketId: source, dependsOnTicketId: target }],
    )
    const completed = evolve(state, {
      _tag: "ticket.completed",
      ticketId: target,
      previousColumnId: columnId,
      doneColumnId: columnId,
      rank,
    })
    expect(completed.tickets[0]?.openDependencyIds).toEqual([])

    const reopened = evolve(completed, {
      _tag: "ticket.reopened",
      ticketId: target,
      columnId,
      rank,
    })
    expect(reopened.tickets[0]?.openDependencyIds).toEqual([target])
  })
})
