import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useRef } from "react"

import { BoardPage } from "@/pages/BoardPage"
import { parseBoardSearch, type BoardSearch } from "@/lib/board-model"

export const Route = createFileRoute("/projects/$projectId/board")({
  validateSearch: parseBoardSearch,
  component: BoardRoute,
})

function BoardRoute() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const openedFromBoard = useRef(false)

  const updateSearch = (patch: Partial<BoardSearch>, replace = true) => {
    void navigate({
      replace,
      search: (current) => ({ ...current, ...patch }),
    })
  }

  const openTicket = (ticketId: string) => {
    openedFromBoard.current = true
    void navigate({
      search: (current) => ({ ...current, ticket: ticketId }),
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
      search: (current) => ({ ...current, ticket: undefined }),
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
