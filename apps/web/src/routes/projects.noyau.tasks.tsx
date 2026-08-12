import { createFileRoute } from "@tanstack/react-router"

import { TasksPage } from "@/pages/TasksPage"

export const Route = createFileRoute("/projects/noyau/tasks")({
  component: TasksPage,
})
