import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { initializeAppearance } from "@/lib/appearance"
import { syncDocumentDesktopChrome } from "@/lib/desktop-bridge"
import { initializeDiscordPresencePreference } from "@/lib/discord-presence-preference"
import { initializeKeybindings } from "@/lib/keybindings"
import { initializeProjectFolderStartDirectory } from "@/lib/project-folder-preference"
import { initializeThreadVisits } from "@/lib/thread-visits"
import { initializeTurnCuePreference } from "@/lib/turn-cue-preference"

import { routeTree } from "./routeTree.gen"

import "./index.css"

syncDocumentDesktopChrome()
initializeAppearance()
initializeKeybindings()
initializeProjectFolderStartDirectory()
initializeDiscordPresencePreference()
initializeTurnCuePreference()
initializeThreadVisits()

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
      <ToastProvider>
        <AnchoredToastProvider>
          <RouterProvider router={router} />
        </AnchoredToastProvider>
      </ToastProvider>
    </TooltipProvider>
  </StrictMode>,
)
