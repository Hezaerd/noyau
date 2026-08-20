import { createFileRoute } from "@tanstack/react-router"

import { ThreadRoutePage } from "@/pages/ThreadRoutePage"

export const Route = createFileRoute("/projects/$projectId/thread/$threadId")({
  component: ThreadRoutePage,
})
