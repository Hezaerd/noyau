import { describe, expect, it } from "@effect/vitest"
import { decide } from "@noyau/server/orchestration/board/decider"
import {
  emptyBoardState,
  evolve,
  withProjectThreads,
  type BoardState,
} from "@noyau/server/orchestration/board/projector"
import { KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { ThreadId, TicketId } from "@noyau/protocol/ids"
import { TicketCommand, TicketDependencyAdd } from "@noyau/protocol/ticket/commands"
import type { TicketEvent } from "@noyau/protocol/ticket/events"
import { DateTime, Result, Schema } from "effect"

const ids = {
  project: "3f8f0d70-1111-4000-8000-000000000001",
  backlog: "3f8f0d70-1111-4000-8000-000000000002",
  active: "3f8f0d70-1111-4000-8000-000000000003",
  done: "3f8f0d70-1111-4000-8000-000000000004",
  ticket: "3f8f0d70-1111-4000-8000-000000000005",
  ticket2: "3f8f0d70-1111-4000-8000-000000000006",
  command: "3f8f0d70-1111-4000-8000-000000000010",
  correlation: "3f8f0d70-1111-4000-8000-000000000011",
  missing: "3f8f0d70-1111-4000-8000-000000000012",
  ticket3: "3f8f0d70-1111-4000-8000-000000000013",
  ticket4: "3f8f0d70-1111-4000-8000-000000000014",
  column: "3f8f0d70-1111-4000-8000-000000000016",
  thread: "3f8f0d70-1111-4000-8000-000000000017",
  foreignThread: "3f8f0d70-1111-4000-8000-000000000018",
} as const

const meta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt: "2026-08-13T12:00:00.000Z",
  schemaVersion: 1,
} as const

const command = Schema.decodeUnknownSync(TicketCommand)
const dependencyCommand = Schema.decodeUnknownSync(TicketDependencyAdd)
const ticketId = Schema.decodeSync(TicketId)(ids.ticket)
const ticket2Id = Schema.decodeSync(TicketId)(ids.ticket2)
const ticket3Id = Schema.decodeSync(TicketId)(ids.ticket3)
const threadId = Schema.decodeSync(ThreadId)(ids.thread)
const foreignThreadId = Schema.decodeSync(ThreadId)(ids.foreignThread)

const success = <A, E>(result: Result.Result<A, E>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  if (!Result.isSuccess(result)) {
    throw new Error(`Expected success, received ${String(result.failure)}`)
  }
  return result.success
}

const failure = <A, E>(result: Result.Result<A, E>): E => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) {
    throw new Error("Expected failure")
  }
  return result.failure
}

const apply = (state: BoardState, events: ReadonlyArray<TicketEvent>) =>
  events.reduce(evolve, state)

const initialized = () =>
  apply(
    emptyBoardState,
    success(
      decide(
        emptyBoardState,
        command({
          _tag: "board.initialize",
          ...meta,
          payload: {
            backlogColumnId: ids.backlog,
            activeColumnId: ids.active,
            doneColumnId: ids.done,
          },
        }),
      ),
    ),
  )

const createTicket = (
  state: BoardState,
  id: string = ids.ticket,
  placement: {
    readonly columnId: string
    readonly beforeTicketId?: string
    readonly afterTicketId?: string
  } = { columnId: ids.backlog },
) =>
  success(
    decide(
      state,
      command({
        _tag: "ticket.create",
        ...meta,
        payload: {
          projectId: ids.project,
          ticketId: id,
          title: `Ticket ${id}`,
          placement,
        },
      }),
    ),
  )

const addDependency = (
  state: BoardState,
  id: string,
  dependsOnId: string,
): ReadonlyArray<TicketEvent> =>
  success(
    decide(
      state,
      command({
        _tag: "ticket.dependency.add",
        ...meta,
        payload: { ticketId: id, dependsOnTicketId: dependsOnId },
      }),
    ),
  )

const stateWithTicket = () => {
  const board = initialized()
  return apply(board, createTicket(board))
}

