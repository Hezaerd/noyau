import { createFileRoute } from "@tanstack/react-router"

import { parseBoardSearch } from "@/lib/board-model"
import { BoardRoutePage } from "@/pages/BoardRoutePage"

export const Route = createFileRoute("/projects/$projectId/board")({
  validateSearch: parseBoardSearch,
  component: BoardRoutePage,
})
