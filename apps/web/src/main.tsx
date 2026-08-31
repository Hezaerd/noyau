import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { workspaceTabSanitizeKinds } from "@/components/workspace-panel/catalog"
import { syncDocumentDesktopChrome } from "@/lib/desktop-bridge"
import { AppAtomRegistryProvider } from "@/state/atom-registry"
import { initializeComposerDrafts } from "@/state/composer-drafts"
import { initializeNowMinuteClock } from "@/state/now"
import {
  initializeAppearance,
  initializeDiscordPresencePreference,
  initializeProjectFolderStartDirectory,
  initializeThreadEnvModePreference,
  initializeTurnCuePreference,
  initializeTurnNotificationPreference,
} from "@/state/preferences"
import { initializeThreadPins } from "@/state/thread-pins"
import { initializeThreadSettlePreference } from "@/state/thread-settle"
import { initializeThreadVisits } from "@/state/thread-visits"
import { initializeWorkspacePanel } from "@/state/workspace-panel"

import { routeTree } from "./routeTree.gen"

import "./index.css"

syncDocumentDesktopChrome()
initializeAppearance()
initializeProjectFolderStartDirectory()
initializeDiscordPresencePreference()
initializeThreadEnvModePreference()
initializeThreadSettlePreference()
initializeTurnCuePreference()
initializeTurnNotificationPreference()
initializeThreadPins()
initializeThreadVisits()
initializeComposerDrafts()
initializeWorkspacePanel(workspaceTabSanitizeKinds)
initializeNowMinuteClock()

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Missing #root element")
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
