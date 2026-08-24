import { describe, expect, it } from "vite-plus/test"

import { filterComposerTickets } from "../src/lib/composer-tickets"

describe("filterComposerTickets", () => {
  const tickets = [
    {
      ticketId: "40818da4-a4de-46f6-a60f-1aa305093a6e",
      title: "Mentioner ticket dans transcript",
      columnName: "En cours",
      done: false,
    },
    {
      ticketId: "26bdc169-4894-41cb-9f46-3624f6810916",
      title: "Pin threads",
      columnName: "Done",
      done: true,
    },
  ]

  it("matches title without diacritics and keeps open tickets first", () => {
    expect(filterComposerTickets(tickets, "mentioner").map((ticket) => ticket.title)).toEqual([
      "Mentioner ticket dans transcript",
    ])
    expect(filterComposerTickets(tickets, "").map((ticket) => ticket.done)).toEqual([false, true])
  })
})
