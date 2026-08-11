import { createRootRoute } from "@tanstack/react-router"

import { NotFound, RootLayout } from "../components/RootLayout"

export const Route = createRootRoute({ component: RootLayout, notFoundComponent: NotFound })
