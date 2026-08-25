import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { syncDocumentDesktopChrome } from "@/lib/desktop-bridge"
import { AppAtomRegistryProvider } from "@/state/atom-registry"
import { initializeKeybindings } from "@/state/keybindings"
import { initializeNowMinuteClock } from "@/state/now"
import {
  initializeAppearance,
  initializeAutoRemoveMergedWorktreePreference,
  initializeDesktopUpdateChannelPreference,
  initializeDiscordPresencePreference,
  initializeProjectFolderStartDirectory,
  initializeThreadEnvModePreference,
  initializeTranscriptPaintPreference,
  initializeTurnCuePreference,
} from "@/state/preferences"
import { initializeThreadPins } from "@/state/thread-pins"
import { initializeThreadSettlePreference } from "@/state/thread-settle"
import { initializeThreadVisits } from "@/state/thread-visits"

import { routeTree } from "./routeTree.gen"

import "./index.css"

syncDocumentDesktopChrome()
initializeAppearance()
initializeKeybindings()
initializeProjectFolderStartDirectory()
initializeDiscordPresencePreference()
initializeDesktopUpdateChannelPreference()
initializeThreadEnvModePreference()
initializeAutoRemoveMergedWorktreePreference()
initializeThreadSettlePreference()
initializeTurnCuePreference()
initializeTranscriptPaintPreference()
initializeThreadPins()
initializeThreadVisits()
initializeNowMinuteClock()

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
    <AppAtomRegistryProvider>
      <TooltipProvider>
        <ToastProvider>
          <AnchoredToastProvider>
            <RouterProvider router={router} />
          </AnchoredToastProvider>
        </ToastProvider>
      </TooltipProvider>
    </AppAtomRegistryProvider>
  </StrictMode>,
)
