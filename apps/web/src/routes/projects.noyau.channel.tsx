import { createFileRoute } from "@tanstack/react-router"

import { ChannelPage } from "@/pages/ChannelPage"

export const Route = createFileRoute("/projects/noyau/channel")({
  component: ChannelPage,
})