describe("board.initialize", () => {
  it("crée exactement les trois colonnes par défaut et protège Done par son identité", () => {
    const board = initialized()

    expect(board.columns).toHaveLength(3)
    expect(board.columns.map((column) => column.rank)).toEqual(["a0", "a1", "a2"])
    expect(board.columns.filter((column) => column.done).map((column) => column.columnId)).toEqual([
      ids.done,
    ])
  })

  it("émet board.initialized puis les trois colonnes système", () => {
    const events = success(
      decide(
        emptyBoardState,
        command({
          _tag: "board.initialize",
          ...meta,
          payload: {
            backlogColumnId: ids.backlog,
            activeColumnId: ids.active,
            doneColumnId: ids.done,
          },
        }),
      ),
    )

    expect(events.map((event) => event._tag)).toEqual([
      "board.initialized",
      "kanbanColumn.created",
      "kanbanColumn.created",
      "kanbanColumn.created",
    ])
  })

  it("refuse de réinitialiser un Tableau existant", () => {
    const board = initialized()
    const error = failure(
      decide(
        board,
        command({
          _tag: "board.initialize",
          ...meta,
          payload: {
            backlogColumnId: ids.backlog,
            activeColumnId: ids.active,
            doneColumnId: ids.done,
          },
        }),
      ),
    )

    expect(error._tag).toBe("KanbanColumnAlreadyExists")
  })
})

describe("ticket placement", () => {
  it("calcule les ranks côté domaine et conserve leur ordre", () => {
    const board = initialized()
    const first = apply(board, createTicket(board))
    const second = apply(first, createTicket(first, ids.ticket2))

    expect(second.tickets.map((ticket) => ticket.rank)).toEqual(["a0", "a1"])
  })

  it("rejette des ancres devenues incohérentes", () => {
    const state = stateWithTicket()
    const error = failure(
      decide(
        state,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: {
              columnId: ids.active,
              beforeTicketId: ids.missing,
            },
          },
        }),
      ),
    )

    expect(error._tag).toBe("InvalidTicketPlacement")
  })

  it("déduit le voisin inférieur d'une ancre before unilatérale", () => {
    const board = initialized()
    const withFirst = apply(board, createTicket(board))
    const withSecond = apply(withFirst, createTicket(withFirst, ids.ticket2))
    const state = apply(withSecond, createTicket(withSecond, ids.ticket3))
    const [event] = success(
      decide(
        state,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: { columnId: ids.backlog, beforeTicketId: ids.ticket3 },
          },
        }),
      ),
    )

    expect(event?._tag).toBe("ticket.moved")
    if (event?._tag !== "ticket.moved") {
      throw new Error("Expected ticket.moved")
    }
    expect(event.rank > "a1" && event.rank < "a2").toBe(true)
    expect(event.previousColumnId).toBe(ids.backlog)
  })

  it("déduit le voisin inférieur d'une ancre de colonne unilatérale", () => {
    const [event] = success(
      decide(
        initialized(),
        command({
          _tag: "kanbanColumn.move",
          ...meta,
          payload: { columnId: ids.backlog, beforeColumnId: ids.done },
        }),
      ),
    )

    expect(event?._tag).toBe("kanbanColumn.moved")
    if (event?._tag !== "kanbanColumn.moved") {
      throw new Error("Expected kanbanColumn.moved")
    }
    expect(event.rank > "a1" && event.rank < "a2").toBe(true)
  })

  it("trie ordinalement les rangs base62 avant une insertion", () => {
    const board = initialized()
    const withFirst = apply(board, createTicket(board))
    const withSecond = apply(withFirst, createTicket(withFirst, ids.ticket2))
    const [firstTicket, secondTicket] = withSecond.tickets
    if (firstTicket === undefined || secondTicket === undefined) {
      throw new Error("Missing rank fixtures")
    }
    const state: BoardState = {
      ...withSecond,
      tickets: [
        { ...firstTicket, rank: "aA" },
        { ...secondTicket, rank: "aa" },
      ],
    }
    const [event] = createTicket(state, ids.ticket3, {
      columnId: ids.backlog,
      beforeTicketId: ids.ticket2,
    })

    expect(event?._tag).toBe("ticket.created")
    if (event?._tag !== "ticket.created") {
      throw new Error("Expected ticket.created")
    }
    expect(Schema.is(KanbanRank)(event.rank)).toBe(true)
    expect(event.rank > "aA" && event.rank < "aa").toBe(true)
  })

  it("laisse déplacer un Ticket bloqué entre colonnes ordinaires", () => {
    const withFirst = stateWithTicket()
    const withSecond = apply(withFirst, createTicket(withFirst, ids.ticket2))
    const blocked = apply(withSecond, addDependency(withSecond, ids.ticket, ids.ticket2))
    const moved = success(
      decide(
        blocked,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: { columnId: ids.active },
          },
        }),
      ),
    )

    expect(moved[0]?._tag).toBe("ticket.moved")
  })
})

