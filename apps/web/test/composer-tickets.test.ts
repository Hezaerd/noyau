import { describe, expect, it } from "vitest"

import { filterComposerSkills, filterComposerTickets } from "../src/lib/composer-tickets"

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

describe("filterComposerSkills", () => {
  const skills = [
    {
      name: "write-docs",
      displayName: "Write docs",
      description: "Update Noyau documentation",
      scope: "repo" as const,
    },
    {
      name: "imagegen",
      displayName: "Image generation",
      description: "Create raster images",
      scope: "system" as const,
    },
  ]

  it("matches names, display names, and descriptions", () => {
    expect(filterComposerSkills(skills, "write").map((skill) => skill.name)).toEqual(["write-docs"])
    expect(filterComposerSkills(skills, "raster").map((skill) => skill.name)).toEqual(["imagegen"])
  })
})
