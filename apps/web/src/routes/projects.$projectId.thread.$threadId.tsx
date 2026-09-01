import { createFileRoute } from "@tanstack/react-router"

import { parseThreadRouteSearch } from "@/lib/composer-drafts"
import { ThreadRoutePage } from "@/pages/ThreadRoutePage"

export const Route = createFileRoute("/projects/$projectId/thread/$threadId")({
  validateSearch: parseThreadRouteSearch,
  component: ThreadRoutePage,
})