describe("Done coherence", () => {
  it("refuse de créer directement un Ticket dans Done", () => {
    const error = failure(
      decide(
        initialized(),
        command({
          _tag: "ticket.create",
          ...meta,
          payload: {
            projectId: ids.project,
            ticketId: ids.ticket,
            title: "Already done",
            placement: { columnId: ids.done },
          },
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "DoneColumnCreationForbidden", columnId: ids.done })
  })

  it("transforme un déplacement vers Done en clôture et mémorise la colonne active", () => {
    const state = stateWithTicket()
    const completed = success(
      decide(
        state,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: { columnId: ids.done },
          },
        }),
      ),
    )
    const next = apply(state, completed)

    expect(completed[0]?._tag).toBe("ticket.completed")
    expect(next.tickets[0]).toMatchObject({
      done: true,
      columnId: ids.done,
      lastActiveColumnId: ids.backlog,
    })
  })

  it("restaure la dernière colonne non terminale à la réouverture", () => {
    const state = stateWithTicket()
    const completed = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const reopened = apply(
      completed,
      success(
        decide(
          completed,
          command({
            _tag: "ticket.reopen",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )

    expect(reopened.tickets[0]).toMatchObject({
      done: false,
      columnId: ids.backlog,
    })
  })

  it("restaure un Ticket terminé archivé dans la colonne Done actuelle", () => {
    const state = stateWithTicket()
    const completed = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const archived = apply(
      completed,
      success(
        decide(
          completed,
          command({
            _tag: "ticket.archive",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const restored = apply(
      archived,
      success(
        decide(
          archived,
          command({
            _tag: "ticket.restore",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )

    expect(restored.tickets[0]).toMatchObject({
      archived: false,
      done: true,
      columnId: ids.done,
      lastActiveColumnId: ids.backlog,
    })
  })

  it("exige la restauration avant de réouvrir un Ticket archivé", () => {
    const state = stateWithTicket()
    const completed = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const archived = apply(
      completed,
      success(
        decide(
          completed,
          command({
            _tag: "ticket.archive",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const error = failure(
      decide(
        archived,
        command({
          _tag: "ticket.reopen",
          ...meta,
          payload: { ticketId: ids.ticket },
        }),
      ),
    )

    expect(error._tag).toBe("TicketAlreadyArchived")
  })
})

describe("destructive guards", () => {
  it("exige puis accepte l'ack des dépendances ouvertes pour complete, move vers Done et archive", () => {
    const withFirst = stateWithTicket()
    const withSecond = apply(withFirst, createTicket(withFirst, ids.ticket2))
    const blocked = apply(withSecond, addDependency(withSecond, ids.ticket, ids.ticket2))
    const unacknowledged = [
      command({
        _tag: "ticket.complete",
        ...meta,
        payload: { ticketId: ids.ticket },
      }),
      command({
        _tag: "ticket.move",
        ...meta,
        payload: { ticketId: ids.ticket, placement: { columnId: ids.done } },
      }),
      command({
        _tag: "ticket.archive",
        ...meta,
        payload: { ticketId: ids.ticket },
      }),
    ]
    const acknowledged = [
      command({
        _tag: "ticket.complete",
        ...meta,
        payload: { ticketId: ids.ticket, acknowledgeOpenDependencies: true },
      }),
      command({
        _tag: "ticket.move",
        ...meta,
        payload: {
          ticketId: ids.ticket,
          placement: { columnId: ids.done },
          acknowledgeOpenDependencies: true,
        },
      }),
      command({
        _tag: "ticket.archive",
        ...meta,
        payload: { ticketId: ids.ticket, acknowledgeOpenDependencies: true },
      }),
    ]

    for (const candidate of unacknowledged) {
      expect(failure(decide(blocked, candidate))._tag).toBe("OpenDependenciesConfirmationRequired")
    }
    for (const candidate of acknowledged) {
      expect(success(decide(blocked, candidate))).toHaveLength(1)
    }
  })

  it("refuse de supprimer Done", () => {
    const error = failure(
      decide(
        initialized(),
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: { columnId: ids.done },
        }),
      ),
    )

    expect(error._tag).toBe("ProtectedDoneColumn")
  })

  it("exige une destination pour supprimer une colonne non vide", () => {
    const error = failure(
      decide(
        stateWithTicket(),
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: { columnId: ids.backlog },
        }),
      ),
    )

    expect(error._tag).toBe("ColumnDestinationRequired")
  })

  it("re-cible les références cachées lors d'une suppression de colonne", () => {
    const state = stateWithTicket()
    const withSecond = apply(state, createTicket(state, ids.ticket2))
    const archived = apply(
      withSecond,
      success(
        decide(
          withSecond,
          command({
            _tag: "ticket.archive",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const completed = apply(
      archived,
      success(
        decide(
          archived,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket2 },
          }),
        ),
      ),
    )
    const missingDestination = failure(
      decide(
        completed,
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: { columnId: ids.backlog },
        }),
      ),
    )

    expect(missingDestination._tag).toBe("ColumnDestinationRequired")

    const events = success(
      decide(
        completed,
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: {
            columnId: ids.backlog,
            destinationColumnId: ids.active,
          },
        }),
      ),
    )
    const next = apply(completed, events)

    expect(events.map((event) => event._tag)).toEqual(["kanbanColumn.deleted"])
    expect(next.tickets.find((ticket) => ticket.ticketId === ticketId)).toMatchObject({
      archived: true,
      columnId: ids.active,
    })
    expect(next.tickets.find((ticket) => ticket.ticketId === ticket2Id)).toMatchObject({
      done: true,
      columnId: ids.done,
      lastActiveColumnId: ids.active,
    })
  })

  it("refuse Done comme destination même pour une colonne vide", () => {
    const error = failure(
      decide(
        initialized(),
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: {
            columnId: ids.backlog,
            destinationColumnId: ids.done,
          },
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "DoneColumnDestinationForbidden",
      destinationColumnId: ids.done,
    })
  })
})

describe("ticket dependencies", () => {
  const stateWithThreeTickets = () => {
    const withFirst = stateWithTicket()
    const withSecond = apply(withFirst, createTicket(withFirst, ids.ticket2))
    return apply(withSecond, createTicket(withSecond, ids.ticket3))
  }

  it("ajoute et retire une arête, et refuse les doublons", () => {
    const state = stateWithThreeTickets()
    const added = addDependency(state, ids.ticket, ids.ticket2)
    const withDependency = apply(state, added)

    expect(added.map((event) => event._tag)).toEqual(["ticket.dependency.added"])
    expect(withDependency.dependencies).toEqual([{ ticketId, dependsOnTicketId: ticket2Id }])
    expect(
      failure(
        decide(
          withDependency,
          command({
            _tag: "ticket.dependency.add",
            ...meta,
            payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket2 },
          }),
        ),
      )._tag,
    ).toBe("TicketDependencyAlreadyExists")

    const removed = success(
      decide(
        withDependency,
        command({
          _tag: "ticket.dependency.remove",
          ...meta,
          payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket2 },
        }),
      ),
    )
    const withoutDependency = apply(withDependency, removed)

    expect(removed.map((event) => event._tag)).toEqual(["ticket.dependency.removed"])
    expect(withoutDependency.dependencies).toEqual([])
    expect(
      failure(
        decide(
          withoutDependency,
          command({
            _tag: "ticket.dependency.remove",
            ...meta,
            payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket2 },
          }),
        ),
      )._tag,
    ).toBe("TicketDependencyNotFound")
  })

  it("refuse les auto-dépendances même sans le refinement protocolaire", () => {
    const valid = dependencyCommand({
      _tag: "ticket.dependency.add",
      ...meta,
      payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket2 },
    })
    const error = failure(
      decide(stateWithThreeTickets(), {
        ...valid,
        payload: { ...valid.payload, dependsOnTicketId: valid.payload.ticketId },
      }),
    )

    expect(error._tag).toBe("TicketSelfDependency")
  })

  it("refuse une arête qui fermerait un cycle transitif", () => {
    const state = stateWithThreeTickets()
    const withAB = apply(state, addDependency(state, ids.ticket, ids.ticket2))
    const withBC = apply(withAB, addDependency(withAB, ids.ticket2, ids.ticket3))
    const error = failure(
      decide(
        withBC,
        command({
          _tag: "ticket.dependency.add",
          ...meta,
          payload: { ticketId: ids.ticket3, dependsOnTicketId: ids.ticket },
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "TicketDependencyCycle",
      ticketId: ticket3Id,
      dependsOnTicketId: ticketId,
    })
  })

  it("exige que les deux extrémités d'une nouvelle arête existent", () => {
    const error = failure(
      decide(
        stateWithThreeTickets(),
        command({
          _tag: "ticket.dependency.add",
          ...meta,
          payload: { ticketId: ids.ticket, dependsOnTicketId: ids.missing },
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "TicketNotFound", ticketId: ids.missing })
  })

  it("dérive les prérequis ouverts après ajout, clôture, réouverture et retrait", () => {
    const state = stateWithThreeTickets()
    const blocked = apply(state, addDependency(state, ids.ticket, ids.ticket2))

    expect(
      blocked.tickets.find((ticket) => ticket.ticketId === ticketId)?.openDependencyIds,
    ).toEqual([ticket2Id])

    const completedPrerequisite = apply(
      blocked,
      success(
        decide(
          blocked,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket2 },
          }),
        ),
      ),
    )
    expect(
      completedPrerequisite.tickets.find((ticket) => ticket.ticketId === ticketId)
        ?.openDependencyIds,
    ).toEqual([])

    const reopenedPrerequisite = apply(
      completedPrerequisite,
      success(
        decide(
          completedPrerequisite,
          command({
            _tag: "ticket.reopen",
            ...meta,
            payload: { ticketId: ids.ticket2 },
          }),
        ),
      ),
    )
    expect(
      reopenedPrerequisite.tickets.find((ticket) => ticket.ticketId === ticketId)
        ?.openDependencyIds,
    ).toEqual([ticket2Id])

    const unblocked = apply(
      reopenedPrerequisite,
      success(
        decide(
          reopenedPrerequisite,
          command({
            _tag: "ticket.dependency.remove",
            ...meta,
            payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket2 },
          }),
        ),
      ),
    )
    expect(
      unblocked.tickets.find((ticket) => ticket.ticketId === ticketId)?.openDependencyIds,
    ).toEqual([])
  })
})

describe("ticket.update projection", () => {
  it("distingue description omise, remplacée et supprimée par null", () => {
    const state = stateWithTicket()
    const described = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, description: "Context" },
          }),
        ),
      ),
    )
    const renamed = apply(
      described,
      success(
        decide(
          described,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, title: "Renamed" },
          }),
        ),
      ),
    )
    const renameEvent = success(
      decide(
        described,
        command({
          _tag: "ticket.update",
          ...meta,
          payload: { ticketId: ids.ticket, title: "Renamed" },
        }),
      ),
    )[0]
    expect(renameEvent).toMatchObject({
      _tag: "ticket.updated",
      title: "Renamed",
      previousTitle: `Ticket ${ids.ticket}`,
    })
    const omitted = renamed
    const removed = apply(
      omitted,
      success(
        decide(
          omitted,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, description: null },
          }),
        ),
      ),
    )

    expect(described.tickets[0]?.description).toBe("Context")
    expect(omitted.tickets[0]?.description).toBe("Context")
    expect(Object.hasOwn(removed.tickets[0] ?? {}, "description")).toBe(false)
  })

  it("distingue échéance omise, remplacée et supprimée par null", () => {
    const state = stateWithTicket()
    const dated = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, dueAt: "2026-08-20T09:00:00.000Z" },
          }),
        ),
      ),
    )
    const omitted = apply(
      dated,
      success(
        decide(
          dated,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, title: "Renamed" },
          }),
        ),
      ),
    )
    const removed = apply(
      omitted,
      success(
        decide(
          omitted,
          command({
            _tag: "ticket.update",
            ...meta,
            payload: { ticketId: ids.ticket, dueAt: null },
          }),
        ),
      ),
    )

    expect(
      dated.tickets[0]?.dueAt === undefined
        ? undefined
        : DateTime.formatIso(dated.tickets[0].dueAt),
    ).toBe("2026-08-20T09:00:00.000Z")
    expect(
      omitted.tickets[0]?.dueAt === undefined
        ? undefined
        : DateTime.formatIso(omitted.tickets[0].dueAt),
    ).toBe("2026-08-20T09:00:00.000Z")
    expect(Object.hasOwn(removed.tickets[0] ?? {}, "dueAt")).toBe(false)
  })
})

