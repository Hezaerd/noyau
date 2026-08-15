import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { initializeAppearance } from "@/lib/appearance"
import { syncDocumentDesktopChrome } from "@/lib/desktop-bridge"

import { routeTree } from "./routeTree.gen"

import "./index.css"

syncDocumentDesktopChrome()
initializeAppearance()

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Élément #root introuvable")
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
)
