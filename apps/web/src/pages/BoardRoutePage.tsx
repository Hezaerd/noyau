import { useNavigate, useParams, useRouter, useSearch } from "@tanstack/react-router"
import { useRef } from "react"

import { type BoardSearch, type BoardSearchPatch } from "@/lib/board-model"
import { BoardPage } from "@/pages/BoardPage"

const routeId = "/projects/$projectId/board" as const

const applySearchPatch = (current: BoardSearch, patch: BoardSearchPatch): BoardSearch => {
  const next = Object.assign({}, current)
  for (const key of ["ticket", "q", "assignee", "priority"] as const) {
    if (!(key in patch)) {
      continue
    }
    const value = patch[key]
    if (value === undefined) {
      Reflect.deleteProperty(next, key)
    } else {
      Object.assign(next, { [key]: value })
    }
  }
  return next
}

export function BoardRoutePage() {
  const { projectId } = useParams({ from: routeId })
  const search = useSearch({ from: routeId })
  const navigate = useNavigate({ from: routeId })
  const router = useRouter()
  const openedFromBoard = useRef(false)

  const updateSearch = (patch: BoardSearchPatch, replace = true) => {
    void navigate({
      replace,
      search: (current) => applySearchPatch(current, patch),
    })
  }

  const openTicket = (ticketId: string) => {
    openedFromBoard.current = true
    void navigate({
      search: (current) => applySearchPatch(current, { ticket: ticketId }),
    })
  }

  const closeTicket = () => {
    if (openedFromBoard.current) {
      openedFromBoard.current = false
      router.history.back()
      return
    }
    void navigate({
      replace: true,
      search: (current) => applySearchPatch(current, { ticket: undefined }),
    })
  }

  return (
    <BoardPage
      projectId={projectId}
      search={search}
      onSearchChange={updateSearch}
      onOpenTicket={openTicket}
      onCloseTicket={closeTicket}
    />
  )
}