describe("TicketThread", () => {
  it("lie et délie un Thread du même Project, et refuse les doublons", () => {
    const state = withProjectThreads(stateWithTicket(), [threadId])
    const linked = success(
      decide(
        state,
        command({
          _tag: "ticket.thread.link",
          ...meta,
          payload: { ticketId: ids.ticket, threadId: ids.thread },
        }),
      ),
    )
    const withLink = apply(state, linked)

    expect(linked.map((event) => event._tag)).toEqual(["ticket.thread.linked"])
    expect(withLink.ticketThreads).toEqual([{ ticketId, threadId }])
    expect(
      failure(
        decide(
          withLink,
          command({
            _tag: "ticket.thread.link",
            ...meta,
            payload: { ticketId: ids.ticket, threadId: ids.thread },
          }),
        ),
      )._tag,
    ).toBe("TicketThreadAlreadyLinked")

    const unlinked = success(
      decide(
        withLink,
        command({
          _tag: "ticket.thread.unlink",
          ...meta,
          payload: { ticketId: ids.ticket, threadId: ids.thread },
        }),
      ),
    )
    const withoutLink = apply(withLink, unlinked)

    expect(unlinked.map((event) => event._tag)).toEqual(["ticket.thread.unlinked"])
    expect(withoutLink.ticketThreads).toEqual([])
    expect(
      failure(
        decide(
          withoutLink,
          command({
            _tag: "ticket.thread.unlink",
            ...meta,
            payload: { ticketId: ids.ticket, threadId: ids.thread },
          }),
        ),
      )._tag,
    ).toBe("TicketThreadNotLinked")
  })

  it("refuse un TicketThread hors du Project", () => {
    const sameProject = withProjectThreads(stateWithTicket(), [threadId])
    const foreign = failure(
      decide(
        sameProject,
        command({
          _tag: "ticket.thread.link",
          ...meta,
          payload: { ticketId: ids.ticket, threadId: ids.foreignThread },
        }),
      ),
    )
    const unknown = failure(
      decide(
        stateWithTicket(),
        command({
          _tag: "ticket.thread.link",
          ...meta,
          payload: { ticketId: ids.ticket, threadId: ids.thread },
        }),
      ),
    )

    expect(foreign).toMatchObject({
      _tag: "TicketThreadProjectMismatch",
      ticketId,
      threadId: foreignThreadId,
    })
    expect(unknown).toMatchObject({
      _tag: "TicketThreadProjectMismatch",
      ticketId,
      threadId,
    })
  })

  it("n'écrit plus sourceThreadId à la création", () => {
    const [event] = createTicket(initialized())

    expect(event?._tag).toBe("ticket.created")
    expect(event).not.toHaveProperty("sourceThreadId")
  })
})
